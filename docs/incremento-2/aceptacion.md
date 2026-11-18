# Criterios de aceptación: resultados (Incremento 2)

Cada criterio tiene una prueba automatizada que lo verifica en el CI. Las pruebas llevan el ID del criterio en su nombre.

| AC | Dado / Cuando / Entonces | Resultado | Evidencia |
|---|---|---|---|
| AC-COB-01 | Saldo $25.000 → el chofer entrega y cobra $25.000 en efectivo → parada entregada, 1 pago vinculado a la parada, saldo 0 y el jefe lo ve | ✅ Pasa | `src/test/db/cobro.db.test.ts` · `src/app/(chofer)/mi-ruta/marcar-parada.test.ts` · `src/lib/rutas/resumen-cobros.test.ts` |
| AC-COB-02 | Transferencia parcial de $10.000 con referencia → saldo $15.000 y pendiente visible | ✅ Pasa | `cobro.db.test.ts` · `marcar-parada.test.ts` · `resumen-cobros.test.ts` |
| AC-COB-03 | Pedido pagado o a crédito → entregado sin cobro, sin pago nuevo | ✅ Pasa | `cobro.db.test.ts` · `validar-cobro.test.ts` |
| AC-COB-04 | Doble toque o reintento → sigue habiendo 1 pago y se informa que ya estaba registrada | ✅ Pasa | `cobro.db.test.ts` (RNF-CONF-02: 50 envíos → 1 pago) · botón deshabilitado mientras guarda |
| AC-COB-05 | Monto mayor que el saldo, 0, negativo o transferencia sin referencia → rechazo y nada cambia | ✅ Pasa | `cobro.db.test.ts` · `validar-cobro.test.ts` · `marcar-parada.test.ts` |
| AC-COB-06 | Falla la conexión o la base → no se informa éxito; parada y pago sin cambios | ✅ Pasa | `cobro.db.test.ts` (todo o nada) · `marcar-parada.test.ts` (un error nunca es éxito) |
| AC-COORD-01 | Cliente sin ubicación → ajustar el marcador y guardar → coordenadas reemplazadas | ✅ Pasa | `src/lib/clientes/coordenadas.test.ts` |
| AC-01-límite | Cambio de dirección → se vuelve a geocodificar y se reemplazan las coordenadas | ✅ Pasa (en el Incremento 1 era parcial) | `coordenadas.test.ts` |
| AC-02-guardado | Ruta reordenada, con un pedido agregado o con km alterados → «La ruta fue modificada» y nada se guarda | ✅ Pasa | `src/lib/rutas/firma.test.ts` · `src/app/(dashboard)/rutas/guardar-ruta.test.ts` · `src/test/db/guardar-ruta.db.test.ts` |
| AC-SEC-01 | El chofer cobra en una parada ajena o consulta clientes, pedidos o pagos → 42501 o 0 filas | ✅ Pasa | `permisos.db.test.ts` · `cobro.db.test.ts` · `npm run humo` |
| AC-SEC-02 | Sin sesión → `liquidar_ruta` o `sync_checkpoint` → permiso denegado | ✅ Pasa | `permisos.db.test.ts` · `npm run humo` |
| AC-SEC-03 | Ninguna server action se ejecuta solo con sesión | ✅ Pasa | `src/lib/security/acciones-con-rol.test.ts` |
| AC-REG-01 | Fallido con motivo → estado y motivo persisten, sin pago | ✅ Pasa | `cobro.db.test.ts` · `marcar-parada.test.ts` |

## Atributos de calidad

| ID | Condición | Meta | Verificación |
|---|---|---|---|
| RNF-CONF-02 | 50 envíos repetidos del mismo cobro | 1 pago, saldo descontado una vez | `cobro.db.test.ts` (en CI) |
| RNF-INT-01 | Pedidos tras cobros de oficina y de terreno | total_pagado = suma de pagos, saldo ≥ 0 | `cobro.db.test.ts` (en CI) · `npm run humo` |
| RNF-INT-02 | Falla una parada a mitad del guardado | 0 rutas y 0 paradas a medias | `guardar-ruta.db.test.ts` (en CI) |
| RNF-SEG-02 | Chofer y anon contra tablas y funciones | 0 filas ajenas y 0 ejecuciones | `permisos.db.test.ts` (en CI) |
| RNF-PERF-03 | Registrar entrega con cobro contra Supabase, 20 repeticiones | p95 ≤ 2 s | ✅ Mediana 197 ms · p95 206 ms · máx. 213 ms (17-11-2026, `npm run humo` → `humo-supabase.json`) |

**Prueba de humo contra Supabase (17-11-2026):** 17/17 verificaciones correctas, con los roles reales sobre la base del proyecto: permisos de anon y del chofer, `mi_ruta_hoy` (17 columnas, sin datos prohibidos), rechazos del cobro, entrega con cobro en 20 paradas, doble envío, cuadratura del jefe ($400.000 cobrados = $400.000 registrados) y `guardar_ruta`. Resultado en [`humo-supabase.json`](humo-supabase.json).

## Regresión del Incremento 1

El paso **"Regresión prioritaria (Incremento 1)"** del CI ejecuta `npm run test:regresion`, es decir, las pruebas REG-01 a REG-05: fallido con motivo, privacidad de `mi_ruta_hoy`, ruta única, cálculo con ORS y respaldo, y geocodificación que no bloquea. Todas siguieron en verde con los cambios del cobro y del guardado.
