import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { firmarRuta, verificarFirma } from './firma';
import { rutaDeEjemplo } from '@/test/fixtures/ruta-de-ejemplo';
import type { RutaCalculada } from '@/types/planificador';

const CTX = { sucursalId: 1, choferId: 7 };
const AHORA = 1_763_400_000_000;

const firmada = (): RutaCalculada => {
    const ruta = rutaDeEjemplo();
    return { ...ruta, firma: firmarRuta(ruta, CTX, AHORA) };
};

describe('firma del cálculo de ruta (DEF-14, ADR-04)', () => {
    beforeEach(() => vi.stubEnv('RUTAS_FIRMA_SECRET', 'secreto-de-prueba-de-al-menos-32-caracteres'));
    afterEach(() => vi.unstubAllEnvs());

    it('acepta la ruta tal como la calculó el servidor', () => {
        expect(verificarFirma(firmada(), CTX, AHORA + 60_000)).toEqual({ ok: true });
    });

    it.each<[string, (r: RutaCalculada) => void]>([
        ['paradas reordenadas', (r) => {
            r.paradas = [{ ...r.paradas[1], orden: 1 }, { ...r.paradas[0], orden: 2 }];
        }],
        ['un pedido agregado', (r) => {
            r.paradas.push({ ...r.paradas[0], pedidoId: 99, orden: 3 });
        }],
        ['km alterados', (r) => {
            r.kmTotal = 10;
        }],
        ['una ruta simulada presentada como real', (r) => {
            r.simulada = !r.simulada;
        }],
        ['el trazado cambiado', (r) => {
            r.geojsonRuta = { type: 'FeatureCollection', features: [{}] };
        }],
    ])('AC-02-guardado: rechaza la ruta con %s', (_caso, alterar) => {
        const ruta = firmada();
        alterar(ruta);
        expect(verificarFirma(ruta, CTX, AHORA)).toEqual({ ok: false, motivo: 'alterada' });
    });

    it('rechaza la firma de otro chofer u otro origen', () => {
        expect(verificarFirma(firmada(), { ...CTX, choferId: 8 }, AHORA)).toEqual({ ok: false, motivo: 'alterada' });
        expect(verificarFirma(firmada(), { ...CTX, sucursalId: 2 }, AHORA)).toEqual({ ok: false, motivo: 'alterada' });
    });

    it.each(['', 'sin-punto', '123.zz', `${AHORA}.${'a'.repeat(64)}`])('rechaza una firma inválida: %j', (firma) => {
        expect(verificarFirma({ ...firmada(), firma }, CTX, AHORA)).toEqual({ ok: false, motivo: 'alterada' });
    });

    it('rechaza un cálculo de más de 6 horas', () => {
        expect(verificarFirma(firmada(), CTX, AHORA + 6 * 60 * 60 * 1000 + 1)).toEqual({ ok: false, motivo: 'vencida' });
    });

    it('rechaza una firma hecha con otro secreto', () => {
        const ruta = firmada();
        vi.stubEnv('RUTAS_FIRMA_SECRET', 'otro-secreto-distinto-de-al-menos-32-caracteres');
        expect(verificarFirma(ruta, CTX, AHORA)).toEqual({ ok: false, motivo: 'alterada' });
    });

    it('exige un secreto configurado de al menos 32 caracteres', () => {
        vi.stubEnv('RUTAS_FIRMA_SECRET', 'corto');
        expect(() => firmarRuta(rutaDeEjemplo(), CTX)).toThrow(/RUTAS_FIRMA_SECRET/);
    });
});
