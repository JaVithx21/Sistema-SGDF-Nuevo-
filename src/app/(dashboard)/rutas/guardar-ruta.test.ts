import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prueba de la acción completa guardarRuta() (observación C10 de la segunda
// defensa): sesión, cookies y Supabase se reemplazan por dobles para comprobar
// qué llega a la base ante una solicitud manipulada.
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/security/auth-guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'uid-jefe' }, role: 'jefe_operaciones', error: null })),
}));

const bd = vi.hoisted(() => ({
    tablas: [] as string[],
    inserts: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({
        from: (tabla: string) => {
            bd.tablas.push(tabla);
            const consulta = {
                select: () => consulta,
                eq: () => consulta,
                in: () => consulta,
                // Chofer inactivo: si la firma pasa, la acción se detiene aquí sin escribir.
                single: async () => ({ data: null, error: null }),
                insert: () => {
                    bd.inserts.push(tabla);
                    return consulta;
                },
            };
            return consulta;
        },
    }),
}));

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

describe('guardarRuta() ante una solicitud manipulada (AC-02-guardado, DEF-14)', () => {
    beforeEach(() => {
        vi.stubEnv('RUTAS_FIRMA_SECRET', 'secreto-de-prueba-de-al-menos-32-caracteres');
        bd.tablas = [];
        bd.inserts = [];
    });
    afterEach(() => vi.unstubAllEnvs());

    it('AC-02-guardado: con las paradas reordenadas responde el error y no consulta ni escribe la base', async () => {
        const ruta = rutaFirmada();
        ruta.paradas = [{ ...ruta.paradas[1], orden: 1 }, { ...ruta.paradas[0], orden: 2 }];

        const res = await guardar(ruta);

        expect(res).toEqual({ success: false, error: 'La ruta fue modificada; vuelve a calcularla.' });
        expect(bd.tablas).toEqual([]);
        expect(bd.inserts).toEqual([]);
    });

    it('AC-02-guardado: con un pedido agregado no escribe nada', async () => {
        const ruta = rutaFirmada();
        ruta.paradas.push({ ...ruta.paradas[0], pedidoId: 99, orden: 3 });

        expect((await guardar(ruta)).success).toBe(false);
        expect(bd.inserts).toEqual([]);
    });

    it('AC-02-guardado: una ruta sin firma no se guarda', async () => {
        const { firma: _firma, ...sinFirma } = rutaFirmada();
        void _firma;

        const res = await guardar(sinFirma as RutaCalculada);

        expect(res).toEqual({ success: false, error: 'La ruta fue modificada; vuelve a calcularla.' });
        expect(bd.tablas).toEqual([]);
    });

    it('la firma de otro chofer no sirve para guardar a este', async () => {
        const res = await guardarRuta({ fecha: hoyEnChile(), sucursalId: 1, choferId: 8, ruta: rutaFirmada() });
        expect(res.success).toBe(false);
        expect(bd.tablas).toEqual([]);
    });

    it('con la firma válida pasa a validar contra la base (y aquí se detiene por chofer inactivo, sin escribir)', async () => {
        const res = await guardar(rutaFirmada());

        expect(res).toEqual({ success: false, error: 'El chofer no está activo o no tiene vehículo asignado.' });
        expect(bd.tablas).toEqual(['choferes']);
        expect(bd.inserts).toEqual([]);
    });

    it('sin RUTAS_FIRMA_SECRET responde un error claro, sin escribir', async () => {
        const ruta = rutaFirmada();
        vi.stubEnv('RUTAS_FIRMA_SECRET', '');

        const res = await guardar(ruta);

        expect(res).toEqual({ success: false, error: 'Falta configurar RUTAS_FIRMA_SECRET en el servidor (ver README).' });
        expect(bd.inserts).toEqual([]);
    });
});
