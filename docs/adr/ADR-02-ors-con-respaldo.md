# ADR-02 — VROOM vía OpenRouteService con respaldo local

**Estado:** Aceptada

## Contexto

EV-01 y EV-02 exigen optimizar la ruta respetando la capacidad y las ventanas horarias. OpenRouteService es un servicio externo con timeout, cuota y token, y cualquiera de ellos puede fallar. El jefe de operaciones necesita siempre una ruta utilizable en la mañana.

## Alternativas

- **(a) Solo heurística propia:** no resuelve a la vez la capacidad y las ventanas.
- **(b) Solo ORS/VROOM, sin respaldo:** si el servicio cae, el jefe se queda sin ruta.
- **(c) ORS/VROOM como solver principal, con una heurística local de respaldo marcada como simulada.**

## Decisión

Alternativa **(c)**. VROOM, vía ORS, resuelve la capacidad (dm³ y kg) y las ventanas. Si ORS no está configurado, no responde en 8 s, rechaza el token, no puede rutear un punto o devuelve un error, se usa el vecino más cercano con distancia Haversine (× 1,3, a 40 km/h). La ruta se marca `simulada = true` y lleva su motivo y una advertencia visible.

Implementación: `src/lib/rutas/ors.ts` y `src/lib/rutas/optimizador.ts`. El token solo se usa en el servidor.

## Consecuencias

- Siempre hay ruta.
- El respaldo respeta la capacidad, pero no garantiza las ventanas. La interfaz lo indica.
- Una ruta simulada no guarda geometría (CHECK `rutas_simulada_sin_geometria`).
- Los dos caminos tienen pruebas: `ors.test.ts` y `optimizador.test.ts`.

## DEC-07 (SPK-01)

| Parámetro | Valor | Razón |
|---|---|---|
| Timeout de optimización | 8 s | Unas 3 veces el máximo medido (2,69 s con 50 paradas) |
| Tope de paradas | 48 | Directions admite 50 puntos, incluidos la salida y el regreso al depósito |
| Nuevo motivo de respaldo | punto no ruteable | Una sola coordenada a más de 350 m de una calle hace que ORS rechace la ruta completa |
| Umbral de alerta | 3 s (propuesto, no implementado) | Por encima de todas las latencias medidas |

## Revisar cuando

- Una nueva medición invierta el umbral.
- Cambie el proveedor o el plan de ORS.
- El volumen supere lo que soporta el respaldo.
