'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useUserRole, canAccess } from '@/contexts/UserRoleContext';
import {
    Search,
    Plus,
    Edit,
    Trash2,
    History,
    AlertTriangle,
    Filter,
    Package,
    Layers,
    MoreVertical,
    EyeOff,
    Eye,
} from 'lucide-react';
import { ProductoModal } from '@/components/inventario/ProductoModal';
import { CategoriaModal } from '@/components/inventario/CategoriaModal';
import { ConfirmDeleteModal } from '@/components/inventario/ConfirmDeleteModal';
import { PriceHistoryModal } from '@/components/inventario/PriceHistoryModal';
import type { CambioPrecioData } from '@/components/inventario/PriceHistoryModal';
import {
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    eliminarProductoPermanente,
    toggleProductoActivo,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
    obtenerHistorialPrecios,
} from '@/app/(dashboard)/inventario/actions';

// ─── Types (serializable data from server) ──────────────────────────────────

export interface ProductoData {
    id: number;
    nombre: string;
    descripcion: string | null;
    categoria_id: number | null;
    categoria_nombre: string | null;
    varas_por_paquete: number;
    maneja_cajas: boolean;
    paquetes_por_caja: number;
    stock_actual: number;
    stock_minimo: number;
    precio_venta_actual: number;
    activo: boolean;
}

export interface CategoriaData {
    id: number;
    nombre: string;
    descripcion: string | null;
    productos_count: number;
}

interface InventarioClientProps {
    productos: ProductoData[];
    categorias: CategoriaData[];
    totalPages?: number;
    currentPage?: number;
    totalRegistros?: number;
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
            className={`px-2.5 py-0.5 rounded text-[10px] font-bold tracking-tight uppercase border ${styles[variant]}`}
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
            className={`p-1.5 rounded transition-colors hover:bg-slate-100 focus:ring-2 focus:ring-[#005088] outline-none ${color}`}
        >
            <Icon size={16} />
        </button>
    );
}

// ─── Main Client Component ──────────────────────────────────────────────────

export function InventarioClient({ productos, categorias, totalPages = 1, currentPage = 1, totalRegistros = 0 }: InventarioClientProps) {
    const role = useUserRole();
    const isManager = canAccess(role, ['admin', 'gerente']);
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // --- State ---
    const [activeTab, setActiveTab] = useState<'productos' | 'categorias'>('productos');
    const [searchQuery, setSearchQuery] = useState(searchParams?.get('query') || '');
    const [filterCategoria, setFilterCategoria] = useState(searchParams?.get('categoria') || '');

    // Producto modals
    const [showProductoModal, setShowProductoModal] = useState(false);
    const [editingProducto, setEditingProducto] = useState<ProductoData | null>(null);
    const [deletingProducto, setDeletingProducto] = useState<ProductoData | null>(null);
    const [hardDeletingProducto, setHardDeletingProducto] = useState<ProductoData | null>(null);
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Categoría modals
    const [showCategoriaModal, setShowCategoriaModal] = useState(false);
    const [editingCategoria, setEditingCategoria] = useState<CategoriaData | null>(null);
    const [deletingCategoria, setDeletingCategoria] = useState<CategoriaData | null>(null);

    // Close menu on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Price history modal
    const [priceHistoryProducto, setPriceHistoryProducto] = useState<ProductoData | null>(null);
    const [priceHistoryData, setPriceHistoryData] = useState<CambioPrecioData[]>([]);

    // --- Push filters to URL ---
    const initialRender = useRef(true);
    useEffect(() => {
        if (initialRender.current) {
            initialRender.current = false;
            return;
        }
        const timeoutId = setTimeout(() => {
            const params = new URLSearchParams(searchParams?.toString() || '');
            
            if (searchQuery) params.set('query', searchQuery);
            else params.delete('query');
            
            if (filterCategoria) params.set('categoria', filterCategoria);
            else params.delete('categoria');

            // Reset page to 1 when filters change
            params.set('page', '1');
            
            router.push(`${pathname}?${params.toString()}`);
        }, 500);
        return () => clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, filterCategoria, pathname, router]);

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.set('page', newPage.toString());
        router.push(`${pathname}?${params.toString()}`);
    };

    // --- Filtered products ---
    // En este modo, el servidor ya filtra los productos. 
    // Usamos localmente "productos" directamente para la lista.
    const filteredProductos = productos;

    // --- Unique category names for filter dropdown ---
    const uniqueCategorias = useMemo(() => {
        return categorias.map((c) => c.nombre);
    }, [categorias]);

    // --- Handlers ---

    const handleOpenCreateProducto = () => {
        setEditingProducto(null);
        setShowProductoModal(true);
    };

    const handleOpenEditProducto = (prod: ProductoData) => {
        setEditingProducto(prod);
        setShowProductoModal(true);
    };

    const handleCloseProductoModal = () => {
        setShowProductoModal(false);
        setEditingProducto(null);
    };

    const handleOpenCreateCategoria = () => {
        setEditingCategoria(null);
        setShowCategoriaModal(true);
    };

    const handleOpenEditCategoria = (cat: CategoriaData) => {
        setEditingCategoria(cat);
        setShowCategoriaModal(true);
    };

    const handleCloseCategoriaModal = () => {
        setShowCategoriaModal(false);
        setEditingCategoria(null);
    };

    const handleOpenPriceHistory = async (prod: ProductoData) => {
        setPriceHistoryProducto(prod);
        const result = await obtenerHistorialPrecios(prod.id);
        if (result.success) {
            setPriceHistoryData(result.data);
        } else {
            setPriceHistoryData([]);
        }
    };

    const handleClosePriceHistory = () => {
        setPriceHistoryProducto(null);
        setPriceHistoryData([]);
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                    Gestión de Inventario
                </h2>

                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('productos')}
                        className={`px-6 py-3 text-sm font-bold transition-all border-b-2 outline-none focus:bg-slate-100 ${activeTab === 'productos'
                            ? 'border-[#005088] text-[#005088]'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Productos
                    </button>
                    {isManager && (
                        <button
                            onClick={() => setActiveTab('categorias')}
                            className={`px-6 py-3 text-sm font-bold transition-all border-b-2 outline-none focus:bg-slate-100 ${activeTab === 'categorias'
                                ? 'border-[#005088] text-[#005088]'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            Categorías
                        </button>
                    )}
                </div>
            </div>

            {/* ═══════════════ TAB: PRODUCTOS ═══════════════ */}
            {activeTab === 'productos' && (
                <div className="space-y-4">
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
                                    placeholder="Buscar por nombre de producto..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                            {/* Category Filter */}
                            <div className="relative">
                                <select
                                    value={filterCategoria}
                                    onChange={(e) => setFilterCategoria(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-8 text-sm focus:ring-2 focus:ring-[#005088] outline-none appearance-none cursor-pointer"
                                >
                                    <option value="">Todas las categorías</option>
                                    {uniqueCategorias.map((name) => (
                                        <option key={name} value={name}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <Filter size={14} />
                                </div>
                            </div>
                        </div>
                        {isManager && (
                            <button
                                onClick={handleOpenCreateProducto}
                                className="bg-[#005088] text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#003d66] transition-all shadow-lg shadow-[#005088]/20 active:scale-95 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005088]"
                            >
                                <Plus size={18} />
                                Nuevo Producto
                            </button>
                        )}
                    </div>

                    {/* Products Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <th className="px-6 py-4">Producto</th>
                                        <th className="px-6 py-4">Categoría</th>
                                        <th className="px-6 py-4">Stock</th>
                                        {isManager && <th className="px-6 py-4">Precio Venta</th>}
                                        <th className="px-6 py-4">Estado</th>
                                        {isManager && <th className="px-6 py-4 text-right">Acciones</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredProductos.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={isManager ? 6 : 4}
                                                className="px-6 py-12 text-center"
                                            >
                                                <Package
                                                    size={40}
                                                    className="mx-auto mb-3 text-slate-300"
                                                />
                                                <p className="text-sm font-semibold text-slate-400">
                                                    No se encontraron productos
                                                </p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    Intenta ajustar los filtros o crea un
                                                    nuevo producto.
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredProductos.map((prod) => {
                                            const isLowStock =
                                                prod.stock_actual <= prod.stock_minimo;
                                            return (
                                                <tr
                                                    key={prod.id}
                                                    className="hover:bg-slate-50/50 transition-colors"
                                                >
                                                    {/* Producto */}
                                                    <td className="px-6 py-4">
                                                        <p className="text-sm font-bold text-slate-900">
                                                            {prod.nombre}
                                                        </p>
                                                        <p className="text-[11px] text-slate-500">
                                                            {prod.varas_por_paquete} varas /
                                                            paquete
                                                        </p>
                                                    </td>

                                                    {/* Categoría */}
                                                    <td className="px-6 py-4">
                                                        <Badge>
                                                            {prod.categoria_nombre ??
                                                                'Sin categoría'}
                                                        </Badge>
                                                    </td>

                                                    {/* Stock */}
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-1.5">
                                                            {isLowStock && (
                                                                <AlertTriangle
                                                                    size={14}
                                                                    className="text-rose-500 animate-pulse shrink-0"
                                                                />
                                                            )}
                                                            <span
                                                                className={`text-sm font-black ${isLowStock
                                                                    ? 'text-rose-600'
                                                                    : 'text-slate-700'
                                                                    }`}
                                                            >
                                                                {prod.stock_actual}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                / mín. {prod.stock_minimo}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                            paquetes
                                                        </p>
                                                    </td>

                                                    {/* Precio — Solo admin/gerente */}
                                                    {isManager && (
                                                        <td className="px-6 py-4 text-sm font-bold text-slate-900">
                                                            {formatCLP(
                                                                Number(prod.precio_venta_actual)
                                                            )}
                                                        </td>
                                                    )}

                                                    {/* Estado */}
                                                    <td className="px-6 py-4">
                                                        {prod.activo ? (
                                                            <Badge variant="success">
                                                                Activo
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="danger">
                                                                Inactivo
                                                            </Badge>
                                                        )}
                                                    </td>

                                                    {/* Acciones — Solo admin/gerente */}
                                                    {isManager && (
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <IconButton
                                                                    icon={Edit}
                                                                    title="Editar"
                                                                    onClick={() =>
                                                                        handleOpenEditProducto(prod)
                                                                    }
                                                                />
                                                                <IconButton
                                                                    icon={History}
                                                                    title="Historial de precios"
                                                                    onClick={() =>
                                                                        handleOpenPriceHistory(prod)
                                                                    }
                                                                />
                                                                {/* Menú de acciones */}
                                                                <div className="relative" ref={openMenuId === prod.id ? menuRef : undefined}>
                                                                    <button
                                                                        onClick={() => setOpenMenuId(openMenuId === prod.id ? null : prod.id)}
                                                                        title="Más acciones"
                                                                        className="p-1.5 rounded transition-colors hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                                                    >
                                                                        <MoreVertical size={16} />
                                                                    </button>
                                                                    {openMenuId === prod.id && (
                                                                        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                                                                            {/* Desactivar / Reactivar */}
                                                                            <button
                                                                                onClick={() => {
                                                                                    setOpenMenuId(null);
                                                                                    if (prod.activo) {
                                                                                        setDeletingProducto(prod);
                                                                                    } else {
                                                                                        toggleProductoActivo(prod.id, true);
                                                                                    }
                                                                                }}
                                                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                                                            >
                                                                                {prod.activo ? (
                                                                                    <>
                                                                                        <EyeOff size={15} className="text-amber-500" />
                                                                                        <div className="text-left">
                                                                                            <span className="font-semibold">Desactivar</span>
                                                                                            <p className="text-[11px] text-slate-400">Oculta del sistema, no lo borra</p>
                                                                                        </div>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <Eye size={15} className="text-emerald-500" />
                                                                                        <div className="text-left">
                                                                                            <span className="font-semibold">Reactivar</span>
                                                                                            <p className="text-[11px] text-slate-400">Vuelve a estar visible</p>
                                                                                        </div>
                                                                                    </>
                                                                                )}
                                                                            </button>
                                                                            {/* Separador */}
                                                                            <div className="border-t border-slate-100 my-1" />
                                                                            {/* Eliminar permanentemente */}
                                                                            <button
                                                                                onClick={() => {
                                                                                    setOpenMenuId(null);
                                                                                    setHardDeletingProducto(prod);
                                                                                }}
                                                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                                                                            >
                                                                                <Trash2 size={15} />
                                                                                <div className="text-left">
                                                                                    <span className="font-semibold">Eliminar permanentemente</span>
                                                                                    <p className="text-[11px] text-rose-400">Borra el producto para siempre</p>
                                                                                </div>
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                            <p className="text-xs text-slate-400 font-medium">
                                Mostrando página {currentPage} de {Math.max(totalPages, 1)} ({totalRegistros} productos)
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    disabled={currentPage <= 1}
                                    className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Anterior
                                </button>
                                <button
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    disabled={currentPage >= totalPages}
                                    className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ TAB: CATEGORÍAS ═══════════════ */}
            {activeTab === 'categorias' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            onClick={handleOpenCreateCategoria}
                            className="bg-[#005088] text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#003d66] transition-all shadow-lg shadow-[#005088]/20 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005088]"
                        >
                            <Plus size={18} />
                            Nueva Categoría
                        </button>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <th className="px-6 py-4 w-20">ID</th>
                                        <th className="px-6 py-4">Nombre</th>
                                        <th className="px-6 py-4">Descripción</th>
                                        <th className="px-6 py-4 text-center">Productos</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {categorias.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-6 py-12 text-center"
                                            >
                                                <Layers
                                                    size={40}
                                                    className="mx-auto mb-3 text-slate-300"
                                                />
                                                <p className="text-sm font-semibold text-slate-400">
                                                    No hay categorías registradas
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        categorias.map((cat) => (
                                            <tr
                                                key={cat.id}
                                                className="hover:bg-slate-50/50 transition-colors"
                                            >
                                                <td className="px-6 py-4 text-sm font-bold text-[#005088]">
                                                    #{cat.id}
                                                </td>
                                                <td className="px-6 py-4 text-sm font-black text-slate-900">
                                                    {cat.nombre}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-500 leading-relaxed">
                                                    {cat.descripcion || '—'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-700 text-center font-bold">
                                                    {cat.productos_count}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <IconButton
                                                            icon={Edit}
                                                            title="Editar"
                                                            onClick={() =>
                                                                handleOpenEditCategoria(cat)
                                                            }
                                                        />
                                                        <IconButton
                                                            icon={Trash2}
                                                            color="text-slate-400 hover:text-rose-600"
                                                            title="Eliminar"
                                                            onClick={() =>
                                                                setDeletingCategoria(cat)
                                                            }
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ MODALS ═══════════════ */}

            {/* Producto Modal (Create / Edit) */}
            <ProductoModal
                key={editingProducto ? editingProducto.id : 'new'}
                isOpen={showProductoModal}
                onClose={handleCloseProductoModal}
                categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
                producto={
                    editingProducto
                        ? {
                            id: editingProducto.id,
                            nombre: editingProducto.nombre,
                            descripcion: editingProducto.descripcion,
                            categoria_id: editingProducto.categoria_id,
                            varas_por_paquete: editingProducto.varas_por_paquete,
                            maneja_cajas: editingProducto.maneja_cajas,
                            paquetes_por_caja: editingProducto.paquetes_por_caja,
                            stock_actual: editingProducto.stock_actual,
                            stock_minimo: editingProducto.stock_minimo,
                            precio_venta_actual: editingProducto.precio_venta_actual,
                            activo: editingProducto.activo,
                        }
                        : null
                }
                onSubmit={async (data) => {
                    if (editingProducto) {
                        return actualizarProducto(editingProducto.id, data);
                    }
                    return crearProducto(data);
                }}
            />

            {/* Categoría Modal (Create / Edit) */}
            <CategoriaModal
                key={editingCategoria ? editingCategoria.id : 'new-cat'}
                isOpen={showCategoriaModal}
                onClose={handleCloseCategoriaModal}
                categoria={
                    editingCategoria
                        ? {
                            id: editingCategoria.id,
                            nombre: editingCategoria.nombre,
                            descripcion: editingCategoria.descripcion,
                        }
                        : null
                }
                onSubmit={async (data) => {
                    if (editingCategoria) {
                        return actualizarCategoria(editingCategoria.id, data);
                    }
                    return crearCategoria(data);
                }}
            />

            {/* Confirm Desactivar Producto */}
            <ConfirmDeleteModal
                isOpen={!!deletingProducto}
                onClose={() => setDeletingProducto(null)}
                title="Desactivar Producto"
                description={`¿Deseas desactivar "${deletingProducto?.nombre}"? El producto dejará de estar visible en el sistema, pero no se eliminará. Podrás reactivarlo en cualquier momento.`}
                confirmText="Desactivar"
                pendingText="Desactivando..."
                variant="warning"
                onConfirm={async () => {
                    if (!deletingProducto) return { success: false };
                    return eliminarProducto(deletingProducto.id);
                }}
            />

            {/* Confirm Eliminar Permanente Producto */}
            <ConfirmDeleteModal
                isOpen={!!hardDeletingProducto}
                onClose={() => setHardDeletingProducto(null)}
                title="Eliminar Permanentemente"
                description={`¿Estás seguro de que deseas eliminar "${hardDeletingProducto?.nombre}" de forma permanente? Esta acción NO se puede deshacer y se perderán todos los datos del producto.`}
                confirmText="Sí, eliminar para siempre"
                pendingText="Eliminando..."
                variant="danger"
                onConfirm={async () => {
                    if (!hardDeletingProducto) return { success: false };
                    return eliminarProductoPermanente(hardDeletingProducto.id);
                }}
            />

            {/* Confirm Delete Categoría */}
            <ConfirmDeleteModal
                isOpen={!!deletingCategoria}
                onClose={() => setDeletingCategoria(null)}
                title="Eliminar Categoría"
                description={`¿Estás seguro de que deseas eliminar la categoría "${deletingCategoria?.nombre}"? Esta acción no se puede deshacer.`}
                variant="danger"
                onConfirm={async () => {
                    if (!deletingCategoria) return { success: false };
                    return eliminarCategoria(deletingCategoria.id);
                }}
            />

            {/* Price History Modal */}
            <PriceHistoryModal
                isOpen={!!priceHistoryProducto}
                onClose={handleClosePriceHistory}
                nombreProducto={priceHistoryProducto?.nombre ?? ''}
                precioActual={priceHistoryProducto?.precio_venta_actual ?? 0}
                cambios={priceHistoryData}
            />
        </div>
    );
}
