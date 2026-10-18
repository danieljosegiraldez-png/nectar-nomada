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
import { UUID } from "../validation/uuid";

/**
 * Declara —o quita— el beneficio al que esta finca envía su cereza.
 *
 * **Los dos permisos, y en ese orden.** `lot:manage` sobre la finca, porque es su dato; y
 * `lot:view` sobre el beneficio, porque el destino es una relación entre dos organizaciones que
 * pueden no ser la misma («no son la misma organizacion», Daniel, 2026-09-30). Gestionar la finca
 * no autoriza a mandarle cereza a un beneficio que quien declara no ve.
 *
 * **Salvo uno de la MISMA organización que la finca** (ADR-198, PR 3): un beneficio sin padre no
 * cuelga de ninguna finca y `lot:view` no le llega por los ancestros, pero la finca y él son de la
 * misma casa. Ahí basta `lot:manage` sobre la finca con la clasificación del beneficio, y nunca se
 * concede ver sus lotes.
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
  if (input.beneficioId !== null) await exigeBeneficioDeDestino(userAccountId, input.beneficioId, sitio);

  await prisma.$transaction(async (tx) => {
    // **El `before` se lee con la fila bloqueada.** Sin esto, dos declaraciones a la vez leen el
    // mismo `antes` bajo READ COMMITTED y la segunda audita un origen que ya no era el suyo: la
    // escritura y su evento serían atómicos y aun así el historial describiría mal la transición,
    // que en una plataforma de procedencia cuesta más que un fallo visible. Es el mismo bloqueo,
    // en la misma forma, que `cambiarDestinoDeJornada` ya hace antes de comparar su destino.
    // Señalado por la revisión independiente de Codex, 2026-09-30.
    await tx.$queryRaw`SELECT "id" FROM "core"."location" WHERE "id" = ${sitio.id}::uuid FOR UPDATE`;
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
 * Lo que la pantalla de destino necesita.
 *
 * **Una precisión que esta cabecera decía mal, y la corrigió Codex el 2026-09-30:** decía «nada que
 * quien mira no pueda ver», y no es cierto para el destino ACTUAL — se devuelve su nombre sin
 * comprobar `lot:view` sobre él. Es deliberado, no un descuido: el destino es un campo **de la
 * finca**, y quien la gestiona tiene que poder sostener «esta cereza va a Las Nubes» hasta el
 * enlace que lo dice (rúbrica 21). La alternativa —enseñar «destino restringido»— dejaría a quien
 * manda la cereza sin saber a dónde va. Lo que sí va filtrado por `can(view, lot)` es la lista de
 * lo que se puede ELEGIR, que es donde el permiso decide algo.
 *
 * Devuelve `null` —y la página contesta 404— cuando no es un `site` o cuando quien mira no
 * gestiona esa finca. **El permiso que comprueba es el MISMO que exige `declararDestinoDeFinca`**
 * (`lot:manage` sobre la finca), no `location:manage_attributes` como la pantalla del logotipo: una
 * pantalla que se abre con un permiso y guarda con otro enseña un formulario que va a fallar.
 *
 * Los beneficios salen de `beneficiosDeDestino` con esta finca: los que `can(view, lot)` deja ver, más
 * los de su organización (ADR-198, PR 3). Son exactamente los que acepta `exigeBeneficioDeDestino`. Así la lista
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
  // El id llega de la URL. Sin forma de UUID, Prisma lanzaba `P2007` y la página daba 500
  // (PENDING_IMPLEMENTATIONS/026); es una finca que no existe.
  if (!UUID.test(siteId)) return null;
  const sitio = await prisma.location.findUnique({
    where: { id: siteId },
    select: { id: true, name: true, locationType: true, beneficioDestino: { select: { id: true, name: true } } },
  });
  if (!sitio || sitio.locationType !== "site") return null;
  let finca: Awaited<ReturnType<typeof exigeGestionarFinca>>;
  try {
    finca = await exigeGestionarFinca(userAccountId, siteId);
  } catch (error) {
    if (error instanceof TraceabilityAccessError || error instanceof JornadaError) return null;
    throw error;
  }
  return { id: sitio.id, name: sitio.name, destino: sitio.beneficioDestino, beneficios: await beneficiosDeDestino(userAccountId, finca) };
}
