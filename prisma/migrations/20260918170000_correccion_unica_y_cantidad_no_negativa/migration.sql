-- Ronda final de revisión de manejo fitosanitario (hallazgos 2 y 5).
--
-- (2) Como mucho UNA corrección vigente por intervención. `corrects_id` tenía
-- un índice ORDINARIO: dos operadores podían leer "todavía no tiene
-- corrección" a la vez y confirmar los dos, dejando dos versiones vigentes
-- del mismo hecho físico. Va en la BASE, no en el servicio, por el mismo
-- motivo que el material único de `consumable_material`: una comprobación en
-- código tiene una carrera entre el SELECT y el INSERT, y un índice único no.
--
-- PARCIAL porque `corrects_id` es nulo en toda fila SIN corrección — que es
-- el caso normal, y la mayoría de las filas— y un único exacto sobre una
-- columna nula prohibiría más de una fila sin corregir, que es exactamente lo
-- que no se quiere prohibir. `lib/traceability/intervenciones.ts` traduce la
-- violación (P2002) de `corregirIntervencion` a un error legible.
CREATE UNIQUE INDEX "plot_intervention_corrects_id_unico_key"
  ON "traceability"."plot_intervention"("corrects_id")
  WHERE "corrects_id" IS NOT NULL;

-- (5) La cantidad de una línea admitía negativos cuando la línea NO llevaba
-- frasco: el `CHECK` de `ConsumableStockEvent` (el libro mayor) sólo se
-- ejerce al descontar, así que la misma cantidad se aceptaba sin frasco y se
-- rechazaba con frasco. El servicio ya la valida en `validarPura`; este
-- `CHECK` es el mismo respaldo que ya tienen `withdrawal_days` y
-- `reentry_hours` en esta misma tabla — un importador o SQL directo se lo
-- salta igual que a ellos si sólo viviera en código.
ALTER TABLE "traceability"."plot_intervention_line"
  ADD CONSTRAINT "plot_intervention_line_cantidad_no_negativa"
  CHECK ("quantity" IS NULL OR "quantity" >= 0);
