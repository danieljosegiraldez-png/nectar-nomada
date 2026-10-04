# El plantón dentro de la rejilla — plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguirlos.

**Objetivo:** que la base rechace una coordenada de plantón que la rejilla no tiene, y que el servicio dé el mensaje antes de llegar ahí.

**Arquitectura:** un disparador `BEFORE INSERT OR UPDATE` sobre `traceability.specimen` que resuelve la parcela con `core.raiz_de_la_numeracion` —la función que ya existe desde la tarea 8— y compara contra `row_count` / `plants_per_row`. Más la mitad de TypeScript, que es la que da la frase: el servicio valida y lanza un código, la base garantiza.

**Stack:** PostgreSQL 18, Prisma 7, vitest 4, next-intl.

**Spec:** `docs/superpowers/specs/2026-10-02-forma-del-lote-y-densidad-design.md`, §7.3 y §10.5.

## Restricciones globales

- **Node no está en el PATH:** `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` antes de cualquier `npm`/`npx`.
- **`NODE_OPTIONS=--max-old-space-size=8192`** delante de `typecheck` y `build`, o mueren con 134 imprimiendo «0 errores».
- **El veredicto de vitest es la línea `Test Files`, nunca `Tests`.** Un 134, o la ausencia de esa línea, significa «no midió», no «rojo».
- **La base del 55433 es compartida.** Prohibido `npm run test:db -- reset`, `prisma migrate reset`, `prisma db push --force-reset`, borrar bases y fijar `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
- **Una base desechable se llama `nectar_ci_<algo>` o `nn_flip_<algo>`**, o cuatro suites mueren en su `afterAll` con las pruebas en verde.
- **Nunca `git add -A`:** archivo por archivo, y contar el stat antes de empujar.
- **Commitear ANTES de mutar** en un flip-test: el arnés restaura desde HEAD.
- **Este disparador NO puede abortar la migración:** es `BEFORE`, así que valida la fila que entra, no las que ya están. Una fila existente que lo incumpla se queda y fallará la próxima vez que alguien la actualice. Decirlo en el comentario de la migración.

---

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `prisma/migrations/<marca>_planton_en_la_rejilla/migration.sql` | **crear** — la garantía: función y disparador sobre `specimen` |
| `tests/territorio/plantonEnLaRejilla.test.ts` | **crear** — ejerce el disparador por los dos caminos, `INSERT` y `UPDATE` |
| `scripts/pruebas-por-compuerta.txt` | **modificar** — la prueba de arriba necesita base: va al grupo `base-sembrada` |
| `lib/traceability/specimens.ts` | **modificar** — la mitad del mensaje: validar antes de llegar a la base |
| `messages/es.json`, `messages/en.json` | **modificar** — las frases de los códigos nuevos, en los dos idiomas |

---

### Tarea 1: El disparador, y su prueba contra la base

**Archivos:**
- Crear: `prisma/migrations/<marca de tiempo>_planton_en_la_rejilla/migration.sql`
- Crear: `tests/territorio/plantonEnLaRejilla.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt` (grupo `base-sembrada`)

**Interfaces:**
- Consume: `core.raiz_de_la_numeracion(sitio UUID) RETURNS UUID`, que existe desde `prisma/migrations/20261002040000_las_tres_reglas_que_faltaban`. Devuelve la ubicación si tiene `row_count`, y si no su padre.
- Produce: un `RAISE EXCEPTION` con código Postgres `P0001` y el texto `La celda (hilera %, planta %) no existe en la rejilla de la parcela (% hileras x % plantas)`.

**Lo que NO hace, y no es un olvido:** no exige que `grid_row` y `grid_position` estén los dos puestos. `lib/traceability/jornadasDeCosecha.ts` escribe `${p.gridRow}-${p.gridPosition ?? "?"}`, o sea que **tolera media coordenada a propósito**. Cada número se valida contra su propio límite, por separado. Añadir la regla de «los dos o ninguno» sería ampliar el diseño y rompería ese código.

- [ ] **Paso 1: escribir la prueba que falla**

En `tests/territorio/plantonEnLaRejilla.test.ts`:

```ts
/**
 * El tablero limita dónde se puede situar un plantón.
 *
 * **Existe porque el guardia estaba en un solo sentido.** El disparador
 * `location_exigir_rejilla_sin_huerfanos` impide ENCOGER la rejilla por debajo de
 * una planta existente, y nombra cuál. Pero no había ningún disparador sobre
 * `traceability.specimen`, así que un plantón se podía crear en la hilera 99 de un
 * lote de 10 hileras. Medido el 2026-10-02: 0 disparadores sobre esa tabla, con el
 * control de que el mismo archivo nombra `plot_block` 15 veces.
 *
 * Necesita base: va al grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { updateLocationAttributes } from "../../lib/traceability/locations";
import { crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";

const RUN = `TEST planton rejilla ${process.pid}`;
let actor: string;
let parcelaId: string;
const creados: string[] = [];

beforeAll(async () => {
  actor = (await crearUsuarioConAcceso(RUN)).userAccountId;
  parcelaId = (await crearParcela(actor, RUN)).id;
  await updateLocationAttributes(actor, {
    locationId: parcelaId,
    gridOrigin: "noroeste",
    rowCount: 10,
    plantsPerRow: 20,
    rowSpacingMeters: 2.5,
  });
});

// La limpieza va en afterEach, no al final del cuerpo del `it`: una aserción que
// falla se salta lo que esté debajo, y estas filas quedarían en la base compartida.
afterEach(async () => {
  if (creados.length === 0) return;
  await prisma.specimen.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
});

afterAll(async () => {
  await prisma.specimen.deleteMany({ where: { locationId: parcelaId } });
  await prisma.location.deleteMany({ where: { id: parcelaId } });
});

const plantar = async (gridRow: number | null, gridPosition: number | null) => {
  const s = await prisma.specimen.create({
    data: {
      locationId: parcelaId,
      specimenType: "coffee_plant",
      commonName: `${RUN} cafeto`, // NO opcional: `commonName` es requerido
      gridRow,
      gridPosition,
    },
  });
  creados.push(s.id);
  return s;
};

describe("el tablero limita dónde se sitúa un plantón", () => {
  it("una celda que existe entra", async () => {
    const s = await plantar(7, 12);
    expect(s.gridRow).toBe(7);
    expect(s.gridPosition).toBe(12);
  });

  it("una hilera que el tablero no tiene se rechaza, y el mensaje dice el tamaño", async () => {
    await expect(plantar(99, 1)).rejects.toThrow(/10 hileras x 20 plantas/);
  });

  it("una planta más allá del ancho se rechaza", async () => {
    await expect(plantar(1, 21)).rejects.toThrow(/no existe en la rejilla/);
  });

  it("el cero y lo negativo se rechazan: las celdas se cuentan desde 1", async () => {
    await expect(plantar(0, 1)).rejects.toThrow(/no existe en la rejilla/);
    await expect(plantar(1, -3)).rejects.toThrow(/no existe en la rejilla/);
  });

  /**
   * **Media coordenada SÍ entra, a propósito.** `jornadasDeCosecha.ts` imprime
   * `${gridRow}-${gridPosition ?? "?"}`, así que el repositorio ya tolera este
   * caso. El disparador valida cada número contra su límite, no la pareja.
   */
  it("media coordenada entra, y la que está se valida igual", async () => {
    const s = await plantar(5, null);
    expect(s.gridRow).toBe(5);
    await expect(plantar(99, null)).rejects.toThrow(/no existe en la rejilla/);
  });

  it("sin coordenadas no se comprueba nada: un plantón puede no estar situado", async () => {
    const s = await plantar(null, null);
    expect(s.gridRow).toBeNull();
  });

  /** El UPDATE es el otro camino. Un disparador que sólo cubre el INSERT se lee igual que uno completo. */
  it("mover un plantón fuera del tablero se rechaza también", async () => {
    const s = await plantar(3, 3);
    await expect(
      prisma.specimen.update({ where: { id: s.id }, data: { gridRow: 99 } }),
    ).rejects.toThrow(/no existe en la rejilla/);
  });

  it("una parcela sin rejilla no admite coordenadas: no hay tablero donde situarlas", async () => {
    const sinRejilla = await crearParcela(actor, `${RUN} sin rejilla`);
    await expect(
      prisma.specimen.create({
        data: {
          locationId: sinRejilla.id,
          specimenType: "coffee_plant",
          commonName: `${RUN} suelto`,
          gridRow: 1,
          gridPosition: 1,
        },
      }),
    ).rejects.toThrow(/no tiene rejilla/);
    await prisma.location.deleteMany({ where: { id: sinRejilla.id } });
  });
});
```

- [ ] **Paso 2: correrla y verla fallar por la razón correcta**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx vitest run tests/territorio/plantonEnLaRejilla.test.ts
```

Esperado: **caen las seis que esperan un rechazo** —`99, 1`, `1, 21`, el cero, media coordenada mala, el `UPDATE` y la parcela sin rejilla— porque hoy la base acepta todo. Las de «entra» pasan.

**Leer la línea `Test Files`, no `Tests`.** Si no aparece ninguna de las dos, no midió: probablemente falta `TEST_DATABASE_URL`, y entonces `tests/setup.ts` se niega **antes de recoger nada** y la salida se lee igual que «mi prueba está rota».

- [ ] **Paso 3: escribir la migración**

Carpeta `prisma/migrations/<marca>_planton_en_la_rejilla/`, con la marca de tiempo en el formato que usan las demás (`AAAAMMDDHHMMSS`). En `migration.sql`:

```sql
-- El tablero limita dónde se puede situar un plantón.
--
-- El guardia existía en UN SOLO SENTIDO. `location_exigir_rejilla_sin_huerfanos`
-- impide encoger la rejilla por debajo de una planta existente —nombra «una planta
-- en la hilera 9, planta 12»— pero no había ningún disparador sobre
-- `traceability.specimen`. Medido el 2026-10-02: 0, con el control de que el mismo
-- archivo nombra `plot_block` 15 veces. Así que un plantón se podía crear en la
-- hilera 99 de un lote de 10 hileras y nadie decía nada.
--
-- Hoy eso sólo se alcanza por SQL directo: 0 archivos de `app/` y 0 scripts
-- nombran `grid_row`. Este disparador es la PRECONDICIÓN de las pantallas que van a
-- escribir esas coordenadas, no el arreglo de un fallo vivo — y tiene que existir
-- antes que ellas, porque un guardia añadido después hereda las filas malas.
--
-- **No puede abortar esta migración:** es `BEFORE`, así que valida la fila que entra
-- o cambia, no las que ya están. Una fila existente que lo incumpla se queda, y
-- fallará la próxima vez que alguien la actualice.
--
-- **No exige que los dos números estén puestos.** `lib/traceability/jornadasDeCosecha.ts`
-- imprime `${gridRow}-${gridPosition ?? "?"}`: media coordenada es un caso que el
-- repositorio ya tolera a propósito. Cada número se valida contra su límite.
CREATE OR REPLACE FUNCTION "traceability"."exigir_planton_en_la_rejilla"()
RETURNS TRIGGER AS $$
DECLARE
  raiz UUID;
  p RECORD;
BEGIN
  -- Sin ninguna coordenada no hay nada que comprobar: un plantón puede no estar situado.
  IF NEW."grid_row" IS NULL AND NEW."grid_position" IS NULL THEN RETURN NEW; END IF;

  raiz := "core"."raiz_de_la_numeracion"(NEW."location_id");
  IF raiz IS NULL THEN
    RAISE EXCEPTION 'El plantón no cuelga de ninguna parcela: no hay rejilla donde situarlo';
  END IF;

  SELECT "row_count", "plants_per_row" INTO p FROM "core"."location" WHERE "id" = raiz;
  IF p."row_count" IS NULL THEN
    RAISE EXCEPTION 'La parcela no tiene rejilla: sin rejilla no se puede situar un plantón en una celda';
  END IF;

  IF (NEW."grid_row" IS NOT NULL AND (NEW."grid_row" < 1 OR NEW."grid_row" > p."row_count"))
     OR (NEW."grid_position" IS NOT NULL
         AND (NEW."grid_position" < 1 OR NEW."grid_position" > p."plants_per_row")) THEN
    RAISE EXCEPTION 'La celda (hilera %, planta %) no existe en la rejilla de la parcela (% hileras x % plantas)',
      COALESCE(NEW."grid_row"::TEXT, 'sin decir'),
      COALESCE(NEW."grid_position"::TEXT, 'sin decir'),
      p."row_count", p."plants_per_row";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- `UPDATE OF location_id` también: mover el plantón a otra ubicación le cambia la
-- parcela que pone la numeración, así que sus coordenadas vuelven a comprobarse.
CREATE TRIGGER "specimen_exigir_planton_en_la_rejilla"
  BEFORE INSERT OR UPDATE OF "grid_row", "grid_position", "location_id"
  ON "traceability"."specimen"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_planton_en_la_rejilla"();
```

- [ ] **Paso 4: aplicarla y leer el nombre que imprime**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx prisma migrate deploy
npx prisma generate
```

Leer que nombre la migración nueva. Si no la nombra, no se aplicó, y la prueba de abajo mediría el mundo de antes.

- [ ] **Paso 5: correr la prueba y verla pasar**

```bash
npx vitest run tests/territorio/plantonEnLaRejilla.test.ts
```

Esperado: `Test Files 1 passed`, 8 pruebas. Si alguna de las de «entra» cae, el disparador es demasiado estricto — mirar el mensaje, no suponer.

- [ ] **Paso 6: meter la prueba en el carril que tiene base**

En `scripts/pruebas-por-compuerta.txt`, bajo `# @grupo: base-sembrada`, añadir la línea `tests/territorio/plantonEnLaRejilla.test.ts`.

Y comprobarlo con su control, porque una prueba que necesita base y cae en el carril hermético falla con un error de Prisma en una compuerta que no toca Prisma:

```bash
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "salida=$?"
grep -c "plantonEnLaRejilla" /tmp/ci.txt      # debe ser 0: NO corre en el carril hermético
grep -c "rangosDeBloque" /tmp/ci.txt          # control: también 0, y ya está excluida
```

- [ ] **Paso 7: la compuerta y el commit, en ese orden y sin tubería**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export NODE_OPTIONS=--max-old-space-size=8192
npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "tsc=$?"
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "ci=$?"
git add prisma/migrations/<marca>_planton_en_la_rejilla/migration.sql
git add tests/territorio/plantonEnLaRejilla.test.ts
git add scripts/pruebas-por-compuerta.txt
git show --stat   # contar: deben ser 3
git commit -F <mensaje en un archivo>
```

- [ ] **Paso 8: flip-test, con sus tres cosas**

Commitear primero —el arnés restaura desde HEAD— y después mutar. Cada mutación quita **una conducta**, no un token, y tumba **una prueba distinta por su nombre**:

| mutación | debe caer |
|---|---|
| quitar la comparación de `grid_row` contra `row_count` | «una hilera que el tablero no tiene se rechaza» |
| quitar la de `grid_position` | «una planta más allá del ancho se rechaza» |
| quitar `< 1` de las dos | «el cero y lo negativo se rechazan» |
| cambiar el disparador a `BEFORE INSERT` sólo | «mover un plantón fuera del tablero se rechaza también» |
| quitar la rama de `p."row_count" IS NULL` | «una parcela sin rejilla no admite coordenadas» |

El arnés imprime, antes del veredicto: el sha del archivo antes y después —distintos o abortar—, **cuántas pruebas se recogieron** (si no son 8, el módulo no cargó y la vuelta se anula), y qué cayó por su nombre. Y borra el artefacto de la vuelta anterior antes de mutar.

---

### Tarea 2: La mitad del mensaje, en el servicio

**Archivos:**
- Modificar: `lib/traceability/specimens.ts` (junto a `SpecimenValidationError`, línea 34)
- Modificar: `messages/es.json`, `messages/en.json` (espacio `Traceability`)
- Crear: `tests/territorio/plantonSituado.test.ts` (hermética: no toca base)

**Interfaces:**
- Consume: `SpecimenValidationError` de `lib/traceability/specimens.ts`.
- Produce: los códigos `celda_fuera_de_la_rejilla` y `celda_sin_rejilla`, con frase `error_celda_fuera_de_la_rejilla` y `error_celda_sin_rejilla` en los dos idiomas.

**Por qué esta tarea existe, y por qué NO lleva rama de acción.** La base garantiza; el servicio da la frase. Sin esta mitad, quien construya la pantalla de mapeo recibe un `P0001` crudo, que es la pantalla de error 500 — el fallo del PR #433. Y **no se añade ninguna rama en `app/actions/`** porque medido el 2026-10-02 **ninguna acción crea un plantón con coordenadas**: 0 archivos de `app/` nombran `gridRow`. Esa rama entra con la pantalla, en el plan de la forma del lote, y allí está dicho.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
/**
 * El servicio da el mensaje; la base da la garantía.
 *
 * Hermética a propósito —mockea Prisma— así que corre en el carril de `ci.sh` y NO
 * va al grupo `base-sembrada`. Lo que la base garantiza se prueba en
 * `tests/territorio/plantonEnLaRejilla.test.ts`, contra la base de verdad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  location: { findUnique: vi.fn() },
  specimen: { create: vi.fn() },
}));
vi.mock("../../lib/db", () => ({ prisma: db }));

import { createSpecimen, SpecimenValidationError } from "../../lib/traceability/specimens";

beforeEach(() => {
  vi.clearAllMocks();
  db.specimen.create.mockResolvedValue({ id: "s1" });
});

const parcela = (rowCount: number | null, plantsPerRow: number | null) => ({
  id: "p1",
  rowCount,
  plantsPerRow,
  parentLocationId: null,
});

describe("createSpecimen valida la celda antes de llegar a la base", () => {
  it("una celda del tablero pasa", async () => {
    db.location.findUnique.mockResolvedValue(parcela(10, 20));
    await createSpecimen("actor", {
      locationId: "p1", specimenType: "coffee_plant", commonName: "cafeto",
      gridRow: 7, gridPosition: 12,
    });
    expect(db.specimen.create).toHaveBeenCalled();
  });

  it("una hilera fuera del tablero vuelve con su código, no con un error de Prisma", async () => {
    db.location.findUnique.mockResolvedValue(parcela(10, 20));
    await expect(
      createSpecimen("actor", {
        locationId: "p1", specimenType: "coffee_plant", commonName: "cafeto",
        gridRow: 99, gridPosition: 1,
      }),
    ).rejects.toThrow(SpecimenValidationError);
    expect(db.specimen.create, "no debe llegar a la base").not.toHaveBeenCalled();
  });

  it("una parcela sin rejilla no admite coordenadas", async () => {
    db.location.findUnique.mockResolvedValue(parcela(null, null));
    await expect(
      createSpecimen("actor", {
        locationId: "p1", specimenType: "coffee_plant", commonName: "cafeto",
        gridRow: 1, gridPosition: 1,
      }),
    ).rejects.toThrow(/celda_sin_rejilla/);
  });

  it("sin coordenadas no se valida nada, y una parcela sin rejilla sigue admitiendo plantones", async () => {
    db.location.findUnique.mockResolvedValue(parcela(null, null));
    await createSpecimen("actor", {
      locationId: "p1", specimenType: "coffee_plant", commonName: "cafeto",
      gridRow: null, gridPosition: null,
    });
    expect(db.specimen.create).toHaveBeenCalled();
  });
});
```

**Si la factoría del mock no casa con cómo `specimens.ts` consulta la ubicación, ajustar el mock a lo que el archivo hace de verdad — no al revés.** `resolveLocationScope` está en la línea 36 de ese archivo: leerla antes de escribir el mock.

- [ ] **Paso 2: correrla y verla fallar**

```bash
npx vitest run tests/territorio/plantonSituado.test.ts
```

Esperado: caen las dos que esperan un rechazo. **Si dice «no tests», no falló: no cargó** — casi siempre porque una clase del mock se declaró fuera de `vi.hoisted` y `vi.mock` se eleva por encima de ella.

- [ ] **Paso 3: la validación en el servicio**

En `lib/traceability/specimens.ts`, dentro de `createSpecimen`, después del `resolveLocationScope` y **antes** del `create`:

```ts
  // La base lo garantiza con un disparador; esto es lo que da la frase. Sin esta
  // mitad, un P0001 crudo llega a la pantalla como un 500 — el fallo del PR #433.
  if (input.gridRow != null || input.gridPosition != null) {
    const raiz = alcance.rowCount != null ? alcance : await madreDe(alcance);
    if (raiz?.rowCount == null) throw new SpecimenValidationError("celda_sin_rejilla");
    const fuera =
      (input.gridRow != null && (input.gridRow < 1 || input.gridRow > raiz.rowCount)) ||
      (input.gridPosition != null &&
        (input.gridPosition < 1 || input.gridPosition > (raiz.plantsPerRow ?? 0)));
    if (fuera) throw new SpecimenValidationError("celda_fuera_de_la_rejilla");
  }
```

`madreDe` es la mitad en TypeScript de `core.raiz_de_la_numeracion`: devuelve la ubicación padre. **Si `rejillaDelBloque` de `lib/traceability/plotBlocks.ts` ya hace exactamente esto, usar ésa y no escribir una segunda** — dos copias de la misma regla derivan, y por eso en la base vive en una sola función.

- [ ] **Paso 4: las frases, en los dos idiomas**

En `messages/es.json`, espacio `Traceability`:

```json
"error_celda_fuera_de_la_rejilla": "Esa celda no existe en la rejilla de la parcela. Revisa la hilera y la posición, o la rejilla.",
"error_celda_sin_rejilla": "La parcela todavía no está numerada, así que no se puede situar un plantón en una celda. Numérala primero."
```

Y en `messages/en.json` las mismas dos claves con su traducción. Comprobar la paridad, que es barata y caza el hueco:

```bash
node -e 'const f=require("fs");const es=JSON.parse(f.readFileSync("messages/es.json","utf8")).Traceability,en=JSON.parse(f.readFileSync("messages/en.json","utf8")).Traceability;
const fa=Object.keys(es).filter(k=>!(k in en));console.log("en es y no en en:",fa.length,fa.join(","));
console.log("CONTROL, una clave inventada se detecta:", !("error_zzz" in en));'
```

- [ ] **Paso 5: correr y ver pasar**

```bash
npx vitest run tests/territorio/plantonSituado.test.ts
```

Esperado: `Test Files 1 passed`, 4 pruebas.

- [ ] **Paso 6: la compuerta completa, el commit, y el flip**

```bash
export NODE_OPTIONS=--max-old-space-size=8192
npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "tsc=$?"
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "ci=$?"
npm run build > /tmp/build.txt 2>&1; echo "build=$?"
```

**El `build` no es opcional aunque `tsc` pase:** `vitest` no comprueba tipos y `npm run verify` no corre `next build`. Una clase exportada desde un archivo `"use server"` rompe el módulo entero y sólo lo ve el build.

Flip, dos mutaciones que tumban pruebas distintas: quitar la comparación de `gridRow` tumba «una hilera fuera del tablero vuelve con su código»; quitar la rama de `raiz?.rowCount == null` tumba «una parcela sin rejilla no admite coordenadas».

---

## Auto-revisión

**Cobertura del spec.** §7.3 queda cubierto por la tarea 1 (la garantía) y la 2 (la frase). El §10.5 pide que esto vaya primero: este plan es el primero. Nada más del spec entra aquí a propósito — el resto está en `2026-10-02-forma-del-lote.md`.

**Huecos conocidos, dichos y no escondidos:**
- **No hay rama en `app/actions/`**, porque no hay acción que cree un plantón con coordenadas. Entra con la pantalla, en el otro plan. Si alguien añade esa pantalla sin la rama, el código vuelve como texto crudo dentro de una frase genérica — `acciones-traducen-sus-errores` no lo ve, porque sólo escanea archivos que definen un `friendlyError`.
- **`madreDe` puede que ya exista** como `rejillaDelBloque`. El paso 3 manda comprobarlo antes de escribir una segunda copia.
- **Las filas existentes que incumplan se quedan.** Es `BEFORE`. Contar cuántas hay es una medición de una línea y no está en este plan porque la base de producción no se toca desde aquí: lo corre Daniel.
