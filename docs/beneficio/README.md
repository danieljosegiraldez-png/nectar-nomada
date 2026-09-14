# Módulo de beneficio — la especificación v3.0, y cómo se lee aquí

Estos nueve documentos llegaron el 2026-09-13 como paquete `nn-spec` v3.0,
encargado por Daniel a una revisión externa. **Son normativos para el dominio
del beneficio**: umbrales, máquina de estados, calibración, conservación de masa
y secado salen de aquí.

`99_revision_v2_a_v3.md` **no** es normativo — es la justificación de los
cambios, y así lo dice en su primera línea.

**Los tres de la serie 20 llegaron después, con la v3.1**, y son los que cierran
el ciclo más allá del reposo:

| documento | qué añade |
|---|---|
| `20_modelo_ciclo_completo.md` | **la identidad del lote a través de divisiones y fusiones**, más muestreo, tueste, catación, valorización y reporting. Es el tramo que las especificaciones 10–13 no cubren, y el que hace que todo lo anterior signifique algo |
| `21_rubrica_veracidad.md` | cada cifra que el sistema emite tiene que poder desarmarse. *«Un generador de documentación creíble es peor que no tener nada, porque nadie la cuestiona»* |
| `22_rubrica_pedagogica.md` | el fin no es tener el beneficio documentado: es que quien usa la herramienta **fermente mejor**. Un formulario que pide pH cada cuatro horas y no dice nada más produce una base de datos impecable y **ningún aprendizaje** |

La rúbrica pedagógica y la Parte II de `docs/arquitectura/propuesta-ux-campo.md`
dicen lo mismo desde dos sitios: una pantalla que sólo registra deja al operador
igual que lo encontró.

## Precedencia

1. `CLAUDE.md` del repositorio y las reglas de casa — gobiernan **todo**.
2. `00_conventions.md` — gobierna sobre cualquier documento de dominio de aquí.
3. `03_public_api.md` — el contrato de nombres.
4. `00_reglas_del_modulo.md` — las reglas del módulo.
5. Los documentos de motor: `10`, `11`, `12`, `13`.

**El orden importa y es distinto del que el paquete propone.** El paquete pedía
que su propio `CLAUDE.md` reemplazara el del repositorio. No se hizo: el nuestro
tiene ~2.200 líneas que gobiernan apiario, sensorial, competencias, comercio,
RBAC y gobernanza de IA, y el suyo es de **un módulo**. Reemplazarlo habría
borrado las reglas de todo lo demás. Vive aquí, como
`00_reglas_del_modulo.md`, y manda dentro del beneficio.

## Qué se adoptó y qué no

| lo que el paquete pide | aquí |
|---|---|
| las reglas de dominio: bandas, histéresis, perfiles, conservación en tres etapas | **adoptado**, es el motivo del paquete |
| los 47 vectores como criterio de aceptación | **adoptado** — `tests/fixtures/vectores-de-beneficio.json` |
| implementar `services/processing/` en **Python**, con `pytest` y `mypy` | **no**. Medido: 0 archivos `.py` contra 467 `.ts/.tsx`. Se porta a TypeScript y vitest, que es la decisión de Daniel del 2026-09-13. Su propio §1 ya contempla «interfaces explícitas en TypeScript» |
| reemplazar el `CLAUDE.md` de la raíz | **no** — ver arriba |
| el `instalar.sh` del paquete `nn-instalacion` | **no se ejecuta.** Leído entero: reemplaza el `CLAUDE.md` de la raíz, vuelca los documentos en `docs/` duplicando esta carpeta, copia un test de Python, duplica los vectores con otro nombre y hace **`git add -A`** — que aquí barrería trabajo de otras sesiones. Lo que vale del paquete son los documentos, y se copian a mano |
| `LOT_ID := {finca}-{YYYYMMDD}-{seq}` → `PAN-LNCA-20260314-001` | **no**. El convenio real de Daniel es `PE-90` → `PE-90-A`, sacado de sus lotes, y `lib/traceability/codigosDerivados.ts` lo continúa a propósito. Una convención inventada no sustituye a una en uso |

**Las rutas que los documentos citan son las del paquete, no las de aquí.**
Donde dicen `services/processing/profiles.py` léase el módulo equivalente en
`lib/beneficio/`; donde dicen `locales/es-PA.json`, léase `messages/es.json`,
que es lo que next-intl usa. No se editaron los documentos para arreglar esto:
un normativo reescrito a mano deja de ser el que se revisó.

## Lo que ya existía aquí antes del paquete

Media especificación estaba construida, en TypeScript, y conviene saberlo antes
de escribir nada nuevo:

| la v3.0 pide | dónde vive ya |
|---|---|
| `measured_at` distinto de `recorded_at` | `occurredAt` en `MeasurementForm`, desde el 2026-09-13 |
| corrección que supersede, sin `UPDATE` | `MeasurementCorrectionForm` y el rastro de auditoría |
| calibración de instrumentos | `/calibration`, `lib/` |
| UTC con presentación en `America/Panama` sin DST | `lib/time/localDateTime.ts` |
| procedencia del dato | `ProvenanceClass`, `lib/traceability/procedencia.ts` |
| conservación de masa | `lib/traceability/balance.ts`, `reconciliacionDeCosecha.ts` |
| umbrales por perfil y no literales | `ProcessTarget` de la receta, con `everyHours` y `expectedHours` |

Y lo que **no** existe y el paquete sí exige: `sample_point` en la lectura, la
histéresis de confirmación de alertas, y la derivada de estancamiento.

## Lo que sigue pendiente de Daniel

`99_revision_v2_a_v3.md` §D lista cinco puntos que su autor **no resolvió a
propósito** porque dependen de la experiencia y los equipos de Daniel. Son la
misma clase de decisión que la **P-F** de `SESSION_STATE.md`, y ninguna bloquea
el desarrollo: todos los valores `[PROVISIONAL]` se cargan como configuración.

El que más corre es el **perfil térmico de la cáscara** —75–80 °C durante 12 h—,
porque afecta un producto alimenticio de exportación y porque, como señala esa
revisión, un choque térmico de doce horas no es un choque: es un secado largo a
alta temperatura.
