-- ═══════════════════════════════════════════════════════════════════════════
--  Borra todo lo que crean supabase/seed.sql y supabase/seed_medicion.sql
--  (marcado con "(seed)" / "(medición)"). No toca ningún otro dato.
--  Correr en el SQL Editor o con psql.
--
--  El usuario de Auth chofer.prueba@sgdf.test NO se borra aquí: eliminarlo
--  a mano en Authentication → Users si ya no se necesita.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Rutas a borrar: las del chofer o de los vehículos de prueba
CREATE TEMP TABLE rutas_seed ON COMMIT DROP AS
SELECT id FROM rutas_diarias
 WHERE chofer_id IN (SELECT id FROM choferes WHERE nombre_completo = 'Chofer de Prueba (seed)')
    OR vehiculo_id IN (SELECT id FROM vehiculos WHERE patente IN ('SEED01', 'SEED02'));

CREATE TEMP TABLE pedidos_seed ON COMMIT DROP AS
SELECT id FROM pedidos WHERE nota IN ('Pedido de ensayo (seed)', 'Pedido de medición (seed)');

-- Pagos PRIMERO: los cobros de terreno apuntan a la parada con
-- pagos.parada_id ON DELETE RESTRICT y bloquearían borrar la ruta.
DELETE FROM pagos
 WHERE pedido_id IN (SELECT id FROM pedidos_seed)
    OR parada_id IN (SELECT rp.id FROM ruta_paradas rp WHERE rp.ruta_id IN (SELECT id FROM rutas_seed));

-- Rutas (las paradas caen en cascada)
DELETE FROM rutas_diarias WHERE id IN (SELECT id FROM rutas_seed);

-- Pedidos de prueba y lo que cuelga de ellos (incluidos movimientos de stock
-- que puedan haber generado los triggers)
DELETE FROM movimientos_inventario
 WHERE pedido_id IN (SELECT id FROM pedidos_seed)
    OR producto_id IN (SELECT id FROM productos WHERE nombre LIKE '% (seed)');
DELETE FROM detalle_pedidos WHERE pedido_id IN (SELECT id FROM pedidos_seed);
DELETE FROM pedidos WHERE id IN (SELECT id FROM pedidos_seed);

DELETE FROM clientes WHERE rut IN ('76000001-9', '76000002-7', '76000003-5');
DELETE FROM clientes WHERE razon_social LIKE '% (medición)' AND rut LIKE '770000__-_';
DELETE FROM historial_precios
 WHERE producto_id IN (SELECT id FROM productos WHERE nombre LIKE '% (seed)');
DELETE FROM productos WHERE nombre LIKE '% (seed)';
DELETE FROM categorias WHERE nombre = 'Flores (seed)';

DELETE FROM choferes WHERE nombre_completo = 'Chofer de Prueba (seed)';
DELETE FROM usuarios WHERE email = 'chofer.prueba@sgdf.test';
DELETE FROM vehiculos WHERE patente IN ('SEED01', 'SEED02');
DELETE FROM sucursales WHERE nombre = 'Peralillo (seed)';

COMMIT;
