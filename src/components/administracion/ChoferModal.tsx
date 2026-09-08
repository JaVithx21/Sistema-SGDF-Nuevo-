'use client';

import { useState, useTransition } from 'react';
import { X, User, CreditCard, Phone, Truck, IdCard, AlertCircle, Clock } from 'lucide-react';
import type { ChoferData, UsuarioChoferOption, VehiculoOption } from './AdministracionClient';

interface ChoferModalProps {
    isOpen: boolean;
    onClose: () => void;
    chofer?: ChoferData | null;
    /** Usuarios con rol 'chofer' disponibles para vincular (sin perfil previo). */
    usuariosDisponibles: UsuarioChoferOption[];
    vehiculos: VehiculoOption[];
    /** Turno global aplicado cuando el chofer no define uno propio. */
    turnoDefecto: { inicio: string; fin: string };
    onSubmit: (data: {
        usuario_id: string;
        nombre_completo: string;
        rut?: string;
        licencia_clase?: string;
        telefono?: string;
        vehiculo_default_id?: number | null;
        activo: boolean;
        turno_inicio?: string | null;
        turno_fin?: string | null;
    }) => Promise<{ success: boolean; error?: string }>;
}

/** Clases de licencia profesional chilena aplicables al reparto. */
const CLASES_LICENCIA = ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C'];

export function ChoferModal({
    isOpen,
    onClose,
    chofer,
    usuariosDisponibles,
    vehiculos,
    turnoDefecto,
    onSubmit,
}: ChoferModalProps) {
    const isEditing = !!chofer;
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [usuarioId, setUsuarioId] = useState(chofer?.usuario_id ?? '');
    const [nombreCompleto, setNombreCompleto] = useState(chofer?.nombre_completo ?? '');
    const [rut, setRut] = useState(chofer?.rut ?? '');
    const [licenciaClase, setLicenciaClase] = useState(chofer?.licencia_clase ?? '');
    const [telefono, setTelefono] = useState(chofer?.telefono ?? '');
    const [vehiculoId, setVehiculoId] = useState<number | ''>(chofer?.vehiculo_default_id ?? '');
    const [activo, setActivo] = useState(chofer?.activo ?? true);
    // Vacío = sin turno propio; se aplica el turno por defecto del sistema.
    const [turnoInicio, setTurnoInicio] = useState(chofer?.turno_inicio?.slice(0, 5) ?? '');
    const [turnoFin, setTurnoFin] = useState(chofer?.turno_fin?.slice(0, 5) ?? '');

    if (!isOpen) return null;

    // Al editar, el usuario ya vinculado debe seguir siendo seleccionable.
    const opcionesUsuario = isEditing && chofer
        ? [
            ...usuariosDisponibles.filter((u) => u.id !== chofer.usuario_id),
            { id: chofer.usuario_id, nombre: chofer.usuario_nombre, email: chofer.usuario_email },
        ].sort((a, b) => a.nombre.localeCompare(b.nombre))
        : usuariosDisponibles;

    const sinUsuariosDisponibles = opcionesUsuario.length === 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!usuarioId) {
            setError('Selecciona el usuario del sistema al que pertenece este chofer.');
            return;
        }

        // Mismo criterio que la constraint chk_choferes_turno_valido en BD.
        if (Boolean(turnoInicio) !== Boolean(turnoFin)) {
            setError('Para definir un turno propio debes completar ambas horas.');
            return;
        }
        if (turnoInicio && turnoFin && turnoInicio >= turnoFin) {
            setError('La hora de inicio del turno debe ser anterior a la de término.');
            return;
        }

        startTransition(async () => {
            const result = await onSubmit({
                usuario_id: usuarioId,
                nombre_completo: nombreCompleto,
                rut: rut || undefined,
                licencia_clase: licenciaClase || undefined,
                telefono: telefono || undefined,
                vehiculo_default_id: vehiculoId === '' ? null : Number(vehiculoId),
                activo,
                turno_inicio: turnoInicio || null,
                turno_fin: turnoFin || null,
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
                        {isEditing ? 'Editar Perfil de Chofer' : 'Nuevo Perfil de Chofer'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3 rounded-lg font-medium">
                            {error}
                        </div>
                    )}

                    {sinUsuariosDisponibles && !isEditing && (
                        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-lg">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <span className="font-medium">
                                No hay usuarios con rol &quot;Chofer&quot; sin perfil. Primero asigna ese rol a un
                                empleado en la pestaña <strong>Usuarios y Accesos</strong>.
                            </span>
                        </div>
                    )}

                    {/* Usuario vinculado */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Usuario del Sistema *
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <select
                                required
                                value={usuarioId}
                                onChange={(e) => {
                                    setUsuarioId(e.target.value);
                                    // Prellenar el nombre operacional con el del usuario elegido
                                    const u = opcionesUsuario.find((o) => o.id === e.target.value);
                                    if (u && !nombreCompleto) setNombreCompleto(u.nombre);
                                }}
                                disabled={sinUsuariosDisponibles}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all disabled:opacity-60"
                            >
                                <option value="">Seleccionar usuario con rol Chofer...</option>
                                {opcionesUsuario.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.nombre} {u.email ? `— ${u.email}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-1.5">
                            Es la cuenta con la que iniciará sesión para ver su ruta del día en /mi-ruta.
                        </p>
                    </div>

                    {/* Nombre completo */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Nombre Completo *
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                required
                                value={nombreCompleto}
                                onChange={(e) => setNombreCompleto(e.target.value)}
                                placeholder="Ej: Javier Catalán Zúñiga"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* RUT + Teléfono */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">RUT</label>
                            <div className="relative">
                                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    value={rut}
                                    onChange={(e) => setRut(e.target.value)}
                                    placeholder="12.345.678-9"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Teléfono</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="tel"
                                    value={telefono}
                                    onChange={(e) => setTelefono(e.target.value)}
                                    placeholder="+56 9 1234 5678"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Licencia + Vehículo */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Clase de Licencia
                            </label>
                            <div className="relative">
                                <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <select
                                    value={licenciaClase}
                                    onChange={(e) => setLicenciaClase(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                >
                                    <option value="">Sin especificar</option>
                                    {CLASES_LICENCIA.map((c) => (
                                        <option key={c} value={c}>Clase {c}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Vehículo Asignado
                            </label>
                            <div className="relative">
                                <Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <select
                                    value={vehiculoId}
                                    onChange={(e) => setVehiculoId(e.target.value ? Number(e.target.value) : '')}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                >
                                    <option value="">Sin vehículo</option>
                                    {vehiculos.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.patente}{v.modelo ? ` — ${v.modelo}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium -mt-2">
                        Sin vehículo asignado no se le podrán guardar rutas desde el planificador.
                    </p>

                    {/* Turno laboral — acota la ventana de trabajo en el optimizador */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Turno Laboral
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="time"
                                    value={turnoInicio}
                                    onChange={(e) => setTurnoInicio(e.target.value)}
                                    aria-label="Turno desde"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="time"
                                    value={turnoFin}
                                    onChange={(e) => setTurnoFin(e.target.value)}
                                    aria-label="Turno hasta"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-1.5">
                            Opcional. Si se deja vacío se usa el turno por defecto del sistema
                            ({turnoDefecto.inicio}–{turnoDefecto.fin}), configurable en la pestaña Parámetros.
                        </p>
                    </div>

                    {/* Estado */}
                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <input
                            type="checkbox"
                            id="chofer-activo"
                            checked={activo}
                            onChange={(e) => setActivo(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-[#005088] focus:ring-[#005088]"
                        />
                        <label htmlFor="chofer-activo" className="text-sm font-semibold text-slate-700 cursor-pointer">
                            Chofer activo (disponible para asignar rutas)
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
                            disabled={isPending || (sinUsuariosDisponibles && !isEditing)}
                            className="px-5 py-2.5 text-sm font-bold text-white bg-[#005088] rounded-lg hover:bg-[#003d66] transition-all shadow-lg shadow-[#005088]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isPending ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Chofer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
