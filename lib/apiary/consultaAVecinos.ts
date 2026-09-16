/**
 * La consulta mensual a las fincas vecinas: registrarla, leerla, y saber cuándo toca.
 *
 * **Qué cierra.** `48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md`, tres sitios a la vez:
 *
 * - **§4**, el formulario: *«Finca, cultivo, aplicación prevista y fecha, quién informó. Es
 *   protocolo mensual, no una nota, y el sistema lo reclama solo.»*
 * - **§3**, la alerta del sitio: «Consulta a vecinos vence en 3 días».
 * - **§8**, la mitad del aviso de traslado que hasta hoy decía que **nadie ha preguntado**.
 *   Esa línea era honesta y ahora deja de ser necesaria.
 *
 * **El hueco, medido el 2026-09-14 antes de escribir nada.** Cero coincidencias de
 * `vecin|neighbour|aspersi|spray|pesticid|agroquim` en el esquema y en `lib/apiary/`, con
 * `carencia|Withdrawal` dando diez como control positivo. Lo único que existía era la
 * **consecuencia**: `lib/research/catalogs.ts` tiene «Intoxicación por agroquímicos» como
 * causa de pérdida y su nota dice que *«en Panamá la literatura la asocia a la deriva de
 * aplicaciones vecinas»*. El sistema sabía registrar la colonia muerta y no el aviso que la
 * habría salvado.
 *
 * ## Las dos invariantes viven en la BASE, no aquí
 *
 * `neighbour_consultation` lleva dos `CHECK`: una fecha de aplicación existe exactamente
 * cuando el resultado es `aplicacion_prevista`, y una consulta que ocurrió dice quién
 * informó. Este módulo las comprueba **también**, y no es redundancia inútil: el `CHECK`
 * protege a la base de un importador o de SQL directo, y la comprobación de aquí devuelve
 * un error con nombre de dominio en vez de un error de Postgres que ninguna pantalla sabe
 * traducir. Probado que los `CHECK` disparan de verdad —tres rechazos y dos aceptaciones,
 * con control positivo— y está en ADR-127.
 */
import { prisma } from "../db";
import { esSitioDeAbejas } from "./sitioDeAbejas";
import type { DataQuality, ProvenanceClass } from "../../generated/prisma/client";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { recordAuditEvent } from "../audit";
import {
  ConsultaInvalida,
  clasificarConsulta,
  diasHastaLaProximaConsulta,
  exigeResultadoDeConsulta,
  type EstadoDeConsulta,
  type ResultadoDeConsulta,
} from "./vocabularioDeConsulta";

export { ConsultaInvalida } from "./vocabularioDeConsulta";

export interface RegistrarConsultaInput {
  locationId: string;
  neighbourOrganizationId: string;
  /** Día de la consulta. Se parsea con `fechaDeDia`. */
  occurredAt: Date;
  outcome: string;
  crop?: string | null;
  /** Día de la aplicación. Obligatoria si y sólo si hay aplicación prevista. */
  plannedApplicationAt?: Date | null;
  informantName?: string | null;
  operatorPersonId?: string | null;
  note?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

/**
 * Registra una consulta a una finca vecina.
 *
 * **Autoriza sobre el apiario**, con su proyecto y su ubicación —los dos objetivos, como
 * `createHive`—, porque la consulta es un hecho del sitio y no del vecino.
 */
export async function registrarConsultaAVecinos(userAccountId: string, input: RegistrarConsultaInput) {
  const sitio = await prisma.location.findUnique({
    where: { id: input.locationId },
    select: { id: true, locationType: true, hives: { select: { projectId: true }, take: 1 } },
  });
  if (!sitio) throw new ApiaryAccessError("location_not_found");
  if (!esSitioDeAbejas(sitio.locationType)) throw new ConsultaInvalida("no_es_apiario");
  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: sitio.hives[0]?.projectId ?? null, locationId: sitio.id },
  ]);

  const vecino = await prisma.organization.findUnique({
    where: { id: input.neighbourOrganizationId },
    select: { id: true },
  });
  if (!vecino) throw new ConsultaInvalida("vecino_no_encontrado");

  const outcome = exigeResultadoDeConsulta(input.outcome);
  const hayAplicacion = outcome === "aplicacion_prevista";
  const seConsulto = outcome !== "no_se_pudo_consultar";

  // Las mismas dos reglas que los `CHECK` de la tabla, con nombre de dominio.
  if (hayAplicacion && !input.plannedApplicationAt) throw new ConsultaInvalida("fecha_de_aplicacion_requerida");
  if (!hayAplicacion && input.plannedApplicationAt) throw new ConsultaInvalida("fecha_de_aplicacion_sin_aplicacion");
  const informantName = input.informantName?.trim() || null;
  if (seConsulto && !informantName) throw new ConsultaInvalida("informante_requerido");

  // Una aplicación prevista ANTES de la consulta no es una previsión, es una que ya pasó —
  // y avisar de ella haría que el traslado gritara sobre algo terminado.
  if (input.plannedApplicationAt && input.plannedApplicationAt < input.occurredAt) {
    throw new ConsultaInvalida("aplicacion_anterior_a_la_consulta");
  }

  return prisma.$transaction(async (tx) => {
    const fila = await tx.neighbourConsultation.create({
      data: {
        locationId: input.locationId,
        neighbourOrganizationId: input.neighbourOrganizationId,
        occurredAt: input.occurredAt,
        outcome,
        crop: input.crop?.trim() || null,
        plannedApplicationAt: hayAplicacion ? input.plannedApplicationAt! : null,
        informantName,
        operatorPersonId: input.operatorPersonId ?? null,
        note: input.note?.trim() || null,
        provenanceClass: input.provenanceClass,
        dataQuality: input.dataQuality ?? null,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "neighbour_consultation.record",
        entityType: "neighbour_consultation",
        entityId: fila.id,
        after: fila,
        sourceInterface: "apiary.service",
      },
      tx,
    );
    return fila;
  });
}

export interface EstadoDelProtocolo {
  locationId: string;
  /** La consulta más reciente del sitio, de cualquier vecino. */
  ultimaConsulta: Date | null;
  estado: EstadoDeConsulta;
  /** Días que faltan; negativo = venció hace tantos. `null` si nunca se consultó. */
  diasQueFaltan: number | null;
}

/**
 * En qué estado está el protocolo mensual de un sitio.
 *
 * **La cadencia se mide desde la consulta más reciente del SITIO, no por vecino.** El Anexo
 * pide «protocolo mensual» del apiario; exigir un mes por cada vecino multiplicaría el
 * aviso por el número de fincas colindantes y haría que un sitio con cuatro vecinos
 * estuviera permanentemente en rojo. Cuál vecino toca es decisión de quien va, y la lista
 * por vecino la da `consultasDeSitio`.
 *
 * **No autoriza y no pide principal**, misma disciplina que `vitalesDeSitios` y
 * `carenciasVigentes`: quien llama ya obtuvo el sitio de una lectura que sí autoriza.
 */
export async function estadoDelProtocolo(locationId: string, ahora = new Date()): Promise<EstadoDelProtocolo> {
  const ultima = await prisma.neighbourConsultation.findFirst({
    where: { locationId },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  const ultimaConsulta = ultima?.occurredAt ?? null;
  return {
    locationId,
    ultimaConsulta,
    estado: clasificarConsulta(ultimaConsulta, ahora),
    diasQueFaltan: ultimaConsulta ? diasHastaLaProximaConsulta(ultimaConsulta, ahora) : null,
  };
}

export interface AplicacionPrevista {
  consultationId: string;
  locationId: string;
  vecino: string;
  crop: string | null;
  plannedApplicationAt: Date;
  /** Días hasta la aplicación. Negativo = ya pasó. */
  diasQueFaltan: number;
  informantName: string | null;
  consultadoEl: Date;
}

const DIA = 86_400_000;

/**
 * Las aplicaciones previstas que **todavía no han ocurrido** en unos sitios.
 *
 * **Es la mitad del aviso del §8 que faltaba.** Hasta hoy `avisosDeDestino` devolvía
 * `aspersionesConsultadas: false` porque no había de dónde sacar el dato; ahora lo hay, y
 * el traslado puede decir *«el destino tiene una aspersión anunciada en tres días»*, que es
 * el error que —en palabras del Anexo— «este módulo existe para evitar».
 *
 * Una consulta por lista de sitios, no una por sitio: la pantalla del traslado las pide
 * todas a la vez.
 */
export async function aplicacionesPrevistas(
  locationIds: string[],
  ahora = new Date(),
  dentroDeDias = 30,
): Promise<AplicacionPrevista[]> {
  if (locationIds.length === 0) return [];
  const hasta = new Date(ahora.getTime() + dentroDeDias * DIA);
  const filas = await prisma.neighbourConsultation.findMany({
    where: {
      locationId: { in: locationIds },
      outcome: "aplicacion_prevista",
      // Sólo lo que está por venir dentro de la ventana. Una aplicación de marzo no
      // advierte de nada en septiembre, y avisar de ella enseñaría a ignorar el aviso.
      plannedApplicationAt: { gte: ahora, lte: hasta },
    },
    orderBy: { plannedApplicationAt: "asc" },
    select: {
      id: true,
      locationId: true,
      crop: true,
      plannedApplicationAt: true,
      informantName: true,
      occurredAt: true,
      neighbourOrganization: { select: { name: true } },
    },
  });
  return filas.map((f) => ({
    consultationId: f.id,
    locationId: f.locationId,
    vecino: f.neighbourOrganization.name,
    crop: f.crop,
    plannedApplicationAt: f.plannedApplicationAt!,
    diasQueFaltan: Math.ceil((f.plannedApplicationAt!.getTime() - ahora.getTime()) / DIA),
    informantName: f.informantName,
    consultadoEl: f.occurredAt,
  }));
}

/**
 * Las organizaciones que el formulario puede ofrecer como finca vecina de un apiario.
 *
 * **No se reusa `organizacionesParaApiario`, y la razón es una trampa que casi me come.**
 * Esa función devuelve `[]` salvo cuando la visibilidad es `"all"`, y con motivo: sirve
 * para elegir bajo qué finca se cuelga un apiario nuevo, y `crearApiario` rechaza lo
 * demás — su propio comentario lo explica, «un formulario que ofrece lo que el servicio
 * niega».
 *
 * **Aquí la asimetría va al revés.** `registrarConsultaAVecinos` autoriza sobre **el
 * apiario**, no sobre la organización vecina: no hay nada que autorizar en «a quién le
 * pregunté». Reusar aquella función habría dado un desplegable **vacío precisamente al
 * Farm Operator con ámbito de proyecto**, que es quien hace el trabajo de campo — un
 * formulario que niega lo que el servicio permite, que es el mismo defecto por el otro
 * lado.
 *
 * Así que esto autoriza sobre el sitio y después ofrece las organizaciones aprobadas. **No
 * filtra por `organizationType`**: un vecino puede estar registrado como `farm`, `estate` o
 * `producer`, y decidir por él cuál cuenta como «finca» sería inventar una regla que nadie
 * pidió.
 */
export async function vecinosOfrecidos(userAccountId: string, locationId: string) {
  const sitio = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, locationType: true, hives: { select: { projectId: true }, take: 1 } },
  });
  if (!sitio || !esSitioDeAbejas(sitio.locationType)) return [];
  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: sitio.hives[0]?.projectId ?? null, locationId: sitio.id },
  ]);
  return prisma.organization.findMany({
    where: { status: "approved" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Las consultas de un sitio, de la más reciente a la más vieja. */
export async function consultasDeSitio(locationId: string, limite = 20) {
  return prisma.neighbourConsultation.findMany({
    where: { locationId },
    orderBy: { occurredAt: "desc" },
    take: limite,
    select: {
      id: true,
      occurredAt: true,
      outcome: true,
      crop: true,
      plannedApplicationAt: true,
      informantName: true,
      note: true,
      neighbourOrganization: { select: { id: true, name: true } },
      operator: { select: { displayName: true } },
    },
  });
}

/**
 * Los vecinos que ya se han consultado en un sitio, para que el formulario los ofrezca
 * primero. **No es una lista de «vecinos del apiario»**, porque el sistema no modela
 * colindancia: es «a quién se le ha preguntado aquí», que es lo que hay.
 */
export async function vecinosConsultados(locationId: string) {
  const filas = await prisma.neighbourConsultation.findMany({
    where: { locationId },
    distinct: ["neighbourOrganizationId"],
    orderBy: { occurredAt: "desc" },
    select: { neighbourOrganization: { select: { id: true, name: true } } },
  });
  return filas.map((f) => f.neighbourOrganization);
}

export type { EstadoDeConsulta, ResultadoDeConsulta };
