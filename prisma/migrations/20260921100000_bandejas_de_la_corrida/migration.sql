-- Paso 2 del spec de secado por bandeja (§4.3). Qué bandejas lleva el secado de
-- un lote, cuándo se cargó y cuándo se bajó cada una. La POSICIÓN no va aquí:
-- es el último equipment_transfer de la bandeja hacia una drying_bed (§4.2).
--
-- Reglas que miran otra tabla → disparadores, misma forma que
-- traceability.exigir_cama_de_secado. Los textos van sin tildes a propósito.
--
-- Ajustes del pre-flight contra lo que 2a dejó en main (ajustes.md, Tarea 1):
-- D4 exige que la bandeja sea un recipiente NUMERADO (tray_type_id no nulo);
-- D5 exige que la bandeja sea de la MISMA organización que el lote de la
-- corrida (el lote se llega por lot_transformation) y añade la guarda del
-- padre — un equipo con filas de drying_run_tray no cambia de organización —
-- calcada de `exigir_tipo_de_bandeja_quieto` en 20260918191000; D9 cambia los
-- `FOR UPDATE` de corrida y equipo por `FOR NO KEY UPDATE`, que basta para
-- serializar esta fila sin bloquear los `FOR KEY SHARE` que ya piden sus FK
-- (traslados, mediciones, volteos, trabajos de esa corrida).
--
-- Ronda 1 de revisión: faltaba la guarda del OTRO padre. `exigir_bandeja_valida`
-- ya rechaza CARGAR una bandeja de otra organización que el lote, pero nada
-- impedía cambiar la organización del LOTE una vez cargada — el `FOR SHARE`
-- de esa comprobación sólo demora un cambio concurrente, no lo prohíbe. Se
-- añade `exigir_lote_con_bandejas_quieto`, calcada de
-- `exigir_lote_con_pesajes_quieto` (20260918191500_pesaje_de_bandeja:128-140):
-- un lote alcanzado por `drying_run_tray` (por `lot_transformation_input` →
-- `lot_transformation` → `drying_run` → `drying_run_tray`) no cambia de
-- organización. Ese es el camino real: `lot_transformation.drying_run_id`
-- señala la corrida, y `drying_run_tray.drying_run_id` señala la misma fila.

CREATE TABLE "traceability"."drying_run_tray" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "drying_run_id" UUID NOT NULL,
  "equipment_id" UUID NOT NULL,
  "desde" TIMESTAMP(3) NOT NULL,
  "hasta" TIMESTAMP(3),
  "provenance_class" "core"."ProvenanceClass" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "drying_run_tray_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drying_run_tray_hasta_despues_de_desde" CHECK ("hasta" IS NULL OR "hasta" >= "desde")
);

ALTER TABLE "traceability"."drying_run_tray"
  ADD CONSTRAINT "drying_run_tray_drying_run_id_fkey" FOREIGN KEY ("drying_run_id")
    REFERENCES "traceability"."drying_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_run_tray_equipment_id_fkey" FOREIGN KEY ("equipment_id")
    REFERENCES "core"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_run_tray_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "drying_run_tray_drying_run_id_idx" ON "traceability"."drying_run_tray"("drying_run_id");
CREATE INDEX "drying_run_tray_equipment_id_idx" ON "traceability"."drying_run_tray"("equipment_id");

-- Una bandeja, una fila abierta como mucho. Es la red contra dos cargas
-- simultáneas; el disparador de abajo cubre además los intervalos cerrados.
CREATE UNIQUE INDEX "drying_run_tray_una_abierta_por_bandeja"
  ON "traceability"."drying_run_tray"("equipment_id") WHERE "hasta" IS NULL;

-- Al cargar o corregir una bandeja: es un recipiente NUMERADO (D4), de la
-- misma organización que el lote de la corrida (D5), su corrida no tiene
-- cama, una fila ABIERTA no vive en una corrida cerrada, y no se solapa con
-- otro intervalo de la misma bandeja.
--
-- Bloqueos, siempre en este orden: primero la CORRIDA, después el EQUIPO,
-- `FOR NO KEY UPDATE` los dos (D9: alcanza para serializar sin bloquear los
-- `FOR KEY SHARE` de otras FK sobre estas mismas filas). El de la corrida
-- serializa esta fila contra `exigir_corrida_coherente_con_bandejas` (un
-- UPDATE de drying_run ya tiene la fila bloqueada cuando corre su BEFORE):
-- sin él, cargar y cerrar a la vez podían confirmar las dos (revisión de
-- Codex del plan, 2026-09-18). El del equipo serializa dos cargas de la misma
-- bandeja y un cambio de su `kind` o de su `organization_id`. Después,
-- `FOR SHARE` sobre el lote de la corrida (D5) — mismo orden que 2a
-- (`191800:27-28`): primero el padre que ya se bloqueó arriba, después el
-- lote. Las funciones son VOLATILE: en READ COMMITTED cada consulta de dentro
-- toma instantánea nueva, así que tras esperar el bloqueo se ve lo que el
-- otro confirmó.
CREATE OR REPLACE FUNCTION "traceability"."exigir_bandeja_valida"()
RETURNS TRIGGER AS $$
DECLARE
  tipo TEXT;
  cama UUID;
  cerrada TIMESTAMP(3);
  org_bandeja UUID;
  bandeja_tray_type UUID;
  org_lote UUID;
BEGIN
  SELECT "drying_bed_location_id", "ended_at" INTO cama, cerrada
    FROM "traceability"."drying_run" WHERE "id" = NEW."drying_run_id" FOR NO KEY UPDATE;
  SELECT "kind"::TEXT, "organization_id", "tray_type_id" INTO tipo, org_bandeja, bandeja_tray_type
    FROM "core"."equipment" WHERE "id" = NEW."equipment_id" FOR NO KEY UPDATE;
  IF tipo IS DISTINCT FROM 'vessel' THEN
    RAISE EXCEPTION 'Una bandeja de secado debe ser un equipo de tipo recipiente (es %)', tipo;
  END IF;
  -- D4: sólo un recipiente NUMERADO (tipo y número) es una bandeja.
  IF bandeja_tray_type IS NULL THEN
    RAISE EXCEPTION 'Una bandeja de secado debe tener tipo y numero';
  END IF;
  -- D5: la bandeja es de la misma organización que el lote de la corrida. El
  -- lote se llega por lot_transformation (misma consulta que
  -- resolveRunSourceLot en lib/traceability/drying.ts): la transformación más
  -- antigua que apunta a esta corrida, su primer input. Si la corrida todavía
  -- no tiene ninguna transformación (fila huérfana, como las que crea
  -- topologiaDeSecado.test.ts), no hay lote con quien comparar y se deja pasar.
  SELECT l."organization_id" INTO org_lote
    FROM "traceability"."lot_transformation" lt
    JOIN "traceability"."lot_transformation_input" lti ON lti."transformation_id" = lt."id"
    JOIN "traceability"."lot" l ON l."id" = lti."lot_id"
    WHERE lt."drying_run_id" = NEW."drying_run_id"
    ORDER BY lt."occurred_at" ASC
    LIMIT 1
    FOR SHARE;
  IF org_lote IS NOT NULL AND org_bandeja IS DISTINCT FROM org_lote THEN
    RAISE EXCEPTION 'Esta bandeja es de otra organizacion que el lote';
  END IF;
  IF cama IS NOT NULL THEN
    RAISE EXCEPTION 'Una corrida con cama no lleva bandejas';
  END IF;
  -- INSERT o UPDATE: una fila abierta no existe en un secado cerrado. Cubre
  -- cargar tarde, reabrir con `hasta = NULL` y mover una fila abierta a otra corrida.
  IF cerrada IS NOT NULL AND NEW."hasta" IS NULL THEN
    RAISE EXCEPTION 'El secado ya esta cerrado';
  END IF;
  -- Un intervalo al revés lo rechaza el CHECK, que corre DESPUÉS de este
  -- disparador. Si se construyera aquí su tsrange, el error sería el de límites
  -- del rango y no el del CHECK: se sale y se deja que el CHECK hable.
  IF NEW."hasta" IS NOT NULL AND NEW."hasta" < NEW."desde" THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "traceability"."drying_run_tray" o
     WHERE o."equipment_id" = NEW."equipment_id" AND o."id" <> NEW."id"
       AND tsrange(o."desde", o."hasta", '[)') && tsrange(NEW."desde", NEW."hasta", '[)')
  ) THEN
    RAISE EXCEPTION 'Esta bandeja ya lleva otro lote en ese intervalo';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "drying_run_tray_exigir_bandeja_valida"
  BEFORE INSERT OR UPDATE OF "equipment_id", "drying_run_id", "desde", "hasta"
  ON "traceability"."drying_run_tray"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_bandeja_valida"();

-- Del lado de la corrida: cama O bandejas, y no se cierra con bandejas abiertas
-- (el secado termina bandeja a bandeja: decisión de Daniel del 2026-09-18).
CREATE OR REPLACE FUNCTION "traceability"."exigir_corrida_coherente_con_bandejas"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."drying_bed_location_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "traceability"."drying_run_tray" WHERE "drying_run_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Una corrida con bandejas no lleva cama';
  END IF;
  IF NEW."ended_at" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "traceability"."drying_run_tray" WHERE "drying_run_id" = NEW."id" AND "hasta" IS NULL
  ) THEN
    RAISE EXCEPTION 'No se cierra un secado con bandejas sin bajar';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "drying_run_coherente_con_bandejas"
  BEFORE UPDATE OF "drying_bed_location_id", "ended_at" ON "traceability"."drying_run"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_corrida_coherente_con_bandejas"();

-- Del lado del equipo: un recipiente que lleva o llevó una bandeja no cambia de
-- `kind`. Sin esto, `UPDATE equipment SET kind = 'instrument', format = NULL`
-- dejaba una bandeja atada a un instrumento sin disparar nada (revisión de Codex).
CREATE OR REPLACE FUNCTION "core"."exigir_bandeja_sigue_siendo_recipiente"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."kind" IS DISTINCT FROM 'vessel' AND EXISTS (
    SELECT 1 FROM "traceability"."drying_run_tray" WHERE "equipment_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Una bandeja de secado debe ser un equipo de tipo recipiente (es %)', NEW."kind";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "equipment_bandeja_sigue_siendo_recipiente"
  BEFORE UPDATE OF "kind" ON "core"."equipment"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_bandeja_sigue_siendo_recipiente"();

-- D5, guarda del padre: un equipo que llevó alguna vez una bandeja (tiene
-- filas en drying_run_tray, cualquiera, no sólo las abiertas) no cambia de
-- organización. Calcada de `exigir_tipo_de_bandeja_quieto`
-- (20260918191000_tipos_y_numero_de_bandeja): sin esto, mover el equipo dejaba
-- sus filas de drying_run_tray «de otra organización» que el lote sin que la
-- comprobación de arriba se disparara — esas filas ya existen, no se vuelven a
-- escribir.
CREATE OR REPLACE FUNCTION "core"."exigir_bandeja_con_lote_quieta"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
     AND EXISTS (SELECT 1 FROM "traceability"."drying_run_tray" WHERE "equipment_id" = NEW."id") THEN
    RAISE EXCEPTION 'Un equipo con bandejas cargadas no cambia de organizacion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "equipment_bandeja_con_lote_quieta"
  BEFORE UPDATE OF "organization_id" ON "core"."equipment"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_bandeja_con_lote_quieta"();

-- Ronda 1, el otro padre: un lote alcanzado por drying_run_tray no cambia de
-- organización. El camino es lot_transformation_input (lot_id = este lote) →
-- lot_transformation (transformation_id) → drying_run_tray
-- (drying_run_id = lot_transformation.drying_run_id).
CREATE OR REPLACE FUNCTION "traceability"."exigir_lote_con_bandejas_quieto"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" AND EXISTS (
    SELECT 1
      FROM "traceability"."lot_transformation_input" lti
      JOIN "traceability"."lot_transformation" lt ON lt."id" = lti."transformation_id"
      JOIN "traceability"."drying_run_tray" drt ON drt."drying_run_id" = lt."drying_run_id"
     WHERE lti."lot_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Un lote con bandejas de secado no cambia de organizacion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "lot_con_bandejas_quieto"
  BEFORE UPDATE OF "organization_id" ON "traceability"."lot"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_lote_con_bandejas_quieto"();
