# Recetas del beneficio: Lavado, Natural y Honey — diseño general

**Fecha:** 2026-09-30 · **Estado:** contenido de las recetas y orden de trabajo aprobados por Daniel;
cada parte lleva su propio diseño y su propia aprobación. **Fuente:** la conversación de diseño con
Daniel de ese día. Las decisiones suyas van marcadas como tales; lo demás es propuesta.

## 1. Para qué

Daniel, literal: **«la idea es poder medir para poder reusar recetas y reproducir, replicar, ser
consistente con los resultados».**

Ése es el criterio contra el que se juzga cada parte. Una receta que se carga pero cuyo lote no
queda unido a ella, o cuyo resultado no se puede comparar con el de otro lote de la misma receta,
no cumple aunque la pantalla funcione.

## 2. Reglas generales — decisiones de Daniel, 2026-09-30

1. **Por ahora, tres recetas:** Lavado, Natural y Honey. Las variantes «Lavado 1/4/6/12/24 h» y el
   resto hasta unas diez quedan para después.
2. **La receta sugiere; el lote decide.** La receta trae valores por defecto, el lote puede cambiarlos
   y cada cambio deja rastro de quién y cuándo. Es el patrón que ya sigue `LotProcess.targetMoisturePct`.
3. **La receta lleva pasos en orden.** Hoy `ProcessRecipe` no tiene pasos: sólo fases
   (`ProcessRecipePhase`) y metas (`ProcessTarget`).
4. **La espera antes de despulpar** —de la cosecha a que entra a proceso, la «oxidación»— **sólo se
   registra**; la receta no la controla.
5. **Las tres son plantilla para todas las organizaciones** (`ProcessRecipe.organizationId` nulo).
6. **Al abrir el proceso, el lote recibe el plan completo** de pasos con sus valores (Parte 4).

### 2.1 Definiciones que ya dio Daniel y que este diseño usa

- **Lavado** (2026-09-19): va a la cama de secado **sin nada de mucílago**. Si llega con mucílago es
  semi-lavado. Esta definición todavía no está escrita en `docs/beneficio/`.
- **Honey** (2026-09-30): **100 % del mucílago retenido**. Con menos es semi-lavado. Encaja con el
  catálogo `grado_proceso`, que ya separa `Honey` de `Semi Wash 50%` y `Semi Wash 75%`: basta con
  que el valor `Honey` lleve esa definición escrita.
- **Las horas de un «Lavado N h»** (2026-09-30): son horas **ya despulpado**, en reposo en su propio
  mucílago, mosto y jugos, antes de lavar. Van de 1–2 h a 48 h con mosto propio, y **hasta 200 h** con
  inóculo: levadura atomizada en bolsa anaeróbica o en cama africana, o el mosto de otro fermento de
  cereza con buen perfil. **No** son horas de cereza entera.
- **Fiebre** (2026-09-30): la cereza entera reposa, de horas a días, en los mismos sacos de cosecha
  **sin sellar** y se calienta. Es prefermentativo por intención, y el sitio y el tiempo influyen en
  el resultado.

## 3. Las tres recetas

Todo valor es **por defecto**: el lote lo puede cambiar (regla 2).

### 3.1 Lavado

| Paso | Lo que sugiere la receta |
|---|---|
| Recepción | Brix aceptado **18–24 °Bx**. Se registran peso, densidad y aroma. |
| Clasificación | **No hay**: la cereza llega seleccionada. |
| Espera antes de despulpar | Sólo se registra. |
| Despulpado | — |
| Reposo en su mosto | **12 h**, **tanque abierto** (aeróbico), espontáneo, mosto propio. **pH y Brix** al inicio, **cada 6 h** y al final. |
| Lavado | Hasta quitar **todo** el mucílago. A mano o mecánico **se elige en el lote**: no hay valor por defecto. |
| Secado | Hasta **10,0–11,5 %**, **volteo cada 4 h**. |
| Reposo en bodega | Muestra a los 30 días y venta a los 60. Es lo que ya usa `PERFILES.WASHED_STANDARD`, tomado de lo que Daniel dijo el 2026-09-16, marcado `[PROVISIONAL]`. |

**No se pone un pH objetivo con número.** El motor ya juzga el lavado con umbrales provisionales
(óptimo 3,8–4,5), y escribir otro número en la receta sería inventarlo. La receta declara **el ritmo**
de medición, no la cifra.

### 3.2 Natural

| Paso | Lo que sugiere la receta |
|---|---|
| Recepción | **La receta no pide Brix**: se registra, sin requisito. |
| Reposo en cereza («fiebre») | **Opcional.** Lo típico son **24 h**; según el día va del mismo día (4–6 h de selección) a 20–24 h y hasta 48 h. Recipiente por defecto: **sacos de cosecha sin sellar**. **pH y Brix** al inicio y al final. |
| Secado | Hasta **11,0–12,0 %**; el corte suele hacerse cerca de 11,5 % tras reposar y homogeneizar la masa. **Volteo cada 1 h.** |
| Reposo en bodega | Muestra a los 30 días y venta a los 45 (`PERFILES.NATURAL`, `[PROVISIONAL]`). Daniel dijo el 2026-09-16: «natural Catuaí óptimo entre 45 y 60». |

### 3.3 Honey (100 % del mucílago)

| Paso | Lo que sugiere la receta |
|---|---|
| Recepción | **La receta no pide Brix.** |
| Opcionales, **en este orden** | **Fiebre** en sacos → **fermentación anaeróbica en cereza entera** → despulpado → **reposo en su mucílago**. También puede no llevar ninguno. **pH y Brix** al inicio y al final de cualquier reposo. |
| Despulpado | Sin quitar mucílago. |
| Secado | Hasta **11,0–12,0 %**. **Volteo cada 1 h.** |

### 3.4 La tabla de humedad de Daniel, con su razón técnica

| Proceso | Humedad al cortar el secado | Razón que dio |
|---|---|---|
| Lavado | 10,0–11,5 % | Sin azúcares del mucílago por fuera, es el más estable; rango estrecho para no sobresecar. |
| Honey | 11,0–12,0 % | Conserva mucílago y es higroscópico; se corta cerca de 11,5–12 % porque sigue asentándose en bodega. |
| Natural | 11,0–12,0 % | El fruto entero se seca por fuera antes que el embrión; se corta cerca de 11,5 % tras reposar y homogeneizar. |

**Señalado, no corregido en silencio:** `docs/beneficio/13_drying_moisture.md` §2 cierra la banda en
11,5 % porque cerca del 12 % el pergamino suele tener la actividad de agua alta. El mismo documento
dice (ADR-181) que **los objetivos son de la receta**, así que manda la tabla de Daniel. Al cargar las
recetas (Parte 3) se anota en el `13` que natural y honey llegan a 12,0 % por decisión suya.

## 4. Lo que hay hoy en el código

Verificado el 2026-09-30 sobre `origin/main` = `629317e6`. Hubo dos lecturas independientes y cinco
verificadores que intentaron refutar cada afirmación: de 25, **21 se confirmaron**, 4 se confirmaron
con matices y ninguna cayó. Codex, como segunda opinión con otro modelo, contestó lo mismo a las
cinco preguntas clave.

- **Las corridas no quedan unidas al proceso.** Sólo `colgarCorrida` (`lib/traceability/lotProcess.ts`)
  escribe `lotProcessId` en una corrida, y nada fuera de las pruebas la llama.
- **El proceso vive en un lote y el trabajo sigue en sus hijos.** El proceso se abre sobre el lote
  aceptado (decisión del 2026-09-19). Terminar una fermentación crea un lote nuevo, y el secado ocurre
  sobre ese hijo. **La compuerta de bodega** (`exigeSecadoTerminado`) sólo mira el proceso del propio
  lote, así que **no se aplica al pergamino**.
- **La receta no puede escribir fases desde la pantalla, y una v2 no las conserva.** Hoy da igual,
  porque ninguna receta tiene fases. En cuanto un guion cargue recetas con fases, publicar una v2
  desde la pantalla las borraría.
- **El reporte por proceso no sirve para medir consistencia.** Agrupa por **nombre** de receta, no
  por versión. No lee corridas ni duraciones. Su puntaje de taza sólo sale de muestras **del propio
  lote** del proceso, nunca del verde descendiente. Y cuenta dos veces los puntajes de un lote con
  dos procesos.
- **No hay ninguna receta cargada.** Ningún guion, migración ni semilla inserta `ProcessRecipe`.

## 5. Las partes y su orden — decisión de Daniel

**1 → 2 → 3 → Re-importar → 5 → 4.** Cada una con su diseño, su plan y su PR.

- **Parte 1 — La base: el proceso cubre al lote.** Las corridas se unen solas al proceso, y no hay
   corrida sin proceso. Las compuertas, la ficha, el tablero, la lista de catas y la bodega miran el
   proceso que cubre al lote. Dividir reparte el lote entero, nunca con una corrida en curso, y crea
   un proceso por parte. En bodega no se reprocesa. Una v2 conserva las fases. Diseño:
   `2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md`.
- **Parte 2 — La receta con pasos.** Pasos en orden con valores por defecto: horas, recipiente, oxígeno,
   fuente microbiana, medio, ritmo de medición, volteo y humedad. El grado se ata a la receta. Se
   añaden al vocabulario cama africana, sacos de cosecha y atomizado, y la definición de Honey. Aquí
   entra también **la pantalla de fases**, que la Parte 1 deja fuera a propósito.
- **Parte 3 — Las tres recetas cargadas**, como plantilla para todas las organizaciones, con un guion que por
   defecto simula y que Daniel corre con `--apply`.
- **Re-importar.** Daniel decidió **rehacer el histórico** con un import que cumpla las reglas, en vez
   de dejar corridas viejas «sin proceso». Primero va una copia verificada (`backup:db` +
   `backup:verify`) y un **censo tabla por tabla**; después Daniel decide qué se borra, con los números
   delante. El import pasa por los mismos servicios que la aplicación: abrir proceso, empezar,
   terminar, cerrar con humedad y bodega. Así demuestra que las reglas se cumplen. Las catas y las
   muestras se cuidan aparte, porque son el resultado que se quiere comparar.
- **Parte 5 — Comparar lotes de la misma receta.** El reporte agrupa por **versión** y muestra las horas reales
   contra la receta, la humedad, y el puntaje de taza **del verde descendiente**, sin contarlo dos
   veces. Muestra también cuánto varía cada medida entre lotes: n, mínimo, máximo y dispersión.
- **Parte 4 — El plan del lote**, que va al final. Al abrir el proceso, el lote recibe la lista de pasos
   con sus valores; el operario ve qué sigue, y cambiar un valor deja rastro.

## 6. Señalado durante el diseño, sin resolver aquí

- **`13_drying_moisture.md` y la tabla de humedad** (§3.4): se anota en la Parte 3.
- **Brix de recepción:** Daniel eligió 18–24 °Bx para el lavado, que coincide con
  `11_brix_kinetics.md` §1. El 2026-09-21 había dicho que 24–30 también es óptimo para el **pedido**;
  si se construye el pedido con rango de Brix, sólo hay que preguntarle eso.
- **Divisiones de ensayo** (`20_modelo_ciclo_completo.md` §1.4): una división hecha como ensayo A/B
  tiene que declarar la variable bajo estudio y la rama de control. **No existe en el código.** Es
  justo lo que hace comparable PE-79-A contra PE-79-B. Entra con **la pantalla de dividir y declarar
  ensayos**, que no tiene sitio todavía en el orden de las partes. Con ella va también **dividir un
  secado a mitad de camino**. El ejemplo de Daniel es comparar capas de 1 cm contra 2 cm o más de
  cereza por bandeja. Hasta entonces ese ensayo se hace dividiendo al empezar el secado, que
  funciona desde la Parte 1.
- **Los días de reposo avisan y no bloquean**, como decidió Daniel el 2026-09-16 y confirmó el
  2026-09-30. Cuando la receta lleve sus días (ADR-181 punto 20), siguen siendo sugerencia.
- **Los motores de veredicto juzgan por grado y no por receta.** `desdeElLote.ts` elige `PERFILES`
  por `grado_proceso`, y ADR-181 dice que los umbrales salen de la receta. Dos lotes de la misma
  receta se juzgan por su grado. Va en la Parte 2 o en la 5.
- **`recordStageChangeFormAction`** (`app/actions/traceability.ts`) es una acción exportada que ningún
  componente usa y cuyo comentario describe divisiones y fusiones que no hace. Se señala; no se borra
  aquí.
- **`SESSION_STATE.md` líneas 268–279** dicen que nada condiciona el paso a bodega y que
  `moveLotToStorage` no lee ninguna medición. **Ya es falso**: `storage.ts` llama a
  `exigeSecadoTerminado`. Editar `SESSION_STATE.md` pasa por la sesión coordinadora.
- **El conteo «usada por» de la página de receta** sólo cuenta fermentaciones. Una versión usada sólo
  en procesos naturales parece sin uso.
