'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/security/auth-guard';
import { validarMarcaParada } from '@/lib/rutas/validar-estado';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

interface ActionResult {
    success: boolean;
    error?: string;
}

/** Errores de PostgREST/Postgres que traducimos a mensajes para el chofer. */
const RPC_NO_EXISTE = 'PGRST202';
const SIN_PERMISO = '42501';
const RAISE_EXCEPTION = 'P0001';

// ─── MARCAR PARADA (Entregado / Fallido) ────────────────────────────────────
// El estado se guarda en la BD vía `marcar_parada` (ver src/types/rutas.ts).
// No hay estado local optimista: la UI se vuelve a renderizar con lo que quedó
// guardado, así un error nunca deja una parada "marcada" que no persistió.

export async function marcarParada(
    paradaId: number,
    estado: 'entregado' | 'fallido',
    motivo?: string
): Promise<ActionResult> {
    const { role, error: authError } = await requireAuth();
    if (authError) return { success: false, error: authError };

    // Rol exacto: la jerarquía no sirve aquí porque chofer es el nivel más bajo.
    if (role !== 'chofer') {
        return { success: false, error: 'Solo un chofer puede marcar sus paradas.' };
    }

    // OWASP A03: validar en runtime — los tipos de TS no protegen una server action
    const validacion = validarMarcaParada(paradaId, estado, motivo);
    if (!validacion.ok) return { success: false, error: validacion.error };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase.rpc('marcar_parada', {
        p_parada_id: validacion.valor.paradaId,
        p_estado: validacion.valor.estado,
        p_motivo: validacion.valor.motivo,
    });

    if (error) {
        if (error.code === RPC_NO_EXISTE) {
            return { success: false, error: 'La gestión de rutas aún no está habilitada. Avisa al administrador.' };
        }
        if (error.code === SIN_PERMISO) {
            return { success: false, error: 'Esta parada no pertenece a tu ruta.' };
        }
        if (error.code === RAISE_EXCEPTION) {
            // Mensajes escritos en la propia función SQL (p. ej. "ya fue marcada")
            return { success: false, error: error.message };
        }
        console.error('[mi-ruta] marcar_parada falló:', error.code, error.message);
        return { success: false, error: 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.' };
    }

    revalidatePath('/mi-ruta');
    return { success: true };
}
