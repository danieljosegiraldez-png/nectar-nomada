# Secado por bandeja, paso 4 — el ambiente, a mano: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que el beneficio anote a mano cómo está el aire de una instalación de secado —temperatura, humedad relativa, cielo y ventilación—, en general o en un estante y nivel concretos, y que cada punto enseñe **su** última lectura con su edad, sin tomar nunca la de otro nivel.

**Arquitectura:** una tabla nueva de lecturas, inmutable y corregible por sustitución (la misma forma que `DryingTrayWeighing`), colgada de la instalación, con estante y nivel opcionales. Una función pura elige la lectura vigente de un punto **sólo entre las de ese mismo punto**. Se ve y se registra en `/instalaciones/[id]`, que ya enseña los estantes nivel por nivel.

**Stack:** Next.js 16 App Router con Server Actions · Prisma 7.9 sobre Postgres · next-intl · vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-18-secado-por-bandeja-y-su-receta-design.md`, §2 (las filas «cómo llegan las condiciones», «dónde se toma», «qué se anota», «catálogo de cielo», «catálogo de ventilación»), **§4.5** y §5 (la prueba «otro nivel» y el flip-test 3). Es el **paso 4** de su §6: «independiente de 2 y 3, puede ir en paralelo».

**Medido sobre:** `origin/main` = `225ff2bd` (2026-09-21). El paso 2a está en `main` (estantes, posiciones con `rackLevel`/`rackSlot`). El **2b no**: no existe `drying_run_tray`, así que aquí **no hay bandejas a las que colgar nada**.

## Tarea 0 — compuerta: Daniel aprueba los nombres ANTES de escribir código

La spec dice «`LecturaDeAmbiente` (nombre a contrastar con `03`)», y `docs/beneficio/00_reglas_del_modulo.md` manda: «un nombre usado en pruebas o documentos y ausente de `docs/03` es un defecto de especificación, no una licencia para inventarlo». **Ninguno de estos está aprobado.** Propuesta:

| nombre propuesto | dónde | por qué así |
|---|---|---|
| `DryingAmbientReading` | `traceability.drying_ambient_reading` | Los identificadores van en inglés (`00_reglas_del_modulo` §5). **No** `EnvironmentalObservation`: ese nombre ya lo reserva `DATA_ARCHITECTURE.md` §6 para la serie de **sensores**, estrecha (una variable por fila) y particionada por mes. Ésta es una fila ancha de una persona con cuatro cosas a la vez |
| `facilityLocationId`, `rackLocationId`, `rackLevel` | columnas | `rackLevel` ya existe con ese sentido en `Location`. **No hay «fila»**: la fila del cuarto **es** el estante (spec §4.1, `rackRow` retirado) |
| `airTemperatureC`, `temperatureEntryUnit` | columnas | `00_conventions` §1: °C con un decimal en `*_c`, y la unidad tecleada se conserva |
| `relativeHumidityPct` | columna | un decimal. **Aire**, no grano: el grano es `moisture` en `Measurement` |
| `SkyCondition`: `sunny`, `partly_cloudy`, `cloudy`, `rain` | enum `core` | catálogo de Daniel, 2026-09-18 |
| `skyNote` | columna | la nota libre, «nunca en su lugar» |
| `DryingVentilation`: `open`, `semi_open`, `closed`, `fan_or_dehumidifier` | enum `core` | catálogo de Daniel, 2026-09-18 |
| `ventilationNote` | columna | ídem |
| `sourceType` | columna, **reutiliza** `MeasurementSourceType` | la «fuente» de la spec. `manual` hoy; el enum ya tiene `sensor` y `device` para el día del registrador, sin migrar |

**Si Daniel cambia un nombre, se cambia aquí antes de empezar la Tarea 1**, en todo el plan. Su aprobación se anota en `docs/beneficio/03_public_api.md` §11 dentro del commit de la Tarea 1.

## Restricciones globales

- **Nombres:** sólo los de la Tarea 0, una vez aprobados. Cada uno se declara en `docs/beneficio/03_public_api.md` §11 **en el mismo commit** que lo introduce (`00_reglas_del_modulo` §7.6).
- **Lo que decidió Daniel y este plan aplica** (spec §2):
  - lectura **a mano**;
  - **por instalación, con nivel o fila opcional**;
  - se anotan **temperatura, humedad relativa, cielo/clima y ventilación**;
  - los dos catálogos, tal cual.
- **Lo que manda la spec §4.5, literal:**
  - «**Nunca se interpola** un valor para el nivel de la bandeja a partir de otros niveles»;
  - «una lectura vieja dice su edad en vez de pasar por actual».
- **Veracidad** (`21_rubrica_veracidad`):
  - cada lectura enseña su **hora, su edad y su fuente**;
  - un punto sin lectura propia dice «sin lectura de este nivel»: ni la general ni la de otro nivel ocupan su sitio;
  - **no se inventa un umbral de «vieja»**: no hay ninguno aprobado, así que la edad se enseña siempre y quien lee juzga.
- **Pedagogía** (`22_rubrica_pedagogica`, y `13_drying_moisture` §2, decisión de Daniel del 2026-09-19): la pantalla dice **para qué sirve** la lectura, y que la HR del aire no es la humedad del grano. Recuerda también que el secado es un ambiente compartido: ante un retraso, primero se actúa sobre el lote; tocar el cuarto afecta a todos.
- **Permiso:** registrar pide `sample:manage` sobre la instalación, el mismo que una inspección de cama («el mismo permiso de createSampleFromLot, sin inventar un recurso RBAC», `lib/traceability/samplingEvents.ts`). Ver pide `sample:manage` **o** `sample:view`. Farm Manager y Farm Operator tienen los dos (`lib/rbac/catalog.ts`). **Es una elección técnica, no una decisión aprobada**: se dice en el PR.
- **Quién lo hizo:** el desplegable de operador reutiliza `getObserverCandidates`, como la inspección. **La decisión abierta P-G** («quién aparece en quién lo hizo», hoy toda la plataforma) le aplica igual; este plan no la resuelve ni la empeora.
- **Reglas de la casa:**
  - reglas en la base: `CHECK` si es la misma fila, disparador si mira otra tabla;
  - cada regla con su **sonda y su control positivo**;
  - toda prueba con base va en `scripts/pruebas-por-compuerta.txt`, grupo `base-sembrada`;
  - `npx tsc --noEmit` y `npm run build` en toda tarea que toque TypeScript;
  - `git commit -F <archivo>`, archivo por archivo, contando `git diff --cached --stat`;
  - el flip-test va **después** del commit, con sha antes y después, compila, y el nombre de la prueba que cae.
- **Base de pruebas compartida (puerto 55433):**
  - `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test`;
  - `SHADOW_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nn_shadow_beneficio`;
  - **antes y después** de `prisma migrate deploy` sobre ella, **una línea a la sesión coordinadora** («Nectar Nomada Platform OS»): la base es de todas las sesiones;
  - **nunca** `test:db -- reset`.
- **Fusión:** pasa por la sesión coordinadora. Seis comprobaciones en verde sobre el sha del PR y `main` dentro por ascendencia.

## Fuera de este plan

- **La bandeja viendo la lectura de su instalación.** Es el consumidor final de §4.5, pero la bandeja en su corrida es el 2b, que no está en `main`. La función pura `lecturaDelPunto` de la Tarea 2 es la que usará; aquí la consume la rejilla de estantes.
- **Corregir una lectura desde la pantalla.** El servicio corrige, con razón, y está probado. El formulario de corrección se pregunta a Daniel **después** de ver el primer uso: no se adivina qué campos quiere reabrir.
- **Sensores y registradores** (spec §8).
- **Que el ambiente entre en ningún cálculo** —tramos, lo debido, alertas—: pasos 5 y siguientes.

## Mapa de archivos

| archivo | tarea |
|---|---|
| `prisma/migrations/20260921120000_ambiente_de_secado/migration.sql` | T1 |
| `prisma/schema.prisma` | T1 |
| `docs/beneficio/03_public_api.md` | T1 |
| `lib/traceability/ambienteVigente.ts` (pura, sin base) | T2 |
| `lib/traceability/ambiente.ts` (servicio) | T2 |
| `lib/traceability/secadoForm.ts` | T3: `CIELOS`, `VENTILACIONES`, `leerLecturaDeAmbiente` |
| `app/actions/instalaciones.ts` | T3: `registrarAmbienteFormAction` |
| `app/instalaciones/FormularioAmbiente.tsx` (nuevo) | T3 |
| `app/instalaciones/[id]/page.tsx` | T3 |
| `messages/es.json`, `messages/en.json` | T3 |
| pruebas: `tests/traceability/ambiente.test.ts` (base), `tests/traceability/ambienteVigente.test.ts` (hermética), `tests/traceability/secadoForm.test.ts` | T1–T3 |
| `scripts/pruebas-por-compuerta.txt` | T1 |
| `docs/architecture/DECISIONS.md`, `SESSION_STATE.md`, la spec §6 | T4 |

---

### Tarea 1: la tabla, sus reglas en la base y sus sondas

**Archivos:**
- Crear: `prisma/migrations/20260921120000_ambiente_de_secado/migration.sql`, `tests/traceability/ambiente.test.ts`
- Modificar: `prisma/schema.prisma`, `docs/beneficio/03_public_api.md`, `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Produce el modelo Prisma `DryingAmbientReading` y los enums `SkyCondition` y `DryingVentilation`, con los campos de la Tarea 0.
- Produce en la prueba las ayudas `montaje()` y `insertarCruda(datos)`, que las Tareas 2 y 3 reutilizan en el mismo archivo.

- [ ] **Paso 1: la prueba que falla — sondas de cada regla, cada una con su control positivo**

Crear `tests/traceability/ambiente.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

/**
 * Paso 4 del secado por bandeja (spec §4.5): la lectura de ambiente a mano.
 * Montaje propio y directo en la base: un sitio con su organización, una
 * instalación, un estante de 3 niveles × 2 puestos, una cama sin estante con
 * `rackLevel` 5 (el modelo anterior al 2a, que sigue siendo válido), y un
 * Farm Operator asignado al SITIO — `can()` sube por el árbol, así que eso le
 * da `sample:manage` sobre la instalación. `extrano` no tiene asignación.
 */
const nombre = (e: string) => `TEST AMB ${e}-${randomUUID().slice(0, 8)}`;
const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
const orgIds: string[] = [];
const locationIds: string[] = []; // en orden de creación; se borran al revés
const lecturaIds: string[] = [];

async function cuenta(etiqueta: string, sitioId?: string) {
  const person = await prisma.person.create({ data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(etiqueta) } });
  personIds.push(person.id);
  const account = await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } });
  accountIds.push(account.id);
  if (sitioId) {
    const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitioId } });
    scopeIds.push(scope.id);
    await prisma.assignment.create({ data: { userAccountId: account.id, scopeId: scope.id, roleProfileId: roleProfile.id } });
  }
  return { userAccountId: account.id, personId: person.id };
}

async function lugar(data: Parameters<typeof prisma.location.create>[0]["data"]) {
  const l = await prisma.location.create({ data: { classification: "internal", ...data } as never });
  locationIds.push(l.id);
  return l;
}

type Montaje = {
  sitio: string; instalacion: string; otraInstalacion: string; estante: string; estanteAjeno: string;
  operario: { userAccountId: string; personId: string }; extrano: { userAccountId: string; personId: string };
};
let m: Montaje;

async function montaje(): Promise<Montaje> {
  const org = await prisma.organization.create({ data: { name: nombre("org"), organizationType: "farm" } });
  orgIds.push(org.id);
  const sitio = await lugar({ name: nombre("sitio"), locationType: "site", organizationId: org.id });
  const instalacion = await lugar({ name: nombre("cuarto"), locationType: "drying_facility", parentLocationId: sitio.id, organizationId: org.id, dryingEnvironment: "dark_room_climate_controlled" });
  const otraInstalacion = await lugar({ name: nombre("otro cuarto"), locationType: "drying_facility", parentLocationId: sitio.id, organizationId: org.id });
  const estante = await lugar({ name: nombre("estante"), locationType: "drying_rack", parentLocationId: instalacion.id, organizationId: org.id });
  for (let nivel = 1; nivel <= 3; nivel++) for (let puesto = 1; puesto <= 2; puesto++) {
    await lugar({ name: nombre(`N${nivel}P${puesto}`), locationType: "drying_bed", parentLocationId: estante.id, organizationId: org.id, rackLevel: nivel, rackSlot: puesto });
  }
  // Una cama colgada directamente de la instalación, con nivel y sin estante.
  await lugar({ name: nombre("cama N5"), locationType: "drying_bed", parentLocationId: instalacion.id, organizationId: org.id, rackLevel: 5 });
  const estanteAjeno = await lugar({ name: nombre("estante ajeno"), locationType: "drying_rack", parentLocationId: otraInstalacion.id, organizationId: org.id });
  await lugar({ name: nombre("ajeno N1P1"), locationType: "drying_bed", parentLocationId: estanteAjeno.id, organizationId: org.id, rackLevel: 1, rackSlot: 1 });
  return {
    sitio: sitio.id, instalacion: instalacion.id, otraInstalacion: otraInstalacion.id, estante: estante.id, estanteAjeno: estanteAjeno.id,
    operario: await cuenta("operario", sitio.id), extrano: await cuenta("extrano"),
  };
}

/** Un INSERT que no pasa por el servicio: es lo que prueba que la regla vive en la base. */
async function insertarCruda(datos: Record<string, unknown>) {
  const fila = await prisma.dryingAmbientReading.create({ data: {
    facilityLocationId: m.instalacion, occurredAt: new Date("2026-09-21T14:00:00Z"),
    airTemperatureC: 24, temperatureEntryUnit: "C", provenanceClass: "measured_fact",
    ...datos,
  } as never });
  lecturaIds.push(fila.id);
  return fila;
}

beforeAll(async () => { m = await montaje(); });

afterAll(async () => {
  // Las lecturas no se borran salvo por la puerta de pruebas, igual que los pesajes.
  // Primero las correcciones (apuntan a su original con RESTRICT).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL nn.limpieza_de_pruebas = 'on'`;
    await tx.dryingAmbientReading.deleteMany({ where: assertDefinedWhere({ facilityLocationId: { in: locationIds }, supersedesId: { not: null } }) });
    await tx.dryingAmbientReading.deleteMany({ where: assertDefinedWhere({ facilityLocationId: { in: locationIds } }) });
  });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: accountIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: accountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: accountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  for (const id of [...locationIds].reverse()) await prisma.location.delete({ where: { id } });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgIds } }) });
});

describe("las reglas de la lectura de ambiente viven en la base", () => {
  it("control positivo: una lectura general válida entra", async () => {
    const fila = await insertarCruda({});
    expect(fila.sourceType).toBe("manual");
  });
  it("una lectura sin ninguna de las cuatro cosas se rechaza; con sólo el cielo, entra", async () => {
    await expect(insertarCruda({ airTemperatureC: null, temperatureEntryUnit: null })).rejects.toThrow(/drying_ambient_reading_algo_medido/);
    await expect(insertarCruda({ airTemperatureC: null, temperatureEntryUnit: null, skyCondition: "cloudy", provenanceClass: "direct_observation" })).resolves.toBeTruthy();
  });
  it("temperatura fuera de -10..80 °C y HR fuera de 0..100 se rechazan; los bordes entran", async () => {
    await expect(insertarCruda({ airTemperatureC: 80.1 })).rejects.toThrow(/drying_ambient_reading_temperatura_en_rango/);
    await expect(insertarCruda({ relativeHumidityPct: 100.1 })).rejects.toThrow(/drying_ambient_reading_hr_en_rango/);
    await expect(insertarCruda({ airTemperatureC: 80, relativeHumidityPct: 100 })).resolves.toBeTruthy();
  });
  it("temperatura sin unidad tecleada, o unidad sin temperatura, se rechaza", async () => {
    await expect(insertarCruda({ temperatureEntryUnit: null })).rejects.toThrow(/drying_ambient_reading_unidad_con_temperatura/);
    await expect(insertarCruda({ airTemperatureC: null, relativeHumidityPct: 60 })).rejects.toThrow(/drying_ambient_reading_unidad_con_temperatura/);
    await expect(insertarCruda({ temperatureEntryUnit: "K" })).rejects.toThrow(/drying_ambient_reading_unidad_con_temperatura/);
    await expect(insertarCruda({ temperatureEntryUnit: "F" })).resolves.toBeTruthy();
  });
  it("una nota sin su valor de catálogo se rechaza: la nota nunca va en su lugar", async () => {
    await expect(insertarCruda({ skyNote: "bruma" })).rejects.toThrow(/drying_ambient_reading_nota_de_cielo_con_valor/);
    await expect(insertarCruda({ ventilationNote: "puerta" })).rejects.toThrow(/drying_ambient_reading_nota_de_ventilacion_con_valor/);
    await expect(insertarCruda({ skyCondition: "partly_cloudy", skyNote: "bruma", ventilation: "semi_open", ventilationNote: "puerta" })).resolves.toBeTruthy();
  });
  it("sólo measured_fact o direct_observation", async () => {
    await expect(insertarCruda({ provenanceClass: "hypothesis" })).rejects.toThrow(/drying_ambient_reading_procedencia/);
  });
  it("el lugar tiene que ser una instalación de secado", async () => {
    await expect(insertarCruda({ facilityLocationId: m.sitio })).rejects.toThrow(/no es una instalacion de secado/);
  });
  it("el estante tiene que ser de ESA instalación", async () => {
    await expect(insertarCruda({ rackLocationId: m.estanteAjeno })).rejects.toThrow(/no es un estante de esta instalacion/);
    await expect(insertarCruda({ rackLocationId: m.estante })).resolves.toBeTruthy();
  });
  it("el nivel tiene que existir: en el estante si lo hay, en la instalación si no", async () => {
    await expect(insertarCruda({ rackLocationId: m.estante, rackLevel: 4 })).rejects.toThrow(/ese nivel no existe/);
    await expect(insertarCruda({ rackLocationId: m.estante, rackLevel: 3 })).resolves.toBeTruthy();
    await expect(insertarCruda({ rackLevel: 7 })).rejects.toThrow(/ese nivel no existe/);
    await expect(insertarCruda({ rackLevel: 5 })).resolves.toBeTruthy();  // la cama sin estante
    await expect(insertarCruda({ rackLevel: 3 })).resolves.toBeTruthy();  // nivel 3 del estante, sin nombrar estante
    await expect(insertarCruda({ rackLevel: 0 })).rejects.toThrow(/drying_ambient_reading_nivel_positivo/);
  });
  it("no se edita; sólo se marca superseded una vez", async () => {
    const fila = await insertarCruda({});
    await expect(prisma.dryingAmbientReading.update({ where: { id: fila.id }, data: { airTemperatureC: 30 } })).rejects.toThrow(/no se edita/);
    await expect(prisma.dryingAmbientReading.update({ where: { id: fila.id }, data: { supersededAt: new Date() } })).resolves.toBeTruthy();
  });
  it("no se borra fuera de la puerta de pruebas", async () => {
    const fila = await insertarCruda({});
    await expect(prisma.dryingAmbientReading.delete({ where: { id: fila.id } })).rejects.toThrow(/no se borra/);
  });
  it("una corrección exige razón, de la misma instalación, y un original tiene a lo sumo un sustituto", async () => {
    const original = await insertarCruda({});
    await expect(insertarCruda({ supersedesId: original.id })).rejects.toThrow(/drying_ambient_reading_correccion_con_razon/);
    await expect(insertarCruda({ supersedesId: original.id, correctionReason: "x", facilityLocationId: m.otraInstalacion })).rejects.toThrow(/misma instalacion/);
    await expect(insertarCruda({ supersedesId: original.id, correctionReason: "tecleé 42 por 24" })).resolves.toBeTruthy();
    await expect(insertarCruda({ supersedesId: original.id, correctionReason: "otra vez" })).rejects.toThrow(/drying_ambient_reading_supersedes_unico|Unique constraint/);
  });
  it("una instalación con lecturas no cambia de tipo ni de padre", async () => {
    // Instalaciones SIN hijos a propósito: sobre una con estantes, el disparador
    // `location_arbol_de_estante` (2a) responde antes —«Una instalacion con
    // estantes no cambia de tipo»— y esta sonda mediría la regla de otro.
    const sola = await lugar({ name: nombre("sola"), locationType: "drying_facility", parentLocationId: m.sitio });
    const control = await lugar({ name: nombre("control"), locationType: "drying_facility", parentLocationId: m.sitio });
    await insertarCruda({ facilityLocationId: sola.id });
    // Control positivo primero: los mismos dos UPDATE, sobre la que NO tiene lecturas, entran.
    await prisma.location.update({ where: { id: control.id }, data: { locationType: "drying_bed" } });
    await prisma.location.update({ where: { id: control.id }, data: { locationType: "drying_facility" } });
    await prisma.location.update({ where: { id: control.id }, data: { parentLocationId: null } });
    await prisma.location.update({ where: { id: control.id }, data: { parentLocationId: m.sitio } });
    await expect(prisma.location.update({ where: { id: sola.id }, data: { locationType: "drying_bed" } })).rejects.toThrow(/tiene lecturas de ambiente/);
    await expect(prisma.location.update({ where: { id: sola.id }, data: { parentLocationId: null } })).rejects.toThrow(/tiene lecturas de ambiente/);
  });
});
```

Y en `scripts/pruebas-por-compuerta.txt`, grupo `base-sembrada`, la línea `tests/traceability/ambiente.test.ts` justo debajo de `tests/traceability/estantes.test.ts`.

- [ ] **Paso 2: correrla y verla fallar**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/ambiente.test.ts
```

Esperado: FAIL, «Property 'dryingAmbientReading' does not exist» o `Cannot read properties of undefined (reading 'create')`. **Si dice «No test files found» o «no tests», la prueba no compiló: no cuenta como rojo.**

- [ ] **Paso 3: el esquema**

En `prisma/schema.prisma`, junto a `DryingTrayWeighing`:

```prisma
/// Paso 4 de la spec de secado por bandeja (§4.5): cómo está el cielo. Catálogo
/// de Daniel, 2026-09-18.
enum SkyCondition {
  sunny
  partly_cloudy
  cloudy
  rain

  @@schema("core")
}

/// Paso 4 (§4.5): cómo está ventilado el lugar. Catálogo de Daniel, 2026-09-18.
enum DryingVentilation {
  open
  semi_open
  closed
  fan_or_dehumidifier

  @@schema("core")
}

/// Lectura a mano del AIRE de una instalación de secado (spec §4.5). No es la
/// humedad del grano —ésa es `moisture` en `Measurement`—. Inmutable: una
/// corrección es otra fila que la supersede, como `DryingTrayWeighing`.
/// Sin estante ni nivel es la lectura GENERAL de la instalación; con ellos, la
/// de ese punto, y nunca se usa para otro (§4.5: «nunca se interpola»).
model DryingAmbientReading {
  id                   String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  facilityLocationId   String                @map("facility_location_id") @db.Uuid
  facility             Location              @relation("DryingAmbientReadingFacility", fields: [facilityLocationId], references: [id], onDelete: Restrict)
  rackLocationId       String?               @map("rack_location_id") @db.Uuid
  rack                 Location?             @relation("DryingAmbientReadingRack", fields: [rackLocationId], references: [id], onDelete: Restrict)
  rackLevel            Int?                  @map("rack_level")
  occurredAt           DateTime              @map("occurred_at")
  airTemperatureC      Decimal?              @map("air_temperature_c") @db.Decimal(4, 1)
  temperatureEntryUnit String?               @map("temperature_entry_unit")
  relativeHumidityPct  Decimal?              @map("relative_humidity_pct") @db.Decimal(4, 1)
  skyCondition         SkyCondition?         @map("sky_condition")
  skyNote              String?               @map("sky_note")
  ventilation          DryingVentilation?    @map("ventilation")
  ventilationNote      String?               @map("ventilation_note")
  sourceType           MeasurementSourceType @default(manual) @map("source_type")
  provenanceClass      ProvenanceClass       @map("provenance_class")
  operatorPersonId     String?               @map("operator_person_id") @db.Uuid
  operator             Person?               @relation("DryingAmbientReadingOperator", fields: [operatorPersonId], references: [id], onDelete: Restrict)
  supersedesId         String?               @map("supersedes_id") @db.Uuid
  supersedes           DryingAmbientReading?  @relation("DryingAmbientReadingSupersedes", fields: [supersedesId], references: [id], onDelete: Restrict)
  supersededBy         DryingAmbientReading[] @relation("DryingAmbientReadingSupersedes")
  supersededAt         DateTime?             @map("superseded_at")
  correctionReason     String?               @map("correction_reason")
  // Reloj del SERVIDOR al insertar, como `DryingTrayWeighing.createdAt`: no es
  // `recordedAt` (reloj del teléfono), que exigiría las columnas de sincronización.
  createdAt            DateTime              @default(now()) @map("created_at")
  createdBy            String?               @map("created_by") @db.Uuid
  creator              UserAccount?          @relation("DryingAmbientReadingCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)

  @@index([facilityLocationId, occurredAt])
  @@map("drying_ambient_reading")
  @@schema("traceability")
}
```

Y las relaciones de vuelta, una línea cada una:
- en `model Person`, junto a `dryingTrayWeighingsOperated`: `dryingAmbientReadingsOperated DryingAmbientReading[] @relation("DryingAmbientReadingOperator")`;
- en `model UserAccount`, junto a `dryingTrayWeighingsCreated`: `dryingAmbientReadingsCreated DryingAmbientReading[] @relation("DryingAmbientReadingCreatedBy")`;
- en `model Location`, junto a `samplingEvents`: `ambientReadingsAsFacility DryingAmbientReading[] @relation("DryingAmbientReadingFacility")` y `ambientReadingsAsRack DryingAmbientReading[] @relation("DryingAmbientReadingRack")`.

- [ ] **Paso 4: la migración**

Crear `prisma/migrations/20260921120000_ambiente_de_secado/migration.sql`:

```sql
-- Paso 4 de la spec de secado por bandeja (§4.5): la lectura de ambiente a mano.
-- Enums nuevos (CREATE TYPE, no ADD VALUE), así que se pueden usar en esta misma migración.
CREATE TYPE "core"."SkyCondition" AS ENUM ('sunny', 'partly_cloudy', 'cloudy', 'rain');
CREATE TYPE "core"."DryingVentilation" AS ENUM ('open', 'semi_open', 'closed', 'fan_or_dehumidifier');

CREATE TABLE "traceability"."drying_ambient_reading" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "facility_location_id" UUID NOT NULL,
  "rack_location_id" UUID,
  "rack_level" INTEGER,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "air_temperature_c" DECIMAL(4,1),
  "temperature_entry_unit" TEXT,
  "relative_humidity_pct" DECIMAL(4,1),
  "sky_condition" "core"."SkyCondition",
  "sky_note" TEXT,
  "ventilation" "core"."DryingVentilation",
  "ventilation_note" TEXT,
  "source_type" "traceability"."MeasurementSourceType" NOT NULL DEFAULT 'manual',
  "provenance_class" "core"."ProvenanceClass" NOT NULL,
  "operator_person_id" UUID,
  "supersedes_id" UUID,
  "superseded_at" TIMESTAMP(3),
  "correction_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "drying_ambient_reading_pkey" PRIMARY KEY ("id"),
  -- Un CHECK que da NULL PASA: cada uno descarta el nulo a propósito.
  CONSTRAINT "drying_ambient_reading_algo_medido" CHECK (
    "air_temperature_c" IS NOT NULL OR "relative_humidity_pct" IS NOT NULL
    OR "sky_condition" IS NOT NULL OR "ventilation" IS NOT NULL
  ),
  -- Los rangos de `temperature` y `relative_humidity` en lib/traceability/units.ts.
  CONSTRAINT "drying_ambient_reading_temperatura_en_rango" CHECK ("air_temperature_c" IS NULL OR "air_temperature_c" BETWEEN -10 AND 80),
  CONSTRAINT "drying_ambient_reading_hr_en_rango" CHECK ("relative_humidity_pct" IS NULL OR "relative_humidity_pct" BETWEEN 0 AND 100),
  -- 00_conventions §1: la unidad tecleada se conserva, y sólo existe si hay temperatura.
  CONSTRAINT "drying_ambient_reading_unidad_con_temperatura" CHECK (
    ("air_temperature_c" IS NULL AND "temperature_entry_unit" IS NULL)
    OR ("air_temperature_c" IS NOT NULL AND "temperature_entry_unit" IS NOT NULL AND "temperature_entry_unit" IN ('C', 'F'))
  ),
  -- La nota acompaña al catálogo, nunca lo reemplaza (spec §4.5).
  CONSTRAINT "drying_ambient_reading_nota_de_cielo_con_valor" CHECK ("sky_note" IS NULL OR "sky_condition" IS NOT NULL),
  CONSTRAINT "drying_ambient_reading_nota_de_ventilacion_con_valor" CHECK ("ventilation_note" IS NULL OR "ventilation" IS NOT NULL),
  CONSTRAINT "drying_ambient_reading_nivel_positivo" CHECK ("rack_level" IS NULL OR "rack_level" > 0),
  CONSTRAINT "drying_ambient_reading_procedencia" CHECK ("provenance_class" IN ('measured_fact', 'direct_observation')),
  CONSTRAINT "drying_ambient_reading_correccion_con_razon" CHECK (
    "supersedes_id" IS NULL OR ("correction_reason" IS NOT NULL AND char_length(trim("correction_reason")) > 0)
  )
);
ALTER TABLE "traceability"."drying_ambient_reading"
  ADD CONSTRAINT "drying_ambient_reading_facility_location_id_fkey" FOREIGN KEY ("facility_location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_ambient_reading_rack_location_id_fkey" FOREIGN KEY ("rack_location_id") REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_ambient_reading_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_ambient_reading_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "traceability"."drying_ambient_reading"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_ambient_reading_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "drying_ambient_reading_facility_location_id_occurred_at_idx" ON "traceability"."drying_ambient_reading"("facility_location_id", "occurred_at");
CREATE UNIQUE INDEX "drying_ambient_reading_supersedes_unico"
  ON "traceability"."drying_ambient_reading"("supersedes_id") WHERE "supersedes_id" IS NOT NULL;

-- El punto: instalación de secado; estante de ESA instalación; nivel que exista.
-- Mira otras filas, así que va por disparador. FOR SHARE: el padre no cambia
-- de tipo ni de sitio mientras se inserta (misma razón que el pesaje, A8 del 2a).
CREATE OR REPLACE FUNCTION "traceability"."exigir_punto_de_ambiente"()
RETURNS TRIGGER AS $$
DECLARE tipo TEXT; padre UUID; instalacion_original UUID;
BEGIN
  SELECT "location_type" INTO tipo FROM "core"."location" WHERE "id" = NEW."facility_location_id" FOR SHARE;
  IF tipo IS DISTINCT FROM 'drying_facility' THEN
    RAISE EXCEPTION 'El lugar de una lectura de ambiente no es una instalacion de secado';
  END IF;
  IF NEW."rack_location_id" IS NOT NULL THEN
    SELECT "location_type", "parent_location_id" INTO tipo, padre FROM "core"."location" WHERE "id" = NEW."rack_location_id" FOR SHARE;
    IF tipo IS DISTINCT FROM 'drying_rack' OR padre IS DISTINCT FROM NEW."facility_location_id" THEN
      RAISE EXCEPTION 'El estante de la lectura no es un estante de esta instalacion';
    END IF;
  END IF;
  -- `> 0`: un BEFORE INSERT corre ANTES que los CHECK. Sin esta guarda, un nivel 0
  -- saldría como «ese nivel no existe» y la sonda del CHECK de nivel positivo
  -- nunca vería su propia regla.
  IF NEW."rack_level" IS NOT NULL AND NEW."rack_level" > 0 THEN
    -- Con estante: una posición de ese estante con ese nivel. Sin estante: una
    -- cama de la instalación, o una posición de cualquiera de sus estantes.
    IF NOT EXISTS (
      SELECT 1 FROM "core"."location" c
      LEFT JOIN "core"."location" e ON e."id" = c."parent_location_id"
      WHERE c."location_type" = 'drying_bed' AND c."rack_level" = NEW."rack_level"
        AND (
          (NEW."rack_location_id" IS NOT NULL AND c."parent_location_id" = NEW."rack_location_id")
          OR (NEW."rack_location_id" IS NULL AND (
                c."parent_location_id" = NEW."facility_location_id"
             OR (e."location_type" = 'drying_rack' AND e."parent_location_id" = NEW."facility_location_id")))
        )
    ) THEN
      RAISE EXCEPTION 'La lectura nombra un nivel, y ese nivel no existe en ese punto';
    END IF;
  END IF;
  IF NEW."supersedes_id" IS NOT NULL THEN
    SELECT "facility_location_id" INTO instalacion_original FROM "traceability"."drying_ambient_reading" WHERE "id" = NEW."supersedes_id" FOR SHARE;
    IF instalacion_original IS DISTINCT FROM NEW."facility_location_id" THEN
      RAISE EXCEPTION 'La correccion debe ser de la misma instalacion que la lectura original';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_ambient_reading_punto"
  BEFORE INSERT ON "traceability"."drying_ambient_reading"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_punto_de_ambiente"();

-- Inmutable salvo marcarla superseded UNA vez (00_conventions §4).
CREATE OR REPLACE FUNCTION "traceability"."lectura_de_ambiente_inmutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."superseded_at" IS NULL AND NEW."superseded_at" IS NOT NULL
     AND (to_jsonb(NEW) - 'superseded_at') = (to_jsonb(OLD) - 'superseded_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Una lectura de ambiente no se edita: se corrige con otra que la supersede';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_ambient_reading_inmutable"
  BEFORE UPDATE ON "traceability"."drying_ambient_reading"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."lectura_de_ambiente_inmutable"();

-- Tampoco se borra. La misma puerta de dos llaves que el pesaje de bandeja:
-- ajuste de sesión Y base de pruebas por su nombre.
CREATE OR REPLACE FUNCTION "traceability"."lectura_de_ambiente_no_se_borra"()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('nn.limpieza_de_pruebas', true) = 'on'
     AND current_database() ~ '^(nectar_test|nectar_ci|nn_flip_)' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Una lectura de ambiente no se borra: se corrige con otra que la supersede';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_ambient_reading_no_se_borra"
  BEFORE DELETE ON "traceability"."drying_ambient_reading"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."lectura_de_ambiente_no_se_borra"();

-- Del lado del padre: una instalación o un estante con lecturas no cambia de
-- tipo ni de padre — la lectura diría que se tomó en otro sitio.
CREATE OR REPLACE FUNCTION "core"."exigir_lugar_con_ambiente_quieto"()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW."location_type" IS DISTINCT FROM OLD."location_type" OR NEW."parent_location_id" IS DISTINCT FROM OLD."parent_location_id")
     AND EXISTS (
       SELECT 1 FROM "traceability"."drying_ambient_reading"
       WHERE "facility_location_id" = NEW."id" OR "rack_location_id" = NEW."id"
     ) THEN
    RAISE EXCEPTION 'Este lugar tiene lecturas de ambiente: no cambia de tipo ni de padre';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "location_con_ambiente_quieto"
  BEFORE UPDATE OF "location_type", "parent_location_id" ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_lugar_con_ambiente_quieto"();
```

- [ ] **Paso 5: aplicarla a la base compartida, avisando antes y después**

Mandar a la sesión coordinadora: «Voy a aplicar `20260921120000_ambiente_de_secado` a nectar_test (55433): tabla nueva, dos enums nuevos, un disparador nuevo en `core.location`.» Después:

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test SHADOW_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nn_shadow_beneficio npx prisma migrate deploy
npx prisma generate
```

Y otra línea a la coordinadora: aplicada, o el error tal cual.

- [ ] **Paso 6: correr la prueba y verla pasar**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/ambiente.test.ts
npx vitest run tests/derivaDeMigraciones.test.ts tests/arquitectura/columnas-de-sincronizacion.test.ts
```

Esperado: `ambiente.test.ts` 13/13 en verde. Las dos guardias de arquitectura, en verde. La primera compara el esquema con la migración: si cae, falta un `onDelete: Restrict` o un `@map`.

- [ ] **Paso 7: los nombres en `03_public_api.md`**

Añadir al final de `docs/beneficio/03_public_api.md` §11:

```markdown
Paso 4 de la misma spec, el ambiente a mano (§4.5). Nombres aprobados por Daniel el <fecha de la Tarea 0>:

| nombre | dónde | qué es |
|---|---|---|
| `DryingAmbientReading` | `traceability.drying_ambient_reading` | lectura a mano del aire de una instalación de secado, general o de un estante y nivel; inmutable, se corrige superseding |
| `facilityLocationId`, `rackLocationId`, `rackLevel` | `traceability.drying_ambient_reading` | el punto: instalación obligatoria; estante y nivel opcionales |
| `airTemperatureC`, `temperatureEntryUnit` | ídem | °C con un decimal y la unidad tecleada (`C` o `F`) |
| `relativeHumidityPct` | ídem | humedad relativa del AIRE, un decimal; no es la del grano |
| `SkyCondition`: `sunny`, `partly_cloudy`, `cloudy`, `rain` | `core` | cielo, catálogo de Daniel 2026-09-18 |
| `DryingVentilation`: `open`, `semi_open`, `closed`, `fan_or_dehumidifier` | `core` | ventilación, catálogo de Daniel 2026-09-18 |
| `skyNote`, `ventilationNote` | `traceability.drying_ambient_reading` | nota libre al lado de su valor, nunca en su lugar |
| `sourceType` | ídem, enum `MeasurementSourceType` existente | `manual` hoy |
```

- [ ] **Paso 8: compuerta y commit**

```bash
npx tsc --noEmit; test $? -eq 0 && npm run build; test $? -eq 0 && echo COMPUERTA-OK
git add prisma/schema.prisma prisma/migrations/20260921120000_ambiente_de_secado/migration.sql tests/traceability/ambiente.test.ts scripts/pruebas-por-compuerta.txt docs/beneficio/03_public_api.md
git diff --cached --stat   # contar: CINCO archivos
git commit -F <archivo-con-el-mensaje>
```

---

### Tarea 2: el servicio y la regla «sólo la de su punto»

**Archivos:**
- Crear: `lib/traceability/ambienteVigente.ts`, `lib/traceability/ambiente.ts`, `tests/traceability/ambienteVigente.test.ts`
- Modificar: `tests/traceability/ambiente.test.ts`

**Interfaces:**
- Consume: el modelo de la Tarea 1.
- Produce, en `ambienteVigente.ts` (sin base, la importa la página):
  - `type PuntoDeAmbiente = { rackId: string | null; rackLevel: number | null }`;
  - `type LecturaVigente = PuntoDeAmbiente & { id: string; occurredAt: Date; airTemperatureC: number | null; relativeHumidityPct: number | null; skyCondition: string | null; ventilation: string | null; sourceType: string }`;
  - `lecturaDelPunto<T extends LecturaVigente>(vigentes: T[], punto: PuntoDeAmbiente): T | null`;
  - `edad(ocurrio: Date, ahora: Date): { unidad: "min" | "h" | "d"; n: number }`.
- Produce, en `ambiente.ts`:
  - `class AmbienteError extends Error` con los mensajes `lectura_vacia`, `nota_sin_valor`, `fuera_de_rango`, `datos_invalidos`, `instalacion_invalida`, `punto_invalido`;
  - `interface LecturaDeAmbienteInput` (abajo);
  - `registrarLecturaDeAmbiente(userAccountId, input): Promise<{ id: string }>`;
  - `ambienteDeInstalacion(userAccountId, facilityLocationId): Promise<{ vigentes: LecturaVigente[]; recientes: LecturaVigente[] }>`;
  - `puedeRegistrarAmbienteEn(userAccountId, facilityLocationId): Promise<boolean>`.
  - Lanza `TraceabilityAccessError("no_sample_access")` (de `./lots`) sin permiso.

- [ ] **Paso 1: la prueba pura que falla**

Crear `tests/traceability/ambienteVigente.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { edad, lecturaDelPunto, type LecturaVigente } from "../../lib/traceability/ambienteVigente";

const base = { airTemperatureC: 24, relativeHumidityPct: 61, skyCondition: null, ventilation: null, sourceType: "manual" };
const l = (id: string, rackId: string | null, rackLevel: number | null, hora: string): LecturaVigente =>
  ({ ...base, id, rackId, rackLevel, occurredAt: new Date(hora) });

describe("la lectura de un punto es SÓLO la de ese punto (spec §4.5)", () => {
  const vigentes = [
    l("general", null, null, "2026-09-21T13:00:00Z"),
    l("E1-N2", "E1", 2, "2026-09-21T13:30:00Z"),
    l("E1-N4", "E1", 4, "2026-09-21T11:00:00Z"),
    l("N3-sin-estante", null, 3, "2026-09-21T12:00:00Z"),
  ];
  it("el nivel 3 del estante E1 no tiene lectura propia: null, no la del nivel 2 ni la 4 ni la general", () => {
    expect(lecturaDelPunto(vigentes, { rackId: "E1", rackLevel: 3 })).toBeNull();
  });
  it("control positivo: el nivel 4 del estante E1 sí la tiene, aunque sea más vieja que la del 2", () => {
    expect(lecturaDelPunto(vigentes, { rackId: "E1", rackLevel: 4 })?.id).toBe("E1-N4");
  });
  it("la general sólo responde por el punto general", () => {
    expect(lecturaDelPunto(vigentes, { rackId: null, rackLevel: null })?.id).toBe("general");
  });
  it("«nivel 3 sin estante» es su propio punto: no responde por el nivel 3 de E1", () => {
    expect(lecturaDelPunto(vigentes, { rackId: null, rackLevel: 3 })?.id).toBe("N3-sin-estante");
    expect(lecturaDelPunto(vigentes, { rackId: "E1", rackLevel: 3 })).toBeNull();
  });
  it("de dos del mismo punto, la más reciente", () => {
    const dos = [l("vieja", "E1", 2, "2026-09-21T08:00:00Z"), l("nueva", "E1", 2, "2026-09-21T10:00:00Z")];
    expect(lecturaDelPunto(dos, { rackId: "E1", rackLevel: 2 })?.id).toBe("nueva");
  });
});

describe("la edad, siempre dicha", () => {
  const ahora = new Date("2026-09-21T23:00:00Z");
  it("minutos, horas y días", () => {
    expect(edad(new Date("2026-09-21T22:35:00Z"), ahora)).toEqual({ unidad: "min", n: 25 });
    expect(edad(new Date("2026-09-21T14:00:00Z"), ahora)).toEqual({ unidad: "h", n: 9 });
    expect(edad(new Date("2026-09-18T20:00:00Z"), ahora)).toEqual({ unidad: "d", n: 3 });
  });
  it("una hora futura (reloj adelantado) no da edad negativa", () => {
    expect(edad(new Date("2026-09-21T23:10:00Z"), ahora)).toEqual({ unidad: "min", n: 0 });
  });
});
```

- [ ] **Paso 2: verla fallar**

```bash
npx vitest run tests/traceability/ambienteVigente.test.ts
```

Esperado: FAIL, «Failed to resolve import "../../lib/traceability/ambienteVigente"».

- [ ] **Paso 3: la función pura**

Crear `lib/traceability/ambienteVigente.ts`:

```ts
/**
 * Qué lectura de ambiente vale para un punto (spec §4.5). Sin base: la usan la
 * página y, cuando exista el 2b, la vista de cada bandeja.
 *
 * La regla entera es la igualdad de abajo. «Nunca se interpola un valor para
 * el nivel de la bandeja a partir de otros niveles»: un punto sin lectura
 * propia devuelve null, y quien pinta dice «sin lectura de este nivel». Ni la
 * general ni la del nivel de al lado ocupan su sitio.
 */
export type PuntoDeAmbiente = { rackId: string | null; rackLevel: number | null };
export type LecturaVigente = PuntoDeAmbiente & {
  id: string; occurredAt: Date; airTemperatureC: number | null; relativeHumidityPct: number | null;
  skyCondition: string | null; ventilation: string | null; sourceType: string;
};

export function lecturaDelPunto<T extends LecturaVigente>(vigentes: T[], punto: PuntoDeAmbiente): T | null {
  let mejor: T | null = null;
  for (const l of vigentes) {
    if (l.rackId !== punto.rackId || l.rackLevel !== punto.rackLevel) continue;
    if (!mejor || l.occurredAt > mejor.occurredAt) mejor = l;
  }
  return mejor;
}

/** Cuánto hace. Sin umbral de «vieja»: no hay ninguno aprobado, así que se dice siempre. */
export function edad(ocurrio: Date, ahora: Date): { unidad: "min" | "h" | "d"; n: number } {
  const min = Math.max(0, Math.floor((ahora.getTime() - ocurrio.getTime()) / 60_000));
  if (min < 60) return { unidad: "min", n: min };
  const h = Math.floor(min / 60);
  if (h < 48) return { unidad: "h", n: h };
  return { unidad: "d", n: Math.floor(h / 24) };
}
```

- [ ] **Paso 4: verla pasar**

```bash
npx vitest run tests/traceability/ambienteVigente.test.ts
```

Esperado: 7/7 en verde. **No va** en `pruebas-por-compuerta.txt`: es hermética y la corre `scripts/ci.sh`.

- [ ] **Paso 5: las pruebas del servicio que fallan**

Añadir a `tests/traceability/ambiente.test.ts`, con el import `import { AmbienteError, ambienteDeInstalacion, puedeRegistrarAmbienteEn, registrarLecturaDeAmbiente } from "../../lib/traceability/ambiente";` y `import { TraceabilityAccessError } from "../../lib/traceability/lots";` arriba:

```ts
/** El TIPO y el mensaje EXACTO: un error de Prisma cita código cercano y un
 *  `toThrow(cadena)` puede casar con un `throw` de otra rama (capacidadDeBandeja.test.ts, F3). */
async function rechazaCon(promesa: Promise<unknown>, mensaje: string) {
  const error = await promesa.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(AmbienteError);
  expect((error as AmbienteError).message).toBe(mensaje);
}
const hora = new Date("2026-09-21T15:00:00Z");

describe("registrar una lectura de ambiente", () => {
  it("en °F se guarda en °C con un decimal y conserva la unidad tecleada; con medida, measured_fact", async () => {
    const { id } = await registrarLecturaDeAmbiente(m.operario.userAccountId, {
      facilityLocationId: m.instalacion, occurredAt: hora, temperatura: { valor: 75.2, unidad: "F" }, humedadRelativaPct: 61.5,
      operatorPersonId: m.operario.personId,
    });
    lecturaIds.push(id);
    const fila = await prisma.dryingAmbientReading.findUniqueOrThrow({ where: { id } });
    expect(Number(fila.airTemperatureC)).toBe(24);
    expect(fila.temperatureEntryUnit).toBe("F");
    expect(Number(fila.relativeHumidityPct)).toBe(61.5);
    expect(fila.provenanceClass).toBe("measured_fact");
    expect(fila.sourceType).toBe("manual");
  });
  it("sólo cielo y ventilación: direct_observation", async () => {
    const { id } = await registrarLecturaDeAmbiente(m.operario.userAccountId, {
      facilityLocationId: m.instalacion, occurredAt: hora, cielo: "rain", ventilacion: "closed", notaVentilacion: "  lona bajada  ",
    });
    lecturaIds.push(id);
    const fila = await prisma.dryingAmbientReading.findUniqueOrThrow({ where: { id } });
    expect(fila.provenanceClass).toBe("direct_observation");
    expect(fila.ventilationNote).toBe("lona bajada");
  });
  it("vacía, nota sin valor, °C con dos decimales, fuera de rango y punto ajeno se rechazan con su motivo", async () => {
    const u = m.operario.userAccountId;
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: hora }), "lectura_vacia");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: hora, humedadRelativaPct: 60, notaCielo: "bruma" }), "nota_sin_valor");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: hora, temperatura: { valor: 24.35, unidad: "C" } }), "datos_invalidos");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: hora, temperatura: { valor: 95, unidad: "C" } }), "fuera_de_rango");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: hora, humedadRelativaPct: 101 }), "fuera_de_rango");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, rackLocationId: m.estanteAjeno, occurredAt: hora, humedadRelativaPct: 60 }), "punto_invalido");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, rackLocationId: m.estante, rackLevel: 4, occurredAt: hora, humedadRelativaPct: 60 }), "punto_invalido");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.estante, occurredAt: hora, humedadRelativaPct: 60 }), "instalacion_invalida");
  });
  it("sin sample:manage sobre la instalación no registra ni ve; control: el operario sí", async () => {
    const intento = registrarLecturaDeAmbiente(m.extrano.userAccountId, { facilityLocationId: m.instalacion, occurredAt: hora, humedadRelativaPct: 60 });
    await expect(intento).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(ambienteDeInstalacion(m.extrano.userAccountId, m.instalacion)).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await puedeRegistrarAmbienteEn(m.extrano.userAccountId, m.instalacion)).toBe(false);
    expect(await puedeRegistrarAmbienteEn(m.operario.userAccountId, m.instalacion)).toBe(true);
  });
  it("corregir: exige razón, supersede la original y la vigente pasa a ser la corrección", async () => {
    const u = m.operario.userAccountId;
    const { id: original } = await registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, rackLocationId: m.estante, rackLevel: 2, occurredAt: hora, temperatura: { valor: 42, unidad: "C" } });
    lecturaIds.push(original);
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, rackLocationId: m.estante, rackLevel: 2, occurredAt: hora, temperatura: { valor: 24, unidad: "C" }, supersedesId: original }), "datos_invalidos");
    const { id: correccion } = await registrarLecturaDeAmbiente(u, {
      facilityLocationId: m.instalacion, rackLocationId: m.estante, rackLevel: 2, occurredAt: hora,
      temperatura: { valor: 24, unidad: "C" }, supersedesId: original, correctionReason: "tecleé 42 por 24",
    });
    lecturaIds.push(correccion);
    const { vigentes } = await ambienteDeInstalacion(u, m.instalacion);
    const delNivel2 = vigentes.filter((v) => v.rackId === m.estante && v.rackLevel === 2);
    expect(delNivel2.map((v) => v.id)).toEqual([correccion]);
    expect(delNivel2[0].airTemperatureC).toBe(24);
  });
  it("vigentes: una por punto, la más reciente de cada uno; recientes, las últimas de todos", async () => {
    const u = m.operario.userAccountId;
    const registra = async (h: string, punto: { rackLocationId?: string; rackLevel?: number }) => {
      const { id } = await registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: new Date(h), humedadRelativaPct: 60, ...punto });
      lecturaIds.push(id);
      return id;
    };
    await registra("2026-09-22T06:00:00Z", { rackLocationId: m.estante, rackLevel: 1 });
    const nueva = await registra("2026-09-22T09:00:00Z", { rackLocationId: m.estante, rackLevel: 1 });
    const { vigentes, recientes } = await ambienteDeInstalacion(u, m.instalacion);
    expect(vigentes.filter((v) => v.rackId === m.estante && v.rackLevel === 1).map((v) => v.id)).toEqual([nueva]);
    expect(recientes[0].id).toBe(nueva);
    expect(recientes.length).toBeLessThanOrEqual(20);
  });
});
```

- [ ] **Paso 6: verlas fallar**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/ambiente.test.ts
```

Esperado: FAIL al resolver `../../lib/traceability/ambiente`.

- [ ] **Paso 7: el servicio**

Crear `lib/traceability/ambiente.ts`:

```ts
/**
 * La lectura de ambiente a mano de una instalación de secado (spec §4.5).
 * Registrar pide `sample:manage` sobre la instalación, el mismo permiso que una
 * inspección de cama, sin inventar un recurso RBAC; ver pide manage o view.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { scopeTargetsFor, TraceabilityAccessError } from "./lots";
import { normalizeToCanonical, UnitValidationError } from "./units";
import type { ClassificationLevel, DryingVentilation, SkyCondition } from "../../generated/prisma/client";
import type { LecturaVigente } from "./ambienteVigente";

export class AmbienteError extends Error {}

export interface LecturaDeAmbienteInput {
  facilityLocationId: string;
  rackLocationId?: string | null;
  rackLevel?: number | null;
  occurredAt: Date;
  operatorPersonId?: string | null;
  temperatura?: { valor: number; unidad: "C" | "F" } | null;
  humedadRelativaPct?: number | null;
  cielo?: SkyCondition | null;
  notaCielo?: string | null;
  ventilacion?: DryingVentilation | null;
  notaVentilacion?: string | null;
  supersedesId?: string | null;
  correctionReason?: string | null;
}

const NOTA_MAX = 300;
const unDecimal = (n: number) => n === Number(n.toFixed(1));

async function puedeEn(userAccountId: string, lugar: { id: string; classification: ClassificationLevel }, acciones: ("manage" | "view")[]) {
  for (const target of scopeTargetsFor({ locationId: lugar.id })) {
    for (const accion of acciones) if (await can(userAccountId, accion, "sample", target, lugar.classification)) return true;
  }
  return false;
}

async function instalacion(facilityLocationId: string) {
  const lugar = await prisma.location.findUnique({ where: { id: facilityLocationId } });
  if (!lugar || lugar.locationType !== "drying_facility") throw new AmbienteError("instalacion_invalida");
  return lugar;
}

export async function puedeRegistrarAmbienteEn(userAccountId: string, facilityLocationId: string) {
  const lugar = await prisma.location.findUnique({ where: { id: facilityLocationId } });
  return !!lugar && lugar.locationType === "drying_facility" && (await puedeEn(userAccountId, lugar, ["manage"]));
}

export async function registrarLecturaDeAmbiente(userAccountId: string, input: LecturaDeAmbienteInput) {
  const nota = (s?: string | null) => {
    const t = s?.trim() || null;
    if (t && t.length > NOTA_MAX) throw new AmbienteError("datos_invalidos");
    return t;
  };
  const skyNote = nota(input.notaCielo);
  const ventilationNote = nota(input.notaVentilacion);
  if ((skyNote && !input.cielo) || (ventilationNote && !input.ventilacion)) throw new AmbienteError("nota_sin_valor");
  if (input.rackLevel != null && !(Number.isInteger(input.rackLevel) && input.rackLevel >= 1 && input.rackLevel <= 2147483647)) {
    throw new AmbienteError("datos_invalidos");
  }

  let airTemperatureC: number | null = null;
  if (input.temperatura) {
    const { valor, unidad } = input.temperatura;
    // En °C se guarda lo tecleado: más de un decimal sería un redondeo silencioso
    // de un hecho medido. En °F la conversión redondea a la precisión de §1.
    if (!Number.isFinite(valor) || (unidad === "C" && !unDecimal(valor))) throw new AmbienteError("datos_invalidos");
    try {
      airTemperatureC = Math.round(normalizeToCanonical("temperature", valor, unidad).value * 10) / 10;
    } catch (error) {
      if (error instanceof UnitValidationError) throw new AmbienteError(error.message.startsWith("out_of_range") ? "fuera_de_rango" : "datos_invalidos");
      throw error;
    }
  }
  const hr = input.humedadRelativaPct ?? null;
  if (hr != null) {
    if (!Number.isFinite(hr) || !unDecimal(hr)) throw new AmbienteError("datos_invalidos");
    if (hr < 0 || hr > 100) throw new AmbienteError("fuera_de_rango");
  }
  if (airTemperatureC == null && hr == null && !input.cielo && !input.ventilacion) throw new AmbienteError("lectura_vacia");
  if (input.supersedesId && !input.correctionReason?.trim()) throw new AmbienteError("datos_invalidos");

  const lugar = await instalacion(input.facilityLocationId);
  if (!(await puedeEn(userAccountId, lugar, ["manage"]))) throw new TraceabilityAccessError("no_sample_access");

  // El mismo punto que exige el disparador, dicho antes para dar un motivo legible.
  if (input.rackLocationId) {
    const estante = await prisma.location.findUnique({ where: { id: input.rackLocationId } });
    if (!estante || estante.locationType !== "drying_rack" || estante.parentLocationId !== lugar.id) throw new AmbienteError("punto_invalido");
  }
  if (input.rackLevel != null) {
    const existe = await prisma.location.count({ where: {
      locationType: "drying_bed", rackLevel: input.rackLevel,
      OR: input.rackLocationId
        ? [{ parentLocationId: input.rackLocationId }]
        : [{ parentLocationId: lugar.id }, { parentLocation: { locationType: "drying_rack", parentLocationId: lugar.id } }],
    } });
    if (!existe) throw new AmbienteError("punto_invalido");
  }
  if (input.supersedesId) {
    const original = await prisma.dryingAmbientReading.findUnique({ where: { id: input.supersedesId } });
    if (!original || original.facilityLocationId !== lugar.id || original.supersededAt) throw new AmbienteError("datos_invalidos");
  }

  return prisma.$transaction(async (tx) => {
    if (input.supersedesId) {
      const { count } = await tx.dryingAmbientReading.updateMany({ where: { id: input.supersedesId, supersededAt: null }, data: { supersededAt: new Date() } });
      if (count !== 1) throw new AmbienteError("datos_invalidos");
    }
    const fila = await tx.dryingAmbientReading.create({ data: {
      facilityLocationId: lugar.id, rackLocationId: input.rackLocationId ?? null, rackLevel: input.rackLevel ?? null,
      occurredAt: input.occurredAt, operatorPersonId: input.operatorPersonId ?? null,
      airTemperatureC, temperatureEntryUnit: input.temperatura ? input.temperatura.unidad : null, relativeHumidityPct: hr,
      skyCondition: input.cielo ?? null, skyNote, ventilation: input.ventilacion ?? null, ventilationNote,
      sourceType: "manual",
      provenanceClass: airTemperatureC != null || hr != null ? "measured_fact" : "direct_observation",
      supersedesId: input.supersedesId ?? null, correctionReason: input.correctionReason?.trim() || null, createdBy: userAccountId,
    } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: input.supersedesId ? "drying_ambient_reading.correct" : "drying_ambient_reading.create",
      entityType: "drying_ambient_reading", entityId: fila.id, after: fila, sourceInterface: "traceability.service" }, tx);
    return { id: fila.id };
  });
}

const SELECCION = {
  id: true, rackLocationId: true, rackLevel: true, occurredAt: true, airTemperatureC: true,
  relativeHumidityPct: true, skyCondition: true, ventilation: true, sourceType: true,
} as const;

function aVigente(f: {
  id: string; rackLocationId: string | null; rackLevel: number | null; occurredAt: Date;
  airTemperatureC: { toString(): string } | null; relativeHumidityPct: { toString(): string } | null;
  skyCondition: string | null; ventilation: string | null; sourceType: string;
}): LecturaVigente {
  return {
    id: f.id, rackId: f.rackLocationId, rackLevel: f.rackLevel, occurredAt: f.occurredAt,
    airTemperatureC: f.airTemperatureC == null ? null : Number(f.airTemperatureC),
    relativeHumidityPct: f.relativeHumidityPct == null ? null : Number(f.relativeHumidityPct),
    skyCondition: f.skyCondition, ventilation: f.ventilation, sourceType: f.sourceType,
  };
}

/** Las vigentes —la más reciente de cada punto, sin supersedidas— y las 20 últimas. */
export async function ambienteDeInstalacion(userAccountId: string, facilityLocationId: string) {
  const lugar = await instalacion(facilityLocationId);
  if (!(await puedeEn(userAccountId, lugar, ["manage", "view"]))) throw new TraceabilityAccessError("no_sample_access");
  const where = { facilityLocationId: lugar.id, supersededAt: null };
  const orderBy = [{ occurredAt: "desc" as const }, { createdAt: "desc" as const }];
  const [vigentes, recientes] = await Promise.all([
    prisma.dryingAmbientReading.findMany({ where, orderBy, distinct: ["rackLocationId", "rackLevel"], select: SELECCION }),
    prisma.dryingAmbientReading.findMany({ where, orderBy, take: 20, select: SELECCION }),
  ]);
  return { vigentes: vigentes.map(aVigente), recientes: recientes.map(aVigente) };
}
```

Si `parentLocation` no es el nombre de la relación padre en `Location`, se usa el que diga `prisma/schema.prisma` (buscar `parentLocationId` dentro de `model Location`). **No se inventa**: se lee.

- [ ] **Paso 8: verlas pasar**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/ambiente.test.ts tests/traceability/ambienteVigente.test.ts
```

Esperado: 19/19 en `ambiente.test.ts` (13 + 6) y 7/7 en `ambienteVigente.test.ts`.

- [ ] **Paso 9: compuerta y commit**

```bash
npx tsc --noEmit; test $? -eq 0 && npm run build; test $? -eq 0 && echo COMPUERTA-OK
git add lib/traceability/ambienteVigente.ts lib/traceability/ambiente.ts tests/traceability/ambienteVigente.test.ts tests/traceability/ambiente.test.ts
git diff --cached --stat   # CUATRO archivos
git commit -F <archivo-con-el-mensaje>
```

---

### Tarea 3: la pantalla, en la instalación

**Archivos:**
- Crear: `app/instalaciones/FormularioAmbiente.tsx`
- Modificar: `lib/traceability/secadoForm.ts`, `app/actions/instalaciones.ts`, `app/instalaciones/[id]/page.tsx`, `messages/es.json`, `messages/en.json`, `tests/traceability/secadoForm.test.ts`

**Interfaces:**
- Consume `registrarLecturaDeAmbiente`, `ambienteDeInstalacion`, `puedeRegistrarAmbienteEn`, `AmbienteError`, `lecturaDelPunto`, `edad`.
- Produce en `secadoForm.ts`: `CIELOS`, `VENTILACIONES` y `leerLecturaDeAmbiente(form: FormData): LecturaDeAmbienteInput`.
- Produce en `app/actions/instalaciones.ts`: `registrarAmbienteFormAction(state: SecadoFormState, form: FormData): Promise<SecadoFormState>`.

- [ ] **Paso 1: la prueba del lector que falla**

En `tests/traceability/secadoForm.test.ts`, añadir `CIELOS, leerLecturaDeAmbiente, VENTILACIONES` al import. Añadir a las claves de la prueba de mensajes:

```ts
        ...CIELOS.map((v) => `cielo_${v}`), ...VENTILACIONES.map((v) => `ventilacion_${v}`),
        ...["lectura_vacia", "nota_sin_valor", "fuera_de_rango", "punto_invalido", "instalacion_invalida"].map((v) => `error_${v}`),
        "ambienteTitulo", "ambienteIntro", "ambienteGeneral", "ambienteSinLectura", "ambienteSinLecturaDelNivel",
        "ambienteRecientes", "ambienteGuardado", "ambienteRegistrar", "ambientePunto", "ambientePuntoGeneral",
        "ambienteNivelOpcional", "ambienteTemperatura", "ambienteUnidad", "ambienteHumedadRelativa", "ambienteCielo",
        "ambienteNotaCielo", "ambienteVentilacion", "ambienteNotaVentilacion", "haceMin", "haceH", "haceD",
        "fuente_manual", "ambienteEstanteNoVisible", "ambienteNivelSinEstante",
```

Y una prueba nueva:

```ts
  it("la lectura de ambiente: vacíos quedan nulos, la temperatura lleva su unidad, y el POST valida los catálogos", () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ facilityLocationId: "cuarto", occurredAt: "2026-09-21T09:30", tzOffsetMinutes: "300",
      temperatura: "75.2", unidadTemperatura: "F", humedadRelativaPct: "", skyCondition: "cloudy", skyNote: "  bruma  ",
      ventilation: "", ventilationNote: "", rackLocationId: "", rackLevel: "" })) form.set(k, v);
    expect(leerLecturaDeAmbiente(form)).toMatchObject({
      facilityLocationId: "cuarto", occurredAt: new Date("2026-09-21T14:30:00Z"), rackLocationId: null, rackLevel: null,
      temperatura: { valor: 75.2, unidad: "F" }, humedadRelativaPct: null, cielo: "cloudy", notaCielo: "bruma",
      ventilacion: null, notaVentilacion: null, operatorPersonId: null,
    });
    form.set("temperatura", ""); expect(leerLecturaDeAmbiente(form).temperatura).toBeNull();
    form.set("skyCondition", "tormenta"); expect(() => leerLecturaDeAmbiente(form)).toThrow("datos_invalidos");
    form.set("skyCondition", "cloudy"); form.set("unidadTemperatura", "K"); form.set("temperatura", "20");
    expect(() => leerLecturaDeAmbiente(form)).toThrow("datos_invalidos");
    form.set("unidadTemperatura", "C"); form.set("rackLevel", "dos"); expect(() => leerLecturaDeAmbiente(form)).toThrow("datos_invalidos");
  });
```

- [ ] **Paso 2: verla fallar**

```bash
npx vitest run tests/traceability/secadoForm.test.ts
```

Esperado: FAIL, `leerLecturaDeAmbiente is not a function` (o import no exportado).

- [ ] **Paso 3: el lector**

En `lib/traceability/secadoForm.ts`:
- en el import de `../../generated/prisma/enums` añadir `DryingVentilation, SkyCondition`;
- añadir `import type { LecturaDeAmbienteInput } from "./ambiente";`;
- y debajo de `GRADOS_DE_SOMBRA`:

```ts
export const CIELOS = Object.values(SkyCondition);
export const VENTILACIONES = Object.values(DryingVentilation);
```

Al final del archivo:

```ts
/** Un número opcional del formulario: vacío es null; lo que no es número, error. */
function numeroOpcional(form: FormData, key: string): number | null {
  const raw = texto(form, key);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new SecadoFormError("datos_invalidos");
  return n;
}

export function leerLecturaDeAmbiente(form: FormData): LecturaDeAmbienteInput {
  const temperatura = numeroOpcional(form, "temperatura");
  const cielo = texto(form, "skyCondition");
  const ventilacion = texto(form, "ventilation");
  return {
    facilityLocationId: obligatorio(form, "facilityLocationId"),
    rackLocationId: texto(form, "rackLocationId") || null,
    rackLevel: numeroOpcional(form, "rackLevel"),
    occurredAt: parseLocalDateTime(texto(form, "occurredAt"), texto(form, TZ_OFFSET_FIELD)),
    operatorPersonId: texto(form, "operatorPersonId") || null,
    temperatura: temperatura == null ? null : { valor: temperatura, unidad: opcion(texto(form, "unidadTemperatura"), ["C", "F"] as const) },
    humedadRelativaPct: numeroOpcional(form, "humedadRelativaPct"),
    cielo: cielo ? opcion(cielo, CIELOS) : null,
    notaCielo: texto(form, "skyNote") || null,
    ventilacion: ventilacion ? opcion(ventilacion, VENTILACIONES) : null,
    notaVentilacion: texto(form, "ventilationNote") || null,
  };
}
```

`rackLevel: "dos"` lanza en `numeroOpcional`. Un `2.5` pasa el lector y lo rechaza el servicio (`datos_invalidos`); no se valida dos veces.

**Cuidado con el ciclo de import:** `secadoForm.ts` lo importa un componente de cliente, y `ambiente.ts` importa la base. El `import type` se borra al compilar, así que no arrastra `lib/db` al cliente. **`npm run build` lo confirma**; si falla con «Module not found: Can't resolve 'pg'» o similar, el import no es `import type`.

- [ ] **Paso 4: verla pasar**

```bash
npx vitest run tests/traceability/secadoForm.test.ts
```

Esperado: rojo **sólo** en la prueba de mensajes (faltan los textos). Todo lo demás en verde.

- [ ] **Paso 5: los textos**

En `messages/es.json`, dentro de `"Secado"`:

```json
    "ambienteTitulo": "Ambiente",
    "ambienteIntro": "Anota cómo está el aire del lugar: temperatura, humedad relativa, cielo y ventilación. La humedad relativa es la del AIRE, no la del grano: la del grano se mide en una inspección de cama. Cada lectura vale sólo para el punto donde se tomó —la del nivel 2 no dice nada del nivel 5— y siempre enseña cuánto hace que se tomó. El secado es un ambiente compartido: ante un lote que se retrasa, primero se actúa sobre el lote (mover la bandeja, abanico); cambiar el cuarto afecta a todos los lotes que hay dentro.",
    "ambienteGeneral": "General de la instalación",
    "ambienteSinLectura": "Sin lecturas todavía.",
    "ambienteSinLecturaDelNivel": "sin lectura de este nivel",
    "ambienteRecientes": "Últimas lecturas",
    "ambienteGuardado": "Lectura de ambiente guardada.",
    "ambienteRegistrar": "Guardar lectura",
    "ambientePunto": "Dónde se tomó",
    "ambientePuntoGeneral": "En general, en la instalación",
    "ambienteNivelOpcional": "Nivel (opcional)",
    "ambienteTemperatura": "Temperatura del aire",
    "ambienteUnidad": "Unidad",
    "ambienteHumedadRelativa": "Humedad relativa del aire (%)",
    "ambienteCielo": "Cielo",
    "ambienteNotaCielo": "Nota del cielo",
    "ambienteVentilacion": "Ventilación",
    "ambienteNotaVentilacion": "Nota de la ventilación",
    "cielo_sunny": "Soleado",
    "cielo_partly_cloudy": "Parcialmente nublado",
    "cielo_cloudy": "Nublado",
    "cielo_rain": "Lluvia",
    "ventilacion_open": "Abierto",
    "ventilacion_semi_open": "Semiabierto",
    "ventilacion_closed": "Cerrado",
    "ventilacion_fan_or_dehumidifier": "Ventilador / deshumidificador",
    "haceMin": "hace {n} min",
    "haceH": "hace {n} h",
    "haceD": "hace {n} d",
    "fuente_manual": "a mano",
    "ambienteEstanteNoVisible": "estante no visible",
    "ambienteNivelSinEstante": "nivel {n}, sin estante",
    "error_lectura_vacia": "Anota al menos una cosa: temperatura, humedad relativa, cielo o ventilación.",
    "error_nota_sin_valor": "Una nota va al lado de su valor: elige primero el cielo o la ventilación.",
    "error_fuera_de_rango": "Fuera de rango: la temperatura va de -10 a 80 °C y la humedad relativa de 0 a 100 %.",
    "error_punto_invalido": "Ese estante o ese nivel no existe en esta instalación.",
    "error_instalacion_invalida": "Eso no es una instalación de secado."
```

En `messages/en.json`, las mismas claves:

```json
    "ambienteTitulo": "Ambient conditions",
    "ambienteIntro": "Record the air in this place: temperature, relative humidity, sky and ventilation. Relative humidity is the AIR's, not the grain's: grain moisture is measured in a bed inspection. Each reading only counts for the spot where it was taken — level 2 says nothing about level 5 — and it always shows how long ago it was taken. Drying is a shared environment: when one lot falls behind, act on the lot first (move the tray, fan); changing the room affects every lot inside it.",
    "ambienteGeneral": "Whole facility",
    "ambienteSinLectura": "No readings yet.",
    "ambienteSinLecturaDelNivel": "no reading for this level",
    "ambienteRecientes": "Latest readings",
    "ambienteGuardado": "Ambient reading saved.",
    "ambienteRegistrar": "Save reading",
    "ambientePunto": "Where it was taken",
    "ambientePuntoGeneral": "Whole facility",
    "ambienteNivelOpcional": "Level (optional)",
    "ambienteTemperatura": "Air temperature",
    "ambienteUnidad": "Unit",
    "ambienteHumedadRelativa": "Air relative humidity (%)",
    "ambienteCielo": "Sky",
    "ambienteNotaCielo": "Sky note",
    "ambienteVentilacion": "Ventilation",
    "ambienteNotaVentilacion": "Ventilation note",
    "cielo_sunny": "Sunny",
    "cielo_partly_cloudy": "Partly cloudy",
    "cielo_cloudy": "Cloudy",
    "cielo_rain": "Rain",
    "ventilacion_open": "Open",
    "ventilacion_semi_open": "Half open",
    "ventilacion_closed": "Closed",
    "ventilacion_fan_or_dehumidifier": "Fan / dehumidifier",
    "haceMin": "{n} min ago",
    "haceH": "{n} h ago",
    "haceD": "{n} d ago",
    "fuente_manual": "by hand",
    "ambienteEstanteNoVisible": "rack not visible",
    "ambienteNivelSinEstante": "level {n}, no rack",
    "error_lectura_vacia": "Record at least one thing: temperature, relative humidity, sky or ventilation.",
    "error_nota_sin_valor": "A note goes next to its value: pick the sky or ventilation first.",
    "error_fuera_de_rango": "Out of range: temperature is -10 to 80 °C and relative humidity 0 to 100 %.",
    "error_punto_invalido": "That rack or level does not exist in this facility.",
    "error_instalacion_invalida": "That is not a drying facility."
```

```bash
npx vitest run tests/traceability/secadoForm.test.ts
```

Esperado: todo en verde.

- [ ] **Paso 6: la acción**

En `app/actions/instalaciones.ts`, añadir a los imports `registrarLecturaDeAmbiente, AmbienteError` de `../../lib/traceability/ambiente`, `leerLecturaDeAmbiente` al import de `secadoForm`, `TraceabilityAccessError` de `../../lib/traceability/lots` y `LocalDateTimeError` de `../../lib/time/localDateTime`. Después:

```ts
export async function registrarAmbienteFormAction(_state: SecadoFormState, form: FormData): Promise<SecadoFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  let facilityId: string;
  try {
    const input = leerLecturaDeAmbiente(form);
    facilityId = input.facilityLocationId;
    await registrarLecturaDeAmbiente(user.userAccountId, input);
  } catch (error) {
    // Cada clase de error de validación tiene su rama AQUÍ, en el mismo cambio:
    // una que falte es un 500 (CLAUDE.md, «Una clase de validación nueva…»).
    if (error instanceof AmbienteError || error instanceof SecadoFormError) return { error: error.message };
    if (error instanceof LocalDateTimeError) return { error: "fecha_invalida" };
    if (error instanceof TraceabilityAccessError) return { error: "sin_acceso" };
    throw error;
  }
  revalidatePath(`/instalaciones/${facilityId}`);
  redirect(`/instalaciones/${facilityId}?ok=ambiente`);
}
```

- [ ] **Paso 7: el formulario**

Crear `app/instalaciones/FormularioAmbiente.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { registrarAmbienteFormAction } from "../actions/instalaciones";
import { BotonDeEnvio } from "../components/BotonDeEnvio";
import { TimezoneOffsetField } from "../components/TimezoneOffsetField";
import { CIELOS, VENTILACIONES } from "../../lib/traceability/secadoForm";

type Estante = { id: string; name: string; niveles: number };

export function FormularioAmbiente({ facilityId, estantes, nivelesSinEstante, personas }: {
  facilityId: string; estantes: Estante[]; nivelesSinEstante: number[]; personas: { id: string; name: string }[];
}) {
  const t = useTranslations("Secado");
  const [state, action] = useActionState(registrarAmbienteFormAction, {});
  const [estanteId, setEstanteId] = useState("");
  const niveles = estanteId
    ? Array.from({ length: estantes.find((e) => e.id === estanteId)?.niveles ?? 0 }, (_, i) => i + 1)
    : [...new Set([...nivelesSinEstante, ...estantes.flatMap((e) => Array.from({ length: e.niveles }, (_, i) => i + 1))])].sort((a, b) => a - b);
  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    <TimezoneOffsetField />
    <input type="hidden" name="facilityLocationId" value={facilityId} />
    <label>{t("hora")}<input type="datetime-local" name="occurredAt" required /></label>
    <label>{t("ambientePunto")}<select name="rackLocationId" value={estanteId} onChange={(e) => setEstanteId(e.target.value)}>
      <option value="">{t("ambientePuntoGeneral")}</option>
      {estantes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select></label>
    <label>{t("ambienteNivelOpcional")}<select name="rackLevel" defaultValue="" key={estanteId}>
      <option value="">—</option>
      {niveles.map((n) => <option key={n} value={n}>{t("nivel", { n })}</option>)}
    </select></label>
    <label>{t("ambienteTemperatura")}<input type="number" name="temperatura" step="0.1" /></label>
    <label>{t("ambienteUnidad")}<select name="unidadTemperatura" defaultValue="C">
      <option value="C">°C</option><option value="F">°F</option>
    </select></label>
    <label>{t("ambienteHumedadRelativa")}<input type="number" name="humedadRelativaPct" step="0.1" min="0" max="100" /></label>
    <label>{t("ambienteCielo")}<select name="skyCondition" defaultValue="">
      <option value="">—</option>
      {CIELOS.map((c) => <option key={c} value={c}>{t(`cielo_${c}`)}</option>)}
    </select></label>
    <label>{t("ambienteNotaCielo")}<input name="skyNote" maxLength={300} /></label>
    <label>{t("ambienteVentilacion")}<select name="ventilation" defaultValue="">
      <option value="">—</option>
      {VENTILACIONES.map((v) => <option key={v} value={v}>{t(`ventilacion_${v}`)}</option>)}
    </select></label>
    <label>{t("ambienteNotaVentilacion")}<input name="ventilationNote" maxLength={300} /></label>
    <label>{t("operador")}<select name="operatorPersonId" defaultValue="">
      <option value="">{t("noDeclarado")}</option>
      {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <BotonDeEnvio>{t("ambienteRegistrar")}</BotonDeEnvio>
  </form>;
}
```

- [ ] **Paso 8: la página**

En `app/instalaciones/[id]/page.tsx`:

Imports nuevos:

```tsx
import { ambienteDeInstalacion, puedeRegistrarAmbienteEn } from "../../../lib/traceability/ambiente";
import { edad, lecturaDelPunto, type LecturaVigente } from "../../../lib/traceability/ambienteVigente";
import { TraceabilityAccessError, getObserverCandidates } from "../../../lib/traceability/lots";
import { FormularioAmbiente } from "../FormularioAmbiente";
```

Después de calcular `puedeEditarPosicion`:

```tsx
  // El ambiente pide otro permiso que la instalación (`sample`, no
  // `manage_attributes`): sin él la sección no aparece, sin romper la página.
  const ambiente = await ambienteDeInstalacion(user.userAccountId, id).catch((error: unknown) => {
    if (error instanceof TraceabilityAccessError) return null;
    throw error;
  });
  const puedeRegistrarAmbiente = ambiente ? await puedeRegistrarAmbienteEn(user.userAccountId, id) : false;
  const personas = puedeRegistrarAmbiente ? (await getObserverCandidates(user.userAccountId)).people.map((p) => ({ id: p.id, name: p.displayName })) : [];
  const ahora = new Date();
  const nombreDeEstante = (rackId: string | null) =>
    rackId == null ? null : instalacion.estantes.find((e) => e.id === rackId)?.name ?? t("ambienteEstanteNoVisible");
  const resumen = (l: LecturaVigente) => {
    const e = edad(l.occurredAt, ahora);
    return [
      l.airTemperatureC != null ? `${l.airTemperatureC.toFixed(1)} °C` : null,
      l.relativeHumidityPct != null ? `${l.relativeHumidityPct.toFixed(1)} % HR` : null,
      l.skyCondition ? t(`cielo_${l.skyCondition}`) : null,
      l.ventilation ? t(`ventilacion_${l.ventilation}`) : null,
    ].filter(Boolean).join(" · ") + ` — ${t(e.unidad === "min" ? "haceMin" : e.unidad === "h" ? "haceH" : "haceD", { n: e.n })} (${t(`fuente_${l.sourceType}`)})`;
  };
  const puntoDe = (l: LecturaVigente) => l.rackId
    ? `${nombreDeEstante(l.rackId)}${l.rackLevel != null ? ` · ${t("nivel", { n: l.rackLevel })}` : ""}`
    : l.rackLevel != null ? t("ambienteNivelSinEstante", { n: l.rackLevel }) : t("ambienteGeneral");
```

**`fuente_${l.sourceType}`**: hoy sólo existe `fuente_manual`, y el servicio sólo escribe `manual`. El día que un registrador escriba `sensor`, su clave se añade en ese mismo cambio. La prueba de mensajes no la exige hoy porque no puede existir.

En el JSX, debajo de `{ok === "guardado" && …}`:

```tsx
    {ok === "ambiente" && <p role="status">{t("ambienteGuardado")}</p>}
```

En la rejilla de cada estante, una celda más por fila de nivel, **después** de los puestos:

```tsx
              <td>{ambiente
                ? (() => { const l = lecturaDelPunto(ambiente.vigentes, { rackId: estante.id, rackLevel: nivel }); return l ? resumen(l) : t("ambienteSinLecturaDelNivel"); })()
                : null}</td>
```

Y la sección, antes del enlace final a la inspección:

```tsx
    {ambiente && <section>
      <h2>{t("ambienteTitulo")}</h2>
      <p className="nn-muted">{t("ambienteIntro")}</p>
      <p><strong>{t("ambienteGeneral")}:</strong> {(() => { const g = lecturaDelPunto(ambiente.vigentes, { rackId: null, rackLevel: null }); return g ? resumen(g) : t("ambienteSinLectura"); })()}</p>
      <h3>{t("ambienteRecientes")}</h3>
      {ambiente.recientes.length
        ? <ul>{ambiente.recientes.map((l) => <li key={l.id}>{puntoDe(l)}: {resumen(l)}</li>)}</ul>
        : <p>{t("ambienteSinLectura")}</p>}
      {puedeRegistrarAmbiente && <FormularioAmbiente facilityId={id}
        estantes={instalacion.estantes.map((e) => ({ id: e.id, name: e.name, niveles: e.niveles }))}
        nivelesSinEstante={[...new Set(instalacion.camas.map((c) => c.rackLevel).filter((n): n is number => n != null))]}
        personas={personas} />}
    </section>}
```

- [ ] **Paso 9: compuerta, carril hermético, y verlo en el navegador**

```bash
npx tsc --noEmit; test $? -eq 0 && npm run build; test $? -eq 0 && echo COMPUERTA-OK
bash scripts/ci.sh; echo "ci.sh exit $?"
```

Esperado: `COMPUERTA-OK`, y `ci.sh exit 0` **sin** que `ambiente.test.ts` aparezca en su salida (si aparece, falta en `pruebas-por-compuerta.txt`). `ambienteVigente.test.ts` **sí** tiene que aparecer: es hermética. Buscarla por su nombre en la salida — es el control positivo de que el carril la ve.

En el navegador, con la app sobre la base local y una cuenta Farm Operator:
1. abrir `/instalaciones/<id del cuarto>`;
2. guardar una lectura general (24 °C, 61 %, nublado) y otra en estante 1 · nivel 2 (22 °C);
3. comprobar que la rejilla dice «22,0 °C … hace 0 min» en el nivel 2 y **«sin lectura de este nivel»** en los demás;
4. comprobar que la general no aparece en ningún nivel.

Captura de la rejilla para el PR.

- [ ] **Paso 10: commit**

```bash
git add lib/traceability/secadoForm.ts app/actions/instalaciones.ts app/instalaciones/FormularioAmbiente.tsx 'app/instalaciones/[id]/page.tsx' messages/es.json messages/en.json tests/traceability/secadoForm.test.ts
git diff --cached --stat   # SIETE archivos
git commit -F <archivo-con-el-mensaje>
```

---

### Tarea 4: flip-tests, documentos y la compuerta final

**Archivos:**
- Modificar: `docs/architecture/DECISIONS.md`, `SESSION_STATE.md`, `docs/superpowers/specs/2026-09-18-secado-por-bandeja-y-su-receta-design.md`

- [ ] **Paso 1: los flip-tests, contra el commit de la Tarea 3**

Cada uno con las tres cosas de la casa: **sha del archivo antes y después (distintos o abortar), compila (`npx tsc --noEmit`), y qué prueba cae por su nombre**. Borrar cualquier salida anterior antes de cada corrida. Restaurar con `git checkout -- <archivo>` y comprobar que el sha vuelve.

| # | mutación | archivo | debe caer, por su nombre |
|---|---|---|---|
| 1 | **interpolar**: en `lecturaDelPunto`, si no hay del punto, devolver la más reciente de **cualquier** nivel del mismo estante | `lib/traceability/ambienteVigente.ts` | «el nivel 3 del estante E1 no tiene lectura propia…» (es el flip-test 3 de la spec §5) |
| 2 | **la general rellena**: si no hay del punto, devolver la general | ídem | la misma, y «“nivel 3 sin estante” es su propio punto…» |
| 3 | quitar el `CHECK drying_ambient_reading_nota_de_cielo_con_valor` en una base desechable `nn_flip_ambiente` (crear, `migrate deploy` con la migración mutada, correr, borrar) | la migración | «una nota sin su valor de catálogo se rechaza…» |
| 4 | en el disparador de punto, quitar la rama del nivel | ídem, en `nn_flip_ambiente` | «el nivel tiene que existir…» |

Los flip-tests 3 y 4 **no** se hacen sobre `nectar_test`: una migración mutada en la base compartida es la trampa de «La base de pruebas es compartida» de `CLAUDE.md`. El nombre `nn_flip_` es el que la puerta de borrado reconoce.

Anotar la tabla con los cuatro resultados en el mensaje del PR.

- [ ] **Paso 2: el ADR**

En `docs/architecture/DECISIONS.md`, con el siguiente número libre (**leerlo, no suponerlo**: `grep -oE "^## ADR-[0-9]+" docs/architecture/DECISIONS.md | tail -3`):

```markdown
## ADR-NNN — El secado por bandeja, paso 4: el ambiente a mano, y la lectura de un punto es sólo la de ese punto

**Fecha:** <día>. **Spec:** `docs/superpowers/specs/2026-09-18-secado-por-bandeja-y-su-receta-design.md` §4.5. **Plan:** `docs/superpowers/plans/2026-09-21-secado-4-ambiente-a-mano.md`.

- Una tabla ancha, `traceability.drying_ambient_reading`: temperatura, HR, cielo y ventilación de una persona en un momento. **No** es `environmental.observation` de `DATA_ARCHITECTURE.md` §6, que sigue reservada para sensores (estrecha y particionada). Si llega un registrador a un cuarto, se decide entonces si escribe aquí con `sourceType = sensor` o en aquélla.
- El punto es la instalación, con estante y nivel opcionales; no hay «fila» porque la fila es el estante (2a).
- **La lectura de un punto es sólo la de ese mismo punto.** Ni la general ni la de otro nivel ocupan su sitio: sin lectura propia se dice «sin lectura de este nivel». Guardado por el flip-test 1 del plan.
- La edad se enseña siempre; no hay umbral de «vieja» porque no hay ninguno aprobado.
- Permiso: `sample:manage` para registrar y `sample:manage|view` para ver, sobre la instalación, como una inspección de cama. Elección técnica; si Daniel quiere otro, es un cambio de una función (`puedeEn` en `lib/traceability/ambiente.ts`).
- Fuera: la bandeja viendo su lectura (espera al 2b), y corregir desde la pantalla (el servicio ya corrige).
```

- [ ] **Paso 3: la spec y el estado**

En la spec, §6, añadir al final de la línea 4: « — **plan: `docs/superpowers/plans/2026-09-21-secado-4-ambiente-a-mano.md`; construido en el PR #NNN**».

En `SESSION_STATE.md` §2, una entrada nueva arriba del todo, de cinco líneas como máximo, con la misma forma que las demás. Después:

```bash
npm run check:state; echo "check:state exit $?"
```

Leer el **código de salida**, no la cola: la salida empieza con el veredicto y sigue con avisos.

- [ ] **Paso 4: la compuerta final**

```bash
npx tsc --noEmit; echo "tsc $?"
npm run build; echo "build $?"
npm run verify; echo "verify $?"
bash scripts/ci.sh; echo "ci.sh $?"
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npm test; echo "test $?"
```

Los cinco, uno por uno, **sin canalizar ninguno**. Si `npm test` falla en un archivo que este plan no tocó, mirar primero si la base compartida tiene una migración de otra sesión (la receta con `comm -13` de `CLAUDE.md`, «La base de pruebas es compartida»), antes de tocar nada.

- [ ] **Paso 5: commit, PR y coordinadora**

```bash
git add docs/architecture/DECISIONS.md SESSION_STATE.md docs/superpowers/specs/2026-09-18-secado-por-bandeja-y-su-receta-design.md
git diff --cached --stat   # TRES archivos
git commit -F <archivo-con-el-mensaje>
git push -u origin <rama>
git diff --name-only origin/main...HEAD   # tres puntos: lo que lleva el PR
```

Deben salir los archivos del mapa y **ninguno más**. Abrir el PR con la tabla de flip-tests, la captura del paso 9 de la Tarea 3, y las dos cosas que se dicen en voz alta: el permiso elegido y P-G. Cuando las seis comprobaciones estén en verde sobre el sha del PR y `main` esté dentro por ascendencia, se manda a la sesión coordinadora. **No se fusiona desde aquí.**
