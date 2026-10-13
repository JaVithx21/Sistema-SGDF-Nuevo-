import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LogOut, Truck } from 'lucide-react';
import { ROLE_HOME, isUserRole } from '@/constants/roles';

// ═══════════════════════════════════════════════════════════════════════════
//  Layout del chofer — vista móvil, sin el sidebar del panel.
//  Segunda línea de defensa (OWASP A01): el middleware ya restringe /mi-ruta
//  al rol chofer, pero este layout lo vuelve a verificar en el servidor.
// ═══════════════════════════════════════════════════════════════════════════

export default async function ChoferLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    let { data: perfil } = await supabase
        .from('usuarios')
        .select('nombre, rol')
        .eq('id', user.id)
        .single();

    if (!perfil && user.email) {
        const { data: perfilEmail } = await supabase
            .from('usuarios')
            .select('nombre, rol')
            .eq('email', user.email)
            .single();
        if (perfilEmail) perfil = perfilEmail;
    }

    if (!perfil?.rol || !isUserRole(perfil.rol)) {
        redirect('/login?error_description=Tu+cuenta+no+tiene+un+perfil+asignado.+Contacta+al+administrador.');
    }

    if (perfil.rol !== 'chofer') {
        redirect(ROLE_HOME[perfil.rol]);
    }

    const userName = perfil.nombre || user.email || 'Chofer';

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="sticky top-0 z-10 bg-[#005088] text-white shadow-md">
                <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <Truck size={20} className="shrink-0" />
                        <p className="text-sm font-bold truncate">{userName}</p>
                    </div>
                    <form action="/api/auth/logout" method="POST">
                        <button
                            type="submit"
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-all"
                        >
                            <LogOut size={16} />
                            Salir
                        </button>
                    </form>
                </div>
            </header>
            <main className="max-w-xl mx-auto px-4 py-5">{children}</main>
        </div>
    );
}
