import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { AdministracionClient } from '@/components/administracion/AdministracionClient';
import type {
    ProveedorData,
    UsuarioData,
    ChoferData,
    VehiculoData,
    SucursalOption,
    ParametroData,
} from '@/components/administracion/AdministracionClient';
import { obtenerParametrosOperacionales } from '@/lib/parametros';

/** PostgREST devuelve `numeric` como string: se normaliza a number | null. */
function aNumero(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

/** La BD guarda "HH:MM:SS"; la UI muestra "HH:MM". */
function aHoraCorta(hora: string): string {
    return hora.slice(0, 5);
}

export default async function AdministracionPage() {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // ─── Fetch paralelo (evitar waterfalls) ────────────────────────────

    const [proveedoresRes, usuariosRes, choferesRes, vehiculosRes, sucursalesRes, parametrosRes, operacionales] =
        await Promise.all([
            supabase
                .from('proveedores')
                .select('id, nombre, rut, telefono, email, direccion, activo')
                .order('nombre', { ascending: true }),
            supabase
                .from('usuarios')
                .select('id, nombre, email, rol, created_at')
                .order('nombre', { ascending: true }),
            supabase
                .from('choferes')
                .select('id, usuario_id, nombre_completo, rut, licencia_clase, telefono, vehiculo_default_id, activo, turno_inicio, turno_fin')
                .order('nombre_completo', { ascending: true }),
            supabase
                .from('vehiculos')
                .select('id, patente, modelo, anno, capacidad_vol_m3, capacidad_peso_kg, rendimiento_kml, sucursal_id, activo')
                .order('patente', { ascending: true }),
            supabase
                .from('sucursales')
                .select('id, nombre')
                .order('nombre', { ascending: true }),
            supabase
                .from('parametros_sistema')
                .select('clave, valor, descripcion, tipo')
                .order('clave', { ascending: true }),
            obtenerParametrosOperacionales(supabase),
        ]);

    // ─── Transformar a datos serializables ─────────────────────────────

    const proveedores: ProveedorData[] = (proveedoresRes.data ?? []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        rut: p.rut,
        telefono: p.telefono,
        email: p.email,
        direccion: p.direccion,
        activo: p.activo,
    }));

    const usuarios: UsuarioData[] = (usuariosRes.data ?? []).map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol as UsuarioData['rol'],
        created_at: u.created_at,
    }));

    const sucursales: SucursalOption[] = (sucursalesRes.data ?? []).map((s) => ({
        id: s.id,
        nombre: s.nombre,
    }));

    // Los joins se resuelven aquí y no con embedding de PostgREST: así no
    // dependemos del nombre de las foreign keys, que no están versionadas.
    const sucursalPorId = new Map(sucursales.map((s) => [s.id, s.nombre]));

    const vehiculos: VehiculoData[] = (vehiculosRes.data ?? []).map((v) => ({
        id: v.id,
        patente: v.patente,
        modelo: v.modelo,
        anno: aNumero(v.anno),
        capacidad_vol_m3: aNumero(v.capacidad_vol_m3),
        capacidad_peso_kg: aNumero(v.capacidad_peso_kg),
        rendimiento_kml: aNumero(v.rendimiento_kml),
        sucursal_id: v.sucursal_id,
        sucursal_nombre: v.sucursal_id != null ? sucursalPorId.get(v.sucursal_id) ?? null : null,
        activo: v.activo,
    }));

    const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));
    const vehiculoPorId = new Map(vehiculos.map((v) => [v.id, v]));

    const choferes: ChoferData[] = (choferesRes.data ?? []).map((c) => {
        const usuario = usuarioPorId.get(c.usuario_id);
        const vehiculo = c.vehiculo_default_id != null ? vehiculoPorId.get(c.vehiculo_default_id) : undefined;
        return {
            id: c.id,
            usuario_id: c.usuario_id,
            usuario_nombre: usuario?.nombre ?? '—',
            usuario_email: usuario?.email ?? null,
            nombre_completo: c.nombre_completo,
            rut: c.rut,
            licencia_clase: c.licencia_clase,
            telefono: c.telefono,
            vehiculo_default_id: c.vehiculo_default_id,
            vehiculo_patente: vehiculo?.patente ?? null,
            vehiculo_modelo: vehiculo?.modelo ?? null,
            activo: c.activo,
            turno_inicio: c.turno_inicio,
            turno_fin: c.turno_fin,
        };
    });

    const parametros: ParametroData[] = (parametrosRes.data ?? []).map((p) => ({
        clave: p.clave,
        valor: p.valor,
        descripcion: p.descripcion,
        tipo: p.tipo as ParametroData['tipo'],
    }));

    const turnoDefecto = {
        inicio: aHoraCorta(operacionales.turnoInicioDefecto),
        fin: aHoraCorta(operacionales.turnoFinDefecto),
    };

    // ─── Render: Server → Client boundary ──────────────────────────────

    return (
        <AdministracionClient
            proveedores={proveedores}
            usuarios={usuarios}
            choferes={choferes}
            vehiculos={vehiculos}
            sucursales={sucursales}
            parametros={parametros}
            turnoDefecto={turnoDefecto}
        />
    );
}
