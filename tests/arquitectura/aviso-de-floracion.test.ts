import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **El aviso de floración: que exista, que no mienta, y que no bloquee.**
 *
 * Decisión de Daniel, 2026-10-01: «construye el aviso de floración, pero eso no debe afectar las
 * abejas, no es químico» — o sea que el aviso depende del PRODUCTO, no de la floración sola. Un
 * manejo cultural en plena floración no avisa de nada; un insecticida que declara dañar
 * polinizadores, sí.
 *
 * Esto lee la fuente, así que vale la regla de la casa (2026-09-29, el guardia del `?ok=`): **la
 * mutación de un flip tiene que quitar LA CONDUCTA, no el token con el que casa el detector.** Por
 * eso cada aserción de aquí apunta a algo que un operario notaría: la condición que decide, el
 * párrafo que PINTA, el cálculo que lo alimenta, y el dato que llega de cada pantalla.
 *
 * Y vale la otra (2026-09-30, el guardia que vigilaba UN archivo): **un guardia de clase descubre
 * sus archivos, no los enumera.** La lista de pantallas que montan el formulario se calcula, con su
 * control positivo, para que la que alguien añada mañana entre sola.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;
const LINEA = `${RAIZ}app/components/traceability/LineaDeIntervencion.tsx`;
const FORM = `${RAIZ}app/components/traceability/IntervencionForm.tsx`;
const SERVICIO = `${RAIZ}lib/traceability/intervenciones.ts`;
const PURO = `${RAIZ}lib/traceability/floracionVigente.ts`;
const fuente = (p: string) => readFileSync(p, "utf8");

/** Los `.tsx` de `app/` que montan EL formulario de manejo — no el homónimo de `ProcesoDelLote`. */
function pantallasQueMontanElFormulario(): string[] {
  const encontradas: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      const ruta = `${dir}/${entrada}`;
      if (statSync(ruta).isDirectory()) {
        if (entrada !== "node_modules" && entrada !== ".next") recorrer(ruta);
        continue;
      }
      if (!entrada.endsWith(".tsx")) continue;
      const src = readFileSync(ruta, "utf8");
      // Las DOS condiciones: importa de este módulo Y lo monta. `app/lots/[id]/process/page.tsx`
      // monta un `IntervencionForm` distinto —el de `ProcesoDelLote`, con `lotProcessId`— y
      // exigirle `ventanasDeFloracion` sería marcar como incumplidor código correcto, que esta
      // casa considera peor que no tener guardia.
      if (/from\s+"[^"]*components\/traceability\/IntervencionForm"/.test(src) && /<IntervencionForm\b/.test(src)) {
        encontradas.push(ruta.slice(RAIZ.length));
      }
    }
  };
  recorrer(`${RAIZ}app`);
  return encontradas.sort();
}

describe("el escáner de pantallas mira donde debe", () => {
  /**
   * **Control positivo del ANÁLISIS, no del código.** Si el patrón deja de casar, la lista sale
   * vacía y «ninguna pantalla incumple» se lee igual que «no miré». Hoy son dos; el día que sean
   * tres, esta cifra sube y el guardia de abajo cubre la nueva sin tocar nada.
   */
  it("encuentra al menos dos pantallas", () => {
    const pantallas = pantallasQueMontanElFormulario();
    expect(pantallas.length, `pantallas encontradas: ${JSON.stringify(pantallas)}`).toBeGreaterThanOrEqual(2);
  });

  it("y NO arrastra el IntervencionForm homónimo del proceso del lote", () => {
    expect(pantallasQueMontanElFormulario()).not.toContain("app/lots/[id]/process/page.tsx");
  });
});

describe("el aviso de floración", () => {
  it("sólo avisa si el producto lo DECLARA: nulo es «nadie lo dijo», no «no daña»", () => {
    // `=== true` y no un truthy: con `null` no se avisa. Avisar ahí pondría el aviso en todos los
    // productos hasta que alguien rellene el catálogo, que es cómo se enseña a ignorar un aviso.
    expect(fuente(LINEA)).toMatch(/harmfulToPollinators === true/);
  });

  it("y sólo si hay floración que aplique: las dos condiciones, no una", () => {
    expect(fuente(LINEA)).toMatch(/harmfulToPollinators === true && enFloracion === true/);
  });

  /**
   * **La aserción que un flip tiene que poder tumbar quitando la CONDUCTA.** No basta con que el
   * nombre de la clave aparezca en el archivo: tiene que existir la rama que PINTA el párrafo. Es
   * exactamente lo que le faltaba al guardia del `?ok=`, donde desestructurar el valor sin pintarlo
   * dejaba la confirmación igual de invisible.
   */
  it("y lo PINTA: hay una rama JSX que renderiza el párrafo", () => {
    const src = fuente(LINEA);
    const i = src.indexOf("dañaEnFloracion ?");
    expect(i, "no existe la rama que pinta el aviso").toBeGreaterThan(-1);
    const bloque = src.slice(i, i + 300);
    expect(bloque).toMatch(/<p /);
    expect(bloque).toMatch(/manejoAvisoFloracion/);
  });

  /**
   * **La propiedad de §32, y la aserción que sí la mide.** La primera versión leía 300 caracteres
   * desde `dañaEnFloracion ?` — una ventana que, impresa, va del `<p>` al campo de dosis y **no
   * puede contener ningún botón de envío**, porque el botón vive en `IntervencionForm`. O sea que
   * afirmaba «no bloquea» mirando donde un bloqueo no cabe. Lo demostró una revisión con flip-test.
   *
   * Lo que sí lo mide: que la bandera **no se use para nada más que pintar**. Dos apariciones en
   * todo el archivo —su declaración y la condición del párrafo— y ninguna dentro de un `disabled`,
   * un `required` o un `return` temprano. Si alguien la usa para gatear algo, el recuento sube.
   */
  it("no bloquea el envío: la bandera sólo PINTA, y no gatea nada", () => {
    const src = fuente(LINEA);
    const usos = src.split("dañaEnFloracion").length - 1;
    expect(usos, "la bandera se usa en más sitios que su declaración y el párrafo").toBe(2);
    const i = src.indexOf("dañaEnFloracion ?");
    const bloque = src.slice(i, i + 300);
    expect(bloque, "el aviso no es un párrafo").toMatch(/<p /);
    expect(bloque).not.toMatch(/disabled|required/);
    // Y en el formulario entero, nadie gatea el envío con la floración.
    const form = fuente(FORM);
    expect(form, "el formulario usa enFloracion para bloquear").not.toMatch(/(disabled|required)=\{[^}]*enFloracion/);
  });

  it("tiene texto en los dos idiomas", () => {
    for (const idioma of ["es", "en"]) {
      const j = JSON.parse(fuente(`${RAIZ}messages/${idioma}.json`));
      const texto = j.Traceability?.manejoAvisoFloracion;
      expect(texto, `falta manejoAvisoFloracion en ${idioma}.json`).toBeTruthy();
      expect(texto, `el texto de ${idioma} no nombra el producto`).toContain("{producto}");
    }
  });
});

describe("lo que alimenta el aviso", () => {
  it("el servicio lleva el campo del catálogo hasta la pantalla: tipo, consulta y mapeo", () => {
    const src = fuente(SERVICIO);
    // **Las tres por su FORMA, no contando apariciones.** Una revisión demostró el agujero: cambiar
    // `harmfulToPollinators: m.harmfulToPollinators` por `harmfulToPollinators: null` deja el aviso
    // muerto para todo producto y el recuento sigue siendo 3. Es la misma lección del `?ok=`:
    // nombrar un dato no es llevarlo.
    expect(src, "el tipo no declara el campo").toMatch(/readonly harmfulToPollinators: boolean \| null;/);
    expect(src, "la consulta no lo pide").toMatch(/harmfulToPollinators: true,/);
    expect(src, "el mapeo no COPIA el valor del catálogo").toMatch(/harmfulToPollinators: m\.harmfulToPollinators,/);
  });

  it("el formulario DECIDE con el módulo puro, en vez de recibir la respuesta hecha", () => {
    const src = fuente(FORM);
    // **Anclado a la ASIGNACIÓN, no a la aparición del nombre.** Una revisión adversaria puso
    // `const enFloracion = false && (() => {…})()`: el aviso no salía nunca, `hayFloracion(` seguía
    // en el archivo, y este guardia pasaba verde 12/12. Exigir que el valor venga directamente de la
    // llamada cierra eso — es la misma lección del `?ok=`: extraer o nombrar un dato no es usarlo.
    expect(src, "enFloracion no sale directamente de hayFloracion").toMatch(/const enFloracion = hayFloracion\(/);
    expect(src, "la bandera no llega a la línea").toMatch(/enFloracion=\{enFloracion\}/);
  });

  /**
   * **La fecha y los bloques se OBSERVAN.** Son inputs no controlados a propósito (hallazgo 1 del
   * desfase horario), así que sin estos `onChange` el aviso se congela en el valor del primer
   * render y se equivoca en cuanto el operario corrige la fecha o marca un bloque.
   */
  it("observa la fecha y los bloques elegidos, o el aviso se congela", () => {
    const src = fuente(FORM);
    // **Lo encontró el flip-test, no una lectura.** La primera versión de esta prueba buscaba
    // `setCuandoElegido` en el archivo entero — y ese nombre sigue ahí por el `useState` aunque se
    // quite el `onChange`. O sea que casaba el TOKEN y no la conducta: quitando la observación de la
    // fecha, el aviso se congela en el primer render y el guardia seguía en verde 12/12. Ahora se
    // exige la llamada DENTRO del bloque JSX de cada input, que es lo que un operario notaría.
    const bloqueDe = (marca: string) => {
      const i = src.indexOf(marca);
      expect(i, `no existe el input ${marca}`).toBeGreaterThan(-1);
      const fin = src.indexOf("/>", i);
      expect(fin, `el input ${marca} no cierra`).toBeGreaterThan(i);
      return src.slice(i, fin);
    };
    const fecha = bloqueDe('id="manejo-occurred-at"');
    expect(fecha, "el campo de fecha no observa su cambio").toMatch(/onChange/);
    expect(fecha, "el onChange de la fecha no guarda el valor elegido").toMatch(/setCuandoElegido/);

    const bloques = bloqueDe('name="plotBlockIds"');
    expect(bloques, "la casilla de bloque no observa su cambio").toMatch(/onChange/);
    expect(bloques, "el onChange del bloque no guarda los elegidos").toMatch(/setBloquesElegidos/);
  });

  it("cada pantalla que monta el formulario le pasa las ventanas", () => {
    for (const pantalla of pantallasQueMontanElFormulario()) {
      const src = fuente(`${RAIZ}${pantalla}`);
      expect(src, `${pantalla} monta el formulario sin pasarle ventanasDeFloracion`).toMatch(/ventanasDeFloracion=/);
      expect(src, `${pantalla} no lee las floraciones de la parcela`).toMatch(/floracionesDeLaParcela\(/);
    }
  });

  /**
   * La contención de §D1 del diseño de la rejilla: tratar la parcela entera entra todo lo de
   * dentro. Sin el `length > 0`, una floración de bloque dejaría de avisar justo cuando se asperja
   * toda la parcela — que es el caso más grave, no el menos.
   */
  it("el módulo puro respeta la contención: sin bloques elegidos, la ventana de bloque aplica", () => {
    expect(fuente(PURO)).toMatch(/bloquesElegidos\.length > 0/);
  });
});
