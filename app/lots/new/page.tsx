import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getManageableContext } from "../../../lib/traceability/lots";
import { catalogosDeCereza } from "../../../lib/traceability/harvest";
import { HarvestForm } from "../../components/traceability/HarvestForm";
import { ReceivingForm } from "../../components/traceability/ReceivingForm";

export const dynamic = "force-dynamic";

export default async function NewLotPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  const context = await getManageableContext(user.userAccountId);
  // Vocabulario de la cereza: los tres catálogos cerrados que sustituyen a la
  // caja de texto «condición».
  const cerezas = await catalogosDeCereza();

  return (
    <div>
      <Link href="/lots" className="nn-back-link">
        {t("backToLots")}
      </Link>
      <h1>{t("createLotButton")}</h1>

      {/* Sin ámbito de gestión, `getManageableContext` devuelve las tres listas
          vacías y los dos formularios salían igual: `organizationId` y
          `locationId` son `<select required>` sin opciones, así que no se podían
          enviar y nada decía por qué. SECURITY.md §2 ya garantiza que la
          escritura se re-comprueba —`recordHarvestEvent` llama al guardia de
          lotes con acción `"manage"`—, de modo que esto no era un agujero: era
          una pantalla afirmando una oferta falsa. Se nombra la causa, igual que
          en `/lots`. */}
      {context.sinAmbito ? (
        <>
          <p className="nn-muted">{t("sinAmbitoGestionHeading")}</p>
          <p className="nn-muted">{t("sinAmbitoGestionBody")}</p>
        </>
      ) : (
        <>
          <p className="nn-muted">{t("createLotIntro")}</p>

          <section className="nn-section">
            <h2>{t("harvestHeading")}</h2>
            <HarvestForm organizations={context.organizations} locations={context.plotLocations} projects={context.projects} cerezas={cerezas} />
          </section>

          <section className="nn-section">
            <h2>{t("receivingHeading")}</h2>
            <ReceivingForm organizations={context.organizations} locations={context.plotLocations} projects={context.projects} />
          </section>
        </>
      )}
    </div>
  );
}
