/**
 * De la recepción a los lotes: armar un lote con cereza de una o varias recepciones, y saber de
 * qué recepciones viene un lote por lejos que esté de ellas.
 *
 * Spec: docs/superpowers/specs/2026-09-19-de-la-recepcion-a-los-lotes-design.md §3.1 y §3.2.
 * Daniel, 2026-09-19: «de una recepción se pueden correr muchos diferentes procesos, y cada uno se
 * ve como un lote».
 *
 * - **El lote nace sin proceso.** Armarlo dice de dónde sale la cereza, no qué se le va a hacer:
 *   el proceso se abre después, sobre el lote ya armado, y de una misma recepción pueden salir
 *   varios con métodos distintos.
 * - **El vínculo es de nivel 1 y es inmutable**: une una recepción con el lote que salió
 *   directamente de ella. Los lotes de más abajo no repiten el vínculo; su origen se camina.
 * - **El disponible se comprueba dentro de la transacción**, con cada recepción bloqueada en orden
 *   de id para que dos armados simultáneos no se crucen. El disparador
 *   `lote_desde_recepcion_cabe` es la red, no la regla.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { exigeGestionarBeneficio, exigeVerBeneficio } from "./pedidosDeCereza";
import { disponibleDeRecepciones } from "./recepcionesDeCereza";
import { resolveOrganizationForLocation } from "./locations";
import { Prisma } from "../../generated/prisma/client";

export class LoteDeBeneficioError extends Error {}

const a3 = (x: number) => Math.round(x * 1000) / 1000;

export interface ArmarLoteInput {
  readonly beneficioId: string;
  readonly codigo: string;
  readonly recepciones: ReadonlyArray<{ recepcionId: string; kg: number }>;
}

/** Lo que hay en el beneficio con cereza por repartir, con de dónde vino cada recepción. */
export async function recepcionesArmables(userAccountId: string, beneficioId: string) {
  await exigeVerBeneficio(userAccountId, beneficioId);
  const filas = await prisma.recepcionDeCereza.findMany({
    where: { beneficioId, estado: "recibida" },
    orderBy: { recibidaAt: "desc" },
    include: {
      entrega: { select: { recolector: { select: { displayName: true } }, jornada: { select: { fincaSite: { select: { name: true } } } } } },
      proveedor: { select: { name: true } },
    },
  });
  const disponible = await disponibleDeRecepciones(filas.map((f) => f.id));
  return filas
    .map((f) => ({
      recepcion: f,
      disponibleKg: disponible.get(f.id) ?? 0,
      pedidoId: f.pedidoId,
      origen: f.proveedor?.name ?? f.entrega?.jornada.fincaSite.name ?? "origen sin nombre",
    }))
    .filter((f) => f.disponibleKg > 0);
}

/**
 * Arma un lote de cereza con kilos de una o varias recepciones. **No abre proceso**: eso es un
 * acto posterior y distinto sobre el lote ya armado.
 */
export async function armarLote(userAccountId: string, input: ArmarLoteInput) {
  const beneficio = await exigeGestionarBeneficio(userAccountId, input.beneficioId);
  if (input.recepciones.length === 0) throw new LoteDeBeneficioError("sin_recepciones");
  const codigo = input.codigo.trim();
  if (!codigo) throw new LoteDeBeneficioError("codigo_obligatorio");
  const partes = input.recepciones.map((r) => ({ recepcionId: r.recepcionId, kg: a3(r.kg) }));
  if (partes.some((p) => !(p.kg > 0))) throw new LoteDeBeneficioError("kg_invalidos");
  if (new Set(partes.map((p) => p.recepcionId)).size !== partes.length) throw new LoteDeBeneficioError("recepcion_repetida");

  const recepciones = await prisma.recepcionDeCereza.findMany({
    where: { id: { in: partes.map((p) => p.recepcionId) } },
    select: { id: true, beneficioId: true, estado: true },
  });
  if (recepciones.length !== partes.length) throw new LoteDeBeneficioError("recepcion_no_encontrada");
  if (recepciones.some((r) => r.beneficioId !== input.beneficioId)) throw new LoteDeBeneficioError("recepcion_de_otro_beneficio");

  const organizationId = await resolveOrganizationForLocation(beneficio.id);
  if (!organizationId) throw new LoteDeBeneficioError("beneficio_sin_organizacion");
  const total = a3(partes.reduce((s, p) => s + p.kg, 0));
  // En orden de id: dos armados que compartan recepciones las toman en el mismo orden y uno espera
  // al otro, en vez de bloquearse cruzados.
  const enOrden = [...partes].sort((a, b) => (a.recepcionId < b.recepcionId ? -1 : 1));

  try {
    return await prisma.$transaction(async (tx) => {
      for (const p of enOrden) {
        await tx.$queryRaw`SELECT "id" FROM "traceability"."recepcion_de_cereza" WHERE "id" = ${p.recepcionId}::uuid FOR UPDATE`;
        const fila = await tx.recepcionDeCereza.findUniqueOrThrow({ where: { id: p.recepcionId }, select: { estado: true, netoKg: true } });
        if (fila.estado !== "recibida") throw new LoteDeBeneficioError("recepcion_no_recibida");
        const [mermas, lotes] = await Promise.all([
          tx.mermaDeRecepcion.aggregate({ where: { recepcionId: p.recepcionId, estado: "vigente" }, _sum: { kg: true } }),
          tx.loteDesdeRecepcion.aggregate({ where: { recepcionId: p.recepcionId }, _sum: { kg: true } }),
        ]);
        const disponible = Number(fila.netoKg) - Number(mermas._sum.kg ?? 0) - Number(lotes._sum.kg ?? 0);
        if (p.kg > disponible) throw new LoteDeBeneficioError("kg_sobre_lo_recibido");
      }

      const lote = await tx.lot.create({
        data: { lotCode: codigo, lotType: "cherry", organizationId, locationId: beneficio.id, createdBy: userAccountId },
      });
      for (const p of enOrden) {
        await tx.loteDesdeRecepcion.create({ data: { lotId: lote.id, recepcionId: p.recepcionId, kg: p.kg, createdBy: userAccountId } });
      }
      // El libro de cantidad del lote empieza aquí: lo que entró, de dónde salió y cuándo.
      await tx.quantityEvent.create({
        data: {
          lotId: lote.id, eventType: "received", quantity: total, unit: "kg", occurredAt: new Date(),
          createdBy: userAccountId, provenanceClass: "measured_fact",
          sourceReference: `recepciones: ${enOrden.map((p) => p.recepcionId).join(", ")}`,
        },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "lot.assembled_from_receptions",
          entityType: "lot",
          entityId: lote.id,
          after: { lote, partes: enOrden, totalKg: total },
          sourceInterface: "traceability.service",
        },
        tx,
      );
      return lote;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new LoteDeBeneficioError("codigo_repetido");
    throw error;
  }
}

/**
 * De qué recepciones viene un lote, por lejos que esté de ellas.
 *
 * Si el lote tiene vínculos, son su origen. Si no, se sube por `LotTransformation` —de salida a
 * entrada— hasta los lotes que sí los tengan. **Un lote de nivel 1 ya visto no se vuelve a
 * contar**: eso es lo que impide contar dos veces una recepción cuando dos ramas de un mismo lote
 * se fusionan más abajo.
 *
 * **Sin principal**: su llamador ya autorizó el lote. Va en `dependen_del_llamador`.
 */
export async function origenDelLote(lotId: string): Promise<Array<{ recepcionId: string; kg: number; nivel1LotId: string }>> {
  const origen: Array<{ recepcionId: string; kg: number; nivel1LotId: string }> = [];
  const nivel1 = new Set<string>();
  const vistos = new Set<string>([lotId]);
  let frontera = [lotId];

  while (frontera.length > 0) {
    const vinculos = await prisma.loteDesdeRecepcion.findMany({
      where: { lotId: { in: frontera } },
      select: { lotId: true, recepcionId: true, kg: true },
      orderBy: { createdAt: "asc" },
    });
    for (const v of vinculos) {
      if (nivel1.has(v.lotId)) continue;
      origen.push({ recepcionId: v.recepcionId, kg: Number(v.kg), nivel1LotId: v.lotId });
    }
    for (const v of vinculos) nivel1.add(v.lotId);

    // Sólo se sigue subiendo por los lotes de la frontera que NO son de nivel 1: uno que ya tiene
    // vínculo es el final de su rama.
    const seguir = frontera.filter((id) => !nivel1.has(id));
    const entradas = seguir.length
      ? await prisma.lotTransformationInput.findMany({
          where: { transformation: { outputs: { some: { lotId: { in: seguir } } } } },
          select: { lotId: true },
        })
      : [];
    frontera = [...new Set(entradas.map((e) => e.lotId))].filter((id) => !vistos.has(id));
    for (const id of frontera) vistos.add(id);
  }
  return origen;
}
