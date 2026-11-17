/**
 * Zona donde opera la distribuidora (Región de O'Higgins). La usan el
 * geocodificador (DEF-08), la validación de la ubicación manual (PBI-01.1) y
 * el mapa del cliente. Sin `server-only`: también se usa en el navegador.
 */
export const ZONA_OPERACION = { minLat: -35.1, maxLat: -33.8, minLng: -72.1, maxLng: -70.3 } as const;

/** Centro por defecto del mapa cuando el cliente aún no tiene ubicación (Santa Cruz). */
export const CENTRO_POR_DEFECTO = { lat: -34.6386, lng: -71.3656 } as const;

export function dentroDeZona(lat: number, lng: number): boolean {
    return (
        lat >= ZONA_OPERACION.minLat &&
        lat <= ZONA_OPERACION.maxLat &&
        lng >= ZONA_OPERACION.minLng &&
        lng <= ZONA_OPERACION.maxLng
    );
}
