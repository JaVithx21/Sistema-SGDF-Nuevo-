import { describe, expect, it, vi } from 'vitest';
import { resolverCoordenadas } from './coordenadas';

const SANTA_CRUZ = { lat: -34.6386, lng: -71.3656 };
const SANTIAGO = { lat: -33.4489, lng: -70.6693 }; // fuera de la zona de operación

describe('resolverCoordenadas (PBI-01.1)', () => {
    it('AC-COORD-01: la ubicación fijada en el mapa reemplaza las coordenadas sin geocodificar', async () => {
        const geocodificar = vi.fn();
        const r = await resolverCoordenadas({ manual: SANTA_CRUZ, cambioDireccion: false, direccion: 'X', geocodificar });

        expect(r).toEqual({ ok: true, coords: SANTA_CRUZ, cambia: true });
        expect(geocodificar).not.toHaveBeenCalled();
    });

    it('AC-COORD-01: la ubicación manual manda aunque también cambie la dirección', async () => {
        const geocodificar = vi.fn().mockResolvedValue({ lat: -34.1, lng: -71.1 });
        const r = await resolverCoordenadas({ manual: SANTA_CRUZ, cambioDireccion: true, direccion: 'Nueva', geocodificar });

        expect(r).toEqual({ ok: true, coords: SANTA_CRUZ, cambia: true });
        expect(geocodificar).not.toHaveBeenCalled();
    });

    it('rechaza una ubicación manual fuera de la zona de operación', async () => {
        const r = await resolverCoordenadas({ manual: SANTIAGO, cambioDireccion: false, direccion: 'X', geocodificar: vi.fn() });
        expect(r).toEqual({ ok: false, error: 'La ubicación está fuera de la zona de operación.' });
    });

    it.each([{ lat: 'a', lng: -71 }, { lat: Number.NaN, lng: -71 }, { lat: -34 }, 'texto'])(
        'rechaza una ubicación manual mal formada: %j',
        async (manual) => {
            const r = await resolverCoordenadas({ manual, cambioDireccion: false, direccion: 'X', geocodificar: vi.fn() });
            expect(r).toEqual({ ok: false, error: 'La ubicación indicada en el mapa no es válida.' });
        }
    );

    it('AC-01-límite: al cambiar la dirección se vuelve a geocodificar y las nuevas coordenadas reemplazan a las anteriores', async () => {
        const geocodificar = vi.fn().mockResolvedValue(SANTA_CRUZ);
        const r = await resolverCoordenadas({ cambioDireccion: true, direccion: 'Av. Errázuriz 1137, Santa Cruz', geocodificar });

        expect(geocodificar).toHaveBeenCalledWith('Av. Errázuriz 1137, Santa Cruz');
        expect(r).toEqual({ ok: true, coords: SANTA_CRUZ, cambia: true });
    });

    it('REG-05: si el geocodificador falla con una dirección nueva, se guarda sin ubicación y sin bloquear', async () => {
        const r = await resolverCoordenadas({ cambioDireccion: true, direccion: 'Dirección inexistente', geocodificar: vi.fn().mockResolvedValue(null) });
        expect(r).toEqual({ ok: true, coords: null, cambia: true });
    });

    it('REG-05: sin cambio de dirección ni ubicación manual, conserva las coordenadas (DEF-05)', async () => {
        const geocodificar = vi.fn();
        const r = await resolverCoordenadas({ manual: null, cambioDireccion: false, direccion: 'X', geocodificar });

        expect(r).toEqual({ ok: true, coords: null, cambia: false });
        expect(geocodificar).not.toHaveBeenCalled();
    });
});
