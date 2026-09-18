-- El lote que entro, y el libro mayor de sus existencias.
--
-- NACEN JUNTOS a proposito: un lote sin su evento de entrada es un lote que
-- nunca llego. Separarlos permitiria un lote de gallinaza que existe y del que
-- nadie sabe cuanto entro.
--
-- EL LOTE NO LLEVA SALDO, y es la decision central. El saldo se deriva del
-- libro mayor al leer, igual que `computeLotBalance` lo hace con el cafe. Un
-- numero guardado y un libro mayor dejan de cuadrar en silencio, y el dia que
-- discrepan nadie sabe cual manda. Hay una prueba que lo guarda leyendo
-- `information_schema` y exigiendo que no exista ninguna columna de saldo.
--
-- DOS LOTES DEL MISMO MATERIAL NO SE MEZCLAN. Dos sacos de gallinaza de
-- proveedores distintos no son intercambiables el dia que uno sale malo, asi
-- que la etiqueta es unica POR MATERIAL.
--
-- EL LIBRO MAYOR SOLO SE ANADE. Nada actualiza una fila: corregir es otro
-- evento. Misma forma que `quantity_event`, y por la misma razon — la historia
-- de como se llego al numero es tan interesante como el numero.
--
-- LA RAZON ES OBLIGATORIA EN LOS AJUSTES, por CHECK y no por la interfaz:
-- cuadrar un descuadre es una afirmacion sobre lo que paso, y una afirmacion
-- sin razon no se puede auditar. Mismo criterio que `apo_grant_exige_razon`.

-- CreateEnum
CREATE TYPE "traceability"."ConsumableStockEventType" AS ENUM
  ('received', 'consumed', 'waste', 'adjustment_increase', 'adjustment_decrease');

-- CreateTable
CREATE TABLE "traceability"."consumable_lot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "material_id" UUID NOT NULL,
    "batch_label" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "supplier" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "consumable_lot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "traceability"."consumable_stock_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consumable_lot_id" UUID NOT NULL,
    "event_type" "traceability"."ConsumableStockEventType" NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "consumable_stock_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consumable_lot_material_id_batch_label_key"
  ON "traceability"."consumable_lot"("material_id", "batch_label");
CREATE INDEX "consumable_lot_material_id_idx" ON "traceability"."consumable_lot"("material_id");
CREATE INDEX "consumable_stock_event_consumable_lot_id_occurred_at_idx"
  ON "traceability"."consumable_stock_event"("consumable_lot_id", "occurred_at");

-- La razon obligatoria en los ajustes. En la BASE, no en la interfaz: un ajuste
-- sin razon no se puede auditar, y una comprobacion en codigo se salta con un
-- script.
ALTER TABLE "traceability"."consumable_stock_event"
  ADD CONSTRAINT "cse_ajuste_exige_razon" CHECK (
    "event_type" NOT IN ('adjustment_increase', 'adjustment_decrease')
    OR ("reason" IS NOT NULL AND btrim("reason") <> '')
  );

-- Una cantidad negativa no significa nada: el SENTIDO lo pone el tipo de
-- evento, no el signo. Permitir negativos dejaria que un «consumed" de -5
-- sumara existencias por la puerta de atras.
ALTER TABLE "traceability"."consumable_stock_event"
  ADD CONSTRAINT "cse_cantidad_no_negativa" CHECK ("quantity" >= 0);

-- AddForeignKey
ALTER TABLE "traceability"."consumable_lot" ADD CONSTRAINT "consumable_lot_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "traceability"."consumable_material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."consumable_lot" ADD CONSTRAINT "consumable_lot_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traceability"."consumable_stock_event" ADD CONSTRAINT "cse_consumable_lot_id_fkey"
  FOREIGN KEY ("consumable_lot_id") REFERENCES "traceability"."consumable_lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."consumable_stock_event" ADD CONSTRAINT "cse_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
