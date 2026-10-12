/**
 * El guardián de pasos: ¿cumple este registro del lote un paso de la receta de su proceso, o es una desviación? — Parte 2a,
 * diseño §4.2 y §4.4 (tarea 7, 2026-10-03). docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md
 *
 * **Quién lo llama.** Las puertas que escriben uno de los cuatro registros de §4.1, DENTRO de su transacción y con el linaje
 * ya bloqueado: `startFermentationRun` y `startDryingRun` (después de `procesoAbiertoParaCorrida`),
 * `recordFermentationIntervention` (después de `bloquearLinaje`) y, desde la tarea 8, `registrarIntervencion` del proceso.
 * Cada una le pasa la versión de receta del proceso que cubre al lote y si esa versión tiene pasos; él devuelve lo que la
 * puerta guarda: el paso, el tipo de paso y el motivo.
 *
 * **Con paso (§4.2) — bloquea, porque es trazabilidad y no un umbral (D6):**
 * - el paso es de la versión del proceso, o `paso_de_otra_receta` (también si el proceso no tiene receta, si el paso no existe o
 *   si lo que llega ni siquiera es un uuid);
 * - su tipo es uno de los que el registro cumple (`TIPOS_POR_REGISTRO`), o `paso_no_corresponde`;
 * - el tipo del registro SE TOMA DEL PASO. Declarar otro es una contradicción y no una opción: `paso_no_corresponde`, como la
 *   receta distinta de la del proceso en R4 (`receta_distinta_del_proceso`).
 *
 * **Sin paso (§4.4):** si la versión del proceso tiene pasos, es una DESVIACIÓN: exige motivo (`desviacion_sin_motivo`), queda
 * marcada y no bloquea nada más. Un tipo declarado tiene que ser del catálogo `tipo_paso` y de los que el registro cumple
 * (`paso_no_corresponde`): un valor de otro catálogo que se llame igual no vale.
 *
 * **No son desviación** un registro bajo una receta sin pasos ni uno bajo un proceso viejo sin receta (§5.1, transición R9).
 * Ahí, y con paso, un motivo que llegue NO SE GUARDA —decisión de la casa, no del diseño—: no hay desviación que explicar, y
 * un motivo guardado se leería como una. La trilla y los tuestes no pasan por aquí: no son registros de §4.1.
 *
 * **No autoriza, no escribe y no bloquea.** Recibe sólo la transacción de quien la llama (como el resto de la familia «reciben
 * transacción»), así que la autorización de lo que lee —un paso y un valor de catálogo— está en esas puertas, que piden gestionar el lote
 * ANTES de abrir la transacción: quien no puede gestionarlo recibe el rechazo de acceso y nunca llega aquí. Lo prueba
 * `tests/recetas/guardian.test.ts`, puerta por puerta, con su control.
 */
import type { Prisma } from "../../generated/prisma/client";
import { LotProcessError } from "../traceability/errorDeProceso";
import { TIPOS_POR_REGISTRO, type RegistroDePaso } from "./vocabulario";

/** Un id que no es un uuid no puede ser de ningún paso ni de ningún valor, y se dice igual que «no existe»: sin esto la base lo rechaza con un error propio y la acción lo deja escapar como un 500. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function exigePasoCoherente(
  tx: Prisma.TransactionClient,
  input: {
    registro: RegistroDePaso;
    recipeVersionIdDelProceso: string | null;
    recetaTienePasos: boolean;
    recipeStepId: string | null;
    stepTypeValueId: string | null;
    motivoDesviacion: string | null;
  },
): Promise<{ recipeStepId: string | null; stepTypeValueId: string | null; motivoDesviacion: string | null }> {
  const cumple: readonly string[] = TIPOS_POR_REGISTRO[input.registro];

  if (input.recipeStepId !== null) {
    if (!UUID.test(input.recipeStepId)) throw new LotProcessError("paso_de_otra_receta");
    const paso = await tx.processRecipeStep.findUnique({
      where: { id: input.recipeStepId },
      select: { id: true, recipeVersionId: true, stepTypeValueId: true },
    });
    if (!paso || paso.recipeVersionId !== input.recipeVersionIdDelProceso) throw new LotProcessError("paso_de_otra_receta");
    const tipo = await tx.variableCatalogValue.findUniqueOrThrow({ where: { id: paso.stepTypeValueId }, select: { value: true } });
    if (!cumple.includes(tipo.value)) throw new LotProcessError("paso_no_corresponde");
    if (input.stepTypeValueId !== null && input.stepTypeValueId.toLowerCase() !== paso.stepTypeValueId) {
      throw new LotProcessError("paso_no_corresponde");
    }
    return { recipeStepId: paso.id, stepTypeValueId: paso.stepTypeValueId, motivoDesviacion: null };
  }

  if (input.stepTypeValueId !== null) {
    if (!UUID.test(input.stepTypeValueId)) throw new LotProcessError("paso_no_corresponde");
    const declarado = await tx.variableCatalogValue.findUnique({
      where: { id: input.stepTypeValueId },
      select: { value: true, catalog: { select: { key: true } } },
    });
    if (!declarado || declarado.catalog.key !== "tipo_paso" || !cumple.includes(declarado.value)) {
      throw new LotProcessError("paso_no_corresponde");
    }
  }
  const esDesviacion = input.recipeVersionIdDelProceso !== null && input.recetaTienePasos;
  const motivo = input.motivoDesviacion?.trim() || null;
  if (esDesviacion && motivo === null) throw new LotProcessError("desviacion_sin_motivo");
  return { recipeStepId: null, stepTypeValueId: input.stepTypeValueId, motivoDesviacion: esDesviacion ? motivo : null };
}
