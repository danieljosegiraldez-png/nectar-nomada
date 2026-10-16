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
import { UUID } from "../validation/uuid";

export class FloracionValidationError extends Error {}

export interface RegistrarFloracionInput {
  readonly locationId: string;
  /** El bloque, cuando se anota más fino que la parcela. Nulo = la parcela entera. */
  readonly plotBlockId?: string | null;
  /** Campo de DÍA: medianoche UTC del día que nombra, con `fechaDeDia` (lo dice el esquema). */
  readonly startsAt: Date;
  /**
   * Nulo = **todavía abierta**, que es el estado real mientras la floración dura. Se cierra después
   * con `cerrarFloracion`.
   *
   * **Es un campo de DÍA, como `startsAt`, no un instante.** Hasta el 2026-10-16 esta línea decía lo
   * contrario —«el fin del día, con `parseLocalDateTime`»—, que era lo que pedía la primera versión
   * de `floracionVigente.ts`; esa versión se corrigió para comparar DÍAS de calendario y este
   * docstring se quedó atrás. Siguiéndolo, la pantalla habría guardado las 04:59 UTC del día
   * siguiente, y el aviso habría alargado la floración un día. Manda el esquema: `fechaDeDia`.
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
  // Un id sin forma de UUID haría que Prisma lanzara P2023 —un 500— en vez de contestar «no existe»
  // (`PENDING_IMPLEMENTATIONS/026`). Ahora que hay un formulario que manda estos ids, se dice aquí.
  if (!UUID.test(input.locationId)) throw new FloracionValidationError("no existe la parcela");
  if (input.plotBlockId && !UUID.test(input.plotBlockId)) throw new FloracionValidationError("no existe el bloque");

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

export interface CerrarFloracionInput {
  readonly floracionId: string;
  /** Campo de DÍA, como `startsAt`: el último día con flores. Puede ser el mismo del inicio. */
  readonly endsAt: Date;
}

/**
 * Pone el fin a una floración **abierta** — decisión de Daniel, 2026-10-16: «anotar el inicio,
 * cerrar después», como se cierra una corrida de secado. Sin esto, una floración anotada el día que
 * se ven las flores se quedaba abierta para siempre, y su aviso con ella.
 *
 * **Sólo cierra, una vez.** No corrige un fin ya puesto ni reabre: el `updateMany` exige
 * `endsAt: null` en la misma sentencia, así que dos cierres a la vez no se pisan —el segundo no
 * encuentra fila y se rechaza—. Corregir una floración mal anotada no existe todavía, a propósito.
 *
 * Exige `lot:manage` sobre la parcela, igual que anotarla.
 */
export async function cerrarFloracion(userAccountId: string, input: CerrarFloracionInput): Promise<PlotBloom> {
  if (!UUID.test(input.floracionId)) throw new FloracionValidationError("no existe la floración");
  const floracion = await prisma.plotBloom.findUnique({ where: { id: input.floracionId } });
  if (!floracion) throw new FloracionValidationError("no existe la floración");

  await requireLotAccess(userAccountId, "manage", [
    { locationId: floracion.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION },
  ]);
  // El mismo día del inicio vale: el borde cuenta (`hayFloracion`).
  if (input.endsAt < floracion.startsAt) {
    throw new FloracionValidationError("la floración no puede terminar antes de empezar");
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.plotBloom.updateMany({
      where: { id: floracion.id, endsAt: null },
      data: { endsAt: input.endsAt },
    });
    if (count === 0) throw new FloracionValidationError("ya_cerrada");
    const cerrada = await tx.plotBloom.findUniqueOrThrow({ where: { id: floracion.id } });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "plot_bloom.close",
        entityType: "plot_bloom",
        entityId: cerrada.id,
        before: floracion,
        after: cerrada,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return cerrada;
  });
}

export interface FloracionDeLaFicha {
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  /** El nombre del bloque, o nulo cuando se anotó para la parcela entera. */
  readonly bloque: string | null;
}

/**
 * Las floraciones anotadas en ESTA parcela, para su ficha: las abiertas primero —son las que se
 * pueden cerrar— y dentro de cada grupo la más reciente arriba.
 *
 * **Sólo las propias**, no las de la madre ni las de sus microparcelas: es la lista de lo que se
 * anotó aquí y se puede cerrar aquí. El aviso sí mira las emparentadas (`floracionesDeLaParcela`).
 * **Y sólo lo que la pantalla pinta:** ni las notas ni quién la vio viajan al navegador.
 *
 * Exige `lot:view`, como la página de manejo: un operario la ve aunque no pueda ajustar la parcela.
 */
export async function floracionesDeLaFicha(userAccountId: string, locationId: string): Promise<FloracionDeLaFicha[]> {
  await requireLotAccess(userAccountId, "view", [{ locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);
  const filas = await prisma.plotBloom.findMany({
    where: { locationId },
    select: { id: true, startsAt: true, endsAt: true, plotBlock: { select: { name: true } } },
    orderBy: { startsAt: "desc" },
  });
  return [...filas.filter((f) => f.endsAt === null), ...filas.filter((f) => f.endsAt !== null)].map((f) => ({
    id: f.id,
    startsAt: f.startsAt,
    endsAt: f.endsAt,
    bloque: f.plotBlock?.name ?? null,
  }));
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
