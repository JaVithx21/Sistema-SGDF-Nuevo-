import { describe, expect, it } from 'vitest';
import { isUserRole, ROLE_HOME, ROLE_PROTECTED_ROUTES, USER_ROLES } from './roles';

// DEF-02 / RSK-09: un rol fuera de la fuente única se deniega (fail-closed)

describe('isUserRole', () => {
    it.each(USER_ROLES)('reconoce el rol %s', (rol) => {
        expect(isUserRole(rol)).toBe(true);
    });

    it.each(['superadmin', 'Admin', 'CHOFER', ' admin', 'admin ', '', 'bodeguero'])(
        'rechaza el texto %j',
        (valor) => {
            expect(isUserRole(valor)).toBe(false);
        }
    );

    it.each([null, undefined, 0, 1, true, {}, ['admin']])('rechaza el valor no string %j', (valor) => {
        expect(isUserRole(valor)).toBe(false);
    });
});

describe('rutas por rol', () => {
    it('todo rol tiene pantalla de inicio', () => {
        for (const rol of USER_ROLES) expect(ROLE_HOME[rol]).toMatch(/^\//);
    });

    it('solo el chofer entra a /mi-ruta', () => {
        const miRuta = ROLE_PROTECTED_ROUTES.find((r) => r.prefix === '/mi-ruta');
        expect(miRuta?.roles).toEqual(['chofer']);
    });

    it('el chofer no aparece en ningún módulo del panel', () => {
        const panel = ROLE_PROTECTED_ROUTES.filter((r) => r.prefix !== '/mi-ruta');
        for (const ruta of panel) expect(ruta.roles).not.toContain('chofer');
    });
});
