/**
 * La marca: una moneda partida en dos mitades que todavía no calzan.
 *
 * Arriba lo que registró una parte, abajo lo que aprobó la otra, y entre
 * las dos la costura. Es la app entera en dos formas: acá nada se convierte
 * solo, alguien del otro lado lo tiene que mirar.
 *
 * GEOMETRÍA (viewBox de 64, el mismo que usa `scripts/genera-iconos.py`):
 * dos semicírculos del MISMO radio 24, con los centros en x=28 y x=36. El
 * radio compartido no es un detalle: si una mitad fuera más grande, la
 * marca estaría diciendo que una de las dos partes pesa más.
 *
 * El aire entre y=30 e y=34 sobrevive al achique. A 16 px sigue siendo un
 * píxel de fondo, y es lo único que separa las dos mitades.
 */

/**
 * Dos juegos de color, no uno con opacidad.
 *
 * El teal de marca (#2f7f6c) contra el fondo oscuro del panel (#1b2019)
 * queda en 3.5:1 y se apaga: sobre oscuro va el mismo color con más luz.
 */
const TONOS = {
  claro: { arriba: "#b8792a", abajo: "#2f7f6c" },
  oscuro: { arriba: "#D99A46", abajo: "#3E9B84" },
} as const;

export default function Marca({
  tamano = 22,
  tono = "oscuro",
  className,
}: {
  tamano?: number;
  /** `oscuro` = sobre fondo oscuro. Es el caso de la barra lateral. */
  tono?: keyof typeof TONOS;
  className?: string;
}) {
  const { arriba, abajo } = TONOS[tono];

  return (
    <svg
      viewBox="0 0 64 64"
      width={tamano}
      height={tamano}
      className={className}
      // aria-hidden y no un role="img" con etiqueta: la marca siempre va
      // al lado del nombre, y un lector de pantalla que anuncia las dos
      // cosas lee el nombre dos veces.
      aria-hidden
    >
      <path d="M4 30 A24 24 0 0 1 52 30 Z" fill={arriba} />
      <path d="M12 34 A24 24 0 0 0 60 34 Z" fill={abajo} />
    </svg>
  );
}
