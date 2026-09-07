/**
 * Dar de alta a un evaluador con su credencial, o añadirle una nueva.
 *
 * **Por qué existe (2026-09-07).** Desde ayer se puede registrar el informe de
 * cata de alguien de fuera (`sensory:record-external`), y ese comando exige que
 * la persona exista: el firmante de un informe es una persona del sistema, con
 * su credencial, no un nombre suelto en un campo. Crearla a mano en la base era
 * lo único que faltaba, y es justo donde se cuela un JSON con la forma
 * equivocada en una columna que nadie valida.
 *
 * **No hace falta cuenta.** Un Q-grader al que se le paga un análisis no es
 * usuario de la plataforma. `Person` existe sin `UserAccount` a propósito, y
 * este comando **no crea ninguna** — para eso está `people:set-email`, que es
 * una decisión distinta.
 *
 * **Es aditivo, nunca destructivo.** Sobre una persona que ya existe añade la
 * credencial a las que tenga; renovar produce otra fecha y las dos conviven,
 * porque el historial de credenciales es parte de la procedencia. Si la misma
 * ya está, lo dice y no cambia nada.
 *
 * **Escribe en producción.** Lee `DATABASE_URL` del `.env`. No es un ensayo.
 *
 *   npm run people:add-evaluator                       # lista quién tiene credenciales
 *   npm run people:add-evaluator -- "Nombre Apellido" \
 *       --cuerpo CQI --certificacion "Q Arabica Grader" \
 *       --desde 2024-05-01 [--nivel Q] [--hasta 2027-05-01] [--referencia Q-12345]
 */

// Debe ir primero: lib/db lee DATABASE_URL al importarse.
import "dotenv/config";

import { prisma } from "../lib/db";
import type { Prisma } from "../generated/prisma/client";
import { recordAuditEvent } from "../lib/audit";
import {
  agregarCertificacion,
  leerCertificaciones,
  validarCertificacion,
  CertificacionInvalida,
} from "../lib/people/certificacionSensorial";

function fail(message: string, ...detail: string[]): never {
  console.error(`\n  ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

const USO = [
  'Usage: npm run people:add-evaluator -- "Nombre Apellido" \\',
  '         --cuerpo CQI --certificacion "Q Arabica Grader" --desde 2024-05-01',
  "",
  "Opcionales: --nivel <texto>  --hasta <AAAA-MM-DD>  --referencia <nº de certificado>",
];

/** `--clave valor` a un mapa. Sin adivinar: una clave desconocida es un error. */
function banderas(args: readonly string[]): Map<string, string> {
  const CONOCIDAS = new Set(["cuerpo", "certificacion", "desde", "nivel", "hasta", "referencia"]);
  const out = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const clave = args[i] ?? "";
    if (!clave.startsWith("--")) fail(`No entiendo "${clave}".`, "", ...USO);
    const nombre = clave.slice(2);
    if (!CONOCIDAS.has(nombre)) {
      fail(`"--${nombre}" no es una opción.`, "", `Las que hay: ${[...CONOCIDAS].map((c) => `--${c}`).join(" ")}`);
    }
    const valor = args[i + 1];
    // Sin esto, `--nivel --hasta 2027-01-01` guardaría el nivel «--hasta».
    if (valor === undefined || valor.startsWith("--")) fail(`A "--${nombre}" le falta su valor.`, "", ...USO);
    if (out.has(nombre)) fail(`"--${nombre}" viene dos veces.`);
    out.set(nombre, valor);
  }
  return out;
}

async function listar() {
  // Se traen todas y se filtra aquí: son catorce personas, y un `where` sobre
  // una columna JSON nula pide el helper `Prisma.JsonNull`, cuyo uso correcto es
  // fácil de escribir mal en silencio — devolvería la lista vacía y se leería
  // como «nadie tiene credenciales».
  const todas = await prisma.person.findMany({
    orderBy: { displayName: "asc" },
    select: { displayName: true, sensoryCertifications: true },
  });
  const personas = todas.filter((p) => p.sensoryCertifications !== null);

  if (personas.length === 0) {
    console.log("\n  Nadie tiene credenciales sensoriales registradas todavía.\n");
  } else {
    console.log("");
    for (const p of personas) {
      let cs;
      try {
        cs = leerCertificaciones(p.sensoryCertifications);
      } catch (error) {
        console.log(`  ${p.displayName}`);
        console.log(`     ILEGIBLE: ${(error as Error).message}`);
        continue;
      }
      if (cs.length === 0) continue;
      console.log(`  ${p.displayName}`);
      for (const c of cs) {
        const nivel = c.level_or_rank ? ` (${c.level_or_rank})` : "";
        const hasta = c.expiry_date ? ` — vence ${c.expiry_date}` : "";
        const ref = c.certificate_reference ? ` · ${c.certificate_reference}` : "";
        console.log(`     ${c.certifying_body}: ${c.certification_name}${nivel}, desde ${c.date_earned}${hasta}${ref}`);
      }
    }
    console.log("");
  }
  console.log("  " + USO[0]);
  console.log("  " + USO[1] + "\n");
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL no está definida, y .env tampoco la trae.", "", "Corre esto desde la raíz del proyecto.");
  }

  const [, , nombre, ...resto] = process.argv;
  if (!nombre) return listar();
  if (nombre.startsWith("--")) fail("El primer argumento es el nombre de la persona.", "", ...USO);

  const opciones = banderas(resto);

  let certificacion;
  try {
    certificacion = validarCertificacion({
      certifying_body: opciones.get("cuerpo"),
      certification_name: opciones.get("certificacion"),
      date_earned: opciones.get("desde"),
      level_or_rank: opciones.get("nivel"),
      expiry_date: opciones.get("hasta"),
      certificate_reference: opciones.get("referencia"),
    });
  } catch (error) {
    if (error instanceof CertificacionInvalida) fail(error.message, "", ...USO);
    throw error;
  }

  // Nombre EXACTO, como `people:set-email`: una coincidencia parcial le colgaría
  // la credencial a la persona equivocada, y eso después firma informes.
  const coincidencias = await prisma.person.findMany({ where: { displayName: nombre } });
  if (coincidencias.length > 1) {
    fail(
      `"${nombre}" coincide con ${coincidencias.length} personas.`,
      "",
      ...coincidencias.map((p) => `  ${p.id}  ${p.displayName}`),
    );
  }

  const existente = coincidencias[0];
  let previas;
  try {
    previas = existente ? leerCertificaciones(existente.sensoryCertifications) : [];
  } catch (error) {
    fail((error as Error).message, "", "No se cambió nada.");
  }

  let siguientes;
  try {
    siguientes = agregarCertificacion(previas, certificacion);
  } catch (error) {
    if (error instanceof CertificacionInvalida) {
      console.log(`\n  ${(error as Error).message}`);
      console.log("  No se cambió nada.\n");
      return;
    }
    throw error;
  }

  // El nombre se parte por el ÚLTIMO espacio, y sólo para crear: es una
  // convención, no un hecho, y por eso no se toca en alguien que ya existe.
  const corte = nombre.trim().lastIndexOf(" ");
  const givenName = corte > 0 ? nombre.trim().slice(0, corte) : nombre.trim();
  const familyName = corte > 0 ? nombre.trim().slice(corte + 1) : "";

  // Prisma tipa una columna `Json?` como objeto o primitivo, no como array de un
  // tipo propio: la conversión es sólo para el tipo, y el valor va tal cual — es
  // el mismo que `validarCertificacion` acaba de comprobar.
  const paraGuardar = siguientes as unknown as Prisma.InputJsonValue;

  const persona = await prisma.$transaction(async (tx) => {
    const p = existente
      ? await tx.person.update({
          where: { id: existente.id },
          data: { sensoryCertifications: paraGuardar },
        })
      : await tx.person.create({
          data: {
            givenName,
            familyName,
            displayName: nombre.trim(),
            locale: "es",
            sensoryCertifications: paraGuardar,
          },
        });

    await recordAuditEvent(
      {
        actorUserAccountId: null,
        operation: existente ? "person.add_sensory_certification" : "person.create_evaluator",
        entityType: "person",
        entityId: p.id,
        before: existente ? { sensoryCertifications: previas } : undefined,
        after: { displayName: p.displayName, sensoryCertifications: siguientes },
        sourceInterface: "scripts/add-evaluator",
      },
      tx,
    );

    return p;
  });

  console.log(`\n  ${existente ? "Credencial añadida a" : "Evaluador creado:"} ${persona.displayName}`);
  console.log(`  ${certificacion.certifying_body}: ${certificacion.certification_name}, desde ${certificacion.date_earned}`);
  console.log(`  Credenciales que tiene ahora: ${siguientes.length}`);
  if (!existente) {
    console.log("\n  No se le creó cuenta: un evaluador externo no la necesita.");
    console.log("  Si algún día debe entrar a la aplicación, eso es `people:set-email`.");
  }
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
