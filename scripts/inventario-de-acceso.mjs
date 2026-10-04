#!/usr/bin/env node
/**
 * Inventario de acceso a datos, por operación y no por archivo.
 *
 * Lo pidió la revisión que rechazó el plan del `AuthzContext`: «sustituir la
 * unidad *archivo* por *operación/camino de acceso*». 51 archivos no son 51
 * decisiones de acceso.
 *
 * Para cada función exportada que alcanza la base, registra: qué modelos toca,
 * si recibe un principal, qué guardia invoca, y si delega en otra función que
 * guarda. Con eso se puede decidir —con datos, no con impresiones— si hace
 * falta algo más fuerte que la convención actual.
 *
 * **Esto es sólo el CLI.** El detector vive en `scripts/inventario/analizar.mjs`,
 * puro y sin `fs`, para que un guardia pueda llamarlo con entrada hostil; la
 * lista de modelos sale de `scripts/inventario/esquema.mjs`. La razón está en la
 * cabecera de `analizar.mjs`.
 *
 * **Lo que NO hace, y es el límite de siempre:** reconoce *formas escritas*, no
 * propiedades. Por eso la salida separa lo que sabe de lo que no, en vez de dar
 * un número único.
 *
 * Uso: node scripts/inventario-de-acceso.mjs [--json] [--llamadores]
 *
 * `--llamadores` resuelve, para cada operación que no recibe principal, quién
 * la llama y si ese llamador autoriza. Sin eso, «depende del llamador» es una
 * categoría donde las dudas se acumulan sin que nadie las mire.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { analizar, unidadesQueLlaman } from "./inventario/analizar.mjs";
import { modelosDelEsquema } from "./inventario/esquema.mjs";

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

const TODOS = [...archivos("app"), ...archivos("lib")];
const fuentes = new Map(TODOS.map((f) => [f, readFileSync(join(RAIZ, f), "utf8")]));
const modelos = modelosDelEsquema(readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8"));
const filas = analizar(fuentes, modelos);

if (process.argv.includes("--llamadores")) {
  const objetivo = filas.filter((f) => f.clase === "depende del llamador (verificar a mano)");
  // **Responde por UNIDAD, no por archivo.** Antes la pregunta era «¿este
  // archivo autoriza?», con una expresión regular sobre su texto entero, y eso
  // mentía en LAS DOS direcciones: un comentario que nombra un guardia salía
  // «autoriza», y un `/g` con `lastIndex` sucio dentro de un `filter` medía el
  // segundo llamador a partir de media lectura. Pero el defecto de fondo era
  // otro: que el archivo tenga un guardia **no** significa que lo tenga el
  // camino. Medido el 2026-10-04, me hizo escribir dos razones falsas en la
  // allowlist: `floracion.ts` llama a `ubicacionesEmparentadas` desde
  // `floracionesDeLaParcela`, que no autoriza — su `requireLotAccess` vive en
  // `registrarFloracion`, otro camino.
  console.log(`${objetivo.length} operaciones que dependen del llamador\n`);
  let pendientes = 0;
  for (const op of objetivo) {
    const caminos = unidadesQueLlaman(fuentes, op.nombre).filter(
      (c) => !(c.archivo === op.archivo && c.unidad === op.nombre)
    );
    const ok = caminos.length > 0 && caminos.every((c) => c.guarda);
    if (!ok) pendientes++;
    console.log(`  ${ok ? "OK   " : "MIRAR"} ${op.archivo} ${op.nombre}()`);
    for (const c of caminos) console.log(`         ${c.guarda ? "✓" : "✗"} ${c.archivo}  →  ${c.unidad}()`);
    if (!caminos.length) console.log(`         (ninguna unidad la llama)`);
  }
  console.log(`\n  ${pendientes} necesitan juicio humano. Las conclusiones del 2026-08-31 están`);
  console.log(`  en docs/arquitectura/inventario-de-acceso.md — este modo dice a quién mirar,`);
  console.log(`  no si está bien.`);
  console.log(`\n  Un ✗ NO significa «no autoriza»: significa «esa unidad no llama a un`);
  console.log(`  guardia de la convención». Hay DOS mecanismos que esto no ve, los dos`);
  console.log(`  medidos el 2026-10-04:`);
  console.log(`   · una página que llama a un servicio que LANZA un error de acceso y lo`);
  console.log(`     convierte en notFound() — app/plots/[id]/page.tsx,`);
  console.log(`     app/field-sessions/[id]/page.tsx, app/plots/[id]/manejo/*;`);
  console.log(`   · un guardia en español: exigePoderAnotar, exigeReportarEnJornada y`);
  console.log(`     compañía. Hay 50 funciones «exige*» contra 18 «require*(Access|...)»,`);
  console.log(`     pero la mayoría de las 50 son VALIDADORES (exigeFecha, exigeNombre),`);
  console.log(`     así que meterlas en la convención marcaría «guardia directo» de 396 a`);
  console.log(`     432 por la fuerza de un validador de fechas. Es una decisión, no una`);
  console.log(`     tarea.`);
  console.log(`  Y un ✗ tampoco cierra el camino: puede que lo autorice el llamador DEL`);
  console.log(`  llamador. Seguir la cadena es el escalón 2 de PENDING_IMPLEMENTATIONS/007.`);
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
