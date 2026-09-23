/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2). Fotografía de la
 * tierra: del bloque, del retorte de biochar y del perfil de una calicata.
 *
 * **Por qué no se reusa `media.ts`.** Aquél exige un `lotId` en cada llamada
 * —«always carry lotId for scoping»— y se gatea con `lot:manage`. Un lote de
 * biochar y una calicata no cuelgan de ningún lote de café: su ámbito es la
 * Location, y su permiso `location:manage_attributes`, el mismo con el que se
 * registraron. Forzarlos por el camino del café habría exigido inventar un Lot
 * de mentira o relajar el permiso.
 *
 * Mismo viaje de dos pasos y mismo `objectStorageProvider`: se pide una URL PUT
 * firmada, el navegador sube el archivo directo a R2, y sólo entonces se crea
 * la fila `Asset`. Un fallo a mitad no deja un `Asset` apuntando a nada.
 *
 * El marco pide fotografía en dos sitios y sólo dos: el Paso 2 («fotografiar el
 * retorte y el proceso») y el Paso 4 («fotografiar cada perfil con una
 * escala»). La foto general de un bloque cabe en `Asset.locationId`, que existe
 * desde el principio.
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { objectStorageProvider } from "../integrations/storage";
import { requireLocationAttributeAccess, LocationAccessError } from "./locations";
import { requireTrapAccess } from "./traps";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import type { ScopeTarget } from "../rbac/types";
import { Prisma, type ClassificationLevel, type ProvenanceClass } from "../../generated/prisma/client";

export class LandMediaValidationError extends Error {}

const BUCKET = "nectar-originals";
const DEFAULT_CLASSIFICATION: ClassificationLevel = "internal";

/** El prefijo bajo el que vive todo lo de un bloque. */
const prefijoDe = (locationId: string) => `nectar-originals/land/${locationId}/`;

export type LandAssetParent =
  | { kind: "location" }
  | { kind: "biocharBatch"; biocharBatchId: string }
  | { kind: "soilProfile"; soilProfileId: string }
  | { kind: "trapCheck"; specimenObservationId: string };

export interface RequestLandAssetUploadInput {
  locationId: string;
  originalFilename: string;
  contentType: string;
}

/** El PUT firmado, compartido por las dos compuertas de abajo. La clave la
 * decide cada una por su cuenta: al azar aquí, determinista para la foto de
 * trampa (ver `requestTrampaPhotoUpload`). */
async function firmarSubida(storageKey: string, contentType: string) {
  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType });
  return { uploadUrl, storageKey };
}

async function crearUrlDeSubida(input: RequestLandAssetUploadInput) {
  const ext = input.originalFilename.includes(".") ? input.originalFilename.split(".").pop() : undefined;
  const storageKey = `${prefijoDe(input.locationId)}${randomUUID()}${ext ? `.${ext}` : ""}`;
  return firmarSubida(storageKey, input.contentType);
}

export async function requestLandAssetUpload(userAccountId: string, input: RequestLandAssetUploadInput) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);
  return crearUrlDeSubida(input);
}

export interface RequestTrampaPhotoUploadInput extends RequestLandAssetUploadInput {
  /** El clientDraftId de la FOTO — no el de la revisión. Fix round 1 (Tarea
   * 12): distinto en cada foto de la ronda, pero el MISMO en cada reintento
   * de la MISMA foto (`queueTrapPhoto` lo genera una vez y lo guarda en
   * IndexedDB), que es justo lo que hace falta para derivar de él una clave
   * estable. */
  photoClientDraftId: string;
  /**
   * A6 fix-final (I2) — el clientDraftId de la REVISIÓN a la que esta foto
   * dice pertenecer. Sólo sirve para el guardia de reutilización, más abajo:
   * decidir si una `storageKey` que ya tiene un `Asset` es un reintento
   * legítimo (misma revisión) o una clave ajena reutilizada.
   */
  revisionClientDraftId: string;
}

/**
 * La clave de la foto de una revisión de trampa: un prefijo fijo más el
 * `clientDraftId` de la FOTO más su extensión — nunca un valor al azar.
 *
 * **Fix round 1 (Tarea 12), ruling del controlador.** Antes esta función
 * generaba una clave nueva (`randomUUID()`) en cada llamada, así que un acuse
 * perdido —el servidor crea el `Asset` y la respuesta no llega— hacía que
 * `syncTrapPhotos` pidiera OTRA URL, subiera OTRO objeto y llamara a
 * `finalizeTrampaPhotoPorBorrador` con una clave distinta, que no colisiona
 * con nada: segundo `Asset` sobre la misma revisión. Derivar la clave del
 * `clientDraftId` de la foto hace que el reintento calcule la MISMA clave,
 * y `Asset.storageKey` (único desde antes, sin migración) es lo que deja a
 * `finalizeTrampaPhotoPorBorrador` reconocer el reintento y no duplicar.
 *
 * Sigue siendo «inadivinable»: el `clientDraftId` de la foto es un
 * `crypto.randomUUID()` generado en `queueTrapPhoto`, así que la clave entera
 * sigue siendo, en la práctica, un UUID bajo el prefijo del bloque — la regla
 * de siempre (`prefijoDe`), sólo que ahora el UUID lo aporta el cliente en vez
 * de generarlo el servidor en cada intento.
 */
export function claveDeFotoDeTrampa(locationId: string, photoClientDraftId: string, originalFilename: string): string {
  const ext = originalFilename.includes(".") ? originalFilename.split(".").pop() : undefined;
  return `${prefijoDe(locationId)}foto-${photoClientDraftId}${ext ? `.${ext}` : ""}`;
}

/**
 * Tarea 12, ruling P2 del controlador. Para la foto de la ronda de trampas, el
 * paso de la URL firmada se gatea con `requireTrapAccess` (`specimen:manage`
 * sobre esa trampa), NO con `location:manage_attributes` — es la misma persona
 * que puede registrar la revisión la que puede subir su foto, sin depender de
 * que además tenga permiso de atributos de la parcela. Los demás padres de
 * `LandAssetParent` (bloque, perfil de suelo, lote de biochar) siguen exigiendo
 * `requestLandAssetUpload`, sin cambios: esta función es sólo para la foto de
 * trampa, y por eso vive aparte en vez de añadirle un parámetro a aquélla.
 */
/**
 * A6 fix-final (I2), ruling del controlador. Antes se firmaba el PUT sin
 * comprobar si la `storageKey` derivada ya tenía un `Asset`: el PUT firmado
 * sobrescribe bytes en el bucket sin pasar por ninguna compuerta propia — la
 * comprobación de pertenencia sólo llegaba después, en
 * `finalizeTrampaPhotoPorBorrador`, cuando el objeto original ya se había
 * perdido. Ahora, si la clave ya tiene un `Asset`, sólo se firma de nuevo
 * cuando ese `Asset` es de la MISMA revisión — el reintento legítimo que la
 * Tarea 12 quiso resolver derivando la clave del `clientDraftId` de la
 * foto—; si es de otra revisión (la clave se reutilizó, ajena), se rechaza
 * ANTES de firmar nada.
 */
export async function requestTrampaPhotoUpload(userAccountId: string, input: RequestTrampaPhotoUploadInput) {
  await requireTrapAccess(userAccountId, input.locationId);
  const storageKey = claveDeFotoDeTrampa(input.locationId, input.photoClientDraftId, input.originalFilename);

  const existente = await prisma.asset.findUnique({
    where: { storageKey },
    select: { specimenObservationId: true },
  });
  if (existente) {
    const revision = await prisma.specimenObservation.findUnique({
      where: { clientDraftId: input.revisionClientDraftId },
      select: { id: true },
    });
    if (!revision || existente.specimenObservationId !== revision.id) {
      throw new LandMediaValidationError("storage_key_belongs_to_another_revision");
    }
  }

  return firmarSubida(storageKey, input.contentType);
}

export interface FinalizeLandAssetUploadInput {
  locationId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  parent: LandAssetParent;
  // ADR-038 — requerido, sin default: una fotografía de campo es evidencia
  // original igual que una lectura.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  creatorPersonId?: string | null;
}

/**
 * **La comprobación que de verdad importa está aquí abajo.**
 *
 * El `locationId` que llega es el que se autoriza, y el padre llega aparte. Sin
 * comprobar que el padre PERTENECE a esa Location, alguien con acceso al bloque
 * A podría colgar una foto del perfil de suelo del bloque B mandando el id de A
 * en la casilla del ámbito: la autorización pasaría —tiene acceso a A— y la
 * fila aterrizaría en B. Es la clase de agujero que no se ve leyendo el
 * formulario, porque el formulario nunca manda esa combinación.
 */
async function exigirPadreDeEsaLocation(parent: LandAssetParent, locationId: string) {
  if (parent.kind === "biocharBatch") {
    const lote = await prisma.biocharBatch.findUnique({
      where: { id: parent.biocharBatchId },
      select: { producedAtLocationId: true },
    });
    if (!lote) throw new LocationAccessError("biochar_batch_not_found");
    if (lote.producedAtLocationId !== locationId) {
      throw new LandMediaValidationError("parent_belongs_to_another_location");
    }
    return { biocharBatchId: parent.biocharBatchId };
  }
  if (parent.kind === "soilProfile") {
    const perfil = await prisma.soilProfile.findUnique({
      where: { id: parent.soilProfileId },
      select: { locationId: true },
    });
    if (!perfil) throw new LocationAccessError("soil_profile_not_found");
    if (perfil.locationId !== locationId) {
      throw new LandMediaValidationError("parent_belongs_to_another_location");
    }
    return { soilProfileId: parent.soilProfileId };
  }
  if (parent.kind === "trapCheck") {
    const revision = await prisma.specimenObservation.findUnique({
      where: { id: parent.specimenObservationId },
      select: { specimen: { select: { locationId: true } } },
    });
    if (!revision) throw new LocationAccessError("trap_check_not_found");
    if (revision.specimen.locationId !== locationId) {
      throw new LandMediaValidationError("trap_check_not_in_location");
    }
    return { specimenObservationId: parent.specimenObservationId };
  }
  return {};
}

export async function finalizeLandAssetUpload(userAccountId: string, input: FinalizeLandAssetUploadInput) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);
  await exigirPersonaPermitida(userAccountId, input.creatorPersonId, [{ locationId: input.locationId }]);
  // F5 fix-final — colgar una foto de una revisión de trampa es tocar un
  // Specimen, gateado igual que `createTrap`/`recordTrapCheck`
  // (`requireTrapAccess`, `specimen:manage`). Sin esto, `location:manage_
  // attributes` bastaba para adjuntar evidencia a una revisión que ese mismo
  // usuario no podía leer si le quitaban el permiso de specimen.
  //
  // **Fix round 1 (Tarea 12), ruling del controlador — a propósito el AND, y
  // a propósito distinto de `finalizeTrampaPhotoPorBorrador`.** La revisión
  // del plan (task-12-review.md) señaló que este camino general exige
  // `location:manage_attributes` SIEMPRE, más `requireTrapAccess` para un
  // padre `trapCheck` — literalmente el AND que la ruling P2 excluye para la
  // foto de la ronda. Es intencional: `LandPhotoUploadForm`
  // (`/plots/[id]/fotos/nueva`) es la pantalla de atributos de la parcela, y
  // ya exige `location:manage_attributes` para llegar ahí — es MÁS estricta,
  // nunca más laxa, así que no hay agujero que cerrar. Los dos caminos
  // conviven con reglas distintas a propósito: éste para quien administra la
  // parcela desde el escritorio, `finalizeTrampaPhotoPorBorrador` para quien
  // registra la ronda en el teléfono y sólo tiene permiso de trampa.
  if (input.parent.kind === "trapCheck") {
    await requireTrapAccess(userAccountId, input.locationId);
  }

  // La clave tiene que estar bajo el prefijo de ESTE bloque. Sin esto, un
  // llamador podría registrar como suyo un objeto subido bajo otro bloque.
  if (!input.storageKey.startsWith(prefijoDe(input.locationId))) {
    throw new LandMediaValidationError("invalid_storage_key");
  }

  const padre = await exigirPadreDeEsaLocation(input.parent, input.locationId);

  const userAccount = await prisma.userAccount.findUniqueOrThrow({
    where: { id: userAccountId },
    select: { personId: true },
  });

  // Fila y auditoría en la misma transacción: una fotografía guardada sin su
  // audit es peor que ninguna.
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        assetType: input.mimeType.startsWith("image/")
          ? "photo"
          : input.mimeType.startsWith("video/")
            ? "video"
            : "document",
        storageKey: input.storageKey,
        storageBucket: BUCKET,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename,
        creatorPersonId: input.creatorPersonId ?? userAccount.personId,
        status: "approved",
        classification: DEFAULT_CLASSIFICATION,
        createdBy: userAccountId,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference ?? null,
        // Siempre, sea cual sea el padre: es el ámbito con el que se autorizó y
        // por el que se lista. El padre específico lo añade `padre`.
        locationId: input.locationId,
        ...padre,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "asset.create",
        entityType: "asset",
        entityId: asset.id,
        after: asset,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return asset;
  });
}

export interface FinalizeTrampaPhotoInput {
  locationId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  revisionClientDraftId: string;
  provenanceClass: ProvenanceClass;
}

/**
 * F6 fix-final extendido para la ronda sin señal (spec §4.3, Tarea 12). La
 * revisión puede no haber llegado todavía —viaja por su propia cola, Tarea
 * 11— así que se resuelve por `clientDraftId` en vez de exigir un
 * `specimenObservationId` real. Si no aparece, `revision_not_found_yet` es una
 * señal de REINTENTAR, no un rechazo: la foto nunca se engancha a otra
 * revisión (spec §4.3, «si la foto llega antes, se reintenta»).
 *
 * **Decisión de modelo (spec §4.3, brief Tarea 12):** sigue siendo `Asset` con
 * `specimenObservationId`, no `FieldEvent` — la ronda no tiene `FieldSession`
 * (es de toda la finca, no de un lote), y `FieldEvent.fieldSessionId` no es
 * anulable; forzar una jornada de mentira inventaría un hecho de campo que no
 * ocurrió (ver la cabecera de `fieldMedia.ts`, que explica por qué una foto de
 * campo SÍ es un `FieldEvent`: éste no tiene ese ancla).
 *
 * **Permiso, ruling P2 del controlador.** Sólo `requireTrapAccess`
 * (`specimen:manage`), nunca `requireLocationAttributeAccess`: es la misma
 * persona que puede registrar la revisión la que puede colgarle la foto, sin
 * depender de un segundo permiso de atributos de la parcela. `input.locationId`
 * es contra lo que se autoriza, y `exigirPadreDeEsaLocation` de más arriba
 * (para `finalizeLandAssetUpload`) no se reutiliza aquí porque esa función
 * exige un `specimenObservationId` real — la comprobación equivalente para
 * «pertenece a esa Location» va debajo, una vez resuelta la revisión.
 *
 * **Fix round 1 (Tarea 12) — idempotente por `storageKey`, SIN migración.**
 * La revisión del plan lo trazó de punta a punta: si el `Asset` se crea pero
 * la respuesta se pierde (la red se cae justo después del commit), el
 * cliente nunca marca la foto como enviada y `syncTrapPhotos` la reintenta
 * — antes de este fix, con una clave NUEVA cada vez
 * (`requestTrampaPhotoUpload` llamaba a `randomUUID()`), así que el
 * reintento creaba un SEGUNDO `Asset` sobre la misma revisión. Ahora la
 * clave se deriva del `clientDraftId` de la FOTO (`claveDeFotoDeTrampa`,
 * más arriba), así que un reintento pide y finaliza la MISMA clave, y
 * `Asset.storageKey` — único desde antes, sin migración nueva — es lo que
 * permite reconocerlo: se busca primero por esa clave, y si ya existe se
 * devuelve ESE `Asset` (marcado como ya aplicado) en vez de crear otro. El
 * `catch` de `P2002` cubre la carrera de dos llamadas casi simultáneas para
 * la misma foto, que pueden pasar la comprobación de arriba a la vez. Las
 * dos ramas verifican que el `Asset` encontrado sea de ESTA revisión —si no,
 * es una clave ajena reutilizada por error, y se rechaza en vez de devolver
 * una foto que no es la suya.
 */
export async function finalizeTrampaPhotoPorBorrador(userAccountId: string, input: FinalizeTrampaPhotoInput) {
  await requireTrapAccess(userAccountId, input.locationId);
  if (!input.storageKey.startsWith(prefijoDe(input.locationId))) {
    throw new LandMediaValidationError("invalid_storage_key");
  }

  const revision = await prisma.specimenObservation.findUnique({
    where: { clientDraftId: input.revisionClientDraftId },
    select: { id: true, specimen: { select: { locationId: true } } },
  });
  if (!revision) throw new LandMediaValidationError("revision_not_found_yet");
  if (revision.specimen.locationId !== input.locationId) {
    throw new LandMediaValidationError("trap_check_not_in_location");
  }

  // Reintento con acuse perdido: la MISMA clave ya tiene un Asset. Se
  // devuelve ese, no se crea otro — y se comprueba que sea de ESTA revisión
  // antes de darlo por bueno.
  const existente = await prisma.asset.findUnique({ where: { storageKey: input.storageKey } });
  if (existente) {
    if (existente.specimenObservationId !== revision.id) {
      throw new LandMediaValidationError("storage_key_belongs_to_another_revision");
    }
    return existente;
  }

  const userAccount = await prisma.userAccount.findUniqueOrThrow({
    where: { id: userAccountId },
    select: { personId: true },
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          assetType: input.mimeType.startsWith("image/")
            ? "photo"
            : input.mimeType.startsWith("video/")
              ? "video"
              : "document",
          storageKey: input.storageKey,
          storageBucket: BUCKET,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          originalFilename: input.originalFilename,
          // A5 fix-final (I6) — SIEMPRE la persona de la sesión, nunca un
          // valor que el llamador pudiera pasar: una foto de la ronda es
          // evidencia de observación directa, y su autoría no es más
          // falsificable que `observerPersonId` en la revisión misma.
          creatorPersonId: userAccount.personId,
          status: "approved",
          classification: DEFAULT_CLASSIFICATION,
          createdBy: userAccountId,
          provenanceClass: input.provenanceClass,
          locationId: input.locationId,
          specimenObservationId: revision.id,
        },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "asset.create",
          entityType: "asset",
          entityId: asset.id,
          after: asset,
          sourceInterface: "traceability.service",
        },
        tx,
      );
      return asset;
    });
  } catch (error) {
    // La carrera: dos llamadas casi simultáneas para la MISMA foto (doble
    // tap, dos pestañas) pasaron la comprobación de arriba a la vez.
    // `storageKey` es UNIQUE en la base, así que la segunda `create` revienta
    // con P2002 — se relee en vez de propagar el error, y el resultado es el
    // Asset que SÍ se creó, no uno nuevo.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const ganador = await prisma.asset.findUniqueOrThrow({ where: { storageKey: input.storageKey } });
      if (ganador.specimenObservationId !== revision.id) {
        throw new LandMediaValidationError("storage_key_belongs_to_another_revision");
      }
      return ganador;
    }
    throw error;
  }
}

/**
 * Las fotografías de un bloque, agrupadas por a qué cuelgan.
 *
 * Las URL firmadas se piden aquí y no en la página: son de vida corta, y
 * pedirlas al construir la página es lo que hace que caduquen antes de que
 * nadie las mire si se cachean. La página no toca el proveedor.
 *
 * A8 fix-final (M1), ruling del controlador. `location:manage_attributes`
 * autoriza fotos de bloque, de calicata y de biochar — evidencia de la
 * PARCELA— pero una foto de revisión de trampa (`specimenObservationId` no
 * nulo) es evidencia de un `Specimen`, gateada en todos los demás sitios por
 * `specimen:view`/`specimen:manage` (`requireTrapAccess`). Sin esta
 * comprobación, alguien con acceso de atributos y SIN acceso de trampas veía
 * igual las fotos de revisión en la pestaña Fotos — la misma separación que
 * spec §6 pide para el resto de la vista de trampas, que aquí no se
 * aplicaba.
 */
export async function listLandAssets(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { classification: true } });
  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  const puedeVerTrampas =
    !!location &&
    ((await can(userAccountId, "view", "specimen", target, location.classification)) ||
      (await can(userAccountId, "manage", "specimen", target, location.classification)));

  const assets = await prisma.asset.findMany({
    where: { locationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      originalFilename: true,
      createdAt: true,
      biocharBatchId: true,
      soilProfileId: true,
      // Sin él, la foto de la tela de una revisión aparecía también entre las
      // fotos generales de la parcela, que filtran por los otros dos padres.
      specimenObservationId: true,
      // Pestaña Fotos (Tarea 5b): rotular «Trampa N · revisión del <día>»
      // necesita el número de trampa y el día de la revisión. Misma
      // compuerta de acceso de arriba — no es una operación nueva, sólo más
      // columnas de la misma consulta ya autorizada.
      specimenObservation: {
        select: {
          observedAt: true,
          specimen: { select: { trapNumber: true } },
        },
      },
    },
  });
  // A8 — sin permiso de trampas, las filas de revisión no se listan; las
  // fotos generales (bloque, calicata, biochar) siguen igual. Filtrar antes
  // de firmar evita pedir una URL para una foto que no se va a mostrar.
  const visibles = puedeVerTrampas ? assets : assets.filter((a) => a.specimenObservationId == null);
  return Promise.all(
    visibles.map(async (a) => ({ ...a, url: await objectStorageProvider.getSignedUrl(a.storageKey) })),
  );
}
