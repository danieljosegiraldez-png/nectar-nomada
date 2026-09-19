-- Spec docs/superpowers/specs/2026-09-19-recepcion-de-cereza-en-beneficio-design.md.
-- Plan docs/superpowers/plans/2026-09-19-recepcion-de-cereza-en-beneficio.md, Tarea 1.
--
-- La recepción es el ORIGEN trazable de toda cereza que entra al beneficio, propia o de fuera.
-- Lo generado por `prisma migrate diff` va primero; las reglas que Prisma no expresa (CHECK,
-- índice parcial y disparadores) van al final, escritas a mano.

-- CreateEnum
CREATE TYPE "traceability"."EstadoDePedido" AS ENUM ('abierto', 'cerrado');

-- CreateEnum
CREATE TYPE "traceability"."EstadoDeRecepcion" AS ENUM ('recibida', 'rechazada', 'anulada');

-- CreateEnum
CREATE TYPE "traceability"."ComparacionDePesos" AS ENUM ('BALANCED', 'DISCREPANCY_FLAGGED', 'GROSS_IMBALANCE');

-- CreateEnum
CREATE TYPE "traceability"."VeredictoBrixDeRecepcion" AS ENUM ('INTAKE_OPTIMAL', 'INTAKE_UNDERRIPE', 'SIN_VEREDICTO', 'SENSOR_FAULT');

-- CreateEnum
CREATE TYPE "traceability"."PuntoDeMuestreoBrix" AS ENUM ('TANK_LIQUID_MID', 'TANK_LIQUID_SURFACE', 'MUCILAGE_PRESSED', 'CHERRY_PULP', 'PARCHMENT_BED');

-- AlterTable
ALTER TABLE "core"."asset" ADD COLUMN     "recepcion_de_cereza_id" UUID;

-- AlterTable
ALTER TABLE "traceability"."jornada_de_cosecha" ADD COLUMN     "beneficio_id" UUID;

-- CreateTable
CREATE TABLE "traceability"."pedido_de_cereza" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "beneficio_id" UUID NOT NULL,
    "finca_site_id" UUID,
    "proveedor_id" UUID,
    "fecha" DATE NOT NULL,
    "kg_pedidos" DECIMAL(10,3) NOT NULL,
    "margen_cantidad_pct" DECIMAL(5,2) NOT NULL,
    "min_maduro_pct" DECIMAL(5,2),
    "max_verde_pct" DECIMAL(5,2),
    "max_flotes_pct" DECIMAL(5,2),
    "estado" "traceability"."EstadoDePedido" NOT NULL DEFAULT 'abierto',
    "cerrado_at" TIMESTAMP(3),
    "nota_de_cierre" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "pedido_de_cereza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability"."recepcion_de_cereza" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clave_de_envio" TEXT NOT NULL,
    "beneficio_id" UUID NOT NULL,
    "entrega_id" UUID,
    "proveedor_id" UUID,
    "pedido_id" UUID,
    "recibida_por" UUID NOT NULL,
    "recibida_at" TIMESTAMP(3) NOT NULL,
    "bruto_kg" DECIMAL(10,3) NOT NULL,
    "recipientes" INTEGER NOT NULL,
    "tara_por_recipiente_kg" DECIMAL(10,3) NOT NULL,
    "neto_kg" DECIMAL(10,3) NOT NULL,
    "peso_declarado_kg" DECIMAL(10,3),
    "referencia_kg" DECIMAL(10,3),
    "diferencia_kg" DECIMAL(10,3),
    "tolerancia_kg" DECIMAL(10,3),
    "comparacion" "traceability"."ComparacionDePesos",
    "politica_de_balance" JSONB,
    "brix" DECIMAL(5,2),
    "punto_de_muestreo" "traceability"."PuntoDeMuestreoBrix",
    "instrumento_id" UUID,
    "veredicto_brix" "traceability"."VeredictoBrixDeRecepcion",
    "nota" TEXT,
    "estado" "traceability"."EstadoDeRecepcion" NOT NULL DEFAULT 'recibida',
    "motivo_rechazo" TEXT,
    "anulada_at" TIMESTAMP(3),
    "anulada_por" UUID,
    "motivo_anulacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recepcion_de_cereza_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedido_de_cereza_beneficio_id_estado_idx" ON "traceability"."pedido_de_cereza"("beneficio_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "recepcion_de_cereza_clave_de_envio_key" ON "traceability"."recepcion_de_cereza"("clave_de_envio");

-- CreateIndex
CREATE INDEX "recepcion_de_cereza_beneficio_id_recibida_at_idx" ON "traceability"."recepcion_de_cereza"("beneficio_id", "recibida_at");

-- CreateIndex
CREATE INDEX "recepcion_de_cereza_pedido_id_idx" ON "traceability"."recepcion_de_cereza"("pedido_id");

-- AddForeignKey
ALTER TABLE "core"."asset" ADD CONSTRAINT "asset_recepcion_de_cereza_id_fkey" FOREIGN KEY ("recepcion_de_cereza_id") REFERENCES "traceability"."recepcion_de_cereza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."jornada_de_cosecha" ADD CONSTRAINT "jornada_de_cosecha_beneficio_id_fkey" FOREIGN KEY ("beneficio_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."pedido_de_cereza" ADD CONSTRAINT "pedido_de_cereza_beneficio_id_fkey" FOREIGN KEY ("beneficio_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."pedido_de_cereza" ADD CONSTRAINT "pedido_de_cereza_finca_site_id_fkey" FOREIGN KEY ("finca_site_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."pedido_de_cereza" ADD CONSTRAINT "pedido_de_cereza_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_beneficio_id_fkey" FOREIGN KEY ("beneficio_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_entrega_id_fkey" FOREIGN KEY ("entrega_id") REFERENCES "traceability"."entrega_de_cosecha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "traceability"."pedido_de_cereza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Reglas en la base ──────────────────────────────────────────────────────────────────────

-- Un origen: una entrega de finca, o un proveedor de fuera. Nunca los dos ni ninguno.
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_un_origen"
  CHECK (num_nonnulls("entrega_id", "proveedor_id") = 1);

-- El neto se recalcula aquí: no se confía en quien lo manda.
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_pesos"
  CHECK ("bruto_kg" > 0 AND "recipientes" >= 0 AND "tara_por_recipiente_kg" >= 0
         AND "neto_kg" > 0 AND "neto_kg" = "bruto_kg" - "recipientes" * "tara_por_recipiente_kg");

-- El peso declarado sólo lo trae un productor de fuera.
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_declarado"
  CHECK ("peso_declarado_kg" IS NULL OR ("proveedor_id" IS NOT NULL AND "peso_declarado_kg" > 0));

-- La comparación de básculas va entera o no va: referencia, diferencia, tolerancia, estado y la
-- política con que se calculó.
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_comparacion_completa"
  CHECK (("referencia_kg" IS NULL) = ("comparacion" IS NULL)
         AND ("comparacion" IS NULL) = ("diferencia_kg" IS NULL)
         AND ("comparacion" IS NULL) = ("tolerancia_kg" IS NULL)
         AND ("comparacion" IS NULL) = ("politica_de_balance" IS NULL));

-- Fuera de tolerancia, quien recibe escribe una nota. Nunca bloquea: se guarda igual.
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_nota_si_discrepa"
  CHECK ("comparacion" IS NULL OR "comparacion" = 'BALANCED' OR length(btrim(coalesce("nota", ''))) > 0);

-- Un °Bx no significa nada sin decir de qué se midió (11_brix_kinetics.md §2).
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_brix_completo"
  CHECK (("brix" IS NULL) = ("punto_de_muestreo" IS NULL) AND ("brix" IS NULL) = ("veredicto_brix" IS NULL));

-- Rechazada lleva motivo, y sólo ella (una anulada conserva el de su rechazo, si lo tuvo).
ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_rechazo"
  CHECK ("estado" = 'anulada' OR ("estado" = 'rechazada') = (length(btrim(coalesce("motivo_rechazo", ''))) > 0));

ALTER TABLE "traceability"."recepcion_de_cereza" ADD CONSTRAINT "recepcion_de_cereza_anulacion_completa"
  CHECK (("estado" = 'anulada') = ("anulada_at" IS NOT NULL AND "anulada_por" IS NOT NULL
         AND length(btrim(coalesce("motivo_anulacion", ''))) > 0));

ALTER TABLE "traceability"."pedido_de_cereza" ADD CONSTRAINT "pedido_de_cereza_una_fuente"
  CHECK (num_nonnulls("finca_site_id", "proveedor_id") = 1);

ALTER TABLE "traceability"."pedido_de_cereza" ADD CONSTRAINT "pedido_de_cereza_cifras"
  CHECK ("kg_pedidos" > 0 AND "margen_cantidad_pct" >= 0
         AND ("min_maduro_pct" IS NULL OR "min_maduro_pct" BETWEEN 0 AND 100)
         AND ("max_verde_pct" IS NULL OR "max_verde_pct" BETWEEN 0 AND 100)
         AND ("max_flotes_pct" IS NULL OR "max_flotes_pct" BETWEEN 0 AND 100));

ALTER TABLE "traceability"."pedido_de_cereza" ADD CONSTRAINT "pedido_de_cereza_cierre"
  CHECK (("estado" = 'cerrado') = ("cerrado_at" IS NOT NULL));

-- Un productor de fuera se da de alta una vez: nombre único entre los `producer`, sin distinguir
-- mayúsculas ni espacios de los bordes. El servicio lo mira antes; esto es la red ante dos altas
-- simultáneas (revisión de Codex, hallazgo 4). Mismo patrón que los tres índices únicos de nombres
-- que ya hay (`lower(btrim(...))`), con su misma limitación, medida el 2026-09-19: con la colación
-- `C` de la base, `lower('Ñ')` no da 'ñ', así que «DOÑA» y «Doña» no chocan. ICU lo resolvería,
-- pero ninguna migración depende de ICU y no se añade esa dependencia por esto.
CREATE UNIQUE INDEX "organization_productor_nombre_unico" ON "core"."organization" (lower(btrim("name")))
  WHERE "organization_type" = 'producer';

-- Una entrega se recibe una vez; anulada la recepción, puede recibirse otra.
CREATE UNIQUE INDEX "recepcion_de_cereza_entrega_vigente" ON "traceability"."recepcion_de_cereza"("entrega_id")
  WHERE "entrega_id" IS NOT NULL AND "estado" <> 'anulada';

-- ─── Disparadores ───────────────────────────────────────────────────────────────────────────

-- 1. Dos personas, y la referencia es la del origen. Un CHECK no puede mirar la entrega.
CREATE OR REPLACE FUNCTION "traceability"."recepcion_de_cereza_dos_personas"()
RETURNS TRIGGER AS $$
DECLARE
  e RECORD;
BEGIN
  IF NEW."entrega_id" IS NOT NULL THEN
    SELECT "estado", "anotada_por", "recolector_person_id", "peso_finca_kg" INTO e
      FROM "traceability"."entrega_de_cosecha" WHERE "id" = NEW."entrega_id";
    IF TG_OP = 'INSERT' AND e."estado" <> 'enviada' THEN
      RAISE EXCEPTION 'recepcion_de_cereza_entrega_no_enviada: la entrega % no está enviada', NEW."entrega_id";
    END IF;
    IF NEW."referencia_kg" IS DISTINCT FROM e."peso_finca_kg" THEN
      RAISE EXCEPTION 'recepcion_de_cereza_referencia: la referencia tiene que ser el peso de finca de la entrega';
    END IF;
    IF NEW."recibida_por" = e."anotada_por"
       OR EXISTS (SELECT 1 FROM "core"."user_account" u WHERE u."id" = NEW."recibida_por" AND u."person_id" = e."recolector_person_id") THEN
      RAISE EXCEPTION 'recepcion_de_cereza_dos_personas: quien recibe no puede ser quien anotó la entrega ni su recolector';
    END IF;
    IF NEW."anulada_por" IS NOT NULL AND (NEW."anulada_por" = e."anotada_por"
       OR EXISTS (SELECT 1 FROM "core"."user_account" u WHERE u."id" = NEW."anulada_por" AND u."person_id" = e."recolector_person_id")) THEN
      RAISE EXCEPTION 'recepcion_de_cereza_dos_personas: quien anula no puede ser quien anotó la entrega ni su recolector';
    END IF;
  ELSIF NEW."referencia_kg" IS DISTINCT FROM NEW."peso_declarado_kg" THEN
    RAISE EXCEPTION 'recepcion_de_cereza_referencia: la referencia de la cereza de fuera es su peso declarado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "recepcion_de_cereza_dos_personas"
  BEFORE INSERT OR UPDATE ON "traceability"."recepcion_de_cereza"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."recepcion_de_cereza_dos_personas"();

-- 2. Inmutable: una recepción no se edita; sólo se anula.
CREATE OR REPLACE FUNCTION "traceability"."recepcion_de_cereza_inmutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW."clave_de_envio", NEW."beneficio_id", NEW."entrega_id", NEW."proveedor_id", NEW."pedido_id",
      NEW."recibida_por", NEW."recibida_at", NEW."bruto_kg", NEW."recipientes", NEW."tara_por_recipiente_kg",
      NEW."neto_kg", NEW."peso_declarado_kg", NEW."referencia_kg", NEW."diferencia_kg", NEW."tolerancia_kg",
      NEW."comparacion", NEW."politica_de_balance", NEW."brix", NEW."punto_de_muestreo", NEW."instrumento_id",
      NEW."veredicto_brix", NEW."nota", NEW."motivo_rechazo", NEW."created_at")
     IS DISTINCT FROM
     (OLD."clave_de_envio", OLD."beneficio_id", OLD."entrega_id", OLD."proveedor_id", OLD."pedido_id",
      OLD."recibida_por", OLD."recibida_at", OLD."bruto_kg", OLD."recipientes", OLD."tara_por_recipiente_kg",
      OLD."neto_kg", OLD."peso_declarado_kg", OLD."referencia_kg", OLD."diferencia_kg", OLD."tolerancia_kg",
      OLD."comparacion", OLD."politica_de_balance", OLD."brix", OLD."punto_de_muestreo", OLD."instrumento_id",
      OLD."veredicto_brix", OLD."nota", OLD."motivo_rechazo", OLD."created_at") THEN
    RAISE EXCEPTION 'recepcion_de_cereza_inmutable: una recepción no se edita; se anula con motivo';
  END IF;
  -- Una anulación consumada tampoco se reescribe: quién anuló, cuándo y por qué quedan fijos
  -- (revisión de Codex, hallazgo 2).
  IF OLD."estado" = 'anulada' AND (NEW."estado", NEW."anulada_at", NEW."anulada_por", NEW."motivo_anulacion")
     IS DISTINCT FROM (OLD."estado", OLD."anulada_at", OLD."anulada_por", OLD."motivo_anulacion") THEN
    RAISE EXCEPTION 'recepcion_de_cereza_inmutable: una recepción anulada no se vuelve a tocar';
  END IF;
  IF NEW."estado" IS DISTINCT FROM OLD."estado" AND NOT (OLD."estado" IN ('recibida', 'rechazada') AND NEW."estado" = 'anulada') THEN
    RAISE EXCEPTION 'recepcion_de_cereza_inmutable: el estado sólo pasa de recibida o rechazada a anulada';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "recepcion_de_cereza_inmutable"
  BEFORE UPDATE ON "traceability"."recepcion_de_cereza"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."recepcion_de_cereza_inmutable"();

-- 3. Una entrega recibida no se anula desde la finca.
CREATE OR REPLACE FUNCTION "traceability"."entrega_de_cosecha_recibida_no_se_anula"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."estado" = 'anulada' AND OLD."estado" <> 'anulada' AND EXISTS (
    SELECT 1 FROM "traceability"."recepcion_de_cereza" r WHERE r."entrega_id" = NEW."id" AND r."estado" <> 'anulada'
  ) THEN
    RAISE EXCEPTION 'entrega_de_cosecha_recibida_no_se_anula: la entrega % ya se recibió en el beneficio', NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "entrega_de_cosecha_recibida_no_se_anula"
  BEFORE UPDATE ON "traceability"."entrega_de_cosecha"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."entrega_de_cosecha_recibida_no_se_anula"();

-- 4. El destino de la jornada queda fijo en cuanto una de sus entregas se recibe.
CREATE OR REPLACE FUNCTION "traceability"."jornada_de_cosecha_destino_fijo"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."beneficio_id" IS DISTINCT FROM OLD."beneficio_id" AND EXISTS (
    SELECT 1 FROM "traceability"."recepcion_de_cereza" r
      JOIN "traceability"."entrega_de_cosecha" e ON e."id" = r."entrega_id"
     WHERE e."jornada_id" = NEW."id" AND r."estado" <> 'anulada'
  ) THEN
    RAISE EXCEPTION 'jornada_de_cosecha_destino_fijo: la jornada % ya tiene entregas recibidas', NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "jornada_de_cosecha_destino_fijo"
  BEFORE UPDATE ON "traceability"."jornada_de_cosecha"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."jornada_de_cosecha_destino_fijo"();
