-- ═══════════════════════════════════════════════════════════════════════════
--  Funciones del chofer (PBI-03, RNF-SEG-01)
--
--  Contrato: src/types/rutas.ts (ParadaChoferRow, 16 columnas).
--  El chofer no tiene políticas sobre rutas_diarias / ruta_paradas: estas dos
--  funciones (SECURITY DEFINER) son su único acceso. Filtran por auth.uid() y
--  devuelven solo columnas operativas: NUNCA rut, total, saldo ni crédito.
--
--  Códigos de error que traduce src/app/(chofer)/mi-ruta/actions.ts:
--    42501 → "Esta parada no pertenece a tu ruta."
--    P0001 → se muestra el mensaje tal cual (RAISE EXCEPTION sin ERRCODE)
-- ═══════════════════════════════════════════════════════════════════════════

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
    ventana_fin      time
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
             THEN rp.ventana_fin ELSE c.ventana_fin END
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

CREATE OR REPLACE FUNCTION public.marcar_parada(
    p_parada_id bigint,
    p_estado    text,
    p_motivo    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_estado_actual text;
    v_estado_ruta   text;
    v_motivo        text := NULLIF(btrim(p_motivo), '');
BEGIN
    -- Pertenencia primero: a una parada ajena o inexistente se responde igual,
    -- sin revelar si existe. FOR UPDATE evita que dos envíos la marquen a la vez.
    SELECT rp.estado, rd.estado
      INTO v_estado_actual, v_estado_ruta
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

    IF v_estado_actual <> 'pendiente' THEN
        RAISE EXCEPTION 'Esta parada ya fue marcada como %; no se puede cambiar.',
            CASE v_estado_actual WHEN 'entregado' THEN 'entregada' ELSE 'no entregada' END;
    END IF;

    IF p_estado = 'fallido' THEN
        IF v_motivo IS NULL THEN
            RAISE EXCEPTION 'Indica el motivo por el que no se pudo entregar.';
        END IF;
        IF char_length(v_motivo) > 200 THEN
            RAISE EXCEPTION 'El motivo no puede superar 200 caracteres.';
        END IF;
    END IF;

    UPDATE ruta_paradas
       SET estado       = p_estado,
           motivo_fallo = CASE WHEN p_estado = 'fallido' THEN v_motivo END,
           entregado_at = now()
     WHERE id = p_parada_id;
END;
$$;

-- Supabase concede EXECUTE a anon por defecto en funciones nuevas: se quita.
REVOKE ALL ON FUNCTION public.mi_ruta_hoy() FROM public, anon;
REVOKE ALL ON FUNCTION public.marcar_parada(bigint, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mi_ruta_hoy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_parada(bigint, text, text) TO authenticated;
