/**
 * Importa vocabulario de ruedas sensoriales únicamente en ediciones draft.
 * No publica, no deduce traducciones y no permite reescribir una edición congelada.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../lib/db";

type NodeInput = {
  key: string;
  parentKey?: string | null;
  level: "family" | "subfamily" | "descriptor";
  termOriginal: string;
  termEs?: string | null;
  color?: string | null;
  displayOrder: number;
  detail?: { definition: string; sourceReference: string; license?: string | null } | null;
  references?: { modality: "aroma" | "flavor" | "both"; reference: string; preparation?: string | null; intensity?: number | null; sourceReference: string; license?: string | null; displayOrder?: number }[];
};
type FileInput = {
  domain: "arabica_coffee" | "robusta_coffee" | "honey" | "wine" | "beer" | "mead" | "cider";
  title: string;
  edition: null | { version: number; sourceAuthor: string; sourceReference: string; license: string; permissionNote?: string | null; nodes: NodeInput[] };
};

const archivos = process.argv.slice(2);
if (!archivos.length) throw new Error("Uso: npm run sensory:import-wheels -- data/sensory-wheels/<rueda>.json");

for (const ruta of archivos) {
  const input = JSON.parse(await readFile(resolve(ruta), "utf8")) as FileInput;
  if (!input.domain || !input.title) throw new Error(`${ruta}: faltan domain/title`);
  await prisma.$transaction(async (tx) => {
    const wheel = await tx.sensoryWheel.upsert({
      where: { domain: input.domain },
      create: { domain: input.domain, title: input.title, isPublic: false },
      update: { title: input.title },
    });
    if (!input.edition) return;
    const existente = await tx.sensoryWheelVersion.findUnique({ where: { wheelId_version: { wheelId: wheel.id, version: input.edition.version } } });
    if (existente && existente.status !== "draft") throw new Error(`${ruta}: la edición ${input.edition.version} ya está ${existente.status}`);
    const version = existente ?? await tx.sensoryWheelVersion.create({ data: {
      wheelId: wheel.id,
      version: input.edition.version,
      sourceAuthor: input.edition.sourceAuthor,
      sourceReference: input.edition.sourceReference,
      license: input.edition.license,
      permissionNote: input.edition.permissionNote ?? null,
    } });
    if (existente) await tx.sensoryWheelVersion.update({ where: { id: version.id }, data: {
      sourceAuthor: input.edition.sourceAuthor,
      sourceReference: input.edition.sourceReference,
      license: input.edition.license,
      permissionNote: input.edition.permissionNote ?? null,
    } });

    const ids = new Map<string, { id: string; level: NodeInput["level"] }>();
    for (const node of input.edition.nodes) {
      if (node.parentKey) continue;
      const row = await tx.sensoryWheelNode.upsert({
        where: { versionId_key: { versionId: version.id, key: node.key } },
        create: { versionId: version.id, key: node.key, level: node.level, termOriginal: node.termOriginal, termEs: node.termEs ?? null, color: node.color ?? null, displayOrder: node.displayOrder },
        update: { level: node.level, termOriginal: node.termOriginal, termEs: node.termEs ?? null, color: node.color ?? null, displayOrder: node.displayOrder },
      });
      ids.set(node.key, { id: row.id, level: row.level });
    }
    // El orden del JSON es presentación, no dependencia. Importar por nivel
    // permite que un descriptor aparezca antes que su subfamilia en el archivo
    // sin volver frágil la carga; la FK compuesta sigue juzgando la jerarquía.
    for (const level of ["subfamily", "descriptor"] as const) {
      for (const node of input.edition.nodes.filter((n) => n.parentKey && n.level === level)) {
        const parent = ids.get(node.parentKey!);
        if (!parent) throw new Error(`${ruta}: no existe el padre ${node.parentKey} de ${node.key}`);
        const row = await tx.sensoryWheelNode.upsert({
          where: { versionId_key: { versionId: version.id, key: node.key } },
          create: { versionId: version.id, key: node.key, parentId: parent.id, parentLevel: parent.level, level: node.level, termOriginal: node.termOriginal, termEs: node.termEs ?? null, color: node.color ?? null, displayOrder: node.displayOrder },
          update: { parentId: parent.id, parentLevel: parent.level, level: node.level, termOriginal: node.termOriginal, termEs: node.termEs ?? null, color: node.color ?? null, displayOrder: node.displayOrder },
        });
        ids.set(node.key, { id: row.id, level: row.level });
      }
    }
    for (const node of input.edition.nodes) {
      const id = ids.get(node.key)?.id;
      if (!id) throw new Error(`${ruta}: nodo no importado: ${node.key}`);
      if (node.detail) await tx.sensoryWheelNodeDetail.upsert({ where: { nodeId: id }, create: { nodeId: id, ...node.detail }, update: node.detail });
      await tx.sensoryWheelReference.deleteMany({ where: { nodeId: id } });
      if (node.references?.length) await tx.sensoryWheelReference.createMany({ data: node.references.map((r, i) => ({ nodeId: id, ...r, displayOrder: r.displayOrder ?? i })) });
    }
  });
  process.stdout.write(`Rueda importada como borrador: ${input.domain}\n`);
}

await prisma.$disconnect();
