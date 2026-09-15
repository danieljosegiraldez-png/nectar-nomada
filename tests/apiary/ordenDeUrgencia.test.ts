/**
 * Anexo E §2 — «orden por urgencia, no alfabético ni por código».
 *
 * **Lo que esta prueba vigila no existía como código que se pudiera llamar.** El orden de la
 * primera pantalla del módulo vivía en dos líneas dentro de `app/apiaries/page.tsx`, así que
 * nada lo probaba: `pesoDeAlerta` sí tenía prueba, pero el peso es sólo el primero de los
 * criterios y el que faltaba era justo la decisión que el dueño tomó ese día.
 *
 * Todo lo de aquí es puro: sin base, sin `prisma`, carril hermético.
 */
import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DE_ALERTA,
  compararPorUrgencia,
  rangoDeMotivo,
  type Alerta,
  type SitioOrdenable,
} from "../../lib/apiary/motivoDeAlerta";

const critico = (motivo: Alerta["motivo"]): Alerta => ({ nivel: "critico", motivo });
const aviso = (motivo: Alerta["motivo"]): Alerta => ({ nivel: "aviso", motivo });

const ordenar = (sitios: SitioOrdenable[]) => [...sitios].sort(compararPorUrgencia).map((s) => s.nombre);

describe("Anexo E §2 — el orden de la lista de apiarios", () => {
  it("crítico va antes que aviso, y un sitio sin alertas va último", () => {
    expect(
      ordenar([
        { nombre: "Al día", alertas: [] },
        { nombre: "Con aviso", alertas: [aviso("visita_sin_cerrar")] },
        { nombre: "Crítico", alertas: [critico("visita_vencida")] },
      ]),
    ).toEqual(["Crítico", "Con aviso", "Al día"]);
  });

  it("entre dos críticos manda el motivo del dueño, NO el alfabeto — es el hueco que se cerró", () => {
    // La aspersión anunciada es la prioridad 1 desde el 2026-09-14. Con el orden viejo
    // —peso por nivel y después `localeCompare`— «Cerro Azul» salía primero por la C, y la
    // decisión del dueño movía el borde de la tarjeta sin mover la tarjeta.
    const sitios: SitioOrdenable[] = [
      { nombre: "Cerro Azul", alertas: [critico("visita_vencida")] },
      { nombre: "Toabré F2", alertas: [critico("aspersion_anunciada")] },
    ];
    expect(ordenar(sitios)).toEqual(["Toabré F2", "Cerro Azul"]);
    // Y el control de que la prueba mide lo que dice: alfabéticamente es al revés.
    expect([...sitios].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((s) => s.nombre)).toEqual([
      "Cerro Azul",
      "Toabré F2",
    ]);
  });

  it("con el mismo motivo peor, el sitio con más problemas va encima", () => {
    expect(
      ordenar([
        { nombre: "Uno solo", alertas: [critico("visita_vencida")] },
        { nombre: "Tres cosas", alertas: [critico("visita_vencida"), critico("alimento_vencido"), aviso("visita_sin_cerrar")] },
      ]),
    ).toEqual(["Tres cosas", "Uno solo"]);
  });

  it("el nombre desempata SÓLO cuando la urgencia es idéntica, y entonces el orden es estable", () => {
    const iguales: SitioOrdenable[] = [
      { nombre: "Los Palacios", alertas: [aviso("consulta_a_vecinos_vencida")] },
      { nombre: "Lagartero", alertas: [aviso("consulta_a_vecinos_vencida")] },
    ];
    expect(ordenar(iguales)).toEqual(["Lagartero", "Los Palacios"]);
    // Dos veces el mismo resultado: una lista que se barajara entre cargas no se puede leer.
    expect(ordenar([...iguales].reverse())).toEqual(["Lagartero", "Los Palacios"]);
  });

  it("un sitio sin NI UNA fila detrás no se cuela arriba: no ha incumplido nada", () => {
    expect(
      ordenar([
        { nombre: "Sin medir", alertas: undefined },
        { nombre: "Con aviso", alertas: [aviso("alimento_por_vencer")] },
        { nombre: "Medido y sano", alertas: [] },
      ]),
    ).toEqual(["Con aviso", "Medido y sano", "Sin medir"]);
  });

  it("una lista como la del dueño sale por urgencia y no por nombre ni por código", () => {
    // Siete sitios reales. El código NN va delante del nombre en la pantalla, así que un
    // orden por código sería el mismo alfabeto con otra cara — y es lo que el Anexo prohíbe
    // por su nombre.
    expect(
      ordenar([
        { nombre: "Apiario Finca Rosina", alertas: [] },
        { nombre: "Apiario Las Nubes", alertas: [aviso("alimento_por_vencer")] },
        { nombre: "Lagartero", alertas: [critico("visita_vencida")] },
        { nombre: "Los Palacios", alertas: [critico("visita_vencida"), critico("alimento_vencido")] },
        { nombre: "Río Gatú", alertas: undefined },
        { nombre: "Toabré F1", alertas: [critico("perdida_sin_reposicion")] },
        { nombre: "Toabré F2", alertas: [critico("aspersion_anunciada")] },
      ]),
    ).toEqual([
      "Toabré F2", // aspersión anunciada: la impone alguien de fuera
      "Toabré F1", // pérdida sin reposición
      "Los Palacios", // visita vencida, y dos problemas
      "Lagartero", // visita vencida, uno
      "Apiario Las Nubes", // aviso
      "Apiario Finca Rosina", // medido y sano
      "Río Gatú", // sin medir
    ]);
  });

  it("el rango sale del arreglo y el arreglo es el orden del dueño", () => {
    // Si alguien reordena `MOTIVOS_DE_ALERTA` sin querer, esto lo dice por su nombre: el
    // arreglo gobierna a la vez el borde de la tarjeta y el orden de la lista.
    expect(MOTIVOS_DE_ALERTA[0]).toBe("aspersion_anunciada");
    expect(rangoDeMotivo("aspersion_anunciada")).toBeLessThan(rangoDeMotivo("perdida_sin_reposicion"));
    expect(rangoDeMotivo("perdida_sin_reposicion")).toBeLessThan(rangoDeMotivo("visita_vencida"));
    expect(MOTIVOS_DE_ALERTA.length).toBe(8);
  });
});
