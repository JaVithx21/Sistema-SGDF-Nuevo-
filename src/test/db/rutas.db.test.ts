import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { ParadaChoferRow } from '@/types/rutas';
import { comoUsuario, crearBaseConMigraciones, leerSql } from './supabase-pglite';

// PBI-03 / RNF-SEG-01 / RSK-04 — las migraciones de supabase/ aplicadas sobre
// Postgres en memoria: privacidad del chofer, RLS, persistencia de marcar_parada
// y una sola ruta por vehículo y por chofer al día.

const COLUMNAS_CONTRATO = [
    'parada_id', 'ruta_id', 'fecha', 'vehiculo_patente', 'orden', 'estado', 'motivo_fallo', 'entregado_at',
    'razon_social', 'nombre_contacto', 'telefono', 'direccion', 'lat', 'lng', 'ventana_inicio', 'ventana_fin',
] as const satisfies readonly (keyof ParadaChoferRow)[];

// Si ParadaChoferRow cambia de columnas, el typecheck falla aquí
type ColumnasSinProbar = Exclude<keyof ParadaChoferRow, (typeof COLUMNAS_CONTRATO)[number]>;
const contratoCompleto: [ColumnasSinProbar] extends [never] ? true : never = true;

const COLUMNAS_PROHIBIDAS = ['rut', 'total', 'saldo', 'saldo_pendiente', 'total_pagado', 'credito'];

const HOY = `(now() AT TIME ZONE 'America/Santiago')::date`;

let db: PGlite;

async function uno<T>(sql: string, params: unknown[] = []): Promise<T> {
    return (await db.query<T>(sql, params)).rows[0];
}

/** Alta como en el README: primero en `usuarios` (lista blanca) y luego en Auth. */
async function crearUsuario(email: string, rol: string): Promise<string> {
    await db.query(`INSERT INTO usuarios (email, nombre, rol) VALUES ($1, $1, $2)`, [email, rol]);
    const { id } = await uno<{ id: string }>(
        `INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), $1) RETURNING id`,
        [email],
    );
    return id;
}

const ids = {
    choferSeed: '', otroChofer: '', choferLibre: '', vendedor: '', jefe: '', admin: '',
    paradasSeed: [] as number[], rutaOtro: 0, paradaOtro: 0, pedidoOtro: 0,
};

describe('Base de datos de rutas (PGlite)', () => {
    beforeAll(async () => {
        db = await crearBaseConMigraciones();

        // Semilla según el README: 1.ª pasada deja el correo en la lista blanca,
        // se crea el usuario de Auth y la 2.ª pasada arma la ruta de hoy.
        await db.exec(leerSql('seed.sql'));
        const { id } = await uno<{ id: string }>(
            `INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'chofer.prueba@sgdf.test') RETURNING id`,
        );
        ids.choferSeed = id;
        await db.exec(leerSql('seed.sql'));
        ids.paradasSeed = (await db.query<{ id: number }>(
            `SELECT rp.id FROM ruta_paradas rp JOIN rutas_diarias rd ON rd.id = rp.ruta_id
              JOIN vehiculos v ON v.id = rd.vehiculo_id WHERE v.patente = 'SEED01' ORDER BY rp.orden`,
        )).rows.map((r) => r.id);

        ids.otroChofer = await crearUsuario('otro.chofer@sgdf.test', 'chofer');
        ids.choferLibre = await crearUsuario('chofer.libre@sgdf.test', 'chofer');
        ids.vendedor = await crearUsuario('vendedor@sgdf.test', 'vendedor');
        ids.jefe = await crearUsuario('jefe@sgdf.test', 'jefe_operaciones');
        ids.admin = await crearUsuario('admin@sgdf.test', 'admin');

        // Ruta de hoy del otro chofer, independiente de la semilla
        const { sucursal } = await uno<{ sucursal: number }>(
            `INSERT INTO sucursales (nombre, direccion, lat, lng) VALUES ('Bodega (test)', 'Santa Cruz', -34.64, -71.37)
             RETURNING id AS sucursal`,
        );
        const { vehiculo } = await uno<{ vehiculo: number }>(
            `INSERT INTO vehiculos (patente, rendimiento_kml, capacidad_vol_m3, sucursal_id) VALUES ('TEST01', 9.5, 13, $1)
             RETURNING id AS vehiculo`,
            [sucursal],
        );
        const { chofer } = await uno<{ chofer: number }>(
            `INSERT INTO choferes (usuario_id, nombre_completo, rut) VALUES ($1, 'Otro Chofer (test)', '12345678-5')
             RETURNING id AS chofer`,
            [ids.otroChofer],
        );
        await db.query(`INSERT INTO choferes (usuario_id, nombre_completo) VALUES ($1, 'Chofer Libre (test)')`,
            [ids.choferLibre]);
        ids.pedidoOtro = (await uno<{ pedido: number }>(
            `WITH c AS (
                 INSERT INTO clientes (razon_social, rut, lat, lng) VALUES ('Cliente (test)', '11111111-1', -34.6, -71.3)
                 RETURNING id
             )
             INSERT INTO pedidos (cliente_id) SELECT id FROM c RETURNING id AS pedido`,
        )).pedido;
        ids.rutaOtro = (await uno<{ id: number }>(
            `INSERT INTO rutas_diarias (fecha, sucursal_id, vehiculo_id, chofer_id) VALUES (${HOY}, $1, $2, $3) RETURNING id`,
            [sucursal, vehiculo, chofer],
        )).id;
        ids.paradaOtro = (await uno<{ id: number }>(
            `INSERT INTO ruta_paradas (ruta_id, pedido_id, orden) VALUES ($1, $2, 1) RETURNING id`,
            [ids.rutaOtro, ids.pedidoOtro],
        )).id;
    }, 60_000);

    afterAll(async () => {
        await db?.close();
    });

    describe('migraciones', () => {
        it('las migraciones de rutas se pueden aplicar dos veces', async () => {
            await db.exec(leerSql('migrations/20261026150000_rutas_y_paradas.sql'));
            await db.exec(leerSql('migrations/20261026150100_funciones_chofer.sql'));
        });

        it('crean las UNIQUE de rutas y paradas con sus nombres finales', async () => {
            const { rows } = await db.query<{ conname: string }>(
                `SELECT conname FROM pg_constraint
                  WHERE contype = 'u' AND conrelid IN ('public.rutas_diarias'::regclass, 'public.ruta_paradas'::regclass)
                  ORDER BY conname`,
            );
            expect(rows.map((r) => r.conname)).toEqual([
                'uq_parada_pedido_ruta', 'uq_parada_ruta_orden', 'uq_ruta_chofer_fecha', 'uq_ruta_vehiculo_fecha',
            ]);
        });

        it('no dejan dos UNIQUE sobre las mismas columnas', async () => {
            const { rows } = await db.query(
                `SELECT conrelid, conkey FROM pg_constraint
                  WHERE contype IN ('u', 'p') AND connamespace = 'public'::regnamespace
                  GROUP BY conrelid, conkey HAVING count(*) > 1`,
            );
            expect(rows).toEqual([]);
        });

        it('authenticated sigue sin USAGE sobre el esquema private', async () => {
            const r = await uno<{ ok: boolean }>(`SELECT has_schema_privilege('authenticated', 'private', 'USAGE') AS ok`);
            expect(r.ok).toBe(false);
        });

        it('anon no tiene EXECUTE sobre las funciones del chofer y authenticated sí', async () => {
            const r = await uno<Record<string, boolean>>(
                `SELECT has_function_privilege('anon', 'public.mi_ruta_hoy()', 'EXECUTE') AS anon_ruta,
                        has_function_privilege('anon', 'public.marcar_parada(bigint, text, text)', 'EXECUTE') AS anon_marcar,
                        has_function_privilege('authenticated', 'public.mi_ruta_hoy()', 'EXECUTE') AS auth_ruta,
                        has_function_privilege('authenticated', 'public.marcar_parada(bigint, text, text)', 'EXECUTE') AS auth_marcar`,
            );
            expect(r).toEqual({ anon_ruta: false, anon_marcar: false, auth_ruta: true, auth_marcar: true });
        });
    });

    describe('semilla y lista blanca', () => {
        it('Auth rechaza un correo que no está en usuarios', async () => {
            await expect(
                db.query(`INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'intruso@sgdf.test')`),
            ).rejects.toThrow(/no pertenece al personal autorizado/);
        });

        it('al crear el usuario de Auth, usuarios queda con el mismo id', async () => {
            const r = await uno<{ id: string; rol: string }>(
                `SELECT id, rol FROM usuarios WHERE email = 'chofer.prueba@sgdf.test'`,
            );
            expect(r).toEqual({ id: ids.choferSeed, rol: 'chofer' });
        });

        it('arma la ruta de hoy con 3 paradas pendientes en orden de ventana', async () => {
            expect(ids.paradasSeed).toHaveLength(3);
            const { rows } = await db.query<{ orden: number; estado: string; razon_social: string }>(
                `SELECT rp.orden, rp.estado, c.razon_social FROM ruta_paradas rp
                   JOIN pedidos p ON p.id = rp.pedido_id JOIN clientes c ON c.id = p.cliente_id
                  WHERE rp.id = ANY($1) ORDER BY rp.orden`,
                [ids.paradasSeed],
            );
            expect(rows).toEqual([
                { orden: 1, estado: 'pendiente', razon_social: 'Florería Santa Cruz (seed)' },
                { orden: 2, estado: 'pendiente', razon_social: 'Flores Marchigüe (seed)' },
                { orden: 3, estado: 'pendiente', razon_social: 'Florería Palmilla (seed)' },
            ]);
        });

        it('los triggers calculan el total de los pedidos de la semilla', async () => {
            const { rows } = await db.query<{ total: string }>(
                `SELECT total FROM pedidos WHERE nota = 'Pedido de ensayo (seed)'`,
            );
            // 2 × Rosa roja (12 000) + 2 × Clavel (8 000)
            expect(rows.map((r) => Number(r.total))).toEqual([40000, 40000, 40000]);
        });

        it('correrla otra vez no duplica nada', async () => {
            const contar = () => uno<{ rutas: number; paradas: number; pedidos: number }>(
                `SELECT (SELECT count(*)::int FROM rutas_diarias) AS rutas,
                        (SELECT count(*)::int FROM ruta_paradas) AS paradas,
                        (SELECT count(*)::int FROM pedidos) AS pedidos`,
            );
            const antes = await contar();
            await db.exec(leerSql('seed.sql'));
            expect(await contar()).toEqual(antes);
        });
    });

    describe('mi_ruta_hoy()', () => {
        it('devuelve exactamente las 16 columnas del contrato (src/types/rutas.ts)', async () => {
            const { fields } = await comoUsuario(db, ids.choferSeed, (tx) => tx.query('SELECT * FROM mi_ruta_hoy()'));
            expect(contratoCompleto).toBe(true);
            expect(fields.map((f) => f.name)).toEqual([...COLUMNAS_CONTRATO]);
        });

        it('no expone rut, total, saldo ni crédito', async () => {
            const { rows, fields } = await comoUsuario(db, ids.choferSeed, (tx) => tx.query('SELECT * FROM mi_ruta_hoy()'));
            const nombres = fields.map((f) => f.name);
            for (const prohibida of COLUMNAS_PROHIBIDAS) expect(nombres).not.toContain(prohibida);
            expect(JSON.stringify(rows)).not.toMatch(/76000001-9|76000002-7|76000003-5/);
        });

        it('devuelve las paradas del chofer de hoy ordenadas', async () => {
            const { rows } = await comoUsuario(db, ids.choferSeed, (tx) =>
                tx.query<ParadaChoferRow>('SELECT * FROM mi_ruta_hoy()'));
            expect(rows.map((r) => r.parada_id)).toEqual(ids.paradasSeed);
            expect(rows.map((r) => r.orden)).toEqual([1, 2, 3]);
            expect(rows[0]).toMatchObject({ vehiculo_patente: 'SEED01', razon_social: 'Florería Santa Cruz (seed)' });
        });

        it('otro chofer no ve la ruta ajena, solo la suya', async () => {
            const { rows } = await comoUsuario(db, ids.otroChofer, (tx) =>
                tx.query<ParadaChoferRow>('SELECT * FROM mi_ruta_hoy()'));
            expect(rows.map((r) => r.parada_id)).toEqual([ids.paradaOtro]);
        });

        it('un chofer sin ruta hoy y un vendedor reciben 0 filas', async () => {
            for (const sub of [ids.choferLibre, ids.vendedor]) {
                const { rows } = await comoUsuario(db, sub, (tx) => tx.query('SELECT * FROM mi_ruta_hoy()'));
                expect(rows).toEqual([]);
            }
        });

        it('anon no puede ejecutarla (42501)', async () => {
            await expect(comoUsuario(db, null, (tx) => tx.query('SELECT * FROM mi_ruta_hoy()')))
                .rejects.toMatchObject({ code: '42501' });
        });
    });

    describe('RLS sobre rutas_diarias y ruta_paradas', () => {
        const contarTablas = (sub: string) => comoUsuario(db, sub, (tx) =>
            tx.query<{ rutas: number; paradas: number }>(
                `SELECT (SELECT count(*)::int FROM rutas_diarias) AS rutas,
                        (SELECT count(*)::int FROM ruta_paradas) AS paradas`,
            ).then((r) => r.rows[0]));

        it('el chofer no lee las tablas directamente', async () => {
            expect(await contarTablas(ids.choferSeed)).toEqual({ rutas: 0, paradas: 0 });
        });

        it('el chofer no puede actualizar ruta_paradas directamente', async () => {
            const { affectedRows } = await comoUsuario(db, ids.choferSeed, (tx) =>
                tx.query(`UPDATE ruta_paradas SET estado = 'entregado', entregado_at = now() WHERE id = $1`,
                    [ids.paradasSeed[0]]));
            expect(affectedRows).toBe(0);
            const r = await uno<{ estado: string }>('SELECT estado FROM ruta_paradas WHERE id = $1', [ids.paradasSeed[0]]);
            expect(r.estado).toBe('pendiente');
        });

        it('el vendedor no lee las tablas', async () => {
            expect(await contarTablas(ids.vendedor)).toEqual({ rutas: 0, paradas: 0 });
        });

        it('el admin y el jefe de operaciones leen todas las rutas y paradas', async () => {
            for (const sub of [ids.admin, ids.jefe]) {
                expect(await contarTablas(sub)).toEqual({ rutas: 2, paradas: 4 });
            }
        });
    });

    describe('marcar_parada()', () => {
        const marcar = (sub: string | null, parada: number, estado: string, motivo: string | null = null) =>
            comoUsuario(db, sub, (tx) => tx.query('SELECT marcar_parada($1, $2, $3)', [parada, estado, motivo]));
        const leerParada = (id: number) => uno<{ estado: string; motivo_fallo: string | null; entregado_at: Date | null }>(
            'SELECT estado, motivo_fallo, entregado_at FROM ruta_paradas WHERE id = $1', [id]);

        it('guarda una entrega con su hora y sin motivo (AC-03-feliz)', async () => {
            await marcar(ids.choferSeed, ids.paradasSeed[0], 'entregado', 'se ignora');
            const p = await leerParada(ids.paradasSeed[0]);
            expect(p).toMatchObject({ estado: 'entregado', motivo_fallo: null });
            expect(p.entregado_at).toBeInstanceOf(Date);
        });

        it('guarda un fallo con el motivo recortado', async () => {
            await marcar(ids.choferSeed, ids.paradasSeed[1], 'fallido', '  Local cerrado  ');
            expect(await leerParada(ids.paradasSeed[1])).toMatchObject({ estado: 'fallido', motivo_fallo: 'Local cerrado' });
        });

        it('el chofer ve los estados guardados en mi_ruta_hoy()', async () => {
            const { rows } = await comoUsuario(db, ids.choferSeed, (tx) =>
                tx.query<ParadaChoferRow>('SELECT * FROM mi_ruta_hoy()'));
            expect(rows.map((r) => [r.estado, r.motivo_fallo])).toEqual([
                ['entregado', null], ['fallido', 'Local cerrado'], ['pendiente', null],
            ]);
        });

        it('no permite marcar dos veces la misma parada', async () => {
            await expect(marcar(ids.choferSeed, ids.paradasSeed[0], 'fallido', 'Otro'))
                .rejects.toMatchObject({ code: 'P0001', message: expect.stringMatching(/ya fue marcada como entregada/) });
            await expect(marcar(ids.choferSeed, ids.paradasSeed[1], 'entregado'))
                .rejects.toMatchObject({ code: 'P0001', message: expect.stringMatching(/ya fue marcada como no entregada/) });
        });

        it.each([null, '', '   '])('no permite fallar sin motivo: %j (AC-03-error)', async (motivo) => {
            await expect(marcar(ids.choferSeed, ids.paradasSeed[2], 'fallido', motivo))
                .rejects.toMatchObject({ code: 'P0001', message: 'Indica el motivo por el que no se pudo entregar.' });
        });

        it('acepta un motivo de 200 caracteres y rechaza uno de 201 (AC-03-límite)', async () => {
            await expect(marcar(ids.choferSeed, ids.paradasSeed[2], 'fallido', 'x'.repeat(201)))
                .rejects.toMatchObject({ code: 'P0001', message: 'El motivo no puede superar 200 caracteres.' });
            // Se deshace para dejar la parada pendiente para las pruebas siguientes
            await comoUsuario(db, ids.choferSeed, async (tx) => {
                await tx.query('SELECT marcar_parada($1, $2, $3)', [ids.paradasSeed[2], 'fallido', 'x'.repeat(200)]);
                await tx.rollback();
            });
            expect((await leerParada(ids.paradasSeed[2])).estado).toBe('pendiente');
        });

        it.each(['pendiente', 'ENTREGADO', ''])('rechaza el estado %j', async (estado) => {
            await expect(marcar(ids.choferSeed, ids.paradasSeed[2], estado))
                .rejects.toMatchObject({ code: 'P0001', message: 'Estado no válido: debe ser entregado o fallido.' });
        });

        it('no permite marcar una parada ajena ni una inexistente (42501)', async () => {
            await expect(marcar(ids.choferSeed, ids.paradaOtro, 'entregado')).rejects.toMatchObject({ code: '42501' });
            await expect(marcar(ids.otroChofer, ids.paradasSeed[2], 'entregado')).rejects.toMatchObject({ code: '42501' });
            await expect(marcar(ids.choferSeed, 999_999, 'entregado')).rejects.toMatchObject({ code: '42501' });
            expect((await leerParada(ids.paradaOtro)).estado).toBe('pendiente');
        });

        it('anon no puede ejecutarla (42501)', async () => {
            await expect(marcar(null, ids.paradasSeed[2], 'entregado')).rejects.toMatchObject({ code: '42501' });
        });

        it('una ruta cancelada no aparece ni se puede marcar', async () => {
            await db.query(`UPDATE rutas_diarias SET estado = 'cancelada' WHERE id = $1`, [ids.rutaOtro]);
            try {
                const { rows } = await comoUsuario(db, ids.otroChofer, (tx) => tx.query('SELECT * FROM mi_ruta_hoy()'));
                expect(rows).toEqual([]);
                await expect(marcar(ids.otroChofer, ids.paradaOtro, 'entregado'))
                    .rejects.toMatchObject({ code: 'P0001', message: expect.stringMatching(/cancelada/) });
            } finally {
                await db.query(`UPDATE rutas_diarias SET estado = 'planificada' WHERE id = $1`, [ids.rutaOtro]);
            }
        });

        it('el CHECK impide guardar un fallo sin motivo aun por SQL directo', async () => {
            await expect(db.query(`UPDATE ruta_paradas SET estado = 'fallido', motivo_fallo = '  ' WHERE id = $1`,
                [ids.paradasSeed[2]])).rejects.toMatchObject({ code: '23514', constraint: 'paradas_fallo_con_motivo' });
        });
    });

    describe('una ruta por vehículo y por chofer al día (RSK-04)', () => {
        // Como lo hace el planificador: con la sesión del jefe de operaciones (RLS activo)
        const crearRuta = (patente: string, usuarioChofer: string, fecha = HOY) => comoUsuario(db, ids.jefe, (tx) =>
            tx.query(
                `INSERT INTO rutas_diarias (fecha, sucursal_id, vehiculo_id, chofer_id)
                 SELECT ${fecha}, v.sucursal_id, v.id, ch.id
                   FROM vehiculos v, choferes ch WHERE v.patente = $1 AND ch.usuario_id = $2`,
                [patente, usuarioChofer],
            ));

        it('uq_ruta_vehiculo_fecha rechaza una segunda ruta del mismo vehículo', async () => {
            await expect(crearRuta('SEED01', ids.choferLibre))
                .rejects.toMatchObject({ code: '23505', constraint: 'uq_ruta_vehiculo_fecha' });
        });

        it('uq_ruta_chofer_fecha rechaza una segunda ruta del mismo chofer', async () => {
            await expect(crearRuta('SEED02', ids.choferSeed))
                .rejects.toMatchObject({ code: '23505', constraint: 'uq_ruta_chofer_fecha' });
        });

        it('el jefe de operaciones sí crea la ruta de otro día', async () => {
            const { affectedRows } = await crearRuta('SEED02', ids.choferLibre, `${HOY} + 1`);
            expect(affectedRows).toBe(1);
        });

        it('uq_parada_ruta_orden rechaza dos paradas con el mismo orden', async () => {
            await expect(db.query(
                `INSERT INTO ruta_paradas (ruta_id, pedido_id, orden)
                 SELECT ruta_id, $2, orden FROM ruta_paradas WHERE id = $1`,
                [ids.paradasSeed[0], ids.pedidoOtro],
            )).rejects.toMatchObject({ code: '23505', constraint: 'uq_parada_ruta_orden' });
        });
    });

    describe('seed_limpieza.sql', () => {
        it('borra lo de la semilla y no toca los demás datos', async () => {
            await db.exec(leerSql('seed_limpieza.sql'));
            const r = await uno<Record<string, number>>(
                `SELECT (SELECT count(*)::int FROM vehiculos WHERE patente LIKE 'SEED%') AS vehiculos_seed,
                        (SELECT count(*)::int FROM clientes WHERE razon_social LIKE '%(seed)') AS clientes_seed,
                        (SELECT count(*)::int FROM usuarios WHERE email = 'chofer.prueba@sgdf.test') AS usuario_seed,
                        (SELECT count(*)::int FROM rutas_diarias) AS rutas,
                        (SELECT count(*)::int FROM ruta_paradas) AS paradas,
                        (SELECT count(*)::int FROM usuarios) AS usuarios`,
            );
            expect(r).toEqual({ vehiculos_seed: 0, clientes_seed: 0, usuario_seed: 0, rutas: 1, paradas: 1, usuarios: 5 });
        });
    });
});
