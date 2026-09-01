import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Una sección archivada existe **una vez**, y en **un solo sitio**.
 *
 * El 2026-08-31 dos sesiones archivaron la misma sección a la vez. Los dos
 * commits la insertaron en posiciones distintas de
 * `docs/SESSION_STATE_ARCHIVE.md`, así que git **no vio texto solapado**, la
 * fusión salió limpia, y el archivo quedó con la sección **dos veces**.
 *
 * Eso es lo que hace falta comprobar y no otra cosa: `SESSION_STATE.md` sí dio
 * conflicto y por eso se miró. El archivo histórico no dio ninguno. Una fusión
 * limpia no dice que el resultado sea correcto, sólo que git no encontró nada
 * que le pareciera solapado — y con seis worktrees vivos esto se repite.
 *
 * Se comprobó a mano ese día. A mano significa: la próxima vez, no.
 */
const raiz = new URL("../", import.meta.url).pathname;
const titulos = (ruta: string): string[] => {
  let texto: string;
  try {
    texto = readFileSync(`${raiz}${ruta}`, "utf8");
  } catch {
    return [];
  }
  return [...texto.matchAll(/^### (.+)$/gm)].map((m) => m[1]!.trim());
};

const ESTADO = "SESSION_STATE.md";
const ARCHIVO = "docs/SESSION_STATE_ARCHIVE.md";

describe("el archivo histórico del estado", () => {
  it("no repite ninguna sección", () => {
    const vistos = new Set<string>();
    const repetidos: string[] = [];
    for (const t of titulos(ARCHIVO)) {
      if (vistos.has(t)) repetidos.push(t);
      vistos.add(t);
    }
    expect(
      repetidos,
      `${ARCHIVO} tiene secciones repetidas. Suele ser una fusión limpia entre ` +
        `dos sesiones que archivaron lo mismo: git no ve solape y duplica. ` +
        `Deja una sola copia.`
    ).toEqual([]);
  });

  it("no comparte ninguna sección con el estado vivo", () => {
    const enArchivo = new Set(titulos(ARCHIVO));
    const enAmbos = titulos(ESTADO).filter((t) => enArchivo.has(t));
    expect(
      enAmbos,
      `una sección está a la vez en ${ESTADO} y en ${ARCHIVO}. Archivar es ` +
        `mover, no copiar: bórrala del estado vivo.`
    ).toEqual([]);
  });

  /**
   * El archivador corta cada sección en el **siguiente encabezado de nivel 1 a
   * 3** (`siguienteEncabezado` en `scripts/check-state-budget.mjs`). Un `###`
   * que no sea una entrada fechada —un subtítulo dentro de una entrada, por
   * ejemplo— truncaría a su padre: al archivar se movería sólo el trozo de
   * arriba y el resto quedaría huérfano en el estado, sin encabezado propio.
   *
   * Así que esto no es una preferencia de formato: es la condición que el
   * archivador necesita para no partir una entrada por la mitad.
   */
  it("toda sección fechada del estado tiene el formato que el archivador espera", () => {
    const malFormadas = titulos(ESTADO).filter((t) => !/^\d{4}-\d{2}-\d{2} · /.test(t));
    expect(
      malFormadas,
      `secciones de ${ESTADO} que el guardia del presupuesto no sabrá archivar ` +
        `(espera «### AAAA-MM-DD · título»)`
    ).toEqual([]);
  });
});
