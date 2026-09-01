# S1 — Suelo, ambiente y taza: qué modelar, en qué orden, y qué ya existe

Plan derivado de *«Las Nubes Cerro Azul — Soil, Environment and Cup Quality:
Research Framework v1.0»* (13.345 palabras, aportado por el dueño el
2026-08-31). **No lo sustituye ni lo resume**: traduce su Tabla 15 —el modelo de
datos suelo→planta→cereza→taza— a lo que este repositorio ya tiene, lo que le
falta, y cuándo hace falta cada cosa.

**Leer primero:** el propio marco, §15 (modelo de datos), §10 (diseño
experimental), §14.1 (diseño de muestreo) y el Plan de Acción de una página, que
ya asigna semanas y dueños. Este documento sigue **su** secuencia, no una
nuestra.

---

## 0. La restricción que manda sobre todo lo demás

El marco tiene una recomendación por encima de las otras, y es una prohibición:

> Ningún bloque nuevo de Green Tip Geisha debe recibir biochar, compost ni
> fertilizante hasta que existan sobre papel la química de suelo base, la física
> de suelo base y un lote de biochar caracterizado.

Enmendar antes de medir **destruye la línea base de forma permanente, y ningún
trabajo posterior la recupera**. El Paso 1 del plan de acción es «parar», y la
firma al pie —Bob Huerbsch, Sherry Huerbsch, Daniel Giráldez— lo llama Gate 0:
química de suelo completa recibida, calicatas descritas, biochar caracterizado y
el protocolo escrito. *«Si falta alguno, no se aplica. Sin excepciones.»*

**Lo que eso implica para el software, y es lo único que lo implica:** la primera
fila que el sistema escriba sobre un bloque de investigación tiene que poder ser
la **línea base**, no la enmienda. Un sistema que sólo sabe registrar
aplicaciones empuja en la dirección contraria a una decisión ya firmada.

---

## 1. Qué ya existe, medido contra la Tabla 15

La Tabla 15 tiene **catorce entidades**. **Ocho tienen dónde vivir hoy**:

| Tabla 15 | En este repositorio | Estado |
|---|---|---|
| Block | `Location` (`locationType: plot`) | Completo salvo *aspect* — ver §2 |
| Tree record | `Specimen` (F1) | Existe |
| Physiology observation | `SpecimenObservation` | Existe |
| Phenology event | `SpecimenObservation` con `bloom_start/peak/end` | Existe, sin pantalla |
| Cherry sample | `Sample` + `Measurement` (`brix`) | Existe |
| Harvest lot | `HarvestEvent` + `Lot` + `HarvestEventSource` | Existe, con atribución por bloque |
| Green coffee record | `Lot` (`green`) + `Measurement` | Existe |
| Sensory evaluation | `SensorySession` con códigos ciegos | Existe |

### 1.1 Y el andamiaje experimental, que la Tabla 15 no lista

El diseño del ensayo no es una fila de la Tabla 15, pero §10 lo exige y **ya
está modelado**: `ResearchProgram` → `Hypothesis` → `Experiment` →
`Protocol`/`ProtocolVersion` → `TreatmentBatch`.

Lo notable es `Experiment.controlTreatmentBatchId`: apunta al `TreatmentBatch`
que **es** el control declarado de ese experimento, y es único. §10.3 argumenta
que un bloque tratado que rinde más en 2029 que en 2028 no dice nada —el rendimiento
oscila por añada, lluvia, floración, plagas y edad del árbol—, y que sólo la
comparación contra un control adyacente en el mismo año significa algo. El
esquema ya trata ese control como estructura y no como convención de nombres.

### 1.2 El bloque ya lleva casi todas las propiedades que la Tabla 15 le pide

`areaHectares`, `altitudeMinM`/`altitudeMaxM`, `slopeDescription`,
`shadePercentage`, `sunExposure`, `latitude`/`longitude`, `soilType`,
`plantSpacingMeters` — y desde el 2026-08-31 hay formulario para capturarlas.

Faltan dos: **aspect** (§2, semanas 1–4) y el **límite** del bloque —
`latitude`/`longitude` es un punto y el Paso 3 pide «GPS boundaries». El polígono
es trabajo geoespacial aparte y no bloquea nada del Año 0; se anota y no se
propone.

---

## 2. Qué falta, y cuándo hace falta

**Seis** de las catorce entidades no existen. El orden de abajo **es el del Plan
de Acción**, con sus semanas, no una prioridad nuestra.

### Semanas 1–4 · `Location.aspect` (Paso 3)

Un campo, en una tabla que ya tiene formulario. El Paso 3 pide elegir cuatro
bloques que abarquen la variación real de *pendiente, orientación, sombra y
suelo aparente*; sin orientación, el sistema no puede sostener el criterio con el
que se eligieron. Cero menciones de `aspect` en el esquema hoy.

Es lo más barato de todo el plan y habilita el Paso 3, así que va primero.

### Semanas 1–4 · Lote de biochar (Paso 2)

**La primera entidad nueva que el sistema tiene que poder recibir**, porque el
Paso 2 es «escribir lo que Bob ya hace» y el Paso 8 no puede empezar sin ella.

Un `BiocharBatch` con los campos de la Tabla 6: materia prima, fuente y especie,
humedad, diseño del horno, régimen térmico, duración, manejo de oxígeno, apagado,
tamaño de partícula, envejecimiento, material y tiempo de carga, dosis,
frecuencia, parcela y número de lote. Más fotos del retorte y del proceso —
`Asset` ya sabe colgarse de cualquier entidad.

**Por qué entidad propia y no `Lot`:** un lote de biochar no recorre la cadena de
trazabilidad del café; no se cosecha, no se fermenta, no se cata. Reusarlo
obligaría a un `lotType` que no describe nada y a que la maquinaria de balance de
masa opine sobre algo que no le concierne. §9.2 se titula «Biochar is not one
material», y la caracterización es el punto entero.

### Semanas 3–6 · Registro físico de suelo / calicata (Paso 4)

Una calicata por bloque, de 80–100 cm: horizontes, color, estructura, textura al
tacto, profundidad y distribución de raíces, moteados, colores grises, capas
impedimento, y fotos de cada perfil con escala.

El marco dice de este paso que *«cuesta casi nada y probablemente producirá la
observación más útil del Año 0»*, y en §19 lo llama la actividad de mayor valor y
menor coste de todo el programa. Es **descripción, no análisis**: no depende de
ningún laboratorio, y por eso puede aterrizar antes que nada químico.

La entidad «Soil physical record» de la Tabla 15 mezcla dos cosas: la
**descripción del perfil** (texto y fotos, una por bloque y por año) y las
**lecturas físicas** —densidad aparente, resistencia a la penetración con humedad
pareada, infiltración— que son valores con unidad, fecha y procedencia, es decir
`Measurement`. Propongo `SoilProfile` para lo primero y `Measurement` para lo
segundo; que la resistencia a la penetración **exija** la humedad del momento es
una validación de servicio, no un modelo nuevo.

### Semanas 6–10 · Muestra de suelo y resultados de laboratorio (Paso 6)

Aquí también hay **dos cosas distintas** y conviene no fundirlas:

1. **La muestra** — `SoilSample`: bloque, parcela, profundidad (0–20, 20–40,
   40–60 cm), fecha, composición del compuesto, punto de muestreo permanente y
   etiquetado, laboratorio, método de extracción.
2. **El resultado** — una lectura con unidad, procedencia y calidad de dato. Eso
   es `Measurement`, que ya distingue `measured_fact` de estimación y ya sabe
   superseder una corrección sin borrar la original.

**Lo que hace falta en `Measurement` es vocabulario, no estructura**: pH, CEC
efectiva, acidez intercambiable, Al intercambiable y el resto de la Tabla 3. El
enum de variables se amplía; el modelo no cambia. Y §14.1 manda una regla dura
que el modelo debe poder expresar: *compositar dentro de una parcela y una
profundidad; **nunca** entre tratamientos ni entre profundidades*. Un compuesto de
10–15 submuestras es una `SoilSample`, no quince.

**Por qué `SoilSample` y no `Sample`:** `Sample.sampleType` es texto libre y
`locationId` ya existe, así que técnicamente cabría. Pero `Sample` está atado a la
cadena del café —`sourceLotId`, `sourceTransformationId`, `externalOrigin`,
`blindMappings`, entradas de competencia— y ninguno de esos campos significa nada
para un puñado de tierra. Es la misma línea que ya se trazó entre `Specimen` y
`Lot`.

### Semanas 6–10 · Muestra foliar (Paso 6)

Misma ronda de laboratorio, y por eso mismas semanas: `FoliarSample` — parcela,
fecha, estado fenológico, par de hojas, posición en el dosel, laboratorio; los
resultados N–Cu son `Measurement`.

La Tabla 14 pide **dos rondas al año** con el mismo protocolo acordado por
escrito con el laboratorio, así que el protocolo importa tanto como el resultado:
sin estado fenológico y posición de dosel registrados, dos rondas no son
comparables. Es la entidad más pequeña del plan y comparte forma con
`SoilSample`, pero no sujeto.

### Semanas 4–10 · Microclima (Paso 7)

`Sensor`, `SensorDeployment` y `EnvironmentalObservation` — **ninguno existe hoy
en el esquema**, pese a estar en la lista de entidades de `CLAUDE.md` §52.
Variables: T aire, HR, VPD, T suelo, humedad de suelo, lluvia, humedad foliar,
PAR, con una estación de referencia a cielo abierto fuera del dosel.

**Esto es serie temporal y hay que tratarlo como tal.** `CLAUDE.md` §38 lo pide
desde el principio: arquitectura separada, pensada para millones de
observaciones, sin degradar la base transaccional. Un registro cada quince
minutos por sensor son ~35.000 filas por sensor y año.

El marco añade una urgencia que ninguna otra parte tiene: *«empezar el registro
ahora — cada mes de retraso es un mes del caso ambiental de Las Nubes que nunca
se recuperará»*. Pero **la urgencia es de instalar los instrumentos, no de tener
la pantalla**: un logger guarda en su propia memoria y se descarga después. Lo
primero que el software necesita es **poder ingerir un volcado con su procedencia
intacta**, no un formulario de captura manual.

### Semanas 10–14 · Aplicación de enmienda (Paso 8)

Parcela, código de tratamiento (T0–T4), `BiocharBatch`, dosis, método,
profundidad, fecha, operador. Y sólo cuando la química base y la caracterización
del biochar estén ambas en mano.

**Aquí está la decisión de diseño de verdad.** `TreatmentBatch` existe, cuelga de
un `ProtocolVersion` y apunta a un `Lot` opcional — está construido alrededor de
**material que se procesa**. Un tratamiento de campo se aplica a **terreno**, y
`TreatmentBatch` no tiene `locationId`. Dos caminos, y no son equivalentes:

- **(a)** Dar a `TreatmentBatch` un `locationId` opcional y reusarlo.
- **(b)** Entidad propia `AmendmentApplication`, ligada al `Experiment`.

Recomiendo **(a)**, y no por economía: porque el control experimental ya vive en
`Experiment.controlTreatmentBatchId` apuntando a un `TreatmentBatch`, y una
entidad paralela dejaría al T0 del marco —el control sin tratar, que §10.3 llama
no negociable— sin poder ocupar ese campo. El coste es que `TreatmentBatch`
significa dos cosas según a qué apunte; se paga con un comentario y una
restricción de que exactamente uno de `lotId`/`locationId` esté presente.

**No la implemento sin que el dueño elija**: toca el módulo de investigación, que
esta sesión no ha revisado.

---

## 3. Por qué este orden y no el de la Tabla 15

Los Pasos 1 a 5 del marco producen sobre todo **papel y decisiones**: una
prohibición, un protocolo escrito, cuatro bloques elegidos, cuatro calicatas
descritas y unas cotizaciones. De todo eso, lo único que el sistema recibe antes
de la semana 6 es un campo (`aspect`), la caracterización del biochar y la
descripción de las calicatas.

Se construye **en el orden en que el dato aparece**, no en el orden en que el
modelo se lee. Empezar por el microclima —que es lo más vistoso— daría una
pantalla sin filas durante dos meses, que es exactamente el error que este
repositorio ya cometió con el módulo de apiario y con la selección.

---

## 4. Lo que este plan NO propone

- **Polígono del bloque** (§1.2). Trabajo geoespacial real; no bloquea el Año 0.
- **Nematodos.** El Paso 6 los incluye en la misma ronda. Un conteo es un
  `Measurement` sobre una muestra de suelo; no hace falta entidad. Se decide con
  el vocabulario, no antes.
- **Nada del laboratorio.** §13.1 es explícito sobre no construir uno; el
  software sólo recibe resultados.
- **Tocar `nextActionFor` ni la cadena del café.** Esto cuelga del Research OS,
  no de trazabilidad.
- **Ninguna migración.** Este documento es el plan; el esquema no se toca hasta
  que §6 esté resuelto.

---

## 5. Una discrepancia de nombres que conviene resolver antes

El documento llama **«Las Nubes»** a la finca, de principio a fin. En el
registro, desde el 2026-08-29 y por decisión del dueño, **Las Nubes es el
beneficio**, la finca es **Finca Rosina** y Cerro Azul es la localidad. Existe
además otra «Finca Las Nubes», en Jaramillo Arriba, de Agustín Gómez, que nunca
debe confundirse con ésta.

No es cosmético: si el marco circula fuera —y está escrito para circular, con
firmas al pie— el primer informe que cruce ambos tendrá dos nombres para el mismo
sitio. **Lo señalo, no lo corrijo.** La decisión es del dueño: alinear el
documento, o registrar explícitamente que «Las Nubes» ahí significa Finca Rosina.

---

## 6. Lo que hace falta decidir antes de escribir código

1. **`TreatmentBatch` con `locationId`, o `AmendmentApplication` aparte** (§2,
   semanas 10–14). Recomendación: la primera, por el control ya modelado.
2. **Dónde vive la serie temporal del microclima** — dentro de Postgres con
   particionado, o fuera. `CLAUDE.md` §38 pide arquitectura separada y no dice
   cuál.
3. **El nombre de la finca** (§5).

Ninguna es enteramente técnica, y por eso ninguna se resuelve aquí.
