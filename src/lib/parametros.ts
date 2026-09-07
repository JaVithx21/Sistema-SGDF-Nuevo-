import 'server-only';

import type { createClient } from '@/lib/supabase/server';

/** Tipos de parámetro soportados — refleja chk_parametros_tipo en la BD. */
export type TipoParametro = 'numero' | 'texto' | 'booleano' | 'hora';

export interface ParametroSistema {
    clave: string;
    valor: string;
    descripcion: string | null;
    tipo: TipoParametro;
    updated_at: string;
}

/** Claves conocidas que el código consume directamente. */
export const PARAM_PRECIO_LITRO = 'precio_litro_diesel_clp';
export const PARAM_TURNO_INICIO = 'turno_inicio_defecto';
export const PARAM_TURNO_FIN = 'turno_fin_defecto';

/**
 * Último recurso si la fila no existe en BD (por ejemplo, si la migración de
 * seed no corrió). No es la fuente de verdad: solo evita que el planificador
 * quede inutilizable.
 */
const FALLBACK = {
    precioLitroDiesel: 1050,
    turnoInicio: '07:00',
    turnoFin: '18:00',
} as const;

export interface ParametrosOperacionales {
    precioLitroDiesel: number;
    turnoInicioDefecto: string;
    turnoFinDefecto: string;
}

/**
 * Lee los parámetros que necesita el planificador de rutas.
 * Se consulta desde un RSC y se pasa como prop al panel, igual que el resto
 * de los datos: el Client Component nunca consulta la BD por su cuenta.
 */
export async function obtenerParametrosOperacionales(
    supabase: ReturnType<typeof createClient>
): Promise<ParametrosOperacionales> {
    const { data } = await supabase
        .from('parametros_sistema')
        .select('clave, valor')
        .in('clave', [PARAM_PRECIO_LITRO, PARAM_TURNO_INICIO, PARAM_TURNO_FIN]);

    const mapa = new Map((data ?? []).map((p) => [p.clave, p.valor]));

    const precioRaw = Number(mapa.get(PARAM_PRECIO_LITRO));

    return {
        precioLitroDiesel:
            Number.isFinite(precioRaw) && precioRaw > 0 ? precioRaw : FALLBACK.precioLitroDiesel,
        turnoInicioDefecto: mapa.get(PARAM_TURNO_INICIO) || FALLBACK.turnoInicio,
        turnoFinDefecto: mapa.get(PARAM_TURNO_FIN) || FALLBACK.turnoFin,
    };
}

/**
 * Valida el valor de un parámetro según su tipo declarado.
 * Devuelve el mensaje de error, o null si es válido.
 */
export function validarValorParametro(tipo: TipoParametro, valor: string): string | null {
    switch (tipo) {
        case 'numero': {
            const n = Number(valor);
            if (!Number.isFinite(n)) return 'Debe ser un número válido.';
            if (n < 0) return 'No puede ser negativo.';
            return null;
        }
        case 'hora':
            return /^([01]\d|2[0-3]):[0-5]\d$/.test(valor)
                ? null
                : 'Debe tener el formato HH:MM (24 horas).';
        case 'booleano':
            return valor === 'true' || valor === 'false'
                ? null
                : 'Debe ser "true" o "false".';
        case 'texto':
            return valor.trim().length > 0 ? null : 'No puede estar vacío.';
    }
}
