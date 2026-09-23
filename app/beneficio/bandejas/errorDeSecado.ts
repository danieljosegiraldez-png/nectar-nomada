export const ERRORES_DE_BANDEJA = [
  "sin_acceso",
  "corrida_no_encontrada",
  "bandeja_no_encontrada",
  "corrida_con_cama",
  "bandeja_sin_acceso",
  "la_ultima_cierra_el_secado",
  "quedan_otras_bandejas",
  "secado_cerrado",
  "no_es_bandeja",
  "bandeja_de_otra_organizacion",
  "bandeja_retirada",
  "bandeja_ocupada",
  "fecha_antes_del_secado",
  "fecha_antes_de_cargar",
  "ya_bajada",
  "bandejas_sin_bajar",
  "posicion_invalida",
  "bandeja_fija",
  "bandeja_cambio",
  "fecha_antes_del_ultimo_traslado",
  "cantidad_invalida",
] as const;

const CONOCIDOS = new Set<string>(ERRORES_DE_BANDEJA);

export class CantidadDeSecadoInvalida extends Error {}

/** El vacío es opcional; cualquier valor presente debe ser un número finito. */
export function numeroOpcionalDeSecado(valor: FormDataEntryValue | null): number | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (texto === "") return null;
  const numero = Number(texto);
  if (!Number.isFinite(numero)) throw new CantidadDeSecadoInvalida();
  return numero;
}

/** Nunca entrega a next-intl una clave construida con un código desconocido. */
export function claveDeErrorDeSecado(error: string): `error_${string}` {
  return CONOCIDOS.has(error) ? `error_${error}` : "error_desconocido";
}
