-- La valoracion del tecnico sobre una colonia — Anexo E, etapa de cierre.
--
-- ES EL UNICO campo de etapa «cierre» de la inspeccion: los otros dieciseis son
-- de campo. Se escribe en casa, sobre lo que se vio.
--
-- POR QUE NO ES `note`. `note` es la nota de campo --lo que se apunto ahi mismo,
-- con el guante puesto-- y esto es la lectura de despues. Mezclarlas perderia
-- cual de las dos se escribio donde, que es justo lo que el mapa del protocolo
-- decia al darla por sin sitio.
--
-- Anulable: el protocolo la marca `"required": false`, y una inspeccion sin
-- valorar es un registro incompleto, no uno invalido. Las inspecciones ya
-- guardadas NO se rellenan (ADR-080).

-- AlterTable
ALTER TABLE "apiary"."inspection" ADD COLUMN     "assessment" TEXT;
