'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/security/auth-guard';
import { rolesDelModulo } from '@/constants/roles';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface LineaPedidoData {
    producto_id: number;
    cantidad: number;
    precio_unitario: number;
}

interface NuevoPedidoData {
    cliente_id: number;
    nota?: string;
    lineas: LineaPedidoData[];
}

interface ActionResult {
    success: boolean;
    error?: string;
}

// ─── CREAR PEDIDO (Transacción: pedido + detalle) ───────────────────────────
// 1. INSERT en `pedidos` (con total=0 inicialmente)
// 2. Obtener el ID generado
// 3. INSERT múltiple en `detalle_pedidos`
// 4. El trigger `trg_detalle_recalcular_total` actualiza `pedidos.total` automáticamente
// 5. El trigger `trg_pedidos_recalcular_saldo_cliente` actualiza `clientes.saldo_pendiente`

export async function crearPedido(data: NuevoPedidoData): Promise<ActionResult> {
    const { user, error: authError } = await requireRole(rolesDelModulo('pedidos'));
    if (!user) return { success: false, error: authError ?? 'Sin autorización.' };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Validar que haya al menos una línea
    if (data.lineas.length === 0) {
        return { success: false, error: 'Debe agregar al menos un producto al pedido.' };
    }

    // Validar que todos los productos tengan cantidad > 0
    const lineaInvalida = data.lineas.find(l => l.cantidad <= 0 || l.precio_unitario <= 0);
    if (lineaInvalida) {
        return { success: false, error: 'Todas las líneas deben tener cantidad y precio mayor a 0.' };
    }

    // Validar stock disponible
    const productoIds = data.lineas.map(l => l.producto_id);
    const { data: productosStock, error: errorStock } = await supabase
        .from('productos')
        .select('id, nombre, stock_actual')
        .in('id', productoIds);

    if (errorStock || !productosStock) {
        return { success: false, error: 'Error al verificar el stock de los productos.' };
    }

    for (const linea of data.lineas) {
        const prod = productosStock.find(p => p.id === linea.producto_id);
        if (!prod) {
            return { success: false, error: `Producto no encontrado (ID: ${linea.producto_id}).` };
        }
        if (prod.stock_actual < linea.cantidad) {
            return { success: false, error: `Stock insuficiente para ${prod.nombre}. Solicitado: ${linea.cantidad}, Disponible: ${prod.stock_actual}.` };
        }
    }

    // 1. Crear el pedido (total se calcula automáticamente por trigger)
    const { data: pedido, error: errorPedido } = await supabase
        .from('pedidos')
        .insert({
            cliente_id: data.cliente_id,
            estado: 'pendiente',
            total: 0, // El trigger lo recalculará
            nota: data.nota || null,
            creado_por: user?.id || null,
        })
        .select('id')
        .single();

    if (errorPedido || !pedido) {
        return { success: false, error: errorPedido?.message ?? 'Error al crear el pedido.' };
    }

    // 2. Insertar las líneas de detalle
    // costo_unitario = 0 porque el esquema actual no gestiona costos de compra
    const detalles = data.lineas.map((linea) => ({
        pedido_id: pedido.id,
        producto_id: linea.producto_id,
        cantidad: linea.cantidad,
        precio_unitario: linea.precio_unitario,
        costo_unitario: 0,
    }));

    const { error: errorDetalle } = await supabase
        .from('detalle_pedidos')
        .insert(detalles);

    if (errorDetalle) {
        // Intentar limpiar el pedido huérfano
        await supabase.from('pedidos').delete().eq('id', pedido.id);
        return { success: false, error: errorDetalle.message };
    }

    revalidatePath('/pedidos');
    revalidatePath('/clientes');
    revalidatePath('/dashboard');
    return { success: true };
}

// ─── CAMBIAR ESTADO DE PEDIDO ───────────────────────────────────────────────
// Flujo válido: pendiente → confirmado → entregado
// Anulación permitida solo desde: pendiente o confirmado (NO entregado)
// Al anular se devuelve el stock de cada producto

export async function cambiarEstadoPedido(
    id: number,
    nuevoEstado: 'pendiente' | 'confirmado' | 'entregado' | 'anulado'
): Promise<ActionResult> {
    const { error: authError } = await requireRole(rolesDelModulo('pedidos'));
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 1. Obtener el estado actual del pedido
    const { data: pedidoActual, error: fetchError } = await supabase
        .from('pedidos')
        .select('estado')
        .eq('id', id)
        .single();

    if (fetchError || !pedidoActual) {
        return { success: false, error: 'No se pudo obtener el pedido.' };
    }

    const estadoActual = pedidoActual.estado;

    // 2. Validar que no se pueda anular un pedido ya entregado
    if (nuevoEstado === 'anulado' && estadoActual === 'entregado') {
        return {
            success: false,
            error: 'No se puede anular un pedido que ya fue entregado. Las flores ya salieron de bodega.',
        };
    }

    // 3. Validar que no se pueda cambiar un pedido ya anulado
    if (estadoActual === 'anulado') {
        return {
            success: false,
            error: 'No se puede modificar un pedido anulado.',
        };
    }

    // 4. Si se está anulando, el trigger de la base de datos (trg_anulacion_pedido)
    // se encargará de registrar la devolución del stock automáticamente.

    // 5. Actualizar el estado
    const { error } = await supabase
        .from('pedidos')
        .update({ estado: nuevoEstado })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/pedidos');
    revalidatePath('/clientes');
    revalidatePath('/dashboard');
    revalidatePath('/inventario');
    return { success: true };
}

// ─── OBTENER DETALLE DE UN PEDIDO ───────────────────────────────────────────

export interface PedidoDetalleResult {
    success: boolean;
    detalles: Array<{
        id: number;
        producto_nombre: string;
        cantidad: number;
        precio_unitario: number;
        costo_unitario: number;
        subtotal: number;
    }>;
    pagos: Array<{
        id: number;
        monto: number;
        metodo_pago: string;
        referencia: string | null;
        created_at: string;
    }>;
    error?: string;
}

export async function obtenerDetallePedido(pedidoId: number): Promise<PedidoDetalleResult> {
    const { error: authError } = await requireRole(rolesDelModulo('pedidos'));
    if (authError) return { success: false, detalles: [], pagos: [], error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 1. Obtener los detalles (con INNER JOIN manual a inventario para nombre del producto)
    const { data: detallesData, error: detallesError } = await supabase
        .from('detalle_pedidos')
        .select(`
            id, 
            cantidad, 
            precio_unitario, 
            costo_unitario, 
            subtotal,
            producto_id
        `)
        .eq('pedido_id', pedidoId);

    if (detallesError) {
        return { success: false, detalles: [], pagos: [], error: detallesError.message };
    }

    // Como Supabase / Postgrest a veces complica join genérico si no hay FK bien definida,
    // o para simplificar, sacamos los nombres de los productos acá:
    const productoIds = (detallesData ?? []).map(d => d.producto_id);
    let productosMap: Record<number, string> = {};
    
    if (productoIds.length > 0) {
        const { data: prods } = await supabase
            .from('productos')
            .select('id, nombre')
            .in('id', productoIds);
            
        productosMap = (prods ?? []).reduce((acc, p) => {
            acc[p.id] = p.nombre;
            return acc;
        }, {} as Record<number, string>);
    }

    const detalles = (detallesData ?? []).map(d => ({
        id: d.id,
        producto_nombre: productosMap[d.producto_id] || `Producto #${d.producto_id}`,
        cantidad: d.cantidad,
        precio_unitario: Number(d.precio_unitario),
        costo_unitario: Number(d.costo_unitario),
        subtotal: Number(d.subtotal),
    }));

    // 2. Obtener el historial de pagos
    const { data: pagosData, error: pagosError } = await supabase
        .from('pagos')
        .select('id, monto, metodo_pago, referencia, created_at')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: false });

    if (pagosError) {
        return { success: false, detalles, pagos: [], error: pagosError.message };
    }

    const pagos = (pagosData ?? []).map(p => ({
        id: p.id,
        monto: Number(p.monto),
        metodo_pago: p.metodo_pago,
        referencia: p.referencia,
        created_at: p.created_at,
    }));

    return { success: true, detalles, pagos };
}

// ─── CREAR CLIENTE RÁPIDO ───────────────────────────────────────────────────

export async function crearClienteRapido(data: { razon_social: string; rut: string }): Promise<ActionResult & { id?: number }> {
    const { user, error: authError } = await requireRole(rolesDelModulo('pedidos'));
    if (!user) return { success: false, error: authError ?? 'Sin autorización.' };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    if (!data.razon_social.trim()) {
        return { success: false, error: 'La razón social es obligatoria.' };
    }

    const { data: newCliente, error } = await supabase
        .from('clientes')
        .insert({
            razon_social: data.razon_social.trim(),
            rut: data.rut.trim() || null,
            activo: true
        })
        .select('id')
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/pedidos/nuevo');
    return { success: true, id: newCliente.id };
}
