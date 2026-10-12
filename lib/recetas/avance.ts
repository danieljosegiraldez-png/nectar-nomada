/**
 * El avance de un proceso sobre los pasos de su receta — Parte 2a, §4.3.
 * docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md (y su §12, vuelto a medir el 2026-10-03)
 *
 * **Qué responde.** Para un lote: qué pasos de la receta del proceso que lo cubre ya se cumplieron —con qué registros, en orden
 * de inicio— y cuál es el siguiente que el formulario propone. El operario puede elegir otro: saltar un opcional, o repetir uno
 * (el multiproceso secado → tratamiento → secado).
 *
 * **Sobre el HILO del vigente, no sobre el vigente solo.** Tras una división (R6) o una devolución a secado (R7), cada parte o
 * continuación es un proceso NUEVO con la misma versión, y lo hecho antes vive en el proceso del que deriva. Se sigue
 * `derivedFromLotProcessId` desde el vigente mientras su `origen` no sea `"original"`: eso recorre exactamente las divisiones y
 * las devoluciones, y se para en el proceso que alguien abrió a mano, que sí entra. Un REPROCESO —abierto con `abrirProceso`
 * sobre un proceso cerrado— es `original` aunque repita la versión del de arriba, y empieza su receta por el primer paso: con
 * «todos los procesos de la cadena que comparten la versión del vigente», la regla del diseño antes del §12, heredaría lo
 * ejecutado arriba. Un proceso de OTRA versión también corta el hilo. Los servicios copian siempre la versión a la parte y a
 * la continuación (`dividirProcesoEnTx`, `devolverASecado`), así que eso sólo llega por un import o una reparación; y entonces
 * lo de más arriba es de otra receta aunque vuelva a aparecer la del vigente.
 *
 * **Lo cumplido** son los registros de las cuatro tablas del §4.1 —fermentaciones y secados, intervenciones del proceso y
 * manejos dentro de una fermentación— que pertenecen a un proceso del hilo y llevan el `recipeStepId` de un paso de la versión
 * del vigente. Se unen al paso por `recipeStepId`, nunca por su tipo: un registro sin paso es una desviación (§4.4) y no cumple
 * ninguno.
 *
 * **El siguiente** es el primer paso, por `seq`, POSTERIOR al último cumplido —el de mayor `seq` con algún registro— cuyo tipo
 * puede cumplir algún registro (`TIPOS_POR_REGISTRO`). Posterior al último, y no «el primero sin registros»: un opcional que se
 * saltó no se vuelve a proponer para siempre. Y sólo tipos que algún registro cumple: la recepción se compara con las
 * recepciones de la ascendencia y no se registra (§4.5), y `freezing`, `aging`, `storage`… no tienen registro todavía (§4.6);
 * proponerlos sería proponer algo que ninguna pantalla puede guardar. Las dos reglas son inferencia de la casa sobre el §4.3,
 * no del paquete. Sin pasos, o con el último que se puede registrar ya cumplido, no hay siguiente.
 *
 * **Lee el proceso SÓLO por el resolvedor** (`tests/arquitectura/proceso-por-el-resolvedor.test.ts`): el hilo y las versiones
 * salen de la `cadena` de `procesoQueCubre`, y los registros se leen por los ids de los procesos del hilo.
 *
 * **No autoriza, y no puede: no recibe quién pregunta** (la firma la fija el esqueleto, como la de `procesoQueCubre`). Quien la
 * llama ya autorizó el lote, y además decide qué enseñar de los procesos del hilo que viven en lotes ancestros que quien mira
 * puede no ver: devuelve ids de registros y sus fechas de inicio, no filas. Es una operación «depende del llamador» del
 * inventario de acceso, y la prueba de rechazo de esa autorización es la de quien la llame (tarea 13), no la de ésta.
 */
import type { Prisma } from "../../generated/prisma/client";
import type { prisma } from "../db";
import { procesoQueCubre, type ProcesoEnCadena } from "../traceability/procesoDelLinaje";
import { TIPOS_DE_PASO, TIPOS_POR_REGISTRO, type RegistroDePaso, type TipoDePaso } from "./vocabulario";

export interface PasoConAvance { stepId: string; seq: number; tipo: TipoDePaso; opcional: boolean; registros: readonly { tabla: RegistroDePaso; id: string; inicio: Date }[] }

/** Los tipos de paso que algún registro del §4.1 puede cumplir: los únicos que tiene sentido proponer. */
const CUMPLIBLES: ReadonlySet<TipoDePaso> = new Set(Object.values(TIPOS_POR_REGISTRO).flat());

/** El tipo de un valor del catálogo `tipo_paso`, o el error si el catálogo y `TIPOS_DE_PASO` dejaron de decir lo mismo. */
function comoTipo(valor: string): TipoDePaso {
  const tipo = TIPOS_DE_PASO.find((t) => t === valor);
  if (tipo === undefined) throw new Error(`avanceDelProceso: «${valor}» no es un tipo de paso de TIPOS_DE_PASO (lib/recetas/vocabulario.ts)`);
  return tipo;
}

/**
 * El hilo del vigente: él y los procesos de los que deriva por división o por devolución, con su misma versión. Se para en un
 * proceso `original` —abierto a mano: el primero, o un reproceso—, que SÍ entra, y antes de uno de otra versión.
 */
function hiloDelVigente(vigente: ProcesoEnCadena, cadena: readonly ProcesoEnCadena[]): ProcesoEnCadena[] {
  const porId = new Map(cadena.map((p) => [p.id, p]));
  const hilo = [vigente];
  let actual = vigente;
  while (actual.origen !== "original" && actual.derivedFromLotProcessId !== null) {
    const anterior = porId.get(actual.derivedFromLotProcessId);
    // La parte nace en un hijo del lote dividido y la continuación en el lote devuelto: los dos, debajo del proceso del que
    // derivan, así que la cadena del resolvedor lo trae siempre. Si faltara, la derivación y el linaje dirían cosas distintas:
    // se dice, en vez de calcular sobre un hilo cortado que se leería como «aquí no se hizo nada».
    if (anterior === undefined) throw new Error(`avanceDelProceso: el proceso ${actual.id} deriva de ${actual.derivedFromLotProcessId}, que no está en la cadena del resolvedor`);
    if (anterior.processRecipeVersionId !== vigente.processRecipeVersionId) break;
    hilo.push(anterior);
    actual = anterior;
  }
  return hilo;
}

/** Por su inicio y, con el mismo inicio, por id: el orden no depende de cómo devuelva las filas la base. */
function porInicio(a: { id: string; inicio: Date }, b: { id: string; inicio: Date }): number {
  return a.inicio.getTime() - b.inicio.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * El avance del proceso que cubre a `lotId` sobre los pasos de su receta. `null` si no lo cubre UN proceso (sin proceso, o una
 * mezcla); sin receta (un proceso de antes de la receta obligatoria, R9), sin pasos y sin siguiente. Vale para el vigente
 * abierto y para el cerrado: cuándo se ofrece la propuesta lo decide la pantalla.
 */
export async function avanceDelProceso(tx: Prisma.TransactionClient | typeof prisma, lotId: string): Promise<{ recipeVersionId: string | null; pasos: readonly PasoConAvance[]; siguiente: PasoConAvance | null } | null> {
  const cobertura = await procesoQueCubre(tx, lotId);
  // Sin proceso, o una mezcla de procesos: no hay UNA receta a la que avanzar.
  if (cobertura.vigente === null) return null;
  const vigente = cobertura.vigente;
  const recipeVersionId = vigente.processRecipeVersionId;
  // Un proceso de antes de la receta obligatoria (R9) no tiene pasos.
  if (recipeVersionId === null) return { recipeVersionId: null, pasos: [], siguiente: null };

  const filas = await tx.processRecipeStep.findMany({ where: { recipeVersionId }, orderBy: { seq: "asc" }, select: { id: true, seq: true, stepTypeValueId: true, opcional: true } });
  const valores = await tx.variableCatalogValue.findMany({ where: { id: { in: [...new Set(filas.map((f) => f.stepTypeValueId))] } }, select: { id: true, value: true } });
  const valorDe = new Map(valores.map((v) => [v.id, v.value]));

  const hilo = hiloDelVigente(vigente, cobertura.cadena).map((p) => p.id);
  const pasoIds = filas.map((f) => f.id);
  // Una lectura por tabla, por los ids de los procesos del hilo y en serie, como el resolvedor. Ninguna lee `lotProcess`.
  const corridas = await tx.fermentationRun.findMany({ where: { lotProcessId: { in: hilo }, recipeStepId: { in: pasoIds } }, select: { id: true, startedAt: true, recipeStepId: true } });
  const secados = await tx.dryingRun.findMany({ where: { lotProcessId: { in: hilo }, recipeStepId: { in: pasoIds } }, select: { id: true, startedAt: true, recipeStepId: true } });
  const intervenciones = await tx.lotProcessIntervention.findMany({ where: { lotProcessId: { in: hilo }, recipeStepId: { in: pasoIds } }, select: { id: true, occurredAt: true, recipeStepId: true } });
  const manejos = await tx.fermentationIntervention.findMany({ where: { fermentationRun: { lotProcessId: { in: hilo } }, recipeStepId: { in: pasoIds } }, select: { id: true, occurredAt: true, recipeStepId: true } });

  const porPaso = new Map<string, { tabla: RegistroDePaso; id: string; inicio: Date }[]>(pasoIds.map((id) => [id, []]));
  const anotar = (tabla: RegistroDePaso, id: string, inicio: Date, recipeStepId: string | null) => {
    if (recipeStepId !== null) porPaso.get(recipeStepId)?.push({ tabla, id, inicio });
  };
  for (const r of corridas) anotar("fermentationRun", r.id, r.startedAt, r.recipeStepId);
  for (const r of secados) anotar("dryingRun", r.id, r.startedAt, r.recipeStepId);
  for (const r of intervenciones) anotar("lotProcessIntervention", r.id, r.occurredAt, r.recipeStepId);
  for (const r of manejos) anotar("fermentationIntervention", r.id, r.occurredAt, r.recipeStepId);

  const pasos: PasoConAvance[] = filas.map((f) => ({
    stepId: f.id,
    seq: f.seq,
    tipo: comoTipo(valorDe.get(f.stepTypeValueId) ?? ""),
    opcional: f.opcional,
    registros: (porPaso.get(f.id) ?? []).sort(porInicio),
  }));
  const cumplidos = pasos.filter((p) => p.registros.length > 0).map((p) => p.seq);
  const ultimoSeq = cumplidos.length === 0 ? null : Math.max(...cumplidos);
  const siguiente = pasos.find((p) => (ultimoSeq === null || p.seq > ultimoSeq) && CUMPLIBLES.has(p.tipo)) ?? null;
  return { recipeVersionId, pasos, siguiente };
}
