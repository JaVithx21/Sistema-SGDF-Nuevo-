'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Package,
    ShoppingCart,
    LogOut,
    ArrowLeftRight,
    DollarSign,
    Users,
    Settings,
    Route,
} from 'lucide-react';
import type { SidebarItem as SidebarItemType, UserRole } from '@/constants/roles';
import { SIDEBAR_ITEMS, ROLE_LABELS } from '@/constants/roles';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    LayoutDashboard,
    Package,
    ShoppingCart,
    ArrowLeftRight,
    DollarSign,
    Users,
    Settings,
    Route,
};

interface SidebarProps {
    userRole: UserRole;
    userName: string;
}

function SidebarNavItem({ item, isActive }: { item: SidebarItemType; isActive: boolean }) {
    const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;

    return (
        <Link
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 group ${isActive
                ? 'bg-white/15 border-l-4 border-white text-white font-bold'
                : 'text-white/70 hover:bg-white/10 hover:text-white border-l-4 border-transparent'
                }`}
        >
            <Icon size={20} className={isActive ? 'text-white' : 'text-white/60 group-hover:text-white'} />
            <span className="text-sm font-medium">{item.label}</span>
        </Link>
    );
}

export function Sidebar({ userRole, userName }: SidebarProps) {
    const pathname = usePathname();

    const filteredItems = SIDEBAR_ITEMS.filter((item) => item.roles.includes(userRole));

    return (
        <aside className="fixed left-0 top-0 h-full w-70 bg-[#005088] flex flex-col shadow-xl z-20">
            {/* Logo */}
            <div className="px-6 pt-8 pb-6 flex items-center gap-3">
                {/* Icono con svg , cambiamos png por svg */}
                <svg
                    className="w-10 h-10 text-white shrink-0 drop-shadow-md"
                    viewBox="0 0 100 100"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    {/* Left Petals (Slanted upwards /) */}
                    <path d="M15 35 L42 20 L42 32 L20 44 Z" />
                    <path d="M18 52 L42 38 L42 50 L23 61 Z" />
                    <path d="M22 69 L42 56 L42 68 L27 78 Z" />

                    {/* Right Petals (Slanted upwards \ - Mirrored) */}
                    <path d="M85 35 L58 20 L58 32 L80 44 Z" />
                    <path d="M82 52 L58 38 L58 50 L77 61 Z" />
                    <path d="M78 69 L58 56 L58 68 L73 78 Z" />
                </svg>

                {/* Text Logo */}
                <div className="flex flex-col select-none">
                    <span className="text-2xl font-black tracking-wide text-white leading-none">
                        SGDF
                    </span>
                    <span className="text-[10px] font-bold tracking-wider text-white/70 uppercase mt-1 leading-tight">
                        Sistema Distribuidora de
                    </span>
                    <span className="text-[10px] font-bold tracking-wider text-white/70 uppercase leading-none">
                        Flores
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 sidebar-scroll overflow-y-auto">
                {filteredItems.map((item) => (
                    <SidebarNavItem
                        key={item.key}
                        item={item}
                        isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
                    />
                ))}
            </nav>

            {/* User info + Logout */}
            <div className="border-t border-white/10 p-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm uppercase">
                        {userName?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{userName}</p>
                        <p className="text-[10px] text-white/50 uppercase tracking-wider">{ROLE_LABELS[userRole]}</p>
                    </div>
                </div>
                <form action="/api/auth/logout" method="POST">
                    <button
                        type="submit"
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-white/60 hover:text-white hover:bg-white/10 rounded-md transition-all duration-200"
                    >
                        <LogOut size={16} />
                        Cerrar Sesión
                    </button>
                </form>
            </div>
        </aside>
    );
}
