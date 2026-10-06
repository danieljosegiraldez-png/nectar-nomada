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
  "estado_salida_invalido",
  "desenlace_requerido",
] as const;

const CONOCIDOS = new Set<string>(ERRORES_DE_BANDEJA);

export class CantidadDeSecadoInvalida extends Error {}

/**
 * Cómo terminó un secado, en el orden en que la pantalla lo ofrece. Es la lista de `enum
 * DryingOutcome` del esquema —`tests/beneficio/desenlaceDelSecado.test.ts` lo comprueba—, escrita
 * aquí y no importada porque este módulo lo usa un componente de cliente. Sólo `target_reached`
 * arranca el reposo (`lib/beneficio/reposo.ts`).
 */
export const DESENLACES_DEL_SECADO = ["target_reached", "interrupted", "abandoned"] as const;
export type DesenlaceDelSecado = (typeof DESENLACES_DEL_SECADO)[number];

export class DesenlaceDeSecadoRequerido extends Error {}

/**
 * Las dos puertas que cierran un secado desde la app lo exigen (decisión de Daniel, 2026-10-04):
 * hasta ese día ninguna lo guardaba y el reposo no arrancaba nunca. Sin valor por omisión: suponer
 * «llegó al objetivo» sería inventar justo el dato que abre el reposo.
 */
export function desenlaceDelSecado(valor: FormDataEntryValue | null): DesenlaceDelSecado {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!(DESENLACES_DEL_SECADO as readonly string[]).includes(texto)) throw new DesenlaceDeSecadoRequerido();
  return texto as DesenlaceDelSecado;
}

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
