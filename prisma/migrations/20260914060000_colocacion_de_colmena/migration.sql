-- A9 · Anexo E §8 — dónde ha estado una colmena, y desde cuándo.
--
-- QUÉ CIERRA. «El traslado cierra la vigencia de cada colmena en el apiario de origen y
-- abre la del destino en la misma operación. Nunca deja una colmena en dos lugares ni en
-- ninguno.» Hoy no hay dónde escribir eso: `apiary.hive.location_id` guarda el apiario
-- ACTUAL y nada más.
--
-- POR QUÉ ES UNA TABLA Y NO UNA COLUMNA MÁS. Medido antes de tocar nada: ni
-- `apiary.inspection`, ni `apiary.colony_event`, ni `apiary.apiary_harvest_event`, ni
-- `apiary.varroa_count` tienen `location_id` propio —cero en los cuatro, contra dos en
-- `traceability.lot`, que es el control positivo—. O sea que el ÚNICO camino de un evento
-- a su apiario es el puntero actual de la colmena, y moverlo habría movido la historia
-- entera con él: las inspecciones de marzo en Santa Fe pasarían a leerse como hechas en el
-- apiario de destino. Eso no es una pantalla que falte; es un hecho que no se puede
-- escribir.
--
-- ES EL MISMO PATRÓN QUE `traceability.storage_assignment`, A PROPÓSITO. Un lote ya se
-- mueve entre ubicaciones con `started_at`/`ended_at` y `NULL` por «la de ahora».
-- Inventar una segunda forma para el mismo hecho —una cosa que está en un sitio durante un
-- rato— daría dos vocabularios que derivan.
--
-- LO QUE NO HACE: SUSTITUIR A `hive.location_id`. Ese campo es el ancla de autorización
-- —`requireApiaryAccess` lo usa en ocho sitios de `lib/apiary/`— y lo que hace cumplir
-- `hive_location_id_identifier_key`. La invariante es que coincide con el `location_id` de
-- la colocación abierta, y el traslado mueve las dos cosas en la misma transacción.
--
-- Y POR QUÉ NO HAY ÍNDICE ÚNICO SOBRE (hive_id, ended_at). Porque no guardaría nada: en
-- Postgres los NULL son distintos entre sí en un índice único, así que dos colocaciones
-- abiertas —las dos con `ended_at` nulo— pasarían. Medido el 2026-09-13 contra Postgres
-- 18.6, con control positivo: el mismo índice rechazó la fila duplicada con valor
-- (sobrevivió 1 de 2 inserciones) y admitió LAS DOS con NULL. Un índice único PARCIAL
-- —`where ended_at is null`— sí lo haría, pero Prisma no lo expresa y meterlo como SQL
-- suelto crearía la deriva que ADR-120 cerró. La invariante la sostiene el servicio, en
-- una transacción, y la defiende su prueba.

-- CreateTable
CREATE TABLE "apiary"."hive_placement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "hive_placement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hive_placement_hive_id_idx" ON "apiary"."hive_placement"("hive_id");

-- CreateIndex
CREATE INDEX "hive_placement_location_id_idx" ON "apiary"."hive_placement"("location_id");

-- AddForeignKey
ALTER TABLE "apiary"."hive_placement" ADD CONSTRAINT "hive_placement_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "apiary"."hive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."hive_placement" ADD CONSTRAINT "hive_placement_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary"."hive_placement" ADD CONSTRAINT "hive_placement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RELLENO: la colocación que cada colmena YA tiene.
--
-- Sin esto la tabla nace diciendo que ninguna colmena ha estado en ningún sitio, y la
-- primera consulta por fecha devolvería vacío para toda la historia existente — una
-- ausencia que se leería como «no se sabe» cuando el dato sí está, en `hive.location_id`.
--
-- `started_at` sale de `installed_at` cuando existe, porque es la fecha que alguien
-- DECLARÓ, y de `created_at` cuando no, que es cuándo se registró la fila. No se inventa
-- una fecha intermedia: las dos son hechos del sistema, y cuál se usó se puede deducir
-- comparando con `hive.installed_at`.
--
-- `ended_at` queda NULL: es la colocación vigente, que es exactamente lo que
-- `hive.location_id` afirma hoy.
--
-- `reason` queda NULL a propósito. El Anexo fija cuatro motivos de traslado y ninguno
-- describe «aquí es donde estaba cuando empezamos a registrarlo»; inventarle uno sería
-- afirmar un hecho que nadie dijo.
INSERT INTO "apiary"."hive_placement" ("hive_id", "location_id", "started_at")
SELECT "id", "location_id", COALESCE("installed_at", "created_at")
FROM "apiary"."hive";
