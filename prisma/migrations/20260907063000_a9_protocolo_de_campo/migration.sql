-- A9.4 — la lista de chequeo de campo cabe en `ProtocolVariable`.
--
-- Aditiva entera: dos valores al enum y ocho columnas anulables. Ningún
-- protocolo científico existente las usa, así que ninguna fila cambia de
-- significado — que es la propiedad que el versionado tenía que conservar.
--
-- Las ocho salen de contar los 44 ítems de `protocolos/apiario-campo-v1.json`,
-- no de estimarlas: el informe de alcance decía cuatro.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "research"."ProtocolVariableValueType" ADD VALUE 'multi_enum';
ALTER TYPE "research"."ProtocolVariableValueType" ADD VALUE 'date';

-- AlterTable
ALTER TABLE "research"."protocol_variable" ADD COLUMN     "covers_existing_column" TEXT,
ADD COLUMN     "key" TEXT,
ADD COLUMN     "prefill_last_used" BOOLEAN,
ADD COLUMN     "provenance_class" "core"."ProvenanceClass",
ADD COLUMN     "required" BOOLEAN,
ADD COLUMN     "required_with" TEXT,
ADD COLUMN     "show_when" TEXT,
ADD COLUMN     "stage" TEXT;

