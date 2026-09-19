/**
 * La cera que sale al DESOPERCULAR — spec docs/superpowers/specs/2026-09-19-cera-y-pesada-por-recipiente-design.md §4.3.
 *
 * **No sale de un lote.** Se desopercula junto, así que no se sabe de qué alza ni de qué colmena
 * vino, y no se inventa: su origen es **el apiario y una ventana de fechas**. Daniel, el
 * 2026-09-19: *«quiero saber que esa cera vino de tal apiario por lo menos, de tal cosecha, aunque
 * no sepa cuál alza o colmena … trazabilidad al lugar y tiempo aproximado»*.
 *
 * Al leerla se dicen **las cosechas de ese apiario que caen en la ventana**, y se dicen como lo que
 * son —cosechas de este apiario entre estas fechas—, no como «esta cera salió de estas colmenas».
 *
 * Vive en `ByproductBatch`, la misma tabla que la cascarilla del café: la cera **no es merma**
 * (§4.2). La del colado cuelga de su transformación y la escribe `mielDelLote.ts`.
 *
 * Permiso: `apiary:manage` para anotar, `apiary:view` para leer, sobre el apiario.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { validarMasaDeSubproducto } from "../traceability/subproductos";
import type { ByproductDestination } from "../../generated/prisma/client";

export class CeraDeExtraccionInvalida extends Error {}

/**
 * Los cuatro destinos que Daniel pidió el 2026-09-19: fundirla para lámina propia, venderla,
 * guardarla, u otro uso. `SALE` ya existía para «se vende».
 */
export const DESTINOS_DE_CERA_DE_EXTRACCION: readonly ByproductDestination[] = ["LAMINA_PROPIA", "SALE", "GUARDADA", "OTRO"];

/** El apiario con su finca, y el permiso ya comprobado. Igual que `fincaDe` en `cera.ts`. */
async function fincaDelApiario(userAccountId: string, locationId: string, accion: "manage" | "view") {
  const sitio = await prisma.location.findUnique({ where: { id: locationId }, select: { organizationId: true } });
  if (!sitio) throw new ApiaryAccessError("location_not_found");
  await requireApiaryAccess(userAccountId, accion, [{ locationId }]);
  // La tabla exige organización: es de quién es la cera, no un adorno.
  if (!sitio.organizationId) throw new CeraDeExtraccionInvalida("sitio_sin_finca");
  return sitio.organizationId;
}

export async function anotarCeraDeExtraccion(
  userAccountId: string,
  input: {
    apiaryLocationId: string;
    /** Kilos. Cero es un dato —se desoperculó y no se recogió nada aprovechable—; negativo no. */
    massKg: number | string;
    destination: ByproductDestination;
    /** El día en que empezó la extracción y el día en que terminó. */
    windowStart: Date;
    windowEnd: Date;
    notes?: string | null;
  },
) {
  const organizationId = await fincaDelApiario(userAccountId, input.apiaryLocationId, "manage");
  // Un campo en blanco es un dato que falta, no un cero: `Number("")` es 0 y eso ya costó un
  // arreglo en la pesada por recipiente (ADR-177, revisión de Codex).
  const massKg = typeof input.massKg === "number" ? input.massKg : Number(String(input.massKg).trim() === "" ? NaN : input.massKg);
  validarMasaDeSubproducto(massKg);
  if (!(input.windowStart <= input.windowEnd)) throw new CeraDeExtraccionInvalida("ventana_al_reves");
  const notes = input.notes?.trim() || null;
  // La base lo exige también (CHECK `byproduct_batch_otro_dice_por_que`); aquí se dice con nombre.
  if (input.destination === "OTRO" && !notes) throw new CeraDeExtraccionInvalida("otro_sin_nota");

  return prisma.$transaction(async (tx) => {
    const fila = await tx.byproductBatch.create({
      data: {
        byproductType: "CERA",
        destination: input.destination,
        massKg,
        // Sin transformación, con ventana: el otro origen que el CHECK permite.
        transformationId: null,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        producedAtLocationId: input.apiaryLocationId,
        organizationId,
        notes,
        provenanceClass: "measured_fact",
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "byproduct_batch.create",
        entityType: "byproduct_batch",
        entityId: fila.id,
        after: fila,
        sourceInterface: "apiary.ceraDeExtraccion",
      },
      tx,
    );
    return fila;
  });
}

export interface FilaDeCeraDeExtraccion {
  id: string;
  massKg: number;
  destination: ByproductDestination;
  windowStart: Date;
  windowEnd: Date;
  notes: string | null;
  /** Las cosechas de ESTE apiario cuya fecha cae en la ventana. No se afirma que la cera salga de ellas. */
  cosechas: { id: string; lotCode: string; occurredAt: Date; hiveIdentifier: string }[];
}

export async function ceraDeExtraccionDelApiario(userAccountId: string, apiaryLocationId: string): Promise<FilaDeCeraDeExtraccion[]> {
  await fincaDelApiario(userAccountId, apiaryLocationId, "view");
  const filas = await prisma.byproductBatch.findMany({
    // `transformationId: null` es lo que distingue la cera del desopercular de la del colado, que
    // se lee desde su lote.
    where: { byproductType: "CERA", transformationId: null, producedAtLocationId: apiaryLocationId },
    orderBy: [{ windowStart: "desc" }, { createdAt: "desc" }],
  });

  return Promise.all(
    filas.map(async (f) => {
      const windowStart = f.windowStart!;
      const windowEnd = f.windowEnd!;
      const cosechas = await prisma.apiaryHarvestEvent.findMany({
        // Los dos extremos incluidos: la extracción de un día es de ese día.
        where: { occurredAt: { gte: windowStart, lte: windowEnd }, colony: { hive: { locationId: apiaryLocationId } } },
        select: {
          id: true,
          occurredAt: true,
          resultingLot: { select: { lotCode: true } },
          colony: { select: { hive: { select: { identifier: true } } } },
        },
        orderBy: { occurredAt: "asc" },
      });
      return {
        id: f.id,
        massKg: Number(f.massKg),
        destination: f.destination,
        windowStart,
        windowEnd,
        notes: f.notes,
        cosechas: cosechas.map((c) => ({ id: c.id, lotCode: c.resultingLot.lotCode, occurredAt: c.occurredAt, hiveIdentifier: c.colony.hive.identifier })),
      };
    }),
  );
}
