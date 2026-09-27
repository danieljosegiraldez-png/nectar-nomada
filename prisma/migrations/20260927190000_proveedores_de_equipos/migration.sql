-- ADR-188 · El alta de proveedores de equipos copia la de los proveedores de cereza.
--
-- El proveedor de un equipo tiene que ser una `Organization` de tipo `supplier` y en estado
-- `approved` —lo exige `comprobarProveedor` en lib/equipos/equipos.ts— pero hasta hoy no había
-- forma de crear una desde la aplicación: los tres que existían venían del seed.
--
-- Este índice es el calco del de productores (`organization_productor_nombre_unico`, migración
-- 20260919170000): PARCIAL, acotado a su tipo, y normalizando mayúsculas y espacios de sobra. Sin
-- él, «Ferretería El Puente» y «ferreteria el puente  » serían dos proveedores y ningún informe los
-- agruparía nunca. Acotarlo al tipo es deliberado: una finca y un proveedor pueden llamarse igual.
CREATE UNIQUE INDEX "organization_proveedor_nombre_unico" ON "core"."organization" (lower(btrim("name")))
  WHERE "organization_type" = 'supplier';
