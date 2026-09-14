# Revisión Técnica del Paquete v2.x → v3.0
## Qué se encontró, qué se cambió y por qué

Documento de traspaso. No es normativo — no lo lea Claude Code como especificación, sino como justificación de los cambios.

---

## A. Defectos que rompen ejecución

| # | Documento | Hallazgo | Impacto |
| :-- | :--- | :--- | :--- |
| A1 | Brix v2.5 | **La alerta de estancamiento de 12 h no existía.** `BrixKineticAnalyzer` calculaba `velocity` y la devolvía sin evaluarla nunca. No había ninguna rama que emitiera la alerta descrita en la §1 del documento y en `CLAUDE.md` §2. | Protección documentada y ausente. Un lector asume que existe; en producción nunca se dispara. El defecto más grave del paquete. |
| A2 | Brix v2.5 | `(initial - current) / initial` sin guarda de cero. | `ZeroDivisionError` derriba la ingesta si el refractómetro entra sin cerar. |
| A3 | Subproductos v2.0 | `prime_ripe / total_cherry_kg` sin guarda; `total_cherry_kg = 0` posible. | Misma clase de falla. |
| A4 | pH v2.5 | `raise ValueError` ante lectura fuera de rango físico. | Un electrodo sucio derriba el *pipeline* completo en lugar de marcar una lectura. |
| A5 | Brix v2.5 | Contrato de retorno inconsistente: `velocity_bx_hr` presente en `DATA_COLLECTION`, ausente en `TERMINATION_READY`. | `KeyError` en el consumidor, precisamente en el evento más importante del ciclo. |

## B. Defectos lógicos y de modelado

| # | Documento | Hallazgo | Impacto |
| :-- | :--- | :--- | :--- |
| B1 | Subproductos v2.0 | **Doble conteo de pulpa.** Una sola ecuación de conservación sumaba categorías de selección de cereza entera junto a `pulp_kg`, que es el 40–45 % de la masa de las cerezas ya contadas en `prime_ripe_kg`. | Un registro correcto **falla**. Para que pase, el operador debe subdeclarar `prime_ripe`, lo que corrompe el `purity_index`. El índice termina midiendo cuánto tuvo que mentir el operador. |
| B2 | pH v2.5 | **Banda 3.50–3.80 sin alerta.** Caía en el `return` final como `MONITORING`. | El sistema guarda silencio en la única ventana donde el lote todavía puede salvarse. |
| B3 | Brix v2.5 | Velocidad calculada como **promedio de toda la fermentación**. | Un lote que consumió rápido y lleva 13 h detenido exhibe velocidad saludable. La métrica enmascara exactamente la condición que se decía querer detectar. |
| B4 | Brix v2.5 | Terminación decidida comparando solo primera contra última lectura. | Una lectura atípica (prisma sucio, muestra diluida) declara `TERMINATION_READY` y manda el lote a lavado antes de tiempo. |
| B5 | pH v2.5 | Frontera 4.50 ambigua: satisfacía «ventana óptima» y «estancado» a la vez; el orden de los `if` decidía en silencio. | Comportamiento dependiente del orden de evaluación, no de la especificación. |
| B6 | Subproductos v2.0 | Tolerancia absoluta de 0.05 kg. | 0.001 % de precisión sobre 5 000 kg — inalcanzable. Y la conservación perfecta es físicamente falsa: la cereza absorbe agua en el canal de flote. |
| B7 | Subproductos v2.0 | `raise ValueError` ante desbalance de campo. | Descarta la captura completa. A las 5 am bajo lluvia, el dato no se registra nunca. |
| B8 | Subproductos v2.0 | `.get("prime_ripe_kg", 0.0)`. | Un campo faltante produce `purity_index = 0` y etiqueta `COMMERCIAL_VOLUME` a un lote potencialmente premium, sin error visible. |
| B9 | Brix v2.5 | Prompt de integración: cualquier ascenso de °Bx = `DATA_INTEGRITY_VIOLATION`. | Biológicamente falso. La solubilización del mucílago eleva legítimamente el °Bx del licor al arranque. Genera anomalías falsas en cada lote. |
| B10 | Subproductos v2.0 | `routing_manifest` devolvía frases en español. | Inutilizable como identificador aguas abajo; viola la separación de i18n. |
| B11 | Los tres | Umbrales globales únicos. | Sus protocolos no convencionales — **CryoBloom en particular** — tienen cinética deliberadamente distinta. Un reposo frío pre-fermentativo dispara `STALLED_ROT_HAZARD` continuamente. Ver C7. |

## C. Vacíos estructurales

| # | Hallazgo | Qué se agregó |
| :-- | :--- | :--- |
| C1 | Sin especificación de secado, pese a que `CLAUDE.md` §1 lo exige explícitamente y lista `Humedad` entre las métricas de campo. | `docs/13_drying_moisture.md` |
| C2 | Sin modelo de calibración de instrumentos. Alertas construidas sobre lecturas no calibradas producen decisiones seguras de aspecto profesional y contenido falso. | `docs/02_calibration.md` |
| C3 | Sin máquina de estados del lote. Cada documento cubría un tramo; nada definía el todo ni qué motor aplica en qué momento. | `docs/01_lot_lifecycle.md` |
| C4 | Sin convención de unidades ni de zona horaria. Panamá es UTC−5 sin DST; capturar en local y comparar en UTC rompe silenciosamente las series. | `docs/00_conventions.md` §1–2 |
| C5 | Sin definición del punto de muestreo de °Bx. Licor de tanque, mucílago exprimido y pulpa dan valores distintos y no convertibles. | `docs/00_conventions.md` §5, `docs/11` §2 |
| C6 | Sin histéresis. Una lectura ordenaba lavar un lote entero. | `docs/00_conventions.md` §9 |
| C7 | Sin perfiles de protocolo. | `ProtocolProfile`, incluido `COLD_HOLD_PREFERMENT` para CryoBloom con `stall_suspended_until_hours`. |
| C8 | Sin `temperature_c` obligatoria en fermentación. Un lote a 18 °C y uno a 28 °C no son comparables al mismo pH; sin temperatura, «estancado» e «infectado» son indistinguibles de «frío». | `docs/02` §4 |
| C9 | Sin normalización a materia seca. Un lote al 45 % de humedad aparenta rendir mucho más que el mismo al 11 %. | `docs/12` §3 |
| C10 | Sin criterios de aceptación ejecutables, pese a que `CLAUDE.md` invocaba `pytest`. | `fixtures/` — 43 vectores y la suite. |
| C11 | Sin regla de autonomía. Nada impedía que un motor ordenara una acción irreversible. | `CLAUDE.md` §3 |
| C12 | Sin verificación cruzada pH↔Brix ni humedad↔masa. La segunda es la única detección automática de endurecimiento superficial. | `docs/10` §3, `docs/13` §3 |

## D. Puntos de dominio que requieren su decisión

Estos no los resolví: dependen de su experiencia y de sus equipos.

1. **Perfil térmico de cáscara — 75–80 °C durante 12 h.** Un choque térmico es por definición breve; su función es arrestar rápidamente la actividad microbiana. Sostener 75–80 °C durante doce horas no es un choque sino un secado prolongado a alta temperatura, con riesgo previsible de pardeamiento, sabor cocido y pérdida de las notas frutales que dan valor al producto. Quedó implementado como parámetro configurable marcado `unvalidated=True`, emitiendo `CASCARA_PROFILE_UNVALIDATED` en cada lote hasta que registre un ensayo. **No lo borré — lo señalé.** Si el valor viene de un ensayo suyo que yo desconozco, quítele la marca.

2. **Piso de terminación en 14.0 °Bx.** Es simultáneamente el borde inferior de la ventana segura (14–16) y el disparador de parada, de modo que el lote se detiene en el extremo agresivo del rango. Sugerí `brix_floor = 15.0` para `WASHED_STANDARD`, pero es su criterio de taza.

3. **Vinazos anaeróbicos «< 12 h».** El viraje a avinagrado es función de temperatura tanto como de duración: 12 h a 30 °C y 12 h a 18 °C son procesos distintos. Propongo expresar el límite en grados-hora. Falta su umbral.

4. **Reposo mínimo de 30 días** y la ventana de 4 h entre despulpado y estabilización de cáscara — puse valores de práctica general marcados `[PROVISIONAL]`.

5. **Rangos de rendimiento plausible** (§3 de `docs/12`). Son de industria; calíbrelos contra el histórico de Las Nubes y de sus fincas socias, que es donde tendrán valor real como detector de báscula descalibrada.

Todo parámetro marcado `[PROVISIONAL]` está cargado como configuración por defecto, nunca como constante. Ninguno bloquea el desarrollo.

## E. Segunda pasada de verificación

El borrador se auditó contra sí mismo antes de entregarlo. Se corrigieron 30 defectos propios; los de mayor peso:

- **Faltaba el contrato autoritativo.** Trece nombres que las pruebas usaban no estaban declarados en ningún documento (`DryingMonitor`, `PROFILES`, `RoutingTarget`, `LotState`, los campos de `IntakeAssessment`…). Se agregó `docs/03_public_api.md`, que ahora es la única fuente de nombres públicos.
- **La regla de estancamiento de Brix se cortocircuitaba.** Tal como estaba escrita, una ventana sin lectura comparable devolvía un estado terminal, dejando al motor incapaz de emitir `TERMINATION_READY` en casi cualquier cadencia real de muestreo. Cuatro vectores eran inalcanzables. Ahora la no-evaluabilidad es una advertencia y la evaluación continúa.
- **La ventana de confirmación de 15 min – 4 h volvía imposible confirmar cualquier alerta de secado**, cuya cadencia natural es diaria. Se definió una ventana por motor.
- **El secado no tenía objeto de parámetros**, de modo que sus once umbrales solo podían existir como literales — en violación de la regla que el propio `CLAUDE.md` impone. Se agregó `DryingProfile`.
- **Cuatro de los cinco perfiles de protocolo estaban descritos solo en prosa.** Los dos vectores de CryoBloom no podían pasar porque `stall_suspended_until_hours` no tenía valor. Ahora los cinco están tabulados.
- **La banda de pH 7.00–8.00 no pertenecía a ninguna banda**, contradiciendo la cobertura total que el documento afirmaba. Se agregó `SUSPECT_DILUTION` para 6.50–8.00, que además es más honesta: el mucílago fresco no supera pH ~6.0, así que un valor mayor es sospecha de instrumento, no un estado de fermentación.
- **Error terminológico de dominio:** llamé «grano desmucilaginado» a la salida de la despulpadora. *Desmucilaginado* significa lo contrario — que el mucílago ya fue removido. El término correcto es **café despulpado en baba**. Es exactamente la confusión que ese párrafo existía para prevenir.
- **La banda objetivo de secado 10–12 % no era coherente con su propio criterio de actividad de agua**: cerca del 12 % el pergamino se sitúa en aw 0.62–0.68 y nunca podría co-satisfacer aw ≤ 0.60. Se cerró en 11.5 %.
- **La prueba de umbrales literales usaba una expresión regular** que dejaba pasar las grafías canónicas del propio paquete (`3.50`, `4.50`, `14.00`) y marcaba falsos positivos en docstrings. Se reescribió recorriendo el AST y comparando contra `DEFAULT_PROFILE_VALUES`.
- El código de referencia de los documentos llevaba comentarios en español, de modo que copiarlo verbatim reprobaba la prueba de i18n del propio paquete. Traducidos.
- La media de secado quedó definida como **media móvil de 24 h** (no de día calendario, que da un resultado distinto), y la dispersión como **rango**, no desviación estándar.
- Se agregaron cuatro vectores (47 en total) para las reglas nuevas: banda de dilución, ventana de estancamiento no evaluable, serie corta sin mediana y balance de Etapa C.

## F. Corrección hecha durante la redacción

Al verificar la aritmética de los vectores detecté que había confundido la salida de despulpado con el pergamino lavado. Son etapas distintas: el grano desmucilaginado húmedo es 55–62 % de la cereza despulpada, mientras que el pergamino lavado (40–46 % de la cereza) solo aparece tras el lavado. Se separó la **Etapa C — Lavado** y se corrigieron los rangos y los vectores afectados. Todos los balances están verificados aritméticamente.
