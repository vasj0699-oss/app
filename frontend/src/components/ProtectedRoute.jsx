import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

// Página por defecto según rol
const defaultPageForRole = (rol) => (rol === "admin" ? "/dashboard" : "/captura");

export const ProtectedRoute = ({ children, adminOnly = false, allowedRoles = null }) => {
    const { user, loading } = useAuth();
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
                <div className="text-[#4B5828] text-sm font-medium">Cargando…</div>
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (adminOnly && user.rol !== "admin") return <Navigate to={defaultPageForRole(user.rol)} replace />;
    if (allowedRoles && !allowedRoles.includes(user.rol)) return <Navigate to={defaultPageForRole(user.rol)} replace />;
    return children;
};

export { defaultPageForRole };
