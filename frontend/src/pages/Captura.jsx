import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, FlaskConical } from "lucide-react";

// Normaliza la cantidad usada total a la unidad base del inventario del producto
function calcularCantidadTotal({ dosis, unidadDosis, ciclo }) {
    const d = parseFloat(dosis) || 0;
    if (!d) return 0;
    if (unidadDosis === "mL/L") return d * (parseFloat(ciclo?.caldo_foliar_L) || 0); // total mL
    if (unidadDosis === "L/L") return d * (parseFloat(ciclo?.caldo_foliar_L) || 0); // total L
    if (unidadDosis === "L/ha") return d * ((parseFloat(ciclo?.superficie_m2) || 0) / 10000);
    if (unidadDosis === "kg/ha") return d * ((parseFloat(ciclo?.superficie_m2) || 0) / 10000);
    if (unidadDosis === "g/ha") return d * ((parseFloat(ciclo?.superficie_m2) || 0) / 10000);
    if (unidadDosis === "L/planta") return d * (parseFloat(ciclo?.num_plantas) || 0);
    if (unidadDosis === "mL/planta") return d * (parseFloat(ciclo?.num_plantas) || 0);
    if (unidadDosis === "g/planta") return d * (parseFloat(ciclo?.num_plantas) || 0);
    return d;
}

// Convierte la cantidad calculada a la unidad base del inventario del producto
function convertirAUnidadBase(cantidad, unidadDosis, unidadBase) {
    // unidadDosis ej "mL/L" → la cantidad calculada está en mL.
    // unidadBase: L, mL, kg, g
    let unidadCalculada = unidadDosis.split("/")[0];
    if (unidadCalculada === unidadBase) return cantidad;
    // Conversiones mL ↔ L y g ↔ kg
    if (unidadCalculada === "mL" && unidadBase === "L") return cantidad / 1000;
    if (unidadCalculada === "L" && unidadBase === "mL") return cantidad * 1000;
    if (unidadCalculada === "g" && unidadBase === "kg") return cantidad / 1000;
    if (unidadCalculada === "kg" && unidadBase === "g") return cantidad * 1000;
    return cantidad;
}

const UNIDADES_DOSIS = ["mL/L", "L/L", "L/ha", "kg/ha", "g/ha", "L/planta", "mL/planta", "g/planta", "L", "kg"];

const Captura = () => {
    const [tipo, setTipo] = useState("individual");
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [moduloId, setModuloId] = useState("");
    const [cicloNumero, setCicloNumero] = useState(1);
    const [asesor, setAsesor] = useState("");
    const [monitor, setMonitor] = useState("");
    const [aplicaciones, setAplicaciones] = useState([]);
    const [modulos, setModulos] = useState([]);
    const [productos, setProductos] = useState([]);
    const [cfg, setCfg] = useState({ objetivos: [], asesor: "", jefe_produccion: "" });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [m, p, c] = await Promise.all([api.get("/modulos"), api.get("/productos"), api.get("/config")]);
                setModulos(m.data); setProductos(p.data); setCfg(c.data);
                setAsesor(c.data.asesor || "");
                setMonitor(c.data.jefe_produccion || "");
                if (m.data.length) setModuloId(m.data[0].id);
            } catch (e) { toast.error(formatApiError(e)); }
        })();
    }, []);

    const moduloSel = useMemo(() => modulos.find((m) => m.id === moduloId), [modulos, moduloId]);
    const cicloSel = useMemo(() => moduloSel?.ciclos?.find((c) => c.numero === cicloNumero) || moduloSel?.ciclos?.[0], [moduloSel, cicloNumero]);

    const addAplicacion = () => {
        setAplicaciones([...aplicaciones, { tipo: "foliar", objetivo: cfg.objetivos[0] || "", productos: [] }]);
    };

    const removeAplicacion = (i) => setAplicaciones(aplicaciones.filter((_, idx) => idx !== i));

    const updateAplicacion = (i, patch) => {
        const next = [...aplicaciones];
        next[i] = { ...next[i], ...patch };
        setAplicaciones(next);
    };

    const addProducto = (apIdx) => {
        const next = [...aplicaciones];
        next[apIdx].productos = [...next[apIdx].productos, { producto_id: "", nombre: "", dosis: 0, unidad: "mL/L", cantidad_usada_total: 0, costo_linea: 0, precio_unitario: 0 }];
        setAplicaciones(next);
    };

    const removeProducto = (apIdx, pIdx) => {
        const next = [...aplicaciones];
        next[apIdx].productos = next[apIdx].productos.filter((_, i) => i !== pIdx);
        setAplicaciones(next);
    };

    const updateProducto = (apIdx, pIdx, patch) => {
        const next = [...aplicaciones];
        const row = { ...next[apIdx].productos[pIdx], ...patch };
        // recompute cantidad y costo cuando cambian los inputs relevantes
        const prod = productos.find((pp) => pp.id === row.producto_id);
        if (prod) {
            row.nombre = prod.nombre;
            row.precio_unitario = prod.precio_unitario || 0;
        }
        const cantidadCalc = calcularCantidadTotal({ dosis: row.dosis, unidadDosis: row.unidad, ciclo: cicloSel });
        const cantidadBase = convertirAUnidadBase(cantidadCalc, row.unidad, prod?.unidad_habitual || "L");
        row.cantidad_usada_total = parseFloat(cantidadBase.toFixed(4));
        row.costo_linea = parseFloat((row.cantidad_usada_total * (row.precio_unitario || 0)).toFixed(2));
        next[apIdx].productos[pIdx] = row;
        setAplicaciones(next);
    };

    const totalBitacora = useMemo(() => {
        let t = 0;
        for (const ap of aplicaciones) for (const p of ap.productos) t += p.costo_linea || 0;
        return t;
    }, [aplicaciones]);

    const submit = async () => {
        if (!moduloId) return toast.error("Selecciona un módulo");
        if (aplicaciones.length === 0) return toast.error("Agrega al menos una aplicación");
        for (const ap of aplicaciones) {
            if (!ap.productos.length) return toast.error("Cada aplicación necesita al menos un producto");
            for (const p of ap.productos) if (!p.producto_id) return toast.error("Selecciona un producto en cada fila");
        }
        setSaving(true);
        try {
            const payload = {
                fecha,
                tipo,
                semana_inicio: tipo === "semanal" ? fecha : null,
                modulo_id: moduloId,
                ciclo_numero: cicloNumero,
                asesor,
                monitor,
                aplicaciones: aplicaciones.map((ap) => ({
                    tipo: ap.tipo,
                    objetivo: ap.objetivo,
                    productos: ap.productos,
                    costo_total_aplicacion: ap.productos.reduce((s, p) => s + (p.costo_linea || 0), 0),
                })),
            };
            await api.post("/bitacoras", payload);
            toast.success("Bitácora guardada e inventario actualizado");
            setAplicaciones([]);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSaving(false); }
    };

    return (
        <AppLayout
            title="Captura de bitácora"
            subtitle="Registro de aplicaciones fitosanitarias por módulo y ciclo"
            actions={
                <button onClick={submit} disabled={saving} data-testid="save-bitacora-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] flex items-center gap-1.5 disabled:opacity-60">
                    <Save className="w-4 h-4" />{saving ? "Guardando…" : "Guardar bitácora"}
                </button>
            }
        >
            <div className="bg-white rounded-[10px] border border-neutral-200 p-5 mb-6 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div>
                        <label className="text-xs font-medium text-neutral-600">Tipo</label>
                        <select value={tipo} onChange={(e) => setTipo(e.target.value)} data-testid="tipo-select" className="ip">
                            <option value="individual">Día individual</option>
                            <option value="semanal">Semanal</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-neutral-600">Fecha</label>
                        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} data-testid="fecha-input" className="ip" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-neutral-600">Módulo</label>
                        <select value={moduloId} onChange={(e) => setModuloId(e.target.value)} data-testid="modulo-select" className="ip">
                            {modulos.length === 0 && <option value="">Sin módulos</option>}
                            {modulos.map((m) => (<option key={m.id} value={m.id}>Módulo {m.nombre}</option>))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-neutral-600">Ciclo</label>
                        <select value={cicloNumero} onChange={(e) => setCicloNumero(parseInt(e.target.value))} data-testid="ciclo-select" className="ip">
                            {(moduloSel?.ciclos || []).map((c) => (
                                <option key={c.numero} value={c.numero}>Ciclo {c.numero} — {c.cultivo || "—"}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-neutral-600">Asesor</label>
                        <input value={asesor} onChange={(e) => setAsesor(e.target.value)} className="ip" data-testid="asesor-input" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-neutral-600">Monitor</label>
                        <input value={monitor} onChange={(e) => setMonitor(e.target.value)} className="ip" data-testid="monitor-input" />
                    </div>
                </div>

                {cicloSel && (
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-600 border-t pt-3">
                        <span><b className="text-[#4B5828]">{cicloSel.cultivo || "Sin cultivo"}</b> {cicloSel.variedad && `· ${cicloSel.variedad}`}</span>
                        <span>Plantas: <b>{cicloSel.num_plantas}</b></span>
                        <span>Superficie: <b>{cicloSel.superficie_m2} m²</b></span>
                        <span>Caldo foliar: <b>{cicloSel.caldo_foliar_L} L</b></span>
                    </div>
                )}
            </div>

            {/* Aplicaciones */}
            <div className="space-y-4">
                {aplicaciones.map((ap, apIdx) => (
                    <div key={apIdx} className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]">
                        <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                                <FlaskConical className="w-4 h-4 text-[#8FAD3C]" />
                                <span className="font-semibold text-[#1C1C1A]">Aplicación {apIdx + 1}</span>
                                <select value={ap.tipo} onChange={(e) => updateAplicacion(apIdx, { tipo: e.target.value })} className="ip-sm" data-testid={`ap-tipo-${apIdx}`}>
                                    {["foliar", "suelo", "drench", "riego"].map((t) => <option key={t}>{t}</option>)}
                                </select>
                                <select value={ap.objetivo} onChange={(e) => updateAplicacion(apIdx, { objetivo: e.target.value })} className="ip-sm" data-testid={`ap-objetivo-${apIdx}`}>
                                    <option value="">— Objetivo —</option>
                                    {cfg.objetivos.map((o) => <option key={o}>{o}</option>)}
                                </select>
                            </div>
                            <button onClick={() => removeAplicacion(apIdx)} className="text-red-600 p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <div className="overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-[#F5F5F0] text-[#4B5828] text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="text-left px-3 py-2">Producto</th>
                                        <th className="text-right px-3 py-2">Dosis</th>
                                        <th className="text-left px-3 py-2">Unidad</th>
                                        <th className="text-right px-3 py-2">Cant. usada</th>
                                        <th className="text-right px-3 py-2">P. Unit.</th>
                                        <th className="text-right px-3 py-2">Costo</th>
                                        <th className="text-right px-3 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ap.productos.map((p, pIdx) => (
                                        <tr key={pIdx} className="border-b last:border-0">
                                            <td className="px-3 py-2 min-w-[200px]">
                                                <select value={p.producto_id} onChange={(e) => updateProducto(apIdx, pIdx, { producto_id: e.target.value })} className="ip-sm w-full" data-testid={`ap-${apIdx}-prod-${pIdx}`}>
                                                    <option value="">— Producto —</option>
                                                    {productos.map((pp) => <option key={pp.id} value={pp.id}>{pp.nombre}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-3 py-2 text-right"><input type="number" step="any" value={p.dosis} onChange={(e) => updateProducto(apIdx, pIdx, { dosis: parseFloat(e.target.value || 0) })} className="ip-sm w-24 text-right" /></td>
                                            <td className="px-3 py-2"><select value={p.unidad} onChange={(e) => updateProducto(apIdx, pIdx, { unidad: e.target.value })} className="ip-sm">{UNIDADES_DOSIS.map((u) => <option key={u}>{u}</option>)}</select></td>
                                            <td className="px-3 py-2 text-right text-neutral-700">{p.cantidad_usada_total?.toFixed(3)} {productos.find((pp) => pp.id === p.producto_id)?.unidad_habitual || ""}</td>
                                            <td className="px-3 py-2 text-right text-neutral-700">${p.precio_unitario?.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-[#4B5828]">${p.costo_linea?.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right"><button onClick={() => removeProducto(apIdx, pIdx)} className="text-red-600 p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-4 py-3 border-t border-neutral-100 flex items-center justify-between">
                            <button onClick={() => addProducto(apIdx)} data-testid={`add-prod-${apIdx}`} className="text-sm text-[#4B5828] hover:underline flex items-center gap-1"><Plus className="w-4 h-4" />Agregar producto</button>
                            <div className="text-sm">
                                <span className="text-neutral-500">Subtotal aplicación: </span>
                                <span className="font-bold text-[#4B5828]">${ap.productos.reduce((s, p) => s + (p.costo_linea || 0), 0).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                ))}

                <button onClick={addAplicacion} data-testid="add-aplicacion-btn" className="w-full py-3 border-2 border-dashed border-[#8FAD3C]/50 hover:border-[#8FAD3C] hover:bg-[#C8D4A0]/15 text-[#4B5828] rounded-[10px] flex items-center justify-center gap-2 font-medium">
                    <Plus className="w-4 h-4" />Agregar aplicación
                </button>

                {aplicaciones.length > 0 && (
                    <div className="bg-[#4B5828] text-white rounded-[10px] p-5 flex items-center justify-between">
                        <span className="font-medium">Total bitácora</span>
                        <span className="font-heading text-2xl font-semibold" data-testid="total-bitacora">${totalBitacora.toFixed(2)}</span>
                    </div>
                )}
            </div>

            <style>{`.ip { width:100%; padding:.5rem .75rem; border:1px solid #e5e7eb; border-radius:10px; font-size:.875rem; background:white; }
                     .ip:focus { outline:none; border-color:#8FAD3C; box-shadow:0 0 0 1px #8FAD3C; }
                     .ip-sm { padding:.4rem .5rem; border:1px solid #e5e7eb; border-radius:8px; font-size:.8rem; background:white; }
                     .ip-sm:focus { outline:none; border-color:#8FAD3C; }`}</style>
        </AppLayout>
    );
};

export default Captura;
