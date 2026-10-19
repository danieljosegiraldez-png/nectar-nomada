import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  EquipoError,
  disponibilidadDeRecipientes,
  reactivarEquipo,
  registrarEquipo,
  retirarEquipo,
} from "../../lib/equipos/equipos";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

/**
 * Retirar y reactivar un equipo (Parte 2c §4.5; decisión D3 de Daniel, 2026-10-04): **motivo obligatorio, fecha del
 * servidor, reversible, y un equipo en uso no se retira**.
 *
 * **«En uso» son tres cosas**, y cada una tiene su prueba abierta/cerrada: una fermentación abierta con este tanque, una bandeja
 * con fila abierta y —decisión D7 de Daniel, 2026-10-05— una tostadora con un tueste abierto (`RoastSession` con `endedAt` nulo).
 * Los tuestes los crea Prisma a pelo (`purpose` y `startedAt` son lo único obligatorio): lo que se prueba es la LECTURA de
 * `retirarEquipo`, no `recordRoastSession`.
 *
 * **Quién prueba qué.** `jefeA` es Farm Manager acotado al sitio A (gestiona), `operarioA` es Farm Operator del mismo
 * sitio (ve e informa, NO gestiona) y `ajeno` no tiene ninguna asignación. **Nunca un Platform Admin**: ve la base entera
 * y un rechazo de permiso hecho con él pasaría aunque la regla estuviera rota (CLAUDE.md, «Un admin de plataforma ve la
 * base compartida entera»). Cada tanque lleva su traslado al sitio A —`registrarEquipo` con `initialLocationId` lo
 * escribe—: sin él, el permiso se resolvería contra la plataforma y `jefeA` no lo gestionaría.
 *
 * **Cada rechazo lleva al lado su control positivo** (lo válido SÍ entra): sin él, «no entró» no prueba nada.
 *
 * **Las dos pruebas de «dos a la vez» son el guardián del `FOR UPDATE`.** Un `UPDATE` toma `FOR NO KEY UPDATE`,
 * que NO choca con el `FOR KEY SHARE` que toma la clave ajena al insertar una corrida con este tanque; sin el bloqueo
 * explícito, retirar y empezar una fermentación a la vez dejarían un tanque retirado con una corrida abierta, y las dos
 * comprobaciones habrían salido bien. Se prueba con una transacción ajena **retenida**, que dice su `pid`
 * (`SELECT pg_backend_pid()` dentro de ella), y observando en la base que la sentencia `FOR UPDATE` de `retirarEquipo` está
 * bloqueada **por ese pid** (`pg_blocking_pids`), no confiando en el azar de dos llamadas simultáneas. Que espere a ESA
 * transacción, y no a cualquier otra sesión de la base que casualmente espere un candado sobre `core.equipment`, es lo que
 * hace que el «esperando» no lo pueda dar otra prueba que corra a la vez. (Misma forma que la carrera de T3,
 * `esperarQueAlguienEspere`.)
 */
let f: Fixtures;
let tipoDeBandeja: string;
let contador = 0;
const equipos: string[] = [];
const corridas: string[] = [];
const secados: string[] = [];
const tuestes: string[] = [];

/** Un tanque en el sitio A, registrado por el servicio (con su traslado inicial). */
async function tanque() {
  const e = await registrarEquipo(f.jefeA, {
    name: `TEST retiro ${f.run} ${++contador}`,
    kind: "vessel",
    organizationId: f.orgA,
    initialLocationId: f.sitioA,
    provenanceClass: "original_record",
  });
  equipos.push(e.id);
  return e;
}

/** Una bandeja numerada en el sitio A (la crea Prisma: `registrarEquipo` no sabe de tipos de bandeja). */
async function bandeja() {
  const e = await prisma.equipment.create({
    data: {
      name: `TEST retiro bandeja ${f.run} ${++contador}`,
      kind: "vessel",
      format: "other",
      organizationId: f.orgA,
      provenanceClass: "original_record",
      trayTypeId: tipoDeBandeja,
      trayNumber: ++contador,
    },
  });
  equipos.push(e.id);
  await prisma.equipmentTransfer.create({ data: { equipmentId: e.id, toLocationId: f.sitioA, occurredAt: new Date("2026-08-01T00:00:00Z") } });
  return e;
}

/** Una fermentación con este tanque como recipiente; abierta salvo que se diga lo contrario. */
async function corrida(equipmentId: string, cerrada = false) {
  const r = await prisma.fermentationRun.create({
    data: {
      startedAt: new Date("2026-09-01T10:00:00Z"),
      endedAt: cerrada ? new Date("2026-09-03T10:00:00Z") : null,
      vesselNote: `TEST ${f.run}`,
      vesselEquipmentId: equipmentId,
    },
  });
  corridas.push(r.id);
  return r;
}

/** Una fila ABIERTA de bandeja (`hasta` nulo) en un secado huérfano, como en `bandejasEnLaBase.test.ts`. */
async function cargarEnSecado(equipmentId: string) {
  const run = await prisma.dryingRun.create({ data: { startedAt: new Date("2026-09-01T10:00:00Z") } });
  secados.push(run.id);
  return prisma.dryingRunTray.create({
    data: { dryingRunId: run.id, equipmentId, desde: new Date("2026-09-01T11:00:00Z"), provenanceClass: "original_record" },
  });
}

/** Una tostadora (`kind` machine) en el sitio A, registrada por el servicio (con su traslado inicial). */
async function tostadora() {
  const e = await registrarEquipo(f.jefeA, {
    name: `TEST retiro tostadora ${f.run} ${++contador}`,
    kind: "machine",
    organizationId: f.orgA,
    initialLocationId: f.sitioA,
    provenanceClass: "original_record",
  });
  equipos.push(e.id);
  return e;
}

/** Un tueste con esta tostadora; ABIERTO (`endedAt` nulo, como lo deja un tueste registrado sin hora de fin) salvo que se diga lo contrario. */
async function tueste(equipmentId: string, cerrado = false) {
  const r = await prisma.roastSession.create({
    data: {
      startedAt: new Date("2026-09-01T10:00:00Z"),
      endedAt: cerrado ? new Date("2026-09-01T10:15:00Z") : null,
      purpose: "production",
      equipmentId,
    },
  });
  tuestes.push(r.id);
  return r;
}

const fila = (id: string) => prisma.equipment.findUniqueOrThrow({ where: { id } });
const eventos = (id: string, operation: string) => prisma.auditEvent.count({ where: { entityType: "equipment", entityId: id, operation } });

/**
 * Espera a OBSERVAR en la base que la sentencia `… FROM "core"."equipment" … FOR UPDATE` de `retirarEquipo` está bloqueada
 * **por la sesión `pidRetenido`** —la transacción ajena que la prueba retiene—, o a que `terminado()` diga que acabó.
 * `pg_blocking_pids(pid)` nombra quién bloquea a quién: la espera de cualquier otra sesión de la base, o la de otra sentencia
 * de `retirarEquipo` (su `UPDATE`, que también esperaría si le quitaran el `FOR UPDATE`), no cuenta. La propia consulta de
 * aquí casa con el `LIKE` (lo lleva escrito), pero nadie la bloquea, así que tampoco cuenta. Misma forma que la carrera de T3.
 */
async function seBloquea(pidRetenido: number, terminado: () => boolean): Promise<boolean> {
  for (let i = 0; i < 100 && !terminado(); i++) {
    const [espera] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n
        FROM pg_stat_activity
       WHERE ${pidRetenido}::int = ANY(pg_blocking_pids(pid))
         AND query LIKE '%"core"."equipment"%FOR UPDATE%'`;
    if ((espera?.n ?? 0) > 0) return !terminado();
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

beforeAll(async () => {
  f = await montarFixtures("ret");
  tipoDeBandeja = (
    await prisma.dryingTrayType.create({
      data: { organizationId: f.orgA, name: `TEST tipo ${f.run}`, widthCm: 100, lengthCm: 60, entryUnit: "cm" },
    })
  ).id;
});

afterAll(async () => {
  // Cada borrado en su propio `try`: un `afterAll` es una cadena y la primera FK que se queja tira el resto.
  // Orden: filas de bandeja, corridas y tuestes antes que los equipos; traslados antes que los equipos; el tipo de bandeja
  // DESPUÉS de los equipos; las fixtures (que borran la organización) al final.
  const pasos: [string, () => Promise<unknown>][] = [
    ["dryingRunTray", () => prisma.dryingRunTray.deleteMany({ where: assertDefinedWhere({ dryingRunId: { in: secados } }) })],
    ["dryingRun", () => prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: secados } }) })],
    ["fermentationRun", () => prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: corridas } }) })],
    ["roastSession", () => prisma.roastSession.deleteMany({ where: assertDefinedWhere({ id: { in: tuestes } }) })],
    ["equipmentTransfer", () => prisma.equipmentTransfer.deleteMany({ where: assertDefinedWhere({ equipmentId: { in: equipos } }) })],
    ["auditEvent", () => prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "equipment", entityId: { in: equipos } }) })],
    ["equipment", () => prisma.equipment.deleteMany({ where: assertDefinedWhere({ id: { in: equipos } }) })],
    ["dryingTrayType", () => prisma.dryingTrayType.deleteMany({ where: assertDefinedWhere({ id: { in: [tipoDeBandeja] } }) })],
    ["fixtures", () => f.limpiar()],
  ];
  const fallos: string[] = [];
  for (const [nombre, paso] of pasos) {
    try {
      await paso();
    } catch (e) {
      const lineas = (e as Error).message.split("\n").map((l) => l.trim()).filter(Boolean);
      fallos.push(`${nombre}: ${lineas[lineas.length - 1] ?? "(sin mensaje)"}`);
    }
  }
  // `process.stdout.write` y no `console.log`: vitest esconde la consola de lo que pasa.
  if (fallos.length > 0) process.stdout.write(`\n[FUGA] la limpieza de ${f?.run} dejó filas: ${fallos.join(" | ")}\n`);
});

describe("retirarEquipo", () => {
  it("retira un tanque libre: estado, fecha del servidor, motivo recortado, y su auditoría con antes, después y motivo", async () => {
    const e = await tanque();
    const antes = Date.now();
    await retirarEquipo(f.jefeA, e.id, "  se rompió la válvula  ");
    const despues = Date.now();

    const r = await fila(e.id);
    expect(r.lifecycleStatus).toBe("retired");
    expect(r.retiroMotivo).toBe("se rompió la válvula");
    expect(r.retiredAt).not.toBeNull();
    // La fecha la pone el servidor: cae entre el momento de llamar y el de volver.
    expect(r.retiredAt!.getTime()).toBeGreaterThanOrEqual(antes);
    expect(r.retiredAt!.getTime()).toBeLessThanOrEqual(despues);

    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "equipment", entityId: e.id, operation: "equipment.retire" } });
    expect(ev.actorUserAccountId).toBe(f.jefeA);
    expect(ev.reason).toBe("se rompió la válvula");
    expect(ev.before).toEqual({ lifecycleStatus: "active", retiredAt: null, retiroMotivo: null });
    expect(ev.after).toEqual({ lifecycleStatus: "retired", retiredAt: r.retiredAt!.toISOString(), retiroMotivo: "se rompió la válvula" });
  });

  it("sin motivo no retira: vacío o sólo espacios dicen motivo_obligatorio, y el equipo sigue activo", async () => {
    const e = await tanque();
    for (const motivo of ["", "   ", "\n\t"]) {
      await expect(retirarEquipo(f.jefeA, e.id, motivo)).rejects.toThrow(new EquipoError("motivo_obligatorio"));
    }
    const intacto = await fila(e.id);
    expect(intacto.lifecycleStatus).toBe("active");
    expect(intacto.retiredAt).toBeNull();
    expect(intacto.retiroMotivo).toBeNull();
    // Control positivo: el MISMO equipo, con motivo, sí se retira.
    await retirarEquipo(f.jefeA, e.id, "ahora con motivo");
    expect((await fila(e.id)).lifecycleStatus).toBe("retired");
  });

  it("un tanque con una fermentación abierta no se retira: equipo_en_uso, sin dejar nada a medias", async () => {
    const e = await tanque();
    await corrida(e.id);
    await expect(retirarEquipo(f.jefeA, e.id, "se rompió")).rejects.toThrow(new EquipoError("equipo_en_uso"));
    const intacto = await fila(e.id);
    expect(intacto.lifecycleStatus).toBe("active");
    expect(intacto.retiredAt).toBeNull();
    expect(intacto.retiroMotivo).toBeNull();
    expect(await eventos(e.id, "equipment.retire")).toBe(0);
  });

  it("con esa misma corrida cerrada sí se retira", async () => {
    const e = await tanque();
    const abierta = await corrida(e.id);
    await expect(retirarEquipo(f.jefeA, e.id, "se rompió")).rejects.toThrow(new EquipoError("equipo_en_uso"));
    await prisma.fermentationRun.update({ where: { id: abierta.id }, data: { endedAt: new Date("2026-09-03T10:00:00Z") } });
    await retirarEquipo(f.jefeA, e.id, "se rompió");
    expect((await fila(e.id)).lifecycleStatus).toBe("retired");
  });

  it("una fermentación abierta en OTRO tanque no lo retiene", async () => {
    const ocupado = await tanque();
    const libre = await tanque();
    await corrida(ocupado.id);
    await retirarEquipo(f.jefeA, libre.id, "libre");
    expect((await fila(libre.id)).lifecycleStatus).toBe("retired");
    expect((await fila(ocupado.id)).lifecycleStatus).toBe("active");
  });

  it("una bandeja con fila abierta no se retira: equipo_en_uso", async () => {
    const b = await bandeja();
    await cargarEnSecado(b.id);
    await expect(retirarEquipo(f.jefeA, b.id, "se rompió")).rejects.toThrow(new EquipoError("equipo_en_uso"));
    expect((await fila(b.id)).lifecycleStatus).toBe("active");
    expect(await eventos(b.id, "equipment.retire")).toBe(0);
  });

  it("con la fila de la bandeja cerrada (bajada) sí se retira", async () => {
    const b = await bandeja();
    const carga = await cargarEnSecado(b.id);
    await expect(retirarEquipo(f.jefeA, b.id, "se rompió")).rejects.toThrow(new EquipoError("equipo_en_uso"));
    await prisma.dryingRunTray.update({ where: { id: carga.id }, data: { hasta: new Date("2026-09-02T10:00:00Z") } });
    await retirarEquipo(f.jefeA, b.id, "se rompió");
    expect((await fila(b.id)).lifecycleStatus).toBe("retired");
  });

  it("una tostadora con un tueste abierto no se retira: equipo_en_uso, sin dejar nada a medias (D7)", async () => {
    const t = await tostadora();
    await tueste(t.id);
    await expect(retirarEquipo(f.jefeA, t.id, "se rompió")).rejects.toThrow(new EquipoError("equipo_en_uso"));
    const intacta = await fila(t.id);
    expect(intacta.lifecycleStatus).toBe("active");
    expect(intacta.retiredAt).toBeNull();
    expect(intacta.retiroMotivo).toBeNull();
    expect(await eventos(t.id, "equipment.retire")).toBe(0);
  });

  it("con ese mismo tueste cerrado (con su hora de fin) sí se retira", async () => {
    const t = await tostadora();
    const abierto = await tueste(t.id);
    await expect(retirarEquipo(f.jefeA, t.id, "se rompió")).rejects.toThrow(new EquipoError("equipo_en_uso"));
    await prisma.roastSession.update({ where: { id: abierto.id }, data: { endedAt: new Date("2026-09-01T10:15:00Z") } });
    await retirarEquipo(f.jefeA, t.id, "se rompió");
    expect((await fila(t.id)).lifecycleStatus).toBe("retired");
  });

  it("un tueste abierto en OTRA tostadora no la retiene, y uno que nació cerrado tampoco", async () => {
    const ocupada = await tostadora();
    const libre = await tostadora();
    const cerrada = await tostadora();
    await tueste(ocupada.id);
    await tueste(cerrada.id, true);
    await retirarEquipo(f.jefeA, libre.id, "libre");
    await retirarEquipo(f.jefeA, cerrada.id, "con su tueste ya cerrado");
    expect((await fila(libre.id)).lifecycleStatus).toBe("retired");
    expect((await fila(cerrada.id)).lifecycleStatus).toBe("retired");
    expect((await fila(ocupada.id)).lifecycleStatus).toBe("active");
  });

  it("retirar dos veces dice equipo_ya_retirado y no pisa el motivo ni la fecha; un equipo dado de baja (disposed) también", async () => {
    const e = await tanque();
    await retirarEquipo(f.jefeA, e.id, "primera");
    const primera = await fila(e.id);
    await expect(retirarEquipo(f.jefeA, e.id, "segunda")).rejects.toThrow(new EquipoError("equipo_ya_retirado"));
    const despues = await fila(e.id);
    expect(despues.retiroMotivo).toBe("primera");
    expect(despues.retiredAt!.getTime()).toBe(primera.retiredAt!.getTime());
    expect(await eventos(e.id, "equipment.retire")).toBe(1);

    const baja = await tanque();
    await prisma.equipment.update({ where: { id: baja.id }, data: { lifecycleStatus: "disposed" } });
    await expect(retirarEquipo(f.jefeA, baja.id, "x")).rejects.toThrow(new EquipoError("equipo_ya_retirado"));
    expect((await fila(baja.id)).lifecycleStatus).toBe("disposed");
  });

  it("quien no gestiona —un Farm Operator, o alguien sin asignación— recibe forbidden y el equipo sigue activo", async () => {
    const e = await tanque();
    for (const [quien, etiqueta] of [[f.operarioA, "Farm Operator"], [f.ajeno, "sin asignación"]] as const) {
      await expect(retirarEquipo(quien, e.id, "intento"), etiqueta).rejects.toThrow(new EquipoError("forbidden"));
    }
    expect((await fila(e.id)).lifecycleStatus).toBe("active");
    expect(await eventos(e.id, "equipment.retire")).toBe(0);
    // Control positivo: quien sí gestiona, sobre el mismo equipo, sí puede.
    await retirarEquipo(f.jefeA, e.id, "ahora sí");
    expect((await fila(e.id)).lifecycleStatus).toBe("retired");
  });

  it("un equipo que no existe dice equipment_not_found", async () => {
    await expect(retirarEquipo(f.jefeA, "00000000-0000-4000-8000-000000000000", "x")).rejects.toThrow(new EquipoError("equipment_not_found"));
  });
});

describe("reactivarEquipo", () => {
  it("deja el equipo activo, con fecha y motivo en null, y el motivo vive en la auditoría con el retiro en before", async () => {
    const e = await tanque();
    await retirarEquipo(f.jefeA, e.id, "se rompió");
    const retirado = await fila(e.id);
    await reactivarEquipo(f.jefeA, e.id, "  ya se arregló  ");

    const r = await fila(e.id);
    expect(r.lifecycleStatus).toBe("active");
    expect(r.retiredAt).toBeNull();
    expect(r.retiroMotivo).toBeNull();

    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "equipment", entityId: e.id, operation: "equipment.reactivate" } });
    expect(ev.actorUserAccountId).toBe(f.jefeA);
    expect(ev.reason).toBe("ya se arregló");
    expect(ev.before).toEqual({ lifecycleStatus: "retired", retiredAt: retirado.retiredAt!.toISOString(), retiroMotivo: "se rompió" });
    expect(ev.after).toEqual({ lifecycleStatus: "active", retiredAt: null, retiroMotivo: null });
  });

  it("sin motivo no reactiva: motivo_obligatorio, y sigue retirado", async () => {
    const e = await tanque();
    await retirarEquipo(f.jefeA, e.id, "se rompió");
    for (const motivo of ["", "   "]) {
      await expect(reactivarEquipo(f.jefeA, e.id, motivo)).rejects.toThrow(new EquipoError("motivo_obligatorio"));
    }
    expect((await fila(e.id)).lifecycleStatus).toBe("retired");
    // Control positivo: con motivo, el mismo equipo sí vuelve.
    await reactivarEquipo(f.jefeA, e.id, "ya está");
    expect((await fila(e.id)).lifecycleStatus).toBe("active");
  });

  it("uno activo, o uno disposed, dice equipo_no_retirado", async () => {
    const activo = await tanque();
    await expect(reactivarEquipo(f.jefeA, activo.id, "x")).rejects.toThrow(new EquipoError("equipo_no_retirado"));
    expect(await eventos(activo.id, "equipment.reactivate")).toBe(0);

    const baja = await tanque();
    await prisma.equipment.update({ where: { id: baja.id }, data: { lifecycleStatus: "disposed" } });
    await expect(reactivarEquipo(f.jefeA, baja.id, "x")).rejects.toThrow(new EquipoError("equipo_no_retirado"));
    expect((await fila(baja.id)).lifecycleStatus).toBe("disposed");
  });

  it("un Farm Operator recibe forbidden y el equipo sigue retirado", async () => {
    const e = await tanque();
    await retirarEquipo(f.jefeA, e.id, "se rompió");
    await expect(reactivarEquipo(f.operarioA, e.id, "intento")).rejects.toThrow(new EquipoError("forbidden"));
    await expect(reactivarEquipo(f.ajeno, e.id, "intento")).rejects.toThrow(new EquipoError("forbidden"));
    expect((await fila(e.id)).lifecycleStatus).toBe("retired");
    // Control positivo.
    await reactivarEquipo(f.jefeA, e.id, "ahora sí");
    expect((await fila(e.id)).lifecycleStatus).toBe("active");
  });

  it("retirar, reactivar y volver a retirar: el segundo retiro es limpio, con su propia fecha y su propio motivo", async () => {
    const e = await tanque();
    await retirarEquipo(f.jefeA, e.id, "primer retiro");
    const primero = await fila(e.id);
    await reactivarEquipo(f.jefeA, e.id, "vuelve");
    await retirarEquipo(f.jefeA, e.id, "segundo retiro");
    const segundo = await fila(e.id);
    expect(segundo.lifecycleStatus).toBe("retired");
    expect(segundo.retiroMotivo).toBe("segundo retiro");
    expect(segundo.retiredAt!.getTime()).toBeGreaterThanOrEqual(primero.retiredAt!.getTime());
    expect(await eventos(e.id, "equipment.retire")).toBe(2);
    expect(await eventos(e.id, "equipment.reactivate")).toBe(1);
  });
});

describe("dos a la vez: el bloqueo de la fila del equipo", () => {
  it("retirarEquipo espera a quien está insertando una corrida en ese tanque y, al despertar, la ve: equipo_en_uso", async () => {
    const e = await tanque();
    let soltar!: () => void;
    const compuerta = new Promise<void>((r) => (soltar = r));
    let insertada!: (pid: number) => void;
    const yaInserto = new Promise<number>((r) => (insertada = r));
    // La transacción ajena inserta una corrida con este tanque y NO termina: su clave ajena toma FOR KEY SHARE sobre el equipo.
    // Dice su `pid` (el de su conexión: una transacción interactiva de Prisma vive en una sola) para que la espera se observe
    // contra ELLA y no contra cualquier sesión de la base.
    const otra = prisma.$transaction(async (tx) => {
      const r = await tx.fermentationRun.create({
        data: { startedAt: new Date("2026-09-01T10:00:00Z"), vesselNote: `TEST carrera ${f.run}`, vesselEquipmentId: e.id },
      });
      corridas.push(r.id);
      const [yo] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      insertada(yo!.pid);
      await compuerta;
    });
    try {
      const pidRetenido = await yaInserto;
      let termino = false;
      const retiro = retirarEquipo(f.jefeA, e.id, "carrera con una fermentación").then(
        () => null,
        (error: unknown) => error,
      );
      void retiro.then(() => {
        termino = true;
      });
      const esperando = await seBloquea(pidRetenido, () => termino);
      expect(
        esperando,
        "retirarEquipo tenía que quedar esperando el bloqueo del equipo: su FOR UPDATE, bloqueado por la transacción retenida (pg_blocking_pids), no terminar",
      ).toBe(true);
      soltar();
      await otra;
      const resultado = await retiro;
      expect(resultado).toBeInstanceOf(EquipoError);
      expect((resultado as Error).message).toBe("equipo_en_uso");
    } finally {
      soltar();
      await otra.catch(() => undefined);
    }
    expect((await fila(e.id)).lifecycleStatus).toBe("active");
    expect(await eventos(e.id, "equipment.retire")).toBe(0);
  });

  it("relee el estado tras el bloqueo: si otro lo retiró mientras esperaba, dice equipo_ya_retirado y no deja un segundo evento", async () => {
    const e = await tanque();
    let soltar!: () => void;
    const compuerta = new Promise<void>((r) => (soltar = r));
    let tomado!: (pid: number) => void;
    const yaTomo = new Promise<number>((r) => (tomado = r));
    // La transacción ajena toma el bloqueo, retira el equipo y NO termina: lo que lea `retirarEquipo` antes de esperar es «activo».
    // Dice su `pid` cuando ya tiene la fila bloqueada, como la de arriba.
    const otra = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "core"."equipment" WHERE "id" = ${e.id}::uuid FOR UPDATE`;
      await tx.equipment.update({
        where: { id: e.id },
        data: { lifecycleStatus: "retired", retiredAt: new Date(), retiroMotivo: "lo retiró otra pestaña" },
      });
      const [yo] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      tomado(yo!.pid);
      await compuerta;
    });
    try {
      const pidRetenido = await yaTomo;
      let termino = false;
      const retiro = retirarEquipo(f.jefeA, e.id, "segundo en llegar").then(
        () => null,
        (error: unknown) => error,
      );
      void retiro.then(() => {
        termino = true;
      });
      const esperando = await seBloquea(pidRetenido, () => termino);
      expect(
        esperando,
        "retirarEquipo tenía que quedar esperando el bloqueo del equipo: su FOR UPDATE, bloqueado por la transacción retenida (pg_blocking_pids), no terminar",
      ).toBe(true);
      soltar();
      await otra;
      const resultado = await retiro;
      expect(resultado).toBeInstanceOf(EquipoError);
      expect((resultado as Error).message).toBe("equipo_ya_retirado");
    } finally {
      soltar();
      await otra.catch(() => undefined);
    }
    const r = await fila(e.id);
    expect(r.retiroMotivo).toBe("lo retiró otra pestaña");
    expect(await eventos(e.id, "equipment.retire")).toBe(0);
  });
});

describe("la disponibilidad de los recipientes", () => {
  it("un tanque retirado no aparece; al reactivarlo, vuelve", async () => {
    const activo = await tanque();
    const retirado = await tanque();
    await retirarEquipo(f.jefeA, retirado.id, "fuera");

    const ids = async () => (await disponibilidadDeRecipientes(f.jefeA)).filas.map((x) => x.id);
    const ahora = await ids();
    expect(ahora, "control positivo: el activo sí sale").toContain(activo.id);
    expect(ahora).not.toContain(retirado.id);

    await reactivarEquipo(f.jefeA, retirado.id, "vuelve");
    expect(await ids()).toContain(retirado.id);
  });
});
