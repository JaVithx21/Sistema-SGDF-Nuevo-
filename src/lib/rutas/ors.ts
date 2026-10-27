import 'server-only';

import type { MotivoRespaldo } from '@/types/planificador';
import {
    construirSolicitudVroom,
    interpretarRespuestaVroom,
    rutaVecinoMasCercano,
    type ParadaEntrada,
    type ResultadoCalculo,
    type VehiculoEntrada,
    type VroomResponse,
} from './optimizador';

// Solo servidor: el token de ORS nunca llega al navegador y la CSP
// (connect-src) no necesita permitir api.openrouteservice.org.

const URL_OPTIMIZACION = 'https://api.openrouteservice.org/optimization';
const URL_DIRECCIONES = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
/** SPK-01: máximo medido 2,69 s con 50 paradas → 8 s deja ~3× de margen (DEC-07). */
const TIMEOUT_MS = 8000;

export interface CalculoOrs {
    resultado: ResultadoCalculo;
    simulada: boolean;
    motivoRespaldo: MotivoRespaldo | null;
    geojsonRuta: Record<string, unknown> | null;
    advertencias: string[];
}

const MENSAJE_RESPALDO: Record<MotivoRespaldo, string> = {
    sin_api_key: 'No hay API key de OpenRouteService configurada.',
    timeout: 'OpenRouteService no respondió en 8 segundos.',
    token_invalido: 'OpenRouteService rechazó el token (401/403).',
    punto_no_ruteable:
        'Alguna dirección queda a más de 350 m de una calle y OpenRouteService no pudo rutearla. Revise las coordenadas de los clientes.',
    error_ors: 'OpenRouteService devolvió un error.',
};

function respaldo(vehiculo: VehiculoEntrada, paradas: ParadaEntrada[], motivo: MotivoRespaldo): CalculoOrs {
    return {
        resultado: rutaVecinoMasCercano(vehiculo, paradas),
        simulada: true,
        motivoRespaldo: motivo,
        geojsonRuta: null,
        advertencias: [
            `Ruta simulada: ${MENSAJE_RESPALDO[motivo]} Se usó el respaldo local (vecino más cercano y distancia en línea recta): respeta la capacidad, pero no garantiza las ventanas horarias.`,
        ],
    };
}

/** Trazado por calles. Si falla, el mapa dibuja líneas rectas (degradación). */
async function obtenerTrazado(
    apiKey: string,
    vehiculo: VehiculoEntrada,
    orden: ParadaEntrada[]
): Promise<Record<string, unknown> | null> {
    const coordenadas = [
        [vehiculo.deposito.lng, vehiculo.deposito.lat],
        ...orden.map((p) => [p.ubicacion.lng, p.ubicacion.lat]),
        [vehiculo.deposito.lng, vehiculo.deposito.lat],
    ];
    try {
        const res = await fetch(URL_DIRECCIONES, {
            method: 'POST',
            headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
            body: JSON.stringify({ coordinates: coordenadas }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: 'no-store',
        });
        if (!res.ok) {
            console.warn(`[rutas] ORS Directions respondió ${res.status}.`);
            return null;
        }
        const geo = (await res.json()) as Record<string, unknown>;
        return typeof geo.type === 'string' ? geo : null;
    } catch (err) {
        console.warn(`[rutas] ORS Directions no disponible (${err instanceof Error ? err.name : 'error'}).`);
        return null;
    }
}

/**
 * Calcula la ruta con VROOM vía ORS. Nunca lanza: ante falta de key, timeout,
 * 401/403, punto no ruteable o cualquier error, usa el respaldo local y lo
 * marca como `simulada` con su motivo.
 */
export async function calcularConOrs(vehiculo: VehiculoEntrada, paradas: ParadaEntrada[]): Promise<CalculoOrs> {
    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) return respaldo(vehiculo, paradas, 'sin_api_key');

    let datos: VroomResponse;
    try {
        const res = await fetch(URL_OPTIMIZACION, {
            method: 'POST',
            headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(construirSolicitudVroom(vehiculo, paradas)),
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: 'no-store',
        });
        if (res.status === 401 || res.status === 403) return respaldo(vehiculo, paradas, 'token_invalido');
        if (!res.ok) {
            const texto = await res.text().catch(() => '');
            console.warn(`[rutas] ORS Optimization respondió ${res.status}.`);
            return respaldo(vehiculo, paradas, /routable point/i.test(texto) ? 'punto_no_ruteable' : 'error_ors');
        }
        datos = (await res.json()) as VroomResponse;
    } catch (err) {
        const esTimeout = err instanceof Error && err.name === 'TimeoutError';
        console.warn(`[rutas] ORS Optimization no disponible (${esTimeout ? 'timeout' : 'error de red'}).`);
        return respaldo(vehiculo, paradas, esTimeout ? 'timeout' : 'error_ors');
    }

    if (datos.code !== 0) return respaldo(vehiculo, paradas, 'error_ors');

    const resultado = interpretarRespuestaVroom(datos);
    const advertencias: string[] = [];
    let geojsonRuta: Record<string, unknown> | null = null;

    if (resultado.visitas.length > 0) {
        const porId = new Map(paradas.map((p) => [p.pedidoId, p]));
        const orden = resultado.visitas.map((v) => porId.get(v.pedidoId)).filter((p): p is ParadaEntrada => !!p);
        geojsonRuta = await obtenerTrazado(apiKey, vehiculo, orden);
        if (!geojsonRuta) {
            advertencias.push('No se obtuvo el trazado por calles: el mapa muestra líneas rectas entre paradas.');
        }
    }

    return { resultado, simulada: false, motivoRespaldo: null, geojsonRuta, advertencias };
}
