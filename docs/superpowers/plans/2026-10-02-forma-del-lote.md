# La forma del lote y la capacidad honesta — plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que una parcela pueda declarar la forma real de lo plantado, y que la aplicación deje de afirmar una capacidad que un lote irregular no sostiene.

**Arquitectura:** una tabla hija `PlotShapeRange` con la misma estructura que `PlotBlockRange`, colgada de la parcela que pone la numeración. La capacidad y los avisos salen de `celdasEnComunConVarios`, que **ya existe y no se toca**: calcula |unión(rangos) ∩ otro| por compresión de coordenadas, así que pasándole el tablero o el rango de una microparcela como `otro` da exactamente las dos cifras que hacen falta.

**Stack:** PostgreSQL 18, Prisma 7, vitest 4, next-intl.

**Spec:** `docs/superpowers/specs/2026-10-02-forma-del-lote-y-densidad-design.md`, §6, §7.1, §7.2 y §7.4.

**Plan anterior:** `2026-10-02-planton-en-la-rejilla.md`. Este plan **no depende** de él, pero el orden del §10.5 lo pone antes.
**Plan siguiente:** la densidad por marco y las dos pantallas. Necesita las celdas de la forma, así que va después de este.

## Restricciones globales

Las mismas que `2026-10-02-planton-en-la-rejilla.md`, y se repiten porque quien lea esta tarea puede no haber leído la otra:

- **Node no está en el PATH:** `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`.
- **`NODE_OPTIONS=--max-old-space-size=8192`** delante de `typecheck` y `build`.
- **El veredicto es la línea `Test Files`, nunca `Tests`.** Un 134 o la ausencia de esa línea significa «no midió».
- **La base del 55433 es compartida:** prohibido `test:db -- reset`, `prisma migrate reset`, `db push --force-reset`, borrar bases y fijar `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
- **Base desechable:** `nectar_ci_<algo>` o `nn_flip_<algo>`, o cuatro suites mueren en su `afterAll` con las pruebas en verde.
- **Nunca `git add -A`;** contar el stat antes de empujar. **Commitear antes de mutar.**
- **Una prueba nueva que necesite base va al grupo `base-sembrada`** de `scripts/pruebas-por-compuerta.txt`, o cae en el carril hermético y falla con un error de Prisma en una compuerta que no toca Prisma.

---

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `prisma/schema.prisma` | **modificar** — el modelo `PlotShapeRange` y su relación con `Location` |
| `prisma/migrations/<marca>_forma_del_lote/migration.sql` | **crear** — la tabla, sus `CHECK` y el disparador que la mete en el tablero |
| `lib/traceability/formaDeLaParcela.ts` | **crear** — declarar y quitar trozos de forma; **un archivo propio**, no dentro de `plotBlocks.ts`, que ya lleva 262 líneas nuevas de hoy |
| `lib/territorio/rejilla.ts` | **no se toca** — `celdasEnComunConVarios` ya hace lo que hace falta |
| `lib/traceability/plantingCohorts.ts` | **modificar** — el estado `sin_forma` en `compararConLaRejilla` y su clave |
| `lib/traceability/plotBlocks.ts` | **modificar** — el aviso de celdas sin plantar al añadir un rango |
| `messages/es.json`, `messages/en.json` | **modificar** — las frases nuevas en los dos idiomas |
| `tests/territorio/formaDelLote.test.ts` | **crear** — contra base; grupo `base-sembrada` |
| `tests/territorio/capacidadConForma.test.ts` | **crear** — hermética; carril de `ci.sh` |

---

### Tarea 1: La tabla de la forma, y que quepa en el tablero

**Archivos:**
- Modificar: `prisma/schema.prisma`
- Crear: `prisma/migrations/<marca>_forma_del_lote/migration.sql`
- Crear: `tests/territorio/formaDelLote.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Consume: `core.raiz_de_la_numeracion(sitio UUID) RETURNS UUID`, de la migración `20261002040000`.
- Produce: el modelo `PlotShapeRange { id, locationId, rowFrom, rowTo, plantFrom, plantTo }` y la relación `Location.formaDeclarada`.

- [ ] **Paso 1: el modelo en el esquema**

En `prisma/schema.prisma`, junto a `PlotBlockRange` para que los dos se lean a la vez:

```prisma
/// La forma REAL de lo plantado en una parcela, como unión de rectángulos.
///
/// Cero filas significa **forma sin declarar**, que no es un lote vacío (ADR-080):
/// sin forma, la aplicación no afirma capacidad y dice sólo el tamaño del tablero.
/// Varias filas: su unión es lo plantado, y puede expresar hileras de distinto
/// largo, hileras desplazadas y un hueco en medio por una roca (D9).
///
/// Cuelga de la parcela que pone la numeración, nunca de una microparcela: D3 dice
/// que la numeración es una sola, la de la parcela.
model PlotShapeRange {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId String   @map("location_id") @db.Uuid
  location   Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  rowFrom    Int      @map("row_from")
  rowTo      Int      @map("row_to")
  plantFrom  Int      @map("plant_from")
  plantTo    Int      @map("plant_to")
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([locationId])
  @@map("plot_shape_range")
  @@schema("traceability")
}
```

Y en `model Location`, la otra punta de la relación:

```prisma
  formaDeclarada PlotShapeRange[]
```

- [ ] **Paso 2: escribir la prueba que falla**

En `tests/territorio/formaDelLote.test.ts`:

```ts
/**
 * La forma de lo plantado: varios rectángulos cuya unión es el lote de verdad.
 *
 * Contra base, porque lo que se prueba aquí son los `CHECK` y el disparador —la
 * garantía—. Lo que calcula la capacidad se prueba hermético en
 * `tests/territorio/capacidadConForma.test.ts`.
 *
 * Grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { updateLocationAttributes } from "../../lib/traceability/locations";
import { crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";

const RUN = `TEST forma lote ${process.pid}`;
let actor: string;
let parcelaId: string;

beforeAll(async () => {
  actor = (await crearUsuarioConAcceso(RUN)).userAccountId;
  parcelaId = (await crearParcela(actor, RUN)).id;
  await updateLocationAttributes(actor, {
    locationId: parcelaId, gridOrigin: "noroeste",
    rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5,
  });
});

afterEach(async () => {
  await prisma.plotShapeRange.deleteMany({ where: { locationId: parcelaId } });
});

afterAll(async () => {
  await prisma.plotShapeRange.deleteMany({ where: { locationId: parcelaId } });
  await prisma.location.deleteMany({ where: { id: parcelaId } });
});

const trozo = (rowFrom: number, rowTo: number, plantFrom: number, plantTo: number) =>
  prisma.plotShapeRange.create({
    data: { locationId: parcelaId, rowFrom, rowTo, plantFrom, plantTo },
  });

describe("la forma se declara con rectángulos que caben en el tablero", () => {
  it("un trozo dentro del tablero entra", async () => {
    const t = await trozo(1, 7, 1, 20);
    expect(t.rowTo).toBe(7);
  });

  it("dos trozos describen una esquina cortada", async () => {
    await trozo(1, 7, 1, 20);
    await trozo(8, 10, 1, 12);
    const n = await prisma.plotShapeRange.count({ where: { locationId: parcelaId } });
    expect(n).toBe(2);
  });

  it("un trozo que se sale del tablero se rechaza, y el mensaje dice el tamaño", async () => {
    await expect(trozo(1, 99, 1, 20)).rejects.toThrow(/10 hileras x 20 plantas/);
  });

  it("un trozo al revés se rechaza", async () => {
    await expect(trozo(7, 3, 1, 20)).rejects.toThrow(/al revés|revés/);
  });

  it("el cero y lo negativo se rechazan: las celdas se cuentan desde 1", async () => {
    await expect(trozo(0, 5, 1, 20)).rejects.toThrow();
    await expect(trozo(1, 5, -2, 20)).rejects.toThrow();
  });

  /** El UPDATE es el otro camino, y un disparador que sólo cubre el INSERT se lee igual que uno completo. */
  it("mover un trozo fuera del tablero se rechaza también", async () => {
    const t = await trozo(1, 5, 1, 20);
    await expect(
      prisma.plotShapeRange.update({ where: { id: t.id }, data: { rowTo: 99 } }),
    ).rejects.toThrow(/no cabe|no existe/);
  });

  it("una parcela sin rejilla no puede declarar forma: no hay tablero que la contenga", async () => {
    const sinRejilla = await crearParcela(actor, `${RUN} sin rejilla`);
    await expect(
      prisma.plotShapeRange.create({
        data: { locationId: sinRejilla.id, rowFrom: 1, rowTo: 2, plantFrom: 1, plantTo: 2 },
      }),
    ).rejects.toThrow(/no tiene rejilla/);
    await prisma.location.deleteMany({ where: { id: sinRejilla.id } });
  });
});
```

- [ ] **Paso 3: correrla y verla fallar**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx vitest run tests/territorio/formaDelLote.test.ts
```

Esperado: **falla al cargar**, porque `prisma.plotShapeRange` no existe todavía en el cliente generado. Ése es el fallo correcto en este paso; no es la prueba la que está mal.

- [ ] **Paso 4: la migración**

```sql
-- La forma REAL de lo plantado, como unión de rectángulos (D9).
--
-- Por qué no basta el tablero: el diseño del 2026-10-01 daba por supuesto un
-- rectángulo perfecto, y la pantalla decía «caben 200 y hay 150: una diferencia de
-- 50» sobre un lote al que le falta una esquina, donde la diferencia real es 20.
-- Una afirmación que no se sostiene al desarmarla.
--
-- Misma estructura que `plot_block_range` a propósito: dos conductas parecidas no
-- deben contarse de dos maneras, y así la cuenta de celdas reusa la misma función.
CREATE TABLE "traceability"."plot_shape_range" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "location_id" UUID NOT NULL,
  "row_from"    INTEGER NOT NULL,
  "row_to"      INTEGER NOT NULL,
  "plant_from"  INTEGER NOT NULL,
  "plant_to"    INTEGER NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plot_shape_range_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plot_shape_range_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "core"."location"("id") ON DELETE CASCADE,
  -- Las celdas se cuentan en enteros desde 1, y un rango no va al revés.
  CONSTRAINT "plot_shape_range_desde_uno" CHECK ("row_from" >= 1 AND "plant_from" >= 1),
  CONSTRAINT "plot_shape_range_no_al_reves" CHECK ("row_from" <= "row_to" AND "plant_from" <= "plant_to")
);

CREATE INDEX "plot_shape_range_location_id_idx" ON "traceability"."plot_shape_range"("location_id");

-- Que el trozo quepa en el tablero. Mismo patrón que
-- `exigir_rango_de_bloque_en_la_rejilla`, y por la misma razón: una restricción
-- que vive en TypeScript no existe para la base.
--
-- `BEFORE`, así que no puede abortar esta migración: la tabla acaba de nacer vacía,
-- pero se dice igual para que nadie lo deduzca al leerlo.
CREATE OR REPLACE FUNCTION "traceability"."exigir_forma_en_la_rejilla"()
RETURNS TRIGGER AS $$
DECLARE
  raiz UUID;
  p RECORD;
BEGIN
  raiz := "core"."raiz_de_la_numeracion"(NEW."location_id");
  IF raiz IS NULL THEN
    RAISE EXCEPTION 'Ese sitio no cuelga de ninguna parcela: no hay rejilla que contenga la forma';
  END IF;
  SELECT "row_count", "plants_per_row" INTO p FROM "core"."location" WHERE "id" = raiz;
  IF p."row_count" IS NULL THEN
    RAISE EXCEPTION 'La parcela no tiene rejilla: sin tablero no hay forma que declarar';
  END IF;
  IF NEW."row_to" > p."row_count" OR NEW."plant_to" > p."plants_per_row" THEN
    RAISE EXCEPTION 'El trozo de la forma no cabe en la rejilla de la parcela (% hileras x % plantas)',
      p."row_count", p."plants_per_row";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plot_shape_range_exigir_forma_en_la_rejilla"
  BEFORE INSERT OR UPDATE ON "traceability"."plot_shape_range"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_forma_en_la_rejilla"();
```

- [ ] **Paso 5: aplicar, regenerar, y ver pasar**

```bash
npx prisma migrate deploy   # leer que NOMBRE la migración nueva
npx prisma generate
npx vitest run tests/territorio/formaDelLote.test.ts
```

Esperado: `Test Files 1 passed`, 7 pruebas. Añadir la línea al grupo `base-sembrada` y comprobar con su control que **no** aparece en la salida de `bash scripts/ci.sh`.

- [ ] **Paso 6: compuerta, commit y flip**

Cuatro mutaciones, cada una tumbando una prueba distinta: quitar el `CHECK` de «desde uno» tumba «el cero y lo negativo»; quitar el de «no al revés» tumba «un trozo al revés»; quitar la comparación contra `row_count` tumba «un trozo que se sale del tablero»; cambiar el disparador a `BEFORE INSERT` sólo tumba «mover un trozo fuera del tablero».

---

### Tarea 2: La capacidad, sin una línea de geometría nueva

**Archivos:**
- Crear: `lib/traceability/formaDeLaParcela.ts`
- Crear: `tests/territorio/capacidadConForma.test.ts`

**Interfaces:**
- Consume: `celdasEnComunConVarios(rangos: readonly Rango[], otro: Rango): number` de `lib/territorio/rejilla.ts`, que calcula **|unión(rangos) ∩ otro|** por compresión de coordenadas.
- Produce:
  - `celdasDeLaForma(forma: readonly Rango[], tablero: Rango): number`
  - `celdasSinPlantar(forma: readonly Rango[], trozo: Rango): number`
  - `tableroDe(rejilla: { rowCount: number; plantsPerRow: number }): Rango`

**La idea que ahorra la tarea entera:** `celdasEnComunConVarios` ya calcula la unión; lo que cambia es qué se le pasa como `otro`. El tablero entero → la capacidad del lote. El rango de una microparcela → su capacidad. Y las celdas sin plantar de un trozo son `|trozo| − celdasEnComunConVarios(forma, trozo)`. **Cero geometría nueva**, y la que hay ya está probada contra el defecto que la motivó.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
/**
 * La capacidad con forma declarada, y los avisos de celdas sin plantar.
 *
 * Hermética: aritmética pura, sin base. Carril de `ci.sh`.
 *
 * **El control que importa en este archivo:** un caso donde la suma de las
 * intersecciones y la unión NO coinciden. Con trozos que no se pisan los dos
 * números son iguales y la prueba no mide nada — fue el defecto real de la tarea 5.
 */
import { describe, expect, it } from "vitest";
import { celdasDeLaForma, celdasSinPlantar, tableroDe } from "../../lib/traceability/formaDeLaParcela";

const TABLERO = tableroDe({ rowCount: 10, plantsPerRow: 20 });

describe("celdasDeLaForma", () => {
  it("sin forma declarada da 0, y quien pregunta decide qué hacer con eso", () => {
    expect(celdasDeLaForma([], TABLERO)).toBe(0);
  });

  it("un trozo que cubre el tablero entero da el tablero entero", () => {
    expect(celdasDeLaForma([{ rowFrom: 1, rowTo: 10, plantFrom: 1, plantTo: 20 }], TABLERO)).toBe(200);
  });

  it("la esquina cortada del diseño da 176", () => {
    const forma = [
      { rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 },  // 140
      { rowFrom: 8, rowTo: 10, plantFrom: 1, plantTo: 12 }, //  36
    ];
    expect(celdasDeLaForma(forma, TABLERO)).toBe(176);
  });

  /**
   * **El control que discrimina.** Dos trozos que SE PISAN: la suma daría 140+100=240
   * y la unión son 160. Sin este caso, sumar intersecciones pasaría la prueba.
   */
  it("dos trozos que se pisan cuentan la UNIÓN, no la suma", () => {
    const forma = [
      { rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 },  // 140
      { rowFrom: 5, rowTo: 9, plantFrom: 1, plantTo: 20 },  // 100, y 60 pisadas
    ];
    expect(celdasDeLaForma(forma, TABLERO)).toBe(180);
  });

  it("acotada a una microparcela, da sólo lo plantado dentro de su rango", () => {
    const forma = [{ rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 }];
    const micro = { rowFrom: 5, rowTo: 10, plantFrom: 1, plantTo: 20 };
    expect(celdasDeLaForma(forma, micro)).toBe(60); // hileras 5-7 x 20
  });
});

describe("celdasSinPlantar", () => {
  it("un trozo enteramente dentro de la forma no tiene ninguna", () => {
    const forma = [{ rowFrom: 1, rowTo: 10, plantFrom: 1, plantTo: 20 }];
    expect(celdasSinPlantar(forma, { rowFrom: 2, rowTo: 3, plantFrom: 2, plantTo: 5 })).toBe(0);
  });

  it("un trozo en el claro las cuenta todas", () => {
    const forma = [{ rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 }];
    expect(celdasSinPlantar(forma, { rowFrom: 9, rowTo: 10, plantFrom: 1, plantTo: 5 })).toBe(10);
  });

  it("un trozo a medias cuenta sólo la parte de fuera", () => {
    const forma = [{ rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 }];
    expect(celdasSinPlantar(forma, { rowFrom: 6, rowTo: 9, plantFrom: 1, plantTo: 10 })).toBe(20);
  });

  it("sin forma declarada no hay celdas sin plantar: no se sabe, y no se inventa", () => {
    expect(celdasSinPlantar([], { rowFrom: 1, rowTo: 2, plantFrom: 1, plantTo: 2 })).toBe(0);
  });
});
```

**La última es la que hay que leer dos veces:** con forma sin declarar, `|trozo| − 0` serían todas las celdas, y la pantalla avisaría de que todo está sin plantar en cada parcela sin forma. El estado «no se sabe» no es «está vacío» (ADR-080), y por eso la función devuelve 0 y quien pregunta mira primero si hay forma.

- [ ] **Paso 2: correrla y verla fallar**

```bash
npx vitest run tests/territorio/capacidadConForma.test.ts
```

Esperado: falla al cargar — el módulo no existe. **Si dice «no tests», es eso y no un fallo de las aserciones.**

- [ ] **Paso 3: el módulo**

```ts
/**
 * La forma declarada de una parcela, en celdas.
 *
 * **Archivo propio y no dentro de `plotBlocks.ts`**, que ya creció 262 líneas hoy.
 * Lo que vive aquí es una responsabilidad distinta: cuánto hay plantado, no qué
 * bloque cubre qué.
 *
 * **No tiene geometría propia.** `celdasEnComunConVarios` de `lib/territorio/rejilla.ts`
 * calcula |unión(rangos) ∩ otro| por compresión de coordenadas, y eso es
 * exactamente lo que hace falta: cambia lo que se le pasa como `otro`.
 */
import { celdasEnComunConVarios, type Rango } from "../territorio/rejilla";

/** El tablero entero, como un rango, para pasárselo como `otro`. */
export function tableroDe(rejilla: { rowCount: number; plantsPerRow: number }): Rango {
  return { rowFrom: 1, rowTo: rejilla.rowCount, plantFrom: 1, plantTo: rejilla.plantsPerRow };
}

const celdasDe = (r: Rango) => (r.rowTo - r.rowFrom + 1) * (r.plantTo - r.plantFrom + 1);

/**
 * Cuántas celdas plantadas hay dentro de `ambito`.
 *
 * `ambito` es el tablero entero para una parcela, o el rango de la microparcela
 * cuando lo declaró (D3, §7.1 del diseño). **Sin forma declarada devuelve 0**, y
 * quien pregunta distingue ese caso antes de afirmar una capacidad.
 */
export function celdasDeLaForma(forma: readonly Rango[], ambito: Rango): number {
  if (forma.length === 0) return 0;
  return celdasEnComunConVarios(forma, ambito);
}

/**
 * Cuántas celdas de `trozo` caen donde la forma dice que NO hay planta.
 *
 * **Sin forma declarada devuelve 0, no `|trozo|`.** «No se sabe» no es «está
 * vacío» (ADR-080): si devolviera el total, cada parcela sin forma avisaría de que
 * todo está sin plantar.
 */
export function celdasSinPlantar(forma: readonly Rango[], trozo: Rango): number {
  if (forma.length === 0) return 0;
  return celdasDe(trozo) - celdasEnComunConVarios(forma, trozo);
}
```

- [ ] **Paso 4: correr y ver pasar**

```bash
npx vitest run tests/territorio/capacidadConForma.test.ts
```

Esperado: `Test Files 1 passed`, 9 pruebas.

- [ ] **Paso 5: compuerta, commit y flip**

Dos mutaciones que tumban pruebas distintas: devolver `celdasDe(trozo)` cuando no hay forma tumba «sin forma declarada no hay celdas sin plantar»; sumar `celdasEnComun` uno a uno en vez de llamar a la versión de conjunto tumba «dos trozos que se pisan cuentan la UNIÓN». La segunda es la que importa: es el defecto real que ya ocurrió una vez.

---

### Tarea 3: El estado `sin_forma`, para dejar de afirmar lo que no se sostiene

**Archivos:**
- Modificar: `lib/traceability/plantingCohorts.ts` (el tipo `ComparacionDeLaRejilla`, `compararConLaRejilla` en la línea 499, `claveDeLaComparacion` en la 565)
- Modificar: `messages/es.json`, `messages/en.json`
- Modificar: `tests/territorio/comparacionDeLaRejilla.test.ts`

**Interfaces:**
- Consume: `celdasDeLaForma` y `tableroDe` de la tarea 2.
- Produce: la variante `{ status: "sin_forma"; filas: number; columnas: number; contadas: number }` en `ComparacionDeLaRejilla`, y la clave `rejillaSinForma` en `claveDeLaComparacion`.

**Lo que cambia de conducta, dicho exacto:** hoy una parcela con rejilla y todas sus siembras contadas cae en `ok` y devuelve `diferencia: capacidad - contadas` con `capacidad = rowCount * plantsPerRow`. A partir de esta tarea, eso **sólo** ocurre si la parcela declaró su forma. Sin forma, el estado es `sin_forma` y **no lleva ningún número de diferencia**.

- [ ] **Paso 1: la prueba que falla, y la que CERTIFICABA el defecto**

Añadir en `tests/territorio/comparacionDeLaRejilla.test.ts`:

```ts
describe("sin forma declarada no se afirma una capacidad (D8)", () => {
  /**
   * **Esta prueba sustituye a una que certificaba el defecto.** La que había
   * afirmaba `diferencia: 130` sobre una parcela sin forma, que es exactamente la
   * cifra que un lote irregular no sostiene. Si aparece nombrada en el diff, es
   * ella: se reescribe, no se añade al lado.
   */
  it("una parcela con rejilla y sin forma da sin_forma, y ningún número de diferencia", () => {
    const c = compararConLaRejilla(
      { rowCount: 10, plantsPerRow: 20, rango: null, propia: true, forma: [] },
      [{ plantCount: 150, status: "active" }],
    );
    expect(c.status).toBe("sin_forma");
    expect(c).not.toHaveProperty("diferencia");
    expect(c).toMatchObject({ filas: 10, columnas: 20, contadas: 150 });
  });

  it("con forma declarada vuelve a dar ok, y la capacidad es la de la forma", () => {
    const c = compararConLaRejilla(
      {
        rowCount: 10, plantsPerRow: 20, rango: null, propia: true,
        forma: [
          { rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 },
          { rowFrom: 8, rowTo: 10, plantFrom: 1, plantTo: 12 },
        ],
      },
      [{ plantCount: 150, status: "active" }],
    );
    expect(c).toMatchObject({ status: "ok", capacidad: 176, contadas: 150, diferencia: 26 });
  });

  /** El control de que la forma de verdad cambia la cifra: 200 era la respuesta vieja. */
  it("la capacidad con forma NO es el tablero entero", () => {
    const forma = [
      { rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 },
      { rowFrom: 8, rowTo: 10, plantFrom: 1, plantTo: 12 },
    ];
    const c = compararConLaRejilla(
      { rowCount: 10, plantsPerRow: 20, rango: null, propia: true, forma },
      [{ plantCount: 1, status: "active" }],
    );
    expect(c).toMatchObject({ capacidad: 176 });
    expect(c).not.toMatchObject({ capacidad: 200 });
  });
});
```

- [ ] **Paso 2: correr y ver fallar**

```bash
npx vitest run tests/territorio/comparacionDeLaRejilla.test.ts
```

Esperado: fallan las tres nuevas —`forma` no existe en `RejillaDeclarada` y no hay estado `sin_forma`— **y además fallan por tipos al compilar el archivo**, que es señal correcta aquí.

- [ ] **Paso 3: el campo, el estado y la clave**

En `lib/traceability/plantingCohorts.ts`:

1. `RejillaDeclarada` gana `readonly forma: readonly Rango[]` — **no opcional**, para que el compilador obligue a cada sitio de llamada a decir qué pasa. Un `?` dejaría los dos consumidores existentes compilando con la conducta vieja en silencio.
2. `ComparacionDeLaRejilla` gana `| { status: "sin_forma"; filas: number; columnas: number; contadas: number }`.
3. En `compararConLaRejilla`, después de resolver el ámbito y antes de calcular la capacidad:

```ts
  const ambito = rejilla.rango ?? tableroDe(rejilla);
  const capacidad = celdasDeLaForma(rejilla.forma, ambito);
  // Sin forma declarada no hay capacidad que afirmar: se dice el tamaño del
  // tablero y lo contado, sin ninguna diferencia (D8). Antes esto caía en `ok` con
  // `rowCount * plantsPerRow`, que en un lote irregular es falso.
  if (rejilla.forma.length === 0) {
    return { status: "sin_forma", filas: rejilla.rowCount, columnas: rejilla.plantsPerRow, contadas };
  }
```

4. `claveDeLaComparacion` gana la clave `"rejillaSinForma"` con los parámetros `{ filas, columnas, contadas }`. **Sólo esos tres** — pasar una capacidad aquí es volver a afirmarla.

- [ ] **Paso 4: las frases**

En `messages/es.json`:

```json
"rejillaSinForma": "Tablero de {filas} × {columnas}. Hay {contadas} plantas contadas. Declara la forma del lote para poder comparar.",
```

Y la misma clave en `messages/en.json`. El guardia `codigos-de-rejilla-tienen-frase` sólo vigila los códigos `error_*`, así que esta clave **no la cubre**: comprobar la paridad es+en a mano, como en la tarea 2 del otro plan.

- [ ] **Paso 5: correr, y arreglar los sitios de llamada que el compilador señale**

```bash
export NODE_OPTIONS=--max-old-space-size=8192
npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "tsc=$?"
```

El compilador va a señalar cada sitio que construye un `RejillaDeclarada` sin `forma`. **Eso es el punto del paso 3.1.** `getPlotDetail` tiene que cargar `formaDeclarada` de la parcela — la relación de la tarea 1 — y pasarla.

- [ ] **Paso 6: compuerta completa, commit y flip**

```bash
npx vitest run tests/territorio/ ; bash scripts/ci.sh ; npm run build
```

Flip: quitar la rama de `forma.length === 0` tumba «una parcela con rejilla y sin forma da sin_forma»; devolver `rowCount * plantsPerRow` como capacidad tumba «la capacidad con forma NO es el tablero entero».

---

### Tarea 4: Los avisos de celdas sin plantar

**Archivos:**
- Modificar: `lib/traceability/plotBlocks.ts` (`anadirRangoAlBloque`)
- Modificar: `lib/traceability/locations.ts` (donde se valida el rango de la microparcela)
- Modificar: `messages/es.json`, `messages/en.json`
- Modificar: `tests/territorio/accionesDeLaRejilla.test.ts`

**Interfaces:**
- Consume: `celdasSinPlantar` de la tarea 2; el canal `avisos?: string[]` de `TraceabilityActionState`, que ya existe.
- Produce: el aviso con clave `rejillaFueraDeLaFormaAviso` y parámetro `{ celdas }`.

**El límite duro NO cambia** (D11): el tablero sigue siendo lo único que rechaza. Esto se guarda y se avisa, porque una trampa en un claro es su sitio natural.

- [ ] **Paso 1: la prueba que falla, con su caso negativo**

```ts
it("un rango sobre celdas sin plantar se guarda y vuelve en avisos", async () => {
  deps.anadirRangoAlBloque.mockResolvedValue({
    rango: { id: "r1" }, solapesAvisados: [], celdasSinPlantar: 12,
  });
  const r = await anadirRangoAlBloqueAction({}, form({ locationId: "p1", plotBlockId: "b1" }));
  expect(r.error, "el rango SE GUARDÓ").toBeUndefined();
  expect(r.avisos?.[0]).toContain("rejillaFueraDeLaFormaAviso");
  expect(r.avisos?.[0]).toContain("12");
});

/** El caso negativo, sin el cual un aviso que se emite siempre pasa por bueno. */
it("un rango enteramente dentro de la forma NO avisa", async () => {
  deps.anadirRangoAlBloque.mockResolvedValue({
    rango: { id: "r1" }, solapesAvisados: [], celdasSinPlantar: 0,
  });
  const r = await anadirRangoAlBloqueAction({}, form({ locationId: "p1", plotBlockId: "b1" }));
  expect(r).toEqual({});
});
```

- [ ] **Paso 2: correr y ver fallar**; esperado: cae la primera, pasa la segunda (hoy nunca avisa).

- [ ] **Paso 3: el servicio devuelve la cuenta**

`anadirRangoAlBloque` gana `celdasSinPlantar: number` en lo que devuelve, calculado con la función de la tarea 2 sobre la forma de la parcela que pone la numeración. La acción lo convierte en aviso cuando es `> 0`.

- [ ] **Paso 4: la frase**

```json
"rejillaFueraDeLaFormaAviso": "Guardado. Este trozo incluye {celdas} celdas que la forma del lote dice que no están plantadas."
```

Y su par en `en.json`.

- [ ] **Paso 5: correr, compuerta, commit, flip.** El flip que importa: devolver siempre `0` tumba la primera prueba; devolver siempre `12` tumba la segunda. **Las dos mutaciones tienen que tumbar pruebas distintas** — si una sola prueba cubre las dos direcciones, el aviso que se emite siempre pasaría.

---

## Auto-revisión

**Cobertura del spec.** §6 → tarea 1. §7.1 → tareas 2 y 3. §7.2 → tarea 4. §7.4 (encoger la forma avisa en vez de rechazar) → **no tiene tarea**, y es deliberado: hoy nada puede encoger la forma porque la pantalla que la declara está en el plan siguiente. Entra allí, con la pantalla, y queda dicho aquí para que no se cuente como cubierto.

**Consistencia de tipos.** `Rango` es el tipo de `lib/territorio/rejilla.ts` y lo usan las tareas 2, 3 y 4 con ese nombre. `celdasDeLaForma(forma, ambito)` y `celdasSinPlantar(forma, trozo)` se llaman igual en las tres. `RejillaDeclarada.forma` es `readonly Rango[]` **no opcional** a propósito, y la tarea 3 paso 5 dice qué hacer con lo que el compilador señale.

**Punto de corte entregable.** Al terminar la tarea 3 el sistema **ya es honesto**: deja de afirmar una capacidad que no sostiene, aunque todavía no haya pantalla para declarar la forma. Ése es un sitio razonable para parar y fusionar si hace falta.

**Lo que este plan NO hace, y está en el siguiente:** la densidad por marco con la migración de sus dos consumidores, la pantalla de la forma, y la pantalla del rango de la microparcela que el §6 del diseño del 2026-10-01 pedía y nunca se construyó.
