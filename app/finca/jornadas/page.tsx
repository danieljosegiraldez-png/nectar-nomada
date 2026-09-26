import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { permissionKeysAnywhere } from "../../../lib/rbac/service";
import { COOKIE_FINCA, fincaDeLaPagina, idsBajoLaFinca, ordenarParcelas } from "../../../lib/traceability/fincas";
import { getManageableContext, getObserverCandidates, TraceabilityAccessError } from "../../../lib/traceability/lots";
import { beneficiosDeDestino, jornadasDeFinca, recolectoresDeFinca } from "../../../lib/traceability/jornadasDeCosecha";
import { FincaElegida } from "../../components/traceability/FincaElegida";
import { AbrirJornadaForm, AgregarRecolectorForm, DarDeBajaRecolectorForm } from "../../components/traceability/AbrirJornadaForm";

export const dynamic = "force-dynamic";

/**
 * Las jornadas de cosecha de la finca elegida (spec 2026-09-18 jornada y entrega §3.6). En la finca
 * no se registra la cosecha: se dice qué está listo y quién va a cada parcela, y las entregas salen
 * de la jornada hacia el beneficio.
 *
 * Leer exige `lot:view` sobre la finca (lo comprueba `jornadasDeFinca`); abrir y añadir
 * recolectores, `lot:manage`, que vuelve a exigir el servicio.
 */
export default async function JornadasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const granted = await permissionKeysAnywhere(user.userAccountId);
  if (!granted.has("lot:view") && !granted.has("lot:manage")) notFound();

  const finca = await fincaDeLaPagina(user.userAccountId, (await cookies()).get(COOKIE_FINCA)?.value);
  if (finca.debeElegir) redirect("/fincas?volver=/finca/jornadas");
  const t = await getTranslations("Jornadas");
  if (!finca.elegida) {
    return (
      <div>
        <h1>{t("titulo")}</h1>
        <p className="nn-muted">
          {t("eligeUnaFinca")} <Link href="/fincas?volver=/finca/jornadas">{t("elegirFinca")}</Link>
        </p>
      </div>
    );
  }
  const siteId = finca.elegida.siteId;

  let jornadas: Awaited<ReturnType<typeof jornadasDeFinca>>;
  let recolectores: Awaited<ReturnType<typeof recolectoresDeFinca>>;
  try {
    [jornadas, recolectores] = await Promise.all([jornadasDeFinca(user.userAccountId, siteId), recolectoresDeFinca(user.userAccountId, siteId)]);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  const gestiona = granted.has("lot:manage");
  const [contexto, candidatos, destinos] = gestiona
    ? await Promise.all([getManageableContext(user.userAccountId), getObserverCandidates(user.userAccountId, [{ locationId: siteId }]), beneficiosDeDestino(user.userAccountId)])
    : [null, null, []];
  const bajo = contexto ? idsBajoLaFinca(contexto.locations, siteId) : new Set<string>();
  const parcelas = contexto ? ordenarParcelas(contexto.plotLocations.filter((p) => bajo.has(p.id))) : [];
  const yaSon = new Set(recolectores.map((r) => r.personId));

  return (
    <div>
      <h1>{t("titulo")}</h1>
      <FincaElegida elegida={finca.elegida} hayVarias={finca.fincas.length > 1} volver="/finca/jornadas" />
      <p className="nn-muted">{t("intro")}</p>

      <section className="nn-section">
        <h2>{t("listaTitulo")}</h2>
        {jornadas.length === 0 ? (
          <p className="nn-muted">{t("sinJornadas")}</p>
        ) : (
          <ul>
            {jornadas.map((j) => (
              <li key={j.id}>
                <Link href={`/finca/jornadas/${j.id}`}>{j.fecha.toISOString().slice(0, 10)}</Link>
                {" — "}
                {t(j.estado === "abierta" ? "abierta" : "cerrada")}
                {" · "}
                {t("resumen", { asignaciones: j._count.asignaciones, entregas: j._count.entregas })}
              </li>
            ))}
          </ul>
        )}
      </section>

      {gestiona ? (
        <>
          <section className="nn-section">
            <h2>{t("abrirTitulo")}</h2>
            <AbrirJornadaForm fincaSiteId={siteId} parcelas={parcelas.map((p) => ({ id: p.id, name: p.name }))} recolectores={recolectores} beneficios={destinos} />
          </section>
          <section className="nn-section">
            <h2>{t("recolectoresTitulo")}</h2>
            {/* Cada recolector con su baja al lado: un alta sin inverso era el hueco del 2026-09-25. */}
            {recolectores.length ? (
              <ul className="nn-list">
                {recolectores.map((r) => (
                  <li key={r.personId}>
                    <DarDeBajaRecolectorForm fincaSiteId={siteId} personId={r.personId} nombre={r.nombre} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nn-muted">{t("sinRecolectores")}</p>
            )}
            <AgregarRecolectorForm
              fincaSiteId={siteId}
              personas={(candidatos?.people ?? []).filter((p) => !yaSon.has(p.id))}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
