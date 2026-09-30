/**
 * El destino de la cereza de una finca: a qué beneficio va lo que se cosecha ahí.
 *
 * Diseño: `docs/superpowers/specs/2026-09-30-destino-de-cereza-por-finca-design.md`. Decisión que
 * lo origina: **ADR-194** — «el cosechador no tiene que definir a quién le entrega; sólo entrega y
 * pesa». La finca lo declara **una vez** y cada jornada lo **copia**.
 *
 * **POR QUÉ ESTE ARCHIVO Y NO `fincas.ts`, que es lo que el plan decía.** Al ejecutarlo se midió
 * que `jornadasDeCosecha.ts` ya importa de `fincas.ts` (`idsBajoLaFinca`), así que poner esta
 * función en `fincas.ts` —donde necesita `exigeGestionarFinca` y `exigeBeneficioDeDestino`, que
 * viven en `jornadasDeCosecha.ts`— cerraría un ciclo de importación entre los dos módulos. Un
 * módulo propio lo evita sin duplicar nada: este importa de los dos, y ninguno de los dos importa
 * de este.
 *
 * **POR QUÉ LANZA `JornadaError` Y NO UN `DestinoDeFincaError` PROPIO,** que también es lo que el
 * plan decía. Las dos comprobaciones se REUSAN de `jornadasDeCosecha.ts`, y son ellas las que
 * lanzan. Envolverlas para renombrar el error sería una segunda traducción del mismo fallo, y
 * mezclar dos clases de error en una función es peor que usar la que ya existe. Los mensajes son
 * los suyos: `finca_no_encontrada` y `beneficio_no_valido`.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { JornadaError, beneficiosDeDestino, exigeBeneficioDeDestino, exigeGestionarFinca } from "./jornadasDeCosecha";
import { TraceabilityAccessError } from "./lots";

/**
 * Declara —o quita— el beneficio al que esta finca envía su cereza.
 *
 * **Los dos permisos, y en ese orden.** `lot:manage` sobre la finca, porque es su dato; y
 * `lot:view` sobre el beneficio, porque el destino es una relación entre dos organizaciones que
 * pueden no ser la misma («no son la misma organizacion», Daniel, 2026-09-30). Gestionar la finca
 * no autoriza a mandarle cereza a un beneficio que quien declara no ve.
 *
 * **`null` no es un hueco, es una respuesta.** Una finca cuya cereza se compra y se traslada
 * —Jaramillo, Artillería— no envía a ningún beneficio propio, y quitar el destino es una operación
 * legítima, no un error. Por eso la comprobación del beneficio se salta cuando viene `null`: no
 * hay beneficio que comprobar.
 */
export async function declararDestinoDeFinca(
  userAccountId: string,
  input: { readonly fincaSiteId: string; readonly beneficioId: string | null },
): Promise<void> {
  const sitio = await exigeGestionarFinca(userAccountId, input.fincaSiteId);
  if (input.beneficioId !== null) await exigeBeneficioDeDestino(userAccountId, input.beneficioId);

  await prisma.$transaction(async (tx) => {
    const antes = await tx.location.findUniqueOrThrow({
      where: { id: sitio.id },
      select: { beneficioDestinoId: true },
    });
    await tx.location.update({ where: { id: sitio.id }, data: { beneficioDestinoId: input.beneficioId } });
    // El `before` es lo que hace útil el registro: sin él no se puede reconstruir de dónde venía,
    // y una fila que sólo dice el después no distingue un cambio de un alta.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.set_beneficio_destino",
        entityType: "location",
        entityId: sitio.id,
        before: { beneficioDestinoId: antes.beneficioDestinoId },
        after: { beneficioDestinoId: input.beneficioId },
        sourceInterface: "traceability.service",
      },
      tx,
    );
  });
}

/**
 * Lo que la pantalla de destino necesita, y **nada que quien mira no pueda ver**.
 *
 * Devuelve `null` —y la página contesta 404— cuando no es un `site` o cuando quien mira no
 * gestiona esa finca. **El permiso que comprueba es el MISMO que exige `declararDestinoDeFinca`**
 * (`lot:manage` sobre la finca), no `location:manage_attributes` como la pantalla del logotipo: una
 * pantalla que se abre con un permiso y guarda con otro enseña un formulario que va a fallar.
 *
 * Los beneficios salen de `beneficiosDeDestino`, que ya filtra por `can(view, lot)`. Así la lista
 * no puede ofrecer un destino que después el servicio rechace — y, si sale vacía, la pantalla dice
 * qué falta en vez de un desplegable sin opciones.
 */
export async function fincaParaDestino(
  userAccountId: string,
  siteId: string,
): Promise<{
  readonly id: string;
  readonly name: string;
  readonly destino: { readonly id: string; readonly name: string } | null;
  readonly beneficios: readonly { readonly id: string; readonly name: string }[];
} | null> {
  const sitio = await prisma.location.findUnique({
    where: { id: siteId },
    select: { id: true, name: true, locationType: true, beneficioDestino: { select: { id: true, name: true } } },
  });
  if (!sitio || sitio.locationType !== "site") return null;
  try {
    await exigeGestionarFinca(userAccountId, siteId);
  } catch (error) {
    if (error instanceof TraceabilityAccessError || error instanceof JornadaError) return null;
    throw error;
  }
  return { id: sitio.id, name: sitio.name, destino: sitio.beneficioDestino, beneficios: await beneficiosDeDestino(userAccountId) };
}
