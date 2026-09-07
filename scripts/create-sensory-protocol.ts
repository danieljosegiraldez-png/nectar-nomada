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
 *   npm run sensory:archive-protocol -- "Nombre exacto"               # retira
 *
 * **Qué hace y qué NO hace archivar.** Pone el protocolo en `archived`, que el
 * esquema define como «estuvo activo y se retiró» —distinto de `planned`, que
 * nunca lo estuvo—. Medido el 2026-09-06: **hoy nada más en el código filtra por
 * ese estado**, porque no hay ningún sitio donde alguien elija un protocolo. Su
 * efecto real es que este listado deja de mezclarlo con los vivos. Se construye
 * así a propósito: marcar lo retirado es lo que permite que el día que exista un
 * selector no ofrezca los cinco protocolos TEST que hay en producción.
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
    // Los retirados van al final y separados: mezclarlos con los vivos es lo
    // que hace que nadie note que hay cinco protocolos TEST en producción.
    const vivos = protocolos.filter((p) => p.status !== "archived");
    const retirados = protocolos.filter((p) => p.status === "archived");
    const pinta = (p: (typeof protocolos)[number]) => {
      console.log(`  ${p.domain.padEnd(8)} ${p.name}`);
      console.log(`           ${p.status} · licencia: ${p.standardLicenseStatus ?? "sin declarar"}`);
      for (const v of p.versions) {
        console.log(`           v${v.version} (${v.status}) · ${v.scoreMin}–${v.scoreMax} · ${v.attributes.length} atributos`);
      }
    };
    vivos.forEach(pinta);
    if (retirados.length > 0) {
      console.log(`\n  ── retirados (${retirados.length}) ──`);
      retirados.forEach(pinta);
    }
    console.log("");
  }
  console.log("  Crear uno con:  npm run sensory:create-protocol -- <archivo.json>");
  console.log("  Los definidos viven en protocolos/.\n");
}

/**
 * Retirar un protocolo. No borra: `archived` conserva la fila y todo lo que
 * cuelga de ella —sesiones, valoraciones, resultados— porque un puntaje dado
 * bajo un protocolo retirado sigue significando lo que significaba.
 *
 * Nombre EXACTO, como `people:set-email`: una coincidencia parcial retiraría el
 * protocolo equivocado, y el error saldría como una sesión que ya no encuentra
 * el suyo.
 */
async function archivar(nombre: string) {
  const coincidencias = await prisma.sensoryProtocol.findMany({
    where: { name: nombre },
    include: { versions: { include: { _count: { select: { sessions: true } } } } },
  });

  if (coincidencias.length === 0) {
    const todos = await prisma.sensoryProtocol.findMany({ orderBy: { name: "asc" }, select: { name: true } });
    fail(`No hay ningún protocolo llamado exactamente "${nombre}".`, "", "Los que hay:", ...todos.map((p) => `  ${p.name}`));
  }
  if (coincidencias.length > 1) {
    fail(`"${nombre}" coincide con ${coincidencias.length} protocolos. Esto no debería pasar; míralo a mano.`);
  }

  const protocolo = coincidencias[0]!;
  if (protocolo.status === "archived") {
    console.log(`\n  "${nombre}" ya estaba retirado. No se cambió nada.\n`);
    return;
  }

  // Se avisa, no se impide: retirar un protocolo con sesiones es legítimo —es
  // justo lo que se hace cuando se reemplaza por uno nuevo— pero quien lo hace
  // debe saber que hay trabajo colgando de él.
  const sesiones = protocolo.versions.reduce((n, v) => n + v._count.sessions, 0);

  const antes = { status: protocolo.status };
  const despues = await prisma.sensoryProtocol.update({
    where: { id: protocolo.id },
    data: { status: "archived" },
  });

  await recordAuditEvent({
    actorUserAccountId: null,
    operation: "sensory_protocol.archive",
    entityType: "sensory_protocol",
    entityId: protocolo.id,
    before: antes,
    after: { status: despues.status },
    sourceInterface: "scripts/create-sensory-protocol",
  });

  console.log(`\n  Retirado: ${nombre}`);
  if (sesiones > 0) {
    console.log(`  AVISO: tiene ${sesiones} sesión(es) colgando. No se borró nada — los`);
    console.log("  puntajes ya dados siguen significando lo que significaban.");
  }
  console.log("");
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL no está definida, y .env tampoco la trae.", "", "Corre esto desde la raíz del proyecto.");
  }

  const [, , primero, ...resto] = process.argv;
  if (!primero) return list();

  if (primero === "--archivar") {
    const nombre = resto.join(" ").trim();
    if (!nombre) fail('Usage: npm run sensory:archive-protocol -- "Nombre exacto del protocolo"');
    return archivar(nombre);
  }

  const ruta = primero;
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
