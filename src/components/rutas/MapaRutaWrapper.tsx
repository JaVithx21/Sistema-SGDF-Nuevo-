'use client';

import dynamic from 'next/dynamic';
import type { MapaRutaProps } from './MapaRuta';

// Leaflet usa `window` al importarse: no puede prerenderizarse en el servidor.
// `ssr: false` solo es válido dentro de un Client Component.
const MapaRutaDinamico = dynamic(() => import('./MapaRuta'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 animate-pulse">
            <span className="text-slate-400 text-sm font-medium">Cargando mapa...</span>
        </div>
    ),
});

export function MapaRutaWrapper(props: MapaRutaProps) {
    return (
        <div className="relative w-full h-full">
            <MapaRutaDinamico {...props} />
            {/* AC-05-error: sin trazado por calles, avisar que las líneas son aproximadas */}
            {!props.geojsonRuta && props.paradas.length > 0 && (
                <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-lg shadow">
                    Trazado aproximado (líneas rectas): sin geometría por calles
                </div>
            )}
        </div>
    );
}
