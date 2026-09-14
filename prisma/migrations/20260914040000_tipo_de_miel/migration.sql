-- A9 · Anexo B §5 — el tipo de miel, y **sólo** el tipo de miel.
--
-- «Terruño por sitio y por temporada; base del producto», etapa cierre: se sabe al
-- extraer, no en el apiario.
--
-- `monofloral_declarada` lleva «declarada» porque así lo escribió el dueño: es una
-- afirmación de quien cosechó, no un resultado de laboratorio. Verificarla es un
-- análisis de polen —una `Sample` con su `Measurement`— y no un cambio en esta
-- columna; guardar declaración y verificación en el mismo campo las haría
-- indistinguibles.
--
-- LA HUMEDAD NO ENTRA, y no por falta de tiempo. El Anexo la marca «parcial», y
-- medido el 2026-09-14 eso no significa un mecanismo a medias:
--
--   * `Measurement` ya admite `lotId`, y una cosecha de apiario CREA un `Lot`;
--   * `PANEL_DEL_SUJETO` en `lib/traceability/measurements.ts` no restringe `lotId`,
--     así que una lectura de `moisture` sobre un lote de miel se acepta hoy;
--   * `LotType` ya tiene `honey`, y su comentario dice que A3 decidió que la miel
--     reusa la maquinaria del lote **sin modificarla**.
--
-- O sea: la humedad **ya funciona**; lo que faltaba es que alguien la encontrara y
-- que se leyera junto a la cosecha. Eso es pantalla, no esquema. Una columna aquí
-- sería un segundo sitio para el mismo número, sin instrumento, sin método y sin
-- quién lo midió — y lo prueba `tests/apiary/cierreDeCosecha.test.ts`, que registra
-- una humedad de miel sin que este cambio la haya habilitado.

-- CreateEnum
CREATE TYPE "apiary"."HoneyType" AS ENUM ('multifloral', 'monofloral_declarada', 'mielato');

-- AlterTable
ALTER TABLE "apiary"."apiary_harvest_event" ADD COLUMN     "honey_type" "apiary"."HoneyType";
