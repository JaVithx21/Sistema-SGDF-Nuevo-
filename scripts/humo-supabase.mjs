// Prueba de humo contra Supabase real + medición RNF-PERF-03 (Incremento 2).
//
// Complementa las pruebas PGlite del CI (observación C10 de la segunda defensa):
// ejecuta las funciones del servidor contra la base del proyecto, con los roles
// reales, y deja el resultado en docs/incremento-2/humo-supabase.json.
//
// Requisitos:
//   1. Migraciones aplicadas, supabase/seed.sql y supabase/seed_medicion.sql
//      ejecutadas (ruta de hoy de 20 paradas para chofer.prueba@sgdf.test).
//   2. En .env.local (nunca en el repositorio): NEXT_PUBLIC_SUPABASE_URL,
//      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, HUMO_CHOFER_EMAIL,
//      HUMO_CHOFER_PASSWORD, HUMO_JEFE_EMAIL y HUMO_JEFE_PASSWORD.
//
// Uso: npm run humo
// Marca las 20 paradas como entregadas: para repetirla, volver a ejecutar
// supabase/seed_medicion.sql.

import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const FALTAN = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'HUMO_CHOFER_EMAIL', 'HUMO_CHOFER_PASSWORD', 'HUMO_JEFE_EMAIL', 'HUMO_JEFE_PASSWORD']
    .filter((v) => !process.env[v]);
if (FALTAN.length > 0) {
    console.error(`Faltan variables en .env.local: ${FALTAN.join(', ')}`);
    process.exit(2);
}

const UMBRAL_PERF_MS = 2000; // RNF-PERF-03: ≤2 s por registro
const COLUMNAS_PROHIBIDAS = ['rut', 'total', 'saldo', 'saldo_pendiente', 'total_pagado', 'limite_credito'];

const resultados = [];
function registrar(id, descripcion, ok, detalle = '') {
    resultados.push({ id, descripcion, ok, detalle });
    console.log(`${ok ? '✅' : '❌'} ${id.padEnd(16)} ${descripcion}${detalle ? ` — ${detalle}` : ''}`);
}

const nuevoCliente = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function iniciarSesion(email, password) {
    const cliente = nuevoCliente();
    const { error } = await cliente.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`No se pudo iniciar sesión (${error.message}).`);
    return cliente;
}

const percentil = (valores, p) => {
    const orden = [...valores].sort((a, b) => a - b);
    return orden[Math.min(orden.length - 1, Math.ceil((p / 100) * orden.length) - 1)];
};

// ─── 1. Sin sesión (anon) ────────────────────────────────────────────────────
const anon = nuevoCliente();
{
    const { error } = await anon.rpc('liquidar_ruta', { p_ruta_id: 1, p_km_reales: 1, p_bencina_real_lts: 1, p_precio_litro: 1 });
    registrar('AC-SEC-02', 'anon no puede ejecutar liquidar_ruta', !!error, error ? `rechazado (${error.code})` : 'SE EJECUTÓ');
}
{
    const { error } = await anon.rpc('marcar_parada', { p_parada_id: 1, p_estado: 'entregado' });
    registrar('AC-SEC-02', 'anon no puede ejecutar marcar_parada', !!error, error ? `rechazado (${error.code})` : 'SE EJECUTÓ');
}

// ─── 2. Chofer ───────────────────────────────────────────────────────────────
const chofer = await iniciarSesion(process.env.HUMO_CHOFER_EMAIL, process.env.HUMO_CHOFER_PASSWORD);

const { data: ruta, error: errRuta } = await chofer.rpc('mi_ruta_hoy');
const columnas = ruta?.[0] ? Object.keys(ruta[0]) : [];
registrar('REG-02', 'mi_ruta_hoy entrega 17 columnas con monto_por_cobrar',
    !errRuta && columnas.length === 17 && columnas.includes('monto_por_cobrar'),
    errRuta ? errRuta.message : `${ruta.length} paradas, ${columnas.length} columnas`);
const expuestas = columnas.filter((c) => COLUMNAS_PROHIBIDAS.includes(c));
registrar('RNF-SEG-01', 'mi_ruta_hoy no expone RUT, total, saldo del cliente ni crédito', expuestas.length === 0,
    expuestas.length ? `expone: ${expuestas.join(', ')}` : '');

for (const tabla of ['pagos', 'clientes', 'pedidos']) {
    const { data, error } = await chofer.from(tabla).select('id').limit(5);
    const filas = data?.length ?? 0;
    registrar('AC-SEC-01', `el chofer no lee ${tabla} directamente`, !!error || filas === 0, error ? `rechazado (${error.code})` : `${filas} filas`);
}
{
    const { error } = await chofer.rpc('guardar_ruta', { p_fecha: '2099-01-01', p_sucursal_id: 1, p_chofer_id: 1, p_paradas: [], p_resumen: {} });
    registrar('AC-SEC-01', 'el chofer no puede guardar rutas (guardar_ruta)', error?.code === '42501', error ? `rechazado (${error.code})` : 'SE EJECUTÓ');
}

const pendientes = (ruta ?? []).filter((p) => p.estado === 'pendiente' && Number(p.monto_por_cobrar) > 0);
if (pendientes.length === 0) {
    registrar('PRECONDICIÓN', 'hay paradas pendientes con saldo (seed_medicion.sql)', false, 'ejecutar supabase/seed_medicion.sql');
} else {
    const primera = pendientes[0];
    const saldo = Number(primera.monto_por_cobrar);

    // AC-COB-05: entradas inválidas se rechazan y no cambian nada
    {
        const { error } = await chofer.rpc('marcar_parada', { p_parada_id: primera.parada_id, p_estado: 'entregado', p_monto: saldo + 1, p_metodo: 'efectivo' });
        registrar('AC-COB-05', 'monto mayor que el saldo: rechazo de la base', error?.code === 'P0001', error?.message ?? 'SE GUARDÓ');
    }
    {
        const { error } = await chofer.rpc('marcar_parada', { p_parada_id: primera.parada_id, p_estado: 'entregado', p_monto: 1000, p_metodo: 'transferencia' });
        registrar('AC-COB-05', 'transferencia sin referencia: rechazo de la base', error?.code === 'P0001', error?.message ?? 'SE GUARDÓ');
    }
    {
        const { data } = await chofer.rpc('mi_ruta_hoy');
        const sigue = data?.find((p) => p.parada_id === primera.parada_id);
        registrar('AC-COB-06', 'tras los rechazos la parada sigue pendiente y con su saldo',
            sigue?.estado === 'pendiente' && Number(sigue?.monto_por_cobrar) === saldo);
    }

    // RNF-PERF-03 + AC-COB-01: entrega con cobro en efectivo por el saldo completo
    const tiempos = [];
    let fallos = 0;
    for (const p of pendientes) {
        const inicio = performance.now();
        const { error } = await chofer.rpc('marcar_parada', {
            p_parada_id: p.parada_id, p_estado: 'entregado', p_monto: Number(p.monto_por_cobrar), p_metodo: 'efectivo',
        });
        tiempos.push(performance.now() - inicio);
        if (error) fallos += 1;
    }
    const p50 = percentil(tiempos, 50);
    const p95 = percentil(tiempos, 95);
    const max = Math.max(...tiempos);
    registrar('AC-COB-01', `entrega con cobro en efectivo en ${pendientes.length} paradas`, fallos === 0, `${pendientes.length - fallos}/${pendientes.length} guardadas`);
    registrar('RNF-PERF-03', `registro de entrega con cobro ≤${UMBRAL_PERF_MS} ms (p95)`, p95 <= UMBRAL_PERF_MS,
        `mediana ${Math.round(p50)} ms · p95 ${Math.round(p95)} ms · máx ${Math.round(max)} ms`);

    // AC-COB-04: el doble envío no crea un segundo pago
    {
        const { error } = await chofer.rpc('marcar_parada', { p_parada_id: primera.parada_id, p_estado: 'entregado', p_monto: saldo, p_metodo: 'efectivo' });
        registrar('AC-COB-04', 'repetir el cobro de una parada ya marcada se rechaza', !!error && /ya fue marcada/.test(error.message), error?.message ?? 'SE GUARDÓ');
    }

    // ─── 3. Jefe de operaciones: cuadratura (RNF-INT-01, H-04) ──────────────
    const jefe = await iniciarSesion(process.env.HUMO_JEFE_EMAIL, process.env.HUMO_JEFE_PASSWORD);
    const ids = pendientes.map((p) => p.parada_id);
    const esperado = pendientes.reduce((acc, p) => acc + Number(p.monto_por_cobrar), 0);
    {
        const { data: pagos, error } = await jefe.from('pagos').select('parada_id, monto').in('parada_id', ids);
        const total = (pagos ?? []).reduce((acc, p) => acc + Number(p.monto), 0);
        registrar('AC-COB-04', 'exactamente un pago por parada cobrada', !error && pagos.length === ids.length, `${pagos?.length ?? 0} pagos para ${ids.length} paradas`);
        registrar('RNF-INT-01', 'el jefe ve el total cobrado igual a lo registrado por el chofer', !error && total === esperado,
            `cobrado $${total.toLocaleString('es-CL')} · esperado $${esperado.toLocaleString('es-CL')}`);
    }
    {
        const { error } = await jefe.rpc('guardar_ruta', { p_fecha: '2099-01-01', p_sucursal_id: 1, p_chofer_id: 1, p_paradas: [], p_resumen: {} });
        registrar('DEF-15', 'guardar_ruta revalida en la base y rechaza datos inválidos (P0001)', error?.code === 'P0001', error?.message ?? 'SE GUARDÓ');
    }

    resultados.push({ medicion: 'RNF-PERF-03', repeticiones: tiempos.length, medianaMs: Math.round(p50), p95Ms: Math.round(p95), maxMs: Math.round(max) });
}

// ─── Resultado ───────────────────────────────────────────────────────────────
const verificaciones = resultados.filter((r) => 'ok' in r);
const aprobadas = verificaciones.filter((r) => r.ok).length;
const salida = {
    fecha: new Date().toISOString(),
    node: process.version,
    proyecto: new globalThis.URL(URL).host,
    aprobadas,
    total: verificaciones.length,
    resultados,
};
writeFileSync(new globalThis.URL('../docs/incremento-2/humo-supabase.json', import.meta.url), `${JSON.stringify(salida, null, 2)}\n`);

console.log(`\n${aprobadas}/${verificaciones.length} verificaciones correctas → docs/incremento-2/humo-supabase.json`);
console.log('Para repetirla: volver a ejecutar supabase/seed_medicion.sql en el SQL Editor.');
process.exit(aprobadas === verificaciones.length ? 0 : 1);
