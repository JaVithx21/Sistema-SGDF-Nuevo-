# Incremento Funcional 1 — Módulo de Rutas de Entrega

**Versión candidata:** `v0.2.0-rc.1`
**Equipo:** Javier Catalán · Martín Ferrada

## Objetivo

El jefe de operaciones calcula en minutos el orden de entrega del día, respetando la capacidad del vehículo (13 m³ y 1.289 kg) y las ventanas horarias de los clientes.
El chofer ve su ruta ordenada, navega a cada parada y registra **Entregado** o **No entregado** con motivo. Ese registro queda guardado en la base de datos y el jefe lo ve.

## Flujo F-01

1. **Clientes.** Al crear o editar un cliente, la dirección se geocodifica (OpenRouteService, zona de O'Higgins, timeout de 5 s).
2. **Rutas** (admin o jefe de operaciones). Se eligen el chofer, la fecha y los pedidos, y se calcula la ruta con VROOM vía ORS (capacidad y ventanas, timeout de 8 s). Si ORS falla, se usa un respaldo local marcado como **simulada**.
3. **Mapa.** Muestra las paradas numeradas sobre calles. Sin trazado, une las paradas con líneas rectas y avisa que el trazado es aproximado.
4. **Guardar.** Se permite una sola ruta por vehículo y fecha, y una por chofer y fecha.
5. **Mi ruta** (chofer). Muestra las paradas en orden con los botones Navegar y Llamar. Al marcar una parada se llama a `marcar_parada()`; un fallo exige motivo.
6. **Rutas** (jefe). Muestra el avance y el motivo de cada parada.

## Alcance

| | |
|---|---|
| **Incluye** | PBI-01 geocodificación · PBI-02 cálculo con capacidad, ventanas y respaldo · PBI-03 Mi ruta con estado persistido · PBI-04 ruta única · PBI-05 mapa |
| **Posterga** | PBI-11 cobro en terreno · PBI-14 resultados de ruta (ubicación por parada) · corrección de coordenadas sobre el mapa |
| **Excluye** | GPS y seguimiento continuo · modo offline · pago en línea · integración con WhatsApp |

## Evidencia

| Documento | Contenido |
|---|---|
| [aceptacion.md](aceptacion.md) | Resultado de cada criterio de aceptación y su evidencia |
| [defectos.md](defectos.md) | DEF-01 a DEF-08 con estado y PR |
| [ADR-02](../adr/ADR-02-ors-con-respaldo.md) | Decisión: ORS/VROOM con respaldo local, y DEC-07 |
| [SPK-01](../spikes/SPK-01/SPK-01.md) | Medición real de la latencia de ORS frente al respaldo local |

## Verificación

```bash
git clone https://github.com/JaVithx21/Sistema-SGDF-Nuevo-.git
cd Sistema-SGDF-Nuevo-
git checkout v0.2.0-rc.1
npm ci
npm run typecheck
npm run lint
npm test        # 125 pruebas: 85 unitarias y 40 de base de datos (PGlite)
npm run build
```

El CI (`.github/workflows/ci.yml`) ejecuta lint, typecheck, build y test en cada pull request.

## Pull requests del incremento

| PR | Autor | Contenido |
|---|---|---|
| #1 | Javier | Base compilable y roles seguros (DEF-01, DEF-02, DEF-04) |
| #2 | Javier | Paginación del inventario (DEF-03) |
| #3 | Javier | Mi ruta y protección de rutas por rol (PBI-03, DEF-06) |
| #4 → #5 | Martín | Migraciones sobre un esquema supuesto; revertido |
| #6 | Martín | Esquema real, funciones del chofer, semilla, Vitest y CI (DEF-07) |
| #7 | Javier | Planificador, OpenRouteService y mapa (PBI-02, PBI-04, PBI-05) |
| #8 | Javier | Edición de clientes, precisión de la geocodificación y README (DEF-05, DEF-08) |
| #9 | Martín | Pruebas de base de datos en CI con PGlite |
