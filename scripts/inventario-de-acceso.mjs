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
import { analizar, archivosQueGuardan, invocacionesPorArchivo } from "./inventario/analizar.mjs";
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
  // Las dos preguntas resueltas sobre el AST. Antes se hacían con una expresión
  // regular sobre el texto del archivo entero, y mentían en LAS DOS direcciones:
  // un comentario que nombra un guardia salía «autoriza», y un `/g` con
  // `lastIndex` sucio dentro de un `filter` hacía que el segundo llamador y los
  // siguientes se midieran a partir de media lectura.
  const invocaciones = invocacionesPorArchivo(fuentes);
  const guardan = archivosQueGuardan(fuentes);
  console.log(`${objetivo.length} operaciones que dependen del llamador\n`);
  let pendientes = 0;
  for (const op of objetivo) {
    const llamadores = TODOS.filter(
      (f) => f !== op.archivo && (invocaciones.get(f)?.has(op.nombre) ?? false)
    );
    const guardados = llamadores.filter((f) => guardan.has(f));
    const ok = llamadores.length > 0 && guardados.length === llamadores.length;
    if (!ok) pendientes++;
    console.log(`  ${ok ? "OK   " : "MIRAR"} ${op.archivo} ${op.nombre}()`);
    for (const f of llamadores) console.log(`         ${guardan.has(f) ? "✓" : "✗"} ${f}`);
    if (!llamadores.length) console.log(`         (ningún llamador fuera de su propio archivo)`);
  }
  console.log(`\n  ${pendientes} necesitan juicio humano. Las conclusiones del 2026-08-31 están`);
  console.log(`  en docs/arquitectura/inventario-de-acceso.md — este modo dice a quién mirar,`);
  console.log(`  no si está bien.`);
  console.log(`\n  Y un ✗ NO significa «no autoriza»: significa «no llama a un guardia».`);
  console.log(`  Una página que llama a un servicio que LANZA un error de acceso y lo`);
  console.log(`  convierte en notFound() autoriza, y aquí sale ✗. Medido el 2026-10-04 en`);
  console.log(`  app/plots/[id]/page.tsx, app/field-sessions/[id]/page.tsx y`);
  console.log(`  app/lots/[id]/page.tsx. Seguir la llamada hasta el servicio es el escalón 2`);
  console.log(`  de PENDING_IMPLEMENTATIONS/007, que no está hecho.`);
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
