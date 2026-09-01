#!/usr/bin/env node
/**
 * Inventario de acceso a datos, por operación y no por archivo.
 *
 * Lo pidió la revisión que rechazó el plan del `AuthzContext`: «sustituir la
 * unidad *archivo* por *operación/camino de acceso*». 51 archivos no son 51
 * decisiones de acceso — hay 375 expresiones `prisma.*` repartidas entre ellos.
 *
 * Para cada función exportada que alcanza la base, registra: qué modelos toca,
 * si recibe un principal, qué guardia invoca, y si delega en otra función que
 * guarda. Con eso se puede decidir —con datos, no con impresiones— si hace
 * falta algo más fuerte que la convención actual.
 *
 * **Lo que NO hace, y es el límite de siempre:** reconoce *formas escritas*, no
 * propiedades. Un guardia con el permiso equivocado se cuenta como guardia; un
 * acotado por construcción que filtre por asignaciones se ve como «sin
 * guardia». Por eso la salida separa lo que sabe de lo que no, en vez de dar un
 * número único.
 *
 * Uso: node scripts/inventario-de-acceso.mjs [--json] [--llamadores]
 *
 * `--llamadores` resuelve, para cada operación que no recibe principal, quién
 * la llama y si ese llamador autoriza. Sin eso, «depende del llamador» es una
 * categoría donde las dudas se acumulan sin que nadie las mire.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const IGNORA = /node_modules|\.next|generated|\.git/;

function archivos(dir, out = []) {
  for (const e of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${e}`;
    if (IGNORA.test(rel)) continue;
    if (statSync(join(RAIZ, rel)).isDirectory()) archivos(rel, out);
    else if (/\.tsx?$/.test(rel)) out.push(rel);
  }
  return out;
}

const GUARDIAS = /\b(require[A-Z]\w*(?:Access|Admin|Override)|can|resolvedPermissionKeys|permissionKeysAnywhere)\s*\(/g;
/**
 * Los métodos se enumeran, y por eso hay que enumerarlos **enteros**.
 *
 * La primera versión listaba `findUnique` con `\b` detrás, y `findUniqueOrThrow`
 * no tiene frontera de palabra ahí: 13 archivos usaban esa variante y sus
 * operaciones **desaparecían del inventario**, no quedaban «sin clasificar».
 * `app/actions/checkout.ts` y `app/actions/bookings.ts` salían con cero
 * operaciones teniendo una consulta cada uno. El sufijo va antes del `\b`.
 *
 * El SQL crudo no tiene modelo que capturar —`prisma.$queryRaw` no lleva
 * `.modelo.`— y es justo el que más importa ver, porque se salta la capa de
 * modelos entera. Se registra con el modelo `SQL-crudo` para que exista como
 * operación y haya que explicarla como cualquier otra.
 */
const METODOS =
  "findMany|findFirstOrThrow|findFirst|findUniqueOrThrow|findUnique|createManyAndReturn|createMany|create|updateManyAndReturn|updateMany|update|upsert|deleteMany|delete|count|aggregate|groupBy";
const MODELOS = new RegExp(
  // El cliente puede no ser un identificador. `lib/audit.ts` escribe
  // `(tx ?? prisma).auditEvent.create(...)`, y un nombre suelto no lo ve: el
  // archivo entero salía con cero operaciones. Se acepta también un `)`.
  // Medido: en todo el árbol hay **una** coincidencia de `).modelo.metodo(`,
  // y es justo esa. Un falso positivo aquí sólo obliga a explicar de más;
  // un falso negativo es silencio, que es la dirección peligrosa.
  String.raw`(?:\b(?:prisma|aiPrisma|tx|client)|\))\.(\w+)\.(?:${METODOS})\b`,
  "g"
);
const CRUDO = /\b(?:prisma|aiPrisma|tx|client)\.\$(?:query|execute)Raw(?:Unsafe)?\b/g;

const TODOS = [...archivos("app"), ...archivos("lib")];
const fuentes = new Map(TODOS.map((f) => [f, readFileSync(join(RAIZ, f), "utf8")]));

/**
 * Trocea un archivo en funciones exportadas y su cuerpo.
 *
 * El corte va hasta la siguiente declaración de nivel superior — exportada o
 * no. Una primera versión cortaba en el siguiente `export`, y por eso atribuía
 * a `slugify()` las consultas del `uniqueSlug()` **no exportado** que vive
 * justo debajo: la función es pura y aparecía tocando la base. Reconocer la
 * forma «siguiente export» en vez del final real de la función es el mismo
 * error que este inventario existe para no cometer.
 */
function declaraciones(archivo, src) {
  const decl = /^(?:export )?(?:async )?(?:function|const) (\w+)/gm;
  const todas = [...src.matchAll(decl)];
  return todas.map((m, i) => ({
    archivo,
    nombre: m[1],
    exportada: /^export /.test(m[0]),
    cuerpo: src.slice(m.index ?? 0, i + 1 < todas.length ? todas[i + 1].index : src.length),
  }));
}

/**
 * Una consulta delegada a un ayudante **no exportado** desaparecía entera.
 *
 * Lo encontró la revisión independiente del 2026-08-31 y se comprobó por
 * mutación: una función exportada que delega toda su consulta en un ayudante
 * privado del mismo archivo no aparecía en el inventario —ni ella ni el
 * ayudante—, `modelos.length === 0`, y la compuerta seguía en verde. Es el
 * mismo modo de fallo que `findUniqueOrThrow`, que se creía cerrado: descartar
 * en silencio.
 *
 * Ahora el cuerpo de una operación exportada **absorbe** el de los ayudantes
 * privados que llama, transitivamente. Y un ayudante privado con acceso al que
 * no llega ninguna exportada se emite como operación propia, para que tampoco
 * ése pueda esconderse.
 */
function operaciones(archivo, src) {
  const todas = declaraciones(archivo, src);
  const privadas = new Map(todas.filter((d) => !d.exportada).map((d) => [d.nombre, d]));

  const absorber = (d) => {
    let cuerpo = d.cuerpo;
    const alcanza = new Set([d.nombre]);
    for (let cambio = true; cambio; ) {
      cambio = false;
      for (const [nombre, ayudante] of privadas) {
        if (alcanza.has(nombre)) continue;
        if (!new RegExp(`\\b${nombre}\\s*\\(`).test(cuerpo)) continue;
        cuerpo += "\n" + ayudante.cuerpo;
        alcanza.add(nombre);
        cambio = true;
      }
    }
    return { archivo, nombre: d.nombre, cuerpo, alcanza };
  };

  const exportadas = todas.filter((d) => d.exportada).map(absorber);
  const alcanzadas = new Set(exportadas.flatMap((o) => [...o.alcanza]));
  const huerfanas = todas
    .filter((d) => !d.exportada && !alcanzadas.has(d.nombre))
    .map(absorber);

  return [...exportadas, ...huerfanas].map(({ alcanza, ...o }) => o);
}

const ops = TODOS.flatMap((f) => operaciones(f, fuentes.get(f) ?? ""));

/**
 * Qué funciones guardan de verdad — exportadas **o no**.
 *
 * Una versión anterior reconocía `require\w*(Access|Admin|Override)` por el
 * nombre, y se perdía `requireManagePermission()`: un guardia local, no
 * exportado, que llama a `can()` y protege las siete operaciones de
 * `lib/sensory/calibration.ts`. Las daba por «sin guardia visible».
 *
 * Ahora se resuelve la propiedad: se recogen **todas** las funciones de cada
 * archivo cuyo cuerpo invoque el servicio de autorización, y llamar a una de
 * ellas cuenta como guardar. Reconocer un nombre no es reconocer un guardia.
 */
/**
 * **Por archivo, no global.** Era un `Set` de nombres sueltos de todo el árbol,
 * así que una función llamada como un guardia de cualquier otro archivo
 * promovía la operación a «guardia directo» sin que nada resolviera el símbolo.
 * Lo señaló la revisión independiente del 2026-08-31: es justo la transición
 * —salir del cajón revisado— que el detector de podredumbre da por buena.
 *
 * Un guardia local guarda en **su** archivo. Los que cruzan archivos siguen
 * reconociéndose por `GUARDIAS`, que es una convención de nombres deliberada y
 * documentada abajo, no una resolución de símbolos.
 */
const CUALQUIER_FN = /^(?:export )?(?:async )?(?:function|const) (\w+)/gm;

/**
 * Qué nombres entran en cada archivo por un `import`. Un guardia de otro
 * archivo cuenta **si está importado aquí**; si no, es una homonimia y no
 * guarda nada. Sin esto, limitarse al propio archivo degradaba a
 * `getLotReport()`, que delega en `getLotDetail()` importado de `./lots`.
 */
const importados = new Map();
for (const [archivo, src] of fuentes) {
  const nombres = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const parte of m[1].split(",")) {
      const nombre = parte.trim().split(/\s+as\s+/).pop()?.trim();
      if (nombre) nombres.add(nombre);
    }
  }
  importados.set(archivo, nombres);
}

const guardanPorArchivo = new Map();
for (const [archivo, src] of fuentes) {
  const decl = [...src.matchAll(CUALQUIER_FN)];
  const aqui = new Set();
  guardanPorArchivo.set(archivo, aqui);
  for (let i = 0; i < decl.length; i++) {
    const ini = decl[i].index ?? 0;
    const fin = i + 1 < decl.length ? decl[i + 1].index : src.length;
    if (GUARDIAS.test(src.slice(ini, fin))) aqui.add(decl[i][1]);
    GUARDIAS.lastIndex = 0;
  }
}

/**
 * Los guardias visibles desde un archivo: los que declara y los que importa.
 * Nunca los homónimos de un archivo con el que no tiene relación.
 */
const guardanEnAlgunSitio = new Set([...guardanPorArchivo.values()].flatMap((s) => [...s]));
function guardanVisiblesEn(archivo) {
  const propios = guardanPorArchivo.get(archivo) ?? new Set();
  const traidos = [...(importados.get(archivo) ?? [])].filter((n) => guardanEnAlgunSitio.has(n));
  return new Set([...propios, ...traidos]);
}

const filas = ops
  .map((o) => {
    const modelos = [...new Set([...o.cuerpo.matchAll(MODELOS)].map((m) => m[1]))];
    if (CRUDO.test(o.cuerpo)) modelos.push("SQL-crudo");
    CRUDO.lastIndex = 0;
    if (modelos.length === 0) return null;
    const propios = [...new Set((o.cuerpo.match(GUARDIAS) ?? []).map((g) => g.replace(/\s*\($/, "")))];
    const locales = [...guardanVisiblesEn(o.archivo)].filter(
      (n) => n !== o.nombre && new RegExp(`\\b${n}\\s*\\(`).test(o.cuerpo)
    );
    const guardias = [...new Set([...propios, ...locales])];
    const principal = /\buserAccountId\b/.test(o.cuerpo);
    // Un salto: ¿llama a alguna función que sí guarda?
    const transitivo = [...guardanVisiblesEn(o.archivo)].filter(
      (n) => n !== o.nombre && new RegExp(`\\b${n}\\s*\\(`).test(o.cuerpo)
    );
    /**
     * Acotado por construcción: la consulta filtra por el propio principal, así
     * que no puede devolver lo ajeno. Es autorización, y de la más fuerte —
     * no hay puerta que saltarse porque no hay puerta. `getPartnerProjects`
     * filtra `assignment` por `userAccountId` y luego pide sólo esos ids.
     */
    const acotado = /where:\s*\{[^}]*userAccountId/s.test(o.cuerpo ?? "") ||
      /userAccountId,\s*$/m.test(o.cuerpo ?? "");
    /**
     * Resolutor de visibilidad: `resolveLotVisibility(userAccountId)` calcula
     * el alcance a partir de las asignaciones y el `where` se construye desde
     * él, así que la consulta no puede devolver filas de fuera. Es acotado por
     * construcción, sólo que a través de un resolutor — invisible tanto al
     * detector de guardias como al de `where: { userAccountId }`.
     */
    const resolutor = /\bresolve\w*Visibility\s*\(/.test(o.cuerpo ?? "");
    /**
     * Sin principal y sin guardia: la autorización, si existe, la hace quien
     * la llama. `listPeopleForAdmin()` no recibe usuario, y su única página
     * llama antes a `requirePermissionAdmin`. Verificarlas exige mirar a los
     * llamadores, cosa que este script no hace: los separa para que alguien lo
     * haga, en vez de mezclarlas con las de verdad desconocidas.
     */
    const dependeDelLlamador = !o.cuerpo?.includes("userAccountId");
    const publica = /discover\/service/.test(o.archivo);
    // `lib/auth/config.ts` es el flujo de autenticación en sí: `authConfig` y
    // `providers` corren **antes** de que exista sesión, así que no hay
    // principal contra el que autorizar. Estaba escrito a mano en el
    // inventario de excepciones; reconocer la propiedad es mejor que anotarla.
    const preSesion = /actions\/auth|lib\/auth\/config/.test(o.archivo);
    const firma = /webhooks/.test(o.archivo);

    let clase;
    if (guardias.length) clase = "guardia directo";
    else if (transitivo.length) clase = "guardia transitivo";
    else if (acotado || resolutor) clase = "acotado por construcción";
    else if (publica) clase = "público por diseño";
    else if (preSesion) clase = "previo a la sesión";
    else if (firma) clase = "firma";
    else if (principal) clase = "recibe principal, sin guardia visible";
    else if (dependeDelLlamador) clase = "depende del llamador (verificar a mano)";
    else clase = "SIN CLASIFICAR";
    return { ...o, cuerpo: undefined, modelos, guardias, principal, transitivo, acotado: acotado || resolutor, clase };
  })
  .filter(Boolean);

if (process.argv.includes("--llamadores")) {
  const objetivo = filas.filter((f) => f.clase === "depende del llamador (verificar a mano)");
  console.log(`${objetivo.length} operaciones que dependen del llamador\n`);
  let pendientes = 0;
  for (const op of objetivo) {
    const llamadores = TODOS.filter(
      (f) => f !== op.archivo && new RegExp(`\\b${op.nombre}\\s*\\(`).test(fuentes.get(f) ?? "")
    );
    const guardados = llamadores.filter((f) => GUARDIAS.test(fuentes.get(f) ?? ""));
    GUARDIAS.lastIndex = 0;
    const ok = llamadores.length > 0 && guardados.length === llamadores.length;
    if (!ok) pendientes++;
    console.log(`  ${ok ? "OK   " : "MIRAR"} ${op.archivo} ${op.nombre}()`);
    for (const f of llamadores) {
      const g = GUARDIAS.test(fuentes.get(f) ?? "");
      GUARDIAS.lastIndex = 0;
      console.log(`         ${g ? "✓" : "✗"} ${f}`);
    }
    if (!llamadores.length) console.log(`         (ningún llamador fuera de su propio archivo)`);
  }
  console.log(`\n  ${pendientes} necesitan juicio humano. Las conclusiones del 2026-08-31 están`);
  console.log(`  en docs/arquitectura/inventario-de-acceso.md — este modo dice a quién mirar,`);
  console.log(`  no si está bien.`);
} else if (process.argv.includes("--json")) {
  console.log(JSON.stringify(filas, null, 2));
} else {
  const porClase = {};
  for (const f of filas) (porClase[f.clase] ??= []).push(f);
  console.log(`Inventario de acceso — ${filas.length} operaciones que tocan la base, en ${new Set(filas.map((f) => f.archivo)).size} archivos\n`);
  for (const [clase, xs] of Object.entries(porClase).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(xs.length).padStart(3)}  ${clase}`);
  }
  const dudosas = [...(porClase["SIN CLASIFICAR"] ?? []), ...(porClase["recibe principal, sin guardia visible"] ?? []), ...(porClase["depende del llamador (verificar a mano)"] ?? [])];
  if (dudosas.length) {
    console.log(`\n  Las que ninguna regla explica, y hay que mirar a mano:`);
    for (const f of dudosas) console.log(`    ${f.archivo}  ${f.nombre}()  [${f.modelos.slice(0, 4).join(", ")}]`);
  }
  console.log(`\nEsto reconoce formas escritas, no propiedades: un guardia con el permiso`);
  console.log(`equivocado cuenta como guardia, y un acotado por construcción se ve como`);
  console.log(`«sin guardia». Sirve para decidir dónde mirar, no para dar por bueno nada.`);
}
