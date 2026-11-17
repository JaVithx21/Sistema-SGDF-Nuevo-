# Registro de defectos (Incremento 2)

| ID | Defecto | Severidad | Estado | Corrección y prueba |
|---|---|---|---|---|
| DEF-09 | `liquidar_ruta` (SECURITY DEFINER, sin control de rol) se podía ejecutar con la clave pública y marcaba cualquier ruta como completada | Alta / P0 | Cerrado | PR #14: sin EXECUTE para anon, public ni authenticated · AC-SEC-02 en `permisos.db.test.ts` |
| DEF-10 | Cualquier usuario con sesión, incluido el chofer, leía clientes, pedidos y pagos, insertaba pagos y modificaba clientes y pedidos | Alta / P0 | Cerrado | PR #14: políticas con `private.es_personal_oficina()` · AC-SEC-01 · PR #15: rol explícito en las acciones (AC-SEC-03) |
| DEF-11 | `sync_checkpoint` guardaba el cobro en `checkpoint_pagos` sin crear el pago: el saldo no cambiaba | Media / P1 | Cerrado | PR #14: ejecución revocada · el cobro se registra en `pagos` según ADR-03 (PR #17) |
| DEF-12 | La documentación del Incremento 1 quedó en `docs/docs` y los enlaces no funcionaban | Baja / P2 | Cerrado | PR #11 |
| DEF-13 | DEC-07 proponía una alerta sobre 3 s que el código no registraba | Baja / P2 | Cerrado | PR #13: advertencia visible · `ors.test.ts` con reloj simulado |
| DEF-14 | `guardarRuta()` guardaba el orden, los km y la duración que enviaba el navegador sin verificar que los hubiera calculado el servidor | Alta / P0 | Cerrado | PR #16: firma HMAC del cálculo · `firma.test.ts` y `guardar-ruta.test.ts` (AC-02-guardado) |
| DEF-15 | El guardado hacía dos inserciones sin transacción; si fallaba la segunda, la ruta quedaba a medias hasta la compensación | Alta / P0 | Cerrado | PR #18: `guardar_ruta()` transaccional · PR #20: la app la usa · `guardar-ruta.db.test.ts` (RNF-INT-02) |

## Riesgos

| ID | Riesgo | Estado |
|---|---|---|
| RSK-11 | Permisos abiertos en clientes, pedidos, pagos y funciones heredadas | Mitigado (DEF-09, DEF-10, AC-SEC-03) |
| RSK-13 | Doble cobro o saldo inconsistente | Mitigado (`uq_pago_parada`, RNF-CONF-02, RNF-INT-01) |
| RSK-14 | Ampliar `marcar_parada` y `mi_ruta_hoy` rompe Mi ruta | Mitigado (REG-01 y REG-02 en CI) |
| RSK-17 | Guardado de ruta no atómico | Mitigado (DEF-15) |
| RSK-18 | Ruta guardada sin validación definitiva | Mitigado (DEF-14 y revalidación en `guardar_ruta()`) |
| RSK-01 | Cuota de ORS (50 optimizaciones al día) | Vigente: respaldo local «simulada» |
| RSK-12 | Una sola base compartida, sin entorno de pruebas | Vigente: cada migración se prueba antes en PGlite |

## Limitaciones conocidas

- `guardar_ruta()` usa `puede_gestionar_rutas()`, que admite al gerente, mientras que `/rutas` en la app es solo para admin y jefe de operaciones. Es coherente con el RLS de rutas existente y queda para el Incremento 3.
- Un cobro por parada: varios pagos para el mismo pedido en una entrega quedan fuera de alcance (ADR-03).
- Las pruebas de la base corren en PGlite dentro del CI. La verificación contra Supabase se ejecuta en local (`npm run humo`), porque requiere credenciales que no van al CI.
