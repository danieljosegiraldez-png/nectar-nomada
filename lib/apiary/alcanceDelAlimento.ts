/**
 * Qué colonias se van a quedar sin alimento — el aviso que faltó en Toabré.
 *
 * **Por qué hace falta, teniendo ya los vitales del sitio.** `vitalesDeSitios`
 * resume **por sitio**: toma el `coverageUntil` más largo de todas sus
 * alimentaciones. Eso responde «¿hay algo cubierto en Toabré?» y **no** responde
 * «¿qué caja hay que ir a alimentar?». Una colmena alimentada en julio y olvidada
 * queda tapada por otra alimentada en agosto, que es la forma exacta del fallo que
 * el Anexo C §1.2 describe.
 *
 * **No autoriza y no pide principal**, misma disciplina que `vitalesDeSitios`,
 * `coloniasPorIrregularidad`, `carenciasVigentes`, `serieDeInfestacion` y
 * `avisosDeEnjambrazon`: quien llama ya obtuvo el `locationId` de una lectura que
 * sí autoriza.
 */
import { prisma } from "../db";
import { clasificarAlcance, diasDeAlcance, type EstadoDelAlcance } from "./alimentacion";

export interface AlcanceDeColonia {
  colonyId: string;
  /** El identificador de la colmena, que es lo que se lee en el campo. */
  hiveIdentifier: string;
  estado: EstadoDelAlcance;
  /** Cuándo se alimentó por última vez. Siempre hay una: sin ella no hay fila. */
  alimentadaEl: Date;
  /** Hasta cuándo alcanza, si quien alimentó lo dijo. */
  coverageUntil: Date | null;
  /** Días que faltan; negativo si ya venció. `null` cuando no hay fecha. */
  diasRestantes: number | null;
}

/**
 * Las colonias de un sitio que **ya fueron alimentadas** y cuyo alimento se acaba,
 * venció, o no se sabe.
 *
 * Cuatro decisiones que deciden si el aviso sirve:
 *
 * **1. Manda la ÚLTIMA alimentación de cada colonia**, no la más larga ni
 * cualquiera. Alimentar otra vez reemplaza el plazo anterior, y quedarse con el
 * máximo dejaría vigente una estimación que quien volvió ya corrigió.
 *
 * **2. `sin_fecha` se devuelve, no se descarta.** Una alimentación sin «alcanza
 * hasta» es una colonia de la que **no se puede avisar**, y esconderla la contaría
 * como tranquila. Es el estado de Toabré: el alimento del 22 de julio vencía el 2
 * de septiembre y nadie lo sabía. El servicio **no** rechaza esa alimentación —las
 * de urgencia se registran sin saberlo, decisión escrita en `colonyEvents.ts`— así
 * que el sistema tiene que enseñar el hueco en vez de fingir que no existe.
 *
 * **3. Una colonia que NUNCA se alimentó no sale.** No todas necesitan alimento, y
 * meterlas llenaría el aviso de cajas que no piden nada. Lo que este aviso mira es
 * el compromiso ya tomado: alimenté, dije hasta cuándo, y se está acabando.
 *
 * **4. Una colonia terminada tampoco sale.** Avisar de que hay que alimentar una
 * caja que se dio por muerta es ruido, y es además la forma de aviso que enseña a
 * ignorar la sección.
 */
export async function alcanceDelAlimento(
  locationId: string,
  ahora: Date = new Date(),
  dentroDeDias = 14,
): Promise<AlcanceDeColonia[]> {
  const alimentaciones = await prisma.colonyEvent.findMany({
    where: {
      eventType: "feeding",
      colony: { status: "active", hive: { locationId } },
    },
    orderBy: { occurredAt: "desc" },
    select: {
      colonyId: true,
      occurredAt: true,
      coverageUntil: true,
      colony: { select: { hive: { select: { identifier: true } } } },
    },
  });

  const filas: AlcanceDeColonia[] = [];
  const yaVista = new Set<string>();
  for (const f of alimentaciones) {
    if (yaVista.has(f.colonyId)) continue; // ya se leyó su alimentación más reciente
    yaVista.add(f.colonyId);
    const estado = clasificarAlcance(f.coverageUntil, ahora, dentroDeDias);
    if (estado === "cubierto") continue; // nada que pedir todavía
    filas.push({
      colonyId: f.colonyId,
      hiveIdentifier: f.colony.hive.identifier,
      estado,
      alimentadaEl: f.occurredAt,
      coverageUntil: f.coverageUntil,
      diasRestantes: f.coverageUntil ? diasDeAlcance(f.coverageUntil, ahora) : null,
    });
  }

  // Lo más urgente primero: vencido antes que por vencer, y dentro de cada grupo
  // el que lleva más tiempo así. `sin_fecha` va al final — pide averiguar, no
  // correr— pero va, que es lo que lo distingue de esconderlo.
  const orden: Record<EstadoDelAlcance, number> = { vencido: 0, por_vencer: 1, sin_fecha: 2, cubierto: 3 };
  return filas.sort(
    (a, b) => orden[a.estado] - orden[b.estado] || (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0),
  );
}
