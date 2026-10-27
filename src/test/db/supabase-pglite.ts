import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

// ═══════════════════════════════════════════════════════════════════════════
//  Base de pruebas en memoria (PGlite) con lo mínimo de Supabase que las
//  migraciones dan por hecho: roles, esquema `auth`, auth.uid() leyendo el JWT
//  de la sesión y los permisos por defecto que Supabase concede a anon y
//  authenticated. No se conecta a ninguna base real.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_DIR = fileURLToPath(new URL('../../../supabase/', import.meta.url));

const SHIM_SUPABASE = `
    CREATE SCHEMA IF NOT EXISTS extensions;

    CREATE ROLE anon NOLOGIN NOINHERIT;
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;

    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
        id                 uuid PRIMARY KEY,
        email              text UNIQUE,
        raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
    );

    -- Mismas definiciones que Supabase: leen los claims que PostgREST fija por request
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        )::uuid
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT coalesce(
            nullif(current_setting('request.jwt.claim.role', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
        )::text
    $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(
            nullif(current_setting('request.jwt.claim', true), ''),
            nullif(current_setting('request.jwt.claims', true), '')
        )::jsonb
    $$;

    GRANT USAGE ON SCHEMA auth, extensions TO anon, authenticated, service_role;

    -- Supabase concede todo en public a estos roles por defecto; las migraciones
    -- deben quitarlo donde corresponda (p. ej. EXECUTE de anon en las funciones del chofer)
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
`;

export function leerSql(ruta: string): string {
    return readFileSync(SUPABASE_DIR + ruta, 'utf8');
}

/** Archivos de supabase/migrations en el orden en que se aplican. */
export function listarMigraciones(): string[] {
    return readdirSync(SUPABASE_DIR + 'migrations')
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => `migrations/${f}`);
}

export async function crearBaseConMigraciones(): Promise<PGlite> {
    const db = await PGlite.create({ extensions: { pgcrypto, uuid_ossp } });
    await db.exec(SHIM_SUPABASE);
    for (const migracion of listarMigraciones()) {
        await db.exec(leerSql(migracion));
    }
    return db;
}

/**
 * Ejecuta `fn` como lo haría una petición de la API: rol `authenticated` con
 * `sub` en el JWT, o `anon` si `sub` es null. Todo dentro de una transacción.
 */
export function comoUsuario<T>(db: PGlite, sub: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const rol = sub ? 'authenticated' : 'anon';
    return db.transaction(async (tx) => {
        await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: rol })]);
        await tx.exec(`SET LOCAL ROLE ${rol}`);
        return fn(tx);
    });
}
