import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "../../../../lib/auth/session";
import { listarInventario } from "../../../../lib/inventario/lista";
import { MovimientosDeLote } from "../../../components/inventario/MovimientosDeLote";

export const dynamic = "force-dynamic";

/**
 * Un lote del inventario, con lo que se puede hacerle.
 *
 * **Existe porque `/inventario` reclamaba sin ofrecer dónde.** La lista imprime
 * «hay que cuadrarlo» y «nadie sabe todavía cuánto hay» desde el 2026-09-17, y
 * las ocho funciones de `lib/inventario/` que atienden eso no tenían pantalla —
 * medido el 2026-10-04. Esto cierra cuatro de las ocho: contar, cuadrar, botar y
 * perder. Consumir ya tiene puerta por las intervenciones; custodia y foto de
 * etiqueta son otras piezas.
 *
 * **La lista se queda lista y los formularios viven aquí.** Decisión 5 de Daniel
 * del 2026-09-18: «el tablero es sólo para mirar; cada "registrar" es un botón
 * que lleva a su pantalla». Meterlos en la tabla sería exactamente lo que se
 * quejó de las pantallas que amontonan.
 *
 * **No hay lector nuevo.** Se reusa `listarInventario`, que ya aplica el permiso:
 * un lote que no esté en lo que esta cuenta puede ver es un 404, sin una rama de
 * autorización propia que pudiera discrepar de la de la lista.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Inventario");
  const materiales = await listarInventario(user.userAccountId);
  const material = materiales.find((m) => m.lotes.some((l) => l.id === id));
  const lote = material?.lotes.find((l) => l.id === id);
  if (!material || !lote) notFound();

  return (
    <main className="nn-page">
      <p className="nn-detail-meta">
        <Link href="/inventario">{t("volverALista")}</Link>
      </p>
      <h1>
        {material.name} · {lote.batchLabel}
      </h1>

      <section className="nn-section">
        <h2>{t("loteEstadoTitulo")}</h2>
        <ul>
          <li>
            {t("colRecibido")}: {lote.receivedAt.toISOString().slice(0, 10)}
          </li>
          {/* «Nunca contado» NO pinta un cero, igual que en la lista: un cero aquí
              sería la afirmación contraria a la que el sistema puede hacer. */}
          <li>
            {t("colQueda")}: {lote.recorded ? `${lote.quantity} ${lote.unit ?? ""}` : t("estadoSinContar")}
          </li>
          {lote.requiereReconciliacion ? <li className="nn-alerta nn-alerta-aviso">{t("estadoPorCuadrar")}</li> : null}
        </ul>
      </section>

      <MovimientosDeLote consumableLotId={lote.id} unidad={lote.unit ?? ""} />
    </main>
  );
}
