# SGDF — Sistema de Gestión de la Distribuidora de Flores

Módulo de **Rutas de Entrega** (Taller de Desarrollo de Software, INF524 · UCM).
Equipo: Javier Catalán y Martín Ferrada.

**Flujo del Incremento Funcional 1:** el jefe de operaciones planifica la ruta del día con OpenRouteService (capacidad del furgón y horarios de recepción) → el chofer la ejecuta en **Mi ruta** y marca cada parada como *Entregado* o *No entregado* con motivo → el estado queda guardado y el jefe ve el avance.

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
git checkout v0.2.0-rc.1        # versión candidata del incremento
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

## Base de datos
Las migraciones están en `supabase/migrations/`:

| Migración | Contenido |
|---|---|
| `20261026140000_esquema_base.sql` | Esquema real versionado (tablas, RLS, triggers y funciones) |
| `20261026150000_rutas_y_paradas.sql` | Estado de parada, unicidad por chofer/vehículo y fecha, y RLS de rutas |
| `20261026150100_funciones_chofer.sql` | `mi_ruta_hoy()` y `marcar_parada()` (SECURITY DEFINER) |

- **Proyecto nuevo (local):** `npx supabase db reset` aplica las tres migraciones y la semilla. Requiere Docker.
- **Proyecto nuevo (remoto):** `npx supabase link --project-ref <ref>` y luego `npx supabase db push`.
- **Base compartida del equipo:** el esquema base ya existe. **No** se ejecuta `20261026140000_esquema_base.sql`.

### Datos de ensayo
`supabase/seed.sql` crea datos marcados «(seed)»: sucursal Peralillo, furgón de 13 m³ y 1.289 kg, 3 clientes con coordenadas y 3 pedidos.
1. Ejecutar `supabase/seed.sql` en el SQL Editor. Autoriza el correo del chofer de prueba.
2. Crear `chofer.prueba@sgdf.test` en *Authentication → Add user*, con *Auto Confirm User*.
3. Ejecutar `supabase/seed.sql` otra vez. Crea el perfil del chofer.

`supabase/seed_limpieza.sql` borra todo lo creado por la semilla.

> **Lista blanca de usuarios:** la base solo permite crear en Auth correos registrados antes en la tabla `usuarios`. Primero se crea el usuario en la app (*Administración → Usuarios*, con su rol) y después en *Authentication*.

## Ejecutar
```bash
npm run dev                     # http://localhost:3000
```

| Rol | Pantalla de inicio | Qué puede hacer en este incremento |
|---|---|---|
| Administrador | Panel | Todo, incluido **Rutas** y **Administración** |
| Jefe de Operaciones | Panel | **Rutas**: planificar, calcular, guardar y ver el avance |
| Chofer | **Mi ruta** | Ver su ruta del día y marcar Entregado / No entregado |

## Verificar
```bash
npm run typecheck   # TypeScript sin errores
npm run lint        # ESLint sin errores
npm test            # pruebas automáticas (Vitest)
npm run build       # build de producción
```
El CI (`.github/workflows/ci.yml`) ejecuta los cuatro pasos en cada pull request.

## Forma de trabajo
- Todo cambio entra por **pull request** a `main`, con **revisión del otro integrante** y el CI en verde.
- Commits convencionales (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `ci:`).
- Las versiones candidatas se etiquetan (`v0.2.0-rc.1`).
