import { describe, expect, it } from 'vitest';
import { componerMotivoFallo, validarMarcaParada } from './validar-estado';
import { MOTIVO_MAX_LENGTH } from '@/types/rutas';

// PBI-03 — AC-03-feliz, AC-03-límite y AC-03-error del cambio de estado de parada

describe('validarMarcaParada', () => {
    it('acepta una entrega y no envía motivo (AC-03-feliz)', () => {
        expect(validarMarcaParada(7, 'entregado', 'sobra')).toEqual({
            ok: true,
            valor: { paradaId: 7, estado: 'entregado', motivo: null },
        });
    });

    it('acepta un fallo con motivo y lo recorta', () => {
        expect(validarMarcaParada(7, 'fallido', '  Local cerrado  ')).toEqual({
            ok: true,
            valor: { paradaId: 7, estado: 'fallido', motivo: 'Local cerrado' },
        });
    });

    it.each([0, -1, 1.5, Number.NaN, '7', null, undefined])('rechaza la parada %s', (id) => {
        expect(validarMarcaParada(id, 'entregado')).toEqual({ ok: false, error: 'Parada no válida.' });
    });

    it.each(['pendiente', 'ENTREGADO', '', null])('rechaza el estado %s (AC-03-error)', (estado) => {
        expect(validarMarcaParada(1, estado)).toEqual({ ok: false, error: 'Estado no válido.' });
    });

    it.each([undefined, null, '', '   '])('exige motivo si es fallido: %s (AC-03-error)', (motivo) => {
        expect(validarMarcaParada(1, 'fallido', motivo)).toEqual({
            ok: false,
            error: 'Indica el motivo por el que no se pudo entregar.',
        });
    });

    it(`acepta un motivo de exactamente ${MOTIVO_MAX_LENGTH} caracteres (AC-03-límite)`, () => {
        const motivo = 'x'.repeat(MOTIVO_MAX_LENGTH);
        expect(validarMarcaParada(1, 'fallido', motivo)).toMatchObject({ ok: true, valor: { motivo } });
    });

    it(`rechaza un motivo de ${MOTIVO_MAX_LENGTH + 1} caracteres (AC-03-límite)`, () => {
        expect(validarMarcaParada(1, 'fallido', 'x'.repeat(MOTIVO_MAX_LENGTH + 1))).toEqual({
            ok: false,
            error: `El motivo no puede superar ${MOTIVO_MAX_LENGTH} caracteres.`,
        });
    });

    it('mide el largo después de recortar espacios', () => {
        const motivo = ` ${'x'.repeat(MOTIVO_MAX_LENGTH)} `;
        expect(validarMarcaParada(1, 'fallido', motivo).ok).toBe(true);
    });
});

describe('componerMotivoFallo', () => {
    it('exige elegir un motivo', () => {
        expect(componerMotivoFallo('', '')).toEqual({ ok: false, error: 'Elige un motivo.' });
    });

    it('usa la opción elegida tal cual e ignora el detalle', () => {
        expect(componerMotivoFallo('Cliente ausente', 'algo')).toEqual({ ok: true, valor: 'Cliente ausente' });
    });

    it.each(['', '   '])("'Otro' exige detalle escrito: '%s' (AC-03-error)", (detalle) => {
        expect(componerMotivoFallo('Otro', detalle)).toEqual({ ok: false, error: 'Describe el motivo.' });
    });

    it("'Otro' con detalle se guarda como 'Otro: <detalle>'", () => {
        expect(componerMotivoFallo('Otro', '  portón con candado ')).toEqual({
            ok: true,
            valor: 'Otro: portón con candado',
        });
    });
});
