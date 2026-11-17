# Criterios de aceptación: resultados

Resultado: **10 pasan** y **1 es parcial**.

| AC | Dado / Cuando / Entonces | Resultado | Evidencia |
|---|---|---|---|
| AC-01-feliz | Cliente con dirección válida → se guardan latitud y longitud | ✅ Pasa | `src/lib/geocoding.test.ts` · 4 de 4 direcciones reales de Santa Cruz ubicadas en la comuna con confianza 1 ([resultados](../spikes/SPK-01/resultados/ac01-geocodificacion-santa-cruz.json)) |
| AC-01-límite | Dirección mal geocodificada → se corrige y las nuevas coordenadas reemplazan a las anteriores | ▲ Parcial | Al cambiar la dirección se vuelve a geocodificar (`src/app/(dashboard)/clientes/actions.ts`, PR #8). Sin prueba automatizada. |
| AC-01-error | El geocodificador falla o no responde en 5 s → el cliente se guarda sin coordenadas y queda «sin ubicación» | ✅ Pasa | `src/lib/geocoding.test.ts`: timeout de 5 s, error 500, token rechazado y sin clave · lista «Sin ubicación» en `/rutas` |
| AC-02-feliz | Pedidos con coordenadas → orden, distancia y duración, y se puede guardar | ✅ Pasa | `src/lib/rutas/ors.test.ts` · ORS real: 4 paradas, 49,5 km, 2,0 s |
| AC-02-límite | Carga sobre 13 m³ o 1.289 kg, o ventana inalcanzable → «no asignados»; nunca se supera la capacidad | ✅ Pasa | `src/lib/rutas/optimizador.test.ts` (volumen, peso, ventana y no asignados) |
| AC-02-error | ORS caído o sin respuesta en 8 s → respaldo local, aviso visible y `simulada = true` | ✅ Pasa | `src/lib/rutas/ors.test.ts`: sin clave, timeout de 8 s, token rechazado (403), punto no ruteable y error del servidor |
| AC-03-feliz | Chofer con ruta → ve las paradas en orden, con dirección, teléfono y Navegar | ✅ Pasa | `src/test/db/rutas.db.test.ts` (`mi_ruta_hoy()` ordenada y solo del chofer) · video de la demostración |
| AC-03-límite | Chofer sin ruta → mensaje claro, no un error | ✅ Pasa | `src/test/db/rutas.db.test.ts` (0 filas) · mensaje «No tienes ruta asignada para hoy» en `MiRutaClient.tsx` |
| AC-03-error | Fallido con motivo y recarga → el estado y el motivo persisten y el jefe los ve | ✅ Pasa | `src/lib/rutas/validar-estado.test.ts` · `src/test/db/rutas.db.test.ts` (persistencia, CHECK de motivo, parada ajena) · columna de estado y motivo en `/rutas` |
| AC-05 | Ruta calculada → paradas numeradas sobre calles; sin geometría, líneas rectas con aviso | ✅ Pasa | `src/lib/rutas/ors.test.ts` · `src/components/rutas/MapaRuta.tsx` y `MapaRutaWrapper.tsx` |
| AC-06-error | Segunda ruta para el mismo vehículo o chofer y fecha → mensaje claro, sin duplicar | ✅ Pasa | `src/test/db/rutas.db.test.ts` (`uq_ruta_vehiculo_fecha`, `uq_ruta_chofer_fecha`) · mensaje en `guardarRuta()` |

**Límite conocido:** con direcciones incompletas o ambiguas, la geocodificación pierde precisión (DEF-08, mitigado).
