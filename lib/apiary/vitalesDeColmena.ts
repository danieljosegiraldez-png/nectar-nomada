import type { ColonyOriginType, ColonyPopulation } from "../../generated/prisma/client";
import { prisma } from "../db";

/**
 * Lo que la tarjeta de cada colmena tiene que decir para que el inventario sirva de algo.
 *
 * **Anexo E §3: «Inventario primero, porque decide la acción del día.»** Ese *porque* es la
 * razón de este archivo. El maquetado del Anexo pone tres cosas en cada tarjeta —
 *
 *     C-07  poblada
 *     núcleo Parita · 2 sep
 *     inspección hace 11 d
 *
 * — y la pantalla enseñaba la primera línea y media: el identificador, el estado de la caja y
 * si hay colonia o no. **Ni cuándo se abrió por última vez, ni de dónde vino.** Un inventario
 * que no dice cuál llevas cinco semanas sin abrir no decide ninguna acción: hay que entrar en
 * cada colmena para saberlo, que son tantos toques como colmenas.
 *
 * **Esta función no autoriza, y por eso no recibe `userAccountId`.** Recibe los ids de colmena
 * que quien la llama ya obtuvo de `getApiaryDetail`, que sí autoriza — misma disciplina que
 * `vitalesDeSitios` (A9.8) y `leerEnmiendas` (A9.3): un lector que pide un principal parece
 * una compuerta y termina usándose como tal.
 *
 * **Ninguna cifra sin fila detrás** (Anexo C). Todo es `null`-able y nada rellena huecos: una
 * colmena sin inspecciones dice «sin registrar», que no es «hace mucho» y no es cero.
 */

const MS_POR_DIA = 86_400_000;

export interface VitalesDeColmena {
  hiveId: string;
  /** `null` = ninguna inspección registrada nunca. No es «hace mucho». */
  ultimaInspeccion: Date | null;
  diasDesdeInspeccion: number | null;
  /**
   * La población que declaró esa última inspección. `null` cuando no se observó — el campo es
   * opcional a propósito (ADR-080): una inspección rápida que sólo mira si la caja sigue viva
   * es legítima, y un valor por defecto afirmaría algo que nadie vio.
   */
  poblacion: ColonyPopulation | null;
  /** El origen de la colonia que está viva ahora. `null` si la caja está vacía. */
  origenTipo: ColonyOriginType | null;
  /** El origen agrupable (A9.10), si la colonia lo trae. `null` si sólo hay nota libre. */
  origenFuente: string | null;
  /** Desde cuándo está esta colonia en esta caja. `null` si no hay colonia viva. */
  coloniaDesde: Date | null;
  /** El `⚠` del maquetado del §3: la última inspección la vio con población baja. */
  necesitaAtencion: boolean;
}

/**
 * El `⚠` de la tarjeta, y **sale de lo observado y no de un plazo inventado.**
 *
 * El maquetado del §3 marca una sola colmena de las tres, la que dice «débil». No marca la que
 * lleva once días sin inspección, así que aquí no se convierte «hace mucho» en una alerta: el
 * Anexo pide que los días se **vean**, no que griten. Un umbral de días por colmena sería una
 * decisión sobre cadencia, y la cadencia de este módulo vive en `nextVisitDueAt`, que declara
 * una persona al cerrar cada visita — no en una constante.
 *
 * `null` no avisa: no observar la población no es observarla baja.
 */
export function atencionPorPoblacion(poblacion: ColonyPopulation | null): boolean {
  return poblacion === "baja";
}

export async function vitalesDeColmenas(
  hiveIds: string[],
  ahora = new Date(),
): Promise<Map<string, VitalesDeColmena>> {
  const salida = new Map<string, VitalesDeColmena>();
  if (hiveIds.length === 0) return salida;

  // La colonia VIVA de cada caja, no todas las que pasaron por ella: la tarjeta habla de lo
  // que hay dentro hoy. `endedAt: null` es la misma definición de «viva» que usa el resto del
  // módulo, y se ordena por `startedAt` para que una caja con dos filas abiertas —que la base
  // no impide— dé siempre la misma respuesta en vez de una cualquiera.
  const colonias = await prisma.colony.findMany({
    where: { hiveId: { in: hiveIds }, endedAt: null },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      hiveId: true,
      startedAt: true,
      originType: true,
      originSource: { select: { value: true } },
    },
  });

  const coloniaPorCaja = new Map<string, (typeof colonias)[number]>();
  for (const c of colonias) if (!coloniaPorCaja.has(c.hiveId)) coloniaPorCaja.set(c.hiveId, c);

  const inspecciones = colonias.length
    ? await prisma.inspection.findMany({
        where: { colonyId: { in: colonias.map((c) => c.id) } },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: { colonyId: true, occurredAt: true, population: true },
      })
    : [];

  // La primera de cada colonia es la más reciente: la consulta ya viene ordenada, así que
  // esto no vuelve a decidir el orden en memoria.
  const ultimaPorColonia = new Map<string, (typeof inspecciones)[number]>();
  for (const i of inspecciones) if (!ultimaPorColonia.has(i.colonyId)) ultimaPorColonia.set(i.colonyId, i);

  for (const hiveId of hiveIds) {
    const colonia = coloniaPorCaja.get(hiveId);
    const ultima = colonia ? ultimaPorColonia.get(colonia.id) : undefined;
    const poblacion = ultima?.population ?? null;
    salida.set(hiveId, {
      hiveId,
      ultimaInspeccion: ultima?.occurredAt ?? null,
      diasDesdeInspeccion: ultima
        ? Math.floor((ahora.getTime() - ultima.occurredAt.getTime()) / MS_POR_DIA)
        : null,
      poblacion,
      origenTipo: colonia?.originType ?? null,
      origenFuente: colonia?.originSource?.value ?? null,
      coloniaDesde: colonia?.startedAt ?? null,
      necesitaAtencion: atencionPorPoblacion(poblacion),
    });
  }

  return salida;
}
