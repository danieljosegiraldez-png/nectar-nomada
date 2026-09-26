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
 * **El discriminador.** `recordGreenGrading` escribe con `transformationType: "selection"`, el
 * mismo tipo que la selección de cereza, así que el tipo solo no distingue nada. Lo que sí:
 * `screenStatus` es obligatorio en `GreenFractionInput`, de modo que toda fracción escrita por
 * `recordGreenGrading` lleva `greenScreenStatus` y ningún lote de defecto lo lleva.
 *
 * A esto las dos funciones de abajo le añaden que el lote de ENTRADA sea verde, cada una a su
 * manera, porque aquí no hay a qué lote referirse.
 *
 * **Las dos condiciones son redundantes a propósito, y está medido** (flip-test del 2026-09-25):
 * quitando CUALQUIERA de las dos por separado, una selección de cereza sigue quedando fuera y la
 * prueba «control negativo» sigue en verde; sólo cae quitando las dos a la vez. O sea que esa
 * prueba guarda el RESULTADO, no cada condición. **No se quita una «porque ya hay test»** — no lo
 * hay para eso, y escribirlo exigiría montar por SQL crudo un estado que ningún escritor produce.
 */
const ES_CLASIFICACION_VERDE = {
  transformationType: "selection",
  outputs: { some: { lot: { greenScreenStatus: { not: null } } } },
} satisfies Prisma.LotTransformationWhereInput;

type TransformacionClasificada = Prisma.LotTransformationGetPayload<{
  include: { inputs: true; outputs: typeof SALIDAS_CON_MALLA };
}>;

/**
 * Los pesos del esquema son `Decimal(10, 3)`. Sumarlos como `number` mete error binario —`0,1 +
 * 0,2` es `0.30000000000000004`— y eso llega crudo a la pantalla como precisión que nadie midió
 * (Codex, 2026-09-26). Redondear a los tres decimales que la base guarda no inventa nada: devuelve
 * la suma a la exactitud que el dato ya tenía.
 */
const enKg = (n: number) => Number(n.toFixed(3));

function armarClasificacion(tr: TransformacionClasificada): ClasificacionDeLote {
  const entradaKg = enKg(tr.inputs.reduce((suma, i) => suma + Number(i.quantity ?? 0), 0));
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
    .map((d) => ({ ...d, kg: enKg(d.kg), pct: pct(d.kg) }))
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
    // El `id` desempata: `occurredAt` lo pone quien registra y no es único, así que sin él dos
    // clasificaciones del mismo instante devolvían cualquiera de las dos (Codex, 2026-09-25).
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
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
  //
  // **Lo que este recorte NO hace, dicho para no prometer de más** (Codex, 2026-09-25):
  // `lotWhereFromVisibility` filtra por proyecto y ubicación, pero **no** por `classification`,
  // que `requireLotAccess` sí comprueba al abrir la ficha. Es una divergencia del ayudante
  // compartido —la tiene igual `getLotList`, o sea `/lots`— y no se corrige aquí: arreglarla en
  // una pantalla y no en las otras deja dos reglas conviviendo. Anotada para Daniel aparte.
  if (where === null) {
    return { columnas: [], filas: [], sinClasificar: 0, sinAmbito: true, truncado: false, limite: LIST_LIMIT };
  }
  const verdesVisibles: Prisma.LotWhereInput = { AND: [where, { lotType: "green" }] };
  const tieneClasificacion: Prisma.LotWhereInput = {
    transformationInputs: { some: { transformation: ES_CLASIFICACION_VERDE } },
  };

  // **Se pagina por LOTE y no por transformación** (Codex, hallazgo 3). Antes cada transformación
  // era una fila, así que un lote clasificado dos veces salía dos veces —incumpliendo «una fila
  // por lote», que es la decisión de Daniel— y además gastaba dos huecos del tope, desplazando a
  // otros lotes. Eligiendo los lotes primero, el tope cuenta lo que dice contar.
  const [candidatos, sinClasificar] = await Promise.all([
    prisma.lot.findMany({
      where: { AND: [verdesVisibles, tieneClasificacion] },
      select: { id: true, lotCode: true },
      orderBy: { createdAt: "desc" },
      // El +1 es el que hace que `truncate` pueda detectar el corte sin un segundo `count`.
      take: LIST_LIMIT + 1,
    }),
    // **Un solo `count`, no una resta** (Codex, hallazgo 4). Restar dos conteos independientes
    // mezcla dos instantáneas: con una escritura concurrente en medio, el resultado no es el
    // número de nada. Contar directamente los que no tienen clasificación no tiene ese problema.
    prisma.lot.count({ where: { AND: [verdesVisibles, { NOT: tieneClasificacion }] } }),
  ]);

  const { items: lotes, truncated, limit } = truncate(candidatos);
  if (lotes.length === 0) {
    return { columnas: [], filas: [], sinClasificar, sinAmbito: false, truncado: truncated, limite: limit };
  }

  const ids = lotes.map((l) => l.id);
  const transformaciones = await prisma.lotTransformation.findMany({
    where: { ...ES_CLASIFICACION_VERDE, inputs: { some: { lotId: { in: ids } } } },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    include: { inputs: true, outputs: SALIDAS_CON_MALLA },
  });

  // La MÁS RECIENTE de cada lote, que es la que ya enseña su ficha: dos pantallas que eligen
  // distinto sobre el mismo lote son dos verdades. Vienen ordenadas, así que la primera gana.
  const masReciente = new Map<string, TransformacionClasificada>();
  for (const tr of transformaciones) {
    for (const entrada of tr.inputs) {
      if (!masReciente.has(entrada.lotId)) masReciente.set(entrada.lotId, tr);
    }
  }

  const columnas = new Map<string, ColumnaDeMalla>();
  const filas: FilaDeComparacion[] = [];

  for (const lote of lotes) {
    const tr = masReciente.get(lote.id);
    if (!tr) continue;
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
    filas.push({
      // El lote sale de la consulta de lotes, que YA pasó por el `where` de visibilidad — no de
      // `tr.inputs[0]`, que en una transformación de varias entradas podía ser de otra finca
      // (Codex, hallazgo 2). `entradaKg` sí suma todas las entradas, a propósito: es la base del
      // balance de masa de esa transformación y no un dato de este lote.
      lotId: lote.id,
      lotCode: lote.lotCode,
      clasificadoEl: c.clasificadoEl,
      entradaKg: c.entradaKg,
      repartoPct,
      // **Se suman los KILOS y se redondea UNA vez** (Codex, hallazgo 6). Sumando porcentajes ya
      // redondeados, dos categorías de 0,014 kg sobre 100 daban 0,02 % donde el peso total dice
      // 0,03 %.
      defectosPct:
        c.entradaKg > 0
          ? Number(((enKg(c.defectos.reduce((suma, d) => suma + d.kg, 0)) / c.entradaKg) * 100).toFixed(2))
          : null,
      estadoDelDato: c.estadoDelDato,
    });
  }

  const ordenadas = [...columnas.values()].sort((a, b) => {
    if (a.sinRango !== b.sinRango) return a.sinRango ? 1 : -1;
    return (b.rangoMax ?? b.rangoMin ?? 0) - (a.rangoMax ?? a.rangoMin ?? 0);
  });

  return { columnas: ordenadas, filas, sinClasificar, sinAmbito: false, truncado: truncated, limite: limit };
}
