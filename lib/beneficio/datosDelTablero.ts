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
import { procesoQueCubre, procesosParaEntrada, type Cobertura } from "../traceability/procesoDelLinaje";
import { LotProcessError } from "../traceability/errorDeProceso";
import { veredictoDelLote } from "./desdeElLote";
import {
  LINAJE_DEMASIADO_HONDO,
  type CorridaAbierta,
  type EntradaDeLoteParaTablero,
  type EquipoParaTablero,
  type UnidadDelSitio,
  type VeredictoParaCola,
} from "./tablero";
import type { MetaConRitmo } from "../traceability/ritmo";

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
  readonly medidoEn: Date;
}

const VACIO: Omit<DatosDelTablero, "medidoEn"> = {
  lotes: [],
  tanques: [],
  camas: [],
  corridas: [],
  instrumentos: [],
  desviacionesAbiertasPorLote: new Map(),
  sinAmbito: true,
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
      targets: { select: { variable: true, everyHours: true, phase: true } },
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
): Promise<DatosDelTablero> {
  const lotWhere = lotWhereFromVisibility(await resolveLotVisibility(userAccountId));
  if (lotWhere === null) return { ...VACIO, medidoEn: ahora };

  // Los lotes con una corrida ABIERTA, que es lo que el tablero vigila (§4.1). Un lote en reposo
  // no entra: su fase no tiene corrida, y el spec lo deja fuera de la cola a propósito.
  const [fermentaciones, secados] = await Promise.all([
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

  const lotes: EntradaDeLoteParaTablero[] = [];
  const organizaciones = new Set<string>();

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
      estadosDeInstrumento,
      ahora,
    });
    // Sin fase abierta no llegaríamos aquí —la consulta pide `endedAt: null`— pero si el dato
    // fuera incoherente, el lote se salta en vez de inventarle una fase.
    if (!entrada) continue;

    const veredicto = cobertura === null ? LINAJE_DEMASIADO_HONDO : veredictoDelLote(entrada);
    const fases = proceso?.processRecipeVersion?.fases ?? [];
    const targets = proceso?.processRecipeVersion?.targets ?? [];

    lotes.push({
      lotId: lot.id,
      lotCode: lot.lotCode,
      veredicto: typeof veredicto === "string" ? veredicto : (veredicto as unknown as VeredictoParaCola),
      faseIniciada: c.startedAt,
      expectedHours: fases.find((f) => f.phase === c.fase)?.expectedHours ?? null,
      metas: metasDeFase(targets, c.fase, ultimaPorVariable),
      ultimaLectura: mediciones[0]?.occurredAt ?? null,
    });
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
        select: { id: true, status: true },
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

  return {
    lotes,
    tanques: equipos
      .filter((e) => e.kind === "vessel")
      .map((e) => ({ id: e.id, lifecycleStatus: e.lifecycleStatus, condicion: e.condicion?.condition ?? null })),
    // Una cama no tiene informe de condición, así que su `condicion` es `null` — nunca puede
    // salir «requiere intervención» por ese motivo, y eso es un hecho del modelo, no un hueco.
    camas: camas.map((c) => ({
      id: c.id,
      // `RecordStatus` no tiene «retired»: una cama fuera de servicio está `archived`.
      lifecycleStatus: c.status === "archived" ? ("retired" as const) : ("active" as const),
      condicion: null,
    })),
    corridas,
    instrumentos: equipos.map((e) => ({ id: e.id, name: e.name, kind: e.kind, verificacion: e.verificacion })),
    desviacionesAbiertasPorLote: porLote,
    sinAmbito: false,
    medidoEn: ahora,
  };
}
