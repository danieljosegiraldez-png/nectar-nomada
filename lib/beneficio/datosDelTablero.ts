/**
 * Las lecturas del tablero del beneficio, acotadas al permiso real de quien mira.
 *
 * **Separado de `tablero.ts` a propósito:** ahí vive el juicio, puro y hermético; aquí las
 * consultas. Así las reglas se prueban con entradas hostiles que ninguna base sembrada produce, y
 * esta capa se prueba por lo único que le toca — que no enseñe un lote que no te toca.
 *
 * Diseño: `docs/superpowers/specs/2026-09-16-tablero-del-beneficio-design.md` §4.1.
 */
import { prisma } from "../db";
import { lotWhereFromVisibility, resolveLotVisibility } from "../traceability/lots";
import { estadosDeInstrumentoPorMedicion, listarEquipos } from "../equipos/equipos";
import { entradaDelLote } from "./entradaDelLote";
import { perfilDeLaFaseAbierta, veredictoDelLote } from "./desdeElLote";
import { curvaDeLote, type Curva } from "./curvaDeLote";
import type { ClaveDePerfil } from "./perfiles";
import { lineaDeEtapas, type Etapa } from "./lineaDeEtapas";
import { proximaLiberacion, type CorridaConDuracion, type Liberacion } from "./liberacionDeUnidad";
import {
  pidenDecisionPorEtapa,
  type CorridaAbierta,
  type EntradaDeLoteParaTablero,
  type EquipoParaTablero,
  type UnidadDelSitio,
  type VeredictoParaCola,
} from "./tablero";
import type { MetaConRitmo } from "../traceability/ritmo";
import type { Prisma } from "../../generated/prisma/client";

/**
 * La curva de un lote **más el perfil que rige a ese lote**: `curvaDeLote` es pura y no sabe de grados
 * ni de fases, y quien cita umbrales sobre ella (`riesgoDeEsperar`) necesita saberlo.
 *
 * **`perfilDelLote` es `null` cuando no se puede decir, y `null` NO es «el de siempre»:** el lote no tiene
 * ninguna fase abierta (sin fase no hay umbrales que aplicar, como `SIN_PROCESO_ABIERTO` en
 * `veredictoDelLote`), no declara grado, o su grado no tiene perfil escrito (`Honey` y los dos
 * `Semi Wash`). Quien pinta calla con `null`.
 */
export interface CurvaDelTablero extends Curva {
  readonly perfilDelLote: ClaveDePerfil | null;
}

export interface DatosDelTablero {
  readonly lotes: readonly EntradaDeLoteParaTablero[];
  readonly tanques: readonly UnidadDelSitio[];
  readonly camas: readonly UnidadDelSitio[];
  readonly corridas: readonly CorridaAbierta[];
  readonly instrumentos: readonly EquipoParaTablero[];
  readonly desviacionesAbiertasPorLote: ReadonlyMap<string, number>;
  /**
   * `true` = quien mira no alcanza **ningún** lote.
   *
   * **No es «no hay lotes».** Devolver un tablero vacío le diría a una cuenta recién dada de alta
   * que el beneficio no tiene café fermentando. Misma regla que `colaDeSecado` y `getLotList`.
   */
  readonly sinAmbito: boolean;
  /**
   * La línea de seis etapas, en orden. **Vacía cuando `sinAmbito`**: una línea de ceros le diría a
   * quien no ve ningún lote que el beneficio no tiene café en ninguna etapa. Quien pinta mira
   * `sinAmbito` ANTES que esto.
   */
  readonly etapas: readonly Etapa[];
  /**
   * Cuándo se libera la próxima unidad (tanque o cama) con una corrida abierta de un lote visible.
   * `null` = ninguna corrida abierta **ocupa una unidad declarada Y visible** (la misma que cuenta
   * la ocupación; una corrida de una unidad que no ves no entra); no es «sin ámbito» (eso lo
   * dice `sinAmbito`) ni «sin duración» (eso es `sin_duracion_declarada`).
   */
  readonly liberacion: Liberacion | null;
  /**
   * La curva del lote pedido en `opciones.curva`, o `null` si no se pidió **o si ese lote no es
   * visible para quien mira** — las dos cosas callan igual a propósito: decir «ese lote existe
   * pero no lo ves» enseñaría que existe.
   */
  readonly curva: CurvaDelTablero | null;
  readonly medidoEn: Date;
}

/** Qué curva se pide: un lote, una variable y el lienzo en que se pintará. */
export interface OpcionesDelTablero {
  readonly curva?: {
    readonly lotId: string;
    readonly variable: string;
    readonly ancho: number;
    readonly alto: number;
  };
}

const VACIO: Omit<DatosDelTablero, "medidoEn"> = {
  lotes: [],
  tanques: [],
  camas: [],
  corridas: [],
  instrumentos: [],
  desviacionesAbiertasPorLote: new Map(),
  sinAmbito: true,
  etapas: [],
  liberacion: null,
  curva: null,
};

/** Las metas con ritmo de una fase, con la última lectura de cada variable **dentro** de ella. */
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

const medicionSelect = {
  id: true,
  variable: true,
  value: true,
  occurredAt: true,
  provenanceClass: true,
  correctsId: true,
  instrumentId: true,
} as const;

export async function datosDelTablero(
  userAccountId: string,
  ahora: Date = new Date(),
  opciones: OpcionesDelTablero = {},
): Promise<DatosDelTablero> {
  const lotWhere = lotWhereFromVisibility(await resolveLotVisibility(userAccountId));
  if (lotWhere === null) return { ...VACIO, medidoEn: ahora };

  // Los lotes con una corrida ABIERTA, que es lo que el tablero vigila (§4.1). Un lote en reposo
  // no entra: su fase no tiene corrida, y el spec lo deja fuera de la cola a propósito.
  //
  // Los recuentos de la línea de etapas se piden en la MISMA pasada y con el MISMO filtro
  // (`lotWhere`): cada uno cuenta LOTES visibles, nunca filas de la tabla de la etapa, así que dos
  // procesos abiertos de un mismo lote son uno y los de un lote que no ves no cuentan. Sólo se piden
  // las tres etapas que dicen «hay» (proceso, secado, almacén); recepción, flotación y selección no
  // cuentan y por qué está en `lineaDeEtapas.ts` (ADR-195). Qué registro cuenta cada una está medido allí.
  const cuentaLotes = (donde: Prisma.LotWhereInput) => prisma.lot.count({ where: { AND: [lotWhere, donde] } });
  const [fermentaciones, secados, enProceso, enSecado, enAlmacen] = await Promise.all([
    prisma.fermentationRun.findMany({
      where: { endedAt: null, transformations: { some: { inputs: { some: { lot: lotWhere } } } } },
      select: {
        startedAt: true,
        vesselNote: true,
        vesselEquipmentId: true,
        lotProcess: { select: procesoSelect },
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
        lotProcess: { select: procesoSelect },
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

  const corridas: CorridaAbierta[] = [
    ...fermentaciones.map((f) => ({
      equipmentId: f.vesselEquipmentId,
      bedLocationId: null,
      vesselNote: f.vesselNote,
    })),
    ...secados.map((s) => ({
      equipmentId: null,
      bedLocationId: s.dryingBedLocationId,
      vesselNote: null,
    })),
  ];

  const crudas = [
    ...fermentaciones.map((f) => ({ ...f, fase: "fermentation" as const })),
    ...secados.map((s) => ({ ...s, fase: "drying" as const })),
  ];

  // **Una entrada por LOTE, no por corrida.** Este bucle recorre corridas, y un lote puede tener
  // varias abiertas (dos secados, o una fermentación y un secado): sin esto el mismo lote saldría dos
  // veces en `lotes` y la cola lo listaría dos veces con la misma clave de React; y, peor,
  // `pidenDecision` contaría corridas mientras `lotes` (`prisma.lot.count`) cuenta lotes, y una misma
  // celda diría «1 lote · 2 piden decisión». Si el lote ya está, se queda la corrida que EMPEZÓ
  // antes: es la que lleva más tiempo abierta, y esconder la más vieja es esconder la más atrasada.
  const anotar = (destino: EntradaDeLoteParaTablero[], nueva: EntradaDeLoteParaTablero) => {
    const i = destino.findIndex((e) => e.lotId === nueva.lotId);
    if (i === -1) {
      destino.push(nueva);
    } else if (
      nueva.faseIniciada !== null &&
      (destino[i]!.faseIniciada === null || nueva.faseIniciada < destino[i]!.faseIniciada!)
    ) {
      destino[i] = nueva;
    }
  };
  const lotes: EntradaDeLoteParaTablero[] = [];
  // Las mismas entradas, separadas por fase: la cola se calcula por fase para que «pide decisión»
  // llegue a la etapa correcta aunque un lote tuviera las dos fases abiertas a la vez.
  const entradasPorFase = {
    fermentation: [] as EntradaDeLoteParaTablero[],
    drying: [] as EntradaDeLoteParaTablero[],
  };
  const organizaciones = new Set<string>();

  for (const c of crudas) {
    const lot = c.transformations[0]?.inputs[0]?.lot;
    if (!lot) continue;
    if (lot.organizationId) organizaciones.add(lot.organizationId);

    // Sólo las lecturas de ESTA fase: una humedad de la fermentación anterior no dice nada del
    // secado de ahora, y contarla apagaría una lectura debida que sí lo está.
    const mediciones = await prisma.measurement.findMany({
      where: { lotId: lot.id, occurredAt: { gte: c.startedAt } },
      select: medicionSelect,
      orderBy: { occurredAt: "desc" },
    });
    const ultimaPorVariable = new Map<string, Date>();
    for (const m of mediciones) if (!ultimaPorVariable.has(m.variable)) ultimaPorVariable.set(m.variable, m.occurredAt);

    const estadosDeInstrumento = await estadosDeInstrumentoPorMedicion(
      userAccountId,
      mediciones.map((m) => ({ id: m.id, instrumentId: m.instrumentId, occurredAt: m.occurredAt })),
    );

    const entrada = entradaDelLote({
      fermentacionAbierta: c.fase === "fermentation" ? { startedAt: c.startedAt } : null,
      secadoAbierto: c.fase === "drying" ? { startedAt: c.startedAt } : null,
      ultimoSecadoTerminado: null,
      procesos: c.lotProcess
        ? [{ endedAt: c.lotProcess.endedAt, gradoDeProceso: c.lotProcess.processGradeValue?.value ?? null }]
        : [],
      mediciones: mediciones.map((m) => ({
        id: m.id,
        variable: m.variable,
        value: m.value.toNumber(),
        occurredAt: m.occurredAt,
        provenanceClass: String(m.provenanceClass),
        correctsId: m.correctsId,
        instrumentId: m.instrumentId,
      })),
      estadosDeInstrumento,
      ahora,
    });
    // Sin fase abierta no llegaríamos aquí —la consulta pide `endedAt: null`— pero si el dato
    // fuera incoherente, el lote se salta en vez de inventarle una fase.
    if (!entrada) continue;

    const veredicto = veredictoDelLote(entrada);
    const fases = c.lotProcess?.processRecipeVersion?.fases ?? [];
    const targets = c.lotProcess?.processRecipeVersion?.targets ?? [];

    const entradaDeTablero: EntradaDeLoteParaTablero = {
      lotId: lot.id,
      lotCode: lot.lotCode,
      veredicto: typeof veredicto === "string" ? veredicto : (veredicto as unknown as VeredictoParaCola),
      faseIniciada: c.startedAt,
      expectedHours: fases.find((f) => f.phase === c.fase)?.expectedHours ?? null,
      metas: metasDeFase(targets, c.fase, ultimaPorVariable),
      ultimaLectura: mediciones[0]?.occurredAt ?? null,
    };
    anotar(lotes, entradaDeTablero);
    anotar(entradasPorFase[c.fase], entradaDeTablero);
  }

  // Los equipos salen de `listarEquipos`, que YA filtra por `can(view, equipment)`: una sola
  // fuente para tanques e instrumentos, la misma que usa `app/equipos`, así que el tablero y esa
  // pantalla no pueden decir cosas distintas del mismo potenciómetro.
  const equipos = await listarEquipos(userAccountId);

  // **Las camas se acotan por las organizaciones de los lotes visibles**, y conviene decir que es
  // un apoderado, no la regla ideal: no existe un listador de camas con permiso propio, y los
  // lugares se acotan por organización en el resto del módulo (`bandejasDelSecado.ts`). Si algún
  // día hay uno, esta consulta se cambia por él. Lo que NO se hace es traer todas las camas de la
  // base: enseñaría capacidad de una finca ajena.
  const camas = organizaciones.size
    ? await prisma.location.findMany({
        where: { locationType: "drying_bed", organizationId: { in: [...organizaciones] } },
        select: { id: true, name: true, status: true },
      })
    : [];

  // Una desviación está ABIERTA mientras no tenga ninguna `CorrectiveAction` (Daniel, 2026-09-16).
  const desviaciones = lotes.length
    ? await prisma.deviation.findMany({
        where: {
          correctiveActions: { none: {} },
          lotTransformation: { inputs: { some: { lotId: { in: lotes.map((l) => l.lotId) } } } },
        },
        select: { lotTransformation: { select: { inputs: { select: { lotId: true } } } } },
      })
    : [];
  const porLote = new Map<string, number>();
  for (const d of desviaciones) {
    for (const i of d.lotTransformation?.inputs ?? []) {
      porLote.set(i.lotId, (porLote.get(i.lotId) ?? 0) + 1);
    }
  }

  const etapas = lineaDeEtapas({
    proceso: enProceso,
    secado: enSecado,
    almacen: enAlmacen,
    pidenDecision: pidenDecisionPorEtapa({
      fermentacion: entradasPorFase.fermentation,
      secado: entradasPorFase.drying,
      desviacionesAbiertasPorLote: porLote,
      ahora,
    }),
  });

  // **Sólo cuentan las corridas que ocupan una unidad declarada Y VISIBLE para quien mira.** «Cuándo
  // se libera la próxima unidad» no puede responderlo una corrida con el tanque en texto libre o sin
  // cama: no libera ninguna unidad del tablero (la ocupación ya las cuenta aparte como «sin unidad
  // declarada»). Incluirlas haría que una corrida sin unidad y con duración dijera «se libera a las X»
  // de una unidad que no existe.
  //
  // **Y tampoco la de una unidad que quien mira no ve** (un tanque que `listarEquipos` no le devolvió,
  // una cama de otra organización): `ocupacionDelSitio` hace lo contrario con esa misma corrida —la
  // manda a `ajenas` y se niega a contarla— y sus números no la incluyen. Si aquí sí contara, la
  // pantalla diría «0 libres de 0» junto a «la próxima unidad se libera a las 14:00», sobre una unidad
  // que no aparece en ninguno de sus números. El conjunto de ids es el MISMO que usa la ocupación
  // (`tanques` ∪ `camas`, los dos de abajo), calculado aquí porque la ocupación lo calcula una función
  // más allá, en la página.
  const duracionDeFase = (
    lotProcess: (typeof crudas)[number]["lotProcess"],
    fase: "fermentation" | "drying",
  ) => lotProcess?.processRecipeVersion?.fases.find((f) => f.phase === fase)?.expectedHours ?? null;
  const tanquesVisibles: UnidadDelSitio[] = equipos
    .filter((e) => e.kind === "vessel")
    .map((e) => ({
      id: e.id,
      nombre: e.name,
      lifecycleStatus: e.lifecycleStatus,
      condicion: e.condicion?.condition ?? null,
    }));
  // Una cama no tiene informe de condición, así que su `condicion` es `null` — nunca puede
  // salir «requiere intervención» por ese motivo, y eso es un hecho del modelo, no un hueco.
  const camasVisibles: UnidadDelSitio[] = camas.map((c) => ({
    id: c.id,
    nombre: c.name,
    // `RecordStatus` no tiene «retired»: una cama fuera de servicio está `archived`.
    lifecycleStatus: c.status === "archived" ? ("retired" as const) : ("active" as const),
    condicion: null,
  }));
  const idsVisibles = new Set([...tanquesVisibles, ...camasVisibles].map((u) => u.id));
  const corridasConDuracion: CorridaConDuracion[] = [
    ...fermentaciones.map((f) => ({
      equipmentId: f.vesselEquipmentId,
      bedLocationId: null,
      iniciadaEn: f.startedAt,
      expectedHours: duracionDeFase(f.lotProcess, "fermentation"),
    })),
    ...secados.map((d) => ({
      equipmentId: null,
      bedLocationId: d.dryingBedLocationId,
      iniciadaEn: d.startedAt,
      expectedHours: duracionDeFase(d.lotProcess, "drying"),
    })),
  ].filter((c) => {
    const declarada = c.equipmentId ?? c.bedLocationId;
    return declarada !== null && idsVisibles.has(declarada);
  });
  const liberacion = proximaLiberacion({ corridas: corridasConDuracion, ahora });

  const curva = opciones.curva ? await curvaDeUnLote(lotWhere, crudas, opciones.curva) : null;

  return {
    lotes,
    tanques: tanquesVisibles,
    camas: camasVisibles,
    corridas,
    instrumentos: equipos.map((e) => ({ id: e.id, name: e.name, kind: e.kind, verificacion: e.verificacion })),
    desviacionesAbiertasPorLote: porLote,
    sinAmbito: false,
    etapas,
    liberacion,
    curva,
    medidoEn: ahora,
  };
}

/**
 * La curva de un lote, **sólo si ese lote es visible** (`lotWhere` ya viene de la visibilidad real).
 *
 * - Las lecturas son las de esa variable DENTRO de la fase abierta, igual que el ritmo; sin fase
 *   abierta no hay ventana y van todas.
 * - Una lectura corregida se excluye y entra su corrección: pintar las dos dibujaría un punto que ya
 *   nadie sostiene (es la regla de `entradaDelLote`).
 * - **La banda es la del objetivo `during` de la FASE del lote, y si no lo hay, la `final`.** Nunca
 *   `initial`, y nunca un objetivo sin fase: no dice de qué fase habla (esquema de `ProcessTarget`),
 *   y pintarlo sería una banda que nadie declaró. Sin objetivo, `curvaDeLote` dice
 *   `sin_objetivo_declarado` y pinta los puntos igual.
 * - **El perfil que rige el lote** (`perfilDelLote`) sale del grado del proceso de LA FASE ABIERTA, por el
 *   mismo mapeo que su veredicto; sin fase abierta es `null`.
 */
async function curvaDeUnLote(
  lotWhere: Prisma.LotWhereInput,
  crudas: readonly {
    readonly fase: "fermentation" | "drying";
    readonly startedAt: Date;
    readonly lotProcess: {
      readonly processGradeValue: { readonly value: string } | null;
      readonly processRecipeVersion: {
        readonly targets: readonly {
          readonly variable: string;
          readonly phase: string | null;
          readonly moment: string;
          readonly minValue: { toNumber(): number } | null;
          readonly maxValue: { toNumber(): number } | null;
          readonly targetValue: { toNumber(): number } | null;
        }[];
      } | null;
    } | null;
    readonly transformations: readonly { readonly inputs: readonly { readonly lot: { readonly id: string } }[] }[];
  }[],
  pedida: NonNullable<OpcionesDelTablero["curva"]>,
): Promise<CurvaDelTablero | null> {
  const { lotId, variable, ancho, alto } = pedida;
  const visible = await prisma.lot.findFirst({ where: { AND: [lotWhere, { id: lotId }] }, select: { id: true } });
  if (!visible) return null;

  const abierta = crudas.find((c) => c.transformations.some((t) => t.inputs.some((i) => i.lot.id === lotId)));
  const mediciones = await prisma.measurement.findMany({
    where: { lotId, variable, ...(abierta ? { occurredAt: { gte: abierta.startedAt } } : {}) },
    select: { id: true, value: true, occurredAt: true, correctsId: true },
    orderBy: { occurredAt: "asc" },
  });
  const corregidas = new Set(mediciones.map((m) => m.correctsId).filter((id): id is string => id != null));

  const metas = abierta?.lotProcess?.processRecipeVersion?.targets ?? [];
  const delaFase = metas.filter((t) => abierta && t.variable === variable && t.phase === abierta.fase);
  const meta = delaFase.find((t) => t.moment === "during") ?? delaFase.find((t) => t.moment === "final");

  // **El perfil que rige el lote, de la misma fuente que su veredicto** (`PERFIL_POR_GRADO` en
  // `desdeElLote.ts`): el grado del proceso de LA FASE ABIERTA. Sin fase abierta (`abierta` indefinida)
  // sale `null` y el bloque de «qué sugiere el dato si se espera» calla: sobre un lote que no espera
  // nada no se escribe qué pasa si espera.
  const perfilDelLote = perfilDeLaFaseAbierta(abierta);

  const curva = curvaDeLote({
    lecturas: mediciones
      .filter((m) => !corregidas.has(m.id))
      .map((m) => ({ occurredAt: m.occurredAt, value: m.value.toNumber() })),
    objetivo: meta
      ? {
          minValue: meta.minValue?.toNumber() ?? null,
          maxValue: meta.maxValue?.toNumber() ?? null,
          targetValue: meta.targetValue?.toNumber() ?? null,
        }
      : null,
    ancho,
    alto,
  });
  return { ...curva, perfilDelLote };
}
