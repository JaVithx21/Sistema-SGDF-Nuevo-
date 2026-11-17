# ADR-04 — Frontera de confianza del guardado de rutas

**Estado:** Aceptada

## Contexto

Observación C8 de la segunda defensa: `calcularRuta()` calcula en el servidor, pero el resultado viaja al navegador y vuelve a `guardarRuta()`, que lo guardaba sin comprobar que fuera el que calculó el servidor ni revalidar la capacidad. Además, guardaba la ruta y sus paradas en dos inserciones sin transacción, compensando a mano si fallaba la segunda (DEF-14, DEF-15).

## Alternativas

- **(a) Recalcular la ruta en el servidor al guardar:** gasta cuota de ORS (50 al día), y el resultado puede cambiar entre lo que vio el jefe y lo que se guarda.
- **(b) Revalidar solo la capacidad al guardar:** no protege el orden, los km ni las ventanas.
- **(c) Firmar en el servidor el resultado del cálculo y guardar con una función transaccional** que revalida la capacidad con datos de la base.

## Decisión

Alternativa **(c)**, en dos capas:
1. **App (DEF-14, PR #16):**
   - `calcularRuta()` firma con HMAC-SHA256 todo lo que se guarda: paradas, orden, km, llegadas, duración, `simulada`, trazado y costos, más el chofer, el origen y la hora. El secreto es `RUTAS_FIRMA_SECRET`, solo en el servidor.
   - `guardarRuta()` verifica la firma **antes de tocar la base**: una ruta modificada o un cálculo de más de 6 horas se rechazan.
2. **Base (DEF-15, PR #18 y #20):** `guardar_ruta()` inserta la ruta y sus paradas en **una transacción**:
   - revalida el rol, el chofer y su vehículo, los pedidos y la capacidad (volumen y peso) con datos de la base;
   - toma de la base las coordenadas, las ventanas y los volúmenes.

   Como también se puede llamar directo por la API, no depende de la firma y repite las reglas.

## Consecuencias

- **El servidor solo persiste lo que calculó;** una ruta manipulada no llega a la base (AC-02-guardado).
- **Ruta y paradas se guardan todo o nada** (RNF-INT-02).
- **Se agrega una variable de entorno,** `RUTAS_FIRMA_SECRET` (mínimo 32 caracteres), documentada en `.env.example` y en el README.
- Hay pruebas en ambas capas: `firma.test.ts`, `guardar-ruta.test.ts` (la acción completa) y `guardar-ruta.db.test.ts` (PGlite).

## Revisar cuando

- El jefe pueda editar a mano el orden de la ruta antes de guardarla, lo que requiere revalidar las ventanas en el servidor.
- El cálculo pase a ser asíncrono.
