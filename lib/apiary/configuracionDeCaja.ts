/**
 * La configuración de la caja: leerla, cambiarla, y lo que hace comparable a
 * «cuadros cubiertos de abeja».
 *
 * **Qué cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.4, con la instrucción del
 * dueño sobre dónde vive: *«Cambia poco entre visitas, así que se guarda en la
 * colmena y en la inspección sólo se registra la diferencia. Preguntarlo cada vez es
 * coste sin información.»*
 *
 * **Por qué esta rebanada antes que las otras dos que quedaban.** `framesPerBox` es
 * el **denominador** de `beeCoveredFrames`, que existe desde ADR-117. El Anexo pide
 * ese campo porque es *«la medida cuantitativa de fuerza, comparable entre visitas y
 * entre sitios»* — y sin denominador **no es comparable**: ocho cuadros cubiertos
 * dicen una cosa en una caja de ocho y otra en una de diez. Terminar lo que quedó a
 * medias vale más que añadir campos nuevos.
 *
 * **Y un hueco que había que cerrar de paso:** `lib/apiary/` no tenía **ninguna**
 * función para actualizar una colmena, igual que hasta ayer no la tenía para un
 * evento (ADR-121). Aquí no es un accidente del diseño: la configuración **cambia
 * por definición** —se añade un alza, se pone un excluidor— así que el camino de
 * actualización es parte del campo, no un añadido.
 */
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { recordAuditEvent } from "../audit";
import { exigeMetodoDeAlimentacion } from "./alimentacion";

/** Una entrada que el servicio rechaza. */
export class ConfiguracionInvalida extends Error {}

export interface ConfiguracionDeCajaInput {
  hiveId: string;
  broodBoxes?: number | string | null;
  supers?: number | string | null;
  framesPerBox?: number | string | null;
  queenExcluder?: boolean | null;
  feederType?: string | null;
  entranceReducer?: boolean | null;
  screenedBottomBoard?: boolean | null;
  /**
   * Por qué se cambió, **opcional a propósito**.
   *
   * A diferencia de ADR-121, aquí cambiar un valor **no es corregir**: añadir un alza
   * es un hecho del mundo, y el cambio ES el evento. Exigir una razón para el curso
   * normal del trabajo enseñaría a escribir «.».
   *
   * **El límite, dicho:** el rastro no puede distinguir «le puse un alza» de «me
   * equivoqué al teclear» por su cuenta. La razón es cómo se dice cuál de las dos
   * fue, y por eso se guarda cuando viene.
   */
  reason?: string | null;
}

/** Un entero contado, o nada. Cero es legítimo: una caja sin alzas tiene cero. */
function enteroContado(valor: unknown, campo: string): number | null | undefined {
  if (valor === undefined) return undefined; // no vino: no se toca
  if (valor === null || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isInteger(n) || n < 0) throw new ConfiguracionInvalida(`${campo}_invalido`);
  return n;
}

/**
 * Cambia la configuración de una colmena. **Sólo lo que viene**: un campo ausente no
 * se toca, y eso es lo que permite registrar «sólo la diferencia» como pide el Anexo.
 *
 * Escribe su `AuditEvent` con `before`/`after` en la **misma transacción**, así que el
 * historial de una caja es `leerEnmiendas` sobre `entityType: "hive"` — sin nada
 * nuevo que construir.
 */
export async function actualizarConfiguracionDeCaja(userAccountId: string, input: ConfiguracionDeCajaInput) {
  const hive = await prisma.hive.findUnique({ where: { id: input.hiveId } });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  await requireApiaryAccess(userAccountId, "manage", [{ projectId: hive.projectId, locationId: hive.locationId }]);

  const broodBoxes = enteroContado(input.broodBoxes, "camaras_de_cria");
  const supers = enteroContado(input.supers, "alzas");
  const framesPerBox = enteroContado(input.framesPerBox, "cuadros_por_caja");
  // Cero cuadros por caja no es una caja: es un dato imposible. A diferencia de las
  // alzas, donde cero es legítimo.
  if (framesPerBox === 0) throw new ConfiguracionInvalida("cuadros_por_caja_invalido");

  const feederType =
    input.feederType === undefined
      ? undefined
      : input.feederType === null || input.feederType === ""
        ? null
        : exigeMetodoDeAlimentacion(input.feederType);

  const cambios = {
    ...(broodBoxes !== undefined ? { broodBoxes } : {}),
    ...(supers !== undefined ? { supers } : {}),
    ...(framesPerBox !== undefined ? { framesPerBox } : {}),
    ...(input.queenExcluder !== undefined ? { queenExcluder: input.queenExcluder } : {}),
    ...(feederType !== undefined ? { feederType } : {}),
    ...(input.entranceReducer !== undefined ? { entranceReducer: input.entranceReducer } : {}),
    ...(input.screenedBottomBoard !== undefined ? { screenedBottomBoard: input.screenedBottomBoard } : {}),
  };
  // Un `update` vacío escribiría un `AuditEvent` que dice que no pasó nada.
  if (Object.keys(cambios).length === 0) throw new ConfiguracionInvalida("nada_que_cambiar");

  return prisma.$transaction(async (tx) => {
    const despues = await tx.hive.update({ where: { id: input.hiveId }, data: cambios });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "hive.configure",
        entityType: "hive",
        entityId: despues.id,
        before: hive,
        after: despues,
        reason: input.reason?.trim() || undefined,
        sourceInterface: "apiary.service",
      },
      tx,
    );
    return despues;
  });
}

export interface FuerzaDeColonia {
  /** Cuadros cubiertos que declaró la inspección. */
  cuadrosCubiertos: number;
  /** Capacidad de la caja: `(cámaras + alzas) × cuadros por caja`. */
  capacidad: number | null;
  /**
   * Fracción de la caja que cubre la abeja, en por ciento. **Derivado, nunca
   * guardado** — misma disciplina que la infestación de varroa (ADR-116).
   */
  ocupacion: number | null;
}

/**
 * Cuánta caja cubre la abeja. **Es la razón de esta rebanada.**
 *
 * `null` en `capacidad` y `ocupacion` cuando la configuración no está declarada, y
 * eso es una respuesta y no un hueco: significa **«este número no se puede
 * comparar»**, que es exactamente lo que pasaba con todas las inspecciones hasta
 * hoy. Devolver 0, o suponer diez cuadros por caja, convertiría una ausencia en una
 * afirmación (ADR-080) y haría comparables cosas que no lo son.
 *
 * Pura y exportada: se prueba con la entrada hostil sin construir una colmena.
 */
export function fuerzaDeColonia(
  cuadrosCubiertos: number,
  caja: { broodBoxes: number | null; supers: number | null; framesPerBox: number | null },
): FuerzaDeColonia {
  // Sin cuadros por caja no hay denominador. Las cámaras sí pueden faltar si hay
  // alzas declaradas y viceversa: lo que no se declaró cuenta como cero cajas, no
  // como caja desconocida — es aritmética, y una caja no declarada no ocupa.
  if (caja.framesPerBox === null || caja.framesPerBox <= 0) {
    return { cuadrosCubiertos, capacidad: null, ocupacion: null };
  }
  const cajas = (caja.broodBoxes ?? 0) + (caja.supers ?? 0);
  if (cajas <= 0) return { cuadrosCubiertos, capacidad: null, ocupacion: null };
  const capacidad = cajas * caja.framesPerBox;
  return { cuadrosCubiertos, capacidad, ocupacion: (cuadrosCubiertos / capacidad) * 100 };
}
