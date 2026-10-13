import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { isUserRole, type UserRole } from '@/constants/roles';
import type { User } from '@supabase/supabase-js';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface AuthSuccess {
    user: User;
    /** Rol validado contra la fuente única; útil cuando se exige un rol exacto. */
    role: UserRole;
    error: null;
}

interface AuthFailure {
    user: null;
    role?: undefined;
    error: string;
}

type AuthResult = AuthSuccess | AuthFailure;

// ─── Jerarquía de Roles ─────────────────────────────────────────────────────
// admin (5) > gerente (4) > jefe_operaciones (3) > vendedor (2) > chofer (1)

const ROLE_HIERARCHY: Record<UserRole, number> = {
    admin: 5,
    gerente: 4,
    jefe_operaciones: 3,
    vendedor: 2,
    chofer: 1,
};

// ─── Guard Principal ────────────────────────────────────────────────────────
// Verifica autenticación, que el rol exista en la fuente única y, opcionalmente,
// un rol mínimo. Uso:
//   const { user, error } = await requireAuth();          // Auth + rol válido
//   const { user, error } = await requireAuth('gerente'); // Auth + rol mínimo
//   const { user, error } = await requireAuth('admin');   // Solo admin

export async function requireAuth(minimumRole?: UserRole): Promise<AuthResult> {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { user: null, error: 'No autenticado. Inicie sesión para continuar.' };
    }

    // Verificar rol del usuario (siempre, aunque no se pida rol mínimo)
    let { data: perfil } = await supabase
        .from('usuarios')
        .select('rol')
        .eq('id', user.id)
        .single();

    if (!perfil && user.email) {
        const { data: perfilEmail } = await supabase
            .from('usuarios')
            .select('rol')
            .eq('email', user.email)
            .single();
        if (perfilEmail) perfil = perfilEmail;
    }

    // OWASP A01: Fail-closed — si no hay perfil válido, denegar acceso
    if (!perfil?.rol) {
        return {
            user: null,
            error: 'Su cuenta no tiene un perfil de rol asignado. Contacte al administrador.',
        };
    }

    // Fail-closed: un rol que no está en la fuente única no tiene nivel, y
    // `undefined < n` es false, lo que concedería el acceso. Se deniega antes.
    if (!isUserRole(perfil.rol)) {
        return {
            user: null,
            error: 'Su cuenta tiene un rol no reconocido. Contacte al administrador.',
        };
    }

    // Sin rol mínimo, basta con estar autenticado y tener un rol válido
    if (!minimumRole) {
        return { user, role: perfil.rol, error: null };
    }

    const userLevel = ROLE_HIERARCHY[perfil.rol];
    const requiredLevel = ROLE_HIERARCHY[minimumRole];

    if (userLevel < requiredLevel) {
        return {
            user: null,
            error: `Sin autorización. Se requiere rol "${minimumRole}" o superior.`,
        };
    }

    return { user, role: perfil.rol, error: null };
}
