/**
 * La floración de una parcela — decisión de Daniel, 2026-10-01: «parcela, microparcela o bloque».
 *
 * Existe para poder decir que una aplicación cae en floración. Esta operación tiene apiarios y
 * meliponarios propios, así que eso no es un riesgo ambiental genérico: toca su propia miel. El
 * aviso NO cita ninguna recomendación agronómica —ver el docstring de `lib/traceability/floracion.ts`,
 * y la razón: las que hay están marcadas como referencia externa sin verificar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import {
  cerrarFloracion,
  enFloracion,
  floracionesDeLaParcela,
  floracionesDeLaPortada,
  registrarFloracion,
  FloracionValidationError,
} from "../../lib/traceability/floracion";
import { hayFloracion } from "../../lib/traceability/floracionVigente";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `flor-${Date.now()}`;
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

let organizationId: string;
let finca: string;
let parcela: string;
let otraParcela: string;
let microparcela: string;
let microHermana: string;
let bloque: string;
let bloqueAjeno: string;
let gestorId: string;
let sinPermisoId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  finca = (await prisma.location.create({ data: { name: `TEST Finca (${RUN_ID})`, locationType: "site", classification: "internal", organizationId } })).id;
  parcela = (await prisma.location.create({ data: { name: `TEST Parcela (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
  otraParcela = (await prisma.location.create({ data: { name: `TEST Parcela B (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
  // Dos microparcelas HERMANAS bajo la misma parcela: la contención tiene que alcanzar a madre e
  // hija y NO al hermano, que es la regla escrita en la cabecera de `ubicacionesEmparentadas`.
  microparcela = (await prisma.location.create({ data: { name: `TEST Micro (${RUN_ID})`, locationType: "micro_plot", classification: "internal", parentLocationId: parcela } })).id;
  microHermana = (await prisma.location.create({ data: { name: `TEST Micro B (${RUN_ID})`, locationType: "micro_plot", classification: "internal", parentLocationId: parcela } })).id;
  bloque = (await prisma.plotBlock.create({ data: { locationId: parcela, name: `TEST Bloque (${RUN_ID})` } })).id;
  bloqueAjeno = (await prisma.plotBlock.create({ data: { locationId: otraParcela, name: `TEST Bloque B (${RUN_ID})` } })).id;

  const cuenta = async (n: string, perfil: string, sitio: string) => {
    const ua = await prisma.userAccount.create({
      data: {
        person: { create: { givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN_ID})`, locale: "es" } },
        authProvider: "credentials", status: "active",
      },
    });
    const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    const scope =
      (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: sitio } })) ??
      (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitio } }));
    await prisma.assignment.create({ data: { userAccountId: ua.id, roleProfileId: p.id, scopeId: scope.id } });
    return ua.id;
  };
  gestorId = await cuenta("Gestor", "Farm Manager", finca);
  // Un sitio que NO es esta finca: su permiso no alcanza aquí.
  const otraOrg = await createTestOrganization(`${RUN_ID}-b`);
  const otroSitio = (await prisma.location.create({ data: { name: `TEST Ajeno (${RUN_ID})`, locationType: "site", classification: "internal", organizationId: otraOrg } })).id;
  sinPermisoId = await cuenta("Ajeno", "Farm Manager", otroSitio);
}, 30000);

afterAll(async () => {
  // Con reintentos y sin lanzar: la base es compartida y una limpieza que revienta deja basura.
  try {
    await prisma.plotBloom.deleteMany({ where: { location: { name: { contains: RUN_ID } } } });
    await prisma.plotBlock.deleteMany({ where: { name: { contains: RUN_ID } } });

    // **Y lo que `deleteTestOrganizations` NO se lleva, que era casi todo.** Medido el 2026-10-06:
    // esta suite había dejado **38 ubicaciones huérfanas** del 1 de octubre en la base compartida,
    // seis de ellas con `location_type = 'micro_plot'` —el valor que el esquema declara muerto—, más
    // 8 personas y 8 cuentas. Y no falló nunca en rojo:
    // **`location_organization_id_fkey` es `ON DELETE SET NULL`** (el SQL de
    // `20260810002142_foundational_entities:153`, y `confdeltype='n'` en la base viva), así que
    // borrar la organización **pone a NULL** el `organization_id` de sus ubicaciones en vez de
    // negarse. La organización desaparece y sus ubicaciones se quedan, huérfanas e invisibles a
    // cualquier limpieza que vaya por la organización. Es la clase que `CLAUDE.md` ya tiene escrita:
    // «un recuento de filas no puede ver un UPDATE, y SET NULL borra sin fallar».
    //
    // **Se DESCUBRE lo que hay que borrar, no se hereda de las variables del `beforeAll`**: así una
    // corrida que murió a mitad —antes de asignar `microparcela`, por ejemplo— se limpia igual. Es
    // la lección de `PENDING_IMPLEMENTATIONS/022`.
    const mias = await prisma.location.findMany({ where: { name: { contains: RUN_ID } }, select: { id: true } });
    const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
    const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: personas.map((x) => x.id) } }, select: { id: true } });

    // El orden lo manda el `RESTRICT`: `assignment` → `scope` → `location` → `userAccount` →
    // `person`. **36 tablas referencian `core.location` con RESTRICT**, así que si esta suite
    // ganara algún día una fila en cualquiera de ellas, el borrado de abajo fallaría a gritos — que
    // es lo correcto, y mejor que el silencio del `SET NULL`.
    if (cuentas.length) await prisma.assignment.deleteMany({ where: { userAccountId: { in: cuentas.map((x) => x.id) } } });
    if (mias.length) {
      // **Sólo los ámbitos de SUS ubicaciones.** `cuenta()` los reutiliza con `findFirst ?? create`,
      // pero el sitio es nuevo en cada corrida, así que nadie más puede estar colgado de ellos.
      // Borrar un ámbito compartido es justo lo que puso rojo el carril en la ficha 022.
      await prisma.scope.deleteMany({ where: { scopeType: "location", scopeRefId: { in: mias.map((x) => x.id) } } });
      await prisma.location.deleteMany({ where: { id: { in: mias.map((x) => x.id) } } });
    }
    if (cuentas.length) await prisma.userAccount.deleteMany({ where: { id: { in: cuentas.map((x) => x.id) } } });
    if (personas.length) await prisma.person.deleteMany({ where: { id: { in: personas.map((x) => x.id) } } });

    // Toma UN runId, no una lista: las dos organizaciones comparten el prefijo, así que
    // `RUN_ID` las barre a las dos —la `-b` lo lleva dentro—.
    await deleteTestOrganizations(RUN_ID);
  } catch {
    // Una carrera perdida al borrar no debe tumbar la suite.
  }
}, 30000);

describe("registrar una floración", () => {
  it("la anota en la parcela, y con el bloque cuando se da", async () => {
    const entera = await registrarFloracion(gestorId, { locationId: parcela, startsAt: dia("2026-03-01"), endsAt: dia("2026-03-20") });
    expect(entera.plotBlockId).toBeNull();
    const deBloque = await registrarFloracion(gestorId, { locationId: parcela, plotBlockId: bloque, startsAt: dia("2026-04-01") });
    expect(deBloque.plotBlockId).toBe(bloque);
  }, 20000);

  it("un bloque de OTRA parcela no se acepta", async () => {
    await expect(
      registrarFloracion(gestorId, { locationId: parcela, plotBlockId: bloqueAjeno, startsAt: dia("2026-05-01") }),
    ).rejects.toBeInstanceOf(FloracionValidationError);
  }, 20000);

  it("una ventana al revés se rechaza con una frase, no con un error de Postgres", async () => {
    await expect(
      registrarFloracion(gestorId, { locationId: parcela, startsAt: dia("2026-06-10"), endsAt: dia("2026-06-01") }),
    ).rejects.toBeInstanceOf(FloracionValidationError);
  }, 20000);

  it("sólo se anota en una parcela o microparcela, no en la finca", async () => {
    await expect(
      registrarFloracion(gestorId, { locationId: finca, startsAt: dia("2026-03-01") }),
    ).rejects.toBeInstanceOf(FloracionValidationError);
  }, 20000);

  it("quien no gestiona la finca no la anota — y el control de que el gestor SÍ puede", async () => {
    await expect(
      registrarFloracion(sinPermisoId, { locationId: parcela, startsAt: dia("2026-03-01") }),
    ).rejects.toBeInstanceOf(TraceabilityAccessError);
    // Sin esta mitad, un fallo que rechazara a TODO el mundo pasaría por un permiso que funciona.
    await expect(registrarFloracion(gestorId, { locationId: parcela, startsAt: dia("2026-07-01") })).resolves.toBeTruthy();
  }, 20000);
});

describe("¿estaba en floración ese día?", () => {
  it("dentro de una ventana cerrada, sí; fuera, no", async () => {
    const p = (await prisma.location.create({ data: { name: `TEST P cerrada (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
    await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2026-03-01"), endsAt: dia("2026-03-20") });
    expect(await enFloracion(p, dia("2026-03-10"))).toHaveLength(1);
    expect(await enFloracion(p, dia("2026-03-01"))).toHaveLength(1); // el borde cuenta
    expect(await enFloracion(p, dia("2026-03-20"))).toHaveLength(1); // el otro borde también
    expect(await enFloracion(p, dia("2026-02-28"))).toHaveLength(0);
    expect(await enFloracion(p, dia("2026-03-21"))).toHaveLength(0);
  }, 20000);

  it("una ventana SIN CIERRE cuenta como abierta — que es el estado de campo mientras dura", async () => {
    const p = (await prisma.location.create({ data: { name: `TEST P abierta (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
    await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2026-03-01") });
    // Tratar `endsAt` nulo como «ya terminó» haría que el aviso callara justo durante la floración.
    expect(await enFloracion(p, dia("2026-03-10"))).toHaveLength(1);
    expect(await enFloracion(p, dia("2027-01-01"))).toHaveLength(1);
    expect(await enFloracion(p, dia("2026-02-28"))).toHaveLength(0); // antes de empezar, no
  }, 20000);

  it("la floración de una parcela no se le atribuye a otra", async () => {
    const a = (await prisma.location.create({ data: { name: `TEST P aislada A (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
    const b = (await prisma.location.create({ data: { name: `TEST P aislada B (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
    await registrarFloracion(gestorId, { locationId: a, startsAt: dia("2026-03-01"), endsAt: dia("2026-03-20") });
    expect(await enFloracion(a, dia("2026-03-10"))).toHaveLength(1);
    expect(await enFloracion(b, dia("2026-03-10"))).toHaveLength(0);
  }, 20000);
});

/**
 * **La contención del árbol de ubicaciones, que faltaba y la encontró una revisión.**
 *
 * `floracionesDeLaParcela` leía UNA ubicación, así que una floración anotada en la parcela madre no
 * llegaba a una intervención sobre su microparcela, ni al revés — y eso es físicamente falso: una
 * microparcela de una parcela en floración está en floración. Se reusa `ubicacionesEmparentadas`,
 * que existe para esta misma forma en la carencia fitosanitaria (§3.3), con su regla: madre e hija
 * sí, hermano no.
 *
 * **Las fechas de aquí no se repiten en el resto del archivo, y eso no es estilo.** La lectura manda
 * al navegador sólo `startsAt`/`endsAt`/`plotBlockId` —sin `locationId`, a propósito— así que la
 * única forma de identificar una ventana en la aserción es su fecha. La primera versión de estas
 * pruebas usó `2026-07-01` para el hermano, que la línea 107 ya usa en la PARCELA: la aserción dio
 * fallo sobre código correcto, porque identificaba por una fecha compartida. Un control que no
 * distingue no es un control.
 */
describe("la floración alcanza por contención, no por igualdad de ubicación", () => {
  it("una floración de la parcela MADRE llega a su microparcela", async () => {
    await registrarFloracion(gestorId, { locationId: parcela, startsAt: dia("2026-09-01"), endsAt: dia("2026-09-10") });
    const vs = await floracionesDeLaParcela(microparcela);
    expect(vs.map((v) => v.startsAt.toISOString())).toContain(dia("2026-09-01").toISOString());
  });

  it("y una floración de la microparcela llega a la parcela madre", async () => {
    await registrarFloracion(gestorId, { locationId: microparcela, startsAt: dia("2026-10-01"), endsAt: dia("2026-10-10") });
    const vs = await floracionesDeLaParcela(parcela);
    expect(vs.map((v) => v.startsAt.toISOString())).toContain(dia("2026-10-01").toISOString());
  });

  it("pero la de una microparcela HERMANA no llega — y el control de que la propia sí", async () => {
    await registrarFloracion(gestorId, { locationId: microHermana, startsAt: dia("2026-11-01"), endsAt: dia("2026-11-10") });
    const vs = await floracionesDeLaParcela(microparcela);
    const inicios = vs.map((v) => v.startsAt.toISOString());
    expect(inicios, "la del hermano NO debe alcanzar").not.toContain(dia("2026-11-01").toISOString());
    // Control positivo: la lectura sí trae las que debe, así que ese «no contiene» mide algo. Y la
    // fecha del control es la de la MADRE, que ninguna otra prueba usa.
    expect(inicios, "la de su propia madre SÍ debe alcanzar").toContain(dia("2026-09-01").toISOString());
  });

  it("y sólo manda las tres columnas que el aviso necesita, no la fila entera", async () => {
    const vs = await floracionesDeLaParcela(parcela);
    expect(vs.length, "sin ventanas no mide nada").toBeGreaterThan(0);
    expect(Object.keys(vs[0]!).sort()).toEqual(["endsAt", "plotBlockId", "startsAt"]);
  });
});

/**
 * **F1 — la floración se cierra después, cuando las flores caen** (decisión de Daniel, 2026-10-08:
 * «dos momentos»). En el campo se ve cuándo empieza a florecer; el final se sabe días después.
 *
 * Cada prueba crea SU parcela, así que ninguna aserción depende de una fecha compartida con las de
 * arriba. Las fechas de este bloque son de 2027 y tampoco se repiten entre sí.
 */
const parcelaPropia = async (etiqueta: string, padre: string = finca) =>
  (await prisma.location.create({
    data: { name: `TEST ${etiqueta} (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: padre },
  })).id;

describe("cerrar una floración", () => {
  it("guarda el fin y deja la auditoría con el antes y el después", async () => {
    const p = await parcelaPropia("P cierre");
    const abierta = await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2027-02-01") });

    const cerrada = await cerrarFloracion(gestorId, { plotBloomId: abierta.id, endsAt: dia("2027-02-15") });
    expect(cerrada.endsAt?.toISOString()).toBe(dia("2027-02-15").toISOString());

    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "plot_bloom", entityId: abierta.id, operation: "plot_bloom.close" },
    });
    expect(evento, "el cierre no dejó auditoría").not.toBeNull();
    expect((evento!.before as { endsAt: unknown }).endsAt).toBeNull();
    expect((evento!.after as { endsAt: string }).endsAt).toBe(dia("2027-02-15").toISOString());
  }, 20000);

  it("una floración ya cerrada no se vuelve a cerrar — y el fin que tenía se conserva", async () => {
    const p = await parcelaPropia("P doble cierre");
    const f = await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2027-03-01"), endsAt: dia("2027-03-05") });
    await expect(cerrarFloracion(gestorId, { plotBloomId: f.id, endsAt: dia("2027-03-09") })).rejects.toBeInstanceOf(
      FloracionValidationError,
    );
    const igual = await prisma.plotBloom.findUniqueOrThrow({ where: { id: f.id } });
    expect(igual.endsAt?.toISOString()).toBe(dia("2027-03-05").toISOString());
  }, 20000);

  it("un fin anterior al inicio se rechaza con una frase", async () => {
    const p = await parcelaPropia("P fin al revés");
    const f = await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2027-04-10") });
    await expect(cerrarFloracion(gestorId, { plotBloomId: f.id, endsAt: dia("2027-04-02") })).rejects.toBeInstanceOf(
      FloracionValidationError,
    );
  }, 20000);

  it("el mismo día del inicio sí vale: una floración de un día", async () => {
    const p = await parcelaPropia("P un día");
    const f = await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2027-04-20") });
    const cerrada = await cerrarFloracion(gestorId, { plotBloomId: f.id, endsAt: dia("2027-04-20") });
    expect(cerrada.endsAt?.toISOString()).toBe(dia("2027-04-20").toISOString());
  }, 20000);

  it("quien no gestiona la finca no la cierra — y queda abierta", async () => {
    const p = await parcelaPropia("P sin permiso");
    const f = await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2027-05-01") });
    await expect(cerrarFloracion(sinPermisoId, { plotBloomId: f.id, endsAt: dia("2027-05-08") })).rejects.toBeInstanceOf(
      TraceabilityAccessError,
    );
    expect((await prisma.plotBloom.findUniqueOrThrow({ where: { id: f.id } })).endsAt).toBeNull();
  }, 20000);

  it("una floración que no existe se rechaza con una frase, no con un error de Prisma", async () => {
    await expect(
      cerrarFloracion(gestorId, { plotBloomId: "00000000-0000-4000-8000-000000000000", endsAt: dia("2027-05-20") }),
    ).rejects.toBeInstanceOf(FloracionValidationError);
  }, 20000);
});

/**
 * **La floración registrada llega al aviso de polinizadores, y deja de llegar cuando termina.**
 *
 * Es la propiedad por la que existe F1: el aviso estaba construido e inalcanzable porque nada
 * permitía anotar una floración. Y fija cómo se guarda el fin: como **campo de día**, la medianoche
 * UTC del día que nombra, que es lo que `hayFloracion` compara. Si el fin se guardara como «el
 * instante en que acaba ese día» —lo que pedía el comentario viejo de `RegistrarFloracionInput`—,
 * en Panamá caería ya en el día siguiente UTC y el aviso se alargaría un día: la última aserción
 * de aquí caería.
 *
 * Los instantes van a las 17:00 UTC: en cualquier zona de UTC−12 a UTC+6 siguen siendo el mismo
 * día de calendario, así que la prueba da lo mismo en este Mac (Panamá) y en el CI (UTC).
 */
describe("la floración llega al aviso de polinizadores", () => {
  it("abierta, el aviso la ve; cerrada, la ve hasta su último día y no después", async () => {
    const p = await parcelaPropia("P aviso");
    const f = await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2027-06-01") });

    const abierta = await floracionesDeLaParcela(p);
    expect(hayFloracion(abierta, new Date("2027-06-20T17:00:00Z"), []), "abierta, el aviso debe verla").toBe(true);
    expect(hayFloracion(abierta, new Date("2027-05-31T17:00:00Z"), []), "antes de empezar, no").toBe(false);

    await cerrarFloracion(gestorId, { plotBloomId: f.id, endsAt: dia("2027-06-25") });
    const cerrada = await floracionesDeLaParcela(p);
    expect(hayFloracion(cerrada, new Date("2027-06-25T17:00:00Z"), []), "el último día cuenta").toBe(true);
    expect(hayFloracion(cerrada, new Date("2027-06-26T17:00:00Z"), []), "el día después, ya no").toBe(false);
  }, 20000);
});

/**
 * **La lista de la portada de la parcela: las suyas y las de sus microparcelas, marcadas.**
 *
 * ADR-196: lo de una selección se marca, no se mezcla. Una floración de una microparcela sale en la
 * portada de su parcela madre con el nombre de la microparcela; la de una parcela hermana no sale.
 * Y las abiertas arriba, que son las que piden «Terminó».
 */
describe("las floraciones de la portada de una parcela", () => {
  it("trae las suyas y las de sus microparcelas, marcadas, con las abiertas arriba", async () => {
    const p = await parcelaPropia("P portada");
    const micro = await parcelaPropia("Micro portada", p);
    const hermana = await parcelaPropia("P hermana portada");

    const cerradaPropia = await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2027-07-01"), endsAt: dia("2027-07-05") });
    const abiertaPropia = await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2027-07-10") });
    const abiertaMicro = await registrarFloracion(gestorId, { locationId: micro, startsAt: dia("2027-07-12") });
    const deLaHermana = await registrarFloracion(gestorId, { locationId: hermana, startsAt: dia("2027-07-14") });

    const lista = await floracionesDeLaPortada(gestorId, p);
    const ids = lista.map((f) => f.id);
    expect(ids, "las tres de la parcela y su microparcela, en orden").toEqual([abiertaMicro.id, abiertaPropia.id, cerradaPropia.id]);
    expect(ids, "la de una parcela hermana no").not.toContain(deLaHermana.id);

    const deMicro = lista.find((f) => f.id === abiertaMicro.id)!;
    expect(deMicro.esDeEstaParcela).toBe(false);
    expect(deMicro.location.name).toContain("Micro portada");
    expect(lista.find((f) => f.id === abiertaPropia.id)!.esDeEstaParcela).toBe(true);
  }, 20000);

  it("quien no ve la parcela no lee su lista — y el control de que el gestor sí", async () => {
    const p = await parcelaPropia("P portada sin permiso");
    await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2027-08-01") });
    await expect(floracionesDeLaPortada(sinPermisoId, p)).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await floracionesDeLaPortada(gestorId, p)).toHaveLength(1);
  }, 20000);
});
