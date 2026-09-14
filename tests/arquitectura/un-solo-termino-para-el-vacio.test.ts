/**
 * El guardia del §6 del Anexo E: **el vacío no se ofrece como opción**.
 *
 * Lo que vigila, sobre los archivos del módulo apícola:
 *
 * 1. ninguna `<option value="">` lleva texto, salvo las tres declaradas en
 *    `CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO` — donde las palabras **son** la respuesta;
 * 2. ninguna etiqueta de opción dice «elegir», «elige» ni «seleccionar»;
 * 3. `sinRegistrar` no se usa nunca como etiqueta de opción: es un estado que se LEE.
 *
 * **Acotado al módulo apícola a propósito, y el número es la razón.** Medido el
 * 2026-09-13, la app entera tiene **89** opciones vacías con **34** grafías
 * distintas, repartidas por sensorial, investigación, café y admin. Un guardia sobre
 * las 89 no podría pasar hoy, y `~/.claude/CLAUDE.md` lo dice con nombre: *«Un
 * guardia que nunca puede pasar es peor que ninguno: enseña a ignorar una línea
 * roja.»* El resto queda inventariado en ADR-125, no vigilado.
 *
 * **El control que lo hace un guardia y no un adorno** es el último `it`: el mismo
 * detector, contra fuentes sintéticas que SÍ violan la regla, tiene que señalarlas.
 * Sin él, un cambio de formato en los `<option>` lo deja midiendo cero y pasando.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLAVE_DEL_VACIO,
  CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO,
  esRespuestaQueValeNinguno,
} from "../../lib/apiary/vacio";

const RAICES = ["app/components/apiary", "app/apiaries"];

function archivosTsx(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosTsx(ruta));
    else if (ruta.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

export interface OpcionVacia {
  archivo: string;
  /** El texto entre las etiquetas, ya recortado. Vacío para una opción sin texto. */
  etiqueta: string;
  /** La clave de i18n si la etiqueta es exactamente `{t("clave")}`; si no, `null`. */
  clave: string | null;
}

/**
 * Saca las opciones vacías de una fuente. Atiende las dos formas —con cierre y
 * autocerrada— porque si sólo atendiera una, convertir las malas a la otra forma
 * dejaría el guardia en cero.
 */
export function opcionesVaciasDe(archivo: string, fuente: string): OpcionVacia[] {
  const salida: OpcionVacia[] = [];
  // El `(?<!\/)` no es adorno: sin él, este patrón se come la forma AUTOCERRADA
  // —`<option value="" />`— tomando ` /` por atributo y todo lo que sigue hasta el
  // siguiente `</option>` por su etiqueta. Medido el 2026-09-13: con la regla ya
  // arreglada en las fuentes, reportaba **18 violaciones inexistentes**, cada una
  // con el `<option>` del hermano dentro. Falló en rojo y no en verde, que es la
  // única razón por la que se vio.
  const conCierre = /<option\s+value=""([^>]*?)(?<!\/)>([\s\S]*?)<\/option>/g;
  const autocerrada = /<option\s+value=""([^>]*?)\/>/g;
  for (const m of fuente.matchAll(conCierre)) {
    const etiqueta = m[2]!.trim();
    const km = /^\{\s*t\w*\("(\w+)"\)\s*\}$/.exec(etiqueta);
    salida.push({ archivo, etiqueta, clave: km ? km[1]! : null });
  }
  for (const m of fuente.matchAll(autocerrada)) {
    salida.push({ archivo, etiqueta: "", clave: null });
  }
  return salida;
}

function todasLasOpciones(): OpcionVacia[] {
  return RAICES.flatMap((raiz) =>
    archivosTsx(raiz).flatMap((f) => opcionesVaciasDe(f, readFileSync(f, "utf8"))),
  );
}

describe("un solo término para el vacío, en el módulo apícola", () => {
  const opciones = todasLasOpciones();

  it("el detector mira donde debe — control positivo antes de cualquier veredicto", () => {
    // Si esto baja, el detector se quedó ciego y los demás `it` pasan sin medir nada.
    expect(opciones.length).toBeGreaterThanOrEqual(20);
    // Y hay al menos un archivo de cada raíz, no todas de una.
    const raices = new Set(opciones.map((o) => (o.archivo.startsWith("app/apiaries") ? "paginas" : "componentes")));
    expect([...raices].sort()).toEqual(["componentes", "paginas"]);
  });

  it("ninguna opción vacía lleva texto, salvo las declaradas como respuesta", () => {
    const conTexto = opciones.filter((o) => o.etiqueta !== "");
    const indebidas = conTexto.filter((o) => o.clave === null || !esRespuestaQueValeNinguno(o.clave));
    expect(
      indebidas.map((o) => `${o.archivo}: ${o.etiqueta}`),
      "una opción vacía con texto que no está declarada como respuesta: o va sin texto, o se declara en CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO",
    ).toEqual([]);
  });

  it("las tres declaradas siguen ahí — si se borran, la lista miente", () => {
    const usadas = new Set(opciones.map((o) => o.clave).filter((c): c is string => c !== null));
    for (const clave of CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO) {
      expect(usadas, `${clave} está declarada y no se usa`).toContain(clave);
    }
  });

  it("«Sin registrar» no se usa como etiqueta de opción: es un estado que se lee", () => {
    expect(opciones.filter((o) => o.clave === CLAVE_DEL_VACIO).map((o) => o.archivo)).toEqual([]);
  });

  it("ningún texto de apiario dice «elegir», «elige» ni «seleccionar»", () => {
    const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, Record<string, string>>;
    const apiario = es.Apiary ?? {};
    const culpables = Object.entries(apiario).filter(
      ([clave, valor]) =>
        // Sólo etiquetas cortas: un texto de ayuda puede decir «elegirlo sólo si…» y
        // eso es prosa correcta, no un placeholder disfrazado.
        typeof valor === "string" &&
        valor.length <= 30 &&
        /elegir|elige|seleccionar|seleccione/i.test(valor) &&
        !clave.endsWith("Help") &&
        !clave.endsWith("Ayuda"),
    );
    expect(culpables.map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });

  it("CONTROL DEL DETECTOR: sobre fuentes que sí violan la regla, las señala", () => {
    // Las tres formas que el guardia tiene que cazar, cada una por su lado.
    const conTermino = opcionesVaciasDe("x.tsx", '<option value="">{t("sinRegistrar")}</option>');
    expect(conTermino).toHaveLength(1);
    expect(conTermino[0]!.clave).toBe("sinRegistrar");

    const conPlaceholder = opcionesVaciasDe("x.tsx", '<option value="" disabled>{t("apiaryChoose")}</option>');
    expect(conPlaceholder[0]!.clave).toBe("apiaryChoose");
    expect(esRespuestaQueValeNinguno(conPlaceholder[0]!.clave!)).toBe(false);

    const textoSuelto = opcionesVaciasDe("x.tsx", '<option value="">— elegir —</option>');
    expect(textoSuelto[0]!.etiqueta).toBe("— elegir —");
    expect(textoSuelto[0]!.clave).toBeNull();

    // Y la forma autocerrada, que es la BUENA: se detecta y sale sin texto.
    const buena = opcionesVaciasDe("x.tsx", '<option value="" />');
    expect(buena).toHaveLength(1);
    expect(buena[0]!.etiqueta).toBe("");

    // Control negativo del detector: una opción con valor NO es una opción vacía.
    expect(opcionesVaciasDe("x.tsx", '<option value="yes">Sí</option>')).toEqual([]);

    // Y EL CASO QUE ME COSTÓ 18 FALSOS POSITIVOS: una autocerrada seguida de una
    // opción de verdad. El patrón con cierre no debe tragarse la segunda como
    // etiqueta de la primera. Son DOS cosas: una vacía sin texto, y una con valor.
    const mezcla = opcionesVaciasDe(
      "x.tsx",
      '<option value="" />\n<option value="si">{t("triSi")}</option>',
    );
    expect(mezcla).toHaveLength(1);
    expect(mezcla[0]!.etiqueta).toBe("");

    // Lo mismo con `disabled`, que es la otra forma buena.
    const deshabilitada = opcionesVaciasDe(
      "x.tsx",
      '<option value="" disabled />\n<option value="a">{t("x")}</option>',
    );
    expect(deshabilitada).toHaveLength(1);
    expect(deshabilitada[0]!.etiqueta).toBe("");
  });
});
