# Recepción de cereza en el beneficio: doble peso, cereza de fuera y pedidos

**Estado:** diseño aprobado por partes por Daniel el 2026-09-19; este documento, pendiente de su
revisión.

Pieza 2 de 3 del flujo finca → beneficio. La pieza 1 (`2026-09-18-jornada-y-entrega-de-cosecha-design.md`,
PR #431) deja cada entrega `enviada`, sin lote. Esta la recibe. En la pieza 3, de cada recepción
salen los procesos —cada uno, un lote— con flotación, selección, categorización y repesado.

**El propósito es la trazabilidad** (Daniel, 2026-09-19: «la idea es trazabilidad, y de una
recepción se pueden correr muchos diferentes procesos, y cada uno se ve como un lote»). La
recepción es el **origen**: qué llegó, de dónde, cuánto pesó en cada lado y quién firmó cada
lado. Desde cualquier lote se tiene que poder volver a su recepción, y de ahí a su entrega,
jornada, parcela, bloque o planta y recolector, o a su proveedor.

## 1. Lo que dijo Daniel

Del 2026-09-18: «ya en beneficio se registra recepción, se pesa aparte… son dos usuarios
diferentes, dos pantallas y funciones diferentes, pero ahí se solapa el tema de accountability en
ambos lados y doble check de pesos en entrega». Y, cuando los dos pesos no coinciden: «se
registran los dos y se avisa; pasada la tolerancia, quien recibe escribe una nota; no bloquea».

Del 2026-09-19:

> «un beneficio puede recibir cerezas… hay cerezas que pueden venir de fincas no en el sistema,
> cuales capataces y/o recolectores no estén vinculados, y me llegan directo al beneficio, y se
> trata como otra fuente de cereza: no cambia metodología o workflow.»
>
> «también del peso solicitado: solicité 500 kg de cerezas y llegaron 520 kg… se solicitó tanto
> rojo con tanto margen % de verde, pues es aceptable, pero esta entrega no.»

| pregunta | respuesta |
|---|---|
| quien recibe, ¿puede ser quien anotó la entrega? | **no**: siempre otra persona, ni quien la anotó ni su recolector |
| cómo sabe el beneficio qué le toca | **la jornada dice a qué beneficio va**; el capataz lo elige al abrirla |
| la cereza de fuera, ¿de dónde viene? | **como organización**, dada de alta una vez y elegida después de una lista |
| la de fuera, ¿contra qué se compara? | **el peso declarado por el productor**, si lo trae; si no, sólo el del beneficio |
| el pedido, ¿en qué pieza? | **en la 2 el pedido y la cantidad; en la 3 la calidad** |
| ¿a quién se le pide? | **a cualquier fuente**: finca propia o productor de fuera |
| ¿sin pedido? | **sí**: el pedido es opcional |
| llega distinto de lo pedido | **se recibe todo y se marca la diferencia**; pasado el margen, nota; no bloquea |
| cómo se pesa | **bruto menos tara** de los recipientes |
| ¿se rechaza al recibir? | **sí, con motivo y foto** |
| ¿muestra al recibir? | **sí, opcional: Brix** |
| cómo se construye | **una sola recepción**, venga de donde venga (enfoque A) |
| ¿en qué estado se pesa? | **siempre igual, no se anota**: fresca, tal cual, en los dos lados |
| ¿de una recepción salen varios lotes? | **sí**: «de una recepción se pueden correr muchos diferentes procesos, y cada uno se ve como un lote»; y un lote puede juntar varias recepciones |

## 2. Lo que hay hoy (medido sobre `origin/main`, 2026-09-19)

- **El beneficio es una `Location` de tipo `beneficio`**, hija del `site` de su finca
  (`lib/traceability/beneficios.ts`, `crearBeneficio`).
- **La entrega** (`EntregaDeCosecha`) nace en la jornada, `enviada`, con su peso de finca
  (`pesoFincaKg`), quién la anotó (`anotadaPor`) y su recolector. **Nada la recibe.**
- **La jornada** (`JornadaDeCosecha`) no dice a qué beneficio va.
- **La tolerancia de pesos ya existe**, en `lib/beneficio/balanceDeMasas.ts`
  (`POLITICA_POR_DEFECTO`): 0,5 % relativo `[PROVISIONAL]` con piso de 0,5 kg, y estados
  `BALANCED`, `DISCREPANCY_FLAGGED` y `GROSS_IMBALANCE` (más de 5 %). Sale de
  `docs/beneficio/12_mass_balance_byproducts.md` §2: *«nunca `raise` ante un desbalance de
  campo»*.
- **La regla de Brix al recibir NO existe en código.** Está sólo en
  `docs/beneficio/11_brix_kinetics.md`: 18,0–24,0 °Bx es `INTAKE_OPTIMAL`; menos de 16,0 °Bx es
  `INTAKE_UNDERRIPE`. **Entre 16 y 18, y por encima de 24, el documento no dice nada.**
- **`OrganizationType`** ya trae `producer` y `supplier`: un productor de fuera es una
  `Organization`, sin `Location` propia.
- **Precedente de dos actos y dos firmas:** `StoreAllocation` (ADR-163): uno asigna, otro
  confirma lo recibido, y las columnas de recepción van juntas o ninguna (CHECK).
- `docs/beneficio/01_lot_lifecycle.md`: salir de `INTAKE` pide un «peso de cereza registrado y
  firmado». Esta pieza lo da; la transición de etapa es de la pieza 3.

## 3. Diseño

### 3.1 El destino de la jornada

- `JornadaDeCosecha` gana `beneficioId` (una `Location` de tipo `beneficio`).
  - **Obligatorio al abrir una jornada nueva.** Lo comprueba el servicio: tiene que existir y
    ser de tipo `beneficio`.
  - **Anulable en la base**, por las jornadas abiertas antes de esta pieza. A una sin destino se
    le puede poner uno después (el Farm Manager o el capataz de la finca, con AuditEvent), y
    hasta entonces sus entregas no salen como pendientes en ningún beneficio.
  - **Se puede cambiar sólo mientras ninguna entrega de la jornada tenga recepción vigente.**
    Después queda fijo: una recepción anulada devuelve su entrega a pendiente **en el mismo
    beneficio**, no en otro.

### 3.2 El proveedor de fuera

- Es una `Organization` con `organizationType = producer`, **sin** `Location`, parcelas ni
  recolectores.
- Se da de alta una vez: nombre, y lugar en texto si se sabe. No se inventan coordenadas.
- Permiso nuevo `cherry_supplier:create`; de serie lo tienen el Farm Manager y el Farm Operator.
- Nombre único entre los proveedores de cereza, sin distinguir mayúsculas, para que «Don Pedro»
  no se dé de alta dos veces.

### 3.3 El pedido de cereza (opcional)

- `PedidoDeCereza`:
  - a quién: **exactamente uno** de una finca propia (su `site`) o un proveedor de fuera (CHECK);
  - para qué beneficio, y la fecha;
  - `kgPedidos` (> 0) y `margenCantidadPct` (≥ 0);
  - la calidad pedida, toda opcional: `minMaduroPct`, `maxVerdePct`, `maxFlotesPct`, cada una
    entre 0 y 100 (CHECK). **Se guarda ahora y se evalúa en la pieza 3.**
  - estado: `abierto` o `cerrado`.
- **Una recepción puede apuntar a un pedido**, del mismo beneficio y de la misma fuente que la
  recepción (lo comprueba el servicio). Una jornada no apunta a un pedido: son sus entregas las
  que, al recibirse, se atan a él si quien recibe lo elige.
- **La cantidad:** lo recibido del pedido (la suma de los netos de sus recepciones `recibida`)
  contra `kgPedidos`: «+20 kg sobre lo pedido (+4 %)».
  - **Exceso:** la recepción que deja lo recibido por encima de `kgPedidos × (1 + margen)` lleva
    nota obligatoria. Para que dos recepciones simultáneas no crucen el margen sin nota, recibir
    contra un pedido **bloquea la fila del pedido** (`SELECT … FOR UPDATE`) en la misma
    transacción.
  - **Falta:** se juzga **al cerrar** el pedido: si lo recibido queda por debajo de
    `kgPedidos × (1 − margen)`, cerrar exige nota. Mientras está abierto, lo que falta no es una
    discrepancia: pueden llegar más entregas.
  - Una recepción anulada después del cierre recalcula las cifras del pedido; el cierre y su
    nota quedan como estaban, con su AuditEvent.
  - **No bloquea** en ningún caso.
- **La calidad pedida se define ya, para que la pieza 3 la mida igual:** `minMaduroPct`,
  `maxVerdePct` y `maxFlotesPct` son porcentajes sobre el total de la selección de la Etapa A,
  con las categorías `prime_ripe`, `underripe` y `floaters` de `lib/beneficio/balanceDeMasas.ts`.
  **Sólo es atribuible a un pedido en un lote hecho únicamente con cereza de ese pedido**; un lote
  que mezcla pedidos sale «no atribuible», en vez de dejar que uno oculte el incumplimiento del
  otro.

### 3.4 La recepción

- `RecepcionDeCereza`:
  - **origen, exactamente uno** (CHECK):
    - una entrega de finca (`entregaId`, **único**: una entrega se recibe una vez), o
    - un proveedor de fuera (`proveedorId`);
  - el beneficio que recibe (`beneficioId`), quién recibe (`recibidaPor`) y cuándo
    (`recibidaAt`); el pedido, si lo hay;
  - **el peso:**
    - `brutoKg` (> 0), `recipientes` (entero ≥ 0), `taraPorRecipienteKg` (≥ 0);
    - `netoKg` = bruto − recipientes × tara, **guardado** y > 0 (CHECK que lo recalcula; no se
      confía en quien lo manda);
  - **el segundo peso:** el de finca, si viene de una entrega (se lee de la entrega, no se
    copia a mano); o `pesoDeclaradoKg`, si el productor de fuera lo trajo. Anulable.
  - **la comparación de básculas** (`comparacionDePesos`), calculada al recibir con
    `POLITICA_POR_DEFECTO` y **guardada** con la política que se usó:
    - la **referencia** es el peso de origen (el de finca o el declarado);
    - diferencia = neto − referencia; % = diferencia / referencia;
    - tolerancia = máx(referencia × 0,5 %, 0,5 kg);
    - estado `BALANCED`, `DISCREPANCY_FLAGGED` o `GROSS_IMBALANCE`.
    - **No es una compuerta de etapa.** Compara dos básculas, y nunca bloquea nada. El balance
      de la selección (pieza 3) es otra evaluación, con sus propias consecuencias normativas.
    - Sin segundo peso: sin comparación, y se dice así.
    - **La condición de pesaje no se anota** (decisión de Daniel, 2026-09-19): la cereza se pesa
      siempre fresca, tal cual, en los dos lados, y las dos pesadas se consideran comparables.
      Se aparta de `12_mass_balance_byproducts.md` §2, que pide `weighing_condition` en cada
      peso; la decisión queda anotada allí. Si un día cambia, se añade el campo.
  - `nota`: **obligatoria** si el estado no es `BALANCED` o si se cruza el margen del pedido.
    Nunca bloquea.
  - `brixDeRecepcion` (opcional) con **su punto de muestreo** (`SamplePoint` del contrato:
    `CHERRY_PULP`, `MUCILAGE_PRESSED`…, obligatorio si hay Brix), el instrumento si se sabe, y su
    veredicto: `INTAKE_OPTIMAL`, `INTAKE_UNDERRIPE`, **sin veredicto** para el tramo que el
    documento normativo no cubre, o `SENSOR_FAULT` fuera del rango físico 0–32 °Bx
    (`11_brix_kinetics.md` §1). Fuera de rango **se guarda** con `SENSOR_FAULT`, no se rechaza.
    **No se inventa un umbral.**
  - fotos: `Asset` atados a la recepción.
  - estado: `recibida`, `rechazada` o `anulada`.
- **Rechazar:** con motivo (obligatorio) y foto. Se guarda el peso igual. Una recepción
  rechazada **no puede entrar a ningún lote** (lo impondrá la pieza 3 contra el estado, y una
  prueba de esta pieza fija el estado).
- **Anular** una recepción: con motivo, sólo con `lot:manage` sobre el beneficio, y **sólo
  mientras no haya salido de ella ningún lote**. La entrega vuelve a pendiente y se puede
  recibir otra vez: por eso el `entregaId` es único **entre las no anuladas** (índice parcial),
  no en toda la tabla.
- **Anular la entrega** desde la finca ya no se puede si tiene una recepción vigente (servicio y
  disparador). Antes, `anularEntrega` sólo miraba que estuviera `enviada`.
- **Recibir exige, dentro de la transacción y con la fila de la entrega bloqueada**
  (`SELECT … FOR UPDATE`): que siga `enviada`, que su jornada vaya a **este** beneficio y que no
  tenga otra recepción vigente. La lista de pendientes es una comodidad, no la regla.
- **Idempotencia:** cada formulario lleva una `claveDeEnvio` única (generada al abrirlo). Un
  reintento con la misma clave devuelve la recepción ya guardada en vez de crear otra: cubre la
  cereza de fuera, que no tiene entrega que la haga única.
- **De una recepción salen uno o varios lotes, cada uno un proceso**, y un lote puede juntar
  varias recepciones (decisión de Daniel). Es genealogía, la de `20_modelo_ciclo_completo.md`
  —la identidad del lote a través de divisiones y fusiones—, no inventario. Lo que esta pieza
  fija para que la pieza 3 lo cumpla:
  - cada lote dice **de qué recepciones sale y cuántos kg toma de cada una**; ese vínculo es el
    que permite volver del lote al origen;
  - **los kilos no se inventan:** la suma de lo que toman los lotes de una recepción no pasa de
    su neto. Es el balance de masas, al servicio de la trazabilidad;
  - para que dos lotes creados a la vez no tomen los mismos kilos, crear un lote bloquea las
    filas de sus recepciones;
  - sólo de una recepción `recibida` sale cereza; de una `rechazada` o `anulada`, ninguna.
- **La regla de dos personas** (servicio **y** base):
  - quien recibe, rechaza o anula no es quien anotó la entrega (`entrega.anotadaPor`) ni la
    cuenta de su recolector;
  - en la base, un disparador lo comprueba contra la entrega **al insertar y al actualizar**. Un
    CHECK no puede mirar otra tabla;
  - las columnas de la recepción son **inmutables** salvo el estado y los campos de su
    anulación, y el mismo disparador lo impone.
  - La cereza de fuera no tiene anotador en el sistema: la regla no aplica, y se dice así.
- **Cada escritura**, con su `AuditEvent` en la misma transacción.

### 3.5 La regla de Brix, como módulo puro

- `lib/beneficio/brixDeRecepcion.ts`: `evaluarBrixDeRecepcion(bx)` → `SENSOR_FAULT` (fuera de
  0–32) | `INTAKE_OPTIMAL` | `INTAKE_UNDERRIPE` | `SIN_VEREDICTO`, con los umbrales citados de
  `11_brix_kinetics.md`.
  Nombres de estado del contrato (`03_public_api.md`); `SIN_VEREDICTO` **no** es un estado del
  contrato y no se presenta como tal: es la ausencia de uno.

## 4. Pantallas

- **Elegir el beneficio.** Con varios, se elige uno y se recuerda en una cookie que sólo acota,
  como la finca (`/fincas`).
- **`/beneficio/recepcion`:**
  - **pendientes:** las entregas `enviada`, sin recepción vigente, de jornadas cuyo destino es
    este beneficio: recolector, finca, origen, kg de finca, hora;
  - **recibir** una pendiente: bruto, recipientes, tara, Brix, pedido (si hay abiertos para esa
    fuente), fotos, nota; o **rechazar** con motivo y foto;
  - **recibir cereza de fuera:** proveedor (de la lista, o darlo de alta ahí), peso declarado
    opcional, y el mismo formulario;
  - **lo recibido hoy:** neto, la diferencia («−1,2 kg, −0,8 % · dentro de tolerancia», o
    marcada con su nota), el Brix y su veredicto, y el pedido.
- **`/beneficio/pedidos`:** crear un pedido; cada uno con lo recibido contra lo pedido; cerrar.
- **El otro lado ve el resultado.** En la jornada de la finca y en «Mis entregas», cada entrega
  dice «recibida: 17,9 kg en el beneficio (−0,6 kg)» o «rechazada: motivo». Leer eso no da
  ningún permiso sobre el beneficio.
- **Abrir jornada** pide el beneficio de destino (de los beneficios que quien abre puede ver).
- Botones de envío contra el doble toque, como en el resto.

## 5. Permisos

| acto | exige |
|---|---|
| recibir, rechazar, anular una recepción | `lot:manage` sobre **ese** beneficio, y la regla de dos personas en los tres actos |
| crear y cerrar pedidos | `lot:manage` sobre ese beneficio |
| dar de alta un proveedor de fuera | `cherry_supplier:create` (nuevo) |
| ver pendientes y recepciones | `lot:view` sobre ese beneficio |
| poner o cambiar el destino de una jornada | `lot:manage` sobre la finca de la jornada, y ninguna entrega recibida |

## 6. Fuera de esta pieza

- Evaluar la calidad pedida contra la selección, la flotación, la categorización, el repesado
  y la creación de lotes (pieza 3).
- Recibir sin conexión.
- Leer la báscula desde un nodo: el peso se escribe a mano.
- Precios y pagos a proveedores.

## 7. Pruebas que tienen que existir

- **Base:**
  - una recepción con dos orígenes, o sin ninguno, se rechaza; con uno, entra;
  - un neto que no cuadra con bruto − recipientes × tara se rechaza;
  - dos recepciones vigentes de la misma entrega se rechazan; anulada la primera, la segunda
    entra (control positivo);
  - la regla de dos personas se rechaza **en la base** con SQL directo, al insertar y al cambiar
    `recibidaPor`, y otra persona entra;
  - cambiar el neto o el origen de una recepción guardada se rechaza en la base;
  - anular una entrega con recepción vigente se rechaza en la base.
- **Servicio:**
  - una entrega de una jornada con destino a OTRO beneficio no se puede recibir aquí, aunque se
    mande su id a mano;
  - el mismo envío repetido con la misma `claveDeEnvio` guarda una sola recepción;
  - dos recepciones simultáneas contra un pedido: la que cruza el margen exige nota;
  - cerrar un pedido con 300 de 500 kg y margen 2 % exige nota;
  - el destino de una jornada no se cambia si ya hay una entrega recibida;
  - quien anotó la entrega no puede recibirla; el recolector con cuenta tampoco; otra persona
    del beneficio sí;
  - el Farm Manager de OTRA finca, sin `lot:manage` sobre el beneficio, no recibe;
  - sólo salen como pendientes las entregas de jornadas con destino a este beneficio;
  - dentro de tolerancia no exige nota; fuera, sin nota se rechaza y con nota entra, y no
    bloquea en ningún caso;
  - `GROSS_IMBALANCE` también se guarda (con nota);
  - la cereza de fuera sin peso declarado se guarda sin comparación, y con peso declarado se
    compara igual;
  - el pedido: 500 pedidos, recepciones de 300 y 220 → «+20 kg (+4 %)»; con margen 2 %, la
    segunda exige nota;
  - un pedido de otra fuente u otro beneficio no se puede elegir;
  - rechazar sin motivo se rechaza; rechazada, su estado lo dice;
  - anular devuelve la entrega a pendiente.
- **Brix:** 18 y 24 son `INTAKE_OPTIMAL`; 15,9 es `INTAKE_UNDERRIPE`; 17 y 25 son sin
  veredicto; −1 y 32,1 son `SENSOR_FAULT` y se guardan; con Brix y sin punto de muestreo, se
  rechaza.
- **El otro lado:** la jornada y «Mis entregas» muestran el neto y la diferencia de lo
  recibido.

## 8. Revisión independiente (Codex, 2026-09-19)

Codex revisó el primer borrador y devolvió 15 hallazgos. Todos quedan resueltos arriba; dos
los decidió Daniel (la condición de pesaje, y que de una recepción salgan varios lotes), y el resto
son reglas técnicas: bloquear la entrega y el pedido al recibir, idempotencia por clave de
envío, disparador también al actualizar, destino fijo tras la primera recepción, lo que falta
se juzga al cerrar, rango físico de Brix 0–32 y su punto de muestreo, la comparación de
básculas separada del balance de etapa, su fórmula, y la regla de dos personas en los tres
actos. Dos afirmaciones suyas se comprobaron contra el repositorio antes de aceptarlas: el
rango 0–32 (`11_brix_kinetics.md` §1) y que `anularEntrega` sólo miraba el estado.
