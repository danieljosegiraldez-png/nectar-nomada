/**
 * El reporte que pidió el dueño: intervención en el lote → perfil de tueste →
 * puntaje de taza, agrupable por proceso, varietal y muestra.
 *
 * **Sus palabras (2026-09-06):** «no se puede llevar de tarea de finca…
 * a probar taza de lote o batch de café que se tostó con cierto roasting
 * profile y puedo meter mis puntajes según CVA SCA scores y comparar con otros
 * y hacer reportes». Esto es lo último de esa frase.
 *
 * **Lo primero que hay que saber, medido el 2026-09-07 contra la copia de
 * producción:** la cadena existe entera en el esquema y **está vacía**. 45
 * lotes, 6 muestras, y **cero** tuestes, cero valoraciones, cero mapeos ciegos,
 * cero procesos de lote y cero fuentes de cosecha. Así que este reporte hoy no
 * enseña ninguna fila — y por eso devuelve, junto a las filas, un recuento de
 * **qué eslabón falta**: una tabla vacía se lee como «no hay nada que ver», y un
 * «0 de 45 lotes tienen proceso» se lee como lo que es, trabajo por registrar.
 *
 * **Las uniones, cada una comprobada en el esquema antes de escribirlas:**
 *
 *     Lot ── harvestEvent ── sources[] ── plantingCohort ── cultivarValue   (varietal)
 *     Lot ── lotProcesses[]                                                 (proceso)
 *     Lot ── transformationInputs[] ── transformation.roastSession          (tueste)
 *     Lot ── roastProfile ── recipeVersion                                  (perfil elegido)
 *     Lot ── samples[] ── blindMapping ── blindSample ── assessments[]      (puntajes)
 *
 * **Ninguna es una tabla nueva.** El reporte no guarda nada: lee y agrupa. Un
 * derivado que se persiste se queda viejo en silencio, y CLAUDE.md §28 exige que
 * un derivado declare su método — más fácil no persistirlo.
 */
import { prisma } from "../db";
import { lotWhereFromVisibility, resolveLotVisibility } from "./lots";
import { SIN_RECETA } from "./lotProcess";

/** Una fila del reporte: un proceso de un lote, con todo lo que cuelga de él. */
export interface FilaDeProceso {
  lotId: string;
  lotCode: string;
  lotProcessId: string;
  sequenceOrder: number;
  /** Nombre de la receta, o «Sin receta» — por aquí agrupa el reporte. */
  etiqueta: string;
  intent: string;
  targetMoisturePct: number;
  humedadDeCierre: number | null;
  /** Positivo = cerró por encima del objetivo. Null mientras no se cierre. */
  diferenciaContraObjetivo: number | null;
  /** Del catálogo `grado_proceso`, o «Sin declarar». Por aquí compara procesos. */
  gradoDeProceso: string;
  /** Del catálogo `estado_cereza`, o «Sin declarar». */
  estadoDeCereza: string;
  intervenciones: string[];
  varietales: string[];
  perfilesDeTueste: string[];
  puntajes: number[];
  /** Media simple de los puntajes. Null sin ninguno — nunca 0. */
  puntajePromedio: number | null;
  /** Parte 1, R6: si el proceso se cerró dividido, los códigos de las partes. Esa fila no cuenta como
   *  proceso en los grupos: sus partes ya cuentan. */
  divididoEn: string[] | null;
}

/**
 * Qué eslabón falta, en números.
 *
 * Existe porque un reporte vacío no dice por qué está vacío. Con esto, «0 filas»
 * se convierte en «45 lotes, 0 con proceso», que es accionable.
 */
export interface EslabonesQueFaltan {
  lotesVisibles: number;
  lotesConProceso: number;
  procesosCerrados: number;
  procesosConTueste: number;
  procesosConPuntaje: number;
}

export interface ReporteDeProceso {
  filas: FilaDeProceso[];
  faltan: EslabonesQueFaltan;
  /** Filas agrupadas por etiqueta de receta. */
  porProceso: { etiqueta: string; filas: number; puntajePromedio: number | null }[];
  /**
   * Agrupado por GRADO —Natural, Washed, Honey— que es lo que el dueño quiere
   * comparar de verdad: dos cafés de la misma finca procesados distinto. La
   * receta es cómo se llama el procedimiento; el grado es qué se le hizo al café.
   */
  porGrado: { grado: string; filas: number; puntajePromedio: number | null }[];
}

/** Media simple, o null. Nunca 0: un 0 es un puntaje, la ausencia no. */
function promedio(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;
}

/**
 * El reporte, para los lotes que el usuario puede ver.
 *
 * **La visibilidad es la misma que la del listado de lotes**, no una propia:
 * `resolveLotVisibility` + `lotWhereFromVisibility`. Un reporte con su propio
 * criterio de visibilidad es cómo se acaba enseñando en un agregado lo que la
 * lista oculta.
 */
export async function reporteDeProceso(userAccountId: string): Promise<ReporteDeProceso> {
  const visibility = await resolveLotVisibility(userAccountId);
  const where = lotWhereFromVisibility(visibility);
  if (where === null) {
    return {
      filas: [],
      faltan: { lotesVisibles: 0, lotesConProceso: 0, procesosCerrados: 0, procesosConTueste: 0, procesosConPuntaje: 0 },
      porProceso: [],
      porGrado: [],
    };
  }

  const lotes = await prisma.lot.findMany({
    where,
    orderBy: { lotCode: "asc" },
    include: {
      lotProcesses: {
        orderBy: { sequenceOrder: "asc" },
        include: {
          processRecipeVersion: { include: { recipe: true } },
          processGradeValue: true,
          cherryStateValue: true,
          closingMoistureMeasurement: true,
          interventions: { include: { catalogValue: true }, orderBy: { occurredAt: "asc" } },
          derivations: { select: { lot: { select: { lotCode: true } } } },
        },
      },
      // El varietal: cosecha → fuentes → cohorte → cultivar. Cada salto está
      // comprobado en el esquema; ninguno se supone.
      harvestEvent: {
        include: { sources: { include: { plantingCohort: { include: { cultivarValue: true } } } } },
      },
      // El tueste: este lote fue ENTRADA de una transformación cuyo
      // `roastSession` existe. Los tuestes producen un lote nuevo, así que
      // mirar las salidas no encontraría el tueste DE este café.
      transformationInputs: {
        include: { transformation: { include: { roastSession: { include: { recipeVersion: { include: { recipe: true } } } } } } },
      },
      roastProfile: { include: { recipeVersion: { include: { recipe: true } } } },
      samples: {
        include: {
          blindMappings: {
            include: { blindSample: { include: { assessments: { where: { status: "submitted" } } } } },
          },
        },
      },
    },
  });

  const filas: FilaDeProceso[] = [];
  let lotesConProceso = 0;

  for (const lot of lotes) {
    if (lot.lotProcesses.length > 0) lotesConProceso += 1;

    const varietales = [
      ...new Set(
        (lot.harvestEvent?.sources ?? [])
          .map((s) => s.plantingCohort?.cultivarValue?.value)
          .filter((v): v is string => typeof v === "string"),
      ),
    ].sort();

    const perfilesDeTueste = [
      ...new Set(
        [
          ...lot.transformationInputs
            .map((i) => i.transformation.roastSession?.recipeVersion)
            .filter((v) => v != null)
            .map((v) => `${v!.recipe.name} v${v!.version}`),
          ...(lot.roastProfile ? [`${lot.roastProfile.recipeVersion.recipe.name} v${lot.roastProfile.recipeVersion.version} (elegido)`] : []),
        ],
      ),
    ].sort();

    const puntajes = lot.samples
      .flatMap((s) => s.blindMappings)
      .flatMap((m) => m.blindSample.assessments)
      .map((a) => a.overallScore?.toNumber())
      .filter((n): n is number => typeof n === "number");

    for (const p of lot.lotProcesses) {
      const cierre = p.closingMoistureMeasurement?.value.toNumber() ?? null;
      filas.push({
        lotId: lot.id,
        lotCode: lot.lotCode,
        lotProcessId: p.id,
        sequenceOrder: p.sequenceOrder,
        etiqueta: p.processRecipeVersion?.recipe.name ?? SIN_RECETA,
        // Sin `?? "Sin declarar"`: las dos columnas son NOT NULL desde la
        // migración `20260908070000`, así que la rama del hueco era código
        // muerto que fingía cubrir un caso que la base ya no admite.
        gradoDeProceso: p.processGradeValue.value,
        estadoDeCereza: p.cherryStateValue.value,
        intent: p.intent,
        targetMoisturePct: p.targetMoisturePct.toNumber(),
        humedadDeCierre: cierre,
        diferenciaContraObjetivo: cierre === null ? null : Math.round((cierre - p.targetMoisturePct.toNumber()) * 100) / 100,
        intervenciones: p.interventions.map((i) => i.catalogValue.value),
        varietales,
        perfilesDeTueste,
        puntajes,
        puntajePromedio: promedio(puntajes),
        divididoEn: p.closureKind === "divided" ? p.derivations.map((d) => d.lot.lotCode) : null,
      });
    }
  }

  // Parte 1, R6 (tarea 9, 2026-10-02): una fila `divided` no cuenta como proceso en los grupos ni en lo que falta —sus
  // partes, con su propio proceso, ya cuentan—. `filas` del reporte sigue devolviéndolas todas, con su marca.
  const filasQueCuentan = filas.filter((f) => f.divididoEn === null);
  const agrupar = (clave: (f: FilaDeProceso) => string) => {
    const mapa = new Map<string, number[]>();
    for (const f of filasQueCuentan) {
      const acc = mapa.get(clave(f)) ?? [];
      acc.push(...f.puntajes);
      mapa.set(clave(f), acc);
    }
    return mapa;
  };
  const porEtiqueta = agrupar((f) => f.etiqueta);
  const porGradoMapa = agrupar((f) => f.gradoDeProceso);

  return {
    filas,
    faltan: {
      lotesVisibles: lotes.length,
      lotesConProceso,
      procesosCerrados: filasQueCuentan.filter((f) => f.humedadDeCierre !== null).length,
      procesosConTueste: filasQueCuentan.filter((f) => f.perfilesDeTueste.length > 0).length,
      procesosConPuntaje: filasQueCuentan.filter((f) => f.puntajes.length > 0).length,
    },
    porProceso: [...porEtiqueta.entries()]
      .map(([etiqueta, puntajes]) => ({
        etiqueta,
        filas: filasQueCuentan.filter((f) => f.etiqueta === etiqueta).length,
        puntajePromedio: promedio(puntajes),
      }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es")),
    porGrado: [...porGradoMapa.entries()]
      .map(([grado, puntajes]) => ({
        grado,
        filas: filasQueCuentan.filter((f) => f.gradoDeProceso === grado).length,
        puntajePromedio: promedio(puntajes),
      }))
      .sort((a, b) => a.grado.localeCompare(b.grado, "es")),
  };
}
