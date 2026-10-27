import { describe, expect, it } from 'vitest';
import {
    construirSolicitudVroom,
    distanciaHaversineM,
    horaASegundos,
    interpretarRespuestaVroom,
    m3ADm3,
    rutaVecinoMasCercano,
    segundosAHora,
    type ParadaEntrada,
    type VehiculoEntrada,
} from './optimizador';

// Furgón del enunciado: 13 m³ y 1.289 kg, depósito en (0, 0)
const FURGON: VehiculoEntrada = {
    deposito: { lat: 0, lng: 0 },
    capacidadDm3: m3ADm3(13),
    capacidadKg: 1289,
    turno: [horaASegundos('07:00'), horaASegundos('18:00')],
};

function parada(pedidoId: number, lat: number, extra: Partial<ParadaEntrada> = {}): ParadaEntrada {
    return { pedidoId, ubicacion: { lat, lng: 0 }, volumenDm3: 1000, pesoKg: 100, ventana: null, servicioSeg: 600, ...extra };
}

describe('conversiones', () => {
    it('convierte horas y volúmenes a enteros para VROOM', () => {
        expect(horaASegundos('07:30')).toBe(27000);
        expect(horaASegundos('07:30:15')).toBe(27015);
        expect(segundosAHora(27000)).toBe('07:30');
        expect(m3ADm3(13)).toBe(13000);
        expect(m3ADm3(0.0011)).toBe(2); // redondea hacia arriba
    });

    it('un grado de latitud mide ~111,2 km', () => {
        expect(distanciaHaversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -1);
    });
});

describe('respaldo local (vecino más cercano)', () => {
    it('visita la parada más cercana y numera en orden', () => {
        const r = rutaVecinoMasCercano(FURGON, [parada(30, 0.03), parada(10, 0.01), parada(20, 0.02)]);
        expect(r.visitas.map((v) => v.pedidoId)).toEqual([10, 20, 30]);
        expect(r.distanciaM).toBeGreaterThan(0);
        expect(r.visitas[2].distanciaAcumM).toBeGreaterThan(r.visitas[0].distanciaAcumM as number);
    });

    it('respeta la capacidad de volumen (AC-02-límite)', () => {
        const r = rutaVecinoMasCercano(FURGON, [parada(1, 0.01, { volumenDm3: 8000 }), parada(2, 0.02, { volumenDm3: 6000 })]);
        expect(r.visitas.map((v) => v.pedidoId)).toEqual([1]);
        expect(r.sinAsignar).toEqual([2]);
    });

    it('respeta la capacidad de peso (AC-02-límite)', () => {
        const r = rutaVecinoMasCercano(FURGON, [parada(1, 0.01, { pesoKg: 1300 })]);
        expect(r.visitas).toHaveLength(0);
        expect(r.sinAsignar).toEqual([1]);
    });

    it('sin capacidad de peso registrada no limita por peso', () => {
        const r = rutaVecinoMasCercano({ ...FURGON, capacidadKg: null }, [parada(1, 0.01, { pesoKg: 5000 })]);
        expect(r.visitas).toHaveLength(1);
    });

    it('espera a que abra la ventana horaria si llega antes', () => {
        const r = rutaVecinoMasCercano(FURGON, [parada(1, 0.01, { ventana: [horaASegundos('10:00'), horaASegundos('12:00')] })]);
        expect(r.visitas[0].llegadaSeg).toBe(horaASegundos('10:00'));
    });
});

describe('VROOM', () => {
    it('arma la solicitud con [lng, lat], volumen y peso enteros, ventanas y options.g', () => {
        const req = construirSolicitudVroom(FURGON, [
            parada(5, -34.6, { ubicacion: { lat: -34.6, lng: -71.3 }, ventana: [32400, 46800] }),
            parada(6, -34.4),
        ]);
        expect(req.options).toEqual({ g: true });
        expect(req.vehicles[0].capacity).toEqual([13000, 1289]);
        expect(req.vehicles[0].start).toEqual([0, 0]);
        expect(req.jobs[0]).toMatchObject({ id: 5, location: [-71.3, -34.6], delivery: [1000, 100], time_windows: [[32400, 46800]] });
        expect(req.jobs[1]).not.toHaveProperty('time_windows');
    });

    it('usa una sola dimensión si el vehículo no tiene capacidad de peso', () => {
        const req = construirSolicitudVroom({ ...FURGON, capacidadKg: null }, [parada(1, 0.01)]);
        expect(req.vehicles[0].capacity).toEqual([13000]);
        expect(req.jobs[0].delivery).toEqual([1000]);
    });

    it('interpreta el orden, la distancia acumulada y los no asignados', () => {
        const r = interpretarRespuestaVroom({
            code: 0,
            unassigned: [{ id: 9 }],
            routes: [{
                duration: 1200, service: 600, waiting_time: 60, distance: 8450.4,
                steps: [
                    { type: 'start', distance: 0 },
                    { type: 'job', id: 20, arrival: 26000, distance: 3000 },
                    { type: 'job', id: 10, arrival: 27000, distance: 5000 },
                    { type: 'end', distance: 8450 },
                ],
            }],
        });
        expect(r.visitas).toEqual([
            { pedidoId: 20, llegadaSeg: 26000, distanciaAcumM: 3000 },
            { pedidoId: 10, llegadaSeg: 27000, distanciaAcumM: 5000 },
        ]);
        expect(r.sinAsignar).toEqual([9]);
        expect(r.distanciaM).toBe(8450);
        expect(r.duracionSeg).toBe(1860);
    });

    it('sin rutas devuelve todo como no asignado', () => {
        const r = interpretarRespuestaVroom({ code: 0, unassigned: [{ id: 1 }, { id: 2 }], routes: [] });
        expect(r.visitas).toEqual([]);
        expect(r.sinAsignar).toEqual([1, 2]);
    });
});
