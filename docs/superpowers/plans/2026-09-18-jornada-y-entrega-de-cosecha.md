# Jornada y entrega de cosecha — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la finca abra jornadas de cosecha, asigne recolectores a parcelas, y que cada
entrega (quién, origen, foto, peso de finca) quede enviada al beneficio sin crear lote. Y que el
recolector reporte situaciones de campo que ven sus superiores y quien tenga permiso.

**Architecture:**
- Cuatro tablas nuevas en el esquema `traceability`: `FincaRecolector`, `JornadaDeCosecha`,
  `AsignacionDeJornada` y `EntregaDeCosecha`.
- Un módulo de servicio por responsabilidad: `recolectores.ts`, `jornadasDeCosecha.ts` y
  `entregasDeCosecha.ts`.
- Las situaciones de campo reusan `FieldSession`/`FieldEvent`: una jornada de campo por
  recolector y jornada de cosecha, con dos columnas nuevas en `FieldEvent` (bloque y planta) y
  una compuerta propia.

**Tech Stack:** Next.js 16 (server actions), Prisma 7 (`generated/prisma/client`), Postgres,
vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-jornada-y-entrega-de-cosecha-design.md`
(aprobado 2026-09-18).

## Global Constraints

- **La entrega no crea lote.** Ningún `Lot`, `HarvestEvent` ni `QuantityEvent` sale de esta pieza.
- **Origen de la entrega:** exactamente uno de parcela o microparcela (`Location` `plot`),
  bloque (`PlotBlock`) o planta (`Specimen`). Es CHECK en la base, además de estar dentro de lo
  asignado a esa persona en esa jornada, comprobado en el servicio **dentro de la transacción**.
- **Peso de finca** > 0 (CHECK).
- **Una entrega enviada no se edita.** Se anula con motivo (CHECK: `anulada` ⇔ motivo y fecha).
- **Permisos:**
  - jornada y entrega ajena: `lot:manage` sobre el sitio de la finca;
  - entrega propia: `harvest_delivery:create_own` (perfil nuevo **Recolector**);
  - reportar situaciones: `field_report:create_own` (Recolector);
  - ver situaciones: `field_report:view`, de serie para Farm Manager y Farm Operator, y
    concedible a otros.
- **Condiciones del día:** tipo (lluvia, neblina, otro) y nota. El valor medido es la lectura
  de un instrumento de campo, **otra pieza** (`2026-09-18-instrumentos-de-campo-design.md`).
- Toda escritura, con su `AuditEvent` en la misma transacción.
- Pruebas con base en `scripts/pruebas-por-compuerta.txt` (`base-sembrada`). Permisos nuevos →
  `npm run db:seed` en la base propia `nectar_ci_entrega`.
- **Compuerta por tarea:** tipos, lint, estado, hermético, con base en base propia, build.
  **Commit antes de mutar**, y flip-test que compile y tumbe su prueba **por nombre**.
- Migración a mano, con nombres `<tabla>_<columna>_fkey`. Marca de tiempo posterior a la última
  de `origin/main` y a la de la base propia.

---

### Task 1: el esquema — recolectores, jornadas, asignaciones y entregas

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_jornada_y_entrega_de_cosecha/migration.sql`
- Test: `tests/traceability/entregaDeCosecha-esquema.test.ts` (base)

**Produce:**

```prisma
enum EstadoDeJornada { abierta cerrada  @@schema("traceability") }
enum EstadoDeEntrega { enviada anulada  @@schema("traceability") }

model FincaRecolector {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  personId       String    @map("person_id") @db.Uuid
  person         Person    @relation(fields: [personId], references: [id], onDelete: Restrict)
  fincaSiteId    String    @map("finca_site_id") @db.Uuid
  fincaSite      Location  @relation("FincaRecolectorSitio", fields: [fincaSiteId], references: [id], onDelete: Restrict)
  desde          DateTime
  hasta          DateTime?
  createdAt      DateTime  @default(now()) @map("created_at")
  createdBy      String?   @map("created_by") @db.Uuid
  @@index([fincaSiteId])
  @@map("finca_recolector") @@schema("traceability")
}

model JornadaDeCosecha {
  id           String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fincaSiteId  String          @map("finca_site_id") @db.Uuid
  fincaSite    Location        @relation("JornadaDeCosechaSitio", fields: [fincaSiteId], references: [id], onDelete: Restrict)
  fecha        DateTime        @db.Date
  estado       EstadoDeJornada @default(abierta)
  nota         String?
  cerradaAt    DateTime?       @map("cerrada_at")
  asignaciones AsignacionDeJornada[]
  entregas     EntregaDeCosecha[]
  createdAt    DateTime        @default(now()) @map("created_at")
  createdBy    String?         @map("created_by") @db.Uuid
  @@index([fincaSiteId, fecha])
  @@map("jornada_de_cosecha") @@schema("traceability")
}

model AsignacionDeJornada {
  id         String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  jornadaId  String           @map("jornada_id") @db.Uuid
  jornada    JornadaDeCosecha @relation(fields: [jornadaId], references: [id], onDelete: Cascade)
  locationId String           @map("location_id") @db.Uuid   // la parcela o microparcela lista
  location   Location         @relation("AsignacionParcela", fields: [locationId], references: [id], onDelete: Restrict)
  personId   String           @map("person_id") @db.Uuid
  person     Person           @relation("AsignacionRecolector", fields: [personId], references: [id], onDelete: Restrict)
  @@unique([jornadaId, locationId, personId])
  @@map("asignacion_de_jornada") @@schema("traceability")
}

model EntregaDeCosecha {
  id              String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  jornadaId       String          @map("jornada_id") @db.Uuid
  jornada         JornadaDeCosecha @relation(fields: [jornadaId], references: [id], onDelete: Restrict)
  recolectorId    String          @map("recolector_person_id") @db.Uuid
  recolector      Person          @relation("EntregaRecolector", fields: [recolectorId], references: [id], onDelete: Restrict)
  locationId      String?         @map("location_id") @db.Uuid
  location        Location?       @relation("EntregaParcela", fields: [locationId], references: [id], onDelete: Restrict)
  plotBlockId     String?         @map("plot_block_id") @db.Uuid
  plotBlock       PlotBlock?      @relation(fields: [plotBlockId], references: [id], onDelete: Restrict)
  specimenId      String?         @map("specimen_id") @db.Uuid
  specimen        Specimen?       @relation(fields: [specimenId], references: [id], onDelete: Restrict)
  pesoFincaKg     Decimal         @map("peso_finca_kg") @db.Decimal(10, 3)
  enviadaAt       DateTime        @map("enviada_at")
  anotadaPor      String          @map("anotada_por") @db.Uuid
  estado          EstadoDeEntrega @default(enviada)
  anuladaAt       DateTime?       @map("anulada_at")
  motivoAnulacion String?         @map("motivo_anulacion")
  assets          Asset[]
  createdAt       DateTime        @default(now()) @map("created_at")
  @@index([jornadaId])
  @@index([recolectorId])
  @@map("entrega_de_cosecha") @@schema("traceability")
}
```

Más:
- `Asset.entregaDeCosechaId` (anulable, FK);
- `FieldSession.jornadaDeCosechaId` (anulable, FK): la jornada de campo del recolector en esa
  jornada de cosecha;
- `FieldEvent.plotBlockId`, `FieldEvent.specimenId` y `FieldEvent.condicionDelDiaValueId`
  (anulables, FK; el último a `VariableCatalogValue`, del catálogo `condicion_del_dia`);
- las relaciones inversas en `Person`, `Location`, `PlotBlock` y `Specimen`.

**CHECKs en la migración:**
- `entrega_de_cosecha_un_origen`:
  `num_nonnulls(location_id, plot_block_id, specimen_id) = 1`;
- `entrega_de_cosecha_peso_positivo`: `peso_finca_kg > 0`;
- `entrega_de_cosecha_anulacion_completa`:
  `(estado = 'anulada') = (anulada_at IS NOT NULL AND length(btrim(coalesce(motivo_anulacion,''))) > 0)`;
- `finca_recolector_hasta_despues`: `hasta IS NULL OR hasta > desde`.

- [ ] **Paso 1 — pruebas en rojo:** sondas de base con control positivo. Se crea una jornada,
  y después:
  - una entrega con dos orígenes se rechaza por `entrega_de_cosecha_un_origen`, y sin ninguno
    también; con uno, entra;
  - una entrega con peso 0 se rechaza; con 1.5, entra;
  - `anulada` sin motivo se rechaza; con motivo y fecha, entra.
- [ ] **Paso 2** — migración a mano. Aplicarla a la base propia (`migrate deploy`) y
  `prisma generate`.
- [ ] **Paso 3** — verde, compuerta, commit. Flip: quitar el CHECK de un origen de la migración
  y de la base propia → cae «dos orígenes se rechaza».

### Task 2: recolectores y jornadas

**Files:**
- Create: `lib/traceability/recolectores.ts`, `lib/traceability/jornadasDeCosecha.ts`
- Modify: `lib/rbac/catalog.ts`
- Test: `tests/traceability/jornadasDeCosecha.test.ts` (base)

**Produce:**

```ts
export class JornadaError extends Error {}
export async function agregarRecolector(userAccountId: string, input: { fincaSiteId: string; personId: string; desde: Date }): Promise<FincaRecolector>;
export async function recolectoresDeFinca(userAccountId: string, fincaSiteId: string): Promise<{ personId: string; nombre: string }[]>;
export async function abrirJornada(userAccountId: string, input: { fincaSiteId: string; fecha: Date; nota?: string | null;
  asignaciones: { locationId: string; personId: string }[] }): Promise<JornadaDeCosecha>;
export async function cerrarJornada(userAccountId: string, jornadaId: string): Promise<JornadaDeCosecha>;
export async function jornadasDeFinca(userAccountId: string, fincaSiteId: string): Promise<JornadaDeCosecha[]>;
export async function detalleDeJornada(userAccountId: string, jornadaId: string): Promise<{ jornada, asignaciones, entregas }>;
```

- **Autorización:** `requireLotAccess(user, "manage", [{ locationId: fincaSiteId, classification }])`.
- **Reglas:**
  - cada `locationId` asignado es un `plot` bajo esa finca (`idsBajoLaFinca`, de
    `lib/traceability/fincas.ts`);
  - cada `personId` es recolector activo de esa finca en la fecha: `desde <= fecha` y
    `hasta` nulo o posterior;
  - la jornada abre con al menos una asignación;
  - cerrar una jornada ya cerrada da `JornadaError("ya_cerrada")`.
- Catálogo, permisos nuevos, sin tocar los que existen:
  - `harvest_delivery:create_own`;
  - `field_report:create_own`;
  - `field_report:view` (de serie en Farm Manager y Farm Operator).
- Catálogo, perfil nuevo **«Recolector»**: `harvest_delivery:create_own` y
  `field_report:create_own`.

- [ ] **Paso 1 — pruebas en rojo:**
  - el Farm Manager de la finca abre una jornada con dos asignaciones;
  - una parcela de otra finca se rechaza (`parcela_fuera_de_la_finca`);
  - una persona que no es recolectora de la finca se rechaza (`no_es_recolector`);
  - el Farm Operator de otra finca no abre (acceso);
  - cerrar dos veces da `ya_cerrada`;
  - control positivo: el Farm Operator de esta finca sí abre.
- [ ] **Paso 2–4** — implementar, `db:seed` en la base propia, verde, compuerta, commit. Flip:
  quitar la comprobación de parcela bajo la finca → cae su prueba.

### Task 3: la entrega

**Files:**
- Create: `lib/traceability/entregasDeCosecha.ts`
- Modify: `lib/traceability/media.ts` (el `kind` `"entregaDeCosecha"`)
- Test: `tests/traceability/entregasDeCosecha.test.ts` (base)

**Produce:**

```ts
export class EntregaError extends Error {}
export type OrigenDeEntrega = { locationId: string } | { plotBlockId: string } | { specimenId: string };
export async function anotarEntrega(userAccountId: string, input: { jornadaId: string; recolectorPersonId: string;
  origen: OrigenDeEntrega; pesoFincaKg: number; enviadaAt: Date }): Promise<EntregaDeCosecha>;
export async function anularEntrega(userAccountId: string, input: { entregaId: string; motivo: string }): Promise<EntregaDeCosecha>;
export async function misEntregas(userAccountId: string): Promise<{ jornadas: …; entregas: … }>;
```

- **Autorización de `anotarEntrega`:**
  - si la `Person` de la cuenta (vía `userAccount.personId`) **es** el recolector:
    `can(user, "create_own", "harvest_delivery", {location: fincaSiteId})`;
  - si no: `requireLotAccess(user, "manage", …)` sobre la finca.

  Así el recolector no anota la de otro, y el capataz anota la de cualquiera.
- **Dentro de la transacción:**
  - la jornada está `abierta`;
  - el recolector está asignado en ella;
  - el origen es la parcela asignada, o un bloque de esa parcela, o una planta de ese bloque o
    de esa parcela.

  Después crea la fila con `anotadaPor = userAccountId` y su `AuditEvent`
  `harvest_delivery.create`.
- `anularEntrega`: motivo obligatorio, sólo con `lot:manage` (el recolector no anula), y su
  `AuditEvent`.
- **Fotos:** el `kind` `"entregaDeCosecha"` en `LotAssetParent` y `parentData`.
  - Sus funciones de subida exigen hoy un `lotId`, y la entrega no tiene lote. Se añaden
    `requestEntregaAssetUpload` y `finalizeEntregaAssetUpload` en `entregasDeCosecha.ts`, con la
    misma autorización que `anotarEntrega`.
  - Llaman al almacenamiento igual que `requestLotAssetUpload` y crean el `Asset` con
    `entregaDeCosechaId`.

- [ ] **Paso 1 — pruebas en rojo:**
  - el capataz anota la de A;
  - A, con perfil Recolector, anota la suya;
  - A **no** anota la de B (`no_es_su_entrega`);
  - un origen fuera de lo asignado se rechaza (`origen_no_asignado`); un bloque de su parcela,
    entra;
  - en una jornada cerrada, `jornada_cerrada`;
  - anular sin motivo se rechaza; con motivo queda `anulada` y visible;
  - **ninguna entrega crea `Lot`**: el conteo de lotes no cambia.
- [ ] **Paso 2–4** — implementar, verde, compuerta, commit. Flip: aceptar la entrega de otro
  (quitar la comparación de persona) → cae «A no anota la de B».

### Task 4: las situaciones de campo del recolector

**Files:**
- Modify: `lib/traceability/jornadaDeCampo.ts` (compuerta), `lib/traceability/fieldSessions.ts`
- Create: `lib/traceability/situacionesDeCampo.ts`
- Modify: `lib/research/catalogs.ts` (catálogo `condicion_del_dia`: `lluvia`, `neblina`, `otro`)
- Test: `tests/traceability/situacionesDeCampo.test.ts` (base)

**Produce:**

```ts
export async function reportarSituacion(userAccountId: string, input: { jornadaId: string;
  sobre: OrigenDeEntrega; tipoValueId: string; nota?: string | null; ocurridaAt: Date }): Promise<FieldEvent>;
export async function reportarCondicionDelDia(userAccountId: string, input: { jornadaId: string; locationId: string;
  condicionValueId: string; nota?: string | null; ocurridaAt: Date }): Promise<FieldEvent>;
export async function situacionesDeJornada(userAccountId: string, jornadaId: string): Promise<FieldEvent[]>;
```

- **Reportar:**
  - exige `field_report:create_own` y que la cuenta sea recolector asignado en esa jornada, y
    reporta sobre lo que tiene asignado;
  - abre, o reusa, **su** `FieldSession` con `jornadaDeCosechaId` y `locationId` = la parcela
    asignada, **sin** pasar por `requireLocationAttributeAccess`: una compuerta propia en
    `jornadaDeCampo.ts`, como la del apiario;
  - graba el `FieldEvent` con `plotBlockId`/`specimenId` si el sujeto es un bloque o una
    planta;
  - tipo del catálogo `event_kind`, o «otro» con nota obligatoria.
- **Condición del día:** un `FieldEvent` de tipo `observacion` con `condicionDelDiaValueId`
  apuntando al valor del catálogo `condicion_del_dia`. El servicio comprueba que el valor es de
  ese catálogo, igual que `exigeCatalogosDeCereza` en `harvest.ts`. «Otro» exige nota. **Sin
  valor medido.**
- **Ver:**
  - quien lo reportó ve lo suyo;
  - con `field_report:view` sobre la finca, todo lo de la jornada;
  - a nadie más.

- [ ] **Paso 1 — pruebas en rojo:**
  - A reporta sobre su parcela;
  - sobre una parcela no asignada, `sobre_no_asignado`;
  - «otro» sin nota se rechaza;
  - el Farm Manager ve la situación de A;
  - un compañero C, Recolector sin `field_report:view`, **no** la ve;
  - C con `field_report:view` concedido en la finca **sí** la ve (control positivo);
  - reportar no da `location:manage_attributes`: A sigue sin poder editar la parcela.
- [ ] **Paso 2–4** — implementar, `db:seed`, verde, compuerta, commit. Flip: dejar que
  `situacionesDeJornada` devuelva todo sin mirar el permiso → cae «C sin permiso no la ve».

### Task 5: las pantallas de la finca — jornadas y entregas

**Files:**
- Create:
  - `app/finca/jornadas/page.tsx`;
  - `app/finca/jornadas/[id]/page.tsx`;
  - `app/actions/jornadasDeCosecha.ts` (`"use server"`, sólo `async`);
  - `app/components/traceability/AbrirJornadaForm.tsx`;
  - `app/components/traceability/AnotarEntregaForm.tsx`.
- Modify:
  - `app/finca/page.tsx` (enlace «Jornadas de cosecha» con la finca elegida);
  - `scripts/rutas-declaradas.mjs` y `tests/inventario-de-rutas.test.ts` (cifra **medida**);
  - los mensajes (`es`/`en`, namespace `Jornadas`).

- **`/finca/jornadas`:** usa la finca elegida (`fincaDeLaPagina`), lista sus jornadas, y el
  formulario de abrir una (fecha, parcelas de esa finca con casillas, recolectores por parcela)
  si tiene `lot:manage`.
- **`/finca/jornadas/[id]`:**
  - las asignaciones;
  - las entregas: quién, origen, kg de finca, anotada por, estado;
  - «Anotar entrega» (recolector, origen, peso, foto, hora);
  - «Anular» con motivo;
  - «Cerrar jornada».
- Los botones de envío con `BotonDeEnvio` o `disabled={pending}` (guardia de doble toque).
- [ ] **Paso 1** — tipos, lint, hermético (rutas, mensajes, guardias), build. **Paso 2** —
  commit. Sin navegador: hace falta sesión.

### Task 6: «Mis entregas», la pantalla del recolector

**Files:**
- Create:
  - `app/mis-entregas/page.tsx`;
  - `app/components/traceability/ReportarSituacionForm.tsx`.
- Modify:
  - `lib/navigation.ts`: entrada «Mis entregas», `requiresAnyOf: ["harvest_delivery:create_own"]`;
  - `tests/navigation.test.ts` si su conjunto de permisos del visor más privilegiado lo exige;
  - rutas y mensajes.

- La jornada abierta de hoy donde la cuenta está asignada, su «Anotar mi entrega» (origen de lo
  asignado, peso, foto) y «Reportar algo del campo» (sobre qué, tipo, nota, foto) o «Condición
  del día». Sus entregas del día, sin las de otros. Pensada para celular: una columna, botones
  grandes.
- [ ] **Paso 1** — tipos, lint, hermético, build. **Paso 2** — commit.

### Task 7: el cierre

- [ ] Cifras del inventario de acceso **medidas**; allowlist para los módulos nuevos.
- [ ] Guardias en verde: `audit-atomico`, acceso a datos, `use-server-solo-async`,
  `permissionCoverage` (cada `can(…, "harvest_delivery" | "field_report", …)` con el recurso
  literal).
- [ ] Compuerta final completa, con las pruebas nuevas contadas por nombre.
- [ ] `SESSION_STATE.md`: la entrada, y lo que le toca a Daniel (dar el perfil Recolector a
  cada recolector con cuenta).
- [ ] PR #431, con el título y la descripción nuevos. Fusión cuando Daniel lo diga.
