/**
 * El destino de la cereza de una finca.
 *
 * Diseño: `docs/superpowers/specs/2026-09-30-destino-de-cereza-por-finca-design.md`. Decisión que
 * lo origina: **ADR-194** — «el cosechador no tiene que definir a quién le entrega; sólo entrega y
 * pesa». La finca lo declara **una vez** y la jornada lo **copia**.
 *
 * Grupo `base-sembrada`: necesita base, así que va en `scripts/pruebas-por-compuerta.txt`.
 *
 * **El usuario va acotado a SU sitio, nunca Platform Admin.** Con ámbito de plataforma la
 * visibilidad de lotes es `all` y los recuentos se vuelven aleatorios según lo que otras sesiones
 * tengan vivo en la base compartida — eso costó tres fallos intermitentes el 2026-09-17.
 *
 * **La base compartida del 55433 NO se resetea.** Esta prueba crea lo suyo con la etiqueta `RUN` y
 * lo borra envolviendo CADA paso en su propio `try`: un `afterAll` es una cadena, y el 2026-09-30
 * el primer borrado que lanzó abandonó los nueve siguientes y dejó 22 filas TEST con la suite en
 * verde.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { listarFincas } from "../../lib/traceability/fincas";
import { declararDestinoDeFinca } from "../../lib/traceability/destinoDeFinca";

const RUN = `dst-${Date.now()}`;
const nombre = (etiqueta: string) => `TEST ${etiqueta} (${RUN})`;

const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const asignaciones: string[] = [];
const organizaciones: string[] = [];
const ubicaciones: string[] = [];

let gestor: string;
let orgA: string;
let fincaA: string;
let beneficioA: string;
/** Beneficio de OTRA organización: el gestor no lo ve, así que no puede enviarle su cereza. */
let beneficioAjeno: string;
/** Segundo beneficio VISIBLE bajo el mismo sitio: hace falta para probar dos declaraciones a la vez. */
let beneficioA2: string;

async function cuenta(etiqueta: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(etiqueta) },
  });
  personas.push(person.id);
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  cuentas.push(account.id);
  return account.id;
}

async function asignar(userAccountId: string, perfil: string, locationId: string) {
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!existente) scopes.push(scope.id);
  const a = await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
  asignaciones.push(a.id);
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre("Finca A"), status: "approved", classification: "internal" },
  });
  organizaciones.push(org.id);
  orgA = org.id;

  const site = await prisma.location.create({
    data: {
      name: nombre("Sitio A"),
      locationType: "site",
      classification: "internal",
      status: "approved",
      organizationId: org.id,
    },
  });
  ubicaciones.push(site.id);
  fincaA = site.id;

  const ben = await prisma.location.create({
    data: {
      name: nombre("Beneficio A"),
      locationType: "beneficio",
      classification: "internal",
      status: "approved",
      organizationId: org.id,
      parentLocationId: site.id,
    },
  });
  ubicaciones.push(ben.id);
  beneficioA = ben.id;

  const ben2 = await prisma.location.create({
    data: { name: nombre("Beneficio A2"), locationType: "beneficio", classification: "internal", status: "approved", organizationId: org.id, parentLocationId: site.id },
  });
  ubicaciones.push(ben2.id);
  beneficioA2 = ben2.id;

  const orgOtra = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre("Finca B"), status: "approved", classification: "internal" },
  });
  organizaciones.push(orgOtra.id);
  const sitioOtro = await prisma.location.create({
    data: { name: nombre("Sitio B"), locationType: "site", classification: "internal", status: "approved", organizationId: orgOtra.id },
  });
  ubicaciones.push(sitioOtro.id);
  const benOtro = await prisma.location.create({
    data: {
      name: nombre("Beneficio B"),
      locationType: "beneficio",
      classification: "internal",
      status: "approved",
      organizationId: orgOtra.id,
      parentLocationId: sitioOtro.id,
    },
  });
  ubicaciones.push(benOtro.id);
  beneficioAjeno = benOtro.id;

  gestor = await cuenta("gestor");
  // Farm Manager de SU sitio. Nunca Platform Admin: ver la cabecera.
  await asignar(gestor, "Farm Manager", site.id);
});

afterAll(async () => {
  const pasos: [string, () => Promise<unknown>][] = [
    // PRIMERO soltar el destino: la FK es RESTRICT, así que un beneficio al que una finca envía
    // no se puede borrar. Sin este paso el borrado de `location` lanza y arrastra a los de abajo.
    ["destino", () => prisma.location.updateMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }), data: { beneficioDestinoId: null } })],
    ["auditEvent", () => prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: ubicaciones } }) })],
    ["assignment", () => prisma.assignment.deleteMany({ where: assertDefinedWhere({ id: { in: asignaciones } }) })],
    ["scope", () => prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) })],
    ["location", () => prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }) })],
    ["organization", () => prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) })],
    ["userAccount", () => prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) })],
    ["person", () => prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) })],
  ];
  const fallos: string[] = [];
  for (const [n, fn] of pasos) {
    try {
      await fn();
    } catch (e) {
      fallos.push(`${n}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  // `process.stdout.write` y no `console.log`: vitest intercepta la consola y sólo la saca para
  // las pruebas que FALLAN, así que un aviso de fuga en una corrida verde no se vería nunca.
  if (fallos.length > 0) process.stdout.write(`\n[FUGA] la limpieza de ${RUN} dejó filas: ${fallos.join(" | ")}\n`);
});

describe("el destino de una finca", () => {
  /**
   * `null` **no es un hueco**: una finca cuya cereza se compra y se traslada —Jaramillo,
   * Artillería— no lleva destino, y entra por el camino del proveedor. Un `NOT NULL` obligaría a
   * inventarle uno.
   */
  it("una finca sin destino declarado lo dice con null, no con un hueco", async () => {
    const finca = (await listarFincas(gestor)).find((f) => f.siteId === fincaA);
    expect(finca).toBeDefined();
    expect(finca!.beneficioDestino).toBeNull();
  });

  it("con el destino puesto, lo devuelve con su nombre", async () => {
    await prisma.location.update({ where: { id: fincaA }, data: { beneficioDestinoId: beneficioA } });
    const finca = (await listarFincas(gestor)).find((f) => f.siteId === fincaA);
    expect(finca!.beneficioDestino).toEqual({ id: beneficioA, name: nombre("Beneficio A") });
    // Se deja como estaba para no acoplar esta prueba con las que vengan después.
    await prisma.location.update({ where: { id: fincaA }, data: { beneficioDestinoId: null } });
  });
});

describe("declararDestinoDeFinca", () => {
  /**
   * **Los DOS permisos, que es lo que un atajo se salta.** Diseño §4.1: gestionar la finca no basta
   * para mandarle cereza a un beneficio cualquiera, porque el destino es una relación entre dos
   * organizaciones que pueden no ser la misma —«no son la misma organizacion», Daniel, 2026-09-30—.
   * Así que hace falta `lot:manage` sobre la finca **y** `lot:view` sobre el beneficio.
   */
  it("declararlo exige gestionar la finca Y poder ver el beneficio", async () => {
    await declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: beneficioA });
    const finca = (await listarFincas(gestor)).find((f) => f.siteId === fincaA);
    expect(finca!.beneficioDestino!.id).toBe(beneficioA);

    await expect(
      declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: beneficioAjeno }),
    ).rejects.toThrow(/beneficio_no_valido/);
    // Y el rechazo no deja el destino a medias: sigue siendo el que era.
    const despues = (await listarFincas(gestor)).find((f) => f.siteId === fincaA);
    expect(despues!.beneficioDestino!.id).toBe(beneficioA);
  });

  /**
   * Sólo un `beneficio`. El diseño §5 señala el duplicado vivo —un `site` llamado «Beneficio Las
   * Nubes» junto al `beneficio` «Las Nubes»— y es exactamente el error que un nombre parecido
   * invita a cometer. Aquí se usa el propio sitio de la finca, que el gestor **sí** ve: así el
   * rechazo sólo lo puede explicar el tipo, no el permiso.
   */
  it("no acepta un site como destino, aunque quien declara lo vea", async () => {
    await expect(
      declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: fincaA }),
    ).rejects.toThrow(/beneficio_no_valido/);
  });

  /** Quitarlo NO es un error: una finca puede dejar de enviar, y `null` es un estado legítimo. */
  it("null lo desenlaza, y eso no es un error", async () => {
    await declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: beneficioA });
    await declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: null });
    const finca = (await listarFincas(gestor)).find((f) => f.siteId === fincaA);
    expect(finca!.beneficioDestino).toBeNull();
  });

  /**
   * **El evento lleva el ANTES y el DESPUÉS, no sólo que existe.** `expect(evento).not.toBeNull()`
   * pasa igual quitando el `tx`, y eso ya dejó cuatro guardias falsos el 2026-09-01. Que la
   * escritura vaya en la misma transacción lo vigila `tests/arquitectura/audit-atomico.test.ts`
   * leyendo la fuente; lo que esta prueba añade es que el contenido sirva para reconstruir el
   * cambio: sin el `before`, el registro no dice de dónde venía.
   */
  it("audita el cambio con el antes y el después", async () => {
    await declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: null });
    await declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: beneficioA });
    const eventos = await prisma.auditEvent.findMany({
      where: { entityId: fincaA, operation: "location.set_beneficio_destino" },
      orderBy: { occurredAt: "asc" },
    });
    const ultimo = eventos[eventos.length - 1];
    expect(ultimo).toBeDefined();
    expect(ultimo!.before).toEqual({ beneficioDestinoId: null });
    expect(ultimo!.after).toEqual({ beneficioDestinoId: beneficioA });
    expect(ultimo!.actorUserAccountId).toBe(gestor);
  });
});

describe("dos declaraciones a la vez", () => {
  /**
   * **El `before` de cada evento tiene que ser el estado que esa declaración sustituyó.** Sin el
   * `FOR UPDATE` que abre la transacción, bajo `READ COMMITTED` las dos leen el MISMO `antes`: la
   * escritura y su evento siguen siendo atómicos, y aun así el historial describe mal la
   * transición — una de las dos declara venir de un estado que ya no era el suyo. Lo señaló la
   * revisión independiente de Codex el 2026-09-30.
   *
   * **ESTA PRUEBA NO ES UN GUARDIA DETERMINISTA, Y ASÍ HAY QUE CONTARLA.** Medido el 2026-09-30
   * quitando el `FOR UPDATE`: corriendo el archivo entero cae **2 de 3 veces**, y corriendo sólo
   * esta prueba (`-t`), **3 de 3**. Sin mutar pasa **5 de 5**, así que no es intermitente en rojo
   * y no va a parar CI sobre un árbol sano. Pero la primera vuelta del flip cayó justo en el
   * verde y estuve a punto de firmar un adorno: quien la use como prueba de que la carrera está
   * cerrada tiene que correrla aislada, o repetirla. Lo que de verdad sostiene la corrección es
   * el bloqueo, que sigue el precedente de `cambiarDestinoDeJornada`; esto es la red para el día
   * que alguien lo quite, no la demostración de que no se puede quitar.
   *
   * **La aserción no depende del orden a propósito.** `occurredAt` sale de `now()`, que en Postgres
   * es la hora de INICIO de la transacción, y la segunda puede haber empezado antes de que la
   * primera confirmara: ordenar por ella mentiría. Lo que sí es invariante es que los dos `before`
   * sean DISTINTOS — con el bloqueo, la segunda ve lo que escribió la primera; sin él, las dos ven
   * el original y salen iguales.
   */
  it("cada evento audita el estado que de verdad sustituyó", async () => {
    await declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: null });
    await prisma.auditEvent.deleteMany({ where: { entityId: fincaA, operation: "location.set_beneficio_destino" } });

    await Promise.all([
      declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: beneficioA }),
      declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: beneficioA2 }),
    ]);

    const eventos = await prisma.auditEvent.findMany({
      where: { entityId: fincaA, operation: "location.set_beneficio_destino" },
    });
    expect(eventos).toHaveLength(2); // control: se midieron los dos, no uno
    const antes = eventos.map((e) => (e.before as { beneficioDestinoId: string | null }).beneficioDestinoId);
    expect(new Set(antes).size).toBe(2);

    await declararDestinoDeFinca(gestor, { fincaSiteId: fincaA, beneficioId: null });
  });
});
