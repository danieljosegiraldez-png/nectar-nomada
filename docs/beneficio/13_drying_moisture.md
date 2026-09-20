# 13 — Secado y Humedad
**Estado:** Normativo · **Versión:** 3.1 · **NUEVO — no existía en el paquete v2.x**
**Depende de:** `00_conventions.md`, `01_lot_lifecycle.md`, `02_calibration.md`

## 1. Por qué existe este documento

El `CLAUDE.md` original (§1) exigía conservar historial en series de tiempo «para lotes en fermentación y secado», y listaba `Humedad` entre las métricas de campo que deben pasar por la capa de saneamiento. Ninguna de las tres especificaciones v2.x definía una sola regla de humedad: el motor de secado estaba mandatado y sin especificar.

El vacío importa más de lo que parece: el secado es donde se destruye la mayor cantidad de valor en el beneficio. Una fermentación perfecta se pierde en una cama de secado mal manejada, y a diferencia de la fermentación —donde el error se manifiesta en horas— el daño del secado aparece semanas después, en taza, cuando ya no es atribuible.

## 2. Parámetros de control `[PROVISIONAL — validar contra el SOP de cada finca]`

> **Decisión de Daniel, 2026-09-19 (ADR-180 §16–17).** Los objetivos son de la **receta**, sujetos a
> la capacidad del beneficio y al clima. El secado es un **ambiente compartido**: ante un retraso, primero
> acciones sobre el lote (mover bandeja, abanico); si se propone tocar el cuarto, se muestra el efecto
> en cada lote antes de decidir. El fin se mide con el **AgraTronix Coffee Tester 08150** en escala
> pergamino (±0,5 % «in normal moisture range for stored grain», según la ficha); **no mide actividad de agua**, así que `TARGET_REACHED` se da por humedad y queda
> marcado «sin actividad de agua medida» hasta que haya medidor.


Todos residen en `DryingProfile` (`00_conventions.md` §8). Ninguno se codifica como literal.

| Parámetro | Valor | Estado emitido |
| :--- | :--- | :--- |
| Humedad objetivo (pergamino) | 10.0 – 11.5 % b.h. | `TARGET_REACHED` |
| Punto de corte recomendado | 11.0 % b.h. | — |
| Sobresecado | < 9.5 % | `OVER_DRIED` — pérdida de peso vendible y fragilidad al trillar |
| Actividad de agua para almacenamiento | ≤ 0.60 | criterio de estabilidad real |

La banda objetivo se cierra en **11.5 %**, no en 12.0 %. Cerca del 12 % el pergamino se sitúa típicamente en aw 0.62–0.68, de modo que la mitad superior de una banda 10–12 % prácticamente nunca puede co-satisfacer el criterio de actividad de agua: la banda quedaría escrita de forma engañosa. Los contratos de café verde suelen aceptar hasta 12.5 %, pero ese es un límite comercial, no el criterio de estabilidad microbiana que aquí gobierna.
| Temperatura máxima de grano (secado mecánico) | 40 °C | `BEAN_TEMP_EXCEEDED` |
| Tasa máxima de descenso, fase final | 2.0 puntos porcentuales / día | `RATE_TOO_FAST` |
| Meseta peligrosa | humedad > 20 % sin descenso ≥ 24 h | `STALLED_MOLD_HAZARD` |
| Reposo mínimo en pergamino antes de trillar | 30 días | transición `RESTING → MILLED` |

## 3. Reglas de cinética

**El secado no es lineal y no debe evaluarse con un único umbral de tasa.**

- **Fase de tasa constante** (aprox. > 25 % humedad): el agua libre migra sin resistencia. Tasas altas son normales y no deben alertar.
- **Fase de tasa decreciente** (aprox. < 25 %): el agua ligada migra desde el interior del grano. Un secado forzado aquí produce **endurecimiento superficial** (*case hardening*): la superficie sella, el núcleo queda húmedo, el medidor de humedad lee un valor bajo y falso, y el lote desarrolla moho en bodega semanas después.
- Por lo tanto: **el límite de tasa se aplica únicamente por debajo de `falling_rate_threshold_pct` (25 %)**. Aplicarlo en la fase constante genera alertas falsas continuas; no aplicarlo en la fase decreciente deja pasar el defecto más caro del proceso.

**Regla de reposo nocturno.** El pergamino en patio recupera humedad de noche; la lectura de la mañana suele ser mayor que la de la tarde anterior. Un ascenso de humedad entre el atardecer y el amanecer es **normal y esperado**, nunca una violación de integridad.

**Definición exacta de la tasa.** Se compara la **media móvil de las últimas `rate_window_hours` (24 h)** contra la media móvil de las 24 h inmediatamente anteriores, y la diferencia se normaliza a puntos porcentuales por día. No son medias de día calendario —que agruparían de forma distinta según la hora de la primera lectura— ni diferencias punto a punto. Cuando la serie contiene exactamente dos lecturas separadas por 24 h o más, cada ventana contiene una sola lectura y el cálculo se reduce a la diferencia entre ambas; esto es correcto y está permitido.

**Verificación cruzada con masa.** El descenso de humedad y la pérdida de masa deben ser mutuamente consistentes:

```
materia_seca      = masa_inicial * (1 - h_inicial/100)        # constante por definición
masa_actual_esperada = materia_seca / (1 - h_actual/100)
```

La cantidad calculada es la **masa húmeda actual esperada**, no la materia seca — la materia seca es el numerador y no cambia durante el secado. Nombrarla mal invita a comparar una masa húmeda contra una variable de materia seca.

Una divergencia mayor a `mass_consistency_tolerance_pct` (3 %) `[PROVISIONAL]` entre la masa pesada y la esperada indica endurecimiento superficial (el medidor miente) o pérdida física de producto. Emite `MOISTURE_MASS_INCONSISTENT`, severidad `WARNING`. Esta verificación es la única defensa automática contra un medidor engañado por un grano sellado.

## 4. Muestreo

- El medidor de humedad lee sobre **pergamino**, no sobre cereza ni sobre café verde. Escala distinta, no intercambiable.
- Mínimo tres puntos por cama (dos extremos y centro, a profundidad media) por lectura. Se persisten los tres y se evalúa la **media**. La **dispersión se define como el rango, `max − min`** —no como desviación estándar, que para tres puntos daría un valor distinto y ambiguo—; si supera `max_dispersion_pp` (1.5 pp) se emite `UNEVEN_DRYING`.
- `sample_point = PARCHMENT_BED`; la regla de comparabilidad de 00 §5 aplica.
- La actividad de agua se mide sobre muestra equilibrada, no recién salida del sol.

## 5. Contrato de retorno

```python
@dataclass(frozen=True)
class DryingAssessment:
    status: str                        # DATA_INSUFFICIENT | DRYING_NORMAL | RATE_TOO_FAST
                                       # | STALLED_MOLD_HAZARD | UNEVEN_DRYING
                                       # | TARGET_REACHED | OVER_DRIED | BEAN_TEMP_EXCEEDED
    severity: Severity
    alert: Optional[Alert]
    current_moisture_pct: Optional[float]
    water_activity: Optional[float]
    daily_rate_pp: Optional[float]     # puntos porcentuales por día
    phase: Optional[str]               # CONSTANT_RATE | FALLING_RATE
    dispersion_pp: Optional[float]
    days_elapsed: float                # desde drying_started_at, no desde fermentación
    mass_consistency_delta_pct: Optional[float]
    confidence: DataConfidence
    readings_used: int
    warnings: list[str]
```

## 6. Prompt de integración para Claude Code

```text
SYSTEM PROMPT: DRYING & MOISTURE MONITOR — v3.0

FASES
- Determinar la fase (CONSTANT_RATE / FALLING_RATE) ANTES de evaluar la tasa.
  El limite de tasa se aplica solo en FALLING_RATE (< 25 % humedad).

VENTANAS
- La tasa se calcula sobre medias diarias moviles de 24 h, nunca entre dos
  lecturas consecutivas. Un ascenso nocturno de humedad es esperado y NO debe
  emitir DATA_INTEGRITY_VIOLATION.

VERIFICACION CRUZADA
- Implementar la consistencia humedad-masa. Es la unica deteccion automatica
  de case hardening; sin ella el sistema confia en un medidor que un grano
  sellado enganya.

RELOJ
- days_elapsed cuenta desde drying_started_at (transicion a DRYING), nunca
  desde el inicio de fermentacion. Ver 01_lot_lifecycle.md seccion 4.

MUESTREO
- Minimo 3 puntos por cama y lectura; persistir los tres, evaluar la media,
  emitir UNEVEN_DRYING si la dispersion supera 1.5 pp.
- Rechazar lecturas de humedad cuyo sample_point no sea PARCHMENT_BED.

ALMACENAMIENTO
- water_activity, no solo humedad porcentual, gobierna la aptitud para bodega.
  TARGET_REACHED exige ambos criterios.
```
