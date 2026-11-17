# ADR-03 — Registro del cobro en terreno junto con la entrega

**Estado:** Aceptada (el jefe de operaciones autorizó que el chofer vea el monto por cobrar, RSK-07)

## Contexto

PBI-11 requiere que el chofer registre el cobro al entregar. El saldo vive en `pagos`: los triggers recalculan `pedidos.total_pagado`, el saldo del pedido y el saldo del cliente. El esquema base trae `sync_checkpoint` y `checkpoint_pagos`, que **no** actualizan el saldo (DEF-11), y el chofer no consulta tablas directamente (DA-05, RNF-SEG-01).

## Alternativas

- **(a) `sync_checkpoint` y `checkpoint_pagos`, heredados:** el saldo no cambia; además, la función estaba abierta a anon.
- **(b) Dos llamadas desde la app, `marcar_parada` y luego una inserción en `pagos`:** no es atómico, y el chofer necesitaría permiso de escritura en `pagos`.
- **(c) Ampliar `marcar_parada` para registrar la entrega y el cobro en una sola transacción**, insertando en `pagos` con un vínculo único a la parada.

## Decisión

Alternativa **(c)**:
- `marcar_parada(p_parada_id, p_estado, p_motivo, p_monto, p_metodo, p_referencia)` valida la pertenencia de la parada, el estado, el monto, el método, la referencia y el saldo (con `FOR UPDATE`), y registra la entrega y el pago **en la misma transacción**.
- `pagos.parada_id` tiene la restricción única `uq_pago_parada`: como máximo un cobro por parada.
- `mi_ruta_hoy()` agrega **solo** `monto_por_cobrar`, el saldo de ese pedido.

Implementación: `supabase/migrations/20261117100000_cobro_en_terreno.sql` (PR #17) y `src/app/(chofer)/mi-ruta/actions.ts` (PR #19).

## Consecuencias

- **Una sola fuente del saldo:** los cobros de oficina y de terreno pasan por `pagos`.
- **Sin doble cobro:** un segundo envío se rechaza ("ya fue marcada"), y la restricción única es la última barrera (RNF-CONF-02).
- **El chofer ve el monto por cobrar del pedido, pero no el RUT, el saldo total del cliente ni el crédito:** `mi_ruta_hoy` pasa de 16 a 17 columnas y la prueba de privacidad (REG-02) se actualizó.
- `checkpoint_pagos` queda sin uso.

## Revisar cuando

- Se incorpore el modo offline, que requiere una cola de sincronización idempotente.
- Se permitan varios pagos por parada.
- Se integre una pasarela de pago.
