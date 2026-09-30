import { caminoDe, escalasDe, LIENZO, type DatosDeLaGrafica } from "../../../../lib/beneficio/graficaDeSecado";

/**
 * La gráfica de una unidad de secado (diseño §B.3).
 *
 * **SVG del servidor, sin una línea de JavaScript en el navegador.** Es una imagen de datos que
 * no cambia hasta que se recarga; una librería de gráficas costaría kilobytes y una hidratación
 * para dibujar cinco series estáticas.
 *
 * **Cada serie tiene la forma que su dato merece**, y no es decoración:
 *
 * - **humedad del grano → puntos.** Son lecturas sueltas; una línea afirmaría que entre las 8:00
 *   y las 18:00 la humedad hizo algo que nadie midió.
 * - **rango objetivo → banda.** El objetivo es una zona, no una raya.
 * - **temperatura y humedad del cuarto → línea.** El ambiente sí es continuo.
 * - **volteos → marcas verticales.** Un gesto, no una medición: no tiene altura.
 * - **peso neto → fuera de aquí**, en cifras. Cuatro pesajes no hacen una curva.
 *
 * **La temperatura va en su propio eje** y por eso se dibuja con su propia escala: mezclar grados
 * y porcentaje en un eje es la forma más barata de dibujar una mentira convincente. Se pinta
 * discreta y con su nota, para que nadie la lea contra el eje de la izquierda.
 *
 * **Si no hay escala, no hay gráfica**: se dice con palabras en vez de pintar ejes vacíos, que se
 * leen como «no hay nada» cuando significan «no hay con qué».
 */
export function GraficaDeSecado({ datos, textos }: {
  datos: DatosDeLaGrafica;
  textos: {
    sinDatos: string;
    ejeHumedad: string;
    notaTemperatura: string;
    tituloVolteos: string;
  };
}) {
  const escala = escalasDe(datos);
  if (escala.x === null || escala.y === null) {
    return <p className="nn-muted">{textos.sinDatos}</p>;
  }
  const x = escala.x;
  const y = escala.y;
  const { ancho, alto, margen } = LIENZO;

  const banda = datos.rango
    ? { y: y(datos.rango.max), alto: Math.abs(y(datos.rango.min) - y(datos.rango.max)) }
    : null;

  // La temperatura, en su propia escala, para no mentir contra el eje de porcentaje.
  const temps = datos.temperatura;
  const tMin = temps.length ? Math.min(...temps.map((p) => p.valor)) : 0;
  const tMax = temps.length ? Math.max(...temps.map((p) => p.valor)) : 0;
  const rangoT = tMax - tMin === 0 ? 1 : tMax - tMin;
  const yT = (v: number) => margen.arriba + (1 - (v - tMin) / rangoT) * (alto - margen.arriba - margen.abajo);
  const caminoT = temps.length >= 2
    ? temps.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.cuando).toFixed(1)} ${yT(p.valor).toFixed(1)}`).join(" ")
    : null;

  const caminoHR = caminoDe(datos.humedadRelativa, escala);

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        width="100%"
        role="img"
        aria-label={textos.ejeHumedad}
        style={{ maxWidth: `${ancho}px`, overflow: "visible" }}
      >
        {/* La banda del objetivo, debajo de todo: es el fondo contra el que se lee lo demás. */}
        {banda ? (
          <rect
            x={margen.izq}
            y={banda.y}
            width={ancho - margen.izq - margen.der}
            height={banda.alto}
            fill="var(--nn-accent, #1d6f6a)"
            opacity="0.12"
          />
        ) : null}

        {/* Los ejes. Sobrios: la gráfica es el dato, no la rejilla. */}
        <line x1={margen.izq} y1={margen.arriba} x2={margen.izq} y2={alto - margen.abajo} stroke="currentColor" opacity="0.3" />
        <line x1={margen.izq} y1={alto - margen.abajo} x2={ancho - margen.der} y2={alto - margen.abajo} stroke="currentColor" opacity="0.3" />
        <text x={4} y={margen.arriba + 8} fontSize="11" fill="currentColor" opacity="0.7">
          {escala.maxY.toFixed(0)}
        </text>
        <text x={4} y={alto - margen.abajo} fontSize="11" fill="currentColor" opacity="0.7">
          {escala.minY.toFixed(0)}
        </text>

        {/* Los volteos: marcas verticales, sin altura propia. */}
        {datos.volteos.map((v, i) => (
          <line
            key={`v-${i}`}
            x1={x(v)}
            y1={margen.arriba}
            x2={x(v)}
            y2={alto - margen.abajo}
            stroke="currentColor"
            opacity="0.25"
            strokeDasharray="2 3"
          >
            <title>{textos.tituloVolteos}</title>
          </line>
        ))}

        {caminoHR ? <path d={caminoHR} fill="none" stroke="var(--nn-muted, #6f7780)" strokeWidth="1.5" opacity="0.7" /> : null}
        {caminoT ? <path d={caminoT} fill="none" stroke="var(--nn-warn, #a8741a)" strokeWidth="1.5" opacity="0.6" strokeDasharray="4 3" /> : null}

        {/* La humedad del grano, encima de todo y en puntos: es lo que se viene a mirar. */}
        {datos.humedad.map((p, i) => (
          <circle key={`h-${i}`} cx={x(p.cuando)} cy={y(p.valor)} r="3.5" fill="var(--nn-accent, #1d6f6a)">
            <title>{`${p.valor} %`}</title>
          </circle>
        ))}
      </svg>
      {temps.length > 0 ? <figcaption className="nn-muted">{textos.notaTemperatura}</figcaption> : null}
    </figure>
  );
}
