import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/db";
import { crearTipoDeBandeja } from "../../lib/equipos/bandejas";
import { createLot } from "../../lib/traceability/lots";
import { puedeEditarBeneficioEnOrganizacion } from "../../lib/traceability/locations";
import { lotesGestionablesDeOrganizacion, vistaDeBandejas } from "../../lib/beneficio/vistaDeBandejas";
import { lotWhereFromVisibility, resolveLotVisibility } from "../../lib/traceability/lots";
import * as capacidadModule from "../../lib/traceability/capacidadDeBandeja";

/**
 * `vistaDeBandejas` (revisión final del plan 2a): A1 (el selector de lotes no
 * enseña uno que esta cuenta no gestiona) y A5 (sólo entran organizaciones con
 * al menos un `site`). El montaje sigue la forma de
 * `tests/traceability/capacidadDeBandeja.test.ts`.
 */

function nombre(etiqueta: string) {
  return `TEST ${etiqueta}-${randomUUID().slice(0, 8)}`;
}

const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
const orgIds: string[] = [];
const locationIds: string[] = [];
const lotIds: string[] = [];
const tipoIds: string[] = [];

async function cuenta(etiqueta: string) {
  const person = await prisma.person.create({ data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(etiqueta) } });
  personIds.push(person.id);
  const account = await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } });
  accountIds.push(account.id);
  return account.id;
}

async function asignar(userAccountId: string, perfil: "Farm Manager" | "Farm Operator", locationId: string) {
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!existente) scopeIds.push(scope.id);
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
}

afterAll(async () => {
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });
  await prisma.dryingTrayType.deleteMany({ where: { id: { in: tipoIds } } });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: accountIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.auditEvent.deleteMany({ where: { actorUserAccountId: { in: accountIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("A1: el selector de lotes filtra por lo que la cuenta gestiona, no sólo por ámbito", () => {
  it("un lote trade_secret en el ámbito propio no sale; el interno sí (control)", async () => {
    const org = await prisma.organization.create({ data: { organizationType: "farm", name: nombre("org-a1"), status: "approved", classification: "internal" } });
    orgIds.push(org.id);
    const sitio = await prisma.location.create({ data: { locationType: "site", name: nombre("sitio-a1"), organizationId: org.id, status: "approved", classification: "internal" } });
    locationIds.push(sitio.id);
    const gerente = await cuenta("gerente-a1");
    await asignar(gerente, "Farm Manager", sitio.id);
    const operario = await cuenta("operario-a1");
    await asignar(operario, "Farm Operator", sitio.id);
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org.id, nombre: nombre("Tipo"), ancho: 1, largo: 1, unidad: "ft" });
    tipoIds.push(tipo.id);

    const loteInterno = await createLot(operario, { lotCode: nombre("interno"), lotType: "drying", organizationId: org.id, locationId: sitio.id });
    lotIds.push(loteInterno.id);
    // Un Farm Operator no tiene `classification:clear_trade_secret` (catálogo
    // RBAC) — el mismo ámbito, otra clasificación, y ya no puede gestionarlo.
    const loteSecreto = await prisma.lot.create({ data: { lotCode: nombre("secreto"), lotType: "drying", organizationId: org.id, locationId: sitio.id, classification: "trade_secret", createdBy: gerente } });
    lotIds.push(loteSecreto.id);

    const secciones = await vistaDeBandejas(operario);
    const seccion = secciones.find((s) => s.org.id === org.id)!;
    expect(seccion).toBeDefined();
    const ids = seccion.lotesGestionables.map((l) => l.id);
    expect(ids).toContain(loteInterno.id);
    expect(ids).not.toContain(loteSecreto.id);
    expect(seccion.lotesRecortados).toBe(false);
  });
});

describe("F4: la paginación llega al gestionable aunque haya restringidos por delante", () => {
  it("3 restringidos por delante de 1 gestionable, con cuota 2: el gestionable sale", async () => {
    const org = await prisma.organization.create({ data: { organizationType: "farm", name: nombre("org-f4"), status: "approved", classification: "internal" } });
    orgIds.push(org.id);
    const sitio = await prisma.location.create({ data: { locationType: "site", name: nombre("sitio-f4"), organizationId: org.id, status: "approved", classification: "internal" } });
    locationIds.push(sitio.id);
    const operario = await cuenta("operario-f4");
    await asignar(operario, "Farm Operator", sitio.id);

    // El gestionable se crea PRIMERO (más viejo) y los tres restringidos
    // DESPUÉS (más nuevos), para que `orderBy: createdAt desc` los ponga a
    // los tres por delante — exactamente el orden que el `take: 101` +
    // `slice(0, 100)` + autorizar-DESPUÉS de antes dejaba fuera al gestionable
    // si hubiera 100 restringidos por delante.
    const gestionable = await createLot(operario, { lotCode: nombre("f4-gestionable"), lotType: "drying", organizationId: org.id, locationId: sitio.id });
    lotIds.push(gestionable.id);
    for (let i = 0; i < 3; i++) {
      const restringido = await prisma.lot.create({ data: { lotCode: nombre(`f4-restringido-${i}`), lotType: "drying", organizationId: org.id, locationId: sitio.id, classification: "trade_secret" } });
      lotIds.push(restringido.id);
    }

    const visibilidad = await resolveLotVisibility(operario, "manage");
    const loteWhere = lotWhereFromVisibility(visibilidad)!;
    // `tamanoPagina: 2` fuerza la paginación con sólo 4 lotes: página 1 son
    // los dos restringidos más nuevos (0 gestionables), página 2 trae el
    // tercer restringido y el gestionable.
    const { lotes, recortados } = await lotesGestionablesDeOrganizacion(operario, loteWhere, org.id, { cuota: 2, tamanoPagina: 2, maxPaginas: 5 });
    expect(lotes.map((l) => l.id)).toEqual([gestionable.id]);
    expect(recortados).toBe(false); // se agotaron los candidatos sin tocar el tope de páginas
  });
});

describe("F5 (RULING): un tipo que falla con un error NO de acceso degrada su fila; los demás siguen", () => {
  afterEach(() => vi.restoreAllMocks());

  it("un tipo lanza un error genérico; el otro tipo de la misma organización sigue rindiendo su capacidad", async () => {
    const org = await prisma.organization.create({ data: { organizationType: "farm", name: nombre("org-f5"), status: "approved", classification: "internal" } });
    orgIds.push(org.id);
    const sitio = await prisma.location.create({ data: { locationType: "site", name: nombre("sitio-f5"), organizationId: org.id, status: "approved", classification: "internal" } });
    locationIds.push(sitio.id);
    const gerente = await cuenta("gerente-f5");
    await asignar(gerente, "Farm Manager", sitio.id);

    const tipoQueFalla = await crearTipoDeBandeja(gerente, { organizationId: org.id, nombre: nombre("Falla"), ancho: 1, largo: 1, unidad: "ft" });
    tipoIds.push(tipoQueFalla.id);
    const tipoBueno = await crearTipoDeBandeja(gerente, { organizationId: org.id, nombre: nombre("Bueno"), ancho: 1, largo: 1, unidad: "ft" });
    tipoIds.push(tipoBueno.id);

    const original = capacidadModule.capacidadDeTipo;
    vi.spyOn(capacidadModule, "capacidadDeTipo").mockImplementation(async (userAccountId, trayTypeId) => {
      if (trayTypeId === tipoQueFalla.id) throw new Error("boom: fallo no relacionado con acceso");
      return original(userAccountId, trayTypeId);
    });

    const secciones = await vistaDeBandejas(gerente);
    const seccion = secciones.find((s) => s.org.id === org.id)!;
    expect(seccion).toBeDefined();
    const filaFalla = seccion.tipos.find((t) => t.id === tipoQueFalla.id)!;
    const filaBuena = seccion.tipos.find((t) => t.id === tipoBueno.id)!;
    expect(filaFalla).toMatchObject({ fallo: true, estados: [] });
    // Control: el tipo bueno de la MISMA organización no se ve arrastrado —
    // sigue rindiendo sus tres estados con normalidad.
    expect(filaBuena).toMatchObject({ fallo: false });
    expect(filaBuena.estados.length).toBe(3);
  });
});

describe("A5: sólo organizaciones con al menos un `site` o un `beneficio`", () => {
  it("una organización con beneficio y SIN ningún `site` SÍ aparece (ADR-198: el beneficio puede nacer sin finca)", async () => {
    const org = await prisma.organization.create({ data: { organizationType: "farm", name: nombre("org-a5"), status: "approved", classification: "internal" } });
    orgIds.push(org.id);
    // Un `beneficio` sin ningún `site` en la organización. Hasta el PR 2 de ADR-198 este test afirmaba
    // que NO aparecía, y habría seguido verde si sólo se relajaba el servicio: guardaba el defecto.
    const beneficio = await prisma.location.create({ data: { locationType: "beneficio", name: nombre("beneficio-a5"), organizationId: org.id, status: "approved", classification: "internal" } });
    locationIds.push(beneficio.id);
    const gerente = await cuenta("gerente-a5");
    await asignar(gerente, "Farm Manager", beneficio.id);

    // Control: quien mira SÍ puede editar el beneficio de esta organización (edit_beneficio lo da).
    expect(await puedeEditarBeneficioEnOrganizacion(gerente, org.id)).toBe(true);

    const secciones = await vistaDeBandejas(gerente);
    expect(secciones.find((s) => s.org.id === org.id)).toBeDefined();
  });

  it("una organización sin `site` NI `beneficio` sigue sin aparecer: A5 conserva su propósito", async () => {
    const org = await prisma.organization.create({ data: { organizationType: "roaster", name: nombre("org-a5-tostadora"), status: "approved", classification: "internal" } });
    orgIds.push(org.id);
    // Platform Admin ve todas las organizaciones, así que si el filtro no excluyera ésta, saldría.
    const admin = await cuenta("admin-a5-tostadora");
    const perfilAdmin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
    const ambitoPlataforma = await prisma.scope.findFirst({ where: { scopeType: "platform" } });
    const ambito = ambitoPlataforma ?? (await prisma.scope.create({ data: { scopeType: "platform" } }));
    if (!ambitoPlataforma) scopeIds.push(ambito.id); // sólo se borra el que esta corrida creó
    await prisma.assignment.create({ data: { userAccountId: admin, scopeId: ambito.id, roleProfileId: perfilAdmin.id } });
    const secciones = await vistaDeBandejas(admin);
    expect(secciones.find((s) => s.org.id === org.id)).toBeUndefined();
    // Control positivo del mismo lector: con un `site` además, esa misma organización aparece.
    const sitio = await prisma.location.create({ data: { locationType: "site", name: nombre("sitio-a5-tostadora"), organizationId: org.id, status: "approved", classification: "internal" } });
    locationIds.push(sitio.id);
    expect((await vistaDeBandejas(admin)).find((s) => s.org.id === org.id)).toBeDefined();
  });

  it("control positivo: la misma organización, con un site además del beneficio, sí aparece", async () => {
    const org = await prisma.organization.create({ data: { organizationType: "farm", name: nombre("org-a5-con-sitio"), status: "approved", classification: "internal" } });
    orgIds.push(org.id);
    const sitio = await prisma.location.create({ data: { locationType: "site", name: nombre("sitio-a5"), organizationId: org.id, status: "approved", classification: "internal" } });
    locationIds.push(sitio.id);
    const gerente = await cuenta("gerente-a5-control");
    await asignar(gerente, "Farm Manager", sitio.id);

    const secciones = await vistaDeBandejas(gerente);
    expect(secciones.find((s) => s.org.id === org.id)).toBeDefined();
  });
});
