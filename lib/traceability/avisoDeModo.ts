import type { MaterialState } from "../../generated/prisma/client";
import { modoEsperado, hayDesajuste, type ModoDeMedicion } from "../equipos/modos";

export const MATERIALES: readonly MaterialState[] = ["CHERRY", "MUCILAGE_HONEY", "PARCHMENT", "GREEN"];

export function materialNoEsDeSecado(material: MaterialState | null, enSecado: boolean) {
  return enSecado && material === "GREEN";
}

/** Sin selección de modo aún, la sugerencia previene la lectura equivocada. */
export function avisoDeModo(material: MaterialState | null, modos: readonly ModoDeMedicion[], modoId: string) {
  if (!material) return null;
  const esperado = modoEsperado(material, modos);
  if (!esperado) return { clave: "aviso_sin_modo_para_material" as const, modo: "" };
  const elegido = modos.find((m) => m.id === modoId) ?? null;
  if (!elegido || hayDesajuste(elegido, material)) {
    return { clave: "aviso_modo_de_instrumento" as const, modo: esperado.label };
  }
  return null;
}

/** Los valores vacíos ni siquiera viajan a la acción; el cero sí. */
export function sinCamposVacios(datos: FormData): FormData {
  const salida = new FormData();
  for (const [clave, valor] of datos) {
    if (typeof valor !== "string" || valor.trim() !== "") salida.append(clave, valor);
  }
  return salida;
}
