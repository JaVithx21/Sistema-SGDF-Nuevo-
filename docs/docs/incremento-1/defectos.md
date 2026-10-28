# Registro de defectos

| ID | Defecto | Severidad | Estado | Corrección |
|---|---|---|---|---|
| DEF-01 | La rama de integración no compilaba (9 errores de TypeScript): faltaban `geocoding.ts`, exportaciones de roles y la carga de datos de Administración | Alta | Cerrado | PR #1: 0 errores de tipos y script `typecheck` |
| DEF-02 | `requireAuth` aceptaba roles desconocidos (`undefined < n` es falso) | Alta | Cerrado | PR #1: deniega por defecto · prueba en `src/lib/security/auth-guard.test.ts` (PR #6) |
| DEF-03 | El inventario mostraba solo los primeros 10 productos (sin paginación) | Media | Cerrado | PR #2 |
| DEF-04 | Error de lint en `LoginForm` (`setState` dentro de un efecto) | Baja | Cerrado | PR #1 |
| DEF-05 | Editar un cliente borraba su ventana horaria y podía dejar sus coordenadas en nulo | Alta | Cerrado | PR #8: el formulario carga la ventana y las coordenadas; solo se vuelve a geocodificar si cambia la dirección |
| DEF-06 | Se podía abrir por URL un módulo de otro rol; el middleware solo protegía `/administracion` | Alta | Cerrado | PR #3: rutas restringidas por rol · prueba en `src/constants/roles.test.ts` |
| DEF-07 | Esquema de base de datos sin versionar | Alta | Cerrado | PR #6: migraciones en `supabase/migrations` y semilla |
| DEF-08 | La geocodificación aceptaba el primer resultado aunque estuviera en otra región | Alta | Mitigado | PR #8: búsqueda limitada a la zona de operación (O'Higgins) · `src/lib/geocoding.test.ts` |

## Riesgo abierto

**RSK-11.** Las políticas RLS de lectura de `clientes` y `pedidos` permiten la lectura a cualquier usuario autenticado, y varias acciones de clientes y pedidos solo exigen sesión.
El chofer no se ve afectado: solo usa `mi_ruta_hoy()` y `marcar_parada()`, con columnas operativas, y el middleware lo limita a `/mi-ruta`.
**Respuesta planificada:** exigir rol en cada acción y restringir las políticas por rol en el próximo incremento.
