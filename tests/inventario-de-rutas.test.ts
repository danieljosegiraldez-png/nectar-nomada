import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * El control de higiene del router.
 *
 * Los fixtures negativos son la parte que importa, y uno de ellos es el que
 * pidió la revisión del plan: **una página que conserva la señal textual y
 * pierde el control efectivo**. Si el guardia la deja pasar, el guardia no
 * sirve — y quitar la cadena que el propio análisis busca sería una prueba
 * circular.
 *
 * Ningún fixture escribe dentro de `app/`: otras sesiones comparten este
 * checkout. Se le apunta al script a un árbol de mentira en un temporal.
 */

const raizRepo = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "rutas-"));

afterAll(() => {
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      /* reintentar: rendirse ante un recurso ocupado deja basura permanente */
    }
  }
});

function correr(args: string[]): { codigo: number; salida: string } {
  try {
    return {
      codigo: 0,
      salida: execFileSync("node", ["scripts/inventario-de-rutas.mjs", ...args], {
        cwd: raizRepo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { codigo: e.status ?? 1, salida: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** Construye un árbol mínimo y devuelve los argumentos para apuntarle. */
function mundo(nombre: string, paginas: Record<string, string>, manifiesto: string): string[] {
  const raiz = join(dir, nombre);
  for (const [ruta, contenido] of Object.entries(paginas)) {
    const destino = join(raiz, "app", ruta === "/" ? "" : ruta);
    mkdirSync(destino, { recursive: true });
    writeFileSync(join(destino, "page.tsx"), contenido, "utf8");
  }
  mkdirSync(join(raiz, "scripts"), { recursive: true });
  writeFileSync(join(raiz, "scripts", "m.mjs"), manifiesto, "utf8");
  return ["--raiz", raiz, "--manifiesto", join(raiz, "scripts", "m.mjs")];
}

const GATEADA = `import { getCurrentUser } from "x";
export default async function P() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return null;
}`;

describe("el inventario del router", () => {
  it("el repositorio real está entero y sin contradicciones", () => {
    const { codigo, salida } = correr([]);
    // El número está FIJADO a propósito: es el disparador que hace que una ruta
    // nueva se vea. 52 → 54 el 2026-09-01, con /biochar y /biochar/[id]
    // declaradas en el manifiesto en el mismo cambio. 61 → 62 el 2026-09-06,
    // con /lots/[id]/roast/new — la pantalla que le faltaba al tueste, cuyo
    // servicio existía desde R1 sin un solo consumidor. 62 → 63 el mismo día,
    // con /sensory/new: hasta entonces `sensorySession.create` sólo existía en
    // la semilla, así que nadie podía empezar una cata. 63 → 64 el 2026-09-07,
    // con /field-sessions/[id]/report — el reporte de visita de A9.6, que se
    // renderiza desde el snapshot congelado y no desde la visita. 64 → 65 el
    // mismo día, con /apiaries/[id]/etiquetas — la hoja de calcomanías QR, que
    // es lo que hace que abrir la caja N-01 sea apuntar la cámara.
    // 65 → 66 el mismo día, con /lots/[id]/process — el proceso del lote, la
    // única pantalla desde la que se declara el % H al que se va a almacenar.
    // 66 → 67 el mismo día, con /reports/proceso — el reporte transversal que
    // ata la intervención en el lote con el puntaje de taza.
    // 67 → 68 el 2026-09-08, con /sensory/external-report — la puerta que le
    // faltaba al informe de un Q-grader, que sólo se podía meter por terminal.
    // 68 → 69 el 2026-09-09, con /apiaries/new — hasta ese día no había forma
    // de crear un apiario desde la aplicación, sólo colmenas dentro de uno.
    // 69 → 70 el 2026-09-10, con /informe/[token] — el informe de una visita
    // abierto por su enlace, sin sesión. El servicio existía desde A9.6 y no
    // había dónde canjear el token.
    // 70 → 73 el 2026-09-14, con /equipos, /equipos/[id] y /equipos/nuevo — el inventario de
    // equipos e instrumentos y el acto de verificar uno contra su patrón. Hasta
    // ese día el equipo era texto libre en cuatro campos y no había dónde decir
    // que un refractómetro se había puesto contra el agua.
    // 73 → 77 el 2026-09-16: inspección nueva y lista/alta/detalle de instalaciones.
    // 77 → 78 el 2026-09-16: /admin/users/[assignmentId]/permisos, la pantalla que
    // permite quitar y añadir permisos sueltos a UNA asignación sin tocar el perfil
    // ni entrar por SQL. Hasta ese día un ajuste así obligaba a crear un perfil nuevo.
    // 78 → 79 el 2026-09-16: /plots/[id]/ajustes — la pantalla de gestión de una
    // parcela (siembras, condiciones y calicatas), separada del tablero.
    // 79 → 80 el 2026-09-17: /beneficio/ajustes — el alta y la edición del
    // beneficio como Location, separado de su operación.
    // 80 → 81 el mismo día: /beneficio, el índice de la sección que sustituye a
    // «Lotes» en el menú. Medido con scripts/inventario-de-rutas.mjs: 71 páginas
    // y 10 handlers.
    // 81 → 82 el mismo día: /inventario — el inventario de materiales, con el
    // saldo DERIVADO y los dos estados que no se confunden: «nunca contado» y
    // «hay que cuadrarlo». Filtra cada lote por su ubicación.
    //
    // TERCERA vez el mismo día que dos sesiones suben esta cifra al mismo
    // número con pantallas distintas. Se midió sobre el árbol resuelto:
    // 72 páginas y 10 handlers.
    // 82 → 83 el 2026-09-18: /finca, el índice de la sección que sustituye a
    // «Parcelas». 73 páginas y 10 handlers.
    // 83 → 84 el mismo día: /inventario/recibir — recibir un medicamento en el
    // botiquín. CUARTA vez que dos sesiones suben la cifra al mismo número con
    // pantallas distintas: la rama decía 83 y, rebasada sobre /finca, se MIDIÓ
    // sobre el árbol resuelto: 74 páginas y 10 handlers.
    // 84 → 86 el 2026-09-18 (Tarea 8 fitosanitaria): dos páginas nuevas,
    // `/plots/[id]/manejo/nuevo` y `/plots/[id]/manejo/[interventionId]` — 76
    // páginas y 10 handlers.
    // 84 → 85 el 2026-09-18: /tienda — la tienda por dentro, recepciones y variantes (ADR-163).
    // 75 páginas y 10 handlers, medido sobre el árbol de la rama.
    // 85 → 86 el 2026-09-18: /api/v1/ingest/notehub, el primer handler de clase
    // `secreto-de-ruta` — lo que mandan los nodos de sensores. QUINTA vez que dos
    // sesiones suben la cifra al mismo número; medido sobre el árbol resuelto:
    // 75 páginas y 11 handlers.
    // 86 → 89 el 2026-09-18 (Tarea 6): /plots/[id]/jornada/nueva,
    // /plots/[id]/muestras/nueva y /plots/[id]/suelo/nuevo — los tres
    // formularios de captura que salieron del tablero de parcela. 78 páginas
    // y 11 handlers, medido sobre el árbol de la rama.
    // 89 → 90 el mismo día (Tarea 6, fix round 1): /plots/[id]/fotos/nueva —
    // la revisión encontró que la spec pide las CUATRO rutas de captura y el
    // brief original sólo había pedido tres; ésta faltaba. 79 páginas y 11
    // handlers.
    // 90 → 91 el mismo día (Tarea 8): /finca/trampas — la tabla de todas las
    // trampas de la finca, filtrada a los lotes que cada persona puede ver.
    // 80 páginas y 11 handlers.
    // 91 → 92 el mismo día (Tarea 9): /finca/trampas/ronda — la lista de
    // tarjetas de la ronda, spec §4.2. 81 páginas y 11 handlers.
    //
    // Y, en paralelo sobre `origin/main` (rama `fitosanitarios`, no la nuestra):
    // 86 → 88 el 2026-09-18: /fincas y /fincas/nueva (spec fincas y parcelas). Medido: 77 páginas
    // y 11 handlers.
    // SEXTA vez el mismo día que dos sesiones suben la cifra con pantallas
    // distintas — integración de `fitosanitarios` sobre `origin/main`. Medido
    // con `node scripts/inventario-de-rutas.mjs` sobre el árbol resuelto tras
    // el merge: 90 entradas (79 páginas y 11 handlers).
    // 88 → 91 el 2026-09-19: /equipos/modelos, /equipos/modelos/nuevo y
    // /equipos/modelos/[id] — el catálogo de modelos de equipo (fichas de
    // fabricante, compartidas o de organización), separado del inventario de
    // equipos concretos. 80 páginas y 11 handlers.
    // 91 → 93 el mismo día: /finca/jornadas y /finca/jornadas/[id] (spec jornada y entrega de
    // cosecha), rebasado sobre el catálogo. Medido: 82 páginas y 11 handlers.
    // 93 → 94 el mismo día: /mis-entregas, la pantalla del recolector. Medido: 83 páginas y 11
    // handlers.
    // 94 → 96 al fusionar `fitosanitarios` (2026-09-19): /plots/[id]/manejo/nuevo y
    // /plots/[id]/manejo/[interventionId]. Medido con `node scripts/inventario-de-rutas.mjs`
    // sobre el árbol fusionado: 85 páginas y 11 handlers.
    //
    // 92 (rama) + 96 (origin/main) fusionados el 2026-09-19 (merge de `origin/main` en
    // `vistas-finca-parcela`): la unión de rutas de ambos lados. Cifra REAL medida con
    // `node scripts/inventario-de-rutas.mjs` sobre el árbol fusionado, no derivada por
    // aritmética — ver el informe de este merge: 102 entradas.
    // 102 → 103 el mismo día: /plots/[id]/microparcela/nueva — decisión de Daniel de que
    // una microparcela no es un tipo de bloque (es una Location `plot` hija de otra
    // `plot`, creada con `createMicrolot` — no la Location `micro_plot`, corregido tras
    // revisión), y su formulario de creación sale del tablero (no vive captura en el
    // dashboard).
    // 103 (rama) + 98 (origin/main, con recepción de cereza) fusionados el 2026-09-19
    // (merge-main-3): unión de rutas de ambos lados. Cifra REAL medida con
    // `node scripts/inventario-de-rutas.mjs` sobre el árbol fusionado — ver el informe
    // de este merge (merge-main-3): 105 entradas (94 páginas, 11 handlers).
    // 105 (origin/main tras #445 y #450) + /beneficio/bandejas de `secado-2a`, fusionados el
    // 2026-09-21 (merge de origin/main 5afbe3f3 en la rama, hecho por la sesión coordinadora
    // porque la de secado se cerró). Medido con `node scripts/inventario-de-rutas.mjs` sobre el
    // árbol fusionado: 106 entradas (95 páginas, 11 handlers), y cuadra con 105 + 1.
    // 106 → 105 el 2026-09-19: se retira /lots/new con la pieza 3 —un lote de cereza nace de una
    // recepción—. Es la primera vez que esta cifra BAJA, y por eso se dice. Medido con
    // `node scripts/inventario-de-rutas.mjs`: 105 entradas (94 páginas, 11 handlers).
    // 96 → 98 el mismo día: /beneficio/recepcion y /beneficio/pedidos (spec recepción de cereza).
    // Medido: 87 páginas y 11 handlers.
    // 98 → 101 el 2026-09-19 (rebase de spec/instalaciones-rutinas): /bodegas,
    // /bodegas/nueva y /bodegas/[id] — la bodega como lugar con rutinas (Tarea 6,
    // spec 2026-09-19 §4.1/§6). Medido con `node scripts/inventario-de-rutas.mjs`
    // sobre el árbol ya rebasado sobre origin/main: 90 páginas y 11 handlers.
    // 101 → 108 el 2026-09-21 (rebase final de spec/instalaciones-rutinas sobre
    // origin/main 919d0ba4, un `origin/main` más nuevo que trajo más rutas propias).
    // `origin/main` mide 105 entradas (94 páginas, 11 handlers); la diferencia
    // —+3 páginas, los mismos /bodegas, /bodegas/nueva y /bodegas/[id]— es lo que
    // trae esta rama. Medido con `node scripts/inventario-de-rutas.mjs` sobre el
    // árbol ya rebasado: 108 entradas (97 páginas, 11 handlers).
    expect(salida).toContain("108 entradas");
    expect(codigo, salida).toBe(0);
  });

  it("no usa la palabra «protegida» ni un ✓ global", () => {
    const { salida } = correr([]);
    expect(salida.toLowerCase()).not.toContain("protegida");
    expect(salida).not.toContain("✓");
    // Sí dice de cuántas se pronuncia.
    expect(salida).toMatch(/\d+ entradas/);
  });

  it("falla ante una ruta sin declarar, y la nombra", () => {
    const args = mundo(
      "sin-declarar",
      { "/": GATEADA, "/zzz-nueva": GATEADA },
      `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`
    );
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("SIN DECLARAR: /zzz-nueva");
  });

  it("falla si el manifiesto declara una ruta que ya no existe", () => {
    const args = mundo(
      "fantasma",
      { "/": GATEADA },
      `export const RUTAS = {
        "/": { clase: "requiere-sesion", razon: "x" },
        "/se-borro": { clase: "requiere-sesion", razon: "x" } };`
    );
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("DECLARADA PERO INEXISTENTE: /se-borro");
  });

  // El fixture no circular que pidió la revisión del plan.
  it("atrapa una página que conserva la señal en un comentario y pierde el control", () => {
    const señuelo = `// Esta página llama a getCurrentUser y hace redirect("/login").
/* getCurrentUser(); redirect("/login"); */
export default async function P() {
  return null; // …pero no hace ninguna de las dos cosas.
}`;
    const args = mundo(
      "senuelo",
      { "/": señuelo },
      `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`
    );
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("DISCREPA");
    expect(salida).toContain("no pide usuario y corta la respuesta");
  });

  it("atrapa una página declarada pública que en realidad exige sesión", () => {
    const args = mundo(
      "publica-que-gatea",
      { "/": GATEADA },
      `export const RUTAS = { "/": { clase: "publica-sin-datos", razon: "x" } };`
    );
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("DISCREPA");
  });

  it("atrapa una ruta de `secreto-de-ruta` que no verifica ningún secreto — y deja pasar la que sí", () => {
    // El control de la clase nueva (artefactos T7): sin él, declararla no costaría nada.
    const sin = correr(mundo("secreto-sin-verificar", { "/": "export default function P() { return null; }" },
      `export const RUTAS = { "/": { clase: "secreto-de-ruta", razon: "x" } };`));
    expect(sin.codigo).toBe(1);
    expect(sin.salida).toContain("DISCREPA");
    const con = correr(mundo("secreto-verificado", { "/": "import { atenderIngesta } from 'x'; export default function P() { return atenderIngesta; }" },
      `export const RUTAS = { "/": { clase: "secreto-de-ruta", razon: "x" } };`));
    expect(con.codigo, con.salida).toBe(0);
  });

  // Los tripwires que la revisión de la compuerta 5 señaló sin flip-test.
  it("no ignora en silencio un page.js: extensión que Next enruta y tsc no ve", () => {
    const raiz = join(dir, "page-js");
    mkdirSync(join(raiz, "app", "nueva"), { recursive: true });
    writeFileSync(join(raiz, "app", "nueva", "page.js"), "export default function P(){return null}", "utf8");
    mkdirSync(join(raiz, "app"), { recursive: true });
    writeFileSync(join(raiz, "app", "page.tsx"), GATEADA, "utf8");
    mkdirSync(join(raiz, "scripts"), { recursive: true });
    writeFileSync(join(raiz, "scripts", "m.mjs"), `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`, "utf8");
    const { codigo, salida } = correr(["--raiz", raiz, "--manifiesto", join(raiz, "scripts", "m.mjs")]);
    expect(codigo).toBe(1);
    expect(salida).toContain("SIN DECLARAR: /nueva");
  });

  it("para la corrida ante una extensión de entrada que no reconoce", () => {
    const raiz = join(dir, "ext-rara");
    mkdirSync(join(raiz, "app", "rara"), { recursive: true });
    writeFileSync(join(raiz, "app", "rara", "page.mts"), "export default function P(){return null}", "utf8");
    writeFileSync(join(raiz, "app", "page.tsx"), GATEADA, "utf8");
    mkdirSync(join(raiz, "scripts"), { recursive: true });
    writeFileSync(join(raiz, "scripts", "m.mjs"), `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`, "utf8");
    const { codigo, salida } = correr(["--raiz", raiz, "--manifiesto", join(raiz, "scripts", "m.mjs")]);
    expect(codigo).toBe(1);
    expect(salida).toContain("EXTENSIÓN DESCONOCIDA");
  });

  it("para la corrida ante un segundo router (pages/ o src/pages/)", () => {
    const args = mundo("segundo-router", { "/": GATEADA }, `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`);
    mkdirSync(join(dir, "segundo-router", "src", "pages"), { recursive: true });
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("src/pages/");
  });

  it("para la corrida ante generateMetadata, y no ante su mención en un comentario", () => {
    const args = mundo(
      "meta",
      { "/": GATEADA, "/con-meta": `export async function generateMetadata(){return {}}\n${GATEADA}` },
      `export const RUTAS = {
        "/": { clase: "requiere-sesion", razon: "x" },
        "/con-meta": { clase: "requiere-sesion", razon: "x" } };`
    );
    expect(correr(args).salida).toContain("generateMetadata");

    const soloComentario = mundo(
      "meta-comentario",
      { "/": `// aquí NO hay generateMetadata, sólo se nombra\n${GATEADA}` },
      `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`
    );
    const r = correr(soloComentario);
    expect(r.codigo, r.salida).toBe(0);
  });

  it("exige una razón declarada para cada ruta", () => {
    const args = mundo("sin-razon", { "/": GATEADA }, `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "  " } };`);
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("Sin razón declarada");
  });

  it("para la corrida si aparece una acción servidor fuera de app/actions", () => {
    const args = mundo("use-server", { "/": GATEADA }, `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`);
    writeFileSync(join(dir, "use-server", "app", "suelta.ts"), `"use server";\nexport async function x() {}\n`, "utf8");
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("Acciones servidor fuera de app/actions/");
  });
});
