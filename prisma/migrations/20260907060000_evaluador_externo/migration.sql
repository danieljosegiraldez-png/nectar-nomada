-- Un informe de cata puede venir de alguien que no tiene cuenta.
--
-- POR QUÉ. Cuando se le paga un análisis a un Q-grader o a un tostador, el
-- resultado llega bajo SU firma, y esa persona no es usuaria de la plataforma.
-- Hasta hoy `assessment.evaluator_user_account_id` era NOT NULL con FK a
-- `user_account`, así que ese trabajo —el que se paga— no se podía registrar en
-- absoluto y vivía fuera del sistema.
--
-- LA REGLA VIVE AQUÍ, NO EN TYPESCRIPT. Exactamente una de las dos columnas de
-- evaluador está puesta, y un informe externo trae SIEMPRE el puntero a su
-- original. Una restricción que sólo existe en la aplicación se la salta un
-- importador, una reparación operativa o SQL directo, y en un módulo cuyo
-- valor entero es la procedencia eso no es aceptable.
--
-- LO EXISTENTE NO SE TOCA. Las valoraciones que ya hay tienen cuenta y no
-- tienen `external_evaluator_person_id` ni `source_reference`, así que pasan el
-- CHECK sin migrar un solo dato. Se comprueba abajo antes de crearlo: si alguna
-- fila no lo cumpliera, la migración falla aquí y no en producción a medias.

-- AlterTable
ALTER TABLE "sensory"."assessment" ALTER COLUMN "evaluator_user_account_id" DROP NOT NULL;

ALTER TABLE "sensory"."assessment" ADD COLUMN     "external_evaluator_person_id" UUID,
ADD COLUMN     "source_reference" TEXT;

-- AddForeignKey
ALTER TABLE "sensory"."assessment" ADD CONSTRAINT "assessment_external_evaluator_person_id_fkey"
  FOREIGN KEY ("external_evaluator_person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "assessment_external_evaluator_person_id_idx"
  ON "sensory"."assessment"("external_evaluator_person_id");

-- El `@@unique([blindSampleId, evaluatorUserAccountId])` que ya existía deja de
-- bastar en cuanto esa columna admite NULL: Postgres trata los NULL como
-- distintos, así que sin éste el mismo informe externo entraría dos veces sobre
-- la misma muestra sin una queja.
CREATE UNIQUE INDEX "assessment_blind_sample_id_external_evaluator_person_id_key"
  ON "sensory"."assessment"("blind_sample_id", "external_evaluator_person_id");

-- La regla, y su comprobación previa contra los datos que ya hay.
DO $$
DECLARE incumplen INTEGER;
BEGIN
  SELECT count(*) INTO incumplen FROM "sensory"."assessment"
  WHERE NOT (
    (("evaluator_user_account_id" IS NULL) <> ("external_evaluator_person_id" IS NULL))
    AND ("external_evaluator_person_id" IS NULL
         OR ("source_reference" IS NOT NULL AND btrim("source_reference") <> ''))
  );
  IF incumplen > 0 THEN
    RAISE EXCEPTION 'assessment: % fila(s) no cumplen la regla de evaluador; no se crea el CHECK', incumplen;
  END IF;
END $$;

ALTER TABLE "sensory"."assessment" ADD CONSTRAINT "assessment_un_solo_evaluador" CHECK (
  (("evaluator_user_account_id" IS NULL) <> ("external_evaluator_person_id" IS NULL))
  AND ("external_evaluator_person_id" IS NULL
       OR ("source_reference" IS NOT NULL AND btrim("source_reference") <> ''))
);
