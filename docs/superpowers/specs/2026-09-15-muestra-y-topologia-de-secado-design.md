# La muestra y la topología de secado

**Fecha:** 2026-09-15 · **Base:** `origin/main` en `741c283` · **Camino:** arquitectónico
(kit `superpowers:brainstorming`, tres caminos; se tomó el pesado porque toca `Measurement`
y `Sample`, que leen muchos módulos).

Diseño acordado con Daniel en sesión. Cada afirmación de estado que sigue **se midió** contra
el árbol en `741c283`; donde una medición contradijo a un informe previo mío, manda la
medición y se dice cuál era el error.

---

## 1. Qué cierra, y por qué existe

La auditoría encontró **cuatro veces por caminos independientes** la misma forma: un motor
completo, probado contra sus vectores, **sin dato que lo alcance**. No es coincidencia; es el
patrón del producto en este momento. Este spec ataca la causa —el dato— y no los motores, que
están bien escritos.

Cierra, en un solo cambio:

| hallazgo | qué era |
|---|---|
| **F3-001** | no se puede rechazar una humedad por su punto de muestreo: el punto no existe |
| **F3-003** | una muestra apunta al lote vivo, no a una foto de él |
| **F3-004** | `sampleType` es texto libre y el único valor real no es ninguno de los cinco |
| **criterio 5** | el motor exige tres puntos de cama; el dato trae uno |
| **fase 2** | el guardia `MIXED_SAMPLE_POINTS` no puede disparar (mismo hueco, en Brix) |

Y abre el camino al quinto, `COLD_HOLD_PREFERMENT`, sin construirlo aquí (§10).

---

## 2. Lo que se midió antes de diseñar

Tres afirmaciones de mis propios informes resultaron **falsas o imprecisas**, y el diseño
cambió por ello:

1. **«La actividad de agua no tiene dónde vivir.»** Falsa. `water_activity` ya es una variable
   declarada en `lib/traceability/units.ts` —unidad `aw`, rango 0–1, panel `proceso_de_cafe`—.
   `TARGET_REACHED` no puede salir porque `lib/beneficio/desdeElLote.ts:222` escribe
   `waterActivity: null` a pelo. **Es una línea del puente, no un hueco de esquema.**
2. **«Hoy no hay forma de decir que un lote corre un protocolo.»** Imprecisa. `Lot.treatmentBatches`
   → `TreatmentBatch.protocolVersionId` existe, con `lotId` anulable. Lo que no hay es forma
   **por el catálogo de grado**, que es lo único que el puente recibe. Y no hay protocolo
   CryoBloom en datos: `prisma/seed.ts` explica que **no se siembra a propósito**, por integridad
   científica.
3. **«El punto de muestreo falta.»** Cierta: cero coincidencias de `samplePoint|sample_point` en
   `prisma/schema.prisma`.

Y lo que **ya existe y no hay que construir**: `DryingTurnEvent` (los volteos, con su enum de
tipo), `DryingRun.layerDepthCm` (profundidad de capa), y las variables `temperature` y
`relative_humidity` colgables de la corrida.

---

## 3. Las decisiones de Daniel que gobiernan este diseño

Tomadas en esta sesión. Donde una contradice un documento normativo, **manda él** y se anota.

- **D1 · El secado no se mide con pinchazos en la cama.** Se usa un medidor de humedad **de
  grano**: se toma una muestra, se llena la celda y se lee. La especificación
  (`docs/beneficio`) pide «tres puntos de cama»; la práctica es **dos muestras por cama por
  inspección, con tres (o cinco) medidas por muestra que el instrumento promedia**.
- **D2 · Las dos muestras pueden ser zonas o réplica, y depende de la inspección.** Por tanto
  **quien mide lo declara**, y el motor sólo alerta de desigualdad cuando dijo *zonas*.
- **D3 · `GREEN` no pertenece al secado.** En secado hay cereza, mucílago y pergamino. El café
  verde es **post-reposo**, cuando el beneficio ya terminó de transformar.
- **D4 · El aviso de modo del instrumento va ANTES, al abrir el formulario.** Previene en vez de
  corregir. No bloquea al guardar — coherente con su decisión del 2026-09-14, ya escrita en el
  esquema: *«bloquear se esquiva en el patio [...] y entonces el sistema sabe MENOS»*.
- **D5 · El reposo importa y sí impacta la taza** si no se cumplen los tiempos. Confirma F3-002;
  no se construye aquí.

---

## 4. Sección A — La muestra

Todo aditivo sobre `Sample` (esquema `core`), que ya descuenta masa del lote en la misma
transacción que su extracción — el criterio 9 de la fase 3, de lo mejor del repositorio.

### 4.1 Columnas nuevas

| columna | tipo | por qué |
|---|---|---|
| `materialState` | enum `CHERRY \| MUCILAGE_HONEY \| PARCHMENT \| GREEN`, anulable | **el punto de muestreo real.** El error que importa no es «dónde de la cama» sino comparar cereza contra pergamino |
| `samplingRole` | enum `ZONE \| REPLICATE`, anulable | D2: lo declara quien mide |
| `samplingZone` | enum corto de posición, anulable | con **nota libre al lado, nunca en su lugar** — lo que ordena el comentario de `SunExposure` |
| `sampleKind` | enum de los cinco tipos, anulable | cierra F3-004 **sin reescribir** `sampleType` |
| `stageAtExtraction` | texto/enum de etapa, anulable | instantánea (F3-003) |
| `massAtExtraction` + unidad | decimal, anulable | instantánea |
| `moisturePctAtExtraction` | decimal, anulable | instantánea |

**`sampleType` no se reescribe.** Hoy es texto libre y el único valor en la base es
`green_coffee`, que no es ninguno de los cinco que la especificación nombra. Traducirlo sería
inventar un hecho. Se añade `sampleKind` y el viejo queda como legado — **exactamente el patrón
que el esquema ya usa** para `deviceId` frente a `captureDeviceId`, y por la razón que su propio
comentario da: *«una columna que antes significaba una cosa y ahora otra haría mentir a las filas
viejas»*.

**La instantánea va en columnas nombradas, no en un JSON.** `CLAUDE.md` §49 prohíbe el blob, y
unas columnas se pueden consultar. Nótese lo que F3-003 realmente decía: la **transformación** ya
es inmutable y lleva su `occurredAt`, así que el estado se puede reconstruir — **lo que falta es
que esté congelado, no que exista**. Quien lea una muestra tomada al 18 % ve hoy el 11 % del lote,
y nada le dice que tiene que reconstruir.

### 4.2 Tabla nueva: `SamplingEvent`

La **inspección**: el acto de ir a una cama en un momento y sacar dos muestras. Es lo que hace
que «estas dos son las zonas de esta cama a esta hora» sea **estructural** en vez de inferido por
cercanía de fechas.

Campos: cama (`Location` de tipo `drying_bed`), corrida de secado, `occurredAt`, operador,
notas, procedencia y auditoría como el resto del módulo.

No es duplicar `Sample`: modela el **acto**, que hoy no tiene sujeto.

### 4.3 Lo que NO cambia

`Measurement.sampleId` ya existe. Las mediciones de humedad pasan a colgar de la muestra en vez
del lote suelto, sin columna nueva por ese lado.

---

## 5. Sección B — La topología de secado

La casa ya tiene escrita la respuesta y no se inventa nada. `LocationType` dice, sobre las
parcelas: *«un Plot es una Location con `locationType = plot` y `parentLocationId` apuntando al
sitio de la finca, **no una familia de entidades nueva**»*. Y `apiary_site` repite el patrón.

- **`LocationType` += `drying_facility` y `drying_bed`.** La instalación cuelga del sitio de la
  finca; las camas cuelgan de la instalación. Caso real que debe quedar expresable: **Cafelino,
  Boquete — dos invernaderos solares con tres camas cada uno, y un cuarto oscuro con seis o siete,
  más niveles de racks.** Sin tablas nuevas.
- **`rackLevel Int?`** en la cama, para los niveles del cuarto oscuro. No contamina `Location`:
  ya lleva `plantSpacingMeters` y `shadePercentage`, que sólo valen para parcelas. El patrón de
  columnas anulables por tipo existe.
- **`dryingEnvironment`** en la instalación: invernadero solar, cuarto oscuro con control
  climático, patio, marquesina, secadora mecánica. Es lo que hoy es `DryingRun.method` **en texto
  libre** (`'raised_bed' | 'patio' | 'mechanical' | free text`).
- **`DryingRun` apunta a la cama.** `method` se queda como legado, sin reescribir — mismo patrón
  que `sampleType`.
- **La zona de la muestra deja de ser texto libre**, por lo dicho en 4.1.

**Consecuencia que sale gratis:** una `relative_humidity` colgada de la **instalación** es
ambiente y colgada de la **muestra** es grano. Hoy las dos son la misma fila sin nada que las
distinga — el mismo problema del punto de muestreo, otra vez.

---

## 6. Sección C — El instrumento y su modo

El aporte de campo de Daniel, y el mejor del diseño: *«he visto en campo que incorrectamente usan
settings de medir café verde, o de pergamino o en cereza y aplicarlo a otro por error o falta de
conocimiento»*.

Medir pergamino con el ajuste de verde **no falla en rojo: da un número plausible y equivocado**,
que es la forma exacta de error que esta casa persigue. Hoy se guarda *qué* instrumento midió
(`instrumentId`, del módulo de equipos del 2026-09-14) pero **no en qué modo estaba**.

### 6.1 Tabla nueva: `InstrumentMeasurementMode`

Hermana de `instrument_check_requirement`, con la misma forma que Daniel definió ayer. Por
instrumento:

| campo | por qué |
|---|---|
| `label` | **el nombre que usa el aparato**, no una paráfrasis nuestra |
| `materialState` | qué mide ese modo |
| `rangeMin` / `rangeMax` | fuera de rango el aparato **no da número** |
| `calibrationOffset` | ajustable por el operario; cambia el número |
| `calibrationMode` | básico o avanzado |
| `displayOrder`, `retiredAt`, auditoría | como su hermana |

`Measurement` gana **una** columna: `instrumentModeId`.

### 6.2 Lo que dicen las fuentes del fabricante

Del manual del MT-PRO y del catálogo 2015 que Daniel compartió:

- **Las tres medidas son del fabricante, no costumbre de finca.** El aparato muestra
  *«ALWAYS AVERAGE 3 TESTS»* al encender y exige **vaciar y rellenar la celda con grano fresco
  entre cada una**. Son tres submuestras, no tres lecturas del mismo llenado.
- **El promedio se borra al cambiar de escala**, sin que nada falle. Aviso que la app puede dar y
  el aparato no.
- **Desfase por escala de hasta ±5,0 % en pasos de 0,1 %**, puesto por una persona; y cambiar de
  modo de calibración **borra todos los ajustes del usuario**.
- **Temperatura:** si el grano difiere del aparato en ~11 °C hay que precalentar. **Café que sale
  de un reposo frío cae justo en ese caso** — la receta y la medición se tocan en un punto físico.
- **El grano expuesto al aire gana o pierde 1–2 % en pocos minutos**: recipiente cerrado si no se
  mide al momento.
- Ficha del **COFFEE TESTER 08150** en el catálogo de 2015: escalas `Green Coffee` (7–35 %) y
  `Parchment Coffee` (8–38 %), 0–45 °C, ±0,5 %, resolución 0,1 %.

**Discrepancia declarada, no resuelta.** Daniel indica que su unidad mide también cereza y
mucílago seleccionando la opción adecuada; el catálogo de 2015 lista dos escalas. Puede ser una
unidad posterior o un resumen del catálogo. **El diseño no depende de resolverlo**: los modos son
datos por instrumento, así que se cargan los que el aparato tenga en su menú. Pendiente sólo para
sembrar filas reales (§11).

**Y el rango es un guardia, no un adorno.** Una cama recién tendida está por encima del máximo de
pergamino, así que el aparato contesta «por encima del límite» y no da número. Eso explica la
práctica que Daniel describió sin mencionar rangos: *«se agregan los granos que están ya en
proceso de secado, no antes»*. Poder decir «todavía no es medible con este aparato» en vez de
dejar al operario pelear con un error es de lo más útil que sale de aquí.

---

## 7. Sección D — Motores y puente

**Los motores no se tocan.** Cambia `lib/beneficio/desdeElLote.ts`, en cuatro sitios que hoy
mienten por omisión:

| hoy | pasa a |
|---|---|
| `waterActivity: null` a pelo | la medición `water_activity` de la misma muestra → `TARGET_REACHED` puede salir |
| `bedPointsPct: [m.value]` | las muestras de la misma `SamplingEvent` con rol `ZONE` → `UNEVEN_DRYING` puede salir, **y sólo si se declararon zonas** |
| `samplePoint: "TANK_LIQUID_MID"` fijo | el material real → `MIXED_SAMPLE_POINTS` puede disparar |
| cuatro `limitaciones` siempre empujadas | **condicionales**: se empujan cuando el dato no está |

Ese último punto es el que más importa. **Las limitaciones no se borran, se vuelven
condicionales.** Un lote viejo sin el dato nuevo sigue declarando `SIN_ACTIVIDAD_DE_AGUA` y
`UN_SOLO_PUNTO_DE_CAMA`. Quitarlas cambiaría «no lo sabemos» por silencio, que es peor que el
hueco.

---

## 8. Sección E — Pantallas

1. **Formulario de medición** — el aviso previo (D4), derivado de la etapa del lote, con el
   nombre del modo tal como lo llama el aparato. Campos nuevos: modo del instrumento (**sólo los
   que ese equipo declara**), estado del material (**recortado por la etapa**, D3) y, si es
   inspección de cama, rol y zona.
2. **Pantalla de inspección** — crea el `SamplingEvent` con sus dos muestras de una vez. Medir
   dos muestras como dos formularios sueltos es la fricción que no queremos en el patio.
3. **Ficha del lote** — sigue enseñando las limitaciones que quedan, como ya hace.
4. **Administración de instalaciones y camas** — crear invernadero, sus camas, sus niveles.

Condiciones de campo que la fase 3 dejó dichas: sol directo, manos ocupadas, sin señal. El
armazón y las rutas del operario ya funcionan sin conexión (`public/sw.js`).

---

## 9. Sección F — Bordes y errores

- **Sin etapa abierta** → no hay lista de materiales válida: el formulario lo dice, no adivina.
- **Instrumento sin modos declarados** → se mide igual, marcado. Coherente con «avisa, no
  descalifica».
- **Una sola muestra en la inspección** → no hay dispersión y se dice; `UNEVEN_DRYING` no sale.
- **Valor fuera del rango del modo** → el aparato no lo produce; la app lo trata como lectura no
  obtenida, no como cero.
- **`GREEN` en secado** → **avisa y deja pasar**, como todo lo demás. *Decisión de Daniel,
  2026-09-15.* El diseño llegó a proponer aquí su única puerta dura —rechazar por disparador,
  porque no es un juicio sino un imposible físico— y él la cerró en el otro sentido: la doctrina
  de «avisa, no descalifica» **no admite excepciones por lo evidente que parezca el caso**, porque
  la puerta que se esquiva enseña a esquivar todas. La lectura entra marcada.

  **Y eso abre una decisión de diseño que este spec no cierra:** `MeasurementReviewFlag` —la marca
  que el módulo de equipos ya trae para «marcada, no bloqueada»— **no se puede reutilizar tal
  cual**. Su `raisedByCheckId` es `NOT NULL` y apunta a `InstrumentCheck`, o sea que la marca sólo
  existe como consecuencia de una verificación de instrumento, y un desajuste entre material y
  etapa no tiene ninguna que la levante. O se hace anulable con un motivo declarado, o hace falta
  una marca hermana. El plan tiene que elegir, y decir por qué.

Las validaciones cruzadas —etapa↔material y modo↔material— van por **disparador, no por `CHECK`**:
miran dos tablas, y un `CHECK` no puede. Es el error que se cometió el 2026-09-14 y que se
corrigió con el disparador del veredicto de verificación, que queda como precedente de forma.

---

## 10. Sección G — Pruebas

Con las reglas de la casa, no genéricas:

- **Cada guardia con su flip-test**, y los tres requisitos: sha distinto antes y después, que el
  archivo **compile**, y que caiga un test **por su nombre**. Sin las tres, el flip-test es el
  adorno que pretendía cazar.
- **Vectores que hagan SALIR** `UNEVEN_DRYING` y `TARGET_REACHED`. Hoy no pueden salir nunca, así
  que una prueba que no los ve salir no prueba nada: es control positivo, no ausencia.
- **La prueba que vigila lo de §7:** un lote sin el dato nuevo **sigue** declarando sus
  limitaciones. Si esa cae, hemos cambiado el hueco por silencio.
- **Toda prueba que toque base va declarada** en `scripts/pruebas-por-compuerta.txt`, grupo
  `base-sembrada`. Si no, cae en el carril hermético **por omisión** y CI revienta con un error de
  Prisma que no parece de Prisma.
- **Commitear antes de mutar**: el arnés de flip restaura desde HEAD.

---

## 11. Fuera de alcance, con su orden

No se pierde nada de lo hablado; se escribe aquí para que la siguiente sesión lo tome entero en
vez de a medias.

1. **La receta de secado.** Existe lo ejecutado —volteos, profundidad— y **no existe el plan**, así
   que un volteo de menos no es nada porque nadie declaró cuántos tocaban. Es también **el camino a
   `COLD_HOLD_PREFERMENT`**: la receta es donde un lote declara que corre CryoBloom, con sus cuatro
   variables —a qué temperatura baja, a qué velocidad, cuánto se sostiene, cuándo sale—.
2. **La capa ambiental (§7 y §38 de la especificación).** **Cero modelos** hoy: ni fuente, ni
   sensor, ni despliegue, ni serie temporal. *Control positivo: la misma búsqueda sí encuentra los
   nueve modelos `Sensory*`.* El cuarto oscuro con aire acondicionado y deshumidificador la
   necesita entera.
3. **Trazabilidad de plantón.** Medido: **`Specimen` ya existe** con `gridRow` y `gridPosition`, y
   el esquema explica el compromiso —el sector simple *«funciona desde el día uno sin preparar el
   campo»*, la rejilla exige filas físicamente numeradas—. Faltan **dos cosas concretas**: que la
   rejilla del bloque se **declare** (`PlantingCohort` tiene `plantCount` y `spacingMeters`, pero
   nada dice «10 × 400», así que no se pueden dibujar las celdas de plantas no observadas), y que
   **`HarvestEvent` pueda apuntar a la planta** y no sólo a la parcela — hoy cosechar cerezas o
   semillas *de ese plantón* para semillero o para una prueba no es expresable.
4. **El reposo mínimo y la trilla** (F3-002), que Daniel confirma que impactan la taza.

---

## 12. Decisiones abiertas que este spec NO cierra

- **`D-F3-01`** — cuáles son los cinco tipos de muestra y si el testigo es obligatorio. El modelo
  deja `sampleKind` preparado **sin decidir su contenido**.
- ~~La puerta dura de `GREEN` en secado~~ — **cerrada el 2026-09-15: avisa y deja pasar** (§9).
  Deja en su lugar la de la forma de la marca, que está descrita ahí mismo.
- **Los nombres reales de los modos** del aparato de Daniel (§6.2), para sembrar filas con el
  vocabulario del fabricante en vez de uno inventado.
- **`P-F`**, que sigue abierta: todo umbral de motor es `[PROVISIONAL]` hasta que Daniel revise
  las tres guías de `docs/dominio/`.

---

## 13. Procedencia

- Sesión con Daniel del 2026-09-15: D1–D5, el caso de Cafelino, la práctica de muestreo y el error
  de ajuste visto en campo.
- Manual del **AgraTronix MT-PRO** (manuals.plus) y **catálogo AgraTronix 2015**, ficha del COFFEE
  TESTER 08150, compartidos por Daniel.
- Práctica de muestreo compuesto de cama —cinco a ocho sitios, cono y cuarteo, ~300 g— y objetivo
  de 11–12 % para pergamino: Perfect Daily Grind y el conjunto de datos FT-NIR en PMC. **Se cita
  como referencia externa, no como umbral adoptado**: los umbrales son de Daniel (`P-F`).
- Informes `auditoria/informes/fase_1.md` y `fase_2.md` de esta auditoría. El de la fase 3
  todavía **no está en `main`**: va en el PR #327, abierto al escribir esto.
