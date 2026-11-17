-- ═══════════════════════════════════════════════════════════════════════════
--  Cobro en terreno junto con la entrega (ADR-03 · PBI-11.1 · DEF-11)
--
--  El cobro se registra en la MISMA transacción que la entrega, dentro de
--  marcar_parada(), insertando en `pagos`:
--    - pagos es la fuente única del saldo: trg_pagos_recalcular_total_pagado
--      actualiza pedidos.total_pagado (y con eso saldo y el saldo del cliente).
--    - pagos.parada_id UNIQUE: como máximo un cobro por parada (sin doble cobro).
--    - El chofer ve solo monto_por_cobrar de ese pedido en mi_ruta_hoy();
--      sigue sin RUT, total, saldo del cliente ni crédito.
--
--  La app actual sigue funcionando: llama marcar_parada con p_parada_id,
--  p_estado y p_motivo, y los parámetros nuevos tienen DEFAULT.
--  Idempotente: se puede aplicar más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Vínculo del pago con la parada ─────────────────────────────────────────
-- ON DELETE RESTRICT: una parada con cobro no se puede borrar (ni por la cascada
-- de su ruta) sin antes resolver el pago.

ALTER TABLE public.pagos
    ADD COLUMN IF NOT EXISTS parada_id bigint REFERENCES public.ruta_paradas(id) ON DELETE RESTRICT;

DO $$
BEGIN
    -- UNIQUE admite varios NULL (pagos de oficina) y a lo más un pago por parada
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.pagos'::regclass AND conname = 'uq_pago_parada') THEN
        ALTER TABLE public.pagos ADD CONSTRAINT uq_pago_parada UNIQUE (parada_id);
    END IF;
END $$;

-- ─── mi_ruta_hoy(): 17 columnas (+ monto_por_cobrar) ────────────────────────
-- DROP previo: CREATE OR REPLACE no puede cambiar el tipo de retorno.
DROP FUNCTION IF EXISTS public.mi_ruta_hoy();

CREATE FUNCTION public.mi_ruta_hoy()
RETURNS TABLE (
    parada_id        bigint,
    ruta_id          bigint,
    fecha            date,
    vehiculo_patente text,
    orden            integer,
    estado           text,
    motivo_fallo     text,
    entregado_at     timestamptz,
    razon_social     text,
    nombre_contacto  text,
    telefono         text,
    direccion        text,
    lat              double precision,
    lng              double precision,
    ventana_inicio   time,
    ventana_fin      time,
    monto_por_cobrar numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        rp.id,
        rd.id,
        rd.fecha,
        v.patente,
        rp.orden::integer,
        rp.estado,
        rp.motivo_fallo,
        rp.entregado_at,
        c.razon_social,
        c.nombre_contacto,
        c.telefono,
        c.direccion,
        -- El destino fijado al planificar manda; si falta, el del cliente.
        -- Se toma el par completo para no mezclar lat de uno con lng del otro.
        (CASE WHEN rp.lat_destino IS NOT NULL AND rp.lng_destino IS NOT NULL
              THEN rp.lat_destino ELSE c.lat END)::double precision,
        (CASE WHEN rp.lat_destino IS NOT NULL AND rp.lng_destino IS NOT NULL
              THEN rp.lng_destino ELSE c.lng END)::double precision,
        CASE WHEN rp.ventana_inicio IS NOT NULL OR rp.ventana_fin IS NOT NULL
             THEN rp.ventana_inicio ELSE c.ventana_inicio END,
        CASE WHEN rp.ventana_inicio IS NOT NULL OR rp.ventana_fin IS NOT NULL
             THEN rp.ventana_fin ELSE c.ventana_fin END,
        -- ADR-03: solo lo que queda por cobrar de ESTE pedido
        GREATEST(p.saldo, 0)
    FROM rutas_diarias rd
    JOIN choferes ch     ON ch.id = rd.chofer_id
    JOIN ruta_paradas rp ON rp.ruta_id = rd.id
    JOIN pedidos p       ON p.id = rp.pedido_id
    JOIN clientes c      ON c.id = p.cliente_id
    LEFT JOIN vehiculos v ON v.id = rd.vehiculo_id
    WHERE ch.usuario_id = auth.uid()
      -- "Hoy" en Chile, no en UTC: entre 21:00 y 24:00 CURRENT_DATE ya es mañana
      AND rd.fecha = (now() AT TIME ZONE 'America/Santiago')::date
      AND rd.estado <> 'cancelada'
    ORDER BY rp.orden;
$$;

-- ─── marcar_parada(): entrega + cobro en una transacción ────────────────────
-- DROP obligatorio de la versión de 3 parámetros: si quedan dos, la llamada
-- por la API con (p_parada_id, p_estado, p_motivo) es ambigua.
DROP FUNCTION IF EXISTS public.marcar_parada(bigint, text, text);

CREATE OR REPLACE FUNCTION public.marcar_parada(
    p_parada_id  bigint,
    p_estado     text,
    p_motivo     text    DEFAULT NULL,
    p_monto      numeric DEFAULT NULL,
    p_metodo     text    DEFAULT NULL,
    p_referencia text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_estado_actual text;
    v_estado_ruta   text;
    v_pedido_id     bigint;
    v_cliente_id    bigint;
    v_saldo         numeric;
    v_motivo        text := NULLIF(btrim(p_motivo), '');
    v_referencia    text := NULLIF(btrim(p_referencia), '');
BEGIN
    -- Pertenencia primero: a una parada ajena o inexistente se responde igual,
    -- sin revelar si existe. FOR UPDATE evita que dos envíos la marquen a la vez.
    SELECT rp.estado, rd.estado, rp.pedido_id
      INTO v_estado_actual, v_estado_ruta, v_pedido_id
      FROM ruta_paradas rp
      JOIN rutas_diarias rd ON rd.id = rp.ruta_id
      JOIN choferes ch      ON ch.id = rd.chofer_id
     WHERE rp.id = p_parada_id
       AND ch.usuario_id = auth.uid()
       FOR UPDATE OF rp;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La parada no existe o no pertenece a tu ruta.'
            USING ERRCODE = '42501';
    END IF;

    IF p_estado IS NULL OR p_estado NOT IN ('entregado', 'fallido') THEN
        RAISE EXCEPTION 'Estado no válido: debe ser entregado o fallido.';
    END IF;

    IF v_estado_ruta = 'cancelada' THEN
        RAISE EXCEPTION 'La ruta fue cancelada; no se pueden marcar sus paradas.';
    END IF;

    -- Antes que las validaciones del cobro: un doble envío responde "ya fue
    -- marcada" y no "supera el saldo" (AC-COB-04, RNF-CONF-02).
    IF v_estado_actual <> 'pendiente' THEN
        RAISE EXCEPTION 'Esta parada ya fue marcada como %; no se puede cambiar.',
            CASE v_estado_actual WHEN 'entregado' THEN 'entregada' ELSE 'no entregada' END;
    END IF;

    IF p_estado = 'fallido' THEN
        IF p_monto IS NOT NULL THEN
            RAISE EXCEPTION 'Una entrega fallida no registra cobro.';
        END IF;
        IF v_motivo IS NULL THEN
            RAISE EXCEPTION 'Indica el motivo por el que no se pudo entregar.';
        END IF;
        IF char_length(v_motivo) > 200 THEN
            RAISE EXCEPTION 'El motivo no puede superar 200 caracteres.';
        END IF;
    END IF;

    IF p_monto IS NOT NULL THEN
        IF p_monto <= 0 THEN
            RAISE EXCEPTION 'El monto debe ser mayor que 0.';
        END IF;
        IF p_metodo IS NULL OR p_metodo NOT IN ('efectivo', 'transferencia') THEN
            RAISE EXCEPTION 'Método de pago no válido.';
        END IF;
        IF p_metodo = 'transferencia' AND v_referencia IS NULL THEN
            RAISE EXCEPTION 'Indica la referencia de la transferencia.';
        END IF;
        IF char_length(v_referencia) > 100 THEN
            RAISE EXCEPTION 'La referencia no puede superar 100 caracteres.';
        END IF;

        -- FOR UPDATE: un pago de oficina simultáneo no puede dejar el saldo negativo
        SELECT p.saldo, p.cliente_id
          INTO v_saldo, v_cliente_id
          FROM pedidos p
         WHERE p.id = v_pedido_id
           FOR UPDATE;

        IF p_monto > v_saldo THEN
            RAISE EXCEPTION 'El monto supera el saldo por cobrar ($%).',
                replace(to_char(GREATEST(v_saldo, 0), 'FM999,999,999,990'), ',', '.');
        END IF;
    END IF;

    UPDATE ruta_paradas
       SET estado       = p_estado,
           motivo_fallo = CASE WHEN p_estado = 'fallido' THEN v_motivo END,
           entregado_at = now()
     WHERE id = p_parada_id;

    -- Misma transacción: si este INSERT falla, la parada vuelve a pendiente
    -- (AC-COB-06). uq_pago_parada es la última barrera contra el doble cobro.
    IF p_monto IS NOT NULL THEN
        INSERT INTO pagos (pedido_id, cliente_id, monto, metodo_pago, referencia, nota, creado_por, parada_id)
        VALUES (v_pedido_id, v_cliente_id, p_monto, p_metodo, v_referencia, 'Cobro en terreno', auth.uid(), p_parada_id);
    END IF;
END;
$$;

-- Supabase concede EXECUTE a anon por defecto en funciones nuevas: se quita.
REVOKE ALL ON FUNCTION public.mi_ruta_hoy() FROM public, anon;
REVOKE ALL ON FUNCTION public.marcar_parada(bigint, text, text, numeric, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mi_ruta_hoy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_parada(bigint, text, text, numeric, text, text) TO authenticated;
