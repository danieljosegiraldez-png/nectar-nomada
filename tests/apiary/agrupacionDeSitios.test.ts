/**
 * Anexo E, y el pedido del dueno: *"devuelta a finca o organizacion y ver apiarios bajo
 * ellos ya sea en lista o mapa"*.
 *
 * Lo que estas pruebas fijan es que **el orden por urgencia no se pierde al agrupar**: si
 * agrupar enterrara un apiario critico debajo de una finca tranquila, la agrupacion habria
 * costado lo que el ADR-133 acababa de arreglar.
 *
 * Todo es puro: sin base, carril hermetico.
 */
import { describe, expect, it } from "vitest";
import { agruparSitios, type SitioAgrupable } from "../../lib/apiary/agrupacionDeSitios";
import type { Alerta } from "../../lib/apiary/motivoDeAlerta";

const critico = (motivo: Alerta["motivo"]): Alerta => ({ nivel: "critico", motivo });
const aviso = (motivo: Alerta["motivo"]): Alerta => ({ nivel: "aviso", motivo });

function sitio(p: Partial<SitioAgrupable> & { id: string; nombre: string }): SitioAgrupable {
  return {
    grupoId: null,
    grupoNombre: null,
    grupoTipo: null,
    organizacion: "Nectar Nomada",
    alertas: [],
    cajas: 0,
    coloniasActivas: 0,
    ...p,
  };
}

/** Los cuatro apiarios reales, con su lugar padre tal como esta en la base. */
const REALES: SitioAgrupable[] = [
  sitio({ id: "r1", nombre: "Apiario Finca Rosina", grupoId: "rosina", grupoNombre: "Finca Rosina", grupoTipo: "site", cajas: 2, coloniasActivas: 0 }),
  sitio({ id: "r2", nombre: "Apiario Las Nubes", grupoId: "rosina", grupoNombre: "Finca Rosina", grupoTipo: "site", cajas: 10, coloniasActivas: 10 }),
  sitio({ id: "t1", nombre: "Apiario Toabre Finca 1", grupoId: "toabre", grupoNombre: "Toabre", grupoTipo: "locality", cajas: 10, coloniasActivas: 0 }),
  sitio({ id: "t2", nombre: "Apiario Toabre Finca 2", grupoId: "toabre", grupoNombre: "Toabre", grupoTipo: "locality", cajas: 6, coloniasActivas: 3 }),
];

describe("los apiarios se agrupan por el lugar que los contiene", () => {
  it("dos grupos para los cuatro reales, y cada uno suma sus cajas y colonias", () => {
    const grupos = agruparSitios(REALES);
    expect(grupos.map((g) => g.nombre)).toEqual(["Finca Rosina", "Toabre"]);
    expect(grupos[0]!.cajas).toBe(12);
    expect(grupos[0]!.coloniasActivas).toBe(10);
    expect(grupos[1]!.cajas).toBe(16);
    expect(grupos[1]!.coloniasActivas).toBe(3);
  });

  it("el tipo del lugar viaja, porque uno es finca y el otro no", () => {
    // El padre de Las Nubes es un `site` y el de Toabre una `locality`. Llamar "finca" a los
    // dos seria afirmar algo que la fila no dice.
    const grupos = agruparSitios(REALES);
    expect(grupos.find((g) => g.nombre === "Finca Rosina")!.tipo).toBe("site");
    expect(grupos.find((g) => g.nombre === "Toabre")!.tipo).toBe("locality");
  });

  it("LA AFIRMACION: agrupar NO entierra lo urgente — manda el grupo que tiene el problema", () => {
    // Toabre alfabeticamente va despues; con una aspersion anunciada va primero, y dentro
    // del grupo manda el sitio que la tiene.
    const conAlerta = REALES.map((s) =>
      s.id === "t2" ? { ...s, alertas: [critico("aspersion_anunciada")] } : s,
    );
    const grupos = agruparSitios(conAlerta);
    expect(grupos[0]!.nombre).toBe("Toabre");
    expect(grupos[0]!.sitios[0]!.nombre).toBe("Apiario Toabre Finca 2");
    expect(grupos[0]!.alertasCriticas).toBe(1);
    // Control de que el orden alfabetico habria dado lo contrario.
    expect(["Finca Rosina", "Toabre"].sort()).toEqual(["Finca Rosina", "Toabre"]);
  });

  it("entre dos grupos igual de graves, manda cuantos problemas tiene cada uno", () => {
    const sitios = [
      sitio({ id: "a", nombre: "A", grupoId: "g1", grupoNombre: "Grupo uno", alertas: [critico("visita_vencida")] }),
      sitio({ id: "b", nombre: "B", grupoId: "g2", grupoNombre: "Grupo dos", alertas: [critico("visita_vencida")] }),
      sitio({ id: "c", nombre: "C", grupoId: "g2", grupoNombre: "Grupo dos", alertas: [critico("alimento_vencido"), aviso("visita_sin_cerrar")] }),
    ];
    const grupos = agruparSitios(sitios);
    expect(grupos[0]!.nombre).toBe("Grupo dos");
    expect(grupos[0]!.alertasCriticas).toBe(2);
    expect(grupos[0]!.alertasDeAviso).toBe(1);
  });

  it("los que no declaran lugar caen en un grupo sin nombre, y NO por eso al final", () => {
    // Un apiario critico sin padre tiene que salir arriba: que le falte el dato del lugar no
    // lo hace menos urgente. Ordenarlo ultimo por no tener nombre lo enterraria.
    const sitios = [
      sitio({ id: "x", nombre: "Huerfano critico", alertas: [critico("perdida_sin_reposicion")] }),
      sitio({ id: "y", nombre: "Con finca, tranquilo", grupoId: "g", grupoNombre: "Finca tranquila", grupoTipo: "site" }),
    ];
    const grupos = agruparSitios(sitios);
    expect(grupos[0]!.nombre).toBeNull();
    expect(grupos[0]!.sitios[0]!.nombre).toBe("Huerfano critico");
    expect(grupos[1]!.nombre).toBe("Finca tranquila");
  });

  it("un grupo sin nombre con un problema va ANTES que uno con nombre y sin problemas", () => {
    // Este es el caso que separa "compite por urgencia" de "los sin nombre al final". Con la
    // regla del nombre aplicada antes que el recuento, el critico se hundiria.
    const sitios = [
      sitio({ id: "conNombre", nombre: "Tranquilo", grupoId: "g", grupoNombre: "Alfa", grupoTipo: "site" }),
      sitio({ id: "sinNombre", nombre: "Critico", alertas: [critico("visita_vencida")] }),
    ];
    const grupos = agruparSitios(sitios);
    expect(grupos[0]!.nombre).toBeNull();
    expect(grupos[0]!.alertasCriticas).toBe(1);
    expect(grupos[1]!.nombre).toBe("Alfa");
  });

  it("y con todo empatado, el grupo sin nombre SI queda detras", () => {
    const sitios = [
      sitio({ id: "x", nombre: "Sin lugar" }),
      sitio({ id: "y", nombre: "Con lugar", grupoId: "g", grupoNombre: "Zeta", grupoTipo: "site" }),
    ];
    expect(agruparSitios(sitios).map((g) => g.nombre)).toEqual(["Zeta", null]);
  });

  it("un grupo NO afirma una organizacion que solo tiene uno de sus miembros", () => {
    // Salio de mirar la salida real: el grupo "sin lugar declarado" reunia cuatro sitios de
    // tres organizaciones y el encabezado rotulaba la del primero.
    const mezclados = [
      sitio({ id: "a", nombre: "A", organizacion: "Nectar Nomada" }),
      sitio({ id: "b", nombre: "B", organizacion: "Otra finca" }),
    ];
    expect(agruparSitios(mezclados)[0]!.organizacion).toBeNull();
    // Control: cuando SI la comparten, se dice.
    const iguales = [
      sitio({ id: "a", nombre: "A", organizacion: "Nectar Nomada" }),
      sitio({ id: "b", nombre: "B", organizacion: "Nectar Nomada" }),
    ];
    expect(agruparSitios(iguales)[0]!.organizacion).toBe("Nectar Nomada");
  });

  it("una lista vacia da cero grupos, no un grupo vacio", () => {
    expect(agruparSitios([])).toEqual([]);
  });

  it("el orden es estable: la misma entrada al reves da el mismo resultado", () => {
    const uno = agruparSitios(REALES).map((g) => `${g.nombre}:${g.sitios.map((s) => s.nombre).join(",")}`);
    const otro = agruparSitios([...REALES].reverse()).map((g) => `${g.nombre}:${g.sitios.map((s) => s.nombre).join(",")}`);
    expect(otro).toEqual(uno);
  });
});
