<!--
  PROCEDENCIA — informe de un SUBAGENTE, 2026-09-19, copiado sin editar.
  estado    : referencia externa · NO verificado salvo lo que marca con ✅
              ../revision-literatura-fermentacion-2026-09-19.md
  qué NO    : citar desde el código ni como hecho. Tiene errores conocidos: ver la
              §3 de la revisión compilada (correcciones de Codex).
-->

# Tema D — Matemática y físico-química de la fermentación de café

Revisión de literatura sobre modelos cinéticos, efecto de la temperatura y física/química de
la medición (pH, °Brix), aplicada a fermentación de café donde existe evidencia directa y a
sistemas análogos (vegetales fermentados, vino) cuando no la hay, señalando siempre cuál es cuál.

## 0. Fuentes y estado de lectura

| # | Fuente | Sistema | LEÍDO | DOI / URL |
|---|---|---|---|---|
| 1 | Coleman, Fish & Block (2007), *Appl. Environ. Microbiol.* 73(18):5875–5884 | Vino (análogo) | Texto completo | doi:10.1128/AEM.00670-07 |
| 2 | Chala, Oechsner & Müller (2019), *Applied Sciences* 9(3):412 | **Café** (pulpa/mucílago/pergamino) — pero digestión anaerobia a biogás, NO fermentación de la almendra | Texto completo | doi:10.3390/app9030412 |
| 3 | Tirado-Kulieva, Quijano-Jara, Avila-George & Castro (2024), *Curr. Res. Food Sci.* 9:100788 | **Café** (Typica/Caturra/Catimor, Perú) | Texto completo | doi:10.1016/j.crfs.2024.100788 |
| 4 | Peñuela-Martínez, García-Duque & Sanz-Uribe (2023), *Fermentation* 9(11):976 | **Café** (Castillo/Cenicafé1/Tabi, Colombia) | Texto completo | doi:10.3390/fermentation9110976 |
| 5 | Ghimire, Sah & Poudel (2020), *Food Sci. Nutr.* 8(10):5591–5600 | Gundruk, vegetal fermentado (análogo) | Texto completo (vía extracción asistida, con citas verbatim) | doi:10.1002/fsn3.1854 |
| 6 | Breidt & Skinner (2022), *J. Food Prot.* 85(9):1273–1281 | Jugo de pepino fermentado con *Lactiplantibacillus pentosus* / *Leuconostoc mesenteroides* (análogo) | Texto completo | doi:10.4315/JFP-22-068 |
| 7 | Jackels & Jackels (2005), *J. Food Sci.* 70:C321–C325 | **Café**, mucílago, Nicaragua | **Sólo resumen** (no se logró acceso al texto completo; Wiley de pago) | doi:10.1111/j.1365-2621.2005.tb09960.x |
| 8 | Rosso, Lobry, Bajard & Flandrois (1995), *Appl. Environ. Microbiol.* 61(2):610–616 | Modelo genérico (*E. coli* como caso de prueba) | **Sólo resumen** (de pago) | doi:10.1128/aem.61.2.610-616.1995 |
| 9 | CRC *Dissociation Constants of Organic Acids and Bases* (basado en Perrin 1972 / Lide, *CRC Handbook*, 76.ª ed. 1995) | Tabla de referencia fisicoquímica | Texto completo | stolaf.edu/people/hansonr/chem248/Perrin1972.pdf |
| 10 | Elhalis, Cox & Zhao (2023), *Applied Food Research* 3:100253 | **Café**, revisión | **No se pudo acceder** al texto (ScienceDirect y PDF institucional bloquearon la extracción; sólo metadatos) — **no se usa para afirmaciones**, sólo se nombra como revisión existente | doi:10.1016/j.afres.2022.100253 |

Fuente 10 se descarta de las afirmaciones de este informe por regla 1 (no inventar contenido a
partir de metadatos). Fuentes 7 y 8 se citan con sus hallazgos reportados en el resumen público,
marcados explícitamente como "sólo resumen".

No encontré ningún modelo cinético (Monod/Contois/Gompertz/Luedeking–Piret) publicado y
ajustado específicamente sobre la **fermentación húmeda de la almendra de café** (pH/°Brix/ácido
láctico en función del tiempo). El único ajuste cinético formal sobre subproductos de café que
encontré (fuente 2) es para **biogás a partir de pulpa/mucílago/pergamino como residuo**, un
proceso de digestión anaerobia (metanogénesis), no la fermentación húmeda que monitorea el
software. Lo uso solo como evidencia de que la técnica (ajustar Gompertz/Logístico y luego
hacer sus parámetros función de T) es aplicable a esta matriz, no como modelo de pH/°Brix.

---

## A. Modelos de crecimiento y consumo

### A.1 Monod — no encontrado ajustado a café, sí a vino (análogo)

Coleman et al. (2007) modelan la fermentación de vino (Monod para el crecimiento limitado por
nitrógeno, tipo Michaelis-Menten para el consumo de azúcar):

> "μ = μmax·N/(KN + N)" (ecuación 6); "β = βmax·S/(KS + S)" (ecuación 8)

Sistema: *Saccharomyces cerevisiae*, fermentaciones de vino blanco a escala de matraz, 11–35 °C,
azúcar inicial 265–300 g/L, nitrógeno inicial 80–330 mg N/L. **MEDIDO** en ese estudio.
DOI: 10.1128/AEM.00670-07.

No encontré ningún ajuste de Monod (μmax, Ks) para levaduras o BAL de mucílago de café. La
revisión de Elhalis et al. (fuente 10) probablemente lo mencione, pero no pude verificar su
contenido — **no encontrado** con acceso directo.

### A.2 Contois — no encontrado aplicado a fermentación de café ni a ningún análogo fermentado revisado aquí

Búsquedas dirigidas devuelven a Contois solo en contextos de digestión de sustratos insolubles
en biorreactores industriales (alta densidad celular), no en fermentaciones espontáneas de
alimentos. **No encontrado** aplicado a café, vino, ni vegetales fermentados en las fuentes que
pude leer.

### A.3 Logístico y Gompertz modificado — sí, en dos análogos y en el residuo de café (biogás)

**Chala, Oechsner & Müller (2019)**, sobre husk/pulpa/mucílago de café (biogás, no bean
fermentation), ajustan y comparan explícitamente Logístico modificado (LOG) y Gompertz
modificado (GOM):

> "𝑀𝑡 = 𝑆·exp{−exp[𝑅𝑚·𝑒/𝑆·(𝜆−𝑡)+1]}" (ec. 1, GOM); "𝑀𝑡 = 𝑆/{1+exp(4𝑅𝑚(𝜆−𝑡)/𝑆+2)}" (ec. 2, LOG)

con S = producción máxima acumulada, Rm = tasa máxima diaria, λ = tiempo de latencia. Ajuste muy
bueno en los tres sustratos y las tres temperaturas (R² > 0,987). Condiciones: 21/30/37 °C,
60/35/35 días, inóculo de biogás de Hohenheim, sustrato de una finca de Jimma, Etiopía. **MEDIDO**
en ese estudio. DOI: 10.3390/app9030412.

Limitación que el propio artículo señala y que aplica a cualquier uso de estos modelos para
"fin de fermentación":

> "both models estimate a non-zero methane yield at t = 0 ... the situation has no physical
> meaning" (§3.1, citando a Fischer et al. 2013)

**Ghimire, Sah & Poudel (2020)**, sobre Gundruk (vegetal fermentado, análogo — no café), ajustan
Gompertz modificado para el crecimiento microbiano:

> "log N/N₀ = A exp{-exp[(μₘA/λ) - t] + 1}"

con μm = 0,37 h⁻¹, λ (latencia) = 4,84 h, A = 3,79, R² = 0,9173, a temperatura ambiente
(20–25 °C) durante 16 días. **MEDIDO** en ese estudio. DOI: 10.1002/fsn3.1854. Nótese que aquí
"temperatura ambiente" es una única condición — el estudio no varía T, así que no aporta nada
sobre corrección por temperatura.

**Veredicto para el software:** el uso de una curva sigmoide tipo Gompertz/Logístico para
describir "crecimiento/consumo acumulado vs. tiempo" está bien establecido para sistemas
análogos y para el propio residuo de café, pero **no encontré ningún ajuste publicado de estos
modelos sobre pH o °Brix de la fermentación húmeda del grano**. El software no declara (que yo
haya visto en el brief) que use estos modelos explícitamente — si los umbrales de "estancamiento"
están pensados como una aproximación lineal a tramos de una curva sigmoide, eso es razonable en
principio, pero **no está validado con datos de café** en ninguna fuente que pude leer.

### A.4 Luedeking–Piret (producción de ácido) — sí, en un análogo, con parámetros

Ghimire, Sah & Poudel (2020) comparan tres variantes de Luedeking–Piret para la producción de
ácido láctico en Gundruk:

> "dP/dt = m(dX/dt) + nX" (Luedeking–Piret clásico); variante de Monteagudo et al. con inhibición
> por producto "dP/dt = m(dX/dt) + nX[1 - P/Pmax]"

La variante de Monteagudo (con inhibición por producto) fue la de mejor ajuste: m (asociado al
crecimiento) = 0,1104; n (no asociado al crecimiento) = 0,0042; Pmax = 116,544 g/L; R² = 0,9907.
**MEDIDO** en ese estudio, a temperatura ambiente (20–25 °C), sin variación de T. DOI:
10.1002/fsn3.1854.

**No encontré Luedeking–Piret ajustado a café** (ni a la producción de láctico/acético del
mucílago, ni a etanol). Dado que el software no calcula tasa de producción de ácido a partir de
biomasa (usa pH y °Brix directamente), Luedeking–Piret sería relevante solo si en el futuro se
quisiera modelar la producción de ácido láctico/acético como función de la actividad microbiana;
hoy no aplica directamente a los parámetros de la tabla.

---

## B. Efecto de la temperatura sobre la cinética

### B.1 Arrhenius / dependencia de T en parámetros cinéticos — sí, con evidencia fuerte en vino y en café (biogás)

Coleman et al. (2007) NO usan Arrhenius clásico; ajustan **regresión log-lineal/log-cuadrática**
de los parámetros contra T (no logarítmica pura tipo Arrhenius, pero capturando el mismo efecto
exponencial):

- μmax: log(μmax) = a₀ + a₁·T (lineal en escala log) — aumenta ~6× de 11 a 35 °C.
- k'd (tasa de inactivación celular por etanol): log(k'd) = a₀ + a₁·T + a₂·T² (cuadrática) —
  aumenta ~13×, con subida marcada por encima de 25 °C.
- βmax (consumo de azúcar): log(βmax) = a₀ + a₁·T (lineal) — aumenta ~6× de 11 a 35 °C.

Cita textual clave, sobre por qué temperaturas altas producen fermentaciones "atascadas" pese a
ser más rápidas al inicio:

> "sugar utilization starts out rapidly and is then followed by a sudden cessation of
> fermentation activity" ... "the stuck fermentations at higher temperatures can be explained
> by the significantly higher cell inactivation constant (k'd) sharply increasing above 25 °C"

**MEDIDO**, 11–35 °C, vino blanco. DOI: 10.1128/AEM.00670-07.

Chala et al. (2019), sobre café (pulpa/mucílago/pergamino, biogás), ajustan también los tres
parámetros de Gompertz/Logístico como función de T:

> "𝑆 = 𝑐1 + 𝑐2·𝑇" (ec. 7, lineal); "𝑅𝑚 = 𝑐3 + 𝑐4·𝑒^((𝑇−21)/𝑐5)" (ec. 8, exponencial); "𝜆 = 𝑐6 + 𝑐7·𝑇"
> (ec. 9, lineal)

Con esto generalizan el modelo para predecir la curva completa a cualquier T entre 21 y 37 °C
(R² > 0,959 en validación). El texto discute explícitamente que citan el modelo de Arrhenius
como uno de los enfoques posibles pero señalan su límite:

> "The Arrhenius model, for instance, was applied to estimate bacterial growth and product
> formation rate. However, the limitation of the model was the indefinite increase of the
> growth rate with increasing temperatures."

y usan en su lugar una relación exponencial acotada (ec. 8) más parecida en espíritu a un modelo
cardinal (ver B.2). **MEDIDO**, 21/30/37 °C. DOI: 10.3390/app9030412. *(Recordatorio: este es el
subproducto para biogás, no la fermentación de la almendra.)*

Búsquedas generales (no verificadas con lectura de texto completo, solo resúmenes de motor de
búsqueda) reportan energías de activación de Arrhenius para *S. cerevisiae* en producción de
etanol en el rango ~65–92 kJ/mol y para muerte celular un valor mucho mayor (~178 kJ/mol),
consistente cualitativamente con el hallazgo de Coleman et al. de que la inactivación celular
sube mucho más rápido con T que el crecimiento o el consumo de azúcar. Marco esto como
**NO VERIFICADO A TEXTO COMPLETO** — son cifras de resúmenes de búsqueda, no de lectura directa
del artículo original, así que no las presento como hallazgo sólido, solo como contexto de orden
de magnitud.

### B.2 Modelos cardinales (Rosso) — descripción general, sin texto completo

Rosso, Lobry, Bajard & Flandrois (1995) proponen el modelo cardinal de temperatura con
inflexión (CTMI), combinado multiplicativamente con un modelo cardinal de pH (CPM), bajo la
hipótesis de independencia de los efectos de T y pH sobre μmax. Cita textual (del resumen
público):

> "A new model in which the maximum microbial specific growth rate (μmax) is described as a
> function of pH and temperature is presented. The seven parameters of this model are the three
> cardinal pH parameters ... the three cardinal temperature parameters ... and the specific
> growth rate at the optimum temperature and optimum pH."

**LEÍDO: sólo resumen** — no pude acceder a la ecuación exacta ni a la tabla de parámetros
(paywall de ASM). Validado en el artículo original sobre *E. coli* O157:H7, no sobre organismos
de fermentación de café. DOI: 10.1128/aem.61.2.610-616.1995. No encontré ningún trabajo que
aplique el modelo de Rosso a levaduras o BAL de café — **no encontrado**.

### B.3 Grados-hora / tiempo térmico — no encontrado en fermentación de café ni de vino

Ninguna de las fuentes leídas a texto completo usa explícitamente el concepto de "grados-hora"
o "tiempo térmico" (integral de T sobre el tiempo, como en fenología de cultivos o en control de
calidad de bebidas) para comparar fermentaciones a distinta temperatura. Lo que sí hacen
Coleman et al. y Chala et al. es un enfoque equivalente pero más riguroso: ajustar los
parámetros cinéticos (no solo la duración) como función de T, y luego dejar que la ecuación
diferencial/el modelo generalizado prediga la curva completa a cualquier T. Es un enfoque más
fuerte que un simple "grados-hora" porque no asume que el efecto de la temperatura es igual en
todas las fases de la fermentación (ver B.1: k'd depende de T de forma muy distinta a μmax y
βmax). **No encontrado** un análogo de "grados-hora" aplicado a fermentación de café.

### B.4 ¿Es defendible una "ventana de estancamiento" fija en horas sin corregir por temperatura?

Con la evidencia de B.1 y de la fuente 4 (Peñuela-Martínez et al. 2023, café real, temperatura
controlada), la respuesta es **CONTRADICE**.

Peñuela-Martínez et al. (2023) midieron directamente en café (Castillo/Cenicafé1/Tabi,
Colombia) el efecto de la temperatura sobre el tiempo de fermentación:

> "The time to achieve mucilage degradation greater than 95% was ... significantly longer when
> the temperature was controlled at 15 °C" ... "temperature control prolonged the fermentation
> time ... more than 24 h" respecto a la fermentación espontánea (~26 °C promedio, rango
> 23–31 °C)

Es decir, **una diferencia de ~11–15 °C cambió el tiempo de fermentación en más de 24 horas**, un
factor de 2× o más sobre el tiempo total. **MEDIDO**, café real, n=5 repeticiones por
tratamiento, tres variedades. DOI: 10.3390/fermentation9110976.

Esto es coherente cuantitativamente con lo que predicen Coleman et al. (2007) en vino (factor
~6× en μmax y en βmax entre 11 y 35 °C) y con Chala et al. (2019) en el propio residuo de café
(tasa máxima Rm con dependencia exponencial de T, ec. 8). Y es coherente con el valor de Q10
típico reportado para levaduras/BAL (~2–3 por cada 10 °C, según búsquedas generales no
verificadas a texto completo).

**Conclusión para los cinco perfiles de la tabla:** las "horas de gracia antes de estancado"
(6–24 h) y la "ventana de estancamiento Brix" (6–24 h) son **valores fijos en horas, sin ningún
término de corrección por temperatura**. La evidencia de café real (Peñuela-Martínez) y de vino
(Coleman) muestra que el mismo proceso biológico puede tardar 2× o más en completarse con una
diferencia de temperatura de solo 10–15 °C. Un umbral fijo de "12 h sin cambio" que no sabe si la
masa está a 16 °C (montaña, noche fría en Panamá) o a 28 °C (día caluroso) va a marcar como
"estancada" una fermentación que simplemente es más lenta por frío — o, en sentido contrario, va
a tardar demasiado en alertar sobre una fermentación caliente que realmente se atascó rápido por
inactivación celular (el mecanismo de Coleman et al., k'd sube fuerte >25 °C). Esto **CONTRADICE**
la idea de que una ventana fija en horas, sin corregir por T, sea defendible.

El caso de **COLD_HOLD_PREFERMENT** (reposo frío, ventana de 48 h) va en la dirección correcta
cualitativamente — un tiempo de gracia más largo para temperaturas bajas es lo que predice la
cinética (Q10, Arrhenius, y el caso medido de Peñuela-Martínez a 15 °C) —, pero **no encontré
ninguna fuente que derive el número 48 específicamente**; es una corrección cualitativamente
razonable cuya magnitud no puedo verificar con la evidencia disponible. **MATIZA**.

---

## C. Química del pH: por qué no es lineal con la concentración de ácido

### C.1 pKa de láctico y acético — confirmados

De la tabla de constantes de disociación (CRC *Handbook of Chemistry and Physics*, compilada a
partir de Perrin 1972 y otras fuentes primarias, a 25 °C):

> "C3H6O3 Lactic acid 25 3.86" ; "C2H4O2 Acetic acid 25 4.756"

Estos son exactamente los valores que usa el brief (3,86 y 4,76). **CONFIRMADO** contra fuente de
referencia fisicoquímica estándar. Fuente: tabla CRC alojada en stolaf.edu (compilación de
Perrin, D.D., *Dissociation Constants of Organic Bases in Aqueous Solution*, 1965/Suppl. 1972).

Breidt & Skinner (2022), citando a su vez a Lide (ed.), *CRC Handbook of Chemistry and Physics*,
76.ª ed. (1995), reportan el mismo par de valores en el contexto de fermentación de vegetales:

> "These acids have different pK values (3.86 for lactic acid and 4.76 for acetic acid)" (§Intro)

DOI: 10.4315/JFP-22-068.

### C.2 Por qué el pH no es lineal con la concentración de ácido: capacidad tampón

Breidt & Skinner (2022) construyen y validan un **modelo cuantitativo de capacidad tampón (BC)**
para jugo de pepino fermentado — el análogo más directo que encontré para la relación
pH ↔ ácido en una matriz vegetal con mucílago/pectina/azúcares, aunque no es café. Su hallazgo
central:

> "Undefined buffering components of fermentation media make estimates of pH from acid
> production difficult." (Abstract) ... "β = Δ(volume of acid or base)/ΔpH" (ec. 1, definición
> operacional de capacidad tampón)

Ajustan la capacidad tampón total como suma de siete tampones monopróticos (ec. 2, forma tipo
Henderson–Hasselbalch generalizada), y demuestran que el pH final se puede predecir a partir de
la concentración de ácido láctico/acético medida por HPLC más la capacidad tampón de la matriz
sin fermentar, con un error cuadrático medio de solo 0,064 unidades de pH (cuando se corrige por
la reacción maloláctica) frente a 0,151 sin corregir. **MEDIDO**, tres tamaños de pepino, 24 y
48 h, 30 °C, *Lactiplantibacillus pentosus* y *Leuconostoc mesenteroides* puros. DOI:
10.4315/JFP-22-068.

Consecuencia directa y verificable matemáticamente (no una opinión, es la forma de la ecuación 2
de Breidt & Skinner): **la capacidad tampón β(pH) tiene máximos locales justo en el pKa de cada
ácido presente** (β es proporcional a [H⁺]·Ka/([H⁺]+Ka)² más el término de agua). Esto significa
que, **cerca de pH ≈ 3,86 (pKa láctico) y pH ≈ 4,76 (pKa acético), el sistema está mejor
tamponado**: hace falta producir más ácido para lograr el mismo cambio de pH que en zonas
alejadas del pKa. Es la razón físico-química exacta por la que "pH no es lineal con la
concentración de ácido" que pide el brief, y por qué el mucílago/pulpa (rico en pectina, ácidos
orgánicos preexistentes como málico/cítrico/quínico, y sales) actúa como tampón adicional sobre
esa curva.

En coffee específicamente, un buscador general (sin lectura de texto completo verificada)
reporta que "el pH depende del balance entre ácidos orgánicos — principalmente cítrico, málico,
quínico y clorogénico — y los compuestos tamponantes presentes en la matriz", coherente con el
mecanismo medido por Breidt & Skinner mecanismo en pepino, pero **no puedo confirmar esa frase
como cita textual de una fuente primaria de café** (llegó como síntesis de motor de búsqueda,
no de lectura directa). La marco como consistente pero **no verificada**.

### C.3 ¿Qué implica esto para usar la pendiente de pH (pH/h) como indicador, y para el umbral de meseta de 0,01 pH/h?

Esta es la pregunta más importante que toca mi tema, y la respuesta tiene dos partes.

**Parte 1 — no encontré el umbral en la literatura.** Ninguna de las fuentes de café que leí a
texto completo (Tirado-Kulieva et al. 2024; Peñuela-Martínez et al. 2023) ni la fuente sobre
mucílago Jackels & Jackels (2005, solo resumen) usa una **pendiente** dpH/dt como criterio de fin
de fermentación. Las tres usan **un valor absoluto de pH**:

- Jackels & Jackels (2005, solo resumen): "pH... decreased sharply to about 4.6 as fermentation
  neared completion... The pH profile may prove useful in predicting the time of fermentation
  completion." (según resumen del buscador, no verificado a texto completo)
- Tirado-Kulieva et al. (2024): "Since a final pH close to 4.6 was established to indicate the
  end of the fermentation process (Córdoba-Castro and Guerrero-Fajardo, 2016; Jackels and
  Jackels, 2005)..." — y en sus propios datos, "significant differences (p < 0.05) were evident
  in the pH values within each coffee variety [hasta 16 h] but stabilized after 20 h" (§3.1).
  **MEDIDO**, café Typica/Caturra/Catimor, Perú, pH inicial 5,43–5,60 → pH final (24 h) 4,60–4,77.
- Peñuela-Martínez et al. (2023): "Fermentation at 15 °C exhibited asymptotic behavior,
  maintaining values close to 4.0 for more than 20 h until the end of the process." (§3.3)
  **MEDIDO**, café real, temperatura controlada.

Es decir: la literatura de café que pude verificar usa "el pH se estabiliza cerca de un valor" (un
criterio cercano en espíritu a una meseta, pero descrito como comportamiento asintótico
cualitativo, nunca como una pendiente numérica con un umbral explícito en pH/h). **NO DICE** —
no encontré ningún valor publicado de pendiente umbral (ni 0,01 ni ningún otro) para café ni
para los análogos revisados.

**Parte 2 — el mecanismo de capacidad tampón (C.2) predice que un umbral de pendiente fijo va a
dar falsos positivos de "meseta" cerca de los pKa.** Esto es una inferencia matemática directa a
partir del modelo de Breidt & Skinner (ec. 2), no una cita de un estudio de café: si la
capacidad tampón β = Δácido/ΔpH tiene un máximo local en pH≈3,86 y otro en pH≈4,76 (los pKa de
láctico y acético, que son exactamente los ácidos dominantes en fermentación de café según
Jackels & Jackels y Tirado-Kulieva), entonces **la tasa dpH/dt se frena mecánicamente al cruzar
esas zonas de pH, incluso si la producción de ácido (y la actividad microbiana) sigue a ritmo
constante**. Un umbral único de |pendiente| < 0,01 pH/h aplicado sobre todo el rango de pH
(3,3–6,5 según la tabla del brief) va a ser más fácil de disparar falsamente justo cuando el pH
cruza 3,8–4,0 o 4,7–4,8 — que son precisamente los rangos "pH óptimo" y "pH crítico bajo" de los
cinco perfiles — que en zonas intermedias, sin que eso signifique que la fermentación se detuvo.

**Veredicto: MATIZA / posible CONTRADICE.** No encontré el número exacto (0,01 pH/h) respaldado
ni refutado directamente en ningún estudio de café. Pero el mecanismo de capacidad tampón,
medido y modelado rigurosamente en un análogo (pepino, Breidt & Skinner 2022), predice que **un
umbral de pendiente aplicado uniformemente sobre todo el rango de pH va a confundir "tamponado"
con "estancado"** justo en las zonas de pH que la tabla marca como críticas. Esto no invalida la
idea de usar la pendiente, pero sugiere que el umbral debería depender del pH actual (más
permisivo cerca de los pKa de 3,86/4,76), no ser una constante única para todos los perfiles y
todo el rango de pH.

---

## D. Física de la medición

### D.1 °Brix como sólidos solubles totales, no solo azúcar

Es un hecho establecido de refractometría (Wikipedia/fuentes técnicas generales, sin verificación
a texto completo de un artículo revisado por pares específico de café): el grado Brix se define
por el índice de refracción calibrado contra soluciones puras de sacarosa, pero en una matriz
real (mucílago de café) el índice de refracción responde a **todos** los solutos disueltos:
azúcares, ácidos orgánicos, sales, pectinas solubles y, conforme avanza la fermentación, etanol.
Fuentes técnicas generales de refractometría de mosto de vino describen el fenómeno de forma
consistente, pero no encontré un artículo revisado por pares que cuantifique específicamente la
contribución relativa de cada componente en mucílago de café — **NO ENCONTRADO** a nivel
cuantitativo para café.

Lo que sí es relevante y bien documentado (aunque en fuentes de divulgación técnica de
elaboración de cerveza/vino, no artículos científicos revisados por pares) es que **el etanol
tiene un índice de refracción distinto al de los azúcares y reduce la lectura de Brix de forma
no lineal** conforme la fermentación avanza — razón por la cual en enología/cervecería se usa
un "refractometer calculator" o se pasa a densimetría una vez hay etanol presente, en vez de leer
el Brix crudo como "azúcar restante". Esto es evidencia **de calidad no verificada
(fuentes técnicas, no papers)**, pero el mecanismo físico (dos solutos con índices de refracción
distintos no son separables con una sola lectura de índice de refracción) es indiscutible desde
la óptica física, y coherente con que la fermentación de café SÍ produce etanol de forma medible
(Jackels & Jackels 2005, según su resumen, midieron "ethanol" como uno de sus indicadores
químicos).

**Implicación para el software:** "caída de Brix" como criterio de avance/fin de fermentación
mezcla dos señales físicas: (a) verdadero consumo de azúcar por microorganismos, y (b) el efecto
óptico de que el etanol producido tiene un índice de refracción distinto (menor) al de la
sacarosa, lo cual hace bajar la lectura de Brix por una razón que no es "menos sólidos
disueltos" sino "sólidos distintos". **MATIZA** — el mecanismo físico es sólido, pero no encontré
cuantificación específica en mucílago de café para saber cuánto de la caída observada de Brix
(p. ej. 35% en WASHED_STANDARD, 25% en NATURAL) es azúcar consumido versus artefacto óptico del
etanol.

### D.2 Resolución y compensación por temperatura del refractómetro

De especificaciones técnicas de fabricantes de refractómetros digitales/analógicos de uso
alimentario (no un artículo científico, pero es información de especificación de instrumento
verificable, no una afirmación experimental): la resolución típica es de **0,1–0,2 °Bx**, con
exactitud de ±0,1 a ±0,2 °Bx en equipos estándar (hasta ±0,05 °Bx en equipos de alta gama), y
compensación automática de temperatura (ATC) típicamente entre 5 y 40 °C. **NO ES UN HALLAZGO DE
INVESTIGACIÓN**, es una especificación de instrumento — la cito porque el brief pregunta
explícitamente por la "resolución práctica" y no encontré un estudio que la mida en contexto de
café.

**Implicación:** el software usa "ruido Brix" de 0,3–0,5 °Bx según el perfil. Esto es **2 a 5
veces mayor que la resolución nominal del instrumento** (0,1–0,2 °Bx), lo cual es razonable y
hasta conservador si se piensa que el ruido de campo en mucílago (partículas en suspensión,
burbujas de CO₂, falta de homogeneización, variación de temperatura de la muestra pese al ATC)
va a ser mayor que la resolución de laboratorio del instrumento. **MATIZA/RESPALDA en orden de
magnitud** — no hay una fuente que mida ruido de campo específicamente en mucílago de café
fermentando, pero el valor no es fisicamente disparatado frente a la resolución nominal del
instrumento.

### D.3 Deriva y ensuciamiento de electrodos de pH en matrices con proteínas/pectinas

De fuentes técnicas de fabricantes/mantenimiento de electrodos (no papers revisados por pares,
pero información técnica consistente entre varias fuentes independientes): el ensuciamiento
("fouling") de la membrana de vidrio por proteínas, restos celulares o biopelícula reduce la
pendiente de respuesta del electrodo y su velocidad de respuesta; una pendiente por debajo de
~50 mV/década (frente a un teórico de ~59 mV/década a 25 °C) es señal de electrodo sucio o
envejecido, y en fermentaciones prolongadas puede hacer que el electrodo **subestime** cuánto
bajó el pH real. **NO ES UN HALLAZGO DE INVESTIGACIÓN SOBRE CAFÉ**, es información técnica
general de instrumentación, coherente con — pero no derivada de — el contexto de mucílago de
café (rico en pectina y proteínas solubilizadas por la fermentación).

Peñuela-Martínez et al. (2023) sí mencionan explícitamente el protocolo de calibración que
usaron en campo con café real:

> "a Hanna brand pH meter (HI 10532/Halo®) with automatic temperature compensation was used;
> the pH meter was calibrated before each use with pH 7.0 and pH 4.0 buffer solutions" (§2.3)

Es decir, en la única fuente de café que documenta explícitamente su protocolo de pH, la
calibración se hace en cada uso con dos puntos (pH 7 y pH 4) — un punto de calibración muy
cercano al rango crítico de la tabla del brief (3,2–4,8), lo cual reduce el riesgo de deriva por
extrapolación, pero no elimina el riesgo de ensuciamiento entre calibraciones dentro de una
misma fermentación de 12–48 h. **MEDIDO** (protocolo, no una cuantificación del error). DOI:
10.3390/fermentation9110976.

**Veredicto:** el riesgo físico de deriva por ensuciamiento con pectina/proteína es real y
consistente con principios de instrumentación estándar, pero no encontré ninguna fuente que
cuantifique cuántas décimas de pH puede desviar un electrodo de campo sin re-calibrar durante
una fermentación de café de 12–48 h. **NO DICE** (cuantitativamente) / **RESPALDA** (en
mecanismo cualitativo).

---

## E. Modelos cinéticos publicados específicamente para fermentación de café

Resumen explícito de lo que encontré y no encontré, porque el brief lo pide como punto aparte:

- **Biogás/metanogénesis de subproductos de café** (pulpa, mucílago, pergamino): sí, Chala,
  Oechsner & Müller (2019), Gompertz y Logístico modificados con T como variable. **No es el
  proceso que el software monitorea** (fermentación húmeda de la almendra para calidad de taza).
- **pH y °Brix de la fermentación húmeda de la almendra en función del tiempo**: encontré datos
  medidos (Tirado-Kulieva et al. 2024; Peñuela-Martínez et al. 2023; Jackels & Jackels 2005 según
  resumen) pero **ningún ajuste a un modelo cinético matemático explícito** (ni Monod, ni
  Gompertz, ni ningún otro) sobre esas curvas de pH/°Brix. Lo más cercano es el modelo de
  regresión NIR-PLSR de Tirado-Kulieva et al. (2024), que es un modelo estadístico de predicción
  espectroscópica, no un modelo cinético mecanístico.
- **Producción de ácido láctico/acético en función de biomasa** (tipo Luedeking–Piret) en café:
  **no encontrado**.
- **Modelo cardinal de temperatura (Rosso) aplicado a levaduras/BAL de café**: **no encontrado**.

**Conclusión honesta:** para la fermentación húmeda de café en sí (no el subproducto para
biogás), la literatura que pude verificar es **descriptiva/estadística** (curvas de pH y Brix
medidas en el tiempo, a veces con regresión), no **cinética mecanística** (con parámetros tipo
μmax, Ks, m, n con interpretación biológica). Los modelos cinéticos mecanísticos que sí existen y
pude leer completos son de sistemas análogos (vino: Coleman et al. 2007; vegetales fermentados:
Ghimire et al. 2020, Breidt & Skinner 2022) o del residuo de café para biogás (Chala et al. 2019).
Cualquier uso de estos modelos para calibrar los umbrales del software de Néctar Nómada tiene que
declararse explícitamente como **extrapolación por analogía**, no como validación directa en
café.

---

## F. Tabla resumen de veredictos (parámetros que toca mi tema)

| Parámetro del software | Veredicto | Base |
|---|---|---|
| Horas de gracia fijas antes de "estancado" (6–24 h, pH) — sin corrección por T | **CONTRADICE** | Peñuela-Martínez et al. 2023 (café real): diferencia de tiempo de fermentación >24 h entre 15 °C y ~26 °C. Coleman et al. 2007 (vino): μmax y βmax varían ~6× entre 11 y 35 °C. Consistente con Q10 ~2–3 (no verificado a texto completo). |
| Ventana de estancamiento Brix (6–24 h) — mismo problema | **CONTRADICE** | Mismo argumento que arriba; el software no distingue temperatura de la masa. |
| COLD_HOLD_PREFERMENT: ventana de 48 h por reposo frío | **MATIZA** | Dirección cualitativa correcta (frío → cinética más lenta, bien establecido), pero no encontré fuente que derive el número 48 específicamente. |
| Meseta de pH = \|pendiente\| < 0,01 pH/h, constante en todos los perfiles y todo el rango de pH | **MATIZA/posible CONTRADICE** | Ninguna fuente de café usa un criterio de pendiente (usan pH absoluto ~4,0–4,6). El mecanismo de capacidad tampón (Breidt & Skinner 2022, medido en análogo) predice que la pendiente se frena mecánicamente cerca de los pKa de láctico (3,86) y acético (4,76) — justo los rangos "óptimo"/"crítico" de la tabla — sin que eso signifique fermentación detenida. |
| Ruido Brix 0,3–0,5 °Bx | **RESPALDA (orden de magnitud)** | Especificación de instrumento: resolución nominal 0,1–0,2 °Bx; 0,3–0,5 es 2–5× mayor, razonable para ruido de campo (no cuantificado específicamente en mucílago de café). |
| pKa láctico 3,86 / acético 4,76 (dado en el brief) | **CONFIRMADO** | Tabla CRC de constantes de disociación (Perrin 1972/Lide 1995); replicado también en Breidt & Skinner 2022. |
| Caída de Brix (%) como criterio de "terminar" | **MATIZA** | Mecanismo físico sólido de que el etanol altera el índice de refracción de forma distinta al azúcar (fuentes técnicas, no papers de café), pero sin cuantificación específica en mucílago de café. |

---

## G. Los 5 hallazgos más importantes (para el resumen final)

1. **Ninguna fuente de café usa un criterio de pendiente de pH (pH/h) para marcar fin de
   fermentación** — todas usan un valor absoluto de pH (~4,0–4,6 según temperatura y proceso).
   El umbral de 0,01 pH/h del software no tiene respaldo directo en la literatura revisada.
2. **La capacidad tampón del mucílago tiene máximos matemáticos justo en los pKa de láctico
   (3,86) y acético (4,76)** (mecanismo medido y modelado en Breidt & Skinner 2022, análogo de
   pepino) — por lo que un umbral de pendiente fijo aplicado en todo el rango de pH es más
   propenso a disparar falsos "estancamientos" precisamente en las zonas de pH que la tabla del
   software marca como óptimas o críticas.
3. **Los pKa 3,86 (láctico) y 4,76 (acético) que usa el brief están confirmados** contra tabla
   de referencia CRC/Perrin, y replicados en Breidt & Skinner (2022).
4. **Una ventana fija en horas para declarar "estancamiento", sin corrección por temperatura, no
   es defendible**: en café real (Peñuela-Martínez et al. 2023), bajar de ~26 °C a 15 °C alargó
   el tiempo de fermentación en más de 24 horas; en vino (Coleman et al. 2007) los parámetros
   cinéticos varían hasta 6× entre 11 y 35 °C.
5. **No existe, en lo que pude leer, ningún modelo cinético mecanístico (Monod, Gompertz,
   Luedeking-Piret) publicado y ajustado sobre pH/°Brix de la fermentación húmeda de café** — el
   único ajuste cinético formal sobre subproductos de café (Chala et al. 2019) es para biogás a
   partir del residuo, un proceso microbiano distinto (metanogénesis anaerobia), no la
   fermentación que el software monitorea.
