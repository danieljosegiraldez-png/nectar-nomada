# Las faenas con nombres estándar, la división y las reinas — plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: `superpowers:executing-plans` o
> `superpowers:subagent-driven-development`, tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** la fila de faenas de la colmena con los ocho nombres de los manuales, y lo que
Dividir, Unir y Reinas necesitan guardar: de qué colonia sale una división, con cuál se une una
colonia, y qué reina tuvo cada colonia y cuándo.

**Arquitectura:** la fila sigue siendo navegación (`?faena=`, sin columna). La genealogía son dos
columnas en `Colony` con CHECK. La reina es `Queen` + `QueenTenure` por intervalos — el mismo
mecanismo que los artefactos de colmena (#405): una tenencia abierta como mucho por colonia.

**Stack:** Next.js 16 · React 19 · Prisma 7 · Postgres · vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-faenas-division-y-reinas-design.md` (PR #407) — leerlo
entero antes de la Tarea 1. Rama: `faena/colmena` (PR #397), que ya trae el mecanismo de la fila.

## Restricciones globales

- **Ocho faenas, en este orden:** revisar · alimentar · tratar · contar varroa · dividir · reinas ·
  unir · cosechar. La enjambrazón va DENTRO de revisar. La captura de enjambres va en el apiario.
- **Ninguna cifra de los manuales entra al software**: sólo nombres. «Dos de cría y uno de alimento
  como mínimo» [D] es una guía en pantalla, nunca una validación.
- **No se infiere genealogía ni reina del pasado.** Una división vieja sin madre queda sin madre; una
  colonia sin ninguna reina registrada no es «huérfana» (ADR-080).
- **Sin marca de reina** (Daniel, 2026-09-18).
- **Permiso `apiary:manage`** para dividir, unir y cambiar reina. El `Apiary Colony Event Recorder`
  ve estas faenas con su razón, no las ejecuta.
- **SQL a mano con los nombres de la convención** `<tabla>_<columna>_fkey`; la base compartida puede
  ir POR DELANTE de git — mirar `_prisma_migrations` antes de elegir la marca de tiempo.
- **`npm run build` y los dos carriles en toda tarea que toque TypeScript**; pruebas de base
  declaradas en `scripts/pruebas-por-compuerta.txt`; **commitear ANTES de mutar**; flip-test que
  compile y tumbe su prueba por nombre.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/apiary/faena.ts` | la lista `FAENAS` (ocho) |
| `lib/apiary/genealogia.ts` | **nuevo** — `dividirColonia`, `unirColonias`, `lineaDeColonia` |
| `lib/apiary/hives.ts` | `createColony` ya no acepta `split` sin madre; `registrarFinDeColonia` no acepta `combined` sin receptora |
| `lib/apiary/reinas.ts` | **nuevo** — `introducirReina`, `cambiarReina`, `cerrarTenencia`, `reinaDeColonia`, `estadoDeReina` |
| `app/actions/apiary.ts` | las acciones de formulario de Dividir, Unir y Reinas |
| `app/apiaries/[id]/hives/[hiveId]/page.tsx` | las tres secciones nuevas y el aviso de enjambrazón en Revisar |
| `app/components/apiary/NewColonyForm.tsx`, `FinDeColoniaForm.tsx` | quitan `split` y `combined`: esas dos puertas pasan a Dividir y Unir |

---

## Tarea 1: la fila de ocho, y la enjambrazón dentro de Revisar

**Archivos:** `lib/apiary/faena.ts`, `tests/apiary/faena.test.ts`, la página de la colmena, mensajes.

- [ ] **Paso 1 — la prueba en rojo** (`tests/apiary/faena.test.ts`, hermética):

```ts
it("las ocho de los manuales, en su orden", () => {
  expect(FAENAS).toEqual(["revisar", "alimentar", "tratar", "varroa", "dividir", "reinas", "unir", "cosechar"]);
});
```

- [ ] **Paso 2 — `FAENAS`** con los ocho. `seccionAbierta` no cambia.
- [ ] **Paso 3 — el aviso en Revisar.** Si la colonia de la página tiene aviso de
  `avisosDeEnjambrazon(hive.locationId, hace60dias)` para su `colonyId`, la sección Revisar enseña
  «Celdas reales de {tipo} el {fecha}: riesgo de enjambrazón» y un enlace a `?faena=dividir#faena-dividir`.
  Mismo cálculo que ya usa la ficha del apiario (`app/apiaries/[id]/page.tsx:86`), no uno nuevo.
- [ ] **Paso 4 — las secciones Dividir, Reinas y Unir** existen ya con su `id="faena-…"` y un
  `<details open={seccionAbierta(faena, …)}>`, vacías hasta las Tareas 3 y 5: en esta tarea sólo
  dicen qué harán. Claves en las dos lenguas: `faena_dividir` «Dividir», `faena_reinas` «Reinas»,
  `faena_unir` «Unir».
- [ ] **Paso 5 — compuerta, commit, flip-test** (quitar `dividir` de la lista → cae «las ocho de los
  manuales»).

---

## Tarea 2: la genealogía de la colonia

**Archivos:** esquema, migración, `lib/apiary/genealogia.ts`, `lib/apiary/hives.ts`,
`tests/apiary/genealogia.test.ts` (base).

- [ ] **Paso 1 — la prueba en rojo:**

```ts
it("dividir crea la colonia hija en otra caja, con su madre", async () => {
  const hija = await dividirColonia(operario, { madreColonyId, destinoHiveId, occurredAt: hace(1) });
  expect(hija.parentColonyId).toBe(madreColonyId);
  expect(hija.originType).toBe("split");
  expect(hija.hiveId).toBe(destinoHiveId);
});
it("no se divide hacia una caja ocupada por una colonia activa", async () => {
  await expect(dividirColonia(operario, { madreColonyId, destinoHiveId: cajaOcupada, occurredAt: hace(1) }))
    .rejects.toThrow(/caja_ocupada/);
});
it("una colonia 'split' SIN madre ya no se crea — ni por el servicio ni por la base", async () => {
  await expect(createColony(admin, { hiveId, originType: "split", startedAt: hace(1), provenanceClass: "direct_observation" }))
    .rejects.toThrow(/division_sin_madre/);
  await expect(prisma.colony.create({ data: { hiveId, originType: "split", startedAt: hace(1), provenanceClass: "direct_observation", createdBy: admin } }))
    .rejects.toThrow(/colony_division_con_madre/);
});
it("unir cierra la débil como 'combined' apuntando a la que recibe; la receptora sigue activa", async () => {
  const cerrada = await unirColonias(operario, { debilColonyId, receptoraColonyId, occurredAt: hace(1) });
  expect(cerrada.status).toBe("combined");
  expect(cerrada.combinedIntoColonyId).toBe(receptoraColonyId);
  expect((await prisma.colony.findUniqueOrThrow({ where: { id: receptoraColonyId } })).status).toBe("active");
});
it("'combined' sin receptora ya no se registra", async () => {
  await expect(registrarFinDeColonia(operario, { colonyId, status: "combined", endedAt: hace(1) }))
    .rejects.toThrow(/union_sin_receptora/);
});
it("no se une una colonia consigo misma, ni con una que ya terminó", async () => { /* … */ });
it("la línea: de una madre salen sus hijas, y de ellas las nietas", async () => {
  expect((await lineaDeColonia(operario, madreColonyId)).hijas.map((c) => c.id)).toContain(hija.id);
});
it("sin apiary:manage no se divide ni se une — y el control positivo", async () => { /* ajeno vs operario */ });
```

- [ ] **Paso 2 — esquema:** en `Colony`, `parentColonyId String? @map("parent_colony_id") @db.Uuid`
  (relación `ColonyParent`, `onDelete: Restrict`) y `combinedIntoColonyId String?
  @map("combined_into_colony_id") @db.Uuid` (relación `ColonyCombinedInto`, `onDelete: Restrict`).
- [ ] **Paso 3 — migración:**

```sql
ALTER TABLE "apiary"."colony" ADD COLUMN "parent_colony_id" UUID, ADD COLUMN "combined_into_colony_id" UUID;
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_parent_colony_id_fkey" FOREIGN KEY ("parent_colony_id") REFERENCES "apiary"."colony"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_combined_into_colony_id_fkey" FOREIGN KEY ("combined_into_colony_id") REFERENCES "apiary"."colony"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- La madre sólo en una división, y la receptora sólo en una unión: SIEMPRE, también para lo viejo.
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_madre_solo_en_division" CHECK ("parent_colony_id" IS NULL OR "origin_type" = 'split');
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_receptora_solo_en_union" CHECK ("combined_into_colony_id" IS NULL OR "status" = 'combined');
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_no_es_su_propia_madre" CHECK ("parent_colony_id" IS DISTINCT FROM "id" AND "combined_into_colony_id" IS DISTINCT FROM "id");
-- Y obligatorias en las filas NUEVAS: NOT VALID no revisa las que ya existen. Producción puede tener
-- divisiones o uniones registradas antes de hoy sin pareja, y adivinársela sería inventar (ADR-080).
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_division_con_madre" CHECK ("origin_type" <> 'split' OR "parent_colony_id" IS NOT NULL) NOT VALID;
ALTER TABLE "apiary"."colony" ADD CONSTRAINT "colony_union_con_receptora" CHECK ("status" <> 'combined' OR "combined_into_colony_id" IS NOT NULL) NOT VALID;
```

- [ ] **Paso 4 — el servicio** `lib/apiary/genealogia.ts`:
  - `dividirColonia(userAccountId, { madreColonyId, destinoHiveId, occurredAt, nota? })`:
    `requireApiaryAccess(manage)` sobre la caja de la madre **y** sobre la de destino; la madre
    `active`; destino sin colonia `active`; `occurredAt >= madre.startedAt`. Crea la hija
    (`originType: "split"`, `parentColonyId`, `startedAt: occurredAt`, `provenanceClass:
    "direct_observation"`) y su `AuditEvent` `colony.split` con `before: madre` en una transacción.
  - `unirColonias(userAccountId, { debilColonyId, receptoraColonyId, occurredAt })`: las dos
    `active`, distintas, del mismo apiario; cierra la débil (`status: combined`, `endedAt`,
    `combinedIntoColonyId`) con su `AuditEvent` `colony.combine`.
  - `lineaDeColonia(userAccountId, colonyId)`: `{ madre, hijas }`, con `requireApiaryAccess(view)`.
  - En `hives.ts`: `createColony` lanza `ColonyEndError`-hermana `ColoniaInvalida("division_sin_madre")`
    si `originType === "split"` (las divisiones se hacen con `dividirColonia`);
    `registrarFinDeColonia` lanza `ColonyEndError("union_sin_receptora")` si `status === "combined"`
    (las uniones se hacen con `unirColonias`). La cola de campo ya trata `ColonyEndError` como
    rechazo — comprobarlo en `lib/sync/pushFieldEvents.ts` antes de dar el paso por cerrado.
- [ ] **Paso 5 — compuerta, declarar la prueba, allowlist de acceso, cifras, commit, flip-test**
  (quitar el `caja_ocupada` → cae su prueba).

---

## Tarea 3: las pantallas de Dividir y Unir, y cerrar las dos puertas viejas

**Archivos:** la página de la colmena, `app/actions/apiary.ts`, `NewColonyForm.tsx`,
`FinDeColoniaForm.tsx`, mensajes.

- [ ] **Dividir:** formulario con la caja de destino (las cajas del mismo apiario **sin colonia
  activa**, más «caja nueva» con identificador, que crea la caja con `createHive` antes de dividir en
  la misma acción), fecha (`datetime-local` + `TimezoneOffsetField`, vacío = ahora) y nota. Encima,
  la guía de [D] como texto: «Se extraen de tres a cinco marcos… dos de cría y uno de alimento como
  mínimo», citada. Y la **línea**: madre (si la hay) e hijas, con enlace a cada colmena.
- [ ] **Unir:** selector de la colonia receptora (las `active` del mismo apiario, menos ésta),
  fecha, y la explicación de [D]: «se pueden unir dos colmenas débiles siempre y cuando una de ellas
  esté huérfana».
- [ ] **Las puertas viejas:** `NewColonyForm` deja de ofrecer `split` (su lugar es Dividir);
  `FinDeColoniaForm` deja de ofrecer `combined` y dice «para unirla con otra, usa Unir».
  El guardia `un-solo-termino-para-el-vacio` y el de booleanos de tres estados siguen en verde.
- [ ] **Compuerta, commit.** Sin pantalla que probar en navegador (hace falta sesión): se dice.

---

## Tarea 4: la reina — `Queen` y `QueenTenure`

**Archivos:** esquema, migración, `lib/apiary/reinas.ts`, `tests/apiary/reinas.test.ts` (base).

- [ ] **Paso 1 — la prueba en rojo:**

```ts
it("introducir una reina abre su tenencia en la colonia", async () => {
  const { reina, tenencia } = await introducirReina(operario, { colonyId, origen: "comprada", desde: hace(10) });
  expect(tenencia.hasta).toBeNull();
  expect((await reinaDeColonia(operario, colonyId))?.id).toBe(reina.id);
});
it("¿qué reina tenía en una fecha anterior? — la de entonces, no la de hoy", async () => { /* cambio a hace(5), consulta hace(8) */ });
it("cambiar la reina cierra la vieja y abre la nueva en el MISMO instante", async () => {
  const r = await cambiarReina(operario, { colonyId, nueva: { origen: "criada_aqui", origenColonyId: madre }, cuando: hace(5), finDeLaVieja: "cambiada" });
  expect(r.cerrada.hasta?.getTime()).toBe(r.abierta.desde.getTime());
});
it("una colonia no puede tener dos reinas abiertas — tampoco por SQL", async () => {
  await expect(prisma.queenTenure.create({ /* segunda abierta */ })).rejects.toThrow(/colony_id/);
});
it("«criada aquí» exige de qué colonia salió; los demás orígenes no la llevan", async () => { /* CHECK y servicio */ });
it("«otro» exige nota", async () => { /* … */ });
it("huérfana: colonia activa cuya última reina terminó y ninguna abrió", async () => {
  await cerrarTenencia(operario, { colonyId, cuando: hace(1), fin: "muerta" });
  expect((await estadoDeReina(operario, colonyId)).estado).toBe("HUERFANA");
});
it("una colonia sin NINGUNA reina registrada NO es huérfana: es «sin registro»", async () => {
  expect((await estadoDeReina(operario, otraColonyId)).estado).toBe("SIN_REGISTRO");
});
it("sin apiary:manage no se introduce ni se cambia — y el control positivo", async () => { /* … */ });
```

- [ ] **Paso 2 — esquema y migración:**

```prisma
enum QueenOrigin { criada_aqui comprada natural de_enjambre otro  @@schema("apiary") }
enum QueenTenureEnd { cambiada muerta perdida enjambro otro  @@schema("apiary") }

model Queen {
  id              String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  origin          QueenOrigin
  /// La colonia donde se crió, cuando `origin = criada_aqui` — y sólo entonces (CHECK).
  originColonyId  String?     @map("origin_colony_id") @db.Uuid
  originColony    Colony?     @relation("QueenOriginColony", fields: [originColonyId], references: [id], onDelete: Restrict)
  notes           String?
  tenures         QueenTenure[]
  provenanceClass ProvenanceClass @map("provenance_class")
  createdAt DateTime @default(now()) @map("created_at")
  createdBy String?  @map("created_by") @db.Uuid
  creator   UserAccount? @relation("QueenCreatedBy", fields: [createdBy], references: [id])
  @@map("queen") @@schema("apiary")
}

model QueenTenure {
  id       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  queenId  String   @map("queen_id") @db.Uuid
  queen    Queen    @relation(fields: [queenId], references: [id], onDelete: Restrict)
  colonyId String   @map("colony_id") @db.Uuid
  colony   Colony   @relation(fields: [colonyId], references: [id], onDelete: Restrict)
  desde    DateTime
  hasta    DateTime?
  fin      QueenTenureEnd?
  finNota  String?  @map("fin_nota")
  createdAt DateTime @default(now()) @map("created_at")
  createdBy String?  @map("created_by") @db.Uuid
  creator   UserAccount? @relation("QueenTenureCreatedBy", fields: [createdBy], references: [id])
  @@index([colonyId, desde]) @@map("queen_tenure") @@schema("apiary")
}
```

  CHECKs: `hasta > desde`; `fin` presente sii `hasta` presente; `fin_nota` no vacía si `fin = otro`;
  `origin_colony_id` presente sii `origin = criada_aqui`; `notes` no vacía si `origin = otro`.
  Índices parciales únicos: `queen_tenure(colony_id) WHERE hasta IS NULL` y
  `queen_tenure(queen_id) WHERE hasta IS NULL` (una reina no está en dos colonias a la vez).
- [ ] **Paso 3 — el servicio** `lib/apiary/reinas.ts`, todo con `requireApiaryAccess` sobre la caja de
  la colonia, AuditEvent en la misma transacción, y la regla de intervalos de los artefactos
  (cerrado a la izquierda, abierto a la derecha; la nueva no empieza antes que la vigente):
  `introducirReina`, `cambiarReina`, `cerrarTenencia`, `reinaDeColonia(user, colonyId, en?)`,
  `estadoDeReina(user, colonyId)` → `{ estado: "CON_REINA" | "HUERFANA" | "SIN_REGISTRO", desde? }`.
- [ ] **Paso 4 — compuerta, declarar, allowlist, cifras, commit, flip-test** (hacer que
  `estadoDeReina` devuelva `HUERFANA` sin tenencias → cae «sin NINGUNA reina registrada»).

---

## Tarea 5: la pantalla de Reinas, y la reina en la división

**Archivos:** la página de la colmena, `app/actions/apiary.ts`, `lib/apiary/genealogia.ts`, mensajes.

- [ ] **Reinas:** el estado en palabras («reina desde el …», «huérfana desde el …», «sin reina
  registrada»); formulario de introducir (origen, colonia de origen si es *criada aquí*, fecha,
  nota) y de cambiar/cerrar (fin, fecha); y la historia de reinas de la colonia, con fechas.
- [ ] **La reina en la división:** `dividirColonia` acepta `reinaVa?: "madre" | "hija"`. Con
  `"hija"` y una tenencia abierta en la madre, en la MISMA transacción cierra la de la madre (fin
  `otro`, nota «pasó a la división») y abre la de la hija. Sin reina registrada, no inventa nada.
  Prueba en `genealogia.test.ts`.
- [ ] **Compuerta, commit, flip-test.**

---

## Tarea 6: el cierre

- [ ] Los permisos del `Apiary Colony Event Recorder`: las faenas que no puede hacer enseñan su
  razón (molde del 2026-09-17), comprobado en `tests/apiary/permisos-en-la-colmena.test.ts`.
- [ ] La cifra del router, medida; el inventario de acceso, medido.
- [ ] Compuerta final: `npx tsc --noEmit && npm run build && bash scripts/ci.sh && bash scripts/ci-con-base.sh`,
  las pruebas nuevas corridas juntas y contadas, y ninguna de base sin declarar.
- [ ] `SESSION_STATE.md`, PR #397 actualizado con el título y la descripción nuevos.

## Lo que este plan NO cubre

- Los lotes de cría de reinas (traslarve, celdas, núcleos de fecundación) — decisión de Daniel.
- La captura de enjambres en el apiario: ya existe como «nueva colonia» con origen *capturada*; si
  hace falta un atajo desde la ficha del apiario, es otro cambio.
- Marca de reina.
