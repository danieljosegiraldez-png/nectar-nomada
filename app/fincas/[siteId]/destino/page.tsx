import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { fincaParaDestino } from "../../../../lib/traceability/destinoDeFinca";
import { DestinoDeFincaForm } from "../../../components/traceability/DestinoDeFincaForm";

export const dynamic = "force-dynamic";

/**
 * A qué beneficio envía su cereza esta finca — ADR-194, diseño 2026-09-30.
 *
 * Sigue el precedente de `[siteId]/logotipo/`: componente de servidor, y el permiso comprobado
 * **en el servidor** y no ocultando el enlace — quien no gestiona la finca recibe 404, igual que
 * el resto de las pantallas de finca que no le corresponden.
 *
 * **Si no hay beneficios que ofrecer, dice qué falta y quién lo arregla** (rúbrica 22): un
 * desplegable vacío deja a quien mira sin saber si el problema es suyo, del permiso o del dato.
 */
export default async function DestinoDeFincaPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const finca = await fincaParaDestino(user.userAccountId, siteId);
  if (!finca) notFound();

  const t = await getTranslations("Fincas");
  return (
    <div>
      <Link href="/fincas" className="nn-back-link">
        {t("volverAFincas")}
      </Link>
      <h1>{t("destinoTitulo")}</h1>
      <p className="nn-muted">{t("destinoIntro", { nombre: finca.name })}</p>
      <p>
        {finca.destino
          ? t("destinoActual", { beneficio: finca.destino.name })
          : t("destinoNinguno")}
      </p>
      {/*
        **El formulario se enseña aunque no haya beneficios que ofrecer**, y el aviso se queda al
        lado. Quitar el destino NO exige ver ningún beneficio —`declararDestinoDeFinca` se salta esa
        comprobación cuando llega `null`—, así que esconder el formulario le impedía DETENER el
        encaminamiento justo a quien está autorizado a hacerlo. Lo señaló la revisión independiente
        de Codex, 2026-09-30.
      */}
      {finca.beneficios.length === 0 ? <p className="nn-muted">{t("destinoSinBeneficios")}</p> : null}
      <DestinoDeFincaForm
        siteId={finca.id}
        actual={finca.destino?.id ?? ""}
        beneficios={finca.beneficios.map((b) => ({ id: b.id, name: b.name }))}
      />
    </div>
  );
}
