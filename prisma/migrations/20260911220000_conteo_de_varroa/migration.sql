-- El conteo de varroa: una MEDICION, no una observacion.
--
-- QUE CIERRA. `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.5 pide cuatro campos y
-- dice que «cuenta aparte porque es una medicion, no una observacion»: metodo,
-- abejas de muestra, acaros contados, e infestacion % derivada. Ninguno existia.
-- Y el Anexo C §2.1 nombra la serie que esto hace posible: «Infestacion de
-- varroa | por conteo | umbral de tratamiento y si el tratamiento sirvio».
--
-- POR QUE TABLA PROPIA Y NO UN `Measurement`. `traceability.measurement` guarda
-- UNA variable por fila. Un conteo de varroa son tres datos que solo significan
-- algo juntos; repartirlos en dos filas —mas un metodo sin sitio— perderia el
-- vinculo que los hace interpretables, y nada garantizaria que las tres piezas
-- hablan del mismo conteo.
--
-- POR QUE TAMPOCO UN CAMPO DEL TRATAMIENTO. Lo razono el informe A9 sobre la
-- «eficacia observada» que el Anexo B §4 pide: «Se escribe semanas despues, no
-- al cerrar la visita. Si se pide en el cierre, se contestara vacio siempre. Es
-- un conteo de varroa posterior ligado al tratamiento anterior — o sea, una
-- relacion entre dos visitas, no un campo.» De ahi
-- `evaluates_colony_event_id`, ANULABLE: contar para decidir si hay que tratar
-- es el caso normal, y eso no evalua nada.
--
-- EL PORCENTAJE NO SE GUARDA. Es acaros/abejas, y el Anexo lo marca «derivado».
-- Guardarlo seria un segundo sitio que puede discrepar del primero — la misma
-- razon por la que la carencia se guarda en dias y no como fecha de fin
-- (ADR-115).
--
-- EL METODO ES OBLIGATORIO EN CUANTO HAY CONTEO, porque «el resultado solo es
-- comparable dentro del mismo metodo»: un 3 % por alcohol y un 3 % por bandeja
-- no son el mismo hecho.
--
-- LA FK EN `field_event` sigue el molde de A9.1: un conteo hecho durante una
-- visita entra en ella. Sin ella seria el unico registro de apiario que no se
-- agrupa, y «la visita es el hecho» dejaria de valer para el.
--
-- ADITIVA: no toca ninguna fila. Nadie ha contado varroa todavia.

-- CreateEnum
CREATE TYPE "apiary"."VarroaMethod" AS ENUM ('alcohol', 'azucar', 'bandeja', 'otro');

-- AlterTable
ALTER TABLE "traceability"."field_event" ADD COLUMN     "varroa_count_id" UUID;

-- CreateTable
CREATE TABLE "apiary"."varroa_count" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "colony_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "method" "apiary"."VarroaMethod" NOT NULL,
    "sample_bees" INTEGER NOT NULL,
    "mites_counted" INTEGER NOT NULL,
    "evaluates_colony_event_id" UUID,
    "operator_person_id" UUID,
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "data_quality" "core"."DataQuality",
    "client_draft_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "varroa_count_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "varroa_count_client_draft_id_key" ON "apiary"."varroa_count"("client_draft_id");

-- CreateIndex
CREATE INDEX "varroa_count_colony_id_idx" ON "apiary"."varroa_count"("colony_id");

-- CreateIndex
CREATE INDEX "varroa_count_evaluates_colony_event_id_idx" ON "apiary"."varroa_count"("evaluates_colony_event_id");

-- CreateIndex
CREATE INDEX "field_event_varroa_count_id_idx" ON "traceability"."field_event"("varroa_count_id");

ALTER TABLE "traceability"."field_event" ADD CONSTRAINT "field_event_varroa_count_id_fkey" FOREIGN KEY ("varroa_count_id") REFERENCES "apiary"."varroa_count"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "apiary"."varroa_count" ADD CONSTRAINT "varroa_count_colony_id_fkey" FOREIGN KEY ("colony_id") REFERENCES "apiary"."colony"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "apiary"."varroa_count" ADD CONSTRAINT "varroa_count_evaluates_colony_event_id_fkey" FOREIGN KEY ("evaluates_colony_event_id") REFERENCES "apiary"."colony_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "apiary"."varroa_count" ADD CONSTRAINT "varroa_count_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "apiary"."varroa_count" ADD CONSTRAINT "varroa_count_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
