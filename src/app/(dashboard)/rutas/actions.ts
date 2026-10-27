'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/security/auth-guard';
import { obtenerParametrosOperacionales } from '@/lib/parametros';
import { calcularConOrs } from '@/lib/rutas/ors';
import { esFechaIso, hoyEnChile } from '@/lib/rutas/fecha';
import { horaASegundos, m3ADm3, segundosAHora, type ParadaEntrada } from '@/lib/rutas/optimizador';
import type { UserRole } from '@/constants/roles';
import type { RutaCalculada } from '@/types/planificador';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// ─── Configuración ──────────────────────────────────────────────────────────

/** Mismos roles que ven /rutas en el menú (src/constants/roles.ts). */
const ROLES_PLANIFICADOR: UserRole[] = ['admin', 'jefe_operaciones'];
/** ORS Directions admite hasta 50 puntos: depósito (ida y vuelta) + 48 paradas. */
const MAX_PARADAS = 48;
/** Tiempo de descarga estimado por cliente. */
const SERVICIO_SEG = 10 * 60;
const ESTADOS_PLANIFICABLES = ['pendiente', 'confirmado'];

type Resultado<T> = { success: true; data: T } | { success: false; error: string };

// ─── Helpers ────────────────────────────────────────────────────────────────

function aNumero(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

/** PostgREST puede devolver una relación como objeto o como arreglo. */
function uno<T>(valor: T | T[] | null | undefined): T | null {
    return Array.isArray(valor) ? (valor[0] ?? null) : (valor ?? null);
}

const esId = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

async function autorizar(): Promise<{ userId: string } | { error: string }> {
    const { user, role, error } = await requireAuth();
    if (error || !user || !role) return { error: error ?? 'No autenticado.' };
    if (!ROLES_PLANIFICADOR.includes(role)) return { error: 'Solo administración o jefatura de operaciones pueden planificar rutas.' };
    return { userId: user.id };
}

interface PedidoBD {
    id: number;
    estado: string;
    clientes: {
        razon_social: string;
        lat: unknown;
        lng: unknown;
        ventana_inicio: string | null;
        ventana_fin: string | null;
    } | null;
    detalle_pedidos: Array<{
        cantidad: unknown;
        productos: { volumen_unitario_m3: unknown; peso_unitario_kg: unknown } | null;
    }>;
}

interface VehiculoBD {
    id: number;
    capacidad_vol_m3: unknown;
    capacidad_peso_kg: unknown;
    rendimiento_kml: unknown;
    activo: boolean | null;
}

interface PedidoListo {
    id: number;
    clienteNombre: string;
    lat: number | null;
    lng: number | null;
    ventanaInicio: string | null;
    ventanaFin: string | null;
    volumenM3: number;
    pesoKg: number;
}

/**
 * Relee los pedidos desde la BD y verifica que se puedan planificar:
 * existen, están pendientes o confirmados y no están ya en otra ruta.
 */
async function cargarPedidos(
    supabase: ReturnType<typeof createClient>,
    ids: number[]
): Promise<{ pedidos: PedidoListo[] } | { error: string }> {
    const [pedidosRes, enRutaRes] = await Promise.all([
        supabase
            .from('pedidos')
            .select(
                'id, estado, clientes(razon_social, lat, lng, ventana_inicio, ventana_fin), detalle_pedidos(cantidad, productos(volumen_unitario_m3, peso_unitario_kg))'
            )
            .in('id', ids),
        supabase.from('ruta_paradas').select('pedido_id').in('pedido_id', ids).neq('estado', 'fallido'),
    ]);

    if (pedidosRes.error || enRutaRes.error) return { error: 'No se pudieron leer los pedidos.' };

    const yaEnRuta = new Set((enRutaRes.data ?? []).map((r) => Number(r.pedido_id)));
    const filas = (pedidosRes.data ?? []) as unknown as PedidoBD[];

    if (filas.length !== ids.length) return { error: 'Algún pedido seleccionado ya no existe.' };

    const pedidos: PedidoListo[] = [];
    for (const p of filas) {
        if (!ESTADOS_PLANIFICABLES.includes(p.estado)) {
            return { error: `El pedido #${p.id} está "${p.estado}" y no se puede planificar.` };
        }
        if (yaEnRuta.has(p.id)) return { error: `El pedido #${p.id} ya está asignado a una ruta.` };

        const cliente = uno(p.clientes);
        let volumenM3 = 0;
        let pesoKg = 0;
        for (const d of p.detalle_pedidos ?? []) {
            const cantidad = aNumero(d.cantidad) ?? 0;
            const prod = uno(d.productos);
            volumenM3 += cantidad * (aNumero(prod?.volumen_unitario_m3) ?? 0);
            pesoKg += cantidad * (aNumero(prod?.peso_unitario_kg) ?? 0);
        }

        pedidos.push({
            id: Number(p.id),
            clienteNombre: cliente?.razon_social ?? `Pedido #${p.id}`,
            lat: aNumero(cliente?.lat),
            lng: aNumero(cliente?.lng),
            ventanaInicio: cliente?.ventana_inicio ?? null,
            ventanaFin: cliente?.ventana_fin ?? null,
            volumenM3,
            pesoKg,
        });
    }
    return { pedidos };
}

// ─── CALCULAR RUTA (no guarda nada) ─────────────────────────────────────────

export async function calcularRuta(input: {
    sucursalId: number;
    choferId: number;
    pedidoIds: number[];
}): Promise<Resultado<RutaCalculada>> {
    const auth = await autorizar();
    if ('error' in auth) return { success: false, error: auth.error };

    const { sucursalId, choferId, pedidoIds } = input;
    if (!esId(sucursalId) || !esId(choferId)) return { success: false, error: 'Selecciona el punto de origen y el chofer.' };
    if (!Array.isArray(pedidoIds) || pedidoIds.length === 0 || !pedidoIds.every(esId)) {
        return { success: false, error: 'Selecciona al menos un pedido.' };
    }
    const ids = [...new Set(pedidoIds)];
    if (ids.length > MAX_PARADAS) return { success: false, error: `Máximo ${MAX_PARADAS} pedidos por ruta.` };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const [sucursalRes, choferRes, parametros, carga] = await Promise.all([
        supabase.from('sucursales').select('id, lat, lng, activo').eq('id', sucursalId).single(),
        supabase
            .from('choferes')
            .select('id, activo, turno_inicio, turno_fin, vehiculos(id, capacidad_vol_m3, capacidad_peso_kg, rendimiento_kml, activo)')
            .eq('id', choferId)
            .single(),
        obtenerParametrosOperacionales(supabase),
        cargarPedidos(supabase, ids),
    ]);

    const sucursal = sucursalRes.data;
    const depLat = aNumero(sucursal?.lat);
    const depLng = aNumero(sucursal?.lng);
    if (!sucursal?.activo || depLat === null || depLng === null) {
        return { success: false, error: 'El punto de origen no existe, está inactivo o no tiene coordenadas.' };
    }

    const chofer = choferRes.data;
    const vehiculo = uno((chofer?.vehiculos ?? null) as unknown as VehiculoBD | VehiculoBD[] | null);
    if (!chofer?.activo) return { success: false, error: 'El chofer no existe o está inactivo.' };
    if (!vehiculo || vehiculo.activo === false) {
        return { success: false, error: 'El chofer no tiene un vehículo activo asignado (Administración → Choferes).' };
    }
    const capacidadM3 = aNumero(vehiculo.capacidad_vol_m3);
    if (!capacidadM3) return { success: false, error: 'El vehículo no tiene capacidad de volumen registrada.' };
    const capacidadKg = aNumero(vehiculo.capacidad_peso_kg);

    if ('error' in carga) return { success: false, error: carga.error };

    const sinUbicacion = carga.pedidos.filter((p) => p.lat === null || p.lng === null);
    const ruteables = carga.pedidos.filter((p) => p.lat !== null && p.lng !== null);
    if (ruteables.length === 0) {
        return { success: false, error: 'Ninguno de los pedidos seleccionados tiene la ubicación del cliente.' };
    }

    const paradas: ParadaEntrada[] = ruteables.map((p) => ({
        pedidoId: p.id,
        ubicacion: { lat: p.lat as number, lng: p.lng as number },
        volumenDm3: m3ADm3(p.volumenM3),
        pesoKg: Math.ceil(p.pesoKg),
        ventana: p.ventanaInicio && p.ventanaFin ? [horaASegundos(p.ventanaInicio), horaASegundos(p.ventanaFin)] : null,
        servicioSeg: SERVICIO_SEG,
    }));

    const turnoInicio = (chofer.turno_inicio as string | null) ?? parametros.turnoInicioDefecto;
    const turnoFin = (chofer.turno_fin as string | null) ?? parametros.turnoFinDefecto;

    const calculo = await calcularConOrs(
        {
            deposito: { lat: depLat, lng: depLng },
            capacidadDm3: m3ADm3(capacidadM3),
            capacidadKg: capacidadKg !== null ? Math.floor(capacidadKg) : null,
            turno: [horaASegundos(turnoInicio), horaASegundos(turnoFin)],
        },
        paradas
    );

    const porId = new Map(ruteables.map((p) => [p.id, p]));
    const visitas = calculo.resultado.visitas.filter((v) => porId.has(v.pedidoId));
    const kmTotal = Math.round(calculo.resultado.distanciaM / 100) / 10;
    const rendimiento = aNumero(vehiculo.rendimiento_kml);
    const litros = rendimiento && rendimiento > 0 ? Math.round((kmTotal / rendimiento) * 100) / 100 : null;

    const advertencias = [...calculo.advertencias];
    if (calculo.resultado.sinAsignar.length > 0) {
        advertencias.push(
            `${calculo.resultado.sinAsignar.length} pedido(s) no se asignaron: no caben en el vehículo o su horario de recepción no es alcanzable.`
        );
    }
    if (sinUbicacion.length > 0) {
        advertencias.push(`${sinUbicacion.length} pedido(s) quedaron fuera porque el cliente no tiene ubicación.`);
    }

    return {
        success: true,
        data: {
            paradas: visitas.map((v, i) => {
                const p = porId.get(v.pedidoId) as PedidoListo;
                return {
                    pedidoId: p.id,
                    orden: i + 1,
                    clienteNombre: p.clienteNombre,
                    lat: p.lat as number,
                    lng: p.lng as number,
                    llegada: v.llegadaSeg !== null ? segundosAHora(v.llegadaSeg) : null,
                    kmAcumulados: v.distanciaAcumM !== null ? Math.round(v.distanciaAcumM / 100) / 10 : null,
                    volumenM3: p.volumenM3,
                };
            }),
            pedidosNoAsignados: calculo.resultado.sinAsignar,
            pedidosSinUbicacion: sinUbicacion.map((p) => p.id),
            kmTotal,
            duracionMin: Math.round(calculo.resultado.duracionSeg / 60),
            simulada: calculo.simulada,
            motivoRespaldo: calculo.motivoRespaldo,
            geojsonRuta: calculo.geojsonRuta,
            advertencias,
            volumenTotalM3: visitas.reduce((acc, v) => acc + (porId.get(v.pedidoId)?.volumenM3 ?? 0), 0),
            pesoTotalKg: visitas.reduce((acc, v) => acc + (porId.get(v.pedidoId)?.pesoKg ?? 0), 0),
            litrosEstimados: litros,
            costoCombustibleClp: litros !== null ? Math.round(litros * parametros.precioLitroDiesel) : null,
            precioLitroReferencia: parametros.precioLitroDiesel,
        },
    };
}

// ─── GUARDAR RUTA (PBI-04) ──────────────────────────────────────────────────

export async function guardarRuta(input: {
    fecha: string;
    sucursalId: number;
    choferId: number;
    ruta: RutaCalculada;
}): Promise<Resultado<{ rutaId: number }>> {
    const auth = await autorizar();
    if ('error' in auth) return { success: false, error: auth.error };

    const { fecha, sucursalId, choferId, ruta } = input;
    if (!esFechaIso(fecha)) return { success: false, error: 'Fecha no válida.' };
    if (fecha < hoyEnChile()) return { success: false, error: 'No se puede planificar una ruta en una fecha pasada.' };
    if (!esId(sucursalId) || !esId(choferId)) return { success: false, error: 'Punto de origen o chofer no válido.' };

    const paradas = ruta?.paradas ?? [];
    const ordenValido = paradas.every((p, i) => esId(p.pedidoId) && p.orden === i + 1);
    if (paradas.length === 0 || !ordenValido) return { success: false, error: 'La ruta no tiene paradas válidas.' };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: chofer } = await supabase
        .from('choferes')
        .select('id, activo, vehiculo_default_id')
        .eq('id', choferId)
        .single();
    if (!chofer?.activo || !chofer.vehiculo_default_id) {
        return { success: false, error: 'El chofer no está activo o no tiene vehículo asignado.' };
    }

    // Coordenadas, ventanas y volúmenes se releen de la BD: no se confía en el navegador.
    const carga = await cargarPedidos(supabase, paradas.map((p) => p.pedidoId));
    if ('error' in carga) return { success: false, error: carga.error };
    const porId = new Map(carga.pedidos.map((p) => [p.id, p]));
    if (carga.pedidos.some((p) => p.lat === null || p.lng === null)) {
        return { success: false, error: 'Hay pedidos sin ubicación en la ruta. Vuelve a calcularla.' };
    }

    const acotar = (n: unknown, max: number) => {
        const v = aNumero(n);
        return v === null ? null : Math.min(Math.max(v, 0), max);
    };
    const kmTotal = acotar(ruta.kmTotal, 9999) ?? 0;
    const litros = acotar(ruta.litrosEstimados, 9999);

    const { data: rutaBD, error: rutaError } = await supabase
        .from('rutas_diarias')
        .insert({
            fecha,
            sucursal_id: sucursalId,
            vehiculo_id: chofer.vehiculo_default_id,
            chofer_id: choferId,
            estado: 'planificada',
            km_planificados: Math.round(kmTotal * 100) / 100,
            duracion_s: Math.round((acotar(ruta.duracionMin, 24 * 60) ?? 0) * 60),
            volumen_total_m3: Math.round(carga.pedidos.reduce((a, p) => a + p.volumenM3, 0) * 10000) / 10000,
            bencina_proyectada_lts: litros,
            costo_bencina_proyectado: acotar(ruta.costoCombustibleClp, 99_999_999),
            precio_litro_referencia: acotar(ruta.precioLitroReferencia, 9999),
            // CHECK rutas_simulada_sin_geometria: una ruta simulada no lleva trazado
            simulada: Boolean(ruta.simulada),
            geojson_ruta: ruta.simulada ? null : (ruta.geojsonRuta ?? null),
            advertencias: (ruta.advertencias ?? []).filter((a) => typeof a === 'string').slice(0, 10),
            creado_por: auth.userId,
        })
        .select('id')
        .single();

    if (rutaError || !rutaBD) {
        if (rutaError?.code === '23505') {
            if (rutaError.message.includes('uq_ruta_chofer_fecha')) {
                return { success: false, error: 'Ese chofer ya tiene una ruta para esa fecha.' };
            }
            return { success: false, error: 'El vehículo de ese chofer ya tiene una ruta para esa fecha. Elige otra fecha u otro chofer.' };
        }
        if (rutaError?.code === '42501') return { success: false, error: 'No tienes permiso para guardar rutas.' };
        console.error('[rutas] insert rutas_diarias:', rutaError?.code, rutaError?.message);
        return { success: false, error: 'No se pudo guardar la ruta.' };
    }

    const { error: paradasError } = await supabase.from('ruta_paradas').insert(
        paradas.map((p) => {
            const pedido = porId.get(p.pedidoId) as PedidoListo;
            return {
                ruta_id: rutaBD.id,
                pedido_id: pedido.id,
                orden: p.orden,
                lat_destino: pedido.lat,
                lng_destino: pedido.lng,
                ventana_inicio: pedido.ventanaInicio,
                ventana_fin: pedido.ventanaFin,
                km_acumulados: acotar(p.kmAcumulados, 9999),
                volumen_parada_m3: Math.round(pedido.volumenM3 * 10000) / 10000,
            };
        })
    );

    if (paradasError) {
        // Sin transacción entre dos inserts: se deshace la ruta para no dejarla a medias.
        await supabase.from('rutas_diarias').delete().eq('id', rutaBD.id);
        console.error('[rutas] insert ruta_paradas:', paradasError.code, paradasError.message);
        if (paradasError.code === '23505') return { success: false, error: 'Hay un pedido repetido en la ruta.' };
        return { success: false, error: 'No se pudieron guardar las paradas; la ruta no se creó.' };
    }

    revalidatePath('/rutas');
    revalidatePath('/mi-ruta');
    return { success: true, data: { rutaId: Number(rutaBD.id) } };
}
