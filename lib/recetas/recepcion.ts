/**
 * Los avisos de recepción — Parte 2a, §4.5.
 * docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md (y su §12, vuelto a medir el 2026-10-03)
 *
 * **Qué responde.** Para un lote cuyo proceso tiene receta: si esa receta declara un paso `reception` con una banda de Brix
 * (el diseño dice «por ejemplo Brix 18–24»), cada recepción de cereza de la ASCENDENCIA del lote, comparada UNA por UNA, que
 * cae fuera de la banda o llegó sin Brix; y, si el lote no tiene ninguna recepción en su ascendencia, ese hecho. **Avisa, no
 * bloquea**: ninguna puerta lo usa para rechazar nada.
 *
 * **Si la receta no declara lo que el motor usa, el motor no opina y lo dice** (PE-77/78, decisión de Daniel, 2026-10-05 a 08). La
 * receta declara TODOS los parámetros de lo que se juzga; no hay perfil de respaldo, ni por grado ni por ejes, ni la banda fija 18–24 de
 * la recepción prestada a una receta que no trae la suya. Dos huecos, y cada uno tiene su aviso en vez de su silencio:
 * `receta_sin_paso_de_recepcion` (la versión no tiene ningún paso `reception`) y `paso_de_recepcion_sin_banda` (el paso existe y no trae
 * límite de Brix, ni mínimo ni máximo). Lo único que se juzga es lo que la receta dijo.
 *
 * **Se calcula al leer y no se guarda nada.** El aviso sale de dos cosas que SÍ están guardadas —la recepción, con su Brix, y la
 * versión de la receta, con su paso—, así que cualquiera lo reproduce. No es el veredicto de la recepción: ése es
 * `evaluarBrixDeRecepcion` (`lib/beneficio/brixDeRecepcion.ts`: 18–24 fijo, guardado al recibir) y sigue siendo el de la
 * recepción; éste es el de la receta, o sea el del PROCESO. Pueden discrepar, y no hay nada que reconciliar: una receta con
 * otra banda no cambia lo que la recepción dice de sí misma.
 *
 * **De dónde sale la versión.** Del proceso que cubre al lote, por el resolvedor (`procesoQueCubre`). `null` si ninguno lo cubre
 * (sin proceso, o una mezcla de procesos: no hay UNA receta contra la que comparar). Un proceso de antes de la receta
 * obligatoria (R9) no tiene versión ni nada que comparar: sin ningún aviso, y es la ficha del proceso la que dice «Sin receta».
 *
 * **Decisiones de la casa — inferencia sobre el §4.5, no del paquete ni del diseño** (regla 13 del plan; el diseño sólo dice
 * «Brix 18–24» y las tres ramas: fuera de rango, dentro y sin recepción):
 * 1. La banda es la meta `brix` de momento `initial` del paso: la recepción es el principio de la vida del lote, y así define
 *    `processTargets.ts` el «inicial» (la lectura más temprana de la variable). Una meta de otro momento o de otra variable
 *    no es la banda; tampoco una con sólo valor objetivo y ningún límite: sin límites no hay «fuera». La escritura ya no deja
 *    guardar en un paso `reception` una meta que no sea `brix` inicial (tarea 3, `meta_de_recepcion_no_se_vigila`); el lector
 *    la ignora igual, por si una fila cruda —un importador, un SQL directo— la dejara, y una prueba lo fija.
 * 2. Una banda con un solo límite (sólo mínimo, o sólo máximo) es una banda: se juzga el lado que la receta declaró, y el otro no se
 *    inventa. Es la lectura de «la receta declara lo que usa»; si Daniel prefiere que falte un límite también sea un hueco, es un
 *    cambio en la selección de `targets` de abajo y en `juzgarBrix`, más sus pruebas.
 * 3. Una recepción presente sin Brix (`brix` nulo es legal) es su propio aviso, `recepcion_sin_brix`: no se puede comparar, y
 *    callarla se leería como «dentro de la banda». Sólo se da si hay banda con la que no se pudo comparar.
 * 4. Una misma recepción puede llegar por dos lotes de nivel 1 que luego se fusionaron (`origenDelLote` la devuelve dos veces):
 *    se compara una vez.
 * 5. Con varios pasos `reception` hay una banda por paso, y cada recepción se compara con cada una; cada aviso lleva la suya. El
 *    paso que no trae banda lo dice por su cuenta, y no impide que los demás juzguen.
 * 6. El orden de los avisos es el de leerlos: primero lo que dice la receta (los pasos sin banda, por `seq`), después que no hay
 *    recepción si no la hay, y después cada recepción por fecha de recibo y, dentro de ella, cada banda por `seq`.
 *
 * **Los tipos de aviso son una lista, y la lista es de aquí** (adjudicación I1 del cruce, 2026-10-04): `TIPOS_DE_AVISO_DE_RECEPCION`.
 * La tarea 13 pone el texto es/en de cada tipo y su guardia «cada tipo tiene texto» recorre esa lista, y en tiempo de ejecución no
 * hay otra forma de enumerarlos. Quien llama a esta función sigue recibiendo lo mismo: la firma no cambia.
 *
 * **Lee el proceso SÓLO por el resolvedor** (`tests/arquitectura/proceso-por-el-resolvedor.test.ts`) y la ascendencia por
 * `idsDeAscendencia`, que trabaja con el cliente que recibe y lanza `lineage_too_deep` en vez de cortar en silencio. No usa
 * `origenDelLote`: ése consulta con el cliente global aunque el llamador esté en una transacción, y devuelve dos veces la
 * recepción que llega por dos lotes de nivel 1 fusionados.
 *
 * **No autoriza** (Ruling INV): quien la llama ya autorizó el lote. Devuelve ids, fechas, Brix y avisos de las recepciones de TODA la
 * ascendencia, incluidas las de lotes que quien mira quizá no ve: por eso sólo una puerta puede importarla
 * (`tests/arquitectura/avisos-de-recepcion-por-una-puerta.test.ts`) y esa puerta pide `view` sobre el lote antes y filtra lo que enseña.
 */
import type { Prisma } from "../../generated/prisma/client";
import { enMinusculas, idsDeAscendencia, procesoQueCubre } from "../traceability/procesoDelLinaje";
import type { TipoDePaso } from "./vocabulario";

/** El tipo de paso que es la recepción: un id de `TIPOS_DE_PASO` (tarea 2), tipado para que renombrarlo rompa el compilador. */
const TIPO_DE_LA_RECEPCION: TipoDePaso = "reception";

/** La banda de Brix de un paso `reception`: su meta `brix` inicial, con al menos un límite. */
export interface BandaDeBrix {
  readonly stepId: string;
  readonly seq: number;
  readonly min: number | null;
  readonly max: number | null;
}

export type JuicioDelBrix = "dentro" | "bajo" | "alto" | "sin_brix";

/** Una recepción de la ascendencia, tal como se comparó. `brix` nulo: llegó sin medir. */
export interface RecepcionComparada {
  readonly recepcionId: string;
  readonly recibidaAt: Date;
  readonly brix: number | null;
}

/**
 * Los tipos de aviso que esta función puede devolver, **en una sola lista**. Quien necesite enumerarlos al correr —el guardia «cada
 * tipo tiene texto» de la tarea 13— no puede sacarlos de un tipo de TypeScript, que no existe en ejecución. El tipo
 * `TipoDeAvisoDeRecepcion` se deriva de esta lista y la unión `AvisoDeRecepcion` se construye sobre él: un tipo de la lista sin cuerpo
 * (abajo) y un aviso con un `tipo` que no esté aquí no compilan. Que cada tipo de la lista lo devuelva de verdad, con la entrada que
 * lo produce, lo prueba `recepcion.test.ts`.
 *
 * Los tres primeros son los de la adjudicación I1; los dos últimos, de PE-77/78, dicen que la receta no declara lo que se iba a juzgar.
 */
export const TIPOS_DE_AVISO_DE_RECEPCION = [
  "sin_recepcion",
  "recepcion_sin_brix",
  "brix_fuera_de_la_banda",
  "receta_sin_paso_de_recepcion",
  "paso_de_recepcion_sin_banda",
] as const;
export type TipoDeAvisoDeRecepcion = (typeof TIPOS_DE_AVISO_DE_RECEPCION)[number];

/** Lo que lleva cada aviso además de su `tipo`. Cada tipo de la lista tiene aquí su cuerpo: el índice de abajo no compila sin él. */
interface CuerpoDelAviso {
  readonly sin_recepcion: Record<never, never>;
  readonly recepcion_sin_brix: { readonly recepcionId: string; readonly recibidaAt: Date; readonly banda: BandaDeBrix };
  readonly brix_fuera_de_la_banda: {
    readonly recepcionId: string;
    readonly recibidaAt: Date;
    readonly brix: number;
    readonly lado: "bajo" | "alto";
    readonly banda: BandaDeBrix;
  };
  /** La versión no tiene ningún paso `reception`: la receta no declara la recepción y no se compara nada. */
  readonly receta_sin_paso_de_recepcion: Record<never, never>;
  /** Este paso `reception` no trae ningún límite de Brix en su meta inicial: no hay con qué comparar. */
  readonly paso_de_recepcion_sin_banda: { readonly stepId: string; readonly seq: number };
}

export type AvisoDeRecepcion = {
  [T in TipoDeAvisoDeRecepcion]: { readonly tipo: T } & CuerpoDelAviso[T];
}[TipoDeAvisoDeRecepcion];

export interface AvisosDeRecepcion {
  /** La versión del proceso que cubre al lote; `null` en un proceso de antes de la receta obligatoria. */
  readonly recipeVersionId: string | null;
  /** La versión declara al menos un paso `reception`. Sin él, la receta no declara la recepción y no se compara nada. */
  readonly declaraRecepcion: boolean;
  readonly bandas: readonly BandaDeBrix[];
  /** Las recepciones comparadas, una vez cada una, por fecha de recibo. Vacío si la receta no declara el paso. */
  readonly recepciones: readonly RecepcionComparada[];
  readonly avisos: readonly AvisoDeRecepcion[];
}

/** Un proceso de antes de la receta obligatoria: no hay versión, y no hay nada que comparar ni nada que la receta deba declarar. */
function procesoSinReceta(): AvisosDeRecepcion {
  return { recipeVersionId: null, declaraRecepcion: false, bandas: [], recepciones: [], avisos: [] };
}

/**
 * Un Brix contra una banda. Los límites son de la banda: 18 y 24 están dentro de 18–24. Un Brix ausente o que no es un número
 * es «sin_brix» y se mira ANTES de comparar: un NaN da falso en las dos comparaciones y saldría «dentro», que es justo el
 * veredicto que halaga.
 */
export function juzgarBrix(brix: number | null, banda: Pick<BandaDeBrix, "min" | "max">): JuicioDelBrix {
  if (brix === null || !Number.isFinite(brix)) return "sin_brix";
  if (banda.min !== null && brix < banda.min) return "bajo";
  if (banda.max !== null && brix > banda.max) return "alto";
  return "dentro";
}

/**
 * Los avisos de recepción del lote `lotId`, calculados ahora. `null` si ningún proceso lo cubre (sin proceso, o una mezcla).
 * Recibe el cliente de quien la llama: el de su transacción, o el global si sólo lee.
 */
export async function avisosDeRecepcion(tx: Prisma.TransactionClient, lotId: string): Promise<AvisosDeRecepcion | null> {
  const cobertura = await procesoQueCubre(tx, lotId);
  if (cobertura.vigente === null) return null;
  const recipeVersionId = cobertura.vigente.processRecipeVersionId;
  if (recipeVersionId === null) return procesoSinReceta();

  // Los pasos `reception` de la versión, cada uno con SU meta de Brix inicial: a lo sumo una, porque las metas de un paso son
  // únicas por (variable, momento). Una meta sin ningún límite no es una banda.
  const pasos = await tx.processRecipeStep.findMany({
    where: { recipeVersionId, stepTypeValue: { value: TIPO_DE_LA_RECEPCION, catalog: { key: "tipo_paso" } } },
    orderBy: { seq: "asc" },
    select: {
      id: true,
      seq: true,
      targets: {
        where: { variable: "brix", moment: "initial", OR: [{ minValue: { not: null } }, { maxValue: { not: null } }] },
        select: { minValue: true, maxValue: true },
      },
    },
  });
  // PE-77/78: la receta no declara la recepción. No se compara nada, y se dice.
  if (pasos.length === 0) {
    return { recipeVersionId, declaraRecepcion: false, bandas: [], recepciones: [], avisos: [{ tipo: "receta_sin_paso_de_recepcion" }] };
  }
  const bandas: BandaDeBrix[] = pasos.flatMap((p) =>
    p.targets.map((t) => ({
      stepId: p.id,
      seq: p.seq,
      min: t.minValue === null ? null : t.minValue.toNumber(),
      max: t.maxValue === null ? null : t.maxValue.toNumber(),
    })),
  );
  // PE-77/78: el paso existe y no trae banda. Ese paso no juzga nada, y se dice; los demás pasos siguen con la suya.
  const avisos: AvisoDeRecepcion[] = pasos
    .filter((p) => p.targets.length === 0)
    .map((p) => ({ tipo: "paso_de_recepcion_sin_banda" as const, stepId: p.id, seq: p.seq }));

  // Las recepciones de la ascendencia: las del propio lote (si es de nivel 1) y las de todos sus ancestros. Se leen por el
  // vínculo, que trae la recepción; una que llega por dos vínculos se queda con una.
  const propio = enMinusculas(lotId);
  const lotes = [propio, ...(await idsDeAscendencia(tx, propio))];
  const vinculos = await tx.loteDesdeRecepcion.findMany({
    where: { lotId: { in: lotes } },
    select: { recepcion: { select: { id: true, recibidaAt: true, brix: true } } },
  });
  const porId = new Map(vinculos.map((v) => [v.recepcion.id, v.recepcion] as const));
  const recepciones: RecepcionComparada[] = [...porId.values()]
    .sort((a, b) => a.recibidaAt.getTime() - b.recibidaAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => ({ recepcionId: r.id, recibidaAt: r.recibidaAt, brix: r.brix === null ? null : r.brix.toNumber() }));

  if (recepciones.length === 0) avisos.push({ tipo: "sin_recepcion" });
  for (const r of recepciones) {
    for (const banda of bandas) {
      const juicio = juzgarBrix(r.brix, banda);
      if (juicio === "dentro") continue;
      // `r.brix === null` ya lo dice `juicio`; se repite sólo para que el compilador sepa que abajo es un número.
      if (juicio === "sin_brix" || r.brix === null) {
        avisos.push({ tipo: "recepcion_sin_brix", recepcionId: r.recepcionId, recibidaAt: r.recibidaAt, banda });
        continue;
      }
      avisos.push({ tipo: "brix_fuera_de_la_banda", recepcionId: r.recepcionId, recibidaAt: r.recibidaAt, brix: r.brix, lado: juicio, banda });
    }
  }
  return { recipeVersionId, declaraRecepcion: true, bandas, recepciones, avisos };
}
