import type { VisitPurpose } from "../../generated/prisma/client";
import { prisma } from "../db";
import { ACTIVIDADES, LO_QUE_PIDE, type Actividad } from "./actividadDeVisita";
import { mostrarFecha, ZONA_POR_DEFECTO } from "../time/mostrarInstante";
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

export interface PendienteDelProposito {
  proposito: VisitPurpose;
  /** Cajas del sitio sin el registro que este propósito pide. Vacío para el montaje. */
  faltan: ColmenaSinTocar[];
  /** De esas, cuántas tienen colonia viva. */
  faltanPobladas: number;
}

export interface PendienteDeLaVisita {
  fieldSessionId: string;
  locationId: string;
  /** Cajas que había en el sitio el día de la visita, cada una contada una vez. */
  total: number;
  /** Cuántas cajas recibieron cada actividad. Una caja con dos cosas sale en las dos filas. */
  porActividad: Record<Actividad, number>;
  /** Cajas sin ningún registro de esta visita. */
  sinActividad: number;
  /**
   * El pendiente de cada propósito declarado, en el orden del enum. **`null` si la visita no
   * declaró ninguno** —las anteriores a la pregunta—: ahí el pendiente es `sinTocar`, como siempre.
   */
  porProposito: PendienteDelProposito[] | null;
  /** Cajas del sitio sin ningun evento de ESTA jornada. */
  sinTocar: ColmenaSinTocar[];
  /** De esas, cuantas tienen colonia viva. Es la cifra que importa al salir. */
  sinTocarPobladas: number;
  /** Cuantas si recibieron algo en esta jornada. */
  tocadas: number;
  retiros: RetiroPendiente[];
}

const DIA_MS = 24 * 3600_000;

export async function pendientesDeLaVisita(
  fieldSessionId: string,
  ahora: Date = new Date(),
): Promise<PendienteDeLaVisita | null> {
  const visita = await prisma.fieldSession.findUnique({
    where: { id: fieldSessionId },
    select: { id: true, locationId: true, startedAt: true, purposes: true, location: { select: { timezone: true } } },
  });
  if (!visita) return null;

  // Los cuatro caminos por los que un evento de campo apunta a una colmena. Las FK las anadio
  // A9.1 para poder leer la visita entera desde su rastro, y aqui se usan al reves: de los
  // eventos a las cajas que tocaron. **La varroa faltaba** aunque `registrarConteoDeVarroa` la
  // liga a la visita igual que sus hermanos (V-3).
  const eventos = await prisma.fieldEvent.findMany({
    where: { fieldSessionId },
    select: {
      inspection: { select: { colony: { select: { hiveId: true } } } },
      colonyEvent: { select: { eventType: true, colony: { select: { hiveId: true } } } },
      apiaryHarvestEvent: { select: { colony: { select: { hiveId: true } } } },
      varroaCount: { select: { colony: { select: { hiveId: true } } } },
    },
  });

  /** Por caja, lo que se le hizo en esta visita. */
  const hecho = new Map<string, Set<Actividad>>();
  const anotar = (hiveId: string | undefined, a: Actividad) => {
    if (!hiveId) return;
    if (!hecho.has(hiveId)) hecho.set(hiveId, new Set());
    hecho.get(hiveId)!.add(a);
  };
  for (const e of eventos) {
    anotar(e.inspection?.colony.hiveId, "inspeccion");
    if (e.colonyEvent) {
      const t = e.colonyEvent.eventType;
      anotar(e.colonyEvent.colony.hiveId, t === "feeding" ? "alimentacion" : t === "treatment" ? "tratamiento" : "otro");
    }
    anotar(e.apiaryHarvestEvent?.colony.hiveId, "cosecha");
    anotar(e.varroaCount?.colony.hiveId, "varroa");
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
  //   1. toda caja cuya colocacion de ESE DIA es en este sitio; mas
  //   2. las que hoy apuntan aqui y no tienen NINGUNA colocacion ese dia.
  //
  // El (2) cubre ademas un estado medido y no una hipotesis: el comentario de
  // `crearColocacionInicial` registra *"10 de 29 colmenas sin ninguna colocacion"* sobre los datos
  // reales el 2026-09-15 — las diez de Apiario Las Nubes, por un guion que no la abria. Una
  // consulta que mire solo colocaciones devuelve CERO para esas diez.
  //
  // **Se mide el DIA de la visita, no el instante** (V-4/V-H2, Daniel, 2026-10-08). El traslado es
  // de dia (ADR-112): cierra la colocacion de origen y abre la de destino a medianoche UTC del dia
  // que se teclea. #685 miraba la colocacion que cubre el instante de inicio, y con eso una visita
  // al origen la manana del traslado ya no veia la caja, y una al destino si. La regla de Daniel es
  // la contraria: **la caja sigue en el origen todo ese dia y cuenta en el destino desde el
  // siguiente.** Asi que, de las colocaciones que tocan el dia, manda la mas antigua. El dia es el
  // del sitio, en su zona (Panama si no la declara).
  const dia = new Date(`${mostrarFecha(visita.startedAt, visita.location.timezone ?? ZONA_POR_DEFECTO)}T00:00:00.000Z`);
  const tocaElDia = { startedAt: { lt: new Date(dia.getTime() + DIA_MS) }, OR: [{ endedAt: null }, { endedAt: { gte: dia } }] };

  const [aqui, apuntanAqui] = await Promise.all([
    prisma.hivePlacement.findMany({ where: { locationId: visita.locationId, ...tocaElDia }, select: { hiveId: true } }),
    prisma.hive.findMany({ where: { locationId: visita.locationId }, select: { id: true } }),
  ]);
  const candidatas = [...new Set([...aqui.map((c) => c.hiveId), ...apuntanAqui.map((h) => h.id)])];
  const colocacionesDelDia = candidatas.length
    ? await prisma.hivePlacement.findMany({
        where: { hiveId: { in: candidatas }, ...tocaElDia },
        orderBy: [{ startedAt: "asc" }, { id: "asc" }],
        select: { hiveId: true, locationId: true },
      })
    : [];
  const sitioDelDia = new Map<string, string>();
  for (const c of colocacionesDelDia) if (!sitioDelDia.has(c.hiveId)) sitioDelDia.set(c.hiveId, c.locationId);
  const apuntan = new Set(apuntanAqui.map((h) => h.id));
  const ids = candidatas.filter((id) => (sitioDelDia.has(id) ? sitioDelDia.get(id) === visita.locationId : apuntan.has(id)));

  const cajas = (
    await prisma.hive.findMany({
      where: { id: { in: ids } },
      orderBy: { identifier: "asc" },
      select: { id: true, identifier: true, colonies: { where: { endedAt: null }, select: { status: true } } },
    })
  ).map((c) => ({ hiveId: c.id, identifier: c.identifier, poblada: c.colonies.some((k) => k.status === "active") }));

  const sinTocar = cajas.filter((c) => !hecho.has(c.hiveId));
  const porActividad = Object.fromEntries(
    ACTIVIDADES.map((a) => [a, cajas.filter((c) => hecho.get(c.hiveId)?.has(a)).length]),
  ) as Record<Actividad, number>;

  // En el orden del enum y no en el que se declararon: la pantalla sale igual en toda visita.
  const declarados = new Set(visita.purposes);
  const porProposito = visita.purposes.length
    ? (Object.keys(LO_QUE_PIDE) as VisitPurpose[])
        .filter((p) => declarados.has(p))
        .map((proposito) => {
          const pide: readonly Actividad[] = LO_QUE_PIDE[proposito];
          const faltan = pide.length ? cajas.filter((c) => !pide.some((a) => hecho.get(c.hiveId)?.has(a))) : [];
          return { proposito, faltan, faltanPobladas: faltan.filter((c) => c.poblada).length };
        })
    : null;

  return {
    fieldSessionId: visita.id,
    locationId: visita.locationId,
    total: cajas.length,
    porActividad,
    sinActividad: sinTocar.length,
    porProposito,
    sinTocar,
    sinTocarPobladas: sinTocar.filter((c) => c.poblada).length,
    tocadas: cajas.length - sinTocar.length,
    retiros: await retirosPendientes(visita.locationId, ahora),
  };
}
