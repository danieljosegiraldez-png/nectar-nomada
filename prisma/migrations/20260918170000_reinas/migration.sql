-- Faenas, división y reinas — Tarea 4: la reina de la colonia, por intervalos.
-- Spec: docs/superpowers/specs/2026-09-18-faenas-division-y-reinas-design.md §4. Sin marca de reina.

CREATE TYPE "apiary"."QueenOrigin" AS ENUM ('criada_aqui', 'comprada', 'natural', 'de_enjambre', 'otro');
CREATE TYPE "apiary"."QueenTenureEnd" AS ENUM ('cambiada', 'muerta', 'perdida', 'enjambro', 'otro');

CREATE TABLE "apiary"."queen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "origin" "apiary"."QueenOrigin" NOT NULL,
    "origin_colony_id" UUID,
    "notes" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "queen_pkey" PRIMARY KEY ("id"),
    -- «Criada aquí» dice de qué colonia salió, y sólo ella lo dice.
    CONSTRAINT "queen_criada_aqui_con_colonia" CHECK (("origin" = 'criada_aqui') = ("origin_colony_id" IS NOT NULL)),
    CONSTRAINT "queen_otro_con_nota" CHECK ("origin" <> 'otro' OR length(btrim(coalesce("notes", ''))) > 0)
);

CREATE TABLE "apiary"."queen_tenure" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "queen_id" UUID NOT NULL,
    "colony_id" UUID NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3),
    "fin" "apiary"."QueenTenureEnd",
    "fin_nota" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "queen_tenure_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "queen_tenure_hasta_despues_de_desde" CHECK ("hasta" IS NULL OR "hasta" > "desde"),
    CONSTRAINT "queen_tenure_fin_sii_hasta" CHECK (("fin" IS NULL) = ("hasta" IS NULL)),
    CONSTRAINT "queen_tenure_fin_otro_con_nota" CHECK ("fin" IS DISTINCT FROM 'otro' OR length(btrim(coalesce("fin_nota", ''))) > 0)
);

CREATE INDEX "queen_origin_colony_id_idx" ON "apiary"."queen"("origin_colony_id");
CREATE INDEX "queen_tenure_colony_id_desde_idx" ON "apiary"."queen_tenure"("colony_id", "desde");
CREATE INDEX "queen_tenure_queen_id_idx" ON "apiary"."queen_tenure"("queen_id");

-- Una reina abierta por colonia, y una reina abierta en una sola colonia.
CREATE UNIQUE INDEX "queen_tenure_colony_id_abierta_key" ON "apiary"."queen_tenure"("colony_id") WHERE "hasta" IS NULL;
CREATE UNIQUE INDEX "queen_tenure_queen_id_abierta_key" ON "apiary"."queen_tenure"("queen_id") WHERE "hasta" IS NULL;

ALTER TABLE "apiary"."queen" ADD CONSTRAINT "queen_origin_colony_id_fkey" FOREIGN KEY ("origin_colony_id") REFERENCES "apiary"."colony"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."queen" ADD CONSTRAINT "queen_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "apiary"."queen_tenure" ADD CONSTRAINT "queen_tenure_queen_id_fkey" FOREIGN KEY ("queen_id") REFERENCES "apiary"."queen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."queen_tenure" ADD CONSTRAINT "queen_tenure_colony_id_fkey" FOREIGN KEY ("colony_id") REFERENCES "apiary"."colony"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."queen_tenure" ADD CONSTRAINT "queen_tenure_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
