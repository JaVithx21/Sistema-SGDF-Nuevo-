import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prueba de la acción completa guardarRuta() (observación C10 de la segunda
// defensa): sesión, cookies y Supabase se reemplazan por dobles para comprobar
// qué llega a la base ante una solicitud manipulada y que el guardado sea una
// sola llamada transaccional (DEF-15).
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/security/auth-guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'uid-jefe' }, role: 'jefe_operaciones', error: null })),
}));

const bd = vi.hoisted(() => ({
    /** Tablas tocadas directamente (con guardar_ruta() no debería haber ninguna). */
    tablas: [] as string[],
    rpc: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('@/lib/supabase/server', async () => {
    const { vi: v } = await import('vitest');
    bd.rpc = v.fn();
    return {
        createClient: () => ({
            rpc: bd.rpc,
            from: (tabla: string) => {
                bd.tablas.push(tabla);
                throw new Error(`guardarRuta no debería tocar la tabla ${tabla} directamente`);
            },
        }),
    };
});

import { guardarRuta } from './actions';
import { firmarRuta } from '@/lib/rutas/firma';
import { hoyEnChile } from '@/lib/rutas/fecha';
import { rutaDeEjemplo } from '@/test/fixtures/ruta-de-ejemplo';
import type { RutaCalculada } from '@/types/planificador';

const CTX = { sucursalId: 1, choferId: 7 };

function rutaFirmada(): RutaCalculada {
    const ruta = rutaDeEjemplo();
    return { ...ruta, firma: firmarRuta(ruta, CTX) };
}

const guardar = (ruta: RutaCalculada) => guardarRuta({ fecha: hoyEnChile(), ...CTX, ruta });

beforeEach(() => {
    vi.stubEnv('RUTAS_FIRMA_SECRET', 'secreto-de-prueba-de-al-menos-32-caracteres');
    bd.tablas = [];
    bd.rpc.mockReset().mockResolvedValue({ data: 42, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('guardarRuta() ante una solicitud manipulada (AC-02-guardado, DEF-14)', () => {
    it('AC-02-guardado: con las paradas reordenadas responde el error y no llega a la base', async () => {
        const ruta = rutaFirmada();
        ruta.paradas = [{ ...ruta.paradas[1], orden: 1 }, { ...ruta.paradas[0], orden: 2 }];

        const res = await guardar(ruta);

        expect(res).toEqual({ success: false, error: 'La ruta fue modificada; vuelve a calcularla.' });
        expect(bd.rpc).not.toHaveBeenCalled();
        expect(bd.tablas).toEqual([]);
    });

    it('AC-02-guardado: con un pedido agregado no llega a la base', async () => {
        const ruta = rutaFirmada();
        ruta.paradas.push({ ...ruta.paradas[0], pedidoId: 99, orden: 3 });

        expect((await guardar(ruta)).success).toBe(false);
        expect(bd.rpc).not.toHaveBeenCalled();
    });

    it('AC-02-guardado: una ruta sin firma no se guarda', async () => {
        const { firma: _firma, ...sinFirma } = rutaFirmada();
        void _firma;

        const res = await guardar(sinFirma as RutaCalculada);

        expect(res).toEqual({ success: false, error: 'La ruta fue modificada; vuelve a calcularla.' });
        expect(bd.rpc).not.toHaveBeenCalled();
    });

    it('la firma de otro chofer no sirve para guardar a este', async () => {
        const res = await guardarRuta({ fecha: hoyEnChile(), sucursalId: 1, choferId: 8, ruta: rutaFirmada() });
        expect(res.success).toBe(false);
        expect(bd.rpc).not.toHaveBeenCalled();
    });

    it('sin RUTAS_FIRMA_SECRET responde un error claro, sin llegar a la base', async () => {
        const ruta = rutaFirmada();
        vi.stubEnv('RUTAS_FIRMA_SECRET', '');

        const res = await guardar(ruta);

        expect(res).toEqual({ success: false, error: 'Falta configurar RUTAS_FIRMA_SECRET en el servidor (ver README).' });
        expect(bd.rpc).not.toHaveBeenCalled();
    });
});

describe('guardarRuta() con guardar_ruta() transaccional (DEF-15)', () => {
    it('con la firma válida llama a guardar_ruta una sola vez con las paradas firmadas y sin tocar tablas', async () => {
        const res = await guardar(rutaFirmada());

        expect(res).toEqual({ success: true, data: { rutaId: 42 } });
        expect(bd.rpc).toHaveBeenCalledOnce();
        expect(bd.tablas).toEqual([]);
        const [funcion, params] = bd.rpc.mock.calls[0];
        expect(funcion).toBe('guardar_ruta');
        expect(params).toMatchObject({
            p_fecha: hoyEnChile(),
            p_sucursal_id: 1,
            p_chofer_id: 7,
            p_paradas: [
                { pedido_id: 11, orden: 1, km_acumulados: 12.4 },
                { pedido_id: 12, orden: 2, km_acumulados: 15.1 },
            ],
            p_resumen: { km_planificados: 49.5, duracion_s: 95 * 60, simulada: false },
        });
    });

    it('una ruta simulada se envía sin trazado (CHECK rutas_simulada_sin_geometria)', async () => {
        const base = { ...rutaDeEjemplo(), simulada: true };
        await guardar({ ...base, firma: firmarRuta(base, CTX) });
        expect(bd.rpc.mock.calls[0][1].p_resumen.geojson_ruta).toBeNull();
    });

    it.each([
        ['uq_ruta_chofer_fecha', 'Ese chofer ya tiene una ruta para esa fecha.'],
        ['uq_ruta_vehiculo_fecha', 'El vehículo de ese chofer ya tiene una ruta para esa fecha. Elige otra fecha u otro chofer.'],
        ['uq_parada_pedido_ruta', 'Hay un pedido repetido en la ruta.'],
    ])('REG-03: traduce el 23505 de %s a un mensaje claro', async (restriccion, mensaje) => {
        bd.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${restriccion}"` } });
        expect(await guardar(rutaFirmada())).toEqual({ success: false, error: mensaje });
    });

    it('AC-02-guardado (base): el rechazo por capacidad de la base llega tal cual', async () => {
        bd.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'La carga supera la capacidad del vehículo (volumen).' } });
        expect(await guardar(rutaFirmada())).toEqual({ success: false, error: 'La carga supera la capacidad del vehículo (volumen).' });
    });

    it('sin permiso en la base (42501) responde un mensaje claro', async () => {
        bd.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'x' } });
        expect(await guardar(rutaFirmada())).toEqual({ success: false, error: 'No tienes permiso para guardar rutas.' });
    });

    it('un error inesperado nunca se informa como éxito', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        bd.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } });
        expect(await guardar(rutaFirmada())).toEqual({ success: false, error: 'No se pudo guardar la ruta.' });
    });
});
