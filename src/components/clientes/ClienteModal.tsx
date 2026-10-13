'use client';

import { useState, useTransition } from 'react';
import { X, Building2, User, Phone, Mail, MapPin, CreditCard, Clock } from 'lucide-react';

interface ClienteModalProps {
    isOpen: boolean;
    onClose: () => void;
    cliente?: {
        id: number;
        razon_social: string;
        rut: string | null;
        nombre_contacto: string | null;
        telefono: string | null;
        email: string | null;
        direccion: string | null;
        activo: boolean;
        ventana_inicio?: string | null;
        ventana_fin?: string | null;
    } | null;
    onSubmit: (data: {
        razon_social: string;
        rut?: string;
        nombre_contacto?: string;
        telefono?: string;
        email?: string;
        direccion?: string;
        activo: boolean;
        ventana_inicio?: string | null;
        ventana_fin?: string | null;
    }) => Promise<{ success: boolean; error?: string }>;
}

export function ClienteModal({ isOpen, onClose, cliente, onSubmit }: ClienteModalProps) {
    const isEditing = !!cliente;
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [razonSocial, setRazonSocial] = useState(cliente?.razon_social ?? '');
    const [rut, setRut] = useState(cliente?.rut ?? '');
    const [nombreContacto, setNombreContacto] = useState(cliente?.nombre_contacto ?? '');
    const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
    const [email, setEmail] = useState(cliente?.email ?? '');
    const [direccion, setDireccion] = useState(cliente?.direccion ?? '');
    const [activo, setActivo] = useState(cliente?.activo ?? true);
    // Los <input type="time"> trabajan con "HH:MM"; la BD guarda "HH:MM:SS".
    const [ventanaInicio, setVentanaInicio] = useState(cliente?.ventana_inicio?.slice(0, 5) ?? '');
    const [ventanaFin, setVentanaFin] = useState(cliente?.ventana_fin?.slice(0, 5) ?? '');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // La ventana horaria es opcional, pero si se define debe estar completa
        // y ser coherente (mismo criterio que la constraint en BD).
        if (Boolean(ventanaInicio) !== Boolean(ventanaFin)) {
            setError('Para definir un horario de recepción debes completar ambas horas.');
            return;
        }
        if (ventanaInicio && ventanaFin && ventanaInicio >= ventanaFin) {
            setError('La hora de inicio debe ser anterior a la hora de término.');
            return;
        }

        startTransition(async () => {
            const result = await onSubmit({
                razon_social: razonSocial,
                rut: rut || undefined,
                nombre_contacto: nombreContacto || undefined,
                telefono: telefono || undefined,
                email: email || undefined,
                direccion: direccion || undefined,
                activo,
                ventana_inicio: ventanaInicio || null,
                ventana_fin: ventanaFin || null,
            });

            if (result.success) {
                onClose();
            } else {
                setError(result.error ?? 'Ocurrió un error inesperado.');
            }
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h3 className="text-xl font-black text-slate-900">
                        {isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3 rounded-lg font-medium">
                            {error}
                        </div>
                    )}

                    {/* Razón Social */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Razón Social *
                        </label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                required
                                value={razonSocial}
                                onChange={(e) => setRazonSocial(e.target.value)}
                                placeholder="Ej: Florería El Rosal S.A."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* RUT + Contacto */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                RUT
                            </label>
                            <div className="relative">
                                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    value={rut}
                                    onChange={(e) => setRut(e.target.value)}
                                    placeholder="76.452.110-K"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Nombre Contacto
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    value={nombreContacto}
                                    onChange={(e) => setNombreContacto(e.target.value)}
                                    placeholder="María González"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Teléfono + Email */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Teléfono
                            </label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="tel"
                                    value={telefono}
                                    onChange={(e) => setTelefono(e.target.value)}
                                    placeholder="+56 9 8765 4321"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="contacto@empresa.cl"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Dirección */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Dirección
                        </label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                value={direccion}
                                onChange={(e) => setDireccion(e.target.value)}
                                placeholder="Av. Las Flores 123, Santiago"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Ventana horaria de recepción (VRPTW) */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Horario de Recepción
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="time"
                                    value={ventanaInicio}
                                    onChange={(e) => setVentanaInicio(e.target.value)}
                                    aria-label="Horario desde"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="time"
                                    value={ventanaFin}
                                    onChange={(e) => setVentanaFin(e.target.value)}
                                    aria-label="Horario hasta"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-1.5">
                            Opcional. Si se define, el planificador ordenará la ruta respetando este horario.
                        </p>
                    </div>

                    {/* Estado */}
                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <input
                            type="checkbox"
                            id="cliente-activo"
                            checked={activo}
                            onChange={(e) => setActivo(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-[#005088] focus:ring-[#005088]"
                        />
                        <label htmlFor="cliente-activo" className="text-sm font-semibold text-slate-700 cursor-pointer">
                            Cliente activo (visible en el sistema)
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="px-5 py-2.5 text-sm font-bold text-white bg-[#005088] rounded-lg hover:bg-[#003d66] transition-all shadow-lg shadow-[#005088]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isPending
                                ? 'Guardando...'
                                : isEditing
                                    ? 'Guardar Cambios'
                                    : 'Crear Cliente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
