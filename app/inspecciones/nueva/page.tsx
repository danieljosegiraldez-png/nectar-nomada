import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { opcionesParaInspeccion } from "../../../lib/traceability/samplingEvents";
import { getObserverCandidates } from "../../../lib/traceability/lots";
import { FormularioInspeccion } from "./FormularioInspeccion";

export const dynamic = "force-dynamic";
export default async function NuevaInspeccionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [t, opciones] = await Promise.all([getTranslations("Secado"), opcionesParaInspeccion(user.userAccountId)]);
  // Sin lote elegido todavía: las personas de las fincas de todo lo que se ofrece. La acción
  // exige después la del lote o la cama que se elija.
  const personas = await getObserverCandidates(user.userAccountId, opciones.anclas);
  return <div>
    <p><Link href="/lots">← {t("lotes")}</Link> · <Link href="/instalaciones">{t("instalaciones")}</Link></p>
    <h1>{t("inspeccionTitulo")}</h1>
    <p>{t("inspeccionIntro")}</p>
    {opciones.lotes.length && opciones.camas.length
      ? <FormularioInspeccion {...opciones} personas={personas.people} />
      : <p role="alert">{t("sinContexto")}</p>}
  </div>;
}
