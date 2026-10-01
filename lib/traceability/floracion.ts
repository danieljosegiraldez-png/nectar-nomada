/**
 * La floración de una parcela — decisión de Daniel, 2026-10-01: «parcela, microparcela o bloque».
 *
 * **Para qué existe.** Las fuentes de la región dicen que no se asperja durante la floración «con
 * el fin de proteger la fauna benéfica, especialmente las abejas nativas y otros polinizadores»
 * (`docs/dominio/broca-manejo-recomendaciones.md`). En una operación que además tiene apiarios y
 * meliponarios, eso no es un riesgo ambiental genérico: es un daño a su propia producción de miel.
 * Sin un sitio donde anotar la floración no hay forma de decirlo.
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

export class FloracionValidationError extends Error {}

export interface RegistrarFloracionInput {
  readonly locationId: string;
  /** El bloque, cuando se anota más fino que la parcela. Nulo = la parcela entera. */
  readonly plotBlockId?: string | null;
  readonly startsAt: Date;
  /** Nulo = **todavía abierta**, que es el estado real mientras la floración dura. */
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
