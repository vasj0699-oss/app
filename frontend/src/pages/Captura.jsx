import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatApiError } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, Save, FlaskConical, Copy } from "lucide-react";

const UNIDADES_DOSIS = ["mL/L", "g/L", "L/ha", "kg/ha", "mL/ha", "g/ha", "L/planta", "mL/planta", "g/planta", "L", "kg", "mL", "g"];
const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Calcula cantidad total usada según unidad de dosis y parámetros del ciclo
function calcularCantidadTotal({ dosis, unidadDosis, ciclo }) {
    const d = parseFloat(dosis) || 0;
    if (!d) return 0;
    const caldo = parseFloat(ciclo?.caldo_foliar_L) || 0;
    const ha = (parseFloat(ciclo?.superficie_m2) || 0) / 10000;
    const plantas = parseFloat(ciclo?.num_plantas) || 0;
    switch (unidadDosis) {
        case "mL/L":
        case "g/L":
            return d * caldo; // resulta en mL o g
        case "L/ha":
        case "kg/ha":
        case "mL/ha":
        case "g/ha":
            return d * ha;
        case "L/planta":
        case "mL/planta":
        case "g/planta":
            return d * plantas;
        default:
            return d; // cantidad absoluta
    }
}

function convertirAUnidadBase(cantidad, unidadDosis, unidadBase) {
    const unidadCalc = unidadDosis.includes("/") ? unidadDosis.split("/")[0] : unidadDosis;
    if (unidadCalc === unidadBase) return cantidad;
    if (unidadCalc === "mL" && unidadBase === "L") return cantidad / 1000;
    if (unidadCalc === "L" && unidadBase === "mL") return cantidad * 1000;
    if (unidadCalc === "g" && unidadBase === "kg") return cantidad / 1000;
    if (unidadCalc === "kg" && unidadBase === "g") return cantidad * 1000;
    return cantidad;
}

// Plantilla de aplicación vacía
const emptyAplicacion = (objetivo = "") => ({ tipo: "foliar", objetivo, productos: [] });

const Captura = () => {
    const [tipo, setTipo] = useState("individual");
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [semanaInicio, setSemanaInicio] = useState(() => {
        const d = new Date();
        const diff = (d.getDay() + 6) % 7; // lunes = 0
        d.setDate(d.getDate() - diff);
        return d.toISOString().slice(0, 10);
    });
    const [moduloIdsSeleccionados, setModuloIdsSeleccionados] = useState([]);
    const [cicloNumero, setCicloNumero] = useState(1);
    const [asesor, setAsesor] = useState("");
    const [monitor, setMonitor] = useState("");
    // Individual: aplicaciones (array)
    const [aplicaciones, setAplicaciones] = useState([]);
    // Semanal: aplicacionesPorDia[i] = array de aplicaciones del día i (0=lunes)
    const [aplicacionesPorDia, setAplicacionesPorDia] = useState([[], [], [], [], [], [], []]);
    const [diaActivo, setDiaActivo] = useState(0);

    const [modulos, setModulos] = useState([]);
    const [productos, setProductos] = useState([]);
    const [cfg, setCfg] = useState({ objetivos: [], asesor: "", monitor: "" });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [m, p, c] = await Promise.all([api.get("/modulos"), api.get("/productos"), api.get("/config")]);
                setModulos(m.data); setProductos(p.data); setCfg(c.data);
                setAsesor(c.data.asesor || "");
                setMonitor(c.data.monitor || "");
                if (m.data.length) setModuloIdsSeleccionados([m.data[0].id]);
            } catch (e) { toast.error(formatApiError(e)); }
        })();
    }, []);

    // Ciclo seleccionado del PRIMER módulo (sólo para PREVIEW de filas)
    const primerModulo = useMemo(() => modulos.find((m) => m.id === moduloIdsSeleccionados[0]), [modulos, moduloIdsSeleccionados]);
    const cicloSel = useMemo(() => primerModulo?.ciclos?.find((c) => c.numero === cicloNumero) || primerModulo?.ciclos?.[0], [primerModulo, cicloNumero]);

    const toggleModulo = (id) => setModuloIdsSeleccionados((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

    // Recalcula cantidad_usada_total y costo_linea de un producto SEGÚN el ciclo de un módulo específico
    const recalcProductosParaModulo = (prods, modId) => {
        const mod = modulos.find((m) => m.id === modId);
        const ciclo = mod?.ciclos?.find((c) => c.numero === cicloNumero) || mod?.ciclos?.[0];
        return prods.map((p) => {
            const prodCat = productos.find((pp) => pp.id === p.producto_id);
            if (!prodCat || !ciclo) return p;
            const cantCalc = calcularCantidadTotal({ dosis: p.dosis, unidadDosis: p.unidad, ciclo });
            const cantBase = convertirAUnidadBase(cantCalc, p.unidad, prodCat.unidad_habitual);
            const cantidadUsada = parseFloat(cantBase.toFixed(4));
            return {
                ...p,
                cantidad_usada_total: cantidadUsada,
                costo_linea: parseFloat((cantidadUsada * (p.precio_unitario || 0)).toFixed(2)),
            };
        });
    };

    // Helpers para manipular lista de aplicaciones (individual o día semanal)
    const getActiveAplicaciones = () => tipo === "individual" ? aplicaciones : aplicacionesPorDia[diaActivo];
    const setActiveAplicaciones = (nuevas) => {
        if (tipo === "individual") setAplicaciones(nuevas);
        else {
            const next = [...aplicacionesPorDia];
            next[diaActivo] = nuevas;
            setAplicacionesPorDia(next);
        }
    };

    const addAplicacion = () => setActiveAplicaciones([...getActiveAplicaciones(), emptyAplicacion(cfg.objetivos[0] || "")]);
    const removeAplicacion = (i) => setActiveAplicaciones(getActiveAplicaciones().filter((_, idx) => idx !== i));
    const updateAplicacion = (i, patch) => {
        const next = [...getActiveAplicaciones()];
        next[i] = { ...next[i], ...patch };
        setActiveAplicaciones(next);
    };

    const addProducto = (apIdx) => {
        const next = [...getActiveAplicaciones()];
        next[apIdx].productos = [...next[apIdx].productos, { producto_id: "", nombre: "", dosis: 0, unidad: "mL/L", cantidad_usada_total: 0, costo_linea: 0, precio_unitario: 0 }];
        setActiveAplicaciones(next);
    };
    const removeProducto = (apIdx, pIdx) => {
        const next = [...getActiveAplicaciones()];
        next[apIdx].productos = next[apIdx].productos.filter((_, i) => i !== pIdx);
        setActiveAplicaciones(next);
    };
    const updateProducto = (apIdx, pIdx, patch) => {
        const next = [...getActiveAplicaciones()];
        const row = { ...next[apIdx].productos[pIdx], ...patch };
        const prod = productos.find((pp) => pp.id === row.producto_id);
        // Al seleccionar producto, precargar dosis y unidad del catálogo
        if ("producto_id" in patch && prod) {
            row.nombre = prod.nombre;
            row.precio_unitario = prod.precio_unitario || 0;
            if (!("dosis" in patch) && prod.dosis_habitual) row.dosis = prod.dosis_habitual;
        }
        if (prod) {
            row.nombre = prod.nombre;
            row.precio_unitario = prod.precio_unitario || 0;
        }
        const cantidadCalc = calcularCantidadTotal({ dosis: row.dosis, unidadDosis: row.unidad, ciclo: cicloSel });
        const cantidadBase = convertirAUnidadBase(cantidadCalc, row.unidad, prod?.unidad_habitual || "L");
        row.cantidad_usada_total = parseFloat(cantidadBase.toFixed(4));
        row.costo_linea = parseFloat((row.cantidad_usada_total * (row.precio_unitario || 0)).toFixed(2));
        next[apIdx].productos[pIdx] = row;
        setActiveAplicaciones(next);
    };

    // Copiar aplicaciones del día activo a otros días
    const [copiarOpen, setCopiarOpen] = useState(false);
    const [diasCopiar, setDiasCopiar] = useState([]);
    const aplicarCopia = () => {
        const src = aplicacionesPorDia[diaActivo];
        const next = [...aplicacionesPorDia];
        for (const d of diasCopiar) next[d] = JSON.parse(JSON.stringify(src));
        setAplicacionesPorDia(next);
        setCopiarOpen(false);
        setDiasCopiar([]);
        toast.success(`Aplicaciones copiadas a ${diasCopiar.length} día(s)`);
    };

    // Total de la vista activa (preview con datos del PRIMER módulo)
    const totalActual = useMemo(() => {
        const aps = getActiveAplicaciones();
        let t = 0;
        for (const ap of aps) for (const p of ap.productos) t += p.costo_linea || 0;
        return t;
        // eslint-disable-next-line
    }, [aplicaciones, aplicacionesPorDia, diaActivo, tipo]);

    // Total final RECALCULADO por cada módulo (cada uno con su propia config)
    const totalFinal = useMemo(() => {
        if (moduloIdsSeleccionados.length === 0) return 0;
        const apsToProcess = tipo === "individual" ? aplicaciones : aplicacionesPorDia.flat();
        let t = 0;
        for (const modId of moduloIdsSeleccionados) {
            for (const ap of apsToProcess) {
                const recalc = recalcProductosParaModulo(ap.productos, modId);
                for (const p of recalc) t += p.costo_linea || 0;
            }
        }
        return t;
        // eslint-disable-next-line
    }, [aplicaciones, aplicacionesPorDia, moduloIdsSeleccionados, modulos, productos, cicloNumero, tipo]);

    const submit = async () => {
        if (moduloIdsSeleccionados.length === 0) return toast.error("Selecciona al menos un módulo destino");
        setSaving(true);
        try {
            const bitacoras = [];
            if (tipo === "individual") {
                if (aplicaciones.length === 0) return toast.error("Agrega al menos una aplicación") & setSaving(false);
                for (const ap of aplicaciones) {
                    if (!ap.productos.length) return toast.error("Cada aplicación necesita al menos un producto") & setSaving(false);
                    for (const p of ap.productos) if (!p.producto_id) return toast.error("Selecciona producto en cada fila") & setSaving(false);
                }
                for (const modId of moduloIdsSeleccionados) {
                    bitacoras.push({
                        fecha,
                        tipo: "individual",
                        semana_inicio: null,
                        modulo_id: modId,
                        ciclo_numero: cicloNumero,
                        asesor,
                        monitor,
                        aplicaciones: aplicaciones.map((ap) => {
                            const recalc = recalcProductosParaModulo(ap.productos, modId);
                            return {
                                tipo: ap.tipo, objetivo: ap.objetivo, productos: recalc,
                                costo_total_aplicacion: parseFloat(recalc.reduce((s, p) => s + (p.costo_linea || 0), 0).toFixed(2)),
                            };
                        }),
                    });
                }
            } else {
                // Semanal
                const diasConAplicaciones = aplicacionesPorDia.map((d, i) => ({ idx: i, apps: d })).filter((x) => x.apps.length > 0);
                if (diasConAplicaciones.length === 0) return toast.error("Al menos un día debe tener aplicaciones") & setSaving(false);
                for (const { idx, apps } of diasConAplicaciones) {
                    for (const ap of apps) {
                        for (const p of ap.productos) if (!p.producto_id) return toast.error(`Falta producto en ${DIAS_SEMANA[idx]}`) & setSaving(false);
                    }
                    const fechaDia = new Date(semanaInicio);
                    fechaDia.setDate(fechaDia.getDate() + idx);
                    const fechaStr = fechaDia.toISOString().slice(0, 10);
                    for (const modId of moduloIdsSeleccionados) {
                        bitacoras.push({
                            fecha: fechaStr,
                            tipo: "semanal",
                            semana_inicio: semanaInicio,
                            modulo_id: modId,
                            ciclo_numero: cicloNumero,
                            asesor, monitor,
                            aplicaciones: apps.map((ap) => {
                                const recalc = recalcProductosParaModulo(ap.productos, modId);
                                return {
                                    tipo: ap.tipo, objetivo: ap.objetivo, productos: recalc,
                                    costo_total_aplicacion: parseFloat(recalc.reduce((s, p) => s + (p.costo_linea || 0), 0).toFixed(2)),
                                };
                            }),
                        });
                    }
                }
            }
            if (bitacoras.length === 0) { setSaving(false); return; }
            await api.post("/bitacoras/batch", { bitacoras });
            toast.success(`${bitacoras.length} bitácora(s) guardadas como plan. Se descontará el inventario solo cuando las marques como APLICADAS desde Historial.`);
            setAplicaciones([]);
            setAplicacionesPorDia([[], [], [], [], [], [], []]);
        } catch (e) { toast.error(formatApiError(e)); }
        finally { setSaving(false); }
    };

    const active = getActiveAplicaciones();

    return (
        <AppLayout
            title="Captura de bitácora"
            subtitle={`Plan de aplicaciones · ${moduloIdsSeleccionados.length} módulo(s) destino · El inventario se descuenta al marcar la bitácora como APLICADA`}
            actions={
                <button onClick={submit} disabled={saving} data-testid="save-bitacora-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] flex items-center gap-1.5 disabled:opacity-60">
                    <Save className="w-4 h-4" />{saving ? "Guardando…" : "Guardar bitácora"}
                </button>
            }
        >
            {/* Header form */}
            <div className="bg-white rounded-[10px] border border-neutral-200 p-5 mb-6 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                        <label className="text-xs font-medium text-neutral-600">Tipo</label>
                        <select value={tipo} onChange={(e) => setTipo(e.target.value)} data-testid="tipo-select" className="ip">
                            <option value="individual">Día individual</option>
                            <option value="semanal">Semanal (7 días)</option>
                        </select>
                    </div>
                    {tipo === "individual" ? (
                        <div>
                            <label className="text-xs font-medium text-neutral-600">Fecha</label>
                            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} data-testid="fecha-input" className="ip" />
                        </div>
                    ) : (
                        <div>
                            <label className="text-xs font-medium text-neutral-600">Lunes de la semana</label>
                            <input type="date" value={semanaInicio} onChange={(e) => setSemanaInicio(e.target.value)} data-testid="semana-inicio-input" className="ip" />
                        </div>
                    )}
                    <div>
                        <label className="text-xs font-medium text-neutral-600">Ciclo</label>
                        <select value={cicloNumero} onChange={(e) => setCicloNumero(parseInt(e.target.value))} data-testid="ciclo-select" className="ip">
                            {(primerModulo?.ciclos || []).map((c) => (
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
                    <div className="col-span-2 md:col-span-3">
                        <label className="text-xs font-medium text-neutral-600">Módulos destino (multi-selección)</label>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                            {modulos.length === 0 && <span className="text-xs text-neutral-400">Sin módulos creados</span>}
                            {modulos.map((m) => (
                                <button type="button" key={m.id} onClick={() => toggleModulo(m.id)} data-testid={`captura-mod-${m.nombre}`}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${moduloIdsSeleccionados.includes(m.id) ? "bg-[#4B5828] text-white border-[#4B5828]" : "border-neutral-200 text-neutral-600 hover:border-[#8FAD3C]"}`}>
                                    Módulo {m.nombre}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {cicloSel && (
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-neutral-600 border-t pt-3">
                        <span><b className="text-[#4B5828]">{cicloSel.cultivo || "Sin cultivo"}</b> {cicloSel.variedad && `· ${cicloSel.variedad}`}</span>
                        <span>Plantas: <b>{cicloSel.num_plantas}</b></span>
                        <span>Superficie: <b>{cicloSel.superficie_m2} m²</b></span>
                        <span>Caldo foliar: <b>{cicloSel.caldo_foliar_L} L</b></span>
                    </div>
                )}
                {moduloIdsSeleccionados.length > 1 && (
                    <div className="mt-3 flex items-start gap-2 text-xs text-[#4B5828] bg-[#C8D4A0]/30 rounded-[10px] p-2.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 bg-[#4B5828] text-white rounded-full text-[10px] font-bold flex-shrink-0">i</span>
                        <div>
                            Las cantidades mostradas en cada fila son una <b>vista previa</b> usando la configuración del primer módulo seleccionado ({primerModulo ? `Módulo ${primerModulo.nombre}` : "—"}). Al guardar, el sistema <b>recalcula automáticamente</b> la dosis y el costo de cada producto para cada módulo según su propia superficie, número de plantas y caldo foliar.
                        </div>
                    </div>
                )}
            </div>

            {/* Tabs de días para captura semanal */}
            {tipo === "semanal" && (
                <div className="mb-4 flex items-center gap-2">
                    <div className="flex flex-wrap gap-1 bg-white p-1 rounded-[10px] border border-neutral-200 flex-1">
                        {DIAS_SEMANA.map((d, i) => {
                            const dtDia = new Date(semanaInicio);
                            dtDia.setDate(dtDia.getDate() + i);
                            const count = aplicacionesPorDia[i].length;
                            return (
                                <button key={i} onClick={() => setDiaActivo(i)} data-testid={`dia-tab-${i}`}
                                    className={`flex-1 min-w-[90px] px-2 py-2 rounded-[8px] text-xs font-medium transition-colors ${diaActivo === i ? "bg-[#4B5828] text-white" : "text-[#4B5828] hover:bg-[#C8D4A0]/40"}`}>
                                    <div>{d}</div>
                                    <div className="text-[10px] opacity-80">{dtDia.toISOString().slice(5, 10)}</div>
                                    {count > 0 && <div className="text-[9px] mt-0.5">{count} aplicación(es)</div>}
                                </button>
                            );
                        })}
                    </div>
                    <button onClick={() => setCopiarOpen(true)} disabled={aplicacionesPorDia[diaActivo].length === 0} className="px-3 py-2 text-sm border border-[#8FAD3C] text-[#4B5828] rounded-[10px] hover:bg-[#C8D4A0]/20 disabled:opacity-50 flex items-center gap-1.5" data-testid="copiar-dia-btn">
                        <Copy className="w-4 h-4" />Copiar día
                    </button>
                </div>
            )}

            {/* Aplicaciones */}
            <div className="space-y-4">
                {active.map((ap, apIdx) => (
                    <div key={apIdx} className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]">
                        <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between flex-wrap gap-2">
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
                                            <td className="px-3 py-2 text-right text-neutral-700">{fmtMoney(p.precio_unitario)}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-[#4B5828]">{fmtMoney(p.costo_linea)}</td>
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
                                <span className="font-bold text-[#4B5828]">{fmtMoney(ap.productos.reduce((s, p) => s + (p.costo_linea || 0), 0))}</span>
                            </div>
                        </div>
                    </div>
                ))}

                <button onClick={addAplicacion} data-testid="add-aplicacion-btn" className="w-full py-3 border-2 border-dashed border-[#8FAD3C]/50 hover:border-[#8FAD3C] hover:bg-[#C8D4A0]/15 text-[#4B5828] rounded-[10px] flex items-center justify-center gap-2 font-medium">
                    <Plus className="w-4 h-4" />Agregar aplicación {tipo === "semanal" ? `a ${DIAS_SEMANA[diaActivo]}` : ""}
                </button>

                {/* Totales */}
                <div className="bg-[#4B5828] text-white rounded-[10px] p-5 space-y-2">
                    {tipo === "semanal" && (
                        <div className="flex items-center justify-between text-sm opacity-90">
                            <span>Total {DIAS_SEMANA[diaActivo]} (preview con {primerModulo ? `Módulo ${primerModulo.nombre}` : "—"})</span>
                            <span>{fmtMoney(totalActual)}</span>
                        </div>
                    )}
                    {moduloIdsSeleccionados.length > 1 && (
                        <div className="border-t border-white/15 pt-2 space-y-1">
                            <div className="text-[11px] uppercase tracking-wider opacity-70 font-medium mb-1">
                                Desglose por módulo (cada uno con su propia configuración)
                            </div>
                            {moduloIdsSeleccionados.map((modId) => {
                                const mod = modulos.find((m) => m.id === modId);
                                const apsToProcess = tipo === "individual" ? aplicaciones : aplicacionesPorDia.flat();
                                let tMod = 0;
                                for (const ap of apsToProcess) {
                                    const recalc = recalcProductosParaModulo(ap.productos, modId);
                                    for (const p of recalc) tMod += p.costo_linea || 0;
                                }
                                return (
                                    <div key={modId} className="flex items-center justify-between text-xs opacity-85">
                                        <span>Módulo {mod?.nombre}</span>
                                        <span>{fmtMoney(tMod)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="flex items-center justify-between border-t border-white/20 pt-2">
                        <span className="font-medium">Total final ({moduloIdsSeleccionados.length} módulo{moduloIdsSeleccionados.length !== 1 ? "s" : ""})</span>
                        <span className="font-heading text-2xl font-semibold" data-testid="total-bitacora">{fmtMoney(totalFinal)}</span>
                    </div>
                </div>
            </div>

            {/* Modal copiar día */}
            {copiarOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setCopiarOpen(false)}>
                    <div className="bg-white rounded-[10px] p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-heading font-semibold text-lg mb-4">Copiar aplicaciones de {DIAS_SEMANA[diaActivo]} a:</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {DIAS_SEMANA.map((d, i) => i === diaActivo ? null : (
                                <label key={i} className="flex items-center gap-2 p-2 border border-neutral-200 rounded-[10px] hover:bg-[#C8D4A0]/15 cursor-pointer">
                                    <input type="checkbox" checked={diasCopiar.includes(i)} onChange={(e) => setDiasCopiar(e.target.checked ? [...diasCopiar, i] : diasCopiar.filter((x) => x !== i))} />
                                    <span className="text-sm">{d}</span>
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setCopiarOpen(false)} className="px-4 py-2 text-sm border border-neutral-200 rounded-[10px]">Cancelar</button>
                            <button onClick={aplicarCopia} disabled={diasCopiar.length === 0} className="px-4 py-2 text-sm bg-[#4B5828] text-white rounded-[10px] disabled:opacity-50" data-testid="copiar-aplicar-btn">Copiar</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`.ip { width:100%; padding:.5rem .75rem; border:1px solid #e5e7eb; border-radius:10px; font-size:.875rem; background:white; }
                     .ip:focus { outline:none; border-color:#8FAD3C; box-shadow:0 0 0 1px #8FAD3C; }
                     .ip-sm { padding:.4rem .5rem; border:1px solid #e5e7eb; border-radius:8px; font-size:.8rem; background:white; }
                     .ip-sm:focus { outline:none; border-color:#8FAD3C; }`}</style>
        </AppLayout>
    );
};

export default Captura;
