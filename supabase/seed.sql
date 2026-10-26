-- ═══════════════════════════════════════════════════════════════════════════
--  Semilla de ensayo — Rutas de Entrega (PBI-03)
--
--  Pensada para un Supabase local o un proyecto secundario de pruebas. Si se
--  corre en la base compartida, crea datos ficticios visibles para todos:
--  todo va marcado con "(seed)", patentes SEED01/SEED02 y RUT 76000001..3,
--  y se borra con supabase/seed_limpieza.sql.
--
--  Cómo usarla
--    Local:       npx supabase db reset        (aplica migraciones + esta semilla)
--    Remoto:      pegarla en el SQL Editor, o
--                 psql "<cadena de conexión>" -f supabase/seed.sql
--    Requiere las migraciones de supabase/migrations ya aplicadas.
--
--  Es idempotente: se puede correr varias veces. Cada ejecución asegura una
--  ruta para el día de HOY (America/Santiago) con 3 paradas pendientes; si
--  ese día ya hay ruta, la deja como está. Para repetir la prueba de hoy,
--  correr seed_limpieza.sql (o solo su bloque de rutas) y luego esta semilla.
--
--  Chofer de prueba — el usuario de Auth se crea A MANO
--    choferes.usuario_id es FK a auth.users y la semilla no crea usuarios de
--    Auth (contraseñas, proveedores y lista blanca se gestionan en Supabase).
--    1. Correr esta semilla: deja chofer.prueba@sgdf.test en `usuarios` con
--       rol 'chofer' (la lista blanca exige que el correo exista ahí).
--    2. Dashboard → Authentication → Users → Add user → Create new user:
--       email chofer.prueba@sgdf.test, una contraseña, "Auto Confirm User".
--    3. Correr la semilla otra vez: busca ese email en auth.users, crea el
--       chofer con usuario_id = auth.users.id y arma la ruta de hoy.
--    4. Entrar en /login con ese correo y contraseña → /mi-ruta.
--    Para usar otro usuario ya existente, cambiar v_email_chofer abajo.
--
--  Coordenadas: centros aproximados de cada localidad (Peralillo, Santa Cruz,
--  Marchigüe y Palmilla, Región de O'Higgins).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_email_chofer CONSTANT text := 'chofer.prueba@sgdf.test';
    v_hoy          CONSTANT date := (now() AT TIME ZONE 'America/Santiago')::date;
    v_auth_id    uuid;
    v_sucursal   bigint;
    v_vehiculo   bigint;
    v_chofer     bigint;
    v_categoria  bigint;
    v_ruta       bigint;
    v_pedido     bigint;
    v_orden      integer := 0;
    c            record;
BEGIN
    -- ─── Sucursal ───────────────────────────────────────────────────────
    SELECT id INTO v_sucursal FROM sucursales WHERE nombre = 'Peralillo (seed)';
    IF v_sucursal IS NULL THEN
        INSERT INTO sucursales (nombre, direccion, lat, lng, es_deposito, activo)
        VALUES ('Peralillo (seed)', 'Peralillo, Región de O''Higgins', -34.4806, -71.4889, true, true)
        RETURNING id INTO v_sucursal;
    END IF;

    -- ─── Vehículos: Hyundai H350 Solati, 13 m³ y 1289 kg de carga ───────
    INSERT INTO vehiculos (patente, modelo, anno, rendimiento_kml, capacidad_vol_m3, capacidad_peso_kg, sucursal_id, activo)
    VALUES ('SEED01', 'Hyundai H350 Solati (seed)', 2022, 9.5, 13, 1289, v_sucursal, true),
           ('SEED02', 'Hyundai H350 Solati (seed)', 2023, 9.5, 13, 1289, v_sucursal, true)
    ON CONFLICT (patente) DO NOTHING;
    SELECT id INTO v_vehiculo FROM vehiculos WHERE patente = 'SEED01';

    -- ─── Productos con volumen y peso ───────────────────────────────────
    INSERT INTO categorias (nombre, descripcion)
    VALUES ('Flores (seed)', 'Categoría de ensayo')
    ON CONFLICT (nombre) DO NOTHING;
    SELECT id INTO v_categoria FROM categorias WHERE nombre = 'Flores (seed)';

    INSERT INTO productos (nombre, categoria_id, varas_por_paquete, stock_actual, stock_minimo,
                           precio_venta_actual, volumen_unitario_m3, peso_unitario_kg)
    SELECT p.nombre, v_categoria, p.varas, 500, 20, p.precio, p.volumen, p.peso
    FROM (VALUES
        ('Rosa roja x20 (seed)', 20, 12000, 0.020, 1.20),
        ('Clavel x25 (seed)',    25,  8000, 0.015, 0.80),
        ('Lilium x10 (seed)',    10, 15000, 0.030, 1.50)
    ) AS p(nombre, varas, precio, volumen, peso)
    WHERE NOT EXISTS (SELECT 1 FROM productos WHERE productos.nombre = p.nombre);

    -- ─── Clientes con coordenadas y ventana horaria ─────────────────────
    INSERT INTO clientes (razon_social, rut, nombre_contacto, telefono, direccion,
                          lat, lng, ventana_inicio, ventana_fin, activo)
    VALUES
        ('Florería Santa Cruz (seed)', '76000001-9', 'Ana Pérez', '+56911111111',
         'Plaza de Armas, Santa Cruz',  -34.6386, -71.3654, '08:00', '12:00', true),
        ('Flores Marchigüe (seed)',    '76000002-7', 'Luis Soto', '+56922222222',
         'Calle Principal, Marchigüe', -34.3972, -71.6194, '09:00', '13:00', true),
        ('Florería Palmilla (seed)',   '76000003-5', 'Rosa Díaz', '+56933333333',
         'Centro, Palmilla',           -34.6036, -71.3592, '14:00', '18:00', true)
    ON CONFLICT (rut) DO NOTHING;

    -- ─── Pedidos: uno por cliente, con dos líneas ───────────────────────
    -- Los triggers de la BD recalculan pedidos.total y el saldo del cliente.
    FOR c IN SELECT id FROM clientes WHERE rut IN ('76000001-9', '76000002-7', '76000003-5') LOOP
        IF NOT EXISTS (SELECT 1 FROM pedidos WHERE cliente_id = c.id AND nota = 'Pedido de ensayo (seed)') THEN
            INSERT INTO pedidos (cliente_id, estado, total, nota)
            VALUES (c.id, 'pendiente', 0, 'Pedido de ensayo (seed)')
            RETURNING id INTO v_pedido;

            INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario, costo_unitario)
            SELECT v_pedido, id, 2, precio_venta_actual, 0
            FROM productos
            WHERE nombre IN ('Rosa roja x20 (seed)', 'Clavel x25 (seed)');
        END IF;
    END LOOP;

    -- ─── Chofer de prueba ───────────────────────────────────────────────
    SELECT id INTO v_auth_id FROM auth.users WHERE email = v_email_chofer;

    INSERT INTO usuarios (id, email, nombre, rol)
    VALUES (coalesce(v_auth_id, gen_random_uuid()), v_email_chofer, 'Chofer de Prueba (seed)', 'chofer')
    ON CONFLICT (email) DO NOTHING;

    IF v_auth_id IS NULL THEN
        RAISE NOTICE 'No existe % en auth.users: créalo en Authentication → Users y vuelve a correr la semilla para crear el chofer y la ruta de hoy.', v_email_chofer;
        RETURN;
    END IF;

    INSERT INTO choferes (usuario_id, nombre_completo, telefono, vehiculo_default_id, turno_inicio, turno_fin, activo)
    VALUES (v_auth_id, 'Chofer de Prueba (seed)', '+56944444444', v_vehiculo, '07:00', '18:00', true)
    ON CONFLICT (usuario_id) DO NOTHING;
    SELECT id INTO v_chofer FROM choferes WHERE usuario_id = v_auth_id;

    -- ─── Ruta de HOY con 3 paradas pendientes ───────────────────────────
    -- simulada = true: sin geometría de ORS (CHECK rutas_simulada_sin_geometria).
    -- Sin target en ON CONFLICT: cubre rutas_chofer_fecha_key y rutas_vehiculo_fecha_key.
    INSERT INTO rutas_diarias (fecha, sucursal_id, vehiculo_id, chofer_id, estado, simulada, advertencias)
    VALUES (v_hoy, v_sucursal, v_vehiculo, v_chofer, 'planificada', true, ARRAY['Ruta de ensayo (seed)'])
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_ruta;

    IF v_ruta IS NULL THEN
        RAISE NOTICE 'Ya hay ruta el % para el chofer de prueba o el vehículo SEED01; se deja como está.', v_hoy;
        RETURN;
    END IF;

    -- Orden de visita según la ventana: Santa Cruz (08) → Marchigüe (09) → Palmilla (14)
    FOR c IN
        SELECT p.id AS pedido_id, cl.lat, cl.lng, cl.ventana_inicio, cl.ventana_fin
        FROM pedidos p
        JOIN clientes cl ON cl.id = p.cliente_id
        WHERE p.nota = 'Pedido de ensayo (seed)'
          AND cl.rut IN ('76000001-9', '76000002-7', '76000003-5')
        ORDER BY cl.ventana_inicio
    LOOP
        v_orden := v_orden + 1;
        INSERT INTO ruta_paradas (ruta_id, pedido_id, orden, lat_destino, lng_destino, ventana_inicio, ventana_fin)
        VALUES (v_ruta, c.pedido_id, v_orden, c.lat, c.lng, c.ventana_inicio, c.ventana_fin);
    END LOOP;

    RAISE NOTICE 'Ruta % del % creada con % paradas pendientes.', v_ruta, v_hoy, v_orden;
END $$;
