/**
 * Cargar la lista de chequeo de campo del apiario en la base.
 *
 * **Por qué existe (2026-09-11).** `lib/apiary/protocoloDeCampo.ts` sabe leer
 * `protocolos/apiario-campo-v2.json` —11 KB de actividades del apicultor, ya
 * escritas— y darlas de alta como una `ProtocolVersion` de Research OS. Medido:
 * **sólo lo llamaban las pruebas**. Ni un script, ni una pantalla. Así que el
 * protocolo que A9.4 puso como el sitio donde el dueño cambia qué se pregunta
 * **sin tocar código** nunca ha llegado a producción.
 *
 * Es la misma forma que ya mordió tres veces esta semana —el apiario, el
 * informe externo, el informe de visita—: el servicio hecho y la puerta sin
 * poner. Aquí la puerta es un comando, no una pantalla, porque cargar un
 * protocolo es una decisión del dueño que se toma una vez y se lee en el diff.
 *
 * **Es idempotente.** `cargarProtocoloDeCampo` mira el identificador externo
 * `apiario-campo-v<versión>` y, si ya está, devuelve lo que hay sin tocarlo.
 * Correrlo dos veces no crea dos protocolos, y por eso se puede correr sin
 * miedo para comprobar qué hay.
 *
 * **Escribe en producción.** Lee `DATABASE_URL` del `.env`, igual que
 * `sensory:create-protocol`. No es un ensayo.
 *
 *   npm run apiary:load-protocol            # qué dice el archivo y qué hay en la base
 *   npm run apiary:load-protocol -- --cargar   # lo escribe
 */
// Debe ir primero: lib/db lee DATABASE_URL al importarse.
import "dotenv/config";

import { prisma } from "../lib/db";
import {
  cargarProtocoloDeCampo,
  leerProtocoloDeCampo,
  variablesDe,
  ProtocoloDeCampoError,
} from "../lib/apiary/protocoloDeCampo";

function fail(message: string, ...detail: string[]): never {
  console.error(`\n  ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

async function main() {
  const cargar = process.argv.includes("--cargar");

  let protocolo;
  try {
    protocolo = leerProtocoloDeCampo();
  } catch (error) {
    fail(
      "No se pudo leer `protocolos/apiario-campo-v2.json`.",
      (error as Error).message,
      "",
      "Corre esto desde la raíz del proyecto.",
    );
  }

  const variables = variablesDe(protocolo);
  console.log(`\n  Archivo: apiario-campo-v${protocolo.version}`);
  console.log(`  ${protocolo.activities.length} actividad(es), ${variables.length} variable(s):\n`);
  for (const actividad of protocolo.activities) {
    const obligatorias = actividad.items.filter((i) => i.required).length;
    console.log(`    ${actividad.label} — ${actividad.items.length} pregunta(s), ${obligatorias} obligatoria(s)`);
  }

  // Fila patrón: qué hay YA en la base, antes de decidir nada.
  const identificador = `apiario-campo-v${protocolo.version}`;
  const existente = await prisma.protocol.findUnique({
    where: { externalIdentifier: identificador },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  console.log(
    `\n  En la base: ${
      existente ? `ya está, versión ${existente.versions[0]?.version ?? "?"}` : "NO está"
    }`,
  );

  if (!cargar) {
    console.log("\n  Para escribirlo:  npm run apiary:load-protocol -- --cargar\n");
    return;
  }

  // El actor: quien tenga Platform Admin. El cargador acepta `null`, pero un
  // AuditEvent sin actor no dice quién lo decidió, y aquí sí se sabe.
  const admin = await prisma.userAccount.findFirst({
    where: { assignments: { some: { roleProfile: { name: "Platform Admin" } } } },
    select: { id: true, person: { select: { displayName: true } } },
  });
  if (!admin) fail("No hay ninguna cuenta con Platform Admin: el rastro quedaría sin actor.");
  console.log(`  Actor: ${admin.person?.displayName ?? admin.id}`);

  try {
    const { version, creado } = await cargarProtocoloDeCampo(admin.id);
    console.log(
      creado
        ? `\n  Cargado: versión ${version.version}, ${variables.length} variable(s).\n`
        : `\n  Ya estaba: versión ${version.version}. No se tocó nada.\n`,
    );
  } catch (error) {
    if (error instanceof ProtocoloDeCampoError) fail(error.message);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
