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
import { analizar, type Fila } from "../../scripts/inventario/analizar.mjs";

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
