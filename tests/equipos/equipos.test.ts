import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import {
  EquipoError,
  declararPatron,
  estadoDelInstrumento,
  informarCondicion,
  registrarEquipo,
  retirarPatron,
  trasladarEquipo,
  verificarInstrumento,
} from "../../lib/equipos/equipos";

/**
 * El servicio de equipos e instrumentos contra la base.
 *
 * **Lo que más se vigila aquí son dos cosas que un refactor razonable rompería:**
 *
 * 1. **`report_condition` NO es un escalón de `manage`.** Quien trabaja con la
 *    máquina tiene que poder decir que está rota, y verificar un instrumento,
 *    sin poder retirarlo del inventario. Si alguien «simplifica» exigiendo
 *    `manage` para informar, el operario que ve el sello partido deja de
 *    informar — y el sistema se entera de menos, que es justo lo que la decisión
 *    de no bloquear existe para evitar.
 * 2. **El veredicto lo pone la base, no esta capa.** Se comprueba llamando al
 *    servicio y leyendo lo que quedó, no recalculándolo aquí: recalcularlo sería
 *    comparar el código consigo mismo.
 */

const RUN = `eq-${Date.now()}`;
let orgId: string, sitioA: string, sitioB: string;
let jefe: string, operario: string, ajeno: string;
let personaJefe: string;

async function cuenta(label: string) {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" },
  });
  const u = await prisma.userAccount.create({
    data: { personId: p.id, authProvider: "credentials", status: "active" },
  });
  return { personId: p.id, userId: u.id };
}

async function asignar(userAccountId: string, perfil: string, scopeId: string) {
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: rp.id, scopeId } });
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" },
    })
  ).id;
  for (const n of ["A", "B"]) {
    const l = await prisma.location.create({
      data: {
        locationType: "plot",
        name: `TEST sitio ${n} ${RUN}`,
        organizationId: orgId,
        status: "approved",
        classification: "internal",
      },
    });
    if (n === "A") sitioA = l.id;
    else sitioB = l.id;
  }

  const j = await cuenta("Jefe");
  jefe = j.userId;
  personaJefe = j.personId;
  operario = (await cuenta("Operario")).userId;
  ajeno = (await cuenta("Ajeno")).userId;

  // El jefe manda en toda la plataforma; el operario, sólo en el sitio A.
  const scopePlataforma = await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } });
  const scopeSitioA = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitioA } });
  await asignar(jefe, "Platform Admin", scopePlataforma.id);
  await asignar(operario, "Farm Operator", scopeSitioA.id);
  // `ajeno` no recibe nada: es el control del guardia.
});

afterAll(async () => {
  await prisma.instrumentCheckResult.deleteMany({ where: { check: { equipment: { organizationId: orgId } } } });
  await prisma.instrumentCheck.deleteMany({ where: { equipment: { organizationId: orgId } } });
  await prisma.instrumentCheckRequirement.deleteMany({ where: { equipment: { organizationId: orgId } } });
  await prisma.equipmentConditionReport.deleteMany({ where: { equipment: { organizationId: orgId } } });
  await prisma.equipmentTransfer.deleteMany({ where: { equipment: { organizationId: orgId } } });
  await prisma.equipment.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditEvent.deleteMany({ where: { entityType: { startsWith: "equipment" } , actorUserAccountId: { in: [jefe, operario] } } });
  await prisma.auditEvent.deleteMany({ where: { entityType: { startsWith: "instrument" }, actorUserAccountId: { in: [jefe, operario] } } });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: [jefe, operario, ajeno] } } });
  await prisma.scope.deleteMany({ where: { OR: [{ scopeRefId: sitioA }, { scopeRefId: sitioB }] } });
  await prisma.userAccount.deleteMany({ where: { id: { in: [jefe, operario, ajeno] } } });
  await prisma.person.deleteMany({ where: { displayName: { contains: RUN } } });
  await prisma.location.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

const refractometro = () =>
  registrarEquipo(jefe, {
    name: `TEST Refractómetro ${RUN}`,
    kind: "instrument",
    organizationId: orgId,
    provenanceClass: "original_record",
    initialLocationId: sitioA,
  });

describe("registrar equipo", () => {
  it("el jefe puede; quien no tiene asignación, no", async () => {
    const e = await refractometro();
    expect(e.kind).toBe("instrument");
    await expect(
      registrarEquipo(ajeno, {
        name: `TEST nada ${RUN}`,
        kind: "vessel",
        organizationId: orgId,
        provenanceClass: "original_record",
    initialLocationId: sitioA,
      }),
    ).rejects.toThrow(new EquipoError("forbidden"));
  });

  /**
   * El CHECK de la base lo rechaza igual. Aquí se comprueba que el servicio da
   * antes una frase legible — un error de restricción de Postgres no se le puede
   * enseñar a nadie.
   */
  it("un instrumento no puede llevar `format`, que es de recipientes", async () => {
    await expect(
      registrarEquipo(jefe, {
        name: `TEST mal ${RUN}`,
        kind: "instrument",
        format: "barrel",
        organizationId: orgId,
        provenanceClass: "original_record",
    initialLocationId: sitioA,
      }),
    ).rejects.toThrow(new EquipoError("format_solo_en_recipientes"));
  });

  it("y un recipiente sí — control positivo del mismo camino", async () => {
    const b = await registrarEquipo(jefe, {
      name: `TEST Barrica ${RUN}`,
      kind: "vessel",
      format: "barrel",
      organizationId: orgId,
      provenanceClass: "original_record",
    initialLocationId: sitioA,
    });
    expect(b.format).toBe("barrel");
  });
});

describe("informar de una avería no exige poder retirar el equipo", () => {
  /**
   * **La prueba que protege la separación de §9.** El operario tiene
   * `equipment:report_condition` y NO `equipment:manage`. Las dos mitades hacen
   * falta: sin la segunda, la prueba pasaría igual con los dos permisos unidos.
   */
  it("el operario informa de la condición, y NO puede trasladar ni registrar", async () => {
    const e = await refractometro();

    const r = await informarCondicion(operario, {
      equipmentId: e.id,
      condition: "faulty",
      occurredAt: new Date("2026-03-14T12:00:00Z"),
    });
    expect(r.condition).toBe("faulty");

    await expect(
      trasladarEquipo(operario, { equipmentId: e.id, toLocationId: sitioB, occurredAt: new Date() }),
    ).rejects.toThrow(new EquipoError("forbidden"));

    await expect(
      registrarEquipo(operario, {
        name: `TEST no ${RUN}`,
        kind: "tool",
        organizationId: orgId,
        provenanceClass: "original_record",
    initialLocationId: sitioA,
      }),
    ).rejects.toThrow(new EquipoError("forbidden"));
  });

  it("y quien no tiene nada tampoco puede informar", async () => {
    const e = await refractometro();
    await expect(
      informarCondicion(ajeno, { equipmentId: e.id, condition: "faulty", occurredAt: new Date() }),
    ).rejects.toThrow(new EquipoError("forbidden"));
  });
});

describe("verificar un instrumento contra sus patrones", () => {
  it("sólo los instrumentos tienen patrones", async () => {
    const tanque = await registrarEquipo(jefe, {
      name: `TEST Tanque ${RUN}`,
      kind: "vessel",
      organizationId: orgId,
      provenanceClass: "original_record",
    initialLocationId: sitioA,
    });
    await expect(
      declararPatron(jefe, {
        equipmentId: tanque.id,
        label: "agua",
        referenceValue: 0,
        unit: "Bx",
        toleranceAbs: 0.2,
      }),
    ).rejects.toThrow(new EquipoError("solo_los_instrumentos_se_verifican"));
  });

  it("el agua a 0 °Bx dentro de tolerancia aprueba; y el veredicto lo pone la base", async () => {
    const e = await refractometro();
    const p = await declararPatron(jefe, {
      equipmentId: e.id,
      label: "agua destilada",
      referenceValue: 0,
      unit: "Bx",
      toleranceAbs: 0.2,
      decidedByPersonId: personaJefe,
    });
    const v = await verificarInstrumento(operario, {
      equipmentId: e.id,
      occurredAt: new Date("2026-03-14T06:00:00Z"),
      contrastes: [{ requirementId: p.id, observedValue: 0.1 }],
    });
    expect(v.outcome).toBe("pass");

    // Y se lee otra vez de la base, no del objeto devuelto: si el servicio
    // calculara el veredicto por su cuenta, comparar su salida consigo misma no
    // diría nada.
    const desdeLaBase = await prisma.instrumentCheck.findUniqueOrThrow({ where: { id: v.id } });
    expect(desdeLaBase.outcome).toBe("pass");
  });

  it("fuera de tolerancia NO aprueba", async () => {
    const e = await refractometro();
    const p = await declararPatron(jefe, {
      equipmentId: e.id,
      label: "agua destilada",
      referenceValue: 0,
      unit: "Bx",
      toleranceAbs: 0.2,
    });
    const v = await verificarInstrumento(operario, {
      equipmentId: e.id,
      occurredAt: new Date("2026-03-14T06:00:00Z"),
      contrastes: [{ requirementId: p.id, observedValue: 0.9 }],
    });
    expect(v.outcome).toBe("fail");
  });

  /**
   * **El cero peligroso.** Una verificación sin un solo contraste no es un
   * aprobado. El servicio la rechaza antes, y la base la dejaría en `fail` si
   * llegara — dos redes para el mismo agujero, a propósito.
   */
  it("una verificación sin contrastes se rechaza", async () => {
    const e = await refractometro();
    await expect(
      verificarInstrumento(operario, { equipmentId: e.id, occurredAt: new Date(), contrastes: [] }),
    ).rejects.toThrow(new EquipoError("hace_falta_al_menos_un_contraste"));
  });

  it("un patrón retirado ya no sirve para verificar", async () => {
    const e = await refractometro();
    const p = await declararPatron(jefe, {
      equipmentId: e.id,
      label: "tampón 4.01",
      referenceValue: 4.01,
      unit: "pH",
      toleranceAbs: 0.05,
    });
    await retirarPatron(jefe, p.id, new Date("2026-03-13T00:00:00Z"));
    await expect(
      verificarInstrumento(operario, {
        equipmentId: e.id,
        occurredAt: new Date("2026-03-14T06:00:00Z"),
        contrastes: [{ requirementId: p.id, observedValue: 4.02 }],
      }),
    ).rejects.toThrow(new EquipoError("requirement_retirado"));
  });

  it("y un patrón de OTRO instrumento tampoco", async () => {
    const uno = await refractometro();
    const otro = await refractometro();
    const p = await declararPatron(jefe, {
      equipmentId: otro.id,
      label: "agua",
      referenceValue: 0,
      unit: "Bx",
      toleranceAbs: 0.2,
    });
    await expect(
      verificarInstrumento(operario, {
        equipmentId: uno.id,
        occurredAt: new Date(),
        contrastes: [{ requirementId: p.id, observedValue: 0 }],
      }),
    ).rejects.toThrow(new EquipoError("requirement_de_otro_instrumento"));
  });
});

describe("el estado se juzga en el instante de la lectura", () => {
  it("sin plazo declarado no vence, y con plazo AVISA sin descalificar", async () => {
    const e = await registrarEquipo(jefe, {
      name: `TEST pHmetro ${RUN}`,
      kind: "instrument",
      organizationId: orgId,
      provenanceClass: "original_record",
    initialLocationId: sitioA,
      checkAdvisoryHours: 24,
    });
    const p = await declararPatron(jefe, {
      equipmentId: e.id,
      label: "tampón 7.00",
      referenceValue: 7.0,
      unit: "pH",
      toleranceAbs: 0.05,
    });
    await verificarInstrumento(operario, {
      equipmentId: e.id,
      occurredAt: new Date("2026-03-14T06:00:00Z"),
      contrastes: [{ requirementId: p.id, observedValue: 7.02 }],
    });

    expect(await estadoDelInstrumento(operario, e.id, new Date("2026-03-14T20:00:00Z"))).toBe("VERIFICADO");
    expect(await estadoDelInstrumento(operario, e.id, new Date("2026-03-16T06:00:00Z"))).toBe("REVISION_VENCIDA");
    // Antes de su verificación no estaba respaldado por ella.
    expect(await estadoDelInstrumento(operario, e.id, new Date("2026-03-13T06:00:00Z"))).toBe("SIN_VERIFICACION");
  });

  it("una lectura sin instrumento declarado no es una avería", async () => {
    expect(await estadoDelInstrumento(operario, null)).toBe("SIN_INSTRUMENTO");
  });
});
