import { getTranslations } from "next-intl/server";
import { elegirBeneficioAction } from "../../actions/recepcionDeCereza";
import { BotonDeEnvio } from "../BotonDeEnvio";

/**
 * «Beneficio: X · cambiar», arriba de Recepción y Pedidos (spec recepción §4). Con uno solo no hay
 * nada que elegir. La elección sólo acota: la página la vuelve a resolver.
 */
export async function BeneficioElegido({
  beneficios,
  elegido,
  volver,
}: {
  beneficios: { id: string; name: string }[];
  elegido: { id: string; name: string } | null;
  volver: string;
}) {
  const t = await getTranslations("Recepcion");
  if (beneficios.length <= 1) return elegido ? <p className="nn-detail-meta">{t("beneficioElegido", { nombre: elegido.name })}</p> : null;
  return (
    <form action={elegirBeneficioAction} className="nn-form">
      <input type="hidden" name="volver" value={volver} />
      <div className="nn-field">
        <label htmlFor="elegir-beneficio">{t("beneficio")}</label>
        <select id="elegir-beneficio" name="beneficio" defaultValue={elegido?.id ?? ""} required>
          <option value="" disabled>{t("elegir")}</option>
          {beneficios.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      <BotonDeEnvio>{t("elegirBoton")}</BotonDeEnvio>
    </form>
  );
}
