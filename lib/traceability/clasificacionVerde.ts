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

/** Las salidas de una clasificación, con lo que la lectura necesita del lote. */
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
 * solo no distingue nada. La segunda sí: `screenStatus` es obligatorio en `GreenFractionInput`,
 * de modo que toda fracción escrita por `recordGreenGrading` lleva `greenScreenStatus` y ningún
 * lote de defecto lo lleva.
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
