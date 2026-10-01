/**
 * El proceso que cubre a un lote, buscado hacia arriba por su linaje — Parte 1, R1 (2026-10-01).
 * docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md
 *
 * **Por qué existe.** El proceso se abre sobre el lote aceptado (decisión de Daniel, 2026-09-19), y
 * cada corrida que termina crea un lote NUEVO: el secado ocurre en el hijo, la bodega guarda al
 * nieto, la taza sale del verde. Todo lo que buscaba el proceso «en el propio lote» dejaba de verlo
 * a la primera generación. Daniel eligió que el lote lo busque HACIA ARRIBA, sin guardar nada nuevo
 * en el lote: así la respuesta no puede contradecir al linaje.
 *
 * **Es el único que resuelve esto.** Un guardia de arquitectura (`proceso-por-el-resolvedor`) prohíbe
 * leer los procesos de un lote por `lotId` fuera de aquí.
 *
 * **No importa `lots.ts`** —`lots.ts` lo llamará y sería un ciclo— **y trabaja siempre con el `tx`
 * que recibe**, nunca con el cliente global: quien llama pasa el de su transacción, o el global si
 * sólo lee. Nada de aquí autoriza: quien llama ya autorizó.
 */
import type { Prisma } from "../../generated/prisma/client";
import { LotProcessError } from "./errorDeProceso";

/**
 * R1: 64 generaciones en las dos direcciones. Un multiproceso real tiene unas diez. Una cadena de 64
 * ancestros se resuelve; la generación 65 lanza (`nivel > TOPE` al empezar cada vuelta).
 */
export const TOPE_DE_LINAJE = 64;

export type OrigenDelProceso = "original" | "parte_de_division" | "continuacion";

export interface ProcesoEnCadena {
  readonly id: string;
  readonly lotId: string;
  /** Generaciones entre el lote consultado y el lote donde vive este proceso. 0 = el propio lote. */
  readonly profundidad: number;
  readonly sequenceOrder: number;
  readonly endedAt: Date | null;
  readonly closureKind: "moisture" | "divided" | null;
  readonly derivedFromLotProcessId: string | null;
  readonly origen: OrigenDelProceso;
}

export interface Composicion {
  /** Los procesos distintos a los que llegan las ramas. */
  readonly procesos: readonly ProcesoEnCadena[];
  /** Alguna rama llegó a una raíz sin pasar por ningún proceso. */
  readonly ramaSinProceso: boolean;
}

export type Cobertura =
  | { readonly estado: "sin_proceso"; readonly vigente: null; readonly cadena: readonly ProcesoEnCadena[]; readonly composicion: null }
  | { readonly estado: "abierto" | "cerrado"; readonly vigente: ProcesoEnCadena; readonly cadena: readonly ProcesoEnCadena[]; readonly composicion: null }
  | { readonly estado: "mezcla"; readonly vigente: null; readonly cadena: readonly ProcesoEnCadena[]; readonly composicion: Composicion };

const SELECCION = {
  id: true,
  lotId: true,
  sequenceOrder: true,
  endedAt: true,
  closureKind: true,
  derivedFromLotProcessId: true,
  returnThatOpened: { select: { id: true } },
} as const;

type FilaDeProceso = {
  id: string;
  lotId: string;
  sequenceOrder: number;
  endedAt: Date | null;
  closureKind: "moisture" | "divided" | null;
  derivedFromLotProcessId: string | null;
  returnThatOpened: { id: string } | null;
};

function enCadena(p: FilaDeProceso, profundidad: number): ProcesoEnCadena {
  return {
    id: p.id,
    lotId: p.lotId,
    profundidad,
    sequenceOrder: p.sequenceOrder,
    endedAt: p.endedAt,
    closureKind: p.closureKind,
    derivedFromLotProcessId: p.derivedFromLotProcessId,
    origen: p.derivedFromLotProcessId === null ? "original" : p.returnThatOpened ? "continuacion" : "parte_de_division",
  };
}

/** Los padres directos de cada lote: las entradas de las transformaciones que lo produjeron. */
async function padresDe(tx: Prisma.TransactionClient, lotIds: readonly string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (lotIds.length === 0) return mapa;
  const salidas = await tx.lotTransformationOutput.findMany({
    where: { lotId: { in: [...lotIds] } },
    select: { lotId: true, transformation: { select: { inputs: { select: { lotId: true } } } } },
  });
  for (const s of salidas) {
    const acc = mapa.get(s.lotId) ?? [];
    for (const i of s.transformation.inputs) if (!acc.includes(i.lotId)) acc.push(i.lotId);
    mapa.set(s.lotId, acc);
  }
  return mapa;
}

/** Los hijos directos: las salidas de las transformaciones en las que estos lotes entraron. */
async function hijosDe(tx: Prisma.TransactionClient, lotIds: readonly string[]): Promise<string[]> {
  if (lotIds.length === 0) return [];
  const entradas = await tx.lotTransformationInput.findMany({
    where: { lotId: { in: [...lotIds] } },
    select: { transformation: { select: { outputs: { select: { lotId: true } } } } },
  });
  return entradas.flatMap((e) => e.transformation.outputs.map((o) => o.lotId));
}

/**
 * Todos los ancestros del lote, sin él. Recorre por niveles con un conjunto de vistos: un diamante
 * —dividir y volver a juntar— no multiplica caminos, que es lo que hacía el `UNION ALL` de antes.
 * **Lanza al pasar el tope**: un recorrido cortado que respondiera «no hay más» se leería como
 * ausencia, y es justo el cero que significa «no miré».
 */
export async function idsDeAscendencia(tx: Prisma.TransactionClient, lotId: string): Promise<string[]> {
  const vistos = new Set<string>([lotId]);
  let frontera = [lotId];
  for (let nivel = 0; frontera.length > 0; nivel++) {
    if (nivel > TOPE_DE_LINAJE) throw new LotProcessError("lineage_too_deep");
    const padres = await padresDe(tx, frontera);
    const siguiente: string[] = [];
    for (const ps of padres.values()) {
      for (const p of ps) {
        if (!vistos.has(p)) {
          vistos.add(p);
          siguiente.push(p);
        }
      }
    }
    frontera = siguiente;
  }
  vistos.delete(lotId);
  return [...vistos];
}

/**
 * Todos los descendientes, sin él. Antes vivía en `lots.ts` con un tope de 12 que cortaba EN
 * SILENCIO (R1): un multiproceso largo dejaba fuera a un descendiente con un proceso abierto.
 */
export async function idsDeDescendencia(tx: Prisma.TransactionClient, lotId: string): Promise<string[]> {
  const vistos = new Set<string>([lotId]);
  let frontera = [lotId];
  for (let nivel = 0; frontera.length > 0; nivel++) {
    if (nivel > TOPE_DE_LINAJE) throw new LotProcessError("lineage_too_deep");
    const hijos = await hijosDe(tx, frontera);
    const siguiente: string[] = [];
    for (const h of hijos) {
      if (!vistos.has(h)) {
        vistos.add(h);
        siguiente.push(h);
      }
    }
    frontera = siguiente;
  }
  vistos.delete(lotId);
  return [...vistos];
}

/** Lo que había ANTES del vigente: procesos anteriores del mismo lote y todos los de arriba. */
async function historiaArriba(tx: Prisma.TransactionClient, vigente: ProcesoEnCadena): Promise<ProcesoEnCadena[]> {
  const historia: ProcesoEnCadena[] = [];
  const delMismoLote = await tx.lotProcess.findMany({
    where: { lotId: vigente.lotId, sequenceOrder: { lt: vigente.sequenceOrder } },
    orderBy: { sequenceOrder: "desc" },
    select: SELECCION,
  });
  historia.push(...delMismoLote.map((p) => enCadena(p, vigente.profundidad)));

  const vistos = new Set<string>([vigente.lotId]);
  let frontera = [vigente.lotId];
  for (let nivel = vigente.profundidad + 1; frontera.length > 0; nivel++) {
    const padres = await padresDe(tx, frontera);
    const siguiente: string[] = [];
    for (const ps of padres.values()) {
      for (const p of ps) {
        if (!vistos.has(p)) {
          vistos.add(p);
          siguiente.push(p);
        }
      }
    }
    if (siguiente.length === 0) break;
    if (nivel > TOPE_DE_LINAJE) throw new LotProcessError("lineage_too_deep");
    const procesos = await tx.lotProcess.findMany({
      where: { lotId: { in: siguiente } },
      orderBy: { sequenceOrder: "desc" },
      select: SELECCION,
    });
    historia.push(...procesos.map((p) => enCadena(p, nivel)));
    frontera = siguiente;
  }
  return historia;
}

/**
 * R1. Cada rama sube por su cuenta hasta el primer lote —él incluido— que tenga algún proceso, y toma
 * el más reciente de ese lote.
 * - Si todas las ramas llegan al MISMO proceso, ése es el vigente.
 * - Si llegan a procesos distintos, o alguna termina en una raíz sin proceso, es una **mezcla**, y se
 *   devuelve su composición. Nunca se elige uno: «nunca se toma el valor del primer padre»
 *   (`20_modelo_ciclo_completo.md` §1.3).
 * - Sólo es `sin_proceso` si TODAS las ramas terminaron en raíces sin ninguno.
 */
export async function procesoQueCubre(tx: Prisma.TransactionClient, lotId: string): Promise<Cobertura> {
  const encontrados = new Map<string, ProcesoEnCadena>();
  let ramaSinProceso = false;
  const vistos = new Set<string>([lotId]);
  let frontera = [lotId];

  for (let nivel = 0; frontera.length > 0; nivel++) {
    if (nivel > TOPE_DE_LINAJE) throw new LotProcessError("lineage_too_deep");
    const procesos = await tx.lotProcess.findMany({
      where: { lotId: { in: frontera } },
      orderBy: { sequenceOrder: "desc" },
      select: SELECCION,
    });
    const conProceso = new Set<string>();
    for (const p of procesos) {
      if (conProceso.has(p.lotId)) continue; // el primero de cada lote es el más reciente
      conProceso.add(p.lotId);
      encontrados.set(p.id, enCadena(p, nivel));
    }
    const sinProceso = frontera.filter((id) => !conProceso.has(id));
    const padres = await padresDe(tx, sinProceso);
    const siguiente: string[] = [];
    for (const id of sinProceso) {
      const ps = padres.get(id) ?? [];
      if (ps.length === 0) ramaSinProceso = true;
      for (const p of ps) {
        if (!vistos.has(p)) {
          vistos.add(p);
          siguiente.push(p);
        }
      }
    }
    frontera = siguiente;
  }

  const distintos = [...encontrados.values()];
  if (distintos.length === 0) return { estado: "sin_proceso", vigente: null, cadena: [], composicion: null };
  if (distintos.length > 1 || ramaSinProceso) {
    return { estado: "mezcla", vigente: null, cadena: [], composicion: { procesos: distintos, ramaSinProceso } };
  }
  const vigente = distintos[0]!;
  const cadena = [vigente, ...(await historiaArriba(tx, vigente))];
  return { estado: vigente.endedAt === null ? "abierto" : "cerrado", vigente, cadena, composicion: null };
}

/**
 * R2 — concurrencia. Bloquea con `FOR UPDATE` las filas de `lot` del lote y de TODOS sus ancestros,
 * en orden de id. Dos operaciones sobre el mismo café comparten siempre al menos una fila —el
 * ancestro común, o el propio lote—, así que se ejecutan en fila; el orden fijo evita
 * interbloqueos. Los ancestros de un lote no cambian nunca después de crearlo (una transformación
 * sólo añade hijos), así que se pueden calcular antes de bloquear.
 *
 * No es `Serializable`: `lib/apiary/cierreDeCosecha.ts` documenta que eso abortó transacciones ajenas
 * que sólo compartían tabla, y la casa prefirió bloquear filas.
 */
export async function bloquearLinaje(tx: Prisma.TransactionClient, lotId: string): Promise<void> {
  await bloquearLinajes(tx, [lotId]);
}

export async function bloquearLinajes(tx: Prisma.TransactionClient, lotIds: readonly string[]): Promise<void> {
  const todos = new Set<string>();
  for (const id of lotIds) {
    todos.add(id);
    for (const a of await idsDeAscendencia(tx, id)) todos.add(a);
  }
  for (const id of [...todos].sort()) {
    await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${id}::uuid FOR UPDATE`;
  }
}

/**
 * R6.6. Un lote es «dividido» si es la entrada de una división que cerró un proceso. Lo deciden
 * TODAS las reglas que lo rechazan por esta función, y no por cuatro consultas sueltas que puedan
 * divergir.
 */
export async function loteDividido(tx: Prisma.TransactionClient, lotId: string): Promise<boolean> {
  const p = await tx.lotProcess.findFirst({
    where: { closureKind: "divided", dividedByTransformation: { inputs: { some: { lotId } } } },
    select: { id: true },
  });
  return p !== null;
}

/**
 * R7. Lo que `entradaDelLote` recibe como `procesos`, IGUAL para la ficha y para el tablero: el
 * vigente del lote. Antes cada uno armaba la suya —la ficha con los procesos propios, el tablero con
 * el de la corrida— y por eso podían discrepar. Una mezcla no tiene grado: lista vacía.
 */
export async function procesosParaEntrada(
  tx: Prisma.TransactionClient,
  lotId: string,
): Promise<{ endedAt: Date | null; gradoDeProceso: string | null }[]> {
  const cobertura = await procesoQueCubre(tx, lotId);
  if (!cobertura.vigente) return [];
  const p = await tx.lotProcess.findUniqueOrThrow({
    where: { id: cobertura.vigente.id },
    select: { endedAt: true, processGradeValue: { select: { value: true } } },
  });
  return [{ endedAt: p.endedAt, gradoDeProceso: p.processGradeValue.value }];
}

/** El grado del proceso que cubre al lote, o null (sin proceso, o mezcla). Para la lista de catas. */
export async function gradoDelProcesoQueCubre(tx: Prisma.TransactionClient, lotId: string): Promise<string | null> {
  const [p] = await procesosParaEntrada(tx, lotId);
  return p?.gradoDeProceso ?? null;
}
