# 11 — Cinética de Azúcares (°Brix)
**Estado:** Normativo · **Versión:** 3.1 · **Reemplaza:** v2.5
**Depende de:** `00_conventions.md`, `01_lot_lifecycle.md`, `02_calibration.md`

## 1. Matriz de parámetros — perfil `WASHED_STANDARD`

> **Decisión de Daniel, 2026-09-19 (ADR-181) — manda sobre este documento.** El Brix tiene objetivo
> de receta pero es **secundario al pH**: con mucílago se liberan azúcares y sólidos y la lectura
> engaña («secundaria a pH en casi todos los casos relacionados a fermentación», en sus palabras). Si
> una fase puede declararlo criterio suficiente, y cómo, queda pendiente. Se mide con hidrómetro o refractómetro, configurable; una serie **puede**
> mezclarlos **avisando** de que lo hace, y cada lectura traza instrumento, quién midió y si estaba
> verificado. El rango de entrada de cada cereza **se aprende del historial**: el
> 18–24 / <16 de esta tabla no tiene fuente académica y queda como plantilla. Ningún fabricante ni
> estudio encontrado publica umbrales de °Brix de fermentación.


| Parámetro | Rango / regla | Estado emitido |
| :--- | :--- | :--- |
| Madurez de entrada óptima | 18.0 – 24.0 °Bx | `INTAKE_OPTIMAL` |
| Riesgo de inmadurez | < 16.0 °Bx | `INTAKE_UNDERRIPE` — falta de combustible metabólico; el descenso de pH no arrancará |
| Punto de finalización seguro | caída ≥ `brix_target_drop_pct` (35 %) **o** valor ≤ `brix_floor` | `TERMINATION_READY` |
| Sobreextracción | < 13.0 °Bx `[PROVISIONAL]` | `SUGAR_DEPLETED` — riesgo de ataque al grano |

`brix_floor` es **15.0** para `WASHED_STANDARD`, no 14.0. La v2.5 usaba 14.0, que es simultáneamente el borde inferior de la ventana segura 14–16 y el disparador de parada: el lote se detenía en el extremo más agresivo del rango. Ver §5.
| Estancamiento | Δ°Bx < 0.3 sostenido ≥ 12 h en ventana móvil | `STAGNATION_HAZARD` |
| Rango físico | 0.0 – 32.0 °Bx | fuera → `SENSOR_FAULT` |

## 2. Definición de la matriz de muestreo (faltaba en v2.5)

Un °Bx no significa nada sin decir **de qué se midió**. La v2.5 especificaba umbrales sin definir el punto de muestreo, lo que hace que las series de dos operadores distintos sean incomparables aunque ambos hayan trabajado bien.

- El punto de muestreo canónico para fermentación en tanque es **`TANK_LIQUID_MID`**: licor libre a media altura, tras homogeneizar suavemente.
- `MUCILAGE_PRESSED` y `CHERRY_PULP` producen valores sistemáticamente distintos. Son válidos pero **constituyen series separadas**.
- El motor rechaza con `MIXED_SAMPLE_POINTS` cualquier serie que mezcle puntos de muestreo. No intenta normalizar entre ellos: no existe factor de conversión defendible.
- Volumen mínimo de muestra y enjuague del prisma entre lecturas: definir en el SOP de campo y referenciar aquí.

## 3. Velocidad: ventana móvil, no promedio de vida

**Este es el defecto funcional más grave de la v2.5.** El cálculo era:

```python
velocity = (initial - current) / hours          # v2.5
```

Un promedio sobre toda la fermentación. Un lote que consumió azúcares rápido las primeras 8 h y lleva 12 h completamente detenido sigue exhibiendo una velocidad acumulada saludable. **El promedio de vida enmascara exactamente la condición que el documento decía querer detectar.**

v3.0 reporta ambas y evalúa sobre la reciente:

- `velocity_recent_bx_h` — pendiente sobre las últimas 6 h `[PROVISIONAL]`. Es la métrica de decisión.
- `velocity_cumulative_bx_h` — pendiente desde el inicio. Es contexto informativo.

## 4. Detección de estancamiento — *la alerta que la v2.5 prometía y nunca implementaba*

La sección 1 de la v2.5 y la sección 2 de `CLAUDE.md` ambas especifican una alerta de estancamiento horizontal a 12 h. `BrixKineticAnalyzer` **no contenía ninguna rama que la emitiera**. Calculaba `velocity` y la devolvía sin evaluarla nunca. Un lector del documento asumiría que la protección existe; en ejecución, nunca se dispara.

Regla implementada en v3.0:

1. Localizar la lectura más cercana a `now − brix_stall_window_hours`, con tolerancia de ±90 min.
2. Si no existe tal lectura, **la regla no es evaluable y la evaluación continúa** hacia las demás ramas, añadiendo `STALL_NOT_EVALUABLE` a las advertencias. Es el punto que más fácilmente se implementa mal: hacer de la no-evaluabilidad un estado terminal deja al motor incapaz de emitir `TERMINATION_READY` en cualquier lote cuya cadencia de muestreo no coincida con la ventana, que son casi todos.
3. Si `|brix_actual − brix_ventana| < brix_noise_floor` (0.3 °Bx, por debajo de la resolución práctica del refractómetro) → `STAGNATION_HAZARD`, severidad `CRITICAL`, sujeta a confirmación.
4. La regla queda **inhibida** mientras `hours_elapsed <= stall_suspended_until_hours` (perfil `COLD_HOLD_PREFERMENT` / CryoBloom).

## 5. Terminación robusta a valores atípicos

La v2.5 decidía terminación comparando únicamente `sorted_data[0]` con `sorted_data[-1]`. Una sola lectura errónea al final —prisma sucio, muestra diluida con agua de enjuague— declara `TERMINATION_READY` y envía el lote a lavado antes de tiempo. Correcciones:

- `current_brix` = **mediana de las últimas 3 lecturas por conteo**, no la última lectura cruda; `initial_brix` = mediana de las 3 primeras.
- La mediana se toma **por conteo, no por ventana temporal**. Una ventana de pocas horas colapsa a dos lecturas en cadencias espaciadas, y la mediana de dos valores es su media —que no rechaza valores atípicos, que es justamente para lo que existe la regla.
- `TERMINATION_READY` requiere confirmación por dos lecturas (§9 de convenciones).
- **Guarda de división por cero:** `initial_brix <= 0` devuelve `SENSOR_FAULT`. La v2.5 ejecutaba `(initial - current) / initial` sin protección — un `initial` de 0.0 por refractómetro sin cerar lanza `ZeroDivisionError` y derriba la ingesta.
- El piso deja de ser literal y pasa a `profile.brix_floor`, fijado en **15.0** para `WASHED_STANDARD`. Reservar 14.0 para perfiles que busquen deliberadamente mayor extracción.
- **Series cortas.** La mediana de 3 solo se aplica con al menos 4 lecturas; por debajo de eso los conjuntos inicial y final se solapan e `initial` resultaría igual a `current` por construcción, dando siempre `total_drop_pct = 0`. Con menos lecturas se usan los extremos crudos y se añade `SHORT_SERIES_NO_MEDIAN` a las advertencias. Ver `03_public_api.md` §9.

## 6. Ascensos de °Bx: no todos son fraude de datos

El prompt de integración de la v2.5 ordenaba marcar `DATA_INTEGRITY_VIOLATION` ante cualquier aumento entre dos pulsos. Biológicamente es demasiado estricto: durante las primeras horas la solubilización del mucílago libera azúcares al licor y **el °Bx del líquido sube de forma legítima**, y la evaporación en tanque abierto concentra sólidos. Aplicar la regla tal cual genera anomalías falsas justo en el arranque de cada lote.

Regla v3.0:

- Un ascenso dentro de `brix_rise_grace_hours` (6 h por defecto) desde el inicio → `INFO`, se registra como fase de solubilización.
- Un ascenso > 1.0 °Bx después de la gracia, sin evento de enriquecimiento registrado (`spec.brix.enrichment_event`) → `DATA_INTEGRITY_VIOLATION`, severidad `WARNING`, **dirigida al dato, no al lote**.
- Un ascenso concurrente con caída de pH → `CROSS_SIGNAL_INCONSISTENT` (ver 10 §3).

## 7. Contrato de retorno

```python
@dataclass(frozen=True)
class BrixAssessment:
    status: str
    severity: Severity
    alert: Optional[Alert]
    current_brix: Optional[float]          # mediana robusta
    initial_brix: Optional[float]
    total_drop_pct: Optional[float]
    velocity_recent_bx_h: Optional[float]
    velocity_cumulative_bx_h: Optional[float]
    hours_elapsed: float
    sample_point: Optional[SamplePoint]
    confidence: DataConfidence
    readings_used: int
    awaiting_confirmation: bool
    warnings: list[str]            # STALL_NOT_EVALUABLE, SHORT_SERIES_NO_MEDIAN, ...
```

Todas las claves presentes en toda ruta. La v2.5 omitía `velocity_bx_hr` en la rama `TERMINATION_READY` pero la incluía en `DATA_COLLECTION`: cualquier consumidor que leyera el campo de forma uniforme fallaba con `KeyError` precisamente en el evento más importante del ciclo.

## 8. Esqueleto del motor

```python
# services/processing/brix.py
from .constants import (BRIX_PHYSICAL_MIN, BRIX_PHYSICAL_MAX,
                        STALL_MATCH_TOLERANCE_H, MIN_READINGS_FOR_MEDIAN,
                        BRIX_CONFIRM_MIN_H, BRIX_CONFIRM_MAX_H)

class BrixKineticAnalyzer:
    def __init__(self, profile: ProtocolProfile):
        self.p = profile

    def evaluate(self, readings, fermentation_started_at, now) -> BrixAssessment:
        usable = [r for r in readings
                  if r.confidence is not DataConfidence.UNCALIBRATED
                  and r.superseded_at is None]
        if len(usable) < 2:
            return self._empty("DATA_INSUFFICIENT", now, fermentation_started_at)

        points = {r.sample_point for r in usable}
        if len(points) > 1:
            return self._fault("MIXED_SAMPLE_POINTS", usable, now, fermentation_started_at)

        series = sorted(usable, key=lambda r: r.measured_at)
        initial, current, short = self._robust_endpoints(series)

        if not (BRIX_PHYSICAL_MIN < initial <= BRIX_PHYSICAL_MAX):   # zero-division guard
            return self._fault("SENSOR_FAULT", series, now, fermentation_started_at)

        hours = (now - fermentation_started_at).total_seconds() / 3600.0
        drop_pct = (initial - current) / initial            # initial > 0 guaranteed above

        # Stagnation is evaluated first, but a non-evaluable window must NOT
        # short-circuit the assessment -- see section 4, rule 2.
        stall = self._check_stagnation(series, now, hours)
        if stall is not None:
            return stall
        # falls through when the window has no comparable reading

        if drop_pct >= self.p.brix_target_drop_pct or current <= self.p.brix_floor:
            confirmed = self._confirmed(series,
                                        lambda r: r.brix <= self.p.brix_floor
                                        or (initial - r.brix) / initial >= self.p.brix_target_drop_pct)
            return self._termination(series, initial, current, drop_pct,
                                     hours, confirmed=confirmed)

        return self._fermenting(series, initial, current, drop_pct, hours)
```

## 9. Prompt de integración para Claude Code

```text
SYSTEM PROMPT: BRIX METRIC PARSER — v3.0

OBLIGACIONES DE IMPLEMENTACIÓN
- La alerta de estancamiento de 12 h DEBE existir como rama ejecutable con
  prueba que la cubra. En v2.5 estaba documentada pero ausente del código;
  cualquier PR que reintroduzca esa brecha se rechaza.
- La velocidad de decisión se calcula sobre ventana móvil reciente. Prohibido
  evaluar estancamiento contra el promedio acumulado de la fermentación.
- current_brix e initial_brix son MEDIANAS de hasta 3 lecturas, nunca valores
  crudos únicos.

GUARDAS
- Guarda obligatoria de cero antes de dividir por initial_brix y por cualquier
  intervalo de tiempo.
- Serie con más de un sample_point => MIXED_SAMPLE_POINTS. Prohibido convertir
  entre puntos de muestreo.
- Una ventana de estancamiento sin lectura comparable NO es un estado terminal:
  se anota STALL_NOT_EVALUABLE y la evaluacion continua.

ASCENSOS DE BRIX
- Un ascenso dentro de brix_rise_grace_hours es INFO (solubilización de
  mucílago), no una violación de integridad.
- Después de la gracia, un ascenso > 1.0 Bx sin evento de enriquecimiento
  registrado emite DATA_INTEGRITY_VIOLATION con severidad WARNING dirigida al
  DATO. Nunca cambia el estado del lote.

CONTRATO
- BrixAssessment congelado, conjunto completo de campos en toda ruta.
- Umbrales exclusivamente desde ProtocolProfile. Prohibidos 14.0 y 0.35 como
  literales en la lógica.
```
