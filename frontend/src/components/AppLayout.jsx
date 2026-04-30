import React from "react";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";

const AppLayout = ({ title, subtitle, actions, children }) => {
    return (
        <div className="min-h-screen bg-[#F5F5F0]">
            <Sidebar />
            <main className="md:ml-64 min-h-screen flex flex-col">
                <div className="px-6 md:px-10 py-6 md:py-8 flex-1 animate-fade-in">
                    {(title || actions) && (
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6 md:mb-8">
                            <div>
                                {title && <h1 className="font-heading text-2xl md:text-3xl font-semibold text-[#1C1C1A] tracking-tight" data-testid="page-title">{title}</h1>}
                                {subtitle && <p className="text-sm text-neutral-600 mt-1">{subtitle}</p>}
                            </div>
                            {actions && <div className="flex items-center gap-2">{actions}</div>}
                        </div>
                    )}
                    {children}
                </div>
            </main>
            <Toaster richColors position="top-right" />
        </div>
    );
};

export default AppLayout;
