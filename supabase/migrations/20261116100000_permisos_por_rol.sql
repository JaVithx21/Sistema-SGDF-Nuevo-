-- ═══════════════════════════════════════════════════════════════════════════
--  Permisos por rol en clientes, pedidos, detalle y pagos; funciones heredadas
--  sin acceso anónimo (DEF-09, DEF-10, DEF-11 · AC-SEC-01, AC-SEC-02)
--
--  Antes: SELECT USING (true) e INSERT/UPDATE con solo auth.uid() IS NOT NULL,
--  así que cualquier sesión (incluido el chofer) leía todo, insertaba pagos y
--  podía cambiar total_pagado por la API. Ahora solo el personal de oficina
--  (admin, gerente, jefe_operaciones, vendedor) opera estas tablas; el chofer
--  trabaja únicamente vía mi_ruta_hoy() / marcar_parada() (SECURITY DEFINER).
--
--  DELETE no cambia (private.es_admin()) y pagos UPDATE sigue siendo solo admin.
--  Idempotente: se puede aplicar más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS private;

-- ─── Helper de rol de oficina ───────────────────────────────────────────────
-- No usa private.get_user_role(): esa devuelve 'vendedor' cuando el usuario no
-- tiene fila en usuarios. obtener_rol_usuario() devuelve NULL en ese caso y
-- coalesce lo convierte en false (fail-closed).
CREATE OR REPLACE FUNCTION private.es_personal_oficina()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce(
        (SELECT private.obtener_rol_usuario()) IN ('admin', 'gerente', 'jefe_operaciones', 'vendedor'),
        false
    );
$$;

REVOKE ALL ON FUNCTION private.es_personal_oficina() FROM public, anon;
GRANT EXECUTE ON FUNCTION private.es_personal_oficina() TO authenticated;

-- ─── clientes ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS clientes_select ON public.clientes;
CREATE POLICY clientes_select ON public.clientes FOR SELECT TO authenticated
    USING ((SELECT private.es_personal_oficina()));

DROP POLICY IF EXISTS clientes_insert ON public.clientes;
CREATE POLICY clientes_insert ON public.clientes FOR INSERT TO authenticated
    WITH CHECK ((SELECT private.es_personal_oficina()));

DROP POLICY IF EXISTS clientes_update ON public.clientes;
CREATE POLICY clientes_update ON public.clientes FOR UPDATE TO authenticated
    USING ((SELECT private.es_personal_oficina()))
    WITH CHECK ((SELECT private.es_personal_oficina()));

-- ─── pedidos ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS pedidos_select ON public.pedidos;
CREATE POLICY pedidos_select ON public.pedidos FOR SELECT TO authenticated
    USING ((SELECT private.es_personal_oficina()));

DROP POLICY IF EXISTS pedidos_insert ON public.pedidos;
CREATE POLICY pedidos_insert ON public.pedidos FOR INSERT TO authenticated
    WITH CHECK ((SELECT private.es_personal_oficina()));

DROP POLICY IF EXISTS pedidos_update ON public.pedidos;
CREATE POLICY pedidos_update ON public.pedidos FOR UPDATE TO authenticated
    USING ((SELECT private.es_personal_oficina()))
    WITH CHECK ((SELECT private.es_personal_oficina()));

-- ─── detalle_pedidos ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS detalle_pedidos_select ON public.detalle_pedidos;
CREATE POLICY detalle_pedidos_select ON public.detalle_pedidos FOR SELECT TO authenticated
    USING ((SELECT private.es_personal_oficina()));

DROP POLICY IF EXISTS detalle_pedidos_insert ON public.detalle_pedidos;
CREATE POLICY detalle_pedidos_insert ON public.detalle_pedidos FOR INSERT TO authenticated
    WITH CHECK ((SELECT private.es_personal_oficina()));

DROP POLICY IF EXISTS detalle_pedidos_update ON public.detalle_pedidos;
CREATE POLICY detalle_pedidos_update ON public.detalle_pedidos FOR UPDATE TO authenticated
    USING ((SELECT private.es_personal_oficina()))
    WITH CHECK ((SELECT private.es_personal_oficina()));

-- ─── pagos ──────────────────────────────────────────────────────────────────
-- UPDATE (pagos_update) y DELETE quedan solo para admin, como estaban.

DROP POLICY IF EXISTS pagos_select ON public.pagos;
CREATE POLICY pagos_select ON public.pagos FOR SELECT TO authenticated
    USING ((SELECT private.es_personal_oficina()));

DROP POLICY IF EXISTS pagos_insert ON public.pagos;
CREATE POLICY pagos_insert ON public.pagos FOR INSERT TO authenticated
    WITH CHECK ((SELECT private.es_personal_oficina()));

-- ─── Funciones heredadas (DEF-09, DEF-11) ───────────────────────────────────
-- La app no las llama (no hay .rpc a ellas en src/). liquidar_ruta se vuelve a
-- habilitar con control de rol en el Incremento 3 (PBI-14).

REVOKE EXECUTE ON FUNCTION public.liquidar_ruta(bigint, numeric, numeric, numeric, text)
    FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_checkpoint(bigint, text, numeric, numeric, numeric, timestamptz, text, text, numeric, text, text, text)
    FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calcular_iel(numeric, numeric, integer, integer, integer, integer)
    FROM public, anon;
