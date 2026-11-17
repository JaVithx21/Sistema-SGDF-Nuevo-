-- ═══════════════════════════════════════════════════════════════════════════
--  guardar_ruta(): ruta y paradas en una sola transacción, revalidadas en la
--  base (DEF-15, parte de DEF-14 · observación C8 de la segunda defensa)
--
--  Antes, guardarRuta() hacía dos INSERT sin transacción (rutas_diarias y luego
--  ruta_paradas) y, si el segundo fallaba, borraba la ruta a mano; además no
--  revalidaba la capacidad con datos de la base. Esta función:
--    - inserta la ruta y sus paradas en la misma transacción: si algo falla,
--      no queda nada guardado;
--    - toma de la BASE la capacidad del vehículo, el volumen y el peso de los
--      pedidos, las coordenadas y las ventanas; del llamador solo usa los ids
--      de pedido, el orden, los km acumulados y el resumen del cálculo;
--    - no depende de la firma de la app (DEF-14 / ADR-04): se puede llamar
--      directo por la API, así que repite todas las reglas de negocio.
--
--  p_paradas: [{ "pedido_id", "orden", "km_acumulados" }, ...]
--  p_resumen: { km_planificados, duracion_s, simulada, geojson_ruta, advertencias,
--               bencina_proyectada_lts, costo_bencina_proyectado,
--               precio_litro_referencia }
--
--  Errores: 42501 sin permiso; P0001 con mensaje para las reglas; 23505 de
--  uq_ruta_vehiculo_fecha / uq_ruta_chofer_fecha / uq_parada_pedido_ruta se
--  propagan con su código (la app ya los traduce).
--  Idempotente: se puede aplicar más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guardar_ruta(
    p_fecha       date,
    p_sucursal_id bigint,
    p_chofer_id   bigint,
    p_paradas     jsonb,
    p_resumen     jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
-- pg_temp al final: una tabla temporal del llamador no puede suplantar a las de public
SET search_path = public, pg_temp
AS $$
DECLARE
    -- ORS Directions admite hasta 50 puntos: depósito (ida y vuelta) + 48 paradas
    c_max_paradas CONSTANT integer := 48;
    v_resumen       jsonb := coalesce(p_resumen, '{}'::jsonb);
    v_vehiculo      bigint;
    v_chofer_activo boolean;
    v_veh_activo    boolean;
    v_cap_vol       numeric;
    v_cap_peso      numeric;
    v_n             integer;
    v_pedidos       bigint[];
    v_ordenes       integer[];
    v_kms           numeric[];
    v_pedido        record;
    v_vol_total     numeric;
    v_peso_total    numeric;
    v_simulada      boolean;
    v_ruta          bigint;
BEGIN
    -- 1. Rol: admin, gerente o jefe de operaciones (mismo criterio que el RLS de rutas)
    IF NOT coalesce(private.puede_gestionar_rutas(), false) THEN
        RAISE EXCEPTION 'No tienes permiso para guardar rutas.' USING ERRCODE = '42501';
    END IF;

    IF p_fecha IS NULL OR p_fecha < (now() AT TIME ZONE 'America/Santiago')::date THEN
        RAISE EXCEPTION 'No se puede planificar una ruta en una fecha pasada.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_sucursal_id AND activo) THEN
        RAISE EXCEPTION 'El punto de origen no existe o está inactivo.';
    END IF;

    -- 2. Chofer activo con vehículo activo; capacidades leídas de la base
    SELECT ch.activo, ch.vehiculo_default_id, v.activo, v.capacidad_vol_m3, v.capacidad_peso_kg
      INTO v_chofer_activo, v_vehiculo, v_veh_activo, v_cap_vol, v_cap_peso
      FROM choferes ch
      LEFT JOIN vehiculos v ON v.id = ch.vehiculo_default_id
     WHERE ch.id = p_chofer_id;

    IF NOT FOUND OR NOT v_chofer_activo OR v_vehiculo IS NULL OR NOT coalesce(v_veh_activo, false) THEN
        RAISE EXCEPTION 'El chofer no está activo o no tiene un vehículo activo asignado.';
    END IF;

    -- 3. Paradas
    IF p_paradas IS NULL OR jsonb_typeof(p_paradas) <> 'array' OR jsonb_array_length(p_paradas) = 0 THEN
        RAISE EXCEPTION 'La ruta no tiene paradas.';
    END IF;
    v_n := jsonb_array_length(p_paradas);
    IF v_n > c_max_paradas THEN
        RAISE EXCEPTION 'Máximo % paradas por ruta.', c_max_paradas;
    END IF;

    -- Forma de cada elemento antes de cualquier cast (SQL no garantiza el orden
    -- de evaluación de un OR: el CASE evita un error de conversión sin mensaje).
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_paradas) e
         WHERE CASE
                   WHEN jsonb_typeof(e) = 'object'
                    AND jsonb_typeof(e -> 'pedido_id') = 'number'
                    AND jsonb_typeof(e -> 'orden') = 'number'
                    AND jsonb_typeof(coalesce(e -> 'km_acumulados', 'null')) IN ('number', 'null')
                   THEN (e ->> 'pedido_id')::numeric NOT BETWEEN 1 AND 9223372036854775807
                     OR (e ->> 'pedido_id')::numeric <> trunc((e ->> 'pedido_id')::numeric)
                     OR (e ->> 'orden')::numeric NOT BETWEEN 1 AND c_max_paradas
                     OR (e ->> 'orden')::numeric <> trunc((e ->> 'orden')::numeric)
                   ELSE true
               END
    ) THEN
        RAISE EXCEPTION 'La ruta tiene paradas mal formadas.';
    END IF;

    SELECT array_agg((e ->> 'pedido_id')::bigint ORDER BY i),
           array_agg((e ->> 'orden')::integer ORDER BY i),
           array_agg(LEAST(GREATEST((e ->> 'km_acumulados')::numeric, 0), 9999) ORDER BY i)
      INTO v_pedidos, v_ordenes, v_kms
      FROM jsonb_array_elements(p_paradas) WITH ORDINALITY AS t(e, i);

    -- Orden 1..n consecutivo, sin saltos ni repeticiones
    IF (SELECT array_agg(o ORDER BY o) FROM unnest(v_ordenes) AS o)
       IS DISTINCT FROM (SELECT array_agg(g) FROM generate_series(1, v_n) AS g) THEN
        RAISE EXCEPTION 'El orden de las paradas debe ser 1..% sin saltos ni repeticiones.', v_n;
    END IF;

    IF (SELECT count(DISTINCT x) FROM unnest(v_pedidos) AS x) <> v_n THEN
        RAISE EXCEPTION 'Hay un pedido repetido en la ruta.';
    END IF;

    -- Bloqueo de los pedidos (en orden de id para no provocar deadlocks): dos
    -- planificaciones simultáneas no pueden meter el mismo pedido en dos rutas.
    PERFORM 1 FROM pedidos WHERE id = ANY (v_pedidos) ORDER BY id FOR UPDATE;

    -- Pedidos: existen, planificables, con ubicación y sin otra ruta vigente.
    -- Mismas reglas que cargarPedidos() en src/app/(dashboard)/rutas/actions.ts.
    FOR v_pedido IN
        SELECT pr.pedido_id, p.id AS existe, p.estado, c.lat, c.lng,
               EXISTS (SELECT 1 FROM ruta_paradas rp
                        WHERE rp.pedido_id = pr.pedido_id AND rp.estado <> 'fallido') AS en_ruta
          FROM unnest(v_pedidos, v_ordenes) AS pr(pedido_id, orden)
          LEFT JOIN pedidos p  ON p.id = pr.pedido_id
          LEFT JOIN clientes c ON c.id = p.cliente_id
         ORDER BY pr.orden
    LOOP
        IF v_pedido.existe IS NULL THEN
            RAISE EXCEPTION 'El pedido #% no existe.', v_pedido.pedido_id;
        END IF;
        IF v_pedido.estado NOT IN ('pendiente', 'confirmado') THEN
            RAISE EXCEPTION 'El pedido #% está "%" y no se puede planificar.', v_pedido.pedido_id, v_pedido.estado;
        END IF;
        IF v_pedido.lat IS NULL OR v_pedido.lng IS NULL THEN
            RAISE EXCEPTION 'El pedido #% no tiene la ubicación del cliente.', v_pedido.pedido_id;
        END IF;
        IF v_pedido.en_ruta THEN
            RAISE EXCEPTION 'El pedido #% ya está asignado a una ruta.', v_pedido.pedido_id;
        END IF;
    END LOOP;

    -- 4. Capacidad con volumen y peso de la base: detalle × unitario del producto,
    --    el mismo cálculo que cargarPedidos(). El optimizador redondea la demanda
    --    hacia arriba (m3ADm3 usa ceil), así que una ruta calculada nunca choca aquí.
    SELECT coalesce(sum(d.cantidad * coalesce(pd.volumen_unitario_m3, 0)), 0),
           coalesce(sum(d.cantidad * coalesce(pd.peso_unitario_kg, 0)), 0)
      INTO v_vol_total, v_peso_total
      FROM detalle_pedidos d
      JOIN productos pd ON pd.id = d.producto_id
     WHERE d.pedido_id = ANY (v_pedidos);

    IF v_vol_total > v_cap_vol THEN
        RAISE EXCEPTION 'La carga supera la capacidad del vehículo (volumen).';
    END IF;
    -- El peso solo se valida si el vehículo tiene capacidad de peso registrada
    IF v_cap_peso IS NOT NULL AND v_peso_total > v_cap_peso THEN
        RAISE EXCEPTION 'La carga supera la capacidad del vehículo (peso).';
    END IF;

    -- 5. Ruta. Mismos topes que guardarRuta(): km y duración en 0 si faltan,
    --    el resto queda NULL si falta (GREATEST/LEAST ignoran NULL, por eso el CASE).
    v_simulada := coalesce((v_resumen ->> 'simulada')::boolean, false);

    INSERT INTO rutas_diarias (
        fecha, sucursal_id, vehiculo_id, chofer_id, estado,
        km_planificados, duracion_s, volumen_total_m3,
        bencina_proyectada_lts, costo_bencina_proyectado, precio_litro_referencia,
        simulada, geojson_ruta, advertencias, creado_por
    )
    SELECT
        p_fecha, p_sucursal_id, v_vehiculo, p_chofer_id, 'planificada',
        round(LEAST(GREATEST(coalesce(km, 0), 0), 9999), 2),
        round(LEAST(GREATEST(coalesce(dur, 0), 0), 24 * 60 * 60))::integer,
        round(v_vol_total, 4),
        CASE WHEN lts   IS NOT NULL THEN round(LEAST(GREATEST(lts, 0), 9999), 2) END,
        CASE WHEN costo IS NOT NULL THEN round(LEAST(GREATEST(costo, 0), 99999999), 2) END,
        CASE WHEN precio IS NOT NULL THEN round(LEAST(GREATEST(precio, 0), 9999), 2) END,
        v_simulada,
        -- CHECK rutas_simulada_sin_geometria: una ruta simulada no lleva trazado
        CASE WHEN v_simulada THEN NULL ELSE NULLIF(v_resumen -> 'geojson_ruta', 'null'::jsonb) END,
        -- Solo textos y a lo más 10, como guardarRuta()
        coalesce((SELECT array_agg(a #>> '{}' ORDER BY n)
                    FROM (SELECT a, row_number() OVER (ORDER BY i) AS n
                            FROM jsonb_array_elements(
                                     CASE WHEN jsonb_typeof(v_resumen -> 'advertencias') = 'array'
                                          THEN v_resumen -> 'advertencias' ELSE '[]'::jsonb END
                                 ) WITH ORDINALITY AS t(a, i)
                           WHERE jsonb_typeof(a) = 'string') s
                   WHERE n <= 10), '{}'),
        auth.uid()
    FROM (SELECT (v_resumen ->> 'km_planificados')::numeric         AS km,
                 (v_resumen ->> 'duracion_s')::numeric              AS dur,
                 (v_resumen ->> 'bencina_proyectada_lts')::numeric   AS lts,
                 (v_resumen ->> 'costo_bencina_proyectado')::numeric AS costo,
                 (v_resumen ->> 'precio_litro_referencia')::numeric  AS precio) r
    RETURNING id INTO v_ruta;

    -- 6. Paradas: destino, ventanas y volumen desde la base, no desde p_paradas
    INSERT INTO ruta_paradas (ruta_id, pedido_id, orden, lat_destino, lng_destino,
                              ventana_inicio, ventana_fin, km_acumulados, volumen_parada_m3)
    SELECT v_ruta, pr.pedido_id, pr.orden, c.lat, c.lng, c.ventana_inicio, c.ventana_fin,
           round(pr.km, 2),
           round(coalesce((SELECT sum(d.cantidad * coalesce(pd.volumen_unitario_m3, 0))
                             FROM detalle_pedidos d JOIN productos pd ON pd.id = d.producto_id
                            WHERE d.pedido_id = pr.pedido_id), 0), 4)
      FROM unnest(v_pedidos, v_ordenes, v_kms) AS pr(pedido_id, orden, km)
      JOIN pedidos p  ON p.id = pr.pedido_id
      JOIN clientes c ON c.id = p.cliente_id
     ORDER BY pr.orden;

    -- 7. Id de la ruta
    RETURN v_ruta;
END;
$$;

-- Supabase concede EXECUTE a anon por defecto en funciones nuevas: se quita.
REVOKE ALL ON FUNCTION public.guardar_ruta(date, bigint, bigint, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.guardar_ruta(date, bigint, bigint, jsonb, jsonb) TO authenticated;
