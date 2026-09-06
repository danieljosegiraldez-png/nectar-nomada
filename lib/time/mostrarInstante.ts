/**
 * Mostrar un instante guardado, en la zona donde ocurrió.
 *
 * **La otra mitad del fallo de husos horarios.** `localDateTime.ts` arregló el
 * lado de la escritura: lo que un operador teclea se guarda como el instante
 * correcto. Su cabecera cuenta que antes se vio el síntoma «escribí 07:30 y la
 * pantalla dice 12:30» y se diagnosticó como convención de mostrar en UTC, y que
 * no lo era. Era cierto — pero sólo de esa mitad.
 *
 * Medido el 2026-09-05 recorriendo la aplicación en un móvil, con sesión y datos
 * reales: se abre una jornada a las 07:30 y el título dice **12:30**; se anota un
 * evento a las 11:31 y la lista dice **16:31**. Comprobado contra la base, que es
 * lo que `CLAUDE.md` manda: el instante guardado es CORRECTO —
 * `2026-09-05 16:31 UTC` = `11:31` en Panamá—. Lo que estaba mal era la pantalla.
 *
 * La causa es una línea repetida por toda la aplicación:
 *
 *     d.toISOString().slice(0, 16).replace("T", " ")
 *
 * `toISOString()` siempre devuelve UTC. En el campo son cinco horas: un operario
 * lee una hora que no es la que vivió y cree que se equivocó al teclear.
 *
 * **En qué zona se muestra, y por qué no es la del navegador.** Un registro de
 * trazabilidad dice cuándo pasó algo *en la finca*. Una cosecha a las 07:30
 * ocurrió a las 07:30 allí, la lea quien la lea y desde donde la lea; mostrarla
 * en la hora de quien mira convertiría el mismo hecho en horas distintas según el
 * lector. Por eso se muestra en la zona del sitio, no en la del dispositivo.
 *
 * **El límite de hoy, dicho para que nadie lo descubra tarde.** `Location` YA
 * tiene columna `timezone` —el esquema lo previó y la especificación lo lista—
 * pero está en NULL en las 26 Locations de la base. Hasta que se rellene, esto
 * cae en `ZONA_POR_DEFECTO`. Rellenarla es una tarea de datos, no de código, y
 * cada sitio debería llevar la suya.
 */

/**
 * A dónde cae un instante cuando el sitio no declara su zona.
 *
 * No es una elección estética: Finca Rosina y Cerro Azul están en Panamá, y es
 * la zona que `CLAUDE.md` usa como referencia para comprobar estos fallos
 * (`at time zone 'UTC' at time zone 'America/Panama'`). **Es un respaldo, no una
 * decisión de producto:** en cuanto `Location.timezone` tenga datos, manda ella.
 */
export const ZONA_POR_DEFECTO = "America/Panama";

/**
 * `2026-09-05 11:31` — fecha y hora, sin segundos, en la zona indicada.
 *
 * Se mantiene el mismo formato que producía `toISOString().slice(0,16)` para que
 * el cambio sea de zona y no de aspecto: lo único que se mueve son los dígitos.
 */
/**
 * Sólo la fecha de un INSTANTE, en la zona donde ocurrió.
 *
 * **Cuándo NO usar esto, que es lo que más cuesta acertar.** Hay dos clases de
 * fecha en este esquema y se parecen en la pantalla:
 *
 * - **Campos de día** — `sampledAt`, `describedAt`, `plantedAt`. Vienen de un
 *   `<input type="date">` y se guardan como **medianoche UTC** (`fechaDeDia` en
 *   `app/actions/traceability.ts`). Su ida y vuelta cierra con
 *   `toISOString().slice(0, 10)`, y convertirlos a la zona del sitio los movería
 *   **un día hacia atrás**: sería introducir el fallo, no arreglarlo.
 * - **Instantes** — `occurredAt` de una medición, `startedAt` de una jornada.
 *   Vienen de un `datetime-local` con desfase y guardan un momento real. Su
 *   fecha en UTC puede ser la del día siguiente: una medición de las 19:00 en
 *   Panamá son las 00:00 UTC del día de después.
 *
 * Esto es para los segundos. Comprobado campo por campo el 2026-09-05: de los
 * ocho `toISOString()` de `app/plots/[id]/page.tsx`, seis eran de día o
 * serialización y sólo dos eran instantes.
 */
export function mostrarFecha(cuando: Date, zona: string | null | undefined): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona ?? ZONA_POR_DEFECTO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(cuando);
}

export function mostrarInstante(cuando: Date, zona: string | null | undefined): string {
  const z = zona ?? ZONA_POR_DEFECTO;
  // `en-CA` da `AAAA-MM-DD`, que es el orden que ya tenían estas pantallas.
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: z,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(cuando);
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: z,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(cuando);
  return `${fecha} ${hora}`;
}
