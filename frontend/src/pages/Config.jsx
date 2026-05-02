import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, Pencil, Check } from "lucide-react";

const Tab = ({ active, onClick, children, testid }) => (
    <button
        onClick={onClick}
        data-testid={testid}
        className={`px-4 py-2 text-sm font-medium rounded-[10px] transition-colors ${
            active ? "bg-[#4B5828] text-white" : "text-[#4B5828] hover:bg-[#C8D4A0]/40"
        }`}
    >
        {children}
    </button>
);

const Section = ({ title, children, actions }) => (
    <div className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
            <h3 className="font-heading font-semibold text-[#1C1C1A]">{title}</h3>
            {actions}
        </div>
        <div className="p-5">{children}</div>
    </div>
);

const ListEditor = ({ items, setItems, placeholder, testidPrefix }) => {
    const [val, setVal] = useState("");
    const add = () => {
        const v = val.trim();
        if (!v) return;
        if (items.includes(v)) return toast.error("Ya existe");
        setItems([...items, v]);
        setVal("");
    };
    return (
        <div>
            <div className="flex gap-2 mb-3">
                <input
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
                    placeholder={placeholder}
                    data-testid={`${testidPrefix}-input`}
                    className="flex-1 px-3 py-2 rounded-[10px] border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#8FAD3C]"
                />
                <button onClick={add} data-testid={`${testidPrefix}-add-btn`} className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Añadir
                </button>
            </div>
            <div className="flex flex-wrap gap-2">
                {items.length === 0 && <span className="text-xs text-neutral-500">Sin elementos. Añade el primero.</span>}
                {items.map((it, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-[#C8D4A0]/40 text-[#4B5828] px-3 py-1.5 rounded-full text-sm">
                        {it}
                        <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="hover:text-red-600" data-testid={`${testidPrefix}-remove-${i}`}>
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </span>
                ))}
            </div>
        </div>
    );
};

const Config = () => {
    const [tab, setTab] = useState("empresa");
    const [cfg, setCfg] = useState({ empresa: "AJVJ Hidropónicos", razon_social: "AJVJ Hidropónicos SPR DE RI DE CV", asesor: "", monitor: "", objetivos: [], categorias_producto: [] });
    const [modulos, setModulos] = useState([]);
    const [productos, setProductos] = useState([]);
    const [loading, setLoading] = useState(true);

    const reload = async () => {
        try {
            const [c, m, p] = await Promise.all([api.get("/config"), api.get("/modulos"), api.get("/productos")]);
            setCfg(c.data);
            setModulos(m.data);
            setProductos(p.data);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setLoading(false); }
    };

    useEffect(() => { reload(); }, []);

    const saveCfg = async () => {
        try { await api.put("/config", cfg); toast.success("Configuración guardada"); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <AppLayout title="Configuración" subtitle="Empresa, módulos, productos y catálogos">
            <div className="flex flex-wrap gap-2 mb-6 bg-white p-1.5 rounded-[10px] border border-neutral-200 inline-flex">
                <Tab active={tab === "empresa"} onClick={() => setTab("empresa")} testid="tab-empresa">Empresa</Tab>
                <Tab active={tab === "modulos"} onClick={() => setTab("modulos")} testid="tab-modulos">Módulos & Ciclos</Tab>
                <Tab active={tab === "productos"} onClick={() => setTab("productos")} testid="tab-productos">Productos</Tab>
                <Tab active={tab === "catalogos"} onClick={() => setTab("catalogos")} testid="tab-catalogos">Catálogos</Tab>
            </div>

            {loading ? <div className="text-sm text-neutral-500">Cargando…</div> : null}

            {tab === "empresa" && !loading && (
                <Section title="Datos de la empresa" actions={<button onClick={saveCfg} data-testid="save-config-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] flex items-center gap-1.5 text-sm"><Save className="w-4 h-4" />Guardar</button>}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                            ["empresa", "Empresa"],
                            ["razon_social", "Razón social"],
                            ["asesor", "Asesor"],
                            ["monitor", "Monitor"],
                        ].map(([k, l]) => (
                            <div key={k}>
                                <label className="text-sm font-medium text-[#1C1C1A]">{l}</label>
                                <input
                                    value={cfg[k] || ""}
                                    onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })}
                                    data-testid={`cfg-${k}`}
                                    className="mt-1 w-full px-3 py-2 rounded-[10px] border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#8FAD3C]"
                                />
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {tab === "modulos" && !loading && (<ModulosEditor modulos={modulos} onChange={reload} />)}
            {tab === "productos" && !loading && (<ProductosEditor productos={productos} categorias={cfg.categorias_producto} onChange={reload} />)}
            {tab === "catalogos" && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Section title="Objetivos de aplicación">
                        <ListEditor items={cfg.objetivos} setItems={(v) => setCfg({ ...cfg, objetivos: v })} placeholder="Ej. Mosca blanca" testidPrefix="objetivo" />
                        <button onClick={saveCfg} data-testid="save-objetivos-btn" className="mt-4 px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] text-sm">Guardar lista</button>
                    </Section>
                    <Section title="Categorías de producto">
                        <ListEditor items={cfg.categorias_producto} setItems={(v) => setCfg({ ...cfg, categorias_producto: v })} placeholder="Ej. Insecticida" testidPrefix="categoria" />
                        <button onClick={saveCfg} data-testid="save-categorias-btn" className="mt-4 px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] text-sm">Guardar lista</button>
                    </Section>
                </div>
            )}
        </AppLayout>
    );
};

const emptyModulo = { nombre: "", ciclos: [{ numero: 1, cultivo: "", variedad: "", num_plantas: 0, superficie_m2: 0, caldo_foliar_L: 0, fecha_trasplante: "", activo: true }] };

const ModulosEditor = ({ modulos, onChange }) => {
    const [editing, setEditing] = useState(null);

    const startNew = () => setEditing({ ...emptyModulo });
    const startEdit = (m) => setEditing({ ...m, ciclos: m.ciclos?.length ? m.ciclos : [{ numero: 1 }] });

    const save = async () => {
        if (!editing.nombre) return toast.error("Nombre del módulo requerido");
        try {
            if (editing.id) await api.put(`/modulos/${editing.id}`, editing);
            else await api.post("/modulos", editing);
            toast.success("Módulo guardado");
            setEditing(null);
            onChange();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const remove = async (id) => {
        if (!confirm("¿Eliminar módulo?")) return;
        try { await api.delete(`/modulos/${id}`); onChange(); toast.success("Eliminado"); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    const setCiclo = (idx, field, val) => {
        const ciclos = [...editing.ciclos];
        ciclos[idx] = { ...ciclos[idx], [field]: val };
        setEditing({ ...editing, ciclos });
    };

    const addCiclo = () => {
        const ciclos = [...editing.ciclos, { numero: editing.ciclos.length + 1, cultivo: "", variedad: "", num_plantas: 0, superficie_m2: 0, caldo_foliar_L: 0, activo: true }];
        setEditing({ ...editing, ciclos });
    };

    return (
        <div className="space-y-4">
            <Section title="Módulos de invernadero" actions={<button onClick={startNew} data-testid="new-modulo-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" />Nuevo módulo</button>}>
                <div className="overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-[#F5F5F0] text-[#4B5828] text-xs uppercase tracking-wider">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium">Módulo</th>
                                <th className="text-left px-3 py-2 font-medium">Ciclos</th>
                                <th className="text-right px-3 py-2 font-medium">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {modulos.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-neutral-500">Sin módulos. Crea el primero.</td></tr>}
                            {modulos.map((m) => (
                                <tr key={m.id} className="border-b border-neutral-100 hover:bg-[#C8D4A0]/15">
                                    <td className="px-3 py-2.5 font-semibold">Módulo {m.nombre}</td>
                                    <td className="px-3 py-2.5 text-neutral-700">
                                        {m.ciclos?.map((c, i) => (
                                            <span key={i} className="inline-block mr-2 mb-1 text-xs bg-[#C8D4A0]/40 text-[#4B5828] px-2 py-1 rounded-full">
                                                Ciclo {c.numero}: {c.cultivo || "—"} {c.activo ? "(activo)" : "(inactivo)"}
                                            </span>
                                        ))}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                        <button onClick={() => startEdit(m)} className="p-1.5 hover:bg-[#C8D4A0]/40 rounded text-[#4B5828]" data-testid={`edit-modulo-${m.nombre}`}><Pencil className="w-4 h-4" /></button>
                                        <button onClick={() => remove(m.id)} className="p-1.5 hover:bg-red-50 rounded text-red-600 ml-1" data-testid={`delete-modulo-${m.nombre}`}><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>

            {editing && (
                <Section title={editing.id ? `Editar Módulo ${editing.nombre}` : "Nuevo módulo"} actions={
                    <div className="flex gap-2">
                        <button onClick={() => setEditing(null)} className="px-3 py-2 text-sm rounded-[10px] border border-neutral-200">Cancelar</button>
                        <button onClick={save} data-testid="save-modulo-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] text-sm flex items-center gap-1.5"><Save className="w-4 h-4" />Guardar</button>
                    </div>
                }>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium">Nombre (letra)</label>
                            <input value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value.toUpperCase() })} maxLength={3} data-testid="modulo-nombre-input" className="mt-1 w-32 px-3 py-2 rounded-[10px] border border-neutral-200 font-bold uppercase" placeholder="A" />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium">Ciclos</label>
                                <button onClick={addCiclo} className="text-sm text-[#4B5828] hover:underline">+ Añadir ciclo</button>
                            </div>
                            {editing.ciclos.map((c, i) => (
                                <div key={i} className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 mb-2 border border-neutral-200 rounded-[10px]">
                                    <Field label="Ciclo #"><input type="number" min={1} max={2} value={c.numero} onChange={(e) => setCiclo(i, "numero", parseInt(e.target.value || 1))} className="ip" /></Field>
                                    <Field label="Cultivo"><input value={c.cultivo || ""} onChange={(e) => setCiclo(i, "cultivo", e.target.value)} className="ip" placeholder="Jitomate" /></Field>
                                    <Field label="Variedad"><input value={c.variedad || ""} onChange={(e) => setCiclo(i, "variedad", e.target.value)} className="ip" /></Field>
                                    <Field label="# Plantas"><input type="number" value={c.num_plantas || 0} onChange={(e) => setCiclo(i, "num_plantas", parseFloat(e.target.value || 0))} className="ip" /></Field>
                                    <Field label="Superficie m²"><input type="number" value={c.superficie_m2 || 0} onChange={(e) => setCiclo(i, "superficie_m2", parseFloat(e.target.value || 0))} className="ip" /></Field>
                                    <Field label="Caldo foliar (L)"><input type="number" value={c.caldo_foliar_L || 0} onChange={(e) => setCiclo(i, "caldo_foliar_L", parseFloat(e.target.value || 0))} className="ip" /></Field>
                                    <Field label="Fecha trasplante"><input type="date" value={c.fecha_trasplante || ""} onChange={(e) => setCiclo(i, "fecha_trasplante", e.target.value)} className="ip" /></Field>
                                    <Field label="Activo"><label className="flex items-center gap-2 mt-1"><input type="checkbox" checked={c.activo !== false} onChange={(e) => setCiclo(i, "activo", e.target.checked)} /> <span className="text-sm">Sí</span></label></Field>
                                </div>
                            ))}
                        </div>
                    </div>
                </Section>
            )}
            <style>{`.ip { width: 100%; padding: .5rem .75rem; border: 1px solid #e5e7eb; border-radius: 10px; font-size: .875rem; }
            .ip:focus { outline: none; border-color: #8FAD3C; box-shadow: 0 0 0 1px #8FAD3C; }`}</style>
        </div>
    );
};

const Field = ({ label, children }) => (
    <div><label className="text-xs font-medium text-neutral-600 mb-1 block">{label}</label>{children}</div>
);

const ProductosEditor = ({ productos, categorias, onChange }) => {
    const [editing, setEditing] = useState(null);
    const startNew = () => setEditing({ nombre: "", categoria: categorias[0] || "", dosis_habitual: 0, unidad_habitual: "L", precio_unitario: 0, notas: "" });

    const save = async () => {
        if (!editing.nombre) return toast.error("Nombre requerido");
        try {
            if (editing.id) await api.put(`/productos/${editing.id}`, editing);
            else await api.post("/productos", editing);
            toast.success("Producto guardado");
            setEditing(null);
            onChange();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const remove = async (id) => {
        if (!confirm("¿Eliminar producto?")) return;
        try { await api.delete(`/productos/${id}`); onChange(); toast.success("Eliminado"); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <div className="space-y-4">
            {/* Formulario ARRIBA del catálogo */}
            {editing ? (
                <Section title={editing.id ? "Editar producto" : "Nuevo producto"} actions={
                    <div className="flex gap-2">
                        <button onClick={() => setEditing(null)} className="px-3 py-2 text-sm rounded-[10px] border border-neutral-200">Cancelar</button>
                        <button onClick={save} data-testid="save-producto-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] text-sm flex items-center gap-1.5"><Save className="w-4 h-4" />Guardar</button>
                    </div>
                }>
                    <div className="flex items-start gap-2 text-xs text-[#4B5828] bg-[#C8D4A0]/30 rounded-[10px] p-2.5 mb-4">
                        <span className="inline-flex items-center justify-center w-4 h-4 bg-[#4B5828] text-white rounded-full text-[10px] font-bold flex-shrink-0">i</span>
                        <div>
                            <b>Nota sobre precio unitario:</b> el precio debe expresarse por cada <b>unidad habitual del producto</b> (por ejemplo, $ por Litro si la unidad es L, $ por Kg si es kg). Todos los cálculos de costos de aplicación y valoración de inventario se hacen con base en esto.
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Nombre"><input data-testid="producto-nombre-input" value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} className="ip" /></Field>
                        <Field label="Categoría">
                            <select value={editing.categoria || ""} onChange={(e) => setEditing({ ...editing, categoria: e.target.value })} className="ip">
                                <option value="">— Sin categoría —</option>
                                {categorias.map((c) => (<option key={c} value={c}>{c}</option>))}
                            </select>
                        </Field>
                        <Field label="Dosis habitual"><input type="number" step="any" value={editing.dosis_habitual || 0} onChange={(e) => setEditing({ ...editing, dosis_habitual: parseFloat(e.target.value || 0) })} className="ip" /></Field>
                        <Field label="Unidad habitual">
                            <select value={editing.unidad_habitual} onChange={(e) => setEditing({ ...editing, unidad_habitual: e.target.value })} className="ip">
                                {["L", "mL", "kg", "g"].map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </Field>
                        <Field label={`Precio unitario ($ por ${editing.unidad_habitual || "L"})`}><input type="number" step="any" value={editing.precio_unitario || 0} onChange={(e) => setEditing({ ...editing, precio_unitario: parseFloat(e.target.value || 0) })} className="ip" /></Field>
                        <Field label="Notas"><input value={editing.notas || ""} onChange={(e) => setEditing({ ...editing, notas: e.target.value })} className="ip" /></Field>
                    </div>
                </Section>
            ) : (
                <div className="flex justify-end">
                    <button onClick={startNew} data-testid="new-producto-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" />Nuevo producto</button>
                </div>
            )}

            <Section title="Catálogo de productos">
                <div className="overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-[#F5F5F0] text-[#4B5828] text-xs uppercase tracking-wider">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium">Producto</th>
                                <th className="text-left px-3 py-2 font-medium">Categoría</th>
                                <th className="text-right px-3 py-2 font-medium">Dosis</th>
                                <th className="text-left px-3 py-2 font-medium">Unidad</th>
                                <th className="text-right px-3 py-2 font-medium">P. unit.</th>
                                <th className="text-right px-3 py-2 font-medium">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {productos.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Sin productos.</td></tr>}
                            {productos.map((p) => (
                                <tr key={p.id} className="border-b border-neutral-100 hover:bg-[#C8D4A0]/15 even:bg-[#F5F5F0]/40">
                                    <td className="px-3 py-2.5 font-medium">{p.nombre}</td>
                                    <td className="px-3 py-2.5 text-neutral-600">{p.categoria || "—"}</td>
                                    <td className="px-3 py-2.5 text-right">{p.dosis_habitual}</td>
                                    <td className="px-3 py-2.5">{p.unidad_habitual}</td>
                                    <td className="px-3 py-2.5 text-right">${(p.precio_unitario || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })} / {p.unidad_habitual}</td>
                                    <td className="px-3 py-2.5 text-right">
                                        <button onClick={() => setEditing(p)} className="p-1.5 hover:bg-[#C8D4A0]/40 rounded text-[#4B5828]"><Pencil className="w-4 h-4" /></button>
                                        <button onClick={() => remove(p.id)} className="p-1.5 hover:bg-red-50 rounded text-red-600 ml-1"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>
        </div>
    );
};

export default Config;
