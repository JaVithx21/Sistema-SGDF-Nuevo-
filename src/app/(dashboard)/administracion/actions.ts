'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/security/auth-guard';
import { isUserRole, type UserRole } from '@/constants/roles';
import { validarValorParametro, type TipoParametro } from '@/lib/parametros';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ProveedorFormData {
    nombre: string;
    rut?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    activo: boolean;
}

interface ChoferFormData {
    usuario_id: string;
    nombre_completo: string;
    rut?: string;
    licencia_clase?: string;
    telefono?: string;
    vehiculo_default_id?: number | null;
    activo: boolean;
    /** Turno propio "HH:MM" — null = usar el turno por defecto del sistema. */
    turno_inicio?: string | null;
    turno_fin?: string | null;
}

interface VehiculoFormData {
    patente: string;
    modelo?: string;
    anno?: number | null;
    capacidad_vol_m3: number;
    capacidad_peso_kg?: number | null;
    rendimiento_kml: number;
    sucursal_id?: number | null;
    activo: boolean;
}

interface ActionResult {
    success: boolean;
    error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROVEEDORES
// ═══════════════════════════════════════════════════════════════════════════

export async function crearProveedor(data: ProveedorFormData): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('proveedores')
        .insert({
            nombre: data.nombre,
            rut: data.rut || null,
            telefono: data.telefono || null,
            email: data.email || null,
            direccion: data.direccion || null,
            activo: data.activo,
        });

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe un proveedor con ese RUT.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/administracion');
    revalidatePath('/movimientos');
    return { success: true };
}

export async function actualizarProveedor(
    id: number,
    data: ProveedorFormData
): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('proveedores')
        .update({
            nombre: data.nombre,
            rut: data.rut || null,
            telefono: data.telefono || null,
            email: data.email || null,
            direccion: data.direccion || null,
            activo: data.activo,
        })
        .eq('id', id);

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe un proveedor con ese RUT.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/administracion');
    revalidatePath('/movimientos');
    return { success: true };
}

export async function desactivarProveedor(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('proveedores')
        .update({ activo: false })
        .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/administracion');
    return { success: true };
}

export async function reactivarProveedor(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('proveedores')
        .update({ activo: true })
        .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/administracion');
    return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  USUARIOS (Roles) — SOLO ADMIN
// ═══════════════════════════════════════════════════════════════════════════

export async function cambiarRolUsuario(
    userId: string,
    nuevoRol: UserRole
): Promise<ActionResult> {
    // ⚠️ Operación crítica: SOLO admins pueden cambiar roles
    const { user, error: authError } = await requireAuth('admin');
    if (!user) return { success: false, error: authError ?? 'Sin autorización.' };

    // OWASP A03: validar el rol en runtime — el tipo de TS no protege nada aquí
    if (!isUserRole(nuevoRol)) {
        return { success: false, error: 'Rol no válido.' };
    }

    // Prevenir que un admin se quite su propio rol
    if (user.id === userId && nuevoRol !== 'admin') {
        return { success: false, error: 'No puede cambiar su propio rol de administrador.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('usuarios')
        .update({ rol: nuevoRol })
        .eq('id', userId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/administracion');
    return { success: true };
}

export async function crearUsuario(data: { nombre: string; email: string; rol: UserRole }): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    if (!isUserRole(data.rol)) {
        return { success: false, error: 'Rol no válido.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('usuarios')
        .insert({
            nombre: data.nombre,
            email: data.email,
            rol: data.rol,
        });

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe un usuario con este correo electrónico.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/administracion');
    return { success: true };
}

export async function actualizarUsuario(id: string, data: { nombre: string; email: string; rol: UserRole }): Promise<ActionResult> {
    const { user, error: authError } = await requireAuth('admin');
    if (!user) return { success: false, error: authError ?? 'Sin autorización.' };

    if (!isUserRole(data.rol)) {
        return { success: false, error: 'Rol no válido.' };
    }

    // Mismo resguardo que cambiarRolUsuario: editar los datos de un usuario
    // no debe ser una vía alternativa para que un admin se degrade a sí mismo.
    if (user.id === id && data.rol !== 'admin') {
        return { success: false, error: 'No puede cambiar su propio rol de administrador.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('usuarios')
        .update({
            nombre: data.nombre,
            email: data.email,
            rol: data.rol,
        })
        .eq('id', id);

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe otro usuario con este correo electrónico.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/administracion');
    return { success: true };
}

export async function eliminarUsuario(id: string): Promise<ActionResult> {
    const { user, error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    if (user?.id === id) {
        return { success: false, error: 'No puede eliminar su propio usuario administrador.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/administracion');
    return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHOFERES (perfil operacional) — SOLO ADMIN
//
//  `choferes` está separada de `usuarios` para no violar SRP: `usuarios`
//  gobierna el acceso al sistema (rol), `choferes` los datos operacionales
//  (licencia, vehículo asignado). Se vinculan 1:1 vía `usuario_id`.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verifica que el usuario a vincular exista y tenga rol 'chofer'.
 * Evita perfiles de chofer huérfanos o asignados a un vendedor/admin,
 * que romperían la vista /mi-ruta y el selector de rutas.
 */
async function validarUsuarioChofer(
    supabase: ReturnType<typeof createClient>,
    usuarioId: string
): Promise<string | null> {
    const { data: perfil } = await supabase
        .from('usuarios')
        .select('rol')
        .eq('id', usuarioId)
        .single();

    if (!perfil) return 'El usuario seleccionado no existe.';
    if (perfil.rol !== 'chofer') {
        return 'El usuario debe tener el rol "Chofer" antes de crear su perfil de conducción.';
    }
    return null;
}

/**
 * El turno es opcional, pero si se define debe estar completo y ser coherente.
 * Refleja la constraint chk_choferes_turno_valido de la BD.
 */
function validarTurno(data: ChoferFormData): string | null {
    const { turno_inicio, turno_fin } = data;
    if (!turno_inicio && !turno_fin) return null;
    if (!turno_inicio || !turno_fin) {
        return 'Para definir un turno debes indicar hora de inicio y de término.';
    }
    if (turno_inicio >= turno_fin) {
        return 'La hora de inicio del turno debe ser anterior a la de término.';
    }
    return null;
}

export async function crearChofer(data: ChoferFormData): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const validacionError = await validarUsuarioChofer(supabase, data.usuario_id);
    if (validacionError) return { success: false, error: validacionError };

    const turnoError = validarTurno(data);
    if (turnoError) return { success: false, error: turnoError };

    const { error } = await supabase
        .from('choferes')
        .insert({
            usuario_id: data.usuario_id,
            nombre_completo: data.nombre_completo,
            rut: data.rut || null,
            licencia_clase: data.licencia_clase || null,
            telefono: data.telefono || null,
            vehiculo_default_id: data.vehiculo_default_id || null,
            turno_inicio: data.turno_inicio || null,
            turno_fin: data.turno_fin || null,
            activo: data.activo,
        });

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Este usuario ya tiene un perfil de chofer registrado.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/administracion');
    revalidatePath('/rutas');
    return { success: true };
}

export async function actualizarChofer(id: number, data: ChoferFormData): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const validacionError = await validarUsuarioChofer(supabase, data.usuario_id);
    if (validacionError) return { success: false, error: validacionError };

    const turnoError = validarTurno(data);
    if (turnoError) return { success: false, error: turnoError };

    const { error } = await supabase
        .from('choferes')
        .update({
            usuario_id: data.usuario_id,
            nombre_completo: data.nombre_completo,
            rut: data.rut || null,
            licencia_clase: data.licencia_clase || null,
            telefono: data.telefono || null,
            vehiculo_default_id: data.vehiculo_default_id || null,
            turno_inicio: data.turno_inicio || null,
            turno_fin: data.turno_fin || null,
            activo: data.activo,
        })
        .eq('id', id);

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Este usuario ya tiene un perfil de chofer registrado.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/administracion');
    revalidatePath('/rutas');
    return { success: true };
}

/**
 * Baja lógica. No se elimina el registro porque `rutas_diarias.chofer_id`
 * lo referencia: borrarlo rompería el historial de rutas y sus liquidaciones.
 */
export async function desactivarChofer(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('choferes')
        .update({ activo: false })
        .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/administracion');
    revalidatePath('/rutas');
    return { success: true };
}

export async function reactivarChofer(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('choferes')
        .update({ activo: true })
        .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/administracion');
    revalidatePath('/rutas');
    return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  VEHÍCULOS (flota) — SOLO ADMIN
//
//  `capacidad_vol_m3` y `rendimiento_kml` son restricciones duras del solver
//  VROOM y la base del costo de combustible: por eso se validan > 0.
// ═══════════════════════════════════════════════════════════════════════════

function validarVehiculo(data: VehiculoFormData): string | null {
    if (!data.patente.trim()) return 'La patente es obligatoria.';
    if (!(data.capacidad_vol_m3 > 0)) {
        return 'La capacidad de volumen debe ser mayor a 0 m³.';
    }
    if (!(data.rendimiento_kml > 0)) {
        return 'El rendimiento debe ser mayor a 0 km/L.';
    }
    if (data.capacidad_peso_kg != null && data.capacidad_peso_kg < 0) {
        return 'La capacidad de peso no puede ser negativa.';
    }
    const annoActual = new Date().getFullYear();
    if (data.anno != null && (data.anno < 1950 || data.anno > annoActual + 1)) {
        return `El año debe estar entre 1950 y ${annoActual + 1}.`;
    }
    return null;
}

/** La patente es la identidad del vehículo: se normaliza para evitar duplicados. */
function normalizarPatente(patente: string): string {
    return patente.trim().toUpperCase();
}

export async function crearVehiculo(data: VehiculoFormData): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const validacionError = validarVehiculo(data);
    if (validacionError) return { success: false, error: validacionError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('vehiculos')
        .insert({
            patente: normalizarPatente(data.patente),
            modelo: data.modelo || null,
            anno: data.anno ?? null,
            capacidad_vol_m3: data.capacidad_vol_m3,
            capacidad_peso_kg: data.capacidad_peso_kg ?? null,
            rendimiento_kml: data.rendimiento_kml,
            sucursal_id: data.sucursal_id ?? null,
            activo: data.activo,
        });

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe un vehículo con esa patente.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/administracion');
    revalidatePath('/rutas');
    return { success: true };
}

export async function actualizarVehiculo(id: number, data: VehiculoFormData): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const validacionError = validarVehiculo(data);
    if (validacionError) return { success: false, error: validacionError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('vehiculos')
        .update({
            patente: normalizarPatente(data.patente),
            modelo: data.modelo || null,
            anno: data.anno ?? null,
            capacidad_vol_m3: data.capacidad_vol_m3,
            capacidad_peso_kg: data.capacidad_peso_kg ?? null,
            rendimiento_kml: data.rendimiento_kml,
            sucursal_id: data.sucursal_id ?? null,
            activo: data.activo,
        })
        .eq('id', id);

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe un vehículo con esa patente.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/administracion');
    revalidatePath('/rutas');
    return { success: true };
}

/**
 * Baja lógica. No se elimina el registro porque `rutas_diarias.vehiculo_id`
 * lo referencia: borrarlo rompería el historial de rutas y liquidaciones.
 */
export async function desactivarVehiculo(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('vehiculos')
        .update({ activo: false })
        .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/administracion');
    revalidatePath('/rutas');
    return { success: true };
}

export async function reactivarVehiculo(id: number): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('vehiculos')
        .update({ activo: true })
        .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/administracion');
    revalidatePath('/rutas');
    return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  PARÁMETROS DEL SISTEMA — SOLO ADMIN
// ═══════════════════════════════════════════════════════════════════════════

export async function actualizarParametro(clave: string, valor: string): Promise<ActionResult> {
    const { error: authError } = await requireAuth('admin');
    if (authError) return { success: false, error: authError };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // El tipo se lee de la BD, no del cliente: es lo que define qué es válido.
    const { data: parametro } = await supabase
        .from('parametros_sistema')
        .select('tipo')
        .eq('clave', clave)
        .single();

    if (!parametro) return { success: false, error: 'El parámetro no existe.' };

    const validacionError = validarValorParametro(parametro.tipo as TipoParametro, valor);
    if (validacionError) return { success: false, error: validacionError };

    const { error } = await supabase
        .from('parametros_sistema')
        .update({ valor })
        .eq('clave', clave);

    if (error) return { success: false, error: error.message };

    revalidatePath('/administracion');
    // El planificador proyecta costos con estos valores.
    revalidatePath('/rutas');
    return { success: true };
}
