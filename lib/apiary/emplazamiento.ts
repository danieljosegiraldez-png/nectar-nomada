/**
 * El emplazamiento temporal: qué colmenas estuvieron, cuántos días, y qué avisar.
 *
 * **Qué cierra.** `48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md` §9. Un servicio de polinización
 * *«tiene apertura, vida y cierre propios, distintos de los del apiario»*, y al cerrarlo *«el
 * reporte se genera con el alcance de la ventana —no de la vida del apiario— con las colmenas
 * que estuvieron, los días efectivos y lo observado»*.
 *
 * ## Esto no se podía escribir hasta ayer
 *
 * «Las colmenas que estuvieron» es una pregunta sobre el **pasado**, y hasta ADR-126 el único
 * camino de una colmena a su apiario era `hive.locationId`, que dice dónde está **ahora**.
 * Con `HivePlacement` la pregunta tiene respuesta: se cruzan las colocaciones con la ventana
 * y sale quién estuvo y cuánto. **Es la primera vez que el módulo puede contestar algo
 * histórico**, y es la razón de que esta rebanada venga después de aquélla y no antes.
 *
 * ## Las dos alertas del §9, y por qué sólo una es nueva
 *
 * El Anexo pide *«dos alertas propias: que se acerque la floración con la meta incompleta, y
 * que se acerque una aspersión anunciada»*.
 *
 * - La de la **floración** es nueva y vive aquí, pura y probada con la entrada hostil.
 * - La de la **aspersión** ya existe desde ADR-127: `aplicacionesPrevistas` la calcula y el
 *   tablero del sitio la pinta como crítica —la primera de todas, por decisión del dueño—.
 *   **No se reimplementa.** Dos reglas para el mismo hecho terminan diciendo cosas distintas
 *   del mismo apiario, que es justo lo que pasó con la aritmética de la carencia (ADR-126).
 *   Lo que esta pantalla hace es **mirarla en el contexto del compromiso**.
 */
import { prisma } from "../db";

/** Milisegundos en un día. */
const DIA = 86_400_000;

/** Con cuántos días de antelación avisa la floración. */
export const DIAS_DE_AVISO_DE_FLORACION = 14;

export interface ColocacionEnVentana {
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * Días efectivos que una colmena estuvo en el sitio **dentro de la ventana**.
 *
 * **La aritmética que importa es el solape**, no la duración de la colocación ni la de la
 * ventana: una colmena que llegó antes de abrir el servicio y se fue a mitad cuenta sólo los
 * días de en medio. Sumar colocaciones enteras inflaría la factura de un servicio de
 * polinización, que es exactamente el número que un cliente mira.
 *
 * Una colocación abierta (`endedAt: null`) se recorta al final de la ventana. Y un solape
 * negativo cuenta **cero**, no un número negativo: `Math.max(0, …)` está antes de sumar, no
 * después — un negativo restaría días de otra colocación y el total saldría plausible y mal.
 *
 * Pura y exportada: se prueba con la entrada hostil sin construir un apiario.
 */
export function diasEfectivosDe(
  colocaciones: readonly ColocacionEnVentana[],
  ventanaIni: Date,
  ventanaFin: Date,
): number {
  let ms = 0;
  for (const c of colocaciones) {
    const ini = Math.max(c.startedAt.getTime(), ventanaIni.getTime());
    const fin = Math.min((c.endedAt ?? ventanaFin).getTime(), ventanaFin.getTime());
    ms += Math.max(0, fin - ini);
  }
  // Redondeo hacia arriba, como el resto del módulo: medio día en el sitio es un día en que
  // esas abejas polinizaron. `Math.floor` diría cero de una llegada de la tarde anterior.
  return Math.ceil(ms / DIA);
}

export interface PresenciaEnLaVentana {
  hiveId: string;
  identifier: string;
  diasEfectivos: number;
  /** Cuándo entró en la ventana — recortado a la ventana, no la fecha real de colocación. */
  desde: Date;
  /** Cuándo salió, o `null` si seguía al cerrar la ventana. */
  hasta: Date | null;
}

/**
 * Las colmenas que estuvieron en el sitio de un compromiso durante su ventana.
 *
 * **La ventana es la del COMPROMISO, no la del apiario**, que es literalmente lo que el §9
 * pide. Si el compromiso no tiene cierre —el caso de Toabré que el Anexo nombra— la ventana
 * se cierra en `ahora`: un servicio abierto se mide hasta hoy, no hasta el infinito.
 *
 * **No autoriza y no pide principal**, misma disciplina que `densidadDePolinizacion` y
 * `vitalesDeSitios`: quien llama ya obtuvo el compromiso de una lectura que sí autoriza.
 */
export async function colmenasDeLaVentana(compromisoId: string, ahora = new Date()): Promise<PresenciaEnLaVentana[]> {
  const compromiso = await prisma.pollinationCommitment.findUnique({
    where: { id: compromisoId },
    select: { locationId: true, startsAt: true, endsAt: true },
  });
  if (!compromiso) return [];
  const ini = compromiso.startsAt;
  const fin = compromiso.endsAt ?? ahora;
  if (fin <= ini) return [];

  // Las colocaciones de ESE sitio que solapan con la ventana. El filtro va en la consulta y
  // no en JS: un apiario con años de historia traería todas sus colocaciones para descartar
  // casi todas.
  const colocaciones = await prisma.hivePlacement.findMany({
    where: {
      locationId: compromiso.locationId,
      startedAt: { lt: fin },
      OR: [{ endedAt: null }, { endedAt: { gt: ini } }],
    },
    select: { hiveId: true, startedAt: true, endedAt: true, hive: { select: { identifier: true } } },
    orderBy: { startedAt: "asc" },
  });

  const porColmena = new Map<string, { identifier: string; cols: ColocacionEnVentana[] }>();
  for (const c of colocaciones) {
    const actual = porColmena.get(c.hiveId) ?? { identifier: c.hive.identifier, cols: [] };
    actual.cols.push({ startedAt: c.startedAt, endedAt: c.endedAt });
    porColmena.set(c.hiveId, actual);
  }

  return [...porColmena.entries()]
    .map(([hiveId, { identifier, cols }]) => {
      const desde = new Date(Math.max(Math.min(...cols.map((c) => c.startedAt.getTime())), ini.getTime()));
      // `hasta` es `null` sólo si ALGUNA colocación seguía abierta al cerrar la ventana.
      const abierta = cols.some((c) => c.endedAt === null || c.endedAt > fin);
      const hasta = abierta
        ? null
        : new Date(Math.max(...cols.map((c) => (c.endedAt ?? fin).getTime())));
      return { hiveId, identifier, diasEfectivos: diasEfectivosDe(cols, ini, fin), desde, hasta };
    })
    .filter((p) => p.diasEfectivos > 0)
    .sort((a, b) => a.identifier.localeCompare(b.identifier));
}

export interface AvisoDeFloracion {
  /** `true` cuando hay que avisar. */
  avisa: boolean;
  /** Días hasta que abra la floración. `null` si no hay ventana declarada. */
  diasHastaFloracion: number | null;
  /** Cuántas colmenas faltan para la meta. Cero si está cubierta. */
  faltan: number;
}

/**
 * «Que se acerque la floración con la meta incompleta» — el aviso propio del §9.
 *
 * **No avisa si no hay ventana de floración declarada.** Un compromiso sin `bloomStartsAt` no
 * está incumpliendo nada: no se sabe cuándo abre. Gritar ahí sería convertir una ausencia en
 * una afirmación (ADR-080), y enseñaría a ignorar el aviso.
 *
 * **Tampoco avisa cuando la floración ya abrió.** Entonces ya no «se acerca»: llegar tarde es
 * otro problema y otro aviso, y mezclarlos haría que este no se pudiera apagar nunca.
 *
 * **La meta es `committedHives` si el contrato fijó un número, y si no el mínimo del
 * cociente** —`hectáreas × densidad mínima`, redondeado hacia arriba—. En ese orden porque lo
 * que se incumple es el contrato; el cociente es la regla agronómica de la que sale cuando
 * nadie escribió un número.
 *
 * Pura y exportada: se prueba con la entrada hostil.
 */
export function avisoDeFloracion(
  compromiso: {
    bloomStartsAt: Date | null;
    committedHives: number | null;
    committedHectares: number;
    targetHivesPerHectareMin: number;
  },
  colmenasPresentes: number,
  ahora: Date,
  dentroDeDias: number = DIAS_DE_AVISO_DE_FLORACION,
): AvisoDeFloracion {
  const meta =
    compromiso.committedHives ??
    Math.ceil(compromiso.committedHectares * compromiso.targetHivesPerHectareMin);
  const faltan = Math.max(0, meta - colmenasPresentes);

  if (!compromiso.bloomStartsAt) return { avisa: false, diasHastaFloracion: null, faltan };

  const dias = Math.ceil((compromiso.bloomStartsAt.getTime() - ahora.getTime()) / DIA);
  // Ya abrió: no «se acerca».
  if (dias < 0) return { avisa: false, diasHastaFloracion: dias, faltan };
  return { avisa: dias <= dentroDeDias && faltan > 0, diasHastaFloracion: dias, faltan };
}
