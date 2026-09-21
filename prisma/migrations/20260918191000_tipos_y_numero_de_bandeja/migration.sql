-- Paso 2a (spec §4.2). El tipo de bandeja de la organización, y el tipo y el
-- número de cada bandeja. La bandeja sigue siendo un `equipment` de kind vessel.
CREATE TABLE "core"."drying_tray_type" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "width_cm" DECIMAL(6,1) NOT NULL,
  "length_cm" DECIMAL(6,1) NOT NULL,
  "entry_unit" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "drying_tray_type_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drying_tray_type_medidas_positivas" CHECK ("width_cm" > 0 AND "length_cm" > 0),
  CONSTRAINT "drying_tray_type_unidad" CHECK ("entry_unit" IN ('ft', 'cm'))
);
ALTER TABLE "core"."drying_tray_type"
  ADD CONSTRAINT "drying_tray_type_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_tray_type_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "drying_tray_type_nombre_unico" ON "core"."drying_tray_type"("organization_id", "name");

ALTER TABLE "core"."equipment"
  ADD COLUMN "tray_type_id" UUID,
  ADD COLUMN "tray_number" INTEGER,
  ADD CONSTRAINT "equipment_tray_type_id_fkey" FOREIGN KEY ("tray_type_id")
    REFERENCES "core"."drying_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "equipment_bandeja_solo_recipiente" CHECK ("tray_type_id" IS NULL OR "kind" = 'vessel'),
  ADD CONSTRAINT "equipment_bandeja_tipo_y_numero" CHECK (("tray_type_id" IS NULL) = ("tray_number" IS NULL)),
  ADD CONSTRAINT "equipment_tray_number_positivo" CHECK ("tray_number" IS NULL OR "tray_number" > 0);

-- El número no se repite en la finca (= la organización). Cierra la carrera de
-- dos tandas a la vez, además del bloqueo del servicio.
CREATE UNIQUE INDEX "equipment_numero_de_bandeja_unico"
  ON "core"."equipment"("organization_id", "tray_number") WHERE "tray_number" IS NOT NULL;

-- El tipo es de la misma organización que la bandeja: otra tabla, disparador.
CREATE OR REPLACE FUNCTION "core"."exigir_tipo_de_bandeja_propio"()
RETURNS TRIGGER AS $$
DECLARE org UUID;
BEGIN
  IF NEW."tray_type_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "organization_id" INTO org FROM "core"."drying_tray_type" WHERE "id" = NEW."tray_type_id";
  IF org IS DISTINCT FROM NEW."organization_id" THEN
    RAISE EXCEPTION 'El tipo de bandeja es de otra organizacion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "equipment_tipo_de_bandeja_propio"
  BEFORE INSERT OR UPDATE OF "tray_type_id", "organization_id" ON "core"."equipment"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_tipo_de_bandeja_propio"();

-- Del lado del TIPO (revisión de Codex del plan 2a): un tipo con bandejas no
-- cambia de organización. Sin esto, mover el tipo dejaba sus bandejas «de otra
-- organización» sin disparar la comprobación de arriba. (Los pesajes, que llegan
-- en la Tarea 4, amplían esta función con su propia condición.)
CREATE OR REPLACE FUNCTION "core"."exigir_tipo_de_bandeja_quieto"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
     AND EXISTS (SELECT 1 FROM "core"."equipment" WHERE "tray_type_id" = NEW."id") THEN
    RAISE EXCEPTION 'Un tipo de bandeja con bandejas no cambia de organizacion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_tray_type_quieto"
  BEFORE UPDATE OF "organization_id" ON "core"."drying_tray_type"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_tipo_de_bandeja_quieto"();
