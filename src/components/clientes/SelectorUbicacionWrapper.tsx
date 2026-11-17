'use client';

import dynamic from 'next/dynamic';
import type { SelectorUbicacionProps } from './SelectorUbicacion';

// Leaflet usa `window` al importarse: no puede prerenderizarse en el servidor.
const SelectorUbicacionDinamico = dynamic(() => import('./SelectorUbicacion'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 animate-pulse">
            <span className="text-slate-400 text-sm font-medium">Cargando mapa...</span>
        </div>
    ),
});

export function SelectorUbicacionWrapper(props: SelectorUbicacionProps) {
    return <SelectorUbicacionDinamico {...props} />;
}
