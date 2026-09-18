"""Genera los PNG de la marca sin depender de nada externo.

La marca son dos medias lunas del mismo radio, asi que no hace falta un
rasterizador: cada pixel se resuelve preguntando si su centro cae dentro de
un circulo. El antialias sale de muestrear 4x4 dentro del pixel y promediar.

Coordenadas en el mismo espacio que el SVG (viewBox 0 0 64 64):
  arriba : circulo centro (28, 30) radio 24, recortado en y <= 30
  abajo  : circulo centro (36, 34) radio 24, recortado en y >= 34
"""

import struct
import zlib
from pathlib import Path

INK = (0x1B, 0x20, 0x19)
OCRE = (0xD9, 0x9A, 0x46)
TEAL = (0x3E, 0x9B, 0x84)

R = 24.0
TOP_CX, TOP_CY, TOP_CUT = 28.0, 30.0, 30.0
BOT_CX, BOT_CY, BOT_CUT = 36.0, 34.0, 34.0

MUESTRAS = 4  # 4x4 = 16 muestras por pixel


def color_en(x: float, y: float):
    """El color del punto (x, y) en el espacio del viewBox, o None si es fondo."""
    if y <= TOP_CUT and (x - TOP_CX) ** 2 + (y - TOP_CY) ** 2 <= R * R:
        return OCRE
    if y >= BOT_CUT and (x - BOT_CX) ** 2 + (y - BOT_CY) ** 2 <= R * R:
        return TEAL
    return None


def genera(lado: int, ocupacion: float) -> bytes:
    """Un PNG cuadrado de `lado` px con la marca ocupando `ocupacion` del lado.

    `ocupacion` es la fraccion del lado que cubre el viewBox de 64 unidades.
    Para los iconos maskable conviene <= 0.82: el recorte de Android deja a
    salvo el 80% central, y la marca solo usa 56 de las 64 unidades.
    """
    escala = (lado * ocupacion) / 64.0
    borde = (lado - 64.0 * escala) / 2.0
    paso = 1.0 / MUESTRAS
    filas = []

    for py in range(lado):
        fila = bytearray([0])  # byte de filtro: 0 = sin filtro
        for px in range(lado):
            r = g = b = 0
            for sy in range(MUESTRAS):
                uy = (py + (sy + 0.5) * paso - borde) / escala
                for sx in range(MUESTRAS):
                    ux = (px + (sx + 0.5) * paso - borde) / escala
                    c = color_en(ux, uy) or INK
                    r += c[0]
                    g += c[1]
                    b += c[2]
            n = MUESTRAS * MUESTRAS
            fila += bytes((r // n, g // n, b // n))
        filas.append(bytes(fila))

    crudo = b"".join(filas)

    def chunk(tipo: bytes, datos: bytes) -> bytes:
        return (
            struct.pack(">I", len(datos))
            + tipo
            + datos
            + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
        )

    # bit depth 8, color type 2 (RGB), sin interlace.
    ihdr = struct.pack(">IIBBBBB", lado, lado, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(crudo, 9))
        + chunk(b"IEND", b"")
    )


if __name__ == "__main__":
    destino = Path("public/icons")
    # 0.78 para los del manifest (entran en la zona segura del maskable).
    # 0.86 para iOS, que no recorta y deja ver la marca mas grande.
    for nombre, lado, ocupacion in [
        ("icon-512.png", 512, 0.78),
        ("icon-192.png", 192, 0.78),
        ("apple-touch-icon.png", 180, 0.86),
    ]:
        ruta = destino / nombre
        ruta.write_bytes(genera(lado, ocupacion))
        print(f"{ruta}  {ruta.stat().st_size:,} bytes")
