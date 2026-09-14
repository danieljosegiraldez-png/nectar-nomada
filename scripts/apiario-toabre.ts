/**
 * Toabré: los dos sitios, las 15 colmenas de Marcelino y lo que les pasó.
 *
 * ## De dónde sale cada cosa — y hay DOS fuentes, no una
 *
 * **El informe técnico del 2 de septiembre de 2026**, escrito por Chayanne López para Luis
 * Sotillo (Kiva Estates), es **evidencia primaria** y manda sobre cualquier recuento de
 * memoria. De ahí salen: que Toabré está en la provincia de **Coclé**; que son **dos
 * sitios** —Finca #1, cerrada y húmeda; Finca #2, abierta y soleada—; que al llegar se
 * constató la evasión de **la única colmena de Finca #2** y la **evasión total de las dos
 * colmenas pequeñas de Finca #1**, éstas «aproximadamente dos semanas atrás»; que se
 * instalaron **tres núcleos en Finca #2** usando *«dos cajas que ya estaban en el sitio y
 * una trasladada desde el almacén central»*; y la conclusión técnica de la evasión.
 *
 * **El dueño**, el 2026-09-14, dio lo que el informe no cubre: que las 15 originales son
 * pie de **Marcelino Guevara (San Francisco, Veraguas)**, instaladas en **diciembre de
 * 2025**, con **Finca 1 diez y Finca 2 cinco**; que **se fueron 13** —las 5 de F2 y 8 de
 * F1—; y que a F2 llegó **un enjambre** que se quedó y luego se fue. Toabré es Penonomé.
 *
 * ## Lo que este guion NO hace, y por qué
 *
 * **No crea tres colmenas nuevas.** El informe es explícito: dos de los tres núcleos
 * fueron a **cajas que ya estaban en el sitio**. Una caja es una `Hive` y la colonia que
 * vive dentro es una `Colony`: crear tres colmenas habría inventado dos cajas y perdido
 * que esas dos son las mismas que sus colonias abandonaron. Se crea **una** colmena nueva
 * y dos colonias en cajas existentes.
 *
 * **No crea un `PollinationCommitment`.** Toabré es exactamente el emplazamiento sin fecha
 * de cierre que el Anexo E §9 describe, y el código existe desde ADR-130 — pero un
 * compromiso pide hectáreas, densidad objetivo y contrato, y **el dueño no ha dado
 * ninguno**. Inventarlos sería fabricar hechos de negocio. Es el siguiente paso obvio y
 * queda nombrado, no hecho.
 *
 * **No inventa una segunda causa de pérdida.** La conclusión del técnico nombra dos cosas:
 * *«escasez crítica de néctar y polen»*, que el catálogo tiene como **Escasez de
 * floración**, y *«estrés climático por exceso de humedad y falta de luz solar directa»*,
 * que **no tiene valor en el catálogo**. La primera entra como causa; la segunda va en la
 * `note` de esa causa y en el `reason`, que es el sitio que el modelo tiene para «lo que el
 * catálogo no cubre». Merece su propio valor y eso es decisión del dueño.
 *
 * **La evasión es un ESTADO, no una causa.** `ColonyStatus` tiene `absconded`, y el
 * catálogo de causas —quince valores— no tiene «evasión» ni la necesita: la evasión es cómo
 * terminó, y la causa es por qué se fueron.
 *
 * ## Las cuatro fechas que faltan, y por qué son argumentos obligatorios
 *
 * El dueño dio meses, no días: «diciembre de 2025», «marzo», «abril». Y el informe data la
 * evasión de Finca 1 como «aproximadamente dos semanas» antes del 2 de septiembre, que es
 * una estimación y no una fecha. **Un día inventado es un dato falso con aspecto de bueno**
 * en el registro de pérdidas de colonias de una finca real, así que el guion se niega a
 * correr sin ellas.
 *
 * ## Uso
 *
 *   npm run data:apiario-toabre -- \
 *     --instaladas=2025-12-01 --evasion-13=2026-03-15 \
 *     --enjambre-llego=2026-04-15 --evasion-ultimas=2026-08-19        (ensayo)
 *   ... --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const RAZON =
  "Dueño 2026-09-14 e informe técnico de Chayanne López del 2026-09-02: los dos sitios de " +
  "Toabré (Penonomé, Coclé), las 15 colmenas de pie de Marcelino Guevara y las evasiones.";

const GEOGRAFIA: ReadonlyArray<{ nombre: string; tipo: "province" | "locality"; padre: string }> = [
  { nombre: "Coclé", tipo: "province", padre: "Panamá" },
  { nombre: "Penonomé", tipo: "locality", padre: "Coclé" },
  { nombre: "Toabré", tipo: "locality", padre: "Penonomé" },
];

const SITIOS = [
  { nombre: "Apiario Toabré Finca 1", colmenas: 10, desde: 1 },
  { nombre: "Apiario Toabré Finca 2", colmenas: 5, desde: 11 },
] as const;

/** La nueva del almacén central, la única caja que este guion crea de más. */
const COLMENA_NUEVA = "NN-0016";
const ORG_NECTAR = "Néctar Nómada";
const CAUSA = "Escasez de floración";

const NOTA_CLIMA =
  "El informe del 2026-09-02 añade una segunda causa que el catálogo no tiene: «estrés " +
  "climático por exceso de humedad y falta de luz solar directa». Registros de depresión " +
  "meteorológica del 22 de julio al 2 de septiembre de 2026.";

function arg(n: string): string | null {
  const p = `--${n}=`;
  const h = process.argv.find((a) => a.startsWith(p));
  return h ? h.slice(p.length).trim() || null : null;
}
/** Un día declarado, anclado a medianoche de Panamá (UTC−5) para que la fecha se lea bien. */
function dia(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T05:00:00.000Z`);
}

async function main() {
  const aplicar = process.argv.includes("--apply");
  const instaladas = dia(arg("instaladas"));
  const evasion13 = dia(arg("evasion-13"));
  const enjambreLlego = dia(arg("enjambre-llego"));
  const evasionUltimas = dia(arg("evasion-ultimas"));
  const enjambreSeFue = dia(arg("enjambre-se-fue"));
  const VISITA = new Date("2026-09-02T05:00:00.000Z");

  console.log(aplicar ? "APLICANDO\n" : "ENSAYO — no se escribe nada\n");

  const problemas: string[] = [];
  const faltan = [
    ["--instaladas", instaladas, "diciembre de 2025: el día en que se instalaron las 15"],
    ["--evasion-13", evasion13, "«marzo»: el día en que se fueron las 13"],
    ["--enjambre-llego", enjambreLlego, "«abril»: el día en que el enjambre ocupó la caja de F2"],
    ["--evasion-ultimas", evasionUltimas, "el informe lo estima «dos semanas» antes del 2 de septiembre"],
    ["--enjambre-se-fue", enjambreSeFue, "«final de julio»: el día en que el enjambre abandonó la caja de F2"],
  ] as const;
  for (const [nombre, valor, que] of faltan) {
    if (!valor) problemas.push(`falta ${nombre}=AAAA-MM-DD — ${que}. No se inventa.`);
  }
  if (instaladas && evasion13 && evasion13 < instaladas) problemas.push("--evasion-13 es anterior a --instaladas");
  if (evasionUltimas && evasionUltimas > VISITA) problemas.push("--evasion-ultimas es posterior a la visita del 2 de septiembre");

  const panama = await prisma.location.findFirst({ where: { name: "Panamá", locationType: "country" } });
  const org = await prisma.organization.findFirst({ where: { name: ORG_NECTAR } });
  const marcelino = await prisma.person.findFirst({ where: { displayName: "Marcelino Guevara" } });
  const chayanne = await prisma.person.findFirst({ where: { displayName: "Chayanne López" } });
  const origen = await prisma.variableCatalogValue.findFirst({ where: { value: "San Francisco, Veraguas" } });
  const origenParita = await prisma.variableCatalogValue.findFirst({ where: { value: "Parita, Chitré" } });
  const causa = await prisma.variableCatalogValue.findFirst({ where: { value: CAUSA } });
  for (const [q, v] of [["país Panamá", panama], ["organización Néctar Nómada", org], ["persona Marcelino Guevara", marcelino], ["persona Chayanne López", chayanne], ["origen San Francisco, Veraguas", origen], ["origen Parita, Chitré", origenParita], [`causa «${CAUSA}»`, causa]] as const) {
    if (!v) problemas.push(`no existe ${q} — ¿faltó un guion anterior o un db:seed?`);
  }

  const yaCreados = await prisma.location.count({ where: { name: { in: SITIOS.map((s) => s.nombre) } } });
  if (yaCreados > 0) problemas.push(`${yaCreados} de los dos sitios de Toabré ya existen: este guion no es idempotente sobre las colonias`);

  if (problemas.length > 0) {
    console.log("ABORTA:");
    for (const p of problemas) console.log(`  · ${p}`);
    process.exitCode = 1;
    return;
  }

  console.log("Plan:");
  console.log(`  1. geografía: ${GEOGRAFIA.map((g) => g.nombre).join(" → ")}`);
  console.log(`  2. persona «Luis Sotillo» (contacto de Kiva Estates, del informe)`);
  for (const s of SITIOS) {
    console.log(`  3. «${s.nombre}» con ${s.colmenas} colmenas NN-${String(s.desde).padStart(4, "0")}…NN-${String(s.desde + s.colmenas - 1).padStart(4, "0")}`);
  }
  console.log(`  4. 15 colonias de pie de Marcelino, instaladas ${instaladas!.toISOString().slice(0, 10)}`);
  console.log(`  5. evasión de 13 el ${evasion13!.toISOString().slice(0, 10)}: las 5 de F2 y 8 de las 10 de F1`);
  console.log(`  6. enjambre en F2 el ${enjambreLlego!.toISOString().slice(0, 10)}, evadido antes del 2 de septiembre`);
  console.log(`  7. evasión de las 2 últimas de F1 el ${evasionUltimas!.toISOString().slice(0, 10)}`);
  console.log(`  8. tres núcleos de Chayanne el 2026-09-02 en F2: DOS en cajas que ya estaban y UNA nueva (${COLMENA_NUEVA})`);
  console.log(`     causa de todas las evasiones: «${CAUSA}», clase conclusion, con el clima en la nota\n`);

  if (!aplicar) {
    console.log("Ensayo terminado. Añade --apply para escribir.");
    return;
  }
  const causaComun = {
    causeValueId: causa!.id,
    // `conclusion` y no `direct_observation`: es la conclusión técnica de Chayanne sobre
    // por qué se fueron, no algo que nadie viera ocurrir.
    provenanceClass: "conclusion" as const,
    note: NOTA_CLIMA,
  };

  await prisma.$transaction(
    async (tx) => {
    // **El ayudante vive DENTRO de la transacción a propósito.** Definido fuera,
    // `tests/arquitectura/audit-atomico.test.ts` lo marcaba: lee la fuente y ve un
    // `recordAuditEvent` fuera de cualquier `$transaction`, aunque reciba el `tx` por
    // parámetro. No se usó la válvula `// audit-sin-escritura:` porque habría sido falsa
    // —sí acompaña escrituras—; se movió, que es lo cierto.
    /** Cierra una colonia como evadida, con su causa. Espeja `registrarFinDeColonia`. */
    async function evadir(
      tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
      colonyId: string,
      endedAt: Date,
      /**
       * `provisional` cuando la FECHA es una estimación, no una observación.
       *
       * **Se marca sólo lo que la evidencia llama aproximado**, no todo por igual: el
       * informe data la evasión de Finca 1 como «aproximadamente dos semanas atrás» y el
       * dueño dio la del enjambre diciendo «estimado». La del 20 de marzo la dio como un
       * día, sin calificarla, así que **no se marca ni se supone**: `null` aquí significa
       * «nadie dijo nada sobre su calidad», que es distinto de `verified`.
       */
      dataQuality: "provisional" | null = null,
    ) {
      const antes = await tx.colony.findUniqueOrThrow({ where: { id: colonyId } });
      const despues = await tx.colony.update({ where: { id: colonyId }, data: { status: "absconded", endedAt, dataQuality } });
      await tx.colonyLossCause.create({ data: { colonyId, ...causaComun, dataQuality } });
      await recordAuditEvent(
        { actorUserAccountId: null, operation: "colony.end", entityType: "colony", entityId: colonyId, before: antes, after: despues, reason: RAZON + " Evasión. " + NOTA_CLIMA, sourceInterface: "script" },
        tx,
      );
    }

      // 1 — geografía
      for (const g of GEOGRAFIA) {
        if (await tx.location.findFirst({ where: { name: g.nombre, locationType: g.tipo } })) continue;
        const padre =
          (await tx.location.findFirst({ where: { name: g.padre, locationType: "province" } })) ??
          (await tx.location.findFirst({ where: { name: g.padre, locationType: "locality" } })) ??
          (await tx.location.findFirst({ where: { name: g.padre, locationType: "country" } }));
        if (!padre) throw new Error(`no se encontró el padre «${g.padre}»`);
        const fila = await tx.location.create({
          data: { name: g.nombre, locationType: g.tipo, parentLocationId: padre.id, status: "approved", classification: "internal" },
        });
        await recordAuditEvent({ actorUserAccountId: null, operation: "location.create", entityType: "location", entityId: fila.id, after: fila, reason: RAZON, sourceInterface: "script" }, tx);
      }

      // 2 — Luis Sotillo, el contacto del cliente que nombra el informe
      if (!(await tx.person.findFirst({ where: { displayName: "Luis Sotillo" } }))) {
        const p = await tx.person.create({ data: { givenName: "Luis", familyName: "Sotillo", displayName: "Luis Sotillo", locale: "es" } });
        await recordAuditEvent({ actorUserAccountId: null, operation: "person.create", entityType: "person", entityId: p.id, after: p, reason: RAZON + " Contacto de Kiva Estates, del informe del 2026-09-02.", sourceInterface: "script" }, tx);
      }

      const toabre = await tx.location.findFirstOrThrow({ where: { name: "Toabré", locationType: "locality" } });

      // 3 a 5 — sitios, colmenas, colonias y colocaciones
      const porSitio = new Map<string, { hiveId: string; colonyId: string; identifier: string }[]>();
      for (const s of SITIOS) {
        const sitio = await tx.location.create({
          data: { name: s.nombre, locationType: "apiary_site", parentLocationId: toabre.id, organizationId: org!.id, status: "approved", classification: "internal" },
        });
        await recordAuditEvent({ actorUserAccountId: null, operation: "location.create", entityType: "location", entityId: sitio.id, after: sitio, reason: RAZON, sourceInterface: "script" }, tx);

        const lista: { hiveId: string; colonyId: string; identifier: string }[] = [];
        for (let i = 0; i < s.colmenas; i++) {
          const identifier = `NN-${String(s.desde + i).padStart(4, "0")}`;
          const hive = await tx.hive.create({ data: { identifier, locationId: sitio.id, installedAt: instaladas!, status: "active" } });
          // **La colocación se crea A MANO.** `createHive` no la crea —deuda nombrada en
          // ADR-126— y sin ella `colmenasDeLaVentana` y `apiarioDeColmenaEn` no verían nada
          // de Toabré: su historia entera quedaría fuera del alcance de la ventana.
          await tx.hivePlacement.create({ data: { hiveId: hive.id, locationId: sitio.id, startedAt: instaladas! } });
          const colony = await tx.colony.create({
            data: {
              hiveId: hive.id, status: "active", startedAt: instaladas!,
              originType: "purchased", originSourceValueId: origen!.id,
              originNote: "Pie criado por Marcelino Guevara (San Francisco, Veraguas). Declarado por el dueño el 2026-09-14.",
              provenanceClass: "original_record",
            },
          });
          await recordAuditEvent({ actorUserAccountId: null, operation: "hive.create", entityType: "hive", entityId: hive.id, after: hive, reason: RAZON, sourceInterface: "script" }, tx);
          lista.push({ hiveId: hive.id, colonyId: colony.id, identifier });
        }
        porSitio.set(s.nombre, lista);
      }

      const f1 = porSitio.get(SITIOS[0].nombre)!;
      const f2 = porSitio.get(SITIOS[1].nombre)!;

      // 6 — las 13 del 20 de marzo: las CINCO de F2 y OCHO de las diez de F1
      for (const c of f2) await evadir(tx, c.colonyId, evasion13!);
      for (const c of f1.slice(0, 8)) await evadir(tx, c.colonyId, evasion13!);

      // 7 — las dos últimas de F1
      // El informe las data «aproximadamente dos semanas atrás»: la fecha es estimada.
      for (const c of f1.slice(8)) await evadir(tx, c.colonyId, evasionUltimas!, "provisional");

      // 8 — el enjambre: ocupó una caja YA VACÍA de F2. `captured`, no `purchased`: nadie
      // lo compró ni lo trajo. Se pone en la primera caja de F2 porque **el informe no dice
      // en cuál fue**, y los identificadores los asigna este mismo guion: la elección es
      // interna y consistente, no un hecho declarado.
      const cajaDelEnjambre = f2[0]!;
      const enjambre = await tx.colony.create({
        data: {
          hiveId: cajaDelEnjambre.hiveId, status: "absconded",
          startedAt: enjambreLlego!, endedAt: enjambreSeFue!,
          // El dueño dijo «estimado» de la fecha de salida: se registra como tal.
          dataQuality: "provisional",
          originType: "captured",
          originNote: "Enjambre que ocupó por su cuenta una caja abandonada de Finca 2. Se le alimentó. Declarado por el dueño el 2026-09-14.",
          provenanceClass: "direct_observation",
        },
      });
      await tx.colonyLossCause.create({ data: { colonyId: enjambre.id, ...causaComun, dataQuality: "provisional" } });
      await recordAuditEvent({ actorUserAccountId: null, operation: "colony.create", entityType: "colony", entityId: enjambre.id, after: enjambre, reason: RAZON + " Enjambre llegado y evadido.", sourceInterface: "script" }, tx);

      // 9 — 2 de septiembre: tres núcleos de Chayanne. DOS en cajas que ya estaban y UNA
      // caja nueva del almacén central, tal como lo describe el informe.
      const nueva = await tx.hive.create({ data: { identifier: COLMENA_NUEVA, locationId: (await tx.location.findFirstOrThrow({ where: { name: SITIOS[1].nombre } })).id, installedAt: VISITA, status: "active" } });
      await tx.hivePlacement.create({ data: { hiveId: nueva.id, locationId: nueva.locationId, startedAt: VISITA } });
      await recordAuditEvent({ actorUserAccountId: null, operation: "hive.create", entityType: "hive", entityId: nueva.id, after: nueva, reason: RAZON + " Caja trasladada desde el almacén central.", sourceInterface: "script" }, tx);

      for (const hiveId of [f2[0]!.hiveId, f2[1]!.hiveId, nueva.id]) {
        const colony = await tx.colony.create({
          data: {
            hiveId, status: "active", startedAt: VISITA,
            originType: "purchased", originSourceValueId: origenParita!.id,
            originNote: "Núcleo con reina fecunda y en postura, criado y trasladado por Chayanne López (Parita, Herrera). Trasegado a su cámara de cría el 2026-09-02; se repartieron entre los tres nidos los marcos que dejó la colonia anterior.",
            provenanceClass: "direct_observation",
          },
        });
        await tx.colonyEvent.create({
          data: {
            colonyId: colony.id, eventType: "feeding", occurredAt: VISITA,
            operatorPersonId: chayanne!.id,
            feedingMaterial: "jarabe de azúcar", feedingQuantity: 3, feedingUnit: "lb",
            note: "Alimentación de estímulo el día del trasiego, según el informe del 2026-09-02.",
            provenanceClass: "direct_observation",
          },
        });
        await recordAuditEvent({ actorUserAccountId: null, operation: "colony.create", entityType: "colony", entityId: colony.id, after: colony, reason: RAZON, sourceInterface: "script" }, tx);
      }
    },
    { timeout: 120_000 },
  );

  // ── Y la comprobación después ─────────────────────────────────────────────
  for (const s of SITIOS) {
    const sitio = await prisma.location.findFirstOrThrow({ where: { name: s.nombre } });
    const colmenas = await prisma.hive.count({ where: { locationId: sitio.id } });
    const activas = await prisma.colony.count({ where: { status: "active", hive: { locationId: sitio.id } } });
    const evadidas = await prisma.colony.count({ where: { status: "absconded", hive: { locationId: sitio.id } } });
    console.log(`  ${s.nombre}: ${colmenas} colmenas · ${activas} colonia(s) activa(s) · ${evadidas} evadida(s)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
