'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/security/auth-guard';
import { rolesDelModulo } from '@/constants/roles';
import { cookies } from 'next/headers';

// ─── Tipos de resultado de búsqueda global ──────────────────────────────────

export interface ProductoSearchResult {
    id: number;
    nombre: string;
    categoria_nombre: string | null;
    stock_actual: number;
    activo: boolean;
}

export interface ClienteSearchResult {
    id: number;
    razon_social: string;
    rut: string | null;
    activo: boolean;
}

export interface PedidoSearchResult {
    id: number;
    estado: string;
    total: number;
    cliente_razon_social: string;
}

export interface GlobalSearchResult {
    productos: ProductoSearchResult[];
    clientes: ClienteSearchResult[];
    pedidos: PedidoSearchResult[];
}

// ─── BÚSQUEDA GLOBAL ────────────────────────────────────────────────────────

export async function busquedaGlobal(query: string): Promise<GlobalSearchResult> {
    const { error: authError } = await requireRole(rolesDelModulo('dashboard'));
    if (authError) return { productos: [], clientes: [], pedidos: [] };

    const trimmed = query.trim();
    if (trimmed.length < 2) return { productos: [], clientes: [], pedidos: [] };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const isNumeric = /^\d+$/.test(trimmed);

    // Buscar en las 3 tablas en paralelo
    const [productosRes, clientesRes, pedidosRes] = await Promise.all([
        // 1. Productos: buscar por nombre
        supabase
            .from('productos')
            .select('id, nombre, stock_actual, activo, categorias(nombre)')
            .ilike('nombre', `%${trimmed}%`)
            .limit(5),

        // 2. Clientes: buscar por razón social o RUT
        supabase
            .from('clientes')
            .select('id, razon_social, rut, activo')
            .or(`razon_social.ilike.%${trimmed}%,rut.ilike.%${trimmed}%`)
            .limit(5),

        // 3. Pedidos: buscar por ID (si es numérico) o por nombre de cliente
        isNumeric
            ? supabase
                  .from('pedidos')
                  .select('id, estado, total, clientes(razon_social)')
                  .eq('id', parseInt(trimmed, 10))
                  .limit(5)
            : supabase
                  .from('pedidos')
                  .select('id, estado, total, clientes!inner(razon_social)')
                  .ilike('clientes.razon_social', `%${trimmed}%`)
                  .order('created_at', { ascending: false })
                  .limit(5),
    ]);

    // Mapear resultados de productos
    const productos: ProductoSearchResult[] = (productosRes.data ?? []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria_nombre:
            ((p.categorias as unknown) as { nombre: string } | null)?.nombre ?? null,
        stock_actual: p.stock_actual,
        activo: p.activo,
    }));

    // Mapear resultados de clientes
    const clientes: ClienteSearchResult[] = (clientesRes.data ?? []).map((c) => ({
        id: c.id,
        razon_social: c.razon_social,
        rut: c.rut,
        activo: c.activo,
    }));

    // Mapear resultados de pedidos
    const pedidos: PedidoSearchResult[] = (pedidosRes.data ?? []).map((p) => ({
        id: p.id,
        estado: p.estado,
        total: Number(p.total),
        cliente_razon_social:
            ((p.clientes as unknown) as { razon_social: string } | null)?.razon_social ?? '—',
    }));

    return { productos, clientes, pedidos };
}
