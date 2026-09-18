-- ADR-165 -- la condicion del sitio, de texto libre a lista (protocolo de campo v2).

-- CreateEnum
CREATE TYPE "traceability"."SiteCondition" AS ENUM ('hormigas', 'moho_humedad', 'pasto_alto', 'cerca_caida', 'dosel_cerrado', 'fuente_de_agua_seca', 'encharcamiento', 'sin_novedad', 'otro');

-- AlterTable
ALTER TABLE "traceability"."field_session" ADD COLUMN     "site_condition_other_note" TEXT,
ADD COLUMN     "site_conditions" "traceability"."SiteCondition"[];


-- Las reglas viven TAMBIEN en la base. Se compara como `text[]` por la misma razon que en
-- ADR-161: un valor de enum recien creado en esta transaccion se usa mejor por su texto.

-- «otro» dice cual, y la nota solo existe cuando hay «otro».
ALTER TABLE "traceability"."field_session" ADD CONSTRAINT "field_session_otra_condicion_dice_cual"
  CHECK (coalesce("site_conditions"::text[] @> ARRAY['otro'], false)
         = ("site_condition_other_note" IS NOT NULL AND btrim("site_condition_other_note") <> ''));
-- «sin novedad» va sola: «mire y esta bien» junto a «hormigas» se contradice.
ALTER TABLE "traceability"."field_session" ADD CONSTRAINT "field_session_sin_novedad_va_sola"
  CHECK (NOT coalesce("site_conditions"::text[] @> ARRAY['sin_novedad'], false) OR cardinality("site_conditions") = 1);
