import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireApiaryAccess } from "./hives";
import { vitalesDeSitios } from "./vitalesDelSitio";
import { coloniasDelCociente } from "./coloniasDelCociente";
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
 * **Ese conteo declarado manda cuando existe** (`FieldSession.coloniesAliveCount`,
 * de A9.8). Cuando no —un sitio que aún no ha cerrado una visita con conteo— se
 * usa el del sistema, porque una cifra peor es mejor que ninguna en una
 * conversación que ya está ocurriendo.
 *
 * **Y el que no manda NO se tira.** Los dos viajan hasta la pantalla, con
 * `fuenteDelConteo` diciendo cuál entró en el cociente y `divergen` diciendo si
 * no coinciden. Esconder la diferencia detrás de un solo número sería perder la
 * señal más útil que hay sobre el sitio: que llevan meses separándose.
 *
 * La regla de «cuál es el conteo declarado» **no se repite aquí**: se reutiliza
 * `vitalesDeSitios`. Dos pantallas resolviéndolo por su cuenta terminan diciendo
 * números distintos del mismo sitio, y éste se le enseña a un cliente.
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
  /**
   * Qué se poliniza y dónde, y cuándo florece. Las columnas existen desde ADR-130 y la alerta de
   * floración (`avisoDeFloracion`) las lee; hasta el 2026-10-14 esta entrada no las aceptaba, así que
   * un compromiso nacía sin floración y la alerta no podía avisar nunca (ADR-200 §6).
   */
  crop?: string | null;
  parcelReference?: string | null;
  bloomStartsAt?: Date | null;
  bloomEndsAt?: Date | null;
}

/**
 * **La procedencia la fija el servicio a partir del dato, y no la elige quien llama** (ADR-038;
 * ADR-200 §6, decisión 12b de Daniel, 2026-10-16). Sin referencia de contrato, el compromiso es la
 * meta de trabajo que propuso Néctar —`recommendation`—, como el de Kiva hoy. Con referencia, es lo
 * que alguien pactó y transcribió —`original_record`—. Hasta esa decisión era siempre
 * `original_record`, que afirmaba un pacto que no existía. Así un pacto futuro queda como pacto sin
 * tocar nada.
 */
export function procedenciaDelCompromiso(contractReference: string | null | undefined): ProvenanceClass {
  return contractReference?.trim() ? "original_record" : "recommendation";
}

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

  // **Se compara lo que va a guardar la base, no el número de JS**: el área es numeric(10,4) y la meta
  // por hectárea numeric(6,2). Hasta el 2026-11-14 un área de 0,00004 pasaba el «> 0» y se guardaba
  // como 0 —la ficha dividía por cero—, y una meta de 10 000 desbordaba la columna con un error de
  // Postgres que nadie traduce. `!(x > 0)` rechaza también un NaN.
  const comoEnLaColumna = (x: number, decimales: number) => Math.round(x * 10 ** decimales) / 10 ** decimales;
  if (!(comoEnLaColumna(input.committedHectares, 4) > 0)) throw new PolinizacionValidationError("hectareas_no_positivas");
  // Un rango invertido produciría un déficit mínimo mayor que el máximo, que se
  // lee como un error de cálculo en vez de como lo que es: un dato mal escrito.
  if (input.targetHivesPerHectareMin > input.targetHivesPerHectareMax) {
    throw new PolinizacionValidationError("rango_invertido");
  }
  if (!(comoEnLaColumna(input.targetHivesPerHectareMin, 2) > 0)) throw new PolinizacionValidationError("densidad_no_positiva");
  // El máximo basta: el mínimo no puede pasarlo (rango_invertido, arriba).
  if (input.committedHectares >= 1_000_000 || input.targetHivesPerHectareMax >= 10_000) {
    throw new PolinizacionValidationError("cifra_demasiado_grande");
  }
  if (input.endsAt && input.endsAt < input.startsAt) throw new PolinizacionValidationError("ventana_invertida");
  // La misma regla que el CHECK de la base, dicha antes y con su código: el CHECK la rechazaría con
  // un error de Postgres que nadie traduce.
  if (input.bloomStartsAt && input.bloomEndsAt && input.bloomEndsAt < input.bloomStartsAt) {
    throw new PolinizacionValidationError("floracion_invertida");
  }

  return prisma.$transaction(async (tx) => {
    const compromiso = await tx.pollinationCommitment.create({
      data: {
        locationId: input.locationId,
        clientOrganizationId: input.clientOrganizationId,
        committedHectares: input.committedHectares,
        targetHivesPerHectareMin: input.targetHivesPerHectareMin,
        targetHivesPerHectareMax: input.targetHivesPerHectareMax,
        contractReference: input.contractReference?.trim() || null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        notes: input.notes ?? null,
        crop: input.crop?.trim() || null,
        parcelReference: input.parcelReference?.trim() || null,
        bloomStartsAt: input.bloomStartsAt ?? null,
        bloomEndsAt: input.bloomEndsAt ?? null,
        provenanceClass: procedenciaDelCompromiso(input.contractReference),
        dataQuality: input.dataQuality ?? null,
        createdBy: userAccountId,
      },
    });

    // Escritura con valor probatorio: qué meta se abrió para qué cliente, y cuándo. Si es un pacto
    // o una propuesta lo dice su procedencia, no este evento. Se confirma en la misma transacción.
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
  /** El número que entra en el cociente. */
  colonias: number;
  /** De dónde salió `colonias`. Viaja con la cifra a propósito. */
  fuenteDelConteo: FuenteDelConteo;
  /** Filas `Colony` activas ahora mismo. Se devuelve SIEMPRE, aunque no sea el que manda. */
  coloniasDelSistema: number;
  /** Lo que alguien contó al salir del sitio, y cuándo. `null` si nunca se contó. */
  coloniasDeclaradas: number | null;
  fechaDelConteoDeclarado: Date | null;
  /**
   * Los dos números existen y no coinciden. **No es un error: es el dato.** D6
   * dice que en Toabré llevan divergiendo desde diciembre, y esconder eso detrás
   * de una sola cifra es perder la señal más útil que hay sobre el sitio.
   */
  divergen: boolean;
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
  const [compromisos, coloniasDelSistema, vitales] = await Promise.all([
    prisma.pollinationCommitment.findMany({
      where: {
        locationId,
        startsAt: { lte: ahora },
        OR: [{ endsAt: null }, { endsAt: { gte: ahora } }],
      },
      orderBy: { startsAt: "desc" },
    }),
    prisma.colony.count({ where: { status: "active", hive: { locationId } } }),
    // Se REUTILIZA `vitalesDeSitios` en vez de repetir aquí la regla de «cuál es
    // el conteo declarado». Si cada pantalla lo resolviera por su cuenta, un día
    // dirían números distintos del mismo sitio — y éste es un número que se le
    // enseña a un cliente. Cuesta tres consultas de más en una página de detalle.
    vitalesDeSitios([locationId], ahora),
  ]);

  const v = vitales.get(locationId) ?? null;
  const coloniasDeclaradas = v?.coloniasVivasDeclaradas ?? null;
  // El declarado manda cuando existe: D6 dice que el del sistema «es el conteo
  // del sistema, no el de la visita». Pero el otro no se tira — se devuelve al
  // lado, para que la divergencia se vea en vez de desaparecer.
  const colonias = coloniasDelCociente(coloniasDeclaradas, coloniasDelSistema);

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
      fuenteDelConteo: (coloniasDeclaradas === null ? "sistema" : "declarado_en_visita") as FuenteDelConteo,
      coloniasDelSistema,
      coloniasDeclaradas,
      fechaDelConteoDeclarado: v?.fechaDelConteoDeclarado ?? null,
      divergen: coloniasDeclaradas !== null && coloniasDeclaradas !== coloniasDelSistema,
      densidad: colonias / hectareas,
      // `Math.ceil` porque media colonia no existe: para llegar a 68,2 hacen
      // falta 69 cajas pobladas, no 68.
      deficitParaMin: Math.max(0, Math.ceil(hectareas * min) - colonias),
      deficitParaMax: Math.max(0, Math.ceil(hectareas * max) - colonias),
    };
  });
}
