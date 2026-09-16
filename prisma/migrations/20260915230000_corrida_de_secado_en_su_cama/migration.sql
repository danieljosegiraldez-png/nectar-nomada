-- Tarea 2 de `.superpowers/sdd/2026-09-15-muestra-y-topologia-de-secado/`: una
-- `DryingRun` pasa a poder apuntar a la cama concreta (`LocationType.drying_bed`,
-- de la tarea 1), y un disparador exige que, si apunta a algo, sea una cama.
--
-- `locationId` y `method` se quedan como legado y NO se rellenan hacia atrás:
-- las corridas viejas nunca dijeron si su Location era una cama o el sitio
-- entero, y adivinarlo sería inventar un hecho.
--
-- Un `CHECK` no puede mirar otra tabla (`core.location` desde
-- `traceability.drying_run`), así que esto es un disparador. Misma forma que
-- `recalcular_veredicto_de_verificacion` en
-- `20260914180000_equipos_e_instrumentos/migration.sql`.

-- AlterTable
ALTER TABLE "traceability"."drying_run"
  ADD COLUMN "drying_bed_location_id" UUID,
  ADD CONSTRAINT "drying_run_drying_bed_location_id_fkey"
    FOREIGN KEY ("drying_bed_location_id") REFERENCES "core"."location"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "drying_run_drying_bed_location_id_idx"
  ON "traceability"."drying_run"("drying_bed_location_id");

-- El disparador: sólo corre cuando la columna trae un valor, y sólo mira el
-- `location_type` de esa fila. NULL sigue significando "sin estructurar" y
-- pasa de largo.
CREATE OR REPLACE FUNCTION "traceability"."exigir_cama_de_secado"()
RETURNS TRIGGER AS $$
DECLARE tipo TEXT;
BEGIN
  IF NEW."drying_bed_location_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "location_type"::TEXT INTO tipo
    FROM "core"."location" WHERE "id" = NEW."drying_bed_location_id";
  IF tipo IS DISTINCT FROM 'drying_bed' THEN
    RAISE EXCEPTION 'La ubicación de una corrida de secado debe ser una cama de secado (es %)', tipo;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "drying_run_exigir_cama"
  BEFORE INSERT OR UPDATE OF "drying_bed_location_id" ON "traceability"."drying_run"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_cama_de_secado"();
