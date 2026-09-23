import { DryingEnvironment, DryingVentilation, SamplingZone, ShadePercentageBracket, SkyCondition } from "../../generated/prisma/enums";
import { parseLocalDateTime, TZ_OFFSET_FIELD } from "../time/localDateTime";
import type { RegistrarInspeccionInput } from "./samplingEvents";
import type { LecturaDeAmbienteInput } from "./ambiente";

export class SecadoFormError extends Error {}
export const MATERIALES_DE_SECADO = ["CHERRY", "MUCILAGE_HONEY", "PARCHMENT"] as const;
export const PAPELES_DE_MUESTRA = ["ZONE", "REPLICATE"] as const;
export const AMBIENTES_DE_SECADO = Object.values(DryingEnvironment);
export const ZONAS_DE_MUESTRA = Object.values(SamplingZone);
export const GRADOS_DE_SOMBRA = Object.values(ShadePercentageBracket);
export const CIELOS = Object.values(SkyCondition);
export const VENTILACIONES = Object.values(DryingVentilation);
export type SecadoFormState = { error?: string };

function texto(form: FormData, key: string) {
  const value = form.get(key);
  if (value != null && typeof value !== "string") throw new SecadoFormError("datos_invalidos");
  return (value ?? "").trim();
}
function opcion<T extends string>(value: string, values: readonly T[]): T {
  const found = values.find((v) => v === value);
  if (!found) throw new SecadoFormError("datos_invalidos");
  return found;
}
function obligatorio(form: FormData, key: string) {
  const value = texto(form, key);
  if (!value) throw new SecadoFormError("datos_invalidos");
  return value;
}

/** El POST también valida: el desplegable no es la frontera. */
export function leerInspeccion(form: FormData): RegistrarInspeccionInput {
  return {
    lotId: obligatorio(form, "lotId"),
    dryingBedLocationId: obligatorio(form, "dryingBedLocationId"),
    occurredAt: parseLocalDateTime(texto(form, "occurredAt"), texto(form, TZ_OFFSET_FIELD)),
    operatorPersonId: texto(form, "operatorPersonId") || null,
    notes: texto(form, "notes") || null,
    muestras: [1, 2].map((n) => {
      const materialState = opcion(texto(form, `materialState_${n}`), MATERIALES_DE_SECADO);
      const samplingRole = opcion(texto(form, `samplingRole_${n}`), PAPELES_DE_MUESTRA);
      const zone = texto(form, `samplingZone_${n}`);
      const samplingZoneNote = texto(form, `samplingZoneNote_${n}`) || null;
      if (samplingRole === "REPLICATE" && (zone || samplingZoneNote)) {
        throw new SecadoFormError("replica_con_zona");
      }
      if (samplingRole === "ZONE" && !zone && !samplingZoneNote) {
        throw new SecadoFormError("zona_sin_identificar");
      }
      return { materialState, samplingRole, samplingZone: zone ? opcion(zone, ZONAS_DE_MUESTRA) : null, samplingZoneNote };
    }),
  };
}

export function leerUbicacionDeSecado(form: FormData) {
  const name = obligatorio(form, "name");
  if (name.length > 120) throw new SecadoFormError("datos_invalidos");
  const environment = texto(form, "dryingEnvironment");
  const rack = texto(form, "rackLevel");
  const rackLevel = rack ? Number(rack) : null;
  if (rackLevel !== null && (!Number.isInteger(rackLevel) || rackLevel < 1 || rackLevel > 2147483647)) {
    throw new SecadoFormError("rack_invalido");
  }
  // La sombra de arriba (Daniel, 2026-09-18): el grado es la escala de las
  // parcelas; la nota dice QUÉ la da. Vacías quedan nulas: no declarado.
  const grado = texto(form, "shadePercentage");
  if (grado && !(GRADOS_DE_SOMBRA as string[]).includes(grado)) throw new SecadoFormError("sombra_invalida");
  const shadeDescription = texto(form, "shadeDescription").trim() || null;
  if (shadeDescription && shadeDescription.length > 300) throw new SecadoFormError("sombra_invalida");
  return {
    name,
    dryingEnvironment: environment ? opcion(environment, AMBIENTES_DE_SECADO) : null,
    rackLevel,
    shadePercentage: (grado || null) as ShadePercentageBracket | null,
    shadeDescription,
  };
}

/** Un número opcional del formulario: vacío es null; lo que no es número, error. */
function numeroOpcional(form: FormData, key: string): number | null {
  const raw = texto(form, key);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new SecadoFormError("datos_invalidos");
  return n;
}

export function leerLecturaDeAmbiente(form: FormData): LecturaDeAmbienteInput {
  const temperatura = numeroOpcional(form, "temperatura");
  const cielo = texto(form, "skyCondition");
  const ventilacion = texto(form, "ventilation");
  return {
    facilityLocationId: obligatorio(form, "facilityLocationId"),
    rackLocationId: texto(form, "rackLocationId") || null,
    rackLevel: numeroOpcional(form, "rackLevel"),
    occurredAt: parseLocalDateTime(texto(form, "occurredAt"), texto(form, TZ_OFFSET_FIELD)),
    operatorPersonId: texto(form, "operatorPersonId") || null,
    temperatura: temperatura == null ? null : { valor: temperatura, unidad: opcion(texto(form, "unidadTemperatura"), ["C", "F"] as const) },
    humedadRelativaPct: numeroOpcional(form, "humedadRelativaPct"),
    cielo: cielo ? opcion(cielo, CIELOS) : null,
    notaCielo: texto(form, "skyNote") || null,
    ventilacion: ventilacion ? opcion(ventilacion, VENTILACIONES) : null,
    notaVentilacion: texto(form, "ventilationNote") || null,
  };
}
