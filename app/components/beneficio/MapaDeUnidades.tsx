import { getTranslations } from "next-intl/server";
import type { CeldaDelMapa } from "../../../lib/beneficio/tablero";

interface Textos {
  readonly libre: string;
  readonly sinNombre: string;
  readonly loteNoVisible: string;
  readonly motivos: Readonly<Record<string, string>>;
}

function Grupo({
  titulo,
  vacio,
  celdas,
  textos,
}: {
  titulo: string;
  vacio: string;
  celdas: readonly CeldaDelMapa[];
  textos: Textos;
}) {
  return (
    <div>
      <h3>{titulo}</h3>
      {celdas.length === 0 ? (
        <p className="nn-muted">{vacio}</p>
      ) : (
        <ul className="nn-mapa-celdas">
          {celdas.map((c) => {
            const intervencion = c.motivos.some((m) => m === "CONDICION" || m === "RETIRADO");
            const clase = c.libreYSano
              ? "nn-celda nn-celda-libre"
              : intervencion
                ? "nn-celda nn-celda-intervencion"
                : "nn-celda nn-celda-en-uso";
            return (
              <li key={c.id} className={clase}>
                <strong>{c.nombre ?? textos.sinNombre}</strong>
                <span>{c.libreYSano ? textos.libre : c.motivos.map((m) => textos.motivos[m]).join(" · ")}</span>
                {/*
                  **Ocupada, y su lote no es visible para quien mira.** Va además de los motivos y no
                  en lugar de ellos: `EN_USO` es verdad y es el motivo; esto dice por qué no va a
                  encontrar el lote si lo busca. Sin esta línea el campo existiría en la API y no
                  llegaría al operario, que es el defecto que Codex encontró en la curva el 2026-10-01.
                */}
                {c.loteNoVisible ? <span className="nn-celda-lote-ajeno">{textos.loteNoVisible}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * El mapa de tanques y camas: cada unidad con su nombre y su estado, en texto.
 *
 * **Sólo en pantalla ancha** (el CSS lo oculta en el celular, donde «¿puedo recibir?» se reduce a
 * dos números). Sale de `ocupacionDelSitio` —la MISMA pasada que los resúmenes—, no de una cuenta
 * hecha aquí: con dos cuentas podrían discrepar, y la que discrepa en silencio dice «libre».
 *
 * **El estado va siempre en palabras**, no sólo en color: un tanque ocupado Y averiado lleva sus
 * dos motivos, que piden dos acciones distintas (uno se resuelve solo; el otro necesita que
 * alguien vaya). El borde se colorea sólo cuando alguien tiene que ir.
 */
export async function MapaDeUnidades({
  tanques,
  camas,
}: {
  tanques: readonly CeldaDelMapa[];
  camas: readonly CeldaDelMapa[];
}) {
  const t = await getTranslations("SeccionBeneficio");
  const textos: Textos = {
    libre: t("unidadLibre"),
    sinNombre: t("unidadSinNombre"),
    loteNoVisible: t("unidadLoteNoVisible"),
    motivos: {
      EN_USO: t("unidadMotivo_EN_USO"),
      RETIRADO: t("unidadMotivo_RETIRADO"),
      CONDICION: t("unidadMotivo_CONDICION"),
    },
  };
  return (
    <div className="nn-mapa">
      <Grupo titulo={t("mapaTanques")} vacio={t("mapaSinTanques")} celdas={tanques} textos={textos} />
      <Grupo titulo={t("mapaCamas")} vacio={t("mapaSinCamas")} celdas={camas} textos={textos} />
    </div>
  );
}
