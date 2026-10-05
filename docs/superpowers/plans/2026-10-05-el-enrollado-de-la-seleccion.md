# El enrollado de la selección: cinco consultas y el ADR — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el lote responda por lo que ocurre en sus selecciones — cinco consultas que hoy
filtran por `locationId` pelado pasan a enrollar a sus descendientes, distinguiendo lo propio de
lo heredado, y la regla queda escrita en un ADR.

**Architecture:** no se escribe un mecanismo nuevo. Se reutiliza `ubicacionesEmparentadas`, que ya
usan intervenciones, floración, cosecha y la pendiente de la parcela, con **una opción nueva para
pedir sólo descendientes** — porque la función incluye también ascendientes y en estas cinco eso
haría que la ficha de una microparcela mostrara los hechos de su madre. El cambio es por consulta,
cada una con su guardia, y el divisor del rendimiento sigue siendo el área de la madre.

**Tech Stack:** Next.js 16 App Router, Prisma 7, vitest 4.1.10, TypeScript 6.0.3.

**Spec:** `docs/superpowers/specs/2026-10-03-la-seleccion-no-resta-design.md` — leer §2, §2.1, §2.2,
§3.1, §4 y §5. **Este plan NO cubre §3.3** (el vocabulario: `subdivisionReason` →
`motivoDeLaSeleccion`, el comentario del bloque, `micro_plot`): es un subsistema independiente, con
migración y renombrado de enum, y lleva su propio plan. **§3.2 no se toca**: dos de sus tres
rechazos ya existen en `main` y el tercero está decidido en contra por Daniel el 2026-10-04.

---

## Global Constraints

- **La regla, literal del spec §2:** «Una selección no resta. Un microlote, un bloque o una planta
  nombran **parte de la rejilla de su lote**, y el lote sigue respondiendo por lo que ocurre en
  ellos.»
- **§2.1, el corolario que caza errores:** «Si el rendimiento del lote incluye el de su microlote,
  el **divisor sigue siendo las hectáreas del lote**.» Nunca se suman dos `areaHectares`.
- **§4:** «Un hecho que llega de una selección **se pinta diciendo de dónde viene**. […] un total no
  es una medición si no se puede desarmar.» Prohibido devolver un agregado sin su desglose.
- **§2.2, qué enrolla y qué no.** Enrollan: intervenciones y su carencia, floración, cosecha,
  **rendimiento**, **cohortes de siembra y eventos de producción**, **especímenes y trampas**. **NO
  enrollan**: muestras, calicatas de suelo, fotos, jornadas de campo —«se toman en un punto y son de
  ese punto»— ni los bloques —«un bloque es una selección de SU parcela; listarlo en la madre lo
  haría parecer suyo».
- **El cliente de Prisma NUNCA se llama `db` en estos archivos.** El detector del inventario
  reconoce `prisma`, `aiPrisma`, `tx` y `client`; con `db` la consulta **se vuelve invisible** y el
  archivo sale con una operación menos. Está documentado en `lib/traceability/floracion.ts` y costó
  un 599 → 598 silencioso. Usar `client`, como ese archivo.
- **Toda prueba que necesite base de datos se añade a `scripts/pruebas-por-compuerta.txt`**, o
  `scripts/ci.sh` la corre en el carril hermético y falla por no tener base. Las de este plan la
  necesitan todas.
- **Las compuertas se corren sin tuberías y con el código de salida en su propia línea** (un `echo`
  en medio devuelve el código del `echo`), y se leen **las dos** líneas de veredicto de vitest:
  `Test Files` **y** `Tests`.
- **Commitear antes de mutar** en cualquier flip-test: el arnés restaura desde `HEAD`.
- **`git commit -F <archivo>`**, nunca `-m`: los backticks dentro de `-m` se ejecutan y la palabra
  desaparece en silencio.
- **Antes de cualquier `npm`/`npx`:** `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`, y
  `NODE_OPTIONS="--max-old-space-size=6144"` delante de `tsc` y de `build`.
- **La base del puerto 55433 (`nectar_test`) NO SE REINICIA NUNCA**, ni se migra, ni se le aplica
  `prisma migrate reset` ni `db push --force-reset`. Para correr el carril con base se usa una base
  **desechable** cuyo nombre case con `^(nectar_test|nectar_ci|nn_flip_)` y creada con
  `TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'`, con el
  identificador **entre comillas**.

## File Structure

| archivo | responsabilidad | qué cambia |
|---|---|---|
| `lib/traceability/ubicacionesEmparentadas.ts` | el conector: una ubicación, sus ascendientes y sus descendientes | **gana una opción** `soloDescendientes`; su contrato actual no cambia |
| `lib/traceability/plantingCohorts.ts` | `getPlotDetail` y el rendimiento | cuatro consultas enrollan; el rendimiento distingue propio de heredado |
| `lib/traceability/specimens.ts` | las plantas de una parcela | una consulta enrolla |
| `docs/architecture/DECISIONS.md` | el registro de reglas de modelo | **gana el ADR** de «una selección no resta» |
| `tests/traceability/ubicacionesEmparentadas.test.ts` | el conector | gana los casos de la opción nueva |
| `tests/territorio/la-seleccion-no-resta.test.ts` | **nuevo** — los guardias del enrollado | lo crea la Tarea 3 y lo amplían la 4 y la 5 |
| `scripts/pruebas-por-compuerta.txt` | qué prueba corre en qué carril | gana la línea del archivo nuevo |

---

### Task 1: El ADR, para que la regla tenga un sitio nombrado

**Files:**
- Modify: `docs/architecture/DECISIONS.md` (al final, después del último ADR)

**Interfaces:**
- Consumes: nada.
- Produces: el número de ADR que las Tareas 2-6 citan en los comentarios del código. **El número se
  asigna en este paso, mirando el archivo, no copiándolo de aquí.**

- [ ] **Step 1: medir qué número toca, porque dos sesiones que numeran a la vez chocan**

```bash
grep -oE '^## ADR-[0-9]+' docs/architecture/DECISIONS.md | tail -1
```

Esperado: `## ADR-195` sobre el `main` del 2026-10-05, o sea que toca el **196**. Si sale otro
número, usar el siguiente a ése y **no** el 196: esto ya pasó con `D-019`.

- [ ] **Step 2: escribir el ADR**

Añadir al final de `docs/architecture/DECISIONS.md`, con `NNN` sustituido por el número del Step 1:

```markdown
## ADR-NNN · Una selección no resta

**Fecha:** 2026-10-05 · **Spec:** `docs/superpowers/specs/2026-10-03-la-seleccion-no-resta-design.md`

Un microlote, un bloque o una planta nombran **parte de la rejilla de su lote**, y el lote sigue
respondiendo por lo que ocurre en ellos. Lo que cambia entre niveles es el **nivel de atención,
acción e impacto**, no la identidad: la misma planta es «hilera 12, planta 30» del lote mire quien
mire. De Daniel, 2026-10-03, con la metáfora del lego: «microparcela o microlote **no como una parte
del lote, es una selección del lote**», y «el lote sigue relevante».

**Corolario que caza errores: las áreas no se suman.** Si el rendimiento del lote incluye el de su
microlote, el divisor sigue siendo las hectáreas **del lote**. La microparcela está *dentro*, no *al
lado*; sumar las dos áreas sería tratarla como una parte, que es el error que esta regla existe para
impedir.

**Qué enrolla el lote, y qué no.** Decisión de Daniel, 2026-10-03: lo que cruza físicamente el
límite, más la producción y las plantas.

| hecho | ¿el lote responde por su microparcela? |
|---|---|
| intervenciones y su carencia, floración, cosecha | sí |
| rendimiento, cohortes de siembra, eventos de producción | sí |
| especímenes y trampas | sí |
| muestras, calicatas de suelo, fotos, jornadas de campo | **no** — se toman en un punto y son de ese punto |
| bloques | **no** — un bloque es una selección de SU parcela; listarlo en la madre lo haría parecer suyo |

Las tres primeras son las tres donde algo cruza: un producto aplicado y su carencia, una floración,
un residuo. Las que no, son observaciones de un punto. **Esta frontera se escribe aquí porque antes
no estaba dicha en ninguna parte, y por eso parecía un olvido en vez de una decisión.**

**El enrollado va hacia los descendientes, no hacia los ascendientes.** `ubicacionesEmparentadas`
devuelve las dos direcciones a propósito —la carencia las necesita— pero para el rendimiento, las
cohortes, los eventos de producción y los especímenes sólo vale la de abajo: una ficha de
microparcela que mostrara las cosechas de su madre contaría dos veces el mismo café.

**Un hecho heredado se marca, nunca se mezcla.** El rendimiento del lote distingue lo propio de lo
de cada selección, con su nombre. Un total que no se puede desarmar no es una medición.
```

- [ ] **Step 3: comprobar que el número no colisiona y que el archivo sigue sano**

```bash
grep -c '^## ADR-' docs/architecture/DECISIONS.md
grep -oE '^## ADR-[0-9]+' docs/architecture/DECISIONS.md | sort | uniq -d
```

Esperado: la primera cuenta sube en 1 respecto a antes; la segunda imprime **nada** (ningún número
repetido). Si imprime algo, el número elegido ya existía.

- [ ] **Step 4: commit**

```bash
git add docs/architecture/DECISIONS.md
git diff --cached --stat
```

Contar: debe decir **1 file changed**. Si dice más, parar y mirar qué arrastró el índice.

```bash
printf 'ADR-NNN: una seleccion no resta\n\nLa regla de Daniel del 2026-10-03 con su corolario (las areas no se\nsuman), la frontera de que hereda el lote y que no, y la direccion del\nenrollado. Hasta ahora esa frontera no estaba dicha en ninguna parte, y\npor eso parecia un olvido en vez de una decision.\n' > /tmp/msg-adr.txt
git commit -F /tmp/msg-adr.txt
```

---

### Task 2: El conector gana la dirección, sin duplicar la regla

**Files:**
- Modify: `lib/traceability/ubicacionesEmparentadas.ts:16`
- Test: `tests/traceability/ubicacionesEmparentadas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `ubicacionesEmparentadas(locationId: string, db?: Prisma.TransactionClient, opciones?: { soloDescendientes?: boolean }): Promise<string[]>`. Con
  `soloDescendientes: true` devuelve la ubicación y sus descendientes, **sin ascendientes**. Sin la
  opción, el comportamiento de hoy, idéntico — los cuatro llamadores actuales no se tocan.

**Por qué una opción y no una función nueva:** el spec §3.1 dice «No se escribe un segundo
mecanismo: duplicar la regla es cómo se pierde». Una segunda función que recorriera el árbol sería
el segundo mecanismo. Una opción en la misma función deja un solo recorrido, un solo tope de
profundidad y una sola guarda de ciclos.

- [ ] **Step 1: escribir las dos pruebas que fallan**

Añadir a `tests/traceability/ubicacionesEmparentadas.test.ts`:

```typescript
describe("soloDescendientes (ADR-NNN: el enrollado va hacia abajo)", () => {
  it("con la opcion, una microparcela NO arrastra a su madre", async () => {
    const madre = await crearUbicacion({ locationType: "plot", name: "madre" });
    const hija = await crearUbicacion({ locationType: "plot", name: "hija", parentLocationId: madre.id });

    const conOpcion = await ubicacionesEmparentadas(hija.id, undefined, { soloDescendientes: true });
    expect(conOpcion).toEqual([hija.id]);

    // CONTROL POSITIVO, y es el que hace que la asercion de arriba mida: sin la
    // opcion la madre SI sale. Sin esta mitad, un bug que devolviera [] pasaria.
    const sinOpcion = await ubicacionesEmparentadas(hija.id);
    expect(sinOpcion).toContain(madre.id);
    expect(sinOpcion).toHaveLength(2);
  });

  it("con la opcion, la madre SIGUE arrastrando a su hija", async () => {
    const madre = await crearUbicacion({ locationType: "plot", name: "madre2" });
    const hija = await crearUbicacion({ locationType: "plot", name: "hija2", parentLocationId: madre.id });

    const desde = await ubicacionesEmparentadas(madre.id, undefined, { soloDescendientes: true });
    expect(desde).toHaveLength(2);
    expect(desde).toContain(hija.id);
  });
});
```

Si el archivo no tiene un ayudante `crearUbicacion`, copiar el que ya use para sus casos actuales:
**no inventar uno nuevo** y no cambiar los existentes.

- [ ] **Step 2: correr y ver que fallan, por el motivo debido**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx vitest run tests/traceability/ubicacionesEmparentadas.test.ts
echo "$?"
```

Esperado: **2 fallidas**, y el mensaje debe ser que la tercera posición de la firma no existe o que
devolvió la madre. Si falla por otra cosa —un error de carga, una base ausente— arreglar eso antes
de seguir: una prueba que no llega a ejecutarse se lee igual que una que no caza nada.

- [ ] **Step 3: la implementación mínima**

En `lib/traceability/ubicacionesEmparentadas.ts`, cambiar la firma y envolver el bucle de
ascendientes:

```typescript
export async function ubicacionesEmparentadas(
  locationId: string,
  db: Prisma.TransactionClient = prisma,
  opciones?: { soloDescendientes?: boolean },
): Promise<string[]> {
  const vistos = new Set<string>([locationId]);

  // **La direccion importa y es una decision, no un detalle (ADR-NNN).** Para la
  // carencia hacen falta las dos: una cosecha de la madre puede llevar cafe de la
  // microparcela tratada. Para el rendimiento, las cohortes, los eventos de
  // produccion y los especimenes, NO: una ficha de microparcela que mostrara las
  // cosechas de su madre contaria dos veces el mismo cafe.
  if (!opciones?.soloDescendientes) {
    let actual: string | null = locationId;
    for (let i = 0; i < PROFUNDIDAD_MAXIMA_DE_UBICACION && actual; i += 1) {
      const fila: { parentLocationId: string | null } | null = await db.location.findUnique({
        where: { id: actual }, select: { parentLocationId: true },
      });
      const padre: string | null = fila?.parentLocationId ?? null;
      if (!padre || vistos.has(padre)) break;
      vistos.add(padre);
      actual = padre;
    }
  }
```

El resto de la función —el bucle de descendientes y el `return [...vistos]`— **no se toca**.

- [ ] **Step 4: correr y ver que pasan, y que no rompí a los cuatro llamadores**

```bash
npx vitest run tests/traceability/ubicacionesEmparentadas.test.ts tests/traceability/floracion.test.ts tests/traceability/intervenciones.test.ts tests/traceability/pendienteDeLaParcela.test.ts
echo "$?"
```

Leer **las dos** líneas: `Test Files` y `Tests`. Esperado: todo en verde y salida 0. Los tres
archivos de llamadores son el control de que la opción es aditiva: si alguno cae, el
comportamiento por omisión cambió y eso no es lo pedido.

- [ ] **Step 5: tipos**

```bash
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit
echo "$?"
```

Esperado: 0 y **cero bytes** de salida. `vitest` no comprueba tipos, así que este paso no es
opcional: un test en verde puede romper `next build`.

- [ ] **Step 6: commit**

```bash
git add lib/traceability/ubicacionesEmparentadas.ts tests/traceability/ubicacionesEmparentadas.test.ts
git diff --cached --stat
```

Contar: **2 files changed**.

```bash
printf 'El conector gana la direccion, sin duplicar el recorrido\n\n`soloDescendientes` evita que una ficha de microparcela muestre los\nhechos de su madre, que seria doble conteo. Va como opcion de la misma\nfuncion y no como una segunda: el spec dice que duplicar la regla es\ncomo se pierde. El comportamiento por omision no cambia, y los tres\narchivos de llamadores corren como control de eso.\n' > /tmp/msg-conector.txt
git commit -F /tmp/msg-conector.txt
```

---

### Task 3: Cohortes y eventos de producción enrollan

**Files:**
- Modify: `lib/traceability/plantingCohorts.ts` — las consultas `plantingCohort.findMany` y
  `plantingEvent.findMany` dentro de `getPlotDetail`
- Create: `tests/territorio/la-seleccion-no-resta.test.ts`
- Modify: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Consumes: `ubicacionesEmparentadas(locationId, client, { soloDescendientes: true })` de la Tarea 2.
- Produces: nada que otra tarea consuma; las Tareas 4 y 5 amplían el mismo archivo de pruebas.

- [ ] **Step 1: localizar las dos consultas por su texto, no por su línea**

```bash
grep -n "prisma.plantingCohort.findMany\|prisma.plantingEvent.findMany" lib/traceability/plantingCohorts.ts
```

Los números de línea de este plan caducan: el 2026-10-05 estaban en 653 y 682, y entre el
2026-10-03 y el 2026-10-05 se movieron tres líneas. **Usar los que imprima el `grep`.**

- [ ] **Step 2: escribir el guardia que falla**

Crear `tests/territorio/la-seleccion-no-resta.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getPlotDetail } from "../../lib/traceability/plantingCohorts";

describe("una seleccion no resta: cohortes y eventos de produccion (ADR-NNN)", () => {
  it("una cohorte sembrada en la microparcela aparece en la ficha de su madre", async () => {
    const { usuario, madre, hija } = await montarMadreEHija();
    await prisma.plantingCohort.create({
      data: { locationId: hija.id, plantedAt: new Date("2026-03-01"), status: "active", plantCount: 40 },
    });

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(ficha.cohorts.map((c) => c.locationId)).toContain(hija.id);
  });

  it("y la ficha de la HIJA no muestra las cohortes de su madre", async () => {
    const { usuario, madre, hija } = await montarMadreEHija();
    await prisma.plantingCohort.create({
      data: { locationId: madre.id, plantedAt: new Date("2026-03-02"), status: "active", plantCount: 10 },
    });

    const fichaDeLaHija = await getPlotDetail(usuario.userAccountId, hija.id);
    expect(fichaDeLaHija.cohorts).toHaveLength(0);

    // CONTROL POSITIVO: la misma cohorte SI sale en la ficha de la madre. Sin esta
    // mitad, un bug que devolviera [] siempre pasaria esta prueba.
    const fichaDeLaMadre = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(fichaDeLaMadre.cohorts).toHaveLength(1);
  });

  it("un evento «entro en produccion» de la microparcela aparece en su madre", async () => {
    const { usuario, madre, hija } = await montarMadreEHija();
    const cohorte = await prisma.plantingCohort.create({
      data: { locationId: hija.id, plantedAt: new Date("2026-03-03"), status: "active", plantCount: 5 },
    });
    await prisma.plantingEvent.create({
      data: {
        locationId: hija.id, plantingCohortId: cohorte.id, eventType: "entered_production",
        occurredAt: new Date("2026-09-01"), provenanceClass: "original_record",
      },
    });

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(ficha.eventosDeProduccion).toHaveLength(1);
  });
});
```

`montarMadreEHija` crea una organización, un proyecto, una cuenta con `lot:view` y
`location:view` sobre ese proyecto, una parcela con rejilla y una microparcela hija con rango.
**Copiar el montaje de `tests/territorio/microparcelaConRango.test.ts`**, que ya lo tiene resuelto y
cuyo `afterEach` deshace lo que crea; no escribir un montaje nuevo y **no dejar el fixture
compartido en un estado que esta prueba no pueda revertir**.

- [ ] **Step 3: declarar que necesita base, o el carril hermético la correrá y fallará**

Añadir a `scripts/pruebas-por-compuerta.txt`, en el grupo `base-sembrada`, junto a las demás de
`tests/territorio/`:

```
tests/territorio/la-seleccion-no-resta.test.ts
```

Comprobar que quedó donde debe:

```bash
grep -n "la-seleccion-no-resta" scripts/pruebas-por-compuerta.txt
grep -c . scripts/pruebas-por-compuerta.txt
```

- [ ] **Step 4: correr y ver que falla**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx vitest run tests/territorio/la-seleccion-no-resta.test.ts
echo "$?"
```

Esperado: la primera y la tercera **fallan** (la cohorte y el evento de la hija no salen en la
madre) y la segunda **pasa** (hoy no enrolla nada, así que la hija no ve a su madre). Esa asimetría
es la señal de que las pruebas miden: si fallan las tres, el montaje está mal; si pasan las tres, no
están llamando a lo que creen.

- [ ] **Step 5: enrollar las dos consultas**

En `getPlotDetail`, antes de la consulta de cohortes, calcular las ubicaciones una sola vez:

```typescript
  // ADR-NNN: el lote responde por sus selecciones. Hacia ABAJO solamente —ver el
  // comentario de `soloDescendientes`—, y con `locationId` en el `select` porque
  // §4 del diseño exige que un hecho heredado se pueda desarmar por su origen.
  const emparentadas = await ubicacionesEmparentadas(locationId, prisma, { soloDescendientes: true });
```

y cambiar las dos consultas:

```typescript
  const cohorts = await prisma.plantingCohort.findMany({
    where: { locationId: { in: emparentadas } },
    include: { cultivarValue: { select: { id: true, value: true } } },
    orderBy: [{ status: "asc" }, { plantedAt: "desc" }],
  });
```

```typescript
  const eventosDeProduccionCrudos = await prisma.plantingEvent.findMany({
    where: { locationId: { in: emparentadas }, eventType: "entered_production", plantingCohortId: { not: null } },
    select: {
      id: true,
      locationId: true,
      plantingCohortId: true,
      occurredAt: true,
      occurredPrecision: true,
      createdAt: true,
      provenanceClass: true,
      dataQuality: true,
    },
  });
```

`plantingCohort` ya trae `locationId` porque usa `include` y no `select`. En `plantingEvent` hay que
**añadir `locationId: true`** al `select`, y el tipo `EventoDeProduccion` gana ese campo.

**No llamar `db` a ningún cliente en este archivo** (ver las restricciones globales).

- [ ] **Step 6: correr y ver que pasan las tres**

```bash
npx vitest run tests/territorio/la-seleccion-no-resta.test.ts
echo "$?"
```

Leer `Test Files` **y** `Tests`. Esperado: 3 en verde, salida 0.

- [ ] **Step 7: que no rompí lo que ya existía**

```bash
npx vitest run tests/traceability/plantingCohorts.test.ts tests/traceability/entradaEnProduccion.test.ts tests/territorio/rejillaEnGetPlotDetail.test.ts tests/territorio/formaDelLote.test.ts
echo "$?"
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit
echo "$?"
```

Esperado: todo verde y los dos códigos en 0. Si `entradaEnProduccion.test.ts` cae, mirar si daba
por hecho que el evento es de la misma `locationId` que la ficha.

- [ ] **Step 8: commit**

```bash
git add lib/traceability/plantingCohorts.ts tests/territorio/la-seleccion-no-resta.test.ts scripts/pruebas-por-compuerta.txt
git diff --cached --stat
```

Contar: **3 files changed**.

```bash
printf 'Cohortes y eventos de produccion enrollan a las selecciones del lote\n\nADR-NNN. Las dos consultas de `getPlotDetail` pasan de `locationId`\npelado a los descendientes, y `plantingEvent` gana `locationId` en su\n`select` porque un hecho heredado tiene que poder desarmarse por su\norigen. Hacia abajo solamente: la ficha de la hija no muestra lo de su\nmadre, y eso tiene su propia prueba con control positivo.\n' > /tmp/msg-cohortes.txt
git commit -F /tmp/msg-cohortes.txt
```

---

### Task 4: El rendimiento enrolla, se desarma, y las áreas no se suman

**Files:**
- Modify: `lib/traceability/plantingCohorts.ts` — la consulta `harvestEventSource.findMany` de
  `getPlotDetail`, y el cálculo del rendimiento
- Modify: `tests/territorio/la-seleccion-no-resta.test.ts`

**Interfaces:**
- Consumes: `emparentadas` de la Tarea 3, ya calculado en la misma función.
- Produces: en el objeto que devuelve `getPlotDetail`, el rendimiento pasa de un número a
  `{ propio, porSeleccion: Array<{ locationId, nombre, cherryWeightKg }> }`. La pantalla
  (`app/plots/[id]`) lo consume; este plan **no** cambia la pantalla, sólo deja el dato desarmable.

Esta es la tarea con más riesgo de las cinco, por §2.1: el divisor del rendimiento por hectárea
**sigue siendo el área de la madre**, así que lo único que crece es el numerador.

- [ ] **Step 1: escribir los dos guardias que faltan**

Añadir a `tests/territorio/la-seleccion-no-resta.test.ts`:

```typescript
describe("el rendimiento (ADR-NNN §2.1: las areas no se suman)", () => {
  it("una cosecha de la microparcela cuenta en el rendimiento de su madre, y se distingue", async () => {
    const { usuario, madre, hija } = await montarMadreEHija();
    await crearCosechaCon({ locationId: madre.id, cherryWeightKg: 100 });
    await crearCosechaCon({ locationId: hija.id, cherryWeightKg: 40 });

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(ficha.rendimiento.propio).toBe(100);
    expect(ficha.rendimiento.porSeleccion).toEqual([
      { locationId: hija.id, nombre: hija.name, cherryWeightKg: 40 },
    ]);
  });

  it("el divisor es el area de la MADRE, no la suma de las dos", async () => {
    const { usuario, madre, hija } = await montarMadreEHija({ areaMadre: 2, areaHija: 1 });
    await crearCosechaCon({ locationId: hija.id, cherryWeightKg: 40 });

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    // 40 / 2 = 20. Si alguien sumara las areas seria 40 / 3 = 13.33.
    expect(ficha.rendimientoPorHectarea).toBeCloseTo(20, 2);
  });
});
```

`crearCosechaCon` crea un `HarvestEvent` y su `HarvestEventSource`; copiar el ayudante de
`tests/traceability/plantingCohorts.test.ts`, que ya lo tiene.

- [ ] **Step 2: correr y ver que fallan**

```bash
npx vitest run tests/territorio/la-seleccion-no-resta.test.ts -t "rendimiento"
echo "$?"
```

Esperado: **2 fallidas**, la primera porque `rendimiento` no es un objeto. **Si `beforeAll` no corre
con `-t`**, correr el archivo entero sin el filtro: ya pasó en esta casa que `-t` se saltó el
montaje y un id quedó `undefined`.

- [ ] **Step 3: enrollar la consulta y desarmar el resultado**

```typescript
  const harvestContributions = await prisma.harvestEventSource.findMany({
    where: { locationId: { in: emparentadas } },
    select: {
      locationId: true,
      cherryWeightKg: true,
      harvestEvent: { select: { harvestedAt: true } },
      location: { select: { name: true } },
    },
  });
```

y construir el desglose:

```typescript
  // §4 del diseno: un total que no se puede desarmar no es una medicion. Lo
  // propio del lote y lo de cada seleccion van por separado, con nombre.
  const propio = harvestContributions
    .filter((h) => h.locationId === locationId)
    .reduce((s, h) => s + Number(h.cherryWeightKg ?? 0), 0);
  const porSeleccion = [...new Map(
    harvestContributions
      .filter((h) => h.locationId !== locationId)
      .map((h) => [h.locationId, { locationId: h.locationId, nombre: h.location.name, cherryWeightKg: 0 }]),
  ).values()].map((s) => ({
    ...s,
    cherryWeightKg: harvestContributions
      .filter((h) => h.locationId === s.locationId)
      .reduce((t, h) => t + Number(h.cherryWeightKg ?? 0), 0),
  }));
```

**El divisor no se toca.** Donde hoy se pasa `location.areaHectares` al cálculo del rendimiento por
hectárea, se sigue pasando exactamente eso: es el área de la madre y §2.1 dice que así se queda.
Añadir ahí este comentario, porque es el fallo que un lector apresurado introduce:

```typescript
  // ADR-NNN §2.1 — el divisor es el area de ESTA Location, nunca la suma con la
  // de sus selecciones: la microparcela esta DENTRO, no al lado. Sumarlas seria
  // tratarla como una parte, que es el error que la regla existe para impedir.
```

- [ ] **Step 4: correr y ver que pasan**

```bash
npx vitest run tests/territorio/la-seleccion-no-resta.test.ts
echo "$?"
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit
echo "$?"
```

Esperado: 5 en verde (las 3 de la Tarea 3 más estas 2), los dos códigos 0. Si `tsc` se queja de la
pantalla, es que `app/plots/[id]` consumía el rendimiento como número: **ese arreglo entra en esta
tarea**, con el desglose pintado al lado y no fundido en un total.

- [ ] **Step 5: el flip-test del guardia del área, que es el que más fácil se vuelve adorno**

```bash
git status --porcelain
```

Debe salir **vacío**: commitear antes de mutar, porque el arnés restaura desde `HEAD`.

```bash
shasum -a 256 lib/traceability/plantingCohorts.ts | cut -c1-12
```

Mutar a mano el divisor para que sume las dos áreas, y comprobar las tres cosas:

```bash
shasum -a 256 lib/traceability/plantingCohorts.ts | cut -c1-12   # distinto del anterior, o abortar
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit        # tiene que seguir compilando
echo "$?"
npx vitest run tests/territorio/la-seleccion-no-resta.test.ts
echo "$?"
```

Esperado: **cae exactamente la prueba del divisor, por su nombre**, y las otras cuatro siguen
verdes. Si no cae ninguna, la prueba es un adorno. Si caen todas, la mutación rompió algo más.
Restaurar y comprobar que volvió:

```bash
git checkout -- lib/traceability/plantingCohorts.ts
shasum -a 256 lib/traceability/plantingCohorts.ts | cut -c1-12   # igual al primero
git status --porcelain                                            # vacio
```

- [ ] **Step 6: commit**

```bash
git add lib/traceability/plantingCohorts.ts tests/territorio/la-seleccion-no-resta.test.ts
git diff --cached --stat
printf 'El rendimiento enrolla, se desarma por origen, y el divisor no cambia\n\nADR-NNN. La consulta de `harvestEventSource` pasa a los descendientes y\nel resultado distingue lo propio de lo de cada seleccion, con nombre:\nun total que no se puede desarmar no es una medicion (diseno §4). El\ndivisor sigue siendo el area de la madre (§2.1) y eso lleva su propio\nguardia, con flip-test: mutarlo para que sume las dos areas tumba esa\nprueba por su nombre y ninguna otra.\n' > /tmp/msg-rend.txt
git commit -F /tmp/msg-rend.txt
```

---

### Task 5: Trampas y plantas enrollan

**Files:**
- Modify: `lib/traceability/plantingCohorts.ts` — la consulta `specimen.findMany` con
  `specimenType: "trap"`
- Modify: `lib/traceability/specimens.ts` — `listPlantSpecimens`
- Modify: `tests/territorio/la-seleccion-no-resta.test.ts`

**Interfaces:**
- Consumes: `emparentadas` de la Tarea 3 (para la de trampas) y
  `ubicacionesEmparentadas(..., { soloDescendientes: true })` de la Tarea 2 (para la de plantas, que
  está en otro archivo).
- Produces: nada.

**La autorización no cambia, y es deliberado.** `listPlantSpecimens` seguirá llamando a
`requireSpecimenAccess(userAccountId, "view", locationId)` sobre la **madre**, igual que
`floracion`, `harvest` e `intervenciones` autorizan sobre la ubicación que reciben y después
enrollan. Una selección está *dentro*: ver el lote implica ver dentro de él. Escribirlo en el
comentario, o la siguiente sesión lo leerá como un hueco.

- [ ] **Step 1: los dos guardias que faltan**

```typescript
describe("especimenes: trampas y plantas (ADR-NNN)", () => {
  it("una trampa de la microparcela aparece en la ficha de su madre", async () => {
    const { usuario, madre, hija } = await montarMadreEHija();
    await prisma.specimen.create({
      data: { locationId: hija.id, specimenType: "trap", trapNumber: 7, status: "active" },
    });

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(ficha.trampas.map((t) => t.trapNumber)).toContain(7);
  });

  it("una planta de la microparcela aparece al pedir las plantas de su madre", async () => {
    const { usuario, madre, hija } = await montarMadreEHija();
    await prisma.specimen.create({
      data: { locationId: hija.id, specimenType: "plant", commonName: "Caturra 3", status: "active" },
    });

    const plantas = await listPlantSpecimens(usuario.userAccountId, madre.id);
    expect(plantas.map((p) => p.commonName)).toContain("Caturra 3");

    // CONTROL POSITIVO: al pedirlas de la HIJA tambien sale, y no sale ninguna de
    // la madre. Sin esta mitad, un enrollado que devolviera todo pasaria igual.
    await prisma.specimen.create({
      data: { locationId: madre.id, specimenType: "plant", commonName: "De la madre", status: "active" },
    });
    const desdeLaHija = await listPlantSpecimens(usuario.userAccountId, hija.id);
    expect(desdeLaHija.map((p) => p.commonName)).toEqual(["Caturra 3"]);
  });
});
```

- [ ] **Step 2: correr y ver que fallan**

```bash
npx vitest run tests/territorio/la-seleccion-no-resta.test.ts
echo "$?"
```

Esperado: las 5 anteriores verdes y estas **2 en rojo**.

- [ ] **Step 3: las dos consultas**

En `plantingCohorts.ts`, dentro del ternario de `trampasCrudas`:

```typescript
        where: { locationId: { in: emparentadas }, specimenType: "trap" },
```

En `specimens.ts`, en `listPlantSpecimens`:

```typescript
export async function listPlantSpecimens(userAccountId: string, locationId: string) {
  // La compuerta va sobre la ubicacion que se pide, y DESPUES se enrolla: una
  // seleccion esta dentro, asi que ver el lote implica ver dentro de el. Es el
  // mismo orden que floracion, cosecha e intervenciones (ADR-NNN).
  await requireSpecimenAccess(userAccountId, "view", locationId);

  const emparentadas = await ubicacionesEmparentadas(locationId, prisma, { soloDescendientes: true });
  return prisma.specimen.findMany({
    where: { locationId: { in: emparentadas }, specimenType: "plant", status: "active" },
    select: { id: true, commonName: true },
    orderBy: { commonName: "asc" },
  });
}
```

Añadir el `import { ubicacionesEmparentadas } from "./ubicacionesEmparentadas";` si no está.

- [ ] **Step 4: correr, tipos, y los vecinos**

```bash
npx vitest run tests/territorio/la-seleccion-no-resta.test.ts tests/traceability/traps.test.ts tests/traceability/pendienteDeTrampas.test.ts tests/traceability/intervenciones.test.ts
echo "$?"
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit
echo "$?"
```

Esperado: 7 en verde en el archivo nuevo, los vecinos en verde, los dos códigos 0.
`intervenciones.test.ts` es el vecino que importa: su formulario ofrece las plantas, así que si
`listPlantSpecimens` devuelve más de las que esperaba, se verá ahí.

- [ ] **Step 5: commit**

```bash
git add lib/traceability/plantingCohorts.ts lib/traceability/specimens.ts tests/territorio/la-seleccion-no-resta.test.ts
git diff --cached --stat
printf 'Trampas y plantas enrollan a las selecciones del lote\n\nADR-NNN. Las dos consultas de `specimen` pasan a los descendientes. La\ncompuerta sigue yendo sobre la ubicacion que se pide y el enrollado va\ndespues, igual que en floracion, cosecha e intervenciones: una seleccion\nesta dentro, asi que ver el lote implica ver dentro de el. Escrito en el\ncomentario para que no se lea como un hueco.\n' > /tmp/msg-esp.txt
git commit -F /tmp/msg-esp.txt
```

---

### Task 6: El guardia de lo que NO enrolla, con el control que lo hace medir

**Files:**
- Modify: `tests/territorio/la-seleccion-no-resta.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada.

Sin esta tarea el plan deja la mitad de §2.2 sin guardia: la frontera tiene dos lados, y el lado de
«no enrolla» es el que una sesión futura rompe por simetría, creyendo que completa el trabajo.

- [ ] **Step 1: el guardia, con su control positivo pegado**

```typescript
describe("lo que NO enrolla (ADR-NNN): se toma en un punto y es de ese punto", () => {
  it("una calicata, una foto y una muestra de la microparcela NO aparecen en su madre", async () => {
    const { usuario, madre, hija } = await montarMadreEHija();
    await crearCalicataEn(hija.id);

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(ficha.calicatas).toHaveLength(0);

    // **ESTE CONTROL ES LO QUE HACE QUE LA ASERCION DE ARRIBA MIDA.** Una prueba
    // que solo comprueba que algo NO aparece pasa igual si la madre no pinta
    // calicatas en absoluto. Tiene que haber una de la MADRE que si aparezca.
    await crearCalicataEn(madre.id);
    const otraVez = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(otraVez.calicatas).toHaveLength(1);
  });

  it("un bloque de la microparcela NO se lista en su madre", async () => {
    const { usuario, madre, hija } = await montarMadreEHija();
    await crearBloqueEn(hija.id);

    const ficha = await getPlotDetail(usuario.userAccountId, madre.id);
    expect(ficha.bloques).toHaveLength(0);

    await crearBloqueEn(madre.id);
    expect((await getPlotDetail(usuario.userAccountId, madre.id)).bloques).toHaveLength(1);
  });
});
```

Si `getPlotDetail` no devuelve hoy `calicatas` o `bloques` con esos nombres, **mirar cómo se llaman
en el objeto que devuelve y usar ésos** — no añadir campos para poder escribir la prueba.

- [ ] **Step 2: correr y ver que pasan sin tocar código**

```bash
npx vitest run tests/territorio/la-seleccion-no-resta.test.ts
echo "$?"
```

Esperado: **9 en verde, salida 0, sin cambiar una línea de producción.** Estas dos pasan desde el
principio a propósito: son una red para mañana, no un defecto de hoy. **Escribirlo así en el
comentario del `describe`**, o la siguiente sesión las contará como guardias de un camino vivo.

- [ ] **Step 3: el flip que demuestra que la red está armada**

Mutar a mano una de las cuatro consultas que NO deben enrollar —la de calicatas— para que use
`{ in: emparentadas }`, y comprobar:

```bash
shasum -a 256 lib/traceability/plantingCohorts.ts | cut -c1-12
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit
echo "$?"
npx vitest run tests/territorio/la-seleccion-no-resta.test.ts
echo "$?"
git checkout -- lib/traceability/plantingCohorts.ts
```

Esperado: cae **la prueba de la calicata, por su nombre**. Si no cae, el guardia no está midiendo lo
que dice y hay que arreglarlo antes de cerrar la tarea.

- [ ] **Step 4: la compuerta completa, antes del PR**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
NODE_OPTIONS="--max-old-space-size=6144" bash scripts/ci.sh > /tmp/herm.txt 2>&1
echo "$?"
grep -E "^\s*(Test Files|Tests)\s" /tmp/herm.txt
NODE_OPTIONS="--max-old-space-size=6144" bash scripts/ci-con-base.sh > /tmp/base.txt 2>&1
echo "$?"
grep -E "^\s*(Test Files|Tests)\s" /tmp/base.txt
```

Los dos códigos en 0 y cero `×`. El carril con base necesita una base **desechable** creada como
dicen las restricciones globales; **no** se usa `nectar_test` y **no** se le aplican migraciones.

- [ ] **Step 5: commit y PR**

```bash
git add tests/territorio/la-seleccion-no-resta.test.ts
git diff --cached --stat
printf 'El guardia de lo que NO enrolla, con el control que lo hace medir\n\nADR-NNN. La frontera de §2.2 tiene dos lados y el de «no enrolla» es el\nque una sesion futura rompe por simetria. Las dos pruebas pasan desde el\nprincipio a proposito: son red para manana, y lo dice su comentario para\nque nadie las cuente como guardia de un camino vivo. El flip lo\ndemuestra: enrollar la consulta de calicatas tumba su prueba por nombre.\n' > /tmp/msg-red.txt
git commit -F /tmp/msg-red.txt
```

Antes de abrir el PR, contar lo que lleva —el stat del commit no es el stat del PR—:

```bash
git log origin/main..HEAD --oneline        # DOS puntos: mis commits
git diff --name-only origin/main...HEAD    # TRES puntos: mis archivos
```

Esperado: **6 commits y 7 archivos** — u **8** si la Tarea 4 tuvo que tocar
`app/plots/[id]/page.tsx` porque consumía el rendimiento como número. Cualquier otra cifra, parar:
la rama nació encima de trabajo ajeno, y es lo que costó el PR #126.

```bash
gh pr create -R danieljosegiraldez-png/nectar-nomada --base main --body-file /tmp/cuerpo-pr.md \
  --title "Una seleccion no resta: el lote responde por lo que ocurre en sus selecciones"
```

**La fusión es de Daniel**, PR por PR. No fusionar.

---

## Self-Review

**1. Cobertura del spec.** §2 → Tarea 1 (el ADR). §2.1 → Tarea 4, con guardia y flip. §2.2 → Tarea 1
(la tabla) y Tarea 6 (el lado de «no enrolla»). §3.1, las cinco consultas → Tareas 3 (dos), 4 (una) y
5 (dos). §4 → Tarea 4, el desglose por origen. §5, los ocho guardias → repartidos: cosecha aparece y
se distingue (4), áreas no se suman (4), trampa y planta aparecen (5), lo que no enrolla con su
control positivo (6). **Dos guardias de §5 NO están en este plan y es a propósito:** los dos de
`createMicrolot` pertenecen a §3.2 y ya existen en `main`. El de «el comentario del bloque cita el
ADR» pertenece a §3.3 y va en su plan.

**2. Placeholders.** Ninguna tarea dice «añadir validación» ni «escribir pruebas para lo anterior»:
cada paso lleva su código o su comando. Lo único deliberadamente sin resolver es `ADR-NNN`, que el
Step 1 de la Tarea 1 manda medir en vez de copiar — y el spec dice por qué: dos sesiones que numeran
a la vez chocan.

**3. Consistencia de tipos.** `ubicacionesEmparentadas(locationId, db?, opciones?)` se declara en la
Tarea 2 y se usa con esa firma en las Tareas 3 y 5. `emparentadas` se calcula una vez en la Tarea 3 y
las Tareas 4 y 5 la reutilizan dentro de la misma función. `rendimiento` se define en la Tarea 4 como
`{ propio, porSeleccion }` y no se vuelve a nombrar de otra forma.

**4. Lo que este plan NO decide, y es de Daniel.** La **dirección** del enrollado. El spec §3.1 dice
«Las cinco pasan a `{ in: await ubicacionesEmparentadas(locationId) }`», sin opción, y ese conector
incluye **ascendientes**: tal cual, la ficha de una microparcela mostraría las cohechas y cohortes de
su madre, que es doble conteo y contradice el espíritu de §2.1. Este plan resuelve eso con
`soloDescendientes` dentro de la misma función, que respeta el «no se escribe un segundo mecanismo».
**Si Daniel prefiere la lectura literal del spec, la Tarea 2 se cae y las Tareas 3-5 pierden el
tercer argumento** — y entonces hay que añadir un guardia que fije que una ficha de microparcela
muestra los hechos de su madre, porque eso pasaría a ser la conducta esperada. Con 0 microparcelas en
la base hoy, ninguna de las dos opciones toca un solo dato existente.
