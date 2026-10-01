import { prisma } from "../db";
import { numeroDeBandeja } from "../equipos/bandejas";
import { colaDeSecado, type UnidadEnCola } from "./colaDeSecado";
import type { DatosDeLaGrafica } from "./graficaDeSecado";

/**
 * La ficha de una unidad de secado: qué tiene encima, cómo va, y qué se le ha hecho.
 *
 * Diseño §B.3 de `docs/superpowers/specs/2026-09-27-cola-de-secado-y-ritmo-por-fase-design.md`.
 *
 * **Reutiliza `colaDeSecado` en vez de volver a consultar lo mismo.** La cabecera y las cinco
 * cifras —humedad, rango, volteos, ritmo, día dentro de lo declarado— son exactamente lo que la
 * cola ya calcula para cada unidad. Dos consultas del mismo hecho acaban mintiendo en distinto
 * sentido, y nadie lo nota hasta que alguien compara dos pantallas. Aquí sólo se añade lo que la
 * cola no necesita: los actos, uno a uno.
 *
 * **La visibilidad viene incluida**, porque viene de la cola: si una cuenta no puede ver el lote,
 * la unidad no aparece en su cola y esta ficha dice que no la encuentra. No hay un segundo camino
 * de autorización que pueda divergir del primero.
 */

/** Cómo se nombra una unidad en la URL. */
export type ReferenciaDeUnidad =
  | { readonly tipo: "bandeja"; readonly numero: string }
  | { readonly tipo: "cama"; readonly locationId: string }
  | { readonly tipo: "corrida"; readonly dryingRunId: string };

const NUMERO_DE_BANDEJA = /^B-\d{3,}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Interpreta el parámetro de la ruta.
 *
 * **Las dos clases de unidad se nombran distinto, y por eso hay que interpretar** (diseño §B.3):
 * una **bandeja** es un equipo numerado y se dirige por su número —`B-001`, que es lo que está
 * escrito en la zaranda y lo que el operario teclearía—; una **cama** es un lugar y se dirige por
 * el id de ese lugar, porque su nombre no es único entre fincas.
 *
 * También acepta la forma `tipo:id` que usa la cola como clave, para que un enlace desde allí no
 * tenga que traducir nada.
 */
export function interpretarReferencia(parametro: string): ReferenciaDeUnidad | null {
  const p = decodeURIComponent(parametro).trim();
  if (NUMERO_DE_BANDEJA.test(p)) return { tipo: "bandeja", numero: p.toUpperCase() };

  const [prefijo, ...resto] = p.split(":");
  const id = resto.join(":");
  if (prefijo === "cama" && UUID.test(id)) return { tipo: "cama", locationId: id };
  if (prefijo === "corrida" && UUID.test(id)) return { tipo: "corrida", dryingRunId: id };
  if (prefijo === "bandeja" && UUID.test(id)) return { tipo: "bandeja", numero: id };

  // Un uuid suelto es una cama: es la forma que el diseño le da, y la que sale de un enlace.
  if (UUID.test(p)) return { tipo: "cama", locationId: p };
  return null;
}

/** Un acto sobre la unidad: algo que alguien hizo, con su hora y su nombre. */
export interface ActoSobreLaUnidad {
  readonly clase: "volteo" | "medicion";
  readonly cuando: Date;
  readonly quien: string | null;
  /** Para una medición: qué se midió y cuánto. Para un volteo: qué tipo de gesto fue. */
  readonly que: string;
  readonly instrumento: string | null;
  readonly nota: string | null;
}

export interface FichaDeUnidad {
  readonly unidad: UnidadEnCola;
  readonly area: { readonly locationId: string; readonly nombre: string } | null;
  /**
   * La zona del sitio, para pintar las horas donde ocurrieron. `null` deja la de por defecto.
   * **No es el idioma**: `mostrarInstante` recibe una ZONA, y pasarle un locale hace que
   * `Intl.DateTimeFormat` lance y se caiga la página entera.
   */
  readonly zona: string | null;
  /** Lo más nuevo primero: es lo que se mira al llegar. */
  readonly actos: readonly ActoSobreLaUnidad[];
  readonly entro: Date;
  /** Las series de la gráfica. La ventana va de la entrada a ahora: es el secado, no los datos. */
  readonly grafica: DatosDeLaGrafica;
  /**
   * Los pesajes del lote. **Cifras, no curva** (diseño §B.3): cuatro pesajes no hacen una curva, y
   * dibujarlos como una sugeriría una evolución continua que nadie midió.
   */
  readonly pesajes: readonly { readonly cuando: Date; readonly netoKg: number }[];
}

/**
 * `null` cuando la unidad no existe, no tiene café encima, o esta cuenta no la ve. **Las tres se
 * responden igual a propósito**: distinguirlas le diría a quien no tiene permiso que la unidad
 * existe y está ocupada, que es justo lo que no debe saber.
 */
export async function fichaDeUnidad(
  userAccountId: string,
  parametro: string,
  ahora: Date = new Date(),
): Promise<FichaDeUnidad | null> {
  const ref = interpretarReferencia(parametro);
  if (ref === null) return null;

  // El número de bandeja se traduce a su equipo aquí, porque la cola trabaja con ids.
  let claveBuscada: string | null = null;
  if (ref.tipo === "bandeja") {
    if (UUID.test(ref.numero)) {
      claveBuscada = `bandeja:${ref.numero}`;
    } else {
      const n = Number(ref.numero.slice(2));
      const equipo = await prisma.equipment.findFirst({
        where: { trayNumber: n },
        select: { id: true, trayNumber: true },
      });
      claveBuscada = equipo ? `bandeja:${equipo.id}` : null;
    }
  } else if (ref.tipo === "cama") {
    claveBuscada = `cama:${ref.locationId}`;
  } else {
    claveBuscada = `corrida:${ref.dryingRunId}`;
  }
  if (claveBuscada === null) return null;

  const cola = await colaDeSecado(userAccountId, ahora);
  for (const area of cola.areas) {
    const unidad = area.unidades.find((u) => u.clave === claveBuscada);
    if (!unidad) continue;

    const [volteos, mediciones, ambiente, pesajes] = await Promise.all([
      prisma.dryingTurnEvent.findMany({
        where: { dryingRunId: unidad.dryingRunId },
        select: { occurredAt: true, eventType: true, notes: true, operator: { select: { displayName: true } } },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.measurement.findMany({
        where: { dryingRunId: unidad.dryingRunId },
        select: {
          occurredAt: true, variable: true, value: true, unit: true, notes: true,
          operator: { select: { displayName: true } },
          instrument: { select: { name: true } },
        },
        orderBy: { occurredAt: "desc" },
      }),
      // El ambiente es de la INSTALACIÓN, no de la unidad: un cuarto tiene un clima, no cada cama.
      prisma.dryingAmbientReading.findMany({
        where: { facilityLocationId: area.locationId, occurredAt: { gte: unidad.desde } },
        select: { occurredAt: true, airTemperatureC: true, relativeHumidityPct: true },
        orderBy: { occurredAt: "asc" },
      }),
      prisma.dryingTrayWeighing.findMany({
        where: { lotId: unidad.lotId },
        select: { occurredAt: true, netKg: true },
        orderBy: { occurredAt: "asc" },
      }),
    ]);

    const actos: ActoSobreLaUnidad[] = [
      ...volteos.map((v) => ({
        clase: "volteo" as const,
        cuando: v.occurredAt,
        quien: v.operator?.displayName ?? null,
        que: v.eventType,
        instrumento: null,
        nota: v.notes,
      })),
      ...mediciones.map((m) => ({
        clase: "medicion" as const,
        cuando: m.occurredAt,
        quien: m.operator?.displayName ?? null,
        que: `${m.variable} ${Number(m.value)}${m.unit}`,
        instrumento: m.instrument?.name ?? null,
        nota: m.notes,
      })),
    ].sort((a, b) => b.cuando.getTime() - a.cuando.getTime());

    const lugar = await prisma.location.findUnique({
      where: { id: area.locationId },
      select: { timezone: true },
    });

    const grafica: DatosDeLaGrafica = {
      // Sólo la humedad del grano: las otras variables que se miden sobre un secado no comparten
      // ni unidad ni sentido con ella, y meterlas en el mismo eje dibujaría una mentira.
      humedad: mediciones
        .filter((m) => m.variable === "moisture")
        .map((m) => ({ cuando: m.occurredAt, valor: Number(m.value) }))
        .sort((x, y) => x.cuando.getTime() - y.cuando.getTime()),
      rango:
        unidad.ritmo.humedadMinPct == null || unidad.ritmo.humedadMaxPct == null
          ? null
          : { min: unidad.ritmo.humedadMinPct, max: unidad.ritmo.humedadMaxPct },
      temperatura: ambiente
        .filter((a) => a.airTemperatureC != null)
        .map((a) => ({ cuando: a.occurredAt, valor: Number(a.airTemperatureC) })),
      humedadRelativa: ambiente
        .filter((a) => a.relativeHumidityPct != null)
        .map((a) => ({ cuando: a.occurredAt, valor: Number(a.relativeHumidityPct) })),
      volteos: volteos.map((v) => v.occurredAt).sort((x, y) => x.getTime() - y.getTime()),
      desde: unidad.desde,
      hasta: ahora,
    };

    return {
      unidad,
      grafica,
      pesajes: pesajes.map((w) => ({ cuando: w.occurredAt, netoKg: Number(w.netKg) })),
      area: { locationId: area.locationId, nombre: area.nombre },
      zona: lugar?.timezone ?? null,
      actos,
      entro: unidad.desde,
    };
  }
  return null;
}
