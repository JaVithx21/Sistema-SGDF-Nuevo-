import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, crearBaseConMigraciones, leerSql } from './supabase-pglite';

// DEF-09 / DEF-10 / DEF-11 · AC-SEC-01 / AC-SEC-02 · RNF-SEG-02 — permisos por
// rol sobre clientes, pedidos, detalle_pedidos y pagos, y funciones heredadas
// (liquidar_ruta, sync_checkpoint, calcular_iel) sin acceso anónimo.

const TABLAS_OFICINA = ['clientes', 'pedidos', 'detalle_pedidos', 'pagos'] as const;

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
    chofer: '', vendedor: '', jefe: '', gerente: '', admin: '', sinFila: '',
    ruta: 0, parada: 0, pedidos: [] as number[],
};

/** Filas visibles en cada tabla de oficina para el usuario `sub`. */
const contarVisibles = (sub: string) => comoUsuario(db, sub, (tx) =>
    tx.query<Record<(typeof TABLAS_OFICINA)[number], number>>(
        `SELECT ${TABLAS_OFICINA.map((t) => `(SELECT count(*)::int FROM ${t}) AS ${t}`).join(', ')}`,
    ).then((r) => r.rows[0]));

const contarPagos = async () => (await uno<{ n: number }>('SELECT count(*)::int AS n FROM pagos')).n;

const leerPedido = (id: number) => uno<{ total: string; total_pagado: string; saldo: string }>(
    'SELECT total, total_pagado, saldo FROM pedidos WHERE id = $1', [id]);

/**
 * Inserta un pago con la sesión de `sub`, como lo hace Finanzas. El cliente se
 * lee fuera de la sesión para que el INSERT llegue a la política aunque `sub`
 * no pueda ver el pedido.
 */
const insertarPago = async (sub: string, pedidoId: number, monto: number) => {
    const { cliente_id } = await uno<{ cliente_id: number }>('SELECT cliente_id FROM pedidos WHERE id = $1', [pedidoId]);
    return comoUsuario(db, sub, (tx) => tx.query(
        `INSERT INTO pagos (pedido_id, cliente_id, monto, metodo_pago, creado_por)
         VALUES ($1, $2, $3, 'efectivo', auth.uid())`,
        [pedidoId, cliente_id, monto],
    ));
};

describe('Permisos por rol (PGlite)', () => {
    beforeAll(async () => {
        db = await crearBaseConMigraciones();

        // Semilla según el README: lista blanca, usuario de Auth y 2.ª pasada con la ruta de hoy
        await db.exec(leerSql('seed.sql'));
        ids.chofer = (await uno<{ id: string }>(
            `INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'chofer.prueba@sgdf.test') RETURNING id`,
        )).id;
        await db.exec(leerSql('seed.sql'));

        ids.vendedor = await crearUsuario('vendedor@sgdf.test', 'vendedor');
        ids.jefe = await crearUsuario('jefe@sgdf.test', 'jefe_operaciones');
        ids.gerente = await crearUsuario('gerente@sgdf.test', 'gerente');
        ids.admin = await crearUsuario('admin@sgdf.test', 'admin');
        // JWT válido de alguien que no está en `usuarios`: private.get_user_role() lo
        // trataría como 'vendedor'; la política nueva no debe darle acceso.
        ids.sinFila = (await uno<{ id: string }>('SELECT gen_random_uuid() AS id')).id;

        const r = await uno<{ ruta: number; parada: number }>(
            `SELECT rd.id AS ruta, min(rp.id) AS parada FROM rutas_diarias rd
               JOIN vehiculos v ON v.id = rd.vehiculo_id JOIN ruta_paradas rp ON rp.ruta_id = rd.id
              WHERE v.patente = 'SEED01' GROUP BY rd.id`,
        );
        ids.ruta = r.ruta;
        ids.parada = r.parada;
        ids.pedidos = (await db.query<{ id: number }>(
            // Por RUT: [0] Santa Cruz (sin pagos) · [1] Marchigüe (pago de oficina parcial)
            `SELECT p.id FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
              WHERE p.nota = 'Pedido de ensayo (seed)' ORDER BY c.rut`,
        )).rows.map((p) => p.id);
    }, 60_000);

    afterAll(async () => {
        await db?.close();
    });

    describe('migración', () => {
        it('se puede aplicar dos veces', async () => {
            await db.exec(leerSql('migrations/20261116100000_permisos_por_rol.sql'));
        });

        it('DELETE sigue siendo solo de admin y pagos UPDATE también', async () => {
            const { rows } = await db.query<{ policyname: string; qual: string }>(
                `SELECT policyname, qual FROM pg_policies
                  WHERE tablename IN ('clientes', 'pedidos', 'detalle_pedidos', 'pagos')
                    AND (cmd = 'DELETE' OR policyname = 'pagos_update') ORDER BY policyname`,
            );
            expect(rows.map((r) => r.policyname)).toEqual([
                'clientes_delete', 'detalle_pedidos_delete', 'pagos_delete', 'pagos_update', 'pedidos_delete',
            ]);
            for (const r of rows) expect(r.qual).toMatch(/es_admin/);
        });

        it('ninguna política de SELECT, INSERT o UPDATE queda abierta a cualquier sesión', async () => {
            const { rows } = await db.query<{ policyname: string }>(
                `SELECT policyname FROM pg_policies
                  WHERE tablename IN ('clientes', 'pedidos', 'detalle_pedidos', 'pagos')
                    AND cmd IN ('SELECT', 'INSERT', 'UPDATE')
                    AND (coalesce(qual, '') ~ '^true$|auth\\.uid\\(\\) IS NOT NULL'
                      OR coalesce(with_check, '') ~ '^true$|auth\\.uid\\(\\) IS NOT NULL')`,
            );
            expect(rows).toEqual([]);
        });
    });

    describe('funciones heredadas (AC-SEC-02 · DEF-09)', () => {
        const liquidar = (sub: string | null) => comoUsuario(db, sub, (tx) =>
            tx.query('SELECT liquidar_ruta($1, 10, 1, 1050)', [ids.ruta]));
        const sincronizar = (sub: string | null) => comoUsuario(db, sub, (tx) =>
            tx.query(`SELECT sync_checkpoint($1, 'entregado', -34.6, -71.3, 5, now(), NULL, NULL, 25000, 'efectivo')`,
                [ids.parada]));

        it('anon no puede llamar a liquidar_ruta y la ruta sigue en su estado original', async () => {
            await expect(liquidar(null)).rejects.toMatchObject({ code: '42501' });
            const r = await uno<{ estado: string; liquidaciones: number }>(
                `SELECT estado, (SELECT count(*)::int FROM liquidaciones_ruta WHERE ruta_id = $1) AS liquidaciones
                   FROM rutas_diarias WHERE id = $1`,
                [ids.ruta],
            );
            expect(r).toEqual({ estado: 'planificada', liquidaciones: 0 });
        });

        it('anon no puede llamar a sync_checkpoint y no se crea checkpoint ni cobro', async () => {
            await expect(sincronizar(null)).rejects.toMatchObject({ code: '42501' });
            const r = await uno<{ checkpoints: number; cobros: number }>(
                `SELECT (SELECT count(*)::int FROM checkpoints) AS checkpoints,
                        (SELECT count(*)::int FROM checkpoint_pagos) AS cobros`,
            );
            expect(r).toEqual({ checkpoints: 0, cobros: 0 });
        });

        it('un usuario con sesión (chofer o jefe) tampoco puede llamarlas', async () => {
            for (const sub of [ids.chofer, ids.jefe]) {
                await expect(liquidar(sub)).rejects.toMatchObject({ code: '42501' });
                await expect(sincronizar(sub)).rejects.toMatchObject({ code: '42501' });
            }
            expect((await uno<{ estado: string }>('SELECT estado FROM rutas_diarias WHERE id = $1', [ids.ruta])).estado)
                .toBe('planificada');
        });

        it('calcular_iel queda sin EXECUTE para anon y public, y authenticated la conserva', async () => {
            const firma = 'public.calcular_iel(numeric, numeric, integer, integer, integer, integer)';
            const r = await uno<Record<string, boolean>>(
                `SELECT has_function_privilege('anon', '${firma}', 'EXECUTE') AS anon,
                        has_function_privilege('authenticated', '${firma}', 'EXECUTE') AS authenticated,
                        EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                                 WHERE p.oid = '${firma}'::regprocedure AND a.grantee = 0) AS public`,
            );
            expect(r).toEqual({ anon: false, authenticated: true, public: false });
        });
    });

    describe('chofer sin acceso directo (AC-SEC-01 · DEF-10)', () => {
        it('lectura: el chofer ve 0 filas en clientes, pedidos, detalle_pedidos y pagos', async () => {
            expect(await contarVisibles(ids.chofer)).toEqual({ clientes: 0, pedidos: 0, detalle_pedidos: 0, pagos: 0 });
        });

        it('escritura: el chofer no puede insertar un pago', async () => {
            const antes = await contarPagos();
            await expect(insertarPago(ids.chofer, ids.pedidos[0], 1000)).rejects.toMatchObject({ code: '42501' });
            expect(await contarPagos()).toBe(antes);
        });

        it('escritura: UPDATE pedidos SET total_pagado = total afecta 0 filas', async () => {
            const { affectedRows } = await comoUsuario(db, ids.chofer, (tx) =>
                tx.query('UPDATE pedidos SET total_pagado = total WHERE id = $1', [ids.pedidos[0]]));
            expect(affectedRows).toBe(0);
            expect(Number((await leerPedido(ids.pedidos[0])).total_pagado)).toBe(0);
        });

        it('escritura: tampoco puede crear clientes ni cambiar el detalle', async () => {
            await expect(comoUsuario(db, ids.chofer, (tx) => tx.query(
                `INSERT INTO clientes (razon_social, rut) VALUES ('Intruso', '22222222-2')`,
            ))).rejects.toMatchObject({ code: '42501' });
            const { affectedRows } = await comoUsuario(db, ids.chofer, (tx) =>
                tx.query('UPDATE detalle_pedidos SET cantidad = cantidad + 1'));
            expect(affectedRows).toBe(0);
        });

        it('el chofer sigue viendo su ruta por mi_ruta_hoy()', async () => {
            const { rows } = await comoUsuario(db, ids.chofer, (tx) => tx.query('SELECT * FROM mi_ruta_hoy()'));
            expect(rows).toHaveLength(3);
        });
    });

    describe('usuario autenticado sin fila en usuarios', () => {
        it('no lee clientes ni ninguna tabla de oficina', async () => {
            expect(await contarVisibles(ids.sinFila)).toEqual({ clientes: 0, pedidos: 0, detalle_pedidos: 0, pagos: 0 });
        });

        it('no puede insertar un pago', async () => {
            await expect(insertarPago(ids.sinFila, ids.pedidos[0], 1000)).rejects.toMatchObject({ code: '42501' });
        });
    });

    describe('regresión de la oficina', () => {
        it('admin, gerente, jefe de operaciones y vendedor leen clientes, pedidos y detalle', async () => {
            for (const sub of [ids.admin, ids.gerente, ids.jefe, ids.vendedor]) {
                const r = await contarVisibles(sub);
                expect(r.clientes).toBeGreaterThanOrEqual(3);
                expect(r.pedidos).toBe(3);
                expect(r.detalle_pedidos).toBe(6);
            }
        });

        it('el vendedor registra un pago y el trigger actualiza total_pagado y saldo', async () => {
            await insertarPago(ids.vendedor, ids.pedidos[0], 15000);
            expect(await leerPedido(ids.pedidos[0])).toEqual({ total: '40000.00', total_pagado: '15000.00', saldo: '25000.00' });
        });

        it('el jefe de operaciones registra un pago y el trigger actualiza total_pagado y saldo', async () => {
            // La semilla deja $25.000 de saldo tras el pago de oficina parcial
            await insertarPago(ids.jefe, ids.pedidos[1], 25000);
            expect(await leerPedido(ids.pedidos[1])).toEqual({ total: '40000.00', total_pagado: '40000.00', saldo: '0.00' });
        });

        it('el vendedor crea un cliente, un pedido con detalle y lo edita', async () => {
            await comoUsuario(db, ids.vendedor, async (tx) => {
                const { rows: [c] } = await tx.query<{ id: number }>(
                    `INSERT INTO clientes (razon_social, rut) VALUES ('Cliente oficina (test)', '33333333-3') RETURNING id`);
                const { rows: [p] } = await tx.query<{ id: number }>(
                    `INSERT INTO pedidos (cliente_id, creado_por) VALUES ($1, auth.uid()) RETURNING id`, [c.id]);
                await tx.query(
                    `INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario)
                     SELECT $1, producto_id, 1, precio_unitario FROM detalle_pedidos LIMIT 1`, [p.id]);
                const { affectedRows } = await tx.query(`UPDATE pedidos SET nota = 'editado' WHERE id = $1`, [p.id]);
                expect(affectedRows).toBe(1);
                await tx.rollback();
            });
        });

        it('pagos: el vendedor no puede editar ni borrar (sigue siendo solo admin)', async () => {
            const antes = await contarPagos();
            const editar = await comoUsuario(db, ids.vendedor, (tx) => tx.query('UPDATE pagos SET nota = $1', ['x']));
            const borrar = await comoUsuario(db, ids.vendedor, (tx) => tx.query('DELETE FROM pagos'));
            expect([editar.affectedRows, borrar.affectedRows]).toEqual([0, 0]);
            expect(await contarPagos()).toBe(antes);
        });
    });
});
