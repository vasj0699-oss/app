import React, { createContext, useContext, useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null); // null = checking, false = not auth, object = user
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem("ajvj_token");
        if (!token) {
            setUser(false);
            setLoading(false);
            return;
        }
        api.get("/auth/me")
            .then((r) => setUser(r.data))
            .catch(() => {
                localStorage.removeItem("ajvj_token");
                setUser(false);
            })
            .finally(() => setLoading(false));
    }, []);

    const login = async (email, password) => {
        try {
            const { data } = await api.post("/auth/login", { email, password });
            localStorage.setItem("ajvj_token", data.access_token);
            setUser(data.user);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: formatApiError(e) };
        }
    };

    const logout = () => {
        localStorage.removeItem("ajvj_token");
        setUser(false);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, isAdmin: user && user.rol === "admin" }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
