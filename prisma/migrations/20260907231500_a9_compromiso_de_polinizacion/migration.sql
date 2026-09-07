-- A9.9 (D6) — el compromiso de polinización con un cliente.
--
-- Existe por un número: 17 ha comprometidas a 4-6 colmenas/ha son 68-102
-- colonias contra las 3 que hay. Sin la tabla esa conversación con el cliente
-- es una impresión; con ella es una resta.
--
-- Las hectáreas comprometidas NO son `core.location.area_hectares`. Esa es el
-- área del predio; ésta es lo que se pactó polinizar. Confundirlas produce un
-- déficit falso, así que es columna propia y no un derivado.
--
-- El objetivo es un RANGO y no un número: el dueño dijo «4-6 colmenas/ha», y
-- colapsarlo obligaría a inventar cuál de los dos. Dos columnas dicen la
-- verdad; una diría una precisión que nadie declaró.
--
-- `ends_at` es anulable porque un contrato abierto existe, pero la columna hace
-- falta: sin ella un compromiso cumplido y terminado seguiría gritando déficit
-- cada temporada.
--
-- Tabla nueva y aditiva: no toca ninguna fila existente.
--
-- NOTA sobre lo que este archivo NO trae. `prisma migrate diff` propone además
-- sentencias sobre `traceability.lot_process`, `drying_run` y
-- `fermentation_run`. Esa deriva ya está en `origin/main` ANTES de este cambio
-- —medida con el esquema sin tocar— y viene de los PR #227/#228.

CREATE TABLE "apiary"."pollination_commitment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "location_id" UUID NOT NULL,
  "client_organization_id" UUID NOT NULL,
  "committed_hectares" DECIMAL(10,4) NOT NULL,
  "target_hives_per_hectare_min" DECIMAL(6,2) NOT NULL,
  "target_hives_per_hectare_max" DECIMAL(6,2) NOT NULL,
  "contract_reference" TEXT,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3),
  "notes" TEXT,
  "provenance_class" "core"."ProvenanceClass" NOT NULL,
  "data_quality" "core"."DataQuality",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_by" UUID,

  CONSTRAINT "pollination_commitment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pollination_commitment_location_id_idx"
  ON "apiary"."pollination_commitment"("location_id");
CREATE INDEX "pollination_commitment_client_organization_id_idx"
  ON "apiary"."pollination_commitment"("client_organization_id");

ALTER TABLE "apiary"."pollination_commitment"
  ADD CONSTRAINT "pollination_commitment_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "apiary"."pollination_commitment"
  ADD CONSTRAINT "pollination_commitment_client_organization_id_fkey"
  FOREIGN KEY ("client_organization_id") REFERENCES "core"."organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "apiary"."pollination_commitment"
  ADD CONSTRAINT "pollination_commitment_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
