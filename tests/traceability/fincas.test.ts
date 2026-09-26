/**
 * Fincas y parcelas: elegir la finca, y crear fincas, parcelas y microparcelas.
 *
 * Spec: docs/superpowers/specs/2026-09-18-fincas-y-parcelas-design.md.
 * Plan: docs/superpowers/plans/2026-09-18-fincas-y-parcelas.md.
 *
 * Grupo `base-sembrada`: necesita los perfiles del catálogo sembrados.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { TODAS, puedeSubdividirParcela, crearFinca, crearParcela, idsBajoLaFinca, ordenarParcelas, listarFincas, organizacionesSinTerreno, resolverFinca, type Finca } from "../../lib/traceability/fincas";
import { createMicrolot } from "../../lib/traceability/locations";
import { getManageableContext } from "../../lib/traceability/lots";
import { recordHarvestEvent } from "../../lib/traceability/harvest";

const RUN = `fin-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const organizaciones: string[] = [];
const ubicaciones: string[] = [];

let admin: string;
let managerA: string;
let operarioA: string;
let A: { org: string; site: string };
let B: { org: string; site: string };
let C: { org: string; site: string };
let P1: string;
let M1: string;
let Q1: string;

async function cuenta(perfil: string, scope: { scopeType: "location" | "platform"; scopeRefId: string | null }) {
  const personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: perfil, displayName: `TEST ${perfil} (${RUN})` } });
  personas.push(personId);
  const id = randomUUID();
  await prisma.userAccount.create({ data: { id, personId, status: "active", authProvider: "credentials" } });
  cuentas.push(id);
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: scope.scopeType, scopeRefId: scope.scopeRefId } });
  const s = existente ?? (await prisma.scope.create({ data: { id: randomUUID(), ...scope } }));
  if (!existente) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId: id, scopeId: s.id, roleProfileId: roleProfile.id } });
  return id;
}

async function finca(letra: string) {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Finca ${letra} (${RUN})`, status: "approved", classification: "internal" },
  });
  organizaciones.push(org.id);
  const site = await prisma.location.create({
    data: { name: `TEST Finca ${letra} (${RUN})`, locationType: "site", organizationId: org.id, classification: "internal" },
  });
  ubicaciones.push(site.id);
  return { org: org.id, site: site.id };
}

async function plot(nombre: string, parentLocationId: string, extra: Record<string, unknown> = {}) {
  const p = await prisma.location.create({
    data: { name: `${nombre} (${RUN})`, locationType: "plot", parentLocationId, classification: "internal", ...extra },
  });
  ubicaciones.push(p.id);
  return p.id;
}

beforeAll(async () => {
  A = await finca("A");
  B = await finca("B");
  C = await finca("C");
  P1 = await plot("P1", A.site);
  M1 = await plot("M1", P1, { subdivisionReason: "shade" });
  Q1 = await plot("Q1", B.site);
  admin = await cuenta("Platform Admin", { scopeType: "platform", scopeRefId: null });
  managerA = await cuenta("Farm Manager", { scopeType: "location", scopeRefId: A.site });
  // Dos fincas, A y C, y no B: con UNA sola, `resolverFinca` la elige sin mirar la cookie, y la
  // prueba de la cookie ajena no ejercería nada (lo destapó el flip-test del 2026-09-18).
  const fm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  const scopeC = (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: C.site } }))
    ?? (await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: C.site } }));
  if (!scopes.includes(scopeC.id)) scopes.push(scopeC.id);
  await prisma.assignment.create({ data: { userAccountId: managerA, scopeId: scopeC.id, roleProfileId: fm.id } });
  operarioA = await cuenta("Farm Operator", { scopeType: "location", scopeRefId: A.site });
}, 30000);

afterAll(async () => {
  // Todo lo que cuelgue de las fincas de esta corrida, también lo que creen las pruebas.
  const todas = await prisma.location.findMany({
    where: { OR: [{ id: { in: ubicaciones } }, { name: { contains: RUN } }, { organizationId: { in: organizaciones } }] },
    select: { id: true },
  });
  let ids = todas.map((l) => l.id);
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const hijos = await prisma.location.findMany({ where: { parentLocationId: { in: ids }, id: { notIn: ids } }, select: { id: true } });
    if (!hijos.length) break;
    ids = [...ids, ...hijos.map((h) => h.id)];
  }
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...ids, ...organizaciones] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  // Hojas primero: `parent_location_id` es SET NULL, y un hijo con el padre en null ya no se encuentra.
  for (let vuelta = 0; ids.length && vuelta < 6; vuelta++) {
    const padres = new Set(
      (await prisma.location.findMany({ where: { id: { in: ids } }, select: { parentLocationId: true } }))
        .map((l) => l.parentLocationId)
        .filter((x): x is string => !!x),
    );
    const hojas = ids.filter((id) => !padres.has(id));
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: hojas } }) });
    ids = ids.filter((id) => padres.has(id));
  }
  const orgsDeLaCorrida = await prisma.organization.findMany({ where: { name: { contains: RUN } }, select: { id: true } });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [...organizaciones, ...orgsDeLaCorrida.map((o) => o.id)] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
}, 30000);

describe("qué fincas ve cada uno", () => {
  it("el Farm Manager de A y C ve A y C y no B; el admin ve las tres (control positivo)", async () => {
    const deManager = (await listarFincas(managerA)).map((f) => f.siteId);
    expect(deManager).toEqual(expect.arrayContaining([A.site, C.site]));
    expect(deManager).not.toContain(B.site);
    const deAdmin = (await listarFincas(admin)).map((f) => f.siteId);
    expect(deAdmin).toEqual(expect.arrayContaining([A.site, B.site]));
  }, 20000);

  it("una finca lleva su nombre, su organización y su tipo", async () => {
    const a = (await listarFincas(admin)).find((f) => f.siteId === A.site);
    expect(a).toEqual({ siteId: A.site, nombre: `TEST Finca A (${RUN})`, organizationId: A.org, tipo: "farm", logoAssetId: null });
  }, 20000);

  // Daniel, 2026-09-21: «Invernadero solar» le salía en /fincas como si fuera otra finca. El
  // import de Cafelino lo creó como `site` colgado del sitio de Cafelino, antes de que existiera
  // `drying_facility`. Un sitio dentro de otro sitio no es otra finca: es parte de la de arriba.
  it("UN SITIO COLGADO DE OTRO SITIO no es otra finca, y lo que cuelga de él cuenta como de la finca de arriba", async () => {
    const invernadero = await prisma.location.create({
      data: { name: `TEST Invernadero (${RUN})`, locationType: "site", organizationId: A.org, parentLocationId: A.site, classification: "internal" },
    });
    ubicaciones.push(invernadero.id);
    const cama = await plot("Cama del invernadero", invernadero.id);

    const fincas = (await listarFincas(admin)).map((f) => f.siteId);
    expect(fincas).not.toContain(invernadero.id); // el defecto: salía como finca
    expect(fincas).toContain(A.site); // el control: la finca de verdad sigue saliendo

    // Y quien sólo tiene ámbito sobre lo que cuelga del invernadero llega a la finca de arriba, no al invernadero.
    const soloCama = await cuenta("Farm Operator", { scopeType: "location", scopeRefId: cama });
    expect((await listarFincas(soloCama)).map((f) => f.siteId)).toEqual([A.site]);
  }, 20000);
});

describe("qué finca queda elegida", () => {
  const fa: Finca = { siteId: "a", nombre: "A", organizationId: "oa", tipo: "farm", logoAssetId: null };
  const fb: Finca = { siteId: "b", nombre: "B", organizationId: "ob", tipo: "estate", logoAssetId: null };

  it("con una sola finca, esa, aunque no haya cookie", () => {
    expect(resolverFinca([fa], undefined)).toEqual({ elegida: fa, todas: false, debeElegir: false });
  });

  it("con varias y sin cookie, hay que elegir", () => {
    expect(resolverFinca([fa, fb], undefined)).toEqual({ elegida: null, todas: false, debeElegir: true });
  });

  it("la cookie elige, «todas» ve todas, y un valor desconocido vuelve a preguntar", () => {
    expect(resolverFinca([fa, fb], "b").elegida).toEqual(fb);
    expect(resolverFinca([fa, fb], TODAS)).toEqual({ elegida: null, todas: true, debeElegir: false });
    expect(resolverFinca([fa, fb], "otra-cosa")).toEqual({ elegida: null, todas: false, debeElegir: true });
  });

  it("una cookie con una finca ajena no se acepta: la cookie sólo acota lo autorizado", async () => {
    const fincasDeA = await listarFincas(managerA);
    // Fila patrón: con una sola finca esto no probaría nada.
    expect(fincasDeA.length, "el manager necesita dos fincas para que la cookie cuente").toBeGreaterThanOrEqual(2);
    expect(resolverFinca(fincasDeA, B.site)).toEqual({ elegida: null, todas: false, debeElegir: true });
    // Control positivo: la misma cookie SÍ elige B para quien la ve.
    expect(resolverFinca(await listarFincas(admin), B.site).elegida?.siteId).toBe(B.site);
  }, 20000);
});

describe("qué cuelga de una finca", () => {
  it("el sitio, sus parcelas y sus microparcelas; nada de la otra finca", async () => {
    const todas = await prisma.location.findMany({ select: { id: true, parentLocationId: true } });
    const bajoA = idsBajoLaFinca(todas, A.site);
    expect([...bajoA]).toEqual(expect.arrayContaining([A.site, P1, M1]));
    expect(bajoA.has(Q1)).toBe(false);
    expect(bajoA.has(B.site)).toBe(false);
  }, 20000);
});


describe("crear una finca", () => {
  it("el admin la crea: organización, terreno y AuditEvent", async () => {
    const { organization, site } = await crearFinca(admin, { nombre: `TEST Finca Nueva (${RUN})`, tipo: "estate" });
    organizaciones.push(organization.id);
    ubicaciones.push(site.id);
    expect(organization.organizationType).toBe("estate");
    expect(site.locationType).toBe("site");
    expect(site.organizationId).toBe(organization.id);
    const ev = await prisma.auditEvent.findFirst({ where: { entityId: site.id, operation: "location.create_farm" } });
    expect(ev).not.toBeNull();
    // Y aparece en su lista de fincas.
    expect((await listarFincas(admin)).map((f) => f.siteId)).toContain(site.id);
  }, 20000);

  it("el Farm Manager de una finca no crea fincas", async () => {
    await expect(crearFinca(managerA, { nombre: `TEST No (${RUN})`, tipo: "farm" })).rejects.toThrow(/sin_permiso/);
    expect(await prisma.organization.count({ where: { name: `TEST No (${RUN})` } })).toBe(0);
  }, 20000);

  it("a una organización de finca sin terreno se le crea sólo el terreno, y una sola vez", async () => {
    const sola = await prisma.organization.create({
      data: { organizationType: "estate", name: `TEST Sin Terreno (${RUN})`, status: "approved", classification: "internal" },
    });
    organizaciones.push(sola.id);
    expect((await organizacionesSinTerreno(admin)).map((o) => o.id)).toContain(sola.id);
    expect(await organizacionesSinTerreno(managerA)).toEqual([]);

    const { organization, site } = await crearFinca(admin, { organizationId: sola.id });
    ubicaciones.push(site.id);
    expect(organization.id).toBe(sola.id);
    expect(site.name).toBe(sola.name);
    expect((await organizacionesSinTerreno(admin)).map((o) => o.id)).not.toContain(sola.id);
    await expect(crearFinca(admin, { organizationId: sola.id })).rejects.toThrow(/ya_tiene_terreno/);
  }, 20000);

  it("un nombre inválido se rechaza antes de escribir nada", async () => {
    const largo = `TEST Larga (${RUN}) ${"x".repeat(120)}`;
    await expect(crearFinca(admin, { nombre: largo, tipo: "farm" })).rejects.toThrow(/nombre_invalido/);
    expect(await prisma.organization.count({ where: { name: { startsWith: `TEST Larga (${RUN})` } } })).toBe(0);
  }, 20000);
});

describe("crear parcelas", () => {
  it("el Farm Manager de A crea una parcela en A, con su AuditEvent", async () => {
    const p = await crearParcela(managerA, { siteId: A.site, nombre: `Lote 7 (${RUN})`, areaHectareas: 1.5 });
    expect(p.locationType).toBe("plot");
    expect(p.parentLocationId).toBe(A.site);
    expect(Number(p.areaHectares)).toBe(1.5);
    expect(await prisma.auditEvent.findFirst({ where: { entityId: p.id, operation: "location.create_plot" } })).not.toBeNull();
  }, 20000);

  it("el mismo nombre en la misma finca se rechaza, sin distinguir mayúsculas ni espacios; en otra finca, no", async () => {
    await crearParcela(managerA, { siteId: A.site, nombre: `Repetida (${RUN})` });
    await expect(crearParcela(managerA, { siteId: A.site, nombre: `  repetida (${RUN}) ` })).rejects.toThrow(/nombre_repetido/);
    // Control positivo: en otra finca el mismo nombre SÍ se crea.
    const enB = await crearParcela(admin, { siteId: B.site, nombre: `Repetida (${RUN})` });
    expect(enB.parentLocationId).toBe(B.site);
  }, 20000);

  it("el Farm Manager de A no crea en B, y el Farm Operator de A no crea en A", async () => {
    await expect(crearParcela(managerA, { siteId: B.site, nombre: `Ajena (${RUN})` })).rejects.toThrow();
    await expect(crearParcela(operarioA, { siteId: A.site, nombre: `Del operario (${RUN})` })).rejects.toThrow(/no_location_create_access/);
    expect(await prisma.location.count({ where: { name: { in: [`Ajena (${RUN})`, `Del operario (${RUN})`] } } })).toBe(0);
  }, 20000);

  it("una microparcela tampoco repite nombre dentro de su parcela", async () => {
    await createMicrolot(managerA, { parentLocationId: P1, name: `Sombra (${RUN})`, subdivisionReason: "shade" });
    await expect(createMicrolot(managerA, { parentLocationId: P1, name: `SOMBRA (${RUN})`, subdivisionReason: "shade" })).rejects.toThrow(
      /nombre_repetido/,
    );
  }, 20000);

  // Formulario completo (2026-09-21): área en ha o en m², GPS opcional (las dos o ninguna,
  // dentro de rango) y descripción de dónde está en la finca.
  describe("los campos nuevos del formulario", () => {
    it("guarda el área declarada en hectáreas tal cual", async () => {
      const p = await crearParcela(managerA, { siteId: A.site, nombre: `Área ha (${RUN})`, areaHectareas: 2.25 });
      expect(Number(p.areaHectares)).toBe(2.25);
    }, 20000);

    it("guarda el área declarada en m², convertida a hectáreas (÷ 10 000)", async () => {
      const p = await crearParcela(managerA, { siteId: A.site, nombre: `Área m2 (${RUN})`, areaMetrosCuadrados: 20000 });
      expect(Number(p.areaHectares)).toBe(2);
    }, 20000);

    it("GPS válido guarda latitud y longitud", async () => {
      const p = await crearParcela(managerA, {
        siteId: A.site,
        nombre: `GPS válido (${RUN})`,
        latitude: 8.9824,
        longitude: -79.5199,
      });
      expect(p.latitude).toBe(8.9824);
      expect(p.longitude).toBe(-79.5199);
    }, 20000);

    it("sólo latitud, sin longitud: error, y no se crea la fila", async () => {
      const nombre = `GPS incompleto (${RUN})`;
      await expect(crearParcela(managerA, { siteId: A.site, nombre, latitude: 8.98 })).rejects.toThrow(/gps_incompleto/);
      expect(await prisma.location.count({ where: { name: nombre } })).toBe(0);
    }, 20000);

    it("latitud fuera de rango: error, y no se crea la fila", async () => {
      const nombre = `GPS fuera de rango (${RUN})`;
      await expect(
        crearParcela(managerA, { siteId: A.site, nombre, latitude: 95, longitude: -79.5199 }),
      ).rejects.toThrow(/latitud_fuera_de_rango/);
      expect(await prisma.location.count({ where: { name: nombre } })).toBe(0);
    }, 20000);

    it("longitud fuera de rango: error, y no se crea la fila", async () => {
      const nombre = `GPS longitud fuera de rango (${RUN})`;
      await expect(
        crearParcela(managerA, { siteId: A.site, nombre, latitude: 8.98, longitude: -200 }),
      ).rejects.toThrow(/longitud_fuera_de_rango/);
      expect(await prisma.location.count({ where: { name: nombre } })).toBe(0);
    }, 20000);

    it("la descripción se recorta; vacía o sólo espacios se guarda null", async () => {
      const conTexto = await crearParcela(managerA, {
        siteId: A.site,
        nombre: `Con descripción (${RUN})`,
        descripcion: "  bajando del beneficio, a la izquierda de la quebrada  ",
      });
      expect(conTexto.description).toBe("bajando del beneficio, a la izquierda de la quebrada");

      const sinTexto = await crearParcela(managerA, { siteId: A.site, nombre: `Sin descripción (${RUN})`, descripcion: "   " });
      expect(sinTexto.description).toBeNull();
    }, 20000);
  });
});

describe("la cosecha va sobre una parcela", () => {
  const base = () => ({ organizationId: A.org, harvestedAt: new Date(), provenanceClass: "direct_observation" as const });

  it("sobre una microparcela se registra; sobre el sitio de la finca o un beneficio, el servicio la rechaza", async () => {
    const beneficio = await prisma.location.create({
      data: { name: `Beneficio (${RUN})`, locationType: "beneficio", parentLocationId: A.site, classification: "internal" },
    });
    ubicaciones.push(beneficio.id);
    const { lot, harvestEvent } = await recordHarvestEvent(admin, { ...base(), lotCode: `TEST-${RUN}-M1`, locationId: M1 });
    try {
      expect(harvestEvent.locationId).toBe(M1);
      await expect(recordHarvestEvent(admin, { ...base(), lotCode: `TEST-${RUN}-SITIO`, locationId: A.site })).rejects.toThrow(
        /la_cosecha_va_sobre_una_parcela/,
      );
      await expect(recordHarvestEvent(admin, { ...base(), lotCode: `TEST-${RUN}-BEN`, locationId: beneficio.id })).rejects.toThrow(
        /la_cosecha_va_sobre_una_parcela/,
      );
      expect(await prisma.lot.count({ where: { lotCode: { in: [`TEST-${RUN}-SITIO`, `TEST-${RUN}-BEN`] } } })).toBe(0);
    } finally {
      await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [lot.id, harvestEvent.id] } }) });
      await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: lot.id }) });
      await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ id: harvestEvent.id }) });
      await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: lot.id }) });
    }
  }, 30000);
});

describe("el orden para elegir parcela", () => {
  it("cada microparcela justo debajo de su parcela, sangrada; en orden natural", () => {
    const orden = ordenarParcelas([
      { id: "p10", name: "Lote 10", parentLocationId: "sitio" },
      { id: "m", name: "Sombra", parentLocationId: "p2" },
      { id: "p2", name: "Lote 2", parentLocationId: "sitio" },
    ]);
    expect(orden.map((p) => p.name)).toEqual(["Lote 2", "— Sombra", "Lote 10"]);
  });

  it("una microparcela cuya parcela no está en la lista sale sola, sin sangría", () => {
    expect(ordenarParcelas([{ id: "m", name: "Sombra", parentLocationId: "fuera" }]).map((p) => p.name)).toEqual(["Sombra"]);
  });
});

describe("subdividir una parcela: el botón pregunta lo que el servicio exige (2026-09-25)", () => {
  /**
   * `/plots/[id]/ajustes` pintaba «Nueva microparcela» sólo por que el lugar fuera una parcela, sin
   * mirar permisos — un botón que promete lo que el servidor puede negar. Y era el único camino,
   * escondido tras «Ajustes»: Daniel lo buscó desde /finca y creyó que la función había desaparecido.
   * `puedeSubdividirParcela` pregunta lo mismo que `createMicrolot` (`location:manage_attributes`).
   */
  it("un operario con ámbito en la finca puede subdividir su parcela", async () => {
    expect(await puedeSubdividirParcela(operarioA, P1)).toBe(true);
  });

  it("una microparcela también se puede subdividir: el spec no pone tope", async () => {
    expect(await puedeSubdividirParcela(operarioA, M1)).toBe(true);
  });

  it("no se puede subdividir la parcela de otra finca", async () => {
    expect(await puedeSubdividirParcela(operarioA, Q1)).toBe(false);
  });

  it("un sitio no es una parcela, y un id que no existe tampoco", async () => {
    expect(await puedeSubdividirParcela(admin, A.site)).toBe(false);
    expect(await puedeSubdividirParcela(admin, "00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});

describe("un ámbito de lugar alcanza lo que cuelga de él, también en las LISTAS (ADR-144, 2026-09-25)", () => {
  /**
   * `can()` sube por los ancestros del recurso desde ADR-144, pero `resolveLotVisibility` miraba
   * sólo el id exacto del ámbito. Medido con una cuenta Farm Manager de ámbito «Finca Rosina»: la
   * finca tenía SEIS parcelas y `getManageableContext` devolvía CERO. La ficha autorizaba y la lista
   * no enseñaba, así que parecía que las parcelas hubieran desaparecido.
   */
  it("quien tiene la finca ve sus parcelas y microparcelas en la lista", async () => {
    const ctx = await getManageableContext(managerA);
    const ids = ctx.locations.map((l) => l.id);
    expect(ids, "la finca").toContain(A.site);
    expect(ids, "su parcela").toContain(P1);
    expect(ids, "la microparcela que cuelga de la parcela").toContain(M1);
    expect(ctx.plotLocations.map((p) => p.id)).toContain(P1);
  });

  it("y NO ve la parcela de otra finca: baja, no se ensancha", async () => {
    const ctx = await getManageableContext(managerA);
    expect(ctx.locations.map((l) => l.id)).not.toContain(Q1);
    expect(ctx.locations.map((l) => l.id)).not.toContain(B.site);
  });

  it("quien tiene sólo una parcela ve su microparcela, pero no la finca ni la parcela hermana", async () => {
    const soloP1 = await cuenta("Farm Operator", { scopeType: "location", scopeRefId: P1 });
    const ctx = await getManageableContext(soloP1);
    const ids = ctx.locations.map((l) => l.id);
    expect(ids, "su parcela").toContain(P1);
    expect(ids, "lo que cuelga de ella").toContain(M1);
    expect(ids, "la finca de arriba NO").not.toContain(A.site);
    expect(ids, "la parcela de otra finca NO").not.toContain(Q1);
  });
});
