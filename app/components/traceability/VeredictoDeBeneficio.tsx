import { getTranslations } from "next-intl/server";

import type { SinVeredicto, VeredictoDeFase } from "../../../lib/beneficio/desdeElLote";

/**
 * Lo que los motores de beneficio dicen de la fase abierta de este lote.
 *
 * **Pregunta, no ordena.** Los umbrales son `[PROVISIONAL]` mientras la decisión
 * **P-F** siga abierta, y aunque no lo fueran: mandar a lavar un lote es de
 * quien está frente al tanque, que ve el olor, el color y la espuma que ningún
 * motor mide. Por eso no hay un solo texto imperativo aquí.
 *
 * **Y dice por qué NO hay veredicto cuando no lo hay.** «Este lote no declara
 * qué protocolo corre» y «este lote va bien» son hechos distintos; pintarlos
 * igual —o pintar sólo el segundo— es lo que convierte un instrumento en un
 * adorno. Esa es la razón de que el tipo sea `VeredictoDeFase | SinVeredicto` y
 * no un opcional.
 *
 * **Las limitaciones se enseñan.** Un veredicto cuyo origen no se puede auditar
 * no vale más que una corazonada, y aquí hay tres cosas que nuestro modelo no
 * guarda —punto de muestreo, puntos de cama, actividad de agua—. Callarlas haría
 * parecer completo un juicio que no lo es.
 */
export async function VeredictoDeBeneficio({ veredicto }: { veredicto: VeredictoDeFase | SinVeredicto }) {
  // Componente de SERVIDOR: la traducción se pide con `getTranslations`,
  // que es lo que hace su vecino inmediato en esta misma sección.
  const t = await getTranslations("Beneficio");

  if (typeof veredicto === "string") {
    return (
      <p className="nn-muted" style={{ marginBottom: "1rem" }}>
        {t(`sinVeredicto_${veredicto}` as "sinVeredicto_SIN_LECTURAS")}
      </p>
    );
  }

  const estados = [
    veredicto.ph ? { clave: "ph", estado: veredicto.ph.status, severidad: veredicto.ph.severity } : null,
    veredicto.brix ? { clave: "brix", estado: veredicto.brix.status, severidad: veredicto.brix.severity } : null,
    veredicto.secado ? { clave: "secado", estado: veredicto.secado.status, severidad: veredicto.secado.severity } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
      <h3 style={{ margin: 0 }}>{t("veredictoHeading")}</h3>
      <p className="nn-muted">{t("perfilEnUso", { perfil: veredicto.perfil.key })}</p>

      <ul>
        {estados.map((e) => (
          <li key={e.clave}>
            {/* La severidad va en PALABRA, no sólo en color: bajo sol directo el
                color miente, y el brief de campo lo prohíbe expresamente. */}
            <strong>{t(`variable_${e.clave}` as "variable_ph")}</strong>
            {" — "}
            {t(`estado_${e.estado}` as "estado_DRYING_NORMAL")}
            {e.severidad !== "INFO" ? ` · ${t(`severidad_${e.severidad}` as "severidad_WARNING")}` : null}
          </li>
        ))}
      </ul>

      {veredicto.limitaciones.length > 0 ? (
        <p className="nn-muted">
          {t("limitacionesPrefijo")}{" "}
          {veredicto.limitaciones.map((l) => t(`limitacion_${l}` as "limitacion_SIN_PUNTO_DE_MUESTREO")).join(" · ")}
        </p>
      ) : null}

      <p className="nn-muted">{t("umbralesProvisionales")}</p>
    </div>
  );
}
