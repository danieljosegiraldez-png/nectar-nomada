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
import { confianzaPorVerificacion } from "../equipos/verificacion";
import { entradaDelLote } from "./entradaDelLote";
import { procesoQueCubre, procesosParaEntrada, type Cobertura } from "../traceability/procesoDelLinaje";
import { LotProcessError } from "../traceability/errorDeProceso";
import { perfilDeLaFaseAbierta, veredictoDelLote } from "./desdeElLote";
import { curvaDeLote, type Curva, type MomentoDeObjetivo } from "./curvaDeLote";
import type { ClaveDePerfil } from "./perfiles";
import { lineaDeEtapas, type Etapa } from "./lineaDeEtapas";
import { proximaLiberacion, type CorridaConDuracion, type Liberacion } from "./liberacionDeUnidad";
import {
  LINAJE_DEMASIADO_HONDO,
  pidenDecisionPorEtapa,
  unaEntradaPorLote,
  type CorridaAbierta,
  type EntradaDeLoteParaTablero,
  type EquipoParaTablero,
  type OcupacionDeUnidad,
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
 * `veredictoDelLote`), la que tiene abierta no es de fermentación (la matriz de pH que se cita lo es; con
 * secado no hay ninguna), su proceso no tiene receta (sin receta el motor no opina, ADR-181), no declara
 * grado, o su grado no tiene perfil escrito (`Honey` y los dos `Semi Wash`). Quien pinta calla con `null`.
 */
export interface CurvaDelTablero extends Curva {
  readonly perfilDelLote: ClaveDePerfil | null;
}

export interface DatosDelTablero {
  readonly lotes: readonly EntradaDeLoteParaTablero[];
  readonly tanques: readonly UnidadDelSitio[];
  readonly camas: readonly UnidadDelSitio[];
  readonly corridas: readonly CorridaAbierta[];
  /**
   * Cuántas corridas abiertas tiene cada unidad visible, **sin filtrar por lote**. Ver
   * `OcupacionDeUnidad`: es lo que impide que «no me llegó ninguna corrida» se lea como «la unidad
   * está libre» cuando el lote que la ocupa no es visible (`PENDING_IMPLEMENTATIONS/015`).
   */
  readonly corridasPorUnidad: readonly OcupacionDeUnidad[];
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
  corridasPorUnidad: [],
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

type ProcesoDelTablero = Prisma.LotProcessGetPayload<{ select: typeof procesoSelect }>;

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
        id: true,
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
        id: true,
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

  // **Una entrada por CORRIDA aquí, y una por LOTE más abajo.** El tablero ensaña una fila por lote
  // —si no, el mismo lote saldría dos veces con la misma clave de React, y `pidenDecision` contaría
  // corridas mientras `lotes` (`prisma.lot.count`) cuenta lotes: una celda diría «1 lote · 2 piden
  // decisión»—. Pero **cuál** se queda no se puede decidir en este bucle: todavía no se han evaluado
  // las demás corridas del lote. Lo decide `unaEntradaPorLote` cuando ya están todas y se conocen las
  // desviaciones abiertas, con la regla que Daniel eligió el 2026-10-02: la de veredicto más grave y,
  // a igualdad, la que empezó antes. Ver `PENDING_IMPLEMENTATIONS/016`.
  const porCorrida: EntradaDeLoteParaTablero[] = [];
  // Las mismas entradas, separadas por fase: la cola se calcula por fase para que «pide decisión»
  // llegue a la etapa correcta aunque un lote tuviera las dos fases abiertas a la vez.
  const porCorridaYFase = {
    fermentation: [] as EntradaDeLoteParaTablero[],
    drying: [] as EntradaDeLoteParaTablero[],
  };
  const organizaciones = new Set<string>();
  // El proceso que cubre a cada lote, resuelto UNA vez en el bucle de abajo. La liberación de unidades y la curva lo leen
  // de aquí y no de la FK de la corrida (Parte 1, R7; al juntar `main` el 2026-10-03, las dos lo leían por la FK).
  const procesoPorLote = new Map<string, ProcesoDelTablero | null>();

  // **Qué mediciones de estos lotes ya fueron corregidas, SIN ninguna ventana de fecha**
  // (`PENDING_IMPLEMENTATIONS/018`). `entradaDelLote` lo deducía de las mediciones que recibe, y ésas
  // llegan acotadas a la fase abierta: una corrección cuya fecha cae antes del inicio de la fase
  // —`correctMeasurement` permite corregir la fecha— quedaba fuera, su `correctsId` no entraba, y la
  // original ya corregida volvía a contarse como vigente.
  //
  // Una sola consulta para todos los lotes crudos, no una por vuelta del bucle: trae dos columnas y
  // sólo las filas que corrigen algo.
  const idsDeLotesCrudos = [
    ...new Set(crudas.map((c) => c.transformations[0]?.inputs[0]?.lot?.id).filter((id): id is string => id != null)),
  ];
  const correcciones = idsDeLotesCrudos.length
    ? await prisma.measurement.findMany({
        where: { lotId: { in: idsDeLotesCrudos }, correctsId: { not: null } },
        select: { lotId: true, correctsId: true },
      })
    : [];
  const corregidasPorLote = new Map<string, Set<string>>();
  for (const c of correcciones) {
    if (c.lotId === null || c.correctsId === null) continue;
    const yaHay = corregidasPorLote.get(c.lotId);
    if (yaHay) yaHay.add(c.correctsId);
    else corregidasPorLote.set(c.lotId, new Set([c.correctsId]));
  }

  for (const c of crudas) {
    const lot = c.transformations[0]?.inputs[0]?.lot;
    if (!lot) continue;
    if (lot.organizationId) organizaciones.add(lot.organizationId);

    // Parte 1, R7 (tarea 9, 2026-10-02): el proceso del lote se busca HACIA ARRIBA, por la misma función que la ficha.
    // Antes salía de la FK de la corrida, que en toda corrida vieja es nula (R9 no la rellena).
    //
    // Ronda de arreglo 1 (2026-10-02). UNA subida por lote: `procesosParaEntrada` reutiliza la cobertura en vez de volver a
    // resolverla. Y `lineage_too_deep` se atrapa AQUÍ, fila a fila (diseño R1: «las pantallas atrapan lineage_too_deep y lo
    // dicen»): un solo lote con más de 64 generaciones tumbaba el tablero entero para todos. Esa fila sale marcada y sin
    // proceso; cualquier otro error se relanza.
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
      procesos,
      mediciones: mediciones.map((m) => ({
        id: m.id,
        variable: m.variable,
        value: m.value.toNumber(),
        occurredAt: m.occurredAt,
        provenanceClass: String(m.provenanceClass),
        correctsId: m.correctsId,
        instrumentId: m.instrumentId,
      })),
      // Un lote sin ninguna corrección no tiene fila en el mapa, y el conjunto vacío es la
      // traducción fiel de eso — no un valor por defecto que tape nada.
      idsCorregidos: corregidasPorLote.get(lot.id) ?? new Set<string>(),
      estadosDeInstrumento,
      ahora,
    });
    // Sin fase abierta no llegaríamos aquí —la consulta pide `endedAt: null`— pero si el dato
    // fuera incoherente, el lote se salta en vez de inventarle una fase.
    if (!entrada) continue;

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
      corridaId: c.id,
      ultimaLectura: mediciones[0]?.occurredAt ?? null,
    };
    // **UNA entrada por CORRIDA aquí; la de por lote se elige después** (`PENDING_IMPLEMENTATIONS/016`).
    // Deduplicar en este punto era el defecto: todavía no se sabe el veredicto de las demás corridas
    // del lote, así que elegir ahora es elegir a ciegas. Lo hace `unaEntradaPorLote`, cuando ya están
    // evaluadas todas y se conocen las desviaciones abiertas que el grupo necesita.
    porCorrida.push(entradaDeTablero);
    porCorridaYFase[c.fase].push(entradaDeTablero);
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
  //
  // **Se consulta sobre las entradas POR CORRIDA, antes de deduplicar**, y tiene que ser así: el
  // grupo de cada candidata depende de si su lote tiene desviaciones abiertas, así que el dato hace
  // falta ANTES de elegir cuál se queda. Los ids se repiten cuando un lote tiene varias corridas, y
  // a un `in` eso le da igual.
  const idsParaDesviaciones = [...new Set(porCorrida.map((l) => l.lotId))];
  const desviaciones = idsParaDesviaciones.length
    ? await prisma.deviation.findMany({
        where: {
          correctiveActions: { none: {} },
          lotTransformation: { inputs: { some: { lotId: { in: idsParaDesviaciones } } } },
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

  // **Y aquí sí: una entrada por lote, elegida con todas las corridas ya evaluadas.** La regla vive
  // en `unaEntradaPorLote` (`tablero.ts`), junto al orden de gravedad que usa la cola, para que no
  // haya dos definiciones de «más grave».
  const lotes = unaEntradaPorLote({ entradas: porCorrida, desviacionesAbiertasPorLote: porLote, ahora });
  const entradasPorFase = {
    fermentation: unaEntradaPorLote({
      entradas: porCorridaYFase.fermentation,
      desviacionesAbiertasPorLote: porLote,
      ahora,
    }),
    drying: unaEntradaPorLote({ entradas: porCorridaYFase.drying, desviacionesAbiertasPorLote: porLote, ahora }),
  };

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
    corrida: { readonly transformations: readonly { readonly inputs: readonly { readonly lot: { readonly id: string } }[] }[] },
    fase: "fermentation" | "drying",
  ) => {
    const lotId = corrida.transformations[0]?.inputs[0]?.lot.id;
    const proceso = lotId ? procesoPorLote.get(lotId) : null;
    return proceso?.processRecipeVersion?.fases.find((f) => f.phase === fase)?.expectedHours ?? null;
  };
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

  // **Cuántas corridas abiertas tiene cada unidad visible, SIN filtrar por lote.** Es el arreglo de
  // `PENDING_IMPLEMENTATIONS/015`: las dos consultas de arriba llevan `inputs.some.lot: lotWhere`,
  // así que una corrida sobre un lote que quien mira no ve no llegaba, y la unidad salía «libre».
  //
  // **Es un `groupBy` con `_count`: no selecciona ni una columna del lote.** Dice cuántas filas hay
  // sobre unidades que esta cuenta YA puede ver, así que no enseña nada que la visibilidad oculte —
  // sólo deja de afirmar que un tanque ocupado está libre. Acotado a los ids visibles: una corrida
  // sobre una unidad ajena no entra, igual que `ocupacionDelSitio` la manda a `ajenas`.
  const idsDeTanquesVisibles = tanquesVisibles.map((u) => u.id);
  const idsDeCamasVisibles = camasVisibles.map((u) => u.id);
  const [ocupacionDeTanques, ocupacionDeCamas] = await Promise.all([
    idsDeTanquesVisibles.length === 0
      ? Promise.resolve([])
      : prisma.fermentationRun.groupBy({
          by: ["vesselEquipmentId"],
          where: { endedAt: null, vesselEquipmentId: { in: idsDeTanquesVisibles } },
          _count: { _all: true },
        }),
    idsDeCamasVisibles.length === 0
      ? Promise.resolve([])
      : prisma.dryingRun.groupBy({
          by: ["dryingBedLocationId"],
          where: { endedAt: null, dryingBedLocationId: { in: idsDeCamasVisibles } },
          _count: { _all: true },
        }),
  ]);
  const corridasPorUnidad: OcupacionDeUnidad[] = [
    ...ocupacionDeTanques.flatMap((g) =>
      g.vesselEquipmentId === null ? [] : [{ unidadId: g.vesselEquipmentId, corridas: g._count._all }],
    ),
    ...ocupacionDeCamas.flatMap((g) =>
      g.dryingBedLocationId === null ? [] : [{ unidadId: g.dryingBedLocationId, corridas: g._count._all }],
    ),
  ];
  const corridasConDuracion: CorridaConDuracion[] = [
    ...fermentaciones.map((f) => ({
      equipmentId: f.vesselEquipmentId,
      bedLocationId: null,
      iniciadaEn: f.startedAt,
      expectedHours: duracionDeFase(f, "fermentation"),
    })),
    ...secados.map((d) => ({
      equipmentId: null,
      bedLocationId: d.dryingBedLocationId,
      iniciadaEn: d.startedAt,
      expectedHours: duracionDeFase(d, "drying"),
    })),
  ].filter((c) => {
    const declarada = c.equipmentId ?? c.bedLocationId;
    return declarada !== null && idsVisibles.has(declarada);
  });
  // Las unidades visibles con su estado: `proximaLiberacion` las necesita para no prometer la
  // liberación de una unidad retirada o averiada, que no va a servir cuando se vacíe (015).
  const liberacion = proximaLiberacion({
    corridas: corridasConDuracion,
    unidades: [...tanquesVisibles, ...camasVisibles],
    ahora,
  });

  // **La curva abre la MISMA corrida que el aviso** (`PENDING_IMPLEMENTATIONS/016`, segunda mitad).
  // Antes la elegía con un `find` propio sobre `crudas`, que lleva las fermentaciones primero y sin
  // ordenar: podía abrir una corrida distinta de la que explica la fila del tablero, o sea dos reglas
  // de selección para la misma pregunta. `null` = el lote pedido no tiene entrada, y entonces la
  // curva no tiene corrida que abrir.
  const corridaDeLaCurva = opciones.curva
    ? (lotes.find((l) => l.lotId === opciones.curva!.lotId)?.corridaId ?? null)
    : null;
  const curva = opciones.curva
    ? await curvaDeUnLote(userAccountId, lotWhere, crudas, procesoPorLote, opciones.curva, corridaDeLaCurva)
    : null;

  return {
    lotes,
    tanques: tanquesVisibles,
    camas: camasVisibles,
    corridas,
    corridasPorUnidad,
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
 *   mismo mapeo que su veredicto; sin fase abierta, o con una que no es de fermentación, es `null`.
 */
async function curvaDeUnLote(
  /**
   * Quién mira. Hace falta para resolver la verificación del instrumento de cada lectura
   * (`estadosDeInstrumentoPorMedicion` lo exige): un instrumento que esta cuenta no puede ver se
   * trata como `SIN_INSTRUMENTO`, o sea que no impone confianza ninguna — así el mismo lote no se
   * juzga distinto según quién lo abre.
   */
  userAccountId: string,
  lotWhere: Prisma.LotWhereInput,
  crudas: readonly {
    /** El id de la corrida: con él se elige, en vez de buscar por lote. Ver `corridaElegida`. */
    readonly id: string;
    readonly fase: "fermentation" | "drying";
    readonly startedAt: Date;
    readonly transformations: readonly { readonly inputs: readonly { readonly lot: { readonly id: string } }[] }[];
  }[],
  procesoPorLote: ReadonlyMap<string, ProcesoDelTablero | null>,
  pedida: NonNullable<OpcionesDelTablero["curva"]>,
  /**
   * **La corrida que el tablero eligió para este lote**, o `null` si el lote no tiene entrada.
   *
   * Entra en vez de buscarse aquí (`PENDING_IMPLEMENTATIONS/016`): el `find` que había no ordenaba y
   * `crudas` lleva las fermentaciones primero, así que con dos corridas abiertas la curva podía abrir
   * una y el aviso explicar otra. Una sola pregunta —«¿qué corrida es la de este lote?»— con una sola
   * respuesta.
   */
  corridaElegida: string | null,
): Promise<CurvaDelTablero | null> {
  const { lotId, variable, ancho, alto } = pedida;
  const visible = await prisma.lot.findFirst({ where: { AND: [lotWhere, { id: lotId }] }, select: { id: true } });
  if (!visible) return null;

  const abierta = corridaElegida === null ? undefined : crudas.find((c) => c.id === corridaElegida);
  // **Dos consultas, y el orden importa** (`PENDING_IMPLEMENTATIONS/018`). La vigencia de una
  // medición —«¿alguien la corrigió?»— es una propiedad de la **cadena de correcciones**, no de la
  // ventana de la pantalla: se resuelve ANTES de aplicar la ventana, o el filtro de tiempo decide
  // qué correcciones existen.
  //
  // Esto hacía lo contrario: filtraba por la ventana de la fase y **después** armaba `corregidas`
  // con los `correctsId` de lo que quedó dentro. `correctMeasurement` permite corregir la **fecha**,
  // así que una corrección cuya fecha cae antes del inicio de la fase quedaba fuera de la consulta,
  // su `correctsId` nunca entraba, y **la original, ya corregida, se seguía dibujando**: una lectura
  // que nadie sostiene volvía a la pantalla.
  //
  // La segunda consulta no lleva ventana y trae una sola columna. Una corrección anterior a la fase
  // deja la original oculta y **tampoco se dibuja ella**, que es correcto: su propia fecha la deja
  // fuera de la ventana.
  const [mediciones, correcciones] = await Promise.all([
    prisma.measurement.findMany({
      where: { lotId, variable, ...(abierta ? { occurredAt: { gte: abierta.startedAt } } : {}) },
      // `instrumentId` entra para poder resolver la verificación de cada lectura
      // (`PENDING_IMPLEMENTATIONS/021`): sin él, la curva dibujaba una lectura excluida por el motor
      // de veredictos y le colgaba una afirmación citada como criterio de Néctar Nómada.
      select: { id: true, value: true, occurredAt: true, correctsId: true, instrumentId: true },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.measurement.findMany({
      where: { lotId, variable, correctsId: { not: null } },
      select: { correctsId: true },
    }),
  ]);
  const corregidas = new Set(correcciones.map((m) => m.correctsId).filter((id): id is string => id != null));

  // El proceso que cubre al lote, del resolvedor (Parte 1, R7), no el de la FK de la corrida abierta.
  const proceso = abierta ? (procesoPorLote.get(lotId) ?? null) : null;
  const metas = proceso?.processRecipeVersion?.targets ?? [];
  const delaFase = metas.filter((t) => abierta && t.variable === variable && t.phase === abierta.fase);
  // **TODOS los objetivos de la fase, con su momento, y la elección la hace `curvaDeLote`.** Esta
  // línea hacía `find("during") ?? find("final")`, y ahí vivían los dos defectos de
  // `PENDING_IMPLEMENTATIONS/017`: elegía en silencio entre lo que la receta declaraba, y la meta
  // `final` que elegía se usaba después como banda de TODA la trayectoria. Esta capa ya no elige.
  const objetivos = delaFase.map((t) => ({
    momento: t.moment,
    minValue: t.minValue?.toNumber() ?? null,
    maxValue: t.maxValue?.toNumber() ?? null,
    targetValue: t.targetValue?.toNumber() ?? null,
  }));

  // **El perfil que rige el lote, de la misma fuente que su veredicto** (`PERFIL_POR_GRADO` en
  // `desdeElLote.ts`): el grado del proceso de LA FASE ABIERTA. Sin fase abierta (`abierta` indefinida)
  // sale `null` y el bloque de «qué sugiere el dato si se espera» calla: sobre un lote que no espera
  // nada no se escribe qué pasa si espera. Y con una fase de secado también: la matriz es de fermentación.
  const perfilDelLote = perfilDeLaFaseAbierta(abierta ? { fase: abierta.fase, proceso } : undefined);

  // **¿Se supo qué receta aplicaba?** (`PENDING_IMPLEMENTATIONS/019`.) `objetivos` sale de
  // `proceso?.processRecipeVersion?.targets ?? []` (el proceso que cubre al lote, del resolvedor), así que **sin corrida abierta está
  // vacío porque no se consultó ninguna receta**, no porque la receta no declare rango. Las dos
  // llegaban a la pantalla como una sola frase —«esta variable no tiene rango declarado en la
  // receta»— que afirma sobre una receta que nadie miró. Es la misma forma que esta rama existe
  // para impedir: una consulta que no recupera nada leída como un hecho.
  //
  // Resuelta = hay corrida abierta Y el proceso que cubre al lote tiene versión de receta. Con cualquiera de las dos
  // ausentes no se afirma nada de la receta; se dice que no se pudo resolver.
  const recetaResuelta = proceso?.processRecipeVersion != null;

  // **La verificación del instrumento de cada lectura, en el instante de cada una.** Una consulta por
  // instrumento, no una por lectura: lo hace la misma función por lotes que usa el camino del
  // veredicto unas líneas más arriba, para que las dos pantallas no deriven.
  const vigentes = mediciones.filter((m) => !corregidas.has(m.id));
  const estadosDeLaCurva = await estadosDeInstrumentoPorMedicion(
    userAccountId,
    vigentes.map((m) => ({ id: m.id, instrumentId: m.instrumentId, occurredAt: m.occurredAt })),
  );

  const curva = curvaDeLote({
    lecturas: vigentes.map((m) => ({
      occurredAt: m.occurredAt,
      value: m.value.toNumber(),
      // `??` y no `?`: una medición que el mapa no trae es `SIN_INSTRUMENTO`, que
      // `confianzaPorVerificacion` convierte en `null` — «no impone nada». Es el caso de todas las
      // lecturas de hoy y tratarlo como avería apagaría la pantalla entera.
      //
      // **Y la clave NO SE EMITE cuando sería `null`, que no es cosmética.** `null` y ausente
      // significan lo mismo aquí —«no impone nada»— pero `toEqual` de vitest **ignora `undefined` y
      // no `null`**, así que un `confianza: null` añade una clave a cada punto y rompe las ~25
      // comparaciones de puntos enteros que esta casa ya tiene. Lo cazó el carril con base del PR:
      // `datos-del-tablero.test.ts:953` —la única que compara puntos pasando por esta función—
      // falló con «expected { x, y, …(1) } to deeply equal { x, y }», mientras
      // `curva-de-lote.test.ts` pasaba porque llama a `curvaDeLote` sin confianza, o sea
      // `undefined`. Omitirla es además lo más honesto: la ausencia ya es el caso por defecto.
      ...(((c) => (c === null ? {} : { confianza: c }))(
        confianzaPorVerificacion(estadosDeLaCurva.get(m.id) ?? "SIN_INSTRUMENTO"),
      )),
    })),
    objetivos,
    recetaResuelta,
    ancho,
    alto,
  });
  return { ...curva, perfilDelLote };
}
