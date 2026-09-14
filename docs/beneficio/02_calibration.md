# 02 — Calibración de Instrumentos y Confianza del Dato
**Estado:** Normativo · **Versión:** 3.0

Un motor de alertas construido sobre lecturas no calibradas produce decisiones seguras de aspecto profesional y contenido falso. Esta es la capa que hace defendible todo lo demás; es lo que faltaba por completo en la versión 2.x.

## 1. Principio

**Ninguna lectura sin `calibration_id` vigente entra al cálculo de alertas.** Se persiste (append-only, como toda lectura) y se marca `UNCALIBRATED`, queda visible en la interfaz y se excluye de curvas, velocidades y disparo de alertas.

## 2. Registro de calibración

```python
@dataclass(frozen=True)
class CalibrationRecord:
    calibration_id: str
    instrument_id: str
    instrument_type: InstrumentType     # PH_METER | REFRACTOMETER | MOISTURE_METER | SCALE
    performed_at: datetime              # tz-aware UTC
    performed_by: str
    reference_values: list[float]       # buffers o patrones usados
    measured_values: list[float]        # lo que el instrumento leyó
    ambient_temp_c: float
    slope_pct: Optional[float]          # solo pH
    valid_until: datetime
    passed: bool
```

## 3. Requisitos por instrumento

| Instrumento | Procedimiento mínimo | Vigencia `[PROVISIONAL]` | Criterio de rechazo |
| :--- | :--- | :--- | :--- |
| **Potenciómetro (pH)** | Calibración de dos puntos con buffers 4.01 y 7.00, a temperatura ambiente registrada | 24 h en cosecha activa | Pendiente (*slope*) fuera de 92–102 %; deriva > 0.05 pH contra buffer de verificación |
| **Refractómetro (°Bx)** | Puesta a cero con agua destilada | 24 h; verificación al cambiar de tanque | Cero desviado > 0.2 °Bx |
| **Medidor de humedad** | Verificación contra patrón del fabricante | 7 días | Desviación > 0.5 punto porcentual |
| **Báscula** | Verificación con pesa patrón al 10 % y al 80 % de capacidad | Al inicio de cada jornada de recibo | Error > 0.1 % de la lectura |

## 4. Compensación de temperatura

Dos efectos distintos que la v2.x confundía en uno solo:

**a) Error del instrumento.** El electrodo de pH es dependiente de temperatura por la ecuación de Nernst; el refractómetro también. Regla:
- Se exige instrumento con **ATC** (compensación automática). El campo `atc_enabled: bool` es obligatorio en la lectura.
- Sin ATC, la lectura se acepta únicamente si `temperature_c` está registrada, y se marca `TEMP_UNCOMPENSATED` con menor peso analítico.
- Una lectura tomada a más de **5 °C** de la temperatura de calibración se marca `TEMP_DRIFT_RISK`.

**b) Efecto real sobre el proceso.** La temperatura del tanque gobierna la velocidad de la fermentación. Un lote a 18 °C y uno a 28 °C no son comparables aunque muestren el mismo pH. **`temperature_c` es un campo obligatorio en toda lectura de fermentación**, no opcional: sin él, la cinética no es interpretable y las alertas de estancamiento no distinguen entre infección y simple frío.

## 5. Estado de confianza del dato

```python
class DataConfidence(str, Enum):
    VALIDATED           = "VALIDATED"            # calibrado, ATC, en ventana temporal
    TEMP_UNCOMPENSATED  = "TEMP_UNCOMPENSATED"
    TEMP_DRIFT_RISK     = "TEMP_DRIFT_RISK"
    RETROSPECTIVE       = "RETROSPECTIVE"        # entry_lag > 4 h
    UNCALIBRATED        = "UNCALIBRATED"         # excluido del cálculo
```

Solo lecturas `VALIDATED` pueden confirmar una alerta `CRITICAL`. Las demás pueden generar `WARNING`.
