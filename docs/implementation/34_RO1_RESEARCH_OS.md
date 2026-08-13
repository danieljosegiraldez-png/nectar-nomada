# RO1 — Research OS: esquema completo, pantallas solo para protocolos PE

**Esquema completo de toda la cadena de Research OS. Pantallas únicamente
para lo que los protocolos PE ejercitan** — cargar, consultar y ejecutar
protocolos con sus mediciones.

Esa asimetría es deliberada. El esquema completo evita rediseño cuando el
resto de la cadena se use; las pantallas se construyen para lo que vas a usar
en las próximas semanas, no para las dieciocho entidades.

**Contexto:** `DOMAIN_MODEL.md` §4 (Research OS),
`RESEARCH_ACTIVITY_CRITERIA.md` completo, y
`29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md` §8. Leelos antes de
empezar.

---

## 1. Por qué esto importa ahora

**PE-77 a PE-112: más de treinta protocolos de post-cosecha en Cafelino**,
dirigidos por el product owner con Eliecer y Roberto, con variables
controladas y aisladas:

- Agua de río versus quebrada
- Con levadura versus sin levadura
- Fermentación vertical versus horizontal
- Bolsa acostada versus parada
- Volumen: una lata versus lata y media

Con mediciones de Brix, pH y humedad hasta secado y taza, más apuntes y
fotos.

**Eso no es documentación de procesos — es diseño experimental con variables
aisladas.** Y hoy no tiene dónde vivir: `Protocol`/`ProtocolVersion` genérico
nunca se construyó (solo existe la versión específica de Sensory), lo cual
además invalida la premisa de `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §J,
que proponía reusarlo — hallazgo 22 de la auditoría `17_` Parte B.

**Y hay un dato que facilita mucho la migración:** las hojas tienen estructura
consistente entre protocolos — mismos campos, distinto detalle. Es **un solo
mapeo, no treinta**.

## 2. Esquema completo — toda la cadena

Construí las entidades de `DOMAIN_MODEL.md` §4:

```
ResearchProgram → ResearchQuestion → Hypothesis → Experiment
  → Protocol → ProtocolVersion
  → TreatmentBatch → ProcessingStage
  → Measurement (ya existe)
  → Evidence → EvidenceClaim
  → Interpretation → Conclusion → Recommendation
  → AnalysisPlan → AnalysisRun → AnalysisResult
  → Publication
  → Deviation → CorrectiveAction
  → Approval
```

**Colisión de nombres a resolver, no ignorar:** el `Recommendation` de
Research OS y el `Recommendation` de la capa de IA (Slice 7, construido) son
cosas distintas con el mismo nombre — hallazgo 18 de la auditoría. Proponé
nombres que los distingan antes de crear el segundo.

**Reusar, no duplicar:**

- `Measurement` ya existe con FKs nulables por padre. Un `TreatmentBatch` o
  una `ProcessingStage` deberían colgar de ahí siguiendo el mismo patrón —
  ADR-020 decisión 8, nunca polimórfico.
- `Sample` es canónico y ya llega a Sensory. La evidencia de un experimento
  que sea una muestra catada no necesita mecanismo nuevo.
- `Asset` ya adjunta fotos con FKs por padre. Las fotos de un protocolo se
  adjuntan igual.
- El patrón `Protocol → ProtocolVersion` versionado ya existe cuatro veces
  en la plataforma —Sensory, toast/char, y otros. **Seguílo, no inventes un
  quinto mecanismo de versionado.**

## 3. Variables experimentales — las reales, no hipotéticas

Un protocolo PE no es una receta: es **un tratamiento con variables
controladas**, donde lo que importa es qué cambió respecto al control.

El modelo tiene que poder responder: *"mostrame todos los protocolos donde la
única diferencia fue agua de río versus quebrada"*, y comparar sus resultados
sensoriales.

**Hoy todas esas variables viven como prosa en una sola columna de
`Comentarios`.** Ejemplo real de una fila: *"GrainProBag, Spontaneous Wild,
vertical position 28 cm height cherry mass"*. Tres variables distintas
mezcladas en texto libre, imposible de consultar.

### 3a. Las variables, con su tipo decidido

Decidido con el product owner. **Respetá esta distinción** — no conviertas
un catálogo en enum ni al revés:

**Tablas de catálogo — ampliables por insert, nunca por migración.** Mismo
patrón que `RBAC.md` §2 usa para Role Profiles: datos, no esquema. Agregar
una levadura nueva no puede requerir un deploy.

| Variable | Valores actuales |
|---|---|
| Recipiente / equipo de fermentado | Tanque I, Tanque II, Tanque III, Cooler I, Cooler II, GrainProBag |
| Levadura / cultivo | Sunrise Orange, Deep Amber, Cool Blue, Green Origin, MP72, HDA54, Spontaneous Wild |
| Método de inoculación | direct pitch, rehydrated, spontaneous |
| Grado de proceso | Natural, Washed, Semi Wash 50%, Semi Wash 75% |
| Cuarto de secado | solar, oscuro (ver nivel de cama, más abajo) |

### 3a-bis. Definición y alias por valor de catálogo

**Cada valor de catálogo lleva dos campos adicionales**, ambos aplicables a
todos los catálogos de §3a — recipiente y equipo de fermentado, cuartos de
secado, levaduras y bacterias inoculadas o espontáneas, tratamientos, métodos
de inoculación, y grados de proceso:

**`definition`, opcional** — qué significa ese valor y qué lo distingue del
vecino. Opcional deliberadamente: exigirla frenaría el registro en campo.
Disponible porque **estandariza el lenguaje con el tiempo y reduce errores**,
que es el objetivo declarado del product owner.

Es el mismo patrón que la taxonomía de miel del product owner ya usa —
`expected_perception` y `technical_cause` junto a cada descriptor. Acá es lo
mismo aplicado a variables de proceso.

**`alias`, opcional** — nombres alternativos que apuntan al mismo valor
canónico.

Y hay un caso concreto que lo justifica, no hipotético: **honey por color y
semi wash por porcentaje son dos formas de nombrar lo mismo** — cuánto
mucílago queda. Un catálogo que tenga `black honey`, `red honey`, `yellow
honey`, `light honey` **y** `semi wash 75%`, `50%`, `25%` sin relacionarlos
permite que el mismo proceso se registre de dos maneras y después no se
pueda comparar.

Resolvelo: o la definición explicita la correspondencia, o uno es el nombre
canónico y el otro su alias. **Recomendá cuál y por qué** — el product owner
conoce la equivalencia real; verificála con él en vez de asumir el mapeo de
porcentajes a colores.

**Enums cerrados:**

| Variable | Valores |
|---|---|
| Fuente de agua | río, quebrada, pozo, red |
| Posición de masa | vertical, horizontal |

**Numérico:** altura de masa de cereza en cm (28 cm vertical, 14 cm
horizontal en los datos reales).

**Nivel de cama en cuarto de secado** — **no es metadato de ubicación: es
variable experimental deliberada.** El nivel determina cuánta luz recibe el
lote, y las Geisha se secan siempre en el nivel bajo porque sus precursores
volátiles son sensibles a la luz en lavado y semi-lavado.

Pero el nivel **por sí solo no dice cuánta luz recibe** — depende de en qué
cuarto está. El cuarto solar tiene 3 niveles con luz; **el cuarto oscuro
tiene 6 niveles y ninguna luz.** Un nivel 1 en el solar y un nivel 1 en el
oscuro son cosas distintas.

Por eso el **cuarto de secado es parte de la variable, no contexto**.
Probablemente el cuarto es una `Location` con su propio atributo de
exposición lumínica —F1 ya construyó atributos de exposición para lotes de
terreno, misma lógica— y el nivel cuelga de ahí, con su cantidad de niveles
propia. Recomendá la forma exacta; no lo modeles como un número suelto.

**Cold hold y fermentación son dos variables independientes**, no una. Las
combinaciones reales, confirmadas por el product owner:

- Cold hold prefermentativo → directo a cama, sin fermentación controlada
- Cold hold → fermentación controlada → cama
- Sin cold hold → directo a cama, natural
- Sin cold hold → despulpado → honey, semi wash o wash

Es decir: *"directo a cama sin fermentación controlada"* **no es un valor de
la variable cold hold — es ausencia de fermentación controlada**, que puede
ocurrir con o sin cold hold. Dos ejes que se combinan libremente.

Eso encaja con el DAG que ya existe: cada etapa es una transformación, y su
presencia o ausencia se lee de la cadena en vez de ser un campo booleano.
Evaluá si estas dos variables necesitan campos propios o si se deducen de las
transformaciones registradas — y decí cuál elegiste.

`Spontaneous Wild` merece atención aparte: **no es una cepa, es ausencia de
cepa conocida.** Registrarlo como si fuera un cultivo identificado afirma
conocimiento que nadie tiene. Es un `dataQuality`, no un nombre de organismo
— la misma distinción que `23_RECIPES_FORMULATION_AND_DISTILLATION.md` §5c ya
estableció para consorcios y fermentación espontánea.

### 3b. Mediciones exigidas por protocolo

**Advertencia de diseño, ya identificada:** el product owner pidió que los
factores "se puedan medir siempre, aunque sean opcionales". **Un campo
opcional es un campo vacío la mayoría de las veces** — ya se vio con
`provenanceClass`. Lo que hace falta no son más campos opcionales, sino que
**un `ProtocolVersion` declare qué mediciones exige y en qué momento**. Si un
batch corre bajo PE-89, el sistema sabe qué medir.

La hoja **Estudio de cerezas** define esas mediciones con vocabulario
controlado real, ya escrito por el product owner:

| Atributo | Vocabulario |
|---|---|
| Selección | uniforme_alta, uniforme_media, heterogenea_leve, heterogenea_alta, mezcla_no_controlada |
| Flotado | sin_flotadores, <2%, 2_5%, 5_10%, 10_20%, 20_30%, >30% |
| Condición visual | brillante, opaco, deshidratado |
| Limpieza | limpio, leve_impureza, contaminado |
| Color | verde, verde_amarillo, pintón, rojo, rojo_intenso, sobremaduro, sobremaduro_fermentado |
| Brix | <14, 14_16, 16_18, 18_20, 20_22, 22_24, 24_26, >26 |
| Firmeza | muy_firme, firme, medio, blando, muy_blando, colapsado |
| Densidad | alta, media_alta, media, media_baja, baja |
| Tamaño/forma de grano | uniforme, mezcla_tamaños, pequeño, irregular |
| Defectos de grano | sano, brocado, vano, defectuoso |

Más peso inicial en kg y densidad como numéricos.

**Reuso probable, evaluar antes de crear:** esto es la misma forma que
`SensoryDescriptor`/`SensoryDescriptorResponse` que R1 acaba de construir —
vocabulario controlado por atributo, versionado bajo un protocolo. Evaluá si
se reusa esa infraestructura en vez de levantar una paralela. Si genuinamente
divergen, decí por qué.

Nota sobre el estado real de esa hoja: **solo dos valores registrados en seis
filas** — Brix 17.53 en pacamara lote 11, Brix 18.5 en Geisha lote 10. Es una
plantilla en uso incipiente, no un dataset completo. Preservalo así; los
vacíos son `missing_source_record`, no ceros.

## 4. Metodología y disciplina estadística

Confirmado con el product owner, y todo esto tiene consecuencias en el
modelo:

### 4a. Control declarado

**Cada experimento tiene un tratamiento control explícito** — el baseline
contra el cual se comparan los demás. No es implícito ni se deduce; se
declara. El modelo debe registrarlo como tal.

### 4b. Una sola corrida por tratamiento — sin replicación

**No hay repeticiones: cada tratamiento se corre una vez.** Con lotes reales
de café eso es lo normal y no es un defecto del método, pero **determina qué
puede afirmar la plataforma.**

Se puede decir *"este tratamiento puntuó 87 y el control 84"*. **No** se puede
decir *"este tratamiento produce en promedio 3 puntos más"*.

El sistema **no debe presentar diferencias entre tratamientos como si fueran
estadísticamente significativas**, ni calcular promedios que impliquen
replicación inexistente. Cualquier conclusión comparativa es
`provenanceClass = 'interpretation'`, nunca `measured_fact` — la misma
disciplina que rige el resto de la plataforma, aplicada al análisis.

`DOMAIN_MODEL.md` §4 ya separa `Evidence → EvidenceClaim → Interpretation →
Conclusion` precisamente para esto. Usalo.

### 4c. Criterio de éxito — dos ejes, no uno

Un tratamiento "funcionó" según **sensorial más mediciones de proceso**, no
solo el puntaje de cata. El modelo debe poder sostener ambos como evidencia
del mismo tratamiento.

### 4d. Bioprotección — constitutiva del método, no variable libre

**Corrección importante sobre cómo modelar la levadura.**

MP72 y HDA54 son las dos cepas recomendadas para **bioprotección**, que es
exactamente lo que CryoBloom busca durante el cold hold prefermentativo.
**Sin bioprotección el cold hold no hace lo que debe hacer.**

Mecanismo, según el product owner: la levadura **coloniza pero no fermenta ni
transforma**, y después se lava y se retira antes del proceso. Eso es
distinto de una levadura de fermentación, y el modelo debería poder expresar
esa diferencia — es la razón por la que MP72, empaquetada para uso enológico,
es válida acá.

Entonces:

- **La bioprotección es parte del protocolo.** Cuál de las dos cepas se usó
  es **la variable**.
- MP72 contra HDA54 es comparación **dentro** del método, bajo un mismo
  `ProtocolVersion`. No son dos protocolos distintos.
- **Un experimento futuro correrá el protocolo completo sin bioprotección** —
  control negativo del método mismo, no una variante. La hipótesis del
  product owner es que habrá fermentación no controlada e inconsistencias
  pese al frío. El modelo debe soportar registrarlo como tal.

### 4e. CryoBloom es un método, no un proyecto

Los PE son identificadores de Cafelino; los ensayos A, B y C son experimento
propio del product owner, posterior. Pero **varios PE usaron el mismo
protocolo prefermentativo**: PE-79 y PE-80 (Cold Hold HDA54 y MP72), PE-97 y
PE-98 (Geisha cold hold MP72), más sus derivados PE-80-94, PE-79-93,
PE-80-92, PE-79-91, PE-97-102.

Confirmado: **usaron el mismo protocolo, no una versión anterior.** La
metodología no cambió; cambió la cepa. Por eso es **un solo
`ProtocolVersion`**, y la pregunta *"todos los tratamientos que usaron
CryoBloom"* se responde como *"todos los `TreatmentBatch` de ese
`ProtocolVersion`"* — sin campo marcador adicional.

Los seis ensayos previos (#1–#6) son **todos cold hold prefermentativo**: el
cold hold es la constante de la serie, no un eje de comparación. Lo que A
contra C aísla es geografía; lo que A contra B aísla es la cepa.

**El modelo debe distinguir variable controlada de constante del protocolo.**
Si todo se registra igual, no se puede responder qué aisló cada experimento.

### 4f. Linaje entre ensayos

Los seis ensayos previos llevaron a A, B y C. Hoy el modelo trataría los
siete como independientes. Debe poder verse que la serie evolucionó — qué
ensayo derivó de cuál y por qué.

## 4g. Los límites declarados — parte del registro, no un hueco

La tarjeta de referencia del product owner lista explícitamente **lo que no
está medido todavía**: β-glucosidasa, GC-MS, LC-MS, pH y °Brix comparativo
pre/post, microbiología cuantitativa, y cupping formal con panel calibrado.

**Eso no es data faltante — es el límite declarado de lo que el método puede
afirmar hoy**, y es lo que separa "observamos esto" de "demostramos esto". El
modelo debe poder registrarlo junto al experimento, no dejarlo solo en un
documento aparte.

**Observaciones sensoriales de cereza** — distintas del puntaje de cata del
café terminado, y evidencia directa del efecto del cold hold: perfil
aromático casi igual antes y después, frutosidad fresca potente con notas
florales, sin notas acéticas ni alcohólicas, integridad física conservada sin
colapso tisular. La hoja de estudio de cerezas (§3b) da los atributos; estas
son observaciones registradas contra un tratamiento.

**Distinción género versus cepa, con matiz regulatorio.** El Q&A del product
owner la trata con cuidado y el modelo no debe aplanarla: *Metschnikowia
pulcherrima* como género tiene GRAS de FDA para uso directo en café (vía
otras cepas comerciales); **MP72 específicamente viene empaquetada por el
fabricante solo para uso enológico.** Si alguien consulta el sistema sobre
esto, debe encontrar la distinción completa, no una simplificación en
ninguna de las dos direcciones.

## 4h. Nomenclatura PE

`PE-77` a `PE-112` son identificadores únicos de Cafelino. La convención
codifica linaje además de identidad (§7). Modelá el identificador como dato
con su convención registrada.

## 5. Pantallas — solo lo que los PE ejercitan

**Construí interfaz para:**

- Crear y versionar un protocolo, con sus variables y mediciones exigidas
- Listar y consultar protocolos, filtrando por variable
- Ejecutar un protocolo contra un lote — crear el `TreatmentBatch` y
  registrar sus mediciones en los momentos que el protocolo declara
- Ver los resultados de un tratamiento, incluyendo su enlace sensorial

**No construyas interfaz para:** `Publication`, `AnalysisPlan`/`AnalysisRun`,
`Deviation`/`CorrectiveAction`, `Approval`, ni la cadena
`Interpretation`/`Conclusion`/`Recommendation`. El esquema existe; las
pantallas llegan cuando se usen.

Reportá explícitamente qué quedó sin pantalla, para que no parezca omisión.

## 6. `RESEARCH_ACTIVITY_CRITERIA.md` — respetarlo, no reimplementarlo

Ese documento define el gate de sustancia que distingue investigación real de
actividad comercial con lenguaje de investigación, con revisor independiente
y regla de no auto-revisión.

**Su §9 es explícitamente bloqueante:** CryoBloom y las actividades de
gastro-turismo deben revisarse contra el test de cinco partes antes de que
proceda trabajo nuevo de actividades. Eso es revisión humana por el
Compliance Reviewer, no algo que este ticket ejecuta.

Lo que sí corresponde acá: que el modelo **soporte** ese gate — el Role
Profile de Research Compliance Reviewer, el estado de cumplimiento, la regla
de independencia. Construilo; no lo apliques.

## 7. Los datos reales — 41 filas ya disponibles

El product owner entregó los CSV reales. **No están en el repositorio;
pediéselos antes de diseñar la importación.** Este ticket no migra nada,
pero el esquema no puede hacer imposible esa importación.

Hallazgos del dataset real, ya verificados:

**El ID codifica linaje, no solo identidad.** `PE-80-94`, `PE-79-93`,
`PE-80-92`, `PE-97-102` son "PE-80 que se transformó en PE-94" — un lote que
pasó por cold hold y después se dividió. **La cadena de transformación ya
está escrita en la nomenclatura.** El DAG de `lot_transformation` la
representa; el importador tiene que leerla en vez de tratar cada fila como
un lote independiente.

Y los sufijos `-A`, `-B`, `-C` son splits del mismo lote: PE-98-A/B/C es
lavado 100%, 75% y 50% del mismo Geisha 10 — un input, tres outputs, la
bifurcación ya verificada.

**Los datos están incompletos y hay que preservarlo así.** `H%` y `fecha
salida secado` están vacías en casi todas las filas; la columna `Lote`
también. Eso es `missing_source_record`, no cero, no estimación.

**Un error de tipeo confirmado:** PE-77 dice `19/2/2023`; el product owner
confirmó que es 2026. Corregilo al importar **y dejá registro de que se
corrigió** — no lo cambies en silencio.

**Dos entidades nuevas aparecen en la hoja de cerezas:** lote 11 pacamara, y
"Geisha Las Nubes, Jaramillo Arriba" — esta última es la finca de Agustín
Gómez que S1 ya modeló. Confirmá que se enlacen a las organizaciones
existentes en vez de crear duplicados.

Reportá qué campos necesitaría un CSV de protocolo PE para importarse limpio,
y qué falta saber del product owner antes de escribir el importador.

**No existe ningún importador** y no se construye acá.

## 7b. Clasificación de los documentos CryoBloom

El product owner también entregó material de CryoBloom: presentación,
protocolo post cold hold, Q&A de respaldo, y una tarjeta de referencia.

**La tarjeta dice literalmente "Documento de uso personal, no distribuir en
mesa".** Si ese material entra a la plataforma va `internal`, nunca `public`
— es la misma disciplina que `03_CRYOBLOOM_PUBLIC_CONTENT_PROMPT.md` ya
estableció: nada de la carpeta de investigación se publica por defecto.

Ese material no se importa en este ticket. Se nombra para que su
clasificación quede decidida antes de que alguien lo cargue.

## 8. Convenciones obligatorias

- **Procedencia por ADR-038** — requerida sin default, elegida en el action
  layer. Una medición de Brix tomada en el momento no es lo mismo que una
  transcrita esa noche.
- **Auditoría en escrituras de evidencia** — C1 §3 y el arreglo posterior de
  fermentación/secado. Las escrituras de este ticket la necesitan.
- **FKs nulables por padre, nunca polimórficas** — ADR-020 decisión 8.
- **`assertDefinedWhere` en limpieza de tests** — ADR-045.
- **Cuidado con la base compartida.** Hay datos reales de A7, F1, S1 y R1.
  Verificá antes y después.
- **Una sola sesión.** Este ticket toca esquema; no lo corras en paralelo con
  otro trabajo sobre el mismo árbol.

## 9. Verificación

1. Crear un protocolo con las variables reales de §3a —recipiente, levadura,
   método de inoculación, grado de proceso, fuente de agua, posición y
   altura, nivel de cama— y las mediciones exigidas de §3b.
2. Versionarlo y confirmar que la versión anterior sobrevive.
3. **Agregar una levadura nueva al catálogo sin migración.** Si requiere
   cambio de esquema, el patrón está mal implementado.
4. Agregar una definición a un valor de catálogo existente y confirmar que
   se lee donde ese valor se usa.
5. Registrar un alias —el caso real: si `red honey` y `semi wash 50%` son
   equivalentes— y confirmar que ambos resuelven al mismo valor canónico y
   que dos tratamientos registrados con nombres distintos siguen siendo
   comparables.
6. Ejecutar dos tratamientos que difieran en **una sola variable** —el caso
   real es PE-81 versus PE-82, vertical 28 cm contra horizontal 14 cm, todo
   lo demás igual— y confirmar que se pueden comparar por esa variable.
7. Reproducir la bifurcación real de PE-98: un lote de Geisha 10 post cold
   hold dividido en lavado 100%, 75% y 50%, reusando el DAG existente.
8. Confirmar que el nivel de cama se interpreta contra su cuarto — que un
   nivel 1 en el cuarto solar y un nivel 1 en el cuarto oscuro no se
   confundan como la misma exposición lumínica.
9. Registrar las cuatro combinaciones de §3a: con cold hold y con
   fermentación, con cold hold sin fermentación, sin cold hold natural, y
   sin cold hold despulpado a honey o lavado.
10. Declarar un tratamiento control en un experimento y confirmar que el
    sistema lo distingue de los demás tratamientos.
11. **Confirmar que el sistema no presenta una diferencia entre dos
   tratamientos de una sola corrida como estadísticamente significativa**, y
   que toda conclusión comparativa queda como `interpretation`.
12. Registrar los límites declarados de §4g contra un experimento —lo que no
    está medido— y confirmar que se leen junto a sus resultados.
13. Llevar un tratamiento hasta muestra y puntaje sensorial, reusando la
    cadena existente sin código nuevo.
14. Confirmar que las mediciones que el protocolo exige no se pueden omitir
    silenciosamente.
15. Confirmar que los datos reales de A7, F1, S1 y R1 siguen intactos.

## 10. Entregables

Migración, capa de servicio, las pantallas de §5, tests, y **texto de ADR en
borrador** con la marca en el encabezado para que no se vuelva huérfano.

Registrá: la resolución de la colisión `Recommendation`, la decisión
catálogo-versus-enum por variable, si se reusó `SensoryDescriptor` para las
mediciones de cereza o se creó infraestructura nueva y por qué, cómo un
`ProtocolVersion` declara sus mediciones exigidas, y qué quedó sin pantalla.

Actualizá `README.md`. Confirmá el siguiente número de ADR contra el archivo
real.

Reportá qué queda pendiente de `29_` después de este ticket.
