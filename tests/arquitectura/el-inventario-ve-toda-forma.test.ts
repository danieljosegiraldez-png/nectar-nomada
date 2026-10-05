/**
 * **El inventario ve una operación en cualquier forma sintáctica, y no ve lo que
 * no es programa.** `PENDING_IMPLEMENTATIONS/007`, el flip-test que decide.
 *
 * **Por qué existe.** El detector reconocía *formas escritas*, y cada vez que
 * falló, falló igual: descarte silencioso o identidad falsa. Medido el
 * 2026-10-04 contra `origin/main` = `966ada98d1`, sobre la línea base de 618
 * operaciones en 168 archivos con las tres compuertas en verde.
 *
 * **Lo que esto hace y un corpus no puede.** Llama al detector con entrada
 * hostil. Una prueba que recorre el árbol real sólo ejerce lo que el árbol
 * contiene hoy, así que no puede ser guardia de una transformación que los datos
 * de hoy no disparan. Por eso el detector se partió en un módulo puro; si eso
 * incomoda, la incomodidad es el aviso.
 *
 * **Los tres grupos de abajo NO valen lo mismo, y se separan a propósito** para
 * que nadie los cuente dos veces:
 *
 * 1. *vivo* — formas que el árbol usa hoy y el detector de texto no veía.
 * 2. *red de regresión* — formas que el detector de texto SÍ veía. Pasan antes y
 *    después; existen para que la reescritura no pierda cobertura, que es la
 *    dirección peligrosa.
 * 3. *red para mañana* — formas con **cero** apariciones hoy, medidas. No son
 *    guardias de ningún camino vivo, y decirlo aquí es lo que impide contarlas
 *    como si lo fueran.
 *
 * Hermético: funciones puras sobre cadenas, sin base y sin red.
 */
import { describe, expect, it } from "vitest";
import {
  analizar,
  archivosQueGuardan,
  invocacionesPorArchivo,
  unidadesQueLlaman,
  type Fila,
} from "../../scripts/inventario/analizar.mjs";

/** Lista corta y a mano: lo que se prueba es el detector, no el esquema. */
const MODELOS = new Set(["location", "auditEvent", "userAccount", "lot"]);

const ver = (src: string): Fila[] => analizar(new Map([["lib/x.ts", src]]), MODELOS);

/** Exige exactamente una operación y la devuelve, para no leer `f[0]` a ciegas. */
const sola = (src: string): Fila => {
  const f = ver(src);
  expect(f.map((x) => x.nombre), "se esperaba UNA operación").toHaveLength(1);
  return f[0]!;
};

describe("VIVO · formas que el árbol usa hoy y el detector de texto no veía", () => {
  /**
   * **El caso de las seis invisibles.** La enumeración era
   * `prisma|aiPrisma|tx|client`, y con cero modelos la operación se descartaba
   * **entera**: no quedaba «sin clasificar», no existía. Medido el 2026-10-04:
   * seis operaciones en cinco archivos sólo porque su cliente se llama `db`
   * —`ubicacionesEmparentadas`, `personasPermitidas`, `getGate0Status`,
   * `parcelaDeOrigen`, `intervencionesVigentes`, `nombreLibreBajo`— y **cuatro
   * de las seis** caen en «depende del llamador», la clase que existe para que
   * alguien las mire a mano.
   */
  it("un receptor que no se llama prisma, tx ni client", () => {
    const f = sola(`export async function emparentadas(id: string, db: Cliente) {
      return db.location.findMany({ where: { id } });
    }`);
    expect(f.modelos).toContain("location");
  });

  it("y el mismo receptor para el SQL crudo", () => {
    const f = sola(`export async function bloquear(db: Cliente, id: string) {
      await db.$queryRaw\`SELECT id FROM traceability.lot WHERE id = \${id}::uuid FOR UPDATE\`;
    }`);
    expect(f.modelos).toContain("SQL-crudo");
  });
});

describe("RED DE REGRESIÓN · formas que el detector de texto ya veía", () => {
  it("una función flecha exportada que devuelve otra", () => {
    const f = sola(`export const abrir = (userAccountId: string, c: Cliente) => async (tx: Tx) => {
      await tx.auditEvent.create({ data: { actorUserAccountId: userAccountId } });
    };`);
    expect(f.modelos).toContain("auditEvent");
  });

  /** Ya costó el archivo `lib/audit.ts` entero: salía con cero operaciones. */
  it("el cliente entre paréntesis", () => {
    const f = sola(`export async function sellar(tx?: Tx) {
      await (tx ?? prisma).auditEvent.create({ data: {} });
    }`);
    expect(f.modelos).toContain("auditEvent");
  });

  /**
   * **Las 17 llamadas de SQL crudo del árbol son tagged templates y NINGUNA es
   * una `CallExpression`**, medido el 2026-10-04 imprimiendo el tipo de nodo de
   * cada forma. Un recorrido del AST que sólo mire `n.expression` las pierde
   * **todas** — o sea, comete el descarte silencioso que este cambio existe para
   * cerrar. Por eso esto es red de regresión y no un adorno.
   */
  it("el SQL crudo como tagged template, que no es una llamada", () => {
    const f = sola(`export async function bloquear(tx: Tx, id: string) {
      await tx.$queryRaw\`SELECT id FROM traceability.lot WHERE id = \${id}::uuid FOR UPDATE\`;
    }`);
    expect(f.modelos).toContain("SQL-crudo");
  });

  /**
   * En `app/my-nectar/page.tsx` la declaración anterior era
   * `export const dynamic = "force-dynamic"`, que absorbía el resto del archivo:
   * tres consultas se inventariaban bajo el nombre de una constante de
   * configuración. Arreglado el 2026-08-31 **para la forma con nombre y en
   * columna 0**, que es la que el árbol usa (medido: 111 de ésas, 0 sin nombre).
   */
  it("export default con nombre no se lo queda la constante de al lado", () => {
    const nombres = ver(
      'export const dynamic = "force-dynamic";\n' +
        "export default async function Pagina() { return prisma.lot.findMany({}); }\n"
    ).map((x) => x.nombre);
    expect(nombres).not.toContain("dynamic");
    expect(nombres).toContain("Pagina");
  });
});

describe("RED PARA MAÑANA · formas con cero apariciones hoy, medidas", () => {
  /**
   * **Cero hoy**, medido el 2026-10-04: 160 declaraciones `class` en `app/` y
   * `lib/`, **3** métodos entre todas —las demás son clases de error sin
   * cuerpo— y **ninguno** toca la base. Con los dos controles: el detector de
   * acceso encuentra `prisma.lot.findMany` y no encuentra `b.c.map`.
   *
   * No es guardia de ningún camino vivo. Es la red del día que alguien escriba
   * un repositorio con métodos, y entonces el inventario no puede quedarse
   * callado.
   */
  it("un método de clase", () => {
    expect(
      ver(`export class Repo {
      async listar(cliente: Cliente) { return cliente.lot.findMany({}); }
    }`).map((x) => x.nombre)
    ).toContain("Repo.listar");
  });

  /**
   * **Cero hoy**: 0 declaraciones exportadas fuera de la columna 0, contra
   * **1730** en columna 0. El troceo por texto usa `^` con `m`, así que una
   * declaración indentada **no existe** para él — descarte silencioso puro.
   */
  it("una declaración exportada que no empieza en la columna 0", () => {
    const f = sola("  export async function listar(db: Cliente) { return db.lot.findMany({}); }\n");
    expect(f.nombre).toBe("listar");
  });

  /**
   * **Cero hoy**: 0 `export default` sin nombre, contra 111 con nombre. Y es de
   * la familia peor —identidad falsa, no hueco—: medido, la consulta se
   * atribuye a `dynamic`, una constante de configuración, y **cuadra en todos
   * los recuentos**. Un cambio inocuo al lado la traslada a otra entrada de la
   * allowlist sin que nada avise.
   */
  it("un export default sin nombre no se atribuye a la constante de al lado", () => {
    const nombres = ver(
      'export const dynamic = "force-dynamic";\n' +
        "export default async function () { return prisma.lot.findMany({}); }\n"
    ).map((x) => x.nombre);
    expect(nombres).not.toContain("dynamic");
  });
});

describe("RED PARA MAÑANA · envolturas y unidades que la revisión de Codex reprodujo", () => {
  /**
   * **Las cuatro que la revisión independiente del 2026-10-04 reprodujo**, y que
   * el detector de TEXTO sí veía. Cero apariciones en el árbol —medido, 0 en 590
   * archivos, con el control del detector al lado— pero cerrarlas cuesta cuatro
   * líneas (`pelar`) y dejarlas abiertas es la misma no-convergencia que esta
   * reescritura existe para acabar.
   */
  it.each([
    ["entre paréntesis", "export function f() { return (prisma.lot.findMany)(); }"],
    ["con un as", "export function f() { return (prisma.lot.findMany as Any)(); }"],
    ["con el ! de no-nulo", "export function f() { return prisma.lot.findMany!(); }"],
    ["con el receptor entre paréntesis", "export function f() { return (prisma.lot).findMany(); }"],
  ])("una llamada %s", (_etiqueta, fuente) => {
    expect(sola(fuente).modelos).toContain("lot");
  });

  /**
   * **Una sentencia suelta de nivel superior corre al importar el módulo**, así
   * que es un camino de acceso. El texto la atribuía a la declaración anterior
   * —identidad falsa— y la primera versión de este recorrido la perdía entera,
   * que es peor: silencio.
   */
  it("una consulta suelta de nivel superior no desaparece", () => {
    const f = sola('export const dynamic = "force-dynamic";\nprisma.lot.findMany({});\n');
    expect(f.nombre).toBe("(nivel superior)");
    expect(f.modelos).toContain("lot");
  });

  it("un export default que es una flecha", () => {
    const f = sola('export const dynamic = "force-dynamic";\nexport default () => prisma.lot.findMany({});\n');
    expect(f.nombre).toBe("default");
  });

  it.each([
    ["un getter", "export class C { get filas() { return prisma.lot.findMany({}); } }", "C.filas"],
    ["un constructor", "export class C { constructor() { prisma.lot.findMany({}); } }", "C.constructor"],
    ["una clase anónima", "export default class { m() { return prisma.lot.findMany({}); } }", "(clase anónima).m"],
  ])("%s de clase", (_etiqueta, fuente, esperado) => {
    expect(ver(fuente).map((x) => x.nombre)).toContain(esperado);
  });

  it("una exportación desestructurada se identifica por lo que liga", () => {
    const f = sola("export const { filas } = { filas: prisma.lot.findMany({}) };");
    expect(f.nombre).toBe("filas");
  });
});

describe("EL LÍMITE de «sólo sintaxis», fijado a propósito", () => {
  /**
   * **Esto NO se cubre, y la prueba existe para que nadie lo suponga cubierto.**
   * Las tres formas piden seguir el VALOR, no la forma: eso es el escalón 2 de
   * `PENDING_IMPLEMENTATIONS/007` (comprobador de tipos), que es una decisión de
   * Daniel por su coste en CI. Medido el 2026-10-04: **cero apariciones** de las
   * tres en el árbol.
   *
   * Si algún día una de éstas aparece de verdad, esta prueba **falla** y obliga a
   * mirar — que es justo lo que se quiere, en vez de un hueco callado.
   */
  it.each([
    [".call sobre el método", "export function f() { return prisma.lot.findMany.call(prisma.lot); }"],
    ["el método por índice", 'export function f() { return prisma.lot["findMany"](); }'],
    ["un alias guardado en una variable", "export function f() { const g = prisma.lot.findMany; return g(); }"],
  ])("no ve %s", (_etiqueta, fuente) => {
    expect(ver(fuente)).toHaveLength(0);
  });
});

describe("y distingue guardar de llamar a quien guarda", () => {
  /** Dos unidades en el mismo archivo: una guarda, la otra la llama. */
  const ARCHIVO = `export async function guardaAqui(userAccountId: string) {
      await can(userAccountId, "view", "lot", "x");
    }
    export async function listar(userAccountId: string, db: Cliente) {
      await guardaAqui(userAccountId);
      return db.lot.findMany({});
    }
    export async function guardaEllaMisma(userAccountId: string, db: Cliente) {
      await can(userAccountId, "view", "lot", "x");
      return db.lot.findMany({});
    }`;

  const clase = (nombre: string) =>
    analizar(new Map([["lib/y.ts", ARCHIVO]]), MODELOS).find((f) => f.nombre === nombre)?.clase;

  /**
   * **La clase existía y no se asignaba NUNCA.** `locales` y `transitivo` eran la
   * misma expresión y `guardias` su unión, así que `transitivo.length > 0`
   * implicaba `guardias.length > 0` y la rama era inalcanzable **por
   * construcción**. Medido el 2026-10-04: `clase === "guardia transitivo"` salía
   * **0** de 618, y el flip —hacer la rama alcanzable— la llevaba a **66**. Esas
   * decenas de operaciones se reportaban «guardia directo», que dice algo
   * distinto de lo que ocurre: nadie llama ahí a un guardia.
   */
  it("llamar a quien guarda es «guardia transitivo», no «guardia directo»", () => {
    expect(clase("listar")).toBe("guardia transitivo");
  });

  /**
   * El control, y hace falta: un arreglo que mueva TODO a transitivo vaciaría
   * «guardia directo», y las dos lecturas se parecen en el recuento.
   */
  it("y llamar al servicio de autorización sigue siendo «guardia directo»", () => {
    expect(clase("guardaEllaMisma")).toBe("guardia directo");
  });
});

describe("y «este archivo autoriza» también se pregunta al árbol", () => {
  /**
   * **El defecto que esto cierra, medido el 2026-10-04.** `--llamadores`
   * preguntaba con `GUARDIAS.test(textoDelArchivo)`, y `app/lots/[id]/page.tsx`
   * salía «autoriza» por un **comentario** de su línea 520 que nombra
   * `requireLotAccess("view", …)`. Al pasar la pregunta al árbol, **14 marcas**
   * pasan de ✓ a ✗ y **ninguna** al revés, sobre 247 comunes; **diez** de las
   * catorce son ese archivo.
   */
  it("un archivo cuyo único guardia vive en un comentario NO autoriza", () => {
    const fuentes = new Map([
      ["app/p.tsx", `export default async function P(id: string) {
        // La autoriza requireLotAccess("view", id) en el servicio de abajo.
        return prisma.lot.findMany({ where: { id } });
      }`],
    ]);
    expect([...archivosQueGuardan(fuentes)]).toEqual([]);
  });

  it("y uno que lo llama de verdad, sí", () => {
    const fuentes = new Map([
      ["app/q.tsx", `export default async function Q(userAccountId: string, id: string) {
        await requireLotAccess(userAccountId, "view", id);
        return prisma.lot.findMany({ where: { id } });
      }`],
    ]);
    expect([...archivosQueGuardan(fuentes)]).toEqual(["app/q.tsx"]);
  });

  /**
   * **La prueba del `lastIndex`.** `GUARDIAS` llevaba `/g`, y el `filter` de
   * `--llamadores` reponía su `lastIndex` **después** del recorrido entero: a
   * partir del segundo archivo la búsqueda arrancaba a mitad de lectura. Medido:
   * **46 → 42** operaciones «necesitan juicio humano», y las cuatro que
   * cambiaban imprimían `MIRAR` encima de llamadores **todos en ✓**. Con tres
   * archivos que guardan, la respuesta tiene que ser **tres**, no uno.
   */
  it("tres archivos que autorizan son tres, no el primero", () => {
    const uno = `export async function f(userAccountId: string, id: string) {
      await requireLotAccess(userAccountId, "view", id);
      return prisma.lot.findMany({ where: { id } });
    }`;
    const fuentes = new Map([["lib/a.ts", uno], ["lib/b.ts", uno], ["lib/c.ts", uno]]);
    expect([...archivosQueGuardan(fuentes)].sort()).toEqual(["lib/a.ts", "lib/b.ts", "lib/c.ts"]);
  });

  /**
   * Buscar `\bnombre\s*\(` en el texto cuenta comentarios y cadenas como
   * llamadas, y de ahí salían llamadores que no llaman.
   */
  it("un nombre que sólo aparece en un comentario no es una invocación", () => {
    const fuentes = new Map([
      ["lib/d.ts", `export function g() {
        // antes esto hacía ubicacionesEmparentadas(id)
        return 1;
      }`],
    ]);
    expect(invocacionesPorArchivo(fuentes).get("lib/d.ts")?.has("ubicacionesEmparentadas")).toBe(false);
  });
});

describe("y «quién la llama» se responde por UNIDAD, no por archivo", () => {
  /**
   * **El defecto que esto cierra, y me lo encontró la revisión independiente del
   * 2026-10-04 en dos razones que YO había escrito en la allowlist.**
   * `archivosQueGuardan` contesta «¿este archivo autoriza?», y eso no es la
   * pregunta: `lib/traceability/floracion.ts` llama a `ubicacionesEmparentadas`
   * desde `floracionesDeLaParcela`, que **no** autoriza — el `requireLotAccess`
   * del archivo vive en `registrarFloracion`, que es otro camino. Con la
   * pregunta por archivo escribí «floracion.ts autoriza antes», que era falso.
   *
   * Medido el delta al cambiarla: `OK` 48 → 32 y `MIRAR` 51 → 67. El modo se
   * vuelve más estricto, que es la dirección correcta: saca trabajo a la luz en
   * vez de taparlo.
   */
  const ARCHIVO = `export async function autoriza(userAccountId: string, id: string) {
      await requireLotAccess(userAccountId, "view", id);
      return ayuda(id);
    }
    export async function noAutoriza(id: string) {
      return ayuda(id);
    }
    export function ayuda(id: string) { return id; }`;

  it("una unidad que llama sin guardia sale ✗ aunque su archivo tenga uno", () => {
    const caminos = unidadesQueLlaman(new Map([["lib/z.ts", ARCHIVO]]), "ayuda");
    expect(caminos.map((c) => `${c.unidad}:${c.guarda}`).sort()).toEqual([
      "autoriza:true",
      "noAutoriza:false",
    ]);
  });

  it("y el archivo entero sí diría que autoriza, que es justo el error", () => {
    expect([...archivosQueGuardan(new Map([["lib/z.ts", ARCHIVO]]))]).toEqual(["lib/z.ts"]);
  });
});

describe("y NO ve lo que no es programa", () => {
  /**
   * **VIVO.** El quinto caso de la ficha, del 2026-09-11. Medido el 2026-10-04
   * en main: **una** línea de comentario promovió **tres** operaciones a
   * «guardia directo» — la propia y dos que la llaman, porque el comentario
   * además registró a su función como guardia del archivo. Y el arreglo que se
   * le dio en su día fue reescribir el comentario, indistinguible de escribir
   * prosa para complacer a un regex.
   */
  it("un comentario que nombra un guardia no guarda nada", () => {
    const f = sola(`export async function abrir(userAccountId: string, db: Cliente) {
      // Autorización: la hace requireLotAccess() en la pantalla que abre la transacción.
      return db.location.findMany({ where: { nombre: userAccountId } });
    }`);
    expect(f.guardias).toEqual([]);
    expect(f.clase).not.toBe("guardia directo");
  });

  it("una consulta dentro de un comentario no es una operación", () => {
    expect(
      ver(`export function puro(a: number) {
      // antes esto hacía prisma.lot.findMany({})
      return a + 1;
    }`)
    ).toHaveLength(0);
  });

  /**
   * `lib/apiary/irregularidades.ts` tiene una función **sin un solo argumento**
   * que se clasificó «recibe principal» porque el comentario de la de abajo
   * decía «No recibe `userAccountId` y no autoriza».
   */
  it("un comentario que nombra userAccountId no hace que lo reciba", () => {
    const f = sola(`export async function ofrecidas(db: Cliente) {
      // No recibe userAccountId y no autoriza: eso lo hace su llamador.
      return db.lot.findMany({});
    }`);
    expect(f.principal).toBe(false);
  });
});
