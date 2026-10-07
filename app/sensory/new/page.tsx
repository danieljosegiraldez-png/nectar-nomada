import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { listarProtocolosParaCata, buscarMuestrasParaCata, SesionDeCataError } from "../../../lib/sensory/sessions";
import { opcionesDePreparacion } from "../../../lib/sensory/opcionesDePreparacion";
import { CrearSesionForm } from "../../components/sensory/CrearSesionForm";

export const dynamic = "force-dynamic";

/**
 * La puerta que le faltaba a la cata.
 *
 * Medido el 2026-09-06: `sensorySession.create` sólo existía en `prisma/seed.ts`
 * y en pruebas. El módulo estaba entero por dentro y nadie podía empezar una
 * cata, que es la razón de las cero valoraciones en producción.
 */
export default async function NuevaSesionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Sensory");

  // El propio servicio guarda con `sensory:manage_session`. Sin permiso se
  // vuelve a la lista en vez de pintar un formulario que el servidor va a
  // rechazar — la lente de los formularios que ofrecen lo que el servicio niega.
  let protocolos: { id: string; label: string }[];
  let muestras: Array<{ key: string; sampleId: string; roastSessionId: string | null; label: string }>;
  let hayMas: boolean;
  let hayMuestrasSinTueste = false;
  try {
    const [ps, ms] = await Promise.all([
      listarProtocolosParaCata(user.userAccountId),
      // Las primeras, sin texto: la pantalla empieza igual que antes y el
      // buscador trae el resto (ver `SelectorDeMuestras`).
      buscarMuestrasParaCata(user.userAccountId, ""),
    ]);
    protocolos = ps;
    muestras = ms.muestras.flatMap((m) => opcionesDePreparacion(m, textosDePreparacion(t)));
    hayMuestrasSinTueste = ms.muestras.length > 0 && muestras.length === 0;
    hayMas = ms.hayMas;
  } catch (error) {
    if (error instanceof SesionDeCataError) redirect("/sensory");
    throw error;
  }

  return (
    <div>
      <Link href="/sensory" className="nn-back-link">
        {t("backToSensory")}
      </Link>
      <h1>{t("createSessionButton")}</h1>

      {/* Se nombra la causa en vez de pintar un formulario que no se puede
          enviar: sin protocolo no hay dónde puntuar, y sin muestras no hay qué
          catar. Son dos faltas distintas y se dicen por separado. */}
      {protocolos.length === 0 ? (
        <p className="nn-muted">{t("noProtocolsAvailable")}</p>
      ) : muestras.length === 0 && !hayMas ? (
        <p className="nn-muted">{t(hayMuestrasSinTueste ? "noRoastedSamplesAvailable" : "noSamplesAvailable")}</p>
      ) : (
        <CrearSesionForm protocolos={protocolos} muestras={muestras} hayMas={hayMas} />
      )}
    </div>
  );
}

function textosDePreparacion(t: Awaited<ReturnType<typeof getTranslations<"Sensory">>>) {
  return {
    sinPerfil: t("sampleRoastNoProfile"),
    sinEquipo: t("sampleRoastNoEquipment"),
    linajeDemasiadoHondo: t("sampleLineageTooDeep"),
    describirTueste: (datos: { date: string; profile: string; equipment: string; reference: string }) => t("sampleRoastOption", datos),
  };
}
