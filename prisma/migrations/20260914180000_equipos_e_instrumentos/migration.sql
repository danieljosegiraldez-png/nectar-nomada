-- Equipos e instrumentos: de texto libre a objetos con identidad, condición y verificación.
--
-- `docs/architecture/EQUIPMENT_AND_READINESS.md` §2-§4 y §7, con las CINCO decisiones que
-- Daniel tomó el 2026-09-14. Las cuatro primeras son las de su §11; la quinta la añadió él y
-- cambia el §7 del propio documento y la §3 de `docs/beneficio/02_calibration.md`.
--
-- QUÉ CIERRA. Medido contra `origin/main` antes de escribir nada: **no existía ninguna entidad
-- de equipos ni de instrumentación.** El equipo se registraba como TEXTO LIBRE en cuatro
-- sitios —`fermentation_run.vessel_note` («Tank 3»), `lot_transformation.equipment_note`,
-- `roast_session.equipment_note`, `storage_assignment.container_note`— y
-- `measurement.device_id` era una columna heredada que **ningún código ha escrito nunca** (su
-- propio comentario lo dice). El único modelo de aparato, `device`, son los teléfonos que
-- sincronizan desde el campo. Control positivo de esa medición: la misma búsqueda encontraba
-- `calibration_session` y `reference_standard`, que existen y son de calibración de PANEL
-- SENSORIAL —personas, no instrumentos—, y por eso aquí el prefijo es `instrument_`.
--
-- DECISIÓN 4 — UN SOLO `equipment`, Y LOS RECIPIENTES SE PLIEGAN DENTRO.
-- `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §4 especifica `material.vessel` para barricas y
-- duelas; `18_` especifica fermentadores, camas, despulpadoras e instrumentos. Son la misma
-- cosa con distinta ropa: un objeto físico durable, en un sitio, en una condición, a veces en
-- uso. **Ninguno de los dos estaba construido**, así que plegarlos costó cero hoy y no habría
-- sido barato después. `format` viene tal cual de `material.vessel`.
--
-- DECISIÓN 2 — LOS TRES EJES NO SE COLAPSAN. `material.vessel` planeaba un
-- `status [available|in_use|retired]` que junta tres hechos independientes, y por eso no
-- puede contestar «¿qué fermentadores están libres Y sanos?». Aquí: el ciclo de vida es
-- columna; **la asignación se DERIVA de la corrida que referencia el equipo** y no se guarda
-- —guardarla crea dos fuentes que derivan la primera vez que alguien olvida limpiar una
-- bandera—; y la condición es el último `equipment_condition_report`.
--
-- LA CUSTODIA ES UNA CADENA DE EVENTOS, no una `location_id` mutable, que no podría contestar
-- «¿dónde estaba esto en marzo?» ni «¿volvió?». Misma disciplina que `lot_transformation`.
--
-- LAS CUATRO FK NUEVAS VAN **JUNTO** AL TEXTO LIBRE, NUNCA EN SU LUGAR, y ninguna se rellena
-- retroactivamente. El texto es el registro original de lo que el operario escribió; la FK es
-- la interpretación de a qué objeto se refería. `DATA_ARCHITECTURE.md` §4 prohíbe
-- re-etiquetar evidencia en su sitio, y adivinar a qué «refractómetro» se refería alguien
-- sería inventar un hecho. Las filas viejas se quedan con texto y FK nula, que es la
-- afirmación honesta de que el vínculo nunca estuvo estructurado.
--
-- DECISIÓN 5, LA DE DANIEL, Y CAMBIA EL DISEÑO: LA VERIFICACIÓN ES POR CONTRASTE, NO POR
-- CALENDARIO. El documento y `02_calibration.md` §3 daban vigencias de reloj —«24 h en cosecha
-- activa», «7 días»— con la columna marcada `[PROVISIONAL]`, que es donde faltaba el dueño.
-- Él la cerró: «cada aplicación se hace una prueba de refractómetro con agua, y que debe estar
-- en 0 brix, o si es pHímetro específico, se debe poner una referencia de solución 4.0 pH y
-- otra de 7.0 y o 10 […] no se debe calibrar si se han realizado estas pruebas positivamente
-- […] si se alerta y queda explícito que no está revisado.» De ahí:
--   1. la verificación es un CONTRASTE contra patrones declarados por instrumento;
--   2. QUIÉN los declara es un dato —«el jefe del beneficio con el especialista en procesos»—
--      y por eso `decided_by_person_id` existe: un criterio sin autor no se discute después;
--   3. el vencimiento AVISA y no descalifica, que es la §7.1 —degradar, nunca bloquear—
--      aplicada al eje del tiempo. Bloquear se esquiva en el patio, el operario apunta el
--      número en papel, y entonces el sistema sabe MENOS.
--
-- Y UNA AFIRMACIÓN QUE CORREGÍ ANTES DE ESCRIBIR ESTO. El primer borrador del esquema decía
-- que «la migración obliga» la coherencia entre `instrument_check.outcome` y sus resultados.
-- **Un CHECK no puede mirar otra tabla, así que era falso.** La forma que sí la hace imposible
-- no es una restricción sino la derivación: `outcome` nace en `fail` y **un trigger lo pone en
-- `pass` sólo si hay al menos un resultado y todos caen dentro de tolerancia**. Un acto de
-- verificación sin un solo contraste NO es un aprobado — que es exactamente el cero que este
-- CreateEnum
CREATE TYPE "core"."EquipmentKind" AS ENUM ('vessel', 'instrument', 'tool', 'machine');

-- CreateEnum
CREATE TYPE "core"."EquipmentFormat" AS ENUM ('barrel', 'cube', 'chip', 'stave', 'spiral', 'other');

-- CreateEnum
CREATE TYPE "core"."EquipmentLifecycle" AS ENUM ('active', 'retired', 'disposed');

-- CreateEnum
CREATE TYPE "core"."EquipmentCondition" AS ENUM ('operational', 'needs_cleaning', 'needs_maintenance', 'faulty', 'out_of_service');

-- CreateEnum
CREATE TYPE "core"."InstrumentCheckOutcome" AS ENUM ('pass', 'fail');

-- CreateEnum
CREATE TYPE "core"."MeasurementReviewOutcome" AS ENUM ('confirmed', 'superseded', 'retained_with_limitation');

-- AlterTable
ALTER TABLE "traceability"."fermentation_run" ADD COLUMN     "vessel_equipment_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN     "equipment_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."measurement" ADD COLUMN     "instrument_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."roast_session" ADD COLUMN     "equipment_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."storage_assignment" ADD COLUMN     "container_equipment_id" UUID;

-- CreateTable
CREATE TABLE "core"."equipment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "kind" "core"."EquipmentKind" NOT NULL,
    "format" "core"."EquipmentFormat",
    "is_fixed_in_place" BOOLEAN NOT NULL DEFAULT false,
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "classification" "core"."ClassificationLevel" NOT NULL DEFAULT 'internal',
    "lifecycle_status" "core"."EquipmentLifecycle" NOT NULL DEFAULT 'active',
    "check_advisory_hours" INTEGER,
    "acquired_at" TIMESTAMP(3),
    "acquisition_note" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."equipment_transfer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipment_id" UUID NOT NULL,
    "from_location_id" UUID,
    "to_location_id" UUID NOT NULL,
    "moved_by_person_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "condition_at_handover" "core"."EquipmentCondition",
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "equipment_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."equipment_condition_report" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipment_id" UUID NOT NULL,
    "condition" "core"."EquipmentCondition" NOT NULL,
    "reported_by_person_id" UUID,
    "responsible_person_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "evidence_asset_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "equipment_condition_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."instrument_check_requirement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipment_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "reference_value" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "tolerance_abs" DECIMAL(12,4) NOT NULL,
    "decided_by_person_id" UUID,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "instrument_check_requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."instrument_check" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipment_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "performed_by_person_id" UUID,
    "ambient_temp_c" DECIMAL(5,2),
    "outcome" "core"."InstrumentCheckOutcome" NOT NULL DEFAULT 'fail',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "instrument_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."instrument_check_result" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "check_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "observed_value" DECIMAL(12,4) NOT NULL,
    "within_tolerance" BOOLEAN NOT NULL,

    CONSTRAINT "instrument_check_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."measurement_review_flag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "measurement_id" UUID NOT NULL,
    "raised_by_check_id" UUID NOT NULL,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_person_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "outcome" "core"."MeasurementReviewOutcome",
    "note" TEXT,

    CONSTRAINT "measurement_review_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_organization_id_idx" ON "core"."equipment"("organization_id");

-- CreateIndex
CREATE INDEX "equipment_kind_idx" ON "core"."equipment"("kind");

-- CreateIndex
CREATE INDEX "equipment_transfer_equipment_id_occurred_at_idx" ON "core"."equipment_transfer"("equipment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "equipment_condition_report_equipment_id_occurred_at_idx" ON "core"."equipment_condition_report"("equipment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "instrument_check_requirement_equipment_id_idx" ON "core"."instrument_check_requirement"("equipment_id");

-- CreateIndex
CREATE INDEX "instrument_check_equipment_id_occurred_at_idx" ON "core"."instrument_check"("equipment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "instrument_check_result_requirement_id_idx" ON "core"."instrument_check_result"("requirement_id");

-- CreateIndex
CREATE UNIQUE INDEX "instrument_check_result_check_id_requirement_id_key" ON "core"."instrument_check_result"("check_id", "requirement_id");

-- CreateIndex
CREATE INDEX "measurement_review_flag_measurement_id_idx" ON "core"."measurement_review_flag"("measurement_id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_review_flag_measurement_id_raised_by_check_id_key" ON "core"."measurement_review_flag"("measurement_id", "raised_by_check_id");

-- AddForeignKey
ALTER TABLE "traceability"."lot_transformation" ADD CONSTRAINT "lot_transformation_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "core"."equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."measurement" ADD CONSTRAINT "measurement_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "core"."equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."fermentation_run" ADD CONSTRAINT "fermentation_run_vessel_equipment_id_fkey" FOREIGN KEY ("vessel_equipment_id") REFERENCES "core"."equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."roast_session" ADD CONSTRAINT "roast_session_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "core"."equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment" ADD CONSTRAINT "equipment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment" ADD CONSTRAINT "equipment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "core"."project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment" ADD CONSTRAINT "equipment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_transfer" ADD CONSTRAINT "equipment_transfer_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "core"."equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_transfer" ADD CONSTRAINT "equipment_transfer_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_transfer" ADD CONSTRAINT "equipment_transfer_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_transfer" ADD CONSTRAINT "equipment_transfer_moved_by_person_id_fkey" FOREIGN KEY ("moved_by_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_transfer" ADD CONSTRAINT "equipment_transfer_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_condition_report" ADD CONSTRAINT "equipment_condition_report_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "core"."equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_condition_report" ADD CONSTRAINT "equipment_condition_report_reported_by_person_id_fkey" FOREIGN KEY ("reported_by_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_condition_report" ADD CONSTRAINT "equipment_condition_report_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_condition_report" ADD CONSTRAINT "equipment_condition_report_evidence_asset_id_fkey" FOREIGN KEY ("evidence_asset_id") REFERENCES "core"."asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_condition_report" ADD CONSTRAINT "equipment_condition_report_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."instrument_check_requirement" ADD CONSTRAINT "instrument_check_requirement_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "core"."equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."instrument_check_requirement" ADD CONSTRAINT "instrument_check_requirement_decided_by_person_id_fkey" FOREIGN KEY ("decided_by_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."instrument_check_requirement" ADD CONSTRAINT "instrument_check_requirement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."instrument_check" ADD CONSTRAINT "instrument_check_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "core"."equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."instrument_check" ADD CONSTRAINT "instrument_check_performed_by_person_id_fkey" FOREIGN KEY ("performed_by_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."instrument_check" ADD CONSTRAINT "instrument_check_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."instrument_check_result" ADD CONSTRAINT "instrument_check_result_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "core"."instrument_check"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."instrument_check_result" ADD CONSTRAINT "instrument_check_result_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "core"."instrument_check_requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."measurement_review_flag" ADD CONSTRAINT "measurement_review_flag_measurement_id_fkey" FOREIGN KEY ("measurement_id") REFERENCES "traceability"."measurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."measurement_review_flag" ADD CONSTRAINT "measurement_review_flag_raised_by_check_id_fkey" FOREIGN KEY ("raised_by_check_id") REFERENCES "core"."instrument_check"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."measurement_review_flag" ADD CONSTRAINT "measurement_review_flag_reviewed_by_person_id_fkey" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."storage_assignment" ADD CONSTRAINT "storage_assignment_container_equipment_id_fkey" FOREIGN KEY ("container_equipment_id") REFERENCES "core"."equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE `migrate diff` NO MODELA, Y POR ESO VA A MANO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Comprobado que NADA de lo que sigue crea deriva: `migrate diff` no modela ni
-- `CHECK` ni triggers, así que `tests/derivaDeMigraciones.test.ts` sigue en cero.
-- El `DEFAULT 'fail'` de `outcome` SÍ lo modela, y por eso está declarado en el
-- `schema.prisma` y no aquí — ponerlo sólo en SQL habría abierto deriva.

-- 1. `format` viene de `material.vessel` y sólo tiene sentido en un recipiente.
--    Sin esto, un refractómetro con `format = 'barrel'` es una fila perfectamente
--    válida que después nadie sabe leer.
ALTER TABLE "core"."equipment"
  ADD CONSTRAINT "equipment_format_solo_en_recipientes"
  CHECK ("format" IS NULL OR "kind" = 'vessel');

-- 2. Un informe no se puede resolver antes de ocurrir.
ALTER TABLE "core"."equipment_condition_report"
  ADD CONSTRAINT "equipment_condition_resuelto_despues"
  CHECK ("resolved_at" IS NULL OR "resolved_at" >= "occurred_at");

-- 3. Una tolerancia negativa haría que ningún contraste pasara nunca, y el
--    síntoma sería «este instrumento nunca se verifica», que se lee como avería
--    del instrumento y no del criterio.
ALTER TABLE "core"."instrument_check_requirement"
  ADD CONSTRAINT "instrument_req_tolerancia_no_negativa"
  CHECK ("tolerance_abs" >= 0);

-- 4. Una revisión que se marca resuelta necesita decir quién y cuándo. «Revisada
--    por nadie» y «sin revisar» se pintarían igual, y entonces la cola de
--    revisión no informa de nada.
ALTER TABLE "core"."measurement_review_flag"
  ADD CONSTRAINT "review_flag_resuelta_con_autor"
  CHECK (("outcome" IS NULL AND "reviewed_at" IS NULL)
      OR ("outcome" IS NOT NULL AND "reviewed_at" IS NOT NULL));

-- ── EL VEREDICTO SE DERIVA, NO SE GUARDA A MANO ────────────────────────────
--
-- `outcome` nace en `fail` (DEFAULT, declarado en el esquema) y este trigger lo
-- sube a `pass` ÚNICAMENTE si hay al menos un resultado y ninguno cae fuera de
-- tolerancia. Las dos mitades importan:
--
--   · «al menos uno» — un acto de verificación sin un solo contraste **no es un
--     aprobado**. Sin esa mitad, `NOT EXISTS (fuera de tolerancia)` sobre cero
--     filas devuelve verdadero y una verificación vacía saldría `pass`. Es
--     exactamente el cero que este repositorio ha leído mal una y otra vez, y
--     aquí significaría «el refractómetro está verificado» sin haberlo mirado.
--   · «ninguno fuera» — lo obvio, y lo que un `outcome` escrito a mano podría
--     contradecir.
--
-- Se DERIVA en vez de VALIDARSE con un constraint trigger a propósito: validar
-- obliga a insertar el veredicto correcto y rechazar si no, lo que deja a la
-- capa de servicio calculando lo mismo dos veces. Derivar hace la contradicción
-- imposible de representar, que es más fuerte que hacerla rechazable.
CREATE OR REPLACE FUNCTION "core"."recalcular_veredicto_de_verificacion"()
RETURNS TRIGGER AS $$
DECLARE
  afectados UUID[];
BEGIN
  IF (TG_OP = 'DELETE') THEN
    afectados := ARRAY[OLD."check_id"];
  ELSIF (TG_OP = 'UPDATE' AND NEW."check_id" IS DISTINCT FROM OLD."check_id") THEN
    -- Mover un resultado de una verificación a otra cambia el veredicto de LAS DOS.
    afectados := ARRAY[OLD."check_id", NEW."check_id"];
  ELSE
    afectados := ARRAY[NEW."check_id"];
  END IF;

  UPDATE "core"."instrument_check" c
     SET "outcome" = CASE
       WHEN EXISTS (SELECT 1 FROM "core"."instrument_check_result" r WHERE r."check_id" = c."id")
        AND NOT EXISTS (SELECT 1 FROM "core"."instrument_check_result" r
                         WHERE r."check_id" = c."id" AND r."within_tolerance" = FALSE)
       THEN 'pass'::"core"."InstrumentCheckOutcome"
       ELSE 'fail'::"core"."InstrumentCheckOutcome"
     END
   WHERE c."id" = ANY(afectados);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "instrument_check_result_recalcula_veredicto"
AFTER INSERT OR UPDATE OR DELETE ON "core"."instrument_check_result"
FOR EACH ROW EXECUTE FUNCTION "core"."recalcular_veredicto_de_verificacion"();
