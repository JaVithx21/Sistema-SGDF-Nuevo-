'use client';

import { useState, useTransition, useMemo } from 'react';
import { X, Package, Box, Calculator } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CategoriaOption {
    id: number;
    nombre: string;
}

interface ProductoModalProps {
    isOpen: boolean;
    onClose: () => void;
    categorias: CategoriaOption[];
    producto?: {
        id: number;
        nombre: string;
        descripcion: string | null;
        categoria_id: number | null;
        varas_por_paquete: number;
        maneja_cajas: boolean;
        paquetes_por_caja: number;
        stock_actual: number;
        stock_minimo: number;
        precio_venta_actual: number;
        activo: boolean;
    } | null;
    onSubmit: (data: {
        nombre: string;
        descripcion?: string;
        categoria_id: number | null;
        varas_por_paquete: number;
        maneja_cajas: boolean;
        paquetes_por_caja: number;
        stock_actual: number;
        stock_minimo: number;
        precio_venta_actual: number;
        activo: boolean;
    }) => Promise<{ success: boolean; error?: string }>;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const InputStyle =
    'w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-[#005088] focus:border-transparent outline-none transition-all';

// ─── Component ──────────────────────────────────────────────────────────────

export function ProductoModal({ isOpen, onClose, categorias, producto, onSubmit }: ProductoModalProps) {
    const isEditing = !!producto;
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    // --- Datos básicos ---
    const [nombre, setNombre] = useState(producto?.nombre ?? '');
    const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '');
    const [categoriaId, setCategoriaId] = useState<string>(
        producto?.categoria_id ? String(producto.categoria_id) : ''
    );
    const [varasPorPaquete, setVarasPorPaquete] = useState(producto?.varas_por_paquete ?? 1);
    const [precioVenta, setPrecioVenta] = useState(producto?.precio_venta_actual ?? 0);
    const [stockMinimo, setStockMinimo] = useState(producto?.stock_minimo ?? 0);
    // El modal no edita `activo` (se usa desactivar/reactivar); solo se conserva el valor actual.
    const [activo] = useState(producto?.activo ?? true);

    // ─── Sección 1: Reglas de Empaque (SSOT desde la BD) ────────────────
    const [vieneEnCajas, setVieneEnCajas] = useState(
        producto?.maneja_cajas ?? false
    );
    const [paquetesPorCaja, setPaquetesPorCaja] = useState(
        producto?.paquetes_por_caja ?? 12
    );

    // ─── Sección 2: Stock Inicial Inteligente ───────────────────────────
    const [modoConteo, setModoConteo] = useState<'paquetes' | 'cajas_sueltos'>('paquetes');
    const [stockPaquetesDirecto, setStockPaquetesDirecto] = useState<number | string>(isEditing ? (producto?.stock_actual ?? 0) : '');
    const [cajasCerradas, setCajasCerradas] = useState<number | string>('');
    const [paquetesSueltos, setPaquetesSueltos] = useState<number | string>('');

    // Cálculo en tiempo real del stock total en paquetes
    const stockCalculado = useMemo(() => {
        const valDirecto = Number(stockPaquetesDirecto) || 0;
        if (modoConteo === 'paquetes') return valDirecto;
        const valCajas = Number(cajasCerradas) || 0;
        const valSueltos = Number(paquetesSueltos) || 0;
        return (valCajas * paquetesPorCaja) + valSueltos;
    }, [modoConteo, stockPaquetesDirecto, cajasCerradas, paquetesPorCaja, paquetesSueltos]);

    // El valor que se usará en paquetes_por_caja (1 si no viene en cajas)
    const paquetesPorCajaFinal = vieneEnCajas ? paquetesPorCaja : 1;

    if (!isOpen) return null;

    // ─── Sección 3: Lógica de Envío (Submit) ────────────────────────────
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validar paquetes_por_caja si viene en cajas
        if (vieneEnCajas && paquetesPorCaja < 2) {
            setError('Si el producto viene en cajas, debe tener al menos 2 paquetes por caja.');
            return;
        }

        startTransition(async () => {
            const result = await onSubmit({
                nombre,
                descripcion: descripcion || undefined,
                categoria_id: categoriaId ? Number(categoriaId) : null,
                varas_por_paquete: varasPorPaquete,
                maneja_cajas: vieneEnCajas,
                paquetes_por_caja: paquetesPorCajaFinal,
                stock_actual: stockCalculado, // ← Siempre en PAQUETES
                stock_minimo: stockMinimo,
                precio_venta_actual: precioVenta,
                activo,
            });

            if (result.success) {
                onClose();
            } else {
                setError(result.error ?? 'Ocurrió un error inesperado.');
            }
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h3 className="text-xl font-black text-slate-900">
                        {isEditing ? 'Editar Producto' : 'Nuevo Producto'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3 rounded-lg font-medium">
                            {error}
                        </div>
                    )}

                    {/* Nombre */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Nombre del Producto *
                        </label>
                        <input
                            type="text"
                            required
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="Ej: Rosas Rojas Premium"
                            className={InputStyle}
                        />
                    </div>

                    {/* Descripción */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Descripción
                        </label>
                        <textarea
                            value={descripcion}
                            onChange={(e) => setDescripcion(e.target.value)}
                            placeholder="Descripción opcional del producto..."
                            rows={2}
                            className={`${InputStyle} resize-none`}
                        />
                    </div>

                    {/* Categoría */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Categoría
                        </label>
                        <select
                            value={categoriaId}
                            onChange={(e) => setCategoriaId(e.target.value)}
                            className={`${InputStyle} appearance-none cursor-pointer`}
                        >
                            <option value="">Sin categoría</option>
                            {categorias.map((c) => (
                                <option key={c.id} value={String(c.id)}>
                                    {c.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Varas por paquete + Precio Venta */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Varas / Paquete *
                            </label>
                            <input
                                type="number"
                                required
                                min={1}
                                value={varasPorPaquete || ''}
                                onChange={(e) => setVarasPorPaquete(Number(e.target.value))}
                                className={InputStyle}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Precio Venta (CLP) *
                            </label>
                            <input
                                type="number"
                                required
                                min={0}
                                value={precioVenta || ''}
                                onChange={(e) => setPrecioVenta(Number(e.target.value))}
                                className={InputStyle}
                            />
                        </div>
                    </div>

                    {/* ═══════════════════════════════════════════════════════ */}
                    {/* SECCIÓN 1: Reglas de Empaque                          */}
                    {/* ═══════════════════════════════════════════════════════ */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Box size={16} className="text-[#005088]" />
                                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">
                                    Reglas de Empaque
                                </span>
                            </div>

                            {/* Switch: ¿Viene en cajas? */}
                            <label className="relative inline-flex items-center cursor-pointer gap-2">
                                <span className="text-xs font-semibold text-slate-500">
                                    ¿Viene en cajas?
                                </span>
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={vieneEnCajas}
                                        onChange={(e) => {
                                            setVieneEnCajas(e.target.checked);
                                            if (!e.target.checked) {
                                                // Si desactiva cajas, volver a modo paquetes
                                                setModoConteo('paquetes');
                                            }
                                        }}
                                    />
                                    <div className="w-9 h-5 bg-slate-300 peer-focus:ring-2 peer-focus:ring-[#005088]/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#005088]"></div>
                                </div>
                            </label>
                        </div>

                        {/* Input paquetes por caja (solo si viene en cajas) */}
                        {vieneEnCajas && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                    Paquetes por Caja *
                                </label>
                                <input
                                    type="number"
                                    required
                                    min={2}
                                    value={paquetesPorCaja || ''}
                                    onChange={(e) => setPaquetesPorCaja(Number(e.target.value))}
                                    placeholder="Ej: 12"
                                    className={InputStyle}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Cada caja contiene {paquetesPorCaja} paquetes de {varasPorPaquete} vara{varasPorPaquete !== 1 ? 's' : ''}.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ═══════════════════════════════════════════════════════ */}
                    {/* SECCIÓN 2: Stock Inicial Inteligente (Calculadora)     */}
                    {/* ═══════════════════════════════════════════════════════ */}
                    {!isEditing && (
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Calculator size={16} className="text-[#005088]" />
                                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">
                                    Stock Inicial
                                </span>
                            </div>

                            {/* Tabs: modo de conteo */}
                            <div className="flex bg-slate-200/50 p-1 rounded-lg w-fit">
                                <button
                                    type="button"
                                    onClick={() => setModoConteo('paquetes')}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${modoConteo === 'paquetes'
                                        ? 'bg-white text-[#005088] shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    <Package size={14} />
                                    En Paquetes
                                </button>
                                {vieneEnCajas && (
                                    <button
                                        type="button"
                                        onClick={() => setModoConteo('cajas_sueltos')}
                                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${modoConteo === 'cajas_sueltos'
                                            ? 'bg-white text-[#005088] shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                    >
                                        <Box size={14} />
                                        En Cajas y Sueltos
                                    </button>
                                )}
                            </div>

                            {/* Opción A: Paquetes directos */}
                            {modoConteo === 'paquetes' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                        Stock Inicial (Paquetes)
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={stockPaquetesDirecto}
                                        onChange={(e) => setStockPaquetesDirecto(e.target.value)}
                                        placeholder="0"
                                        className={InputStyle}
                                    />
                                </div>
                            )}

                            {/* Opción B: Cajas + Sueltos */}
                            {modoConteo === 'cajas_sueltos' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                                Cajas Cerradas
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={cajasCerradas}
                                                onChange={(e) => setCajasCerradas(e.target.value)}
                                                placeholder="0"
                                                className={InputStyle}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                                Paquetes Sueltos
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={paquetesSueltos}
                                                onChange={(e) => setPaquetesSueltos(e.target.value)}
                                                placeholder="0"
                                                className={InputStyle}
                                            />
                                        </div>
                                    </div>
                                    {/* Resultado dinámico */}
                                    <div className="flex items-center gap-2 text-sm font-black text-[#005088] bg-blue-50 px-4 py-2.5 rounded-lg border border-blue-100">
                                        <Calculator size={16} />
                                        Total calculado: {stockCalculado} paquetes
                                        <span className="text-[11px] font-medium text-slate-400 ml-1">
                                            ({cajasCerradas || 0} × {paquetesPorCaja} + {paquetesSueltos || 0})
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Stock actual (solo modo edición — se muestra directo) */}
                    {isEditing && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                Stock Actual (paquetes)
                            </label>
                            <input
                                type="number"
                                min={0}
                                value={stockPaquetesDirecto}
                                onChange={(e) => setStockPaquetesDirecto(e.target.value)}
                                className={InputStyle}
                            />
                            <p className="text-[11px] text-slate-400 mt-1">
                                En modo edición, el stock se ajusta normalmente vía Movimientos de Bodega.
                            </p>
                        </div>
                    )}

                    {/* Stock mínimo */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Stock Mínimo (paq.) *
                        </label>
                        <input
                            type="number"
                            required
                            min={0}
                            value={stockMinimo || ''}
                            onChange={(e) => setStockMinimo(Number(e.target.value))}
                            className={InputStyle}
                        />
                    </div>

                    {/* Estado — Solo lectura en edición, siempre activo al crear */}
                    {isEditing && (
                        <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                            activo
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-amber-50 border-amber-200'
                        }`}>
                            <div className={`w-2.5 h-2.5 rounded-full ${
                                activo ? 'bg-emerald-500' : 'bg-amber-500'
                            }`} />
                            <span className={`text-sm font-semibold ${
                                activo ? 'text-emerald-700' : 'text-amber-700'
                            }`}>
                                {activo ? 'Producto activo' : 'Producto inactivo'}
                            </span>
                            <span className="text-[11px] text-slate-400 ml-auto">
                                Gestiona esto desde la tabla de productos
                            </span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="px-5 py-2.5 text-sm font-bold text-white bg-[#005088] rounded-lg hover:bg-[#003d66] transition-all shadow-lg shadow-[#005088]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isPending
                                ? 'Guardando...'
                                : isEditing
                                    ? 'Guardar Cambios'
                                    : 'Crear Producto'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
