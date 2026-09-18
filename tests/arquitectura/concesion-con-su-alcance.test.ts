import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Hallazgo B, ronda 2 (revisión independiente de Codex sobre `conceder-beneficio`,
 * 2026-09-18): `personasDelBeneficio` listaba asignaciones cuyo ámbito alcanza el
 * beneficio SIN comprobar si el actor tiene autoridad sobre ESE ámbito (que puede
 * ser un ancestro más ancho, el sitio) — la misma guardia que el hallazgo 1 le
 * exige a `concederEditarBeneficio`/`quitarEditarBeneficio`. `Concesiones.tsx`
 * ofrecía el formulario igual, y el servidor lo rechazaba.
 *
 * El servicio ya lleva su prueba (`tests/traceability/concesiones.test.ts`,
 * describe "personasDelBeneficio: puedeGestionar"), que comprueba el DATO.
 * Este guardia, siguiendo el mismo patrón que
 * `tests/arquitectura/cama-con-su-permiso.test.ts` para el hallazgo 5 — no hay
 * arnés de renderizado de componentes en este repositorio — comprueba que la
 * PANTALLA usa ese dato: que `FormularioConceder`/`FormularioQuitar` están
 * gateados por `p.puedeGestionar`, no sólo por `p.estado`.
 */
const RUTA = new URL("../../app/beneficio/ajustes/Concesiones.tsx", import.meta.url);

describe("app/beneficio/ajustes/Concesiones.tsx: el formulario respeta puedeGestionar", () => {
  it("FormularioConceder y FormularioQuitar sólo se renderizan cuando p.puedeGestionar es cierto", () => {
    const fuente = readFileSync(RUTA, "utf8");

    // Control positivo: el archivo sigue usando p.estado para decidir CUÁL
    // formulario ofrecer — si esto desaparece, el guardia de abajo estaría
    // mirando un archivo que ya cambió de forma y no lo notaría.
    expect(fuente).toMatch(/p\.estado === "sin_permiso"/);
    expect(fuente).toMatch(/p\.estado === "concedido"/);

    // El hallazgo: cada renderizado de los dos formularios está condicionado
    // también por p.puedeGestionar, con un texto alternativo cuando es falso.
    const bloqueConceder = fuente.slice(fuente.indexOf('p.estado === "sin_permiso"'), fuente.indexOf("FormularioConceder") + 40);
    const bloqueQuitar = fuente.slice(fuente.indexOf('p.estado === "concedido"'), fuente.indexOf("FormularioQuitar") + 40);
    expect(bloqueConceder).toMatch(/p\.puedeGestionar/);
    expect(bloqueQuitar).toMatch(/p\.puedeGestionar/);

    // Y el texto alternativo existe, para que "no puede gestionar" no se
    // traduzca en una fila muda.
    expect(fuente).toMatch(/gestionadoEnOtroAmbito/);
  });
});
