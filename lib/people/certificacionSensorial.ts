/**
 * Las credenciales sensoriales de una persona: su forma y su validación.
 *
 * **Por qué existe (2026-09-07).** `Person.sensoryCertifications` está en el
 * esquema desde hace meses, especificado en `BEVERAGE_SENSORY_PROTOCOLS.md`
 * §7.3, y **nadie lo leía ni lo escribía**. Desde ayer sí importa: un informe de
 * cata externo se atribuye a una persona, y lo que hace que ese puntaje valga
 * algo es qué credencial tenía quien lo firmó. Un campo `Json?` sin validación
 * acepta cualquier cosa, y el día que alguien escriba `{"q": true}` nadie podrá
 * leer la columna.
 *
 * **La validación vive aquí y no en el script** por el mismo motivo que
 * `definicionDeProtocolo.ts`: dentro de un `main()` no se puede probar, y esto
 * decide qué acaba en la base de producción.
 *
 * **Una desviación del documento, dicha a propósito.** §7.3 lista seis campos y
 * sólo marca `expiry_date` como anulable. Aquí son obligatorios tres —cuerpo
 * certificador, nombre de la certificación y fecha— y opcionales los otros
 * tres. Razón: quien transcribe puede saber que alguien es Q Grader de CQI
 * desde 2024 y **no tener a mano el número de certificado**. Exigirlo obligaría
 * a inventarlo o a no registrar nada, y CLAUDE.md §3 dice que lo que falta se
 * queda faltando. Lo ausente se guarda **ausente**, no como cadena vacía.
 *
 * **Las claves van en snake_case** porque así las fija §7.3 y así se leerán
 * desde fuera; es el único sitio del código donde eso pasa, y es deliberado.
 */

export interface CertificacionSensorial {
  certifying_body: string;
  certification_name: string;
  date_earned: string;
  level_or_rank?: string;
  expiry_date?: string;
  certificate_reference?: string;
}

export class CertificacionInvalida extends Error {}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function exige(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new CertificacionInvalida(mensaje);
}

/** Una fecha que existe de verdad: `2026-02-31` casa el patrón y no existe. */
function fechaReal(v: string): boolean {
  if (!FECHA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Devuelve la certificación normalizada, o lanza con una frase legible.
 *
 * Normalizar significa recortar espacios y **quitar las claves opcionales que
 * llegaron vacías**, en vez de guardarlas como `""`. Una cadena vacía en
 * `certificate_reference` afirma que hay una referencia y que es vacía; la
 * ausencia dice lo que pasa de verdad, que nadie la anotó.
 */
export function validarCertificacion(crudo: unknown): CertificacionSensorial {
  exige(crudo && typeof crudo === "object", "La certificación no es un objeto.");
  const c = crudo as Partial<CertificacionSensorial>;

  for (const campo of ["certifying_body", "certification_name", "date_earned"] as const) {
    exige(typeof c[campo] === "string" && c[campo]!.trim().length > 0, `Falta "${campo}", o está vacío.`);
  }
  exige(
    fechaReal(c.date_earned!.trim()),
    `"date_earned" es "${c.date_earned}"; se espera una fecha real en formato AAAA-MM-DD.`,
  );

  const salida: CertificacionSensorial = {
    certifying_body: c.certifying_body!.trim(),
    certification_name: c.certification_name!.trim(),
    date_earned: c.date_earned!.trim(),
  };

  for (const campo of ["level_or_rank", "certificate_reference"] as const) {
    const v = c[campo];
    exige(v === undefined || v === null || typeof v === "string", `"${campo}" debe ser texto si se da.`);
    const limpio = typeof v === "string" ? v.trim() : "";
    if (limpio.length > 0) salida[campo] = limpio;
  }

  if (c.expiry_date !== undefined && c.expiry_date !== null && String(c.expiry_date).trim() !== "") {
    const hasta = String(c.expiry_date).trim();
    exige(fechaReal(hasta), `"expiry_date" es "${c.expiry_date}"; se espera AAAA-MM-DD.`);
    exige(
      hasta >= salida.date_earned,
      `"expiry_date" (${hasta}) es anterior a "date_earned" (${salida.date_earned}).`,
    );
    salida.expiry_date = hasta;
  }

  return salida;
}

/**
 * Lee la columna `Json?` y devuelve la lista, o lanza si lo que hay dentro no
 * tiene la forma esperada.
 *
 * **No repara lo que encuentra.** Si una fila trae basura, esto falla y lo dice:
 * arreglarla en silencio convertiría un dato roto en uno plausible, que es peor.
 */
export function leerCertificaciones(valor: unknown): CertificacionSensorial[] {
  if (valor === null || valor === undefined) return [];
  exige(
    Array.isArray(valor),
    "`sensoryCertifications` de esta persona no es una lista. Míralo a mano antes de escribir encima.",
  );
  return valor.map((c, i) => {
    try {
      return validarCertificacion(c);
    } catch (error) {
      throw new CertificacionInvalida(
        `La certificación ${i + 1} que ya estaba guardada no es válida: ${(error as Error).message}`,
      );
    }
  });
}

/**
 * Añade una certificación a las que ya tiene, o lanza si es la misma.
 *
 * **Misma = mismo cuerpo, misma certificación y misma fecha**, comparados sin
 * distinguir mayúsculas. Renovar una certificación produce otra fecha, así que
 * dos filas del mismo Q Grader con fechas distintas son legítimas y deben
 * convivir: el historial de credenciales es parte de la procedencia.
 */
export function agregarCertificacion(
  existentes: readonly CertificacionSensorial[],
  nueva: CertificacionSensorial,
): CertificacionSensorial[] {
  const clave = (c: CertificacionSensorial) =>
    [c.certifying_body, c.certification_name, c.date_earned].map((x) => x.toLowerCase()).join(" ");
  if (existentes.some((c) => clave(c) === clave(nueva))) {
    throw new CertificacionInvalida(
      `Esta persona ya tiene "${nueva.certification_name}" de ${nueva.certifying_body} con fecha ${nueva.date_earned}.`,
    );
  }
  return [...existentes, nueva];
}
