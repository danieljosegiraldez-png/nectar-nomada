/**
 * La cola de secado: qué hay en cada área, qué le toca a cada unidad, y en qué orden.
 *
 * **El encargo (Daniel, 2026-09-27),** después de recorrer la aplicación con una cuenta de operario:
 * «ver muchos procesos o secados y manejos y no perder ojo al detalle y ser práctico y organizado
 * logísticamente hablando», y para el operario de secado «poder ver la cola de trabajo, que le
 * indique ordenado por urgencia, qué se debe hacer cuándo».
 *
 * Diseño: `docs/superpowers/specs/2026-09-27-cola-de-secado-y-ritmo-por-fase-design.md`, sección B.1.
 *
 * **Por qué esto existe y no existía.** `lib/traceability/ritmo.ts` calcula desde el 2026-09-13
 * exactamente esta cola —demora, lecturas debidas, puntaje de urgencia— y **sus únicos consumidores
 * eran sus pruebas**. Lo que faltaba era quién le diera los datos y quién pintara la respuesta. Esto
 * es lo primero; la pantalla es lo segundo.
 *
 * **La agrupación es por ÁREA con sus unidades dentro** (decisión 2 de Daniel): el operario recorre
 * el cuarto, no una lista de lotes. Y un lote repartido en cuatro zarandas se lee mal como una fila.
 *
 * **El permiso sigue a los LOTES, no a la instalación.** Se listan las corridas de secado cuyo lote
 * alcanza la visibilidad de quien mira (`resolveLotVisibility`, ADR-144) y después se agrupan por su
 * área. Exigir `location:manage_attributes` —lo que hace `listarInstalaciones`— le cerraría la cola a
 * un operario que sí puede ver y medir esos lotes, que es justo para quien se escribe.
 */
import { prisma } from "../db";
import { lotWhereFromVisibility, resolveLotVisibility } from "../traceability/lots";
import { estadoDeRitmo, puntajeDeUrgencia, type EstadoDeRitmo, type MetaConRitmo } from "../traceability/ritmo";

/** Lo que la receta declara para el secado de este lote, o nada si no se declaró. */
export interface RitmoDeclarado {
  readonly expectedHours: number | null;
  readonly turnEveryHours: number | null;
  readonly humedadMinPct: number | null;
  readonly humedadMaxPct: number | null;
}

/**
 * El estado de una unidad física —una cama o una zaranda— con el café que tiene encima.
 *
 * `estado` es una palabra y no un color: en el patio se mira a pleno sol y con las manos sucias, y un
 * matiz no sobrevive (la misma regla que gobierna la pantalla de equipos y el inventario).
 */
export interface UnidadEnCola {
  readonly clave: string;
  /**
   * `corrida` es el caso sin cama ni bandejas cargadas. **Aparece igual, a propósito**: una corrida
   * de secado abierta es café secándose, y esconderla porque nadie le asignó una unidad física sería
   * la peor respuesta posible en una pantalla cuyo trabajo es que no se te escape nada.
   */
  readonly tipo: "cama" | "bandeja" | "corrida";
  readonly nombre: string;
  readonly dryingRunId: string;
  readonly lotId: string;
  readonly lotCode: string;
  readonly proceso: string | null;
  readonly desde: Date;
  readonly horasEnFase: number;
  readonly ritmo: RitmoDeclarado;
  readonly volteos: number;
  readonly ultimoVolteo: Date | null;
  readonly horasSinVoltear: number | null;
  readonly humedadPct: number | null;
  readonly humedadMedidaEl: Date | null;
  readonly estado:
    | "al dia"
    | "le toca volteo"
    | "debe lectura"
    | "va tarde"
    | "cerca del objetivo"
    | "listo"
    | "sin receta declarada";
  readonly urgencia: number;
  readonly ritmoDelLote: EstadoDeRitmo;
}

export interface AreaEnCola {
  readonly locationId: string;
  readonly nombre: string;
  readonly unidades: readonly UnidadEnCola[];
  readonly libres: readonly { readonly nombre: string; readonly desde: Date | null }[];
}

export interface ColaDeSecado {
  readonly areas: readonly AreaEnCola[];
  readonly sinAmbito: boolean;
  readonly medidaEn: Date;
}

const HORAS = 3_600_000;

/** Hasta dónde se sube buscando el cuarto: una cama dentro de un estante dentro de un cuarto son 3. */
const PROFUNDIDAD_DE_AREA = 6;

/**
 * El área a la que pertenece una corrida: el cuarto de secado más cercano subiendo por los padres.
 *
 * **Por qué sube en vez de leer un campo** (2026-09-29, midiendo la cola contra la base de
 * demostración): una corrida **en bandejas** no tiene cama y puede no tener `locationId`, así que
 * agrupaba bajo «Sin área» — cuatro zarandas con café y ninguna área que las contuviera. Y una cama
 * puede colgar de un estante, no del cuarto, así que un solo salto tampoco basta.
 *
 * Si no hay ningún cuarto arriba, se devuelve el lugar más concreto que se conozca **con su nombre**:
 * agrupar bajo «Sin área» esconde el café en vez de ubicarlo.
 */
async function areaDeLaCorrida(candidatos: ReadonlyArray<string | null | undefined>) {
  const primero = candidatos.find((c): c is string => typeof c === "string" && c.length > 0);
  if (!primero) return null;

  const select = { id: true, name: true, locationType: true, parentLocationId: true } as const;
  let actual = await prisma.location.findUnique({ where: { id: primero }, select });
  const masConcreto = actual;

  for (let nivel = 0; nivel < PROFUNDIDAD_DE_AREA && actual; nivel++) {
    if (actual.locationType === "drying_facility") return { id: actual.id, nombre: actual.name };
    if (!actual.parentLocationId) break;
    actual = await prisma.location.findUnique({ where: { id: actual.parentLocationId }, select });
  }
  return masConcreto ? { id: masConcreto.id, nombre: masConcreto.name } : null;
}

const horasEntre = (a: Date, b: Date) => (b.getTime() - a.getTime()) / HORAS;

/**
 * Cuánto falta para entrar en el rango, en puntos de humedad. Negativo significa que ya está por
 * debajo del mínimo — pasarse de seco no se deshace, así que eso también pide atención.
 */
function distanciaAlRango(pct: number | null, min: number | null, max: number | null) {
  if (pct == null || min == null || max == null) return null;
  if (pct > max) return pct - max;
  if (pct < min) return pct - min;
  return 0;
}

/**
 * La palabra que va en la fila. El orden de las comprobaciones ES la prioridad que Daniel eligió:
 * primero el reloj de la receta, después la cercanía al objetivo.
 *
 * **`sin receta declarada` no es `al día`.** Un lote sin fase de secado en su receta no tiene ritmo
 * que comparar, y `ritmo.ts` devuelve `demora: null` —«no se sabe»— en vez de `false`. Decirle «al
 * día» sería inventar una tranquilidad que nadie midió (ADR-080: ausencia no es cero).
 */
export function estadoDeUnidad(input: {
  ritmo: RitmoDeclarado;
  horasSinVoltear: number | null;
  demora: boolean | null;
  debidas: number;
  humedadPct: number | null;
}): UnidadEnCola["estado"] {
  const { ritmo, horasSinVoltear, demora, debidas, humedadPct } = input;
  const dentroDelRango =
    humedadPct != null &&
    ritmo.humedadMinPct != null &&
    ritmo.humedadMaxPct != null &&
    humedadPct >= ritmo.humedadMinPct &&
    humedadPct <= ritmo.humedadMaxPct;

  if (dentroDelRango) return "listo";
  if (ritmo.turnEveryHours != null && horasSinVoltear != null && horasSinVoltear >= ritmo.turnEveryHours) {
    return "le toca volteo";
  }
  if (debidas > 0) return "debe lectura";
  if (demora === true) return "va tarde";
  const distancia = distanciaAlRango(humedadPct, ritmo.humedadMinPct, ritmo.humedadMaxPct);
  // Dos puntos de humedad o menos por encima del máximo: está a punto, y pasarse no se deshace.
  if (distancia != null && distancia > 0 && distancia <= 2) return "cerca del objetivo";
  if (ritmo.expectedHours == null && ritmo.turnEveryHours == null) return "sin receta declarada";
  return "al dia";
}

/**
 * El puntaje que ordena la cola. Suma el de `ritmo.ts` —que ya pesa demora y lecturas debidas— más lo
 * que Daniel añadió: la cercanía al rango. Un volteo vencido pesa por cada intervalo perdido, no una
 * vez, porque tres volteos sin hacer no es lo mismo que uno.
 */
export function urgenciaDeUnidad(input: {
  base: number;
  ritmo: RitmoDeclarado;
  horasSinVoltear: number | null;
  humedadPct: number | null;
}): number {
  const { base, ritmo, horasSinVoltear, humedadPct } = input;
  let total = base;

  if (ritmo.turnEveryHours != null && horasSinVoltear != null) {
    const vencidos = Math.floor(horasSinVoltear / ritmo.turnEveryHours);
    if (vencidos > 0) total += vencidos * 10;
  }

  const distancia = distanciaAlRango(humedadPct, ritmo.humedadMinPct, ritmo.humedadMaxPct);
  if (distancia != null) {
    // Cuanto más cerca del rango, más urgente: 2 puntos de distancia suman menos que 0,5.
    if (distancia > 0 && distancia <= 2) total += Math.round((2 - distancia) * 10);
    // Por debajo del mínimo ya se pasó, y eso es lo más urgente de todo.
    if (distancia < 0) total += 50;
  }
  return total;
}

/** Las metas con ritmo de la fase de secado, para que `ritmo.ts` diga qué lecturas se deben. */
function metasDeSecado(
  objetivos: readonly { variable: string; everyHours: number | null; phase: string | null }[],
  ultimaPorVariable: Map<string, Date>,
): MetaConRitmo[] {
  return objetivos
    .filter((o) => o.phase === "drying" && o.everyHours != null)
    .map((o) => ({
      variable: o.variable,
      everyHours: o.everyHours,
      ultimaLectura: ultimaPorVariable.get(o.variable) ?? null,
    }));
}

export async function colaDeSecado(userAccountId: string, ahora: Date = new Date()): Promise<ColaDeSecado> {
  const visibility = await resolveLotVisibility(userAccountId);
  const lotWhere = lotWhereFromVisibility(visibility);
  // `null` es «no puedes ver ninguna», que NO es «no hay ninguna»: devolver una cola vacía le diría a
  // una cuenta recién dada de alta que el beneficio no tiene café secándose (misma regla que
  // `clasificacionVerde` y `getLotList`).
  if (lotWhere === null) return { areas: [], sinAmbito: true, medidaEn: ahora };

  // Las corridas ABIERTAS cuyo lote de entrada alcanza la visibilidad de quien mira. La entrada se
  // resuelve por la transformación de apertura, igual que `corridaConPermiso`: una corrida no apunta
  // a su lote, se relaciona por transformaciones.
  const corridas = await prisma.dryingRun.findMany({
    where: {
      endedAt: null,
      transformations: { some: { inputs: { some: { lot: lotWhere } } } },
    },
    select: {
      id: true,
      startedAt: true,
      locationId: true,
      dryingBedLocationId: true,
      lotProcessId: true,
      location: { select: { id: true, name: true, locationType: true, parentLocationId: true } },
      dryingBedLocation: { select: { id: true, name: true, parentLocationId: true } },
      turningEvents: { select: { occurredAt: true }, orderBy: { occurredAt: "desc" } },
      trays: {
        where: { hasta: null },
        select: { desde: true, equipment: { select: { id: true, name: true, trayNumber: true } } },
      },
      transformations: {
        orderBy: { occurredAt: "asc" },
        take: 1,
        select: { inputs: { select: { lot: { select: { id: true, lotCode: true, locationId: true } } } } },
      },
    },
    orderBy: { startedAt: "asc" },
  });

  const areas = new Map<string, { nombre: string; unidades: UnidadEnCola[] }>();

  for (const c of corridas) {
    const lot = c.transformations[0]?.inputs[0]?.lot;
    if (!lot) continue;

    const proceso = c.lotProcessId
      ? await prisma.lotProcess.findUnique({
          where: { id: c.lotProcessId },
          select: {
            processGradeValue: { select: { value: true } },
            processRecipeVersion: {
              select: {
                fases: { where: { phase: "drying" }, select: { expectedHours: true, turnEveryHours: true, targetMoistureMinPct: true, targetMoistureMaxPct: true } },
                targets: { select: { variable: true, everyHours: true, phase: true } },
              },
            },
          },
        })
      : null;

    const faseDeSecado = proceso?.processRecipeVersion?.fases[0] ?? null;
    const ritmo: RitmoDeclarado = {
      expectedHours: faseDeSecado?.expectedHours ?? null,
      turnEveryHours: faseDeSecado?.turnEveryHours ?? null,
      humedadMinPct: faseDeSecado?.targetMoistureMinPct?.toNumber() ?? null,
      humedadMaxPct: faseDeSecado?.targetMoistureMaxPct?.toNumber() ?? null,
    };

    // Las mediciones del lote en esta fase, para la última humedad y para las lecturas debidas.
    const mediciones = await prisma.measurement.findMany({
      where: { lotId: lot.id, occurredAt: { gte: c.startedAt } },
      select: { variable: true, value: true, occurredAt: true },
      orderBy: { occurredAt: "desc" },
    });
    const ultimaPorVariable = new Map<string, Date>();
    for (const m of mediciones) if (!ultimaPorVariable.has(m.variable)) ultimaPorVariable.set(m.variable, m.occurredAt);
    const ultimaHumedad = mediciones.find((m) => m.variable === "moisture") ?? null;

    const ritmoDelLote = estadoDeRitmo({
      ahora,
      faseIniciada: c.startedAt,
      expectedHours: ritmo.expectedHours,
      metas: metasDeSecado(proceso?.processRecipeVersion?.targets ?? [], ultimaPorVariable),
    });

    const ultimoVolteo = c.turningEvents[0]?.occurredAt ?? null;
    const horasSinVoltear = ultimoVolteo ? horasEntre(ultimoVolteo, ahora) : horasEntre(c.startedAt, ahora);
    const humedadPct = ultimaHumedad?.value.toNumber() ?? null;

    const comun = {
      dryingRunId: c.id,
      lotId: lot.id,
      lotCode: lot.lotCode,
      proceso: proceso?.processGradeValue?.value ?? null,
      horasEnFase: ritmoDelLote.horasEnFase,
      ritmo,
      volteos: c.turningEvents.length,
      ultimoVolteo,
      horasSinVoltear,
      humedadPct,
      humedadMedidaEl: ultimaHumedad?.occurredAt ?? null,
      estado: estadoDeUnidad({
        ritmo,
        horasSinVoltear,
        demora: ritmoDelLote.demora,
        debidas: ritmoDelLote.debidas.length,
        humedadPct,
      }),
      urgencia: urgenciaDeUnidad({ base: puntajeDeUrgencia(ritmoDelLote), ritmo, horasSinVoltear, humedadPct }),
      ritmoDelLote,
    };

    // Una corrida va en cama O en bandejas, nunca en las dos: `cargarBandeja` lo rechaza con
    // `corrida_con_cama`. Así que aquí también son dos caminos y no una mezcla.
    const enBandejas: UnidadEnCola[] = c.trays.map((t) => ({
      ...comun,
      clave: `bandeja:${t.equipment.id}`,
      tipo: "bandeja" as const,
      nombre: t.equipment.name ?? `B-${String(t.equipment.trayNumber ?? 0).padStart(3, "0")}`,
      desde: t.desde,
    }));
    const unidades: UnidadEnCola[] = c.dryingBedLocation
      ? [{ ...comun, clave: `cama:${c.dryingBedLocation.id}`, tipo: "cama", nombre: c.dryingBedLocation.name, desde: c.startedAt }]
      : enBandejas.length > 0
        ? enBandejas
        : // Ni cama ni bandejas cargadas: la corrida se enseña igual. Ver el comentario de `tipo`.
          [{ ...comun, clave: `corrida:${c.id}`, tipo: "corrida", nombre: lot.lotCode, desde: c.startedAt }];

    // El área: el cuarto de secado más cercano, empezando por la cama, luego el lugar de la corrida
    // y por último el lugar del lote — que es lo que salva a una corrida en bandejas sin lugar.
    const resuelta = await areaDeLaCorrida([c.dryingBedLocation?.id, c.location?.id, lot.locationId]);
    const areaId = resuelta?.id ?? "sin-area";
    const area = areas.get(areaId) ?? { nombre: resuelta?.nombre ?? "Sin área", unidades: [] };
    area.unidades.push(...unidades);
    areas.set(areaId, area);
  }

  const salida: AreaEnCola[] = [];
  for (const [locationId, a] of areas) {
    salida.push({
      locationId,
      nombre: a.nombre,
      // Lo más urgente arriba. Con el mismo puntaje manda quien lleva más horas en fase, porque a
      // igualdad de aviso el que entró antes lleva más tiempo esperando.
      unidades: [...a.unidades].sort((x, y) => y.urgencia - x.urgencia || y.horasEnFase - x.horasEnFase),
      libres: [],
    });
  }
  salida.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));

  return { areas: salida, sinAmbito: false, medidaEn: ahora };
}
