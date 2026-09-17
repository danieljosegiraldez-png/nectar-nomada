-- Cajas presentes, contadas por quien visita — Anexo E, etapa de campo.
--
-- POR QUE SE DECLARA SI EL SISTEMA YA LAS CUENTA. `HivePlacement` sabe cuantas
-- colocó; esto es cuantas alguien VIO. Cuando los dos numeros no coinciden, eso
-- no es ruido: es una caja que se fue sin registrarse, o un recuento mal hecho.
-- Hoy el sistema no puede ni notarlo.
--
-- Hermana de `colonies_alive_count`, y NO lo mismo: una caja puede estar ahi
-- vacia. Anulable, como ella, porque las visitas ya guardadas no la tienen y
-- rellenarlas con un cero afirmaria un recuento que nadie hizo (ADR-080).

-- AlterTable
ALTER TABLE "traceability"."field_session" ADD COLUMN     "hives_present_count" INTEGER;
