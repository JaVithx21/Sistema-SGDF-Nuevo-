import { afterEach, describe, expect, it, vi } from 'vitest';

// geocoding.ts importa 'server-only', que lanza fuera de Next.js
vi.mock('server-only', () => ({}));

import { geocodificarDireccion, ZONA_OPERACION } from './geocoding';

const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });

describe('geocodificarDireccion (PBI-01)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('devuelve lat/lng de una dirección válida, invirtiendo el orden [lng, lat] de GeoJSON (AC-01-feliz)', async () => {
        vi.stubEnv('ORS_API_KEY', 'test');
        const fetchMock = vi.fn().mockResolvedValue(
            respuesta({ features: [{ geometry: { coordinates: [-71.3552, -34.6325] } }] })
        );
        vi.stubGlobal('fetch', fetchMock);

        const r = await geocodificarDireccion('C. La Paz 144, Santa Cruz');

        expect(r).toEqual({ lat: -34.6325, lng: -71.3552 });
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.searchParams.get('text')).toBe('C. La Paz 144, Santa Cruz');
        expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });

    it('limita la búsqueda a la zona de operación (DEF-08)', async () => {
        vi.stubEnv('ORS_API_KEY', 'test');
        const fetchMock = vi.fn().mockResolvedValue(respuesta({ features: [] }));
        vi.stubGlobal('fetch', fetchMock);

        await geocodificarDireccion("Plaza de Armas, Peralillo, O'Higgins");

        const p = new URL(fetchMock.mock.calls[0][0]).searchParams;
        expect(Number(p.get('boundary.rect.min_lat'))).toBe(ZONA_OPERACION.minLat);
        expect(Number(p.get('boundary.rect.max_lat'))).toBe(ZONA_OPERACION.maxLat);
        expect(Number(p.get('boundary.rect.min_lon'))).toBe(ZONA_OPERACION.minLng);
        expect(Number(p.get('boundary.rect.max_lon'))).toBe(ZONA_OPERACION.maxLng);
    });

    it('sin resultados devuelve null: el cliente queda «sin ubicación»', async () => {
        vi.stubEnv('ORS_API_KEY', 'test');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ features: [] })));
        expect(await geocodificarDireccion('Calle Inventada 99999')).toBeNull();
    });

    it('dirección vacía: devuelve null sin llamar al servicio', async () => {
        vi.stubEnv('ORS_API_KEY', 'test');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        expect(await geocodificarDireccion('   ')).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ['ORS no responde en 5 s', () => Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))],
        ['ORS responde 500', () => Promise.resolve(respuesta({ error: 'x' }, 500))],
        ['ORS rechaza el token (403)', () => Promise.resolve(respuesta({}, 403))],
    ])('nunca bloquea el guardado: %s → null (AC-01-error)', async (_caso, falla) => {
        vi.stubEnv('ORS_API_KEY', 'test');
        vi.stubGlobal('fetch', vi.fn().mockImplementation(falla));
        await expect(geocodificarDireccion('Av. Errázuriz 1137, Santa Cruz')).resolves.toBeNull();
    });

    it('sin API key devuelve null (AC-01-error)', async () => {
        vi.stubEnv('ORS_API_KEY', '');
        expect(await geocodificarDireccion('Av. Errázuriz 1137, Santa Cruz')).toBeNull();
    });
});
