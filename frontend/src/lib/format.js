// Utilidades de formato para AJVJ Fitosanidad
export const fmtMoney = (v) => {
    const n = Number(v ?? 0);
    return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtNumber = (v, decimals = 2) => {
    const n = Number(v ?? 0);
    return n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
};

// Conversión de unidades para agroquímicos
// Devuelve null si no es convertible (familias distintas)
export function convertirUnidad(cantidad, desde, hacia) {
    if (!cantidad) return 0;
    if (desde === hacia) return cantidad;
    // Volumen: L <-> mL
    if (desde === "L" && hacia === "mL") return cantidad * 1000;
    if (desde === "mL" && hacia === "L") return cantidad / 1000;
    // Masa: kg <-> g
    if (desde === "kg" && hacia === "g") return cantidad * 1000;
    if (desde === "g" && hacia === "kg") return cantidad / 1000;
    return null;
}

// Capitaliza y normaliza nombre de cultivo (para agrupar igual pepino/Pepino/PEPINO)
export function normalizarCultivo(s) {
    if (!s) return "";
    const t = s.trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
}
