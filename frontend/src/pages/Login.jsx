import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Sprout, Loader2 } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_agroquim-control/artifacts/j54zw2ix_LOGOMesa%20de%20trabajo%201%20copia%2033.png";

const Login = () => {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    if (user) return <Navigate to="/dashboard" replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        const r = await login(email, password);
        setLoading(false);
        if (r.ok) navigate("/dashboard");
        else setError(r.error);
    };

    return (
        <div className="min-h-screen flex bg-[#F5F5F0]">
            {/* Left: form */}
            <div className="flex-1 flex items-center justify-center px-6 py-10">
                <div className="w-full max-w-md">
                    <div className="flex items-center gap-3 mb-8">
                        <img src={LOGO_URL} alt="AJVJ" className="w-14 h-14 rounded-md bg-[#1C1C1A] p-1" />
                        <div>
                            <div className="font-heading font-bold text-2xl text-[#4B5828] tracking-tight">AJVJ</div>
                            <div className="text-[#8FAD3C] text-xs uppercase tracking-[0.18em] font-semibold">Hidropónicos</div>
                        </div>
                    </div>

                    <div className="mb-8">
                        <div className="inline-block px-3 py-1 rounded-full bg-[#C8D4A0]/40 text-[#4B5828] text-xs font-medium uppercase tracking-wider mb-4">
                            Aplicaciones Fitosanidad
                        </div>
                        <h1 className="font-heading text-3xl md:text-4xl font-semibold text-[#1C1C1A] tracking-tight">
                            Bienvenido de vuelta
                        </h1>
                        <p className="text-sm text-neutral-600 mt-2">
                            Sistema de gestión fitosanitaria para invernaderos hidropónicos.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
                        <div>
                            <label className="block text-sm font-medium text-[#1C1C1A] mb-1.5">Correo electrónico</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                data-testid="login-email-input"
                                placeholder="admin@ajvj.com"
                                className="w-full px-3.5 py-2.5 rounded-[10px] border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#8FAD3C] focus:border-[#8FAD3C] transition-all text-[#1C1C1A]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#1C1C1A] mb-1.5">Contraseña</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                data-testid="login-password-input"
                                placeholder="••••••••"
                                className="w-full px-3.5 py-2.5 rounded-[10px] border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#8FAD3C] focus:border-[#8FAD3C] transition-all text-[#1C1C1A]"
                            />
                        </div>
                        {error && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-[10px] px-3 py-2" data-testid="login-error">{error}</div>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            data-testid="login-submit-btn"
                            className="w-full bg-[#4B5828] hover:bg-[#3d4720] disabled:opacity-60 text-white rounded-[10px] py-3 font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
                            Iniciar sesión
                        </button>
                    </form>

                    <div className="mt-8 text-xs text-neutral-500">
                        AJVJ Hidropónicos SPR DE RI DE CV — © {new Date().getFullYear()}
                    </div>
                </div>
            </div>

            {/* Right: cover */}
            <div className="hidden lg:block flex-1 relative overflow-hidden">
                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1774291981971-ec2ec7a8cd0e?crop=entropy&cs=srgb&fm=jpg&q=85')" }} />
                <div className="absolute inset-0 bg-[#4B5828]/70" />
                <div className="absolute inset-0 flex items-end p-12">
                    <div className="text-white max-w-md">
                        <div className="text-[#C8D4A0] text-xs uppercase tracking-[0.2em] font-semibold mb-3">Cuidamos cada planta</div>
                        <h2 className="font-heading text-4xl font-semibold leading-tight">
                            Gestión fitosanitaria precisa para invernaderos modernos.
                        </h2>
                        <p className="mt-4 text-[#C8D4A0]/90 text-sm leading-relaxed">
                            Bitácoras, inventario, compras, pedidos y dashboard — todo en un solo lugar.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
