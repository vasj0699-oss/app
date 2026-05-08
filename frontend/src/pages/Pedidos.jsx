import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, API_BASE, formatApiError } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { FileDown, Calculator } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Pedidos = () => {
    const { user } = useAuth();
    const hideMoney = user?.rol === "monitor" || user?.rol === "jefe";
    const [modulos, setModulos] = useState([]);
    const [moduloIds, setModuloIds] = useState([]);
    const [fechaInicio, setFechaInicio] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 28); return d.toISOString().slice(0, 10); });
    const [fechaFin, setFechaFin] = useState(new Date().toISOString().slice(0, 10));
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => { (async () => { try { const r = await api.get("/modulos"); setModulos(r.data); } catch (e) { toast.error(formatApiError(e)); } })(); }, []);

    const calcular = async () => {
        setLoading(true);
        try {
            const r = await api.post("/pedidos/calcular", { fecha_inicio: fechaInicio, fecha_fin: fechaFin, modulo_ids: moduloIds });
            setItems(r.data.items); setTotal(r.data.total_general);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };

    const descargarPDF = async () => {
        setDownloading(true);
        try {
            const token = localStorage.getItem("ajvj_token");
            const res = await fetch(`${API_BASE}/pedidos/pdf`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ fecha_inicio: fechaInicio, fecha_fin: fechaFin, modulo_ids: moduloIds }),
            });
            if (!res.ok) throw new Error("Error generando PDF");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `pedido_AJVJ_${fechaInicio}_${fechaFin}.pdf`; a.click();
            URL.revokeObjectURL(url);
            toast.success("PDF descargado");
        } catch (e) { toast.error(e.message); }
        finally { setDownloading(false); }
    };

    const toggleModulo = (id) => setModuloIds(moduloIds.includes(id) ? moduloIds.filter((m) => m !== id) : [...moduloIds, id]);

    const itemsAPedir = useMemo(() => items.filter((i) => i.cantidad_a_pedir > 0), [items]);

    return (
        <AppLayout
            title="Pedidos"
            subtitle="Cálculo de requerimientos vs stock disponible"
            actions={
                <div className="flex gap-2">
                    <button onClick={calcular} disabled={loading} data-testid="calcular-btn" className="px-4 py-2 border border-[#8FAD3C] text-[#4B5828] rounded-[10px] hover:bg-[#C8D4A0]/20 flex items-center gap-1.5 text-sm disabled:opacity-60">
                        <Calculator className="w-4 h-4" />{loading ? "Calculando…" : "Calcular"}
                    </button>
                    <button onClick={descargarPDF} disabled={downloading || itemsAPedir.length === 0} data-testid="pdf-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] flex items-center gap-1.5 text-sm disabled:opacity-60">
                        <FileDown className="w-4 h-4" />{downloading ? "Generando…" : "Generar PDF"}
                    </button>
                </div>
            }
        >
            <div className="bg-white rounded-[10px] border border-neutral-200 p-5 mb-5 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><label className="text-xs font-medium">Fecha inicio</label><input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} data-testid="pedido-fecha-inicio" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[#8FAD3C]" /></div>
                    <div><label className="text-xs font-medium">Fecha fin</label><input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} data-testid="pedido-fecha-fin" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[#8FAD3C]" /></div>
                    <div className="md:col-span-1">
                        <label className="text-xs font-medium">Módulos (vacío = todos)</label>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                            {modulos.map((m) => (
                                <button key={m.id} onClick={() => toggleModulo(m.id)} data-testid={`mod-toggle-${m.nombre}`} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${moduloIds.includes(m.id) ? "bg-[#4B5828] text-white border-[#4B5828]" : "border-neutral-200 text-neutral-600 hover:border-[#8FAD3C]"}`}>
                                    Módulo {m.nombre}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)] overflow-auto">
                <div className="px-4 py-3 border-b border-neutral-100 text-xs text-neutral-600 flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 bg-[#4B5828] text-white rounded-full text-[10px] font-bold flex-shrink-0">i</span>
                    <div>
                        <b>"Necesito"</b> = suma de productos requeridos por las bitácoras del rango que están en estado <b>Plan</b> (aún no aplicadas).
                        Las bitácoras ya aplicadas no cuentan aquí porque su consumo ya está reflejado en <b>"Tengo"</b>.
                        <b> "Compras en rango"</b> es informativo (cuánto entró durante el periodo).
                    </div>
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-[#4B5828] text-[#C8D4A0] text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Producto</th>
                            <th className="px-4 py-3 text-left font-medium">Categoría</th>
                            <th className="px-4 py-3 text-right font-medium">Necesito</th>
                            <th className="px-4 py-3 text-right font-medium">Tengo</th>
                            <th className="px-4 py-3 text-right font-medium">Compras en rango</th>
                            <th className="px-4 py-3 text-right font-medium">A pedir</th>
                            <th className="px-4 py-3 text-left font-medium">Unidad</th>
                            {!hideMoney && <th className="px-4 py-3 text-right font-medium">P. Unit.</th>}
                            {!hideMoney && <th className="px-4 py-3 text-right font-medium">Total est.</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && <tr><td colSpan={hideMoney ? 7 : 9} className="px-4 py-6 text-center text-neutral-500">Sin datos. Pulsa <b>Calcular</b>.</td></tr>}
                        {items.map((r) => (
                            <tr key={r.producto_id} className={`border-b border-neutral-100 hover:bg-[#C8D4A0]/15 even:bg-[#F5F5F0]/40 ${r.cantidad_a_pedir > 0 ? "bg-amber-50/40" : ""}`}>
                                <td className="px-4 py-2.5 font-medium">{r.nombre}</td>
                                <td className="px-4 py-2.5 text-neutral-600">{r.categoria || "—"}</td>
                                <td className="px-4 py-2.5 text-right">{r.necesito.toFixed(2)}</td>
                                <td className={`px-4 py-2.5 text-right ${r.tengo < 0 ? "text-red-600" : ""}`}>{r.tengo.toFixed(2)}</td>
                                <td className="px-4 py-2.5 text-right text-neutral-500">{(r.compras_en_rango ?? 0).toFixed(2)}</td>
                                <td className={`px-4 py-2.5 text-right font-semibold ${r.cantidad_a_pedir > 0 ? "text-amber-700" : "text-green-700"}`}>{r.cantidad_a_pedir > 0 ? r.cantidad_a_pedir.toFixed(2) : "0.00"}</td>
                                <td className="px-4 py-2.5">{r.unidad}</td>
                                {!hideMoney && <td className="px-4 py-2.5 text-right">{fmtMoney(r.precio_unitario)}</td>}
                                {!hideMoney && <td className="px-4 py-2.5 text-right font-semibold text-[#4B5828]">{fmtMoney(r.total_estimado)}</td>}
                            </tr>
                        ))}
                    </tbody>
                    {items.length > 0 && !hideMoney && (
                        <tfoot>
                            <tr className="bg-[#4B5828] text-white font-bold">
                                <td colSpan={8} className="px-4 py-3 text-right">TOTAL ESTIMADO</td>
                                <td className="px-4 py-3 text-right" data-testid="pedido-total">{fmtMoney(total)}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </AppLayout>
    );
};

export default Pedidos;
