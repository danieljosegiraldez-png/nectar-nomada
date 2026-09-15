import { prisma } from "../db";
import { clasificarConsulta, diasHastaLaProximaConsulta } from "./vocabularioDeConsulta";
import { pesoDeNivel, type Alerta, type MotivoDeAlerta } from "./motivoDeAlerta";
import { HORAS_DE_JORNADA_VIEJA } from "../traceability/fieldSessions";

/**
 * A9.8 — los vitales de cada sitio de apiario y el color de su borde.
 *
 * **Esta función no autoriza, y por eso no recibe `userAccountId`.** Recibe los
 * ids que quien la llama ya obtuvo de `getApiaryList`, que sí autoriza. Misma
 * disciplina que `leerEnmiendas` (A9.3): un lector que pide un principal parece
 * una compuerta y termina usándose como tal.
 *
 * ## De dónde sale cada cifra, y cuáles faltan
 *
 * Regla del Anexo C que gobierna todo esto: **ninguna cifra sin fila detrás.**
 * Lo que no se ha medido se dice «sin registro», que es un dato distinto de
 * cero y más útil que un cero falso. Por eso cada vital es `null`-able y ningún
 * cálculo rellena huecos.
 *
 * De los ocho vitales del Anexo C §1.1, aquí salen seis. Los dos que faltan y
 * por qué:
 *
 *   * **Densidad de polinización** — necesita hectáreas comprometidas, que es
 *     A9.9. No se estima.
 *   * **Clima 7 días** — capa externa, sin proveedor conectado.
 *
 * ## Los umbrales, y por qué son constantes aquí sin contradecir al Anexo
 *
 * El Anexo C §1.2 exige que los umbrales sean parámetros por sitio y no
 * constantes. **La cadencia lo es**, y no por una columna de configuración:
 * vive en `nextVisitDueAt`, que declara una persona al cerrar cada visita
 * sabiendo en qué mes está y bajo qué contrato (D9). Un apiario de producción
 * en Los Asientos y uno de polinización en Toabré alertan distinto porque quien
 * cierra pone fechas distintas.
 *
 * Lo que queda como constante son los dos plazos de gracia de abajo, que no son
 * propiedades de un sitio sino decisiones sobre cómo se comporta el aviso. Si
 * algún día un sitio necesita los suyos, son dos columnas anulables sobre
 * `Location`, del mismo idioma que `sunExposure` o `dryingRoomBedLevelCount`.
 *
 * ## Las dos reglas del Anexo que deliberadamente NO se implementan
 *
 *   * **«Sin visita en 45 días en temporada»** — D9. Es la misma pregunta que
 *     «visita programada vencida» con una fuente peor: intenta adivinar desde
 *     un calendario de floración que no existe en ningún sitio del esquema. La
 *     otra usa una fecha que alguien declaró.
 *   * **«Densidad bajo el objetivo»** — A9.9.
 */

/** Pasado este plazo desde la fecha declarada, la próxima visita ya no es la programada (Anexo C §1.2). */
export const DIAS_DE_GRACIA_DE_VISITA = 14;
/** Ventana para coordinar una alimentación antes de que se acabe. Kiva exige avisar con 3 días. */
export const DIAS_DE_AVISO_DE_ALIMENTO = 7;
/**
 * **24 horas desde el 2026-09-14, y era 72.** El Anexo E §5 lo dice: «Si la jornada lleva
 * más de un día abierta, la app lo reclama». Tres días de gracia convertían eso en «lo
 * reclama pasado mañana», y la jornada del 13 de septiembre que el dueño nombró seguía sin
 * reclamarse por eso exactamente.
 *
 * El número **no vive aquí**: se reexporta de `fieldSessions.ts`, que es donde vive el
 * lector global de la jornada. Dos constantes para el mismo umbral —una para el aviso del
 * sitio y otra para el banner— acabarían diciendo cosas distintas de la misma visita.
 */
export const HORAS_DE_BORRADOR_VIEJO = HORAS_DE_JORNADA_VIEJA;

const MS_POR_DIA = 86_400_000;

/**
 * **Los tres tipos y el arreglo de motivos viven en `motivoDeAlerta.ts`, que es puro.** Se
 * reexportan aquí porque este módulo es el que los demás ya importaban, y mover la puerta
 * habría sido un cambio en cada sitio de llamada por nada.
 *
 * El motivo de la mudanza: el guardia que comprueba que cada alerta tiene su texto corre en
 * el carril hermético y **no puede importar este archivo**, que arrastra `prisma`. Leía la
 * unión con una expresión regular sobre el texto de este archivo, y un comentario con un
 * `;` dentro ya le hizo medir cero motivos una vez. Ahora lee un valor.
 */
export {
  MOTIVOS_DE_ALERTA,
  rangoDeMotivo,
  compararPorUrgencia,
  type Alerta,
  type MotivoDeAlerta,
  type NivelDeAlerta,
  type SitioOrdenable,
} from "./motivoDeAlerta";

export interface VitalesDeSitio {
  locationId: string;
  /** `null` = nunca se registró una visita en este sitio. No es «hace mucho». */
  ultimaVisita: Date | null;
  diasDesdeUltimaVisita: number | null;
  proximaVisita: Date | null;
  /** Lo que alguien contó al salir del sitio. Distinto de `coloniasActivas`. */
  coloniasVivasDeclaradas: number | null;
  /**
   * Cuándo se hizo ese conteo. Va junto a la cifra a propósito: un conteo
   * declarado en marzo y uno de ayer valen distinto, y sin la fecha los dos se
   * leen igual. Es la misma disciplina que el resto del módulo — ningún número
   * sin decir de dónde y de cuándo sale.
   */
  fechaDelConteoDeclarado: Date | null;
  /** Filas `Colony` en estado activo ahora mismo. Distinto de lo declarado, y a propósito. */
  coloniasActivas: number;
  cajas: number;
  alimentoHasta: Date | null;
  ultimaCosecha: Date | null;
  ultimaCosechaKg: number | null;
  /** La visita en borrador más vieja sin cerrar, si la hay. */
  borradorAbiertoDesde: Date | null;
  /** La consulta a vecinos más reciente del sitio. `null` = nunca se consultó. */
  ultimaConsultaAVecinos: Date | null;
  /** Días hasta la próxima consulta; negativo = venció. `null` si nunca se consultó. */
  diasHastaConsulta: number | null;
  /**
   * La aspersión anunciada más próxima que todavía no ha ocurrido, si hay alguna. Sale de
   * una consulta con resultado `aplicacion_prevista` (Anexo E §4).
   */
  aspersionAnunciadaEn: Date | null;
  /** En el orden del Anexo C §1.2: la primera es la que pinta el borde. */
  alertas: Alerta[];
}

/**
 * El orden importa: el borde toma su color de `alertas[0]`, y el Anexo lo fija
 * como «la primera regla que se cumpla, en este orden».
 */
export function alertasDe(v: Omit<VitalesDeSitio, "alertas">, hubieron: { perdidaSinReposicion: boolean; alimentoRepuesto: boolean }, ahora: Date): Alerta[] {
  const alertas: Alerta[] = [];

  // **PRIMERA de todas, por decisión del dueño (2026-09-14).** ADR-127 la dejó planteada y
  // sin resolver: una aspersión anunciada es la única fecha de este tablero que **la impone
  // alguien de fuera y que no se puede atender después**. Una pérdida sin reposición ya
  // ocurrió y se repone cuando se pueda; una aspersión en tres días se atiende antes de que
  // llegue o no se atiende nunca.
  //
  // Esto **cambia el orden que fija el Anexo C §1.2**, y por eso llevó la pregunta al dueño
  // en vez de decidirse aquí: `alertas[0]` pinta el borde de la tarjeta, así que el orden es
  // lo que decide qué grita primero la lista de apiarios.
  //
  // Crítica sólo mientras no haya pasado: una aspersión de la semana pasada no es un aviso,
  // es historia — y avisar de algo terminado enseña a ignorar el aviso.
  if (v.aspersionAnunciadaEn && v.aspersionAnunciadaEn >= ahora) {
    alertas.push({ nivel: "critico", motivo: "aspersion_anunciada" });
  }

  if (hubieron.perdidaSinReposicion) alertas.push({ nivel: "critico", motivo: "perdida_sin_reposicion" });

  if (v.proximaVisita && ahora.getTime() - v.proximaVisita.getTime() > DIAS_DE_GRACIA_DE_VISITA * MS_POR_DIA) {
    alertas.push({ nivel: "critico", motivo: "visita_vencida" });
  }

  if (v.alimentoHasta && v.alimentoHasta < ahora && !hubieron.alimentoRepuesto) {
    alertas.push({ nivel: "critico", motivo: "alimento_vencido" });
  } else if (v.alimentoHasta && v.alimentoHasta >= ahora && v.alimentoHasta.getTime() - ahora.getTime() < DIAS_DE_AVISO_DE_ALIMENTO * MS_POR_DIA) {
    alertas.push({ nivel: "aviso", motivo: "alimento_por_vencer" });
  }

  if (v.borradorAbiertoDesde && ahora.getTime() - v.borradorAbiertoDesde.getTime() > HORAS_DE_BORRADOR_VIEJO * 3_600_000) {
    alertas.push({ nivel: "aviso", motivo: "visita_sin_cerrar" });
  }

  // Anexo E §3, «Consulta a vecinos vence en 3 días». La regla la decide
  // `clasificarConsulta`, que es pura y vive con el resto del vocabulario.
  //
  // **`sin_consultar` NO levanta alerta**, y es deliberado: un apiario recién creado no ha
  // incumplido nada. Gritar el primer día enseñaría a ignorar este aviso, que es
  // exactamente lo que el Anexo quiere evitar cuando dice «el sistema lo reclama solo».
  // Lo que sí hace la pantalla del sitio es enseñar «nunca se ha consultado» como estado.
  const estadoDeConsulta = clasificarConsulta(v.ultimaConsultaAVecinos, ahora);
  if (estadoDeConsulta === "vencida") {
    alertas.push({ nivel: "aviso", motivo: "consulta_a_vecinos_vencida" });
  } else if (estadoDeConsulta === "por_vencer") {
    alertas.push({ nivel: "aviso", motivo: "consulta_a_vecinos_por_vencer" });
  }

  return alertas;
}

/**
 * Un sitio sin ninguna fila devuelve todo en `null` y `alertas: []`. Eso es
 * «no se ha medido», no «está bien»: la pantalla lo rotula distinto de un sitio
 * medido y sano, porque son cosas distintas.
 */
export async function vitalesDeSitios(locationIds: string[], ahora = new Date()): Promise<Map<string, VitalesDeSitio>> {
  const salida = new Map<string, VitalesDeSitio>();
  if (locationIds.length === 0) return salida;

  const [sesiones, colmenas, alimentaciones, cosechas, consultas] = await Promise.all([
    prisma.fieldSession.findMany({
      where: { locationId: { in: locationIds } },
      select: {
        locationId: true,
        startedAt: true,
        status: true,
        nextVisitDueAt: true,
        coloniesAliveCount: true,
        completedAt: true,
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.hive.findMany({
      where: { locationId: { in: locationIds } },
      select: { id: true, locationId: true, colonies: { select: { status: true, startedAt: true } } },
    }),
    prisma.colonyEvent.findMany({
      where: { eventType: "feeding", coverageUntil: { not: null }, colony: { hive: { locationId: { in: locationIds } } } },
      select: { occurredAt: true, coverageUntil: true, colony: { select: { hive: { select: { locationId: true } } } } },
    }),
    prisma.apiaryHarvestEvent.findMany({
      where: { colony: { hive: { locationId: { in: locationIds } } } },
      select: { occurredAt: true, extractedWeightKg: true, colony: { select: { hive: { select: { locationId: true } } } } },
      orderBy: { occurredAt: "desc" },
    }),
    // Anexo E §4 — una quinta consulta con `in`, no una por sitio: es el mismo reparto
    // que las cuatro de arriba, que se filtran en JS después.
    prisma.neighbourConsultation.findMany({
      where: { locationId: { in: locationIds } },
      select: { locationId: true, occurredAt: true, outcome: true, plannedApplicationAt: true },
      orderBy: { occurredAt: "desc" },
    }),
  ]);

  for (const locationId of locationIds) {
    const misSesiones = sesiones.filter((s) => s.locationId === locationId);
    const misColmenas = colmenas.filter((h) => h.locationId === locationId);
    const misAlimentos = alimentaciones.filter((f) => f.colony.hive.locationId === locationId);
    const miCosecha = cosechas.find((h) => h.colony.hive.locationId === locationId) ?? null;

    const ultimaVisita = misSesiones[0]?.startedAt ?? null;

    // Sólo una visita CERRADA declara la próxima: un borrador todavía no llegó
    // a la etapa de cierre, donde vive `next_visit_due_at`.
    const ultimaCerrada = misSesiones.find((s) => s.status === "completed" || s.status === "locked") ?? null;
    const proximaVisita = ultimaCerrada?.nextVisitDueAt ?? null;

    const conConteo = misSesiones.filter((s) => s.coloniesAliveCount != null);
    const coloniasVivasDeclaradas = conConteo[0]?.coloniesAliveCount ?? null;

    // «Pérdida sin reposición»: hicieron falta DOS conteos declarados para que
    // la pregunta tenga respuesta. Con uno solo no se sabe si bajó — y eso se
    // dice como «sin registro», no como «no pasó nada».
    const conteoAnterior = conConteo[1]?.coloniesAliveCount ?? null;
    const visitaAnterior = conConteo[1]?.startedAt ?? null;
    const bajoElConteo = coloniasVivasDeclaradas != null && conteoAnterior != null && coloniasVivasDeclaradas < conteoAnterior;
    const huboReposicion =
      visitaAnterior != null && misColmenas.some((h) => h.colonies.some((c) => c.startedAt > visitaAnterior));

    const alimentoHasta = misAlimentos.reduce<Date | null>(
      (max, f) => (f.coverageUntil && (!max || f.coverageUntil > max) ? f.coverageUntil : max),
      null,
    );
    // «Vencido y SIN nueva alimentación»: la segunda mitad es la que evita
    // gritar sobre un sitio que ya se atendió y todavía no declaró hasta cuándo.
    const alimentoRepuesto = alimentoHasta != null && misAlimentos.some((f) => f.occurredAt > alimentoHasta);

    const borrador = misSesiones.filter((s) => s.status === "draft").at(-1) ?? null;

    // Anexo E §4. Las consultas vienen ordenadas por fecha descendente, así que la
    // primera de este sitio es la más reciente.
    const misConsultas = consultas.filter((c) => c.locationId === locationId);
    const ultimaConsultaAVecinos = misConsultas[0]?.occurredAt ?? null;
    // La aspersión anunciada más PRÓXIMA que todavía no ha ocurrido. Se toma el mínimo y
    // no la primera de la lista, porque la lista está ordenada por fecha de CONSULTA y no
    // por fecha de aplicación: una consulta vieja puede anunciar algo más cercano.
    const aspersionAnunciadaEn = misConsultas.reduce<Date | null>((min, c) => {
      if (c.outcome !== "aplicacion_prevista" || !c.plannedApplicationAt) return min;
      if (c.plannedApplicationAt < ahora) return min;
      return !min || c.plannedApplicationAt < min ? c.plannedApplicationAt : min;
    }, null);

    const base: Omit<VitalesDeSitio, "alertas"> = {
      ultimaConsultaAVecinos,
      diasHastaConsulta: ultimaConsultaAVecinos
        ? diasHastaLaProximaConsulta(ultimaConsultaAVecinos, ahora)
        : null,
      aspersionAnunciadaEn,
      locationId,
      ultimaVisita,
      diasDesdeUltimaVisita: ultimaVisita ? Math.floor((ahora.getTime() - ultimaVisita.getTime()) / MS_POR_DIA) : null,
      proximaVisita,
      coloniasVivasDeclaradas,
      fechaDelConteoDeclarado: conConteo[0]?.startedAt ?? null,
      coloniasActivas: misColmenas.reduce((n, h) => n + h.colonies.filter((c) => c.status === "active").length, 0),
      cajas: misColmenas.length,
      alimentoHasta,
      ultimaCosecha: miCosecha?.occurredAt ?? null,
      ultimaCosechaKg: miCosecha?.extractedWeightKg == null ? null : Number(miCosecha.extractedWeightKg),
      borradorAbiertoDesde: borrador?.startedAt ?? null,
    };

    salida.set(locationId, {
      ...base,
      alertas: alertasDe(base, { perdidaSinReposicion: bajoElConteo && !huboReposicion, alimentoRepuesto }, ahora),
    });
  }

  return salida;
}

/** El sitio más urgente primero: crítico, luego aviso, luego el resto por nombre. */
export function pesoDeAlerta(vitales: VitalesDeSitio | undefined): number {
  return pesoDeNivel(vitales?.alertas);
}
