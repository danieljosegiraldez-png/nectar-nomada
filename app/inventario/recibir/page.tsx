import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { recibirMedicamentoFormAction } from "../../actions/inventario";
import { RecibirMedicamentoForm } from "../../components/inventario/RecibirMedicamentoForm";
import { getCurrentUser } from "../../../lib/auth/session";
import { opcionesDeRecepcion, type ClaseDeProducto } from "../../../lib/inventario/recepcion";

export const dynamic = "force-dynamic";

/**
 * Recibir un medicamento o un producto fitosanitario — botiquín, Tarea 9, y
 * aplicaciones fitosanitarias, Tarea 4.
 *
 * Lo del frasco se pide siempre —vencimiento, presentación, factura—; lo del
 * producto sólo si aún no lo tiene. Las advertencias del producto se ven EN el
 * formulario, no en una ficha aparte: es cuando alguien tiene el frasco en la mano.
 *
 * Sin `?clase=` en la URL se comporta exactamente como antes de esta tarea:
 * medicamento.
 */
export default async function RecibirMedicamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ clase?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { clase: claseBruta } = await searchParams;
  const clase: ClaseDeProducto = claseBruta === "fitosanitario" ? "fitosanitario" : "medicamento";

  const [t, opciones] = await Promise.all([getTranslations("Inventario"), opcionesDeRecepcion(user.userAccountId, clase)]);

  return (
    <main className="nn-page">
      <p>
        <Link href="/inventario">← {t("volver")}</Link>
      </p>
      <h1>{clase === "fitosanitario" ? t("recibirTituloFitosanitario") : t("recibirTitulo")}</h1>
      <p style={{ display: "flex", gap: "0.75rem" }}>
        <Link href="/inventario/recibir?clase=medicamento" aria-current={clase === "medicamento" ? "page" : undefined}>
          {t("claseMedicamento")}
        </Link>
        <Link href="/inventario/recibir?clase=fitosanitario" aria-current={clase === "fitosanitario" ? "page" : undefined}>
          {t("claseFitosanitario")}
        </Link>
      </p>
      {opciones.sitios.length === 0 ? (
        // Sin un sitio donde recibir, no se ofrece un formulario que fallaría al guardar.
        <p className="nn-muted">{t("recibirSinSitios")}</p>
      ) : (
        <>
          <p className="nn-muted">{t("recibirIntro")}</p>
          <RecibirMedicamentoForm action={recibirMedicamentoFormAction} sitios={opciones.sitios} productos={opciones.productos} clase={clase} />
        </>
      )}
    </main>
  );
}
