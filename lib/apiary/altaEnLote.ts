/**
 * Dar de alta varias colmenas de una vez, con un prefijo y una numeración.
 *
 * **El incidente que lo motiva es del 2026-09-16, con Daniel en el apiario.** Abrió la
 * aplicación en campo, los apiarios salieron, y lo que faltaba era registrar **cinco colmenas
 * en cada uno**. El único camino era `NewHiveForm`, que crea **una**: cinco envíos por apiario,
 * diez en total, tecleando el identificador cada vez. Es literalmente lo que ya había pedido
 * antes —«no tener que hacer siempre una por una»— resuelto entonces para tratar y alimentar
 * (`registrarEventoEnLote`) y no para dar de alta.
 *
 * **Todo o nada, y por eso una sola transacción.** Un alta en lote a medias es peor que ninguna:
 * deja al dueño sin saber cuáles de las cinco entraron, y el segundo intento choca con las que
 * sí. Los identificadores se comprueban **antes** de crear nada, dentro de la misma transacción
 * que los crea, para que no se cuele una colmena entre la comprobación y la escritura.
 *
 * **Cada colmena nace con su colocación, igual que en el camino de una** (ADR-135): esto llama
 * a `crearColocacionInicial`, no repite su cuerpo. Una colmena guardada sin colocación es el
 * estado que aquel ADR vino a impedir, y un camino nuevo que lo olvide lo reabre.
 *
 * **La colonia es opcional y explícita, y eso no es pereza.** `CreateColonyInput.originType` no
 * tiene valor por omisión a propósito —su comentario lo llama «a capture-or-lose-it fact»—, así
 * que crear cinco colonias de oficio obligaría a inventarles un origen. Cuando el dueño declara
 * que las N vienen del MISMO origen, eso es un hecho que él afirma y aquí se registra; cuando no
 * lo declara, se crean cajas vacías y la colonia se añade después, colmena por colmena, donde
 * cada una puede decir la verdad.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { crearColocacionInicial, requireApiaryAccess } from "./hives";
import type { ColonyOriginType, DataQuality, ProvenanceClass } from "../../generated/prisma/client";

export class AltaEnLoteInvalida extends Error {}

/**
 * El techo, y no es redondo por gusto: el dueño instala **cinco** por apiario y el plan más
 * grande de sus minutas son **diez**. Cincuenta deja sitio de sobra para un apiario grande y
 * convierte un cero de más al teclear —500— en un error visible en vez de en quinientas filas.
 */
export const MAXIMO_POR_LOTE = 50;

/**
 * Los identificadores que saldrían, sin tocar la base. Exportada **porque el guardia tiene que
 * poder llamarla con la entrada hostil**: probar el relleno de ceros a través de un formulario
 * y una transacción es probar otra cosa.
 *
 * **El prefijo se escribe tal cual ha de salir, separador incluido.** `"LN-"` da `LN-01`; `"LN"`
 * daría `LN01`. No se añade un guion por nuestra cuenta: el dueño ya tiene colmenas con su
 * propio esquema y adivinarle el separador es cómo se parte una numeración en dos familias.
 *
 * **El relleno va al ancho del número MÁS GRANDE del lote, con un mínimo de dos.** Así cinco
 * desde 1 dan `01…05` y ordenan bien como texto, que es como se ordenan en una lista.
 */
export function identificadoresDelLote(prefijo: string, desde: number, cuantas: number): string[] {
  const p = prefijo.trim();
  if (p === "") throw new AltaEnLoteInvalida("prefijo_vacio");
  if (!Number.isInteger(desde) || desde < 1) throw new AltaEnLoteInvalida("desde_invalido");
  if (!Number.isInteger(cuantas) || cuantas < 1) throw new AltaEnLoteInvalida("cuantas_invalido");
  if (cuantas > MAXIMO_POR_LOTE) throw new AltaEnLoteInvalida("cuantas_sobre_el_techo");

  const ultimo = desde + cuantas - 1;
  const ancho = Math.max(2, String(ultimo).length);
  const ids: string[] = [];
  for (let n = desde; n <= ultimo; n += 1) ids.push(`${p}${String(n).padStart(ancho, "0")}`);
  return ids;
}

export interface AltaEnLoteInput {
  locationId: string;
  prefijo: string;
  desde: number;
  cuantas: number;
  projectId?: string | null;
  installedAt?: Date | null;
  /**
   * Cuando viene, las N colmenas nacen con colonia y **todas comparten este origen**. Es una
   * afirmación del dueño, no una inferencia: el formulario se lo pregunta aparte.
   */
  colonia?: {
    originType: ColonyOriginType;
    originSourceValueId?: string | null;
    originNote?: string | null;
    startedAt: Date;
    provenanceClass: ProvenanceClass;
    dataQuality?: DataQuality | null;
  } | null;
}

export async function altaDeColmenasEnLote(userAccountId: string, input: AltaEnLoteInput) {
  // Valida la forma ANTES del permiso: un `cuantas` de 500 no debería consultar RBAC siquiera.
  const identificadores = identificadoresDelLote(input.prefijo, input.desde, input.cuantas);

  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: input.projectId ?? null, locationId: input.locationId },
  ]);

  return prisma.$transaction(async (tx) => {
    // **Dentro de la transacción, no antes.** Comprobar fuera deja una ventana en la que otra
    // sesión crea `LN-03` y este lote la pisa con un choque de clave única a media escritura.
    const yaExisten = await tx.hive.findMany({
      where: { locationId: input.locationId, identifier: { in: identificadores } },
      select: { identifier: true },
    });
    if (yaExisten.length > 0) {
      const lista = yaExisten.map((h) => h.identifier).sort().join(", ");
      throw new AltaEnLoteInvalida(`identificadores_ya_usados: ${lista}`);
    }

    const creadas = [];
    for (const identifier of identificadores) {
      const hive = await tx.hive.create({
        data: {
          identifier,
          locationId: input.locationId,
          projectId: input.projectId ?? null,
          installedAt: input.installedAt ?? null,
          status: "active",
          createdBy: userAccountId,
        },
      });

      await crearColocacionInicial(tx, {
        hiveId: hive.id,
        locationId: hive.locationId,
        startedAt: hive.installedAt ?? hive.createdAt,
        createdBy: userAccountId,
      });

      // **Un evento por colmena, con la misma forma que el camino de una.** Agruparlos en uno
      // solo haría que una consulta por `entityId` encontrara el alta individual y no ésta, y
      // el audit dejaría de responder «quién creó esta colmena» para la mitad de ellas.
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "hive.create",
          entityType: "hive",
          entityId: hive.id,
          after: hive,
          sourceInterface: "web",
        },
        tx,
      );

      if (input.colonia) {
        const colony = await tx.colony.create({
          data: {
            hiveId: hive.id,
            startedAt: input.colonia.startedAt,
            status: "active",
            originType: input.colonia.originType,
            originNote: input.colonia.originNote ?? null,
            originSourceValueId: input.colonia.originSourceValueId ?? null,
            provenanceClass: input.colonia.provenanceClass,
            dataQuality: input.colonia.dataQuality ?? null,
            createdBy: userAccountId,
          },
        });
        await recordAuditEvent(
          {
            actorUserAccountId: userAccountId,
            operation: "colony.create",
            entityType: "colony",
            entityId: colony.id,
            after: colony,
            sourceInterface: "web",
          },
          tx,
        );
      }

      creadas.push(hive);
    }

    return creadas;
  });
}
