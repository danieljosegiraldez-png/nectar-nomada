/**
 * Que un archivo de protocolo se convierta en las filas que dice.
 *
 * **El hueco que cierra (2026-09-07).** `validarDefinicion` comprueba el
 * ARCHIVO; nada comprobaba la escritura. El día que se añadió `descriptors` eso
 * dejó de ser teórico: un `createMany` omitido crea el protocolo sin una sola
 * palabra de su vocabulario, y en pantalla se ve igual que un catador que no
 * marcó nada.
 *
 * **Lo que esta prueba NO puede ver, dicho aquí para que nadie lo suponga.** El
 * fallo real del 2026-09-07 fue de LATENCIA —51 inserciones de una en una
 * reventaron el techo de 5 s de la transacción contra Neon— y contra una base
 * local eso cabe de sobra. Ninguna prueba de aquí lo habría cazado; lo cazó
 * correrlo contra producción, y lo que lo impide en adelante es el `createMany`.
 *
 * Cada caso corre dentro de una transacción que se revierte a propósito: la
 * base de pruebas es compartida entre sesiones y esto no deja rastro.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearProtocolo } from "../../lib/sensory/crearProtocolo";
import { validarDefinicion, type DefinicionDeProtocolo } from "../../lib/sensory/definicionDeProtocolo";

const RAIZ = new URL("../..", import.meta.url).pathname;
const RUN = `crea-${Date.now()}`;

function archivo(nombre: string): DefinicionDeProtocolo {
  const d = validarDefinicion(JSON.parse(readFileSync(`${RAIZ}protocolos/${nombre}`, "utf8")));
  // El nombre es único por archivo y la base es compartida: se marca para no
  // chocar con otra sesión aunque el rollback fallara.
  return { ...d, name: `TEST ${d.name} ${RUN}` };
}

/** Corre `fn` dentro de una transacción y la revierte siempre. */
async function enTransaccionRevertida<T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) {
  const marca = new Error("revertir a propósito");
  let resultado: T | undefined;
  await prisma
    .$transaction(async (tx) => {
      resultado = await fn(tx);
      throw marca;
    })
    .catch((e) => {
      if (e !== marca) throw e;
    });
  return resultado!;
}

describe("crearProtocolo escribe lo que el archivo declara", () => {
  it("el archivo de miel entra con sus 6 criterios y sus 45 descriptores", async () => {
    const definicion = archivo("miel-competencia-100.json");

    const leido = await enTransaccionRevertida(async (tx) => {
      const creado = await crearProtocolo(tx, definicion);
      const version = await tx.sensoryProtocolVersion.findUniqueOrThrow({
        where: { id: creado.versionId },
        include: {
          protocol: true,
          attributes: { orderBy: { displayOrder: "asc" } },
          descriptors: { orderBy: { displayOrder: "asc" } },
        },
      });
      return version;
    });

    expect(leido.protocol.domain).toBe("honey");
    expect(leido.scoreFormula).toBe("attribute_sum_v1");
    expect(leido.attributes).toHaveLength(6);
    expect(leido.attributes.map((a) => a.name)).toEqual(definicion.attributes.map((a) => a.name));
    expect(leido.attributes.reduce((n, a) => n + a.scaleMax.toNumber(), 0)).toBe(100);

    // El caso que motiva el archivo entero.
    expect(leido.descriptors, "el vocabulario no llegó a la base").toHaveLength(45);
    expect(leido.descriptors.filter((d) => d.classification === "defect")).toHaveLength(15);
    expect(
      leido.descriptors.filter((d) => d.classification === "defect").every((d) => (d.technicalCause ?? "") !== ""),
      "un defecto sin causa es una etiqueta",
    ).toBe(true);
    // El orden del archivo se preserva: es el que verá quien cate.
    expect(leido.descriptors[0]!.family).toBe(definicion.descriptors![0]!.family);
  });

  it("el archivo del CVA afectivo entra sin vocabulario, y eso es válido", async () => {
    const definicion = archivo("cafe-cva-afectivo-v2.json");

    const leido = await enTransaccionRevertida(async (tx) => {
      const creado = await crearProtocolo(tx, definicion);
      return tx.sensoryProtocolVersion.findUniqueOrThrow({
        where: { id: creado.versionId },
        include: { attributes: true, descriptors: true },
      });
    });

    expect(leido.attributes).toHaveLength(8);
    expect(leido.descriptors).toHaveLength(0);
    expect(leido.scoreFormula).toBe("cva_affective_v1");
  });

  /**
   * El control positivo del `enTransaccionRevertida` de arriba: si la reversión
   * no funcionara, las dos pruebas anteriores estarían dejando protocolos en la
   * base compartida y nadie lo notaría hasta que otra sesión tropezara con ellos.
   */
  it("nada de lo anterior quedó en la base", async () => {
    const restos = await prisma.sensoryProtocol.count({ where: { name: { contains: RUN } } });
    expect(restos, "la transacción de prueba no revirtió").toBe(0);
  });
});
