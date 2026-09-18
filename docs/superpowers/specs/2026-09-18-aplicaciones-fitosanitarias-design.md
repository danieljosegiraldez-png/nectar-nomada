# Manejo fitosanitario de la parcela: el registro de intervenciones — diseño

**Fecha:** 2026-09-18 · **Camino:** arquitectónico · **Estado:** spec, sin código ·
**Medido sobre:** `origin/main` = `0351249`

> Pieza 3 de 3 del manejo fitosanitario de la parcela. La 1 (tablero de parcela,
> #362) está construida. De la 2 (trampas de broca, #369) está fusionado **el
> diseño y el plan**, no el código: `PlotBlock` y `TrapRule` no existen todavía en
> `prisma/schema.prisma`.

**Qué pidió Daniel:** *«una sección de prevención y control de plagas, donde
entra fumigación o tratamientos de esta índole, trampas de broca o manejos
relacionados»*; *«puede notar que hay muchos y aplicar repelente Bralic, o puede
ser mucho y usar Regin para controlar plaga u otras acciones»*.

**Bralic y Regin son nombres que dio Daniel.** Este documento no dice nada de su
composición, dosis, carencia ni registro: esos valores los pone quien da de alta
el producto, con su procedencia.

---

## 0. Decisiones de Daniel en esta sesión (2026-09-18)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Qué entra? | **Las cuatro:** productos comprados, preparados de finca, liberaciones biológicas **y manejo cultural** (repela, pepena, poda sanitaria) |
| 2 | Mezcla de tanque | **Una aplicación, varios productos**, con una línea por producto |
| 3 | ¿Sobre qué? | **Parcela, bloques o plantas**. Sin elegir nada, la parcela entera |
| 4 | Cosecha en carencia | **Avisa y registra, marcada**, igual que la miel (decisión del 2026-09-11) |
| 5 | Reentrada | **Tablero y al abrir jornada**. Avisa, no impide |
| 6 | Trampas | **La regla enlaza al producto y el aviso se da por atendido** |
| 7 | Producto sin carencia declarada | **Se guarda, y queda «no declarada»**. Nunca se lee como libre |
| 8 | Enfoque | **A: entidad propia sobre el catálogo que ya existe** |
| 9 | Contra qué (objetivo) | **Vocabulario cerrado que da Daniel**. Este spec no inventa la lista (§8) |

**Un cambio respecto de lo que vio en el chat**, y hay que decirlo: al presentar
el enfoque A dije que la línea que descuenta escribiría también un
`MaterialConsumptionEntry`. Al escribir el spec medí que el botiquín, fusionado
el mismo día, resolvió la misma pregunta **al revés**: el tratamiento de colmena
escribe su `ConsumableStockEvent` directamente, sin fila de consumo
(`lib/apiary/colonyEvents.ts`, migración
`20260918050000_botiquin_tratamiento_descuenta_del_frasco`). Aquí se sigue ese
precedente (§2.3). Si Daniel prefiere lo que vio en el chat, el cambio es de una
tarea del plan y no toca el resto.

---

## 1. Lo que ya existe, medido

| Pieza | Estado en `main` | Qué hace este diseño con ella |
|---|---|---|
| `ConsumableMaterial` | existe, con las columnas del botiquín: `isVeterinaryMedicine`, `manufacturer`, `activeIngredient`, `sanitaryRegistration`, `defaultWithdrawalDays`, `storageConditions`, `safetyNotes`, `avisarDiasAntes` | **es el catálogo**. Le añade dos columnas (§2.4) |
| `ConsumableLot` | existe, con `expiresAt`, `supplier`, `batchLabel` | el frasco, el saco, **o el lote hecho en la biofábrica** |
| `ConsumableStockEvent` | existe, libro mayor que sólo se añade | la línea que lleva frasco y cantidad descuenta aquí |
| `estadoDeVencimiento` | existe, `lib/inventario/vencimiento.ts` | marca el frasco vencido al aplicar, como el botiquín |
| `MaterialConsumptionEntry` con padre `location` | existe: el ADR de F1 dice que «Sherry fumiga el Lote 2» se registra así | **se queda como está**: consumo sin carencia ni objetivo. Ver §9 |
| `libreDesdeDe`, `diasQueFaltanDe` | existen, en `lib/apiary/carencia.ts` | se mueven a un módulo puro y los usan café y miel (§3.1) |
| `HarvestEvent.locationId`, `harvestedAt` | existen | la cosecha sabe dónde y cuándo, así que se puede calcular la carencia |
| `FieldEvent` | existe, con una FK por tipo de hecho | gana `plotInterventionId` (§4.4) |
| `correctMeasurement` + `correctsId` | existe | el patrón de corrección que se copia (§2.1) |
| `conAncestros` | existe, **privada**, en `lib/rbac/service.ts` | se copia su tope de profundidad y su guarda de ciclos (§3.3) |
| Bajar a descendientes de una ubicación | **no existe ninguna función** | nueva (§3.3) |
| `PlotBlock`, `TrapRule` | **no existen**: sólo el plan de #369 | la pieza 3 los usa **cuando existan** (§6) |

**De las guías de Anacafé** que aportó Daniel (biofábrica, microorganismos y
trampas de broca) se tomó **sólo la forma** de las cosas, y ninguna cifra:

- lo hecho en la biofábrica lleva una etiqueta de control con nombre, uso
  previsto, fecha de fabricación y vencimiento. **Ésa es exactamente la forma de
  un `ConsumableLot`**, y no hace falta tabla nueva;
- los microorganismos se aplican solos o **mezclados en el tanque** con
  fungicidas, insecticidas o fertilizante, y de ahí la decisión 2;
- se aplica **diluido y por área**, al follaje, al tronco o al suelo, con mochila,
  motor o riego;
- una liberación de parasitoides se cuenta **en individuos**, no en litros;
- la eficacia se sigue **observando después**, y eso aquí son las lecturas de
  trampa siguientes (§4.3).

---

## 2. El modelo

### 2.1 `PlotIntervention` — una intervención sobre una parcela

| Campo | Tipo | Regla |
|---|---|---|
| `locationId` | FK `Location` | la parcela. Obligatorio |
| `kind` | enum `PlotInterventionKind`: `aplicacion` · `liberacion` · `manejo_cultural` | obligatorio |
| `target` | enum `PlotInterventionTarget` | **vocabulario de Daniel, con `otro`** (§8). Obligatorio: sin él no se puede preguntar «qué funcionó contra la broca». Es la misma razón que dio el Anexo B §4 para `TreatmentTarget` |
| `targetNote` | texto | el «¿cuál?» de `otro` |
| `method` | enum `PlotInterventionMethod`: `follaje` · `tronco` · `suelo` · `riego` · `cebo` · `liberacion` · `manual` · `otro` | opcional. Son las formas que nombran las guías, sin sus cifras |
| `mixVolume`, `mixUnit` | decimal, texto | opcionales. El volumen total del caldo: lo que permite leer después «tanto producto en tanta agua» |
| `occurredAt` | instante | con el desfase del dispositivo (`TimezoneOffsetField` + `parseLocalDateTime`). **Es un instante y no un día**, porque la reentrada se cuenta en horas |
| `operatorPersonId` | FK `Person` | opcional, como en todo registro de campo |
| `fieldSessionId` | FK `FieldSession` | opcional |
| `motivoObservationId` | FK `SpecimenObservation` | opcional. La lectura de trampa que la motivó. **Es procedencia, no mecanismo**: decir «por qué» no decide si un aviso se apaga (§4.2) |
| `provenanceClass` | | fijo `original_record` en la capa de acción: es el registro de una acción hecha, igual que el tratamiento de colmena |
| `dataQuality`, `notes` | | como en todo el sistema |
| `correctsId`, `correctionReason` | autorreferencia, texto | **nunca se edita en sitio**. Se corrige con una fila nueva que apunta a la vigente, con motivo obligatorio. No se corrige lo ya corregido, igual que `correctMeasurement` |
| `createdAt`, `createdBy` | | |

### 2.2 `PlotInterventionArea` — dónde, dentro de la parcela

`interventionId` más **exactamente uno** de `plotBlockId` o `specimenId`, con
`CHECK` en la base (no sólo en TypeScript: un importador o SQL directo se
saltarían el servicio).

**Sin filas quiere decir la parcela entera.** No hay fila «parcela entera»: el
conjunto vacío lo dice sin un segundo modo de decir lo mismo.

El servicio comprueba que el bloque o la planta pertenecen **a esa parcela**. Un
área de otra parcela se rechaza.

### 2.3 `PlotInterventionLine` — una por producto de la mezcla

| Campo | Regla |
|---|---|
| `interventionId` | obligatorio |
| `materialId` | FK `ConsumableMaterial`, obligatorio. Un producto sin identidad no se puede sumar ni comparar, que es el problema que `ConsumableMaterial` existe para resolver |
| `consumableLotId` | opcional **para siempre**, como en el consumo y en el tratamiento de colmena: obligar a elegir frasco convierte un registro en un trámite que se esquiva |
| `quantity`, `unit` | opcionales. «No medí» se guarda sin inventar un número |
| `withdrawalDays` | entero, anulable. **Nulo = no declarada; 0 = declarada cero.** `CHECK >= 0` |
| `reentryHours` | entero, anulable, con la misma regla |
| `lotExpiredAtApplication` | booleano, anulable. `CHECK`: sólo con `consumableLotId`. Copia exacta del botiquín |

**El descuento, en la misma transacción.** Con `consumableLotId` y `quantity`, la
línea escribe su `ConsumableStockEvent` de tipo `consumed`, y exige la misma unidad
que el lote, como hacen hoy `recordMaterialConsumptionEntry` y el tratamiento de
colmena. Sin cantidad no descuenta y se guarda igual: dice de qué frasco salió
aunque no cuánto.

**Un frasco vencido se aplica y queda marcado.** Es la doctrina del botiquín:
alguien puede estar registrando hoy lo que aplicó la semana pasada.

**El servicio NO rellena carencia ni reentrada con las del producto.** El
formulario las **precarga visibles** y quien registra las confirma o las
cambia. Si el servicio copiara el valor por su cuenta, una carencia editada en
el producto después cambiaría el significado de lo que ya se registró — y un
nulo del producto se convertiría en una afirmación que nadie hizo. Es la regla
del botiquín, tarea 7.

**Reglas por tipo**, en el servicio y cada una con su prueba:

- `manejo_cultural` → **cero líneas**. Una repela no aplica nada;
- `aplicacion` y `liberacion` → **al menos una**.

### 2.4 El catálogo: `ConsumableMaterial` con dos columnas más

| Columna | Por qué |
|---|---|
| `isPlantProtection` `Boolean @default(false)` | gemela de `isVeterinaryMedicine`. Es lo que evita que el selector enseñe aserrín y gallinaza. Un material puede tener las dos |
| `defaultReentryHours` `Int?` | nulo = no declarada, `CHECK >= 0`. Es lo único de esta pieza que el botiquín no tenía |

**Nada más.** La carencia por defecto, el principio activo, la casa, el registro
sanitario y las advertencias **ya existen**.

- **Un preparado de la biofábrica** es un material con `manufacturer` nulo y un
  lote propio: `batchLabel` = el de su etiqueta de control, `receivedAt` = la
  fecha de fabricación, `expiresAt` = la del vencimiento. No hace falta un campo
  «hecho en finca».
- **Una avispa parasitoide** es un material con `defaultUnit = "individuos"`.

Dar de alta un producto sigue siendo `crearMaterial`, con `equipment:manage`:
definir qué es «Bralic» es un acto de gestión, no de faena.

---

## 3. Carencia y reentrada

### 3.1 La aritmética vive en un solo sitio

`libreDesdeDe` y `diasQueFaltanDe` se mueven **tal cual** de `lib/apiary/carencia.ts`
a `lib/time/carencia.ts`, que no importa la base, y `lib/apiary/carencia.ts` los
reexporta. Café y miel cuentan igual: días enteros, **redondeando hacia arriba**.
Medio día de carencia sigue siendo carencia, y un `Math.floor` daría cero justo en
las últimas horas.

La reentrada añade `libreDeReentradaDesde(aplicadoEl, horas)`, en el mismo módulo.

### 3.2 La carencia de una intervención

Una función pura, `carenciaDeIntervencion(intervencion, enLaFecha)`:

| Caso | Resultado |
|---|---|
| `manejo_cultural` | `no_aplica`. No es «desconocida»: no se aplicó nada |
| todas las líneas declaran | `conocida`, **manda la más larga** de la mezcla |
| alguna línea no declara | `desconocida`. Si otra línea sí declara, añade `alMenosHasta` |
| la más larga ya se cumplió y ninguna es desconocida | `cumplida` |

La reentrada, igual en horas, con `reentradaDeIntervencion`.

**`desconocida` nunca se convierte en `cumplida` por el paso del tiempo.** Una
carencia que nadie declaró no vence sola: sigue en *falta un dato* hasta que
alguien corrige la intervención con el valor.

Qué intervenciones cuentan: **sólo las vigentes**, es decir, las que no han sido
corregidas por otra. Una corregida la sustituye su corrección.

### 3.3 Qué intervenciones tocan una cosecha

Las de **la misma parcela, sin importar el bloque ni las plantas**, porque la
cosecha no dice de qué bloque salió. Y también las de sus **ascendientes y
descendientes** por `parentLocationId`: una cosecha de la parcela madre puede
llevar café de la microparcela tratada, y una de la microparcela, café tratado
desde la madre. Es lo conservador, y Daniel lo aprobó: mejor un aviso de más que
una carencia que no se ve.

Para eso hace falta **una función nueva**, `ubicacionesEmparentadas(locationId)`,
que devuelve la ubicación, sus ascendientes y sus descendientes. Copia de
`conAncestros` el tope `PROFUNDIDAD_MAXIMA_DE_UBICACION = 12` y la guarda de
ciclos, porque nada en el esquema impide un `parentLocationId` en ciclo. **No
autoriza**: quien la llama ya pasó la compuerta, igual que `carenciasVigentes`.

### 3.4 La marca en la cosecha

`recordHarvestEvent` **sigue guardando siempre**. En la misma transacción
escribe una fila `HarvestWithdrawalFlag` **por cada intervención que siga en
carencia** en `harvestedAt`:

| Campo | Regla |
|---|---|
| `harvestEventId`, `interventionId` | únicos por par |
| `diasQueFaltaban` | entero, anulable. **Nulo = carencia desconocida** |

**Sin filas: no había ninguna carencia vigente.**

**Por qué no copiar `withinWithdrawalDays` del apiario.** Allí el nulo significa
«no había carencia». Aquí hay que distinguir «no había» de «no se sabe» (ADR-080),
y Daniel pidió además **de qué aplicación viene**, cosa que una sola columna no
puede decir.

**Es una foto de lo que el sistema sabía al cosechar.** Si después se corrige la
intervención, la foto no se toca. La página de la cosecha enseña **también** el
cálculo de hoy, y **si no coinciden lo dice**: lo que se sabía entonces y lo que
se sabe ahora son dos hechos, y el día que aparezca un residuo en un análisis
importan los dos.

### 3.5 La reentrada

Avisa y **no impide**, en dos sitios:

- en el tablero de la parcela (§4.1);
- **al abrir una jornada** en esa parcela o en una emparentada:
  *«sin protección no entrar hasta las 14:00 — aplicación de ayer, 16:00»*. El
  aviso no retrasa la apertura y no pide confirmación.

Una reentrada no declarada dice **«reentrada desconocida»** y no se calla. Si se
calla, se lee como que se puede entrar.

---

## 4. El tablero y las trampas

### 4.1 Avisos nuevos en `pendienteDeLaParcela`

La función sigue siendo **pura** y recibe «hoy» ya calculado. `EntradaDePendiente`
gana `intervenciones`, ya reducidas a su carencia y reentrada por las funciones
de §3.2, y `ahora` (un instante), porque la reentrada se mide en horas.

| Grupo | Aviso | Enlaza a |
|---|---|---|
| *Toca hacer* | `reentrada_vigente` — hasta qué hora, de qué intervención | la intervención |
| *Toca hacer* | `carencia_vigente` — «no cosechar hasta el 3 de octubre», por intervención | la intervención |
| *Falta un dato* | `carencia_no_declarada` / `reentrada_no_declarada` | la intervención, para corregirla con el valor |

### 4.2 La frontera con la pieza 2, cerrada

La pieza 2 dejó la acción sugerida como **texto libre** y dijo (§5 y §8 de su
spec) que, cuando existiera un catálogo, la regla apuntaría a él. Así se cumple:

- **`TrapRule` gana `suggestedMaterialId`**, opcional, FK `ConsumableMaterial`,
  filtrado a `isPlantProtection`.
- **`suggestedAction` se queda**, ahora como nota. Una regla vieja no pierde su
  texto, y nadie la reescribe adivinando qué producto quería decir. Si hay
  producto, el aviso nombra el producto y enseña la nota debajo.
- **El aviso de lectura disparada trae «Registrar aplicación»**, que abre el
  formulario ya rellenado con el producto sugerido, el bloque de la trampa y
  `motivoObservationId` = esa lectura. Todo editable.
- **El aviso se da por atendido** cuando existe una intervención vigente
  **posterior a la lectura** que cubre la trampa:

| La trampa | La cubre |
|---|---|
| está en el bloque B | una intervención sobre la parcela entera, o con un área que incluye B |
| no tiene bloque | sólo una intervención sobre la parcela entera |
| cualquiera | **no** la cubre una intervención sobre plantas sueltas |

**Cuenta cualquier tipo de intervención, también una repela.** El sistema no
juzga si la respuesta fue la sugerida, sólo que hubo una respuesta registrada.
Juzgar eso sería que el sistema opine sobre agronomía, y la regla sugiere, no
manda (spec de la pieza 2, §5).

**Atendido no es resuelto.** La trampa sigue con su plazo de revisión, y la
lectura siguiente dice si funcionó. Ése es el seguimiento de eficacia que piden
las guías, y no hace falta un campo «eficacia»: sale de comparar la lectura que
motivó la intervención con la que vino después.

### 4.3 Lo que esto enseña a quien lo usa

Por la rúbrica pedagógica (`docs/beneficio/22_rubrica_pedagogica.md`):
documentar es el medio, no el fin. La ficha de una intervención motivada por una
trampa enseña, en una línea, **la lectura antes y la lectura después**. Así
quien aplicó ve si sirvió sin buscarlo. Si no hay lectura posterior, lo dice:
*«todavía no hay revisión después de esta aplicación»*, y no deja un hueco.

Por la rúbrica de veracidad (`21_rubrica_veracidad.md`): cada carencia que se
enseña dice **de dónde salió**. Si el valor de la línea coincide con el del
producto, dice «del producto»; si no, «indicado al registrar». Una cifra que no
dice su origen no se puede desarmar.

### 4.4 La jornada

`FieldEvent` gana `plotInterventionId`, igual que A9.1 añadió las FK de apiario:
una intervención hecha durante una jornada queda **dentro** de la jornada. Si no
hay jornada, la intervención se registra igual: `fieldSessionId` es opcional.

---

## 5. Pantallas y permisos

| Ruta | Qué hace |
|---|---|
| `/plots/[id]` | sección «Manejo fitosanitario»: las últimas intervenciones y **Registrar manejo** |
| `/plots/[id]/manejo/nuevo` | 1) **el tipo primero**, la misma idea que el «¿a qué vienes hoy?» del apiario. 2) Las líneas: el selector sólo enseña `isPlantProtection`; al elegir un producto **enseña sus `safetyNotes`** (el botiquín decidió que las advertencias van en el producto y se ven al ir a aplicarlo) y precarga carencia y reentrada **visibles y editables**; el frasco es opcional y se avisa si está vencido. 3) El área: nada es la parcela entera. 4) Objetivo, método, fecha, operario y notas |
| `/plots/[id]/manejo/[interventionId]` | el detalle, sus carencias con su origen, la lectura antes y después si la hubo, y **Corregir** con motivo obligatorio |
| ficha del material (inventario) | las dos columnas nuevas se añaden al formulario de material que ya existe |

**Permisos, sin inventar ninguno:**

- registrar y corregir: `requireLotAccess(manage)` sobre la parcela, igual que el
  consumo con padre `location` (decisión de F1: reusar, no crear);
- dar de alta y editar un producto: `equipment:manage`, como `crearMaterial`;
- enlazar la regla de trampa a un producto: **el permiso que la pieza 2 decida
  para `TrapRule`**, que su spec dejó abierto (§9).

**Primero en línea.** La cola offline de captura de parcela
(`2026-09-16-cola-offline-captura-de-parcela-design.md`) queda fuera: la
intervención se añade a esa cola después, sin rehacer nada.

---

## 6. Orden de entrega

La pieza depende de algo que ya existe (el botiquín) y de algo que todavía no
(los bloques y la regla de trampa). Por eso se parte en dos entregas, y **cada
una funciona sola**:

1. **PR A — registrar y avisar:** las dos columnas del catálogo, las tres tablas,
   áreas **parcela entera y plantas**, el módulo puro de carencia, la marca en la
   cosecha, la reentrada en tablero y jornada, los avisos, las tres pantallas y
   la FK en `FieldEvent`. Sustituye por sí sola la fumigación anotada como
   consumo sin carencia.
2. **PR B — cuando `PlotBlock` y `TrapRule` estén en `main`:** áreas por bloque,
   `suggestedMaterialId`, el botón «Registrar aplicación» en el aviso de trampa y
   el aviso atendido.

**Antes del plan:** la lista de objetivos de Daniel (§8, punto 1).

---

## 7. Pruebas que el plan tiene que traer

Cada una con su **flip-test**: la mutación que dice cazar, aplicada, y la prueba
que cae **nombrada**.

| Prueba | Mutación que la tiene que tumbar |
|---|---|
| carencia `desconocida` si una línea de la mezcla no declara, aunque otra sí | tratar el nulo como 0 |
| la mezcla manda por la **más larga** | tomar la primera línea |
| `manejo_cultural` da `no_aplica`, no `desconocida` | quitar la rama por tipo |
| `desconocida` no pasa a `cumplida` con el tiempo | comparar sólo fechas |
| una cosecha en carencia **se guarda** y escribe una fila por intervención, con nulo para la desconocida | no escribir la marca; o escribir 0 en vez de nulo |
| una cosecha **sin** carencia vigente no escribe filas | escribir una fila con 0 |
| la cosecha de la parcela madre ve la intervención de la microparcela, y al revés; **un hermano no** | mirar sólo la misma ubicación; o mirar a los hermanos |
| `ubicacionesEmparentadas` termina con un `parentLocationId` en ciclo | quitar la guarda de vistos |
| el servicio **no** copia la carencia del producto cuando la línea llega sin ella | copiar `defaultWithdrawalDays` en el servicio |
| `manejo_cultural` con líneas se rechaza; `aplicacion` sin líneas se rechaza | quitar cada regla |
| área con bloque **y** planta, o con ninguno de los dos, la rechaza **la base** | quitar el `CHECK` |
| bloque o planta de otra parcela se rechazan | quitar la comprobación |
| la línea con frasco y cantidad descuenta **en la misma transacción**; si falla la auditoría no queda ni intervención ni descuento | sacar el descuento de la transacción |
| unidad distinta a la del lote se rechaza | quitar la comparación |
| frasco vencido: se guarda y queda `lotExpiredAtApplication = true` | bloquear; o no marcar |
| corregir escribe fila nueva con `correctsId`, la original intacta; no se corrige lo corregido | `UPDATE` en sitio |
| la reentrada vigente aparece al abrir jornada en una ubicación emparentada | mirar sólo la misma |
| aviso de trampa atendido por intervención posterior sobre la parcela entera o su bloque; **no** por una anterior, ni por plantas sueltas, ni por otro bloque | cada regla de la tabla de §4.2 |
| el aviso de reentrada desconocida **aparece** | filtrar los nulos |

Y el caso que un corpus real no ejercita: **ninguna prueba se apoya sólo en datos
de la base compartida**. Las funciones puras (§3.2, §4.1) reciben la entrada
hostil directamente.

---

## 8. Decisiones abiertas — de Daniel

1. **La lista de objetivos** (`PlotInterventionTarget`): contra qué se aplica en
   la finca. Tiene que estar antes del plan. Lleva `otro` con su nota, como todos
   los vocabularios del dueño.
2. **Si la línea de aplicación escribe también un `MaterialConsumptionEntry`.**
   Ver el cambio al principio: aquí se sigue el precedente del botiquín, que no
   lo escribe.

## 9. Fuera de alcance

- **Reclasificar las fumigaciones ya registradas como consumo.** Las filas
  anteriores de `MaterialConsumptionEntry` con padre `location` se quedan como
  están: convertirlas en intervenciones exigiría adivinar su objetivo y su
  carencia. Desde esta pieza, una fumigación nueva se registra como
  intervención.
- **La calibración del equipo de aplicación** y el volumen por hectárea como
  cálculo. Se guarda el volumen del caldo; la dosis por área es un reporte que
  viene después.
- **Unificar el tratamiento de colmena con la intervención de parcela.**
  Comparten catálogo, frasco y aritmética de carencia, que es lo que tenía que
  ser común. Sus registros son distintos a propósito.
- **Los plazos de las guías** (revisión quincenal, 150 mm de lluvia): la pieza 2
  ya los dejó fuera.
- **Cualquier dato de producto:** composición, dosis, carencia o registro de
  Bralic, Regin o cualquier otro. Los pone quien da de alta el producto.
- **Avisos fuera de la aplicación** (correo, WhatsApp): siguen sin proveedor.
- La cola offline (§5).
