'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/security/auth-guard';
import { rolesDelModulo } from '@/constants/roles';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type MetodoPago = 'efectivo' | 'transferencia' | 'cheque' | 'otro';

interface PagoFormData {
    pedido_id: number;
    cliente_id: number;
    monto: number;
    metodo_pago: MetodoPago;
    referencia?: string;
    nota?: string;
}

interface ActionResult {
    success: boolean;
    error?: string;
}

// ─── REGISTRAR PAGO ─────────────────────────────────────────────────────────
// El trigger `trg_pagos_recalcular_total_pagado` → `recalcular_total_pagado()`
// actualiza automáticamente `pedidos.total_pagado`, lo cual recalcula
// `pedidos.saldo` (generated) y luego `clientes.saldo_pendiente` (trigger).

export async function registrarPago(data: PagoFormData): Promise<ActionResult> {
    // ⚠️ Guard de autenticación — cualquier rol puede registrar pagos
    const { user, error: authError } = await requireRole(rolesDelModulo('finanzas'));
    if (!user) return { success: false, error: authError ?? 'Sin autorización.' };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Validar que el monto sea positivo
    if (data.monto <= 0) {
        return { success: false, error: 'El monto debe ser mayor a $0.' };
    }

    // Validar que el pedido existe y obtener saldo
    const { data: pedido } = await supabase
        .from('pedidos')
        .select('id, saldo, total')
        .eq('id', data.pedido_id)
        .single();

    if (!pedido) {
        return { success: false, error: 'El pedido seleccionado no existe.' };
    }

    if (data.monto > Number(pedido.saldo)) {
        return {
            success: false,
            error: `El monto excede el saldo pendiente del pedido (${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(pedido.saldo))}).`,
        };
    }

    const { error } = await supabase
        .from('pagos')
        .insert({
            pedido_id: data.pedido_id,
            cliente_id: data.cliente_id,
            monto: data.monto,
            metodo_pago: data.metodo_pago,
            referencia: data.referencia || null,
            nota: data.nota || null,
            creado_por: user?.id || null,
        });

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/finanzas');
    revalidatePath('/pedidos');
    revalidatePath('/clientes');
    revalidatePath('/dashboard');
    return { success: true };
}
