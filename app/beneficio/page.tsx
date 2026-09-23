import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { listarBeneficios } from "../../lib/traceability/beneficios";
import { AvisoDeRutina } from "../components/rutinas/AvisoDeRutina";
import { RutinasDeLugar } from "../components/rutinas/RutinasDeLugar";
import { NavegacionBeneficio } from "../components/beneficio/NavegacionBeneficio";
import { destinosDelBeneficio } from "./destinos";

export const dynamic = "force-dynamic";

/**
 * La sección Beneficio: una página índice, sin formularios.
 *
 * **Por qué existe ya, antes que el tablero.** El 2026-09-17 Daniel decidió que el
 * menú dijera «Beneficio» y no «Lotes», y que los lotes, las recetas, las
 * instalaciones y los equipos colgaran de ahí. El tablero del beneficio (spec #363)
 * es quien acabará ocupando esta ruta; hasta entonces, esta página es el índice de
 * la sección. Las rutas de dentro NO se mueven: mudarlas antes de que exista el
 * tablero obligaría a mudarlas dos veces.
 *
 * **Sin formularios, a propósito.** Esta ruta es la de operar, y la configuración
 * vive aparte en `/beneficio/ajustes` (spec #370). Un índice de enlaces cumple esa
 * separación sin necesidad de guardia todavía; el guardia llega con el tablero.
 *
 * **Cada enlace sólo aparece si quien mira puede usarlo**, con la misma pregunta
 * ancha que ya hace la navegación (`permissionKeysAnywhere`): ofrecer lo que el
 * servidor va a rechazar es el fallo que S2 §4 nombra. La autorización de verdad
 * sigue en cada destino.
 */
export default async function BeneficioPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const granted = await permissionKeysAnywhere(user.userAccountId);
  // La misma regla que la entrada del menú: quien no ve lotes no tiene sección.
  if (!granted.has("lot:view") && !granted.has("lot:manage")) notFound();

  const t = await getTranslations("SeccionBeneficio");
  // Qué enlace ve cada perfil lo decide `destinosDelBeneficio`, que tiene su prueba.
  const destinos = destinosDelBeneficio(granted);

  // Las rutinas de cada beneficio (spec 2026-09-19 §5/§6). `rutaDeLugar()`
  // manda de vuelta aquí, a `/beneficio` a secas, así que el aviso de
  // `?ok=`/`?error=` vive en esta página y no en una de detalle.
  //
  // `listarBeneficios` filtra por `location:manage_attributes`, no por
  // `equipment:report_condition` (la faena que de verdad hace falta para
  // apuntar una rutina). Con los perfiles de serie coinciden — Farm Manager y
  // Farm Operator llevan los dos permisos juntos (`lib/rbac/catalog.ts`) — pero
  // una cuenta con `report_condition` sobre un beneficio SIN
  // `manage_attributes` ahí (una concesión estrecha por asignación) no vería
  // esta sección para ese beneficio, aunque `RutinasDeLugar` sí la dejaría
  // apuntar si llegara por otra vía. `RutinasDeLugar` vuelve a comprobar su
  // propio `view` de todas formas, así que reusar esta lista no abre nada de
  // más — sólo puede quedarse corta en ese caso estrecho.
  const [tEq, { ok, error }, beneficios] = await Promise.all([
    getTranslations("Equipos"),
    searchParams,
    listarBeneficios(user.userAccountId),
  ]);
  const operaciones = destinos.filter((d) => d.href === "/beneficio/recepcion" || d.href === "/beneficio/pedidos");
  const herramientas = destinos.filter((d) => !operaciones.includes(d));

  return (
    <div className="nn-mill-page">
      <header className="nn-mill-header">
        <div><h1>{t("titulo")}</h1><p>{t("intro")}</p></div>
      </header>
      <NavegacionBeneficio userAccountId={user.userAccountId} actual="/beneficio" />
      <section className="nn-mill-primary" aria-labelledby="operaciones-beneficio">
        <h2 id="operaciones-beneficio">{t("operaciones")}</h2>
        <div>
          {operaciones.map((d) => (
            <Link key={d.href} href={d.href} className="nn-mill-action">
              <strong>{t(d.clave)}</strong>
              <span>{t(`${d.clave}Ayuda`)}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="nn-mill-tools" aria-labelledby="herramientas-beneficio">
        <h2 id="herramientas-beneficio">{t("herramientas")}</h2>
        <div>
          {herramientas.map((d) => (
            <Link key={d.href} href={d.href}>
              <strong>{t(d.clave)}</strong>
              <span>{t(`${d.clave}Ayuda`)}</span>
            </Link>
          ))}
        </div>
      </section>
      <AvisoDeRutina ok={ok} error={error} t={tEq} />
      {beneficios.length > 0 && <section className="nn-mill-routines" aria-labelledby="rutinas-beneficio">
        <h2 id="rutinas-beneficio">{t("rutinas")}</h2>
        {beneficios.map((b) => (
          <details key={b.id} className="nn-disclosure nn-disclosure-compact">
            <summary><span>{b.name}</span><small>{t("rutinasAyuda")}</small></summary>
            <div className="nn-disclosure-body"><RutinasDeLugar userAccountId={user.userAccountId} locationId={b.id} /></div>
          </details>
        ))}
      </section>}
    </div>
  );
}
