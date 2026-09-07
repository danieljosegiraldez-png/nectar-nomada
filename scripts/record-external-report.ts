/**
 * Registrar el informe de cata que entregó alguien de fuera.
 *
 * **Por qué existe (2026-09-07).** Cuando se le paga un análisis a un Q-grader o
 * a un tostador, el resultado llega bajo SU firma y esa persona no tiene cuenta
 * en la plataforma. Hasta hoy `assessment.evaluator_user_account_id` era NOT
 * NULL: el trabajo que se paga era justo el que no se podía registrar.
 *
 * **Por qué un archivo y no argumentos.** Un informe trae varios puntajes, un
 * comentario y un puntero a su original. En un archivo se lee antes de que toque
 * producción, y queda en disco lo que se transcribió — que es la mitad de la
 * procedencia. Los atributos van por NOMBRE, tal como los dice el informe.
 *
 * **Escribe en producción.** Lee `DATABASE_URL` del `.env`. No es un ensayo.
 *
 *   npm run sensory:record-external                            # ayuda y catálogo
 *   npm run sensory:record-external -- informes/2026-03-12.json
 *
 * El archivo:
 *
 *   {
 *     "actorEmail": "quien@lo.transcribe",   // debe tener sensory:manage_session
 *     "sampleCode": "M-2026-014",
 *     "protocolName": "Cata de café — sección afectiva CVA (SCA) v2",
 *     "evaluador": "Nombre exacto de la persona que firmó",
 *     "sourceReference": "PDF en Drive/informes/2026-03-12.pdf",
 *     "evaluadoEl": "2026-03-12",            // opcional
 *     "comentario": "…",                     // opcional
 *     "respuestas": [{ "attributeName": "Flavor", "value": 7 }]
 *   }
 */

// Debe ir primero: lib/db lee DATABASE_URL al importarse.
import "dotenv/config";

import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { registrarInformeExterno, InformeExternoError } from "../lib/sensory/informeExterno";

function fail(message: string, ...detail: string[]): never {
  console.error(`\n  ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

function exige<T>(valor: T | null | undefined, mensaje: string): T {
  if (valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "")) fail(mensaje);
  return valor;
}

async function ayuda() {
  const protocolos = await prisma.sensoryProtocol.findMany({
    where: { status: { not: "archived" } },
    include: { versions: { where: { status: "active" }, include: { attributes: { orderBy: { displayOrder: "asc" } } } } },
    orderBy: [{ domain: "asc" }, { name: "asc" }],
  });
  console.log("\n  Uso:  npm run sensory:record-external -- <archivo.json>\n");
  console.log("  Protocolos vivos y los nombres de atributo que espera cada uno:\n");
  for (const p of protocolos) {
    for (const v of p.versions) {
      if (v.attributes.length === 0) continue;
      console.log(`  ${p.name}`);
      console.log(`     ${v.attributes.map((a) => a.name).join(", ")}\n`);
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL no está definida, y .env tampoco la trae.", "", "Corre esto desde la raíz del proyecto.");
  }

  const [, , ruta, ...resto] = process.argv;
  if (!ruta) return ayuda();
  if (resto.length) fail("Usage: npm run sensory:record-external -- <archivo.json>");

  let d: Record<string, unknown>;
  try {
    d = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${ruta} no es JSON válido: ${error.message}`, "", "No se cambió nada.");
    throw error;
  }

  const actorEmail = exige(d.actorEmail as string, 'Falta "actorEmail": quién transcribe el informe.');
  const sampleCode = exige(d.sampleCode as string, 'Falta "sampleCode".');
  const protocolName = exige(d.protocolName as string, 'Falta "protocolName".');
  const evaluador = exige(d.evaluador as string, 'Falta "evaluador": quién firmó el informe.');
  const sourceReference = exige(
    d.sourceReference as string,
    'Falta "sourceReference". Un puntaje externo sin puntero a su original no se puede verificar después.',
  );
  const respuestas = d.respuestas as { attributeName: string; value: number }[] | undefined;
  if (!Array.isArray(respuestas) || respuestas.length === 0) fail('Falta "respuestas", o está vacío.');

  // Cada búsqueda por su nombre EXACTO, como `people:set-email`: una coincidencia
  // parcial registraría el informe contra la muestra o la persona equivocadas, y
  // el error saldría meses después como un puntaje que no cuadra.
  const actorPersona = await prisma.person.findFirst({ where: { email: actorEmail.toLowerCase() }, include: { userAccount: true } });
  if (!actorPersona?.userAccount) fail(`No hay ninguna cuenta con el correo "${actorEmail}".`);

  const muestra = await prisma.sample.findFirst({ where: { sampleCode } });
  if (!muestra) fail(`No hay ninguna muestra con el código exacto "${sampleCode}".`);

  const protocolo = await prisma.sensoryProtocol.findFirst({
    where: { name: protocolName },
    include: { versions: { where: { status: "active" }, orderBy: { version: "desc" } } },
  });
  if (!protocolo) fail(`No hay ningún protocolo llamado exactamente "${protocolName}".`, "", "Corre el comando sin argumentos para ver los que hay.");
  const version = protocolo.versions[0];
  if (!version) fail(`"${protocolName}" no tiene ninguna versión activa.`);

  const personas = await prisma.person.findMany({ where: { displayName: evaluador } });
  if (personas.length === 0) {
    fail(
      `No hay ninguna persona llamada exactamente "${evaluador}".`,
      "",
      "Créala primero: el firmante de un informe es una persona del sistema, con",
      "su credencial en `sensoryCertifications`, no un nombre suelto en un campo.",
    );
  }
  if (personas.length > 1) fail(`"${evaluador}" coincide con ${personas.length} personas. Míralo a mano.`);

  try {
    const v = await registrarInformeExterno(actorPersona.userAccount.id, {
      sampleId: muestra.id,
      protocolVersionId: version.id,
      evaluadorPersonId: personas[0]!.id,
      sourceReference,
      evaluadoEl: d.evaluadoEl ? new Date(`${String(d.evaluadoEl)}T12:00:00Z`) : null,
      comentario: (d.comentario as string) ?? null,
      overallScore: (d.overallScore as number) ?? null,
      respuestas,
    });
    console.log(`\n  Registrado: informe de ${personas[0]!.displayName} sobre ${muestra.sampleCode}`);
    console.log(`  Protocolo: ${protocolo.name} v${version.version}`);
    console.log(`  Puntaje total: ${v.overallScore ?? "—"}`);
    console.log(`  Original: ${v.sourceReference}\n`);
  } catch (error) {
    if (error instanceof InformeExternoError) fail(`No se registró: ${error.message}`, "", "No se cambió nada.");
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
