# Jornada y entrega de cosecha — la finca manda, el beneficio recibe (pieza 1 de 3)

**Estado:** aprobado por Daniel el 2026-09-18 («continua»).

**Enmienda** a `docs/superpowers/specs/2026-09-18-seccion-finca-design.md` (§3, §4, §5.3 y §5.7).
Donde los dos digan cosas distintas, manda éste: sale de lo que Daniel dijo después.

## 1. Lo que dijo Daniel (2026-09-18)

> «en finca no se registra cosecha, se puede registrar listo para cosechar y asignar personas a
> cosecha, y esta persona recolecta según su tarea y lleva al beneficio, esta persona podría
> registrar en el app lo que entregó: foto, procedencia de parcela, microparcela, bloque o plant
> specimen, y pesar en general lo entregado a beneficio. ya en beneficio se registra recepción, se
> pesa aparte, flotación, selección, categorización, repesado de nuevo, y se pueden iniciar crear
> lotes. son dos usuarios diferentes, dos pantallas y funciones diferentes, pero ahí se solapa el
> tema de accountability en ambos lados y doble check de pesos en entrega.»

Respuestas del mismo día:

| pregunta | respuesta |
|---|---|
| quién anota la entrega | **los dos**: el recolector con su cuenta, o el capataz por él. La entrega guarda quién recolectó y quién la anotó |
| cuando los dos pesos no coinciden | **se registran los dos y se avisa**; pasada la tolerancia, quien recibe escribe una nota; no bloquea |
| «listo para cosechar» y asignar | **una jornada de cosecha**: fecha, parcelas listas y qué recolectores van a cada una |
| cómo se juntan las entregas en lotes | **al crear el lote**, eligiendo qué entregas recibidas entran |
| flotación, selección, repesado: sobre qué | **depende del día**: sobre una entrega sola o sobre una tanda |
| el recolector también reporta | «recolector puede hacer un registro de jornada que puedan ver sus superiores y demás que deben reportar o trabajan ese lote, si se les da autorización: ver situaciones de campo de parcelas, microparcelas, bloques, specimen y/o algún lote» |
| con qué forma | **las dos**: un tipo del catálogo si aplica, o «otro» con nota libre; y foto |
| cómo se construye | **tres piezas**, en este orden: (1) jornada y entrega en finca, (2) recepción con doble peso en el beneficio, (3) de la recepción al lote |

**Este documento es la pieza 1.** Las piezas 2 y 3 tendrán su propio spec.

## 2. Lo que hay hoy (medido sobre `origin/main`, 2026-09-18)

- **La cosecha y la «recepción» son un solo acto.** `recordHarvestEvent`
  (`lib/traceability/harvest.ts`) crea el `Lot` de cereza y su `HarvestEvent` en la misma
  transacción, desde `/lots/new`. El lote nace al registrar la cosecha.
- **No existe** «lista para cosechar», jornada ni asignación de recolectores.
  - `FieldSession` es una jornada de campo genérica.
  - `LabourEntry` cuenta personas y horas en conjunto, no por persona.
- **No existe** ningún modelo de entrega ni de recolector. `FincaRecolector`,
  `EntregaDeCosecha` y `MuestraDeEntrega` están en el spec de Finca, sin construir.
- **El bloque es real:** `PlotBlock` es un bloque dentro de una parcela, con sus `Specimen`.
  El spec de Finca (§5.7) decía que el bloque era la parcela misma; **se corrige aquí**.
- **Precedente de dos actos y dos firmas:** `StoreAllocation` (ADR-163). Uno asigna y otro
  confirma lo recibido, y las columnas de recepción van juntas o ninguna (CHECK).
- `docs/beneficio/01_lot_lifecycle.md` pide, para salir de la entrada, un «peso de cereza
  registrado y firmado». Eso es la pieza 2.

## 3. Diseño de la pieza 1

### 3.1 La jornada de cosecha

- La abre el Farm Manager o el capataz de la finca. Lleva:
  - la fecha;
  - la finca (su `site`);
  - las **parcelas o microparcelas listas**: una o más, todas bajo esa finca;
  - la **asignación**: qué recolector va a cada parcela, sin repetir la pareja;
  - una nota.
- Una jornada está **abierta** o **cerrada**. Cerrada ya no admite entregas nuevas.

### 3.2 El recolector

- **Recolector = `Person`**, con cuenta o sin ella. El repositorio prohíbe crear una segunda
  identidad para el mismo humano.
- La lista de recolectores de la finca es `FincaRecolector` (del spec de Finca, §5.3):
  `personId`, finca, `desde`, `hasta` anulable. Una persona puede recolectar en dos fincas.

### 3.3 La entrega

Una fila por viaje de un recolector al beneficio.

| campo | qué es |
|---|---|
| jornada | de qué jornada sale |
| recolector | la `Person` que recolectó; tiene que estar asignada en la jornada |
| origen | **exactamente uno**: parcela o microparcela (`Location` `plot`), bloque (`PlotBlock`) o planta (`Specimen`), dentro de lo asignado a esa persona en esa jornada |
| peso de finca (kg) | lo que se pesó al salir; mayor que 0 |
| foto | una o más, como `Asset`, con el patrón de medios que ya existe |
| anotada por | la cuenta que la registró: la del recolector o la del capataz |
| enviada | cuándo salió hacia el beneficio |

- **La entrega no es un lote** y no crea ninguno. Queda **enviada**, esperando al beneficio,
  que la recibirá en la pieza 2.
- **Reglas en la base** (CHECK):
  - exactamente uno de los tres orígenes;
  - peso mayor que 0.
- Que el origen esté dentro de lo asignado se comprueba en el servicio, **dentro de la
  transacción**.
- Una entrega enviada **no se edita**. Si hay un error, se anula con motivo y se registra otra,
  igual que el resto de registros de este repositorio (se corrige con historia, no se
  sobrescribe).

### 3.4 Permisos

- **Abrir y cerrar jornadas y anotar la entrega de otra persona:** `lot:manage` sobre el sitio
  de la finca. Es lo que ya tienen el Farm Manager y el capataz (Farm Operator).
- **Anotar la entrega propia**:
  - un permiso nuevo, `harvest_delivery:create_own`, con un perfil nuevo, **Recolector**, que
    sólo tiene eso y ver su propia jornada;
  - el servicio exige que la `Person` de la cuenta sea el recolector de la entrega y que esté
    asignada en esa jornada;
  - un recolector **no ve** las entregas de otros.
- Lo que cada persona entrega es **dato personal** (Ley 81 de 2019, aviso del spec de Finca, §3).
  Quién ve los datos con nombre sigue siendo el permiso de §5.5 de ese spec.

### 3.5 Las situaciones de campo que reporta el recolector

- **Ya existe casi todo.** La jornada de campo (`FieldSession`, sobre una ubicación y con su
  operador) lleva eventos de campo (`FieldEvent`). Cada evento tiene su tipo de un catálogo,
  nota, foto (`Asset`), GPS y enlaces opcionales a una planta, una medición o una cosecha.
  **No se crea un modelo nuevo:** se usa ése.
- **Lo que cambia:**
  - el recolector con cuenta, durante su jornada de cosecha, puede anotar situaciones de campo
    sobre lo que tiene asignado: parcela, microparcela, bloque o planta. También sobre un lote,
    si su jornada lo toca;
  - cada situación lleva un tipo del catálogo o **«otro» con nota obligatoria**, más la foto.
  - también las **condiciones del día** (lluvia, neblina…), con su valor si se mide (mm de lluvia,
    por ejemplo). Lo fijo del terreno —GPS, altitud, pendiente, orientación, sombra— no se anota
    aquí: es otra pieza, `2026-09-18-condiciones-fijas-del-terreno-design.md`.
- **Quién lo ve:**
  - **sus superiores** en esa finca (Farm Manager y capataz), siempre;
  - **los demás** que trabajan esa parcela o ese lote, **sólo si se les concede** un permiso
    nuevo de ver situaciones de campo en ese ámbito (el nombre se fija en el plan contra
    `lib/rbac/catalog.ts`);
  - nadie más.
- **Hoy abrir una jornada de campo exige `location:manage_attributes`**, que el recolector no
  tiene ni debe tener: es la autoridad para reescribir sol, sombra y suelo. Se hace como el
  apiario (`requireFieldSessionAccess`): una compuerta propia para registrar sin ensanchar ese
  permiso.

### 3.6 Pantallas

- **Finca → Jornadas:** la lista de jornadas de la finca elegida, y abrir una.
- **La jornada:** sus parcelas, quién va a cada una, las entregas que lleva, y «Anotar entrega».
- **Mis entregas** (perfil Recolector): la jornada de hoy donde está asignado, el botón para
  anotar la suya y el de «Reportar algo del campo». Pensada para celular.

## 4. Lo que cambia del spec de Finca

- §4 «dónde se anota cada entrega: en una pantalla de cosecha» → **en la jornada**. El
  recolector con cuenta la anota él mismo.
- §5.3 «Recolector = `Person`, sin cuenta» → **con cuenta o sin ella**.
- §5.3 `EntregaDeCosecha`: ahora nace **en la finca, sin lote**. La muestra al recibir
  (`MuestraDeEntrega`) se mueve a la pieza 2, porque se toma **en el beneficio**.
- §5.7 «bloque = parcela» → el bloque es `PlotBlock`.
- «La cosecha» dentro de Finca → la finca no crea lotes. El enlace «Registrar una cosecha» de
  `/finca` y la cosecha propia de `/lots/new` se **sustituyen al final de la pieza 3**. Hasta
  entonces siguen funcionando.

## 5. Fuera de esta pieza

- La recepción, el segundo peso, la tolerancia y la nota (pieza 2).
- La flotación, la selección, la categorización, el repesado y la creación de lotes (pieza 3).
- Registrar sin conexión.

## 6. Pruebas que tienen que existir

- Una entrega con dos orígenes, o sin ninguno, se rechaza **en la base**; con uno, entra
  (control positivo).
- Una entrega de una parcela no asignada a ese recolector en esa jornada se rechaza; la
  asignada, entra.
- **El recolector anota la suya, no la de otro;** el capataz anota la de cualquiera de la
  jornada. Control positivo en los dos lados.
- Un Farm Operator de OTRA finca no abre jornadas aquí.
- Una jornada cerrada no admite entregas nuevas.
- Anular una entrega exige motivo y la deja visible como anulada.
- **Situaciones de campo:**
  - el recolector reporta sobre lo que tiene asignado y no sobre otra parcela;
  - su superior la ve;
  - un compañero **sin** el permiso no la ve, y **con** el permiso sí (control positivo);
  - reportarla no le da `location:manage_attributes`;
  - «otro» sin nota se rechaza.
