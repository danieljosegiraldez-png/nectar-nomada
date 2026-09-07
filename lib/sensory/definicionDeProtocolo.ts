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

import {
  ATRIBUTOS_CVA_AFECTIVO,
  ESCALA_ATRIBUTO_MAX,
  ESCALA_ATRIBUTO_MIN,
  FORMULA_CVA_AFECTIVO,
} from "./puntajeCva";
import { FORMULA_SUMA_DE_ATRIBUTOS } from "./puntajeSuma";

export interface DefinicionDeAtributo {
  name: string;
  section: "descriptive" | "affective";
  scaleMin: number;
  scaleMax: number;
}

/**
 * Una entrada del vocabulario del protocolo: un descriptor, o un defecto.
 *
 * La forma sale del esquema, que a su vez sale de la taxonomía de miel de
 * `BEVERAGE_SENSORY_PROTOCOLS.md` §3: familia, descriptor concreto, qué se
 * espera percibir, y si eso es bueno, neutro o un defecto. `technicalCause`
 * sólo tiene sentido en un defecto — un defecto que nombra su causa es
 * diagnóstico; uno que no, es una etiqueta.
 */
export interface DefinicionDeDescriptor {
  family: string;
  specificDescriptor: string;
  expectedPerception?: string | null;
  classification: "positive" | "neutral" | "defect";
  technicalCause?: string | null;
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
  /** Cómo se obtiene el puntaje total. Ausente = lo teclea quien cata, que es
   *  como funcionó siempre. Presente = lo calcula el servidor y el formulario
   *  deja de pedirlo. Ver `lib/sensory/puntajeCva.ts`. */
  scoreFormula?: string | null;
  attributes: DefinicionDeAtributo[];
  /** El vocabulario del protocolo. Opcional: los seis protocolos que ya
   *  existen no tienen ninguno, y un protocolo sin vocabulario sigue siendo
   *  válido — sólo no ofrece descriptores que marcar. */
  descriptors?: DefinicionDeDescriptor[];
}

export class DefinicionInvalida extends Error {}

const SECCIONES = ["descriptive", "affective"] as const;
const LICENCIAS = ["adapted_original", "licensed", "pending_license"] as const;
const FORMULAS = [FORMULA_CVA_AFECTIVO, FORMULA_SUMA_DE_ATRIBUTOS] as const;
const CLASIFICACIONES = ["positive", "neutral", "defect"] as const;

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

  if (d.descriptors !== undefined) validarDescriptores(d.descriptors);

  if (d.scoreFormula !== undefined && d.scoreFormula !== null) {
    exige(
      typeof d.scoreFormula === "string" && (FORMULAS as readonly string[]).includes(d.scoreFormula),
      `"scoreFormula" debe ser una de: ${FORMULAS.join(", ")}. Una desconocida se guardaría y nadie la calcularía.`,
    );
    if (d.scoreFormula === FORMULA_CVA_AFECTIVO) validarCvaAfectivo(d as DefinicionDeProtocolo);
  }

  return d as DefinicionDeProtocolo;
}

/**
 * Un protocolo que pide el cálculo del CVA tiene que traer exactamente lo que
 * ese cálculo necesita.
 *
 * Sin esto, un archivo con seis atributos y `scoreFormula` puesto se crearía sin
 * una queja y reventaría meses después, en la primera valoración que alguien
 * intentara enviar: el error saldría lejísimos de su causa. La forma se
 * comprueba donde se escribe, no donde se usa.
 */
function validarCvaAfectivo(d: DefinicionDeProtocolo): void {
  const afectivos = d.attributes.filter((a) => a.section === "affective");
  exige(
    afectivos.length === d.attributes.length,
    `Con "${FORMULA_CVA_AFECTIVO}" los ${ATRIBUTOS_CVA_AFECTIVO.length} atributos son afectivos; ${d.attributes.length - afectivos.length} está(n) marcado(s) como descriptivo.`,
  );

  const nombres = d.attributes.map((a) => a.name);
  exige(
    nombres.length === ATRIBUTOS_CVA_AFECTIVO.length &&
      nombres.every((n, i) => n === ATRIBUTOS_CVA_AFECTIVO[i]),
    `Con "${FORMULA_CVA_AFECTIVO}" los atributos deben ser exactamente, y en este orden: ${ATRIBUTOS_CVA_AFECTIVO.join(", ")}. Llegaron: ${nombres.join(", ")}.`,
  );

  for (const a of d.attributes) {
    exige(
      a.scaleMin === ESCALA_ATRIBUTO_MIN && a.scaleMax === ESCALA_ATRIBUTO_MAX,
      `"${a.name}" va de ${a.scaleMin} a ${a.scaleMax}; el CVA afectivo puntúa de ${ESCALA_ATRIBUTO_MIN} a ${ESCALA_ATRIBUTO_MAX}.`,
    );
  }
}

/**
 * El vocabulario, comprobado con la misma severidad que los atributos.
 *
 * **Por qué la unicidad es (familia, descriptor) y no sólo el descriptor.** Dos
 * familias pueden nombrar lo mismo con sentido distinto —«miel» es un descriptor
 * floral en café y el producto entero en miel—, así que el par es lo que
 * identifica. Repetir el par sí es un error: una respuesta marcada no sabría a
 * cuál de los dos pertenece, exactamente igual que con dos atributos homónimos.
 *
 * **Y la causa técnica sólo en un defecto.** El esquema la deja nula en todos, y
 * una causa colgada de un descriptor positivo —«rosa, causado por…»— es la clase
 * de dato que se lee mal una vez y se propaga.
 */
function validarDescriptores(descriptores: unknown): void {
  exige(Array.isArray(descriptores), '"descriptors" debe ser una lista.');
  exige(
    descriptores.length > 0,
    'Un "descriptors" vacío no es lo mismo que no tenerlo: quítalo del archivo si el protocolo no trae vocabulario.',
  );

  const vistos = new Set<string>();
  for (const [i, c] of (descriptores as DefinicionDeDescriptor[]).entries()) {
    const donde = `descriptor ${i + 1}`;
    exige(c && typeof c === "object", `${donde}: no es un objeto.`);
    for (const campo of ["family", "specificDescriptor"] as const) {
      exige(typeof c[campo] === "string" && c[campo].trim().length > 0, `${donde}: falta "${campo}", o está vacío.`);
    }
    exige(
      (CLASIFICACIONES as readonly string[]).includes(c.classification),
      `${donde} ("${c.specificDescriptor}"): "classification" debe ser ${CLASIFICACIONES.join(", ")}.`,
    );
    exige(
      c.technicalCause === undefined || c.technicalCause === null || c.classification === "defect",
      `${donde} ("${c.specificDescriptor}"): sólo un defecto lleva "technicalCause". Un descriptor positivo con causa se lee como si algo hubiera salido mal.`,
    );

    const clave = `${c.family.trim().toLowerCase()}\u0000${c.specificDescriptor.trim().toLowerCase()}`;
    exige(
      !vistos.has(clave),
      `Dos descriptores son "${c.family} / ${c.specificDescriptor}". Una respuesta marcada no sabría a cuál pertenece.`,
    );
    vistos.add(clave);
  }
}
