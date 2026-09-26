/**
 * Toda clave literal que una pantalla pide a `next-intl` existe en **los dos** idiomas.
 *
 * **Por qué existe.** El 2026-09-26, añadiendo el bloque de clasificación por malla, no había forma
 * barata de comprobar que sus diecinueve claves estuvieran puestas: `tsc` no las ve —son cadenas—,
 * `vitest` tampoco, y la base de `dev:local` no tiene el esquema de esa pantalla, así que el
 * navegador tampoco era una opción. Una clave que falta no rompe el build: sale el nombre crudo de
 * la clave en mitad de la interfaz.
 *
 * **Y al medirlo apareció uno de verdad**, en un archivo que nadie estaba tocando: ver la excepción.
 *
 * **Qué comprueba y qué no.** Sólo claves **literales** en archivos con **un solo** espacio de
 * nombres — con dos, `t(...)` no se puede atribuir sin interpretar el código. Las claves armadas
 * con plantilla (`t(`estadoDelDato_${x}`)`) quedan fuera por construcción, y son 190: para ésas el
 * guardia es el tipo de la unión, no esto. La prueba imprime cuántas miró, porque un cero aquí se
 * leería como «todo bien».
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, Record<string, string>>;
const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, Record<string, string>>;

/**
 * **Excepciones, y cada una es una deuda con dueño — no una forma de callar al guardia.**
 *
 * **Ahora mismo está vacía, y así debería quedarse.** La estrenó y la cerró el mismo día
 * `Recepcion.cerrarPedido` (`app/beneficio/pedidos/page.tsx:87`), el rótulo del desplegable que
 * cierra un pedido: faltaba en los dos idiomas desde antes de este guardia, así que esa pantalla
 * enseñaba el nombre crudo de la clave a quien gestiona el beneficio. No se le inventó el texto —
 * Daniel lo decidió el 2026-09-26: «Cerrar pedido» / «Close order».
 */
const DEUDA_CONOCIDA = new Set<string>([]);

function archivosDeApp(dir = "app"): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosDeApp(ruta));
    else if (/\.tsx?$/.test(ruta)) salida.push(ruta);
  }
  return salida;
}

describe("las claves de traducción que piden las pantallas existen", () => {
  it("ninguna clave literal falta en es.json ni en en.json", () => {
    const faltan: string[] = [];
    let miradas = 0;
    let archivosConUnEspacio = 0;

    for (const archivo of archivosDeApp()) {
      const src = readFileSync(archivo, "utf8");
      const espacios = [...src.matchAll(/(?:useTranslations|getTranslations)\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
      if (espacios.length !== 1) continue;
      archivosConUnEspacio += 1;
      const espacio = espacios[0]!;
      for (const m of src.matchAll(/\bt\(\s*(["'`])([^"'`$]*?)\1/g)) {
        const clave = m[2];
        if (!clave) continue;
        miradas += 1;
        const nombre = `${espacio}.${clave}`;
        if (DEUDA_CONOCIDA.has(nombre)) continue;
        const enEs = Object.prototype.hasOwnProperty.call(es[espacio] ?? {}, clave);
        const enEn = Object.prototype.hasOwnProperty.call(en[espacio] ?? {}, clave);
        if (!enEs || !enEn) faltan.push(`${archivo} → ${nombre}${enEs ? "" : " [falta es]"}${enEn ? "" : " [falta en]"}`);
      }
    }

    // **Control positivo, y es la mitad que importa.** Sin él, cualquier cambio que rompa la
    // expresión regular o la forma del archivo deja este bucle sin recorrer nada y la prueba sale
    // verde diciendo lo contrario de lo que comprueba. Medido el 2026-09-26: 2.423 claves en 276
    // archivos. El umbral va holgado para que no salte por un refactor honesto, pero no en cero.
    expect(miradas, `sólo se miraron ${miradas} claves en ${archivosConUnEspacio} archivos: la prueba no está midiendo nada`)
      .toBeGreaterThan(1500);

    expect(faltan, "estas pantallas piden claves que no existen; saldría el nombre crudo de la clave").toEqual([]);
  });

  it("no hay ninguna excepción pendiente", () => {
    // **Un bucle sobre un conjunto vacío pasa sin comprobar nada**, así que la afirmación es que el
    // conjunto está VACÍO. Añadir una excepción obliga entonces a tocar esta prueba a propósito, y
    // a justificarlo en la revisión — que es exactamente el coste que debe tener silenciar a un
    // guardia. Si alguna vez hay deuda de verdad, aquí se comprueba además que siga sin traducir.
    expect(
      [...DEUDA_CONOCIDA],
      "hay claves excusadas: si la excepción es legítima, cámbiala aquí a propósito y di por qué",
    ).toEqual([]);
  });
});
