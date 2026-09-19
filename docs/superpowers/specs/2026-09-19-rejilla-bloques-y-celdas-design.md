# La rejilla de la parcela, los bloques por rango y la celda — diseño

**Fecha:** 2026-09-19 · **Camino:** arquitectónico · **Estado:** propuesto, pendiente de la revisión escrita de Daniel
**Depende de:** PR #445 (parcela en pestañas y ronda de trampas) y del spec de fincas y parcelas, `2026-09-18-fincas-y-parcelas-design.md`, donde la microparcela es una `Location` de tipo `plot` hija de otra `plot`, creada por `createMicrolot`.

## 1. Qué pidió Daniel

Sus palabras del 2026-09-19, ordenadas: *«que pueda definir bloque son cuántas celdas de plantones, y que eso vincule con parcela y microparcela… cuántos plantones por espacio, espacio entre plantones, entre trampas, y tantos plantones por trampa. Cuando veo trampa, veo el impacto inmediato en su bloque. Si veo un bloque experimental que use tal biochar de tal lote versus otro, esos specimens dentro del bloque se pueden usar y crear cuando sea relevante. El tema es la trazabilidad aunque no se vea ahora: si yo sé que hice tal cosa a la parcela o microparcela, cada celda está afectada; si hago algo a esta celda, bloque o microparcela, es la lógica.»*

Y el caso que lo obliga a ser concreto: *«la Noria 1 tiene capacidad máxima de 160 usos para 160 plantones, uno a uno, y la Noria 2 para 340. Un lote que sembramos lleva 600 plantones, así que la mitad llevó de una noria y la otra parte de otras dos. Hay que revisar si la trazabilidad del biochar es por receta y microparcelas, y no por noria 1 o 2.»*

## 2. Decisiones de Daniel (2026-09-19)

| pregunta | decisión |
|---|---|
| qué es una celda | **el sitio de una planta**. No se siguen todas una a una, pero cualquiera puede convertirse en un `Specimen` con historia propia cuando sea relevante |
| cómo existen las celdas | **mixto**: se materializan sólo en los bloques marcados **de seguimiento**; el resto de la parcela son cuentas y posiciones calculadas |
| cómo se dice qué celdas forman un bloque | **por rango**: «hileras 3 a 6, plantas 10 a 40». Un bloque irregular se describe con dos o tres rangos |
| desde dónde se numera | **desde un punto fijo de la parcela**. «Hilera 12, planta 30» nombra siempre la misma planta |
| la microparcela | **usa la numeración de su parcela**; es un rango de celdas, no una rejilla aparte |
| qué plantas cubre una trampa | **su bloque**. Las distancias sólo **proponen** el rango al dar de alta; se guarda el rango real, no una regla |
| cómo se guarda una aplicación | **el alcance** (parcela, microparcela, bloque o celdas) **y además celda por celda en los bloques de seguimiento** |
| biochar: receta o noria | **las dos**: se registra qué noria y qué lote fue a qué celdas; la comparación por receta se calcula sumando norias |

## 3. Lo que ya existe — medido el 2026-09-19

| qué | dónde | qué da, y qué le falta |
|---|---|---|
| área y marco de siembra de la parcela | `Location.areaHectares`, `Location.plantSpacingMeters` | un solo valor de marco; **no hay hileras, ni origen, ni distancia entre hileras** |
| plantas y marco real de la siembra | `PlantingCohort.plantCount`, `rowSpacingMeters`, `plantSpacingMeters` | el conteo real por siembra; **no dice dónde está cada planta** |
| bloque | `PlotBlock`: `name`, `blockType` (`trampa \| experimental \| null`), `description`, sus `Specimen` | **no tiene celdas, ni rango, ni recuento** |
| microparcela | `Location` `plot` hija de otra `plot`, por `createMicrolot` | hereda atributos de terreno; **no tiene rango dentro de la parcela** |
| trampa | `Specimen` con `trapNumber` por finca, `plotBlockId` opcional | **no dice qué plantas cubre** |
| biochar | `BiocharBatch` (materia prima, horno, temperatura, carga/inoculación) | el lote de producción; **no existe «noria», ni a qué plantas fue cada dosis** |
| manejo fitosanitario | pantallas de manejo de `main` | se aplica a una ubicación; **no distingue bloque ni celda** |

## 4. El modelo

### 4.1 La rejilla de la parcela

La parcela (`Location` de tipo `plot`, incluidas las microparcelas) gana su rejilla:

| campo | nota |
|---|---|
| `gridOrigin` | desde qué esquina se cuenta, por ejemplo «noroeste» o «arriba mirando cuesta abajo». Texto de un catálogo corto, no libre |
| `rowCount` | cuántas hileras |
| `plantsPerRow` | cuántas plantas por hilera |
| `rowSpacingMeters`, `plantSpacingMeters` | las dos distancias, separadas |
| `trapSpacingMeters`, `plantsPerTrap` | **sólo para proponer** la cobertura de una trampa nueva |

Todos anulables: una parcela sin rejilla sigue funcionando y las pantallas dicen «sin rejilla», nunca un número supuesto (ADR-080). El total de celdas es `rowCount × plantsPerRow`, **calculado, nunca guardado**, para que no envejezca.

**Una celda se nombra `(hilera, planta)`** y ese par vale en toda la parcela: microparcelas, bloques y trampas comparten coordenadas. Por eso una misma planta puede estar a la vez en el bloque de una trampa y en uno experimental.

### 4.2 El rango

Un **rango** es `hileraDesde, hileraHasta, plantaDesde, plantaHasta`, con los dos extremos incluidos. Una microparcela tiene **un** rango dentro de su parcela madre. Un bloque tiene **uno o varios**, porque un bloque real rara vez es un rectángulo perfecto.

Reglas que vive la base, no sólo TypeScript: los extremos son ≥ 1, el desde ≤ el hasta, y el rango cabe dentro de la rejilla de su parcela.

### 4.3 La celda

Una celda **no es una fila** mientras nadie la siga. Un bloque marcado **de seguimiento** materializa las suyas: cada celda pasa a ser un `Specimen` de tipo planta, con su `(hilera, planta)`, su bloque y su parcela. Así una planta de un experimento tiene historia propia, y las demás no cuestan nada.

Materializar es explícito y reversible sólo hacia adelante: desmarcar el seguimiento **no borra** las celdas ya creadas, porque lo que pasó pasó.

### 4.4 La trampa y su cobertura

La trampa se pone en una celda y su **bloque de trampa** dice el rango que vigila. Al darla de alta, el formulario propone ese rango con `trapSpacingMeters` y `plantsPerTrap`; Daniel lo confirma o lo corrige, y **se guarda el rango, no la regla**: si mañana se mueve una trampa, lo guardado sigue siendo cierto.

### 4.5 La aplicación y su alcance

Cualquier cosa que se aplica —manejo fitosanitario, biochar, riego— guarda **su alcance**: la parcela, la microparcela, un bloque o unas celdas concretas. La historia de una planta se responde recorriendo hacia arriba: sus celdas, su bloque, su microparcela y su parcela.

**Y además**, en los bloques de seguimiento, la aplicación queda anotada celda por celda, que es la decisión mixta de Daniel: la consulta del experimento es inmediata y no depende de recorrer nada.

### 4.6 El biochar, la noria y la receta

- **`BiocharRecipe`**: qué se compara. Un nombre y su descripción; los lotes la citan.
- **`Noria`**: el aparato, con su **capacidad en dosis** —Noria 1: 160; Noria 2: 340—. Es una instalación, no un lote.
- **`BiocharCharge`**: una carga concreta = una noria + un `BiocharBatch` + su receta + cuántas dosis salieron y cuándo.
- **`BiocharApplication`**: a qué celdas fue esa carga, con su alcance como cualquier otra aplicación.

Con eso, una siembra de 600 plantones que usó tres cargas queda registrada tal como ocurrió, y la comparación «receta A contra receta B» se calcula sumando cargas. Si una noria sale mal, se sabe exactamente qué plantas la recibieron: es la pregunta que hoy no tiene respuesta.

## 5. Las pantallas

- **Ajustes de la parcela gana «La rejilla»:** origen, hileras, plantas por hilera y distancias. Al guardar muestra el total de celdas **y lo compara** con las plantas de las siembras registradas: si difieren, enseña las dos cifras y su diferencia, sin elegir una ni corregir nada.
- **Alta de microparcela y de bloque:** se escribe el rango, y debajo aparecen cuántas celdas suma y con qué otros bloques se solapa. La casilla **de seguimiento** avisa de cuántas celdas va a crear antes de crearlas.
- **Alta de trampa:** al elegir su celda, propone la cobertura; se puede ajustar antes de guardar.
- **Pestaña «Trampas y bloques»:** cada trampa dice cuántas plantas cubre y en qué microparcelas cae; cada bloque, su rango, sus celdas y, si es experimental, qué compara.
- **Ficha de la celda**, sólo para las materializadas: qué recibió y por qué alcance.
- **La ronda no cambia de formulario.** Una trampa con lectura alta añade una línea: «cubre 24 plantas de Microparcela Norte».

**Fuera de esta fase, a propósito:** mapas y GPS por planta, dibujar la rejilla en un plano, resiembras que renumeran, y rendimiento por celda.

## 6. Permisos

Todo cuelga de la parcela y usa sus compuertas actuales: configurar la rejilla y los rangos exige el permiso de configurar la parcela; ver celdas y bloques exige poder ver esa parcela; las trampas siguen con el permiso de trampas. **Nada nuevo se decide en el cliente.**

## 7. Las tres entregas

1. **La rejilla y la microparcela como rango.**
2. **Bloques por rango, con trampas y su cobertura** en el tablero y en la ronda.
3. **Celdas materializadas, alcance de las aplicaciones y el biochar con noria, carga y receta.**

Cada una funciona sola y termina con un recorrido en el navegador con Daniel.

## 8. Cómo se sabrá que funciona

- **Ninguna cifra inventada:** sin rejilla, «sin rejilla»; celdas y plantas que no cuadran se muestran las dos, con su diferencia.
- **Los rangos no mienten:** un rango fuera de la rejilla se rechaza; al guardar se dice con qué bloques se solapa.
- **La historia de una celda:** una aplicación a la parcela aparece en la celda; una al bloque, sólo en sus celdas; una a otra microparcela, no aparece.
- **Biochar:** una siembra con tres cargas de dos recetas responde bien a «qué recibió esta planta» y a «receta A contra receta B», y a «qué plantas recibieron la Noria 2 el día tal».
- **Permisos:** quien no ve la parcela no ve sus celdas, sus bloques ni sus aplicaciones.
- **Materializar no es adivinar:** un bloque de seguimiento con un rango de 24 celdas crea 24, ni una más, y desmarcarlo no borra ninguna.
