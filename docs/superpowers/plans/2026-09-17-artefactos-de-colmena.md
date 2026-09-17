# Artefactos de colmena y nodo de sensores — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar
> `superpowers:subagent-driven-development` o `superpowers:executing-plans` para
> ejecutar tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que una colmena pueda decir **qué lleva puesto y desde cuándo**, y
que el sistema pueda recibir lo que mide un nodo de sensores sin perder el dato
crudo ni inventarse el tiempo.

**Arquitectura:** un solo mecanismo de intervalos —`HiveFitting`— sirve para el
excluidor, el reductor, el piso ventilado, el alimentador, las alzas y el nodo.
Lo que distingue al nodo es que apunta a un aparato con identidad. La telemetría
va en **dos** tablas —cruda inmutable y derivada versionada— y nunca en
`Measurement`, que es la medición humana.

**Stack:** Next.js 16 · React 19 · Prisma 7 · Postgres · vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md`
— léelo entero antes de la Tarea 1.

**Paquete de referencia:** `Smart Hive Node V1`, en
`~/Documents/Codex/2026-09-16/.../outputs/smart-hive-v1 2/`. Sus
`schemas/example-full.json` y `example-offline.json` son los **fixtures** de las
tareas 5 a 7: no se inventan cargas útiles.

## Restricciones globales

- **El tiempo desconocido se queda desconocido.** Regla literal del paquete:
  *«null observation time stays unknown; do not substitute ingestion time as if
  measured then»*. Ninguna tarea puede rellenar `occurredAt` con la hora de
  llegada.
- **Los valores ausentes son nulos con su fallo, nunca ceros.**
- **El dato crudo no se toca nunca.** Recalibrar produce una lectura derivada
  nueva; jamás muta la observación original.
- **Avisa, no diagnostica.** Ninguna tarea puede etiquetar un enjambre o una
  enfermedad a partir de estos sensores. Los avisos son «indicaciones basadas en
  reglas», palabras del paquete.
- **La captura de campo NO cambia.** Al operario se le sigue pidiendo sólo el
  cambio de configuración, nunca la configuración entera. Si una tarea añade una
  pregunta por visita, está mal.
- **`npm run build` en toda tarea que toque TypeScript.** `vitest` no comprueba
  tipos.
- **Toda prueba de base se declara en `scripts/pruebas-por-compuerta.txt`** — es
  lista de EXCLUSIÓN: lo que no esté ahí corre en el carril hermético, sin base,
  y falla ruidosamente.
- **Commitear ANTES de mutar.** El arnés de flip restaura desde HEAD. Costó seis
  ediciones el 2026-09-17.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` | `HiveFitting`, `HiveFittingKind`, `HiveNode`, `NodeObservation`, `NodeDerivedReading` |
| `lib/apiary/artefactos.ts` | **nuevo** — instalar, retirar, corregir y leer intervalos |
| `lib/apiary/configuracionDeCaja.ts` | la foto en `Hive` pasa a escribirse SOLO al cerrar un intervalo |
| `lib/apiary/inspections.ts` | la inspección declara el cambio de configuración |
| `lib/sensores/ingesta.ts` | **nuevo** — validar, deduplicar y resolver la colmena del momento |
| `lib/rbac/catalog.ts` | permiso `hive_node:manage` |
| `app/api/v1/ingest/notehub/route.ts` | **nuevo** — el punto de entrada |

---

## Tarea 1: El intervalo — qué lleva puesta una colmena y desde cuándo

**Archivos:**
- Modificar: `prisma/schema.prisma`
- Crear: migración, `lib/apiary/artefactos.ts`
- Probar: `tests/apiary/artefactos.test.ts`

**Interfaces:**
- Produce: `instalarArtefacto(userAccountId, input)`, `retirarArtefacto(...)`,
  `artefactosDeColmena(userAccountId, hiveId, en?: Date)`.

- [ ] **Paso 1: la prueba en rojo**

```ts
it("un artefacto instalado y no retirado sigue puesto hoy", async () => {
  await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(30) });
  const puestos = await artefactosDeColmena(operario, hiveId);
  expect(puestos.map((a) => a.kind)).toContain("excluidor");
});

it("y CONSULTADO EN UNA FECHA ANTERIOR, no estaba", async () => {
  // La razón entera de que esto sea un intervalo y no un booleano. Si esta
  // prueba cae, se está contestando con la foto de hoy a una pregunta sobre
  // el pasado — que es justo lo que la ingestión de telemetría no puede hacer.
  await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(30) });
  const antes = await artefactosDeColmena(operario, hiveId, hace(60));
  expect(antes.map((a) => a.kind)).not.toContain("excluidor");
});

it("retirado, deja de estar puesto — pero SIGUE en la historia", async () => {
  const a = await instalarArtefacto(operario, { hiveId, kind: "reductor_de_piquera", installedAt: hace(30) });
  await retirarArtefacto(operario, { fittingId: a.id, removedAt: hace(10) });
  expect(await artefactosDeColmena(operario, hiveId)).toHaveLength(0);
  expect(await artefactosDeColmena(operario, hiveId, hace(20))).toHaveLength(1);
});

it("no se puede retirar antes de instalar", async () => {
  const a = await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(10) });
  await expect(retirarArtefacto(operario, { fittingId: a.id, removedAt: hace(20) }))
    .rejects.toThrow(/retiro_anterior_a_instalacion/);
});

it("las alzas llevan CUENTA, no una fila por alza", async () => {
  // Nadie numera las alzas en el patio. La identidad por alza sería un dato que
  // el campo no puede sostener.
  const a = await instalarArtefacto(operario, { hiveId, kind: "alza", installedAt: hace(5), count: 2 });
  expect(a.count).toBe(2);
});

it("sin acceso al apiario no se instala nada — y el control positivo al lado", async () => {
  await expect(instalarArtefacto(ajeno, { hiveId, kind: "excluidor", installedAt: hace(1) }))
    .rejects.toThrow(ApiaryAccessError);
  await expect(instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(1) }))
    .resolves.toBeTruthy();
});
```

- [ ] **Paso 2: correr y verla fallar.** `npx vitest run tests/apiary/artefactos.test.ts`
      — FALLA: el módulo no existe. Si dice «no tests», falta `DATABASE_URL`.

- [ ] **Paso 3: el esquema**

```prisma
/// Qué lleva puesta una colmena, y DESDE CUÁNDO.
///
/// Un booleano en `Hive` contesta «¿lleva excluidor hoy?»; esto contesta
/// «¿lo llevaba el 3 de mayo?», que es la pregunta que la ingestión de
/// telemetría tiene que poder hacer — un nodo que se movió de colmena tiene
/// datos viejos que pertenecen a la colmena anterior.
model HiveFitting {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  hiveId String @map("hive_id") @db.Uuid
  hive   Hive   @relation(fields: [hiveId], references: [id])

  kind HiveFittingKind

  /// Sólo para `alza`: dos o tres, no una fila por alza. Nadie las numera en
  /// el patio, y una identidad que el campo no puede sostener es una columna
  /// que se rellena mal.
  count Int?

  installedAt DateTime  @map("installed_at")
  /// Nulo = sigue puesta. **No** se rellena con «hoy» al leer.
  removedAt   DateTime? @map("removed_at")

  /// El nodo, cuando `kind` es `nodo_de_sensores`. Lo que distingue a un
  /// artefacto con identidad de uno sin ella.
  hiveNodeId String?   @map("hive_node_id") @db.Uuid
  hiveNode   HiveNode? @relation(fields: [hiveNodeId], references: [id])

  notes String?

  provenanceClass ProvenanceClass @map("provenance_class")

  createdAt DateTime     @default(now()) @map("created_at")
  createdBy String?      @map("created_by") @db.Uuid
  creator   UserAccount? @relation("HiveFittingCreatedBy", fields: [createdBy], references: [id])

  @@index([hiveId, installedAt])
  @@map("hive_fitting")
  @@schema("apiary")
}

/// Vocabulario cerrado con escape, la regla que Daniel dio para la
/// alimentación: «que no sea campo libre, que sean variables». Con `otro` y su
/// nota — un vocabulario sin escape enseña a mentir en la casilla más cercana.
enum HiveFittingKind {
  excluidor
  reductor_de_piquera
  piso_ventilado
  alimentador
  alza
  nodo_de_sensores
  otro

  @@schema("apiary")
}
```

- [ ] **Paso 4: el servicio**, con la consulta del intervalo como corazón:

```ts
export async function artefactosDeColmena(userAccountId: string, hiveId: string, en?: Date) {
  const hive = await prisma.hive.findUnique({ where: { id: hiveId }, select: { locationId: true } });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  await requireApiaryAccess(userAccountId, "view", [{ locationId: hive.locationId }]);

  // `en` ausente significa AHORA, no «todos». Y el intervalo es cerrado por la
  // izquierda y abierto por la derecha: un artefacto retirado el día 10 no
  // estaba puesto el día 10.
  const momento = en ?? new Date();
  return prisma.hiveFitting.findMany({
    where: {
      hiveId,
      installedAt: { lte: momento },
      OR: [{ removedAt: null }, { removedAt: { gt: momento } }],
    },
    orderBy: { installedAt: "asc" },
  });
}
```

- [ ] **Paso 5: migración, verde, `npm run build`, declarar la prueba, commit.**

- [ ] **Paso 6: flip-test** — quitar la condición de `removedAt` y confirmar que
      cae «retirado, deja de estar puesto» por su nombre.

---

## Tarea 2: La inspección declara el cambio, que es donde nacen los intervalos

La mitad de la instrucción de Daniel que **no** está implementada. Sin esto,
alguien tiene que ir a otra pantalla a declarar que puso un excluidor, y no lo
hará.

**Archivos:** `lib/apiary/inspections.ts`, `app/components/apiary/InspectionForm.tsx`
**Probar:** `tests/apiary/artefactos.test.ts` (mismo archivo)

- [ ] **Paso 1: la prueba en rojo**

```ts
it("declarar el cambio en la inspección abre el intervalo", async () => {
  await recordInspection(operario, { ...inspeccionBase, cambiosDeConfiguracion: [
    { kind: "excluidor", accion: "instalado" },
  ]});
  const puestos = await artefactosDeColmena(operario, hiveId);
  expect(puestos.map((a) => a.kind)).toContain("excluidor");
});

it("una inspección SIN cambios no toca nada — la captura no cambia", async () => {
  // El guardia de la instrucción de Daniel. Si esta cae, alguien hizo
  // obligatorio declarar la configuración en cada visita, que es exactamente
  // «coste sin información».
  const antes = await prisma.hiveFitting.count({ where: { hiveId } });
  await recordInspection(operario, inspeccionBase);
  expect(await prisma.hiveFitting.count({ where: { hiveId } })).toBe(antes);
});

it("el intervalo queda atado a la inspección que lo declaró", async () => {
  const i = await recordInspection(operario, { ...inspeccionBase, cambiosDeConfiguracion: [
    { kind: "reductor_de_piquera", accion: "instalado" },
  ]});
  const f = await prisma.hiveFitting.findFirstOrThrow({ where: { hiveId } });
  expect(f.installedInspectionId).toBe(i.id);
});
```

- [ ] **Paso 2: verla fallar. Paso 3: implementar dentro de la MISMA transacción
      que crea la inspección** — una inspección que se guarda y un intervalo que
      no sería una configuración fantasma.

- [ ] **Paso 4: verde, build, commit, flip-test.**

---

## Tarea 3: El booleano pasa a ser una caché con un solo escritor

**Archivos:** `lib/apiary/configuracionDeCaja.ts`
**Probar:** `tests/apiary/artefactos.test.ts`

- [ ] **Paso 1: la prueba en rojo**

```ts
it("instalar un excluidor pone el booleano de la colmena", async () => {
  await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: new Date() });
  const h = await prisma.hive.findUniqueOrThrow({ where: { id: hiveId } });
  expect(h.queenExcluder).toBe(true);
});

it("retirarlo lo apaga", async () => {
  const a = await instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: hace(5) });
  await retirarArtefacto(operario, { fittingId: a.id, removedAt: new Date() });
  const h = await prisma.hive.findUniqueOrThrow({ where: { id: hiveId } });
  expect(h.queenExcluder).toBe(false);
});

it("y el booleano NUNCA discrepa del intervalo — el guardia de la caché", async () => {
  // Una caché con dos escritores es una segunda fuente de verdad disfrazada.
  // Esta prueba recorre los dos y exige que digan lo mismo.
  await instalarArtefacto(operario, { hiveId, kind: "piso_ventilado", installedAt: hace(3) });
  const h = await prisma.hive.findUniqueOrThrow({ where: { id: hiveId } });
  const puestos = (await artefactosDeColmena(operario, hiveId)).map((a) => a.kind);
  expect(h.screenedBottomBoard).toBe(puestos.includes("piso_ventilado"));
  expect(h.queenExcluder ?? false).toBe(puestos.includes("excluidor"));
});
```

- [ ] **Paso 2: verla fallar. Paso 3: escribir la foto al cerrar el intervalo**,
      en la misma transacción, y **sólo ahí**. Ningún otro sitio escribe esos
      campos.

- [ ] **Paso 4: verde, build, commit, flip-test** — escribir el booleano desde
      otro sitio y confirmar que cae el guardia de la caché.

---

## Tarea 4: El nodo, un artefacto con identidad

**Archivos:** `prisma/schema.prisma`, `lib/rbac/catalog.ts`, migración
**Probar:** `tests/apiary/nodo.test.ts`

**Resolución tomada al escribir este plan, y reversible:** instalar o mover un
nodo exige **`hive_node:manage`**, no `apiary:manage`. La razón es la misma que
cerró `lot:release`: todo `Farm Operator` tiene `apiary:manage`, y **mover un
nodo reasigna datos** —las observaciones de mayo pasan a colgar de otra colmena—.
Si Daniel prefiere lo contrario, cuesta una migración de catálogo.

- [ ] **Paso 1: la prueba en rojo**

```ts
it("un Farm Operator NO puede instalar un nodo, aunque pueda instalar un excluidor", async () => {
  // El guardia de la tarea, con su control positivo al lado: sin él, este «no
  // puede» sería indistinguible del de una cuenta sin permisos.
  await expect(instalarArtefacto(operario, { hiveId, kind: "nodo_de_sensores", hiveNodeId: nodo.id, installedAt: new Date() }))
    .rejects.toThrow(ApiaryAccessError);
  await expect(instalarArtefacto(operario, { hiveId, kind: "excluidor", installedAt: new Date() }))
    .resolves.toBeTruthy();
});

it("el gestor del apiario sí", async () => { /* con hive_node:manage */ });

it("dos nodos no pueden estar en la misma colmena a la vez", async () => {
  // Un solo nodo por colmena en cualquier instante. Dos observaciones del mismo
  // minuto atribuidas a la misma colmena desde aparatos distintos no se pueden
  // reconciliar después.
  await instalarNodo(gestor, { hiveId, hiveNodeId: nodoA.id, installedAt: hace(10) });
  await expect(instalarNodo(gestor, { hiveId, hiveNodeId: nodoB.id, installedAt: hace(5) }))
    .rejects.toThrow(/nodo_ya_instalado/);
});

it("pero el MISMO nodo puede mudarse de colmena si se retira primero", async () => {
  const f = await instalarNodo(gestor, { hiveId, hiveNodeId: nodoA.id, installedAt: hace(10) });
  await retirarArtefacto(gestor, { fittingId: f.id, removedAt: hace(5) });
  await expect(instalarNodo(gestor, { hiveId: otraColmena, hiveNodeId: nodoA.id, installedAt: hace(4) }))
    .resolves.toBeTruthy();
});
```

- [ ] **Paso 2: verla fallar. Paso 3: `HiveNode` + el permiso + la unicidad.**

```prisma
model HiveNode {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  /// El `device_id` que manda el propio aparato: «rp2040-0011223344556677».
  deviceId String @unique @map("device_id")
  hardware String?
  firmware String?
  configurationId String? @map("configuration_id")
  organizationId String       @map("organization_id") @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id])
  lifecycleStatus EquipmentLifecycle @default(active) @map("lifecycle_status")
  fittings HiveFitting[]
  @@map("hive_node")
  @@schema("apiary")
}
```

- [ ] **Paso 4: migración, verde, build, declarar, commit, flip-test.**

---

## Tarea 5: La observación cruda, inmutable e idempotente

**Archivos:** `prisma/schema.prisma`, `lib/sensores/ingesta.ts`, migración
**Probar:** `tests/sensores/ingesta.test.ts`
**Fixtures:** `example-full.json` y `example-offline.json` del paquete, copiados
a `tests/fixtures/telemetria/`. **No se inventan cargas útiles.**

- [ ] **Paso 1: la prueba en rojo, con los dos ejemplos reales**

```ts
it("acepta el ejemplo completo del paquete y guarda el crudo entero", async () => {
  const r = await ingerirObservacion(cargaCompleta);
  const o = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: r.id } });
  expect(o.payload).toEqual(cargaCompleta);          // el crudo, tal cual llegó
  expect(o.deviceId).toBe("rp2040-0011223344556677");
});

it("el MISMO evento dos veces es un duplicado, no un error", async () => {
  // El paquete lo exige: «un acuse perdido puede producir un duplicado;
  // se requiere ingestión idempotente. Duplicado exacto = 200».
  await ingerirObservacion(cargaCompleta);
  const segunda = await ingerirObservacion(cargaCompleta);
  expect(segunda.duplicado).toBe(true);
  expect(await prisma.nodeObservation.count({ where: { deviceId: "rp2040-0011223344556677" } })).toBe(1);
});

it("mismo id con contenido DISTINTO se pone en cuarentena, no se pisa", async () => {
  await ingerirObservacion(cargaCompleta);
  await expect(ingerirObservacion({ ...cargaCompleta, observations: { ...cargaCompleta.observations, battery: { mv: 9999 } } }))
    .rejects.toThrow(/conflicto/);
});

it("time_quality «unknown» deja el tiempo DESCONOCIDO — no lo rellena con el de llegada", async () => {
  // La regla literal del paquete, y el ejemplo offline existe justo para esto:
  // trae `time_quality: "unknown"`. Si esta prueba cae, alguien sustituyó el
  // tiempo de medición por el de ingestión y el dato pasó a mentir.
  const r = await ingerirObservacion(cargaOffline);
  const o = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: r.id } });
  expect(o.observedAt).toBeNull();
  expect(o.receivedAt).not.toBeNull();
  expect(o.timeQuality).toBe("unknown");
});

it("resuelve la colmena DEL MOMENTO de la medición, no la de ahora", async () => {
  // La razón por la que la Tarea 1 es requisito de ésta.
  const f = await instalarNodo(gestor, { hiveId: colmenaA, hiveNodeId: nodo.id, installedAt: hace(60) });
  await retirarArtefacto(gestor, { fittingId: f.id, removedAt: hace(30) });
  await instalarNodo(gestor, { hiveId: colmenaB, hiveNodeId: nodo.id, installedAt: hace(29) });
  const r = await ingerirObservacion({ ...cargaCompleta, ts: segundos(hace(45)) });
  const o = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: r.id } });
  expect(o.hiveId).toBe(colmenaA);   // la de mayo, no la de hoy
});

it("una observación de un aparato desconocido se rechaza", async () => {
  await expect(ingerirObservacion({ ...cargaCompleta, device_id: "rp2040-inventado" }))
    .rejects.toThrow(/aparato_no_registrado/);
});
```

- [ ] **Paso 2: verla fallar. Paso 3: el modelo y el servicio.**

```prisma
/// El evento tal como llegó. **Inmutable**: nada lo actualiza nunca.
model NodeObservation {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  deviceId String @map("device_id")
  epoch    String
  seq      Int
  eventId  String @map("event_id")

  /// Los TRES tiempos, separados a propósito. `observedAt` nulo significa
  /// desconocido y **no** se rellena con `receivedAt`: el paquete lo prohíbe
  /// con esas palabras, y es la misma regla que «una humedad desconocida no se
  /// convierte en cero».
  observedAt  DateTime? @map("observed_at")
  receivedAt  DateTime  @default(now()) @map("received_at")
  timeQuality String    @map("time_quality")

  /// A qué colmena pertenecía EN EL MOMENTO de medirse. Nulo cuando no se pudo
  /// resolver — y entonces se dice, no se adivina.
  hiveId String? @map("hive_id") @db.Uuid
  hive   Hive?   @relation(fields: [hiveId], references: [id])

  /// El cuerpo entero, sin tocar. De aquí sale todo lo derivado, y aquí se
  /// vuelve cuando el algoritmo cambia.
  payload Json

  faults        Json
  missedSamples Int @map("missed_samples")

  @@unique([deviceId, epoch, seq])
  @@index([hiveId, observedAt])
  @@map("node_observation")
  @@schema("apiary")
}
```

- [ ] **Paso 4: migración, verde, build, declarar la prueba, commit.**

- [ ] **Paso 5: flip-test doble.** Primero: rellenar `observedAt` con
      `receivedAt` cuando `time_quality` es `unknown`, y confirmar que cae la
      prueba del tiempo desconocido **por su nombre**. Después: resolver la
      colmena con «la de ahora» y confirmar que cae la del momento.

---

## Tarea 6: La lectura derivada, versionada y recalculable

**Archivos:** `prisma/schema.prisma`, `lib/sensores/derivar.ts`, migración
**Probar:** `tests/sensores/derivar.test.ts`

- [ ] **Paso 1: la prueba en rojo**

```ts
it("los kilos salen del crudo y apuntan a su evento", async () => {
  const d = await derivarPeso(observacionId, { algoritmo: "hx711-lineal", version: 1 });
  expect(d.observationId).toBe(observacionId);
  expect(Number(d.value)).toBeCloseTo(50, 1);
});

it("recalcular con otra versión NO toca la observación — y conviven las dos", async () => {
  // La regla 4 del paquete: «recalibrar después no muta la evidencia original».
  // Misma regla que `ProcessRecipeVersion`: no se edita, se versiona.
  const antes = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: observacionId } });
  await derivarPeso(observacionId, { algoritmo: "hx711-lineal", version: 2 });
  const despues = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: observacionId } });
  expect(despues.payload).toEqual(antes.payload);
  expect(await prisma.nodeDerivedReading.count({ where: { observationId } })).toBe(2);
});

it("un sensor con fallo NO produce un cero: no produce nada, y lo dice", async () => {
  const d = await derivarPeso(observacionConFalloDeBascula, { algoritmo: "hx711-lineal", version: 1 });
  expect(d.value).toBeNull();
  expect(d.limitaciones).toContain("SENSOR_EN_FALLO");
});
```

- [ ] **Paso 2-4: verla fallar, implementar, verde, build, declarar, commit,
      flip-test** — devolver `0` en vez de `null` ante un fallo y confirmar que
      cae la tercera por su nombre.

---

## Tarea 7: El punto de entrada

**Archivos:** `app/api/v1/ingest/notehub/route.ts`, `scripts/rutas-declaradas.mjs`
**Probar:** `tests/sensores/ruta-de-ingesta.test.ts`

- [ ] **Paso 1: la prueba en rojo**, con los códigos que el paquete fija:

```ts
it("sin credencial de ruta: 401", async () => { expect((await post(carga, { auth: null })).status).toBe(401); });
it("cuerpo mayor de 16 KiB: 413", async () => { expect((await post(cargaEnorme)).status).toBe(413); });
it("carga malformada: 400", async () => { expect((await post({ roto: true })).status).toBe(400); });
it("duplicado exacto: 200", async () => { await post(carga); expect((await post(carga)).status).toBe(200); });
it("mismo id, contenido distinto: 409", async () => { await post(carga); expect((await post(cargaAlterada)).status).toBe(409); });
it("válida y nueva: 202", async () => { expect((await post(carga)).status).toBe(202); });
```

- [ ] **Paso 2: verla fallar. Paso 3: implementar. Paso 4: DECLARAR LA RUTA** en
      `scripts/rutas-declaradas.mjs` — el inventario la caza si no, como pasó con
      la pantalla de permisos el 2026-09-16.

- [ ] **Paso 5: verde, build, declarar la prueba, commit, flip-test.**

---

## Tarea 8: Verlo en la pantalla de la colmena

**Archivos:** `app/apiaries/[id]/hives/[hiveId]/page.tsx`, `messages/{es,en}.json`
**Probar:** `tests/apiary/artefactos-en-pantalla.test.ts`

Qué lleva puesta hoy y **desde cuándo**, y debajo la historia. Respetando el
permiso: quien no gestiona el apiario lo VE y no lo cambia — la Tarea de
permisos del 2026-09-17 ya dejó el molde, incluido decir por qué.

- [ ] Prueba, implementación, paridad de claves en las dos lenguas, verde,
      build, commit.

---

## Compuerta final

```bash
npx tsc --noEmit && npm run build && bash scripts/ci.sh && bash scripts/ci-con-base.sh
```

Y los dos controles que este plan exige por encima de los demás:

1. **Que cada prueba nueva haya corrido de verdad** — `ci.sh` **no nombra los
   archivos que pasan**, así que grepear su salida no vale: correr los archivos
   nuevos juntos y contar.
2. **Que ninguna prueba de base se haya quedado sin declarar** — comparar los
   archivos añadidos con `pruebas-por-compuerta.txt`, y el control de que una
   prueba hermética NO está en la lista.
