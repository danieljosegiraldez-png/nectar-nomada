import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireApiaryAccess } from "./hives";
import type { DataQuality, ProvenanceClass } from "../../generated/prisma/client";

/**
 * A9.9 (D6) — el compromiso de polinización y su cociente.
 *
 * «Es una tabla y un cociente, y es el único número que convierte la
 * conversación con el cliente en algo que no sea una impresión.» 17 ha a 4-6
 * colmenas/ha son 68-102 colonias contra las 3 que hay.
 *
 * ## De dónde sale el numerador, y por qué se dice
 *
 * D6 avisa de una trampa concreta: contar filas `Colony` con `status = active`
 * da **el conteo del sistema, no el de la visita**, y en Toabré esos dos números
 * llevan divergiendo desde diciembre. El bueno es el que alguien contó al salir
 * del sitio.
 *
 * Ese conteo declarado ya existe: `FieldSession.coloniesAliveCount`, que entró
 * con A9.8 (#233). **Esta función todavía no lo usa**, y decirlo importa más
 * que arreglarlo a la carrera: el declarado sólo existe para sitios que hayan
 * cerrado una visita desde que A9.8 aterrizó, así que preferirlo sin más
 * dejaría a los demás sin cifra en vez de con una peor. La decisión de cuándo
 * se prefiere uno u otro —y qué se enseña cuando falta el bueno— es un ticket
 * propio, no una línea.
 *
 * Mientras tanto se cuenta del sistema **y se dice que es del sistema**:
 * `fuenteDelConteo` viaja con la cifra hasta la pantalla, en vez de presentar un
 * número sin decir de dónde salió. El tipo ya tiene sitio para la otra
 * respuesta, así que conectarla no cambia ninguna firma.
 *
 * ## Por qué el déficit es un rango
 *
 * El objetivo que declaró el dueño es «4-6 colmenas/ha». Colapsarlo a un número
 * obligaría a elegir uno e inventar una precisión que nadie dio. El déficit sale
 * como par —lo que falta para el mínimo y para el máximo— y la pantalla enseña
 * los dos.
 */

export class PolinizacionValidationError extends Error {}

export interface CrearCompromisoInput {
  locationId: string;
  clientOrganizationId: string;
  committedHectares: number;
  targetHivesPerHectareMin: number;
  targetHivesPerHectareMax: number;
  contractReference?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  notes?: string | null;
  dataQuality?: DataQuality | null;
}

/**
 * Un compromiso es lo que alguien pactó y transcribió: `original_record`, no
 * `measured_fact`. Fijado aquí y no elegible por quien llama, misma disciplina
 * que el resto de escrituras con procedencia (ADR-038).
 */
const PROCEDENCIA_DEL_COMPROMISO: ProvenanceClass = "original_record";

export async function crearCompromisoDePolinizacion(userAccountId: string, input: CrearCompromisoInput) {
  // Cada candidato concreto, no sólo el sitio. Un compromiso se puede alcanzar
  // por una asignación de ubicación contra el apiario mismo, o por una de
  // proyecto contra cualquier `Hive` que esté puesta ahí — la misma disciplina
  // que `getApiaryDetail` ya aplica, y la razón por la que un operador con
  // ámbito de proyecto puede trabajar el sitio.
  //
  // Escrito así tras verlo fallar: con sólo `{ locationId }`, un Farm Operator
  // con ámbito de proyecto —que es el caso normal— no podía comprometer las
  // colonias que él mismo instaló.
  const colmenas = await prisma.hive.findMany({
    where: { locationId: input.locationId },
    select: { projectId: true, locationId: true },
  });
  await requireApiaryAccess(userAccountId, "manage", [{ locationId: input.locationId }, ...colmenas]);

  if (input.committedHectares <= 0) throw new PolinizacionValidationError("hectareas_no_positivas");
  // Un rango invertido produciría un déficit mínimo mayor que el máximo, que se
  // lee como un error de cálculo en vez de como lo que es: un dato mal escrito.
  if (input.targetHivesPerHectareMin > input.targetHivesPerHectareMax) {
    throw new PolinizacionValidationError("rango_invertido");
  }
  if (input.targetHivesPerHectareMin <= 0) throw new PolinizacionValidationError("densidad_no_positiva");
  if (input.endsAt && input.endsAt < input.startsAt) throw new PolinizacionValidationError("ventana_invertida");

  return prisma.$transaction(async (tx) => {
    const compromiso = await tx.pollinationCommitment.create({
      data: {
        locationId: input.locationId,
        clientOrganizationId: input.clientOrganizationId,
        committedHectares: input.committedHectares,
        targetHivesPerHectareMin: input.targetHivesPerHectareMin,
        targetHivesPerHectareMax: input.targetHivesPerHectareMax,
        contractReference: input.contractReference ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        notes: input.notes ?? null,
        provenanceClass: PROCEDENCIA_DEL_COMPROMISO,
        dataQuality: input.dataQuality ?? null,
        createdBy: userAccountId,
      },
    });

    // Escritura con valor probatorio: lo que se le prometió a un cliente y
    // cuándo. Se confirma en la misma transacción que el compromiso.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "pollination_commitment.create",
        entityType: "pollination_commitment",
        entityId: compromiso.id,
        after: compromiso,
        sourceInterface: "apiary.service",
      },
      tx,
    );

    return compromiso;
  });
}

export type FuenteDelConteo = "sistema" | "declarado_en_visita";

export interface DensidadDePolinizacion {
  compromisoId: string;
  clientOrganizationId: string;
  contractReference: string | null;
  hectareasComprometidas: number;
  objetivoMin: number;
  objetivoMax: number;
  colonias: number;
  /** De dónde salió `colonias`. Viaja con la cifra a propósito. */
  fuenteDelConteo: FuenteDelConteo;
  /** Colonias por hectárea, ahora mismo. */
  densidad: number;
  /** Cuántas colonias faltan para el mínimo y para el máximo. Cero si sobran. */
  deficitParaMin: number;
  deficitParaMax: number;
}

/**
 * Los compromisos VIGENTES de un sitio, con su cociente. No autoriza: recibe un
 * `locationId` que quien llama ya obtuvo de `getApiaryDetail`, que sí autoriza —
 * misma disciplina que `vitalesDeSitios` y `leerEnmiendas`.
 *
 * «Vigente» es contra `ahora`, no contra la fecha de hoy leída dentro: así una
 * prueba puede fijar el reloj y este código no tiene dos comportamientos.
 */
export async function densidadDePolinizacion(locationId: string, ahora = new Date()): Promise<DensidadDePolinizacion[]> {
  const [compromisos, colonias] = await Promise.all([
    prisma.pollinationCommitment.findMany({
      where: {
        locationId,
        startsAt: { lte: ahora },
        OR: [{ endsAt: null }, { endsAt: { gte: ahora } }],
      },
      orderBy: { startsAt: "desc" },
    }),
    prisma.colony.count({ where: { status: "active", hive: { locationId } } }),
  ]);

  return compromisos.map((c) => {
    const hectareas = Number(c.committedHectares);
    const min = Number(c.targetHivesPerHectareMin);
    const max = Number(c.targetHivesPerHectareMax);
    return {
      compromisoId: c.id,
      clientOrganizationId: c.clientOrganizationId,
      contractReference: c.contractReference,
      hectareasComprometidas: hectareas,
      objetivoMin: min,
      objetivoMax: max,
      colonias,
      fuenteDelConteo: "sistema",
      densidad: colonias / hectareas,
      // `Math.ceil` porque media colonia no existe: para llegar a 68,2 hacen
      // falta 69 cajas pobladas, no 68.
      deficitParaMin: Math.max(0, Math.ceil(hectareas * min) - colonias),
      deficitParaMax: Math.max(0, Math.ceil(hectareas * max) - colonias),
    };
  });
}
