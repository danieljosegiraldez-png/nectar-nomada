import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cada `recordAuditEvent` dentro de una transacción recibe esa transacción.
 *
 * **Por qué existe.** La segunda revisión independiente (2026-09-01) encontró
 * que cuatro tests llamados «escribe el AuditEvent en la misma transacción» sólo
 * comprobaban que el evento EXISTIERA al terminar. Quitar el `tx` los dejaba
 * verdes a los cuatro: cuando nada falla, las dos filas existen igual. Eran
 * guardias que no podían fallar, que `CLAUDE.md` llama peores que ninguno.
 *
 * **Por qué es un test de FUENTE y no de ejecución.** Probar la atomicidad de
 * verdad exige que el audit falle a mitad, y un servicio no deja inyectar ese
 * fallo desde fuera: controla todos los campos del evento y su actor tiene que
 * existir para pasar RBAC. `plantingCohorts.test.ts` sí prueba el MECANISMO
 * —violando la FK del actor a mano— y eso basta una vez. Lo que faltaba era
 * comprobar que cada servicio lo USA, y eso se lee.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/**
 * Los servicios que abren transacción y auditan dentro. No es «todos los que
 * auditan»: 28 archivos auditan sin abrir transacción y no tienen nada que
 * hacer atómico (ver `SESSION_STATE.md` §3).
 */
const SERVICIOS_ATOMICOS = [
  "lib/traceability/plantingCohorts.ts",
  "lib/traceability/biocharBatches.ts",
  "lib/traceability/soilProfiles.ts",
  "lib/traceability/soilSamples.ts",
  "lib/traceability/landMedia.ts",
  "lib/traceability/measurements.ts",
  "lib/research/amendments.ts",
  // 2026-09-06. Su audit iba FUERA de la transacción, y su comentario lo
  // justificaba con una razón que no se sostiene: «an audit row for a
  // transaction that later rolled back would misrepresent what actually
  // happened». Si el audit va dentro y la transacción revierte, el audit
  // revierte con ella. El fallo real era el contrario, y es el que
  // `lib/audit.ts` documenta: una escritura confirmada sin su AuditEvent.
  "lib/traceability/lots.ts",
  // 2026-09-06, los cuatro de una sola llamada que SÍ eran de este patrón: su
  // audit iba justo después del `});` de la transacción. Los otros dos de la
  // lista de §3 —`sensory/service.ts` y `auth/config.ts`— resultaron NO serlo:
  // auditan una escritura suelta (`prisma.assessment.create`,
  // `prisma.userAccount.update`), no una transacción. Tienen el mismo hueco,
  // pero su arreglo es introducir una transacción, no pasar `tx`, y eso es otro
  // cambio.
  "lib/traceability/roasting.ts",
  "lib/apiary/harvest.ts",
  "lib/commerce/orders.ts",
  "lib/experiences/bookings.ts",
];

/**
 * Los argumentos de cada `recordAuditEvent(...)`, contando paréntesis.
 *
 * Un regex no vale: el objeto del evento lleva paréntesis y llaves anidados, y
 * un `.*?` se detiene en el primero que encuentra. Contar es aburrido y
 * correcto.
 */
function llamadasARecordAuditEvent(src: string): string[] {
  const llamadas: string[] = [];
  const marca = "recordAuditEvent(";
  let desde = 0;
  for (;;) {
    const i = src.indexOf(marca, desde);
    if (i === -1) break;
    let profundidad = 0;
    let j = i + marca.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === "(") profundidad++;
      else if (src[j] === ")") {
        profundidad--;
        if (profundidad === 0) break;
      }
    }
    llamadas.push(src.slice(i, j + 1));
    desde = j + 1;
  }
  return llamadas;
}

describe("el audit viaja con la transacción que lo produjo", () => {
  for (const archivo of SERVICIOS_ATOMICOS) {
    it(`${archivo}: cada recordAuditEvent recibe el cliente de transacción`, () => {
      const src = readFileSync(join(RAIZ, archivo), "utf8");

      // Control de que estamos mirando donde hay algo que mirar: si el archivo
      // dejara de abrir transacción o de auditar, este test dejaría de
      // significar nada en silencio.
      expect(src, `${archivo} ya no abre transacción`).toContain("$transaction");

      const llamadas = llamadasARecordAuditEvent(src);
      expect(llamadas.length, `${archivo} ya no llama a recordAuditEvent`).toBeGreaterThan(0);

      for (const llamada of llamadas) {
        // El segundo argumento es el cliente. Se busca `, tx,` o `, tx)` — la
        // coma de cierre la pone el formateador del proyecto.
        expect(
          /,\s*tx\s*,?\s*\)$/.test(llamada.trim()),
          `en ${archivo} hay un recordAuditEvent sin cliente de transacción:\n${llamada.slice(0, 160)}…`,
        ).toBe(true);
      }
    });
  }
});
