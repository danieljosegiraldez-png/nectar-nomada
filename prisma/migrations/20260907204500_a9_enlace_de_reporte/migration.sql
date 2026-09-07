-- A9.6 (D7) — el enlace con caducidad para que un cliente sin cuenta abra su
-- reporte.
--
-- Aditiva: tres columnas anulables sobre `report_publication` y su índice.
-- El token se guarda HASHEADO, igual que el refresh de `lib/sync/deviceTokens.ts`
-- y por su misma razón: quien lea la base no puede usarlo.
--
-- NOTA sobre lo que este archivo NO trae. `prisma migrate diff` propone además
-- seis sentencias sobre `traceability.lot_process`, `drying_run` y
-- `fermentation_run` —quitar y volver a poner dos claves ajenas, borrar dos
-- índices—. Esa deriva ya está en `origin/main` ANTES de este cambio (medido
-- con el esquema sin tocar) y viene de los PR #227/#228. No entra aquí:
-- arrastrarla revertiría decisiones de otra sesión sin que su PR lo dijera.

-- AlterTable
ALTER TABLE "reporting"."report_publication" ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "link_token_hash" TEXT,
ADD COLUMN     "revoked_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "report_publication_link_token_hash_key" ON "reporting"."report_publication"("link_token_hash");
