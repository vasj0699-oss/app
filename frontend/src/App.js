import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Captura from "@/pages/Captura";
import Inventario from "@/pages/Inventario";
import Compras from "@/pages/Compras";
import Pedidos from "@/pages/Pedidos";
import Historial from "@/pages/Historial";
import Config from "@/pages/Config";
import Usuarios from "@/pages/Usuarios";
import "@/App.css";

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/captura" element={<ProtectedRoute><Captura /></ProtectedRoute>} />
                    <Route path="/inventario" element={<ProtectedRoute><Inventario /></ProtectedRoute>} />
                    <Route path="/compras" element={<ProtectedRoute><Compras /></ProtectedRoute>} />
                    <Route path="/pedidos" element={<ProtectedRoute><Pedidos /></ProtectedRoute>} />
                    <Route path="/historial" element={<ProtectedRoute><Historial /></ProtectedRoute>} />
                    <Route path="/config" element={<ProtectedRoute adminOnly><Config /></ProtectedRoute>} />
                    <Route path="/usuarios" element={<ProtectedRoute adminOnly><Usuarios /></ProtectedRoute>} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
