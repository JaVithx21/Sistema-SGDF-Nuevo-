import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { MiRutaClient } from '@/components/mi-ruta/MiRutaClient';
import type { EstadoParada, ParadaChoferRow } from '@/types/rutas';

/** PostgREST devuelve `numeric` como string: se normaliza a number | null. */
function aNumero(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

const ESTADOS: readonly EstadoParada[] = ['pendiente', 'entregado', 'fallido'];

export default async function MiRutaPage() {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Única fuente de datos del chofer: la RPC filtra por auth.uid() y solo
    // expone columnas operativas (sin rut, total, saldo ni crédito).
    const { data, error } = await supabase.rpc('mi_ruta_hoy');

    if (error) {
        // PGRST202 = la función aún no existe (migración pendiente)
        const disponible = error.code !== 'PGRST202';
        if (disponible) console.error('[mi-ruta] mi_ruta_hoy falló:', error.code, error.message);
        return <MiRutaClient paradas={[]} estadoCarga={disponible ? 'error' : 'no_disponible'} />;
    }

    const paradas: ParadaChoferRow[] = ((data ?? []) as ParadaChoferRow[])
        .map((p) => ({
            parada_id: Number(p.parada_id),
            ruta_id: Number(p.ruta_id),
            fecha: p.fecha,
            vehiculo_patente: p.vehiculo_patente,
            orden: Number(p.orden),
            estado: ESTADOS.includes(p.estado) ? p.estado : 'pendiente',
            motivo_fallo: p.motivo_fallo,
            entregado_at: p.entregado_at,
            razon_social: p.razon_social,
            nombre_contacto: p.nombre_contacto,
            telefono: p.telefono,
            direccion: p.direccion,
            lat: aNumero(p.lat),
            lng: aNumero(p.lng),
            ventana_inicio: p.ventana_inicio,
            ventana_fin: p.ventana_fin,
        }))
        .sort((a, b) => a.orden - b.orden);

    return <MiRutaClient paradas={paradas} estadoCarga="ok" />;
}
