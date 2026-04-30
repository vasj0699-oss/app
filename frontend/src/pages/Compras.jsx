import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Compras = () => {
    const { isAdmin } = useAuth();
    const [productos, setProductos] = useState([]);
    const [compras, setCompras] = useState([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ fecha: new Date().toISOString().slice(0, 10), producto_id: "", nombre_producto: "", cantidad: 0, unidad: "L", precio_unitario: 0, proveedor: "", notas: "" });
    const [filter, setFilter] = useState("");

    const reload = async () => {
        try {
            const [p, c] = await Promise.all([api.get("/productos"), api.get("/compras")]);
            setProductos(p.data); setCompras(c.data);
        } catch (e) { toast.error(formatApiError(e)); }
    };
    useEffect(() => { reload(); }, []);

    const onSelectProducto = (id) => {
        const prod = productos.find((p) => p.id === id);
        if (prod) {
            setForm({ ...form, producto_id: id, nombre_producto: prod.nombre, unidad: prod.unidad_habitual, precio_unitario: prod.precio_unitario || 0 });
        } else {
            setForm({ ...form, producto_id: "", nombre_producto: "" });
        }
    };

    const submit = async () => {
        if (!form.producto_id || !form.cantidad) return toast.error("Producto y cantidad requeridos");
        try {
            await api.post("/compras", { ...form, cantidad: parseFloat(form.cantidad), precio_unitario: parseFloat(form.precio_unitario) });
            toast.success("Compra registrada e inventario actualizado");
            setOpen(false);
            setForm({ fecha: new Date().toISOString().slice(0, 10), producto_id: "", nombre_producto: "", cantidad: 0, unidad: "L", precio_unitario: 0, proveedor: "", notas: "" });
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
        return compras.filter((c) => c.nombre_producto.toLowerCase().includes(f) || (c.proveedor || "").toLowerCase().includes(f));
    }, [compras, filter]);

    const total = filtered.reduce((s, c) => s + (c.precio_total || 0), 0);

    return (
        <AppLayout
            title="Compras"
            subtitle="Registro de adquisiciones de agroquímicos"
            actions={<button onClick={() => setOpen(true)} data-testid="open-compra-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] flex items-center gap-1.5"><Plus className="w-4 h-4" />Nueva compra</button>}
        >
            <div className="flex items-center justify-between mb-4">
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar por producto o proveedor…" data-testid="compra-filter-input" className="px-3 py-2 rounded-[10px] border border-neutral-200 w-72 focus:outline-none focus:ring-2 focus:ring-[#8FAD3C]" />
                <div className="text-sm">Total mostrado: <b className="text-[#4B5828]">${total.toFixed(2)}</b></div>
            </div>

            <div className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)] overflow-auto">
                <table className="w-full text-sm">
                    <thead className="bg-[#4B5828] text-[#C8D4A0] text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Fecha</th>
                            <th className="px-4 py-3 text-left font-medium">Producto</th>
                            <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                            <th className="px-4 py-3 text-left font-medium">Unidad</th>
                            <th className="px-4 py-3 text-right font-medium">P. Unit.</th>
                            <th className="px-4 py-3 text-right font-medium">Total</th>
                            <th className="px-4 py-3 text-left font-medium">Proveedor</th>
                            {isAdmin && <th className="px-4 py-3 text-right"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-neutral-500">Sin compras registradas.</td></tr>}
                        {filtered.map((c) => (
                            <tr key={c.id} className="border-b border-neutral-100 hover:bg-[#C8D4A0]/15 even:bg-[#F5F5F0]/40">
                                <td className="px-4 py-2.5">{c.fecha}</td>
                                <td className="px-4 py-2.5 font-medium">{c.nombre_producto}</td>
                                <td className="px-4 py-2.5 text-right">{c.cantidad}</td>
                                <td className="px-4 py-2.5">{c.unidad}</td>
                                <td className="px-4 py-2.5 text-right">${c.precio_unitario.toFixed(2)}</td>
                                <td className="px-4 py-2.5 text-right font-semibold text-[#4B5828]">${c.precio_total.toFixed(2)}</td>
                                <td className="px-4 py-2.5 text-neutral-600">{c.proveedor || "—"}</td>
                                {isAdmin && (
                                    <td className="px-4 py-2.5 text-right"><button onClick={() => remove(c.id)} className="text-red-600 p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button></td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {open && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
                    <div className="bg-white rounded-[10px] p-6 max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-heading font-semibold text-lg mb-4">Nueva compra</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div><label className="text-xs font-medium">Fecha</label><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="ip" /></div>
                            <div><label className="text-xs font-medium">Producto</label>
                                <select value={form.producto_id} onChange={(e) => onSelectProducto(e.target.value)} data-testid="compra-producto-select" className="ip">
                                    <option value="">— Seleccionar —</option>
                                    {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                </select>
                            </div>
                            <div><label className="text-xs font-medium">Cantidad</label><input type="number" step="any" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} data-testid="compra-cantidad-input" className="ip" /></div>
                            <div><label className="text-xs font-medium">Unidad</label>
                                <select value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} className="ip">{["L", "mL", "kg", "g"].map((u) => <option key={u}>{u}</option>)}</select>
                            </div>
                            <div><label className="text-xs font-medium">Precio unitario ($)</label><input type="number" step="any" value={form.precio_unitario} onChange={(e) => setForm({ ...form, precio_unitario: e.target.value })} data-testid="compra-precio-input" className="ip" /></div>
                            <div><label className="text-xs font-medium">Total estimado</label><div className="ip bg-neutral-50">${((parseFloat(form.cantidad) || 0) * (parseFloat(form.precio_unitario) || 0)).toFixed(2)}</div></div>
                            <div className="md:col-span-2"><label className="text-xs font-medium">Proveedor</label><input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} className="ip" /></div>
                            <div className="md:col-span-2"><label className="text-xs font-medium">Notas</label><input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} className="ip" /></div>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-neutral-200 rounded-[10px]">Cancelar</button>
                            <button onClick={submit} data-testid="compra-submit-btn" className="px-4 py-2 text-sm bg-[#4B5828] text-white rounded-[10px] flex items-center gap-1.5"><Save className="w-4 h-4" />Registrar</button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`.ip { width:100%; padding:.5rem .75rem; border:1px solid #e5e7eb; border-radius:10px; font-size:.875rem; background:white; margin-top:4px; }
                     .ip:focus { outline:none; border-color:#8FAD3C; box-shadow:0 0 0 1px #8FAD3C; }`}</style>
        </AppLayout>
    );
};

export default Compras;
