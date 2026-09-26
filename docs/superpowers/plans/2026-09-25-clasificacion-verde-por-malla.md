# Las tres lecturas de la clasificación de verde por malla — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar las tres lecturas que Daniel pidió sobre la clasificación de café verde por malla — reparto por malla, defectos agrupados por categoría, y comparación entre lotes — sin tocar la escritura, que ya está en producción.

**Architecture:** Un módulo de lectura nuevo (`lib/traceability/clasificacionVerde.ts`) con dos funciones puras de consulta sobre Prisma; un componente de servidor que sustituye al bloque genérico de cuajado en la ficha de un lote verde; y una pantalla nueva para la comparación. `lib/traceability/selection.ts` no se toca.

**Tech Stack:** Next.js (App Router, componentes de servidor), Prisma 7 sobre Postgres, vitest con base real, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-25-clasificacion-verde-por-malla-design.md`

## Global Constraints

- **Node no está en el PATH.** Antes de cualquier `npm`/`npx`: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`
- **Tras `npm ci`, `npx prisma generate` SIEMPRE.** Medido el 2026-09-25 en este worktree: sin generar, `npm run verify` da **1.916 errores TS y exit 2 sobre el árbol limpio**; con el cliente generado, **0 errores y exit 0**. Quien no lo haga leerá una base rota como si la hubiera roto él.
- **Base de pruebas:** `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test_verde` (y su `_shadow`). Comprobado que ya tiene `green_screen_min/max/system/status`, `green_grade_note` y `green_uniformity_pct`. **No se resetea la compartida `nectar_test` de 55433.**
- **Ninguna compuerta se lee canalizada.** Se redirige a archivo y se lee el código de salida: `npm run verify > /tmp/v.txt 2>&1; echo $?`. Una tubería devuelve el estado del ÚLTIMO comando.
- **Nada de `git add -A`.** Archivo por archivo, y `git diff --cached --stat` antes de commitear: si creías escenificar dos y salen nueve, parar.
- **Commitear antes de mutar** en cualquier flip-test: el arnés restaura desde HEAD y se lleva lo no commiteado.
- Vocabulario de malla cerrado en `lib/traceability/vocabularioDeMalla.ts`: `redonda_internacional`, `plana_oblonga`, `otro`. **No se inventan valores nuevos.**
- `lib/traceability/clasificacionVerde.ts` **no puede importarse desde un componente de cliente**: importa `prisma`. Lo vigila `tests/arquitectura/cliente-sin-prisma.test.ts`.

---

### Task 1: El módulo de lectura

**Files:**
- Create: `lib/traceability/clasificacionVerde.ts`
- Create: `tests/traceability/clasificacionVerde.test.ts`
- Modify: `docs/arquitectura/acceso-a-datos.allowlist.json`

**Interfaces:**
- Consumes: `prisma` (`lib/db`); `LIST_LIMIT`, `truncate` (`lib/listLimit`); `requireLotAccess`, `resolveLotVisibility`, `lotWhereFromVisibility`, `TraceabilityAccessError` (`lib/traceability/lots`).
- Produces, y las tareas 2 y 3 dependen de estos nombres exactos:
  - `clasificacionDeLote(userAccountId: string, lotId: string): Promise<ClasificacionDeLote | null>`
  - `compararClasificacionVerde(userAccountId: string): Promise<ComparacionDeClasificacion>`
  - `peorEstado(estados: readonly GreenScreenDataStatus[]): GreenScreenDataStatus | null`
  - `claveDeColumna(sistema: string | null, min: number | null, max: number | null): string`
  - Tipos `FraccionDeMalla`, `DefectoAgrupado`, `ClasificacionDeLote`, `ColumnaDeMalla`, `FilaDeComparacion`, `ComparacionDeClasificacion`.

**AVISO sobre las pruebas de la comparación.** `crearUsuarioConAcceso()` (`tests/helpers/traceability.ts`) crea un **Platform Admin con ámbito de plataforma**, así que `resolveLotVisibility` devuelve `mode: "all"` y la comparación verá **todos** los lotes verdes de la base, no sólo los del test. **Las aserciones van por código de lote, nunca por número de filas ni por `sinClasificar` exacto.** Una aserción de conteo se vuelve intermitente en cuanto otro test siembra un lote verde, y el arreglo fácil es debilitarla hasta que no compruebe nada.

- [ ] **Step 1: Escribir el módulo con las firmas y los tipos, sin lógica todavía**

No es un placeholder: es el contrato que las tareas 2 y 3 importan, y escribirlo primero hace que el test del paso 2 falle por el motivo correcto (devuelve `null`) y no por «módulo no encontrado».

Crear `lib/traceability/clasificacionVerde.ts`:

```ts
/**
 * Las tres lecturas de la clasificación de café verde por malla (Daniel, 2026-09-25).
 *
 * **Sólo lectura.** La escritura es `recordGreenGrading` (greenGrading.ts, ADR-186) y ya está en
 * producción. `selection.ts` no se toca: «aceptado / rechazado» es el vocabulario de la selección
 * de cereza y no significa nada en una clasificación por tamaño.
 *
 * **Los porcentajes se calculan, nunca se guardan** — la misma regla que ya lleva escrita
 * `getSelectionOutturn`: guardar una cantidad y su porcentaje invita a que discrepen.
 */
import type { GreenScreenDataStatus, Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { LIST_LIMIT, truncate } from "../listLimit";
import {
  lotWhereFromVisibility,
  requireLotAccess,
  resolveLotVisibility,
  TraceabilityAccessError,
} from "./lots";

export interface FraccionDeMalla {
  lotId: string;
  lotCode: string;
  rangoMin: number | null;
  rangoMax: number | null;
  sistema: string | null;
  estado: GreenScreenDataStatus;
  uniformidadPct: number | null;
  nota: string | null;
  kg: number;
  pct: number | null;
  /** Los DOS extremos nulos. Un `17–?` no es «sin rango»: se ordena por el 17. */
  sinRango: boolean;
}

export interface DefectoAgrupado {
  categoriaValueId: string;
  categoria: string | null;
  kg: number;
  pct: number | null;
  lotes: { lotId: string; lotCode: string; kg: number }[];
}

export interface ClasificacionDeLote {
  transformationId: string;
  clasificadoEl: Date;
  entradaKg: number;
  mallas: FraccionDeMalla[];
  defectos: DefectoAgrupado[];
  mermaDeclaradaKg: number | null;
  noExplicadoKg: number | null;
  estadoDelDato: GreenScreenDataStatus | null;
}

export interface ColumnaDeMalla {
  clave: string;
  sistema: string | null;
  rangoMin: number | null;
  rangoMax: number | null;
  sinRango: boolean;
}

export interface FilaDeComparacion {
  lotId: string;
  lotCode: string;
  clasificadoEl: Date;
  entradaKg: number;
  /** clave de columna → % de la entrada. Clave ausente = ese lote no tiene esa malla. */
  repartoPct: Record<string, number | null>;
  defectosPct: number | null;
  estadoDelDato: GreenScreenDataStatus | null;
}

export interface ComparacionDeClasificacion {
  columnas: ColumnaDeMalla[];
  filas: FilaDeComparacion[];
  /** Lotes verdes visibles SIN clasificación. Que no salgan no significa que no existan. */
  sinClasificar: number;
  /** `true` = esta cuenta no puede ver ningún lote. Distinto de «no hay lotes». */
  sinAmbito: boolean;
  truncado: boolean;
  limite: number;
}

/** `measured` es el mejor dato y `unknown` el peor. */
const RANGO_DE_ESTADO: Record<GreenScreenDataStatus, number> = {
  measured: 3,
  supplier_declared: 2,
  qualitative: 1,
  unknown: 0,
};

/**
 * El PEOR de los estados presentes. Un lote cuyo 17/18 pesó la finca y cuyo 15/16 dijo el
 * proveedor no puede presentarse como medido (decisión de Daniel, 2026-09-25).
 */
export function peorEstado(estados: readonly GreenScreenDataStatus[]): GreenScreenDataStatus | null {
  if (estados.length === 0) return null;
  return estados.reduce((peor, e) => (RANGO_DE_ESTADO[e] < RANGO_DE_ESTADO[peor] ? e : peor));
}

/**
 * La identidad de una columna de la tabla comparativa es la terna (sistema, min, max): un 17/18 de
 * malla redonda internacional y un 17/18 de plana oblonga **no** son la misma columna.
 */
export function claveDeColumna(sistema: string | null, min: number | null, max: number | null): string {
  if (min == null && max == null) return "sin-malla";
  return `${sistema ?? "sin-sistema"}:${min ?? "?"}-${max ?? "?"}`;
}

export async function clasificacionDeLote(
  _userAccountId: string,
  _lotId: string,
): Promise<ClasificacionDeLote | null> {
  return null;
}

export async function compararClasificacionVerde(
  _userAccountId: string,
): Promise<ComparacionDeClasificacion> {
  return { columnas: [], filas: [], sinClasificar: 0, sinAmbito: false, truncado: false, limite: LIST_LIMIT };
}
```

- [ ] **Step 2: Escribir las seis pruebas, que deben fallar**

Crear `tests/traceability/clasificacionVerde.test.ts`:

```ts
/**
 * Las tres lecturas de la clasificación de verde por malla (spec del 2026-09-25).
 *
 * **Por qué la primera prueba existe:** hasta hoy ningún test cruzaba `recordGreenGrading` con
 * ninguna capa de lectura. Que la ficha pintara algo era lectura de código, no un hecho medido.
 *
 * **Aserciones por código de lote, nunca por conteo.** `crearUsuarioConAcceso()` da un Platform
 * Admin de ámbito plataforma, así que la comparación ve TODOS los lotes verdes de la base.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot } from "../../lib/traceability/lots";
import { recordQuantityEvent } from "../../lib/traceability/quantity";
import { recordGreenGrading } from "../../lib/traceability/greenGrading";
import { recordSelection } from "../../lib/traceability/selection";
import {
  clasificacionDeLote,
  compararClasificacionVerde,
  claveDeColumna,
  peorEstado,
} from "../../lib/traceability/clasificacionVerde";
import { crearUsuarioConAcceso, crearUsuarioSinAcceso } from "../helpers/traceability";

const RUN = `cv-${Date.now()}`;

let userAccountId: string;
let organizationId: string;
let projectId: string;
let locationId: string;
let brocaId: string;
let flotadoresId: string;

async function catalogValue(value: string, catalogKey: string) {
  const row = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value, catalog: { key: catalogKey } },
  });
  return row.id;
}

async function loteVerde(code: string, kg: number) {
  const lot = await createLot(userAccountId, {
    lotCode: `${RUN}-${code}`, lotType: "green", organizationId, projectId, locationId,
  });
  await recordQuantityEvent(userAccountId, {
    lotId: lot.id, eventType: "received", quantity: kg, unit: "kg",
    occurredAt: new Date(), provenanceClass: "measured_fact",
  });
  return lot;
}

async function loteCereza(code: string, kg: number) {
  const lot = await createLot(userAccountId, {
    lotCode: `${RUN}-${code}`, lotType: "cherry", organizationId, projectId, locationId,
  });
  await recordQuantityEvent(userAccountId, {
    lotId: lot.id, eventType: "received", quantity: kg, unit: "kg",
    occurredAt: new Date(), provenanceClass: "measured_fact",
  });
  return lot;
}

beforeAll(async () => {
  const usuario = await crearUsuarioConAcceso();
  userAccountId = usuario.userAccountId;

  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;
  const project = await prisma.project.create({
    data: { name: `TEST Proyecto (${RUN})`, status: "approved", classification: "internal" },
  });
  projectId = project.id;
  const location = await prisma.location.create({
    data: { locationType: "site", name: `TEST Beneficio (${RUN})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  brocaId = await catalogValue("broca", "rechazo_categoria");
  flotadoresId = await catalogValue("flotadores", "rechazo_categoria");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("peorEstado", () => {
  it("devuelve el peor y no el primero", () => {
    expect(peorEstado(["measured", "supplier_declared"])).toBe("supplier_declared");
    expect(peorEstado(["unknown", "measured"])).toBe("unknown");
    expect(peorEstado(["measured"])).toBe("measured");
    expect(peorEstado([])).toBeNull();
  });
});

describe("claveDeColumna", () => {
  it("un mismo rango en dos sistemas son dos columnas", () => {
    expect(claveDeColumna("redonda_internacional", 17, 18)).not.toBe(claveDeColumna("plana_oblonga", 17, 18));
  });
  it("los dos extremos nulos son la columna «sin malla»", () => {
    expect(claveDeColumna("redonda_internacional", null, null)).toBe("sin-malla");
  });
});

describe("clasificacionDeLote", () => {
  it("reconoce una clasificación escrita por recordGreenGrading y devuelve sus mallas", async () => {
    const origen = await loteVerde("lee-1", 100);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 100,
      fractions: [
        { lotCode: `${RUN}-lee-1-A`, quantityKg: 60, screenMin: 17, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
        { lotCode: `${RUN}-lee-1-B`, quantityKg: 40, screenMin: 15, screenMax: 16, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const c = await clasificacionDeLote(userAccountId, origen.id);
    expect(c).not.toBeNull();
    expect(c!.entradaKg).toBe(100);
    // Grande primero.
    expect(c!.mallas.map((m) => m.lotCode)).toEqual([`${RUN}-lee-1-A`, `${RUN}-lee-1-B`]);
    expect(c!.mallas[0]).toMatchObject({ rangoMin: 17, rangoMax: 18, kg: 60, pct: 60, sinRango: false });
    expect(c!.mallas[1]).toMatchObject({ rangoMin: 15, rangoMax: 16, kg: 40, pct: 40 });
    expect(c!.estadoDelDato).toBe("measured");
  }, 30000);

  it("suma en UNA fila dos lotes de defecto de la misma categoría", async () => {
    // El control positivo del agrupador. Con un solo lote por categoría, la prueba pasaría igual
    // sin agrupador ninguno — que es cómo se firma un guardia que no guarda nada.
    const origen = await loteVerde("defectos", 100);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 100,
      fractions: [
        { lotCode: `${RUN}-defectos-A`, quantityKg: 70, screenMin: 16, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      defectLots: [
        { lotCode: `${RUN}-defectos-D1`, quantityKg: 12, rejectionCategoryValueId: brocaId },
        { lotCode: `${RUN}-defectos-D2`, quantityKg: 8, rejectionCategoryValueId: brocaId },
        { lotCode: `${RUN}-defectos-D3`, quantityKg: 10, rejectionCategoryValueId: flotadoresId },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const c = await clasificacionDeLote(userAccountId, origen.id);
    const broca = c!.defectos.find((d) => d.categoriaValueId === brocaId);
    expect(c!.defectos).toHaveLength(2);
    expect(broca!.kg).toBe(20);
    expect(broca!.pct).toBe(20);
    expect(broca!.lotes.map((l) => l.lotCode).sort()).toEqual([`${RUN}-defectos-D1`, `${RUN}-defectos-D2`]);
  }, 30000);

  it("una fracción sin rango no vale cero: va al final y conserva sus kilos", async () => {
    const origen = await loteVerde("sin-rango", 100);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 100,
      fractions: [
        { lotCode: `${RUN}-sin-rango-A`, quantityKg: 30, screenStatus: "unknown" },
        { lotCode: `${RUN}-sin-rango-B`, quantityKg: 70, screenMin: 17, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const c = await clasificacionDeLote(userAccountId, origen.id);
    expect(c!.mallas.map((m) => m.lotCode)).toEqual([`${RUN}-sin-rango-B`, `${RUN}-sin-rango-A`]);
    const sin = c!.mallas[1];
    expect(sin.sinRango).toBe(true);
    expect(sin.kg).toBe(30);
    expect(sin.pct).toBe(30);
  }, 30000);

  it("el estado del dato del lote es el PEOR de sus fracciones, no el de la primera", async () => {
    const origen = await loteVerde("estado", 100);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 100,
      fractions: [
        { lotCode: `${RUN}-estado-A`, quantityKg: 60, screenMin: 17, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
        { lotCode: `${RUN}-estado-B`, quantityKg: 40, screenMin: 15, screenMax: 16, screenSystem: "redonda_internacional", screenStatus: "supplier_declared" },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const c = await clasificacionDeLote(userAccountId, origen.id);
    expect(c!.mallas[0].estado).toBe("measured");
    expect(c!.estadoDelDato).toBe("supplier_declared");
  }, 30000);

  it("una selección de CEREZA no es una clasificación verde — control negativo", async () => {
    const cereza = await loteCereza("cereza", 100);
    await recordSelection(userAccountId, {
      inputLotId: cereza.id,
      inputQuantity: 100,
      unit: "kg",
      accepted: { lotCode: `${RUN}-cereza-ok`, lotType: "cherry", quantity: 90 },
      rejected: [{ lotCode: `${RUN}-cereza-flot`, lotType: "cherry", quantity: 10, rejectionCategoryValueId: flotadoresId }],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    // No es verde, así que devuelve null aunque la transformación sea de tipo `selection`.
    expect(await clasificacionDeLote(userAccountId, cereza.id)).toBeNull();

    // Y tampoco aparece como fila en la comparación.
    const r = await compararClasificacionVerde(userAccountId);
    expect(r.filas.find((f) => f.lotCode === `${RUN}-cereza`)).toBeUndefined();
  }, 30000);
});

describe("compararClasificacionVerde", () => {
  it("una cuenta sin asignaciones recibe sinAmbito, no una lista vacía", async () => {
    const ajeno = await crearUsuarioSinAcceso();
    const r = await compararClasificacionVerde(ajeno.userAccountId);
    expect(r.sinAmbito).toBe(true);
    expect(r.filas).toEqual([]);
  }, 30000);

  it("pone una fila por lote clasificado y una columna por rango declarado", async () => {
    const origen = await loteVerde("comp", 200);
    await recordGreenGrading(userAccountId, {
      inputLotId: origen.id,
      inputQuantityKg: 200,
      fractions: [
        { lotCode: `${RUN}-comp-A`, quantityKg: 150, screenMin: 17, screenMax: 18, screenSystem: "redonda_internacional", screenStatus: "measured" },
        { lotCode: `${RUN}-comp-B`, quantityKg: 50, screenMin: 15, screenMax: 16, screenSystem: "redonda_internacional", screenStatus: "measured" },
      ],
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
    });

    const r = await compararClasificacionVerde(userAccountId);
    // Por código de lote y NUNCA por número de filas: esta cuenta es Platform Admin y ve la base entera.
    const fila = r.filas.find((f) => f.lotCode === `${RUN}-comp`);
    expect(fila).toBeDefined();
    const grande = claveDeColumna("redonda_internacional", 17, 18);
    const pequena = claveDeColumna("redonda_internacional", 15, 16);
    expect(fila!.repartoPct[grande]).toBe(75);
    expect(fila!.repartoPct[pequena]).toBe(25);
    expect(r.columnas.map((c) => c.clave)).toContain(grande);
    // Grande antes que pequeña.
    expect(r.columnas.findIndex((c) => c.clave === grande)).toBeLessThan(
      r.columnas.findIndex((c) => c.clave === pequena),
    );
  }, 30000);
});
```

- [ ] **Step 3: Correr las pruebas y ver que fallan por el motivo correcto**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test_verde \
  npm test -- tests/traceability/clasificacionVerde.test.ts > /tmp/t1.txt 2>&1; echo "exit=$?"
grep -E '✓|×|Tests ' /tmp/t1.txt
```

Esperado: **`peorEstado` y `claveDeColumna` en verde** (3 casos) y **las siete que usan la base en rojo**, con `expected null not to be null` o `repartoPct` indefinido. **Leer los nombres que caen.** Si cae alguna de las dos primeras, la implementación de las funciones puras del paso 1 está mal y no hay que seguir. Si cae TODO el archivo con un error de carga, es el cliente de Prisma sin generar — `npx prisma generate`.

- [ ] **Step 4: Implementar las dos lecturas**

Sustituir en `lib/traceability/clasificacionVerde.ts` los dos cuerpos provisionales por esto, y añadir los dos fragmentos compartidos justo encima de ellos:

```ts
/**
 * Las salidas de una clasificación, con lo que la lectura necesita del lote.
 */
const SALIDAS_CON_MALLA = {
  include: {
    lot: {
      select: {
        id: true,
        lotCode: true,
        greenScreenMin: true,
        greenScreenMax: true,
        greenScreenSystem: true,
        greenScreenStatus: true,
        greenGradeNote: true,
        greenUniformityPct: true,
        rejectionCategoryValueId: true,
        rejectionCategoryValue: { select: { value: true } },
      },
    },
  },
} as const;

/**
 * **El discriminador, y son DOS condiciones.** `recordGreenGrading` escribe con
 * `transformationType: "selection"`, el mismo tipo que la selección de cereza, así que el tipo
 * solo no distingue nada. La segunda condición sí: `screenStatus` es obligatorio en
 * `GreenFractionInput`, de modo que toda fracción escrita por `recordGreenGrading` lleva
 * `greenScreenStatus` y ningún lote de defecto lo lleva.
 *
 * La tercera condición —que el lote de ENTRADA sea verde— la ponen las dos funciones de abajo,
 * cada una a su manera, porque aquí no hay a qué lote referirse.
 */
const ES_CLASIFICACION_VERDE = {
  transformationType: "selection",
  outputs: { some: { lot: { greenScreenStatus: { not: null } } } },
} satisfies Prisma.LotTransformationWhereInput;

type TransformacionClasificada = Prisma.LotTransformationGetPayload<{
  include: { inputs: true; outputs: typeof SALIDAS_CON_MALLA };
}>;

function armarClasificacion(tr: TransformacionClasificada): ClasificacionDeLote {
  const entradaKg = tr.inputs.reduce((suma, i) => suma + Number(i.quantity ?? 0), 0);
  const pct = (kg: number) => (entradaKg > 0 ? Number(((kg / entradaKg) * 100).toFixed(2)) : null);

  // **Precedencia explícita.** Si una salida lleva categoría de rechazo es un defecto, aunque su
  // lote arrastre `greenScreenStatus` de una clasificación anterior. Sin este orden un lote
  // reclasificado caería en las dos listas y los porcentajes pasarían de 100.
  const mallas: FraccionDeMalla[] = tr.outputs.flatMap((o) => {
    if (o.lot.rejectionCategoryValueId != null) return [];
    const estado = o.lot.greenScreenStatus;
    if (estado == null) return [];
    const kg = Number(o.quantity ?? 0);
    return [{
      lotId: o.lot.id,
      lotCode: o.lot.lotCode,
      rangoMin: o.lot.greenScreenMin,
      rangoMax: o.lot.greenScreenMax,
      sistema: o.lot.greenScreenSystem,
      estado,
      uniformidadPct: o.lot.greenUniformityPct != null ? Number(o.lot.greenUniformityPct) : null,
      nota: o.lot.greenGradeNote,
      kg,
      pct: pct(kg),
      sinRango: o.lot.greenScreenMin == null && o.lot.greenScreenMax == null,
    }];
  });

  // Grande primero; las sin rango al final. «Sin declarar» no es «malla 0», así que no puede
  // ordenarse como si valiera cero.
  mallas.sort((a, b) => {
    if (a.sinRango !== b.sinRango) return a.sinRango ? 1 : -1;
    return (b.rangoMax ?? b.rangoMin ?? 0) - (a.rangoMax ?? a.rangoMin ?? 0);
  });

  const porCategoria = new Map<string, DefectoAgrupado>();
  for (const o of tr.outputs) {
    const categoriaValueId = o.lot.rejectionCategoryValueId;
    if (categoriaValueId == null) continue;
    const kg = Number(o.quantity ?? 0);
    const fila = porCategoria.get(categoriaValueId) ?? {
      categoriaValueId,
      categoria: o.lot.rejectionCategoryValue?.value ?? null,
      kg: 0,
      pct: null,
      lotes: [],
    };
    fila.kg += kg;
    fila.lotes.push({ lotId: o.lot.id, lotCode: o.lot.lotCode, kg });
    porCategoria.set(categoriaValueId, fila);
  }
  const defectos = [...porCategoria.values()]
    .map((d) => ({ ...d, pct: pct(d.kg) }))
    .sort((a, b) => b.kg - a.kg);

  return {
    transformationId: tr.id,
    clasificadoEl: tr.occurredAt,
    entradaKg,
    mallas,
    defectos,
    mermaDeclaradaKg: tr.declaredLossQuantity != null ? Number(tr.declaredLossQuantity) : null,
    // Guardado al escribir por `settleMassBalance`, no recalculado: es la cifra por la que
    // pregunta una auditoría, no una cuenta contra un historial ya corregido.
    noExplicadoKg: tr.unexplainedQuantity != null ? Number(tr.unexplainedQuantity) : null,
    estadoDelDato: peorEstado(mallas.map((m) => m.estado)),
  };
}

export async function clasificacionDeLote(
  userAccountId: string,
  lotId: string,
): Promise<ClasificacionDeLote | null> {
  const lote = await prisma.lot.findUnique({
    where: { id: lotId },
    select: { lotType: true, projectId: true, locationId: true, classification: true },
  });
  if (!lote) throw new TraceabilityAccessError("lot_not_found");
  // Comprueba su propio permiso aunque la ficha ya gatee: así no depende de que quien la llame lo
  // haya hecho, y no necesita excepción en la allowlist de acceso a datos.
  await requireLotAccess(userAccountId, "view", [
    { projectId: lote.projectId, locationId: lote.locationId, classification: lote.classification },
  ]);
  if (lote.lotType !== "green") return null;

  const tr = await prisma.lotTransformation.findFirst({
    where: { ...ES_CLASIFICACION_VERDE, inputs: { some: { lotId } } },
    orderBy: { occurredAt: "desc" },
    include: { inputs: true, outputs: SALIDAS_CON_MALLA },
  });
  if (!tr) return null;
  return armarClasificacion(tr);
}

export async function compararClasificacionVerde(
  userAccountId: string,
): Promise<ComparacionDeClasificacion> {
  const visibility = await resolveLotVisibility(userAccountId);
  const where = lotWhereFromVisibility(visibility);
  // `null` es «no puedes ver ninguno», que no es «no hay ninguno». Devolver una lista vacía aquí
  // le diría a una cuenta recién dada de alta que la finca no tiene café (ver lots.ts:724).
  if (where === null) {
    return { columnas: [], filas: [], sinClasificar: 0, sinAmbito: true, truncado: false, limite: LIST_LIMIT };
  }
  const verdesVisibles: Prisma.LotWhereInput = { AND: [where, { lotType: "green" }] };

  const [rows, totalVerdes, totalClasificados] = await Promise.all([
    prisma.lotTransformation.findMany({
      where: { ...ES_CLASIFICACION_VERDE, inputs: { some: { lot: verdesVisibles } } },
      orderBy: { occurredAt: "desc" },
      // El +1 es el que hace que `truncate` pueda detectar el corte sin un segundo `count`.
      take: LIST_LIMIT + 1,
      include: { inputs: { include: { lot: { select: { id: true, lotCode: true } } } }, outputs: SALIDAS_CON_MALLA },
    }),
    prisma.lot.count({ where: verdesVisibles }),
    // Contado aparte y NO desde la página truncada: si el corte se lleva filas, restar sobre ellas
    // daría un «sin clasificar» inflado que se leería como un hecho sobre la finca.
    prisma.lot.count({
      where: { AND: [verdesVisibles, { transformationInputs: { some: { transformation: ES_CLASIFICACION_VERDE } } }] },
    }),
  ]);

  const { items, truncated, limit } = truncate(rows);
  const columnas = new Map<string, ColumnaDeMalla>();

  const filas: FilaDeComparacion[] = items.map((tr) => {
    const c = armarClasificacion(tr);
    const kgPorColumna = new Map<string, number>();
    for (const m of c.mallas) {
      const clave = claveDeColumna(m.sistema, m.rangoMin, m.rangoMax);
      if (!columnas.has(clave)) {
        columnas.set(clave, { clave, sistema: m.sistema, rangoMin: m.rangoMin, rangoMax: m.rangoMax, sinRango: m.sinRango });
      }
      // Dos fracciones del mismo rango en un lote se SUMAN, no se pisan.
      kgPorColumna.set(clave, (kgPorColumna.get(clave) ?? 0) + m.kg);
    }
    const repartoPct: Record<string, number | null> = {};
    for (const [clave, kg] of kgPorColumna) {
      repartoPct[clave] = c.entradaKg > 0 ? Number(((kg / c.entradaKg) * 100).toFixed(2)) : null;
    }
    const entrada = tr.inputs[0]?.lot;
    return {
      lotId: entrada?.id ?? "",
      lotCode: entrada?.lotCode ?? "",
      clasificadoEl: c.clasificadoEl,
      entradaKg: c.entradaKg,
      repartoPct,
      defectosPct:
        c.entradaKg > 0
          ? Number(c.defectos.reduce((suma, d) => suma + (d.pct ?? 0), 0).toFixed(2))
          : null,
      estadoDelDato: c.estadoDelDato,
    };
  });

  const ordenadas = [...columnas.values()].sort((a, b) => {
    if (a.sinRango !== b.sinRango) return a.sinRango ? 1 : -1;
    return (b.rangoMax ?? b.rangoMin ?? 0) - (a.rangoMax ?? a.rangoMin ?? 0);
  });

  return {
    columnas: ordenadas,
    filas,
    sinClasificar: Math.max(totalVerdes - totalClasificados, 0),
    sinAmbito: false,
    truncado: truncated,
    limite: limit,
  };
}
```

- [ ] **Step 5: Correr las pruebas y verlas pasar**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test_verde \
  npm test -- tests/traceability/clasificacionVerde.test.ts > /tmp/t1.txt 2>&1; echo "exit=$?"
grep -E 'Tests |✓|×' /tmp/t1.txt
```

Esperado: **10 casos, 10 en verde, exit 0.** Si el número de casos no es 10, faltan pruebas: contarlos antes de leer el color.

- [ ] **Step 6: Registrar el módulo en la allowlist de acceso a datos**

Sin esto, `tests/arquitectura/acceso-a-datos.test.ts` tumba la compuerta con «Acceso crudo nuevo».

Añadir a la lista `importan_cliente_total` de `docs/arquitectura/acceso-a-datos.allowlist.json`:

```json
{
  "archivo": "lib/traceability/clasificacionVerde.ts",
  "razon": "Módulo de dominio, SÓLO LECTURA: las tres lecturas de la clasificación de café verde por malla (spec 2026-09-25). `clasificacionDeLote` exige `requireLotAccess(view)` sobre el lote ANTES de leer nada, con su propio permiso y no el de quien la llama. `compararClasificacionVerde` no consulta un lote concreto: recorta con `resolveLotVisibility` + `lotWhereFromVisibility`, la misma vía que `getLotList`, y devuelve `sinAmbito` cuando el ámbito es vacío en vez de una lista vacía. No escribe nada y no recibe `tx`."
}
```

- [ ] **Step 7: Compuertas completas**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm run verify > /tmp/v.txt 2>&1; echo "verify exit=$?"
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "ci exit=$?"
npm run build > /tmp/b.txt 2>&1; echo "build exit=$?"
```

Las tres a 0. **`npm run build` no es opcional**: `vitest` no comprueba tipos y esta tarea es TypeScript entero. Si alguna falla, leer el archivo, no la última línea.

- [ ] **Step 8: Commit**

```bash
git add lib/traceability/clasificacionVerde.ts tests/traceability/clasificacionVerde.test.ts docs/arquitectura/acceso-a-datos.allowlist.json
git diff --cached --stat
```

Contar: **tres archivos**. Si salen más, parar y mirar qué arrastró el índice.

```bash
git commit -F /tmp/msg1.txt
```

con `/tmp/msg1.txt`:

```
feat(verde): lectura de la clasificación por malla y de la comparación entre lotes

Módulo nuevo de sólo lectura. El discriminador son dos condiciones porque
recordGreenGrading escribe con el mismo transformationType que la selección
de cereza: entrada verde y al menos una salida con greenScreenStatus.

Los defectos se agrupan por categoría canónica y se suman, que es lo que
faltaba. La comparación monta sobre resolveLotVisibility para heredar el
recorte por permisos y la bandera sinAmbito.

10 casos en verde sobre nectar_test_verde; verify, ci.sh y build en 0.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

- [ ] **Step 9: Flip-test de los dos guardias que importan**

**Commitear primero** (paso 8), porque el arnés restaura desde HEAD.

Mutación 1 — romper el agrupador de defectos, para que cada lote sea su propia fila:

```bash
cp lib/traceability/clasificacionVerde.ts /tmp/cv.orig
shasum lib/traceability/clasificacionVerde.ts
```

Cambiar en `armarClasificacion` la línea
`const fila = porCategoria.get(categoriaValueId) ?? {`
por
`const fila = undefined ?? {`
y la clave del mapa `porCategoria.set(categoriaValueId, fila)` por
`porCategoria.set(categoriaValueId + o.lot.id, fila)`.

```bash
shasum lib/traceability/clasificacionVerde.ts          # DISTINTO del de arriba, o abortar
npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "compila exit=$?"   # 0, o la mutación no vale
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test_verde \
  npm test -- tests/traceability/clasificacionVerde.test.ts > /tmp/flip1.txt 2>&1; echo "exit=$?"
grep -E '×|Tests ' /tmp/flip1.txt
```

Esperado: **cae por su nombre** «suma en UNA fila dos lotes de defecto de la misma categoría». Si cae otra cosa, o si no cae nada, el guardia no guarda lo que dice.

```bash
git checkout -- lib/traceability/clasificacionVerde.ts
```

Mutación 2 — devolver el primer estado en vez del peor: en `peorEstado`, sustituir el `reduce` por `return estados[0];`. Mismas tres comprobaciones (sha distinto, compila, nombre que cae). Esperado: caen **«devuelve el peor y no el primero»** y **«el estado del dato del lote es el PEOR de sus fracciones»**. Restaurar igual.

```bash
git status --porcelain    # vacío: las dos restauraciones volvieron
```

---

### Task 2: El bloque de la ficha

**Files:**
- Create: `app/components/traceability/ClasificacionPorMalla.tsx`
- Modify: `app/lots/[id]/page.tsx` (la carga de datos, hacia la línea 372, y el bloque `outturn`, hacia la 937)
- Modify: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consumes: `clasificacionDeLote`, y los tipos `ClasificacionDeLote`, `FraccionDeMalla`, `DefectoAgrupado` de la Tarea 1.
- Produces: `<ClasificacionPorMalla clasificacion={…} lotId={…} />`, componente de servidor.

- [ ] **Step 1: Las claves de i18n**

En `messages/es.json`, dentro del objeto `Traceability`, junto a las `greenGrading*` que ya están hacia la línea 1388:

```json
    "clasificacionMallaHeading": "Clasificación por malla",
    "clasificacionMallaEntrada": "Café verde que entró",
    "clasificacionMallaColumnaMalla": "Malla",
    "clasificacionMallaColumnaSistema": "Sistema",
    "clasificacionMallaColumnaDato": "Dato",
    "clasificacionMallaColumnaPeso": "Peso",
    "clasificacionMallaColumnaShare": "Sobre la entrada",
    "clasificacionMallaSinRango": "Sin malla declarada",
    "clasificacionMallaDefectosHeading": "Defectos por categoría",
    "clasificacionMallaDefectoLotes": "{count, plural, one {# lote} other {# lotes}}",
    "clasificacionMallaSinDefectos": "No se registró ningún defecto en esta clasificación.",
    "clasificacionMallaMerma": "Merma declarada",
    "clasificacionMallaSinExplicar": "Sin explicar",
    "clasificacionMallaUniformidad": "Uniformidad {pct}%",
    "clasificacionMallaComparar": "Comparar con los demás lotes",
    "estadoDelDato_measured": "medido",
    "estadoDelDato_supplier_declared": "declarado por el proveedor",
    "estadoDelDato_qualitative": "a ojo",
    "estadoDelDato_unknown": "desconocido"
```

Y en `messages/en.json`, en el mismo sitio:

```json
    "clasificacionMallaHeading": "Screen size breakdown",
    "clasificacionMallaEntrada": "Green coffee in",
    "clasificacionMallaColumnaMalla": "Screen",
    "clasificacionMallaColumnaSistema": "System",
    "clasificacionMallaColumnaDato": "Data",
    "clasificacionMallaColumnaPeso": "Weight",
    "clasificacionMallaColumnaShare": "Share of input",
    "clasificacionMallaSinRango": "No screen declared",
    "clasificacionMallaDefectosHeading": "Defects by category",
    "clasificacionMallaDefectoLotes": "{count, plural, one {# lot} other {# lots}}",
    "clasificacionMallaSinDefectos": "No defects were recorded in this grading.",
    "clasificacionMallaMerma": "Declared loss",
    "clasificacionMallaSinExplicar": "Unexplained",
    "clasificacionMallaUniformidad": "Uniformity {pct}%",
    "clasificacionMallaComparar": "Compare with the other lots",
    "estadoDelDato_measured": "measured",
    "estadoDelDato_supplier_declared": "supplier declared",
    "estadoDelDato_qualitative": "qualitative",
    "estadoDelDato_unknown": "unknown"
```

Comprobar que los dos archivos siguen siendo JSON válido, que es el fallo tonto de este paso:

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
node -e 'JSON.parse(require("fs").readFileSync("messages/es.json","utf8"));JSON.parse(require("fs").readFileSync("messages/en.json","utf8"));console.log("JSON válido en los dos")'
```

- [ ] **Step 2: El componente**

Crear `app/components/traceability/ClasificacionPorMalla.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ClasificacionDeLote } from "../../../lib/traceability/clasificacionVerde";

/**
 * Las lecturas 1 y 2 de la spec del 2026-09-25: el reparto por malla y los defectos agrupados.
 *
 * **Sustituye** a la tabla genérica de cuajado en un lote verde, no se añade a ella: las mismas
 * cifras en dos formatos en la misma pantalla es cómo se acaba con dos números que no cuadran.
 * Y «aceptado / rechazado» es el vocabulario de la selección de cereza, no de un tamizado.
 */
export async function ClasificacionPorMalla({
  clasificacion,
  lotId,
}: {
  clasificacion: ClasificacionDeLote;
  lotId: string;
}) {
  const t = await getTranslations("Traceability");
  const share = (pct: number | null) =>
    pct != null ? t("selectionOutturnShare", { share: pct }) : t("selectionOutturnUnknown");

  return (
    <section className="nn-section">
      <h2>{t("clasificacionMallaHeading")}</h2>
      <p className="nn-muted">
        {t("clasificacionMallaEntrada")}: {clasificacion.entradaKg} kg
      </p>

      <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            <th>{t("clasificacionMallaColumnaMalla")}</th>
            <th>{t("clasificacionMallaColumnaSistema")}</th>
            <th>{t("clasificacionMallaColumnaDato")}</th>
            <th>{t("clasificacionMallaColumnaPeso")}</th>
            <th>{t("clasificacionMallaColumnaShare")}</th>
          </tr>
        </thead>
        <tbody>
          {clasificacion.mallas.map((m) => (
            <tr key={m.lotId}>
              <td>
                <Link href={`/lots/${m.lotId}`} className="nn-code">{m.lotCode}</Link>{" "}
                {/* «Sin declarar» no es «malla 0»: se dice con palabras, no con un cero. */}
                {m.sinRango ? t("clasificacionMallaSinRango") : `${m.rangoMin ?? "?"}–${m.rangoMax ?? "?"}`}
                {m.uniformidadPct != null ? ` · ${t("clasificacionMallaUniformidad", { pct: m.uniformidadPct })}` : ""}
              </td>
              <td>{m.sistema ?? t("selectionOutturnUnknown")}</td>
              <td>{t(`estadoDelDato_${m.estado}` as "estadoDelDato_measured")}</td>
              <td>{m.kg} kg</td>
              <td>{share(m.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t("clasificacionMallaDefectosHeading")}</h3>
      {clasificacion.defectos.length === 0 ? (
        <p className="nn-muted">{t("clasificacionMallaSinDefectos")}</p>
      ) : (
        <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
          <tbody>
            {clasificacion.defectos.map((d) => (
              <tr key={d.categoriaValueId}>
                <td>{d.categoria ?? t("selectionOutturnUnknown")}</td>
                <td className="nn-muted">{t("clasificacionMallaDefectoLotes", { count: d.lotes.length })}</td>
                <td>{d.kg} kg</td>
                <td>{share(d.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
        <tbody>
          <tr>
            <td>{t("clasificacionMallaMerma")}</td>
            <td>{clasificacion.mermaDeclaradaKg != null ? `${clasificacion.mermaDeclaradaKg} kg` : t("selectionOutturnUnknown")}</td>
          </tr>
          <tr>
            {/* null es «desconocido», nunca 0 — ADR-080, la misma distinción que la tabla de cereza. */}
            <td>{t("clasificacionMallaSinExplicar")}</td>
            <td>{clasificacion.noExplicadoKg != null ? `${clasificacion.noExplicadoKg} kg` : t("selectionOutturnUnknown")}</td>
          </tr>
        </tbody>
      </table>

      <p>
        <Link href={`/lots/${lotId}/clasificacion`}>{t("clasificacionMallaComparar")}</Link>
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Enganchar en la ficha**

En `app/lots/[id]/page.tsx`, añadir el import junto a los otros de `lib/traceability` (hacia la línea 49):

```ts
import { clasificacionDeLote } from "../../../lib/traceability/clasificacionVerde";
import { ClasificacionPorMalla } from "../../components/traceability/ClasificacionPorMalla";
```

Justo debajo de la línea que calcula `outturn` (hacia la 372):

```ts
  // Las tres lecturas de la clasificación de verde (spec 2026-09-25). En un lote verde clasificado
  // este bloque SUSTITUYE a la tabla genérica de cuajado: las dos pintan las mismas cifras, y la
  // genérica las rotula «aceptado / rechazado», que es vocabulario de la selección de cereza.
  const clasificacionVerde = lot.lotType === "green" ? await clasificacionDeLote(user.userAccountId, lot.id) : null;
```

La cuenta se llama `user.userAccountId`: comprobado en `app/lots/[id]/page.tsx:96`, donde `getLotDetail` la recibe con ese nombre.

Y cambiar la condición del bloque `outturn` (hacia la 937), de:

```tsx
      {outturn ? (
```

a:

```tsx
      {clasificacionVerde ? <ClasificacionPorMalla clasificacion={clasificacionVerde} lotId={lot.id} /> : null}

      {outturn && !clasificacionVerde ? (
```

- [ ] **Step 4: Compuertas y verificación en el navegador**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm run verify > /tmp/v2.txt 2>&1; echo "verify exit=$?"
npm run build > /tmp/b2.txt 2>&1; echo "build exit=$?"
```

Las dos a 0. `npm run verify` incluye `check:rutas`; esta tarea no añade rutas, así que no debería quejarse.

Después, **mirar la página de verdad**, no sólo el tipo: arrancar con `npm run dev:local`, abrir la ficha de un lote verde clasificado, y comprobar dos cosas a la vez — que el bloque nuevo **está** con su rango de malla escrito, y que la tabla «Resultado de la selección» **ya no está**. La segunda mitad es el control: sin ella, «el bloque aparece» no demuestra que sustituya a nada.

- [ ] **Step 5: Commit**

```bash
git add app/components/traceability/ClasificacionPorMalla.tsx app/lots/\[id\]/page.tsx messages/es.json messages/en.json
git diff --cached --stat
```

Contar: **cuatro archivos**.

```bash
git commit -F /tmp/msg2.txt
```

---

### Task 3: La pantalla de comparación

**Files:**
- Create: `app/lots/[id]/clasificacion/page.tsx`
- Modify: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consumes: `compararClasificacionVerde` y los tipos `ColumnaDeMalla`, `FilaDeComparacion` de la Tarea 1; `getLotSummary` y `TraceabilityAccessError` de `lib/traceability/lots`; `getCurrentUser` de `lib/auth/session`.
- Produces: la ruta `/lots/[id]/clasificacion`.

- [ ] **Step 1: Las claves de i18n**

En `messages/es.json`, junto a las de la Tarea 2:

```json
    "compararMallaTitulo": "Comparar la clasificación entre lotes",
    "compararMallaIntro": "Una fila por lote verde clasificado, con el reparto de cada malla sobre lo que entró. Las columnas son los rangos que se declararon; no hay ninguna escala impuesta.",
    "compararMallaColumnaLote": "Lote",
    "compararMallaColumnaFecha": "Clasificado",
    "compararMallaColumnaEntrada": "Entró",
    "compararMallaColumnaDefectos": "Defectos",
    "compararMallaColumnaDato": "Dato",
    "compararMallaSinRango": "Sin malla",
    "compararMallaVacio": "Todavía no hay ningún lote verde clasificado.",
    "compararMallaSinClasificar": "{count, plural, one {Hay # lote verde más sin clasificar.} other {Hay # lotes verdes más sin clasificar.}}",
    "compararMallaSinAmbito": "Tu cuenta no tiene ningún lote asignado todavía, así que esta pantalla no puede decir si hay clasificaciones o no. Pídele acceso a quien administre la finca.",
    "compararMallaTruncado": "Se muestran las {limit} clasificaciones más recientes; hay más."
```

Y en `messages/en.json`:

```json
    "compararMallaTitulo": "Compare screen grading across lots",
    "compararMallaIntro": "One row per graded green lot, showing each screen's share of what went in. The columns are the ranges that were declared; no scale is imposed.",
    "compararMallaColumnaLote": "Lot",
    "compararMallaColumnaFecha": "Graded",
    "compararMallaColumnaEntrada": "In",
    "compararMallaColumnaDefectos": "Defects",
    "compararMallaColumnaDato": "Data",
    "compararMallaSinRango": "No screen",
    "compararMallaVacio": "No green lot has been graded yet.",
    "compararMallaSinClasificar": "{count, plural, one {There is # more green lot not yet graded.} other {There are # more green lots not yet graded.}}",
    "compararMallaSinAmbito": "Your account has no lots assigned yet, so this screen cannot tell whether any grading exists. Ask whoever administers the farm for access.",
    "compararMallaTruncado": "Showing the {limit} most recent gradings; there are more."
```

- [ ] **Step 2: La pantalla**

Crear `app/lots/[id]/clasificacion/page.tsx`, siguiendo el patrón de `app/lots/[id]/green-selection/new/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getLotSummary, TraceabilityAccessError } from "../../../../lib/traceability/lots";
import { compararClasificacionVerde } from "../../../../lib/traceability/clasificacionVerde";

export const dynamic = "force-dynamic";

/**
 * La lectura 3 de la spec del 2026-09-25: comparar lotes entre sí.
 *
 * **Fuera de la ficha, y por una razón medida.** `app/lots/[id]/page.tsx` tiene ~1.400 líneas y
 * unas veinte secciones, y un `<details>` en un componente de servidor no ahorra la consulta: el
 * contenido se renderiza aunque esté plegado. Metida allí, esta consulta —que recorre TODOS los
 * lotes verdes visibles— correría en cada carga de cada lote verde, la mire alguien o no.
 */
export default async function ComparacionDeClasificacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let lote;
  try {
    lote = await getLotSummary(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  const comparacion = await compararClasificacionVerde(user.userAccountId);

  return (
    <div>
      <Link href={`/lots/${id}`} className="nn-back-link">{t("backToLot", { lotCode: lote.lotCode })}</Link>
      <h1>{t("compararMallaTitulo")}</h1>
      <p className="nn-muted">{t("compararMallaIntro")}</p>

      {/* «No puedes ver ninguno» no es «no hay ninguno», y una tabla vacía diría lo segundo. */}
      {comparacion.sinAmbito ? (
        <p role="status">{t("compararMallaSinAmbito")}</p>
      ) : comparacion.filas.length === 0 ? (
        <p className="nn-muted">{t("compararMallaVacio")}</p>
      ) : (
        <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              <th>{t("compararMallaColumnaLote")}</th>
              <th>{t("compararMallaColumnaFecha")}</th>
              <th>{t("compararMallaColumnaEntrada")}</th>
              {comparacion.columnas.map((c) => (
                <th key={c.clave}>
                  {c.sinRango
                    ? t("compararMallaSinRango")
                    : `${c.rangoMin ?? "?"}–${c.rangoMax ?? "?"}`}
                  {c.sistema ? <span className="nn-muted"> · {c.sistema}</span> : null}
                </th>
              ))}
              <th>{t("compararMallaColumnaDefectos")}</th>
              <th>{t("compararMallaColumnaDato")}</th>
            </tr>
          </thead>
          <tbody>
            {comparacion.filas.map((f) => (
              // El resaltado lo pone la PANTALLA, que es la que sabe desde qué lote la miran: la
              // función de lectura no recibe ningún lotId y no tiene por qué.
              <tr key={f.lotId} aria-current={f.lotId === id ? "true" : undefined}>
                <td>
                  <Link href={`/lots/${f.lotId}`} className="nn-code">{f.lotCode}</Link>
                </td>
                <td>{f.clasificadoEl.toISOString().slice(0, 10)}</td>
                <td>{f.entradaKg} kg</td>
                {comparacion.columnas.map((c) => {
                  const pct = f.repartoPct[c.clave];
                  return (
                    <td key={c.clave}>
                      {/* Columna ausente = este lote no sacó esa malla. No es un 0 medido. */}
                      {pct == null ? "—" : t("selectionOutturnShare", { share: pct })}
                    </td>
                  );
                })}
                <td>{f.defectosPct != null ? t("selectionOutturnShare", { share: f.defectosPct }) : "—"}</td>
                <td>
                  {f.estadoDelDato
                    ? t(`estadoDelDato_${f.estadoDelDato}` as "estadoDelDato_measured")
                    : t("selectionOutturnUnknown")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {comparacion.truncado ? <p className="nn-muted">{t("compararMallaTruncado", { limit: comparacion.limite })}</p> : null}
      {!comparacion.sinAmbito && comparacion.sinClasificar > 0 ? (
        <p className="nn-muted">{t("compararMallaSinClasificar", { count: comparacion.sinClasificar })}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Compuertas, incluida la de rutas**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm run check:rutas > /tmp/r.txt 2>&1; echo "check:rutas exit=$?"; tail -12 /tmp/r.txt
```

Esta tarea **añade una ruta**, así que es el paso que puede pedir trabajo: si sale distinto de 0, leer qué reclama —normalmente que la ruta se declare en el inventario— y hacerlo. No silenciarlo.

```bash
npm run verify > /tmp/v3.txt 2>&1; echo "verify exit=$?"
bash scripts/ci.sh > /tmp/ci3.txt 2>&1; echo "ci exit=$?"
npm run build > /tmp/b3.txt 2>&1; echo "build exit=$?"
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test_verde \
  npm test -- tests/traceability/clasificacionVerde.test.ts > /tmp/t3.txt 2>&1; echo "test exit=$?"
```

Las cuatro a 0.

- [ ] **Step 4: Mirarla de verdad**

`npm run dev:local`, entrar en `/lots/<id-de-un-lote-verde-clasificado>/clasificacion` y comprobar **tres** cosas, porque cada una puede pasar sin las otras:

1. la fila del lote de la ruta está **resaltada** (`aria-current`);
2. hay **al menos dos columnas de rango distintas** — si sólo hay una, la tabla no está comparando nada y el dato de prueba no sirve para verificar;
3. el pie dice cuántos lotes verdes quedan **sin clasificar**.

- [ ] **Step 5: Commit**

```bash
git add app/lots/\[id\]/clasificacion/page.tsx messages/es.json messages/en.json
git diff --cached --stat
```

Contar: **tres archivos** (más el del inventario de rutas si `check:rutas` lo pidió — entonces cuatro).

```bash
git commit -F /tmp/msg3.txt
```

---

## Cierre de la rama

- [ ] **Revisión de Codex por bloque, no al final.** Desde un worktree aparte, con el brief de `docs/CODEX_REVIEW.brief.md`, pasándole **el diff** y no un paquete: `/Applications/ChatGPT.app/Contents/Resources/codex`. Cada hallazgo se atiende con evidencia antes de pasar a la tarea siguiente.
- [ ] **Entrada en `SESSION_STATE.md`.** Tiene techo de 400 líneas y hoy va por 387: hay que **archivar la más vieja** y correr `node scripts/check-archivo-de-estado.mjs SESSION_STATE.md docs/SESSION_STATE_ARCHIVE.md`. `check-state-budget.mjs` ya avisa de cuál toca.
- [ ] **Antes de empujar, contar lo que lleva el PR y no sólo el commit.** Los tres puntos no son adorno:

```bash
git log origin/main..HEAD --oneline          # esperado: 4 commits (spec + tres tareas)
git diff --name-only origin/main...HEAD      # esperado: 8-10 archivos
```

Si aparece algo que no tocaste, la **base** de la rama está mal aunque los commits estén bien.

- [ ] **El PR va a Daniel y no se fusiona sin su sí explícito**, PR por PR, y en verde: SUCCESS en las seis comprobaciones y sobre el mismo sha.
