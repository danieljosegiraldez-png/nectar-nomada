# El paquete de descubrimiento contra el repositorio que existe

**Etapa A y B del prompt maestro del paquete** («Néctar Nómada — Claude continuity
handoff», release 1.0). Corrido el 2026-09-16 sobre `origin/main` en `8c67185`.

**Este documento no implementa nada.** El propio prompt lo pide así: *«Stop after
the audit/gap analysis and proposed sequence for review»*.

---

## Cómo leer las afirmaciones de estado

El prompt exige marcar cada afirmación como inspeccionada, probada, informe
histórico o desconocida. Aquí:

- **MEDIDO** — se leyó el archivo o se contó con una búsqueda que trae su control.
- **PROBADO** — además hay prueba verde que lo ejercita, corrida hoy.
- **NO MEDIDO** — se dice y no se comprobó. No hay ninguna afirmación de este tipo
  presentada como hecho.

**Y un aviso sobre el método, porque falló una vez en esta misma corrida.** Buscando
la capa ambiental por semántica —`sensor`— salieron «diez modelos» y **era un falso
positivo**: el patrón casaba con los nueve modelos `Sensory*`, que son evaluación
sensorial y no tienen nada que ver. La ausencia real se confirmó buscando modelo por
modelo con nombres exactos y control positivo al lado. Ensanchar una búsqueda para
«buscar por semántica» es justo lo que el prompt pide, y también lo que fabrica
coincidencias que halagan la hipótesis.

---

## Escala del sistema que ya existe — MEDIDO

| | |
|---|---:|
| Modelos Prisma | **148** |
| Migraciones aplicadas | **104** |
| Módulos de dominio en `lib/` | **165** |
| Archivos de prueba | **189** |
| Páginas | **67** |

La suite completa pasó **2280/2280** hoy sobre este commit. Eso es lo que el prompt
llama «preservar»: no es un prototipo.

---

## 1. Lo que YA SATISFACE el objetivo y no se toca

**PROBADO.** Todo lo de esta sección tiene prueba verde corrida hoy.

| Decisión del paquete | Qué existe | Evidencia |
|---|---|---|
| **Q11** agronomía centrada en parcela | `LocationType` con `site`, `plot`, `micro_plot`; `PlantingCohort` para la población; `Specimen` con rejilla para la planta señalada como **excepción** | `prisma/schema.prisma`; el comentario de `PlantingCohort` explica por qué no se pueblan todas las plantas |
| **Q18** genealogía de material y balance de masas | `LotTransformation`, `QuantityEvent`, `lib/traceability/balance.ts` (533 líneas); la muestra **descuenta masa en la misma transacción** | `balance.ts`; criterio 9 de la auditoría de fase 3 |
| **Q20** sensorial independiente y versionado | 9 modelos `Sensory*`, incluido `SensoryBlindMapping` para el código ciego | `schema.prisma` |
| **Q26** la colmena persiste, la ocupación es biología | `Hive`, `HivePlacement`, `Colony`, `ColonyEvent`, `ColonyLossCause` separados | `schema.prisma` |
| **Q37** equipos y calibración | **8 modelos**: `Equipment`, `EquipmentTransfer`, `EquipmentConditionReport`, `InstrumentCheck*`, `InstrumentMeasurementMode`, `MeasurementReviewFlag` | construido 2026-09-14/16 |
| **Q05** captura manual como base fiable | `public/sw.js`, `lib/sync/`, `clientDraftId` (81 apariciones) | la cola offline tiene su propio trabajo vivo en otra sesión |
| correcciones sin borrado silencioso | `Measurement.correctsId`, `AuditEvent`, `lib/research/amendments.ts` | |

**Y el secado, que es lo que se acaba de cerrar hoy (#350):** Q17 pide asignación de
cama, profundidad de capa, volteos, ambiente, trayectoria de humedad, procedencia de
instrumento y calibración, humedad y actividad de agua finales. **Todo eso existe**
salvo el ambiente y la liberación autorizada, que están abajo.

---

## 2. PARCIAL — existe el mecanismo, falta una pieza nombrada

| Decisión | Qué falta exactamente | Peso |
|---|---|---|
| **Q17** estabilización y liberación autorizada | **MEDIDO: cero.** `release\|liberacion\|authorized_release` no aparece en `lib/` ni en el esquema. Lo que hay de «reposo» son las seis apariciones del reposo **frío de fermentación** (`STALL_SUSPENDED_COLD_HOLD`, `cold_hold_arrival_temperature`) — otra cosa. Es el hallazgo `F3-002`, y Daniel confirmó el 2026-09-15 que el reposo impacta la taza | **alto** |
| **Q19** trilla afectando al libro mayor | **MEDIDO: cero** coincidencias de `hulling\|trilla`. El paquete es explícito —«no puede esperar a Fase 2»— y **AT04 trae su aritmética**: 100 kg pergamino → 80 verde + 18 subproducto + 2 merma documentada, y «una humedad desconocida no se convierte en cero» | **alto** |
| **Q14** campos de recepción configurables por SOP | `HarvestEvent` existe; la configurabilidad Requerido/Recomendado/Opcional/No aplica **MEDIDO: cero** | medio |
| **Q21/Q41** tareas, SOP y prioridades | `Task` y `FieldSession` existen; **no existen** `Sop`, `StandardOperatingProcedure` ni `Intervention` | medio |
| **Q11** rejilla del bloque y cosecha por planta | `Specimen.gridRow`/`gridPosition` existen; **no se declara la extensión del bloque** (10 × 400) y `HarvestEvent` apunta a la parcela, no a la planta | medio |

---

## 3. AUSENTE — tres subsistemas enteros

**MEDIDO modelo por modelo, con control positivo** (`DryingRun`, `SamplingEvent`,
`Equipment`, `SensorySession` devuelven 1 con la misma búsqueda):

| Subsistema | Modelos buscados, todos en cero | Dónde lo pide |
|---|---|---|
| **Capa ambiental** | `EnvironmentalObservation`, `EnvironmentalSource`, `WeatherObservation`, `Sensor`, `SensorDeployment`, `DataLogger` | Q31 del paquete; §7 y §38 de la especificación |
| **Servicios de laboratorio externos** | `ServiceRequest`, `LabOrder`, `LabResult`, `ChainOfCustody` | Q44 |
| **Capa de IA y su gobernanza** | `AIRecommendation`, `AiSuggestion` — y `Notification` tampoco existe | §31, §32 y §34 de la especificación |

`Device` sí existe (1), del trabajo de captura offline.

**Lo que esto significa, dicho sin adornos:** el cuarto oscuro de Cafelino —con aire
acondicionado, deshumidificador y medición constante— **no se puede registrar como se
maneja**. Las variables `temperature` y `relative_humidity` se pueden colgar de una
corrida de secado, pero sin fuente, sin sensor, sin despliegue y sin distinguir una
lectura de cuarto de una de grano.

---

## 4. Conflictos entre el paquete y decisiones ya tomadas aquí

**Uno solo, y es de vocabulario, no de fondo.** El paquete dice «Farm → Field Parcel
→ optional Microparcel». El repositorio decidió que **las parcelas no se llaman
lotes** (`scripts/parcelas-no-se-llaman-lotes.ts`) y usa `LocationType.plot` /
`micro_plot`, reservando «lote» para el material de café. **Manda el repositorio**: el
prompt del paquete lo dice él mismo — *«conceptual entity names in this packet are not
mandated database renames»*.

**Crosswalk mínimo**, para que nadie renombre nada:

| Paquete | Aquí | Nota |
|---|---|---|
| Field Parcel | `Location` con `locationType = plot` | no es una familia de entidades nueva |
| Microparcel | `micro_plot` | |
| Harvest Batch | `HarvestEvent` + `Lot` | geografía y material son distintos, como pide Q11B |
| Processing Batch | `LotProcess` / `TreatmentBatch` | el segundo es Research OS |
| Asset/bed | `Location` con `drying_bed` | ADR de la topología de secado |
| Sample withdrawal | `Sample` + `sample_extraction` + `QuantityEvent` | descuenta masa, no es metadato |

---

## 5. Lo que el paquete confirma y aún no estaba escrito aquí

Tres decisiones del dueño que el repositorio cumplía **sin tenerlas declaradas**:

- **Q05** — la entrada manual estructurada es la base fiable y **siempre disponible**
  para mediciones críticas; lo asistido alimenta los mismos registros con su
  procedencia. Gobierna el formulario de medición que se cerró hoy.
- **Q25/AT28** — *«preservar la observación con banderas de calidad, instantánea de
  calibración y tarea de revisión»*. Lo primero y lo segundo existen desde hoy; **la
  instantánea de calibración y la tarea de revisión, no**: se enlaza el modo del
  instrumento, no se congela su estado, y se crea una marca, no una tarea.
- **Q19** — la contabilidad de muestras es Fase 1 y no difiere.

---

## 6. Lo que propongo como siguiente incremento

**El más pequeño que cierra la mayor deuda medida: el reposo y la trilla.**

Están juntos a propósito: son las dos etapas que faltan entre el secado —que se acaba
de cerrar— y el almacenamiento, el paquete las pone las dos en Fase 1, **AT04 ya trae
la aritmética de aceptación**, y Daniel confirmó que el reposo impacta la taza.
Cerrarlas completa la cadena del beneficio de punta a punta por primera vez.

Y hay una razón de orden: **la trilla es la que crea el café verde**, que es el
material que hoy el modelo admite y ninguna etapa produce.

Lo que NO propongo ahora, y por qué: la capa ambiental es la ausencia más grande, pero
es infraestructura (§38 pide arquitectura de series temporales) y no desbloquea nada
de lo que está a medias. La de IA y la de laboratorio, lo mismo.

---

## 7. Decisiones que necesitan a Daniel

No se resuelven inspeccionando, así que no las decido:

1. **Si la liberación autorizada es una firma o un estado.** Q17 dice «authorized
   release» y no dice quién autoriza ni contra qué.
2. **Qué categorías de subproducto distingue la trilla.** AT04 da 80/18/2 con
   «pergamino/subproducto»; el paquete lista en Q19 más categorías —pérdida de
   transformación, subproductos, muestreo, consumo, daño, corrección— y cuál aplica a
   qué es suyo.
3. **`Q49` está confirmado como Fase 1 E → Fase 2 F**, pero *qué entra en el sprint
   actual* sigue siendo suyo: el paquete dice explícitamente que su Fase 1 completa
   **no es** una orden de implementarlo todo ahora.
