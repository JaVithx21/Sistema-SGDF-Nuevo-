'use client';

import { useState, useTransition } from 'react';
import {
    MapPin,
    Navigation,
    Phone,
    Clock,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Truck,
    Loader2,
} from 'lucide-react';
import { marcarParada } from '@/app/(chofer)/mi-ruta/actions';
import { MOTIVOS_FALLO, MOTIVO_MAX_LENGTH, type EstadoParada, type ParadaChoferRow } from '@/types/rutas';

// ─── Helpers ────────────────────────────────────────────────────────────────

const ZONA_HORARIA = 'America/Santiago';

function formatHora(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: ZONA_HORARIA,
    });
}

function formatFecha(fecha: string): string {
    // Mediodía para que ningún desfase horario cambie el día
    return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: ZONA_HORARIA,
    });
}

/** Enlace de navegación: coordenadas si existen; si no, la dirección escrita. */
function urlNavegacion(p: ParadaChoferRow): string | null {
    const destino =
        p.lat !== null && p.lng !== null
            ? `${p.lat},${p.lng}`
            : p.direccion
                ? p.direccion
                : null;
    if (!destino) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
}

const ESTADO_UI: Record<EstadoParada, { label: string; className: string }> = {
    pendiente: { label: 'Pendiente', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    entregado: { label: 'Entregado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    fallido: { label: 'No entregado', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

// ─── Tarjeta de parada ──────────────────────────────────────────────────────

type Modo = 'normal' | 'confirmar_entrega' | 'fallo';

function ParadaCard({ parada, esSiguiente }: { parada: ParadaChoferRow; esSiguiente: boolean }) {
    const [modo, setModo] = useState<Modo>('normal');
    const [motivo, setMotivo] = useState<string>('');
    const [detalle, setDetalle] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const pendiente = parada.estado === 'pendiente';
    const navegar = urlNavegacion(parada);
    const estadoUi = ESTADO_UI[parada.estado];

    const cancelar = () => {
        setModo('normal');
        setMotivo('');
        setDetalle('');
        setError(null);
    };

    const guardar = (estado: 'entregado' | 'fallido', motivoFinal?: string) => {
        setError(null);
        startTransition(async () => {
            const result = await marcarParada(parada.parada_id, estado, motivoFinal);
            if (result.success) {
                cancelar();
            } else {
                setError(result.error ?? 'No se pudo guardar.');
            }
        });
    };

    const confirmarFallo = () => {
        if (!motivo) {
            setError('Elige un motivo.');
            return;
        }
        if (motivo === 'Otro' && !detalle.trim()) {
            setError('Describe el motivo.');
            return;
        }
        guardar('fallido', motivo === 'Otro' ? `Otro: ${detalle.trim()}` : motivo);
    };

    return (
        <li
            className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                esSiguiente ? 'border-[#005088] ring-2 ring-[#005088]/15' : 'border-slate-200'
            }`}
        >
            <div className="p-4 flex gap-3">
                {/* Número de parada según el orden calculado */}
                <div
                    className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-base font-black ${
                        pendiente ? 'bg-[#005088] text-white' : 'bg-slate-200 text-slate-500'
                    }`}
                    aria-label={`Parada ${parada.orden}`}
                >
                    {parada.orden}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-slate-900 leading-tight">{parada.razon_social}</p>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${estadoUi.className}`}>
                            {estadoUi.label}
                        </span>
                    </div>

                    {parada.direccion && (
                        <p className="text-sm text-slate-600 flex items-start gap-1.5">
                            <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
                            {parada.direccion}
                        </p>
                    )}

                    {parada.ventana_inicio && parada.ventana_fin && (
                        <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                            <Clock size={14} className="shrink-0" />
                            Recibe de {parada.ventana_inicio.slice(0, 5)} a {parada.ventana_fin.slice(0, 5)}
                        </p>
                    )}

                    {parada.nombre_contacto && (
                        <p className="text-xs text-slate-500">Contacto: {parada.nombre_contacto}</p>
                    )}

                    {/* Resultado ya guardado */}
                    {!pendiente && (
                        <p className="text-xs text-slate-500">
                            {parada.estado === 'entregado' ? 'Entregado' : 'Marcado como no entregado'}
                            {parada.entregado_at && ` a las ${formatHora(parada.entregado_at)}`}
                            {parada.motivo_fallo && ` · ${parada.motivo_fallo}`}
                        </p>
                    )}
                </div>
            </div>

            {pendiente && (
                <div className="px-4 pb-4 space-y-3">
                    {/* Navegar / Llamar */}
                    <div className="grid grid-cols-2 gap-2">
                        {navegar ? (
                            <a
                                href={navegar}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-[#005088] hover:bg-slate-50"
                            >
                                <Navigation size={16} />
                                Navegar
                            </a>
                        ) : (
                            <span className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-100 text-sm font-bold text-slate-300">
                                <Navigation size={16} />
                                Sin dirección
                            </span>
                        )}
                        {parada.telefono ? (
                            <a
                                href={`tel:${parada.telefono}`}
                                className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
                            >
                                <Phone size={16} />
                                Llamar
                            </a>
                        ) : (
                            <span className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-100 text-sm font-bold text-slate-300">
                                <Phone size={16} />
                                Sin teléfono
                            </span>
                        )}
                    </div>

                    {error && (
                        <p className="text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5" role="alert">
                            {error}
                        </p>
                    )}

                    {modo === 'normal' && (
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => { setError(null); setModo('confirmar_entrega'); }}
                                className="flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
                            >
                                <CheckCircle2 size={18} />
                                Entregado
                            </button>
                            <button
                                type="button"
                                onClick={() => { setError(null); setModo('fallo'); }}
                                className="flex items-center justify-center gap-2 py-3 rounded-lg bg-white border border-rose-300 text-rose-700 text-sm font-bold hover:bg-rose-50"
                            >
                                <XCircle size={18} />
                                No entregado
                            </button>
                        </div>
                    )}

                    {modo === 'confirmar_entrega' && (
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-slate-700">¿Confirmas la entrega a {parada.razon_social}?</p>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => guardar('entregado')}
                                    disabled={isPending}
                                    className="flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    {isPending ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                    Confirmar
                                </button>
                                <button
                                    type="button"
                                    onClick={cancelar}
                                    disabled={isPending}
                                    className="py-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {modo === 'fallo' && (
                        <div className="space-y-2">
                            <label htmlFor={`motivo-${parada.parada_id}`} className="block text-sm font-semibold text-slate-700">
                                ¿Por qué no se pudo entregar?
                            </label>
                            <select
                                id={`motivo-${parada.parada_id}`}
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                disabled={isPending}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[#005088]"
                            >
                                <option value="">Elige un motivo…</option>
                                {MOTIVOS_FALLO.map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                            {motivo === 'Otro' && (
                                <textarea
                                    value={detalle}
                                    onChange={(e) => setDetalle(e.target.value)}
                                    maxLength={MOTIVO_MAX_LENGTH - 'Otro: '.length}
                                    rows={2}
                                    disabled={isPending}
                                    placeholder="Describe qué pasó"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-[#005088]"
                                />
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={confirmarFallo}
                                    disabled={isPending}
                                    className="flex items-center justify-center gap-2 py-3 rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-60"
                                >
                                    {isPending ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
                                    Guardar
                                </button>
                                <button
                                    type="button"
                                    onClick={cancelar}
                                    disabled={isPending}
                                    className="py-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </li>
    );
}

// ─── Vista principal ────────────────────────────────────────────────────────

interface MiRutaClientProps {
    paradas: ParadaChoferRow[];
    /** ok | no_disponible (RPC aún no creada) | error (falló la consulta) */
    estadoCarga: 'ok' | 'no_disponible' | 'error';
}

function Aviso({ icon, titulo, texto }: { icon: React.ReactNode; titulo: string; texto: string }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-2">
            <div className="flex justify-center text-slate-400">{icon}</div>
            <p className="font-bold text-slate-800">{titulo}</p>
            <p className="text-sm text-slate-500">{texto}</p>
        </div>
    );
}

export function MiRutaClient({ paradas, estadoCarga }: MiRutaClientProps) {
    if (estadoCarga === 'no_disponible') {
        return (
            <Aviso
                icon={<AlertTriangle size={32} />}
                titulo="Tu ruta aún no está disponible"
                texto="La gestión de rutas se está habilitando. Consulta al administrador."
            />
        );
    }

    if (estadoCarga === 'error') {
        return (
            <Aviso
                icon={<AlertTriangle size={32} />}
                titulo="No pudimos cargar tu ruta"
                texto="Revisa tu conexión y recarga la página."
            />
        );
    }

    if (paradas.length === 0) {
        return (
            <Aviso
                icon={<Truck size={32} />}
                titulo="No tienes ruta asignada para hoy"
                texto="Cuando el planificador te asigne una ruta, aparecerá aquí."
            />
        );
    }

    const entregadas = paradas.filter((p) => p.estado === 'entregado').length;
    const fallidas = paradas.filter((p) => p.estado === 'fallido').length;
    const completadas = entregadas + fallidas;
    const progreso = Math.round((completadas / paradas.length) * 100);
    const siguiente = paradas.find((p) => p.estado === 'pendiente');
    const { fecha, vehiculo_patente } = paradas[0];

    return (
        <div className="space-y-4">
            {/* Resumen del día */}
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                    <h1 className="text-lg font-black text-slate-900 capitalize">{formatFecha(fecha)}</h1>
                    {vehiculo_patente && (
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{vehiculo_patente}</span>
                    )}
                </div>
                <div
                    className="h-2 bg-slate-100 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={progreso}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <div className="h-full bg-[#005088] transition-all" style={{ width: `${progreso}%` }} />
                </div>
                <p className="text-xs font-semibold text-slate-500">
                    {completadas} de {paradas.length} paradas · {entregadas} entregadas · {fallidas} no entregadas
                </p>
            </section>

            {!siguiente && (
                <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                    Ruta terminada. ¡Buen trabajo!
                </p>
            )}

            <ol className="space-y-3">
                {paradas.map((p) => (
                    <ParadaCard key={p.parada_id} parada={p} esSiguiente={p.parada_id === siguiente?.parada_id} />
                ))}
            </ol>
        </div>
    );
}
