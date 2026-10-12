<!--
  PROCEDENCIA — léela antes de citar nada de este archivo.

  estado    : referencia externa · revisión compilada
  origen    : revisión de literatura hecha el 2026-09-19 a pedido de Daniel («revisemos bien toda
              literatura de procesamiento de café de especialidad de fermentaciones controladas y no
              controladas, inoculadas y no inoculadas… no asumas que sabes algo porque veas el título»).
              Seis subagentes leyeron fuentes por tema; sus informes, sin tocar, están en
              `revision-2026-09-19/`. Un agente verificó él mismo las citas decisivas abriendo la fuente,
              y Codex revisó la síntesis como segundo asiento.
  revisado  : cada afirmación lleva su marca:
              ✅ = cita comprobada por el agente contra la fuente, con la frase o la tabla;
              ◻ = la reporta un subagente y NO se comprobó aparte. No citar ◻ como hecho.
  qué puede : servir de referencia para escribir recetas y para la guía pedagógica, citando la fuente.
  qué NO    : ser umbral del motor. Por decisión de Daniel (ADR-181) los umbrales salen de la receta;
              esto es lo que la receta puede mirar al lado, marcado «referencia, no norma».
-->

# Fermentación de café: qué respalda la literatura, parámetro por parámetro

Lo que el paquete v3.1 (`docs/beneficio/10`–`13`) carga como `[PROVISIONAL]` —«práctica general de
industria»— **no cita ninguna fuente**. Esta revisión fue a buscarlas. La conclusión corta: **hay
valores de referencia contextualizados, no una banda universal validada**, y casi todo depende de la
temperatura, del proceso y de qué se mide.

## 1. Lo comprobado (✅)

| fuente | qué dice | condiciones |
|---|---|---|
| **Peñuela-Martínez, García-Duque, Sanz-Uribe 2023**, *Fermentation* 9(11):976, doi 10.3390/fermentation9110976 (PDF de Cenicafé) | Tabla 2, horas hasta degradar >95 % del mucílago: Castillo 42,1 h a 15 °C / 20,0 h a 30 °C / 17,7 h espontánea; Cenicafé1 41,7 / 18,8 / 17,3; Tabi 41,3 / 17,5 / 16,8. Resumen: *«the treatment at 15 °C prolonged the degradation of mucilage in more than 24 h»*; pH final espontánea <3,5 y a 15 °C ~4,0; *«Quality was not significantly different»* (>82 SCA). | Colombia; biorreactor con camisa; espontánea a ambiente 23–31 °C; pH-metro Hanna ATC calibrado 7,0/4,0 en cada uso |
| **Zhang et al. 2019**, *Front. Microbiol.* 10:2621, PMC6863779 | *«the initial pH was approximately 6.0–6.5 and decreased continuously until approximately 4.0»*; *«the major pH drop happened after 36 h»*; T inicial ~15 °C, final 11–13 °C | Yunnan, China, 1300 m; tanques con agua, 2000 kg |
| **De Bruyn et al. 2017**, *AEM* 83(1):e02398-16, PMC5165123 | pH de la masa *«from 4.5 (after 16 h of fermentation) to 4.0 (after 36 h)»* | Ecuador, 1329 m, lavado; **no reporta temperatura** |
| **Tirado-Kulieva et al. 2024**, *Curr. Res. Food Sci.*, PMC11245949 | *«a final pH close to 4.6 was established to indicate the end of the fermentation process»* (citando literatura previa); pH 5,60/5,43/5,57 → 4,77/4,60/4,67 en 24 h; **°Brix inicial 15,87 / 15,13 / 16,53** | Perú; Typica/Caturra/Catimor; mosto **seco, sin agua** |
| **Codex CAC/RCP 69-2009** (PDF ICO ed-2074e-ota) | *«direct drying of the pulped beans within their mucilaginous parchment, followed by hulling to produce semi-washed green coffee»*; *«Mucilage: … Not present in unripe and overripe coffee.»*; §27 fermentación en agua *«for between 12 and 36 hours»*; §29d *«as short as possible (12 to 36 hours)… Monitoring… ambient temperature»* | norma de prevención de ocratoxina A |
| **Fermentis SafCoffee Sunrise Orange** (ficha web) | *S. cerevisiae*; 1 g/kg; *«Ideally at 20°C – 30°C»*; >18 °C *«60-hour fermentation period… reduced to 24-48 hours if temperatures rise above 25°C»*. **No menciona pH ni °Brix.** | especificación del fabricante |
| **Fermentis SafŒno Bioprotect MP-72** (ficha web) | *Metschnikowia pulcherrima*; bioprotección de mostos y uva en *«cold soak/cold maceration»*; 10–20 g/hL; *«up to 5 days at less than 10°C»*. **No menciona café.** | enología; su uso en CryoBloom es transferencia deliberada, y sus parámetros en café salen de la experiencia de Daniel |
| **AgraTronix Coffee Tester 08150** (catálogo 2015 que dio Daniel) | verde 7–35 %, pergamino 8–38 %; 0–45 °C; ±0,5 % en rango normal de grano almacenado; resolución 0,1 %; capacitivo; **no mide actividad de agua** | especificación del fabricante; el PDF no se versiona |

## 2. Lo que dice la literatura de cada parámetro del perfil

**Temperatura.** Gobierna el tiempo: a 15 °C la misma degradación tarda más del doble que a 30 °C
(✅ Cenicafé). **En las fuentes revisadas no encontramos ninguna ventana fija en horas sin temperatura**; los fabricantes dan
duración por tramo de temperatura (✅). Los motores de `lib/beneficio` no leen temperatura. Matiz de
Codex: eso no refuta una ventana fija **como recordatorio para revisar**; la refuta como diagnóstico
universal de estancamiento.

**Duración total ≠ tiempo sin cambios.** Que una fermentación dure 72–120 h no dice cuánto puede
pasar sin avanzar. Los fabricantes (◻ Lallemand: 36–96 h natural, 36–48 h despulpado; mínimo 36 h
para efecto aromático) dan duración **total**, no ventana de alarma.

**Punto de lavado (fin de fermentación de un lavado).** Referencias: «cerca de 4,6» (✅ Tirado-Kulieva,
citando literatura previa); ◻ manual preparatorio CQI QP2 (consultor, no oficial): «parar antes de 4,0;
preferible 4,5–4,6». Como **trayectoria**, no como punto de lavado: 4,5 a las 16 h y 4,0 a las 36 h
(✅ De Bruyn). Son criterios distintos —demucilaginación,
elección del investigador, sensorial— y no una banda validada.

**pH bajo como daño.** La espontánea de Cenicafé terminó **por debajo de 3,5 sin diferencia
significativa de calidad** (✅). 3,5 no significa daño por sí solo.

**pH alto como «dilución».** El licor de tanque recién despulpado midió 6,0–6,5 (✅ Zhang). El agua
del beneficio de Daniel mide 6,5–6,9 y algunas aguas llegan a 7–8 (Daniel). La frase del paquete
«el mucílago fresco no supera ~6,0» **no tiene fuente**.

**Brix.** **En lo revisado no encontramos umbrales de °Brix de fermentación**: ✅ las fichas de
Fermentis no mencionan pH ni Brix; ◻ lo demás lo reportan los subagentes. El mosto seco arranca ya en 15–16,5 °Bx (✅ Tirado-Kulieva): un piso de 15 diría
«listo» al empezar. El refractómetro y el hidrómetro no leen azúcar: el etanol y el consumo de azúcar
mueven el índice de refracción en sentidos opuestos, y la densidad de otra forma (corrección de Codex
al informe D). ◻ Contradicción sin resolver: el informe B dice que nadie publica series de Brix en
fermentación inoculada; el C atribuye una a Cassimiro 2023 (*C. canephora*, SIAF). No verificado.

**Pendiente de pH (meseta 0,01 pH/h).** ◻ En las fuentes de café que leyeron los subagentes, ninguna usa
pendiente; usan pH absoluto. No comprobado aparte.
La capacidad tampón (◻ Breidt & Skinner 2022, en pepino) aconseja cautela al leer pendientes cerca de
los pKa del láctico (3,86) y el acético (4,76), pero **no demuestra mesetas en café** (Codex).

**El defecto no es sólo pH y tiempo.** ◻ Zhang et al. 2019 (*AEM*): fermentaciones largas dominadas
por bacterias lácticas no dieron defecto; los defectos vienen de enterobacterias y clostridios. pH y
Brix son indicios de la sucesión microbiana, no su causa.

**Anaeróbico / SIAF.** ◻ pH inicial 4,6–5,8 y 24–72 h para bajar (Cassimiro 2023 en *canephora*; da
Silva Vale 2022). Con una gracia de 6 h, `ANAEROBIC_SHORT` **podría** declarar estancado un lote sano:
es un riesgo inferido, **no un fallo observado** (Codex). Los lotes anaeróbicos reales de Daniel
(PE-77/78, 5,4 → 4,4 en 24 h a 25–27 °C) hoy reciben el perfil `NATURAL` porque su grado es «Natural».

**Semi-lavado.** En la norma (✅ Codex/ICO), «semi-washed» es secar el despulpado **dentro** de su
pergamino mucilaginoso. El «Semi Wash 50 % / 75 %» de Daniel es el **porcentaje de mucílago quitado**
antes de la cama (ADR-181): otra cosa, y deliberada. Los porcentajes de honey amarillo/rojo/negro
**no tienen fuente académica** (◻).

> **Corregido el 2026-10-04 (decisión de Daniel del 2026-10-03):** el «Semi Wash 50 % / 75 %» de Daniel **no** es el
> porcentaje de mucílago quitado, como decía el párrafo de arriba: es el que **le queda** (75 % = le queda el 75 %; 0 % =
> Lavado; 100 % = Honey). Sigue siendo otra cosa que el «semi-washed» de la norma, y deliberada. El párrafo se conserva
> como se escribió; la misma nota está en ADR-181, punto 12.

## 3. Correcciones que hizo Codex a los informes (no citar lo tachado)

- Informe B: el «ajuste activo del pH con azúcar y harina» en Madrid-Restrepo 2025 **lo añadió el
  agente**; el método no lo describe.
- Informe E: presentar el Semi Wash de Daniel como «desviación / lavado incompleto» **es invención**.
- Informe D: el efecto del etanol sobre el Brix está mal descrito (ver arriba).
- Informe F: dice «24 h (Cool Blue, <18 °C)» en la tabla y «7 días» en la ficha transcrita.
- Síntesis: la comparación Ecuador–Yunnan no aísla la temperatura (cambian microbiota, agua, escala);
  «~3 días» de PE-77/78 no «cumple» la ficha de 60 h: es orden de magnitud cercano.

## 4. Lo que no se encontró

Modelos cinéticos (Monod, Gompertz, Luedeking–Piret) ajustados a pH o Brix de fermentación de café;
series de CO₂/presión/O₂ en tanques sellados; cualquier fuente para el número 48 h del reposo frío;
rangos académicos de °Brix de cereza madura (el 18–24 / <16 aparece sólo en sitios comerciales ◻).
