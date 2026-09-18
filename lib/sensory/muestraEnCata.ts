/**
 * Lo que el navegador y el servidor tienen que decir IGUAL sobre una muestra en
 * una cata: su etiqueta y su código ciego. Sin base de datos, para que el
 * selector de muestras pueda importarlo.
 *
 * `codigoCiego` vivía dentro de `sessions.ts`, que importa Prisma. El selector
 * enseña la letra que va a tocarle a cada muestra; si la calculara con otra
 * función, la pantalla podría prometer una «B» y la base guardar otra.
 */

/**
 * Códigos ciegos: A, B, C… en el orden dado, y **no barajados**.
 *
 * Deliberado y con su límite dicho: el juez sólo ve el código, así que el orden
 * no le filtra nada. Quien SÍ podría deducir el mapeo es quien vea la lista de
 * muestras con la que se creó la sesión — y ése es el head judge, que puede ver
 * el mapeo de todos modos (`blind_mapping:view`). Barajar sería mejor práctica y
 * es una línea, pero cambia lo que significa el código para quien prepara la
 * mesa; no se decide desde aquí.
 */
export function codigoCiego(indice: number): string {
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (indice < letras.length) return letras[indice]!;
  return `${letras[Math.floor(indice / letras.length) - 1]}${letras[indice % letras.length]}`;
}

/**
 * **Qué café es, no sólo qué código tiene.** Antes decía «111 · green_coffee» y
 * con eso nadie sabe cuál de sus cafés está a punto de catar. El orden va de lo
 * que identifica a lo que matiza: batch, finca, grado del proceso, y al final el
 * tipo y la descripción.
 */
export function etiquetaDeMuestra(m: {
  sampleCode: string;
  lotCode: string | null;
  organizationName: string | null;
  processGrade: string | null;
  sampleType: string;
  description: string | null;
}): string {
  return [m.sampleCode, m.lotCode, m.organizationName, m.processGrade, m.sampleType, m.description]
    .filter(Boolean)
    .join(" · ");
}
