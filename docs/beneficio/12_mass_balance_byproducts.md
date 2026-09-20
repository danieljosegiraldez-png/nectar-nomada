# 12 — Balance de Masas, Selección y Enrutamiento de Subproductos
**Estado:** Normativo · **Versión:** 3.1 · **Reemplaza:** v2.0
**Depende de:** `00_conventions.md`, `01_lot_lifecycle.md`, `02_calibration.md`

## 1. El error estructural de la v2.0: dos dominios de conservación, no uno

`BiomassYieldProcessor` exigía que **una sola suma** cuadrara contra el peso de cereza fresca, y esa suma incluía tanto categorías de selección de cereza entera (maduros, verdes, pintones, flotadores) como salidas de despulpado (`pulp_kg`). Son magnitudes de etapas distintas y no pueden sumarse.

La pulpa **no es una fracción de cereza que se apartó junto a los verdes**: es el 38–45 % de la masa de las cerezas maduras que ya se contaron en `prime_ripe_kg`. Sumarla al total la cuenta dos veces. Consecuencias en la v2.0:

- Un registro físicamente correcto **falla** el balance y lanza `ValueError`.
- Para que la validación pase, el operador debe subdeclarar `prime_ripe_kg`, lo que **corrompe deliberadamente el `purity_index`**, que se calcula con `prime_ripe / total_cherry`.
- El índice de pureza pasa a medir «cuánto tuvo que mentir el operador para que el software lo dejara guardar».

La corrección es separar la conservación en dos etapas encadenadas.

### Etapa A — Selección de cereza (conserva masa de cereza entera)

```
total_cherry_kg = prime_ripe + underripe + semi_ripe + overripe
                + floaters + foreign_matter + sorting_loss
```

### Etapa B — Despulpado (transforma un subconjunto de la Etapa A)

```
depulped_input_kg = depulped_in_mucilage_kg + pulp_kg + process_loss_kg
```

`depulped_in_mucilage_kg` es **café despulpado en baba**: el grano con su mucílago todavía adherido, tal como sale de la despulpadora. No usar «desmucilaginado» para nombrarlo — ese término significa lo contrario, que el mucílago ya fue removido, y corresponde a la ruta de desmucilaginado mecánico de la §4. **No es pergamino lavado** y no debe compararse con los rendimientos de pergamino: son etapas distintas y la confusión entre ambas es una fuente clásica de rendimientos aparentemente imposibles.

### Etapa C — Lavado (posterior a fermentación)

```
depulped_in_mucilage_kg = wet_parchment_kg + mucilage_washout_kg + wash_loss_kg
```

**La tolerancia de las Etapas B y C se calcula sobre el insumo de su propia etapa** (`depulped_input_kg`, `depulped_in_mucilage_kg`), con la misma fórmula relativa y el mismo piso absoluto de la Etapa A.

donde `depulped_input_kg ⊆ {prime_ripe, semi_ripe, overripe}` según el manifiesto de enrutamiento, y **nunca** aparece en la ecuación de la Etapa A.

`purity_index = prime_ripe_kg / total_cherry_kg`, exclusivamente con categorías de Etapa A.

## 2. Tolerancia: relativa, no absoluta

La v2.0 usaba `abs(delta) > 0.05` kg. Sobre una recepción de 5 000 kg eso exige una precisión del 0.001 %, inalcanzable con báscula de plataforma; sobre una muestra de 2 kg es holgada. Peor: la conservación perfecta es **físicamente falsa**, porque la cereza absorbe agua en el canal de flotación y pierde masa por escurrido.

```python
@dataclass(frozen=True)
class BalancePolicy:
    relative_tolerance: float = 0.005     # 0.5 %   [PROVISIONAL]
    absolute_floor_kg: float  = 0.500     # piso para lotes pequeños
    gross_threshold: float    = 0.050     # 5 % => rechazo duro
```

`tolerance = max(total_cherry_kg * relative_tolerance, absolute_floor_kg)`

| Discrepancia | Estado | Comportamiento |
| :--- | :--- | :--- |
| ≤ tolerancia | `BALANCED` | Se registra `discrepancy_kg` de todos modos |
| tolerancia < d ≤ 5 % | `DISCREPANCY_FLAGGED` | **Se guarda**, se alerta, requiere reconocimiento |
| > 5 % | `GROSS_IMBALANCE` | Se guarda como borrador; bloquea la transición de etapa |
| clave desconocida, masa negativa, total no positivo, `prime_ripe` ausente | — | Lanza `SchemaError`. **No es un estado**: es un error de programación o integración, no una condición de campo |

> **Nunca `raise` ante un desbalance de campo.** La v2.0 lanzaba `ValueError`, lo que descarta la captura completa del operador. En un beneficio, a las 5 de la mañana y en lluvia, eso significa que el dato simplemente no se registra. Registrar con discrepancia marcada preserva la trazabilidad; rechazar la destruye.

Toda masa lleva `weighing_condition` (`DRAINED` / `WET` / `DRY`). Comparar un peso `WET` contra uno `DRAINED` es un error de datos y se marca `INCOMPARABLE_WEIGHING_CONDITION`.

> **Decisión de Daniel, 2026-09-19 — la recepción de cereza no anota la condición.** Entre el peso de finca de una entrega y el peso en la báscula del beneficio (o el declarado por un productor de fuera), la cereza se pesa **siempre fresca, tal cual, en los dos lados**, y las dos pesadas se consideran comparables sin `weighing_condition`. Aplica sólo a esa comparación de básculas (`docs/superpowers/specs/2026-09-19-recepcion-de-cereza-en-beneficio-design.md` §3.4); las masas de las etapas de proceso siguen esta regla tal cual. Si la cereza empezara a llegar en condiciones distintas, se añade el campo.

## 3. Verificaciones de plausibilidad por rendimiento (nuevo)

El balance solo prueba que los números suman; no que sean ciertos. Estos rangos de la industria detectan errores de pesaje que un balance cuadrado no revela. Todos `[PROVISIONAL]` — calibrar contra la data histórica de cada finca.

| Relación | Rango esperado | Si cae fuera |
| :--- | :--- | :--- |
| pulpa / cereza despulpada | 38 – 45 % | `YIELD_IMPLAUSIBLE_PULP` |
| despulpado en baba / cereza despulpada | 55 – 62 % | `YIELD_IMPLAUSIBLE_DEPULPED` |
| pergamino húmedo lavado / cereza | 40 – 46 % | `YIELD_IMPLAUSIBLE_PARCHMENT` |
| pergamino seco / cereza | 18 – 22 % | `YIELD_IMPLAUSIBLE_DRY` |
| cereza : verde (oro) | 5.5 : 1 – 6.5 : 1 | `YIELD_IMPLAUSIBLE_GREEN` |

Nótese que pulpa y despulpado en baba suman aproximadamente el 100 % en la Etapa B, mientras que el pergamino lavado (40–46 % de la cereza) solo aparece tras la Etapa C, una vez removido el mucílago. Un motor que compare la salida de despulpado contra el rango de pergamino producirá `YIELD_IMPLAUSIBLE` en lotes perfectamente normales.

Severidad `WARNING`. Un rendimiento implausible casi siempre es una báscula descalibrada o una unidad mal digitada, no una anomalía agronómica.

**Normalización a materia seca.** Los rendimientos entre lotes no son comparables sin corregir por humedad. Todo peso de pergamino se acompaña de `moisture_pct_wb` y el sistema calcula `dry_matter_kg = wet_kg * (1 - moisture/100)`. Sin esto, un lote pesado al 45 % de humedad parece rendir muchísimo más que el mismo lote al 11 %.

## 4. Matriz operativa de clasificación

| Subproducto | Indicador de separación | Proceso sugerido | Destino comercial |
| :--- | :--- | :--- | :--- |
| **Flotadores** (vanos, secos) | Densidad < 1.0 g/cm³ en sifón | Separación en canal de flote. Secado inmediato en pasera aislada como natural comercial | Cafés de consumo masivo, pasilla, marca local económica |
| **Inmaduros** (verdes) | Rigidez estructural alta; rechazo en criba | Secado al sol o trituración para extracción | Extracto de café verde (ácido clorogénico), base de soluble |
| **Pintones** (semi-maduros) | Resistencia de pulpa media | Desmucilaginado mecánico por fricción, sin fermentación extendida (máx. 4–6 h) para mitigar astringencia | Pergamino comercial de segunda; mezclas de volumen |
| **Vinazos** (sobremaduros) | Exceso de azúcares licuados | Despulpado asistido → fermentación anaeróbica corta estricta (< 12 h) **con control de temperatura** | Microlotes exóticos, descriptores licorosos |
| **Cáscara y pulpa** | Remoción del exocarpio fresco | Ver §5 — producto alimenticio, régimen aparte | Té de cáscara de exportación, harina, compostaje |

Enmienda a la v2.0: la fermentación anaeróbica corta de vinazos **no puede especificarse solo por tiempo**. A 30 °C, 12 h de anaeróbico en sobremaduros produce un perfil radicalmente distinto que a 18 °C, y el viraje a avinagrado es una función de temperatura tanto como de duración. Debe registrarse `temperature_c` y el límite debe expresarse en grados-hora, no en horas.

## 5. Cáscara: producto alimenticio, no subproducto

> **Decisión de Daniel, 2026-09-19 (ADR-181 §18).** No usa 75–80 °C durante 12 h. Su proceso:
> deshidratador por bandejas, pocas capas, de horas a días, ciclos de secar y reposar con temperatura
> y abanico ajustables, lento para no volatilizar. Terminada por **humedad**, tacto y sensorial
> opcionales. Otra fuente: la cáscara seca que sale al trillar un natural. Es secundaria al café.
> El parámetro de choque térmico de abajo se retira como valor por defecto.


La v2.0 trataba la cáscara como una salida de proceso más. Es un **alimento de exportación** y arrastra obligaciones que ninguna otra línea tiene. `CascaraBatch` es una entidad de primera clase con su propio ciclo de vida (ver 01 §1).

**Puntos de control obligatorios:**

1. **Agua de lavado** — potable o tratada. Concentración de ozono y tiempo de contacto: parámetros **`[POR VALIDAR]`**, se registran por lote (`ozone_ppm`, `contact_minutes`). No se codifican valores por defecto sin validación local.
2. **Ventana de inicio** — la pulpa fresca fermenta y enmohece en horas. Registrar `hours_from_depulping_to_stabilization`; superar 4 h `[PROVISIONAL]` marca `CASCARA_DELAY_HAZARD`.
3. **Punto final de secado** — el criterio no es el tiempo sino: `moisture_pct_wb ≤ 11.0` **y** `water_activity ≤ 0.60`. La actividad de agua es el parámetro que gobierna la estabilidad microbiana; la humedad porcentual sola no la garantiza.
4. **Trazabilidad** — `parent_lot_id` obligatorio en todo empaque.

> ### ⚠ Parámetro cuestionado: choque térmico 75–80 °C durante 12 horas
>
> La v2.0 prescribe este perfil como valor normativo. **No debe implementarse como valor por defecto sin ensayo.** Un choque térmico es, por definición, breve —su función es arrestar rápidamente la actividad microbiana y enzimática—; sostener 75–80 °C durante 12 h no es un choque sino un secado prolongado a alta temperatura, con riesgo previsible de pardeamiento no enzimático, sabor cocido y pérdida de las notas frutales que dan valor al producto.
>
> La práctica común para cáscara premium es un arresto inicial breve seguido de secado a temperatura sustancialmente menor. La duración correcta del tramo caliente debe determinarse por ensayo con evaluación sensorial y medición de aw, no heredarse del documento.
>
> **Acción para Claude Code:** implementar como `CascaraProfile(shock_temp_c, shock_hours, dry_temp_c)` con los valores actuales cargados y marcados `unvalidated=True`, emitiendo `CASCARA_PROFILE_UNVALIDATED` en cada lote hasta que Daniel registre un ensayo de validación. No borrar el parámetro; señalarlo.

## 6. Motor de validación

```python
# services/processing/mass_balance.py
class StageACategory(str, Enum):
    PRIME_RIPE = "prime_ripe"; SEMI_RIPE = "semi_ripe"; UNDERRIPE = "underripe"
    OVERRIPE = "overripe"; FLOATERS = "floaters"
    FOREIGN_MATTER = "foreign_matter"; SORTING_LOSS = "sorting_loss"

class StageBOutput(str, Enum):
    DEPULPED_IN_MUCILAGE = "depulped_in_mucilage"; PULP = "pulp"; PROCESS_LOSS = "process_loss"

class StageCOutput(str, Enum):
    WET_PARCHMENT = "wet_parchment"; MUCILAGE_WASHOUT = "mucilage_washout"; WASH_LOSS = "wash_loss"


class MassBalanceValidator:
    def __init__(self, policy: BalancePolicy, quality_target: float = 0.80):
        self.policy = policy
        self.quality_target = quality_target

    def validate_sorting(self, total_cherry_kg: float,
                         distribution: dict[StageACategory, float]) -> IntakeAssessment:
        # --- Schema validation: exceptions ARE raised here ---------------------
        unknown = set(distribution) - set(StageACategory)
        if unknown:
            raise SchemaError(f"unknown Stage A categories: {unknown}")
        if any(v < 0 for v in distribution.values()):
            raise SchemaError("negative mass")
        if total_cherry_kg <= 0:                    # guarda de división por cero
            raise SchemaError("total_cherry_kg must be positive")
        if StageACategory.PRIME_RIPE not in distribution:
            # v2.0 used .get(..., 0.0) and silently returned purity_index = 0,
            # labelling a possibly premium lot as COMMERCIAL_VOLUME.
            raise SchemaError("prime_ripe is required, not defaultable")

        declared = sum(distribution.values())
        discrepancy = declared - total_cherry_kg
        tolerance = max(total_cherry_kg * self.policy.relative_tolerance,
                        self.policy.absolute_floor_kg)
        gross = total_cherry_kg * self.policy.gross_threshold

        if abs(discrepancy) <= tolerance:      status = "BALANCED"
        elif abs(discrepancy) <= gross:        status = "DISCREPANCY_FLAGGED"
        else:                                  status = "GROSS_IMBALANCE"

        purity = distribution[StageACategory.PRIME_RIPE] / total_cherry_kg
        ...
```

El manifiesto de enrutamiento devuelve **enums, no cadenas en prosa**. La v2.0 devolvía frases en español dentro de `routing_manifest`, lo que las vuelve inutilizables como identificadores aguas abajo y rompe la regla de i18n:

```python
ROUTING = {
    StageACategory.PRIME_RIPE: RoutingTarget.SPECIALTY_FERMENTATION,
    StageACategory.FLOATERS:   RoutingTarget.NATURAL_PATIO_COMMERCIAL,
    StageACategory.UNDERRIPE:  RoutingTarget.DRY_PASILLA_LINE,
    StageACategory.OVERRIPE:   RoutingTarget.ANAEROBIC_SHORT_FERMENTATION,
    StageACategory.SEMI_RIPE:  RoutingTarget.MECHANICAL_DEMUCILAGE,
}
```

## 7. Prompt de integración para Claude Code

```text
SYSTEM PROMPT: MASS-BALANCE & BYPRODUCT ENFORCER — v3.0

CONSERVACIÓN EN DOS ETAPAS
- Etapa A (seleccion de cereza), Etapa B (despulpado) y Etapa C (lavado)
  son ecuaciones SEPARADAS encadenadas.
- depulped_wet NO es wet_parchment. Comparar la salida de despulpado contra
  el rango de rendimiento de pergamino produce falsos YIELD_IMPLAUSIBLE.
- Rechazar cualquier modelo, migracion o PR que sume pulp_kg dentro del balance
  de cereza entera: es doble conteo.
- Cada etapa calcula su tolerancia sobre el insumo de SU etapa.
- purity_index se calcula solo con categorías de Etapa A.

TOLERANCIA Y PERSISTENCIA
- Tolerancia relativa con piso absoluto. Prohibido el umbral fijo de 0.05 kg.
- Prohibido lanzar excepción por un desbalance de campo. Persistir con
  discrepancy_kg y estado. Las excepciones se reservan para violaciones de
  esquema (clave desconocida, masa negativa, total no positivo).
- prime_ripe es obligatorio. Prohibido .get(..., 0.0) sobre campos que
  alimentan un índice de calidad.

MODELO DE DATOS
- Categorías tipadas por Enum, no dict de cadenas libres.
- Todo peso lleva weighing_condition. No comparar WET contra DRAINED.
- Todo peso de pergamino lleva moisture_pct_wb; los rendimientos se comparan
  en base seca.
- routing_manifest devuelve enums RoutingTarget. Ningún literal en español
  dentro de services/.

CÁSCARA
- Al generarse pulp_kg > 0, crear CascaraBatch enlazado con parent_lot_id
  para forzar el inventario aguas abajo.
- CascaraProfile se carga marcado unvalidated=True y emite
  CASCARA_PROFILE_UNVALIDATED hasta que exista un ensayo registrado.
  Ver la advertencia de la sección 5 sobre 75-80 C / 12 h.
```
