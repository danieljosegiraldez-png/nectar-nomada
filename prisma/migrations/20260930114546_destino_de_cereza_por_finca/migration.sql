-- El destino de la cereza de una finca (diseño 2026-09-30, ADR-194).
--
-- Anulable a propósito: una finca cuya cereza se compra y se traslada no lleva destino y entra por
-- el camino del proveedor. Un NOT NULL obligaría a inventarle uno.
--
-- RESTRICT y no CASCADE: borrar un beneficio al que una finca envía dejaría fincas apuntando al
-- vacío en silencio, y de esta columna depende que `pendientesDeBeneficio` no pierda entregas.
ALTER TABLE "core"."location" ADD COLUMN "beneficio_destino_id" UUID;

ALTER TABLE "core"."location"
  ADD CONSTRAINT "location_beneficio_destino_id_fkey"
  FOREIGN KEY ("beneficio_destino_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT;

CREATE INDEX "location_beneficio_destino_id_idx" ON "core"."location" ("beneficio_destino_id");
