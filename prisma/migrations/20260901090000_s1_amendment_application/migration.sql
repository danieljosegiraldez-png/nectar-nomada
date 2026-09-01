-- S1 — la aplicación de enmienda, sobre `treatment_batch`
-- (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2, semanas 10-14; Paso 8).
--
-- **Decisión del dueño, 2026-09-01: opción A.** Reusar `treatment_batch` en vez
-- de una tabla `amendment_application` aparte. La razón no es economía: el
-- control experimental ya vive en `experiment.control_treatment_batch_id`
-- apuntando a un treatment_batch, y una tabla paralela habría dejado al T0 del
-- marco —el control sin tratar que §10.3 llama NO NEGOCIABLE— sin poder ocupar
-- ese campo.
--
-- Aditiva: dos columnas nullable, sus índices, y una restricción CHECK.
--
-- **La restricción dice «nunca los dos», no «exactamente uno», y eso cambia lo
-- que el plan §6 recomendaba.** Medido antes de escribirla: los 43
-- treatment_batch vivos tienen lote, PERO `createTreatmentBatch` ya acepta
-- `lotId` nulo y ya resuelve el ámbito sólo por proyecto en ese caso. Exigir
-- «exactamente uno» habría prohibido retroactivamente una forma que el código
-- permite y que este trabajo no vino a cambiar.
--
-- Lo que sí hay que impedir es la ambigüedad: dos sujetos son dos ámbitos de
-- RBAC, y elegir uno sería elegir el más laxo. Eso es lo que el CHECK impide.
-- El servicio sí exige `location_id` en el camino de la enmienda.
ALTER TABLE "research"."treatment_batch"
  ADD COLUMN "location_id"      UUID,
  ADD COLUMN "biochar_batch_id" UUID;

CREATE INDEX "treatment_batch_location_id_idx"      ON "research"."treatment_batch"("location_id");
CREATE INDEX "treatment_batch_biochar_batch_id_idx" ON "research"."treatment_batch"("biochar_batch_id");

ALTER TABLE "research"."treatment_batch"
  ADD CONSTRAINT "treatment_batch_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "treatment_batch_biochar_batch_id_fkey"
  FOREIGN KEY ("biochar_batch_id") REFERENCES "traceability"."biochar_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un lote de café o un pedazo de tierra, nunca los dos. Toda fila viva la
-- cumple (43 de 43 tienen lote y ninguna tiene location).
ALTER TABLE "research"."treatment_batch"
  ADD CONSTRAINT "treatment_batch_un_solo_sujeto"
  CHECK (num_nonnulls("lot_id", "location_id") <= 1);
