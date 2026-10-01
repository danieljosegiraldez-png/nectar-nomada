import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Curva } from "../../../lib/beneficio/curvaDeLote";
import {
  VARIABLES_DE_CURVA,
  colocarPuntos,
  juicioDeBanda,
  margenVertical,
  type VariableDeCurva,
} from "../../../lib/beneficio/curvaEnPantalla";

/**
 * La curva de un lote contra la banda de su receta, en SVG del servidor.
 *
 * **Sin `"use client"`, sin JavaScript de cliente y sin librería de gráficas**: el proyecto no
 * trae ninguna y el único otro `<svg>` de `app/` es la rueda sensorial. Todo es geometría que ya
 * calculó `curvaDeLote`; aquí sólo se pinta. Elegir variable es un enlace (`?lote=…&variable=…`),
 * no un estado de cliente.
 *
 * ## Por qué este `<svg>` NO recorta lo que se salió de la receta
 *
 * `curvaDeLote` no recorta los puntos al lienzo **a propósito**: una lectura fuera de la banda
 * queda con `y < 0` o `y > alto`, porque recortarla escondería justo la que se salió de la receta,
 * que es la más importante. Un `<svg>` recorta a su `viewBox` por omisión, así que sin cuidado el
 * trabajo de esa pieza se perdería en la última pulgada. Se hacen tres cosas, y se dicen:
 *
 * 1. **`viewBox` ampliado con un margen vertical** (`margenVertical`, la mitad del alto, arriba y
 *    abajo). Una lectura que se pasa hasta media banda por cada lado se dibuja **en su sitio
 *    verdadero**, fuera de la banda pero dentro del dibujo. Se eligió el `viewBox` ampliado, y no sólo
 *    `overflow: visible`, porque un valor 50 veces mayor que el máximo pintaría por encima de la
 *    página entera.
 * 2. **Más allá del margen, el punto se ancla en el borde con un triángulo** (`colocarPuntos`) y
 *    el texto cuenta cuántos son. No se recorta en silencio: se enseña, con un símbolo propio.
 * 3. **`overflow: visible` en el propio `<svg>` (`style`) y, de refuerzo, en el CSS
 *    (`.nn-curva-svg`)**, sólo como cinturón: el trazo y el
 *    marcador de un punto pegado al borde no se cortan por la mitad.
 *
 * Las lecturas fuera de la banda usan un rombo, no sólo otro color: quien no distingue el rojo
 * del ocre también las ve. Y el texto de debajo las cuenta.
 *
 * **Con la receta al revés (`minValue > maxValue`) tampoco se dibuja banda** (`banda_al_reves`):
 * saldría idéntica a la de una receta buena y la curva, espejada, sin un solo aviso. Se dice que la
 * receta está mal cargada, no se cuenta ninguna lectura «fuera», y los puntos se escalan contra sus
 * propios datos para que «hacia arriba, el valor más alto» siga siendo cierto.
 *
 * **Sin banda no se inventa una.** Con `sin_objetivo_declarado` se dibujan los puntos igual y se
 * dice que esa variable no tiene rango declarado en la receta —el diseño exige decirlo, no
 * callarlo—, y además que la escala va de la menor a la mayor lectura, para que una línea que sube
 * de borde a borde no se lea como una alarma.
 */
export async function CurvaDeLote({
  pedida,
  curva,
  codigoDelLote,
}: {
  /** Lo que pidió la URL. `null` = nadie tocó un lote. */
  pedida: { readonly lotId: string; readonly variable: VariableDeCurva } | null;
  /** Lo que devolvió `datosDelTablero`. `null` con `pedida` = ese lote no es visible o no existe. */
  curva: Curva | null;
  /** El código del lote si se conoce; si no, se dice «el lote elegido». */
  codigoDelLote: string | null;
}) {
  const t = await getTranslations("SeccionBeneficio");

  // Nadie tocó un lote. En el celular el CSS oculta esto: «la curva sólo al tocar un lote».
  if (pedida === null) {
    return (
      <section className="nn-tablero-curva nn-curva-reposo" aria-labelledby="curva-beneficio">
        <h2 id="curva-beneficio">{t("curvaTituloGeneral")}</h2>
        <p className="nn-empty">{t("curvaTocaUnLote")}</p>
      </section>
    );
  }

  const nombreVariable = t(`curvaVariable_${pedida.variable}`);
  const lote = codigoDelLote ?? t("curvaLoteElegido");

  const variables = (
    <nav className="nn-curva-variables" aria-label={t("curvaElegirVariable")}>
      {VARIABLES_DE_CURVA.map((v) => (
        <Link
          key={v}
          href={`/beneficio?lote=${pedida.lotId}&variable=${v}#curva-beneficio`}
          aria-current={v === pedida.variable ? "true" : undefined}
        >
          {t(`curvaVariable_${v}`)}
        </Link>
      ))}
    </nav>
  );

  // Ese lote no se ve, o no existe: las dos cosas callan igual a propósito — decir «existe pero no
  // lo ves» enseñaría que existe.
  if (curva === null) {
    return (
      <section className="nn-tablero-curva" aria-labelledby="curva-beneficio">
        <h2 id="curva-beneficio">{t("curvaTituloGeneral")}</h2>
        <p className="nn-empty">{t("curvaNoDisponible")}</p>
        <Link href="/beneficio" className="nn-curva-cerrar">{t("curvaCerrar")}</Link>
      </section>
    );
  }

  const margen = margenVertical(curva.alto);
  const PAD_X = 10; // para que un punto en x = 0 o x = ancho no quede cortado por la mitad
  const puntos = colocarPuntos(curva, margen);
  const banda = curva.banda;
  // Qué se puede afirmar sobre las lecturas y la banda: lo decide UNA función (ver `JuicioDeBanda`).
  const juicio = juicioDeBanda(curva, puntos);
  const fueraDeEscala = puntos.filter((p) => p.fuera !== null).length;

  const titulo = t("curvaTitulo", { variable: nombreVariable, lote });
  const resumen = t("curvaLecturas", { n: puntos.length });

  return (
    <section className="nn-tablero-curva" aria-labelledby="curva-beneficio">
      <h2 id="curva-beneficio">{titulo}</h2>
      {variables}

      {puntos.length === 0 ? (
        <p className="nn-empty">{t("curvaSinLecturas", { variable: nombreVariable })}</p>
      ) : null}

      <svg
        className="nn-curva-svg"
        // En el propio elemento y no sólo en el CSS: lo que se pinta lo lleva, y ningún override de
        // hoja de estilos ni un cambio de clase se lo quita (una prueba de render sí lo ve).
        style={{ overflow: "visible" }}
        role="img"
        aria-labelledby="curva-svg-titulo curva-svg-desc"
        viewBox={`${-PAD_X} ${-margen} ${curva.ancho + 2 * PAD_X} ${curva.alto + 2 * margen}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id="curva-svg-titulo">{titulo}</title>
        <desc id="curva-svg-desc">
          {resumen}
          {juicio.tipo === "juzgada" ? ` · ${t("curvaFueraDeBanda", { n: juicio.fuera })}` : null}
          {juicio.tipo === "sin_banda" ? ` · ${t("curvaSinBandaCorto")}` : null}
          {juicio.tipo === "banda_de_ancho_cero" ? ` · ${t("curvaBandaAnchoCeroCorto")}` : null}
          {juicio.tipo === "banda_al_reves" ? ` · ${t("curvaBandaAlRevesCorto")}` : null}
        </desc>

        <rect className="nn-curva-lienzo" x={0} y={0} width={curva.ancho} height={curva.alto} />
        {banda.tipo === "banda" ? (
          <>
            <rect
              className="nn-curva-banda"
              x={0}
              y={Math.min(banda.yMin, banda.yMax)}
              width={curva.ancho}
              height={Math.max(Math.abs(banda.yMin - banda.yMax), 1)}
            />
            {banda.yObjetivo !== null ? (
              <line className="nn-curva-objetivo" x1={0} x2={curva.ancho} y1={banda.yObjetivo} y2={banda.yObjetivo} />
            ) : null}
          </>
        ) : null}

        {puntos.length > 1 ? (
          <polyline className="nn-curva-linea" fill="none" points={puntos.map((p) => `${p.x},${p.y}`).join(" ")} />
        ) : null}

        {puntos.map((p, i) =>
          p.fuera !== null ? (
            // Triángulo en el borde, apuntando hacia donde quedó el dato.
            <polygon
              key={i}
              className="nn-curva-punto nn-curva-punto-lejos"
              points={
                p.fuera === "arriba"
                  ? `${p.x},${p.y - 7} ${p.x - 6},${p.y + 5} ${p.x + 6},${p.y + 5}`
                  : `${p.x},${p.y + 7} ${p.x - 6},${p.y - 5} ${p.x + 6},${p.y - 5}`
              }
            />
          ) : p.fueraDeBanda === true ? (
            <polygon
              key={i}
              className="nn-curva-punto nn-curva-punto-fuera"
              points={`${p.x},${p.y - 6} ${p.x + 6},${p.y} ${p.x},${p.y + 6} ${p.x - 6},${p.y}`}
            />
          ) : (
            <circle key={i} className="nn-curva-punto" cx={p.x} cy={p.y} r={4.5} />
          ),
        )}
      </svg>

      {juicio.tipo === "sin_banda" ? (
        <p className="nn-warn nn-curva-sin-banda">{t("curvaSinBanda")}</p>
      ) : juicio.tipo === "banda_de_ancho_cero" ? (
        // **No se afirma «todas dentro»**: con min = max la escala no distingue valores.
        <p className="nn-warn nn-curva-ancho-cero">{t("curvaBandaAnchoCero")}</p>
      ) : juicio.tipo === "banda_al_reves" ? (
        // **No se dibuja la banda ni se cuenta nada «fuera»**: con min > max la banda saldría igual
        // que la de una receta buena y la curva, espejada. Se dice que la receta está mal cargada.
        <p className="nn-warn nn-curva-al-reves">{t("curvaBandaAlReves")}</p>
      ) : (
        <>
          {banda.tipo === "banda" ? (
            <p className="nn-muted">
              {banda.yObjetivo !== null ? t("curvaBandaConObjetivo") : t("curvaBandaSinObjetivo")}
            </p>
          ) : null}
          {/* Con cero lecturas no se dice nada del rango: «no hay curva que dibujar» ya está arriba. */}
          {juicio.tipo === "juzgada" ? (
            <p className={juicio.fuera > 0 ? "nn-warn" : "nn-muted"}>
              {juicio.fuera > 0 ? t("curvaFueraDeBanda", { n: juicio.fuera }) : t("curvaTodasDentro")}
            </p>
          ) : null}
        </>
      )}
      {fueraDeEscala > 0 ? <p className="nn-muted">{t("curvaFueraDeEscala", { n: fueraDeEscala })}</p> : null}
      <p className="nn-muted">{resumen} · {t("curvaEjes")}</p>
      <Link href="/beneficio" className="nn-curva-cerrar">{t("curvaCerrar")}</Link>
    </section>
  );
}
