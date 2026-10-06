# Reconocimiento u4 — lectores y pantallas de la Parte 2a

**Qué se midió y sobre qué.** Árbol `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a`, rama
`recetas-parte-2a`, `HEAD = d27068d5` (comprobado con `git rev-parse --short HEAD`). `203d9236` es ancestro de
`d27068d5` (61 commits entre los dos: la Parte 1 y los diseños). **`origin/main` ya no es `203d9236`: es `1d24c431`,
18 commits más.** Entre `203d9236` y `origin/main`, de los archivos de esta lente **sólo cambió `messages/es.json` y
`messages/en.json`** (claves `rejilla*` y `error_celda_fuera_de_la_rejilla`, al final del espacio `Traceability`); medido
con `git diff --stat 203d9236 origin/main -- lib/beneficio/colaDeSecado.ts lib/beneficio/datosDelTablero.ts app/recipes
app/lots messages/es.json lib/traceability/lotProcess.ts lib/traceability/processTargets.ts
app/components/traceability/ProcesoDelLote.tsx`.

Sólo lectura: `Read`, `grep`, `git show/log/grep`, `node -e` sobre los JSON. No se corrió ninguna prueba ni se tocó
ninguna base. **Todas las líneas son de `d27068d5`.**

**Controles de las búsquedas negativas** (cada «no aparece» va con un control que sí encuentra):

| búsqueda | resultado | control | resultado del control |
|---|---|---|---|
| `recipeStep\|ProcessRecipeStep\|stepType\|motivoDesviacion\|lecturasDeCierre` en `lib app prisma tests` (archivos) | **0** | `recipeVersionId` en los mismos | 12 archivos |
| `fases\|turnEveryHours\|targetMoistureMinPct` en `app/**` (algo que ESCRIBA fases) | sólo 2 lecturas de `u.ritmo.turnEveryHours` en `app/beneficio/secado/[unidad]/page.tsx:97,99` | `fases` en `lib/traceability/processTargets.ts` | 20 |
| `endedOutcome\|"abandoned"\|"interrupted"\|target_reached` que ESCRIBA desde `app/**` | **0** (sólo la lectura de `app/lots/[id]/page.tsx:319`) | la misma búsqueda en `lib/**` | `drying.ts:247,286` (el servicio sí lo acepta) |
| lector de `ProcessRecipeVersion.expectedHours` (`git log -G "processRecipeVersion: \{ select: \{ expectedHours"`) | **0** commits | `git log -G "fases\.find" -- lib/beneficio/datosDelTablero.ts` | 2 commits (`bd07ae1e`, `0971d5b5`) |
| líneas del diseño de la 2a contra `85eab6da` | — | `git show 85eab6da:lib/beneficio/colaDeSecado.ts \| sed -n 263,275p` | **sí** es el bloque de `fases`: el diseño estaba bien en su base y se movió con la Parte 1 |

---

## 0. Lo que quien escriba el plan necesita saber primero

1. **Los dos lectores leen ritmo y metas del proceso VIGENTE** (`procesoQueCubre`), no de la FK de la corrida. Para que
   «una corrida con `recipeStepId` lea de su paso» (§3.1) hay que **añadir el paso a la consulta de la corrida**: en
   `datosDelTablero` las consultas de corridas **ni siquiera seleccionan el `id` de la corrida** (líneas 172-196).
2. **Hay un tercer lector de metas que el §3.2 no nombra:** `compareRunToTargets` (`lib/traceability/processTargets.ts:123-178`),
   que pinta la tabla «objetivo contra real» de la ficha. Lee **todas** las metas de la versión, **sin filtrar fase** y por la
   FK de la corrida (`run.processRecipeVersion`). Con metas por paso, enseñaría las de todos los pasos.
3. **Ninguna pantalla escribe fases hoy** (`RecipeForm` y `RecipeVersionForm` no mandan `fases`; R8 las copia). Y el campo
   «Cuánto debe durar (horas)» de la pantalla de recetas escribe `ProcessRecipeVersion.expectedHours`, **que ningún lector lee**:
   la cola y el tablero leen `ProcessRecipePhase.expectedHours`.
4. **El camino de un lote a sus recepciones ya existe:** `origenDelLote` (`lib/traceability/lotesDeBeneficio.ts:183-215`). Sube
   por la ascendencia hasta los lotes con `LoteDesdeRecepcion`. Sin tope y sin `tx`. Puede repetir una recepción (ver §2.4).
5. **Las acciones de terminar una fermentación y de registrar una intervención de fermentación no tienen estado de error**
   (`Promise<void>`, sin `try`): un error nuevo como `desviacion_sin_motivo` sería un 500 en la ficha. La de terminar secado
   redirige con `?error=<codigo>` sólo para `BandejaError` y `DryingValidationError`.
6. **El secado se cierra por DOS puertas:** `endDryingRun` (ficha) y `bajarBandeja` con `cierre` (la última bandeja,
   `BandejasDelSecado.tsx` → `bajarBandejaAction`). Las dos van a `cerrarCorridaEnTransaccion` (`drying.ts:272`). Las lecturas de
   cierre (§5.3) y el motivo de desviación tienen que llegar por las dos.
7. **Conflicto de fusión previsible en i18n:** `origin/main` añadió claves al final de `Traceability` (zona de
   `rejillaAnadirRangoBoton`…`error_rejilla_trampas_se_solapan_al_marcar`). Poner las claves nuevas de la 2a junto al bloque de
   recetas (`es.json:679-732`) o del proceso (`es.json:1506-1578`), no al final del espacio.

---

## 1. Los lectores de fases y metas

### 1.1 `lib/beneficio/colaDeSecado.ts` (389 líneas)

**Importaciones** (24-28):

```ts
import { prisma } from "../db";
import { lotWhereFromVisibility, resolveLotVisibility } from "../traceability/lots";
import { estadoDeRitmo, puntajeDeUrgencia, type EstadoDeRitmo, type MetaConRitmo } from "../traceability/ritmo";
import { procesoQueCubre, type Cobertura } from "../traceability/procesoDelLinaje";
import { LotProcessError } from "../traceability/errorDeProceso";
```

**El tipo que sale, y que consumen las pantallas** (31-36):

```ts
export interface RitmoDeclarado {
  readonly expectedHours: number | null;
  readonly turnEveryHours: number | null;
  readonly humedadMinPct: number | null;
  readonly humedadMaxPct: number | null;
}
```

`UnidadEnCola` (44-79) lleva `ritmo: RitmoDeclarado` y `estado` con 9 literales, entre ellos `"sin receta declarada"`,
`"receta sin ritmo de secado"` y `"linaje demasiado hondo"`.

**La consulta de corridas** (235-259) — aquí habría que añadir el paso de la corrida:

```ts
  const corridas = await prisma.dryingRun.findMany({
    where: {
      endedAt: null,
      transformations: { some: { inputs: { some: { lot: lotWhere } } } },
    },
    select: {
      id: true,
      startedAt: true,
      locationId: true,
      dryingBedLocationId: true,
      location: { select: { id: true, name: true, locationType: true, parentLocationId: true } },
      dryingBedLocation: { select: { id: true, name: true, parentLocationId: true } },
      turningEvents: { select: { occurredAt: true }, orderBy: { occurredAt: "desc" } },
      trays: {
        where: { hasta: null },
        select: { desde: true, equipment: { select: { id: true, name: true, trayNumber: true } } },
      },
      transformations: {
        orderBy: { occurredAt: "asc" },
        take: 1,
        select: { inputs: { select: { lot: { select: { id: true, lotCode: true, locationId: true } } } } },
      },
    },
    orderBy: { startedAt: "asc" },
  });
```

**Dónde lee la FASE y las METAS** (273-301) — el bloque que el §3.1 cita como 263-275 (en `85eab6da`):

```ts
    let cobertura: Cobertura | null = null;
    try {
      cobertura = await procesoQueCubre(prisma, lot.id);
    } catch (error) {
      if (!(error instanceof LotProcessError && error.message === "lineage_too_deep")) throw error;
    }
    const linajeDemasiadoHondo = cobertura === null;
    const proceso = cobertura?.vigente
      ? await prisma.lotProcess.findUnique({
          where: { id: cobertura.vigente.id },
          select: {
            processGradeValue: { select: { value: true } },
            processRecipeVersion: {
              select: {
                fases: { where: { phase: "drying" }, select: { expectedHours: true, turnEveryHours: true, targetMoistureMinPct: true, targetMoistureMaxPct: true } },
                targets: { select: { variable: true, everyHours: true, phase: true } },
              },
            },
          },
        })
      : null;

    const faseDeSecado = proceso?.processRecipeVersion?.fases[0] ?? null;
    const ritmo: RitmoDeclarado = {
      expectedHours: faseDeSecado?.expectedHours ?? null,
      turnEveryHours: faseDeSecado?.turnEveryHours ?? null,
      humedadMinPct: faseDeSecado?.targetMoistureMinPct?.toNumber() ?? null,
      humedadMaxPct: faseDeSecado?.targetMoistureMaxPct?.toNumber() ?? null,
    };
```

**El filtro de metas por fase** (211-222) — el que el §3.2 dice que pasa a `recipeStepId IS NULL`:

```ts
function metasDeSecado(
  objetivos: readonly { variable: string; everyHours: number | null; phase: string | null }[],
  ultimaPorVariable: Map<string, Date>,
): MetaConRitmo[] {
  return objetivos
    .filter((o) => o.phase === "drying" && o.everyHours != null)
    .map((o) => ({
      variable: o.variable,
      everyHours: o.everyHours,
      ultimaLectura: ultimaPorVariable.get(o.variable) ?? null,
    }));
}
```

Se usa en 313-318:

```ts
    const ritmoDelLote = estadoDeRitmo({
      ahora,
      faseIniciada: c.startedAt,
      expectedHours: ritmo.expectedHours,
      metas: metasDeSecado(proceso?.processRecipeVersion?.targets ?? [], ultimaPorVariable),
    });
```

y «tiene receta» sale del proceso vigente, no de la corrida (344): `tieneReceta: proceso?.processRecipeVersion != null,`.

**Las lecturas de la ventana** (304-311) se toman por **lote y fecha**, no por la FK de la corrida:

```ts
    const mediciones = await prisma.measurement.findMany({
      where: { lotId: lot.id, occurredAt: { gte: c.startedAt } },
      select: { variable: true, value: true, occurredAt: true },
      orderBy: { occurredAt: "desc" },
    });
```

**Funciones puras exportadas** (se prueban sin base): `estadoDeUnidad(input)` (147-179) y `urgenciaDeUnidad(input)` (186-208).
`estadoDeUnidad` decide `"receta sin ritmo de secado"` vs `"sin receta declarada"` así (175-177):

```ts
  if (ritmo.expectedHours == null && ritmo.turnEveryHours == null) {
    return input.tieneReceta ? "receta sin ritmo de secado" : "sin receta declarada";
  }
```

**Quién consume la salida — y sólo por `UnidadEnCola.ritmo`**, así que si el ritmo sale del paso con la misma forma, ninguna
pantalla cambia:

- `lib/beneficio/fichaDeUnidad.ts:122` (`const cola = await colaDeSecado(userAccountId, ahora);`) y `:187-189` (rango de humedad).
- `app/beneficio/secado/page.tsx:27-38` (`const COLOR: Record<UnidadEnCola["estado"], string>` — **total**: un estado nuevo no
  compila sin su color) y `:147-167` (`u.ritmo.expectedHours`, `u.ritmo.humedadMinPct/MaxPct`).
- `app/beneficio/secado/[unidad]/page.tsx:40,80-82,97-99` (`u.ritmo.expectedHours`, rango, `u.ritmo.turnEveryHours`).
- Textos: `messages/es.json:3214-3216` (`Secado.colaEstado_sin_receta_declarada`, `colaEstado_receta_sin_ritmo_de_secado`,
  `colaEstado_linaje_demasiado_hondo`), igual en `en.json`.

**Pruebas que lo cubren hoy** — `tests/beneficio/colaDeSecado.test.ts` (grupo `base-sembrada`, `scripts/pruebas-por-compuerta.txt:220`):

| línea | `it` |
|---|---|
| 233 | agrupa por área y sólo trae corridas abiertas del ámbito de quien mira |
| 257 | un lote sin receta declarada NO dice «al día» |
| 275 | ve el proceso del ancestro aunque la corrida no esté unida, y con receta sin fase de secado dice «receta sin ritmo de secado» |
| 321 | un proceso abierto SIN receta dice «sin receta declarada»; uno CON receta sin fase de secado, «receta sin ritmo de secado» |
| 367 | un lote con más de 64 generaciones no tumba la cola: su fila dice «linaje demasiado hondo» y las demás salen |
| 415 | ordena lo más urgente arriba |
| 432 | una corrida en bandejas sin lugar propio encuentra su área por el lote |
| 468 | quien no tiene ámbito recibe «sin ámbito», no una cola vacía |
| 486, 490, 494, 500, 507 | «el criterio, en aislamiento» (puras: listo, cerca del objetivo, pasarse de seco, con receta sin ritmo, tres volteos) |
| 519, 533 | «la ficha de una unidad» |

El ayudante de la prueba `loteEnCama` (78-185) crea la receta con fase anidada (`versions.create.fases.create[{ phase:
"drying", expectedHours, turnEveryHours, targetMoistureMinPct, targetMoistureMaxPct }]`), el proceso con
`prisma.lotProcess.create` (no `abrirProceso`: **inmune a la receta obligatoria del §5.1**) y la corrida con
`prisma.dryingRun.create({ data: { startedAt, dryingBedLocationId, locationId: cuarto, lotProcessId } })`. Para la prueba del
§8 «dos secados de volteo distinto» hay que darle `recipeStepId`. Su `afterAll` (203-230) borra `dryingRun` **antes** de
`processRecipeVersion` (que arrastra fases y metas por `onDelete: Cascade`): si la FK nueva de la corrida al paso es
`Restrict`, ese orden sigue sirviendo.

### 1.2 `lib/beneficio/datosDelTablero.ts` (511 líneas)

**Importaciones relevantes** (13-16, 30-31):

```ts
import { entradaDelLote } from "./entradaDelLote";
import { procesoQueCubre, procesosParaEntrada, type Cobertura } from "../traceability/procesoDelLinaje";
import { LotProcessError } from "../traceability/errorDeProceso";
import { perfilDeLaFaseAbierta, veredictoDelLote } from "./desdeElLote";
...
import type { MetaConRitmo } from "../traceability/ritmo";
import type { Prisma } from "../../generated/prisma/client";
```

**Filtro de metas por fase** (107-119):

```ts
function metasDeFase(
  objetivos: readonly { variable: string; everyHours: number | null; phase: string | null }[],
  fase: string,
  ultimaPorVariable: ReadonlyMap<string, Date>,
): MetaConRitmo[] {
  return objetivos
    .filter((o) => o.phase === fase && o.everyHours != null)
    .map((o) => ({
      variable: o.variable,
      everyHours: o.everyHours,
      ultimaLectura: ultimaPorVariable.get(o.variable) ?? null,
    }));
}
```

**El `select` del proceso** (121-142):

```ts
const procesoSelect = {
  endedAt: true,
  processGradeValue: { select: { value: true } },
  processRecipeVersion: {
    select: {
      fases: { select: { phase: true, expectedHours: true } },
      targets: {
        select: {
          variable: true,
          everyHours: true,
          phase: true,
          moment: true,
          minValue: true,
          maxValue: true,
          targetValue: true,
        },
      },
    },
  },
} as const;

type ProcesoDelTablero = Prisma.LotProcessGetPayload<{ select: typeof procesoSelect }>;
```

**Las consultas de corridas** (171-201) — **sin `id` de la corrida y sin nada de su receta**; para leer el paso hay que añadir
`id` y el paso:

```ts
  const [fermentaciones, secados, enProceso, enSecado, enAlmacen] = await Promise.all([
    prisma.fermentationRun.findMany({
      where: { endedAt: null, transformations: { some: { inputs: { some: { lot: lotWhere } } } } },
      select: {
        startedAt: true,
        vesselNote: true,
        vesselEquipmentId: true,
        transformations: {
          orderBy: { occurredAt: "asc" },
          take: 1,
          select: { inputs: { select: { lot: { select: { id: true, lotCode: true, organizationId: true } } } } },
        },
      },
    }),
    prisma.dryingRun.findMany({
      where: { endedAt: null, transformations: { some: { inputs: { some: { lot: lotWhere } } } } },
      select: {
        startedAt: true,
        dryingBedLocationId: true,
        transformations: {
          orderBy: { occurredAt: "asc" },
          take: 1,
          select: { inputs: { select: { lot: { select: { id: true, lotCode: true, organizationId: true } } } } },
        },
      },
    }),
    // Proceso, secado y almacén tienen fin declarado: «hay» es «sin terminar».
    cuentaLotes({ lotProcesses: { some: { endedAt: null } } }),
    cuentaLotes({ transformationInputs: { some: { transformation: { dryingRun: { endedAt: null } } } } }),
    cuentaLotes({ storageAssignments: { some: { endedAt: null } } }),
  ]);
```

**El proceso por lote, resuelto una vez** (248, 262-272):

```ts
  const procesoPorLote = new Map<string, ProcesoDelTablero | null>();
  ...
    let cobertura: Cobertura | null = null;
    try {
      cobertura = await procesoQueCubre(prisma, lot.id);
    } catch (error) {
      if (!(error instanceof LotProcessError && error.message === "lineage_too_deep")) throw error;
    }
    const procesos = cobertura ? await procesosParaEntrada(prisma, lot.id, cobertura) : [];
    const proceso = cobertura?.vigente
      ? await prisma.lotProcess.findUnique({ where: { id: cobertura.vigente.id }, select: procesoSelect })
      : null;
    procesoPorLote.set(lot.id, proceso);
```

**Las tres lecturas de fase y metas** — las que el §3.1 cita como `274–282, 351, 451` (eran de `85eab6da`):

1. Entrada de la cola de atención (310-324):

```ts
    const veredicto = cobertura === null ? LINAJE_DEMASIADO_HONDO : veredictoDelLote(entrada);
    const fases = proceso?.processRecipeVersion?.fases ?? [];
    const targets = proceso?.processRecipeVersion?.targets ?? [];

    const entradaDeTablero: EntradaDeLoteParaTablero = {
      lotId: lot.id,
      lotCode: lot.lotCode,
      veredicto: typeof veredicto === "string" ? veredicto : (veredicto as unknown as VeredictoParaCola),
      faseIniciada: c.startedAt,
      expectedHours: fases.find((f) => f.phase === c.fase)?.expectedHours ?? null,
      metas: metasDeFase(targets, c.fase, ultimaPorVariable),
      ultimaLectura: mediciones[0]?.occurredAt ?? null,
    };
```

   Ojo: `anotar` (227-237) deja **una entrada por lote**, la de la corrida que empezó antes. Con pasos, `expectedHours` y `metas`
   tienen que salir del paso de ESA corrida, no de otra del mismo lote.

2. Liberación de unidades (386-393), por **lote y fase**:

```ts
  const duracionDeFase = (
    corrida: { readonly transformations: readonly { readonly inputs: readonly { readonly lot: { readonly id: string } }[] }[] },
    fase: "fermentation" | "drying",
  ) => {
    const lotId = corrida.transformations[0]?.inputs[0]?.lot.id;
    const proceso = lotId ? procesoPorLote.get(lotId) : null;
    return proceso?.processRecipeVersion?.fases.find((f) => f.phase === fase)?.expectedHours ?? null;
  };
```

   llamada en 412-424 (`expectedHours: duracionDeFase(f, "fermentation")` y `duracionDeFase(d, "drying")`). Con pasos, la duración
   es de la corrida (`horasSugeridas` de su paso).

3. Curva del lote (484-488), dentro de `curvaDeUnLote` (462-511):

```ts
  const proceso = abierta ? (procesoPorLote.get(lotId) ?? null) : null;
  const metas = proceso?.processRecipeVersion?.targets ?? [];
  const delaFase = metas.filter((t) => abierta && t.variable === variable && t.phase === abierta.fase);
  const meta = delaFase.find((t) => t.moment === "during") ?? delaFase.find((t) => t.moment === "final");
```

   `abierta` (476) es la primera corrida cruda del lote: `crudas.find((c) => c.transformations.some((t) => t.inputs.some((i) =>
   i.lot.id === lotId)))`. Para leer las metas «de su paso» hace falta que `crudas` lleve el paso.

**`perfilDeLaFaseAbierta`** (`lib/beneficio/desdeElLote.ts:105-133`) sólo exige que `processRecipeVersion` no sea nulo
(`readonly processRecipeVersion: object | null;`, línea 111; `if (!abierta.proceso?.processRecipeVersion) return null;`, 122): no
lee fases ni metas, no cambia con pasos.

**Guardia que vigila este archivo:** `tests/arquitectura/proceso-por-el-resolvedor.test.ts:69-77` lo exime con `n: 1` (la cuenta de
`lotProcesses: { some: { endedAt: null } }` de la línea de etapas). Leer el paso por `dryingRun.recipeStep` no lo dispara; leer el
proceso de la corrida con `where: { id: x.lotProcessId }` **sí** (patrón de la línea 141-142 del guardia).

**Pruebas que lo cubren hoy** — `tests/beneficio/datos-del-tablero.test.ts` (`base-sembrada`, `pruebas-por-compuerta.txt:221`):

| línea | `it` | lee fases/metas |
|---|---|---|
| 259 | sólo trae los lotes que el permiso de quien mira alcanza | no |
| 269 | una cuenta sin ninguna asignación NO ve un tablero vacío: ve sinAmbito | no |
| 292 | la corrida de un lote visible llega, con su tanque sin declarar | no |
| 300 | una desviación SIN acción correctiva cuenta; con ella, no | no |
| 487-578 | «la línea de etapas» (5 casos) | no |
| 614, 650, 678 | «pide decisión» llega a la etapa de su fase | no |
| 763 | dice null mientras ninguna corrida ocupe una unidad declarada; después, la duración declarada de la que sí | **fases** (drying 48 h) |
| 792 | un TANQUE se libera igual que una cama: lee la duración de la FERMENTACIÓN y llega como unidad declarada | **fases** (fermentation 20 h) |
| 809 | una corrida de una unidad que quien mira NO ve no mueve la liberación | fases |
| 930 | dibuja las lecturas de la fase contra la banda de su receta, sin la anterior y sin la corregida | **metas** |
| 947, 955, 968, 972, 977, 982 | reglas de banda («nunca `initial`», «sin `during`, la `final`», «sin fase u otra fase no se pinta», «`during` gana a `final`») | **metas con `phase` nula y de otra fase** |
| 1000 | `perfilDelLote` sale del grado del proceso de la fase abierta… | no (sólo que haya receta) |
| 1034 | sin pedir curva, no hay curva | no |

Fixtures: `procesoDe(lotId, { cerrado?, versionId?, secuencia?, natural?, washed? })` (367-399, con `prisma.lotProcess.create`),
`secadoDe(lotId, { cerrado?, camaId?, lotProcessId?, inicio? })` (401-…). Recetas creadas con `prisma.processRecipeVersion.create({
data: { …, fases: { create: [...] }, targets: { create: [...] } } })` en 702-741 y 862-899. Limpieza en pasos con `try` (199-255),
borra `processTarget` y `processRecipePhase` por `recipeVersionId` antes que la versión: **una tabla de pasos con FK desde las
corridas tiene que entrar ahí entre `fermentationRun` y `processRecipeVersion`**.

Otra prueba de este lector, en otro archivo: `tests/traceability/corridaConProceso.test.ts:972` «una fermentación vieja (sin
lotProcessId) en un hijo no sale «sin grado»» — afirma `entrada!.expectedHours` = 36 desde `fases` y `entrada!.metas` =
`[{ variable: "ph", everyHours: 6, ultimaLectura: null }]` (la meta de secado es el control). Y `:1013` «un lote con más de 64
generaciones no tumba el tablero».

`tests/beneficio/pantalla-del-tablero.test.ts` (56 `it`) y `pagina-del-tablero.test.ts` (4) son **herméticas**: simulan
`datosDelTablero` y construyen `EntradaDeLoteParaTablero` a mano (`pagina-del-tablero.test.ts:104-109`). No cambian mientras el
tipo `EntradaDeLoteParaTablero` (`lib/beneficio/tablero.ts:64-77`, con `expectedHours: number | null` y `metas: readonly
MetaConRitmo[]`) no cambie.

### 1.3 Lectores de metas que el §3.2 no nombra

**`compareRunToTargets`** (`lib/traceability/processTargets.ts:123-178`) — la tabla «objetivo contra real» de la ficha:

```ts
export async function compareRunToTargets(
  userAccountId: string,
  fermentationRunId: string,
): Promise<TargetComparison[]> {
  const run = await prisma.fermentationRun.findUnique({
    where: { id: fermentationRunId },
    include: {
      processRecipeVersion: { include: { targets: { orderBy: { displayOrder: "asc" } } } },
      measurements: { select: { id: true, variable: true, value: true, occurredAt: true } },
      transformations: { include: { inputs: { include: { lot: true } } }, take: 1 },
    },
  });
  ...
  if (!run.processRecipeVersion) return [];
  ...
  return run.processRecipeVersion.targets.map((t) => {
```

- Lee **todas** las metas, de cualquier fase (hoy ya mezcla las de secado en una fermentación) y, con pasos, las de todos los pasos.
- Lee por la **FK de la corrida** (`FermentationRun.processRecipeVersionId`), no por el resolvedor.
- Usa `run.measurements` (FK `Measurement.fermentationRunId`), mientras la cola y el tablero usan `lotId` + `occurredAt >= startedAt`:
  **dos convenciones** para «las lecturas de esta corrida».
- Llamada: `app/lots/[id]/page.tsx:300-302` (`const targetRows = activeFermentation ? await
  compareRunToTargets(user.userAccountId, activeFermentation.id) : [];`), pintada en `:1155` (`<TargetComparisonTable
  rows={targetRows} />`).
- Pruebas: `tests/traceability/processTargets.test.ts` (146, 158, 170, 181, 188, 199, 210, 216, 224) y
  `tests/traceability/recipeVersions.test.ts:170`.

**Las pantallas de recetas** pintan metas sin fase ni paso: `app/recipes/page.tsx:69-84` (de la última versión) y
`app/recipes/[id]/page.tsx:130-145` (historial). Y la etiqueta del selector cuenta metas: `${v.recipe.name} · v${v.version} ·
${v.targets.length} ${t("targetsCountSuffix")}` en `app/lots/[id]/process/page.tsx:109-112` y `app/lots/[id]/page.tsx:199-202`.

**`ProcessRecipeVersion.expectedHours` no tiene lector.** Se escribe en `processTargets.ts:412` y `:685` y se precarga en
`app/recipes/[id]/page.tsx:98`; ningún archivo de `lib/` ni `app/` lo lee para juzgar (ver los controles de arriba). El §3.1
propone escribirle «la suma de `horasSugeridas`»: hoy esa columna no alimenta nada.

---

## 2. Recepción (§4.5)

### 2.1 Modelos (`prisma/schema.prisma`)

`RecepcionDeCereza` (7372-7413). Los campos que el aviso necesita:

```prisma
model RecepcionDeCereza {
  id                  String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  claveDeEnvio        String                    @unique @map("clave_de_envio")
  beneficioId         String                    @map("beneficio_id") @db.Uuid
  ...
  recibidaAt          DateTime                  @map("recibida_at")
  ...
  brix                Decimal?                  @db.Decimal(5, 2)
  puntoDeMuestreo     PuntoDeMuestreoBrix?      @map("punto_de_muestreo")
  instrumentoId       String?                   @map("instrumento_id") @db.Uuid
  veredictoBrix       VeredictoBrixDeRecepcion? @map("veredicto_brix")
  nota                String?
  estado              EstadoDeRecepcion         @default(recibida)
  ...
  lotes               LoteDesdeRecepcion[]
```

`EstadoDeRecepcion { recibida rechazada anulada }` (7303-7309). `VeredictoBrixDeRecepcion { INTAKE_OPTIMAL INTAKE_UNDERRIPE
SIN_VEREDICTO SENSOR_FAULT }` (7323-7330).

`LoteDesdeRecepcion` (7447-7461):

```prisma
model LoteDesdeRecepcion {
  id          String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  lotId       String            @map("lot_id") @db.Uuid
  lot         Lot               @relation(fields: [lotId], references: [id], onDelete: Restrict)
  recepcionId String            @map("recepcion_id") @db.Uuid
  recepcion   RecepcionDeCereza @relation(fields: [recepcionId], references: [id], onDelete: Restrict)
  kg          Decimal           @db.Decimal(10, 3)
  createdAt   DateTime          @default(now()) @map("created_at")
  createdBy   String?           @map("created_by") @db.Uuid

  @@unique([lotId, recepcionId])
  @@index([recepcionId])
  @@map("lote_desde_recepcion")
  @@schema("traceability")
}
```

En `Lot`: `desdeRecepciones LoteDesdeRecepcion[]` (3412). **Varias por lote: sí** (la unicidad es el par). Sólo los lotes de nivel 1
tienen vínculo («Los kilos viven sólo aquí, en el nivel 1», comentario de 7444-7446).

Qué estados pueden tener lotes: `armarLote` sólo toma recepciones `recibida` (`lib/traceability/lotesDeBeneficio.ts:88-89`:
`if (fila.estado !== "recibida") throw new LoteDeBeneficioError("recepcion_no_recibida");`) y `anularRecepcion` se niega con lotes
(`lib/traceability/recepcionesDeCereza.ts:231`: `throw new RecepcionError("ya_tiene_lotes")`). O sea: **toda recepción con lote
es `recibida`**; el aviso no necesita filtrar por estado, pero un `where: { estado: "recibida" }` no estorba.

### 2.2 `lib/beneficio/brixDeRecepcion.ts` (30 líneas, entero)

```ts
import { BRIX_PHYSICAL_MAX, BRIX_PHYSICAL_MIN } from "./perfiles";

export type VeredictoBrixDeRecepcion = "INTAKE_OPTIMAL" | "INTAKE_UNDERRIPE" | "SIN_VEREDICTO" | "SENSOR_FAULT";

export const BRIX_INTAKE_OPTIMO_MIN = 18.0;
export const BRIX_INTAKE_OPTIMO_MAX = 24.0;
export const BRIX_INTAKE_INMADURA_BAJO = 16.0;

export function evaluarBrixDeRecepcion(bx: number): VeredictoBrixDeRecepcion {
  // El mismo predicado que `evaluarBrix` (lib/beneficio/brix.ts). Con NaN, las dos comparaciones
  // dan falso y sale SENSOR_FAULT: un NaN nunca puede halagar el veredicto.
  if (!(bx > BRIX_PHYSICAL_MIN && bx <= BRIX_PHYSICAL_MAX)) return "SENSOR_FAULT";
  if (bx >= BRIX_INTAKE_OPTIMO_MIN && bx <= BRIX_INTAKE_OPTIMO_MAX) return "INTAKE_OPTIMAL";
  if (bx < BRIX_INTAKE_INMADURA_BAJO) return "INTAKE_UNDERRIPE";
  return "SIN_VEREDICTO";
}
```

Único importador de producción: `lib/traceability/recepcionesDeCereza.ts:25`. El veredicto se **calcula y se guarda** al recibir
(`:85-86` `const brix = input.brix ? Math.round(input.brix.valor * 100) / 100 : null; const veredictoBrix = brix == null ? null :
evaluarBrixDeRecepcion(brix);`, escrito en `:177-180`). El aviso de la receta (§4.5) es otro juicio, sobre `brix` crudo, y no lo
toca.

### 2.3 Del lote a sus recepciones: `origenDelLote` ya existe

`lib/traceability/lotesDeBeneficio.ts:183-215`:

```ts
export async function origenDelLote(lotId: string): Promise<Array<{ recepcionId: string; kg: number; nivel1LotId: string }>> {
  const origen: Array<{ recepcionId: string; kg: number; nivel1LotId: string }> = [];
  const nivel1 = new Set<string>();
  const vistos = new Set<string>([lotId]);
  let frontera = [lotId];

  while (frontera.length > 0) {
    const vinculos = await prisma.loteDesdeRecepcion.findMany({
      where: { lotId: { in: frontera } },
      select: { lotId: true, recepcionId: true, kg: true },
      orderBy: { createdAt: "asc" },
    });
    for (const v of vinculos) {
      if (nivel1.has(v.lotId)) continue;
      origen.push({ recepcionId: v.recepcionId, kg: Number(v.kg), nivel1LotId: v.lotId });
    }
    for (const v of vinculos) nivel1.add(v.lotId);

    // Sólo se sigue subiendo por los lotes de la frontera que NO son de nivel 1: uno que ya tiene
    // vínculo es el final de su rama.
    const seguir = frontera.filter((id) => !nivel1.has(id));
    const entradas = seguir.length
      ? await prisma.lotTransformationInput.findMany({
          where: { transformation: { outputs: { some: { lotId: { in: seguir } } } } },
          select: { lotId: true },
        })
      : [];
    frontera = [...new Set(entradas.map((e) => e.lotId))].filter((id) => !vistos.has(id));
    for (const id of frontera) vistos.add(id);
  }
  return origen;
}
```

- **Sin principal** («su llamador ya autorizó el lote», comentario de 181) y con el **cliente global**, no con `tx`.
- **Sin tope**: el `while` no cuenta generaciones (R1 usa 64 y lanza `lineage_too_deep`). `procesoDelLinaje.idsDeAscendencia(tx,
  lotId)` (135-155) sí tiene tope, pero no lee recepciones.
- No lowercases el id (R1 hace `enMinusculas`); un id de URL en mayúsculas compara en JS contra los que devuelve la base.
- Para el detalle: `detalleDeRecepciones(recepcionIds)` (138-170) devuelve `{ origen, detalle, recibidaAt }` **sin `brix` ni
  `claveDeEnvio`**; el aviso que «nombra la recepción» necesita una consulta propia o ampliar ésta.

Dónde se pinta hoy: la ficha, `app/lots/[id]/page.tsx:165-173` (carga) y `:975-1010` (sección «De dónde viene», `key={o.recepcionId}`).

**Pruebas:** `tests/traceability/lotesDeBeneficio.test.ts:139` «dos recepciones de 20 y 30 dan un lote de 50, SIN proceso abierto
y con su QuantityEvent» (afirma `origenDelLote` con las dos en `:149`), `:198` «A sale de R, A se divide en B y C, B y C se fusionan
en D: origenDelLote(D) devuelve R UNA vez». Brix: `tests/beneficio/brixDeRecepcion.test.ts:8,13,17,21` (hermética),
`tests/traceability/recepcionesDeCereza.test.ts:228` «el Brix se guarda con su veredicto, también fuera de rango»,
`tests/traceability/recepcionDeCereza-esquema.test.ts:128` «el Brix va con su punto de muestreo y su veredicto, o no va».

### 2.4 Lo que el §4.5 no dice y el código obliga a decidir

- **Una recepción sin Brix** (`brix` nulo es legal: `recepcionDeCereza-esquema.test.ts:128`). El diseño tiene tres ramas (fuera de
  rango, dentro, sin recepción); falta la cuarta: recepción presente sin medición.
- **La misma recepción puede salir dos veces** en `origenDelLote`: si de una recepción R se arman dos lotes de nivel 1 (A1, A2) y
  luego se fusionan, devuelve R con `nivel1LotId` A1 y R con A2 (el `continue` sólo evita repetir un mismo lote de nivel 1). El aviso
  «una por una» tiene que deduplicar por `recepcionId`. (La ficha ya usa `key={o.recepcionId}`: ese caso daría una clave de React
  repetida.)

---

## 3. La pantalla de recetas actual (la que la 2a sustituye)

### 3.1 Rutas y componentes

| ruta | archivo (líneas) | qué hace |
|---|---|---|
| `/recipes` | `app/recipes/page.tsx` (94) | `listRecipes`; tarjeta por receta con las metas de la última versión (69-84); `params.ok` → `recipeCreatedOk` (37); botón «Nueva receta» si `puedeCrearRecetaEnAlguna` (29, 43-47) |
| `/recipes/new` | `app/recipes/new/page.tsx` (48) | `listRecipeOrganizations` filtrado por `puedeEditarBeneficioEnOrganizacion` (28-32); `notFound()` sin ninguna (36); `<RecipeForm organizations variables permiteCompartida />` (45); variables de `listVariableDefinitions("proceso_de_cafe")` (38) |
| `/recipes/[id]` | `app/recipes/[id]/page.tsx` (152) | `getRecipeForEditor`; `RecipeMetadataForm` (78-82); `RecipeVersionForm` precargado con `initialTargets` (43-56) y `expectedHours={current?.expectedHours ?? null}` (98); historial con `v._count.fermentationRuns` (123-125); lee `query.ok === "renamed"` / `"versioned"` (68-69) |

Componentes (todos `"use client"`, `useActionState`, `useTranslations("Traceability")`):

- `app/components/traceability/RecipeForm.tsx` (267): `TargetRow { key, variable, moment, phase, targetValue, minValue, maxValue,
  everyHours, note }` (17-29); campos ocultos `targets[${i}][variable|moment|phase|unit]` (120-124); selector de fase con
  `phase_fermentation` / `phase_drying` (142-152); `everyHours` sólo con `during` (202-215); `expectedHours` de la versión (92-101).
  **No manda `fases`.**
- `app/components/traceability/RecipeVersionForm.tsx` (174): lo mismo para una versión nueva; `expectedHours` en 66-69. **No manda
  `fases`** (R8 copia las de la anterior).
- `app/components/traceability/RecipeMetadataForm.tsx` (45): sólo nombre y descripción.

Acciones (`app/actions/traceability.ts`): `createRecipeAction` (1240-1264, `redirect("/recipes?ok=1")`), `parseTargetRows`
(1267-1302, recorre `targets[${i}]` hasta 50), `updateRecipeAction` (1305-1326, `?ok=renamed`), `createRecipeVersionAction`
(1329-1360, `?ok=versioned`). Servicios (`lib/traceability/processTargets.ts`): `createRecipeWithVersion` (379-…),
`createRecipeVersion` (620-…), `puedeCrearRecetaEnAlguna` (480-486), `listRecipes` (488-500), `listRecipeOrganizations` (503-523),
`getRecipeForEditor` (534-557), `updateRecipeMetadata` (571-…), `listRecipeVersionsForLot` (194-…, ya filtra `status: "approved"` y
la versión más nueva de cada receta).

**No existe ninguna pantalla de fases** (control en la tabla de arriba). Enlaces a `/recipes`: `app/beneficio/destinos.ts:32`
(`{ href: "/recipes", clave: "recetas", visible: granted.has("lot:manage") }`) y `app/lots/page.tsx:89`.

### 3.2 i18n de recetas (`Traceability`, `messages/es.json` y `en.json`, mismas líneas)

`targetsRange` 665; `moment_initial|during|final` 673-675; `fermentationRecipeFromProcess` 676; `fermentationNoRecipeInProcess` 677;
`targetsCountSuffix` 678; `recipesBadge`…`recipeVersionedOk` 679-732; `recipeEveryHours*` y `recipeExpectedHours*` 1704-1708;
`recipePhaseLabel`, `phase_fermentation`, `phase_drying` 1828-1830. `Nav.recipes` 21. Ojo con un texto que pasa a ser falso:
`recipeExpectedHoursHint` (1708) dice «Sirve para saber si un batch va tarde en esta fase» y esa columna no la lee nadie.

### 3.3 Guardias y pruebas que leen estas pantallas

- **`tests/arquitectura/campos-con-dos-puertas.test.ts`** (hermético): lee `RecipeForm.tsx` y `RecipeVersionForm.tsx` (45-46),
  `parseTargetRows` (127-134) y los bloques `targets: {` / `fases:` de `createRecipeWithVersion` y `createRecipeVersion` (60-110). Sus
  `it`: 119 «el parseo encuentra los campos que se sabe que existen», 127 «la acción parsea todos los campos del formulario», 136 «LOS
  DOS servicios que escriben objetivos persisten todos los campos», 146 «LOS DOS formularios que crean objetivos mandan todos los
  campos», 159 «la duración esperada llega por sus cuatro puertas», 172 «el parseo encuentra los cinco campos de fase (control
  positivo)», 176 «LOS DOS servicios escriben todas las columnas de fase». **Si la 2a sustituye los dos formularios, este guardia
  cae o hay que reescribirlo** (para pasos: «un campo del paso llega por todas las puertas que lo escriben»).
- `tests/arquitectura/confirmacion-que-se-lee.test.ts` (125, 135, 140, 159): toda redirección con `?ok=` tiene que caer en una
  pantalla que compare `ok === "…"`. Una acción nueva «publicar» que redirija con `?ok=publicada` exige su rama en
  `app/recipes/[id]/page.tsx`.
- Servicio: `tests/traceability/recipeAuthoring.test.ts` (76-250), `tests/traceability/recipeVersions.test.ts` (131-309, incluido R8 en
  272, 291, 309), `tests/traceability/editarBeneficio.test.ts` (sección «recetas (crear, editar, publicar)», 298-465).

---

## 4. La ficha del lote y la página del proceso

### 4.1 Página del proceso — `app/lots/[id]/process/page.tsx` (273)

- Carga (66-112): `puedeGestionarLote`, `coberturaDelLote`, `opcionesParaProceso`, `puedeAbrirProceso`, `puedeDevolverASecado`,
  `puedeGestionarProceso(user, cobertura.vigente.id)`; un `LotProcessError` se dice en pantalla (89-104).
- Recetas para abrir (109-112):

```ts
  const recetas = (await listRecipeVersionsForLot(user.userAccountId, lot.id)).map((v) => ({
    id: v.id,
    label: `${v.recipe.name} · v${v.version} · ${v.targets.length} ${t("targetsCountSuffix")}`,
  }));
```

- **Dónde se pinta la receta** (165-172): `{t("processNumberHeading", { n: p.sequenceOrder })} · {p.processRecipeVersion?.recipe.name ??
  t("processNoRecipeLabel")}` y, por proceso de la cadena, sus manejos (196-207):

```tsx
          {p.interventions.length > 0 ? (
            <ul>
              {p.interventions.map((i) => (
                <li key={i.id}>
                  {fecha(i.occurredAt)} · {i.catalogValue.value}
                  {i.notes ? ` · ${i.notes}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="nn-muted">{t("processNoInterventionsYet")}</p>
          )}
```

  y `processRunsAttached` con `p.fermentationRuns.length` / `p.dryingRuns.length` (209-213). Ahí irían el paso de cada registro y la
  marca de desviación.
- **Formularios del proceso abierto** (219-241), sólo con `abierto !== null && puedeGestionarElAbierto`:
  `<IntervencionForm lotProcessId={abierto.id} lotId={lot.id} opciones={intervenciones} />` (223), `CerrarProcesoForm` (228),
  `CambiarIntencionForm` / `CambiarObjetivoForm` (233-238). `abierto.id` es el **vigente**, que puede vivir en un ancestro.
- Abrir (257-270): `<AbrirProcesoForm lotId recetas grados estadosDeCereza />` (263).

`coberturaDelLote` (`lib/traceability/lotProcess.ts:821-899`) lee cada proceso con `INCLUIR_PARA_PANTALLA` (789-798):

```ts
const INCLUIR_PARA_PANTALLA = {
  processRecipeVersion: { include: { recipe: true } },
  processGradeValue: true,
  cherryStateValue: true,
  closingMoistureMeasurement: true,
  interventions: { orderBy: { occurredAt: "asc" as const }, include: { catalogValue: true, operator: true } },
  fermentationRuns: { orderBy: { startedAt: "asc" as const } },
  dryingRuns: { orderBy: { startedAt: "asc" as const } },
  lot: { select: { id: true, lotCode: true } },
} as const;
```

  Para pintar los pasos de la receta y proponer el siguiente (§4.3) hay que ampliar `processRecipeVersion` con sus pasos.
  `fermentationRuns`/`dryingRuns` sólo traen las **unidas por `lotProcessId`** (las viejas de R9 no) y **no hay
  `FermentationIntervention`** aquí.

### 4.2 Los formularios del proceso — `app/components/traceability/ProcesoDelLote.tsx` (339)

`AbrirProcesoForm` (31-127). El selector de receta, con la opción que el §5.1 vuelve ilegal (99-110):

```tsx
      <div className="nn-field">
        <label htmlFor="p-recipe">{t("processRecipeLabel")}</label>
        <select id="p-recipe" name="processRecipeVersionId" defaultValue="">
          <option value="">{t("processNoRecipe")}</option>
          {recetas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="nn-muted">{t("processNoRecipeHelp")}</p>
      </div>
```

  (`processNoRecipe` «— Sin receta —» en `es.json:1514`, `processNoRecipeHelp` «Sin receta también vale…» en 1516.) La «Libre» del
  §5.2 (intención, pasos planeados, grado, `motivoDeLibre`) va aquí.

`IntervencionForm` (130-175), donde irían la elección de paso, el motivo de desviación y las lecturas de cierre:

```tsx
export function IntervencionForm({
  lotProcessId,
  lotId,
  opciones,
}: {
  lotProcessId: string;
  lotId: string;
  opciones: OpcionSimple[];
}) {
  const [estado, accion, pending] = useActionState(registrarIntervencionAction, inicial);
  const t = useTranslations("Traceability");

  if (opciones.length === 0) {
    return <p className="nn-muted">{t("processNoInterventionVocabulary")}</p>;
  }

  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotProcessId" value={lotProcessId} />
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="i-kind">{t("processInterventionLabel")}</label>
        <select id="i-kind" name="catalogValueId" defaultValue="" required>
```

La acción (`app/actions/traceability.ts:2536-2558`) **sí tiene estado de error** (`friendlyError`) y redirige a
`/lots/${lotId}/process`:

```ts
    await registrarIntervencion(user.userAccountId, {
      lotProcessId: String(formData.get("lotProcessId") ?? ""),
      catalogValueId: String(formData.get("catalogValueId") ?? ""),
      occurredAt: new Date(),
      notes: emptyToNull(formData.get("notes")),
    });
```

El servicio (`lib/traceability/lotProcess.ts:321-381`):

```ts
export interface RegistrarIntervencionInput {
  lotProcessId: string;
  /** De uno de los catálogos de `CATALOGOS_DE_INTERVENCION`. */
  catalogValueId: string;
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
}
...
export async function registrarIntervencion(userAccountId: string, input: RegistrarIntervencionInput) {
  const proceso = await prisma.lotProcess.findUnique({ where: { id: input.lotProcessId } });
  if (!proceso) throw new LotProcessError("process_not_found");
  const lote = await loteGestionable(userAccountId, proceso.lotId);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: lote.projectId, locationId: lote.locationId }]);
  if (proceso.endedAt !== null) throw new LotProcessError("process_already_closed");
```

  y crea `tx.lotProcessIntervention.create` con auditoría `lot_process.record_intervention` dentro de la transacción (355-379).
  **No bloquea el linaje** (no usa `bloquearLinaje` ni `TRANSACCION_DEL_LINAJE`).

El desplegable sale de `opcionesParaProceso` (`lotProcess.ts:714-785`): valores de los catálogos `CATALOGOS_DE_INTERVENCION`
(`lotProcess.ts:70-94`: `condicion_oxigeno`, `manejo_temperatura`, `medio_lavado`, `metodo_inoculacion`, `sustrato_anadido`,
`recipiente`, `cereza_flotado`, `cereza_seleccion`, `levadura_cultivo`), etiqueta `${v.catalog.name} · ${v.value}` (772). Para que
el formulario sepa qué paso cumple un manejo, hay que mapear valor de catálogo → `stepType`: hoy no hay tal mapa.

Pruebas: `tests/traceability/lotProcess.test.ts:338` «registra una del catálogo de intervenciones», `:352` «rechaza un valor de un
catálogo que no describe manejos, aunque la FK sea válida», `:457` «un proceso cerrado ya no acepta cambios ni intervenciones»;
`tests/traceability/catalogos-de-intervencion-existen.test.ts:34,44,52,69`; `tests/traceability/corridaConProceso.test.ts:1058` «quien
gestiona el hijo y NO el lote del proceso no los ve…»; `tests/arquitectura/motivos-de-devolucion-traducidos.test.ts` lee
`ProcesoDelLote.tsx` (28) para `DevolverASecadoForm`.

### 4.3 La ficha — `app/lots/[id]/page.tsx` (1544)

**Corridas de la ficha:** `getLotDetail` (`lib/traceability/lots.ts:915-…`) las carga con `include` (991-997), así que las columnas
nuevas escalares (`stepType`, `recipeStepId`, `motivoDesviacion`) llegan solas; el paso como relación, no:

```ts
      ? prisma.fermentationRun.findMany({ where: { id: { in: fermentationRunIds } }, include: { interventions: { orderBy: { occurredAt: "asc" } } } })
      ...
      ? prisma.dryingRun.findMany({ where: { id: { in: dryingRunIds } }, include: { turningEvents: { orderBy: { occurredAt: "asc" } } } })
```

  `activeFermentation` y `activeDrying` en `page.tsx:266-267`.

**Dónde se pinta la receta del proceso** (1109-1146): `processCoveringShown` con `label: cobertura.vigente.recetaConVersion ??
t("processNoRecipeLabel")` (1119-1124), la mezcla (1126-1134) y la cadena `processChainShown` (1135-1142).

**Empezar** — páginas propias, con el formulario más simple:

- `app/lots/[id]/fermentation/new/page.tsx` (71): decide con `puedeEmpezarCorrida` (40) y pasa `recetaDelProceso` (string) a
  `<FermentationForm lotId={lot.id} recetaDelProceso={recetaDelProceso} />` (67). `FermentationForm.tsx` (50) tiene `vesselNote`,
  `quantity`, `unit`, `inoculated`, `inoculationNote`; la receta sólo se lee (19-21). Acción `startFermentationAction`
  (`traceability.ts:545-571`, con estado de error). Servicio `startFermentationRun` (`fermentation.ts:69-132`): la corrida toma
  `processRecipeVersionId: proceso.processRecipeVersionId` y `lotProcessId: proceso.id` (90-91) de `procesoAbiertoParaCorrida(tx,
  input.lotId)` (79).
- `app/lots/[id]/drying/new/page.tsx` (58): `<DryingForm lotId={lot.id} />` (54). `DryingForm.tsx` (39): `method` (texto libre),
  `layerDepthCm`, `quantity`, `unit`. Acción `startDryingAction` (`traceability.ts:687-713`, con estado de error). Servicio
  `startDryingRun` (`drying.ts:54-…`).

  Para «proponer el siguiente paso pendiente» estas dos páginas tienen que recibir los pasos y la historia (§4.3); hoy reciben un
  texto (`recetaDelProceso`) o nada.

**Intervención dentro de una fermentación** — inline en la ficha (1166-1179):

```tsx
            <form action={recordFermentationInterventionFormAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="fermentationRunId" value={activeFermentation.id} />
              <select name="interventionType" defaultValue="agitation">
                {FERMENTATION_INTERVENTION_TYPES.map((type) => (
```

  con `const FERMENTATION_INTERVENTION_TYPES = ["inoculation", "agitation", "purge", "addition", "sample", "transfer", "termination",
  "other"] as const;` (75). Acción **sin estado** (`traceability.ts:574-587`):

```ts
export async function recordFermentationInterventionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  await recordFermentationIntervention(user.userAccountId, {
    fermentationRunId: String(formData.get("fermentationRunId") ?? ""),
    interventionType: String(formData.get("interventionType") ?? "other") as never,
    occurredAt: new Date(),
    notes: emptyToNull(formData.get("notes")),
  });

  revalidatePath(`/lots/${lotId}`);
}
```

  Servicio (`fermentation.ts:134-154`): `requireLotAccess` y `prisma.fermentationIntervention.create` — **sin auditoría, sin mirar si la
  corrida terminó y sin mirar su proceso**. El guardián 4.2 sobre una `FermentationIntervention` tendrá que leer el proceso vigente
  aquí, que hoy no se lee.

**Terminar una fermentación** (1180-1207): campos `outputLotCode`, `outputLotType`, `quantity`, `unit`. Acción **sin estado y sin
`try`** (`traceability.ts:589-606`): cualquier error es un 500. Servicio `endFermentationRun` (`fermentation.ts:170-…`).

**Terminar un secado** — dos puertas:

1. Ficha (1293-1322) → `endDryingFormAction` (`traceability.ts:769-799`): sin estado, pero atrapa `BandejaError` y
   `DryingValidationError` y redirige a `/lots/${lotId}?error=${codigo}`. → `endDryingRun` (`drying.ts:371`) →
   `cerrarCorridaEnTransaccion` (`drying.ts:272-…`, escribe `endedOutcome: input.endedOutcome ?? null` en 284-287).
2. Bandejas: `app/components/traceability/BandejasDelSecado.tsx` → `bajarBandejaAction` (`app/actions/bandejasDelSecado.ts:52-…`, con
   estado) → `bajarBandeja(…, { cierre })` (`lib/traceability/bandejasDelSecado.ts:260-…`) → el mismo `cerrarCorridaEnTransaccion`
   (300). El guardia `tests/arquitectura/quien-lo-hizo-con-su-guardia.test.ts:56,108` fija esas dos puertas.

  **Ninguna de las dos manda `endedOutcome`** (ver controles).

Pruebas que leen la fuente de la ficha: `tests/ui/rotulos-del-lote.test.ts` (73, 79, 87, 95: los rótulos de `page.tsx` existen en los
dos idiomas y sin mayúscula suelta), `tests/traceability/cierreDeSecadoUI.test.ts:9,14` (los dos formularios de cierre de secado,
ficha y `BandejasDelSecado.tsx`), `tests/arquitectura/confirmacion-que-se-lee.test.ts`. Servicio de corridas:
`tests/traceability/fermentation.test.ts:94,179,196,219`, `tests/traceability/drying.test.ts`, `tests/traceability/bandejasDelSecado.test.ts`,
`tests/traceability/corridaConProceso.test.ts` (193-1071).

---

## 5. i18n y errores

- `messages/es.json` y `en.json`: 4092 líneas cada uno, **36 espacios en las mismas líneas**; `Traceability` 427-1883 en los dos;
  1455 claves en cada uno y **0** claves en uno sin el otro (medido con `node -e` sobre los JSON).
- Proceso: `processHeading`…`processDividedInto` 1506-1578, `chooseOption` 1580, `recordProcessInterventionButton` 1605,
  `processGradeLabel`…`processCherryStateShown` 1631-1635, `startRunNeedsOpenProcess` 1572, `error_lot_process` 1581,
  `error_proceso_sin_proceso_abierto` 1582, `error_process_target` 1799. Ficha: `recordInterventionButton` 457,
  `endFermentationButton` 464, `endDryingButton` 465, `notesLabel` 480, `interventionType_*` 601-608. Recepción:
  `origenRecepcionesHeading` 1811, `origenRecepcionLinea` 1812; `Recepcion.veredicto_*` 3723-3726.
- **Errores nuevos de la 2a** (`sin_receta`, `paso_de_otra_receta`, `paso_no_corresponde`, `desviacion_sin_motivo`…): el patrón es
  `CODIGOS_DE_PROCESO_TRADUCIDOS` en `lib/traceability/errorDeProceso.ts:17-45` + clave `error_proceso_<código>` en los dos JSON;
  `friendlyError` ya los traduce (`traceability.ts:194-196`: `const claveDeProceso = claveDeErrorDeProceso(error); if
  (claveDeProceso) return t(claveDeProceso as "error_proceso_sin_proceso_abierto");`). Lo vigila
  `tests/traceability/mensajesDeProceso.test.ts` (102-119). Un `ProcessTargetError` nuevo (para pasos/borrador) sale por el genérico
  `error_process_target` con el código crudo (`traceability.ts:307`).

---

## 6. Afirmaciones del §1 que me tocaban

| afirmación | veredicto | evidencia |
|---|---|---|
| §1: `ProcessRecipeVersion` tiene fases `ProcessRecipePhase` (`fermentation`/`drying`, horas, volteo, banda), únicas por versión y fase (`schema.prisma:4372`) | **parcial** | Contenido cierto; la línea se movió: `model ProcessRecipePhase` en `schema.prisma:4408`, `@@unique([recipeVersionId, phase])` en **4430** (en `85eab6da` sí era 4372). |
| §1: metas `ProcessTarget` con `phase` y `everyHours`, únicas por `[recipeVersionId, phase, variable, moment]` (`:4416`, `:4436`) | **parcial** | Contenido cierto (`phase ProcessPhase?` 4492, `everyHours Int?` 4474); líneas hoy: modelo en 4436, unicidad en **4494**. La unicidad incluye una `phase` anulable y en Postgres dos nulos no chocan (comentario 4488-4491). |
| §1: «No tiene pasos» | **cierta** | 0 archivos con `recipeStep\|ProcessRecipeStep\|stepType` en `lib app prisma tests`; control `recipeVersionId` = 12. |
| §1: toda versión nace `approved` (`processTargets.ts:406–411`, `:658`) | **parcial** | 406 y 411 ciertas (`status: "approved"` de receta y v1); la de `createRecipeVersion` está hoy en **684**. Además `listRecipeVersionsForLot` (204) ya filtra `approved`. |
| §1: `abrirProceso` sólo rechaza una receta archivada (`lotProcess.ts:159–166`) | **parcial** | Cierto en contenido, hoy en `lotProcess.ts:182-188` (`if (version.recipe.status === "archived") throw new LotProcessError("recipe_archived");`). Tampoco comprueba `version.status` ni la organización de la receta. |
| §1: `FermentationRun` lleva `processRecipeVersionId` y `lotProcessId`; no dice qué paso cumple | **cierta** | `fermentation.ts:90-91`; ninguna columna de paso (control de arriba). |
| §1: empezar y terminar crea `stage_change` (`fermentation.ts:87,177`; `drying.ts:72,287`) | **parcial** | Cierto; hoy `fermentation.ts:99` y `:189`, `drying.ts:76` y `:291` (más `fermentation.ts:246` y `drying.ts:346`, del asiento de balance al cerrar). |
| §1: `LotProcessIntervention` (`schema.prisma:4238`) registra, con `registrarIntervencion` (`lotProcess.ts:324`), «flotado, despulpado, reposo, mover a sombra» | **parcial** | Modelo hoy en 4269, función en **339**. La frase es el comentario de la función (330-331), pero **ningún catálogo de `CATALOGOS_DE_INTERVENCION` tiene hoy un valor de despulpado ni de lavado** (`grep -i "despulp\|pulping\|washing\|demucil"` en `lib/research/catalogs.ts`: sólo textos de definición y el valor `despulpada` de `estado_cereza`, que no está en la lista). El §7 ya lo prevé. |
| §1: `FermentationIntervention` con tipos que incluyen `inoculation` y `addition` | **cierta** | `fermentation.ts:136`; la ficha los ofrece en `page.tsx:75`. |
| §3.1: la cola (`colaDeSecado.ts:263–275`) y el tablero (`datosDelTablero.ts:274–282, 351, 451`) leen la fase | **parcial** | Lectores correctos, líneas de `85eab6da` (comprobado con `git show`). Hoy: cola 280-301 (+ metas 211-222, 317); tablero 126, 311-320, 386-393, 484-488. |
| §3.2: los lectores que filtran metas de la versión por fase son `datosDelTablero.ts` y `colaDeSecado.ts` | **parcial** | Son esos dos, pero hay un tercero que lee metas de la versión **sin filtro de fase**: `compareRunToTargets` (`processTargets.ts:123-178`), pintado en la ficha (`page.tsx:1155`). Y las pantallas de recetas listan metas (`app/recipes/page.tsx:69`, `[id]/page.tsx:130`). |
| §4.5: puede haber varias `LoteDesdeRecepcion` y el servicio las busca en la ascendencia | **cierta** | `@@unique([lotId, recepcionId])` (7457); `origenDelLote` ya sube por la ascendencia (`lotesDeBeneficio.ts:183-215`), con prueba de dos recepciones (`lotesDeBeneficio.test.ts:139`). |
| §4.5: el veredicto fijo 18–24 de `brixDeRecepcion.ts` | **cierta** | `BRIX_INTAKE_OPTIMO_MIN = 18.0`, `MAX = 24.0` (19-20), `INTAKE_OPTIMAL` en 27. |
| §6: «esta pantalla sustituye a la pantalla de fases que la Parte 1 dejó fuera» | **cierta** | Ninguna pantalla escribe fases: `RecipeForm`/`RecipeVersionForm` no mandan `fases`, y `app/**` sólo lee `u.ritmo.turnEveryHours`. |

---

## 7. Sorpresas — lo que el diseño no prevé

1. **`compareRunToTargets` es un lector de metas fuera del §3.2**, sin filtro de fase y por la FK de la corrida. Con metas por paso
   pintaría en la tabla de la fermentación las del lavado, el secado y la otra fermentación. Hay que decidir qué metas ve una corrida
   (las de su paso + las de versión de su fase).
2. **`ProcessRecipeVersion.expectedHours` no lo lee nadie**, y la pantalla de recetas lo pide con un texto que promete lo contrario
   (`recipeExpectedHoursHint`, `es.json:1708`). El §3.1 le asigna «la suma de `horasSugeridas`»: escribirla no cambia ninguna pantalla.
3. **`datosDelTablero` no selecciona el `id` de las corridas** (171-196): para leer el paso de cada corrida hay que ampliar las dos
   consultas, y la liberación (`duracionDeFase`) pasa de «por lote y fase» a «por corrida».
4. **La cola y el tablero toman las lecturas por `lotId` y fecha; `compareRunToTargets` por `Measurement.fermentationRunId`.** Las
   «lecturas de cierre» (§5.3) tienen que elegir una convención para la lista de casillas.
5. **Las acciones de terminar fermentación y de manejo de fermentación son `Promise<void>` sin `try`** (`traceability.ts:574-606`):
   un rechazo nuevo (`desviacion_sin_motivo`, `paso_no_corresponde`) sería la pantalla de error. Hay que pasarlas a `useActionState`
   o a `redirect(?error=)` como `endDryingFormAction`, y entonces la ficha debe leer ese `error`.
6. **El secado se cierra por dos puertas** (ficha y última bandeja). El paso, el motivo y las lecturas de cierre tienen que llegar por
   `endDryingFormAction` **y** por `bajarBandejaAction`. El guardia `campos-con-dos-puertas` sólo mira recetas.
7. **Ninguna pantalla escribe `DryingOutcome`.** El §0 dice que hoy un secado cortado «se termina con `abandoned` o `interrupted`»: el
   servicio lo acepta (`drying.ts:247`), pero ni la ficha ni las bandejas lo mandan; todo secado terminado desde la aplicación queda con
   `endedOutcome` nulo.
8. **`recordFermentationIntervention` no lee el proceso**, no audita y no mira si la corrida terminó (`fermentation.ts:141-154`). El
   guardián 4.2 sobre `FermentationIntervention` es la primera vez que esa puerta mira el proceso vigente.
9. **`registrarIntervencion` (proceso) no bloquea el linaje.** Si el avance y la desviación dependen de la cadena (§4.3), una
   división concurrente puede cambiarla entre la lectura y la escritura.
10. **Dos nombres repetidos que confunden un `grep`:** `registrarIntervencion` existe en `lib/traceability/lotProcess.ts:339` (proceso)
    **y** en `lib/traceability/intervenciones.ts:379` (manejo de parcela, `PlotIntervention`); y `IntervencionForm` existe en
    `ProcesoDelLote.tsx:130` **y** en `app/components/traceability/IntervencionForm.tsx` (parcela). Las tareas tienen que nombrar el
    archivo.
11. **No hay mapa catálogo → tipo de paso.** El formulario de manejo elige un `VariableCatalogValue` de nueve catálogos; para unirlo a
    un paso `pulping`/`washing`/… hace falta decir qué valores cumplen qué `stepType` (y crear los valores del §7).
12. **`origenDelLote` no tiene tope ni `tx`** y puede repetir una recepción (dos lotes de nivel 1 de la misma recepción, fusionados).
    Y una recepción con lote puede no tener Brix: el §4.5 no dice qué aviso le toca.
13. **`ProcesoEnCadena` no lleva la versión de receta** (`procesoDelLinaje.ts:34-44`). «Los registros de los procesos de la cadena que
    comparten la versión del vigente» (§4.3) necesita una lectura más; `coberturaDelLote` sí la trae en sus filas, pero sólo de los
    procesos visibles para quien mira (los `oculto` no).
14. **El campo «paso» de una corrida puede discrepar del proceso vigente.** La cola lee ritmo y «tiene receta» del vigente (resolvedor)
    y la 2a quiere el ritmo del paso de la corrida: si un reproceso abre otro proceso con otra receta mientras una corrida vieja sigue
    abierta, ritmo y metas saldrían de recetas distintas. Conviene que el lector tome ritmo **y** metas del mismo sitio.
15. **El guardia `campos-con-dos-puertas` cae al sustituir los formularios** (lee `RecipeForm.tsx` y `RecipeVersionForm.tsx` por ruta, y
    los bloques `targets: {`/`fases:` de las dos funciones de servicio). Hay que reescribirlo para pasos en la misma tarea, no quitarlo.
16. **`listRecipes` no filtra por organización** (`processTargets.ts:488-500`: autoriza con el primer lote de la base y devuelve todas
    las recetas), y una receta compartida hoy **sí** la edita quien tenga `edit_beneficio` de plataforma
    (`app/recipes/[id]/page.tsx:36`, `editarBeneficio.test.ts:393`). El §3.4 («ninguna organización edita una plantilla») cambia eso.
17. **i18n: `origin/main` ya añadió claves al final de `Traceability`.** Escribir las de la 2a en el mismo sitio dará conflicto al
    fusionar (y `main` corrió 18 commits por delante de `203d9236`).
18. **Receta obligatoria (§5.1) y las pruebas:** `tests/helpers/procesoDePrueba.ts:28-41` abre con `processRecipeVersionId:
    extra.processRecipeVersionId ?? null`; lo usan **15 archivos** de pruebas y hay **22** llamadas directas a `abrirProceso(` en
    `tests/`. Las de esta lente (`colaDeSecado`, `datos-del-tablero`) crean el proceso con `prisma.lotProcess.create` y no se enteran;
    `corridaConProceso.test.ts` lo llama 44 veces.
