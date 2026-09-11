/**
 * El guardia de ADR-113. Llama a la función con la entrada hostil directamente
 * —no a través de la pantalla— porque una función que sólo se puede probar por
 * un corpus que no la ejercita no está probada.
 */
import { describe, it, expect } from "vitest";
import { direccionFijadaEnOtroSitio } from "../../lib/auth/direccionFijada";

describe("direccionFijadaEnOtroSitio", () => {
  it("reproduce el incidente del 2026-09-11: clavada en el dominio de marca", () => {
    expect(
      direccionFijadaEnOtroSitio("https://www.nectarnomada.com", "nectar-nomada-package.vercel.app"),
    ).toBe("www.nectarnomada.com");
  });

  // Control positivo del control: el caso bueno TIENE que salir distinto, o la
  // prueba de arriba no demuestra que la función discrimine.
  it("calla cuando la dirección clavada es la que sirve la petición", () => {
    expect(
      direccionFijadaEnOtroSitio(
        "https://nectar-nomada-package.vercel.app",
        "nectar-nomada-package.vercel.app",
      ),
    ).toBeNull();
  });

  it("calla cuando no hay nada clavado — el estado que ADR-113 quiere", () => {
    expect(direccionFijadaEnOtroSitio(undefined, "nectar-nomada-package.vercel.app")).toBeNull();
    expect(direccionFijadaEnOtroSitio("", "nectar-nomada-package.vercel.app")).toBeNull();
    expect(direccionFijadaEnOtroSitio("   ", "nectar-nomada-package.vercel.app")).toBeNull();
  });

  it("calla cuando no hay anfitrión con que comparar, aunque haya algo clavado", () => {
    expect(direccionFijadaEnOtroSitio("https://www.nectarnomada.com", null)).toBeNull();
    expect(direccionFijadaEnOtroSitio("https://www.nectarnomada.com", undefined)).toBeNull();
    expect(direccionFijadaEnOtroSitio("https://www.nectarnomada.com", "  ")).toBeNull();
  });

  it("ignora mayusculas: el mismo anfitrion escrito distinto no es un aviso", () => {
    expect(
      direccionFijadaEnOtroSitio("https://Nectar-Nomada-Package.Vercel.App", "nectar-nomada-package.vercel.app"),
    ).toBeNull();
  });

  it("compara el puerto, que es parte del anfitrion en local", () => {
    expect(direccionFijadaEnOtroSitio("http://localhost:3000", "localhost:3000")).toBeNull();
    expect(direccionFijadaEnOtroSitio("http://localhost:3000", "localhost:3017")).toBe("localhost:3000");
  });

  it("avisa con el valor crudo si la direccion clavada no se puede interpretar", () => {
    // `reqWithEnvURL` hace `new URL(url)` sin proteccion: esto revienta en cada
    // peticion, asi que callar seria lo peor que podria hacer el guardia.
    expect(direccionFijadaEnOtroSitio("no-es-una-url", "nectar-nomada-package.vercel.app")).toBe(
      "no-es-una-url",
    );
  });

  it("no se deja engañar por una ruta igual bajo otro anfitrion", () => {
    expect(
      direccionFijadaEnOtroSitio("https://www.nectarnomada.com/api/auth", "nectar-nomada-package.vercel.app"),
    ).toBe("www.nectarnomada.com");
  });
});
