import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireFieldSessionAccess } from "./jornadaDeCampo";

/**
 * Un sitio aprende dónde está de las visitas que se abrieron en él.
 *
 * **El problema medido, no supuesto:** de las 24 `Location` que hay, **cero**
 * tienen latitud y longitud. El mapa que `ADR-009` decidió no está esperando a
 * Mapbox: está esperando a que exista algo que pintar. Y las coordenadas ya
 * están llegando —`FieldSession.startLatitude/startLongitude`, que el teléfono
 * graba al abrir una visita— sólo que nadie las mira.
 *
 * ## Propone, NO escribe
 *
 * Esto es lo único que no se puede negociar aquí. `CLAUDE.md` §3 lo dice sin
 * ambigüedad: «never automatically infer missing factual values and save them as
 * facts». Un GPS de teléfono bajo dosel cerrado se equivoca por decenas de
 * metros, y escribirlo solo convertiría una lectura en un hecho declarado sobre
 * dónde está una finca.
 *
 * Así que `coordenadasPropuestas` **sólo lee y sugiere**, y la escritura vive en
 * `confirmarCoordenadasDelSitio`, que exige un principal, pasa por la compuerta
 * y deja su `AuditEvent`. Lo que el sistema aporta es el trabajo de juntar las
 * lecturas; lo que aporta la persona es decir que sí.
 *
 * ## Por qué la mediana y no el promedio
 *
 * Un promedio lo arrastra una sola lectura mala —el teléfono que fijó posición
 * antes de tener satélites— y en un sitio con tres visitas esa lectura pesa un
 * tercio. La mediana la ignora. Con un número par de muestras se promedian las
 * dos centrales, que es la mediana de siempre y se queda dentro del rango
 * observado.
 *
 * ## Por qué sólo `FieldSession` y no `FieldEvent`
 *
 * `FieldEvent` también guarda coordenadas, pero son de **dentro** del sitio:
 * cada colmena, cada cama de secado. Promediar eso responde «dónde está el
 * centro de la actividad», que no es la pregunta. El arranque de la visita es
 * el punto de llegada al sitio, que sí lo es.
 *
 * ## No toca `geoPoint`
 *
 * `Location.geoPoint` es `Unsupported("geography(Point,4326)")` y **cero líneas
 * de aplicación lo referencian** — el propio esquema lo dice. Sincronizarlo es
 * otra decisión, con PostGIS de por medio, y no hace falta para pintar un punto.
 */

/** Radio medio de la Tierra, en metros. */
const RADIO_TERRESTRE_M = 6_371_000;

const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/**
 * Haversine. Se usa la fórmula exacta y no una aproximación plana porque la
 * aproximación habría que justificarla con la latitud del sitio, y esto son seis
 * líneas.
 */
export function metrosEntre(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = aRadianes(b.latitude - a.latitude);
  const dLon = aRadianes(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(a.latitude)) * Math.cos(aRadianes(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TERRESTRE_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Mediana de una lista no vacía. Con par de elementos, promedia las dos centrales. */
export function mediana(valores: number[]): number {
  const orden = [...valores].sort((x, y) => x - y);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio]! : (orden[medio - 1]! + orden[medio]!) / 2;
}

export interface CoordenadasPropuestas {
  locationId: string;
  /** Lo que el sitio ya declara. `null` = todavía nadie lo ha dicho. */
  yaDeclaradas: { latitude: number; longitude: number } | null;
  /** Cuántas visitas aportaron una lectura. Cero = no hay nada que proponer. */
  muestras: number;
  propuesta: { latitude: number; longitude: number } | null;
  /**
   * Metros entre la lectura más lejana y la propuesta. Es lo que dice si las
   * visitas se están refiriendo al mismo sitio o a dos: 30 m es un apiario,
   * 3 km es que alguien abrió la visita de camino.
   */
  dispersionM: number | null;
  /** La mejor precisión que declaró un aparato. Un dato del GPS, no un cálculo mío. */
  mejorPrecisionM: number | null;
  /** Metros entre lo declarado y lo propuesto, cuando existen los dos. */
  distanciaALoDeclaradoM: number | null;
}

/**
 * No autoriza, y por eso no recibe `userAccountId`: quien llama ya obtuvo este
 * `locationId` de una lectura que sí autoriza. Misma disciplina que
 * `vitalesDeSitios` y `leerEnmiendas`. La ESCRITURA hermana sí guarda.
 */
export async function coordenadasPropuestas(locationId: string): Promise<CoordenadasPropuestas> {
  const [sitio, sesiones] = await Promise.all([
    prisma.location.findUnique({ where: { id: locationId }, select: { latitude: true, longitude: true } }),
    prisma.fieldSession.findMany({
      where: { locationId, startLatitude: { not: null }, startLongitude: { not: null } },
      select: { startLatitude: true, startLongitude: true, startAccuracyM: true },
    }),
  ]);

  const yaDeclaradas =
    sitio?.latitude != null && sitio.longitude != null
      ? { latitude: sitio.latitude, longitude: sitio.longitude }
      : null;

  const lecturas = sesiones.map((s) => ({
    latitude: s.startLatitude!,
    longitude: s.startLongitude!,
    accuracyM: s.startAccuracyM,
  }));

  if (lecturas.length === 0) {
    return {
      locationId,
      yaDeclaradas,
      muestras: 0,
      propuesta: null,
      dispersionM: null,
      mejorPrecisionM: null,
      distanciaALoDeclaradoM: null,
    };
  }

  // La mediana se toma por eje. Con lecturas de un mismo sitio los dos ejes
  // varían poco, así que el punto resultante cae dentro de la nube; no es el
  // centroide geométrico y no pretende serlo.
  const propuesta = {
    latitude: mediana(lecturas.map((l) => l.latitude)),
    longitude: mediana(lecturas.map((l) => l.longitude)),
  };

  const precisiones = lecturas.map((l) => l.accuracyM).filter((a): a is number => a != null);

  return {
    locationId,
    yaDeclaradas,
    muestras: lecturas.length,
    propuesta,
    dispersionM: Math.max(...lecturas.map((l) => metrosEntre(l, propuesta))),
    mejorPrecisionM: precisiones.length > 0 ? Math.min(...precisiones) : null,
    distanciaALoDeclaradoM: yaDeclaradas ? metrosEntre(yaDeclaradas, propuesta) : null,
  };
}

export class CoordenadasValidationError extends Error {}

export interface ConfirmarCoordenadasInput {
  locationId: string;
  latitude: number;
  longitude: number;
  /** Por qué se declara esto. Va al `reason` del AuditEvent. */
  reason?: string | null;
}

/**
 * Declara dónde está un sitio. **Es una escritura de una persona**, no un
 * derivado que se recalcula: por eso pasa por la compuerta, exige valores
 * explícitos —no los recoge sola de la propuesta— y guarda su `AuditEvent` en la
 * misma transacción, con el `before` y el `after`.
 *
 * Que reciba los números en vez de leerlos de `coordenadasPropuestas` es
 * deliberado: si los leyera él, «confirmar» sería un botón que aprueba lo que el
 * sistema ya decidió, y la propuesta volvería a ser un hecho inferido por la
 * puerta de atrás.
 */
export async function confirmarCoordenadasDelSitio(userAccountId: string, input: ConfirmarCoordenadasInput) {
  await requireFieldSessionAccess(userAccountId, input.locationId);

  // Los rangos del sistema de referencia, no una opinión. Un dedo de más en un
  // formulario manda un apiario al océano y nadie lo nota hasta ver el mapa.
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new CoordenadasValidationError("latitud_fuera_de_rango");
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new CoordenadasValidationError("longitud_fuera_de_rango");
  }

  const antes = await prisma.location.findUnique({
    where: { id: input.locationId },
    select: { id: true, latitude: true, longitude: true },
  });
  if (!antes) throw new CoordenadasValidationError("sitio_no_encontrado");

  return prisma.$transaction(async (tx) => {
    const despues = await tx.location.update({
      where: { id: input.locationId },
      data: { latitude: input.latitude, longitude: input.longitude },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.declare_coordinates",
        entityType: "location",
        entityId: despues.id,
        before: antes,
        after: { id: despues.id, latitude: despues.latitude, longitude: despues.longitude },
        reason: input.reason ?? undefined,
        sourceInterface: "traceability.coordinates",
      },
      tx,
    );

    return despues;
  });
}
