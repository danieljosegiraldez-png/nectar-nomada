/**
 * Los vitales de campo, anotados **estando en el sitio**.
 *
 * ## El encargo, literal
 *
 * Daniel, 2026-09-17: *«se debería poder hacer durante la visita o al cierre, a veces en sitio y
 * si solo un apicultor es difícil maniobrar y ser eficiente de entrar y salir y estresar menos a
 * las abejas»*.
 *
 * Es una tercera opción mejor que las dos que le llevé —«que `stage: field` signifique algo» o
 * «que el protocolo diga la verdad»—: **no hay que restringir, hay que registrar cuál de las dos
 * pasó.** Un apicultor solo, con las manos ocupadas y una caja abierta, tiene una razón real para
 * salir y anotar después; y esa razón no convierte lo anotado después en lo mismo que lo visto.
 *
 * ## Qué corrige
 *
 * El protocolo marca `weather_observed`, `colonies_alive_count` y `hives_present_count` como
 * `stage: field` **y las tres se capturaban sólo en el formulario de cierre**, que se rellena en
 * casa. Dos de ellas las puse yo el 2026-09-16 siguiendo a las que ya estaban, sin comprobar que
 * las que seguía estuvieran bien.
 *
 * Sin la marca, **una cifra vista con el guante puesto y una reconstruida de memoria dos horas
 * después son la misma fila**, las dos estampadas `original_record`. Es la misma forma que el
 * desajuste que ADR-154 declaró sin arreglar: el protocolo declara una propiedad de la captura y
 * nada la hace cumplir.
 *
 * ## Por qué UNA marca y no una por campo
 *
 * Tres columnas dirían más —qué se vio y qué se recordó, campo a campo— y cuestan tres columnas,
 * tres caminos de escritura y tres formas de quedar inconsistentes. La marca de grupo responde la
 * pregunta que se hace de verdad al leer una visita: **«¿esto se anotó allí o en casa?»**. Si
 * algún día hace falta la precisión por campo, se añade entonces, con el caso delante.
 *
 * **Y describe el valor ACTUAL, no un histórico.** Por eso el cierre la limpia cuando reescribe
 * alguno de los tres: una cifra corregida desde casa ya no es la que se vio. El histórico
 * completo está en el `AuditEvent`, que es donde vive.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { exigeClimaObservado } from "./climaObservado";
import { compararCajasPresentes } from "./cajasPresentes";
import { requireApiaryAccess } from "./hives";

export class VitalesEnSitioInvalido extends Error {}

export interface VitalesEnSitioInput {
  fieldSessionId: string;
  /** Llega como cadena del formulario; `exigeClimaObservado` la valida (ADR-112). */
  weatherObserved?: string | null;
  coloniesAliveCount?: number | null;
  hivesPresentCount?: number | null;
}

/** Las tres claves del protocolo que esto cubre, para que el guardia pueda nombrarlas. */
export const VITALES_DE_CAMPO = ["weather_observed", "colonies_alive_count", "hives_present_count"] as const;

export async function registrarVitalesEnSitio(
  userAccountId: string,
  input: VitalesEnSitioInput,
  ahora = new Date(),
) {
  const sesion = await prisma.fieldSession.findUnique({
    where: { id: input.fieldSessionId },
    select: {
      id: true,
      locationId: true,
      status: true,
      endedAt: true,
      weatherObserved: true,
      coloniesAliveCount: true,
      hivesPresentCount: true,
      fieldVitalsOnSiteAt: true,
    },
  });
  if (!sesion) throw new VitalesEnSitioInvalido("visita_no_encontrada");

  await requireApiaryAccess(userAccountId, "manage", [{ projectId: null, locationId: sesion.locationId }]);

  // **Sólo mientras la visita está ABIERTA, y ésa es toda la afirmación que esta puerta hace.**
  // No se comprueba que el teléfono esté en el apiario --las coordenadas de `startLatitude` son
  // del arranque, no de ahora, y exigir GPS dejaría sin registrar una visita bajo dosel cerrado,
  // que es justo donde están las abejas--. Lo que la marca dice es «se anotó mientras la visita
  // seguía abierta», no «el aparato estaba dentro del apiario». Decir más sería inventarlo.
  if (sesion.endedAt !== null || sesion.status === "completed" || sesion.status === "locked") {
    throw new VitalesEnSitioInvalido("visita_ya_cerrada");
  }

  const clima = input.weatherObserved === undefined ? undefined : exigeClimaObservado(input.weatherObserved);

  // Cero es válido en los dos recuentos --un apiario vaciado se cuenta como cero, ADR-150-- así
  // que se valida la forma, no la verdad del número.
  const entero = (v: number | null | undefined, clave: string) => {
    if (v === undefined || v === null) return v;
    if (!Number.isInteger(v) || v < 0) throw new VitalesEnSitioInvalido(`${clave}_invalido: ${v}`);
    return v;
  };
  const colonias = entero(input.coloniesAliveCount, "colonias_vivas");
  const cajas = entero(input.hivesPresentCount, "cajas_presentes");

  // **Si no viene ninguno de los tres, no se toca nada ni se estampa la marca.** Un envío vacío
  // afirmaría haber anotado en sitio sin haber anotado nada.
  if (clima === undefined && colonias === undefined && cajas === undefined) {
    throw new VitalesEnSitioInvalido("nada_que_registrar");
  }

  const despues = await prisma.$transaction(async (tx) => {
    const fila = await tx.fieldSession.update({
      where: { id: sesion.id },
      data: {
        ...(clima === undefined ? {} : { weatherObserved: clima }),
        ...(colonias === undefined ? {} : { coloniesAliveCount: colonias }),
        ...(cajas === undefined ? {} : { hivesPresentCount: cajas }),
        fieldVitalsOnSiteAt: ahora,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "field_session.vitals_on_site",
        entityType: "field_session",
        entityId: fila.id,
        before: {
          weatherObserved: sesion.weatherObserved,
          coloniesAliveCount: sesion.coloniesAliveCount,
          hivesPresentCount: sesion.hivesPresentCount,
          fieldVitalsOnSiteAt: sesion.fieldVitalsOnSiteAt,
        },
        after: {
          weatherObserved: fila.weatherObserved,
          coloniesAliveCount: fila.coloniesAliveCount,
          hivesPresentCount: fila.hivesPresentCount,
          fieldVitalsOnSiteAt: fila.fieldVitalsOnSiteAt,
        },
        sourceInterface: "web",
      },
      tx,
    );
    return fila;
  });

  // Se devuelve la comparación de cajas ya resuelta (ADR-150): quien acaba de contar en el sitio
  // es exactamente quien puede hacer algo si no cuadra, y decírselo al cerrar en casa llega tarde.
  return {
    fieldVitalsOnSiteAt: despues.fieldVitalsOnSiteAt,
    cajas: compararCajasPresentes(
      despues.hivesPresentCount,
      await prisma.hive.count({ where: { locationId: sesion.locationId } }),
    ),
  };
}
