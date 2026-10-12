/**
 * Elegir el tanque al empezar una fermentación — Parte 2c, arreglos previos §4.1 y decisión D2 de Daniel (2026-10-04).
 *
 * **Lo que cambió.** Hasta hoy `startFermentationRun` sólo guardaba `vesselNote`, el nombre que el operario escribe, y NADIE escribía
 * `vesselEquipmentId`: todo tanque salía libre en `disponibilidadDeRecipientes`. Ahora una fermentación nace con **un tanque
 * registrado O el nombre escrito de uno que no lo está** (D2: pueden venir los dos, y sólo el registrado cuenta como ocupado), y
 * nunca con los dos vacíos.
 *
 * **Lo que NO se rechaza, a propósito (C1/E1).** Un tanque ocupado, o con una condición pendiente, se acepta: sólo se avisa, y el
 * aviso lo pinta el formulario con `motivos`. Rechazarlo aquí convertiría en bloqueo lo que Daniel decidió que sólo avisa.
 *
 * **Cada rechazo lleva su control.** El MISMO lote que se rechazó con el tanque malo empieza con un tanque gemelo que sólo difiere en
 * lo que el caso cambia; sin él, «se rechazó» podría ser un lote que no puede empezar por otra razón.
 *
 * **Por qué el usuario es Farm Operator de SU sitio y no Platform Admin.** Un Platform Admin lo ve todo, y entonces ni «invisible» ni
 * «de otra organización» se podrían probar. Cada tanque lleva un traslado a ese sitio: sin él `objetivoDeEquipo` lo manda al ámbito de
 * plataforma y quien opera NO lo ve. «Sin ubicar» y «en un sitio ajeno» son lo mismo para quien opera: invisible.
 *
 * **Hay DOS comprobaciones de «activo», y las dos son a propósito.** La de fuera de la transacción deja lo retirado fuera de la lista y
 * de la validación; la de dentro (`FOR SHARE`) cierra la carrera con `retirarEquipo`, que toma `FOR UPDATE` sobre la misma fila. Por eso
 * quitar la primera NO hace caer «el tanque retirado se rechaza» —la segunda lo atrapa— y sólo cae la lista; y quitar la segunda sólo
 * hace caer la carrera. Lo miden los flips F4 y F6a de la tarea, y se dice aquí para que ese verde no se lea como un guardia ciego.
 *
 * Grupo `base-sembrada`. No resetea la base compartida: crea lo suyo con `RUN` y lo borra por pasos.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { disponibilidadDeRecipientes, recipientesParaFermentar } from "../../lib/equipos/equipos";
import { startFermentationRun } from "../../lib/traceability/fermentation";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { RecipienteError } from "../../lib/traceability/recipientes";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";

const RUN = `tanque-${Date.now()}`;

let orgId: string, otraOrgId: string;
/** El sitio de quien opera, y otro de la MISMA organización donde no tiene ámbito. */
let sitio: string, sitioAjeno: string;
let operador: string, intruso: string, scopeId: string;
let tipoDeBandeja: string;
let trayCounter = 0;
let consecutivo = 0;
const lotes: string[] = [];
const equipos: string[] = [];
const personas: string[] = [];
const cuentas: string[] = [];

type Entrada = Parameters<typeof startFermentationRun>[1];

async function cuenta(etiqueta: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN})`, locale: "es" },
  });
  personas.push(person.id);
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  cuentas.push(account.id);
  return account.id;
}

async function lugar(etiqueta: string, organizationId: string) {
  const l = await prisma.location.create({
    data: { name: `TEST ${etiqueta} (${RUN})`, locationType: "site", classification: "internal", status: "approved", organizationId },
  });
  return l.id;
}

/** Un lote de cereza en el sitio de quien opera (u otro, si se dice), con su proceso abierto (sin proceso la corrida no empieza: R3). */
async function lote(etiqueta: string, conProceso = true, locationId = sitio) {
  const id = (
    await prisma.lot.create({
      data: {
        lotCode: `${etiqueta}-${++consecutivo}-${RUN}`,
        lotType: "cherry",
        organizationId: orgId,
        locationId,
        status: "approved",
        classification: "internal",
        createdBy: operador,
      },
    })
  ).id;
  lotes.push(id);
  if (conProceso) await abrirProcesoDePrueba(operador, id);
  return id;
}

interface OpcionesDeTanque {
  organizationId?: string;
  kind?: "vessel" | "instrument";
  bandeja?: boolean;
  retirado?: boolean;
  /** Dónde se traslada al darlo de alta. Por omisión, el sitio de quien opera; `null` = ningún traslado (sin ubicar). */
  en?: string | null;
}

/** Un equipo con su traslado al sitio de quien opera, salvo que se diga otra cosa. Devuelve su id. */
async function tanque(nombre: string, o: OpcionesDeTanque = {}) {
  const kind = o.kind ?? "vessel";
  const e = await prisma.equipment.create({
    data: {
      name: `TEST ${nombre} (${RUN})`,
      kind,
      format: kind === "vessel" ? "other" : null,
      organizationId: o.organizationId ?? orgId,
      provenanceClass: "original_record",
      // Una bandeja es un `vessel` con tipo y número (los dos CHECK de 20260918191000): el número es único por organización.
      ...(o.bandeja ? { trayTypeId: tipoDeBandeja, trayNumber: ++trayCounter } : {}),
      // T2: un retirado lleva fecha y motivo (CHECK `equipment_retiro_completo`).
      ...(o.retirado
        ? { lifecycleStatus: "retired" as const, retiredAt: new Date(), retiroMotivo: "TEST: retirado para la prueba" }
        : {}),
    },
  });
  equipos.push(e.id);
  const en = o.en === undefined ? sitio : o.en;
  if (en) {
    await prisma.equipmentTransfer.create({ data: { equipmentId: e.id, toLocationId: en, occurredAt: new Date("2026-08-01T00:00:00Z") } });
  }
  return e.id;
}

const empezar = (lotId: string, extra: Partial<Entrada> = {}) =>
  startFermentationRun(operador, { lotId, startedAt: new Date(), provenanceClass: "original_record", ...extra });

const corridasDe = (lotId: string) =>
  prisma.fermentationRun.count({ where: { transformations: { some: { inputs: { some: { lotId } } } } } });

/** La corrida se rechazó, con un `RecipienteError` y ESE código (la clase importa: la acción traduce por clase). */
async function rechazadoCon(promesa: Promise<unknown>, codigo: string) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "la corrida tenía que rechazarse y empezó").toBeInstanceOf(RecipienteError);
  expect((error as RecipienteError).message).toBe(codigo);
}

/** Se OBSERVA en la base que la lectura `FOR SHARE` de la corrida espera a la sesión `pid`, en vez de inferirlo de que algo tarda. Otra espera de la corrida (su `INSERT`, por la FK) no vale: F6b no caería aquí. */
async function esperarQueAlguienEspere(pid: number) {
  let esperando = 0;
  for (let intento = 0; intento < 100 && esperando === 0; intento++) {
    const [fila] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid)) AND query LIKE '%FOR SHARE%'`;
    esperando = fila?.n ?? 0;
    if (esperando === 0) await new Promise((r) => setTimeout(r, 50));
  }
  expect(esperando, "nadie esperaba al retiro: la lectura FOR SHARE de la corrida no llegó a bloquear la fila del tanque").toBeGreaterThan(0);
}

/**
 * Lo que hará `retirarEquipo` (T2): una transacción que toma `FOR UPDATE` sobre la fila del tanque y la retira, y se QUEDA ABIERTA
 * hasta que se la suelta. `pid` sale cuando la transacción ya tiene la fila bloqueada.
 */
function retenerRetirando(equipmentId: string) {
  let soltar!: () => void;
  const suelta = new Promise<void>((resolver) => {
    soltar = resolver;
  });
  let tomado!: (pid: number) => void;
  let fallo!: (error: unknown) => void;
  const pid = new Promise<number>((resolver, rechazar) => {
    tomado = resolver;
    fallo = rechazar;
  });
  const hecho = prisma.$transaction(
    async (tx) => {
      try {
        await tx.$queryRaw`SELECT 1 FROM "core"."equipment" WHERE "id" = ${equipmentId}::uuid FOR UPDATE`;
        await tx.equipment.update({
          where: { id: equipmentId },
          data: { lifecycleStatus: "retired", retiredAt: new Date(), retiroMotivo: "TEST: el retiro que llega a mitad de camino" },
        });
        const [fila] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        tomado(fila!.pid);
      } catch (error) {
        fallo(error);
        throw error;
      }
      await suelta;
    },
    { timeout: 30000, maxWait: 10000 },
  );
  hecho.catch(() => undefined); // quien la espera la ve rechazarse en `await hecho`; esto sólo evita el rechazo sin atender
  return { pid, soltar, hecho };
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })
  ).id;
  otraOrgId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST otra ${RUN}`, status: "approved", classification: "internal" } })
  ).id;
  sitio = await lugar("Sitio", orgId);
  sitioAjeno = await lugar("Sitio ajeno", orgId);
  operador = await cuenta("Operador");
  intruso = await cuenta("Intruso");
  // Farm Operator de SU sitio. Nunca Platform Admin: ver la cabecera. El intruso no recibe nada.
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitio } })).id;
  await prisma.assignment.create({ data: { userAccountId: operador, roleProfileId: farm.id, scopeId } });
  tipoDeBandeja = (
    await prisma.dryingTrayType.create({
      data: { organizationId: orgId, name: `TEST Tipo de bandeja (${RUN})`, widthCm: 100, lengthCm: 60, entryUnit: "cm" },
    })
  ).id;
}, 60000);

afterAll(async () => {
  // **Cada borrado en su propio `try`, y no una cadena.** Un `afterAll` es una cadena: la primera FK que se queja tira todo lo que
  // viene después. Orden: corridas antes que equipos (la FK es SET NULL, pero es el orden de la casa), traslados antes que equipos,
  // `drying_tray_type` después de `equipment`, organización al final.
  let transformaciones: string[] = [];
  let corridas: string[] = [];
  try {
    const t = await prisma.lotTransformation.findMany({
      where: { inputs: { some: { lotId: { in: lotes } } } },
      select: { id: true, fermentationRunId: true },
    });
    transformaciones = t.map((x) => x.id);
    corridas = t.map((x) => x.fermentationRunId).filter((x): x is string => x !== null);
  } catch (e) {
    process.stdout.write(`\n[FUGA] no se pudieron buscar las corridas de ${RUN}: ${(e as Error).message}\n`);
  }
  const pasos: [string, () => Promise<unknown>][] = [
    // Cubre los `fermentation_run.start` y los `lot_process.open`: los escribió el operador.
    ["auditEvent", () => prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: [operador, intruso] } }) })],
    ["lotTransformationInput", () => prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) })],
    ["lotTransformationOutput", () => prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) })],
    ["lotTransformation", () => prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformaciones } }) })],
    ["fermentationRun", () => prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: corridas } }) })],
    ["lotProcess", () => borrarProcesosDeLotesDonde({ id: { in: lotes } })],
    ["lot", () => prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) })],
    ["equipmentTransfer", () => prisma.equipmentTransfer.deleteMany({ where: assertDefinedWhere({ equipmentId: { in: equipos } }) })],
    ["equipment", () => prisma.equipment.deleteMany({ where: assertDefinedWhere({ id: { in: equipos } }) })],
    ["dryingTrayType", () => prisma.dryingTrayType.deleteMany({ where: assertDefinedWhere({ id: tipoDeBandeja }) })],
    ["assignment", () => prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: operador }) })],
    ["scope", () => prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) })],
    ["location", () => prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [sitio, sitioAjeno] } }) })],
    ["userAccount", () => prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) })],
    ["person", () => prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) })],
    ["organization", () => prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [orgId, otraOrgId] } }) })],
  ];
  const fallos: string[] = [];
  for (const [nombre, fn] of pasos) {
    try {
      await fn();
    } catch (e) {
      const lineas = (e as Error).message.split("\n").map((l) => l.trim()).filter(Boolean);
      fallos.push(`${nombre}: ${lineas[lineas.length - 1] ?? "(sin mensaje)"}`);
    }
  }
  // `process.stdout.write` y no `console.log`: vitest intercepta la consola y sólo la saca para las pruebas que FALLAN.
  if (fallos.length > 0) process.stdout.write(`\n[FUGA] la limpieza de ${RUN} dejó filas: ${fallos.join(" | ")}\n`);
}, 60000);

describe("Elegir el tanque al fermentar (§4.1, D2)", () => {
  it("un tanque registrado se escribe en la corrida, y desde ese momento el tanque está en uso", async () => {
    const lotId = await lote("VALIDO");
    const t = await tanque("tanque válido");
    // Control: ANTES de empezar el tanque sale libre y sano y sin lote. Sin esto, el «en uso» de abajo podría venir de otra cosa.
    const antes = (await disponibilidadDeRecipientes(operador)).filas.find((f) => f.id === t);
    expect(antes, "quien opera tiene que VER el tanque de la prueba").toBeDefined();
    expect(antes?.clasificacion.libreYSano).toBe(true);
    expect(antes?.lotId).toBeNull();

    const { run } = await empezar(lotId, { vesselEquipmentId: t });
    expect(run.vesselEquipmentId).toBe(t);
    expect(run.vesselNote).toBeNull();

    const despues = (await disponibilidadDeRecipientes(operador)).filas.find((f) => f.id === t);
    expect(despues?.clasificacion.motivos).toEqual(["EN_USO"]);
    expect(despues?.lotId).toBe(lotId);

    // La auditoría NO gana un evento: el `after` del `fermentation_run.start` ya lleva la clave (corridaConProceso.test.ts lo exige).
    const evento = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "fermentation_run", entityId: run.id, operation: "fermentation_run.start" },
    });
    expect((evento.after as { vesselEquipmentId?: string } | null)?.vesselEquipmentId).toBe(t);
  });

  it.each([
    ["sin nada", {}],
    ["con la nota vacía", { vesselNote: "" }],
    ["con la nota en blanco", { vesselNote: "   " }],
    ["con el tanque en blanco y sin nota", { vesselEquipmentId: "  " }],
  ] as [string, Partial<Entrada>][])(
    "sin tanque y sin nombre (%s) se rechaza con recipiente_o_nota_obligatorio, y no queda ninguna corrida",
    async (_caso, extra) => {
      const lotId = await lote("SIN-NADA");
      await rechazadoCon(empezar(lotId, extra), "recipiente_o_nota_obligatorio");
      expect(await corridasDe(lotId)).toBe(0);
      // Control: el MISMO lote empieza en cuanto trae un nombre. El rechazo no era del lote.
      const { run } = await empezar(lotId, { vesselNote: "Tanque de la esquina" });
      expect(run.vesselNote).toBe("Tanque de la esquina");
    },
  );

  it("sólo el nombre escrito pasa, como hoy: la corrida guarda la nota, ningún tanque, y no ocupa ninguno", async () => {
    const lotId = await lote("SOLO-NOTA");
    const libre = await tanque("tanque que nadie eligió");
    const { run } = await empezar(lotId, { vesselNote: "Tanque de la esquina" });
    expect(run.vesselNote).toBe("Tanque de la esquina");
    expect(run.vesselEquipmentId).toBeNull();
    // Sólo el REGISTRADO cuenta como ocupado: el tanque de al lado sigue libre.
    const fila = (await disponibilidadDeRecipientes(operador)).filas.find((f) => f.id === libre);
    expect(fila?.clasificacion.libreYSano).toBe(true);
  });

  it("el tanque y el nombre pueden venir los dos: se guardan los dos", async () => {
    const lotId = await lote("LOS-DOS");
    const t = await tanque("tanque con apodo");
    const { run } = await empezar(lotId, { vesselEquipmentId: t, vesselNote: "el grande" });
    expect(run.vesselEquipmentId).toBe(t);
    expect(run.vesselNote).toBe("el grande");
  });

  const CASOS_DE_RECHAZO: { nombre: string; malo: () => Promise<string> }[] = [
    { nombre: "de otra organización, aunque quien opera lo ve (está en su sitio)", malo: () => tanque("ajeno", { organizationId: otraOrgId }) },
    { nombre: "que es una bandeja", malo: () => tanque("bandeja", { bandeja: true }) },
    { nombre: "retirado", malo: () => tanque("retirado", { retirado: true }) },
    { nombre: "que es un instrumento y no un recipiente", malo: () => tanque("refractómetro", { kind: "instrument" }) },
    { nombre: "que está en un sitio donde quien opera no tiene ámbito", malo: () => tanque("en el sitio ajeno", { en: sitioAjeno }) },
    { nombre: "sin ningún traslado (sin ubicar)", malo: () => tanque("sin ubicar", { en: null }) },
  ];

  it.each(CASOS_DE_RECHAZO)(
    "el tanque $nombre se rechaza con recipiente_no_disponible, y el mismo lote empieza con su gemelo",
    async ({ malo }) => {
      const lotId = await lote("RECHAZO");
      await rechazadoCon(empezar(lotId, { vesselEquipmentId: await malo() }), "recipiente_no_disponible");
      expect(await corridasDe(lotId)).toBe(0);
      // Control: el MISMO lote, con un tanque que sólo difiere en lo que el caso cambia, empieza. Sin esto, el rechazo de arriba
      // podría ser de un lote que no puede empezar por otra razón.
      const gemelo = await tanque("gemelo del rechazo");
      const { run } = await empezar(lotId, { vesselEquipmentId: gemelo });
      expect(run.vesselEquipmentId).toBe(gemelo);
    },
  );

  it("un id que no es un UUID, o que no existe, se rechaza con recipiente_no_disponible y no con un error de base", async () => {
    const lotId = await lote("ID-RARO");
    for (const id of ["no-es-un-uuid", randomUUID()]) {
      await rechazadoCon(empezar(lotId, { vesselEquipmentId: id }), "recipiente_no_disponible");
    }
    expect(await corridasDe(lotId)).toBe(0);
    // Control: con un tanque de verdad, el mismo lote empieza.
    const t = await tanque("tanque de verdad");
    expect((await empezar(lotId, { vesselEquipmentId: t })).run.vesselEquipmentId).toBe(t);
  });

  it("un tanque ocupado se ACEPTA: sólo se avisa, no se rechaza (C1/E1)", async () => {
    const t = await tanque("tanque compartido");
    const primera = await lote("OCUPADO-1");
    const segunda = await lote("OCUPADO-2");
    const a = await empezar(primera, { vesselEquipmentId: t });
    expect(a.run.vesselEquipmentId).toBe(t);
    // Control: ahora el tanque SÍ está en uso. Lo que sigue no es una prueba sobre un tanque libre.
    const enUso = (await disponibilidadDeRecipientes(operador)).filas.find((f) => f.id === t);
    expect(enUso?.clasificacion.motivos).toEqual(["EN_USO"]);
    // La segunda fermentación sobre el MISMO tanque ocupado empieza.
    const b = await empezar(segunda, { vesselEquipmentId: t });
    expect(b.run.vesselEquipmentId).toBe(t);
    expect(b.run.id).not.toBe(a.run.id);
    // Y la lista lo sigue ofreciendo, avisando.
    const tercera = await lote("OCUPADO-3", false);
    const opcion = (await recipientesParaFermentar(operador, tercera)).find((o) => o.id === t);
    expect(opcion).toMatchObject({ libreYSano: false, motivos: ["EN_USO"] });
  });

  it("un tanque con una condición pendiente se ACEPTA: la corrida empieza en él y escribe su clave (C1/E1)", async () => {
    const lotId = await lote("CONDICION");
    const t = await tanque("tanque que pide limpieza");
    await prisma.equipmentConditionReport.create({ data: { equipmentId: t, condition: "needs_cleaning", occurredAt: new Date() } });
    // Control: ANTES de empezar el tanque pide limpieza (un informe sin resolver) y no está en uso. Sin esto, «se aceptó» podría ser
    // un tanque sano: el informe no habría llegado a contar.
    const antes = (await disponibilidadDeRecipientes(operador)).filas.find((f) => f.id === t);
    expect(antes?.clasificacion.motivos).toEqual(["CONDICION"]);

    // Con el servicio real, no con la lista: lo que se prueba es que `startFermentationRun` no lo rechaza.
    const { run } = await empezar(lotId, { vesselEquipmentId: t });
    expect(run.vesselEquipmentId).toBe(t);
    // La clave está en la FILA guardada, no sólo en lo que devuelve el servicio.
    const guardada = await prisma.fermentationRun.findUniqueOrThrow({ where: { id: run.id }, select: { vesselEquipmentId: true } });
    expect(guardada.vesselEquipmentId).toBe(t);
    // Y desde ese momento el tanque avisa de las dos cosas: está en uso Y sigue pidiendo limpieza.
    const despues = (await disponibilidadDeRecipientes(operador)).filas.find((f) => f.id === t);
    expect(despues?.clasificacion.motivos).toEqual(["EN_USO", "CONDICION"]);
  });

  it("recipientesParaFermentar ofrece sólo los candidatos, los libres y sanos primero y luego por nombre", async () => {
    const lotId = await lote("LISTA", false);
    // Los candidatos. Los nombres están elegidos para que el orden por nombre y el orden pedido DISCREPEN: por nombre iría «A»,
    // «B», «C», «Z»; el pedido es los dos libres primero y después los que avisan.
    const ocupado = await tanque("LISTA A ocupado");
    const sucio = await tanque("LISTA B sucio");
    await tanque("LISTA Z libre");
    await tanque("LISTA C libre");
    await prisma.equipmentConditionReport.create({ data: { equipmentId: sucio, condition: "needs_cleaning", occurredAt: new Date() } });
    await empezar(await lote("LISTA-USO"), { vesselEquipmentId: ocupado });
    // Lo que existe y NO es candidato, cada uno por su motivo. Todos llevan el prefijo «LISTA»: si alguno se cuela, sale en la comparación.
    await tanque("LISTA bandeja", { bandeja: true });
    await tanque("LISTA retirado", { retirado: true });
    await tanque("LISTA instrumento", { kind: "instrument" });
    await tanque("LISTA de otra organización", { organizationId: otraOrgId });
    await tanque("LISTA sin ubicar", { en: null });
    await tanque("LISTA en un sitio ajeno", { en: sitioAjeno });

    const opciones = (await recipientesParaFermentar(operador, lotId)).filter((o) => o.label.startsWith("TEST LISTA "));
    expect(opciones.map((o) => [o.label, o.libreYSano, o.motivos])).toEqual([
      [`TEST LISTA C libre (${RUN})`, true, []],
      [`TEST LISTA Z libre (${RUN})`, true, []],
      [`TEST LISTA A ocupado (${RUN})`, false, ["EN_USO"]],
      [`TEST LISTA B sucio (${RUN})`, false, ["CONDICION"]],
    ]);
  });

  it("el retiro que llega entre la comprobación y la corrida gana: el tanque retirado no recibe la fermentación", async () => {
    const lotId = await lote("CARRERA");
    const t = await tanque("tanque que se retira a mitad de camino");
    // Una transacción abierta que ya retiró el tanque pero no confirma: la comprobación de FUERA de la transacción todavía lo ve activo.
    const retiro = retenerRetirando(t);
    try {
      const pid = await retiro.pid;
      const empezando = empezar(lotId, { vesselEquipmentId: t });
      empezando.catch(() => undefined); // el rechazo se atiende más abajo
      await esperarQueAlguienEspere(pid);
      retiro.soltar();
      await retiro.hecho;
      await rechazadoCon(empezando, "recipiente_no_disponible");
    } finally {
      retiro.soltar(); // si algo falló antes, la transacción no puede quedarse abierta con la fila bloqueada
      await retiro.hecho.catch(() => undefined);
    }
    expect(await corridasDe(lotId)).toBe(0);
  });

  it("quien no gestiona el lote recibe el rechazo de acceso, no uno del recipiente: no se entera de qué tanques existen", async () => {
    const lotId = await lote("ACCESO");
    const t = await tanque("tanque que el intruso no debería poder ni nombrar");
    // Un tanque que existe, uno que no existe y ninguno: los tres dan el MISMO rechazo, el de acceso.
    for (const extra of [{ vesselEquipmentId: t }, { vesselEquipmentId: randomUUID() }, {}] as Partial<Entrada>[]) {
      await expect(
        startFermentationRun(intruso, { lotId, startedAt: new Date(), provenanceClass: "original_record", ...extra }),
      ).rejects.toBeInstanceOf(TraceabilityAccessError);
    }
    expect(await corridasDe(lotId)).toBe(0);
    // Control: quien SÍ gestiona el lote empieza con el mismo tanque.
    expect((await empezar(lotId, { vesselEquipmentId: t })).run.vesselEquipmentId).toBe(t);
  });

  it("recipientesParaFermentar no lista nada a quien no ve el lote, aunque vea los tanques: rechazo de acceso de la casa (D11)", async () => {
    // D11 (Daniel, 2026-10-06): la lista comprueba ELLA MISMA el lote, con `requireLotAccess(…, "view", …)` como `getLotSummary`.
    // El lote vive en el sitio ajeno, donde quien opera no tiene ámbito; el tanque, en SU sitio, donde sí lo ve. Sin la comprobación
    // del lote, la lista le enseñaría el tanque de un lote que no puede abrir.
    const ajeno = await lote("VISIBILIDAD-AJENO", false, sitioAjeno);
    const propio = await lote("VISIBILIDAD-PROPIO", false);
    const t = await tanque("VISIBILIDAD tanque que quien opera ve");
    const error = await recipientesParaFermentar(operador, ajeno).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error, "la lista tenía que rechazarse y devolvió tanques").toBeInstanceOf(TraceabilityAccessError);
    expect((error as TraceabilityAccessError).message).toBe("no_lot_access");
    // Control: el MISMO usuario, con un lote de la MISMA organización que sí ve, recibe ese tanque. El rechazo era del lote, no de
    // los tanques.
    const opciones = await recipientesParaFermentar(operador, propio);
    expect(opciones.filter((o) => o.label.startsWith("TEST VISIBILIDAD ")).map((o) => o.id)).toEqual([t]);
  });
});
