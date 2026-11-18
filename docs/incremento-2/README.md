# Incremento Funcional 2 — Cobro en terreno y estabilización

**Versión candidata:** `v0.3.0-rc.1`
**Equipo:** Javier Catalán · Martín Ferrada
**Parte de:** `v0.2.0-rc.1` (Incremento 1: ruteo con capacidad y ventanas, Mi ruta con estado persistido)

## Objetivo

Al marcar **Entregado**, el chofer registra el cobro: efectivo, transferencia con referencia o sin cobro. El saldo del pedido se descuenta **una sola vez**, y el jefe de operaciones ve en **Rutas** el total cobrado por método y lo pendiente de la ruta, sin llamar al chofer (H-04). Además, el jefe puede corregir en el mapa la ubicación de un cliente (H-05).

## Flujo

1. **Clientes.** Si un cliente queda sin ubicación o mal ubicado, se corrige arrastrando el marcador en el mapa (PBI-01.1). La ubicación debe estar dentro de la zona de operación.
2. **Rutas** (admin o jefe). Se calcula la ruta con ORS. El servidor **firma** el resultado (DEF-14), y `guardar_ruta()` lo guarda **en una transacción** que revalida la capacidad en la base (DEF-15).
3. **Mi ruta** (chofer). Cada parada muestra el **monto por cobrar** de ese pedido. Al entregar, el chofer elige el método y el monto, que puede ser parcial. `marcar_parada()` registra la entrega y el pago en una sola transacción, con como máximo un pago por parada (ADR-03).
4. **Rutas** (jefe). La tarjeta **"Cobros de la ruta"** muestra efectivo, transferencia y pendiente, y el cobro de cada parada (PBI-11.2).

## Alcance

| | |
|---|---|
| **Incluye** | Cobro al entregar (PBI-11.1) · resumen de cobros para el jefe (PBI-11.2) · corrección de coordenadas en el mapa (PBI-01.1) · permisos por rol en la base (DEF-09, DEF-10) · rol explícito en todas las acciones (RSK-11) · guardado firmado y transaccional (DEF-14, DEF-15) · regresión del Incremento 1 en CI |
| **Posterga** (Incremento 3) | Liquidación de ruta: km reales, combustible e IEL (PBI-14) · ubicación por parada (SE-02) · volumen y peso en el modal de producto (RSK-03) |
| **Excluye** | Pasarela de pago · foto del comprobante · boleta electrónica · conciliación bancaria · GPS continuo · modo offline |

## Retroalimentación de la segunda defensa → resolución

| Observación | Resolución | Evidencia |
|---|---|---|
| C2 · Ciclo hipótesis–medición–decisión sin cerrar | Ensayo de jornada con medición de SE-01, SE-03, SE-04 y SE-05 | [validacion.md](validacion.md) · video de la demostración |
| C8 · `guardarRuta()` no revalida y no es atómico | Firma del cálculo (DEF-14) y `guardar_ruta()` transaccional (DEF-15) | PR #16, #18 y #20 · [ADR-04](../adr/ADR-04-frontera-confianza-guardado.md) |
| C9 · AC-01-límite parcial; guardado manipulado sin AC | Prueba de AC-01-límite y nuevo AC-02-guardado | `coordenadas.test.ts` · `guardar-ruta.test.ts` |
| C10 · Faltan pruebas de manipulación, atomicidad y contra Supabase | Prueba de la acción completa, PGlite de fallo a mitad y prueba de humo contra Supabase | `guardar-ruta.test.ts` · `guardar-ruta.db.test.ts` · `npm run humo` |
| C12 · RSK-11 reconocido pero no mitigado | Políticas por rol (DEF-10) y rol en todas las acciones (AC-SEC-03) | PR #14 y #15 |
| C15 · Faltan riesgos de atomicidad y validación del guardado | RSK-17 y RSK-18 registrados y mitigados con DEF-14 y DEF-15 | [defectos.md](defectos.md) |

## Evidencia

| Documento | Contenido |
|---|---|
| [aceptacion.md](aceptacion.md) | Resultado de cada AC y RNF con su prueba |
| [defectos.md](defectos.md) | DEF-09 a DEF-15, riesgos y limitaciones |
| [validacion.md](validacion.md) | Ensayo de jornada: resultados de SE-01, SE-03, SE-04, SE-05 y RNF-PERF-02, con su decisión |
| [ADR-03](../adr/ADR-03-cobro-en-terreno.md) | Cobro registrado junto con la entrega |
| [ADR-04](../adr/ADR-04-frontera-confianza-guardado.md) | Frontera de confianza del guardado de rutas |
| `humo-supabase.json` | Resultado de la prueba de humo contra Supabase y de RNF-PERF-03 (`npm run humo`) |

## Verificación

```bash
git clone https://github.com/JaVithx21/Sistema-SGDF-Nuevo-.git
cd Sistema-SGDF-Nuevo-
git checkout v0.3.0-rc.1
npm ci
npm run typecheck
npm run lint
npm test                 # unitarias + PGlite
npm run test:regresion   # regresión prioritaria del Incremento 1 (REG-01..05)
npm run build
npm run humo             # opcional: contra Supabase, requiere .env.local y seed_medicion.sql
```

## Pull requests del incremento

Todos integrados con la revisión formal (**Approve**) del otro integrante y el CI en verde.

| PR | Autor | Revisó | Contenido |
|---|---|---|---|
| #11 | Javier | Martín | Documentación en `docs/` (DEF-12) |
| #12 | Javier | Martín | Corrección de coordenadas en el mapa (PBI-01.1, AC-01-límite) |
| #13 | Javier | Martín | Alerta de latencia de ORS sobre 3 s (DEF-13) |
| #14 | Martín | Javier | Permisos por rol y regresión en CI (DEF-09, DEF-10, DEF-11, REG-01..05) |
| #15 | Javier | Martín | Rol explícito en todas las acciones (RSK-11, AC-SEC-03) |
| #16 | Javier | Martín | Firma del cálculo de ruta (DEF-14) |
| #17 | Martín | Javier | Cobro en la base: `marcar_parada` con cobro y `monto_por_cobrar` (ADR-03) |
| #18 | Martín | Javier | `guardar_ruta()` transaccional que revalida la capacidad (DEF-15) |
| #19 | Javier | Martín | Cobro en Mi ruta (PBI-11.1) |
| #20 | Javier | Martín | `guardarRuta()` usa `guardar_ruta()` (DEF-15) |
| #21 | Javier | Martín | Resumen de cobros para el jefe (PBI-11.2) |
| #22 | Javier | Martín | Documentación del Incremento 2, ADR-03, ADR-04 y prueba de humo contra Supabase |
| #23 | Javier | Martín | Validación del ensayo de jornada (SE-01, SE-03, SE-04, SE-05, RNF-PERF-02) |
