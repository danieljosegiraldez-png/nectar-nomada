/**
 * El aviso de enjambrazón: qué colonias avisaron de que se iban.
 *
 * **Por qué existe esta lectura y no sólo las columnas.** Una columna que nadie
 * consulta es la misma cadena de texto con más pasos — la lección que dejó el
 * reporte de irregularidades. El Anexo B §2.2 dice para qué sirve el campo, con
 * el caso real al lado: *«Celdas reales → **aviso de enjambrazón antes de perder
 * la colonia.** Directamente relevante al ausentamiento de Toabré»*. Esta función
 * es ese aviso; sin ella, `queen_cell_kind` sería una casilla decorativa.
 *
 * **No autoriza y no pide principal**, misma disciplina que `vitalesDeSitios`,
 * `coloniasPorIrregularidad`, `carenciasVigentes` y `serieDeInfestacion`: quien
 * llama ya obtuvo el `locationId` de una lectura que sí autoriza.
 */
import { prisma } from "../db";
import { CELDAS_QUE_AVISAN } from "./estadoDeColonia";
import type { QueenCellKind } from "../../generated/prisma/client";

export interface AvisoDeEnjambrazon {
  colonyId: string;
  /** El identificador de la colmena, que es lo que se lee en el campo. */
  hiveIdentifier: string;
  /** Qué se vio: `emergencia` o `enjambrazon`. `reemplazo` no avisa — ver abajo. */
  kind: QueenCellKind;
  /** Cuántas, si alguien las contó. */
  count: number | null;
  /** Cuándo se vio. La inspección que lo dijo, no la más reciente. */
  occurredAt: Date;
  /** Días desde entonces, hacia arriba: medio día sigue contando como un día. */
  diasDesde: number;
}

/**
 * Las colonias de un sitio cuyo **último dato de celdas reales** avisa.
 *
 * Tres decisiones que deciden si el aviso sirve:
 *
 * **1. Manda la última inspección QUE MIRÓ, no la última inspección.** Una visita
 * posterior que no registró celdas —`queen_cell_kind` nulo— **no cancela** el
 * aviso: nadie miró, y tratar «no se registró» como «ya no hay» es convertir una
 * ausencia en una afirmación, que es justo lo que ADR-080 prohíbe. Para apagar el
 * aviso hay que mirar y decir `no_hay`.
 *
 * **2. `reemplazo` no avisa.** Una colonia que cambia de reina por su cuenta no se
 * está yendo; meterla aquí llenaría el aviso de casos que no piden nada y
 * enseñaría a ignorarlo. `emergencia` y `enjambrazon` sí: la primera dice que se
 * quedó sin reina de golpe, la segunda que se prepara para irse.
 *
 * **3. La ventana la elige quien llama.** Un aviso de hace ocho meses es historia,
 * no aviso, pero cuánto dura la temporada no lo decide este módulo — igual que
 * `carenciasVigentes` recibe la fecha en vez de preguntarla.
 */
export async function avisosDeEnjambrazon(
  locationId: string,
  desde: Date,
  ahora: Date = new Date(),
): Promise<AvisoDeEnjambrazon[]> {
  // Sólo las que MIRARON: `queenCellKind` no nulo. Descendente, para que la
  // primera de cada colonia sea la más reciente que dijo algo.
  const conDato = await prisma.inspection.findMany({
    where: {
      colony: { hive: { locationId } },
      occurredAt: { gte: desde, lte: ahora },
      queenCellKind: { not: null },
    },
    orderBy: { occurredAt: "desc" },
    select: {
      colonyId: true,
      queenCellKind: true,
      queenCellCount: true,
      occurredAt: true,
      colony: { select: { hive: { select: { identifier: true } } } },
    },
  });

  const DIA = 24 * 60 * 60 * 1000;
  const avisos: AvisoDeEnjambrazon[] = [];
  const yaVista = new Set<string>();
  for (const i of conDato) {
    if (yaVista.has(i.colonyId)) continue; // ya se leyó su dato más reciente
    yaVista.add(i.colonyId);
    if (!(CELDAS_QUE_AVISAN as readonly string[]).includes(i.queenCellKind!)) continue;
    avisos.push({
      colonyId: i.colonyId,
      hiveIdentifier: i.colony.hive.identifier,
      kind: i.queenCellKind!,
      count: i.queenCellCount,
      occurredAt: i.occurredAt,
      diasDesde: Math.ceil((ahora.getTime() - i.occurredAt.getTime()) / DIA),
    });
  }
  // Lo más reciente primero: un aviso de ayer se atiende antes que uno de hace
  // tres semanas. Al contrario de `serieDeInfestacion`, que es una serie y va
  // ascendente — aquí no se dibuja una curva, se decide a qué caja ir.
  return avisos;
}
