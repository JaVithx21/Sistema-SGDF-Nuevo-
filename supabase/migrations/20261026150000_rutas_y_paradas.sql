-- ═══════════════════════════════════════════════════════════════════════════
--  Rutas de entrega: estado de parada, unicidad y RLS (PBI-03, DEF-07)
--
--  El modelo de rutas YA existe en la BD (ver supabase/esquema_referencia.sql):
--    rutas_diarias  ← una ruta por vehículo/chofer y fecha
--    ruta_paradas   ← paradas ordenadas de cada ruta
--  checkpoints y liquidaciones_ruta cuelgan de ellas, por eso se extienden en
--  vez de crear tablas paralelas. Equivalencias con la especificación:
--    rutas.distancia_m        → rutas_diarias.km_planificados (km)
--    rutas.geometria          → rutas_diarias.geojson_ruta
--    rutas.combustible_l      → rutas_diarias.bencina_proyectada_lts
--    rutas.costo_proyectado   → rutas_diarias.costo_bencina_proyectado
--    rutas.precio_litro_ref   → rutas_diarias.precio_litro_referencia
--    rutas.created_by         → rutas_diarias.creado_por
--
--  Escrita de forma defensiva (IF NOT EXISTS / constraints condicionales) para
--  poder aplicarse sobre la BD actual sin conocer cada detalle del esquema.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── rutas_diarias ──────────────────────────────────────────────────────────

ALTER TABLE public.rutas_diarias
    ADD COLUMN IF NOT EXISTS duracion_s integer,
    ADD COLUMN IF NOT EXISTS simulada boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS advertencias text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.rutas_diarias'::regclass AND conname = 'rutas_duracion_no_negativa') THEN
        ALTER TABLE public.rutas_diarias
            ADD CONSTRAINT rutas_duracion_no_negativa CHECK (duracion_s IS NULL OR duracion_s >= 0);
    END IF;

    -- Una ruta simulada (sin OpenRouteService) no tiene geometría real que dibujar
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.rutas_diarias'::regclass AND conname = 'rutas_simulada_sin_geometria') THEN
        ALTER TABLE public.rutas_diarias
            ADD CONSTRAINT rutas_simulada_sin_geometria CHECK (NOT simulada OR geojson_ruta IS NULL);
    END IF;

    -- RSK-04: un vehículo y un chofer tienen a lo más una ruta por día.
    -- UNIQUE no admite NOT VALID: si ya hay duplicados, la migración falla y
    -- hay que resolverlos a mano antes de reintentar.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.rutas_diarias'::regclass AND conname = 'rutas_vehiculo_fecha_key') THEN
        ALTER TABLE public.rutas_diarias
            ADD CONSTRAINT rutas_vehiculo_fecha_key UNIQUE (vehiculo_id, fecha);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.rutas_diarias'::regclass AND conname = 'rutas_chofer_fecha_key') THEN
        ALTER TABLE public.rutas_diarias
            ADD CONSTRAINT rutas_chofer_fecha_key UNIQUE (chofer_id, fecha);
    END IF;
END $$;

-- ─── ruta_paradas ───────────────────────────────────────────────────────────

ALTER TABLE public.ruta_paradas
    ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente',
    ADD COLUMN IF NOT EXISTS motivo_fallo text,
    ADD COLUMN IF NOT EXISTS entregado_at timestamptz;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ruta_paradas'::regclass AND conname = 'paradas_estado_valido') THEN
        ALTER TABLE public.ruta_paradas
            ADD CONSTRAINT paradas_estado_valido CHECK (estado IN ('pendiente', 'entregado', 'fallido'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ruta_paradas'::regclass AND conname = 'paradas_motivo_largo') THEN
        ALTER TABLE public.ruta_paradas
            ADD CONSTRAINT paradas_motivo_largo CHECK (char_length(motivo_fallo) <= 200);
    END IF;

    -- AC-03-error: un fallo sin motivo no se puede guardar ni por la API ni por SQL
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ruta_paradas'::regclass AND conname = 'paradas_fallo_con_motivo') THEN
        ALTER TABLE public.ruta_paradas
            ADD CONSTRAINT paradas_fallo_con_motivo CHECK (estado <> 'fallido' OR length(trim(motivo_fallo)) > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ruta_paradas'::regclass AND conname = 'paradas_ruta_orden_key') THEN
        ALTER TABLE public.ruta_paradas
            ADD CONSTRAINT paradas_ruta_orden_key UNIQUE (ruta_id, orden);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ruta_paradas'::regclass AND conname = 'paradas_ruta_pedido_key') THEN
        ALTER TABLE public.ruta_paradas
            ADD CONSTRAINT paradas_ruta_pedido_key UNIQUE (ruta_id, pedido_id);
    END IF;
END $$;

-- Borrar una ruta borra sus paradas. Si alguna parada ya tiene checkpoints,
-- la FK de checkpoints (sin cascade) impide el borrado y protege el historial.
ALTER TABLE public.ruta_paradas DROP CONSTRAINT IF EXISTS ruta_paradas_ruta_id_fkey;
ALTER TABLE public.ruta_paradas
    ADD CONSTRAINT ruta_paradas_ruta_id_fkey
    FOREIGN KEY (ruta_id) REFERENCES public.rutas_diarias(id) ON DELETE CASCADE;

-- ─── Columnas para el planificador ──────────────────────────────────────────

-- volumen_unitario_m3 ya existe (NOT NULL, CHECK > 0); el IF NOT EXISTS lo deja intacto.
ALTER TABLE public.productos
    ADD COLUMN IF NOT EXISTS volumen_unitario_m3 numeric CHECK (volumen_unitario_m3 >= 0),
    ADD COLUMN IF NOT EXISTS peso_unitario_kg numeric CHECK (peso_unitario_kg >= 0);

-- lat/lng ya existen en sucursales (numeric NOT NULL con rango); no se cambian de tipo.
ALTER TABLE public.sucursales
    ADD COLUMN IF NOT EXISTS lat double precision,
    ADD COLUMN IF NOT EXISTS lng double precision;

-- clientes: NOT VALID porque puede haber filas antiguas que no cumplan; las
-- filas nuevas y las que se editen sí se validan. Revisar las antiguas con:
--   SELECT id FROM clientes WHERE (lat IS NULL) <> (lng IS NULL)
--      OR (ventana_inicio IS NULL) <> (ventana_fin IS NULL)
--      OR ventana_inicio >= ventana_fin;
-- y luego: ALTER TABLE clientes VALIDATE CONSTRAINT <nombre>;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.clientes'::regclass AND conname = 'chk_clientes_coordenadas_completas') THEN
        ALTER TABLE public.clientes
            ADD CONSTRAINT chk_clientes_coordenadas_completas CHECK ((lat IS NULL) = (lng IS NULL)) NOT VALID;
    END IF;

    -- Mismo nombre y regla que valida src/app/(dashboard)/clientes/actions.ts:
    -- ventana completa (o ninguna) y con inicio antes que el término.
    -- Si la BD ya la tiene con ese nombre, se respeta la existente.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.clientes'::regclass AND conname = 'chk_clientes_ventana_valida') THEN
        ALTER TABLE public.clientes
            ADD CONSTRAINT chk_clientes_ventana_valida CHECK (
                (ventana_inicio IS NULL) = (ventana_fin IS NULL)
                AND (ventana_inicio IS NULL OR ventana_inicio < ventana_fin)
            ) NOT VALID;
    END IF;
END $$;

-- ─── Parámetros del planificador ────────────────────────────────────────────
-- Claves que lee src/lib/parametros.ts; los valores son los mismos de su FALLBACK.

INSERT INTO public.parametros_sistema (clave, valor, descripcion, tipo) VALUES
    ('precio_litro_diesel_clp', '1050', 'Precio de referencia del litro de diésel (CLP) para proyectar el costo de cada ruta.', 'numero'),
    ('turno_inicio_defecto', '07:00', 'Hora de inicio del turno cuando el chofer no tiene uno propio.', 'hora'),
    ('turno_fin_defecto', '18:00', 'Hora de término del turno cuando el chofer no tiene uno propio.', 'hora')
ON CONFLICT (clave) DO NOTHING;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Solo admin, gerente y jefe_operaciones operan rutas y paradas. El chofer NO
-- tiene política directa: lee y escribe solo vía mi_ruta_hoy() / marcar_parada()
-- (SECURITY DEFINER, ver la migración siguiente).

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

-- SECURITY DEFINER para no depender del RLS de usuarios dentro de la política.
-- Funciona igual si usuarios.rol es ENUM user_role o text (RSK-10).
CREATE OR REPLACE FUNCTION private.puede_gestionar_rutas()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.usuarios
        WHERE id = auth.uid()
          AND rol::text IN ('admin', 'gerente', 'jefe_operaciones')
    );
$$;

REVOKE ALL ON FUNCTION private.puede_gestionar_rutas() FROM public, anon;
GRANT EXECUTE ON FUNCTION private.puede_gestionar_rutas() TO authenticated;

ALTER TABLE public.rutas_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ruta_paradas ENABLE ROW LEVEL SECURITY;

-- Políticas anteriores: daban SELECT a vendedor, al chofer sobre su ruta del
-- día (con CURRENT_DATE en UTC) y SELECT a todo autenticado sobre las paradas.
DROP POLICY IF EXISTS rutas_select_optimizado ON public.rutas_diarias;
DROP POLICY IF EXISTS rutas_modify_jefe_optimizado ON public.rutas_diarias;
DROP POLICY IF EXISTS paradas_select_autenticados ON public.ruta_paradas;
DROP POLICY IF EXISTS paradas_modify_opt ON public.ruta_paradas;

DROP POLICY IF EXISTS rutas_select_gestion ON public.rutas_diarias;
DROP POLICY IF EXISTS rutas_insert_gestion ON public.rutas_diarias;
DROP POLICY IF EXISTS rutas_update_gestion ON public.rutas_diarias;
DROP POLICY IF EXISTS rutas_delete_gestion ON public.rutas_diarias;

CREATE POLICY rutas_select_gestion ON public.rutas_diarias
    FOR SELECT TO authenticated
    USING ((SELECT private.puede_gestionar_rutas()));
CREATE POLICY rutas_insert_gestion ON public.rutas_diarias
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT private.puede_gestionar_rutas()));
CREATE POLICY rutas_update_gestion ON public.rutas_diarias
    FOR UPDATE TO authenticated
    USING ((SELECT private.puede_gestionar_rutas()))
    WITH CHECK ((SELECT private.puede_gestionar_rutas()));
CREATE POLICY rutas_delete_gestion ON public.rutas_diarias
    FOR DELETE TO authenticated
    USING ((SELECT private.puede_gestionar_rutas()));

DROP POLICY IF EXISTS paradas_select_gestion ON public.ruta_paradas;
DROP POLICY IF EXISTS paradas_insert_gestion ON public.ruta_paradas;
DROP POLICY IF EXISTS paradas_update_gestion ON public.ruta_paradas;
DROP POLICY IF EXISTS paradas_delete_gestion ON public.ruta_paradas;

CREATE POLICY paradas_select_gestion ON public.ruta_paradas
    FOR SELECT TO authenticated
    USING ((SELECT private.puede_gestionar_rutas()));
CREATE POLICY paradas_insert_gestion ON public.ruta_paradas
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT private.puede_gestionar_rutas()));
CREATE POLICY paradas_update_gestion ON public.ruta_paradas
    FOR UPDATE TO authenticated
    USING ((SELECT private.puede_gestionar_rutas()))
    WITH CHECK ((SELECT private.puede_gestionar_rutas()));
CREATE POLICY paradas_delete_gestion ON public.ruta_paradas
    FOR DELETE TO authenticated
    USING ((SELECT private.puede_gestionar_rutas()));
