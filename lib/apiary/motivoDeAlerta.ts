/**
 * Los motivos de alerta de un sitio, su orden, y el orden de la lista de apiarios.
 *
 * **Módulo puro a propósito, y es la sexta vez que hace falta.** `vitalesDelSitio.ts`
 * importa el cliente de Prisma, así que nada de lo que vive ahí se puede usar ni desde un
 * componente de cliente ni desde el carril hermético de pruebas. El guardia
 * `alertas-con-su-texto` lo dice en su propio comentario —«se leen de la fuente y no se
 * importan: importar el módulo arrastra `prisma`»— y por eso **leía la unión con una
 * expresión regular sobre el texto del archivo**. Eso ya falló una vez: el 2026-09-14 un
 * comentario con un `;` dentro cortó la unión y el detector midió **cero motivos**, que es
 * la forma exacta de un guardia que pasa sin mirar nada.
 *
 * Con los motivos en un arreglo de verdad, ese guardia **lee un valor en vez de prosa** y no
 * hay expresión regular que romper.
 *
 * ## El orden NO es alfabético ni es el del Anexo C
 *
 * Es la prioridad que fijó el dueño el 2026-09-14, y el porqué está en `alertasDe`: una
 * aspersión anunciada es la única fecha de este tablero que **la impone alguien de fuera y
 * que no se puede atender después**. Cambiar este arreglo cambia dos cosas a la vez — qué
 * alerta pinta el borde de la tarjeta y **en qué orden sale la lista** —, así que se cambia
 * con el dueño delante y no al pasar.
 */
export const MOTIVOS_DE_ALERTA = [
  "aspersion_anunciada",
  "perdida_sin_reposicion",
  "visita_vencida",
  "alimento_vencido",
  "alimento_por_vencer",
  "visita_sin_cerrar",
  "consulta_a_vecinos_vencida",
  "consulta_a_vecinos_por_vencer",
  // AÑADIDO EL 2026-09-17 (ADR-151), y AL FINAL a proposito: es la unica posicion que NO
  // reordena ninguno de los ocho que el dueno fijo el 2026-09-14. Donde debe ir de verdad es
  // decision suya --este archivo dice que el orden «se cambia con el dueno delante y no al
  // pasar»-- y queda señalado en el ADR como pendiente suyo.
  "cajas_no_cuadran",
] as const;

export type MotivoDeAlerta = (typeof MOTIVOS_DE_ALERTA)[number];

export type NivelDeAlerta = "critico" | "aviso";

export interface Alerta {
  nivel: NivelDeAlerta;
  motivo: MotivoDeAlerta;
}

/** La posición del motivo en la prioridad del dueño. Más bajo, más urgente. */
export function rangoDeMotivo(motivo: MotivoDeAlerta): number {
  return MOTIVOS_DE_ALERTA.indexOf(motivo);
}

/**
 * El peso por nivel: crítico 0, aviso 1, sin alertas 2.
 *
 * **Un sitio sin medir pesa igual que uno sano, y eso es deliberado:** no se ha incumplido
 * nada, así que no puede estar arriba. La pantalla sí los rotula distinto, que es donde esa
 * diferencia importa.
 */
export function pesoDeNivel(alertas: readonly Alerta[] | undefined): number {
  if (!alertas || alertas.length === 0) return 2;
  return alertas[0]?.nivel === "critico" ? 0 : 1;
}

export interface SitioOrdenable {
  nombre: string;
  /** `undefined` = ni una fila detrás del sitio. Cuenta como «sin alertas». */
  alertas: readonly Alerta[] | undefined;
}

/**
 * El orden de la lista de apiarios. Anexo E §2: **«orden por urgencia, no alfabético ni por
 * código»**.
 *
 * **Lo que había hasta el 2026-09-14 cumplía esa frase a medias, y la mitad que faltaba era
 * justo la decisión del dueño.** La pantalla ordenaba con dos líneas: el peso por nivel y,
 * empatados, `localeCompare` del nombre. O sea que entre dos sitios críticos decidía **el
 * alfabeto** — lo que el Anexo prohíbe por su nombre—, y la prioridad de motivos que el
 * dueño subió el mismo día movía el borde de la tarjeta **sin mover la tarjeta**. Un apiario
 * con una aspersión anunciada en tres días quedaba debajo de uno con una visita vencida sólo
 * porque su nombre empieza por T.
 *
 * Cuatro criterios, y el cuarto no es un criterio:
 *
 *   1. el nivel — crítico antes que aviso antes que nada;
 *   2. **el motivo más grave**, en la prioridad del dueño (`MOTIVOS_DE_ALERTA`);
 *   3. **cuántas alertas**, de más a menos: un sitio con tres problemas va encima de uno con
 *      uno. La tarjeta ya los enseñaba distintos; ahora el orden también;
 *   4. el nombre, **como desempate determinista y no como orden**. Sin él, dos sitios
 *      igualmente urgentes se barajarían entre una carga y otra, y una lista que se mueve
 *      sola no se puede leer. Que quede en cuarto lugar es la diferencia entre «alfabético»
 *      y «estable».
 */
export function compararPorUrgencia(a: SitioOrdenable, b: SitioOrdenable): number {
  const nivel = pesoDeNivel(a.alertas) - pesoDeNivel(b.alertas);
  if (nivel !== 0) return nivel;

  const peorA = a.alertas?.[0];
  const peorB = b.alertas?.[0];
  if (peorA && peorB) {
    const motivo = rangoDeMotivo(peorA.motivo) - rangoDeMotivo(peorB.motivo);
    if (motivo !== 0) return motivo;
  }

  const cuantas = (b.alertas?.length ?? 0) - (a.alertas?.length ?? 0);
  if (cuantas !== 0) return cuantas;

  return a.nombre.localeCompare(b.nombre);
}
