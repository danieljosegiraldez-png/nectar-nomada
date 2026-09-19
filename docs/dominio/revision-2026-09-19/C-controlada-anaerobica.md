<!--
  PROCEDENCIA — informe de un SUBAGENTE, 2026-09-19, copiado sin editar.
  estado    : referencia externa · NO verificado salvo lo que marca con ✅
              ../revision-literatura-fermentacion-2026-09-19.md
  qué NO    : citar desde el código ni como hecho. Tiene errores conocidos: ver la
              §3 de la revisión compilada (correcciones de Codex).
-->

# Tema C — Fermentaciones controladas y de atmósfera modificada en café
## Anaeróbica sellada, SIAF, maceración carbónica, temperatura controlada, reposo en frío, sumergida vs. seca

Revisión para Néctar Nómada. Contrasta la literatura contra los perfiles `ANAEROBIC_SHORT`,
`CARBONIC_MACERATION` y `COLD_HOLD_PREFERMENT` del software (ver tabla del encargo común).

**Aviso metodológico previo, porque afecta la lectura de todo lo que sigue:** dos veces durante
esta revisión la herramienta de lectura web (`WebFetch`, un modelo pequeño que resume la página)
**inventó datos plausibles que no estaban en el texto.** Ambos casos se detectaron por control
positivo (repetir la pregunta exigiendo cita textual) y se documentan en la sección «Instrumento»
al final. Ningún número de esta lista proviene de esa vía sin haber sido re-verificado con cita
textual exacta o, mejor, leyendo el PDF/HTML yo mismo.

---

## 1. Fuentes revisadas

| # | Cita | LEÍDO | Perfil que toca |
|---|---|---|---|
| F1 | Cassimiro, D.M.J.; Batista, N.N.; Fonseca, H.C.; Naves, J.A.O.; Coelho, J.M.; Bernardes, P.C.; Dias, D.R.; Schwan, R.F. (2023). "Wet fermentation of *Coffea canephora* by lactic acid bacteria and yeasts using the self-induced anaerobic fermentation (SIAF) method enhances the coffee quality." *Food Microbiology* 110:104161. https://doi.org/10.1016/j.fm.2022.104161 | **texto completo** (PDF leído directamente, no vía resumen) | ANAEROBIC_SHORT |
| F2 | Peñuela-Martínez, A.E.; García-Duque, J.F.; Sanz-Uribe, J.R. (2023). "Characterization of Fermentations with Controlled Temperature with Three Varieties of Coffee (*Coffea arabica* L.)." *Fermentation* 9(11):976. https://doi.org/10.3390/fermentation9110976 | **texto completo** (navegador) | COLD_HOLD_PREFERMENT / temperatura controlada |
| F3 | Peñuela-Martínez, A.E.; Osorio-Giraldo, C.V.; Buitrago-Zuluaga, C.; Medina-Rivera, R.D. (2025). "Development of Fermentation Strategies for Quality Mild Coffee Production (*Coffea arabica* L.) Based on Oxygen Availability and Processing Time." *Foods* 14(17):3001. https://doi.org/10.3390/foods14173001 | texto completo, **pero la tabla de pH numérica (Tabla S1) no fue accesible** — ver nota | ANAEROBIC_SHORT / sumergida vs. seca / SA vs SIAF |
| F4 | da Silva Vale, A.; Balla, G.; Rodrigues, L.R.S.; de Carvalho Neto, D.P.; Soccol, C.R.; de Melo Pereira, G.V. (2022). "Understanding the Effects of Self-Induced Anaerobic Fermentation on Coffee Beans Quality: Microbiological, Metabolic, and Sensory Studies." *Foods* 12(1):37. https://doi.org/10.3390/foods12010037 | texto completo vía resumen, **con inconsistencia entre dos pasadas en las cifras exactas de glucosa/fructosa final** — ver nota; el dato de pH (5.8→4.4) sí se repitió idéntico dos veces | ANAEROBIC_SHORT |
| F5 | Entringer, T.L.; da Luz, J.M.R.; Veloso, T.G.R.; Pereira, L.L.; Menezes, K.M.S.; Brioschi Júnior, D.; Kasuya, M.C.M.; da Silva, M.C.S. (2024). "Genetic diversity of the fungal community that contributes to the sensory quality of coffee beverage after carbonic maceration and fermentation." *3 Biotech* 14(11):272. https://doi.org/10.1007/s13205-024-04099-z | texto completo vía resumen (metodología cuantitativa: temperaturas, tiempos, CO₂ — sin pH/Brix) | CARBONIC_MACERATION |
| F6 | Gomes, W.d.S.; Pereira, L.L.; Filete, C.A.; Moreira, T.R.; Guarçoni, R.C.; Oliveira, E.C.d.S.; Moreli, A.P.; Guimarães, C.V.; Simmer, M.M.B.; Lacerda Júnior, V.; Romão, W.; de Castro, E.V.R.; Partelli, F.L. (2022). "Changes in the Chemical and Sensory Profile of *Coffea canephora* var. Conilon Promoted by Carbonic Maceration." *Agronomy* 12(10):2265. https://doi.org/10.3390/agronomy12102265 | **texto completo** (navegador, íntegro) | CARBONIC_MACERATION |
| F7 | Martinez, S.J.; Batista, N.N.; Bressani, A.P.P.; Dias, D.R.; Schwan, R.F. (2022). "Molecular, Chemical, and Sensory Attributes Fingerprinting of Self-Induced Anaerobic Fermented Coffees from Different Altitudes and Processing Methods." *Foods* 11(24):3945. https://doi.org/10.3390/foods11243945 | texto completo vía resumen, **sin datos numéricos de pH/Brix en el texto accesible** (confirmado por control) | ANAEROBIC_SHORT (aporte cualitativo únicamente) |
| F8 | Hernández-Alcántara, G.; Alarcón-Gutiérrez, E.; Ronzón-Soto, S.; García-Pérez, J.A. (2023). "Physical and sensorial quality of yellow caturra coffee after a carbonic maceration process." *Coffee Science* 18:e182134. https://doi.org/10.25186/.v18i.2134 | **sólo resumen** (paywall/certificado impidió el texto completo) | CARBONIC_MACERATION |
| F9 | Brioschi Júnior, D. et al. (2020/2021). "Microbial fermentation affects sensorial, chemical, and microbial profile of coffee under carbonic maceration." *Food Chemistry* 342:128296. | **no encontrado texto completo** (paywall Elsevier, ScienceDirect bloqueó el acceso incluso por navegador) — citado por F6 y F8, no leído directamente | CARBONIC_MACERATION — **NO USADO como evidencia primaria**, sólo mencionado como antecedente de F6/F8 |
| F10 | Tolessa, K. et al. (2017). "Influence of growing altitude, shade and harvest period on quality and biochemical composition of Ethiopian specialty coffee." *J. Sci. Food Agric.* | resumen/título únicamente | **NO APLICA** — ver nota abajo |

**Nota sobre Tolessa:** el encargo pide verificar este nombre sin asumir su contenido. Se hizo.
El único Tolessa identificable en la literatura de café con perfil de autoría razonable es K.
Tolessa (2017), y su tema es **altitud de cultivo, sombra y época de cosecha**, no fermentación
controlada ni atmósfera modificada. No encontré ningún trabajo de un autor "Tolessa" sobre
fermentación anaeróbica, SIAF, maceración carbónica o temperatura controlada. Reporto:
**no encontrado** un Tolessa relevante para el tema C. Puede que el nombre pertenezca a otro de
los temas de esta revisión (p. ej. procesamiento tradicional/lavado), no al mío.

**Nota sobre Ferreira:** el único "Ferreira" que aparece como coautor en el entorno de estos
estudios es G. Ferreira, coautor de Bressani et al. (2021, *Food Research International*
150:110755, sobre levaduras en fermentación SIAF, no maceración carbónica) — citado dentro de F1
pero **no leído por mí** directamente. No encontré un "Ferreira" autor principal de un estudio de
maceración carbónica o fermentación anaeróbica con datos de pH/Brix. Reporto: **no verificado**,
no lo uso como fuente.

**Fuentes intentadas y no accesibles** (bloqueadas por paywall/anti-bot incluso con navegador):
Palumbo et al. 2024 (*Braz J Microbiol*, SIAF por tiempos de fermentación — sólo resumen
accesible, Springer bloqueó el cuerpo); da Mota et al./Pereira, T.S. et al. 2022 (*Food
Microbiology* 103:103962, el "SIAF original" citado por casi todos los demás — ScienceDirect
bloqueó todo intento, navegador incluido); estudio de fermentación sumergida en Coatepec,
Veracruz (SciELO Costa Rica, error de conexión repetido); Jurnal Pangan dan Agroindustri sobre
inyección de CO₂ en Yellow Caturra (servidor rechazó todas las rutas de descarga). Se anotan para
que la próxima revisión no repita el intento sin saber que ya falló.

---

## 2. Veredictos por parámetro de la tabla del software

### pH inicial y óptimo

- **ANAEROBIC_SHORT (pH óptimo 3.6–4.4, crítico bajo 3.4, disparo 3.2):** **MATIZA.** El pH
  inicial medido en fermentación anaeróbica/SIAF de café **no arranca en ese rango** — arranca
  mucho más alto. F1 (Cassimiro et al.): pH inicial 4.6–5.5 en las ocho fermentaciones SIAF de
  Conilon (Tabla 1). F4 (da Silva Vale et al.): pH inicial 5.8, descendiendo a 4.4 a las 72 h
  ("the reduction of pH from 5.8 to 4.4", leyenda de Fig. S2, confirmado dos veces). Es decir, el
  **techo** de 4.4 del perfil ANAEROBIC_SHORT es, en dos estudios distintos, más bien el **valor
  final típico a las 72 h**, no el techo del rango "óptimo" que se cruza pronto. Si el software
  usa 3.6–4.4 como ventana "óptima" desde el inicio del proceso, va a marcar como "fuera de rango"
  cualquier lote sano en sus primeras 24–36 h, porque el pH inicial medido en estos dos estudios
  ronda 4.6–5.8, muy por encima de 4.4.
- **pH crítico bajo (3.4) y disparo inmediato (3.2), ANAEROBIC_SHORT:** **RESPALDA parcialmente.**
  F1 muestra que a las 72 h el pH cae a 3.5–3.9 en general, y hasta **3.5** en la fermentación más
  ácida (MC, co-cultivo *L. mesenteroides* + *S. cerevisiae*). Ninguna de las ocho fermentaciones
  de F1 baja de 3.5 en 72 h — el crítico de 3.4 no se alcanza en este estudio ni en condiciones de
  co-inoculación agresiva. F2 (temperatura controlada, aunque es café lavado, no sellado
  anaeróbico) muestra valores finales **por debajo de 3.50** en fermentación espontánea y a 30 °C.
  Es decir, cruzar 3.4–3.5 en café bien procesado **sí ocurre**, pero como **valor final**, no
  necesariamente como señal de fallo — es coherente con el perfil siempre que el software lo lea
  como "fin de fermentación", no como "alarma de deterioro". El encargo no me da la lógica de
  disparo exacta, así que sólo puedo decir: los números 3.4/3.2 no son descabellados como
  crítico/disparo, pero **el punto de entrada (pH óptimo empezando en 3.6)** está mal calibrado
  frente a estos dos estudios — el pH nunca empieza ahí, empieza arriba de 4.4-5.8 y *llega* a ese
  rango.

### Horas de gracia antes de "estancado" (12 h para ANAEROBIC_SHORT, 6 h más nunca 12h—dato real del brief: 6h para ANAEROBIC_SHORT)

- **NO DICE / NO ENCONTRADO.** Ningún estudio leído reporta explícitamente una meseta de pH
  (`|pendiente| < 0.01 pH/h`) ni un umbral de horas-sin-cambio como criterio de estancamiento. F1
  muestrea sólo en 0/36/72 h (intervalos demasiado gruesos para verificar una ventana de 6 h). F2
  sí reporta pH en función continua del tiempo (Figura 2 del artículo) y describe explícitamente
  un comportamiento asintótico: *"Fermentation at 15 °C exhibited asymptotic behavior, maintaining
  values close to 4.0 for more than 20 h until the end of the process"* — es decir, **una meseta
  real de pH de más de 20 horas fue observada y NO fue tratada como fallo**, sino como fin normal
  del proceso a baja temperatura. Esto es relevante para COLD_HOLD_PREFERMENT (ver abajo) y
  sugiere que una ventana de estancamiento de sólo 6–12 h sería **demasiado corta** para
  fermentaciones frías: dispararía "estancado" en un proceso que sencillamente es lento por diseño.

### Brix / sólidos solubles — caída, piso, ventana de estancamiento

- **RESPALDA la dirección, MATIZA los valores exactos.** F1 (Tabla 1) da la única serie temporal
  cuantitativa de Brix que encontré para fermentación anaeróbica de café: Brix inicial 13.0–16.0
  °Bx (rango entre las 8 fermentaciones), cayendo a 36 h a 9.0–12.0 °Bx, y a 72 h a 7.0–11.0 °Bx.
  La caída porcentual típica ronda 30–45% del valor inicial hacia las 72 h (ej. control:
  14.0→8.5 = 39%; MC: 16.0→9.0 = 44%; PD: 16.0→8.0 = 50%). El perfil ANAEROBIC_SHORT pide
  "caída de Brix para terminar: 25%" y "piso de Brix: 15" — el **piso de 15 °Bx no se alcanza casi
  nunca** en F1 (7 de 8 tratamientos terminan por debajo de 15, algunos hasta en 7.0), así que si
  el software usa "piso de 15" como umbral de **alarma** (algo anormalmente bajo), va a disparar
  en fermentaciones anaeróbicas normales y sanas. Si en cambio "piso" significa "valor mínimo
  esperable de terminación", entonces 15 está muy por encima de lo medido (7–11 es lo normal a
  72 h en Conilon).
- **CONTRADICE el rango de "entrada de cereza óptima 18–24 °Bx"** en el sentido de que los valores
  iniciales medidos en pulpa/mucílago de F1 (13.0–16.0 °Bx) están **por debajo** de esa ventana.
  Esto podría deberse a que F1 mide Brix de la masa de fermentación (fruta entera + agua, relación
  32 L fruta : 16 L agua), no Brix de cereza sin diluir — el propio protocolo del software
  distingue "Brix de licor de tanque, mucílago prensado y pulpa de cereza" como series distintas,
  y F1 no especifica cuál mide exactamente más allá de "soluble solids (Refractometer)" sobre la
  masa fermentando. **MATIZA:** el valor depende crucialmente de qué fracción se mide, algo que el
  software ya reconoce en su diseño pero que la mayoría de los papers no aclaran con el detalle
  que el software necesita.

### Temperatura

- **NO DICE / RESPALDA cualitativamente.** Ninguno de los perfiles del software fija un rango de
  temperatura explícito, así que no hay nada que contrastar directamente, pero los hallazgos son
  relevantes para cualquier futura calibración:
  - F1: temperatura de la masa 22–26 °C al inicio, variando ≤2 °C durante toda la fermentación de
    72 h (temperatura ambiente, sin control activo).
  - F2: en fermentación espontánea (control), la temperatura de la masa **sube** progresivamente
    hasta ~26 °C (ΔT 2.8–3.4 °C) — es exotérmica, consistente con actividad microbiana activa, no
    con un proceso inerte.
  - F5 (maceración carbónica): usa temperaturas controladas activamente en incubadora (18, 28,
    38 °C) — muy por encima del rango ambiente típico de beneficio, y con presión de CO₂ inyectado
    (20 kgf/cm², no pasivo).

### Duración

- **RESPALDA en general, MATIZA los límites.** F1 usa 72 h como duración estándar de SIAF con
  Conilon. F4 prueba 24/48/72 h y observa que fermentaciones más largas producen residuos de
  azúcar (sobre todo fructosa) que **no necesariamente son un fallo**: *"residual sugars...are
  usually associated with short fermentation cycles, i.e., between 24 and 36 h"* y advierte que
  *"only increasing the fermentation time does not guarantee that the indigenous microbiota can
  consume all the sugars in the mucilage, especially fructose"* — es decir, alargar el proceso no
  garantiza consumo completo de azúcar, así que un piso de Brix rígido por horas puede no
  cumplirse aunque el lote esté sano.
  Para maceración carbónica, F5 evalúa hasta 120 h (24, 48, 72, 96, 120 h) sin reportar "fallo" a
  esas duraciones — al contrario, F6 encuentra que **la mejor puntuación sensorial fue a 120 h y
  38 °C** (83.25 puntos vs. 78.64 a 24 h/18 °C), y F8 encuentra que la calidad física del grano
  **se ve negativamente afectada después de 10 y 15 días** (240–360 h) aunque la calidad sensorial
  siga subiendo — un desacople entre calidad física (empieza a fallar) y calidad de taza (sigue
  mejorando) que el perfil CARBONIC_MACERATION del software (24 h de gracia antes de "estancado")
  no contempla en absoluto: la ventana real observada en la literatura es de **días**, no de horas,
  para este proceso específico.

### Fallo / signos de deterioro

- F3 (Peñuela-Martínez et al. 2025, comparación SA abierto vs. SIAF cerrado, 192 h) es el hallazgo
  más fuerte sobre **cuándo un proceso anaeróbico realmente falla**, aunque no me dejó verificar
  su tabla numérica de pH (ver nota de instrumento). Lo que sí confirmé palabra por palabra:
  - *"Embryo viability also declined significantly over time (p < 0.0001)."*
  - *"The greatest reduction was observed in samples from the SA condition (p = 0.0002)."*
  - *"The least damage seen in whole fruits fermented under SIAF conditions, up to 120 h
    (p = 0.0043)."*
  - *"The proportion of healthy beans was significantly influenced by fermentation
    condition—markedly lower under semi-anaerobic (SA) conditions (p = 0.0126)."*
  - Conclusión textual: *"Fermenting whole fruits under semi-anaerobic or open-tank conditions is
    not advisable beyond 24 h, due to its negative impact on physical quality and embryo
    viability."*
  Esto **RESPALDA la existencia de un límite de "gracia" antes de daño real**, pero ese límite es
  específico de fermentación **abierta/semi-anaeróbica** (SA), no del tanque sellado (SIAF): bajo
  SIAF sellado el daño se retrasa y es menor. El perfil ANAEROBIC_SHORT del software (6 h de
  gracia) describe un proceso mucho más corto que el observado como seguro aquí (SIAF tolera bien
  hasta 120 h en este estudio específico de café entero).

---

## 3. Microbiología y química — contexto para interpretar pH/Brix

- **Sucesión típica bajo anaerobiosis (F1, F4):** ácido málico se consume rápido (F1: 75.4% de
  málico consumido a las 36 h en el tratamiento con *S. cerevisiae* co-inoculado); ácido láctico
  se produce después de 36 h y alcanza su máximo hacia las 72 h; ácido acético aumenta hacia el
  final salvo en un tratamiento. F4 encuentra reducción de pH de 5.8 a 4.4 asociada a bacterias
  ácido-tolerantes (*Lactobacillus*).
- **Dominancia microbiana bajo sellado vs. abierto (F3):** *Weissella* domina como LAB bajo ambas
  condiciones; bacterias ácido-acéticas (*Acetobacter*) son más abundantes bajo condiciones
  semi-anaeróbicas (abiertas) que bajo SIAF sellado — coherente con menor disponibilidad de O₂
  limitando el crecimiento de acéticas obligadas bajo sellado real.
- **Maceración carbónica — mecanismo distinto, no sólo "anaeróbico más CO₂" (F6, discusión):** el
  CO₂ dispara **fermentación intracelular enzimática dentro de la cereza intacta** antes de que
  intervengan microorganismos externos — un metabolismo respiratorio que pasa a fermentativo
  dentro del fruto, distinto en mecanismo del consumo microbiano de mucílago en SIAF. Cita
  Santamaría et al. (vía F6, no verificada de primera mano): bajas temperaturas retrasan la
  fermentación alcohólica intracelular y **alargan el riesgo de contaminación**; temperaturas
  >30 °C favorecen la fermentación intracelular óptima. Esto es coherente con el hallazgo directo
  de F5/F6 de que 38 °C y tiempos largos (96–120 h) dan mejores resultados sensoriales que
  18 °C/24 h.
- **Temperatura controlada en frío (F2) — mecanismo:** a 15 °C el pH se estabiliza cerca de 4.0
  durante >20 h sin seguir bajando ("asymptotic behavior"), mientras que a 30 °C y en fermentación
  espontánea el pH final baja de 3.5. F2 vincula esto a una relación inversa entre población de
  bacterias ácido-acéticas (género *Gluconobacter*) y pH final — más acéticas, pH final más bajo —
  y a que **el frío no impide la fermentación, la retrasa** (>24 h más para llegar a 95% de
  degradación de mucílago), sin diferencia significativa en calidad sensorial final (Wilcoxon
  p > 0.05 entre temperaturas y contra espontánea).

---

## 4. Instrumento — dos fabricaciones detectadas y cómo se cazaron

1. **Tabla de pH inventada (F3, Foods 14173001).** Una primera lectura vía `WebFetch` devolvió una
   tabla completa de valores de pH por tiempo y tratamiento (24/48/96/192 h × Pulped/Fruit ×
   SA/SIAF), con valores de pH 2.4–2.8 — fisiológicamente implausibles para mucílago de café
   (rango normal 4–6.5 según el propio encargo). Se sospechó por el número, no por el formato: pH
   2.4–2.8 es más propio de acidez titulable que de pH de mucílago. Una segunda pasada, exigiendo
   cita textual verbatim y advirtiendo del rango fisiológico esperado, reveló que **la Tabla S1
   real es un archivo suplementario que la herramienta nunca pudo leer**, y que había fabricado la
   tabla completa de la nada. Ningún valor de esa tabla se usa en este informe.
2. **Cifras de glucosa/fructosa inconsistentes entre pasadas (F4, Foods 12010037).** Primera
   pasada: "Residual glucose: 6.27 g/L; Residual fructose: 35.10 g/L" a 72 h (sin especificar capa
   del tanque). Segunda pasada, exigiendo cifras exactas por capa: capa inferior a 72 h, glucosa
   4.47 ± 0.04 g/L, fructosa 18.67 ± 0.80 g/L — **valores distintos a los de la primera pasada**.
   Como las dos no pueden ser correctas a la vez y no pude verificar cuál (si alguna) es fiel al
   PDF, **no uso ninguna de las dos cifras de azúcar residual** en las conclusiones; sólo el dato
   de pH (5.8→4.4), que sí se repitió idéntico dos veces y coincide con la leyenda citada de
   Figura S2.

**Regla aplicada:** cualquier número que dependiera de una sola pasada de `WebFetch` sin
verificación textual independiente se trató como no confiable y se excluyó. Los números que sí
aparecen en este informe con cifras exactas (F1/Cassimiro, F2/Peñuela-Martínez temperatura) vienen
de lectura directa del PDF (F1) o de texto renderizado completo vía navegador (F2, F6), no de
resúmenes de una sola pasada.

---

## 5. Recomendaciones concretas para el software

1. **ANAEROBIC_SHORT — revisar el rango "óptimo" de pH.** 3.6–4.4 describe razonablemente el
   **tramo final** de una fermentación anaeróbica sana (F1, F4), pero el pH **inicial** medido en
   ambos estudios primarios está entre 4.6 y 5.8 — muy por encima del techo de 4.4. Si "óptimo"
   se evalúa desde el arranque del proceso, el software marcará como anómalo el estado normal de
   las primeras horas.
2. **ANAEROBIC_SHORT — el piso de Brix (15 °Bx) es alto frente a lo medido.** F1 (Conilon, SIAF,
   72 h) termina en 7.0–11.0 °Bx en 7 de 8 tratamientos. Si 15 es un umbral de alarma "por debajo
   de esto algo va mal", va a disparar casi siempre.
3. **CARBONIC_MACERATION — la ventana de 24 h de gracia antes de "estancado" es corta frente a la
   literatura.** Los estudios de maceración carbónica en café miden en días (24–120 h de proceso
   en F5/F6, hasta 15 días de maceración total en F8), con mejores resultados sensoriales a mayor
   tiempo y temperatura (F6: mejor puntaje a 120 h/38 °C). Un "estancamiento" a las 24 h puede
   estar describiendo el comportamiento normal, no un fallo — aunque el deterioro **físico** del
   grano sí aparece hacia 10-15 días (F8), una escala muy distinta a 24 h.
4. **COLD_HOLD_PREFERMENT — la meseta de pH prolongada es un comportamiento esperado a baja
   temperatura, no un fallo.** F2 documenta explícitamente una meseta asintótica de pH >20 h a
   15 °C que termina en un pH **más alto** (menos ácido, cerca de 4.0) que el de fermentación
   espontánea o a 30 °C (<3.5). La ventana de gracia de 12 h del perfil COLD_HOLD_PREFERMENT
   parece corta frente a esto; y el hecho de que el frío dé un pH final *más alto*, no más bajo,
   sugiere que el pH crítico bajo (3.5) y el disparo (3.3) compartidos con WASHED_STANDARD pueden
   ser conservadores mas no erróneos para este perfil — el riesgo real detectado en la literatura
   es de **lentitud**, no de sobreacidificación.
5. **Ningún estudio leído mide directamente CO₂/presión ni oxígeno disuelto con series
   temporales utilizables para calibrar umbrales.** F5 y F6 controlan la inyección de CO₂ (20
   kgf/cm² puntual, no continua) pero no reportan presión residual en el tiempo. No encontré
   literatura con mediciones de oxígeno disuelto en tanques de café sellados — sólo descripciones
   cualitativas de consumo de O₂ residual. Si el software modela CO₂/O₂ disuelto explícitamente,
   **no hay respaldo cuantitativo en esta revisión** — repórtese como no encontrado, no como
   validado.

---

## Resumen de 15 líneas (para la respuesta final)

- 10 fuentes evaluadas; **6 leídas a texto completo** (2 por lectura directa de PDF/HTML, 4 vía
  resumen de herramienta con verificación cruzada), 1 sólo resumen, 1 no accesible pero citada por
  otras, 1 confirmada como fuera de tema (Tolessa), 1 no verificable (Ferreira).
- **Hallazgo 1:** el techo de pH "óptimo" de ANAEROBIC_SHORT (4.4) es, en dos estudios primarios
  de SIAF, el valor típico *final* a 72 h, no el techo desde el arranque — el pH inicial real es
  4.6–5.8.
- **Hallazgo 2:** el piso de Brix de ANAEROBIC_SHORT (15 °Bx) es más alto que lo medido en Conilon
  SIAF a 72 h (7–11 °Bx en 7 de 8 tratamientos), riesgo de falsos positivos de alarma.
- **Hallazgo 3:** la maceración carbónica tolera y hasta mejora con tiempos largos (mejor
  puntuación sensorial a 120 h/38 °C); 24 h de gracia antes de "estancado" es corto frente a la
  escala real del proceso (días, no horas), aunque el deterioro físico del grano sí aparece a los
  10-15 días.
- **Hallazgo 4:** en frío (15 °C) el pH se estabiliza en una meseta >20 h y termina en un valor
  *más alto* (menos ácido, ~4.0) que a 30 °C o espontáneo (<3.5) — el reposo en frío no es una
  fermentación "congelada" sino retrasada, y el riesgo es de lentitud, no de sobreacidificación.
- **Hallazgo 5:** bajo tanque sellado (SIAF) el daño a viabilidad de embrión y % de granos sanos
  se retrasa y es menor que en tanque abierto semi-anaeróbico (SA); un estudio recomienda no
  fermentar en abierto más de 24 h, límite que no aplica igual al sellado.
- Se detectaron y descartaron **dos fabricaciones de la herramienta de lectura web** (una tabla de
  pH inventada, y cifras de azúcar residual inconsistentes entre dos pasadas) — documentadas en
  la sección 4 para que no se reintroduzcan en otra sesión.
- Tolessa (2017) se verificó y **no trata de fermentación controlada/anaeróbica** — es de
  altitud/sombra/cosecha; no aplica al tema C.
- No se encontró literatura cuantitativa sobre CO₂/presión residual ni oxígeno disuelto en el
  tiempo dentro de tanques sellados de café — reportar como no encontrado si se necesita para
  calibrar esos parámetros.
