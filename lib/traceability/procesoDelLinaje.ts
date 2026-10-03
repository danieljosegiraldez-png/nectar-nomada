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
import { Prisma, type ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { computeLotBalance, FULL_CONSUMPTION_TYPES, resolveTolerancePct } from "./balance";
import { LotProcessError } from "./errorDeProceso";
import { ordenDeBloqueo } from "./ordenDeBloqueo";
import { TOPE_DE_LINAJE } from "./topeDeLinaje";

/**
 * R1: 64 generaciones en las dos direcciones; una cadena de 64 ancestros se resuelve y la generación 65 lanza (`nivel > TOPE` al
 * empezar cada vuelta). El valor vive en `topeDeLinaje.ts`, un módulo puro que lee la prueba hermética de los textos de error; se
 * reexporta aquí con el mismo nombre (ronda de arreglo 1 de la tarea 12, 2026-10-03).
 */
export { TOPE_DE_LINAJE };

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

/**
 * El id de un lote en minúsculas, que es como la base lo devuelve (revisión final, ronda de arreglo 1, 2026-10-03; corrige el
 * registro, línea 139). Postgres compara un `uuid` sin distinguir mayúsculas, así que una consulta con el id en mayúsculas
 * encuentra la fila; pero este módulo compara en JavaScript el id que RECIBE con los que la base devuelve (`conProceso.has`,
 * `padres.get`, `vistos`), y ahí `"ABC…" !== "abc…"`. Con el id de la URL en mayúsculas, `procesoQueCubre` daba `sin_proceso` a
 * un lote cuyo proceso vive en un ancestro —y la compuerta de bodega lo dejaba ENTRAR con el proceso abierto—, y `mezcla` a uno
 * con proceso propio. Se normaliza UNA vez, a la entrada de cada función pública que recibe un id de lote.
 */
export function enMinusculas(lotId: string): string {
  return lotId.toLowerCase();
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
  lotId = enMinusculas(lotId); // F5: ver `enMinusculas`.
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
  lotId = enMinusculas(lotId); // F5: ver `enMinusculas`.
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
 *
 * **Lanza `lineage_too_deep` en dos casos, no en uno** (ronda de arreglo 1, 2026-10-01): cuando el
 * recorrido que BUSCA el proceso pasa del tope, y también cuando el vigente ya resolvió pero la cadena
 * hacia arriba (`historiaArriba`) pasa del tope. Decisión: la historia no se trunca en silencio. Una
 * cadena cortada que contestara sin los procesos de más arriba se leería como «no hubo más», y la Parte
 * 5 atribuye las tazas por esa cadena.
 */
export async function procesoQueCubre(tx: Prisma.TransactionClient, lotId: string): Promise<Cobertura> {
  lotId = enMinusculas(lotId); // F5: ver `enMinusculas`.
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
/**
 * Las opciones de TODA transacción interactiva que bloquea el linaje (revisión final de la Parte 1, ronda de arreglo 1,
 * 2026-10-03; menor M4). El tope de Prisma por defecto es de 5 s y cuenta también la espera por los `FOR UPDATE`: una
 * división bajo un proceso hace cientos de consultas en serie (una por nivel de linaje y por parte), y una operación del
 * mismo linaje que espera detrás gasta su propio presupuesto esperando. Al pasarse, Prisma revierte todo (P2028) y la
 * operación no se puede registrar nunca. `timeout` es el del precedente de la casa (`lib/equipos/bandejas.ts`, 60 s); `maxWait`
 * —la espera por una conexión del grupo, 2 s por defecto— 10 s. La latencia real contra Neon NO está medida.
 */
export const TRANSACCION_DEL_LINAJE = { timeout: 60_000, maxWait: 10_000 } as const;

export async function bloquearLinaje(tx: Prisma.TransactionClient, lotId: string): Promise<void> {
  await bloquearLinajes(tx, [lotId]);
}

export async function bloquearLinajes(tx: Prisma.TransactionClient, lotIds: readonly string[]): Promise<void> {
  const todos = new Set<string>();
  for (const id of lotIds) {
    todos.add(id);
    for (const a of await idsDeAscendencia(tx, id)) todos.add(a);
  }
  // R2: `ordenDeBloqueo` y no un `.sort()` aquí: un uuid en mayúsculas apunta a la misma fila con otra posición.
  for (const id of ordenDeBloqueo([...todos])) {
    await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${id}::uuid FOR UPDATE`;
  }
}

/**
 * R6.6. Un lote es «dividido» si es la entrada de una división que cerró un proceso. Lo deciden
 * TODAS las reglas que lo rechazan por esta función, y no por cuatro consultas sueltas que puedan
 * divergir.
 *
 * **Con `occurredAt`, sólo lo es para lo que ocurrió desde la división** (decisión de Daniel, 2026-10-02,
 * registro línea 188): un registro cuyo instante es ESTRICTAMENTE anterior al de la transformación que cerró
 * el proceso describe el café de antes de dividir, y se admite en el lote dividido. Es lo que dice la fuente
 * que cita la regla, `20_modelo_ciclo_completo.md` §1.1: «todo registro POSTERIOR pertenece a un hijo». **El
 * mismo instante cuenta como dividido** (decisión del controlador de la revisión final, 2026-10-03): una
 * lectura con la hora exacta de la división no se puede atribuir al café de antes, y se cuelga de una parte.
 * La usan las puertas que reciben la fecha del registro: medir, corregir una medición, sacar una muestra e
 * inspeccionar. Sin fecha —abrir un proceso, empezar una corrida, transformar, almacenar, devolver—, como
 * siempre: lo que se hace AHORA sobre un lote dividido se rechaza.
 */
export async function loteDividido(tx: Prisma.TransactionClient, lotId: string, occurredAt?: Date): Promise<boolean> {
  lotId = enMinusculas(lotId); // F5: ver `enMinusculas`.
  const p = await tx.lotProcess.findFirst({
    where: {
      closureKind: "divided",
      dividedByTransformation: {
        inputs: { some: { lotId } },
        ...(occurredAt === undefined ? {} : { occurredAt: { lte: occurredAt } }),
      },
    },
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
  /**
   * La cobertura de ESTE lote, si quien llama ya la resolvió (tarea 9, ronda de arreglo 1, 2026-10-02). El tablero la
   * necesita además para las fases y las metas, y subir por el linaje dos veces por lote eran el doble de consultas para la
   * misma respuesta. Sin ella, se resuelve aquí. Tiene que ser la de `lotId`: no se comprueba.
   */
  yaResuelta?: Cobertura,
): Promise<{ endedAt: Date | null; gradoDeProceso: string | null }[]> {
  const cobertura = yaResuelta ?? (await procesoQueCubre(tx, lotId));
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

/**
 * R2 (Parte 1, 2026-10-01). Un solo proceso abierto por café. La usan LAS DOS puertas que dejan un
 * proceso abierto: abrir uno y devolver a secado (que abre una continuación). La primera versión del
 * diseño sólo protegía la primera, y la revisión lo cazó.
 *
 * Se llama dentro de la transacción y DESPUÉS de `bloquearLinaje`: lee lo que la escritura va a
 * cambiar, y el bloqueo es lo que impide que otra apertura en el mismo linaje se cuele entre la
 * lectura y la escritura.
 */
export async function exigeSinOtroProcesoAbierto(tx: Prisma.TransactionClient, lotId: string): Promise<void> {
  lotId = enMinusculas(lotId); // F5: ver `enMinusculas`.
  const lote = await tx.lot.findUnique({ where: { id: lotId }, select: { lotType: true } });
  if (!lote) throw new LotProcessError("lot_not_found");
  if (lote.lotType === "honey") throw new LotProcessError("proceso_no_aplica_a_miel");
  if (await loteDividido(tx, lotId)) throw new LotProcessError("lote_dividido");
  const cobertura = await procesoQueCubre(tx, lotId);
  if (cobertura.estado === "mezcla") throw new LotProcessError("lote_mezclado");
  // Por el linaje, no sólo el vigente: el vigente sólo mira hacia arriba, así que no ve un proceso
  // abierto en un descendiente, y un ancestro puede tener uno abierto más arriba de otro cerrado más
  // cerca.
  const descendencia = await idsDeDescendencia(tx, lotId);
  const linaje = [lotId, ...(await idsDeAscendencia(tx, lotId)), ...descendencia];
  const abierto = await tx.lotProcess.findFirst({
    where: { lotId: { in: linaje }, endedAt: null },
    select: { id: true },
  });
  if (abierto) throw new LotProcessError("process_already_open");
  // Decisión de Daniel, 2026-10-02 (registro, línea 189): «ya en almacén/reposo no se puede abrir un lote, pero sí puede
  // una parte ir a almacén al ser dividido y otra regresar a fermentación o seguir en secado». Un proceso abierto aquí
  // cubriría también al descendiente que ya está guardado, así que se rechaza; para procesar lo que queda, primero se
  // divide (R6) y lo guardado conserva su proceso. Vale para las dos puertas: abrir, y devolver a secado un lote cuyo
  // descendiente está en bodega (registro, línea 182).
  //
  // ANTES de la bodega del propio lote, a propósito: `puedeDevolverASecado` lee un `lote_en_bodega` como «todo lo anterior
  // pasó», porque la devolución termina esa bodega antes de abrir la continuación. La del descendiente no la termina nadie.
  if (descendencia.length > 0) {
    const descendienteEnBodega = await tx.storageAssignment.findFirst({
      where: { lotId: { in: descendencia }, endedAt: null },
      select: { id: true },
    });
    if (descendienteEnBodega) throw new LotProcessError("descendiente_en_bodega");
  }
  const enBodega = await tx.storageAssignment.findFirst({ where: { lotId, endedAt: null }, select: { id: true } });
  if (enBodega) throw new LotProcessError("lote_en_bodega");
}

/** Lo que se escribe al abrir un proceso, ya validado por quien llama (R2). */
export interface NucleoDeApertura {
  lotId: string;
  processRecipeVersionId: string | null;
  intent: string;
  processGradeValueId: string;
  cherryStateValueId: string;
  targetMoisturePct: number | Prisma.Decimal;
  startedAt: Date;
  notes: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference: string | null;
  /** R6.4 y R7: de qué proceso viene una parte de una división o una continuación. */
  derivedFromLotProcessId?: string | null;
}

/**
 * Abre un proceso DENTRO de una transacción que ya bloqueó el linaje (R2). No autoriza: los
 * envoltorios (`abrirProceso`, la división, la devolución) ya lo hicieron. Su auditoría va con el
 * mismo `tx`.
 */
export async function abrirProcesoEnTx(tx: Prisma.TransactionClient, userAccountId: string, input: NucleoDeApertura) {
  await exigeSinOtroProcesoAbierto(tx, input.lotId);
  const ultimo = await tx.lotProcess.findFirst({
    where: { lotId: input.lotId },
    orderBy: { sequenceOrder: "desc" },
    select: { sequenceOrder: true },
  });
  const proceso = await tx.lotProcess.create({
    data: {
      lotId: input.lotId,
      sequenceOrder: (ultimo?.sequenceOrder ?? 0) + 1,
      processRecipeVersionId: input.processRecipeVersionId,
      intent: input.intent,
      processGradeValueId: input.processGradeValueId,
      cherryStateValueId: input.cherryStateValueId,
      targetMoisturePct: input.targetMoisturePct,
      startedAt: input.startedAt,
      notes: input.notes,
      provenanceClass: input.provenanceClass,
      sourceReference: input.sourceReference,
      derivedFromLotProcessId: input.derivedFromLotProcessId ?? null,
      createdBy: userAccountId,
    },
  });
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "lot_process.open",
      entityType: "lot_process",
      entityId: proceso.id,
      after: proceso,
      sourceInterface: "traceability.lotProcess",
    },
    tx,
  );
  return proceso;
}

/**
 * R3/R4 (Parte 1, 2026-10-01). El proceso al que se une una corrida que empieza sobre `lotId`, o el
 * rechazo con nombre. Bloquea el linaje: una división o un cierre a la vez no pueden dejar la corrida
 * bajo un proceso que ya no está abierto.
 *
 * Se llama dentro de la transacción que crea la corrida. No autoriza: el permiso se pidió fuera, sobre
 * el lote de la corrida, y nunca se exige gestionar el lote donde vive el proceso.
 */
export async function procesoAbiertoParaCorrida(
  tx: Prisma.TransactionClient,
  lotId: string,
): Promise<{ id: string; processRecipeVersionId: string | null }> {
  lotId = enMinusculas(lotId); // F5: ver `enMinusculas`.
  await bloquearLinaje(tx, lotId);
  // Todo lo que decide va DESPUÉS del bloqueo, y es la MISMA función que pregunta la pantalla (`puedeEmpezarCorrida`).
  return procesoParaUnaCorrida(tx, lotId);
}

/**
 * Lo que decide si una corrida puede empezar sobre `lotId`, sin bloquear nada: la usan `procesoAbiertoParaCorrida`, ya con el
 * linaje bloqueado, y `puedeEmpezarCorrida` (`lotProcess.ts`), que decide qué OFRECE la pantalla. Una sola función, para que
 * la pantalla pregunte lo mismo que el servicio y no una copia que pueda divergir.
 *
 * **La garantía de R7, «bajo un proceso abierto hay una sola línea de café viva»** (revisión final, ronda de arreglo 1,
 * 2026-10-03). El diseño la apoyaba en que una corrida consume su lote entero, y nada lo hacía cumplir: se podía empezar una
 * segunda corrida sobre un lote con otra abierta, o sobre la cereza que su fermentación ya había consumido —nace F2, el
 * mismo café dos veces, y la humedad que cierra el proceso deja de describir lo que va a bodega—. Se rechaza:
 * - `corrida_ya_abierta`: el lote es la entrada de una transformación ligada a una fermentación o un secado sin terminar
 *   (`startFermentationRun` y `startDryingRun` escriben esa transformación, sin salidas, al empezar);
 * - `lote_consumido`: el lote es la entrada de una transformación de consumo total (`FULL_CONSUMPTION_TYPES`, el mismo
 *   conjunto con que el libro de masa descuenta el lote entero) que tiene alguna salida —la que escribe el FIN de una
 *   corrida—. La de inicio no tiene salidas y no cuenta. `split` y `selection` no son de consumo total (son parciales);
 *   una división bajo un proceso ya la cierra `lote_dividido`.
 */
export async function procesoParaUnaCorrida(
  tx: Prisma.TransactionClient,
  lotId: string,
): Promise<{ id: string; processRecipeVersionId: string | null }> {
  lotId = enMinusculas(lotId); // F5: ver `enMinusculas`.
  if (await loteDividido(tx, lotId)) throw new LotProcessError("lote_dividido");
  const enBodega = await tx.storageAssignment.findFirst({ where: { lotId, endedAt: null }, select: { id: true } });
  if (enBodega) throw new LotProcessError("lote_en_bodega");
  const corridaAbierta = await tx.lotTransformationInput.findFirst({
    where: { lotId, transformation: { OR: [{ fermentationRun: { is: { endedAt: null } } }, { dryingRun: { is: { endedAt: null } } }] } },
    select: { id: true },
  });
  if (corridaAbierta) throw new LotProcessError("corrida_ya_abierta");
  const consumido = await tx.lotTransformationInput.findFirst({
    where: { lotId, transformation: { transformationType: { in: [...FULL_CONSUMPTION_TYPES] }, outputs: { some: {} } } },
    select: { id: true },
  });
  if (consumido) throw new LotProcessError("lote_consumido");
  const cobertura = await procesoQueCubre(tx, lotId);
  if (cobertura.estado === "mezcla") throw new LotProcessError("lote_mezclado");
  if (cobertura.estado !== "abierto") throw new LotProcessError("sin_proceso_abierto");
  return tx.lotProcess.findUniqueOrThrow({
    where: { id: cobertura.vigente.id },
    select: { id: true, processRecipeVersionId: true },
  });
}

/**
 * R5 (Parte 1, 2026-10-01). Ninguna fermentación ni secado abierto en el linaje que el proceso cubre:
 * ni las unidas por `lotProcessId`, ni las que empezaron sobre un lote cubierto sin quedar unidas —las
 * de antes de esta parte, que R9 no rellena—. Cuenta las dos clases de corrida, porque las dos puertas
 * (`startFermentationRun`, `startDryingRun`) las abren. La usan el cierre y la división (R6.2).
 *
 * Se llama dentro de la transacción y DESPUÉS de `bloquearLinaje`: lee lo que el cierre va a decidir, y
 * el bloqueo es lo que impide que una corrida empiece entre esta lectura y la escritura.
 */
export async function exigeSinCorridasAbiertas(
  tx: Prisma.TransactionClient,
  proceso: { id: string; lotId: string },
): Promise<void> {
  const cubiertos = [proceso.lotId, ...(await idsDeDescendencia(tx, proceso.lotId))];
  const donde = {
    endedAt: null,
    OR: [
      { lotProcessId: proceso.id },
      { transformations: { some: { inputs: { some: { lotId: { in: cubiertos } } } } } },
    ],
  };
  const fermentaciones = await tx.fermentationRun.count({ where: donde });
  const secados = await tx.dryingRun.count({ where: donde });
  if (fermentaciones + secados > 0) throw new LotProcessError("corridas_abiertas");
}

/** Parte 1, R6: las transformaciones que tienen reglas cuando un proceso abierto cubre a su entrada. */
export type TipoConReglaDeProceso = "split" | "selection" | "merge" | "blend";

/**
 * R6 (Parte 1, 2026-10-01), ANTES de escribir la transformación. Bloquea los linajes de las entradas y decide:
 * - un lote dividido no se vuelve a dividir, seleccionar ni fusionar (R6.6);
 * - bajo un proceso abierto no se selecciona (R6.7: «primero se selecciona, después el proceso») ni se
 *   fusiona (R6.8), y una «división» con varias entradas también junta cafés;
 * - un `split` bajo un proceso abierto devuelve ese proceso, que `dividirProcesoEnTx` cerrará y copiará
 *   DESPUÉS de crear las partes. Antes rechaza si no trae ninguna parte (R6.1) o si hay una corrida en
 *   curso (R6.2).
 *
 * Es lo PRIMERO de la transacción de `recordTransformation`: el bloqueo va antes que cualquier otra fila
 * que la transacción toque, para no romper el orden global por id (R2). Todo lo que decide lo lee después
 * del bloqueo: una corrida que empiece a la vez sobre el mismo café espera, o se ve aquí.
 *
 * `numeroDePartes` (ronda de arreglo 1, 2026-10-01) son las salidas que la transformación va a crear: se
 * pasa aquí, y no se mira en `dividirProcesoEnTx`, para que el rechazo llegue antes de escribir nada.
 */
export async function antesDeTransformar(
  tx: Prisma.TransactionClient,
  args: { tipo: TipoConReglaDeProceso; inputLotIds: readonly string[]; numeroDePartes: number },
): Promise<{ procesoId: string } | null> {
  // F5: ver `enMinusculas`. Las entradas, una vez, antes de todo lo demás.
  const inputLotIds = args.inputLotIds.map(enMinusculas);
  await bloquearLinajes(tx, inputLotIds);
  for (const lotId of inputLotIds) {
    if (await loteDividido(tx, lotId)) throw new LotProcessError("lote_dividido");
  }
  const abiertos: ProcesoEnCadena[] = [];
  for (const lotId of inputLotIds) {
    const c = await procesoQueCubre(tx, lotId);
    if (c.estado === "abierto") abiertos.push(c.vigente);
  }
  if (abiertos.length === 0) return null;
  if (args.tipo === "selection") throw new LotProcessError("seleccion_bajo_proceso_abierto");
  if (args.tipo === "merge" || args.tipo === "blend" || inputLotIds.length > 1) {
    throw new LotProcessError("fusion_bajo_proceso_abierto");
  }
  // R6.1 (ronda de arreglo 1, 2026-10-01): se divide el lote ENTERO en sus partes. Sin ninguna, TODO el café queda
  // fuera de ellas, y sin libro de masa nada más lo vería: el proceso se cerraba como dividido sin una sola copia, y
  // el café se quedaba sin proceso en un lote cerrado a todo.
  if (args.numeroDePartes === 0) throw new LotProcessError("division_deja_remanente");
  const vigente = abiertos[0]!;
  await exigeSinCorridasAbiertas(tx, { id: vigente.id, lotId: vigente.lotId });
  return { procesoId: vigente.id };
}

/** Lo que `recordTransformation` sabe de la división cuando ya creó las partes y descontó la masa. */
export interface ArgumentosDeDivision {
  procesoId: string;
  transformationId: string;
  occurredAt: Date;
  /** La entrada de la división: el lote que queda cerrado (R6.6). */
  loteDividido: string;
  /** Lo que el operario declaró que entró; sobre ello se calcula la tolerancia (R6.1). */
  cantidadDeEntrada: number | null;
  partes: readonly string[];
  organizationId: string;
}

/**
 * R6 (Parte 1, 2026-10-01), DESPUÉS de crear las partes y de descontar la masa: comprueba que no quede café
 * fuera de las partes, cierra el proceso como `divided` y da a cada parte su copia, unida a él. Corre en la
 * transacción de `recordTransformation`, con el linaje ya bloqueado por `antesDeTransformar`.
 *
 * Recibe el principal sólo para firmar el cierre y las aperturas: no autoriza. `recordTransformation` ya pidió
 * `manage` sobre el lote que se divide.
 *
 * La firma va en UNA línea y con el tipo nombrado: `audit-atomico` reconoce así una función que audita con el
 * `tx` que recibe (una firma partida en varias líneas, o con un tipo literal `{ … }`, no la ve).
 */
export async function dividirProcesoEnTx(tx: Prisma.TransactionClient, userAccountId: string, args: ArgumentosDeDivision) {
  const proceso = await tx.lotProcess.findUniqueOrThrow({ where: { id: args.procesoId } });
  // R6.3: el cierre es el instante de la división, y no puede ser anterior al inicio.
  if (args.occurredAt < proceso.startedAt) throw new LotProcessError("ends_before_it_started");

  // R6.1: se divide el lote ENTERO. Lo que quede, dentro de la tolerancia de masa de la organización —la misma
  // con la que el libro reconcilia la división—, no es remanente. Sin libro de masa el remanente no se puede
  // saber: la división se acepta y el cierre lo dice en su auditoría.
  const organizacion = await tx.organization.findUnique({ where: { id: args.organizationId }, select: { massBalanceTolerancePct: true } });
  const pct = resolveTolerancePct(organizacion);
  const saldo = await computeLotBalance(tx, args.loteDividido);
  const sinLibroDeMasa = !saldo.recorded;
  if (saldo.recorded) {
    const entrada = new Prisma.Decimal(args.cantidadDeEntrada ?? 0);
    const tolerancia = entrada.mul(pct).div(100).abs();
    if (saldo.quantity.greaterThan(tolerancia)) throw new LotProcessError("division_deja_remanente");
  }
  // Y ningún OTRO lote cubierto por el proceso puede conservar saldo: quedaría bajo un proceso dividido sin
  // haber sido dividido (`20_modelo_ciclo_completo.md` §1.1). Las muestras no cuentan.
  // F5: los ids de la base vienen en minúsculas; el del lote dividido llega de quien llamó (ver `enMinusculas`).
  const dividido = enMinusculas(args.loteDividido);
  const cubiertos = [proceso.lotId, ...(await idsDeDescendencia(tx, proceso.lotId))].filter(
    (id) => id !== dividido && !args.partes.map(enMinusculas).includes(id),
  );
  for (const id of cubiertos) {
    const lote = await tx.lot.findUniqueOrThrow({ where: { id }, select: { lotType: true } });
    if (lote.lotType === "sample") continue;
    const s = await computeLotBalance(tx, id);
    if (s.recorded && s.quantity.greaterThan(0)) throw new LotProcessError("division_deja_remanente");
  }

  // R6.3: cerrado como `divided`, sin medición y con la división que lo cerró (los CHECK de la migración exigen
  // las dos cosas).
  const cerrado = await tx.lotProcess.update({
    where: { id: proceso.id },
    data: { endedAt: args.occurredAt, closureKind: "divided", dividedByTransformationId: args.transformationId },
  });
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "lot_process.close",
      entityType: "lot_process",
      entityId: cerrado.id,
      before: { endedAt: null },
      after: { endedAt: cerrado.endedAt, closureKind: "divided", dividedByTransformationId: args.transformationId, sinLibroDeMasa },
      sourceInterface: "traceability.lotProcess",
    },
    tx,
  );

  // R6.4: cada parte nace con su propio proceso, copiado, que empieza en el INSTANTE de la división —no
  // «ahora»: el import cerrará con humedades de fechas históricas, y el CHECK de fechas lo rechazaría—. La
  // historia anterior no se copia: se hereda por la cadena de R1 (R6.5).
  const copias = [];
  for (const parte of args.partes) {
    copias.push(
      await abrirProcesoEnTx(tx, userAccountId, {
        lotId: parte,
        processRecipeVersionId: proceso.processRecipeVersionId,
        intent: proceso.intent,
        processGradeValueId: proceso.processGradeValueId,
        cherryStateValueId: proceso.cherryStateValueId,
        targetMoisturePct: proceso.targetMoisturePct,
        startedAt: args.occurredAt,
        notes: proceso.notes,
        provenanceClass: proceso.provenanceClass,
        sourceReference: proceso.sourceReference,
        derivedFromLotProcessId: proceso.id,
      }),
    );
  }
  return { cerrado, copias };
}
