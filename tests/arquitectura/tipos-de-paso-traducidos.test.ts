/**
 * Cada tipo de paso tiene su rótulo en los dos idiomas (Parte 2a, tarea 2).
 *
 * **Por qué existe.** La pantalla de pasos (tareas 13 y 14) rotula cada tipo con una clave de PLANTILLA,
 * ``t(`tipoPaso_${tipo}`)``, y una clave de plantilla no la ve `claves-de-traduccion-existen` (sólo mira
 * claves literales). Sin esto, un tipo nuevo sin rótulo compilaría y enseñaría el nombre crudo de la clave.
 *
 * **El espacio y el prefijo se fijan aquí, no se leen de un formulario** como hace la hermana: el
 * formulario todavía no existe. Las tareas 13 y 14 usan estos dos tal cual; si los cambian, cambian esta
 * prueba en el mismo commit.
 *
 * Hermética: lee los dos JSON y `lib/recetas/vocabulario.ts`, que no importa nada.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIPOS_DE_PASO } from "../../lib/recetas/vocabulario";

const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, Record<string, string>>;
const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, Record<string, string>>;

const ESPACIO = "Traceability";
const PREFIJO = "tipoPaso_";

describe("cada tipo de paso tiene su rótulo en los dos idiomas", () => {
  it("control: se leyeron los 24 tipos y el espacio Traceability existe en los dos idiomas", () => {
    // Sin esto, una lista vacía deja el `it.each` de abajo sin recorrer nada y en verde.
    expect(TIPOS_DE_PASO).toHaveLength(24);
    expect(es[ESPACIO], "es.json sin Traceability").toBeDefined();
    expect(en[ESPACIO], "en.json sin Traceability").toBeDefined();
  });

  it.each([...TIPOS_DE_PASO])("el tipo «%s» tiene rótulo, no vacío y distinto de su id, en es.json y en en.json", (tipo) => {
    for (const [idioma, mensajes] of [["es", es], ["en", en]] as const) {
      const rotulo = mensajes[ESPACIO]?.[`${PREFIJO}${tipo}`];
      expect(rotulo, `${idioma}.json no tiene ${ESPACIO}.${PREFIJO}${tipo}`).toBeTruthy();
      expect(rotulo, `${idioma}.json rotula «${tipo}» con su id crudo`).not.toBe(tipo);
    }
  });

  it("no sobra ninguna clave tipoPaso_ de un tipo que no existe", () => {
    // Caza la errata que deja un rótulo huérfano y el tipo verdadero sin el suyo (el paquete mismo escribe
    // `sorting_flotation` en su JSON y `sorting_floatation` en R6).
    for (const mensajes of [es, en]) {
      const sobran = Object.keys(mensajes[ESPACIO] ?? {}).filter(
        (k) => k.startsWith(PREFIJO) && !(TIPOS_DE_PASO as readonly string[]).includes(k.slice(PREFIJO.length)),
      );
      expect(sobran).toEqual([]);
    }
  });
});
