/**
 * **La ficha del lote pone el trabajo primero y pliega lo que se consulta.**
 *
 * Medido en vivo el 2026-10-04, a 375×812, con una cuenta de Farm Operator (no de Platform Admin:
 * un admin ve «todo» y no mide lo que ve un operario) sobre el lote PE-98-C, que el propio panel
 * del operario marcaba como «fermentando» y «necesita una medición»:
 *
 * | | antes |
 * |---|---|
 * | alto total | 3.767 px, 4,6 pantallas |
 * | primer campo en el que se puede escribir | **1.203 px** |
 * | «Procesamiento» | 1.019 px |
 * | «Mediciones» —lo que ese lote necesitaba— | **2.796 px, 3,4 pantallas** |
 *
 * ADR-096 ya había decidido que «recording what happened to the batch comes first»; la página se
 * fue llenando por encima de esa decisión. Esto no la cambia: la aplica.
 *
 * **Lo que este archivo NO caza**, dicho antes de que alguien cuente con él: es un guardia de
 * FUENTE. No prueba que la página se vea bien ni que los píxeles bajen; prueba que nadie devuelva
 * el orden ni quite los plegados sin que caiga algo. La medición en vivo va en el mensaje del
 * commit, que es donde esta casa la guarda.
 *
 * Hermética: sólo lee archivos, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ficha = readFileSync("app/lots/[id]/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

/** Dónde aparece el `<h2>` de una sección. -1 si no está. */
const donde = (clave: string) => ficha.indexOf(`<h2>{t("${clave}")}</h2>`);

/** Las nueve que se pliegan: todas de sólo lectura, ninguna con formulario dentro. */
const PLEGADAS = [
  "originLotHeading",
  "origenRecepcionesHeading",
  "lineageHeading",
  "selectionOutturnHeading",
  "timelineHeading",
  "sensoryHeading",
  "photosHeading",
  "tasksHeading",
  "historyHeading",
] as const;

/** Las que llevan trabajo y por eso suben, abiertas. */
const TRABAJO = ["processingHeading", "measurementsHeading", "selectionHeading"] as const;
// Selección entró en el grupo en la segunda vuelta, y la cazó la pantalla: al subir proceso y
// mediciones se quedó DEBAJO —4.211 px en el lote PE-78-B, medido a 375 px—, cuando lleva un
// formulario y es trabajo de una cereza. Un reordenamiento parcial empuja hacia abajo lo que no
// mueve; eso no se ve leyendo el diff.

describe("la ficha del lote: el trabajo primero", () => {
  /**
   * **La fila patrón, y va primero.** Si el patrón de los `<h2>` deja de casar —un formato
   * distinto, un renombrado— todos los `indexOf` de abajo dan -1, las comparaciones de orden se
   * vuelven comparaciones entre -1 y -1, y todo pasa sobre nada.
   */
  it("FILA PATRÓN: la página tiene sus 18 secciones y los `<h2>` se encuentran", () => {
    expect((ficha.match(/<section className="nn-section"/g) ?? []).length).toBe(18);
    expect((ficha.match(/<h2/g) ?? []).length).toBe(18);
    const noEncontradas = [...PLEGADAS, ...TRABAJO].filter((k) => donde(k) < 0);
    expect(noEncontradas, "los h2 que el patrón no encuentra").toEqual([]);
  });

  it("el trabajo va por encima de todo lo que se consulta", () => {
    const masAbajo = PLEGADAS.filter((consulta) => TRABAJO.some((t) => donde(t) > donde(consulta)));
    // Las tres de arriba de la página —clasificación verde, perfil de tueste, miel— no están en
    // PLEGADAS a propósito, así que esto no las juzga; lo que exige es que ninguna de las nueve
    // de consulta quede por encima del trabajo.
    expect(masAbajo, `comparadas ${PLEGADAS.length} secciones de consulta contra ${TRABAJO.length} de trabajo`).toEqual([]);
  });

  it("y por debajo de las acciones del lote, que es lo que ADR-096 decidió", () => {
    const acciones = ficha.indexOf("batchActions.map");
    expect(acciones, "el grupo de acciones tiene que estar").toBeGreaterThan(0);
    for (const t of TRABAJO) expect(donde(t), `${t} va después de las acciones`).toBeGreaterThan(acciones);
  });

  it("las nueve de consulta están dentro de un `<details>` cuyo `<summary>` lleva su `<h2>`", () => {
    const sinPlegar = PLEGADAS.filter((k) => {
      const i = donde(k);
      // El `<summary>` abre como mucho dos líneas antes del h2, y el `<details>` justo encima.
      const antes = ficha.slice(Math.max(0, i - 160), i);
      return !(antes.includes("<details>") && antes.includes("<summary>"));
    });
    expect(sinPlegar, `miradas ${PLEGADAS.length} secciones`).toEqual([]);
  });

  it("y las dos de trabajo NO están plegadas", () => {
    const plegadasPorError = TRABAJO.filter((k) => ficha.slice(Math.max(0, donde(k) - 160), donde(k)).includes("<summary>"));
    expect(plegadasPorError).toEqual([]);
  });

  /**
   * **El guardia que vale más de este archivo, y no salió de una lectura: lo midió una revisión
   * independiente en Chrome 152, el motor del panel.** Next 16 no usa la navegación nativa de
   * fragmento: `layout-router` hace `document.getElementById(x)` y `scrollIntoView()`. Un destino
   * dentro de un `<details>` CERRADO no lo abre y no hace scroll — el botón no hace nada visible,
   * sin error en consola. Así que ninguna sección que sea destino de un `href="#…"` puede plegarse.
   *
   * Hoy los destinos son `#measurements`, `#seleccion`, `#procesar-miel`, `#envasar-miel` y
   * `#dividir-miel`, y ninguno está entre las nueve. Esto lo mantiene así.
   */
  it("CONTROL: ninguna sección con ancla enlazada queda dentro de un `<details>`", () => {
    // Las dos formas: el atributo JSX `href="#x"` y la propiedad `href: "#x"` de `batchActions`,
    // que es la que esta pagina usa de verdad. Con solo la primera, el patron daba CERO y el
    // guardia no medi­a nada: lo cazó su propia fila patrón.
    const anclas = [...ficha.matchAll(/href[:=] *"#([\w-]+)"/g)].map((m) => m[1]!);
    expect(anclas.length, "la página tiene que enlazar alguna ancla; si no, esto no mide nada").toBeGreaterThan(0);
    const rotas = anclas.filter((ancla) => {
      const i = ficha.indexOf(`id="${ancla}"`);
      if (i < 0) return false; // el id vive en otra página: no es cosa de este guardia
      // **Dónde mirar, y la primera versión miraba mal.** El `id` va en la `<section>` y el
      // `<details>` DENTRO de ella, así que buscar un `<details>` abierto ANTES del id no
      // encuentra nada: lo midió el flip-test, envolviendo Mediciones en un `<details>` y viendo
      // que esta aserción seguía verde. Lo que delata el plegado es que entre el `id` y el
      // siguiente `<h2>` aparezca un `<details>`, que es exactamente la forma que tiene plegar
      // una sección: `<details><summary><h2>`.
      const tramo = ficha.slice(i, ficha.indexOf("<h2", i));
      return tramo.includes("<details>");
    });
    expect(rotas, `miradas ${anclas.length} anclas`).toEqual([]);
  });

  /**
   * Plegar sin pista es esconder. Cada rótulo plegado lleva su cifra, **y desde el 2026-10-05 no
   * hay excepción**.
   *
   * **Esta aserción decía `toEqual(["historyHeading"])` y exigía además el comentario «Sin cifra, a
   * propósito».** La excepción existía porque la cifra del historial habría sido falsa:
   * `getLotDetail` buscaba la auditoría por `entityId = lotId` y las escrituras guardan el id del
   * propio evento, así que el panel podía encontrar **0** de 1.792 filas. Arreglada la lectura, la
   * cifra es verdadera y la excepción sobra.
   *
   * **Y la lista vacía aquí no es un guardia más flojo, es más estricto:** antes toleraba una
   * sección sin cifra, y lo que toleraba era justo donde estaba el defecto. Una excepción nombrada
   * en un guardia es una deuda con fecha de caducidad; al cerrarse el defecto se cierra la
   * excepción, o el guardia protege un agujero que ya no existe y deja entrar el siguiente.
   */
  it("cada rótulo plegado lleva su cifra, sin excepciones", () => {
    const sinCifra = PLEGADAS.filter((k) => {
      const i = donde(k);
      const resumen = ficha.slice(i, ficha.indexOf("</summary>", i));
      return !resumen.includes("nn-resumen-cifra");
    });
    expect(sinCifra, "toda sección plegada lleva su cifra en el rótulo").toEqual([]);
  });

  it("el CSS que hace falta para que el `<h2>` quepa en el `<summary>` está escrito", () => {
    expect(css).toContain(".nn-section > details > summary > h2 { display: inline;");
    expect(css).toContain(".nn-resumen-cifra");
    // El alto táctil, el mismo que usa `.nn-disclosure > summary`: un rótulo que se toca con
    // guantes no puede medir 16 px.
    expect(css).toMatch(/\.nn-section > details > summary \{[^}]*min-height: var\(--nn-tap\)/);
  });
});

describe("las cifras de los rótulos usan plural ICU, en los dos idiomas", () => {
  /**
   * Las claves con plural. `resumenTope` no es plural: no cuenta, dice «N o más».
   * `resumenHistorial` entró el 2026-10-05, al dejar de ser falsa la cifra del historial.
   */
  const CON_PLURAL = ["resumenRecepciones", "resumenCuajado", "resumenCronologia", "resumenSensorial", "resumenFotos", "resumenTareas", "resumenHistorial"] as const;

  const leer = (idioma: "es" | "en") =>
    JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8")).Traceability as Record<string, string>;

  /**
   * `resumenGenealogia` va aparte porque lleva DOS plurales en un mensaje —ancestros y derivados—
   * en vez de un `count`. Nació de un defecto visto en pantalla: el rótulo decía «1 lote(s) de
   * origen · 0 lote(s) derivados», porque reusaba dos claves viejas con el parche `(s)` que el
   * plural ICU existe justo para evitar.
   */
  it("resumenGenealogia resuelve sus DOS plurales y discrimina", async () => {
    const { IntlMessageFormat } = await import("intl-messageformat");
    for (const idioma of ["es", "en"] as const) {
      const m = leer(idioma).resumenGenealogia!;
      expect(m, `${idioma}: la clave tiene que existir`).toBeTruthy();
      const f = (ancestros: number, derivados: number) => String(new IntlMessageFormat(m, idioma).format({ ancestros, derivados }));
      expect(f(1, 0)).not.toBe(f(2, 0));
      expect(f(0, 1)).not.toBe(f(0, 2));
      // Y el cero no dice «0 algo»: dice que no hay.
      expect(f(0, 0), `${idioma}: el cero no se escribe como cifra`).not.toContain("0");
      // El parche que esto viene a quitar.
      expect(f(1, 1), `${idioma}: nada de «(s)»`).not.toContain("(s)");
    }
  });

  it("existen en los dos idiomas y ninguna está vacía", () => {
    for (const idioma of ["es", "en"] as const) {
      const m = leer(idioma);
      const faltan = [...CON_PLURAL, "resumenTope"].filter((k) => (m[k] ?? "").trim() === "");
      expect(faltan, `${idioma}.json`).toEqual([]);
    }
  });

  it("y el plural DISCRIMINA de verdad: uno y dos dan textos distintos", async () => {
    const { IntlMessageFormat } = await import("intl-messageformat");
    for (const idioma of ["es", "en"] as const) {
      const m = leer(idioma);
      for (const k of CON_PLURAL) {
        const uno = String(new IntlMessageFormat(m[k]!, idioma).format({ count: 1 }));
        const dos = String(new IntlMessageFormat(m[k]!, idioma).format({ count: 2 }));
        expect(uno, `${idioma}/${k} con 1`).toContain("1");
        expect(dos, `${idioma}/${k} con 2`).toContain("2");
        // Lo que un `{count} cosas` a secas NO cumple: el sustantivo cambia.
        expect(uno.replace("1", ""), `${idioma}/${k}: el singular y el plural tienen que diferir en algo más que la cifra`).not.toBe(dos.replace("2", ""));
      }
      // Control de que el formateador mide: una clave SIN plural da lo mismo quitando la cifra.
      const tope = m.resumenTope!;
      const a = String(new IntlMessageFormat(tope, idioma).format({ count: 1 })).replace("1", "");
      const b = String(new IntlMessageFormat(tope, idioma).format({ count: 2 })).replace("2", "");
      expect(a, `${idioma}/resumenTope es el control: no lleva plural`).toBe(b);
    }
  });
});

/**
 * **La ficha no revienta para un operario sin permiso sobre el bloque de la cosecha.**
 *
 * Encontrado el 2026-10-04 recorriendo la pantalla con una cuenta de Farm Operator acotada a un
 * proyecto (sin ámbito de ubicación), que es una configuración legítima: el lote PE-78-B devolvía
 * `Error: no_location_attribute_access` y la ficha ENTERA caía con un 500.
 *
 * La causa no es el permiso. `getHarvestSourceContext` exige `location:manage_attributes` sobre el
 * bloque, y lo exige a propósito —una revisión independiente midió que la lectura filtraba el
 * nombre, el cultivar, el peso y las notas de bloques ajenos—. Lo que faltaba era la red en el sitio
 * de la llamada. Y el predicado que no lanza ya existía, y la propia página ya lo usaba… DESPUÉS de
 * esa línea, para decidir si pintaba el formulario de atribución.
 *
 * Es la clase que `CLAUDE.md` nombra para las acciones —«una clase de validación nueva que llegue a
 * una acción es un 500»— en una página.
 */
describe("la ficha no llama a un lector que lanza sin preguntar primero", () => {
  it("`getHarvestSourceContext` sólo se llama si `puedeEditarFuentes`", () => {
    const i = ficha.indexOf("getHarvestSourceContext(user.userAccountId");
    expect(i, "la llamada tiene que estar; si no, este guardia no mide nada").toBeGreaterThan(0);
    // **La guarda tiene que estar en LA CONDICIÓN, no cerca.** La primera versión miraba los 220
    // caracteres anteriores y pasaba igual con la guarda quitada: la declaración del predicado
    // seguía ahí arriba, así que comprobaba el token y no la conducta. Lo midió el flip-test.
    // Esto lee la condición del ternario que decide si se llama.
    const decl = ficha.indexOf("const harvestSources");
    expect(decl, "la declaración tiene que estar").toBeGreaterThan(0);
    expect(decl, "y venir antes de la llamada").toBeLessThan(i);
    const condicion = ficha.slice(decl, i);
    expect(condicion, "la llamada va condicionada al predicado, no sólo precedida por él").toContain("puedeEditarFuentes");
  });

  it("CONTROL: el predicado se calcula ANTES de la llamada, y sólo una vez", () => {
    const iPredicado = ficha.indexOf("const puedeEditarFuentes");
    const iLlamada = ficha.indexOf("getHarvestSourceContext(user.userAccountId");
    expect(iPredicado, "el predicado tiene que existir").toBeGreaterThan(0);
    expect(iPredicado, "y calcularse antes de la llamada").toBeLessThan(iLlamada);
    // Una sola declaración: la segunda, más abajo, era la que llegaba tarde.
    expect((ficha.match(/const puedeEditarFuentes/g) ?? []).length).toBe(1);
  });
});
