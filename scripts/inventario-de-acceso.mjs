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
 * Uso: node scripts/inventario-de-acceso.mjs [--json]
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
const MODELOS = /\b(?:prisma|aiPrisma|tx|client)\.(\w+)\.(findMany|findFirst|findUnique|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\b/g;

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
function operaciones(archivo, src) {
  const decl = /^(?:export )?(?:async )?(?:function|const) (\w+)/gm;
  const todas = [...src.matchAll(decl)];
  return todas
    .map((m, i) => {
      if (!/^export /.test(m[0])) return null;
      const ini = m.index ?? 0;
      const fin = i + 1 < todas.length ? todas[i + 1].index : src.length;
      return { archivo, nombre: m[1], cuerpo: src.slice(ini, fin) };
    })
    .filter(Boolean);
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
const CUALQUIER_FN = /^(?:export )?(?:async )?(?:function|const) (\w+)/gm;
const guardanDirecto = new Set();
for (const [archivo, src] of fuentes) {
  const decl = [...src.matchAll(CUALQUIER_FN)];
  for (let i = 0; i < decl.length; i++) {
    const ini = decl[i].index ?? 0;
    const fin = i + 1 < decl.length ? decl[i + 1].index : src.length;
    if (GUARDIAS.test(src.slice(ini, fin))) guardanDirecto.add(decl[i][1]);
    GUARDIAS.lastIndex = 0;
  }
}

const filas = ops
  .map((o) => {
    const modelos = [...new Set([...o.cuerpo.matchAll(MODELOS)].map((m) => m[1]))];
    if (modelos.length === 0) return null;
    const propios = [...new Set((o.cuerpo.match(GUARDIAS) ?? []).map((g) => g.replace(/\s*\($/, "")))];
    const locales = [...guardanDirecto].filter(
      (n) => n !== o.nombre && new RegExp(`\\b${n}\\s*\\(`).test(o.cuerpo)
    );
    const guardias = [...new Set([...propios, ...locales])];
    const principal = /\buserAccountId\b/.test(o.cuerpo);
    // Un salto: ¿llama a alguna función que sí guarda?
    const transitivo = [...guardanDirecto].filter(
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
    const preSesion = /actions\/auth/.test(o.archivo);
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

if (process.argv.includes("--json")) {
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
