'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, requireRole } from '@/lib/security/auth-guard';
import { rolesDelModulo } from '@/constants/roles';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// ─── Tipos para las acciones ────────────────────────────────────────────────

interface ProductoFormData {
    nombre: string;
    descripcion?: string;
    categoria_id: number | null;
    varas_por_paquete: number;
    maneja_cajas: boolean;
    paquetes_por_caja: number;
    stock_actual: number;
    stock_minimo: number;
    precio_venta_actual: number;
    activo: boolean;
}

interface CategoriaFormData {
    nombre: string;
    descripcion?: string;
}

interface ActionResult {
    success: boolean;
    error?: string;
}

// ─── PRODUCTOS ──────────────────────────────────────────────────────────────

export async function crearProducto(data: ProductoFormData): Promise<ActionResult> {
    const { error: authError } = await requireAuth('gerente');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('productos')
        .insert({
            nombre: data.nombre,
            descripcion: data.descripcion || null,
            categoria_id: data.categoria_id,
            varas_por_paquete: data.varas_por_paquete,
            maneja_cajas: data.maneja_cajas,
            paquetes_por_caja: data.maneja_cajas ? data.paquetes_por_caja : 1,
            stock_actual: data.stock_actual,
            stock_minimo: data.stock_minimo,
            precio_venta_actual: data.precio_venta_actual,
            activo: data.activo,
        });

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/inventario');
    return { success: true };
}

export async function actualizarProducto(
    id: number,
    data: ProductoFormData
): Promise<ActionResult> {
    const { error: authError } = await requireAuth('gerente');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('productos')
        .update({
            nombre: data.nombre,
            descripcion: data.descripcion || null,
            categoria_id: data.categoria_id,
            varas_por_paquete: data.varas_por_paquete,
            maneja_cajas: data.maneja_cajas,
            paquetes_por_caja: data.maneja_cajas ? data.paquetes_por_caja : 1,
            stock_actual: data.stock_actual,
            stock_minimo: data.stock_minimo,
            precio_venta_actual: data.precio_venta_actual,
            activo: data.activo,
        })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/inventario');
    return { success: true };
}

export async function eliminarProducto(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('gerente');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Soft-delete: desactivar en vez de borrar
    const { error } = await supabase
        .from('productos')
        .update({ activo: false })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/inventario');
    return { success: true };
}

export async function eliminarProductoPermanente(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('gerente');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Verificar si hay movimientos asociados
    const { data: movimientos } = await supabase
        .from('movimientos_inventario')
        .select('id')
        .eq('producto_id', id)
        .limit(1);

    if (movimientos && movimientos.length > 0) {
        return {
            success: false,
            error: 'No se puede eliminar: este producto tiene movimientos de inventario registrados. Solo puedes desactivarlo.',
        };
    }

    // Verificar si hay pedidos asociados
    const { data: pedidos } = await supabase
        .from('detalle_pedidos')
        .select('id')
        .eq('producto_id', id)
        .limit(1);

    if (pedidos && pedidos.length > 0) {
        return {
            success: false,
            error: 'No se puede eliminar: este producto tiene pedidos asociados. Solo puedes desactivarlo.',
        };
    }

    // Eliminar historial de precios asociado
    await supabase
        .from('historial_precios')
        .delete()
        .eq('producto_id', id);

    // Eliminar el producto permanentemente
    const { error } = await supabase
        .from('productos')
        .delete()
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/inventario');
    return { success: true };
}

export async function toggleProductoActivo(
    id: number,
    activo: boolean
): Promise<ActionResult> {
    const { error: authError } = await requireAuth('gerente');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('productos')
        .update({ activo })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/inventario');
    return { success: true };
}

// ─── CATEGORÍAS ─────────────────────────────────────────────────────────────

export async function crearCategoria(data: CategoriaFormData): Promise<ActionResult> {
    const { error: authError } = await requireAuth('gerente');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('categorias')
        .insert({
            nombre: data.nombre,
            descripcion: data.descripcion || null,
        });

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe una categoría con ese nombre.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/inventario');
    return { success: true };
}

export async function actualizarCategoria(
    id: number,
    data: CategoriaFormData
): Promise<ActionResult> {
    const { error: authError } = await requireAuth('gerente');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('categorias')
        .update({
            nombre: data.nombre,
            descripcion: data.descripcion || null,
        })
        .eq('id', id);

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe una categoría con ese nombre.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/inventario');
    return { success: true };
}

// ─── HISTORIAL DE PRECIOS ───────────────────────────────────────────────────

export interface HistorialPrecioResult {
    id: number;
    precio_anterior: number;
    precio_nuevo: number;
    created_at: string;
    usuario_nombre: string;
}

export async function obtenerHistorialPrecios(
    productoId: number
): Promise<{ success: boolean; data: HistorialPrecioResult[]; error?: string }> {
    const { error: authError } = await requireRole(rolesDelModulo('inventario'));
    if (authError) return { success: false, data: [], error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
        .from('historial_precios')
        .select('id, precio_anterior, precio_nuevo, created_at, usuarios(nombre)')
        .eq('producto_id', productoId)
        .order('created_at', { ascending: false });

    if (error) {
        return { success: false, data: [], error: error.message };
    }

    const cambios: HistorialPrecioResult[] = (data ?? []).map((row) => ({
        id: row.id,
        precio_anterior: Number(row.precio_anterior),
        precio_nuevo: Number(row.precio_nuevo),
        created_at: row.created_at,
        usuario_nombre:
            ((row.usuarios as unknown) as { nombre: string } | null)?.nombre ??
            'Sistema',
    }));

    return { success: true, data: cambios };
}

export async function eliminarCategoria(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Verificar si hay productos asociados
    const { data: productosAsociados } = await supabase
        .from('productos')
        .select('id')
        .eq('categoria_id', id)
        .limit(1);

    if (productosAsociados && productosAsociados.length > 0) {
        return {
            success: false,
            error: 'No se puede eliminar: hay productos asociados a esta categoría.',
        };
    }

    const { error } = await supabase
        .from('categorias')
        .delete()
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/inventario');
    return { success: true };
}
