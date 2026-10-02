# Parte 2b — Lo que la receta vigila en el lote

**Fecha:** 2026-10-02 · **Estado:** diseño aprobado por Daniel en conversación, pregunta por
pregunta; **corregido tras la revisión adversaria de Codex** (11 hallazgos, §12) y con su definición
de semi-lavado del mismo día; pendiente de su lectura. **Base:** `origin/main` `85eab6da`. Depende de
la **2a** (`2026-10-02-parte-2a-la-receta-con-pasos-design.md`, misma rama): pasos, metas por paso y
registros unidos a su paso. Y de la **Parte 1** (rama `recetas-base`): cobertura R1 con su `cadena`,
compuerta de bodega (R7) y cierres `moisture` / `divided`.

Criterio de Daniel: **«poder medir para poder reusar recetas y reproducir, replicar, ser consistente
con los resultados»**, con un sistema **funcional, inteligente y trazable**.

---

## 1. Lo que hay hoy, medido en `85eab6da`

- **El reposo es una edad, no una fase**, y **no bloquea nada** (`lib/beneficio/reposo.ts`, cabecera):
  decisión de Daniel del 2026-09-16, «depende el arreglo». Sus umbrales salen del **perfil** del
  grado (`perfiles.ts`, `WASHED_STANDARD`: muestra 30, venta 60, `[PROVISIONAL]`). **Sin reloj**
  (secado sin `target_reached`) devuelve `SIN_UMBRAL`, igual que sin umbral (`reposo.ts:59–75`).
- **`liberarLote`** (`lib/traceability/lots.ts`, ~1301) **no comprueba el reposo, a propósito**.
- **La muestra verde** exige la fase `reposo` (`lib/traceability/samples.ts:128–164`).
- **pH y Brix juzgan por grado:** `desdeElLote.ts` deduce el perfil del `grado_proceso`, y los dos
  semi-lavados y el honey **no tienen perfil** → sin veredicto (`:42–52`). Cada perfil tiene **once
  parámetros** (`perfiles.ts:56–73`: óptimos, crítico, inmediato, ventanas de estancamiento, piso y
  ruido de Brix…). **El secado no usa el grado**: tiene su perfil global, `PERFIL_DE_SECADO`
  (`secado.ts:90`, usado en `:162` y `:274`).
- **Una lectura de secado son tres puntos de la misma cama** —dos extremos y centro— y el motor
  evalúa su media (`secado.ts:104–111`).
- **`grado_proceso`** tiene `Natural`, `Washed`, `Semi Wash 50%`, `Semi Wash 75%`, `Honey`
  (`catalogs.ts:77–93`).
- **La compuerta de bodega** (Parte 1, R7) exige el proceso cerrado por humedad con la medición de
  cierre en el objetivo o por debajo.
- **Los medidores no guardan margen de error.**

---

## 2. Decisiones de Daniel, 2026-10-02

| # | Pregunta | Decisión |
|---|---|---|
| V1 | Venta antes del reposo de venta | **Se bloquea, con excepción autorizada** (permiso de aprobar + motivo obligatorio); el lote sigue marcado «venta temprana» |
| V1b | Hay umbral pero no se sabe cuántos días lleva | **Se bloquea igual, con la misma excepción**; el aviso dice «reposo desconocido», no «temprano» |
| V2 | Muestra antes de su reposo | **Avisa y deja tomarla**, marcada |
| V3 | Cuándo una prefermentación «pasó a fermentación» | **El operario decide, con sugerencia del sistema** |
| V4 | Cambios de estado | **Ninguno es automático**; cada uno lleva **doble indicador**: la acción del operario (manda) + lo que decían las lecturas contra la receta |
| V5 | Subida de humedad sin intención | **Umbral declarado por la receta; 0,5 puntos por defecto** |
| V6 | Umbral de los motores | **Receta primero; perfil si falta**; el veredicto dice de dónde salió |
| V7 | El nombre del proceso | **Lo declara la receta** (p. ej. «Semi-lavado 50 % anaeróbico») y sus lotes lo llevan; los % registrados informan |
| V8 | Semi-lavado | **Es un proceso, no un rótulo**: despulpar y lavar hasta el % de mucílago deseado, en cualquier momento y repetible. **Si la receta fija el %, el último lavado antes de la cama llega sólo hasta ese % y no se pasa.** |
| V9 | Cómo se registra el % de mucílago | **A ojo y al tacto, en tramos fijos: 0 / 10 / 25 / 50 / 75 / 100 %.** 0 % = Lavado (fully washed), nunca honey; 100 % = Honey; los intermedios, Semi-lavado |
| — | Bodega (propuesto y no contradicho) | Entrar exige una **lectura** en banda; volver a secado exige la **lectura** fuera de banda |

**V1 revierte la decisión del 2026-09-16.** Los comentarios de `reposo.ts` y `liberarLote` que la
citan se reescriben diciendo qué cambió, cuándo y por qué; no se borran en silencio.

**V7 sustituye** lo que el primer borrador de este documento decía («el grado sale de lo que entró a
la cama»). Lo que entró a la cama sigue midiéndose, pero para **comprobar la receta**, no para
nombrar el lote (§8).

---

## 3. Venta y muestra (V1, V1b, V2)

### 3.1 Los dos tiempos

- La receta los declara en su paso `reposo`: `diasParaMuestra`, `diasParaVenta`. El lote los puede
  cambiar con rastro (patrón de `targetMoisturePct`).
- **Orden de lectura** (con `umbralPara`, §7): lote → receta → perfil → ninguno.
- **El reloj** arranca con el secado que sostiene el cierre por humedad (el mismo de §6) y sólo con
  `target_reached`; nunca con la «salida a tratamiento» si la Parte 1 la añade.

### 3.2 Cuatro estados, no tres

`evaluarReposo` separa lo que hoy junta en `SIN_UMBRAL`:

| Estado | Cuándo | Venta | Muestra |
|---|---|---|---|
| `EN_PLAZO` | días ≥ umbral | pasa | pasa |
| `TEMPRANA` | días < umbral | **se bloquea** (excepción) | pasa marcada |
| `REPOSO_DESCONOCIDO` | hay umbral y **no hay reloj** | **se bloquea** (excepción) | pasa marcada |
| `SIN_UMBRAL` | no hay umbral en ningún nivel | pasa con aviso «falta el umbral» | pasa |

### 3.3 La venta bloqueada

- `liberarLote` rechaza `TEMPRANA` con `reposo_de_venta_incompleto` y `REPOSO_DESCONOCIDO` con
  `reposo_desconocido`.
- **Excepción:** `liberarLoteConExcepcion` exige el permiso de aprobar sobre el lote y un `motivo`
  no vacío. Guarda una fila `LotReleaseException` (lote, motivo, estado y días que tenía, días
  exigidos, quién, cuándo) en la misma transacción que la liberación, con su evento de auditoría.
- Liberar con excepción **no apaga el aviso**: el lote sigue «venta temprana» o «reposo
  desconocido».
- **Toda puerta que libere o venda** pasa por una función común. El plan las enumera midiendo
  (`liberarLote`, la transformación `sale` y las que aparezcan), y un guardia de arquitectura que las
  **descubre** —no una lista escrita a mano— impide que una nueva se la salte.

### 3.4 La muestra temprana

Una muestra verde con menos días que `diasParaMuestra`, o con `REPOSO_DESCONOCIDO`, **pasa** y se
marca `tomadaAntesDelReposo` (columna nueva, guardada al crearla: es un hecho del momento). La
Parte 5 la separa al comparar.

---

## 4. Cambios de estado con doble indicador (V3, V4)

### 4.1 Qué cuenta como cambio

| Cambio | Cómo queda registrado |
|---|---|
| Empezar o terminar un paso | `FermentationRun`, `DryingRun` (inicio y fin) |
| **Prefermentación → fermentación** | **termina** la corrida del paso `prefermentacion` y **empieza** otra corrida unida al paso `fermentation`, en una sola transacción, con `continuaDeCorridaId` a la anterior y el mismo recipiente. Cada intervalo conserva su paso, sus horas y sus lecturas |
| De un equipo a otro | `FermentationIntervention` `transfer` |
| Un manejo (despulpar, lavar…) | `LotProcessIntervention` (2a §4.1) |

Así no hace falta un tipo de intervención nuevo, y no se cambia el paso de una corrida ya empezada:
las lecturas posteriores pertenecen a la corrida nueva.

### 4.2 Nada es automático

- Toda función de servicio que escriba un cambio de 4.1 exige un **actor humano**: `userAccountId` de
  una cuenta de persona y `operatorPersonId`. Rechaza la cuenta de sistema y los guiones de mantenimiento
  con `cambio_sin_persona`.
- Ningún job, disparador ni motor escribe un cambio.

### 4.3 El doble indicador

Cada cambio guarda, en la misma transacción, **lo que decían las lecturas**:

- **Qué lecturas:** las de la corrida o intervalo que termina (o del proceso, para una
  intervención), con `occurredAt` ≤ el instante del cambio, **excluyendo las corregidas**
  (una lectura con `corrections` la sustituye la que la corrige, `correctsId`, `schema.prisma:3838–3840`); por variable, la **última**; una lectura de secado es el evento de tres puntos,
  evaluado por su media. Se guardan los **ids** de las lecturas usadas.
- **Contra qué:**
  - para terminar un paso, contra su **regla de fin** de la 2a (§3): condiciones, `reglaDeFin`
    (`primero` / `todas`) y el **tiempo transcurrido** si `finPorTiempo`;
  - para la prefermentación, contra su **ventana** (§4.4), por separado.
- **Resultado** `coincide`: `si` (la regla se cumple), `no` (no se cumple y aun así se cambió),
  `sin_datos` (la regla necesita una lectura que no hay). Un paso cuyo fin es **sólo por tiempo** se
  evalúa por tiempo y nunca da `sin_datos`.
- `lecturaAlCambiar`: JSON de forma fija, versionado: cada condición, su valor, su lectura y su
  veredicto.

Es una foto: lecturas que lleguen después, aunque lleven fecha anterior, no la cambian. **No
bloquea.** La Parte 5 lee `coincide = no` para ver si la receta o el personal tenían razón.

### 4.4 La sugerencia de la prefermentación

- El paso `prefermentacion` (o `cold_hold`) declara su **ventana**: metas con rango (temperatura de la
  masa, pH, caída de Brix) y `horasMax`.
- Mientras la corrida está abierta, la ficha y el tablero muestran **«parece que pasó a
  fermentación»** si la última lectura válida de alguna variable sale de la ventana o se pasan las
  horas. Es una lectura calculada, no un registro.
- **Sólo el operario** hace el cambio de 4.1. Si no lo hace, la sugerencia sigue a la vista, y al
  cerrar la corrida su doble indicador lo deja escrito.

---

## 5. Humedad que sube sin intención (V5)

- **Qué se compara:** eventos de medición del mismo lote y la misma corrida de secado, cada uno por la
  **media de sus puntos de cama** (como el motor), en orden de `occurredAt`, **sin las corregidas**.
  Dos puntos del mismo evento nunca se comparan entre sí.
- Si un evento supera al anterior en **más que el umbral** → aviso, salvo que entre los dos haya un
  tratamiento declarado (corrida o intervención con intención de rehumedecer).
- **Umbral:** `subidaToleradaPct` del paso de secado; si no lo declara, **0,5 puntos**, y el aviso
  dice «umbral por defecto».
- Aviso calculado al leer (ficha, cola de secado), con los dos eventos nombrados. Si cambió el
  instrumento o el método entre los dos, el aviso lo dice. No bloquea.

---

## 6. Bodega

Sobre la compuerta de R7:

- **El secado que manda** es el que sostiene el cierre por humedad: la última `DryingRun` terminada
  con `target_reached` en la cadena del proceso vigente, cuya medición de cierre usa R7.
- **Entrar exige la lectura de cierre dentro de la banda de ESE secado**: la de su paso
  (`humedadMinPct`–`humedadMaxPct`) o, si el lote cambió el objetivo, la del lote. Por debajo del
  mínimo se rechaza con `humedad_bajo_banda`. Si ese secado **no tiene paso** (proceso viejo,
  «Libre», desviación), rige R7 tal cual.
- **Volver a secado exige la lectura que salió fuera** de esa banda: `devolverASecado` pide el id de
  la medición, posterior a la entrada en bodega, además del motivo de R7.
- Ninguna de las dos acepta una afirmación sin medición.

---

## 7. Los umbrales de los motores (V6)

- **`umbralPara(lote, parámetro)`** resuelve **por parámetro del motor**, no por variable, y devuelve
  `{ valor, origen }` con `origen: lote | receta | perfil | ninguno`.
- **Correspondencia receta → parámetro**, declarada en una tabla en código junto a los motores:
  - pH: el rango (`minValue`–`maxValue`) de la meta `ph` del paso → `phOptimalLow` /
    `phOptimalHigh`. Los demás parámetros de pH (crítico, inmediato, ventanas de estancamiento)
    **no tienen meta** —`ProcessTargetMoment` sólo tiene `initial | during | final`—: salen del
    perfil.
  - Brix: meta `brix` de caída → `brixTargetDropPct`; el resto, del perfil.
  - Secado: la banda y el volteo del paso → los de `PERFIL_DE_SECADO`; el resto, del global.
  - Reposo: §3.1.
- **Con sólo algunos parámetros de la receta**, el resto sale del perfil y cada uno lleva su
  `origen`. Si un parámetro **imprescindible** para el veredicto queda en `ninguno`, ese motor no da
  veredicto y lo dice. Así un honey con su pH declarado **sí tiene veredicto de pH**.
- La pantalla muestra el origen («pH óptimo de la receta; ventana de estancamiento del perfil»).
- Guardias: nadie fuera de `umbralPara` lee `PERFILES` **ni `PERFIL_DE_SECADO`**.

---

## 8. El nombre del proceso y el semi-lavado (V7, V8, V9)

### 8.1 El nombre

- **El grado del proceso lo declara la receta**: su `gradoDeclarado`, un valor de `grado_proceso`.
  Todos sus lotes lo llevan, también a través de divisiones y continuaciones (R6/R7 copian el
  proceso). Los procesos sin receta conservan el grado que se declaró al abrirlos.
- `grado_proceso` gana **`Semi Wash 10%`** y **`Semi Wash 25%`**, para cubrir los tramos de V9 junto
  a los de 50 % y 75 % que ya existen.

### 8.2 El tramo de mucílago

- Cada paso `washing` / `demucilage` declara su **tramo objetivo** (`mucilagoObjetivo`: 0, 10, 25,
  50, 75 o 100).
- Al registrar el lavado (`LotProcessIntervention`, 2a §4.1), el operario **elige el tramo** que ve:
  la misma lista, sin número libre.

### 8.3 La comprobación

- **El último lavado antes de la cama** es el último `washing` / `demucilage` de la cadena (2a §4.3)
  anterior al secado que manda (§6).
- Si la receta fija el tramo en su nombre (un grado `Semi Wash X%`, `Washed` o `Honey`):
  - **lavado por debajo del tramo** (se pasó: menos mucílago del que la receta permite) →
    **desviación con motivo obligatorio** (2a §4.4), marcada `lavadoMasAllaDeLaReceta`;
  - **por encima** (quedó más mucílago) → marcada `lavadoCortoDeLaReceta`, sin motivo obligatorio;
  - **sin registro de lavado** en una receta que lo pide → marcado «sin lavado registrado».
- Nada de esto cambia el nombre del lote (V7). No bloquea.

---

## 9. Pruebas — cada guardián con su control y su flip-test

| Guardián | Prueba (con control) | Flip-test |
|---|---|---|
| 3.3 venta | 59 días con 60 → `reposo_de_venta_incompleto`; 60 → pasa; umbral sin reloj → `reposo_desconocido`; sin umbral → pasa con aviso | juntar `REPOSO_DESCONOCIDO` con `SIN_UMBRAL` → cae |
| 3.3 excepción | sin permiso o sin motivo → rechazo; con los dos → libera, escribe la excepción **y** sigue marcado | no escribir la excepción → cae |
| 3.3 puertas | el guardia descubre ≥ N puertas de venta y todas llaman a la función común | añadir una que no la llame → cae |
| 3.4 muestra | 10 días con 30 → pasa marcada; reposo desconocido → pasa marcada; 30 → sin marca | no marcar → cae |
| 4.1 prefermentación → fermentación | el cambio deja dos corridas, la primera terminada con su paso y la segunda abierta con `fermentation`; una lectura posterior cae en la segunda | cambiar el paso de la corrida en vez de abrir otra → cae |
| 4.2 actor humano | el servicio llamado con la cuenta de sistema → `cambio_sin_persona`; con una persona → pasa | quitar la comprobación → cae |
| 4.3 doble indicador | fin por pH ≤ 4,2 con última lectura 4,0 → `si`; con 4,6 → `no`; fin sólo por tiempo cumplido → `si` sin lecturas; fin por pH sin lecturas → `sin_datos`; una lectura corregida no cuenta; una lectura con fecha posterior al cambio no cuenta | evaluar sólo rangos ignorando `reglaDeFin` → cae el de tiempo |
| 5 humedad | eventos de medias 12,0 → 12,6 sin tratamiento → aviso «por defecto»; 12,0 → 12,4 → nada; con tratamiento entre medias → nada; **un solo evento con puntos 11 / 13 / 12 → nada** | comparar puntos sueltos → cae el último |
| 6 bodega | dos secados con bandas distintas: manda la del que sostiene el cierre; bajo su banda → `humedad_bajo_banda`; secado sin paso → rige R7 | tomar el primer secado → cae |
| 7 umbrales | honey con pH declarado → veredicto con `origen: receta` en los óptimos y `perfil` en el estancamiento; secado con banda de receta distinta de la global → cambia el veredicto | leer `PERFILES` o `PERFIL_DE_SECADO` directo → cae el guardia |
| 8 semi-lavado | receta `Semi Wash 50%`: último lavado 25 → desviación con motivo; 75 → marcado corto; 50 → limpio; un lavado a 25 **antes** de fermentar y el último a 50 → limpio | mirar el primer lavado en vez del último → cae |

Si una tarea toca TypeScript, su plan manda `npm run build`.

---

## 10. Lo que la 2b no hace

- Equipos, capacidades, litros y kg: **es la 2c**.
- Comparar lo real con lo declarado entre lotes: **es la Parte 5**, que lee `coincide`,
  `tomadaAntesDelReposo`, las marcas de lavado y las excepciones de venta.
- El desenlace «salida a tratamiento»: **Parte 1**, por la coordinadora.
- Notificaciones fuera de la aplicación: los avisos viven en la ficha, el tablero y la cola.

## 11. Dependencia y orden

Se construye **después de la 2a**. Toca la bodega y la devolución a secado de la Parte 1: el plan
empieza midiendo cómo quedaron en `main`, y vuelve a medir todo lo que §1 afirma.

## 12. Revisión adversaria del 2026-10-02

Codex, en sólo lectura: 11 hallazgos. Se comprobaron contra el código los que dependían de él
(`reposo.ts:59–75`, `catalogs.ts:77–93`, `secado.ts:90,104–111,162`, `perfiles.ts:56–73`) y se
sostuvieron. El segundo revisor (Claude) se colgó sin entregar informe: **la 2b tiene una sola
revisión**, y conviene otra antes del plan.

| Hallazgo | Corrección |
|---|---|
| `phase_change` no decía cómo empieza la fermentación | §4.1: termina una corrida y empieza otra, unidas |
| La banda de bodega no decía qué secado manda | §6 |
| Umbral sin reloj se colaba como «sin umbral» | §3.2 y V1b (decisión de Daniel) |
| `umbralPara` por variable no alcanza: el pH tiene once parámetros | §7: por parámetro, con tabla de correspondencia |
| `coincide` ignoraba la regla de fin de la 2a | §4.3 |
| No se decía qué lecturas entran en la foto | §4.3 |
| El grado perdía su evidencia tras dividir | §8.1: lo declara la receta y viaja con el proceso (V7) |
| No había dónde guardar un semi-lavado al 20 % | §8: tramos de Daniel (V9) y dos valores nuevos del catálogo |
| La humedad comparaba puntos de la misma cama | §5 |
| «Nada automático» no se podía probar contando escritores | §4.2: actor humano exigido |
| El secado no juzga por grado | §1 y §7 corregidos |
