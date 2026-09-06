-- Añadir `purpose` NOT NULL a una tabla que puede no estar vacía.
--
-- Prisma la generó sin valor por defecto, y así falla si hay una sola fila. Hoy
-- producción tiene CERO tuestes —medido—, pero la pantalla de tueste entró en
-- servicio esta misma mañana y este despliegue es posterior: entre medias puede
-- aparecer uno, y una migración que revienta en producción bloquea el despliegue
-- entero.
--
-- Se añade con un valor por defecto TEMPORAL y se le quita después. El efecto:
-- una fila anterior a la distinción queda como `production`, que es una
-- suposición —no se sabía— pero es la única que no inventa un tueste de muestra
-- donde hubo una venta; y a partir de aquí la aplicación DEBE decirlo siempre,
-- porque sin `@default` en el esquema Prisma exige el campo.
-- CreateEnum
CREATE TYPE "traceability"."RoastPurpose" AS ENUM ('sample', 'production');

-- AlterTable
ALTER TABLE "traceability"."roast_session" ADD COLUMN     "purpose" "traceability"."RoastPurpose" NOT NULL DEFAULT 'production',
ADD COLUMN     "recipe_version_id" UUID;

-- Quitar el defecto: era sólo para las filas que ya existieran. Desde aquí, un
-- tueste sin propósito es un error de la aplicación y debe verse como tal.
ALTER TABLE "traceability"."roast_session" ALTER COLUMN "purpose" DROP DEFAULT;

-- CreateTable
CREATE TABLE "traceability"."lot_roast_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_id" UUID NOT NULL,
    "recipe_version_id" UUID NOT NULL,
    "notes" TEXT,
    "chosen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chosen_by" UUID,

    CONSTRAINT "lot_roast_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lot_roast_profile_lot_id_key" ON "traceability"."lot_roast_profile"("lot_id");

-- CreateIndex
CREATE INDEX "lot_roast_profile_recipe_version_id_idx" ON "traceability"."lot_roast_profile"("recipe_version_id");

-- AddForeignKey
ALTER TABLE "traceability"."lot_roast_profile" ADD CONSTRAINT "lot_roast_profile_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_roast_profile" ADD CONSTRAINT "lot_roast_profile_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "traceability"."process_recipe_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."lot_roast_profile" ADD CONSTRAINT "lot_roast_profile_chosen_by_fkey" FOREIGN KEY ("chosen_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability"."roast_session" ADD CONSTRAINT "roast_session_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "traceability"."process_recipe_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
