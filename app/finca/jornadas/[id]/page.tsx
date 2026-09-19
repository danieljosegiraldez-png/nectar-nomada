import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { permissionKeysAnywhere } from "../../../../lib/rbac/service";
import { TraceabilityAccessError } from "../../../../lib/traceability/lots";
import { mostrarInstante } from "../../../../lib/time/mostrarInstante";
import { JornadaError, detalleDeJornada } from "../../../../lib/traceability/jornadasDeCosecha";
import { AnotarEntregaForm, FotoDeEntregaForm } from "../../../components/traceability/AnotarEntregaForm";
import { AnularEntregaForm, CerrarJornadaForm } from "../../../components/traceability/AccionesDeJornada";

export const dynamic = "force-dynamic";

/**
 * Una jornada de cosecha (spec jornada y entrega §3.6): quién va a cada parcela, las entregas que
 * lleva hacia el beneficio, y —con `lot:manage`— anotar, anular con motivo y cerrar. Cada acción
 * la vuelve a autorizar su servicio; aquí sólo se decide qué formulario se ofrece.
 */
export default async function JornadaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  let detalle: Awaited<ReturnType<typeof detalleDeJornada>>;
  try {
    detalle = await detalleDeJornada(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError || error instanceof JornadaError) notFound();
    throw error;
  }
  const { jornada, asignaciones, entregas, origenes } = detalle;
  const t = await getTranslations("Jornadas");
  const gestiona = (await permissionKeysAnywhere(user.userAccountId)).has("lot:manage");
  const abierta = jornada.estado === "abierta";

  const parcelas = [...new Map(asignaciones.map((a) => [a.location.id, a.location])).values()];
  const recolectores = [...new Map(asignaciones.map((a) => [a.person.id, a.person])).values()].map((p) => ({
    personId: p.id,
    nombre: p.displayName,
    parcelaIds: asignaciones.filter((a) => a.person.id === p.id).map((a) => a.location.id),
  }));
  const vigentes = entregas.filter((e) => e.estado === "enviada");
  const totalKg = vigentes.reduce((s, e) => s + Number(e.pesoFincaKg), 0);

  return (
    <div>
      <p>
        <Link href="/finca/jornadas">{t("volver")}</Link>
      </p>
      <h1>{t("jornadaDel", { fecha: jornada.fecha.toISOString().slice(0, 10) })}</h1>
      <p className="nn-detail-meta">
        {jornada.fincaSite.name} · {t(abierta ? "abierta" : "cerrada")}
      </p>
      {jornada.nota ? <p>{jornada.nota}</p> : null}

      <section className="nn-section">
        <h2>{t("asignacionesTitulo")}</h2>
        <ul>
          {parcelas.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong>
              {": "}
              {asignaciones.filter((a) => a.location.id === p.id).map((a) => a.person.displayName).join(", ")}
            </li>
          ))}
        </ul>
      </section>

      <section className="nn-section">
        <h2>{t("entregasTitulo")}</h2>
        <p className="nn-muted">{t("totalFinca", { kg: totalKg.toFixed(1), n: vigentes.length })}</p>
        {entregas.length === 0 ? (
          <p className="nn-muted">{t("sinEntregas")}</p>
        ) : (
          <ul>
            {entregas.map((e) => (
              <li key={e.id}>
                <strong>{e.recolector.displayName}</strong>
                {" — "}
                {e.plotBlock ? t("bloque", { nombre: e.plotBlock.name }) : e.specimen ? t("planta", { nombre: e.specimen.commonName }) : e.location?.name}
                {" — "}
                {t("kg", { kg: Number(e.pesoFincaKg).toFixed(1) })}
                {" — "}
                {mostrarInstante(e.enviadaAt, jornada.fincaSite.timezone)}
                <br />
                <span className="nn-muted">
                  {t("anotadaPor", { nombre: e.anotadaPorNombre ?? "?" })}
                  {" · "}
                  {t("fotos", { n: e._count.assets })}
                  {" · "}
                  {e.estado === "anulada" ? t("anuladaMotivo", { motivo: e.motivoAnulacion ?? "" }) : t("enviada")}
                </span>
                {gestiona && e.estado === "enviada" ? (
                  <>
                    <FotoDeEntregaForm entregaId={e.id} />
                    <AnularEntregaForm entregaId={e.id} jornadaId={jornada.id} />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {gestiona && abierta ? (
        <>
          <section className="nn-section">
            <h2>{t("anotarTitulo")}</h2>
            <AnotarEntregaForm jornadaId={jornada.id} recolectores={recolectores} origenes={{ parcelas, ...origenes }} />
          </section>
          <section className="nn-section">
            <h2>{t("cerrarTitulo")}</h2>
            <p className="nn-muted">{t("cerrarAyuda")}</p>
            <CerrarJornadaForm jornadaId={jornada.id} />
          </section>
        </>
      ) : null}
    </div>
  );
}
