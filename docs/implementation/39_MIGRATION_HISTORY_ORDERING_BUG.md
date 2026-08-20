# Bug — el historial de migraciones no se puede reconstruir desde cero

**Encontrado, no arreglado.** Durante `36_RO1.2_METODOS_FERMENTACION.md`,
`prisma migrate dev` falló al intentar generar una migración nueva —no por
el schema nuevo, sino porque el shadow database (que reproduce **todas**
las migraciones existentes desde cero para calcular el diff) no pudo
aplicar una migración que ya está corrida en producción.

**No lo arregles sin decisión explícita del product owner o Kenneth** —
tocar `_prisma_migrations` en la base real de Neon o renombrar carpetas de
migraciones ya aplicadas es sensible; hacerlo mal deja la base en un
estado peor que el actual (que, aunque roto para replay, funciona bien
para todo lo demás).

---

## 1. El problema exacto

El orden de las carpetas en `prisma/migrations/` no coincide con el orden
real en que las migraciones se aplicaron a producción:

```
20260813112712_ro1_statistical_discipline   <- nombre dice 11:27:12
20260813123856_r1_roastsession_taxonomia_sensorial
20260813153349_ro1_research_os              <- nombre dice 15:33:49
20260813155334_ro1_variable_catalogs
```

Pero `20260813112712_ro1_statistical_discipline` modifica tablas
(`research.conclusion`, `research.experiment`,
`research.variable_catalog_value`) que **`20260813153349_ro1_research_os`
es quien crea** (incluyendo el propio schema Postgres `research`). Es
decir: por el nombre de carpeta, Prisma cree que `statistical_discipline`
corre primero — pero su SQL solo tiene sentido si `research_os` ya corrió
antes.

**En producción (Neon) esto nunca fue un problema** — evidentemente las
migraciones se aplicaron en el orden real correcto (`research_os` antes de
`statistical_discipline`), y `_prisma_migrations` en la base real
simplemente registra qué se aplicó, no en qué orden debieron haberse
nombrado las carpetas. `npx prisma migrate status` reporta "Database
schema is up to date!" sin problema.

**El problema aparece solo cuando algo necesita reproducir el historial
completo desde una base vacía** — el shadow database que `prisma migrate
dev` crea automáticamente para diffear un schema nuevo contra el estado
"tal como las migraciones lo construirían". Ese replay sí respeta el
orden alfabético/timestamp de las carpetas, y falla ahí:

```
Error: P3006
Migration `20260813112712_ro1_statistical_discipline` failed to apply
cleanly to the shadow database.
Database error: ERROR: schema "research" does not exist
```

## 2. Por qué importa aunque producción esté bien

- **Nadie puede levantar un entorno nuevo desde cero** ejecutando
  `prisma migrate deploy`/`dev` contra una base Postgres vacía — un
  desarrollador nuevo, un ambiente de staging, o una recuperación de
  desastre fallarían en el mismo punto.
- **`prisma migrate dev` deja de funcionar** para cualquier ticket futuro
  que necesite generar una migración nueva por el flujo normal (no solo
  RO1.2 — cualquier cambio de schema de acá en adelante). Este ticket
  mismo tuvo que rodear el problema con `prisma migrate diff
  --from-config-datasource` (diff directo contra la base real, sin
  reproducir el historial) y aplicar el SQL a mano — funciona, pero no
  es el flujo normal y hay que repetirlo manualmente cada vez hasta que
  esto se arregle.
- **CI/CD que use shadow database** (si algún día se agrega) fallaría
  igual.

## 3. Cómo se originó (hipótesis, no confirmado)

El nombre de carpeta de una migración lo genera Prisma con el timestamp
del momento en que corre `prisma migrate dev --name ...`. Que
`statistical_discipline` (contenido de §4/§3a-bis de RO1) tenga un
timestamp **anterior** al de `research_os` (contenido base de RO1, §2/§3)
sugiere que en algún momento de la sesión que hizo RO1 se generó o
renombró una carpeta de migración fuera del flujo normal — o se corrigió
el nombre de una migración después de aplicarla sin actualizar el
timestamp. No se investigó más a fondo porque no era el alcance de
RO1.2; **si alguien retoma esto, revisar el historial de commits de
`prisma/migrations/` es el primer paso.**

## 4. Qué NO hacer

- **No `prisma migrate reset`** — borra todos los datos.
- **No renombrar la carpeta sin coordinar `_prisma_migrations`** — Prisma
  identifica cada migración aplicada por el nombre exacto de su carpeta;
  renombrarla sin actualizar la fila correspondiente en
  `_prisma_migrations` de la base real hace que Prisma la vea como una
  migración nueva no aplicada, e intente correrla de nuevo (fallaría,
  porque el contenido ya existe).

## 5. Opciones a evaluar (no elegidas todavía)

1. **Renombrar la carpeta + actualizar `_prisma_migrations` en el mismo
   commit/operación.** Cambiar `20260813112712_ro1_statistical_discipline`
   a un timestamp posterior a `20260813153349_ro1_research_os` (por
   ejemplo `20260813153350_...`), y hacer un `UPDATE` manual de la fila
   correspondiente en `_prisma_migrations` (columna `migration_name`) en
   Neon para que coincida. Requiere cuidado: hacerlo en una ventana sin
   escritura concurrente, y verificar con `prisma migrate status` +
   `prisma migrate dev --create-only` (probando el shadow database)
   después.
2. **Squash de migraciones históricas.** Colapsar las migraciones más
   viejas en una sola migración "baseline" (patrón oficial de Prisma para
   este caso: https://pris.ly/d/migrate-squash-migrations). Más trabajo,
   pero deja el historial limpio y further-proof contra este mismo
   problema reapareciendo.
3. **Dejarlo así y documentar el workaround permanentemente.** Cada
   migración futura se genera con `prisma migrate diff
   --from-config-datasource --to-schema prisma/schema.prisma --script`
   en vez de `prisma migrate dev`, y se aplica a mano + se registra con
   `prisma migrate resolve --applied`. Cero riesgo sobre datos reales,
   pero el problema nunca se resuelve y cada sesión futura tiene que
   saber hacer esto (este mismo archivo documenta el procedimiento
   exacto, ver §6).

**Recomendación tentativa, a confirmar con el product owner:** Opción 1
es la más barata y la que de verdad arregla el problema, pero toca
`_prisma_migrations` en producción — por eso este ticket no la ejecuta
sin luz verde explícita.

## 6. Workaround exacto usado en RO1.2 (mientras esto no se arregle)

```bash
# 1. Diff directo contra la base real, sin reproducir el historial completo.
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/diff.sql

# 2. Revisar el SQL generado — debe contener SOLO el cambio de schema
#    que se acaba de hacer, nada del historial viejo.

# 3. Crear la carpeta de migración a mano con el SQL revisado.
mkdir -p "prisma/migrations/$(date -u +%Y%m%d%H%M%S)_nombre_descriptivo"
cp /tmp/diff.sql "prisma/migrations/.../migration.sql"

# 4. Aplicar el SQL directo contra la base real.
npx prisma db execute --file "prisma/migrations/.../migration.sql" --config prisma.config.ts

# 5. Registrar la migración como aplicada (sin re-ejecutarla).
npx prisma migrate resolve --applied "<nombre_de_la_carpeta>"

# 6. Regenerar el cliente.
npx prisma generate
```

## 7. Verificación de que quedó resuelto (para cuando se arregle)

```bash
npx prisma migrate dev --name test_shadow_db_replay --create-only
```

Si esto corre sin el error `P3006`/`schema "research" does not exist`, el
historial ya se puede reproducir desde cero. Borrar la carpeta de prueba
que genera (`--create-only` no la aplica a ninguna base, solo prueba el
replay) antes de terminar.

---

# ENSAYO COMPLETO — 2026-08-20

**Nada de esto se ejecutó en producción.** Todo se probó contra copias
locales restauradas desde un backup verificado. La carpeta sigue con su
nombre original y `_prisma_migrations` de Neon está intacta.

## A. El origen — respondido

§3 pedía revisar el historial de commits como primer paso. Hecho:

- `20260813112712_ro1_statistical_discipline` y
  `20260813153349_ro1_research_os` **entraron a git en el mismo commit**,
  `1576fed` ("RO1: Research OS — full schema..."), en la misma sesión.
- `git log --diff-filter=R` sobre `prisma/migrations` no muestra **ningún
  rename** en toda la historia del repositorio.

O sea: las dos carpetas se generaron en una sola sesión de RO1, con cuatro
horas de diferencia y en el orden equivocado, y se commitearon juntas.
Nadie renombró nada después. Ningún otro archivo referencia el nombre viejo.

## B. Corrección importante a la Opción 1 de §5

**El destino propuesto en §5 no alcanza.** §5 sugiere renombrar a
`20260813153350_...`, es decir justo después de `ro1_research_os`. Eso
seguiría fallando.

`statistical_discipline` hace `ALTER TABLE` sobre tres tablas:

| Tabla que altera | La crea |
|---|---|
| `research.conclusion` | `20260813153349_ro1_research_os` |
| `research.experiment` | `20260813153349_ro1_research_os` |
| `research.variable_catalog_value` | **`20260813155334_ro1_variable_catalogs`** |

La tercera nace en `variable_catalogs`, que corre *después* de
`research_os`. El destino correcto es después de **`155334`**, no después
de `153349`. Verificado: con `20260813155335_ro1_statistical_discipline`
el replay completo pasa.

## C. Lo que se probó, y con qué resultado

| Prueba | Antes | Después |
|---|---|---|
| `migrate deploy` sobre una base vacía | falla: `schema "research" does not exist` | **40 migraciones aplican limpio** |
| Schema resultante vs. `prisma/schema.prisma` | — | **idéntico**, sin drift |
| Tablas replay vs. producción restaurada | — | idénticas; las 9 de diferencia son `neon_auth.*`, que las crea Neon, no las migraciones |
| `migrate status` tras renombrar sin tocar la tabla | historial divergente, la renombrada aparece como pendiente | — |
| `migrate status` tras el `UPDATE` | — | **limpio** |
| `migrate dev --create-only` con shadow real | bloqueado desde RO1.2 | **funciona** |

## D. Procedimiento verificado, para cuando haya luz verde

Los dos pasos van juntos, en una ventana sin escrituras concurrentes.

```bash
# 1. Renombrar la carpeta (en el repo).
git mv prisma/migrations/20260813112712_ro1_statistical_discipline \
       prisma/migrations/20260813155335_ro1_statistical_discipline

# 2. Actualizar la fila en la base REAL, en la misma operación.
#    Afecta exactamente una fila.
psql "$DATABASE_URL" -c "
update _prisma_migrations
   set migration_name = '20260813155335_ro1_statistical_discipline'
 where migration_name = '20260813112712_ro1_statistical_discipline'"

# 3. Verificar.
npx prisma migrate status          # debe decir que está al día
```

**Reversión**, si algo sale mal: el `UPDATE` inverso más `git mv` al
revés. No se borra ni se crea ninguna fila, no se toca ningún dato de
aplicación, y el SQL de la migración no cambia — sólo cambia el nombre por
el que Prisma la identifica.

**Riesgo residual.** El único momento peligroso es entre el paso 1 y el
paso 2: si algo corre `migrate deploy` ahí en medio, Prisma intentaría
aplicar la migración renombrada de nuevo y fallaría (los objetos ya
existen). Por eso van juntos y por eso conviene una ventana tranquila.
Vercel corre `migrate deploy` en el build — no desplegar durante la ventana.
