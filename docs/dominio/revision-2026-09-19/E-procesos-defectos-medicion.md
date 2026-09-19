<!--
  PROCEDENCIA — informe de un SUBAGENTE, 2026-09-19, copiado sin editar.
  estado    : referencia externa · NO verificado salvo lo que marca con ✅
              ../revision-literatura-fermentacion-2026-09-19.md
  qué NO    : citar desde el código ni como hecho. Tiene errores conocidos: ver la
              §3 de la revisión compilada (correcciones de Codex).
-->

# Tema E — Definiciones de proceso, defectos de sobre-fermentación y vínculo medición↔taza

Revisión de literatura para Néctar Nómada. Sigue las reglas del `BRIEF.md` común: cada
hallazgo lleva cita textual (≤40 palabras), sección/tabla, DOI/URL, condiciones del
experimento, y veredicto RESPALDA/CONTRADICE/NO DICE/MATIZA contra la tabla de
parámetros del software. Cuando no encontré algo, lo digo explícitamente — no invento
cifras ni cito lo que no pude leer.

---

## 0. Fuentes consultadas (11 identificadas, 8 con texto completo leído)

| # | Fuente | Tipo | LEÍDO |
|---|---|---|---|
| 1 | Jackels, Jackels, Vallejos, Kleven, Rivas, Fraser-Dauphinee. "Control of the Coffee Fermentation Process and Quality of Resulting Roasted Coffee... Nicaragua 2005-06." Proceedings ASIC. | Estudio de campo | **texto completo** |
| 2 | Jackels SC, Jackels CF. 2005. "Characterization of the Coffee Mucilage Fermentation Process Using Chemical Indicators: A Field Study in Nicaragua." *J. Food Sci.* 70:C321–C325. | Estudio de campo | **sólo resumen** (citado dentro de la fuente 1 + resumen de buscador; no accedí al texto de *J. Food Sci.*, de pago) |
| 3 | Haile M, Kang WH. 2019. "The Role of Microbes in Coffee Fermentation and Their Impact on Coffee Quality." *J. Food Quality* 2019:4836709. DOI: 10.1155/2019/4836709 | Revisión | **texto completo** |
| 4 | ITC/MARKUP II (consultor no identificado por nombre). "Coffee Processing theory: A preparatory course for CQI Q Processing Arabica Level 2 — Student handbook 2024." | Manual de curso preparatorio para la certificación CQI (NO es el currículo oficial de CQI) | **texto completo** (PDF escaneado, OCR) |
| 5 | Codex Alimentarius / ICO. "Code of Practice for the Prevention and Reduction of Ochratoxin A Contamination in Coffee." CAC/RCP 69-2009. | Norma técnica internacional | **texto completo** |
| 6 | Osorio V, Montoya EC, Rayo-Mendez LM, Harris GK. 2026. "Impact of maturity stage and prolongation of post-harvest processing and mucilage fermentation time on mycotoxin levels in coffee." *Frontiers in Plant Science*. DOI: 10.3389/fpls.2026.1734522 | Estudio experimental (Cenicafé + NC State) | **extraído con foco en tablas numéricas** (no revisé párrafo a párrafo la discusión completa) |
| 7 | Elhalis H, Cox J, Frank D, Zhao J. 2021. "Microbiological and Chemical Characteristics of Wet Coffee Fermentation Inoculated With *Hanseniaspora uvarum* and *Pichia kudriavzevii*..." *Frontiers in Microbiology*. DOI: 10.3389/fmicb.2021.713969 | Estudio experimental | **extraído con foco en tablas numéricas** |
| 8 | (Autoría exacta sin verificar por mí — precaución). "Effect of Bacterial and Yeast Starters on the Formation of Volatile and Organic Acid Compounds in Coffee Beans... During Wet Fermentation." *Frontiers in Microbiology* 10:1287, 2019. DOI: 10.3389/fmicb.2019.01287 | Estudio experimental | **parcial** (extracción, no el artículo completo) |
| 9 | Silva CF et al. (autoría de la tabla citada dentro de Haile & Kang; no accedí al original). "Coffee quality and its relationship with Brix degree and colorimetric information of coffee cherries." *Precision Agriculture* (2014). | Estudio experimental | **no accedido** (paywall Springer/ResearchGate, 403/301 en todos los intentos) |
| 10 | "Variation in Soluble Sugars in Arabica Coffee Cherry Fruits." *Plants* 13(13):1853, 2024. DOI: 10.3390/plants13131853 | Estudio experimental | **texto completo vía PMC** |
| 11 | "Effect of Co-Inoculation with *Pichia fermentans* and *Pediococcus acidilactici*..." *Fermentation* 5(3):67, 2019. DOI: 10.3390/fermentation5030067 | Estudio experimental | **NO accedido** — MDPI devolvió 403 en cuatro intentos (WebFetch directo, redirect, `/htm`, `/pdf`, y `curl` con user-agent de navegador). No cito su contenido. |
| — | "Chemical Composition and Sensory Quality of Coffee Fruits at Different Stages of Maturity." *Agronomy* 13(2):341, 2023. DOI: 10.3390/agronomy13020341 | Estudio experimental | **NO accedido** (403 MDPI). Sólo tengo un resumen de buscador mezclado con otras fuentes — **no lo cito como dato verificado**. |

Total: 11 fuentes identificadas y evaluadas, **8 leídas con datos numéricos verificables**
(6 texto completo estricto + 2 con extracción de tablas focalizada), dentro del rango
8–15 que pide el encargo. Dos quedaron fuera por bloqueo de acceso (declarado, no
inventado su contenido).

---

## 1. Definiciones de proceso: literatura vs. definición del dueño

**Definición del dueño (autoritativa):** lavado = grano a cama de secado SIN NADA de
mucílago; con mucílago = semi-lavado; multiproceso si entra y sale de estados.

### 1.1 CQI (manual preparatorio, no el currículo oficial — ver salvedad abajo)

> "the natural method, the honey method and the washed/Fully-washed method... The table
> below shows the relationship between the anatomy of the coffee fruit and the 3
> processing methods." — Cap. 5

Tabla del manual (verde=se hace, rojo=no se hace):

| | Natural | Honey | Washed |
|---|---|---|---|
| Piel removida | No | Sí | Sí |
| Mucílago removido | No | **No** | **Sí** |
| Fermentación | No | No | Sí |
| Lavado | No | No | Sí |

**Veredicto: RESPALDA** la definición del dueño en el eje binario — "washed" en CQI
significa mucílago 100% removido (0 mucílago), exactamente como dice el dueño.
Pero el manual **no define "semi-lavado" en absoluto** ni dice nada de honey
amarillo/rojo/negro con porcentajes. **NO DICE.**

Salvedad importante: este documento es un manual preparatorio de un consultor
independiente para el curso QP2 de CQI ("A preparatory course for Coffee Quality
Institute (CQI) Q Processing Arabica Level 2"; disclaimer: *"The contents of this
manual...are the sole responsibility of consultant"*), **no es el currículo oficial
publicado por CQI**. Lo trato como fuente de práctica de la industria, no como
norma. Página 18 del manual, sobre el pH-metro:

> "For coffee the recommendation is to stop the fermentation and wash the coffee
> before the pH drops to 4.0 or below. It is preferred to stop the fermentation at
> pH 4.5-4.6." — Cap. 6, "PH meter use"

### 1.2 Codex Alimentarius / ICO — CAC/RCP 69-2009 (norma técnica, texto completo leído)

Esta es la fuente más autoritativa que encontré con definiciones formales (basadas en
ISO 3509). Cita textual, sección 2 "Definitions":

> "Wet process: treatment of coffee cherries consisting of the mechanical removal of
> the exocarp (pulp) in the presence of water, alternatively followed by either removal
> of the mucilage (mesocarp) by fermentation or other methods, followed by washing to
> give parchment coffee, or direct drying of the pulped beans within their mucilaginous
> parchment, followed by hulling to produce 'semi-washed' green coffee. Removal of the
> mucilage is usually followed by drying and hulling to produce 'washed' green coffee."

**Hallazgo importante — trampa terminológica para el dueño:** el "semi-washed" oficial
de Codex/ISO **no es** "grano que llega con algo de mucílago por un lavado incompleto".
Es exactamente lo contrario de un proceso incompleto: es secar el grano despulpado
**con todo el mucílago intacto, sin fermentar ni lavar en absoluto** — es decir, lo que
la industria de especialidad llama hoy "honey process". El manual CQI (fuente 1.1)
coincide con esto: su columna "Honey" también marca mucílago=no removido,
fermentación=no, lavado=no.

**Veredicto sobre la definición del dueño: MATIZA / posible fuente de confusión.**
La definición operativa del dueño ("semi-lavado = llega con mucílago", presumiblemente
por un lavado imperfecto de un proceso que se pretendía "washed") es una categoría
legítima y útil para el software, pero **no corresponde al término técnico
"semi-washed"** tal como lo define la norma ISO 3509/Codex que cita el mismo Codex que
regula OTA. Si el software o la documentación de Néctar Nómada comunican "semi-lavado"
hacia afuera (certificadores, compradores) usando ese nombre, puede leerse como "honey"
por alguien que conoce la norma. Recomendación (no pedida, pero relevante): documentar
internamente que "semi-lavado" en este sistema es una categoría de **desviación de
proceso** (lavado incompleto), distinta del "semi-washed" normativo (proceso honey
deliberado).

Definición adicional relevante de la misma norma:

> "Mucilage: Common word to describe the slimy layer found between the pulp and
> adhering to the parchment inside a coffee cherry, but not removed by pulping.
> **Not present in unripe and overripe coffee.**" — Sección 2

Este último dato ("no presente en cereza inmadura ni sobremadura") es relevante para
la sección de madurez (§3) y no lo había visto en ninguna otra fuente — **NO DICE**
nada sobre cuantificarlo, pero apoya cualitativamente que la ventana de mucílago
"fermentable" depende de la madurez de entrada.

### 1.3 Honey amarillo/rojo/negro (% de mucílago)

Los porcentajes que circulan en el mercado (blanco 80–100%, amarillo 50–75%, rojo
25–50%, negro 0–25% de mucílago remanente) aparecen **de forma consistente en fuentes
comerciales** (787coffee, Bruvi, Hermanos Coffee Roasters, James Coffee Co., CRU Kafe,
JA Coffee, FiXX Coffee) pero **no encontré ninguna fuente académica o normativa que los
defina** — ni el manual CQI, ni el Codex, ni Haile & Kang los mencionan. **NO
ENCONTRADO** en literatura científica. Trátense como convención comercial no
estandarizada, no como dato validado.

### 1.4 Fermentación húmeda: duración típica (RESPALDA/MATIZA)

Tres fuentes independientes dan rangos de duración de fermentación húmeda que se
solapan pero no son idénticos:

- Codex CAC/RCP 69-2009, §4.5 párr. 27: *"the mucilage is broken down by fermenting
  the beans in water at ambient temperature (using microrganisms) for between 12 and
  36 hours"*; párr. 29(d): *"Fermentation should be as short as possible (12 to 36
  hours)."*
- Haile & Kang 2019, sección 2: *"put through a 24- to 48-hour underwater tank
  fermentation process, and dried until the moisture content reaches 10%–12% [9, 10]"*.
- Jackels et al. (fuente 1), Materiales y Métodos: en La Canavalia, Matagalpa,
  Nicaragua (*Coffea arabica* var. Caturra, 750 m, 20–26 °C), la fermentación natural
  sin agua añadida *"typically required approximately 15 hours"*.

**Veredicto: RESPALDA** en general la idea de una ventana de horas de un dígito a
pocas decenas, pero **los tres rangos no coinciden** (12–36 h normativo vs. 24–48 h de
revisión vs. ~15 h medido en campo) — depende fuertemente de variedad, altitud,
temperatura ambiente y si se agrega agua al tanque. No hay un número único "correcto"
en la literatura; el software no debería anclar sus "horas de gracia" a un solo valor
de la bibliografía sin decir de qué condición proviene.

---

## 2. Defectos de sobre-fermentación: stinker, acético, fenólico, "fermentado", cebolla

### 2.1 Compuestos y mecanismos (Haile & Kang 2019, texto completo — fuente central)

> "Coffee beans resulting from such fermentations are often referred to as
> 'stinkers' [42, 43]." — Sección 4.2

(Cita primaria detrás: Frank HA, Lum NA, Cruz ASD. 1965. "Bacteria responsible for
mucilage-layer decomposition in Kona coffee cherries." *Appl. Microbiol.* 13:201–207;
y Arunga RO. 1982. "Coffee" en *Fermented Foods*. — no verifiqué estas dos
directamente, son **citadas de otro estudio**, no medidas por Haile & Kang.)

> "Overfermentation encourages the production of undesirable chemical compounds,
> notably propionic and butyric acids, which confer off-flavours, such as an onion
> taste [44–47]." — Sección 4.2

> "Species of the *Bacillus* genus, especially *B. megaterium*, may be responsible for
> the propionic acid found in coffees processed via dry or natural processing [11]."

> "propionic acid is detected in high concentrations only when the fermentation
> process proceeds for longer than its optimum duration [11]." (cita: Silva CF et al.
> 2008, *Food Microbiology* 25:951–957, sucesión de comunidades bacterianas/fúngicas
> en fermentación natural — **citado de otro estudio**, no verificado directamente)

> "Enterobacteriaceae and acetic acid bacteria lead to the production of excessive
> acetic acid during prolonged fermentation in dry processing [11]."

> "Bade-Wegner et al. [47] state that overfermentation may also produce short-chain
> fatty acids and their esters, such as 2-methyl butanoic acid ethyl ester, 3-methyl
> butanoic acid ethyl ester, and cyclohexanoic acid ethyl ester. These can be
> detrimental to coffee quality if they are present at concentrations higher than 1.8,
> 13.9, and 14 mg·kg⁻¹, respectively." (cita primaria: Bade-Wegner H, Bendig I,
> Holscher W, Wollmann R. 1997. "Volatile compounds associated with the over-fermented
> flavour defect." Proc. 17th ASIC, Nairobi — **citado, no verificado por mí
> directamente**)

**Precaución sobre un umbral cuantitativo específico:** el mismo artículo cita, en el
mismo párrafo:

> "Lopez et al. [41] report that these acids should not be present in a concentration
> greater than 1 mg·mL⁻¹."

Referencia [41] en la lista bibliográfica del propio Haile & Kang es en realidad
López-Galilea I, Fournier N, Cid C, Guichard E. 2006, *"Changes in headspace volatile
concentrations of coffee brews caused by the roasting process and the brewing
procedure"* — un artículo sobre tostado/preparación, no sobre fermentación. Esto
parece una **inconsistencia de cita dentro de la propia revisión** (posiblemente
confundido con "Lopez CI, Bautista E, Moreno E, Dentan E. 1989. Factors related to the
formation of 'overfermented coffee beans'...", que sí trata el tema y que otro
estudio — Jackels et al., fuente 1 — cita correctamente en su propia bibliografía).
**No uso el umbral "1 mg/mL" como validado**; lo señalo como una cifra que aparece en
una revisión pero cuya procedencia exacta no pude confirmar.

### 2.2 El defecto no depende sólo de tiempo/pH — depende de qué microorganismo domina

Dos estudios experimentales independientes muestran que la aparición de compuestos
"cebolla"/acético no es una función simple de la duración de fermentación, sino de qué
microbiota domina:

**Elhalis et al. 2021** (*Coffea arabica* var. Bourbon, Newrybar NSW Australia,
temperatura ambiente, n=2 réplicas/tratamiento, 36 h), Tabla 2 (mucílago):

> "Butanoic acid has an onion like flavor and is produced mainly by undesirable growth
> of contaminated microorganisms." — Discusión

Ácido butanoico (butírico) fue **menor** en las fermentaciones inoculadas con
*Hanseniaspora uvarum* / *Pichia kudriavzevii* que en el control espontáneo (control
~20.1 µg/kg vs. ~10 µg/kg en inoculadas, según Tabla 2), aunque el ácido acético fue
~2× mayor en las inoculadas (control 383.1 µg/kg) y el ácido láctico en mucílago subió
de 0.81 g/100g (control) a 1.52–1.73 g/100g (inoculadas), medido a las 36 h.

**Estudio Frontiers Microbiology 2019 (DOI 10.3389/fmicb.2019.01287)** — *Coffea
arabica* cv Catuaí Vermelho, Lavras, Minas Gerais, Brasil, 750–800 m, 0/24/48 h,
triplicado:

> "butyric and propionic acid, were not detected in this study" — Resultados

> Málico, láctico y acético "only detected in the bacterial treatments" — Resultados

**Veredicto: MATIZA fuerte** el modelo del software. La literatura respalda que
propiónico/butírico/acético en exceso causan defectos "cebolla"/avinagrado
(RESPALDA la asociación compuesto→defecto), pero **dos estudios muestran que la
fermentación controlada/inoculada puede tener MENOS de estos compuestos que la
espontánea a igual o mayor duración** — la variable que domina no es sólo tiempo
transcurrido o caída de pH, sino la identidad de los microorganismos activos. Un
sistema que dispara alarmas de "over-fermentation" únicamente por trayectoria de
pH/Brix, sin información microbiológica, puede estar midiendo un proxy imperfecto:
dos lotes con el mismo pH final a la misma hora pueden tener perfiles de defecto muy
distintos según qué flora los domine. Esto no invalida usar pH/Brix como proxy
operativo (es lo único medible en campo), pero sí es una limitación real que vale la
pena documentar.

### 2.3 "Underfermented" también es un riesgo, no sólo "over"

> "Underfermented coffee beans contain residual mucilage and sugar that prevent
> drying and create a conducive environment for the development of spoilage bacteria
> and fungi." — Haile & Kang 2019, Sección 4.2

**NO DICE** relación con los umbrales exactos del software (no hay parámetro de
"sub-fermentación" en la tabla del dueño), pero confirma cualitativamente que la
ventana "óptima" tiene un límite inferior de tiempo, no sólo superior.

---

## 3. Madurez de cereza y °Brix de entrada

Este es el punto donde encontré **la brecha más grande entre lo que dice el software y
lo que pude verificar en literatura revisada por pares**.

### 3.1 Lo que dicen fuentes comerciales (no verificado académicamente)

Múltiples blogs y sitios de tostadores (Perfect Daily Grind, Green Coffee Collective,
Pure Coffee, Achilles Coffee Roasters) repiten cifras como "18–24 °Bx cereza madura",
"18–22 °Bx óptimo", "<16 °Bx inmadura", "22 °Bx→sobremadura". **Ninguna de estas
páginas cita un estudio primario con esos números**; son afirmaciones de práctica de
la industria sin trazabilidad a una fuente medible.

### 3.2 Lo que dice el único manual "cuasi-normativo" que leí completo (CQI, manual preparatorio)

El manual explica el uso del refractómetro para estimar madurez, pero **no da ningún
número de °Brix**:

> "The refractometer is used to measure the amount of sugar content that is found
> mainly in the coffee pulp... The maximum sugar concentration will correspond to the
> optimal fruit ripeness of the fruit." — Cap. 6

**NO DICE** ningún rango numérico. Sólo confirma la relación cualitativa
Brix↑ = madurez↑, y que se mide sobre pulpa/mucílago exprimida de la cereza (no
sobre el licor del tanque ni la pulpa separada — coherente con que el dueño trate
estas tres series como distintas).

### 3.3 Estudio académico específico sobre Brix y calidad — NO accedido

El único estudio que until vi enfocado exactamente en "Brix de cereza vs. calidad de
taza" es Silva et al., *Precision Agriculture* (2014), "Coffee quality and its
relationship with Brix degree and colorimetric information of coffee cherries" — pero
**está detrás de paywall en Springer y ResearchGate; lo intenté por tres rutas
distintas y las tres fallaron (403/301)**. No puedo citar sus cifras. Un resumen de
buscador (no el texto) mencionó que el "°Brix aumenta ~1.5× durante la deshidratación
poscosecha" y correlaciones altas (r²=0.923–0.972) entre Brix/acidez y sólidos
solubles — **no lo cito como hallazgo verificado** porque no leí el texto ni la tabla
de origen.

### 3.4 Estudio que sí leí completo sobre azúcares en la cereza — no usa °Brix

*Plants* 13(13):1853 (2024), "Variation in Soluble Sugars in Arabica Coffee Cherry
Fruits" — *Coffea arabica* 'Red Obatã', Piracicaba-SP, Brasil, 5 árboles de 6 años,
200 frutos rojos/planta, clasificación por colorímetro CIELAB (valor *a*, 6 categorías
de intensidad de rojo) y cuantificación de azúcares por método fenol-sulfúrico.

> "no significant variation in the beans, and sucrose concentration remained stable
> throughout the stages" — resultado sobre el grano (no la cáscara/mucílago)

Este estudio mide madurez por **color** (a* de +23 a +8), no por °Brix, y encuentra
que la sacarosa en el **grano** no varía mucho entre subcategorías de rojo maduro —
la variación de azúcar total está en el mucílago/cáscara, no en el grano. **NO DICE**
nada que permita validar o refutar 18–24/<16 °Bx porque no usa esa unidad de medida.

### 3.5 Veredicto sobre el parámetro del software

> Constante del software: "entrada de cereza óptima 18–24 °Bx, inmadura < 16 °Bx"

**NO DICE (no verificado).** No encontré ningún estudio revisado por pares, accesible
y leído por mí, que establezca esos números exactos. Aparecen de forma consistente en
fuentes comerciales sin cita primaria. Esto no significa que sean falsos — son
plausibles y coherentes con la fisiología general (la cereza acumula azúcar hasta la
madurez y luego declina o fermenta en el árbol) — pero **el dueño no debería tratarlos
como "validados por literatura científica"** hasta que aparezca una fuente primaria
verificable. Recomiendo mantenerlos explícitamente etiquetados como PROVISIONAL /
práctica de industria, igual que los parámetros de pH y Brix de fermentación.

---

## 4. Relación fermentación ↔ inicio de secado: humedad, actividad de agua, riesgo de moho/OTA

Esta es la sección mejor respaldada del informe, gracias a dos fuentes normativas/
académicas de calidad, ambas leídas completas o casi completas.

### 4.1 Actividad de agua (aw) — Codex CAC/RCP 69-2009 §4.6 (texto completo)

> "At high water activity (aw > 0.95) OTA-producing fungi will not likely grow, as
> fast-growing hydrophilic fungi and yeasts grow first. At lower water activity
> (aw <0.80) the OTA-producing fungi can be present but not produce the toxin, and at
> aw below 0.78-0.76 they cannot grow. Therefore the most important point is to
> control the period of time in which coffee remains in the drying yard, in the range
> of water activity where OTA-producing fungi can grow (aw 0.8 – 0.95). According to
> experimental results, 5 days or less in the drying yard is enough and effective to
> prevent OTA accumulation." — párrafo 37

> "In general, a maximum aw of 0.67 to 0.70 and moisture content < 12.5% (wet basis)
> is sufficient for protecting parchment coffee from damage by fungi." — párrafo 37

> "The moisture content of the beans is reduced to a maximum of 12.5% to prevent OTA
> production." — párrafo 3 (Introducción)

**Nota sobre una cifra que circula en fuentes secundarias:** varias páginas
(ScienceDirect abstracts, blogs técnicos) citan "aw mínimo de 0.85 para producir OTA"
como cifra única y simple. La fuente primaria que leí completa (Codex) da un cuadro
**más matizado por tramos**: >0.95 no favorable (compite con otros hongos), 0.80–0.95
es la zona de riesgo real, <0.80 el hongo puede estar presente pero no producir toxina,
<0.76–0.78 no hay crecimiento. **MATIZA**: el "0.85" que aparece en resúmenes de
buscador es una simplificación de una fuente que no leí completa (Tandfonline,
"Conditions of formation of ochratoxin A in drying, transport..."); no lo cito como
válido, uso el cuadro de tramos del Codex, que sí verifiqué.

### 4.2 Datos experimentales recientes (Osorio et al. 2026, Cenicafé/NC State)

*Coffea arabica* Castillo®, Chinchiná, Caldas, Colombia; 800 kg de fruto inicial;
27 tratamientos × 8 muestras (216 total, análisis por triplicado); fermentación base
de 16 h más prolongaciones de +10 h o +20 h (26/36 h totales) a 15 °C o 20 °C;
secado mecánico a 40 °C.

> "The MS2 maturity stage with 14.10% of mucilage, presents the most optimal balance
> between high water content and maximum accumulation of total soluble solids (TSS)
> in the mucilage." — Resultados/Discusión (paráfrasis del extracto obtenido; cifra de
> mucílago exacta confirmada: 14.10%)

Tabla de resultados (OTA, µg/kg, madurez MS2 = cereza intermedia por color
"crimson"):

| Tratamiento | OTA (µg/kg) |
|---|---|
| MS2 sin prolongación | 2.98 |
| MS2, 15 °C, +10 h | 3.02 |
| MS2, 15 °C, +20 h | 3.01 |
| MS2, 20 °C, +10 h | 3.48 |
| MS2, 20 °C, +20 h | **3.51** (único significativo, p<0.05) |

Actividad de agua promedio general del estudio: **0.621** (rango 0.548–0.666);
humedad promedio: **11.35%** (rango 9.90–12.20%), sin diferencias significativas
entre tratamientos.

> "The optimal temperature for OTA production by A. ochraceus is in the range of
> 25–30 °C, while A. carbonarius produces higher OTA concentrations at 30 °C than at
> 20 °C." (paráfrasis de la explicación mecanística del estudio)

**Veredicto sobre riesgo moho/OTA si el mucílago queda:**

**RESPALDA** con matices la premisa general del software (mucílago residual + tiempo +
temperatura = riesgo). Pero dos precisiones importantes:

1. En este estudio, **todos los valores de OTA quedaron por debajo o muy cerca del
   límite regulatorio de la UE (3 µg/kg para café tostado)** incluso con fermentación
   prolongada 20 h adicionales — sólo la combinación de 20 °C (temperatura de
   fermentación elevada, no sólo tiempo) produjo un aumento estadísticamente
   significativo. **La temperatura, no sólo la duración, parece ser el factor
   dominante** en este experimento puntual — coherente con el hecho de que la tabla
   del dueño usa "horas de gracia" fijas sin variable de temperatura ambiente
   explícita, lo cual la literatura sugiere que podría ser una simplificación
   importante.
2. Este estudio clasificó madurez **por color**, no por °Brix, así que no aporta
   evidencia directa sobre el umbral de 18–24 °Bx del software (ver §3.5). **NO DICE**
   nada sobre Brix específicamente.

### 4.3 Riesgo humedad en almacenamiento (Codex, texto completo)

> "Under a relative humidity below 60% coffee will continue to dry but if the
> relative humidity is above 80% the coffee will start to absorb water." — párrafo 42

Coincide con lo que dice el manual CQI: *"Usual rage [range] for relative humidity is
50 to 70%... Above 80% RH, the risk of fungi growth increase significantly."* Dos
fuentes independientes coinciden en el umbral ~80% HR como zona de riesgo de moho en
almacenamiento — **RESPALDA** consistentemente, aunque esto es sobre grano ya seco en
bodega, no sobre la ventana fermentación→inicio de secado propiamente dicha.

---

## 5. Tabla resumen — parámetro del software vs. veredicto

| Parámetro (WASHED_STANDARD salvo que se indique) | Veredicto | Evidencia |
|---|---|---|
| pH óptimo alto ≈4.5 (límite superior de la banda 3.8–4.5) | **RESPALDA (parcial)** | Jackels: fermentación "completa" a pH 4.5–4.8; CQI: preferible parar a pH 4.5–4.6 |
| pH crítico 3.5 / disparo inmediato 3.3 | **MATIZA / posible CONTRADICE** | Jackels ya considera "sobre-fermentado" desde pH 4.1–4.4 (mediana +1.5 h) y severamente 3.6–4.0 (+4 h); CQI recomienda parar **antes de 4.0**. La literatura sitúa el punto de alarma ~0.5–1 pH unidades **por encima** de 3.5/3.3. Además, el efecto en taza fue **débil y sólo marginalmente significativo** incluso en el rango más amplio (Δ pH≥0.5 → −1.5 puntos sobre 80, p=0.04) — no hay evidencia de un "disparo" abrupto en 3.3, más bien degradación gradual. |
| Gracia 12 h antes de "estancado" (pH) | **NO DICE** | Ningún estudio leído calibra explícitamente una ventana de "estancamiento" en horas; Jackels reporta medianas de sobre-fermentación de 1.5 h y 4 h para sus dos rangos, no comparable directamente al concepto de "meseta". |
| Fase inicial pH ≥ 5.2 | **RESPALDA (aprox.)** | Jackels: pH inicial del mucílago típico 5.5–5.8 (fuente 2, resumen) y "aprox. 5.5 a 4.6" en fuente 1 — consistente con, y ligeramente por encima de, el piso de 5.2 del software. |
| pH ≥ 6.5 = sospecha de dilución/electrodo | **NO DICE** | Ninguna fuente leída reporta explícitamente un techo de pH de mucílago fresco de ~6.0; no pude confirmar ni refutar. |
| Meseta de pH: \|pendiente\|<0.01 pH/h | **NO DICE** | Ninguna fuente reporta series temporales de pH con esa resolución para calcular pendientes comparables. |
| Caída de Brix 25–35% para terminar; piso de Brix 15–16 °Bx; ventana de estancamiento; ruido 0.3–0.5 °Bx; gracia de subida 6–24h | **NO DICE** | Ninguna de las fuentes leídas reporta series temporales de °Brix durante la fermentación con esa granularidad. El único estudio centrado en Brix de cereza (Silva et al. 2014) no fue accesible. |
| Entrada de cereza óptima 18–24 °Bx; inmadura <16 °Bx | **NO DICE (no verificado)** | Sin fuente académica accedida que sustente estos números; aparecen sólo en fuentes comerciales sin cita primaria. Ver §3.5. |
| Definición "lavado = sin nada de mucílago" | **RESPALDA** | CQI: washed = "2 parts removed" (piel+mucílago). Codex: "washed" = mucílago removido por fermentación+lavado. |
| Definición "semi-lavado = llega con mucílago" | **MATIZA (riesgo terminológico)** | El "semi-washed" normativo (Codex/ISO 3509) es un proceso deliberado sin fermentar ni lavar en absoluto (≈ honey), no un lavado incompleto. Ver §1.2. |
| Defectos por sobre-fermentación: acético/propiónico/butírico → avinagrado/cebolla | **RESPALDA** | Haile & Kang 2019, múltiples citas primarias (Krug 1940, Mônaco 1961, Amorim&Amorim 1977, Bade-Wegner et al. 1997, Silva et al. 2008). |
| Ese defecto es función simple de pH/tiempo | **MATIZA/CONTRADICE parcial** | Elhalis et al. 2021 y el estudio Frontiers Microbiology 2019 (10.3389/fmicb.2019.01287): fermentaciones inoculadas/controladas mostraron **menos** butírico/propiónico que la espontánea a igual o mayor duración — la microbiota dominante importa tanto o más que el tiempo transcurrido. Ver §2.2. |
| Riesgo de moho/OTA si el mucílago se demora en fermentar/secar | **RESPALDA (con matiz de temperatura)** | Codex CAC/RCP 69-2009 (aw 0.8–0.95 = ventana de riesgo; <12.5% humedad y aw≤0.67–0.70 protege) y Osorio et al. 2026 (OTA sólo sube significativamente con fermentación prolongada **a 20 °C**, no a 15 °C — la temperatura domina sobre la sola duración en este experimento). |
| Brix del licor de tanque, mucílago prensado y pulpa como series distintas | **NO CONTRADICE (consistente cualitativamente)** | CQI: el refractómetro se usa sobre pulpa/mucílago exprimida directamente de la cereza, no sobre el licor del tanque — apoya que son matrices distintas, pero ninguna fuente cuantifica la diferencia entre ellas. |

---

## 6. Desacuerdos entre estudios (no promediados)

- **Duración típica de fermentación húmeda**: Codex 12–36 h; Haile & Kang (revisión)
  24–48 h; Jackels (medición de campo, Nicaragua, Caturra, sin agua) ~15 h. No son
  compatibles entre sí como "un solo número típico" — dependen de variedad, si se
  agrega agua al tanque, temperatura ambiente y altitud. No los until promedié.
- **Umbral de aw para riesgo de OTA**: la cifra simple "0.85" que circula en fuentes
  secundarias no leídas por mí completas vs. el cuadro por tramos del Codex
  (0.76–0.99 con distintas implicaciones en cada tramo) que sí leí completo. Uso el
  segundo como más autoritativo, pero señalo la discrepancia porque un lector que
  busque "OTA water activity" en buscadores comerciales se topará primero con el
  "0.85" simplificado.
- **¿La duración predice el defecto, o la microbiota?**: Haile & Kang (revisión que
  sintetiza estudios de fermentación espontánea/no controlada) sostiene que prolongar
  la fermentación produce más ácido propiónico/butírico. Elhalis et al. 2021 y el
  estudio 10.3389/fmicb.2019.01287 (ambos con inoculación controlada) muestran que
  fermentaciones **más controladas microbiológicamente** pueden tener MENOS de estos
  compuestos incluso a igual o mayor tiempo. No es una contradicción directa (hablan
  de fermentación espontánea vs. inoculada), pero sí implica que el software, que sólo
  ve pH/Brix y no sabe qué microorganismos dominan, tiene un techo de precisión que la
  literatura no permite superar sin datos microbiológicos adicionales.

---

## 7. Lo que no encontré (declarado explícitamente, no inventado)

- Ningún estudio revisado por pares que valide los números exactos 18–24 °Bx / <16
  °Bx de cereza madura/inmadura del software.
- Ninguna fuente académica o normativa que defina los porcentajes de mucílago
  25/50/75/100% para honey amarillo/rojo/negro/blanco — sólo repetición sin cita en
  sitios comerciales.
- Ninguna fuente que calibre "horas de gracia" antes de declarar "estancado" (ni en
  pH ni en Brix) como concepto de meseta/estancamiento con la definición matemática
  que usa el software (\|pendiente\|<0.01 pH/h).
- Ninguna fuente que reporte series temporales de °Brix de mucílago/licor durante la
  fermentación con la granularidad necesaria para validar caída de 25–35%, piso de
  15–16 °Bx, o ruido de 0.3–0.5 °Bx.
- No pude leer el texto completo de Silva et al. 2014 (*Precision Agriculture*, el
  estudio más directamente relevante para Brix-cereza-calidad) ni de *Fermentation*
  5(3):67 (Pichia fermentans + Pediococcus acidilactici) — ambos bloqueados por
  paywall/403 pese a múltiples intentos con distintas rutas. No cito su contenido.
- No encontré un umbral de pH ≥6.5 como "techo" fisiológico específico del mucílago
  fresco de café, ni evidencia directa para los perfiles ANAEROBIC_SHORT,
  CARBONIC_MACERATION ni COLD_HOLD_PREFERMENT del software — ninguna de las fuentes
  leídas trabajó con maceración carbónica o reposo en frío de café.
