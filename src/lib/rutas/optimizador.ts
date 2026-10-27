// Núcleo del cálculo de rutas (PBI-02): funciones puras, sin red ni BD.
// VROOM solo acepta enteros: volumen en dm³ (litros), peso en kg redondeado
// hacia arriba y horas en segundos desde medianoche.

export interface Punto {
    lat: number;
    lng: number;
}

export interface ParadaEntrada {
    pedidoId: number;
    ubicacion: Punto;
    volumenDm3: number;
    pesoKg: number;
    /** [inicio, fin] en segundos desde medianoche; null = sin restricción. */
    ventana: [number, number] | null;
    servicioSeg: number;
}

export interface VehiculoEntrada {
    deposito: Punto;
    capacidadDm3: number;
    /** null = el vehículo no tiene capacidad de peso registrada (sin límite). */
    capacidadKg: number | null;
    turno: [number, number];
}

export interface Visita {
    pedidoId: number;
    /** Llegada en segundos desde medianoche. */
    llegadaSeg: number | null;
    /** Distancia acumulada desde el depósito, en metros. */
    distanciaAcumM: number | null;
}

export interface ResultadoCalculo {
    visitas: Visita[];
    sinAsignar: number[];
    distanciaM: number;
    duracionSeg: number;
}

// ─── Conversiones ───────────────────────────────────────────────────────────

/** "HH:MM" o "HH:MM:SS" → segundos desde medianoche. */
export function horaASegundos(hora: string): number {
    const [h, m, s] = hora.split(':').map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

/** Segundos desde medianoche → "HH:MM". */
export function segundosAHora(segundos: number): string {
    const h = Math.floor(segundos / 3600) % 24;
    const m = Math.floor((segundos % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** m³ → dm³ enteros, redondeando hacia arriba para no subestimar la carga. */
export function m3ADm3(m3: number): number {
    return Math.ceil(m3 * 1000);
}

// ─── Distancia ──────────────────────────────────────────────────────────────

const RADIO_TIERRA_M = 6_371_000;
const aRad = (g: number) => (g * Math.PI) / 180;

/** Distancia en línea recta sobre la esfera terrestre, en metros. */
export function distanciaHaversineM(a: Punto, b: Punto): number {
    const dLat = aRad(b.lat - a.lat);
    const dLng = aRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aRad(a.lat)) * Math.cos(aRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ─── Respaldo local: vecino más cercano ─────────────────────────────────────

/** La línea recta subestima el recorrido por calles; se corrige con un factor fijo. */
const FACTOR_RED_VIAL = 1.3;
/** Velocidad promedio supuesta en caminos rurales de la región. */
const VELOCIDAD_MS = (40 * 1000) / 3600;

/**
 * Desde el depósito, va siempre a la parada más cercana que todavía cabe en
 * el vehículo (volumen y peso). Respeta la capacidad; NO garantiza ventanas
 * horarias (solo espera si llega antes de que abra). Por eso su resultado se
 * guarda como `simulada`.
 */
export function rutaVecinoMasCercano(vehiculo: VehiculoEntrada, paradas: ParadaEntrada[]): ResultadoCalculo {
    const pendientes = [...paradas];
    const visitas: Visita[] = [];
    const sinAsignar: number[] = [];
    const capKg = vehiculo.capacidadKg ?? Infinity;

    let actual = vehiculo.deposito;
    let volumen = 0;
    let peso = 0;
    let distancia = 0;
    let reloj = vehiculo.turno[0];

    while (pendientes.length > 0) {
        let mejor = -1;
        let mejorDist = Infinity;
        pendientes.forEach((p, i) => {
            if (volumen + p.volumenDm3 > vehiculo.capacidadDm3 || peso + p.pesoKg > capKg) return;
            const d = distanciaHaversineM(actual, p.ubicacion);
            if (d < mejorDist) {
                mejor = i;
                mejorDist = d;
            }
        });

        if (mejor === -1) {
            sinAsignar.push(...pendientes.map((p) => p.pedidoId));
            break;
        }

        const [p] = pendientes.splice(mejor, 1);
        const tramo = mejorDist * FACTOR_RED_VIAL;
        distancia += tramo;
        reloj += tramo / VELOCIDAD_MS;
        if (p.ventana && reloj < p.ventana[0]) reloj = p.ventana[0];

        visitas.push({ pedidoId: p.pedidoId, llegadaSeg: Math.round(reloj), distanciaAcumM: Math.round(distancia) });
        reloj += p.servicioSeg;
        volumen += p.volumenDm3;
        peso += p.pesoKg;
        actual = p.ubicacion;
    }

    if (visitas.length > 0) {
        const regreso = distanciaHaversineM(actual, vehiculo.deposito) * FACTOR_RED_VIAL;
        distancia += regreso;
        reloj += regreso / VELOCIDAD_MS;
    }

    return {
        visitas,
        sinAsignar,
        distanciaM: Math.round(distancia),
        duracionSeg: Math.round(reloj - vehiculo.turno[0]),
    };
}

// ─── VROOM (motor de ORS /optimization) ─────────────────────────────────────

export interface VroomRequest {
    jobs: Array<{
        id: number;
        location: [number, number];
        service: number;
        delivery: number[];
        time_windows?: Array<[number, number]>;
    }>;
    vehicles: Array<{
        id: number;
        profile: 'driving-car';
        start: [number, number];
        end: [number, number];
        capacity: number[];
        time_window: [number, number];
    }>;
    options: { g: boolean };
}

export interface VroomResponse {
    code: number;
    error?: string;
    unassigned?: Array<{ id: number }>;
    routes?: Array<{
        duration: number;
        service?: number;
        waiting_time?: number;
        distance?: number;
        steps: Array<{ type: string; id?: number; arrival?: number; distance?: number }>;
    }>;
}

/** Coordenadas en orden [lng, lat]. Cantidades: [dm³] o [dm³, kg]. */
export function construirSolicitudVroom(vehiculo: VehiculoEntrada, paradas: ParadaEntrada[]): VroomRequest {
    const conPeso = vehiculo.capacidadKg !== null;
    const deposito: [number, number] = [vehiculo.deposito.lng, vehiculo.deposito.lat];
    return {
        jobs: paradas.map((p) => ({
            id: p.pedidoId,
            location: [p.ubicacion.lng, p.ubicacion.lat],
            service: p.servicioSeg,
            delivery: conPeso ? [p.volumenDm3, p.pesoKg] : [p.volumenDm3],
            ...(p.ventana ? { time_windows: [p.ventana] } : {}),
        })),
        vehicles: [
            {
                id: 1,
                profile: 'driving-car',
                start: deposito,
                end: deposito,
                capacity: conPeso ? [vehiculo.capacidadDm3, vehiculo.capacidadKg as number] : [vehiculo.capacidadDm3],
                time_window: vehiculo.turno,
            },
        ],
        // Sin g: true, VROOM omite la distancia de la respuesta.
        options: { g: true },
    };
}

export function interpretarRespuestaVroom(respuesta: VroomResponse): ResultadoCalculo {
    const sinAsignar = (respuesta.unassigned ?? []).map((u) => u.id);
    const ruta = respuesta.routes?.[0];
    if (!ruta) return { visitas: [], sinAsignar, distanciaM: 0, duracionSeg: 0 };

    const visitas: Visita[] = ruta.steps
        .filter((s) => s.type === 'job' && typeof s.id === 'number')
        .map((s) => ({
            pedidoId: s.id as number,
            llegadaSeg: s.arrival ?? null,
            distanciaAcumM: typeof s.distance === 'number' ? s.distance : null,
        }));

    return {
        visitas,
        sinAsignar,
        distanciaM: Math.round(ruta.distance ?? 0),
        // duration = solo manejo; se suman la descarga y las esperas por ventana
        duracionSeg: Math.round(ruta.duration + (ruta.service ?? 0) + (ruta.waiting_time ?? 0)),
    };
}
