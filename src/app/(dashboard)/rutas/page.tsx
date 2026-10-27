import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { PlanificadorRutas } from '@/components/rutas/PlanificadorRutas';
import { esFechaIso, hoyEnChile } from '@/lib/rutas/fecha';
import type {
    ChoferPlanificable,
    ParadaGuardada,
    PedidoPlanificable,
    RutaGuardada,
    SucursalPlanificable,
} from '@/types/planificador';

function aNumero(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

/** PostgREST puede devolver una relación como objeto o como arreglo. */
/* eslint-disable @typescript-eslint/no-explicit-any */
function uno(valor: any): any {
    return Array.isArray(valor) ? (valor[0] ?? null) : (valor ?? null);
}

export default async function RutasPage(props: {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const hoy = hoyEnChile();
    const fecha = esFechaIso(searchParams?.fecha) ? (searchParams.fecha as string) : hoy;

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const [pedidosRes, enRutaRes, choferesRes, sucursalesRes, rutasRes] = await Promise.all([
        supabase
            .from('pedidos')
            .select(
                'id, estado, created_at, clientes(razon_social, direccion, lat, lng, ventana_inicio, ventana_fin), detalle_pedidos(cantidad, productos(volumen_unitario_m3, peso_unitario_kg))'
            )
            .in('estado', ['pendiente', 'confirmado'])
            .order('created_at', { ascending: true }),
        // Pedidos ya asignados a una ruta (los fallidos se pueden reprogramar)
        supabase.from('ruta_paradas').select('pedido_id').neq('estado', 'fallido'),
        supabase
            .from('choferes')
            .select('id, nombre_completo, turno_inicio, turno_fin, vehiculos(id, patente, modelo, capacidad_vol_m3, capacidad_peso_kg, rendimiento_kml, activo)')
            .eq('activo', true)
            .order('nombre_completo'),
        supabase.from('sucursales').select('id, nombre, lat, lng, es_deposito').eq('activo', true).order('nombre'),
        supabase
            .from('rutas_diarias')
            .select(
                'id, estado, km_planificados, simulada, geojson_ruta, created_at, choferes(nombre_completo), vehiculos(patente), sucursales(nombre, lat, lng), ruta_paradas(orden, estado, motivo_fallo, entregado_at, pedido_id, lat_destino, lng_destino, pedidos(clientes(razon_social)))'
            )
            .eq('fecha', fecha)
            .order('created_at', { ascending: false }),
    ]);

    const yaEnRuta = new Set((enRutaRes.data ?? []).map((r: any) => Number(r.pedido_id)));

    const pedidos: PedidoPlanificable[] = (pedidosRes.data ?? [])
        .filter((p: any) => !yaEnRuta.has(Number(p.id)))
        .map((p: any) => {
            const cli = uno(p.clientes);
            let volumenM3 = 0;
            let pesoKg = 0;
            let sinMedidas = false;
            for (const d of p.detalle_pedidos ?? []) {
                const cantidad = aNumero(d.cantidad) ?? 0;
                const prod = uno(d.productos);
                const vol = aNumero(prod?.volumen_unitario_m3);
                const peso = aNumero(prod?.peso_unitario_kg);
                if (vol === null || peso === null) sinMedidas = true;
                volumenM3 += cantidad * (vol ?? 0);
                pesoKg += cantidad * (peso ?? 0);
            }
            return {
                id: Number(p.id),
                estado: String(p.estado),
                clienteNombre: cli?.razon_social ?? `Pedido #${p.id}`,
                direccion: cli?.direccion ?? null,
                conUbicacion: aNumero(cli?.lat) !== null && aNumero(cli?.lng) !== null,
                ventanaInicio: cli?.ventana_inicio ?? null,
                ventanaFin: cli?.ventana_fin ?? null,
                volumenM3,
                pesoKg,
                sinMedidas,
            };
        });

    const choferes: ChoferPlanificable[] = (choferesRes.data ?? []).map((c: any) => {
        const v = uno(c.vehiculos);
        return {
            id: Number(c.id),
            nombre: String(c.nombre_completo),
            turnoInicio: c.turno_inicio ?? null,
            turnoFin: c.turno_fin ?? null,
            vehiculo:
                v && v.activo !== false
                    ? {
                        id: Number(v.id),
                        patente: String(v.patente),
                        modelo: v.modelo ?? null,
                        capacidadM3: aNumero(v.capacidad_vol_m3),
                        capacidadKg: aNumero(v.capacidad_peso_kg),
                        rendimientoKml: aNumero(v.rendimiento_kml),
                    }
                    : null,
        };
    });

    const sucursales: SucursalPlanificable[] = (sucursalesRes.data ?? [])
        .filter((s: any) => aNumero(s.lat) !== null && aNumero(s.lng) !== null)
        .map((s: any) => ({
            id: Number(s.id),
            nombre: String(s.nombre),
            lat: Number(s.lat),
            lng: Number(s.lng),
            esDeposito: Boolean(s.es_deposito),
        }));

    const rutas: RutaGuardada[] = (rutasRes.data ?? []).map((r: any) => {
        const suc = uno(r.sucursales);
        const depLat = aNumero(suc?.lat);
        const depLng = aNumero(suc?.lng);
        const paradas: ParadaGuardada[] = ((r.ruta_paradas ?? []) as any[])
            .map((rp) => ({
                orden: Number(rp.orden),
                pedidoId: Number(rp.pedido_id),
                clienteNombre: uno(uno(rp.pedidos)?.clientes)?.razon_social ?? `Pedido #${rp.pedido_id}`,
                lat: aNumero(rp.lat_destino),
                lng: aNumero(rp.lng_destino),
                estado: ['entregado', 'fallido'].includes(rp.estado) ? rp.estado : 'pendiente',
                motivoFallo: rp.motivo_fallo ?? null,
                marcadaEn: rp.entregado_at ?? null,
            }))
            .sort((a, b) => a.orden - b.orden);
        return {
            id: Number(r.id),
            estado: String(r.estado),
            choferNombre: uno(r.choferes)?.nombre_completo ?? 'Sin chofer',
            patente: uno(r.vehiculos)?.patente ?? null,
            kmPlanificados: aNumero(r.km_planificados),
            simulada: Boolean(r.simulada),
            geojsonRuta: r.geojson_ruta && typeof r.geojson_ruta.type === 'string' ? r.geojson_ruta : null,
            deposito: suc && depLat !== null && depLng !== null ? { nombre: String(suc.nombre), lat: depLat, lng: depLng } : null,
            paradas,
        };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return (
        <PlanificadorRutas
            fecha={fecha}
            hoy={hoy}
            pedidos={pedidos}
            choferes={choferes}
            sucursales={sucursales}
            rutas={rutas}
        />
    );
}
