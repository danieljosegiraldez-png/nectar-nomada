-- El lote de subproducto: la cascarilla de la trilla y la pulpa del despulpado.
--
-- POR QUE NO ES MERMA, que es toda la razon de esta tabla. 100 kg de pergamino
-- salen como ~80 de verde, ~18 de cascarilla y ~2 de merma declarada. Contar la
-- cascarilla como merma inflaria la perdida un 18 % EN CADA TRILLA y esconderia
-- la merma de verdad — que es el numero que dice si alguien peso mal. Y la
-- cascarilla no se pierde: se composta.
--
-- MASA SIEMPRE EN KG, y el nombre de la columna lo dice. Los subproductos se
-- pesan a granel; una unidad libre invitaria a mezclar sacos con kilos y a que
-- el balance dejara de poder sumarse.
--
-- `transformation_id` REQUERIDO: un subproducto sin origen no es trazable, y la
-- trazabilidad es para lo que existe esto. `produced_at_location_id` tambien,
-- por lo mismo que en `biochar_batch`: es el ancla de RBAC, y sin ambito
-- concreto no hay autorizacion que comprobar.
--
-- EL TIPO SE DECLARA AUNQUE HOY LOS DOS VAYAN A COMPOST. Cascarilla y pulpa no
-- son el mismo material y algun dia uno puede ir al biochar y el otro no.
--
-- LO QUE NO HACE: no crea la aplicacion a una parcela. Esa ya existe
-- —`treatment_batch` y `applyAmendment()`— y hoy solo acepta biochar. Conectar
-- el compost es ensanchar esa funcion, no escribir una paralela.

-- CreateEnum
CREATE TYPE "traceability"."ByproductType" AS ENUM ('CASCARILLA', 'PULPA');
CREATE TYPE "traceability"."ByproductDestination" AS ENUM ('COMPOST', 'BIOCHAR', 'DISPOSAL', 'SALE');

-- CreateTable
CREATE TABLE "traceability"."byproduct_batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "byproduct_type" "traceability"."ByproductType" NOT NULL,
    "destination" "traceability"."ByproductDestination" NOT NULL,
    "mass_kg" DECIMAL(10,3) NOT NULL,
    "transformation_id" UUID NOT NULL,
    "produced_at_location_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "byproduct_batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "byproduct_batch_transformation_id_idx" ON "traceability"."byproduct_batch"("transformation_id");

-- AddForeignKey
ALTER TABLE "traceability"."byproduct_batch" ADD CONSTRAINT "byproduct_batch_transformation_id_fkey"
  FOREIGN KEY ("transformation_id") REFERENCES "traceability"."lot_transformation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."byproduct_batch" ADD CONSTRAINT "byproduct_batch_produced_at_location_id_fkey"
  FOREIGN KEY ("produced_at_location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."byproduct_batch" ADD CONSTRAINT "byproduct_batch_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."byproduct_batch" ADD CONSTRAINT "byproduct_batch_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
