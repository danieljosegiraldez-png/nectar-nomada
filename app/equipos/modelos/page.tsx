import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "../../../lib/auth/session";
import { listarModelos, puedeCrearCompartido, sitiosParaCatalogo, type ModeloEnLista } from "../../../lib/equipos/modelos";
import type { EquipmentKind } from "../../../generated/prisma/client";

export const dynamic = "force-dynamic";

const TIPOS: readonly EquipmentKind[] = ["instrument", "vessel", "tool", "machine"];

function esTipo(v: string | undefined): v is EquipmentKind {
  return TIPOS.includes(v as EquipmentKind);
}

function tabla(t: Awaited<ReturnType<typeof getTranslations>>, filas: ModeloEnLista[]) {
  return (
    <table className="nn-table">
      <thead>
        <tr>
          <th>{t("campoFabricante")}</th>
          <th>{t("campoModelo")}</th>
          <th>{t("campoTipo")}</th>
          <th>{t("modeloEquipos")}</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((m) => (
          <tr key={m.id}>
            <td>{m.manufacturer}</td>
            <td>
              <Link href={`/equipos/modelos/${m.id}`}>{m.modelName}</Link>
              {m.retiredAt ? ` — ${t("modeloRetirado")}` : null}
            </td>
            <td>{t(`tipo_${m.kind}`)}</td>
            <td>{m.equipos}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * El catálogo de modelos de equipo (spec de catálogos §3.1-3.2): los
 * **compartidos** y los de cada organización cuyos sitios quien mira puede ver
 * (`lib/catalogos/propiedad.ts`). Un modelo es una FICHA de fabricante —«ATAGO
 * PAL-1»—, no un equipo concreto; cuántos equipos lo usan es la única columna
 * que cuenta algo del inventario real.
 */
export default async function ModelosPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; retirados?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const kind = esTipo(sp.kind) ? sp.kind : undefined;
  const incluirRetirados = sp.retirados === "1";

  const [t, { compartidos, propios }, sitiosDelCatalogo, puedeCompartido] = await Promise.all([
    getTranslations("Equipos"),
    listarModelos(user.userAccountId, { kind, incluirRetirados }),
    sitiosParaCatalogo(user.userAccountId),
    puedeCrearCompartido(user.userAccountId),
  ]);
  const puedeCrearModelo = puedeCompartido || sitiosDelCatalogo.length > 0;

  const qs = (siguiente: { kind?: EquipmentKind; retirados?: boolean }) => {
    const params = new URLSearchParams();
    const k = "kind" in siguiente ? siguiente.kind : kind;
    const r = "retirados" in siguiente ? siguiente.retirados : incluirRetirados;
    if (k) params.set("kind", k);
    if (r) params.set("retirados", "1");
    const texto = params.toString();
    return texto ? `?${texto}` : "";
  };

  const vacio = compartidos.length === 0 && propios.length === 0;

  return (
    <div>
      <p>
        <Link href="/equipos">← {t("volver")}</Link>
      </p>
      <h1>{t("modelosTitulo")}</h1>
      <p className="nn-muted">{t("modelosIntro")}</p>

      <p style={{ marginTop: "1rem" }}>
        {/* Daniel, 2026-09-27: lo que no puedes hacer no se muestra, y no se explica. Mismos dos
            predicados que usa `/equipos/modelos/nuevo` para decidir si pinta su formulario. */}
        {puedeCrearModelo ? (
        <Link href="/equipos/modelos/nuevo" className="nn-button" style={{ display: "inline-block", textDecoration: "none" }}>
          {t("modeloNuevo")}
        </Link>
        ) : null}
      </p>

      <p className="nn-muted" style={{ marginTop: "1rem" }}>
        <Link href={`/equipos/modelos${qs({ kind: undefined })}`}>{t("filtroTodos")}</Link>
        {TIPOS.map((k) => (
          <span key={k}>
            {" · "}
            <Link href={`/equipos/modelos${qs({ kind: k })}`}>{t(`tipo_${k}`)}</Link>
          </span>
        ))}
        {" — "}
        {incluirRetirados ? (
          <Link href={`/equipos/modelos${qs({ retirados: false })}`}>{t("ocultarRetirados")}</Link>
        ) : (
          <Link href={`/equipos/modelos${qs({ retirados: true })}`}>{t("mostrarRetirados")}</Link>
        )}
      </p>

      {vacio ? (
        <p className="nn-muted" style={{ marginTop: "1.5rem" }}>
          {t("modelosVacio")}
        </p>
      ) : null}

      {compartidos.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("modelosCompartidos")}</h2>
          {tabla(t, compartidos)}
        </section>
      ) : null}

      {propios.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("modelosPropios")}</h2>
          {tabla(t, propios)}
        </section>
      ) : null}
    </div>
  );
}
