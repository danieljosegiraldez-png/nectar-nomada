import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { obtenerRuedaSensorial, RuedaSensorialNoEncontrada } from "../../../../../lib/sensory/ruedas";
import { RuedaInteractiva } from "../RuedaInteractiva";

export const dynamic = "force-dynamic";

export default async function RuedaPage({ params }: { params: Promise<{ wheel: string }> }) {
  const [{ wheel }, user, t] = await Promise.all([params, getCurrentUser(), getTranslations("SensoryWheels")]);
  const rueda = await obtenerRuedaSensorial(wheel, user?.userAccountId).catch((error: unknown) => {
    if (error instanceof RuedaSensorialNoEncontrada) notFound();
    throw error;
  });
  const nodos = rueda.version.nodes.map((nodo) => ({
    ...nodo,
    references: nodo.references.map((referencia) => ({ ...referencia, intensity: referencia.intensity == null ? null : Number(referencia.intensity) })),
  }));
  const textos = Object.fromEntries([
    "search", "mode", "circular", "layers", "wheel", "family", "subfamily", "descriptor", "references", "intensity", "source", "license", "noData", "choose",
  ].map((clave) => [clave, t(clave as "search")])) as Record<string, string>;
  return <main>
    <span className="nn-badge">{t("badge")}</span>
    <h1>{rueda.title}</h1>
    <p>{t("attribution", { author: rueda.version.sourceAuthor, license: rueda.version.license })}</p>
    {!rueda.isPublic ? <p role="status" className="nn-card">{t("privateDraft")}</p> : null}
    <RuedaInteractiva nodos={nodos} textos={textos} />
  </main>;
}
