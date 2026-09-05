#!/usr/bin/env node
// Una sección archivada existe UNA vez, y en UN SOLO sitio.
//
// El 2026-08-31 dos sesiones archivaron la misma sección a la vez. Los dos
// commits la insertaron en posiciones distintas de SESSION_STATE_ARCHIVE.md,
// así que git no vio texto solapado, la fusión salió limpia, y el archivo quedó
// con la sección dos veces. Una fusión limpia no dice que el resultado sea
// correcto — sólo que git no encontró nada que le pareciera solapado.
//
// POR QUÉ ES UN SCRIPT Y NO SÓLO UN TEST. Hasta el 2026-09-05 esto vivía sólo
// en tests/archivo-de-estado.test.ts, que necesita vitest y por tanto `npm ci`.
// Ese mismo día se estrenó el carril ligero de CI para cambios de sólo
// documentación —el 57 % de las PR— y el carril NO corre vitest. Es decir: el
// guardia del archivo histórico dejaba de correr exactamente en los cambios que
// tocan el archivo histórico. Lo encontré archivando, veinte minutos después de
// estrenar el carril, y tuve que comprobar las tres propiedades a mano.
//
// Ahora las comprueba esto, que no importa nada y corre con el node del runner.
// El test sigue existiendo y llama a este script con fixtures: una definición,
// dos consumidores.
//
// Uso:
//   node scripts/check-archivo-de-estado.mjs [ruta-estado] [ruta-archivo]
// Salida 0 = bien. Salida 1 = alguna propiedad rota.

import { readFileSync } from "node:fs";

const ESTADO = process.argv[2] ?? "SESSION_STATE.md";
const ARCHIVO = process.argv[3] ?? "docs/SESSION_STATE_ARCHIVE.md";

/**
 * Lee los `###` de un fichero. `opcional` decide qué significa que no esté.
 *
 * **Por qué no basta con devolver `[]` siempre**, que es lo que hacía la primera
 * versión: entonces un estado ausente o mal nombrado dejaba las comprobaciones
 * 2 y 3 sin nada que mirar, el guardia salía 0, y el mensaje de éxito afirmaba
 * «ninguna compartida con el estado» sin haberlo comprobado. Reproducido:
 *
 *     node scripts/check-archivo-de-estado.mjs NO_EXISTE.md docs/…_ARCHIVE.md
 *     ✓ … 23 secciones, ninguna repetida, ninguna compartida con el estado…
 *     $? = 0
 *
 * Es la forma que la cabecera de arriba cita —la prueba de P-A que leyó una
 * línea ausente como una línea buena—, reaparecida en el guardia escrito para
 * evitarla. El histórico SÍ puede no existir todavía; el estado, nunca.
 */
function titulos(ruta, { opcional }) {
  let texto;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch (error) {
    if (opcional && error.code === "ENOENT") return [];
    // Cualquier otra cosa —el estado ausente, un permiso, un directorio— es un
    // fallo ruidoso. Un guardia que no puede leer lo que vigila no ha dicho
    // que esté sano: ha dicho que no miró.
    console.error(`✗ no se pudo leer ${ruta}: ${error.code ?? error.message}`);
    console.error(`  Un guardia que no lee lo que vigila no puede pronunciarse.`);
    process.exit(1);
  }
  return [...texto.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
}

const delEstado = () => titulos(ESTADO, { opcional: false });
const delArchivo = () => titulos(ARCHIVO, { opcional: true });

const problemas = [];

// 1. El histórico no repite ninguna sección.
{
  const vistos = new Set();
  const repetidos = [];
  for (const t of delArchivo()) {
    if (vistos.has(t)) repetidos.push(t);
    vistos.add(t);
  }
  // Un `Set`: una sección que aparece tres veces es UNA repetida, no dos. La
  // primera versión contaba copias sobrantes y listaba el mismo título dos
  // veces, así que quien leyera «2» buscaría dos títulos distintos.
  const repetidosUnicos = [...new Set(repetidos)];
  if (repetidosUnicos.length > 0) {
    problemas.push(
      `${ARCHIVO} tiene ${repetidosUnicos.length} sección(es) repetida(s). Suele ser una\n` +
        `  fusión limpia entre dos sesiones que archivaron lo mismo: git no ve solape\n` +
        `  y duplica. Deja una sola copia.\n` +
        repetidosUnicos.map((t) => `      ### ${t}`).join("\n")
    );
  }
}

// 2. Ninguna sección está a la vez en el estado vivo y en el histórico.
{
  const enArchivo = new Set(delArchivo());
  const enAmbos = delEstado().filter((t) => enArchivo.has(t));
  if (enAmbos.length > 0) {
    problemas.push(
      `una sección está a la vez en ${ESTADO} y en ${ARCHIVO}. Archivar es mover,\n` +
        `  no copiar: bórrala del estado vivo.\n` +
        enAmbos.map((t) => `      ### ${t}`).join("\n")
    );
  }
}

// 3. Toda sección del estado tiene el formato que el archivador espera.
//
// El archivador corta cada sección en el siguiente encabezado de nivel 1 a 3
// (`siguienteEncabezado` en check-state-budget.mjs). Un `###` que no sea una
// entrada fechada truncaría a su padre: al archivar se movería sólo el trozo de
// arriba y el resto quedaría huérfano. No es preferencia de formato, es la
// condición que el archivador necesita para no partir una entrada por la mitad.
{
  const malFormadas = delEstado().filter((t) => !/^\d{4}-\d{2}-\d{2} · /.test(t));
  if (malFormadas.length > 0) {
    problemas.push(
      `secciones de ${ESTADO} que el archivador no sabrá cortar (espera\n` +
        `  «### AAAA-MM-DD · título»):\n` +
        malFormadas.map((t) => `      ### ${t}`).join("\n")
    );
  }
}

if (problemas.length > 0) {
  for (const p of problemas) console.error(`✗ ${p}`);
  process.exit(1);
}

console.log(
  `✓ El archivo histórico está sano: ${delArchivo().length} secciones, ninguna repetida,\n` +
    `  ninguna compartida con el estado, y las ${delEstado().length} del estado tienen el\n` +
    `  formato que el archivador espera.`
);
