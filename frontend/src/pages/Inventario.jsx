import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Edit3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Inventario = () => {
    const { isAdmin } = useAuth();
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState({});
    const [movs, setMovs] = useState({});
    const [adjustOpen, setAdjustOpen] = useState(null);
    const [newQty, setNewQty] = useState(0);
    const [justif, setJustif] = useState("");
    const [loading, setLoading] = useState(true);

    const reload = async () => {
        try {
            const r = await api.get("/inventario");
            setItems(r.data);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { reload(); }, []);

    const toggle = async (pid) => {
        const next = { ...open, [pid]: !open[pid] };
        setOpen(next);
        if (next[pid] && !movs[pid]) {
            try {
                const r = await api.get(`/inventario/${pid}/movimientos`);
                setMovs((m) => ({ ...m, [pid]: r.data }));
            } catch (e) { toast.error(formatApiError(e)); }
        }
    };

    const submitAjuste = async () => {
        try {
            await api.post("/inventario/ajuste", { producto_id: adjustOpen.producto_id, nueva_cantidad: parseFloat(newQty), justificacion: justif });
            toast.success("Ajuste aplicado");
            setAdjustOpen(null); setJustif(""); setNewQty(0);
            reload();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <AppLayout title="Inventario" subtitle="Stock actual y kardex de movimientos">
            <div className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)] overflow-auto">
                <table className="w-full text-sm">
                    <thead className="bg-[#4B5828] text-[#C8D4A0] text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium w-10"></th>
                            <th className="px-4 py-3 text-left font-medium">Producto</th>
                            <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                            <th className="px-4 py-3 text-left font-medium">Unidad</th>
                            <th className="px-4 py-3 text-left font-medium">Estado</th>
                            <th className="px-4 py-3 text-left font-medium">Última actualización</th>
                            {isAdmin && <th className="px-4 py-3 text-right font-medium">Ajuste</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-500">Cargando…</td></tr>}
                        {!loading && items.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-500">Sin productos en inventario.</td></tr>}
                        {items.map((it) => {
                            const negative = (it.cantidad ?? 0) < 0;
                            const low = !negative && (it.cantidad ?? 0) < 5;
                            return (
                                <React.Fragment key={it.producto_id}>
                                    <tr className="border-b border-neutral-100 hover:bg-[#C8D4A0]/15 even:bg-[#F5F5F0]/40">
                                        <td className="px-4 py-2.5">
                                            <button onClick={() => toggle(it.producto_id)} className="p-1 hover:bg-[#C8D4A0]/40 rounded" data-testid={`toggle-${it.producto_id}`}>
                                                {open[it.producto_id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </button>
                                        </td>
                                        <td className="px-4 py-2.5 font-medium">{it.nombre}</td>
                                        <td className={`px-4 py-2.5 text-right font-semibold ${negative ? "text-red-600" : ""}`}>{(it.cantidad ?? 0).toFixed(3)}</td>
                                        <td className="px-4 py-2.5 text-neutral-600">{it.unidad}</td>
                                        <td className="px-4 py-2.5">
                                            {negative ? <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Stock negativo — requiere compra</span> :
                                                low ? <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Stock bajo</span> :
                                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-neutral-600 text-xs">{it.ultima_actualizacion?.slice(0, 16).replace("T", " ")}</td>
                                        {isAdmin && (
                                            <td className="px-4 py-2.5 text-right">
                                                <button onClick={() => { setAdjustOpen(it); setNewQty(it.cantidad); }} data-testid={`adjust-${it.producto_id}`} className="text-[#4B5828] hover:bg-[#C8D4A0]/40 p-1.5 rounded inline-flex items-center gap-1 text-xs">
                                                    <Edit3 className="w-3.5 h-3.5" />Ajustar
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                    {open[it.producto_id] && (
                                        <tr className="bg-[#F5F5F0]/70">
                                            <td colSpan={7} className="px-4 py-3">
                                                <div className="text-xs font-semibold text-[#4B5828] mb-2 uppercase tracking-wider">Kardex de movimientos</div>
                                                <table className="w-full text-xs bg-white rounded-[10px] overflow-hidden">
                                                    <thead className="bg-[#C8D4A0]/40 text-[#4B5828]">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left">Fecha</th>
                                                            <th className="px-3 py-2 text-left">Tipo</th>
                                                            <th className="px-3 py-2 text-right">Cantidad</th>
                                                            <th className="px-3 py-2 text-left">Referencia</th>
                                                            <th className="px-3 py-2 text-left">Usuario</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {!movs[it.producto_id] && <tr><td colSpan={5} className="px-3 py-2 text-center">Cargando…</td></tr>}
                                                        {movs[it.producto_id]?.length === 0 && <tr><td colSpan={5} className="px-3 py-2 text-center">Sin movimientos</td></tr>}
                                                        {movs[it.producto_id]?.map((m) => (
                                                            <tr key={m.id} className="border-b last:border-0">
                                                                <td className="px-3 py-1.5">{m.fecha?.slice(0, 10)}</td>
                                                                <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${m.tipo === "entrada" ? "bg-green-100 text-green-700" : m.tipo === "salida" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{m.tipo}</span></td>
                                                                <td className={`px-3 py-1.5 text-right font-semibold ${m.tipo === "salida" ? "text-red-600" : "text-green-700"}`}>{m.tipo === "salida" ? "-" : "+"}{m.cantidad.toFixed(2)} {m.unidad}</td>
                                                                <td className="px-3 py-1.5 text-neutral-600">{m.referencia}</td>
                                                                <td className="px-3 py-1.5 text-neutral-600">{m.usuario}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {adjustOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAdjustOpen(null)}>
                    <div className="bg-white rounded-[10px] p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-heading font-semibold text-lg mb-4">Ajuste manual: {adjustOpen.nombre}</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-neutral-600">Nueva cantidad ({adjustOpen.unidad})</label>
                                <input type="number" step="any" value={newQty} onChange={(e) => setNewQty(e.target.value)} data-testid="adjust-qty-input" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[#8FAD3C]" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-neutral-600">Justificación</label>
                                <input value={justif} onChange={(e) => setJustif(e.target.value)} data-testid="adjust-just-input" className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[#8FAD3C]" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setAdjustOpen(null)} className="px-4 py-2 text-sm border border-neutral-200 rounded-[10px]">Cancelar</button>
                            <button onClick={submitAjuste} data-testid="adjust-submit-btn" className="px-4 py-2 text-sm bg-[#4B5828] text-white rounded-[10px]">Aplicar ajuste</button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
};

export default Inventario;
