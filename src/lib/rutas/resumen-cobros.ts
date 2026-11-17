// Resumen de cobros de una ruta para el jefe de operaciones (PBI-11.2, H-04).
// Lógica pura: recibe las paradas con su cobro (pagos.parada_id) y el saldo
// actual de cada pedido.

import type { MetodoCobro } from './validar-cobro';

export interface ParadaParaResumen {
    cobro: { monto: number; metodo: MetodoCobro } | null;
    /** Saldo actual del pedido (pedidos.saldo), después de los cobros. */
    saldoPendiente: number;
}

export interface ResumenCobros {
    efectivo: number;
    transferencia: number;
    /** Lo que falta cobrar en los pedidos de la ruta. */
    pendiente: number;
    cobrosRegistrados: number;
}

export function calcularResumenCobros(paradas: ParadaParaResumen[]): ResumenCobros {
    return paradas.reduce<ResumenCobros>(
        (acc, p) => {
            if (p.cobro) {
                acc[p.cobro.metodo] += p.cobro.monto;
                acc.cobrosRegistrados += 1;
            }
            acc.pendiente += Math.max(p.saldoPendiente, 0);
            return acc;
        },
        { efectivo: 0, transferencia: 0, pendiente: 0, cobrosRegistrados: 0 }
    );
}
