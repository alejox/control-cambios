/**
 * Personajes para identificar cada lado de un vistazo. Van por persona y no
 * por moneda: quien recibe en COP es venezolano (lleva el de Venezuela) y
 * quien recibe en Bs lleva el de Colombia. Son SVG planos a proposito:
 * sin dependencias, nitidos a cualquier tamaño y livianos para el panel.
 * `lider` le pone una corona a quien queda a favor del neto.
 */
type Props = {
  pais: "ve" | "co";
  lider?: boolean;
  className?: string;
};

const PIEL = "#E8B98F";
const PIEL_SOMBRA = "#D9A277";
const TINTA = "#2A2A26";

export function Personaje({ pais, lider = false, className }: Props) {
  const titulo = pais === "ve" ? "Venezuela" : "Colombia";

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={lider ? `${titulo}, a favor` : titulo}
      className={className}
    >
      <title>{lider ? `${titulo} · a favor` : titulo}</title>

      {/* Torso con los colores de la bandera */}
      {pais === "ve" ? (
        <g>
          <path d="M12 64c0-11 9-18 20-18s20 7 20 18z" fill="#CF142B" />
          <path d="M12 64c0-11 9-18 20-18s20 7 20 18z" fill="#00247D" clipPath="url(#ve-mid)" />
          <path d="M12 64c0-11 9-18 20-18s20 7 20 18z" fill="#FFCC00" clipPath="url(#ve-top)" />
          <defs>
            <clipPath id="ve-top">
              <rect x="0" y="44" width="64" height="7" />
            </clipPath>
            <clipPath id="ve-mid">
              <rect x="0" y="44" width="64" height="13" />
            </clipPath>
          </defs>
        </g>
      ) : (
        <g>
          <path d="M12 64c0-11 9-18 20-18s20 7 20 18z" fill="#CE1126" />
          <path d="M12 64c0-11 9-18 20-18s20 7 20 18z" fill="#003893" clipPath="url(#co-mid)" />
          <path d="M12 64c0-11 9-18 20-18s20 7 20 18z" fill="#FCD116" clipPath="url(#co-top)" />
          <defs>
            <clipPath id="co-top">
              <rect x="0" y="44" width="64" height="10" />
            </clipPath>
            <clipPath id="co-mid">
              <rect x="0" y="44" width="64" height="15" />
            </clipPath>
          </defs>
        </g>
      )}

      {/* Cuello y cara */}
      <rect x="28" y="40" width="8" height="7" rx="2" fill={PIEL_SOMBRA} />
      <circle cx="32" cy="31" r="12" fill={PIEL} />
      <circle cx="27.5" cy="31" r="1.4" fill={TINTA} />
      <circle cx="36.5" cy="31" r="1.4" fill={TINTA} />
      <path
        d="M28 36c2.2 2 5.8 2 8 0"
        fill="none"
        stroke={TINTA}
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {pais === "ve" ? (
        /* Gorra tricolor con el arco de estrellas */
        <g>
          <path d="M19.5 27c0-8 5.6-12.5 12.5-12.5S44.5 19 44.5 27z" fill="#00247D" />
          <path d="M19.5 27c0-8 5.6-12.5 12.5-12.5S44.5 19 44.5 27z" fill="#FFCC00" clipPath="url(#ve-cap)" />
          <defs>
            <clipPath id="ve-cap">
              <rect x="0" y="0" width="64" height="19" />
            </clipPath>
          </defs>
          <rect x="17" y="25.5" width="30" height="3" rx="1.5" fill="#CF142B" />
          <path d="M44 27h9a2 2 0 0 1 0 3h-9z" fill="#CF142B" />
          {[24, 28, 32, 36, 40].map((x, i) => (
            <circle key={x} cx={x} cy={i === 0 || i === 4 ? 23 : 21.6} r="0.9" fill="#fff" />
          ))}
        </g>
      ) : (
        /* Sombrero vueltiao: ala ancha y franjas negras */
        <g>
          <ellipse cx="32" cy="24.5" rx="19" ry="4" fill="#F1E6C8" stroke={TINTA} strokeWidth="1" />
          <path d="M23 24c0-7 4-10.5 9-10.5s9 3.5 9 10.5z" fill="#F1E6C8" stroke={TINTA} strokeWidth="1" />
          <path d="M23.6 20h16.8" stroke={TINTA} strokeWidth="1.6" />
          <path d="M25 16.5h14" stroke={TINTA} strokeWidth="1.2" />
          <path d="M16 24.5h32" stroke={TINTA} strokeWidth="1" strokeDasharray="2 2" />
        </g>
      )}

      {lider && (
        /* Corona para el que va adelante */
        <path
          d="M24 3l3 4 5-6 5 6 3-4-1.5 8h-13z"
          fill="#E0A63B"
          stroke="#8f5e1f"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
