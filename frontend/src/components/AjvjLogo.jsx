import React from "react";

/**
 * AJVJ Hidropónicos logo — SVG vectorial limpio sin fondo.
 * Se adapta a cualquier color via prop `color` o `currentColor`.
 * Uso:
 *   <AjvjLogo size={48} color="#4B5828" />
 *   <AjvjMark size={40} color="#C8D4A0" />  // solo el ícono
 */

export const AjvjMark = ({ size = 48, color = "currentColor", className = "" }) => (
    <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="AJVJ mark"
    >
        {/* Invernadero: doble línea */}
        <path
            d="M6 26 L32 6 L58 26 L58 54 Q58 58 54 58 L10 58 Q6 58 6 54 Z"
            stroke={color}
            strokeWidth="2.2"
            strokeLinejoin="round"
        />
        <path
            d="M11 28 L32 12 L53 28 L53 52 Q53 53.5 51.5 53.5 L12.5 53.5 Q11 53.5 11 52 Z"
            stroke={color}
            strokeWidth="1.3"
            strokeLinejoin="round"
            opacity="0.8"
        />
        {/* Tallo */}
        <path d="M32 48 L32 36" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        {/* Hoja izquierda */}
        <path
            d="M32 36 C 22 34, 19 26, 22 20 C 30 22, 33 29, 32 36 Z"
            fill={color}
            stroke={color}
            strokeWidth="1.2"
            strokeLinejoin="round"
        />
        {/* Hoja derecha */}
        <path
            d="M32 36 C 42 34, 45 26, 42 20 C 34 22, 31 29, 32 36 Z"
            fill={color}
            stroke={color}
            strokeWidth="1.2"
            strokeLinejoin="round"
        />
    </svg>
);

const AjvjLogo = ({
    size = 44,
    primary = "#4B5828",
    accent = "#8FAD3C",
    showTagline = true,
    stacked = true,
    className = "",
}) => {
    return (
        <div className={`flex items-center gap-3 ${className}`}>
            <AjvjMark size={size} color={primary} />
            <div className={stacked ? "leading-tight" : "flex items-baseline gap-1"}>
                <div
                    className="font-heading font-extrabold tracking-[0.02em]"
                    style={{ color: primary, fontSize: size * 0.52, lineHeight: 1 }}
                >
                    AJVJ
                </div>
                <div
                    className="font-heading font-semibold uppercase tracking-[0.18em]"
                    style={{ color: accent, fontSize: size * 0.22, marginTop: stacked ? 2 : 0 }}
                >
                    Hidropónicos
                </div>
                {showTagline && stacked && (
                    <div
                        className="uppercase tracking-[0.18em] font-medium opacity-70"
                        style={{ color: primary, fontSize: size * 0.16, marginTop: 3 }}
                    >
                        SPR DE RI DE CV
                    </div>
                )}
            </div>
        </div>
    );
};

export default AjvjLogo;
