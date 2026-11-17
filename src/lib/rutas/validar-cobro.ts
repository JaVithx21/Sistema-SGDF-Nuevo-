// Validación del cobro en terreno (PBI-11.1, ADR-03). Lógica pura: la usan el
// panel de Mi ruta (aviso inmediato) y la server action (OWASP A03: los tipos de
// TS no protegen una acción). marcar_parada() repite las reglas en la base.

export const METODOS_COBRO = ['efectivo', 'transferencia'] as const;
export type MetodoCobro = (typeof METODOS_COBRO)[number];
export type OpcionCobro = MetodoCobro | 'sin_cobro';

export const REFERENCIA_MAX_LENGTH = 100;

export interface Cobro {
    monto: number;
    metodo: MetodoCobro;
    referencia: string | null;
}

export type CobroValidado = { ok: true; cobro: Cobro | null } | { ok: false; error: string };

export function formatearCLP(monto: number): string {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(monto);
}

interface EntradaCobro {
    opcion: unknown;
    monto?: unknown;
    referencia?: unknown;
    /** Saldo del pedido que informa mi_ruta_hoy() (monto_por_cobrar). */
    porCobrar: number;
}

/** `cobro: null` = entrega sin cobro (pedido pagado o a crédito, AC-COB-03). */
export function validarCobro({ opcion, monto, referencia, porCobrar }: EntradaCobro): CobroValidado {
    if (opcion === 'sin_cobro') return { ok: true, cobro: null };
    if (!(METODOS_COBRO as readonly unknown[]).includes(opcion)) {
        return { ok: false, error: 'Elige cómo se cobró: efectivo, transferencia o sin cobro.' };
    }
    const metodo = opcion as MetodoCobro;

    if (!(porCobrar > 0)) {
        return { ok: false, error: 'Este pedido no tiene saldo por cobrar: marca «Sin cobro».' };
    }
    if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
        return { ok: false, error: 'El monto debe ser mayor que 0.' };
    }
    if (!Number.isInteger(monto)) {
        return { ok: false, error: 'El monto debe ser un número entero de pesos.' };
    }
    if (monto > porCobrar) {
        return { ok: false, error: `El monto supera el saldo por cobrar (${formatearCLP(porCobrar)}).` };
    }

    if (metodo === 'efectivo') return { ok: true, cobro: { monto, metodo, referencia: null } };

    const ref = typeof referencia === 'string' ? referencia.trim() : '';
    if (!ref) return { ok: false, error: 'Indica la referencia de la transferencia.' };
    if (ref.length > REFERENCIA_MAX_LENGTH) {
        return { ok: false, error: `La referencia no puede superar ${REFERENCIA_MAX_LENGTH} caracteres.` };
    }
    return { ok: true, cobro: { monto, metodo, referencia: ref } };
}

/** Parámetros de cobro de marcar_parada(); todos null si la entrega es sin cobro. */
export function parametrosCobro(cobro: Cobro | null) {
    return {
        p_monto: cobro?.monto ?? null,
        p_metodo: cobro?.metodo ?? null,
        p_referencia: cobro?.referencia ?? null,
    };
}
