import type { RutaCalculada } from '@/types/planificador';

/** Ruta calculada de 2 paradas, sin firma, para las pruebas de DEF-14. */
export function rutaDeEjemplo(): Omit<RutaCalculada, 'firma'> {
    return {
        paradas: [
            { pedidoId: 11, orden: 1, clienteNombre: 'Florería A', lat: -34.63, lng: -71.35, llegada: '09:10', kmAcumulados: 12.4, volumenM3: 0.4 },
            { pedidoId: 12, orden: 2, clienteNombre: 'Florería B', lat: -34.64, lng: -71.36, llegada: '09:40', kmAcumulados: 15.1, volumenM3: 0.3 },
        ],
        pedidosNoAsignados: [],
        pedidosSinUbicacion: [],
        kmTotal: 49.5,
        duracionMin: 95,
        simulada: false,
        motivoRespaldo: null,
        geojsonRuta: { type: 'FeatureCollection', features: [] },
        advertencias: [],
        volumenTotalM3: 0.7,
        pesoTotalKg: 30,
        litrosEstimados: 5.2,
        costoCombustibleClp: 5460,
        precioLitroReferencia: 1050,
    };
}
