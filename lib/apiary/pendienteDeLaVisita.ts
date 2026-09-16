import { prisma } from "../db";
import { retirosPendientes, type RetiroPendiente } from "./cierreDeEvento";

/**
 * Lo que quedo pendiente al cerrar la jornada -- Anexo E §5.
 *
 * La frase entera es: *"Al cerrarla: resumen de lo registrado, **lo que quedo pendiente**, y
 * de ahi sale el reporte tecnico al cliente"*. Medido el 2026-09-15 sobre `main`: la pantalla
 * de la jornada **no ensenaba ninguna de las dos mitades**. `resumenDeVisita` existe desde
 * A9.1 y aparece en **cero** pantallas -- alimenta un mensaje de bitacora y nada mas --, y de
 * "lo que quedo pendiente" no habia nada. Es la cuarta vez en este modulo que un mecanismo
 * existe y no tiene puerta.
 *
 * ## Que cuenta como pendiente, y la linea es "lo que todavia puedes hacer antes de irte"
 *
 * Dos cosas, y las dos se arreglan sin subir al carro:
 *
 *   * **Las colmenas que la visita no toco.** Es el hecho nuevo, y el que contesta la
 *     pregunta del oficio: abriste cuatro de diez, ¿cuales seis se quedaron?
 *   * **Las tiras sin retirar** (`retirosPendientes`): material que sigue dentro de una caja
 *     de este sitio y que alguien tiene que sacar.
 *
 * **Lo que deliberadamente NO se repite aqui:** el alimento por vencer y la consulta a
 * vecinos. Las dos son estado del sitio y ya gritan en su tarjeta y en la ficha; ninguna se
 * resuelve caminando de vuelta a la caja. Amontonarlas en el cierre convertiria la lista en
 * una pared de avisos que se aprende a pasar de largo, que es justo lo que el Anexo quiere
 * evitar cuando dice que el sistema "lo reclama solo".
 *
 * **No recibe `userAccountId` y no autoriza**: se llama desde la pantalla de la jornada, que
 * ya paso por `getFieldSessionTimeline`. Misma disciplina que `resumenDeVisita`,
 * `vitalesDeSitios` y `vitalesDeColmenas`.
 */

export interface ColmenaSinTocar {
  hiveId: string;
  identifier: string;
  /** Si tiene colonia viva. Una caja vacia sin tocar no es lo mismo que una poblada. */
  poblada: boolean;
}

export interface PendienteDeLaVisita {
  fieldSessionId: string;
  locationId: string;
  /** Cajas del sitio sin ningun evento de ESTA jornada. */
  sinTocar: ColmenaSinTocar[];
  /** De esas, cuantas tienen colonia viva. Es la cifra que importa al salir. */
  sinTocarPobladas: number;
  /** Cuantas si recibieron algo en esta jornada. */
  tocadas: number;
  retiros: RetiroPendiente[];
}

export async function pendientesDeLaVisita(
  fieldSessionId: string,
  ahora: Date = new Date(),
): Promise<PendienteDeLaVisita | null> {
  const visita = await prisma.fieldSession.findUnique({
    where: { id: fieldSessionId },
    select: { id: true, locationId: true },
  });
  if (!visita) return null;

  // Los tres caminos por los que un evento de campo apunta a una colmena. Las tres FK las
  // anadio A9.1 para poder leer la visita entera desde su rastro, y aqui se usan al reves:
  // de los eventos a las cajas que tocaron.
  const eventos = await prisma.fieldEvent.findMany({
    where: { fieldSessionId },
    select: {
      inspection: { select: { colony: { select: { hiveId: true } } } },
      colonyEvent: { select: { colony: { select: { hiveId: true } } } },
      apiaryHarvestEvent: { select: { colony: { select: { hiveId: true } } } },
    },
  });

  const tocadas = new Set<string>();
  for (const e of eventos) {
    for (const id of [
      e.inspection?.colony.hiveId,
      e.colonyEvent?.colony.hiveId,
      e.apiaryHarvestEvent?.colony.hiveId,
    ]) {
      if (id) tocadas.add(id);
    }
  }

  // Las cajas del sitio. Se lee `hive.locationId` y no la colocacion vigente a proposito: la
  // pregunta es "que tenias delante hoy", y eso es donde esta la caja ahora.
  const cajas = await prisma.hive.findMany({
    where: { locationId: visita.locationId },
    orderBy: { identifier: "asc" },
    select: { id: true, identifier: true, colonies: { where: { endedAt: null }, select: { status: true } } },
  });

  const sinTocar = cajas
    .filter((c) => !tocadas.has(c.id))
    .map((c) => ({
      hiveId: c.id,
      identifier: c.identifier,
      poblada: c.colonies.some((k) => k.status === "active"),
    }));

  return {
    fieldSessionId: visita.id,
    locationId: visita.locationId,
    sinTocar,
    sinTocarPobladas: sinTocar.filter((c) => c.poblada).length,
    tocadas: cajas.filter((c) => tocadas.has(c.id)).length,
    retiros: await retirosPendientes(visita.locationId, ahora),
  };
}
