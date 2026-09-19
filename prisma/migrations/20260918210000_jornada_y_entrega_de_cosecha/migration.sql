-- Jornada y entrega de cosecha (pieza 1 de 3). Spec: docs/superpowers/specs/2026-09-18-jornada-y-entrega-de-cosecha-design.md
-- La finca no crea lotes: abre jornadas, asigna recolectores y anota entregas que el beneficio recibirá.

CREATE TYPE "traceability"."EstadoDeJornada" AS ENUM ('abierta', 'cerrada');
CREATE TYPE "traceability"."EstadoDeEntrega" AS ENUM ('enviada', 'anulada');

CREATE TABLE "traceability"."finca_recolector" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "finca_site_id" UUID NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "finca_recolector_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finca_recolector_hasta_despues" CHECK ("hasta" IS NULL OR "hasta" > "desde")
);

CREATE TABLE "traceability"."jornada_de_cosecha" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "finca_site_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "traceability"."EstadoDeJornada" NOT NULL DEFAULT 'abierta',
    "nota" TEXT,
    "cerrada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "jornada_de_cosecha_pkey" PRIMARY KEY ("id"),
    -- Cerrada lleva cuándo; abierta, no.
    CONSTRAINT "jornada_de_cosecha_cierre_completo" CHECK (("estado" = 'cerrada') = ("cerrada_at" IS NOT NULL))
);

CREATE TABLE "traceability"."asignacion_de_jornada" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jornada_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    CONSTRAINT "asignacion_de_jornada_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "traceability"."entrega_de_cosecha" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jornada_id" UUID NOT NULL,
    "recolector_person_id" UUID NOT NULL,
    "location_id" UUID,
    "plot_block_id" UUID,
    "specimen_id" UUID,
    "peso_finca_kg" DECIMAL(10,3) NOT NULL,
    "enviada_at" TIMESTAMP(3) NOT NULL,
    "anotada_por" UUID NOT NULL,
    "estado" "traceability"."EstadoDeEntrega" NOT NULL DEFAULT 'enviada',
    "anulada_at" TIMESTAMP(3),
    "motivo_anulacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entrega_de_cosecha_pkey" PRIMARY KEY ("id"),
    -- Exactamente un origen: parcela o microparcela, bloque o planta.
    CONSTRAINT "entrega_de_cosecha_un_origen" CHECK (num_nonnulls("location_id", "plot_block_id", "specimen_id") = 1),
    CONSTRAINT "entrega_de_cosecha_peso_positivo" CHECK ("peso_finca_kg" > 0),
    -- Anulada lleva fecha y motivo no vacío; enviada no lleva ninguno de los dos. Los dos lados:
    -- una igualdad sola dejaba pasar una enviada con motivo y sin fecha (lo cazó su prueba).
    CONSTRAINT "entrega_de_cosecha_anulacion_completa" CHECK (
      ("estado" = 'anulada' AND "anulada_at" IS NOT NULL AND length(btrim(coalesce("motivo_anulacion", ''))) > 0)
      OR ("estado" = 'enviada' AND "anulada_at" IS NULL AND "motivo_anulacion" IS NULL)
    )
);

ALTER TABLE "core"."asset" ADD COLUMN "entrega_de_cosecha_id" UUID;
ALTER TABLE "traceability"."field_session" ADD COLUMN "jornada_de_cosecha_id" UUID;
ALTER TABLE "traceability"."field_event" ADD COLUMN "plot_block_id" UUID,
  ADD COLUMN "specimen_id" UUID,
  ADD COLUMN "condicion_del_dia_value_id" UUID;

CREATE INDEX "finca_recolector_finca_site_id_idx" ON "traceability"."finca_recolector"("finca_site_id");
CREATE INDEX "finca_recolector_person_id_idx" ON "traceability"."finca_recolector"("person_id");
CREATE INDEX "jornada_de_cosecha_finca_site_id_fecha_idx" ON "traceability"."jornada_de_cosecha"("finca_site_id", "fecha");
CREATE UNIQUE INDEX "asignacion_de_jornada_jornada_id_location_id_person_id_key" ON "traceability"."asignacion_de_jornada"("jornada_id", "location_id", "person_id");
CREATE INDEX "asignacion_de_jornada_person_id_idx" ON "traceability"."asignacion_de_jornada"("person_id");
CREATE INDEX "entrega_de_cosecha_jornada_id_idx" ON "traceability"."entrega_de_cosecha"("jornada_id");
CREATE INDEX "entrega_de_cosecha_recolector_person_id_idx" ON "traceability"."entrega_de_cosecha"("recolector_person_id");

ALTER TABLE "traceability"."finca_recolector" ADD CONSTRAINT "finca_recolector_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."finca_recolector" ADD CONSTRAINT "finca_recolector_finca_site_id_fkey" FOREIGN KEY ("finca_site_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."jornada_de_cosecha" ADD CONSTRAINT "jornada_de_cosecha_finca_site_id_fkey" FOREIGN KEY ("finca_site_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."asignacion_de_jornada" ADD CONSTRAINT "asignacion_de_jornada_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "traceability"."jornada_de_cosecha"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "traceability"."asignacion_de_jornada" ADD CONSTRAINT "asignacion_de_jornada_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."asignacion_de_jornada" ADD CONSTRAINT "asignacion_de_jornada_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."entrega_de_cosecha" ADD CONSTRAINT "entrega_de_cosecha_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "traceability"."jornada_de_cosecha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."entrega_de_cosecha" ADD CONSTRAINT "entrega_de_cosecha_recolector_person_id_fkey" FOREIGN KEY ("recolector_person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."entrega_de_cosecha" ADD CONSTRAINT "entrega_de_cosecha_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."entrega_de_cosecha" ADD CONSTRAINT "entrega_de_cosecha_plot_block_id_fkey" FOREIGN KEY ("plot_block_id") REFERENCES "traceability"."plot_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."entrega_de_cosecha" ADD CONSTRAINT "entrega_de_cosecha_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "traceability"."specimen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_entrega_de_cosecha_id_fkey" FOREIGN KEY ("entrega_de_cosecha_id") REFERENCES "traceability"."entrega_de_cosecha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."field_session" ADD CONSTRAINT "field_session_jornada_de_cosecha_id_fkey" FOREIGN KEY ("jornada_de_cosecha_id") REFERENCES "traceability"."jornada_de_cosecha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."field_event" ADD CONSTRAINT "field_event_plot_block_id_fkey" FOREIGN KEY ("plot_block_id") REFERENCES "traceability"."plot_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."field_event" ADD CONSTRAINT "field_event_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "traceability"."specimen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."field_event" ADD CONSTRAINT "field_event_condicion_del_dia_value_id_fkey" FOREIGN KEY ("condicion_del_dia_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
