-- La identidad del material que se gasta.
--
-- POR QUE. Hasta hoy el material vivia como TEXTO LIBRE en
-- `material_consumption_entry.material_name`, y no se pueden sumar existencias
-- de algo que se escribe distinto cada vez: «aserrin», «aserrin» y «aserrin
-- para el ahumador» son tres materiales para una base de datos. **El problema
-- no era el saldo: era la identidad.**
--
-- UNICO POR ORGANIZACION Y NO GLOBAL. Dos fincas pueden llamar «melaza» a lo
-- suyo, igual que dos pueden llamar «Lavado» a procesos distintos — el mismo
-- criterio que `process_recipe`, que lo dice con esas palabras.
--
-- LA UNIDAD NO SE NORMALIZA. La finca compra en sacos y en quintales y en
-- galones; convertir a kilos al escribir perderia la unidad en la que el
-- operario de verdad trabaja, que es la que va a teclear.
--
-- LO QUE NO ES: no es un `variable_catalog_value`. Esa maquinaria guarda
-- etiquetas de un vocabulario; un material tiene unidad, categoria y
-- existencias. Meterlo ahi haria que un valor de catalogo significara dos cosas
-- segun quien lo lea.

-- CreateTable
CREATE TABLE "traceability"."consumable_material" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "category" TEXT,
    "default_unit" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "consumable_material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consumable_material_organization_id_name_key"
  ON "traceability"."consumable_material"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "traceability"."consumable_material" ADD CONSTRAINT "consumable_material_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."consumable_material" ADD CONSTRAINT "consumable_material_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
