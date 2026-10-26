import { beforeEach, describe, expect, it, vi } from 'vitest';

// auth-guard importa 'server-only', next/headers y el cliente de Supabase:
// se reemplazan por dobles para probar solo la lógica de autorización.
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }));

const supabase = vi.hoisted(() => ({
    user: null as { id: string; email?: string } | null,
    /** Perfil por columna de búsqueda: `usuarios.id` y, de respaldo, `usuarios.email`. */
    perfiles: { id: null, email: null } as Record<'id' | 'email', { rol: unknown } | null>,
}));

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({
        auth: { getUser: async () => ({ data: { user: supabase.user } }) },
        from: () => ({
            select: () => ({
                eq: (columna: 'id' | 'email') => ({
                    single: async () => ({ data: supabase.perfiles[columna] }),
                }),
            }),
        }),
    }),
}));

import { requireAuth } from './auth-guard';

function conSesion(rol: unknown) {
    supabase.user = { id: 'uid-1', email: 'u@sgdf.cl' };
    supabase.perfiles = { id: { rol }, email: null };
}

beforeEach(() => {
    supabase.user = null;
    supabase.perfiles = { id: null, email: null };
});

describe('requireAuth', () => {
    it('deniega sin sesión', async () => {
        const res = await requireAuth();
        expect(res.user).toBeNull();
        expect(res.error).toMatch(/No autenticado/);
    });

    it('deniega si el usuario no tiene perfil', async () => {
        supabase.user = { id: 'uid-1', email: 'u@sgdf.cl' };
        const res = await requireAuth();
        expect(res.user).toBeNull();
        expect(res.error).toMatch(/no tiene un perfil de rol/);
    });

    it.each(['superadmin', 'Admin', 'bodeguero', 5])(
        'deniega un rol desconocido (%j) aunque no se pida rol mínimo (DEF-02, RSK-09)',
        async (rol) => {
            conSesion(rol);
            const res = await requireAuth();
            expect(res.user).toBeNull();
            expect(res.role).toBeUndefined();
            expect(res.error).toMatch(/rol no reconocido/);
        }
    );

    it('deniega un rol desconocido también cuando se pide rol mínimo', async () => {
        // Sin el chequeo previo, `undefined < n` es false y concedería acceso.
        conSesion('superadmin');
        const res = await requireAuth('chofer');
        expect(res.user).toBeNull();
    });

    it('acepta un rol válido y lo devuelve', async () => {
        conSesion('chofer');
        const res = await requireAuth();
        expect(res.error).toBeNull();
        expect(res.role).toBe('chofer');
    });

    it('respeta la jerarquía: chofer no alcanza vendedor', async () => {
        conSesion('chofer');
        const res = await requireAuth('vendedor');
        expect(res.user).toBeNull();
        expect(res.error).toMatch(/Se requiere rol "vendedor"/);
    });

    it('respeta la jerarquía: gerente alcanza jefe_operaciones', async () => {
        conSesion('gerente');
        const res = await requireAuth('jefe_operaciones');
        expect(res.role).toBe('gerente');
    });

    it('busca el perfil por email si no lo encuentra por id', async () => {
        supabase.user = { id: 'uid-1', email: 'u@sgdf.cl' };
        supabase.perfiles = { id: null, email: { rol: 'admin' } };
        const res = await requireAuth('admin');
        expect(res.role).toBe('admin');
    });
});
