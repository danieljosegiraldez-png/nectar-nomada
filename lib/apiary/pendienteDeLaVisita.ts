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
    select: { id: true, locationId: true, startedAt: true },
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

  // Las cajas que estaban en el sitio CUANDO SE VISITO.
  //
  // **Esto leia `hive.locationId`**, con esta nota: *"la pregunta es 'que tenias delante hoy', y
  // eso es donde esta la caja ahora"*. Para cerrar la jornada del dia da igual. Para abrir una
  // visita PASADA no: una caja trasladada despues aparece en su sitio nuevo y desaparece del
  // viejo, asi que "¿cuales seis se quedaron sin tocar?" cambia hacia atras con el tiempo.
  // `traslado.ts` cierra la colocacion y abre otra, asi que el dato existe.
  //
  // **Y la regla NO es "la colocacion solapa el instante", aunque sea lo primero que sale.**
  // `crearColocacionInicial` abre la colocacion en `installedAt ?? createdAt`, y `createdAt` es
  // cuando alguien TECLEO la colmena, no cuando la caja llego. Con solape estricto, una colmena
  // registrada despues de la visita en la que se vio por primera vez desaparece de esa visita —
  // sin que nada falle, que es la direccion peligrosa. Las cuatro pruebas de este archivo lo
  // enseñan: su jornada es de septiembre y sus cajas nacen el dia que corre la suite.
  //
  // La regla es **no excluir salvo que el registro diga que estaba en OTRO sitio**:
  //
  //   1. toda caja con una colocacion EN ESTE SITIO que cubre el instante; mas
  //   2. las que hoy apuntan aqui y NO tienen una colocacion en otro sitio cubriendo el instante.
  //
  // El (2) cubre ademas un estado medido y no una hipotesis: el comentario de
  // `crearColocacionInicial` registra *"10 de 29 colmenas sin ninguna colocacion"* sobre los datos
  // reales el 2026-09-15 — las diez de Apiario Las Nubes, por un guion que no la abria. Una
  // consulta que mire solo colocaciones devuelve CERO para esas diez.
  const instante = visita.startedAt;
  const cubreElInstante = { startedAt: { lte: instante }, OR: [{ endedAt: null }, { endedAt: { gt: instante } }] };

  const aqui = await prisma.hivePlacement.findMany({
    where: { locationId: visita.locationId, ...cubreElInstante },
    select: { hiveId: true },
  });
  const idsAqui = aqui.map((c) => c.hiveId);

  const apuntanAqui = await prisma.hive.findMany({
    where: { locationId: visita.locationId },
    select: { id: true },
  });
  const sinColocacionAqui = apuntanAqui.map((h) => h.id).filter((id) => !idsAqui.includes(id));

  const enOtroSitio = sinColocacionAqui.length
    ? await prisma.hivePlacement.findMany({
        where: { hiveId: { in: sinColocacionAqui }, locationId: { not: visita.locationId }, ...cubreElInstante },
        select: { hiveId: true },
      })
    : [];
  const idsEnOtroSitio = new Set(enOtroSitio.map((c) => c.hiveId));

  const cajas = await prisma.hive.findMany({
    where: { id: { in: [...idsAqui, ...sinColocacionAqui.filter((id) => !idsEnOtroSitio.has(id))] } },
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
