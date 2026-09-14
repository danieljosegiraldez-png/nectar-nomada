/**
 * Trasladar colmenas de un apiario a otro, en una sola operación.
 *
 * **Qué cierra.** `48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md` §8: *«La operación central de
 * la apicultura migratoria: mover un grupo de colmenas de un apiario a otro en un solo
 * gesto, no una por una»*, y la regla que la define: *«El traslado cierra la vigencia de
 * cada colmena en el apiario de origen y abre la del destino en la misma operación. Nunca
 * deja una colmena en dos lugares ni en ninguno.»*
 *
 * ## Por qué esta rebanada es de esquema, al contrario que las cinco anteriores
 *
 * ADR-118, ADR-122 y ADR-123 encontraron tres veces lo mismo: un mecanismo completo al que
 * ninguna pantalla llegaba. **Aquí es al revés.** `Hive.locationId` guarda el apiario
 * actual y nada más, y ningún evento de apiario tiene `location_id` propio —medido: cero
 * en `Inspection`, `ColonyEvent`, `ApiaryHarvestEvent` y `VarroaCount`, contra dos en
 * `Lot`—, así que el único camino de un evento a su apiario era el puntero actual. Mover
 * la colmena habría movido su historia entera. Buscar aquí un mecanismo escondido sería
 * aplicar el hallazgo anterior donde no aplica.
 *
 * ## La invariante, y quién la sostiene
 *
 * Una colmena tiene **exactamente una** colocación abierta, y su `locationId` coincide con
 * ella. No la sostiene la base: un `@@unique([hiveId, endedAt])` no serviría porque en
 * Postgres dos `NULL` no chocan —medido contra 18.6, con control positivo—. La sostiene
 * esta función, en una transacción, y la defiende `tests/apiary/traslado.test.ts`.
 *
 * ## Lo que este módulo NO hace, y no es por falta de tiempo
 *
 * El Anexo pide avisar *«si el destino tiene aplicaciones previstas o un periodo de
 * carencia corriendo»*, y dice por qué: *«Meter colmenas a un cultivo que va a ser
 * aspersado en tres días es el error que este módulo existe para evitar.»*
 *
 * **Las dos mitades ya se avisan — la segunda desde el 2026-09-14.** Cuando se escribió
 * este módulo no había ninguna tabla de aplicaciones previstas de fincas vecinas, así que
 * `avisosDeDestino` devolvía `aspersionesConsultadas: false` y la pantalla decía que nadie
 * lo había preguntado: honesto, y la mitad del trabajo. `NeighbourConsultation` (ADR-127)
 * cerró el hueco, y ahora el traslado sí puede decir *«el destino tiene una aspersión
 * anunciada en tres días»* — el error que, en palabras del Anexo, «este módulo existe para
 * evitar».
 *
 * **Lo que NO cambia es la distinción:** `aspersionesConsultadas: false` sigue
 * significando **«nadie ha preguntado»** y nunca «el destino está limpio», y por eso viaja
 * junto a `protocolo`, que dice si lo que se preguntó sigue vigente. Una consulta de hace
 * cinco semanas cumplió el protocolo entonces y no afirma nada de hoy.
 */
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { recordAuditEvent } from "../audit";
import { carenciasVigentes, diasQueFaltanDe, libreDesdeDe, type CarenciaVigente } from "./carencia";
import {
  aplicacionesPrevistas,
  estadoDelProtocolo,
  type AplicacionPrevista,
  type EstadoDelProtocolo,
} from "./consultaAVecinos";
import { TrasladoInvalido, exigeMotivoDeTraslado } from "./motivoDeTraslado";

// El vocabulario vive en `motivoDeTraslado.ts`, **sin `prisma` detrás**, porque
// `TrasladoForm.tsx` es `"use client"` y necesita los cuatro motivos: importar un valor de
// este archivo le metería `pg` en el paquete del navegador. Se re-exporta para que quien ya
// llame a este módulo no tenga que saber del reparto.
export {
  MOTIVOS_DE_TRASLADO,
  TrasladoInvalido,
  exigeMotivoDeTraslado,
  type MotivoDeTraslado,
} from "./motivoDeTraslado";

export interface TrasladarColmenasInput {
  hiveIds: string[];
  destinationLocationId: string;
  /**
   * **Campo de día, no instante.** El Anexo lo enseña como «13 sep 2026», y se parsea con
   * `fechaDeDia`, así que llega a medianoche UTC. Tratarlo como instante es el fallo que
   * tumbó la creación de colmenas el 2026-09-11 (ADR-112).
   */
  occurredAt: Date;
  reason: string;
  /** Tres estados: `null` es «no se anotó», distinto de `false`. */
  entrancesClosed?: boolean | null;
}

export interface ResultadoDeTraslado {
  trasladadas: number;
  origenLocationId: string;
  destinoLocationId: string;
  /** Cuántas colmenas quedan en cada apiario después. Lo mismo que se enseñó antes. */
  conteos: ConteosDeTraslado;
}

/**
 * Mueve un grupo de colmenas a otro apiario.
 *
 * **Un solo origen, exigido.** El Anexo enseña la pantalla como «Trasladar colmenas desde
 * NN-01 Santa Fe», y los conteos de antes y después son **por apiario**: un traslado con
 * orígenes mezclados esconde qué apiario perdió qué, que es justo el control que el Anexo
 * llama *«el único control contra un traslado a medias»*.
 *
 * **Todo o nada.** Una transacción, porque «nunca deja una colmena en dos lugares ni en
 * ninguno» no se puede cumplir con un bucle de escrituras independientes.
 */
export async function trasladarColmenas(
  userAccountId: string,
  input: TrasladarColmenasInput,
): Promise<ResultadoDeTraslado> {
  const ids = [...new Set(input.hiveIds)];
  if (ids.length === 0) throw new TrasladoInvalido("ninguna_colmena_seleccionada");
  if (ids.length !== input.hiveIds.length) throw new TrasladoInvalido("colmena_repetida");

  const motivo = exigeMotivoDeTraslado(input.reason);

  const colmenas = await prisma.hive.findMany({
    where: { id: { in: ids } },
    select: { id: true, identifier: true, locationId: true, projectId: true },
  });
  if (colmenas.length !== ids.length) throw new ApiaryAccessError("hive_not_found");

  // Un solo origen. Se comprueba antes de autorizar: un mensaje de «orígenes mezclados» no
  // filtra nada que quien selecciona colmenas no supiera ya.
  const origenes = [...new Set(colmenas.map((h) => h.locationId))];
  if (origenes.length > 1) throw new TrasladoInvalido("origenes_mezclados");
  const origenLocationId = origenes[0]!;
  if (origenLocationId === input.destinationLocationId) throw new TrasladoInvalido("destino_igual_al_origen");

  const destino = await prisma.location.findUnique({
    where: { id: input.destinationLocationId },
    select: { id: true, locationType: true },
  });
  if (!destino) throw new ApiaryAccessError("location_not_found");
  // Un apiario y no cualquier ubicación: mandar colmenas a un laboratorio no es un
  // traslado, es un dato malo que después nadie sabe leer.
  if (destino.locationType !== "apiary_site") throw new TrasladoInvalido("destino_no_es_apiario");

  // Se autoriza sobre LOS DOS apiarios, cada uno con su contexto completo.
  //
  // **El `projectId` en la segunda llamada no es copia y pega.** `apiaryScopeTargetsFor`
  // genera un objetivo por cada campo que reciba, así que pasar sólo el `locationId` del
  // destino habría probado **únicamente** el ámbito `location` — y un Farm Operator
  // asignado por PROYECTO, que es cómo están asignados los perfiles de esta casa, habría
  // sido rechazado al trasladar entre dos apiarios de su propio proyecto. Una compuerta que
  // niega el caso normal se quita a la semana; ésta se escribió mal primero y lo dijo leer
  // `requireApiaryAccess`, no una corrida.
  //
  // **Y el límite, dicho:** el proyecto no cambia al trasladar, así que para quien está
  // asignado por proyecto las dos llamadas pasan por el mismo objetivo y la segunda no
  // añade nada. Sí añade para quien esté asignado por ubicación. Es la misma semántica que
  // `createHive` ya usa —ambos objetivos, el primero que pase concede—; inventar aquí una
  // más estricta sería decidir política de acceso en un módulo de traslados.
  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: colmenas[0]!.projectId, locationId: origenLocationId },
  ]);
  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: colmenas[0]!.projectId, locationId: input.destinationLocationId },
  ]);

  // El identificador es único por apiario (`@@unique([locationId, identifier])`). Si el
  // destino ya tiene una `C-01`, el traslado chocaría a mitad de la transacción con un
  // error de Postgres. Se comprueba antes y se dice CUÁLES, que es lo único con lo que
  // quien está en el campo puede hacer algo.
  const yaEnDestino = await prisma.hive.findMany({
    where: { locationId: input.destinationLocationId, identifier: { in: colmenas.map((h) => h.identifier) } },
    select: { identifier: true },
  });
  if (yaEnDestino.length > 0) {
    throw new TrasladoInvalido(`identificador_ocupado_en_destino:${yaEnDestino.map((h) => h.identifier).sort().join(",")}`);
  }

  const abiertas = await prisma.hivePlacement.findMany({
    where: { hiveId: { in: ids }, endedAt: null },
    select: { id: true, hiveId: true, locationId: true, startedAt: true },
  });
  // Una colmena sin colocación abierta es la invariante rota, y se falla en vez de crear
  // una: inventarle un inicio taparía el defecto y dejaría la historia con un hueco.
  if (abiertas.length !== ids.length) throw new TrasladoInvalido("colocacion_abierta_ausente");
  // Trasladar con fecha anterior al inicio de la colocación vigente daría una vigencia
  // negativa — una colmena que salió antes de llegar.
  const anterior = abiertas.filter((p) => input.occurredAt < p.startedAt);
  if (anterior.length > 0) throw new TrasladoInvalido("fecha_anterior_a_la_colocacion_vigente");

  await prisma.$transaction(async (tx) => {
    for (const colmena of colmenas) {
      const abierta = abiertas.find((p) => p.hiveId === colmena.id)!;
      await tx.hivePlacement.update({ where: { id: abierta.id }, data: { endedAt: input.occurredAt } });
      await tx.hivePlacement.create({
        data: {
          hiveId: colmena.id,
          locationId: input.destinationLocationId,
          startedAt: input.occurredAt,
          reason: motivo,
          entrancesClosed: input.entrancesClosed ?? null,
          createdBy: userAccountId,
        },
      });
      const despues = await tx.hive.update({
        where: { id: colmena.id },
        data: { locationId: input.destinationLocationId },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "hive.transfer",
          entityType: "hive",
          entityId: colmena.id,
          before: colmena,
          after: despues,
          reason: motivo,
          sourceInterface: "apiary.service",
        },
        tx,
      );
    }
  });

  return {
    trasladadas: colmenas.length,
    origenLocationId,
    destinoLocationId: input.destinationLocationId,
    conteos: await conteosDeTraslado(origenLocationId, input.destinationLocationId),
  };
}

export interface ConteosDeTraslado {
  origen: { locationId: string; colmenas: number };
  destino: { locationId: string; colmenas: number };
}

/**
 * Cuántas colmenas hay en cada apiario ahora mismo.
 *
 * La pantalla lo enseña **antes** de confirmar, con la resta hecha —«Santa Fe: 12 → 9»—
 * porque el Anexo lo llama *«el único control contra un traslado a medias»*. Quien llama
 * hace la aritmética con el número de seleccionadas: aquí no se simula el resultado, se
 * dice lo que hay.
 *
 * **No autoriza y no pide principal**, misma disciplina que `vitalesDeSitios` y
 * `carenciasVigentes`: quien llama ya obtuvo los apiarios de una lectura que sí autoriza.
 */
export async function conteosDeTraslado(
  origenLocationId: string,
  destinoLocationId: string,
): Promise<ConteosDeTraslado> {
  const [origen, destino] = await Promise.all([
    prisma.hive.count({ where: { locationId: origenLocationId } }),
    prisma.hive.count({ where: { locationId: destinoLocationId } }),
  ]);
  return {
    origen: { locationId: origenLocationId, colmenas: origen },
    destino: { locationId: destinoLocationId, colmenas: destino },
  };
}

export interface AvisosDeDestino {
  locationId: string;
  /** Carencias todavía corriendo en las colonias que YA están en el destino. */
  carencias: Array<{ colonyId: string; vigentes: CarenciaVigente[] }>;
  /**
   * Si alguien ha consultado a los vecinos de este destino **alguna vez**.
   *
   * **Hasta el 2026-09-14 esto era siempre `false`** porque no había tabla de consultas, y
   * la pantalla decía «nadie lo ha preguntado» — que era honesto y no era suficiente. Con
   * `NeighbourConsultation` (ADR-127) ya es un hecho medido, y la diferencia que sostiene
   * sigue siendo la misma y sigue importando: `false` significa **«nadie ha preguntado»**,
   * nunca «el destino está limpio».
   */
  aspersionesConsultadas: boolean;
  /**
   * Cuándo vence el protocolo mensual del destino. Una consulta de hace cinco semanas
   * cumplió el protocolo entonces y **no dice nada de hoy**, así que la pantalla necesita
   * los dos datos: que se preguntó, y si sigue vigente.
   */
  protocolo: EstadoDelProtocolo;
  /**
   * Las aspersiones anunciadas en el destino que todavía no han ocurrido. **Es el aviso que
   * el Anexo E §8 pedía y no se podía dar:** *«Meter colmenas a un cultivo que va a ser
   * aspersado en tres días es el error que este módulo existe para evitar.»*
   */
  aspersionesAnunciadas: AplicacionPrevista[];
}

/**
 * Lo que hay que advertir antes de meter colmenas en un apiario.
 *
 * Devuelve las carencias que corren en el destino —si hay una, la miel que salga de ahí
 * arrastra el residuo— y **declara que la mitad de las aspersiones no se sabe**.
 */
export async function avisosDeDestino(destinoLocationId: string, enLaFecha: Date): Promise<AvisosDeDestino> {
  const colonias = await prisma.colony.findMany({
    where: { status: "active", hive: { locationId: destinoLocationId } },
    select: { id: true },
  });
  const carencias: AvisosDeDestino["carencias"] = [];
  for (const c of colonias) {
    const vigentes = await carenciasVigentes(c.id, enLaFecha);
    if (vigentes.length > 0) carencias.push({ colonyId: c.id, vigentes });
  }
  const [consultadasAlguna, protocolo, aspersionesAnunciadas] = await Promise.all([
    prisma.neighbourConsultation.count({ where: { locationId: destinoLocationId } }),
    estadoDelProtocolo(destinoLocationId, enLaFecha),
    aplicacionesPrevistas([destinoLocationId], enLaFecha),
  ]);
  return {
    locationId: destinoLocationId,
    carencias,
    aspersionesConsultadas: consultadasAlguna > 0,
    protocolo,
    aspersionesAnunciadas,
  };
}

export interface DestinoCandidato {
  locationId: string;
  nombre: string;
  colmenas: number;
  /** Cuántas colonias del destino tienen carencia corriendo en esa fecha. */
  coloniasConCarencia: number;
  /** Los días que faltan de la carencia más larga del destino, o `null` si no hay. */
  diasDeCarenciaMasLarga: number | null;
}

/**
 * Los apiarios a los que se puede trasladar, con lo que la pantalla necesita para avisar
 * **antes** de confirmar: cuántas colmenas tiene cada uno y si arrastra carencia.
 *
 * **Tres consultas y no una por apiario.** `avisosDeDestino` es el lector detallado de un
 * solo destino y hace una consulta de carencia por colonia; llamarlo en bucle sobre la
 * lista de apiarios daría un N+1 en la pantalla que más prisa tiene. Aquí se traen los
 * tratamientos de todas las colonias de todos los candidatos de una vez y se reparten.
 *
 * La regla de qué cuenta como carencia vigente **no se reimplementa**: se llama a
 * `libreDesdeDe` y `diasQueFaltanDe`, las dos puras y en `carencia.ts`, que es el único
 * sitio que decide esa cuenta. Se extrajeron al escribir esto, precisamente porque la
 * primera versión de esta función la había copiado — y dos copias de la misma aritmética
 * terminan diciendo cosas distintas del mismo apiario.
 */
export async function destinosCandidatos(
  organizationId: string,
  excluirLocationId: string,
  enLaFecha: Date,
): Promise<DestinoCandidato[]> {
  const apiarios = await prisma.location.findMany({
    where: { locationType: "apiary_site", organizationId, id: { not: excluirLocationId } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (apiarios.length === 0) return [];
  const ids = apiarios.map((a) => a.id);

  const colmenas = await prisma.hive.groupBy({
    by: ["locationId"],
    where: { locationId: { in: ids } },
    _count: { _all: true },
  });

  const tratamientos = await prisma.colonyEvent.findMany({
    where: {
      eventType: "treatment",
      treatmentWithdrawalDays: { not: null },
      occurredAt: { lte: enLaFecha },
      colony: { status: "active", hive: { locationId: { in: ids } } },
    },
    select: {
      colonyId: true,
      occurredAt: true,
      treatmentWithdrawalDays: true,
      colony: { select: { hive: { select: { locationId: true } } } },
    },
  });

  const porSitio = new Map<string, { colonias: Set<string>; maxDias: number }>();
  for (const t of tratamientos) {
    // La aritmética NO se repite aquí: sale de `carencia.ts`, que es el único sitio que la
    // decide. Reimplementarla habría dado dos verdades sobre el mismo apiario.
    const faltan = diasQueFaltanDe(libreDesdeDe(t.occurredAt, t.treatmentWithdrawalDays!), enLaFecha);
    if (faltan === 0) continue;
    const sitio = t.colony.hive.locationId;
    const actual = porSitio.get(sitio) ?? { colonias: new Set<string>(), maxDias: 0 };
    actual.colonias.add(t.colonyId);
    actual.maxDias = Math.max(actual.maxDias, faltan);
    porSitio.set(sitio, actual);
  }

  return apiarios.map((a) => {
    const c = porSitio.get(a.id);
    return {
      locationId: a.id,
      nombre: a.name,
      colmenas: colmenas.find((g) => g.locationId === a.id)?._count._all ?? 0,
      coloniasConCarencia: c?.colonias.size ?? 0,
      diasDeCarenciaMasLarga: c && c.maxDias > 0 ? c.maxDias : null,
    };
  });
}

/**
 * En qué apiario estaba una colmena en una fecha. **Es la razón de la tabla.**
 *
 * Devuelve `null` cuando no hay colocación que cubra esa fecha —por ejemplo una fecha
 * anterior a la primera— y eso es una respuesta, no un hueco: significa «no consta», que
 * es distinto de «en el apiario en que está hoy».
 *
 * El intervalo es **semiabierto**: `startedAt <= fecha < endedAt`. Con el día del traslado,
 * la colmena cuenta en el destino, no en los dos.
 */
export async function apiarioDeColmenaEn(hiveId: string, fecha: Date): Promise<string | null> {
  const p = await prisma.hivePlacement.findFirst({
    where: {
      hiveId,
      startedAt: { lte: fecha },
      OR: [{ endedAt: null }, { endedAt: { gt: fecha } }],
    },
    orderBy: { startedAt: "desc" },
    select: { locationId: true },
  });
  return p?.locationId ?? null;
}

/** El historial completo de una colmena, de la colocación más reciente a la más vieja. */
export async function historialDeColocaciones(hiveId: string) {
  return prisma.hivePlacement.findMany({
    where: { hiveId },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      locationId: true,
      location: { select: { name: true } },
      startedAt: true,
      endedAt: true,
      reason: true,
      entrancesClosed: true,
    },
  });
}
