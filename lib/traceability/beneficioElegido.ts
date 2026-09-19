/**
 * Qué beneficio mira la pantalla de recepción, cuando quien mira ve más de uno.
 *
 * Spec recepción de cereza §4: «con varios, se elige uno y se recuerda en una cookie que sólo acota,
 * como la finca». La cookie **no autoriza nada**: cada página vuelve a resolverla contra los
 * beneficios sobre los que quien mira tiene `lot:view`, y una que no esté ahí se ignora.
 */
import { beneficiosDeDestino } from "./jornadasDeCosecha";

export const COOKIE_BENEFICIO = "beneficio";

export async function beneficioDeLaPagina(userAccountId: string, cookie: string | undefined) {
  const beneficios = await beneficiosDeDestino(userAccountId);
  const elegido = beneficios.length === 1 ? beneficios[0]! : (beneficios.find((b) => b.id === cookie) ?? null);
  return { beneficios, elegido };
}
