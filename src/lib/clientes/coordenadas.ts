// Coordenadas de un cliente al crearlo o editarlo (PBI-01, PBI-01.1).
// Lógica pura: el geocodificador se inyecta para poder probarla sin red.

import { dentroDeZona } from '@/lib/zona-operacion';

export interface Coordenadas {
    lat: number;
    lng: number;
}

export type ResolucionCoordenadas =
    /** `cambia: false` = no tocar lat/lng en la BD (se conservan las actuales). */
    | { ok: true; coords: Coordenadas | null; cambia: boolean }
    | { ok: false; error: string };

interface Entrada {
    /** Ubicación fijada a mano en el mapa; llega del navegador, no es confiable. */
    manual?: unknown;
    cambioDireccion: boolean;
    direccion: string | null;
    geocodificar: (direccion: string | null) => Promise<Coordenadas | null>;
}

function leerUbicacion(valor: unknown): Coordenadas | null {
    if (typeof valor !== 'object' || valor === null) return null;
    const { lat, lng } = valor as Record<string, unknown>;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
}

/**
 * 1. Ubicación manual: manda sobre la dirección, pero debe estar dentro de la
 *    zona de operación (no se confía en lo que envía el navegador).
 * 2. Sin ubicación manual: se geocodifica solo si cambió la dirección (DEF-05);
 *    si el geocodificador falla, queda sin ubicación sin bloquear el guardado.
 * 3. Sin cambios: se conservan las coordenadas actuales.
 */
export async function resolverCoordenadas({ manual, cambioDireccion, direccion, geocodificar }: Entrada): Promise<ResolucionCoordenadas> {
    if (manual !== undefined && manual !== null) {
        const ubicacion = leerUbicacion(manual);
        if (!ubicacion) return { ok: false, error: 'La ubicación indicada en el mapa no es válida.' };
        if (!dentroDeZona(ubicacion.lat, ubicacion.lng)) {
            return { ok: false, error: 'La ubicación está fuera de la zona de operación.' };
        }
        return { ok: true, coords: ubicacion, cambia: true };
    }

    if (cambioDireccion) {
        return { ok: true, coords: await geocodificar(direccion), cambia: true };
    }

    return { ok: true, coords: null, cambia: false };
}
