-- A9 · Anexo E §4, §3 y §8 — la consulta mensual a las fincas vecinas.
--
-- QUÉ CIERRA, y aparece TRES veces en el Anexo. El §4 la pide como formulario: «Finca,
-- cultivo, aplicación prevista y fecha, quién informó. Es protocolo mensual, no una nota,
-- y el sistema lo reclama solo.» El §3 la enseña como alerta del sitio —«Consulta a
-- vecinos vence en 3 días»—. Y el §8 la necesita para la mitad del aviso de traslado que
-- hoy dice, literalmente, que nadie ha preguntado.
--
-- MEDIDO ANTES DE ESCRIBIR NADA. Cero coincidencias de
-- `vecin|neighbour|aspersi|spray|pesticid|agroquim` en el esquema y en `lib/apiary/`, con
-- `carencia|Withdrawal` dando diez como control positivo. Lo único que existía era la
-- CONSECUENCIA: `lib/research/catalogs.ts` tiene «Intoxicación por agroquímicos» como
-- causa de pérdida de colonia, y su propia nota dice que «en Panamá la literatura la
-- asocia a la deriva de aplicaciones vecinas». El sistema sabía registrar la colonia
-- muerta y no el aviso que la habría salvado.
--
-- POR QUÉ UN ENUM DE RESULTADO Y NO UNA FECHA ANULABLE. «Fuimos y no hay aplicación
-- prevista» es la respuesta más valiosa del protocolo y la más fácil de perder: guardada
-- como «sin fecha» sería indistinguible de «nadie preguntó». Y `no_se_pudo_consultar`
-- —nadie a quien preguntar, o se negaron— tampoco es lo mismo que no haber ido: el
-- protocolo se cumplió y la información no llegó. Es ADR-080 aplicado a un protocolo, y la
-- misma disciplina que ADR-125 aplicó al vocabulario del vacío.
--
-- LA FINCA VECINA ES UNA `Organization` OBLIGATORIA, por el precedente de la casa:
-- `pollination_commitment.client_organization_id` también lo es. Con texto libre, «la
-- finca de al lado» y «Finca Los Robles» serían dos vecinos distintos y ninguna consulta
-- podría comparar un mes con el siguiente.
--
-- Y LAS DOS RESTRICCIONES VAN EN LA BASE, NO EN TYPESCRIPT. `CLAUDE.md` lo dice con
-- nombre: «Una restricción que vive en TypeScript o en un comentario no existe para la
-- base: un importador, una reparación operativa o SQL directo se la saltan.» Aquí hay dos
-- contradicciones que nadie sabría leer después, así que las rechaza Postgres:
--   1. una fecha de aplicación junto a «no hay aplicación prevista»;
--   2. una consulta que ocurrió y no dice quién informó.
-- Se comprobó que NO crean deriva —`migrate diff` no modela `CHECK`— y la comprobación
-- está en el ADR con su control.

-- CreateEnum
CREATE TYPE "apiary"."NeighbourConsultationOutcome" AS ENUM ('sin_aplicacion_prevista', 'aplicacion_prevista', 'no_se_pudo_consultar');

-- CreateTable
CREATE TABLE "apiary"."neighbour_consultation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "neighbour_organization_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "outcome" "apiary"."NeighbourConsultationOutcome" NOT NULL,
    "crop" TEXT,
    "planned_application_at" TIMESTAMP(3),
    "informant_name" TEXT,
    "operator_person_id" UUID,
    "note" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "neighbour_consultation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "neighbour_consultation_location_id_idx" ON "apiary"."neighbour_consultation"("location_id");

-- CreateIndex
CREATE INDEX "neighbour_consultation_neighbour_organization_id_idx" ON "apiary"."neighbour_consultation"("neighbour_organization_id");

-- CreateIndex
CREATE INDEX "neighbour_consultation_planned_application_at_idx" ON "apiary"."neighbour_consultation"("planned_application_at");

-- AddForeignKey
ALTER TABLE "apiary"."neighbour_consultation" ADD CONSTRAINT "neighbour_consultation_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."neighbour_consultation" ADD CONSTRAINT "neighbour_consultation_neighbour_organization_id_fkey" FOREIGN KEY ("neighbour_organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."neighbour_consultation" ADD CONSTRAINT "neighbour_consultation_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."neighbour_consultation" ADD CONSTRAINT "neighbour_consultation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CHECK 1 — la fecha de aplicación existe EXACTAMENTE cuando hay aplicación prevista.
ALTER TABLE "apiary"."neighbour_consultation"
  ADD CONSTRAINT "neighbour_consultation_fecha_solo_si_prevista" CHECK (
    ("outcome" = 'aplicacion_prevista' AND "planned_application_at" IS NOT NULL)
    OR ("outcome" <> 'aplicacion_prevista' AND "planned_application_at" IS NULL)
  );

-- CHECK 2 — una consulta que SÍ ocurrió dice quién informó; la que no se pudo hacer, no
-- está obligada. No se prohíbe el nombre en ese caso: se puede haber hablado con alguien
-- que no supiera, y eso es información.
ALTER TABLE "apiary"."neighbour_consultation"
  ADD CONSTRAINT "neighbour_consultation_informante_si_hubo_consulta" CHECK (
    "outcome" = 'no_se_pudo_consultar' OR "informant_name" IS NOT NULL
  );
