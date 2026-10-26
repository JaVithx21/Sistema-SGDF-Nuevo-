-- ═══════════════════════════════════════════════════════════════════════════
--  Esquema base del SGDF (schema public + private) — RSK-12
--
--  Reconstruido el 2026-10-26 desde el catálogo de la base de producción
--  (Postgres 17.6) con consultas de SOLO LECTURA vía el MCP de Supabase.
--  Cada sección (tablas y constraints, índices y vista, funciones, triggers,
--  RLS y políticas, permisos, comentarios) se verificó por md5 contra el
--  servidor: es una copia exacta, no una aproximación.
--
--  Por qué existe: gran parte del esquema (sucursales, vehiculos, choferes,
--  rutas_diarias, ruta_paradas, checkpoints, liquidaciones_ruta y sus
--  funciones) se creó fuera de las migraciones; las 19 migraciones remotas no
--  reconstruyen la base.
--
--  ⚠️  NO ejecutar en la base real: todo esto ya existe ahí. Sirve para levantar
--  un proyecto secundario o local (Semana 7: probar las migraciones antes de
--  tocar la base real). En la base real se marca como aplicada, sin correrla.
--
--  No incluye datos. Para entrar al proyecto secundario hay que insertar
--  primero el correo en public.usuarios (lista blanca: trigger
--  trigger_validar_email) y luego crear el usuario en Authentication.
-- ═══════════════════════════════════════════════════════════════════════════

-- Igual que pg_dump: las funciones SQL se validan al ejecutarse, no al crearse,
-- porque private.es_admin() llama a private.obtener_rol_usuario(), creada después.
SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TYPE public.user_role AS ENUM ('admin', 'gerente', 'vendedor', 'chofer', 'jefe_operaciones');

-- ─── Tablas y constraints ───────────────────────────────────────────────────

CREATE TABLE public.categorias (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.chatbot_consentimientos (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    telefono text NOT NULL,
    aceptado boolean DEFAULT false NOT NULL,
    fecha_aceptacion timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.chatbot_sesiones (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    telefono text NOT NULL,
    rol text NOT NULL,
    mensaje text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    push_name text
);

CREATE TABLE public.chatbot_solicitudes (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    telefono text NOT NULL,
    nombre_cliente text,
    productos_solicitados text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    nota_vendedor text,
    atendido_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.checkpoint_pagos (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    checkpoint_id bigint NOT NULL,
    monto numeric(12,2) NOT NULL,
    metodo_pago text NOT NULL,
    referencia text,
    foto_comprobante_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.checkpoints (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    parada_id bigint NOT NULL,
    tipo text NOT NULL,
    lat numeric(10,7),
    lng numeric(10,7),
    accuracy_m numeric(8,2),
    timestamp_local timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    motivo_fallo text,
    nota text,
    sincronizado boolean DEFAULT true NOT NULL
);

CREATE TABLE public.choferes (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    usuario_id uuid NOT NULL,
    nombre_completo text NOT NULL,
    rut text,
    licencia_clase text,
    telefono text,
    vehiculo_default_id bigint,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    turno_inicio time without time zone,
    turno_fin time without time zone
);

CREATE TABLE public.clientes (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    razon_social text NOT NULL,
    rut text,
    nombre_contacto text,
    telefono text,
    email text,
    direccion text,
    saldo_pendiente numeric(12,2) DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lat numeric(10,7) DEFAULT NULL::numeric,
    lng numeric(10,7) DEFAULT NULL::numeric,
    direccion_referencia text,
    ventana_inicio time without time zone,
    ventana_fin time without time zone
);

CREATE TABLE public.detalle_pedidos (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    pedido_id bigint NOT NULL,
    producto_id bigint NOT NULL,
    cantidad integer NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    costo_unitario numeric(12,2) DEFAULT 0 NOT NULL,
    subtotal numeric(12,2) GENERATED ALWAYS AS (((cantidad)::numeric * precio_unitario)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.historial_precios (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    producto_id bigint NOT NULL,
    precio_anterior numeric(12,2) NOT NULL,
    precio_nuevo numeric(12,2) NOT NULL,
    modificado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.liquidaciones_ruta (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    ruta_id bigint NOT NULL,
    km_reales numeric(8,2),
    bencina_real_lts numeric(8,2),
    precio_litro_real numeric(6,2),
    costo_bencina_real numeric(10,2),
    total_cobrado_efectivo numeric(12,2) DEFAULT 0 NOT NULL,
    total_cobrado_transferencia numeric(12,2) DEFAULT 0 NOT NULL,
    paradas_exitosas smallint DEFAULT 0 NOT NULL,
    paradas_fallidas smallint DEFAULT 0 NOT NULL,
    paradas_parciales smallint DEFAULT 0 NOT NULL,
    hora_inicio timestamp with time zone,
    hora_fin timestamp with time zone,
    tiempo_total_min smallint,
    tiempo_muerto_min smallint,
    iel numeric(5,4),
    iel_km numeric(5,4),
    iel_entregas numeric(5,4),
    iel_tiempo numeric(5,4),
    nota_cierre text,
    cerrado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.movimientos_inventario (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    producto_id bigint NOT NULL,
    proveedor_id bigint,
    cantidad integer NOT NULL,
    costo_unitario numeric(12,2) DEFAULT 0 NOT NULL,
    costo_total numeric(12,2) GENERATED ALWAYS AS (((cantidad)::numeric * costo_unitario)) STORED,
    tipo text NOT NULL,
    nota text,
    pedido_id bigint,
    creado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.pagos (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    pedido_id bigint NOT NULL,
    cliente_id bigint NOT NULL,
    monto numeric(12,2) NOT NULL,
    metodo_pago text DEFAULT 'efectivo'::text NOT NULL,
    referencia text,
    nota text,
    creado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.parametros_sistema (
    clave text NOT NULL,
    valor text NOT NULL,
    descripcion text,
    tipo text DEFAULT 'texto'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.pedidos (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    cliente_id bigint NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    total_pagado numeric(12,2) DEFAULT 0 NOT NULL,
    saldo numeric(12,2) GENERATED ALWAYS AS ((total - total_pagado)) STORED,
    nota text,
    creado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.productos (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    categoria_id bigint,
    varas_por_paquete integer DEFAULT 1 NOT NULL,
    stock_actual integer DEFAULT 0 NOT NULL,
    stock_minimo integer DEFAULT 0 NOT NULL,
    precio_venta_actual numeric(12,2) DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paquetes_por_caja integer DEFAULT 1 NOT NULL,
    maneja_cajas boolean DEFAULT false,
    volumen_unitario_m3 numeric(8,5) DEFAULT 0.00100 NOT NULL
);

CREATE TABLE public.proveedores (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    nombre text NOT NULL,
    rut text,
    telefono text,
    email text,
    direccion text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ruta_paradas (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    ruta_id bigint NOT NULL,
    pedido_id bigint NOT NULL,
    orden smallint NOT NULL,
    lat_destino numeric(10,7),
    lng_destino numeric(10,7),
    ventana_inicio time without time zone,
    ventana_fin time without time zone,
    km_acumulados numeric(8,2),
    duracion_estimada_min smallint,
    volumen_parada_m3 numeric(8,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.rutas_diarias (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    fecha date NOT NULL,
    sucursal_id bigint NOT NULL,
    vehiculo_id bigint NOT NULL,
    chofer_id bigint NOT NULL,
    estado text DEFAULT 'planificada'::text NOT NULL,
    km_planificados numeric(8,2),
    bencina_proyectada_lts numeric(8,2),
    costo_bencina_proyectado numeric(10,2),
    precio_litro_referencia numeric(6,2),
    volumen_total_m3 numeric(8,4),
    geojson_ruta jsonb,
    solver_costo numeric(12,2),
    creado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sucursales (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    nombre text NOT NULL,
    direccion text NOT NULL,
    lat numeric(10,7) NOT NULL,
    lng numeric(10,7) NOT NULL,
    es_deposito boolean DEFAULT true NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    nombre text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    rol public.user_role DEFAULT 'vendedor'::public.user_role NOT NULL
);

CREATE TABLE public.vehiculos (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    patente text NOT NULL,
    modelo text,
    anno smallint,
    rendimiento_kml numeric(5,2) NOT NULL,
    capacidad_vol_m3 numeric(7,4) NOT NULL,
    capacidad_peso_kg numeric(8,2),
    sucursal_id bigint,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.categorias ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chatbot_consentimientos ADD CONSTRAINT chatbot_consentimientos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chatbot_sesiones ADD CONSTRAINT chatbot_sesiones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chatbot_solicitudes ADD CONSTRAINT chatbot_solicitudes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.checkpoint_pagos ADD CONSTRAINT checkpoint_pagos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.checkpoints ADD CONSTRAINT checkpoints_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.choferes ADD CONSTRAINT choferes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.clientes ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.detalle_pedidos ADD CONSTRAINT detalle_pedidos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.historial_precios ADD CONSTRAINT historial_precios_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.liquidaciones_ruta ADD CONSTRAINT liquidaciones_ruta_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pagos ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.parametros_sistema ADD CONSTRAINT parametros_sistema_pkey PRIMARY KEY (clave);

ALTER TABLE ONLY public.pedidos ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.productos ADD CONSTRAINT productos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.proveedores ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ruta_paradas ADD CONSTRAINT ruta_paradas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rutas_diarias ADD CONSTRAINT rutas_diarias_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sucursales ADD CONSTRAINT sucursales_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.usuarios ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vehiculos ADD CONSTRAINT vehiculos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.categorias ADD CONSTRAINT categorias_nombre_key UNIQUE (nombre);

ALTER TABLE ONLY public.chatbot_consentimientos ADD CONSTRAINT chatbot_consentimientos_telefono_key UNIQUE (telefono);

ALTER TABLE ONLY public.checkpoint_pagos ADD CONSTRAINT uq_ckpago_checkpoint UNIQUE (checkpoint_id);

ALTER TABLE ONLY public.checkpoints ADD CONSTRAINT uq_checkpoint_parada_timestamp UNIQUE (parada_id, timestamp_local);

ALTER TABLE ONLY public.choferes ADD CONSTRAINT uq_chofer_usuario UNIQUE (usuario_id);

ALTER TABLE ONLY public.clientes ADD CONSTRAINT clientes_rut_key UNIQUE (rut);

ALTER TABLE ONLY public.liquidaciones_ruta ADD CONSTRAINT uq_liquidacion_ruta UNIQUE (ruta_id);

ALTER TABLE ONLY public.proveedores ADD CONSTRAINT proveedores_rut_key UNIQUE (rut);

ALTER TABLE ONLY public.ruta_paradas ADD CONSTRAINT uq_parada_pedido_ruta UNIQUE (ruta_id, pedido_id);

ALTER TABLE ONLY public.rutas_diarias ADD CONSTRAINT uq_ruta_vehiculo_fecha UNIQUE (vehiculo_id, fecha);

ALTER TABLE ONLY public.usuarios ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY public.vehiculos ADD CONSTRAINT uq_vehiculo_patente UNIQUE (patente);

ALTER TABLE ONLY public.chatbot_sesiones ADD CONSTRAINT chatbot_sesiones_rol_check CHECK ((rol = ANY (ARRAY['user'::text, 'assistant'::text])));

ALTER TABLE ONLY public.chatbot_solicitudes ADD CONSTRAINT chatbot_solicitudes_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'contactado'::text, 'confirmado'::text, 'rechazado'::text])));

ALTER TABLE ONLY public.checkpoint_pagos ADD CONSTRAINT chk_metodo_pago CHECK ((metodo_pago = ANY (ARRAY['efectivo'::text, 'transferencia'::text])));

ALTER TABLE ONLY public.checkpoint_pagos ADD CONSTRAINT chk_monto_positivo CHECK ((monto > (0)::numeric));

ALTER TABLE ONLY public.checkpoints ADD CONSTRAINT chk_accuracy_positiva CHECK (((accuracy_m IS NULL) OR (accuracy_m >= (0)::numeric)));

ALTER TABLE ONLY public.checkpoints ADD CONSTRAINT chk_motivo_fallo CHECK (((tipo <> 'fallido'::text) OR (motivo_fallo IS NOT NULL)));

ALTER TABLE ONLY public.checkpoints ADD CONSTRAINT chk_tipo_checkpoint CHECK ((tipo = ANY (ARRAY['entregado'::text, 'fallido'::text, 'parcial'::text, 'inicio_ruta'::text, 'fin_ruta'::text])));

ALTER TABLE ONLY public.choferes ADD CONSTRAINT chk_choferes_turno_valido CHECK ((((turno_inicio IS NULL) AND (turno_fin IS NULL)) OR ((turno_inicio IS NOT NULL) AND (turno_fin IS NOT NULL) AND (turno_inicio < turno_fin))));

ALTER TABLE ONLY public.clientes ADD CONSTRAINT chk_clientes_ventana_valida CHECK ((((ventana_inicio IS NULL) AND (ventana_fin IS NULL)) OR ((ventana_inicio IS NOT NULL) AND (ventana_fin IS NOT NULL) AND (ventana_inicio < ventana_fin))));

ALTER TABLE ONLY public.detalle_pedidos ADD CONSTRAINT detalle_pedidos_cantidad_check CHECK ((cantidad > 0));

ALTER TABLE ONLY public.detalle_pedidos ADD CONSTRAINT detalle_pedidos_costo_unitario_check CHECK ((costo_unitario >= (0)::numeric));

ALTER TABLE ONLY public.detalle_pedidos ADD CONSTRAINT detalle_pedidos_precio_unitario_check CHECK ((precio_unitario >= (0)::numeric));

ALTER TABLE ONLY public.liquidaciones_ruta ADD CONSTRAINT chk_iel_rango CHECK (((iel IS NULL) OR ((iel >= (0)::numeric) AND (iel <= (1)::numeric))));

ALTER TABLE ONLY public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_cantidad_check CHECK ((cantidad > 0));

ALTER TABLE ONLY public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_costo_unitario_check CHECK ((costo_unitario >= (0)::numeric));

ALTER TABLE ONLY public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'salida'::text])));

ALTER TABLE ONLY public.pagos ADD CONSTRAINT pagos_metodo_pago_check CHECK ((metodo_pago = ANY (ARRAY['efectivo'::text, 'transferencia'::text, 'cheque'::text, 'otro'::text])));

ALTER TABLE ONLY public.pagos ADD CONSTRAINT pagos_monto_check CHECK ((monto > (0)::numeric));

ALTER TABLE ONLY public.parametros_sistema ADD CONSTRAINT chk_parametros_tipo CHECK ((tipo = ANY (ARRAY['numero'::text, 'texto'::text, 'booleano'::text, 'hora'::text])));

ALTER TABLE ONLY public.pedidos ADD CONSTRAINT pedidos_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'entregado'::text, 'anulado'::text])));

ALTER TABLE ONLY public.pedidos ADD CONSTRAINT pedidos_total_check CHECK ((total >= (0)::numeric));

ALTER TABLE ONLY public.pedidos ADD CONSTRAINT pedidos_total_pagado_check CHECK ((total_pagado >= (0)::numeric));

ALTER TABLE ONLY public.productos ADD CONSTRAINT chk_volumen_positivo CHECK ((volumen_unitario_m3 > (0)::numeric));

ALTER TABLE ONLY public.productos ADD CONSTRAINT productos_precio_venta_actual_check CHECK ((precio_venta_actual >= (0)::numeric));

ALTER TABLE ONLY public.productos ADD CONSTRAINT productos_stock_actual_check CHECK ((stock_actual >= 0));

ALTER TABLE ONLY public.productos ADD CONSTRAINT productos_stock_minimo_check CHECK ((stock_minimo >= 0));

ALTER TABLE ONLY public.productos ADD CONSTRAINT productos_varas_por_paquete_check CHECK ((varas_por_paquete > 0));

ALTER TABLE ONLY public.ruta_paradas ADD CONSTRAINT chk_orden_positivo CHECK ((orden > 0));

ALTER TABLE ONLY public.rutas_diarias ADD CONSTRAINT chk_ruta_estado CHECK ((estado = ANY (ARRAY['planificada'::text, 'en_curso'::text, 'completada'::text, 'cancelada'::text])));

ALTER TABLE ONLY public.sucursales ADD CONSTRAINT chk_lat_rango CHECK (((lat >= ('-90'::integer)::numeric) AND (lat <= (90)::numeric)));

ALTER TABLE ONLY public.sucursales ADD CONSTRAINT chk_lng_rango CHECK (((lng >= ('-180'::integer)::numeric) AND (lng <= (180)::numeric)));

ALTER TABLE ONLY public.vehiculos ADD CONSTRAINT chk_capacidad_positiva CHECK ((capacidad_vol_m3 > (0)::numeric));

ALTER TABLE ONLY public.vehiculos ADD CONSTRAINT chk_rendimiento_positivo CHECK ((rendimiento_kml > (0)::numeric));

ALTER TABLE ONLY public.chatbot_solicitudes ADD CONSTRAINT chatbot_solicitudes_atendido_por_fkey FOREIGN KEY (atendido_por) REFERENCES public.usuarios(id);

ALTER TABLE ONLY public.checkpoint_pagos ADD CONSTRAINT checkpoint_pagos_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES public.checkpoints(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.checkpoints ADD CONSTRAINT checkpoints_parada_id_fkey FOREIGN KEY (parada_id) REFERENCES public.ruta_paradas(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.choferes ADD CONSTRAINT choferes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.choferes ADD CONSTRAINT choferes_vehiculo_default_id_fkey FOREIGN KEY (vehiculo_default_id) REFERENCES public.vehiculos(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.detalle_pedidos ADD CONSTRAINT detalle_pedidos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.detalle_pedidos ADD CONSTRAINT detalle_pedidos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.historial_precios ADD CONSTRAINT historial_precios_modificado_por_fkey FOREIGN KEY (modificado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.historial_precios ADD CONSTRAINT historial_precios_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.liquidaciones_ruta ADD CONSTRAINT liquidaciones_ruta_cerrado_por_fkey FOREIGN KEY (cerrado_por) REFERENCES auth.users(id);

ALTER TABLE ONLY public.liquidaciones_ruta ADD CONSTRAINT liquidaciones_ruta_ruta_id_fkey FOREIGN KEY (ruta_id) REFERENCES public.rutas_diarias(id);

ALTER TABLE ONLY public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.pagos ADD CONSTRAINT pagos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.pagos ADD CONSTRAINT pagos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.pagos ADD CONSTRAINT pagos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.pedidos ADD CONSTRAINT pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.pedidos ADD CONSTRAINT pedidos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.productos ADD CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ruta_paradas ADD CONSTRAINT ruta_paradas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id);

ALTER TABLE ONLY public.ruta_paradas ADD CONSTRAINT ruta_paradas_ruta_id_fkey FOREIGN KEY (ruta_id) REFERENCES public.rutas_diarias(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rutas_diarias ADD CONSTRAINT rutas_diarias_chofer_id_fkey FOREIGN KEY (chofer_id) REFERENCES public.choferes(id);

ALTER TABLE ONLY public.rutas_diarias ADD CONSTRAINT rutas_diarias_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);

ALTER TABLE ONLY public.rutas_diarias ADD CONSTRAINT rutas_diarias_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES public.sucursales(id);

ALTER TABLE ONLY public.rutas_diarias ADD CONSTRAINT rutas_diarias_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(id);

ALTER TABLE ONLY public.vehiculos ADD CONSTRAINT vehiculos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES public.sucursales(id) ON DELETE SET NULL;

-- ─── Índices y vista ────────────────────────────────────────────────────────

CREATE INDEX idx_chatbot_sesiones_created_at ON public.chatbot_sesiones USING btree (created_at);
CREATE INDEX idx_chatbot_sesiones_telefono ON public.chatbot_sesiones USING btree (telefono);
CREATE INDEX idx_chatbot_solicitudes_atendido ON public.chatbot_solicitudes USING btree (atendido_por);
CREATE INDEX idx_chatbot_solicitudes_estado ON public.chatbot_solicitudes USING btree (estado);
CREATE INDEX idx_chatbot_solicitudes_telefono ON public.chatbot_solicitudes USING btree (telefono);
CREATE INDEX idx_checkpoints_baja_precision ON public.checkpoints USING btree (parada_id) WHERE (accuracy_m > (100)::numeric);
CREATE INDEX idx_checkpoints_fallidos ON public.checkpoints USING btree (parada_id, timestamp_local DESC) WHERE (tipo = 'fallido'::text);
CREATE INDEX idx_checkpoints_parada ON public.checkpoints USING btree (parada_id);
CREATE INDEX idx_checkpoints_timestamp ON public.checkpoints USING btree (timestamp_local DESC);
CREATE INDEX idx_checkpoints_tipo ON public.checkpoints USING btree (tipo);
CREATE INDEX idx_choferes_activos ON public.choferes USING btree (nombre_completo) WHERE (activo = true);
CREATE INDEX idx_choferes_usuario ON public.choferes USING btree (usuario_id);
CREATE INDEX idx_choferes_vehiculo ON public.choferes USING btree (vehiculo_default_id);
CREATE INDEX idx_ckpagos_checkpoint ON public.checkpoint_pagos USING btree (checkpoint_id);
CREATE INDEX idx_clientes_activos ON public.clientes USING btree (razon_social) WHERE (activo = true);
CREATE INDEX idx_detalle_pedido_producto ON public.detalle_pedidos USING btree (pedido_id, producto_id);
CREATE INDEX idx_detalle_pedidos_pedido_id ON public.detalle_pedidos USING btree (pedido_id);
CREATE INDEX idx_detalle_pedidos_producto_id ON public.detalle_pedidos USING btree (producto_id);
CREATE INDEX idx_historial_precios_modificado_por ON public.historial_precios USING btree (modificado_por);
CREATE INDEX idx_historial_precios_producto_id ON public.historial_precios USING btree (producto_id);
CREATE INDEX idx_liquidaciones_cerrado ON public.liquidaciones_ruta USING btree (cerrado_por);
CREATE INDEX idx_liquidaciones_fecha ON public.liquidaciones_ruta USING btree (created_at DESC);
CREATE INDEX idx_liquidaciones_iel ON public.liquidaciones_ruta USING btree (iel DESC) WHERE (iel IS NOT NULL);
CREATE INDEX idx_liquidaciones_ruta ON public.liquidaciones_ruta USING btree (ruta_id);
CREATE INDEX idx_movimientos_creado_por ON public.movimientos_inventario USING btree (creado_por);
CREATE INDEX idx_movimientos_created_at ON public.movimientos_inventario USING btree (created_at DESC);
CREATE INDEX idx_movimientos_pedido_id ON public.movimientos_inventario USING btree (pedido_id);
CREATE INDEX idx_movimientos_producto_fecha ON public.movimientos_inventario USING btree (producto_id, created_at DESC);
CREATE INDEX idx_movimientos_producto_id ON public.movimientos_inventario USING btree (producto_id);
CREATE INDEX idx_movimientos_proveedor_id ON public.movimientos_inventario USING btree (proveedor_id);
CREATE INDEX idx_movimientos_tipo ON public.movimientos_inventario USING btree (tipo);
CREATE INDEX idx_pagos_cliente_id ON public.pagos USING btree (cliente_id);
CREATE INDEX idx_pagos_creado_por ON public.pagos USING btree (creado_por);
CREATE INDEX idx_pagos_created_at ON public.pagos USING btree (created_at DESC);
CREATE INDEX idx_pagos_pedido_id ON public.pagos USING btree (pedido_id);
CREATE INDEX idx_paradas_pedido ON public.ruta_paradas USING btree (pedido_id);
CREATE INDEX idx_paradas_ruta ON public.ruta_paradas USING btree (ruta_id, orden);
CREATE INDEX idx_pedidos_cliente_id ON public.pedidos USING btree (cliente_id);
CREATE INDEX idx_pedidos_creado_por ON public.pedidos USING btree (creado_por);
CREATE INDEX idx_pedidos_created_at ON public.pedidos USING btree (created_at DESC);
CREATE INDEX idx_pedidos_estado ON public.pedidos USING btree (estado);
CREATE INDEX idx_pedidos_estado_fecha ON public.pedidos USING btree (estado, created_at DESC);
CREATE INDEX idx_pedidos_pendientes ON public.pedidos USING btree (cliente_id, created_at DESC) WHERE (estado = ANY (ARRAY['pendiente'::text, 'confirmado'::text]));
CREATE INDEX idx_productos_activos ON public.productos USING btree (nombre) WHERE (activo = true);
CREATE INDEX idx_productos_categoria_id ON public.productos USING btree (categoria_id);
CREATE INDEX idx_productos_stock_bajo ON public.productos USING btree (stock_actual, stock_minimo) WHERE (activo = true);
CREATE INDEX idx_proveedores_activos ON public.proveedores USING btree (nombre) WHERE (activo = true);
CREATE INDEX idx_rutas_activas_hoy ON public.rutas_diarias USING btree (chofer_id, fecha) WHERE (estado = ANY (ARRAY['planificada'::text, 'en_curso'::text]));
CREATE INDEX idx_rutas_chofer ON public.rutas_diarias USING btree (chofer_id, fecha DESC);
CREATE INDEX idx_rutas_creado_por ON public.rutas_diarias USING btree (creado_por);
CREATE INDEX idx_rutas_estado ON public.rutas_diarias USING btree (estado, fecha DESC);
CREATE INDEX idx_rutas_fecha ON public.rutas_diarias USING btree (fecha DESC);
CREATE INDEX idx_rutas_sucursal ON public.rutas_diarias USING btree (sucursal_id, fecha DESC);
CREATE INDEX idx_rutas_vehiculo ON public.rutas_diarias USING btree (vehiculo_id, fecha DESC);
CREATE INDEX idx_sucursales_activas ON public.sucursales USING btree (nombre) WHERE (activo = true);
CREATE INDEX idx_usuarios_rol ON public.usuarios USING btree (rol);
CREATE INDEX idx_vehiculos_activos ON public.vehiculos USING btree (patente) WHERE (activo = true);
CREATE INDEX idx_vehiculos_sucursal ON public.vehiculos USING btree (sucursal_id) WHERE (activo = true);

CREATE VIEW public.v_resumen_rutas AS
 SELECT rd.id,
    rd.fecha,
    rd.estado,
    rd.km_planificados,
    rd.bencina_proyectada_lts,
    rd.costo_bencina_proyectado,
    s.nombre AS sucursal_nombre,
    v.patente AS vehiculo_patente,
    v.modelo AS vehiculo_modelo,
    c.nombre_completo AS chofer_nombre,
    count(rp.id) AS total_paradas,
    count(ck.id) FILTER (WHERE ck.tipo = 'entregado'::text) AS entregas_exitosas,
    count(ck.id) FILTER (WHERE ck.tipo = 'fallido'::text) AS entregas_fallidas,
    count(ck.id) FILTER (WHERE ck.tipo = 'parcial'::text) AS entregas_parciales,
    COALESCE(sum(cp.monto) FILTER (WHERE cp.metodo_pago = 'efectivo'::text), 0::numeric) AS total_efectivo,
    COALESCE(sum(cp.monto) FILTER (WHERE cp.metodo_pago = 'transferencia'::text), 0::numeric) AS total_transferencia,
    lq.iel,
    lq.km_reales,
    lq.costo_bencina_real,
    rd.created_at
   FROM public.rutas_diarias rd
     JOIN public.sucursales s ON s.id = rd.sucursal_id
     JOIN public.vehiculos v ON v.id = rd.vehiculo_id
     JOIN public.choferes c ON c.id = rd.chofer_id
     LEFT JOIN public.ruta_paradas rp ON rp.ruta_id = rd.id
     LEFT JOIN public.checkpoints ck ON ck.parada_id = rp.id
     LEFT JOIN public.checkpoint_pagos cp ON cp.checkpoint_id = ck.id
     LEFT JOIN public.liquidaciones_ruta lq ON lq.ruta_id = rd.id
  GROUP BY rd.id, s.nombre, v.patente, v.modelo, c.nombre_completo, lq.iel, lq.km_reales, lq.costo_bencina_real;

-- ─── Funciones ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.actualizar_stock_producto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NEW.tipo = 'entrada' THEN
        UPDATE public.productos
        SET stock_actual = stock_actual + NEW.cantidad
        WHERE id = NEW.producto_id;
    ELSIF NEW.tipo = 'salida' THEN
        UPDATE public.productos
        SET stock_actual = stock_actual - NEW.cantidad
        WHERE id = NEW.producto_id;
    END IF;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.calcular_iel(p_km_planificados numeric, p_km_reales numeric, p_exitosas integer, p_total_paradas integer, p_tiempo_muerto integer, p_tiempo_total integer)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_iel_km       NUMERIC;
  v_iel_entregas NUMERIC;
  v_iel_tiempo   NUMERIC;
  v_iel          NUMERIC;
BEGIN
  -- Componente 1: eficiencia de kilometros (planificado vs real)
  -- Si km_reales = 0 o null, IEL km = 0
  IF p_km_reales IS NULL OR p_km_reales = 0 OR p_km_planificados IS NULL THEN
    v_iel_km := 0;
  ELSE
    v_iel_km := LEAST(p_km_planificados / p_km_reales, 1.0);
  END IF;

  -- Componente 2: tasa de exito de entregas
  IF p_total_paradas IS NULL OR p_total_paradas = 0 THEN
    v_iel_entregas := 0;
  ELSE
    v_iel_entregas := ROUND(p_exitosas::NUMERIC / p_total_paradas, 4);
  END IF;

  -- Componente 3: eficiencia de tiempo (1 - fraccion de tiempo muerto)
  IF p_tiempo_total IS NULL OR p_tiempo_total = 0 THEN
    v_iel_tiempo := 1.0;
  ELSE
    v_iel_tiempo := GREATEST(1.0 - (COALESCE(p_tiempo_muerto, 0)::NUMERIC / p_tiempo_total), 0);
  END IF;

  -- IEL compuesto: promedio geometrico de las 3 componentes
  -- Geometrico penaliza mas los valores bajos que el promedio aritmetico
  v_iel := ROUND(
    POWER(v_iel_km * v_iel_entregas * v_iel_tiempo, 1.0/3.0),
    4
  );

  RETURN v_iel;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_chofer_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT id FROM public.choferes WHERE usuario_id = (SELECT auth.uid()) AND activo = true
$function$
;
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS public.user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT rol FROM public.usuarios WHERE id = (SELECT auth.uid())
$function$
;
CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.procesar_anulacion_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  detalle RECORD;
BEGIN
  IF NEW.estado = 'anulado' AND OLD.estado != 'anulado' THEN
    FOR detalle IN SELECT * FROM public.detalle_pedidos WHERE pedido_id = NEW.id LOOP
      INSERT INTO public.movimientos_inventario (
        producto_id, cantidad, tipo, nota, pedido_id, costo_unitario
      ) VALUES (
        detalle.producto_id, 
        detalle.cantidad, 
        'entrada', 
        'Devolución por Pedido Anulado #' || NEW.id, 
        NEW.id,
        detalle.costo_unitario
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.procesar_salida_por_venta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.movimientos_inventario (producto_id, cantidad, tipo, nota, pedido_id, costo_unitario)
  VALUES (
    NEW.producto_id, 
    NEW.cantidad, 
    'salida', 
    'Salida automática por Venta - Pedido #' || NEW.pedido_id, 
    NEW.pedido_id,
    0
  );
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.recalcular_saldo_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cliente_id bigint;
  v_saldo_total numeric(12,2);
BEGIN
  v_cliente_id := new.cliente_id;

  SELECT coalesce(sum(total - total_pagado), 0)
  INTO v_saldo_total
  FROM public.pedidos
  WHERE cliente_id = v_cliente_id
    AND estado != 'anulado';

  UPDATE public.clientes
  SET saldo_pendiente = v_saldo_total
  WHERE id = v_cliente_id;

  RETURN new;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.recalcular_total_pagado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pedido_id bigint;
  v_total_pagado numeric(12,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_pedido_id := old.pedido_id;
  ELSE
    v_pedido_id := new.pedido_id;
  END IF;

  SELECT coalesce(sum(monto), 0)
  INTO v_total_pagado
  FROM public.pagos
  WHERE pedido_id = v_pedido_id;

  UPDATE public.pedidos
  SET total_pagado = v_total_pagado
  WHERE id = v_pedido_id;

  IF TG_OP = 'DELETE' THEN
    RETURN old;
  END IF;
  RETURN new;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.recalcular_total_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pedido_id bigint;
  v_nuevo_total numeric(12,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_pedido_id := old.pedido_id;
  ELSE
    v_pedido_id := new.pedido_id;
  END IF;

  SELECT coalesce(sum(cantidad * precio_unitario), 0)
  INTO v_nuevo_total
  FROM public.detalle_pedidos
  WHERE pedido_id = v_pedido_id;

  UPDATE public.pedidos
  SET total = v_nuevo_total
  WHERE id = v_pedido_id;

  IF TG_OP = 'DELETE' THEN
    RETURN old;
  END IF;
  RETURN new;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.registrar_cambio_precio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF old.precio_venta_actual IS DISTINCT FROM new.precio_venta_actual THEN
    INSERT INTO public.historial_precios (producto_id, precio_anterior, precio_nuevo, modificado_por)
    VALUES (new.id, old.precio_venta_actual, new.precio_venta_actual, auth.uid());
  END IF;
  RETURN new;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.es_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select private.obtener_rol_usuario()) = 'admin', false);
$function$
;
CREATE OR REPLACE FUNCTION private.get_user_role()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(
    (SELECT rol FROM public.usuarios WHERE id = auth.uid()),
    'vendedor'
  );
$function$
;
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT (SELECT private.get_user_role()) = 'admin';
$function$
;
CREATE OR REPLACE FUNCTION private.is_gerente_or_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT (SELECT private.get_user_role()) IN ('admin', 'gerente');
$function$
;
CREATE OR REPLACE FUNCTION private.obtener_rol_usuario()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select rol from public.usuarios where id = (select auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_rol public.user_role;
  v_existing_id uuid;
BEGIN
  -- Verificar si ya existe un registro en public.usuarios con ese email
  -- (Pre-registrado por el admin para la lista blanca)
  SELECT id INTO v_existing_id FROM public.usuarios WHERE email = NEW.email;

  IF v_existing_id IS NOT NULL THEN
    -- El usuario fue pre-registrado. Actualizar su id de auth.users
    -- y opcionalmente su nombre con el de Google
    UPDATE public.usuarios
    SET id = NEW.id,
        nombre = COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            public.usuarios.nombre
        )
    WHERE email = NEW.email;
  ELSE
    -- Usuario nuevo por email/password (flujo original)
    IF NEW.email = 'javier21catalan@gmail.com' THEN
      v_rol := 'admin'::public.user_role;
    ELSE
      v_rol := 'vendedor'::public.user_role;
    END IF;

    INSERT INTO public.usuarios (id, email, nombre, rol)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(
          NEW.raw_user_meta_data->>'full_name',
          split_part(NEW.email, '@', 1)
      ),
      v_rol
    );
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.liquidar_ruta(p_ruta_id bigint, p_km_reales numeric, p_bencina_real_lts numeric, p_precio_litro numeric, p_nota_cierre text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ruta RECORD;
  v_conteos RECORD;
  v_tiempos RECORD;
  v_cobros RECORD;
  v_iel NUMERIC;
  v_iel_km NUMERIC;
  v_iel_entregas NUMERIC;
  v_iel_tiempo NUMERIC;
  v_total_paradas INT;
BEGIN
  -- Obtener datos de la ruta
  SELECT * INTO v_ruta FROM public.rutas_diarias WHERE id = p_ruta_id;
  IF v_ruta IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ruta no encontrada');
  END IF;

  -- Contar resultados de checkpoints
  SELECT
    COUNT(*) FILTER (WHERE ck.tipo = 'entregado') AS exitosas,
    COUNT(*) FILTER (WHERE ck.tipo = 'fallido') AS fallidas,
    COUNT(*) FILTER (WHERE ck.tipo = 'parcial') AS parciales
  INTO v_conteos
  FROM public.ruta_paradas rp
  LEFT JOIN public.checkpoints ck ON ck.parada_id = rp.id
  WHERE rp.ruta_id = p_ruta_id;

  v_total_paradas := v_conteos.exitosas + v_conteos.fallidas + v_conteos.parciales;

  -- Calcular tiempos desde checkpoints
  SELECT
    MIN(ck.timestamp_local) AS hora_inicio,
    MAX(ck.timestamp_local) AS hora_fin,
    EXTRACT(EPOCH FROM MAX(ck.timestamp_local) - MIN(ck.timestamp_local))::INT / 60 AS tiempo_total_min
  INTO v_tiempos
  FROM public.checkpoints ck
  JOIN public.ruta_paradas rp ON rp.id = ck.parada_id
  WHERE rp.ruta_id = p_ruta_id;

  -- Calcular cobros
  SELECT
    COALESCE(SUM(cp.monto) FILTER (WHERE cp.metodo_pago = 'efectivo'), 0) AS efectivo,
    COALESCE(SUM(cp.monto) FILTER (WHERE cp.metodo_pago = 'transferencia'), 0) AS transferencia
  INTO v_cobros
  FROM public.checkpoint_pagos cp
  JOIN public.checkpoints ck ON ck.id = cp.checkpoint_id
  JOIN public.ruta_paradas rp ON rp.id = ck.parada_id
  WHERE rp.ruta_id = p_ruta_id;

  -- Calcular IEL usando la funcion publica
  v_iel := public.calcular_iel(
    v_ruta.km_planificados,
    p_km_reales,
    v_conteos.exitosas,
    v_total_paradas,
    0,  -- tiempo_muerto se calcula a futuro con mas precision
    COALESCE(v_tiempos.tiempo_total_min, 1)
  );

  -- Calcular componentes individuales para desglose
  IF p_km_reales > 0 AND v_ruta.km_planificados IS NOT NULL THEN
    v_iel_km := LEAST(v_ruta.km_planificados / p_km_reales, 1.0);
  ELSE
    v_iel_km := 0;
  END IF;

  IF v_total_paradas > 0 THEN
    v_iel_entregas := ROUND(v_conteos.exitosas::NUMERIC / v_total_paradas, 4);
  ELSE
    v_iel_entregas := 0;
  END IF;

  v_iel_tiempo := 1.0; -- placeholder hasta tener deteccion de tiempos muertos

  -- Actualizar ruta a completada
  UPDATE public.rutas_diarias SET estado = 'completada' WHERE id = p_ruta_id;

  -- Insertar liquidacion
  INSERT INTO public.liquidaciones_ruta (
    ruta_id, km_reales, bencina_real_lts, precio_litro_real,
    costo_bencina_real,
    total_cobrado_efectivo, total_cobrado_transferencia,
    paradas_exitosas, paradas_fallidas, paradas_parciales,
    hora_inicio, hora_fin, tiempo_total_min, tiempo_muerto_min,
    iel, iel_km, iel_entregas, iel_tiempo,
    nota_cierre, cerrado_por
  ) VALUES (
    p_ruta_id, p_km_reales, p_bencina_real_lts, p_precio_litro,
    ROUND(p_bencina_real_lts * p_precio_litro, 2),
    v_cobros.efectivo, v_cobros.transferencia,
    v_conteos.exitosas, v_conteos.fallidas, v_conteos.parciales,
    v_tiempos.hora_inicio, v_tiempos.hora_fin, v_tiempos.tiempo_total_min, 0,
    v_iel, v_iel_km, v_iel_entregas, v_iel_tiempo,
    p_nota_cierre, (SELECT auth.uid())
  )
  ON CONFLICT (ruta_id) DO UPDATE SET
    km_reales = EXCLUDED.km_reales,
    bencina_real_lts = EXCLUDED.bencina_real_lts,
    precio_litro_real = EXCLUDED.precio_litro_real,
    costo_bencina_real = EXCLUDED.costo_bencina_real,
    iel = EXCLUDED.iel,
    iel_km = EXCLUDED.iel_km,
    iel_entregas = EXCLUDED.iel_entregas,
    iel_tiempo = EXCLUDED.iel_tiempo,
    nota_cierre = EXCLUDED.nota_cierre;

  RETURN jsonb_build_object(
    'ok', true,
    'iel', v_iel,
    'iel_km', v_iel_km,
    'iel_entregas', v_iel_entregas,
    'km_planificados', v_ruta.km_planificados,
    'km_reales', p_km_reales,
    'costo_bencina_proyectado', v_ruta.costo_bencina_proyectado,
    'costo_bencina_real', ROUND(p_bencina_real_lts * p_precio_litro, 2),
    'entregas_exitosas', v_conteos.exitosas,
    'total_paradas', v_total_paradas
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_checkpoint(p_parada_id bigint, p_tipo text, p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_timestamp_local timestamp with time zone, p_motivo_fallo text DEFAULT NULL::text, p_nota text DEFAULT NULL::text, p_pago_monto numeric DEFAULT NULL::numeric, p_pago_metodo text DEFAULT NULL::text, p_pago_referencia text DEFAULT NULL::text, p_foto_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_checkpoint_id BIGINT;
  v_ruta_id BIGINT;
  v_result JSONB;
BEGIN
  -- Verificar que la parada pertenece a la ruta del chofer actual
  SELECT rd.id INTO v_ruta_id
  FROM public.ruta_paradas rp
  JOIN public.rutas_diarias rd ON rd.id = rp.ruta_id
  JOIN public.choferes c ON c.id = rd.chofer_id
  WHERE rp.id = p_parada_id
    AND c.usuario_id = (SELECT auth.uid())
    AND rd.estado IN ('planificada','en_curso')
    AND rd.fecha = CURRENT_DATE;

  IF v_ruta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Parada no encontrada o no autorizada');
  END IF;

  -- Auto-poner ruta en_curso si estaba planificada
  UPDATE public.rutas_diarias
  SET estado = 'en_curso'
  WHERE id = v_ruta_id AND estado = 'planificada';

  -- Insertar checkpoint (idempotente por timestamp_local + parada_id)
  INSERT INTO public.checkpoints (
    parada_id, tipo, lat, lng, accuracy_m, timestamp_local, motivo_fallo, nota
  ) VALUES (
    p_parada_id, p_tipo, p_lat, p_lng, p_accuracy_m, p_timestamp_local, p_motivo_fallo, p_nota
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_checkpoint_id;

  -- Si ya existia (duplicado), buscar el existente
  IF v_checkpoint_id IS NULL THEN
    SELECT id INTO v_checkpoint_id
    FROM public.checkpoints
    WHERE parada_id = p_parada_id AND timestamp_local = p_timestamp_local;
  END IF;

  -- Si hay pago, insertarlo
  IF p_pago_monto IS NOT NULL AND p_pago_monto > 0 AND v_checkpoint_id IS NOT NULL THEN
    INSERT INTO public.checkpoint_pagos (
      checkpoint_id, monto, metodo_pago, referencia, foto_comprobante_url
    ) VALUES (
      v_checkpoint_id, p_pago_monto, COALESCE(p_pago_metodo, 'efectivo'), p_pago_referencia, p_foto_url
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'checkpoint_id', v_checkpoint_id,
    'ruta_id', v_ruta_id
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validar_email_autorizado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Verificar si el email ya existe en la tabla de usuarios autorizados
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE email = NEW.email) THEN
    RAISE EXCEPTION 'Acceso denegado: El correo % no pertenece al personal autorizado del SGDF.', NEW.email;
  END IF;
  
  RETURN NEW;
END;
$function$
;

-- ─── Triggers, RLS y políticas ──────────────────────────────────────────────

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER trigger_validar_email BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.validar_email_autorizado();
CREATE TRIGGER trg_choferes_updated_at BEFORE UPDATE ON public.choferes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_detalle_recalcular_total AFTER INSERT OR DELETE OR UPDATE ON public.detalle_pedidos FOR EACH ROW EXECUTE FUNCTION public.recalcular_total_pedido();
CREATE TRIGGER trigger_salida_por_venta AFTER INSERT ON public.detalle_pedidos FOR EACH ROW EXECUTE FUNCTION public.procesar_salida_por_venta();
CREATE TRIGGER trg_actualizar_stock AFTER INSERT ON public.movimientos_inventario FOR EACH ROW EXECUTE FUNCTION public.actualizar_stock_producto();
CREATE TRIGGER trg_pagos_recalcular_total_pagado AFTER INSERT OR DELETE OR UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.recalcular_total_pagado();
CREATE TRIGGER trg_parametros_updated_at BEFORE UPDATE ON public.parametros_sistema FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_anulacion_pedido AFTER UPDATE OF estado ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.procesar_anulacion_pedido();
CREATE TRIGGER trg_pedidos_recalcular_saldo_cliente AFTER INSERT OR UPDATE OF total, total_pagado, estado ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.recalcular_saldo_cliente();
CREATE TRIGGER trg_pedidos_updated_at BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_productos_historial_precio AFTER UPDATE OF precio_venta_actual ON public.productos FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_precio();
CREATE TRIGGER trg_productos_updated_at BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_rutas_updated_at BEFORE UPDATE ON public.rutas_diarias FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_vehiculos_updated_at BEFORE UPDATE ON public.vehiculos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_consentimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choferes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidaciones_ruta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametros_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ruta_paradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY categorias_delete ON public.categorias AS PERMISSIVE FOR DELETE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY categorias_insert ON public.categorias AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (( SELECT private.es_admin() AS es_admin));
CREATE POLICY categorias_select ON public.categorias AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY categorias_update ON public.categorias AS PERMISSIVE FOR UPDATE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY "Usuarios autenticados pueden ver consentimientos" ON public.chatbot_consentimientos AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "Usuarios autenticados pueden ver sesiones" ON public.chatbot_sesiones AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "Solo admin y gerentes pueden actualizar solicitudes" ON public.chatbot_solicitudes AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY (ARRAY['admin'::public.user_role, 'gerente'::public.user_role]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY (ARRAY['admin'::public.user_role, 'gerente'::public.user_role]))))));
CREATE POLICY "Usuarios autenticados pueden ver solicitudes" ON public.chatbot_solicitudes AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY ckpagos_insert_opt ON public.checkpoint_pagos AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])) OR (EXISTS ( SELECT 1
   FROM ((public.checkpoints ck
     JOIN public.ruta_paradas rp ON ((rp.id = ck.parada_id)))
     JOIN public.rutas_diarias rd ON ((rd.id = rp.ruta_id)))
  WHERE ((ck.id = checkpoint_pagos.checkpoint_id) AND (rd.chofer_id = ( SELECT public.get_chofer_id() AS get_chofer_id)))))));
CREATE POLICY ckpagos_select_opt ON public.checkpoint_pagos AS PERMISSIVE FOR SELECT TO authenticated
    USING (((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'gerente'::public.user_role, 'jefe_operaciones'::public.user_role])) OR (EXISTS ( SELECT 1
   FROM ((public.checkpoints ck
     JOIN public.ruta_paradas rp ON ((rp.id = ck.parada_id)))
     JOIN public.rutas_diarias rd ON ((rd.id = rp.ruta_id)))
  WHERE ((ck.id = checkpoint_pagos.checkpoint_id) AND (rd.chofer_id = ( SELECT public.get_chofer_id() AS get_chofer_id)))))));
CREATE POLICY checkpoints_insert_opt ON public.checkpoints AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])) OR (EXISTS ( SELECT 1
   FROM (public.ruta_paradas rp
     JOIN public.rutas_diarias rd ON ((rd.id = rp.ruta_id)))
  WHERE ((rp.id = checkpoints.parada_id) AND (rd.chofer_id = ( SELECT public.get_chofer_id() AS get_chofer_id)) AND (rd.estado = ANY (ARRAY['planificada'::text, 'en_curso'::text])) AND (rd.fecha = CURRENT_DATE))))));
CREATE POLICY checkpoints_select_opt ON public.checkpoints AS PERMISSIVE FOR SELECT TO authenticated
    USING (((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'gerente'::public.user_role, 'jefe_operaciones'::public.user_role])) OR (EXISTS ( SELECT 1
   FROM (public.ruta_paradas rp
     JOIN public.rutas_diarias rd ON ((rd.id = rp.ruta_id)))
  WHERE ((rp.id = checkpoints.parada_id) AND (rd.chofer_id = ( SELECT public.get_chofer_id() AS get_chofer_id)) AND (rd.fecha = CURRENT_DATE))))));
CREATE POLICY choferes_modify_opt ON public.choferes AS PERMISSIVE FOR ALL TO authenticated
    USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])))
    WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])));
CREATE POLICY choferes_select_autenticados ON public.choferes AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY clientes_delete ON public.clientes AS PERMISSIVE FOR DELETE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY clientes_insert ON public.clientes AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY clientes_select ON public.clientes AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY clientes_update ON public.clientes AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((auth.uid() IS NOT NULL))
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY detalle_pedidos_delete ON public.detalle_pedidos AS PERMISSIVE FOR DELETE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY detalle_pedidos_insert ON public.detalle_pedidos AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY detalle_pedidos_select ON public.detalle_pedidos AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY detalle_pedidos_update ON public.detalle_pedidos AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((auth.uid() IS NOT NULL))
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY historial_precios_insert ON public.historial_precios AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (( SELECT private.es_admin() AS es_admin));
CREATE POLICY historial_precios_select ON public.historial_precios AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY liquidaciones_modify_opt ON public.liquidaciones_ruta AS PERMISSIVE FOR ALL TO authenticated
    USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])))
    WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])));
CREATE POLICY liquidaciones_select_opt ON public.liquidaciones_ruta AS PERMISSIVE FOR SELECT TO authenticated
    USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'gerente'::public.user_role, 'jefe_operaciones'::public.user_role])));
CREATE POLICY movimientos_insert ON public.movimientos_inventario AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (( SELECT private.es_admin() AS es_admin));
CREATE POLICY movimientos_select ON public.movimientos_inventario AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY pagos_delete ON public.pagos AS PERMISSIVE FOR DELETE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY pagos_insert ON public.pagos AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY pagos_select ON public.pagos AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY pagos_update ON public.pagos AS PERMISSIVE FOR UPDATE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY parametros_modify_admin ON public.parametros_sistema AS PERMISSIVE FOR ALL TO authenticated
    USING (( SELECT private.es_admin() AS es_admin))
    WITH CHECK (( SELECT private.es_admin() AS es_admin));
CREATE POLICY parametros_select_autenticados ON public.parametros_sistema AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY pedidos_delete ON public.pedidos AS PERMISSIVE FOR DELETE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY pedidos_insert ON public.pedidos AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY pedidos_select ON public.pedidos AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY pedidos_update ON public.pedidos AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((auth.uid() IS NOT NULL))
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY productos_delete ON public.productos AS PERMISSIVE FOR DELETE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY productos_insert ON public.productos AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (( SELECT private.es_admin() AS es_admin));
CREATE POLICY productos_select ON public.productos AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY productos_update ON public.productos AS PERMISSIVE FOR UPDATE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY proveedores_delete ON public.proveedores AS PERMISSIVE FOR DELETE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY proveedores_insert ON public.proveedores AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (( SELECT private.es_admin() AS es_admin));
CREATE POLICY proveedores_select ON public.proveedores AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY proveedores_update ON public.proveedores AS PERMISSIVE FOR UPDATE TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY paradas_modify_opt ON public.ruta_paradas AS PERMISSIVE FOR ALL TO authenticated
    USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])))
    WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])));
CREATE POLICY paradas_select_autenticados ON public.ruta_paradas AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY rutas_modify_jefe_optimizado ON public.rutas_diarias AS PERMISSIVE FOR ALL TO authenticated
    USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])))
    WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])));
CREATE POLICY rutas_select_optimizado ON public.rutas_diarias AS PERMISSIVE FOR SELECT TO authenticated
    USING (((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'gerente'::public.user_role, 'vendedor'::public.user_role, 'jefe_operaciones'::public.user_role])) OR ((( SELECT public.get_chofer_id() AS get_chofer_id) = chofer_id) AND (fecha = CURRENT_DATE))));
CREATE POLICY sucursales_modify_opt ON public.sucursales AS PERMISSIVE FOR ALL TO authenticated
    USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])))
    WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])));
CREATE POLICY sucursales_select_autenticados ON public.sucursales AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY usuarios_admin_all ON public.usuarios AS PERMISSIVE FOR ALL TO authenticated
    USING (( SELECT private.es_admin() AS es_admin));
CREATE POLICY usuarios_select ON public.usuarios AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY usuarios_update_self ON public.usuarios AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((( SELECT auth.uid() AS uid) = id))
    WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY vehiculos_modify_opt ON public.vehiculos AS PERMISSIVE FOR ALL TO authenticated
    USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])))
    WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'jefe_operaciones'::public.user_role])));
CREATE POLICY vehiculos_select_autenticados ON public.vehiculos AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);

-- ─── Permisos ───────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION private.es_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.es_admin() TO PUBLIC;
REVOKE ALL ON FUNCTION private.get_user_role() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_user_role() TO PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin() TO PUBLIC;
REVOKE ALL ON FUNCTION private.is_gerente_or_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_gerente_or_admin() TO PUBLIC;
REVOKE ALL ON FUNCTION private.obtener_rol_usuario() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.obtener_rol_usuario() TO PUBLIC;
REVOKE ALL ON FUNCTION public.actualizar_stock_producto() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_stock_producto() TO service_role;
REVOKE ALL ON FUNCTION public.calcular_iel(p_km_planificados numeric, p_km_reales numeric, p_exitosas integer, p_total_paradas integer, p_tiempo_muerto integer, p_tiempo_total integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calcular_iel(p_km_planificados numeric, p_km_reales numeric, p_exitosas integer, p_total_paradas integer, p_tiempo_muerto integer, p_tiempo_total integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.calcular_iel(p_km_planificados numeric, p_km_reales numeric, p_exitosas integer, p_total_paradas integer, p_tiempo_muerto integer, p_tiempo_total integer) TO anon;
GRANT EXECUTE ON FUNCTION public.calcular_iel(p_km_planificados numeric, p_km_reales numeric, p_exitosas integer, p_total_paradas integer, p_tiempo_muerto integer, p_tiempo_total integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_iel(p_km_planificados numeric, p_km_reales numeric, p_exitosas integer, p_total_paradas integer, p_tiempo_muerto integer, p_tiempo_total integer) TO service_role;
REVOKE ALL ON FUNCTION public.get_chofer_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_chofer_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chofer_id() TO anon;
GRANT EXECUTE ON FUNCTION public.get_chofer_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chofer_id() TO service_role;
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
REVOKE ALL ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.liquidar_ruta(p_ruta_id bigint, p_km_reales numeric, p_bencina_real_lts numeric, p_precio_litro numeric, p_nota_cierre text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.liquidar_ruta(p_ruta_id bigint, p_km_reales numeric, p_bencina_real_lts numeric, p_precio_litro numeric, p_nota_cierre text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.liquidar_ruta(p_ruta_id bigint, p_km_reales numeric, p_bencina_real_lts numeric, p_precio_litro numeric, p_nota_cierre text) TO anon;
GRANT EXECUTE ON FUNCTION public.liquidar_ruta(p_ruta_id bigint, p_km_reales numeric, p_bencina_real_lts numeric, p_precio_litro numeric, p_nota_cierre text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liquidar_ruta(p_ruta_id bigint, p_km_reales numeric, p_bencina_real_lts numeric, p_precio_litro numeric, p_nota_cierre text) TO service_role;
REVOKE ALL ON FUNCTION public.procesar_anulacion_pedido() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.procesar_anulacion_pedido() TO service_role;
REVOKE ALL ON FUNCTION public.procesar_salida_por_venta() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.procesar_salida_por_venta() TO service_role;
REVOKE ALL ON FUNCTION public.recalcular_saldo_cliente() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_saldo_cliente() TO service_role;
REVOKE ALL ON FUNCTION public.recalcular_total_pagado() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_total_pagado() TO service_role;
REVOKE ALL ON FUNCTION public.recalcular_total_pedido() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_total_pedido() TO service_role;
REVOKE ALL ON FUNCTION public.registrar_cambio_precio() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_cambio_precio() TO service_role;
REVOKE ALL ON FUNCTION public.sync_checkpoint(p_parada_id bigint, p_tipo text, p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_timestamp_local timestamp with time zone, p_motivo_fallo text, p_nota text, p_pago_monto numeric, p_pago_metodo text, p_pago_referencia text, p_foto_url text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_checkpoint(p_parada_id bigint, p_tipo text, p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_timestamp_local timestamp with time zone, p_motivo_fallo text, p_nota text, p_pago_monto numeric, p_pago_metodo text, p_pago_referencia text, p_foto_url text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_checkpoint(p_parada_id bigint, p_tipo text, p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_timestamp_local timestamp with time zone, p_motivo_fallo text, p_nota text, p_pago_monto numeric, p_pago_metodo text, p_pago_referencia text, p_foto_url text) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_checkpoint(p_parada_id bigint, p_tipo text, p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_timestamp_local timestamp with time zone, p_motivo_fallo text, p_nota text, p_pago_monto numeric, p_pago_metodo text, p_pago_referencia text, p_foto_url text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_checkpoint(p_parada_id bigint, p_tipo text, p_lat numeric, p_lng numeric, p_accuracy_m numeric, p_timestamp_local timestamp with time zone, p_motivo_fallo text, p_nota text, p_pago_monto numeric, p_pago_metodo text, p_pago_referencia text, p_foto_url text) TO service_role;
REVOKE ALL ON FUNCTION public.validar_email_autorizado() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validar_email_autorizado() TO service_role;
REVOKE ALL ON TABLE public.categorias FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categorias TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categorias TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categorias TO service_role;
REVOKE ALL ON TABLE public.chatbot_consentimientos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chatbot_consentimientos TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chatbot_consentimientos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chatbot_consentimientos TO service_role;
REVOKE ALL ON TABLE public.chatbot_sesiones FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chatbot_sesiones TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chatbot_sesiones TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chatbot_sesiones TO service_role;
REVOKE ALL ON TABLE public.chatbot_solicitudes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chatbot_solicitudes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chatbot_solicitudes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.chatbot_solicitudes TO service_role;
REVOKE ALL ON TABLE public.checkpoint_pagos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checkpoint_pagos TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checkpoint_pagos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checkpoint_pagos TO service_role;
REVOKE ALL ON TABLE public.checkpoints FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checkpoints TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checkpoints TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checkpoints TO service_role;
REVOKE ALL ON TABLE public.choferes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.choferes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.choferes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.choferes TO service_role;
REVOKE ALL ON TABLE public.clientes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.clientes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.clientes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.clientes TO service_role;
REVOKE ALL ON TABLE public.detalle_pedidos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.detalle_pedidos TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.detalle_pedidos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.detalle_pedidos TO service_role;
REVOKE ALL ON TABLE public.historial_precios FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.historial_precios TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.historial_precios TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.historial_precios TO service_role;
REVOKE ALL ON TABLE public.liquidaciones_ruta FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.liquidaciones_ruta TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.liquidaciones_ruta TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.liquidaciones_ruta TO service_role;
REVOKE ALL ON TABLE public.movimientos_inventario FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.movimientos_inventario TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.movimientos_inventario TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.movimientos_inventario TO service_role;
REVOKE ALL ON TABLE public.pagos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pagos TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pagos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pagos TO service_role;
REVOKE ALL ON TABLE public.parametros_sistema FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.parametros_sistema TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.parametros_sistema TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.parametros_sistema TO service_role;
REVOKE ALL ON TABLE public.pedidos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pedidos TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pedidos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pedidos TO service_role;
REVOKE ALL ON TABLE public.productos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.productos TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.productos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.productos TO service_role;
REVOKE ALL ON TABLE public.proveedores FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.proveedores TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.proveedores TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.proveedores TO service_role;
REVOKE ALL ON TABLE public.ruta_paradas FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ruta_paradas TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ruta_paradas TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ruta_paradas TO service_role;
REVOKE ALL ON TABLE public.rutas_diarias FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rutas_diarias TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rutas_diarias TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rutas_diarias TO service_role;
REVOKE ALL ON TABLE public.sucursales FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sucursales TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sucursales TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sucursales TO service_role;
REVOKE ALL ON TABLE public.usuarios FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.usuarios TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.usuarios TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.usuarios TO service_role;
REVOKE ALL ON TABLE public.vehiculos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vehiculos TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vehiculos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vehiculos TO service_role;
REVOKE ALL ON SEQUENCE public.categorias_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.categorias_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.categorias_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.categorias_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.chatbot_consentimientos_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.chatbot_consentimientos_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.chatbot_consentimientos_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.chatbot_consentimientos_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.chatbot_sesiones_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.chatbot_sesiones_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.chatbot_sesiones_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.chatbot_sesiones_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.chatbot_solicitudes_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.chatbot_solicitudes_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.chatbot_solicitudes_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.chatbot_solicitudes_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.checkpoint_pagos_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.checkpoint_pagos_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.checkpoint_pagos_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.checkpoint_pagos_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.checkpoints_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.checkpoints_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.checkpoints_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.checkpoints_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.choferes_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.choferes_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.choferes_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.choferes_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.clientes_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.clientes_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.clientes_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.clientes_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.detalle_pedidos_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.detalle_pedidos_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.detalle_pedidos_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.detalle_pedidos_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.historial_precios_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.historial_precios_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.historial_precios_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.historial_precios_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.liquidaciones_ruta_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.liquidaciones_ruta_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.liquidaciones_ruta_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.liquidaciones_ruta_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.movimientos_inventario_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.movimientos_inventario_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.movimientos_inventario_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.movimientos_inventario_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.pagos_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.pagos_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.pagos_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.pagos_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.pedidos_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.pedidos_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.pedidos_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.pedidos_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.productos_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.productos_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.productos_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.productos_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.proveedores_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.proveedores_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.proveedores_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.proveedores_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.ruta_paradas_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.ruta_paradas_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.ruta_paradas_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.ruta_paradas_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.rutas_diarias_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.rutas_diarias_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.rutas_diarias_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.rutas_diarias_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.sucursales_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.sucursales_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.sucursales_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.sucursales_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.vehiculos_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.vehiculos_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.vehiculos_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.vehiculos_id_seq TO service_role;
REVOKE ALL ON TABLE public.v_resumen_rutas FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_resumen_rutas TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_resumen_rutas TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_resumen_rutas TO service_role;

-- ─── Comentarios ────────────────────────────────────────────────────────────

COMMENT ON TABLE public.chatbot_consentimientos IS 'Registro de consentimiento de privacidad por cliente de WhatsApp (Ley 21.641)';
COMMENT ON COLUMN public.chatbot_consentimientos.telefono IS 'Número de teléfono del cliente (chatId de WhatsApp, formato: 56XXXXXXXXX@c.us)';
COMMENT ON TABLE public.chatbot_sesiones IS 'Historial de conversaciones del chatbot por cliente de WhatsApp';
COMMENT ON COLUMN public.chatbot_sesiones.telefono IS 'Número de teléfono del cliente (chatId de WhatsApp)';
COMMENT ON COLUMN public.chatbot_sesiones.rol IS 'user = mensaje del cliente, assistant = respuesta del bot';
COMMENT ON TABLE public.chatbot_solicitudes IS 'Solicitudes de pedido capturadas por el chatbot, pendientes de revisión por vendedor humano';
COMMENT ON COLUMN public.chatbot_solicitudes.productos_solicitados IS 'Descripción textual de lo que el cliente quiere comprar (ej: "20 paquetes de rosas Freedom")';
COMMENT ON COLUMN public.chatbot_solicitudes.estado IS 'pendiente = nuevo, contactado = vendedor llamó al cliente, confirmado/rechazado = resultado final';
COMMENT ON TABLE public.checkpoint_pagos IS 'Cobros registrados por el chofer en terreno. Desacoplados de pagos de oficina para auditoria independiente.';
COMMENT ON COLUMN public.checkpoint_pagos.foto_comprobante_url IS 'URL en Supabase Storage del comprobante fotografiado. Evidencia de pago.';
COMMENT ON TABLE public.checkpoints IS 'Eventos registrados por el chofer en terreno via PWA offline-first. timestamp_local = hora del dispositivo; created_at = hora de sync al servidor.';
COMMENT ON COLUMN public.checkpoints.accuracy_m IS 'Precision GPS en metros. >100m = coordenadas aproximadas, requiere foto de respaldo.';
COMMENT ON COLUMN public.checkpoints.timestamp_local IS 'Timestamp del dispositivo del chofer al registrar el evento. Preserva el orden cronologico real aunque la sync sea posterior.';
COMMENT ON COLUMN public.checkpoints.sincronizado IS 'Siempre true en BD. En IndexedDB del chofer es false hasta sincronizar.';
COMMENT ON TABLE public.choferes IS 'Perfil de chofer con datos operacionales. Separado de usuarios para no violar SRP. Vinculado a auth.users via usuario_id.';
COMMENT ON COLUMN public.choferes.vehiculo_default_id IS 'Vehiculo asignado por defecto. Puede sobreescribirse en cada ruta_diaria.';
COMMENT ON COLUMN public.choferes.turno_inicio IS 'Hora de inicio del turno laboral. NULL = usar parametros_sistema.turno_inicio_defecto.';
COMMENT ON COLUMN public.choferes.turno_fin IS 'Hora de fin del turno laboral. NULL = usar parametros_sistema.turno_fin_defecto.';
COMMENT ON COLUMN public.clientes.saldo_pendiente IS 'Saldo acumulado de cuentas por cobrar (actualizado via trigger)';
COMMENT ON COLUMN public.clientes.lat IS 'Latitud del punto de entrega (geocodificada). Requerida para el optimizador de rutas VRPTW.';
COMMENT ON COLUMN public.clientes.lng IS 'Longitud del punto de entrega (geocodificada). Requerida para el optimizador de rutas VRPTW.';
COMMENT ON COLUMN public.clientes.direccion_referencia IS 'Referencia adicional de dirección para el chofer (ej: "Frente al Banco Estado")';
COMMENT ON COLUMN public.clientes.ventana_inicio IS 'Hora mínima de recepción (NULL = sin restricción). Usada por el solver VRPTW.';
COMMENT ON COLUMN public.clientes.ventana_fin IS 'Hora máxima de recepción (NULL = sin restricción). Usada por el solver VRPTW.';
COMMENT ON COLUMN public.detalle_pedidos.costo_unitario IS 'Snapshot del costo al momento de la venta para cálculo de utilidad';
COMMENT ON COLUMN public.detalle_pedidos.subtotal IS 'cantidad × precio_unitario (columna generada automática)';
COMMENT ON TABLE public.liquidaciones_ruta IS 'Cierre post-ruta. Cruza datos planificados vs reales. IEL = indice de eficiencia logistica propio de esta tesis.';
COMMENT ON COLUMN public.liquidaciones_ruta.tiempo_muerto_min IS 'Minutos sin actividad registrada (entre checkpoints). Indicador de tiempos ociosos.';
COMMENT ON COLUMN public.liquidaciones_ruta.iel IS 'Indice de Eficiencia Logistica [0,1]. 1.0 = eficiencia perfecta. Metrica propia definida en esta tesis.';
COMMENT ON COLUMN public.movimientos_inventario.costo_total IS 'cantidad × costo_unitario (columna generada automática)';
COMMENT ON COLUMN public.movimientos_inventario.tipo IS 'entrada = ingreso de proveedor, salida = venta a cliente';
COMMENT ON TABLE public.parametros_sistema IS 'Parámetros operacionales globales editables desde /administracion. Patrón key-value tipado.';
COMMENT ON COLUMN public.parametros_sistema.tipo IS 'Gobierna el control de edición en la UI y la validación en la Server Action.';
COMMENT ON COLUMN public.pedidos.total IS 'Suma de subtotales de detalle_pedidos (actualizado via trigger)';
COMMENT ON COLUMN public.pedidos.total_pagado IS 'Suma de pagos recibidos (actualizado via trigger)';
COMMENT ON COLUMN public.pedidos.saldo IS 'total - total_pagado (columna generada automática)';
COMMENT ON COLUMN public.productos.varas_por_paquete IS 'Cantidad de varas/tallos que contiene cada paquete';
COMMENT ON COLUMN public.productos.stock_actual IS 'Stock en paquetes disponibles en cámara de frío';
COMMENT ON COLUMN public.productos.precio_venta_actual IS 'Precio de venta vigente por paquete (CLP)';
COMMENT ON COLUMN public.productos.volumen_unitario_m3 IS 'Volumen en m³ por unidad del producto. 0.001 m³ = 1 litro ≈ ramo estándar de flores. Usado por el solver VRPTW para restricciones de capacidad.';
COMMENT ON TABLE public.ruta_paradas IS 'Orden optimizado de entregas en una ruta. orden=1 es la primera parada. Ventanas horarias para VRPTW.';
COMMENT ON COLUMN public.ruta_paradas.km_acumulados IS 'Kilometros acumulados desde el deposito hasta esta parada segun el solver.';
COMMENT ON COLUMN public.ruta_paradas.volumen_parada_m3 IS 'Snapshot del volumen del pedido al momento de calcular la ruta. Inmutable para auditoría.';
COMMENT ON TABLE public.rutas_diarias IS 'Resultado del solver VROOM. Cada fila es una ruta planificada para un vehiculo en una fecha.';
COMMENT ON COLUMN public.rutas_diarias.geojson_ruta IS 'Polyline GeoJSON de la ruta planificada por ORS. Guardada para no recalcular.';
COMMENT ON COLUMN public.rutas_diarias.solver_costo IS 'Costo objetivo retornado por VROOM (suma de duraciones/distancias). Documenta calidad de la solucion.';
COMMENT ON TABLE public.sucursales IS 'Puntos de origen para el modelo Multi-Depot VRPTW. Peralillo es la sucursal principal.';
COMMENT ON VIEW public.v_resumen_rutas IS 'Vista desnormalizada para el dashboard de rutas. Evita N+1 queries al mostrar el listado. Incluye conteos, cobros e IEL.';
COMMENT ON TABLE public.vehiculos IS 'Flota de furgones. rendimiento_kml y capacidad_vol_m3 son las restricciones del solver VRPTW.';
COMMENT ON COLUMN public.vehiculos.rendimiento_kml IS 'Kilometros por litro de combustible.';
COMMENT ON COLUMN public.vehiculos.capacidad_vol_m3 IS 'Capacidad volumetrica en m3. Restriccion dura del solver VROOM.';
