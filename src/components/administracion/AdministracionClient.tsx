'use client';

import { useState, useMemo, useTransition } from 'react';
import {
    ShieldAlert,
    Search,
    Plus,
    UserPlus,
    Edit,
    UserMinus,
    UserCheck,
    Mail,
    Phone,
    MapPin,
    Key,
    Truck,
    IdCard,
    AlertCircle,
} from 'lucide-react';
import { ProveedorModal } from '@/components/administracion/ProveedorModal';
import { ConfirmDeleteModal } from '@/components/inventario/ConfirmDeleteModal';
import {
    crearProveedor,
    actualizarProveedor,
    desactivarProveedor,
    reactivarProveedor,
    cambiarRolUsuario,
    crearUsuario,
    actualizarUsuario,
    eliminarUsuario,
    crearChofer,
    actualizarChofer,
    desactivarChofer,
    reactivarChofer,
    crearVehiculo,
    actualizarVehiculo,
    desactivarVehiculo,
    reactivarVehiculo,
} from '@/app/(dashboard)/administracion/actions';
import { UsuarioModal } from '@/components/administracion/UsuarioModal';
import { ChoferModal } from '@/components/administracion/ChoferModal';
import { VehiculoModal } from '@/components/administracion/VehiculoModal';
import { ParametrosPanel } from '@/components/administracion/ParametrosPanel';
import { USER_ROLES, ROLE_LABELS, type UserRole } from '@/constants/roles';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProveedorData {
    id: number;
    nombre: string;
    rut: string | null;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    activo: boolean;
}

export interface UsuarioData {
    id: string;
    nombre: string;
    email: string | null;
    rol: UserRole;
    created_at: string;
}

export interface ChoferData {
    id: number;
    usuario_id: string;
    usuario_nombre: string;
    usuario_email: string | null;
    nombre_completo: string;
    rut: string | null;
    licencia_clase: string | null;
    telefono: string | null;
    vehiculo_default_id: number | null;
    vehiculo_patente: string | null;
    vehiculo_modelo: string | null;
    activo: boolean;
    /** Turno propio "HH:MM:SS" — null = usar el turno por defecto del sistema. */
    turno_inicio: string | null;
    turno_fin: string | null;
}

export interface UsuarioChoferOption {
    id: string;
    nombre: string;
    email: string | null;
}

export interface VehiculoOption {
    id: number;
    patente: string;
    modelo: string | null;
}

export interface VehiculoData {
    id: number;
    patente: string;
    modelo: string | null;
    anno: number | null;
    capacidad_vol_m3: number | null;
    capacidad_peso_kg: number | null;
    rendimiento_kml: number | null;
    sucursal_id: number | null;
    sucursal_nombre: string | null;
    activo: boolean;
}

export interface SucursalOption {
    id: number;
    nombre: string;
}

export interface ParametroData {
    clave: string;
    valor: string;
    descripcion: string | null;
    tipo: 'numero' | 'texto' | 'booleano' | 'hora';
}

interface AdminClientProps {
    proveedores: ProveedorData[];
    usuarios: UsuarioData[];
    choferes: ChoferData[];
    vehiculos: VehiculoData[];
    sucursales: SucursalOption[];
    parametros: ParametroData[];
    turnoDefecto: { inicio: string; fin: string };
}

type Tab = 'proveedores' | 'usuarios' | 'choferes' | 'vehiculos' | 'parametros';

// ─── Sub-components ─────────────────────────────────────────────────────────

type BadgeVariant =
    | 'default'
    | 'success'
    | 'danger'
    | 'primary'
    | 'vendedor'
    | 'gerente'
    | 'chofer'
    | 'jefe_operaciones';

const BADGE_STYLES: Record<BadgeVariant, string> = {
    default: 'bg-slate-100 text-slate-600 border-slate-200',
    success: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    danger: 'bg-rose-50 text-rose-600 border-rose-100',
    primary: 'bg-indigo-50 text-indigo-600 border-indigo-100', // admin
    vendedor: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    gerente: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100',
    chofer: 'bg-amber-50 text-amber-600 border-amber-100',
    jefe_operaciones: 'bg-sky-50 text-sky-600 border-sky-100',
};

/** Un estilo por rol — así ningún rol nuevo queda sin badge visible. */
const ROLE_BADGE_VARIANT: Record<UserRole, BadgeVariant> = {
    admin: 'primary',
    gerente: 'gerente',
    jefe_operaciones: 'jefe_operaciones',
    vendedor: 'vendedor',
    chofer: 'chofer',
};

function Badge({
    children,
    variant = 'default',
}: {
    children: React.ReactNode;
    variant?: BadgeVariant;
}) {
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight border ${BADGE_STYLES[variant]}`}>
            {children}
        </span>
    );
}

function formatFecha(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function AdministracionClient({
    proveedores,
    usuarios,
    choferes,
    vehiculos,
    sucursales,
    parametros,
    turnoDefecto,
}: AdminClientProps) {
    const [activeTab, setActiveTab] = useState<Tab>('proveedores');
    const [searchQuery, setSearchQuery] = useState('');

    // --- Proveedor modals ---
    const [showProveedorModal, setShowProveedorModal] = useState(false);
    const [editingProveedor, setEditingProveedor] = useState<ProveedorData | null>(null);
    const [deactivatingProveedor, setDeactivatingProveedor] = useState<ProveedorData | null>(null);

    // --- Rol change & User management ---
    const [changingRolUser, setChangingRolUser] = useState<UsuarioData | null>(null);
    const [showUsuarioModal, setShowUsuarioModal] = useState(false);
    const [editingUsuario, setEditingUsuario] = useState<UsuarioData | null>(null);
    const [deletingUsuario, setDeletingUsuario] = useState<UsuarioData | null>(null);

    // --- Chofer management ---
    const [showChoferModal, setShowChoferModal] = useState(false);
    const [editingChofer, setEditingChofer] = useState<ChoferData | null>(null);
    const [deactivatingChofer, setDeactivatingChofer] = useState<ChoferData | null>(null);

    // --- Vehículo management ---
    const [showVehiculoModal, setShowVehiculoModal] = useState(false);
    const [editingVehiculo, setEditingVehiculo] = useState<VehiculoData | null>(null);
    const [deactivatingVehiculo, setDeactivatingVehiculo] = useState<VehiculoData | null>(null);

    const [isPending, startTransition] = useTransition();

    // --- Filtered lists ---
    const filteredProveedores = useMemo(() => {
        if (!searchQuery.trim()) return proveedores;
        const q = searchQuery.toLowerCase();
        return proveedores.filter(
            (p) => p.nombre.toLowerCase().includes(q) || (p.rut && p.rut.includes(searchQuery))
        );
    }, [proveedores, searchQuery]);

    const filteredUsuarios = useMemo(() => {
        if (!searchQuery.trim()) return usuarios;
        const q = searchQuery.toLowerCase();
        return usuarios.filter(
            (u) => u.nombre.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q))
        );
    }, [usuarios, searchQuery]);

    const filteredChoferes = useMemo(() => {
        if (!searchQuery.trim()) return choferes;
        const q = searchQuery.toLowerCase();
        return choferes.filter(
            (c) =>
                c.nombre_completo.toLowerCase().includes(q) ||
                (c.rut && c.rut.toLowerCase().includes(q)) ||
                (c.vehiculo_patente && c.vehiculo_patente.toLowerCase().includes(q))
        );
    }, [choferes, searchQuery]);

    const filteredVehiculos = useMemo(() => {
        if (!searchQuery.trim()) return vehiculos;
        const q = searchQuery.toLowerCase();
        return vehiculos.filter(
            (v) =>
                v.patente.toLowerCase().includes(q) ||
                (v.modelo && v.modelo.toLowerCase().includes(q)) ||
                (v.sucursal_nombre && v.sucursal_nombre.toLowerCase().includes(q))
        );
    }, [vehiculos, searchQuery]);

    // Usuarios con rol 'chofer' que aún no tienen perfil operacional creado
    const usuariosChoferSinPerfil = useMemo<UsuarioChoferOption[]>(() => {
        const conPerfil = new Set(choferes.map((c) => c.usuario_id));
        return usuarios
            .filter((u) => u.rol === 'chofer' && !conPerfil.has(u.id))
            .map((u) => ({ id: u.id, nombre: u.nombre, email: u.email }));
    }, [usuarios, choferes]);

    // Solo los vehículos activos pueden asignarse como default de un chofer
    const vehiculosActivos = useMemo<VehiculoOption[]>(
        () =>
            vehiculos
                .filter((v) => v.activo)
                .map((v) => ({ id: v.id, patente: v.patente, modelo: v.modelo })),
        [vehiculos]
    );

    // --- Handlers ---
    const handleOpenCreateProveedor = () => {
        setEditingProveedor(null);
        setShowProveedorModal(true);
    };

    const handleOpenEditProveedor = (p: ProveedorData) => {
        setEditingProveedor(p);
        setShowProveedorModal(true);
    };

    const handleCloseProveedorModal = () => {
        setShowProveedorModal(false);
        setEditingProveedor(null);
    };

    const handleOpenCreateUsuario = () => {
        setEditingUsuario(null);
        setShowUsuarioModal(true);
    };

    const handleOpenEditUsuario = (u: UsuarioData) => {
        setEditingUsuario(u);
        setShowUsuarioModal(true);
    };

    const handleCloseUsuarioModal = () => {
        setShowUsuarioModal(false);
        setEditingUsuario(null);
    };

    const handleChangeRol = (user: UsuarioData, nuevoRol: UserRole) => {
        startTransition(async () => {
            await cambiarRolUsuario(user.id, nuevoRol);
            setChangingRolUser(null);
        });
    };

    const handleOpenCreateChofer = () => {
        setEditingChofer(null);
        setShowChoferModal(true);
    };

    const handleOpenEditChofer = (c: ChoferData) => {
        setEditingChofer(c);
        setShowChoferModal(true);
    };

    const handleCloseChoferModal = () => {
        setShowChoferModal(false);
        setEditingChofer(null);
    };

    const handleOpenCreateVehiculo = () => {
        setEditingVehiculo(null);
        setShowVehiculoModal(true);
    };

    const handleOpenEditVehiculo = (v: VehiculoData) => {
        setEditingVehiculo(v);
        setShowVehiculoModal(true);
    };

    const handleCloseVehiculoModal = () => {
        setShowVehiculoModal(false);
        setEditingVehiculo(null);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header & Security Banner */}
            <div className="space-y-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                        Administración del Sistema
                    </h2>
                </div>

                <div className="flex items-start gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <div className="p-2 bg-white rounded-lg text-blue-600 shadow-sm">
                        <ShieldAlert size={20} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-blue-900">Zona de Configuración Avanzada</p>
                        <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                            Los cambios realizados aquí afectan el comportamiento global del sistema y los accesos del personal. Proceda con precaución.
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex border-b border-slate-200">
                <button
                    onClick={() => { setActiveTab('proveedores'); setSearchQuery(''); }}
                    className={`px-8 py-4 text-sm font-bold transition-all border-b-2 outline-none ${activeTab === 'proveedores' ? 'border-[#005088] text-[#005088]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    Proveedores
                </button>
                <button
                    onClick={() => { setActiveTab('usuarios'); setSearchQuery(''); }}
                    className={`px-8 py-4 text-sm font-bold transition-all border-b-2 outline-none ${activeTab === 'usuarios' ? 'border-[#005088] text-[#005088]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    Usuarios y Accesos
                </button>
                <button
                    onClick={() => { setActiveTab('choferes'); setSearchQuery(''); }}
                    className={`px-8 py-4 text-sm font-bold transition-all border-b-2 outline-none ${activeTab === 'choferes' ? 'border-[#005088] text-[#005088]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    Choferes
                </button>
                <button
                    onClick={() => { setActiveTab('vehiculos'); setSearchQuery(''); }}
                    className={`px-8 py-4 text-sm font-bold transition-all border-b-2 outline-none ${activeTab === 'vehiculos' ? 'border-[#005088] text-[#005088]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    Flota de Vehículos
                </button>
                <button
                    onClick={() => { setActiveTab('parametros'); setSearchQuery(''); }}
                    className={`px-8 py-4 text-sm font-bold transition-all border-b-2 outline-none ${activeTab === 'parametros' ? 'border-[#005088] text-[#005088]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    Parámetros
                </button>
            </div>

            {/* ═══════════════ TAB: PROVEEDORES ═══════════════ */}
            {activeTab === 'proveedores' && (
                <div className="space-y-6">
                    {/* Toolbar */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar por Razón Social o RUT..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-[#005088] outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={handleOpenCreateProveedor}
                            className="bg-[#005088] text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#003d66] transition-all shadow-lg shadow-[#005088]/20 active:scale-95 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005088]"
                        >
                            <Plus size={18} />
                            Nuevo Proveedor
                        </button>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <th className="px-6 py-4">Razón Social / RUT</th>
                                        <th className="px-6 py-4">Contacto</th>
                                        <th className="px-6 py-4">Dirección</th>
                                        <th className="px-6 py-4">Estado</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredProveedores.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center">
                                                <Plus size={40} className="mx-auto mb-3 text-slate-300" />
                                                <p className="text-sm font-semibold text-slate-400">No se encontraron proveedores</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredProveedores.map((prov) => (
                                            <tr key={prov.id} className="hover:bg-slate-50/30 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-900 group-hover:text-[#005088] transition-colors">{prov.nombre}</span>
                                                        <span className="text-[11px] text-slate-500 font-medium">{prov.rut || 'Sin RUT'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        {prov.email && (
                                                            <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                                                                <Mail size={12} className="text-slate-400" />
                                                                {prov.email}
                                                            </div>
                                                        )}
                                                        {prov.telefono && (
                                                            <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                                                                <Phone size={12} className="text-slate-400" />
                                                                {prov.telefono}
                                                            </div>
                                                        )}
                                                        {!prov.email && !prov.telefono && <span className="text-[11px] text-slate-400">—</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {prov.direccion ? (
                                                        <div className="flex items-start gap-2 text-[11px] text-slate-500 max-w-[200px]">
                                                            <MapPin size={12} className="text-slate-300 mt-0.5 shrink-0" />
                                                            <span className="line-clamp-2">{prov.direccion}</span>
                                                        </div>
                                                    ) : <span className="text-[11px] text-slate-400">—</span>}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {prov.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="danger">Inactivo</Badge>}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button onClick={() => handleOpenEditProveedor(prov)} title="Editar" className="p-2 rounded-lg text-slate-400 hover:text-[#005088] hover:bg-slate-100 transition-all"><Edit size={18} /></button>
                                                        {prov.activo ? (
                                                            <button onClick={() => setDeactivatingProveedor(prov)} title="Desactivar" className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"><UserMinus size={18} /></button>
                                                        ) : (
                                                            <button onClick={() => reactivarProveedor(prov.id)} title="Reactivar" className="p-2 rounded-lg text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all"><UserCheck size={18} /></button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                            <p className="text-xs text-slate-400 font-medium">Mostrando {filteredProveedores.length} de {proveedores.length} proveedores</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ TAB: USUARIOS ═══════════════ */}
            {activeTab === 'usuarios' && (
                <div className="space-y-6">
                    {/* Toolbar */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-[#005088] outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={handleOpenCreateUsuario}
                            className="bg-[#005088] text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#003d66] transition-all shadow-lg shadow-[#005088]/20 active:scale-95 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005088]"
                        >
                            <UserPlus size={18} />
                            Nuevo Empleado
                        </button>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <th className="px-6 py-4">Empleado</th>
                                        <th className="px-6 py-4">Rol en el Sistema</th>
                                        <th className="px-6 py-4">Fecha de Creación</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredUsuarios.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center">
                                                <UserPlus size={40} className="mx-auto mb-3 text-slate-300" />
                                                <p className="text-sm font-semibold text-slate-400">No se encontraron usuarios</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUsuarios.map((user) => (
                                            <tr key={user.id} className="hover:bg-slate-50/30 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-sm font-black text-[#005088]">
                                                            {user.nombre.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-slate-900">{user.nombre}</span>
                                                            <span className="text-[11px] text-slate-500">{user.email || '—'}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {changingRolUser?.id === user.id ? (
                                                        <select
                                                            defaultValue={user.rol}
                                                            disabled={isPending}
                                                            onChange={(e) => handleChangeRol(user, e.target.value as UserRole)}
                                                            onBlur={() => setChangingRolUser(null)}
                                                            autoFocus
                                                            className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#005088] appearance-none"
                                                        >
                                                            {USER_ROLES.map((rol) => (
                                                                <option key={rol} value={rol}>
                                                                    {ROLE_LABELS[rol]}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <Badge variant={ROLE_BADGE_VARIANT[user.rol] ?? 'default'}>
                                                            {ROLE_LABELS[user.rol] ?? user.rol}
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-sm font-medium text-slate-500">
                                                    {formatFecha(user.created_at)}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => handleOpenEditUsuario(user)}
                                                            title="Editar Datos"
                                                            className="p-2 rounded-lg text-slate-400 hover:text-[#005088] hover:bg-slate-100 transition-all"
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => setChangingRolUser(user)}
                                                            title="Cambiar Rol Rápidamente"
                                                            className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                                                        >
                                                            <Key size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeletingUsuario(user)}
                                                            title="Revocar Acceso (Eliminar)"
                                                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                                                        >
                                                            <UserMinus size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                            <p className="text-xs text-slate-400 font-medium">Mostrando {filteredUsuarios.length} de {usuarios.length} usuarios registrados</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ TAB: CHOFERES ═══════════════ */}
            {activeTab === 'choferes' && (
                <div className="space-y-6">
                    {/* Aviso: usuarios con rol chofer sin perfil operacional */}
                    {usuariosChoferSinPerfil.length > 0 && (
                        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                            <div className="p-2 bg-white rounded-lg text-amber-600 shadow-sm">
                                <AlertCircle size={20} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-amber-900">
                                    {usuariosChoferSinPerfil.length} usuario(s) con rol Chofer sin perfil de conducción
                                </p>
                                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                                    {usuariosChoferSinPerfil.map((u) => u.nombre).join(', ')} — sin perfil no aparecen
                                    en el planificador de rutas ni pueden ver sus entregas del día.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Toolbar */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre, RUT o patente..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-[#005088] outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={handleOpenCreateChofer}
                            className="bg-[#005088] text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#003d66] transition-all shadow-lg shadow-[#005088]/20 active:scale-95 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005088]"
                        >
                            <Plus size={18} />
                            Nuevo Chofer
                        </button>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <th className="px-6 py-4">Chofer</th>
                                        <th className="px-6 py-4">Contacto</th>
                                        <th className="px-6 py-4">Licencia</th>
                                        <th className="px-6 py-4">Turno</th>
                                        <th className="px-6 py-4">Vehículo Asignado</th>
                                        <th className="px-6 py-4">Estado</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredChoferes.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center">
                                                <Truck size={40} className="mx-auto mb-3 text-slate-300" />
                                                <p className="text-sm font-semibold text-slate-400">
                                                    No hay choferes registrados
                                                </p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    Asigna el rol &quot;Chofer&quot; a un empleado y luego crea su perfil aquí.
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredChoferes.map((chofer) => (
                                            <tr key={chofer.id} className="hover:bg-slate-50/30 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-sm font-black text-amber-600">
                                                            {chofer.nombre_completo.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-slate-900">{chofer.nombre_completo}</span>
                                                            <span className="text-[11px] text-slate-500">{chofer.rut || 'Sin RUT'}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        {chofer.usuario_email && (
                                                            <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                                                                <Mail size={12} className="text-slate-400" />
                                                                {chofer.usuario_email}
                                                            </div>
                                                        )}
                                                        {chofer.telefono ? (
                                                            <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                                                                <Phone size={12} className="text-slate-400" />
                                                                {chofer.telefono}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[11px] text-slate-400">Sin teléfono</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {chofer.licencia_clase ? (
                                                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                                                            <IdCard size={14} className="text-slate-400" />
                                                            Clase {chofer.licencia_clase}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[11px] text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {chofer.turno_inicio && chofer.turno_fin ? (
                                                        <span className="text-[11px] font-bold text-slate-600">
                                                            {chofer.turno_inicio.slice(0, 5)}–{chofer.turno_fin.slice(0, 5)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-slate-400">
                                                            {turnoDefecto.inicio}–{turnoDefecto.fin}
                                                            <span className="block text-[10px]">(por defecto)</span>
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {chofer.vehiculo_patente ? (
                                                        <div className="flex items-center gap-2">
                                                            <Truck size={14} className="text-slate-400" />
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-bold text-slate-700">{chofer.vehiculo_patente}</span>
                                                                {chofer.vehiculo_modelo && (
                                                                    <span className="text-[10px] text-slate-400">{chofer.vehiculo_modelo}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <Badge variant="danger">Sin vehículo</Badge>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {chofer.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="danger">Inactivo</Badge>}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => handleOpenEditChofer(chofer)}
                                                            title="Editar Perfil"
                                                            className="p-2 rounded-lg text-slate-400 hover:text-[#005088] hover:bg-slate-100 transition-all"
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        {chofer.activo ? (
                                                            <button
                                                                onClick={() => setDeactivatingChofer(chofer)}
                                                                title="Desactivar"
                                                                className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                                                            >
                                                                <UserMinus size={18} />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => startTransition(async () => { await reactivarChofer(chofer.id); })}
                                                                title="Reactivar"
                                                                className="p-2 rounded-lg text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                                                            >
                                                                <UserCheck size={18} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                            <p className="text-xs text-slate-400 font-medium">
                                Mostrando {filteredChoferes.length} de {choferes.length} choferes registrados
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ TAB: VEHÍCULOS ═══════════════ */}
            {activeTab === 'vehiculos' && (
                <div className="space-y-6">
                    {/* Toolbar */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar por patente, modelo o sucursal..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-[#005088] outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={handleOpenCreateVehiculo}
                            className="bg-[#005088] text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#003d66] transition-all shadow-lg shadow-[#005088]/20 active:scale-95 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005088]"
                        >
                            <Plus size={18} />
                            Nuevo Vehículo
                        </button>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <th className="px-6 py-4">Patente / Modelo</th>
                                        <th className="px-6 py-4">Año</th>
                                        <th className="px-6 py-4">Capacidad</th>
                                        <th className="px-6 py-4">Rendimiento</th>
                                        <th className="px-6 py-4">Sucursal</th>
                                        <th className="px-6 py-4">Estado</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredVehiculos.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center">
                                                <Truck size={40} className="mx-auto mb-3 text-slate-300" />
                                                <p className="text-sm font-semibold text-slate-400">
                                                    No hay vehículos registrados
                                                </p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    Registra la flota para poder asignar rutas a los choferes.
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredVehiculos.map((v) => (
                                            <tr key={v.id} className="hover:bg-slate-50/30 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                                                            <Truck size={18} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-slate-900 font-mono">{v.patente}</span>
                                                            <span className="text-[11px] text-slate-500">{v.modelo || 'Sin modelo'}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm font-medium text-slate-500">
                                                    {v.anno ?? '—'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-slate-700">
                                                            {v.capacidad_vol_m3 ?? '—'} m³
                                                        </span>
                                                        {v.capacidad_peso_kg != null && (
                                                            <span className="text-[10px] text-slate-400">
                                                                {v.capacidad_peso_kg.toLocaleString('es-CL')} kg
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-bold text-slate-700">
                                                        {v.rendimiento_kml ?? '—'} km/L
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-[11px] text-slate-600 font-medium">
                                                    {v.sucursal_nombre ?? <span className="text-slate-400">Sin asignar</span>}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {v.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="danger">Inactivo</Badge>}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => handleOpenEditVehiculo(v)}
                                                            title="Editar"
                                                            className="p-2 rounded-lg text-slate-400 hover:text-[#005088] hover:bg-slate-100 transition-all"
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        {v.activo ? (
                                                            <button
                                                                onClick={() => setDeactivatingVehiculo(v)}
                                                                title="Desactivar"
                                                                className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                                                            >
                                                                <UserMinus size={18} />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => startTransition(async () => { await reactivarVehiculo(v.id); })}
                                                                title="Reactivar"
                                                                className="p-2 rounded-lg text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                                                            >
                                                                <UserCheck size={18} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                            <p className="text-xs text-slate-400 font-medium">
                                Mostrando {filteredVehiculos.length} de {vehiculos.length} vehículos registrados
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ TAB: PARÁMETROS ═══════════════ */}
            {activeTab === 'parametros' && <ParametrosPanel parametros={parametros} />}

            {/* ═══════════════ MODALS ═══════════════ */}

            {/* Proveedor Modal (Create / Edit) */}
            <ProveedorModal
                isOpen={showProveedorModal}
                onClose={handleCloseProveedorModal}
                proveedor={editingProveedor}
                onSubmit={async (data) => {
                    if (editingProveedor) {
                        return actualizarProveedor(editingProveedor.id, data);
                    }
                    return crearProveedor(data);
                }}
            />

            {/* Confirm Deactivate Proveedor */}
            <ConfirmDeleteModal
                isOpen={!!deactivatingProveedor}
                onClose={() => setDeactivatingProveedor(null)}
                title="Desactivar Proveedor"
                description={`¿Estás seguro de que deseas desactivar a "${deactivatingProveedor?.nombre}"? No aparecerá en las opciones de movimientos de entrada.`}
                onConfirm={async () => {
                    if (!deactivatingProveedor) return { success: false };
                    return desactivarProveedor(deactivatingProveedor.id);
                }}
            />

            {/* Usuario Modal (Create / Edit) */}
            <UsuarioModal
                isOpen={showUsuarioModal}
                onClose={handleCloseUsuarioModal}
                usuario={editingUsuario}
                onSubmit={async (data) => {
                    if (editingUsuario) {
                        return actualizarUsuario(editingUsuario.id, data);
                    }
                    return crearUsuario(data);
                }}
            />

            {/* Confirm Delete Usuario */}
            <ConfirmDeleteModal
                isOpen={!!deletingUsuario}
                onClose={() => setDeletingUsuario(null)}
                title="Revocar Acceso de Empleado"
                description={`¿Estás seguro de que deseas eliminar a "${deletingUsuario?.nombre}" (${deletingUsuario?.email})? Esta acción revocará inmediatamente su acceso al sistema y no podrá iniciar sesión con Google.`}
                onConfirm={async () => {
                    if (!deletingUsuario) return { success: false };
                    return eliminarUsuario(deletingUsuario.id);
                }}
            />

            {/* Chofer Modal (Create / Edit) */}
            {showChoferModal && (
                <ChoferModal
                    isOpen={showChoferModal}
                    onClose={handleCloseChoferModal}
                    chofer={editingChofer}
                    usuariosDisponibles={usuariosChoferSinPerfil}
                    vehiculos={vehiculosActivos}
                    turnoDefecto={turnoDefecto}
                    onSubmit={async (data) => {
                        if (editingChofer) {
                            return actualizarChofer(editingChofer.id, data);
                        }
                        return crearChofer(data);
                    }}
                />
            )}

            {/* Confirm Deactivate Chofer */}
            <ConfirmDeleteModal
                isOpen={!!deactivatingChofer}
                onClose={() => setDeactivatingChofer(null)}
                title="Desactivar Chofer"
                description={`¿Estás seguro de que deseas desactivar a "${deactivatingChofer?.nombre_completo}"? Dejará de aparecer en el planificador de rutas, pero se conservará su historial de entregas.`}
                onConfirm={async () => {
                    if (!deactivatingChofer) return { success: false };
                    return desactivarChofer(deactivatingChofer.id);
                }}
            />

            {/* Vehículo Modal (Create / Edit) */}
            {showVehiculoModal && (
                <VehiculoModal
                    isOpen={showVehiculoModal}
                    onClose={handleCloseVehiculoModal}
                    vehiculo={editingVehiculo}
                    sucursales={sucursales}
                    onSubmit={async (data) => {
                        if (editingVehiculo) {
                            return actualizarVehiculo(editingVehiculo.id, data);
                        }
                        return crearVehiculo(data);
                    }}
                />
            )}

            {/* Confirm Deactivate Vehículo */}
            <ConfirmDeleteModal
                isOpen={!!deactivatingVehiculo}
                onClose={() => setDeactivatingVehiculo(null)}
                title="Desactivar Vehículo"
                description={`¿Estás seguro de que deseas desactivar el vehículo "${deactivatingVehiculo?.patente}"? Dejará de estar disponible para asignar rutas, pero se conservará su historial.`}
                onConfirm={async () => {
                    if (!deactivatingVehiculo) return { success: false };
                    return desactivarVehiculo(deactivatingVehiculo.id);
                }}
            />
        </div>
    );
}
