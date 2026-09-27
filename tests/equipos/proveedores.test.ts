/**
 * ADR-188 · El alta de proveedores de equipos, calcada de la de proveedores de cereza.
 *
 * **Por qué existe.** `comprobarProveedor` (lib/equipos/equipos.ts) exige que el proveedor de un
 * equipo sea una `Organization` de tipo `supplier` y en estado `approved`, y hasta hoy **no había
 * ninguna forma de crear una desde la aplicación**: los tres que existían venían del seed.
 *
 * **Aquí sí se usa `admin`, y es la excepción a la norma del fixture.** Esa norma existe porque un
 * Platform Admin ve la base compartida entera y una prueba de «propio» hecha con él pasaría aunque
 * la regla estuviera rota. Pero este permiso **es** de plataforma por decisión de Daniel
 * (2026-09-27): dar de alta un proveedor tiene efecto global, así que `can()` lo juzga contra el
 * ámbito de plataforma y ninguna asignación de sitio lo satisface. El discriminador correcto pasa a
 * ser el ámbito, no el perfil: `admin` (plataforma) puede; `jefeA` (Farm Manager en un sitio, con
 * `equipment:manage`) NO puede, y eso es lo que fija la separación que el ADR pide.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  crearProveedorDeEquipos,
  puedeCrearProveedorDeEquipos,
  ProveedorDeEquiposError,
} from "../../lib/equipos/proveedores";
import { proveedoresPosibles, puedeConfigurarEn } from "../../lib/equipos/equipos";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let admin: string, jefeA: string, operarioA: string, RUN: string;

beforeAll(async () => {
  f = await montarFixtures("prov");
  ({ admin, jefeA, operarioA } = f);
  RUN = f.run;
});
afterAll(async () => {
  // `mode: "insensitive"`: dos pruebas crean el nombre con `.toUpperCase()`, que también sube el
  // `prov-` del RUN a `PROV-`. Sin esto la limpieza no las veía y quedaban filas en la base
  // (hallazgo 5 de Codex, confirmado: había `RODAMIENTOS PROV-…` vivos de corridas anteriores).
  await prisma.organization.deleteMany({
    where: { organizationType: "supplier", name: { contains: RUN, mode: "insensitive" } },
  });
  await f.limpiar();
});

describe("crearProveedorDeEquipos", () => {
  it("queda supplier, aprobado, sin ubicación y con su AuditEvent", async () => {
    const nombre = `Ferretería ${RUN}`;
    const p = await crearProveedorDeEquipos(admin, { nombre });

    const fila = await prisma.organization.findUniqueOrThrow({ where: { id: p.id } });
    expect(fila.organizationType).toBe("supplier");
    expect(fila.status).toBe("approved");
    // Sin `Location`: un proveedor no es un sitio de la operación, es un tercero del directorio.
    expect(await prisma.location.count({ where: { organizationId: p.id } })).toBe(0);

    const ev = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "organization", entityId: p.id, operation: "organization.create_equipment_supplier" },
    });
    expect(ev.actorUserAccountId).toBe(admin);
  }, 30000);

  it("el operario no da de alta proveedores, y quien manda en plataforma sí — el control positivo", async () => {
    const nombre = `Taller ${RUN}`;
    await expect(crearProveedorDeEquipos(operarioA, { nombre })).rejects.toThrow(
      new ProveedorDeEquiposError("sin_permiso"),
    );
    // Sin esta mitad, el rechazo podría ser de una operación rota y no del permiso.
    const p = await crearProveedorDeEquipos(admin, { nombre });
    expect(p.id).toBeTruthy();
  }, 30000);

  it("un Farm Manager de un sitio NO da de alta, aunque tenga equipment:manage — el ámbito manda", async () => {
    // Éste es el discriminador que pedía el hallazgo 3 de Codex, y el que fija la decisión de Daniel
    // del 2026-09-27: el permiso se juzga contra el ámbito de PLATAFORMA, así que una asignación de
    // sitio no lo satisface por mucho que el perfil sea el jefe. Si alguien devolviera la
    // comprobación a «en cualquier ámbito», esta prueba cae y la de arriba no — que es justo el par
    // que faltaba, porque `jefeA` y `operarioA` solos no distinguían una clave de la otra.
    await expect(crearProveedorDeEquipos(jefeA, { nombre: `Vetado ${RUN}` })).rejects.toThrow(
      new ProveedorDeEquiposError("sin_permiso"),
    );
    // Las dos mitades del control: el jefe SÍ tiene equipment:manage —no es que no tenga nada— y
    // quien manda en plataforma SÍ da de alta ese mismo nombre, así que el rechazo es del ámbito.
    expect(await puedeConfigurarEn(jefeA, f.sitioA)).toBe(true);
    expect(await puedeCrearProveedorDeEquipos(jefeA)).toBe(false);
    expect(await puedeCrearProveedorDeEquipos(admin)).toBe(true);
    const p = await crearProveedorDeEquipos(admin, { nombre: `Vetado ${RUN}` });
    expect(p.id).toBeTruthy();
  }, 30000);

  it("el mismo nombre no entra dos veces, sin distinguir mayúsculas ni espacios de sobra", async () => {
    const nombre = `Insumos ${RUN}`;
    await crearProveedorDeEquipos(admin, { nombre });
    // Sale como error legible del dominio, no como un error crudo de Prisma.
    await expect(crearProveedorDeEquipos(admin, { nombre: `  ${nombre.toUpperCase()}  ` })).rejects.toThrow(
      new ProveedorDeEquiposError("proveedor_repetido"),
    );
    // Acotado a ESTE nombre: `contains: RUN` contaría también los que crean las otras pruebas
    // del archivo, y la cifra diría otra cosa de la que se quiere comprobar.
    expect(
      await prisma.organization.count({
        where: { organizationType: "supplier", name: { contains: `Insumos ${RUN}`, mode: "insensitive" } },
      }),
    ).toBe(1);
  }, 30000);

  it("dos altas a la vez del mismo nombre: una entra, la otra es proveedor_repetido", async () => {
    // El caso que SÓLO el índice único puede pasar: las dos transacciones leen antes de que
    // ninguna escriba, así que la comprobación de dentro no ve nada y las deja pasar a las dos.
    // Nombre ASCII a propósito —lo que se prueba es la carrera—: con la colación C las mayúsculas
    // acentuadas no se pliegan (mismo motivo que en el índice de productores).
    const nombre = `Rodamientos ${RUN}`;
    const res = await Promise.allSettled([
      crearProveedorDeEquipos(admin, { nombre }),
      crearProveedorDeEquipos(admin, { nombre: nombre.toUpperCase() }),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(
      /proveedor_repetido/,
    );
    // `mode: "insensitive"` no es adorno: gana la carrera cualquiera de las dos, y si gana la de
    // mayúsculas un `contains` normal cuenta CERO y la prueba falla por el instrumento, no por el
    // código. Pasó tres vueltas seguidas en verde antes de caer — verde no era prueba de nada.
    expect(
      await prisma.organization.count({
        where: { organizationType: "supplier", name: { contains: `Rodamientos ${RUN}`, mode: "insensitive" } },
      }),
    ).toBe(1);
  }, 30000);

  it("el nombre acentuado sigue a la colación del clúster, y en producción choca", async () => {
    // **Esta prueba MIDE antes de afirmar, y la primera versión no lo hacía.** La escribí diciendo
    // «con la colación C los acentos no se pliegan, así que entran dos», que era cierto en el
    // clúster local y FALSO en CI — cayó allí, con `proveedor_repetido`. El plegado no es del
    // código: es del clúster.
    //
    // Medido el 2026-09-27 contra producción (consulta de sólo lectura, autorizada):
    // `datcollate` es **`C.UTF-8`**, `lower('FERRETERÍA')` da `ferretería` y los dos nombres
    // CHOCAN. En CI (postgis:18-3.6) igual. El clúster local de `scripts/test-db.sh` puede no
    // coincidir: lo crea con `initdb --encoding=UTF8` y SIN `--locale`, así que hereda el del
    // entorno — en este Mac, `C` a secas, que no pliega. Por eso la prueba pregunta primero.
    const [medida] = await prisma.$queryRawUnsafe<{ pliega: boolean }[]>(
      "SELECT lower(btrim('  FERRETERÍA EL PUENTE  ')) = lower(btrim('Ferretería El Puente')) AS pliega",
    );
    const pliega = medida!.pliega;

    const nombre = `Ferretería ${RUN} Ñandú`;
    const uno = await crearProveedorDeEquipos(admin, { nombre });
    if (pliega) {
      // Producción y CI: el acentuado es el MISMO proveedor y se rechaza.
      await expect(crearProveedorDeEquipos(admin, { nombre: nombre.toUpperCase() })).rejects.toThrow(
        new ProveedorDeEquiposError("proveedor_repetido"),
      );
    } else {
      // Un clúster que no pliega —como el local mal configurado— deja entrar los dos. No es lo que
      // se quiere, pero es lo que ese clúster hace, y la prueba no debe mentir sobre ninguno.
      const dos = await crearProveedorDeEquipos(admin, { nombre: nombre.toUpperCase() });
      expect(dos.id).not.toBe(uno.id);
    }

    // Control positivo, y vale en los dos mundos: sin acentos el rechazo es seguro. Si esta mitad
    // cayera, el resultado de arriba no diría nada sobre acentos — diría que el guardia está roto.
    const ascii = `Ferreteria ${RUN} Nandu`;
    await crearProveedorDeEquipos(admin, { nombre: ascii });
    await expect(crearProveedorDeEquipos(admin, { nombre: ascii.toUpperCase() })).rejects.toThrow(
      new ProveedorDeEquiposError("proveedor_repetido"),
    );
  }, 30000);

  it("el proveedor nuevo aparece en el desplegable del equipo", async () => {
    const nombre = `Bombas ${RUN}`;
    // Control: antes de crearlo NO está, o la aserción de abajo no diría nada.
    expect((await proveedoresPosibles(admin)).map((x) => x.name)).not.toContain(nombre);
    const p = await crearProveedorDeEquipos(admin, { nombre });
    const ofrecidos = await proveedoresPosibles(admin);
    expect(ofrecidos.map((x) => x.id)).toContain(p.id);
  }, 30000);
});
