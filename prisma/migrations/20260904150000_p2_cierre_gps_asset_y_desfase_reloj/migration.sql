-- P2 — cierre de la Fase 2: §6 (GPS en `asset`) y el resto de §5 (desfase de
-- reloj). Ver `docs/implementation/43_P2_OPERATOR_CORE.md`.
--
-- **Qué NO trae esta migración, y por qué.** §1 (extender `partner.task`) y §2
-- (`task_template`) quedan aplazados por decisión del dueño del producto el
-- 2026-09-04, siguiendo la rama que el propio §0 del ticket dejó escrita: si
-- nunca se asignó trabajo por la plataforma, la brecha es de adopción y no de
-- esquema, y las extensiones de §1 son especulativas. Medido ese mismo día
-- contra producción, con control positivo (17 personas, 3 proyectos, 40
-- assignments, así que la consulta sí lee datos reales):
--
--     partner.task              0 filas
--     partner.field_submission  0 filas
--     traceability.field_session 0 filas
--     traceability.field_event   0 filas
--
-- Las dos últimas son la mitad de la Fase 2 que sí se construyó hace una
-- semana. Extender `task` ahora sería apilar un segundo modelo sin usar encima
-- de un primero sin usar. Ver el ADR correspondiente.
--
-- Todo lo de abajo es **aditivo y anulable**: ninguna fila existente cambia,
-- ninguna restricción nueva puede fallar sobre datos vivos, y no hay backfill.
-- Por eso no lleva la comprobación previa de filas incumplidoras que sí llevan
-- las migraciones con CHECK (p. ej. `20260901100000_s1_invariantes_en_la_base`):
-- aquí no hay ninguna condición que una fila pueda incumplir.

-- ---------------------------------------------------------------------------
-- 1. §6 — dónde se tomó la foto.
--
--    `asset.location_id` es una FK a una `Location` *entidad*. Una foto tomada
--    en un punto de una ladera no tiene fila de `Location` y no debe crear una.
--    Mismos tres campos, mismos tipos y mismos nombres que `field_event`, para
--    que cuando la Fase 4 suba fotos desde un dispositivo las dos tablas se
--    lean igual.
-- ---------------------------------------------------------------------------
ALTER TABLE "core"."asset"
  ADD COLUMN "latitude"   DOUBLE PRECISION,
  ADD COLUMN "longitude"  DOUBLE PRECISION,
  ADD COLUMN "accuracy_m" DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- 2. §5 — el desfase del reloj del dispositivo al sincronizar, en ms.
--
--    `recorded_at` es hora del teléfono, y los teléfonos baratos derivan. Una
--    curva de fermentación reconstruida desde un reloj derivado sale mal de una
--    forma que nadie nota, porque cada punto es plausible y sólo el conjunto
--    está torcido. Guardando el desfase, `recorded_at` sigue siendo el dato
--    crudo que el operador vio y la corrección se aplica después.
--
--    Las seis tablas son exactamente las que ya llevan `recorded_at`,
--    `synced_at` y columna de dispositivo — las columnas viajan juntas o el
--    conjunto no significa nada. Quien lo escribe es la Fase 4, a la vez que
--    `synced_at`; hasta entonces queda NULL en todas las filas, que es lo
--    correcto: 0 diría «medido y sin deriva», y eso es otra afirmación.
-- ---------------------------------------------------------------------------
ALTER TABLE "traceability"."quantity_event"  ADD COLUMN "clock_offset_ms" INTEGER;
ALTER TABLE "traceability"."measurement"     ADD COLUMN "clock_offset_ms" INTEGER;
ALTER TABLE "traceability"."field_session"   ADD COLUMN "clock_offset_ms" INTEGER;
ALTER TABLE "traceability"."field_event"     ADD COLUMN "clock_offset_ms" INTEGER;
ALTER TABLE "apiary"."inspection"            ADD COLUMN "clock_offset_ms" INTEGER;
ALTER TABLE "apiary"."colony_event"          ADD COLUMN "clock_offset_ms" INTEGER;
