/**
 * La receta Libre — Parte 2a, tarea 10 (diseño §5.2, 2026-10-03).
 *
 * «Puedo escoger un proceso o inventar un proceso, pero debo mantenerlo dentro de su receta; no se improvisa constante: se define y
 * se ejecuta» (Daniel, 2026-10-03). Abrir con «Libre» es escribir una receta pequeña EN ESE MOMENTO: la intención (la `intent` del
 * proceso), los pasos planeados y el grado. Con eso se crea una receta marcada `esLibre`, PUBLICADA y propia de la organización del
 * lote, y el proceso se abre con ella: desde ahí todo funciona como con cualquier receta, y lo que se salga de los pasos es
 * desviación (§4.4).
 *
 * **La crea `abrirProceso` dentro de SU transacción**, después de bloquear el linaje: una Libre que sobreviviera a una apertura
 * fallida sería una receta huérfana que ningún selector ofrece. Este módulo no abre transacciones: recibe la del que llama.
 *
 * **No exige la autoría de recetas** (§5.2; decisión de Daniel V13, 2026-10-04): abrir un proceso, también con una Libre, es
 * `lot:manage` sobre el lote, que `abrirProceso` ya pidió con `loteGestionable`. La autoría de recetas es otra cosa y de otra
 * persona (el Coffee Process Manager, V16; `./autoria`), y aquí no se llama. `crearRecetaLibreEnTx` no autoriza por su cuenta, y por eso
 * tiene UN solo llamador, `abrirProceso`, que fija `tests/arquitectura/pasos-planeados-un-solo-camino.test.ts`; la pregunta del parecido
 * (`parecidoDeLaLibre`) sí pide gestionar el lote, porque lee las recetas de la organización de ese lote.
 *
 * **El control de parecido.** Antes de crearla, compara la secuencia planeada con las recetas PUBLICADAS que la organización puede
 * usar. Si coincide con una, hay que usar esa receta o decir POR QUÉ la Libre es distinta (`motivoDeLibre`, obligatorio en ese
 * caso); la comparación y su resultado se guardan (`parecidaAVersionId`, `motivoDeLibre`). Qué hace a dos secuencias «la misma» se
 * decide en `./parecido`, puro. Aquí se decide CON QUÉ se compara:
 * - la versión PUBLICADA más nueva de cada receta (la que ofrece el selector, `listRecipeVersionsForLot`): una versión superada no
 *   cuenta, ni un borrador;
 * - recetas no archivadas, de la organización del lote o sin organización (las plantillas);
 * - **no Libres**: una Libre anterior no se puede «usar», porque el selector no la ofrece (registro del plan, 2026-10-03);
 * - **no `listRecipes`**, que es la lista del editor (borradores y archivadas incluidas) y filtra por quién mira, no por la organización del
 *   lote que se abre (reconocimiento u6, S7).
 *
 * **Una Libre no trae umbrales ni perfil de respaldo del grado** (decisión de Daniel, auditoría del café PE-77/78, 2026-10-05 a 08): lo
 * que no declara sus pasos, ese motor no lo opina. El grado del proceso es un dato del proceso (`processGradeValueId`); aquí no se lee.
 */
import { prisma } from "../db";
import type { ClassificationLevel, Prisma } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { LotProcessError } from "../traceability/errorDeProceso";
import { requireLotAccess } from "../traceability/lots";
import { RecipeError } from "./errorDeReceta";
import { huellaDeLaSecuencia, nombreDeLaLibre, type PasoParaComparar } from "./parecido";
import { escribirPasosPlaneados, type PasoEditable, type PasoPlaneado } from "./pasos";

type Tx = Prisma.TransactionClient;

/**
 * Lo que `abrirProceso` recibe para abrir con una Libre. La intención es `AbrirProcesoInput.intent` y el grado,
 * `processGradeValueId`: no se repiten aquí.
 */
export interface LibreAlAbrir {
  /** Los pasos planeados, en orden: tipo de paso y lo esencial de sus ejes. Al menos uno. */
  pasos: readonly PasoEditable[];
  /** Por qué es distinta, si sus pasos coinciden con los de una receta publicada. Se descarta si no coinciden. */
  motivoDeLibre?: string | null;
}

/** Con qué receta publicada coincidió una secuencia: lo que la pantalla enseña («estos pasos son la receta Lavado»). */
export interface ParecidoDeLibre {
  recipeId: string;
  recipeVersionId: string;
  version: number;
  nombre: string;
  /** Falso si es una plantilla (sin organización). */
  deLaOrganizacion: boolean;
}

/**
 * La receta publicada con la que coincide `pasos`, o nulo. Si coincide con varias, la de la organización antes que una plantilla,
 * y entre iguales, por nombre: el resultado no depende del orden en que la base las devuelva. Su primer parámetro se llama `tx`
 * aunque a veces reciba el cliente global (sólo lee): es el nombre que el inventario de acceso reconoce.
 */
async function buscarParecida(tx: Tx, organizationId: string, pasos: readonly PasoParaComparar[]): Promise<ParecidoDeLibre | null> {
  if (pasos.length === 0) return null;
  const versiones = await tx.processRecipeVersion.findMany({
    where: {
      status: "approved",
      recipe: { status: { not: "archived" }, esLibre: false, OR: [{ organizationId }, { organizationId: null }] },
    },
    orderBy: { version: "desc" },
    select: { id: true, version: true, recipeId: true, recipe: { select: { name: true, organizationId: true } } },
  });
  // La versión PUBLICADA más nueva de cada receta: vienen de la más nueva a la más vieja.
  const masNueva = new Map<string, (typeof versiones)[number]>();
  for (const v of versiones) {
    if (!masNueva.has(v.recipeId)) masNueva.set(v.recipeId, v);
  }
  const candidatas = [...masNueva.values()];
  if (candidatas.length === 0) return null;

  const filas = await tx.processRecipeStep.findMany({
    where: { recipeVersionId: { in: candidatas.map((v) => v.id) } },
    orderBy: [{ recipeVersionId: "asc" }, { seq: "asc" }],
  });
  const adiciones = await tx.processRecipeStepAddition.findMany({
    where: { stepId: { in: filas.map((f) => f.id) } },
    select: { stepId: true, categoriaValueId: true, momento: true },
  });
  const pasosDe = new Map<string, PasoParaComparar[]>();
  for (const f of filas) {
    const paso: PasoParaComparar = {
      stepTypeValueId: f.stepTypeValueId,
      estadoFrutoValueId: f.estadoFrutoValueId,
      mucilagoObjetivo: f.mucilagoObjetivo,
      oxigenoValueId: f.oxigenoValueId,
      temperaturaValueId: f.temperaturaValueId,
      temperaturaMinC: f.temperaturaMinC?.toNumber() ?? null,
      temperaturaMaxC: f.temperaturaMaxC?.toNumber() ?? null,
      fuenteMicrobianaValueId: f.fuenteMicrobianaValueId,
      medioValueId: f.medioValueId,
      fisicoValueId: f.fisicoValueId,
      modoSecado: f.modoSecado,
      adiciones: adiciones.filter((a) => a.stepId === f.id),
    };
    pasosDe.set(f.recipeVersionId, [...(pasosDe.get(f.recipeVersionId) ?? []), paso]);
  }

  const buscada = huellaDeLaSecuencia(pasos);
  const parecidas = candidatas
    .filter((v) => huellaDeLaSecuencia(pasosDe.get(v.id) ?? []) === buscada)
    .sort(
      (a, b) =>
        Number(a.recipe.organizationId === null) - Number(b.recipe.organizationId === null) ||
        a.recipe.name.localeCompare(b.recipe.name, "es"),
    );
  const v = parecidas[0];
  if (!v) return null;
  return {
    recipeId: v.recipeId,
    recipeVersionId: v.id,
    version: v.version,
    nombre: v.recipe.name,
    deLaOrganizacion: v.recipe.organizationId !== null,
  };
}

/**
 * La pregunta que la pantalla de abrir hace ANTES de enviar: «¿estos pasos ya son una receta publicada?». El error
 * `libre_parecida` no puede decir CUÁL (un código no lleva datos), y la pantalla tiene que decir «estos pasos son la receta
 * Lavado». Pide `lot:manage` sobre el lote —el mismo permiso que abrir el proceso— y no escribe nada. Es una ayuda: la decisión
 * de verdad la toma `crearRecetaLibreEnTx` dentro de la transacción de abrir.
 *
 * **El acceso va antes que cualquier otra cosa** (Ruling INV): quien no gestiona el lote recibe el rechazo de acceso, nunca el nombre de
 * una receta de la organización de ese lote; sólo un lote que no existe se nombra (`lot_not_found`), como en cada operación del proceso.
 */
export async function parecidoDeLaLibre(
  userAccountId: string,
  input: { lotId: string; pasos: readonly PasoEditable[] },
): Promise<ParecidoDeLibre | null> {
  const lote = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lote) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [lote]);
  return buscarParecida(prisma, lote.organizationId, input.pasos);
}

/** Lo que `abrirProceso` entrega a `crearRecetaLibreEnTx`, ya validado. */
export interface DatosDeLaLibre {
  organizationId: string;
  lotCode: string;
  /** La clasificación del LOTE (R8): la receta nace con ella y no con la que el esquema da por omisión (`internal`). */
  classification: ClassificationLevel;
  startedAt: Date;
  /** La `intent` del proceso, recortada y no vacía. */
  intencion: string;
  planeados: readonly PasoPlaneado[];
  motivoDeLibre: string | null;
}

/**
 * Crea la receta Libre, DENTRO de la transacción de `abrirProceso` y con el linaje ya bloqueado: la receta (publicada, de la
 * organización, **con la clasificación del lote**), su versión 1, sus pasos y fases, y su evento de auditoría con el mismo `tx`. No
 * autoriza (ver la cabecera): su único llamador es `abrirProceso`, después de `loteGestionable`.
 *
 * **La clasificación del lote (R8, revisión del 2026-10-05).** `ProcessRecipe.classification` nace `internal`, y la intención que el
 * operario escribió es texto libre sobre ESE lote: sin copiarla, la Libre de un lote `confidential` o `trade_secret` quedaba más
 * abierta que su lote, legible por quien alcance la organización sin limpiar esa clasificación. Quién la lee después (`listRecipes`,
 * `getRecipeForEditor`) es de la tarea 14; aquí sólo se evita que nazca más abierta que su lote.
 *
 * Con coincidencia y sin motivo, `libre_parecida`. Con coincidencia y motivo, se guardan con cuál coincidió y el motivo recortado;
 * sin coincidencia, los dos nulos —un motivo que nadie pidió se descarta—, que es también lo que exigen los dos CHECK de la base.
 * Un nombre repetido (el mismo lote, la misma intención, el mismo día) no se comprueba aquí: lo rechaza la base con un `P2002` que
 * `abrirProceso` traduce a `libre_repetida` (`traducirP2002DeApertura`).
 */
export async function crearRecetaLibreEnTx(tx: Tx, userAccountId: string, datos: DatosDeLaLibre) {
  const parecida = await buscarParecida(tx, datos.organizationId, datos.planeados.map((p) => p.paso));
  const motivo = datos.motivoDeLibre?.trim() || null;
  if (parecida && !motivo) throw new RecipeError("libre_parecida");

  const receta = await tx.processRecipe.create({
    data: {
      name: nombreDeLaLibre({ intencion: datos.intencion, lotCode: datos.lotCode, fecha: datos.startedAt }),
      description: datos.intencion,
      organizationId: datos.organizationId,
      classification: datos.classification,
      status: "approved",
      esLibre: true,
      parecidaAVersionId: parecida ? parecida.recipeVersionId : null,
      motivoDeLibre: parecida ? motivo : null,
      createdBy: userAccountId,
      versions: { create: { version: 1, status: "approved", createdBy: userAccountId } },
    },
    include: { versions: { select: { id: true } } },
  });
  const recipeVersionId = receta.versions[0]!.id;
  const pasos = await escribirPasosPlaneados(tx, recipeVersionId, datos.planeados);

  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "process_recipe.create",
      entityType: "process_recipe",
      entityId: receta.id,
      after: { ...receta, pasos },
      reason: "libre",
      sourceInterface: "recetas.libre",
    },
    tx,
  );

  return { recipeId: receta.id, recipeVersionId };
}
