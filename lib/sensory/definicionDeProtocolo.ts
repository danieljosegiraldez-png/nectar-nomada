/**
 * La forma de un protocolo sensorial escrito en un archivo, y su validación.
 *
 * **Por qué existe (2026-09-06).** Hasta hoy la ÚNICA forma de crear un
 * protocolo era `prisma/seed.ts`, y sólo con `SEED_DEMO_CONTENT=true`. En
 * producción no hay ninguno, así que no hay dónde meter un puntaje de taza: el
 * sistema tiene cata entera —sesiones, muestras ciegas, calibración— y cero
 * valoraciones porque falta la pieza de la que cuelgan todas.
 *
 * **La validación vive aquí y no en el script** por el mismo motivo que la
 * reconciliación de cosecha: dentro de un `main()` no se puede probar, y esto
 * decide qué acaba en la base de producción.
 *
 * **Lo que NO valida, y es a propósito:** si los atributos son los correctos
 * para catar café. Eso no es una propiedad del dato, es una decisión del dueño,
 * y por eso la definición vive en un archivo versionado que se lee en el diff.
 */

export interface DefinicionDeAtributo {
  name: string;
  section: "descriptive" | "affective";
  scaleMin: number;
  scaleMax: number;
}

export interface DefinicionDeProtocolo {
  domain: string;
  name: string;
  description: string;
  /** De dónde viene la estructura. Obligatorio: un protocolo sin procedencia
   *  declarada es exactamente el que alguien publicará como si fuera oficial. */
  standardSourceReference: string;
  standardLicenseStatus: "adapted_original" | "licensed" | "pending_license";
  version: number;
  scoreMin: number;
  scoreMax: number;
  attributes: DefinicionDeAtributo[];
}

export class DefinicionInvalida extends Error {}

const SECCIONES = ["descriptive", "affective"] as const;
const LICENCIAS = ["adapted_original", "licensed", "pending_license"] as const;

function exige(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new DefinicionInvalida(mensaje);
}

/**
 * Devuelve la definición ya comprobada, o lanza con una frase que se pueda leer.
 *
 * El orden de las comprobaciones no es casual: primero lo que impide crear nada
 * (campos ausentes), luego lo que crearía un protocolo roto (rangos), y al final
 * lo que crearía uno silenciosamente inútil (sin atributos, o con dos iguales).
 */
export function validarDefinicion(crudo: unknown): DefinicionDeProtocolo {
  exige(crudo && typeof crudo === "object", "El archivo no contiene un objeto.");
  const d = crudo as Partial<DefinicionDeProtocolo>;

  for (const campo of ["domain", "name", "description", "standardSourceReference"] as const) {
    exige(typeof d[campo] === "string" && d[campo]!.trim().length > 0, `Falta "${campo}", o está vacío.`);
  }
  exige(
    typeof d.standardLicenseStatus === "string" && (LICENCIAS as readonly string[]).includes(d.standardLicenseStatus),
    `"standardLicenseStatus" debe ser uno de: ${LICENCIAS.join(", ")}.`,
  );
  exige(Number.isInteger(d.version) && d.version! >= 1, '"version" debe ser un entero >= 1.');

  exige(Number.isFinite(d.scoreMin) && Number.isFinite(d.scoreMax), '"scoreMin" y "scoreMax" deben ser números.');
  exige(d.scoreMin! < d.scoreMax!, `"scoreMin" (${d.scoreMin}) debe ser menor que "scoreMax" (${d.scoreMax}).`);

  exige(Array.isArray(d.attributes) && d.attributes.length > 0, "Un protocolo sin atributos no puede puntuar nada.");

  const vistos = new Set<string>();
  for (const [i, a] of d.attributes!.entries()) {
    const donde = `atributo ${i + 1}`;
    exige(a && typeof a.name === "string" && a.name.trim().length > 0, `${donde}: falta "name".`);
    exige(
      (SECCIONES as readonly string[]).includes(a.section),
      `${donde} ("${a.name}"): "section" debe ser ${SECCIONES.join(" o ")}.`,
    );
    exige(
      Number.isFinite(a.scaleMin) && Number.isFinite(a.scaleMax) && a.scaleMin < a.scaleMax,
      `${donde} ("${a.name}"): "scaleMin" debe ser menor que "scaleMax".`,
    );
    // Un atributo que puntúa fuera del rango del protocolo produce totales que
    // nadie puede interpretar, y no lo impide ninguna restricción de la base.
    exige(
      a.scaleMin >= d.scoreMin! && a.scaleMax <= d.scoreMax!,
      `${donde} ("${a.name}"): su escala ${a.scaleMin}–${a.scaleMax} se sale del rango del protocolo ${d.scoreMin}–${d.scoreMax}.`,
    );
    const clave = a.name.trim().toLowerCase();
    exige(!vistos.has(clave), `Dos atributos se llaman "${a.name}". Un puntaje no sabría a cuál pertenece.`);
    vistos.add(clave);
  }

  return d as DefinicionDeProtocolo;
}
