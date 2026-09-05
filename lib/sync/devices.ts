import { prisma } from "../db";

/**
 * P4 §1 — alta de un aparato que va a sincronizar.
 *
 * Existe como servicio y no dentro de la ruta porque `app/**` no importa un
 * cliente de base de datos: los guardias viven en `lib/<dominio>/` y el
 * `eslint` del repositorio lo hace cumplir. La regla no es ceremonia — la ruta
 * de al lado ya se saltó esa frontera y el lint la paró.
 */

export class DeviceValidationError extends Error {}

const PLATAFORMAS = ["pwa", "android"] as const;
export type DevicePlatform = (typeof PLATAFORMAS)[number];

export interface RegisterDeviceInput {
  label: string;
  platform: string;
  operatorPersonId?: string | null;
}

export async function registerDevice(userAccountId: string, input: RegisterDeviceInput) {
  const label = input.label.trim();
  if (label === "") throw new DeviceValidationError("label_required");

  // `platform` es texto libre en el esquema porque el conjunto no está cerrado
  // —la Fase 5 traerá `android` y puede que algo más—, pero aceptar cualquier
  // cosa por HTTP ensuciaría el inventario de aparatos con erratas. El esquema
  // deja crecer; esta puerta decide qué entra hoy.
  if (!(PLATAFORMAS as readonly string[]).includes(input.platform)) {
    throw new DeviceValidationError("platform_unsupported");
  }

  // Si nombran a una Persona, que exista. Mismo criterio que `recordFieldEvent`
  // con `operatorPersonId`, y por la misma razón: un id mal tecleado debe decir
  // qué pasa en vez de reventar contra una clave foránea.
  //
  // Y como allí, esto NO es un control de permisos: el operador de un teléfono
  // compartido es normalmente una Persona sin cuenta.
  if (input.operatorPersonId) {
    const persona = await prisma.person.findUnique({
      where: { id: input.operatorPersonId },
      select: { id: true },
    });
    if (!persona) throw new DeviceValidationError("operator_not_found");
  }

  return prisma.device.create({
    data: {
      label: label.slice(0, 120),
      platform: input.platform,
      operatorPersonId: input.operatorPersonId ?? null,
      createdBy: userAccountId,
    },
    select: { id: true, label: true, platform: true, registeredAt: true },
  });
}
