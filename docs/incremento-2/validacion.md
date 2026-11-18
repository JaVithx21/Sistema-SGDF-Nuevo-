# Validación del Incremento 2 — Ensayo de jornada

**Tipo:** ensayo de jornada **simulado**, ejecutado por el equipo con la autorización del jefe de operaciones.
**Ejecución:** Martín Ferrada operó los roles de jefe de operaciones y de chofer (`chofer.prueba@sgdf.test`) sobre la versión candidata `v0.3.0-rc.1`.
**Evidencia:** video de la demostración: https://www.youtube.com/watch?v=tlduUjraRNE. Los tiempos citados corresponden a la versión con títulos del video.

## Datos del ensayo

4 pedidos de ensayo, cargados con `supabase/seed.sql` y un cuarto cliente sin ubicación:

| Cliente | Saldo inicial | Caso |
|---|---|---|
| Florería Santa Cruz (seed) | $40.000 | Efectivo por el total, con doble toque |
| Flores Marchigüe (seed) | $25.000 | Montos inválidos, sin conexión y transferencia parcial de $10.000 |
| Florería Palmilla (seed) | $0 (pagado) | Entrega sin cobro |
| Florería Peralillo (seed) | $30.000, sin ubicación | Corrección en el mapa y "No entregado" con motivo |

## Resultados

| Hipótesis | Señal (meta) | Medición en el video | Resultado | Decisión |
|---|---|---|---|---|
| H-01 | SE-01 ≤10 min | Inicio de la selección de pedidos (01:03) → clic en Guardar (01:35) | **32 s** · cumple | Se mantiene; se avanza a la liquidación (PBI-14) |
| H-03 | SE-03: todo Fallido con motivo | Peralillo queda «No entregado · Cliente ausente», visible para el jefe | **1 de 1** · cumple | Se mantiene |
| H-04 | SE-04 ≤5 min y totales que coinciden | Clic en la ruta (03:52) → tarjeta «Cobros de la ruta» (03:52) | **Inmediato (<1 s)**. Efectivo $40.000 · Transferencia $10.000 · Pendiente $45.000 · **coinciden** · cumple | Se mantiene; se avanza a la liquidación (PBI-14) |
| H-05 | SE-05: 0 pedidos del ensayo sin ubicación | Tras corregir Peralillo en el mapa | **0 de 4** · cumple | Se mantiene |
| H-02 | SE-02 ≥80 % | — | No medida | Requiere la ubicación por parada (PBI-14, Incremento 3) |

| Atributo | Meta | Medición en el video | Resultado |
|---|---|---|---|
| RNF-PERF-02 | ≤10 s | Clic en «Calcular» (01:19) → mapa con las paradas (01:25) | **6,1 s** con 4 paradas · cumple (una medición) |

## Observaciones

- **Confirmación del guardado:** el mensaje «Ruta #20 guardada» no alcanza a verse al final de la escena 2. Aparece al comienzo de la escena 10 (03:44).
- **Aviso «Sin ubicación»:** después de la corrección, el aviso muestra **1 pedido ajeno al ensayo**, el #22 «Flores La Paz (demo)», que existe en la base compartida. Ninguno de los 4 pedidos del ensayo quedó sin ubicación. Es una consecuencia de RSK-12 (una sola base compartida, sin entorno de pruebas).
- **Efecto en la base:** se verificó con una consulta en el SQL Editor (no grabada).

  | Cliente | Pagos de terreno | Detalle |
  |---|---|---|
  | Florería Santa Cruz (seed) | 1 | $40.000 en efectivo, **un solo pago pese al doble toque** (AC-COB-04) |
  | Flores Marchigüe (seed) | 1 | $10.000 por transferencia (AC-COB-02) |

  El mismo comportamiento lo verifican en CI la prueba RNF-CONF-02 (50 envíos repetidos dejan 1 pago) y la prueba de humo contra Supabase (20 pagos para 20 paradas).

## Interpretación y límites

- Las cuatro señales medidas cumplen su meta, por lo que se mantienen las decisiones de H-01, H-03, H-04 y H-05 y se avanza a la liquidación de ruta (PBI-14).
- **La medición corresponde a una jornada simulada:** 4 pedidos, datos de ensayo conocidos por quien opera y una sola medición por señal. No reemplaza la operación real.
- **Pendiente para el Incremento 3:** medir SE-01, SE-03 y SE-04 en una jornada real de operación con el jefe de operaciones, y medir SE-02 con la ubicación por parada.
