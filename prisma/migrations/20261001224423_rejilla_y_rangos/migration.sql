-- CreateEnum
CREATE TYPE "core"."GridOrigin" AS ENUM ('noroeste', 'noreste', 'suroeste', 'sureste');

-- AlterTable
ALTER TABLE "core"."location" ADD COLUMN     "grid_origin" "core"."GridOrigin",
ADD COLUMN     "plants_per_row" INTEGER,
ADD COLUMN     "range_plant_from" INTEGER,
ADD COLUMN     "range_plant_to" INTEGER,
ADD COLUMN     "range_row_from" INTEGER,
ADD COLUMN     "range_row_to" INTEGER,
ADD COLUMN     "row_count" INTEGER,
ADD COLUMN     "row_spacing_meters" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "traceability"."plot_block_range" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plot_block_id" UUID NOT NULL,
    "row_from" INTEGER NOT NULL,
    "row_to" INTEGER NOT NULL,
    "plant_from" INTEGER NOT NULL,
    "plant_to" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "plot_block_range_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plot_block_range_plot_block_id_idx" ON "traceability"."plot_block_range"("plot_block_id");

-- AddForeignKey
ALTER TABLE "traceability"."plot_block_range" ADD CONSTRAINT "plot_block_range_plot_block_id_fkey" FOREIGN KEY ("plot_block_id") REFERENCES "traceability"."plot_block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."plot_block_range" ADD CONSTRAINT "plot_block_range_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- D3: media rejilla no es una rejilla, y medio rango tampoco. Un CHECK y no
-- una comprobación de servicio: un importador, una reparación operativa o SQL
-- directo se saltan cualquier regla que viva sólo en TypeScript.
-- ---------------------------------------------------------------------------
ALTER TABLE "core"."location" ADD CONSTRAINT "location_rejilla_completa"
  CHECK (num_nonnulls("grid_origin", "row_count", "plants_per_row", "row_spacing_meters") IN (0, 4));

ALTER TABLE "core"."location" ADD CONSTRAINT "location_rejilla_positiva"
  CHECK ("row_count" IS NULL OR ("row_count" >= 1 AND "plants_per_row" >= 1));

ALTER TABLE "core"."location" ADD CONSTRAINT "location_rango_completo"
  CHECK (num_nonnulls("range_row_from", "range_row_to", "range_plant_from", "range_plant_to") IN (0, 4));

ALTER TABLE "core"."location" ADD CONSTRAINT "location_rango_no_invertido"
  CHECK ("range_row_from" IS NULL
         OR ("range_row_from" >= 1 AND "range_plant_from" >= 1
             AND "range_row_from" <= "range_row_to" AND "range_plant_from" <= "range_plant_to"));

ALTER TABLE "traceability"."plot_block_range" ADD CONSTRAINT "plot_block_range_es_celda"
  CHECK ("row_from" >= 1 AND "plant_from" >= 1
         AND "row_from" <= "row_to" AND "plant_from" <= "plant_to");

-- ---------------------------------------------------------------------------
-- D3: un rango dice el sitio dentro de la rejilla de SU PADRE. Vigila la fila
-- que declara el rango, que es la microparcela.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "core"."exigir_rango_en_la_rejilla"()
RETURNS TRIGGER AS $$
DECLARE
  p RECORD;
BEGIN
  IF NEW."range_row_from" IS NULL THEN RETURN NEW; END IF;
  IF NEW."parent_location_id" IS NULL THEN
    RAISE EXCEPTION 'Un rango dice el sitio dentro de otra parcela, y esta ubicacion no tiene padre';
  END IF;
  SELECT "row_count", "plants_per_row" INTO p
    FROM "core"."location" WHERE "id" = NEW."parent_location_id";
  IF p."row_count" IS NULL THEN
    RAISE EXCEPTION 'La parcela madre no tiene rejilla: sin rejilla no hay rango que le quepa';
  END IF;
  IF NEW."range_row_to" > p."row_count" OR NEW."range_plant_to" > p."plants_per_row" THEN
    RAISE EXCEPTION 'El rango no cabe en la rejilla de la parcela (% hileras x % plantas)',
      p."row_count", p."plants_per_row";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "location_exigir_rango_en_la_rejilla"
  BEFORE INSERT OR UPDATE OF "range_row_from", "range_row_to", "range_plant_from", "range_plant_to", "parent_location_id"
  ON "core"."location" FOR EACH ROW
  EXECUTE FUNCTION "core"."exigir_rango_en_la_rejilla"();

-- ---------------------------------------------------------------------------
-- D4: crecer es libre; ENCOGER solo si nada queda fuera. Recorre las tres cosas
-- que pueden quedar huerfanas, y LAS PLANTAS CUENTAN: un specimen que apunta a
-- una celda que ya no existe es una fila real con historia, y dejarlo asi es
-- peor que negar el encogimiento.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "core"."exigir_rejilla_sin_huerfanos"()
RETURNS TRIGGER AS $$
DECLARE
  culpable TEXT;
BEGIN
  IF NEW."row_count" IS NOT NULL AND OLD."row_count" IS NOT NULL
     AND NEW."row_count" >= OLD."row_count"
     AND NEW."plants_per_row" >= OLD."plants_per_row" THEN
    RETURN NEW;
  END IF;
  IF NEW."row_count" IS NULL AND OLD."row_count" IS NULL THEN RETURN NEW; END IF;

  SELECT 'la microparcela ' || h."name" INTO culpable
    FROM "core"."location" h
   WHERE h."parent_location_id" = NEW."id" AND h."range_row_from" IS NOT NULL
     AND (NEW."row_count" IS NULL
          OR h."range_row_to" > NEW."row_count"
          OR h."range_plant_to" > NEW."plants_per_row")
   LIMIT 1;
  IF culpable IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede encoger la rejilla: % queda fuera', culpable;
  END IF;

  SELECT 'el bloque ' || b."name" INTO culpable
    FROM "traceability"."plot_block_range" r
    JOIN "traceability"."plot_block" b ON b."id" = r."plot_block_id"
    LEFT JOIN "core"."location" l ON l."id" = b."location_id"
   WHERE (b."location_id" = NEW."id" OR l."parent_location_id" = NEW."id")
     AND (NEW."row_count" IS NULL
          OR r."row_to" > NEW."row_count"
          OR r."plant_to" > NEW."plants_per_row")
   LIMIT 1;
  IF culpable IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede encoger la rejilla: % queda fuera', culpable;
  END IF;

  SELECT 'una planta en la hilera ' || s."grid_row" || ', planta ' || s."grid_position"
    INTO culpable
    FROM "traceability"."specimen" s
    LEFT JOIN "core"."location" l ON l."id" = s."location_id"
   WHERE (s."location_id" = NEW."id" OR l."parent_location_id" = NEW."id")
     AND s."grid_row" IS NOT NULL AND s."grid_position" IS NOT NULL
     AND (NEW."row_count" IS NULL
          OR s."grid_row" > NEW."row_count"
          OR s."grid_position" > NEW."plants_per_row")
   LIMIT 1;
  IF culpable IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede encoger la rejilla: % queda fuera', culpable;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "location_exigir_rejilla_sin_huerfanos"
  BEFORE UPDATE OF "row_count", "plants_per_row" ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_rejilla_sin_huerfanos"();

-- ---------------------------------------------------------------------------
-- D7: dos bloques de TRAMPA no se solapan entre si. Uno `experimental` puede
-- solaparse con cualquiera, y uno SIN TIPO no bloquea a nadie: «desconocido» no
-- es «no es de trampa» (ADR-080). El solape se compara con int4range y `&&`,
-- igual que 20260921100000_bandejas_de_la_corrida lo hace con tsrange.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "traceability"."exigir_trampas_sin_solape"()
RETURNS TRIGGER AS $$
DECLARE
  mi_tipo "traceability"."PlotBlockType";
  mi_parcela UUID;
  otro TEXT;
BEGIN
  SELECT b."block_type", b."location_id" INTO mi_tipo, mi_parcela
    FROM "traceability"."plot_block" b WHERE b."id" = NEW."plot_block_id";
  IF mi_tipo IS DISTINCT FROM 'trampa' THEN RETURN NEW; END IF;

  SELECT b2."name" INTO otro
    FROM "traceability"."plot_block_range" r2
    JOIN "traceability"."plot_block" b2 ON b2."id" = r2."plot_block_id"
   WHERE b2."block_type" = 'trampa'
     AND b2."id" <> NEW."plot_block_id"
     AND b2."location_id" = mi_parcela
     AND int4range(r2."row_from", r2."row_to", '[]') && int4range(NEW."row_from", NEW."row_to", '[]')
     AND int4range(r2."plant_from", r2."plant_to", '[]') && int4range(NEW."plant_from", NEW."plant_to", '[]')
   LIMIT 1;
  IF otro IS NOT NULL THEN
    RAISE EXCEPTION 'Dos bloques de trampa no cubren las mismas celdas: se solapa con %', otro;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plot_block_range_exigir_trampas_sin_solape"
  BEFORE INSERT OR UPDATE ON "traceability"."plot_block_range"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_trampas_sin_solape"();
