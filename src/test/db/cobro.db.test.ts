import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, crearBaseConMigraciones, leerSql } from './supabase-pglite';

// PBI-11.1 · ADR-03 · DEF-11 — cobro en terreno registrado por marcar_parada()
// en la misma transacción que la entrega, insertando en `pagos`.

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
    choferA: '', choferB: '', vendedor: '',
    rutaA: 0, rutaB: 0, producto: 0, paradasSeed: [] as number[],
};

/**
 * Pedido nuevo con `total` (1 línea), opcionalmente con un pago de oficina,
 * y su parada pendiente al final de la ruta de hoy del chofer indicado.
 */
async function nuevaParada(total: number, pagoOficina = 0, ruta = ids.rutaA) {
    const { pedido } = await uno<{ pedido: number }>(
        `WITH c AS (
             INSERT INTO clientes (razon_social, lat, lng) VALUES ('Cliente cobro (test)', -34.6, -71.3) RETURNING id
         )
         INSERT INTO pedidos (cliente_id) SELECT id FROM c RETURNING id AS pedido`,
    );
    await db.query(
        `INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, 1, $3)`,
        [pedido, ids.producto, total],
    );
    if (pagoOficina > 0) {
        await db.query(
            `INSERT INTO pagos (pedido_id, cliente_id, monto, metodo_pago, nota)
             SELECT id, cliente_id, $2, 'transferencia', 'Pago de oficina (test)' FROM pedidos WHERE id = $1`,
            [pedido, pagoOficina],
        );
    }
    const { parada } = await uno<{ parada: number }>(
        `INSERT INTO ruta_paradas (ruta_id, pedido_id, orden)
         SELECT $1, $2, coalesce(max(orden), 0) + 1 FROM ruta_paradas WHERE ruta_id = $1
         RETURNING id AS parada`,
        [ruta, pedido],
    );
    return { parada, pedido };
}

interface Cobro { monto?: number | null; metodo?: string | null; referencia?: string | null }

/** Llama marcar_parada con la sesión del chofer, como la app (RPC). */
const marcar = (sub: string | null, parada: number, estado: string, motivo: string | null = null, cobro: Cobro = {}) =>
    comoUsuario(db, sub, (tx) => tx.query(
        'SELECT marcar_parada($1, $2, $3, $4, $5, $6)',
        [parada, estado, motivo, cobro.monto ?? null, cobro.metodo ?? null, cobro.referencia ?? null],
    ));

const leerParada = (id: number) => uno<{ estado: string; motivo_fallo: string | null }>(
    'SELECT estado, motivo_fallo FROM ruta_paradas WHERE id = $1', [id]);

const pagosDeParada = async (parada: number) => (await db.query<{
    monto: string; metodo_pago: string; referencia: string | null; nota: string; creado_por: string; parada_id: number;
}>('SELECT monto, metodo_pago, referencia, nota, creado_por, parada_id FROM pagos WHERE parada_id = $1', [parada])).rows;

const saldo = async (pedido: number) =>
    Number((await uno<{ saldo: string }>('SELECT saldo FROM pedidos WHERE id = $1', [pedido])).saldo);

describe('Cobro en terreno (PGlite)', () => {
    beforeAll(async () => {
        db = await crearBaseConMigraciones();

        // Semilla según el README: lista blanca, usuario de Auth y 2.ª pasada con la ruta de hoy
        await db.exec(leerSql('seed.sql'));
        ids.choferA = (await uno<{ id: string }>(
            `INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'chofer.prueba@sgdf.test') RETURNING id`,
        )).id;
        await db.exec(leerSql('seed.sql'));

        ids.choferB = await crearUsuario('chofer.b@sgdf.test', 'chofer');
        ids.vendedor = await crearUsuario('vendedor@sgdf.test', 'vendedor');

        ids.rutaA = (await uno<{ id: number }>(
            `SELECT rd.id FROM rutas_diarias rd JOIN vehiculos v ON v.id = rd.vehiculo_id WHERE v.patente = 'SEED01'`,
        )).id;
        // Producto propio: los de la semilla los borra seed_limpieza.sql
        ids.producto = (await uno<{ id: number }>(
            `INSERT INTO productos (nombre, stock_actual) VALUES ('Producto cobro (test)', 10000) RETURNING id`,
        )).id;
        ids.paradasSeed = (await db.query<{ id: number }>(
            'SELECT id FROM ruta_paradas WHERE ruta_id = $1 ORDER BY orden', [ids.rutaA],
        )).rows.map((r) => r.id);

        // Ruta de hoy del chofer B, en el otro vehículo de la semilla
        const { chofer } = await uno<{ chofer: number }>(
            `INSERT INTO choferes (usuario_id, nombre_completo) VALUES ($1, 'Chofer B (test)') RETURNING id AS chofer`,
            [ids.choferB],
        );
        ids.rutaB = (await uno<{ id: number }>(
            `INSERT INTO rutas_diarias (fecha, sucursal_id, vehiculo_id, chofer_id)
             SELECT (now() AT TIME ZONE 'America/Santiago')::date, sucursal_id, id, $1 FROM vehiculos WHERE patente = 'SEED02'
             RETURNING id`,
            [chofer],
        )).id;
    }, 60_000);

    afterAll(async () => {
        await db?.close();
    });

    describe('contrato', () => {
        it('queda una sola marcar_parada (la API no puede llamarla de forma ambigua)', async () => {
            const { rows } = await db.query<{ firma: string }>(
                `SELECT oid::regprocedure::text AS firma FROM pg_proc WHERE proname = 'marcar_parada'`,
            );
            expect(rows.map((r) => r.firma)).toEqual([
                'marcar_parada(bigint,text,text,numeric,text,text)',
            ]);
        });

        it('anon no tiene EXECUTE sobre la firma nueva y authenticated sí', async () => {
            const firma = 'public.marcar_parada(bigint, text, text, numeric, text, text)';
            const r = await uno<Record<string, boolean>>(
                `SELECT has_function_privilege('anon', '${firma}', 'EXECUTE') AS anon,
                        has_function_privilege('authenticated', '${firma}', 'EXECUTE') AS auth`,
            );
            expect(r).toEqual({ anon: false, auth: true });
        });

        it('la app actual sigue funcionando: llamada con nombre y solo 3 parámetros', async () => {
            const { parada, pedido } = await nuevaParada(10000);
            await comoUsuario(db, ids.choferA, (tx) => tx.query(
                'SELECT marcar_parada(p_parada_id => $1, p_estado => $2, p_motivo => $3)', [parada, 'entregado', null]));
            expect((await leerParada(parada)).estado).toBe('entregado');
            expect(await pagosDeParada(parada)).toEqual([]);
            expect(await saldo(pedido)).toBe(10000);
        });

        it('REG-02 · mi_ruta_hoy entrega monto_por_cobrar = saldo de cada pedido de la semilla', async () => {
            const { rows } = await comoUsuario(db, ids.choferA, (tx) =>
                tx.query<{ parada_id: number; monto_por_cobrar: string }>('SELECT parada_id, monto_por_cobrar FROM mi_ruta_hoy()'));
            const porParada = new Map(rows.map((r) => [r.parada_id, Number(r.monto_por_cobrar)]));
            // Santa Cruz sin pagos · Marchigüe con pago de oficina parcial · Palmilla pagado
            expect(ids.paradasSeed.map((p) => porParada.get(p))).toEqual([40000, 25000, 0]);
        });
    });

    describe('cobro junto con la entrega', () => {
        let paradaCob01 = 0;

        it('AC-COB-01 · entregado con $25.000 en efectivo sobre un saldo de $25.000', async () => {
            const { parada, pedido } = await nuevaParada(25000);
            paradaCob01 = parada;
            await marcar(ids.choferA, parada, 'entregado', null, { monto: 25000, metodo: 'efectivo' });

            expect((await leerParada(parada)).estado).toBe('entregado');
            expect(await pagosDeParada(parada)).toEqual([{
                monto: '25000.00', metodo_pago: 'efectivo', referencia: null,
                nota: 'Cobro en terreno', creado_por: ids.choferA, parada_id: parada,
            }]);
            expect(await saldo(pedido)).toBe(0);
        });

        it('AC-COB-02 · transferencia de $10.000 con referencia', async () => {
            const { parada, pedido } = await nuevaParada(25000);
            await marcar(ids.choferA, parada, 'entregado', null,
                { monto: 10000, metodo: 'transferencia', referencia: '  TRX-123  ' });

            const [pago] = await pagosDeParada(parada);
            expect(pago).toMatchObject({ monto: '10000.00', metodo_pago: 'transferencia', referencia: 'TRX-123' });
            expect(await saldo(pedido)).toBe(15000);
        });

        it('AC-COB-03 · entregado sin monto: sin pago y saldo sin cambio', async () => {
            const { parada, pedido } = await nuevaParada(25000);
            await marcar(ids.choferA, parada, 'entregado');

            expect((await leerParada(parada)).estado).toBe('entregado');
            expect(await pagosDeParada(parada)).toEqual([]);
            expect(await saldo(pedido)).toBe(25000);
        });

        it('AC-COB-04 · una segunda llamada sobre la misma parada falla y sigue habiendo 1 pago', async () => {
            await expect(marcar(ids.choferA, paradaCob01, 'entregado', null, { monto: 1000, metodo: 'efectivo' }))
                .rejects.toMatchObject({ code: 'P0001', message: expect.stringMatching(/ya fue marcada/) });
            expect(await pagosDeParada(paradaCob01)).toHaveLength(1);
        });

        it('el chofer ve el saldo actualizado en mi_ruta_hoy', async () => {
            const { rows } = await comoUsuario(db, ids.choferA, (tx) =>
                tx.query<{ parada_id: number; monto_por_cobrar: string }>('SELECT parada_id, monto_por_cobrar FROM mi_ruta_hoy()'));
            expect(Number(rows.find((r) => r.parada_id === paradaCob01)?.monto_por_cobrar)).toBe(0);
        });
    });

    describe('AC-COB-05 · validaciones del cobro', () => {
        it.each([
            ['monto mayor que el saldo', 'entregado', { monto: 30000, metodo: 'efectivo' }, 'El monto supera el saldo por cobrar ($25.000).'],
            ['monto 0', 'entregado', { monto: 0, metodo: 'efectivo' }, 'El monto debe ser mayor que 0.'],
            ['monto negativo', 'entregado', { monto: -1, metodo: 'efectivo' }, 'El monto debe ser mayor que 0.'],
            ['método cheque', 'entregado', { monto: 1000, metodo: 'cheque' }, 'Método de pago no válido.'],
            ['sin método', 'entregado', { monto: 1000 }, 'Método de pago no válido.'],
            ['transferencia sin referencia', 'entregado', { monto: 1000, metodo: 'transferencia' }, 'Indica la referencia de la transferencia.'],
            ['transferencia con referencia en blanco', 'entregado', { monto: 1000, metodo: 'transferencia', referencia: '   ' }, 'Indica la referencia de la transferencia.'],
            ['referencia de 101 caracteres', 'entregado', { monto: 1000, metodo: 'transferencia', referencia: 'x'.repeat(101) }, 'La referencia no puede superar 100 caracteres.'],
            ['fallido con monto', 'fallido', { monto: 1000, metodo: 'efectivo' }, 'Una entrega fallida no registra cobro.'],
        ] as const)('%s → error, parada pendiente y 0 pagos', async (_caso, estado, cobro, mensaje) => {
            const { parada, pedido } = await nuevaParada(25000);
            const motivo = estado === 'fallido' ? 'Cliente ausente' : null;

            await expect(marcar(ids.choferA, parada, estado, motivo, cobro))
                .rejects.toMatchObject({ code: 'P0001', message: mensaje });
            expect((await leerParada(parada)).estado).toBe('pendiente');
            expect(await pagosDeParada(parada)).toEqual([]);
            expect(await saldo(pedido)).toBe(25000);
        });

        it('acepta una referencia de exactamente 100 caracteres', async () => {
            const { parada } = await nuevaParada(25000);
            await marcar(ids.choferA, parada, 'entregado', null,
                { monto: 1000, metodo: 'transferencia', referencia: 'x'.repeat(100) });
            expect(await pagosDeParada(parada)).toHaveLength(1);
        });
    });

    describe('AC-COB-06 · todo o nada', () => {
        it('si el pago falla después de marcar la parada, la parada sigue pendiente', async () => {
            const { parada, pedido } = await nuevaParada(25000);
            // Un pago ya vinculado a la parada hace fallar el INSERT de la función
            // DESPUÉS de su UPDATE (uq_pago_parada): la transacción debe deshacer ambos.
            await db.query(
                `INSERT INTO pagos (pedido_id, cliente_id, monto, metodo_pago, nota, parada_id)
                 SELECT id, cliente_id, 1000, 'efectivo', 'Pago previo (test)', $2 FROM pedidos WHERE id = $1`,
                [pedido, parada],
            );

            await expect(marcar(ids.choferA, parada, 'entregado', null, { monto: 5000, metodo: 'efectivo' }))
                .rejects.toMatchObject({ code: '23505', constraint: 'uq_pago_parada' });
            expect((await leerParada(parada)).estado).toBe('pendiente');
            expect(await pagosDeParada(parada)).toHaveLength(1);
            expect(await saldo(pedido)).toBe(24000);
        });

        it('si el monto supera el saldo, no cambia la parada ni el saldo', async () => {
            const { parada, pedido } = await nuevaParada(30000, 10000);
            await expect(marcar(ids.choferA, parada, 'entregado', null, { monto: 20001, metodo: 'efectivo' }))
                .rejects.toMatchObject({ message: 'El monto supera el saldo por cobrar ($20.000).' });
            expect((await leerParada(parada)).estado).toBe('pendiente');
            expect(await saldo(pedido)).toBe(20000);
        });
    });

    describe('RNF-CONF-02 · envíos repetidos', () => {
        it('50 llamadas a la misma parada con cobro dejan exactamente 1 pago', async () => {
            const { parada, pedido } = await nuevaParada(25000);
            const resultados = await Promise.allSettled(Array.from({ length: 50 }, () =>
                marcar(ids.choferA, parada, 'entregado', null, { monto: 5000, metodo: 'efectivo' })));

            expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
            for (const r of resultados.filter((x) => x.status === 'rejected')) {
                expect((r as PromiseRejectedResult).reason.message).toMatch(/ya fue marcada/);
            }
            expect(await pagosDeParada(parada)).toHaveLength(1);
            expect(await saldo(pedido)).toBe(20000);
        });
    });

    describe('AC-SEC-01 · cobro en parada ajena', () => {
        it('el chofer B no puede cobrar en una parada del chofer A (42501, 0 pagos)', async () => {
            const { parada, pedido } = await nuevaParada(25000);
            await expect(marcar(ids.choferB, parada, 'entregado', null, { monto: 25000, metodo: 'efectivo' }))
                .rejects.toMatchObject({ code: '42501' });
            expect((await leerParada(parada)).estado).toBe('pendiente');
            expect(await pagosDeParada(parada)).toEqual([]);
            expect(await saldo(pedido)).toBe(25000);
        });

        it('anon no puede llamar a marcar_parada (42501)', async () => {
            const { parada } = await nuevaParada(25000);
            await expect(marcar(null, parada, 'entregado', null, { monto: 1000, metodo: 'efectivo' }))
                .rejects.toMatchObject({ code: '42501' });
        });

        it('el chofer cobra pero no puede leer pagos ni pedidos directamente', async () => {
            const r = await comoUsuario(db, ids.choferA, (tx) => tx.query<{ pagos: number; pedidos: number }>(
                `SELECT (SELECT count(*)::int FROM pagos) AS pagos, (SELECT count(*)::int FROM pedidos) AS pedidos`,
            ).then((x) => x.rows[0]));
            expect(r).toEqual({ pagos: 0, pedidos: 0 });
        });
    });

    describe('REG-01 · AC-REG-01 · fallido con motivo', () => {
        it('REG-01 · estado y motivo persisten y no se crea pago', async () => {
            const { parada, pedido } = await nuevaParada(25000);
            await marcar(ids.choferA, parada, 'fallido', '  Local cerrado  ');
            expect(await leerParada(parada)).toEqual({ estado: 'fallido', motivo_fallo: 'Local cerrado' });
            expect(await pagosDeParada(parada)).toEqual([]);
            expect(await saldo(pedido)).toBe(25000);
        });
    });

    describe('RNF-INT-01 · integridad de saldos', () => {
        it('pago de oficina y luego cobro en terreno sobre el mismo pedido', async () => {
            const { parada, pedido } = await nuevaParada(30000);
            await comoUsuario(db, ids.vendedor, (tx) => tx.query(
                `INSERT INTO pagos (pedido_id, cliente_id, monto, metodo_pago, creado_por)
                 SELECT id, cliente_id, 10000, 'efectivo', auth.uid() FROM pedidos WHERE id = $1`, [pedido]));

            const { rows } = await comoUsuario(db, ids.choferA, (tx) =>
                tx.query<{ parada_id: number; monto_por_cobrar: string }>('SELECT parada_id, monto_por_cobrar FROM mi_ruta_hoy()'));
            expect(Number(rows.find((r) => r.parada_id === parada)?.monto_por_cobrar)).toBe(20000);

            await marcar(ids.choferA, parada, 'entregado', null, { monto: 20000, metodo: 'efectivo' });
            expect(await saldo(pedido)).toBe(0);
        });

        it('en todos los pedidos total_pagado = SUM(pagos.monto) y saldo >= 0', async () => {
            const { rows } = await db.query<{ id: number }>(
                `SELECT p.id FROM pedidos p
                  WHERE p.total_pagado <> (SELECT coalesce(sum(monto), 0) FROM pagos WHERE pedido_id = p.id)
                     OR p.saldo < 0`,
            );
            expect(rows).toEqual([]);
            // Hay cobros de oficina y de terreno en la base para que la comprobación valga
            const r = await uno<{ terreno: number; oficina: number }>(
                `SELECT count(*) FILTER (WHERE parada_id IS NOT NULL)::int AS terreno,
                        count(*) FILTER (WHERE parada_id IS NULL)::int AS oficina FROM pagos`,
            );
            expect(r.terreno).toBeGreaterThanOrEqual(5);
            expect(r.oficina).toBeGreaterThanOrEqual(3);
        });
    });

    describe('semillas', () => {
        it('seed_medicion.sql deja una ruta de hoy con 20 paradas pendientes con saldo', async () => {
            await db.exec(leerSql('seed_medicion.sql'));
            await db.exec(leerSql('seed_medicion.sql')); // idempotente
            const { rows } = await comoUsuario(db, ids.choferA, (tx) =>
                tx.query<{ estado: string; monto_por_cobrar: string }>('SELECT estado, monto_por_cobrar FROM mi_ruta_hoy()'));
            expect(rows).toHaveLength(20);
            expect(rows.every((r) => r.estado === 'pendiente' && Number(r.monto_por_cobrar) === 20000)).toBe(true);
            const rut = await uno<{ invalidos: number; clientes: number }>(
                `SELECT count(*)::int AS clientes,
                        count(*) FILTER (WHERE rut !~ '^770000[0-9]{2}-[0-9K]$')::int AS invalidos
                   FROM clientes WHERE razon_social LIKE '% (medición)'`,
            );
            expect(rut).toEqual({ clientes: 20, invalidos: 0 });
        });

        it('una medición con cobros se puede repetir: vuelve a dejar el saldo completo', async () => {
            const { rows: [p] } = await comoUsuario(db, ids.choferA, (tx) =>
                tx.query<{ parada_id: number }>('SELECT parada_id FROM mi_ruta_hoy() LIMIT 1'));
            await marcar(ids.choferA, p.parada_id, 'entregado', null, { monto: 20000, metodo: 'efectivo' });
            await db.exec(leerSql('seed_medicion.sql'));
            const { rows } = await comoUsuario(db, ids.choferA, (tx) =>
                tx.query<{ estado: string; monto_por_cobrar: string }>('SELECT estado, monto_por_cobrar FROM mi_ruta_hoy()'));
            expect(rows.every((r) => r.estado === 'pendiente' && Number(r.monto_por_cobrar) === 20000)).toBe(true);
        });

        it('seed_limpieza.sql borra semilla, medición y sus cobros aunque haya pagos de terreno', async () => {
            const { rows: [p] } = await comoUsuario(db, ids.choferA, (tx) =>
                tx.query<{ parada_id: number }>('SELECT parada_id FROM mi_ruta_hoy() LIMIT 1'));
            await marcar(ids.choferA, p.parada_id, 'entregado', null, { monto: 5000, metodo: 'efectivo' });

            await db.exec(leerSql('seed_limpieza.sql'));
            const r = await uno<Record<string, number>>(
                `SELECT (SELECT count(*)::int FROM clientes WHERE razon_social LIKE '%(seed)' OR razon_social LIKE '%(medición)') AS clientes,
                        (SELECT count(*)::int FROM pedidos WHERE nota LIKE '%(seed)') AS pedidos,
                        (SELECT count(*)::int FROM vehiculos WHERE patente LIKE 'SEED%') AS vehiculos`,
            );
            expect(r).toEqual({ clientes: 0, pedidos: 0, vehiculos: 0 });
        });
    });
});
