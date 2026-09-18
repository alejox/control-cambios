"""Genera todos los iconos de la marca sin depender de nada externo.

La marca son dos medias lunas del mismo radio, asi que no hace falta un
rasterizador: cada pixel se resuelve preguntando si su centro cae dentro de
un circulo. El antialias sale de muestrear 4x4 dentro del pixel y promediar.
Esto existe porque la maquina no tiene rsvg-convert, ImageMagick, Inkscape
ni cairosvg, y sips no convierte vectores.

Correr desde la raiz del repo:  python3 scripts/genera-iconos.py

Coordenadas de la marca en el mismo espacio que el SVG (viewBox 0 0 64 64):
  arriba : circulo centro (28, 30) radio 24, recortado en y <= 30
  abajo  : circulo centro (36, 34) radio 24, recortado en y >= 34
"""

from __future__ import annotations  # para `X | None` en Python 3.9

import struct
import zlib
from pathlib import Path

Color = "tuple[int, int, int]"

INK = (0x1B, 0x20, 0x19)

# Dos paletas, las mismas que src/app/marca.tsx. El teal de marca contra el
# fondo oscuro del panel queda en 3.5:1 y se apaga, asi que sobre oscuro va
# el mismo color con mas luz.
PALETA_SOBRE_OSCURO = ((0xD9, 0x9A, 0x46), (0x3E, 0x9B, 0x84))
PALETA_DE_MARCA = ((0xB8, 0x79, 0x2A), (0x2F, 0x7F, 0x6C))

R = 24.0
TOP_CX, TOP_CY, TOP_CUT = 28.0, 30.0, 30.0
BOT_CX, BOT_CY, BOT_CUT = 36.0, 34.0, 34.0

MUESTRAS = 4  # 4x4 = 16 muestras por pixel


def color_en(x: float, y: float, paleta):
    """El color del punto (x, y) en el espacio del viewBox, o None si es fondo."""
    if y <= TOP_CUT and (x - TOP_CX) ** 2 + (y - TOP_CY) ** 2 <= R * R:
        return paleta[0]
    if y >= BOT_CUT and (x - BOT_CX) ** 2 + (y - BOT_CY) ** 2 <= R * R:
        return paleta[1]
    return None


def dentro_del_marco(px: float, py: float, lado: float, radio: float) -> bool:
    """Si el punto cae dentro del cuadrado de esquinas redondeadas."""
    if radio <= 0:
        return True
    cx = min(max(px, radio), lado - radio)
    cy = min(max(py, radio), lado - radio)
    return (px - cx) ** 2 + (py - cy) ** 2 <= radio * radio


def _chunk(tipo: bytes, datos: bytes) -> bytes:
    return (
        struct.pack(">I", len(datos))
        + tipo
        + datos
        + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
    )


def genera_png(
    lado: int,
    ocupacion: float,
    esquina: float = 0.0,
    fondo=INK,
    paleta=PALETA_SOBRE_OSCURO,
) -> bytes:
    """Un PNG cuadrado de `lado` px con la marca centrada.

    `ocupacion` es la fraccion del lado que cubre el viewBox de 64 unidades.
    Para los iconos maskable conviene <= 0.82: el recorte de Android deja a
    salvo el 80% central, y la marca solo usa 56 de las 64 unidades.

    `esquina` es el radio de las esquinas, como fraccion del lado.

    `fondo` en None deja la marca recortada sobre transparencia. Solo tiene
    sentido para el favicon: iOS pinta de NEGRO lo transparente de un
    apple-icon, y un maskable transparente le deja el hueco a Android.

    Escribe RGBA en cuanto haga falta alfa —- esquinas redondeadas o fondo
    transparente —- y RGB cuando el cuadrado va entero y opaco.
    """
    escala = (lado * ocupacion) / 64.0
    borde = (lado - 64.0 * escala) / 2.0
    radio = lado * esquina
    con_alfa = radio > 0 or fondo is None
    paso = 1.0 / MUESTRAS
    n = MUESTRAS * MUESTRAS
    filas = []

    for py in range(lado):
        fila = bytearray([0])  # byte de filtro: 0 = sin filtro
        for px in range(lado):
            r = g = b = opacas = 0
            for sy in range(MUESTRAS):
                my = py + (sy + 0.5) * paso
                uy = (my - borde) / escala
                for sx in range(MUESTRAS):
                    mx = px + (sx + 0.5) * paso
                    if not dentro_del_marco(mx, my, lado, radio):
                        continue
                    c = color_en((mx - borde) / escala, uy, paleta) or fondo
                    if c is None:
                        continue  # fuera de la marca y sin fondo: transparente
                    r += c[0]
                    g += c[1]
                    b += c[2]
                    opacas += 1
            if opacas:
                fila += bytes((r // opacas, g // opacas, b // opacas))
            else:
                fila += b"\x00\x00\x00"
            if con_alfa:
                fila.append(opacas * 255 // n)
        filas.append(bytes(fila))

    # bit depth 8; color type 6 = RGBA, 2 = RGB. Sin interlace.
    ihdr = struct.pack(">IIBBBBB", lado, lado, 8, 6 if con_alfa else 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(b"".join(filas), 9))
        + _chunk(b"IEND", b"")
    )


def genera_ico(lados, ocupacion: float, **opciones) -> bytes:
    """Un .ico con varias medidas, cada una como PNG embebido.

    PNG dentro de ICO lo entienden todos los navegadores desde hace anios;
    el BMP solo hace falta para herramientas de Windows muy viejas.
    """
    imagenes = [genera_png(lado, ocupacion, **opciones) for lado in lados]
    cabecera = struct.pack("<HHH", 0, 1, len(imagenes))
    desplazamiento = 6 + 16 * len(imagenes)
    entradas = b""

    for lado, datos in zip(lados, imagenes):
        # 0 en el ancho/alto significa 256: el campo es de un solo byte.
        medida = 0 if lado >= 256 else lado
        entradas += struct.pack(
            "<BBBBHHII", medida, medida, 0, 0, 1, 32, len(datos), desplazamiento
        )
        desplazamiento += len(datos)

    return cabecera + entradas + b"".join(imagenes)


if __name__ == "__main__":
    salidas = [
        # Del manifest. A sangre y al 78%: entran en la zona segura del 80%
        # que recorta Android para darles la forma del sistema. Con fondo
        # ink, porque un maskable transparente le deja el hueco al sistema.
        ("public/icons/icon-512.png", genera_png(512, 0.78)),
        ("public/icons/icon-192.png", genera_png(192, 0.78)),
        # iOS no recorta ni lee el manifest, asi que la marca va mas grande.
        # Con fondo tambien, y no por gusto: iOS pinta de NEGRO lo
        # transparente de un apple-icon.
        ("src/app/apple-icon.png", genera_png(180, 0.86)),
        # El de la pestania, SIN fondo: la marca se recorta sola contra la
        # barra del navegador, sea clara u oscura. Sin fondo tampoco hay
        # esquina que redondear, y la marca ocupa el lado entero.
        #
        # Va con la paleta de marca y no con la de fondo oscuro: un .ico es
        # mapa de bits y no se entera del tema del sistema, y el ocre oscuro
        # aguanta mejor sobre pestania clara (3.4:1) que el claro sobre
        # pestania oscura (2.0:1). El que sí se adapta es icon.svg, con
        # prefers-color-scheme, y es el que eligen los navegadores de hoy.
        (
            "src/app/favicon.ico",
            genera_ico([16, 32, 48], 1.0, fondo=None, paleta=PALETA_DE_MARCA),
        ),
    ]

    for nombre, datos in salidas:
        ruta = Path(nombre)
        ruta.write_bytes(datos)
        print(f"{ruta}  {len(datos):,} bytes")
