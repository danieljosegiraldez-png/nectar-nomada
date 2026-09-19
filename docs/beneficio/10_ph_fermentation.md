# 10 — Control de Acidez (pH) en Fermentación
**Estado:** Normativo · **Versión:** 3.1 · **Reemplaza:** v2.5
**Depende de:** `00_conventions.md`, `01_lot_lifecycle.md`, `02_calibration.md`

## 1. Matriz de umbrales — perfil `WASHED_STANDARD`

> **Decisión de Daniel, 2026-09-19 (ADR-177) — manda sobre este documento.** El pH objetivo y los
> umbrales son **de la receta, por fase**. Manda el pH objetivo; al vencer la ventana se puede extender
> **mientras el pH siga bajando** (bajada mínima y separación, de la receta). Estancado = el pH no baja,
> salvo que el Brix baje o haya otra señal de actividad; un olor negativo (acético, pasado, rancio)
> avisa aunque el pH no se mueva. Sobre `SUSPECT_DILUTION` a 6,50: el agua de Daniel mide 6,5–6,9 y
> hay aguas de 7–8; él pidió medir el pH del agua con rutina. Retirar el 6,5 y comparar contra el agua
> del lote es **propuesta pendiente de su confirmación** (ADR-177). La «primera lectura» que califica un café es
> la de **recepción, sobre mucílago exprimido sin agua**. Referencias: la revisión de literatura del
> 2026-09-19 (p. ej. espontánea con pH final <3,5 sin pérdida significativa de calidad, Cenicafé 2023).


Los intervalos son **semiabiertos `[inferior, superior)`**. Ningún valor pertenece a dos bandas. Esta disciplina de frontera corrige la ambigüedad de la v2.5, donde pH = 4.50 satisfacía simultáneamente «ventana óptima» y «estancado».

| Banda | Estado | Riesgo / vector | Acción del software |
| :--- | :--- | :--- | :--- |
| `[6.50, 8.00]` | `SUSPECT_DILUTION` | El mucílago fresco no supera pH ~6.0. Un valor mayor sugiere agua de enjuague, electrodo fuera del líquido o descalibración | `WARNING` sobre el dato, no sobre el lote |
| `[5.20, 6.50)` | `INITIAL_PHASE` | Inactividad microbiológica si se prolonga | `INFO`. Iniciar reloj de seguridad de masa |
| `[4.50, 5.20)` | `LAG_PHASE` antes de la gracia; `STALLED_ROT_HAZARD` después | Proliferación butírica y mohos → defecto *stinker* | `INFO` antes de `ph_stall_grace_hours`; `CRITICAL` (con confirmación) después |
| `[3.80, 4.50)` | `OPTIMAL_ACTIVE` | Ninguno. Desarrollo ideal de precursores | Trazar curva de descenso |
| `[3.50, 3.80)` | `WATCH_APPROACHING_LOW` | Aproximación a sobrefermentación | `WARNING` — preparar lavado |
| `[3.30, 3.50)` | `OVER_FERMENTED_CRITICAL` | Degradación ácida, decoloración del pergamino | `CRITICAL` **con confirmación** |
| `< 3.30` | `OVER_FERMENTED_CRITICAL` | Daño consumado | `CRITICAL` **disparo inmediato** |
| fuera de `[2.50, 8.00]` | `SENSOR_FAULT` | Electrodo dañado o fuera de rango medible | `WARNING` — no altera el estado del lote |

Las bandas cubren `[2.50, 8.00]` sin hueco ni solape. Los bordes de banda que no dependen del protocolo (`5.20`, `6.50`) y los límites físicos viven en `constants.py`; los que sí dependen del protocolo vienen de `ProtocolProfile`.

> **Corrección respecto de v2.5.** La banda 3.50–3.80 caía en el `return` final como `MONITORING` sin alerta: el sistema guardaba silencio exactamente en la ventana donde el operador todavía puede salvar el lote. Era el hueco lógico más costoso de la especificación anterior.

## 2. Velocidad de acidificación (nuevo)

El valor absoluto de pH dice dónde está el lote; **la pendiente dice si el lote está vivo**. La v2.5 medía velocidad para Brix pero no para pH — una asimetría sin justificación biológica.

- `dph_dt_recent` — pendiente sobre la ventana móvil de las últimas 6 h `[PROVISIONAL]`, en unidades de pH/h (negativa durante fermentación sana).
- `dph_dt_cumulative` — pendiente desde el inicio de `FERMENTING`.
- **Meseta:** pendiente calculada sobre la **ventana móvil de `ph_stall_grace_hours`** (no sobre la ventana corta de reporte) con `|pendiente| < PLATEAU_EPSILON`, exigiendo que exista una lectura cerca del inicio de esa ventana. Con `hours_elapsed > stall_suspended_until_hours`, indica microflora inactiva **aunque el pH absoluto esté dentro de la ventana óptima**. Una fermentación detenida en pH 4.2 es tan peligrosa como una detenida en 4.7; la v2.5 solo detectaba la segunda.

## 3. Consistencia cruzada con Brix

Señal de diagnóstico que ningún motor aislado puede producir:

| Patrón | Interpretación |
| :--- | :--- |
| pH ↓ y °Bx ↓ | Fermentación normal |
| pH ↓ y °Bx plano | Producción de ácido sin consumo de azúcar → sospecha de bacteria acética sobre etanol, o refractómetro descalibrado |
| pH plano y °Bx ↓ | Consumo sin acidificación → posible actividad de levadura sin bacteria láctica, o electrodo descalibrado |
| pH ↑ | Contaminación proteolítica o error de instrumento. Siempre `WARNING` |

Se emite `CROSS_SIGNAL_INCONSISTENT` cuando las series difieren de lo esperado durante más de 6 h. Es una alerta sobre la **confianza del dato**, no sobre el lote.

## 4. Motor de evaluación

```python
# services/processing/ph.py
from dataclasses import dataclass
from datetime import timedelta
from typing import Sequence, Optional

from .models import PHReading, Alert, Severity, DataConfidence
from .profiles import ProtocolProfile

from .constants import (PH_PHYSICAL_MIN, PH_PHYSICAL_MAX, PH_DILUTION_SUSPECT,
                        PLATEAU_EPSILON, RECENT_WINDOW_H,
                        PH_CONFIRM_MIN_H, PH_CONFIRM_MAX_H)


@dataclass(frozen=True)
class PHAssessment:
    """Fixed return contract: every field is present on every execution
    path. v2.5 returned dicts whose shape varied by branch, which raises
    KeyError in the consumer."""
    status: str
    severity: Severity
    alert: Optional[Alert]
    current_ph: Optional[float]
    hours_elapsed: float
    dph_dt_recent: Optional[float]
    dph_dt_cumulative: Optional[float]
    confidence: DataConfidence
    readings_used: int
    awaiting_confirmation: bool
    warnings: list[str]            # STALL_NOT_EVALUABLE, SHORT_SERIES_NO_MEDIAN, ...


class PHMonitor:
    def __init__(self, profile: ProtocolProfile):
        self.p = profile

    def evaluate(
        self,
        readings: Sequence[PHReading],
        fermentation_started_at,
        now,
    ) -> PHAssessment:
        usable = [r for r in readings
                  if r.confidence is not DataConfidence.UNCALIBRATED
                  and r.superseded_at is None]
        if not usable:
            return self._empty("DATA_INSUFFICIENT", now, fermentation_started_at)

        series = sorted(usable, key=lambda r: r.measured_at)
        last = series[-1]
        hours = (now - fermentation_started_at).total_seconds() / 3600.0

        # Sensor fault is reported, never raised. v2.5 raised ValueError on an
        # out-of-range reading, taking down the whole ingest pipeline because of
        # one dirty electrode. A field system degrades; it does not crash.
        if not (PH_PHYSICAL_MIN <= last.ph <= PH_PHYSICAL_MAX):
            return self._fault(last, hours)

        v_recent = self._slope(series, now - timedelta(hours=RECENT_WINDOW_H), now)
        v_cum = self._slope(series, fermentation_started_at, now)
        stall_active = hours > self.p.stall_suspended_until_hours

        if last.ph >= PH_DILUTION_SUSPECT:
            return self._warn("SUSPECT_DILUTION", "alert.ph.suspect_dilution",
                              last, hours, v_recent, v_cum)

        # --- Over-fermentation --------------------------------------------------
        if last.ph < self.p.ph_immediate_low:
            return self._critical("OVER_FERMENTED_CRITICAL",
                                  "alert.ph.over_fermented_immediate",
                                  last, hours, v_recent, v_cum, confirmed=True)

        if last.ph < self.p.ph_critical_low:
            confirmed = self._confirmed(series, lambda r: r.ph < self.p.ph_critical_low)
            return self._critical("OVER_FERMENTED_CRITICAL",
                                  "alert.ph.over_fermented",
                                  last, hours, v_recent, v_cum, confirmed=confirmed)

        # --- Declared cold hold: the plateau is the goal -----------------------
        if not stall_active:
            return self._ok("STALL_SUSPENDED_COLD_HOLD", last, hours, v_recent, v_cum)

        # --- Stall at high pH ---------------------------------------------------
        if last.ph >= self.p.ph_optimal_high and hours >= self.p.ph_stall_grace_hours:
            confirmed = self._confirmed(series, lambda r: r.ph >= self.p.ph_optimal_high)
            return self._critical("STALLED_ROT_HAZARD",
                                  "alert.ph.stalled_rot_hazard",
                                  last, hours, v_recent, v_cum, confirmed=confirmed)

        # --- Kinetic plateau inside the optimal band (new in v3.0) --------------
        v_grace = self._slope(series,
                              now - timedelta(hours=self.p.ph_stall_grace_hours), now)
        if (v_grace is not None
                and abs(v_grace) < PLATEAU_EPSILON
                and hours >= self.p.ph_stall_grace_hours):
            return self._warn("KINETIC_PLATEAU", "alert.ph.kinetic_plateau",
                              last, hours, v_recent, v_cum)

        # --- Nominal bands ------------------------------------------------------
        if self.p.ph_critical_low <= last.ph < self.p.ph_optimal_low:
            return self._warn("WATCH_APPROACHING_LOW", "alert.ph.approaching_low",
                              last, hours, v_recent, v_cum)

        if self.p.ph_optimal_low <= last.ph < self.p.ph_optimal_high:
            return self._ok("OPTIMAL_ACTIVE", last, hours, v_recent, v_cum)

        if last.ph >= PH_INITIAL_PHASE_FLOOR:
            return self._ok("INITIAL_PHASE", last, hours, v_recent, v_cum)

        return self._ok("LAG_PHASE", last, hours, v_recent, v_cum)

    # -- helpers ---------------------------------------------------------------
    def _confirmed(self, series, predicate) -> bool:
        """Hysteresis rule, 00_conventions.md section 9: two consecutive
        VALIDATED readings meeting the condition, separated by an interval
        inside this engine's confirmation window."""
        hits = [r for r in series[-2:] if predicate(r)]
        if len(hits) < 2:
            return False
        gap_h = (hits[1].measured_at - hits[0].measured_at).total_seconds() / 3600.0
        return (PH_CONFIRM_MIN_H <= gap_h <= PH_CONFIRM_MAX_H
                and all(r.confidence is DataConfidence.VALIDATED for r in hits))

    def _slope(self, series, start, end) -> Optional[float]:
        window = [r for r in series if start <= r.measured_at <= end]
        if len(window) < 2:
            return None
        span_h = (window[-1].measured_at - window[0].measured_at).total_seconds() / 3600.0
        if span_h <= 0:
            return None                      # zero-division guard
        return round((window[-1].ph - window[0].ph) / span_h, 4)
```

*(Los constructores `_ok`, `_warn`, `_critical`, `_fault` y `_empty` producen `PHAssessment` con el contrato completo; `_critical` devuelve `severity=WARNING` y `awaiting_confirmation=True` cuando `confirmed` es `False`.)*

## 5. Prompt de integración para Claude Code

```text
SYSTEM PROMPT: PH LOGIC PARSER — v3.0

CONTRATO
- `ph` es float estricto, 2 decimales. Rechazar str, None y NaN en el borde.
- `PHAssessment` es un dataclass congelado. Toda ruta de ejecución devuelve
  el conjunto completo de campos. Nunca devolver dict libre.

FRONTERAS
- Las bandas son intervalos semiabiertos [inf, sup). Rechazar cualquier PR
  cuya lógica permita que un valor caiga en dos bandas.
- Rechazar cualquier cambio que asigne OPTIMAL_ACTIVE a un pH fuera de
  [profile.ph_optimal_low, profile.ph_optimal_high).
- Las bandas deben cubrir [2.50, 8.00] por completo. Un hueco es un defecto.

ROBUSTEZ
- Prohibido `raise` ante una lectura fuera de rango físico: devolver
  SENSOR_FAULT. Las excepciones se reservan para violaciones de esquema.
- Toda división por un intervalo de tiempo lleva guarda de cero.
- Ninguna alerta CRITICAL puede emitirse desde una sola lectura salvo por
  la excepción de disparo inmediato.

PERFILES
- Prohibido codificar 3.5 / 4.5 como literales en la lógica. Todo umbral
  se lee de ProtocolProfile.
- Respetar stall_suspended_until_hours: durante un reposo frío declarado la
  meseta de pH es el resultado esperado, no una anomalía.

ALERTAS
- Emitir claves i18n con parámetros. Ningún literal en español dentro de
  services/. Una clave sin entrada en locales/es-PA.json rompe el build.
```
