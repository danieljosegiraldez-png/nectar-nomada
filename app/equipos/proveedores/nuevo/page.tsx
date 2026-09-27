import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { crearProveedorDeEquiposFormAction } from "../../../actions/equipos";
import { BotonDeEnvio } from "../../../components/BotonDeEnvio";
import { getCurrentUser } from "../../../../lib/auth/session";

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
 * **No se comprueba el permiso aquí.** La frontera es el servicio (SECURITY.md §2): quien no lo
 * tenga verá el formulario y recibirá `sin_permiso` al enviarlo, igual que en el resto de las
 * pantallas de equipos. Lo que sí se acota es `volverA`, para que no haya redirecciones abiertas.
 */
export default async function ProveedorDeEquiposNuevoPage({
  searchParams,
}: {
  searchParams: Promise<{ volverA?: string; error?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, sp] = await Promise.all([getTranslations("Equipos"), searchParams]);

  const volverA = sp.volverA?.startsWith("/equipos/nuevo") ? sp.volverA : null;
  // El código viene de la URL: sólo se acepta la forma que la acción produce, nunca texto libre.
  const codigoError = sp.error && /^[a-z_]+$/.test(sp.error) ? sp.error : null;

  return (
    <div>
      <p>
        <Link href={volverA ?? "/equipos"}>← {volverA ? t("proveedorVolverAlRegistro") : t("volver")}</Link>
      </p>
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
