import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export const ProtectedRoute = ({ children, adminOnly = false }) => {
    const { user, loading, isAdmin } = useAuth();
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
                <div className="text-[#4B5828] text-sm font-medium">Cargando…</div>
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
    return children;
};
