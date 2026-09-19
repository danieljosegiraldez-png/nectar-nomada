import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { misEntregas } from "../../lib/traceability/entregasDeCosecha";
import { getCondicionesDelDia, getFieldEventKinds } from "../../lib/traceability/fieldSessionCatalog";
import { mostrarInstante } from "../../lib/time/mostrarInstante";
import { AnotarEntregaForm, FotoDeEntregaForm } from "../components/traceability/AnotarEntregaForm";
import { FotoDeSituacionForm, ReportarSituacionForm } from "../components/traceability/ReportarSituacionForm";

export const dynamic = "force-dynamic";

/**
 * «Mis entregas», la pantalla del recolector con cuenta (spec jornada y entrega §3.6). Pensada para
 * el celular: una columna. Por cada jornada abierta donde está asignado, anotar su entrega y
 * reportar algo del campo; debajo, SUS entregas y nada de otros (`misEntregas` sólo lee las de
 * su propia Person). Cada acción la vuelve a autorizar su servicio.
 */
export default async function MisEntregasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await permissionKeysAnywhere(user.userAccountId)).has("harvest_delivery:create_own")) notFound();

  const t = await getTranslations("Jornadas");
  const [{ personaId, asignaciones, entregas, origenes }, tipos, condiciones] = await Promise.all([
    misEntregas(user.userAccountId),
    getFieldEventKinds(),
    getCondicionesDelDia(),
  ]);

  const jornadas = [...new Map(asignaciones.map((a) => [a.jornada.id, a.jornada])).values()];

  return (
    <div style={{ maxWidth: 520 }}>
      <h1>{t("misEntregasTitulo")}</h1>
      {jornadas.length === 0 ? <p className="nn-muted">{t("sinJornadaAsignada")}</p> : null}

      {jornadas.map((j) => {
        const mias = asignaciones.filter((a) => a.jornada.id === j.id);
        const parcelaIds = mias.map((a) => a.location.id);
        const parcelas = mias.map((a) => a.location);
        const deLaJornada = { parcelas, ...origenes };
        return (
          <section key={j.id} className="nn-section">
            <h2>{t("jornadaEn", { finca: j.fincaSite.name, fecha: j.fecha.toISOString().slice(0, 10) })}</h2>
            <p className="nn-muted">{t("teToca", { parcelas: parcelas.map((p) => p.name).join(", ") })}</p>
            <h3>{t("anotarMiEntrega")}</h3>
            <AnotarEntregaForm
              jornadaId={j.id}
              propio={personaId}
              recolectores={[{ personId: personaId, nombre: "", parcelaIds }]}
              origenes={deLaJornada}
            />
            <h3>{t("reportarTitulo")}</h3>
            <ReportarSituacionForm jornadaId={j.id} origenes={deLaJornada} parcelaIds={parcelaIds} tipos={tipos} condiciones={condiciones} />
            <h3>{t("fotoDelCampo")}</h3>
            <FotoDeSituacionForm jornadaId={j.id} origenes={deLaJornada} parcelaIds={parcelaIds} />
          </section>
        );
      })}

      <section className="nn-section">
        <h2>{t("misEntregasLista")}</h2>
        {entregas.length === 0 ? (
          <p className="nn-muted">{t("sinEntregas")}</p>
        ) : (
          <ul>
            {entregas.map((e) => (
              <li key={e.id}>
                <strong>{t("kg", { kg: Number(e.pesoFincaKg).toFixed(1) })}</strong>
                {" — "}
                {e.plotBlock ? t("bloque", { nombre: e.plotBlock.name }) : e.specimen ? t("planta", { nombre: e.specimen.commonName }) : e.location?.name}
                {" — "}
                {mostrarInstante(e.enviadaAt, e.jornada.fincaSite.timezone)}
                <br />
                <span className="nn-muted">
                  {t("fotos", { n: e._count.assets })}
                  {" · "}
                  {e.estado === "anulada" ? t("anuladaMotivo", { motivo: e.motivoAnulacion ?? "" }) : t("enviada")}
                </span>
                {e.estado === "enviada" && e.jornada.estado === "abierta" ? <FotoDeEntregaForm entregaId={e.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
