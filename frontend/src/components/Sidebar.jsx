import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
    LayoutDashboard, FilePlus, Boxes, ShoppingCart, FileText,
    History, Settings, Users, LogOut, Menu, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AjvjMark } from "@/components/AjvjLogo";
import { api } from "@/lib/api";

// Navegación por rol
// admin: todo
// monitor: Captura, Inventario, Compras, Pedidos, Historial
// jefe: Captura, Inventario, Compras, Pedidos, Historial
const NAV = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard", roles: ["admin"] },
    { to: "/captura", label: "Captura", icon: FilePlus, testid: "nav-captura", roles: ["admin", "monitor", "jefe"] },
    { to: "/inventario", label: "Inventario", icon: Boxes, testid: "nav-inventario", roles: ["admin", "monitor", "jefe"] },
    { to: "/compras", label: "Compras", icon: ShoppingCart, testid: "nav-compras", roles: ["admin", "monitor", "jefe"] },
    { to: "/pedidos", label: "Pedidos", icon: FileText, testid: "nav-pedidos", roles: ["admin", "monitor", "jefe"] },
    { to: "/historial", label: "Historial", icon: History, testid: "nav-historial", roles: ["admin", "monitor", "jefe"] },
    { to: "/config", label: "Configuración", icon: Settings, testid: "nav-config", roles: ["admin"] },
    { to: "/usuarios", label: "Usuarios", icon: Users, testid: "nav-usuarios", roles: ["admin"] },
];

const NavItem = ({ to, label, Icon, testid, onClick, badge }) => (
    <NavLink
        to={to}
        data-testid={testid}
        onClick={onClick}
        className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 rounded-[10px] text-sm font-medium transition-colors ${
                isActive
                    ? "bg-[#8FAD3C] text-white shadow-sm"
                    : "text-[#C8D4A0] hover:bg-white/5 hover:text-white"
            }`
        }
    >
        <Icon className="w-[18px] h-[18px]" />
        <span className="flex-1">{label}</span>
        {badge > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {badge}
            </span>
        )}
    </NavLink>
);

const SidebarBody = ({ onItemClick, alertasCount }) => {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    const nav = NAV.filter((n) => n.roles.includes(user?.rol));

    return (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="px-5 pt-6 pb-5 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <AjvjMark size={44} color="#C8D4A0" />
                    <div className="leading-tight">
                        <div className="font-heading font-extrabold text-white text-xl tracking-wide">AJVJ</div>
                        <div className="text-[#8FAD3C] text-[10px] uppercase tracking-[0.2em] font-bold mt-0.5">Hidropónicos</div>
                    </div>
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-[0.12em] text-white/60 font-medium">
                    Aplicaciones Fitosanidad
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {nav.map((n) => (
                    <NavItem
                        key={n.to}
                        to={n.to}
                        label={n.label}
                        Icon={n.icon}
                        testid={n.testid}
                        onClick={onItemClick}
                        badge={isAdmin && n.to === "/dashboard" ? alertasCount : 0}
                    />
                ))}
            </nav>

            {/* User */}
            <div className="px-4 py-4 border-t border-white/10">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-[#8FAD3C] flex items-center justify-center text-white font-semibold text-sm">
                        {user?.nombre?.[0]?.toUpperCase() || "U"}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white truncate" data-testid="sidebar-user-name">{user?.nombre}</div>
                        <div className="text-xs text-[#C8D4A0]/70 capitalize">{user?.rol}</div>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    data-testid="logout-btn"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-[10px] text-sm bg-white/5 text-[#C8D4A0] hover:bg-white/10 hover:text-white transition-colors"
                >
                    <LogOut className="w-4 h-4" /> Cerrar sesión
                </button>
            </div>
        </div>
    );
};

const Sidebar = () => {
    const { isAdmin } = useAuth();
    const [open, setOpen] = useState(false);
    const [alertas, setAlertas] = useState(0);

    useEffect(() => {
        if (!isAdmin) return;
        const load = async () => {
            try {
                const r = await api.get("/inventario/ajustes/pendientes");
                setAlertas(r.data.length);
            } catch { /* silent */ }
        };
        load();
        const t = setInterval(load, 60000); // refresh cada minuto
        return () => clearInterval(t);
    }, [isAdmin]);

    return (
        <>
            {/* Mobile top bar */}
            <header className="md:hidden sticky top-0 z-40 bg-[#4B5828] text-white px-4 py-3 flex items-center justify-between shadow">
                <div className="flex items-center gap-2">
                    <AjvjMark size={28} color="#C8D4A0" />
                    <span className="font-heading font-bold">AJVJ Hidropónicos</span>
                </div>
                <button
                    onClick={() => setOpen(true)}
                    data-testid="mobile-menu-toggle"
                    className="p-2 rounded-md hover:bg-white/10"
                >
                    <Menu className="w-5 h-5" />
                </button>
            </header>

            {/* Desktop sidebar */}
            <aside className="hidden md:flex w-64 fixed left-0 top-0 h-screen bg-[#4B5828] z-40">
                <SidebarBody alertasCount={alertas} />
            </aside>

            {/* Mobile drawer */}
            {open && (
                <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
                    <aside
                        className="absolute left-0 top-0 h-full w-72 bg-[#4B5828] shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setOpen(false)}
                            className="absolute top-4 right-4 text-[#C8D4A0] hover:text-white z-10"
                            data-testid="mobile-menu-close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <SidebarBody onItemClick={() => setOpen(false)} alertasCount={alertas} />
                    </aside>
                </div>
            )}
        </>
    );
};

export default Sidebar;
