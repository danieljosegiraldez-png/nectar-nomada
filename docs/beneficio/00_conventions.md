# 00 — Convenciones Transversales del Dominio
## Néctar Nómada · Módulo de Beneficio de Café
**Estado:** Normativo · **Versión:** 3.0 · **Precedencia:** este documento gobierna sobre cualquier especificación de dominio en caso de conflicto.

> **Regla de idioma (vinculante).** La prosa, las tablas de dominio y todo texto visible para el operador se escriben en español. Los identificadores, enums, claves de esquema, nombres de función y comentarios de código se escriben en inglés. Ningún literal en español debe existir dentro del código: los mensajes se referencian por clave i18n.

---

## 1. Unidades y precisión

| Magnitud | Unidad canónica | Precisión almacenada | Nombre de campo |
| :--- | :--- | :--- | :--- |
| Masa | kilogramo (kg) | 3 decimales | `*_kg` |
| Temperatura | grado Celsius (°C) | 1 decimal | `*_c` |
| pH | adimensional | 2 decimales | `ph` |
| Sólidos solubles | grado Brix (°Bx) | 1 decimal | `brix` |
| Humedad | % base húmeda | 1 decimal | `moisture_pct_wb` |
| Actividad de agua | adimensional (0–1) | 3 decimales | `water_activity` |
| Volumen | litro (L) | 2 decimales | `*_l` |
| Tiempo transcurrido | hora decimal | 3 decimales | `*_hours` |

**Nunca** se almacenan libras, quintales, latas ni cajuelas. La conversión ocurre exclusivamente en la capa de presentación, y la unidad que el operador digitó se conserva en `entry_unit` para auditoría.

## 2. Tiempo y zona horaria

- Todo instante se persiste en **UTC**, tipo `datetime` *timezone-aware*. Se prohíbe el `datetime` ingenuo (*naive*) en cualquier capa.
- La zona de presentación por defecto es `America/Panama` (**UTC−05:00, sin horario de verano**). No se debe implementar lógica de DST.
- Formato de serialización: ISO 8601 con desplazamiento explícito — `2026-03-14T08:30:00-05:00`.
- Se distinguen dos sellos y **ambos son obligatorios**:
  - `measured_at` — cuándo ocurrió la medición en campo.
  - `recorded_at` — cuándo entró al sistema.
  Su diferencia (`entry_lag`) es un indicador de calidad de datos: un rezago mayor a 4 h marca la lectura como `RETROSPECTIVE`. Una lectura retrospectiva **entra en las evaluaciones de nivel pero se excluye de todo cálculo de pendiente**, porque no describe el instante que aparenta. El filtro común está especificado en `03_public_api.md` §4.
- El tiempo transcurrido de un proceso **siempre se deriva de marcas de tiempo**. Se prohíbe recibir `hours_elapsed` como parámetro de entrada.

## 3. Identidad y trazabilidad

```
LOT_ID   := {finca_code}-{YYYYMMDD}-{seq:03d}      # PAN-LNCA-20260314-001
BATCH_ID := {LOT_ID}#{stage_code}                   # ...-001#FERM
```

Todo registro derivado (`CascaraBatch`, `DryingRun`, `SortingEvent`) conserva `parent_lot_id`. La cadena de custodia debe reconstruirse desde el café verde hasta la cereza sin ambigüedad; esta es una capacidad de producto, no un detalle de implementación.

## 4. Inmutabilidad y auditoría

Cumple el mandato de la sección 1 de `CLAUDE.md`.

- Las tablas de lecturas son **append-only**. `UPDATE` y `DELETE` están prohibidos a nivel de aplicación y revocados a nivel de rol de base de datos.
- Una corrección se materializa como un **registro nuevo** con `supersedes_id`, `correction_reason` y `corrected_by`. El registro original permanece y se marca `superseded_at`.
- Toda consulta analítica filtra por `superseded_at IS NULL` salvo que se solicite explícitamente la vista histórica.
- Ningún cálculo de alerta puede ejecutarse sobre datos que no hayan pasado la capa de saneamiento (`sanitize_reading`).

## 5. Contrato mínimo de una lectura

Ninguna medición se acepta sin estos campos. Una lectura incompleta se rechaza en el borde, nunca aguas abajo.

```python
# services/processing/models.py
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional

class SamplePoint(str, Enum):
    TANK_LIQUID_MID     = "TANK_LIQUID_MID"      # licor de fermentación, media altura
    TANK_LIQUID_SURFACE = "TANK_LIQUID_SURFACE"
    MUCILAGE_PRESSED    = "MUCILAGE_PRESSED"     # mucílago exprimido del grano
    CHERRY_PULP         = "CHERRY_PULP"          # pulpa de cereza entera
    PARCHMENT_BED       = "PARCHMENT_BED"        # cama de secado

class WeighingCondition(str, Enum):
    DRAINED = "DRAINED"   # escurrido 5 min, condición de referencia
    WET     = "WET"       # recién salido de agua — NO comparable
    DRY     = "DRY"

@dataclass(frozen=True)
class Reading:
    reading_id: str
    lot_id: str
    measured_at: datetime          # tz-aware, UTC
    recorded_at: datetime          # tz-aware, UTC
    operator_id: str
    instrument_id: str
    calibration_id: Optional[str]  # ver 02_calibration.md — None invalida la lectura
    sample_point: SamplePoint
    temperature_c: Optional[float]
    supersedes_id: Optional[str] = None
```

**Regla de comparabilidad:** dos lecturas solo pueden compararse entre sí (curvas, velocidades, deltas) si comparten `sample_point`. Mezclar `TANK_LIQUID_MID` con `MUCILAGE_PRESSED` en una misma serie es un error de datos, no una variación biológica.

## 6. Enums de estado y severidad

Los estados se escriben en inglés, `SCREAMING_SNAKE_CASE`, y son un conjunto cerrado. Se prohíbe devolver cadenas libres como estado. **La lista completa de enums, modelos, firmas y estados válidos vive en `03_public_api.md`, que es el contrato autoritativo; este documento solo fija las convenciones que lo gobiernan.**

```python
class Severity(str, Enum):
    INFO     = "INFO"
    WARNING  = "WARNING"
    CRITICAL = "CRITICAL"
```

## 7. Internacionalización de alertas

Ninguna alerta lleva texto embebido. El motor devuelve una clave y sus parámetros; la capa de presentación resuelve el idioma.

```python
@dataclass(frozen=True)
class Alert:
    key: str                  # "alert.ph.stalled_rot_hazard"
    severity: Severity
    params: dict              # {"ph": 4.62, "hours": 14.5}
    requires_ack: bool        # CRITICAL siempre True
```

Catálogos en `locales/es-PA.json` y `locales/en.json`. Una clave sin traducción en `es-PA` es un fallo de build, no un fallback silencioso.

## 8. Perfiles de protocolo — *los umbrales no son globales*

> **Decisión de Daniel, 2026-09-19 (ADR-177) — manda sobre esta sección.** Los umbrales salen de la
> **receta** de cada proceso o fase; sin receta el motor no opina. Los cinco perfiles de abajo pasan a
> ser **plantillas** para crear recetas, con la literatura al lado marcada «referencia, no norma»; el
> motor no los usa directamente. Además: la tabla pone `brix_floor` 15,0 y el código de ejemplo 14,0 —
> las dos cifras quedan como plantilla, ninguna como norma.


Este es el cambio estructural más importante respecto de la versión 2.x. Los umbrales de pH y Brix **dependen del protocolo de beneficio**. Un único juego de constantes globales genera falsos positivos masivos en protocolos no convencionales.

```python
@dataclass(frozen=True)
class ProtocolProfile:
    key: str
    # --- pH ---
    ph_optimal_low: float          = 3.80
    ph_optimal_high: float         = 4.50   # intervalo semiabierto [low, high)
    ph_critical_low: float         = 3.50
    ph_immediate_low: float        = 3.30   # dispara sin confirmación
    ph_stall_grace_hours: float    = 12.0
    stall_suspended_until_hours: float = 0.0
    # --- Brix ---
    brix_target_drop_pct: float    = 0.35
    brix_floor: float              = 14.0
    brix_stall_window_hours: float = 12.0
    brix_noise_floor: float        = 0.3
    brix_rise_grace_hours: float   = 6.0
```

Los cinco perfiles se cargan con valores concretos. Un perfil descrito solo en prosa no es implementable. Todos `[PROVISIONAL]`.

| Campo | `WASHED_STANDARD` | `NATURAL` | `ANAEROBIC_SHORT` | `CARBONIC_MACERATION` | `COLD_HOLD_PREFERMENT` |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `ph_optimal_low` | 3.80 | 3.90 | 3.60 | 3.70 | 3.80 |
| `ph_optimal_high` | 4.50 | 4.80 | 4.40 | 4.60 | 4.50 |
| `ph_critical_low` | 3.50 | 3.60 | 3.40 | 3.45 | 3.50 |
| `ph_immediate_low` | 3.30 | 3.40 | 3.20 | 3.25 | 3.30 |
| `ph_stall_grace_hours` | 12.0 | 24.0 | 6.0 | 24.0 | 12.0 |
| `stall_suspended_until_hours` | 0.0 | 0.0 | 0.0 | 0.0 | **48.0** |
| `brix_target_drop_pct` | 0.35 | 0.25 | 0.25 | 0.30 | 0.35 |
| `brix_floor` | 15.0 | 16.0 | 15.0 | 15.0 | 15.0 |
| `brix_stall_window_hours` | 12.0 | 24.0 | 6.0 | 24.0 | 12.0 |
| `brix_noise_floor` | 0.3 | 0.5 | 0.3 | 0.3 | 0.3 |
| `brix_rise_grace_hours` | 6.0 | 12.0 | 3.0 | 12.0 | 24.0 |
| `default_sample_point` | `TANK_LIQUID_MID` | `CHERRY_PULP` | `TANK_LIQUID_MID` | `TANK_LIQUID_MID` | `TANK_LIQUID_MID` |

**`COLD_HOLD_PREFERMENT` es CryoBloom.** La supresión de la caída de pH es el objetivo del protocolo, no una anomalía: `stall_suspended_until_hours = 48` inhibe las alertas de estancamiento durante toda la fase fría, que se registra como `STALL_SUSPENDED_COLD_HOLD`. Ajustar este valor a la duración real del reposo.

### Perfil de secado

El secado tiene su propio objeto de parámetros; sus umbrales no caben en `ProtocolProfile` y no pueden vivir como literales (`CLAUDE.md` §1).

```python
@dataclass(frozen=True)
class DryingProfile:
    key: str                        = "PARCHMENT_STANDARD"
    falling_rate_threshold_pct: float = 25.0   # frontera tasa constante / decreciente
    max_daily_rate_pp: float          = 2.0    # solo en fase decreciente
    target_moisture_low_pct: float    = 10.0
    target_moisture_high_pct: float   = 11.5
    over_dried_pct: float             = 9.5
    max_water_activity: float         = 0.60
    stall_moisture_pct: float         = 20.0
    stall_window_hours: float         = 24.0
    max_dispersion_pp: float          = 1.5
    max_bean_temp_c: float            = 40.0
    mass_consistency_tolerance_pct: float = 3.0
    rate_window_hours: float          = 24.0
```

> **Advertencia de implementación.** Sin `stall_suspended_until_hours`, un reposo frío pre-fermentativo dispara `STALLED_ROT_HAZARD` de forma continua y entrena al operador a ignorar las alertas críticas. La fatiga de alertas es el modo de falla más probable de este sistema.

## 9. Confirmación de alertas críticas (histéresis)

Una alerta `CRITICAL` que instruye lavar o detener un lote tiene costo operativo real. No puede originarse en una sola lectura.

- **Regla de confirmación:** se requieren **dos lecturas consecutivas** `VALIDATED` que cumplan la condición, separadas por un intervalo dentro de la ventana de su motor.
- **La ventana depende de la cadencia de muestreo del motor.** Una ventana única de 15 min – 4 h vuelve imposible confirmar cualquier alerta de secado, cuya cadencia natural es diaria:

  | Motor | Mínimo | Máximo |
  | :--- | ---: | ---: |
  | `PHMonitor` | 15 min | 4 h |
  | `BrixKineticAnalyzer` | 1 h | 8 h |
  | `DryingMonitor` | 12 h | 48 h |

- **Excepción de disparo inmediato:** un valor más allá del umbral `*_immediate_*` dispara sin confirmación.
- Mientras se espera confirmación **el estado no cambia**: se conserva el estado de la condición detectada, la severidad se degrada a `WARNING` y `awaiting_confirmation` queda en `True`. Se prefirió esto a un estado `*_UNCONFIRMED` aparte para no duplicar el conjunto cerrado de estados ni obligar a la interfaz a mapear dos nombres por condición.
- Una vez disparada, la alerta **no se auto-resuelve** al volver el valor al rango; requiere reconocimiento explícito del operador (`requires_ack`).

## 10. Valores provisionales

Los parámetros marcados **`[PROVISIONAL]`** en cualquier especificación de este paquete provienen de práctica general de la industria y **no han sido validados contra los equipos y microclimas de Néctar Nómada**. Deben tratarse como valores por defecto configurables, nunca como constantes codificadas, y confirmarse mediante ensayo documentado antes de operar sobre ellos.
