/**
 * El cierre de una cosecha de miel: qué miel era, cuánto pesó, y cuánta humedad tenía.
 *
 * **Qué cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §5, la última fila del Anexo B
 * que quedaba sin construir. Sus dos campos son de etapa **cierre** —*«se pesa en la
 * extracción, no en el apiario»*— así que necesitan el mismo camino que ADR-121 abrió
 * para los tratamientos.
 *
 * ## Lo que este módulo NO hace, y es la mitad del trabajo
 *
 * **No guarda la humedad.** El Anexo la marca «parcial» y, medido el 2026-09-14, eso
 * no describe un mecanismo a medias:
 *
 * - `Measurement` ya admite `lotId`, y una cosecha de apiario **crea** un `Lot`;
 * - `PANEL_DEL_SUJETO` no restringe `lotId`, así que una lectura de `moisture` sobre
 *   un lote de miel **se acepta hoy**;
 * - `LotType` ya tiene `honey`, y su propio comentario dice que A3 decidió que la miel
 *   reusa la maquinaria del lote **sin modificarla**.
 *
 * O sea: la humedad ya funcionaba y **nadie la encontraba**. Es la misma forma que
 * `coverage_until` tuvo durante una semana (ADR-118): un mecanismo completo al que
 * ninguna pantalla apunta. Lo que faltaba —y lo que `humedadDeLaMiel` añade— es
 * **leerla junto a la cosecha**, para que quien mira una extracción vea el número que
 * decide si esa miel fermenta.
 *
 * Una columna `moisturePct` aquí habría sido un segundo sitio para el mismo dato, sin
 * instrumento, sin método y sin quién lo midió.
 */
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { recordAuditEvent } from "../audit";
import type { HoneyType, ProvenanceClass } from "../../generated/prisma/client";
import { recordMeasurement } from "../traceability/measurements";
import { fueraDeRango } from "../equipos/modos";

/** Una entrada que el cierre rechaza. */
export class CierreDeCosechaInvalido extends Error {}

export const TIPOS_DE_MIEL = ["multifloral", "monofloral_declarada", "mielato"] as const satisfies readonly HoneyType[];

export function exigeTipoDeMiel(valor: unknown): HoneyType {
  if (typeof valor !== "string" || !(TIPOS_DE_MIEL as readonly string[]).includes(valor)) {
    throw new CierreDeCosechaInvalido("tipo_de_miel_desconocido");
  }
  return valor as HoneyType;
}

export interface CompletarCierreDeCosechaInput {
  apiaryHarvestEventId: string;
  honeyType?: string | null;
  /** Kilos extraídos. Se pesa en la extracción, no en el apiario. */
  extractedWeightKg?: number | string | null;
  /** Obligatoria **sólo** si se cambia un valor ya escrito. Misma regla que ADR-121. */
  reason?: string | null;
}

/**
 * Completa —o corrige— el cierre de una cosecha.
 *
 * Misma distinción que ADR-121, y por la misma razón: **completar** un dato que siempre
 * iba a llegar al extraer no lleva razón; **cambiar** uno ya escrito sí, y el valor
 * anterior queda en `before`.
 */
export async function completarCierreDeCosecha(userAccountId: string, input: CompletarCierreDeCosechaInput) {
  const cosecha = await prisma.apiaryHarvestEvent.findUnique({
    where: { id: input.apiaryHarvestEventId },
    include: { colony: { include: { hive: true } } },
  });
  if (!cosecha) throw new ApiaryAccessError("apiary_harvest_not_found");
  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: cosecha.colony.hive.projectId, locationId: cosecha.colony.hive.locationId },
  ]);

  const tocaTipo = input.honeyType !== undefined;
  const tocaPeso = input.extractedWeightKg !== undefined;
  if (!tocaTipo && !tocaPeso) throw new CierreDeCosechaInvalido("nada_que_completar");

  const honeyType =
    !tocaTipo || input.honeyType === null || input.honeyType === "" ? null : exigeTipoDeMiel(input.honeyType);

  let extractedWeightKg: number | null = null;
  if (tocaPeso && input.extractedWeightKg !== null && input.extractedWeightKg !== "") {
    const n = typeof input.extractedWeightKg === "number" ? input.extractedWeightKg : Number(input.extractedWeightKg);
    // Cero kilos extraídos es un dato legítimo —se abrió la caja y no había miel— así
    // que sólo se rechaza lo imposible: negativo o no numérico.
    if (!Number.isFinite(n) || n < 0) throw new CierreDeCosechaInvalido("peso_invalido");
    extractedWeightKg = n;
  }

  const corrige =
    (tocaTipo && cosecha.honeyType !== null) || (tocaPeso && cosecha.extractedWeightKg !== null);
  if (corrige && !input.reason?.trim()) throw new CierreDeCosechaInvalido("razon_requerida_para_corregir");

  const despues = await prisma.$transaction(async (tx) => {
    const fila = await tx.apiaryHarvestEvent.update({
      where: { id: input.apiaryHarvestEventId },
      data: {
        ...(tocaTipo ? { honeyType } : {}),
        ...(tocaPeso ? { extractedWeightKg } : {}),
      },
    });
    // ADR-161 — el peso de la extracción entra en el LIBRO del lote. Antes sólo entraba si se
    // escribía al cosechar; completado aquí, que es lo normal (se pesa al extraer), el lote de
    // miel quedaba sin saldo y nada de lo que se le haga después podía cuadrar su balance.
    // Completar abona lo pesado; corregir asienta sólo la diferencia, y el asiento original
    // se queda. Borrar el peso no asienta nada: «ya no se sabe» no es miel que salió.
    if (tocaPeso && extractedWeightKg !== null) {
      const antes = cosecha.extractedWeightKg === null ? null : Number(cosecha.extractedWeightKg);
      const delta = antes === null ? extractedWeightKg : extractedWeightKg - antes;
      if (delta !== 0) {
        await tx.quantityEvent.create({
          data: {
            lotId: cosecha.resultingLotId,
            eventType: antes === null ? "received" : delta > 0 ? "adjustment_increase" : "adjustment_decrease",
            quantity: Math.abs(delta),
            unit: "kg",
            occurredAt: cosecha.occurredAt,
            createdBy: userAccountId,
            provenanceClass: cosecha.provenanceClass,
            sourceReference: `apiary_harvest_event:${cosecha.id}`,
          },
        });
      }
    }
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: corrige ? "apiary_harvest.correct" : "apiary_harvest.close",
        entityType: "apiary_harvest_event",
        entityId: fila.id,
        before: cosecha,
        after: fila,
        reason: input.reason?.trim() || undefined,
        sourceInterface: "apiary.close",
      },
      tx,
    );
    return fila;
  });

  return { cosecha: despues, esCorreccion: corrige };
}

/**
 * Las dos escalas que un refractometro de miel puede leer, y la variable canonica de cada una.
 * `moisture` es la escala H% del aparato: el agua, no un calculo desde el Brix.
 */
export const ESCALAS_DE_MIEL = { brix: { variable: "brix", unidad: "Bx" }, agua: { variable: "moisture", unidad: "%" } } as const;

export interface LecturaDeRefractometroInput {
  apiaryHarvestEventId: string;
  /** El DIA de la lectura (medianoche UTC, `fechaDeDia`). */
  occurredAt: Date;
  /** Lo que marco la escala de Brix. `null` = esa escala no se leyo. */
  brix?: number | null;
  /** Lo que marco la escala H%. `null` = no se leyo — **nunca se deriva del Brix**. */
  aguaPct?: number | null;
  /** Con que refractometro. Opcional: sin el, la lectura se guarda igual (ADR-080). */
  instrumentId?: string | null;
  provenanceClass: ProvenanceClass;
  claveDeEnvio?: string | null;
}

/**
 * La lectura del refractometro de miel de una cosecha -- ADR-160.
 *
 * **Va sobre el LOTE, no sobre la cosecha.** La miel es un `Lot` (A3), y el lote es lo que
 * sigue a la miel cuando se divide, se filtra, se guarda, se envasa y se muestrea hasta la
 * cata. Una columna en la cosecha se quedaria atras en la primera division.
 *
 * **Una lectura por cosecha** (Daniel, 2026-09-17): si el lote ya tiene una de esa escala,
 * se rechaza — lo que toca entonces es CORREGIR la que hay (`correctMeasurement`), que
 * conserva la original, no apilar una segunda que compita con ella.
 *
 * **Con instrumento, se comprueba ANTES de escribir nada** que ese aparato tenga un modo
 * sobre miel para cada escala leida y que el numero caiga en su rango. Asi una lectura de
 * dos escalas no queda escrita a medias por un error que se podia ver de antemano.
 */
export async function registrarLecturaDeRefractometro(userAccountId: string, input: LecturaDeRefractometroInput) {
  const cosecha = await prisma.apiaryHarvestEvent.findUnique({
    where: { id: input.apiaryHarvestEventId },
    include: { colony: { include: { hive: true } } },
  });
  if (!cosecha) throw new ApiaryAccessError("apiary_harvest_not_found");
  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: cosecha.colony.hive.projectId, locationId: cosecha.colony.hive.locationId },
  ]);

  const leidas = (
    [
      ["brix", input.brix],
      ["agua", input.aguaPct],
    ] as const
  ).filter(([, v]) => v != null) as (readonly ["brix" | "agua", number])[];
  if (leidas.length === 0) throw new CierreDeCosechaInvalido("lectura_vacia");
  for (const [, v] of leidas) if (!Number.isFinite(v)) throw new CierreDeCosechaInvalido("lectura_no_numerica");

  const previas = await prisma.measurement.findMany({
    where: { lotId: cosecha.resultingLotId, variable: { in: leidas.map(([e]) => ESCALAS_DE_MIEL[e].variable) } },
    select: { variable: true },
  });
  if (previas.length > 0) throw new CierreDeCosechaInvalido(`ya_hay_lectura:${previas[0]!.variable}`);

  const modoPorEscala = new Map<string, string>();
  if (input.instrumentId) {
    const modos = await prisma.instrumentMeasurementMode.findMany({
      where: { equipmentId: input.instrumentId, retiredAt: null, materialState: "BEE_HONEY" },
    });
    for (const [escala, valor] of leidas) {
      const { variable } = ESCALAS_DE_MIEL[escala];
      const modo = modos.find((m) => m.variable === variable);
      if (!modo) throw new CierreDeCosechaInvalido(`el_instrumento_no_lee:${escala}`);
      const rango = { ...modo, rangeMin: modo.rangeMin == null ? null : Number(modo.rangeMin), rangeMax: modo.rangeMax == null ? null : Number(modo.rangeMax) };
      if (fueraDeRango(rango, valor)) throw new CierreDeCosechaInvalido(`fuera_del_rango:${escala}`);
      modoPorEscala.set(escala, modo.id);
    }
  }

  const creadas = [];
  for (const [escala, valor] of leidas) {
    const { variable, unidad } = ESCALAS_DE_MIEL[escala];
    creadas.push(
      await recordMeasurement(userAccountId, {
        lotId: cosecha.resultingLotId,
        variable,
        value: valor,
        unit: unidad,
        occurredAt: input.occurredAt,
        instrumentId: input.instrumentId ?? null,
        instrumentModeId: modoPorEscala.get(escala) ?? null,
        provenanceClass: input.provenanceClass,
        sourceReference: `apiary_harvest_event:${cosecha.id}`,
        // Una clave POR ESCALA: si la segunda falla y se reintenta, la primera no se duplica.
        claveDeEnvio: input.claveDeEnvio ? `${input.claveDeEnvio}:${escala}` : null,
      }),
    );
  }
  return creadas;
}

export interface HumedadDeMiel {
  measurementId: string;
  /** Valor canónico, en por ciento. */
  valor: number;
  unidad: string;
  /** Cuándo se midió — no cuándo se registró. */
  measuredAt: Date;
}

/**
 * La humedad de un lote de miel, leída de donde ya vive: `Measurement`.
 *
 * **Existe para que la humedad se ENCUENTRE.** El dato se podía registrar desde antes
 * de esta rebanada; lo que no se podía era verlo junto a la cosecha, y un número que
 * nadie ve no decide nada — y la humedad decide si la miel fermenta.
 *
 * **No autoriza y no pide principal**, misma disciplina que sus hermanas del módulo:
 * quien llama ya obtuvo el lote de una lectura que sí autoriza.
 */
export async function humedadDeLaMiel(lotId: string): Promise<HumedadDeMiel[]> {
  // Los nombres de columna son `value`, `unit` y `occurredAt`. Los inventé mal en la
  // primera versión y lo dijo el typecheck; ahora se copian de `lotProcess.ts`, que ya
  // lee esta misma variable de este mismo sujeto.
  const lecturas = await prisma.measurement.findMany({
    where: { lotId, variable: "moisture" },
    orderBy: { occurredAt: "desc" },
    take: 20,
    select: { id: true, value: true, unit: true, occurredAt: true },
  });
  return lecturas.map((m) => ({
    measurementId: m.id,
    valor: Number(m.value),
    unidad: m.unit,
    measuredAt: m.occurredAt,
  }));
}

export interface CosechaDeColonia {
  id: string;
  occurredAt: Date;
  framesHarvested: number | null;
  extractedWeightKg: number | null;
  honeyType: HoneyType | null;
  resultingLotId: string;
  /** Días de carencia que estaban vigentes al cosechar, si los había (ADR-115). */
  withinWithdrawalDays: number | null;
  /** Las lecturas de humedad del lote, de la más reciente a la más vieja. */
  humedad: HumedadDeMiel[];
  /** Las lecturas de Brix del lote (ADR-160). Misma forma que la humedad. */
  brix: HumedadDeMiel[];
}

/**
 * Las cosechas de una colonia, con su cierre y su humedad.
 *
 * **Existe porque no había ninguna.** `lib/apiary/harvest.ts` sólo sabía **escribir**:
 * la pantalla de la colmena tenía formulario de cosecha y **no listaba las cosechas**,
 * así que ni el tipo de miel ni el peso ni la humedad tenían dónde verse — y sin verse,
 * no hay dónde cerrarlos.
 *
 * **No autoriza y no pide principal**, misma disciplina que sus hermanas: quien llama ya
 * obtuvo la colonia de una lectura que sí autoriza.
 */
export async function cosechasDeColonia(colonyId: string): Promise<CosechaDeColonia[]> {
  const cosechas = await prisma.apiaryHarvestEvent.findMany({
    where: { colonyId },
    orderBy: { occurredAt: "desc" },
    select: {
      id: true,
      occurredAt: true,
      framesHarvested: true,
      extractedWeightKg: true,
      honeyType: true,
      resultingLotId: true,
      withinWithdrawalDays: true,
    },
  });
  // Una consulta por lote y no una por cosecha: `in` sobre los lotes, y se reparte.
  const humedades = await prisma.measurement.findMany({
    where: { lotId: { in: cosechas.map((c) => c.resultingLotId) }, variable: { in: ["moisture", "brix"] } },
    orderBy: { occurredAt: "desc" },
    select: { id: true, lotId: true, variable: true, value: true, unit: true, occurredAt: true },
  });
  const deLaCosecha = (c: { resultingLotId: string }, variable: string) =>
    humedades
      .filter((m) => m.lotId === c.resultingLotId && m.variable === variable)
      .map((m) => ({ measurementId: m.id, valor: Number(m.value), unidad: m.unit, measuredAt: m.occurredAt }));
  return cosechas.map((c) => ({
    ...c,
    extractedWeightKg: c.extractedWeightKg === null ? null : Number(c.extractedWeightKg),
    humedad: deLaCosecha(c, "moisture"),
    brix: deLaCosecha(c, "brix"),
  }));
}
