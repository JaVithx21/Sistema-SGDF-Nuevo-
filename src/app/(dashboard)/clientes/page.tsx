import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { ClientesClient } from '@/components/clientes/ClientesClient';
import type { ClienteData } from '@/components/clientes/ClientesClient';

export default async function ClientesPage() {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // ─── Fetch clientes con conteo de pedidos ──────────────────────────
    const { data: clientesRaw } = await supabase
        .from('clientes')
        .select('id, razon_social, rut, nombre_contacto, telefono, email, direccion, lat, lng, ventana_inicio, ventana_fin, saldo_pendiente, activo, pedidos(id)')
        .order('razon_social', { ascending: true });

    // ─── Transformar a datos serializables (RSC boundary rule) ─────────

    const clientes: ClienteData[] = (clientesRaw ?? []).map((c) => ({
        id: c.id,
        razon_social: c.razon_social,
        rut: c.rut,
        nombre_contacto: c.nombre_contacto,
        telefono: c.telefono,
        email: c.email,
        direccion: c.direccion,
        // DEF-05: sin estos campos el editor partía vacío y borraba la ventana al guardar
        ventana_inicio: c.ventana_inicio ?? null,
        ventana_fin: c.ventana_fin ?? null,
        con_ubicacion: c.lat !== null && c.lng !== null,
        saldo_pendiente: Number(c.saldo_pendiente),
        activo: c.activo,
        total_pedidos: Array.isArray(c.pedidos) ? c.pedidos.length : 0,
    }));

    // ─── Render: Server → Client boundary ──────────────────────────────

    return <ClientesClient clientes={clientes} />;
}
