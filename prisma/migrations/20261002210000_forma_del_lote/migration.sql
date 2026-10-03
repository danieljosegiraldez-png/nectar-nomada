-- La forma REAL de lo plantado, como unión de rectángulos (D9, 2026-10-02).
--
-- **Por qué el tablero no basta.** El diseño del 2026-10-01 daba por supuesto que un
-- lote es un rectángulo perfecto, y sobre ese supuesto la pantalla afirmaba
-- «caben 200 y hay 150: una diferencia de 50» en un lote al que le falta una esquina,
-- donde la diferencia real es 20. Daniel lo corrigió el mismo día en que ese diseño
-- acabó de fusionarse: «a veces no es rectangular o cuadrado el lote, a veces puede
-- variar unas columnas o filas».
--
-- **Cero filas significa forma SIN DECLARAR**, que no es un lote vacío (ADR-080).
-- Varias filas: su unión es lo plantado. Los trozos **pueden pisarse entre sí** a
-- propósito: la cuenta de celdas es una unión por compresión de coordenadas, así que
-- no cuenta dos veces lo compartido, y prohibirlo obligaría a partir la forma a mano
-- en rectángulos disjuntos — trabajo de campo inventado.
--
-- Misma estructura que `plot_block_range` a propósito: dos conductas parecidas no
-- deben contarse de dos maneras, y así la unión reusa `celdasEnComunConVarios`.
CREATE TABLE "traceability"."plot_shape_range" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "row_from" INTEGER NOT NULL,
    "row_to" INTEGER NOT NULL,
    "plant_from" INTEGER NOT NULL,
    "plant_to" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "plot_shape_range_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plot_shape_range_location_id_idx" ON "traceability"."plot_shape_range"("location_id");

ALTER TABLE "traceability"."plot_shape_range" ADD CONSTRAINT "plot_shape_range_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "traceability"."plot_shape_range" ADD CONSTRAINT "plot_shape_range_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las celdas se cuentan en enteros desde 1, y un rango no va al revés. Las mismas
-- dos reglas que `location_rango_no_invertido` ya impone al rango de una
-- microparcela: aquí se repiten porque es otra tabla, no porque sean otras reglas.
ALTER TABLE "traceability"."plot_shape_range" ADD CONSTRAINT "plot_shape_range_desde_uno"
  CHECK ("row_from" >= 1 AND "plant_from" >= 1);

ALTER TABLE "traceability"."plot_shape_range" ADD CONSTRAINT "plot_shape_range_no_invertido"
  CHECK ("row_from" <= "row_to" AND "plant_from" <= "plant_to");

-- ---------------------------------------------------------------------------
-- Que el trozo quepa en el tablero.
--
-- Mismo patrón que `exigir_rango_de_bloque_en_la_rejilla`, y por la misma razón que
-- dice `CLAUDE.md`: una restricción que vive en TypeScript no existe para la base —
-- un importador, una reparación operativa o SQL directo se la saltan.
--
-- **No puede abortar esta migración:** es `BEFORE` y la tabla acaba de nacer vacía.
-- Se dice igual, para que nadie lo tenga que deducir al leerlo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "traceability"."exigir_forma_en_la_rejilla"()
RETURNS TRIGGER AS $$
DECLARE
  raiz UUID;
  p RECORD;
BEGIN
  raiz := "core"."raiz_de_la_numeracion"(NEW."location_id");
  IF raiz IS NULL THEN
    RAISE EXCEPTION 'Ese sitio no cuelga de ninguna parcela: no hay rejilla que contenga la forma';
  END IF;

  SELECT "row_count", "plants_per_row" INTO p FROM "core"."location" WHERE "id" = raiz;
  IF p."row_count" IS NULL THEN
    RAISE EXCEPTION 'La parcela no tiene rejilla: sin tablero no hay forma que declarar';
  END IF;

  IF NEW."row_to" > p."row_count" OR NEW."plant_to" > p."plants_per_row" THEN
    RAISE EXCEPTION 'El trozo de la forma no cabe en la rejilla de la parcela (% hileras x % plantas)',
      p."row_count", p."plants_per_row";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plot_shape_range_exigir_forma_en_la_rejilla"
  BEFORE INSERT OR UPDATE ON "traceability"."plot_shape_range"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_forma_en_la_rejilla"();
