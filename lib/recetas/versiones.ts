/**
 * Versiones y plantillas de una receta con pasos — Parte 2a, tarea 4 (diseño §3.3 y §3.4, 2026-10-03).
 *
 * **Una receta publicada no se edita: se supersede con una versión nueva** (CLAUDE.md §3, ADR-102). Desde la 2a esa
 * versión nace en BORRADOR (§3.3) y trae lo que la anterior declaraba —pasos con sus ejes, adiciones, fines y
 * requisitos, metas de versión y de paso— con ids nuevos y **cada meta de paso apuntando al paso NUEVO**. Una meta que
 * siguiera apuntando al paso de la versión anterior sería una meta de otra versión, que la FK compuesta de
 * `process_target` (tarea 1) rechaza: la copia remapea para no llegar ahí.
 *
 * **Las fases viajan sólo si la versión no tiene pasos** (§3.1: «la copia de R8 deja de copiar fases cuando la versión
 * tiene pasos»). Con pasos, las fases son una derivación que escribe `publicarVersion` (tarea 3) para los lectores
 * antiguos, y una copia vieja en el borrador podría contradecir a los pasos editados. Sin pasos —una receta de antes de
 * la 2a— las fases son lo único que dice horas, volteo y banda de humedad, y se copian como hacía R8.
 *
 * **Plantillas (§3.4).** Una receta sin organización es de todas y sólo la versiona quien tiene el permiso del Coffee Process
 * Manager con alcance de plataforma (registro: «las plantillas sólo se editan con alcance de plataforma»; V16). Una organización
 * que quiere cambiarla deriva su copia: una receta suya, en borrador, con `derivadaDeVersionId` diciendo de dónde salió.
 *
 * **Quién escribe (V16, Ruling A, 2026-10-04): `exigeAutoriaDeReceta`** (`./autoria`, tarea 3), la ÚNICA regla. Esta tarea tuvo la
 * suya, que pedía `edit_beneficio` y `lot:manage` sobre un lote; se borró cuando la autoría pasó al permiso nuevo, que no pide
 * ningún lote.
 *
 * **Una receta Libre no se versiona** (I14, §5.2–§5.3): es lo que ocurrió en un proceso, escrito antes de ejecutarse, y se
 * CONVIERTE en una receta de la organización (tarea 11); una v2 suya sería una receta editable que nadie nombró.
 */
import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { exigeAutoriaDeReceta } from "./autoria";
import { RecipeError } from "./errorDeReceta";

/**
 * La versión siguiente de una receta, en BORRADOR, copiada de `desdeVersionId` (§3.3). Lo que se edita después son sus
 * pasos (tarea 3), y `publicarVersion` la fija. Se copia la versión que se elige, no necesariamente la última; el número
 * es siempre el siguiente al más alto («max + 1»: distinto de «cuántas hay», que repetiría un número que una corrida ya cita).
 *
 * **A lo sumo un borrador por receta** (`ya_hay_un_borrador`). Dos borradores de la misma receta divergirían, y publicar
 * el segundo borraría en silencio lo que cambió el primero. Pedirlo desde un borrador también se rechaza: ese borrador ES
 * el de la receta, y se sigue editando. Se decide con la fila de la receta bloqueada (`FOR UPDATE`), igual que el número:
 * dos peticiones a la vez —un doble toque— se ponen en fila y la segunda ve el borrador de la primera, en vez de chocar
 * con `@@unique([recipeId, version])` como un P2002 que nadie puede leer (reconocimiento u1, S7).
 *
 * **No se versiona una receta Libre** (`receta_libre_no_se_versiona`, I14): se convierte en una receta de la organización (tarea 11).
 */
export async function nuevaVersionBorrador(userAccountId: string, desdeVersionId: string): Promise<{ id: string; version: number }> {
  const desde = await prisma.processRecipeVersion.findUnique({ where: { id: desdeVersionId }, include: { recipe: true } });
  if (!desde) throw new RecipeError("version_no_encontrada");
  await exigeAutoriaDeReceta(userAccountId, desde.recipe.organizationId);
  // I14: una Libre se convierte, no se versiona. Después de la autoría: quien no puede escribir recetas no se entera de cuáles son Libres.
  if (desde.recipe.esLibre) throw new RecipeError("receta_libre_no_se_versiona");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM traceability.process_recipe WHERE id = ${desde.recipeId}::uuid FOR UPDATE`;
    const borradores = await tx.processRecipeVersion.count({ where: { recipeId: desde.recipeId, status: "draft" } });
    if (borradores > 0) throw new RecipeError("ya_hay_un_borrador");
    const masAlta = await tx.processRecipeVersion.aggregate({ where: { recipeId: desde.recipeId }, _max: { version: true } });

    const version = await tx.processRecipeVersion.create({
      data: {
        recipeId: desde.recipeId,
        version: (masAlta._max.version ?? 0) + 1,
        status: "draft",
        expectedHours: desde.expectedHours,
        createdBy: userAccountId,
      },
    });
    const copia = await copiarContenidoDeVersion(tx, desde.id, version.id, { metasDeVersion: true, fases: true });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe_version.create",
        entityType: "process_recipe_version",
        entityId: version.id,
        after: { ...version, copia },
        // Lo que se busca después en la auditoría: de qué versión salió este borrador.
        reason: `borrador_desde_version_${desde.version}`,
        sourceInterface: "recetas.versiones",
      },
      tx,
    );

    return { id: version.id, version: version.version };
  });
}

/**
 * Una copia propia de una plantilla (§3.4): receta NUEVA de `organizationId`, con su v1 en borrador, lo que la plantilla
 * declaraba copiado, y `derivadaDeVersionId` apuntando a la versión de la que salió. La plantilla no se toca.
 *
 * Sólo de una plantilla (`no_es_plantilla`: una receta con organización se cambia con una versión nueva, no se deriva)
 * y sólo de una versión publicada (`version_no_publicada`: un borrador de plantilla es alguien decidiendo todavía qué
 * dice). Pide lo mismo que crear una receta en esa organización, y lo pide ANTES de leer la plantilla. El nombre es único
 * en la organización: uno repetido sale como `nombre_repetido`, no como un P2002.
 */
export async function derivarReceta(
  userAccountId: string,
  input: { plantillaVersionId: string; organizationId: string; nombre: string },
): Promise<{ recipeId: string; versionId: string }> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new RecipeError("nombre_requerido");
  await exigeAutoriaDeReceta(userAccountId, input.organizationId);

  const plantilla = await prisma.processRecipeVersion.findUnique({
    where: { id: input.plantillaVersionId },
    include: { recipe: true },
  });
  if (!plantilla) throw new RecipeError("version_no_encontrada");
  if (plantilla.recipe.organizationId !== null) throw new RecipeError("no_es_plantilla");
  if (plantilla.status !== "approved") throw new RecipeError("version_no_publicada");

  return prisma.$transaction(async (tx) => {
    const receta = await tx.processRecipe
      .create({
        data: {
          name: nombre,
          description: plantilla.recipe.description,
          organizationId: input.organizationId,
          // El estado que manda es el de la VERSIÓN (§3.3). La receta, como contenedor, nace «activa» como todas
          // (`crearRecetaEnBorrador`): de su estado sólo se lee `archived`.
          status: "approved",
          derivadaDeVersionId: plantilla.id,
          createdBy: userAccountId,
        },
      })
      .catch((error: unknown) => {
        // Atado al `create`: aquí un P2002 sólo puede ser `@@unique([organizationId, name])`.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new RecipeError("nombre_repetido");
        }
        throw error;
      });
    const version = await tx.processRecipeVersion.create({
      data: { recipeId: receta.id, version: 1, status: "draft", expectedHours: plantilla.expectedHours, createdBy: userAccountId },
    });
    const copia = await copiarContenidoDeVersion(tx, plantilla.id, version.id, { metasDeVersion: true, fases: true });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe.create",
        entityType: "process_recipe",
        entityId: receta.id,
        after: { ...receta, versionId: version.id, copia },
        reason: `derivada_de_version_${plantilla.id}`,
        sourceInterface: "recetas.versiones",
      },
      tx,
    );

    return { recipeId: receta.id, versionId: version.id };
  });
}

/**
 * Una receta NUEVA, con su versión 1 en BORRADOR y sin pasos ni metas: lo que el editor (`/recipes/new`) crea y donde después se
 * escriben los pasos (`agregarPaso`). Parte 2a, tarea 14 (2026-10-03).
 *
 * La puerta de recetas que había en `processTargets.ts` no servía para esto: exigía al menos una meta con su fase (`validateTargets`), porque nació cuando la
 * receta SE DECLARABA con metas. Una receta con pasos declara sus números en cada paso, y hacerle teclear una meta de versión a
 * quien sólo quiere ponerle nombre la dejaría con una meta que ningún paso posee. La receta nace «activa» como las de siempre
 * (de su estado sólo se lee `archived`); lo que nace borrador es su versión, y hasta que `publicarVersion` la fije el selector de
 * abrir un proceso no la ofrece.
 *
 * **Quién escribe (V16, Ruling A): `exigeAutoriaDeReceta`**, la ÚNICA regla —el permiso del Coffee Process Manager en la organización, o con
 * alcance de plataforma si es una plantilla—, como `nuevaVersionBorrador` y `derivarReceta`. `edit_beneficio` ya no basta, y ya no se pide
 * ningún lote. Un nombre repetido en la organización sale como `nombre_repetido`, no como un P2002 ilegible.
 */
export async function crearRecetaEnBorrador(
  userAccountId: string,
  input: { name: string; description?: string | null; organizationId: string | null },
): Promise<{ recipeId: string; versionId: string }> {
  const nombre = input.name.trim();
  if (!nombre) throw new RecipeError("nombre_requerido");
  await exigeAutoriaDeReceta(userAccountId, input.organizationId);

  return prisma.$transaction(async (tx) => {
    const receta = await tx.processRecipe
      .create({
        data: {
          name: nombre,
          description: input.description?.trim() || null,
          organizationId: input.organizationId,
          status: "approved",
          createdBy: userAccountId,
        },
      })
      .catch((error: unknown) => {
        // Atado al `create`: aquí un P2002 sólo puede ser `@@unique([organizationId, name])`.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new RecipeError("nombre_repetido");
        }
        throw error;
      });
    const version = await tx.processRecipeVersion.create({
      data: { recipeId: receta.id, version: 1, status: "draft", createdBy: userAccountId },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe.create",
        entityType: "process_recipe",
        entityId: receta.id,
        after: { ...receta, versionId: version.id },
        reason: "receta_en_borrador",
        sourceInterface: "recetas.versiones",
      },
      tx,
    );

    return { recipeId: receta.id, versionId: version.id };
  });
}

/**
 * La fila sin las claves que se nombran; lo demás, entero. El porqué, en la cabecera de la copia que sigue.
 */
function sinClaves<T extends object, K extends keyof T>(fila: T, claves: readonly K[]): Omit<T, K> {
  const copia = { ...fila } as unknown as Record<PropertyKey, unknown>;
  for (const clave of claves) delete copia[clave];
  return copia as unknown as Omit<T, K>;
}

/**
 * Copia lo que cuelga de una versión a otra recién creada, dentro de la transacción de quien la llama. No autoriza ni
 * recibe principal: la llaman `nuevaVersionBorrador` y `derivarReceta` (arriba) y, desde el PR-B, la conversión de una Libre (tarea 11), las tres
 * después de autorizar la receta (inventario: «depende del llamador»).
 *
 * - **Pasos**, siempre, con todas sus columnas: la fila se copia ENTERA salvo sus claves, para que una columna que se
 *   añada mañana viaje sin que nadie tenga que acordarse de nombrarla aquí (la lección de `campos-con-dos-puertas`: un
 *   campo que se cierra en una puerta y no en otra se pierde en silencio).
 * - **Adiciones, fines y requisitos** de cada paso, colgados del paso NUEVO.
 * - **Metas de paso**, con el paso remapeado al nuevo; **metas de versión** (sin paso) sólo si `que.metasDeVersion`.
 * - **Fases**, sólo si `que.fases` y el origen no tiene pasos (§3.1).
 *
 * No valida: lo copiado ya se validó al escribirse en el origen. Devuelve cuántas filas copió de cada clase, para la
 * auditoría de quien llama.
 */
export async function copiarContenidoDeVersion(
  tx: Prisma.TransactionClient,
  desdeVersionId: string,
  haciaVersionId: string,
  que: { metasDeVersion: boolean; fases: boolean },
) {
  const pasos = await tx.processRecipeStep.findMany({ where: { recipeVersionId: desdeVersionId }, orderBy: { seq: "asc" } });
  const pasoNuevo = new Map<string, string>();
  for (const paso of pasos) {
    const nuevo = await tx.processRecipeStep.create({
      data: { ...sinClaves(paso, ["id", "recipeVersionId"]), recipeVersionId: haciaVersionId },
      select: { id: true },
    });
    pasoNuevo.set(paso.id, nuevo.id);
  }
  const remapear = (stepId: string): string => {
    const nuevo = pasoNuevo.get(stepId);
    // No puede faltar: la FK compuesta de la meta y las FK de las filas hijas atan cada una a un paso de ESTA versión, y
    // los pasos de esta versión están todos en el mapa. Si faltara, seguir colgaría la fila de otro paso —o haría de una
    // meta de paso una meta de versión— sin que nada lo dijera.
    if (nuevo === undefined) throw new Error(`copiarContenidoDeVersion: el paso ${stepId} no es de la versión ${desdeVersionId}`);
    return nuevo;
  };
  const viejos = pasos.map((p) => p.id);

  const adiciones = await tx.processRecipeStepAddition.findMany({ where: { stepId: { in: viejos } } });
  if (adiciones.length > 0) {
    await tx.processRecipeStepAddition.createMany({
      data: adiciones.map((a) => ({ ...sinClaves(a, ["id", "stepId"]), stepId: remapear(a.stepId) })),
    });
  }
  const fines = await tx.processRecipeStepEnd.findMany({ where: { stepId: { in: viejos } } });
  if (fines.length > 0) {
    await tx.processRecipeStepEnd.createMany({
      data: fines.map((f) => ({ ...sinClaves(f, ["id", "stepId"]), stepId: remapear(f.stepId) })),
    });
  }
  const requisitos = await tx.processRecipeStepRequirement.findMany({ where: { stepId: { in: viejos } } });
  if (requisitos.length > 0) {
    await tx.processRecipeStepRequirement.createMany({
      data: requisitos.map((r) => ({ ...sinClaves(r, ["stepId"]), stepId: remapear(r.stepId) })),
    });
  }

  const metas = await tx.processTarget.findMany({
    where: { recipeVersionId: desdeVersionId, ...(que.metasDeVersion ? {} : { recipeStepId: { not: null } }) },
    orderBy: { displayOrder: "asc" },
  });
  if (metas.length > 0) {
    await tx.processTarget.createMany({
      data: metas.map((m) => ({
        ...sinClaves(m, ["id", "recipeVersionId", "recipeStepId"]),
        recipeVersionId: haciaVersionId,
        recipeStepId: m.recipeStepId === null ? null : remapear(m.recipeStepId),
      })),
    });
  }

  const fases =
    que.fases && pasos.length === 0 ? await tx.processRecipePhase.findMany({ where: { recipeVersionId: desdeVersionId } }) : null;
  if (fases && fases.length > 0) {
    await tx.processRecipePhase.createMany({
      data: fases.map((f) => ({ ...sinClaves(f, ["id", "recipeVersionId", "createdAt"]), recipeVersionId: haciaVersionId })),
    });
  }

  return {
    pasos: pasos.length,
    adiciones: adiciones.length,
    fines: fines.length,
    requisitos: requisitos.length,
    metasDePaso: metas.filter((m) => m.recipeStepId !== null).length,
    metasDeVersion: metas.filter((m) => m.recipeStepId === null).length,
    fases: fases?.length ?? 0,
  };
}
