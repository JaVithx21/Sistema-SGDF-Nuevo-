'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/security/auth-guard';
import { geocodificarDireccion } from '@/lib/geocoding';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ClienteFormData {
    razon_social: string;
    rut?: string;
    nombre_contacto?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    activo: boolean;
    /** Ventana horaria de recepción "HH:MM" — null = sin restricción (VRPTW). */
    ventana_inicio?: string | null;
    ventana_fin?: string | null;
}

/**
 * La ventana horaria es opcional, pero si se define debe estar completa y ser
 * coherente. Refleja la constraint chk_clientes_ventana_valida de la BD.
 */
function validarVentanaHoraria(data: ClienteFormData): string | null {
    const { ventana_inicio, ventana_fin } = data;
    if (!ventana_inicio && !ventana_fin) return null;
    if (!ventana_inicio || !ventana_fin) {
        return 'Para definir un horario de recepción debes indicar hora de inicio y de término.';
    }
    if (ventana_inicio >= ventana_fin) {
        return 'La hora de inicio debe ser anterior a la hora de término.';
    }
    return null;
}

interface ActionResult {
    success: boolean;
    error?: string;
}

// ─── CREAR CLIENTE ──────────────────────────────────────────────────────────

export async function crearCliente(data: ClienteFormData): Promise<ActionResult> {
    const { error: authError } = await requireAuth();
    if (authError) return { success: false, error: authError };

    const ventanaError = validarVentanaHoraria(data);
    if (ventanaError) return { success: false, error: ventanaError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const coords = await geocodificarDireccion(data.direccion);

    const { error } = await supabase
        .from('clientes')
        .insert({
            razon_social: data.razon_social,
            rut: data.rut || null,
            nombre_contacto: data.nombre_contacto || null,
            telefono: data.telefono || null,
            email: data.email || null,
            direccion: data.direccion || null,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            ventana_inicio: data.ventana_inicio || null,
            ventana_fin: data.ventana_fin || null,
            activo: data.activo,
        });

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe un cliente con ese RUT.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/clientes');
    revalidatePath('/dashboard');
    return { success: true };
}

// ─── ACTUALIZAR CLIENTE ─────────────────────────────────────────────────────

export async function actualizarCliente(
    id: number,
    data: ClienteFormData
): Promise<ActionResult> {
    const { error: authError } = await requireAuth();
    if (authError) return { success: false, error: authError };

    const ventanaError = validarVentanaHoraria(data);
    if (ventanaError) return { success: false, error: ventanaError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const coords = await geocodificarDireccion(data.direccion);

    const { error } = await supabase
        .from('clientes')
        .update({
            razon_social: data.razon_social,
            rut: data.rut || null,
            nombre_contacto: data.nombre_contacto || null,
            telefono: data.telefono || null,
            email: data.email || null,
            direccion: data.direccion || null,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            ventana_inicio: data.ventana_inicio || null,
            ventana_fin: data.ventana_fin || null,
            activo: data.activo,
        })
        .eq('id', id);

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe un cliente con ese RUT.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/clientes');
    revalidatePath('/dashboard');
    return { success: true };
}

// ─── DESACTIVAR CLIENTE (soft-delete) ───────────────────────────────────────

export async function desactivarCliente(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('gerente');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('clientes')
        .update({ activo: false })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/clientes');
    return { success: true };
}

// ─── REACTIVAR CLIENTE ──────────────────────────────────────────────────────

export async function reactivarCliente(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('gerente');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('clientes')
        .update({ activo: true })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/clientes');
    return { success: true };
}

// ─── HISTORIAL DE PEDIDOS DE UN CLIENTE ─────────────────────────────────────

export interface PedidoHistorialResult {
    id: number;
    estado: string;
    total: number;
    total_pagado: number;
    saldo: number;
    nota: string | null;
    created_at: string;
}

export interface HistorialClienteResult {
    success: boolean;
    pedidos: PedidoHistorialResult[];
    total_ventas: number;
    pedidos_activos: number;
    error?: string;
}

export async function obtenerHistorialPedidos(
    clienteId: number
): Promise<HistorialClienteResult> {
    const { error: authError } = await requireAuth();
    if (authError) return { success: false, pedidos: [], total_ventas: 0, pedidos_activos: 0, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
        .from('pedidos')
        .select('id, estado, total, total_pagado, saldo, nota, created_at')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });

    if (error) {
        return { success: false, pedidos: [], total_ventas: 0, pedidos_activos: 0, error: error.message };
    }

    const pedidos: PedidoHistorialResult[] = (data ?? []).map((p) => ({
        id: p.id,
        estado: p.estado,
        total: Number(p.total),
        total_pagado: Number(p.total_pagado),
        saldo: Number(p.saldo),
        nota: p.nota,
        created_at: p.created_at,
    }));

    const total_ventas = pedidos
        .filter((p) => p.estado !== 'anulado')
        .reduce((acc, p) => acc + p.total, 0);

    const pedidos_activos = pedidos.filter(
        (p) => p.estado === 'pendiente' || p.estado === 'confirmado'
    ).length;

    return { success: true, pedidos, total_ventas, pedidos_activos };
}