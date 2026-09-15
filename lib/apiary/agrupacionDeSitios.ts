import { compararPorUrgencia, type Alerta, type SitioOrdenable } from "./motivoDeAlerta";

/**
 * Los apiarios agrupados por el lugar que los contiene.
 *
 * **Por que existe, y en palabras del dueno:** *"devuelta a finca o organizacion y ver
 * apiarios bajo ellos ya sea en lista o mapa"*.
 *
 * **La jerarquia YA estaba en los datos; la pantalla la aplanaba.** Medido el 2026-09-15:
 *
 *     Nectar Nomada / Finca Rosina (site)  / Apiario Finca Rosina    ->  2 cajas
 *     Nectar Nomada / Finca Rosina (site)  / Apiario Las Nubes       -> 10 cajas
 *     Nectar Nomada / Toabre (locality)    / Apiario Toabre Finca 1  -> 10 cajas
 *     Nectar Nomada / Toabre (locality)    / Apiario Toabre Finca 2  ->  6 cajas
 *
 * y `app/apiaries/page.tsx` **no nombraba la organizacion ni el sitio padre en ninguna
 * linea**: dibujaba una lista plana. O sea que esto no construye una jerarquia nueva --
 * deja de esconder la que hay.
 *
 * **El grupo es el LUGAR PADRE, y su tipo se ensena, porque no todos son fincas.** El padre
 * de Las Nubes es un `site` --Finca Rosina-- y el de Toabre es una `locality`. Llamar
 * "finca" a los dos seria rotular como hecho algo que la fila no dice. Se agrupa por el
 * padre porque es la division con la que el dueno piensa --los dos de Rosina contra los dos
 * de Toabre--; la organizacion se ensena al lado y no como agrupador, porque agrupar por
 * ella daria **un solo grupo de cuatro**, que es la lista plana otra vez.
 *
 * Todo aqui es puro: recibe lo que la pantalla ya leyo y no consulta nada.
 */

export interface SitioAgrupable extends SitioOrdenable {
  id: string;
  /** El lugar que lo contiene. `null` = la fila no declara padre. */
  grupoId: string | null;
  grupoNombre: string | null;
  /** `site`, `locality`... Se ensena: un grupo no afirma ser una finca si no lo es. */
  grupoTipo: string | null;
  organizacion: string | null;
  cajas: number;
  coloniasActivas: number;
}

export interface GrupoDeSitios {
  /** `null` cuando reune a los que no declaran lugar padre. */
  id: string | null;
  nombre: string | null;
  tipo: string | null;
  organizacion: string | null;
  sitios: SitioAgrupable[];
  cajas: number;
  coloniasActivas: number;
  alertasCriticas: number;
  alertasDeAviso: number;
}

function cuenta(sitios: SitioAgrupable[], nivel: Alerta["nivel"]): number {
  return sitios.reduce((n, s) => n + (s.alertas ?? []).filter((a) => a.nivel === nivel).length, 0);
}

const SIN_LUGAR = " sin-lugar";

/** El valor comun, o `null` si no hay uno solo. */
function unica(valores: (string | null)[]): string | null {
  const distintos = new Set(valores);
  return distintos.size === 1 ? (valores[0] ?? null) : null;
}

/**
 * **El orden entre grupos es el mismo criterio que dentro de cada uno: urgencia.** Se compara
 * el sitio mas urgente de cada grupo, que es el que decide a donde vas primero.
 *
 * **Y el grupo sin lugar declarado NO va al final por serlo.** Ordenarlo ultimo enterraria un
 * apiario critico debajo de fincas tranquilas solo porque a su fila le falta el padre -- un
 * dato que falta no es una urgencia menor. Compite por urgencia como los demas, y solo cuando
 * todo empata cae al final, que es donde un nombre ausente tiene que caer.
 */
export function agruparSitios(sitios: readonly SitioAgrupable[]): GrupoDeSitios[] {
  const porGrupo = new Map<string, SitioAgrupable[]>();
  for (const s of sitios) {
    const clave = s.grupoId ?? SIN_LUGAR;
    const lista = porGrupo.get(clave);
    if (lista) lista.push(s);
    else porGrupo.set(clave, [s]);
  }

  const grupos: GrupoDeSitios[] = [];
  for (const [clave, lista] of porGrupo) {
    const ordenados = [...lista].sort(compararPorUrgencia);
    const primero = ordenados[0]!;
    const sinLugar = clave === SIN_LUGAR;
    grupos.push({
      id: sinLugar ? null : primero.grupoId,
      nombre: sinLugar ? null : primero.grupoNombre,
      tipo: sinLugar ? null : primero.grupoTipo,
      // **La organizacion sola si TODOS la comparten.** Salio de mirar la salida real: el
      // grupo "sin lugar declarado" reunia cuatro sitios de tres organizaciones distintas y
      // el encabezado rotulaba la del primero. Un grupo no afirma un dueno que solo tiene
      // uno de sus miembros.
      organizacion: unica(ordenados.map((s) => s.organizacion)),
      sitios: ordenados,
      cajas: ordenados.reduce((n, s) => n + s.cajas, 0),
      coloniasActivas: ordenados.reduce((n, s) => n + s.coloniasActivas, 0),
      alertasCriticas: cuenta(ordenados, "critico"),
      alertasDeAviso: cuenta(ordenados, "aviso"),
    });
  }

  return grupos.sort((a, b) => {
    // **Aqui habia un primer criterio por NIVEL y se quito, porque no decidia nada.** Un
    // flip-test lo destapo: anulandolo, las nueve pruebas seguian en verde. Y la razon es
    // estructural, no una prueba que faltaba: una alerta critica implica nivel 0, asi que un
    // grupo con criticas SIEMPRE gana tambien por el recuento de criticas, y uno con avisos
    // gana por el de avisos. Los dos criterios no pueden discrepar. Un criterio que ninguna
    // entrada puede hacer decidir es un adorno con forma de regla.
    const criticas = b.alertasCriticas - a.alertasCriticas;
    if (criticas !== 0) return criticas;
    const avisos = b.alertasDeAviso - a.alertasDeAviso;
    if (avisos !== 0) return avisos;
    // Desempate determinista, y el grupo sin nombre queda detras de los que lo tienen.
    if (a.nombre === null) return b.nombre === null ? 0 : 1;
    if (b.nombre === null) return -1;
    return a.nombre.localeCompare(b.nombre);
  });
}
