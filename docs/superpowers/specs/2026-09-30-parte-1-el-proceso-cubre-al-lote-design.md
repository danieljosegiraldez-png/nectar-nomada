# Parte 1 — El proceso cubre al lote y a su descendencia

**Fecha:** 2026-09-30 · **Estado:** **aprobado por Daniel el 2026-09-30**: las reglas una por una,
y el documento entero al revisarlo. Lo siguiente es el plan de trabajo. **Va primero** de las seis partes de
`2026-09-30-recetas-del-beneficio-design.md`: sin ella, una receta cargada no hace su trabajo.

**Revisado antes de llegarle, en dos rondas.**
- **Primera ronda:** tres revisores con lentes distintas —fidelidad al código, coherencia con los
  documentos normativos y casos límite— y Codex como segundo modelo encontraron 32 problemas. Los seis
  graves que pasaron por un verificador adversarial se sostuvieron todos.
- **Segunda ronda:** sobre la versión corregida, un revisor comprobó uno por uno los 32 y Codex
  repasó los suyos. Quedaban 9 sin cerrar del todo y aparecieron 11 nuevos, casi todos menores.

Esta versión los corrige. Tres de ellos eran decisiones que nadie había tomado, y Daniel las tomó el
mismo día. Cada regla dice si nació como **decisión de Daniel** o como **propuesta**. **Daniel aprobó
todas las propuestas el 2026-09-30** al revisar este documento, así que hoy todas son reglas
aprobadas; la etiqueta queda para saber de dónde salió cada una.

**El criterio** (Daniel, literal): «poder medir para poder reusar recetas y reproducir, replicar,
ser consistente con los resultados». La Parte 1 no compara nada todavía; hace que **todo lo que le
pase a un café quede unido al proceso y a la receta que lo gobiernan**, que es lo que la comparación
(Parte 5) necesita para no mentir.

**Principio de transición:**
- **Lo que hoy pasa sigue pasando.** Las compuertas que leen o almacenan —bodega y muestra verde—
  tratan un lote sin proceso como hoy.
- **Lo nuevo exige proceso.** Empezar una corrida ya no se puede sin proceso (R3).

Lo viejo lo rehace la parte «Re-importar» (R9). Ninguna regla nueva le inventa un proceso a un dato
viejo.

## 1. El problema, medido

Sobre `origin/main` = `629317e6`, con dos lecturas independientes, cinco verificadores que trataron
de refutarlas y Codex como segunda opinión:

```
lote aceptado  ← aquí se abre el proceso (decisión del 2026-09-19)
   └─ fermentación ─▶ LOTE NUEVO        endFermentationRun crea un hijo (fermentation.ts:191)
        └─ secado ─▶ LOTE NUEVO         cerrarCorridaEnTransaccion crea otro (drying.ts:301)
             └─ bodega ─▶ trilla ─▶ VERDE   aquí se toman las muestras y se cata
```

1. **Ninguna corrida queda unida a su proceso.** Las únicas que crean corridas son
   `startFermentationRun` y `startDryingRun`, y ninguna escribe `lotProcessId`. Sólo lo escribe
   `colgarCorrida`, y nada fuera de las pruebas la llama. La cola de secado y el tablero leen la
   receta **a través** de la corrida, así que hoy ninguno de los dos ve ni el grado ni la receta.
2. **El trabajo ocurre en lotes que no tienen proceso.** Todo lo que busca el proceso lo busca **en
   el propio lote**: `exigeSecadoTerminado`, `devolverASecado`, `listarProcesosDeLote` y la lista de
   catas (`lib/sensory/sessions.ts:144`). Sobre el pergamino, la compuerta de bodega **no se aplica**,
   aunque la regla de Daniel del 2026-09-07 es «no debe salir de secado antes bajo ninguna
   circunstancia».
3. **Se pueden abrir dos procesos para el mismo café.** `abrirProceso` sólo mira el propio lote, y
   `devolverASecado` reabre sin mirar nada. En la base, sólo `UNIQUE(lot_id, sequence_order)` lo
   frena, y de rebote.
4. **Cerrar no mira las corridas, y dividir tampoco.**
5. **Hay dos verdades sobre la receta.** La fermentación guarda su propia versión, elegida en un
   desplegable, y el tablero lee la del proceso.
6. **Una v2 de receta no conserva las fases.** `createRecipeVersion` no acepta `fases`.

## 2. Las reglas

### R1. Un proceso cubre a su lote y a toda su descendencia — decisión de Daniel

Para saber su proceso, un lote **lo busca hacia arriba**. Daniel eligió esto frente a escribir el
proceso en cada lote al nacer, así que no se guarda ningún dato nuevo en el lote y la respuesta no
puede contradecir al linaje. Lo resuelve **una sola función**, `procesoQueCubre(tx, lotId)`, que
devuelve:

- **`vigente`:** el proceso más reciente del lote más cercano, él incluido, que tenga alguno. Es lo
  que usan las compuertas, las corridas y la ficha. Su estado es `abierto`, `cerrado`,
  `sin_proceso` o `mezcla`.
- **`cadena`:** todos los procesos del camino hacia arriba, del más cercano al más lejano, cada uno
  con su lote y con **por qué** existe: original, parte de una división, o continuación de una
  devolución a secado (R7). Es la **historia** del café. Si P1 (lavado) se cerró y luego se abrió P2
  sobre el pergamino, el verde tiene P2 como vigente y la cadena P2 → P1. La ficha la enseña, y la
  Parte 5 la usará para decidir a qué receta se atribuye una taza.

Casos límite:
- **Fusión:** si el lote tiene varios padres, cada rama sube por su cuenta. Si las ramas no llegan
  todas al mismo proceso, el lote es una **mezcla**, aunque una rama llegue antes que otra. Se
  devuelve **con su composición**: qué procesos y por qué ramas. Nunca se elige uno; «nunca se toma
  el valor del primer padre», y un lote mezclado «no puede declararse con el nombre de un proceso»
  (`20_modelo_ciclo_completo.md` §1.3). La ficha enseña la composición y ningún nombre de proceso.
- **Tope:** 64 generaciones en las dos direcciones. Si una rama sigue sin resolver al llegar al
  tope, lanza `lineage_too_deep`. Un lote sólo es `sin_proceso` cuando **todas** sus ramas
  terminaron en una raíz.
- **La consulta recursiva usa `UNION`, o un arreglo de visitados, y no `UNION ALL`.** La de hoy
  (`lots.ts:517-529`) sólo quita duplicados al final, y con divisiones y fusiones en diamante los
  caminos se duplican en cada diamante. Con un tope de 64 eso deja de ser tolerable.
- **Hacia abajo, lo mismo.** `idsDeDescendencia` se corta hoy en 12 generaciones sin avisar
  (`lots.ts:515`), y R2 y `cerrarProceso` la usan. Se mueve al módulo nuevo (§3.2), pasa al mismo
  tope, lanza al pasarlo y recibe `tx`. `lots.ts` la reexporta para sus llamadores de hoy.
- **Las pantallas atrapan `lineage_too_deep`** y lo dicen. La ficha (`app/lots/[id]/page.tsx`) no
  atrapa hoy ningún `LotProcessError`: sería un 500, y en la página del proceso un 404.

### R2. Un solo proceso abierto por café — decisión de Daniel

Una sola comprobación, `exigeSinOtroProcesoAbierto(tx, lotId)`, que usan **las dos puertas que dejan
un proceso abierto**: abrir uno y devolver a secado (R7). Rechaza cuando:

| Caso | Código | De quién |
|---|---|---|
| Hay un proceso abierto en el lote, en algún ancestro o en algún descendiente | `process_already_open` | Daniel |
| El lote fue dividido bajo un proceso (R6) | `lote_dividido` | normativo, `20` §1.1 |
| El lote está en bodega (asignación de almacenamiento activa) | `lote_en_bodega` | Daniel, 2026-09-30 |
| Algún descendiente del lote está en bodega | `descendiente_en_bodega` | Daniel, 2026-10-02 |
| El lote es una mezcla (R1) | `lote_mezclado` | propuesta, aprobada |
| El lote es de miel: `LotProcess` es del café | `proceso_no_aplica_a_miel` | propuesta, aprobada |

- **Abrir un proceso nuevo sobre un lote cubierto por uno CERRADO está permitido.** Es el reproceso,
  y un lote puede pasar por varios procesos (decisión de Daniel).
- **Ni sobre un lote con algún descendiente en bodega** (decisión de Daniel, 2026-10-02, añadida en la
  revisión final): «ya en almacén/reposo no se puede abrir un lote, pero sí puede una parte ir a almacén
  al ser dividido y otra regresar a fermentación o seguir en secado, y viceversa, y luego entrar a
  almacén». Un proceso abierto arriba cubriría también a lo guardado. Para procesar lo que queda, primero
  se divide (R6) y lo guardado conserva su proceso. Vale para las dos puertas: devolver a secado la cereza
  con su pergamino en bodega también se rechaza. El propio lote en bodega sigue siendo `lote_en_bodega`.
- **En la base:** un índice único parcial `lot_process(lot_id) WHERE ended_at IS NULL` cierra el caso
  de un mismo lote. La migración cuenta antes y aborta si no se cumple, con el patrón de
  `20260908070000_grado_y_cereza_obligatorios`.

**Concurrencia: se bloquea el linaje, no se usa `Serializable`.** Toda transacción que lea o cambie
la cobertura empieza por `bloquearLinaje(tx, lotId)`: un `SELECT … FOR UPDATE` de las filas de `lot`
del lote y de **todos sus ancestros**, en orden de id. Lo hacen abrir, devolver a secado, empezar una
corrida, cerrar, dividir, seleccionar, fusionar y almacenar.
- **Dos operaciones sobre el mismo café siempre comparten al menos una fila:** el ancestro común, o
  el propio lote. Por eso se ejecutan en fila. Así quedan cubiertas también las carreras que
  `Serializable` no veía: almacenar mientras alguien abre un proceso nuevo, o dividir mientras alguien
  empieza una corrida.
- **El orden por id evita los interbloqueos.**
- **Cada transacción que bloquea el linaje lleva su tope explícito** (`TRANSACCION_DEL_LINAJE`,
  revisión final, 2026-10-03): el de Prisma por defecto, 5 s, cuenta también la espera por los
  `FOR UPDATE`, y una división en un linaje hondo o una espera en fila lo pasaban.
- **Los ancestros de un lote no cambian nunca después de crearlo**, porque las transformaciones sólo
  añaden hijos. Así que el conjunto de filas a bloquear se puede calcular antes de bloquear.
- **Es la práctica de la casa.** `lib/apiary/cierreDeCosecha.ts:50-56` documenta que `Serializable`
  abortó transacciones ajenas que sólo compartían tabla, y que se prefirió `FOR UPDATE`. Lo repite
  `lib/equipos/modelos.ts:199`.

### R3. Empezar una fermentación o un secado: se une solo, y sin proceso se bloquea — decisión de Daniel

- Dentro de la **misma transacción** que crea la corrida: se bloquea el linaje, se resuelve R1, se
  comprueba que el vigente esté abierto, y se escribe `lotProcessId`.
- **Se rechaza** con `sin_proceso_abierto` si no hay un proceso abierto que lo cubra, con
  `lote_en_bodega` si el lote está en bodega, y con `lote_dividido` o `lote_mezclado` en esos casos.
  Daniel eligió bloquear frente a dejar la corrida suelta.
- **Y con `corrida_ya_abierta` o `lote_consumido`** (revisión final, 2026-10-03), que hacen cumplir la
  garantía de R6 en la que se apoya R7: si el lote ya es la entrada de una fermentación o un secado sin
  terminar, o si una transformación de consumo total con salida ya lo consumió entero —la cereza cuya
  fermentación terminó—. La siguiente corrida empieza en el lote que salió.
- **El permiso se pide sólo sobre el lote de la corrida**, como hoy. Nunca se exige gestionar el lote
  donde vive el proceso: copiar el patrón de `colgarCorrida`, que autoriza contra el lote del
  proceso, dejaría fuera a un operario que gestiona el hijo y no el padre.
- **Sin evento de auditoría nuevo.** `…run.start` ya guarda la corrida entera en `after`, y ahora
  lleva dentro su `lotProcessId`. Así no se rompen las pruebas que afirman la secuencia exacta de
  operaciones (`fermentation.test.ts:171`, `drying.test.ts:172`).
- **`colgarCorrida` se elimina.** Era la única otra puerta que escribe `lotProcessId`, y lo hacía sin
  mirar si la corrida era de ese linaje, si el proceso estaba abierto, ni qué receta llevaba. Con R3
  queda huérfana, y sólo la llamaba una prueba.

### R4. La fermentación usa la receta del proceso — decisión de Daniel

El servicio escribe en la corrida la versión del proceso vigente y **rechaza** una distinta, con
`receta_distinta_del_proceso`. El formulario deja de ofrecer el desplegable y muestra la receta del
proceso, sólo para leer. Si el proceso es «Sin receta», la corrida también: **la receta se elige al
abrir el proceso**.

### R5. No se cierra un proceso con corridas abiertas — propuesta, aprobada por Daniel

`cerrarProceso` rechaza con `corridas_abiertas` mientras quede alguna fermentación o secado abierto
**en el linaje que el proceso cubre**: tanto las unidas por `lotProcessId` como las que empezaron
sobre un lote cubierto sin estar unidas. Lo segundo cubre las corridas viejas, que R9 no rellena.
`cerrarProceso` escribe `closureKind: moisture` (§3.1).

**Y no se cierra con una humedad anterior a su inicio** (`medicion_anterior_al_proceso`, revisión final,
2026-10-03): la humedad de cierre dice cómo terminó el proceso. Sin esto, la continuación de una
devolución a secado (R7) se cerraba con la misma lectura que cerró el proceso anterior —la que la
devolución declaraba errónea— y el lote volvía a bodega sin secar. El desplegable de cierre sólo ofrece
las humedades desde el inicio del proceso abierto que cubre al lote, y nunca una ya corregida.

### R6. Dividir un lote con proceso abierto: un proceso por parte — decisiones de Daniel

Daniel lo planteó así: «ambos llevan conexión con su hilo anterior para tener trazabilidad, pero se
vuelven dos o más procesos». Cuando se divide (`split`) un lote **cubierto por un proceso abierto**:

1. **Se divide el lote entero**, con su merma (decisión de Daniel). Para sacar 10 kg de PE-79 se
   divide en PE-79-A (el resto) y PE-79-B (los 10 kg). Después de descontar lo declarado, el saldo
   del lote tiene que quedar dentro de la **tolerancia de masa de la organización**
   (`massBalanceTolerancePct`, 2 % si no la fija; `resolveTolerancePct`, `balance.ts`), la misma con
   la que el libro de balance reconcilia una división. Lo que cae dentro de la tolerancia no es
   remanente. *(Corregido al escribir el plan: la primera versión decía `BalancePolicy`, que es otra
   cosa —la tolerancia de los evaluadores de recepción, `balanceDeMasas.ts`— y el libro nunca la
   usa.)* **Si el lote no tiene libro de masa** (`recorded: false`), el remanente no se puede saber:
   la división se acepta y el cierre lo dice en su auditoría (`sinLibroDeMasa: true`). Además, **ningún otro
   lote cubierto por el proceso puede conservar saldo**. Si lo conserva, se rechaza con
   `division_deja_remanente`: cerrar el proceso dejaría a ese café bajo un proceso dividido sin haber
   sido dividido. Es lo que pide `20` §1.1.
2. **No se divide con una corrida en curso** (decisión de Daniel). Si hay una fermentación o un secado
   abierto en el linaje cubierto, se rechaza con `corridas_abiertas`.
   - **Los ensayos por capas o bandejas** —1 cm contra 2 cm de cereza, por ejemplo— **se dividen al
     empezar el secado**: cada capa es su propio lote con su propio secado, porque el grosor
     (`DryingRun.layerDepthCm`) es uno por corrida y la taza se mide por lote.
   - «Dividir un secado a mitad de camino» queda como trabajo futuro (§5).
3. **El proceso vigente se cierra como `divided`**, sin medición, en el instante de la división, y
   guarda **qué división lo cerró** (`dividedByTransformationId`). Antes de escribir se comprueba que
   esa fecha no sea anterior a su inicio (`ends_before_it_started`).
4. **Cada parte nace con su propio proceso**, copiado del vigente: receta y versión, intención, grado,
   estado de la cereza, humedad objetivo y procedencia.
   - Su **inicio es el instante de la división**. Una copia que naciera «ahora» chocaría con el `CHECK`
     de fechas al cerrarla con una humedad anterior, que es justo lo que hará el import con fechas
     históricas.
   - Cada copia apunta a su origen (`derivedFromLotProcessId`).
   - La auditoría registra el cierre (`lot_process.close`, con `closureKind: divided`) y una apertura
     por parte (`lot_process.open`, con el origen en `after`).
5. **La historia anterior a la división no se copia: se hereda por la cadena.** PE-79-A ve las
   fermentaciones e intervenciones de antes de dividir a través de la `cadena` de R1. Es lo que pide
   `20` §1.2, sin duplicar filas.
6. **El lote dividido queda cerrado** (`20` §1.1): no admite proceso, corridas, mediciones ni
   muestras **posteriores a la división**.
   - Lo decide **una sola función**, `loteDividido(tx, lotId, occurredAt?)`: el lote es la entrada de una
     división que cerró un proceso (`dividedByTransformationId`).
   - La usan R2, R3, `recordMeasurement`, `correctMeasurement`, `createSampleFromLot` y
     `registrarInspeccion`, y todos rechazan con `lote_dividido`.
   - **Lo anterior a la división se admite** (decisión de Daniel, 2026-10-02, añadida en la revisión
     final): las cuatro puertas que reciben la fecha del registro —medir, corregir una medición, sacar una
     muestra e inspeccionar— se la pasan, y un registro cuyo instante es **estrictamente anterior** al de
     la división entra en el lote dividido. El **mismo instante** se rechaza (decisión del controlador): una
     lectura con la hora exacta de la división se cuelga de una parte. Es lo que pide `20` §1.1, «todo
     registro POSTERIOR pertenece a un hijo». La lista de lotes del formulario de inspección ofrece el lote
     dividido, porque deja elegir la hora; decide el servicio.
   - Vale **sólo** para divisiones hechas bajo un proceso. La miel divide en parcial a propósito
     (`dividirMiel` deja el remanente en el origen), y fuera de un proceso las divisiones siguen como
     hoy.
7. **No se selecciona bajo un proceso abierto.** «Primero se selecciona, después el proceso»
   (decisión del 2026-09-19). El rechazo, `seleccion_bajo_proceso_abierto`, vive **dentro de
   `recordTransformation`** para todo `selection`, y no sólo en `recordSelection`, porque la
   clasificación del verde por malla llama directo (`greenGrading.ts:93`). Esa clasificación ocurre
   con el proceso ya cerrado, así que no la afecta.
8. **Una fusión con proceso abierto se rechaza** (`fusion_bajo_proceso_abierto`) — propuesta, aprobada. Hoy
   ninguna pantalla fusiona, y cómo se procesa una mezcla queda para cuando Daniel lo decida.

**Lo que garantizan juntas R2 y R6, y en lo que se apoya R7:** bajo un proceso abierto hay **una sola
línea de café viva**. Dividir lo cierra, la selección y la fusión se rechazan, y una corrida consume
su lote entero: al terminarla, `stage_change` está entre los tipos de consumo total del libro de
balance (`balance.ts`, `FULL_CONSUMPTION_TYPES`). **Desde la revisión final (2026-10-03) eso se hace
cumplir al empezar**, y no sólo se supone: no empieza una corrida sobre un lote que ya tiene una abierta
(`corrida_ya_abierta`) ni sobre uno que ya consumió una transformación de consumo total con salida
(`lote_consumido`), R3. La comprobación de saldo de R6.1 queda como red por si algo de esto
cambia. Por eso la humedad que cierra el proceso describe el café que va a bodega, y no el de una
rama hermana.

### R7. La bodega y todo lo que lee el proceso — decisiones de Daniel

**La compuerta de bodega:**
- `exigeSecadoTerminado` recibe `tx` y corre **dentro** de la transacción de `moveLotToStorage`,
  después de bloquear el linaje. Hoy comprueba antes de la transacción (`storage.ts:35`).
- **Exige** que el proceso vigente esté cerrado por humedad (`closureKind: moisture`), con la medición
  de cierre en el objetivo o por debajo. Si esa medición se corrigió, vale la **última corrección** de su
  cadena (`correctsId`), y es la misma humedad de cierre que enseñan la ficha y la página del proceso
  (revisión final, 2026-10-03). Un proceso dividido sale como `lote_dividido`, y una mezcla
  como `lote_mezclado` (propuesta, aprobada).
- **Un lote sin proceso pasa, como hoy.** Así lo dice su propia cabecera, y así queda hasta el
  reimport (R9).
- **Sólo al entrar a bodega.** `moveLotToStorage` también se usa para **reubicar** un lote que ya está
  en bodega: cierra la asignación vieja y abre otra (`storage.ts:42-51`). Reubicar no pasa por la
  compuerta, porque el café ya entró. Sin esto, un lote guardado antes de la Parte 1, cuyo ancestro
  tiene un proceso abierto, dejaría de poder moverse dentro de la bodega.

**En bodega, el café no se reprocesa** (Daniel, 2026-09-30): no se abre proceso ni se empieza nada
(R2 y R3, `lote_en_bodega`). **Los días de reposo siguen avisando y no bloquean**, como decidió el
2026-09-16 («depende el arreglo») y confirmó el 2026-09-30.

**De bodega a secado, sólo por un defecto de humedad.** `devolverASecado` **ya no reabre el proceso
cerrado: abre una continuación unida a él.** Nació como propuesta y Daniel la aprobó el 2026-09-30. Su razón es que reabrir tenía tres
defectos:
- borraba la medición de cierre, un hecho que sí ocurrió;
- volvía a abrir el proceso para **todos** los lotes que cubre, también los hermanos ya guardados;
- y se saltaba R2.

En una sola transacción, y con el linaje bloqueado:
1. pide el motivo de la lista nueva `motivo_devolucion_a_secado` —humedad alta por error de manejo,
   error de medición, u otro con texto obligatorio—;
2. resuelve el vigente y exige que esté cerrado por humedad: uno `divided` sale con `lote_dividido`;
3. **termina la asignación de bodega activa**, si la hay;
4. aplica R2 sobre el lote devuelto, que ya no está en bodega;
5. abre sobre el lote devuelto un proceso nuevo, copia del vigente, con `derivedFromLotProcessId` al
   cerrado y la fila `lot_process_return` que guarda motivo, nota, quién y cuándo. Esa fila es la que
   permite contar cuántas veces pasa y por qué, que es por lo que Daniel eligió la lista.

Si cualquier paso falla, se deshace todo. El proceso cerrado conserva su humedad de cierre como lo
que fue, y los hermanos siguen bajo él, cerrado.

**La pantalla lo ofrece en bodega.** Hoy el botón sólo sale cuando el cierre quedó por encima del
objetivo (`app/lots/[id]/process/page.tsx:64-70,163`). Como la compuerta impide guardar algo así,
**un lote en bodega nunca lo veía**, y es justo el caso que pide Daniel. Pasa a ofrecerse sobre todo
lote en bodega o bloqueado en su entrada, con la lista de motivos.

**De secado sí se sale a un tratamiento y se vuelve:** fermentativo, coinfusión, o reingreso a su
mosto. Ocurre dentro del mismo proceso abierto y no necesita ninguna acción nueva: cada corrida
nueva queda cubierta por R1 y se une por R3.

**Lectores que pasan a R1**, porque hoy miran sólo el lote propio o la corrida:

| Lector | Qué cambia |
|---|---|
| la ficha y la página del proceso | pasan a una función nueva, `coberturaDelLote`, que devuelve `vigente`, `cadena` y `composicion`. Desde la revisión final (2026-10-03) autoriza `view` sobre **cada lote dueño** de un proceso que devuelve, por separado: un proceso de un lote que quien mira no ve sale `oculto` (sólo que lo cubre y si está abierto; decisión conservadora del controlador, pregunta abierta a Daniel). Las compuertas no cambian. `listarProcesosDeLote` **no cambia de forma**: sigue listando los procesos propios del lote, porque las pruebas la desestructuran 19 veces, y queda como excepción escrita del guardia |
| `entradaDelLote` (grado de la ficha y del tablero) | **ficha y tablero le pasan lo mismo**: el resultado de R1 sobre el lote. Hoy cada llamador arma su entrada por su cuenta, que es justo por lo que pueden discrepar |
| `datosDelTablero` | proceso, grado, fases y metas salen de R1 sobre el lote de la corrida |
| `colaDeSecado` | igual. `estadoDeUnidad` recibe además si hay receta, y separa «sin receta declarada» (la etiqueta de hoy, `messages/es.json:3101`) de una nueva, «receta sin ritmo de secado», con su clave en es/en y su color (`app/beneficio/secado/page.tsx:34`). Desde que las corridas llevan proceso, la etiqueta única mentiría |
| la lista de catas (`lib/sensory/sessions.ts:144,175`) | el grado de la muestra sale de R1 sobre su lote de origen |
| la muestra verde (`samples.ts:117,161`) | **Con proceso, además de lo de hoy:** exige el vigente cerrado por humedad, y rechaza uno `divided` o una continuación abierta. Es aditivo: no quita ninguna de las comprobaciones que ya existen. **Sin proceso, como hoy:** se sigue exigiendo un secado terminado en la ascendencia, pero `tieneSecadoTerminadoArriba` deja de cortar en silencio a las 6 generaciones (responde «no» al llegar al tope) y pasa al tope de 64, que lanza. La condición de bodega sigue garantizada por la precondición de la trilla, como explica hoy `samples.ts:146-160` |
| el reporte por proceso (`reporteDeProceso.ts`) | una fila `divided` no cuenta como proceso en los grupos y se rotula «dividido → PE-79-A, PE-79-B». El resto del reporte queda para la Parte 5 |
| la ocupación de tanques (`lib/equipos/equipos.ts:883,906`) | el lote que ocupa el tanque sale de la transformación de apertura de la corrida, no del lote del proceso. Con R3, el del proceso sería la cereza y no el café que está fermentando |

**Guardia de arquitectura nuevo:** fuera del módulo del resolvedor, nadie lee procesos de un lote ni
con `lotProcess.find…({ where: { lotId` ni con `lotProcesses:` en un `include`, `select` o `where`.
Las excepciones van en una lista corta, cada una con su razón escrita; por ejemplo, el cálculo de
`sequenceOrder` al abrir.

### R8. Una versión nueva de receta copia las fases de la anterior

`createRecipeVersion` carga las `fases` de la versión anterior —hoy sólo trae
`versions: { take: 1 }` sin incluirlas— y las copia cuando no recibe `fases`. Hoy es siempre, porque
la pantalla todavía no las edita (eso es la Parte 2). El guardia
`tests/arquitectura/campos-con-dos-puertas.test.ts` gana un **localizador nuevo** para el bloque
`fases:` en las dos funciones. Añadir `fases` a su lista no basta, porque el bloque que mira se
recorta antes. Ese guardia nació cuando el mismo fallo, con las horas, lo cazó Codex el 2026-09-13.

### R9. Lo ya registrado no se rellena — decisión de Daniel

No se deduce a qué proceso pertenecía una corrida vieja. La parte «Re-importar» rehace el histórico
por los servicios de la aplicación. Hasta entonces vale el principio de transición. Un lote a medio
camino pide abrir proceso en su siguiente paso (R3).

## 3. Cambios

### 3.1 Esquema

| Cambio | Por qué |
|---|---|
| `LotProcess.closureKind`, enum nuevo `LotProcessClosure { moisture, divided }` | R6, R7 |
| `CHECK`: `(ended_at IS NULL) = (closure_kind IS NULL)`; `moisture` lleva medición de cierre; `divided` no la lleva y lleva `divided_by_transformation_id` | Sin el primero, un cierre que olvidara el tipo pasaría por la base y la compuerta lo leería como no cerrado por humedad |
| La migración rellena `moisture` en los procesos ya cerrados, y **aborta** si alguno cerrado no tiene medición | Todo cierre de hoy pasa por `cerrarProceso`, que la exige; el recuento lo comprueba en vez de suponerlo |
| `LotProcess.dividedByTransformationId`, FK a `LotTransformation`, anulable | R6.3, y la base de `loteDividido` |
| `LotProcess.derivedFromLotProcessId`, FK a sí misma, anulable | R6.4 y R7: de dónde viene una parte o una continuación |
| Tabla `lot_process_return`: el proceso cerrado, la continuación, el motivo (valor de catálogo), la nota, quién y cuándo | R7 |
| Índice único parcial `lot_process(lot_id) WHERE ended_at IS NULL`, con recuento que aborta | R2 |
| Catálogo `motivo_devolucion_a_secado` en `lib/research/catalogs.ts` | R7. Entra por la semilla, que hace *upsert* de los catálogos |

Las corridas no cambian: `lotProcessId` ya existe y ya es anulable.

### 3.2 Servicios

- **Un módulo nuevo**, `lib/traceability/procesoDelLinaje.ts`, que **no importa `lots.ts`**. Hoy
  `lotProcess.ts` importa de `lots.ts`, así que poner el resolvedor allí crearía un ciclo cuando
  `recordTransformation` lo llame. Contiene:
  - `procesoQueCubre` (R1), con su recorrido por ramas;
  - `idsDeDescendencia`, que se mueve aquí desde `lots.ts`. Sus dos únicos llamadores están en
    `lotProcess.ts` y pasan a importarla del módulo nuevo;
  - `LotProcessError` se mueve a su propio archivo, `lib/traceability/errorDeProceso.ts`, como ya
    hizo `bandejaError.ts`. `lotProcess.ts` la reexporta para que ningún importador cambie. Es lo
    que deja a `lots.ts` lanzarla sin ciclo;
  - `bloquearLinaje`, `exigeSinOtroProcesoAbierto` y `loteDividido` (R2, R6);
  - los **núcleos con `tx`** de abrir, cerrar y copiar un proceso. Hoy `abrirProceso` y
    `cerrarProceso` leen con el cliente global, fuera de la transacción, y no sirven dentro de la de
    una división; pasan a ser envoltorios de esos núcleos.
- `startFermentationRun` y `startDryingRun`: R3 y R4.
- `abrirProceso`, `cerrarProceso` (escribe `moisture`) y `devolverASecado`: R2, R5 y R7.
- `recordTransformation`: R6 para `split`, `selection`, `merge` y `blend`, dentro de su transacción.
- `recordMeasurement`, `correctMeasurement`, `createSampleFromLot` y `registrarInspeccion`: `loteDividido` (R6.6),
  con la fecha del registro, y la muestra verde (R7).
- `moveLotToStorage` y `exigeSecadoTerminado`: R7, dentro de la transacción y sólo al entrar.
- Los lectores de la tabla de R7, y `createRecipeVersion` (R8).
- `colgarCorrida` se elimina (R3).

### 3.3 Pantallas

- **Ficha del lote:**
  - «Empezar fermentación» y «Empezar secado» sólo salen con un proceso abierto que cubra al lote; si
    no lo hay, sale «Abrir proceso» con una frase que dice por qué. Desde la revisión final lo decide
    `puedeEmpezarCorrida`, que repite sin bloquear los pasos del servicio (también la corrida ya abierta,
    el lote consumido y el lote dividido), y lo usan también las dos páginas `/new`.
  - «Abrir proceso» no se ofrece si R2 lo rechazaría (lote dividido, mezcla, en bodega o miel); en su
    lugar va la frase de por qué.
  - «Selección» no se ofrece bajo un proceso abierto.
  - La ficha enseña el proceso vigente y en qué lote vive («Proceso de PE-79: Lavado v1, abierto»),
    la cadena si hay más de uno, y la composición si es una mezcla.
  - Atrapa `lineage_too_deep` y lo dice.
- **Página del proceso:** no ofrece abrir otro en un lote dividido; hoy lo ofrecería, porque un
  proceso dividido no tiene medición (`page.tsx:68,171`).
- **«Devolver a secado»** se ofrece en todo lote en bodega o bloqueado al entrar, con la lista de
  motivos.
- **Formulario de fermentación:** sin desplegable de receta; muestra la del proceso.
- **Errores en español y en inglés, uno por código:** `sin_proceso_abierto`, `lote_dividido`,
  `lote_mezclado`, `lote_en_bodega`, `descendiente_en_bodega`, `corrida_ya_abierta`, `lote_consumido`,
  `medicion_anterior_al_proceso`,
  `proceso_no_aplica_a_miel`, `corridas_abiertas`,
  `division_deja_remanente`, `seleccion_bajo_proceso_abierto`, `fusion_bajo_proceso_abierto`,
  `receta_distinta_del_proceso`, `lineage_too_deep` y `motivo_otro_requiere_nota`, y también el ya
  existente `process_already_open`, que ahora dice «en este café». Desde la revisión final también los
  cuatro que existían antes y salían crudos: `drying_not_finished`, `moisture_above_target` y
  `no_closing_moisture` —la compuerta de bodega, que desde R7 salta en todo pergamino con proceso— y
  `process_already_closed`, el del doble envío. Cada texto dice qué hacer. Hoy `LotProcessError` se traduce con un
  mensaje genérico que enseña el código crudo (`traceability.ts:176`); se sigue el patrón de
  `BandejaError`. Las clases nuevas entran en `friendlyError` en el mismo cambio; sin eso, son un 500.

**Nombres nuevos para que Daniel los revise:** `closureKind` / `divided`,
`dividedByTransformationId`, `derivedFromLotProcessId`, `lot_process_return`,
`motivo_devolucion_a_secado`, el módulo `procesoDelLinaje` y los códigos de arriba. Y los que añadió la
revisión final (2026-10-03): `descendiente_en_bodega` (R2, decisión de Daniel del 2026-10-02),
`corrida_ya_abierta` y `lote_consumido` (R3/R7), el predicado `puedeEmpezarCorrida`, y
`medicion_anterior_al_proceso` (R5). Ninguno está en
`03_public_api.md`, porque ese contrato no cubre los procesos de la aplicación.

## 4. Pruebas — cada guardia con su flip-test

Cada una se comprueba **quitando la conducta que dice atrapar y viendo caer la prueba por su nombre**.
La mutación quita la conducta, no el texto con el que casa un detector.

| Guardia | Mutación que debe hacerla caer |
|---|---|
| **R1** | |
| El reproceso: el verde tiene P2 vigente y P1 en la cadena | devolver sólo el vigente |
| Una mezcla devuelve su composición y no elige un padre, aunque una rama llegue antes | quedarse con el más cercano |
| Un linaje que pasa del tope lanza; no responde «sin proceso» | devolver `sin_proceso` al tope |
| Un descendiente más allá de 12 generaciones con proceso abierto impide abrir arriba | volver al tope silencioso de 12 |
| Un diamante de divisiones y fusiones no multiplica caminos | volver a `UNION ALL` |
| La ficha dice `lineage_too_deep`, no da un 500 | quitar el `catch` |
| **R2** | |
| No se abre un proceso bajo otro abierto, ni encima de uno abierto abajo | volver al chequeo del propio lote |
| Rechaza dividido, en bodega, mezcla y miel, cada uno con su código | quitar cada rechazo |
| Abrir sobre un lote cubierto por un proceso CERRADO sí se puede | rechazar también ese caso |
| Dos aperturas a la vez en padre e hijo: sólo una sale bien | quitar `bloquearLinaje` |
| Almacenar a la vez que se abre un proceso que cubre al lote: no salen bien las dos | quitar `bloquearLinaje` en bodega |
| El índice único parcial rechaza un segundo abierto en el mismo lote por SQL | quitar el índice |
| **R3 y R4** | |
| Una corrida nueva lleva el `lotProcessId` del proceso que la cubre | quitar la escritura |
| Empezar sin proceso abierto, en bodega o en un lote dividido se rechaza | quitar cada rechazo |
| Dividir a la vez que se empieza una corrida: no salen bien las dos | quitar `bloquearLinaje` en la división |
| El permiso de empezar es sólo sobre el lote de la corrida | autorizar contra el lote del proceso |
| La fermentación no puede llevar otra versión; en un proceso «Sin receta» no lleva ninguna | dejar pasar la del formulario |
| **R5** | |
| No se cierra con corridas abiertas, incluidas las no unidas | contar sólo las unidas |
| Cerrar escribe `moisture`, y el `CHECK` rechaza un cerrado sin tipo | no escribir el tipo |
| **R6** | |
| Dividir con corrida en curso se rechaza | quitar la comprobación |
| Dividir que deja remanente en el lote, o saldo en otro lote cubierto, se rechaza; dentro de la tolerancia, no | quitar la suma; usar suma exacta |
| Dividir cierra como `divided`, con la transformación, y crea una parte por salida con su origen | cerrar como `moisture`; no copiar |
| La copia empieza en el instante de la división, y se cierra con una humedad de esa fecha | que empiece «ahora» |
| La parte ve la historia anterior a la división | cortar la cadena en la parte |
| El lote dividido no admite proceso, corrida, medición ni muestra | quitar cada rechazo |
| La miel sigue dividiendo en parcial | aplicar R6 fuera de un proceso |
| La selección bajo proceso abierto se rechaza, también por `recordTransformation` directo | dejar el rechazo sólo en `recordSelection` |
| Una fusión con proceso abierto se rechaza | quitar el rechazo |
| **R7** | |
| La compuerta se aplica al pergamino cuyo proceso vive en la cereza | el resolvedor vuelve a mirar sólo el propio lote |
| La compuerta corre dentro de la transacción de bodega | sacarla fuera |
| La compuerta rechaza dividido y mezcla, y deja pasar un lote sin proceso | quitar cada veredicto |
| Reubicar dentro de bodega no pasa por la compuerta | aplicarla también al reubicar |
| Devolver a secado desde bodega funciona: termina la bodega, abre la continuación y guarda el motivo | aplicar R2 antes de terminar la bodega |
| Devolver a secado no reabre el cerrado, y deja a los hermanos bajo el cerrado | reabrir el cerrado |
| Devolver a secado rechaza un `divided` y exige texto con «otro» | quitar cada uno |
| Ficha y tablero dan el mismo grado para el mismo lote | que uno vuelva a su consulta propia |
| La lista de catas da el grado del verde | volver a `sourceLot.lotProcesses[0]` |
| La muestra verde con proceso se bloquea con una continuación abierta | no mirar el vigente |
| La muestra verde sin proceso sigue pasando con un secado terminado arriba, más allá de 6 generaciones | volver al tope de 6 |
| La cola distingue «sin receta» de «receta sin ritmo de secado» | volver a la etiqueta única |
| El tanque muestra el lote que fermenta, no la cereza | volver a `lotProcess.lotId` |
| El reporte no cuenta la fila `divided` como proceso | contarla |
| El guardia de arquitectura cae con una lectura de `lotProcesses:` fuera del resolvedor | añadir una en `storage.ts` |
| **R8** | |
| Una v2 conserva las fases, y el localizador nuevo del guardia ve el bloque `fases:` | quitar la copia; quitar el bloque |
| **Migración** | |
| Aborta con dos procesos abiertos en un lote, y con un cerrado sin medición | **se comprueba una vez a mano**, con los comandos del plan: sobre una base nueva migrada hasta la migración anterior, se siembran las filas malas y se aplica ésta. No puede ser una prueba permanente, porque las restricciones que añade impiden fabricar después esas mismas filas |

**Lo que hay que ajustar porque hoy no sigue estas reglas:**

- **La semilla de demo** (`prisma/seed.ts:885`, `:903`, `:921`): abrir el proceso antes de las
  corridas, registrar una humedad de cierre en el objetivo o por debajo, cerrar, y sólo entonces
  almacenar. La cifra va redonda y rotulada DEMO (`CLAUDE.md` §54). CI siembra esta demo antes del
  carril con base, así que si falla, **el carril cae entero** sin correr una prueba.
- **`tests/traceability/e2e.test.ts`:** lo mismo en su paso a bodega (`:152`). La medición de `:161`
  va antes, o el objetivo sube.
- **30 llamadas en 10 archivos de prueba** que empiezan corridas sin proceso. Se cuentan por archivo
  antes de tocarlas y se vuelven a contar después. `lot_process.lot_id` es `ON DELETE RESTRICT`, así
  que las limpiezas que borran lotes borran antes los procesos, también `e2e-cleanup.ts`.
- **`tests/traceability/samples.test.ts`**, por el cambio en la muestra verde.
- **La prueba de `colgarCorrida`** (`lotProcess.test.ts:472-476`) sale con la función. Las de
  `devolverASecado` cambian, porque ya no reabre.
- **Los guardias de arquitectura que ya existen:**
  - la lista de acceso a datos (`docs/arquitectura/acceso-a-datos.allowlist.json`), donde entran el
    módulo nuevo y las funciones con `tx`;
  - `acciones-traducen-sus-errores` y `claves-de-traduccion-existen`;
  - `audit-atomico`.
- **El carril hermético:** toda prueba nueva que toque la base va en el grupo `base-sembrada` de
  `scripts/pruebas-por-compuerta.txt`, y se comprueba con `bash scripts/ci.sh` que no aparezca en el
  carril sin base.

## 5. Lo que esta parte NO hace

- **Medir la consistencia:** el reporte por versión, la taza del verde descendiente sin contarla dos
  veces, la dispersión entre lotes. Es la Parte 5. La Parte 1 sólo garantiza que esos datos estén
  unidos, y deja la `cadena` lista para atribuirlos.
- **Pasos y valores por defecto en la receta, y la pantalla de fases.** Es la Parte 2.
- **Rellenar corridas viejas.** Es la parte «Re-importar» (R9).
- **La pantalla de dividir y declarar ensayos** (`20` §1.4: variable bajo estudio y rama de control).
  Con ella van **dividir un secado a mitad de camino** y **sugerir el código de cada parte**
  (PE-79-A, PE-79-B…). Hoy dividir sólo es posible desde el servicio, que recibe los códigos ya
  escritos, y lo usarán el import y la demo.
- **Anular una corrida empezada por error.** No existe hoy, y con R5, R6 y R7 una corrida abierta
  impide cerrar, dividir y almacenar. La salida que hay es **terminarla**: el secado admite
  `interrupted` y `abandoned`. Queda registrada como lo que fue, y crea su lote de salida. Si eso no
  basta en la práctica, es una parte propia.
- **Cómo se procesa una mezcla.** R1 la marca y R6 impide crearla bajo proceso; lo demás lo decide
  Daniel cuando haya pantalla de fusión.
- **Que los motores juzguen con la receta y no con el grado** (ADR-181). Es la Parte 2 o la 5.
- **Que los días de reposo bloqueen.** Siguen avisando, por decisión de Daniel.
- **La regla del testigo y el orden muestra-antes-de-venta** (`20` §2). Liberar un lote hoy no mira
  ninguna muestra (`lots.ts:1305-1315`), y esta parte no lo cambia.

## 6. Lo que la Parte 1 no garantiza, dicho

- **Las reglas viven en el servicio**, salvo el índice único parcial y los `CHECK` del cierre. SQL
  directo se las salta. La parte «Re-importar» usa los servicios precisamente por eso.
- **`bloquearLinaje` pone en fila todo lo que toca un mismo café.** En un beneficio con decenas de
  lotes vivos es barato. Si algún día hay cientos de operaciones por minuto sobre el mismo linaje, se
  notará como espera, nunca como un dato equivocado.
- **El tope es un número: 64.** Un multiproceso real tiene unas diez generaciones —fiebre,
  anaeróbico, mucílago, secado, coinfusión, secado—, así que deja margen. Su error lo nombra para
  que el día que se alcance se vea.
