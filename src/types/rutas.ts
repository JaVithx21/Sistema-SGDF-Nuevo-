// ═══════════════════════════════════════════════════════════════════════════
//  Contrato de datos de la vista del chofer (/mi-ruta) — PBI-03
//
//  El chofer NO consulta `clientes` ni `pedidos` directamente: RLS filtra por
//  fila, no por columna, y con su sesión podría pedir `rut`, `saldo` o `total`
//  a la API. Por eso lee y escribe solo a través de dos funciones RPC
//  (SECURITY DEFINER) que filtran por `auth.uid()` y devuelven columnas seguras.
//  La migración que las crea es responsabilidad de `chore/esquema-migraciones`.
//
//  1) mi_ruta_hoy() RETURNS TABLE (columnas = ParadaChoferRow)
//     - Paradas de la ruta de HOY (America/Santiago) del chofer cuyo
//       choferes.usuario_id = auth.uid(), ordenadas por `orden`.
//     - Sin ruta hoy → 0 filas. NUNCA incluye rut, total, saldo ni crédito.
//
//  2) marcar_parada(p_parada_id bigint, p_estado text, p_motivo text DEFAULT NULL)
//     RETURNS void
//     - Solo sobre paradas de una ruta del propio chofer (si no: SQLSTATE 42501).
//     - Solo desde estado 'pendiente' (si no: RAISE EXCEPTION con mensaje claro).
//     - p_estado ∈ ('entregado','fallido'); 'fallido' exige p_motivo no vacío.
//     - Fija entregado_at = now() (marca de tiempo del cambio de estado).
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
