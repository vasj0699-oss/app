import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatApiError } from "@/lib/api";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
    PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { TrendingUp, ClipboardList, Package, Wallet } from "lucide-react";
import { toast } from "sonner";

const COLORS = ["#4B5828", "#8FAD3C", "#C8D4A0", "#7c8a3f", "#a8b86c", "#3d4720", "#bfd07d", "#5e6e34"];
const PERIODS = [
    { value: "all", label: "Todo el período" },
    { value: "4w", label: "Últimas 4 semanas" },
    { value: "8w", label: "Últimas 8 semanas" },
    { value: "12w", label: "Últimas 12 semanas" },
];

const fmtMoney = (v) => `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KpiCard = ({ icon: Icon, label, value, accent, testid }) => (
    <div className="bg-white rounded-[10px] border border-neutral-200 p-5 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]" data-testid={testid}>
        <div className="flex items-center justify-between">
            <div>
                <div className="text-xs uppercase tracking-wider text-neutral-500 font-medium">{label}</div>
                <div className="text-2xl font-heading font-semibold text-[#1C1C1A] mt-2">{value}</div>
            </div>
            <div className={`w-11 h-11 rounded-[10px] flex items-center justify-center ${accent}`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
        </div>
    </div>
);

const ChartCard = ({ title, children, testid }) => (
    <div className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]" data-testid={testid}>
        <div className="px-5 py-4 border-b border-neutral-100">
            <h3 className="font-heading font-semibold text-[#1C1C1A] text-base">{title}</h3>
        </div>
        <div className="p-4 h-72">{children}</div>
    </div>
);

const Dashboard = () => {
    const [period, setPeriod] = useState("all");
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const params = {};
                if (period !== "all") {
                    const days = period === "4w" ? 28 : period === "8w" ? 56 : 84;
                    const start = new Date();
                    start.setDate(start.getDate() - days);
                    params.fecha_inicio = start.toISOString().slice(0, 10);
                    params.fecha_fin = new Date().toISOString().slice(0, 10);
                }
                const { data } = await api.get("/dashboard/stats", { params });
                setStats(data);
            } catch (e) {
                toast.error(formatApiError(e));
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [period]);

    return (
        <AppLayout
            title="Dashboard"
            subtitle="Indicadores de gasto, consumo y tendencias"
            actions={
                <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    data-testid="dashboard-period-select"
                    className="px-3 py-2 rounded-[10px] border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#8FAD3C]"
                >
                    {PERIODS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
                </select>
            }
        >
            {loading || !stats ? (
                <div className="text-sm text-neutral-500">Cargando estadísticas…</div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
                        <KpiCard testid="kpi-total-gastado" icon={TrendingUp} label="Total gastado" value={fmtMoney(stats.kpis.total_gastado)} accent="bg-[#4B5828]" />
                        <KpiCard testid="kpi-aplicaciones" icon={ClipboardList} label="Aplicaciones" value={stats.kpis.aplicaciones_registradas} accent="bg-[#8FAD3C]" />
                        <KpiCard testid="kpi-productos" icon={Package} label="Productos en catálogo" value={stats.kpis.productos_catalogo} accent="bg-[#4B5828]" />
                        <KpiCard testid="kpi-valor-inventario" icon={Wallet} label="Valor inventario" value={fmtMoney(stats.kpis.valor_inventario)} accent="bg-[#8FAD3C]" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
                        <ChartCard testid="chart-costo-modulo" title="Costo por módulo">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.costo_por_modulo} layout="vertical" margin={{ left: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                    <XAxis type="number" tick={{ fill: "#737373", fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: "#1C1C1A", fontSize: 12 }} width={60} />
                                    <Tooltip formatter={(v) => fmtMoney(v)} />
                                    <Bar dataKey="value" fill="#4B5828" radius={[0, 6, 6, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard testid="chart-costo-objetivo" title="Costo por objetivo de aplicación">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.costo_por_objetivo} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                    <XAxis type="number" tick={{ fill: "#737373", fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: "#1C1C1A", fontSize: 11 }} width={120} />
                                    <Tooltip formatter={(v) => fmtMoney(v)} />
                                    <Bar dataKey="value" fill="#8FAD3C" radius={[0, 6, 6, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard testid="chart-costo-cultivo" title="Costo por cultivo">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={stats.costo_por_cultivo} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                                        {stats.costo_por_cultivo.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                                    </Pie>
                                    <Tooltip formatter={(v) => fmtMoney(v)} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard testid="chart-costo-tipo" title="Foliar / Suelo / Drench / Riego">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={stats.costo_por_tipo} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                                        {stats.costo_por_tipo.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                                    </Pie>
                                    <Tooltip formatter={(v) => fmtMoney(v)} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard testid="chart-gasto-mes" title="Gasto total por mes">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stats.costo_por_mes}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                    <XAxis dataKey="name" tick={{ fill: "#737373", fontSize: 11 }} />
                                    <YAxis tick={{ fill: "#737373", fontSize: 11 }} />
                                    <Tooltip formatter={(v) => fmtMoney(v)} />
                                    <Line type="monotone" dataKey="value" stroke="#4B5828" strokeWidth={2.5} dot={{ fill: "#8FAD3C", r: 4 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard testid="chart-top-productos" title="Top 10 productos por costo">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.top_productos_costo} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                    <XAxis type="number" tick={{ fill: "#737373", fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: "#1C1C1A", fontSize: 10 }} width={130} />
                                    <Tooltip formatter={(v) => fmtMoney(v)} />
                                    <Bar dataKey="value" fill="#4B5828" radius={[0, 6, 6, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>

                    {/* Inventario valorizado */}
                    <div className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)]" data-testid="card-inventario-valorizado">
                        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                            <h3 className="font-heading font-semibold text-[#1C1C1A]">Costo de inventario actual</h3>
                            <span className="text-sm font-semibold text-[#4B5828]">{fmtMoney(stats.kpis.valor_inventario)}</span>
                        </div>
                        <div className="overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-[#4B5828] text-[#C8D4A0] text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-medium">Producto</th>
                                        <th className="text-left px-4 py-3 font-medium">Categoría</th>
                                        <th className="text-right px-4 py-3 font-medium">Cantidad</th>
                                        <th className="text-right px-4 py-3 font-medium">P. Unitario</th>
                                        <th className="text-right px-4 py-3 font-medium">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.inventario_valorizado.length === 0 && (
                                        <tr><td colSpan="5" className="px-4 py-6 text-center text-neutral-500 text-sm">Sin productos en inventario</td></tr>
                                    )}
                                    {stats.inventario_valorizado.map((r) => (
                                        <tr key={r.producto_id} className="border-b border-neutral-100 hover:bg-[#C8D4A0]/15 even:bg-[#F5F5F0]/40">
                                            <td className="px-4 py-2.5 font-medium">{r.nombre}</td>
                                            <td className="px-4 py-2.5 text-neutral-600">{r.categoria || "—"}</td>
                                            <td className={`px-4 py-2.5 text-right ${r.cantidad < 0 ? "text-red-600 font-semibold" : ""}`}>{r.cantidad.toFixed(2)} {r.unidad}</td>
                                            <td className="px-4 py-2.5 text-right">{fmtMoney(r.precio_unitario)}</td>
                                            <td className="px-4 py-2.5 text-right font-semibold text-[#4B5828]">{fmtMoney(r.valor)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </AppLayout>
    );
};

export default Dashboard;
