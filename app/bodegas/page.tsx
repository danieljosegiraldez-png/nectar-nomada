import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { listarBodegas } from "../../lib/traceability/bodegas";
import { vencidasPorLugar } from "../../lib/rutinas/rutinas";
import { diaDeHoy } from "../../lib/time/diaDeHoy";

export const dynamic = "force-dynamic";
export default async function BodegasPage({
  searchParams,
}: {
  searchParams: Promise<{ vencidas?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [t, tEq, { vencidas }] = await Promise.all([
    getTranslations("Bodegas"),
    getTranslations("Equipos"),
    searchParams,
  ]);
  const bodegas = await listarBodegas(user.userAccountId);
  const hoy = diaDeHoy(new Date(), null);
  const vencidasPor = await vencidasPorLugar(user.userAccountId, bodegas.map((b) => b.id), hoy);
  const soloVencidas = vencidas === "1";
  const visibles = soloVencidas ? bodegas.filter((b) => (vencidasPor.get(b.id) ?? 0) > 0) : bodegas;
  return (
    <div>
      <h1>{t("titulo")}</h1>
      <p>{t("intro")}</p>
      <p>
        <Link href="/bodegas/nueva">{t("nueva")}</Link>
        {" · "}
        <Link href={soloVencidas ? "/bodegas" : "/bodegas?vencidas=1"}>{t("soloVencidas")}</Link>
      </p>
      {!visibles.length && <p>{t("sinBodegas")}</p>}
      <ul>
        {visibles.map((b) => {
          const n = vencidasPor.get(b.id) ?? 0;
          return (
            <li key={b.id}>
              {b.padre?.name ?? t("padreNoVisible")} → <Link href={`/bodegas/${b.id}`}>{b.name}</Link>
              {n > 0 && <strong> {tEq("rutinasVencidas", { n })}</strong>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
