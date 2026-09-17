# El contrato de investigación del paquete contra lo que el OS ya tiene

**Fecha:** 2026-09-17 · **Fuente:** `research/RESEARCH_SOFTWARE_REQUIREMENTS.md`
del paquete *Smart Hive Node V1*, leído entero.

Todo lo que este documento afirma del repositorio está **medido hoy**. Todo lo
que afirma del contrato está **citado de él**.

---

## 1. El titular

El contrato pide **20 entidades con sus invariantes** y **12 casos de
aceptación**. Medido: **el OS ya tiene la mitad de la maquinaria**, y lo que
falta no son veinte piezas sueltas — son **tres bloques con valor y coste muy
distintos**.

El esquema `research` del OS tiene **28 modelos**: `Experiment`, `Hypothesis`,
`ResearchQuestion`, `Protocol`, `ProtocolVersion`, `ProtocolVariable`,
`AnalysisPlan`, `AnalysisRun`, `AnalysisResult`, `Conclusion`, `Interpretation`,
`Publication`, `TreatmentBatch`, `Deviation`, `Approval`, y más.

---

## 2. Lo que YA existe, entidad por entidad

| Entidad del contrato | En el OS | Nota |
|---|---|---|
| Local protocol | **`Protocol` + `ProtocolVersion`** | versionado e inmutable, ya |
| Method execution | `TreatmentBatch` + `ResearchActivity` | |
| Site hierarchy | **`Location`** (`site`/`plot`/`micro_plot`) **+ `Specimen`** | la jerarquía finca→bloque→microparcela→planta existe entera |
| Specimen / lab sample | `Specimen`, `Sample`, `FoliarSample`, `SoilSample` | |
| Quality result | **todo el esquema `sensory`, 17 modelos** | catación con paneles, ciegos y calibración de evaluadores |
| Inventory asset | **`Equipment` + `InstrumentCheck`** | con verificación contra patrón, ya |
| Analysis / report | `AnalysisPlan`, `AnalysisRun`, `AnalysisResult`, `Report`, `ReportVersion`, `ReportPublication` | |
| Permisos por rol | **RBAC con `Research Lead`, `Research Contributor`, `Research Compliance Reviewer`** | los tres roles que el contrato pide, sembrados |
| Recolección sin señal | spec propio ya escrito (`2026-09-16-cola-offline-captura-de-parcela`) | |

---

## 3. Un falso amigo, y conviene decirlo fuerte

**`EvidenceClaim` existe en el OS y NO es lo que el contrato llama así.**

El del OS cuelga de un `TreatmentBatch`, una `Sample`, una `Measurement` o una
observación sensorial: es **evidencia producida en la finca**. El del contrato es
*«study ID, endpoint, treatment/comparator, value/unit, scale, denominator,
interval/uncertainty, source locator»* — una afirmación extraída de un **paper
publicado**, con su DOI, su alcance de acceso y su revisor de extracción.

Mismo nombre, concepto distinto. Reutilizar la tabla haría que `EvidenceClaim`
significara dos cosas según quién la lea, que es el error que este repositorio ya
evitó dos veces —con las recetas de biochar y con la telemetría contra
`Measurement`—.

---

## 4. Lo que falta, en tres bloques

### Bloque A — La biblioteca de literatura (no existe)

`study_registry.json` trae **40 estudios** con cita, fecha, DOI, enlace, alcance
de acceso, diseño, hallazgos y análisis reportado. Nada de eso tiene sitio: el OS
guarda evidencia propia, no bibliografía ajena.

**Lo que el contrato exige de este bloque, y es su parte más exigente:**
distinguir *«las conclusiones del autor de nuestra interpretación»*, admitir que
*«"no extraído" es un estado válido y visible»*, y **no reducir un estudio a
positivo/negativo** porque *«un estudio puede tener varios criterios de valoración
y direcciones contradictorias»*.

### Bloque B — La biología de la polinización (no existe)

Y es un bloque **coherente**, no seis piezas sueltas: `FloralUnit`, `Allocation`
(con su lista de aleatorización y su semilla), `AccessInterval` (el embolsado),
`PollenTransfer`, `Visit/annotation` y `FruitObservation`. Es el experimento
inspirado en Roubik del propio paquete.

**Y una pieza de este bloque ya está diseñada sin saberlo:** el `AccessInterval`
—*«aperture, install/open/close/remove times, closure state»*— es **exactamente
la misma forma** que el `HiveFitting` del spec de artefactos del 2026-09-17: una
cosa puesta durante un intervalo, con la regla de que *«"embolsado" sin tiempos
es insuficiente»*. Un solo mecanismo de intervalos puede servir a los dos.

### Bloque C — El inventario con existencias (no existe)

`MaterialConsumptionEntry` registra **lo que se consume, no lo que queda** —
medido, y ya anotado igual en el spec de biochar. El contrato pide
*«stock/reserved/used/waste»* con transacciones que se añaden y *«corrección
explícita en vez de existencias negativas en silencio»*.

Es el **tercer sitio** en dos días donde aparece la misma falta: el programa de
biochar la necesita, la trilla la rozó y la investigación la exige.

---

## 5. Los cinco invariantes del contrato que ya son doctrina de esta casa

No hay que adoptarlos: ya se cumplen en otras partes del sistema.

1. *«Missing is not zero»* — la regla de la humedad desconocida.
2. *«Rechazar denominadores cero como "indefinido", nunca infinito ni cero
   beneficio»* — un cero plausible es más peligroso que un error.
3. *«Las alertas son operativas, no diagnósticos biológicos»* — avisa, no
   bloquea, aplicado a la biología.
4. *«Nunca sobrescribir el dato crudo; cada reejecución produce una versión
   nueva»* — `ProcessRecipeVersion`.
5. *«Preservar el desconocido a nivel de familia, la etiqueta original de la IA y
   la corrección del experto»* — las tres capas, sin colapsar.

---

## 6. Recomendación

**No es un spec: son tres**, y su valor por unidad de trabajo es muy distinto.

- **El Bloque C (existencias) es el más barato y el más reclamado** — tres
  subsistemas lo piden ya.
- **El Bloque B (polinización) es el que el paquete quiere**, y comparte el
  mecanismo de intervalos con los artefactos de colmena, así que abaratarlo
  depende de hacer aquel primero.
- **El Bloque A (literatura) es el más caro y el menos urgente** para la finca:
  40 estudios importados no cambian una decisión de campo mañana.

**Y una advertencia del propio contrato que vale para los tres:** *«estos son
requisitos de aceptación para Claude Code, no pruebas de un servidor existente»*.
Los 12 casos son trabajo por hacer, no una suite que exista.
