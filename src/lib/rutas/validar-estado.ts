import { MOTIVO_MAX_LENGTH } from '@/types/rutas';

// ═══════════════════════════════════════════════════════════════════════════
//  Validación del cambio de estado de una parada (PBI-03, AC-03-error)
//
//  Funciones puras, sin Supabase ni Next: las usa la server action
//  `marcarParada` y el formulario del chofer, y se prueban con Vitest.
//  La BD repite estas reglas en `marcar_parada` y en los CHECK de
//  `paradas_ruta`; esto solo evita el viaje cuando el dato ya es inválido.
// ═══════════════════════════════════════════════════════════════════════════

export type ResultadoValidacion<T> = { ok: true; valor: T } | { ok: false; error: string };

export interface MarcaParadaValida {
    paradaId: number;
    estado: 'entregado' | 'fallido';
    /** Motivo recortado si es 'fallido'; null si es 'entregado' (así lo guarda la BD). */
    motivo: string | null;
}

/**
 * Valida en runtime lo que llega a la server action: los tipos de TS no
 * protegen una action, que puede invocarse con cualquier payload (OWASP A03).
 */
export function validarMarcaParada(
    paradaId: unknown,
    estado: unknown,
    motivo?: string | null
): ResultadoValidacion<MarcaParadaValida> {
    if (typeof paradaId !== 'number' || !Number.isInteger(paradaId) || paradaId <= 0) {
        return { ok: false, error: 'Parada no válida.' };
    }
    if (estado !== 'entregado' && estado !== 'fallido') {
        return { ok: false, error: 'Estado no válido.' };
    }

    const motivoLimpio = typeof motivo === 'string' ? motivo.trim() : '';
    if (estado === 'fallido' && !motivoLimpio) {
        return { ok: false, error: 'Indica el motivo por el que no se pudo entregar.' };
    }
    if (motivoLimpio.length > MOTIVO_MAX_LENGTH) {
        return { ok: false, error: `El motivo no puede superar ${MOTIVO_MAX_LENGTH} caracteres.` };
    }

    return {
        ok: true,
        valor: { paradaId, estado, motivo: estado === 'fallido' ? motivoLimpio : null },
    };
}

/**
 * Arma el motivo que se envía a partir de la opción elegida en el formulario.
 * 'Otro' exige detalle escrito y se guarda como "Otro: <detalle>".
 */
export function componerMotivoFallo(seleccion: string, detalle: string): ResultadoValidacion<string> {
    if (!seleccion) return { ok: false, error: 'Elige un motivo.' };
    if (seleccion !== 'Otro') return { ok: true, valor: seleccion };

    const detalleLimpio = detalle.trim();
    if (!detalleLimpio) return { ok: false, error: 'Describe el motivo.' };
    return { ok: true, valor: `Otro: ${detalleLimpio}` };
}
