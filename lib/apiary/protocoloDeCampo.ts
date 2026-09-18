import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import type { Prisma, ProtocolVariableValueType, ProvenanceClass } from "../../generated/prisma/client";

/**
 * A9.4 (D2) — la lista de chequeo de campo del apiario entra como una
 * `ProtocolVersion` de Research OS.
 *
 * **Por qué aquí y no un motor nuevo.** Ya está juzgado, y no por este alcance:
 * `43_P2_OPERATOR_CORE.md:107-111` —«deliberately not a second protocol
 * system»— y el propio esquema (`schema.prisma`, RO1): «no inventes un quinto
 * mecanismo de versionado». El requisito del dueño es que cambiar la lista
 * **no reinterprete lo ya respondido**, y eso es exactamente lo que una
 * `ProtocolVersion` garantiza y una columna no.
 *
 * **El sujeto de la ejecución es la VISITA, no la colonia.** Las cinco
 * actividades del JSON ocurren en la misma visita sobre colonias distintas; un
 * `TreatmentBatch` por colonia y actividad convertiría una visita de doce cajas
 * en sesenta filas de ejecución. Eso no es reutilizar, es deformar.
 */
export class ProtocoloDeCampoError extends Error {}

/** El vocabulario del dueño contra el del esquema. Se traduce, no se inventa. */
const TIPO_DE_VALOR: Record<string, ProtocolVariableValueType> = {
  enum: "closed_enum",
  multi_enum: "multi_enum",
  integer: "numeric",
  decimal: "numeric",
  short_text: "text",
  long_text: "text",
  date: "date",
  boolean: "boolean",
};

interface ItemDelJson {
  key: string;
  label: string;
  valueType: string;
  stage: string;
  required: boolean;
  order: number;
  options?: string[];
  unit?: string;
  hint?: string;
  requiredWith?: string;
  showWhen?: string;
  coversExistingColumn?: string;
  prefillLastUsed?: boolean;
  provenance?: string;
}

interface ProtocoloDelJson {
  domain: string;
  name: string;
  description?: string;
  version: string | number;
  locale?: string;
  activities: Array<{ activityType: string; label: string; items: ItemDelJson[] }>;
}

/**
 * El archivo de la versión VIGENTE del protocolo de campo. Las anteriores se quedan en el
 * repositorio: son lo que significan las respuestas ya dadas (ADR-165).
 */
export const RUTA_DEL_PROTOCOLO_DE_CAMPO = "protocolos/apiario-campo-v2.json";

/**
 * La identidad del protocolo en la base. **Se llama `-v1` porque así nació** en producción el
 * 2026-09-16, y cambiarla haría que el cargador no encontrara el protocolo ya cargado y creara
 * otro. Las versiones viven en `ProtocolVersion`, no en este nombre.
 */
export const IDENTIFICADOR_DEL_PROTOCOLO_DE_CAMPO = "apiario-campo-v1";

export function leerProtocoloDeCampo(raiz = process.cwd()): ProtocoloDelJson {
  const ruta = join(raiz, RUTA_DEL_PROTOCOLO_DE_CAMPO);
  return JSON.parse(readFileSync(ruta, "utf8")) as ProtocoloDelJson;
}

/**
 * Aplana las cinco actividades en variables, prefijando la clave con su
 * actividad. Dos actividades pueden tener un ítem `note` y son cosas distintas:
 * `inspection.note` no es `feeding.note`, y una clave desnuda las confundiría
 * al leer las respuestas.
 */
export function variablesDe(protocolo: ProtocoloDelJson) {
  return protocolo.activities.flatMap((actividad, iActividad) =>
    actividad.items.map((item) => {
      const valueType = TIPO_DE_VALOR[item.valueType];
      if (!valueType) throw new ProtocoloDeCampoError(`tipo_de_valor_desconocido:${item.valueType}`);
      return {
        key: `${actividad.activityType}.${item.key}`,
        name: item.label,
        description: item.hint ?? null,
        valueType,
        unit: item.unit ?? null,
        enumValues: item.options ?? [],
        // `isControlled` es de Research OS y significa otra cosa: una variable
        // que el experimento fija. Una casilla de campo no lo es.
        isControlled: false,
        // El orden es por actividad y después por ítem, para que las cinco
        // listas no se entrelacen al leerlas ordenadas.
        displayOrder: iActividad * 1000 + item.order,
        stage: item.stage,
        required: item.required,
        requiredWith: item.requiredWith ?? null,
        showWhen: item.showWhen ?? null,
        coversExistingColumn: item.coversExistingColumn ?? null,
        prefillLastUsed: item.prefillLastUsed ?? null,
        provenanceClass: (item.provenance as ProvenanceClass | undefined) ?? null,
      };
    }),
  );
}

/**
 * Carga el protocolo del disco como `Protocol` + `ProtocolVersion` + variables.
 *
 * **Idempotente por protocolo Y versión.** Correrlo dos veces no crea dos protocolos ni duplica
 * variables: si esa versión ya está, la devuelve. Un cargador que duplica en silencio es peor
 * que uno que falla.
 *
 * **Una versión nueva del JSON es una versión nueva del MISMO protocolo** (ADR-165). Antes el
 * número de versión iba dentro del identificador, así que una v2 habría nacido como un
 * protocolo aparte, sin parentesco con la v1. Ahora la identidad es fija y la versión crece
 * debajo; la anterior no se toca, porque es lo que significan las respuestas ya dadas.
 */
export async function cargarProtocoloDeCampo(
  userAccountId: string | null,
  /**
   * `identificador` existe para las pruebas: cargar versiones de un protocolo de prueba sin
   * tocar el del dueño, que en la base compartida puede estar cargado de verdad.
   */
  opciones: { raiz?: string; identificador?: string } = {},
) {
  const protocolo = leerProtocoloDeCampo(opciones.raiz);
  const identificador = opciones.identificador ?? IDENTIFICADOR_DEL_PROTOCOLO_DE_CAMPO;
  const numero = Number(protocolo.version);
  if (!Number.isInteger(numero) || numero < 1) throw new ProtocoloDeCampoError(`version_invalida:${protocolo.version}`);
  const variables = variablesDe(protocolo);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const yaEsta = await tx.protocol.findUnique({
      where: { externalIdentifier: identificador },
      include: { versions: { where: { version: numero }, take: 1 } },
    });
    if (yaEsta?.versions[0]) return { protocolo: yaEsta, version: yaEsta.versions[0], creado: false, protocoloCreado: false };

    const creado =
      yaEsta ??
      (await tx.protocol.create({
        data: {
          name: protocolo.name,
          description: protocolo.description ?? null,
          externalIdentifier: identificador,
          identifierConvention: "nectar-nomada/protocolos",
          createdBy: userAccountId,
        },
      }));

    const version = await tx.protocolVersion.create({
      data: {
        protocolId: creado.id,
        version: numero,
        status: "draft",
        notes: `Cargado desde ${RUTA_DEL_PROTOCOLO_DE_CAMPO} — ${variables.length} ítems en ${protocolo.activities.length} actividades.`,
        createdBy: userAccountId,
        variables: { create: variables },
      },
      include: { variables: true },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "protocol_version.create",
        entityType: "protocol_version",
        entityId: version.id,
        after: { externalIdentifier: identificador, version: version.version, variables: variables.length },
        reason: "carga del protocolo de captura de campo del apiario (A9.4)",
        sourceInterface: "apiary.protocoloDeCampo",
      },
      tx,
    );

    // `protocoloCreado` separado de `creado`: añadir la v2 a un protocolo que ya existía crea una
    // VERSIÓN, no un protocolo, y quien limpie después tiene que saber cuál de las dos borra.
    return { protocolo: creado, version, creado: true, protocoloCreado: !yaEsta };
  });
}
