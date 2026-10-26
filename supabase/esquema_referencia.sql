-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text UNIQUE,
  nombre text NOT NULL,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  rol USER-DEFINED NOT NULL DEFAULT 'vendedor'::user_role,
  CONSTRAINT usuarios_pkey PRIMARY KEY (id)
);
CREATE TABLE public.categorias (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre text NOT NULL UNIQUE,
  descripcion text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT categorias_pkey PRIMARY KEY (id)
);
CREATE TABLE public.proveedores (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre text NOT NULL,
  rut text UNIQUE,
  telefono text,
  email text,
  direccion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT proveedores_pkey PRIMARY KEY (id)
);
CREATE TABLE public.productos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  categoria_id bigint,
  varas_por_paquete integer NOT NULL DEFAULT 1 CHECK (varas_por_paquete > 0),
  stock_actual integer NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo integer NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  precio_venta_actual numeric NOT NULL DEFAULT 0 CHECK (precio_venta_actual >= 0::numeric),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  paquetes_por_caja integer NOT NULL DEFAULT 1,
  maneja_cajas boolean DEFAULT false,
  volumen_unitario_m3 numeric NOT NULL DEFAULT 0.00100 CHECK (volumen_unitario_m3 > 0::numeric),
  CONSTRAINT productos_pkey PRIMARY KEY (id),
  CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id)
);
CREATE TABLE public.historial_precios (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  producto_id bigint NOT NULL,
  precio_anterior numeric NOT NULL,
  precio_nuevo numeric NOT NULL,
  modificado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT historial_precios_pkey PRIMARY KEY (id),
  CONSTRAINT historial_precios_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id),
  CONSTRAINT historial_precios_modificado_por_fkey FOREIGN KEY (modificado_por) REFERENCES public.usuarios(id)
);
CREATE TABLE public.clientes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  razon_social text NOT NULL,
  rut text UNIQUE,
  nombre_contacto text,
  telefono text,
  email text,
  direccion text,
  saldo_pendiente numeric NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  lat numeric DEFAULT NULL::numeric,
  lng numeric DEFAULT NULL::numeric,
  direccion_referencia text,
  ventana_inicio time without time zone,
  ventana_fin time without time zone,
  CONSTRAINT clientes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.pedidos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  cliente_id bigint NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'::text CHECK (estado = ANY (ARRAY['pendiente'::text, 'entregado'::text, 'anulado'::text])),
  total numeric NOT NULL DEFAULT 0 CHECK (total >= 0::numeric),
  total_pagado numeric NOT NULL DEFAULT 0 CHECK (total_pagado >= 0::numeric),
  saldo numeric DEFAULT (total - total_pagado),
  nota text,
  creado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pedidos_pkey PRIMARY KEY (id),
  CONSTRAINT pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
  CONSTRAINT pedidos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id)
);
CREATE TABLE public.detalle_pedidos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  pedido_id bigint NOT NULL,
  producto_id bigint NOT NULL,
  cantidad integer NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric NOT NULL CHECK (precio_unitario >= 0::numeric),
  costo_unitario numeric NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0::numeric),
  subtotal numeric DEFAULT ((cantidad)::numeric * precio_unitario),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT detalle_pedidos_pkey PRIMARY KEY (id),
  CONSTRAINT detalle_pedidos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id),
  CONSTRAINT detalle_pedidos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id)
);
CREATE TABLE public.movimientos_inventario (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  producto_id bigint NOT NULL,
  proveedor_id bigint,
  cantidad integer NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0::numeric),
  costo_total numeric DEFAULT ((cantidad)::numeric * costo_unitario),
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['entrada'::text, 'salida'::text])),
  nota text,
  pedido_id bigint,
  creado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id),
  CONSTRAINT movimientos_inventario_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id),
  CONSTRAINT movimientos_inventario_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id),
  CONSTRAINT movimientos_inventario_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id),
  CONSTRAINT movimientos_inventario_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id)
);
CREATE TABLE public.pagos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  pedido_id bigint NOT NULL,
  cliente_id bigint NOT NULL,
  monto numeric NOT NULL CHECK (monto > 0::numeric),
  metodo_pago text NOT NULL DEFAULT 'efectivo'::text CHECK (metodo_pago = ANY (ARRAY['efectivo'::text, 'transferencia'::text, 'cheque'::text, 'otro'::text])),
  referencia text,
  nota text,
  creado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pagos_pkey PRIMARY KEY (id),
  CONSTRAINT pagos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id),
  CONSTRAINT pagos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
  CONSTRAINT pagos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id)
);
CREATE TABLE public.chatbot_consentimientos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  telefono text NOT NULL UNIQUE,
  aceptado boolean NOT NULL DEFAULT false,
  fecha_aceptacion timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_consentimientos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chatbot_sesiones (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  telefono text NOT NULL,
  rol text NOT NULL CHECK (rol = ANY (ARRAY['user'::text, 'assistant'::text])),
  mensaje text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  push_name text,
  CONSTRAINT chatbot_sesiones_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chatbot_solicitudes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  telefono text NOT NULL,
  nombre_cliente text,
  productos_solicitados text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'::text CHECK (estado = ANY (ARRAY['pendiente'::text, 'contactado'::text, 'confirmado'::text, 'rechazado'::text])),
  nota_vendedor text,
  atendido_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_solicitudes_pkey PRIMARY KEY (id),
  CONSTRAINT chatbot_solicitudes_atendido_por_fkey FOREIGN KEY (atendido_por) REFERENCES public.usuarios(id)
);
CREATE TABLE public.sucursales (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre text NOT NULL,
  direccion text NOT NULL,
  lat numeric NOT NULL CHECK (lat >= '-90'::integer::numeric AND lat <= 90::numeric),
  lng numeric NOT NULL CHECK (lng >= '-180'::integer::numeric AND lng <= 180::numeric),
  es_deposito boolean NOT NULL DEFAULT true,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sucursales_pkey PRIMARY KEY (id)
);
CREATE TABLE public.vehiculos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  patente text NOT NULL UNIQUE,
  modelo text,
  anno smallint,
  rendimiento_kml numeric NOT NULL CHECK (rendimiento_kml > 0::numeric),
  capacidad_vol_m3 numeric NOT NULL CHECK (capacidad_vol_m3 > 0::numeric),
  capacidad_peso_kg numeric,
  sucursal_id bigint,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vehiculos_pkey PRIMARY KEY (id),
  CONSTRAINT vehiculos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES public.sucursales(id)
);
CREATE TABLE public.choferes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  usuario_id uuid NOT NULL UNIQUE,
  nombre_completo text NOT NULL,
  rut text,
  licencia_clase text,
  telefono text,
  vehiculo_default_id bigint,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  turno_inicio time without time zone,
  turno_fin time without time zone,
  CONSTRAINT choferes_pkey PRIMARY KEY (id),
  CONSTRAINT choferes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id),
  CONSTRAINT choferes_vehiculo_default_id_fkey FOREIGN KEY (vehiculo_default_id) REFERENCES public.vehiculos(id)
);
CREATE TABLE public.rutas_diarias (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  fecha date NOT NULL,
  sucursal_id bigint NOT NULL,
  vehiculo_id bigint NOT NULL,
  chofer_id bigint NOT NULL,
  estado text NOT NULL DEFAULT 'planificada'::text CHECK (estado = ANY (ARRAY['planificada'::text, 'en_curso'::text, 'completada'::text, 'cancelada'::text])),
  km_planificados numeric,
  bencina_proyectada_lts numeric,
  costo_bencina_proyectado numeric,
  precio_litro_referencia numeric,
  volumen_total_m3 numeric,
  geojson_ruta jsonb,
  solver_costo numeric,
  creado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rutas_diarias_pkey PRIMARY KEY (id),
  CONSTRAINT rutas_diarias_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES public.sucursales(id),
  CONSTRAINT rutas_diarias_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(id),
  CONSTRAINT rutas_diarias_chofer_id_fkey FOREIGN KEY (chofer_id) REFERENCES public.choferes(id),
  CONSTRAINT rutas_diarias_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id)
);
CREATE TABLE public.ruta_paradas (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  ruta_id bigint NOT NULL,
  pedido_id bigint NOT NULL,
  orden smallint NOT NULL CHECK (orden > 0),
  lat_destino numeric,
  lng_destino numeric,
  ventana_inicio time without time zone,
  ventana_fin time without time zone,
  km_acumulados numeric,
  duracion_estimada_min smallint,
  volumen_parada_m3 numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ruta_paradas_pkey PRIMARY KEY (id),
  CONSTRAINT ruta_paradas_ruta_id_fkey FOREIGN KEY (ruta_id) REFERENCES public.rutas_diarias(id),
  CONSTRAINT ruta_paradas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id)
);
CREATE TABLE public.checkpoints (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  parada_id bigint NOT NULL,
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['entregado'::text, 'fallido'::text, 'parcial'::text, 'inicio_ruta'::text, 'fin_ruta'::text])),
  lat numeric,
  lng numeric,
  accuracy_m numeric CHECK (accuracy_m IS NULL OR accuracy_m >= 0::numeric),
  timestamp_local timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  motivo_fallo text,
  nota text,
  sincronizado boolean NOT NULL DEFAULT true,
  CONSTRAINT checkpoints_pkey PRIMARY KEY (id),
  CONSTRAINT checkpoints_parada_id_fkey FOREIGN KEY (parada_id) REFERENCES public.ruta_paradas(id)
);
CREATE TABLE public.checkpoint_pagos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  checkpoint_id bigint NOT NULL UNIQUE,
  monto numeric NOT NULL CHECK (monto > 0::numeric),
  metodo_pago text NOT NULL CHECK (metodo_pago = ANY (ARRAY['efectivo'::text, 'transferencia'::text])),
  referencia text,
  foto_comprobante_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT checkpoint_pagos_pkey PRIMARY KEY (id),
  CONSTRAINT checkpoint_pagos_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES public.checkpoints(id)
);
CREATE TABLE public.liquidaciones_ruta (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  ruta_id bigint NOT NULL UNIQUE,
  km_reales numeric,
  bencina_real_lts numeric,
  precio_litro_real numeric,
  costo_bencina_real numeric,
  total_cobrado_efectivo numeric NOT NULL DEFAULT 0,
  total_cobrado_transferencia numeric NOT NULL DEFAULT 0,
  paradas_exitosas smallint NOT NULL DEFAULT 0,
  paradas_fallidas smallint NOT NULL DEFAULT 0,
  paradas_parciales smallint NOT NULL DEFAULT 0,
  hora_inicio timestamp with time zone,
  hora_fin timestamp with time zone,
  tiempo_total_min smallint,
  tiempo_muerto_min smallint,
  iel numeric CHECK (iel IS NULL OR iel >= 0::numeric AND iel <= 1::numeric),
  iel_km numeric,
  iel_entregas numeric,
  iel_tiempo numeric,
  nota_cierre text,
  cerrado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT liquidaciones_ruta_pkey PRIMARY KEY (id),
  CONSTRAINT liquidaciones_ruta_ruta_id_fkey FOREIGN KEY (ruta_id) REFERENCES public.rutas_diarias(id),
  CONSTRAINT liquidaciones_ruta_cerrado_por_fkey FOREIGN KEY (cerrado_por) REFERENCES auth.users(id)
);
CREATE TABLE public.parametros_sistema (
  clave text NOT NULL,
  valor text NOT NULL,
  descripcion text,
  tipo text NOT NULL DEFAULT 'texto'::text CHECK (tipo = ANY (ARRAY['numero'::text, 'texto'::text, 'booleano'::text, 'hora'::text])),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT parametros_sistema_pkey PRIMARY KEY (clave)
);