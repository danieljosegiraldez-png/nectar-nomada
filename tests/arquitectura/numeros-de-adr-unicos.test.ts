/**
 * Dos ADR no pueden llevar el mismo numero.
 *
 * **El incidente, 2026-09-16.** Se publico un ADR-144 --"El meliponario es un tipo de sitio"--
 * cuando ese numero ya lo tenia "Un ambito de ubicacion alcanza a sus descendientes", de otra
 * sesion, y que estaba **en la base de la propia rama**. Llego a `main` asi.
 *
 * Como se colo, que es lo que este guardia existe para tapar: se busco el ultimo numero
 * grepeando los encabezados y leyendo las **cuatro ultimas** lineas. Este archivo **no esta en
 * orden numerico** --el 144 vivia en la linea 9865, antes del 140-- asi que la cola enseno
 * 140, 141, 142, 143 y el maximo real, 144, quedo fuera del recorte. Una salida truncada se
 * lee como el mundo entero, y el numero siguiente parecia libre.
 *
 * No falla en rojo por si solo: dos encabezados iguales compilan, pasan el lint y se fusionan.
 * Lo que rompen es la referencia -- "ADR-144" en un comentario deja de nombrar una cosa.
 *
 * **La excepcion, declarada y no escondida.** `ADR-107` ya estaba duplicado antes de esto y se
 * deja como esta: se cita en **ocho** archivos, entre ellos cuatro docs de implementacion, y
 * renumerarlo reescribiria procedencia que nadie ha pedido tocar. Un guardia que no puede pasar
 * nunca ensena a ignorar una linea roja, asi que se le pone la excepcion con su razon. Si
 * alguien lo renumera algun dia, esta lista se queda vacia y el guardia aprieta solo.
 *
 * Hermetico: lee un archivo, no toca la base.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = join(process.cwd(), "docs/architecture/DECISIONS.md");

/**
 * Duplicados que ya existian cuando se escribio este guardia y que NO se arreglan aqui.
 * Cada uno con la razon por la que se deja, para que nadie lo lea como descuido.
 */
const DUPLICADOS_HEREDADOS: ReadonlyMap<number, string> = new Map([
  [107, "duplicado antes del 2026-09-16; se cita en 8 archivos, 4 de ellos docs de implementacion"],
]);

/** Los numeros de todos los encabezados de ADR, en el orden en que aparecen en el archivo. */
export function numerosDeAdr(texto: string): number[] {
  const numeros: number[] = [];
  for (const linea of texto.split("\n")) {
    // El archivo usa tanto `## ADR-144 —` como `## ADR-144 --`, asi que se corta en el numero.
    const m = /^## ADR-(\d+)/.exec(linea);
    if (m) numeros.push(Number(m[1]));
  }
  return numeros;
}

/** Los numeros que aparecen mas de una vez, con cuantas veces. */
export function numerosRepetidos(numeros: readonly number[]): Map<number, number> {
  const cuenta = new Map<number, number>();
  for (const n of numeros) cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  return new Map([...cuenta].filter(([, veces]) => veces > 1));
}

describe("los numeros de ADR son unicos", () => {
  const texto = readFileSync(RUTA, "utf8");
  const numeros = numerosDeAdr(texto);

  it("el archivo se leyo de verdad, y tiene mas de cien decisiones", () => {
    // Fila patron: sin esto, un archivo vacio o una ruta mala darian CERO duplicados, que es
    // exactamente el veredicto que este guardia busca. Un cero se lee como "limpio" cuando
    // significa "no mire".
    expect(numeros.length).toBeGreaterThan(100);
  });

  it("ningun numero se usa dos veces, salvo los heredados que se declaran aqui", () => {
    const repetidos = numerosRepetidos(numeros);
    const inesperados = [...repetidos].filter(([n]) => !DUPLICADOS_HEREDADOS.has(n));
    expect(
      inesperados.map(([n, veces]) => `ADR-${n} aparece ${veces} veces`),
    ).toEqual([]);
  });

  it("y los heredados siguen ahi: si alguien los arregla, esta lista se queda corta", () => {
    // Control positivo del de arriba. Sin el, borrar la comprobacion entera dejaria las dos
    // pruebas en verde -- y la excepcion declarada se convertiria en una lista que no vigila
    // nada. Tambien avisa cuando un duplicado heredado se arregla y sobra de la lista.
    const repetidos = numerosRepetidos(numeros);
    for (const [n, razon] of DUPLICADOS_HEREDADOS) {
      expect(
        repetidos.has(n),
        `ADR-${n} ya no esta duplicado (${razon}): quitalo de DUPLICADOS_HEREDADOS`,
      ).toBe(true);
    }
  });

  it("el detector distingue un encabezado de una mencion en prosa", () => {
    // Un comentario que dice "ADR-144" no es un ADR. Si el detector contase menciones,
    // cualquier decision citada dos veces saldria como duplicada y el guardia seria ruido.
    const falso = ["## ADR-001 -- uno", "Como dice ADR-001, y otra vez ADR-001.", "## ADR-002 -- dos"];
    expect(numerosDeAdr(falso.join("\n"))).toEqual([1, 2]);
    expect([...numerosRepetidos(numerosDeAdr(falso.join("\n")))]).toEqual([]);
  });
});
