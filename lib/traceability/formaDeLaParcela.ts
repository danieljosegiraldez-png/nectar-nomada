/**
 * La forma declarada de una parcela, contada en celdas.
 *
 * **Por qué existe** (D8/D9, 2026-10-02): el diseño del 2026-10-01 daba por supuesto
 * que un lote es un rectángulo perfecto, y sobre ese supuesto la pantalla afirmaba
 * «caben 200 y hay 150: una diferencia de 50» en un lote al que le falta una esquina,
 * donde la diferencia real es 20. La rejilla pasa a ser el **tablero de direcciones**;
 * cuáles de sus celdas están plantadas lo dice la forma, que es opcional.
 *
 * **Archivo propio y no dentro de `plotBlocks.ts`**, que ya creció 262 líneas el mismo
 * día. Lo que vive aquí es otra responsabilidad: cuánto hay plantado, no qué bloque
 * cubre qué.
 *
 * **No tiene geometría propia, y eso es el hallazgo.** `celdasEnComunConVarios` de
 * `lib/territorio/rejilla.ts` calcula **|unión(rangos) ∩ otro|** por compresión de
 * coordenadas. Lo único que cambia es qué se le pasa como `otro`: el tablero entero da
 * la capacidad del lote, el rango de una microparcela da la suya, y lo que sobra de un
 * trozo son sus celdas sin plantar. La función ya está probada contra el defecto que
 * la motivó —sumaba intersecciones y decía 70 donde hay 50—, así que reusarla trae esa
 * prueba con ella.
 */
import type { PlotShapeRange } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { celdasEnComunConVarios, validarRango, type Rango } from "../territorio/rejilla";
import { CODIGO_DEL_RANGO, RejillaInvalida, requireLocationAttributeAccess } from "./locations";
// El nombre de origen es más estrecho que la función: toma un `locationId`.
import { rejillaDelBloque as rejillaDelSitio } from "./plotBlocks";

/** El tablero entero, como un rango, para pasárselo como ámbito. */
export function tableroDe(rejilla: { rowCount: number; plantsPerRow: number }): Rango {
  return { rowFrom: 1, rowTo: rejilla.rowCount, plantFrom: 1, plantTo: rejilla.plantsPerRow };
}

const celdasDe = (r: Rango) => (r.rowTo - r.rowFrom + 1) * (r.plantTo - r.plantFrom + 1);

/**
 * Cuántas celdas **plantadas** hay dentro de `ambito`.
 *
 * `ambito` es el tablero entero para una parcela, o el rango de la microparcela cuando
 * lo declaró (D3, §7.1 del diseño).
 *
 * **Sin forma declarada devuelve 0**, y quien pregunta distingue ese caso antes de
 * afirmar una capacidad: no devuelve el tablero entero, porque «no se sabe» no es
 * «está lleno» igual que no es «está vacío» (ADR-080).
 */
export function celdasDeLaForma(forma: readonly Rango[], ambito: Rango): number {
  if (forma.length === 0) return 0;
  return celdasEnComunConVarios(forma, ambito);
}

/**
 * Cuántas celdas de `trozo` caen donde la forma dice que **no** hay planta.
 *
 * Es lo que D11 convierte en aviso: el trozo se guarda, y se dice cuántas celdas sin
 * plantar incluye. Una trampa en un claro es su sitio natural.
 *
 * **Sin forma declarada devuelve 0, no `|trozo|`.** Si devolviera el total, cada
 * parcela sin forma avisaría de que todo está sin plantar — y eso convertiría un
 * «no medido» en una afirmación.
 */
export function celdasSinPlantar(forma: readonly Rango[], trozo: Rango): number {
  if (forma.length === 0) return 0;
  return celdasDe(trozo) - celdasEnComunConVarios(forma, trozo);
}

// --- Declarar y quitar trozos de forma ------------------------------------------

/**
 * Declara un trozo de la forma de un lote.
 *
 * **El trozo se cuelga de la RAÍZ de la numeración, no del sitio que pase quien
 * llama** (D3: la numeración es una sola, la de la parcela). Si alguien lo declara
 * desde una microparcela, aterriza en su parcela — y el permiso se exige sobre la
 * raíz, que es lo que de verdad se modifica: con el permiso de la microparcela no se
 * puede cambiar la forma de su madre.
 *
 * **La validación es la misma que la de los rangos de bloque**, no una copia:
 * `validarRango` y `CODIGO_DEL_RANGO`. Un código nuevo sería una frase nueva que
 * traducir y un sitio más donde derivar.
 */
export async function declararTrozoDeForma(
  userAccountId: string,
  input: { locationId: string } & Rango,
): Promise<PlotShapeRange> {
  const { raiz, rejilla } = await rejillaDelSitio(input.locationId);
  await requireLocationAttributeAccess(userAccountId, raiz);

  const malo = validarRango(input, rejilla);
  if (malo) throw new RejillaInvalida(CODIGO_DEL_RANGO[malo]);

  return prisma.$transaction(async (tx) => {
    const creado = await tx.plotShapeRange.create({
      data: {
        locationId: raiz,
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
        operation: "location.declare_shape_range",
        entityType: "location",
        entityId: raiz,
        after: creado,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return creado;
  });
}

/**
 * Quita un trozo de la forma, y dice **cuántas plantas quedan fuera** de lo que resta.
 *
 * **§7.4: avisa, no rechaza.** Rechazar obligaría a declarar como plantado un terreno
 * que no lo está, y el operario sabe algo que la base no: quizá la planta se murió, o
 * quizá la forma estaba mal. Se quita igual y se le dice qué deja detrás.
 *
 * **Si no queda forma, devuelve 0 — no «todas».** Sin forma declarada el estado es «no
 * se sabe», no «está vacío» (ADR-080): si devolviera el total, borrar la forma entera
 * avisaría de que ninguna planta está plantada, que es lo contrario de lo que pasa.
 */
export async function quitarTrozoDeForma(
  userAccountId: string,
  trozoId: string,
): Promise<{ plantasQueQuedanFuera: number }> {
  const trozo = await prisma.plotShapeRange.findUnique({ where: { id: trozoId } });
  if (!trozo) throw new RejillaInvalida("rejilla_trozo_no_encontrado");
  await requireLocationAttributeAccess(userAccountId, trozo.locationId);

  await prisma.$transaction(async (tx) => {
    await tx.plotShapeRange.delete({ where: { id: trozoId } });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.remove_shape_range",
        entityType: "location",
        entityId: trozo.locationId,
        before: trozo,
        sourceInterface: "traceability.service",
      },
      tx,
    );
  });

  const resto = await prisma.plotShapeRange.findMany({ where: { locationId: trozo.locationId } });
  if (resto.length === 0) return { plantasQueQuedanFuera: 0 };

  // Las plantas situadas del lote y de sus microparcelas: la numeración es una sola.
  const situadas = await prisma.specimen.findMany({
    where: {
      specimenType: "plant",
      gridRow: { not: null },
      gridPosition: { not: null },
      OR: [{ locationId: trozo.locationId }, { location: { parentLocationId: trozo.locationId } }],
    },
    select: { gridRow: true, gridPosition: true },
  });

  // **Una celda es un rango de 1×1**, así que la cobertura se mide con la misma función
  // de unión que todo lo demás: 0 celdas en común = la planta queda fuera.
  const plantasQueQuedanFuera = situadas.filter(
    (p) =>
      celdasEnComunConVarios(resto, {
        rowFrom: p.gridRow!,
        rowTo: p.gridRow!,
        plantFrom: p.gridPosition!,
        plantTo: p.gridPosition!,
      }) === 0,
  ).length;

  return { plantasQueQuedanFuera };
}
