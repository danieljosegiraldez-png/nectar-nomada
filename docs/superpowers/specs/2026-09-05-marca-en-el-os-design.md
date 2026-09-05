# La marca en el OS — diseño

**Fecha:** 2026-09-05
**Decisión del dueño:** Daniel, en la sesión del 2026-09-05.
**Estado:** diseño aprobado. La implementación **no ha empezado**.

---

## 1. El problema, en las palabras del dueño

> «No parece de la marca.»

El OS se siente genérico al lado del sitio público. No es una queja estética
vaga: es medible, y la medición dice exactamente en qué.

## 2. Lo que se midió, y con qué

Leyendo `app/globals.css` de los dos repositorios el 2026-09-05, y calculando
contrastes WCAG 2.1 sobre los valores reales.

**La marca existe y está definida** en `nectarnomada-web`:

| | valor |
|---|---|
| Tipografía | **Bodoni Moda** (display) + **Archivo** (texto), SIL OFL, alojadas por `next/font` |
| Papel | `#faf7f0` |
| Tinta | `#141210` |
| Miel — el acento | `#fcea3c` |
| Marañón | `#f03024` · Palma `#90f68a` · Guarapo `#967860` |
| Medida de lectura | `66ch` |

**El OS comparte el papel y nada más:**

| | OS | marca | |
|---|---|---|---|
| fondo | `#faf6ef` | `#faf7f0` | prácticamente el mismo |
| tinta | `#241c14` | `#141210` | el OS es más marrón |
| marca | `#7a3b1e` | — | no existe en la paleta |
| acento | `#3f5c3f` | — | tampoco |
| tipografía | pilas del sistema | dos familias propias | **el factor dominante** |

**El motor principal es la tipografía.** El OS usa lo que traiga el aparato —San
Francisco, Segoe, Roboto—, así que se lee como *software*. El color es el
segundo factor.

## 3. La restricción que ordena todo lo demás

**La miel no puede ser el acento interactivo con texto blanco.** Medido:

| uso | ratio | ¿sirve? |
|---|---|---|
| miel como texto sobre papel | 1.16 | no |
| miel de fondo con texto **blanco** | 1.24 | no |
| miel de fondo con texto **tinta** | **15.10** | **sí** |

Y un hallazgo que no se esperaba: **ninguna variante `-texto` de la marca llega
a 4.5 sobre papel** —se quedan en 4.34–4.47—. Están afinadas para el sitio
editorial, no para enlaces de interfaz. Sí sirven como fondo de botón con texto
blanco (4.65–4.79).

## 4. Decisiones

### 4.1 Tipografía

| dónde | fuente | por qué |
|---|---|---|
| Texto de interfaz (`--nn-font`) | **Archivo** | Grotesca diseñada para legibilidad. Es lo que quita el «parece genérico». |
| Encabezados (`--nn-display`) | **Bodoni Moda** | Serif de alto contraste: buena en títulos, **mala** en texto pequeño y al sol. **Solo encabezados.** |

Alojadas por `next/font` en nuestro origen, como en el sitio. Sin peticiones a
terceros.

### 4.2 Color

```
papel   #faf7f0     (hoy #faf6ef — se alinea)
tinta   #141210     (hoy #241c14)

acción principal   miel #fcea3c con texto TINTA        15.10
error              marañón-texto #df2c21 + blanco       4.65
éxito              palma-texto #4a7f47 + blanco         4.75
```

Un botón de miel con texto oscuro se ve **mejor** al sol que el marrón actual
con texto blanco: 15.10 contra 8.50.

### 4.3 El enlace se queda como está — decisión explícita

**`--nn-brand` sigue siendo `#7a3b1e`.** Lo on-brand habría sido guarapo
oscurecido a `#816753` (4.91), pero el marrón actual da **7.94**.

Daniel eligió el marrón: **más marca no vale tres puntos de contraste en una
herramienta que se usa al sol.** La marca se gana por tipografía y por la miel,
que es donde de verdad se nota.

Queda escrito para que nadie lo "arregle" después creyendo que fue un olvido.

## 5. Lo que este diseño NO hace

- **No toca `--nn-border`.** Es divisor de tarjetas, no identifica ningún
  control, así que WCAG 1.4.11 no le aplica. Cambiarlo repintaría todo.
- **No toca densidad ni navegación.** El dueño nombró la marca como problema,
  no la orientación. Si «cuesta encontrar las cosas» aparece después, es otro
  encargo.
- **No baja ningún contraste de texto.** Los actuales van de 6.5 a 16.8 y están
  bien; el cambio de tinta los **sube**: 15.58 → **17.47** para el texto normal.
  Ninguna de las decisiones de §4 reduce un contraste existente, y la única que
  lo habría hecho —el enlace a guarapo— se rechazó por eso (§4.3).
- **No crea un paquete compartido de tokens** entre los dos repositorios. Ver
  riesgos.

## 6. Riesgos, y cuál no tiene guardia

**La paleta puede separarse de la del sitio y nada lo detectará.** Los dos
repositorios son independientes; CI del OS no puede leer el otro. Se copian los
valores con un comentario que nombre el origen, y eso es lo mejor disponible.
Un paquete compartido sería la solución real y es bastante más trabajo del que
este encargo pide. **Esto es una deuda declarada, no un descuido.**

**Coste de red en el campo.** Dos familias que descargar donde hoy no se paga
nada. `next/font` las aloja en nuestro origen y las cachea, pero la primera
carga con señal mala es peor que hoy. Aceptado a ojos abiertos por el dueño al
elegir «tipografía y color, completo».

**Bodoni Moda en encabezados largos.** Un serif de alto contraste con nombres
de lote largos puede leerse peor de lo que se ve en una maqueta. Es lo primero
que hay que mirar en la verificación.

## 7. Cómo se verifica

No se da por bueno con una captura. Cada punto tiene su medición:

1. **Contraste**, calculado sobre los valores computados en el navegador, no
   sobre el CSS: acción ≥ 4.5 con tinta, error y éxito ≥ 4.5 con blanco.
2. **Las fuentes cargan desde nuestro origen** — comprobar en la pestaña de red
   que no hay petición a `fonts.googleapis.com`.
3. **Control positivo:** una pantalla con un nombre de lote largo, en móvil
   375×812, para ver Bodoni Moda en el peor caso y no en el mejor.
4. **La compuerta entera**, leyendo el código de salida y sin tubería.
5. **`npm run build`**, porque `verify` no corre `next build` y ahí es donde
   aparecen los fallos de fuentes.

## 8. Siguiente paso

Según `superpowers:brainstorming`, de aquí se pasa a `writing-plans` para el
plan de implementación. **No se escribe código antes de eso.**
