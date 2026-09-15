# Fase 3 — Secado, reposo y muestreo

**Corrida el 2026-09-15** sobre `origin/main` en `741c283`. Rama `auditoria/fase-3`.
Los tres ejes en una pasada, como en la fase 1 y 2.

El prompt abre diciendo por qué esta fase importa: *«el secado es donde se destruye
más valor en el beneficio, y donde el daño es más difícil de atribuir: el error no
se manifiesta en horas sino en taza, semanas después, cuando ya nadie lo conecta
con la cama de secado»*.

---

## Resumen

**De los 12 criterios funcionales: 6 pasan, 1 pasa a medias, 5 son hallazgos.** El
eje veraz pasa sus cuatro preguntas — el mejor resultado de toda la auditoría. El
pedagógico añade una pregunta nueva y las demás ya estaban contestadas.

| | criterio | veredicto |
|---|---|---|
| 1 | la fase se determina antes de evaluar la tasa | ✅ |
| 2 | media móvil de 24 h; un ascenso nocturno no es violación | ✅ |
| 3 | existe el cruce humedad–masa | ✅ |
| 4 | `TARGET_REACHED` exige humedad **y** actividad de agua | ✅ |
| 5 | tres puntos por cama; dispersión = rango | 🟡 **el motor sí; el dato no** |
| 6 | el reloj cuenta desde la transición a secado | ✅ |
| 7 | se rechaza una humedad cuyo punto no sea la cama | ❌ **F3-001** |
| 8 | el reposo mínimo se verifica antes de la trilla | ❌ **F3-002** |
| 9 | una muestra descuenta masa del lote | ✅ **y bien** |
| 10 | la muestra guarda instantánea, no referencia viva | ❌ **F3-003** |
| 11 | los cinco tipos de muestra existen y se distinguen | ❌ **F3-004** |
| 12 | regla del testigo | ❌ **F3-005** |

---

## F3-001 · No se puede rechazar una humedad por su punto de muestreo, porque el punto no existe

**Criterio 7.** Búsqueda de `punto de muestreo|samplePoint|PARCHMENT_BED` sobre
`measurements.ts` y `secado.ts`: **cero**.

Y no es un olvido local: **es el mismo hueco que el puente de beneficio ya declara
en voz alta**. `lib/beneficio/desdeElLote.ts` escribe, sobre el guardia equivalente
de Brix:

> *«El punto de muestreo **no existe en nuestro modelo**… el guardia de
> `MIXED_SAMPLE_POINTS` **no puede disparar aquí**. Si alguien mide licor de tanque
> y mucílago exprimido el mismo día, el motor los comparará como si fueran la misma
> serie y nadie lo sabrá.»*

El criterio 7 pide lo mismo para el secado: una humedad tomada del pergamino y otra
de otro sitio no son la misma serie. **Severidad: media**, y la corrección es una
columna de punto de muestreo en `Measurement` — aditiva, del mismo patrón que
`instrumentId`.

---

## F3-002 · Ni la trilla ni el reposo mínimo existen

**Criterio 8.** Búsqueda de `trilla|hulling|reposo|resting|minRest`: las
coincidencias son **todas del reposo frío de fermentación**, que es otra cosa —
`STALL_SUSPENDED_COLD_HOLD` y el perfil de CryoBloom.

No hay etapa de trilla, no hay reposo en pergamino, y por tanto **no hay nada que
verificar antes de nada**. El criterio no tiene sujeto.

Conecta con el inventario, que ya marcó **«Reposo» como ausente** — su única
aparición en el esquema es una palabra dentro de un comentario.

---

## F3-003 · Una muestra apunta al lote vivo, no a una foto de él

**Criterio 10.** `Sample` tiene `sourceLotId` —una **FK viva** a `Lot`— y
`sourceTransformationId`. Y **ningún campo de estado**: ni humedad, ni actividad de
agua, ni etapa. Medido sobre los 20 campos del modelo.

La especificación (`docs/beneficio/20` §2) lo pide con estas palabras: *«Una muestra
guarda una **instantánea** del estado del lote al momento de extraerla, no una
referencia viva. Si el lote sigue secando, la muestra no cambia con él.»*

**Lo que hoy sí está congelado**, y por eso esto no es una pérdida: la
**transformación** es inmutable y lleva su `occurredAt`, así que el estado de aquel
momento **se puede reconstruir** consultando las mediciones anteriores a esa fecha.

**Lo que falta es que esté congelado, no que exista.** La diferencia importa: quien
lea una muestra de humedad tomada al 18 % verá, si mira el lote, el 11 % de hoy —
y nada le dice que tiene que reconstruir en vez de leer.

---

## F3-004 · `sampleType` es texto libre, y el único valor en uso no es ninguno de los cinco

**Criterio 11.** `sampleType: String` en el esquema y `sampleType: string` en el
servicio. Ni enum, ni catálogo, ni validación.

La especificación nombra **cinco**, cada uno con su regla:

| tipo | destino | regla |
|---|---|---|
| `PROCESS` | pH, °Bx | se consume; masa descontada |
| `MOISTURE` | humedad, aw | se consume |
| `ROAST` | tueste de muestra | origen de un `RoastBatch` |
| `CUPPING` | catación | debe provenir de un `RoastBatch` conforme |
| `RETENTION` | testigo sellado | **obligatoria para todo lote que se venda** |

**Y el único valor que existe en la base local es `green_coffee`**, que no es
ninguno de los cinco. Así que no es que falte declarar el vocabulario: es que el
que se usa **es otro**.

Esto hace **imposible** cualquier regla por tipo — incluida la del testigo, que es
F3-005 — porque no hay tipo sobre el que razonar.

---

## F3-005 · La regla del testigo no existe

**Criterio 12**, y la especificación es tajante: *«El sistema debe **impedir**
marcar un lote como vendido sin testigo registrado, o dejar constancia explícita de
su ausencia en la ficha.»* Sin muestra de retención sellada y fechada, *«una
reclamación de calidad posterior no se puede defender ni verificar»*.

Búsqueda de `retencion|retention|testigo|witness` sobre `lib/`, el esquema y los
mensajes: **dos coincidencias, y las dos son de apiario** —«a state fact,
witnessed»—, otro sentido de la palabra.

**Una atenuación medida, y conviene decirla con precisión:**
`LotTransformationType.sale` existe en el enum, y fuera de las listas de
`balance.ts` aparece **una sola vez**: como miembro de la unión de tipos que
`recordTransformation` acepta (`lots.ts:137`). Es decir, **está permitido pasarlo,
y no hay ningún camino de código que lo produzca ni ninguna pantalla que lo
ofrezca** — control positivo: `selection`, del mismo enum, sí tiene servicio y
pantalla propios.

Así que hoy un lote **no se marca como vendido desde la aplicación**, y la regla
del testigo no se está violando: está **sin poder existir**. Pero nótese la forma —
el tipo ya es aceptable por la API, así que el día que alguien lo llame, entra sin
testigo y sin guardia.

Eso cambia la urgencia, no la conclusión. El día que la venta se construya, esta
regla tiene que estar antes — no después.

---

## 🟡 Criterio 5 · El motor exige tres puntos; el dato trae uno

Media tinta, y es la **cuarta vez** que esta auditoría encuentra la misma forma.

`lib/beneficio/secado.ts` hace lo correcto: `bedPointsPct` es un arreglo, la
humedad reportada es **la media** (`humedadDe = media(r.bedPointsPct)`) y la
dispersión es el rango, que dispara `UNEVEN_DRYING`.

Pero `desdeElLote.ts` declara la limitación `UN_SOLO_PUNTO_DE_CAMA` porque **una
medición nuestra es un número, no tres puntos**. Así que `UNEVEN_DRYING` **no puede
salir nunca** con los datos que el sistema captura.

Las otras tres: `COLD_HOLD_PREFERMENT` inalcanzable (F2-004), la mitad de
fermentación de los motores sin una sola corrida (inventario), y la selección por
madurez sin dónde guardarse (F1-001). **Cuatro mecanismos completos sin dato que
los alcance** ya no es una coincidencia: es el patrón de esta auditoría.

---

## Eje veraz — las cuatro pasan, y es el mejor resultado de toda la auditoría

- **¿La humedad reportada es la media de los tres puntos o la que alguien anotó
  primero?** La media: `humedadDe = media(r.bedPointsPct)`. (Con el matiz del
  criterio 5: hoy ese arreglo trae un solo punto.)
- **¿Puede llegar a una ficha comercial con humedad `ESTIMADA` sin etiqueta?** No:
  **ninguna superficie comercial enseña humedad**. Control positivo — sí se enseña
  en cuatro sitios, todos operativos (`lots/[id]/process`, el formulario de
  medición, apiario, protocolos de investigación).
- **La merma de secado, ¿medida o calculada? ¿La fórmula es inspeccionable?**
  Las dos cosas y sí. Hay `declaredLossQuantity` / `declaredLossUnit` /
  `declaredLossReason` —**declarada** por quien pesa, con su motivo— y el
  rendimiento a través de un cambio de etapa es **derivable del libro mayor**:
  *«the input decrement and the output credit are both in the ledger — it is simply
  reported rather than alarmed on»*. La fórmula es la resta, y las dos partes están
  guardadas.
- **¿Algún reporte completa días faltantes por interpolación sin decirlo?** No.
  Cero coincidencias de `interpol|rellena|fill.*gap`. Y las que aparecen dicen lo
  contrario, que es la disciplina de la casa: *«Valor legítimo, no un hueco a
  rellenar… adivinarla la convertiría en un hecho»*.

---

## Eje pedagógico — tres ya reportadas, y una nueva que es la mejor pregunta del kit

Las de «antes de medir», «al alertar» y «al cerrar» ya son **P-001**, **P-002** y
**P-003** del informe del eje pedagógico, y la de la tasa demasiado rápida **se
corrigió ayer** (PR #326): ahora explica el endurecimiento superficial, que el
medidor lee bajo y falso, y que el moho llega semanas después.

**La que este prompt añade y no estaba en ningún sitio:**

> *«¿La app enseña a leer una cama —color, sonido, tacto— o sólo a leer el medidor?
> El objetivo es formar criterio, no dependencia del instrumento.»*

**No enseña.** Y es la formulación más aguda de todo el kit, porque nombra el riesgo
de fondo de este producto entero: un sistema que mide muy bien puede producir un
operario que **sólo sabe mirar el número**. Todo lo construido hoy —los motores, la
verificación de instrumentos, la procedencia— empuja en la dirección del
instrumento. Nada empuja en la del criterio.

No es un hallazgo con corrección conocida: es la pregunta que `D-P-01` tendría que
contestar además de las cuatro frases de procedimiento.

**Condiciones de campo, con la atención que el prompt pide:** el patio es sol
directo, manos ocupadas y sin señal. El armazón y las rutas del operario **sí**
funcionan sin conexión (`public/sw.js`), y los textos son de una frase. Lo que no
hay es guía que leer, así que la condición sigue cumplida por vacío.

---

## Lo que pasa, y merece decirse

- **Criterio 9 es de lo mejor del repositorio.** Una muestra crea una
  transformación `sample_extraction` **y** su `QuantityEvent` **en la misma
  transacción**, con el comentario diciendo por qué: para que la invariante
  `SUM(QuantityEvent)` contabilice el material que se llevó. La fuga silenciosa que
  el prompt teme no existe aquí.
- **Criterio 6 está escrito con esas palabras**: *«Desde `dryingStartedAt`, **nunca**
  desde el inicio de la fermentación»*.
- **Criterio 2 pasa por diseño y por ausencia.** El motor de secado **no tiene**
  `DATA_INTEGRITY_VIOLATION` —cero, con control positivo de 2 en el de Brix—, así
  que un ascenso nocturno de humedad no puede emitirla. Y la tasa va sobre ventanas
  de 24 h no solapadas.
- **Criterios 3 y 4 existen y están probados** contra los vectores de aceptación.
