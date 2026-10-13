'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { X, Mail, User, Shield } from 'lucide-react';
import type { UsuarioData } from './AdministracionClient';
import { Button } from '@/components/ui/Button';
import { USER_ROLES, ROLE_LABELS, type RolUsuario } from '@/constants/roles';

interface UsuarioModalProps {
    isOpen: boolean;
    onClose: () => void;
    usuario: UsuarioData | null;
    onSubmit: (data: { nombre: string; email: string; rol: RolUsuario }) => Promise<{ success: boolean; error?: string }>;
}

export function UsuarioModal({ isOpen, onClose, usuario, onSubmit }: UsuarioModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const nombre = String(formData.get('nombre') || '');
        const email = String(formData.get('email') || '');
        const rol = String(formData.get('rol') || 'vendedor') as RolUsuario;

        const result = await onSubmit({
            nombre,
            email,
            rol,
        });

        setIsLoading(false);

        if (result.success) {
            onClose();
        } else {
            setError(result.error || 'Ocurrió un error al guardar el usuario.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">
                        {usuario ? 'Editar Empleado' : 'Nuevo Empleado'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                        disabled={isLoading}
                    >
                        <X size={20} />
                    </button>
                </div>

                <form key={usuario?.email ?? 'nuevo'} onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700">Nombre Completo</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                name="nombre"
                                type="text"
                                required
                                defaultValue={usuario?.nombre || ''}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#005088] outline-none transition-all"
                                placeholder="Ej. Juan Pérez"
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700">Correo Electrónico</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                name="email"
                                type="email"
                                required
                                defaultValue={usuario?.email || ''}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#005088] outline-none transition-all"
                                placeholder="ejemplo@distribuidora.com"
                                disabled={isLoading}
                            />
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium">
                            Este correo será el único autorizado para que el empleado inicie sesión con Google.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700">Rol en el Sistema</label>
                        <div className="relative">
                            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <select
                                name="rol"
                                defaultValue={usuario?.rol || 'vendedor'}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-[#005088] outline-none transition-all appearance-none"
                                disabled={isLoading}
                            >
                                {USER_ROLES.map((rol) => (
                                    <option key={rol} value={rol}>
                                        {ROLE_LABELS[rol]}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                        <Button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="bg-[#005088] hover:bg-[#003d66] text-white"
                        >
                            {isLoading ? 'Guardando...' : 'Guardar Empleado'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
