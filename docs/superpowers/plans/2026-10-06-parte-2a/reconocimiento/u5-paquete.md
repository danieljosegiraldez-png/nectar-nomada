# Reconocimiento 2a — lente u5: el paquete «farm-to-green v2»

**Medido el 2026-10-03** sobre el árbol `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a`,
rama `recetas-parte-2a`, **HEAD `d27068d5`** (`git rev-parse --short HEAD` impreso al empezar). Sólo
lectura: no se tocó ningún archivo del repositorio salvo este informe, ni ninguna base.

**El paquete NO está en el repositorio.** Vive en `/Users/danielsan/Downloads/coffee farm optimization guide/`
(fuera del repo, leído sin copiar ni mover). Medido con control:
`git ls-files | grep -i -E "processing_axes|reference_parameters|PROCESSING_TAXONOMY|farm-management|R6_processing"`
→ **0 archivos**, y la misma orden encuentra `lib/research/catalogs.ts` (1). Fuera del diseño de la 2a,
**ningún archivo del árbol** nombra los ids distintivos del paquete (los comunes como `fermentation` o
`drying` no discriminan y no se midieron así): `git grep -l -F` de `sorting_flotation`,
`immersion_hot`, `hulling_wet`, `barrel_aging`, `monsooning`, `processing_axes`, `04_reference_parameters`
sólo encuentra `docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md`; y
`cold_hold_prefermentation`, `depulped_mucilage`, `sealed_self_induced`, `backslopped` → **0** (el control
es que la primera tanda sí encuentra el diseño). O sea: el plan tendrá que **copiar** los ids al código;
hoy no hay de dónde importarlos.

## 0. Qué leí del paquete

| archivo | bytes | qué saqué |
|---|---|---|
| `06_PROCESSING_TAXONOMY.md` | 17 247 | entero: ejes (§1), familias (§2), 115 métodos (§3), sinónimos (§4), modelo de datos y reglas por defecto (§5), plan de medición (§6), puntos abiertos (§7) |
| `processing_axes.json` | 7 708 | entero: `_meta`, `axes` (A–K), `step_types` (23), `families`, `genuinely_distinct_mechanisms` |
| `04_reference_parameters.json` | 48 998 | entero por programa (`node -e`, sólo lectura): `_meta`, `deprecated_keys` (15), `parameters` (208), `production_systems`, `panama`; volcados completos los 77 que tocan pasos |
| `R6_processing_taxonomy.md` | 59 434 | §0 (reglas de evidencia), §3 (ejes), §4 (codificación), §6 (clústeres), §7 (modelo + mediciones por paso + divulgación), §8 (huecos) |
| `00_CLAUDE_CODE_PROMPT.md` | 9 628 | entero: las **12 reglas no negociables** (la 8 incluida), «Do not», preguntas abiertas |
| `03_MODULE_MAP_AND_REQUIREMENTS.md` | 17 210 | principios (§1–11) y la tabla **D. Validation & alert rules** con severidades |
| `05_EVIDENCE_STUDY.md` | 11 882 | §2 correcciones v1→v2, §4 conflictos a modelar, §5 abiertos |
| `07_MILL_INFRASTRUCTURE_AND_MASTER_DATA.md` | 16 998 | §4 entidades, «capability checks», §5 huecos |
| `processing_methods.json` | 39 980 | por programa: estructura, los 18 métodos con `encoding.steps`, alias de M02/W06/H01–H11 |
| `variables.json` | 32 903 | por programa: 84 variables agrupadas por `where_step` |

---

## 1. (a) Los 23 tipos de paso

`processing_axes.json` → `"step_types"` (línea 103), **23 exactos**, en este orden (contado con
`ax.step_types.length` → 23):

```json
["reception", "sorting_flotation", "sanitation", "cold_hold", "freezing", "pulping", "demucilage",
 "fermentation", "immersion_hot", "immersion_cold", "inoculation", "addition", "washing", "soaking",
 "drying", "hulling_wet", "reposo", "storage", "aging", "monsooning", "barrel_aging", "decaf", "milling"]
```

- **Ortografía en conflicto dentro del propio paquete:** el JSON dice `sorting_flotation`; R6 dice
  `sorting_floatation` (R6:431 en el enum del modelo, y «Sorting / floatation» en R6:472). Manda el JSON
  (es el `master_data` que el prompt manda sembrar, 00:60).
- **`prefermentacion` NO es del paquete.** Es la adición de Daniel (D1). Medido: `grep` de
  `pre-ferment|prefermen` en `06` y `processing_axes.json` sólo encuentra el valor de eje
  `cold_hold_prefermentation` y los métodos N07/A08/T02/T03; ningún tipo de paso. El paquete expresa una
  prefermentación como un paso `fermentation` anterior al despulpado (W10, A08) o como `cold_hold` (T02).
- **El paquete no define cada tipo con una frase.** La única «descripción» por tipo es la tabla de
  mediciones por paso (R6 §7.2, R6:467–486; resumida en 06 §6, 06:220–233). La columna «qué se mide» de
  abajo sale de ahí, no de mi interpretación.

### 1.1 Qué ejes aplican a cada tipo — el paquete NO trae ese mapa

Esto hay que decirlo antes de la tabla, porque el diseño (§3.5) lo da por existente al pedir
`EJES_POR_TIPO_DE_PASO`:

- `processing_axes.json` sólo lista los tipos (`step_types`) y los ejes (`axes`); **no hay ninguna clave
  que relacione un tipo con sus ejes.**
- El modelo de 06 §5 (06:194–199) pone **el vector entero en todo paso**:
  `vector: {A, mucilage_retained_pct?, B, gas?, C, setpoints_c[], D, inocula[], E, additions[], F[], G?, H?, I?}`
  — A–F sin `?` (siempre), G/H/I opcionales. R6 §7.1 igual: `vector: AxisVector // the axis values during THIS step`
  (R6:435). Leído al pie de la letra, **todos los tipos llevan A–F**, que no le sirve a una pantalla que
  quiere enseñar «sólo los ejes que aplican» (diseño §6).
- **J y K no van en el paso.** J es derivado («total and per-step hours — derived, not an axis»); K es
  descriptor del protocolo («NOT an axis»), y el vector del paso de 06 §5 no lo incluye.
- **El eje I (paso por animal) no tiene tipo de paso.** Ningún `step_type` lo recoge.

Lo que sí hay es **evidencia indirecta**: las codificaciones de `processing_methods.json` (de 45 pasos
codificados en 18 métodos, **sólo 11 llevan tipo explícito** — `soaking`, `pulping`, `washing`,
`fermentation`, `hulling_wet`; los demás son pasos sin tipo), las definiciones de los valores de eje que
nombran un paso, y la tabla de mediciones R6 §7.2. La columna de ejes de la tabla siguiente lleva su
fuente en cada celda; **es inferencia sobre esa evidencia, no un mapa del paquete.**

| # | id exacto | etiqueta en R6 §7.2 | qué mide el paquete en ese paso (R6 §7.2 / 06 §6) | ejes con evidencia en el paquete (y de dónde) | registro que lo cumple en el diseño 2a |
|---|---|---|---|---|---|
| 1 | `reception` | Reception | masa de cereza (kg); °Brix + matriz; mezcla de madurez %; flotadores %; T° del núcleo; horas cosecha→recepción; parcela, variedad, altitud | A=`whole_cherry` implícito. Ningún método lo codifica como paso | ninguno; se compara al abrir (§4.5) |
| 2 | `sorting_flotation` | Sorting / floatation | flotadores retirados (kg, %); agua usada (L) | A=`whole_cherry` implícito. Ningún método lo codifica | `LotProcessIntervention` |
| 3 | `sanitation` | Sanitation / pre-treatment | agente, concentración, tiempo de contacto, enjuague; ozono/UV opcional | F=`ozone_uv` (P02 «ozone/UV sanitation», 06:154) | `LotProcessIntervention` |
| 4 | `cold_hold` | Cold hold / freezing | consigna de cámara; serie de T° del núcleo; tiempo a consigna; duración; HR; dosis de bioprotector | A=`whole_cherry`, C=`cold_hold_prefermentation`, D=`bioprotection`, F=`chilling` — T02: `{"A":"whole_cherry","C":"cold_hold_prefermentation","setpoint_c":[9,12],"D":"bioprotection (…MP-72)","F":"chilling"}` | `FermentationRun` |
| 5 | `freezing` | Cold hold / freezing | ídem | C=`frozen`, F=`freezing` (por la definición de los valores); T03 «pre-fermentation freeze» (06:139) | sin registro (§4.6) |
| 6 | `pulping` | Pulping / demucilage | calibre de la despulpadora; masa entra/sale; % mucílago retenido (estimación gravimétrica); agua L/kg cps | A: transición `whole_cherry`→`depulped_mucilage_full` — H11 `{"step":"pulping","A":"depulped_mucilage_full"}`; W10, A06, C02 lo ponen sin ejes | `LotProcessIntervention` |
| 7 | `demucilage` | Pulping / demucilage | ídem + daño y % de remoción (V-DEM-01/02) | A=`depulped_mucilage_removed_mechanical` / `_enzymatic` + `mucilage_removal_mode` (W06, W08); E=`processing_aid` si es enzimático (W08) | `LotProcessIntervention` |
| 8 | `fermentation` | Fermentation | series de T° de masa y ambiente, pH, °Brix, acidez titulable, tiras de etanol/láctico, Fermaestro, CO₂/O₂ del espacio de cabeza, presión, OD, olor; inicio/fin; agitación | A, B, C, D, E en todas las codificaciones de método; F=`agitation`/`pressure` (P03, P04, A10); N07 `{"A":"whole_cherry","B":"aerobic_open","step":"fermentation"}` | `FermentationRun` |
| 9 | `immersion_hot` | Immersion (thermal) | T° del agua entra/sale; tiempo de contacto; relación masa:agua | C=`thermal_shock`, F=`hot_immersion` (T04: pasos `{"F":"hot_immersion"}`, `{"F":"cold_immersion"}`, `"C":"thermal_shock"`) | `FermentationRun` |
| 10 | `immersion_cold` | Immersion (thermal) | ídem | F=`cold_immersion`; C=`thermal_shock` (T04) o `controlled_constant` (A07: bolsa en el río a 12 °C) | `FermentationRun` |
| 11 | `inoculation` | Inoculation | producto, lote, dosis, T° y minutos de rehidratación, momento de adición | D, con `inocula[] {organism, strain, product, supplier, dose, unit, rehydration, lot, regulatory_note}` (processing_axes.json, `D_microbial_control.extra_fields`) | `LotProcessIntervention` y `FermentationIntervention(inoculation)` |
| 12 | `addition` | Addition | sustancia, forma, masa, momento respecto al verde | E, con `additions[] {substance, category, form, amount, unit, timing: pre_green\|post_green, step_seq}` | `LotProcessIntervention` y `FermentationIntervention(addition)` |
| 13 | `washing` | Washing / soaking | agua (L), ciclos, h de remojo, T° del agua, conductividad (opcional) | A como resultado (`depulped_mucilage_removed_fermentation`); W11, WH01, A02, C02 lo codifican `{"step":"washing"}` **sin ningún eje** | `LotProcessIntervention` |
| 14 | `soaking` | Washing / soaking | ídem | B=`submerged` — W03 `{"step":"soaking","B":"submerged"}` | `FermentationRun` |
| 15 | `drying` | Drying | humedad % (método), aw (+°C), T° del grano, T°/HR del aire, capa, volteos, luz (cuarto oscuro), días, reparto de regímenes | G, con `regime_split_pct[]`, `layer_depth_cm`, `target_moisture_pct`, `target_aw`; A = qué se seca (H07 `{"A":"depulped_mucilage_partial","G":"raised_bed"}`); B=`aerobic_open` en H11 («second fermentation/drying») | `DryingRun` |
| 16 | `hulling_wet` | Wet hulling | humedad al trillar (meta 20–24 %) | A=`parchment_hulled_wet` (WH01 `{"step":"hulling_wet","A":"parchment_hulled_wet"}`); G=`two_stage_wet_hull` | sin registro |
| 17 | `reposo` | Reposo / storage | días; contenedor; registrador T/HR; humedad y aw mensual | H=`reposo` | lo lee la 2b desde bodega |
| 18 | `storage` | Reposo / storage | ídem | H=`hermetic_storage` | lo lee la 2b desde bodega |
| 19 | `aging` | Aging / monsoon / barrel | duración; HR; tipo e historia de barrica; volteo | A=`green`, H=`aged_green` | sin registro |
| 20 | `monsooning` | Aging / monsoon / barrel | ídem | A=`green` (o cereza seca, X01), H=`monsooned`; C «humid ambient» (R6:343) **no es valor del enum C** | sin registro |
| 21 | `barrel_aging` | Aging / monsoon / barrel | ídem | A=`green`, H=`barrel_aged`, E «barrel wood (post_green)» (R6:344) | sin registro |
| 22 | `decaf` | — (sin fila en R6 §7.2) | — | A=`green`, H=`decaffeinated` (clase D, post-verde) | sin registro |
| 23 | `milling` | — (lo más cercano: «Green grading») | defectos, criba, densidad, humedad, aw, color, olor | A=`green` («post-milling stages») | sin registro |

**Cobertura del diseño, medida:** los 23 ids más `prefermentacion` aparecen todos en el diseño
(§4.1 línea 181–184, §4.5 línea 229, §4.6 líneas 239–241): 5+1 en `FermentationRun`, 1 en `DryingRun`,
7 en `LotProcessIntervention`, 1 comparado al abrir, 2 para la 2b, 7 sin registro = 23 + 1.

**Para `EJES_POR_TIPO_DE_PASO` el plan tiene dos lecturas posibles, y el paquete no elige:** (1) la literal
de 06:195 —A–F en todo paso—, que no reduce nada; (2) la de la columna de arriba, que sí reduce pero es
inferencia mía sobre 11 pasos tipados y una tabla de mediciones. Si el plan toma la (2), debe decir en el
comentario de la constante que **no es del paquete** y de qué evidencia sale cada fila.

---

## 2. (b) Los ejes A–K, con sus valores y el cruce contra los catálogos del repo

Fuente: `processing_axes.json` → `axes` (líneas 9–102). Recuento por programa: A 8, B 7, C 8, D 10, E 5,
F 9, G 7, H 6, I 5, K 7 → **72 valores**; J no tiene valores. **A–I son ejes; J y K no lo son** (el propio
JSON: J «derived, not an axis», K «NOT an axis»; 06 §1 «Nine axes (A–I) + two descriptors (J, K)»).

Catálogos del repo cruzados, en `lib/research/catalogs.ts` a `d27068d5` (última modificación del archivo:
`e6e05999`, 2026-10-01): `recipiente` (línea 47), `condicion_oxigeno` (230), `manejo_temperatura` (255),
`fuente_microbiana` (282), `sustrato_anadido` (303), `estado_cereza` (320), `medio_lavado` (328). El
archivo tiene **29** catálogos (`grep -c '^    key: "'` → 29). Los ids de la columna «id exacto» se
leyeron del JSON por programa, no se teclearon.

**Regla de los veredictos:** «existe como X» = mismo significado; «existe dentro de X (más amplio)» = X lo
contiene pero borra una distinción que el paquete pide registrar; «dudosa» = parecido con una razón
concreta para no darlo por igual; «falta» = no hay valor. **Ningún alias se propone entre catálogos
distintos, porque el repo no lo permite** (ver §2.3). En F, H, I y K la descripción sale «—» porque el
JSON da esos ejes como **lista de ids sin descripción**; F, G y H se cruzan aparte en §2.1, porque lo que
existe para ellos en el repo son enums y tipos de intervención, no catálogos.

#### `A_fruit_state` — 8 valores · pregunta: «How much fruit is on the seed during this step?»

extra_fields: `["mucilage_retained_pct","mucilage_removal_mode"]`

| id exacto | nombre / descripción (paquete) | catálogo del repo | veredicto | razón |
|---|---|---|---|---|
| `whole_cherry` | intact fruit | `estado_cereza` | existe como `entera` | def. del repo «Cereza sin despulpar.» = intact fruit. También `MaterialState.CHERRY` (enum, schema.prisma:1305). |
| `depulped_mucilage_full` | skin off, all mucilage on (pulped natural, black honey) | `estado_cereza` | falta (dudosa con `despulpada`) | `despulpada` («Cereza sin la piel/pulpa exterior.») es el género: no dice cuánto mucílago. En la casa = «Honey» (100 % retenido, diseño §7) = `grado_proceso.Honey`; `MaterialState.MUCILAGE_HONEY`. |
| `depulped_mucilage_partial` | skin off, part of mucilage on — requires mucilage_retained_pct | `estado_cereza` | falta (dudosa con `grado_proceso` «Semi Wash N%») | En la casa es semi-lavado. **Base inversa:** ADR-181 #12 (DECISIONS.md:11965) dice que «Semi Wash NN %» es mucílago QUITADO; el paquete pide `mucilage_retained_pct` (RETENIDO). Semi Wash 75 % = 25 % retenido. |
| `depulped_mucilage_removed_fermentation` | mucilage degraded by fermentation then washed | `estado_cereza` | falta | En la casa = «Lavado» (`grado_proceso.Washed`), pero ningún catálogo guarda el MODO de remoción. Al secar: `MaterialState.PARCHMENT`. |
| `depulped_mucilage_removed_mechanical` | demucilager (Becolsub, Ecomill, Deslim, DELVA) | `estado_cereza` | falta | Ningún catálogo ni enum guarda `mucilage_removal_mode`. OJO: el paquete lista «semi-washed (BR)» como alias de W06 (desmucilaginado mecánico) — NO es el «Semi Wash» de Daniel. |
| `depulped_mucilage_removed_enzymatic` | pectinase processing aid | `estado_cereza` | falta | Además implica E=`processing_aid` (pectinasa, W08). |
| `parchment_hulled_wet` | wet-hulled at 20–24 % moisture (giling basah) | `estado_cereza` | falta | Sólo lo usa `hulling_wet`. |
| `green` | post-milling stages (aging, decaf, barrel) | `estado_cereza` | falta | Existe `MaterialState.GREEN` (enum, no catálogo; «post-reposo», Daniel 2026-09-15). |

#### `B_oxygen_regime` — 7 valores

extra_fields: `["gas","pressure_kpa"]`

| id exacto | nombre / descripción (paquete) | catálogo del repo | veredicto | razón |
|---|---|---|---|---|
| `aerobic_open` | open tank, heap, bed, patio | `condicion_oxigeno` | existe como `abierto_aerobico` | def. del repo: «oxígeno disponible, sin sellado ni restricción de aire». |
| `submerged` | under water (O2-limited) | `condicion_oxigeno` | falta | `medio_lavado` es el medio del LAVADO, no el régimen de una fermentación sumergida (W02, M13). |
| `sealed_self_induced` | closed vessel, microbial CO2 displaces O2 (SIAF) | `condicion_oxigeno` | existe dentro de `anaerobico` (más amplio) — dudosa como alias | `anaerobico` = «oxígeno restringido en recipiente sellado». Aliasar borraría lo que el paquete pide registrar (S1: «valve vs self-induced»), porque el alias se resuelve al canónico. |
| `sealed_valve` | closed vessel with one-way valve/airlock | `condicion_oxigeno` | existe dentro de `anaerobico` (más amplio) — dudosa como alias | Mismo caso. ADR-054 dejó abierto «valve type» (DECISIONS.md, ADR-054 Consequence). |
| `co2_flushed` | headspace purged with CO2 (carbonic maceration when whole cherry) | `condicion_oxigeno` | dudosa con `maceracion_carbonica` | `maceracion_carbonica` exige cereza entera + CO₂: es co2_flushed ∧ A=whole_cherry (dos ejes). Con despulpado el paquete lo llama «CO₂-flushed anaerobic», que no tiene valor. |
| `inert_gas_flushed` | N2 or Ar purge | `condicion_oxigeno` | existe como `anoxico` | def. del repo: «Sin oxígeno y sin CO₂ — cámara sellada con purga de gas inerte». |
| `vacuum` | evacuated bag/vessel | `condicion_oxigeno` | falta |  |

#### `C_temperature_regime` — 8 valores

extra_fields: `["setpoints_c[]","duration_h[]"]`

| id exacto | nombre / descripción (paquete) | catálogo del repo | veredicto | razón |
|---|---|---|---|---|
| `ambient_uncontrolled` | no control | `manejo_temperatura` | existe como `ambiente` | def.: «Sin manejo activo de temperatura». |
| `controlled_constant` | setpoint °C held | `manejo_temperatura` | falta | El diseño lleva `temperaturaMinC/MaxC` en el paso; el régimen como valor no existe. |
| `cold` | < 15 °C fermentation | `manejo_temperatura` | existe como `fermentacion_fria` | El repo no fija umbral; el paquete dice < 15 °C y su propio T01 cita 15–20 °C en Panamá (06:137). |
| `cold_hold_prefermentation` | pre-fermentative cold hold of intact cherry (CryoBloom, cold soak analogue) | `manejo_temperatura` | existe como `cold_hold_prefermentativo` | Equivalente exacto (CryoBloom). |
| `stepped` | ≥ 2 setpoints in sequence (dynamic) | `manejo_temperatura` | falta |  |
| `thermal_shock` | deliberate hot/cold immersions across tissue | `manejo_temperatura` | existe como `choque_termico` | def.: «Ciclos rápidos… Puede repetirse en varios ciclos». |
| `heated` | > 30 °C | `manejo_temperatura` | falta | > 30 °C (C01 a 38 °C). |
| `frozen` | ≤ 0 °C freezing of cherry | `manejo_temperatura` | falta | Duplica F `freezing` y el tipo de paso `freezing` dentro del propio paquete. |

#### `D_microbial_control` — 10 valores

extra_fields: `["inocula[] {organism, strain, product, supplier, dose, unit, rehydration, lot, regulatory_note}"]`

| id exacto | nombre / descripción (paquete) | catálogo del repo | veredicto | razón |
|---|---|---|---|---|
| `spontaneous` | native microbiota | `fuente_microbiana` | existe como `espontanea` |  |
| `backslopped` | own must/mosto/lixiviado from a previous batch | `fuente_microbiana` | falta (dudosa entre catálogos) | Lo cercano vive en OTROS catálogos: `sustrato_anadido.doble_mosto` y `medio_lavado.mosto_de_otro_lote`. Un alias entre catálogos es imposible (seed.ts:121–129, protocols.ts:315–319). El paquete codifica M02 como D=backslopped + E=own_coffee_derivative. |
| `inoculated_yeast_sacch` | Saccharomyces cerevisiae / pastorianus (SafCoffee, LALCAFÉ) | `fuente_microbiana` | existe dentro de `levadura_inoculada` (más amplio) | `levadura_inoculada` no separa Saccharomyces de no-Saccharomyces; la cepa va en `levadura_cultivo` (Sunrise Orange, Deep Amber, Cool Blue, Green Origin…). |
| `inoculated_yeast_non_sacch` | Torulaspora, Pichia, Hanseniaspora, Meyerozyma, Candida, Yarrowia… | `fuente_microbiana` | existe dentro de `levadura_inoculada` (más amplio) | Ídem; la distinción sólo sale de la cepa. |
| `inoculated_lab` | Lactiplantibacillus plantarum, Leuconostoc, Pediococcus | `fuente_microbiana` | dudosa con `bacterias_lab` | `bacterias_lab` = «añadidas **o favorecidas** deliberadamente»: incluye LAB espontáneas, que el paquete codifica como D=spontaneous + K=lactic. |
| `inoculated_mold` | Aspergillus oryzae (koji), Rhizopus | `fuente_microbiana` | existe como `koji` (más estrecho) | `koji` = sólo Aspergillus oryzae; el paquete incluye Rhizopus. |
| `inoculated_mixed` | yeast + LAB, SCOBY-type (unverified) | `fuente_microbiana` | existe como `cultivo_mixto` | def.: «Combinación deliberada de más de una fuente microbiana». |
| `bioprotection` | Metschnikowia pulcherrima (MP-72) applied to intact cherry | `fuente_microbiana` | falta | La cepa (`MP72`) sí está en `levadura_cultivo`; el ROL bioprotector no. La dosis existe como variable `bioprotective_yeast_dose` g/kg (units.ts:248, ADR-054). |
| `indigenous_isolate` | terroir-isolated starter cultured off-farm | `fuente_microbiana` | falta |  |
| `animal_gut` | civet, elephant, bird | `fuente_microbiana` | falta | Fuera del alcance de la 2a (eje I, sin tipo de paso). |

#### `E_substrate_additions` — 5 valores

extra_fields: `["additions[] {substance, category, form, amount, unit, timing: pre_green|post_green, step_seq}"]` · regulatory_note: «This is the axis competitions regulate. BoP 2024 excluded 'foreign additives'; WCC 2024 bans additions after the green stage. Inoculated yeast status at BoP/CoE 2026 NOT retrieved — confirm with SCAP in writing.»

| id exacto | nombre / descripción (paquete) | catálogo del repo | veredicto | razón |
|---|---|---|---|---|
| `none` | nothing added | `sustrato_anadido` | existe como `ninguno` | (valor del eje E) |
| `own_coffee_derivative` | must, cascara, pulp, mucilage, leachate from the same coffee | `sustrato_anadido` | dudosa con `doble_mosto` (más estrecho) | `doble_mosto` es sólo mosto reusado; cascarilla, pulpa, mucílago y lixiviado no tienen valor. |
| `processing_aid` | enzymes, salt brine, acids (tartaric), sugar as nutrient | `sustrato_anadido` | falta | Enzimas, sal (existe la variable `brine_concentration`), ácidos, azúcar como nutriente. |
| `exogenous_natural` | fruit, cacao pulp, spices, hops, wine must, panela | `sustrato_anadido` | dudosa con `co_fermentacion` | `co_fermentacion` = «Fruta, especias **u otro ingrediente**»: abarca también exogenous_flavouring, y esa diferencia decide BoP (06 §5 reglas por defecto). |
| `exogenous_flavouring` | extracts, essential oils, powders, synthetic flavourings | `sustrato_anadido` | falta (o escondido en `co_fermentacion`) |  |

#### `F_physical_interventions` — 9 valores

| id exacto | nombre / descripción (paquete) |
|---|---|
| `none` | — |
| `chilling` | — |
| `freezing` | — |
| `hot_immersion` | — |
| `cold_immersion` | — |
| `agitation` | — |
| `pressure` | — |
| `ultrasound` | — |
| `ozone_uv` | — |

#### `G_drying_regime` — 7 valores

extra_fields: `["regime_split_pct[]","layer_depth_cm","target_moisture_pct","target_aw"]`

| id exacto | nombre / descripción (paquete) |
|---|---|
| `patio` | concrete/brick/tarp, sun |
| `raised_bed` | mesh beds (African beds, paseras) |
| `shaded_bed` | shade cloth / covered (slow dry) |
| `greenhouse_solar` | parabolic, marquesina, tunnel, modular PC dryer |
| `mechanical` | guardiola, static silo, vertical dryer |
| `dark_room_dehumidified` | dark, cool, dehumidified room |
| `two_stage_wet_hull` | to 20–24 %, hull, then to 12–13 % |

#### `H_post_drying_conditioning` — 6 valores

extra_fields: `["duration_d","container","barrel_type","decaf_process_id"]`

| id exacto | nombre / descripción (paquete) |
|---|---|
| `reposo` | — |
| `hermetic_storage` | — |
| `aged_green` | — |
| `monsooned` | — |
| `barrel_aged` | — |
| `decaffeinated` | — |

#### `I_biological_passage` — 5 valores

| id exacto | nombre / descripción (paquete) |
|---|---|
| `none` | — |
| `civet` | — |
| `elephant` | — |
| `bird_jacu` | — |
| `monkey` | — |

**J_duration_derived** — total and per-step hours — derived, not an axis

#### `K_target_outcome_descriptor` — 7 valores

note: «NOT an axis. A 'lactic' or 'malic' label requires measured acid data or must be published as 'target profile'.»

| id exacto | nombre / descripción (paquete) |
|---|---|
| `lactic` | — |
| `acetic` | — |
| `malic` | — |
| `alcoholic_winey` | — |
| `ester_fruit` | — |
| `clean` | — |
| `funky` | — |

### 2.1 F, G y H contra lo que YA existe en el repo (no son catálogos, y por eso el diseño no los vio)

El diseño (§3, §7) crea `fisico` y `modo_secado` «porque no existe nada parecido». Medido: **no hay
catálogo**, pero sí **enums de Prisma y tipos de intervención** que cubren buena parte. Que no sean
`VariableCatalog` no los hace inexistentes; es la misma equivocación que Daniel corrigió el 2026-09-07
(`lib/traceability/lotProcess.ts:45–51`: «la lista ya está de antes»).

**F — `F_physical_interventions`** (9 valores; `["none", "chilling", "freezing", "hot_immersion",
"cold_immersion", "agitation", "pressure", "ultrasound", "ozone_uv"]`):

| id | lo que ya existe | veredicto |
|---|---|---|
| `none` | — | — |
| `chilling` | el mecanismo de `manejo_temperatura.cold_hold_prefermentativo` | dudosa: uno es el régimen (C), el otro la intervención (F); el paquete los pone juntos en T02 |
| `freezing` | nada; duplica C=`frozen` y el tipo de paso `freezing` **dentro del propio paquete** | falta |
| `hot_immersion` | el tipo de paso `immersion_hot`; variables `thermal_shock_cycle_duration`, `thermal_shock_cutoff_temperature` (`lib/traceability/units.ts`, unión `MeasurementVariable` desde la línea 33) | falta como valor |
| `cold_immersion` | el tipo de paso `immersion_cold`; `manejo_temperatura.choque_en_frio` («Descenso brusco de temperatura una sola vez»); variables `cold_shock_*`, `river_water_temperature` | dudosa con `choque_en_frio`: el repo lo llama régimen de temperatura, el paquete intervención física |
| `agitation` | **`FermentationInterventionType.agitation`** (`prisma/schema.prisma:4021–4031`: `inoculation, agitation, purge, addition, sample, transfer, termination, other`) | existe como tipo de intervención, no como catálogo |
| `pressure` | variable `vessel_pressure` (units.ts) | falta como valor |
| `ultrasound` | nada | falta |
| `ozone_uv` | el tipo de paso `sanitation` | falta como valor |

**G — `G_drying_regime`** (7 valores) contra **`enum DryingEnvironment`** (`prisma/schema.prisma:756–767`),
que guarda `Location.dryingEnvironment` (`schema.prisma:932`, comentario: «Sólo para `drying_facility`:
qué clase de ambiente es. Es lo que hoy vive como texto libre en `DryingRun.method`»), con sus textos en
`messages/es.json:3143–3160` (`ambiente_*`) y su formulario (`app/instalaciones/FormularioUbicacion.tsx:32`,
`lib/traceability/secadoForm.ts:9` `export const AMBIENTES_DE_SECADO = Object.values(DryingEnvironment);`).
`DryingRun.method` es `String? // 'raised_bed' | 'patio' | 'mechanical' | free text — §16`
(`schema.prisma:4565`), legado.

| id del paquete | descripción (paquete) | `DryingEnvironment` | veredicto |
|---|---|---|---|
| `patio` | concrete/brick/tarp, sun | `open_patio` «Patio abierto»; `floor_tarp` «Piso con lona» | existe como `open_patio`; `floor_tarp` es variante (dudosa: el paquete pone la lona dentro de patio) |
| `raised_bed` | mesh beds (African beds, paseras) | `african_bed_outdoor` «Cama africana a la intemperie» | dudosa: el repo dice «a la intemperie»; el paquete no distingue intemperie de techo, y las camas elevadas también existen dentro de un invernadero (el repo las modela como `drying_bed` bajo la instalación) |
| `shaded_bed` | shade cloth / covered (slow dry) | `covered_patio` «Patio cubierto / marquesina» + `Location.shadePercentage` (`ShadePercentageBracket`) | dudosa: la sombra en el repo es un grado aparte, no un ambiente |
| `greenhouse_solar` | parabolic, **marquesina**, tunnel, modular PC dryer | `solar_greenhouse` «Invernadero solar» | existe como `solar_greenhouse`, **pero «marquesina» cae en sitios distintos**: el paquete la pone aquí, el repo en `covered_patio` |
| `mechanical` | guardiola, static silo, vertical dryer | `mechanical_dryer` «Secadora mecánica» | existe |
| `dark_room_dehumidified` | dark, cool, dehumidified room | `dark_room_climate_controlled` «Cuarto oscuro climatizado» (+ `DryingVentilation.fan_or_dehumidifier`, `DryingRoomLightExposure.without_light`) | existe |
| `two_stage_wet_hull` | to 20–24 %, hull, then to 12–13 % | — | falta, y no es un ambiente: es una secuencia de pasos (`drying` → `hulling_wet` → `drying`) |

`extra_fields` de G: `layer_depth_cm` **ya existe** (`DryingRun.layerDepthCm`, `schema.prisma:4568`);
`target_moisture_pct` ≈ `humedadMinPct/MaxPct` del diseño; `regime_split_pct[]` y `target_aw` faltan.

Pruebas que hoy cubren `DryingEnvironment`: `tests/traceability/secadoForm.test.ts` → it «ambientes
conocidos se conservan; uno inventado no se guarda» (línea 63) y «opciones y errores tienen textos en
español e inglés» (línea 68); `tests/traceability/instalaciones.test.ts` → it «la sombra va en la
instalación y en la cama; la cama sin la suya queda nula, sin copiar» (línea 155, usa `african_bed_outdoor`).

**Lo que el plan tiene que decidir:** la receta declara el régimen que **pide** y la instalación el que
**tiene** (06:196 «capabilities, NOT a specific asset»; 07:182 «Dark-room drying → light_exclusion = true»).
Si los dos usan el mismo vocabulario, la 2c los compara directamente; un catálogo `modo_secado` nuevo
obliga a una tabla de equivalencias entre dos listas de lo mismo.

**A — también hay un enum.** `enum MaterialState` (`schema.prisma:1304`): `CHERRY`, `MUCILAGE_HONEY`,
`PARCHMENT`, `GREEN`, `BEE_HONEY`, usado por `Sample.materialState`, `DryingTrayWeighing.materialState` e
`InstrumentMeasurementMode.materialState`; y `MATERIALES_DE_SECADO = ["CHERRY", "MUCILAGE_HONEY",
"PARCHMENT"]` (`secadoForm.ts:7`). Es el eje A a grano grueso, ya en uso en el secado.

**H — `H_post_drying_conditioning`** (`reposo, hermetic_storage, aged_green, monsooned, barrel_aged,
decaffeinated`): ningún catálogo. Lo cercano: `recipiente.GrainProBag` es **un** recipiente hermético
concreto; `EquipmentFormat` (`barrel, cube, chip, stave, spiral, other`, `schema.prisma:5620`) es para el
envejecimiento en madera; `storage.packaging_enum` del 04 trae `hermetic_multilayer`. El diseño no crea
catálogo H, y no le hace falta en la 2a: esos pasos no tienen registro (§4.6).

### 2.2 En la otra dirección: lo que el repo tiene y el paquete no

| catálogo.valor del repo | equivalente en el paquete | nota |
|---|---|---|
| `manejo_temperatura.choque_en_frio` | ninguno en C; F=`cold_immersion` o `chilling` | dudosa (ver F) |
| `condicion_oxigeno.maceracion_carbonica` | B=`co2_flushed` **y** A=`whole_cherry` | combinación de dos ejes; el repo la guarda como un valor de B. Coincide con la regla del paquete (06:132 «carbonic maceration = whole cherry in CO₂») |
| `medio_lavado` (catálogo entero) | **no es un eje del paquete**; es una dimensión de la casa (ADR-053, decisión 4) | `agua_limpia` = lavado normal (sin eje); `mosto_propio` ≈ E=`own_coffee_derivative` del mismo lote (no es `backslopped`, que es de un lote previo); `mosto_de_otro_lote` ≈ D=`backslopped` + E=`own_coffee_derivative` (así codifica el paquete M02 `{"D":"backslopped","E":"own_coffee_derivative"}`); `ninguno_natural` = no hay paso `washing` |
| `sustrato_anadido.doble_mosto` | dentro de E=`own_coffee_derivative` | más estrecho |
| `recipiente.*` (`Tanque I`, `Tanque II`, `Tanque III`, `Cooler I`, `Cooler II`, `GrainProBag`) | el paquete **no tiene eje recipiente**: tiene `vessel {type: tank\|bag\|barrel\|bioreactor\|bed\|patio\|silo\|room, material, volume_l, valve, headspace_pct}` (R6:436–437) y `vessel_requirement {class, sealable, gas_ports, thermal_control, light_exclusion}` (06:196) | **los seis valores del repo son NOMBRES DE EQUIPOS, no clases.** `Tanque I–III` → instancias de `tank`; `GrainProBag` → instancia de `bag` hermético (H=`hermetic_storage`); `Cooler I–II` → dudosa (¿`tank` aislado? ¿`room`?). Y `FermentationRun` ya apunta al equipo real (`vesselEquipmentId → Equipment`, `schema.prisma:4088`, modelo desde la línea 4047) |
| `grado_proceso` (`Natural`, `Washed`, `Semi Wash 50%`, `Semi Wash 75%`, `Honey`) | las familias W/N/H/WH, que el paquete declara **«display only»** (R6:410; 06 §5 `family_primary (display only)`) | `Natural`↔N, `Washed`↔W; `Honey` de la casa = **sólo 100 %** (diseño §7), mientras la familia H del paquete va de 10 % (H01) a 100 % (H04/H06); `Semi Wash NN %` = **% QUITADO** (ADR-181 #12, `docs/architecture/DECISIONS.md:11965`), así que «Semi Wash 75 %» = 25 % retenido ≈ H02 del paquete. **Y el paquete tiene «semi-washed (Brazil usage)» como alias de W06 (desmucilaginado mecánico)**: casar por nombre lo mandaría a la familia equivocada |
| `seleccion_metodo.flotacion` | tipo de paso `sorting_flotation` | el catálogo dice el método; el paso lo dice la receta |
| `cereza_flotado` (observación) | V-REC-06 «Floaters removed» | observación, no paso |
| `levadura_cultivo` (`Sunrise Orange`, `Deep Amber`, `Cool Blue`, `Green Origin`, `MP72`, `HDA54`, `Spontaneous Wild`) | `inocula[].product` (D) | **el diseño no lo nombra** (0 menciones de `levadura_cultivo`); `MP72` es la cepa del rol `bioprotection` que falta en `fuente_microbiana` |
| `metodo_inoculacion` (`direct pitch`, `rehydrated`, `spontaneous`) | `inocula[].rehydration` (presente/ausente); `spontaneous` repite D=`spontaneous` | **el diseño no lo nombra** (0 menciones) |

### 2.3 Cómo funciona `aliasOf` hoy — y por qué no cruza catálogos

`lib/research/catalogs.ts:17–36`, la interfaz completa:

```ts
export interface VariableCatalogValueDef {
  value: string;
  impliesUnknownIdentity?: boolean;
  aliasOf?: string;
  definition?: string;
}
```

(con sus comentarios en medio; **no tiene `displayOrder`**: ése vive en la base,
`prisma/schema.prisma:9197` `displayOrder Int @default(0) @map("display_order")`, y la semilla lo saca de
la posición en el arreglo, `prisma/seed.ts:102` y `:109` `displayOrder: index`).

El alias **sólo se resuelve dentro del mismo catálogo**, en los tres sitios que lo escriben:

- semilla, `prisma/seed.ts:120–133`: busca el canónico con
  `where: { catalogId_value: { catalogId: row.id, value: value.aliasOf } }` y, si no está, lanza
  `` `Catalog "${catalog.key}": value "${value.value}" aliases "${value.aliasOf}", which is not defined in the same catalog.` ``
- `addVariableCatalogValue` (`lib/research/protocols.ts:298`), líneas 315–319:
  `if (!canonical || canonical.catalogId !== catalog.id) throw new ProtocolValidationError("alias_target_not_in_same_catalog");`
- `setVariableCatalogValueAlias` (`lib/research/protocols.ts:401`), líneas 411–413, la misma regla.
- y un solo salto: `alias_target_is_itself_an_alias`.

Pruebas que cubren alias hoy: `tests/research/ro1-2.test.ts:383` «both exist as separate, non-aliased
VariableCatalogValue rows with distinguishing definitions» (`anaerobico` ≠ `maceracion_carbonica`);
`tests/research/ro1.test.ts:440` «§5.4 — no color<->percentage alias remains loaded anywhere in either
catalog»; `tests/traceability/selection.test.ts:193` «un alias de categoría de rechazo se guarda como su
fila canónica». **Ninguna prueba ejerce el error de alias entre catálogos** (`git grep` de
`alias_target_not_in_same_catalog` en `tests/` → 0; el mismo `git grep` en `lib/` → 2, así que la orden
mira donde debe).

Pruebas que cubren los catálogos que la 2a amplía: `tests/traceability/catalogos-de-intervencion-existen.test.ts`
→ «el análisis ve los dos lados» (34), «ninguna clave de la lista apunta a un catálogo que no existe» (44),
«y ninguno de ellos está sembrado sin valores, que se pintaría igual de vacío» (52), «la cepa de levadura
se puede registrar contra un lote, y MP72 está en el vocabulario» (69). Y como los catálogos son
**compartidos con Research OS** (`ProtocolVariable` tipado por catálogo, ADR-053), también
`tests/research/ro1-2.test.ts` §5.1–§5.11, que leen `condicion_oxigeno`, `manejo_temperatura`,
`fuente_microbiana`, `medio_lavado`. Añadir un valor a esos catálogos cambia las opciones también allí.

---

## 3. (c) `04_reference_parameters.json`

### 3.1 Estructura

Claves de primer nivel: `_meta`, `deprecated_keys` (15), `parameters` (**208**), `production_systems`,
`panama`.

`_meta`:
- `version` "2.0", `generated` "2026-10-02", `supersedes` la v1 del 2026-10-01.
- `purpose`: «Reference defaults … **NOT hard rules**. Every value is an overridable default with
  provenance, confidence and (where sources disagree) an authority profile.»
- `override_hierarchy`: `["protocol", "block", "farm", "tenant", "authority_profile", "reference_default"]`.
- `authority_profiles`: `CENICAFE`, `ANACAFE`, `ICAFE`, `UH_CTAHR`, `CODEX_ISO_SCA`, `MIDA_PA`, `VNT_2025`.
- `confidence_scale`:
  - `high` — «standards body, law, research institute document or peer-reviewed source read directly»
  - `medium` — «single study, institute summary, vendor spec, or consistent trade practice»
  - **`low` — «vendor/secondary claim, unsourced, contradicted, or inferred»**
- `evidence_notes`: «`derived` = arithmetic on published numbers by Néctar Nómada review; **`NN` = Néctar
  Nómada addition, verify before production use**. Full citations with URLs are in research/R1–R7.»
- `sources`: 44 ids (`VNT-2025`, `CENICAFE`, `ANACAFE-2018`, `CODEX-CXC69`, `ISO-6673`, `FERMENTIS`, `NN`, …).

**Qué significan `low` y `NN`, y por qué son dos marcas distintas:** `low` es un valor de `confidence`;
`NN` es un **id de fuente** (`source`). Son independientes: de los 208, **11** llevan `NN` en `source`, y
uno de ellos es `high` (`massbalance.moisture_normalisation`, la fórmula); `drying.interruption_rule` mezcla
fuentes (`["CENICAFE AT562","ANACAFE-2018","NN gate"]`, `medium`). Para marcar «NN» hay que leer `source`,
no `confidence`. Recuento total de confianza: high 102, medium 73, low 33.

**Cómo se expresa un valor** (recuento de claves sobre los 208): `key` 208, `source` 208, `confidence` 208,
`value` 139, `unit` 133, `note` 79, `min` 65, `max` 66, `alt` 10, `legal` 8, `profile` 7, `formula` 5,
`enum` 2, `default` 2, `default_high_density_full_sun` 2, `configurable_range` 1, `outer_range` 1,
`hard_bounds` 1, `scope` 1, `use` 1, `effective` 1.

- **Escalar:** `"value": 34` (+ `unit`).
- **Rango:** `"min"` y/o `"max"` (puede faltar uno: `harvest.max_floaters_pct` sólo `max: 5`); o `value`
  como par `[min, max]` dentro de un objeto.
- **Objeto con sub-valores con nombre:** `"value": {"running_channel":[18.7,39],"tank_washing":[4.1,4.2],…}`.
- **Escalar + tope:** `drying.layer_depth_cm.solar_dryer` = `value: 2, max: 4`.
- **Nulo deliberado:** `massbalance.natural_honey_factors` `value: null`, note «No authoritative factors
  found; derive from own weighings.» (el prompt prohíbe inventar donde dice `null`, 00:75).
- **Texto / regla:** `drying.interruption_rule`, `drying.moisture_method`.
- **Booleano:** `drying.direct_firing_allowed: false`.
- **Fórmula:** `massbalance.moisture_normalisation` `"formula": "w2 = w1 × (1 − m1)/(1 − m2)"`.
- **`source`:** cadena (178) o arreglo (30). Muchas llevan sufijo (`"CENICAFE AT577"`,
  `"CENICAFE (Huila ch.7)"`, `"ELHALIS-2023 (Jackels 2005)"`). **Cuatro de las de proceso NO están en
  `_meta.sources`:** `"R6 (PDG)"`, `"derived"`, `"US EPA EQ-01-08"`, `"Hanna manual"` — un archivo de
  referencias que resuelva la fuente por id no las encontrará.
- **`profile`** = qué autoridad da ese valor; **`alt`** = el valor de otra autoridad
  (p. ej. `drying.layer_depth_cm.patio` `profile: "CODEX_ISO_SCA"`, `alt: {"ANACAFE":7}`).
- **`scope`** y **`use`** acotan dónde vale: `process.washed_fermentation_hours_generic` →
  `scope: "generic washed fallback ONLY — never applied to CryoBloom, inoculated or other custom protocols"`;
  `process.washed_ph_endpoint_info` → `use: "info-only; protocol endpoints rule"`.
- **`legal: true`** = norma, no referencia (`legal.pa.wastewater_limits`).
- `hard_bounds` sólo en `harvest.ripe_brix_plausibility` (`[5,35]`).

`deprecated_keys` que tocan proceso: **una**, `process.washed_water_l_per_kg_cherry` (v1 «10–20»):
«No authoritative support; ≥10× higher than Cenicafé conventional washing. Replaced by
process.water_l_per_kg_cps.*».

### 3.2 Los 77 parámetros que tocan pasos de procesamiento — todos

Criterio: prefijos `harvest` (lo de recepción), `process`, `inoculum`, `drying`, `storage`, `calibration`
(instrumentos de pH/Brix/humedad/aw), `massbalance`, `wastewater`, `byproduct`, más
`legal.pa.wastewater_limits`. Recuento: 6 + 16 + 4 + 24 + 8 + 4 + 8 + 4 + 2 + 1 = **77**. Tabla generada
por programa desde el JSON (sin teclear valores); la columna «paso(s)» es mi asignación. Marca: **low** =
`confidence: low`; **NN** = `NN` en `source`; `derived`; `legal`.

| # | clave (04) | valor / rango | unidad | fuente | confianza | marca | paso(s) | extras (profile · alt · scope · use · legal · note) |
|---|---|---|---|---|---|---|---|---|
| 1 | `harvest.ripe_brix_plausibility` | 15–25 ; hard_bounds [5,35] | °Brix | VNT-2025 | low | **low** | reception |  |
| 2 | `harvest.brix_by_stage_reference` | {"unripe":[17.9,18.3],"semi_ripe":[19.5,19.8],"ripe":[21.2,21.5],"overripe":[22.1,23.8]} | °Brix (mucilage, cv. Colombia) | MARTINEZ-2017 + CENICAFE | medium | — | reception | note: Another Cenicafé series: ripe 14.6–18.6 (mean 17.05). Variety-specific; targets user-defined. |
| 3 | `harvest.max_unripe_pct_warning` | 2.5 | % | MARTINEZ-2017 | medium | — | reception | note: Above 2.5 % unripe ≈ 30 % of cups rejected (cv. Colombia). |
| 4 | `harvest.min_ripe_pct_modified_fermentation` | 80 | % | CENICAFE | medium | — | reception | note: ≥ 80 % ripe, < 2.5 % unripe, no overripe for modified fermentations (AT554). |
| 5 | `harvest.max_floaters_pct` | –5 | % | VNT-2025 | low | **low** | reception · sorting_flotation | note: No standards-body limit; floaters appear only as a green defect. |
| 6 | `harvest.window_months` | 2–4 | — | ACT-INV-2026 | medium | — | — (cosecha, no es paso) |  |
| 7 | `process.depulp_warn_hours` | 10 | h after picking | ANACAFE-2018 | high | — | reception → pulping | profile: ANACAFE |
| 8 | `process.depulp_max_hours_after_harvest` | –24 | h | ACT-INV-2026 | medium | — | reception → pulping | note: Outer flag. |
| 9 | `process.cherry_hold_no_loss_hours` | 48 | h | CENICAFE | medium | — | reception · cold_hold (espera) | profile: CENICAFE · note: 48 h hold of selected ripe fruit with no score loss (AT589). Mass core temperature logging REQUIRED when hold > 10 h (mass reached 38–41 °C at 48 h in sacks). |
| 10 | `process.water_l_per_kg_cps` | {"running_channel":[18.7,39],"tank_washing":[4.1,4.2],"hydrocyclone":1.9,"becolsub":[0.7,1],"ecomill":[0.3,0.5],"waterless_pulping":0} | L per kg dry parchment | CENICAFE | high | — | pulping · demucilage · washing |  |
| 11 | `process.flotation_water_l_per_kg_cherry` | 1.6 | L/kg cherry | CENICAFE | medium | — | sorting_flotation | note: Clean, not recirculated. |
| 12 | `process.washed_fermentation_hours_generic` | 6–72 | h | ELHALIS-2023 + HURTADO-2024 + ACT-INV-2026 | low | **low** | fermentation | scope: generic washed fallback ONLY — never applied to CryoBloom, inoculated or other custom protocols · note: ACT-INV said 12–36; literature span 6–72. |
| 13 | `process.washed_ph_endpoint_info` | {"complete_within_2h_at":5,"overferment_at":4,"solid_start":[5,5.3],"solid_end":[3.7,3.9],"submerged_start":[5.3,5.6],"submerged_end":[3.9,4.2]} | pH | ELHALIS-2023 (Jackels 2005) + CENICAFE | medium | — | fermentation | use: info-only; protocol endpoints rule |
| 14 | `process.time_past_endpoint_warn_h` | 2 | h | CENICAFE | high | — | fermentation |  |
| 15 | `process.fermentation_defect_risk_mass_temp_c` | 34 | °C | CENICAFE | medium | — | fermentation | note: Defect risk above 34 °C with long times (AT554). |
| 16 | `process.mucilage_pct_of_depulped_mass` | 22 | % | CENICAFE (Huila ch.7) | medium | — | pulping · demucilage (balance) | note: ≈ 12 % of cherry mass (derived). |
| 17 | `process.pulp_pct_of_cherry` | 40–44 | % | CENICAFE AT370 | high | — | pulping (balance) |  |
| 18 | `process.tank_volume_l_per_kg_cherry` | 0.666 | L/kg cherry (baba volume) | CENICAFE AT408 | high | — | fermentation (capacidad → 2c) |  |
| 19 | `process.tank_free_volume_pct` | 30 | % | CENICAFE AT408 | high | — | fermentation (capacidad → 2c) |  |
| 20 | `process.bulk_density_kg_m3` | {"cherry":[616,622],"depulped_baba":[803,827],"washed_wet":[694,702],"drained":[678,687],"dry_parchment":[386,391],"green":[707,710]} | — | CENICAFE AT370 | high | — | derivadas (headspace, capa) → 2c |  |
| 21 | `process.pulper_quality_limits_pct` | {"damaged_beans_max":1,"unpulped_in_coffee_max":1,"pulp_in_coffee_max":2,"coffee_in_pulp_max":0} | % | CENICAFE AT294 / NTC 2090 | high | — | pulping |  |
| 22 | `process.sealed_vessel_pressure_max_kpa` | 103 | kPa (15 psi) | PENAGOS | medium | — | fermentation sellada (SEGURIDAD) | note: Vendor rating; never exceed vessel rating. |
| 23 | `inoculum.safcoffee.dose_g_per_kg` | {"green_origins":1,"sunrise_orange":1,"cool_blue":1,"deep_amber":2} | g/kg cherry or depulped | FERMENTIS | high | — | inoculation |  |
| 24 | `inoculum.safcoffee.temp_c` | {"green_origins":[20,30],"sunrise_orange":[20,30],"deep_amber":[8,30],"cool_blue":[8,18]} | °C | FERMENTIS | high | — | inoculation |  |
| 25 | `inoculum.safcoffee.rehydration` | {"water_ratio":10,"temp_c":[15,35],"minutes":[15,30]} | — | FERMENTIS | high | — | inoculation | note: Cool Blue rehydration 10–25 °C. |
| 26 | `inoculum.yeast_storage_c` | {"unopened_6_months_below":25,"long_term_below":15,"opened_days_max":7,"opened_temp_max":4} | °C | FERMENTIS | high | — | — (bodega de insumos, no es paso) |  |
| 27 | `drying.final_moisture_pct` | 10–12 | % w.b. | ANACAFE-2018 + CENICAFE + VNT-2025 + ACT-INV-2026 | high | — | drying |  |
| 28 | `drying.max_moisture_pct` | 12.5 | % | CODEX-CXC69 | high | — | drying |  |
| 29 | `drying.moisture_method` | ISO 6673:2003 (105 °C, 16 h) as reference; capacitance meters calibrated per ISO 24115 | — | ISO-6673 + ISO-24115 | high | — | drying |  |
| 30 | `drying.water_activity_fail` | 0.7 | aw | SCA-2018 | high | — | drying |  |
| 31 | `drying.water_activity_warn` | 0.65 | aw | NN | low | **low** **NN** | drying |  |
| 32 | `drying.water_activity_target_optional` | 0.6 | aw | ROYAL | low | **low** | drying | note: Importer soft target, not a standard. |
| 33 | `drying.aw_at_10_12_pct_moisture_reference` | 0.61–0.63 | aw | CENICAFE AT583 | medium | — | drying | note: aw rises ≈ 0.02 per +10 °C; store sample temperature with every aw reading. |
| 34 | `drying.layer_depth_cm.solar_dryer` | 2 ; –4 | cm | CENICAFE AT577 | high | — | drying | profile: CENICAFE |
| 35 | `drying.layer_depth_cm.patio` | 3–5 | cm | CODEX-CXC69 | high | — | drying | profile: CODEX_ISO_SCA · alt: {"ANACAFE":7} |
| 36 | `drying.layer_depth_cm.silo_max` | 35–40 | cm | CENICAFE | high | — | drying |  |
| 37 | `drying.solar_load_kg_m2` | 14 | kg washed parchment/m² at 2 cm | CENICAFE AT577 | high | — | drying |  |
| 38 | `drying.turns_per_day_min` | 3–4 | turns/day | CENICAFE AT577 | high | — | drying | note: ACT-INV 'hourly' unsupported; Codex 'constantly during daytime'. |
| 39 | `drying.mech_bean_temp_max_c` | 40 | °C | ANACAFE-2018 | high | — | drying | note: Alarm on bean temperature, not air alone: with 50 °C air the bean reached 48 °C (AT576). |
| 40 | `drying.seed_bean_temp_max_c` | 38 | °C | CENICAFE | high | — | drying |  |
| 41 | `drying.mech_air_temp_max_c` | {"static":50,"rotary":60} | °C | CENICAFE + ANACAFE-2018 | high | — | drying | note: Thermostat band 48–52 °C; crystallised beans above 50 °C. |
| 42 | `drying.airflow_m3_min_per_t_cps` | 100 | m³/min per t dry parchment | CENICAFE | high | — | drying | note: Older value 66 (2000). |
| 43 | `drying.air_reversal_h` | 6–8 | h | CENICAFE | high | — | drying |  |
| 44 | `drying.interruption_rule` | warn on any stop while moisture > 30–40 % (aw > 0.90); planned nightly stop allowed below that with cool-down log | — | CENICAFE AT562 + ANACAFE-2018 + NN gate | medium | **NN** | drying |  |
| 45 | `drying.aw_0.95_to_0.80_max_days` | 4 | days | ROYAL | low | **low** | drying |  |
| 46 | `drying.direct_firing_allowed` | false | — | CENICAFE | high | — | drying | note: Combustion gases → smoky/discoloured beans; use indirect heat exchanger. |
| 47 | `drying.night_rewetting_moisture_pct` | 20 | % | CENICAFE AT577 | high | — | drying | note: Below 20 % moisture, beans reabsorb water at night in solar dryers; cover or lower sheet. |
| 48 | `drying.cooling_before_bagging_h` | 8–10 | h | ANACAFE-2018 | medium | — | drying → reposo |  |
| 49 | `drying.reposo_days_min` | 21 | days | ANACAFE-2018 | medium | — | reposo |  |
| 50 | `drying.wet_hull_moisture_pct` | 20–24 | % | R6 (PDG) | low | **low** | hulling_wet |  |
| 51 | `storage.temp_c_ref` | 22 | °C | ISO-8455 | high | — | storage | alt: {"ANACAFE":20,"CENICAFE_extended_life":[10,12]} |
| 52 | `storage.rh_max_pct` | 60 | % | ISO-8455 | high | — | storage | alt: {"ANACAFE":65,"CENICAFE_low_temp":[69,77]} · note: Store RH limit as a function of temperature. |
| 53 | `storage.rh_critical_pct` | 80 | % | CODEX-CXC69 | high | — | storage |  |
| 54 | `storage.wall_clearance_m` | 0.8 | m | ISO-8455 | high | — | storage | alt: {"ANACAFE":0.5} |
| 55 | `storage.ridge_clearance_m` | 2 | m | ISO-8455 | high | — | storage |  |
| 56 | `storage.transport_moisture_max_pct` | 12.5 | % | CODEX-CXC69 + ISO-8455 | high | — | — (transporte) |  |
| 57 | `storage.port_dwell_max_h` | 72 | h | ISO-8455 | high | — | — (transporte) |  |
| 58 | `storage.packaging_enum` | ["jute","sisal","fique","hermetic_multilayer","vacuum","other"] | — | NN | medium | **NN** | storage (H hermetic) | note: High-barrier bags held ≤ 12.3 % over 365 d; fique/paper ≈ 15 % (AT590). |
| 59 | `massbalance.washed_cherry_to_cps` | 4.5–5 | kg/kg | CENICAFE AT370 | high | — | pulping→drying (balance) | note: 4.89–4.94 cv. Colombia; Anacafé 5:1. |
| 60 | `massbalance.washed_cps_to_green` | 1.25 | kg/kg | CENICAFE AT370 | high | — | milling (balance) | alt: {"ANACAFE":1.3} |
| 61 | `massbalance.washed_cherry_to_green` | 6.25 | kg/kg | derived | medium | derived | balance total |  |
| 62 | `massbalance.hulling_loss_washed_pct` | 17.75–18.4 | % | CENICAFE AT370 | high | — | milling |  |
| 63 | `massbalance.natural_husk_pct_of_dry_cherry` | 54.6 | % | CENICAFE AT557 | medium | — | milling (natural) |  |
| 64 | `massbalance.natural_vs_washed_drying_mass_ratio` | 1.582 | × | CENICAFE AT557 | medium | — | drying (natural) | note: Whole cherry brings 58.2 % more mass to dry; ≈ 2.3× solar area per unit green. |
| 65 | `massbalance.natural_honey_factors` | null | — | NN | low | **low** **NN** | balance natural/honey | note: No authoritative factors found; derive from own weighings. |
| 66 | `massbalance.moisture_normalisation` | fórmula: w2 = w1 × (1 − m1)/(1 − m2) | — | NN | high | **NN** | drying (fórmula) |  |
| 67 | `calibration.ph_meter` | {"frequency":"each day of use","buffers":[4,7],"slope_accept_pct":[95,105]} | — | US EPA EQ-01-08 | high | — | instrumento (todos los pasos con lectura) |  |
| 68 | `calibration.refractometer` | {"frequency":"daily","zero":"distilled water","accuracy_brix":0.2} | — | Hanna manual | medium | — | instrumento (todos los pasos con lectura) |  |
| 69 | `calibration.moisture_meter` | {"standard":"ISO 24115","reference_samples_min":5,"range_pct":[8.5,13.5],"spacing_pct":[0.7,1.3],"condition_h":72,"readings_each_min":3,"coverage_k":2,"frequency":"before each harvest and on drift > 0.5 points vs ISO 6673","warm_sample_equilibrate_min":30} | — | ISO-24115 + CODEX-CXC69 + CENICAFE AT580 | high | — | instrumento (todos los pasos con lectura) |  |
| 70 | `calibration.aw_meter` | {"standards":"saturated salt solutions","log_sample_temp":true} | — | NN | low | **low** **NN** | instrumento (todos los pasos con lectura) |  |
| 71 | `wastewater.raw_cod_mg_l` | 25000–165000 | mg/L | CENICAFE | high | — | — efluente de pulping/washing (no es de la receta) |  |
| 72 | `wastewater.raw_ph` | 3–4 | pH | CENICAFE AT537 | high | — | — efluente de pulping/washing (no es de la receta) |  |
| 73 | `wastewater.lime_dose_g_l` | 4–5.2 | g Ca(OH)2/L | CENICAFE AT537 | medium | — | — efluente de pulping/washing (no es de la receta) |  |
| 74 | `wastewater.pulp_absorption_kg_per_l` | 2–3 | kg pulp per L washwater | CENICAFE AT538 | medium | — | — efluente de pulping/washing (no es de la receta) | note: 83–89 % retained in 24 h. |
| 75 | `byproduct.pulp_pit_volume_m3_formula` | fórmula: 0.002 × annual kg cps | — | CENICAFE AT068 | medium | — | — pulpa (no es de la receta) |  |
| 76 | `byproduct.pulp_to_humus_months` | 4–6 | — | CENICAFE AT068 | medium | — | — pulpa (no es de la receta) |  |
| 77 | `legal.pa.wastewater_limits` | {"ph":[5.5,8.5],"cod_mg_l":100,"delta_temp_c":3,"turbidity_ntu":30,"bod5_mg_l":"pending verification (ACP uses 50; 2000 norm 35)","tss_mg_l":"pending verification (35 in ACP and 2000 norm)"} | — | COPANIT-35-2019 | medium | legal | ? | legal: true · note: Resolución 13/2025 modifies the norm; content not obtained. |

**Ejemplo del diseño §6, comprobado:** «volteo ≥ 3–4 al día · Cenicafé · alta» = fila
`drying.turns_per_day_min` (`min: 3, max: 4`, `turns/day`, `CENICAFE AT577`, `high`, note «ACT-INV 'hourly'
unsupported; Codex 'constantly during daytime'.»). Coincide.

**Recepción (diseño §4.5, «por ejemplo Brix 18–24»):** ese 18–24 es el veredicto fijo del repo
(`brixDeRecepcion.ts`), no del paquete. Las referencias del paquete para recepción son
`harvest.ripe_brix_plausibility` 15–25 (**low**, vendedor) y `harvest.brix_by_stage_reference` (medium,
maduro 21,2–21,5 en cv. Colombia, con otra serie de Cenicafé «ripe 14.6–18.6»). Al ponerlas al lado, la
pantalla enseñará que no coinciden; eso es correcto (la receta decide), pero conviene saberlo.

### 3.3 `variables.json` — el plan de medición por paso (complemento)

84 variables, cada una con `code`, `variable`, `unit`, `instrument`, `where_step`, `frequency`,
`reference_range_or_setpoint`, `source`, `confidence`, `rule`. **Las 84 tienen la misma `rule`:**
«reference only; protocol/tenant setpoints override». **`where_step` es texto libre, no un id de tipo de
paso:** aparecen `"flotation"`, `"hold"`, `"holding, cold hold"`, `"sealed fermentation"`, `"submerged"`,
`"loading"`, `"reception → pulping"`, `"end of demucilage or fermentation"`, `"solar / patio"`, etc. Para
colgar una V-* de un `step_type` hay que traducir. Las de proceso son V-REC-01…08, V-HLD-01…03,
V-PUL-01…05, V-WAT-01…03, V-DEM-01…02, V-FER-01…18, V-WSH-01…02, V-DRY-01…19, V-CND-01…02, V-STO-01…05.
Las que más le importan a una receta: V-FER-03 pH («Info only. Solid: 5.0–5.3 → 3.7–3.9. Submerged:
5.3–5.6 → 3.9–4.2», high), V-FER-04 °Brix («Info only; sources conflict», medium), V-FER-07 «Warn > 2 h»
pasado el punto final (high), V-FER-10 presión del recipiente («≤ vessel rating», medium), V-FER-14 dosis
de inóculo (high, Fermentis), V-DRY-01 humedad («End 10–12 %; never > 12.5 %», high), V-DRY-09 volteos
(«≥ 3–4 a day…», high), V-CND-02 reposo («≥ 21 d», medium).

En el repo, el vocabulario de variables medibles es la unión `MeasurementVariable` de
`lib/traceability/units.ts` (línea 33; 60 miembros), que ya trae las de ADR-053: `cold_hold_*`,
`bioprotective_yeast_dose` (g/kg, units.ts:248), `rehydration_time`, `thermal_shock_*`, `cold_shock_*`,
`river_water_temperature`, `submersion_depth`, **`vessel_pressure`**, `brine_concentration`,
`co_ferment_quantity`, `koji_propagation_duration`, `wash_medium_*`.

---

## 4. La regla 8 y las demás reglas del paquete que el plan debe conocer

### 4.1 La regla 8, literal

`00_CLAUDE_CODE_PROMPT.md:35`:

> 8. **Block only for safety and law** (vessel over-pressure, prohibited pesticides, legal riparian
> buffers, child-labour rules, PHI, mandatory agrochemical fields, EUDR geometry for EU packs, strip-pick
> merge without override). Everything else warns.

Repetida como principio 9 de `03_MODULE_MAP_AND_REQUIREMENTS.md:16` («Blocking only for safety and law.
References warn.»). **De la lista, la única que toca un paso de proceso es «vessel over-pressure».** Su
fila en 03 §D (03:173): «Sealed vessel pressure ≥ rating | asset rating | **block / alarm**»; en 07:184
«Pressure setpoint > vessel rating → **block**»; y la referencia `process.sealed_vessel_pressure_max_kpa`
= 103 kPa (15 psi), `PENAGOS`, medium, note «Vendor rating; never exceed vessel rating.»

**D6 del diseño** («mandan las reglas de la casa: la regla 8 vale para umbrales de referencia») es
compatible con el texto: la regla 8 habla de umbrales y referencias; el guardián de coherencia 4.2 es
trazabilidad. Pero el plan debe saber que **03 §D también tiene un «reject» que no es seguridad ni ley**:
«aw without sample temperature → reject» (03:158), y un «forbidden (test)» (03:171, ver regla 3).

### 4.2 Las demás reglas no negociables (00:27–39), resumidas con lo que tocan de la 2a

| # | regla (00) | qué le toca a la 2a |
|---|---|---|
| 1 | Ningún umbral fijo en el código; orden **protocolo → bloque → finca → tenant → perfil de autoridad → referencia** | la receta manda (coincide con ADR-181) |
| 2 | **Perfiles de autoridad**: «Never pick one silently» | 7 parámetros traen `profile` y 10 `alt`. Si el archivo de referencias de §3.5 guarda sólo «valor, fuente, confianza», **elige uno en silencio** (p. ej. capa de patio Codex 3–5 cm contra Anacafé 7 cm; despulpar < 10 h Anacafé contra espera de 48 h Cenicafé) |
| 3 | **Los umbrales de proceso viven en el paso del protocolo.** Los valores de lavado genérico sólo para el respaldo genérico; **«Add a test proving they never apply to CryoBloom, inoculated or other custom protocols.»** | en 03 §D es «Fermentation generic range applied to non-generic protocol → **forbidden (test)**». El §8 del diseño no tiene esa prueba. Si la pantalla precarga valores por defecto desde las referencias, `process.washed_fermentation_hours_generic` (6–72 h, `scope` «generic washed fallback ONLY») no puede caer en una receta que no sea lavado genérico |
| 4 | Protocolo = pasos ordenados con vectores A–I; los nombres son etiquetas; láctico/acético/málico son resultados que exigen datos | coincide con el diseño (§3, §7) |
| 5 | **El protocolo declara capacidades; la corrida asigna equipos reales** | choca con poner un valor de `recipiente` (nombres de equipos) en el paso; ver Sorpresas |
| 6 | Cada medición se une a lote + paso + asignación de equipo + instrumento, con método y T° de muestra, y `calibration_state` al escribir | la 2a une el registro al paso; lo del instrumento es otra parte |
| 7 | **Nunca presentar referencias como hechos o recomendaciones.** La pantalla muestra «referencia · fuente · confianza»; `low` y `NN` marcados visiblemente. **«Never recommend products or doses.»** | coincide con §6 del diseño. Ojo: las dosis de Fermentis (`inoculum.safcoffee.dose_g_per_kg`, high) son referencia de producto; precargarlas como valor por defecto de una adición/inoculación sería recomendar una dosis |
| 8 | Bloquear sólo por seguridad y ley | arriba |
| 9 | Datos regulatorios y de mercado versionados por fecha de vigencia | no toca la 2a |
| 10 | En campo sólo lista + datos que exige el protocolo + observaciones | toca la Parte 4 |
| 11 | Bilingüe es/en con el vocabulario de campo en español | diseño §6 «Textos en es y en» |
| 12 | Migraciones aditivas y reversibles; no tocar datos de producción | general |

### 4.3 Otras reglas del paquete que el plan debe tener a mano

- **Reglas por defecto de divulgación** (06 §5, 06:211–216; R6 §7.3, R6:512–516): adición `exogenous_*` →
  BoP `no`; cualquier inoculante o bioprotección → BoP `unknown` hasta el fallo de SCAP; adición
  `post_green` → WCC `no`; etiquetas de resultado sólo con datos medidos o como «target profile»; «Generic
  washed fallback values … never apply to a non-generic protocol (test required)». **Por eso la
  distinción `exogenous_natural` / `exogenous_flavouring` / `processing_aid` del eje E no es cosmética**:
  decide elegibilidad. Hoy `co_fermentacion` las junta.
- **Definiciones que el paquete fija:** maceración carbónica = cereza entera en CO₂; despulpado + CO₂ =
  «CO₂-flushed anaerobic» (06:132). `cold_hold` es su propio tipo de paso para poder preceder a cualquier
  fermentación (06:183, R6:351).
- **Conflictos que el paquete manda MODELAR, no resolver** (05 §4, 05:92–106), los de proceso: espera de
  cereza Anacafé 10 h contra Cenicafé 48 h («Profile + mandatory mass temperature > 10 h»); punto final de
  °Brix de fermentación AT454 contra AT422 («Info only; protocol endpoints rule»); interrupción del secado
  («warn > 30–40 % (NN gate)»); capa solar Codex 3–5 cm contra Cenicafé 2 cm; HR de bodega; definición de
  maceración carbónica; definición de proceso láctico; humedad de trillado húmedo 20–24 % contra 25–50 %.
- **Fin del paso en el paquete** (06:199 y R6:443): `endpoints: [{variable, operator, value, unit,
  logic_group}]`, «e.g., pH ≤ x OR Brix drop ≥ y OR t ≥ z». El `logic_group` permite agrupar (O de Y);
  el diseño (D2) tiene un `reglaDeFin: primero | todas` global por paso, que es el caso de un solo grupo.
- **Puntos abiertos del paquete que tocan pasos** (05 §5, 06 §7, R6 §8): BoP/CoE/WCC 2026 sobre levadura
  inoculada, bioprotección, enzimas, mosto propio — sin texto; choque térmico y mossto **sin parámetros
  publicados** («enter your own»); «hybrid washed», «supernatural», «hydro», «malic maceration» sin
  significado verificado — alias sólo tras confirmarlo el productor.
- **«Do not»** (00:71–76): ni motores de recomendación ni sugerir productos; no usar casos ni precios de
  subasta como referencia; no afirmar cumplimiento de certificaciones o concursos; **no inventar valores
  donde el paquete dice `null`, «pending verification» o «user-configured»**; no convertir puntajes
  entre sistemas.

---

## 5. Afirmaciones del §1 que me tocaban

| afirmación del diseño | veredicto | evidencia en `d27068d5` |
|---|---|---|
| Cabecera: el paquete trae «`processing_axes.json` (**ejes A–K**, 23 tipos de paso)» | **parcial** | 23 tipos: cierto (`step_types.length` → 23). A–K: el JSON tiene 11 claves A–K, pero **J y K no son ejes** por el propio paquete («derived, not an axis»; «NOT an axis»); 06 §1: «Nine axes (A–I) + two descriptors (J, K)» |
| §1: «Los catálogos de los ejes ya existen en `lib/research/catalogs.ts`: `condicion_oxigeno`, `manejo_temperatura` (con `cold_hold_prefermentativo`), `fuente_microbiana`, `sustrato_anadido` (con `doble_mosto`), `estado_cereza`, `medio_lavado` (con `mosto_de_otro_lote`), `recipiente`» | **cierta** en lo que nombra; **incompleta** en lo que calla | catalogs.ts: `recipiente` 47, `condicion_oxigeno` 230, `manejo_temperatura` 255 (`cold_hold_prefermentativo` 260), `fuente_microbiana` 282, `sustrato_anadido` 303 (`doble_mosto` 313), `estado_cereza` 320, `medio_lavado` 328 (`mosto_de_otro_lote` 342). Calla que el eje G ya tiene `enum DryingEnvironment` (schema.prisma:756) y el A `enum MaterialState` (schema.prisma:1304), y que `levadura_cultivo` / `metodo_inoculacion` cubren `inocula[]` |
| §1: «Un comentario de `lotProcess.ts` recuerda por qué no se crean paralelos: Daniel, 2026-09-07, «la lista ya está de antes»» | **cierta** | `lib/traceability/lotProcess.ts:45–51`: «**Corrección del 2026-09-07.** La primera versión inventaba un catálogo nuevo, `intervencion_de_proceso`. Daniel lo señaló —«la lista ya está de antes»—…» |
| §1: «`VariableCatalogValueDef` (`catalogs.ts:20–36`) sólo tiene `value`, `definition`, `aliasOf`, `displayOrder` e `impliesUnknownIdentity`» | **parcial** | La interfaz está en `catalogs.ts:17–36` y tiene **cuatro** campos: `value`, `impliesUnknownIdentity`, `aliasOf`, `definition`. **`displayOrder` no está en la interfaz**: vive en la base (`schema.prisma:9197`) y la semilla lo pone por posición (`seed.ts:102`, `:109`). La conclusión del diseño (no hay dónde guardar «qué ejes aplican») sigue siendo cierta |

Y las del resto del diseño que dependen del paquete (no son del §1, pero son de esta lente):

| afirmación | veredicto | evidencia |
|---|---|---|
| D1 / §7: `tipo_paso` = «los 23 + `prefermentacion`» | **cierta** | 23 en el JSON; `prefermentacion` no está en el paquete (es de Daniel); `tipo_paso` no existe hoy (`grep -c 'key: "tipo_paso"'` → 0, control `recipiente` → 1) |
| D6: «Regla 8 del paquete («sólo bloquear por seguridad y ley»)» | **cierta** | 00:35, literal arriba |
| §3.5: referencias «copiadas de `04_reference_parameters.json` con su procedencia» | **parcial** | factible, pero «valor, fuente, confianza» deja fuera `profile`/`alt` (regla 2), `scope`/`use` (regla 3) y `legal`; y 4 fuentes de proceso no están en `_meta.sources` |
| §6: «volteo ≥ 3–4 al día · Cenicafé · alta» | **cierta** | `drying.turns_per_day_min` min 3, max 4, `CENICAFE AT577`, high |
| §6: «Los valores `low` y `NN` se marcan visiblemente» | **cierta** (regla 7) | con el matiz de que `NN` está en `source`, no en `confidence` (11 parámetros, uno `high`) |
| §7: `modo_secado` es «nuevo, porque no existe nada parecido» | **falsa** | `enum DryingEnvironment` (schema.prisma:756–767), con textos (es.json:3143–3160), formulario y pruebas; 5 de 7 valores de G tienen equivalente |
| §7: `fisico` es «nuevo, porque no existe nada parecido» | **parcial** | no hay catálogo, pero `FermentationInterventionType.agitation`/`purge` (schema.prisma:4021) y `manejo_temperatura.choque_en_frio` cubren parte |
| §7: `recipiente` gana «cama africana, sacos de cosecha (fiebre), bolsa anaeróbica» | **parcial** | «cama africana» ya existe como `DryingEnvironment.african_bed_outdoor`; los valores actuales de `recipiente` son nombres de equipos, no clases |
| §7: `fuente_microbiana` gana «mosto propio, bioprotección, atomizado» | **parcial** | `bioprotection` es del paquete (D) y falta; «mosto propio» ya es `medio_lavado.mosto_propio` (otro catálogo); **«atomizado» no aparece en el paquete** (`grep -i atomi` en los 25 archivos de texto de la carpeta → 0; control: `bioprotection` en R6 → 8) |
| §7: «"Mosto de otro fermento" … es `mosto_de_otro_lote` de `medio_lavado`, y se pone como alias» | **falsa** como mecanismo | un alias sólo apunta dentro de su propio catálogo: `seed.ts:121–132` lanza, `protocols.ts:318` y `:413` rechazan `alias_target_not_in_same_catalog` |
| §7: «mosto = mossto = lixiviado = «previous-batch starter» → `doble_mosto` / `mosto_de_otro_lote` según el caso» | **parcial** | los sinónimos son del paquete (M02 aliases `["mosto","must re-use","lixiviado","previous-batch starter"]`; «mossto» en 06:148 y 06:173), pero el paquete los pone en **D=`backslopped`** + E; y un alias tiene **un** canónico: «según el caso» no se puede expresar con `aliasOf` |
| §7: `estado_cereza` gana «los estados de mucílago que aún falten (en mucílago, lavado)» | **cierta**, con aviso | faltan 6 de 8 valores de A; y `MaterialState` ya nombra `MUCILAGE_HONEY`/`PARCHMENT` a grano grueso |

---

## 6. Sorpresas — lo que el diseño no prevé y cambia el plan

1. **El paquete no trae el mapa «tipo de paso → ejes».** `EJES_POR_TIPO_DE_PASO` (diseño §3.5) hay que
   construirlo; el modelo del paquete pone A–F en todo paso (06:195). La tabla de §1.1 da la evidencia
   que hay (11 pasos tipados en 18 métodos + R6 §7.2) y es inferencia. El plan debe decirlo en el código.
2. **El eje G ya tiene vocabulario: `enum DryingEnvironment`.** Crear `modo_secado` repite la equivocación
   del 2026-09-07. Además «cama africana» ya existe ahí, y el diseño la añade a `recipiente`. Si el paso
   declara lo que pide y la instalación lo que tiene, compartir vocabulario es lo que deja comparar a la 2c.
3. **Un alias no cruza catálogos.** Dos frases del §7 dependen de eso y no son construibles tal como están.
4. **`recipiente` son nombres de equipos** (`Tanque I`…`GrainProBag`), no clases. Un paso con
   `recipiente = Tanque I` ata la receta a un tanque, contra la regla 5 del paquete, contra 06:196
   («capabilities, NOT a specific asset») y contra E2 de la 2c. Y `FermentationRun` ya apunta a
   `Equipment` (`vesselEquipmentId`, schema.prisma:4088). El paso necesita una **clase** de recipiente
   (o sólo `capacidadesRequeridas`), no un valor de ese catálogo.
5. **El porcentaje de mucílago tiene la base al revés.** Diseño: `mucilagoRetenidoPct` (= el
   `mucilage_retained_pct` del paquete). Casa: «Semi Wash NN %» = % **quitado** (ADR-181 #12). Además:
   «Honey» de la casa = sólo 100 %, la familia honey del paquete va de 10 % a 100 %; y el paquete trae
   «semi-washed (Brazil usage)» como alias del desmucilaginado **mecánico** (W06). Casar recetas por
   nombre con el paquete daría resultados equivocados; sólo el vector es comparable (como dice el paquete).
6. **`fuente_microbiana` no tiene `backslopped` ni `bioprotection`**; la cepa `MP72` está en
   `levadura_cultivo`. Y el paso del diseño **no tiene sitio para `inocula[]`** (producto, dosis,
   rehidratación): D es un valor, y las adiciones (E) apuntan su «sustancia» a `sustrato_anadido`, cuyos
   valores son categorías (`ninguno`, `co_fermentacion`, `doble_mosto`), no sustancias. `levadura_cultivo` y
   `metodo_inoculacion` existen y el diseño no los nombra.
7. **La única regla de bloqueo del paquete que toca un paso —sobrepresión del recipiente— no tiene campo
   en el paso del diseño** (0 menciones de presión). El paquete pone `pressure_kpa_max?` en los setpoints
   del paso (06:197) y compara contra la capacidad del equipo; la variable `vessel_pressure` ya existe.
   Probablemente es de la 2c, pero el plan de la 2a debe decir dónde queda.
8. **Perfiles de autoridad:** guardar sólo «valor, fuente, confianza» elige una autoridad en silencio
   (regla 2). Afecta, entre los de proceso, a `process.depulp_warn_hours` (`profile ANACAFE`),
   `process.cherry_hold_no_loss_hours` (`profile CENICAFE`), `drying.layer_depth_cm.*`, y a `storage.*` con
   `alt`.
9. **`NN` no es una confianza.** La marca visible tiene que leer `source` (11 parámetros; uno `high`).
   Cuatro fuentes de proceso no están en `_meta.sources`.
10. **La regla 3 del paquete exige una prueba que el §8 del diseño no tiene:** que los valores del lavado
    genérico (`process.washed_fermentation_hours_generic`, `scope` «generic washed fallback ONLY») nunca
    se apliquen a una receta CryoBloom, inoculada o propia. Si la pantalla precarga referencias como
    valores por defecto, esa prueba es el guardián.
11. **Las dosis de producto son referencia, no valor por defecto** (regla 7: «Never recommend products or
    doses»). `inoculum.safcoffee.*` es `high` pero de fabricante.
12. **Inconsistencias internas del paquete** que el plan debe resolver tomando el JSON como canónico:
    `sorting_flotation` (JSON) contra `sorting_floatation` (R6:431, R6:472); K con 7 valores en el JSON
    (incluye `funky`) contra 6 en R6 §3 y 06 §1; `mucilage_retained_pct` (JSON) contra `mucilage_pct`
    (R6:294) y `pulp_state` (R6:526); C `cold` «< 15 °C» contra T01 «15–20 °C (Panama)» (06:137); 06 cita
    rutas `master_data/…` que no existen en la carpeta (todo está en la raíz); 06 dice 115 métodos y R6
    «111 entries» (R6:32).
13. **`variables.json` no está indexado por tipo de paso** (`where_step` es texto libre), así que el plan
    de medición por paso necesita una tabla de traducción si se quiere usar.
14. **Los catálogos que la 2a amplía son compartidos con Research OS** (`ProtocolVariable`, ADR-053), con
    sus pruebas en `tests/research/ro1-2.test.ts`. Un valor nuevo en `fuente_microbiana` o
    `condicion_oxigeno` aparece también en los protocolos de investigación.
15. **El eje I no tiene tipo de paso y K no va en el paso.** La `intencion` por paso del diseño está bien;
    las etiquetas K (láctico, málico…) van a nivel de receta y con la palabra «perfil buscado» (diseño §7,
    paquete 06 §5).

---

## 7. Cobertura

**Leído de verdad:** `06_PROCESSING_TAXONOMY.md` entero; `processing_axes.json` entero;
`04_reference_parameters.json` entero por programa (estructura, `_meta`, `deprecated_keys`, los 77
parámetros de proceso volcados completos; los otros 131 sólo por clave y recuento); `00_CLAUDE_CODE_PROMPT.md`
entero; R6 §0, §3, §4, §6, §7, §8; 03 principios y §D; 05 §2, §4, §5; 07 §4 (entidades, derivadas,
capability checks) y §5; `processing_methods.json` por programa (estructura, 18 métodos con pasos, alias
de los métodos citados); `variables.json` por programa (agrupado por `where_step`, las de proceso
completas). En el árbol: `lib/research/catalogs.ts` entero; `lotProcess.ts:40–100`; `prisma/seed.ts:84–135`;
`lib/research/protocols.ts:290–335` y `395–416`; los modelos y enums de `schema.prisma` citados; ADR-053,
ADR-054 y ADR-181 #12 de `DECISIONS.md`.

**No alcancé:** R6 §1–§2 (catálogo descriptivo de métodos) y §9 (referencias), R1–R5 y R7, `01`, `02`,
`08`, `activity_types.json`, `agronomy_catalogs.json`, `mill_assets.json` (sólo por `grep` de capacidades),
`Processing-Steps-Infographic-Final.pdf` (sin herramientas de PDF en esta máquina; no se intentó) y el
`.zip` (no se abrió; se supone copia de lo mismo, **sin comprobar**). **No miré la base**: los catálogos
pueden tener en la base valores añadidos en ejecución (`addVariableCatalogValue`) que no están en
`catalogs.ts`; el diseño (§7) ya manda medir la base antes de añadir.
