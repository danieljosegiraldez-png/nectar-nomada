import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { crearProveedorDeEquiposFormAction } from "../../../actions/equipos";
import { BotonDeEnvio } from "../../../components/BotonDeEnvio";
import { getCurrentUser } from "../../../../lib/auth/session";
import { puedeCrearProveedorDeEquipos } from "../../../../lib/equipos/proveedores";

export const dynamic = "force-dynamic";

/**
 * Dar de alta un proveedor de equipos (ADR-188).
 *
 * **Por qué una pantalla propia y no un formulario dentro del de registro**: el desplegable de
 * proveedor vive DENTRO del `<form>` de `/equipos/nuevo`, y un `<form>` dentro de otro no es HTML
 * válido. La casa ya resolvió exactamente esto para los modelos —enlace a
 * `/equipos/modelos/nuevo?volverA=…` y vuelta con el id preseleccionado—, así que se copia ese
 * camino en vez de inventar otro.
 *
 * **El permiso se mira también aquí, no sólo en el servicio.** La frontera sigue siendo el servicio
 * (SECURITY.md §2) y allí se vuelve a comprobar; esto es para no ofrecer un formulario que iba a
 * acabar en `sin_permiso`, porque el ámbito es de plataforma y casi nadie lo tiene. Mismo precedente
 * que `/equipos/modelos/nuevo` con `modeloNuevoSinPermiso`. Y `volverA` se acota para que no haya
 * redirecciones abiertas.
 */
export default async function ProveedorDeEquiposNuevoPage({
  searchParams,
}: {
  searchParams: Promise<{ volverA?: string; error?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, sp, puede] = await Promise.all([
    getTranslations("Equipos"),
    searchParams,
    puedeCrearProveedorDeEquipos(user.userAccountId),
  ]);

  const volverA = sp.volverA?.startsWith("/equipos/nuevo") ? sp.volverA : null;
  // El código viene de la URL: sólo se acepta la forma que la acción produce, nunca texto libre.
  const codigoError = sp.error && /^[a-z_]+$/.test(sp.error) ? sp.error : null;

  const volver = (
    <p>
      <Link href={volverA ?? "/equipos"}>← {volverA ? t("proveedorVolverAlRegistro") : t("volver")}</Link>
    </p>
  );

  // Daniel, 2026-09-27: sin permiso esta pantalla no existe — 404, sin explicar. Esta página llegó
  // a `main` el mismo día, de otra sesión, con la disculpa que el resto acaba de perder; el guardia
  // la cazó al fusionar y se cierra igual, que es exactamente para lo que se escribió el guardia.
  if (!puede) notFound();

  return (
    <div>
      {volver}
      <h1>{t("proveedorNuevo")}</h1>
      <p className="nn-muted">{t("proveedorNuevoIntro")}</p>

      {codigoError ? (
        <p className="nn-error" role="alert">
          {codigoError === "proveedor_repetido"
            ? t("errorProveedorRepetido")
            : codigoError === "nombre_invalido"
              ? t("errorProveedorNombre")
              : codigoError === "sin_permiso"
                ? t("errorSinPermiso")
                : t("errorModeloGenerico", { codigo: codigoError })}
        </p>
      ) : null}

      {sp.ok === "creado" ? (
        <p className="nn-ok" role="status">
          {t("proveedorCreado")}
        </p>
      ) : null}

      <form action={crearProveedorDeEquiposFormAction}>
        {volverA ? <input type="hidden" name="volverA" value={volverA} /> : null}
        <label>
          {t("campoProveedorNombre")}
          <input type="text" name="nombre" required maxLength={120} />
        </label>
        <BotonDeEnvio>{t("proveedorNuevo")}</BotonDeEnvio>
      </form>
    </div>
  );
}
