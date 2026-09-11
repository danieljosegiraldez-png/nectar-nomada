/**
 * Las irregularidades de una inspección, contables.
 *
 * **Lo que esto defiende, y es literalmente lo que pide el Anexo B §2.3:**
 * *«Una cadena no se puede contar, y "todas las colonias con varroa esta
 * temporada" es exactamente el reporte que hace falta.»* Medido el 2026-09-11,
 * antes de tocar nada: **ninguna línea de aplicación consultaba
 * `pestDiseaseFlags`**. El reporte no se podía ni intentar.
 *
 * Las dos aserciones que ninguna lectura del código puede dar: que el conteo
 * cuente **colonias distintas** y no inspecciones —tres visitas a la misma caja
 * con varroa son un problema, no tres—, y que una bandera que nadie marcó
 * aparezca con **cero** en vez de desaparecer del reporte: «no hay varroa» y
 * «nadie miró varroa» no son lo mismo.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordInspection, InspectionValidationError } from "../../lib/apiary/inspections";
import {
  CATALOGO_DE_IRREGULARIDAD,
  coloniasPorIrregularidad,
  irregularidadesOfrecidas,
} from "../../lib/apiary/irregularidades";
import { pushFieldEvents } from "../../lib/sync/pushFieldEvents";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `irr-${Date.now()}`;
const TEMPORADA_DESDE = new Date("2026-01-01T00:00:00Z");
const TEMPORADA_HASTA = new Date("2027-01-01T00:00:00Z");

describe("las irregularidades de una inspección", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let scopeId: string;
  const personIds: string[] = [];
  const porValor = new Map<string, string>();
  const idDe = (v: string) => {
    const id = porValor.get(v);
    // Un `undefined` aquí llegaría a Prisma como consulta sin filtro. Se rompe
    // con nombre en vez de medir otra cosa.
    if (!id) throw new Error(`falta la irregularidad «${v}» en el catálogo sembrado`);
    return id;
  };

  async function nuevaColonia(i: number) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `I${i}-${RUN_ID.slice(-4)}` });
    const colony = await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    return colony;
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Irregularidades", displayName: `TEST Irr (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    const cuenta = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    userAccountId = cuenta.id;

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });

    for (const v of await prisma.variableCatalogValue.findMany({
      where: { catalog: { key: CATALOGO_DE_IRREGULARIDAD } },
      select: { id: true, value: true },
    })) {
      porValor.set(v.value, v.id);
    }
    // Control positivo: la semilla corrió. Con el catálogo vacío las pruebas de
    // abajo fallarían por la razón equivocada.
    if (porValor.size === 0) throw new Error("el catálogo de irregularidades está vacío: falta `npm run db:seed`");
  });

  /**
   * Lo que cada `it` crea se borra aquí, no al final de su cuerpo: un `afterEach`
   * corre aunque la prueba falle. Es el defecto que `CLAUDE.md` registra —una
   * limpieza escrita debajo de las aserciones no se ejecuta, y la FK siguiente
   * aborta el `afterAll` entero dejando filas TEST en la base compartida.
   */
  afterEach(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    const ids = colonias.map((c) => c.id);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    // El `Scope` se borra DESPUÉS del `Assignment`, que lo referencia con
    // RESTRICT. `CLAUDE.md` cuenta 284 huérfanos acumulados por omitirlo.
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("el vocabulario son las trece banderas del Anexo B, sin el «Otro»", async () => {
    const ofrecidas = (await irregularidadesOfrecidas()).map((i) => i.value);
    expect(ofrecidas).toHaveLength(13);
    // «Otro» NO es un valor de catálogo: es `pestDiseaseFlags`. Si alguien lo
    // añadiera, habría dos sitios para la misma cosa.
    expect(ofrecidas).not.toContain("Otro");
    expect(ofrecidas).toContain("Varroa");
  });

  it("una inspección guarda VARIAS banderas, y quedan atadas a ella", async () => {
    const c = await nuevaColonia(1);
    const insp = await recordInspection(userAccountId, {
      colonyId: c.id,
      outcome: "issue_observed",
      occurredAt: new Date("2026-03-10T09:00:00Z"),
      irregularidades: [idDe("Varroa"), idDe("Polilla de la cera")],
    });
    const filas = await prisma.inspectionIrregularity.findMany({
      where: { inspectionId: insp.id },
      include: { value: { select: { value: true } } },
    });
    expect(filas.map((f) => f.value.value).sort()).toEqual(["Polilla de la cera", "Varroa"]);
  });

  it("la misma bandera dos veces no crea dos filas", async () => {
    const c = await nuevaColonia(2);
    const insp = await recordInspection(userAccountId, {
      colonyId: c.id,
      outcome: "issue_observed",
      irregularidades: [idDe("Varroa"), idDe("Varroa")],
    });
    expect(await prisma.inspectionIrregularity.count({ where: { inspectionId: insp.id } })).toBe(1);
  });

  it("una bandera que no es de este catálogo se rechaza — la FK sola no lo impide", async () => {
    // La FK apunta a `variable_catalog_value` ENTERA. Sin la comprobación del
    // servicio, colgar una levadura de una inspección sería legal.
    const levadura = await prisma.variableCatalogValue.findFirstOrThrow({
      where: { catalog: { key: "levadura_cultivo" } },
      select: { id: true },
    });
    const c = await nuevaColonia(3);
    await expect(
      recordInspection(userAccountId, { colonyId: c.id, outcome: "issue_observed", irregularidades: [levadura.id] }),
    ).rejects.toThrow(InspectionValidationError);
    // CONTROL POSITIVO: la misma llamada con un id que SÍ es del catálogo entra.
    // Sin esto, «rechazó» no probaría que mira el catálogo en vez de rechazar
    // cualquier bandera.
    const ok = await recordInspection(userAccountId, {
      colonyId: c.id,
      outcome: "issue_observed",
      irregularidades: [idDe("Moho")],
    });
    expect(await prisma.inspectionIrregularity.count({ where: { inspectionId: ok.id } })).toBe(1);
  });

  it("EL REPORTE DEL ANEXO B: cuenta colonias distintas, no inspecciones", async () => {
    // Dos colonias con varroa, y una de ellas inspeccionada DOS veces. La
    // respuesta correcta a «cuántas colonias con varroa» es 2, no 3.
    const a = await nuevaColonia(4);
    const b = await nuevaColonia(5);
    for (const [colonia, cuando] of [
      [a, "2026-03-10T09:00:00Z"],
      [a, "2026-04-14T09:00:00Z"],
      [b, "2026-03-11T09:00:00Z"],
    ] as const) {
      await recordInspection(userAccountId, {
        colonyId: colonia.id,
        outcome: "issue_observed",
        occurredAt: new Date(cuando),
        irregularidades: [idDe("Varroa")],
      });
    }
    const reporte = await coloniasPorIrregularidad(locationId, TEMPORADA_DESDE, TEMPORADA_HASTA);
    const varroa = reporte.find((r) => r.value === "Varroa")!;
    expect(varroa.colonias).toBe(2);
    // Y la otra mitad del dato, que también sirve: cuántas veces se vio.
    expect(varroa.inspecciones).toBe(3);
  });

  it("una bandera que nadie marcó sale con CERO, no desaparece", async () => {
    // «No hay loque» y «nadie miró loque» no son lo mismo, y un reporte que sólo
    // enseña lo encontrado no los distingue.
    const c = await nuevaColonia(6);
    await recordInspection(userAccountId, {
      colonyId: c.id,
      outcome: "issue_observed",
      occurredAt: new Date("2026-03-10T09:00:00Z"),
      irregularidades: [idDe("Varroa")],
    });
    const reporte = await coloniasPorIrregularidad(locationId, TEMPORADA_DESDE, TEMPORADA_HASTA);
    expect(reporte).toHaveLength(13);
    expect(reporte.find((r) => r.value === "Loque")!.colonias).toBe(0);
  });

  it("la ventana de la temporada recorta de verdad", async () => {
    const c = await nuevaColonia(7);
    await recordInspection(userAccountId, {
      colonyId: c.id,
      outcome: "issue_observed",
      occurredAt: new Date("2025-06-01T09:00:00Z"),
      irregularidades: [idDe("Varroa")],
    });
    const deEstaTemporada = await coloniasPorIrregularidad(locationId, TEMPORADA_DESDE, TEMPORADA_HASTA);
    expect(deEstaTemporada.find((r) => r.value === "Varroa")!.colonias).toBe(0);
    // Control positivo: con la ventana que SÍ la contiene, aparece. Sin esto,
    // el cero de arriba podría ser un filtro roto en vez de un recorte.
    const deLaAnterior = await coloniasPorIrregularidad(
      locationId,
      new Date("2025-01-01T00:00:00Z"),
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(deLaAnterior.find((r) => r.value === "Varroa")!.colonias).toBe(1);
  });

  it("las banderas sobreviven el viaje por la cola offline", async () => {
    // **La mitad que importa para el campo.** Una inspección con hallazgo se
    // anota sin señal; si `irregularidades` no viajara en la mutación, las
    // banderas sólo se podrían marcar con cobertura — que es el hueco que la
    // cola existe para cerrar. Y es un fallo de los callados: el nombre del
    // campo mal escrito en la traducción se pierde sin que nada reviente.
    const device = await prisma.device.create({
      data: { label: `TEST PWA (${RUN_ID})`, platform: "pwa", createdBy: userAccountId },
    });
    try {
      const c = await nuevaColonia(9);
      const [r] = await pushFieldEvents(userAccountId, device.id, [
        {
          kind: "inspection",
          clientDraftId: `${RUN_ID}-cola`,
          colonyId: c.id,
          occurredAt: new Date("2026-03-10T09:00:00Z"),
          outcome: "issue_observed",
          irregularidades: [idDe("Varroa"), idDe("Hambre")],
        },
      ]);
      expect(r!.status).toBe("applied");
      const filas = await prisma.inspectionIrregularity.findMany({
        where: { inspection: { clientDraftId: `${RUN_ID}-cola` } },
        include: { value: { select: { value: true } } },
      });
      expect(filas.map((f) => f.value.value).sort()).toEqual(["Hambre", "Varroa"]);
    } finally {
      await prisma.device.deleteMany({ where: assertDefinedWhere({ id: device.id }) });
    }
  });

  it("el reporte no se lleva las inspecciones de OTRO sitio", async () => {
    const otraUbicacion = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Otro (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    try {
      const c = await nuevaColonia(8);
      await recordInspection(userAccountId, {
        colonyId: c.id,
        outcome: "issue_observed",
        occurredAt: new Date("2026-03-10T09:00:00Z"),
        irregularidades: [idDe("Hormigas")],
      });
      const delOtro = await coloniasPorIrregularidad(otraUbicacion.id, TEMPORADA_DESDE, TEMPORADA_HASTA);
      expect(delOtro.find((r) => r.value === "Hormigas")!.colonias).toBe(0);
      // Control positivo: en el sitio correcto sí cuenta.
      const delMio = await coloniasPorIrregularidad(locationId, TEMPORADA_DESDE, TEMPORADA_HASTA);
      expect(delMio.find((r) => r.value === "Hormigas")!.colonias).toBe(1);
    } finally {
      await prisma.location.deleteMany({ where: assertDefinedWhere({ id: otraUbicacion.id }) });
    }
  });
});
