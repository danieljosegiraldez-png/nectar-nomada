/**
 * Convertir una receta Libre en receta de la organización — Parte 2a, tarea 11 (diseño §5.3, 2026-10-03).
 * docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md
 *
 * **Qué hace.** Una Libre es lo que alguien definió antes de ejecutar (§5.2); cuando su proceso termina por humedad se OFRECE
 * guardarla como receta de la organización. `convertirLibre` crea una receta NUEVA —el nombre lo da quien la guarda— con su v1 en
 * BORRADOR y los pasos de la Libre copiados con ids nuevos (`copiarContenidoDeVersion`, tarea 4); ahí se edita lo que la ejecución
 * enseñó y se publica (tarea 3). El proceso **conserva su Libre** —es lo que ocurrió— y gana `origenDeRecetaVersionId`, que cuenta
 * como uso de la receta nueva (la Parte 5 lo agrupa con sus lotes, marcado como origen).
 *
 * **Los fines se proponen SÓLO desde lecturas MARCADAS** (`./lecturasDeCierre`): cada lectura que alguien marcó al cerrar una corrida
 * o un manejo unido a un paso de la Libre se vuelve una condición de fin de ESE paso, con su variable, su unidad y su valor, y con
 * `desdeLecturaId` diciendo de dónde salió. Una lectura que nadie marcó nunca produce un fin, tenga el valor que tenga: es la regla
 * del §5.3 y lo que prueba `tests/recetas/convertir.test.ts`.
 *
 * **Se usa la lectura VIGENTE de cada marca (R4).** Una marca apunta a la lectura que se marcó, y esa lectura se pudo corregir
 * DESPUÉS: la marca no cambia (es lo que quien cerró citó), pero el fin sale de la corrección —su valor, su unidad, su fecha y su
 * id—, no de lo que se tecleó mal (`vigenteDe`, el mismo recorrido con el que se decide qué se puede marcar). Dos marcas que llevan
 * a la misma vigente son una sola condición. El editor de recetas (tarea 3, R23) acepta esa id aunque no esté marcada: una corrección
 * cuya raíz lo está sirve de origen de un fin.
 *
 * **La receta nueva hereda la clasificación de la Libre (R24).** La intención cruda del proceso —que puede ser confidencial o secreto
 * de oficio— viaja en la `description` de la receta nueva, así que nace con la clasificación de la Libre (que a su vez heredó la de su
 * lote, tarea 10, R8) y no con la de por omisión: de otro modo una intención confidencial quedaría en una receta `internal`, a la vista
 * de quien no alcanza lo confidencial.
 *
 * **La dirección** (`gte` o `lte`) no está en una lectura, y la condición de fin la exige. Se MIDE de la serie de la propia corrida:
 * si la variable BAJÓ entre la primera lectura de esa corrida y la marcada, el paso termina al llegar a ese valor o por debajo
 * (`lte`); si SUBIÓ, a ese o por encima (`gte`). **La serie es la de las lecturas VIGENTES** (`lecturasCandidatasDeCierre`): una
 * lectura corregida cuenta por su corrección, no por el valor que se tecleó mal. Un manejo no tiene serie propia, y una corrida con una
 * sola lectura de esa variable —o con una igual a la primera— tampoco da dirección: ahí NO se propone fin, y la lectura se devuelve en
 * `sinDireccion` para completarla a mano en el borrador. Es una inferencia de la casa, no del diseño ni del paquete (esqueleto,
 * regla 13).
 *
 * **Lo ejecutado bajo ESA Libre es el HILO del proceso que se convierte (R3)**: los registros unidos a uno de sus pasos que
 * pertenecen a ese proceso o a los de los que deriva por división o devolución (`derivedFromLotProcessId`, el mismo hilo que el
 * avance de la receta). Cada parte de una división copia la versión del padre, así que buscar «todo lo unido a un paso de esta
 * versión» traía a la receta de B las marcas de su hermana C: dos fines distintos para el mismo paso, y las lecturas de otro café.
 * Lo del antecesor SÍ entra —«lo hecho vive en el proceso que se dividió»— y lo de un reproceso no (nace sin derivación).
 *
 * **Quién.** **La autoría de recetas de su organización** —el permiso del Coffee Process Manager (V16, Ruling A; `./autoria`), la
 * misma regla que publicar— **y poder VER el lote del proceso** (`view`, no `manage`: adjudicación C8). Convertir es un acto de
 * autoría que lee el proceso y deja en él un vínculo; no es trabajo de campo, así que no pide gestionar el lote. `edit_beneficio` ya
 * no basta: el Farm Manager no convierte, ni un Farm Operator con `lot:manage` y sin el perfil. Quien escribe recetas pero no ve el
 * lote tampoco (el perfil del Coffee Process Manager no lleva `lot:view`): convierte quien lleva además un perfil que lo deje ver
 * —Project Viewer, Farm Operator…—. **Y ver también el lote de cada registro que aporta (R3)**: los valores que acaban en la receta
 * son de lecturas de esos lotes, y el hilo puede pasar por otra parcela. La oferta se pregunta con `puedeConvertirLibre`, que dice lo
 * mismo que el servicio, con las mismas funciones.
 *
 * **Concurrencia.** El linaje primero, como `cerrarProceso`: se bloquea y DESPUÉS se relee el proceso, así que una conversión que
 * ganó la espera se ve y ésta se rechaza `ya_convertida` sin crear nada. La autorización de lo que aporta el hilo va DENTRO de esa
 * transacción, como la de las lecturas de cierre, y por lo mismo: ver `exigeVerLosLotes`.
 */
import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { requireLotAccess, TraceabilityAccessError } from "../traceability/lots";
import { bloquearLinaje, TRANSACCION_DEL_LINAJE } from "../traceability/procesoDelLinaje";
import { exigeAutoriaDeReceta, puedeAutoriaDeReceta } from "./autoria";
import { RecipeError } from "./errorDeReceta";
import { exigeVerLosLotes, lecturasCandidatasDeCierre, vigenteDe, type LecturaDeCadena } from "./lecturasDeCierre";
import { copiarContenidoDeVersion } from "./versiones";

type Tx = Prisma.TransactionClient;

/** Lo que `convertirLibre` devuelve: la receta nueva, cuánto copió y qué lecturas marcadas quedaron sin fin. */
export interface ResultadoDeConvertir {
  recipeId: string;
  /** La v1 de la receta nueva, en borrador. */
  versionId: string;
  /** Cuántos pasos copió. */
  pasos: number;
  /** Cuántas condiciones de fin salieron de lecturas marcadas. */
  finesPropuestos: number;
  /**
   * Lecturas marcadas que NO se volvieron fin porque no hay de dónde medir la dirección (un manejo, o una corrida con una sola
   * lectura de esa variable). `stepId` es el paso NUEVO y `measurementId` la lectura VIGENTE. La pantalla las enseña para
   * completarlas a mano en el borrador.
   */
  sinDireccion: readonly { stepId: string; measurementId: string }[];
}

/** Lo que se lee de un proceso para decidir si su Libre se convierte. */
interface ProcesoLeido {
  id: string;
  lotId: string;
  endedAt: Date | null;
  closureKind: "moisture" | "divided" | null;
  origenDeRecetaVersionId: string | null;
  /** La versión de su receta SI esa receta es una Libre; nula si no lo es, o si el proceso no tiene receta. */
  libreVersionId: string | null;
}

async function leerProceso(tx: Tx, lotProcessId: string): Promise<ProcesoLeido | null> {
  const proceso = await tx.lotProcess.findUnique({
    where: { id: lotProcessId },
    select: { id: true, lotId: true, endedAt: true, closureKind: true, processRecipeVersionId: true, origenDeRecetaVersionId: true },
  });
  if (!proceso) return null;
  const version =
    proceso.processRecipeVersionId === null
      ? null
      : await tx.processRecipeVersion.findUnique({
          where: { id: proceso.processRecipeVersionId },
          select: { recipe: { select: { esLibre: true } } },
        });
  return {
    id: proceso.id,
    lotId: proceso.lotId,
    endedAt: proceso.endedAt,
    closureKind: proceso.closureKind,
    origenDeRecetaVersionId: proceso.origenDeRecetaVersionId,
    libreVersionId: version?.recipe.esLibre === true ? proceso.processRecipeVersionId : null,
  };
}

/** Por qué un proceso no se convierte, en el orden en que se comprueba; o la versión de su Libre si sí. */
function evaluar(
  p: ProcesoLeido,
): { motivo: "proceso_sin_cerrar_por_humedad" | "no_es_libre" | "ya_convertida" } | { libreVersionId: string } {
  // §5.3: se ofrece «al cerrar por humedad». Un proceso abierto, o cerrado por una división, no.
  if (p.endedAt === null || p.closureKind !== "moisture") return { motivo: "proceso_sin_cerrar_por_humedad" };
  if (p.libreVersionId === null) return { motivo: "no_es_libre" };
  if (p.origenDeRecetaVersionId !== null) return { motivo: "ya_convertida" };
  return { libreVersionId: p.libreVersionId };
}

/**
 * El hilo de un proceso (R3): él y los procesos de los que deriva por división o devolución, de uno en uno por su id, hasta uno
 * que no deriva de nadie. Un reproceso del mismo lote con la misma receta nace sin derivación y no hereda lo de arriba. Devuelve
 * también el lote donde vive cada uno. Lee cada proceso por su id —uno ya conocido—, nunca «los de este lote»: lo que el proceso
 * de un lote es lo dice el resolvedor (`procesoDelLinaje.ts`), y esto sólo sigue una derivación escrita.
 */
async function hiloDelProceso(tx: Tx, lotProcessId: string) {
  const ids: string[] = [];
  const loteDe = new Map<string, string>();
  let actual: string | null = lotProcessId;
  while (actual !== null && !loteDe.has(actual)) {
    const fila: { lotId: string; derivedFromLotProcessId: string | null } | null = await tx.lotProcess.findUnique({
      where: { id: actual },
      select: { lotId: true, derivedFromLotProcessId: true },
    });
    if (fila === null) break;
    ids.push(actual);
    loteDe.set(actual, fila.lotId);
    actual = fila.derivedFromLotProcessId;
  }
  return { ids, loteDe };
}

/** Una marca de cierre de un registro unido a un paso de la Libre. */
interface MarcaDelHilo {
  measurementId: string;
  registro: "fermentationRun" | "dryingRun" | "lotProcessIntervention";
  registroId: string;
  /** El paso de la LIBRE al que está unido el registro. */
  pasoId: string;
}

/** Todo lo que el hilo aporta a una conversión, leído de una vez: lo que usan la oferta, la autorización y la propuesta de fines. */
interface Aporte {
  pasos: { id: string; seq: number }[];
  marcas: MarcaDelHilo[];
  /** La lectura VIGENTE de cada lectura marcada, por el id de la marcada. */
  vigentes: Map<string, LecturaDeCadena>;
  /** Los lotes de lo que aporta: el de cada lectura vigente y el del proceso de cada manejo con marcas. */
  lotes: Set<string>;
}

/**
 * Los registros del hilo unidos a un paso de la Libre, sus marcas de cierre, la vigente de cada marca y los lotes que eso toca.
 * Sólo lee. **Cada tabla se lee por los ids del hilo** (`lotProcessId in`), no por «todo lo unido a un paso de esta versión»: las
 * partes de una división comparten la versión (R3). El lote de una corrida es el de sus lecturas —una lectura sólo es «de la
 * corrida» si es del lote que entró en ella (R5)—, así que basta con el de cada vigente; el de un manejo es el de su proceso.
 */
async function aporteDelHilo(tx: Tx, libreVersionId: string, hilo: { ids: string[]; loteDe: Map<string, string> }): Promise<Aporte> {
  const pasos = await tx.processRecipeStep.findMany({ where: { recipeVersionId: libreVersionId }, select: { id: true, seq: true } });
  const delHilo = { lotProcessId: { in: hilo.ids }, recipeStepId: { in: pasos.map((p) => p.id) } };
  const fermentaciones = await tx.fermentationRun.findMany({ where: delHilo, select: { id: true, recipeStepId: true } });
  const secados = await tx.dryingRun.findMany({ where: delHilo, select: { id: true, recipeStepId: true } });
  const manejos = await tx.lotProcessIntervention.findMany({ where: delHilo, select: { id: true, recipeStepId: true, lotProcessId: true } });
  const pasoDe = new Map<string, string>([...fermentaciones, ...secados, ...manejos].map((r) => [r.id, r.recipeStepId!]));

  // Sólo las lecturas MARCADAS (§5.3). Es la línea que impide deducir un umbral de una lectura que nadie marcó.
  const filas = await tx.processStepClosingReading.findMany({
    where: {
      OR: [
        { fermentationRunId: { in: fermentaciones.map((r) => r.id) } },
        { dryingRunId: { in: secados.map((r) => r.id) } },
        { lotProcessInterventionId: { in: manejos.map((r) => r.id) } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { measurementId: true, fermentationRunId: true, dryingRunId: true, lotProcessInterventionId: true },
  });
  const marcas: MarcaDelHilo[] = filas.map((f) => {
    const registro = f.fermentationRunId !== null ? "fermentationRun" : f.dryingRunId !== null ? "dryingRun" : "lotProcessIntervention";
    const registroId = f.fermentationRunId ?? f.dryingRunId ?? f.lotProcessInterventionId!;
    return { measurementId: f.measurementId, registro, registroId, pasoId: pasoDe.get(registroId)! };
  });

  const vigentes = await vigenteDe(tx, marcas.map((m) => m.measurementId));
  const lotes = new Set<string>();
  for (const v of vigentes.values()) if (v.lotId !== null) lotes.add(v.lotId);
  for (const m of manejos) {
    if (marcas.some((x) => x.registroId === m.id)) lotes.add(hilo.loteDe.get(m.lotProcessId)!);
  }
  return { pasos, marcas, vigentes, lotes };
}

/**
 * Las condiciones de fin de los pasos NUEVOS, desde las lecturas marcadas en los registros del hilo. Escribe las filas y devuelve
 * cuántas y cuáles lecturas quedaron sin dirección.
 */
async function proponerFines(tx: Tx, aporte: Aporte, haciaVersionId: string) {
  const nuevos = await tx.processRecipeStep.findMany({ where: { recipeVersionId: haciaVersionId }, select: { id: true, seq: true } });
  // La copia conserva el `seq` de cada paso: es el hilo entre el paso de la Libre y su copia (`copiarContenidoDeVersion` no
  // devuelve el mapa de ids).
  const nuevoPorSeq = new Map(nuevos.map((p) => [p.seq, p.id]));
  const nuevoDe = new Map(aporte.pasos.map((p) => [p.id, nuevoPorSeq.get(p.seq)!]));

  const sinDireccion: { stepId: string; measurementId: string }[] = [];
  if (aporte.marcas.length === 0) return { propuestos: 0, sinDireccion };

  // La serie de cada corrida, UNA vez: sus lecturas VIGENTES, en orden de fecha (una corregida cuenta por su corrección).
  const series = new Map<string, Awaited<ReturnType<typeof lecturasCandidatasDeCierre>>["candidatas"]>();
  const fines: Prisma.ProcessRecipeStepEndCreateManyInput[] = [];
  const vistas = new Set<string>();
  for (const marca of aporte.marcas) {
    // R4: el fin sale de la VIGENTE de la marca, no de la lectura cruda que se marcó.
    const lectura = aporte.vigentes.get(marca.measurementId)!;
    const pasoNuevo = nuevoDe.get(marca.pasoId)!;
    // Una lectura marcada en dos registros del mismo paso —o una marcada y su corrección marcada— es una sola condición.
    const clave = `${pasoNuevo}:${lectura.id}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);

    // La dirección sale de las lecturas VIGENTES de la MISMA variable tomadas antes en esa corrida. Un manejo no tiene serie propia.
    // El lote de la corrida es el de la lectura vigente (R5: una lectura sólo es «de la corrida» si es del lote que entró en ella).
    const deLaCorrida =
      lectura.lotId === null
        ? null
        : marca.registro === "fermentationRun"
          ? { registro: "fermentationRun" as const, registroId: marca.registroId, loteDeLaCorrida: lectura.lotId }
          : marca.registro === "dryingRun"
            ? { registro: "dryingRun" as const, registroId: marca.registroId, loteDeLaCorrida: lectura.lotId }
            : null;
    if (deLaCorrida !== null && !series.has(deLaCorrida.registroId)) {
      series.set(deLaCorrida.registroId, (await lecturasCandidatasDeCierre(tx, deLaCorrida)).candidatas);
    }
    const anteriores = (deLaCorrida === null ? [] : (series.get(deLaCorrida.registroId) ?? [])).filter(
      (l) => l.variable === lectura.variable && l.occurredAt < lectura.occurredAt,
    );
    const primera = anteriores[0] ?? null;
    const sentido = primera === null ? 0 : lectura.value.comparedTo(primera.value);
    if (sentido === 0) {
      sinDireccion.push({ stepId: pasoNuevo, measurementId: lectura.id });
      continue;
    }
    fines.push({
      stepId: pasoNuevo,
      variable: lectura.variable,
      operador: sentido < 0 ? "lte" : "gte",
      valor: lectura.value,
      unidad: lectura.unit,
      desdeLecturaId: lectura.id,
    });
  }
  if (fines.length > 0) await tx.processRecipeStepEnd.createMany({ data: fines });
  return { propuestos: fines.length, sinDireccion };
}

/**
 * Si se le puede OFRECER a quien mira convertir la Libre de este proceso, para no pintar lo que va a fallar (regla del 2026-09-27:
 * lo que no puedes no se muestra, ni se explica). Pregunta LO MISMO que el servicio, con las mismas funciones: ver el lote del
 * proceso (`view`, C8), escribir recetas en su organización (la autoría, Ruling A), que el proceso haya terminado por humedad, sea de
 * una Libre y no tenga ya su receta, y ver el lote de cada registro del hilo que aporta (R3). No escribe; el servidor vuelve a
 * comprobarlo al convertir.
 */
export async function puedeConvertirLibre(userAccountId: string, lotProcessId: string): Promise<boolean> {
  const proceso = await leerProceso(prisma, lotProcessId);
  if (!proceso) return false;
  const lote = await prisma.lot.findUniqueOrThrow({ where: { id: proceso.lotId } });
  try {
    await requireLotAccess(userAccountId, "view", [lote]);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) return false;
    throw error;
  }
  if (!(await puedeAutoriaDeReceta(userAccountId, lote.organizationId))) return false;
  const decision = evaluar(proceso);
  if ("motivo" in decision) return false;
  const aporte = await aporteDelHilo(prisma, decision.libreVersionId, await hiloDelProceso(prisma, proceso.id));
  try {
    await exigeVerLosLotes(prisma, userAccountId, aporte.lotes);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) return false;
    throw error;
  }
  return true;
}

/**
 * Convierte la Libre del proceso `lotProcessId` en una receta de la organización del lote, en borrador, con `nombre`. Ver la
 * cabecera: copia lo planeado, propone fines sólo desde lecturas marcadas del hilo del proceso y deja el origen en el proceso.
 */
export async function convertirLibre(
  userAccountId: string,
  input: { lotProcessId: string; nombre: string },
): Promise<ResultadoDeConvertir> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new RecipeError("nombre_requerido");
  const leido = await leerProceso(prisma, input.lotProcessId);
  if (!leido) throw new RecipeError("proceso_no_encontrado");
  const lote = await prisma.lot.findUniqueOrThrow({ where: { id: leido.lotId } });
  await requireLotAccess(userAccountId, "view", [lote]);
  await exigeAutoriaDeReceta(userAccountId, lote.organizationId);

  return prisma.$transaction(async (tx) => {
    // El linaje primero (el orden global de bloqueos de la Parte 1) y, con él tomado, se relee y se decide: lo de arriba sólo fue la
    // comprobación del permiso.
    await bloquearLinaje(tx, lote.id);
    const actual = await leerProceso(tx, input.lotProcessId);
    if (!actual) throw new RecipeError("proceso_no_encontrado");
    const decision = evaluar(actual);
    if ("motivo" in decision) {
      // Un literal por código, y no `new RecipeError(decision.motivo)`: el guardia `codigos-de-receta-tienen-frase` lee los códigos
      // del texto de `new RecipeError("…")`, y uno que llega por una variable no lo ve (denuncia «sin literal» y deja tres códigos de
      // la lista sin que nadie los lance). Lo mismo que hace `exigeAutoriaDeReceta` con el suyo.
      if (decision.motivo === "proceso_sin_cerrar_por_humedad") throw new RecipeError("proceso_sin_cerrar_por_humedad");
      if (decision.motivo === "no_es_libre") throw new RecipeError("no_es_libre");
      throw new RecipeError("ya_convertida");
    }

    // R3: lo que aporta el hilo se lee y se autoriza ANTES de escribir nada: un lote del hilo que quien convierte no ve deshace todo.
    const aporte = await aporteDelHilo(tx, decision.libreVersionId, await hiloDelProceso(tx, actual.id));
    await exigeVerLosLotes(tx, userAccountId, aporte.lotes);

    const libre = await tx.processRecipeVersion.findUniqueOrThrow({ where: { id: decision.libreVersionId }, include: { recipe: true } });
    // El `create` y su `catch` van pegados, y `tx.processRecipe.create` en una sola línea: el inventario de acceso no reconoce una
    // llamada partida en dos líneas, y la escritura de la receta quedaría fuera de sus modelos.
    const receta = await tx.processRecipe.create({
      data: {
        name: nombre,
        description: libre.recipe.description,
        // R24: la intención cruda viaja en `description`; el nivel que la protege viaja con ella.
        classification: libre.recipe.classification,
        organizationId: lote.organizationId,
        // El estado que manda es el de la VERSIÓN (§3.3); la receta, como contenedor, nace como las demás.
        status: "approved",
        createdBy: userAccountId,
      },
    }).catch((error: unknown) => {
      // Atado al `create`: aquí un P2002 sólo puede ser `@@unique([organizationId, name])`.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new RecipeError("nombre_repetido");
      }
      throw error;
    });
    const version = await tx.processRecipeVersion.create({
      data: { recipeId: receta.id, version: 1, status: "draft", expectedHours: libre.expectedHours, createdBy: userAccountId },
    });
    const copia = await copiarContenidoDeVersion(tx, libre.id, version.id, { metasDeVersion: true, fases: true });
    const propuesta = await proponerFines(tx, aporte, version.id);
    await tx.lotProcess.update({ where: { id: actual.id }, data: { origenDeRecetaVersionId: version.id } });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe.create",
        entityType: "process_recipe",
        entityId: receta.id,
        after: { ...receta, versionId: version.id, copia, desdeLibreVersionId: libre.id, lotProcessId: actual.id },
        reason: `convertida_de_libre_version_${libre.id}`,
        sourceInterface: "recetas.convertir",
      },
      tx,
    );
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.convert_to_recipe",
        entityType: "lot_process",
        entityId: actual.id,
        before: { origenDeRecetaVersionId: null },
        after: { origenDeRecetaVersionId: version.id, recipeId: receta.id, finesPropuestos: propuesta.propuestos },
        sourceInterface: "recetas.convertir",
      },
      tx,
    );

    return {
      recipeId: receta.id,
      versionId: version.id,
      pasos: copia.pasos,
      finesPropuestos: propuesta.propuestos,
      sinDireccion: propuesta.sinDireccion,
    };
  }, TRANSACCION_DEL_LINAJE);
}
