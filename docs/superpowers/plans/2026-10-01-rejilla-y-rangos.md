# La rejilla de la parcela y los rangos — plan de implementación

> **Para quien ejecute esto:** SUB-SKILL OBLIGATORIA — usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para ejecutarlo tarea a tarea. Los pasos llevan casilla (`- [ ]`) para ir marcándolos.

**Objetivo:** que una parcela tenga numeración, que un bloque diga qué celdas cubre sin materializar cada planta, y que nada de eso pueda mentir.

**Arquitectura:** cuatro campos de rejilla y cuatro de rango en `Location`, una tabla hija `PlotBlockRange`, y **toda** la validación estructural en la base — `CHECK` para lo que se mira en una fila, disparadores para lo que exige mirar a otras. La herencia no se toca: ya existe. Las funciones puras viven en un módulo propio para probarse sin base.

**Stack:** Next.js 16, Prisma 7, PostgreSQL 18, vitest 4, next-intl.

**Spec:** `docs/superpowers/specs/2026-10-01-rejilla-y-bloques-design.md` — las siete decisiones (D1…D7) se citan por su número; quien ejecute lee los dos documentos.

**Árbol base:** `main` = `fe2df524`. Todos los números de línea se midieron ahí. **Si `main` ha avanzado, vuelve a localizar cada ancla por su TEXTO y no por su número** — el plan anterior murió por eso.

## Restricciones globales

- `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` antes de cualquier `npm`/`npx`.
- Worktree propio con punto de partida explícito: `git worktree add <ruta> -b <rama> origin/main`.
- `npm ci` en el worktree antes de creer a ninguna compuerta.
- **La base de trabajo es una sola y su nombre debe casar `^(nectar_test|nectar_ci|nn_flip_)`** — tres disparadores de sólo-añadir sólo abren su escotilla de limpieza con ese nombre, y con otro las suites mueren en su `afterAll`. Usa `nectar_ci_rejilla`.
- **Prohibido** `npm run test:db -- reset`, `prisma migrate reset`, `db push --force-reset`, borrar bases y fijar `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. La base compartida del 55433 la usan otras sesiones.
- Migraciones: exporta `DATABASE_URL` **y** `SHADOW_DATABASE_URL` locales antes de la CLI de Prisma. `scripts/migrate-guard.ts` aborta sin URL local, y hace bien.
- Nunca `git add -A`: archivo por archivo. `git commit -F <archivo>`.
- Compuertas sin tubería, leyendo el código de salida: `npm run verify; echo "salida=$?"`.
- Cada campo numérico en pantalla usa `<CampoNumerico>` de `app/components/CampoNumerico.tsx` — lo exige `tests/arquitectura/numeros-sin-rueda.test.ts`.
- Cada prueba que necesite base va a `scripts/pruebas-por-compuerta.txt` bajo `# @grupo: base-sembrada`, y se comprueba con `bash scripts/ci.sh` que **no** aparece en el carril hermético.

---

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `prisma/migrations/20261001210000_rejilla_y_rangos/migration.sql` | los ocho campos, la tabla hija, los `CHECK` y los tres disparadores |
| `prisma/schema.prisma` | `Location` (+8 campos), `PlotBlock` (+relación), `PlotBlockRange` (nuevo) |
| `lib/territorio/rejilla.ts` | **nuevo, puro, sin Prisma**: validar un rango, contar celdas, detectar solape |
| `lib/traceability/locations.ts` | la rejilla en `updateLocationAttributes`; el rango y la copia de atributos en `createMicrolot` |
| `lib/traceability/plotBlocks.ts` | alta y borrado de rangos de un bloque, y el informe de solapes |
| `lib/traceability/plantingCohorts.ts` | `getPlotDetail` expone rejilla, rango y comparación |
| `app/plots/[id]/ajustes/page.tsx` | la sección «La rejilla» |
| `app/components/traceability/RejillaForm.tsx` | **nuevo**: el formulario de la rejilla |
| `app/components/traceability/RangosDeBloqueForm.tsx` | **nuevo**: añadir y quitar rangos de un bloque |

`lib/territorio/` es nuevo a propósito: la aritmética de celdas no es trazabilidad y no debe importar Prisma. Eso la hace probable sin base, que es la mitad de por qué este plan es más corto que el anterior.

---

## Tarea 1 · Las funciones puras

**Archivos:**
- Crear: `lib/territorio/rejilla.ts`
- Prueba: `tests/territorio/rejilla.test.ts`

**Interfaces — produce:**
```ts
export interface Rejilla { rowCount: number; plantsPerRow: number }
export interface Rango { rowFrom: number; rowTo: number; plantFrom: number; plantTo: number }
export type RangoInvalido = "a_medias" | "al_reves" | "no_entero" | "fuera_de_rejilla";
export function validarRango(r: Partial<Rango>, dentro: Rejilla | null): RangoInvalido | null
export function celdasDelRango(r: Rango): number
export function seSolapan(a: Rango, b: Rango): boolean
export function celdasEnComun(a: Rango, b: Rango): number
```

- [ ] **Paso 1: escribir la prueba que falla**

`tests/territorio/rejilla.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { celdasDelRango, celdasEnComun, seSolapan, validarRango, type Rango } from "../../lib/territorio/rejilla";

const R = (rowFrom: number, rowTo: number, plantFrom: number, plantTo: number): Rango => ({ rowFrom, rowTo, plantFrom, plantTo });
const rejilla = { rowCount: 10, plantsPerRow: 20 };

describe("validarRango", () => {
  it("acepta un rango que cabe", () => {
    expect(validarRango(R(3, 6, 10, 18), rejilla)).toBeNull();
  });

  it("un rango a medias es a_medias, no «fuera de rejilla»", () => {
    expect(validarRango({ rowFrom: 3, rowTo: 6 }, rejilla)).toBe("a_medias");
    expect(validarRango({}, rejilla)).toBeNull();
  });

  it("al revés se distingue de fuera de rejilla", () => {
    expect(validarRango(R(6, 3, 10, 18), rejilla)).toBe("al_reves");
    expect(validarRango(R(3, 6, 18, 10), rejilla)).toBe("al_reves");
  });

  /**
   * NaN y los fraccionarios ANTES de comparar, no después: `NaN > x` es false y
   * una comparación con NaN siempre halaga a quien la escribió. Codex encontró
   * que la versión anterior devolvía `null` para cuatro NaN.
   */
  it("NaN y los fraccionarios se rechazan antes de comparar", () => {
    expect(validarRango(R(Number.NaN, 6, 10, 18), rejilla)).toBe("no_entero");
    expect(validarRango(R(3, 6, 10, 18.5), rejilla)).toBe("no_entero");
    expect(validarRango(R(Number.POSITIVE_INFINITY, 6, 10, 18), rejilla)).toBe("no_entero");
    expect(validarRango(R(0, 6, 10, 18), rejilla)).toBe("fuera_de_rejilla");
  });

  it("fuera de la rejilla, y sin rejilla no hay rango posible", () => {
    expect(validarRango(R(3, 11, 10, 18), rejilla)).toBe("fuera_de_rejilla");
    expect(validarRango(R(3, 6, 10, 21), rejilla)).toBe("fuera_de_rejilla");
    expect(validarRango(R(3, 6, 10, 18), null)).toBe("fuera_de_rejilla");
  });
});

describe("celdasDelRango", () => {
  it("cuenta los dos extremos incluidos", () => {
    expect(celdasDelRango(R(3, 6, 10, 18))).toBe(4 * 9);
    expect(celdasDelRango(R(1, 1, 1, 1))).toBe(1);
  });
});

describe("seSolapan y celdasEnComun", () => {
  it("se solapan sólo si se solapan LAS DOS dimensiones", () => {
    expect(seSolapan(R(1, 5, 1, 5), R(4, 8, 4, 8))).toBe(true);
    // misma banda de hileras, plantas disjuntas: NO se solapan
    expect(seSolapan(R(1, 5, 1, 5), R(1, 5, 6, 9))).toBe(false);
    // mismas plantas, hileras disjuntas: NO se solapan
    expect(seSolapan(R(1, 5, 1, 5), R(6, 9, 1, 5))).toBe(false);
  });

  it("cuenta las celdas comunes, y 0 cuando no se tocan", () => {
    expect(celdasEnComun(R(1, 5, 1, 5), R(4, 8, 4, 8))).toBe(2 * 2);
    expect(celdasEnComun(R(1, 5, 1, 5), R(1, 5, 6, 9))).toBe(0);
  });
});
```

- [ ] **Paso 2: verla fallar**

```bash
npx vitest run tests/territorio/rejilla.test.ts
```
Esperado: FALLA con `Cannot find module '../../lib/territorio/rejilla'`.

- [ ] **Paso 3: la implementación mínima**

`lib/territorio/rejilla.ts`:

```ts
/**
 * La aritmética de la rejilla de una parcela. Diseño §4, decisiones D3 y D5.
 *
 * **Módulo puro: no importa Prisma ni nada del dominio.** La aritmética de
 * celdas no es trazabilidad, y tenerla aparte es lo que permite probar sin base
 * los casos donde una rejilla miente: el rango a medias, el invertido, el que no
 * es entero y el que no cabe.
 *
 * **`NaN` se ataja ANTES de comparar.** `NaN > x` es `false`, así que un rango
 * con `NaN` pasaría cualquier comprobación de límites y se guardaría. Una
 * revisión independiente encontró justo eso en la versión anterior de esta
 * función: devolvía «válido» para cuatro `NaN`.
 */

export interface Rejilla {
  readonly rowCount: number;
  readonly plantsPerRow: number;
}

export interface Rango {
  readonly rowFrom: number;
  readonly rowTo: number;
  readonly plantFrom: number;
  readonly plantTo: number;
}

export type RangoInvalido = "a_medias" | "al_reves" | "no_entero" | "fuera_de_rejilla";

const esEnteroPositivo = (n: number) => Number.isInteger(n) && n >= 1;

/**
 * `null` cuando el rango es válido, o cuando no hay rango ninguno — los cuatro
 * campos vacíos son un estado legítimo (D3: el rango de la microparcela es
 * opcional). Media declaración, en cambio, es `a_medias`.
 */
export function validarRango(r: Partial<Rango>, dentro: Rejilla | null): RangoInvalido | null {
  const dados = [r.rowFrom, r.rowTo, r.plantFrom, r.plantTo].filter((v) => v !== undefined && v !== null);
  if (dados.length === 0) return null;
  if (dados.length !== 4) return "a_medias";

  const { rowFrom, rowTo, plantFrom, plantTo } = r as Rango;
  if (![rowFrom, rowTo, plantFrom, plantTo].every(esEnteroPositivo)) return "no_entero";
  if (rowFrom > rowTo || plantFrom > plantTo) return "al_reves";

  if (dentro === null) return "fuera_de_rejilla";
  if (rowTo > dentro.rowCount || plantTo > dentro.plantsPerRow) return "fuera_de_rejilla";
  return null;
}

/** Celdas del rango, con los dos extremos incluidos. */
export function celdasDelRango(r: Rango): number {
  return (r.rowTo - r.rowFrom + 1) * (r.plantTo - r.plantFrom + 1);
}

/**
 * Dos rangos se solapan **sólo si se solapan sus dos dimensiones**. Misma banda
 * de hileras con plantas disjuntas NO es solape: son dos trozos distintos de las
 * mismas hileras.
 */
export function seSolapan(a: Rango, b: Rango): boolean {
  return a.rowFrom <= b.rowTo && b.rowFrom <= a.rowTo && a.plantFrom <= b.plantTo && b.plantFrom <= a.plantTo;
}

export function celdasEnComun(a: Rango, b: Rango): number {
  if (!seSolapan(a, b)) return 0;
  const hileras = Math.min(a.rowTo, b.rowTo) - Math.max(a.rowFrom, b.rowFrom) + 1;
  const plantas = Math.min(a.plantTo, b.plantTo) - Math.max(a.plantFrom, b.plantFrom) + 1;
  return hileras * plantas;
}
```

- [ ] **Paso 4: verla pasar**

```bash
npx vitest run tests/territorio/rejilla.test.ts
```
Esperado: PASA, 7 pruebas.

- [ ] **Paso 5: comprobar que corre en el carril hermético**

```bash
bash scripts/ci.sh > /tmp/ci.log 2>&1; echo "salida=$?"
grep -c 'territorio/rejilla' scripts/pruebas-por-compuerta.txt
```
Esperado: salida `0`, y el `grep` da `0` — esta prueba **no** necesita base, así que **no** va a la lista de exclusión. Correcto que corra en el hermético.

- [ ] **Paso 6: typecheck y commit**

```bash
npx tsc --noEmit; echo "salida=$?"
git add lib/territorio/rejilla.ts
git add tests/territorio/rejilla.test.ts
git diff --cached --stat
git commit -F /tmp/msg1.txt
```
El stat debe decir **2 archivos**. Si dice otro número, parar.

---

## Tarea 2 · El esquema y la migración

**Archivos:**
- Modificar: `prisma/schema.prisma` — `Location` (tras la línea de `plantSpacingMeters`, hoy la **897**) y `PlotBlock` (hoy **7039–7068**)
- Crear: `prisma/migrations/20261001210000_rejilla_y_rangos/migration.sql`
- Prueba: `tests/territorio/rejillaEnLaBase.test.ts`

**Interfaces — consume:** nada. **Produce:** los campos `gridOrigin`, `rowCount`, `plantsPerRow`, `rowSpacingMeters`, `rangeRowFrom`, `rangeRowTo`, `rangePlantFrom`, `rangePlantTo` en `Location`; el modelo `PlotBlockRange`; el enum `GridOrigin`.

- [ ] **Paso 1: el esquema**

En `prisma/schema.prisma`, **localiza el modelo `Location` por su texto `model Location {`** y añade, dentro de él, justo después de la línea de `plantSpacingMeters` (medida en la 897, con espacios de alineación que NO hay que replicar a mano — ancla en el nombre del campo):

```prisma
  /// La rejilla de la parcela (diseño §4.1, D3). Los cuatro juntos o ninguno:
  /// media rejilla no es una rejilla, y lo impone un CHECK. Sin rejilla la
  /// pantalla dice «sin rejilla» y nunca un cero.
  gridOrigin        GridOrigin? @map("grid_origin")
  rowCount          Int?        @map("row_count")
  plantsPerRow      Int?        @map("plants_per_row")
  rowSpacingMeters  Decimal?    @map("row_spacing_meters") @db.Decimal(5, 2)

  /// El rango de la microparcela dentro de la rejilla de su parcela (D3).
  /// **Opcional a propósito**: sin él sólo se pierde una comprobación. Una misma
  /// tabla lleva rejilla y rango sin contradicción — como padre declaras tu
  /// rejilla, como hija tu sitio en la de tu padre.
  rangeRowFrom   Int? @map("range_row_from")
  rangeRowTo     Int? @map("range_row_to")
  rangePlantFrom Int? @map("range_plant_from")
  rangePlantTo   Int? @map("range_plant_to")
```

Y el enum, junto a `SubdivisionReason` (hoy sobre la línea 813):

```prisma
/// Desde qué esquina se cuenta la rejilla. Catálogo cerrado y no texto libre:
/// «noroeste» escrito de cuatro maneras no es un origen, y una coordenada que
/// no se puede comparar no nombra una planta.
enum GridOrigin {
  noroeste
  noreste
  suroeste
  sureste

  @@schema("core")
}
```

En `PlotBlock`, antes de su `@@unique`, la relación inversa:

```prisma
  /// Los rangos de celdas que forman el bloque (D5). Tabla hija y no cuatro
  /// columnas: un bloque irregular se describe con dos o tres rangos.
  rangos PlotBlockRange[]
```

Y el modelo nuevo, después de `PlotBlock`:

```prisma
/// Un tramo rectangular de la rejilla que forma parte de un bloque (D5).
///
/// Las coordenadas son **de la parcela**, no del bloque ni de la microparcela:
/// una sola numeración (D3), así que «hilera 12, planta 30» nombra la misma
/// planta mire quien mire.
model PlotBlockRange {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  plotBlockId String    @map("plot_block_id") @db.Uuid
  plotBlock   PlotBlock @relation(fields: [plotBlockId], references: [id], onDelete: Cascade)

  rowFrom   Int @map("row_from")
  rowTo     Int @map("row_to")
  plantFrom Int @map("plant_from")
  plantTo   Int @map("plant_to")

  createdAt DateTime    @default(now()) @map("created_at")
  createdBy String      @map("created_by") @db.Uuid
  creator   UserAccount @relation("PlotBlockRangeCreatedBy", fields: [createdBy], references: [id])

  @@index([plotBlockId])
  @@map("plot_block_range")
  @@schema("traceability")
}
```

Y en `UserAccount`, la inversa: `plotBlockRangesCreados PlotBlockRange[] @relation("PlotBlockRangeCreatedBy")`.

- [ ] **Paso 2: generar la migración contra una base LOCAL**

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55433/nectar_ci_rejilla"
export SHADOW_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55433/nectar_ci_rejilla_shadow"
npx prisma migrate dev --create-only --name rejilla_y_rangos; echo "salida=$?"
```

Si sale con `Me niego a correr prisma migrate dev contra una base remota`, las dos variables no están exportadas en **esta** shell. No uses `ALLOW_REMOTE_MIGRATE=1`: eso apunta a producción.

**No renombres la carpeta.** La última migración existente es `20261001160000_floracion_de_parcela`; la que genera Prisma ya ordena después. El plan anterior mandaba renombrar «para que quede al final» con una premisa que había caducado.

- [ ] **Paso 3: añadir a mano los `CHECK` y los tres disparadores**

Al final del `migration.sql` generado:

```sql
-- D3: media rejilla no es una rejilla.
ALTER TABLE "core"."location" ADD CONSTRAINT "location_rejilla_completa"
  CHECK (num_nonnulls("grid_origin", "row_count", "plants_per_row", "row_spacing_meters") IN (0, 4));

-- D3: medio rango tampoco.
ALTER TABLE "core"."location" ADD CONSTRAINT "location_rango_completo"
  CHECK (num_nonnulls("range_row_from", "range_row_to", "range_plant_from", "range_plant_to") IN (0, 4));

ALTER TABLE "core"."location" ADD CONSTRAINT "location_rango_no_invertido"
  CHECK ("range_row_from" IS NULL OR ("range_row_from" <= "range_row_to" AND "range_plant_from" <= "range_plant_to"));

ALTER TABLE "core"."location" ADD CONSTRAINT "location_rejilla_positiva"
  CHECK ("row_count" IS NULL OR ("row_count" >= 1 AND "plants_per_row" >= 1));

ALTER TABLE "traceability"."plot_block_range" ADD CONSTRAINT "plot_block_range_no_invertido"
  CHECK ("row_from" <= "row_to" AND "plant_from" <= "plant_to");

ALTER TABLE "traceability"."plot_block_range" ADD CONSTRAINT "plot_block_range_positivo"
  CHECK ("row_from" >= 1 AND "plant_from" >= 1);

-- ---------------------------------------------------------------------------
-- D3: un rango cabe en la rejilla de SU PARCELA. Para una microparcela, la de
-- su padre; y si su padre también declaró rango, dentro de ese rango.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "core"."exigir_rango_en_la_rejilla"()
RETURNS TRIGGER AS $$
DECLARE
  p RECORD;
BEGIN
  IF NEW."range_row_from" IS NULL THEN RETURN NEW; END IF;
  IF NEW."parent_location_id" IS NULL THEN
    RAISE EXCEPTION 'Un rango dice el sitio dentro de otra parcela, y esta ubicación no tiene padre';
  END IF;
  SELECT "row_count", "plants_per_row", "range_row_to", "range_plant_to"
    INTO p FROM "core"."location" WHERE "id" = NEW."parent_location_id";
  IF p."row_count" IS NULL THEN
    RAISE EXCEPTION 'La parcela madre no tiene rejilla: sin rejilla no hay rango que le quepa';
  END IF;
  IF NEW."range_row_to" > p."row_count" OR NEW."range_plant_to" > p."plants_per_row" THEN
    RAISE EXCEPTION 'El rango no cabe en la rejilla de la parcela (% hileras × % plantas)',
      p."row_count", p."plants_per_row";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "location_exigir_rango_en_la_rejilla"
  BEFORE INSERT OR UPDATE OF "range_row_from", "range_row_to", "range_plant_from", "range_plant_to", "parent_location_id"
  ON "core"."location" FOR EACH ROW
  EXECUTE FUNCTION "core"."exigir_rango_en_la_rejilla"();

-- ---------------------------------------------------------------------------
-- D4: crecer es libre; ENCOGER sólo si nada queda fuera. Recorre las tres cosas
-- que pueden quedar huérfanas, y LAS PLANTAS CUENTAN — son filas reales con
-- historia, y dejarlas apuntando a celdas que ya no existen es peor que negar
-- el encogimiento.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "core"."exigir_rejilla_sin_huerfanos"()
RETURNS TRIGGER AS $$
DECLARE
  culpable TEXT;
BEGIN
  IF NEW."row_count" IS NULL THEN
    IF OLD."row_count" IS NULL THEN RETURN NEW; END IF;
  ELSIF OLD."row_count" IS NOT NULL
        AND NEW."row_count" >= OLD."row_count"
        AND NEW."plants_per_row" >= OLD."plants_per_row" THEN
    RETURN NEW;  -- crecer o no cambiar: libre
  END IF;

  SELECT 'la microparcela ' || h."name" INTO culpable
    FROM "core"."location" h
   WHERE h."parent_location_id" = NEW."id" AND h."range_row_from" IS NOT NULL
     AND (NEW."row_count" IS NULL OR h."range_row_to" > NEW."row_count"
          OR h."range_plant_to" > NEW."plants_per_row")
   LIMIT 1;
  IF culpable IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede encoger la rejilla: % queda fuera', culpable;
  END IF;

  SELECT 'el bloque ' || b."name" INTO culpable
    FROM "traceability"."plot_block_range" r
    JOIN "traceability"."plot_block" b ON b."id" = r."plot_block_id"
    LEFT JOIN "core"."location" l ON l."id" = b."location_id"
   WHERE (b."location_id" = NEW."id" OR l."parent_location_id" = NEW."id")
     AND (NEW."row_count" IS NULL OR r."row_to" > NEW."row_count"
          OR r."plant_to" > NEW."plants_per_row")
   LIMIT 1;
  IF culpable IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede encoger la rejilla: % queda fuera', culpable;
  END IF;

  SELECT 'una planta en la hilera ' || s."grid_row" || ', planta ' || s."grid_position"
    INTO culpable
    FROM "traceability"."specimen" s
    LEFT JOIN "core"."location" l ON l."id" = s."location_id"
   WHERE (s."location_id" = NEW."id" OR l."parent_location_id" = NEW."id")
     AND s."grid_row" IS NOT NULL
     AND (NEW."row_count" IS NULL OR s."grid_row" > NEW."row_count"
          OR s."grid_position" > NEW."plants_per_row")
   LIMIT 1;
  IF culpable IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede encoger la rejilla: % queda fuera', culpable;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "location_exigir_rejilla_sin_huerfanos"
  BEFORE UPDATE OF "row_count", "plants_per_row" ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_rejilla_sin_huerfanos"();

-- ---------------------------------------------------------------------------
-- D7: dos bloques de TRAMPA no se solapan entre sí. Uno `experimental` puede
-- solaparse con cualquiera. Y uno SIN TIPO no bloquea a nadie: «desconocido» no
-- es «no es de trampa» (ADR-080). El solape se compara con int4range y `&&`,
-- igual que 20260921100000_bandejas_de_la_corrida lo hace con tsrange.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "traceability"."exigir_trampas_sin_solape"()
RETURNS TRIGGER AS $$
DECLARE
  mi_tipo "traceability"."PlotBlockType";
  mi_parcela UUID;
  otro TEXT;
BEGIN
  SELECT b."block_type", b."location_id" INTO mi_tipo, mi_parcela
    FROM "traceability"."plot_block" b WHERE b."id" = NEW."plot_block_id";
  IF mi_tipo IS DISTINCT FROM 'trampa' THEN RETURN NEW; END IF;

  SELECT b2."name" INTO otro
    FROM "traceability"."plot_block_range" r2
    JOIN "traceability"."plot_block" b2 ON b2."id" = r2."plot_block_id"
   WHERE b2."block_type" = 'trampa'
     AND b2."id" <> NEW."plot_block_id"
     AND b2."location_id" = mi_parcela
     AND int4range(r2."row_from", r2."row_to", '[]') && int4range(NEW."row_from", NEW."row_to", '[]')
     AND int4range(r2."plant_from", r2."plant_to", '[]') && int4range(NEW."plant_from", NEW."plant_to", '[]')
   LIMIT 1;
  IF otro IS NOT NULL THEN
    RAISE EXCEPTION 'Dos bloques de trampa no cubren las mismas celdas: se solapa con %', otro;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plot_block_range_exigir_trampas_sin_solape"
  BEFORE INSERT OR UPDATE ON "traceability"."plot_block_range"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_trampas_sin_solape"();
```

- [ ] **Paso 4: aplicar y regenerar**

```bash
npx prisma migrate deploy; echo "salida=$?"
npx prisma generate; echo "salida=$?"
```
Lee los nombres que imprime `deploy`. Si no nombra `rejilla_y_rangos`, no se aplicó.

- [ ] **Paso 5: la prueba de la base**

`tests/territorio/rejillaEnLaBase.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearUsuarioConAcceso, crearParcela } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

let userAccountIds: string[] = [];
let personIds: string[] = [];
let scopeIds: string[] = [];
let locationIds: string[] = [];
let organizationIds: string[] = [];
let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let parcela: Awaited<ReturnType<typeof crearParcela>>;

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  parcela = await crearParcela(usuario);
});

afterEach(async () => {
  await prisma.plotBlockRange.deleteMany({ where: assertDefinedWhere({ createdBy: { in: userAccountIds.concat(usuario.userAccountId) } }) });
  await prisma.plotBlock.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds.concat(parcela.locationId) } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  locationIds = [];
  await prisma.location.update({
    where: { id: parcela.locationId },
    data: { rowCount: null, plantsPerRow: null, gridOrigin: null, rowSpacingMeters: null },
  });
});

/**
 * **La limpieza NO borra el ámbito de plataforma.** `crearUsuarioConAcceso`
 * devuelve el ámbito COMPARTIDO (`tests/helpers/ambitoDePlataforma.ts` dice «NO
 * lo borres»), y `assignment.scope_id` es RESTRICT: borrarlo revienta y además
 * se lo quita a los archivos que corren en paralelo. Por eso este archivo no
 * toca `scope`, `userAccount` ni `person` del usuario del `beforeAll`.
 */

describe("la rejilla en la base", () => {
  it("acepta una rejilla completa — el control positivo", async () => {
    const l = await prisma.location.update({
      where: { id: parcela.locationId },
      data: { gridOrigin: "noroeste", rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5 },
    });
    expect(l.rowCount).toBe(10);
  });

  it("rechaza media rejilla", async () => {
    await expect(
      prisma.location.update({ where: { id: parcela.locationId }, data: { rowCount: 10 } }),
    ).rejects.toThrow(/location_rejilla_completa/);
  });

  it("encoger con un bloque fuera se rechaza, y el error lo NOMBRA", async () => {
    await prisma.location.update({
      where: { id: parcela.locationId },
      data: { gridOrigin: "noroeste", rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5 },
    });
    const bloque = await prisma.plotBlock.create({
      data: { locationId: parcela.locationId, name: "Bloque Sombra", blockType: "experimental", createdBy: usuario.userAccountId },
    });
    await prisma.plotBlockRange.create({
      data: { plotBlockId: bloque.id, rowFrom: 1, rowTo: 8, plantFrom: 1, plantTo: 20, createdBy: usuario.userAccountId },
    });
    await expect(
      prisma.location.update({ where: { id: parcela.locationId }, data: { rowCount: 5, plantsPerRow: 20 } }),
    ).rejects.toThrow(/Bloque Sombra queda fuera/);
    // control: CRECER sí se permite, con el mismo bloque dentro
    const crecida = await prisma.location.update({
      where: { id: parcela.locationId },
      data: { rowCount: 12, plantsPerRow: 24 },
    });
    expect(crecida.rowCount).toBe(12);
  });

  it("encoger con una PLANTA fuera también se rechaza (D4)", async () => {
    await prisma.location.update({
      where: { id: parcela.locationId },
      data: { gridOrigin: "noroeste", rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5 },
    });
    await prisma.specimen.create({
      data: { locationId: parcela.locationId, specimenType: "plant", gridRow: 9, gridPosition: 3, createdBy: usuario.userAccountId },
    });
    await expect(
      prisma.location.update({ where: { id: parcela.locationId }, data: { rowCount: 5, plantsPerRow: 20 } }),
    ).rejects.toThrow(/hilera 9, planta 3/);
    await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: parcela.locationId }) });
  });

  it("dos bloques de TRAMPA no se solapan; con uno experimental sí se puede", async () => {
    await prisma.location.update({
      where: { id: parcela.locationId },
      data: { gridOrigin: "noroeste", rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5 },
    });
    const mk = async (name: string, blockType: "trampa" | "experimental" | null) =>
      prisma.plotBlock.create({ data: { locationId: parcela.locationId, name, blockType, createdBy: usuario.userAccountId } });
    const t1 = await mk("Trampas Alto", "trampa");
    const t2 = await mk("Trampas Bajo", "trampa");
    const ex = await mk("Ensayo A", "experimental");
    const sin = await mk("Viejo sin tipo", null);
    const rango = { rowFrom: 1, rowTo: 5, plantFrom: 1, plantTo: 10, createdBy: usuario.userAccountId };

    await prisma.plotBlockRange.create({ data: { ...rango, plotBlockId: t1.id } });
    await expect(prisma.plotBlockRange.create({ data: { ...rango, plotBlockId: t2.id } }))
      .rejects.toThrow(/se solapa con Trampas Alto/);
    // experimental sobre las mismas celdas: permitido (D7)
    await expect(prisma.plotBlockRange.create({ data: { ...rango, plotBlockId: ex.id } })).resolves.toBeTruthy();
    // sin tipo: no bloquea a nadie, ADR-080
    await expect(prisma.plotBlockRange.create({ data: { ...rango, plotBlockId: sin.id } })).resolves.toBeTruthy();
  });
});
```

- [ ] **Paso 6: registrar la prueba en el carril con base**

Añade `tests/territorio/rejillaEnLaBase.test.ts` a `scripts/pruebas-por-compuerta.txt` bajo `# @grupo: base-sembrada`, y comprueba:

```bash
grep -c 'territorio/rejillaEnLaBase' scripts/pruebas-por-compuerta.txt   # debe dar 1
bash scripts/ci.sh > /tmp/ci.log 2>&1; echo "salida=$?"
grep -c 'rejillaEnLaBase' /tmp/ci.log                                    # debe dar 0
```
Sin esto, el carril hermético la corre **sin base** y CI se pone rojo con un error de Prisma en una compuerta que no toca Prisma.

- [ ] **Paso 7: correrla y commitear**

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55433/nectar_ci_rejilla"
npx vitest run tests/territorio/rejillaEnLaBase.test.ts; echo "salida=$?"
npx tsc --noEmit; echo "salida=$?"
git add prisma/schema.prisma
git add prisma/migrations/20261001210000_rejilla_y_rangos/migration.sql
git add tests/territorio/rejillaEnLaBase.test.ts
git add scripts/pruebas-por-compuerta.txt
git diff --cached --stat
git commit -F /tmp/msg2.txt
```
El stat debe decir **4 archivos**.

- [ ] **Paso 8: flip-test de los tres disparadores**

Commitear **antes** de mutar: el arnés restaura desde HEAD.

Para cada disparador, una mutación que quita **la conducta** y no el token:

| disparador | mutación | debe caer |
|---|---|---|
| `exigir_rejilla_sin_huerfanos` | borrar el bloque `SELECT 'una planta…'` entero | «encoger con una PLANTA fuera también se rechaza» |
| `exigir_trampas_sin_solape` | cambiar `b2."block_type" = 'trampa'` por `b2."block_type" IS NOT NULL` | «sin tipo: no bloquea a nadie» |
| `exigir_rango_en_la_rejilla` | quitar la comparación `NEW."range_row_to" > p."row_count"` | la prueba del rango fuera de rejilla de la tarea 4 |

Para cada una, antes del veredicto imprime: el **sha del `migration.sql` antes y después** (distintos o abortar), que `psql` **crea la función sin error** —no basta con que el SQL parezca válido— y **qué prueba cae por su nombre**. Restaurar con `git checkout -- prisma/migrations/...` y volver a aplicar.

---

## Tarea 3 · La rejilla en `updateLocationAttributes`

**Archivos:**
- Modificar: `lib/traceability/locations.ts:296` (la función) y su `UpdateLocationAttributesInput`
- Prueba: `tests/territorio/rejillaEnLaBase.test.ts` (ampliar)

**Interfaces — consume:** `validarRango` de la tarea 1. **Produce:** `UpdateLocationAttributesInput` con cuatro campos más, y la clase `RejillaInvalida`.

- [ ] **Paso 1: la prueba que falla**

Añade a `tests/territorio/rejillaEnLaBase.test.ts`:

```ts
import { updateLocationAttributes, RejillaInvalida } from "../../lib/traceability/locations";

describe("updateLocationAttributes y la rejilla", () => {
  it("guarda la rejilla entera", async () => {
    await updateLocationAttributes(usuario.userAccountId, {
      locationId: parcela.locationId,
      gridOrigin: "noroeste", rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5,
    });
    const l = await prisma.location.findUniqueOrThrow({ where: { id: parcela.locationId } });
    expect(l.plantsPerRow).toBe(20);
  });

  it("media rejilla la rechaza el SERVICIO con su clase, antes de llegar a la base", async () => {
    await expect(
      updateLocationAttributes(usuario.userAccountId, { locationId: parcela.locationId, rowCount: 10 }),
    ).rejects.toThrow(RejillaInvalida);
  });
});
```

- [ ] **Paso 2: verla fallar**

```bash
npx vitest run tests/territorio/rejillaEnLaBase.test.ts -t "updateLocationAttributes"
```
Esperado: FALLA — `RejillaInvalida` no se exporta.

- [ ] **Paso 3: implementar**

En `lib/traceability/locations.ts`, junto a las otras clases de error:

```ts
export class RejillaInvalida extends Error {}
```

En `UpdateLocationAttributesInput`, tras `plantSpacingMeters`:

```ts
  /** La rejilla (D3). Los cuatro juntos o ninguno; el servicio lo comprueba antes de la base. */
  gridOrigin?: GridOrigin | null;
  rowCount?: number | null;
  plantsPerRow?: number | null;
  rowSpacingMeters?: number | null;
```

Y dentro de la función, antes del `update`:

```ts
  // Los cuatro o ninguno. El CHECK de la base es la red; esto es el mensaje.
  const rejilla = [input.gridOrigin, input.rowCount, input.plantsPerRow, input.rowSpacingMeters];
  const dados = rejilla.filter((v) => v !== undefined && v !== null).length;
  if (dados !== 0 && dados !== 4) throw new RejillaInvalida("rejilla_a_medias");
  if (input.rowCount != null && (!Number.isInteger(input.rowCount) || input.rowCount < 1)) {
    throw new RejillaInvalida("rejilla_no_entera");
  }
  if (input.plantsPerRow != null && (!Number.isInteger(input.plantsPerRow) || input.plantsPerRow < 1)) {
    throw new RejillaInvalida("rejilla_no_entera");
  }
```

- [ ] **Paso 4: la rama de `friendlyError`**

**Esto no es opcional y es la trampa documentada del PR #433:** `friendlyError` en `app/actions/traceability.ts` **relanza toda clase que no conoce**, así que una `RejillaInvalida` que llegue a una acción es una pantalla de error en vez de un mensaje. Añade su rama con los dos códigos (`rejilla_a_medias`, `rejilla_no_entera`) y sus textos en `messages/es.json` y `messages/en.json`.

- [ ] **Paso 5: verlas pasar, typecheck, build y commit**

```bash
npx vitest run tests/territorio/rejillaEnLaBase.test.ts; echo "salida=$?"
npx tsc --noEmit; echo "salida=$?"
npm run build > /tmp/b.log 2>&1; echo "build salida=$?"
```

**El `build` va en esta tarea y no en la última**: `vitest` no comprueba tipos de las páginas de servidor, y el 2026-09-14 una clase exportada desde un archivo `"use server"` dejó producción sin desplegar una hora con las PR en verde.

---

## Tarea 4 · El rango y la copia de atributos en `createMicrolot`

**Archivos:**
- Modificar: `lib/traceability/locations.ts:378` (`createMicrolot`)
- Prueba: `tests/territorio/microparcelaConRango.test.ts`

**Interfaces — consume:** `validarRango`. **Produce:** `CreateMicrolotInput` con los cuatro campos de rango; el `AuditEvent` de operación `location.copy_attributes_from_parent`.

- [ ] **Paso 1: la prueba que falla**

```ts
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createMicrolot, updateLocationAttributes } from "../../lib/traceability/locations";
import { crearUsuarioConAcceso, crearParcela } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

let locationIds: string[] = [];
let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let parcela: Awaited<ReturnType<typeof crearParcela>>;

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  parcela = await crearParcela(usuario);
  await updateLocationAttributes(usuario.userAccountId, {
    locationId: parcela.locationId,
    gridOrigin: "noroeste", rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5,
    altitudeMinM: 1400, altitudeMaxM: 1500, soilType: "franco",
  });
});

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: locationIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  locationIds = [];
});

describe("createMicrolot", () => {
  it("copia los atributos del padre y lo deja escrito en la auditoría (D2, D6)", async () => {
    const m = await createMicrolot(usuario.userAccountId, {
      parentLocationId: parcela.locationId, name: "Norte", subdivisionReason: "altitude",
    });
    locationIds.push(m.id);
    expect(m.altitudeMinM).toBe(1400);
    expect(m.soilType).toBe("franco");
    const ev = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityId: m.id, operation: "location.copy_attributes_from_parent" }),
    });
    expect(ev, "sin el AuditEvent nadie distingue un valor copiado de uno medido").not.toBeNull();
  });

  it("cambiar la parcela DESPUÉS no mueve la microparcela (D2)", async () => {
    const m = await createMicrolot(usuario.userAccountId, {
      parentLocationId: parcela.locationId, name: "Sur", subdivisionReason: "shade",
    });
    locationIds.push(m.id);
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.locationId, altitudeMinM: 1600 });
    const tras = await prisma.location.findUniqueOrThrow({ where: { id: m.id } });
    expect(tras.altitudeMinM).toBe(1400);
  });

  it("acepta un rango que cabe, y rechaza el que no", async () => {
    const m = await createMicrolot(usuario.userAccountId, {
      parentLocationId: parcela.locationId, name: "Con rango", subdivisionReason: "slope",
      rangeRowFrom: 1, rangeRowTo: 4, rangePlantFrom: 1, rangePlantTo: 20,
    });
    locationIds.push(m.id);
    expect(m.rangeRowTo).toBe(4);
    await expect(createMicrolot(usuario.userAccountId, {
      parentLocationId: parcela.locationId, name: "Se sale", subdivisionReason: "other",
      rangeRowFrom: 1, rangeRowTo: 40, rangePlantFrom: 1, rangePlantTo: 20,
    })).rejects.toThrow(/no cabe en la rejilla/);
  });
});
```

- [ ] **Paso 2: verla fallar.** `npx vitest run tests/territorio/microparcelaConRango.test.ts` → FALLA: los campos no existen en el input.

- [ ] **Paso 3: implementar.** En `createMicrolot`, dentro del `tx.location.create`, añadir los nueve atributos copiados desde `parent` y los cuatro de rango desde `input`; y **en la misma transacción**, un segundo `recordAuditEvent` con `operation: "location.copy_attributes_from_parent"` y los valores copiados en `after`.

**Los nueve que se copian, por nombre:** `altitudeMinM`, `altitudeMaxM`, `shadePercentage`, `slopeDescription`, `soilType`, `sunExposure`, `aspect`, `plantSpacingMeters`, `areaHectares`. **La rejilla NO se copia:** una microparcela usa la numeración de su parcela (D3), no la suya.

- [ ] **Paso 4: registrar la prueba, correrla, typecheck, commit.** Igual que la tarea 2, paso 6 y 7, con `tests/territorio/microparcelaConRango.test.ts`.

- [ ] **Paso 5: flip-test.** Quitar el `recordAuditEvent` de la copia → debe caer «copia los atributos del padre y lo deja escrito en la auditoría», por su nombre. Y quitar la copia de `altitudeMinM` → debe caer la aserción del valor, no la del evento. Si cae la misma prueba en los dos casos, las aserciones no discriminan: sepáralas.

---

## Tarea 5 · Los rangos de un bloque

**Archivos:**
- Modificar: `lib/traceability/plotBlocks.ts` (121 líneas hoy)
- Modificar: `docs/arquitectura/acceso-a-datos.allowlist.json` y `docs/arquitectura/inventario-de-acceso.md`
- Prueba: `tests/territorio/rangosDeBloque.test.ts`

**Interfaces — consume:** `validarRango`, `celdasEnComun`, `seSolapan`. **Produce:**
```ts
export async function anadirRangoAlBloque(userAccountId: string, input: { plotBlockId: string; rowFrom: number; rowTo: number; plantFrom: number; plantTo: number }): Promise<{ rango: PlotBlockRange; solapesAvisados: Array<{ bloque: string; celdas: number }> }>
export async function quitarRangoDelBloque(userAccountId: string, rangoId: string): Promise<void>
export class RangoInvalidoError extends Error {}
```

- [ ] **Paso 1: la prueba que falla** — con los tres casos: un rango que cabe, uno que no, y el **informe de solape** cuando D7 lo permite (experimental sobre trampa debe devolver `solapesAvisados` con el nombre y las celdas comunes, **y guardar igual**).

- [ ] **Paso 2: verla fallar.**

- [ ] **Paso 3: implementar**, con `requireLocationAttributeAccess` sobre la ubicación del bloque **antes** de escribir, y el `AuditEvent` en la **misma transacción** (lo exige `tests/arquitectura/audit-atomico.test.ts`, que sólo reconoce `function f(tx…)` **en una línea y sin anotación de retorno**).

- [ ] **Paso 4: las DOS entradas del allowlist.** `plotBlocks.ts` ya está en `importan_cliente_total`; añade en `operaciones_sin_patron` las dos operaciones nuevas si no siguen el patrón, con su `razon` escrita. Luego:

```bash
node scripts/inventario-de-acceso.mjs
```
y commitea el `inventario-de-acceso.md` que genere. **No edites sus cifras a mano**: ese archivo da conflicto en casi todos los PR y la única resolución correcta es volver a medirlo.

- [ ] **Paso 5: registrar, correr, typecheck, build, commit.**

- [ ] **Paso 6: flip-test.** Quitar el `requireLocationAttributeAccess` → debe caer una prueba de autorización **por su nombre**. Si no existe esa prueba, escríbela: `requireLotAccess` y sus hermanas son un **OR** sobre los candidatos, no un AND, y un guardia de autorización sin su prueba negativa no es un guardia.

---

## Tarea 6 · `getPlotDetail` expone rejilla, rango y comparación

**Archivos:**
- Modificar: `lib/traceability/plantingCohorts.ts:455` (`getPlotDetail`)
- Prueba: `tests/territorio/comparacionDeLaRejilla.test.ts`

**Interfaces — consume:** `celdasDelRango`, y `computePlotDensity` que ya existe en ese archivo (línea 410 el tipo). **Produce:** en el retorno de `getPlotDetail`, un campo

```ts
rejilla:
  | { estado: "sin_rejilla" }
  | { estado: "sin_siembras"; capacidad: number }
  | { estado: "conteo_incompleto"; capacidad: number; contadas: number; siembrasSinConteo: number }
  | { estado: "ok"; capacidad: number; contadas: number; diferencia: number }
```

- [ ] **Paso 1: la prueba que falla**, con los cuatro estados y **sin crear la cohorte dentro del flip-test**:

```ts
it("sin siembras dice «sin siembras», nunca 0 de 200 (D, ADR-080)", async () => { /* … */ });

/**
 * La cohorte SIN conteo vive en esta prueba permanente, no «sólo durante el
 * flip-test». El plan anterior mandaba añadirla temporalmente, y sin ella
 * filtrar o no filtrar da lo mismo: el flip no discriminaba. La fila que hace
 * discriminar a una prueba se queda en ella.
 */
it("con una siembra sin conteo dice conteo_incompleto y NO compara", async () => { /* … */ });
```

- [ ] **Paso 2 a 5:** verla fallar, implementar, verla pasar, typecheck + build, commit.

- [ ] **Paso 6: flip-test.** Cambiar `estado: "conteo_incompleto"` por el cálculo completo contra cero → debe caer «con una siembra sin conteo…» **por su nombre**, y la cohorte que lo hace discriminar ya está en la prueba.

---

## Tarea 7 · Las pantallas

**Archivos:**
- Crear: `app/components/traceability/RejillaForm.tsx`, `app/components/traceability/RangosDeBloqueForm.tsx`
- Modificar: `app/plots/[id]/ajustes/page.tsx`, `app/plots/[id]/page.tsx`
- Modificar: `messages/es.json`, `messages/en.json`
- Prueba: `tests/territorio/pantallaDeRejilla.test.tsx`

- [ ] **Paso 1: la prueba que falla** — renderizar los dos formularios y comprobar que **todos** los campos numéricos son `<CampoNumerico>`, y que la ficha pinta los cuatro estados de la comparación.

- [ ] **Paso 2 a 4:** implementar con `<BotonDeEnvio>` (lo exige `tests/arquitectura/envio-sin-doble-toque.test.ts`), `<CampoNumerico>` de `app/components/CampoNumerico.tsx` en cada número, y la confirmación por `?ok=…` **leída con `ok === "…"`** en la pantalla de destino (lo exige `tests/arquitectura/confirmacion-que-se-lee.test.ts`, que no se contenta con desestructurar el valor: hay que **pintarlo**).

- [ ] **Paso 5: la ruta nueva, si la hay.** Si se añade cualquier ruta, declararla donde `tests/inventario-de-rutas.test.ts` y `tests/arquitectura/cifras-del-inventario.test.ts` lo exigen, y correr los dos.

- [ ] **Paso 6: los cuatro guardias de pantalla, en una corrida**

```bash
npx vitest run tests/arquitectura/numeros-sin-rueda.test.ts \
  tests/arquitectura/envio-sin-doble-toque.test.ts \
  tests/arquitectura/confirmacion-que-se-lee.test.ts \
  tests/inventario-de-rutas.test.ts; echo "salida=$?"
```

- [ ] **Paso 7: la compuerta entera y el PR**

```bash
npm run verify > /tmp/v.log 2>&1; echo "verify salida=$?"
bash scripts/ci.sh > /tmp/c.log 2>&1; echo "ci salida=$?"
npm run build > /tmp/b.log 2>&1; echo "build salida=$?"
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55433/nectar_ci_rejilla"
bash scripts/ci-con-base.sh > /tmp/cb.log 2>&1; echo "ci-con-base salida=$?"
grep -E 'Test Files|Tests ' /tmp/cb.log | tail -2
```

**Lee la línea `Test Files`, no la de `Tests`.** «2273 passed (2273)» con cuatro suites caídas se lee como verde: mueren en su `afterAll`, después de que sus pruebas pasen. El veredicto está en `Test Files`.

Después: contar lo que lleva el PR por los **dos** caminos que no se cortan en 100 —`--json changedFiles` y `git diff --name-only origin/main...HEAD`—, esperar las **seis** comprobaciones leídas una por una, y el sí de Daniel.

---

## Auto-revisión del plan

**1. Cobertura del spec.** §4.1 → T2. §4.2 → T2, T4. §4.3 → T2, T5. §4.4 → T4. §5.1 → T2 (base) y T3, T5 (mensajes). §5.2 → T5, T6. §5.3 → T6. §6 → T7. §7 (alcance) → ninguna tarea toca la herencia, los `CHECK` de «un solo origen», las celdas materializadas, `trapSpacingMeters`, los permisos en dos niveles ni la vista de finca. §9 (abierto) → el catálogo de `GridOrigin` se cierra en T2 con cuatro valores; **si Daniel quiere otros, es un cambio de una línea del enum y su migración.**

**2. Marcadores.** Cero. El patrón lleva límite de palabra y es sensible a mayúsculas, porque `-i` casa con la palabra española «todo» y eso dio cuatro falsos positivos al revisar el spec. El patrón exacto está en el mensaje del commit y no aquí: escrito en el documento, el escáner **se encuentra a sí mismo** — que es la trampa de la prueba de P-A, la que buscaba su propio texto y se declaraba cerrada.

**3. Consistencia de tipos.** `Rejilla`, `Rango`, `RangoInvalido`, `validarRango`, `celdasDelRango`, `seSolapan`, `celdasEnComun` se definen en T1 y se usan con esos mismos nombres en T2, T3, T4, T5 y T6. `RejillaInvalida` se define en T3 y su rama de `friendlyError` también. `PlotBlockRange` se define en T2 y T5 la consume.

**Un hueco que declaro en vez de esconder:** T5 y T7 llevan sus pasos 1-3 descritos sin el código entero de las pruebas, a diferencia de T1-T4 y T6. Están acotados —sus interfaces y sus guardias están nombrados exactamente— pero quien las ejecute escribirá más de su cosecha ahí. Si eso no vale, se parten en dos planes: T1-T4 y T6 son la mitad que no toca pantalla.
