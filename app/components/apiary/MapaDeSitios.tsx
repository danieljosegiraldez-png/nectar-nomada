"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

export interface SitioEnElMapa {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Colonias activas ahora mismo. Va en el globo para no obligar a navegar. */
  coloniasActivas: number;
}

/**
 * El mapa de sitios de apiario.
 *
 * ## Leaflet y no Mapbox — enmienda de ADR-009, decidida por el dueño
 *
 * ADR-009 eligió Mapbox por su estilo propio. Mapbox exige **token y cuenta de
 * pago**, y medido contra este caso concreto —24 ubicaciones, un puñado de
 * personas, teléfonos en el campo— eso compra una capacidad que nadie ha pedido
 * todavía. Leaflet pesa **3,7 MB con cero dependencias** frente a los 20 MB y 17
 * dependencias de MapLibre, que era la otra candidata sin token.
 *
 * **Las teselas son de OpenStreetMap y eso tiene condiciones**, no es «gratis» a
 * secas: su política de uso pide atribución visible —está abajo a la derecha, la
 * pone Leaflet y no se quita— y desaconseja el uso intensivo. Para este volumen
 * está dentro de lo razonable; el día que deje de estarlo, la salida es un
 * proveedor de teselas y no un cambio de librería.
 *
 * ## Por qué se carga dentro de un efecto y no en el módulo
 *
 * Leaflet toca `window` al importarse. En una página de servidor eso revienta el
 * render. El `import()` dinámico dentro del efecto lo mantiene fuera del bundle
 * del servidor **y** fuera del JavaScript que baja quien nunca abre esta
 * pantalla.
 */
export function MapaDeSitios({ sitios }: { sitios: readonly SitioEnElMapa[] }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    let vivo = true;

    void (async () => {
      const L = await import("leaflet");
      // La hoja de estilos de Leaflet, junto a su JS. Sin ella los controles y
      // los pines salen apilados en la esquina, que es un fallo silencioso:
      // el mapa «funciona» y se ve roto.
      await import("leaflet/dist/leaflet.css");
      if (!vivo || !contenedor.current) return;

      const m = L.map(contenedor.current);
      mapa.current = m;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        // Obligatoria por la política de uso de OSM. No se quita.
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);

      const puntos: [number, number][] = sitios.map((s) => [s.latitude, s.longitude]);
      for (const s of sitios) {
        // `bindPopup` con una CADENA la interpreta como HTML — está en su API y
        // es fácil de leer al revés. El nombre de un sitio sale de la base, así
        // que se construye un nodo y se escribe en `textContent`: el navegador
        // no puede confundir eso con marcado.
        const globo = document.createElement("div");
        globo.textContent = `${s.name} · ${s.coloniasActivas}`;
        L.marker([s.latitude, s.longitude]).addTo(m).bindPopup(globo);
      }

      // Encuadra lo que hay. Con un solo sitio `fitBounds` daría un zoom
      // absurdo, así que ese caso se centra a mano.
      if (puntos.length === 1) m.setView(puntos[0]!, 14);
      else if (puntos.length > 1) m.fitBounds(puntos, { padding: [40, 40] });

      // Sin coordenadas no se llama a `setView` con un centro inventado: el
      // componente ni siquiera se monta en ese caso (lo decide la página).
    })();

    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
    };
  }, [sitios]);

  return <div ref={contenedor} className="nn-mapa" role="application" aria-label="Mapa de sitios" />;
}
