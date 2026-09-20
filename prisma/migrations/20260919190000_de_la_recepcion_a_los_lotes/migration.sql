-- Spec docs/superpowers/specs/2026-09-19-de-la-recepcion-a-los-lotes-design.md.
-- Plan docs/superpowers/plans/2026-09-19-de-la-recepcion-a-los-lotes.md, Tarea 1.
--
-- El vínculo entre un lote y las recepciones de las que sale, la merma de una recepción, el
-- veredicto de la calidad pedida, y la condición de pesaje de una selección. Lo generado por
-- `prisma migrate diff` va primero; las reglas que Prisma no expresa, al final.

-- CreateEnum
CREATE TYPE "traceability"."CondicionDePesaje" AS ENUM ('DRAINED', 'WET', 'DRY');

-- CreateEnum
CREATE TYPE "traceability"."EstadoDeMerma" AS ENUM ('vigente', 'anulada');

-- CreateEnum
CREATE TYPE "traceability"."JuicioDeCalidad" AS ENUM ('CUMPLE', 'NO_CUMPLE', 'NO_ATRIBUIBLE', 'BALANCE_DESCUADRADO', 'INCOMPARABLE_WEIGHING_CONDITION', 'CONDICION_SIN_DECLARAR');

-- AlterTable
ALTER TABLE "traceability"."lot_transformation" ADD COLUMN     "condicion_de_pesaje" "traceability"."CondicionDePesaje";

-- CreateTable
CREATE TABLE "traceability"."lote_desde_recepcion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_id" UUID NOT NULL,
    "recepcion_id" UUID NOT NULL,
    "kg" DECIMAL(10,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "lote_desde_recepcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."merma_de_recepcion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recepcion_id" UUID NOT NULL,
    "kg" DECIMAL(10,3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" "traceability"."EstadoDeMerma" NOT NULL DEFAULT 'vigente',
    "anotada_por" UUID NOT NULL,
    "anotada_at" TIMESTAMP(3) NOT NULL,
    "anulada_at" TIMESTAMP(3),
    "anulada_por" UUID,
    "motivo_anulacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merma_de_recepcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."veredicto_de_calidad_de_pedido" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_id" UUID NOT NULL,
    "pedido_id" UUID,
    "selecciones" INTEGER NOT NULL,
    "insumo_kg" DECIMAL(10,3) NOT NULL,
    "aceptado_kg" DECIMAL(10,3) NOT NULL,
    "verde_kg" DECIMAL(10,3) NOT NULL,
    "flotes_kg" DECIMAL(10,3) NOT NULL,
    "juicio" "traceability"."JuicioDeCalidad" NOT NULL,
    "motivo" TEXT,
    "actualizado_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "veredicto_de_calidad_de_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lote_desde_recepcion_recepcion_id_idx" ON "traceability"."lote_desde_recepcion"("recepcion_id");

-- CreateIndex
CREATE UNIQUE INDEX "lote_desde_recepcion_lot_id_recepcion_id_key" ON "traceability"."lote_desde_recepcion"("lot_id", "recepcion_id");

-- CreateIndex
CREATE INDEX "merma_de_recepcion_recepcion_id_idx" ON "traceability"."merma_de_recepcion"("recepcion_id");

-- CreateIndex
CREATE UNIQUE INDEX "veredicto_de_calidad_de_pedido_lot_id_key" ON "traceability"."veredicto_de_calidad_de_pedido"("lot_id");

-- CreateIndex
CREATE INDEX "veredicto_de_calidad_de_pedido_pedido_id_idx" ON "traceability"."veredicto_de_calidad_de_pedido"("pedido_id");

-- AddForeignKey
ALTER TABLE "traceability"."lote_desde_recepcion" ADD CONSTRAINT "lote_desde_recepcion_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lote_desde_recepcion" ADD CONSTRAINT "lote_desde_recepcion_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "traceability"."recepcion_de_cereza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."merma_de_recepcion" ADD CONSTRAINT "merma_de_recepcion_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "traceability"."recepcion_de_cereza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."veredicto_de_calidad_de_pedido" ADD CONSTRAINT "veredicto_de_calidad_de_pedido_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."veredicto_de_calidad_de_pedido" ADD CONSTRAINT "veredicto_de_calidad_de_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "traceability"."pedido_de_cereza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Reglas en la base ──────────────────────────────────────────────────────────────────────

ALTER TABLE "traceability"."lote_desde_recepcion" ADD CONSTRAINT "lote_desde_recepcion_kg_positivo"
  CHECK ("kg" > 0);

ALTER TABLE "traceability"."merma_de_recepcion" ADD CONSTRAINT "merma_de_recepcion_kg_positivo"
  CHECK ("kg" > 0);

ALTER TABLE "traceability"."merma_de_recepcion" ADD CONSTRAINT "merma_de_recepcion_motivo"
  CHECK (length(btrim("motivo")) > 0);

ALTER TABLE "traceability"."merma_de_recepcion" ADD CONSTRAINT "merma_de_recepcion_anulacion_completa"
  CHECK (("estado" = 'anulada') = ("anulada_at" IS NOT NULL AND "anulada_por" IS NOT NULL
         AND length(btrim(coalesce("motivo_anulacion", ''))) > 0));

ALTER TABLE "traceability"."veredicto_de_calidad_de_pedido" ADD CONSTRAINT "veredicto_cifras"
  CHECK ("insumo_kg" > 0 AND "aceptado_kg" >= 0 AND "verde_kg" >= 0 AND "flotes_kg" >= 0 AND "selecciones" > 0);

-- Un juicio que no es CUMPLE ni NO_CUMPLE tiene que decir por qué no se juzgó.
ALTER TABLE "traceability"."veredicto_de_calidad_de_pedido" ADD CONSTRAINT "veredicto_motivo_si_no_cumple"
  CHECK ("juicio" IN ('CUMPLE', 'NO_CUMPLE') OR length(btrim(coalesce("motivo", ''))) > 0);

-- ─── Disparadores ───────────────────────────────────────────────────────────────────────────

-- 1. Los kilos que un lote toma de una recepción caben en lo que queda.
--
-- **Bloquea la fila de la recepción ÉL MISMO antes de sumar.** Una suma sin bloqueo no es una
-- garantía: dos inserciones simultáneas por cualquier vía no verían la de la otra y las dos
-- pasarían (revisión de Codex del spec, hallazgo 1).
CREATE OR REPLACE FUNCTION "traceability"."lote_desde_recepcion_cabe"()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
  tomado NUMERIC;
  mermado NUMERIC;
BEGIN
  SELECT "neto_kg", "estado" INTO r FROM "traceability"."recepcion_de_cereza"
    WHERE "id" = NEW."recepcion_id" FOR UPDATE;
  IF r."estado" <> 'recibida' THEN
    RAISE EXCEPTION 'lote_desde_recepcion_recepcion_no_recibida: la recepción % está %', NEW."recepcion_id", r."estado";
  END IF;
  SELECT coalesce(sum("kg"), 0) INTO tomado FROM "traceability"."lote_desde_recepcion"
    WHERE "recepcion_id" = NEW."recepcion_id";
  SELECT coalesce(sum("kg"), 0) INTO mermado FROM "traceability"."merma_de_recepcion"
    WHERE "recepcion_id" = NEW."recepcion_id" AND "estado" = 'vigente';
  IF NEW."kg" + tomado > r."neto_kg" - mermado THEN
    RAISE EXCEPTION 'lote_desde_recepcion_kg_sobre_lo_recibido: quedan % kg de la recepción %',
      r."neto_kg" - mermado - tomado, NEW."recepcion_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "lote_desde_recepcion_cabe"
  BEFORE INSERT ON "traceability"."lote_desde_recepcion"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."lote_desde_recepcion_cabe"();

-- 2. El origen de un lote no se reescribe ni se borra. Bajar los kilos devolvería cereza que ya
--    está en un lote y en todo lo que salió de él; borrar la fila borraría la evidencia que impide
--    anular la recepción (revisión de Codex del spec, hallazgo 2).
CREATE OR REPLACE FUNCTION "traceability"."lote_desde_recepcion_inmutable"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'lote_desde_recepcion_inmutable: el origen de un lote no se edita ni se borra; corrígelo con una transformación';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "lote_desde_recepcion_inmutable"
  BEFORE UPDATE OR DELETE ON "traceability"."lote_desde_recepcion"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."lote_desde_recepcion_inmutable"();

-- 3. Una merma no puede dejar el disponible negativo. Mismo bloqueo, misma razón.
CREATE OR REPLACE FUNCTION "traceability"."merma_de_recepcion_cabe"()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
  tomado NUMERIC;
  mermado NUMERIC;
BEGIN
  SELECT "neto_kg", "estado" INTO r FROM "traceability"."recepcion_de_cereza"
    WHERE "id" = NEW."recepcion_id" FOR UPDATE;
  IF r."estado" <> 'recibida' THEN
    RAISE EXCEPTION 'merma_de_recepcion_recepcion_no_recibida: la recepción % está %', NEW."recepcion_id", r."estado";
  END IF;
  SELECT coalesce(sum("kg"), 0) INTO tomado FROM "traceability"."lote_desde_recepcion"
    WHERE "recepcion_id" = NEW."recepcion_id";
  SELECT coalesce(sum("kg"), 0) INTO mermado FROM "traceability"."merma_de_recepcion"
    WHERE "recepcion_id" = NEW."recepcion_id" AND "estado" = 'vigente' AND "id" <> NEW."id";
  IF NEW."estado" = 'vigente' AND NEW."kg" + tomado + mermado > r."neto_kg" THEN
    RAISE EXCEPTION 'merma_de_recepcion_sobre_lo_disponible: quedan % kg de la recepción %',
      r."neto_kg" - mermado - tomado, NEW."recepcion_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "merma_de_recepcion_cabe"
  BEFORE INSERT OR UPDATE ON "traceability"."merma_de_recepcion"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."merma_de_recepcion_cabe"();

-- 4. Una recepción con cereza ya tomada por un lote no se anula. Es la regla que la pieza 2 dejó
--    anotada como pendiente, porque el vínculo no existía todavía.
CREATE OR REPLACE FUNCTION "traceability"."recepcion_de_cereza_con_lotes_no_se_anula"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."estado" = 'anulada' AND OLD."estado" <> 'anulada' AND EXISTS (
    SELECT 1 FROM "traceability"."lote_desde_recepcion" WHERE "recepcion_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'recepcion_de_cereza_ya_tiene_lotes: de la recepción % ya salió cereza a un lote', NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "recepcion_de_cereza_con_lotes_no_se_anula"
  BEFORE UPDATE ON "traceability"."recepcion_de_cereza"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."recepcion_de_cereza_con_lotes_no_se_anula"();
