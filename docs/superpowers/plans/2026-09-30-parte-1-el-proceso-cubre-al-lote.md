# Parte 1 — El proceso cubre al lote: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar `superpowers:subagent-driven-development` (recomendada)
> o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

**Objetivo:** que toda fermentación y todo secado queden unidos al proceso que cubre a su lote, que
no haya corrida sin proceso abierto, y que bodega, ficha, tablero, cola y catas lean el proceso por
el mismo camino, buscándolo hacia arriba por el linaje.

**Arquitectura:**
- Un módulo nuevo, `lib/traceability/procesoDelLinaje.ts`, es **el único** que resuelve qué
  proceso cubre a un lote (R1). Contiene también el bloqueo del linaje y los núcleos con `tx` de
  abrir, dividir y comprobar.
- Los servicios que ya existen pasan a llamarlo dentro de sus transacciones: corridas, cierre,
  división, bodega, devolución a secado y lectores.
- Una migración añade el tipo de cierre (`moisture | divided`), el hilo entre procesos, la tabla de
  devoluciones y un índice único parcial.

**Tech stack:** Next.js 16, React 19, Prisma 7 (adaptador `pg`, cliente en `generated/prisma`),
PostgreSQL 18, Vitest 4, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md` (reglas
R1–R9). Contexto: `docs/superpowers/specs/2026-09-30-recetas-del-beneficio-design.md`. **Leer los
dos antes de la tarea 1.** El plan argumenta desde el diseño; si discrepan, manda el diseño y se
para a preguntar.

## Reglas globales (valen en todas las tareas)

- **Node:** `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` antes de cualquier `npm`/`npx`.
- **Base de pruebas propia.** Todas las pruebas corren contra
  `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas`, creada en la tarea 0.
  **Nunca** contra `nectar_test`, que es compartida por todas las sesiones.
- **Prohibido:** `npm run test:db -- reset`, `prisma migrate reset`, `prisma db push --force-reset`,
  borrar bases ajenas, y fijar `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
- **Toda orden de Prisma que escriba** lleva delante
  `DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas`. El `.env` del repo apunta a
  producción.
- **Commits:**
  - `git add` archivo por archivo; **nunca** `git add -A`.
  - Antes de commitear, `git diff --cached --stat`: contar los archivos y compararlos con la lista
    «Archivos» de la tarea.
  - El mensaje va con `git commit -F <archivo>`, y termina con
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Compuerta antes de cada commit, sin tubería:**
  `npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "tsc=$?"`, y además las pruebas que nombra la tarea.
  Leer el código de salida, no la cola.
- **Flip-test de cada guardia, DESPUÉS del commit.** El arnés restaura con `git checkout -- <archivo>`.
  Imprimir tres cosas antes del veredicto:
  1. el sha del archivo antes y después de mutar (tienen que ser distintos);
  2. que `npx tsc --noEmit` pasa con la mutación;
  3. **el nombre** de la prueba que cae.

  Sin las tres, la corrida no vale.
- **Comentarios en español,** con la fecha y la regla del diseño (R1…R9) que se implementa.
- **Códigos de error nuevos.** Todos son de `LotProcessError`, con el mensaje igual al código:
  `sin_proceso_abierto`, `lote_dividido`, `lote_mezclado`, `lote_en_bodega`,
  `proceso_no_aplica_a_miel`, `corridas_abiertas`, `division_deja_remanente`,
  `seleccion_bajo_proceso_abierto`, `fusion_bajo_proceso_abierto`, `receta_distinta_del_proceso`,
  `lineage_too_deep`, `motivo_otro_requiere_nota`.
- **Empezar una corrida no escribe ningún evento de auditoría nuevo** (R3).
- **El tope del linaje es 64 generaciones** (R1).

## Mapa de archivos

| Archivo | Qué hace en esta parte |
|---|---|
| `lib/traceability/errorDeProceso.ts` (nuevo) | `LotProcessError` y la lista de códigos traducidos |
| `lib/traceability/procesoDelLinaje.ts` (nuevo) | R1–R6: resolvedor, bloqueo, núcleos con `tx`. No importa `lots.ts` ni `lib/db` |
| `prisma/migrations/<marca>_proceso_cubre_al_lote/migration.sql` (nuevo) | tipo de cierre, hilos, devoluciones, índice parcial |
| `prisma/schema.prisma` | lo mismo, en el esquema |
| `lib/research/catalogs.ts` | catálogo `motivo_devolucion_a_secado` |
| `lib/traceability/lotProcess.ts` | `abrirProceso`/`cerrarProceso`/`devolverASecado`/`exigeSecadoTerminado` sobre el módulo nuevo; `coberturaDelLote`; reexporta el error |
| `lib/traceability/lots.ts` | ganchos de R6 en `recordTransformation`; sale `idsDeDescendencia` |
| `lib/traceability/fermentation.ts`, `drying.ts` | R3/R4 al empezar |
| `lib/traceability/storage.ts` | R7 dentro de la transacción, sólo al entrar |
| `lib/traceability/samples.ts`, `measurements.ts` | lote dividido; muestra verde |
| `lib/traceability/processTargets.ts` | R8 |
| `lib/beneficio/datosDelTablero.ts`, `colaDeSecado.ts`, `lib/sensory/sessions.ts`, `lib/equipos/equipos.ts`, `lib/traceability/reporteDeProceso.ts` | lectores por R1 |
| `app/actions/traceability.ts`, `app/components/traceability/{FermentationForm,ProcesoDelLote}.tsx`, `app/lots/[id]/{page,process/page,fermentation/new/page}.tsx`, `app/beneficio/secado/page.tsx`, `app/reports/proceso/page.tsx` | pantallas y errores |
| `messages/es.json`, `messages/en.json` | textos |
| `prisma/seed.ts`, `tests/traceability/e2e.test.ts`, `tests/traceability/e2e-cleanup.ts` | la demo y el e2e abren y cierran proceso |
| `tests/helpers/procesoDePrueba.ts` (nuevo) | abrir un proceso en pruebas y limpiarlo |
| `tests/traceability/{procesoDelLinaje,aperturaDeProceso,corridaConProceso,divisionBajoProceso,bodegaConProceso}.test.ts` (nuevos) | las reglas |
| `tests/traceability/mensajesDeProceso.test.ts`, `tests/arquitectura/proceso-por-el-resolvedor.test.ts` (nuevos, herméticos) | textos y guardia de fuente |
| `docs/arquitectura/acceso-a-datos.allowlist.json`, `docs/arquitectura/inventario-de-acceso.md`, `scripts/pruebas-por-compuerta.txt` | inventarios que los guardias exigen |

---

### Tarea 0: Preparar el árbol y una base de pruebas propia

**Archivos:** ninguno del repositorio. Sólo bases locales y un archivo de línea base en el scratchpad.

**Por qué una base propia.** La base `nectar_test` del puerto 55433 la comparten todas las sesiones.
Aplicarle la migración de esta parte cambiaría el esquema debajo de otras sesiones: sus pruebas
fallarían con errores que no son suyos (`CLAUDE.md` del repo, «La base de pruebas es compartida»).

- [ ] **Paso 1: Traer `main` al día.** La rama sólo lleva documentos.

```bash
cd ~/Developer/nectar-worktrees/recetas-base
git fetch origin main
git rebase origin/main
git log --oneline origin/main..HEAD   # deben salir SÓLO los commits de diseño
ls prisma/migrations | grep '^[0-9]' | sort | tail -3   # anotar la última: la migración nueva va DESPUÉS
```

- [ ] **Paso 2: Dependencias.**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
df -h ~ | tail -1        # hacen falta ~1,5 GB: node_modules (~0,9) y la copia de la base
npm ci > /tmp/npmci.txt 2>&1; echo "npm ci=$?"
npx prisma generate > /tmp/gen.txt 2>&1; echo "generate=$?"
```

Esperado: `npm ci=0` y `generate=0`. Si `npm ci` falla, mirar `df -h` antes que el código (`ENOSPC`).

- [ ] **Paso 3: Crear la copia propia de la base de pruebas, sin tocar la compartida.**

```bash
PGBIN=/Applications/Postgres.app/Contents/Versions/latest/bin
SCR=/private/tmp/claude-501/-Users-danielsan/02029a71-7835-4736-b245-713ece44a3e2/scratchpad
$PGBIN/pg_dump -Fc "postgresql://postgres@127.0.0.1:55433/nectar_test" -f $SCR/nectar_test.dump; echo "dump=$?"
$PGBIN/psql "postgresql://postgres@127.0.0.1:55433/postgres" -c 'CREATE DATABASE nectar_recetas'
$PGBIN/psql "postgresql://postgres@127.0.0.1:55433/postgres" -c 'CREATE DATABASE nectar_recetas_shadow'
$PGBIN/pg_restore --no-owner -d "postgresql://postgres@127.0.0.1:55433/nectar_recetas" $SCR/nectar_test.dump; echo "restore=$?"
```

`pg_dump` sólo lee: no molesta a quien use `nectar_test`. Si `pg_restore` sale distinto de 0, leer
sus errores antes de seguir; `--no-owner` evita los de propietario.

- [ ] **Paso 4: Poner la copia al día con `main` y sembrar catálogos y permisos.**

```bash
export DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas
export SHADOW_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas_shadow
npx prisma migrate deploy > /tmp/deploy.txt 2>&1; echo "deploy=$?"; grep -c 'Applying migration' /tmp/deploy.txt
npm run db:seed > /tmp/seed.txt 2>&1; echo "seed=$?"
```

Control: la fila patrón tiene que existir **antes** de creer que la base sirve.

```bash
$PGBIN/psql "$DATABASE_URL" -At -c "select count(*) from research.variable_catalog_value v join research.variable_catalog c on c.id=v.catalog_id where c.key='grado_proceso' and v.value='Washed'"
```

Esperado: `1`. Si sale `0`, la siembra no corrió: parar.

- [ ] **Paso 5: Línea base de las pruebas que esta parte va a tocar.** Sin ella, un fallo previo se
  leería como propio.

```bash
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas
npx vitest run tests/traceability/{lotProcess,fermentation,drying,e2e,samples,measurements,operations,massBalance,reports,venta-temprana,bandejasDelSecado,storage,selection,lots,recipeVersions,recipeAuthoring,reporteDeProceso}.test.ts tests/beneficio/{colaDeSecado,datos-del-tablero,entrada-del-lote}.test.ts > $SCR/linea-base.txt 2>&1; echo "vitest=$?"
grep -E 'Test Files|Tests ' $SCR/linea-base.txt
grep -E '^ (FAIL|×)' $SCR/linea-base.txt | sort -u > $SCR/linea-base-fallos.txt; wc -l < $SCR/linea-base-fallos.txt
```

Anotar el recuento. Cualquier prueba que falle aquí **no es de esta parte**. Si después falla una
distinta, sí lo es.

---

### Tarea 1: Esquema y migración — tipo de cierre, hilos, devoluciones, un abierto por lote

**Archivos:**
- Crear: `lib/traceability/errorDeProceso.ts`
- Crear: `prisma/migrations/<marca>_proceso_cubre_al_lote/migration.sql`. La marca es posterior a la
  última anotada en la tarea 0, paso 1; por ejemplo `20261001100000`.
- Modificar: `prisma/schema.prisma` (modelos `LotProcess`, `LotTransformation`,
  `VariableCatalogValue`, `StorageAssignment`, `UserAccount`, y el modelo nuevo `LotProcessReturn`)
- Modificar: `lib/research/catalogs.ts` (catálogo nuevo)
- Modificar: `lib/traceability/lotProcess.ts`:
  - el error pasa a reexportarse;
  - `cerrarProceso` escribe `closureKind`;
  - `devolverASecado` lo limpia; es provisional, hasta la tarea 8.
- Modificar: `tests/traceability/lotProcess.test.ts` (pruebas de `CHECK`)

**Interfaces:**
- Produce:
  - `LotProcessError` en `lib/traceability/errorDeProceso.ts`;
  - el enum `LotProcessClosure { moisture, divided }`;
  - los campos `LotProcess.closureKind`, `dividedByTransformationId` y `derivedFromLotProcessId`;
  - el modelo `LotProcessReturn`;
  - `CATALOGO_MOTIVO_DEVOLUCION = "motivo_devolucion_a_secado"`.

- [ ] **Paso 1: Sacar el error a su archivo.** Es lo que después deja a `lots.ts` lanzarlo sin ciclo
  de importación (§3.2 del diseño; precedente `lib/traceability/bandejaError.ts`).

Crear `lib/traceability/errorDeProceso.ts`:

```ts
/**
 * El error de todo lo que toca el proceso de un lote.
 *
 * **Vive en su propio archivo** (Parte 1, §3.2): `procesoDelLinaje.ts` y `lots.ts` lo lanzan, y
 * `lotProcess.ts` importa `lots.ts`. Si siguiera en `lotProcess.ts`, lanzarlo desde `lots.ts` cerraría
 * un ciclo de importación. Es el mismo movimiento que ya hizo `bandejaError.ts`.
 *
 * El mensaje ES el código, como siempre: las pruebas comparan `new LotProcessError("…")`.
 */
export class LotProcessError extends Error {}

/**
 * Los códigos que tienen su propio texto en `messages/*.json` (`Traceability.error_proceso_<código>`).
 * Los demás siguen saliendo por el mensaje genérico con el código como detalle.
 */
export const CODIGOS_DE_PROCESO_TRADUCIDOS = [
  "sin_proceso_abierto",
  "lote_dividido",
  "lote_mezclado",
  "lote_en_bodega",
  "proceso_no_aplica_a_miel",
  "corridas_abiertas",
  "division_deja_remanente",
  "seleccion_bajo_proceso_abierto",
  "fusion_bajo_proceso_abierto",
  "receta_distinta_del_proceso",
  "lineage_too_deep",
  "motivo_otro_requiere_nota",
  "process_already_open",
] as const;

export type CodigoDeProcesoTraducido = (typeof CODIGOS_DE_PROCESO_TRADUCIDOS)[number];
```

En `lib/traceability/lotProcess.ts`, sustituir la línea `export class LotProcessError extends Error {}`
por estas dos:

```ts
import { LotProcessError } from "./errorDeProceso";
export { LotProcessError };
```

Correr `npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "tsc=$?"`. Esperado: `tsc=0`. Ningún importador
cambia.

- [ ] **Paso 2: Escribir las pruebas de las restricciones nuevas.** Van en `lotProcess.test.ts`,
  dentro del `describe` de los `CHECK` (líneas 645 y siguientes), que ya tiene los ayudantes `crudo`
  e `insertaSql`.

Primero, **arreglar la prueba vieja** «termina antes de empezar». Con el `CHECK` nuevo, una fila con
`endedAt` y sin `closureKind` violaría dos restricciones, y Postgres comprueba los `CHECK` en orden
alfabético. Se le da el tipo y la medición para que sólo falle la fecha:

```ts
await expect(
  crudo({ endedAt: new Date("2026-02-01T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: medicionDeB }),
).rejects.toThrow(/lot_process_termina_despues_de_empezar/);
```

Después, añadir al final de ese `describe`:

```ts
it("un proceso cerrado declara cómo se cerró (Parte 1, R5/R6)", async () => {
  // Cerrado sin tipo: la base lo rechaza, no sólo el servicio.
  await expect(
    crudo({ endedAt: new Date("2026-03-21T12:00:00Z"), closingMoistureMeasurementId: medicionDeB }),
  ).rejects.toThrow(/lot_process_cierre_sii_tipo/);
  // Por humedad sin medición: rechazado.
  await expect(
    crudo({ endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture" }),
  ).rejects.toThrow(/lot_process_cierre_por_humedad_lleva_medicion/);
  // Dividido con medición: rechazado.
  await expect(
    crudo({ endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "divided", closingMoistureMeasurementId: medicionDeB, dividedByTransformationId: transformacionId }),
  ).rejects.toThrow(/lot_process_division_sin_medicion_y_con_transformacion/);
  // Control positivo: el cierre bien formado SÍ entra, y se borra.
  const bien = await crudo({ endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: medicionDeB });
  await prisma.lotProcess.delete({ where: { id: (bien as { id: string }).id } });
});

it("dos procesos abiertos en el mismo lote los rechaza la base (Parte 1, R2)", async () => {
  const primero = await crudo({});
  await expect(
    prisma.lotProcess.create({ data: {
      lotId: loteB, sequenceOrder: 97, intent: "segundo abierto", targetMoisturePct: 10.5,
      startedAt: new Date("2026-03-01T12:00:00Z"), provenanceClass: "original_record",
      processGradeValueId: valorGrado, cherryStateValueId: valorCereza,
    } }),
  ).rejects.toThrow(/lot_process_un_abierto_por_lote|Unique constraint/);
  await prisma.lotProcess.delete({ where: { id: (primero as { id: string }).id } });
});
```

`medicionDeB` es una humedad del propio `loteB`, sembrada en el `beforeAll`. Si en el archivo se
llama distinto, usar la humedad de `loteB` que ya exista allí.

- [ ] **Paso 3: Verlas fallar.**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas npx vitest run tests/traceability/lotProcess.test.ts -t "declara cómo se cerró|dos procesos abiertos" > /tmp/t1.txt 2>&1; echo "vitest=$?"; grep -E '✓|×|FAIL' /tmp/t1.txt | head
```

Esperado: las dos fallan; `closureKind` todavía no existe, así que la primera ni compila en Prisma.

- [ ] **Paso 4: El esquema.** En `prisma/schema.prisma`.

Junto a los demás enums de `traceability`:

```prisma
/// Parte 1 (2026-09-30), R5/R6: cómo se cerró un proceso. `moisture` = con la medición de humedad
/// que lo terminó; `divided` = el lote se dividió y cada parte siguió con su propio proceso.
enum LotProcessClosure {
  moisture
  divided

  @@schema("traceability")
}
```

En `model LotProcess`, detrás de `closingMoistureMeasurement`:

```prisma
  /// Parte 1, R5/R6. Nulo mientras está abierto (lo exige un CHECK de la migración).
  closureKind LotProcessClosure? @map("closure_kind")

  /// Parte 1, R6.3: la división que cerró este proceso. Sólo con `closureKind: divided`.
  dividedByTransformationId String?            @map("divided_by_transformation_id") @db.Uuid
  dividedByTransformation   LotTransformation? @relation("LotProcessDividedBy", fields: [dividedByTransformationId], references: [id], onDelete: Restrict)

  /// Parte 1, R6.4 y R7: de qué proceso viene una parte de una división o una continuación de una
  /// devolución a secado. NoAction y no Restrict: así un `deleteMany` de padre e hijo en la misma
  /// sentencia no choca consigo mismo, porque Postgres comprueba NO ACTION al final de la sentencia.
  derivedFromLotProcessId String?      @map("derived_from_lot_process_id") @db.Uuid
  derivedFrom             LotProcess?  @relation("LotProcessDerivation", fields: [derivedFromLotProcessId], references: [id], onDelete: NoAction)
  derivations             LotProcess[] @relation("LotProcessDerivation")

  returnsFromThis  LotProcessReturn[] @relation("LotProcessReturnClosed")
  returnThatOpened LotProcessReturn?  @relation("LotProcessReturnContinuation")
```

Y en sus índices, junto a los demás:

```prisma
  @@index([dividedByTransformationId])
  @@index([derivedFromLotProcessId])
```

En `model LotTransformation`, junto a `fieldEvents`:

```prisma
  lotProcessesClosedByDivision LotProcess[] @relation("LotProcessDividedBy")
```

El modelo nuevo, detrás de `LotProcessIntervention`:

```prisma
/// Parte 1, R7 (2026-09-30): devolver a secado YA NO reabre el proceso cerrado; abre una
/// continuación unida a él, y esta fila guarda por qué. Una por devolución: es lo que permite contar
/// cuántas veces pasa y por qué, que es por lo que Daniel eligió una lista de motivos.
model LotProcessReturn {
  id                       String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  closedLotProcessId       String               @map("closed_lot_process_id") @db.Uuid
  closedLotProcess         LotProcess           @relation("LotProcessReturnClosed", fields: [closedLotProcessId], references: [id], onDelete: Restrict)
  continuationLotProcessId String               @unique @map("continuation_lot_process_id") @db.Uuid
  continuationLotProcess   LotProcess           @relation("LotProcessReturnContinuation", fields: [continuationLotProcessId], references: [id], onDelete: Restrict)
  reasonValueId            String               @map("reason_value_id") @db.Uuid
  reasonValue              VariableCatalogValue @relation("LotProcessReturnReason", fields: [reasonValueId], references: [id], onDelete: Restrict)
  note                     String?
  /// La asignación de bodega que se terminó al devolver, si el lote estaba en bodega.
  endedStorageAssignmentId String?            @map("ended_storage_assignment_id") @db.Uuid
  endedStorageAssignment   StorageAssignment? @relation("LotProcessReturnEndedStorage", fields: [endedStorageAssignmentId], references: [id], onDelete: Restrict)
  occurredAt               DateTime           @map("occurred_at")
  createdAt                DateTime           @default(now()) @map("created_at")
  createdBy                String?            @map("created_by") @db.Uuid
  creator                  UserAccount?       @relation("LotProcessReturnCreatedBy", fields: [createdBy], references: [id])

  @@index([closedLotProcessId])
  @@index([reasonValueId])
  @@index([endedStorageAssignmentId])
  @@map("lot_process_return")
  @@schema("traceability")
}
```

Las relaciones inversas:
- en `VariableCatalogValue`: `returnReasonOf LotProcessReturn[] @relation("LotProcessReturnReason")`;
- en `StorageAssignment`: `endedByReturns LotProcessReturn[] @relation("LotProcessReturnEndedStorage")`;
- en `UserAccount`: `lotProcessReturnsCreated LotProcessReturn[] @relation("LotProcessReturnCreatedBy")`.

**No reformatear el archivo.** `prisma format` re-alinea ~117 líneas ajenas. Editar a mano y comprobar
con `git diff --stat prisma/schema.prisma` que el diff es sólo aditivo.

- [ ] **Paso 5: La migración.** Crear `prisma/migrations/<marca>_proceso_cubre_al_lote/migration.sql`:

```sql
-- Parte 1 (2026-09-30): el proceso cubre al lote.
-- docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md, §3.1.
--
-- Primero se CUENTA, y si los datos no permiten las restricciones nuevas se aborta: decidir qué
-- proceso sigue abierto, o con qué humedad se cerró uno, es una decisión humana que esta migración
-- no puede inventar. Es el patrón de 20260908070000_grado_y_cereza_obligatorios.
DO $$
DECLARE dobles INTEGER; cerrados_sin_medicion INTEGER; abiertos_con_medicion INTEGER;
BEGIN
  SELECT count(*) INTO dobles FROM (
    SELECT "lot_id" FROM "traceability"."lot_process" WHERE "ended_at" IS NULL GROUP BY "lot_id" HAVING count(*) > 1
  ) d;
  IF dobles > 0 THEN
    RAISE EXCEPTION 'lot_process: % lote(s) con más de un proceso abierto. Elegir cuál sigue abierto es una decisión humana.', dobles;
  END IF;
  SELECT count(*) INTO cerrados_sin_medicion FROM "traceability"."lot_process"
  WHERE "ended_at" IS NOT NULL AND "closing_moisture_measurement_id" IS NULL;
  IF cerrados_sin_medicion > 0 THEN
    RAISE EXCEPTION 'lot_process: % proceso(s) cerrados sin medición de cierre: no se puede decidir aquí cómo se cerraron.', cerrados_sin_medicion;
  END IF;
  SELECT count(*) INTO abiertos_con_medicion FROM "traceability"."lot_process"
  WHERE "ended_at" IS NULL AND "closing_moisture_measurement_id" IS NOT NULL;
  IF abiertos_con_medicion > 0 THEN
    RAISE EXCEPTION 'lot_process: % proceso(s) abiertos con medición de cierre: estado incoherente, revisarlo a mano.', abiertos_con_medicion;
  END IF;
END $$;

CREATE TYPE "traceability"."LotProcessClosure" AS ENUM ('moisture', 'divided');

ALTER TABLE "traceability"."lot_process"
  ADD COLUMN "closure_kind" "traceability"."LotProcessClosure",
  ADD COLUMN "divided_by_transformation_id" UUID,
  ADD COLUMN "derived_from_lot_process_id" UUID;

-- Todo cierre de hoy pasó por cerrarProceso, que exige la medición: son cierres por humedad.
UPDATE "traceability"."lot_process" SET "closure_kind" = 'moisture' WHERE "ended_at" IS NOT NULL;

ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_cierre_sii_tipo" CHECK (("ended_at" IS NULL) = ("closure_kind" IS NULL));
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_cierre_por_humedad_lleva_medicion"
  CHECK ("closure_kind" IS DISTINCT FROM 'moisture' OR "closing_moisture_measurement_id" IS NOT NULL);
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_division_sin_medicion_y_con_transformacion"
  CHECK ("closure_kind" IS DISTINCT FROM 'divided' OR ("closing_moisture_measurement_id" IS NULL AND "divided_by_transformation_id" IS NOT NULL));
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_medicion_solo_si_por_humedad"
  CHECK ("closing_moisture_measurement_id" IS NULL OR "closure_kind" = 'moisture');
ALTER TABLE "traceability"."lot_process"
  ADD CONSTRAINT "lot_process_transformacion_solo_si_dividido"
  CHECK ("divided_by_transformation_id" IS NULL OR "closure_kind" = 'divided');

ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_divided_by_transformation_id_fkey"
  FOREIGN KEY ("divided_by_transformation_id") REFERENCES "traceability"."lot_transformation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process" ADD CONSTRAINT "lot_process_derived_from_lot_process_id_fkey"
  FOREIGN KEY ("derived_from_lot_process_id") REFERENCES "traceability"."lot_process"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE INDEX "lot_process_divided_by_transformation_id_idx" ON "traceability"."lot_process"("divided_by_transformation_id");
CREATE INDEX "lot_process_derived_from_lot_process_id_idx" ON "traceability"."lot_process"("derived_from_lot_process_id");

-- R2: un solo proceso abierto por lote. Entre lotes del mismo linaje lo sostiene el servicio
-- (bloquearLinaje); aquí se cierra el caso del mismo lote. Va en SQL y no en el esquema, como los
-- índices parciales de `reinas` y `ruedas_sensoriales`.
CREATE UNIQUE INDEX "lot_process_un_abierto_por_lote" ON "traceability"."lot_process"("lot_id") WHERE "ended_at" IS NULL;

CREATE TABLE "traceability"."lot_process_return" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "closed_lot_process_id" UUID NOT NULL,
    "continuation_lot_process_id" UUID NOT NULL,
    "reason_value_id" UUID NOT NULL,
    "note" TEXT,
    "ended_storage_assignment_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "lot_process_return_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lot_process_return_continuation_lot_process_id_key" ON "traceability"."lot_process_return"("continuation_lot_process_id");
CREATE INDEX "lot_process_return_closed_lot_process_id_idx" ON "traceability"."lot_process_return"("closed_lot_process_id");
CREATE INDEX "lot_process_return_reason_value_id_idx" ON "traceability"."lot_process_return"("reason_value_id");
CREATE INDEX "lot_process_return_ended_storage_assignment_id_idx" ON "traceability"."lot_process_return"("ended_storage_assignment_id");
ALTER TABLE "traceability"."lot_process_return" ADD CONSTRAINT "lot_process_return_closed_lot_process_id_fkey"
  FOREIGN KEY ("closed_lot_process_id") REFERENCES "traceability"."lot_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_return" ADD CONSTRAINT "lot_process_return_continuation_lot_process_id_fkey"
  FOREIGN KEY ("continuation_lot_process_id") REFERENCES "traceability"."lot_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_return" ADD CONSTRAINT "lot_process_return_reason_value_id_fkey"
  FOREIGN KEY ("reason_value_id") REFERENCES "research"."variable_catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_return" ADD CONSTRAINT "lot_process_return_ended_storage_assignment_id_fkey"
  FOREIGN KEY ("ended_storage_assignment_id") REFERENCES "traceability"."storage_assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traceability"."lot_process_return" ADD CONSTRAINT "lot_process_return_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Paso 6: El catálogo de motivos.** En `lib/research/catalogs.ts`, como último elemento de
  `VARIABLE_CATALOGS`, antes de `] as const;`:

```ts
  // Parte 1, R7 (Daniel, 2026-09-30): de bodega sólo se vuelve a secado por un defecto de humedad, y
  // el motivo sale de una lista para poder contar cuántas veces pasa y por qué.
  {
    key: "motivo_devolucion_a_secado",
    name: "Motivo de devolución a secado",
    description: "Por qué un lote volvió a secado desde bodega o desde la entrada a bodega. «otro» exige nota.",
    values: [
      { value: "humedad_alta_por_error_de_manejo", definition: "La humedad quedó por encima del objetivo por un error en el manejo del secado." },
      { value: "error_de_medicion", definition: "La medición con la que se cerró estaba mal tomada o el instrumento fallaba." },
      { value: "otro", definition: "Siempre con nota libre." },
    ],
  },
```

En `lib/traceability/lotProcess.ts`, junto a `CATALOGO_ESTADO_CEREZA`:

```ts
/** Parte 1, R7: la lista de motivos de devolución a secado. */
export const CATALOGO_MOTIVO_DEVOLUCION = "motivo_devolucion_a_secado";
```

- [ ] **Paso 7: Escritura mínima del tipo de cierre, para que nada choque con el `CHECK`.**

En `cerrarProceso`, el `update` pasa a escribir el tipo:

```ts
      data: { endedAt: input.endedAt, closingMoistureMeasurementId: input.closingMoistureMeasurementId, closureKind: "moisture" },
```

En su auditoría, añadir `closureKind: cerrado.closureKind,` dentro de `after`.

En `devolverASecado`, **provisional hasta la tarea 8**, el `update` limpia el tipo junto con la
medición:

```ts
      data: { endedAt: null, closingMoistureMeasurementId: null, closureKind: null },
```

Comprobar que nada más escribe `endedAt` en `lot_process`. **Imprimir el recuento con su control:**

```bash
echo "escrituras de endedAt en lotProcess fuera de lotProcess.ts:"; git grep -n "lotProcess.update" -- lib app scripts prisma | grep -v 'lib/traceability/lotProcess.ts' | wc -l
echo "control (en lotProcess.ts deben salir 4):"; git grep -c "lotProcess.update" -- lib/traceability/lotProcess.ts
```

Esperado: `0` fuera y `4` dentro (objetivo, intención, cierre y devolución). Si fuera sale algo,
también tiene que escribir `closureKind`.

- [ ] **Paso 8: Aplicar a la base propia y regenerar.**

```bash
export DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas
export SHADOW_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas_shadow
npx prisma migrate deploy > /tmp/deploy.txt 2>&1; echo "deploy=$?"; grep 'proceso_cubre_al_lote' /tmp/deploy.txt
npx prisma generate > /tmp/gen.txt 2>&1; echo "generate=$?"
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script > /tmp/diff.sql 2>&1; echo "diff=$?"; wc -l < /tmp/diff.sql
npm run db:seed > /tmp/seed.txt 2>&1; echo "seed=$?"
```

Esperado:
- `deploy=0`, nombrando la migración;
- `generate=0`;
- un diff que sólo puede mencionar el índice parcial y los `CHECK`, que viven en SQL y no en el
  esquema;
- `seed=0`.

Si el diff nombra columnas o tablas, el esquema y el SQL no casan: corregir antes de seguir.

- [ ] **Paso 9: Verlas pasar.**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas npx vitest run tests/traceability/lotProcess.test.ts > /tmp/t1.txt 2>&1; echo "vitest=$?"; grep -E 'Test Files|Tests ' /tmp/t1.txt
```

Esperado: todo el archivo en verde, con las dos pruebas nuevas.

- [ ] **Paso 10: Comprobar UNA vez a mano que la migración aborta.** Esto no puede ser una prueba
  permanente: las restricciones nuevas impiden fabricar después las filas malas (§4 del diseño).

```bash
PGBIN=/Applications/Postgres.app/Contents/Versions/latest/bin
B=postgresql://postgres@127.0.0.1:55433
$PGBIN/psql "$B/postgres" -c 'CREATE DATABASE nectar_aborto'
mkdir -p /tmp/mig-aborto && cp -R prisma/migrations /tmp/mig-aborto/ && rm -rf /tmp/mig-aborto/migrations/*_proceso_cubre_al_lote
# migrar SÓLO hasta la anterior: con un prisma.config temporal que apunte a /tmp/mig-aborto/migrations,
# o aplicando los SQL en orden con psql. Después sembrar dos abiertos en un lote:
$PGBIN/psql "$B/nectar_aborto" -c "insert into traceability.lot_process (lot_id, sequence_order, intent, target_moisture_pct, started_at, provenance_class, process_grade_value_id, cherry_state_value_id) values ('<lote>', 1, 'a', 11, now(), 'original_record', '<grado>', '<cereza>'), ('<lote>', 2, 'b', 11, now(), 'original_record', '<grado>', '<cereza>')"
$PGBIN/psql "$B/nectar_aborto" -f prisma/migrations/<marca>_proceso_cubre_al_lote/migration.sql; echo "salida=$?"
$PGBIN/psql "$B/postgres" -c 'DROP DATABASE nectar_aborto'
```

Esperado: `salida` distinta de 0, con el mensaje «más de un proceso abierto». Anotar el resultado en
el mensaje del commit. Si no se pudo montar, decirlo así en el commit; no darlo por comprobado.

- [ ] **Paso 11: Compuerta y commit.**

```bash
npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "tsc=$?"
git add lib/traceability/errorDeProceso.ts lib/traceability/lotProcess.ts lib/research/catalogs.ts prisma/schema.prisma prisma/migrations/<marca>_proceso_cubre_al_lote/migration.sql tests/traceability/lotProcess.test.ts
git diff --cached --stat     # 6 archivos
git commit -F /tmp/msg-t1.txt
```

---

### Tarea 2: El resolvedor del linaje (R1) y el bloqueo

**Archivos:**
- Crear: `lib/traceability/procesoDelLinaje.ts`
- Modificar: `lib/traceability/lots.ts`. Se borra `idsDeDescendencia`; sus dos llamadores están en
  `lotProcess.ts`.
- Modificar: `lib/traceability/lotProcess.ts`. Sus dos llamadas a `idsDeDescendencia` pasan al
  módulo nuevo.
- Crear: `tests/traceability/procesoDelLinaje.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt` (la prueba nueva va en `base-sembrada`)
- Modificar: `docs/arquitectura/acceso-a-datos.allowlist.json` y, si lo pide el guardia,
  `docs/arquitectura/inventario-de-acceso.md`

**Interfaces:**
- Consume: `LotProcessError` (tarea 1) y `Prisma.TransactionClient`.
- Produce, en `procesoDelLinaje.ts`:
  - `TOPE_DE_LINAJE = 64`;
  - los tipos `Cobertura`, `ProcesoEnCadena` y `Composicion`;
  - `procesoQueCubre(tx, lotId): Promise<Cobertura>`;
  - `idsDeAscendencia(tx, lotId): Promise<string[]>` e `idsDeDescendencia(tx, lotId): Promise<string[]>`;
  - `bloquearLinaje(tx, lotId): Promise<void>` y `bloquearLinajes(tx, lotIds): Promise<void>`;
  - `loteDividido(tx, lotId): Promise<boolean>`;
  - `procesosParaEntrada(tx, lotId): Promise<{ endedAt: Date | null; gradoDeProceso: string | null }[]>`;
  - `gradoDelProcesoQueCubre(tx, lotId): Promise<string | null>`.

- [ ] **Paso 1: Escribir las pruebas.** Crear `tests/traceability/procesoDelLinaje.test.ts`:

```ts
/**
 * R1 de la Parte 1: el proceso que cubre a un lote se busca HACIA ARRIBA por su linaje.
 * docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md
 *
 * Linajes armados a mano —lotes y transformaciones crudas, sin servicios— porque lo que se prueba es
 * el recorrido, no los permisos. Los procesos también se insertan crudos, con los valores de catálogo
 * REALES de la base sembrada (Washed, despulpada): no hay valores de prueba que limpiar.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import {
  procesoQueCubre, idsDeAscendencia, idsDeDescendencia, loteDividido, procesosParaEntrada,
  gradoDelProcesoQueCubre, TOPE_DE_LINAJE,
} from "../../lib/traceability/procesoDelLinaje";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `linaje-${Date.now()}`;
let orgId: string;
let plotId: string;
let valorGrado: string;
let valorCereza: string;
const lotes: string[] = [];
const transformaciones: string[] = [];
const mediciones: string[] = [];

async function valor(catalogo: string, v: string): Promise<string> {
  return (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: v, catalog: { key: catalogo } }, select: { id: true } })).id;
}

async function lote(codigo: string, lotType: "cherry" | "processing" | "parchment" | "green" | "honey" = "cherry"): Promise<string> {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType, organizationId: orgId, locationId: plotId, status: "approved", classification: "internal",
  } })).id;
  lotes.push(id);
  return id;
}

async function enlazar(tipo: "stage_change" | "split" | "merge", padres: string[], hijos: string[]): Promise<string> {
  const t = await prisma.lotTransformation.create({ data: {
    transformationType: tipo, occurredAt: new Date("2026-03-05T12:00:00Z"), provenanceClass: "original_record",
    inputs: { create: padres.map((lotId) => ({ lotId })) },
    outputs: { create: hijos.map((lotId) => ({ lotId })) },
  } });
  transformaciones.push(t.id);
  return t.id;
}

async function proceso(lotId: string, estado: "abierto" | "cerrado", sequenceOrder = 1): Promise<string> {
  let medicion: string | null = null;
  if (estado === "cerrado") {
    medicion = (await prisma.measurement.create({ data: {
      variable: "moisture", value: 10.5, unit: "%", occurredAt: new Date("2026-03-20T12:00:00Z"), lotId, provenanceClass: "measured_fact",
    } })).id;
    mediciones.push(medicion);
  }
  return (await prisma.lotProcess.create({ data: {
    lotId, sequenceOrder, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
    provenanceClass: "original_record", processGradeValueId: valorGrado, cherryStateValueId: valorCereza,
    ...(estado === "cerrado"
      ? { endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture" as const, closingMoistureMeasurementId: medicion }
      : {}),
  } })).id;
}

/** Una cadena de `n` lotes, cada uno hijo del anterior. Devuelve los ids de arriba abajo. */
async function cadena(prefijo: string, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await lote(`${prefijo}${i}`));
  for (let i = 1; i < n; i++) await enlazar("stage_change", [ids[i - 1]!], [ids[i]!]);
  return ids;
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  valorGrado = await valor("grado_proceso", "Washed");
  valorCereza = await valor("estado_cereza", "despulpada");
}, 60000);

afterAll(async () => {
  await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: mediciones } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformaciones } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("R1 — el proceso que cubre a un lote", () => {
  it("un lote con su propio proceso abierto lo tiene vigente", async () => {
    const l = await lote("PROPIO");
    const p = await proceso(l, "abierto");
    const c = await procesoQueCubre(prisma, l);
    expect(c.estado).toBe("abierto");
    expect(c.vigente?.id).toBe(p);
    expect(c.cadena.map((x) => x.id)).toEqual([p]);
  });

  it("el pergamino encuentra el proceso de la cereza, dos generaciones arriba", async () => {
    const [cereza, fermentado, pergamino] = await cadena("PERG", 3);
    const p = await proceso(cereza!, "abierto");
    const c = await procesoQueCubre(prisma, pergamino!);
    expect(c.estado).toBe("abierto");
    expect(c.vigente?.id).toBe(p);
    expect(c.vigente?.lotId).toBe(cereza);
    expect(c.vigente?.profundidad).toBe(2);
    expect(fermentado).toBeDefined();
  });

  it("sin proceso en ninguna rama es sin_proceso", async () => {
    const l = await lote("SOLO");
    const c = await procesoQueCubre(prisma, l);
    expect(c.estado).toBe("sin_proceso");
    expect(c.vigente).toBeNull();
  });

  it("reproceso: el verde tiene P2 vigente y P1 en la cadena", async () => {
    const [cereza, pergamino, verde] = await cadena("REPRO", 3);
    const p1 = await proceso(cereza!, "cerrado");
    const p2 = await proceso(pergamino!, "abierto");
    const c = await procesoQueCubre(prisma, verde!);
    expect(c.vigente?.id).toBe(p2);
    expect(c.cadena.map((x) => x.id)).toEqual([p2, p1]);
  });

  it("una fusión de ramas con procesos distintos es mezcla, aunque una rama llegue antes", async () => {
    const a = await lote("MEZ-A");
    const pa = await proceso(a, "cerrado");
    const [b, b1] = await cadena("MEZ-B", 2);
    const pb = await proceso(b!, "cerrado");
    const m = await lote("MEZ-M");
    await enlazar("merge", [a, b1!], [m]);
    const c = await procesoQueCubre(prisma, m);
    expect(c.estado).toBe("mezcla");
    expect(c.vigente).toBeNull();
    expect(c.composicion?.procesos.map((x) => x.id).sort()).toEqual([pa, pb].sort());
  });

  it("una fusión con una rama sin proceso es mezcla, y lo dice", async () => {
    const a = await lote("MEZ2-A");
    await proceso(a, "cerrado");
    const z = await lote("MEZ2-Z");
    const m = await lote("MEZ2-M");
    await enlazar("merge", [a, z], [m]);
    const c = await procesoQueCubre(prisma, m);
    expect(c.estado).toBe("mezcla");
    expect(c.composicion?.ramaSinProceso).toBe(true);
  });

  it("si el lote tiene dos procesos, el vigente es el más reciente y el otro va en la cadena", async () => {
    const l = await lote("DOS");
    const p1 = await proceso(l, "cerrado", 1);
    const p2 = await proceso(l, "abierto", 2);
    const c = await procesoQueCubre(prisma, l);
    expect(c.vigente?.id).toBe(p2);
    expect(c.cadena.map((x) => x.id)).toEqual([p2, p1]);
  });

  it("un diamante que vuelve al mismo proceso no es mezcla", async () => {
    const raiz = await lote("DIA-R");
    const p = await proceso(raiz, "abierto");
    const s1 = await lote("DIA-S1");
    const s2 = await lote("DIA-S2");
    await enlazar("split", [raiz], [s1, s2]);
    const d = await lote("DIA-D");
    await enlazar("merge", [s1, s2], [d]);
    const c = await procesoQueCubre(prisma, d);
    expect(c.estado).toBe("abierto");
    expect(c.vigente?.id).toBe(p);
    const arriba = await idsDeAscendencia(prisma, d);
    expect([...arriba].sort()).toEqual([raiz, s1, s2].sort());
  });

  it(`un linaje que pasa del tope (${TOPE_DE_LINAJE}) lanza en vez de decir «sin proceso»`, async () => {
    const ids = await cadena("HONDO", TOPE_DE_LINAJE + 2);
    const ultimo = ids[ids.length - 1]!;
    await expect(procesoQueCubre(prisma, ultimo)).rejects.toThrow(new LotProcessError("lineage_too_deep"));
    await expect(idsDeAscendencia(prisma, ultimo)).rejects.toThrow(new LotProcessError("lineage_too_deep"));
  }, 120000);

  it("la descendencia pasa de 12 generaciones sin cortarse en silencio", async () => {
    const ids = await cadena("ABAJO", 15);
    const abajo = await idsDeDescendencia(prisma, ids[0]!);
    expect(abajo).toHaveLength(14);
  }, 60000);

  it("un lote es «dividido» sólo si es la entrada de una división que cerró un proceso", async () => {
    const x = await lote("DIV-X");
    const x1 = await lote("DIV-X1");
    const x2 = await lote("DIV-X2");
    const t = await enlazar("split", [x], [x1, x2]);
    await prisma.lotProcess.create({ data: {
      lotId: x, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: valorGrado, cherryStateValueId: valorCereza,
      endedAt: new Date("2026-03-05T12:00:00Z"), closureKind: "divided", dividedByTransformationId: t,
    } });
    expect(await loteDividido(prisma, x)).toBe(true);
    expect(await loteDividido(prisma, x1)).toBe(false);
  });

  it("ficha y tablero reciben lo mismo: el grado del vigente, también para un hijo", async () => {
    const [cereza, hijo] = await cadena("ENTRADA", 2);
    await proceso(cereza!, "abierto");
    expect(await procesosParaEntrada(prisma, hijo!)).toEqual([{ endedAt: null, gradoDeProceso: "Washed" }]);
    expect(await gradoDelProcesoQueCubre(prisma, hijo!)).toBe("Washed");
  });
});
```

En `scripts/pruebas-por-compuerta.txt`, añadir dentro del grupo `# @grupo: base-sembrada`, junto a
`tests/traceability/lotProcess.test.ts`:

```
tests/traceability/procesoDelLinaje.test.ts
```

- [ ] **Paso 2: Verlas fallar.**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas npx vitest run tests/traceability/procesoDelLinaje.test.ts > /tmp/t2.txt 2>&1; echo "vitest=$?"; grep -E 'Cannot find|Failed to load|FAIL' /tmp/t2.txt | head -3
```

Esperado: falla al cargar porque el módulo no existe.

- [ ] **Paso 3: El módulo.** Crear `lib/traceability/procesoDelLinaje.ts`:

```ts
/**
 * El proceso que cubre a un lote, buscado hacia arriba por su linaje — Parte 1, R1.
 * docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md
 *
 * **Por qué existe.** El proceso se abre sobre el lote aceptado (decisión de Daniel, 2026-09-19), y
 * cada corrida que termina crea un lote NUEVO: el secado ocurre en el hijo, la bodega guarda al
 * nieto, la taza sale del verde. Todo lo que buscaba el proceso «en el propio lote» dejaba de verlo
 * a la primera generación. Daniel eligió que el lote lo busque HACIA ARRIBA, sin guardar nada nuevo
 * en el lote: así la respuesta no puede contradecir al linaje.
 *
 * **Es el único que resuelve esto.** Un guardia de arquitectura (`proceso-por-el-resolvedor`) prohíbe
 * leer los procesos de un lote por `lotId` fuera de aquí.
 *
 * **No importa `lots.ts` ni `lib/db`.** Recibe el cliente por parámetro —el de una transacción, o el
 * global si quien llama sólo lee— y por eso `lots.ts` puede llamarlo sin ciclo. Nada de aquí
 * autoriza: quien llama ya autorizó.
 */
import type { Prisma } from "../../generated/prisma/client";
import { LotProcessError } from "./errorDeProceso";

/** R1: 64 generaciones en las dos direcciones. Un multiproceso real tiene unas diez. */
export const TOPE_DE_LINAJE = 64;

export type OrigenDelProceso = "original" | "parte_de_division" | "continuacion";

export interface ProcesoEnCadena {
  readonly id: string;
  readonly lotId: string;
  /** Generaciones entre el lote consultado y el lote donde vive este proceso. 0 = el propio lote. */
  readonly profundidad: number;
  readonly sequenceOrder: number;
  readonly endedAt: Date | null;
  readonly closureKind: "moisture" | "divided" | null;
  readonly derivedFromLotProcessId: string | null;
  readonly origen: OrigenDelProceso;
}

export interface Composicion {
  /** Los procesos distintos a los que llegan las ramas. */
  readonly procesos: readonly ProcesoEnCadena[];
  /** Alguna rama llegó a una raíz sin pasar por ningún proceso. */
  readonly ramaSinProceso: boolean;
}

export type Cobertura =
  | { readonly estado: "sin_proceso"; readonly vigente: null; readonly cadena: readonly ProcesoEnCadena[]; readonly composicion: null }
  | { readonly estado: "abierto" | "cerrado"; readonly vigente: ProcesoEnCadena; readonly cadena: readonly ProcesoEnCadena[]; readonly composicion: null }
  | { readonly estado: "mezcla"; readonly vigente: null; readonly cadena: readonly ProcesoEnCadena[]; readonly composicion: Composicion };

const SELECCION = {
  id: true,
  lotId: true,
  sequenceOrder: true,
  endedAt: true,
  closureKind: true,
  derivedFromLotProcessId: true,
  returnThatOpened: { select: { id: true } },
} as const;

type FilaDeProceso = {
  id: string;
  lotId: string;
  sequenceOrder: number;
  endedAt: Date | null;
  closureKind: "moisture" | "divided" | null;
  derivedFromLotProcessId: string | null;
  returnThatOpened: { id: string } | null;
};

function enCadena(p: FilaDeProceso, profundidad: number): ProcesoEnCadena {
  return {
    id: p.id,
    lotId: p.lotId,
    profundidad,
    sequenceOrder: p.sequenceOrder,
    endedAt: p.endedAt,
    closureKind: p.closureKind,
    derivedFromLotProcessId: p.derivedFromLotProcessId,
    origen: p.derivedFromLotProcessId === null ? "original" : p.returnThatOpened ? "continuacion" : "parte_de_division",
  };
}

/** Los padres directos de cada lote: las entradas de las transformaciones que lo produjeron. */
async function padresDe(tx: Prisma.TransactionClient, lotIds: readonly string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (lotIds.length === 0) return mapa;
  const salidas = await tx.lotTransformationOutput.findMany({
    where: { lotId: { in: [...lotIds] } },
    select: { lotId: true, transformation: { select: { inputs: { select: { lotId: true } } } } },
  });
  for (const s of salidas) {
    const acc = mapa.get(s.lotId) ?? [];
    for (const i of s.transformation.inputs) if (!acc.includes(i.lotId)) acc.push(i.lotId);
    mapa.set(s.lotId, acc);
  }
  return mapa;
}

/** Los hijos directos: las salidas de las transformaciones en las que estos lotes entraron. */
async function hijosDe(tx: Prisma.TransactionClient, lotIds: readonly string[]): Promise<string[]> {
  if (lotIds.length === 0) return [];
  const entradas = await tx.lotTransformationInput.findMany({
    where: { lotId: { in: [...lotIds] } },
    select: { transformation: { select: { outputs: { select: { lotId: true } } } } },
  });
  return entradas.flatMap((e) => e.transformation.outputs.map((o) => o.lotId));
}

/**
 * Todos los ancestros del lote, sin él. Recorre por niveles con un conjunto de vistos: un diamante
 * —dividir y volver a juntar— no multiplica caminos, que es lo que hacía el `UNION ALL` de antes.
 * **Lanza al pasar el tope**: un recorrido cortado que respondiera «no hay más» se leería como
 * ausencia, y es justo el cero que significa «no miré».
 */
export async function idsDeAscendencia(tx: Prisma.TransactionClient, lotId: string): Promise<string[]> {
  const vistos = new Set<string>([lotId]);
  let frontera = [lotId];
  for (let nivel = 0; frontera.length > 0; nivel++) {
    if (nivel >= TOPE_DE_LINAJE) throw new LotProcessError("lineage_too_deep");
    const padres = await padresDe(tx, frontera);
    const siguiente: string[] = [];
    for (const ps of padres.values()) {
      for (const p of ps) {
        if (!vistos.has(p)) {
          vistos.add(p);
          siguiente.push(p);
        }
      }
    }
    frontera = siguiente;
  }
  vistos.delete(lotId);
  return [...vistos];
}

/**
 * Todos los descendientes, sin él. Antes vivía en `lots.ts` con un tope de 12 que cortaba EN
 * SILENCIO (R1): un multiproceso largo dejaba fuera a un descendiente con un proceso abierto.
 */
export async function idsDeDescendencia(tx: Prisma.TransactionClient, lotId: string): Promise<string[]> {
  const vistos = new Set<string>([lotId]);
  let frontera = [lotId];
  for (let nivel = 0; frontera.length > 0; nivel++) {
    if (nivel >= TOPE_DE_LINAJE) throw new LotProcessError("lineage_too_deep");
    const hijos = await hijosDe(tx, frontera);
    const siguiente: string[] = [];
    for (const h of hijos) {
      if (!vistos.has(h)) {
        vistos.add(h);
        siguiente.push(h);
      }
    }
    frontera = siguiente;
  }
  vistos.delete(lotId);
  return [...vistos];
}

/** Lo que había ANTES del vigente: procesos anteriores del mismo lote y todos los de arriba. */
async function historiaArriba(tx: Prisma.TransactionClient, vigente: ProcesoEnCadena): Promise<ProcesoEnCadena[]> {
  const historia: ProcesoEnCadena[] = [];
  const delMismoLote = await tx.lotProcess.findMany({
    where: { lotId: vigente.lotId, sequenceOrder: { lt: vigente.sequenceOrder } },
    orderBy: { sequenceOrder: "desc" },
    select: SELECCION,
  });
  historia.push(...delMismoLote.map((p) => enCadena(p, vigente.profundidad)));

  const vistos = new Set<string>([vigente.lotId]);
  let frontera = [vigente.lotId];
  for (let nivel = vigente.profundidad + 1; frontera.length > 0; nivel++) {
    const padres = await padresDe(tx, frontera);
    const siguiente: string[] = [];
    for (const ps of padres.values()) {
      for (const p of ps) {
        if (!vistos.has(p)) {
          vistos.add(p);
          siguiente.push(p);
        }
      }
    }
    if (siguiente.length === 0) break;
    if (nivel > TOPE_DE_LINAJE) throw new LotProcessError("lineage_too_deep");
    const procesos = await tx.lotProcess.findMany({
      where: { lotId: { in: siguiente } },
      orderBy: { sequenceOrder: "desc" },
      select: SELECCION,
    });
    historia.push(...procesos.map((p) => enCadena(p, nivel)));
    frontera = siguiente;
  }
  return historia;
}

/**
 * R1. Cada rama sube por su cuenta hasta el primer lote —él incluido— que tenga algún proceso, y toma
 * el más reciente de ese lote.
 * - Si todas las ramas llegan al MISMO proceso, ése es el vigente.
 * - Si llegan a procesos distintos, o alguna termina en una raíz sin proceso, es una **mezcla**, y se
 *   devuelve su composición. Nunca se elige uno: «nunca se toma el valor del primer padre»
 *   (`20_modelo_ciclo_completo.md` §1.3).
 * - Sólo es `sin_proceso` si TODAS las ramas terminaron en raíces sin ninguno.
 */
export async function procesoQueCubre(tx: Prisma.TransactionClient, lotId: string): Promise<Cobertura> {
  const encontrados = new Map<string, ProcesoEnCadena>();
  let ramaSinProceso = false;
  const vistos = new Set<string>([lotId]);
  let frontera = [lotId];

  for (let nivel = 0; frontera.length > 0; nivel++) {
    if (nivel >= TOPE_DE_LINAJE) throw new LotProcessError("lineage_too_deep");
    const procesos = await tx.lotProcess.findMany({
      where: { lotId: { in: frontera } },
      orderBy: { sequenceOrder: "desc" },
      select: SELECCION,
    });
    const conProceso = new Set<string>();
    for (const p of procesos) {
      if (conProceso.has(p.lotId)) continue; // el primero de cada lote es el más reciente
      conProceso.add(p.lotId);
      encontrados.set(p.id, enCadena(p, nivel));
    }
    const sinProceso = frontera.filter((id) => !conProceso.has(id));
    const padres = await padresDe(tx, sinProceso);
    const siguiente: string[] = [];
    for (const id of sinProceso) {
      const ps = padres.get(id) ?? [];
      if (ps.length === 0) ramaSinProceso = true;
      for (const p of ps) {
        if (!vistos.has(p)) {
          vistos.add(p);
          siguiente.push(p);
        }
      }
    }
    frontera = siguiente;
  }

  const distintos = [...encontrados.values()];
  if (distintos.length === 0) return { estado: "sin_proceso", vigente: null, cadena: [], composicion: null };
  if (distintos.length > 1 || ramaSinProceso) {
    return { estado: "mezcla", vigente: null, cadena: [], composicion: { procesos: distintos, ramaSinProceso } };
  }
  const vigente = distintos[0]!;
  const cadena = [vigente, ...(await historiaArriba(tx, vigente))];
  return { estado: vigente.endedAt === null ? "abierto" : "cerrado", vigente, cadena, composicion: null };
}

/**
 * R2 — concurrencia. Bloquea con `FOR UPDATE` las filas de `lot` del lote y de TODOS sus ancestros,
 * en orden de id. Dos operaciones sobre el mismo café comparten siempre al menos una fila —el
 * ancestro común, o el propio lote—, así que se ejecutan en fila; el orden fijo evita
 * interbloqueos. Los ancestros de un lote no cambian nunca después de crearlo (una transformación
 * sólo añade hijos), así que se pueden calcular antes de bloquear.
 *
 * No es `Serializable`: `lib/apiary/cierreDeCosecha.ts` documenta que eso abortó transacciones ajenas
 * que sólo compartían tabla, y la casa prefirió bloquear filas.
 */
export async function bloquearLinaje(tx: Prisma.TransactionClient, lotId: string): Promise<void> {
  await bloquearLinajes(tx, [lotId]);
}

export async function bloquearLinajes(tx: Prisma.TransactionClient, lotIds: readonly string[]): Promise<void> {
  const todos = new Set<string>();
  for (const id of lotIds) {
    todos.add(id);
    for (const a of await idsDeAscendencia(tx, id)) todos.add(a);
  }
  for (const id of [...todos].sort()) {
    await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${id}::uuid FOR UPDATE`;
  }
}

/**
 * R6.6. Un lote es «dividido» si es la entrada de una división que cerró un proceso. Lo deciden
 * TODAS las reglas que lo rechazan por esta función, y no por cuatro consultas sueltas que puedan
 * divergir.
 */
export async function loteDividido(tx: Prisma.TransactionClient, lotId: string): Promise<boolean> {
  const p = await tx.lotProcess.findFirst({
    where: { closureKind: "divided", dividedByTransformation: { inputs: { some: { lotId } } } },
    select: { id: true },
  });
  return p !== null;
}

/**
 * R7. Lo que `entradaDelLote` recibe como `procesos`, IGUAL para la ficha y para el tablero: el
 * vigente del lote. Antes cada uno armaba la suya —la ficha con los procesos propios, el tablero con
 * el de la corrida— y por eso podían discrepar. Una mezcla no tiene grado: lista vacía.
 */
export async function procesosParaEntrada(
  tx: Prisma.TransactionClient,
  lotId: string,
): Promise<{ endedAt: Date | null; gradoDeProceso: string | null }[]> {
  const cobertura = await procesoQueCubre(tx, lotId);
  if (!cobertura.vigente) return [];
  const p = await tx.lotProcess.findUniqueOrThrow({
    where: { id: cobertura.vigente.id },
    select: { endedAt: true, processGradeValue: { select: { value: true } } },
  });
  return [{ endedAt: p.endedAt, gradoDeProceso: p.processGradeValue.value }];
}

/** El grado del proceso que cubre al lote, o null (sin proceso, o mezcla). Para la lista de catas. */
export async function gradoDelProcesoQueCubre(tx: Prisma.TransactionClient, lotId: string): Promise<string | null> {
  const [p] = await procesosParaEntrada(tx, lotId);
  return p?.gradoDeProceso ?? null;
}
```

- [ ] **Paso 4: Sacar `idsDeDescendencia` de `lots.ts` y apuntar a sus dos llamadores.**

En `lib/traceability/lots.ts`, borrar la función `idsDeDescendencia` entera, con su comentario.

En `lib/traceability/lotProcess.ts`:
- cambiar `import { idsDeDescendencia, requireLotAccess } from "./lots";` por
  `import { requireLotAccess } from "./lots";`;
- añadir `import { idsDeDescendencia } from "./procesoDelLinaje";`;
- en `cerrarProceso`, cambiar `await idsDeDescendencia(proceso.lotId)` por
  `await idsDeDescendencia(prisma, proceso.lotId)`;
- en `opcionesParaProceso`, cambiar `idsDeDescendencia(lotId).then(` por
  `idsDeDescendencia(prisma, lotId).then(`.

Comprobar que no queda ningún otro llamador:

```bash
echo "llamadores de idsDeDescendencia:"; git grep -n 'idsDeDescendencia(' -- lib app scripts prisma tests | grep -v 'procesoDelLinaje.ts'
```

Esperado: sólo las dos líneas de `lotProcess.ts` y las de la prueba nueva.

- [ ] **Paso 5: Verlas pasar.**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas npx vitest run tests/traceability/procesoDelLinaje.test.ts tests/traceability/lotProcess.test.ts > /tmp/t2.txt 2>&1; echo "vitest=$?"; grep -E 'Test Files|Tests ' /tmp/t2.txt
```

Esperado: todo en verde. La prueba del tope crea 66 lotes; con su `timeout` de 120 s cabe.

- [ ] **Paso 6: Inventarios de acceso.** Correr los guardias y añadir **exactamente** las entradas que
  pidan.

```bash
npx vitest run tests/arquitectura/acceso-a-datos.test.ts tests/arquitectura/cifras-del-inventario.test.ts > /tmp/acc.txt 2>&1; echo "vitest=$?"; grep -E '×|Expected|falt|sobra' /tmp/acc.txt | head -30
node scripts/inventario-de-acceso.mjs --json > /tmp/inv.json; node -e 'const j=require("/tmp/inv.json"); console.log(JSON.stringify(j.filter? j.filter(o=>/procesoDelLinaje|lotProcess|lots\.ts/.test(o.archivo)) : j, null, 1))' | head -80
```

Qué entradas se esperan en `docs/arquitectura/acceso-a-datos.allowlist.json`, con su `razon`:

- **`reciben_transaccion`:** `{ "archivo": "lib/traceability/procesoDelLinaje.ts", "razon": "Parte 1 (2026-09-30), R1: el resolvedor del proceso que cubre a un lote y el bloqueo del linaje. No abre conexión: recibe el cliente de la transacción del llamador, o el global si el llamador sólo lee. Nada de aquí autoriza; todos sus llamadores ya hicieron requireLotAccess sobre el lote." }`
- **`dependen_del_llamador`:** una entrada por cada operación de `procesoDelLinaje.ts` que el inventario
  clasifique así (`procesoQueCubre`, `idsDeAscendencia`, `idsDeDescendencia`, `bloquearLinaje`,
  `bloquearLinajes`, `loteDividido`, `procesosParaEntrada` y `gradoDelProcesoQueCubre`). Cada una con
  `"verificado": "<fecha de hoy>"` y una razón que nombre a sus llamadores autorizados, por ejemplo:
  `"Lee el linaje y los procesos de un lote para decidir cuál lo cubre (R1). No expone nada por sí
  misma: sus llamadores (servicios de lotProcess, corridas, bodega, lectores) ya autorizaron el lote."`
- **Quitar** la entrada de `lib/traceability/lots.ts` / `idsDeDescendencia`, porque la función ya no
  vive allí.

Si `cifras-del-inventario` pide cifras nuevas en `docs/arquitectura/inventario-de-acceso.md`, poner
las que el propio guardia imprime.

- [ ] **Paso 7: Compuerta, commit y flip-test.**

```bash
npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "tsc=$?"
npx vitest run tests/arquitectura > /tmp/arq.txt 2>&1; echo "arq=$?"; grep -E 'Test Files|Tests ' /tmp/arq.txt
git add lib/traceability/procesoDelLinaje.ts lib/traceability/lots.ts lib/traceability/lotProcess.ts tests/traceability/procesoDelLinaje.test.ts scripts/pruebas-por-compuerta.txt docs/arquitectura/acceso-a-datos.allowlist.json
git diff --cached --stat
git commit -F /tmp/msg-t2.txt
```

Flip-tests, cada uno sobre el commit y restaurado con `git checkout -- lib/traceability/procesoDelLinaje.ts`:

| Mutación en `procesoDelLinaje.ts` | Debe caer |
|---|---|
| en `procesoQueCubre`, `if (distintos.length > 1 \|\| ramaSinProceso)` → `if (false)` | «…procesos distintos es mezcla…» |
| en `procesoQueCubre`, devolver `cadena: [vigente]` | «reproceso: el verde tiene P2…» |
| en `idsDeAscendencia`, `throw new LotProcessError("lineage_too_deep")` → `return [...vistos]` | «un linaje que pasa del tope…» |
| en `procesoQueCubre`, `orderBy: { sequenceOrder: "desc" }` → `"asc"` | «si el lote tiene dos procesos, el vigente es el más reciente…» |

*(Que el diamante no multiplique caminos no tiene flip-test: las funciones devuelven un conjunto, así
que quitar la deduplicación no cambia ninguna salida, sólo el coste. Se dice aquí para que nadie
cuente esa prueba como su guardia.)*

---

### Tarea 3: Abrir un proceso — un solo proceso abierto por café (R2)

**Archivos:**
- Modificar: `lib/traceability/procesoDelLinaje.ts` (`exigeSinOtroProcesoAbierto`, `abrirProcesoEnTx`)
- Modificar: `lib/traceability/lotProcess.ts` (`abrirProceso` pasa a ser envoltorio)
- Crear: `tests/helpers/procesoDePrueba.ts`
- Crear: `tests/traceability/aperturaDeProceso.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt`, `docs/arquitectura/acceso-a-datos.allowlist.json`

**Interfaces:**
- Consume: `procesoQueCubre`, `idsDeAscendencia`, `idsDeDescendencia`, `loteDividido` y `bloquearLinaje`
  (tarea 2).
- Produce:
  - `exigeSinOtroProcesoAbierto(tx, lotId, ignorando?: string | null): Promise<void>`;
  - `NucleoDeApertura`;
  - `abrirProcesoEnTx(tx, userAccountId, input: NucleoDeApertura)`, que devuelve la fila de
    `LotProcess`;
  - en `tests/helpers/procesoDePrueba.ts`: `abrirProcesoDePrueba(userAccountId, lotId, extra?)` y
    `borrarProcesosDeLotesDonde(lot: Prisma.LotWhereInput)`.

- [ ] **Paso 1: El ayudante de pruebas.** Crear `tests/helpers/procesoDePrueba.ts`:

```ts
/**
 * Abrir un proceso en una prueba, y limpiarlo.
 *
 * **Por qué existe** (Parte 1, R3): desde esta parte no se empieza una fermentación ni un secado sin
 * un proceso abierto que cubra al lote. Treinta llamadas en diez archivos de prueba empezaban
 * corridas sin proceso. En vez de copiar treinta veces el armado de un proceso, una línea.
 *
 * **Usa los valores REALES del catálogo** (`Washed`, `despulpada`): la base de pruebas está sembrada
 * (`npm run db:seed`), así que existen y no hay valores de prueba que limpiar.
 *
 * Por convención de la casa, la limpieza la llama el archivo de la prueba, no el ayudante.
 */
import { prisma } from "../../lib/db";
import { abrirProceso } from "../../lib/traceability/lotProcess";
import type { Prisma } from "../../generated/prisma/client";
import { assertDefinedWhere } from "./assertDefinedWhere";

async function valorDeCatalogo(catalogo: string, valor: string): Promise<string> {
  return (
    await prisma.variableCatalogValue.findFirstOrThrow({
      where: { value: valor, catalog: { key: catalogo } },
      select: { id: true },
    })
  ).id;
}

export async function abrirProcesoDePrueba(
  userAccountId: string,
  lotId: string,
  extra: { startedAt?: Date; targetMoisturePct?: number; processRecipeVersionId?: string | null } = {},
) {
  return abrirProceso(userAccountId, {
    lotId,
    intent: "TEST: proceso abierto para poder empezar corridas (Parte 1, R3)",
    targetMoisturePct: extra.targetMoisturePct ?? 11.5,
    startedAt: extra.startedAt ?? new Date("2020-01-01T00:00:00Z"),
    provenanceClass: "original_record",
    processGradeValueId: await valorDeCatalogo("grado_proceso", "Washed"),
    cherryStateValueId: await valorDeCatalogo("estado_cereza", "despulpada"),
    processRecipeVersionId: extra.processRecipeVersionId ?? null,
  });
}

/**
 * Borra los procesos de los lotes que cumplan `lot`, y antes sus devoluciones a secado. Va ANTES de
 * borrar esos lotes: `lot_process.lot_id` es RESTRICT. Se le pasa el mismo `where` con el que el
 * archivo borra sus lotes.
 */
export async function borrarProcesosDeLotesDonde(lot: Prisma.LotWhereInput): Promise<void> {
  await prisma.lotProcessReturn.deleteMany({
    where: assertDefinedWhere({ OR: [{ closedLotProcess: { lot } }, { continuationLotProcess: { lot } }] }),
  });
  await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lot }) });
}
```

- [ ] **Paso 2: Las pruebas de R2.** Crear `tests/traceability/aperturaDeProceso.test.ts`:

```ts
/**
 * R2 de la Parte 1: un solo proceso abierto por café, comprobado en el linaje y no sólo en el lote.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `apertura-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string;
const lotes: string[] = [];
const transformaciones: string[] = [];
const mediciones: string[] = [];

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function lote(codigo: string, lotType: "cherry" | "honey" = "cherry") {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType, organizationId: orgId, locationId: plotId, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
  lotes.push(id);
  return id;
}
async function enlazar(tipo: "stage_change" | "split" | "merge", padres: string[], hijos: string[]) {
  const t = await prisma.lotTransformation.create({ data: {
    transformationType: tipo, occurredAt: new Date("2026-03-05T12:00:00Z"), provenanceClass: "original_record", createdBy: gestor,
    inputs: { create: padres.map((lotId) => ({ lotId })) }, outputs: { create: hijos.map((lotId) => ({ lotId })) },
  } });
  transformaciones.push(t.id);
  return t.id;
}
/** Un proceso cerrado por humedad, insertado crudo. */
async function cerradoCrudo(lotId: string) {
  const [g, c] = await Promise.all([
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
  ]);
  const m = (await prisma.measurement.create({ data: { variable: "moisture", value: 10.5, unit: "%", occurredAt: new Date("2026-03-20T12:00:00Z"), lotId, provenanceClass: "measured_fact", createdBy: gestor } })).id;
  mediciones.push(m);
  return (await prisma.lotProcess.create({ data: {
    lotId, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
    provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
    endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: m,
  } })).id;
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  gestor = await cuenta("Gestor");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
}, 60000);

afterAll(async () => {
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: mediciones } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformaciones } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: gestor }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("R2 — un solo proceso abierto por café", () => {
  it("no se abre en el hijo si el padre tiene uno abierto", async () => {
    const padre = await lote("P1-PADRE");
    const hijo = await lote("P1-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    await abrirProcesoDePrueba(gestor, padre);
    await expect(abrirProcesoDePrueba(gestor, hijo)).rejects.toThrow(new LotProcessError("process_already_open"));
  });

  it("no se abre en el padre si un hijo tiene uno abierto", async () => {
    const padre = await lote("P2-PADRE");
    const hijo = await lote("P2-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    await abrirProcesoDePrueba(gestor, hijo);
    await expect(abrirProcesoDePrueba(gestor, padre)).rejects.toThrow(new LotProcessError("process_already_open"));
  });

  it("sí se abre un reproceso bajo un proceso CERRADO", async () => {
    const padre = await lote("P3-PADRE");
    const hijo = await lote("P3-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    await cerradoCrudo(padre);
    const p = await abrirProcesoDePrueba(gestor, hijo);
    expect(p.endedAt).toBeNull();
  });

  it("rechaza dividido, en bodega, mezcla y miel, cada uno con su código", async () => {
    // Dividido: la entrada de una división que cerró un proceso.
    const x = await lote("P4-DIV");
    const x1 = await lote("P4-DIV1");
    const t = await enlazar("split", [x], [x1]);
    const [g, c] = await Promise.all([
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
    ]);
    await prisma.lotProcess.create({ data: {
      lotId: x, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
      endedAt: new Date("2026-03-05T12:00:00Z"), closureKind: "divided", dividedByTransformationId: t,
    } });
    await expect(abrirProcesoDePrueba(gestor, x)).rejects.toThrow(new LotProcessError("lote_dividido"));

    // En bodega.
    const b = await lote("P4-BODEGA");
    await prisma.storageAssignment.create({ data: { lotId: b, locationId: plotId, startedAt: new Date("2026-03-22T12:00:00Z") } });
    await expect(abrirProcesoDePrueba(gestor, b)).rejects.toThrow(new LotProcessError("lote_en_bodega"));

    // Mezcla.
    const a1 = await lote("P4-MA");
    const a2 = await lote("P4-MB");
    await cerradoCrudo(a1);
    await cerradoCrudo(a2);
    const m = await lote("P4-MEZCLA");
    await enlazar("merge", [a1, a2], [m]);
    await expect(abrirProcesoDePrueba(gestor, m)).rejects.toThrow(new LotProcessError("lote_mezclado"));

    // Miel.
    const miel = await lote("P4-MIEL", "honey");
    await expect(abrirProcesoDePrueba(gestor, miel)).rejects.toThrow(new LotProcessError("proceso_no_aplica_a_miel"));
  });

  it("dos aperturas a la vez en padre e hijo: sólo una sale bien, y la otra con nombre", async () => {
    const padre = await lote("P5-PADRE");
    const hijo = await lote("P5-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    const res = await Promise.allSettled([abrirProcesoDePrueba(gestor, padre), abrirProcesoDePrueba(gestor, hijo)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const fallo = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(fallo.reason).toBeInstanceOf(LotProcessError);
    expect((fallo.reason as Error).message).toBe("process_already_open");
  }, 20000);
});
```

Añadirla al grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.

- [ ] **Paso 3: Verlas fallar.**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas npx vitest run tests/traceability/aperturaDeProceso.test.ts > /tmp/t3.txt 2>&1; echo "vitest=$?"; grep -E '✓|×' /tmp/t3.txt
```

Esperado: caen todas menos «sí se abre un reproceso». La de concurrencia puede caer o salir verde por
suerte: el `abrirProceso` de hoy comprueba fuera de la transacción.

- [ ] **Paso 4: Los núcleos.** En `lib/traceability/procesoDelLinaje.ts`, añadir a los imports:

```ts
import type { Prisma, ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
```

(y quitar el `import type { Prisma }` suelto de antes). Añadir al final:

```ts
/**
 * R2. Un solo proceso abierto por café. La usan LAS DOS puertas que dejan un proceso abierto: abrir
 * uno y devolver a secado (que abre una continuación). La primera versión del diseño sólo protegía la
 * primera, y la revisión lo cazó.
 *
 * Se llama dentro de la transacción y DESPUÉS de `bloquearLinaje`: lee lo que la escritura va a
 * cambiar, y el bloqueo es lo que impide que otra apertura en el mismo linaje se cuele entre la
 * lectura y la escritura.
 */
export async function exigeSinOtroProcesoAbierto(
  tx: Prisma.TransactionClient,
  lotId: string,
  ignorando: string | null = null,
): Promise<void> {
  const lote = await tx.lot.findUnique({ where: { id: lotId }, select: { lotType: true } });
  if (!lote) throw new LotProcessError("lot_not_found");
  if (lote.lotType === "honey") throw new LotProcessError("proceso_no_aplica_a_miel");
  if (await loteDividido(tx, lotId)) throw new LotProcessError("lote_dividido");
  const cobertura = await procesoQueCubre(tx, lotId);
  if (cobertura.estado === "mezcla") throw new LotProcessError("lote_mezclado");
  // TODO el linaje, no sólo el vigente: un ancestro puede tener un proceso abierto más arriba de uno
  // cerrado más cerca, y el vigente no lo vería.
  const linaje = [lotId, ...(await idsDeAscendencia(tx, lotId)), ...(await idsDeDescendencia(tx, lotId))];
  const abierto = await tx.lotProcess.findFirst({
    where: { lotId: { in: linaje }, endedAt: null, ...(ignorando ? { id: { not: ignorando } } : {}) },
    select: { id: true },
  });
  if (abierto) throw new LotProcessError("process_already_open");
  const enBodega = await tx.storageAssignment.findFirst({ where: { lotId, endedAt: null }, select: { id: true } });
  if (enBodega) throw new LotProcessError("lote_en_bodega");
}

/** Lo que se escribe al abrir un proceso, ya validado por quien llama. */
export interface NucleoDeApertura {
  lotId: string;
  processRecipeVersionId: string | null;
  intent: string;
  processGradeValueId: string;
  cherryStateValueId: string;
  targetMoisturePct: number | Prisma.Decimal;
  startedAt: Date;
  notes: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference: string | null;
  /** R6.4 y R7: de qué proceso viene una parte de una división o una continuación. */
  derivedFromLotProcessId?: string | null;
}

/**
 * Abre un proceso DENTRO de una transacción que ya bloqueó el linaje. No autoriza: los envoltorios
 * (`abrirProceso`, la división, la devolución) ya lo hicieron. Su auditoría va con el mismo `tx`.
 */
export async function abrirProcesoEnTx(tx: Prisma.TransactionClient, userAccountId: string, input: NucleoDeApertura) {
  await exigeSinOtroProcesoAbierto(tx, input.lotId);
  const ultimo = await tx.lotProcess.findFirst({
    where: { lotId: input.lotId },
    orderBy: { sequenceOrder: "desc" },
    select: { sequenceOrder: true },
  });
  const proceso = await tx.lotProcess.create({
    data: {
      lotId: input.lotId,
      sequenceOrder: (ultimo?.sequenceOrder ?? 0) + 1,
      processRecipeVersionId: input.processRecipeVersionId,
      intent: input.intent,
      processGradeValueId: input.processGradeValueId,
      cherryStateValueId: input.cherryStateValueId,
      targetMoisturePct: input.targetMoisturePct,
      startedAt: input.startedAt,
      notes: input.notes,
      provenanceClass: input.provenanceClass,
      sourceReference: input.sourceReference,
      derivedFromLotProcessId: input.derivedFromLotProcessId ?? null,
      createdBy: userAccountId,
    },
  });
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "lot_process.open",
      entityType: "lot_process",
      entityId: proceso.id,
      after: proceso,
      sourceInterface: "traceability.lotProcess",
    },
    tx,
  );
  return proceso;
}
```

**La firma de `abrirProcesoEnTx` va en UNA línea y con `tx` primero.** `audit-atomico.test.ts` sólo
reconoce así una función con transacción.

- [ ] **Paso 5: El envoltorio.** En `lib/traceability/lotProcess.ts`:
- añadir `import { Prisma } from "../../generated/prisma/client";` (como valor, para
  `PrismaClientKnownRequestError`);
- añadir `bloquearLinaje` y `abrirProcesoEnTx` al import de `./procesoDelLinaje`;
- sustituir, en `abrirProceso`, todo lo que va desde `const abierto = await prisma.lotProcess.findFirst({`
  hasta el final de la función.

Queda así:

```ts
  // R2 (Parte 1): la comprobación de «otro proceso abierto» ya no se hace aquí, con el cliente global
  // y fuera de la transacción: la hace `abrirProcesoEnTx` dentro, con el linaje bloqueado.
  try {
    return await prisma.$transaction(async (tx) => {
      await bloquearLinaje(tx, input.lotId);
      return abrirProcesoEnTx(tx, userAccountId, {
        lotId: input.lotId,
        processRecipeVersionId: input.processRecipeVersionId ?? null,
        intent: input.intent.trim(),
        processGradeValueId: input.processGradeValueId,
        cherryStateValueId: input.cherryStateValueId,
        targetMoisturePct: input.targetMoisturePct,
        startedAt: input.startedAt,
        notes: input.notes?.trim() || null,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference?.trim() || null,
      });
    });
  } catch (error) {
    // El índice único parcial es la red: si algo se colara entre el bloqueo y la escritura, sale con
    // nombre y no como un error de restricción ilegible.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new LotProcessError("process_already_open");
    }
    throw error;
  }
}
```

Las validaciones de antes —acceso, porcentaje, intención, receta y catálogos— **se quedan donde
están y en ese orden**. `lotProcess.test.ts` usa `loteB`, que está en bodega, para probar los
errores de catálogo: si R2 corriera antes, esas pruebas recibirían `lote_en_bodega`.

- [ ] **Paso 6: Verlas pasar.** También las de antes.

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas npx vitest run tests/traceability/aperturaDeProceso.test.ts tests/traceability/lotProcess.test.ts tests/traceability/procesoDelLinaje.test.ts tests/arquitectura/audit-atomico.test.ts > /tmp/t3.txt 2>&1; echo "vitest=$?"; grep -E 'Test Files|Tests ' /tmp/t3.txt
```

Esperado: todo en verde. Repetir la de concurrencia cinco veces seguidas
(`-t "dos aperturas a la vez"`): tiene que salir verde las cinco.

- [ ] **Paso 7: Inventarios, compuerta y commit.** Repetir el paso 6 de la tarea 2: las operaciones
  nuevas `exigeSinOtroProcesoAbierto` y `abrirProcesoEnTx` piden su entrada.
  - `abrirProcesoEnTx` recibe principal y no tiene guardia visible, así que va en
    `operaciones_sin_patron`, con la razón: «Núcleo con `tx`: sólo lo llaman `abrirProceso`,
    `dividirProcesoEnTx` y `devolverASecado`, todos después de `requireLotAccess(\"manage\")` sobre el
    lote».
  - Commit con `procesoDelLinaje.ts`, `lotProcess.ts`, `tests/helpers/procesoDePrueba.ts`,
    `tests/traceability/aperturaDeProceso.test.ts`, `scripts/pruebas-por-compuerta.txt` y el JSON de
    inventario.

Flip-tests, sobre el commit:

| Mutación | Debe caer |
|---|---|
| en `exigeSinOtroProcesoAbierto`, `const linaje = [lotId, ...]` → `const linaje = [lotId]` | «no se abre en el hijo si el padre…» y «…en el padre si un hijo…» |
| quitar la línea `if (enBodega) throw …` | «rechaza dividido, en bodega, mezcla y miel…» |
| en `abrirProceso`, quitar `await bloquearLinaje(tx, input.lotId);` | «dos aperturas a la vez…». Correrla 10 veces: es una carrera, y basta con que caiga una |

---

### Tarea 4: Empezar fermentación o secado — se une solo, sin proceso se bloquea, hereda la receta (R3, R4)

**Archivos:**
- Modificar: `lib/traceability/procesoDelLinaje.ts` (`procesoAbiertoParaCorrida`)
- Modificar: `lib/traceability/fermentation.ts` y `lib/traceability/drying.ts`
- Modificar: `lib/traceability/lotProcess.ts`, para eliminar `colgarCorrida`
- Modificar: `app/actions/traceability.ts` (`startFermentationAction`)
- Modificar: `app/components/traceability/FermentationForm.tsx` y `app/lots/[id]/fermentation/new/page.tsx`
- Crear: `tests/traceability/corridaConProceso.test.ts`
- Modificar las pruebas que empiezan corridas: `tests/traceability/{measurements,drying,fermentation,samples,reports,operations,e2e,venta-temprana,massBalance,bandejasDelSecado}.test.ts`
- Modificar: `tests/traceability/e2e-cleanup.ts` y `tests/traceability/lotProcess.test.ts` (sale la
  prueba de `colgarCorrida`)
- Modificar: `prisma/seed.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt` y el JSON de inventario

**Interfaces:**
- Consume: `bloquearLinaje`, `loteDividido` y `procesoQueCubre` (tarea 2); `abrirProcesoDePrueba` y
  `borrarProcesosDeLotesDonde` (tarea 3).
- Produce: `procesoAbiertoParaCorrida(tx, lotId): Promise<{ id: string; processRecipeVersionId: string | null }>`.

- [ ] **Paso 1: Las pruebas de R3 y R4.** Crear `tests/traceability/corridaConProceso.test.ts`:

```ts
/**
 * R3 y R4 de la Parte 1: una corrida se une sola al proceso que cubre a su lote; sin proceso abierto
 * no empieza; la fermentación lleva la receta del proceso y no otra.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { startFermentationRun } from "../../lib/traceability/fermentation";
import { startDryingRun } from "../../lib/traceability/drying";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `corrida-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string, intruso: string;
let recetaVersionId: string, otraVersionId: string;
const lotes: string[] = [];
const transformaciones: string[] = [];

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function lote(codigo: string) {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType: "cherry", organizationId: orgId, locationId: plotId, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
  lotes.push(id);
  return id;
}
async function enlazar(padres: string[], hijos: string[]) {
  const t = await prisma.lotTransformation.create({ data: {
    transformationType: "stage_change", occurredAt: new Date("2026-03-05T12:00:00Z"), provenanceClass: "original_record", createdBy: gestor,
    inputs: { create: padres.map((lotId) => ({ lotId })) }, outputs: { create: hijos.map((lotId) => ({ lotId })) },
  } });
  transformaciones.push(t.id);
}
const ahora = () => new Date();

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  gestor = await cuenta("Gestor");
  intruso = await cuenta("Intruso");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  const receta = await prisma.processRecipe.create({ data: { name: `TEST Lavado ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor } });
  recetaVersionId = (await prisma.processRecipeVersion.create({ data: { recipeId: receta.id, version: 1, status: "approved", createdBy: gestor } })).id;
  otraVersionId = (await prisma.processRecipeVersion.create({ data: { recipeId: receta.id, version: 2, status: "approved", createdBy: gestor } })).id;
}, 60000);

afterAll(async () => {
  const corridas = await prisma.lotTransformation.findMany({
    where: { inputs: { some: { lotId: { in: lotes } } } },
    select: { id: true, fermentationRunId: true, dryingRunId: true },
  });
  const ids = corridas.map((c) => c.id);
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: [...ids, ...transformaciones] } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: [...ids, ...transformaciones] } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: [...ids, ...transformaciones] } }) });
  const ferm = corridas.map((c) => c.fermentationRunId).filter((x): x is string => x !== null);
  const sec = corridas.map((c) => c.dryingRunId).filter((x): x is string => x !== null);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...ferm, ...sec] } }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: ferm } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: sec } }) });
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [gestor, intruso] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("R3 — la corrida se une sola, y sin proceso no empieza", () => {
  it("sin proceso abierto, empezar una fermentación se rechaza con nombre", async () => {
    const l = await lote("R3-SIN");
    await expect(
      startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("sin_proceso_abierto"));
  });

  it("un secado en el nieto queda unido al proceso del abuelo", async () => {
    const abuelo = await lote("R3-ABUELO");
    const hijo = await lote("R3-HIJO");
    const nieto = await lote("R3-NIETO");
    await enlazar([abuelo], [hijo]);
    await enlazar([hijo], [nieto]);
    const p = await abrirProcesoDePrueba(gestor, abuelo);
    const { run } = await startDryingRun(gestor, { lotId: nieto, startedAt: ahora(), provenanceClass: "original_record" });
    expect(run.lotProcessId).toBe(p.id);
    // Sin evento nuevo: el `after` del start ya lleva el proceso.
    const eventos = await prisma.auditEvent.findMany({ where: { entityType: "drying_run", entityId: run.id } });
    expect(eventos.map((e) => e.operation)).toEqual(["drying_run.start"]);
    expect(JSON.stringify(eventos[0]!.after)).toContain(p.id);
  });

  it("en bodega no se empieza nada", async () => {
    const l = await lote("R3-BODEGA");
    await abrirProcesoDePrueba(gestor, l);
    await prisma.storageAssignment.create({ data: { lotId: l, locationId: plotId, startedAt: ahora() } });
    await expect(
      startDryingRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("lote_en_bodega"));
  });

  it("el permiso se pide sobre el lote de la corrida: sin él, error de acceso y no de proceso", async () => {
    const l = await lote("R3-INTRUSO");
    await expect(
      startDryingRun(intruso, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});

describe("R4 — la fermentación lleva la receta del proceso", () => {
  it("hereda la versión del proceso", async () => {
    const l = await lote("R4-HEREDA");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: recetaVersionId });
    const { run } = await startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" });
    expect(run.processRecipeVersionId).toBe(recetaVersionId);
  });

  it("rechaza otra versión distinta de la del proceso", async () => {
    const l = await lote("R4-OTRA");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: recetaVersionId });
    await expect(
      startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record", processRecipeVersionId: otraVersionId }),
    ).rejects.toThrow(new LotProcessError("receta_distinta_del_proceso"));
  });

  it("en un proceso «Sin receta» la corrida tampoco lleva receta", async () => {
    const l = await lote("R4-SIN");
    await abrirProcesoDePrueba(gestor, l);
    const { run } = await startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" });
    expect(run.processRecipeVersionId).toBeNull();
  });
});
```

Añadirla a `base-sembrada`.

- [ ] **Paso 2: Verlas fallar.**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas npx vitest run tests/traceability/corridaConProceso.test.ts > /tmp/t4.txt 2>&1; echo "vitest=$?"; grep -E '✓|×' /tmp/t4.txt
```

Esperado: caen todas menos la del permiso; ésa ya pasa hoy y es el control.

- [ ] **Paso 3: El núcleo.** En `lib/traceability/procesoDelLinaje.ts`, al final:

```ts
/**
 * R3/R4. El proceso al que se une una corrida que empieza sobre `lotId`, o el rechazo con nombre.
 * Bloquea el linaje: una división o un cierre a la vez no pueden dejar la corrida bajo un proceso
 * que ya no está abierto.
 */
export async function procesoAbiertoParaCorrida(
  tx: Prisma.TransactionClient,
  lotId: string,
): Promise<{ id: string; processRecipeVersionId: string | null }> {
  await bloquearLinaje(tx, lotId);
  if (await loteDividido(tx, lotId)) throw new LotProcessError("lote_dividido");
  const enBodega = await tx.storageAssignment.findFirst({ where: { lotId, endedAt: null }, select: { id: true } });
  if (enBodega) throw new LotProcessError("lote_en_bodega");
  const cobertura = await procesoQueCubre(tx, lotId);
  if (cobertura.estado === "mezcla") throw new LotProcessError("lote_mezclado");
  if (cobertura.estado !== "abierto") throw new LotProcessError("sin_proceso_abierto");
  return tx.lotProcess.findUniqueOrThrow({
    where: { id: cobertura.vigente.id },
    select: { id: true, processRecipeVersionId: true },
  });
}
```

- [ ] **Paso 4: Las dos corridas.** En `lib/traceability/fermentation.ts`, añadir:

```ts
import { procesoAbiertoParaCorrida } from "./procesoDelLinaje";
import { LotProcessError } from "./errorDeProceso";
```

y, en `startFermentationRun`, dentro de `prisma.$transaction(async (tx) => {` y antes de
`tx.fermentationRun.create`:

```ts
    // Parte 1, R3/R4 (2026-09-30): la corrida se une SOLA al proceso abierto que cubre al lote —el
    // suyo o el de un ancestro—, y sin proceso no empieza. El permiso ya se pidió arriba, sobre ESTE
    // lote: nunca se exige gestionar el lote donde vive el proceso.
    const proceso = await procesoAbiertoParaCorrida(tx, input.lotId);
    // R4: la receta es la del proceso. Una distinta pedida a mano es una contradicción, no una opción.
    if (input.processRecipeVersionId && input.processRecipeVersionId !== proceso.processRecipeVersionId) {
      throw new LotProcessError("receta_distinta_del_proceso");
    }
```

En el `data` del `create`, la línea `      processRecipeVersionId: input.processRecipeVersionId ?? null,`
(con **seis** espacios: copiarla exacta) se sustituye por:

```ts
        processRecipeVersionId: proceso.processRecipeVersionId,
        lotProcessId: proceso.id,
```

En `lib/traceability/drying.ts`, el mismo import de `procesoAbiertoParaCorrida`. En `startDryingRun`,
dentro de la transacción y antes de `tx.dryingRun.create`:

```ts
    // Parte 1, R3 (2026-09-30): ver `startFermentationRun`.
    const proceso = await procesoAbiertoParaCorrida(tx, input.lotId);
```

y en su `data`, `lotProcessId: proceso.id,`.

- [ ] **Paso 5: Quitar `colgarCorrida`.** En `lib/traceability/lotProcess.ts`, borrar la función
  entera con su comentario. En `tests/traceability/lotProcess.test.ts`:
  - quitar `colgarCorrida,` del import;
  - quitar el `describe("colgar del proceso las corridas que ya existían", …)` completo
    (líneas ~468-483).

```bash
echo "restos de colgarCorrida:"; git grep -n colgarCorrida -- lib app tests scripts | wc -l
```

Esperado: `0`.

- [ ] **Paso 6: La pantalla deja de ofrecer otra receta (R4).**

En `app/actions/traceability.ts`, en `startFermentationAction`, borrar la línea
`      processRecipeVersionId: emptyToNull(formData.get("processRecipeVersionId")),`.

En `app/components/traceability/FermentationForm.tsx`:
- cambiar la firma (copiar exacta, con sus espacios raros) de
  `export function FermentationForm({ lotId , recipeVersions = [] }: { lotId: string ; recipeVersions?: { id: string; label: string }[] }) {`
  a `export function FermentationForm({ lotId, recetaDelProceso }: { lotId: string; recetaDelProceso: string | null }) {`;
- sustituir el bloque `{recipeVersions.length > 0 ? ( … ) : null}` por:

```tsx
      {/* Parte 1, R4: la receta es la del proceso que cubre al lote; aquí sólo se lee. */}
      <p className="nn-muted">
        {recetaDelProceso ? t("fermentationRecipeFromProcess", { recipe: recetaDelProceso }) : t("fermentationNoRecipeInProcess")}
      </p>
```

En `app/lots/[id]/fermentation/new/page.tsx`:
- quitar el import de `listRecipeVersionsForLot` y la constante `recipeVersions`;
- pasar `recetaDelProceso={null}` de momento. La tarea 9 lo rellena con `coberturaDelLote`; se dice
  en un comentario `// Tarea 9 lo rellena`.

Añadir las claves en `messages/es.json` y `messages/en.json`, dentro de `Traceability`, junto a
`"recipeHint"`:

```json
    "fermentationRecipeFromProcess": "Receta del proceso: {recipe}",
    "fermentationNoRecipeInProcess": "El proceso de este lote no tiene receta.",
```

```json
    "fermentationRecipeFromProcess": "Recipe from the process: {recipe}",
    "fermentationNoRecipeInProcess": "This lot's process has no recipe.",
```

- [ ] **Paso 7: Las 30 llamadas de prueba y la demo.** En cada sitio, **una sola vez por lote**,
  antes de su primera corrida: `await abrirProcesoDePrueba(<el mismo usuario de la llamada>, <el lotId de la llamada>);`.
  Importarlo de `../helpers/procesoDePrueba`.

| Archivo | Líneas (start*Run) | Qué hacer |
|---|---|---|
| `measurements.test.ts` | 402, 432, 458, 500, 542, 608, 706 | abrir sobre `lot.id` antes de cada una |
| `drying.test.ts` | 122, 200, 222, 254, 296, 376 | abrir sobre `lot.id`. **No** en la 185: es el usuario de otro proyecto, y la prueba espera el error de acceso, que sale antes |
| `fermentation.test.ts` | 107, 199, 221 | abrir sobre `lot.id`. **No** en la 184, por lo mismo |
| `samples.test.ts` | 300 (`enSecado.id`), 530, 555 | abrir sobre ese lote |
| `bandejasDelSecado.test.ts` | 75, dentro de `secado(codigo)` | abrir justo después de `createLot` |
| `venta-temprana.test.ts` | 56 | abrir sobre `pergamino.id` |
| `massBalance.test.ts` | 239 | abrir sobre `source.id` |
| `e2e.test.ts` | 108 | abrir sobre `cherryLotId`. La 129 (`dryingStageLotId`) es descendiente: **no** abrir, queda cubierta |
| `reports.test.ts` | 116 | abrir sobre `harvestLotId`. La 137 es descendiente: no abrir |
| `operations.test.ts` | 98, 107 | abrir sobre `harvestLotId` y sobre `dryingLotId`. El segundo es un lote raíz sin linaje |

**Limpieza.** En el `afterAll` de cada uno de esos diez archivos, justo antes de su primer
`lot.deleteMany`, añadir `await borrarProcesosDeLotesDonde(<el mismo where de ese lot.deleteMany>);`.
En `tests/traceability/e2e-cleanup.ts`, después de la línea 48 (`sample.deleteMany`) y antes de la 49
(`measurement.deleteMany`), porque la medición de cierre es RESTRICT:

```ts
  // Parte 1: el proceso va antes que sus mediciones de cierre y que sus lotes (los dos RESTRICT).
  await prisma.lotProcess.deleteMany({
    where: assertDefinedWhere({ lotId: { in: [ids.cherryLotId, ids.dryingStageLotId, ids.greenLotId] } }),
  });
```

Contar antes y después. Tienen que salir los mismos 30 sitios, y `abrirProcesoDePrueba` en todos los
que dice la tabla:

```bash
echo "llamadas start*Run en pruebas:"; grep -rnE 'start(Fermentation|Drying)Run\(' tests | grep -v import | wc -l
echo "aperturas de prueba:"; grep -rn 'abrirProcesoDePrueba(' tests | grep -v -E 'import|helpers/procesoDePrueba' | wc -l
```

**La demo** (`prisma/seed.ts`):
- importar `abrirProceso` de `../lib/traceability/lotProcess`;
- dentro del bucle `for (const [index, batch] of batches.entries())`, antes de `startFermentationRun`,
  añadir:

```ts
    // Parte 1, R3 (2026-09-30): no se empieza una corrida sin proceso abierto. Se abre sobre cada
    // tanda, DESPUÉS de dividir —abrirlo antes sobre la cereza haría que la división cerrara el
    // proceso como «dividido» (R6)—. Valores DEMO (CLAUDE.md §54).
    const proceso = await abrirProceso(operatorId, {
      lotId: batch.id,
      intent: "DEMO: lavado, 48 h de fermentación y secado en cama",
      processGradeValueId: (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } })).id,
      cherryStateValueId: (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } })).id,
      targetMoisturePct: 11,
      startedAt: new Date("2027-01-20T09:30:00Z"),
      provenanceClass: "original_record",
    });
```

`proceso` lo usa la tarea 7. Hasta entonces, TypeScript puede avisar de que no se usa: dejar la
variable.

- [ ] **Paso 8: Verlas pasar, con la demo incluida.**

```bash
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas
npx vitest run tests/traceability/{corridaConProceso,lotProcess,measurements,drying,fermentation,samples,reports,operations,e2e,venta-temprana,massBalance,bandejasDelSecado}.test.ts > /tmp/t4.txt 2>&1; echo "vitest=$?"; grep -E 'Test Files|Tests ' /tmp/t4.txt
```

Comparar los fallos con `linea-base-fallos.txt`: no puede haber ninguno nuevo.

La demo, en una base vacía propia y sin tocar ninguna otra:

```bash
PGBIN=/Applications/Postgres.app/Contents/Versions/latest/bin
$PGBIN/psql "postgresql://postgres@127.0.0.1:55433/postgres" -c 'CREATE DATABASE nectar_demo_recetas'
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_demo_recetas npx prisma migrate deploy > /tmp/d.txt 2>&1; echo "deploy=$?"
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_demo_recetas SEED_DEMO_ADMIN=true SEED_DEMO_CONTENT=true SEED_DEMO_PARTNER=true SEED_DEMO_JUDGE=true npm run db:seed > /tmp/demo.txt 2>&1; echo "seed=$?"
$PGBIN/psql "postgresql://postgres@127.0.0.1:55433/nectar_demo_recetas" -At -c "select count(*) from traceability.drying_run where lot_process_id is not null"
```

Esperado: `seed=0` y un recuento de `2`, uno por tanda: las corridas de la demo quedaron unidas. La
base `nectar_demo_recetas` se reutiliza en la tarea 7 y se borra en la 13.

- [ ] **Paso 9: Inventarios, compuerta, commit y flip-test.** Inventario como en la tarea 2. Después
  la compuerta y el commit con todos los archivos de la lista; **contarlos en el stat**.

| Mutación | Debe caer |
|---|---|
| en `startDryingRun`, quitar `lotProcessId: proceso.id,` | «un secado en el nieto queda unido al proceso del abuelo» |
| en `procesoAbiertoParaCorrida`, `throw new LotProcessError("sin_proceso_abierto")` → `return { id: "00000000-0000-0000-0000-000000000000", processRecipeVersionId: null }` (compila; un `if (false)` NO compila, porque TypeScript deja de saber que `vigente` no es nulo, y una mutación que no compila no prueba nada) | «sin proceso abierto, empezar una fermentación…» |
| en `startFermentationRun`, quitar el `if` de R4 | «rechaza otra versión distinta…» |

---

### Tarea 5: No se cierra un proceso con corridas abiertas (R5)

**Archivos:**
- Modificar: `lib/traceability/procesoDelLinaje.ts` (`exigeSinCorridasAbiertas`)
- Modificar: `lib/traceability/lotProcess.ts` (`cerrarProceso`)
- Modificar: `tests/traceability/corridaConProceso.test.ts`

**Interfaces:**
- Produce: `exigeSinCorridasAbiertas(tx, proceso: { id: string; lotId: string }): Promise<void>`.
  La reutiliza la tarea 6.

- [ ] **Paso 1: Las pruebas.** En `corridaConProceso.test.ts`:
  - añadir a los imports `endDryingRun` (de `../../lib/traceability/drying`) y `cerrarProceso` (de
    `../../lib/traceability/lotProcess`);
  - añadir la lista `const mediciones: string[] = [];`;
  - en el `afterAll`, antes de `borrarProcesosDeLotesDonde`, añadir
    `await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: mediciones } }) });`.

Y este bloque:

```ts
describe("R5 — no se cierra un proceso con corridas abiertas", () => {
  async function humedad(lotId: string, value = 11) {
    const id = (await prisma.measurement.create({ data: { variable: "moisture", value, unit: "%", occurredAt: new Date(), lotId, provenanceClass: "measured_fact", createdBy: gestor } })).id;
    mediciones.push(id);
    return id;
  }

  it("con un secado abierto unido al proceso, cerrar se rechaza; terminado, cierra por humedad", async () => {
    const l = await lote("R5-UNIDA");
    const p = await abrirProcesoDePrueba(gestor, l);
    const { run } = await startDryingRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" });
    const m = await humedad(l);
    await expect(cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: m })).rejects.toThrow(new LotProcessError("corridas_abiertas"));
    const { outputLot } = await endDryingRun(gestor, { dryingRunId: run.id, endedAt: ahora(), outputLotCode: `R5-SAL-${RUN}`, outputLotType: "parchment", provenanceClass: "original_record" });
    lotes.push(outputLot.id);
    const cerrado = await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: m });
    expect(cerrado.closureKind).toBe("moisture");
  });

  it("cuenta también una corrida abierta que NO quedó unida (las de antes de esta parte)", async () => {
    const l = await lote("R5-SUELTA");
    const p = await abrirProcesoDePrueba(gestor, l);
    const suelta = await prisma.dryingRun.create({ data: { startedAt: ahora(), createdBy: gestor } });
    const t = await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
      dryingRunId: suelta.id, inputs: { create: [{ lotId: l }] },
    } });
    transformaciones.push(t.id);
    const m = await humedad(l);
    await expect(cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: m })).rejects.toThrow(new LotProcessError("corridas_abiertas"));
    await prisma.lotTransformation.update({ where: { id: t.id }, data: { dryingRunId: null } });
    await prisma.dryingRun.delete({ where: { id: suelta.id } });
  });
});
```

- [ ] **Paso 2: Verlas fallar.**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas npx vitest run tests/traceability/corridaConProceso.test.ts -t "R5" > /tmp/t5.txt 2>&1; echo "vitest=$?"; grep -E '✓|×' /tmp/t5.txt
```

Esperado: caen las dos; hoy cerrar no mira las corridas.

- [ ] **Paso 3: El núcleo.** En `procesoDelLinaje.ts`:

```ts
/**
 * R5. Ninguna fermentación ni secado abierto en el linaje que el proceso cubre: ni las unidas por
 * `lotProcessId`, ni las que empezaron sobre un lote cubierto sin quedar unidas —las de antes de esta
 * parte, que R9 no rellena—. La usan el cierre y la división (R6.2).
 */
export async function exigeSinCorridasAbiertas(
  tx: Prisma.TransactionClient,
  proceso: { id: string; lotId: string },
): Promise<void> {
  const cubiertos = [proceso.lotId, ...(await idsDeDescendencia(tx, proceso.lotId))];
  const donde = {
    endedAt: null,
    OR: [
      { lotProcessId: proceso.id },
      { transformations: { some: { inputs: { some: { lotId: { in: cubiertos } } } } } },
    ],
  };
  const fermentaciones = await tx.fermentationRun.count({ where: donde });
  const secados = await tx.dryingRun.count({ where: donde });
  if (fermentaciones + secados > 0) throw new LotProcessError("corridas_abiertas");
}
```

- [ ] **Paso 4: `cerrarProceso`.** En `lotProcess.ts`, sustituir desde `if (medicion.lotId !== proceso.lotId) {`
  hasta el final de la función:

```ts
  return prisma.$transaction(async (tx) => {
    // R5 (Parte 1): con el linaje bloqueado, para que ninguna corrida empiece entre la comprobación
    // y el cierre.
    await bloquearLinaje(tx, proceso.lotId);
    const actual = await tx.lotProcess.findUniqueOrThrow({ where: { id: proceso.id } });
    if (actual.endedAt !== null) throw new LotProcessError("process_already_closed");
    // Daniel, 2026-09-27: la humedad de cierre puede ser de un DESCENDIENTE del lote del proceso,
    // porque es el mismo café. Lo que sigue prohibido es una medición de OTRA rama.
    if (medicion.lotId !== proceso.lotId) {
      const descendencia = await idsDeDescendencia(tx, proceso.lotId);
      if (!medicion.lotId || !descendencia.includes(medicion.lotId)) {
        throw new LotProcessError("measurement_belongs_to_another_lot");
      }
    }
    await exigeSinCorridasAbiertas(tx, { id: proceso.id, lotId: proceso.lotId });

    const cerrado = await tx.lotProcess.update({
      where: { id: input.lotProcessId },
      data: { endedAt: input.endedAt, closingMoistureMeasurementId: input.closingMoistureMeasurementId, closureKind: "moisture" },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.close",
        entityType: "lot_process",
        entityId: cerrado.id,
        before: { endedAt: null },
        after: {
          endedAt: cerrado.endedAt,
          closingMoistureMeasurementId: cerrado.closingMoistureMeasurementId,
          targetMoisturePct: cerrado.targetMoisturePct,
          closureKind: cerrado.closureKind,
        },
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );

    return cerrado;
  });
}
```

Y añadir `exigeSinCorridasAbiertas` al import de `./procesoDelLinaje`.

- [ ] **Paso 5: Verlas pasar, y las que cierran procesos en otros archivos.**

```bash
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas
npx vitest run tests/traceability/{corridaConProceso,lotProcess,reporteDeProceso}.test.ts tests/beneficio/{colaDeSecado,datos-del-tablero}.test.ts > /tmp/t5.txt 2>&1; echo "vitest=$?"; grep -E 'Test Files|Tests |corridas_abiertas' /tmp/t5.txt
```

Si alguna prueba **ajena** cae con `corridas_abiertas`, su fixture cierra un proceso con una corrida
abierta colgada. Eso ya no se puede: se le termina la corrida antes de cerrar. Con una corrida
cruda, `prisma.dryingRun.update({ where: { id }, data: { endedAt: <fecha> } })` antes del
`cerrarProceso`. Anotar en el commit qué fixture se tocó y por qué.

- [ ] **Paso 6: Inventarios, compuerta, commit y flip-test.**

| Mutación | Debe caer |
|---|---|
| en `exigeSinCorridasAbiertas`, quitar la segunda rama del `OR` | «cuenta también una corrida abierta que NO quedó unida» |
| en `cerrarProceso`, quitar `await exigeSinCorridasAbiertas(…)` | «con un secado abierto unido al proceso, cerrar se rechaza…» |

---

### Tarea 6: Dividir bajo un proceso abierto — un proceso por parte (R6)

**Archivos:**
- Modificar: `lib/traceability/procesoDelLinaje.ts` (`antesDeTransformar`, `dividirProcesoEnTx`)
- Modificar: `lib/traceability/lots.ts` (`recordTransformation`)
- Modificar: `lib/traceability/measurements.ts` (`recordMeasurement`) y `lib/traceability/samples.ts`
  (`createSampleFromLot`)
- Crear: `tests/traceability/divisionBajoProceso.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt` y el JSON de inventario

**Interfaces:**
- Consume: `exigeSinCorridasAbiertas` (tarea 5), `abrirProcesoEnTx` (tarea 3),
  `computeLotBalance` y `resolveTolerancePct` (de `./balance`).
- Produce:
  - `antesDeTransformar(tx, { tipo, inputLotIds }): Promise<{ procesoId: string } | null>`;
  - `dividirProcesoEnTx(tx, userAccountId, args)`, que devuelve `{ cerrado, copias }`.

- [ ] **Paso 1: Las pruebas.** Crear `tests/traceability/divisionBajoProceso.test.ts`:

```ts
/**
 * R6 de la Parte 1: dividir un lote cubierto por un proceso abierto lo cierra como «dividido» y da a
 * cada parte su propio proceso, unido al anterior. Se divide el lote ENTERO, nunca con una corrida
 * en curso; el lote dividido queda cerrado; no se selecciona ni se fusiona bajo un proceso abierto.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { recordTransformation } from "../../lib/traceability/lots";
import { startDryingRun } from "../../lib/traceability/drying";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { createSampleFromLot } from "../../lib/traceability/samples";
import { procesoQueCubre } from "../../lib/traceability/procesoDelLinaje";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `division-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string;
/** Para medir y sacar muestra: el Farm Operator puede no tener permiso de muestras, y la prueba caería
 *  por acceso y no por la regla. Es el mismo admin que usa `recipeVersions.test.ts`. */
let admin: string;
const lotes: string[] = [];
const T = new Date("2026-03-10T12:00:00Z");

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function lote(codigo: string, lotType: "cherry" | "honey" = "cherry") {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType, organizationId: orgId, locationId: plotId, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
  lotes.push(id);
  return id;
}
/** Le da al lote un libro de masa con `kg`. */
async function conSaldo(lotId: string, kg: number) {
  await prisma.quantityEvent.create({ data: { lotId, eventType: "process_output", quantity: kg, unit: "kg", occurredAt: new Date("2026-03-02T12:00:00Z"), provenanceClass: "measured_fact" } });
}
function dividir(lotId: string, entra: number | null, partes: number[], tipo: "split" | "selection" = "split") {
  return recordTransformation(gestor, {
    transformationType: tipo, occurredAt: T, provenanceClass: "original_record",
    inputs: [{ lotId, quantity: entra, unit: entra === null ? null : "kg" }],
    outputs: partes.map((kg, i) => ({ lotCode: `${lotId.slice(0, 8)}-${String.fromCharCode(65 + i)}-${RUN}`, lotType: "processing" as const, quantity: kg, unit: "kg" })),
  }).then((r) => { lotes.push(...r.outputLots.map((l) => l.id)); return r; });
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  gestor = await cuenta("Gestor");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  admin = (await prisma.assignment.findFirstOrThrow({
    where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
    select: { userAccountId: true },
  })).userAccountId;
}, 60000);

afterAll(async () => {
  const ts = (await prisma.lotTransformation.findMany({
    where: { OR: [{ inputs: { some: { lotId: { in: lotes } } } }, { outputs: { some: { lotId: { in: lotes } } } }] },
    select: { id: true, dryingRunId: true },
  }));
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.deviation.deleteMany({ where: assertDefinedWhere({ transformationId: { in: ts.map((t) => t.id) } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: ts.map((t) => t.id) } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: ts.map((t) => t.id) } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: ts.map((t) => t.id) } }) });
  const sec = ts.map((t) => t.dryingRunId).filter((x): x is string => x !== null);
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: sec } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: gestor }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("R6 — dividir bajo un proceso abierto", () => {
  it("cierra el padre como dividido y da a cada parte su proceso, unido al anterior", async () => {
    const l = await lote("D1");
    await conSaldo(l, 100);
    const p = await abrirProcesoDePrueba(gestor, l);
    const r = await dividir(l, 100, [60, 40]);
    const cerrado = await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } });
    expect(cerrado.closureKind).toBe("divided");
    expect(cerrado.dividedByTransformationId).toBe(r.transformation.id);
    expect(cerrado.endedAt?.toISOString()).toBe(T.toISOString());
    const copias = await prisma.lotProcess.findMany({ where: { lotId: { in: r.outputLots.map((o) => o.id) } } });
    expect(copias).toHaveLength(2);
    for (const c of copias) {
      expect(c.derivedFromLotProcessId).toBe(p.id);
      expect(c.startedAt.toISOString()).toBe(T.toISOString());
      expect(c.endedAt).toBeNull();
      expect(c.processGradeValueId).toBe(p.processGradeValueId);
      expect(c.targetMoisturePct.toNumber()).toBe(p.targetMoisturePct.toNumber());
    }
    // R6.5: la historia anterior se hereda por la cadena, no se copia.
    const cob = await procesoQueCubre(prisma, r.outputLots[0]!.id);
    expect(cob.cadena.map((x) => x.id)).toContain(p.id);

    // R6.6: el lote dividido queda cerrado.
    await expect(abrirProcesoDePrueba(gestor, l)).rejects.toThrow(new LotProcessError("lote_dividido"));
    await expect(startDryingRun(gestor, { lotId: l, startedAt: T, provenanceClass: "original_record" })).rejects.toThrow(new LotProcessError("lote_dividido"));
    await expect(recordMeasurement(admin, { variable: "moisture", value: 11, unit: "%", occurredAt: T, lotId: l, provenanceClass: "measured_fact" })).rejects.toThrow(/lote_dividido/);
    await expect(createSampleFromLot(admin, {
      sourceLotId: l, sampleCode: `D1-M-${RUN}`, sampleType: "green_coffee", materialState: "GREEN", occurredAt: T, provenanceClass: "original_record",
    } as Parameters<typeof createSampleFromLot>[1])).rejects.toThrow(/lote_dividido/);
  });

  it("con una corrida en curso no se divide", async () => {
    const l = await lote("D2");
    await conSaldo(l, 100);
    await abrirProcesoDePrueba(gestor, l);
    await startDryingRun(gestor, { lotId: l, startedAt: T, provenanceClass: "original_record" });
    await expect(dividir(l, 100, [50, 50])).rejects.toThrow(new LotProcessError("corridas_abiertas"));
  });

  it("dejar remanente fuera de la tolerancia se rechaza; dentro, no", async () => {
    const fuera = await lote("D3");
    await conSaldo(fuera, 100);
    await abrirProcesoDePrueba(gestor, fuera);
    await expect(dividir(fuera, 90, [45, 45])).rejects.toThrow(new LotProcessError("division_deja_remanente"));

    // 2 % por defecto (la organización no fija otra): sobra 1 kg de 99, dentro de 1,98.
    const dentro = await lote("D4");
    await conSaldo(dentro, 100);
    await abrirProcesoDePrueba(gestor, dentro);
    await expect(dividir(dentro, 99, [50, 49])).resolves.toBeDefined();
  });

  it("sin libro de masa se acepta, y el cierre lo dice", async () => {
    const l = await lote("D5");
    const p = await abrirProcesoDePrueba(gestor, l);
    await dividir(l, 100, [50, 50]);
    const evento = await prisma.auditEvent.findFirst({ where: { entityId: p.id, operation: "lot_process.close" }, orderBy: { occurredAt: "desc" } });
    expect(JSON.stringify(evento!.after)).toContain('"sinLibroDeMasa":true');
  });

  it("la miel sigue dividiendo en parcial", async () => {
    const m = await lote("D6-MIEL", "honey");
    await conSaldo(m, 10);
    await expect(dividir(m, 4, [4])).resolves.toBeDefined();
  });

  it("seleccionar bajo un proceso abierto se rechaza, también por recordTransformation directo", async () => {
    const l = await lote("D7");
    await conSaldo(l, 100);
    await abrirProcesoDePrueba(gestor, l);
    await expect(dividir(l, 100, [90, 10], "selection")).rejects.toThrow(new LotProcessError("seleccion_bajo_proceso_abierto"));
  });

  it("fusionar con un proceso abierto se rechaza", async () => {
    const a = await lote("D8-A");
    const b = await lote("D8-B");
    await abrirProcesoDePrueba(gestor, a);
    await expect(recordTransformation(gestor, {
      transformationType: "merge", occurredAt: T, provenanceClass: "original_record",
      inputs: [{ lotId: a }, { lotId: b }], outputs: [{ lotCode: `D8-M-${RUN}`, lotType: "processing" }],
    })).rejects.toThrow(new LotProcessError("fusion_bajo_proceso_abierto"));
  });

  it("dividir a la vez que se empieza una corrida: no salen bien las dos", async () => {
    const l = await lote("D9");
    await conSaldo(l, 100);
    await abrirProcesoDePrueba(gestor, l);
    const res = await Promise.allSettled([
      dividir(l, 100, [50, 50]),
      startDryingRun(gestor, { lotId: l, startedAt: T, provenanceClass: "original_record" }),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  }, 20000);
});
```

Añadirla a `base-sembrada`.

- [ ] **Paso 2: Verlas fallar.**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas npx vitest run tests/traceability/divisionBajoProceso.test.ts > /tmp/t6.txt 2>&1; echo "vitest=$?"; grep -E '✓|×' /tmp/t6.txt
```

Esperado: caen todas menos «la miel sigue dividiendo» y «sin libro de masa…». Esa segunda cae
porque hoy no se escribe ningún cierre; las dos deben verse.

- [ ] **Paso 3: Los núcleos.** En `procesoDelLinaje.ts`:
  - el import de Prisma pasa a ser de valor:
    `import { Prisma, type ProvenanceClass } from "../../generated/prisma/client";`;
  - añadir `import { computeLotBalance, resolveTolerancePct } from "./balance";`.

Al final del archivo:

```ts
export type TipoConReglaDeProceso = "split" | "selection" | "merge" | "blend";

/**
 * R6, antes de escribir la transformación. Bloquea los linajes de las entradas y decide:
 * - un lote dividido no se vuelve a dividir, seleccionar ni fusionar (R6.6);
 * - bajo un proceso abierto no se selecciona (R6.7: «primero se selecciona, después el proceso») ni
 *   se fusiona (R6.8);
 * - un `split` bajo un proceso abierto devuelve ese proceso, que `dividirProcesoEnTx` cerrará y
 *   copiará DESPUÉS de crear las partes. Antes rechaza si hay una corrida en curso (R6.2).
 */
export async function antesDeTransformar(
  tx: Prisma.TransactionClient,
  args: { tipo: TipoConReglaDeProceso; inputLotIds: readonly string[] },
): Promise<{ procesoId: string } | null> {
  await bloquearLinajes(tx, args.inputLotIds);
  for (const lotId of args.inputLotIds) {
    if (await loteDividido(tx, lotId)) throw new LotProcessError("lote_dividido");
  }
  const abiertos: ProcesoEnCadena[] = [];
  for (const lotId of args.inputLotIds) {
    const c = await procesoQueCubre(tx, lotId);
    if (c.estado === "abierto") abiertos.push(c.vigente);
  }
  if (abiertos.length === 0) return null;
  if (args.tipo === "selection") throw new LotProcessError("seleccion_bajo_proceso_abierto");
  if (args.tipo === "merge" || args.tipo === "blend" || args.inputLotIds.length > 1) {
    throw new LotProcessError("fusion_bajo_proceso_abierto");
  }
  const vigente = abiertos[0]!;
  await exigeSinCorridasAbiertas(tx, { id: vigente.id, lotId: vigente.lotId });
  return { procesoId: vigente.id };
}

/**
 * R6, después de crear las partes y de descontar la masa: comprueba que no quede café fuera de las
 * partes, cierra el proceso como `divided` y da a cada parte su copia, unida a él.
 */
export async function dividirProcesoEnTx(tx: Prisma.TransactionClient, userAccountId: string, args: { procesoId: string; transformationId: string; occurredAt: Date; loteDividido: string; cantidadDeEntrada: number | null; partes: readonly string[]; organizationId: string }) {
  const proceso = await tx.lotProcess.findUniqueOrThrow({ where: { id: args.procesoId } });
  if (args.occurredAt < proceso.startedAt) throw new LotProcessError("ends_before_it_started");

  // R6.1: se divide el lote ENTERO. Lo que quede, dentro de la tolerancia de masa de la organización
  // —la misma con la que el libro reconcilia la división—, no es remanente.
  const organizacion = await tx.organization.findUnique({ where: { id: args.organizationId }, select: { massBalanceTolerancePct: true } });
  const pct = resolveTolerancePct(organizacion);
  const saldo = await computeLotBalance(tx, args.loteDividido);
  const sinLibroDeMasa = !saldo.recorded;
  if (saldo.recorded) {
    const entrada = new Prisma.Decimal(args.cantidadDeEntrada ?? 0);
    const tolerancia = entrada.mul(pct).div(100).abs();
    if (saldo.quantity.greaterThan(tolerancia)) throw new LotProcessError("division_deja_remanente");
  }
  // Y ningún OTRO lote cubierto por el proceso puede conservar saldo: quedaría bajo un proceso
  // dividido sin haber sido dividido. Las muestras no cuentan.
  const cubiertos = [proceso.lotId, ...(await idsDeDescendencia(tx, proceso.lotId))].filter(
    (id) => id !== args.loteDividido && !args.partes.includes(id),
  );
  for (const id of cubiertos) {
    const lote = await tx.lot.findUniqueOrThrow({ where: { id }, select: { lotType: true } });
    if (lote.lotType === "sample") continue;
    const s = await computeLotBalance(tx, id);
    if (s.recorded && s.quantity.greaterThan(0)) throw new LotProcessError("division_deja_remanente");
  }

  const cerrado = await tx.lotProcess.update({
    where: { id: proceso.id },
    data: { endedAt: args.occurredAt, closureKind: "divided", dividedByTransformationId: args.transformationId },
  });
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "lot_process.close",
      entityType: "lot_process",
      entityId: cerrado.id,
      before: { endedAt: null },
      after: { endedAt: cerrado.endedAt, closureKind: "divided", dividedByTransformationId: args.transformationId, sinLibroDeMasa },
      sourceInterface: "traceability.lotProcess",
    },
    tx,
  );

  // R6.4: cada parte nace con su propio proceso, copiado, que empieza en el INSTANTE de la división
  // —no «ahora»: el import cerrará con humedades de fechas históricas, y el CHECK de fechas lo
  // rechazaría—.
  const copias = [];
  for (const parte of args.partes) {
    copias.push(
      await abrirProcesoEnTx(tx, userAccountId, {
        lotId: parte,
        processRecipeVersionId: proceso.processRecipeVersionId,
        intent: proceso.intent,
        processGradeValueId: proceso.processGradeValueId,
        cherryStateValueId: proceso.cherryStateValueId,
        targetMoisturePct: proceso.targetMoisturePct,
        startedAt: args.occurredAt,
        notes: proceso.notes,
        provenanceClass: proceso.provenanceClass,
        sourceReference: proceso.sourceReference,
        derivedFromLotProcessId: proceso.id,
      }),
    );
  }
  return { cerrado, copias };
}
```

- [ ] **Paso 4: Los ganchos en `recordTransformation`.** En `lib/traceability/lots.ts`:

```ts
import { antesDeTransformar, dividirProcesoEnTx, type TipoConReglaDeProceso } from "./procesoDelLinaje";
```

Antes de la función:

```ts
/** Parte 1, R6: las transformaciones que tienen reglas cuando un proceso abierto cubre la entrada. */
const TIPOS_CON_REGLA_DE_PROCESO = new Set<string>(["split", "selection", "merge", "blend"]);
```

Detrás de `const provenanceClass = input.provenanceClass;`:

```ts
  // Parte 1, R6 (2026-09-30). La miel no tiene procesos —y divide en parcial a propósito
  // (`dividirMiel` deja el remanente en el origen)—, así que queda fuera.
  const tocaProceso =
    TIPOS_CON_REGLA_DE_PROCESO.has(input.transformationType) && !inputLots.every((l) => l.lotType === "honey");
```

Como **primera línea** dentro de `prisma.$transaction(async (tx) => {`, antes de
`tx.lotTransformation.create`:

```ts
    const division = tocaProceso
      ? await antesDeTransformar(tx, {
          tipo: input.transformationType as TipoConReglaDeProceso,
          inputLotIds: input.inputs.map((i) => i.lotId),
        })
      : null;
```

Detrás de `const reconciliation = await settleMassBalance(tx, { … });` y antes de su `recordAuditEvent`:

```ts
    if (division) {
      await dividirProcesoEnTx(tx, userAccountId, {
        procesoId: division.procesoId,
        transformationId: transformation.id,
        occurredAt: input.occurredAt,
        loteDividido: input.inputs[0]!.lotId,
        cantidadDeEntrada: input.inputs[0]!.quantity ?? null,
        partes: outputLots.map((l) => l.id),
        organizationId: sourceLot.organizationId,
      });
    }
```

- [ ] **Paso 5: El lote dividido no admite mediciones ni muestras (R6.6).**

En `lib/traceability/measurements.ts`, importar `loteDividido` de `./procesoDelLinaje` y, como
primera línea de `crear: async (tx) => {` dentro de `recordMeasurement`:

```ts
  // Parte 1, R6.6: un lote dividido bajo un proceso queda cerrado: «todo registro posterior
  // pertenece a un hijo» (`20_modelo_ciclo_completo.md` §1.1).
  if (input.lotId && (await loteDividido(tx, input.lotId))) throw new MeasurementValidationError("lote_dividido");
```

En `lib/traceability/samples.ts`, importar `loteDividido` y `prisma` (ya importado) y, justo después
de `await exigirPersonaPermitida(...)` en `createSampleFromLot`:

```ts
  // Parte 1, R6.6: ver measurements.ts.
  if (await loteDividido(prisma, sourceLot.id)) throw new SampleValidationError("lote_dividido");
```

Usar las clases de cada módulo, y no `LotProcessError`, evita que el guardia
`acciones-traducen-sus-errores` exija una rama nueva en cada archivo de acciones que mide. El texto
propio llega en la tarea 12.

- [ ] **Paso 6: Verlas pasar.** También las de quien llama a `recordTransformation`.

```bash
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas
npx vitest run tests/traceability/{divisionBajoProceso,lots,selection,massBalance,harvest,lotesDeBeneficio,veredictoDelLote,subproductos,venta-temprana,measurements,samples}.test.ts tests/research/ro1.test.ts tests/apiary > /tmp/t6.txt 2>&1; echo "vitest=$?"; grep -E 'Test Files|Tests ' /tmp/t6.txt
npx vitest run tests/arquitectura > /tmp/arq.txt 2>&1; echo "arq=$?"; grep -E '×' /tmp/arq.txt | head
```

Comparar con la línea base. Repetir cinco veces la prueba de concurrencia.

- [ ] **Paso 7: Inventarios, compuerta, commit y flip-test.**

| Mutación | Debe caer |
|---|---|
| en `dividirProcesoEnTx`, `closureKind: "divided"` → `"moisture"` | «cierra el padre como dividido…» (el `CHECK` también protesta: anotar cuál cae primero) |
| en `dividirProcesoEnTx`, quitar el bucle de `copias` | «cierra el padre como dividido…» |
| en `dividirProcesoEnTx`, `if (saldo.quantity.greaterThan(tolerancia))` → `if (false && …)` | «dejar remanente fuera de la tolerancia…» |
| en `antesDeTransformar`, quitar `if (args.tipo === "selection") throw …` | «seleccionar bajo un proceso abierto…» |
| en `recordTransformation`, `tocaProceso` sin la condición de miel | «la miel sigue dividiendo en parcial» |

---

### Tarea 7: La bodega mira el proceso que cubre al lote (R7, compuerta)

**Archivos:**
- Modificar: `lib/traceability/lotProcess.ts` (`exigeSecadoTerminado` recibe `tx`)
- Modificar: `lib/traceability/storage.ts`
- Modificar: `prisma/seed.ts` y `tests/traceability/e2e.test.ts`, que miden y cierran antes de bodega
- Modificar: `tests/traceability/lotProcess.test.ts` (la llamada directa a `exigeSecadoTerminado`)
- Crear: `tests/traceability/bodegaConProceso.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt` y el JSON de inventario

**Interfaces:**
- Produce: `exigeSecadoTerminado(tx: Prisma.TransactionClient, lotId: string): Promise<void>`.

- [ ] **Paso 1: Las pruebas.** Crear `tests/traceability/bodegaConProceso.test.ts`. Su fixture es el
  de `corridaConProceso.test.ts`: `cuenta`, `lote`, `enlazar`, `beforeAll` y `afterAll`, **copiados
  enteros**, con `RUN = \`bodega-${Date.now()}\`` y una lista `mediciones` que el `afterAll` borra
  antes que los procesos. Las pruebas:

```ts
import { moveLotToStorage } from "../../lib/traceability/storage";
import { cerrarProceso } from "../../lib/traceability/lotProcess";

async function humedad(lotId: string, value: number) {
  const id = (await prisma.measurement.create({ data: { variable: "moisture", value, unit: "%", occurredAt: new Date("2026-03-20T12:00:00Z"), lotId, provenanceClass: "measured_fact", createdBy: gestor } })).id;
  mediciones.push(id);
  return id;
}

describe("R7 — la compuerta de bodega mira el proceso que cubre al lote", () => {
  it("el pergamino cuyo proceso vive en la cereza no entra con el proceso abierto", async () => {
    const cereza = await lote("B1-C");
    const fermentado = await lote("B1-F");
    const pergamino = await lote("B1-P");
    await enlazar([cereza], [fermentado]);
    await enlazar([fermentado], [pergamino]);
    await abrirProcesoDePrueba(gestor, cereza);
    await expect(moveLotToStorage(gestor, { lotId: pergamino, locationId: plotId, startedAt: ahora() })).rejects.toThrow(new LotProcessError("drying_not_finished"));
  });

  it("cerrado por humedad en el objetivo, el pergamino entra; por encima, no", async () => {
    const cereza = await lote("B2-C");
    const pergamino = await lote("B2-P");
    await enlazar([cereza], [pergamino]);
    const p = await abrirProcesoDePrueba(gestor, cereza); // objetivo 11,5
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(pergamino, 11) });
    await expect(moveLotToStorage(gestor, { lotId: pergamino, locationId: plotId, startedAt: ahora() })).resolves.toBeDefined();

    const cereza2 = await lote("B3-C");
    const pergamino2 = await lote("B3-P");
    await enlazar([cereza2], [pergamino2]);
    const p2 = await abrirProcesoDePrueba(gestor, cereza2);
    await cerrarProceso(gestor, { lotProcessId: p2.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(pergamino2, 13) });
    await expect(moveLotToStorage(gestor, { lotId: pergamino2, locationId: plotId, startedAt: ahora() })).rejects.toThrow(new LotProcessError("moisture_above_target"));
  });

  it("reubicar dentro de bodega no vuelve a juzgar el secado", async () => {
    const cereza = await lote("B4-C");
    const guardado = await lote("B4-G");
    await enlazar([cereza], [guardado]);
    await prisma.storageAssignment.create({ data: { lotId: guardado, locationId: plotId, startedAt: new Date("2026-03-01T12:00:00Z") } });
    // Un ancestro con proceso ABIERTO: R2 lo deja abrir, porque `lote_en_bodega` mira el propio lote
    // y no su descendencia. Con el proceso abierto, la compuerta rechazaría una ENTRADA; una
    // reubicación no la consulta.
    await abrirProcesoDePrueba(gestor, cereza);
    await expect(moveLotToStorage(gestor, { lotId: guardado, locationId: plotId, startedAt: ahora() })).resolves.toBeDefined();
  });

  it("un lote sin proceso entra como hoy", async () => {
    const l = await lote("B5");
    await expect(moveLotToStorage(gestor, { lotId: l, locationId: plotId, startedAt: ahora() })).resolves.toBeDefined();
  });

  it("almacenar a la vez que se abre un proceso que lo cubre: no salen bien las dos", async () => {
    const l = await lote("B6");
    const res = await Promise.allSettled([
      moveLotToStorage(gestor, { lotId: l, locationId: plotId, startedAt: ahora() }),
      abrirProcesoDePrueba(gestor, l),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  }, 20000);
});
```

Añadirla a `base-sembrada`.

- [ ] **Paso 2: Verlas fallar.**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas npx vitest run tests/traceability/bodegaConProceso.test.ts > /tmp/t7.txt 2>&1; echo "vitest=$?"; grep -E '✓|×' /tmp/t7.txt
```

Esperado: cae «el pergamino… no entra» (hoy entra); la de concurrencia puede caer o no.

- [ ] **Paso 3: La compuerta.** En `lotProcess.ts`, añadir `procesoQueCubre` y `loteDividido` al
  import de `./procesoDelLinaje`. El tipo de `tx` es `Prisma.TransactionClient`, del import de valor
  `Prisma` que añadió la tarea 3: no se importa otra vez.

Sustituir `exigeSecadoTerminado` entera:

```ts
/**
 * La compuerta de bodega: un lote **no sale de secado** antes de llegar a su objetivo de humedad.
 *
 * **Regla del dueño (2026-09-07), literal:** «bloquear, alertar, acción para regresar a secado; no
 * debe salir de secado antes bajo ninguna circunstancia».
 *
 * **Parte 1, R7 (2026-09-30).** Mira el proceso que CUBRE al lote —buscado hacia arriba—, no sólo el
 * del propio lote: el que va a bodega es el pergamino, y su proceso vive en la cereza. Corre DENTRO
 * de la transacción de bodega, después de `bloquearLinaje`: antes comprobaba fuera, y en el hueco
 * otra petición podía reabrir o abrir un proceso.
 *
 * **Un lote sin proceso pasa, como hoy.** Medido el 2026-09-07: producción tenía 45 lotes y cero
 * procesos; bloquearlos los dejaría inalmacenables por un dato que nadie pudo declarar. Hasta que
 * la parte «Re-importar» rehaga el histórico (R9).
 */
export async function exigeSecadoTerminado(tx: Prisma.TransactionClient, lotId: string): Promise<void> {
  if (await loteDividido(tx, lotId)) throw new LotProcessError("lote_dividido");
  const cobertura = await procesoQueCubre(tx, lotId);
  if (cobertura.estado === "sin_proceso") return;
  if (cobertura.estado === "mezcla") throw new LotProcessError("lote_mezclado");
  const proceso = await tx.lotProcess.findUniqueOrThrow({
    where: { id: cobertura.vigente.id },
    include: { closingMoistureMeasurement: true },
  });
  if (proceso.endedAt === null) throw new LotProcessError("drying_not_finished");
  if (proceso.closureKind === "divided") throw new LotProcessError("lote_dividido");
  if (proceso.closingMoistureMeasurement === null) throw new LotProcessError("no_closing_moisture");
  const medida = proceso.closingMoistureMeasurement.value.toNumber();
  const objetivo = proceso.targetMoisturePct.toNumber();
  if (medida > objetivo) throw new LotProcessError("moisture_above_target");
}
```

En `lib/traceability/storage.ts`:
- borrar la línea `await exigeSecadoTerminado(input.lotId);` y su comentario, que estaban fuera de
  la transacción;
- importar `bloquearLinaje` de `./procesoDelLinaje`;
- dentro de `crear: async (tx) => {`, detrás de `const openAssignment = await tx.storageAssignment.findFirst({ … });`,
  añadir:

```ts
    // «No debe salir de secado antes bajo ninguna circunstancia» (Daniel, 2026-09-07), y desde la
    // Parte 1 (R7) mirando el proceso que CUBRE al lote, dentro de esta transacción y con el linaje
    // bloqueado. Sólo al ENTRAR a bodega: reubicar un lote que ya está dentro no vuelve a juzgar el
    // secado. Un reenvío idempotente (`recuperarDeOtroEnvio`) no pasa por `crear`, así que tampoco
    // por aquí: devuelve la fila que ya pasó la compuerta.
    if (!openAssignment) {
      await bloquearLinaje(tx, input.lotId);
      await exigeSecadoTerminado(tx, input.lotId);
    }
```

En `tests/traceability/lotProcess.test.ts`, cambiar las llamadas directas
`exigeSecadoTerminado(loteA)` por `exigeSecadoTerminado(prisma, loteA)`:

```bash
echo "llamadas directas:"; grep -n 'exigeSecadoTerminado(' tests/traceability/lotProcess.test.ts
```

- [ ] **Paso 4: La demo y el e2e miden y cierran antes de bodega.**

En `prisma/seed.ts`:
- importar `cerrarProceso` (de `../lib/traceability/lotProcess`) y `recordMeasurement` (de
  `../lib/traceability/measurements`);
- entre `endDryingRun(…)` y `moveLotToStorage(…)`, añadir:

```ts
    // Parte 1, R7: a bodega sólo con el proceso cerrado por humedad en el objetivo. Valor DEMO.
    const humedadDeCierre = await recordMeasurement(operatorId, {
      variable: "moisture", value: 11, unit: "%", occurredAt: new Date("2027-02-04T11:30:00Z"),
      lotId: greenLot.id, provenanceClass: "measured_fact", notes: "DEMO",
    });
    await cerrarProceso(operatorId, {
      lotProcessId: proceso.id, endedAt: new Date("2027-02-04T11:45:00Z"), closingMoistureMeasurementId: humedadDeCierre.id,
    });
```

En `tests/traceability/e2e.test.ts`:
1. Donde la tarea 4 añadió `await abrirProcesoDePrueba(operatorUserAccountId, cherryLotId);`, guardar
   el resultado: `const procesoE2e = await abrirProcesoDePrueba(operatorUserAccountId, cherryLotId);`.
2. **Mover** el bloque «5. Measurement against the stored green lot» (`recordMeasurement` de 11,2 %)
   a **antes** de «4. Storage», cambiar su `occurredAt` a `new Date("2027-01-30T11:30:00Z")` y guardar
   su resultado: `const humedadE2e = await recordMeasurement(…)`.
3. Justo antes de `moveLotToStorage`:

```ts
  await cerrarProceso(operatorUserAccountId, {
    lotProcessId: procesoE2e.id, endedAt: new Date("2027-01-30T11:45:00Z"), closingMoistureMeasurementId: humedadE2e.id,
  });
```

importando `cerrarProceso`. El objetivo del ayudante es 11,5 y la medición es 11,2: pasa.

- [ ] **Paso 5: Verlas pasar, con la demo.**

```bash
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas
npx vitest run tests/traceability/{bodegaConProceso,lotProcess,e2e,storage,selection,measurements}.test.ts tests/envios > /tmp/t7.txt 2>&1; echo "vitest=$?"; grep -E 'Test Files|Tests ' /tmp/t7.txt
PGBIN=/Applications/Postgres.app/Contents/Versions/latest/bin
$PGBIN/psql "postgresql://postgres@127.0.0.1:55433/postgres" -c 'DROP DATABASE IF EXISTS nectar_demo_recetas' -c 'CREATE DATABASE nectar_demo_recetas'
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_demo_recetas npx prisma migrate deploy > /tmp/d.txt 2>&1; echo "deploy=$?"
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_demo_recetas SEED_DEMO_ADMIN=true SEED_DEMO_CONTENT=true SEED_DEMO_PARTNER=true SEED_DEMO_JUDGE=true npm run db:seed > /tmp/demo.txt 2>&1; echo "seed=$?"
$PGBIN/psql "postgresql://postgres@127.0.0.1:55433/nectar_demo_recetas" -At -c "select count(*) from traceability.lot_process where closure_kind = 'moisture'"
```

Esperado: `seed=0` y `2`: los dos procesos de la demo, cerrados por humedad.

- [ ] **Paso 6: Inventarios, compuerta, commit y flip-test.**
  - `lotProcess.ts` menciona ahora `TransactionClient`, así que va en `reciben_transaccion`.
  - La entrada de `dependen_del_llamador` de `exigeSecadoTerminado` se actualiza: su llamador sigue
    siendo sólo `moveLotToStorage`, que ya autorizó, y ahora corre dentro de su transacción.
  - Se pone la fecha de hoy en `verificado`.

| Mutación | Debe caer |
|---|---|
| en `exigeSecadoTerminado`, `procesoQueCubre(tx, lotId)` → sólo el propio lote: `tx.lotProcess.findFirst({ where: { lotId }, orderBy: { sequenceOrder: "desc" } })`, devolviendo si es null | «el pergamino cuyo proceso vive en la cereza…» |
| en `storage.ts`, quitar el `if (!openAssignment)` y llamar siempre | «reubicar dentro de bodega…» |
| en `storage.ts`, quitar `await bloquearLinaje(tx, input.lotId);` | «almacenar a la vez…»: correrla 10 veces, es una carrera |

---

### Tarea 8: Devolver a secado abre una continuación (R7)

**Archivos:**
- Modificar: `lib/traceability/lotProcess.ts` (`devolverASecado`, `opcionesParaProceso`)
- Modificar: `app/actions/traceability.ts` (`devolverASecadoAction`)
- Modificar: `app/components/traceability/ProcesoDelLote.tsx` (`DevolverASecadoForm`)
- Modificar: `app/lots/[id]/process/page.tsx` (cuándo se ofrece)
- Modificar: `messages/es.json` y `messages/en.json`
- Modificar: `tests/traceability/lotProcess.test.ts` (bloque de devolución) y `tests/traceability/bodegaConProceso.test.ts`

**Interfaces:**
- Produce: `devolverASecado(userAccountId, { lotId, motivoValueId, nota?, ocurrioEn })`, que devuelve
  `{ continuacion, devolucion }`; y `opcionesParaProceso(...).motivosDeDevolucion: OpcionSimple[]`.

- [ ] **Paso 1: Las pruebas.**

En `lotProcess.test.ts` se reescribe el bloque que hoy prueba la reapertura (líneas ~537-557) a la
conducta nueva. Importar `CATALOGO_MOTIVO_DEVOLUCION`. Queda así:

```ts
  it("devolver a secado abre una continuación unida al proceso cerrado, que conserva su cierre", async () => {
    const motivo = await prisma.variableCatalogValue.findFirstOrThrow({
      where: { value: "humedad_alta_por_error_de_manejo", catalog: { key: CATALOGO_MOTIVO_DEVOLUCION } },
    });
    await expect(devolverASecado(gestor, { lotId: loteA, motivoValueId: "", ocurrioEn: new Date("2026-03-22T12:00:00Z") }))
      .rejects.toThrow(new LotProcessError("motivo_required"));
    const cerradoAntes = (await listarProcesosDeLote(gestor, loteA)).at(-1)!;
    const { continuacion, devolucion } = await devolverASecado(gestor, {
      lotId: loteA, motivoValueId: motivo.id, nota: "11,2 % sobre 10,5 %: vuelve a cama", ocurrioEn: new Date("2026-03-22T12:00:00Z"),
    });
    expect(continuacion.endedAt).toBeNull();
    expect(continuacion.derivedFromLotProcessId).toBe(cerradoAntes.id);
    const cerrado = await prisma.lotProcess.findUniqueOrThrow({ where: { id: cerradoAntes.id } });
    expect(cerrado.endedAt).not.toBeNull();
    expect(cerrado.closingMoistureMeasurementId).toBe(cerradoAntes.closingMoistureMeasurementId);
    expect(devolucion.reasonValueId).toBe(motivo.id);
    const evento = await prisma.auditEvent.findFirst({ where: assertDefinedWhere({ entityId: devolucion.id, operation: "lot_process.return_to_drying" }) });
    expect(JSON.stringify(evento!.after)).toContain("vuelve a cama");
  });
```

Las pruebas que siguen en ese bloque —«la medición descartada sigue existiendo» y el cierre con
10,2 seguido de `moveLotToStorage`— siguen valiendo:
- la medición nunca se borra;
- el proceso abierto que encuentra `listarProcesosDeLote(loteA).find(p => p.endedAt === null)` es
  ahora la continuación;
- la compuerta mira el vigente, que es esa continuación cerrada a 10,2.

Ajustar sólo lo que hable de «reabierto».

En `bodegaConProceso.test.ts`, añadir:

```ts
import { devolverASecado, CATALOGO_MOTIVO_DEVOLUCION } from "../../lib/traceability/lotProcess";

describe("R7 — de bodega a secado sólo por un defecto de humedad", () => {
  async function motivo(valor: string) {
    return (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: valor, catalog: { key: CATALOGO_MOTIVO_DEVOLUCION } } })).id;
  }

  it("desde bodega: termina la bodega, abre la continuación y deja a los hermanos bajo el cerrado", async () => {
    const cereza = await lote("V1-C");
    const a = await lote("V1-A");
    const b = await lote("V1-B");
    await enlazar([cereza], [a, b]);
    const p = await abrirProcesoDePrueba(gestor, cereza);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(a, 11) });
    await moveLotToStorage(gestor, { lotId: a, locationId: plotId, startedAt: ahora() });
    await moveLotToStorage(gestor, { lotId: b, locationId: plotId, startedAt: ahora() });

    const { continuacion, devolucion } = await devolverASecado(gestor, { lotId: a, motivoValueId: await motivo("error_de_medicion"), ocurrioEn: ahora() });
    expect(continuacion.lotId).toBe(a);
    expect(devolucion.endedStorageAssignmentId).not.toBeNull();
    expect(await prisma.storageAssignment.count({ where: { lotId: a, endedAt: null } })).toBe(0);
    // El hermano sigue bajo el proceso CERRADO y en bodega.
    const cobB = await procesoQueCubre(prisma, b);
    expect(cobB.vigente?.id).toBe(p.id);
    expect(cobB.estado).toBe("cerrado");
    expect(await prisma.storageAssignment.count({ where: { lotId: b, endedAt: null } })).toBe(1);
  });

  it("«otro» exige nota", async () => {
    const l = await lote("V2");
    const p = await abrirProcesoDePrueba(gestor, l);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(l, 11) });
    await expect(devolverASecado(gestor, { lotId: l, motivoValueId: await motivo("otro"), ocurrioEn: ahora() }))
      .rejects.toThrow(new LotProcessError("motivo_otro_requiere_nota"));
  });
});
```

`procesoQueCubre` se importa de `../../lib/traceability/procesoDelLinaje`.

- [ ] **Paso 2: Verlas fallar.** Correr los dos archivos; caen las pruebas nuevas.

- [ ] **Paso 3: El servicio.** En `lotProcess.ts`, sustituir `devolverASecado` entera:

```ts
export interface DevolverASecadoInput {
  lotId: string;
  /** Del catálogo `motivo_devolucion_a_secado`. */
  motivoValueId: string;
  /** Obligatoria con «otro». */
  nota?: string | null;
  ocurrioEn: Date;
}

/**
 * Devuelve el lote a secado — Parte 1, R7 (2026-09-30).
 *
 * **Ya no reabre el proceso cerrado: abre una continuación unida a él.** Reabrir tenía tres defectos:
 * borraba la medición de cierre, que es un hecho que sí ocurrió; volvía a abrir el proceso para TODOS
 * los lotes que cubre, también los hermanos ya guardados; y se saltaba R2. Daniel aprobó el cambio
 * el 2026-09-30.
 *
 * **Sólo por un defecto de humedad**: el motivo sale de una lista y se guarda en su propia fila
 * (`LotProcessReturn`), para poder contar cuántas veces pasa y por qué.
 *
 * Todo en una transacción con el linaje bloqueado: si un paso falla, no queda nada a medias.
 */
export async function devolverASecado(userAccountId: string, input: DevolverASecadoInput) {
  await loteGestionable(userAccountId, input.lotId);
  const motivo = input.motivoValueId
    ? await prisma.variableCatalogValue.findUnique({ where: { id: input.motivoValueId }, include: { catalog: true } })
    : null;
  if (!motivo || motivo.catalog.key !== CATALOGO_MOTIVO_DEVOLUCION) throw new LotProcessError("motivo_required");
  const nota = input.nota?.trim() || null;
  if (motivo.value === "otro" && !nota) throw new LotProcessError("motivo_otro_requiere_nota");

  return prisma.$transaction(async (tx) => {
    await bloquearLinaje(tx, input.lotId);
    if (await loteDividido(tx, input.lotId)) throw new LotProcessError("lote_dividido");
    const cobertura = await procesoQueCubre(tx, input.lotId);
    if (cobertura.estado === "mezcla") throw new LotProcessError("lote_mezclado");
    if (cobertura.estado === "sin_proceso") throw new LotProcessError("process_not_found");
    if (cobertura.estado === "abierto") throw new LotProcessError("process_already_open");
    const cerrado = await tx.lotProcess.findUniqueOrThrow({ where: { id: cobertura.vigente.id } });
    if (cerrado.closureKind !== "moisture") throw new LotProcessError("lote_dividido");

    // Primero sale de bodega, DESPUÉS se comprueba R2 dentro de abrirProcesoEnTx: si fuera al revés,
    // R2 lo rechazaría por estar en bodega, que es justo de donde se le está sacando.
    const bodega = await tx.storageAssignment.findFirst({ where: { lotId: input.lotId, endedAt: null } });
    if (bodega) await tx.storageAssignment.update({ where: { id: bodega.id }, data: { endedAt: input.ocurrioEn } });

    const continuacion = await abrirProcesoEnTx(tx, userAccountId, {
      lotId: input.lotId,
      processRecipeVersionId: cerrado.processRecipeVersionId,
      intent: cerrado.intent,
      processGradeValueId: cerrado.processGradeValueId,
      cherryStateValueId: cerrado.cherryStateValueId,
      targetMoisturePct: cerrado.targetMoisturePct,
      startedAt: input.ocurrioEn,
      notes: cerrado.notes,
      provenanceClass: cerrado.provenanceClass,
      sourceReference: cerrado.sourceReference,
      derivedFromLotProcessId: cerrado.id,
    });
    const devolucion = await tx.lotProcessReturn.create({
      data: {
        closedLotProcessId: cerrado.id,
        continuationLotProcessId: continuacion.id,
        reasonValueId: motivo.id,
        note: nota,
        endedStorageAssignmentId: bodega?.id ?? null,
        occurredAt: input.ocurrioEn,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.return_to_drying",
        entityType: "lot_process_return",
        entityId: devolucion.id,
        after: devolucion,
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );
    return { continuacion, devolucion };
  });
}
```

Importar `abrirProcesoEnTx` de `./procesoDelLinaje`.

En `opcionesParaProceso`, añadir a su `Promise.all` de grados y estados una tercera consulta:

```ts
    prisma.variableCatalogValue.findMany({
      where: { catalog: { key: CATALOGO_MOTIVO_DEVOLUCION } },
      orderBy: [{ displayOrder: "asc" }, { value: "asc" }],
    }),
```

desestructurada como `motivos`. En el `return`:
`motivosDeDevolucion: motivos.map((v) => ({ id: v.id, label: v.value })),`.

- [ ] **Paso 4: La acción, el formulario y cuándo se ofrece.**

En `app/actions/traceability.ts`, en `devolverASecadoAction`, la llamada pasa a ser:

```ts
    await devolverASecado(user.userAccountId, {
      lotId,
      motivoValueId: String(formData.get("motivoValueId") ?? ""),
      nota: emptyToNull(formData.get("nota")),
      ocurrioEn: new Date(),
    });
```

En `app/components/traceability/ProcesoDelLote.tsx`, sustituir `DevolverASecadoForm`:

```tsx
/**
 * Devolver el lote a secado — Parte 1, R7. Sólo por un defecto de humedad: el motivo sale de una
 * lista (para poder contar cuántas veces pasa y por qué), y «otro» exige nota. Abre una continuación
 * del proceso cerrado; el cierre anterior queda como lo que fue.
 */
export function DevolverASecadoForm({ lotId, motivos }: { lotId: string; motivos: OpcionSimple[] }) {
  const [estado, accion, pending] = useActionState(devolverASecadoAction, inicial);
  const t = useTranslations("Traceability");

  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="s-reason">{t("processBackToDryingReasonLabel")}</label>
        <select id="s-reason" name="motivoValueId" defaultValue="" required>
          <option value="">{t("chooseOption")}</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {t(`motivoDevolucion_${m.label}` as "motivoDevolucion_otro")}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="s-note">{t("processBackToDryingNoteLabel")}</label>
        <input id="s-note" name="nota" type="text" placeholder={t("processBackToDryingPlaceholder")} />
      </div>
      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("processBackToDryingButton")}
      </button>
    </form>
  );
}
```

En `app/lots/[id]/process/page.tsx`:
- importar `getCurrentStorageAssignment` de `../../../../lib/traceability/storage`;
- desestructurar `motivosDeDevolucion` de `opcionesParaProceso`;
- después de `const bloqueado = …`, añadir:

```ts
  // Parte 1, R7: «devolver a secado» se ofrece en todo lote en bodega o bloqueado al entrar. Antes
  // sólo salía con el cierre por encima del objetivo, y como la compuerta impide guardar algo así,
  // un lote EN BODEGA nunca lo veía, que es justo el caso que pide Daniel.
  const enBodega = (await getCurrentStorageAssignment(user.userAccountId, id)) !== null;
```

- la condición `{bloqueado && puedeGestionar ? (` pasa a `{(bloqueado || enBodega) && puedeGestionar ? (`;
- el texto `processBlockedFromStorage` se muestra sólo si `bloqueado`;
- el formulario es `<DevolverASecadoForm lotId={id} motivos={motivosDeDevolucion} />`.

Claves nuevas en `Traceability`, en los dos archivos. En `es.json`:

```json
    "processBackToDryingNoteLabel": "Nota (obligatoria con «otro»)",
    "motivoDevolucion_humedad_alta_por_error_de_manejo": "Humedad alta por error de manejo",
    "motivoDevolucion_error_de_medicion": "Error de medición",
    "motivoDevolucion_otro": "Otro",
```

En `en.json`:

```json
    "processBackToDryingNoteLabel": "Note (required with “other”)",
    "motivoDevolucion_humedad_alta_por_error_de_manejo": "High moisture from a handling error",
    "motivoDevolucion_error_de_medicion": "Measurement error",
    "motivoDevolucion_otro": "Other",
```

- [ ] **Paso 5: Verlas pasar.** `lotProcess.test.ts` y `bodegaConProceso.test.ts`, más
  `npx vitest run tests/arquitectura`: los guardias de traducciones, envío sin doble toque y
  `use server`.

- [ ] **Paso 6: Compuerta, commit y flip-test.**

| Mutación | Debe caer |
|---|---|
| en `devolverASecado`, mover el `if (bodega) … update` DESPUÉS de `abrirProcesoEnTx` | «desde bodega: termina la bodega…» (sale `lote_en_bodega`) |
| en `devolverASecado`, quitar `if (motivo.value === "otro" && !nota) throw …` | ««otro» exige nota…» |
| en `devolverASecado`, en vez de la continuación, `tx.lotProcess.update({ where: { id: cerrado.id }, data: { endedAt: null, closingMoistureMeasurementId: null, closureKind: null } })` y devolver ese proceso como `continuacion` | «devolver a secado abre una continuación…» y «…deja a los hermanos bajo el cerrado» |

---

### Tarea 9: Los lectores leen el proceso que cubre al lote (R7, lectores) y las pantallas lo muestran

**Archivos:**
- Modificar: `lib/traceability/lotProcess.ts` (`coberturaDelLote`, `puedeAbrirProceso`)
- Modificar: `lib/beneficio/datosDelTablero.ts`, `lib/beneficio/colaDeSecado.ts`,
  `lib/sensory/sessions.ts`, `lib/equipos/equipos.ts`, `lib/traceability/reporteDeProceso.ts` y
  `lib/traceability/samples.ts` (la muestra verde)
- Modificar: `app/lots/[id]/page.tsx`, `app/lots/[id]/process/page.tsx`,
  `app/lots/[id]/fermentation/new/page.tsx`, `app/beneficio/secado/page.tsx`,
  `app/reports/proceso/page.tsx`
- Modificar: `messages/es.json` y `messages/en.json`
- Modificar las pruebas: `tests/beneficio/colaDeSecado.test.ts`,
  `tests/traceability/divisionBajoProceso.test.ts`, `tests/traceability/bodegaConProceso.test.ts`,
  `tests/traceability/samples.test.ts`

**Interfaces:**
- Consume: `procesoQueCubre`, `procesosParaEntrada`, `gradoDelProcesoQueCubre` y
  `exigeSinOtroProcesoAbierto`.
- Produce:
  - `coberturaDelLote(userAccountId, lotId)`, que devuelve
    `{ estado, vigente: ProcesoDeLoteConLugar | null, cadena: ProcesoDeLoteConLugar[], composicion, paraEntrada }`;
  - `puedeAbrirProceso(userAccountId, lotId)`, que devuelve
    `{ puede: true } | { puede: false; motivo: string }`.

- [ ] **Paso 1: Las pruebas que fijan la conducta nueva.**

**Muestra verde.** En `bodegaConProceso.test.ts`:
- importar `createSampleFromLot` y `devolverASecado`;
- en el `beforeAll`, buscar el admin, como en la tarea 6.

```ts
describe("R7 — la muestra verde con proceso exige el proceso cerrado por humedad", () => {
  it("con una continuación abierta (devuelto a secado) no se saca muestra verde", async () => {
    const cereza = await lote("MV-C");
    const verde = await lote("MV-V");
    await enlazar([cereza], [verde]);
    const p = await abrirProcesoDePrueba(gestor, cereza);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(verde, 11) });
    const motivo = (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "error_de_medicion", catalog: { key: CATALOGO_MOTIVO_DEVOLUCION } } })).id;
    await devolverASecado(gestor, { lotId: verde, motivoValueId: motivo, ocurrioEn: ahora() });
    await expect(createSampleFromLot(admin, {
      sourceLotId: verde, sampleCode: `MV-${RUN}`, sampleType: "green_coffee", materialState: "GREEN", occurredAt: ahora(), provenanceClass: "original_record",
    } as Parameters<typeof createSampleFromLot>[1])).rejects.toThrow(/green_sample_before_reposo/);
  });
});
```

**Reporte.** En `divisionBajoProceso.test.ts`, importar `reporteDeProceso`
(de `../../lib/traceability/reporteDeProceso`) y añadir:

```ts
  it("el reporte no cuenta la fila del proceso dividido como un proceso más", async () => {
    const l = await lote("D10");
    await conSaldo(l, 100);
    const p = await abrirProcesoDePrueba(gestor, l);
    await dividir(l, 100, [50, 50]);
    const r = await reporteDeProceso(gestor);
    const fila = r.filas.find((f) => f.lotProcessId === p.id);
    expect(fila?.divididoEn).toHaveLength(2);
    const grupo = r.porProceso.find((g) => g.etiqueta === "Sin receta");
    expect(grupo?.filas).toBe(r.filas.filter((f) => f.etiqueta === "Sin receta" && f.divididoEn === null).length);
  });
```

**Cola de secado.** En `tests/beneficio/colaDeSecado.test.ts`, importar `estadoDeUnidad` (si no
está) y añadir:

```ts
it("con receta pero sin ritmo de secado, la cola lo dice así y no «sin receta»", () => {
  const ritmo = { expectedHours: null, turnEveryHours: null, humedadMinPct: null, humedadMaxPct: null };
  const base = { ritmo, horasSinVoltear: null, demora: null, debidas: 0, humedadPct: null };
  expect(estadoDeUnidad({ ...base, tieneReceta: true })).toBe("receta sin ritmo de secado");
  expect(estadoDeUnidad({ ...base, tieneReceta: false })).toBe("sin receta declarada");
});
```

**Ficha y tablero.** Su igualdad la fija la prueba «ficha y tablero reciben lo mismo…» de la tarea 2:
los dos pasan a llamar a `procesosParaEntrada`. Aquí no hace falta otra prueba; hace falta que los
dos la llamen (paso 3).

- [ ] **Paso 2: Verlas fallar.** Correr los tres archivos. Caen las tres pruebas nuevas, y
  `colaDeSecado` ni compila: `tieneReceta` no existe.

- [ ] **Paso 3: Los lectores.**

**`lib/traceability/lotProcess.ts`.** Añadir `procesoQueCubre`, `procesosParaEntrada` y
`exigeSinOtroProcesoAbierto` al import de `./procesoDelLinaje`, y al final del archivo:

```ts
const INCLUIR_PARA_PANTALLA = {
  processRecipeVersion: { include: { recipe: true } },
  processGradeValue: true,
  cherryStateValue: true,
  closingMoistureMeasurement: true,
  interventions: { orderBy: { occurredAt: "asc" as const }, include: { catalogValue: true, operator: true } },
  fermentationRuns: { orderBy: { startedAt: "asc" as const } },
  dryingRuns: { orderBy: { startedAt: "asc" as const } },
  lot: { select: { id: true, lotCode: true } },
} as const;

/**
 * Parte 1, R7: lo que la ficha y la página del proceso enseñan — el proceso que CUBRE al lote, en
 * qué lote vive, su historia (`cadena`) y, si es una mezcla, de qué está hecha. `paraEntrada` es lo
 * que la ficha pasa a `entradaDelLote`, por la MISMA función que usa el tablero.
 *
 * `listarProcesosDeLote` sigue existiendo: lista los procesos PROPIOS del lote, que es otra pregunta
 * (y la usan las pruebas).
 */
export async function coberturaDelLote(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [lot]);

  const cobertura = await procesoQueCubre(prisma, lotId);
  const ids =
    cobertura.estado === "mezcla" ? cobertura.composicion.procesos.map((p) => p.id) : cobertura.cadena.map((p) => p.id);
  const filas = await prisma.lotProcess.findMany({ where: { id: { in: ids } }, include: INCLUIR_PARA_PANTALLA });
  const porId = new Map(
    filas.map((p) => [
      p.id,
      {
        ...p,
        etiqueta: p.processRecipeVersion?.recipe.name ?? SIN_RECETA,
        recetaConVersion: p.processRecipeVersion ? `${p.processRecipeVersion.recipe.name} · v${p.processRecipeVersion.version}` : null,
        humedadDeCierre: p.closingMoistureMeasurement?.value.toNumber() ?? null,
        diferenciaContraObjetivo:
          p.closingMoistureMeasurement === null ? null : p.closingMoistureMeasurement.value.toNumber() - p.targetMoisturePct.toNumber(),
      },
    ]),
  );
  const presentar = (p: { id: string; origen: string; profundidad: number }) => ({ ...porId.get(p.id)!, origen: p.origen, profundidad: p.profundidad });

  return {
    estado: cobertura.estado,
    vigente: cobertura.vigente ? presentar(cobertura.vigente) : null,
    cadena: cobertura.cadena.map(presentar),
    composicion:
      cobertura.estado === "mezcla"
        ? { procesos: cobertura.composicion.procesos.map(presentar), ramaSinProceso: cobertura.composicion.ramaSinProceso }
        : null,
    paraEntrada: await procesosParaEntrada(prisma, lotId),
  };
}

export type CoberturaDelLote = Awaited<ReturnType<typeof coberturaDelLote>>;

/**
 * Si R2 dejaría abrir un proceso en este lote, para no OFRECER lo que va a fallar. No escribe; el
 * servidor vuelve a comprobarlo al abrir (ocultar un botón no es autorizar).
 */
export async function puedeAbrirProceso(userAccountId: string, lotId: string): Promise<{ puede: true } | { puede: false; motivo: string }> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [lot]);
  try {
    await exigeSinOtroProcesoAbierto(prisma, lotId);
    return { puede: true };
  } catch (error) {
    if (error instanceof LotProcessError) return { puede: false, motivo: error.message };
    throw error;
  }
}
```

**`lib/beneficio/datosDelTablero.ts`:**
- importar `procesoQueCubre` y `procesosParaEntrada` de `../traceability/procesoDelLinaje`;
- borrar `lotProcess: { select: procesoSelect },` de las DOS consultas de corridas;
- en el bucle, detrás de `if (lot.organizationId) organizaciones.add(lot.organizationId);`, añadir:

```ts
    // Parte 1, R7: el proceso del lote se busca HACIA ARRIBA, por la misma función que la ficha.
    // Antes salía de la FK de la corrida, que en toda corrida vieja es nula.
    const procesos = await procesosParaEntrada(prisma, lot.id);
    const cobertura = await procesoQueCubre(prisma, lot.id);
    const proceso = cobertura.vigente
      ? await prisma.lotProcess.findUnique({ where: { id: cobertura.vigente.id }, select: procesoSelect })
      : null;
```

- en `entradaDelLote({…})`, la propiedad `procesos: c.lotProcess ? … : []` pasa a `procesos,`;
- `const fases = c.lotProcess?.processRecipeVersion?.fases ?? [];` pasa a `proceso?.processRecipeVersion?.fases ?? []`;
- y lo mismo con `targets`.

**`lib/beneficio/colaDeSecado.ts`:**
- en la unión de `estado`, añadir el miembro `| "receta sin ritmo de secado"`;
- `estadoDeUnidad` recibe `tieneReceta: boolean` en su `input`, y su última comprobación pasa a:

```ts
  // Parte 1, R7: desde que las corridas llevan proceso, «sin receta» mentiría para una corrida cuyo
  // proceso SÍ tiene receta pero no declara ritmo de secado. Son dos situaciones y dos etiquetas.
  if (ritmo.expectedHours == null && ritmo.turnEveryHours == null) {
    return input.tieneReceta ? "receta sin ritmo de secado" : "sin receta declarada";
  }
```

- en el bucle de corridas, sustituir `const proceso = c.lotProcessId ? await prisma.lotProcess.findUnique({ where: { id: c.lotProcessId }, select: {…} }) : null;` por:

```ts
    // Parte 1, R7: el proceso del lote, buscado hacia arriba; no la FK de la corrida.
    const cobertura = await procesoQueCubre(prisma, lot.id);
    const proceso = cobertura.vigente
      ? await prisma.lotProcess.findUnique({
          where: { id: cobertura.vigente.id },
          select: {
            processGradeValue: { select: { value: true } },
            processRecipeVersion: {
              select: {
                fases: { where: { phase: "drying" }, select: { expectedHours: true, turnEveryHours: true, targetMoistureMinPct: true, targetMoistureMaxPct: true } },
                targets: { select: { variable: true, everyHours: true, phase: true } },
              },
            },
          },
        })
      : null;
```

- en la llamada a `estadoDeUnidad({…})`, añadir `tieneReceta: proceso?.processRecipeVersion != null,`;
- importar `procesoQueCubre`;
- quitar `lotProcessId: true,` del `select` de la corrida si ya no se usa.

En `app/beneficio/secado/page.tsx`, añadir al mapa `COLOR`:
`"receta sin ritmo de secado": "var(--nn-muted, #6f7780)",`.

En `messages/es.json` y `en.json`, namespace `Secado`, junto a `"colaEstado_sin_receta_declarada"`:
- en `es.json`, `"colaEstado_receta_sin_ritmo_de_secado": "receta sin ritmo de secado",`;
- en `en.json`, `"colaEstado_receta_sin_ritmo_de_secado": "recipe without drying rhythm",`.

**`lib/sensory/sessions.ts`:**
- en el `select` de `sourceLot`, quitar el bloque `lotProcesses: { … }` y añadir `id: true,`;
- importar `gradoDelProcesoQueCubre` de `../traceability/procesoDelLinaje`;
- sustituir el `return { hayMas, muestras: visibles.slice(0, limite).map(…) }` por:

```ts
  // Parte 1, R7: el grado del proceso que CUBRE al lote de origen. La muestra sale del verde, y su
  // proceso vive en la cereza: mirar sólo el último proceso del propio lote daba «sin grado».
  const muestras = [];
  for (const { id, sampleCode, sampleType, description, sourceLot, roastSessions } of visibles.slice(0, limite)) {
    muestras.push({
      id, sampleCode, sampleType, description,
      lotCode: sourceLot?.lotCode ?? null,
      organizationName: sourceLot?.organization?.name ?? null,
      processGrade: sourceLot ? await gradoDelProcesoQueCubre(prisma, sourceLot.id) : null,
      roastSessions,
    });
  }
  return { hayMas, muestras };
```

**`lib/equipos/equipos.ts`**, en `disponibilidadDeRecipientes`:
- la línea `select: { id: true, startedAt: true, lotProcess: { select: { lotId: true } } },` pasa a:

```ts
        // Parte 1, R7: el lote que ocupa el tanque es el que FERMENTA —la entrada de la transformación
        // que abrió la corrida—, no el lote donde vive el proceso (que con R3 es la cereza).
        select: { id: true, startedAt: true, transformations: { orderBy: { occurredAt: "asc" }, take: 1, select: { inputs: { select: { lotId: true } } } } },
```

- `lotId: corrida?.lotProcess?.lotId ?? null,` pasa a
  `lotId: corrida?.transformations[0]?.inputs[0]?.lotId ?? null,`;
- se corrige el comentario de encima de `fermentationRuns`, que decía que se ataba por `lotProcess`.

**`lib/traceability/reporteDeProceso.ts`:**
- en `FilaDeProceso`, añadir:

```ts
  /** Parte 1, R6: si el proceso se cerró dividido, los códigos de las partes. Esa fila no cuenta como
   *  proceso en los grupos: sus partes ya cuentan. */
  divididoEn: string[] | null;
```

- en el `include` de `lotProcesses`, añadir `derivations: { select: { lot: { select: { lotCode: true } } } },`;
- en el `filas.push({…})`, añadir
  `divididoEn: p.closureKind === "divided" ? p.derivations.map((d) => d.lot.lotCode) : null,`;
- donde se calculan `agrupar` y `faltan`, trabajar sobre
  `const filasQueCuentan = filas.filter((f) => f.divididoEn === null);` en vez de `filas`. El campo
  `filas` del reporte sigue devolviendo todas, con su marca.

En `app/reports/proceso/page.tsx`, línea 138, `<td>{f.etiqueta}</td>` pasa a:

```tsx
                    <td>
                      {f.etiqueta}
                      {f.divididoEn ? <span className="nn-muted"> · {t("processDividedInto", { partes: f.divididoEn.join(", ") })}</span> : null}
                    </td>
```

Clave nueva en `Traceability`:
- en `es.json`, `"processDividedInto": "dividido → {partes}",`;
- en `en.json`, `"processDividedInto": "divided → {partes}",`.

**`lib/traceability/samples.ts`**, la muestra verde:
- importar `procesoQueCubre` e `idsDeAscendencia` de `./procesoDelLinaje`;
- sustituir `tieneSecadoTerminadoArriba` entera por:

```ts
/**
 * ¿Algún antepasado de este lote terminó su secado? Antes subía con un tope de 6 y respondía «no»
 * al llegar al tope —la ausencia leída como «no miré»—. Desde la Parte 1 sube por `idsDeAscendencia`,
 * con el tope de 64 que LANZA al pasarlo.
 */
async function tieneSecadoTerminadoArriba(lotId: string): Promise<boolean> {
  for (const padre of await idsDeAscendencia(prisma, lotId)) {
    const fase = await faseActualDeLote(padre);
    if (fase?.tipo === "reposo") return true;
  }
  return false;
}
```

- dentro de `createSampleFromLot`, como primera línea del `if (input.materialState === "GREEN" …)`
  de la compuerta, convertida a bloque:

```ts
  if (input.materialState === "GREEN") {
    // Parte 1, R7: CON proceso, además de lo de hoy, el proceso que cubre al lote tiene que estar
    // cerrado por humedad (no dividido, no devuelto a secado). Es aditivo: no quita nada.
    const cobertura = await procesoQueCubre(prisma, sourceLot.id);
    const procesosQueDecidir =
      cobertura.estado === "mezcla" ? cobertura.composicion.procesos : cobertura.vigente ? [cobertura.vigente] : [];
    if (procesosQueDecidir.some((p) => p.endedAt === null || p.closureKind !== "moisture")) {
      throw new SampleValidationError("green_sample_before_reposo");
    }
  }
```

  seguido del código de hoy (`secadoEnLaAscendencia` y la comprobación de `faseActualDeLote`), sin
  cambios.

- [ ] **Paso 4: Las pantallas.**

**`app/lots/[id]/process/page.tsx`.** Se reescribe sobre `coberturaDelLote`:
- import: `coberturaDelLote` y `puedeAbrirProceso` en vez de `listarProcesosDeLote`;
- `let procesos; try { procesos = await listarProcesosDeLote(...) }` pasa a
  `let cobertura; try { cobertura = await coberturaDelLote(user.userAccountId, id); }`, con el mismo
  `catch`, pero **`lineage_too_deep` no es un 404**:

```ts
  } catch (error) {
    if (error instanceof LotProcessError && error.message === "lineage_too_deep") {
      return (
        <div>
          <h1>{t("processHeading")}</h1>
          <p className="nn-error">{t("processLineageTooDeep")}</p>
        </div>
      );
    }
    if (error instanceof LotProcessError) notFound();
    throw error;
  }
```

- `const abierto = …` pasa a
  `const abierto = cobertura.estado === "abierto" ? cobertura.vigente : null;`;
- `const ultimo = …` pasa a `const ultimo = cobertura.vigente;`, y `bloqueado` se calcula igual sobre
  `ultimo`;
- los procesos que se pintan son `cobertura.cadena`, en vez de `procesos`, del más cercano al más
  antiguo. En la cabecera de cada uno, cuando `p.lot.id !== id`, añadir:

```tsx
            {p.lot.id !== id ? <span className="nn-muted"> · {t("processLivesIn", { lotCode: p.lot.lotCode })}</span> : null}
            {p.origen === "continuacion" ? <span className="nn-muted"> · {t("processOriginContinuation")}</span> : null}
            {p.origen === "parte_de_division" ? <span className="nn-muted"> · {t("processOriginPart")}</span> : null}
```

- con `cobertura.estado === "mezcla"`, un bloque que lo diga y no nombre ningún proceso:

```tsx
      {cobertura.composicion ? (
        <section className="nn-section">
          <p>{t("processMixture", { partes: cobertura.composicion.procesos.map((p) => `${p.lot.lotCode} · ${p.etiqueta}`).join(" + ") })}</p>
          {cobertura.composicion.ramaSinProceso ? <p className="nn-muted">{t("processMixtureWithUnprocessed")}</p> : null}
        </section>
      ) : null}
```

- los dos `<AbrirProcesoForm …>` se ofrecen sólo si `puede.puede`, con
  `const puede = await puedeAbrirProceso(user.userAccountId, id);`. Cuando no se puede, en su lugar va
  `<p className="nn-muted">{t(\`processCannotOpen_${puede.motivo}\` as "processCannotOpen_process_already_open")}</p>`.
  Este segundo caso sustituye a la condición `procesos.length === 0` y a la de «abrir otro».

Claves nuevas en `Traceability`, primero en `es.json`. En `en.json` van las mismas claves con su
traducción.

```json
    "processLineageTooDeep": "El linaje de este lote es más profundo de lo que el sistema recorre (64 generaciones). Hay que revisarlo a mano.",
    "processLivesIn": "vive en {lotCode}",
    "processOriginContinuation": "continuación de una devolución a secado",
    "processOriginPart": "parte de una división",
    "processMixture": "Mezcla: {partes}. Una mezcla no lleva el nombre de un proceso.",
    "processMixtureWithUnprocessed": "Alguna rama de esta mezcla no pasó por ningún proceso.",
    "processCannotOpen_process_already_open": "Ya hay un proceso abierto en este café (en este lote, más arriba o más abajo).",
    "processCannotOpen_lote_dividido": "Este lote se dividió: lo que sigue pertenece a sus partes.",
    "processCannotOpen_lote_mezclado": "Este lote es una mezcla: abrir un proceso le daría el nombre de uno.",
    "processCannotOpen_lote_en_bodega": "El lote está en bodega: en bodega no se reprocesa. Si hay un defecto de humedad, «Devolver a secado».",
    "processCannotOpen_proceso_no_aplica_a_miel": "Los procesos son del café; la miel no los usa.",
    "processCannotOpen_lineage_too_deep": "El linaje de este lote es demasiado profundo para comprobarlo.",
    "processCannotOpen_lot_not_found": "No se encontró el lote.",
```

**`app/lots/[id]/fermentation/new/page.tsx`.** Sustituir `recetaDelProceso={null}`:

```ts
  // Parte 1, R4: la receta de la corrida es la del proceso que cubre al lote.
  const cobertura = await coberturaDelLote(user.userAccountId, id);
  const recetaDelProceso = cobertura.estado === "abierto" ? cobertura.vigente?.recetaConVersion ?? null : null;
```

y pasar `recetaDelProceso={recetaDelProceso}`. Importar `coberturaDelLote`.

**`app/lots/[id]/page.tsx`, la ficha:**
1. Mover `const currentStorage = storageAssignments.find((s) => s.endedAt === null) ?? null;`
   (línea 463) a **antes** de `const availableActions` (línea 404).
2. Antes de `const canSelect` (línea 358), añadir:

```ts
  // Parte 1, R3/R7: el proceso que CUBRE al lote decide qué se ofrece y qué grado ve el veredicto.
  let cobertura: CoberturaDelLote | null = null;
  let linajeDemasiadoHondo = false;
  try {
    cobertura = await coberturaDelLote(user.userAccountId, lot.id);
  } catch (error) {
    if (error instanceof LotProcessError && error.message === "lineage_too_deep") linajeDemasiadoHondo = true;
    else throw error;
  }
  const procesoAbierto = cobertura?.estado === "abierto";
```

3. `const canSelect = …` gana `&& !procesoAbierto` al final: R6.7, no se selecciona bajo un proceso
   abierto.
4. La entrada de los botones de fermentación y secado pasa de
   `...(!esMiel && !activeFermentation && !activeDrying ? ([…]) : [])` a
   `...(!esMiel && !activeFermentation && !activeDrying && procesoAbierto && !currentStorage ? ([…]) : [])`.
5. Sustituir `const procesos = faseAbierta ? await listarProcesosDeLote(user.userAccountId, lot.id) : [];`
   y el `procesos: procesos.map(…)` de `entradaDelLote` por `procesos: cobertura?.paraEntrada ?? [],`.
   Borrar la constante.
6. Donde se pinta la lista de acciones (buscar `availableActions.map`), justo después:

```tsx
      {!esMiel && !activeFermentation && !activeDrying && !procesoAbierto ? (
        <p className="nn-muted">{linajeDemasiadoHondo ? t("processLineageTooDeep") : t("startRunNeedsOpenProcess")}</p>
      ) : null}
```

7. En la sección `processingHeading`, encima del veredicto (`{veredicto ? <VeredictoDeBeneficio …/> : null}`):

```tsx
        {cobertura?.vigente ? (
          <p className="nn-muted">
            {t("processCoveringShown", {
              lotCode: cobertura.vigente.lot.lotCode,
              label: cobertura.vigente.etiqueta,
              state: cobertura.estado === "abierto" ? t("processOpen") : t("processClosed"),
            })}
          </p>
        ) : cobertura?.composicion ? (
          <p className="nn-muted">{t("processMixture", { partes: cobertura.composicion.procesos.map((p) => `${p.lot.lotCode} · ${p.etiqueta}`).join(" + ") })}</p>
        ) : null}
```

8. Imports: `coberturaDelLote`, `LotProcessError` y `type CoberturaDelLote` de `lotProcess`. Quitar
   `listarProcesosDeLote` si ya no se usa.

Claves en `Traceability`:
- en `es.json`:
  - `"startRunNeedsOpenProcess": "Para empezar una fermentación o un secado, este café necesita un proceso abierto («Proceso del lote»).",`
  - `"processCoveringShown": "Proceso de {lotCode}: {label}, {state}",`
- en `en.json`:
  - `"startRunNeedsOpenProcess": "To start a fermentation or drying, this coffee needs an open process (“Lot process”).",`
  - `"processCoveringShown": "Process of {lotCode}: {label}, {state}",`

- [ ] **Paso 5: Verlas pasar, y todo lo que lee procesos.**

```bash
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_recetas
npx vitest run tests/traceability/{bodegaConProceso,divisionBajoProceso,samples,reporteDeProceso,lotProcess}.test.ts tests/beneficio tests/sensory tests/equipos > /tmp/t9.txt 2>&1; echo "vitest=$?"; grep -E 'Test Files|Tests ' /tmp/t9.txt
npx vitest run tests/arquitectura > /tmp/arq.txt 2>&1; echo "arq=$?"; grep -E '×' /tmp/arq.txt | head
npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "tsc=$?"
```

Si `colaDeSecado.test.ts` cambia algún veredicto **porque ahora ve el proceso del lote** (antes sólo lo
veía con la FK puesta), es el arreglo, no una regresión. Ajustar la expectativa y decirlo en el
commit, nombrando la prueba.

- [ ] **Paso 6: Verlo en el navegador.** `npm run dev:local` contra la base propia
  (`DATABASE_URL=…/nectar_recetas`). Comprobar:
  - en la ficha de un pergamino cuyo proceso vive en la cereza, sale «Proceso de PE-…: …, abierto» y
    los botones de empezar;
  - en un lote sin proceso, sale la frase y no los botones;
  - en la página del proceso de un lote en bodega, sale «Devolver a secado» con la lista;
  - la cola de secado pinta la etiqueta nueva.

Captura de pantalla de cada una para el PR.

- [ ] **Paso 7: Inventarios, compuerta, commit y flip-test.**

| Mutación | Debe caer |
|---|---|
| en `samples.ts`, quitar el bloque nuevo de la compuerta verde | «con una continuación abierta… no se saca muestra verde» |
| en `reporteDeProceso.ts`, `agrupar` sobre `filas` en vez de `filasQueCuentan` | «el reporte no cuenta la fila del proceso dividido…» |
| en `colaDeSecado.ts`, devolver siempre `"sin receta declarada"` | «con receta pero sin ritmo de secado…» |
| en `datosDelTablero.ts`, volver a `procesos: []` | (lo cubre la prueba de la tarea 2 sobre `procesosParaEntrada` sólo si el tablero la llama: comprobar con `git grep -n procesosParaEntrada lib/beneficio/datosDelTablero.ts` que la llama, y decirlo) |

La lista de catas y la ocupación de tanques las vigila el guardia de fuente de la tarea 10, no una
prueba con base. Se dice aquí para que nadie las cuente dos veces.

---

### Tarea 10: Guardia — nadie lee el proceso de un lote fuera del resolvedor

**Archivos:**
- Crear: `tests/arquitectura/proceso-por-el-resolvedor.test.ts` (hermético: NO va en
  `pruebas-por-compuerta.txt`)

- [ ] **Paso 1: El guardia.**

```ts
/**
 * **Nadie lee el proceso de un lote fuera del resolvedor** — Parte 1, R7.
 *
 * ## El incidente que lo motiva (2026-09-30)
 * El proceso se abre sobre la cereza, y el secado, la bodega y la taza ocurren en sus descendientes.
 * Todo lo que buscaba el proceso «en el propio lote» —la compuerta de bodega, la ficha, la lista de
 * catas, la ocupación de tanques— dejaba de verlo a la primera generación, en silencio. La Parte 1
 * pasó todos a `procesoQueCubre`. Esto impide que uno nuevo vuelva al camino viejo.
 *
 * ## Qué mira
 * Tres formas de leer procesos POR LOTE, fuera de `lib/traceability/procesoDelLinaje.ts`:
 * - `lotProcess.find…({ where: { lotId`
 * - `lotProcesses:` (un `include`, `select` o `where` desde el lote)
 * - `lotProcess: { select: { lotId` (subir de una corrida al lote del proceso)
 * Las de `findUnique({ where: { id` no: buscan un proceso ya conocido.
 *
 * ## Qué NO mira
 * Una lectura escrita de otra forma (por ejemplo, un `where` construido en una variable aparte) no la
 * ve. Es una red para el camino de siempre, no una prueba de que no exista otro.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const DUENO = "lib/traceability/procesoDelLinaje.ts";

/** Excepciones, cada una con su razón. */
const EXCEPCIONES: Record<string, string> = {
  "lib/traceability/lotProcess.ts":
    "listarProcesosDeLote lista los procesos PROPIOS del lote (otra pregunta; la usan las pruebas), y coberturaDelLote carga por id lo que el resolvedor ya decidió.",
  "lib/traceability/reporteDeProceso.ts":
    "El reporte agrupa los procesos de cada lote por fila; su lectura por linaje es la Parte 5.",
};

export function lecturasPorLote(fuente: string): string[] {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const patrones = [
    /lotProcess\.(?:findFirst|findMany|findUnique|findFirstOrThrow|findUniqueOrThrow|count)\(\s*\{\s*where:\s*\{\s*lotId\b/g,
    /\blotProcesses\s*:/g,
    /\blotProcess\s*:\s*\{\s*select\s*:\s*\{\s*lotId\b/g,
  ];
  return patrones.flatMap((p) => [...sinComentarios.matchAll(p)].map((m) => m[0]));
}

function fuentes(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...fuentes(ruta));
    else if (/\.(ts|tsx)$/.test(nombre)) out.push(relative(RAIZ, ruta));
  }
  return out;
}

describe("el proceso de un lote se lee por el resolvedor", () => {
  it("el detector caza las tres formas (control del propio análisis)", () => {
    expect(lecturasPorLote("prisma.lotProcess.findFirst({ where: { lotId } })")).toHaveLength(1);
    expect(lecturasPorLote("include: { lotProcesses: { take: 1 } }")).toHaveLength(1);
    expect(lecturasPorLote("lotProcess: { select: { lotId: true } }")).toHaveLength(1);
    expect(lecturasPorLote("prisma.lotProcess.findUnique({ where: { id } })")).toHaveLength(0);
    expect(lecturasPorLote("// lotProcess.findFirst({ where: { lotId } })")).toHaveLength(0);
  });

  it("mira el repositorio de verdad: más de 100 archivos, y el resolvedor dispara su propio detector", () => {
    const todos = [...fuentes(join(RAIZ, "lib")), ...fuentes(join(RAIZ, "app"))];
    expect(todos.length).toBeGreaterThan(100);
    expect(lecturasPorLote(readFileSync(join(RAIZ, DUENO), "utf8")).length).toBeGreaterThan(0);
  });

  it("fuera del resolvedor y de las excepciones escritas, nadie lee procesos por lote", () => {
    const culpables = [...fuentes(join(RAIZ, "lib")), ...fuentes(join(RAIZ, "app"))]
      .filter((f) => f !== DUENO && !(f in EXCEPCIONES))
      .filter((f) => lecturasPorLote(readFileSync(join(RAIZ, f), "utf8")).length > 0);
    expect(culpables, `leen el proceso por lote sin pasar por ${DUENO}: ${culpables.join(", ")}`).toEqual([]);
  });

  it("las excepciones siguen siendo necesarias (no se quedan de adorno)", () => {
    for (const f of Object.keys(EXCEPCIONES)) {
      expect(lecturasPorLote(readFileSync(join(RAIZ, f), "utf8")).length, `${f} ya no lee por lote: quitar la excepción`).toBeGreaterThan(0);
    }
  });
});
```

`export function` en un archivo de prueba es como lo hace `un-solo-predicado-de-sitio.test.ts`. Si el
lint lo rechaza, quitar el `export`.

- [ ] **Paso 2: Verlo pasar**, con `npx vitest run tests/arquitectura/proceso-por-el-resolvedor.test.ts`.
  Si cae la tercera prueba, nombra el archivo que lee el proceso por el camino viejo: pasarlo al
  resolvedor, no a las excepciones, salvo que haya una razón que escribir.

- [ ] **Paso 3: Commit y flip-test.**

| Mutación | Debe caer |
|---|---|
| en `lib/sensory/sessions.ts`, volver a poner `lotProcesses: { select: { processGradeValue: { select: { value: true } } }, take: 1 }` en el `select` de `sourceLot` | «fuera del resolvedor… nadie lee procesos por lote» |
| en `lib/equipos/equipos.ts`, volver a `lotProcess: { select: { lotId: true } }` | la misma |

---

### Tarea 11: Una versión nueva de receta conserva las fases (R8)

**Archivos:**
- Modificar: `lib/traceability/processTargets.ts` (`createRecipeVersion`)
- Modificar: `tests/arquitectura/campos-con-dos-puertas.test.ts`
- Modificar: `tests/traceability/recipeVersions.test.ts`

- [ ] **Paso 1: Las pruebas.** En `recipeVersions.test.ts` añadir, con **otra receta**, porque la del
  fixture ya tiene v1 y v2, y las pruebas de después cuentan sus versiones:

```ts
describe("R8 (Parte 1) — una versión nueva conserva las fases de la anterior", () => {
  it("publicar una v2 sin fases copia las de la v1", async () => {
    const r = await createRecipeWithVersion(admin, {
      name: `RVER Natural fases ${RUN}`,
      organizationId,
      targets: [{ variable: "ph", moment: "final", phase: "fermentation" as const, unit: "pH", targetValue: 4 }],
      fases: [{ phase: "drying", expectedHours: 192, turnEveryHours: 1, targetMoistureMinPct: 11, targetMoistureMaxPct: 12 }],
    });
    const v2 = await createRecipeVersion(admin, r.id, [{ variable: "ph", moment: "final", phase: "fermentation" as const, unit: "pH", targetValue: 4.1 }]);
    const secado = v2.fases.find((f) => f.phase === "drying");
    expect(secado?.turnEveryHours).toBe(1);
    expect(secado?.targetMoistureMinPct?.toNumber()).toBe(11);
    expect(secado?.targetMoistureMaxPct?.toNumber()).toBe(12);
    expect(secado?.expectedHours).toBe(192);
  });
});
```

En `campos-con-dos-puertas.test.ts`, añadir:

```ts
/** Los campos que `CreateRecipeInput` declara dentro de `fases` (R8, Parte 1). */
function camposDeFase(): string[] {
  const src = leer(SERVICIO);
  const i = src.indexOf("export interface CreateRecipeInput");
  const desde = src.slice(src.indexOf("fases?: ReadonlyArray<{", i));
  const cuerpo = desde.slice(0, desde.indexOf("}>;"));
  return [...cuerpo.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((m) => m[1]!);
}

/**
 * El bloque `fases:` que escribe filas de fase en cada función. Se ancla en la función y corta en el
 * `include:` que sigue: el `include` de `createRecipeWithVersion` contiene `fases: true`, y cortar más
 * tarde haría que el bloque contuviera siempre «fases:».
 */
function bloqueDeFases(nombreFuncion: string): string {
  const src = leer(SERVICIO);
  const i = src.indexOf(`export async function ${nombreFuncion}`);
  if (i < 0) throw new Error(`No encuentro ${nombreFuncion}`);
  const j = src.indexOf("fases:", src.indexOf("targets: {", i));
  if (j < 0) return "";
  return src.slice(j, src.indexOf("include:", j));
}

describe("R8 — las fases llegan por las dos puertas", () => {
  it("el parseo encuentra los cinco campos de fase (control positivo)", () => {
    expect(camposDeFase()).toEqual(["phase", "expectedHours", "turnEveryHours", "targetMoistureMinPct", "targetMoistureMaxPct"]);
  });
  it("LOS DOS servicios escriben todas las columnas de fase", () => {
    for (const fn of ["createRecipeWithVersion", "createRecipeVersion"]) {
      const bloque = bloqueDeFases(fn);
      expect(bloque.length, `${fn} no tiene bloque fases:`).toBeGreaterThan(0);
      const faltan = camposDeFase().filter((c) => !new RegExp(`\\b${c}:`).test(bloque));
      expect(faltan, `${fn} no escribe: ${faltan.join(", ")}`).toEqual([]);
    }
  });
});
```

- [ ] **Paso 2: Verlas fallar.** Correr los dos archivos: la prueba de la v2 cae, y el guardia también,
  porque `createRecipeVersion` no tiene bloque `fases:`.

- [ ] **Paso 3: `createRecipeVersion`.** En `lib/traceability/processTargets.ts`:
- la firma gana un sexto parámetro, detrás de `expectedHours?: number | null,`:

```ts
  /**
   * R8 (Parte 1, 2026-09-30): las fases de la versión. **Sin pasarlas (`undefined`), se copian las de
   * la versión anterior** —la pantalla todavía no las edita, y publicar una v2 desde ella las borraba
   * en silencio, el mismo fallo que con las horas el 2026-09-13—. Un arreglo vacío explícito sí
   * significa «sin fases».
   */
  fases?: CreateRecipeInput["fases"],
```

- el `findUnique` de la receta pasa a
  `include: { versions: { orderBy: { version: "desc" }, take: 1, include: { fases: true } } },`;
- detrás de `validateExpectedHours(expectedHours);`, añadir:

```ts
  if (fases !== undefined) validateFases(fases);
  // Las copiadas ya se validaron al escribirse, y traen `Decimal`: no pasan por `validateFases`, que
  // compara números.
  const fasesDeLaVersion =
    fases !== undefined
      ? fases.map((f) => ({
          phase: f.phase,
          expectedHours: f.expectedHours ?? null,
          turnEveryHours: f.turnEveryHours ?? null,
          targetMoistureMinPct: f.targetMoistureMinPct ?? null,
          targetMoistureMaxPct: f.targetMoistureMaxPct ?? null,
        }))
      : (recipe.versions[0]?.fases ?? []).map((f) => ({
          phase: f.phase,
          expectedHours: f.expectedHours,
          turnEveryHours: f.turnEveryHours,
          targetMoistureMinPct: f.targetMoistureMinPct,
          targetMoistureMaxPct: f.targetMoistureMaxPct,
        }));
```

- en el `data` del `processRecipeVersion.create`, DESPUÉS de `targets: { create: … },`:

```ts
        fases: fasesDeLaVersion.length
          ? {
              create: fasesDeLaVersion.map((f) => ({
                phase: f.phase,
                expectedHours: f.expectedHours,
                turnEveryHours: f.turnEveryHours,
                targetMoistureMinPct: f.targetMoistureMinPct,
                targetMoistureMaxPct: f.targetMoistureMaxPct,
              })),
            }
          : undefined,
```

- `include: { targets: true }` pasa a `include: { targets: true, fases: true }`.

- [ ] **Paso 4: Verlas pasar**, con `recipeVersions`, `recipeAuthoring`, `editarBeneficio` y el
  guardia.

- [ ] **Paso 5: Commit y flip-test.**

| Mutación | Debe caer |
|---|---|
| `fasesDeLaVersion` siempre `[]` cuando no llegan | «publicar una v2 sin fases copia las de la v1» |
| quitar `turnEveryHours: f.turnEveryHours,` del bloque `fases:` del `create` | «LOS DOS servicios escriben todas las columnas de fase» |

---

### Tarea 12: Cada código, su texto (errores)

**Archivos:**
- Modificar: `app/actions/traceability.ts` (`friendlyError`)
- Modificar: `messages/es.json` y `messages/en.json`
- Crear: `tests/traceability/mensajesDeProceso.test.ts` (hermético)

- [ ] **Paso 1: La prueba.** Crear `tests/traceability/mensajesDeProceso.test.ts`:

```ts
/**
 * Cada código de error del proceso que tiene texto propio lo tiene en español Y en inglés.
 * Hermética: lee los JSON. El patrón es `tests/beneficio/mensajesDeAjustes.test.ts`.
 */
import { describe, it, expect } from "vitest";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
import { CODIGOS_DE_PROCESO_TRADUCIDOS } from "../../lib/traceability/errorDeProceso";

describe("los códigos del proceso tienen su texto en es y en", () => {
  it("control: la lista no está vacía", () => {
    expect(CODIGOS_DE_PROCESO_TRADUCIDOS.length).toBeGreaterThanOrEqual(12);
  });
  it("cada código tiene `Traceability.error_proceso_<código>` en los dos idiomas", () => {
    const faltan: string[] = [];
    for (const c of CODIGOS_DE_PROCESO_TRADUCIDOS) {
      const clave = `error_proceso_${c}`;
      if (!(es.Traceability as Record<string, string>)[clave]) faltan.push(`es:${clave}`);
      if (!(en.Traceability as Record<string, string>)[clave]) faltan.push(`en:${clave}`);
    }
    expect(faltan).toEqual([]);
  });
});
```

Si los otros archivos de prueba importan los JSON de otra forma (`readFileSync` + `JSON.parse`),
copiar esa forma.

- [ ] **Paso 2: Verla fallar.** Faltan todas las claves.

- [ ] **Paso 3: Los textos.** En `Traceability`, detrás de `"error_lot_process"`, en `es.json`:

```json
    "error_proceso_sin_proceso_abierto": "Para empezar una fermentación o un secado, este café necesita un proceso abierto.",
    "error_proceso_lote_dividido": "Este lote se dividió: lo que sigue pertenece a sus partes.",
    "error_proceso_lote_mezclado": "Este lote es una mezcla de procesos distintos: no puede llevar el nombre de uno.",
    "error_proceso_lote_en_bodega": "El lote está en bodega: en bodega no se reprocesa. Si hay un defecto de humedad, «Devolver a secado».",
    "error_proceso_proceso_no_aplica_a_miel": "Los procesos son del café; la miel no los usa.",
    "error_proceso_corridas_abiertas": "Hay una fermentación o un secado abierto en este café: termínalo antes.",
    "error_proceso_division_deja_remanente": "Dividir reparte el lote entero, con su merma: quedaría café fuera de las partes.",
    "error_proceso_seleccion_bajo_proceso_abierto": "Primero se selecciona y después se abre el proceso: este café ya tiene uno abierto.",
    "error_proceso_fusion_bajo_proceso_abierto": "No se fusiona café con un proceso abierto.",
    "error_proceso_receta_distinta_del_proceso": "La receta de la corrida es la del proceso del lote.",
    "error_proceso_lineage_too_deep": "El linaje de este lote es más profundo de lo que el sistema recorre (64 generaciones).",
    "error_proceso_motivo_otro_requiere_nota": "Con «otro», escribe el motivo en la nota.",
    "error_proceso_process_already_open": "Ya hay un proceso abierto en este café (en este lote, más arriba o más abajo).",
```

En `en.json`:

```json
    "error_proceso_sin_proceso_abierto": "To start a fermentation or drying, this coffee needs an open process.",
    "error_proceso_lote_dividido": "This lot was divided: what follows belongs to its parts.",
    "error_proceso_lote_mezclado": "This lot mixes different processes: it cannot carry the name of one.",
    "error_proceso_lote_en_bodega": "The lot is in storage: stored coffee is not reprocessed. For a moisture defect, use “Back to drying”.",
    "error_proceso_proceso_no_aplica_a_miel": "Processes are for coffee; honey does not use them.",
    "error_proceso_corridas_abiertas": "A fermentation or drying is still open in this coffee: end it first.",
    "error_proceso_division_deja_remanente": "Dividing splits the whole lot, with its loss: coffee would be left outside the parts.",
    "error_proceso_seleccion_bajo_proceso_abierto": "Select first, then open the process: this coffee already has one open.",
    "error_proceso_fusion_bajo_proceso_abierto": "Coffee with an open process is not merged.",
    "error_proceso_receta_distinta_del_proceso": "The run's recipe is the lot process's recipe.",
    "error_proceso_lineage_too_deep": "This lot's lineage is deeper than the system walks (64 generations).",
    "error_proceso_motivo_otro_requiere_nota": "With “other”, write the reason in the note.",
    "error_proceso_process_already_open": "There is already an open process in this coffee (in this lot, above or below it).",
```

- [ ] **Paso 4: La rama en `friendlyError`.** En `app/actions/traceability.ts`:
- importar `CODIGOS_DE_PROCESO_TRADUCIDOS` y `type CodigoDeProcesoTraducido` de
  `../../lib/traceability/errorDeProceso`. Es un archivo `"use server"`: se importa, no se exporta
  nada nuevo de él;
- justo ANTES de `if (error instanceof LotProcessError) return t("error_lot_process", …);`, añadir:

```ts
  // Parte 1: un texto por código. El genérico de abajo sigue para los demás, con el código de detalle.
  if (error instanceof LotProcessError && (CODIGOS_DE_PROCESO_TRADUCIDOS as readonly string[]).includes(error.message)) {
    return t(`error_proceso_${error.message as CodigoDeProcesoTraducido}` as "error_proceso_sin_proceso_abierto");
  }
  // R6.6 lanza `lote_dividido` también desde las mediciones y las muestras, con sus propias clases.
  if ((error instanceof MeasurementValidationError || error instanceof SampleFromLotValidationError) && error.message === "lote_dividido") {
    return t("error_proceso_lote_dividido");
  }
```

  Las ramas específicas van ANTES de las genéricas de su clase (`friendlyError` las mira en orden).

- [ ] **Paso 5: Verla pasar** y correr los guardias de arquitectura: `acciones-traducen-sus-errores`
  y `claves-de-traduccion-existen`.

- [ ] **Paso 6: Commit y flip-test.** Mutación: borrar la clave
  `error_proceso_lote_en_bodega` de `en.json`. Debe caer «cada código tiene… en los dos idiomas».

---

### Tarea 13: Cierre — compuerta entera, actualizar el diseño, PR por la coordinadora

**Archivos:**
- Modificar: `docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md`, sólo
  si algo cambió al construir
- Modificar: `docs/superpowers/specs/2026-09-30-recetas-del-beneficio-design.md` (estado de la Parte 1)

- [ ] **Paso 1: La compuerta entera, sin tubería.**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm run verify > /tmp/verify.txt 2>&1; echo "verify=$?"; tail -5 /tmp/verify.txt
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "ci=$?"; grep -E 'Test Files|Tests ' /tmp/ci.txt
npm run build > /tmp/build.txt 2>&1; echo "build=$?"; tail -5 /tmp/build.txt
```

Después, el carril con base, sobre una base vacía y propia, como lo corre CI:

```bash
PGBIN=/Applications/Postgres.app/Contents/Versions/latest/bin
$PGBIN/psql "postgresql://postgres@127.0.0.1:55433/postgres" -c 'DROP DATABASE IF EXISTS nectar_ci_recetas' -c 'CREATE DATABASE nectar_ci_recetas'
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_ci_recetas bash scripts/ci-con-base.sh > /tmp/cibase.txt 2>&1; echo "ci-con-base=$?"; grep -E 'Correrá|Test Files|Tests |ABORTA' /tmp/cibase.txt
```

Comprobar, además:
- que **ninguna prueba nueva aparece en el carril hermético** (`grep -E 'procesoDelLinaje|aperturaDeProceso|corridaConProceso|divisionBajoProceso|bodegaConProceso' /tmp/ci.txt`
  debe dar 0 líneas);
- que las dos herméticas nuevas **sí** aparecen.

Comparar los fallos de `/tmp/cibase.txt` con la línea base de la tarea 0. No puede haber ninguno
nuevo.

- [ ] **Paso 2: El diseño dice lo que se construyó.** Si algo se construyó distinto de como dice el
  diseño, corregir el diseño y decirlo. **Dos cosas se saben ya:**
  - la tabla de lectores nombra `coberturaDelLote`;
  - la lista de catas y los tanques se vigilan con el guardia de fuente, no con prueba con base.

  En el diseño general, la línea de la Parte 1 pasa a «construida, PR #<n>».

- [ ] **Paso 3: Contar lo que lleva la rama y empujar.**

```bash
git log --oneline origin/main..HEAD
git diff --name-only origin/main...HEAD | wc -l
git push -u origin recetas-base
git rev-parse HEAD; git rev-parse @{u}      # iguales, o el push no llegó
```

- [ ] **Paso 4: El PR, y la fusión por la coordinadora.** Abrir el PR con
  `gh pr create -R danieljosegiraldez-png/nectar-nomada --body-file <archivo>`.

  El cuerpo lleva:
  - qué hace, regla por regla;
  - la línea base;
  - los flip-tests corridos, con la prueba que cayó en cada uno;
  - las capturas;
  - la migración y su comprobación manual del aborto.

  Termina con `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

  Contar archivos con `gh pr view <n> -R … --json changedFiles --jq .changedFiles` (no con `files`, que
  se corta en 100). **No se fusiona desde esta sesión:** en el OS, la fusión y cualquier edición de
  `SESSION_STATE.md` pasan por la sesión coordinadora, que lleva el turno.

- [ ] **Paso 5: Limpiar las bases locales propias.** Cuando el PR esté fusionado, o si se abandona:

```bash
PGBIN=/Applications/Postgres.app/Contents/Versions/latest/bin
for b in nectar_recetas nectar_recetas_shadow nectar_demo_recetas nectar_ci_recetas; do $PGBIN/psql "postgresql://postgres@127.0.0.1:55433/postgres" -c "DROP DATABASE IF EXISTS $b"; done
```

Y el dump del scratchpad. **Nunca** `nectar_test`.

---

## Autorrevisión del plan contra el diseño

| Regla del diseño | Tarea |
|---|---|
| R1 resolvedor, cadena, mezcla con composición, tope 64 en las dos direcciones, `UNION`/vistos | 2 |
| R2 una comprobación para abrir y devolver; dividido, bodega, mezcla, miel; concurrencia por `bloquearLinaje`; índice parcial | 1, 3, 8 |
| R3 se une en la transacción, sin proceso se bloquea, permiso sobre el lote de la corrida, sin evento nuevo, `colgarCorrida` fuera | 4 |
| R4 receta del proceso; formulario sin desplegable | 4, 9 |
| R5 no cerrar con corridas abiertas, unidas o no; `closureKind: moisture` | 1, 5 |
| R6 lote entero con la tolerancia del libro; sin corrida en curso; `divided` con su transformación; copias con origen e inicio en la división; historia por la cadena; lote dividido cerrado (proceso, corrida, medición, muestra); selección y fusión bajo proceso abierto | 6 |
| R7 compuerta dentro de la transacción y sólo al entrar; sin reprocesar en bodega; devolver = continuación con motivo de lista; lectores; guardia | 7, 8, 9, 10 |
| R8 copia de fases y su guardia | 11 |
| R9 nada se rellena; transición «sin proceso como hoy» | 7, 9 (compuertas que dejan pasar sin proceso) |
| Errores en es/en | 12 |

