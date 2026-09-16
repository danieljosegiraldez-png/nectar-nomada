import Link from "next/link";
import { redirect } from "next/navigation";

import { clearPermissionOverrideFormAction, setPermissionOverrideFormAction } from "../../../../actions/admin";
import { BotonDeEnvio } from "../../../../components/BotonDeEnvio";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { listAssignmentPermissions } from "../../../../../lib/rbac/admin";

export const dynamic = "force-dynamic";

/**
 * Personalizar los permisos de UNA asignación.
 *
 * **Lo que esta pantalla enseña y ninguna otra podía: de dónde viene cada
 * permiso.** Una lista plana obliga a adivinar qué pasaría si alguien cambia el
 * perfil, y adivinar sobre autorización es como se abren agujeros. Aquí cada fila
 * dice `perfil`, `añadido` o `quitado`.
 *
 * **Y los quitados se enseñan TACHADOS, no desaparecidos.** Que un permiso falte
 * porque alguien lo quitó a propósito es información; borrarlo de la vista lo
 * convertiría en un hueco que el siguiente administrador volvería a llenar sin
 * saber por qué se había vaciado.
 *
 * **Por asignación y no por persona, a propósito.** Un permiso llega por un perfil
 * EN UN ÁMBITO. Si alguien tiene dos asignaciones que lo conceden, quitarlo «de la
 * persona» no querría decir nada — habría que quitarlo en las dos, y esta pantalla
 * hace visible cuál es cuál.
 */
export default async function PermisosDeAsignacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { assignmentId } = await params;
  const { error, ok } = await searchParams;

  let datos;
  try {
    datos = await listAssignmentPermissions(user.userAccountId, assignmentId);
  } catch {
    // Sin permiso de administración, o asignación inexistente: no se distingue a
    // propósito. Decir «existe pero no puedes» ya es decir algo.
    redirect("/admin/users?error=no_access");
  }

  const { asignacion, permisos, disponibles } = datos;
  const quitados = permisos.filter((p) => p.origen === "quitado");
  const vigentes = permisos.filter((p) => p.origen !== "quitado");

  return (
    <div>
      <p>
        <Link href="/admin/users">← Volver a usuarios</Link>
      </p>

      <h1>Permisos de {asignacion.persona}</h1>
      <p className="nn-muted">
        Perfil <strong>{asignacion.perfil}</strong> · ámbito {asignacion.scopeType}
        {asignacion.scopeRefId ? ` ${asignacion.scopeRefId}` : ""}
      </p>

      {error ? <p role="alert">No se pudo guardar: {error}</p> : null}
      {ok ? <p role="status">Guardado.</p> : null}

      <h2>Permisos vigentes ({vigentes.length})</h2>
      <table className="nn-table">
        <thead>
          <tr>
            <th>Permiso</th>
            <th>Viene de</th>
            <th>Razón</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {vigentes.map((p) => (
            <tr key={`${p.resourceType}:${p.action}`}>
              <td>
                <code>
                  {p.resourceType}:{p.action}
                </code>
              </td>
              <td>{p.origen === "perfil" ? "el perfil" : "añadido a mano"}</td>
              <td className="nn-muted">{p.reason ?? "—"}</td>
              <td>
                <form action={setPermissionOverrideFormAction}>
                  <input type="hidden" name="assignmentId" value={asignacion.id} />
                  <input type="hidden" name="permissionId" value={p.permissionId} />
                  <input type="hidden" name="effect" value="deny" />
                  <BotonDeEnvio>Quitar</BotonDeEnvio>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {quitados.length > 0 ? (
        <>
          <h2>Quitados a mano ({quitados.length})</h2>
          <p className="nn-muted">
            El perfil los concede y aquí se han retirado. Se enseñan para que nadie
            los lea como un hueco del perfil.
          </p>
          <ul>
            {quitados.map((p) => (
              <li key={`${p.resourceType}:${p.action}`}>
                <s>
                  <code>
                    {p.resourceType}:{p.action}
                  </code>
                </s>{" "}
                <form action={clearPermissionOverrideFormAction} style={{ display: "inline" }}>
                  <input type="hidden" name="assignmentId" value={asignacion.id} />
                  <input type="hidden" name="overrideId" value={p.overrideId ?? ""} />
                  <BotonDeEnvio>Devolver</BotonDeEnvio>
                </form>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2>Añadir un permiso que el perfil no concede</h2>
      <p className="nn-muted">
        La razón es obligatoria. Dentro de un año, «por qué esta persona tiene un
        permiso que su perfil no le da» es la pregunta que nadie sabrá contestar sin
        ella.
      </p>
      <form action={setPermissionOverrideFormAction} className="nn-form">
        <input type="hidden" name="assignmentId" value={asignacion.id} />
        <input type="hidden" name="effect" value="grant" />
        <label>
          Permiso
          <select name="permissionId" required>
            {disponibles.map((d) => (
              <option key={d.id} value={d.id}>
                {d.resourceType}:{d.action}
              </option>
            ))}
          </select>
        </label>
        <label>
          Razón
          <input type="text" name="reason" required maxLength={300} />
        </label>
        <BotonDeEnvio>Añadir</BotonDeEnvio>
      </form>
    </div>
  );
}
