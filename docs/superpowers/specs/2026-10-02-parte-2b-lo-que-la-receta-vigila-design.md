# Parte 2b — Lo que la receta vigila en el lote

**Fecha:** 2026-10-02 · **Estado:** diseño aprobado por Daniel en conversación, pregunta por
pregunta; pendiente de revisión adversaria y de su lectura. **Base:** `origin/main` `85eab6da`.
Depende de la **2a** (`2026-10-02-parte-2a-la-receta-con-pasos-design.md`, misma rama): necesita los
pasos, sus metas y que cada registro sepa qué paso cumple. Y de la **Parte 1** (rama `recetas-base`):
la cobertura R1, la compuerta de bodega (R7) y los cierres `moisture` / `divided`.

Criterio de Daniel: **«poder medir para poder reusar recetas y reproducir, replicar, ser consistente
con los resultados»**, con un sistema **funcional, inteligente y trazable**.

---

## 1. Lo que hay hoy, medido en `85eab6da`

- **El reposo es una edad, no una fase**, y **no bloquea nada** (`lib/beneficio/reposo.ts`, cabecera):
  decisión de Daniel del 2026-09-16, «depende el arreglo». Sus dos umbrales salen del **perfil** del
  grado (`lib/beneficio/perfiles.ts`, `WASHED_STANDARD`: muestra 30, venta 60, `[PROVISIONAL]`).
- **`liberarLote`** (`lib/traceability/lots.ts`, ~1301) **no comprueba el reposo, a propósito**, por
  la misma decisión.
- **La muestra verde** exige la fase `reposo` del lote (`lib/traceability/samples.ts:128–164`).
- **Los motores juzgan por grado:** `desdeElLote.ts` deduce el perfil del `grado_proceso`, y **tres
  grados se quedan sin perfil** (los dos semi-lavados y el honey) → sin veredicto (`:42–52`).
- **La compuerta de bodega** (Parte 1, R7) exige el proceso cerrado por humedad con la medición de
  cierre **en el objetivo o por debajo**.
- **`FermentationInterventionType`** ya tiene `transfer` (mover de recipiente) y `termination`.
- **Los medidores no guardan margen de error**: ningún campo de tolerancia o precisión en
  `Equipment` (medido el 2026-10-02).

---

## 2. Decisiones de Daniel, 2026-10-02

| # | Pregunta | Decisión |
|---|---|---|
| V1 | Venta antes del reposo de venta | **Se bloquea, con excepción autorizada**: quien tenga permiso de aprobar la hace con motivo obligatorio; queda quién, cuándo y por qué, y el lote sigue marcado «venta temprana» |
| V2 | Muestra antes de su reposo | **Avisa y deja tomarla**, marcada «tomada antes del reposo» |
| V3 | Cuándo una prefermentación «pasó a fermentación» | **El operario decide, con sugerencia del sistema** |
| V4 | Cambios de estado | **Ninguno es automático**: prefermentación → fermentación, de un equipo a otro, salida a secado. Lo hace una persona, con **doble indicador**: su acción (manda) + lo que decían las lecturas contra la receta |
| V5 | Subida de humedad sin intención | **Umbral declarado por la receta; 0,5 puntos por defecto**, y el aviso lo dice |
| V6 | Umbral de los motores | **Receta primero; perfil del grado si falta**; el veredicto dice de dónde salió |
| V7 | Grado del proceso | **Sale de lo que entró a la cama** (estado del fruto + % de mucílago); la receta declara el esperado |
| — | Bodega (2026-10-02, propuesto y no contradicho) | Entrar exige una **lectura** en banda; volver a secado exige la **lectura** fuera de banda |

**V1 revierte la decisión del 2026-09-16.** Su texto se cita en `reposo.ts` y `liberarLote`; esos
comentarios se reescriben diciendo qué cambió, cuándo y por qué, no se borran en silencio.

---

## 3. Venta y muestra (V1, V2)

### 3.1 Los dos tiempos

- La receta los declara en su paso `reposo`: `diasParaMuestra`, `diasParaVenta`. El lote los puede
  cambiar con rastro (patrón de `targetMoisturePct`).
- **Orden de lectura:** el valor del lote; si no, el de la receta; si no, el del perfil del grado
  (V6); si no, «sin umbral» — y ahí **la venta no se bloquea**, porque no hay contra qué. El aviso
  dice que falta el umbral.
- El reloj sigue arrancando sólo con `target_reached` (y, si la Parte 1 lo añade, nunca con la
  «salida a tratamiento»).

### 3.2 La venta bloqueada

- `liberarLote` rechaza con `reposo_de_venta_incompleto` si los días de reposo no llegan a
  `diasParaVenta`.
- **Excepción:** `liberarLoteConExcepcion` exige el permiso de aprobar sobre el lote y un
  `motivo` no vacío. Guarda una fila nueva `LotReleaseException` (lote, motivo, días que tenía, días
  exigidos, quién, cuándo) en la misma transacción que la liberación, con su evento de auditoría.
- El lote liberado así **sigue mostrando «venta temprana»**: liberar no apaga el aviso.
- **Toda puerta que libere o venda** pasa por la misma comprobación. El plan las enumera midiendo
  (`liberarLote`, la transformación `sale` y cualquier otra que se encuentre), y el guardia de
  arquitectura impide que una nueva se salte la función común.

### 3.3 La muestra temprana

- Tomar una muestra verde con menos días que `diasParaMuestra` **pasa** y marca la muestra
  `tomadaAntesDelReposo` (columna nueva, calculada y guardada al crearla: es un hecho del momento).
- La Parte 5 la separa al comparar.

---

## 4. Cambios de estado con doble indicador (V3, V4)

### 4.1 Qué cuenta como cambio

| Cambio | Registro que ya existe y lo lleva |
|---|---|
| Empezar o terminar un paso (corrida) | `FermentationRun`, `DryingRun` (inicio y fin) |
| Prefermentación → fermentación | **nuevo**: `FermentationIntervention` con tipo nuevo `phase_change` |
| De un equipo a otro | `FermentationIntervention` `transfer` |
| Un manejo (despulpar, lavar…) | `LotProcessIntervention` |

**Nada cambia de estado solo.** Ningún job, ningún disparador, ningún motor escribe un cambio.

### 4.2 El doble indicador

Cada registro de 4.1 guarda, al escribirse, **lo que decían las lecturas** contra la receta en ese
instante:

- `lecturaAlCambiar` (JSON con forma fija, versionado): por cada meta del paso que tenga lectura, la
  variable, el valor, la hora de la lectura, el rango de la receta y si estaba dentro o fuera; y las
  metas **sin** lectura, nombradas como «sin dato».
- `coincide`: `si | no | sin_datos`. «No» cuando la acción contradice lo que decían las lecturas
  (sigue en prefermentación con una variable fuera de la ventana; sale a secado sin cumplir el fin del
  paso de fermentación).

Se calcula **en el servicio, dentro de la transacción del cambio**, desde lecturas ya guardadas. Es
una foto del momento: lecturas que lleguen después no la cambian. **No bloquea.** La Parte 5 lee
`coincide = no` para ver si la receta o el personal tenían razón.

### 4.3 La sugerencia de la prefermentación

- El paso `prefermentacion` (o `cold_hold`) declara su **ventana**: metas con rango (temperatura de la
  masa, pH, caída de Brix) y `horasMax`.
- Mientras la corrida está abierta, la ficha del lote y el tablero muestran **«parece que pasó a
  fermentación»** cuando una lectura se sale de la ventana o se pasan las horas. Es una lectura
  calculada, no un registro.
- **Sólo el operario** escribe el `phase_change`, con su doble indicador. Si lo ignora, la sugerencia
  sigue a la vista y, al cerrar la corrida, su `lecturaAlCambiar` deja constancia.

---

## 5. Humedad que sube sin intención (V5)

- Dentro de un paso `drying`, dos lecturas consecutivas de humedad del mismo lote donde la segunda
  supera a la primera en **más que el umbral** → aviso, salvo que entre las dos haya un tratamiento
  declarado (una corrida o intervención con intención de rehumedecer).
- **Umbral:** `subidaToleradaPct` del paso; si no lo declara, **0,5 puntos**, y el aviso dice
  «umbral por defecto».
- Es un aviso calculado al leer (ficha, cola de secado), con las dos lecturas nombradas. No bloquea.
- Las lecturas con distinto método o instrumento se comparan igual, pero el aviso lo dice: puede ser
  el instrumento y no el café.

---

## 6. Bodega

Sobre la compuerta de la Parte 1 (R7), que ya exige el cierre por humedad con medición:

- **Entrar exige la lectura dentro de la banda** del paso de secado (`humedadMinPct`–`humedadMaxPct`):
  por debajo del mínimo también se rechaza, con `humedad_bajo_banda`. Hoy R7 sólo mira el objetivo
  por arriba. Sin banda declarada, rige R7 tal cual.
- **Volver a secado exige la lectura que salió fuera** de la banda: `devolverASecado` pide el id de
  esa medición, posterior a la entrada en bodega, además del motivo de R7.
- Ninguna de las dos acepta una afirmación sin medición.

---

## 7. Los umbrales de los motores (V6)

- Una función única, `umbralPara(lote, variable, momento)`, devuelve `{ valor, origen }` con
  `origen: receta | lote | perfil | ninguno`. **Todos** los motores (pH, Brix, secado, reposo) la
  usan.
- Orden: el valor del lote si lo cambió; el de la meta del **paso** que cubre al lote; el del perfil
  del grado; ninguno.
- Cada veredicto lleva su `origen`, y la pantalla lo muestra («umbral del perfil: la receta no lo
  declara»).
- Así los tres grados sin perfil (semi-lavados, honey) **sí tienen veredicto** cuando su receta
  declara umbrales.
- Un guardia de arquitectura impide leer `PERFILES` fuera de `umbralPara`.

---

## 8. El grado (V7)

- **El grado real** se calcula del primer paso `drying` del lote: el estado del fruto y el % de
  mucílago **con que entró**, que la corrida de secado guarda al empezar (`estadoAlEntrar`,
  `mucilagoAlEntrarPct`; los pide el formulario, con los valores del paso como sugerencia).
  - Sin nada de mucílago → **Lavado**. 100 % retenido → **Honey**. Cereza entera → **Natural**.
    Cualquier otro → **Semi-lavado**, con su porcentaje. (Definiciones de Daniel del 2026-09-19 y
    2026-09-30.)
- **El grado esperado** lo declara la receta.
- Si no coinciden, el proceso queda marcado (`gradoDistintoDelEsperado`) y la ficha lo dice: «la
  receta es Lavado; entró a la cama con mucílago: semi-lavado». No bloquea.
- **Manda el real** para todo lo que hoy lee el grado (motores, reporte, catas). Antes de entrar a
  secado, rige el esperado.
- Los procesos sin receta conservan el grado que se declaró al abrirlos.

---

## 9. Pruebas — cada guardián con su control y su flip-test

| Guardián | Prueba (con control) | Flip-test |
|---|---|---|
| 3.2 venta | 59 días con 60 exigidos → `reposo_de_venta_incompleto`; 60 → pasa; sin umbral → pasa con aviso | quitar la comprobación → cae |
| 3.2 excepción | sin permiso o sin motivo → rechazo; con los dos → libera, escribe la excepción **y** sigue marcado | no escribir la excepción → cae |
| 3.2 puertas | el guardia encuentra ≥ N puertas de venta y todas llaman a la función común | añadir una puerta que no la llame → cae |
| 3.3 muestra | 10 días con 30 → pasa marcada; 30 → pasa sin marca | no marcar → cae |
| 4.2 doble indicador | cambio con una variable fuera → `coincide = no` con la variable nombrada; todo dentro → `si`; sin lecturas → `sin_datos` | calcular fuera de la transacción o con lecturas posteriores → cae la foto |
| 4.1 nada automático | ningún archivo fuera de las acciones de servicio escribe `phase_change`, inicio o fin de corrida | — (guardia de fuente con control positivo: encuentra los N escritores legítimos) |
| 5 humedad | +0,6 sin tratamiento → aviso «por defecto»; +0,4 → nada; +0,6 con tratamiento entre medias → nada; umbral de receta 1,0 y +0,6 → nada | las cuatro ramas |
| 6 bodega | bajo la banda → `humedad_bajo_banda`; en banda → entra; devolver sin medición fuera de banda → rechazo | idem |
| 7 umbrales | honey con receta que declara pH → veredicto con `origen: receta`; sin declararlo → `ninguno`; lavado sin declararlo → `perfil` | leer `PERFILES` directo → cae el guardia |
| 8 grado | receta Lavado, entra con 20 % → semi-lavado marcado; entra con 0 % → Lavado sin marca; 100 % → Honey | derivar del nombre de la receta → cae |

Si una tarea toca TypeScript, su plan manda `npm run build`.

---

## 10. Lo que la 2b no hace

- Equipos, capacidades, litros y kg: **es la 2c**.
- Comparar lo real con lo declarado entre lotes: **es la Parte 5**, que lee `coincide`,
  `tomadaAntesDelReposo`, `gradoDistintoDelEsperado` y las excepciones de venta.
- El desenlace «salida a tratamiento»: **Parte 1**, por la coordinadora.
- Notificaciones fuera de la aplicación: los avisos viven en la ficha, el tablero y la cola.

## 11. Dependencia y orden

Se construye **después de la 2a**. Toca la bodega y la devolución a secado de la Parte 1: el plan
empieza midiendo cómo quedaron en `main`.
