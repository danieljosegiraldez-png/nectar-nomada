/**
 * Las lecturas de cierre — Parte 2a, tarea 11 (diseño §5.3, 2026-10-03; la cadena de correcciones, adjudicación I4, 2026-10-04;
 * el lote de cada lectura y quién puede citarla, R5 de la revisión adversaria, 2026-10-05).
 * docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md
 *
 * **Qué son.** Al terminar una corrida o registrar un manejo, quien opera puede MARCAR las lecturas que motivaron ese cierre
 * («la humedad bajó a 11,2 %, por eso se acabó el secado»). Es opcional, y es el único insumo con el que, al convertir una receta
 * Libre en receta (`./convertir`), el borrador propone el FIN de un paso: nunca se deduce un umbral de una lectura que nadie marcó.
 *
 * **Quién las marca.** Las puertas que cierran un registro, DENTRO de su transacción: `endFermentationRun`
 * (`fermentation.ts`), `cerrarCorridaEnTransaccion` (`drying.ts`), que comparten `endDryingRun` y bajar la última bandeja
 * (`bandejasDelSecado.ts`), y `registrarIntervencion` del proceso (`lotProcess.ts`). Marcar y cerrar son una sola decisión: si una
 * lectura no vale, el registro no se cierra.
 *
 * **Qué lecturas se pueden marcar — UNA sola definición, `lecturasCandidatasDeCierre`**, que usa la validación de abajo y la que
 * la pantalla (tarea 13) envuelve con su autorización para ofrecerlas. La convención:
 * - de una fermentación o de un secado, **las que se tomaron en ESA corrida y en el lote que entró en ella**:
 *   `Measurement.fermentationRunId` o `dryingRunId` igual al id de la corrida —la clave que manda el formulario de lectura de la
 *   ficha cuando hay una corrida activa— Y `lotId` igual a `loteDeLaCorrida`, el lote de entrada que la puerta ya autorizó con
 *   `manage` (el mismo que leen `resolveRunSourceLot` y la apertura de bandejas) y que se pasa igual que `loteDelProceso` en un
 *   manejo. Lo segundo es R5: `recordMeasurement` ata la lectura a un lote y, aparte, a una corrida, sin comprobar que la corrida
 *   sea de ese lote; con sólo el id de la corrida, una lectura de CUALQUIER lote que quien la tomó gestionaba contaba como «de
 *   esa corrida» y entraba en el cierre de otra parcela;
 * - de un manejo del proceso, que no tiene lecturas propias, **las del lote donde vive el proceso o de un descendiente suyo** (el
 *   mismo café, como en `cerrarProceso`), tomadas desde que el proceso empezó: una lectura anterior a su inicio no puede haber
 *   motivado nada de él (la razón de `medicion_anterior_al_proceso`).
 * **Lo que se marca es la lectura VIGENTE.** Una lectura se corrige con otra fila que la apunta (`correctsId`; `correctMeasurement`
 * no se toca), y esa fila NO lleva la corrida: `correctMeasurement` copia el lote y no copia `fermentationRunId` ni `dryingRunId`
 * (lo dice su propio comentario, que lo señala y no lo arregla). Por eso la cadena se decide por su RAÍZ —la lectura original—, y de
 * la cadena se ofrece la última, la vigente: la reemplazada se rechaza con su propio código (`lectura_reemplazada`: «marca la
 * corrección»), no como ajena. Cualquier otra se rechaza `lectura_de_cierre_ajena`, y con ella todo el cierre. El mismo recorrido
 * sirve a `vigenteDe`, que lleva cualquier eslabón de una cadena a su vigente (R4: una lectura marcada puede haberse corregido
 * DESPUÉS, y quien la usa después —`./convertir`— tiene que usar la corrección).
 *
 * **Quién puede citar cada lectura (R5).** Las puertas piden `manage` sobre el lote de entrada de la corrida o sobre el lote donde
 * vive el proceso, y eso bastaba mientras todas las lecturas fueran de ese lote. Las de un manejo pueden ser de un DESCENDIENTE, en
 * otra parcela: `marcarLecturasDeCierre` pide además `view` sobre el lote de cada lectura que marca (`exigeVerLosLotes`), o un envío
 * forjado marcaría una lectura que la pantalla ocultó (la pantalla ya filtra lo que ofrece por ese mismo `view`).
 *
 * **No escribe un evento propio:** la marca lleva `createdBy` y `createdAt`, y nace en la misma transacción que el evento de su
 * puerta (`fermentation_run.end`, `drying_run.end`, `lot_process.record_intervention`).
 *
 * **Sólo tres tipos de registro**: `process_step_closing_reading` tiene una columna por corrida de fermentación, por corrida de
 * secado y por manejo del proceso. Un manejo DENTRO de una fermentación (`FermentationIntervention`) no la tiene.
 */
import type { Prisma } from "../../generated/prisma/client";
import { LotProcessError } from "../traceability/errorDeProceso";
import { requireLotAccess, TraceabilityAccessError } from "../traceability/lots";
import { idsDeDescendencia } from "../traceability/procesoDelLinaje";

/** Los registros que pueden decir «esta lectura motivó mi cierre»: los que tienen columna en `process_step_closing_reading`. */
export type RegistroConLecturaDeCierre = "fermentationRun" | "dryingRun" | "lotProcessIntervention";

/**
 * Dónde se marca, con lo que hace falta para saber qué lecturas son suyas. Una corrida lleva su lote de entrada
 * (`loteDeLaCorrida`) y un manejo del proceso el lote donde vive su proceso y cuándo empezó (`loteDelProceso`, `desde`): es lo único
 * con lo que se decide si una lectura es suya (ver la cabecera), y en los dos casos es el lote sobre el que la puerta ya pidió
 * `manage`.
 */
export type RegistroDeLecturasDeCierre =
  | { registro: "fermentationRun"; registroId: string; loteDeLaCorrida: string }
  | { registro: "dryingRun"; registroId: string; loteDeLaCorrida: string }
  | { registro: "lotProcessIntervention"; registroId: string; loteDelProceso: string; desde: Date };

/** Lo que se marca y dónde. `measurementIds` vacío no escribe nada; `marcadoPor` firma `createdBy`. */
export type MarcaDeLecturasDeCierre = { measurementIds: readonly string[]; marcadoPor: string } & RegistroDeLecturasDeCierre;

/** Una lectura tal como la leen las dos definiciones de abajo. */
export type LecturaDeCadena = {
  id: string;
  variable: string;
  value: Prisma.Decimal;
  unit: string;
  occurredAt: Date;
  lotId: string | null;
  correctsId: string | null;
};

const LECTURA = { id: true, variable: true, value: true, unit: true, occurredAt: true, lotId: true, correctsId: true } as const;

/**
 * Baja cada cadena de correcciones desde `raices`, un nivel por consulta: devuelve toda fila vista (las raíces y sus correcciones, a
 * cualquier profundidad), los ids que una corrección ya sustituyó y quién corrige a quién. Lo ya visto no se vuelve a bajar, así que
 * un ciclo de `correctsId` no puede colgarlo. Es el recorrido de `lecturasCandidatasDeCierre` y de `vigenteDe`: uno solo.
 */
async function bajarCadenas(tx: Prisma.TransactionClient, raices: readonly LecturaDeCadena[]) {
  const vistas = new Map(raices.map((r) => [r.id, r]));
  const reemplazadas = new Set<string>();
  const correcciones = new Map<string, string[]>();
  let frontera = raices.map((r) => r.id);
  while (frontera.length > 0) {
    const siguientes = await tx.measurement.findMany({ where: { correctsId: { in: frontera } }, select: LECTURA });
    for (const c of siguientes) {
      reemplazadas.add(c.correctsId!);
      correcciones.set(c.correctsId!, [...(correcciones.get(c.correctsId!) ?? []), c.id]);
    }
    const nuevas = siguientes.filter((c) => !vistas.has(c.id));
    for (const c of nuevas) vistas.set(c.id, c);
    frontera = nuevas.map((c) => c.id);
  }
  return { vistas, reemplazadas, correcciones };
}

/**
 * Qué lecturas se pueden marcar en un registro: la VIGENTE de cada cadena cuya raíz es suya, en orden de fecha. Devuelve también
 * `reemplazadas`, los ids de las que una corrección ya sustituyó (de esas mismas cadenas): la validación de abajo las distingue de
 * las ajenas, y la pantalla no las ofrece. Sólo lee; quien la llama ya autorizó el lote del registro. Su primer parámetro se llama
 * `tx` aunque a veces reciba el cliente global (sólo lee): es el nombre que el inventario de acceso reconoce.
 */
export async function lecturasCandidatasDeCierre(tx: Prisma.TransactionClient, registro: RegistroDeLecturasDeCierre) {
  // Las RAÍCES: las lecturas originales (sin `correctsId`) que son del registro. La raíz decide de quién es la cadena.
  const raices =
    registro.registro === "lotProcessIntervention"
      ? await tx.measurement.findMany({
          where: {
            lotId: { in: [registro.loteDelProceso, ...(await idsDeDescendencia(tx, registro.loteDelProceso))] },
            occurredAt: { gte: registro.desde },
            correctsId: null,
          },
          select: LECTURA,
        })
      : // R5: «de la corrida» es llevar su id Y ser del lote que entró en ella.
        await tx.measurement.findMany({
          where:
            registro.registro === "fermentationRun"
              ? { fermentationRunId: registro.registroId, lotId: registro.loteDeLaCorrida, correctsId: null }
              : { dryingRunId: registro.registroId, lotId: registro.loteDeLaCorrida, correctsId: null },
          select: LECTURA,
        });
  // Una lectura con corrección queda reemplazada; la última de cada cadena es la vigente.
  const { vistas, reemplazadas } = await bajarCadenas(tx, raices);
  const candidatas = [...vistas.values()]
    .filter((l) => !reemplazadas.has(l.id))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id));
  return { candidatas, reemplazadas };
}

/**
 * La lectura VIGENTE de la cadena de cada id (R4): una lectura sin corrección es su propia vigente, y una corregida —en el eslabón
 * que sea, la raíz o una corrección intermedia— lleva a la última corrección. Un id que no es de ninguna lectura no sale en el
 * mapa. Con la cadena bifurcada —dos correcciones de la misma lectura, la carrera que `correctMeasurement` no cierra— gana la de
 * fecha más reciente, y a igualdad la de id mayor: una regla fija en vez de la que dejara el orden de la consulta. Sólo lee.
 */
export async function vigenteDe(tx: Prisma.TransactionClient, ids: Iterable<string>) {
  const vigentes = new Map<string, LecturaDeCadena>();
  const pedidos = [...new Set(ids)];
  if (pedidos.length === 0) return vigentes;
  const raices = await tx.measurement.findMany({ where: { id: { in: pedidos } }, select: LECTURA });
  const { vistas, correcciones } = await bajarCadenas(tx, raices);
  for (const raiz of raices) {
    // Las hojas de su cadena: lo que ninguna corrección sustituye. Normalmente una.
    const hojas: LecturaDeCadena[] = [];
    const pendientes = [raiz.id];
    const visitados = new Set<string>();
    for (let actual = pendientes.pop(); actual !== undefined; actual = pendientes.pop()) {
      if (visitados.has(actual)) continue;
      visitados.add(actual);
      const siguientes = correcciones.get(actual) ?? [];
      if (siguientes.length === 0) hojas.push(vistas.get(actual)!);
      else pendientes.push(...siguientes);
    }
    hojas.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id));
    vigentes.set(raiz.id, hojas[0] ?? raiz); // sin hojas sólo si `correctsId` diera una vuelta: la lectura queda como su propia vigente
  }
  return vigentes;
}

/**
 * `view` sobre cada uno de estos lotes, para `quien`, o `TraceabilityAccessError`. El lote se lee con el `tx` que llega —el rechazo
 * de un lote que no existe también es de acceso— y la pregunta de permisos va por el cliente global, que no lee lotes: no choca con
 * los bloqueos del linaje que la transacción de quien llama ya tiene tomados. Pide `view` y no `manage` a propósito: citar una
 * lectura no es operar su lote, y es el mismo nivel con el que la pantalla filtra lo que ofrece. Un lote repetido se mira una vez.
 *
 * **Es una pregunta de permisos DENTRO de una transacción, y en `lib/` no hay otra** (medido el 2026-10-05: de 231 bloques
 * `$transaction(async (tx) => …)`, ninguno llama a un guardia; el control, 223 llaman a `recordAuditEvent`): la casa autoriza antes de
 * abrirla, y esto ocupa una segunda conexión mientras dura. Aquí no se puede antes sin repetir fuera de la transacción la definición
 * de qué lecturas se marcan, y sólo ocurre con la lectura de un descendiente. Decisión abierta: si se prefiere, la pregunta se mueve
 * antes de la transacción en cada puerta.
 */
export async function exigeVerLosLotes(tx: Prisma.TransactionClient, quien: string, lotIds: Iterable<string>) {
  const ids = [...new Set(lotIds)];
  if (ids.length === 0) return;
  const lotes = await tx.lot.findMany({ where: { id: { in: ids } }, select: { id: true, projectId: true, locationId: true, classification: true } });
  if (lotes.length !== ids.length) throw new TraceabilityAccessError("lot_not_found");
  for (const lote of lotes) await requireLotAccess(quien, "view", [lote]);
}

export async function marcarLecturasDeCierre(tx: Prisma.TransactionClient, input: MarcaDeLecturasDeCierre) {
  // En minúsculas, como los uuid de la base: la misma lectura escrita en mayúsculas es la misma fila (la lección de
  // `enMinusculas`, Parte 1), y sin esto una lista que la repite la marcaría dos veces.
  const ids = [...new Set(input.measurementIds.map((id) => id.trim().toLowerCase()).filter((id) => id !== ""))];
  if (ids.length === 0) return 0;

  // Qué se puede marcar lo dice `lecturasCandidatasDeCierre`, y sólo ella: aquí se pregunta, y ningún id de quien llama llega a la
  // base (se compara en memoria), así que un texto que no es un uuid es simplemente una lectura que no es de nadie. Una lectura que no
  // es vigente se rechaza con su causa: reemplazada por una corrección de una cadena de ESTE registro, o ajena (otra corrida, otro
  // lote, anterior al proceso, o una que no existe).
  const { candidatas, reemplazadas } = await lecturasCandidatasDeCierre(tx, input);
  const vigentes = new Map(candidatas.map((l) => [l.id, l]));
  // El lote del registro, sobre el que la puerta ya pidió `manage`: ése no se vuelve a preguntar.
  const delRegistro = input.registro === "lotProcessIntervention" ? input.loteDelProceso : input.loteDeLaCorrida;
  const otrosLotes = new Set<string>();
  for (const id of ids) {
    const lectura = vigentes.get(id);
    if (lectura === undefined) throw new LotProcessError(reemplazadas.has(id) ? "lectura_reemplazada" : "lectura_de_cierre_ajena");
    // Las raíces se buscan por lote, así que ninguna candidata está sin él; si alguna lo estuviera, no habría contra qué autorizarla.
    if (lectura.lotId === null) throw new LotProcessError("lectura_de_cierre_ajena");
    if (lectura.lotId !== delRegistro) otrosLotes.add(lectura.lotId);
  }
  // R5: el lote de la puerta ya lo autorizó su `manage`; el de cada lectura de un descendiente, no.
  await exigeVerLosLotes(tx, input.marcadoPor, otrosLotes);

  const donde =
    input.registro === "fermentationRun"
      ? { fermentationRunId: input.registroId }
      : input.registro === "dryingRun"
        ? { dryingRunId: input.registroId }
        : { lotProcessInterventionId: input.registroId };
  await tx.processStepClosingReading.createMany({
    data: ids.map((measurementId) => ({ measurementId, ...donde, createdBy: input.marcadoPor })),
  });
  return ids.length;
}
