-- ═══════════════════════════════════════════════════════════════════════════
--  Semilla de medición — ruta de HOY con 20 paradas pendientes (RNF-PERF-03)
--
--  Para la prueba de humo contra Supabase y la medición RNF-PERF-03 (J8):
--  chofer.prueba@sgdf.test queda con una ruta de hoy de 20 paradas pendientes,
--  cada pedido con saldo por cobrar ($20.000).
--
--  Requisitos: migraciones aplicadas y supabase/seed.sql ya corrida con el
--  usuario de Auth creado (deja la sucursal, el vehículo SEED01, los productos
--  y el chofer de prueba). Si falta algo, se detiene con un mensaje.
--
--  REEMPLAZA la ruta de hoy del chofer de prueba (y la de SEED01): una ruta
--  por chofer y por vehículo al día (uq_ruta_chofer_fecha, uq_ruta_vehiculo_fecha).
--  Antes borra los cobros de terreno de esas paradas (pagos.parada_id es
--  ON DELETE RESTRICT) y los pagos de los pedidos de medición, así cada
--  ejecución deja los 20 pedidos con el saldo completo.
--  Para volver a la ruta de ensayo de 3 paradas: seed_limpieza.sql y seed.sql.
--
--  Todo va marcado con "(medición)": clientes 77000001..20, pedidos con nota
--  'Pedido de medición (seed)'. Se borra con supabase/seed_limpieza.sql.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_email_chofer CONSTANT text    := 'chofer.prueba@sgdf.test';
    v_paradas      CONSTANT integer := 20;
    v_hoy          CONSTANT date    := (now() AT TIME ZONE 'America/Santiago')::date;
    v_sucursal   bigint;
    v_vehiculo   bigint;
    v_chofer     bigint;
    v_ruta       bigint;
    v_cliente    bigint;
    v_pedido     bigint;
    v_rut_num    integer;
    v_rut        text;
    v_suma       integer;
    v_mult       integer;
    v_resto      integer;
    v_inicio     time;
    i            integer;
BEGIN
    -- ─── Lo que deja seed.sql ───────────────────────────────────────────
    SELECT id INTO v_sucursal FROM sucursales WHERE nombre = 'Peralillo (seed)';
    SELECT id INTO v_vehiculo FROM vehiculos WHERE patente = 'SEED01';
    SELECT ch.id INTO v_chofer
      FROM choferes ch JOIN auth.users u ON u.id = ch.usuario_id
     WHERE u.email = v_email_chofer;

    IF v_sucursal IS NULL OR v_vehiculo IS NULL OR v_chofer IS NULL
       OR NOT EXISTS (SELECT 1 FROM productos WHERE nombre = 'Rosa roja x20 (seed)')
       OR NOT EXISTS (SELECT 1 FROM productos WHERE nombre = 'Clavel x25 (seed)') THEN
        RAISE EXCEPTION 'Falta la semilla base: corre seed.sql (con el usuario % creado en Auth) antes de esta.', v_email_chofer;
    END IF;

    -- ─── Clientes y pedidos de medición (idempotente) ───────────────────
    FOR i IN 1..v_paradas LOOP
        -- RUT 770000NN con dígito verificador (módulo 11)
        v_rut_num := 77000000 + i;
        v_suma := 0;
        v_mult := 2;
        FOR d IN REVERSE char_length(v_rut_num::text)..1 LOOP
            v_suma := v_suma + substr(v_rut_num::text, d, 1)::integer * v_mult;
            v_mult := CASE WHEN v_mult = 7 THEN 2 ELSE v_mult + 1 END;
        END LOOP;
        v_resto := 11 - (v_suma % 11);
        v_rut := v_rut_num || '-' || CASE v_resto WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE v_resto::text END;

        -- Ventanas de 4 h que empiezan a las 08, 10 o 12; puntos repartidos
        -- entre Peralillo, Santa Cruz y Marchigüe.
        v_inicio := make_time(8 + ((i - 1) % 3) * 2, 0, 0);
        INSERT INTO clientes (razon_social, rut, nombre_contacto, telefono, direccion,
                              lat, lng, ventana_inicio, ventana_fin, activo)
        VALUES (format('Cliente medición %s (medición)', lpad(i::text, 2, '0')), v_rut,
                'Contacto de medición', '+5695000' || lpad(i::text, 4, '0'),
                format('Dirección de medición %s', i),
                -34.40 - ((i - 1) % 5) * 0.06, -71.30 - ((i - 1) / 5) * 0.08,
                v_inicio, v_inicio + interval '4 hours', true)
        ON CONFLICT (rut) DO NOTHING;
        SELECT id INTO v_cliente FROM clientes WHERE rut = v_rut;

        IF NOT EXISTS (SELECT 1 FROM pedidos WHERE cliente_id = v_cliente AND nota = 'Pedido de medición (seed)') THEN
            INSERT INTO pedidos (cliente_id, estado, total, nota)
            VALUES (v_cliente, 'pendiente', 0, 'Pedido de medición (seed)')
            RETURNING id INTO v_pedido;

            -- 1 × Rosa roja (12 000) + 1 × Clavel (8 000) = $20.000 de saldo
            INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario, costo_unitario)
            SELECT v_pedido, id, 1, precio_venta_actual, 0
              FROM productos
             WHERE nombre IN ('Rosa roja x20 (seed)', 'Clavel x25 (seed)');
        END IF;
    END LOOP;

    -- ─── Reemplazar la ruta de hoy del chofer de prueba / SEED01 ────────
    DELETE FROM pagos
     WHERE parada_id IN (
             SELECT rp.id FROM ruta_paradas rp JOIN rutas_diarias rd ON rd.id = rp.ruta_id
              WHERE rd.fecha = v_hoy AND (rd.chofer_id = v_chofer OR rd.vehiculo_id = v_vehiculo))
        OR pedido_id IN (SELECT id FROM pedidos WHERE nota = 'Pedido de medición (seed)');

    DELETE FROM rutas_diarias
     WHERE fecha = v_hoy AND (chofer_id = v_chofer OR vehiculo_id = v_vehiculo);

    INSERT INTO rutas_diarias (fecha, sucursal_id, vehiculo_id, chofer_id, estado, simulada, advertencias)
    VALUES (v_hoy, v_sucursal, v_vehiculo, v_chofer, 'planificada', true, ARRAY['Ruta de medición (seed)'])
    RETURNING id INTO v_ruta;

    INSERT INTO ruta_paradas (ruta_id, pedido_id, orden, lat_destino, lng_destino, ventana_inicio, ventana_fin)
    SELECT v_ruta, p.id, row_number() OVER (ORDER BY cl.rut), cl.lat, cl.lng, cl.ventana_inicio, cl.ventana_fin
      FROM pedidos p
      JOIN clientes cl ON cl.id = p.cliente_id
     WHERE p.nota = 'Pedido de medición (seed)';

    RAISE NOTICE 'Ruta de medición % del % con % paradas pendientes.', v_ruta, v_hoy,
        (SELECT count(*) FROM ruta_paradas WHERE ruta_id = v_ruta);
END $$;
