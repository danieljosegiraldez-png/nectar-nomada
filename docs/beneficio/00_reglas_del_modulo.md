# CLAUDE.md — Módulo de Beneficio de Café
## Néctar Nómada · Sistema Operativo de Finca
**Versión:** 3.0 · **Actualizado:** 2026-09-13 · **Reemplaza:** v1 (sin numerar)

Este archivo gobierna el desarrollo del módulo de control de beneficio. Es la puerta de entrada: define reglas vinculantes e indexa las especificaciones de dominio. **Ante conflicto entre este archivo y una especificación de dominio, gana `docs/00_conventions.md`, luego `docs/03_public_api.md`, luego este archivo.** Un nombre usado en pruebas o documentos y ausente de `docs/03` es un defecto de especificación, no una licencia para inventarlo.

---

## 0. Índice normativo — leer antes de escribir código

| Documento | Alcance | Obligatorio para |
| :--- | :--- | :--- |
| `docs/00_conventions.md` | Unidades, tiempo, identidad, inmutabilidad, perfiles de protocolo, i18n, histéresis de alertas | **Todo cambio** |
| `docs/01_lot_lifecycle.md` | Máquina de estados del lote; qué motor aplica en qué estado | Cualquier motor o transición |
| `docs/02_calibration.md` | Calibración de instrumentos, confianza del dato, compensación de temperatura | Cualquier ingesta de lecturas |
| `docs/03_public_api.md` | **Contrato autoritativo**: todo enum, modelo, firma y cadena de estado | **Todo cambio** |
| `docs/10_ph_fermentation.md` | Umbrales de pH, cinética, motor `PHMonitor` | Fermentación |
| `docs/11_brix_kinetics.md` | Umbrales de °Brix, estancamiento, motor `BrixKineticAnalyzer` | Fermentación |
| `docs/12_mass_balance_byproducts.md` | Conservación en dos etapas, enrutamiento, cáscara | Recibo, selección, despulpado |
| `docs/13_drying_moisture.md` | Curva de secado, humedad, actividad de agua | Secado |
| `fixtures/test_vectors.json` | Criterios de aceptación ejecutables | **Todo motor** |

---

## 1. Reglas generales de arquitectura

- **Tipado estricto.** *Type hinting* completo en Python (`mypy --strict` en CI); interfaces explícitas en TypeScript. Prohibido `Any` en firmas públicas.
- **Saneamiento obligatorio.** Ninguna métrica de campo (pH, °Bx, pesos, humedad, temperatura) se procesa sin atravesar la capa de saneamiento e inmutabilidad. La validación en el borde es la única validación; los motores asumen datos ya saneados.
- **Historial en series de tiempo.** Tablas de lecturas y de transiciones son **append-only**. `UPDATE` y `DELETE` revocados a nivel de rol de base de datos. Las correcciones se materializan como registros que superseden. Ver `00_conventions.md` §4.
- **Contratos de retorno congelados.** Todo motor devuelve un `dataclass(frozen=True)` con el conjunto completo de campos en toda ruta de ejecución. Prohibido devolver `dict` de forma variable — es la causa raíz de los `KeyError` que la v2.x introducía en sus ramas de éxito.
- **Umbrales parametrizados.** Ninguna constante de dominio se codifica como literal en la lógica. Todo umbral proviene de `ProtocolProfile`, `DryingProfile`, `BalancePolicy` o `CascaraProfile`, que viven en `services/processing/profiles.py`. Las constantes **físicas** (rango medible de un instrumento) viven en `constants.py` y no son umbrales de dominio. Ver `00_conventions.md` §8 y `03_public_api.md` §9.
- **Degradación, no caída.** Una lectura anómala produce un estado de falla reportado; nunca una excepción que derribe la ingesta. Las excepciones se reservan para violaciones de esquema, que son errores de programación.

## 2. Límites y alertas críticas del dominio

Los valores siguientes son los **valores por defecto del perfil `WASHED_STANDARD`** y son configurables por protocolo. No son constantes universales: `COLD_HOLD_PREFERMENT` (CryoBloom), `ANAEROBIC_SHORT` y `CARBONIC_MACERATION` sobrescriben varios de ellos.

- **Control de pH.** Riesgo de pudrición si el pH se estanca en `≥ 4.50` transcurridas 12 h. Sobrefermentación y daño al grano por debajo de `3.50`; disparo inmediato sin confirmación por debajo de `3.30`. Banda de vigilancia `[3.50, 3.80)` — **la v1 no alertaba en esta banda**, que es precisamente donde el lote todavía puede salvarse.
- **Control de °Brix.** Alerta de estancamiento si el consumo de azúcares se detiene (Δ°Bx < 0.3) durante 12 h consecutivas, evaluada sobre **ventana móvil reciente**, no sobre el promedio acumulado de la fermentación. Esta alerta estaba especificada en la v1 y **ausente del código**; su existencia debe estar cubierta por prueba.
- **Balance de masas.** La conservación se verifica en **tres ecuaciones encadenadas y separadas** — selección de cereza (Etapa A), despulpado (Etapa B) y lavado (Etapa C). Sumar `pulp_kg` contra el peso de cereza entera es doble conteo y está prohibido; comparar la salida de despulpado contra el rendimiento de pergamino lavado es la confusión de etapas equivalente. Tolerancia relativa (0.5 %) con piso absoluto (0.5 kg), nunca un umbral fijo en kilogramos.
- **Secado.** El límite de tasa de descenso se aplica solo por debajo del 25 % de humedad (fase de tasa decreciente). Un ascenso nocturno de humedad es normal. `TARGET_REACHED` exige humedad **y** actividad de agua.
- **Supresión por perfil.** Las alertas de estancamiento quedan inhibidas mientras `hours_elapsed <= stall_suspended_until_hours`. Sin esta regla, un reposo frío pre-fermentativo dispara alertas críticas de forma continua y entrena al operador a ignorarlas.

## 3. Regla de autonomía

El sistema es **asesor, no autónomo**. Ningún motor ejecuta ni ordena una acción destructiva o irreversible. `TERMINATION_READY`, `OVER_FERMENTED_CRITICAL` y `STALLED_ROT_HAZARD` **recomiendan**; la transición de estado que envía un lote a lavado siempre la confirma una persona identificada, y esa confirmación se registra con la `assessment_id` que la motivó.

## 4. Idioma

Prosa, tablas de dominio y todo texto visible para el operador en **español**. Identificadores, enums, claves de esquema, nombres de función y comentarios de código en **inglés**. Ningún literal en español dentro de `services/`: las alertas se emiten como claves i18n con parámetros. Una clave sin entrada en `locales/es-PA.json` rompe el build.

## 5. Valores provisionales

Los parámetros marcados `[PROVISIONAL]` provienen de práctica general de la industria y **no han sido validados** contra los equipos y microclimas de Néctar Nómada. Se cargan como configuración por defecto, nunca como constantes, y se confirman por ensayo documentado. El perfil térmico de cáscara (75–80 °C / 12 h heredado de la v2.0) está además marcado `[POR VALIDAR]` y emite `CASCARA_PROFILE_UNVALIDATED` en cada lote hasta que exista un ensayo registrado — ver `docs/12` §5.

## 6. Comandos frecuentes

```bash
pip install -r requirements.txt
pytest tests/                                    # suite completa
pytest tests/test_processing_spec.py -v          # criterios de aceptación del dominio
pytest --cov=services/ --cov-fail-under=90       # cobertura de lógica
mypy --strict services/                          # tipado
ruff check services/ tests/
python -m scripts.check_i18n                     # claves sin traducción => fallo
```

## 7. Definición de terminado

Un PR que toque un motor de dominio no se integra sin:

1. Pasar `fixtures/test_vectors.json` en su totalidad.
2. Prueba nueva que cubra la rama añadida, incluidos los valores exactos de frontera.
3. `mypy --strict` limpio y cobertura ≥ 90 % en `services/processing/`.
4. Ningún umbral literal introducido en la lógica.
5. Ninguna clave i18n huérfana.
6. Todo nombre público nuevo declarado en `docs/03_public_api.md` en el mismo commit.
7. Actualización del documento de dominio correspondiente si cambió una regla — **el documento y el código se modifican en el mismo commit**. La divergencia entre ambos es lo que produjo la alerta fantasma de la v2.5.
