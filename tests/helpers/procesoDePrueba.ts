/**
 * Abrir un proceso en una prueba, y limpiarlo.
 *
 * **Por qué existe** (Parte 1, R3): desde esta parte no se empieza una fermentación ni un secado sin
 * un proceso abierto que cubra al lote. Treinta llamadas en diez archivos de prueba empezaban
 * corridas sin proceso. En vez de copiar treinta veces el armado de un proceso, una línea.
 *
 * **Abre CON receta** (Parte 2a, §5.1, tarea 5b): desde la receta obligatoria, `abrirProceso` rechaza abrir sin
 * receta (`sin_receta`). Medido al escribir la tarea 5b (2026-10-12): 151 líneas con este ayudante en 16 archivos, 143 sin receta.
 * Si la prueba no pide una versión, el ayudante abre con la receta de prueba de la organización del lote
 * (`recetaDePrueba`): publicada y SIN pasos, metas ni fases, así que no declara nada que cambie lo que esas pruebas
 * miden, y bajo una receta sin pasos ningún registro es desviación (diseño 2a, §4.4). Un proceso VIEJO sin receta
 * (R9) ya no lo abre el servicio: la prueba que lo necesite lo inserta crudo, como lo dejó la transición.
 *
 * **Usa los valores REALES del catálogo** (`Washed`, `despulpada`): la base de pruebas está sembrada
 * (`npm run db:seed`), así que existen y no hay valores de prueba que limpiar.
 *
 * Por convención de la casa, la limpieza la llama el archivo de la prueba, no el ayudante: es
 * `borrarProcesosDeLotesDonde`, que borra también la receta de prueba (ver allí por qué no puede quedarse).
 */
import { prisma } from "../../lib/db";
import { abrirProceso } from "../../lib/traceability/lotProcess";
import { Prisma } from "../../generated/prisma/client";
import { assertDefinedWhere, UnsafeWhereClauseError } from "./assertDefinedWhere";
import { tieneCondicion } from "./tieneCondicion";

/**
 * El nombre de la receta de prueba: una por organización (`@@unique([organizationId, name])`). Empieza por `TEST`, como
 * todo lo que crea una prueba, y no lleva el RUN de ningún archivo: la reusan todas las aperturas de la organización, y
 * la borra `borrarProcesosDeLotesDonde`, no el `contains: RUN` de cada archivo.
 */
export const NOMBRE_DE_LA_RECETA_DE_PRUEBA = "TEST receta de prueba (abrirProcesoDePrueba)";

async function valorDeCatalogo(catalogo: string, valor: string): Promise<string> {
  return (
    await prisma.variableCatalogValue.findFirstOrThrow({
      where: { value: valor, catalog: { key: catalogo } },
      select: { id: true },
    })
  ).id;
}

/**
 * La receta de prueba de una organización, con su versión 1, las dos publicadas (Parte 2a, §5.1). La crea la primera
 * vez y la reusa después.
 *
 * **Cruda, con Prisma, y no con la autoría** (`crearRecetaEnBorrador`, `agregarPaso` y `publicarVersion`, que piden el permiso del Coffee Process Manager): aquí no se
 * prueba la autoría, hace falta una receta que `abrirProceso` acepte. (`createRecipeWithVersion`, que desde la tarea 3 la creaba en borrador, ya no existe: la retiró la tarea 14.)
 *
 * **Dos aperturas a la vez** en la misma organización (`aperturaDeProceso.test.ts`, «dos aperturas a la vez…») pueden no
 * encontrarla las dos y crearla las dos: la unicidad rechaza la segunda con P2002, y ésa la relee.
 *
 * **Sólo para una organización cuyos lotes pasen después por `borrarProcesosDeLotesDonde`**, que es quien la borra:
 * `process_recipe.organization_id` es RESTRICT desde la tarea 1 (migración `_receta_con_pasos`; antes era SET NULL y una
 * receta de prueba que sobrevivía a su organización se volvía, en silencio, una plantilla de TODAS), así que una receta de
 * prueba que nadie borre impide borrar la organización: el `afterAll` del archivo falla, a la vista, en vez de dejar basura.
 */
export async function recetaDePrueba(organizationId: string): Promise<{ recipeId: string; recipeVersionId: string }> {
  const buscar = () =>
    prisma.processRecipe.findFirst({
      where: { organizationId, name: NOMBRE_DE_LA_RECETA_DE_PRUEBA },
      select: { id: true, versions: { where: { version: 1 }, select: { id: true } } },
    });
  let receta = await buscar();
  if (!receta) {
    try {
      receta = await prisma.processRecipe.create({
        data: {
          name: NOMBRE_DE_LA_RECETA_DE_PRUEBA,
          organizationId,
          status: "approved",
          versions: {
            create: { version: 1, status: "approved", notes: "TEST: la receta por defecto de abrirProcesoDePrueba (Parte 2a, §5.1)" },
          },
        },
        select: { id: true, versions: { where: { version: 1 }, select: { id: true } } },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      receta = await buscar();
    }
  }
  const version = receta?.versions[0];
  if (!receta || !version) {
    throw new Error(`recetaDePrueba: la receta de prueba de la organización ${organizationId} no tiene su versión 1`);
  }
  return { recipeId: receta.id, recipeVersionId: version.id };
}

/**
 * Abre un proceso de prueba. Sin `processRecipeVersionId`, con la receta de prueba de la organización del lote. Ya no
 * acepta `null`: desde la Parte 2a un proceso sin receta no se abre (`sin_receta`), y una prueba que necesite uno VIEJO
 * lo inserta crudo.
 */
export async function abrirProcesoDePrueba(
  userAccountId: string,
  lotId: string,
  extra: { startedAt?: Date; targetMoisturePct?: number; processRecipeVersionId?: string } = {},
) {
  const processRecipeVersionId =
    extra.processRecipeVersionId ??
    (
      await recetaDePrueba(
        (await prisma.lot.findUniqueOrThrow({ where: { id: lotId }, select: { organizationId: true } })).organizationId,
      )
    ).recipeVersionId;
  return abrirProceso(userAccountId, {
    lotId,
    intent: "TEST: proceso abierto para poder empezar corridas (Parte 1, R3)",
    targetMoisturePct: extra.targetMoisturePct ?? 11.5,
    startedAt: extra.startedAt ?? new Date("2020-01-01T00:00:00Z"),
    provenanceClass: "original_record",
    processGradeValueId: await valorDeCatalogo("grado_proceso", "Washed"),
    cherryStateValueId: await valorDeCatalogo("estado_cereza", "despulpada"),
    processRecipeVersionId,
  });
}

/**
 * Borra los procesos de los lotes que cumplan `lot`, y antes sus devoluciones a secado (con su auditoría); y al final, la
 * receta de prueba de las organizaciones de esos lotes que ya no use ningún proceso. Va ANTES de borrar esos lotes
 * —`lot_process.lot_id` es RESTRICT— y ANTES de borrar su organización. Se le pasa el mismo `where` con el que el
 * archivo borra sus lotes.
 *
 * **Rechaza un filtro de lote sin una restricción positiva** (`tieneCondicion`, en `./tieneCondicion`, que
 * explica qué cuenta y qué no). `assertDefinedWhere` sólo exige que el `where` de arriba no esté vacío
 * —aquí siempre trae el `OR`— y que no haya `undefined`; no ve que el `lot` de dentro sea `{}` ni que sólo
 * lleve negaciones, y cualquiera de las dos casa con todos los lotes y borraba todos los procesos de la base.
 */
export async function borrarProcesosDeLotesDonde(lot: Prisma.LotWhereInput): Promise<void> {
  if (!tieneCondicion(lot)) {
    throw new UnsafeWhereClauseError(
      "borrarProcesosDeLotesDonde: el filtro de lote no tiene ninguna condición definida — casaría con TODOS los lotes y borraría TODOS los procesos de la base",
    );
  }
  // Los eventos de auditoría de un proceso (`lot_process.open`, `…close`…) cuelgan del PROCESO por su `entityId`, y la
  // base no los borra con él ni con su usuario (el actor es SET NULL): sin esto quedaban huérfanos, y la tarea 4 sumó
  // 26 aperturas por corrida de la suite (ronda de arreglo 1, 2026-10-01; medidos 1306 en `nectar_test_recetas`). Se
  // borran por los ids de los procesos que ESTA llamada va a borrar —filtro positivo: `entityType` y `entityId in`—, y
  // sin procesos no se toca nada.
  const procesos = await prisma.lotProcess.findMany({ where: assertDefinedWhere({ lot }), select: { id: true } });
  const ids = procesos.map((p) => p.id);
  // Parte 2a, tarea 5b: las organizaciones de esos LOTES —no de sus procesos: `recetaDePrueba` puede haber creado la
  // receta sin que llegara a abrirse ninguno—, para borrar al final su receta de prueba.
  const organizaciones = [
    ...new Set(
      (await prisma.lot.findMany({ where: assertDefinedWhere({ AND: [lot] }), select: { organizationId: true } })).map(
        (l) => l.organizationId,
      ),
    ),
  ];
  // Parte 1, R7 (tarea 8): `devolverASecado` escribe además su propio evento (`lot_process.return_to_drying`, entidad
  // `lot_process_return`), que cuelga de la DEVOLUCIÓN y no del proceso. Se borra en el MISMO `deleteMany` de la
  // auditoría, por los ids de las devoluciones que ESTA llamada va a borrar (el mismo filtro positivo) y antes de
  // borrarlas. Son cuatro borrados desde la Parte 2a —auditoría, devoluciones, procesos y la receta de prueba—, que es lo
  // que `tests/helpers/tieneCondicion.test.ts` cuenta en la fuente.
  const devoluciones = await prisma.lotProcessReturn.findMany({
    where: assertDefinedWhere({ OR: [{ closedLotProcess: { lot } }, { continuationLotProcess: { lot } }] }),
    select: { id: true },
  });
  const idsDeDevoluciones = devoluciones.map((d) => d.id);
  if (ids.length > 0 || idsDeDevoluciones.length > 0) {
    await prisma.auditEvent.deleteMany({
      where: assertDefinedWhere({
        OR: [
          { entityType: "lot_process", entityId: { in: ids } },
          { entityType: "lot_process_return", entityId: { in: idsDeDevoluciones } },
        ],
      }),
    });
  }
  await prisma.lotProcessReturn.deleteMany({
    where: assertDefinedWhere({ OR: [{ closedLotProcess: { lot } }, { continuationLotProcess: { lot } }] }),
  });
  await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lot }) });
  // Parte 2a, tarea 5b: la receta de prueba de esas organizaciones, DESPUÉS de sus procesos
  // (`lot_process.process_recipe_version_id` es RESTRICT) y ANTES de que el archivo borre la organización
  // (`process_recipe.organization_id` es RESTRICT desde la tarea 1: con la receta viva, borrar la organización falla). Sólo
  // las que ya no usa NINGÚN proceso, de cualquier lote: un archivo que limpia a mitad de camino
  // (`corridaConProceso.test.ts`, «tras borrarProcesosDeLotesDonde no queda ningún evento…») aún tiene otros procesos con
  // ella, y borrarla ahí reventaría contra esa RESTRICT. Su versión se va con ella (Cascade).
  const deLaPrueba = await prisma.processRecipe.findMany({
    where: assertDefinedWhere({ name: NOMBRE_DE_LA_RECETA_DE_PRUEBA, organizationId: { in: organizaciones } }),
    select: { id: true, versions: { select: { id: true } } },
  });
  const enUso = new Set(
    (
      await prisma.lotProcess.findMany({
        where: { processRecipeVersionId: { in: deLaPrueba.flatMap((r) => r.versions.map((v) => v.id)) } },
        select: { processRecipeVersionId: true },
      })
    ).map((p) => p.processRecipeVersionId),
  );
  await prisma.processRecipe.deleteMany({
    where: assertDefinedWhere({
      id: { in: deLaPrueba.filter((r) => r.versions.every((v) => !enUso.has(v.id))).map((r) => r.id) },
    }),
  });
}
