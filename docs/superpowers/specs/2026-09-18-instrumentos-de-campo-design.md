# Instrumentos de campo: se instalan en parcela, microparcela o bloque, y sus lecturas son del sitio donde estaban

**Estado:** borrador para revisión de Daniel, 2026-09-18.

Pieza propia. La usan la condición del día de la jornada
(`2026-09-18-jornada-y-entrega-de-cosecha-design.md` §3.5) y las condiciones del terreno
(`2026-09-18-condiciones-fijas-del-terreno-design.md` §3.4).

## 1. Lo que dijo Daniel (2026-09-18)

Corrigió un aplazamiento: yo había dicho que la lluvia en mm no podía guardarse porque una
medición no cuelga de una parcela.

> «sí se puede guindar y hacer medición de vez en cuando, así igual como la trampa de broca se
> podría tratar como identificar tal instrumento de campo está ahí, igual como la consola de la
> colmena que se podrá vincular a un bloque, microparcela y/o parcela.»
>
> «los nódulos o los smarthive consoles pueden conectar vía transmisión y red celular al sistema,
> o pueden ser descargados ahí mismo en sitio directo con un cable usb-c.»

| pregunta | respuesta |
|---|---|
| qué instrumentos | **manuales y nodos, los dos**; primero el manual |
| quién anota una lectura manual | **cualquiera en su jornada**: capataz, Farm Manager o un recolector con cuenta, si el instrumento está en lo que tiene asignado |
| batería y carga | «incluir tiempo de carga o de batería que se debe revisar o recargar, eso puede variar por instrumento» |
| cómo | **A**: el instrumento es un equipo; se instala en parcela, microparcela o bloque **por intervalos**; cada lectura es una medición atada a dónde estaba; los nodos usan la misma instalación |

## 2. Lo que hay hoy (medido sobre `origin/main`)

- **`Equipment`** con `kind = instrument`:
  - sus **modos** (`InstrumentMeasurementMode`): qué variable lee y con qué unidad;
  - sus verificaciones;
  - su historial de lugar (`EquipmentTransfer`: a qué `Location` se movió y cuándo).
- **`Measurement.instrumentId`** existe: una medición ya dice qué instrumento la tomó.
- **Una medición no puede colgar de un lugar.** Sus sujetos son lote y muestra, y tres
  independientes con regla en la base (`measurement_sujeto_no_cafe_exclusivo`: biochar, muestra
  de suelo, muestra foliar, que excluyen lote y muestra). **Ése es el precedente para añadir
  uno.**
- **Nodo de sensores** (`HiveNode`):
  - se instala **sólo en una colmena**, por intervalos (`HiveFitting`);
  - su crudo (`NodeObservation`) es inmutable, **idempotente por dispositivo, época y
    secuencia**, y guarda la colmena **del momento**;
  - entra por `POST /api/v1/ingest/notehub`, cerrada hasta que Daniel ponga el secreto.
- **El bloque (`PlotBlock`) no es una `Location`:** `EquipmentTransfer` no puede llevar un equipo
  a un bloque.

## 3. Diseño

### 3.1 La instalación en campo

- **`InstalacionEnCampo`**, una fila por intervalo:
  - **qué**: exactamente uno de un equipo (`Equipment`, `kind = instrument`) o un nodo
    (`HiveNode`);
  - **dónde**: exactamente uno de una parcela o microparcela (`Location` `plot`) o un bloque
    (`PlotBlock`);
  - `desde` y `hasta` (anulable, cerrado a la izquierda y abierto a la derecha).
- **Reglas en la base:**
  - un qué y un dónde (CHECK);
  - `hasta > desde`;
  - **una instalación abierta por equipo y una por nodo** (índices parciales únicos).
- **Un nodo no está en una colmena y en campo a la vez.** Instalar en campo cierra su
  `HiveFitting` abierto en la misma transacción, o se rechaza si la fecha choca. Y al revés.
  Probado en los dos sentidos.
- Mover un instrumento = cerrar su intervalo e instalarlo en otro sitio. **Las lecturas viejas
  siguen siendo del sitio viejo.**
- Permiso para instalar y mover: Farm Manager y capataz de la finca (`lot:manage` sobre su
  sitio). El nodo sigue exigiendo además `hive_node:manage`, porque moverlo reasigna sus datos.

### 3.2 La lectura manual

- **Es una `Measurement`** con:
  - su instrumento (`instrumentId`);
  - la variable y la unidad de uno de sus modos: se rechaza leer con un pluviómetro una
    variable que el pluviómetro no mide;
  - el valor y la hora;
  - **el lugar**, un sujeto independiente nuevo: parcela o microparcela, o bloque.
- **Reglas en la base:**
  - el lugar excluye lote, muestra y los otros sujetos independientes (un CHECK como
    `measurement_sujeto_no_cafe_exclusivo`);
  - exactamente uno de parcela o bloque;
  - una medición con lugar **exige** instrumento.
- **El lugar lo decide la instalación, no quien anota:** el servicio busca dónde estaba
  instalado el instrumento a esa hora. Si no estaba instalado, rechaza.
- **Quién anota:**
  - el capataz y el Farm Manager, con `lot:manage` sobre la finca;
  - un recolector con cuenta, durante su jornada, si el instrumento está instalado en lo que
    tiene asignado (`field_report:create_own`).

### 3.3 Los nodos en campo

- **Una sola instalación.** Un nodo en campo usa `InstalacionEnCampo`, no `HiveFitting`.
- **Su crudo guarda el sitio del momento,** igual que hoy guarda la colmena:
  - `NodeObservation` gana parcela y bloque anulables;
  - exactamente uno de colmena, parcela o bloque, **o ninguno** si en ese instante no estaba
    instalado (en cuarentena, como hoy).
- **Dos vías de entrada, un solo camino:**
  - **Por red celular:** la ruta de Notehub que ya existe.
  - **Por cable USB-C en el sitio:** se descarga el archivo de la consola y se **sube** a la
    app.
    - El archivo original se guarda como `Asset`, evidencia inmutable.
    - Cada registro pasa por el mismo `ingerirObservacion`, con origen «descarga».
    - **La idempotencia es la de siempre** (dispositivo, época, secuencia): si una lectura llegó
      por la red y otra vez en el archivo, cuenta una, y se ve que llegó por las dos.
- **El formato del archivo no se inventa.** El importador se escribe contra **un archivo real
  descargado de una consola**. Hasta tenerlo, la subida no se construye: ver §4.

### 3.4 Qué se ve

- **En la parcela, microparcela o bloque:**
  - los instrumentos instalados hoy;
  - su última lectura con fecha;
  - la historia de lecturas.
- **La lluvia se suma por día** en ese sitio, con el número de lecturas que la forman.
- **Un bloque sin instrumento propio no hereda lecturas de otro bloque.** Se muestra «sin
  instrumento aquí», con enlace a los de la parcela.

### 3.5 Batería y carga

- **Cada instrumento o nodo lleva su intervalo** de revisión o recarga, en días, anulable. Varía
  por instrumento. **Sin intervalo no hay aviso:** no se inventa uno por defecto.
- **Cada recarga o revisión se registra** con fecha, quién y nota. Es una fila inmutable en la
  historia del instrumento; se corrige anulando con motivo, como el resto.
- **Aviso cuando toca:** si desde la última recarga (o desde la instalación, si nunca se
  recargó) pasó el intervalo, el instrumento sale «le toca revisar o recargar», con los días de
  atraso, en su sitio y en la jornada de quien lo tiene asignado. Es un aviso visible en la app;
  sin notificaciones al celular en esta pieza.
- **Si el nodo informa su batería** en su paquete (voltaje o porcentaje), se muestra como la
  lectura que es, con su hora. **No sustituye al intervalo:** son dos datos distintos, y ninguno
  se deduce del otro.

## 4. Fuera de esto, y lo que le toca a Daniel

- **Un archivo real descargado por USB-C de una consola.** Sin él, la subida por cable no se
  construye.
- Gráficas y alertas (por ejemplo, «lleva 3 días sin lluvia»).
- Instrumentos en el beneficio: ya existen, con su traslado; no cambian.

## 5. Pruebas que tienen que existir

- **Instalación:**
  - un equipo en una parcela y a la vez en otra se rechaza **en la base**;
  - un qué sin dónde también;
  - lo válido entra (control positivo).
- **Nodo:** instalarlo en campo cierra su colmena; con fechas que chocan se rechaza. Y al
  revés.
- **Lectura:**
  - toma el lugar de la instalación del momento;
  - leída después de mover el instrumento, es del sitio nuevo; la de antes, del viejo;
  - sin instalación vigente se rechaza;
  - con una variable que el instrumento no mide, se rechaza.
- **Sujeto en la base:** una medición con lugar y lote a la vez se rechaza; con lugar y sin
  instrumento, también.
- **Quién:**
  - un recolector anota la del pluviómetro de su parcela asignada, y no la de otra;
  - el capataz, la de cualquiera de la finca.
- **Batería:**
  - sin intervalo no hay aviso;
  - con intervalo de 7 días y la última recarga hace 9, sale con 2 días de atraso;
  - recargar hoy lo quita (control positivo).
- **Idempotencia:** la misma observación por la ruta y por el archivo cuenta una. Esta prueba
  se escribe cuando exista el importador.
