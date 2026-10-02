import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Curva } from "../../../lib/beneficio/curvaDeLote";
import { ejesDeLaCurva } from "../../../lib/beneficio/ejesDeLaCurva";
import { riesgoDeEsperar } from "../../../lib/beneficio/riesgoDeEsperar";
import {
  VARIABLES_DE_CURVA,
  colocarPuntos,
  juicioDeBanda,
  margenVertical,
  type VariableDeCurva,
} from "../../../lib/beneficio/curvaEnPantalla";

/** El documento de donde `riesgoDeEsperar` cita, tal como se le nombra a quien pregunta de dónde sale. */
const DOCUMENTO_DEL_RIESGO = "docs/beneficio/10_ph_fermentation.md";

/**
 * Las bandas de `riesgoDeEsperar` que la pantalla PINTA, y cómo. **Lo que no está aquí no se pinta.**
 *
 * - `"tal_cual"`: «con tu última lectura el dato sugiere: <cita>».
 * - `"si_se_estanca"`: la banda `[4.50, 5.20)` es, en el documento, `LAG_PHASE` ANTES de la ventana de
 *   gracia y `STALLED_ROT_HAZARD` DESPUÉS. `riesgoDeEsperar(variable, valor)` no ve la tendencia, y
 *   TODO lote sano pasa por 4,5–5,2 bajando, así que decir «hay proliferación butírica» ahí como un
 *   hecho sería falso para casi todos los lotes. ADR-181 define «estancado» por la tendencia del pH,
 *   no por la banda: la frase va CONDICIONADA («si el pH se estanca…»).
 *
 * **Las dos que se quedan fuera, y por qué** (la tercera, `[6.50, 8.00]`, ni llega: el módulo la
 * devuelve como `null` porque ADR-181 la retiró):
 * - `[3.80, 4.50)` — «Ninguno. Desarrollo ideal de precursores». Escribir «riesgo de esperar:
 *   ninguno» a pH 4,0, a 0,2 de la banda de vigilancia, es falsa seguridad (antipatrón 7 de la
 *   rúbrica 22) y un cero donde falta un registro.
 * - `fuera de [2.50, 8.00]` — «Electrodo dañado». Es un problema del DATO, no del lote, y esperar no
 *   lo cambia: pintarlo como «riesgo de esperar» manda a esperar o a lavar por un sensor roto.
 *
 * Las bandas `[3.30, 3.50)` («Degradación ácida…») y `< 3.30` («Daño consumado») SÍ se pintan, con la
 * cita literal y dentro de la envoltura. Hay una tensión abierta entre esos textos categóricos y la
 * literatura que el propio documento cita; **no se resuelve aquí ni se suaviza el texto**.
 */
const BANDAS_QUE_SE_PINTAN: ReadonlyMap<string, "tal_cual" | "si_se_estanca"> = new Map([
  ["[5.20, 6.50)", "tal_cual"],
  ["[4.50, 5.20)", "si_se_estanca"],
  ["[3.50, 3.80)", "tal_cual"],
  ["[3.30, 3.50)", "tal_cual"],
  ["< 3.30", "tal_cual"],
]);

/**
 * La cita, con la cursiva de su markdown pintada como cursiva: el documento escribe `*stinker*` y
 * unos asteriscos sueltos en pantalla se leerían como un error. Es la ÚNICA transformación; las
 * palabras no se tocan.
 */
function conEnfasis(texto: string) {
  return texto.split(/\*([^*]+)\*/).map((trozo, i) => (i % 2 === 1 ? <em key={i}>{trozo}</em> : trozo));
}

/** La lectura citada, hasta dos decimales y como mínimo uno: `3.0`, `4.8`, `4.85`. Una lectura no se redondea a un decimal. */
function textoDelValor(v: number): string {
  const dos = (Math.round(v * 100) / 100).toFixed(2);
  return dos.endsWith("0") ? Number(dos).toFixed(1) : dos;
}

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
 * **Lo mismo con la banda de ancho cero (`minValue === maxValue`, `banda_de_ancho_cero`):** ni se
 * dibuja banda ni se escala contra ella. Antes todo valor caía a media altura y una serie que
 * variaba salía como una recta plana, junto a un aviso que decía que no se podía juzgar. Los
 * puntos van contra sus propios datos; el aviso y la ausencia de juicio se quedan.
 *
 * ## Los ejes y qué sugiere el dato si se espera
 *
 * **Los ejes** (`ejesDeLaCurva`) rotulan a qué valor está la banda (eje Y: máximo, centro y mínimo;
 * sin banda, los de los datos) y cuánto lleva la fase (eje X: horas desde la primera lectura). Van
 * **dentro del mismo `<svg>`**, así que comparten su `viewBox` y su `overflow: visible`. A la izquierda
 * el `viewBox` se ensancha (`ESPACIO_DE_LOS_VALORES`) para que los números quepan DENTRO del dibujo en
 * vez de depender de `overflow`. Que la marca de un valor cae donde está el punto de ese valor lo
 * prueba `pantalla-del-tablero.test.ts`: `ejesDeLaCurva` repite la escala de `curvaDeLote` y sólo esa
 * prueba las pone frente a frente.
 *
 * **El bloque de riesgo** (`riesgoDeEsperar`) es UNA frase bajo la curva, con la fuente detrás de un
 * toque. Reglas duras, todas del plan y de las rúbricas 21 §4 y 22:
 * - **Sólo pH.** Con Brix o humedad el módulo devuelve `null`, y con `null` no se escribe nada: ni
 *   «todo bien» ni «sin riesgos» — eso sería un cero donde falta un registro.
 * - **Ninguna frase ordena.** «El dato sugiere», nunca «lave ahora».
 * - **Se marca de quién es:** «criterio de Néctar Nómada». La cita va LITERAL, sin traducir (es de un
 *   documento en castellano), y se le entrega al lector dentro de esa envoltura.
 * - **Lo que se cita es la ÚLTIMA lectura** y se dice cuál, para no hacer adivinar de qué habla.
 *
 * **Qué filas de `riesgoDeEsperar` se pintan lo decide la BANDA** (`BANDAS_QUE_SE_PINTAN`), el
 * identificador estable del documento, nunca buscar palabras dentro del texto del riesgo. Una banda
 * que no está en esa lista **no escribe nada**, y por eso una fila nueva del documento no aparece en
 * pantalla hasta que alguien decida que se pinta (la prueba barre las bandas y lo exige).
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
  // A la izquierda caben los números del eje Y (hasta «10.25» a 18 de cuerpo): dentro del dibujo, no por `overflow`.
  const ESPACIO_DE_LOS_VALORES = 52;
  const ejes = ejesDeLaCurva({ lecturas: curva.lecturas, banda: curva.rango, ancho: curva.ancho, alto: curva.alto });
  // Qué sugiere la ÚLTIMA lectura si se espera. `curvaDeLote` las ordena por hora: la última es la más reciente.
  const ultima = curva.lecturas[curva.lecturas.length - 1];
  const riesgo = ultima ? riesgoDeEsperar(pedida.variable, ultima.value) : null;
  const envoltura = riesgo ? BANDAS_QUE_SE_PINTAN.get(riesgo.banda) : undefined;
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
        viewBox={`${-(PAD_X + ESPACIO_DE_LOS_VALORES)} ${-margen} ${curva.ancho + 2 * PAD_X + ESPACIO_DE_LOS_VALORES} ${curva.alto + 2 * margen}`}
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

        {/* Los ejes, debajo de la curva y los puntos: si un rótulo y un punto coinciden, manda el dato. */}
        {ejes.y.map((m, i) => (
          <g key={`y${i}`}>
            <line className="nn-curva-marca" x1={-5} x2={0} y1={m.pos} y2={m.pos} />
            <text className="nn-curva-eje nn-curva-eje-y" x={-9} y={m.pos} dy="0.35em" textAnchor="end">{m.texto}</text>
          </g>
        ))}
        {ejes.x.map((m, i) => (
          <text
            key={`x${i}`}
            className="nn-curva-eje nn-curva-eje-x"
            x={m.pos}
            y={curva.alto + 22}
            textAnchor={m.pos <= 0 ? "start" : m.pos >= curva.ancho ? "end" : "middle"}
          >
            {m.texto}
          </text>
        ))}

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
      {riesgo && envoltura ? (
        <div className="nn-curva-riesgo">
          <p>
            <strong>{t("curvaRiesgoMarca")}</strong>:{" "}
            {envoltura === "si_se_estanca"
              ? t("curvaRiesgoDiceSiSeEstanca", { ph: textoDelValor(ultima!.value) })
              : t("curvaRiesgoDice", { ph: textoDelValor(ultima!.value) })}{" "}
            {/* La cita es de un documento en castellano: va literal y marcada como tal. */}
            <span lang="es" className="nn-curva-riesgo-cita">«{conEnfasis(riesgo.riesgo)}»</span>.
          </p>
          <details className="nn-inline-disclosure">
            <summary>{t("curvaRiesgoDeDondeSale")}</summary>
            <p className="nn-muted">{t("curvaRiesgoFuente", { banda: riesgo.banda, documento: DOCUMENTO_DEL_RIESGO })}</p>
            <p className="nn-muted">{t("curvaRiesgoCitaLiteral")}</p>
          </details>
        </div>
      ) : null}
      <p className="nn-muted">{resumen} · {t("curvaEjes")}</p>
      <Link href="/beneficio" className="nn-curva-cerrar">{t("curvaCerrar")}</Link>
    </section>
  );
}
