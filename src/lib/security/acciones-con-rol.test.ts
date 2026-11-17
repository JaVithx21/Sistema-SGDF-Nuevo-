import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// AC-SEC-03 (RSK-11): ninguna server action se ejecuta solo con sesión. Una
// acción nueva que llame a requireAuth() sin rol hace fallar el CI.

const SRC = fileURLToPath(new URL('../..', import.meta.url));
const APP = join(SRC, 'app');

function archivosDeAcciones(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) return archivosDeAcciones(ruta);
        return e.name === 'actions.ts' ? [ruta] : [];
    });
}

const relativa = (ruta: string) => relative(SRC, ruta).split('\\').join('/');

/** Llaman a requireAuth() sin rol, pero validan el rol exacto en la línea siguiente. */
const EXCEPCIONES: Record<string, string> = {
    'app/(chofer)/mi-ruta/actions.ts': "role !== 'chofer'",
    'app/(dashboard)/rutas/actions.ts': 'ROLES_PLANIFICADOR.includes(role)',
};

describe('AC-SEC-03: rol explícito en las acciones del servidor', () => {
    const archivos = archivosDeAcciones(APP);

    it('encuentra las acciones del servidor', () => {
        expect(archivos.length).toBeGreaterThan(5);
    });

    it('ninguna acción llama a requireAuth() sin rol fuera de las excepciones', () => {
        const sinRol = archivos
            .filter((a) => /requireAuth\(\s*\)/.test(readFileSync(a, 'utf8')))
            .map(relativa)
            .filter((a) => !(a in EXCEPCIONES));
        expect(sinRol).toEqual([]);
    });

    it.each(Object.entries(EXCEPCIONES))('la excepción %s valida el rol exacto', (archivo, validacion) => {
        expect(readFileSync(join(SRC, archivo), 'utf8')).toContain(validacion);
    });
});
