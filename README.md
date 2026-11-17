# SGDF — Sistema de Gestión de la Distribuidora de Flores

Módulo de **Rutas de Entrega** (Taller de Desarrollo de Software, INF524 · UCM).
Equipo: Javier Catalán y Martín Ferrada.

**Flujo del Incremento Funcional 1:** el jefe de operaciones planifica la ruta del día con OpenRouteService (capacidad del furgón y horarios de recepción) → el chofer la ejecuta en **Mi ruta** y marca cada parada como *Entregado* o *No entregado* con motivo → el estado queda guardado y el jefe ve el avance.

**Flujo del Incremento Funcional 2:** al marcar *Entregado*, el chofer registra el **cobro** (efectivo, transferencia o sin cobro) → el saldo del pedido se descuenta una sola vez → el jefe ve en **Rutas** el total cobrado por método y lo pendiente. El jefe también puede corregir en el mapa la ubicación de un cliente. Detalle y evidencia: [`docs/incremento-2/`](docs/incremento-2/README.md).

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL, Auth, RLS) · OpenRouteService · Leaflet · Vitest · GitHub Actions.

---

## Requisitos
- Node.js 20 o superior, y npm.
- Un proyecto de Supabase.
- Un token de [OpenRouteService](https://openrouteservice.org) (plan gratuito: 50 optimizaciones por día).

## Instalación
```bash
git clone https://github.com/JaVithx21/Sistema-SGDF-Nuevo-.git
cd Sistema-SGDF-Nuevo-
git checkout v0.3.0-rc.1        # versión candidata del Incremento 2
cp .env.example .env.local      # completar los valores (nunca subirlos al repositorio)
npm ci
```

### Variables de entorno
Están en `.env.example`. Para la demostración bastan estas:

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública (la protege RLS) |
| `ORS_API_KEY` | Geocodificación, optimización y trazado de rutas. Sin ella, las rutas se calculan con el respaldo local («simulada») |
| `RUTAS_FIRMA_SECRET` | Firma del cálculo de ruta (DEF-14): el servidor solo guarda la ruta que él calculó. Mínimo 32 caracteres; generarla con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `HUMO_CHOFER_EMAIL`, `HUMO_CHOFER_PASSWORD`, `HUMO_JEFE_EMAIL`, `HUMO_JEFE_PASSWORD` | Solo para `npm run humo` (prueba contra Supabase): usuarios de prueba con rol chofer y jefe de operaciones |

## Base de datos
Las migraciones están en `supabase/migrations/`:

| Migración | Contenido |
|---|---|
| `20261026140000_esquema_base.sql` | Esquema real versionado (tablas, RLS, triggers y funciones) |
| `20261026150000_rutas_y_paradas.sql` | Estado de parada, unicidad por chofer/vehículo y fecha, y RLS de rutas |
| `20261026150100_funciones_chofer.sql` | `mi_ruta_hoy()` y `marcar_parada()` (SECURITY DEFINER) |
| `20261116100000_permisos_por_rol.sql` | Políticas por rol en clientes, pedidos, detalle y pagos; funciones heredadas sin acceso anónimo (DEF-09, DEF-10, DEF-11) |
| `20261117100000_cobro_en_terreno.sql` | `pagos.parada_id` único, `marcar_parada()` con cobro y `mi_ruta_hoy()` con `monto_por_cobrar` (ADR-03) |
| `20261117120000_guardar_ruta.sql` | `guardar_ruta()`: ruta y paradas en una transacción que revalida la capacidad (DEF-15) |

- **Proyecto nuevo (local):** `npx supabase db reset` aplica las migraciones y la semilla. Requiere Docker.
- **Proyecto nuevo (remoto):** `npx supabase link --project-ref <ref>` y luego `npx supabase db push`.
- **Base compartida del equipo:** el esquema base ya existe. **No** se ejecuta `20261026140000_esquema_base.sql`.

### Datos de ensayo
`supabase/seed.sql` crea datos marcados «(seed)»: sucursal Peralillo, furgón de 13 m³ y 1.289 kg, 3 clientes con coordenadas y 3 pedidos.
1. Ejecutar `supabase/seed.sql` en el SQL Editor. Autoriza el correo del chofer de prueba.
2. Crear `chofer.prueba@sgdf.test` en *Authentication → Add user*, con *Auto Confirm User*.
3. Ejecutar `supabase/seed.sql` otra vez. Crea el perfil del chofer.

`supabase/seed.sql` deja pedidos con saldos variados para probar el cobro: uno sin pagos, uno con un pago parcial de oficina y uno pagado.

`supabase/seed_medicion.sql` reemplaza la ruta de hoy del chofer de prueba por una de **20 paradas con saldo**, para `npm run humo` (RNF-PERF-03). Se puede ejecutar de nuevo para repetir la medición.

`supabase/seed_limpieza.sql` borra todo lo creado por las semillas, incluidos los cobros de terreno.

> **Lista blanca de usuarios:** la base solo permite crear en Auth correos registrados antes en la tabla `usuarios`. Primero se crea el usuario en la app (*Administración → Usuarios*, con su rol) y después en *Authentication*.

## Ejecutar
```bash
npm run dev                     # http://localhost:3000
```

| Rol | Pantalla de inicio | Qué puede hacer en este incremento |
|---|---|---|
| Administrador | Panel | Todo, incluido **Rutas** y **Administración** |
| Jefe de Operaciones | Panel | **Rutas**: planificar, calcular, guardar, ver el avance y los **cobros de la ruta**; corregir la ubicación de clientes en el mapa |
| Chofer | **Mi ruta** | Ver su ruta del día, marcar Entregado (con **cobro**: efectivo, transferencia o sin cobro) o No entregado con motivo |

## Verificar
```bash
npm run typecheck   # TypeScript sin errores
npm run lint        # ESLint sin errores
npm test            # pruebas automáticas (Vitest)
npm run build       # build de producción
npm run test:regresion  # solo la regresión prioritaria del Incremento 1 (pruebas REG-)
npm run humo        # contra Supabase: requiere .env.local, migraciones y seed_medicion.sql
```
`npm run humo` ejecuta contra la base real los permisos de anon y del chofer, `mi_ruta_hoy`, el cobro con `marcar_parada` (incluidos los rechazos y el doble envío), la cuadratura del jefe y `guardar_ruta`, y mide RNF-PERF-03. Deja el resultado en `docs/incremento-2/humo-supabase.json`.

El CI (`.github/workflows/ci.yml`) ejecuta los cuatro pasos en cada pull request, y antes de `npm test` corre la regresión prioritaria como paso visible:

| ID | Protege | Pruebas |
|---|---|---|
| REG-01 | Marcar Fallido con motivo | `rutas.db.test.ts` (`marcar_parada`), `validar-estado.test.ts` |
| REG-02 | Privacidad de `mi_ruta_hoy` (columnas) | `rutas.db.test.ts` |
| REG-03 | Ruta única (`uq_ruta_vehiculo_fecha`, `uq_ruta_chofer_fecha`) | `rutas.db.test.ts` |
| REG-04 | Cálculo con ORS y respaldo local | `ors.test.ts`, `optimizador.test.ts` |
| REG-05 | Geocodificación que no bloquea el guardado | `geocoding.test.ts` |

## Forma de trabajo
- Todo cambio entra por **pull request** a `main`, con **aprobación formal (Approve) del otro integrante** y el CI en verde.
- Commits convencionales (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `ci:`).
- Las versiones candidatas se etiquetan después del último merge: `v0.2.0-rc.1` (Incremento 1) y `v0.3.0-rc.1` (Incremento 2).
- Documentación de cada incremento: [`docs/incremento-1/`](docs/incremento-1/README.md) y [`docs/incremento-2/`](docs/incremento-2/README.md); decisiones en [`docs/adr/`](docs/adr/).
