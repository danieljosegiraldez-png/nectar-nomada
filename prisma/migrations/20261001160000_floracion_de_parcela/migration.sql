-- La floración de una parcela — decisión de Daniel, 2026-10-01: «parcela, microparcela o bloque».
--
-- Misma forma que una intervención: se dirige por `location_id` —un `plot` o un `micro_plot`— y se
-- acota opcionalmente a un bloque. No es una familia de entidades nueva.
--
-- VENTANA y no tres eventos sueltos: la pregunta que hay que contestar es «¿esta parcela estaba en
-- floración el día X?», y con eventos inicio/pico/fin hay que emparejarlos y decidir qué hacer con
-- un inicio sin fin. Aquí `ends_at` nulo significa **floración abierta**, que es el estado real de
-- campo mientras dura.
CREATE TABLE "traceability"."plot_bloom" (
  "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
  "location_id"        UUID         NOT NULL,
  "plot_block_id"      UUID,
  "starts_at"          TIMESTAMP(3) NOT NULL,
  "ends_at"            TIMESTAMP(3),
  "notes"              TEXT,
  "observer_person_id" UUID,
  "provenance_class"   "core"."ProvenanceClass" NOT NULL,
  "created_by"         UUID         NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plot_bloom_pkey" PRIMARY KEY ("id")
);

-- Una ventana al revés no es una ventana. Vive en la BASE y no sólo en el servicio porque un
-- importador o un SQL directo tampoco deben poder escribirla.
ALTER TABLE "traceability"."plot_bloom"
  ADD CONSTRAINT "plot_bloom_window_check"
  CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at");

CREATE INDEX "plot_bloom_location_id_starts_at_idx"
  ON "traceability"."plot_bloom"("location_id", "starts_at");

ALTER TABLE "traceability"."plot_bloom"
  ADD CONSTRAINT "plot_bloom_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "traceability"."plot_bloom"
  ADD CONSTRAINT "plot_bloom_plot_block_id_fkey"
  FOREIGN KEY ("plot_block_id") REFERENCES "traceability"."plot_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "traceability"."plot_bloom"
  ADD CONSTRAINT "plot_bloom_observer_person_id_fkey"
  FOREIGN KEY ("observer_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
