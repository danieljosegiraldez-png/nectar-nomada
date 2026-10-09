/**
 * La guarda de forma de `lib/validation/uuid.ts`, probada con la entrada hostil directamente.
 *
 * `tests/traceability/idMalFormado.test.ts` la ejercita a través de `getLotDetail`, pero su control
 * de «un UUID válido que no existe» no distingue una guarda que rechace la forma de un lote que no
 * está en la base: las dos dan el mismo error. Y su lote existente sólo prueba UUID de versión 4,
 * que es lo que genera `gen_random_uuid()`. Lo señaló la revisión de Codex del 2026-10-09.
 *
 * Postgres acepta cualquier versión y variante con la forma 8-4-4-4-12, así que una guarda que sólo
 * dejara pasar la versión 4 convertiría en «no existe» un id que la base sí guarda. Estas filas son
 * las que lo cazan.
 */
import { describe, expect, it } from "vitest";

import { UUID } from "../../lib/validation/uuid";

describe("UUID", () => {
  it.each([
    ["versión 4", "c298e1bf-e635-410c-85b2-b8d8874b60b1"],
    ["versión 1", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"],
    ["versión 7", "01890a5d-ac96-774b-bcce-b302099a8057"],
    ["el UUID nulo", "00000000-0000-0000-0000-000000000000"],
    ["en mayúsculas", "C298E1BF-E635-410C-85B2-B8D8874B60B1"],
  ])("deja pasar %s, que Postgres acepta", (_caso, id) => {
    expect(UUID.test(id)).toBe(true);
  });

  it.each([
    ["una palabra", "no-es-un-id"],
    ["un número", "123"],
    ["la vacía", ""],
    ["un carácter de menos", "c298e1bf-e635-410c-85b2-b8d8874b60b"],
    ["una letra que no es hexadecimal", "g298e1bf-e635-410c-85b2-b8d8874b60b1"],
    ["un UUID con algo detrás", "c298e1bf-e635-410c-85b2-b8d8874b60b1/x"],
    ["un UUID con un salto de línea detrás", "c298e1bf-e635-410c-85b2-b8d8874b60b1\n"],
  ])("rechaza %s", (_caso, id) => {
    expect(UUID.test(id)).toBe(false);
  });
});
