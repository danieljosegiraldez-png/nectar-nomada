/**
 * Crear un protocolo sensorial a partir de un archivo versionado.
 *
 * **Por qué existe (2026-09-06).** Hasta hoy la única forma de crear uno era
 * `prisma/seed.ts` con `SEED_DEMO_CONTENT=true`. En producción no había
 * ninguno, y sin protocolo no hay dónde meter un puntaje: el sistema tiene la
 * cata entera —sesiones, muestras ciegas, calibración de jueces— y **cero
 * valoraciones**, porque falta la pieza de la que cuelgan todas.
 *
 * **Por qué un archivo y no argumentos.** El contenido de un protocolo —qué
 * atributos, en qué escala— es una decisión del dueño, no un parámetro. En un
 * archivo se lee en el diff antes de que toque producción, y queda dicho quién
 * lo decidió y cuándo.
 *
 * **Escribe en producción.** Lee `DATABASE_URL` del `.env`, igual que
 * `people:set-email`. No es un ensayo.
 *
 *   npm run sensory:create-protocol                                  # lista
 *   npm run sensory:create-protocol -- protocolos/cafe-cva-adaptado.json
 */

// Debe ir primero: lib/db lee DATABASE_URL al importarse.
import "dotenv/config";

import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";
import { validarDefinicion, DefinicionInvalida } from "../lib/sensory/definicionDeProtocolo";

function fail(message: string, ...detail: string[]): never {
  console.error(`\n  ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

async function list() {
  const protocolos = await prisma.sensoryProtocol.findMany({
    include: { versions: { include: { attributes: true }, orderBy: { version: "asc" } } },
    orderBy: [{ domain: "asc" }, { name: "asc" }],
  });

  if (protocolos.length === 0) {
    console.log("\n  No hay ningún protocolo sensorial. Sin uno no se puede registrar ni un puntaje.\n");
  } else {
    console.log("");
    for (const p of protocolos) {
      console.log(`  ${p.domain.padEnd(8)} ${p.name}`);
      console.log(`           ${p.status} · licencia: ${p.standardLicenseStatus ?? "sin declarar"}`);
      for (const v of p.versions) {
        console.log(`           v${v.version} (${v.status}) · ${v.scoreMin}–${v.scoreMax} · ${v.attributes.length} atributos`);
      }
    }
    console.log("");
  }
  console.log("  Crear uno con:  npm run sensory:create-protocol -- <archivo.json>");
  console.log("  Los definidos viven en protocolos/.\n");
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL no está definida, y .env tampoco la trae.", "", "Corre esto desde la raíz del proyecto.");
  }

  const [, , ruta, ...resto] = process.argv;
  if (!ruta) return list();
  if (resto.length) fail("Usage: npm run sensory:create-protocol -- <archivo.json>");

  let definicion;
  try {
    definicion = validarDefinicion(JSON.parse(readFileSync(ruta, "utf8")));
  } catch (error) {
    if (error instanceof DefinicionInvalida) fail(`${ruta}: ${error.message}`, "", "No se cambió nada.");
    if (error instanceof SyntaxError) fail(`${ruta} no es JSON válido: ${error.message}`, "", "No se cambió nada.");
    throw error;
  }

  // Idempotente por nombre, como `people:set-email`: correrlo dos veces no crea
  // dos protocolos ni lanza un error de restricción que nadie pueda leer.
  const existente = await prisma.sensoryProtocol.findFirst({
    where: { name: definicion.name },
    include: { versions: true },
  });
  if (existente) {
    console.log(`\n  Ya existe "${definicion.name}" (${existente.versions.length} versión/es). No se cambió nada.`);
    console.log("  Para cambiar el contenido, crea una versión nueva: los puntajes ya dados");
    console.log("  deben seguir significando lo mismo.\n");
    return;
  }

  // Protocolo, versión y atributos en una sola transacción: una versión sin sus
  // atributos es un protocolo que acepta valoraciones vacías, y ese estado no
  // debe existir ni un instante.
  const creado = await prisma.$transaction(async (tx) => {
    const protocol = await tx.sensoryProtocol.create({
      data: {
        domain: definicion.domain,
        name: definicion.name,
        description: definicion.description,
        standardSourceReference: definicion.standardSourceReference,
        standardLicenseStatus: definicion.standardLicenseStatus,
      },
    });
    const version = await tx.sensoryProtocolVersion.create({
      data: {
        protocolId: protocol.id,
        version: definicion.version,
        scoreMin: definicion.scoreMin,
        scoreMax: definicion.scoreMax,
        status: "active",
      },
    });
    for (const [i, a] of definicion.attributes.entries()) {
      await tx.sensoryAttribute.create({
        data: {
          protocolVersionId: version.id,
          name: a.name,
          displayOrder: i,
          scaleMin: a.scaleMin,
          scaleMax: a.scaleMax,
          section: a.section,
        },
      });
    }
    return { protocol, version };
  });

  await recordAuditEvent({
    actorUserAccountId: null,
    operation: "sensory_protocol.create",
    entityType: "sensory_protocol",
    entityId: creado.protocol.id,
    after: { ...creado.protocol, version: definicion.version, attributes: definicion.attributes.length },
    sourceInterface: "scripts/create-sensory-protocol",
  });

  console.log(`\n  Creado: ${definicion.name}`);
  console.log(`  v${definicion.version} · ${definicion.scoreMin}–${definicion.scoreMax} · ${definicion.attributes.length} atributos`);
  console.log(`  Licencia declarada: ${definicion.standardLicenseStatus}`);
  if (definicion.standardLicenseStatus !== "licensed") {
    console.log("\n  AVISO: la licencia no es `licensed`. Estos puntajes no deben publicarse");
    console.log("  como si vinieran del formulario oficial.");
  }
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
