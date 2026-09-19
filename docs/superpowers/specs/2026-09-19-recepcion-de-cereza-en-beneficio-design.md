# Recepción de cereza en el beneficio: doble peso, cereza de fuera y pedidos

**Estado:** diseño aprobado por partes por Daniel el 2026-09-19; este documento, pendiente de su
revisión.

Pieza 2 de 3 del flujo finca → beneficio. La pieza 1 (`2026-09-18-jornada-y-entrega-de-cosecha-design.md`,
PR #431) deja cada entrega `enviada`, sin lote. Esta la recibe. La pieza 3 arma los lotes
eligiendo recepciones, y hace flotación, selección, categorización y repesado.

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
  contra `kgPedidos`: «+20 kg sobre lo pedido (+4 %)». Pasado el margen, la recepción que lo
  cruza lleva nota obligatoria. **No bloquea.**

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
  - **la comparación**, calculada con `POLITICA_POR_DEFECTO` al recibir y **guardada** con la
    política que se usó: diferencia en kg y %, y el estado (`BALANCED`, `DISCREPANCY_FLAGGED` o
    `GROSS_IMBALANCE`). Sin segundo peso: sin comparación, y se dice así.
  - `nota`: **obligatoria** si el estado no es `BALANCED` o si se cruza el margen del pedido.
    Nunca bloquea.
  - `brixDeRecepcion` (opcional, 0–40 °Bx) y su veredicto: `INTAKE_OPTIMAL`, `INTAKE_UNDERRIPE`
    o **sin veredicto** para el tramo que el documento normativo no cubre. **No se inventa un
    umbral.**
  - fotos: `Asset` atados a la recepción.
  - estado: `recibida`, `rechazada` o `anulada`.
- **Rechazar:** con motivo (obligatorio) y foto. Se guarda el peso igual. Una recepción
  rechazada **no puede entrar a ningún lote** (lo impondrá la pieza 3 contra el estado, y una
  prueba de esta pieza fija el estado).
- **Anular** una recepción: con motivo, sólo con `lot:manage` sobre el beneficio, y **sólo
  mientras no esté en ningún lote**. La entrega vuelve a pendiente y se puede recibir otra vez:
  por eso el `entregaId` es único **entre las no anuladas** (índice parcial), no en toda la tabla.
- **La regla de dos personas** (servicio **y** base):
  - quien recibe no es quien anotó la entrega (`recibidaPor ≠ entrega.anotadaPor`), ni la
    cuenta de su recolector;
  - en la base, un disparador lo comprueba contra la entrega al insertar. Un CHECK no puede
    mirar otra tabla.
  - La cereza de fuera no tiene anotador en el sistema: la regla no aplica, y se dice así.
- **Cada escritura**, con su `AuditEvent` en la misma transacción.

### 3.5 La regla de Brix, como módulo puro

- `lib/beneficio/brixDeRecepcion.ts`: `evaluarBrixDeRecepcion(bx)` → `INTAKE_OPTIMAL` |
  `INTAKE_UNDERRIPE` | `SIN_VEREDICTO`, con los umbrales citados de `11_brix_kinetics.md`.
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
| recibir, rechazar, anular una recepción | `lot:manage` sobre **ese** beneficio, y la regla de dos personas |
| crear y cerrar pedidos | `lot:manage` sobre ese beneficio |
| dar de alta un proveedor de fuera | `cherry_supplier:create` (nuevo) |
| ver pendientes y recepciones | `lot:view` sobre ese beneficio |
| poner el destino a una jornada | `lot:manage` sobre la finca de la jornada |

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
  - la regla de dos personas se rechaza **en la base** con SQL directo, y otra persona entra.
- **Servicio:**
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
  veredicto; fuera de 0–40, error de esquema.
- **El otro lado:** la jornada y «Mis entregas» muestran el neto y la diferencia de lo
  recibido.
