import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatApiError } from "@/lib/api";
import { fmtMoney, convertirUnidad } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Save, Trash2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Compras = () => {
    const { isAdmin, user } = useAuth();
    const hideMoney = user?.rol === "monitor" || user?.rol === "jefe";
    const [productos, setProductos] = useState([]);
    const [compras, setCompras] = useState([]);
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState({});
    const [form, setForm] = useState(defaultForm());
    const [filter, setFilter] = useState("");

    function defaultForm() {
        return {
            fecha: new Date().toISOString().slice(0, 10),
            proveedor: "",
            notas: "",
            items: [{ producto_id: "", nombre_producto: "", cantidad: 0, unidad: "L", precio_unitario: 0 }],
        };
    }

    const reload = async () => {
        try {
            const [p, c] = await Promise.all([api.get("/productos"), api.get("/compras")]);
            setProductos(p.data); setCompras(c.data);
        } catch (e) { toast.error(formatApiError(e)); }
    };
    useEffect(() => { reload(); }, []);

    const setItem = (idx, patch) => {
        const items = [...form.items];
        items[idx] = { ...items[idx], ...patch };
        // Si cambia producto, precargar unidad y precio sugerido
        if ("producto_id" in patch) {
            const prod = productos.find((p) => p.id === patch.producto_id);
            if (prod) {
                items[idx].nombre_producto = prod.nombre;
                items[idx].unidad = prod.unidad_habitual;
                items[idx].precio_unitario = prod.precio_unitario || 0;
            }
        }
        setForm({ ...form, items });
    };

    const addItem = () => setForm({ ...form, items: [...form.items, { producto_id: "", nombre_producto: "", cantidad: 0, unidad: "L", precio_unitario: 0 }] });
    const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

    // Cálculo en vivo de cantidad convertida a unidad habitual
    const getConversion = (item) => {
        const prod = productos.find((p) => p.id === item.producto_id);
        if (!prod) return null;
        const unidadBase = prod.unidad_habitual;
        const conv = convertirUnidad(parseFloat(item.cantidad) || 0, item.unidad, unidadBase);
        if (conv == null) return { unidadBase, cantidadConv: item.cantidad, ok: false };
        return { unidadBase, cantidadConv: conv, ok: true };
    };

    const totalEstimado = useMemo(() => {
        let t = 0;
        for (const it of form.items) {
            const conv = getConversion(it);
            if (!conv) continue;
            t += (conv.cantidadConv || 0) * (parseFloat(it.precio_unitario) || 0);
        }
        return t;
        // eslint-disable-next-line
    }, [form.items, productos]);

    const submit = async () => {
        const valid = form.items.filter((it) => it.producto_id && it.cantidad);
        if (valid.length === 0) return toast.error("Agrega al menos un ítem con producto y cantidad");
        try {
            await api.post("/compras", {
                fecha: form.fecha,
                proveedor: form.proveedor,
                notas: form.notas,
                items: valid.map((it) => ({
                    producto_id: it.producto_id,
                    nombre_producto: it.nombre_producto,
                    cantidad: parseFloat(it.cantidad),
                    unidad: it.unidad,
                    precio_unitario: parseFloat(it.precio_unitario),
                })),
            });
            toast.success(`Compra registrada con ${valid.length} producto(s)`);
            setOpen(false);
            setForm(defaultForm());
            reload();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const remove = async (id) => {
        if (!confirm("¿Eliminar compra? Se revertirá del inventario.")) return;
        try { await api.delete(`/compras/${id}`); toast.success("Compra eliminada"); reload(); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    const filtered = useMemo(() => {
        if (!filter) return compras;
        const f = filter.toLowerCase();
        return compras.filter((c) =>
            (c.proveedor || "").toLowerCase().includes(f) ||
            (c.items || []).some((it) => (it.nombre_producto || "").toLowerCase().includes(f))
        );
    }, [compras, filter]);

    return (
        <AppLayout
            title="Compras"
            subtitle="Remisiones de adquisición (uno o varios productos por registro)"
            actions={<button onClick={() => setOpen(true)} data-testid="open-compra-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] flex items-center gap-1.5"><Plus className="w-4 h-4" />Nueva compra</button>}
        >
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar por producto o proveedor…" data-testid="compra-filter-input" className="px-3 py-2 rounded-[10px] border border-neutral-200 w-72 focus:outline-none focus:ring-2 focus:ring-[#8FAD3C]" />
                {!hideMoney && (
                    <div className="text-sm">Total del listado: <b className="text-[#4B5828]">{fmtMoney(filtered.reduce((s, c) => s + (c.precio_total || 0), 0))}</b></div>
                )}
            </div>

            <div className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)] overflow-auto">
                <table className="w-full text-sm">
                    <thead className="bg-[#4B5828] text-[#C8D4A0] text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-4 py-3 text-left w-10"></th>
                            <th className="px-4 py-3 text-left font-medium">Fecha</th>
                            <th className="px-4 py-3 text-left font-medium">Proveedor</th>
                            <th className="px-4 py-3 text-right font-medium">Productos</th>
                            {!hideMoney && <th className="px-4 py-3 text-right font-medium">Total</th>}
                            {isAdmin && <th className="px-4 py-3 text-right"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && <tr><td colSpan={hideMoney ? 4 : 6} className="px-4 py-6 text-center text-neutral-500">Sin compras registradas.</td></tr>}
                        {filtered.map((c) => (
                            <React.Fragment key={c.id}>
                                <tr className="border-b border-neutral-100 hover:bg-[#C8D4A0]/15 even:bg-[#F5F5F0]/40">
                                    <td className="px-4 py-2.5">
                                        <button onClick={() => setExpanded((x) => ({ ...x, [c.id]: !x[c.id] }))} className="p-1 hover:bg-[#C8D4A0]/40 rounded" data-testid={`compra-toggle-${c.id}`}>
                                            {expanded[c.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-2.5">{c.fecha}</td>
                                    <td className="px-4 py-2.5">{c.proveedor || "—"}</td>
                                    <td className="px-4 py-2.5 text-right text-neutral-700">{(c.items || []).length}</td>
                                    {!hideMoney && <td className="px-4 py-2.5 text-right font-semibold text-[#4B5828]">{fmtMoney(c.precio_total)}</td>}
                                    {isAdmin && <td className="px-4 py-2.5 text-right"><button onClick={() => remove(c.id)} className="text-red-600 p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button></td>}
                                </tr>
                                {expanded[c.id] && (
                                    <tr className="bg-[#F5F5F0]/70"><td colSpan={hideMoney ? 4 : 6} className="px-4 py-3">
                                        <table className="w-full text-xs bg-white rounded-[10px] overflow-hidden">
                                            <thead className="bg-[#C8D4A0]/40 text-[#4B5828]">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Producto</th>
                                                    <th className="px-3 py-2 text-right">Cantidad</th>
                                                    <th className="px-3 py-2 text-left">Unidad</th>
                                                    <th className="px-3 py-2 text-right">Cant. a inventario</th>
                                                    {!hideMoney && <th className="px-3 py-2 text-right">P. Unit.</th>}
                                                    {!hideMoney && <th className="px-3 py-2 text-right">Subtotal</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(c.items || []).map((it, i) => (
                                                    <tr key={i} className="border-b last:border-0">
                                                        <td className="px-3 py-1.5 font-medium">{it.nombre_producto}</td>
                                                        <td className="px-3 py-1.5 text-right">{it.cantidad}</td>
                                                        <td className="px-3 py-1.5">{it.unidad}</td>
                                                        <td className="px-3 py-1.5 text-right text-[#4B5828]">{(it.cantidad_convertida ?? it.cantidad).toFixed?.(3) ?? it.cantidad} {it.unidad_base || it.unidad}</td>
                                                        {!hideMoney && <td className="px-3 py-1.5 text-right">{fmtMoney(it.precio_unitario)}</td>}
                                                        {!hideMoney && <td className="px-3 py-1.5 text-right font-semibold">{fmtMoney(it.precio_total_item)}</td>}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {c.notas && <div className="mt-2 text-xs text-neutral-600"><b>Notas:</b> {c.notas}</div>}
                                    </td></tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {open && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
                    <div className="bg-white rounded-[10px] p-6 max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-heading font-semibold text-lg mb-2">Nueva compra (remisión)</h3>
                        <div className="flex items-start gap-2 text-xs text-[#4B5828] bg-[#C8D4A0]/20 rounded-[10px] p-2 mb-4">
                            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <div>El <b>precio unitario</b> debe estar expresado por la <b>unidad habitual del producto</b> (L, kg, mL o g según como lo tengas registrado). Las cantidades capturadas se convertirán automáticamente al agregarse al inventario.</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                            <div><label className="text-xs font-medium">Fecha</label><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="ip" /></div>
                            <div><label className="text-xs font-medium">Proveedor</label><input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} className="ip" /></div>
                            <div className="md:col-span-2"><label className="text-xs font-medium">Notas</label><input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} className="ip" /></div>
                        </div>

                        <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-medium text-[#4B5828]">Productos en esta remisión</div>
                            <button onClick={addItem} className="text-sm text-[#4B5828] hover:underline flex items-center gap-1" data-testid="add-compra-item-btn"><Plus className="w-4 h-4" />Agregar producto</button>
                        </div>

                        <div className="space-y-2">
                            {form.items.map((it, idx) => {
                                const conv = getConversion(it);
                                return (
                                    <div key={idx} className="border border-neutral-200 rounded-[10px] p-3">
                                        <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
                                            <div className="md:col-span-4">
                                                <label className="text-xs font-medium">Producto</label>
                                                <select value={it.producto_id} onChange={(e) => setItem(idx, { producto_id: e.target.value })} data-testid={`compra-item-prod-${idx}`} className="ip">
                                                    <option value="">— Seleccionar —</option>
                                                    {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                                </select>
                                            </div>
                                            <div className="md:col-span-2"><label className="text-xs font-medium">Cantidad</label><input type="number" step="any" value={it.cantidad} onChange={(e) => setItem(idx, { cantidad: e.target.value })} data-testid={`compra-item-cant-${idx}`} className="ip" /></div>
                                            <div className="md:col-span-2"><label className="text-xs font-medium">Unidad</label>
                                                <select value={it.unidad} onChange={(e) => setItem(idx, { unidad: e.target.value })} className="ip">{["L", "mL", "kg", "g"].map((u) => <option key={u}>{u}</option>)}</select>
                                            </div>
                                            <div className="md:col-span-2"><label className="text-xs font-medium">P. unit. ($)</label><input type="number" step="any" value={it.precio_unitario} onChange={(e) => setItem(idx, { precio_unitario: e.target.value })} data-testid={`compra-item-precio-${idx}`} className="ip" /></div>
                                            <div className="md:col-span-1 text-right"><button onClick={() => removeItem(idx)} className="text-red-600 p-2 hover:bg-red-50 rounded-[8px] mt-4" disabled={form.items.length === 1}><Trash2 className="w-4 h-4" /></button></div>
                                        </div>
                                        {conv && it.producto_id && (
                                            <div className="mt-2 text-xs text-neutral-600 pl-1">
                                                {conv.ok ? (
                                                    <>Se agregará al inventario: <b className="text-[#4B5828]">{conv.cantidadConv.toFixed(3)} {conv.unidadBase}</b> · Subtotal: <b>{fmtMoney((conv.cantidadConv || 0) * (parseFloat(it.precio_unitario) || 0))}</b></>
                                                ) : (
                                                    <span className="text-amber-700">No se puede convertir de {it.unidad} a {conv.unidadBase}; se guardará tal cual.</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4 flex items-center justify-between bg-[#F5F5F0] rounded-[10px] p-3">
                            <span className="text-sm font-medium">Total estimado de la remisión</span>
                            <span className="font-heading text-xl font-semibold text-[#4B5828]" data-testid="compra-total">{fmtMoney(totalEstimado)}</span>
                        </div>

                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-neutral-200 rounded-[10px]">Cancelar</button>
                            <button onClick={submit} data-testid="compra-submit-btn" className="px-4 py-2 text-sm bg-[#4B5828] text-white rounded-[10px] flex items-center gap-1.5"><Save className="w-4 h-4" />Registrar compra</button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`.ip { width:100%; padding:.5rem .75rem; border:1px solid #e5e7eb; border-radius:10px; font-size:.875rem; background:white; margin-top:4px; } .ip:focus { outline:none; border-color:#8FAD3C; box-shadow:0 0 0 1px #8FAD3C; }`}</style>
        </AppLayout>
    );
};

export default Compras;
