-- ═══════════════════════════════════════════════════════════════════════════
--  Borra todo lo que crea supabase/seed.sql (marcado con "(seed)").
--  No toca ningún otro dato. Correr en el SQL Editor o con psql.
--
--  El usuario de Auth chofer.prueba@sgdf.test NO se borra aquí: eliminarlo
--  a mano en Authentication → Users si ya no se necesita.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Rutas del chofer o de los vehículos de prueba (las paradas caen en cascada)
DELETE FROM rutas_diarias
 WHERE chofer_id IN (SELECT id FROM choferes WHERE nombre_completo = 'Chofer de Prueba (seed)')
    OR vehiculo_id IN (SELECT id FROM vehiculos WHERE patente IN ('SEED01', 'SEED02'));

-- Pedidos de prueba y lo que cuelga de ellos (incluidos movimientos de stock
-- que puedan haber generado los triggers)
DELETE FROM movimientos_inventario
 WHERE pedido_id IN (SELECT id FROM pedidos WHERE nota = 'Pedido de ensayo (seed)')
    OR producto_id IN (SELECT id FROM productos WHERE nombre LIKE '% (seed)');
DELETE FROM pagos
 WHERE pedido_id IN (SELECT id FROM pedidos WHERE nota = 'Pedido de ensayo (seed)');
DELETE FROM detalle_pedidos
 WHERE pedido_id IN (SELECT id FROM pedidos WHERE nota = 'Pedido de ensayo (seed)');
DELETE FROM pedidos WHERE nota = 'Pedido de ensayo (seed)';

DELETE FROM clientes WHERE rut IN ('76000001-9', '76000002-7', '76000003-5');
DELETE FROM historial_precios
 WHERE producto_id IN (SELECT id FROM productos WHERE nombre LIKE '% (seed)');
DELETE FROM productos WHERE nombre LIKE '% (seed)';
DELETE FROM categorias WHERE nombre = 'Flores (seed)';

DELETE FROM choferes WHERE nombre_completo = 'Chofer de Prueba (seed)';
DELETE FROM usuarios WHERE email = 'chofer.prueba@sgdf.test';
DELETE FROM vehiculos WHERE patente IN ('SEED01', 'SEED02');
DELETE FROM sucursales WHERE nombre = 'Peralillo (seed)';

COMMIT;
