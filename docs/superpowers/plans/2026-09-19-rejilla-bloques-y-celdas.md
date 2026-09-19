# La rejilla de la parcela y la microparcela como rango — plan de implementación (entrega 1/3)

> **Para quien ejecute este plan:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para llevar la cuenta.

**Objetivo:** dar a la parcela una rejilla (hileras × plantas por hilera, con su origen y sus dos distancias) y hacer que la microparcela se defina como un rango de celdas dentro de esa rejilla — la primera de las tres entregas del spec.

**Arquitectura:** cuatro columnas nuevas de rejilla y cuatro de rango en `core.location` (nunca una tabla nueva: la microparcela ya es una `Location`, F1 §2, y el rango es un atributo suyo, como su `subdivisionReason`). Las reglas de forma del rango (extremos ≥ 1, desde ≤ hasta) son `CHECK` en la misma fila; que el rango quepa en la rejilla de SU PADRE es una regla entre dos filas, así que vive en un disparador — mismo patrón que `exigir_cama_de_secado` (`20260915230000`). El total de celdas y la comparación contra las plantas registradas son funciones puras, nunca una columna: se calculan al leer.

**Stack:** TypeScript, Next.js (App Router), Prisma, PostgreSQL, vitest, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-19-rejilla-bloques-y-celdas-design.md`. Este plan implementa sólo su §7.1 («la rejilla y la microparcela como rango»); al final hay una sección que dice qué queda para las entregas 2 y 3.

**Supuesto sobre la base:** este worktree sale de `origin/main`, y el PR #445 («Parcela en pestañas y ronda de trampas de la finca», rama `vistas-finca-parcela`) todavía no se ha fusionado. Las Tareas 1 a 5 (esquema, funciones puras y servicio) no lo necesitan y se pueden ejecutar ya. Las Tareas 6 y 7 tocan pantallas — `app/plots/[id]/ajustes/page.tsx`, `app/plots/[id]/page.tsx` (pestaña «Trampas y bloques») y `app/plots/[id]/microparcela/nueva/page.tsx` — que el PR #445 reescribe o crea; **cada una lo dice explícitamente y da por hecho que #445 ya está fusionado** cuando se ejecuten.

## Global Constraints

- ADR-080: un valor ausente se muestra con su motivo; una parcela sin rejilla dice «sin rejilla», y celdas contra plantas registradas se muestran como dos cifras con su diferencia, nunca reconciliadas.
- El número total de celdas se calcula, nunca se guarda.
- Las reglas del rango viven en la base como `CHECK`: los extremos ≥ 1, el desde ≤ el hasta, y el rango cabe dentro de la rejilla de su parcela.
- Toda escritura va dentro de `prisma.$transaction`, con `recordAuditEvent` en la misma tx.
- Autorización del lado del servidor con las compuertas existentes; una prueba de rechazo por cada escritura con compuerta.
- Los campos de día van a medianoche UTC; nunca instantes.
- Las pruebas que necesitan base van marcadas `# @grupo: base-sembrada`; las herméticas no.
- Claves de i18n en `es` y en `en`.
- Nada de jsdom: la lógica de cliente va en funciones puras probadas en Node.
- Toda tarea que toque TypeScript corre `npm run typecheck` y `npm run build`, no sólo `vitest`.
- Toda prueba nueva lleva su paso de flip-test.
- Nunca correr la suite completa ni resetear la base de pruebas compartida.

---

## Tarea 1: la rejilla y el rango en la base

**Archivos:**
- Modificar: `prisma/schema.prisma` (modelo `Location`, y un enum nuevo)
- Crear: `prisma/migrations/20260919170000_rejilla_de_la_parcela/migration.sql`
- Crear: `tests/traceability/rejillaDeParcela.test.ts`

**Interfaces:**
- Produce: columnas `core.location.grid_origin` (`GridOrigin?`), `row_count` (`Int?`), `plants_per_row` (`Int?`), `grid_row_spacing_meters` (`Decimal(5,2)?`), `grid_plant_spacing_meters` (`Decimal(5,2)?`), `range_row_from`/`range_row_to`/`range_plant_from`/`range_plant_to` (`Int?` los cuatro). Las Tareas 3, 4 y 5 leen y escriben estas columnas por su nombre de campo Prisma (`gridOrigin`, `rowCount`, `plantsPerRow`, `gridRowSpacingMeters`, `gridPlantSpacingMeters`, `rangeRowFrom`, `rangeRowTo`, `rangePlantFrom`, `rangePlantTo`).
- Produce: el enum `GridOrigin` con los valores `noroeste | noreste | suroeste | sureste`.

### Por qué estos cuatro valores de origen

El spec (§4.1) da dos ejemplos de redacción distinta — «noroeste» y «arriba mirando cuesta abajo» — sin cerrar el catálogo. Ninguno de los dos documentos de arquitectura (`DECISIONS.md`, el spec) fija la lista completa. **Resolución de esta sesión, a falta de que Daniel la cierre:** cuatro esquinas cardinales (`noroeste, noreste, suroeste, sureste`), porque es la lectura más literal de «desde qué esquina se cuenta» y no inventa un segundo eje (pendiente/orientación) que el spec no pide todavía. Si Daniel quiere un catálogo distinto, es un `ALTER TYPE ... ADD VALUE` sin tocar filas existentes.

- [ ] **Paso 1: escribir la prueba de la base, en rojo porque las columnas no existen todavía**

```typescript
/**
 * La rejilla de la parcela y el rango de la microparcela — spec
 * `2026-09-19-rejilla-bloques-y-celdas-design.md` §4.1-4.2.
 *
 * Base real, grupo `base-sembrada`. Cada `it` crea su propio usuario y
 * parcela con los helpers de `tests/helpers/traceability.ts`; la limpieza
 * corre en `afterEach`, nunca al final del cuerpo del `it` (una aserción
 * fallida no debe saltarse el borrado).
 */
import { afterEach, describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/db";
import { crearUsuarioConAcceso, crearParcela } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

let userAccountIds: string[] = [];
let personIds: string[] = [];
let scopeIds: string[] = [];
let locationIds: string[] = [];
let organizationIds: string[] = [];

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  userAccountIds = [];
  personIds = [];
  scopeIds = [];
  locationIds = [];
  organizationIds = [];
});

describe("la rejilla y el rango, reglas de la base", () => {
  it("acepta una rejilla y un rango válidos (control positivo)", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await prisma.location.update({
      where: { id: parcela.id },
      data: { gridOrigin: "noroeste", rowCount: 10, plantsPerRow: 20 },
    });

    const micro = await prisma.location.create({
      data: {
        name: "TEST Microparcela rango válido",
        locationType: "plot",
        parentLocationId: parcela.id,
        organizationId: parcela.organizationId,
        rangeRowFrom: 3,
        rangeRowTo: 6,
        rangePlantFrom: 10,
        rangePlantTo: 15,
      },
    });
    locationIds.push(micro.id);
    expect(micro.rangeRowTo).toBe(6);
  });

  it("rechaza un rowCount menor que 1", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    await expect(
      prisma.location.update({ where: { id: parcela.id }, data: { rowCount: 0 } }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("rechaza un rango a medias (sólo dos de las cuatro esquinas)", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    await expect(
      prisma.location.create({
        data: {
          name: "TEST Microparcela rango a medias",
          locationType: "plot",
          parentLocationId: parcela.id,
          organizationId: parcela.organizationId,
          rangeRowFrom: 1,
          rangeRowTo: 2,
          // rangePlantFrom/rangePlantTo se quedan sin poner.
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("rechaza un rango con el desde mayor que el hasta", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    await prisma.location.update({ where: { id: parcela.id }, data: { rowCount: 10, plantsPerRow: 20 } });
    await expect(
      prisma.location.create({
        data: {
          name: "TEST Microparcela orden invertido",
          locationType: "plot",
          parentLocationId: parcela.id,
          organizationId: parcela.organizationId,
          rangeRowFrom: 6,
          rangeRowTo: 3,
          rangePlantFrom: 1,
          rangePlantTo: 2,
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("rechaza un rango que se sale de la rejilla del padre (disparador)", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    await prisma.location.update({ where: { id: parcela.id }, data: { rowCount: 5, plantsPerRow: 5 } });
    await expect(
      prisma.location.create({
        data: {
          name: "TEST Microparcela fuera de rejilla",
          locationType: "plot",
          parentLocationId: parcela.id,
          organizationId: parcela.organizationId,
          rangeRowFrom: 1,
          rangeRowTo: 6, // la rejilla del padre sólo tiene 5 hileras.
          rangePlantFrom: 1,
          rangePlantTo: 2,
        },
      }),
    ).rejects.toThrow(/no cabe/);
  });

  it("rechaza un rango cuando el padre no tiene rejilla (disparador)", async () => {
    const parcela = await crearParcela(); // sin rowCount/plantsPerRow.
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    await expect(
      prisma.location.create({
        data: {
          name: "TEST Microparcela sin rejilla en el padre",
          locationType: "plot",
          parentLocationId: parcela.id,
          organizationId: parcela.organizationId,
          rangeRowFrom: 1,
          rangeRowTo: 2,
          rangePlantFrom: 1,
          rangePlantTo: 2,
        },
      }),
    ).rejects.toThrow(/no tiene rejilla/);
  });
});
```

- [ ] **Paso 2: correr la prueba y comprobar que falla — TODAS, porque las columnas no existen**

Ejecutar (no la suite completa, sólo este archivo):

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx vitest run tests/traceability/rejillaDeParcela.test.ts
```

Esperado: **FALLA** en las seis, con `Unknown argument 'gridOrigin'` (o equivalente) — Prisma no conoce ninguno de los campos nuevos. Esto es el flip-test de este archivo: falla ahora, sin la migración; pasa después de la Tarea 1, y si alguien revierte la migración vuelve a fallar.

- [ ] **Paso 3: añadir los campos al esquema**

En `prisma/schema.prisma`, dentro del modelo `Location`, inmediatamente después de la línea `plantSpacingMeters Decimal? @map("plant_spacing_meters") @db.Decimal(5, 2)` (línea 851 al medir esto) y antes de `dryingEnvironment`:

```prisma
  // Spec 2026-09-19 rejilla — sólo tiene sentido en una parcela (`plot`),
  // incluida una microparcela (F1 §2: es un `plot` hija de otro `plot`).
  // Catálogo corto y cerrado, nunca texto libre (ADR-080: "sin rejilla" es
  // ausencia franca, no una esquina inventada).
  gridOrigin   GridOrigin? @map("grid_origin")
  rowCount     Int?        @map("row_count")
  plantsPerRow Int?        @map("plants_per_row")
  // Las dos distancias de la rejilla (§4.1), SEPARADAS del `plantSpacingMeters`
  // de arriba: aquella es el marco de siembra general y ya se edita desde
  // "Condiciones" (P1 §3); esta pareja describe la rejilla numerada y sólo
  // tiene sentido junto con `rowCount`/`plantsPerRow`. El prefijo `grid`
  // evita que alguien lea las dos como la misma columna.
  gridRowSpacingMeters   Decimal? @map("grid_row_spacing_meters")   @db.Decimal(5, 2)
  gridPlantSpacingMeters Decimal? @map("grid_plant_spacing_meters") @db.Decimal(5, 2)

  // Spec §4.2 — el rango que ocupa ESTA Location, cuando es una microparcela,
  // dentro de la rejilla de su padre. Las cuatro juntas o ninguna (CHECK en
  // la migración): un rango a medias no describe nada.
  rangeRowFrom   Int? @map("range_row_from")
  rangeRowTo     Int? @map("range_row_to")
  rangePlantFrom Int? @map("range_plant_from")
  rangePlantTo   Int? @map("range_plant_to")
```

Y, en cualquier punto del archivo fuera de un modelo (por ejemplo justo antes de `enum DryingRoomLightExposure`), el enum nuevo:

```prisma
/// Desde qué esquina se numera la rejilla de una parcela — spec 2026-09-19
/// §4.1. Catálogo corto y cerrado: `ALTER TYPE` para añadir un valor si algún
/// día hace falta, nunca texto libre.
enum GridOrigin {
  noroeste
  noreste
  suroeste
  sureste

  @@schema("core")
}
```

- [ ] **Paso 4: generar el esqueleto de la migración y escribir su SQL a mano**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx prisma migrate dev --create-only --name rejilla_de_la_parcela
```

Esto crea `prisma/migrations/<marca>_rejilla_de_la_parcela/migration.sql` con las columnas y el enum. **Renombrar la carpeta a `20260919170000_rejilla_de_la_parcela`** si Prisma generó otra marca de tiempo (para que quede después de `20260919163000_pesada_por_recipiente`, la última existente), y completar el archivo con los `CHECK` y el disparador — Prisma no los genera:

```sql
-- La rejilla de la parcela y el rango de la microparcela — spec
-- 2026-09-19-rejilla-bloques-y-celdas-design.md §4.1-4.2. Entrega 1 de 3.

-- CreateEnum
CREATE TYPE "core"."GridOrigin" AS ENUM ('noroeste', 'noreste', 'suroeste', 'sureste');

-- AlterTable
ALTER TABLE "core"."location"
  ADD COLUMN "grid_origin" "core"."GridOrigin",
  ADD COLUMN "row_count" INTEGER,
  ADD COLUMN "plants_per_row" INTEGER,
  ADD COLUMN "grid_row_spacing_meters" DECIMAL(5,2),
  ADD COLUMN "grid_plant_spacing_meters" DECIMAL(5,2),
  ADD COLUMN "range_row_from" INTEGER,
  ADD COLUMN "range_row_to" INTEGER,
  ADD COLUMN "range_plant_from" INTEGER,
  ADD COLUMN "range_plant_to" INTEGER;

-- La rejilla: ni hileras ni plantas por hilera en cero o negativas.
ALTER TABLE "core"."location"
  ADD CONSTRAINT "location_grid_row_count_positivo" CHECK ("row_count" IS NULL OR "row_count" >= 1),
  ADD CONSTRAINT "location_grid_plants_per_row_positivo" CHECK ("plants_per_row" IS NULL OR "plants_per_row" >= 1);

-- El rango: las cuatro esquinas juntas o ninguna (spec §4.2: "un rango" es
-- una sola unidad, no cuatro números sueltos).
ALTER TABLE "core"."location"
  ADD CONSTRAINT "location_range_completo_o_ausente" CHECK (
    num_nonnulls("range_row_from", "range_row_to", "range_plant_from", "range_plant_to") IN (0, 4)
  ),
  ADD CONSTRAINT "location_range_bounds_positivos" CHECK (
    "range_row_from" IS NULL OR ("range_row_from" >= 1 AND "range_plant_from" >= 1)
  ),
  ADD CONSTRAINT "location_range_orden" CHECK (
    "range_row_from" IS NULL OR ("range_row_from" <= "range_row_to" AND "range_plant_from" <= "range_plant_to")
  );

-- El rango tiene que caber en la rejilla de SU PADRE. Eso cruza dos filas de
-- la misma tabla, y un CHECK no puede mirar otra fila (mismo motivo que
-- "exigir_cama_de_secado", 20260915230000/migration.sql) — así que es un
-- disparador. Sólo corre cuando el rango o el padre cambian.
--
-- LÍMITE CONOCIDO de esta entrega: el disparador vigila la fila de la
-- MICROPARCELA, no la del PADRE. Si alguien ENCOGE la rejilla de una
-- parcela después de que una microparcela ya tenga un rango dentro de la
-- rejilla vieja, esta migración no lo detecta — nadie lo pidió todavía y
-- vigilar "todos los hijos cuando cambia el padre" es una regla nueva, no
-- una consecuencia de ésta. Anotado para cuando se toque de nuevo.
CREATE OR REPLACE FUNCTION "core"."exigir_rango_dentro_de_la_rejilla"()
RETURNS TRIGGER AS $$
DECLARE
  padre_row_count INTEGER;
  padre_plants_per_row INTEGER;
BEGIN
  IF NEW."range_row_from" IS NULL THEN RETURN NEW; END IF;
  IF NEW."parent_location_id" IS NULL THEN
    RAISE EXCEPTION 'Un rango sólo existe en una microparcela, y una microparcela tiene padre';
  END IF;
  SELECT "row_count", "plants_per_row" INTO padre_row_count, padre_plants_per_row
    FROM "core"."location" WHERE "id" = NEW."parent_location_id";
  IF padre_row_count IS NULL OR padre_plants_per_row IS NULL THEN
    RAISE EXCEPTION 'La parcela madre no tiene rejilla: sin rejilla no hay rango que le quepa';
  END IF;
  IF NEW."range_row_to" > padre_row_count OR NEW."range_plant_to" > padre_plants_per_row THEN
    RAISE EXCEPTION 'El rango no cabe en la rejilla de la parcela (% hileras × % plantas)', padre_row_count, padre_plants_per_row;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "location_exigir_rango_dentro_de_la_rejilla"
  BEFORE INSERT OR UPDATE OF "range_row_from", "range_row_to", "range_plant_from", "range_plant_to", "parent_location_id"
  ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_rango_dentro_de_la_rejilla"();
```

- [ ] **Paso 5: aplicar la migración y regenerar el cliente**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx prisma migrate deploy
npx prisma generate
```

- [ ] **Paso 6: correr la prueba de nuevo y comprobar que pasa**

```bash
npx vitest run tests/traceability/rejillaDeParcela.test.ts
```

Esperado: **PASA** en las seis. Si alguna de las cinco de rechazo pasara ANTES de este paso (no debería, ver Paso 2), habría que sospechar del arnés, no del código.

- [ ] **Paso 7: typecheck y build**

```bash
npm run typecheck
npm run build
```

- [ ] **Paso 8: commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260919170000_rejilla_de_la_parcela tests/traceability/rejillaDeParcela.test.ts
git commit -F- <<'EOF'
La rejilla de la parcela y el rango de la microparcela, en la base

Cuatro columnas de rejilla y cuatro de rango en core.location. Los CHECK
cubren la forma del rango (extremos, orden, las cuatro juntas o ninguna);
un disparador cubre que quepa en la rejilla del padre, porque eso cruza dos
filas y un CHECK no puede mirarlo (mismo patrón que exigir_cama_de_secado).

Spec: docs/superpowers/specs/2026-09-19-rejilla-bloques-y-celdas-design.md §4.1-4.2.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Tarea 2: funciones puras de la rejilla y el rango

**Archivos:**
- Crear: `lib/traceability/rejilla.ts`
- Crear: `tests/traceability/rejilla.test.ts`

**Interfaces:**
- Consume: nada (módulo puro, sin Prisma).
- Produce: `totalDeCeldas(rejilla: Rejilla): number | null`, `celdasDelRango(rango: Rango): number`, `validarRango(rango: Rango, rejilla: Rejilla): RazonDeRangoInvalido | null`, `compararCeldasConPlantas(rejilla: Rejilla, cifras: { plantasConocidas: number; cohortesSinConteo: number }): ComparacionCeldas`, y los tipos `Rejilla`, `Rango`, `RazonDeRangoInvalido`, `ComparacionCeldas`. La Tarea 3 usa `compararCeldasConPlantas` y `totalDeCeldas`; la Tarea 4 usa `validarRango`; la Tarea 5 (`getPlotDetail`) usa `compararCeldasConPlantas`; las Tareas 6 y 7 (formularios) usan `celdasDelRango` para la vista previa en el cliente.

- [ ] **Paso 1: escribir las pruebas, en rojo porque el módulo no existe**

```typescript
/**
 * La rejilla de una parcela y el rango de una microparcela — spec
 * `2026-09-19-rejilla-bloques-y-celdas-design.md` §4.1-4.2.
 *
 * Hermética: funciones puras, sin base. No lleva `# @grupo: base-sembrada`.
 */
import { describe, expect, it } from "vitest";
import { totalDeCeldas, celdasDelRango, validarRango, compararCeldasConPlantas } from "../../lib/traceability/rejilla";

describe("totalDeCeldas", () => {
  it("multiplica hileras por plantas por hilera", () => {
    expect(totalDeCeldas({ rowCount: 10, plantsPerRow: 20 })).toBe(200);
  });

  it("sin las dos medidas, no hay total (ADR-080: nunca un cero inventado)", () => {
    expect(totalDeCeldas({ rowCount: null, plantsPerRow: 20 })).toBeNull();
    expect(totalDeCeldas({ rowCount: 10, plantsPerRow: null })).toBeNull();
  });
});

describe("celdasDelRango", () => {
  it("cuenta los dos extremos incluidos", () => {
    expect(celdasDelRango({ rowFrom: 3, rowTo: 6, plantFrom: 10, plantTo: 15 })).toBe(4 * 6);
  });

  it("un rango de una sola celda suma 1", () => {
    expect(celdasDelRango({ rowFrom: 5, rowTo: 5, plantFrom: 5, plantTo: 5 })).toBe(1);
  });
});

describe("validarRango", () => {
  const rejilla = { rowCount: 10, plantsPerRow: 20 };

  it("acepta un rango que cabe (control positivo)", () => {
    expect(validarRango({ rowFrom: 1, rowTo: 10, plantFrom: 1, plantTo: 20 }, rejilla)).toBeNull();
  });

  it("rechaza un extremo menor que 1", () => {
    expect(validarRango({ rowFrom: 0, rowTo: 5, plantFrom: 1, plantTo: 5 }, rejilla)).toBe("bounds");
  });

  it("rechaza el desde mayor que el hasta", () => {
    expect(validarRango({ rowFrom: 6, rowTo: 3, plantFrom: 1, plantTo: 5 }, rejilla)).toBe("orden");
  });

  it("rechaza un rango que se sale de la rejilla", () => {
    expect(validarRango({ rowFrom: 1, rowTo: 11, plantFrom: 1, plantTo: 5 }, rejilla)).toBe("fuera_de_rejilla");
  });

  it("rechaza cualquier rango cuando la parcela no tiene rejilla", () => {
    expect(
      validarRango({ rowFrom: 1, rowTo: 2, plantFrom: 1, plantTo: 2 }, { rowCount: null, plantsPerRow: null }),
    ).toBe("sin_rejilla");
  });
});

describe("compararCeldasConPlantas — ADR-080: nunca se elige entre las dos cifras", () => {
  it("sin rejilla, dice sin_rejilla y no calcula nada", () => {
    const r = compararCeldasConPlantas({ rowCount: null, plantsPerRow: null }, { plantasConocidas: 50, cohortesSinConteo: 0 });
    expect(r).toEqual({ estado: "sin_rejilla", totalCeldas: null, plantasConocidas: 50, cohortesSinConteo: 0, diferencia: null });
  });

  it("con siembras sin conteo, no se puede comparar de verdad", () => {
    const r = compararCeldasConPlantas({ rowCount: 10, plantsPerRow: 20 }, { plantasConocidas: 50, cohortesSinConteo: 2 });
    expect(r.estado).toBe("conteo_incompleto");
    expect(r.totalCeldas).toBe(200);
    expect(r.diferencia).toBeNull();
  });

  it("cuando coinciden, lo dice sin inventar una diferencia", () => {
    const r = compararCeldasConPlantas({ rowCount: 10, plantsPerRow: 20 }, { plantasConocidas: 200, cohortesSinConteo: 0 });
    expect(r).toEqual({ estado: "coincide", totalCeldas: 200, plantasConocidas: 200, cohortesSinConteo: 0, diferencia: 0 });
  });

  it("cuando difieren, enseña las dos cifras y la diferencia, sin corregir ninguna", () => {
    const r = compararCeldasConPlantas({ rowCount: 10, plantsPerRow: 20 }, { plantasConocidas: 150, cohortesSinConteo: 0 });
    expect(r).toEqual({ estado: "difiere", totalCeldas: 200, plantasConocidas: 150, cohortesSinConteo: 0, diferencia: 50 });
  });
});
```

- [ ] **Paso 2: correr las pruebas y comprobar que fallan**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx vitest run tests/traceability/rejilla.test.ts
```

Esperado: FALLA con `Cannot find module '../../lib/traceability/rejilla'`.

- [ ] **Paso 3: escribir el módulo**

```typescript
/**
 * La rejilla de una parcela y el rango de una microparcela dentro de ella —
 * spec `2026-09-19-rejilla-bloques-y-celdas-design.md` §4.1-4.2.
 *
 * Funciones puras, sin Prisma: las usa el servicio (`locations.ts`, antes de
 * escribir) y la pantalla (la vista previa de cuántas celdas suma un rango,
 * antes de guardar nada — constraint del plan: "no jsdom, la lógica de
 * cliente va en funciones puras probadas en Node").
 */

export interface Rejilla {
  rowCount: number | null;
  plantsPerRow: number | null;
}

export interface Rango {
  rowFrom: number;
  rowTo: number;
  plantFrom: number;
  plantTo: number;
}

/** ADR-080: sin las dos medidas, no hay total que calcular — nunca un cero inventado. */
export function totalDeCeldas(rejilla: Rejilla): number | null {
  if (rejilla.rowCount == null || rejilla.plantsPerRow == null) return null;
  return rejilla.rowCount * rejilla.plantsPerRow;
}

/** Los dos extremos incluidos, como el spec los describe («hileras 3 a 6»). */
export function celdasDelRango(rango: Rango): number {
  return (rango.rowTo - rango.rowFrom + 1) * (rango.plantTo - rango.plantFrom + 1);
}

export type RazonDeRangoInvalido = "bounds" | "orden" | "fuera_de_rejilla" | "sin_rejilla";

/**
 * Valida un rango contra la rejilla de su parcela madre, ANTES de escribir —
 * la misma regla que el disparador de la base aplica al guardar (Tarea 1).
 * Esta función es la mitad que puede dar un mensaje amable; el disparador es
 * la red que no depende de que nadie la haya llamado.
 */
export function validarRango(rango: Rango, rejilla: Rejilla): RazonDeRangoInvalido | null {
  if (rango.rowFrom < 1 || rango.plantFrom < 1) return "bounds";
  if (rango.rowFrom > rango.rowTo || rango.plantFrom > rango.plantTo) return "orden";
  if (rejilla.rowCount == null || rejilla.plantsPerRow == null) return "sin_rejilla";
  if (rango.rowTo > rejilla.rowCount || rango.plantTo > rejilla.plantsPerRow) return "fuera_de_rejilla";
  return null;
}

export interface ComparacionCeldas {
  estado: "sin_rejilla" | "conteo_incompleto" | "coincide" | "difiere";
  totalCeldas: number | null;
  plantasConocidas: number;
  cohortesSinConteo: number;
  diferencia: number | null;
}

/**
 * ADR-080: nunca se elige entre las dos cifras ni se corrige una con la
 * otra — se muestran las dos y su diferencia, o se dice por qué no se puede
 * comparar todavía.
 */
export function compararCeldasConPlantas(
  rejilla: Rejilla,
  cifras: { plantasConocidas: number; cohortesSinConteo: number },
): ComparacionCeldas {
  const totalCeldas = totalDeCeldas(rejilla);
  if (totalCeldas == null) {
    return { estado: "sin_rejilla", totalCeldas: null, ...cifras, diferencia: null };
  }
  // Con siembras sin conteo no se sabe cuántas plantas hay en verdad: no se
  // llega a decir "coincide" ni "difiere" sobre un número que no es real.
  if (cifras.cohortesSinConteo > 0) {
    return { estado: "conteo_incompleto", totalCeldas, ...cifras, diferencia: null };
  }
  const diferencia = totalCeldas - cifras.plantasConocidas;
  return { estado: diferencia === 0 ? "coincide" : "difiere", totalCeldas, ...cifras, diferencia };
}
```

- [ ] **Paso 4: correr las pruebas y comprobar que pasan**

```bash
npx vitest run tests/traceability/rejilla.test.ts
```

- [ ] **Paso 5: flip-test — comentar una línea y ver caer la prueba correcta**

Cambiar temporalmente, en `validarRango`, `if (rango.rowFrom > rango.rowTo || ...)` por `if (false)`, correr `npx vitest run tests/traceability/rejilla.test.ts` y comprobar que cae **exactamente** `"rechaza el desde mayor que el hasta"` (y ninguna otra). Deshacer el cambio y correr de nuevo para confirmar que vuelve a pasar.

- [ ] **Paso 6: typecheck y build**

```bash
npm run typecheck
npm run build
```

- [ ] **Paso 7: commit**

```bash
git add lib/traceability/rejilla.ts tests/traceability/rejilla.test.ts
git commit -F- <<'EOF'
Funciones puras de la rejilla: total de celdas, rango y su comparación

totalDeCeldas, celdasDelRango, validarRango y compararCeldasConPlantas, sin
Prisma. El servicio las usa para validar antes de escribir; la pantalla,
para la vista previa del rango antes de guardar nada.

Spec: docs/superpowers/specs/2026-09-19-rejilla-bloques-y-celdas-design.md §4.1-4.2.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Tarea 3: la rejilla en `updateLocationAttributes`

**Archivos:**
- Modificar: `lib/traceability/locations.ts`
- Modificar: `tests/traceability/rejillaDeParcela.test.ts` (añade un `describe`)

**Interfaces:**
- Consume: nada nuevo de otras tareas (usa las columnas de la Tarea 1).
- Produce: `UpdateLocationAttributesInput` gana `gridOrigin?: GridOrigin | null`, `rowCount?: number | null`, `plantsPerRow?: number | null`, `gridRowSpacingMeters?: number | null`, `gridPlantSpacingMeters?: number | null`. `updateLocationAttributes` los persiste. Las Tareas 6 y 7 llaman a esta función a través de una acción nueva.

- [ ] **Paso 1: escribir las pruebas, en rojo porque los campos no existen en el input**

Añadir al final de `tests/traceability/rejillaDeParcela.test.ts` (mismo archivo, mismos `let` de limpieza de la Tarea 1):

```typescript
import { updateLocationAttributes, LocationAccessError, LocationValidationError } from "../../lib/traceability/locations";
import { crearUsuarioSinAcceso } from "../helpers/traceability";
import { recordAuditEvent } from "../../lib/audit";

// (junto a los describe ya existentes en el archivo)

describe("la rejilla en updateLocationAttributes", () => {
  it("guarda origen, hileras, plantas por hilera y las dos distancias", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const actualizada = await updateLocationAttributes(usuario.userAccountId, {
      locationId: parcela.id,
      gridOrigin: "noroeste",
      rowCount: 12,
      plantsPerRow: 30,
      gridRowSpacingMeters: 2.0,
      gridPlantSpacingMeters: 1.8,
    });
    expect(actualizada.gridOrigin).toBe("noroeste");
    expect(actualizada.rowCount).toBe(12);
    expect(actualizada.plantsPerRow).toBe(30);
  });

  it("rechaza rowCount menor que 1 con un mensaje, antes de tocar la base", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, rowCount: 0 }),
    ).rejects.toThrow(LocationValidationError);
  });

  it("rechaza la rejilla sobre una Location que no es una parcela", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!); // parentLocationId es la finca, tipo "site".

    await expect(
      updateLocationAttributes(usuario.userAccountId, { locationId: parcela.parentLocationId!, rowCount: 5 }),
    ).rejects.toThrow(LocationValidationError);
  });

  it("rechaza a quien no tiene acceso a la parcela (compuerta)", async () => {
    const sinAcceso = await crearUsuarioSinAcceso();
    userAccountIds.push(sinAcceso.userAccountId);
    personIds.push(sinAcceso.personId);
    scopeIds.push(sinAcceso.scopeId);
    locationIds.push(sinAcceso.locationId);
    organizationIds.push(sinAcceso.organizationId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      updateLocationAttributes(sinAcceso.userAccountId, { locationId: parcela.id, rowCount: 5 }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("escribe la auditoría en la misma transacción que la rejilla", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, rowCount: 8, plantsPerRow: 8 });
    const eventos = await prisma.auditEvent.findMany({
      where: assertDefinedWhere({ actorUserAccountId: usuario.userAccountId, entityId: parcela.id }),
    });
    expect(eventos.map((e) => e.operation)).toContain("location.update_attributes");
  });
});
```

- [ ] **Paso 2: correr las pruebas y comprobar que fallan**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx vitest run tests/traceability/rejillaDeParcela.test.ts
```

Esperado: FALLA con errores de tipo (`gridOrigin` no existe en `UpdateLocationAttributesInput`) en las que guardan, y la de «no es una parcela» falla porque hoy no hay ninguna comprobación de tipo.

- [ ] **Paso 3: extender `UpdateLocationAttributesInput` y `updateLocationAttributes`**

En `lib/traceability/locations.ts`, el `import type` de la cabecera pasa a incluir `GridOrigin`:

```typescript
import type { Aspect, GridOrigin, LocationType, Prisma, ShadePercentageBracket, SubdivisionReason, SunExposure } from "../../generated/prisma/client";
```

`UpdateLocationAttributesInput` (después de `areaHectares?: number | null;`):

```typescript
export interface UpdateLocationAttributesInput {
  locationId: string;
  sunExposure?: SunExposure | null;
  shadePercentage?: ShadePercentageBracket | null;
  altitudeMinM?: number | null;
  altitudeMaxM?: number | null;
  slopeDescription?: string | null;
  aspect?: Aspect | null;
  soilType?: string | null;
  plantSpacingMeters?: number | null;
  areaHectares?: number | null;
  description?: string | null;
  // Spec 2026-09-19 rejilla §4.1 — sólo válidos sobre una Location `plot`.
  gridOrigin?: GridOrigin | null;
  rowCount?: number | null;
  plantsPerRow?: number | null;
  gridRowSpacingMeters?: number | null;
  gridPlantSpacingMeters?: number | null;
}
```

Dentro de `updateLocationAttributes`, justo después de la comprobación de altitud (`if (nextMin != null && nextMax != null && nextMin > nextMax) { ... }`) y antes de `const before = existing;`:

```typescript
  const nextRowCount = input.rowCount !== undefined ? input.rowCount : existing.rowCount;
  const nextPlantsPerRow = input.plantsPerRow !== undefined ? input.plantsPerRow : existing.plantsPerRow;
  if (nextRowCount != null && nextRowCount < 1) throw new LocationValidationError("row_count_invalido");
  if (nextPlantsPerRow != null && nextPlantsPerRow < 1) throw new LocationValidationError("plants_per_row_invalido");

  // Spec §4.1 — la rejilla es de la parcela, no de cualquier Location. Sólo
  // se comprueba cuando el llamador manda de verdad un campo de rejilla: no
  // rompe las escrituras existentes de sitios/beneficios que sólo tocan
  // altitud o suelo.
  const tocaLaRejilla =
    input.gridOrigin !== undefined ||
    input.rowCount !== undefined ||
    input.plantsPerRow !== undefined ||
    input.gridRowSpacingMeters !== undefined ||
    input.gridPlantSpacingMeters !== undefined;
  if (tocaLaRejilla && existing.locationType !== "plot") {
    throw new LocationValidationError("rejilla_solo_en_parcela");
  }
```

Y dentro del `data:` del `tx.location.update`, después de `...(input.areaHectares !== undefined ? { areaHectares: input.areaHectares } : {}),`:

```typescript
        ...(input.gridOrigin !== undefined ? { gridOrigin: input.gridOrigin } : {}),
        ...(input.rowCount !== undefined ? { rowCount: input.rowCount } : {}),
        ...(input.plantsPerRow !== undefined ? { plantsPerRow: input.plantsPerRow } : {}),
        ...(input.gridRowSpacingMeters !== undefined ? { gridRowSpacingMeters: input.gridRowSpacingMeters } : {}),
        ...(input.gridPlantSpacingMeters !== undefined ? { gridPlantSpacingMeters: input.gridPlantSpacingMeters } : {}),
```

- [ ] **Paso 4: correr las pruebas y comprobar que pasan**

```bash
npx vitest run tests/traceability/rejillaDeParcela.test.ts
```

- [ ] **Paso 5: flip-test — quitar la comprobación de tipo y ver caer la prueba correcta**

Comentar temporalmente el bloque `if (tocaLaRejilla && existing.locationType !== "plot") { throw ... }`, correr la suite del archivo y comprobar que cae **sólo** `"rechaza la rejilla sobre una Location que no es una parcela"`. Restaurar el bloque y volver a correr para confirmar que pasa.

- [ ] **Paso 6: typecheck y build**

```bash
npm run typecheck
npm run build
```

- [ ] **Paso 7: commit**

```bash
git add lib/traceability/locations.ts tests/traceability/rejillaDeParcela.test.ts
git commit -F- <<'EOF'
La rejilla se edita por updateLocationAttributes, sólo sobre una parcela

Cinco campos nuevos en UpdateLocationAttributesInput: origen, hileras,
plantas por hilera y las dos distancias. Misma compuerta y misma
auditoría-en-la-misma-tx que el resto de atributos de Location; rechaza
rowCount/plantsPerRow < 1 y rechaza escribir la rejilla sobre una Location
que no es plot.

Spec: docs/superpowers/specs/2026-09-19-rejilla-bloques-y-celdas-design.md §4.1.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Tarea 4: el rango en `createMicrolot`

**Archivos:**
- Modificar: `lib/traceability/locations.ts`
- Modificar: `tests/traceability/rejillaDeParcela.test.ts` (añade un `describe`)

**Interfaces:**
- Consume: `validarRango` de `lib/traceability/rejilla.ts` (Tarea 2).
- Produce: `CreateMicrolotInput` gana `range?: { rowFrom: number; rowTo: number; plantFrom: number; plantTo: number } | null`. `createMicrolot` lo valida y lo persiste. La Tarea 7 (alta de microparcela) llama a esto a través de `crearMicroparcelaAction`.

- [ ] **Paso 1: escribir las pruebas, en rojo porque `range` no existe en el input**

Añadir al mismo archivo:

```typescript
import { createMicrolot } from "../../lib/traceability/locations";

describe("el rango en createMicrolot", () => {
  it("crea la microparcela con su rango cuando cabe en la rejilla del padre", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, rowCount: 10, plantsPerRow: 20 });

    const micro = await createMicrolot(usuario.userAccountId, {
      parentLocationId: parcela.id,
      name: "TEST Microparcela con rango",
      subdivisionReason: "altitude",
      range: { rowFrom: 3, rowTo: 6, plantFrom: 10, plantTo: 15 },
    });
    locationIds.push(micro.id);
    expect(micro.rangeRowFrom).toBe(3);
    expect(micro.rangePlantTo).toBe(15);
  });

  it("crea la microparcela SIN rango cuando no se manda ninguno (sigue siendo opcional)", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const micro = await createMicrolot(usuario.userAccountId, {
      parentLocationId: parcela.id,
      name: "TEST Microparcela sin rango",
      subdivisionReason: "altitude",
    });
    locationIds.push(micro.id);
    expect(micro.rangeRowFrom).toBeNull();
  });

  it("rechaza un rango que no cabe en la rejilla del padre, con mensaje amable ANTES de la base", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, rowCount: 5, plantsPerRow: 5 });

    await expect(
      createMicrolot(usuario.userAccountId, {
        parentLocationId: parcela.id,
        name: "TEST Microparcela rango fuera",
        subdivisionReason: "altitude",
        range: { rowFrom: 1, rowTo: 6, plantFrom: 1, plantTo: 2 },
      }),
    ).rejects.toThrow(LocationValidationError);
  });

  it("rechaza un rango cuando la parcela madre no tiene rejilla", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      createMicrolot(usuario.userAccountId, {
        parentLocationId: parcela.id,
        name: "TEST Microparcela sin rejilla en el padre",
        subdivisionReason: "altitude",
        range: { rowFrom: 1, rowTo: 2, plantFrom: 1, plantTo: 2 },
      }),
    ).rejects.toThrow(LocationValidationError);
  });
});
```

- [ ] **Paso 2: correr las pruebas y comprobar que fallan**

```bash
npx vitest run tests/traceability/rejillaDeParcela.test.ts
```

Esperado: FALLA por error de tipo (`range` no existe en `CreateMicrolotInput`).

- [ ] **Paso 3: extender `CreateMicrolotInput` y `createMicrolot`**

En `lib/traceability/locations.ts`, el `import` gana `validarRango`:

```typescript
import { validarRango } from "./rejilla";
```

`CreateMicrolotInput`:

```typescript
export interface CreateMicrolotInput {
  parentLocationId: string;
  name: string;
  slug?: string | null;
  subdivisionReason: SubdivisionReason;
  subdivisionReasonNote?: string | null;
  // Spec §4.2 — el rango que ocupa dentro de la rejilla de la parcela madre.
  // Opcional: sin rejilla en la madre, "sin rango" es la única respuesta
  // honesta (ADR-080) — no se inventa uno.
  range?: { rowFrom: number; rowTo: number; plantFrom: number; plantTo: number } | null;
}
```

Dentro de `createMicrolot`, después de las dos comprobaciones de `locationType` (`beneficio_no_se_subdivide` / `secado_no_se_subdivide`) y antes de `const microlot = await prisma.$transaction(...)`:

```typescript
  if (input.range) {
    const razon = validarRango(input.range, { rowCount: parent.rowCount, plantsPerRow: parent.plantsPerRow });
    if (razon) throw new LocationValidationError(`rango_${razon}`);
  }
```

Y dentro del `data:` de `tx.location.create`, después de `subdivisionReasonNote: input.subdivisionReasonNote ?? null,`:

```typescript
        ...(input.range
          ? {
              rangeRowFrom: input.range.rowFrom,
              rangeRowTo: input.range.rowTo,
              rangePlantFrom: input.range.plantFrom,
              rangePlantTo: input.range.plantTo,
            }
          : {}),
```

- [ ] **Paso 4: correr las pruebas y comprobar que pasan**

```bash
npx vitest run tests/traceability/rejillaDeParcela.test.ts
```

- [ ] **Paso 5: flip-test — quitar la validación temprana y ver que la base la sigue cazando, pero con otro mensaje**

Comentar temporalmente el bloque `if (input.range) { ... throw ... }` de `createMicrolot`. Correr la suite del archivo: la prueba «rechaza un rango que no cabe» debe **seguir cayendo** (ahora por el disparador de la Tarea 1, con `Prisma.PrismaClientKnownRequestError` en vez de `LocationValidationError`) — confirma que la Tarea 1 es la red de verdad y la Tarea 4 sólo da un mensaje mejor. Restaurar el bloque.

- [ ] **Paso 6: typecheck y build**

```bash
npm run typecheck
npm run build
```

- [ ] **Paso 7: commit**

```bash
git add lib/traceability/locations.ts tests/traceability/rejillaDeParcela.test.ts
git commit -F- <<'EOF'
createMicrolot acepta el rango de la microparcela, validado antes de escribir

CreateMicrolotInput.range es opcional: sin rejilla en la parcela madre,
"sin rango" es la respuesta honesta. Cuando se manda, validarRango lo
comprueba antes de la transacción para dar un LocationValidationError legible;
el disparador de la base (Tarea 1) sigue siendo la red que no depende de
esta llamada.

Spec: docs/superpowers/specs/2026-09-19-rejilla-bloques-y-celdas-design.md §4.2.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Tarea 5: `getPlotDetail` expone la rejilla, el rango y la comparación

**Archivos:**
- Modificar: `lib/traceability/plantingCohorts.ts`
- Modificar: `tests/traceability/rejillaDeParcela.test.ts` (añade un `describe`)

**Interfaces:**
- Consume: `compararCeldasConPlantas` de `lib/traceability/rejilla.ts` (Tarea 2).
- Produce: `getPlotDetail` devuelve, además de lo existente, `location.gridOrigin`, `location.rowCount`, `location.plantsPerRow`, `location.gridRowSpacingMeters`, `location.gridPlantSpacingMeters`, `location.rangeRowFrom`, `location.rangeRowTo`, `location.rangePlantFrom`, `location.rangePlantTo`, y un campo nuevo `gridComparison: ComparacionCeldas`. Las Tareas 6 y 7 leen esto desde `app/plots/[id]/ajustes/page.tsx` y `app/plots/[id]/microparcela/nueva/page.tsx`.

- [ ] **Paso 1: escribir la prueba, en rojo porque el campo no existe todavía**

Añadir al mismo archivo:

```typescript
import { getPlotDetail } from "../../lib/traceability/plantingCohorts";

describe("getPlotDetail incluye la rejilla y la comparación de celdas", () => {
  it("sin rejilla, dice sin_rejilla", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const detail = await getPlotDetail(usuario.userAccountId, parcela.id);
    expect(detail.gridComparison.estado).toBe("sin_rejilla");
    expect(detail.location.rowCount).toBeNull();
  });

  it("con rejilla y sin siembras, compara contra cero plantas conocidas", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, rowCount: 10, plantsPerRow: 20 });

    const detail = await getPlotDetail(usuario.userAccountId, parcela.id);
    expect(detail.gridComparison).toEqual({
      estado: "difiere",
      totalCeldas: 200,
      plantasConocidas: 0,
      cohortesSinConteo: 0,
      diferencia: 200,
    });
  });
});
```

- [ ] **Paso 2: correr la prueba y comprobar que falla**

```bash
npx vitest run tests/traceability/rejillaDeParcela.test.ts
```

Esperado: FALLA con `detail.gridComparison is undefined`.

- [ ] **Paso 3: extender `getPlotDetail`**

En `lib/traceability/plantingCohorts.ts`, el `import` gana `compararCeldasConPlantas`:

```typescript
import { compararCeldasConPlantas } from "./rejilla";
```

En el `select` del `prisma.location.findUnique` dentro de `getPlotDetail`, después de `description: true,`:

```typescript
      gridOrigin: true,
      rowCount: true,
      plantsPerRow: true,
      gridRowSpacingMeters: true,
      gridPlantSpacingMeters: true,
      rangeRowFrom: true,
      rangeRowTo: true,
      rangePlantFrom: true,
      rangePlantTo: true,
```

Después de `const cohorts = await prisma.plantingCohort.findMany({...});` y antes de `const harvestContributions = ...`:

```typescript
  // Para la comparación de la rejilla (§5): sólo las siembras VIVAS, mismo
  // filtro que computePlotDensity hace internamente.
  const activasParaRejilla = cohorts.filter((c) => c.status === "active");
  const plantasConocidas = activasParaRejilla.reduce((sum, c) => sum + (c.plantCount ?? 0), 0);
  const cohortesSinConteo = activasParaRejilla.filter((c) => c.plantCount == null).length;
```

Y en el objeto que devuelve `getPlotDetail`, después de `density: computePlotDensity(cohorts, location.areaHectares),`:

```typescript
    gridComparison: compararCeldasConPlantas(
      { rowCount: location.rowCount, plantsPerRow: location.plantsPerRow },
      { plantasConocidas, cohortesSinConteo },
    ),
```

- [ ] **Paso 4: correr la prueba y comprobar que pasa**

```bash
npx vitest run tests/traceability/rejillaDeParcela.test.ts
```

- [ ] **Paso 5: flip-test — filtrar mal las siembras y ver caer la prueba correcta**

Cambiar temporalmente `cohorts.filter((c) => c.status === "active")` por `cohorts` (sin filtrar) en la línea de `activasParaRejilla`. Si en ese momento no hay ninguna siembra no-activa en las pruebas, este flip no se nota — así que además, sólo para la duración del flip-test, añadir una siembra `renovated`/`removed` de prueba en el segundo `it` y comprobar que `plantasConocidas` se infla con ella. Restaurar el filtro.

- [ ] **Paso 6: typecheck y build**

```bash
npm run typecheck
npm run build
```

- [ ] **Paso 7: commit**

```bash
git add lib/traceability/plantingCohorts.ts tests/traceability/rejillaDeParcela.test.ts
git commit -F- <<'EOF'
getPlotDetail expone la rejilla, el rango y la comparación de celdas

location.* trae los nueve campos nuevos (rejilla + rango); gridComparison
es el resultado de compararCeldasConPlantas contra las siembras ACTIVAS
de la parcela, mismo filtro que computePlotDensity. Detrás de la misma
compuerta que el resto de getPlotDetail.

Spec: docs/superpowers/specs/2026-09-19-rejilla-bloques-y-celdas-design.md §5.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Tarea 6: pantalla de ajustes — «La rejilla»

**Asume que el PR #445 (`vistas-finca-parcela`, «Parcela en pestañas y ronda de trampas de la finca») ya está fusionado.** Antes de empezar esta tarea, comprobar:

```bash
git log origin/main --oneline | grep -i "pestañas\|vistas-finca-parcela" | head -3
```

Si no aparece nada, `git merge origin/main` primero (o avisar y detenerse: sin #445, `app/plots/[id]/ajustes/page.tsx` no tiene la forma que esta tarea edita).

**Archivos:**
- Crear: `app/components/traceability/RejillaForm.tsx`
- Modificar: `app/actions/traceability.ts`
- Modificar: `app/plots/[id]/ajustes/page.tsx`
- Modificar: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consume: `updateLocationAttributes` (Tarea 3), `detail.gridComparison` y `detail.location.{gridOrigin,rowCount,plantsPerRow,gridRowSpacingMeters,gridPlantSpacingMeters}` (Tarea 5).
- Produce: la acción `actualizarRejillaAction(prevState: TraceabilityActionState, formData: FormData): Promise<TraceabilityActionState>`, y el componente `RejillaForm({ locationId, rejilla, comparacion })`.

No hay paso de vitest en esta tarea (constraint: nada de jsdom, y este repositorio no tiene arnés de render para componentes de servidor). La verificación es typecheck + build + un recorrido manual, como el resto de pantallas de este repositorio que no llevan prueba de UI propia (p. ej. `PlotAttributesForm`).

- [ ] **Paso 1: el componente**

Crear `app/components/traceability/RejillaForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CampoNumerico } from "../CampoNumerico";
import { actualizarRejillaAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";
import type { ComparacionCeldas } from "../../../lib/traceability/rejilla";

const initialState: TraceabilityActionState = {};

const ORIGENES = ["noroeste", "noreste", "suroeste", "sureste"] as const;

export interface RejillaAttributes {
  gridOrigin: string | null;
  rowCount: number | null;
  plantsPerRow: number | null;
  gridRowSpacingMeters: string | null;
  gridPlantSpacingMeters: string | null;
}

/**
 * «La rejilla» de la parcela (spec §4.1, §5). Todo anulable: sin rejilla, la
 * pantalla lo dice, nunca un número inventado (ADR-080).
 */
export function RejillaForm({
  locationId,
  rejilla,
  comparacion,
}: {
  locationId: string;
  rejilla: RejillaAttributes;
  comparacion: ComparacionCeldas;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(actualizarRejillaAction, initialState);

  return (
    <>
      <p className="nn-detail-meta">
        {comparacion.estado === "sin_rejilla"
          ? t("gridNoGrid")
          : comparacion.estado === "conteo_incompleto"
            ? t("gridCellsIncompleteCount", { celdas: comparacion.totalCeldas!, cohorts: comparacion.cohortesSinConteo })
            : comparacion.estado === "coincide"
              ? t("gridCellsMatch", { celdas: comparacion.totalCeldas! })
              : t("gridCellsMismatch", {
                  celdas: comparacion.totalCeldas!,
                  plantas: comparacion.plantasConocidas,
                  diferencia: Math.abs(comparacion.diferencia!),
                })}
      </p>
      <form action={formAction} className="nn-form">
        <input type="hidden" name="locationId" value={locationId} />
        <div className="nn-field">
          <label htmlFor="gridOrigin">{t("gridOriginLabel")}</label>
          <select id="gridOrigin" name="gridOrigin" defaultValue={rejilla.gridOrigin ?? ""}>
            <option value="">{t("notRecorded")}</option>
            {ORIGENES.map((o) => (
              <option key={o} value={o}>
                {t(`gridOrigin_${o}` as "gridOrigin_noroeste")}
              </option>
            ))}
          </select>
        </div>
        <div className="nn-field">
          <label htmlFor="rowCount">{t("gridRowCountLabel")}</label>
          <CampoNumerico
            id="rowCount"
            name="rowCount"
            step="1"
            min="1"
            inputMode="numeric"
            defaultValue={rejilla.rowCount ?? ""}
            placeholder={t("notRecorded")}
          />
        </div>
        <div className="nn-field">
          <label htmlFor="plantsPerRow">{t("gridPlantsPerRowLabel")}</label>
          <CampoNumerico
            id="plantsPerRow"
            name="plantsPerRow"
            step="1"
            min="1"
            inputMode="numeric"
            defaultValue={rejilla.plantsPerRow ?? ""}
            placeholder={t("notRecorded")}
          />
        </div>
        <div className="nn-field">
          <label htmlFor="gridRowSpacingMeters">{t("gridRowSpacingLabel")}</label>
          <CampoNumerico
            id="gridRowSpacingMeters"
            name="gridRowSpacingMeters"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={rejilla.gridRowSpacingMeters ?? ""}
            placeholder={t("notRecorded")}
          />
        </div>
        <div className="nn-field">
          <label htmlFor="gridPlantSpacingMeters">{t("gridPlantSpacingLabel")}</label>
          <CampoNumerico
            id="gridPlantSpacingMeters"
            name="gridPlantSpacingMeters"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={rejilla.gridPlantSpacingMeters ?? ""}
            placeholder={t("notRecorded")}
          />
        </div>
        {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
        <BotonQueNecesitaConexion pending={pending}>{t("gridSaveButton")}</BotonQueNecesitaConexion>
      </form>
    </>
  );
}
```

- [ ] **Paso 2: la acción**

En `app/actions/traceability.ts`, después de `updatePlotAttributesAction` (que termina con `return {};`):

```typescript
/**
 * «La rejilla» de la parcela (spec §4.1, §5). Mismo patrón `PATCH` que
 * updatePlotAttributesAction: cada campo vacío llega como null y borra el
 * valor guardado, nunca deja un cero.
 */
export async function actualizarRejillaAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await updateLocationAttributes(user.userAccountId, {
      locationId,
      gridOrigin: emptyToNull(formData.get("gridOrigin")) as never,
      rowCount: emptyToNullNumber(formData.get("rowCount")),
      plantsPerRow: emptyToNullNumber(formData.get("plantsPerRow")),
      gridRowSpacingMeters: emptyToNullNumber(formData.get("gridRowSpacingMeters")),
      gridPlantSpacingMeters: emptyToNullNumber(formData.get("gridPlantSpacingMeters")),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  return {};
}
```

- [ ] **Paso 3: la pantalla**

En `app/plots/[id]/ajustes/page.tsx` (tal como queda tras el PR #445), añadir el `import`:

```typescript
import { RejillaForm } from "../../../components/traceability/RejillaForm";
```

Y una sección nueva, justo después de la sección `id="condiciones"` (`<PlotAttributesForm .../>` seguido de `</section>`):

```tsx
      <section className="nn-section" id="rejilla">
        <h2>{t("gridHeading")}</h2>
        <RejillaForm
          locationId={location.id}
          rejilla={{
            gridOrigin: location.gridOrigin,
            rowCount: location.rowCount,
            plantsPerRow: location.plantsPerRow,
            gridRowSpacingMeters: location.gridRowSpacingMeters?.toString() ?? null,
            gridPlantSpacingMeters: location.gridPlantSpacingMeters?.toString() ?? null,
          }}
          comparacion={detail.gridComparison}
        />
      </section>
```

(`detail` ya está en el alcance de la función — es el mismo objeto del que la página desestructura `location`.)

- [ ] **Paso 4: las claves de i18n**

En `messages/es.json`, dentro de `"Traceability"`, inmediatamente después de la línea `"plotAttributesIntro": "..."`:

```json
    "gridHeading": "La rejilla",
    "gridOriginLabel": "Desde qué esquina se cuenta",
    "gridOrigin_noroeste": "Noroeste",
    "gridOrigin_noreste": "Noreste",
    "gridOrigin_suroeste": "Suroeste",
    "gridOrigin_sureste": "Sureste",
    "gridRowCountLabel": "Hileras",
    "gridPlantsPerRowLabel": "Plantas por hilera",
    "gridRowSpacingLabel": "Distancia entre hileras (m)",
    "gridPlantSpacingLabel": "Distancia entre plantas en la hilera (m)",
    "gridSaveButton": "Guardar la rejilla",
    "gridNoGrid": "Esta parcela no tiene rejilla registrada.",
    "gridCellsMatch": "{celdas} celdas, tantas como las plantas registradas.",
    "gridCellsMismatch": "{celdas} celdas calculadas, {plantas} plantas registradas — difieren en {diferencia}.",
    "gridCellsIncompleteCount": "{celdas} celdas calculadas; no se puede comparar porque {cohorts} siembras no tienen conteo.",
```

En `messages/en.json`, en el mismo punto (línea 755, `"plotAttributesIntro"`):

```json
    "gridHeading": "The grid",
    "gridOriginLabel": "Which corner it's counted from",
    "gridOrigin_noroeste": "Northwest",
    "gridOrigin_noreste": "Northeast",
    "gridOrigin_suroeste": "Southwest",
    "gridOrigin_sureste": "Southeast",
    "gridRowCountLabel": "Rows",
    "gridPlantsPerRowLabel": "Plants per row",
    "gridRowSpacingLabel": "Distance between rows (m)",
    "gridPlantSpacingLabel": "Distance between plants in a row (m)",
    "gridSaveButton": "Save the grid",
    "gridNoGrid": "This plot has no grid on record.",
    "gridCellsMatch": "{celdas} cells, matching the recorded plants.",
    "gridCellsMismatch": "{celdas} calculated cells, {plantas} recorded plants — off by {diferencia}.",
    "gridCellsIncompleteCount": "{celdas} calculated cells; cannot compare because {cohorts} plantings have no count.",
```

- [ ] **Paso 5: typecheck y build**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm run typecheck
npm run build
```

- [ ] **Paso 6: recorrido manual**

```bash
npm run dev:local
```

Abrir `/plots/<id>/ajustes` de una parcela con siembras. Comprobar: (a) sin rejilla, la sección dice «sin rejilla»; (b) guardar hileras/plantas por hilera muestra el total calculado y, si no coincide con las plantas registradas, las dos cifras y su diferencia — nunca una corrigiendo a la otra; (c) vaciar un campo y guardar lo deja «Sin registrar», no en cero.

- [ ] **Paso 7: commit**

```bash
git add app/components/traceability/RejillaForm.tsx app/actions/traceability.ts app/plots/\[id\]/ajustes/page.tsx messages/es.json messages/en.json
git commit -F- <<'EOF'
Ajustes de la parcela gana «La rejilla»

Sección nueva: origen, hileras, plantas por hilera y las dos distancias.
Al guardar muestra el total de celdas y lo compara con las plantas de las
siembras activas — dos cifras y su diferencia, nunca una corrigiendo a la
otra (ADR-080). Asume el PR #445 (parcela en pestañas) ya fusionado.

Spec: docs/superpowers/specs/2026-09-19-rejilla-bloques-y-celdas-design.md §5.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Tarea 7: alta de microparcela — el rango

**Asume igual que la Tarea 6 que el PR #445 ya está fusionado** (esta pantalla, `app/plots/[id]/microparcela/nueva/page.tsx`, la crea ese PR).

**Archivos:**
- Modificar: `app/components/traceability/NuevaMicroparcelaForm.tsx`
- Modificar: `app/actions/fincas.ts`
- Modificar: `app/plots/[id]/microparcela/nueva/page.tsx`
- Modificar: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consume: `createMicrolot` con `range` (Tarea 4), `celdasDelRango` de `lib/traceability/rejilla.ts` (Tarea 2), `detail.location.{rowCount,plantsPerRow}` (Tarea 5).
- Produce: `NuevaMicroparcelaForm` gana la prop `rejilla: { rowCount: number | null; plantsPerRow: number | null }`.

- [ ] **Paso 1: el formulario**

Reescribir `app/components/traceability/NuevaMicroparcelaForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { crearMicroparcelaAction, type FincasActionState } from "../../actions/fincas";
import { MOTIVOS_DE_SUBDIVISION } from "../../../lib/traceability/motivosDeSubdivision";
import { celdasDelRango } from "../../../lib/traceability/rejilla";

const inicial: FincasActionState = {};

/**
 * Una microparcela dentro de esta parcela (spec fincas y parcelas §3.3): un
 * pedazo que se maneja aparte por altitud, sombra, pendiente u otro motivo.
 *
 * Spec 2026-09-19 rejilla §4.2 — si la parcela madre tiene rejilla, se puede
 * escribir el rango que ocupa (hileras y plantas, los dos extremos
 * incluidos); sin rejilla en la madre no hay nada que rellenar, y el
 * formulario lo dice en vez de ofrecer cuatro casillas que no van a caber en
 * ningún lado.
 */
export function NuevaMicroparcelaForm({
  parentLocationId,
  rejilla,
}: {
  parentLocationId: string;
  rejilla: { rowCount: number | null; plantsPerRow: number | null };
}) {
  const t = useTranslations("Fincas");
  const [state, formAction, pending] = useActionState(crearMicroparcelaAction, inicial);
  const [rango, setRango] = useState<{ rowFrom: string; rowTo: string; plantFrom: string; plantTo: string }>({
    rowFrom: "",
    rowTo: "",
    plantFrom: "",
    plantTo: "",
  });

  const tieneRejilla = rejilla.rowCount != null && rejilla.plantsPerRow != null;
  const numeros = {
    rowFrom: Number(rango.rowFrom),
    rowTo: Number(rango.rowTo),
    plantFrom: Number(rango.plantFrom),
    plantTo: Number(rango.plantTo),
  };
  const rangoCompleto = Object.values(rango).every((v) => v.trim() !== "");
  const celdas = rangoCompleto ? celdasDelRango(numeros) : null;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="parentLocationId" value={parentLocationId} />
      <div className="nn-field">
        <label htmlFor="micro-nombre">{t("nombreMicroparcela")}</label>
        <input id="micro-nombre" name="nombre" type="text" required maxLength={120} />
      </div>
      <div className="nn-field">
        <label htmlFor="micro-motivo">{t("motivo")}</label>
        <select id="micro-motivo" name="motivo" required defaultValue="">
          <option value="" disabled />
          {MOTIVOS_DE_SUBDIVISION.map((m) => (
            <option key={m} value={m}>
              {t(`motivo_${m}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="micro-nota">{t("motivoNota")}</label>
        <input id="micro-nota" name="nota" type="text" />
      </div>

      {tieneRejilla ? (
        <fieldset className="nn-field">
          <legend>{t("rangoTitulo")}</legend>
          <div className="nn-field">
            <label htmlFor="rangeRowFrom">{t("rangoHileraDesde")}</label>
            <input
              id="rangeRowFrom"
              name="rangeRowFrom"
              type="number"
              min={1}
              max={rejilla.rowCount ?? undefined}
              value={rango.rowFrom}
              onChange={(e) => setRango((r) => ({ ...r, rowFrom: e.target.value }))}
            />
          </div>
          <div className="nn-field">
            <label htmlFor="rangeRowTo">{t("rangoHileraHasta")}</label>
            <input
              id="rangeRowTo"
              name="rangeRowTo"
              type="number"
              min={1}
              max={rejilla.rowCount ?? undefined}
              value={rango.rowTo}
              onChange={(e) => setRango((r) => ({ ...r, rowTo: e.target.value }))}
            />
          </div>
          <div className="nn-field">
            <label htmlFor="rangePlantFrom">{t("rangoPlantaDesde")}</label>
            <input
              id="rangePlantFrom"
              name="rangePlantFrom"
              type="number"
              min={1}
              max={rejilla.plantsPerRow ?? undefined}
              value={rango.plantFrom}
              onChange={(e) => setRango((r) => ({ ...r, plantFrom: e.target.value }))}
            />
          </div>
          <div className="nn-field">
            <label htmlFor="rangePlantTo">{t("rangoPlantaHasta")}</label>
            <input
              id="rangePlantTo"
              name="rangePlantTo"
              type="number"
              min={1}
              max={rejilla.plantsPerRow ?? undefined}
              value={rango.plantTo}
              onChange={(e) => setRango((r) => ({ ...r, plantTo: e.target.value }))}
            />
          </div>
          {celdas != null ? <p className="nn-detail-meta">{t("rangoCeldas", { n: celdas })}</p> : null}
        </fieldset>
      ) : (
        <p className="nn-muted">{t("rangoSinRejilla")}</p>
      )}

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("microparcelaCreada")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("crearMicroparcelaBoton")}</button>
    </form>
  );
}
```

- [ ] **Paso 2: la acción**

En `app/actions/fincas.ts`, extender `CODIGOS_CON_MENSAJE`:

```typescript
const CODIGOS_CON_MENSAJE = [
  "nombre_invalido", "nombre_repetido", "name_required", "ya_tiene_terreno", "organizacion_no_es_finca",
  "padre_no_es_una_finca", "area_invalida", "tipo_invalido", "motivo_invalido", "otro_sin_nota", "sin_permiso",
  "rango_incompleto", "rango_bounds", "rango_orden", "rango_fuera_de_rejilla", "rango_sin_rejilla",
] as const;
```

Y `crearMicroparcelaAction`, reemplazando la llamada a `createMicrolot`:

```typescript
export async function crearMicroparcelaAction(_prev: FincasActionState, formData: FormData): Promise<FincasActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parentLocationId = String(formData.get("parentLocationId") ?? "");
  const motivo = String(formData.get("motivo") ?? "");
  if (!(MOTIVOS_DE_SUBDIVISION as readonly string[]).includes(motivo)) return traducir(new FincaError("motivo_invalido"));
  const nota = String(formData.get("nota") ?? "").trim() || null;
  if (motivo === "other" && !nota) return traducir(new FincaError("otro_sin_nota"));

  // Spec §4.2 — las cuatro esquinas juntas o ninguna: un rango a medias no
  // describe nada (misma regla que el CHECK de la base).
  const crudos = ["rangeRowFrom", "rangeRowTo", "rangePlantFrom", "rangePlantTo"].map((campo) =>
    String(formData.get(campo) ?? "").trim(),
  );
  const algunoLleno = crudos.some((v) => v !== "");
  const todosLlenos = crudos.every((v) => v !== "");
  if (algunoLleno && !todosLlenos) return traducir(new FincaError("rango_incompleto"));
  const range = todosLlenos
    ? {
        rowFrom: Number(crudos[0]),
        rowTo: Number(crudos[1]),
        plantFrom: Number(crudos[2]),
        plantTo: Number(crudos[3]),
      }
    : null;

  try {
    await createMicrolot(user.userAccountId, {
      parentLocationId,
      name: String(formData.get("nombre") ?? ""),
      subdivisionReason: motivo as (typeof MOTIVOS_DE_SUBDIVISION)[number],
      subdivisionReasonNote: nota,
      range,
    });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath(`/plots/${parentLocationId}`);
  revalidatePath("/plots");
  return { ok: true };
}
```

Y `traducir`, para que `rango_<razon>` (el prefijo que pone `createMicrolot`, Tarea 4) mapee al código correcto: como `error.message` ya llega con el prefijo `rango_` puesto por `createMicrolot` (`rango_bounds`, `rango_orden`, `rango_fuera_de_rejilla`, `rango_sin_rejilla`), no hace falta ningún cambio en `traducir` — `CODIGOS_CON_MENSAJE` ya los tiene listados arriba y `LocationValidationError` ya está en la lista de clases que `traducir` reconoce.

- [ ] **Paso 3: la pantalla**

En `app/plots/[id]/microparcela/nueva/page.tsx`, cambiar la última línea:

```tsx
      <NuevaMicroparcelaForm
        parentLocationId={id}
        rejilla={{ rowCount: detail.location.rowCount, plantsPerRow: detail.location.plantsPerRow }}
      />
```

- [ ] **Paso 4: las claves de i18n**

En `messages/es.json`, dentro de `"Fincas"`, después de `"crearMicroparcelaBoton": "Crear microparcela",` (línea 2829):

```json
    "rangoTitulo": "El rango dentro de la rejilla",
    "rangoHileraDesde": "Hilera desde",
    "rangoHileraHasta": "Hilera hasta",
    "rangoPlantaDesde": "Planta desde",
    "rangoPlantaHasta": "Planta hasta",
    "rangoCeldas": "Este rango suma {n} celdas.",
    "rangoSinRejilla": "Esta parcela no tiene rejilla registrada, así que la microparcela se crea sin rango.",
```

Y después de `"error_otro_sin_nota": "Si el motivo es «otro», escribe cuál.",` (línea 2846):

```json
    "error_rango_incompleto": "El rango necesita las cuatro casillas, o ninguna.",
    "error_rango_bounds": "Hilera y planta empiezan en 1 como mínimo.",
    "error_rango_orden": "El «desde» no puede ser mayor que el «hasta».",
    "error_rango_fuera_de_rejilla": "Ese rango no cabe en la rejilla de la parcela.",
    "error_rango_sin_rejilla": "Esta parcela no tiene rejilla: no se le puede dar un rango.",
```

En `messages/en.json`, mismos puntos de inserción (líneas 2829 y 2846):

```json
    "rangoTitulo": "The range within the grid",
    "rangoHileraDesde": "Row from",
    "rangoHileraHasta": "Row to",
    "rangoPlantaDesde": "Plant from",
    "rangoPlantaHasta": "Plant to",
    "rangoCeldas": "This range adds up to {n} cells.",
    "rangoSinRejilla": "This plot has no grid on record, so the micro-plot is created without a range.",
```

```json
    "error_rango_incompleto": "The range needs all four boxes, or none.",
    "error_rango_bounds": "Row and plant start at 1 at the least.",
    "error_rango_orden": "The \"from\" cannot be greater than the \"to\".",
    "error_rango_fuera_de_rejilla": "That range does not fit in the plot's grid.",
    "error_rango_sin_rejilla": "This plot has no grid: it cannot be given a range.",
```

- [ ] **Paso 5: typecheck y build**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm run typecheck
npm run build
```

- [ ] **Paso 6: recorrido manual**

```bash
npm run dev:local
```

Abrir `/plots/<id>/microparcela/nueva` de una parcela CON rejilla: comprobar que aparecen las cuatro casillas, que la vista previa de celdas se actualiza al escribir, y que un rango fuera de la rejilla lo rechaza al guardar con el mensaje correcto. Repetir sobre una parcela SIN rejilla: comprobar que sólo aparece el aviso `rangoSinRejilla` y que la microparcela se crea sin rango.

- [ ] **Paso 7: commit**

```bash
git add app/components/traceability/NuevaMicroparcelaForm.tsx app/actions/fincas.ts app/plots/\[id\]/microparcela/nueva/page.tsx messages/es.json messages/en.json
git commit -F- <<'EOF'
Alta de microparcela: el rango dentro de la rejilla de la parcela madre

El formulario ofrece las cuatro casillas del rango sólo si la parcela madre
tiene rejilla, con una vista previa de cuántas celdas suma. Sin rejilla en
la madre, se crea sin rango (ADR-080: no se inventa uno). Asume el PR #445
(parcela en pestañas) ya fusionado.

Spec: docs/superpowers/specs/2026-09-19-rejilla-bloques-y-celdas-design.md §4.2, §5.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Qué queda para las entregas 2 y 3

Este plan cubre sólo el spec §7.1. Lo que sigue, para un plan aparte cuando llegue su turno:

**Entrega 2 — bloques por rango, con trampas y su cobertura (spec §4.2 segunda mitad, §4.4, §5).**
- `PlotBlock` gana uno o varios rangos (tabla `PlotBlockRange`, porque un bloque puede tener varios — a diferencia de la microparcela, que tiene uno solo).
- Al dar de alta un bloque o una microparcela, la pantalla dice con qué otros bloques se solapa (spec §5: "debajo aparecen cuántas celdas suma y con qué otros bloques se solapa").
- La trampa propone su rango de cobertura a partir de `trapSpacingMeters`/`plantsPerTrap` (que este plan NO agrega a `Location` — son de la entrega 2, no de la 1) y guarda el rango real, no la regla.
- La pestaña «Trampas y bloques» (`app/plots/[id]/page.tsx`, tras el PR #445) muestra cuántas plantas cubre cada trampa y el rango de cada bloque.
- La casilla «de seguimiento» de un bloque avisa de cuántas celdas va a crear, antes de crearlas (entra de lleno con la Entrega 3).

**Entrega 3 — celdas materializadas, alcance de las aplicaciones y el biochar con noria, carga y receta (spec §4.3, §4.5, §4.6).**
- Materializar un bloque de seguimiento: cada celda de su rango pasa a ser un `Specimen` de tipo planta, con su `(hilera, planta)`. Desmarcar el seguimiento no borra las ya creadas.
- Toda aplicación (manejo, biochar, riego) guarda su alcance (parcela, microparcela, bloque o celdas) y, en los bloques de seguimiento, además celda por celda.
- `BiocharRecipe`, `Noria`, `BiocharCharge`, `BiocharApplication` — el modelo completo del §4.6, con la comparación por receta calculada sumando cargas de distintas norias.
- La ficha de la celda, sólo para las materializadas.

Cada una de las tres entregas termina, por instrucción del spec (§7), con un recorrido en el navegador con Daniel — el de esta entrega es el Paso 6 de las Tareas 6 y 7 repetido de punta a punta sobre una parcela real.
