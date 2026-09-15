-- A9 · La colocación que faltaba: las colmenas creadas DESPUÉS del relleno de ADR-126.
--
-- QUÉ ARREGLA. ADR-126 creó `apiary.hive_placement` y rellenó una colocación por cada
-- colmena que existía entonces. Lo que no hizo fue abrirla para las que vinieran después:
-- `createHive` sólo insertaba en `apiary.hive`, y de los tres guiones de datos sólo
-- `apiario-toabre.ts` la creaba a mano. La invariante vivía en un comentario.
--
-- MEDIDO EL 2026-09-15 sobre la copia local con los datos reales, antes de escribir esto:
-- 29 colmenas, 19 con colocación, **10 sin ninguna** — y las diez son las de Apiario Las
-- Nubes, creadas por `scripts/apiario-las-nubes.ts` y `scripts/procedencias-y-sitios.ts`.
-- Con control positivo: NN-0041, del relleno original, sí tenía la suya.
--
-- QUÉ SIGNIFICABA ESE HUECO. Para `apiarioDeColmenaEn` esas diez **no constan en ningún
-- sitio en ninguna fecha** —devuelve `null`, que el propio comentario de esa función define
-- como «no consta»— y `colmenasDeLaVentana` no las cuenta: el §9 del Anexo E, la primera
-- pregunta histórica que el módulo sabe contestar, era ciega al apiario real del dueño.
-- Nada fallaba en rojo; la respuesta simplemente salía vacía.
--
-- LA MISMA REGLA QUE EL RELLENO ORIGINAL, a propósito: `started_at` sale de `installed_at`
-- cuando existe —la fecha que alguien DECLARÓ— y de `created_at` cuando no. No se inventa
-- una fecha intermedia. `ended_at` queda NULL, que es lo que `hive.location_id` afirma hoy,
-- y `reason` queda NULL porque ninguno de los cuatro motivos del Anexo describe «aquí es
-- donde estaba cuando alguien se acordó de escribirlo».
--
-- POR QUÉ ES IDEMPOTENTE Y NO UN INSERT A SECAS. El `NOT EXISTS` mira si la colmena tiene
-- CUALQUIER colocación, no sólo una abierta: una colmena trasladada tiene dos filas y su
-- historia está completa, así que añadirle una tercera desde el origen sería inventar que
-- estuvo en dos sitios a la vez. Y así esta migración no puede duplicar nada si el relleno
-- de ADR-126 ya pasó por la misma fila.
--
-- NO TOCA EL ESQUEMA. Sólo datos, así que `prisma migrate diff` sigue diciendo que el
-- esquema y las migraciones coinciden — lo comprueba `tests/derivaDeMigraciones.test.ts`.
INSERT INTO "apiary"."hive_placement" ("hive_id", "location_id", "started_at")
SELECT h."id", h."location_id", COALESCE(h."installed_at", h."created_at")
FROM "apiary"."hive" h
WHERE NOT EXISTS (
  SELECT 1 FROM "apiary"."hive_placement" p WHERE p."hive_id" = h."id"
);
