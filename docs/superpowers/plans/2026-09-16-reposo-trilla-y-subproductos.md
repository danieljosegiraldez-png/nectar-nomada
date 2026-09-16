# Reposo, trilla y subproductos — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar
> `superpowers:subagent-driven-development` (recomendada) o
> `superpowers:executing-plans` para ejecutar este plan tarea a tarea. Los pasos
> usan casillas (`- [ ]`).

**Objetivo:** cerrar el hueco entre el secado y la venta — el reposo se mide y avisa,
la trilla se registra con su balance y su custodia, y la cascarilla tiene dónde ir.

**Arquitectura:** nada de esto es una fase nueva de la cadena. El reposo es **una edad
derivada** de `DryingRun.endedAt` que entra por el mismo puente de perfiles que ya
evalúa fermentación y secado (`lib/beneficio/desdeElLote.ts`). La trilla son
**columnas sobre `LotTransformation`**, no una tabla paralela. El único modelo nuevo es
`ByproductBatch`, copiado de la mitad resuelta de `BiocharBatch`.

**Stack:** Next.js 16 · React 19 · Prisma 7 (cliente en `generated/prisma`) · next-intl
· Postgres · vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-reposo-trilla-y-subproductos-design.md`
— léelo entero antes de la Tarea 1. El plan argumenta desde él; ante una discrepancia,
manda el spec.

## Restricciones globales

- **Avisa, no bloquea.** Ninguna tarea de este plan puede impedir una operación. Ni la
  venta temprana, ni la muestra temprana, ni la trilla sin humedad conocida. Si una
  implementación se encuentra escribiendo un `throw` que impide guardar algo por
  tiempo insuficiente, está mal — el spec §A.2 lo cierra sin excepciones.
- **Una humedad desconocida NO se convierte en cero.** Regla del paquete, §B.2.
- **Las limitaciones se declaran, no se callan.** Un lote sin el dato necesario sigue
  emitiendo su veredicto con su limitación nombrada, como ya hace
  `SIN_INSTRUMENTO_DECLARADO`. Nunca se silencia por falta de dato.
- **Los umbrales de reposo son `[PROVISIONAL]`** mientras `P-F` siga abierta. Van con
  ese comentario literal en el código, para que una búsqueda los encuentre.
- **`npm run build` en toda tarea que toque TypeScript.** `vitest` no comprueba tipos:
  una tarea puede pasar en verde y romper el build. Costó una hora de producción el
  día 14.
- **Toda prueba de base de datos se declara en `scripts/pruebas-por-compuerta.txt`.**
  Por omisión cae en el carril hermético, donde no hay base y el archivo dice
  «no tests» — que se lee igual que «pasó».
- **Commitear antes de mutar.** El arnés de flip-test restaura desde HEAD.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` | `DryingOutcome`, `LotTransformationType.hulling`, columnas de custodia, `Lot.releasedAt/releasedBy`, `ByproductBatch` |
| `lib/beneficio/perfiles.ts` | `restingProfile` dentro de `ProtocolProfile` |
| `lib/beneficio/reposo.ts` | **nuevo** — la edad de reposo y sus dos compuertas, puro |
| `lib/beneficio/desdeElLote.ts` | la fase `reposo` en `veredictoDelLote` |
| `lib/traceability/balance.ts` | `hulling` en `CONSERVING_TYPES` |
| `lib/traceability/trilla.ts` | **nuevo** — registrar una trilla con sus tres salidas |
| `lib/traceability/subproductos.ts` | **nuevo** — crear el `ByproductBatch` |
| `lib/rbac/catalog.ts` | `lot:release`, en `Farm Manager` y NO en `Farm Operator` |
| `app/actions/lotes.ts` | la acción de liberar |

---

## Tarea 1: El fin del secado declara su desenlace

Hoy `DryingRun.endedAt` no distingue «llegó a objetivo» de «se abandonó». El reloj del
reposo no puede arrancar de una fecha que puede significar las dos cosas.

**Archivos:**
- Modificar: `prisma/schema.prisma` (`model DryingRun`, y un enum nuevo)
- Crear: `prisma/migrations/<fecha>_desenlace_del_secado/migration.sql`
- Probar: `tests/beneficio/desenlaceDelSecado.test.ts`

**Interfaces:**
- Produce: `enum DryingOutcome { target_reached, abandoned, interrupted }` y
  `DryingRun.endedOutcome: DryingOutcome?`. La Tarea 3 lee ese campo.

- [ ] **Paso 1: escribir la prueba en rojo**

```ts
// tests/beneficio/desenlaceDelSecado.test.ts
import { describe, it, expect } from "vitest";
import { prisma } from "../../lib/db";

describe("el desenlace del secado", () => {
  it("un secado terminado puede declarar que llegó a objetivo", async () => {
    const run = await crearSecadoDePrueba({ endedOutcome: "target_reached" });
    const leido = await prisma.dryingRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(leido.endedOutcome).toBe("target_reached");
  });

  it("un secado terminado SIN declarar desenlace sigue siendo válido", async () => {
    // Control positivo del «avisa, no bloquea»: los secados históricos no tienen
    // este dato y NO se invalidan. Si esta prueba cae, alguien puso el campo
    // como obligatorio y acaba de romper todo lo anterior al día de hoy.
    const run = await crearSecadoDePrueba({ endedOutcome: null });
    const leido = await prisma.dryingRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(leido.endedOutcome).toBeNull();
  });
});
```

- [ ] **Paso 2: correr y verla fallar**

```bash
export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
npx vitest run tests/beneficio/desenlaceDelSecado.test.ts
```

Esperado: FALLA porque `endedOutcome` no existe en el cliente de Prisma.
**Si dice «no tests», el `DATABASE_URL` no está exportado** — no es un pase.

- [ ] **Paso 3: el esquema**

```prisma
/// Cómo terminó un secado. Nullable a propósito y para siempre: todos los
/// secados anteriores al 2026-09-16 no lo tienen, y obligarlo los invalidaría.
/// El reloj del reposo sólo arranca con `target_reached`; los demás no paran
/// la operación, sólo no habilitan el reposo — §A.
enum DryingOutcome {
  target_reached
  abandoned
  interrupted

  @@schema("traceability")
}
```

y dentro de `model DryingRun`, junto a `endedAt`:

```prisma
  endedOutcome DryingOutcome? @map("ended_outcome")
```

- [ ] **Paso 4: la migración y las pruebas en verde**

```bash
npx prisma migrate dev --name desenlace_del_secado
npx vitest run tests/beneficio/desenlaceDelSecado.test.ts
npm run build
```

- [ ] **Paso 5: declarar la prueba en su carril**

Añadir `tests/beneficio/desenlaceDelSecado.test.ts` a `scripts/pruebas-por-compuerta.txt`
en la sección de las que necesitan base. **Sin esto corre en el carril hermético y dice
«no tests».**

- [ ] **Paso 6: commit**

```bash
git add prisma/schema.prisma prisma/migrations scripts/pruebas-por-compuerta.txt tests/beneficio/desenlaceDelSecado.test.ts
git commit -F <archivo-de-mensaje>
```

---

## Tarea 2: El reposo vive en el perfil

**Archivos:**
- Modificar: `lib/beneficio/perfiles.ts`
- Probar: `tests/beneficio/perfilDeReposo.test.ts`

**Interfaces:**
- Consume: `ProtocolProfile` de la Tarea 0 (ya existe).
- Produce: `perfil.reposo.diasParaMuestra` y `perfil.reposo.diasParaVenta`, que la
  Tarea 3 lee.

- [ ] **Paso 1: la prueba en rojo**

```ts
// tests/beneficio/perfilDeReposo.test.ts
import { describe, it, expect } from "vitest";
import { PERFILES } from "../../lib/beneficio/perfiles";

describe("el perfil de reposo", () => {
  it("los dos perfiles con umbrales declaran sus dos días", () => {
    for (const clave of ["WASHED_STANDARD", "NATURAL"] as const) {
      const r = PERFILES[clave].reposo;
      expect(r, `${clave} no declara reposo`).toBeTruthy();
      expect(r!.diasParaMuestra).toBeGreaterThan(0);
      expect(r!.diasParaVenta).toBeGreaterThanOrEqual(r!.diasParaMuestra);
    }
  });

  it("muestra SIEMPRE antes que venta, que es lo que hace que sean dos compuertas", () => {
    // Si alguien invierte estos números, la compuerta de venta se abriría antes
    // que la de muestra y el diseño entero deja de tener sentido. Esta prueba
    // es el guardia de esa inversión, no una comprobación de rango.
    const r = PERFILES.WASHED_STANDARD.reposo!;
    expect(r.diasParaMuestra).toBeLessThan(r.diasParaVenta);
  });
});
```

- [ ] **Paso 2: correr y verla fallar** — `npx vitest run tests/beneficio/perfilDeReposo.test.ts`, FALLA: `reposo` no existe.

- [ ] **Paso 3: el tipo y los valores**

En `lib/beneficio/perfiles.ts`, dentro de `interface ProtocolProfile`:

```ts
  /**
   * Los dos umbrales del reposo, en días desde que el secado terminó **con
   * objetivo alcanzado**. Opcional: un perfil sin reposo declarado no avisa de
   * nada, que es distinto de avisar que está listo.
   *
   * [PROVISIONAL] — los números salen de lo que Daniel dio de memoria el
   * 2026-09-16 y `P-F` sigue abierta. No son medidos.
   */
  readonly reposo?: {
    /** Habilita sacar muestra: tostar, analizar, cerrar una venta. */
    readonly diasParaMuestra: number;
    /** Habilita vender. SIEMPRE ≥ diasParaMuestra. */
    readonly diasParaVenta: number;
  };
```

y en cada perfil:

```ts
    // [PROVISIONAL] lavado: 60–90 días según Daniel, 2026-09-16.
    reposo: { diasParaMuestra: 30, diasParaVenta: 60 },
```

```ts
    // [PROVISIONAL] natural Catuaí: óptimo 45–60 según Daniel, 2026-09-16.
    reposo: { diasParaMuestra: 30, diasParaVenta: 45 },
```

- [ ] **Paso 4: verde y build** — `npx vitest run tests/beneficio/perfilDeReposo.test.ts && npm run build`

- [ ] **Paso 5: commit.**

---

## Tarea 3: La edad de reposo y sus dos avisos

El corazón de la sección A. **Puro**: no toca la base, así que su prueba va al carril
hermético y no hay que declararla.

**Archivos:**
- Crear: `lib/beneficio/reposo.ts`
- Probar: `tests/beneficio/reposo.test.ts`

**Interfaces:**
- Consume: `perfil.reposo` (Tarea 2), `endedAt` y `endedOutcome` (Tarea 1).
- Produce: `evaluarReposo(entrada): EstadoDeReposo`.

- [ ] **Paso 1: la prueba en rojo, con sus dos controles**

```ts
// tests/beneficio/reposo.test.ts
import { describe, it, expect } from "vitest";
import { evaluarReposo } from "../../lib/beneficio/reposo";

const PERFIL = { diasParaMuestra: 30, diasParaVenta: 60 };
const FIN = new Date("2026-01-01T00:00:00Z");
const dias = (n: number) => new Date(FIN.getTime() + n * 86_400_000);

describe("la edad de reposo", () => {
  it("a los 10 días avisa de las dos cosas y NO bloquea ninguna", () => {
    const e = evaluarReposo({ finDeSecado: FIN, desenlace: "target_reached", perfil: PERFIL, ahora: dias(10) });
    expect(e.diasDeReposo).toBe(10);
    expect(e.muestra).toBe("TEMPRANA");
    expect(e.venta).toBe("TEMPRANA");
    expect(e).not.toHaveProperty("bloquea");
  });

  it("a los 35 días la muestra ya no avisa y la venta sí", () => {
    const e = evaluarReposo({ finDeSecado: FIN, desenlace: "target_reached", perfil: PERFIL, ahora: dias(35) });
    expect(e.muestra).toBe("EN_PLAZO");
    expect(e.venta).toBe("TEMPRANA");
  });

  it("a los 60 días exactos la venta entra en plazo — el borde es inclusivo", () => {
    const e = evaluarReposo({ finDeSecado: FIN, desenlace: "target_reached", perfil: PERFIL, ahora: dias(60) });
    expect(e.venta).toBe("EN_PLAZO");
  });

  it("un secado ABANDONADO no arranca el reloj, y lo dice", () => {
    // Control negativo: el reposo no es «tiempo desde que se dejó de secar»,
    // es «tiempo desde que llegó a humedad objetivo». Si esta prueba cae,
    // alguien arrancó el reloj de un secado que nunca llegó.
    const e = evaluarReposo({ finDeSecado: FIN, desenlace: "abandoned", perfil: PERFIL, ahora: dias(90) });
    expect(e.diasDeReposo).toBeNull();
    expect(e.limitaciones).toContain("SECADO_SIN_OBJETIVO_ALCANZADO");
  });

  it("sin perfil de reposo no inventa umbrales, y lo declara", () => {
    const e = evaluarReposo({ finDeSecado: FIN, desenlace: "target_reached", perfil: undefined, ahora: dias(90) });
    expect(e.diasDeReposo).toBe(90);
    expect(e.muestra).toBe("SIN_UMBRAL");
    expect(e.limitaciones).toContain("PERFIL_SIN_REPOSO");
  });
});
```

- [ ] **Paso 2: correr y verla fallar** — `npx vitest run tests/beneficio/reposo.test.ts`. FALLA: el módulo no existe.

- [ ] **Paso 3: la implementación**

```ts
// lib/beneficio/reposo.ts
/**
 * El reposo es una EDAD, no una fase. No se declara, no se cierra, y no
 * bloquea nada: devuelve dos lecturas que la pantalla enseña junto al lote.
 * Doctrina de la casa (§A.2): bloquear se esquiva en el patio, y entonces el
 * sistema sabe menos.
 */
export type CompuertaDeReposo = "TEMPRANA" | "EN_PLAZO" | "SIN_UMBRAL";

export interface EstadoDeReposo {
  /** Nulo cuando el reloj no arrancó: sin fin de secado, o sin objetivo alcanzado. */
  readonly diasDeReposo: number | null;
  readonly muestra: CompuertaDeReposo;
  readonly venta: CompuertaDeReposo;
  /** Lo que faltó para dar una lectura completa. Va hasta la pantalla. */
  readonly limitaciones: readonly string[];
}

export interface EntradaDeReposo {
  readonly finDeSecado: Date | null;
  readonly desenlace: string | null;
  readonly perfil: { readonly diasParaMuestra: number; readonly diasParaVenta: number } | undefined;
  readonly ahora: Date;
}

const MS_POR_DIA = 86_400_000;

export function evaluarReposo(e: EntradaDeReposo): EstadoDeReposo {
  const limitaciones: string[] = [];

  if (!e.finDeSecado) limitaciones.push("SIN_FIN_DE_SECADO");
  else if (e.desenlace !== "target_reached") limitaciones.push("SECADO_SIN_OBJETIVO_ALCANZADO");

  const arranca = e.finDeSecado !== null && e.desenlace === "target_reached";
  const diasDeReposo = arranca
    ? Math.floor((e.ahora.getTime() - e.finDeSecado!.getTime()) / MS_POR_DIA)
    : null;

  if (!e.perfil) limitaciones.push("PERFIL_SIN_REPOSO");

  const compuerta = (umbral: number | undefined): CompuertaDeReposo => {
    if (umbral === undefined) return "SIN_UMBRAL";
    if (diasDeReposo === null) return "SIN_UMBRAL";
    return diasDeReposo >= umbral ? "EN_PLAZO" : "TEMPRANA";
  };

  return {
    diasDeReposo,
    muestra: compuerta(e.perfil?.diasParaMuestra),
    venta: compuerta(e.perfil?.diasParaVenta),
    limitaciones,
  };
}
```

- [ ] **Paso 4: verde, build y flip-test**

```bash
npx vitest run tests/beneficio/reposo.test.ts
npm run build
```

Después del commit, mutar `>= umbral` a `> umbral` y confirmar que cae **por su
nombre** la prueba del borde inclusivo, con el archivo compilando.

- [ ] **Paso 5: commit ANTES del flip-test.**

---

## Tarea 4: `lot:release` y el estado de liberación

**Archivos:**
- Modificar: `lib/rbac/catalog.ts`, `prisma/schema.prisma` (`model Lot`)
- Crear: migración
- Probar: `tests/rbac/liberacionDelLote.test.ts`

**Interfaces:**
- Produce: permiso `lot:release`; `Lot.releasedAt`, `Lot.releasedBy`.

- [ ] **Paso 1: la prueba en rojo — y el guardia que de verdad importa**

```ts
// tests/rbac/liberacionDelLote.test.ts
describe("liberar un lote", () => {
  it("Farm Manager puede liberar", async () => {
    const lote = await loteDePrueba();
    await liberarLote(gerente, lote.id);
    const leido = await prisma.lot.findUniqueOrThrow({ where: { id: lote.id } });
    expect(leido.releasedAt).not.toBeNull();
    expect(leido.releasedBy).toBe(gerente.userAccountId);
  });

  it("Farm Operator NO puede liberar, aunque tenga lot:manage", async () => {
    // ESTE es el guardia de la tarea. `Farm Operator` tiene `lot:manage`
    // (catalog.ts:363), así que si la liberación se colgara de ese permiso —que
    // es lo natural y lo equivocado— cualquier operario de campo autorizaría
    // una decisión comercial. Control positivo abajo: el mismo operario SÍ
    // puede hacer una operación de lot:manage, para que este «no puede» no sea
    // el vacío de un operario sin permisos.
    await expect(liberarLote(operario, lote.id)).rejects.toThrow(/permiso/i);
    await expect(registrarAlgoDeLotManage(operario, lote.id)).resolves.toBeTruthy();
  });

  it("liberar NO apaga el aviso de venta temprana", async () => {
    // §A.4. Si el estado callara la advertencia, liberar sería la forma de
    // esquivar el sistema — exactamente lo que §A.2 existe para evitar.
    const lote = await loteConReposoDe(41);
    await liberarLote(gerente, lote.id);
    const v = await estadoDeVentaDelLote(lote.id);
    expect(v.venta).toBe("TEMPRANA");
    expect(v.liberado).toBe(true);
  });
});
```

- [ ] **Paso 2: correr y verla fallar.**

- [ ] **Paso 3: el permiso**

En `lib/rbac/catalog.ts`, junto a los demás de `lot`:

```ts
  { resourceType: "lot", action: "release", description: "Authorize a rested lot for sale. Deliberately separate from lot:manage, which every Farm Operator has." },
```

y **sólo** en `Farm Manager`:

```ts
      ["lot", "release"],
```

- [ ] **Paso 4: el esquema**

```prisma
  /// La liberación es una DECISIÓN, no una medición: no se deriva de la edad de
  /// reposo, porque depende del arreglo con el comprador (§A.4). No apaga el
  /// aviso de venta temprana: la ficha enseña las dos cosas.
  releasedAt DateTime? @map("released_at")
  releasedBy String?   @map("released_by") @db.Uuid
```

- [ ] **Paso 5: migración, verde, build, declarar la prueba en su carril, commit.**

---

## Tarea 5: `hulling` en el enum y en el balance

**La tarea con más riesgo del plan, y la razón es medible:** `conservesMass()` decide
si un hueco entre entrada y salida es sospechoso. La trilla **conserva masa** —100
pergamino = 80 verde + 18 cascarilla + 2 merma, todo vuelve a la finca (§B.2)—, así que
si `hulling` no entra en `CONSERVING_TYPES`, cada trilla pasará con un hueco del 18 %
sin que nadie lo note.

**Archivos:**
- Modificar: `prisma/schema.prisma` (enum), `lib/traceability/balance.ts`
- Probar: `tests/traceability/balanceDeTrilla.test.ts`

- [ ] **Paso 1: la prueba en rojo**

```ts
it("la trilla conserva masa: 100 = 80 verde + 18 cascarilla + 2 merma", () => {
  expect(conservesMass("hulling")).toBe(true);
});

it("y el control negativo: stage_change NO conserva", () => {
  // Sin esta línea, un `return true` para todo pasaría la prueba de arriba.
  expect(conservesMass("stage_change")).toBe(false);
});
```

- [ ] **Paso 2: verla fallar** — falla al compilar porque `"hulling"` no es del tipo.

- [ ] **Paso 3: el enum y la clasificación**

En `prisma/schema.prisma`, dentro de `enum LotTransformationType`, tras `selection`:

```prisma
  hulling
```

En `lib/traceability/balance.ts`, dentro de `CONSERVING_TYPES`, con su razón:

```ts
  // La trilla conserva por diseño: el verde, la cascarilla y la merma declarada
  // suman la entrada, y **todo vuelve a la finca** — ninguna de las tres formas
  // de trillar (Cafelino, Kiva, mazo y pilón) se queda con material (§B.1).
  // Si esto saliera de aquí, cada trilla pasaría con un hueco del ~18 %, que es
  // la cascarilla, leído como «bien».
  "hulling",
```

- [ ] **Paso 4: el guardia de que la trilla es OPCIONAL (§B.3)**

Un lote vendido en pergamino nunca se trilla, así que **ninguna etapa posterior puede
exigirla como precondición**. Eso es fácil de romper sin darse cuenta el día que
alguien escriba «para vender verde hace falta una trilla», y entonces el pergamino
deja de poder venderse. El guardia:

```ts
it("un lote SIN trilla puede venderse igual — la trilla nunca es precondición", async () => {
  const pergamino = await loteDePrueba({ stage: "pergamino" });
  const t = await registrarVenta(gerente, pergamino.id, { masaKg: 50 });
  expect(t.transformationType).toBe("sale");
});

it("control positivo: un lote CON trilla también puede venderse", async () => {
  // Sin esta línea, una venta rota para todos haría pasar la de arriba por la
  // razón equivocada.
  const verde = await loteTrilladoDePrueba();
  const t = await registrarVenta(gerente, verde.id, { masaKg: 40 });
  expect(t.transformationType).toBe("sale");
});
```

- [ ] **Paso 5: migración, verde, build, declarar la prueba, commit.**

- [ ] **Paso 6: flip-test** — quitar `"hulling"` de `CONSERVING_TYPES` y confirmar que
cae la primera prueba por su nombre, con el archivo compilando.

---

## Tarea 6: La custodia de una trilla que ocurre fuera

**Archivos:**
- Modificar: `prisma/schema.prisma` (`model LotTransformation`)
- Crear: migración
- Probar: `tests/traceability/custodiaDeTrilla.test.ts`

- [ ] **Paso 1: la prueba en rojo**

```ts
it("una trilla en Cafelino declara quién la hizo y cuándo volvió", async () => {
  const t = await registrarTrilla({ performedByOrganizationId: cafelino.id, custodyOut: salida, custodyIn: vuelta });
  expect(t.performedByOrganizationId).toBe(cafelino.id);
  expect(t.custodyIn!.getTime()).toBeGreaterThan(t.custodyOut!.getTime());
});

it("una trilla a mano en la propia finca no necesita custodia, y sigue siendo válida", async () => {
  // Control del «avisa, no bloquea»: mazo y pilón en Las Nubes es una de las
  // tres formas reales (§B.1). Si esta cae, alguien hizo obligatoria la
  // custodia y acaba de prohibir la forma que Daniel usa en su propia finca.
  const t = await registrarTrilla({ custodyOut: null, custodyIn: null });
  expect(t.id).toBeTruthy();
});
```

- [ ] **Paso 2: verla fallar. Paso 3: las columnas**

```prisma
  /// Quién ejecutó la transformación, cuando NO es la organización dueña del
  /// lote. Dos de las tres formas de trillar ocurren fuera (§B.1). Nulo = la
  /// propia organización, que es el caso de mazo y pilón.
  performedByOrganizationId String?       @map("performed_by_organization_id") @db.Uuid
  performedByOrganization   Organization? @relation("LotTransformationPerformedBy", fields: [performedByOrganizationId], references: [id])
  performedAtLocationId     String?       @map("performed_at_location_id") @db.Uuid
  performedAtLocation       Location?     @relation("LotTransformationPerformedAt", fields: [performedAtLocationId], references: [id])
  /// Cuándo salió el material y cuándo volvió. Los dos nulos cuando nunca salió.
  custodyOut DateTime? @map("custody_out")
  custodyIn  DateTime? @map("custody_in")
```

**Ojo:** `Organization` y `Location` necesitan el lado inverso de cada relación, o
`prisma validate` falla. Añadirlos en los dos modelos.

- [ ] **Paso 4: migración, verde, build, declarar la prueba, commit.**

---

## Tarea 7: `ByproductBatch` — dónde va la cascarilla

**Archivos:**
- Modificar: `prisma/schema.prisma`
- Crear: `lib/traceability/subproductos.ts`, migración
- Probar: `tests/traceability/subproductos.test.ts`

- [ ] **Paso 1: la prueba en rojo**

```ts
it("una trilla produce su lote de cascarilla con destino compost", async () => {
  const b = await crearSubproducto({ tipo: "CASCARILLA", destino: "COMPOST", masaKg: 18, transformationId: trilla.id });
  expect(b.byproductType).toBe("CASCARILLA");
  expect(b.destination).toBe("COMPOST");
});

it("el subproducto NO es merma: no toca declaredLossQuantity", async () => {
  // El guardia del §B.2. Contar la cascarilla como merma inflaría la pérdida
  // declarada un 18 % en cada trilla y escondería la merma de verdad.
  const t = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: trilla.id } });
  expect(Number(t.declaredLossQuantity ?? 0)).toBeLessThan(5);
});
```

- [ ] **Paso 2: verla fallar. Paso 3: el modelo**

```prisma
/// Un lote de subproducto del beneficio. Copia la mitad RESUELTA de
/// `BiocharBatch` —código, ubicación de producción, trazabilidad— y **no**
/// intenta la mitad que no existe: la aplicación a una parcela no está
/// modelada en ningún sitio, y su propio comentario la da por escrita (§C.1).
/// El día que se escriba, tiene que servir al biochar y a esto a la vez.
model ByproductBatch {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  byproductType ByproductType @map("byproduct_type")
  destination   ByproductDestination

  massKg Decimal @map("mass_kg") @db.Decimal(10, 3)

  /// De qué transformación salió. Requerido: un subproducto sin origen no es
  /// trazable, y la trazabilidad es la razón de esta tabla.
  transformationId String            @map("transformation_id") @db.Uuid
  transformation   LotTransformation @relation(fields: [transformationId], references: [id])

  producedAtLocationId String   @map("produced_at_location_id") @db.Uuid
  producedAtLocation   Location @relation("ByproductBatchProducedAt", fields: [producedAtLocationId], references: [id])

  organizationId String       @map("organization_id") @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id])

  createdAt DateTime @default(now()) @map("created_at")

  @@schema("traceability")
}

enum ByproductType {
  CASCARILLA
  PULPA

  @@schema("traceability")
}

/// Hoy los dos van a compost. El enum lleva los otros tres porque el destino es
/// un dato del mundo, no una constante: la pulpa puede ir al biochar, que ya
/// tiene modelo, y la cascarilla no.
enum ByproductDestination {
  COMPOST
  BIOCHAR
  DISPOSAL
  SALE

  @@schema("traceability")
}
```

- [ ] **Paso 4: migración, verde, build, declarar la prueba, commit.**

---

## Tarea 8: Registrar una trilla, de punta a punta

La que junta las anteriores. **Una entrada, tres salidas, en una transacción.**

**Archivos:**
- Crear: `lib/traceability/trilla.ts`
- Probar: `tests/traceability/trilla.test.ts`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: `registrarTrilla(entrada): Promise<ResultadoDeTrilla>`.

- [ ] **Paso 1: la prueba en rojo, con el caso hostil**

```ts
it("100 kg de pergamino producen el lote verde, la cascarilla y la merma", async () => {
  const r = await registrarTrilla({
    lotePergaminoId: lote.id, masaEntradaKg: 100,
    masaVerdeKg: 80, masaCascarillaKg: 18, mermaKg: 2,
    performedAtLocationId: lasNubes.id, actor: operario,
  });
  expect(Number(r.loteVerde.quantity)).toBe(80);
  expect(Number(r.subproducto.massKg)).toBe(18);
  expect(Number(r.transformacion.declaredLossQuantity)).toBe(2);

  // Y la suma cierra, que es el punto entero de la tarea.
  const salidas = 80 + 18 + 2;
  expect(salidas).toBe(100);
});

it("si falla la creación del subproducto, la trilla ENTERA se revierte", async () => {
  // Atomicidad. Una trilla a medias dejaría el lote descontado sin el verde
  // creado: material desaparecido del libro mayor.
  await expect(registrarTrillaConSubproductoInvalido()).rejects.toThrow();
  const balance = await computeLotBalance(lote.id);
  expect(balance.quantity.toNumber()).toBe(100);
});

it("una humedad desconocida NO se convierte en cero", async () => {
  // Regla literal del paquete, §B.2.
  const r = await registrarTrilla({ humedadDelVerde: null });
  expect(r.humedadDelVerde).toBeNull();
});

it("sin permiso lot:manage NO se puede trillar, y el control positivo al lado", async () => {
  const entrada = {
    lotePergaminoId: lote.id, masaEntradaKg: 100,
    masaVerdeKg: 80, masaCascarillaKg: 18, mermaKg: 2,
    performedAtLocationId: lasNubes.id,
  };
  await expect(registrarTrilla({ ...entrada, actor: ajeno })).rejects.toThrow(/permiso/i);
  // Control positivo: el mismo lote, la misma entrada, un actor CON permiso.
  // Sin esta línea, un `rejects` que saltara por cualquier otra razón —lote
  // inexistente, masa mal formada— se leería como «el permiso funciona».
  await expect(registrarTrilla({ ...entrada, actor: operario })).resolves.toBeTruthy();
});
```

- [ ] **Paso 2: verla fallar. Paso 3: implementar en una `prisma.$transaction`.**

- [ ] **Paso 4: verde, build, declarar la prueba, commit.**

- [ ] **Paso 5: flip-test** — sacar la creación del subproducto de la transacción y
confirmar que cae la prueba de atomicidad por su nombre.

---

## Tarea 9: El reposo llega hasta la pantalla

**Sin esta tarea nada de lo anterior se ve.** La Tarea 3 construyó `evaluarReposo` y
nadie lo llama: la tabla de archivos de este plan prometía la fase `reposo` en
`veredictoDelLote` y ninguna tarea la escribía. Esto lo cierra.

**Archivos:**
- Modificar: `lib/beneficio/desdeElLote.ts`
- Probar: `tests/beneficio/reposoEnElVeredicto.test.ts`

**Interfaces:**
- Consume: `evaluarReposo` (Tarea 3), `perfil.reposo` (Tarea 2), `endedOutcome` (Tarea 1).
- Produce: `VeredictoDeFase.fase` admite `"reposo"`, y `VeredictoDeFase.reposo:
  EstadoDeReposo | null`.

- [ ] **Paso 1: la prueba en rojo**

```ts
it("un lote en reposo emite su veredicto con los días y las dos compuertas", () => {
  const v = veredictoDelLote(entradaEnReposo({ dias: 41 }));
  expect(v).not.toBe("SIN_VEREDICTO");
  const veredicto = v as VeredictoDeFase;
  expect(veredicto.fase).toBe("reposo");
  expect(veredicto.reposo!.diasDeReposo).toBe(41);
  expect(veredicto.reposo!.venta).toBe("TEMPRANA");
});

it("un lote en reposo SIN el dato nuevo sigue declarando su limitación, no se calla", () => {
  // El mismo guardia que ya existe para SIN_INSTRUMENTO_DECLARADO: la falta de
  // un dato produce una limitación nombrada, nunca un silencio. Si esta cae,
  // alguien hizo que el veredicto desapareciera cuando falta `endedOutcome`.
  const v = veredictoDelLote(entradaEnReposo({ desenlace: null })) as VeredictoDeFase;
  expect(v.reposo!.limitaciones).toContain("SECADO_SIN_OBJETIVO_ALCANZADO");
  expect(v.fase).toBe("reposo");
});

it("fermentación y secado siguen dando lo mismo que antes", () => {
  // Control positivo de no-regresión: esta tarea ENSANCHA un tipo que usan dos
  // fases vivas. Si las rompe, se nota aquí y no en producción.
  const f = veredictoDelLote(entradaDeFermentacion()) as VeredictoDeFase;
  expect(f.fase).toBe("fermentacion");
  expect(f.ph).not.toBeNull();
});
```

- [ ] **Paso 2: correr y verla fallar** — `npx vitest run tests/beneficio/reposoEnElVeredicto.test.ts`.

- [ ] **Paso 3: ensanchar el tipo y enchufar**

En `lib/beneficio/desdeElLote.ts`:

```ts
export interface VeredictoDeFase {
  readonly fase: "fermentacion" | "secado" | "reposo";
  // … lo que ya había …
  /** Sólo en la fase `reposo`. Nulo en las otras dos. */
  readonly reposo: EstadoDeReposo | null;
}
```

y en `EntradaDelLote`:

```ts
  readonly fase: { tipo: "fermentacion" | "secado" | "reposo"; iniciadaEn: Date } | null;
  /** El fin del secado y su desenlace, para el reloj del reposo (Tarea 1). */
  readonly finDeSecado?: { readonly endedAt: Date | null; readonly endedOutcome: string | null };
```

**Ojo, y es la parte que rompe el build si se hace a medias:** ensanchar
`VeredictoDeFase.fase` obliga a revisar **todos** los sitios que hacen `switch` o
comparan contra ese campo. Buscarlos antes de tocar nada:

```bash
grep -rn "\.fase\b" lib/ app/ --include="*.ts" --include="*.tsx"
```

- [ ] **Paso 4: verde, y `npm run build` obligatorio** — esta tarea ensancha un tipo
usado por pantallas: `vitest` pasará y el build es lo único que ve el resto.

- [ ] **Paso 5: commit, y flip-test** — devolver `null` en `reposo` y confirmar que
cae la primera prueba por su nombre.

---

## Compuerta final de la rama

```bash
npx tsc --noEmit
npm run build
bash scripts/ci.sh
bash scripts/ci-con-base.sh
```

Y el control que este plan exige por encima de los demás: **contar las pruebas nuevas
que de verdad corrieron**. Si el carril con base no subió en el número de archivos que
este plan añade, alguna prueba se quedó sin declarar y está diciendo «no tests».
