import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { RutaCalculada } from '@/types/planificador';

// DEF-14 / ADR-04: la ruta viaja al navegador entre calcularRuta() y
// guardarRuta(). El servidor firma lo que calculó y, al guardar, solo acepta
// esa misma ruta: si el navegador cambia el orden, una parada, los km o el
// trazado, la firma no coincide y no se guarda nada.

/** Un cálculo viejo puede no reflejar pedidos o capacidades actuales. */
const VIGENCIA_MS = 6 * 60 * 60 * 1000;

export interface ContextoFirma {
    sucursalId: number;
    choferId: number;
}

export type RutaSinFirma = Omit<RutaCalculada, 'firma'>;

export type VerificacionFirma = { ok: true } | { ok: false; motivo: 'alterada' | 'vencida' };

export class FirmaNoConfiguradaError extends Error {
    constructor() {
        super('RUTAS_FIRMA_SECRET no está configurado (mínimo 32 caracteres).');
    }
}

function secreto(): string {
    const valor = process.env.RUTAS_FIRMA_SECRET;
    if (!valor || valor.length < 32) throw new FirmaNoConfiguradaError();
    return valor;
}

/** Todo lo que guardarRuta() persiste o usa para decidir, en un orden fijo. */
function contenidoFirmado(ruta: RutaSinFirma, ctx: ContextoFirma, calculadaEn: number): string {
    const trazado = createHash('sha256').update(JSON.stringify(ruta.geojsonRuta ?? null)).digest('hex');
    return JSON.stringify([
        1, // versión del formato
        calculadaEn,
        ctx.sucursalId,
        ctx.choferId,
        ruta.paradas.map((p) => [p.pedidoId, p.orden, p.kmAcumulados ?? null, p.llegada ?? null]),
        ruta.pedidosNoAsignados,
        ruta.kmTotal,
        ruta.duracionMin,
        ruta.simulada,
        trazado,
        ruta.advertencias,
        ruta.litrosEstimados ?? null,
        ruta.costoCombustibleClp ?? null,
        ruta.precioLitroReferencia,
    ]);
}

function mac(contenido: string): string {
    return createHmac('sha256', secreto()).update(contenido).digest('hex');
}

/** Formato: "<calculadaEn en ms>.<HMAC-SHA256 en hex>". */
export function firmarRuta(ruta: RutaSinFirma, ctx: ContextoFirma, ahora = Date.now()): string {
    return `${ahora}.${mac(contenidoFirmado(ruta, ctx, ahora))}`;
}

export function verificarFirma(ruta: RutaCalculada, ctx: ContextoFirma, ahora = Date.now()): VerificacionFirma {
    const [marca, recibida, ...resto] = typeof ruta?.firma === 'string' ? ruta.firma.split('.') : [];
    const calculadaEn = Number(marca);
    if (resto.length > 0 || !Number.isSafeInteger(calculadaEn) || !/^[0-9a-f]{64}$/.test(recibida ?? '')) {
        return { ok: false, motivo: 'alterada' };
    }

    let esperada: string;
    try {
        esperada = mac(contenidoFirmado(ruta, ctx, calculadaEn));
    } catch (err) {
        if (err instanceof FirmaNoConfiguradaError) throw err;
        return { ok: false, motivo: 'alterada' }; // estructura de la ruta inválida
    }
    if (!timingSafeEqual(Buffer.from(esperada, 'hex'), Buffer.from(recibida, 'hex'))) {
        return { ok: false, motivo: 'alterada' };
    }
    if (ahora - calculadaEn > VIGENCIA_MS || calculadaEn > ahora + 60_000) {
        return { ok: false, motivo: 'vencida' };
    }
    return { ok: true };
}
