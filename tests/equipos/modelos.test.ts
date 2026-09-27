import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { CatalogoError } from "../../lib/catalogos/propiedad";
import {
  ModeloError,
  crearModelo,
  declararEspecificacion,
  editarModelo,
  listarModelos,
  modeloParaFicha,
  modelosParaElegir,
  puedeCrearCompartido,
  retirarEspecificacion,
  sitiosParaCatalogo,
  retirarModelo,
  desRetirarModelo,
} from "../../lib/equipos/modelos";
import { registrarEquipo, sitiosParaRegistrar } from "../../lib/equipos/equipos";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let admin: string, jefeA: string, operarioA: string, orgA: string, orgB: string, sitioA: string, sitioB: string, RUN: string;

beforeAll(async () => {
  f = await montarFixtures("mod");
  ({ admin, jefeA, operarioA, orgA, orgB, sitioA, sitioB } = f);
  RUN = f.run;
});
afterAll(async () => {
  const eqs = (await prisma.equipment.findMany({ where: { name: { contains: RUN } }, select: { id: true } })).map((e) => e.id);
  await prisma.equipmentTransfer.deleteMany({ where: { equipmentId: { in: eqs } } });
  await prisma.equipment.deleteMany({ where: { id: { in: eqs } } });
  const modelos = await prisma.equipmentModel.findMany({ where: { manufacturer: { contains: RUN } }, select: { id: true } });
  const ids = modelos.map((m) => m.id);
  await prisma.equipmentModelSpec.deleteMany({ where: { modelId: { in: ids } } });
  await prisma.equipmentModel.deleteMany({ where: { id: { in: ids } } });
  await f.limpiar();
});

describe("puedeCrearCompartido", () => {
  it("sólo con plataforma", async () => {
    expect(await puedeCrearCompartido(admin)).toBe(true);
    expect(await puedeCrearCompartido(jefeA)).toBe(false);
  });
});

describe("sitiosParaCatalogo", () => {
  it("sólo ofrece sitios donde crear un modelo propio de verdad funciona (equipment:manage)", async () => {
    expect((await sitiosParaCatalogo(jefeA)).map((s) => s.id)).toContain(sitioA);
    expect((await sitiosParaCatalogo(jefeA)).map((s) => s.id)).not.toContain(sitioB);
    expect((await sitiosParaCatalogo(jefeA)).find((s) => s.id === sitioA)?.organizationName).toBe(`TEST A ${RUN}`);
    // Un operario con la concesión estrecha `location:edit_beneficio` puede
    // REGISTRAR equipo en su sitio, pero no definir el catálogo: ahí no se ofrece.
    const asignacion = await prisma.assignment.findFirstOrThrow({ where: { userAccountId: operarioA } });
    const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType: "location", action: "edit_beneficio" } });
    const concesion = await prisma.assignmentPermissionOverride.create({
      data: { assignmentId: asignacion.id, permissionId: permiso.id, effect: "grant", reason: "prueba de sitiosParaCatalogo", createdBy: admin },
    });
    try {
      // Control positivo: la concesión SÍ abre el registro de equipo en ese sitio.
      expect((await sitiosParaRegistrar(operarioA)).map((s) => s.id)).toContain(sitioA);
      expect((await sitiosParaCatalogo(operarioA)).map((s) => s.id)).not.toContain(sitioA);
      await expect(
        crearModelo(operarioA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `X ${RUN}`, modelName: "concesion", provenanceClass: "original_record" }),
      ).rejects.toThrow(new CatalogoError("forbidden"));
    } finally {
      await prisma.assignmentPermissionOverride.delete({ where: { id: concesion.id } });
    }
  });
});

describe("crearModelo", () => {
  it("el jefe crea un modelo propio; la organización sale del sitio", async () => {
    const m = await crearModelo(jefeA, {
      dueno: { tipo: "propio", locationId: sitioA },
      kind: "instrument", manufacturer: `ATAGO ${RUN}`, modelName: "PAL-1",
      recommendedMaintenanceDays: 180, provenanceClass: "manufacturer_specification",
    });
    const fila = await prisma.equipmentModel.findUniqueOrThrow({ where: { id: m.id } });
    expect(fila.organizationId).toBe(orgA);
    expect(fila.createdBy).toBe(jefeA);
  });

  it("el operario no crea modelos (definir el catálogo es gestión)", async () => {
    await expect(
      crearModelo(operarioA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `X ${RUN}`, modelName: "op", provenanceClass: "original_record" }),
    ).rejects.toThrow(new CatalogoError("forbidden"));
  });

  it("un compartido exige plataforma", async () => {
    await expect(
      crearModelo(jefeA, { dueno: { tipo: "compartido" }, kind: "instrument", manufacturer: `X ${RUN}`, modelName: "comp", provenanceClass: "original_record" }),
    ).rejects.toThrow(new CatalogoError("forbidden"));
    const m = await crearModelo(admin, { dueno: { tipo: "compartido" }, kind: "instrument", manufacturer: `X ${RUN}`, modelName: "comp", provenanceClass: "original_record" });
    expect((await prisma.equipmentModel.findUniqueOrThrow({ where: { id: m.id } })).organizationId).toBeNull();
  });

  it("el duplicado sin mayúsculas sale como ModeloError legible, no como error de Prisma", async () => {
    await expect(
      crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: ` atago ${RUN}`, modelName: "pal-1", provenanceClass: "original_record" }),
    ).rejects.toThrow(new ModeloError("modelo_duplicado"));
  });

  it("escribe un AuditEvent en la misma transacción", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "vessel", manufacturer: `X ${RUN}`, modelName: "tanque 500", capacityValue: "500", capacityUnit: "L", contactMaterial: "acero_inoxidable", provenanceClass: "manufacturer_specification" });
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "equipment_model", entityId: m.id, operation: "create" } });
    expect(ev?.actorUserAccountId).toBe(jefeA);
  });
});

describe("editar y retirar", () => {
  it("editar deja el valor anterior en la auditoría", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `E ${RUN}`, modelName: "e1", recommendedMaintenanceDays: 90, provenanceClass: "original_record" });
    await editarModelo(jefeA, m.id, { manufacturer: `E ${RUN}`, modelName: "e1", recommendedMaintenanceDays: 120, provenanceClass: "original_record" });
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "equipment_model", entityId: m.id, operation: "update" } });
    expect((ev.before as { recommendedMaintenanceDays: number }).recommendedMaintenanceDays).toBe(90);
    expect((ev.after as { recommendedMaintenanceDays: number }).recommendedMaintenanceDays).toBe(120);
  });

  it("el jefe de A no edita un modelo de B ni uno compartido", async () => {
    const deB = await crearModelo(admin, { dueno: { tipo: "propio", locationId: sitioB }, kind: "instrument", manufacturer: `B ${RUN}`, modelName: "b1", provenanceClass: "original_record" });
    await expect(editarModelo(jefeA, deB.id, { manufacturer: `B ${RUN}`, modelName: "b1", provenanceClass: "original_record" })).rejects.toThrow(
      new CatalogoError("forbidden"),
    );
    const comp = await crearModelo(admin, { dueno: { tipo: "compartido" }, kind: "instrument", manufacturer: `B ${RUN}`, modelName: "compartido", provenanceClass: "original_record" });
    await expect(
      editarModelo(jefeA, comp.id, { manufacturer: `B ${RUN}`, modelName: "compartido", notes: "del jefe", provenanceClass: "original_record" }),
    ).rejects.toThrow(new CatalogoError("forbidden"));
    // Control positivo: el mismo cambio, hecho por quien manda en la plataforma, SÍ entra.
    await editarModelo(admin, comp.id, { manufacturer: `B ${RUN}`, modelName: "compartido", notes: "del admin", provenanceClass: "original_record" });
    expect((await prisma.equipmentModel.findUniqueOrThrow({ where: { id: comp.id } })).notes).toBe("del admin");
  });

  it("des-retirar devuelve el modelo a la lista y deja su AuditEvent", async () => {
    // ADR-187. Un retiro por equivocación no se arreglaba desde la aplicación.
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `DR ${RUN}`, modelName: "dr1", provenanceClass: "original_record" });
    await retirarModelo(jefeA, m.id, new Date());
    // Control: está fuera ANTES de des-retirar, o la prueba no mide nada.
    expect((await modelosParaElegir(jefeA, orgA, "instrument")).propios.map((x) => x.id)).not.toContain(m.id);

    await desRetirarModelo(jefeA, m.id);

    expect((await prisma.equipmentModel.findUniqueOrThrow({ where: { id: m.id } })).retiredAt).toBeNull();
    expect((await modelosParaElegir(jefeA, orgA, "instrument")).propios.map((x) => x.id)).toContain(m.id);
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "equipment_model", entityId: m.id, operation: "unretire" } });
    expect((ev.after as { retiredAt: null }).retiredAt).toBeNull();
    // El `before` también: una auditoría que no dice de dónde viene la transición vale la mitad.
    expect((ev.before as { retiredAt: string }).retiredAt).toBeTruthy();
  });

  it("el jefe de A no des-retira un modelo de B", async () => {
    const deB = await crearModelo(admin, { dueno: { tipo: "propio", locationId: sitioB }, kind: "instrument", manufacturer: `DRB ${RUN}`, modelName: "drb1", provenanceClass: "original_record" });
    await retirarModelo(admin, deB.id, new Date());
    await expect(desRetirarModelo(jefeA, deB.id)).rejects.toThrow(new CatalogoError("forbidden"));
    // Control positivo: quien sí manda en B lo des-retira, así que el rechazo era del permiso
    // y no de que la operación esté rota.
    await desRetirarModelo(admin, deB.id);
    expect((await prisma.equipmentModel.findUniqueOrThrow({ where: { id: deB.id } })).retiredAt).toBeNull();
  });

  it("des-retirar un modelo que no está retirado no hace nada ni escribe auditoría", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `DRV ${RUN}`, modelName: "drv1", provenanceClass: "original_record" });
    await desRetirarModelo(jefeA, m.id);
    expect((await prisma.equipmentModel.findUniqueOrThrow({ where: { id: m.id } })).retiredAt).toBeNull();
    expect(await prisma.auditEvent.count({ where: { entityType: "equipment_model", entityId: m.id, operation: "unretire" } })).toBe(0);
  });

  it("dos retiros a la vez dejan UN solo evento, y la fecha es la que se guardó", async () => {
    // La hermana de la carrera del des-retiro, señalada al arreglar aquélla el 2026-09-27. Aquí
    // además del evento de más se corrompe el DATO: el segundo `update` pisa `retiredAt` con su
    // propia fecha, así que la auditoría y la fila pueden acabar diciendo instantes distintos.
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `RC ${RUN}`, modelName: "rc1", provenanceClass: "original_record" });

    const a = new Date("2026-09-27T10:00:00Z");
    const b = new Date("2026-09-27T11:00:00Z");
    await Promise.all([retirarModelo(jefeA, m.id, a), retirarModelo(jefeA, m.id, b)]);

    expect(await prisma.auditEvent.count({ where: { entityType: "equipment_model", entityId: m.id, operation: "retire" } })).toBe(1);
    const fila = await prisma.equipmentModel.findUniqueOrThrow({ where: { id: m.id } });
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "equipment_model", entityId: m.id, operation: "retire" } });
    // Y las dos cuentan lo mismo: el evento describe la fila, no otra fecha.
    expect((ev.after as { retiredAt: string }).retiredAt).toBe(fila.retiredAt!.toISOString());
  });

  it("dos des-retiros a la vez dejan UN solo evento, no dos", async () => {
    // Codex, 2026-09-27: leer fuera de la transacción y actualizar por id sin condición deja que
    // las dos llamadas escriban `unretire`, y la segunda audita un no-cambio con un `before` falso
    // — justo lo que el comentario del servicio promete impedir.
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `DRC ${RUN}`, modelName: "drc1", provenanceClass: "original_record" });
    await retirarModelo(jefeA, m.id, new Date());

    await Promise.all([desRetirarModelo(jefeA, m.id), desRetirarModelo(jefeA, m.id)]);

    expect((await prisma.equipmentModel.findUniqueOrThrow({ where: { id: m.id } })).retiredAt).toBeNull();
    expect(await prisma.auditEvent.count({ where: { entityType: "equipment_model", entityId: m.id, operation: "unretire" } })).toBe(1);
  });

  it("retirar no borra: la fila sigue y deja de ofrecerse", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `R ${RUN}`, modelName: "r1", provenanceClass: "original_record" });
    await retirarModelo(jefeA, m.id, new Date());
    expect(await prisma.equipmentModel.findUnique({ where: { id: m.id } })).not.toBeNull();
    const elegibles = await modelosParaElegir(jefeA, orgA, "instrument");
    expect(elegibles.propios.map((x) => x.id)).not.toContain(m.id);
  });
});

describe("especificaciones", () => {
  it("se declaran, se retiran, y la ficha sólo muestra las vigentes", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `S ${RUN}`, modelName: "s1", provenanceClass: "manufacturer_specification" });
    const bx = await declararEspecificacion(jefeA, m.id, { quantity: "sólidos solubles", unit: "°Bx", rangeMin: "0", rangeMax: "32", resolution: "0.1", accuracyAbs: "0.2" });
    await declararEspecificacion(jefeA, m.id, { quantity: "temperatura", unit: "°C", rangeMin: "10", rangeMax: "40" });
    await retirarEspecificacion(jefeA, bx.id, new Date());
    const ficha = await modeloParaFicha(jefeA, m.id);
    expect(ficha.specs.map((s) => s.quantity)).toEqual(["temperatura"]);
  });

  it("crear con especificaciones es atómico: una fila mala no deja el modelo a medias", async () => {
    const entrada = (modelName: string, especificaciones: object[]) => ({
      dueno: { tipo: "propio" as const, locationId: sitioA },
      kind: "instrument" as const,
      manufacturer: `AT ${RUN}`,
      modelName,
      provenanceClass: "manufacturer_specification" as const,
      especificaciones: especificaciones as never,
    });
    await expect(
      crearModelo(jefeA, entrada("atomico", [
        { quantity: "sólidos solubles", unit: "°Bx", rangeMin: "0", rangeMax: "32" },
        { quantity: "temperatura", unit: "°C", rangeMin: "40", rangeMax: "10" },
      ])),
    ).rejects.toThrow(new ModeloError("rango_invertido"));
    expect(await prisma.equipmentModel.count({ where: { manufacturer: `AT ${RUN}`, modelName: "atomico" } })).toBe(0);
    for (const [mala, error] of [
      [{ quantity: " ", unit: "°C" }, "magnitud_y_unidad_obligatorias"],
      [{ quantity: "t", unit: "°C", resolution: "0" }, "resolucion_positiva"],
      [{ quantity: "t", unit: "°C", accuracyAbs: "-0.1" }, "precision_no_negativa"],
      [{ quantity: "t", unit: "°C", rangeMin: "abc" }, "numero_invalido"],
    ] as const) {
      await expect(crearModelo(jefeA, entrada("atomico", [mala]))).rejects.toThrow(new ModeloError(error));
    }
    await expect(
      crearModelo(jefeA, { ...entrada("vaso-con-spec", [{ quantity: "t", unit: "°C" }]), kind: "vessel" }),
    ).rejects.toThrow(new ModeloError("especificacion_solo_en_instrumentos"));
    expect(await prisma.equipmentModel.count({ where: { manufacturer: `AT ${RUN}` } })).toBe(0);

    // Control positivo: con filas válidas entran modelo, filas y sus AuditEvent.
    const m = await crearModelo(jefeA, entrada("atomico", [
      { quantity: "sólidos solubles", unit: "°Bx", rangeMin: "0", rangeMax: "32", resolution: "0.1", accuracyAbs: "0.2" },
      { quantity: "temperatura", unit: "°C", rangeMin: "10", rangeMax: "40" },
    ]));
    const specs = await prisma.equipmentModelSpec.findMany({ where: { modelId: m.id }, orderBy: { quantity: "asc" } });
    expect(specs.map((s) => s.quantity)).toEqual(["sólidos solubles", "temperatura"]);
    expect(await prisma.auditEvent.count({ where: { entityType: "equipment_model_spec", entityId: { in: specs.map((s) => s.id) }, operation: "create" } })).toBe(2);
  });

  it("una especificación en un modelo de vaso se rechaza", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "vessel", manufacturer: `V ${RUN}`, modelName: "v1", provenanceClass: "original_record" });
    await expect(declararEspecificacion(jefeA, m.id, { quantity: "x", unit: "y" })).rejects.toThrow(new ModeloError("especificacion_solo_en_instrumentos"));
  });
});

describe("listarModelos", () => {
  it("el operario ve los compartidos y los de su organización, no los de B", async () => {
    const lista = await listarModelos(operarioA);
    const todos = [...lista.compartidos, ...lista.propios];
    expect(todos.some((m) => m.organizationId === orgB)).toBe(false);
    expect(lista.propios.some((m) => m.organizationId === orgA)).toBe(true);
    expect(lista.compartidos.every((m) => m.organizationId === null)).toBe(true);
  });
});

describe("el inventario detrás de un modelo sigue el permiso real de cada equipo", () => {
  const equipo = (usuario: string, org: string, sitio: string, modelId: string) =>
    registrarEquipo(usuario, { name: `TEST eq ${RUN} ${Math.random()}`, kind: "instrument", organizationId: org, initialLocationId: sitio, provenanceClass: "original_record", modelId });

  it("la ficha de un modelo propio lista sólo los equipos que el jefe ve, no todos los de su organización", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `INV ${RUN}`, modelName: "propio", provenanceClass: "original_record" });
    const enA1 = await equipo(jefeA, orgA, sitioA, m.id);
    const enA2 = await equipo(f.jefeA2, orgA, f.sitioA2, m.id);
    expect((await modeloParaFicha(jefeA, m.id)).equipment.map((e) => e.id)).toEqual([enA1.id]);
    // Control: el jefe de A2 ve el suyo y no el de A1 — la regla no es «nadie ve nada».
    expect((await modeloParaFicha(f.jefeA2, m.id)).equipment.map((e) => e.id)).toEqual([enA2.id]);
    const propio = (await listarModelos(jefeA)).propios.find((x) => x.id === m.id);
    expect(propio?.equipos).toBe(1);
  });

  it("la cuenta de un modelo compartido no suma las unidades de otra organización", async () => {
    const comp = await crearModelo(admin, { dueno: { tipo: "compartido" }, kind: "instrument", manufacturer: `INV ${RUN}`, modelName: "comp", provenanceClass: "original_record" });
    await equipo(jefeA, orgA, sitioA, comp.id);
    await equipo(admin, orgB, sitioB, comp.id);
    const paraJefeA = (await listarModelos(jefeA)).compartidos.find((x) => x.id === comp.id);
    expect(paraJefeA?.equipos).toBe(1);
    // Control positivo: quien sí ve las dos unidades las cuenta a las dos.
    const paraAdmin = (await listarModelos(admin)).compartidos.find((x) => x.id === comp.id);
    expect(paraAdmin?.equipos).toBe(2);
    expect((await modeloParaFicha(jefeA, comp.id)).equipment).toHaveLength(1);
  });
});
