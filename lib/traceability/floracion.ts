/**
 * La floración de una parcela — decisión de Daniel, 2026-10-01: «parcela, microparcela o bloque».
 *
 * **Para qué existe.** Esta operación tiene apiarios y meliponarios propios, así que una aplicación
 * que caiga en floración no es un riesgo ambiental genérico: toca su propia producción de miel.
 * Antes no había dónde anotar la floración, así que no había forma de decirlo.
 *
 * **Lo que el aviso NO dice, y es deliberado:** no cita ninguna recomendación agronómica. Las que
 * hay —`docs/dominio/broca-manejo-recomendaciones.md`, en el PR #575— están marcadas en su propia
 * cabecera como «referencia externa» y lo sustancial salió del resumen de un buscador. El aviso
 * junta **dos hechos que el sistema tiene** —el producto declara que daña polinizadores y hay
 * floración anotada— y deja el juicio en quien está delante de la parcela. Afirmarle al operario lo
 * que «piden las fuentes de la región» sería emitir una afirmación que no se puede sostener, que es
 * justo lo que `docs/beneficio/21_rubrica_veracidad.md` prohíbe. Lo señaló una revisión
 * independiente, midiendo que el documento citado no está ni en `main`.
 *
 * **Lo que este módulo NO hace, y es deliberado.** No bloquea una aplicación ni la rechaza. La
 * especificación §32 exige `sugerencia → evidencia → revisión humana → acción → registro`, y
 * `docs/dominio/README.md` lo dice con el ejemplo exacto: un umbral puede **proponer** —«esto queda
 * fuera del rango, ¿lo miras?»— y no **afirmar** —«PELIGRO, no apliques»—. La diferencia no es de
 * tono: la primera deja el juicio en quien está delante de la parcela, y la segunda se lo quita.
 */
import type { PlotBloom, Prisma } from "../../generated/prisma/client";

import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess, DEFAULT_NEW_RECORD_CLASSIFICATION } from "./lots";
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import type { VentanaDeFloracion } from "./floracionVigente";
import { ubicacionesEmparentadas } from "./ubicacionesEmparentadas";

export class FloracionValidationError extends Error {}

export interface RegistrarFloracionInput {
  readonly locationId: string;
  /** El bloque, cuando se anota más fino que la parcela. Nulo = la parcela entera. */
  readonly plotBlockId?: string | null;
  readonly startsAt: Date;
  /**
   * Nulo = **todavía abierta**, que es el estado real mientras la floración dura.
   *
   * **Y cuando se da, es un INSTANTE: el fin del día, no la medianoche del día.** Medido el
   * 2026-10-01: con `2026-03-20T00:00:00Z` —la forma en que esta casa guarda un campo de día— el
   * aviso de polinizadores **calla el 20**, que es el último día de la ventana. La pantalla que
   * registre esto manda el fin del día con `parseLocalDateTime`, no un `type="date"`. Está dicho
   * también en el docstring de `hayFloracion`, que es quien lo compara.
   */
  readonly endsAt?: Date | null;
  readonly observerPersonId?: string | null;
  readonly notes?: string | null;
}

/** Anota una floración. Exige `lot:manage` sobre la parcela, como registrar una intervención. */
export async function registrarFloracion(userAccountId: string, input: RegistrarFloracionInput): Promise<PlotBloom> {
  if (input.endsAt && input.endsAt < input.startsAt) {
    throw new FloracionValidationError("la floración no puede terminar antes de empezar");
  }

  const parcela = await prisma.location.findUnique({
    where: { id: input.locationId },
    select: { id: true, locationType: true },
  });
  if (!parcela) throw new FloracionValidationError("no existe la parcela");
  if (parcela.locationType !== "plot" && parcela.locationType !== "micro_plot") {
    throw new FloracionValidationError("no_es_parcela");
  }

  await requireLotAccess(userAccountId, "manage", [
    { locationId: input.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION },
  ]);
  // **Lo encontró un guardia, no una revisión.** La primera versión escribía `observerPersonId` sin
  // pasar por aquí, y `tests/arquitectura/escritura-de-persona.test.ts` cayó: atribuir una
  // observación a alguien es una escritura sobre esa persona, y quien la hace tiene que poder
  // nombrarla en esta finca. Sin esto, una cuenta podía firmar una floración a nombre de otro.
  await exigirPersonaPermitida(userAccountId, input.observerPersonId, [{ locationId: input.locationId }]);

  // El bloque tiene que ser DE esta parcela: si no, anotar en una parcela movería la floración de
  // otra. Mismo cuidado que `validarReferencias` tiene con el frasco y la jornada.
  if (input.plotBlockId) {
    const bloque = await prisma.plotBlock.findUnique({
      where: { id: input.plotBlockId },
      select: { locationId: true },
    });
    if (!bloque) throw new FloracionValidationError("no existe el bloque");
    if (bloque.locationId !== input.locationId) {
      throw new FloracionValidationError("ese bloque es de otra parcela");
    }
  }

  return prisma.$transaction(async (tx) => {
    const creada = await tx.plotBloom.create({
      data: {
        locationId: input.locationId,
        plotBlockId: input.plotBlockId ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        notes: input.notes?.trim() || null,
        observerPersonId: input.observerPersonId ?? null,
        provenanceClass: "original_record",
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "plot_bloom.create",
        entityType: "plot_bloom",
        entityId: creada.id,
        after: creada,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return creada;
  });
}

/**
 * ¿Estaba esta parcela en floración en ese instante?
 *
 * **Una ventana sin cierre cuenta como abierta**, que es el estado de campo mientras dura: el
 * operario anota el inicio el día que ve las flores y el cierre cuando se caen, si lo anota. Tratar
 * `endsAt` nulo como «ya terminó» haría que el aviso callara justo durante la floración.
 *
 * **No autoriza**: quien la llama ya pasó su compuerta.
 */
export async function enFloracion(
  locationId: string,
  cuando: Date,
  opciones?: { db?: Prisma.TransactionClient },
): Promise<PlotBloom[]> {
  // **El paréntesis no es estilo: es lo único que el inventario de acceso sabe ver.** Su detector
  // acepta como cliente `prisma`, `aiPrisma`, `tx`, `client` y un `)` —el idiom de `lib/audit.ts`—,
  // así que una variable llamada `db` deja la consulta FUERA del inventario, y «fuera» se lee como
  // «no hay operación que explicar». Medido el 2026-10-01: con `const db = …` este archivo salía con
  // 1 operación en vez de 2, y la que faltaba era precisamente la que no autoriza.
  return (opciones?.db ?? prisma).plotBloom.findMany({
    where: {
      locationId,
      startsAt: { lte: cuando },
      OR: [{ endsAt: null }, { endsAt: { gte: cuando } }],
    },
    orderBy: { startsAt: "desc" },
  });
}

/**
 * Las ventanas de floración de una parcela, para que el navegador decida el aviso.
 *
 * **Y no de UNA ubicación: de ella, sus ascendientes y sus descendientes.** Lo encontró una
 * revisión independiente, y era un fallo real: una floración anotada en la parcela madre no llegaba
 * a una intervención sobre su microparcela, ni al revés. La contención de §D1 del diseño de la
 * rejilla dice que tratar la parcela entra todo lo de dentro, y físicamente una microparcela de una
 * parcela en floración está en floración. Se reusa `ubicacionesEmparentadas`, que existe para
 * exactamente esta forma en la carencia fitosanitaria (§3.3) y lleva la regla escrita en su
 * cabecera: la madre y la hija sí, **un hermano no**.
 *
 * **Por qué todas y no las de un instante.** `enFloracion` responde por un instante, y el instante
 * que importa es el que el operario escribe en el formulario — que puede corregir. Mandar la
 * respuesta de «ahora» dejaría el aviso equivocado en cuanto cambiara la fecha. Mandar las ventanas
 * deja la decisión en `hayFloracion`, donde está la fecha elegida.
 *
 * **Y no lleva recorte, a propósito.** Una parcela florece una o dos veces al año, así que cualquier
 * «últimos N días» sería un número inventado para acotar algo que no crece. El día que una parcela
 * tenga tantas ventanas que esto pese, será un problema medido y se acotará entonces.
 *
 * **No autoriza**: quien la llama ya pasó su compuerta sobre la parcela.
 */
export async function floracionesDeLaParcela(
  locationId: string,
  opciones?: { db?: Prisma.TransactionClient },
): Promise<VentanaDeFloracion[]> {
  // **Se llama `client`, no `db`, y eso lo decide el inventario de acceso.** Su detector acepta
  // `prisma`, `aiPrisma`, `tx`, `client` y un `)`; con `db` la consulta de abajo se vuelve invisible
  // y el archivo sale con una operación menos. Caí en ello en este mismo cambio: al meter el recorrido
  // del árbol pasé del paréntesis a un `const db`, y el inventario bajó de 599 a 598 sin que nada
  // más lo dijera. Es la trampa que este archivo ya documenta para `enFloracion`.
  const client = opciones?.db ?? prisma;
  const emparentadas = await ubicacionesEmparentadas(locationId, client);
  // **Las TRES columnas que el aviso necesita, no la fila entera.** Esto cruza al navegador como
  // prop de un componente cliente, así que sin `select` viajaban también `notes` —texto libre de la
  // observación— y `observerPersonId`, que nombra a una persona. Lo señaló una revisión: el tipo
  // `VentanaDeFloracion` declaraba tres campos y el payload llevaba siete.
  return client.plotBloom.findMany({
    where: { locationId: { in: emparentadas } },
    select: { startsAt: true, endsAt: true, plotBlockId: true },
    orderBy: { startsAt: "desc" },
  });
}
