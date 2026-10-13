'use client';

import { useState, useTransition } from 'react';
import { Settings, Check, AlertCircle } from 'lucide-react';
import { actualizarParametro } from '@/app/(dashboard)/administracion/actions';
import type { ParametroData } from './AdministracionClient';

interface ParametrosPanelProps {
    parametros: ParametroData[];
}

/** El tipo declarado en BD decide qué control se muestra. */
function inputTypeFor(tipo: ParametroData['tipo']): string {
    switch (tipo) {
        case 'numero': return 'number';
        case 'hora': return 'time';
        default: return 'text';
    }
}

function ParametroRow({ parametro }: { parametro: ParametroData }) {
    // Los <input type="time"> trabajan con "HH:MM"; la BD puede traer "HH:MM:SS".
    const valorInicial = parametro.tipo === 'hora'
        ? parametro.valor.slice(0, 5)
        : parametro.valor;

    const [valor, setValor] = useState(valorInicial);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [guardado, setGuardado] = useState(false);

    const sinCambios = valor === valorInicial;

    const handleGuardar = () => {
        setError(null);
        setGuardado(false);
        startTransition(async () => {
            const result = await actualizarParametro(parametro.clave, valor);
            if (result.success) {
                setGuardado(true);
            } else {
                setError(result.error ?? 'No se pudo guardar.');
            }
        });
    };

    return (
        <div className="p-4 border border-slate-200 rounded-xl bg-white">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                    <p className="text-sm font-bold text-slate-800">{parametro.descripcion ?? parametro.clave}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{parametro.clave}</p>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type={inputTypeFor(parametro.tipo)}
                        value={valor}
                        onChange={(e) => {
                            setValor(e.target.value);
                            setGuardado(false);
                            setError(null);
                        }}
                        step={parametro.tipo === 'numero' ? '1' : undefined}
                        min={parametro.tipo === 'numero' ? '0' : undefined}
                        disabled={isPending}
                        className="w-36 bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                    />
                    <button
                        onClick={handleGuardar}
                        disabled={isPending || sinCambios}
                        className="px-4 py-2 text-sm font-bold text-white bg-[#005088] rounded-lg hover:bg-[#003d66] transition-all disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                        {isPending ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>

            {error && (
                <p className="mt-2 text-xs text-rose-600 font-semibold flex items-center gap-1.5">
                    <AlertCircle size={14} /> {error}
                </p>
            )}
            {guardado && (
                <p className="mt-2 text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
                    <Check size={14} /> Guardado
                </p>
            )}
        </div>
    );
}

export function ParametrosPanel({ parametros }: ParametrosPanelProps) {
    if (parametros.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Settings size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-semibold text-slate-400">No hay parámetros configurados</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="p-2 bg-white rounded-lg text-slate-600 shadow-sm">
                    <Settings size={20} />
                </div>
                <div>
                    <p className="text-sm font-bold text-slate-800">Parámetros Operacionales</p>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        Valores del negocio que cambian con el tiempo. El precio del combustible afecta
                        directamente el costo proyectado de cada ruta; los turnos por defecto se aplican a
                        los choferes que no tienen uno propio configurado.
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                {parametros.map((p) => (
                    // key por clave: reinicia el estado local si cambia el parámetro
                    <ParametroRow key={p.clave} parametro={p} />
                ))}
            </div>
        </div>
    );
}
