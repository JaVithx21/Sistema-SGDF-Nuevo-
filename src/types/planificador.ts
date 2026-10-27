// Tipos del planificador de rutas (/rutas) — PBI-02, PBI-04, PBI-05.
// Separados de src/types/rutas.ts, que es el contrato de la vista del chofer.

/** Por qué se usó el respaldo local en vez de ORS. */
export type MotivoRespaldo = 'sin_api_key' | 'timeout' | 'token_invalido' | 'punto_no_ruteable' | 'error_ors';

export interface PedidoPlanificable {
    id: number;
    estado: string;
    clienteNombre: string;
    direccion: string | null;
    conUbicacion: boolean;
    ventanaInicio: string | null; // "HH:MM:SS"
    ventanaFin: string | null;
    volumenM3: number;
    pesoKg: number;
    /** true si algún producto del pedido no tiene volumen o peso cargado. */
    sinMedidas: boolean;
}

export interface ChoferPlanificable {
    id: number;
    nombre: string;
    turnoInicio: string | null; // "HH:MM:SS"; null = turno por defecto
    turnoFin: string | null;
    vehiculo: {
        id: number;
        patente: string;
        modelo: string | null;
        capacidadM3: number | null;
        capacidadKg: number | null;
        rendimientoKml: number | null;
    } | null;
}

export interface SucursalPlanificable {
    id: number;
    nombre: string;
    lat: number;
    lng: number;
    esDeposito: boolean;
}

export interface ParadaCalculada {
    pedidoId: number;
    orden: number;
    clienteNombre: string;
    lat: number;
    lng: number;
    /** Llegada estimada "HH:MM"; null si el cálculo no la entrega. */
    llegada: string | null;
    kmAcumulados: number | null;
    volumenM3: number;
}

export interface RutaCalculada {
    paradas: ParadaCalculada[];
    /** Pedidos que no caben o no cumplen su horario (los descartó el cálculo). */
    pedidosNoAsignados: number[];
    /** Pedidos excluidos porque su cliente no tiene coordenadas. */
    pedidosSinUbicacion: number[];
    kmTotal: number;
    duracionMin: number;
    /** true = respaldo local (vecino más cercano + Haversine), no ORS. */
    simulada: boolean;
    motivoRespaldo: MotivoRespaldo | null;
    /** Trazado por calles (ORS Directions). null = el mapa usa líneas rectas. */
    geojsonRuta: Record<string, unknown> | null;
    advertencias: string[];
    volumenTotalM3: number;
    pesoTotalKg: number;
    litrosEstimados: number | null;
    costoCombustibleClp: number | null;
    precioLitroReferencia: number;
}

export interface ParadaGuardada {
    orden: number;
    pedidoId: number;
    clienteNombre: string;
    lat: number | null;
    lng: number | null;
    estado: 'pendiente' | 'entregado' | 'fallido';
    /** Motivo que registró el chofer al marcar la parada como fallida (SE-03). */
    motivoFallo: string | null;
    /** Momento en que el chofer marcó la parada (timestamptz ISO). */
    marcadaEn: string | null;
}

export interface RutaGuardada {
    id: number;
    estado: string;
    choferNombre: string;
    patente: string | null;
    kmPlanificados: number | null;
    simulada: boolean;
    geojsonRuta: Record<string, unknown> | null;
    deposito: { nombre: string; lat: number; lng: number } | null;
    paradas: ParadaGuardada[];
}
