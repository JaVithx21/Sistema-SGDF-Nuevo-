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
    eliminarUsuario
} from '@/app/(dashboard)/administracion/actions';
import { UsuarioModal } from '@/components/administracion/UsuarioModal';

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

export type RolUsuario = 'admin' | 'gerente' | 'vendedor';

export interface UsuarioData {
    id: string;
    nombre: string;
    email: string | null;
    rol: RolUsuario;
    created_at: string;
}

interface AdminClientProps {
    proveedores: ProveedorData[];
    usuarios: UsuarioData[];
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Badge({
    children,
    variant = 'default',
}: {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'danger' | 'primary' | 'vendedor' | 'gerente';
}) {
    const styles = {
        default: 'bg-slate-100 text-slate-600 border-slate-200',
        success: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        danger: 'bg-rose-50 text-rose-600 border-rose-100',
        primary: 'bg-indigo-50 text-indigo-600 border-indigo-100', // admin
        vendedor: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        gerente: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight border ${styles[variant]}`}>
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

export function AdministracionClient({ proveedores, usuarios }: AdminClientProps) {
    const [activeTab, setActiveTab] = useState<'proveedores' | 'usuarios'>('proveedores');
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

    const handleChangeRol = (user: UsuarioData, nuevoRol: RolUsuario) => {
        startTransition(async () => {
            await cambiarRolUsuario(user.id, nuevoRol);
            setChangingRolUser(null);
        });
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
                                                            onChange={(e) => handleChangeRol(user, e.target.value as RolUsuario)}
                                                            onBlur={() => setChangingRolUser(null)}
                                                            autoFocus
                                                            className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#005088] appearance-none"
                                                        >
                                                            <option value="admin">Administrador</option>
                                                            <option value="gerente">Gerente</option>
                                                            <option value="vendedor">Vendedor</option>
                                                        </select>
                                                    ) : (
                                                        <>
                                                            {user.rol === 'admin' && <Badge variant="primary">Administrador</Badge>}
                                                            {user.rol === 'gerente' && <Badge variant="gerente">Gerente</Badge>}
                                                            {user.rol === 'vendedor' && <Badge variant="vendedor">Vendedor</Badge>}
                                                        </>
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

            {/* ═══════════════ MODALS ═══════════════ */}

            {/* Proveedor Modal (Create / Edit) */}
            {showProveedorModal && (
                <ProveedorModal
                    key={editingProveedor ? editingProveedor.id : 'new'}
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
            )}

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
        </div>
    );
}
