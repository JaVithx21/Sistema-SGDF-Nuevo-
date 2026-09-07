'use client';

import { useState, useTransition } from 'react';
import { X, Truck, Calendar, Box, Weight, Fuel, Building2 } from 'lucide-react';
import type { VehiculoData, SucursalOption } from './AdministracionClient';

interface VehiculoModalProps {
    isOpen: boolean;
    onClose: () => void;
    vehiculo?: VehiculoData | null;
    sucursales: SucursalOption[];
    onSubmit: (data: {
        patente: string;
        modelo?: string;
        anno?: number | null;
        capacidad_vol_m3: number;
        capacidad_peso_kg?: number | null;
        rendimiento_kml: number;
        sucursal_id?: number | null;
        activo: boolean;
    }) => Promise<{ success: boolean; error?: string }>;
}

export function VehiculoModal({ isOpen, onClose, vehiculo, sucursales, onSubmit }: VehiculoModalProps) {
    const isEditing = !!vehiculo;
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [patente, setPatente] = useState(vehiculo?.patente ?? '');
    const [modelo, setModelo] = useState(vehiculo?.modelo ?? '');
    const [anno, setAnno] = useState(vehiculo?.anno?.toString() ?? '');
    const [capacidadVol, setCapacidadVol] = useState(vehiculo?.capacidad_vol_m3?.toString() ?? '');
    const [capacidadPeso, setCapacidadPeso] = useState(vehiculo?.capacidad_peso_kg?.toString() ?? '');
    const [rendimiento, setRendimiento] = useState(vehiculo?.rendimiento_kml?.toString() ?? '');
    const [sucursalId, setSucursalId] = useState<number | ''>(vehiculo?.sucursal_id ?? '');
    const [activo, setActivo] = useState(vehiculo?.activo ?? true);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        startTransition(async () => {
            const result = await onSubmit({
                patente,
                modelo: modelo || undefined,
                anno: anno ? Number(anno) : null,
                capacidad_vol_m3: Number(capacidadVol),
                capacidad_peso_kg: capacidadPeso ? Number(capacidadPeso) : null,
                rendimiento_kml: Number(rendimiento),
                sucursal_id: sucursalId === '' ? null : Number(sucursalId),
                activo,
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
                        {isEditing ? 'Editar Vehículo' : 'Nuevo Vehículo'}
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

                    {/* Patente + Modelo */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Patente *
                            </label>
                            <div className="relative">
                                <Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    required
                                    value={patente}
                                    onChange={(e) => setPatente(e.target.value.toUpperCase())}
                                    placeholder="XX-99-88"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm font-mono uppercase focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Año
                            </label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="number"
                                    value={anno}
                                    onChange={(e) => setAnno(e.target.value)}
                                    placeholder="2024"
                                    min={1950}
                                    max={new Date().getFullYear() + 1}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Modelo */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Modelo
                        </label>
                        <div className="relative">
                            <Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                value={modelo}
                                onChange={(e) => setModelo(e.target.value)}
                                placeholder="Peugeot Boxer"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Capacidades */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Capacidad Volumen (m³) *
                            </label>
                            <div className="relative">
                                <Box className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="number"
                                    required
                                    step="0.01"
                                    min="0.01"
                                    value={capacidadVol}
                                    onChange={(e) => setCapacidadVol(e.target.value)}
                                    placeholder="15"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Capacidad Peso (kg)
                            </label>
                            <div className="relative">
                                <Weight className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={capacidadPeso}
                                    onChange={(e) => setCapacidadPeso(e.target.value)}
                                    placeholder="1200"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Rendimiento + Sucursal */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Rendimiento (km/L) *
                            </label>
                            <div className="relative">
                                <Fuel className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="number"
                                    required
                                    step="0.1"
                                    min="0.1"
                                    value={rendimiento}
                                    onChange={(e) => setRendimiento(e.target.value)}
                                    placeholder="10"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Sucursal
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <select
                                    value={sucursalId}
                                    onChange={(e) => setSucursalId(e.target.value ? Number(e.target.value) : '')}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                >
                                    <option value="">Sin asignar</option>
                                    {sucursales.map((s) => (
                                        <option key={s.id} value={s.id}>{s.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <p className="text-[11px] text-slate-500 font-medium -mt-2">
                        La capacidad de volumen limita qué pedidos entran en una ruta, y el rendimiento
                        define el costo de combustible proyectado.
                    </p>

                    {/* Estado */}
                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <input
                            type="checkbox"
                            id="vehiculo-activo"
                            checked={activo}
                            onChange={(e) => setActivo(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-[#005088] focus:ring-[#005088]"
                        />
                        <label htmlFor="vehiculo-activo" className="text-sm font-semibold text-slate-700 cursor-pointer">
                            Vehículo activo (disponible para asignar a choferes y rutas)
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
                            {isPending ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Vehículo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
