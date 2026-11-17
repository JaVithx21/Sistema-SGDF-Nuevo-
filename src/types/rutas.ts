// ═══════════════════════════════════════════════════════════════════════════
//  Contrato de datos de la vista del chofer (/mi-ruta) — PBI-03
//
//  El chofer NO consulta `clientes` ni `pedidos` directamente: RLS filtra por
//  fila, no por columna, y con su sesión podría pedir `rut`, `saldo` o `total`
//  a la API. Por eso lee y escribe solo a través de dos funciones RPC
//  (SECURITY DEFINER) que filtran por `auth.uid()` y devuelven columnas seguras.
//  La migración que las crea es responsabilidad de `chore/esquema-migraciones`.
//
//  1) mi_ruta_hoy() RETURNS TABLE (columnas = ParadaChoferRow, 17 columnas)
//     - Paradas de la ruta de HOY (America/Santiago) del chofer cuyo
//       choferes.usuario_id = auth.uid(), ordenadas por `orden`.
//     - Sin ruta hoy → 0 filas. NUNCA incluye rut, total, saldo del pedido o
//       del cliente ni crédito.
//     - monto_por_cobrar = GREATEST(pedidos.saldo, 0): lo que queda por cobrar
//       de ESE pedido, única cifra financiera que ve el chofer (ADR-03).
//
//  2) marcar_parada(p_parada_id bigint, p_estado text, p_motivo text DEFAULT NULL,
//                   p_monto numeric DEFAULT NULL, p_metodo text DEFAULT NULL,
//                   p_referencia text DEFAULT NULL) RETURNS void
//     - Solo sobre paradas de una ruta del propio chofer (si no: SQLSTATE 42501).
//     - Solo desde estado 'pendiente' (si no: RAISE EXCEPTION con mensaje claro).
//     - p_estado ∈ ('entregado','fallido'); 'fallido' exige p_motivo no vacío.
//     - Fija entregado_at = now() (marca de tiempo del cambio de estado).
//     - Cobro opcional (ADR-03): con p_monto, en la misma transacción inserta
//       un pago en `pagos` (parada_id único: un cobro por parada). Exige
//       entregado, 0 < p_monto <= saldo, p_metodo ∈ ('efectivo','transferencia')
//       y p_referencia (≤ 100) si es transferencia. Si algo falla, nada cambia.
// ═══════════════════════════════════════════════════════════════════════════

export type EstadoParada = 'pendiente' | 'entregado' | 'fallido';

/** Fila tal como la devuelve `mi_ruta_hoy()`. */
export interface ParadaChoferRow {
    parada_id: number;
    ruta_id: number;
    fecha: string;              // 'YYYY-MM-DD'
    vehiculo_patente: string | null;
    orden: number;              // 1, 2, 3… según la ruta calculada
    estado: EstadoParada;
    motivo_fallo: string | null;
    entregado_at: string | null; // timestamptz ISO
    razon_social: string;
    nombre_contacto: string | null;
    telefono: string | null;
    direccion: string | null;
    lat: number | null;
    lng: number | null;
    ventana_inicio: string | null; // 'HH:MM:SS'
    ventana_fin: string | null;
    monto_por_cobrar: number;   // saldo del pedido, nunca negativo (ADR-03)
}

/** Motivos de fallo ofrecidos al chofer. 'Otro' exige detalle escrito. */
export const MOTIVOS_FALLO = [
    'Cliente ausente',
    'Local cerrado',
    'Dirección incorrecta',
    'Rechazado por el cliente',
    'Otro',
] as const;

export const MOTIVO_MAX_LENGTH = 200;
