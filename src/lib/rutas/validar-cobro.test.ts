import { describe, expect, it } from 'vitest';
import { parametrosCobro, validarCobro } from './validar-cobro';

const SALDO = 25_000;

describe('validarCobro (PBI-11.1)', () => {
    it('AC-COB-01: efectivo por el total del saldo', () => {
        expect(validarCobro({ opcion: 'efectivo', monto: 25_000, porCobrar: SALDO })).toEqual({
            ok: true,
            cobro: { monto: 25_000, metodo: 'efectivo', referencia: null },
        });
    });

    it('AC-COB-02: transferencia parcial con referencia (se recorta)', () => {
        expect(validarCobro({ opcion: 'transferencia', monto: 10_000, referencia: '  OP-4521 ', porCobrar: SALDO })).toEqual({
            ok: true,
            cobro: { monto: 10_000, metodo: 'transferencia', referencia: 'OP-4521' },
        });
    });

    it('AC-COB-03: sin cobro no exige monto', () => {
        expect(validarCobro({ opcion: 'sin_cobro', porCobrar: 0 })).toEqual({ ok: true, cobro: null });
    });

    it('en efectivo se ignora la referencia', () => {
        const r = validarCobro({ opcion: 'efectivo', monto: 5_000, referencia: 'x', porCobrar: SALDO });
        expect(r).toEqual({ ok: true, cobro: { monto: 5_000, metodo: 'efectivo', referencia: null } });
    });

    it('AC-COB-05: rechaza un monto mayor que el saldo', () => {
        expect(validarCobro({ opcion: 'efectivo', monto: 30_000, porCobrar: SALDO })).toEqual({
            ok: false,
            error: 'El monto supera el saldo por cobrar ($25.000).',
        });
    });

    it.each([0, -1, Number.NaN, '25000', null, undefined])('AC-COB-05: rechaza el monto %j', (monto) => {
        expect(validarCobro({ opcion: 'efectivo', monto, porCobrar: SALDO })).toEqual({ ok: false, error: 'El monto debe ser mayor que 0.' });
    });

    it('rechaza centavos: el monto es en pesos enteros', () => {
        expect(validarCobro({ opcion: 'efectivo', monto: 100.5, porCobrar: SALDO })).toEqual({
            ok: false,
            error: 'El monto debe ser un número entero de pesos.',
        });
    });

    it.each([undefined, '', '   '])('AC-COB-05: transferencia sin referencia (%j)', (referencia) => {
        expect(validarCobro({ opcion: 'transferencia', monto: 10_000, referencia, porCobrar: SALDO })).toEqual({
            ok: false,
            error: 'Indica la referencia de la transferencia.',
        });
    });

    it('acepta una referencia de 100 caracteres y rechaza una de 101', () => {
        expect(validarCobro({ opcion: 'transferencia', monto: 1, referencia: 'a'.repeat(100), porCobrar: SALDO }).ok).toBe(true);
        expect(validarCobro({ opcion: 'transferencia', monto: 1, referencia: 'a'.repeat(101), porCobrar: SALDO })).toEqual({
            ok: false,
            error: 'La referencia no puede superar 100 caracteres.',
        });
    });

    it.each(['cheque', 'otro', '', null])('rechaza el método %j', (opcion) => {
        expect(validarCobro({ opcion, monto: 1_000, porCobrar: SALDO })).toEqual({
            ok: false,
            error: 'Elige cómo se cobró: efectivo, transferencia o sin cobro.',
        });
    });

    it('si el pedido ya está pagado, solo admite «Sin cobro»', () => {
        expect(validarCobro({ opcion: 'efectivo', monto: 1_000, porCobrar: 0 })).toEqual({
            ok: false,
            error: 'Este pedido no tiene saldo por cobrar: marca «Sin cobro».',
        });
    });
});

describe('parametrosCobro', () => {
    it('arma los parámetros de marcar_parada()', () => {
        expect(parametrosCobro({ monto: 10_000, metodo: 'transferencia', referencia: 'OP-1' })).toEqual({
            p_monto: 10_000,
            p_metodo: 'transferencia',
            p_referencia: 'OP-1',
        });
    });

    it('sin cobro envía los tres en null', () => {
        expect(parametrosCobro(null)).toEqual({ p_monto: null, p_metodo: null, p_referencia: null });
    });
});
