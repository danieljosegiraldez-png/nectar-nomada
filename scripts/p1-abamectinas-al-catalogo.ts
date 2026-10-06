/**
 * Las dos abamectinas, de alta en el CATÁLOGO y nada más (Daniel, 2026-10-06).
 *
 * Sus palabras: «vamos a meter ambas abamectina en catalogo solamente por
 * ahora». O sea identidad de producto, **sin existencias**: ningún
 * `ConsumableLot`, ninguna compra, ninguna cantidad. El camino existe —
 * `lib/inventario/materiales.ts` crea el material y su comentario dice «sin
 * identidad no hay existencias», la identidad va primero— y hoy **no tiene
 * pantalla**, así que esto se hace por guion.
 *
 * **SON DOS PRODUCTOS DISTINTOS, no dos nombres del mismo**, y la diferencia no
 * es cosmética: **24 h contra 48 h de reingreso** es dejar entrar a alguien al
 * lote o no. Los cultivos registrados también difieren. Cuál de los dos está en
 * la bodega de Finca Rosina sigue **sin decidir**, y por eso entran los dos: el
 * catálogo guarda lo que la etiqueta dice de cada uno, y quien registre una
 * aplicación elige el que tenga en la mano.
 *
 * **Todo lo que escribe sale de `docs/dominio/fitosanitarios-etiquetas.md`**,
 * que a su vez cita las etiquetas literalmente. Lo que la etiqueta no trae se
 * queda **nulo**, que en este esquema significa «nadie lo declaró» y no «no»:
 *
 *   - **sin dosis.** Ninguna de las dos etiquetas registra café — medido, con su
 *     control positivo — así que no hay dosis de café que copiar. Si en la finca
 *     se usa una, viene de otra fuente y se registra **con esa procedencia
 *     escrita**, no como si saliera de la etiqueta.
 *   - **sin plagas declaradas.** Por lo mismo: la lista vacía es «no declarado».
 *   - **sin `harmfulToPollinators`.** Las etiquetas no lo dicen, y el esquema es
 *     explícito en que nulo no se trata como «no». Es una decisión de Daniel y
 *     se le pregunta; inventarla aquí sería ponerle a la etiqueta algo que no
 *     tiene, justo en el campo que gobierna un aviso de seguridad.
 *   - de `Abamectin 18 EC`, **sin fabricante ni registro**: su documento no los
 *     trae. El principio activo sí, porque el documento lo clasifica como
 *     abamectina; su concentración, no.
 *
 * `plantProtectionUse: control` **no es una lectura de la etiqueta**: es la
 * decisión de Daniel del 2026-09-30, con sus palabras — «Regent y Abamectina son
 * de control, no se usan para prevenir con frecuencia, sólo si hay una
 * infestación» —, que es la misma fuente que cita el comentario del esquema.
 *
 * **`UNIDAD` es el único valor que no sale de ninguna fuente escrita**, y es
 * obligatorio en la tabla. La unidad es «en la que la finca lo compra y lo
 * gasta», o sea un hecho de la bodega y no de la etiqueta; las dos dan su dosis
 * en litros, así que se asume `litro`. **Se imprime en la simulación para que se
 * lea antes de aplicar**: si en la bodega vienen en galón o en frasco, se cambia
 * esa constante y se vuelve a correr.
 *
 * Idempotente: la unicidad real es el índice funcional sobre
 * `(organization_id, lower(btrim(name)))`, así que busca con esa misma forma y
 * **salta lo que ya exista** en vez de chocar.
 *
 * Usage:
 *   NN_ACTOR_EMAIL=<correo> npm run data:abamectinas             (simulación)
 *   NN_ACTOR_EMAIL=<correo> npm run data:abamectinas -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { crearMaterial, type CrearMaterialInput } from "../lib/inventario/materiales";

const FINCA = "Finca Rosina";

/** Lo único que no sale de la etiqueta. Ver la cabecera. */
const UNIDAD = "litro";

type Producto = Omit<CrearMaterialInput, "organizationId"> & {
  /** Qué queda sin declarar y por qué, para imprimirlo en vez de esconderlo. */
  readonly sinDeclarar: readonly string[];
};

const PRODUCTOS: readonly Producto[] = [
  {
    name: "ABAMECTAN® 1.8 EC",
    defaultUnit: UNIDAD,
    isPlantProtection: true,
    // «No reingresar al campo sin equipo de protección durante las primeras 48
    // horas de aplicado el producto» — literal de la etiqueta.
    defaultReentryHours: 48,
    activeIngredient: "Abamectina 18 g/L",
    manufacturer: "SILVESTRE INTERNATIONAL COMPANY S.A.C.",
    sanitaryRegistration: "Registro PQUA Nº 2327 - SENASA",
    plantProtectionUse: "control",
    safetyNotes:
      "Banda toxicológica amarilla: MODERADAMENTE PELIGROSO / DAÑINO. " +
      "No reingresar al campo sin equipo de protección durante las primeras 48 horas de aplicado.",
    notes:
      "Insecticida-acaricida agrícola, concentrado emulsionable (EC); grupo químico Avermectinas. " +
      "Registro de Perú (SENASA); formulado por Nanjing Haige Chemical. " +
      "La etiqueta NO registra café: alcachofa, fresa, holantao, limón, mandarina, palto, papa, " +
      "páprika, pimiento, tomate y vid. Su cuadro de dosis va en L/ha y L/200L de agua, con periodo " +
      "de carencia por cultivo, y ninguna fila es de café. " +
      "Fuente: docs/dominio/fitosanitarios-etiquetas.md.",
    sinDeclarar: [
      "dosis — la etiqueta no registra café",
      "plagas — por lo mismo",
      "harmfulToPollinators — la etiqueta no lo dice, y nulo no es «no»",
    ],
  },
  {
    name: "Abamectin 18 EC",
    defaultUnit: UNIDAD,
    isPlantProtection: true,
    // «Tiempo de reingreso al área tratada: 24 horas después de ser aplicado» —
    // literal, y es la diferencia con el de arriba.
    defaultReentryHours: 24,
    activeIngredient: "Abamectina",
    plantProtectionUse: "control",
    safetyNotes: "Tiempo de reingreso al área tratada: 24 horas después de ser aplicado.",
    notes:
      "PRODUCTO DISTINTO de ABAMECTAN® 1.8 EC, no otro nombre del mismo: los cultivos registrados " +
      "difieren y el reingreso también (24 h aquí, 48 h allá). " +
      "La etiqueta NO registra café: vides, almendros, palto, naranjo, limón, pomelo, mandarino, " +
      "clementina, tangelo, nogal, manzano, membrillo y peral. " +
      "Volumen de agua mínimo de 60 L/ha. «Utilizar las dosis más altas en condiciones de alta infestación». " +
      "Fuente: docs/dominio/fitosanitarios-etiquetas.md.",
    sinDeclarar: [
      "dosis — la etiqueta no registra café",
      "plagas — por lo mismo",
      "harmfulToPollinators — la etiqueta no lo dice, y nulo no es «no»",
      "fabricante y registro sanitario — su documento no los trae",
      "concentración del principio activo — su documento no la cita (el nombre dice «18 EC»)",
    ],
  },
];

class PreconditionError extends Error {}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODO: aplicar\n" : "MODO: simulación (usá --apply para escribir)\n");

  const actorEmail = process.env.NN_ACTOR_EMAIL;
  if (!actorEmail) throw new PreconditionError("Falta NN_ACTOR_EMAIL: dar de alta un material exige un actor real.");
  const actor = await prisma.userAccount.findFirst({
    where: { person: { email: actorEmail } },
    select: { id: true, person: { select: { displayName: true } } },
  });
  if (!actor) throw new PreconditionError(`No hay UserAccount para ${actorEmail}.`);

  // Por nombre y exigiendo que sea UNA: si hubiera dos «Finca Rosina» el alta
  // caería en cualquiera de las dos y no se vería.
  const fincas = await prisma.organization.findMany({ where: { name: FINCA }, select: { id: true, name: true } });
  const [finca] = fincas;
  if (!finca || fincas.length !== 1) {
    throw new PreconditionError(`Se esperaba 1 organización «${FINCA}» y hay ${fincas.length}. Parar y mirar.`);
  }

  console.log(`actor:        ${actor.person?.displayName ?? actorEmail}`);
  console.log(`organización: ${finca.name} (${finca.id})`);
  console.log(`unidad:       ${UNIDAD}  ← lo ÚNICO que no sale de la etiqueta; cambiala si en bodega vienen en otra\n`);

  for (const { sinDeclarar, ...producto } of PRODUCTOS) {
    // La misma forma que el índice funcional de la base, para que «ya existe»
    // signifique lo mismo aquí y allá.
    const ya = await prisma.consumableMaterial.findFirst({
      where: { organizationId: finca.id, name: { equals: producto.name.trim(), mode: "insensitive" } },
      select: { id: true, name: true, defaultReentryHours: true },
    });
    if (ya) {
      console.log(`«${ya.name}» ya está de alta (${ya.id}, reingreso ${ya.defaultReentryHours ?? "sin declarar"} h) — nada que hacer\n`);
      continue;
    }

    console.log(`«${producto.name}»`);
    console.log(`  principio activo: ${producto.activeIngredient}`);
    console.log(`  fabricante:       ${producto.manufacturer ?? "— sin declarar"}`);
    console.log(`  registro:         ${producto.sanitaryRegistration ?? "— sin declarar"}`);
    console.log(`  reingreso:        ${producto.defaultReentryHours} h`);
    console.log(`  uso:              ${producto.plantProtectionUse} (decisión de Daniel, 2026-09-30)`);
    for (const falta of sinDeclarar) console.log(`  sin declarar:     ${falta}`);

    if (!apply) {
      console.log("");
      continue;
    }

    const creado = await crearMaterial(actor.id, { ...producto, organizationId: finca.id });
    console.log(`  dado de alta:     ${creado.id}\n`);
  }

  if (!apply) {
    console.log("Simulación: no se escribió nada.");
    return;
  }

  // La fila que dice qué quedó, leída de la base y no de lo que el guion creía
  // escribir: sin existencias, que es lo que se pidió.
  const enCatalogo = await prisma.consumableMaterial.findMany({
    where: { organizationId: finca.id, isPlantProtection: true },
    select: { name: true, defaultReentryHours: true, _count: { select: { lots: true } } },
    orderBy: { name: "asc" },
  });
  console.log(`Fitosanitarios en el catálogo de ${finca.name} (${enCatalogo.length}):`);
  for (const m of enCatalogo) {
    console.log(`  ${m.name} · reingreso ${m.defaultReentryHours ?? "sin declarar"} h · ${m._count.lots} existencias`);
  }
}

main()
  .catch((err) => {
    if (err instanceof PreconditionError) {
      console.error(`\nPRECONDICIÓN FALLIDA: ${err.message}`);
      process.exitCode = 2;
      return;
    }
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
