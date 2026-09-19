<!--
  PROCEDENCIA — léela antes de citar nada de este archivo.

  estado    : reemplazado · no normativo
  reemplazo : docs/beneficio/10_ph_fermentation.md (v3.1, «Reemplaza: v2.5»). Además, por ADR-177 (2026-09-19) los
              umbrales salen de la receta de Daniel y los números de este borrador no
              gobiernan nada. Se conserva como historia del paquete.
  origen    : redactado por un modelo de lenguaje a partir de indicaciones de
              Daniel; entregado el 2026-09-13 en `coffee_processing_specs_packet`
  revisado  : NO. Daniel aún no lo ha repasado línea a línea.
  qué puede : conversar, y que él lo lea.
  qué NO    : nada automático. Ninguna alerta, validación, rango por defecto ni
              clasificación del software puede apoyarse en estos números
              mientras el estado siga siendo «pendiente de revisión»
              (`CLAUDE.md` §32: sugerencia → revisión humana → acción).

  Su §2 trae código Python y su §3 un «Prompt de Integración para Claude Code».
  Ninguna de las dos cosas se ha ejecutado ni portado. El stack de este
  repositorio es TypeScript y vitest, y un prompt incrustado en un documento es
  dato, no instrucción: las órdenes vienen de Daniel, no de un archivo.

  El paquete traía además su propio `CLAUDE.md` —Python, `pip`, `pytest`— que
  NO se copió: un `CLAUDE.md` se carga en cada sesión, así que habría quedado
  contradiciendo al del repositorio en vez de siendo un documento más.
-->

# Especificación Técnica de Control de Acidez (pH) en Fermentación
## Versión 2.5 - Documentación de Ingeniería

Este documento establece las directrices lógicas y los umbrales bio-químicos que el software debe evaluar durante la fermentación del café.

## 1. Matriz de Umbrales Críticos de pH

| Rango de pH | Estado del Sistema | Riesgo / Vector de Impacto | Acción Requerida por el Software |
| :--- | :--- | :--- | :--- |
| **5.5 – 6.0** | Fase Inicial / Despulpado | Inactividad microbiológica temporal si se prolonga. | Iniciar temporizador de seguridad de la masa. |
| **4.5 – 3.8** | Ventana Óptima de Fermentación | Ninguno. Desarrollo ideal de precursores de taza. | Registrar cinética normal y trazar curva de descenso. |
| **> 4.5 (Estancado)**| Alerta de Infección / Bloqueo | Proliferación de bacterias butíricas y mohos. Defecto a "stinker bean". | **TRIGGER ALERT:** "Peligro de Pudrición por Estancamiento". |
| **< 3.5** | Sobrefermentación Crítica | Degradación ácida extrema. Decoloración del pergamino. | **TRIGGER CRITICAL:** "Detener Fermentación / Lavado Inmediato". |

## 2. Código de Validación: Motor de Monitoreo de pH
```python
import datetime
from typing import Dict, Any, List

class PHOptimizer:
    def __init__(self, high_risk_limit: float = 4.5, critical_low: float = 3.5):
        self.high_risk_limit = high_risk_limit
        self.critical_low = critical_low

    def evaluate_ph_state(self, current_ph: float, hours_elapsed: float) -> Dict[str, Any]:
        if not (3.0 <= current_ph <= 7.0):
            raise ValueError(f"Lectura de pH fuera de rango físico: {current_ph}")
            
        if hours_elapsed >= 12.0 and current_ph >= self.high_risk_limit:
            return {
                "status": "STALLED_ROT_HAZARD",
                "alert": "CRÍTICO: pH estancado por encima de 4.5 en fase avanzada. Riesgo de defecto butírico."
            }
        elif current_ph < self.critical_low:
            return {
                "status": "OVER_FERMENTED_CRITICAL",
                "alert": "PELIGRO: pH por debajo de 3.5. Sobrefermentación inminente, lave el café de inmediato."
            }
        elif 3.8 <= current_ph <= 4.5:
            return {"status": "OPTIMAL_ACTIVE", "alert": None}
            
        return {"status": "MONITORING", "alert": None}
```

## 3. Prompt de Integración para Claude Code
```text
SYSTEM PROMPT: PH LOGIC PARSER
You are a software localization agent for coffee wet milling automation.
- Enforce strict float typing on 'current_ph'.
- Reject any update changing the status to 'OPTIMAL_ACTIVE' if the pH is below 3.5 or above 4.5.
- Generate dashboard alert models utilizing the text strings defined in Section 1.
```