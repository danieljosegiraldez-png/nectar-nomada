# Parte 2b — Lo que la receta vigila en el lote

**Fecha:** 2026-10-02, rehecho el 2026-10-03 · **Estado:** decisiones de Daniel tomadas pregunta por
pregunta; **dos revisiones adversarias** aplicadas (Codex, 11 hallazgos; Claude, 12; §13); pendiente
de su lectura; los roles se decidieron el 2026-10-04 (§12). **Base:** `origin/main` `85eab6da`. Depende de la
**2a** (`2026-10-02-parte-2a-la-receta-con-pasos-design.md`, misma rama) y de la **Parte 1** (rama
`recetas-base`: cobertura R1 con su `cadena`, compuerta de bodega R7, cierres `moisture`/`divided`).

Criterio de Daniel: **«poder medir para poder reusar recetas y reproducir, replicar, ser consistente
con los resultados»**, con un sistema **funcional, inteligente y trazable**.

---

## 0. La idea que ordena todo — Daniel, 2026-10-03

- **La receta manda, y el nombre es la receta.** «Lo que da el nombre es lo que lo hace»: un lote
  hecho con la receta X se llama X. Manda **el lugar y la experiencia** del beneficio, no la
  intención de quien lo prepare después (tostador, barista, brewer).
- **Se define y se ejecuta; no se improvisa constante.** Se puede escoger un proceso o inventarlo,
  pero se mantiene dentro de su receta (la Libre también: 2a §5.2).
- **Dentro de lo permitido, silencio.** Un tiempo o una variable que se mueve dentro de lo que la
  receta acepta **no produce ningún aviso ni marca**: se cierra la fase y se sigue.
- **Fuera de lo permitido, decide una persona, y queda escrito quién.** El sistema avisa; quien
  aprueba decide, con motivo. La razón de Daniel: alguien puede tomar control «subjetiva o
  sugestivamente»; la decisión se puede tomar, no esconder.
- **El horizonte:** que Panamá deje un precedente más allá de lo artesanal: **declarar el nivel de
  manipulación** de cada café, calculado de lo registrado. Esta parte deja los datos listos; la
  declaración visible es de la Parte 5 (§11).

---

## 1. Lo que hay hoy, medido en `85eab6da`

- **Reposo:** edad, no fase; **no bloquea nada** (`lib/beneficio/reposo.ts`), por decisión de Daniel
  del 2026-09-16 («depende el arreglo») **confirmada el 2026-09-30** (Parte 1, R7 y §5). Umbrales del
  **perfil** (`perfiles.ts`). **Sin reloj** devuelve `SIN_UMBRAL`, igual que sin umbral
  (`reposo.ts:59–75`).
- **`liberarLote`** (`lots.ts:1315`) no comprueba el reposo, a propósito; su permiso `lot:release`
  dice «Does not check the resting age» (`lib/rbac/catalog.ts:78`). **Ninguna pantalla lo llama hoy**
  (sólo pruebas), y **la transformación `sale` no mira `releasedAt`**.
- **Muestra verde:** exige fase `reposo` o secado terminado en la ascendencia, y lanza
  `green_sample_before_reposo` **sin anulación** (`samples.ts:112–166`).
- **Motores:** pH y Brix deducen el perfil del `grado_proceso` (`desdeElLote.ts:42–64`); semi-lavados y
  honey sin perfil → sin veredicto. Cada perfil tiene once parámetros (`perfiles.ts:56–73`). El secado
  usa su perfil global `PERFIL_DE_SECADO` (`secado.ts:90,162,274`), que **no tiene volteo**. El motor
  agrupa las lecturas por `samplingEventId` con rol `ZONE` y **descarta las `UNCALIBRATED`**
  (`desdeElLote.ts:268–296`).
- **Una lectura de secado son tres puntos de la misma cama**; se evalúa su media (`secado.ts:104–111`).
- **Exactitud de instrumentos: SÍ existe.** `EquipmentModelSpec.resolution` y `accuracyAbs`
  (`schema.prisma:5667–5668`), y `Measurement.instrumentId`. (La primera versión de este documento lo
  negó: era falso.)
- **No hay «cuenta de sistema»:** toda `UserAccount` tiene `personId`. `operatorPersonId` es opcional
  en los servicios.
- **Terminar una fermentación crea un lote nuevo** con código, tipo y balance de masa
  (`fermentation.ts:158–215`).
- **`grado_proceso`:** `Natural`, `Washed`, `Semi Wash 50%`, `Semi Wash 75%`, `Honey`. `abrirProceso`
  exige `processGradeValueId` (`lotProcess.ts:169`).
- **Escala de «Semi Wash»:** ADR-181 punto 12 (`DECISIONS.md:11965`) y
  `docs/dominio/revision-literatura-fermentacion-2026-09-19.md:85–86` la definen como **mucílago
  quitado**. Daniel la corrige el 2026-10-03 (V9).

---

## 2. Decisiones de Daniel

| # | Pregunta | Decisión |
|---|---|---|
| V1 | Venta antes del reposo | **Se bloquea, con excepción autorizada** y motivo; sigue marcado «venta temprana». Revierte la del 2026-09-16 **y su confirmación del 2026-09-30** |
| V1b | Hay umbral, pero no se sabe cuántos días lleva | **Se bloquea igual, con la misma excepción**; aviso «reposo desconocido» |
| V2 | Muestra antes de su reposo | **Avisa y deja tomarla**, marcada |
| V3 | Prefermentación → fermentación | **El operario decide, con sugerencia del sistema** |
| V3b | ¿Nace un lote nuevo? | **No: misma corrida, cambia de fase** (2026-10-03) |
| V4 | Cambios de estado | **Ninguno es automático**; cada uno con **doble indicador** |
| V5 | Subida de humedad sin intención | **Umbral de la receta; 0,5 puntos por defecto** |
| V6 | Umbrales de los motores | **Receta primero; perfil si falta**, diciendo de dónde salió |
| V7 | El nombre | **Lo da la receta**; manda el lugar y la experiencia (§0) |
| V8 | Semi-lavado | **Es un proceso**: lavar hasta el % deseado, en cualquier momento y repetible. Si la receta fija el %, el último lavado antes de la cama no se pasa de él |
| V9 | % de mucílago | **A ojo y al tacto, en tramos: 0 / 10 / 25 / 50 / 75 / 100 %**, y **es lo que QUEDA**: «Semi Wash 75 %» = le queda el 75 %; 0 % = Lavado, 100 % = Honey (2026-10-03; corrige ADR-181) |
| V10 | Fuera de lo permitido | **Avisa; quien aprueba decide si conserva el nombre**, con motivo y a su nombre. Dentro de lo permitido, **silencio** |
| V11 | Sobresecado (bajo la banda) | **Entra a bodega con excepción autorizada**, marcado «sobresecado» |
| V12 | Receta Libre | El operario **declara el grado** al abrir; umbrales y reposo salen de su perfil (2a §5.2) |
| — | Bodega (propuesto y no contradicho) | Entrar exige una **lectura** en banda; volver a secado, la **lectura** fuera de banda |
| V13 | Los roles (2026-10-04) | **El operador es el Farm Operator** de hoy, sin cambios. **El Coffee Process Manager es un perfil nuevo** (§12) |
| V14 | ¿La misma persona opera y aprueba? | **Sí, pero queda marcado** «aprobada por quien lo operó» |
| V15 | Quién cambia en un lote los días de reposo o el objetivo de humedad | **Sólo el Process Manager, con motivo**: mover los límites es otra forma de no necesitar excepción |
| V16 | Qué más le toca al Process Manager | **Publicar y versionar recetas.** Liberar un lote con el reposo cumplido sigue siendo de `lot:release` |

---

## 3. Venta y muestra (V1, V1b, V2)

### 3.1 Los dos tiempos

- La receta los declara en su paso `reposo` (`diasParaMuestra`, `diasParaVenta`); el lote los puede
  cambiar **sólo el Process Manager, con motivo obligatorio** (V15; permiso de §12), con rastro. Orden:
  lote → receta → perfil → ninguno (`umbralPara`, §7).
- **El reloj** arranca con el secado que sostiene el cierre (§6), sólo con `target_reached`.

### 3.2 Cinco estados

| Estado | Cuándo | Venta | Muestra |
|---|---|---|---|
| `EN_PLAZO` | días ≥ umbral | pasa | pasa |
| `TEMPRANA` | días < umbral | **bloquea** (excepción) | pasa marcada |
| `SIN_DESENLACE` | hay secado terminado, pero **sin `endedOutcome`** (todo lo anterior al 2026-09-16) | **bloquea** (excepción) | pasa marcada |
| `SIN_SECADO` | hay umbral y **ningún secado terminado** que lo sostenga | **bloquea** (excepción) | no aplica: la muestra verde ya exige secado |
| `SIN_UMBRAL` | ningún nivel declara umbral | pasa, con aviso «falta el umbral» | pasa |

`SIN_DESENLACE` y `SIN_SECADO` son los dos casos de V1b («reposo desconocido»), separados para que la
pantalla diga cuál es. **Tras el reimport (R9)**, los lotes históricos saldrán `SIN_DESENLACE`: el
reimport puede registrar el desenlace cuando la fuente lo diga; si no lo dice, quedan para excepción,
y el plan cuenta cuántos son antes de fusionar.

- **Mezclas:** el reposo de una mezcla es el **peor** de sus ramas; si alguna no tiene reloj, la mezcla
  tampoco. Una mezcla no escapa por `SIN_UMBRAL`.

### 3.3 La venta bloqueada

- Una función común, `exigeReposoParaVender(tx, lotId)`, corre **dentro de la transacción** y
  **después de `bloquearLinaje`** (Parte 1), para que una devolución a secado simultánea no la
  adelante.
- **Puertas:** `liberarLote` y la transformación `sale`. Hoy `sale` no mira `releasedAt`; desde la
  2b **vender exige el lote liberado** y la liberación es la que comprueba el reposo. El guardia de
  arquitectura **descubre** las puertas que escriben `releasedAt` o una transformación `sale`, con
  control positivo (encuentra las dos de hoy).
- **Excepción:** `liberarLoteConExcepcion` exige el permiso de §12 y un `motivo`; guarda
  `LotReleaseException` (lote, motivo, estado, días que tenía y exigidos, quién, cuándo) en la misma
  transacción, con su auditoría. El lote **sigue marcado**.
- **Un lote liberado que vuelve a secado** (R7) pierde la liberación: `devolverASecado` borra
  `releasedAt` en su transacción, con auditoría. El reloj vuelve a empezar.
- **Los liberados antes de la 2b** no se tocan; la pantalla calcula su estado de reposo como a
  cualquiera, así que el aviso aparece si corresponde.

### 3.4 La muestra temprana

Una muestra verde con `TEMPRANA` o `SIN_DESENLACE` **pasa** y se marca `tomadaAntesDelReposo`
(columna nueva, guardada al crearla). **El guardia `green_sample_before_reposo` se relaja sólo en
eso:** sigue exigiendo un secado terminado; deja de exigir `target_reached`. El reloj de un verde
descendiente se resuelve por la cadena de R1.

---

## 4. Cambios de estado con doble indicador (V3, V3b, V4)

### 4.1 Qué cuenta como cambio

| Cambio | Cómo queda registrado |
|---|---|
| Empezar o terminar un paso | `FermentationRun`, `DryingRun` (inicio y fin) |
| **Prefermentación → fermentación** | **la misma corrida cambia de paso**: una fila nueva `FermentationPhaseChange` (corrida, paso que deja, paso que empieza, instante, persona). La corrida conserva su `recipeStepId` de origen; **su paso vigente** es el del último cambio, y las lecturas desde ese instante cuentan para él. **No nace lote** |
| De un equipo a otro | `FermentationIntervention` `transfer` |
| Un manejo (despulpar, lavar…) | `LotProcessIntervention` (2a §4.1) |

**Ajuste a la 2a:** el avance (2a §4.3) cuenta un `FermentationPhaseChange` como el paso que empieza;
la regla de fin de la prefermentación se evalúa en el cambio, y la de la fermentación al terminar la
corrida.

### 4.2 Nada es automático

- Toda función que escriba un cambio de 4.1 **exige `operatorPersonId`** (hoy opcional) y lo rechaza
  vacío con `cambio_sin_persona`.
- **El reimport** (Parte 1, R9) usa los mismos servicios con un `origen: reimport` explícito y
  auditado, que acepta la persona que diga la fuente o «desconocida» declarada. Ninguna pantalla puede
  mandar ese origen.
- Ningún job, disparador ni motor llama a esas funciones.

### 4.3 El doble indicador

Cada cambio guarda, en su misma fila y transacción:

- **Qué lecturas:** las del intervalo que termina (corrida y paso vigente), con `occurredAt` ≤ el
  cambio; **con la misma selección que el motor**: por evento de muestreo, sin las corregidas
  (`correctsId`) ni las `UNCALIBRATED`. Se extrae a una función común con el motor; no se reescribe.
  Por variable, el último evento. Se guardan los ids.
- **Contra qué**, según el cambio:

  | Cambio | Se evalúa contra |
  |---|---|
  | Terminar un paso / cambio de fase | su **regla de fin** de la 2a: condiciones, `reglaDeFin` (`primero` / `todas`) y tiempo si `finPorTiempo` |
  | Cambio de fase desde prefermentación | además, su **ventana** (§4.4): `dentroDeVentana` aparte |
  | Empezar un paso, `transfer`, una intervención | **nada**: no tienen regla. Se guarda la foto con `coincide = no_aplica` |

- **Resultado** `coincide`: `si`, `no`, `sin_datos`, `no_aplica`. Fin sólo por tiempo nunca da
  `sin_datos`.
- **Silencio (V10):** `coincide = no` **sólo se muestra** si la variable salió de lo que la receta
  **acepta**. Un cierre dentro de lo aceptado aunque no exacto no muestra nada; queda en la foto para
  la Parte 5.
- Columnas `lecturaAlCambiar` (JSON de forma fija, versionado) y `coincide` en las cuatro tablas de
  4.1 y en `FermentationPhaseChange`.

### 4.4 La sugerencia de la prefermentación

El paso `prefermentacion` (o `cold_hold`) declara su **ventana** (metas con rango y `horasMax`).
Mientras la corrida está en ese paso, la ficha y el tablero muestran **«parece que pasó a
fermentación»** si el último evento válido de alguna variable sale de la ventana o se pasan las horas.
Es una lectura calculada. **Sólo el operario** registra el cambio de fase.

---

## 5. Humedad que sube sin intención (V5)

- **Qué se compara:** eventos de muestreo del mismo lote y la misma corrida de secado, cada uno por la
  media de sus puntos `ZONE`, con la misma selección que el motor (sin corregidas ni `UNCALIBRATED`),
  en orden de `occurredAt`. Dos puntos del mismo evento nunca se comparan entre sí.
- **Aviso** si un evento supera al anterior en más que el umbral, salvo que entre los dos haya un
  **tratamiento con intención de rehumedecer**: una corrida o intervención cuyo paso tenga
  `rehumedece: true` (columna nueva del paso, 2a §3).
- **Umbral:** `subidaToleradaPct` del paso de secado (columna nueva, 2a §3); si no lo declara, **0,5
  puntos**, y el aviso lo dice. **Si la subida cabe en la exactitud declarada del instrumento**
  (`accuracyAbs`), el aviso lo dice también: «dentro de la exactitud del medidor». El umbral no cambia.
- Aviso calculado al leer. No bloquea.

---

## 6. Bodega (y V11)

- **El secado que manda:** la última `DryingRun` terminada con `target_reached` en la cadena del
  proceso vigente, cuya medición de cierre usa R7.
- **Banda:** la de su paso (`humedadMinPct`–`humedadMaxPct`). Si el lote cambió el objetivo
  (`targetMoisturePct`, un solo número; **desde la 2b sólo lo cambia el Process Manager con motivo
  obligatorio**, V15 — hoy `cambiarObjetivoDeHumedad` pide `lot:manage` y el motivo es opcional,
  `lotProcess.ts:238–248`), ese número es el **máximo** y el mínimo sigue siendo el del
  paso. Sin paso (proceso viejo, desviación): rige R7 tal cual.
- **Por encima:** R7 lo rechaza como hoy. **Por debajo** (sobresecado): se rechaza con
  `humedad_bajo_banda`, salvo **excepción autorizada** (V11): permiso de §12, motivo, y el lote entra
  marcado «sobresecado» con su lectura.
- **Volver a secado exige la lectura fuera de banda:** `devolverASecado` pide el id de una medición
  **posterior al cierre del proceso** (sirve igual para un lote ya en bodega que para uno bloqueado en
  su entrada, que R7 también admite).

---

## 7. Los umbrales de los motores (V6)

- **`umbralPara(lote, paso, parámetro)`** resuelve **por parámetro del motor** y recibe el **paso
  vigente** de la corrida activa (no basta el lote: puede haber prefermentación y fermentación).
  Devuelve `{ valor, origen }` con `origen: lote | receta | perfil | ninguno`.
- **Correspondencia** (tabla en código junto a los motores):
  - pH: meta `ph` del paso con momento **`during`**, `minValue` → `phOptimalLow`, `maxValue` →
    `phOptimalHigh` (respetando que `phOptimalHigh` es exclusivo en el motor). El resto de parámetros
    de pH, del perfil.
  - Brix: meta `brix` `during` de caída → `brixTargetDropPct`; el resto, del perfil.
  - Secado: la banda del paso → la banda del perfil de secado. **El volteo no entra**: lo lee la cola
    desde el paso (2a §3.1).
  - Reposo: §3.1.
- Con sólo algunos parámetros de la receta, el resto sale del perfil, cada uno con su origen. Si un
  parámetro imprescindible queda en `ninguno`, ese motor no da veredicto y lo dice.
- **Guardia por el compilador:** el parámetro `profile` de `evaluarSecado`, `consistenciaHumedadMasa`
  y los motores de pH y Brix pasa a ser **obligatorio**; sólo `umbralPara` (y las pruebas de vectores)
  construyen perfiles. Desaparece el `?? PERFIL_DE_SECADO`.

---

## 8. El nombre y el semi-lavado (V7–V10)

### 8.1 El nombre es la receta

- El lote lleva **el nombre de su receta**, con su versión. Viaja por divisiones y continuaciones:
  **R6/R7 copian también los campos nuevos de la 2b** (días de reposo propios del lote, la decisión
  de §8.4 si la hubo).
- **El grado** (`grado_proceso`) lo declara la **receta** (`gradoDeclarado`, en la **versión**).
  Con receta, `abrirProceso` lo toma de ella y **rechaza** un grado distinto del operario
  (`grado_distinto_de_la_receta`). Con Libre, lo declara el operario (V12). Sin receta (viejos), el de
  siempre.
- `grado_proceso` gana `Semi Wash 10%` y `Semi Wash 25%`. **Con la escala de V9 (lo que queda)**: los
  valores existentes cambian de lectura —`Semi Wash 75%` deja de ser «quitado el 75 %»—. Se corrigen
  sus definiciones en el catálogo, ADR-181 punto 12 y la revisión de literatura, **con nota fechada**,
  y el plan **cuenta los lotes ya registrados** con esos valores para que Daniel decida cómo se leen
  antes del reimport.

### 8.2 El tramo de mucílago

- Cada paso `washing` / `demucilage` declara `mucilagoObjetivo` (lo que **queda**: 0, 10, 25, 50, 75
  o 100). Es **la única fuente**: no se deduce del nombre.
- Al registrar el lavado, el operario **elige el tramo** que ve, de la misma lista.

### 8.3 La comprobación del último lavado

- **El último lavado antes de la cama** es el último `washing` / `demucilage` de la cadena (2a §4.3)
  anterior al secado que manda (§6).
- **Igual al objetivo:** silencio.
- **Le quitó de más** (queda menos de lo que la receta fija): es salirse de lo permitido → aviso y
  **decisión de §8.4**.
- **Le quitó de menos** (queda más): aviso, sin decisión obligatoria; queda en la foto.
- **Una receta con 100 %** (Honey) no espera lavado: su ausencia es silencio. Otra receta que pide
  lavado y no lo tiene registrado: aviso «sin lavado registrado».
- Los lavados anteriores son historia, no desviación.

### 8.4 Fuera de lo permitido: decide una persona (V10)

- **Qué es «fuera»:** una variable o un tiempo fuera de lo que la receta **acepta** (rango, `horasMax`,
  tramo), no fuera del valor sugerido.
- El sistema avisa en la ficha. **Quien aprueba** (§12) registra `ConservaNombreDecision`: conserva o
  no el nombre, motivo obligatorio, quién, cuándo, y qué variable lo provocó.
- **Conserva:** sigue siendo receta X, con la decisión visible a quien compre. **No conserva:** el
  proceso pasa a una Libre (2a §5.2) con la intención «salió de X por …», y la decisión queda unida.
- **Sin decisión** el lote no puede liberarse para la venta: es otra puerta de §3.3.

---

## 9. Pruebas — cada guardián con su control y su flip-test

| Guardián | Prueba (con control) | Flip-test |
|---|---|---|
| 3.2 estados | 59/60 → `TEMPRANA`; 60 → `EN_PLAZO`; secado sin desenlace → `SIN_DESENLACE`; sin secado → `SIN_SECADO`; sin umbral → `SIN_UMBRAL`; mezcla con una rama sin reloj → bloquea | juntar cualquier par de estados → cae |
| 3.3 venta | `sale` sin liberación → rechazo; `liberarLote` con `TEMPRANA` → rechazo; con excepción → libera y sigue marcado; devolver a secado borra `releasedAt` | quitar `bloquearLinaje` → cae la prueba de carrera con `retener` |
| 3.3 puertas | el guardia encuentra **las 2 puertas de hoy** y falla si una nueva no llama a la función común | añadir una → cae |
| 3.4 muestra | 10 días con 30 → pasa marcada; sin desenlace → pasa marcada; sin secado → `green_sample_before_reposo` | no marcar → cae |
| 4.1 cambio de fase | la corrida sigue siendo una, sin lote nuevo; su paso vigente es `fermentation`; una lectura posterior cuenta para él | crear lote o corrida nueva → cae |
| 4.2 persona | sin `operatorPersonId` → `cambio_sin_persona`; con `origen: reimport` y persona «desconocida» → pasa; ese origen desde una acción de pantalla → rechazo | quitar la comprobación → cae |
| 4.3 regla de fin | dos condiciones, una cumplida: `primero` → `si`, `todas` → `no`; sólo tiempo cumplido → `si`; pH sin lecturas → `sin_datos`; `transfer` → `no_aplica`; corregida y `UNCALIBRATED` no cuentan; lectura con fecha posterior no cuenta | permutar `primero`/`todas` → cae |
| 4.3 silencio | cierre con pH 4,3 cuando la receta sugiere 4,2 y acepta 4,0–4,5 → nada visible; con 4,8 → aviso | mostrar todo `coincide = no` → cae |
| 5 humedad | medias 12,0 → 12,6 sin tratamiento → aviso «por defecto»; 12,0 → 12,4 → nada; con paso `rehumedece` entre medias → nada; un evento con puntos 11/13/12 → nada; subida 0,6 con `accuracyAbs` 0,8 → aviso «dentro de la exactitud» | comparar puntos sueltos → cae |
| 6 bodega | dos secados con bandas distintas: manda el que sostiene el cierre; bajo la banda → `humedad_bajo_banda`; con excepción → entra marcado; devolver un lote bloqueado en su entrada con lectura posterior al cierre → pasa | tomar el primer secado → cae |
| 7 umbrales | honey con pH `during` declarado → `origen: receta` en óptimos y `perfil` en estancamiento; secado con banda de receta distinta de la global → cambia el veredicto; con prefermentación y fermentación, cada paso usa su meta | quitar `profile` obligatorio → no compila |
| 8.1 grado | abrir con receta Lavado y grado Natural → `grado_distinto_de_la_receta`; Libre con grado declarado → pasa | idem |
| 8.3 último lavado | receta 50 %: último lavado 25 → aviso y decisión; 75 → aviso sin decisión; 50 → silencio; un lavado a 25 **antes** y el último a 50 → silencio; Honey 100 sin lavado → silencio | mirar el primer lavado → cae; **invertir la escala → cae** (fixture con la tabla 0 = Lavado, 100 = Honey fijada) |
| 8.4 decisión | sin decisión → no se libera; «no conserva» → el proceso pasa a Libre con su intención | idem |
| §12 roles | un Farm Operator pide la excepción → rechazo; un Farm Manager sin el perfil nuevo → rechazo; un Process Manager → pasa | dar el permiso al Farm Manager de serie → cae |
| §12 misma persona | el Process Manager que registró una corrida del lote aprueba su excepción → pasa con `aprobadaPorQuienOpero = true`; otro Process Manager → `false` | no comprobar la cadena → cae |
| V15 límites | un Farm Operator cambia días de reposo u objetivo de humedad → rechazo; el Process Manager sin motivo → rechazo; con motivo → pasa con rastro | volver a `lot:manage` → cae |
| V16 recetas | publicar o versionar sin el permiso del Process Manager → rechazo | idem |

Si una tarea toca TypeScript, su plan manda `npm run build`.

---

## 10. Textos que dicen lo contrario y se reescriben con nota

`lib/beneficio/reposo.ts` (cabecera), `liberarLote` en `lots.ts`, la descripción de `lot:release` en
`lib/rbac/catalog.ts:78`, `docs/superpowers/specs/2026-09-16-reposo-trilla-y-subproductos-design.md`,
`docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md`,
`docs/arquitectura/BRECHAS_PAQUETE_VS_REPOSITORIO.md`, el diseño de la Parte 1 (R7 y §5, «los días de
reposo siguen avisando»), ADR-181 punto 12 y la revisión de literatura del 2026-09-19 (escala), y `docs/beneficio/20_modelo_ciclo_completo.md:78` (muestra verde). Cada
uno con la fecha y la decisión que lo cambia; ninguno se borra en silencio.

## 11. Lo que la 2b no hace

- Equipos y capacidades: **2c**.
- **La declaración del nivel de manipulación** (§0): la 2b deja guardados los datos (pasos, adiciones,
  inóculos, cambios de fase, decisiones); calcularla y mostrarla es de la **Parte 5**, junto con
  comparar lotes.
- El desenlace «salida a tratamiento»: **Parte 1**, por la coordinadora.
- Notificaciones fuera de la aplicación.

## 12. Quién opera y quién aprueba — decisiones de Daniel, 2026-10-04

Daniel respondió «beneficio operator coffee process manager»; una investigación de sólo lectura
(nueve agentes, 233 hallazgos verificados contra su archivo y línea) reunió lo que ya había dicho y lo
que existe, y él decidió V13–V16. Lo que ya estaba escrito por él: «manager doesnt edit the SOP
itself, manager can override and give a reason observation» (`09-DISCOVERY-SOURCE-TRANSCRIPT.md:962`)
y que el farm manager puede no ser «el del beneficio o el process manager»
(`2026-09-18-seccion-finca-design.md:11`).

- **Beneficio Operator = el perfil `Farm Operator` de hoy**, sin cambios: todo lo que las Partes 1, 2a y
  2b piden al operario ya lo cubre `lot:manage` / `sample:manage`.
- **Coffee Process Manager: perfil nuevo** en `lib/rbac/catalog.ts`, con un permiso nuevo
  —nombre provisional `lot:approve_exception`— que cubre:
  - las cuatro excepciones: venta temprana (V1), reposo desconocido (V1b), sobresecado (V11) y
    conservar o no el nombre fuera de lo permitido (V10);
  - cambiar en un lote los días de reposo y el objetivo de humedad, con motivo obligatorio (V15);
  - **publicar y versionar recetas** (V16) — esto toca la 2a: su plan decía «publicar y convertir
    exigen `edit_beneficio`»; pasa a exigir el permiso del Process Manager. Anotado en su registro.
- **El Farm Manager no recibe ese permiso de serie.** Liberar con el reposo cumplido sigue siendo
  `lot:release`, decisión comercial (`catalog.ts:78`). Quien tenga los dos perfiles hace las dos cosas.
- **La misma persona puede operar y aprobar (V14), pero queda marcado.** Al registrar una excepción, el
  servicio comprueba si la persona que aprueba aparece como operador o autor de algún registro de la
  cadena del proceso; si aparece, la excepción guarda `aprobadaPorQuienOpero = true` y la ficha lo
  muestra.
- **Regla de ADR-091:** el permiso nuevo nace con el código que lo comprueba (`DECISIONS.md:6355`), en la
  misma tarea que `liberarLoteConExcepcion` y las otras puertas.
- **Pendiente de medir en el plan:** `resolveLotVisibility` no tiene en cuenta permisos añadidos a una
  persona (`lib/traceability/lots.ts:660`, leído y no ejecutado): por eso el Process Manager es un
  **perfil**, no un permiso suelto añadido a alguien.
- **Desfase a corregir:** `docs/beneficio/20_modelo_ciclo_completo.md:78` dice que la muestra verde se
  bloquea «sin permiso de anulación»; con V2 pasa marcada. Va a la lista del §10.

## 13. Revisiones adversarias

**Codex (2026-10-02, 11 hallazgos)** y **Claude (2026-10-03, 12)**, en sólo lectura. Cada hallazgo
que dependía del código se comprobó antes de corregir. Las decisiones de Daniel no se discutieron;
cuatro hallazgos se le preguntaron porque eran suyos (escala, lote en el cambio de fase,
sobresecado, Libre).

| Hallazgo | Corrección |
|---|---|
| Fin de fermentación crea lote; el cambio de fase fabricaba lotes | §4.1: misma corrida (V3b) |
| Escala de «Semi Wash» invertida respecto a ADR-181 | V9 y §8.1, con nota en los textos |
| Dos fuentes del tramo (nombre y paso) | §8.2: sólo el paso |
| Honey marcado por no lavarse | §8.3 |
| «Cuenta de sistema» no existe; el reimport no tiene operario | §4.2 |
| Banda de bodega sin secado que mande; sobresecado sin salida; lote bloqueado sin poder volver | §6, V11 |
| Umbral sin reloj, histórico sin desenlace, mezclas, carrera al liberar, liberados viejos | §3.2, §3.3 |
| La muestra temprana chocaba con `green_sample_before_reposo` | §3.4 |
| Permiso de aprobar no existe | §12: perfil y permiso nuevos (V13) |
| «Los medidores no guardan exactitud» era falso | §1, §5 |
| Selección de lecturas distinta del motor; columnas sin declarar | §4.3, §5 |
| `umbralPara` sin paso ni momento; volteo; guardia imposible | §7 |
| Grado de la receta contra el del operario; Libre; copia en R6/R7 | §8.1, V12 |
| `coincide` sin regla para transfer e intervenciones; `primero`/`todas` sin prueba | §4.3, §9 |
| `phase_change`, banda, grado tras dividir (Codex) | §4.1, §6, §8.1 |
