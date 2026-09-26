/**
 * Recolectores de una finca y jornadas de cosecha.
 *
 * Spec: docs/superpowers/specs/2026-09-18-jornada-y-entrega-de-cosecha-design.md §3.1–3.2. Daniel,
 * 2026-09-18: «en finca no se registra cosecha, se puede registrar listo para cosechar y asignar
 * personas a cosecha».
 *
 * - Una **jornada** es la fecha, la finca y qué recolector va a qué parcela o microparcela lista.
 *   La finca no crea lotes: las entregas salen de la jornada hacia el beneficio.
 * - Un **recolector** es una `Person`, con cuenta o sin ella, en la lista de la finca desde una
 *   fecha (`FincaRecolector`).
 *
 * Permiso: `lot:manage` sobre el sitio de la finca —lo que ya tienen el Farm Manager y el
 * capataz—. Leer una jornada exige `lot:view` sobre ese sitio.
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess } from "./lots";
import { idsBajoLaFinca } from "./fincas";
import { can } from "../rbac/service";
import { recepcionDeEntregas } from "./recepcionesDeCereza";

export class JornadaError extends Error {}

async function sitioDeFinca(fincaSiteId: string) {
  const sitio = await prisma.location.findUnique({ where: { id: fincaSiteId }, select: { id: true, locationType: true, classification: true } });
  if (!sitio || sitio.locationType !== "site") throw new JornadaError("finca_no_encontrada");
  return sitio;
}

async function exigeGestionarFinca(userAccountId: string, fincaSiteId: string) {
  const sitio = await sitioDeFinca(fincaSiteId);
  await requireLotAccess(userAccountId, "manage", [{ locationId: sitio.id, classification: sitio.classification }]);
  return sitio;
}

/** Añade una persona a la lista de recolectores de la finca, desde una fecha. */
export async function agregarRecolector(userAccountId: string, input: { fincaSiteId: string; personId: string; desde: Date }) {
  await exigeGestionarFinca(userAccountId, input.fincaSiteId);
  // La lista de recolectores sale de «quién lo hizo» (P-G): sólo gente de esta finca o del equipo.
  await exigirPersonaPermitida(userAccountId, input.personId, [{ locationId: input.fincaSiteId }]);
  if (!(await prisma.person.findUnique({ where: { id: input.personId }, select: { id: true } }))) throw new JornadaError("persona_no_encontrada");
  return prisma.$transaction(async (tx) => {
    const abierta = await tx.fincaRecolector.findFirst({ where: { personId: input.personId, fincaSiteId: input.fincaSiteId, hasta: null } });
    if (abierta) throw new JornadaError("ya_es_recolector");
    const fila = await tx.fincaRecolector.create({
      data: { personId: input.personId, fincaSiteId: input.fincaSiteId, desde: input.desde, createdBy: userAccountId },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "harvest_picker.add", entityType: "finca_recolector", entityId: fila.id, after: fila, sourceInterface: "traceability.service" },
      tx,
    );
    return fila;
  });
}

/**
 * Da de baja a un recolector: le cierra el periodo con `hasta`.
 *
 * **Por qué existe (2026-09-25).** `agregarRecolector` existía desde el principio y **nada lo
 * deshacía**: el campo `hasta` estaba en el modelo y ningún código lo escribía nunca. Daniel dio de
 * alta un recolector de prueba en producción y no había manera de quitarlo desde ninguna pantalla.
 *
 * **No borra la fila, la cierra.** Quien recolectó una vez recolectó: sus entregas siguen siendo
 * suyas y los informes de esa cosecha no cambian. Lo que cambia es el futuro — desde `hasta` ya no
 * se le puede asignar a una jornada, que es la misma ventana que `recolectoresDeFinca` y
 * `abrirJornada` ya consultan.
 */
export async function darDeBajaRecolector(userAccountId: string, input: { fincaSiteId: string; personId: string; hasta: Date }) {
  await exigeGestionarFinca(userAccountId, input.fincaSiteId);
  return prisma.$transaction(async (tx) => {
    const abierta = await tx.fincaRecolector.findFirst({
      where: { personId: input.personId, fincaSiteId: input.fincaSiteId, hasta: null },
    });
    if (!abierta) throw new JornadaError("no_es_recolector");
    // Cerrar antes de empezar dejaría una ventana negativa, y `recolectoresDeFinca` la leería como
    // «nunca fue»: se rechaza en vez de guardar una fecha imposible.
    if (input.hasta < abierta.desde) throw new JornadaError("baja_antes_del_alta");
    const fila = await tx.fincaRecolector.update({ where: { id: abierta.id }, data: { hasta: input.hasta } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "harvest_picker.end", entityType: "finca_recolector", entityId: fila.id, before: abierta, after: fila, sourceInterface: "traceability.service" },
      tx,
    );
    return fila;
  });
}

/** Los recolectores activos de la finca en una fecha (hoy, si no se da). */
export async function recolectoresDeFinca(userAccountId: string, fincaSiteId: string, en: Date = new Date()) {
  const sitio = await sitioDeFinca(fincaSiteId);
  await requireLotAccess(userAccountId, "view", [{ locationId: sitio.id, classification: sitio.classification }]);
  const filas = await prisma.fincaRecolector.findMany({
    where: { fincaSiteId, desde: { lte: en }, OR: [{ hasta: null }, { hasta: { gt: en } }] },
    include: { person: { select: { id: true, displayName: true } } },
    orderBy: { person: { displayName: "asc" } },
  });
  return filas.map((f) => ({ personId: f.person.id, nombre: f.person.displayName }));
}

/**
 * Spec recepción §3.1 — los beneficios a los que puede ir una jornada: los de tipo `beneficio` sobre
 * los que quien abre tiene `lot:view` (que sube por los ancestros: el capataz de la finca ve el
 * beneficio que cuelga de su sitio). **No** `listarBeneficios`, que filtra por
 * `location:manage_attributes`, y un capataz no lo tiene.
 */
export async function beneficiosDeDestino(userAccountId: string) {
  const filas = await prisma.location.findMany({
    where: { locationType: "beneficio" },
    select: { id: true, name: true, classification: true },
    orderBy: { name: "asc" },
  });
  const salida: { id: string; name: string }[] = [];
  for (const f of filas) {
    if (await can(userAccountId, "view", "lot", { scopeType: "location", scopeRefId: f.id }, f.classification)) salida.push({ id: f.id, name: f.name });
  }
  return salida;
}

async function exigeBeneficioDeDestino(userAccountId: string, beneficioId: string) {
  const b = beneficioId ? await prisma.location.findUnique({ where: { id: beneficioId }, select: { id: true, locationType: true, classification: true } }) : null;
  if (!b || b.locationType !== "beneficio") throw new JornadaError("beneficio_no_valido");
  if (!(await can(userAccountId, "view", "lot", { scopeType: "location", scopeRefId: b.id }, b.classification))) throw new JornadaError("beneficio_no_valido");
}

export interface AbrirJornadaInput {
  readonly fincaSiteId: string;
  /** Spec recepción §3.1: el beneficio de destino, obligatorio. */
  readonly beneficioId: string;
  readonly fecha: Date;
  readonly nota?: string | null;
  readonly asignaciones: readonly { locationId: string; personId: string }[];
}

/**
 * Abre una jornada con al menos una asignación. Cada parcela tiene que ser un `plot` de ESTA
 * finca, y cada persona, recolector activo de esta finca en esa fecha.
 */
export async function abrirJornada(userAccountId: string, input: AbrirJornadaInput) {
  await exigeGestionarFinca(userAccountId, input.fincaSiteId);
  if (Number.isNaN(input.fecha.getTime())) throw new JornadaError("fecha_invalida");
  if (!input.asignaciones.length) throw new JornadaError("sin_asignaciones");
  await exigeBeneficioDeDestino(userAccountId, input.beneficioId);

  const arbol = await prisma.location.findMany({ select: { id: true, parentLocationId: true, locationType: true } });
  const bajo = idsBajoLaFinca(arbol, input.fincaSiteId);
  const tipos = new Map(arbol.map((l) => [l.id, l.locationType]));
  for (const a of input.asignaciones) {
    if (!bajo.has(a.locationId) || tipos.get(a.locationId) !== "plot") throw new JornadaError("parcela_fuera_de_la_finca");
  }

  return prisma.$transaction(async (tx) => {
    const personas = [...new Set(input.asignaciones.map((a) => a.personId))];
    const activos = await tx.fincaRecolector.findMany({
      where: { fincaSiteId: input.fincaSiteId, personId: { in: personas }, desde: { lte: input.fecha }, OR: [{ hasta: null }, { hasta: { gt: input.fecha } }] },
      select: { personId: true },
    });
    const activosSet = new Set(activos.map((r) => r.personId));
    if (personas.some((p) => !activosSet.has(p))) throw new JornadaError("no_es_recolector");

    const jornada = await tx.jornadaDeCosecha.create({
      data: {
        fincaSiteId: input.fincaSiteId,
        beneficioId: input.beneficioId,
        fecha: input.fecha,
        nota: input.nota?.trim() || null,
        createdBy: userAccountId,
        asignaciones: { create: input.asignaciones.map((a) => ({ locationId: a.locationId, personId: a.personId })) },
      },
      include: { asignaciones: true },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "harvest_day.open", entityType: "jornada_de_cosecha", entityId: jornada.id, after: jornada, sourceInterface: "traceability.service" },
      tx,
    );
    return jornada;
  });
}

/** Cierra una jornada: ya no admite entregas nuevas. */
export async function cerrarJornada(userAccountId: string, jornadaId: string) {
  const jornada = await prisma.jornadaDeCosecha.findUnique({ where: { id: jornadaId } });
  if (!jornada) throw new JornadaError("jornada_no_encontrada");
  await exigeGestionarFinca(userAccountId, jornada.fincaSiteId);
  return prisma.$transaction(async (tx) => {
    const antes = await tx.jornadaDeCosecha.findUniqueOrThrow({ where: { id: jornadaId } });
    if (antes.estado === "cerrada") throw new JornadaError("ya_cerrada");
    const despues = await tx.jornadaDeCosecha.update({ where: { id: jornadaId }, data: { estado: "cerrada", cerradaAt: new Date() } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "harvest_day.close", entityType: "jornada_de_cosecha", entityId: jornadaId, before: antes, after: despues, sourceInterface: "traceability.service" },
      tx,
    );
    return despues;
  });
}

/**
 * Pone o cambia el beneficio de destino. Sólo mientras ninguna entrega de la jornada tenga una
 * recepción vigente: después queda fijo (y el disparador `jornada_de_cosecha_destino_fijo` es la
 * red en la base).
 */
export async function cambiarDestinoDeJornada(userAccountId: string, input: { jornadaId: string; beneficioId: string }) {
  const jornada = await prisma.jornadaDeCosecha.findUnique({ where: { id: input.jornadaId } });
  if (!jornada) throw new JornadaError("jornada_no_encontrada");
  await exigeGestionarFinca(userAccountId, jornada.fincaSiteId);
  await exigeBeneficioDeDestino(userAccountId, input.beneficioId);
  return prisma.$transaction(async (tx) => {
    // La misma fila que bloquea `recibirCereza` antes de comparar el destino: uno espera al otro.
    await tx.$queryRaw`SELECT "id" FROM "traceability"."jornada_de_cosecha" WHERE "id" = ${input.jornadaId}::uuid FOR UPDATE`;
    const antes = await tx.jornadaDeCosecha.findUniqueOrThrow({ where: { id: input.jornadaId } });
    const recibida = await tx.recepcionDeCereza.findFirst({ where: { entrega: { jornadaId: antes.id }, estado: { not: "anulada" } }, select: { id: true } });
    if (recibida) throw new JornadaError("destino_fijo");
    const despues = await tx.jornadaDeCosecha.update({ where: { id: antes.id }, data: { beneficioId: input.beneficioId } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "harvest_day.set_destination", entityType: "jornada_de_cosecha", entityId: antes.id, before: antes, after: despues, sourceInterface: "traceability.service" },
      tx,
    );
    return despues;
  });
}

/** Las jornadas de una finca, la más reciente primero. */
export async function jornadasDeFinca(userAccountId: string, fincaSiteId: string) {
  const sitio = await sitioDeFinca(fincaSiteId);
  await requireLotAccess(userAccountId, "view", [{ locationId: sitio.id, classification: sitio.classification }]);
  return prisma.jornadaDeCosecha.findMany({
    where: { fincaSiteId },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { entregas: true, asignaciones: true } } },
  });
}

/**
 * Lo que se puede elegir como origen dentro de unas parcelas: sus bloques y sus plantas activas.
 * **No autoriza:** quien llama ya comprobó que puede ver esas parcelas (la jornada, o lo
 * asignado a la propia cuenta).
 */
export async function origenesDeParcelas(parcelaIds: readonly string[]) {
  const [bloques, plantas] = await Promise.all([
    prisma.plotBlock.findMany({ where: { locationId: { in: [...parcelaIds] } }, select: { id: true, name: true, locationId: true }, orderBy: { name: "asc" } }),
    prisma.specimen.findMany({
      where: { status: "active", OR: [{ locationId: { in: [...parcelaIds] } }, { plotBlock: { locationId: { in: [...parcelaIds] } } }] },
      select: { id: true, commonName: true, gridRow: true, gridPosition: true, locationId: true, plotBlock: { select: { locationId: true } } },
      orderBy: [{ commonName: "asc" }, { gridRow: "asc" }, { gridPosition: "asc" }],
    }),
  ]);
  return {
    bloques,
    plantas: plantas.map((p) => ({
      id: p.id,
      nombre: p.gridRow != null ? `${p.commonName} (${p.gridRow}-${p.gridPosition ?? "?"})` : p.commonName,
      parcelaId: p.plotBlock?.locationId ?? p.locationId,
    })),
  };
}

/** Una jornada con sus asignaciones, sus entregas y los orígenes que admite. */
export async function detalleDeJornada(userAccountId: string, jornadaId: string) {
  const jornada = await prisma.jornadaDeCosecha.findUnique({ where: { id: jornadaId }, include: { fincaSite: { select: { name: true, timezone: true } } } });
  if (!jornada) throw new JornadaError("jornada_no_encontrada");
  const sitio = await sitioDeFinca(jornada.fincaSiteId);
  await requireLotAccess(userAccountId, "view", [{ locationId: sitio.id, classification: sitio.classification }]);
  const [asignaciones, entregas] = await Promise.all([
    prisma.asignacionDeJornada.findMany({
      where: { jornadaId },
      include: { location: { select: { id: true, name: true } }, person: { select: { id: true, displayName: true } } },
    }),
    prisma.entregaDeCosecha.findMany({
      where: { jornadaId },
      orderBy: { enviadaAt: "asc" },
      include: {
        _count: { select: { assets: true } },
        recolector: { select: { id: true, displayName: true } },
        location: { select: { id: true, name: true } },
        plotBlock: { select: { id: true, name: true } },
        specimen: { select: { id: true, commonName: true } },
      },
    }),
  ]);
  const [origenes, cuentas, recibidas] = await Promise.all([
    origenesDeParcelas([...new Set(asignaciones.map((a) => a.location.id))]),
    prisma.userAccount.findMany({
      where: { id: { in: [...new Set(entregas.map((e) => e.anotadaPor))] } },
      select: { id: true, person: { select: { displayName: true } } },
    }),
    // Spec recepción §4: la finca ve lo que recibió el beneficio. Ya se autorizó ver esta jornada.
    recepcionDeEntregas(entregas.map((e) => e.id)),
  ]);
  // `anotadaPor` es una cuenta sin relación en el esquema: el nombre se resuelve aquí.
  const anotadores = new Map(cuentas.map((c) => [c.id, c.person.displayName]));
  return { jornada, asignaciones, entregas: entregas.map((e) => ({ ...e, anotadaPorNombre: anotadores.get(e.anotadaPor) ?? null, recepcion: recibidas.get(e.id) ?? null })), origenes };
}
