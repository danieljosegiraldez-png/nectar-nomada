-- F1 fix-final (ADR-080). La migración 20260917210000 creó `cleaned`,
-- `liquid_changed` y `lure_recharged` como `BOOLEAN NOT NULL DEFAULT false`,
-- y el servicio hacía `?? false`: una revisión guardada sin preguntar el
-- mantenimiento quedaba afirmando que NO se hizo, en vez de que nadie lo
-- registró. No se edita la migración ya aplicada; ésta la corrige encima.

ALTER TABLE "traceability"."specimen_observation"
  ALTER COLUMN "cleaned" DROP NOT NULL,
  ALTER COLUMN "cleaned" DROP DEFAULT,
  ALTER COLUMN "liquid_changed" DROP NOT NULL,
  ALTER COLUMN "liquid_changed" DROP DEFAULT,
  ALTER COLUMN "lure_recharged" DROP NOT NULL,
  ALTER COLUMN "lure_recharged" DROP DEFAULT;

-- El camino nuevo (`recordTrapCheck`) SIEMPRE escribe `broca_level`. Una fila
-- sin él es histórica (de antes de esta rama) o no es una revisión de trampa
-- en absoluto: en los dos casos, el `false` que dejó la migración anterior era
-- inventado y se limpia a NULL — "no se preguntó", no "se hizo que no".
UPDATE "traceability"."specimen_observation"
SET "cleaned" = NULL, "liquid_changed" = NULL, "lure_recharged" = NULL
WHERE "broca_level" IS NULL;
