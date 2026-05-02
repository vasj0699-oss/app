import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatApiError } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Trash2, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Historial = () => {
    const { isAdmin, user } = useAuth();
    const hideMoney = user?.rol === "monitor" || user?.rol === "jefe";
    const [bitacoras, setBitacoras] = useState([]);
    const [modulos, setModulos] = useState([]);
    const [productos, setProductos] = useState([]);
    const [filters, setFilters] = useState({ modulo_id: "", ciclo_numero: "", producto_id: "", fecha_inicio: "", fecha_fin: "", cultivo: "" });
    const [open, setOpen] = useState({});

    const reload = async () => {
        try {
            const params = {};
            Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
            const [b, m, p] = await Promise.all([api.get("/bitacoras", { params }), api.get("/modulos"), api.get("/productos")]);
            setBitacoras(b.data); setModulos(m.data); setProductos(p.data);
        } catch (e) { toast.error(formatApiError(e)); }
    };

    useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

    const aplicar = () => reload();
    const limpiar = () => { setFilters({ modulo_id: "", ciclo_numero: "", producto_id: "", fecha_inicio: "", fecha_fin: "", cultivo: "" }); setTimeout(reload, 0); };

    const remove = async (id) => {
        if (!confirm("¿Eliminar bitácora? Se revertirán los movimientos de inventario.")) return;
        try { await api.delete(`/bitacoras/${id}`); toast.success("Bitácora eliminada"); reload(); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    const moduloMap = useMemo(() => Object.fromEntries(modulos.map((m) => [m.id, m])), [modulos]);
    const totalPeriodo = useMemo(() => bitacoras.reduce((s, b) => s + (b.costo_total_bitacora || 0), 0), [bitacoras]);

    return (
        <AppLayout title="Historial" subtitle="Consulta de bitácoras registradas">
            <div className="bg-white rounded-[10px] border border-neutral-200 p-4 mb-5 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div><label className="text-xs">Módulo</label>
                        <select value={filters.modulo_id} onChange={(e) => setFilters({ ...filters, modulo_id: e.target.value })} className="ip" data-testid="filter-modulo"><option value="">Todos</option>{modulos.map((m) => <option key={m.id} value={m.id}>Módulo {m.nombre}</option>)}</select>
                    </div>
                    <div><label className="text-xs">Ciclo</label>
                        <select value={filters.ciclo_numero} onChange={(e) => setFilters({ ...filters, ciclo_numero: e.target.value })} className="ip"><option value="">Todos</option><option value="1">Ciclo 1</option><option value="2">Ciclo 2</option></select>
                    </div>
                    <div><label className="text-xs">Cultivo</label>
                        <input value={filters.cultivo} onChange={(e) => setFilters({ ...filters, cultivo: e.target.value })} placeholder="Jitomate / Pepino…" className="ip" data-testid="filter-cultivo" />
                    </div>
                    <div><label className="text-xs">Producto</label>
                        <select value={filters.producto_id} onChange={(e) => setFilters({ ...filters, producto_id: e.target.value })} className="ip"><option value="">Todos</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
                    </div>
                    <div><label className="text-xs">Desde</label><input type="date" value={filters.fecha_inicio} onChange={(e) => setFilters({ ...filters, fecha_inicio: e.target.value })} className="ip" data-testid="filter-desde" /></div>
                    <div><label className="text-xs">Hasta</label><input type="date" value={filters.fecha_fin} onChange={(e) => setFilters({ ...filters, fecha_fin: e.target.value })} className="ip" data-testid="filter-hasta" /></div>
                </div>
                <div className="flex gap-2 mt-3">
                    <button onClick={aplicar} data-testid="filter-apply-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] text-sm">Aplicar</button>
                    <button onClick={limpiar} className="px-4 py-2 border border-neutral-200 rounded-[10px] text-sm">Limpiar</button>
                </div>
            </div>

            {/* Resumen del periodo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <div className="bg-white rounded-[10px] border border-neutral-200 p-4 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]">
                    <div className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Bitácoras en el periodo</div>
                    <div className="text-2xl font-heading font-semibold text-[#1C1C1A] mt-2" data-testid="historial-count">{bitacoras.length}</div>
                </div>
                <div className="bg-white rounded-[10px] border border-neutral-200 p-4 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]">
                    <div className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Aplicaciones</div>
                    <div className="text-2xl font-heading font-semibold text-[#1C1C1A] mt-2">{bitacoras.reduce((s, b) => s + (b.aplicaciones?.length || 0), 0)}</div>
                </div>
                {!hideMoney && (
                    <div className="bg-[#4B5828] text-white rounded-[10px] p-4 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.12)] flex items-center justify-between">
                        <div>
                            <div className="text-xs uppercase tracking-wider opacity-80 font-medium">Total gastado en el periodo</div>
                            <div className="text-2xl font-heading font-semibold mt-2" data-testid="historial-total">{fmtMoney(totalPeriodo)}</div>
                        </div>
                        <Wallet className="w-8 h-8 opacity-60" />
                    </div>
                )}
            </div>

            <div className="space-y-2">
                {bitacoras.length === 0 && <div className="text-sm text-neutral-500 text-center py-8 bg-white rounded-[10px] border border-neutral-200">Sin bitácoras.</div>}
                {bitacoras.map((b) => {
                    const m = moduloMap[b.modulo_id];
                    const ciclo = m?.ciclos?.find((c) => c.numero === b.ciclo_numero);
                    return (
                        <div key={b.id} className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]">
                            <button onClick={() => setOpen((o) => ({ ...o, [b.id]: !o[b.id] }))} data-testid={`bitacora-toggle-${b.id}`} className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#C8D4A0]/15 rounded-[10px]">
                                <div className="flex items-center gap-4 text-left">
                                    {open[b.id] ? <ChevronUp className="w-4 h-4 text-[#4B5828]" /> : <ChevronDown className="w-4 h-4 text-[#4B5828]" />}
                                    <div>
                                        <div className="font-medium text-[#1C1C1A]">{b.fecha} · Módulo {m?.nombre || "?"} · Ciclo {b.ciclo_numero} {ciclo?.cultivo && `(${ciclo.cultivo})`}</div>
                                        <div className="text-xs text-neutral-500">{b.aplicaciones?.length} aplicaciones · {b.tipo} · {b.asesor}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {!hideMoney && <span className="font-bold text-[#4B5828]">{fmtMoney(b.costo_total_bitacora)}</span>}
                                    {isAdmin && <button onClick={(e) => { e.stopPropagation(); remove(b.id); }} className="text-red-600 p-1 hover:bg-red-50 rounded" data-testid={`del-bitacora-${b.id}`}><Trash2 className="w-4 h-4" /></button>}
                                </div>
                            </button>
                            {open[b.id] && (
                                <div className="px-5 pb-5 space-y-3">
                                    {b.aplicaciones?.map((ap, i) => (
                                        <div key={i} className="border border-neutral-100 rounded-[10px]">
                                            <div className="px-4 py-2 bg-[#F5F5F0] flex items-center justify-between">
                                                <div className="text-sm"><b className="text-[#4B5828] capitalize">{ap.tipo}</b> · {ap.objetivo || "Sin objetivo"}</div>
                                                {!hideMoney && <div className="text-sm font-semibold text-[#4B5828]">{fmtMoney(ap.costo_total_aplicacion)}</div>}
                                            </div>
                                            <table className="w-full text-xs">
                                                <thead className="bg-white text-neutral-500">
                                                    <tr><th className="text-left px-3 py-1.5">Producto</th><th className="text-right px-3 py-1.5">Dosis</th><th className="text-left px-3 py-1.5">Unidad</th><th className="text-right px-3 py-1.5">Cantidad</th>{!hideMoney && <th className="text-right px-3 py-1.5">Costo</th>}</tr>
                                                </thead>
                                                <tbody>
                                                    {ap.productos.map((p, j) => (
                                                        <tr key={j} className="border-t border-neutral-100">
                                                            <td className="px-3 py-1.5 font-medium">{p.nombre}</td>
                                                            <td className="px-3 py-1.5 text-right">{p.dosis}</td>
                                                            <td className="px-3 py-1.5">{p.unidad}</td>
                                                            <td className="px-3 py-1.5 text-right">{p.cantidad_usada_total?.toFixed(3)}</td>
                                                            {!hideMoney && <td className="px-3 py-1.5 text-right font-semibold text-[#4B5828]">{fmtMoney(p.costo_linea)}</td>}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <style>{`.ip { width:100%; padding:.4rem .6rem; border:1px solid #e5e7eb; border-radius:10px; font-size:.8rem; background:white; margin-top:2px; } .ip:focus { outline:none; border-color:#8FAD3C; }`}</style>
        </AppLayout>
    );
};

export default Historial;
