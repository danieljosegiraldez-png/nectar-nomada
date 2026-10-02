import { Prisma, type PlotBlockRange, type PlotBlockType } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { CODIGO_DEL_RANGO, RejillaInvalida, requireLocationAttributeAccess } from "./locations";
import { celdasEnComunConVarios, seSolapan, validarRango, type Rango } from "../territorio/rejilla";
import { TIPOS_DE_BLOQUE } from "./tiposDeBloque";

export class PlotBlockValidationError extends Error {}

export interface CreatePlotBlockInput {
  locationId: string;
  name: string;
  blockType: PlotBlockType;
  description?: string | null;
  notes?: string | null;
}

/** F2 §3 extendido — un bloque es una zona con nombre y tipo dentro de una parcela. */
export async function createPlotBlock(userAccountId: string, input: CreatePlotBlockInput) {
  const name = input.name.trim();
  if (!name) throw new PlotBlockValidationError("block_name_required");
  if (!TIPOS_DE_BLOQUE.includes(input.blockType)) {
    throw new PlotBlockValidationError("block_type_required");
  }

  await requireLocationAttributeAccess(userAccountId, input.locationId);

  try {
    return await prisma.$transaction(async (tx) => {
      const bloque = await tx.plotBlock.create({
        data: {
          locationId: input.locationId,
          name,
          blockType: input.blockType,
          description: input.description ?? null,
          notes: input.notes ?? null,
          createdBy: userAccountId,
        },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "plot_block.create",
          entityType: "plot_block",
          entityId: bloque.id,
          after: bloque,
          sourceInterface: "traceability.service",
        },
        tx,
      );
      return bloque;
    });
  } catch (error) {
    // El unique de la base es la red: dos operadores a la vez no crean el mismo bloque.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PlotBlockValidationError("block_name_taken");
    }
    throw error;
  }
}

export interface SetPlotBlockTypeInput {
  plotBlockId: string;
  blockType: PlotBlockType;
  description?: string | null;
}

/**
 * Ajustes pide elegir el tipo de un bloque que ya existía antes de esta migración
 * (ADR-080: nació NULL, no se le supuso uno). También sirve para cambiar el tipo de
 * un bloque que ya lo tenía, o para poner/quitar la descripción: no hay ninguna regla
 * que lo restrinja a "sólo una vez".
 */
export async function setPlotBlockType(userAccountId: string, input: SetPlotBlockTypeInput) {
  if (!TIPOS_DE_BLOQUE.includes(input.blockType)) {
    throw new PlotBlockValidationError("block_type_required");
  }
  const existing = await prisma.plotBlock.findUnique({ where: { id: input.plotBlockId } });
  if (!existing) throw new PlotBlockValidationError("block_not_found");
  await requireLocationAttributeAccess(userAccountId, existing.locationId);

  // **Pasar un bloque a «trampa» cuando sus celdas ya se solapan con una trampa.**
  // El disparador de solapes vive en `plot_block_range`, asi que cambiar el TIPO
  // despues no volvia a comprobar nada: un bloque sin tipo con el mismo rango que
  // una trampa se guardaba con aviso —D7 dice que sin tipo no bloquea— y esta
  // misma funcion lo pasaba a trampa sin rechazo. Lo encontro una revision
  // independiente el 2026-10-02.
  //
  // La base lo garantiza desde `20261002040000_las_tres_reglas_que_faltaban`; esto
  // es el mensaje, y solo mira la TRANSICION: si ya era trampa, sus rangos ya
  // pasaron por el disparador.
  if (input.blockType === "trampa" && existing.blockType !== "trampa") {
    const { raiz } = await rejillaDelBloque(existing.locationId);
    const mios = await prisma.plotBlockRange.findMany({ where: { plotBlockId: existing.id } });
    if (mios.length > 0) {
      const trampas = await prisma.plotBlock.findMany({
        where: {
          id: { not: existing.id },
          blockType: "trampa",
          OR: [{ locationId: raiz }, { location: { parentLocationId: raiz } }],
        },
        select: { name: true, rangos: true },
      });
      const choca = trampas.find((t2) => t2.rangos.some((r) => mios.some((m) => seSolapan(r, m))));
      if (choca) throw new RejillaInvalida(`rejilla_trampas_se_solapan_al_marcar:${choca.name}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.plotBlock.update({
      where: { id: input.plotBlockId },
      data: {
        blockType: input.blockType,
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "plot_block.set_type",
        entityType: "plot_block",
        entityId: actualizado.id,
        before: existing,
        after: actualizado,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return actualizado;
  });
}

export async function listPlotBlocks(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  // Los rangos vienen con el bloque: la pantalla de ajustes los lista y deja
  // quitarlos, y pedirlos aparte serían N consultas más para lo mismo. Ordenados
  // por hilera para que la lista se lea como se recorre el terreno.
  return prisma.plotBlock.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
    include: { rangos: { orderBy: [{ rowFrom: "asc" }, { plantFrom: "asc" }] } },
  });
}

/**
 * El prefijo que muestra el TIPO de un bloque, no la palabra «Bloque» a secas — así
 * desaparece «Bloque Bloque Norte»: antes el prefijo se sumaba a un nombre que ya lo
 * llevaba escrito. Pura: el llamador hace `clave ? t(clave, { name }) : block.name`.
 */
export function claveDeTituloDeBloque(
  blockType: PlotBlockType | null,
): "blockTitleTrampa" | "blockTitleExperimental" | null {
  if (blockType === "trampa") return "blockTitleTrampa";
  if (blockType === "experimental") return "blockTitleExperimental";
  return null;
}

/**
 * Los rangos de un bloque: dónde está dentro de la rejilla de su parcela.
 *
 * Diseño §4/§5, decisiones **D5** (uno o varios rangos por bloque: en L, o en dos
 * trozos de hileras, sigue siendo UNA unidad de observación) y **D7** (sólo las
 * trampas no pueden cubrir la misma celda).
 *
 * **La rejilla es SIEMPRE la de la parcela**, nunca una del bloque ni de la
 * microparcela (D3): la numeración es una sola, así que «hilera 7» quiere decir
 * una cosa en toda la parcela. Un bloque puede colgar de la parcela o de una de
 * sus microparcelas, y en los dos casos se numera igual.
 */

export interface AnadirRangoAlBloqueInput {
  plotBlockId: string;
  rowFrom: number;
  rowTo: number;
  plantFrom: number;
  plantTo: number;
}

/** Con quién se solapa un rango nuevo y cuántas celdas comparten. */
export interface SolapeAvisado {
  readonly bloque: string;
  readonly celdas: number;
}

/**
 * La parcela que pone la numeración, y los sitios que la comparten.
 *
 * Un bloque cuelga de la parcela o de una microparcela suya. La rejilla vive en la
 * parcela, así que la raíz es el sitio del bloque cuando ése la tiene, y su padre
 * cuando no.
 */
/**
 * **Se exporta desde el 2026-10-02, y el nombre es mas estrecho que la funcion.**
 * Toma un `locationId`, no un bloque: resuelve la parcela que pone la numeracion
 * para CUALQUIER sitio. `lib/traceability/specimens.ts` la importa con alias
 * `rejillaDelSitio`, que es como se lee alli. No se renombra aqui para no tocar sus
 * siete sitios de llamada; es la misma regla que `core.raiz_de_la_numeracion` en la
 * base, y vive en un solo sitio por la misma razon.
 */
export async function rejillaDelBloque(locationId: string) {
  const sitio = await prisma.location.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      name: true,
      rowCount: true,
      plantsPerRow: true,
      parentLocationId: true,
      rangeRowFrom: true,
      rangeRowTo: true,
      rangePlantFrom: true,
      rangePlantTo: true,
    },
  });
  if (!sitio) throw new PlotBlockValidationError("block_location_not_found");
  // El rango PROPIO del sitio del bloque: si es una microparcela que dice dónde
  // está, el bloque no puede salirse de ahí. Sin rango no hay límite que exigir
  // —el rango de la microparcela es opcional (D3)— y eso es deliberado.
  const suyo: Rango | null =
    sitio.rangeRowFrom != null &&
    sitio.rangeRowTo != null &&
    sitio.rangePlantFrom != null &&
    sitio.rangePlantTo != null
      ? {
          rowFrom: sitio.rangeRowFrom,
          rowTo: sitio.rangeRowTo,
          plantFrom: sitio.rangePlantFrom,
          plantTo: sitio.rangePlantTo,
        }
      : null;
  const comun = { suyo, nombreDelSitio: sitio.name };
  if (sitio.rowCount != null && sitio.plantsPerRow != null) {
    return { ...comun, raiz: sitio.id, rejilla: { rowCount: sitio.rowCount, plantsPerRow: sitio.plantsPerRow } };
  }
  if (!sitio.parentLocationId) return { ...comun, raiz: sitio.id, rejilla: null };
  const madre = await prisma.location.findUnique({
    where: { id: sitio.parentLocationId },
    select: { id: true, rowCount: true, plantsPerRow: true },
  });
  if (madre?.rowCount != null && madre.plantsPerRow != null) {
    return { ...comun, raiz: madre.id, rejilla: { rowCount: madre.rowCount, plantsPerRow: madre.plantsPerRow } };
  }
  return { ...comun, raiz: sitio.parentLocationId, rejilla: null };
}

/**
 * Añade un rango a un bloque, avisando de los solapes que D7 permite.
 *
 * **Lo que se avisa no se rechaza, y es deliberado.** Un ensayo que se solape con
 * una trampa es una decisión del agrónomo, no un error de captura: «señalarlo, no
 * corregirlo en silencio». Lo que el sistema debe hacer es decir con quién y
 * cuántas celdas.
 *
 * **Y el rechazo de dos trampas tiene EXACTAMENTE el alcance del disparador**, no
 * uno mayor. El disparador `traceability.exigir_trampas_sin_solape` compara
 * `b2."location_id" = mi_parcela`, o sea el mismo sitio. Si este servicio
 * rechazara además las trampas de microparcelas hermanas —que comparten rejilla—
 * sería más estricto que la base, y entonces un importador o un SQL directo
 * podrían crear lo que la pantalla no: de los dos lados posibles de equivocarse,
 * el peligroso. Ese hueco se avisa y queda escrito en
 * `tests/territorio/rangosDeBloque.test.ts`, que lo afirma como es hoy.
 */
export async function anadirRangoAlBloque(
  userAccountId: string,
  input: AnadirRangoAlBloqueInput,
): Promise<{ rango: PlotBlockRange; solapesAvisados: SolapeAvisado[] }> {
  const bloque = await prisma.plotBlock.findUnique({ where: { id: input.plotBlockId } });
  if (!bloque) throw new PlotBlockValidationError("block_not_found");
  await requireLocationAttributeAccess(userAccountId, bloque.locationId);

  const { raiz, rejilla, suyo, nombreDelSitio } = await rejillaDelBloque(bloque.locationId);
  const malo = validarRango(input, rejilla);
  if (malo) throw new RejillaInvalida(CODIGO_DEL_RANGO[malo]);

  // **Y dentro de su microparcela, si la microparcela dice dónde está.** Un bloque
  // que pertenece administrativamente a un suelo y ocupa otro no lo impedía nada
  // —ni la base ni el servicio— hasta
  // `20261002040000_las_tres_reglas_que_faltaban`. Lo encontró una revisión
  // independiente; el §5.1 del diseño lo pedía desde el principio.
  if (
    suyo &&
    (input.rowFrom < suyo.rowFrom ||
      input.rowTo > suyo.rowTo ||
      input.plantFrom < suyo.plantFrom ||
      input.plantTo > suyo.plantTo)
  ) {
    throw new RejillaInvalida(`rejilla_fuera_de_la_microparcela:${nombreDelSitio}`);
  }

  // Todos los bloques que comparten esta numeración: los de la parcela y los de
  // sus microparcelas. El rango propio no cuenta como solape consigo mismo.
  const vecinos = await prisma.plotBlock.findMany({
    where: {
      id: { not: bloque.id },
      OR: [{ locationId: raiz }, { location: { parentLocationId: raiz } }],
    },
    select: { id: true, name: true, blockType: true, locationId: true, rangos: true },
  });

  const solapesAvisados: SolapeAvisado[] = [];
  for (const v of vecinos) {
    // La UNIÓN de las celdas, no la suma de las intersecciones: dos rangos del
    // mismo vecino que se pisen entre sí contarían dos veces lo compartido.
    // Medido: 70 donde hay 50.
    const celdas = celdasEnComunConVarios(v.rangos, input);
    if (celdas > 0) solapesAvisados.push({ bloque: v.name, celdas });
  }

  // D7, con el alcance del disparador y no uno mayor: trampa contra trampa EN EL
  // MISMO SITIO. Esto es el mensaje; el disparador es la garantía.
  // **D7 con el alcance que D7 dice: la NUMERACIÓN, no el sitio.**
  //
  // La versión anterior comparaba `v.locationId === bloque.locationId`, copiando
  // el alcance del disparador. Y el disparador estaba mal: su variable se llamaba
  // `mi_parcela` pero guardaba el `location_id` del BLOQUE, que para un bloque en
  // microparcela es la microparcela. El nombre delataba la intención. D7 no lleva
  // calificativo de sitio, y D3 dice que la numeración es UNA.
  //
  // Lo corrigió `20261002040000_las_tres_reglas_que_faltaban` en la base, y aquí
  // se iguala: `vecinos` ya son los de la raíz entera, así que basta con dejar de
  // filtrar por sitio. Mi argumento anterior —«más estricto que la base es el
  // lado peligroso»— era correcto como regla y falso como aplicación: el hueco
  // estaba en el disparador, no en el servicio.
  if (bloque.blockType === "trampa") {
    const choca = vecinos.some(
      (v) => v.blockType === "trampa" && v.rangos.some((r) => seSolapan(r, input)),
    );
    if (choca) throw new RejillaInvalida("rejilla_trampas_se_solapan");
  }

  const rango = await prisma.$transaction(async (tx) => {
    const creado = await tx.plotBlockRange.create({
      data: {
        plotBlockId: bloque.id,
        rowFrom: input.rowFrom,
        rowTo: input.rowTo,
        plantFrom: input.plantFrom,
        plantTo: input.plantTo,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "plot_block.add_range",
        entityType: "plot_block",
        entityId: bloque.id,
        after: creado,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return creado;
  });

  return { rango, solapesAvisados };
}

/**
 * Quita un rango de un bloque.
 *
 * **Quitar es un acto y se registra**, con el rango que había en `before`: sin
 * eso, un rango que desaparece no se distingue de uno que nunca existió, y la
 * pregunta «¿por qué este bloque ya no cubre la hilera 7?» no tiene respuesta.
 */
export async function quitarRangoDelBloque(userAccountId: string, rangoId: string): Promise<void> {
  const rango = await prisma.plotBlockRange.findUnique({
    where: { id: rangoId },
    include: { plotBlock: { select: { id: true, locationId: true } } },
  });
  if (!rango) throw new PlotBlockValidationError("range_not_found");
  await requireLocationAttributeAccess(userAccountId, rango.plotBlock.locationId);

  await prisma.$transaction(async (tx) => {
    await tx.plotBlockRange.delete({ where: { id: rangoId } });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "plot_block.remove_range",
        entityType: "plot_block",
        entityId: rango.plotBlock.id,
        before: rango,
        sourceInterface: "traceability.service",
      },
      tx,
    );
  });
}
