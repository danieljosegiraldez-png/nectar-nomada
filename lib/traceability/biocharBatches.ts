/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2, semanas 1–4). El
 * lote de biochar, con los campos de la Tabla 6 del marco de investigación.
 *
 * **RBAC reusa `location:manage_attributes`** vía
 * `requireLocationAttributeAccess`, contra la Location donde el lote se
 * produjo. Misma decisión que `plantingCohorts.ts` y por la misma razón:
 * ADR-091 hace que un permiso sin sitio donde usarse sea un fallo de
 * construcción, así que inventar `biochar_batch:*` por simetría sería una
 * regresión y no orden. Producir biochar en una finca es la misma autoridad que
 * describir el terreno de esa finca.
 *
 * **Corrección es edición, no sucesión.** `BiocharBatch` no lleva `correctsId`,
 * a diferencia de `Measurement`: un lote de biochar es un registro de lo que se
 * hizo, no una lectura observada. Si Bob anotó 550 °C y eran 500, lo que había
 * era un error de transcripción — la temperatura no cambió. Se corrige con
 * PATCH y el `AuditEvent` guarda el antes. Misma asimetría que ADR-102 fijó
 * entre `PlantingCohort` y `Measurement`.
 *
 * **Lo que NO vive aquí, y es deliberado:** dosis, frecuencia y parcela
 * tratada. La Tabla 6 las lista junto a lo demás porque es un formulario de
 * papel; en un modelo de datos son de la *aplicación*, porque un lote se quema
 * una vez y puede aplicarse en varios bloques, a dosis distintas y en fechas
 * distintas. Ponerlas aquí haría que un lote se pudiera aplicar exactamente una
 * vez.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLocationAttributeAccess, LocationAccessError } from "./locations";
import { getManageableContext } from "./lots";
import type {
  BiocharCooling,
  BiocharMoistureCondition,
  DataQuality,
  ProvenanceClass,
} from "../../generated/prisma/client";

export class BiocharBatchValidationError extends Error {}

/** Los campos de la Tabla 6 que describen la PRODUCCIÓN del lote. */
export interface BiocharBatchFields {
  producedAt?: Date | null;
  feedstock?: string | null;
  feedstockSource?: string | null;
  moistureCondition?: BiocharMoistureCondition | null;
  kilnDesign?: string | null;
  peakTemperatureC?: number | null;
  temperatureMethod?: string | null;
  burnDurationMinutes?: number | null;
  timeAtPeakMinutes?: number | null;
  oxygenManagement?: string | null;
  cooling?: BiocharCooling | null;
  quenchWaterSource?: string | null;
  particleSize?: string | null;
  storageConditions?: string | null;
  chargingMaterial?: string | null;
  chargingRatio?: string | null;
  coComposted?: boolean | null;
  chargingDurationDays?: number | null;
  analysisLaboratory?: string | null;
  notes?: string | null;
  sourceReference?: string | null;
  dataQuality?: DataQuality | null;
}

export interface CreateBiocharBatchInput extends BiocharBatchFields {
  batchCode: string;
  organizationId: string;
  producedAtLocationId: string;
  // ADR-038 — requerido, sin default.
  provenanceClass: ProvenanceClass;
}

export interface UpdateBiocharBatchInput extends BiocharBatchFields {
  biocharBatchId: string;
  batchCode?: string;
  provenanceClass?: ProvenanceClass;
}

/**
 * Lo que se puede decir que está mal sin saber nada del lote.
 *
 * No se valida el RANGO de la temperatura, y es a propósito. §9.2 del marco
 * observa que por encima de 750 °C sube la suma de los 16 HAP del US EPA
 * frente al rango 450–600 °C, pero eso hace que un 800 sea **preocupante**, no
 * **falso**. Rechazar un hecho registrado porque incomoda es cómo un sistema
 * empieza a mentir. La advertencia va en la pantalla; el dato entra igual.
 *
 * Lo que sí se rechaza es lo que no puede ser un hecho: un tiempo negativo, una
 * temperatura bajo cero, y un tiempo a pico mayor que la quema entera.
 */
function validarCampos(campos: BiocharBatchFields, existente?: { burnDurationMinutes: number | null; timeAtPeakMinutes: number | null }) {
  if (campos.peakTemperatureC != null && campos.peakTemperatureC < 0) {
    throw new BiocharBatchValidationError("negative_peak_temperature");
  }
  for (const [nombre, valor] of [
    ["burn_duration", campos.burnDurationMinutes],
    ["time_at_peak", campos.timeAtPeakMinutes],
    ["charging_duration", campos.chargingDurationDays],
  ] as const) {
    if (valor != null && valor < 0) throw new BiocharBatchValidationError(`negative_${nombre}`);
  }

  // Se resuelve contra el valor que QUEDARÁ, no contra el que llega: en un
  // PATCH que sólo manda uno de los dos, comparar con el ausente no diría nada.
  const quema = campos.burnDurationMinutes !== undefined ? campos.burnDurationMinutes : existente?.burnDurationMinutes ?? null;
  const pico = campos.timeAtPeakMinutes !== undefined ? campos.timeAtPeakMinutes : existente?.timeAtPeakMinutes ?? null;
  if (quema != null && pico != null && pico > quema) {
    throw new BiocharBatchValidationError("time_at_peak_exceeds_burn_duration");
  }
}

/** Los campos opcionales, en la forma que Prisma espera. */
function datosDeCampos(c: BiocharBatchFields) {
  return {
    producedAt: c.producedAt ?? null,
    feedstock: c.feedstock ?? null,
    feedstockSource: c.feedstockSource ?? null,
    moistureCondition: c.moistureCondition ?? null,
    kilnDesign: c.kilnDesign ?? null,
    peakTemperatureC: c.peakTemperatureC ?? null,
    temperatureMethod: c.temperatureMethod ?? null,
    burnDurationMinutes: c.burnDurationMinutes ?? null,
    timeAtPeakMinutes: c.timeAtPeakMinutes ?? null,
    oxygenManagement: c.oxygenManagement ?? null,
    cooling: c.cooling ?? null,
    quenchWaterSource: c.quenchWaterSource ?? null,
    particleSize: c.particleSize ?? null,
    storageConditions: c.storageConditions ?? null,
    chargingMaterial: c.chargingMaterial ?? null,
    chargingRatio: c.chargingRatio ?? null,
    coComposted: c.coComposted ?? null,
    chargingDurationDays: c.chargingDurationDays ?? null,
    analysisLaboratory: c.analysisLaboratory ?? null,
    notes: c.notes ?? null,
    sourceReference: c.sourceReference ?? null,
    dataQuality: c.dataQuality ?? null,
  };
}

export async function createBiocharBatch(userAccountId: string, input: CreateBiocharBatchInput) {
  const codigo = input.batchCode.trim();
  // Sin código no hay a qué atribuir un resultado, que es el punto entero de
  // la Tabla 6: «el vínculo entre el material, la parcela y toda medición
  // posterior».
  if (!codigo) throw new BiocharBatchValidationError("batch_code_required");

  await requireLocationAttributeAccess(userAccountId, input.producedAtLocationId);
  validarCampos(input);

  const organizacion = await prisma.organization.findUnique({ where: { id: input.organizationId } });
  if (!organizacion) throw new LocationAccessError("organization_not_found");

  // Escritura y auditoría en la MISMA transacción: si el audit falla, el lote
  // no queda guardado sin él.
  return prisma.$transaction(async (tx) => {
    const creado = await tx.biocharBatch.create({
      data: {
        batchCode: codigo,
        organizationId: input.organizationId,
        producedAtLocationId: input.producedAtLocationId,
        provenanceClass: input.provenanceClass,
        ...datosDeCampos(input),
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "biochar_batch.create",
        entityType: "biochar_batch",
        entityId: creado.id,
        after: creado,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return creado;
  });
}

/**
 * Corrección por edición, con el antes en el audit (ver la cabecera). Forma
 * PATCH: las claves ausentes se dejan como están, así que anotar hoy sólo el
 * laboratorio no obliga a saberse el régimen térmico de memoria.
 */
export async function updateBiocharBatch(userAccountId: string, input: UpdateBiocharBatchInput) {
  const existente = await prisma.biocharBatch.findUnique({ where: { id: input.biocharBatchId } });
  if (!existente) throw new LocationAccessError("biochar_batch_not_found");

  await requireLocationAttributeAccess(userAccountId, existente.producedAtLocationId);
  validarCampos(input, existente);

  const codigo = input.batchCode !== undefined ? input.batchCode.trim() : undefined;
  if (codigo !== undefined && !codigo) throw new BiocharBatchValidationError("batch_code_required");

  const parcial = <T,>(v: T | undefined, k: string) => (v !== undefined ? { [k]: v ?? null } : {});

  return prisma.$transaction(async (tx) => {
    const despues = await tx.biocharBatch.update({
      where: { id: input.biocharBatchId },
      data: {
        ...(codigo !== undefined ? { batchCode: codigo } : {}),
        ...(input.provenanceClass !== undefined ? { provenanceClass: input.provenanceClass } : {}),
        ...parcial(input.producedAt, "producedAt"),
        ...parcial(input.feedstock, "feedstock"),
        ...parcial(input.feedstockSource, "feedstockSource"),
        ...parcial(input.moistureCondition, "moistureCondition"),
        ...parcial(input.kilnDesign, "kilnDesign"),
        ...parcial(input.peakTemperatureC, "peakTemperatureC"),
        ...parcial(input.temperatureMethod, "temperatureMethod"),
        ...parcial(input.burnDurationMinutes, "burnDurationMinutes"),
        ...parcial(input.timeAtPeakMinutes, "timeAtPeakMinutes"),
        ...parcial(input.oxygenManagement, "oxygenManagement"),
        ...parcial(input.cooling, "cooling"),
        ...parcial(input.quenchWaterSource, "quenchWaterSource"),
        ...parcial(input.particleSize, "particleSize"),
        ...parcial(input.storageConditions, "storageConditions"),
        ...parcial(input.chargingMaterial, "chargingMaterial"),
        ...parcial(input.chargingRatio, "chargingRatio"),
        ...parcial(input.coComposted, "coComposted"),
        ...parcial(input.chargingDurationDays, "chargingDurationDays"),
        ...parcial(input.analysisLaboratory, "analysisLaboratory"),
        ...parcial(input.notes, "notes"),
        ...parcial(input.sourceReference, "sourceReference"),
        ...parcial(input.dataQuality, "dataQuality"),
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "biochar_batch.update",
        entityType: "biochar_batch",
        entityId: despues.id,
        before: existente,
        after: despues,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return despues;
  });
}

/**
 * El envejecimiento de la Tabla 6: días entre producción y una fecha dada.
 *
 * Derivado al leer, nunca guardado, por la misma razón que la densidad y el
 * rendimiento: las dos entradas se pueden corregir, y un valor almacenado
 * sobreviviría a la corrección de sus insumos.
 *
 * Sin fecha de producción devuelve `null`, no `0`. Un lote cuya fecha nadie
 * anotó no es un lote recién hecho.
 */
export function computeBatchAgingDays(producedAt: Date | null, asOf: Date): number | null {
  if (!producedAt) return null;
  const dias = Math.floor((asOf.getTime() - producedAt.getTime()) / 86_400_000);
  // Una fecha de producción futura es un dato que alguien tecleó mal; se
  // devuelve `null` en vez de un número negativo que se leería como una edad.
  return dias < 0 ? null : dias;
}

export async function getBiocharBatch(userAccountId: string, biocharBatchId: string) {
  const lote = await prisma.biocharBatch.findUnique({
    where: { id: biocharBatchId },
    include: {
      organization: { select: { id: true, name: true } },
      producedAtLocation: { select: { id: true, name: true } },
      // S1 §2 — la caracterización de la Tabla 7. Se traen TODAS, incluidas
      // las corregidas: ocultarlas dejaría la ficha diciendo un número sin
      // rastro de que antes decía otro, que es lo contrario de por qué
      // `Measurement` corrige por sucesión y no por edición.
      measurements: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!lote) throw new LocationAccessError("biochar_batch_not_found");
  await requireLocationAttributeAccess(userAccountId, lote.producedAtLocationId);
  return lote;
}

/**
 * Los lotes producidos en una Location. Se autoriza contra esa Location, así
 * que un operario con ámbito en una finca no ve los lotes de otra.
 */
export async function listBiocharBatchesForLocation(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  return prisma.biocharBatch.findMany({
    where: { producedAtLocationId: locationId },
    orderBy: [{ producedAt: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Todos los lotes que este usuario alcanza, y los sitios y organizaciones que
 * puede elegir al crear uno.
 *
 * El filtro es el conjunto de Locations visibles de `getManageableContext`,
 * el mismo que usa la lista de lotes de terreno. **No es la frontera de
 * autorización** —esa es `requireLocationAttributeAccess`, que corre en cada
 * lectura de detalle y en cada escritura—; es el filtro de la lista, y por eso
 * puede mostrar un lote que al abrirlo pida permiso.
 *
 * Se ofrecen `site`, `plot` y `apiary_site`, no sólo `plot`: un horno vive en
 * la finca o en el beneficio, no dentro de una parcela. Lo que se descarta es
 * la geografía administrativa —país, provincia, distrito, corregimiento—, que
 * son filas de la jerarquía y no sitios donde alguien queme nada. Es la misma
 * razón por la que `getManageableContext` filtra su propia lista de parcelas:
 * ofrecer «Panamá» en un desplegable de sitios es cómo se elige mal por error.
 */
const TIPOS_PRODUCTIVOS = new Set(["site", "plot", "apiary_site"]);

export async function listBiocharBatches(userAccountId: string) {
  const { locations: todas, organizations } = await getManageableContext(userAccountId);
  const locations = todas.filter((l) => TIPOS_PRODUCTIVOS.has(l.locationType));
  // El filtro de la LISTA usa todas las Locations visibles, no sólo las
  // productivas: si un lote quedara colgado de una fila administrativa por un
  // dato viejo, esconderlo sería peor que enseñarlo.
  const ids = todas.map((l) => l.id);
  const batches = ids.length
    ? await prisma.biocharBatch.findMany({
        where: { producedAtLocationId: { in: ids } },
        include: {
          organization: { select: { id: true, name: true } },
          producedAtLocation: { select: { id: true, name: true } },
        },
        orderBy: [{ producedAt: "desc" }, { createdAt: "desc" }],
      })
    : [];
  return { batches, locations, organizations };
}
