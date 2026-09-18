-- CreateEnum
CREATE TYPE "core"."EquipmentContactMaterial" AS ENUM ('acero_inoxidable', 'plastico_alimentario', 'madera', 'vidrio_o_ceramica', 'otro');

-- CreateEnum
CREATE TYPE "core"."CareRoutineKind" AS ENUM ('mantenimiento', 'limpieza', 'fumigacion', 'otra');

-- AlterTable
ALTER TABLE "core"."asset" ADD COLUMN     "equipment_id" UUID,
ADD COLUMN     "equipment_model_id" UUID;

-- AlterTable
ALTER TABLE "core"."equipment" ADD COLUMN     "internal_code" TEXT,
ADD COLUMN     "model_id" UUID,
ADD COLUMN     "serial_number" TEXT,
ADD COLUMN     "supplier_organization_id" UUID,
ADD COLUMN     "warranty_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "core"."equipment_model" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "kind" "core"."EquipmentKind" NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "recommended_maintenance_days" INTEGER,
    "capacity_value" DECIMAL(12,3),
    "capacity_unit" TEXT,
    "contact_material" "core"."EquipmentContactMaterial",
    "contact_material_note" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "notes" TEXT,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "equipment_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."equipment_model_spec" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "model_id" UUID NOT NULL,
    "quantity" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "range_min" DECIMAL(12,4),
    "range_max" DECIMAL(12,4),
    "resolution" DECIMAL(12,4),
    "accuracy_abs" DECIMAL(12,4),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "equipment_model_spec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."care_routine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipment_id" UUID,
    "location_id" UUID,
    "kind" "core"."CareRoutineKind" NOT NULL,
    "kind_note" TEXT,
    "interval_days" INTEGER NOT NULL,
    "instructions" TEXT,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "care_routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."care_routine_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "routine_id" UUID NOT NULL,
    "performed_on" TIMESTAMP(3) NOT NULL,
    "performed_by_person_id" UUID,
    "note" TEXT,
    "provenance_class" "core"."ProvenanceClass" NOT NULL,
    "source_reference" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "care_routine_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_model_organization_id_idx" ON "core"."equipment_model"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_model_id_kind_key" ON "core"."equipment_model"("id", "kind");

-- CreateIndex
CREATE INDEX "equipment_model_spec_model_id_idx" ON "core"."equipment_model_spec"("model_id");

-- CreateIndex
CREATE INDEX "care_routine_equipment_id_idx" ON "core"."care_routine"("equipment_id");

-- CreateIndex
CREATE INDEX "care_routine_location_id_idx" ON "core"."care_routine"("location_id");

-- CreateIndex
CREATE INDEX "care_routine_event_routine_id_idx" ON "core"."care_routine_event"("routine_id");

-- CreateIndex
CREATE INDEX "asset_equipment_id_idx" ON "core"."asset"("equipment_id");

-- CreateIndex
CREATE INDEX "asset_equipment_model_id_idx" ON "core"."asset"("equipment_model_id");

-- CreateIndex
CREATE INDEX "equipment_model_id_idx" ON "core"."equipment"("model_id");

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "core"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_equipment_model_id_fkey" FOREIGN KEY ("equipment_model_id") REFERENCES "core"."equipment_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_model" ADD CONSTRAINT "equipment_model_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment_model_spec" ADD CONSTRAINT "equipment_model_spec_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "core"."equipment_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."care_routine" ADD CONSTRAINT "care_routine_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "core"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."care_routine" ADD CONSTRAINT "care_routine_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."care_routine_event" ADD CONSTRAINT "care_routine_event_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "core"."care_routine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."care_routine_event" ADD CONSTRAINT "care_routine_event_performed_by_person_id_fkey" FOREIGN KEY ("performed_by_person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment" ADD CONSTRAINT "equipment_model_id_kind_fkey" FOREIGN KEY ("model_id", "kind") REFERENCES "core"."equipment_model"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."equipment" ADD CONSTRAINT "equipment_supplier_organization_id_fkey" FOREIGN KEY ("supplier_organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Catálogo: unicidad sin mayúsculas ni espacios, compartido con clave propia ──
-- `coalesce` con el uuid nulo hace que dos compartidas choquen entre sí y no con
-- una propia del mismo nombre (spec §2.4).
CREATE UNIQUE INDEX "equipment_model_dueno_nombre_normalizado_key"
  ON "core"."equipment_model" (
    coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim("manufacturer")),
    lower(btrim("model_name"))
  );

ALTER TABLE "core"."equipment_model"
  ADD CONSTRAINT "equipment_model_mantenimiento_positivo" CHECK ("recommended_maintenance_days" IS NULL OR "recommended_maintenance_days" > 0),
  ADD CONSTRAINT "equipment_model_capacidad_positiva" CHECK ("capacity_value" IS NULL OR "capacity_value" > 0),
  ADD CONSTRAINT "equipment_model_capacidad_con_unidad" CHECK (("capacity_value" IS NULL) = ("capacity_unit" IS NULL)),
  ADD CONSTRAINT "equipment_model_otro_con_nota" CHECK ("contact_material" IS DISTINCT FROM 'otro' OR "contact_material_note" IS NOT NULL),
  ADD CONSTRAINT "equipment_model_capacidad_y_material_solo_en_vaso_o_maquina" CHECK (
    "kind" IN ('vessel', 'machine') OR ("capacity_value" IS NULL AND "contact_material" IS NULL)
  );

ALTER TABLE "core"."equipment_model_spec"
  ADD CONSTRAINT "equipment_model_spec_rango_ordenado" CHECK ("range_min" IS NULL OR "range_max" IS NULL OR "range_min" <= "range_max"),
  ADD CONSTRAINT "equipment_model_spec_resolucion_positiva" CHECK ("resolution" IS NULL OR "resolution" > 0),
  ADD CONSTRAINT "equipment_model_spec_precision_no_negativa" CHECK ("accuracy_abs" IS NULL OR "accuracy_abs" >= 0);

-- ── Equipo: código interno único por organización ──
CREATE UNIQUE INDEX "equipment_org_codigo_interno_key"
  ON "core"."equipment" ("organization_id", lower(btrim("internal_code")))
  WHERE "internal_code" IS NOT NULL;

-- ── Equipo: un modelo propio de OTRA organización no se puede elegir ──
-- En la base y no sólo en el servicio: un importador o SQL directo no pasan
-- por TypeScript.
CREATE FUNCTION "core"."equipment_modelo_visible"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  dueno uuid;
BEGIN
  IF NEW."model_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "organization_id" INTO dueno FROM "core"."equipment_model" WHERE "id" = NEW."model_id";
  IF dueno IS NOT NULL AND dueno <> NEW."organization_id" THEN
    RAISE EXCEPTION 'modelo_de_otra_organizacion' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "equipment_modelo_visible"
  BEFORE INSERT OR UPDATE OF "model_id", "organization_id" ON "core"."equipment"
  FOR EACH ROW EXECUTE FUNCTION "core"."equipment_modelo_visible"();

-- ── Rutinas ──
ALTER TABLE "core"."care_routine"
  ADD CONSTRAINT "care_routine_una_cosa" CHECK (("equipment_id" IS NULL) <> ("location_id" IS NULL)),
  ADD CONSTRAINT "care_routine_intervalo_positivo" CHECK ("interval_days" > 0),
  ADD CONSTRAINT "care_routine_otra_con_nota" CHECK ("kind" <> 'otra' OR "kind_note" IS NOT NULL);

-- Una rutina ACTIVA por (cosa, tipo). Con `otra`, la nota normalizada entra en la clave.
CREATE UNIQUE INDEX "care_routine_equipo_tipo_activa_key"
  ON "core"."care_routine" ("equipment_id", "kind", lower(btrim(coalesce("kind_note", ''))))
  WHERE "retired_at" IS NULL AND "equipment_id" IS NOT NULL;
CREATE UNIQUE INDEX "care_routine_sitio_tipo_activa_key"
  ON "core"."care_routine" ("location_id", "kind", lower(btrim(coalesce("kind_note", ''))))
  WHERE "retired_at" IS NULL AND "location_id" IS NOT NULL;

ALTER TABLE "core"."care_routine_event"
  ADD CONSTRAINT "care_routine_event_anulado_con_motivo" CHECK ("voided_at" IS NULL OR "void_reason" IS NOT NULL);
