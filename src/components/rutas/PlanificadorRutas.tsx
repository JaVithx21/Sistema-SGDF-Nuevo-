'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    Calendar,
    CheckCircle2,
    Clock,
    Loader2,
    MapPin,
    MapPinOff,
    Navigation,
    Route,
    Save,
    Search,
    Truck,
} from 'lucide-react';
import { calcularRuta, guardarRuta } from '@/app/(dashboard)/rutas/actions';
import { MapaRutaWrapper } from '@/components/rutas/MapaRutaWrapper';
import type {
    ChoferPlanificable,
    PedidoPlanificable,
    RutaCalculada,
    RutaGuardada,
    SucursalPlanificable,
} from '@/types/planificador';

interface Props {
    fecha: string;
    hoy: string;
    pedidos: PedidoPlanificable[];
    choferes: ChoferPlanificable[];
    sucursales: SucursalPlanificable[];
    rutas: RutaGuardada[];
}

const fmt = (n: number, dec = 2) => n.toLocaleString('es-CL', { maximumFractionDigits: dec });

function BarraCapacidad({ etiqueta, usado, capacidad, unidad }: { etiqueta: string; usado: number; capacidad: number | null; unidad: string }) {
    if (capacidad === null) {
        return <p className="text-xs text-slate-400">{etiqueta}: {fmt(usado)} {unidad} (vehículo sin capacidad registrada)</p>;
    }
    const pct = capacidad > 0 ? (usado / capacidad) * 100 : 0;
    const excedido = pct > 100;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-slate-500">{etiqueta}</span>
                <span className={`font-semibold ${excedido ? 'text-rose-600' : 'text-slate-700'}`}>
                    {fmt(usado)} / {fmt(capacidad)} {unidad}
                </span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${excedido ? 'bg-rose-500' : pct > 75 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                />
            </div>
        </div>
    );
}

function Dato({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
    return (
        <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">{titulo}</p>
            <p className="text-xl font-black text-slate-900">{valor}</p>
            {nota && <p className="text-[10px] text-slate-400">{nota}</p>}
        </div>
    );
}

export function PlanificadorRutas({ fecha, hoy, pedidos, choferes, sucursales, rutas }: Props) {
    const router = useRouter();
    const [choferId, setChoferId] = useState<number | ''>('');
    const [sucursalId, setSucursalId] = useState<number | ''>(
        sucursales.find((s) => s.esDeposito)?.id ?? sucursales[0]?.id ?? ''
    );
    const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
    const [filtro, setFiltro] = useState('');
    const [ruta, setRuta] = useState<RutaCalculada | null>(null);
    const [rutaVistaId, setRutaVistaId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [exito, setExito] = useState<string | null>(null);
    const [calculando, startCalculo] = useTransition();
    const [guardando, startGuardado] = useTransition();

    const chofer = choferes.find((c) => c.id === choferId) ?? null;
    const sucursal = sucursales.find((s) => s.id === sucursalId) ?? null;
    const esPasada = fecha < hoy;

    const conUbicacion = pedidos.filter((p) => p.conUbicacion);
    const sinUbicacion = pedidos.filter((p) => !p.conUbicacion);
    const filtrados = conUbicacion.filter((p) => {
        const q = filtro.trim().toLowerCase();
        return !q || p.clienteNombre.toLowerCase().includes(q) || (p.direccion ?? '').toLowerCase().includes(q) || String(p.id).includes(q);
    });

    const totales = useMemo(() => {
        let volumen = 0;
        let peso = 0;
        for (const p of pedidos) {
            if (seleccion.has(p.id)) {
                volumen += p.volumenM3;
                peso += p.pesoKg;
            }
        }
        return { volumen, peso };
    }, [pedidos, seleccion]);

    const sinMedidas = pedidos.some((p) => seleccion.has(p.id) && p.sinMedidas);

    // ─── Datos del mapa (memorizados: si cambian, Leaflet redibuja todo) ────
    const rutaVista = rutas.find((r) => r.id === rutaVistaId) ?? null;
    const mapa = useMemo(() => {
        if (ruta && sucursal) {
            return {
                deposito: { lat: sucursal.lat, lng: sucursal.lng, nombre: sucursal.nombre },
                paradas: ruta.paradas.map((p) => ({ orden: p.orden, lat: p.lat, lng: p.lng, clienteNombre: p.clienteNombre })),
                geojsonRuta: ruta.geojsonRuta,
            };
        }
        if (rutaVista?.deposito) {
            return {
                deposito: rutaVista.deposito,
                paradas: rutaVista.paradas
                    .filter((p) => p.lat !== null && p.lng !== null)
                    .map((p) => ({ orden: p.orden, lat: p.lat as number, lng: p.lng as number, clienteNombre: p.clienteNombre, estado: p.estado })),
                geojsonRuta: rutaVista.geojsonRuta,
            };
        }
        return null;
    }, [ruta, sucursal, rutaVista]);

    const limpiarMensajes = () => {
        setError(null);
        setExito(null);
    };

    const invalidar = () => {
        setRuta(null);
        limpiarMensajes();
    };

    const alternar = (id: number) => {
        setSeleccion((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        invalidar();
    };

    const alternarTodos = () => {
        const todosMarcados = filtrados.length > 0 && filtrados.every((p) => seleccion.has(p.id));
        setSeleccion(todosMarcados ? new Set() : new Set(filtrados.map((p) => p.id)));
        invalidar();
    };

    const cambiarFecha = (nueva: string) => {
        invalidar();
        setRutaVistaId(null);
        router.push(`/rutas?fecha=${nueva}`);
    };

    const handleCalcular = () => {
        limpiarMensajes();
        if (!chofer) return setError('Selecciona un chofer.');
        if (!chofer.vehiculo) return setError('Ese chofer no tiene vehículo asignado (Administración → Choferes).');
        if (!sucursal) return setError('Selecciona el punto de origen.');
        if (seleccion.size === 0) return setError('Selecciona al menos un pedido.');
        setRutaVistaId(null);
        startCalculo(async () => {
            const res = await calcularRuta({ sucursalId: sucursal.id, choferId: chofer.id, pedidoIds: [...seleccion] });
            if (res.success) setRuta(res.data);
            else setError(res.error);
        });
    };

    const handleGuardar = () => {
        if (!ruta || !chofer || !sucursal) return;
        limpiarMensajes();
        startGuardado(async () => {
            const res = await guardarRuta({ fecha, sucursalId: sucursal.id, choferId: chofer.id, ruta });
            if (res.success) {
                setExito(`Ruta #${res.data.rutaId} guardada y asignada a ${chofer.nombre}.${fecha === hoy ? ' El chofer ya la ve en "Mi ruta".' : ''}`);
                setRuta(null);
                setSeleccion(new Set());
                setRutaVistaId(res.data.rutaId);
                router.refresh();
            } else {
                setError(res.error);
            }
        });
    };

    return (
        <div className="space-y-5">
            {/* ─── Encabezado ─────────────────────────────────────────── */}
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Planificación de Rutas</h2>
                    <p className="text-slate-500 mt-1">
                        Calcula el orden de entrega con OpenRouteService respetando la capacidad del furgón y los horarios de recepción.
                    </p>
                </div>
                <label className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="date"
                        value={fecha}
                        min={hoy}
                        onChange={(e) => e.target.value && cambiarFecha(e.target.value)}
                        className="pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#005088]"
                    />
                </label>
            </div>

            {error && (
                <p className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm" role="alert">
                    <AlertTriangle size={16} className="shrink-0" /> {error}
                </p>
            )}
            {exito && (
                <p className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
                    <CheckCircle2 size={16} className="shrink-0" /> {exito}
                </p>
            )}

            <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
                {/* ─── Columna izquierda: asignación ───────────────────── */}
                <div className="space-y-4">
                    <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <label className="block space-y-1.5">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Truck size={14} className="text-[#005088]" /> Chofer
                            </span>
                            <select
                                value={choferId}
                                onChange={(e) => { setChoferId(e.target.value ? Number(e.target.value) : ''); invalidar(); }}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#005088]"
                            >
                                <option value="">Seleccionar chofer...</option>
                                {choferes.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nombre} {c.vehiculo ? `— ${c.vehiculo.patente}` : '(sin vehículo)'}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {chofer?.vehiculo && (
                            <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                <Clock size={12} />
                                Turno {chofer.turnoInicio?.slice(0, 5) ?? 'por defecto'}
                                {chofer.turnoFin ? `–${chofer.turnoFin.slice(0, 5)}` : ''} · {chofer.vehiculo.modelo ?? chofer.vehiculo.patente}
                            </p>
                        )}

                        <label className="block space-y-1.5">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <MapPin size={14} className="text-[#005088]" /> Punto de origen
                            </span>
                            <select
                                value={sucursalId}
                                onChange={(e) => { setSucursalId(e.target.value ? Number(e.target.value) : ''); invalidar(); }}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#005088]"
                            >
                                <option value="">Seleccionar sucursal...</option>
                                {sucursales.map((s) => (
                                    <option key={s.id} value={s.id}>{s.nombre}{s.esDeposito ? ' (depósito)' : ''}</option>
                                ))}
                            </select>
                        </label>

                        {chofer?.vehiculo && (
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                                <BarraCapacidad etiqueta="Volumen" usado={totales.volumen} capacidad={chofer.vehiculo.capacidadM3} unidad="m³" />
                                <BarraCapacidad etiqueta="Peso" usado={totales.peso} capacidad={chofer.vehiculo.capacidadKg} unidad="kg" />
                                {sinMedidas && (
                                    <p className="text-[11px] text-amber-700">Algún producto no tiene volumen o peso cargado; se contó como 0.</p>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-800 text-sm">
                                Pedidos por planificar <span className="ml-1 bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{conUbicacion.length}</span>
                            </h3>
                            <button onClick={alternarTodos} className="text-xs text-[#005088] hover:underline font-semibold">
                                {filtrados.length > 0 && filtrados.every((p) => seleccion.has(p.id)) ? 'Quitar todos' : 'Seleccionar todos'}
                            </button>
                        </div>

                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                                placeholder="Filtrar por cliente, dirección o N°..."
                                value={filtro}
                                onChange={(e) => setFiltro(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#005088]/30"
                            />
                        </div>

                        <ul className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                            {filtrados.length === 0 ? (
                                <li className="text-sm text-slate-400 text-center py-6">No hay pedidos con ubicación pendientes de ruta.</li>
                            ) : (
                                filtrados.map((p) => (
                                    <li key={p.id}>
                                        <label
                                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                                seleccion.has(p.id) ? 'border-[#005088] bg-blue-50' : 'border-slate-100 hover:border-slate-300'
                                            }`}
                                        >
                                            <input type="checkbox" checked={seleccion.has(p.id)} onChange={() => alternar(p.id)} className="mt-1 accent-[#005088]" />
                                            <span className="flex-1 min-w-0">
                                                <span className="flex justify-between gap-2">
                                                    <span className="text-sm font-bold text-slate-800 truncate">{p.clienteNombre}</span>
                                                    <span className="text-[10px] font-mono text-slate-500">#{p.id}</span>
                                                </span>
                                                <span className="block text-xs text-slate-500 truncate">{p.direccion ?? 'Sin dirección'}</span>
                                                <span className="flex gap-2 flex-wrap mt-1 text-[10px] font-semibold text-slate-500">
                                                    <span>{fmt(p.volumenM3, 3)} m³ · {fmt(p.pesoKg, 1)} kg</span>
                                                    {p.ventanaInicio && p.ventanaFin && (
                                                        <span className="bg-blue-100 text-blue-700 px-1.5 rounded-full">
                                                            {p.ventanaInicio.slice(0, 5)}–{p.ventanaFin.slice(0, 5)}
                                                        </span>
                                                    )}
                                                    <span className="uppercase">{p.estado}</span>
                                                </span>
                                            </span>
                                        </label>
                                    </li>
                                ))
                            )}
                        </ul>

                        {sinUbicacion.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-xs">
                                <p className="font-bold flex items-center gap-1.5"><MapPinOff size={13} /> Sin ubicación ({sinUbicacion.length})</p>
                                <p>No se pueden rutear hasta corregir la dirección del cliente: {sinUbicacion.map((p) => `#${p.id} ${p.clienteNombre}`).join(' · ')}</p>
                            </div>
                        )}

                        <button
                            onClick={handleCalcular}
                            disabled={calculando || seleccion.size === 0 || esPasada}
                            className="w-full py-3 bg-[#005088] hover:bg-[#003d66] disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold flex items-center justify-center gap-2"
                        >
                            {calculando ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={18} />}
                            {calculando ? 'Calculando con OpenRouteService...' : `Calcular ruta óptima (${seleccion.size} paradas)`}
                        </button>
                        {esPasada && <p className="text-xs text-slate-500 text-center">La fecha seleccionada ya pasó: solo consulta.</p>}
                    </section>
                </div>

                {/* ─── Columna derecha: mapa y resultado ───────────────── */}
                <div className="space-y-4 min-w-0">
                    <div className="h-[440px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                        {calculando ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 animate-pulse">
                                <Route size={44} />
                                <p className="font-medium">Calculando la ruta...</p>
                            </div>
                        ) : mapa ? (
                            <MapaRutaWrapper deposito={mapa.deposito} paradas={mapa.paradas} geojsonRuta={mapa.geojsonRuta} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                                <Route size={44} />
                                <p className="font-medium">Selecciona pedidos y calcula la ruta, o elige una ruta guardada.</p>
                            </div>
                        )}
                    </div>

                    {ruta && (
                        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            {ruta.advertencias.length > 0 && (
                                <div className={`px-5 py-3 text-sm space-y-1 border-b ${ruta.simulada ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>
                                    {ruta.advertencias.map((a, i) => (
                                        <p key={i} className="flex items-start gap-2">
                                            <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {a}
                                        </p>
                                    ))}
                                </div>
                            )}

                            <div className="px-5 py-4 grid grid-cols-3 sm:grid-cols-6 gap-3 border-b border-slate-100">
                                <Dato titulo="Paradas" valor={String(ruta.paradas.length)} />
                                <Dato titulo="Distancia" valor={`${fmt(ruta.kmTotal, 1)} km`} nota={ruta.simulada ? 'estimada' : 'por calles'} />
                                <Dato titulo="Duración" valor={`${ruta.duracionMin} min`} />
                                <Dato titulo="Carga" valor={`${fmt(ruta.volumenTotalM3)} m³`} nota={`${fmt(ruta.pesoTotalKg, 0)} kg`} />
                                <Dato titulo="Combustible" valor={ruta.litrosEstimados !== null ? `${fmt(ruta.litrosEstimados, 1)} L` : '—'} />
                                <Dato
                                    titulo="Costo est."
                                    valor={ruta.costoCombustibleClp !== null ? `$${ruta.costoCombustibleClp.toLocaleString('es-CL')}` : '—'}
                                    nota={`$${ruta.precioLitroReferencia.toLocaleString('es-CL')}/L`}
                                />
                            </div>

                            <ol className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
                                {ruta.paradas.map((p) => (
                                    <li key={p.pedidoId} className="px-5 py-2.5 flex items-center gap-3">
                                        <span className="w-7 h-7 shrink-0 rounded-full bg-[#005088] text-white text-xs font-black flex items-center justify-center">{p.orden}</span>
                                        <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">#{p.pedidoId} · {p.clienteNombre}</span>
                                        {p.kmAcumulados !== null && <span className="text-xs text-slate-500">{fmt(p.kmAcumulados, 1)} km</span>}
                                        {p.llegada && <span className="text-xs font-semibold text-slate-600">≈ {p.llegada}</span>}
                                    </li>
                                ))}
                            </ol>

                            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${ruta.simulada ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {ruta.simulada ? 'Ruta simulada (respaldo local)' : 'Ruta optimizada con OpenRouteService'}
                                </span>
                                <button
                                    onClick={handleGuardar}
                                    disabled={guardando || ruta.paradas.length === 0}
                                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-bold flex items-center gap-2"
                                >
                                    {guardando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                    Guardar y asignar al chofer
                                </button>
                            </div>
                        </section>
                    )}

                    {/* ─── Rutas guardadas de la fecha ─────────────────── */}
                    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                        <h3 className="text-sm font-bold text-slate-800 mb-3">Rutas del {fecha.split('-').reverse().join('-')} ({rutas.length})</h3>
                        {rutas.length === 0 ? (
                            <p className="text-sm text-slate-400">No hay rutas guardadas para esta fecha.</p>
                        ) : (
                            <ul className="space-y-2">
                                {rutas.map((r) => {
                                    const entregadas = r.paradas.filter((p) => p.estado === 'entregado').length;
                                    const fallidas = r.paradas.filter((p) => p.estado === 'fallido').length;
                                    const activa = rutaVistaId === r.id && !ruta;
                                    return (
                                        <li key={r.id}>
                                            <button
                                                onClick={() => { setRuta(null); setRutaVistaId(r.id); }}
                                                className={`w-full text-left p-3 rounded-lg border flex items-center justify-between gap-3 transition-all ${
                                                    activa ? 'border-[#005088] bg-blue-50' : 'border-slate-100 bg-slate-50 hover:border-slate-300'
                                                }`}
                                            >
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-semibold text-slate-800 truncate">
                                                        #{r.id} · {r.choferNombre}{r.patente ? ` · ${r.patente}` : ''}
                                                    </span>
                                                    <span className="block text-xs text-slate-500">
                                                        {r.paradas.length} paradas{r.kmPlanificados !== null ? ` · ${fmt(r.kmPlanificados, 1)} km` : ''}
                                                        {r.simulada ? ' · simulada' : ''}
                                                    </span>
                                                </span>
                                                <span className="text-xs font-semibold text-right shrink-0">
                                                    <span className="text-emerald-700">{entregadas} entregadas</span>
                                                    {fallidas > 0 && <span className="text-rose-600"> · {fallidas} fallidas</span>}
                                                    <span className="block text-slate-500">{r.paradas.length - entregadas - fallidas} pendientes</span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {/* Detalle de la ruta seleccionada: lo que registró el chofer (SE-03, F-06) */}
                        {rutaVista && !ruta && (
                            <div className="mt-4 border-t border-slate-100 pt-4">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    Detalle de la ruta #{rutaVista.id}
                                </h4>
                                <ol className="space-y-1.5">
                                    {rutaVista.paradas.map((p) => (
                                        <li key={p.orden} className="flex items-start gap-3 text-sm">
                                            <span className="w-6 h-6 shrink-0 rounded-full bg-slate-200 text-slate-700 text-xs font-black flex items-center justify-center">
                                                {p.orden}
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className="font-semibold text-slate-800">{p.clienteNombre}</span>
                                                {p.estado === 'fallido' && (
                                                    <span className="block text-xs text-rose-700">Motivo: {p.motivoFallo ?? 'sin motivo registrado'}</span>
                                                )}
                                            </span>
                                            <span
                                                className={`shrink-0 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                                    p.estado === 'entregado'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : p.estado === 'fallido'
                                                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                                }`}
                                            >
                                                {p.estado === 'entregado' ? 'Entregado' : p.estado === 'fallido' ? 'No entregado' : 'Pendiente'}
                                                {p.marcadaEn &&
                                                    ` · ${new Date(p.marcadaEn).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })}`}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
