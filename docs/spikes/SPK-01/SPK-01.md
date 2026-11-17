# SPK-01 — Latencia de ORS /optimization frente al respaldo local

**Pregunta.** ¿ORS/VROOM responde en un tiempo útil con 10, 25 y 50 paradas? ¿El respaldo local cumple ≤5 s con 50 paradas? ¿Qué timeout conviene antes de activar el respaldo?

**Fecha:** 26-10-2026, 21:56 (America/Santiago).
**Entorno:** Node v24.12.0, win32 x64, PC de Javier. La red no quedó registrada.
**Plan de ORS:** gratuito. Según la cabecera `x-ratelimit-limit`, admite 50 llamadas diarias a `/optimization`.

## Método

- **Endpoint:** `POST https://api.openrouteservice.org/optimization`, perfil `driving-car`, con `options: { g: true }`.
- **Implementación medida:** un prototipo del optimizador anterior al PR #7. La implementación final está en `src/lib/rutas/optimizador.ts` y `src/lib/rutas/ors.ts`.
- **Datos (semilla fija 20261026):**
  - depósito en Peralillo; paradas en Peralillo, Marchigüe, Palmilla, Santa Cruz y Pumanque;
  - furgón de 13.000 dm³ y 1.289 kg, turno de 07:00 a 18:00 y 300 s de descarga por parada;
  - cerca del 30 % de las paradas con ventana horaria.
- **Repeticiones:** 5 por tamaño, con 4 s de espera entre llamadas y 0 reintentos.
- **Latencia:** se mide desde antes del `fetch` hasta leer el cuerpo completo.
- **Ajuste a calle:** cada punto se ajustó a la calle más cercana con `POST /v2/snap/driving-car`.

## Corrida 1 (fallida)

Las 15 llamadas devolvieron **HTTP 500**: *"Could not find routable point within a radius of 350.0 meters"*.
**Hallazgo:** basta una coordenada no ruteable para que ORS rechace la ruta completa.
Archivo: [`resultados/spk-01-corrida1-fallida.json`](resultados/spk-01-corrida1-fallida.json).

## Corrida 2 (válida)

| Paradas | Alternativa | Éxitos | Mediana | Mín | Máx | Asignadas |
|---|---|---|---|---|---|---|
| 10 | ORS /optimization | 5/5 | **610 ms** | 536 ms | 1.537 ms | 10/10 |
| 10 | Respaldo local | 5/5 | 0,10 ms | 0,03 ms | 0,33 ms | 10/10 |
| 25 | ORS /optimization | 5/5 | **1.020 ms** | 762 ms | 1.052 ms | 25/25 |
| 25 | Respaldo local | 5/5 | 0,05 ms | 0,03 ms | 0,72 ms | 25/25 |
| 50 | ORS /optimization | 5/5 | **1.531 ms** | 1.169 ms | **2.689 ms** | 50/50 |
| 50 | Respaldo local | 5/5 | 0,16 ms | 0,12 ms | 0,52 ms | 50/50 |

- Con `options.g = true`, las 15 respuestas incluyen la distancia y la geometría.
- 0 respuestas 401, 403 o 429.
- Distancia según ORS: 121,6 km (10 paradas), 125,0 km (25) y 176,7 km (50).

Archivos: [`resultados/spk-01-resultados.json`](resultados/spk-01-resultados.json) · [`latencia-ors.svg`](latencia-ors.svg).

## Decisión (DEC-07)

- **Timeout de optimización: 8 s.** Es unas 3 veces el máximo medido (2,69 s).
- **Tope: 48 paradas.** Directions admite 50 puntos, incluidos la salida y el regreso al depósito.
- **Nuevo motivo de respaldo: «punto no ruteable»**, a partir de la corrida 1.
- **Respaldo local: menos de 1 ms con 50 paradas.** Cumple RNF-PERF-01 (≤5 s).
- **Pendiente:** repetir la medición con 30 o más muestras por tamaño, en distintas horas y redes, para estimar el p95.

## Evidencia complementaria: AC-01 (geocodificación)

- La geocodificación de 4 direcciones reales de Santa Cruz quedó dentro de la comuna, con confianza 1: [`resultados/ac01-geocodificacion-santa-cruz.json`](resultados/ac01-geocodificacion-santa-cruz.json).
- La primera versión aceptaba un resultado de otra región. Ese hallazgo es DEF-08, que se mitigó en el PR #8: [`resultados/ac01-geocodificacion-resultados.json`](resultados/ac01-geocodificacion-resultados.json).
