import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { recibirMedicamentoFormAction } from "../../actions/inventario";
import { RecibirMedicamentoForm } from "../../components/inventario/RecibirMedicamentoForm";
import { getCurrentUser } from "../../../lib/auth/session";
import { opcionesDeRecepcion } from "../../../lib/inventario/recepcion";

export const dynamic = "force-dynamic";

/**
 * Recibir un medicamento en el botiquín — botiquín, Tarea 9.
 *
 * Lo del frasco se pide siempre —vencimiento, presentación, factura—; lo del
 * producto sólo si aún no lo tiene. Las advertencias del producto se ven EN el
 * formulario, no en una ficha aparte: es cuando alguien tiene el frasco en la mano.
 */
export default async function RecibirMedicamentoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, opciones] = await Promise.all([getTranslations("Inventario"), opcionesDeRecepcion(user.userAccountId)]);

  return (
    <main className="nn-page">
      <p>
        <Link href="/inventario">← {t("volver")}</Link>
      </p>
      <h1>{t("recibirTitulo")}</h1>
      {opciones.sitios.length === 0 ? (
        // Sin un sitio donde recibir, no se ofrece un formulario que fallaría al guardar.
        <p className="nn-muted">{t("recibirSinSitios")}</p>
      ) : (
        <>
          <p className="nn-muted">{t("recibirIntro")}</p>
          <RecibirMedicamentoForm action={recibirMedicamentoFormAction} sitios={opciones.sitios} productos={opciones.productos} />
        </>
      )}
    </main>
  );
}
