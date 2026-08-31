'use client';

import { useState, useMemo } from 'react';
import { useUserRole, canAccess } from '@/contexts/UserRoleContext';
import {
    Users,
    UserPlus,
    Search,
    Filter,
    Edit,
    UserMinus,
    UserCheck,
    ReceiptText,
    Mail,
    Phone,
    AlertCircle,
    DollarSign,
} from 'lucide-react';
import { ClienteModal } from '@/components/clientes/ClienteModal';
import { ConfirmDeleteModal } from '@/components/inventario/ConfirmDeleteModal';
import { OrderHistoryDrawer } from '@/components/clientes/OrderHistoryDrawer';
import type { PedidoHistorialResult } from '@/app/(dashboard)/clientes/actions';
import {
    crearCliente,
    actualizarCliente,
    desactivarCliente,
    reactivarCliente,
    obtenerHistorialPedidos,
} from '@/app/(dashboard)/clientes/actions';

// ─── Types (serializable data from server) ──────────────────────────────────

export interface ClienteData {
    id: number;
    razon_social: string;
    rut: string | null;
    nombre_contacto: string | null;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    saldo_pendiente: number;
    activo: boolean;
    total_pedidos: number;
}

interface ClientesClientProps {
    clientes: ClienteData[];
}

// ─── Formatear CLP ─────────────────────────────────────────────────────────

function formatCLP(amount: number): string {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Badge({
    children,
    variant = 'default',
}: {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'danger' | 'warning';
}) {
    const styles = {
        default: 'bg-slate-100 text-slate-600 border-slate-200',
        success: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        danger: 'bg-rose-50 text-rose-600 border-rose-100',
        warning: 'bg-amber-50 text-amber-600 border-amber-100',
    };
    return (
        <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight border ${styles[variant]}`}
        >
            {children}
        </span>
    );
}

function IconButton({
    icon: Icon,
    onClick,
    color = 'text-slate-400 hover:text-[#005088]',
    title,
}: {
    icon: React.ComponentType<{ size?: number }>;
    onClick?: () => void;
    color?: string;
    title?: string;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`p-2 rounded-lg transition-all hover:bg-slate-100 focus:ring-2 focus:ring-[#005088] outline-none ${color}`}
        >
            <Icon size={18} />
        </button>
    );
}

// ─── Main Client Component ──────────────────────────────────────────────────

export function ClientesClient({ clientes }: ClientesClientProps) {
    const role = useUserRole();
    const isManager = canAccess(role, ['admin', 'gerente']);

    // --- State ---
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDeudores, setFilterDeudores] = useState(false);

    // Modals
    const [showClienteModal, setShowClienteModal] = useState(false);
    const [editingCliente, setEditingCliente] = useState<ClienteData | null>(null);
    const [deactivatingCliente, setDeactivatingCliente] = useState<ClienteData | null>(null);

    // Order History Drawer
    const [drawerCliente, setDrawerCliente] = useState<ClienteData | null>(null);
    const [drawerPedidos, setDrawerPedidos] = useState<PedidoHistorialResult[]>([]);
    const [drawerTotalVentas, setDrawerTotalVentas] = useState(0);
    const [drawerPedidosActivos, setDrawerPedidosActivos] = useState(0);
    const [drawerLoading, setDrawerLoading] = useState(false);

    // --- KPI Stats ---
    const stats = useMemo(() => {
        const totalCuentas = clientes.reduce((acc, c) => acc + c.saldo_pendiente, 0);
        const clientesDeuda = clientes.filter((c) => c.saldo_pendiente > 0).length;
        const clientesActivos = clientes.filter((c) => c.activo).length;
        return { totalCuentas, clientesDeuda, clientesActivos };
    }, [clientes]);

    // --- Filtered clients ---
    const filteredClientes = useMemo(() => {
        return clientes.filter((c) => {
            const query = searchQuery.toLowerCase();
            const matchesSearch =
                c.razon_social.toLowerCase().includes(query) ||
                (c.rut && c.rut.includes(searchQuery)) ||
                (c.nombre_contacto && c.nombre_contacto.toLowerCase().includes(query));
            const matchesDeuda = filterDeudores ? c.saldo_pendiente > 0 : true;
            return matchesSearch && matchesDeuda;
        });
    }, [clientes, searchQuery, filterDeudores]);

    // --- Handlers ---
    const handleOpenCreate = () => {
        setEditingCliente(null);
        setShowClienteModal(true);
    };

    const handleOpenEdit = (cliente: ClienteData) => {
        setEditingCliente(cliente);
        setShowClienteModal(true);
    };

    const handleCloseModal = () => {
        setShowClienteModal(false);
        setEditingCliente(null);
    };

    const handleOpenDrawer = async (cliente: ClienteData) => {
        setDrawerCliente(cliente);
        setDrawerLoading(true);
        const result = await obtenerHistorialPedidos(cliente.id);
        if (result.success) {
            setDrawerPedidos(result.pedidos);
            setDrawerTotalVentas(result.total_ventas);
            setDrawerPedidosActivos(result.pedidos_activos);
        } else {
            setDrawerPedidos([]);
            setDrawerTotalVentas(0);
            setDrawerPedidosActivos(0);
        }
        setDrawerLoading(false);
    };

    const handleCloseDrawer = () => {
        setDrawerCliente(null);
        setDrawerPedidos([]);
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                    Cartera de Clientes B2B
                </h2>
                <p className="text-slate-500 mt-1">
                    Gestión de créditos y cuentas por cobrar.
                </p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Cuentas por Cobrar */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center hover:shadow-md transition-shadow">
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Total Cuentas por Cobrar
                        </p>
                        <h3 className="text-2xl font-black text-[#005088]">
                            {formatCLP(stats.totalCuentas)}
                        </h3>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 text-[#005088]">
                        <DollarSign size={24} />
                    </div>
                </div>

                {/* Clientes con Deuda */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center hover:shadow-md transition-shadow">
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Clientes con Deuda
                        </p>
                        <h3 className="text-2xl font-black text-slate-900">
                            {stats.clientesDeuda} clientes
                        </h3>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-50 text-rose-600">
                        <AlertCircle size={24} />
                    </div>
                </div>

                {/* Clientes Activos */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center hover:shadow-md transition-shadow">
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Clientes Activos
                        </p>
                        <h3 className="text-2xl font-black text-slate-900">
                            {stats.clientesActivos} clientes
                        </h3>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
                        <Users size={24} />
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-75">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            size={18}
                        />
                        <input
                            type="text"
                            placeholder="Buscar por Razón Social, RUT o contacto..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                        />
                    </div>
                    {/* Filter deudores */}
                    <button
                        onClick={() => setFilterDeudores(!filterDeudores)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all border whitespace-nowrap ${filterDeudores
                            ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <Filter size={16} />
                        {filterDeudores ? 'Mostrando Deudores' : 'Filtrar Deudores'}
                    </button>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="bg-[#005088] text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#003d66] transition-all shadow-lg shadow-[#005088]/20 active:scale-95 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005088]"
                >
                    <UserPlus size={18} />
                    Nuevo Cliente
                </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-6 py-4">Cliente</th>
                                <th className="px-6 py-4">Contacto</th>
                                <th className="px-6 py-4">Saldo Pendiente</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredClientes.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <Users
                                            size={40}
                                            className="mx-auto mb-3 text-slate-300"
                                        />
                                        <p className="text-sm font-semibold text-slate-400">
                                            No se encontraron clientes
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            Intenta ajustar la búsqueda o crea un nuevo
                                            cliente.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                filteredClientes.map((cliente) => (
                                    <tr
                                        key={cliente.id}
                                        className="hover:bg-slate-50/30 transition-colors group"
                                    >
                                        {/* Cliente */}
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-slate-900 group-hover:text-[#005088] transition-colors">
                                                    {cliente.razon_social}
                                                </span>
                                                <span className="text-[11px] text-slate-500 font-medium">
                                                    {cliente.rut || 'Sin RUT'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Contacto */}
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-medium text-slate-700">
                                                    {cliente.nombre_contacto || '—'}
                                                </span>
                                                <div className="flex items-center gap-3">
                                                    {cliente.email && (
                                                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                                            <Mail size={12} />
                                                            {cliente.email}
                                                        </div>
                                                    )}
                                                    {cliente.telefono && (
                                                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                                            <Phone size={12} />
                                                            {cliente.telefono}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Saldo */}
                                        <td className="px-6 py-4">
                                            <span
                                                className={`text-sm font-black ${cliente.saldo_pendiente > 0
                                                    ? 'text-rose-600'
                                                    : 'text-slate-400'
                                                    }`}
                                            >
                                                {formatCLP(cliente.saldo_pendiente)}
                                            </span>
                                        </td>

                                        {/* Estado */}
                                        <td className="px-6 py-4">
                                            {cliente.activo ? (
                                                <Badge variant="success">Activo</Badge>
                                            ) : (
                                                <Badge variant="danger">Bloqueado</Badge>
                                            )}
                                        </td>

                                        {/* Acciones */}
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <IconButton
                                                    icon={ReceiptText}
                                                    title="Ver Historial de Pedidos"
                                                    color="text-[#005088] hover:bg-blue-50"
                                                    onClick={() => handleOpenDrawer(cliente)}
                                                />
                                                {isManager && (
                                                    <>
                                                        <IconButton
                                                            icon={Edit}
                                                            title="Editar Cliente"
                                                            onClick={() => handleOpenEdit(cliente)}
                                                        />
                                                        {cliente.activo ? (
                                                            <IconButton
                                                                icon={UserMinus}
                                                                title="Desactivar Cliente"
                                                                color="text-slate-400 hover:text-rose-600"
                                                                onClick={() =>
                                                                    setDeactivatingCliente(cliente)
                                                                }
                                                            />
                                                        ) : (
                                                            <IconButton
                                                                icon={UserCheck}
                                                                title="Reactivar Cliente"
                                                                color="text-slate-400 hover:text-emerald-600"
                                                                onClick={() => {
                                                                    reactivarCliente(cliente.id);
                                                                }}
                                                            />
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
                    <p className="text-xs text-slate-400 font-medium">
                        Mostrando {filteredClientes.length} de {clientes.length} clientes
                        registrados
                    </p>
                </div>
            </div>

            {/* ═══════════════ MODALS ═══════════════ */}

            {/* Cliente Modal (Create / Edit) */}
            {showClienteModal && (
                <ClienteModal
                    key={editingCliente ? editingCliente.id : 'new'}
                    isOpen={showClienteModal}
                    onClose={handleCloseModal}
                    cliente={
                        editingCliente
                            ? {
                                id: editingCliente.id,
                                razon_social: editingCliente.razon_social,
                                rut: editingCliente.rut,
                                nombre_contacto: editingCliente.nombre_contacto,
                                telefono: editingCliente.telefono,
                                email: editingCliente.email,
                                direccion: editingCliente.direccion,
                                activo: editingCliente.activo,
                            }
                            : null
                    }
                    onSubmit={async (data) => {
                        if (editingCliente) {
                            return actualizarCliente(editingCliente.id, data);
                        }
                        return crearCliente(data);
                    }}
                />
            )}

            {/* Confirm Deactivate */}
            <ConfirmDeleteModal
                isOpen={!!deactivatingCliente}
                onClose={() => setDeactivatingCliente(null)}
                title="Desactivar Cliente"
                description={`¿Estás seguro de que deseas desactivar a "${deactivatingCliente?.razon_social}"? El cliente quedará bloqueado y no podrá generar nuevos pedidos.`}
                onConfirm={async () => {
                    if (!deactivatingCliente) return { success: false };
                    return desactivarCliente(deactivatingCliente.id);
                }}
            />

            {/* Order History Drawer */}
            <OrderHistoryDrawer
                isOpen={!!drawerCliente}
                onClose={handleCloseDrawer}
                cliente={
                    drawerCliente
                        ? {
                            razon_social: drawerCliente.razon_social,
                            rut: drawerCliente.rut,
                            saldo_pendiente: drawerCliente.saldo_pendiente,
                        }
                        : null
                }
                pedidos={drawerPedidos}
                totalVentas={drawerTotalVentas}
                pedidosActivos={drawerPedidosActivos}
                loading={drawerLoading}
            />
        </div>
    );
}
