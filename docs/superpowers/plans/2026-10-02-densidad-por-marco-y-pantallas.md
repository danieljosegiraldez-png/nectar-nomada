# La densidad por marco y las dos pantallas — plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans`. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que la densidad salga de los metros entre plantones y no del área del polígono, y que exista cómo declarar la forma del lote y el rango de una microparcela desde la aplicación.

**Arquitectura:** una función nueva al lado de `computePlotDensity`, no en su lugar; sus **dos** consumidores de producción se migran uno a uno con su prueba, y la vieja se retira cuando no queda ninguno. Las dos pantallas siguen el patrón de `RangosDeBloqueForm`, que entró con el PR #600.

**Stack:** Next.js 16, Prisma 7, vitest 4, next-intl.

**Spec:** `docs/superpowers/specs/2026-10-02-forma-del-lote-y-densidad-design.md`, §7.4, §8 y §9.

**Planes anteriores:** `2026-10-02-planton-en-la-rejilla.md` y `2026-10-02-forma-del-lote.md`. **Este plan los necesita los dos:** la densidad usa las celdas de la forma (tarea 2 del segundo), y las pantallas escriben coordenadas que el disparador del primero vigila.

## Restricciones globales

Las mismas de los dos planes anteriores, repetidas porque quien lea una tarea puede no haber leído los otros:

- **Node no está en el PATH:** `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`.
- **`NODE_OPTIONS=--max-old-space-size=8192`** delante de `typecheck` y `build`.
- **El veredicto es la línea `Test Files`, nunca `Tests`.**
- **La base del 55433 es compartida:** prohibido `test:db -- reset`, `prisma migrate reset`, `db push --force-reset`, borrar bases y fijar `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
- **Nunca `git add -A`;** contar el stat antes de empujar. **Commitear antes de mutar.**
- **`npm run build` no es opcional aunque `tsc` pase.** `vitest` no comprueba tipos y `npm run verify` no corre `next build`: una clase exportada desde un archivo `"use server"` rompe el módulo entero y sólo lo ve el build.
- **Los números en `<CampoNumerico>`, nunca en `<input type="number">` a secas.** En Chrome, girar la rueda sobre uno con foco cambia su valor, y en un formulario de campo eso convierte «no se midió» en otro número sin que nadie lo vea. Lo vigila `tests/arquitectura/numeros-sin-rueda.test.ts`.
- **El `redirect` va FUERA del `try`.** Next lo implementa lanzando, así que dentro del `try` lo atrapa el `catch` y vuelve como un error en pantalla cuando todo salió bien (PR #514).

---

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `lib/traceability/densidadPorMarco.ts` | **crear** — las tres cifras del §8, con su procedencia |
| `lib/traceability/plantingCohorts.ts` | **modificar** — primer consumidor; `computePlotDensity` se queda hasta la tarea 3 |
| `lib/traceability/pendienteDeLaParcela.ts` | **modificar** — segundo consumidor |
| `lib/traceability/formaDeLaParcela.ts` | **modificar** — declarar y quitar trozos, con su `AuditEvent` |
| `app/actions/traceability.ts` | **modificar** — las acciones de las dos pantallas |
| `app/components/traceability/FormaDelLoteForm.tsx` | **crear** — pantalla de la forma |
| `app/components/traceability/RangoDeMicroparcelaForm.tsx` | **crear** — §6 del diseño del 2026-10-01, que nunca se construyó |
| `messages/es.json`, `messages/en.json` | **modificar** |

---

### Tarea 1: Las tres cifras de la densidad

**Archivos:**
- Crear: `lib/traceability/densidadPorMarco.ts`
- Crear: `tests/territorio/densidadPorMarco.test.ts`

**Interfaces:**
- Consume: `celdasDeLaForma` y `tableroDe` de `lib/traceability/formaDeLaParcela.ts`.
- Produce:
  - `densidadDisenada(marco: Marco): number | null`
  - `areaPlantadaHectareas(celdas: number, marco: Marco): number | null`
  - `densidadDelLote(entrada: EntradaDeDensidad): DensidadDelLote`
  - `type Marco = { plantSpacingMeters: number | null; rowSpacingMeters: number | null }`

**No sustituye a `computePlotDensity` en esta tarea.** Entra al lado. Sus dos consumidores se migran en las tareas 2 y 3, y la vieja se retira allí.

- [ ] **Paso 1: la prueba que falla**

```ts
/**
 * Las tres cifras de la densidad, cada una con su procedencia (§8).
 *
 * Hermética: aritmética. Carril de `ci.sh`.
 *
 * **Por qué no se calcula con `areaHectares`:** en un lote irregular el área del
 * polígono incluye la roca y el camino, así que la densidad real saldría baja por
 * una razón que no es agronómica. El área se deriva de la rejilla.
 */
import { describe, expect, it } from "vitest";
import { areaPlantadaHectareas, densidadDelLote, densidadDisenada } from "../../lib/traceability/densidadPorMarco";

const PINK_BOURBON = { plantSpacingMeters: 1.8, rowSpacingMeters: 2.5 };

describe("densidadDisenada", () => {
  it("el marco de la Pink Bourbon da 2.222 plantas por hectárea", () => {
    expect(densidadDisenada(PINK_BOURBON)).toBe(2222);
  });

  /** El control que TIENE que salir distinto: si un marco distinto da lo mismo, no mide. */
  it("un marco distinto da un número distinto", () => {
    expect(densidadDisenada({ plantSpacingMeters: 1, rowSpacingMeters: 2 })).toBe(5000);
  });

  it("sin uno de los dos metros no hay densidad diseñada: null, nunca cero", () => {
    expect(densidadDisenada({ plantSpacingMeters: 1.8, rowSpacingMeters: null })).toBeNull();
    expect(densidadDisenada({ plantSpacingMeters: null, rowSpacingMeters: 2.5 })).toBeNull();
  });

  it("un metro de cero o negativo no da una densidad infinita: null", () => {
    expect(densidadDisenada({ plantSpacingMeters: 0, rowSpacingMeters: 2.5 })).toBeNull();
    expect(densidadDisenada({ plantSpacingMeters: -1, rowSpacingMeters: 2.5 })).toBeNull();
  });
});

describe("areaPlantadaHectareas", () => {
  it("las 176 celdas del lote con la esquina cortada dan 0,0792 ha", () => {
    expect(areaPlantadaHectareas(176, PINK_BOURBON)).toBeCloseTo(0.0792, 4);
  });

  it("sin celdas no hay área: null, no cero", () => {
    expect(areaPlantadaHectareas(0, PINK_BOURBON)).toBeNull();
  });

  it("sin marco no hay área", () => {
    expect(areaPlantadaHectareas(176, { plantSpacingMeters: null, rowSpacingMeters: 2.5 })).toBeNull();
  });
});

describe("densidadDelLote", () => {
  it("con todo puesto da las tres cifras y la diferencia contra el diseño", () => {
    const d = densidadDelLote({
      marco: PINK_BOURBON, celdasPlantadas: 176, plantasContadas: 150, cohortesSinConteo: 0,
    });
    expect(d).toMatchObject({ status: "ok", disenada: 2222, celdas: 176 });
    if (d.status !== "ok") throw new Error("el status cambió: la aserción de abajo no mide");
    expect(d.real).toBeCloseTo(1894, 0);
    expect(d.areaHectareas).toBeCloseTo(0.0792, 4);
  });

  it("una siembra sin conteo bloquea la densidad real, y lo dice", () => {
    const d = densidadDelLote({
      marco: PINK_BOURBON, celdasPlantadas: 176, plantasContadas: 70, cohortesSinConteo: 2,
    });
    expect(d.status).toBe("conteo_incompleto");
    expect(d).not.toHaveProperty("real");
  });

  it("sin forma declarada no hay área ni densidad real, pero SÍ la diseñada", () => {
    const d = densidadDelLote({
      marco: PINK_BOURBON, celdasPlantadas: 0, plantasContadas: 150, cohortesSinConteo: 0,
    });
    expect(d.status).toBe("sin_forma");
    expect(d).toMatchObject({ disenada: 2222 });
    expect(d).not.toHaveProperty("real");
  });

  it("sin marco no hay ninguna de las tres", () => {
    const d = densidadDelLote({
      marco: { plantSpacingMeters: null, rowSpacingMeters: null },
      celdasPlantadas: 176, plantasContadas: 150, cohortesSinConteo: 0,
    });
    expect(d.status).toBe("sin_marco");
  });
});
```

**El `if (d.status !== "ok") throw` de la primera no es adorno:** sin él, un cambio de `status` dejaría las aserciones de abajo sin ejecutarse por estrechamiento de tipos y la prueba pasaría vacía.

- [ ] **Paso 2: correr y ver fallar.** Esperado: no carga, el módulo no existe. **«no tests» aquí significa eso**, no que las aserciones estén mal.

- [ ] **Paso 3: el módulo**

```ts
/**
 * La densidad de un lote, por marco de plantación.
 *
 * **Por qué no sale de `areaHectares`** (D10, 2026-10-02): la densidad se pone por
 * los metros entre plantones y entre hileras, y en un lote irregular el área del
 * polígono incluye la roca y el camino. El área plantada se deriva de la rejilla:
 * celdas × el marco. Sin topografía, y correcta en un lote irregular.
 *
 * Cada estado que no es `ok` dice QUÉ falta, y ninguno devuelve cero por un dato
 * ausente: «nunca registrado» no es «registrado como cero» (ADR-080).
 */
export type Marco = { plantSpacingMeters: number | null; rowSpacingMeters: number | null };

export type DensidadDelLote =
  | { status: "sin_marco" }
  | { status: "sin_forma"; disenada: number }
  | { status: "conteo_incompleto"; disenada: number; celdas: number; cohortesSinConteo: number }
  | { status: "ok"; disenada: number; celdas: number; areaHectareas: number; real: number; plantasContadas: number };

const metrosValidos = (m: Marco): [number, number] | null => {
  const p = m.plantSpacingMeters;
  const h = m.rowSpacingMeters;
  if (p == null || h == null) return null;
  if (!Number.isFinite(p) || !Number.isFinite(h) || p <= 0 || h <= 0) return null;
  return [p, h];
};

/** Plantas por hectárea que el marco implica. `null` si falta o no es positivo uno de los dos metros. */
export function densidadDisenada(marco: Marco): number | null {
  const m = metrosValidos(marco);
  if (!m) return null;
  return Math.round(10000 / (m[0] * m[1]));
}

/** Hectáreas bajo planta, derivadas de la rejilla. `null` sin celdas o sin marco. */
export function areaPlantadaHectareas(celdas: number, marco: Marco): number | null {
  const m = metrosValidos(marco);
  if (!m || celdas <= 0) return null;
  return (celdas * m[0] * m[1]) / 10000;
}

export function densidadDelLote(entrada: {
  marco: Marco;
  celdasPlantadas: number;
  plantasContadas: number;
  cohortesSinConteo: number;
}): DensidadDelLote {
  const disenada = densidadDisenada(entrada.marco);
  if (disenada == null) return { status: "sin_marco" };
  if (entrada.celdasPlantadas <= 0) return { status: "sin_forma", disenada };
  if (entrada.cohortesSinConteo > 0) {
    return {
      status: "conteo_incompleto", disenada,
      celdas: entrada.celdasPlantadas, cohortesSinConteo: entrada.cohortesSinConteo,
    };
  }
  const areaHectareas = areaPlantadaHectareas(entrada.celdasPlantadas, entrada.marco)!;
  return {
    status: "ok", disenada, celdas: entrada.celdasPlantadas, areaHectareas,
    real: entrada.plantasContadas / areaHectareas,
    plantasContadas: entrada.plantasContadas,
  };
}
```

- [ ] **Paso 4: correr y ver pasar.** Esperado: `Test Files 1 passed`, 11 pruebas.

- [ ] **Paso 5: compuerta, commit, flip.** Tres mutaciones que tumban pruebas distintas: quitar el `p <= 0` tumba «un metro de cero o negativo»; quitar la rama de `celdasPlantadas <= 0` tumba «sin forma declarada»; devolver `0` en vez de `null` cuando falta un metro tumba «sin uno de los dos metros».

---

### Tarea 2: Migrar el primer consumidor — `getPlotDetail`

**Archivos:**
- Modificar: `lib/traceability/plantingCohorts.ts` (la llamada de la línea ~887, `density: computePlotDensity(...)`)
- Modificar: `tests/territorio/comparacionDeLaRejilla.test.ts` o el archivo de prueba de `getPlotDetail`
- Modificar: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consume: `densidadDelLote` de la tarea 1; `celdasDeLaForma` y `tableroDe` del plan de la forma.
- Produce: `getPlotDetail` devuelve `densidad: DensidadDelLote` en vez de `density: PlotDensity`.

**`computePlotDensity` NO se borra en esta tarea.** Le queda un consumidor, y borrarla aquí rompería `pendienteDeLaParcela`.

- [ ] **Paso 1: la prueba que falla** — que `getPlotDetail` de una parcela con marco y forma devuelve `densidad.status === "ok"` con la diseñada y la real, y que sin marco devuelve `sin_marco`. Escribirla sobre el fixture que ya usa ese archivo.
- [ ] **Paso 2: correr y ver fallar.**
- [ ] **Paso 3: cambiar la llamada**, pasando el marco (`plantSpacingMeters` y `rowSpacingMeters` de la ubicación, que hay que añadir al `select`) y las celdas de la forma.
- [ ] **Paso 4: las frases** de los cuatro estados en los dos idiomas, y la paridad comprobada con el comando del otro plan.
- [ ] **Paso 5: correr, `tsc`, `ci.sh`, `build`, commit.**
- [ ] **Paso 6: flip** — pasar `areaHectares` en vez de las celdas de la forma tiene que tumbar la prueba que afirma la cifra real; si no la tumba, la prueba no distingue las dos fuentes y hay que apretarla.

---

### Tarea 3: Migrar el segundo consumidor y retirar la vieja

**Archivos:**
- Modificar: `lib/traceability/pendienteDeLaParcela.ts`
- Modificar: `lib/traceability/plantingCohorts.ts` (quitar `computePlotDensity` y el tipo `PlotDensity`)
- Modificar: `tests/traceability/pendienteDeLaParcela.test.ts`, `tests/traceability/plotDensity.test.ts`

**Lo que hay que leer antes de tocar nada:** `pendienteDeLaParcela.ts` tiene un comentario en su línea 40 que dice que **el aviso de área sale de ahí y NO de `computePlotDensity`**, porque ésa devuelve `conteo_incompleto` antes de mirar el área, y así un lote sin área y con una siembra sin conteo se quedaba sin su aviso. Esa conducta no se pierde: la función nueva tiene el mismo orden de estados, así que el aviso sigue teniendo que salir del consumidor.

- [ ] **Paso 1: la prueba que falla** — que un lote sin marco y con una siembra sin conteo produce **los dos** avisos, no uno. Es el caso que el comentario de la línea 40 protege.
- [ ] **Paso 2: correr y ver fallar.**
- [ ] **Paso 3: migrar el consumidor.**
- [ ] **Paso 4: borrar `computePlotDensity` y `PlotDensity`**, y adaptar `tests/traceability/plotDensity.test.ts` — o borrarlo si lo único que probaba era la función retirada, diciéndolo en el mensaje del commit.
- [ ] **Paso 5: el control de que no queda ningún consumidor:**

```bash
grep -rn "computePlotDensity" lib app tests | wc -l    # debe ser 0
grep -rn "densidadDelLote" lib | wc -l                  # control: >= 2, o no migré nada
```

La segunda línea es el control positivo: si la primera da 0 porque me equivoqué de patrón, la segunda lo delata.

- [ ] **Paso 6: compuerta completa, commit, flip.**

---

### Tarea 4: La pantalla de la forma, y la del rango de la microparcela

**Archivos:**
- Modificar: `lib/traceability/formaDeLaParcela.ts` — `declararTrozoDeForma` y `quitarTrozoDeForma`, con su `AuditEvent` en la misma transacción
- Modificar: `app/actions/traceability.ts` — las acciones, con su rama en `friendlyError`
- Crear: `app/components/traceability/FormaDelLoteForm.tsx`
- Crear: `app/components/traceability/RangoDeMicroparcelaForm.tsx`
- Modificar: `app/plots/[id]/page.tsx` y la pantalla de ajustes
- Modificar: `messages/es.json`, `messages/en.json`
- Modificar: `tests/territorio/accionesDeLaRejilla.test.ts`

**Interfaces:**
- Consume: `celdasDeLaForma`, `celdasSinPlantar`, `densidadDelLote`.
- Produce: `declararTrozoDeFormaAction` y `quitarTrozoDeFormaAction`, `guardarRangoDeMicroparcelaAction`.

**Cuatro trampas de este repositorio que esta tarea pisa de lleno, y las cuatro están medidas:**

1. **Una clase de error nueva que llegue a una acción sin su rama en `friendlyError` es un 500** (PR #433). Las ramas entran en el mismo cambio, incluida la de `SpecimenValidationError` que el plan del plantón dejó pendiente a propósito para aquí.
2. **El `redirect` fuera del `try`** (PR #514).
3. **`AuditEvent` en la MISMA transacción**, no después: cuatro pruebas de esta casa prometían atomicidad y sólo comprobaban existencia, y quitar el `tx` las dejaba verdes. Lo vigila `tests/arquitectura/audit-atomico.test.ts`, que lee la fuente.
4. **El aviso va en `role="status"`, separado del error en `role="alert"`.** El rango se guardó: no es un error.

- [ ] **Paso 1: las pruebas que fallan**, herméticas, con el patrón de `tests/territorio/accionesDeLaRejilla.test.ts`: la clase falsa del mock **dentro de `vi.hoisted`**, porque `vi.mock` se eleva y un `ReferenceError` se reporta como «no tests».
- [ ] **Paso 2: correr y ver fallar.**
- [ ] **Paso 3: el servicio**, con su `AuditEvent` dentro del `$transaction`.
- [ ] **Paso 4: las acciones**, con sus ramas de traducción y el `redirect` fuera del `try`.
- [ ] **Paso 5: los componentes**, con `CampoNumerico` y `BotonQueNecesitaConexion`.
- [ ] **Paso 6: §7.4 — encoger la forma avisa, no rechaza.** Quitar un trozo que deje plantas fuera devuelve un aviso con cuántas, no un error. **Con su caso negativo:** quitar un trozo vacío de plantas **no** avisa.
- [ ] **Paso 7: la compuerta completa —`tsc`, `ci.sh` y `build`— y el commit.**
- [ ] **Paso 8: flip, cinco mutaciones**, cada una tumbando una prueba distinta por su nombre: el aviso que no vuelve; el `AuditEvent` fuera de la transacción; el `redirect` dentro del `try`; la rama de traducción quitada; y el aviso de §7.4 emitido siempre.

---

## Auto-revisión

**Cobertura del spec, sumando los tres planes:**

| sección | plan | tarea |
|---|---|---|
| §6 el modelo de la forma | forma del lote | 1 |
| §7.1 la capacidad honesta | forma del lote | 2 y 3 |
| §7.2 marcar fuera de la forma | forma del lote | 4 |
| §7.3 la asimetría del plantón | plantón en la rejilla | 1 y 2 |
| §7.4 encoger la forma | **este** | 4, paso 6 |
| §8 la densidad | **este** | 1, 2 y 3 |
| §9 las dos pantallas | **este** | 4 |
| §10 corregir el documento del 2026-10-01 | **sin tarea, a propósito** | ver abajo |

**§10 no tiene tarea de código porque no es código:** es corregir el §4.1 del documento anterior, el comentario del esquema y el rótulo de la pantalla. El rótulo entra en la tarea 4; las dos correcciones de prosa se hacen en el commit de esa misma tarea, y queda dicho aquí para que no se pierdan.

**Consistencia de nombres entre los tres planes:** `celdasDeLaForma(forma, ambito)`, `celdasSinPlantar(forma, trozo)`, `tableroDe(rejilla)`, `densidadDelLote(entrada)`, `densidadDisenada(marco)`, `areaPlantadaHectareas(celdas, marco)`, `Marco`, `DensidadDelLote`. Se usan con esos nombres exactos en las tareas que los consumen.

**Granularidad desigual, dicha y no escondida.** La tarea 1 lleva su código entero; las tareas 2, 3 y 4 llevan los pasos, los archivos exactos, las trampas medidas y los flips, pero **no todo el código inline**. La razón: los tres dependen de cómo quede `getPlotDetail` tras el plan de la forma, y escribir hoy el código de un archivo que ese plan va a cambiar sería inventarlo. **Antes de ejecutar las tareas 2, 3 y 4, releer el archivo que tocan** — es lo que la casa manda de todas formas, y aquí es obligatorio.
