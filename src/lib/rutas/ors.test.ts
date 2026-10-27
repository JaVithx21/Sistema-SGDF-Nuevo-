import { afterEach, describe, expect, it, vi } from 'vitest';

// ors.ts importa 'server-only', que lanza fuera de Next.js
vi.mock('server-only', () => ({}));

import { calcularConOrs } from './ors';
import { horaASegundos, type ParadaEntrada, type VehiculoEntrada } from './optimizador';

const VEHICULO: VehiculoEntrada = {
    deposito: { lat: -34.48, lng: -71.49 },
    capacidadDm3: 13000,
    capacidadKg: 1289,
    turno: [horaASegundos('07:00'), horaASegundos('18:00')],
};
const PARADAS: ParadaEntrada[] = [
    { pedidoId: 1, ubicacion: { lat: -34.6, lng: -71.36 }, volumenDm3: 100, pesoKg: 5, ventana: null, servicioSeg: 600 },
    { pedidoId: 2, ubicacion: { lat: -34.4, lng: -71.62 }, volumenDm3: 100, pesoKg: 5, ventana: null, servicioSeg: 600 },
];

const respuestaVroom = {
    code: 0,
    routes: [{ duration: 3600, distance: 50000, steps: [{ type: 'job', id: 2, arrival: 27000 }, { type: 'job', id: 1, arrival: 30000 }] }],
};
const geojson = { type: 'FeatureCollection', features: [] };
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });

describe('calcularConOrs', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('usa VROOM y el trazado por calles cuando ORS responde (AC-02-feliz)', async () => {
        vi.stubEnv('ORS_API_KEY', 'test');
        const fetchMock = vi.fn().mockResolvedValueOnce(json(respuestaVroom)).mockResolvedValueOnce(json(geojson));
        vi.stubGlobal('fetch', fetchMock);

        const r = await calcularConOrs(VEHICULO, PARADAS);

        expect(r.simulada).toBe(false);
        expect(r.resultado.visitas.map((v) => v.pedidoId)).toEqual([2, 1]);
        expect(r.geojsonRuta).toEqual(geojson);
        // timeout en ambas llamadas y options.g en la optimización
        expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).options).toEqual({ g: true });
        // Directions recibe el depósito al inicio y al final, en el orden calculado
        const coords = JSON.parse(fetchMock.mock.calls[1][1].body).coordinates;
        expect(coords).toEqual([[-71.49, -34.48], [-71.62, -34.4], [-71.36, -34.6], [-71.49, -34.48]]);
    });

    it('si falla el trazado, entrega la ruta igual y avisa líneas rectas (AC-05-error)', async () => {
        vi.stubEnv('ORS_API_KEY', 'test');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(respuestaVroom)).mockResolvedValueOnce(json({}, 500)));
        const r = await calcularConOrs(VEHICULO, PARADAS);
        expect(r.simulada).toBe(false);
        expect(r.geojsonRuta).toBeNull();
        expect(r.advertencias.join(' ')).toMatch(/líneas rectas/);
    });

    it.each([
        ['sin API key', '', undefined, 'sin_api_key'],
        ['403', 'test', () => json({}, 403), 'token_invalido'],
        ['punto no ruteable', 'test', () => new Response('Could not find routable point within a radius of 350.0 meters', { status: 500 }), 'punto_no_ruteable'],
        ['error 500 genérico', 'test', () => json({ error: 'x' }, 500), 'error_ors'],
    ])('usa el respaldo simulado: %s (AC-02-error)', async (_caso, key, respuesta, motivo) => {
        vi.stubEnv('ORS_API_KEY', key);
        if (respuesta) vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta()));
        const r = await calcularConOrs(VEHICULO, PARADAS);
        expect(r.simulada).toBe(true);
        expect(r.motivoRespaldo).toBe(motivo);
        expect(r.geojsonRuta).toBeNull();
        expect(r.resultado.visitas).toHaveLength(2);
        expect(r.advertencias[0]).toMatch(/Ruta simulada/);
    });

    it('usa el respaldo simulado si ORS no responde en 8 s', async () => {
        vi.stubEnv('ORS_API_KEY', 'test');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
        const r = await calcularConOrs(VEHICULO, PARADAS);
        expect(r.simulada).toBe(true);
        expect(r.motivoRespaldo).toBe('timeout');
    });
});
