import 'server-only';

/**
 * Geocodificación de direcciones con OpenRouteService (Pelias).
 *
 * Contrato: nunca lanza. Si la dirección viene vacía, el servicio no responde
 * a tiempo, falta la API key o no hay resultados, devuelve null y el cliente
 * se guarda igual (queda en la lista "sin ubicación"). Geocodificar nunca
 * debe bloquear el guardado (PBI-01).
 *
 * Se ejecuta solo en el servidor: la key no llega al navegador y la CSP
 * (connect-src) no necesita permitir api.openrouteservice.org.
 */

const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search';
const TIMEOUT_MS = 5000;

/**
 * DEF-08: sin límite, una dirección ambigua (p. ej. "Plaza de Armas, Peralillo,
 * O'Higgins") se ubicaba en otra región, a ~150 km. La distribuidora opera en la
 * Región de O'Higgins: se busca solo dentro de este rectángulo.
 */
export const ZONA_OPERACION = { minLat: -35.1, maxLat: -33.8, minLng: -72.1, maxLng: -70.3 } as const;

export interface Coordenadas {
    lat: number;
    lng: number;
}

interface OrsGeocodeResponse {
    features?: Array<{
        geometry?: { coordinates?: [number, number] };
    }>;
}

export async function geocodificarDireccion(direccion?: string | null): Promise<Coordenadas | null> {
    const texto = direccion?.trim();
    if (!texto) return null;

    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
        console.warn('[geocoding] ORS_API_KEY no está configurada; se omite la geocodificación.');
        return null;
    }

    const params = new URLSearchParams({
        text: texto,
        'boundary.country': 'CL',
        'boundary.rect.min_lat': String(ZONA_OPERACION.minLat),
        'boundary.rect.max_lat': String(ZONA_OPERACION.maxLat),
        'boundary.rect.min_lon': String(ZONA_OPERACION.minLng),
        'boundary.rect.max_lon': String(ZONA_OPERACION.maxLng),
        size: '1',
    });

    try {
        const res = await fetch(`${ORS_GEOCODE_URL}?${params}`, {
            headers: { Authorization: apiKey, Accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: 'no-store',
        });

        if (!res.ok) {
            console.warn(`[geocoding] ORS respondió ${res.status}.`);
            return null;
        }

        const data = (await res.json()) as OrsGeocodeResponse;
        // GeoJSON entrega [lng, lat], en ese orden.
        const coords = data.features?.[0]?.geometry?.coordinates;
        if (!coords) return null;

        const [lng, lat] = coords;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

        return { lat, lng };
    } catch (err) {
        // TimeoutError (5 s), error de red o JSON inválido: no bloquear el guardado.
        const motivo = err instanceof Error ? err.name : 'desconocido';
        console.warn(`[geocoding] No se pudo geocodificar (${motivo}).`);
        return null;
    }
}
