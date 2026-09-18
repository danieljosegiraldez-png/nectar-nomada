/**
 * La lectura derivada de un nodo: versionada y recalculable — artefactos de colmena, Tarea 6.
 *
 * Del paquete Smart Hive (`PLATFORM_API.md`): «los resultados derivados son registros versionados
 * aparte que referencian el id del evento crudo; los valores ausentes son nulos con su fallo,
 * nunca ceros; recalibrar después no muta la evidencia original». La fórmula es la de su firmware
 * (`calibration.py`): kg = (raw_filtered − offset) / counts_per_kg, y una escala menor que 1
 * cuenta/kg es `CAL_INVALID`.
 *
 * Permiso: `hive_node:manage` en el sitio donde se calibró — calibrar y reinterpretar lo que mide
 * un aparato es del mismo orden que moverlo.
 *
 * Avisa, no diagnostica: las limitaciones dicen qué le pasa a la LECTURA, nunca a la colmena.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireHiveNodeAccess } from "../apiary/hives";
import { ArtefactoInvalido } from "../apiary/artefactos";

const ALGORITMO_PESO = "hx711-lineal";

export interface RegistrarCalibracionInput {
  readonly hiveNodeId: string;
  readonly locationId: string;
  readonly calibrationId: string;
  readonly offset: number;
  readonly countsPerKg: number;
  readonly residualKg?: number | null;
  readonly performedAt: Date;
}

export async function registrarCalibracion(userAccountId: string, input: RegistrarCalibracionInput) {
  const [nodo, sitio] = await Promise.all([
    prisma.hiveNode.findUnique({ where: { id: input.hiveNodeId }, select: { organizationId: true } }),
    prisma.location.findUnique({ where: { id: input.locationId }, select: { organizationId: true } }),
  ]);
  if (!nodo) throw new ArtefactoInvalido("nodo_no_encontrado");
  if (!sitio) throw new ApiaryAccessError("location_not_found");
  await requireHiveNodeAccess(userAccountId, [{ locationId: input.locationId }]);
  if (sitio.organizationId !== nodo.organizationId) throw new ArtefactoInvalido("nodo_de_otra_finca");

  // La misma regla que el firmware, antes que la base (que la repite en un CHECK).
  if (!Number.isFinite(input.offset) || !Number.isFinite(input.countsPerKg) || Math.abs(input.countsPerKg) < 1) {
    throw new ArtefactoInvalido("CAL_INVALID");
  }
  const calibrationId = input.calibrationId.trim();
  if (!calibrationId) throw new ArtefactoInvalido("calibration_id_requerido");

  try {
    return await prisma.$transaction(async (tx) => {
      const cal = await tx.nodeCalibration.create({
        data: {
          hiveNodeId: input.hiveNodeId,
          calibrationId,
          offset: input.offset,
          countsPerKg: input.countsPerKg,
          residualKg: input.residualKg ?? null,
          locationId: input.locationId,
          performedAt: input.performedAt,
          createdBy: userAccountId,
        },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "node_calibration.register",
          entityType: "node_calibration",
          entityId: cal.id,
          after: cal,
          sourceInterface: "apiary.service",
        },
        tx,
      );
      return cal;
    });
  } catch (error) {
    if (error instanceof Error && /Unique constraint/i.test(error.message) && /calibration_id/.test(error.message)) {
      throw new ArtefactoInvalido("calibracion_ya_registrada");
    }
    throw error;
  }
}

type Bascula = { raw_filtered?: unknown; spread_kg?: unknown } | null | undefined;

/**
 * Los kilos de UNA observación con UNA calibración y UNA versión del algoritmo. Idempotente:
 * la misma terna devuelve la lectura que ya existe. El crudo no se toca nunca.
 */
export async function derivarPeso(
  userAccountId: string,
  observationId: string,
  opciones: { readonly calibracionId: string; readonly version: number },
) {
  const [obs, cal] = await Promise.all([
    prisma.nodeObservation.findUnique({ where: { id: observationId }, select: { id: true, hiveNodeId: true, payload: true, faults: true } }),
    prisma.nodeCalibration.findUnique({ where: { id: opciones.calibracionId } }),
  ]);
  if (!obs) throw new ArtefactoInvalido("observacion_no_encontrada");
  if (!cal) throw new ArtefactoInvalido("calibracion_no_encontrada");
  await requireHiveNodeAccess(userAccountId, [{ locationId: cal.locationId }]);
  // Una calibración es de SU aparato: con la de otro nodo, los kilos serían de nadie.
  if (cal.hiveNodeId !== obs.hiveNodeId) throw new ArtefactoInvalido("calibracion_de_otro_nodo");
  if (!Number.isInteger(opciones.version) || opciones.version < 1) throw new ArtefactoInvalido("version_invalida");

  const clave = {
    observationId_variable_algorithm_algorithmVersion_calibrationId: {
      observationId,
      variable: "weight_kg",
      algorithm: ALGORITMO_PESO,
      algorithmVersion: opciones.version,
      calibrationId: cal.id,
    },
  };
  const previa = await prisma.nodeDerivedReading.findUnique({ where: clave });
  if (previa) return previa;

  const bascula = ((obs.payload as { observations?: { weight?: Bascula } }).observations?.weight ?? null) as Bascula;
  const faults = Array.isArray(obs.faults) ? (obs.faults as string[]) : [];
  const limitations: string[] = [];
  let value: number | null = null;

  if (!bascula || typeof bascula.raw_filtered !== "number" || !Number.isFinite(bascula.raw_filtered)) {
    // Nulo con su razón, nunca cero: sin cuentas no hay kilos que calcular.
    limitations.push("SENSOR_EN_FALLO");
  } else {
    value = (bascula.raw_filtered - cal.offset) / cal.countsPerKg;
    // Los mismos umbrales que el firmware: ventana > 0.2 kg, y fuera de −2…120 kg.
    if (faults.includes("WEIGHT_WINDOW_UNSTABLE") || (typeof bascula.spread_kg === "number" && bascula.spread_kg > 0.2)) {
      limitations.push("VENTANA_INESTABLE");
    }
    if (value > 120 || value < -2) limitations.push("FUERA_DE_RANGO");
  }

  return prisma.$transaction(async (tx) => {
    const lectura = await tx.nodeDerivedReading.create({
      data: {
        observationId,
        variable: "weight_kg",
        value,
        unit: "kg",
        algorithm: ALGORITMO_PESO,
        algorithmVersion: opciones.version,
        calibrationId: cal.id,
        limitations,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "node_derived_reading.create",
        entityType: "node_derived_reading",
        entityId: lectura.id,
        after: lectura,
        sourceInterface: "apiary.service",
      },
      tx,
    );
    return lectura;
  });
}
