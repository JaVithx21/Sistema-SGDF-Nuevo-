import { beforeEach, describe, expect, it, vi } from 'vitest';

// Acción completa marcarParada() con el cobro (PBI-11.1, observación C10):
// sesión, cookies y Supabase son dobles; se comprueba qué llega a marcar_parada()
// y que un error nunca se informe como éxito.
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const sesion = vi.hoisted(() => ({ role: 'chofer' as string }));
vi.mock('@/lib/security/auth-guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'uid-chofer' }, role: sesion.role, error: null })),
}));

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ rpc }) }));

import { marcarParada } from './actions';

const BASE = { p_parada_id: 5, p_estado: 'entregado', p_motivo: null };

describe('marcarParada() con cobro (PBI-11.1)', () => {
    beforeEach(() => {
        sesion.role = 'chofer';
        rpc.mockReset().mockResolvedValue({ error: null });
    });

    it('AC-COB-01: efectivo envía monto y método en la misma llamada', async () => {
        const res = await marcarParada(5, 'entregado', undefined, { opcion: 'efectivo', monto: 25_000 });

        expect(res).toEqual({ success: true });
        expect(rpc).toHaveBeenCalledOnce();
        expect(rpc).toHaveBeenCalledWith('marcar_parada', { ...BASE, p_monto: 25_000, p_metodo: 'efectivo', p_referencia: null });
    });

    it('AC-COB-02: transferencia parcial envía la referencia recortada', async () => {
        await marcarParada(5, 'entregado', undefined, { opcion: 'transferencia', monto: 10_000, referencia: ' OP-1 ' });
        expect(rpc).toHaveBeenCalledWith('marcar_parada', { ...BASE, p_monto: 10_000, p_metodo: 'transferencia', p_referencia: 'OP-1' });
    });

    it('AC-COB-03: sin cobro envía los parámetros del cobro en null', async () => {
        await marcarParada(5, 'entregado', undefined, { opcion: 'sin_cobro' });
        expect(rpc).toHaveBeenCalledWith('marcar_parada', { ...BASE, p_monto: null, p_metodo: null, p_referencia: null });
    });

    it('REG-01: un fallo con motivo se registra sin cobro, como en el Incremento 1', async () => {
        await marcarParada(5, 'fallido', 'Cliente ausente');
        expect(rpc).toHaveBeenCalledWith('marcar_parada', {
            p_parada_id: 5, p_estado: 'fallido', p_motivo: 'Cliente ausente', p_monto: null, p_metodo: null, p_referencia: null,
        });
    });

    it.each<[string, Parameters<typeof marcarParada>[3]]>([
        ['monto 0', { opcion: 'efectivo', monto: 0 }],
        ['monto negativo', { opcion: 'efectivo', monto: -1 }],
        ['transferencia sin referencia', { opcion: 'transferencia', monto: 1_000 }],
        ['método inválido', { opcion: 'cheque' as 'efectivo', monto: 1_000 }],
    ])('AC-COB-05: rechaza %s sin llamar a la base', async (_caso, cobro) => {
        const res = await marcarParada(5, 'entregado', undefined, cobro);
        expect(res.success).toBe(false);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('una entrega fallida no puede llevar cobro', async () => {
        const res = await marcarParada(5, 'fallido', 'Local cerrado', { opcion: 'efectivo', monto: 1_000 });
        expect(res).toEqual({ success: false, error: 'Una entrega fallida no registra cobro.' });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('AC-COB-05: el tope del saldo lo decide la base y su mensaje llega tal cual', async () => {
        rpc.mockResolvedValue({ error: { code: 'P0001', message: 'El monto supera el saldo por cobrar ($25.000).' } });
        const res = await marcarParada(5, 'entregado', undefined, { opcion: 'efectivo', monto: 30_000 });
        expect(res).toEqual({ success: false, error: 'El monto supera el saldo por cobrar ($25.000).' });
    });

    it('AC-COB-04: un doble envío informa que la parada ya estaba registrada', async () => {
        rpc.mockResolvedValue({ error: { code: 'P0001', message: 'Esta parada ya fue marcada como entregada; no se puede cambiar.' } });
        const res = await marcarParada(5, 'entregado', undefined, { opcion: 'efectivo', monto: 25_000 });
        expect(res).toEqual({ success: false, error: 'Esta parada ya fue marcada como entregada; no se puede cambiar.' });
    });

    it('AC-COB-06: un error inesperado nunca se informa como éxito', async () => {
        rpc.mockResolvedValue({ error: { code: '08006', message: 'connection failure' } });
        const res = await marcarParada(5, 'entregado', undefined, { opcion: 'efectivo', monto: 25_000 });
        expect(res).toEqual({ success: false, error: 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.' });
    });

    it('AC-SEC-01: una parada ajena responde 42501 con un mensaje claro', async () => {
        rpc.mockResolvedValue({ error: { code: '42501', message: 'x' } });
        const res = await marcarParada(5, 'entregado', undefined, { opcion: 'efectivo', monto: 1_000 });
        expect(res).toEqual({ success: false, error: 'Esta parada no pertenece a tu ruta.' });
    });

    it('solo un chofer puede marcar paradas', async () => {
        sesion.role = 'jefe_operaciones';
        const res = await marcarParada(5, 'entregado', undefined, { opcion: 'sin_cobro' });
        expect(res.success).toBe(false);
        expect(rpc).not.toHaveBeenCalled();
    });
});
