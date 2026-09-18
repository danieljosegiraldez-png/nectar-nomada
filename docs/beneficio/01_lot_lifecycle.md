# 01 — Ciclo de Vida del Lote (Máquina de Estados)
**Estado:** Normativo · **Versión:** 3.0

Las especificaciones 10, 11, 12 y 13 describen cada una un tramo del proceso. Este documento define el todo: sin él, cada motor de validación opera sin saber si su evaluación es siquiera aplicable en el momento actual.

## 1. Estados

```
INTAKE ─▶ SORTING ─▶ DEPULPING ─▶ FERMENTING ─▶ WASHING ─▶ DRYING ─▶ RESTING ─▶ MILLED
   │          │           │            │            │          │
   └──────────┴───────────┴────────────┴────────────┴──────────┴──▶ REJECTED
```

Ramas paralelas que nacen de `SORTING` y `DEPULPING` y llevan su propio ciclo:

```
SORTING   ─▶ FLOATER_LINE  ─▶ DRYING ─▶ RESTING ─▶ MILLED
SORTING   ─▶ UNRIPE_LINE   ─▶ DRYING ─▶ MILLED
DEPULPING ─▶ CASCARA_BATCH ─▶ CASCARA_STABILIZING ─▶ CASCARA_DRYING ─▶ CASCARA_PACKED
```

| Estado | Motor de validación activo | Transición de salida |
| :--- | :--- | :--- |
| `INTAKE` | Balance de masas (12) | Peso de cereza registrado y firmado |
| `SORTING` | Balance de masas Etapa A (12) | Todas las categorías de la Etapa A suman dentro de tolerancia |
| `DEPULPING` | Balance de masas Etapa B (12) | Pergamino húmedo y pulpa pesados |
| `FERMENTING` | pH (10) **y** Brix (11) | `TERMINATION_READY`, o intervención manual firmada |
| `WASHING` | Balance de masas Etapa C (12) | Pergamino húmedo lavado pesado |
| `DRYING` | Humedad y tasa de secado (13) | `TARGET_REACHED` |
| `RESTING` | — | Reposo mínimo cumplido `[PROVISIONAL: 30 días]` |
| `MILLED` | — | Terminal |
| `REJECTED` | — | Terminal, requiere `rejection_reason` |

## 2. Reglas de transición

1. **Las transiciones son eventos append-only**, no una columna mutable. El estado actual es el evento más reciente no superseded. Esto satisface la exigencia de historial en series de tiempo de `CLAUDE.md` §1.
2. Toda transición registra `transitioned_at`, `operator_id` y, cuando la ordena un motor, la `assessment_id` que la justificó.
3. **Ninguna transición automática puede ordenar una acción destructiva.** Un `TERMINATION_READY` de Brix o un `OVER_FERMENTED_CRITICAL` de pH *recomiendan*; el paso a `WASHING` siempre lo confirma una persona. El sistema es asesor, no autónomo.
4. Una transición hacia atrás está prohibida. Un error de etapa se corrige con `REJECTED` + lote nuevo, o con un evento de corrección que supersede.

   > **Decisión de Daniel, 2026-09-18: excepción a esta regla.** Un paso de
   > `DRYING` de vuelta a una fase anterior —infusión, coinfusión,
   > cofermentación, o reingreso al propio mosto todavía activo— y la
   > posterior vuelta a `DRYING` es una **transición legítima de receta**, no
   > un error de etapa. No se corrige con `REJECTED` ni con un evento de
   > corrección: es un flujo esperado del proceso. Diseño en
   > `docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md`.
5. Un motor solo evalúa lecturas cuyo `measured_at` cae dentro de la ventana del estado correspondiente. Una lectura de pH tomada durante `DRYING` es un error de captura, no un dato de fermentación.

## 3. Aplicabilidad de los motores

```python
ENGINE_APPLICABILITY = {
    LotState.FERMENTING: ("ph", "brix"),
    LotState.DRYING:     ("moisture",),
    LotState.INTAKE:     ("mass_balance",),
    LotState.SORTING:    ("mass_balance",),
    LotState.DEPULPING:  ("mass_balance",),
    LotState.WASHING:    ("mass_balance",),
}
```

Invocar un motor fuera de su estado aplicable devuelve `NOT_APPLICABLE`, nunca una evaluación. Esto evita la clase de bug más común en sistemas de este tipo: alertas de fermentación disparándose sobre lotes que ya están secándose.

## 4. Relojes de proceso

Cada etapa tiene su propio origen temporal y ninguno se hereda del anterior.

| Reloj | Origen | Consumidor |
| :--- | :--- | :--- |
| `fermentation_started_at` | transición a `FERMENTING` | `PHMonitor`, `BrixKineticAnalyzer` |
| `drying_started_at` | transición a `DRYING` | `DryingMonitor` |
| `resting_started_at` | transición a `RESTING` | regla de reposo mínimo |

### Reloj de fermentación

`hours_elapsed` de fermentación se cuenta desde el evento de transición a `FERMENTING`, **no** desde la primera lectura ni desde la hora de recolección. Si el perfil declara una fase fría previa (`COLD_HOLD_PREFERMENT`), el reloj de estancamiento se congela hasta `stall_suspended_until_hours`, mientras que el reloj de exposición total sigue corriendo — son dos contadores distintos y ambos se persisten.
