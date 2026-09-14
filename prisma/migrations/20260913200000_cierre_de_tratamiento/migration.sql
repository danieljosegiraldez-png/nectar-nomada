-- A9 · Anexo B §4 — los dos campos de etapa CIERRE que faltaban, y que no se
-- podían añadir hasta que existiera camino para completar un evento ya escrito
-- (`PENDING_IMPLEMENTATIONS/011`).
--
-- `treatment_removal_date` es un campo de DÍA: «las tiras que no se retiran
-- generan resistencia», y el retiro ocurre semanas después de aplicar. Lo escribe
-- `completarCierreDeTratamiento` con `sourceInterface = "apiary.close"`, para que
-- la fila de auditoría diga que se completó en la casa y no se capturó en el campo
-- — la distinción que `completarVisita` ya estableció en trazabilidad.
--
-- `treatment_efficacy_note` es la prosa que acompaña a «eficacia observada». Su
-- mitad medible ya existe desde ADR-116: `VarroaCount.evaluatesColonyEventId` liga
-- el conteo posterior al tratamiento que evalúa.
--
-- **Y una nota que esta migración puede escribir por primera vez:** no hay nada
-- que excluir. Hasta ayer `migrate diff` proponía once líneas ajenas sobre
-- `traceability` en cada migración y había que quitarlas a mano; ADR-120 cerró esa
-- deriva declarando en el esquema lo que la base ya hacía, así que este diff es
-- exactamente este cambio y nada más.

-- AlterTable
ALTER TABLE "apiary"."colony_event" ADD COLUMN     "treatment_removal_date" TIMESTAMP(3),
ADD COLUMN     "treatment_efficacy_note" TEXT;
