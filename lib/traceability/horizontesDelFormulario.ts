/**
 * Los horizontes de una calicata, leídos del `FormData` — **una vez, para los
 * dos caminos**.
 *
 * **Por qué vive aquí.** Mismo motivo y misma forma que
 * `lib/time/fechaConPrecision.ts`: el camino CON señal
 * (`createSoilProfileAction`, en `app/actions/traceability.ts`) y el camino SIN
 * señal (`construirPayloadDePerfilDeSuelo`, en `lib/sync/parcelaPayload.ts`)
 * tienen que leer las MISMAS filas con las MISMAS reglas, y tener esa lectura
 * dos veces es la clase de defecto que más ha costado en este repositorio. La
 * restricción de un archivo `"use server"` es sobre lo que EXPORTA, no sobre lo
 * que importa, así que la lógica baja a `lib/` y los dos lados la importan.
 *
 * **No importa nada que llegue a `prisma`, y no es casualidad.**
 * `lib/sync/parcelaPayload.ts` lo importa como VALOR desde tres formularios
 * `"use client"`; `tests/arquitectura/cliente-sin-prisma.test.ts` cuenta lo que
 * costó el día que un componente arrastró `pg` al paquete del navegador. Por eso
 * `HorizonteDelFormulario` se declara aquí en vez de reusar `SoilHorizonInput`
 * de `lib/traceability/soilProfiles.ts`, que sí llega a `lib/db` — son
 * estructuralmente el mismo tipo, y `createSoilProfile` los acepta tal cual.
 */

/**
 * Un horizonte tal y como sale del formulario. Coincide campo a campo con
 * `SoilHorizonInput` (`lib/traceability/soilProfiles.ts`), que es quien lo
 * valida y lo escribe.
 */
export interface HorizonteDelFormulario {
  ordinal: number;
  topCm: number | null;
  bottomCm: number | null;
  designation: string | null;
  colour: string | null;
  structure: string | null;
  textureByFeel: string | null;
  notes: string | null;
}

const vacioANull = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? str : null;
};

const vacioANumero = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? Number(str) : null;
};

/**
 * El índice más alto que trae el formulario para un prefijo dado.
 *
 * Se deriva de lo enviado en vez de fijar un tope: cualquier tope es una
 * suposición sobre cuántas filas cabe que use alguien, y equivocarse descarta
 * datos en silencio. Devuelve -1 si no hay ninguna.
 */
export function maxIndiceDeFilas(formData: FormData, prefijo: string): number {
  let max = -1;
  for (const clave of formData.keys()) {
    if (!clave.startsWith(`${prefijo}.`)) continue;
    const n = Number(clave.slice(prefijo.length + 1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

/**
 * Los horizontes que trae el formulario.
 *
 * Una fila entera vacía se descarta —el formulario ofrece más de las que se
 * suelen usar— pero una fila con CUALQUIER dato entra, aunque le falte la
 * profundidad: un horizonte que se vio y no se midió sigue siendo un horizonte,
 * y el ordinal existe justamente para no depender de `topCm`.
 */
export function horizontesDelFormulario(formData: FormData): HorizonteDelFormulario[] {
  const filas: HorizonteDelFormulario[] = [];
  const total = maxIndiceDeFilas(formData, "horizonOrdinal");
  for (let i = 0; i <= total; i++) {
    const campos = {
      topCm: vacioANumero(formData.get(`horizonTopCm.${i}`)),
      bottomCm: vacioANumero(formData.get(`horizonBottomCm.${i}`)),
      designation: vacioANull(formData.get(`horizonDesignation.${i}`)),
      colour: vacioANull(formData.get(`horizonColour.${i}`)),
      structure: vacioANull(formData.get(`horizonStructure.${i}`)),
      textureByFeel: vacioANull(formData.get(`horizonTexture.${i}`)),
      notes: vacioANull(formData.get(`horizonNotes.${i}`)),
    };
    const vacia = Object.values(campos).every((v) => v == null);
    if (vacia) continue;
    filas.push({ ordinal: filas.length + 1, ...campos });
  }
  return filas;
}
