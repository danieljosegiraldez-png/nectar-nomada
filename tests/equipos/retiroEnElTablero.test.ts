import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { datosDelTablero } from "../../lib/beneficio/datosDelTablero";
import { instrumentosQuePidenAtencion, ocupacionDelSitio } from "../../lib/beneficio/tablero";
import { disponibilidadDeRecipientes, listarEquipos } from "../../lib/equipos/equipos";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

/**
 * Lo que sale de los totales del tablero (Parte 2c; decisiones D5 y D6 de Daniel, 2026-10-05): **un tanque retirado** y **una cama
 * archivada** ya no son capacidad —ni libres, ni en uso, ni «requieren intervención»—, así que no cuentan en
 * `datosDelTablero(...).tanques` / `.camas` ni, por tanto, en los recuentos ni en el mapa que salen de ellos. En
 * `disponibilidadDeRecipientes` (la «Capacidad ahora» de /equipos) tampoco, desde el commit C.
 *
 * **Lo que NO sale: `listarEquipos`**, el inventario de todas las clases (§4.6). El retirado sigue ahí, dicho como retirado, y es el
 * control de que lo que lo saca de los totales es el filtro de quien CUENTA y no que el equipo haya desaparecido. Y el último caso de
 * los tanques lo reactiva: si volviera a contar, lo que lo sacaba era su estado y nada más.
 *
 * **Y un instrumento retirado sale del bloque «instrumentos que piden atención» del tablero (D9, Daniel, 2026-10-05).** Ese bloque
 * lo arma `instrumentosQuePidenAtencion` sobre `datosDelTablero(...).instrumentos`, y mira `kind` y `verificacion`, nunca
 * `lifecycleStatus`: sin el filtro de D9, un instrumento retirado y sin contraste (`SIN_VERIFICACION`, que es lo que `listarEquipos`
 * da a un instrumento sin ninguna fila de `InstrumentCheck`) pediría atención para siempre. Los dos instrumentos de abajo son
 * gemelos —los dos sin contraste, los dos con traslado al sitio del operario— y sólo difieren en el estado. El activo es el
 * control de que el operario VE instrumentos y de que el bloque no sale vacío por otra razón; el primer caso de su `describe`
 * comprueba en la base que el retirado existe, es un instrumento, está retirado y no tiene ningún contraste.
 *
 * **Quien mira es un Farm Operator de UBICACIÓN, nunca Platform Admin** (vería toda la base compartida y los `toEqual` exactos de
 * abajo no serían deterministas), y cada equipo —tanques e instrumentos— lleva un traslado a SU sitio: sin traslado un equipo cae
 * en el ámbito de plataforma y el operario no lo ve, con lo que los casos pasarían «en verde» sin haber visto nunca el equipo.
 *
 * **Por qué hay un lote con una fermentación abierta.** Las camas no salen de un listador con permiso propio: `datosDelTablero` las
 * acota por las ORGANIZACIONES de los lotes visibles con una corrida abierta («Las camas se acotan por las organizaciones de los
 * lotes visibles», en `datosDelTablero.ts`). Sin ese lote `camas` sale `[]` y los dos casos de la cama pasarían «en verde» sin haber
 * visto nunca una cama; los tanques sí salen de `listarEquipos` y no lo necesitan. El caso de la cama lo comprueba (`d.corridas`).
 *
 * Los retirados se escriben con Prisma, **no con `retirarEquipo`**: lo que se prueba es la LECTURA del tablero, y así la prueba no
 * depende de que el servicio ande. La base exige fecha y motivo a todo `retired` (CHECK `equipment_retiro_completo`). La cama archivada
 * se crea aprobada y se archiva después, que es como ocurre.
 *
 * Grupo `base-sembrada`: necesita base. No resetea nada compartido: crea lo suyo con `f.run` y lo borra, cada paso en su `try`.
 */
let f: Fixtures;
let tanqueActivo: string;
let tanqueRetirado: string;
let instrumentoActivo: string;
let instrumentoRetirado: string;
let camaActiva: string;
let camaArchivada: string;
const equipoIds: string[] = [];
const camaIds: string[] = [];
const loteIds: string[] = [];
const corridaIds: string[] = [];
const transformacionIds: string[] = [];

const retirarAMano = (id: string) =>
  prisma.equipment.update({
    where: { id },
    data: { lifecycleStatus: "retired", retiredAt: new Date(), retiroMotivo: "TEST retirado a mano" },
  });

beforeAll(async () => {
  f = await montarFixtures("rtab");
  const haceUnaHora = new Date(Date.now() - 3_600_000);

  const tanque = async (etiqueta: string) => {
    const e = await prisma.equipment.create({
      data: {
        name: `TEST tanque ${etiqueta} (${f.run})`,
        kind: "vessel",
        format: "other",
        organizationId: f.orgA,
        provenanceClass: "original_record",
      },
    });
    equipoIds.push(e.id);
    await prisma.equipmentTransfer.create({ data: { equipmentId: e.id, toLocationId: f.sitioA, occurredAt: haceUnaHora } });
    return e.id;
  };
  tanqueActivo = await tanque("activo");
  tanqueRetirado = await tanque("retirado");
  await retirarAMano(tanqueRetirado);

  // D9: dos instrumentos gemelos SIN ningún contraste —ninguna fila de `InstrumentCheck`: `listarEquipos` les da `SIN_VERIFICACION`,
  // uno de los tres estados que piden atención—, cada uno con su traslado al sitio del operario. Sin `format`: el CHECK
  // `equipment_format_solo_en_recipientes` lo prohíbe fuera de un recipiente (precedente: `tests/apiary/refractometroDeMiel.test.ts:64`).
  const instrumento = async (etiqueta: string) => {
    const e = await prisma.equipment.create({
      data: {
        name: `TEST instrumento ${etiqueta} (${f.run})`,
        kind: "instrument",
        organizationId: f.orgA,
        provenanceClass: "original_record",
      },
    });
    equipoIds.push(e.id);
    await prisma.equipmentTransfer.create({ data: { equipmentId: e.id, toLocationId: f.sitioA, occurredAt: haceUnaHora } });
    return e.id;
  };
  instrumentoActivo = await instrumento("activo");
  instrumentoRetirado = await instrumento("retirado");
  await retirarAMano(instrumentoRetirado);

  const cama = async (etiqueta: string) => {
    const l = await prisma.location.create({
      data: {
        name: `TEST cama ${etiqueta} (${f.run})`,
        locationType: "drying_bed",
        classification: "internal",
        status: "approved",
        organizationId: f.orgA,
      },
    });
    camaIds.push(l.id);
    return l.id;
  };
  camaActiva = await cama("activa");
  camaArchivada = await cama("archivada");
  await prisma.location.update({ where: { id: camaArchivada }, data: { status: "archived" } });

  // El lote visible para el operario (su sitio, su organización) con una fermentación ABIERTA: lo que hace que el tablero mire las camas de esta organización.
  const lote = await prisma.lot.create({
    data: {
      lotCode: `L-RTAB-${f.run}`,
      lotType: "cherry",
      organizationId: f.orgA,
      locationId: f.sitioA,
      status: "approved",
      classification: "internal",
    },
  });
  loteIds.push(lote.id);
  const corrida = await prisma.fermentationRun.create({ data: { startedAt: haceUnaHora, vesselNote: `TEST tanque escrito (${f.run})` } });
  corridaIds.push(corrida.id);
  const transformacion = await prisma.lotTransformation.create({
    data: {
      transformationType: "stage_change",
      occurredAt: haceUnaHora,
      provenanceClass: "original_record",
      fermentationRunId: corrida.id,
      inputs: { create: [{ lotId: lote.id, quantity: 60, unit: "kg" }] },
    },
  });
  transformacionIds.push(transformacion.id);
});

afterAll(async () => {
  // Cada borrado en su propio `try`: un `afterAll` es una cadena y la primera FK que se queja tira el resto (patrón de
  // `datos-del-tablero.test.ts`). Entradas de la transformación, transformación, corrida y lote antes que nada; traslados
  // antes que los equipos; las camas (ubicaciones de la organización) antes de las fixtures, que borran la organización.
  const pasos: [string, () => Promise<unknown>][] = [
    ["lotTransformationInput", () => prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformacionIds } }) })],
    ["lotTransformation", () => prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformacionIds } }) })],
    ["fermentationRun", () => prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: corridaIds } }) })],
    ["lot", () => prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: loteIds } }) })],
    ["equipmentTransfer", () => prisma.equipmentTransfer.deleteMany({ where: assertDefinedWhere({ equipmentId: { in: equipoIds } }) })],
    ["equipment", () => prisma.equipment.deleteMany({ where: assertDefinedWhere({ id: { in: equipoIds } }) })],
    ["location (camas)", () => prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: camaIds } }) })],
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
  // `process.stdout.write` y no `console.log`: vitest sólo saca la consola de las pruebas que FALLAN.
  if (fallos.length > 0) process.stdout.write(`\n[FUGA] la limpieza de ${f?.run} dejó filas: ${fallos.join(" | ")}\n`);
});

describe("un tanque retirado sale de los totales del tablero (D5)", () => {
  it("el tablero cuenta el tanque activo y no el retirado, y los recuentos y el mapa lo reflejan", async () => {
    const d = await datosDelTablero(f.operarioA);
    expect(d.sinAmbito, "el tablero cortó por falta de ámbito: este caso estaría midiendo el vacío").toBe(false);
    expect(d.tanques.map((t) => t.id)).toEqual([tanqueActivo]);
    const o = ocupacionDelSitio({ tanques: d.tanques, camas: d.camas, corridas: d.corridas, corridasPorUnidad: d.corridasPorUnidad });
    expect(o.tanques).toEqual({ total: 1, libresYSanos: 1, enUso: 0, requierenIntervencion: 0 });
    expect(o.mapa.tanques.map((c) => c.id)).toEqual([tanqueActivo]);
  });

  it("disponibilidadDeRecipientes tampoco lo cuenta", async () => {
    const { filas, resumen } = await disponibilidadDeRecipientes(f.operarioA);
    expect(filas.map((x) => x.id)).toEqual([tanqueActivo]);
    expect(resumen).toEqual({ total: 1, libresYSanos: 1, enUso: 0, requierenIntervencion: 0 });
  });

  it("listarEquipos SÍ lo trae, dicho como retirado: es el inventario y no se filtra (control)", async () => {
    const lista = await listarEquipos(f.operarioA);
    // Los cuatro equipos del archivo: los dos tanques y los dos instrumentos de D9 (el inventario es de todas las clases).
    expect(lista.map((e) => e.id).sort()).toEqual([tanqueActivo, tanqueRetirado, instrumentoActivo, instrumentoRetirado].sort());
    const porId = new Map(lista.map((e) => [e.id, e] as const));
    expect(porId.get(tanqueRetirado)?.lifecycleStatus).toBe("retired");
    expect(porId.get(tanqueActivo)?.lifecycleStatus).toBe("active");
    // D9: el instrumento retirado también está, retirado y SIN contraste —un estado que pide atención—. Es lo que hace que el caso del
    // bloque de instrumentos, abajo, mida el filtro y no que el operario no vea el instrumento.
    expect(porId.get(instrumentoRetirado)?.lifecycleStatus).toBe("retired");
    expect(porId.get(instrumentoRetirado)?.verificacion).toBe("SIN_VERIFICACION");
  });

  it("al reactivarlo vuelve a contar: lo que lo sacaba era su estado y nada más (control)", async () => {
    await prisma.equipment.update({ where: { id: tanqueRetirado }, data: { lifecycleStatus: "active", retiredAt: null, retiroMotivo: null } });
    try {
      const d = await datosDelTablero(f.operarioA);
      expect(d.tanques.map((t) => t.id).sort()).toEqual([tanqueActivo, tanqueRetirado].sort());
      const { filas } = await disponibilidadDeRecipientes(f.operarioA);
      expect(filas.map((x) => x.id).sort()).toEqual([tanqueActivo, tanqueRetirado].sort());
    } finally {
      // Lo deja retirado otra vez, pase o falle: los casos de arriba y el `afterAll` cuentan con ese estado.
      await retirarAMano(tanqueRetirado);
    }
  });
});

describe("una cama archivada sale de los totales y del mapa del tablero (D6)", () => {
  it("control: la cama archivada EXISTE, es de la misma organización y está archivada (si no, el caso de abajo no mide el filtro)", async () => {
    const filas = await prisma.location.findMany({
      where: { locationType: "drying_bed", organizationId: f.orgA },
      select: { id: true, status: true },
    });
    const estados = new Map(filas.map((l) => [l.id, l.status] as const));
    expect(estados.get(camaActiva)).toBe("approved");
    expect(estados.get(camaArchivada)).toBe("archived");
  });

  it("el tablero tiene la cama activa y no la archivada, ni en el recuento ni en el mapa", async () => {
    const d = await datosDelTablero(f.operarioA);
    // Sin la corrida del lote visible `camas` saldría `[]` y este caso no habría visto nunca una cama.
    expect(d.corridas.length, "el lote visible con su fermentación abierta no llegó al tablero: las camas saldrían vacías").toBeGreaterThan(0);
    expect(d.camas.map((c) => c.id)).toEqual([camaActiva]);
    const o = ocupacionDelSitio({ tanques: d.tanques, camas: d.camas, corridas: d.corridas, corridasPorUnidad: d.corridasPorUnidad });
    expect(o.camas).toEqual({ total: 1, libresYSanos: 1, enUso: 0, requierenIntervencion: 0 });
    expect(o.mapa.camas.map((c) => c.id)).toEqual([camaActiva]);
  });
});

describe("un instrumento retirado sale del bloque «instrumentos que piden atención» del tablero (D9)", () => {
  it("control: el instrumento retirado EXISTE, es un instrumento, está retirado y no tiene ningún contraste (si no, el caso de abajo no mide el filtro)", async () => {
    // Directo a la base, como el control de la cama: ninguna mutación del flip del commit E toca esta lectura.
    const fila = await prisma.equipment.findUniqueOrThrow({
      where: { id: instrumentoRetirado },
      select: { kind: true, lifecycleStatus: true, organizationId: true, _count: { select: { checks: true } } },
    });
    expect(fila).toEqual({ kind: "instrument", lifecycleStatus: "retired", organizationId: f.orgA, _count: { checks: 0 } });
  });

  it("control: el instrumento activo sin contraste SÍ sale en «instrumentos que piden atención» del tablero", async () => {
    const d = await datosDelTablero(f.operarioA);
    expect(d.sinAmbito, "el tablero cortó por falta de ámbito: este caso estaría midiendo el vacío").toBe(false);
    // `toContain` y no `toEqual`, a propósito: este control tiene que seguir en verde cuando el flip quita el filtro de D9 (entonces
    // entra también el retirado). Lo que dice es que el operario VE instrumentos y que el bloque los pide: el vacío no es de otra cosa.
    expect(instrumentosQuePidenAtencion(d.instrumentos).map((i) => i.id)).toContain(instrumentoActivo);
  });

  it("un instrumento retirado y sin contraste no sale en «instrumentos que piden atención» del tablero", async () => {
    const d = await datosDelTablero(f.operarioA);
    expect(d.sinAmbito, "el tablero cortó por falta de ámbito: este caso estaría midiendo el vacío").toBe(false);
    expect(d.instrumentos.map((i) => i.id), "el instrumento retirado llegó a la lista de instrumentos del tablero").not.toContain(instrumentoRetirado);
    expect(instrumentosQuePidenAtencion(d.instrumentos).map((i) => i.id)).toEqual([instrumentoActivo]);
  });
});
