import { describe, expect, it } from 'vitest';
import { calcularResumenCobros } from './resumen-cobros';

describe('calcularResumenCobros (PBI-11.2)', () => {
    it('AC-COB-01 y AC-COB-02: suma por método y deja visible lo pendiente', () => {
        const r = calcularResumenCobros([
            { cobro: { monto: 25_000, metodo: 'efectivo' }, saldoPendiente: 0 },
            { cobro: { monto: 10_000, metodo: 'transferencia' }, saldoPendiente: 15_000 },
            { cobro: null, saldoPendiente: 0 }, // pagado antes: sin cobro (AC-COB-03)
            { cobro: null, saldoPendiente: 8_000 }, // no entregado: sigue pendiente
        ]);
        expect(r).toEqual({ efectivo: 25_000, transferencia: 10_000, pendiente: 23_000, cobrosRegistrados: 2 });
    });

    it('una ruta sin cobros queda en cero', () => {
        expect(calcularResumenCobros([])).toEqual({ efectivo: 0, transferencia: 0, pendiente: 0, cobrosRegistrados: 0 });
    });

    it('un saldo negativo (sobrepago) no resta de lo pendiente', () => {
        const r = calcularResumenCobros([{ cobro: null, saldoPendiente: -500 }]);
        expect(r.pendiente).toBe(0);
    });
});
