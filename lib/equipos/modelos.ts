/**
 * El catálogo de modelos de equipo (spec de catálogos §3.1-3.2). Primer consumidor
 * del contrato común de `lib/catalogos/`.
 *
 * Definir qué es un «ATAGO PAL-1» es GESTIÓN, no faena: `equipment:manage`, como
 * `crearMaterial`. Las especificaciones son del FABRICANTE y no se mezclan con los
 * contrastes contra patrón, que dicen lo que el aparato hace de verdad.
 */
import { Prisma, type EquipmentContactMaterial, type EquipmentKind, type ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import {
  filtroVisible,
  organizacionesVisibles,
  requireCatalogoAccess,
  requireEntradaDeCatalogoAccess,
  type Dueno,
} from "../catalogos/propiedad";
import { prisma } from "../db";
import { puedeSobreEquipo } from "./equipos";

export class ModeloError extends Error {}

const GESTIONAR = { resourceType: "equipment", action: "manage" } as const;
const VER = { resourceType: "equipment", action: "view" } as const;

export interface DatosDeModelo {
  manufacturer: string;
  modelName: string;
  recommendedMaintenanceDays?: number | null;
  capacityValue?: string | null;
  capacityUnit?: string | null;
  contactMaterial?: EquipmentContactMaterial | null;
  contactMaterialNote?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  notes?: string | null;
}

export interface CrearModeloInput extends DatosDeModelo {
  dueno: Dueno;
  kind: EquipmentKind;
  /** Filas del mismo formulario. Entran con el modelo o no entra nada. */
  especificaciones?: EspecificacionInput[];
}

export interface EspecificacionInput {
  quantity: string;
  unit: string;
  rangeMin?: string | null;
  rangeMax?: string | null;
  resolution?: string | null;
  accuracyAbs?: string | null;
}

export interface ModeloEnLista {
  id: string;
  manufacturer: string;
  modelName: string;
  kind: EquipmentKind;
  organizationId: string | null;
  recommendedMaintenanceDays: number | null;
  retiredAt: Date | null;
  equipos: number;
}

const texto = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

/** Normaliza y valida lo que la base también rechazaría, para devolver una frase legible. */
function datosLimpios(kind: EquipmentKind, d: DatosDeModelo) {
  const manufacturer = d.manufacturer.trim();
  const modelName = d.modelName.trim();
  if (!manufacturer) throw new ModeloError("fabricante_obligatorio");
  if (!modelName) throw new ModeloError("modelo_obligatorio");
  const dias = d.recommendedMaintenanceDays ?? null;
  if (dias !== null && (!Number.isInteger(dias) || dias <= 0)) throw new ModeloError("mantenimiento_positivo");
  const capacityValue = texto(d.capacityValue);
  const capacityUnit = texto(d.capacityUnit);
  if ((capacityValue === null) !== (capacityUnit === null)) throw new ModeloError("capacidad_con_unidad");
  const material = d.contactMaterial ?? null;
  const conCapacidad = kind === "vessel" || kind === "machine";
  if (!conCapacidad && (capacityValue !== null || material !== null)) throw new ModeloError("capacidad_solo_en_vaso_o_maquina");
  const nota = texto(d.contactMaterialNote);
  if (material === "otro" && nota === null) throw new ModeloError("material_otro_con_nota");
  return {
    manufacturer,
    modelName,
    recommendedMaintenanceDays: dias,
    capacityValue: capacityValue === null ? null : new Prisma.Decimal(capacityValue),
    capacityUnit,
    contactMaterial: material,
    contactMaterialNote: nota,
    provenanceClass: d.provenanceClass,
    sourceReference: texto(d.sourceReference),
    notes: texto(d.notes),
  };
}

/**
 * Una especificación limpia, o `ModeloError` con frase legible. La base rechaza
 * lo mismo con sus CHECK; esto va antes para que el error se pueda leer, y para
 * que una fila mala se sepa ANTES de escribir nada.
 */
function especificacionLimpia(kind: EquipmentKind, e: EspecificacionInput) {
  if (kind !== "instrument") throw new ModeloError("especificacion_solo_en_instrumentos");
  const quantity = e.quantity.trim();
  const unit = e.unit.trim();
  if (!quantity || !unit) throw new ModeloError("magnitud_y_unidad_obligatorias");
  const dec = (v: string | null | undefined) => {
    const t = texto(v);
    if (t === null) return null;
    if (!Number.isFinite(Number(t))) throw new ModeloError("numero_invalido");
    return new Prisma.Decimal(t);
  };
  const data = { quantity, unit, rangeMin: dec(e.rangeMin), rangeMax: dec(e.rangeMax), resolution: dec(e.resolution), accuracyAbs: dec(e.accuracyAbs) };
  if (data.rangeMin !== null && data.rangeMax !== null && data.rangeMin.greaterThan(data.rangeMax)) throw new ModeloError("rango_invertido");
  if (data.resolution !== null && !data.resolution.greaterThan(0)) throw new ModeloError("resolucion_positiva");
  if (data.accuracyAbs !== null && data.accuracyAbs.isNegative()) throw new ModeloError("precision_no_negativa");
  return data;
}

type EspecificacionLimpia = ReturnType<typeof especificacionLimpia>;

/** Lo que la auditoría guarda de una especificación nueva. */
function especificacionAuditada(modelId: string, data: EspecificacionLimpia) {
  return {
    modelId,
    quantity: data.quantity,
    unit: data.unit,
    rangeMin: data.rangeMin?.toString() ?? null,
    rangeMax: data.rangeMax?.toString() ?? null,
    resolution: data.resolution?.toString() ?? null,
    accuracyAbs: data.accuracyAbs?.toString() ?? null,
  };
}

function esDuplicado(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function crearModelo(userAccountId: string, input: CrearModeloInput): Promise<{ id: string }> {
  const organizationId = await requireCatalogoAccess(userAccountId, input.dueno, GESTIONAR);
  const datos = datosLimpios(input.kind, input);
  // Todas las filas se validan ANTES de tocar la base: el modelo y sus
  // especificaciones entran juntos o no entra nada.
  const especificaciones = (input.especificaciones ?? []).map((e) => especificacionLimpia(input.kind, e));
  try {
    return await prisma.$transaction(async (tx) => {
      const m = await tx.equipmentModel.create({
        data: { ...datos, kind: input.kind, organizationId, createdBy: userAccountId },
        select: { id: true },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          entityType: "equipment_model",
          entityId: m.id,
          operation: "create",
          sourceInterface: "lib/equipos/modelos.ts",
          after: { ...datos, kind: input.kind, organizationId },
        },
        tx,
      );
      for (const e of especificaciones) {
        const spec = await tx.equipmentModelSpec.create({ data: { ...e, modelId: m.id, createdBy: userAccountId }, select: { id: true } });
        await recordAuditEvent(
          {
            actorUserAccountId: userAccountId,
            entityType: "equipment_model_spec",
            entityId: spec.id,
            operation: "create",
            sourceInterface: "lib/equipos/modelos.ts",
            after: especificacionAuditada(m.id, e),
          },
          tx,
        );
      }
      return m;
    });
  } catch (e) {
    if (esDuplicado(e)) throw new ModeloError("modelo_duplicado");
    throw e;
  }
}

export async function editarModelo(userAccountId: string, modelId: string, d: DatosDeModelo): Promise<void> {
  const antes = await prisma.equipmentModel.findUnique({ where: { id: modelId } });
  if (!antes) throw new ModeloError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, antes, GESTIONAR);
  const datos = datosLimpios(antes.kind, d);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.equipmentModel.update({ where: { id: modelId }, data: datos });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          entityType: "equipment_model",
          entityId: modelId,
          operation: "update",
          sourceInterface: "lib/equipos/modelos.ts",
          before: {
            manufacturer: antes.manufacturer,
            modelName: antes.modelName,
            recommendedMaintenanceDays: antes.recommendedMaintenanceDays,
            capacityValue: antes.capacityValue?.toString() ?? null,
            capacityUnit: antes.capacityUnit,
            contactMaterial: antes.contactMaterial,
            contactMaterialNote: antes.contactMaterialNote,
            provenanceClass: antes.provenanceClass,
            sourceReference: antes.sourceReference,
            notes: antes.notes,
          },
          after: { ...datos, capacityValue: datos.capacityValue?.toString() ?? null },
        },
        tx,
      );
    });
  } catch (e) {
    if (esDuplicado(e)) throw new ModeloError("modelo_duplicado");
    throw e;
  }
}

export async function retirarModelo(userAccountId: string, modelId: string, cuando: Date): Promise<void> {
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId } });
  if (!m) throw new ModeloError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
  if (m.retiredAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.equipmentModel.update({ where: { id: modelId }, data: { retiredAt: cuando } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "equipment_model", entityId: modelId, operation: "retire", sourceInterface: "lib/equipos/modelos.ts", after: { retiredAt: cuando.toISOString() } },
      tx,
    );
  });
}

export async function declararEspecificacion(userAccountId: string, modelId: string, e: EspecificacionInput): Promise<{ id: string }> {
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId } });
  if (!m) throw new ModeloError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
  const data = especificacionLimpia(m.kind, e);
  return prisma.$transaction(async (tx) => {
    const spec = await tx.equipmentModelSpec.create({ data: { ...data, modelId, createdBy: userAccountId }, select: { id: true } });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "equipment_model_spec",
        entityId: spec.id,
        operation: "create",
        sourceInterface: "lib/equipos/modelos.ts",
        after: especificacionAuditada(modelId, data),
      },
      tx,
    );
    return spec;
  });
}

export async function retirarEspecificacion(userAccountId: string, specId: string, cuando: Date): Promise<void> {
  const s = await prisma.equipmentModelSpec.findUnique({ where: { id: specId }, include: { model: true } });
  if (!s) throw new ModeloError("especificacion_no_encontrada");
  await requireEntradaDeCatalogoAccess(userAccountId, s.model, GESTIONAR);
  if (s.retiredAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.equipmentModelSpec.update({ where: { id: specId }, data: { retiredAt: cuando } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "equipment_model_spec", entityId: specId, operation: "retire", sourceInterface: "lib/equipos/modelos.ts", after: { retiredAt: cuando.toISOString() } },
      tx,
    );
  });
}

/**
 * «¿Puede esta persona ver ESTE equipo?», con memoria por id. La cuenta y la
 * lista de equipos de un modelo siguen el permiso real de cada unidad —dónde
 * está, su proyecto, su clasificación— y no la organización: «de mi
 * organización» no es «puedo verlo», y un modelo compartido tiene unidades de
 * todas.
 */
function verEquipo(userAccountId: string) {
  const memo = new Map<string, Promise<boolean>>();
  return (equipmentId: string) => {
    let p = memo.get(equipmentId);
    if (!p) {
      p = puedeSobreEquipo(userAccountId, equipmentId, "view");
      memo.set(equipmentId, p);
    }
    return p;
  };
}

async function soloVisibles<T extends { id: string }>(equipos: readonly T[], veo: (id: string) => Promise<boolean>): Promise<T[]> {
  const si = await Promise.all(equipos.map((e) => veo(e.id)));
  return equipos.filter((_, i) => si[i]);
}

async function enLista(where: Prisma.EquipmentModelWhereInput, veo: (id: string) => Promise<boolean>): Promise<ModeloEnLista[]> {
  const filas = await prisma.equipmentModel.findMany({
    where,
    select: { id: true, manufacturer: true, modelName: true, kind: true, organizationId: true, recommendedMaintenanceDays: true, retiredAt: true, equipment: { select: { id: true } } },
    orderBy: [{ manufacturer: "asc" }, { modelName: "asc" }],
  });
  return Promise.all(filas.map(async ({ equipment, ...f }) => ({ ...f, equipos: (await soloVisibles(equipment, veo)).length })));
}

export async function listarModelos(
  userAccountId: string,
  filtro: { kind?: EquipmentKind; incluirRetirados?: boolean } = {},
): Promise<{ compartidos: ModeloEnLista[]; propios: ModeloEnLista[] }> {
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const veo = verEquipo(userAccountId);
  const base: Prisma.EquipmentModelWhereInput = {
    ...(filtro.kind ? { kind: filtro.kind } : {}),
    ...(filtro.incluirRetirados ? {} : { retiredAt: null }),
  };
  const [compartidos, propios] = await Promise.all([
    enLista({ ...base, organizationId: null }, veo),
    orgs.length > 0 ? enLista({ ...base, organizationId: { in: orgs } }, veo) : Promise.resolve([]),
  ]);
  return { compartidos, propios };
}

/** Para el desplegable del alta: sólo vigentes, del tipo dado, compartidos + los de ESA organización. */
export async function modelosParaElegir(userAccountId: string, organizationId: string, kind: EquipmentKind) {
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const veo = verEquipo(userAccountId);
  const propios = orgs.includes(organizationId)
    ? await enLista({ kind, retiredAt: null, organizationId }, veo)
    : [];
  const compartidos = await enLista({ kind, retiredAt: null, organizationId: null }, veo);
  return { compartidos, propios };
}

export async function modeloParaFicha(userAccountId: string, modelId: string) {
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const m = await prisma.equipmentModel.findFirst({
    where: { id: modelId, ...filtroVisible(orgs) },
    include: {
      organization: { select: { name: true } },
      specs: { where: { retiredAt: null }, orderBy: [{ displayOrder: "asc" }, { quantity: "asc" }] },
      equipment: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!m) throw new ModeloError("modelo_no_encontrado");
  return { ...m, equipment: await soloVisibles(m.equipment, verEquipo(userAccountId)) };
}
export type FichaDeModelo = Awaited<ReturnType<typeof modeloParaFicha>>;

export async function puedeEditarModelo(userAccountId: string, modelId: string): Promise<boolean> {
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId }, select: { organizationId: true } });
  if (!m) return false;
  try {
    await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
    return true;
  } catch {
    return false;
  }
}

export async function puedeCrearCompartido(userAccountId: string): Promise<boolean> {
  try {
    await requireCatalogoAccess(userAccountId, { tipo: "compartido" }, GESTIONAR);
    return true;
  } catch {
    return false;
  }
}
