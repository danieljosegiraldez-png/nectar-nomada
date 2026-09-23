# 03 — Superficie Pública del Módulo (Contrato Autoritativo)
**Estado:** Normativo · **Versión:** 3.1

Toda clase, enum, campo y cadena de estado que la implementación expone se declara **aquí y solo aquí**. Los documentos de dominio (10–13) explican el *porqué* de las reglas; este declara el *qué*. Un nombre usado en `tests/` o en un documento de dominio y ausente de este archivo es un defecto de especificación.

## 1. Estados del ciclo de vida

```python
class LotState(str, Enum):
    INTAKE = "INTAKE"; SORTING = "SORTING"; DEPULPING = "DEPULPING"
    FERMENTING = "FERMENTING"; WASHING = "WASHING"; DRYING = "DRYING"
    RESTING = "RESTING"; MILLED = "MILLED"; REJECTED = "REJECTED"
    # ramas paralelas
    FLOATER_LINE = "FLOATER_LINE"; UNRIPE_LINE = "UNRIPE_LINE"
    CASCARA_STABILIZING = "CASCARA_STABILIZING"
    CASCARA_DRYING = "CASCARA_DRYING"; CASCARA_PACKED = "CASCARA_PACKED"
```

## 2. Enums de dominio

```python
class Severity(str, Enum):            INFO; WARNING; CRITICAL

class DataConfidence(str, Enum):
    VALIDATED; TEMP_UNCOMPENSATED; TEMP_DRIFT_RISK; RETROSPECTIVE; UNCALIBRATED

class SamplePoint(str, Enum):
    TANK_LIQUID_MID; TANK_LIQUID_SURFACE; MUCILAGE_PRESSED
    CHERRY_PULP; PARCHMENT_BED

class WeighingCondition(str, Enum):   DRAINED; WET; DRY

class InstrumentType(str, Enum):
    PH_METER; REFRACTOMETER; MOISTURE_METER; SCALE

class StageACategory(str, Enum):      # selección de cereza entera
    PRIME_RIPE; SEMI_RIPE; UNDERRIPE; OVERRIPE
    FLOATERS; FOREIGN_MATTER; SORTING_LOSS

class StageBOutput(str, Enum):        # despulpado
    DEPULPED_IN_MUCILAGE; PULP; PROCESS_LOSS

class StageCOutput(str, Enum):        # lavado
    WET_PARCHMENT; MUCILAGE_WASHOUT; WASH_LOSS

class RoutingTarget(str, Enum):
    SPECIALTY_FERMENTATION; NATURAL_PATIO_COMMERCIAL; DRY_PASILLA_LINE
    ANAEROBIC_SHORT_FERMENTATION; MECHANICAL_DEMUCILAGE; CASCARA_LINE; COMPOST

class LotTier(str, Enum):             PREMIUM_SPECIALTY; COMMERCIAL_VOLUME
```

> `RoutingTarget.ANAEROBIC_SHORT_FERMENTATION` lleva sufijo deliberado: `ANAEROBIC_SHORT` ya es una clave de `ProtocolProfile` y dos enums distintos no pueden compartir identificador dentro del paquete.

## 3. Modelos de lectura

`Reading` es abstracta; cada motor consume su subclase. Los campos comunes cumplen `00_conventions.md` §5.

```python
@dataclass(frozen=True)
class Reading:
    reading_id: str
    lot_id: str
    measured_at: datetime            # tz-aware UTC
    recorded_at: datetime            # tz-aware UTC
    operator_id: str
    instrument_id: str
    calibration_id: Optional[str]
    sample_point: SamplePoint
    temperature_c: Optional[float]
    confidence: DataConfidence
    atc_enabled: bool = False
    supersedes_id: Optional[str] = None
    superseded_at: Optional[datetime] = None   # espejo en modelo de la columna de BD

@dataclass(frozen=True)
class PHReading(Reading):        ph: float
@dataclass(frozen=True)
class BrixReading(Reading):      brix: float
@dataclass(frozen=True)
class MoistureReading(Reading):
    bed_points_pct: list[float]                # mínimo 3 puntos por cama
    water_activity: Optional[float] = None
    @property
    def moisture_pct_wb(self) -> float: ...    # media de bed_points_pct
```

## 4. Filtro de admisibilidad (común a los tres motores)

```python
def usable(readings, *, for_velocity: bool = False) -> list[Reading]:
    out = [r for r in readings
           if r.confidence is not DataConfidence.UNCALIBRATED
           and r.superseded_at is None]
    if for_velocity:
        # 00_conventions.md §2: una lectura retrospectiva no describe el
        # instante que aparenta y no puede alimentar una pendiente.
        out = [r for r in out if r.confidence is not DataConfidence.RETROSPECTIVE]
    return out
```

## 5. Conjuntos cerrados de estados

| Motor | Estados |
| :--- | :--- |
| `PHMonitor` | `DATA_INSUFFICIENT` · `SENSOR_FAULT` · `SUSPECT_DILUTION` · `INITIAL_PHASE` · `LAG_PHASE` · `OPTIMAL_ACTIVE` · `WATCH_APPROACHING_LOW` · `KINETIC_PLATEAU` · `STALLED_ROT_HAZARD` · `OVER_FERMENTED_CRITICAL` · `STALL_SUSPENDED_COLD_HOLD` · `CROSS_SIGNAL_INCONSISTENT` |
| `BrixKineticAnalyzer` | `DATA_INSUFFICIENT` · `SENSOR_FAULT` · `MIXED_SAMPLE_POINTS` · `INTAKE_OPTIMAL` · `INTAKE_UNDERRIPE` · `FERMENTING` · `STAGNATION_HAZARD` · `SUGAR_DEPLETED` · `TERMINATION_READY` · `DATA_INTEGRITY_VIOLATION` · `STALL_SUSPENDED_COLD_HOLD` |
| `MassBalanceValidator` | `BALANCED` · `DISCREPANCY_FLAGGED` · `GROSS_IMBALANCE` |
| `DryingMonitor` | `DATA_INSUFFICIENT` · `DRYING_NORMAL` · `RATE_TOO_FAST` · `STALLED_MOLD_HAZARD` · `UNEVEN_DRYING` · `TARGET_REACHED` · `OVER_DRIED` · `BEAN_TEMP_EXCEEDED` |

`INTAKE_OPTIMAL` e `INTAKE_UNDERRIPE` los emite `BrixKineticAnalyzer.evaluate_intake()`, distinto de `evaluate()`. `SCHEMA_INVALID` **no es un estado**: las violaciones de esquema lanzan `SchemaError` (ver §7).

## 6. Firmas de los motores

```python
class PHMonitor:
    def __init__(self, profile: ProtocolProfile) -> None: ...
    def evaluate(self, readings: Sequence[PHReading],
                 fermentation_started_at: datetime, now: datetime) -> PHAssessment: ...

class BrixKineticAnalyzer:
    def __init__(self, profile: ProtocolProfile) -> None: ...
    def evaluate(self, readings: Sequence[BrixReading],
                 fermentation_started_at: datetime, now: datetime) -> BrixAssessment: ...
    def evaluate_intake(self, reading: BrixReading) -> BrixAssessment: ...

class MassBalanceValidator:
    def __init__(self, policy: BalancePolicy, quality_target: float = 0.80) -> None: ...
    def validate_sorting(self, total_cherry_kg: float,
                         distribution: Mapping[StageACategory, float],
                         weighing_condition: WeighingCondition = WeighingCondition.DRAINED,
                         lot_id: str | None = None) -> IntakeAssessment: ...
    def validate_depulping(self, stage_b: StageBInput) -> DepulpAssessment: ...
    def validate_washing(self, stage_c: StageCInput) -> WashAssessment: ...

class DryingMonitor:
    def __init__(self, profile: DryingProfile) -> None: ...
    def evaluate(self, readings: Sequence[MoistureReading],
                 drying_started_at: datetime, now: datetime) -> DryingAssessment: ...
    def check_mass_consistency(self, *, initial_mass_kg: float, initial_moisture_pct: float,
                               current_mass_kg: float,
                               current_moisture_pct: float) -> MassConsistencyResult: ...
```

## 7. Entradas y resultados de balance de masas

```python
@dataclass(frozen=True)
class StageBInput:
    lot_id: str
    depulped_input_kg: float
    outputs: Mapping[StageBOutput, float]
    weighing_condition: WeighingCondition
    upstream_weighing_condition: WeighingCondition   # la de la Etapa A

@dataclass(frozen=True)
class StageCInput:
    lot_id: str
    depulped_wet_kg: float
    outputs: Mapping[StageCOutput, float]
    weighing_condition: WeighingCondition

@dataclass(frozen=True)
class IntakeAssessment:
    status: str; severity: Severity; alert: Optional[Alert]
    total_cherry_kg: float
    discrepancy_kg: float
    discrepancy_pct: float
    tolerance_kg: float
    purity_index: float
    lot_tier: LotTier
    routing_manifest: dict[StageACategory, RoutingTarget]
    warnings: list[str]
    persistable: bool          # siempre True: un dato de campo nunca se descarta
    blocks_transition: bool    # True solo en GROSS_IMBALANCE

@dataclass(frozen=True)
class DepulpAssessment:
    status: str; severity: Severity; alert: Optional[Alert]
    discrepancy_kg: float; discrepancy_pct: float; tolerance_kg: float
    pulp_yield_pct: float
    depulped_yield_pct: float
    warnings: list[str]        # YIELD_IMPLAUSIBLE_* , INCOMPARABLE_WEIGHING_CONDITION
    flags: list[str]           # CASCARA_PROFILE_UNVALIDATED , CASCARA_DELAY_HAZARD
    spawned_cascara_batch: Optional[CascaraBatch]
    persistable: bool; blocks_transition: bool

@dataclass(frozen=True)
class CascaraBatch:
    batch_id: str; parent_lot_id: str; pulp_kg: float
    profile: CascaraProfile; created_at: datetime

@dataclass(frozen=True)
class MassConsistencyResult:
    expected_current_mass_kg: float
    observed_current_mass_kg: float
    divergence_pct: float
    warnings: list[str]        # MOISTURE_MASS_INCONSISTENT

class SchemaError(ValueError):
    """Data-contract violation: unknown key, negative mass, non-positive
    total, missing required field. A programming or integration error,
    never a field condition."""
```

`WashAssessment` reproduce la forma de `DepulpAssessment` con `parchment_yield_pct` en lugar de los dos rendimientos de Etapa B.

## 8. Símbolos que las pruebas de invariante requieren

Dos objetos existen para que las pruebas globales no dependan de listas duplicadas a mano:

`PROFILES` es el registro de los cinco perfiles por clave: `PROFILES: dict[str, ProtocolProfile]`, con las claves de la tabla de `00_conventions.md` §8.

```python
# services/processing/profiles.py
PROFILES: dict[str, ProtocolProfile]
DEFAULT_PROFILE_VALUES: dict[str, float]   # todo umbral de dominio y su valor por defecto,
                                           # flattened from the four parameter objects

# services/processing/__init__.py
ENGINE_STATUSES: dict[str, frozenset[str]] # {"ph": {...}, "brix": {...},
                                           #  "mass_balance": {...}, "drying": {...}}
```

`test_no_hardcoded_domain_thresholds` recorre el AST de `services/processing/` y compara cada literal numérico contra `DEFAULT_PROFILE_VALUES`; `test_every_status_in_vectors_is_declared` valida los vectores contra `ENGINE_STATUSES`. Mantenerlos al día es parte de la definición de terminado.

## 9. Contratos de evaluación

`PHAssessment` y `BrixAssessment` se definen en `docs/10` §4 y `docs/11` §7; `DryingAssessment` en `docs/13` §5. Los tres son `dataclass(frozen=True)` y exponen **el conjunto completo de sus campos en toda ruta de ejecución**.

## 10. Constantes físicas (no son umbrales de dominio)

> **Nota del 2026-09-19 (ADR-181).** Tres de estas no son límites de instrumento sino juicios de
> dominio: `PH_DILUTION_SUSPECT` (se retira; ver `10`), `PH_INITIAL_PHASE_FLOOR` y `PLATEAU_EPSILON`
> (la meseta la define la receta). Y `PH_PHYSICAL_MAX = 8,00` queda en el borde de aguas reales de
> pH 7–8: revisar antes de tratar esas lecturas como fallo de sensor.


Viven en `services/processing/constants.py` y quedan exentas de la prueba de umbrales literales. Delimitan lo que un instrumento puede medir, no lo que el café debe hacer.

```python
PH_PHYSICAL_MIN, PH_PHYSICAL_MAX          = 2.50, 8.00
PH_DILUTION_SUSPECT                        = 6.50
BRIX_PHYSICAL_MIN, BRIX_PHYSICAL_MAX      = 0.0, 32.0
MOISTURE_PHYSICAL_MIN, MOISTURE_PHYSICAL_MAX = 5.0, 70.0
MEDIAN_WINDOW                              = 3      # por conteo, no por ventana temporal
MIN_READINGS_FOR_MEDIAN                    = 4
PLATEAU_EPSILON                            = 0.01   # pH/h
RECENT_WINDOW_H                            = 6.0    # solo para reporte de pendiente
STALL_MATCH_TOLERANCE_H                    = 1.5
PH_INITIAL_PHASE_FLOOR                     = 5.20
PH_CONFIRM_MIN_H,   PH_CONFIRM_MAX_H       = 0.25, 4.0
BRIX_CONFIRM_MIN_H, BRIX_CONFIRM_MAX_H     = 1.0, 8.0
DRY_CONFIRM_MIN_H,  DRY_CONFIRM_MAX_H      = 12.0, 48.0
```

**Regla de mediana en series cortas.** `initial` y `current` se calculan como mediana de hasta `MEDIAN_WINDOW` lecturas **solo si la serie tiene al menos `MIN_READINGS_FOR_MEDIAN` elementos**; de lo contrario los conjuntos se solaparían y `initial` sería igual a `current` por construcción. Con menos lecturas el resultado se usan los valores extremos crudos y el resultado incluye `SHORT_SERIES_NO_MEDIAN` en sus advertencias.

## 11. Secado: instalaciones, estantes y bandejas (TypeScript + Postgres)

Nombres aprobados por Daniel el 2026-09-18 (spec
`docs/superpowers/specs/2026-09-18-secado-por-bandeja-y-su-receta-design.md`).
Son de persistencia, no de motor: los motores de §6 no cambian.

| nombre | dónde | qué es |
|---|---|---|
| `DryingEnvironment.african_bed_outdoor` | `core` | cama elevada a la intemperie |
| `DryingEnvironment.floor_tarp` | `core` | en el piso, sobre lona |
| `LocationType.drying_rack` | `core` | un estante de una instalación de secado |
| `Location.shadeDescription` | `core.location.shade_description` | qué da la sombra de arriba, en texto libre |
| `Location.rackSlot` | `core.location.rack_slot` | el puesto dentro del nivel de un estante |
| `DryingTrayType` | `core.drying_tray_type` | tipo de bandeja de la organización, en cm, con su unidad tecleada |
| `Equipment.trayTypeId`, `Equipment.trayNumber` | `core.equipment` | tipo y número consecutivo de una bandeja en su finca; se enseña «B-001» |
| `DryingTrayWeighing` | `traceability.drying_tray_weighing` | pesaje de una bandeja cargada: estado, kg netos y 3–4 profundidades; inmutable, se corrige superseding |

Revisión final del plan 2a (2026-09-19), RULING A2 y hallazgos de la misma revisión:

| nombre | dónde | qué es |
|---|---|---|
| `fuente: "sin_acceso"` | `capacidadDeTipo` (`lib/traceability/capacidadDeBandeja.ts`) | hay pesajes de ese estado pero ninguno visible para quien mira: sin número, ni medido ni estimado — un estimado escondería que SÍ hay una medida |
| `ocultos` | `capacidadDeTipo`, cada línea de estado | cuántos pesajes de ese estado existen y esta cuenta no ve; antes sólo lo traía `pesajesDeTipo` |
| `dondeOculto` | `bandejasDeLaFinca` (`lib/equipos/bandejas.ts`) | la bandeja está en un lugar cuyo nombre esta cuenta no puede ver (`location:manage_attributes`); distinto de "sin traslado" |

Plan 2b (2026-09-18/21), Tarea 1 — el lote en sus bandejas:

| nombre | dónde | qué es |
|---|---|---|
| `DryingRunTray` | `traceability.drying_run_tray` | qué bandejas lleva el secado de un lote, desde y hasta |

Paso 4 de la misma spec, el ambiente a mano (§4.5). Nombres aprobados por Daniel el 2026-09-21:

| nombre | dónde | qué es |
|---|---|---|
| `DryingAmbientReading` | `traceability.drying_ambient_reading` | lectura a mano del aire de una instalación de secado, general o de un estante y nivel; inmutable, se corrige superseding |
| `facilityLocationId`, `rackLocationId`, `rackLevel` | `traceability.drying_ambient_reading` | el punto: instalación obligatoria; estante y nivel opcionales |
| `airTemperatureC`, `temperatureEntryUnit` | ídem | °C con un decimal y la unidad tecleada (`C` o `F`) |
| `relativeHumidityPct` | ídem | humedad relativa del AIRE, un decimal; no es la del grano |
| `SkyCondition`: `sunny`, `partly_cloudy`, `cloudy`, `rain` | `core` | cielo, catálogo de Daniel 2026-09-18 |
| `DryingVentilation`: `open`, `semi_open`, `closed`, `fan_or_dehumidifier` | `core` | ventilación, catálogo de Daniel 2026-09-18 |
| `skyNote`, `ventilationNote` | `traceability.drying_ambient_reading` | nota libre al lado de su valor, nunca en su lugar |
| `sourceType` | ídem, enum `MeasurementSourceType` existente | `manual` hoy |

## 12. Lugares y rutinas (2026-09-19)

- `LocationType.storage_facility` — la bodega; su padre es `beneficio` o `site`.
- `MaterialConsumptionEntry.careRoutineEventId` — el insumo usado en una vez que se hizo una rutina de cuidado; un consumo tiene a lo sumo un padre.
