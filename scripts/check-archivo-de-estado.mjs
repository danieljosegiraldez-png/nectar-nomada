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

function titulos(ruta) {
  let texto;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    // Un archivo que no existe no es un fallo: el histórico puede no haberse
    // creado todavía. Lo que sí sería un fallo es inventarse su contenido.
    return [];
  }
  return [...texto.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
}

const problemas = [];

// 1. El histórico no repite ninguna sección.
{
  const vistos = new Set();
  const repetidos = [];
  for (const t of titulos(ARCHIVO)) {
    if (vistos.has(t)) repetidos.push(t);
    vistos.add(t);
  }
  if (repetidos.length > 0) {
    problemas.push(
      `${ARCHIVO} tiene ${repetidos.length} sección(es) repetida(s). Suele ser una\n` +
        `  fusión limpia entre dos sesiones que archivaron lo mismo: git no ve solape\n` +
        `  y duplica. Deja una sola copia.\n` +
        repetidos.map((t) => `      ### ${t}`).join("\n")
    );
  }
}

// 2. Ninguna sección está a la vez en el estado vivo y en el histórico.
{
  const enArchivo = new Set(titulos(ARCHIVO));
  const enAmbos = titulos(ESTADO).filter((t) => enArchivo.has(t));
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
  const malFormadas = titulos(ESTADO).filter((t) => !/^\d{4}-\d{2}-\d{2} · /.test(t));
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
  `✓ El archivo histórico está sano: ${titulos(ARCHIVO).length} secciones, ninguna repetida,\n` +
    `  ninguna compartida con el estado, y las ${titulos(ESTADO).length} del estado tienen el\n` +
    `  formato que el archivador espera.`
);
