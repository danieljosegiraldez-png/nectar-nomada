import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La guarda de `consolidar-persona-duplicada.ts` pregunta al esquema, no a una lista.**
 *
 * Ese guion borra una ficha de persona. Lo único que lo hace seguro es comprobar antes que nadie la
 * referencia — y hay **51 columnas** apuntando a `core.person`, una por cada modelo que registra
 * quién hizo algo. Una lista escrita a mano envejecería en el primer modelo nuevo: `PlotBloom` entró
 * el 2026-10-01 con su `observerPersonId`, y una lista de ayer no lo habría mirado. El guion
 * borraría la ficha dejando esa fila apuntando al vacío, o la FK lo rechazaría en medio de la
 * transacción — y de las dos, la primera es la que no se nota.
 *
 * Es la misma forma que el 89 congelado de `grant-platform-admin`: una cifra o una lista fijadas en
 * un archivo que describen un mundo que se mueve. Allí el guardia abortaba una concesión legítima;
 * aquí dejaría pasar un borrado que no lo es.
 *
 * **Qué prueba esto, y qué no.** No prueba que el guion consolide bien: eso se ensayó contra una
 * restauración del respaldo verificado, con los dos pares reales y sus post-condiciones medidas por
 * fuera. Previene la regresión concreta: que alguien cambie la consulta del esquema por una lista de
 * tablas. Decirlo es parte del guardia.
 */
const GUION = new URL("../../scripts/consolidar-persona-duplicada.ts", import.meta.url).pathname;
const fuente = () => readFileSync(GUION, "utf8");

describe("consolidar-persona-duplicada no enumera las referencias", () => {
  /** Control positivo del análisis: si el archivo se mueve o se vacía, lo de abajo pasaría sobre nada. */
  it("el guion existe y sigue siendo el que borra una ficha", () => {
    const src = fuente();
    expect(src.length, "el guion está vacío o no se leyó").toBeGreaterThan(1000);
    expect(src, "ya no borra ninguna persona").toMatch(/person\.delete\(/);
  });

  it("la lista de columnas sale de information_schema, no del archivo", () => {
    const src = fuente();
    expect(src, "no consulta el esquema").toMatch(/information_schema\.table_constraints/);
    // **La consulta se acota a UNA tabla destino, y desde el 2026-10-02 esa tabla es un PARÁMETRO.**
    // El guion hace desaparecer dos cosas —una ficha de `core.person` y una `core.user_account`— y
    // durante un día midió sólo la primera, así que la consulta se parametrizó. Esta aserción exigía
    // el literal `'person'` y por eso cayó sobre código mejor; se corrige en vez de quitarse, porque
    // lo que sigue importando es que la consulta NO devuelva todas las claves ajenas de la base: sin
    // acotar, «hay referencias» sería cierto siempre y la guarda no mediría nada.
    expect(src, "no acota la consulta a una tabla destino").toMatch(
      /ccu\.table_name\s*=\s*(\$\{tablaDestino\}|'person')/,
    );
    // Y la compensación: que el parámetro no haya dejado a `person` sin nadie que la pase. Sin esto,
    // parametrizar y no llamar nunca con `person` pasaría la aserción de arriba.
    expect(src, "ya nadie mide las referencias a core.person").toMatch(
      /columnasQueApuntanA\("person", "id"\)/,
    );
  });

  /**
   * Si la consulta devolviera vacío —porque alguien la rompe, o cambia de esquema— medir cero
   * referencias se leería como «nadie la referencia», que es justo el permiso para borrar. El guion
   * tiene que ABORTAR ahí, no continuar.
   */
  it("y si el esquema no devuelve ninguna columna, aborta en vez de seguir", () => {
    const src = fuente();
    const i = src.indexOf("if (columnas.length === 0)");
    expect(i, "no comprueba que la consulta del esquema devolvió algo").toBeGreaterThan(-1);
    expect(src.slice(i, i + 220), "no aborta cuando no puede medir").toMatch(/fail\(/);
  });

  it("borra la ficha sólo si la ÚNICA referencia es su propia cuenta", () => {
    const src = fuente();
    expect(src, "no separa la referencia de la cuenta del resto").toMatch(
      /core\.user_account\.person_id/,
    );
    const i = src.indexOf("if (fuera.length > 0)");
    expect(i, "no hay rama que aborte con referencias de más").toBeGreaterThan(-1);
    expect(src.slice(i, i + 300), "no aborta cuando hay historia").toMatch(/fail\(/);
  });

  /**
   * Las dos propiedades que un ensayo no puede garantizar para siempre: que la escritura va en UNA
   * transacción, y que el cambio de identidad se audita (§35). Sin la transacción, un fallo a mitad
   * deja a una persona sin cuenta; sin la auditoría, nadie sabe qué se fusionó con qué.
   */
  it("escribe en una transacción y audita el cambio de identidad", () => {
    const src = fuente();
    expect(src, "no usa una transacción").toMatch(/prisma\.\$transaction\(/);
    expect(src, "no escribe AuditEvent").toMatch(/auditEvent\.create\(/);
    const i = src.indexOf("auditEvent.create(");
    expect(src.slice(i, i + 700), "el registro no dice qué se fusionó").toMatch(/before:/);
    expect(src.slice(i, i + 700), "el registro no dice en qué quedó").toMatch(/after:/);
  });

  /**
   * El ensayo tiene que ser el camino por defecto: un guion que escribe sin pedirlo se corre sin
   * querer. `--aplicar` es la única puerta.
   */
  it("sin --aplicar no escribe: el ensayo es el camino por defecto", () => {
    const src = fuente();
    expect(src, "no existe la bandera").toMatch(/--aplicar/);
    const i = src.indexOf("if (!aplicar)");
    expect(i, "no hay salida temprana sin la bandera").toBeGreaterThan(-1);
    // La salida temprana ocurre ANTES de la transacción, o el ensayo escribiría.
    expect(i, "la salida del ensayo está después de la transacción").toBeLessThan(
      src.indexOf("prisma.$transaction("),
    );
  });
});
