import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { comoUsuario, crearBaseConMigraciones } from './supabase-pglite';

// DEF-15 · DEF-14 · AC-02-guardado · REG-03 — guardar_ruta() guarda la ruta y
// sus paradas en una sola transacción y revalida en la base la capacidad, el
// orden, los pedidos y la ubicación, sin confiar en datos del navegador.

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
    jefe: '', admin: '', vendedor: '', choferUsuario: '',
    sucursal: 0, producto: 0, pesado: 0,
};

let correlativo = 0;

/** Chofer activo con un vehículo propio de la capacidad indicada. */
async function crearChofer(capVolM3: number, capPesoKg: number | null): Promise<number> {
    correlativo += 1;
    const usuario = await crearUsuario(`chofer${correlativo}@sgdf.test`, 'chofer');
    const { vehiculo } = await uno<{ vehiculo: number }>(
        `INSERT INTO vehiculos (patente, rendimiento_kml, capacidad_vol_m3, capacidad_peso_kg, sucursal_id)
         VALUES ($1, 10, $2, $3, $4) RETURNING id AS vehiculo`,
        [`GR${String(correlativo).padStart(4, '0')}`, capVolM3, capPesoKg, ids.sucursal],
    );
    return (await uno<{ id: number }>(
        `INSERT INTO choferes (usuario_id, nombre_completo, vehiculo_default_id) VALUES ($1, 'Chofer (test)', $2) RETURNING id`,
        [usuario, vehiculo],
    )).id;
}

/** Pedido de `unidades` del producto indicado; el cliente tiene ubicación y ventana salvo que se pida lo contrario. */
async function crearPedido(unidades = 1, opciones: { producto?: number; sinUbicacion?: boolean; estado?: string } = {}) {
    const ubicacion = opciones.sinUbicacion ? [null, null] : [-34.6 - correlativo / 1000, -71.3];
    correlativo += 1;
    const { cliente } = await uno<{ cliente: number }>(
        `INSERT INTO clientes (razon_social, lat, lng, ventana_inicio, ventana_fin)
         VALUES ('Cliente ruta (test)', $1, $2, '09:00', '13:00') RETURNING id AS cliente`,
        ubicacion,
    );
    const { pedido } = await uno<{ pedido: number }>(
        `INSERT INTO pedidos (cliente_id, estado) VALUES ($1, $2) RETURNING id AS pedido`,
        [cliente, opciones.estado ?? 'pendiente'],
    );
    await db.query(
        `INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, 1000)`,
        [pedido, opciones.producto ?? ids.producto, unidades],
    );
    return pedido;
}

const paradasDe = (pedidos: number[], ordenes = pedidos.map((_, i) => i + 1)) =>
    pedidos.map((pedido_id, i) => ({ pedido_id, orden: ordenes[i], km_acumulados: (i + 1) * 5 }));

const RESUMEN = {
    km_planificados: 42.5, duracion_s: 5400, simulada: false,
    geojson_ruta: { type: 'LineString', coordinates: [[-71.3, -34.6], [-71.4, -34.7]] },
    advertencias: ['Ruta de prueba'], bencina_proyectada_lts: 4.25, costo_bencina_proyectado: 4462,
    precio_litro_referencia: 1050,
};

/** Llama guardar_ruta con la sesión de `sub`, para la fecha de hoy + `dias`. */
const guardar = (sub: string | null, chofer: number, paradas: unknown, resumen: unknown = RESUMEN, dias = 1) =>
    comoUsuario(db, sub, (tx) => tx.query<{ id: number }>(
        `SELECT guardar_ruta((now() AT TIME ZONE 'America/Santiago')::date + $1::int, $2, $3, $4::jsonb, $5::jsonb) AS id`,
        [dias, ids.sucursal, chofer, JSON.stringify(paradas), JSON.stringify(resumen)],
    )).then((r) => Number(r.rows[0].id));

const contar = () => uno<{ rutas: number; paradas: number }>(
    `SELECT (SELECT count(*)::int FROM rutas_diarias) AS rutas, (SELECT count(*)::int FROM ruta_paradas) AS paradas`);

/** Verifica que la llamada falla con `error` y que no quedó nada guardado. */
async function esperarRechazoSinGuardar(llamada: Promise<unknown>, error: object) {
    const antes = await contar();
    await expect(llamada).rejects.toMatchObject(error);
    expect(await contar()).toEqual(antes);
}

describe('guardar_ruta() (PGlite)', () => {
    beforeAll(async () => {
        db = await crearBaseConMigraciones();
        ids.jefe = await crearUsuario('jefe@sgdf.test', 'jefe_operaciones');
        ids.admin = await crearUsuario('admin@sgdf.test', 'admin');
        ids.vendedor = await crearUsuario('vendedor@sgdf.test', 'vendedor');

        ids.sucursal = (await uno<{ id: number }>(
            `INSERT INTO sucursales (nombre, direccion, lat, lng) VALUES ('Bodega (test)', 'Peralillo', -34.48, -71.49) RETURNING id`,
        )).id;
        // 0,02 m³ y 1 kg por unidad; el "pesado" casi no ocupa volumen
        ids.producto = (await uno<{ id: number }>(
            `INSERT INTO productos (nombre, stock_actual, volumen_unitario_m3, peso_unitario_kg)
             VALUES ('Caja (test)', 100000, 0.02, 1) RETURNING id`,
        )).id;
        ids.pesado = (await uno<{ id: number }>(
            `INSERT INTO productos (nombre, stock_actual, volumen_unitario_m3, peso_unitario_kg)
             VALUES ('Saco (test)', 100000, 0.001, 50) RETURNING id`,
        )).id;
    }, 60_000);

    afterAll(async () => {
        await db?.close();
    });

    describe('contrato', () => {
        it('anon no tiene EXECUTE y authenticated sí', async () => {
            const firma = 'public.guardar_ruta(date, bigint, bigint, jsonb, jsonb)';
            const r = await uno<Record<string, boolean>>(
                `SELECT has_function_privilege('anon', '${firma}', 'EXECUTE') AS anon,
                        has_function_privilege('authenticated', '${firma}', 'EXECUTE') AS auth`,
            );
            expect(r).toEqual({ anon: false, auth: true });
        });
    });

    describe('caso normal', () => {
        it('el jefe de operaciones guarda 3 pedidos: 1 ruta y 3 paradas con datos de la base', async () => {
            const chofer = await crearChofer(13, 1289);
            const pedidos = [await crearPedido(2), await crearPedido(3), await crearPedido(1)];
            const antes = await contar();

            const rutaId = await guardar(ids.jefe, chofer, paradasDe(pedidos));

            expect(await contar()).toEqual({ rutas: antes.rutas + 1, paradas: antes.paradas + 3 });
            const ruta = await uno<Record<string, unknown>>(
                `SELECT estado, chofer_id, creado_por, km_planificados, duracion_s, volumen_total_m3, simulada,
                        geojson_ruta IS NOT NULL AS con_trazado, advertencias, bencina_proyectada_lts,
                        vehiculo_id = (SELECT vehiculo_default_id FROM choferes WHERE id = $2) AS vehiculo_del_chofer
                   FROM rutas_diarias WHERE id = $1`,
                [rutaId, chofer],
            );
            expect(ruta).toEqual({
                estado: 'planificada', chofer_id: chofer, creado_por: ids.jefe, km_planificados: '42.50',
                duracion_s: 5400, volumen_total_m3: '0.1200', simulada: false, con_trazado: true,
                advertencias: ['Ruta de prueba'], bencina_proyectada_lts: '4.25', vehiculo_del_chofer: true,
            });

            // lat, lng, ventanas y volumen vienen de clientes y productos, no del llamador
            const { rows } = await db.query<Record<string, unknown>>(
                `SELECT rp.pedido_id, rp.orden, rp.lat_destino = c.lat AND rp.lng_destino = c.lng AS destino_del_cliente,
                        rp.ventana_inicio, rp.ventana_fin, rp.km_acumulados, rp.volumen_parada_m3
                   FROM ruta_paradas rp JOIN pedidos p ON p.id = rp.pedido_id JOIN clientes c ON c.id = p.cliente_id
                  WHERE rp.ruta_id = $1 ORDER BY rp.orden`,
                [rutaId],
            );
            expect(rows).toEqual([
                { pedido_id: pedidos[0], orden: 1, destino_del_cliente: true, ventana_inicio: '09:00:00', ventana_fin: '13:00:00', km_acumulados: '5.00', volumen_parada_m3: '0.0400' },
                { pedido_id: pedidos[1], orden: 2, destino_del_cliente: true, ventana_inicio: '09:00:00', ventana_fin: '13:00:00', km_acumulados: '10.00', volumen_parada_m3: '0.0600' },
                { pedido_id: pedidos[2], orden: 3, destino_del_cliente: true, ventana_inicio: '09:00:00', ventana_fin: '13:00:00', km_acumulados: '15.00', volumen_parada_m3: '0.0200' },
            ]);
        });

        it('el admin también puede; una ruta simulada se guarda sin trazado y con los topes de la app', async () => {
            const chofer = await crearChofer(13, null);
            const rutaId = await guardar(ids.admin, chofer, paradasDe([await crearPedido()]), {
                ...RESUMEN, simulada: true, km_planificados: 123456, bencina_proyectada_lts: null,
                advertencias: Array.from({ length: 12 }, (_, i) => `aviso ${i + 1}`).concat([42 as unknown as string]),
            });
            const r = await uno<Record<string, unknown>>(
                `SELECT simulada, geojson_ruta, km_planificados, bencina_proyectada_lts, cardinality(advertencias) AS avisos
                   FROM rutas_diarias WHERE id = $1`, [rutaId]);
            expect(r).toEqual({ simulada: true, geojson_ruta: null, km_planificados: '9999.00', bencina_proyectada_lts: null, avisos: 10 });
        });
    });

    describe('AC-02-guardado (base) · capacidad revalidada en la base', () => {
        it('volumen: pedidos que suman más que la capacidad → error y nada guardado', async () => {
            // 3 × 0,02 m³ = 0,06 m³ en un vehículo de 0,05 m³
            const chofer = await crearChofer(0.05, null);
            const pedidos = [await crearPedido(), await crearPedido(), await crearPedido()];
            await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe(pedidos)),
                { code: 'P0001', message: 'La carga supera la capacidad del vehículo (volumen).' });
        });

        it('peso: 3 sacos de 50 kg en un vehículo de 100 kg → error y nada guardado', async () => {
            const chofer = await crearChofer(13, 100);
            const pedidos = [1, 2, 3].map(() => crearPedido(1, { producto: ids.pesado }));
            await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe(await Promise.all(pedidos))),
                { code: 'P0001', message: 'La carga supera la capacidad del vehículo (peso).' });
        });

        it('sin capacidad de peso registrada no limita por peso', async () => {
            const chofer = await crearChofer(13, null);
            const pedidos = await Promise.all([1, 2, 3].map(() => crearPedido(1, { producto: ids.pesado })));
            expect(await guardar(ids.jefe, chofer, paradasDe(pedidos))).toBeGreaterThan(0);
        });

        it('justo en el límite de volumen se acepta', async () => {
            const chofer = await crearChofer(0.06, null);
            const pedidos = [await crearPedido(), await crearPedido(), await crearPedido()];
            expect(await guardar(ids.jefe, chofer, paradasDe(pedidos))).toBeGreaterThan(0);
        });
    });

    describe('DEF-15 · atomicidad', () => {
        it('3.ª parada con un pedido inexistente → error y 0 rutas y 0 paradas', async () => {
            const chofer = await crearChofer(13, null);
            const pedidos = [await crearPedido(), await crearPedido(), 999_999];
            await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe(pedidos)),
                { code: 'P0001', message: 'El pedido #999999 no existe.' });
        });

        it('3.ª parada con un pedido repetido → error y nada guardado', async () => {
            const chofer = await crearChofer(13, null);
            const a = await crearPedido();
            await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe([a, await crearPedido(), a])),
                { code: 'P0001', message: 'Hay un pedido repetido en la ruta.' });
        });

        it('si falla la 3.ª parada DESPUÉS de insertar la ruta, la ruta tampoco queda (C8)', async () => {
            const chofer = await crearChofer(13, null);
            const pedidos = [await crearPedido(), await crearPedido(), await crearPedido()];
            // Falla provocada en el INSERT de ruta_paradas, cuando rutas_diarias ya tiene la fila
            await db.exec(`
                CREATE FUNCTION public.test_falla_tercera() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF NEW.orden = 3 THEN RAISE EXCEPTION 'falla provocada en la 3.ª parada'; END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER test_falla_tercera BEFORE INSERT ON public.ruta_paradas
                    FOR EACH ROW EXECUTE FUNCTION public.test_falla_tercera();
            `);
            try {
                await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe(pedidos)),
                    { message: 'falla provocada en la 3.ª parada' });
            } finally {
                await db.exec(`DROP TRIGGER test_falla_tercera ON public.ruta_paradas; DROP FUNCTION public.test_falla_tercera();`);
            }
        });
    });

    describe('orden y forma de las paradas', () => {
        it.each([
            ['orden 1, 3, 4', [1, 3, 4]],
            ['orden repetido 1, 2, 2', [1, 2, 2]],
            ['orden que empieza en 0', [0, 1, 2]],
        ])('%s → error y nada guardado', async (_caso, ordenes) => {
            const chofer = await crearChofer(13, null);
            const pedidos = [await crearPedido(), await crearPedido(), await crearPedido()];
            await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe(pedidos, ordenes)), { code: 'P0001' });
        });

        it.each([
            ['sin paradas', []],
            ['no es un arreglo', { pedido_id: 1, orden: 1 }],
            ['pedido_id como texto', [{ pedido_id: 'abc', orden: 1 }]],
            ['pedido_id decimal', [{ pedido_id: 1.5, orden: 1 }]],
            ['km_acumulados como texto', [{ pedido_id: 1, orden: 1, km_acumulados: 'x' }]],
        ])('%s → error con mensaje y nada guardado', async (_caso, paradas) => {
            const chofer = await crearChofer(13, null);
            await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradas), { code: 'P0001' });
        });

        it('más de 48 paradas → error', async () => {
            const chofer = await crearChofer(13, null);
            const paradas = Array.from({ length: 49 }, (_, i) => ({ pedido_id: i + 1, orden: i + 1 }));
            await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradas),
                { code: 'P0001', message: 'Máximo 48 paradas por ruta.' });
        });
    });

    describe('pedidos planificables (mismas reglas que cargarPedidos)', () => {
        it('un pedido anulado o entregado no se puede planificar', async () => {
            for (const estado of ['anulado', 'entregado']) {
                const chofer = await crearChofer(13, null);
                const pedido = await crearPedido(1, { estado });
                await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe([pedido])),
                    { code: 'P0001', message: `El pedido #${pedido} está "${estado}" y no se puede planificar.` });
            }
        });

        it('un pedido cuyo cliente no tiene ubicación no se guarda', async () => {
            const chofer = await crearChofer(13, null);
            const pedido = await crearPedido(1, { sinUbicacion: true });
            await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe([pedido])),
                { code: 'P0001', message: `El pedido #${pedido} no tiene la ubicación del cliente.` });
        });

        it('un pedido que ya está en otra ruta no se puede repetir en otra', async () => {
            const pedido = await crearPedido();
            await guardar(ids.jefe, await crearChofer(13, null), paradasDe([pedido]));
            await esperarRechazoSinGuardar(guardar(ids.jefe, await crearChofer(13, null), paradasDe([pedido])),
                { code: 'P0001', message: `El pedido #${pedido} ya está asignado a una ruta.` });
        });

        it('un pedido cuya parada falló sí se puede volver a planificar', async () => {
            const pedido = await crearPedido();
            const ruta = await guardar(ids.jefe, await crearChofer(13, null), paradasDe([pedido]));
            await db.query(`UPDATE ruta_paradas SET estado = 'fallido', motivo_fallo = 'Local cerrado' WHERE ruta_id = $1`, [ruta]);
            expect(await guardar(ids.jefe, await crearChofer(13, null), paradasDe([pedido]))).toBeGreaterThan(0);
        });
    });

    describe('chofer, origen y fecha', () => {
        it('chofer inactivo o sin vehículo → error', async () => {
            const inactivo = await crearChofer(13, null);
            await db.query('UPDATE choferes SET activo = false WHERE id = $1', [inactivo]);
            const sinVehiculo = await crearChofer(13, null);
            await db.query('UPDATE choferes SET vehiculo_default_id = NULL WHERE id = $1', [sinVehiculo]);
            for (const chofer of [inactivo, sinVehiculo, 999_999]) {
                await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe([await crearPedido()])),
                    { code: 'P0001', message: 'El chofer no está activo o no tiene un vehículo activo asignado.' });
            }
        });

        it('fecha pasada → error', async () => {
            const chofer = await crearChofer(13, null);
            await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe([await crearPedido()]), RESUMEN, -1),
                { code: 'P0001', message: 'No se puede planificar una ruta en una fecha pasada.' });
        });
    });

    describe('permisos', () => {
        it('chofer y vendedor reciben 42501 y no se guarda nada', async () => {
            const chofer = await crearChofer(13, null);
            const choferUsuario = (await uno<{ usuario_id: string }>('SELECT usuario_id FROM choferes WHERE id = $1', [chofer])).usuario_id;
            for (const sub of [choferUsuario, ids.vendedor]) {
                await esperarRechazoSinGuardar(guardar(sub, chofer, paradasDe([await crearPedido()])), { code: '42501' });
            }
        });

        it('anon recibe 42501', async () => {
            const chofer = await crearChofer(13, null);
            await esperarRechazoSinGuardar(guardar(null, chofer, paradasDe([await crearPedido()])), { code: '42501' });
        });

        it('un usuario autenticado sin fila en usuarios recibe 42501', async () => {
            const chofer = await crearChofer(13, null);
            const sinFila = (await uno<{ id: string }>('SELECT gen_random_uuid() AS id')).id;
            await esperarRechazoSinGuardar(guardar(sinFila, chofer, paradasDe([await crearPedido()])), { code: '42501' });
        });
    });

    describe('REG-03 · una ruta por vehículo y por chofer al día', () => {
        it('REG-03 · segunda ruta para el mismo vehículo y fecha → 23505 uq_ruta_vehiculo_fecha', async () => {
            const chofer = await crearChofer(13, null);
            await guardar(ids.jefe, chofer, paradasDe([await crearPedido()]), RESUMEN, 5);
            // Otro chofer con el MISMO vehículo
            const otro = await crearChofer(13, null);
            await db.query('UPDATE choferes SET vehiculo_default_id = (SELECT vehiculo_default_id FROM choferes WHERE id = $1) WHERE id = $2',
                [chofer, otro]);
            await esperarRechazoSinGuardar(guardar(ids.jefe, otro, paradasDe([await crearPedido()]), RESUMEN, 5),
                { code: '23505', constraint: 'uq_ruta_vehiculo_fecha' });
        });

        it('REG-03 · segunda ruta para el mismo chofer y fecha → 23505 uq_ruta_chofer_fecha', async () => {
            const chofer = await crearChofer(13, null);
            await guardar(ids.jefe, chofer, paradasDe([await crearPedido()]), RESUMEN, 6);
            // Cambia de vehículo para que choque la UNIQUE del chofer y no la del vehículo
            await db.query(
                `UPDATE choferes SET vehiculo_default_id = (
                     SELECT id FROM vehiculos WHERE id <> (SELECT vehiculo_default_id FROM choferes WHERE id = $1)
                      ORDER BY id DESC LIMIT 1) WHERE id = $1`,
                [chofer],
            );
            await esperarRechazoSinGuardar(guardar(ids.jefe, chofer, paradasDe([await crearPedido()]), RESUMEN, 6),
                { code: '23505', constraint: 'uq_ruta_chofer_fecha' });
        });
    });
});
