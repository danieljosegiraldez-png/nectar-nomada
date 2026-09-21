# Herramientas sensoriales — pieza 1: la rueda interactiva

**Fecha:** 2026-09-21 · **Aviso de licencia en §7** · **Estado:** diseño aprobado por Daniel en la conversación, pendiente de su lectura del texto.
**Decisiones de origen:** H1–H15 de Daniel, 2026-09-21 (resumidas en §1). Inspiración declarada:
notbadcoffee.com/flavor-wheel-en — tarjeta por descriptor con definición, referencia, intensidad y preparación.

## 1. Qué decidió Daniel

| # | decisión |
|---|---|
| H1 | Va **dentro de Sensorial**, en una sección «Herramientas» (interactivas e imprimibles). |
| H2 | La primera pieza es la **rueda interactiva**. Después, en piezas propias: prueba triangular, apoyo a catación, hojas de competencia, guías de juez y organizador, imprimibles. |
| H3 | Tarjetas con contenido propio **y** el léxico del WCR. |
| H4, H7 | **Permiso declarado por Daniel el 2026-09-21** para usar la información «tal cual se lee», en su relación actual de estudio e investigación con Kiva Estate, Cafelino y Rosina. Al vender, se renegocia. |
| H5 | Visibilidad **pública**, con carácter educativo y sensibilizador. |
| H6 | Ruedas: café arábica, café robusta, miel, vino, cerveza, hidromiel y **sidra**. |
| H8 | Dos formas según el modo: **circular + tarjeta** (pantalla ancha) y **por capas** (teléfono); automático por ancho, con interruptor manual. «Tu rueda» (pintada con datos propios, filtrable por finca, marca, competencia, varietal) **después**, cuando haya años de datos. |
| H9 | v1 **sólo consulta**, con los datos diseñados para que el registro encaje sin rehacer. |
| H10, H15 | La interfaz va en es/en. Los **términos de la rueda se muestran en su inglés original** hasta que Daniel dé la traducción; no se propone una traducción de oficio. |
| H11 | La tarjeta muestra todo lo disponible: definición, referencia, intensidad 1–15, preparación, padre e hijos, fuente y licencia. |
| H12 | El buscador busca **sólo dentro de la rueda abierta**. |
| H14 | **La rueda y los protocolos de cata son cosas separadas.** La rueda es vocabulario de referencia (familia › subfamilia › descriptor), sin clasificación. Las catas registran los descriptores que usaron, y los evaluadores pueden redactar los suyos con intensidad o ausencia. Un descriptor de cata **puede** enlazarse a un término de rueda. Positivo, neutro o defecto se decide en el protocolo o la receta (ADR-181 §16), nunca en la rueda. |

## 2. Datos

Tablas nuevas en el esquema `sensory`. Los nombres son una propuesta y se confirman al revisar esta especificación.
Revisado por Codex el 2026-09-21: sus 12 hallazgos se incorporaron en esta sección y en §3–§5.

- **`SensoryWheel`** — una rueda (qué es).
  - Campos: `domain` (arabica_coffee, robusta_coffee, honey, wine, beer, mead, cider), `title`, `isPublic`.
  - **`isPublic` nace apagado.** Se enciende **rueda por rueda cuando Daniel confirma su licencia** (su decisión del 2026-09-21: «rueda por rueda, con el estado de licencia visible»).
  - Una rueda sin ninguna versión publicada (hoy, la sidra) se muestra sólo como entrada informativa «sin fuente todavía». No es una rueda publicada.
- **`SensoryWheelVersion`** — una edición.
  - **La licencia y la atribución viven aquí**, porque cambian por edición: `sourceAuthor` (o el marcador explícito «autor sin identificar», que no se deduce), `sourceReference` (obligatoria), `license`, `permissionNote` («permiso declarado por Daniel el 2026-09-21, uso educativo»), `status` (draft, published, superseded).
  - **Como máximo una `published` por rueda:** índice único parcial.
  - Publicar una edición nueva y pasar la anterior a `superseded` ocurre en una sola transacción.
  - **Una versión que no está en `draft` queda congelada:** un disparador rechaza cambios a ella y a sus nodos.
- **`SensoryWheelNode`** — un término del árbol.
  - Campos: `versionId`, `key` (clave estable, única por versión, que sobrevive a reimportaciones), `parentId`, `parentLevel`, `level` (family, subfamily, descriptor), `termOriginal` (inglés, obligatorio), `termEs` (nulo hasta que Daniel lo dé), `color`, `displayOrder`.
  - **El árbol se garantiza sin disparadores:** FK compuesta `(versionId, parentId, parentLevel) → (versionId, id, level)` más un `CHECK` sobre `(level, parentLevel)`: family sin padre; subfamily bajo family; descriptor bajo family o subfamily.
  - Así el padre es de la **misma versión** y su nivel no puede cambiar a escondidas: la FK lo impide, y la versión congelada también.
  - Los nodos no se borran.
- **`SensoryWheelNodeDetail`** — la tarjeta, de 0 a 1 por nodo: `definition`, y su `source`.
- **`SensoryWheelReference`** — referencias de la tarjeta, **de 0 a N por nodo**, porque el WCR trae varias y distintas para aroma y sabor.
  - Campos: `modality` (aroma, flavor, both), `reference`, `preparation`, `intensity` (decimal, nulo; 0–15), y `source` y `license` propios por fila, para el contenido que no sea de la fuente de la edición.
  - Lo que no está queda nulo y se muestra «sin dato».
- **Enlace de catálogo: `SensoryDescriptorWheelLink`**, en vez de una columna en `SensoryDescriptor`.
  - Campos: `descriptorId`, `wheelNodeId`, quién lo hizo, cuándo, y `retiredAt`.
  - **Sólo se añade y se retira; nunca se edita.** Cambiar un enlace no reescribe cómo se leen las catas pasadas.
  - Lo pone una persona, nunca se asigna automáticamente. Sirve para los 65 descriptores de miel.
  - No toca la clasificación ni el protocolo.

**Lo que la pieza de registro tendrá que añadir, y por qué este modelo no la obliga a rehacer.** Hoy
`SensoryDescriptorResponse` exige un `descriptorId` del protocolo y sólo guarda confianza y comentario. El
registro sobre la rueda necesitará **término libre, intensidad y ausencia explícita**, y **fijará el
`wheelNodeId` en cada respuesta** en el momento de catar, con la edición congelada. Eso es trabajo de esa
pieza. Aquí basta con que los nodos tengan clave estable, no se borren y su edición quede congelada, que es lo que §2 garantiza.

## 3. Pantallas

- **Ruta:** `/sensory/herramientas/ruedas` (lista) y `/sensory/herramientas/ruedas/[wheel]`.
  - Legibles **sin sesión** cuando `isPublic`. `proxy.ts` sólo protege `/my-nectar`, así que **el control es del servidor**, en la página y en el servicio.
  - Una rueda apagada sólo la ve quien tenga permiso de ver Sensorial. A los demás, con o sin sesión, les devuelve 404, y tampoco sale en la lista.
- **Lista:** cada rueda con su dominio, su fuente y su licencia. La sidra aparece como «sin fuente todavía» mientras no la haya.
- **Circular** (pantalla ancha): tocar una familia abre sus anillos, y el descriptor abre la tarjeta al lado.
- **Por capas** (teléfono): botones grandes, migas de pan y el buscador arriba.
- **Interruptor** de forma: se recuerda en el dispositivo; es una comodidad, no un dato.
- **Tarjeta:** los campos de §2 o «sin dato». Al pie, siempre, la atribución y la licencia.
- **Accesibilidad:** la vista circular también se navega con teclado, y cada sector tiene nombre accesible. La vista por capas es la alternativa textual completa.

## 4. Carga de datos

- **Un archivo de datos por rueda**, versionado en el repositorio (`data/sensory-wheels/<rueda>.json`), con fuente y licencia en su cabecera. Un script de importación carga cada versión **sólo en `draft`**, casando los nodos por `key`, y nada se escribe a mano en la base. Si una edición ya está publicada, el script se niega: un cambio de contenido es una edición nueva.
- **v1 entra con:**
  - **Arábica:** póster SCA/WCR 2016, texto legible.
  - **Robusta:** transcripción de la imagen dada por Daniel. Dos lecturas quedan por confirmar: «gorse» en Tropical fruit y «rasin».
  - **Miel:** rueda IHC 2001, más el enlace de los 65 descriptores existentes (hecho por una persona, §2).
- **Después, cada una en su propio cambio:**
  - **Vino, cerveza e hidromiel:** se transcriben de sus imágenes con un subagente de modelo barato, y se revisan antes de entrar.
  - **Léxico WCR** (definiciones, referencias, intensidades): el PDF tiene fuentes codificadas y el extractor actual no lo lee. Hace falta otro método local, sin subirlo a servicios externos.
  - **Sidra:** sin fuente todavía.

## 5. Pruebas

- **Árbol:** con SAVEPOINT y control de que lo válido sí entra, **no entran en la base**:
  - un nodo cuyo nivel no cuadra con el de su padre;
  - un padre de otra versión;
  - cambiar el nivel de un padre que ya tiene hijos;
  - cualquier cambio en una versión publicada.
- **Versiones:** dos `published` en la misma rueda no entran en la base, y publicar una edición pasa la anterior a `superseded` en la misma transacción.
- **Enlaces:** un enlace retirado sigue existiendo y el nuevo se añade aparte; ningún `UPDATE` cambia el nodo de un enlace.
- **Publicación:** una rueda sin licencia o sin atribución no se publica.
- **Visibilidad:** con flip-test, en la lista y por acceso directo:
  - un visitante sin sesión ve una rueda pública y no ve una apagada;
  - un usuario con sesión pero sin permiso de Sensorial tampoco ve la apagada;
  - uno con ese permiso sí la ve.
- **Importación:** cada archivo importa sin campos inventados. Reimportar sobre `draft` casa por `key` y no duplica; reimportar sobre una edición publicada **se rechaza**, incluso con enlaces existentes a sus nodos.
- **Tarjeta:** un campo nulo se ve como «sin dato», nunca vacío ni con un valor por defecto.
- Las pruebas que necesitan base van al grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.

## 6. Fuera de esta pieza

- Registro de catas sobre la rueda. El modelo ya lo admite: marcar un término crea un descriptor de cata enlazado.
- «Tu rueda».
- El campo «en el campo se dice», los kits de la tienda y la traducción al español de los términos.
- Prueba triangular, hojas de competencia, guías e imprimibles.
- La clasificación de descriptores por receta, que es de ADR-181.

## 7. Licencia: lo que decide Daniel antes de encender cada rueda

**Esto no lo decide la especificación; lo decide Daniel.** Codex señaló, y es cierto, que la rueda SCA/WCR figura como **CC BY-NC-ND 4.0**. Esa licencia prohíbe obras derivadas, y una versión interactiva redibujada puede contar como una. El permiso declarado por Daniel el 2026-09-21 queda registrado tal cual, y no se sustituye por una opinión legal nuestra.

La salvaguarda de diseño es que **ninguna rueda nace pública**: `isPublic` se enciende rueda por rueda, con la licencia de su edición a la vista.
