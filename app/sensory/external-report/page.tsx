import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { opcionesParaInforme, InformeExternoError } from "../../../lib/sensory/informeExterno";
import { listarMuestrasParaCata } from "../../../lib/sensory/sessions";
import { InformeExternoForm } from "../../components/sensory/InformeExternoForm";

export const dynamic = "force-dynamic";

/**
 * La puerta que le faltaba al trabajo que se paga.
 *
 * **El caso, dicho por el dueño (2026-09-07):** «cuando un Q-grader o roaster me
 * trabaja las muestras que le pago el análisis, entran bajo estos estándares y
 * terminologías y puntajes». El servicio existe desde el PR #219; la única forma
 * de usarlo era `npm run sensory:record-external` con un JSON escrito a mano.
 * Medido el 2026-09-08: ninguna página lo mencionaba — control positivo, las de
 * `app/sensory/` sí existen, o sea que se buscó donde tenía que estar.
 *
 * **Dos pasos, y el primero es el protocolo.** Los atributos que hay que
 * puntuar dependen de él, y sus NOMBRES son la autoridad con la que el servicio
 * casa. Pedirlos al servidor después de elegir significa que ninguno se teclea:
 * un nombre tecleado es exactamente cómo un informe entraría a medias.
 */
export default async function InformeExternoPage({
  searchParams,
}: {
  searchParams: Promise<{ protocolVersionId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Sensory");
  const { protocolVersionId } = await searchParams;

  // El servicio autoriza igual al guardar. Aquí se sale antes en vez de pintar
  // un formulario que el servidor va a rechazar — la lente de los formularios
  // que ofrecen lo que el servicio niega.
  let opciones: Awaited<ReturnType<typeof opcionesParaInforme>>;
  let muestras: { id: string; label: string }[];
  try {
    const [o, ms] = await Promise.all([
      opcionesParaInforme(user.userAccountId, protocolVersionId ?? null),
      listarMuestrasParaCata(user.userAccountId),
    ]);
    opciones = o;
    muestras = ms.map((m) => ({
      id: m.id,
      label: [m.sampleCode, m.sampleType, m.description].filter(Boolean).join(" · "),
    }));
  } catch (error) {
    if (error instanceof InformeExternoError) redirect("/sensory");
    throw error;
  }

  return (
    <div>
      <Link href="/sensory" className="nn-back-link">
        {t("backToSensory")}
      </Link>
      <h1>{t("externalReportTitle")}</h1>
      <p className="nn-muted">{t("externalReportHelp")}</p>
      {opciones.atributos === null ? <p className="nn-muted">{t("externalReportProtocolHelp")}</p> : null}

      {/* Cada falta se dice por separado, y se nombra la causa en vez de pintar
          un formulario que no se puede enviar. Sin protocolo no hay dónde
          puntuar; sin muestra no hay a qué café atribuir el puntaje; sin
          personas no hay quién lo firme. */}
      {opciones.protocolos.length === 0 ? (
        <p className="nn-muted">{t("noProtocolsAvailable")}</p>
      ) : muestras.length === 0 ? (
        <p className="nn-muted">{t("noSamplesAvailable")}</p>
      ) : opciones.evaluadores.length === 0 ? (
        <p className="nn-muted">{t("externalReportNoPeople")}</p>
      ) : opciones.atributos === null ? (
        /* Paso 1: bajo qué estándar se cató.
           **Enlaces, no un formulario.** Elegir protocolo no escribe nada:
           recarga la página con sus atributos. Un botón de envío aquí habría
           estrenado la lista de excepciones del guardia de doble toque por algo
           que no envía nada — y en un teléfono tocar el nombre son menos toques
           que desplegar y confirmar.

           (Ese guardia lee la fuente léxicamente, así que hasta nombrar la
           etiqueta en un comentario lo dispara. Es su límite, y está escrito en
           su cabecera; se le da la vuelta redactando, no ampliándolo.) */
        <ul className="nn-list">
          {opciones.protocolos.map((p) => (
            <li key={p.id}>
              <Link href={`/sensory/external-report?protocolVersionId=${p.id}`}>{p.label}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p>
            <strong>{opciones.protocoloElegido?.label}</strong>{" "}
            <Link href="/sensory/external-report">{t("externalReportChangeProtocol")}</Link>
          </p>
          <InformeExternoForm
            protocolVersionId={protocolVersionId!}
            atributos={opciones.atributos}
            calculaTotal={opciones.calculaTotal === true}
            usaTazas={opciones.usaTazas === true}
            muestras={muestras}
            evaluadores={opciones.evaluadores}
          />
        </>
      )}
    </div>
  );
}
