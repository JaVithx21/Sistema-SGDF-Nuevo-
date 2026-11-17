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
    Banknote,
    ArrowLeftRight,
    Ban,
} from 'lucide-react';
import { marcarParada, type CobroEntrada } from '@/app/(chofer)/mi-ruta/actions';
import { componerMotivoFallo } from '@/lib/rutas/validar-estado';
import { formatearCLP, REFERENCIA_MAX_LENGTH, validarCobro, type OpcionCobro } from '@/lib/rutas/validar-cobro';
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

const OPCIONES_COBRO: { valor: OpcionCobro; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { valor: 'efectivo', label: 'Efectivo', icon: Banknote },
    { valor: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight },
    { valor: 'sin_cobro', label: 'Sin cobro', icon: Ban },
];

const ERROR_CONEXION = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.';

// ─── Tarjeta de parada ──────────────────────────────────────────────────────

type Modo = 'normal' | 'confirmar_entrega' | 'fallo';

function ParadaCard({ parada, esSiguiente }: { parada: ParadaChoferRow; esSiguiente: boolean }) {
    const porCobrar = parada.monto_por_cobrar;
    const opcionInicial: OpcionCobro = porCobrar > 0 ? 'efectivo' : 'sin_cobro';

    const [modo, setModo] = useState<Modo>('normal');
    const [motivo, setMotivo] = useState<string>('');
    const [detalle, setDetalle] = useState('');
    const [opcion, setOpcion] = useState<OpcionCobro>(opcionInicial);
    const [monto, setMonto] = useState(porCobrar > 0 ? String(porCobrar) : '');
    const [referencia, setReferencia] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const pendiente = parada.estado === 'pendiente';
    const navegar = urlNavegacion(parada);
    const estadoUi = ESTADO_UI[parada.estado];

    const cancelar = () => {
        setModo('normal');
        setMotivo('');
        setDetalle('');
        setOpcion(opcionInicial);
        setMonto(porCobrar > 0 ? String(porCobrar) : '');
        setReferencia('');
        setError(null);
    };

    const guardar = (estado: 'entregado' | 'fallido', motivoFinal?: string, cobro?: CobroEntrada) => {
        setError(null);
        // isPending deshabilita los botones: un doble toque no envía dos veces
        // (y marcar_parada rechaza la segunda de todos modos, AC-COB-04).
        startTransition(async () => {
            try {
                const result = await marcarParada(parada.parada_id, estado, motivoFinal, cobro);
                if (result.success) {
                    cancelar();
                } else {
                    setError(result.error ?? 'No se pudo guardar.');
                }
            } catch {
                // Sin conexión, la acción ni siquiera llega al servidor: nunca se
                // muestra éxito y la parada sigue pendiente (AC-COB-06).
                setError(ERROR_CONEXION);
            }
        });
    };

    const confirmarEntrega = () => {
        const cobro: CobroEntrada = {
            opcion,
            monto: monto.trim() === '' ? undefined : Number(monto),
            referencia,
        };
        const validacion = validarCobro({ ...cobro, porCobrar });
        if (!validacion.ok) {
            setError(validacion.error);
            return;
        }
        guardar('entregado', undefined, cobro);
    };

    const confirmarFallo = () => {
        const motivoFinal = componerMotivoFallo(motivo, detalle);
        if (!motivoFinal.ok) {
            setError(motivoFinal.error);
            return;
        }
        guardar('fallido', motivoFinal.valor);
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

                    {/* Lo que queda por cobrar de ESTE pedido (ADR-03) */}
                    {pendiente && porCobrar > 0 && (
                        <p className="text-sm font-bold text-[#005088] flex items-center gap-1.5">
                            <Banknote size={15} className="shrink-0" />
                            Por cobrar: {formatearCLP(porCobrar)}
                        </p>
                    )}

                    {/* Resultado ya guardado */}
                    {!pendiente && (
                        <p className="text-xs text-slate-500">
                            {parada.estado === 'entregado' ? 'Entregado' : 'Marcado como no entregado'}
                            {parada.entregado_at && ` a las ${formatHora(parada.entregado_at)}`}
                            {parada.motivo_fallo && ` · ${parada.motivo_fallo}`}
                        </p>
                    )}
                    {parada.estado === 'entregado' && porCobrar > 0 && (
                        <p className="text-xs font-semibold text-amber-700">Saldo pendiente: {formatearCLP(porCobrar)}</p>
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
                        <div className="space-y-3">
                            <p className="text-sm font-semibold text-slate-700">Entrega a {parada.razon_social}</p>

                            {/* Cobro en terreno (PBI-11.1) */}
                            {porCobrar > 0 ? (
                                <fieldset className="space-y-2" disabled={isPending}>
                                    <legend className="text-sm font-semibold text-slate-700 mb-1">
                                        ¿Cómo se cobró? <span className="text-[#005088]">Por cobrar: {formatearCLP(porCobrar)}</span>
                                    </legend>
                                    <div className="grid grid-cols-3 gap-2">
                                        {OPCIONES_COBRO.map(({ valor, label, icon: Icon }) => (
                                            <button
                                                key={valor}
                                                type="button"
                                                onClick={() => { setError(null); setOpcion(valor); }}
                                                aria-pressed={opcion === valor}
                                                className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg border text-xs font-bold ${
                                                    opcion === valor
                                                        ? 'bg-[#005088] border-[#005088] text-white'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                <Icon size={18} />
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    {opcion !== 'sin_cobro' && (
                                        <div>
                                            <label htmlFor={`monto-${parada.parada_id}`} className="block text-xs font-semibold text-slate-600 mb-1">
                                                Monto cobrado (puede ser parcial)
                                            </label>
                                            <input
                                                id={`monto-${parada.parada_id}`}
                                                type="number"
                                                inputMode="numeric"
                                                min={1}
                                                max={porCobrar}
                                                step={1}
                                                value={monto}
                                                onChange={(e) => setMonto(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#005088]"
                                            />
                                        </div>
                                    )}
                                    {opcion === 'transferencia' && (
                                        <div>
                                            <label htmlFor={`ref-${parada.parada_id}`} className="block text-xs font-semibold text-slate-600 mb-1">
                                                Referencia de la transferencia
                                            </label>
                                            <input
                                                id={`ref-${parada.parada_id}`}
                                                type="text"
                                                value={referencia}
                                                onChange={(e) => setReferencia(e.target.value)}
                                                maxLength={REFERENCIA_MAX_LENGTH}
                                                placeholder="N.º de operación o comprobante"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#005088]"
                                            />
                                        </div>
                                    )}
                                </fieldset>
                            ) : (
                                <p className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                                    Pedido sin saldo por cobrar: se entrega sin cobro.
                                </p>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={confirmarEntrega}
                                    disabled={isPending}
                                    className="flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    {isPending ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                    Confirmar entrega
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
