# Brechas de operación de finca, investigación y migración — consolidación y dirección

**Documento de dirección, no de implementación.** Consolida lo que surgió en
una sesión larga de trabajo con el product owner, en la que aparecieron
brechas reales que ninguna revisión previa había nombrado. Su propósito es
que esas brechas queden registradas con su análisis y su prioridad, no que
se construyan todas.

**No implementar nada desde este documento.** Cada sección que amerite
construcción tendrá su propio ticket, con su propia aprobación.

---

## 1. Lo que cambió en el entendimiento del proyecto

Hasta ahora la plataforma se había tratado como una herramienta de
trazabilidad: cereza a taza, colmena a miel. El modelo lo hace bien y está
construido.

Lo que se aclaró en esta sesión es que **el usuario principal a cinco años
es el product owner y su equipo**, operando múltiples proyectos propios y
de asesoría — Las Nubes Cerro Azul (café y apiario), Cafelino, CryoBloom,
Kiva, San Juan. Los clientes operando sus propias fincas son una posibilidad
posterior, como producto o servicio, no el caso de uso que hay que resolver
primero.

Eso reordena todo: las brechas que aparecieron no son desvíos del alcance,
son **el trabajo que la plataforma tiene que sostener**. Una práctica de
asesoría e investigación agrícola incluye producto, pero también conocimiento
acumulado, trabajo de finca que no es un batch, y datos históricos de años
anteriores al software.

**El criterio de éxito, en palabras del product owner:** *"valió la pena
cuando mi equipo de apicultores, y Bob y Sherry, puedan conmigo usar este
software y ver reconocimiento de todos los aspectos y trazabilidad."* No
cuando esté construido — **cuando esté en uso.**

**Y el dolor principal declarado es la migración**: meter la data que ya
existe, de antes del software. Eso no es una tarea accesoria; es
aproximadamente un tercio del proyecto, junto con construir y usar.

## 2. Terminología — decidida, pendiente de aplicar

En español "lote" es ambiguo y hoy la interfaz lo usa mal.

| Concepto | Palabra en interfaz | Entidad |
|---|---|---|
| Parcela de terreno con cafetos | **Lote** | `Location` |
| Café cosechado que se procesa | **Batch** | `Lot` |

"Batch" es deliberado: es la palabra que el product owner ya usa en cerveza
e hidromiel, así que unifica vocabulario entre dominios.

**Es cambio de i18n únicamente.** El esquema sigue diciendo `Lot`; cambiarlo
costaría una migración sin ganancia.

## 3. Estructura de finca — el punto de entrada está invertido

Hoy la aplicación entra por `/lots` y `/apiaries`. El product owner lo
describe al revés: primero se entra a la finca, se ve qué se maneja ahí
—café, cacao, abejas, beneficio— y de ahí se baja al detalle.

**Jerarquía que la interfaz debería reflejar**, toda soportada hoy por
`Location` con `parent_location_id`:

```
Finca
├── Lotes de terreno (con cafetos)
│   └── Microlotes (subdivisión posterior — ver §4)
├── Beneficio
├── Cuarto de secado
├── Área de noria / biochar
├── Semillero
└── Apiarios
```

Beneficio, noria y semillero son `Location` igual que los lotes — el product
owner los llama "áreas" o "departamentos", pero estructuralmente son lo
mismo. No hace falta concepto nuevo.

`ProjectDomainTag` ya modela que un proyecto tenga varios dominios a la vez
(café + cacao + apicultura), así que una finca multi-cultivo ya está
soportada.

**Falta:** una vista de finca como punto de entrada. Pantalla nueva, sin
esquema nuevo.

## 4. Atributos de lote y microlotes

### 4a. Atributos estables — la brecha más urgente de esta lista

Un lote tiene condiciones que no cambian año a año y que son la base de
cualquier análisis de terroir posterior:

- **Exposición solar**: sol pleno / mañana / tarde / ambas
- **Porcentaje de sombra**: en tramos (20/30/50/70/90)
- **Rango de altitud** — importante: en Cerro Azul un mismo lote va de 600 a
  650 msnm, y en otras fincas de 1200 a 1500. El rango dentro de un lote es
  precisamente lo que justifica subdividirlo después.
- **Pendiente**
- **Tipo de suelo**
- **Distancia entre plantas**
- Campo de nota libre junto a los valores fijos — si algo no cabe en la
  lista, tiene que poder anotarse sin perder la estructura

**Precipitación NO va aquí.** Es medición, no atributo: cambia a diario y
pertenece a `EnvironmentalObservation` (especificado, no construido).
Congelarla como campo del lote sería registrar como estable algo que varía.

**Por qué es urgente:** sin esto, los batches de la cosecha de
noviembre–abril no se pueden correlacionar después con las condiciones que
los produjeron. Es información que no se reconstruye.

### 4b. Microlotes — descubrimiento humano, nunca automático

Un microlote aparece cuando, después de varias cosechas, se nota que la
parte alta de un lote cata distinto que la baja. Se crea retroactivamente,
con una razón registrada: altitud, sombra, pendiente.

Estructuralmente ya está soportado — `Location` con `parent_location_id`.

**Dos reglas que se derivaron explícitamente y deben respetarse:**

1. **Un batch cosechado antes de que existiera el microlote solo puede
   atribuirse al lote completo.** No se reasigna retroactivamente. El
   registro dice lo que se supo en su momento — la misma disciplina de
   procedencia que rige el resto de la plataforma.
2. **El sistema no puede detectar microlotes, y no debe intentarlo.** Se
   evaluó y se descartó: para detectar diferencias internas haría falta que
   ya estuvieran cosechados por separado, lo cual implica que la
   subdivisión ya la hizo un humano. Es circular. La observación humana
   decide; el sistema registra la decisión.

### 4c. Vínculo batch → lote de terreno

`Lot.locationId` ya existe. Lo que falta es que el flujo de cosecha **exija**
decir de qué lote viene el batch, y que el reporte muestre las condiciones
del lote junto a los puntajes de sus batches.

**Advertencia honesta sobre el análisis:** con una sola temporada hay
trazabilidad, no correlación. El valor es acumulativo — razón de más para
capturar desde noviembre en vez de analizar ahora.

## 5. Trabajo de finca que no es un batch — la brecha más grande

En una sola sesión aparecieron cuatro hechos reales sin dónde registrarse:

- 600 huecos cavándose ahora
- Limpieza de tres sitios de apiario por Kenis
- 600 plantones de Caturra recibidos de Cafelino el 8 de agosto
- Noria activada para fermentar biochar

`labourEntry` y `materialConsumptionEntry` (T12.6) registran trabajo contra
un `Lot` o una transformación. **Ninguna de las cuatro es contra un batch** —
son contra un lugar.

**La forma de la brecha, en palabras del product owner:** *"lo que me importa
saber es dónde está cada set de huecos por lote, y qué plantones entraron
acá."* El trabajo se registra contra el lugar donde ocurre.

Alcance de lo que necesita registrarse contra `Location`:

- Preparación de terreno (huecos, socoleo, limpieza)
- Vivero y semillero
- Siembra (qué varietal, cuántos, en qué lote, cuándo)
- Recepción de material vegetal (los 600 plantones, con origen y fecha)
- Insumos aplicados (nutrientes, biochar, cal, tratamientos)
- Producción de compost y biochar
- Mantenimiento

**Un tratamiento a un lote entero y un tratamiento a plantas específicas
deben poder coexistir** — Sherry fumiga el Lote 2 completo; el product owner
trata tres plantas con roya. Ambos son válidos y no son el mismo registro.

**Costos:** deliberadamente fuera. `20_CAPTURE_OR_LOSE_IT` fijó el criterio —
capturar hechos físicos, diferir lo monetario a v2. El pago a Kenis, los $650
de plantones, los $400 de gallinaza: se registran cuando exista el modelo de
economía operacional.

## 6. Specimens — muestreo estratificado, esquema ahora

El product owner definió un enfoque metodológicamente sólido: **no taggear
las 2.500 plantas, sino 50–100 por lote elegidas por sector** — arriba,
abajo, más y menos expuestas — *"por si acaso un futuro hay microlotes."*
Explícitamente no solo las bonitas, porque eso sesgaría el análisis.

Volumen resultante: ~150–300 Specimens de observación en los tres lotes de
Catuaí, más los 600 plantones nuevos que sí se siguen individualmente por
ser material de estudio.

Requisitos:

- **Sector dentro del lote** — el dato que falta. Sin él, 50 plantas del
  Lote 2 no se distinguen entre alta y baja. Puede ser campo simple
  (alto/medio/bajo) o grid de fila y posición; el grid es más preciso pero
  exige numeración física en campo.
- Identificación por posición en grid, **no por GPS** — el dosel arruina la
  precisión, problema que `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §6 ya
  había tenido que resolver.
- La mayoría de las plantas no tendrá datos casi nunca. Está bien: el
  Specimen existe como referencia y acumula observaciones solo cuando pasa
  algo.

**Trampas de broca no son Specimens.** 30 botellas en campo, revisadas cada
dos semanas, con espacio para 10–20 más. Tienen ubicación, estado y
revisiones propias — más cercanas a equipo que a planta. Decidir si son
entidad propia o un tipo distinto.

**Decisión del product owner: esquema ahora, interfaz después de diciembre.**
Los plantones tienen seis meses y no dan fruto hasta 2031; las observaciones
pueden ser manuales mientras tanto. Esto sigue el patrón que
`DOMAIN_MODEL.md` §7 ya establece — especificar sin implementar es el punto
de modelar por adelantado.

## 7. Brechas en la cadena de café

### 7a. `RoastSession` — no existe

Ya se verificó que la bifurcación funciona: un lote verde tostado de tres
maneras produce tres batches vía `lot_transformation`, cada uno con su
muestra y su puntaje. **La distinción no es consultable** — "tueste claro
filtro" versus "medio espresso" vive en el código del batch y en notas
libres.

Falta el registro tipado: perfil, curva, equipo, tostador, y **humedad y
densidad del verde justo antes de tostar** — que no es la misma medición que
la de almacenaje, sino un estado del material en un momento específico.

**Caso que amplía el requisito:** el mismo café tostado por distintos
tostadores en distintos equipos, catado simultáneamente en la misma mesa.
El tostador es una variable del experimento, no solo un actor.

`23_RECIPES_FORMULATION_AND_DISTILLATION.md` ya recomendó especificar
`RoastSession` junto a `DistillationRun` — misma forma de problema.

### 7b. Selección y clasificación por defectos — no existe

Tres partes distintas:

- **Balance de masa por etapa** — cereza → pergamino → verde → tostado.
  `QuantityEvent` probablemente ya lo lleva; **verificar con los tres batches
  reales antes de asumirlo**.
- **Humedad en pergamino versus verde sin pergamino** — dos estados del
  mismo material; si la trilla es una transformación, cada estado es un lote
  distinto y `Measurement` aplica.
- **Clasificación por defectos** — no existe. Qué porcentaje salió con broca,
  roto, con puntos de humedad, decolorado, o separado por tamaño de criba.
  Estructuralmente parece una transformación con varias salidas: entra verde
  sin clasificar, salen categorías con su peso cada una — la misma
  bifurcación ya probada.

**Nota de copyright:** la taxonomía de defectos de SCA tiene categorías
publicadas. Aplica la misma disciplina que con BJCP — el concepto del oficio
es libre, la redacción publicada de SCA no.

### 7c. Agua

No se había mencionado nunca. Cantidad usada en despulpado y lavado, y su
origen — río, quebrada, pozo. **Ya es variable experimental**: los protocolos
PE distinguen río de quebrada. `23_` la trata como material de proceso de
primera clase para cerveza; en café aplica igual.

### 7d. Clima durante el proceso

No es lo mismo secar en semana seca que con lluvia. `EnvironmentalObservation`
está especificado y sin construir. Para correlacionar puntajes con
condiciones, pesa tanto como los atributos del lote.

## 8. Research OS y los protocolos PE — el conjunto de datos más valioso

**PE-77 a PE-112: más de treinta protocolos de post-cosecha en Cafelino**,
dirigidos por el product owner con Eliecer y Roberto, con variables
controladas y aisladas:

- Agua de río versus quebrada
- Con levadura versus sin levadura
- Fermentación vertical versus horizontal
- Bolsa acostada versus parada
- Volumen: una lata versus lata y media

Con mediciones de Brix, pH y humedad hasta secado y taza, más apuntes y
fotos.

**Eso no es documentación de procesos — es diseño experimental**, y es
exactamente lo que Research OS modela (`ResearchQuestion → Hypothesis →
Experiment → Protocol → ProtocolVersion → TreatmentBatch`), que está
especificado y sin construir.

**Hallazgo que facilita mucho la migración: las hojas tienen estructura
consistente entre protocolos** — mismos campos, distinto detalle. Es **un
solo mapeo, no treinta**.

**Advertencia de diseño:** el product owner pidió que los factores "se puedan
medir siempre, aunque sean opcionales". Un campo opcional es un campo vacío
la mayoría de las veces — ya se vio con `provenanceClass`. Lo que hace falta
no son más campos opcionales, sino **protocolos con su lista de mediciones
definida**: si un batch corre bajo PE-89, el sistema sabe qué medir y cuándo.
Eso es `ProtocolVersion` haciendo su trabajo.

## 9. Migración — un tercio del proyecto, sin diseño

Dos trabajos distintos, no uno:

**Datos estructurados (Sheets).** Protocolos PE, mediciones, puntajes CVA de
Gabriel Cruz y Kurt Ngo. Estructura consistente → un mapeo. Volumen chico en
megas.

**Fotos y documentos (~2 GB).** Fase A de `MEDIA_INTELLIGENCE_PIPELINE.md` ya
tiene el diseño completo: catalogar desde Drive a R2, etiquetado asistido
después. `DRIVE_ORGANIZATION_SCHEME.md` ya auditó el Drive real y encontró
exactamente este problema.

**Vínculo entre ambos: fecha y hora.** Las fotos tienen poca relación
identificable entre sí a simple vista, pero el orden calendario sí las ubica.
Una foto del 14 de enero a las 10am junto a un PE-89 de ese día es
asociación probable, no hecho — que es exactamente lo que
`MEDIA_INTELLIGENCE_PIPELINE.md` §5a diseñó: sugerencias pendientes de
revisión humana, nunca aceptadas automáticamente.

**Muchas fotos son repetidas del mismo momento** y hay que elegir la de mejor
calidad y perspectiva. Eso es curaduría humana, no automatizable — pesa en
el tiempo, no en el código.

**Bloqueo actual, tercera vez que se señala:** sin credenciales de R2, la
mitad de la migración no puede empezar. No es un pendiente menor — es la
puerta de entrada para 2 GB de material.

**No existe ningún importador.** `INTEGRATIONS.md` §4 especifica un adaptador
de Airtable; nada está construido, y el product owner confirmó que **nada
vive en Airtable** — todo está en Sheets, imágenes y documentos propios.

## 10. Otras brechas nombradas, sin desarrollar

- **Minutas de reunión.** Existen dos documentos reales (18 de julio y 6 de
  agosto de 2026) con decisiones, tareas, responsables y fechas. No hay
  entidad para eso — `Story & Knowledge Engine` cubre contenido editorial, no
  actas con seguimiento. Es lo que sostiene la relación con los Huerbsch.
- **Mapa y plano de finca.** `MAP_AND_TERRITORY.md` ya cubre capas,
  agrupamiento, NDVI vía Sentinel/Copernicus y exportación estática. PostGIS
  ya está en el stack. **Precaución sobre satélite:** NDVI viene en celdas de
  decenas o cientos de metros — para un lote bajo sombra, una celda puede
  cubrir varios lotes con el dosel contaminando la lectura. Útil para
  tendencia estacional, no para distinguir la parte alta de la baja. Las
  mediciones de Bob y Sherry en el punto exacto serán más útiles.
- **Kits Descubre Terroir.** Producto de Néctar Nómada usando café de Las
  Nubes — cruza Commerce con trazabilidad de otro Project. v1 se detiene
  antes de `Product`.
- **José Giráldez / Craft Brewing Supply**: rol de precios y comunicación de
  pedidos, como ventana a la tienda Brew Mart. Es Commerce e integración
  externa, ninguna de las dos en v1.

## 11. Prioridad — orden declarado por el product owner

1. Atributos de lote (sol, sombra, altitud, suelo, pendiente, distancia)
2. `RoastSession`
3. Research OS (protocolos PE-77 a PE-112)
4. Selección y clasificación por defectos
5. Mapa y plano de finca

**Decisión de alcance:** v1 crece y la fecha se mueve a **diciembre** para el
software completo.

**Mitigación mientras tanto, propuesta por el product owner:** capturar los
primeros batches de Cerro Azul y CryoBloom **a mano en Google Sheets**, con
los campos estructurados según el modelo, para importarlos limpio después.

**Eso convierte la plantilla de captura en el entregable más urgente de esta
lista** — más que cualquier ticket de construcción. La primera tanda de
CryoBloom llega en **octubre**, antes de que el software esté listo. Sin
plantilla, esa cosecha se anota libremente y la importación se vuelve
reconciliación en vez de mapeo.

**Volumen esperado de CryoBloom:** 50–100 latas al año, en dos o tres tandas
(octubre–noviembre, luego diciembre–enero), con más de treinta protocolos de
variables controladas.

## 12. Realidad de calendario, dicha sin adornos

Las fechas de campo no se mueven aunque la del software sí:

- **Cosecha de café: noviembre–abril.** Producción real, no prueba.
- **Temporada de apiario: diciembre–abril.** Kenis y Chayanne.
- **CryoBloom: primera tanda en octubre.**

Falta construir: A6, A7, A8 y A5.5 para cerrar v1 como estaba definido, más
lo que de esta lista se decida incorporar.

**Riesgo principal, nombrado explícitamente:** ADR-039 definió v1 por una
prueba falsable precisamente para que el alcance no creciera sin decisión.
Crecer está bien si es decidido; el peligro es que vuelva a significar
"todo", que es lo que esa decisión evitaba.

**Y una observación que vale más que cualquier ticket:** ningún usuario real
ha abierto una pantalla todavía. Veinte minutos con Kenis o Bob frente a la
interfaz, haciendo una tarea real, sin que nadie les narre nada, dirán más
sobre qué construir que otra ronda de arquitectura.

## 13. Qué hacer con este documento

Registrarlo en `docs/architecture/` como entrada de planificación aceptada,
y anotarlo en `DECISIONS.md` con el mismo patrón que el resto de los
documentos de planificación: **aceptado como insumo, secuenciación diferida,
no es orden de construcción.**

Cada sección que amerite construcción necesita su propio ticket y su propia
aprobación. Este documento no autoriza ninguno.

**Pendiente antes de poder cerrar §8 y §11:** los campos reales de
investigación de CryoBloom —variables, mediciones, nomenclatura PE— que el
product owner va a compartir. Sin eso, la plantilla de captura no se puede
escribir con precisión.
