/**
 * Qué beneficio mira una pantalla del beneficio, cuando quien mira ve más de uno.
 *
 * Spec recepción de cereza §4: «con varios, se elige uno y se recuerda en una cookie que sólo acota,
 * como la finca». La cookie **no autoriza nada**: cada página vuelve a resolverla contra los
 * beneficios sobre los que quien mira tiene `lot:view`, y una que no esté ahí se ignora.
 *
 * Daniel, 2026-09-21: quien tiene varios beneficios tiene que ver **la misma pregunta que con las
 * fincas** —un botón por beneficio— y no un desplegable dentro de la pantalla.
 */
import { beneficiosDeDestino } from "./jornadasDeCosecha";

export const COOKIE_BENEFICIO = "beneficio";

type Beneficio = { id: string; name: string };

/**
 * La decisión, sin base: con uno solo no hay nada que elegir; con una cookie que apunte a uno de
 * los suyos, ése; con varios y ninguno elegido, hay que preguntar. Con ninguno, ni se elige ni se
 * pregunta: la pantalla dice que no hay.
 */
export function resolverBeneficio<B extends Beneficio>(beneficios: readonly B[], cookie: string | undefined) {
  if (beneficios.length === 1) return { elegido: beneficios[0]!, debeElegir: false };
  const elegido = beneficios.find((b) => b.id === cookie) ?? null;
  return { elegido, debeElegir: !elegido && beneficios.length > 1 };
}

export async function beneficioDeLaPagina(userAccountId: string, cookie: string | undefined) {
  const beneficios = await beneficiosDeDestino(userAccountId);
  return { beneficios, ...resolverBeneficio(beneficios, cookie) };
}
