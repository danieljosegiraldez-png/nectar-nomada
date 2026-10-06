import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { puedeVerTrampasDeFinca } from "../../lib/traceability/fincaTrampas";
import { cookies } from "next/headers";
import { COOKIE_FINCA, fincaDeLaPagina, puedeCrearParcelaEn } from "../../lib/traceability/fincas";
import { NuevaParcelaForm } from "../components/traceability/NuevaParcelaForm";
import { FincaElegida } from "../components/traceability/FincaElegida";
import { puedeCambiarLogotipo } from "../../lib/traceability/fincaLogo";
import { situacionesDeLaFinca } from "../../lib/traceability/situacionesDeCampo";
import { mostrarInstante } from "../../lib/time/mostrarInstante";

export const dynamic = "force-dynamic";

/**
 * La sección Finca: una página índice, sin formularios. Hermana de `/beneficio`.
 *
 * Decisión de Daniel del 2026-09-18: la finca llega **hasta la cosecha** —parcelas,
 * lo de antes de cosechar, la cosecha, su rendimiento y quién la recolecta—, y lo
 * del beneficio empieza cuando entra la cereza. Diseño en
 * `docs/superpowers/specs/2026-09-18-seccion-finca-design.md`.
 *
 * **Sólo enlaza lo que ya existe.** Rendimiento y calidad de la cosecha llegan
 * en piezas posteriores del spec (las jornadas y sus recolectores ya existen); hasta entonces se nombran en una
 * línea, sin enlace, porque un enlace a una pantalla que no existe es un 404 con
 * buena cara.
 *
 * **«Registrar una cosecha» ya no está aquí** (decisión de Daniel, 2026-09-19): «en finca no se
 * registra cosecha». La finca abre jornadas y anota entregas; el lote de cereza se sigue creando a
 * mano; desde la pieza 3 (2026-09-19) nace de la recepción, en `/beneficio/recepcion`.
 *
 * **Cada enlace sólo aparece si quien mira puede usarlo**, con la misma pregunta
 * ancha que ya hace la navegación. La autorización de verdad sigue en cada destino.
 */
export default async function FincaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const granted = await permissionKeysAnywhere(user.userAccountId);
  // La misma regla que la entrada del menú, que heredó la de «Parcelas».
  const veFinca = ["location:manage_attributes", "lot:view", "lot:manage"].some((k) => granted.has(k));
  if (!veFinca) notFound();

  // Spec fincas y parcelas §3.1: con varias fincas y ninguna elegida, primero se elige.
  const finca = await fincaDeLaPagina(user.userAccountId, (await cookies()).get(COOKIE_FINCA)?.value);
  if (finca.debeElegir) redirect("/fincas?volver=/finca");
  const puedeCrearParcela = finca.elegida ? await puedeCrearParcelaEn(user.userAccountId, finca.elegida.siteId) : false;

  /**
   * **El tablero arriba, el índice abajo** — ADR-193, que lo decidió para `/beneficio`; esto es
   * aplicárselo a su hermana. Decisión de Daniel, 2026-10-04: lo que reporta el recolector tiene
   * que verse «donde no haya que ir a buscarlo».
   *
   * El lector ya filtra por permiso: con `field_report:view` sobre la finca se ve todo y sin él
   * sólo lo propio, así que aquí no se comprueba nada más. Un Farm Operator lo tiene entre sus 15.
   */
  const atencion = finca.elegida ? await situacionesDeLaFinca(user.userAccountId, finca.elegida.siteId) : null;

  const t = await getTranslations("SeccionFinca");
  const tf = await getTranslations("Fincas");
  const destinos = [
    { href: "/plots", titulo: t("parcelas"), ayuda: t("parcelasAyuda"), visible: true },
    {
      href: "/finca/trampas",
      titulo: t("fincaTrapsLink"),
      ayuda: t("fincaTrapsLinkAyuda"),
      visible: puedeVerTrampasDeFinca(granted),
    },
    // `jornadasDeFinca` exige `lot:view` sobre la finca; abrir una, `lot:manage`.
    { href: "/finca/jornadas", titulo: t("jornadas"), ayuda: t("jornadasAyuda"), visible: granted.has("lot:view") || granted.has("lot:manage") },
  ].filter((d) => d.visible);

  return (
    <div>
      <h1>{t("titulo")}</h1>
      <FincaElegida
        elegida={finca.elegida}
        hayVarias={finca.fincas.length > 1}
        volver="/finca"
        fincas={finca.fincas}
        puedeCambiarLogotipo={finca.elegida ? await puedeCambiarLogotipo(user.userAccountId, finca.elegida.siteId) : false}
      />
      {atencion ? (
        <section className="nn-section" aria-labelledby="atencion-finca">
          <h2 id="atencion-finca">{t("atencionTitulo")}</h2>
          <p className="nn-muted">{t("atencionAyuda")}</p>
          {atencion.filas.length === 0 ? (
            <p className="nn-empty">{t("atencionVacio")}</p>
          ) : (
            <ul>
              {atencion.filas.map((e) => {
                /* Dónde pasó, de lo más fino a lo más grueso: la planta si la hay, si no el
                   bloque, si no la parcela. Pintar los tres sería repetir el sitio tres veces. */
                const donde = e.specimen?.commonName ?? e.plotBlock?.name ?? e.fieldSession?.location?.name ?? null;
                /* El valor del catálogo se pinta crudo, como en `/field-sessions/[id]`: es el
                   vocabulario fijo que pidió Daniel, no una cadena a traducir. */
                const que = e.condicionDelDiaValue?.value ?? e.eventKindValue?.value ?? null;
                return (
                  <li key={e.id}>
                    {que ? <strong>{que}</strong> : null}
                    {donde ? <> · {donde}</> : null}
                    {" · "}
                    {mostrarInstante(e.occurredAt, atencion.zona)}
                    {e.operator?.displayName ? <> · {e.operator.displayName}</> : null}
                    {e.asset ? <> · {t("atencionConFoto")}</> : null}
                    {e.notes ? <><br /><span className="nn-muted">{e.notes}</span></> : null}
                    {e.fieldSession?.jornadaDeCosechaId ? (
                      <>
                        {" "}
                        <Link href={`/finca/jornadas/${e.fieldSession.jornadaDeCosechaId}`}>{t("atencionVerJornada")}</Link>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
      <p className="nn-muted">{t("intro")}</p>
      <ul>
        {destinos.map((d) => (
          <li key={d.href}>
            <Link href={d.href}>{d.titulo}</Link>
            <br />
            <span className="nn-muted">{d.ayuda}</span>
          </li>
        ))}
      </ul>
      {finca.elegida ? (
        /* Daniel, 2026-09-27: si no puede crear parcelas, la sección entera no aparece —
           ni su título ni una disculpa. Antes se pintaba el encabezado «Nueva parcela» con un
           texto de «no tienes permiso» debajo, que es ofrecer y luego negar. */
        puedeCrearParcela ? (
        <section className="nn-section">
          <h2>{tf("nuevaParcelaTitulo")}</h2>
          <NuevaParcelaForm siteId={finca.elegida.siteId} />
        </section>
        ) : null
      ) : null}
      <p className="nn-muted">{t("proximamente")}</p>
    </div>
  );
}
