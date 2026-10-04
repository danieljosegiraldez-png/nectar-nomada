import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getLotSummary, getManageableContext, TraceabilityAccessError } from "../../../../../lib/traceability/lots";
import { StorageForm } from "../../../../components/traceability/StorageForm";

export const dynamic = "force-dynamic";

export default async function NewStorageMovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let lot;
  try {
    lot = await getLotSummary(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  const context = await getManageableContext(user.userAccountId);

  return (
    <div>
      <Link href={`/lots/${id}`} className="nn-back-link">
        {t("backToLot", { lotCode: lot.lotCode })}
      </Link>
      <h1>{t("moveStorageButton")}</h1>
      {/* `getLotSummary` de arriba gatea por *ver*, no por *gestionar*: quien
          sólo puede ver el lote llegaba aquí y se encontraba un
          `<select required>` de ubicaciones sin ninguna opción, imposible de
          enviar y sin explicación. La escritura ya se re-comprueba en el
          servicio; lo que faltaba era decirlo en la pantalla. */}
      {context.sinAmbito ? (
        <>
          <p className="nn-muted">{t("sinAmbitoGestionHeading")}</p>
          <p className="nn-muted">{t("sinAmbitoGestionBody")}</p>
        </>
      ) : (
        <StorageForm lotId={lot.id} locations={context.locations} claveDeEnvio={crypto.randomUUID()} />
      )}
    </div>
  );
}
