/**
 * Bandejas aparte (Parte 2c, §4.6): una bandeja de secado NO es un tanque.
 *
 * **El defecto que vigila.** Una bandeja es un `Equipment` con `kind = "vessel"` y `trayTypeId`
 * (CHECK `equipment_bandeja_solo_recipiente`), y las dos lecturas que CUENTAN tanques filtraban sólo
 * por `kind`: `disponibilidadDeRecipientes` (la «Capacidad ahora» de /equipos) y `tanquesVisibles`
 * del tablero. Una bandeja vacía nunca tiene una fermentación apuntándole, así que salía «libre y
 * sana»: un beneficio con un tanque y una bandeja decía «2 de 2 tanques libres».
 *
 * **Lo que NO se filtra: `listarEquipos`**, el inventario de todas las clases de equipo (la pantalla
 * /equipos, el tueste). El primer caso es su control: si alguien «arregla» el recuento filtrando
 * ahí, las bandejas desaparecen de la pantalla general y ese caso cae.
 *
 * **Quien mira es un Farm Operator de UBICACIÓN, nunca Platform Admin** (vería toda la base
 * compartida y los `toEqual` exactos de abajo no serían deterministas), y los dos equipos llevan un
 * traslado a SU sitio: sin traslado un equipo cae en el ámbito de plataforma y el operario no lo ve,
 * con lo que los tres casos pasarían «en verde» sin haber visto nunca la bandeja
 * (`datos-del-tablero.test.ts`, el comentario del traslado del tanque).
 *
 * Grupo `base-sembrada`: necesita base. No resetea nada compartido: crea lo suyo con `f.run` y lo
 * borra, cada paso en su `try`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { datosDelTablero } from "../../lib/beneficio/datosDelTablero";
import { ocupacionDelSitio } from "../../lib/beneficio/tablero";
import { disponibilidadDeRecipientes, listarEquipos } from "../../lib/equipos/equipos";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let tanqueId: string;
let bandejaId: string;
let tipoDeBandejaId: string;
const equipoIds: string[] = [];
const tipoIds: string[] = [];

beforeAll(async () => {
  f = await montarFixtures("bap");

  const tipo = await prisma.dryingTrayType.create({
    data: { organizationId: f.orgA, name: `TEST tipo de bandeja (${f.run})`, widthCm: 100, lengthCm: 60, entryUnit: "cm" },
  });
  tipoIds.push(tipo.id);
  tipoDeBandejaId = tipo.id;

  const tanque = await prisma.equipment.create({
    data: { name: `TEST tanque (${f.run})`, kind: "vessel", format: "other", organizationId: f.orgA, provenanceClass: "original_record" },
  });
  equipoIds.push(tanque.id);
  tanqueId = tanque.id;

  // La base exige tipo Y número juntos (`equipment_bandeja_tipo_y_numero`); el 1 es único en una organización recién creada.
  const bandeja = await prisma.equipment.create({
    data: {
      name: `TEST bandeja (${f.run})`,
      kind: "vessel",
      format: "other",
      organizationId: f.orgA,
      provenanceClass: "original_record",
      trayTypeId: tipo.id,
      trayNumber: 1,
    },
  });
  equipoIds.push(bandeja.id);
  bandejaId = bandeja.id;

  const haceUnaHora = new Date(Date.now() - 3_600_000);
  for (const equipmentId of [tanqueId, bandejaId]) {
    await prisma.equipmentTransfer.create({ data: { equipmentId, toLocationId: f.sitioA, occurredAt: haceUnaHora } });
  }
});

afterAll(async () => {
  // Cada borrado en su `try` y no una cadena: la primera FK que se queja tiraría los pasos que le siguen
  // (patrón de `datos-del-tablero.test.ts`). Los traslados, antes que el equipo; el tipo de bandeja, después
  // de las bandejas (`equipment.tray_type_id` es RESTRICT); la organización, la última (`f.limpiar()`).
  const pasos: [string, () => Promise<unknown>][] = [
    ["equipmentTransfer", () => prisma.equipmentTransfer.deleteMany({ where: assertDefinedWhere({ equipmentId: { in: equipoIds } }) })],
    ["equipment", () => prisma.equipment.deleteMany({ where: assertDefinedWhere({ id: { in: equipoIds } }) })],
    ["dryingTrayType", () => prisma.dryingTrayType.deleteMany({ where: assertDefinedWhere({ id: { in: tipoIds } }) })],
  ];
  const fallos: string[] = [];
  for (const [paso, borrar] of pasos) {
    try {
      await borrar();
    } catch (e) {
      const lineas = (e as Error).message.split("\n").map((l) => l.trim()).filter(Boolean);
      fallos.push(`${paso}: ${lineas[lineas.length - 1] ?? "(sin mensaje)"}`);
    }
  }
  // `process.stdout.write` y no `console.log`: vitest sólo saca la consola de las pruebas que FALLAN.
  if (fallos.length > 0) process.stdout.write(`\n[FUGA] la limpieza de ${f.run} dejó filas: ${fallos.join(" | ")}\n`);
  await f.limpiar();
});

describe("bandejas aparte (§4.6)", () => {
  it("listarEquipos sigue trayendo la bandeja con el tanque, y dice cuál es cuál", async () => {
    const lista = await listarEquipos(f.operarioA);
    // Control: el inventario NO se filtra. Los dos, y sólo los dos (el operario sólo ve lo que está en su sitio).
    expect(lista.map((e) => e.id).sort()).toEqual([bandejaId, tanqueId].sort());
    const porId = new Map(lista.map((e) => [e.id, e] as const));
    // La premisa del defecto: la bandeja ES un recipiente, y por eso pasaba el filtro de `kind`.
    expect(porId.get(bandejaId)?.kind).toBe("vessel");
    expect(porId.get(tanqueId)?.kind).toBe("vessel");
    // Lo que permite filtrar a quien cuenta: la columna tal cual, `null` = no es una bandeja.
    expect(porId.get(tanqueId)?.trayTypeId).toBeNull();
    expect(porId.get(bandejaId)?.trayTypeId).toBe(tipoDeBandejaId);
  });

  it("disponibilidadDeRecipientes cuenta el tanque y no la bandeja", async () => {
    const { filas, resumen } = await disponibilidadDeRecipientes(f.operarioA);
    expect(filas.map((x) => x.id)).toEqual([tanqueId]);
    expect(resumen).toEqual({ total: 1, libresYSanos: 1, enUso: 0, requierenIntervencion: 0 });
  });

  it("el tablero no cuenta la bandeja como tanque libre", async () => {
    const d = await datosDelTablero(f.operarioA);
    expect(d.sinAmbito, "el tablero cortó por falta de ámbito: este caso estaría midiendo el vacío").toBe(false);
    // Control: `instrumentos` sale de la lista de equipos ACTIVOS (D9), no de la entera, y la bandeja y el tanque de este caso
    // lo son: así que prueba que `listarEquipos` SÍ le entregó la bandeja al tablero, y que lo único que la deja fuera de
    // `tanques` es el filtro de `tanquesVisibles`.
    expect(d.instrumentos.map((i) => i.id).sort()).toEqual([bandejaId, tanqueId].sort());
    expect(d.tanques.map((t) => t.id)).toEqual([tanqueId]);
    const ocupacion = ocupacionDelSitio({
      tanques: d.tanques,
      camas: d.camas,
      corridas: d.corridas,
      corridasPorUnidad: d.corridasPorUnidad,
    });
    expect(ocupacion.tanques).toEqual({ total: 1, libresYSanos: 1, enUso: 0, requierenIntervencion: 0 });
  });
});
