/**
 * ADR-188 · El alta de proveedores de equipos, calcada de la de proveedores de cereza.
 *
 * **Por qué existe.** `comprobarProveedor` (lib/equipos/equipos.ts) exige que el proveedor de un
 * equipo sea una `Organization` de tipo `supplier` y en estado `approved`, y hasta hoy **no había
 * ninguna forma de crear una desde la aplicación**: los tres que existían venían del seed.
 *
 * Las pruebas de permiso usan `jefeA` (Farm Manager, tiene `equipment:manage`) contra `operarioA`
 * (Farm Operator, no lo tiene), nunca `admin`: con un admin de plataforma pasarían aunque la regla
 * estuviera rota.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearProveedorDeEquipos, ProveedorDeEquiposError } from "../../lib/equipos/proveedores";
import { proveedoresPosibles } from "../../lib/equipos/equipos";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let jefeA: string, operarioA: string, RUN: string;

beforeAll(async () => {
  f = await montarFixtures("prov");
  ({ jefeA, operarioA } = f);
  RUN = f.run;
});
afterAll(async () => {
  await prisma.organization.deleteMany({ where: { organizationType: "supplier", name: { contains: RUN } } });
  await f.limpiar();
});

describe("crearProveedorDeEquipos", () => {
  it("el jefe lo da de alta: supplier, aprobado, sin ubicación y con su AuditEvent", async () => {
    const nombre = `Ferretería ${RUN}`;
    const p = await crearProveedorDeEquipos(jefeA, { nombre });

    const fila = await prisma.organization.findUniqueOrThrow({ where: { id: p.id } });
    expect(fila.organizationType).toBe("supplier");
    expect(fila.status).toBe("approved");
    // Sin `Location`: un proveedor no es un sitio de la operación, es un tercero del directorio.
    expect(await prisma.location.count({ where: { organizationId: p.id } })).toBe(0);

    const ev = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "organization", entityId: p.id, operation: "organization.create_equipment_supplier" },
    });
    expect(ev.actorUserAccountId).toBe(jefeA);
  }, 30000);

  it("el operario no da de alta proveedores, y el jefe sí — el control positivo", async () => {
    const nombre = `Taller ${RUN}`;
    await expect(crearProveedorDeEquipos(operarioA, { nombre })).rejects.toThrow(
      new ProveedorDeEquiposError("sin_permiso"),
    );
    // Sin esta mitad, el rechazo podría ser de una operación rota y no del permiso.
    const p = await crearProveedorDeEquipos(jefeA, { nombre });
    expect(p.id).toBeTruthy();
  }, 30000);

  it("el mismo nombre no entra dos veces, sin distinguir mayúsculas ni espacios de sobra", async () => {
    const nombre = `Insumos ${RUN}`;
    await crearProveedorDeEquipos(jefeA, { nombre });
    // Sale como error legible del dominio, no como un error crudo de Prisma.
    await expect(crearProveedorDeEquipos(jefeA, { nombre: `  ${nombre.toUpperCase()}  ` })).rejects.toThrow(
      new ProveedorDeEquiposError("proveedor_repetido"),
    );
    // Acotado a ESTE nombre: `contains: RUN` contaría también los que crean las otras pruebas
    // del archivo, y la cifra diría otra cosa de la que se quiere comprobar.
    expect(await prisma.organization.count({ where: { organizationType: "supplier", name: { contains: `Insumos ${RUN}` } } })).toBe(1);
  }, 30000);

  it("el proveedor nuevo aparece en el desplegable del equipo", async () => {
    const nombre = `Bombas ${RUN}`;
    // Control: antes de crearlo NO está, o la aserción de abajo no diría nada.
    expect((await proveedoresPosibles(jefeA)).map((x) => x.name)).not.toContain(nombre);
    const p = await crearProveedorDeEquipos(jefeA, { nombre });
    const ofrecidos = await proveedoresPosibles(jefeA);
    expect(ofrecidos.map((x) => x.id)).toContain(p.id);
  }, 30000);
});
