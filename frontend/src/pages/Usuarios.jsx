import React, { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, Shield } from "lucide-react";

const Usuarios = () => {
    const [users, setUsers] = useState([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ email: "", password: "", nombre: "", rol: "monitor" });

    const reload = async () => {
        try { const r = await api.get("/users"); setUsers(r.data); }
        catch (e) { toast.error(formatApiError(e)); }
    };
    useEffect(() => { reload(); }, []);

    const submit = async () => {
        if (!form.email || !form.password || !form.nombre) return toast.error("Completa email, nombre y contraseña");
        try {
            await api.post("/users", form);
            toast.success("Usuario creado");
            setOpen(false);
            setForm({ email: "", password: "", nombre: "", rol: "monitor" });
            reload();
        } catch (e) { toast.error(formatApiError(e)); }
    };

    const remove = async (id) => {
        if (!confirm("¿Eliminar usuario?")) return;
        try { await api.delete(`/users/${id}`); toast.success("Usuario eliminado"); reload(); }
        catch (e) { toast.error(formatApiError(e)); }
    };

    return (
        <AppLayout
            title="Usuarios"
            subtitle="Gestión de accesos al sistema"
            actions={<button onClick={() => setOpen(true)} data-testid="new-user-btn" className="px-4 py-2 bg-[#4B5828] text-white rounded-[10px] hover:bg-[#3d4720] flex items-center gap-1.5"><Plus className="w-4 h-4" />Nuevo usuario</button>}
        >
            <div className="bg-white rounded-[10px] border border-neutral-200 shadow-[0_2px_8px_-2px_rgba(28,28,26,0.08)] overflow-auto">
                <table className="w-full text-sm">
                    <thead className="bg-[#4B5828] text-[#C8D4A0] text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Nombre</th>
                            <th className="px-4 py-3 text-left font-medium">Email</th>
                            <th className="px-4 py-3 text-left font-medium">Rol</th>
                            <th className="px-4 py-3 text-left font-medium">Creado</th>
                            <th className="px-4 py-3 text-right"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => (
                            <tr key={u.id} className="border-b border-neutral-100 hover:bg-[#C8D4A0]/15 even:bg-[#F5F5F0]/40">
                                <td className="px-4 py-2.5 font-medium flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-[#8FAD3C]" />{u.nombre}</td>
                                <td className="px-4 py-2.5">{u.email}</td>
                                <td className="px-4 py-2.5"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#C8D4A0]/40 text-[#4B5828] capitalize">{u.rol}</span></td>
                                <td className="px-4 py-2.5 text-xs text-neutral-500">{u.creado_en?.slice(0, 10)}</td>
                                <td className="px-4 py-2.5 text-right"><button onClick={() => remove(u.id)} className="text-red-600 p-1 hover:bg-red-50 rounded" data-testid={`del-user-${u.email}`}><Trash2 className="w-4 h-4" /></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {open && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
                    <div className="bg-white rounded-[10px] p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-heading font-semibold text-lg mb-4">Nuevo usuario</h3>
                        <div className="space-y-3">
                            <div><label className="text-xs font-medium">Nombre</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} data-testid="user-nombre-input" className="ip" /></div>
                            <div><label className="text-xs font-medium">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="user-email-input" className="ip" /></div>
                            <div><label className="text-xs font-medium">Contraseña</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password-input" className="ip" /></div>
                            <div><label className="text-xs font-medium">Rol</label>
                                <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} className="ip" data-testid="user-rol-select">
                                    <option value="monitor">Monitor</option>
                                    <option value="jefe">Jefe de producción</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-neutral-200 rounded-[10px]">Cancelar</button>
                            <button onClick={submit} data-testid="user-submit-btn" className="px-4 py-2 text-sm bg-[#4B5828] text-white rounded-[10px] flex items-center gap-1.5"><Save className="w-4 h-4" />Crear</button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`.ip { width:100%; padding:.5rem .75rem; border:1px solid #e5e7eb; border-radius:10px; font-size:.875rem; background:white; margin-top:4px; } .ip:focus { outline:none; border-color:#8FAD3C; box-shadow:0 0 0 1px #8FAD3C; }`}</style>
        </AppLayout>
    );
};

export default Usuarios;
