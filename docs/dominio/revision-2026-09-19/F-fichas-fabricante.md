<!--
  PROCEDENCIA — informe de un SUBAGENTE, 2026-09-19, copiado sin editar.
  estado    : referencia externa · NO verificado salvo lo que marca con ✅
              ../revision-literatura-fermentacion-2026-09-19.md
  qué NO    : citar desde el código ni como hecho. Tiene errores conocidos: ver la
              §3 de la revisión compilada (correcciones de Codex).
-->

# F — Fichas técnicas de fabricante: levaduras y bacterias para café

Ámbito: Fermentis (SafCoffee, fermentis.com) y Lallemand (LalCafé,
lalcafebylallemand.com). Se buscó además AEB, Enartis, Angel Yeast y
Chr. Hansen/Novonesis — resultado al final.

**Regla de esta sección**: todo lo que sigue es **especificación del
fabricante** (marketing técnico + hoja de producto en su propio sitio), no
literatura independiente revisada por pares. Se marca `LEÍDO: texto completo`
porque se leyeron las páginas HTML públicas completas; las fichas técnicas en
**PDF** de Lallemand están detrás de un formulario de contacto («Request
information») y no se pudieron leer — se dice explícitamente dónde falta ese
dato, en vez de inferirlo.

---

## Dato urgente para el dueño: verificación de la cepa que usa

**Sunrise Orange — CONFIRMADO.** La afirmación de una conversación anterior del
proyecto («S. cerevisiae, rango recomendado de 20–30 °C y 1 g/kg») **coincide
exactamente** con la ficha pública de Fermentis:

> "_Saccharomyces cerevisiae_ strain selected to enhance the fruitiness of
> coffee" — especie/cepa.
> "100g of SafCoffee™ Sunrise Orange per 100kg of whole or depulped coffee
> cherries (1g/kg)" — dosis.
> "Ideally at 20°C – 30°C (68°F – 86°F)" — rango de uso.

Fuente: https://fermentis.com/en/product/safcoffee-sunrise-orange/ (LEÍDO:
texto completo).

**Dato nuevo, no pedido pero relevante: MP72 y HDA54 no son productos de café.**
El repositorio nombra "MP72" y "HDA54" junto a las cuatro SafCoffee. Se buscaron
por nombre en fermentis.com y lalcafebylallemand.com. **Ninguno de los dos
existe como producto de café** en ninguno de los dos fabricantes. Lo que sí
existe, con esos códigos casi exactos, son dos productos de **enología** de
Fermentis:

- **SafŒno™ Bioprotect MP-72** — *Metschnikowia pulcherrima* no-Saccharomyces,
  para bioprotección de mosto antes de la fermentación alcohólica (vino/fruta).
  Dosis "10 to 20 g/hL". No se fermenta con ella; se usa en la fase de
  maceración fría previa, y luego se inocula una *S. cerevisiae* aparte.
  Fuente: https://fermentis.com/en/product/safoeno-bioprotect-mp-72/ (LEÍDO:
  texto completo). Sin mención de café en la ficha.
- **SafŒno™ HD A54** — híbrido "*Saccharomyces cerevisiae x Saccharomyces
  bayanus*", para vinos blancos/rosados. "Optimum temperature fermentation:
  14-30°C (57-86°F)". Fuente:
  https://fermentis.com/en/product/safoeno-hd-a54/ (LEÍDO: texto completo).
  Sin mención de café en la ficha.

**Esto no es una corrección silenciosa, es una señal**: si el beneficio usa
MP72 y HDA54 en lotes de café reales, está usando productos que Fermentis
**vende y documenta para vino**, no para café — no hay ficha de fabricante que
respalde dosis, temperatura o duración *para café* con esas dos referencias.
Cualquier parámetro que el software calcule para esos dos cultivos (si el
software los trata como perfiles) no tiene respaldo de fabricante — sólo la
experiencia propia del beneficio, que es un dato distinto y debe marcarse como
tal. No se puede descartar que exista una tercera referencia con esos nombres
en un catálogo interno o un lote de muestra que Fermentis no publica en su web
pública; eso no se pudo verificar y se dice así.

---

## 1. Fermentis — SafCoffee™ (4 productos, los 4 públicos que existen)

Fuente índice: https://fermentis.com/en/safcoffee-coffee-fermentation-solutions/
(LEÍDO: texto completo). Los cuatro productos listados ahí son el catálogo
completo de SafCoffee — no hay un quinto producto oculto.

### SafCoffee™ Cool Blue
URL: https://fermentis.com/en/product/safcoffee-cool-blue/ — LEÍDO: texto completo (HTML público; el PDF de la ficha está enlazado pero no se abrió el binario).

- **Especie**: "*Saccharomyces pastorianus*" — cepa de fermentación fría (nota: es la especie típica de lager, no *S. cerevisiae*; distinto del resto de la gama).
- **Dosis**: "100g of SafCoffee™ Cool Blue per 100kg of whole or depulped coffee cherries (1g/kg)".
- **Rehidratación**: "gently pour the desired quantity of yeast into 10 times its weight of potable water at 10-25°C" — nota: rango de rehidratación más frío que el resto de la gama (10-25 °C vs 15-35 °C).
- **Temperatura de uso**: "Ideally at 8°C – 18°C (46.4°F – 64.4°F)"; en ensayos "to ferment coffee fruits from 8°C to 25°C".
- **Duración**: "For fermentation temperatures below 18°C (64.4°F), we recommend a 7-day fermentation period."
- **Método**: cerezas enteras o café despulpado; Arábica y Robusta.
- **pH/°Bx**: la ficha **no lo dice**.
- **Criterio de fin de fermentación**: la ficha **no lo dice** — sólo da una duración fija por rango de temperatura, no un valor de pH/°Bx de corte.

### SafCoffee™ Deep Amber
URL: https://fermentis.com/en/product/safcoffee-deep-amber/ — LEÍDO: texto completo.

- **Especie**: "*Saccharomyces cerevisiae*" + mezcla de enzimas (blend).
- **Dosis**: "200g of SafCoffee™ Deep Amber per 100kg of whole or depulped coffee cherries (2g/kg)" — el doble que el resto de la gama.
- **Rehidratación**: agua potable a "15-35°C (59-95°F)", 10x el peso, reposo 15-30 min.
- **Temperatura de uso**: "Ideally at 8°C – 30°C (46.4°F – 86°F)".
- **Duración**, tres tramos por temperatura:
  - "8-15°C (46.4-59°F), fermentation will take up to 7 days"
  - "15-25°C (59-77°F), we recommend a 60-hour fermentation period"
  - "reduced to 24-48 hours if temperatures rise above 25°C (77°F)"
- **Método**: cerezas enteras o despulpadas; Arábica y Robusta.
- **pH/°Bx**: la ficha **no lo dice**.

### SafCoffee™ Sunrise Orange
URL: https://fermentis.com/en/product/safcoffee-sunrise-orange/ — LEÍDO: texto completo.
(Detalle completo arriba, en la verificación pedida.) Añadido:

- **Duración**: "60-hour fermentation period" a 18 °C o más; "reduced to 24-48 hours if temperatures rise above 25°C (77°F)".
- **Rehidratación**: 15-35 °C, 10x peso en agua, reposo 15-30 min.
- **pH/°Bx**: la ficha **no lo dice**.

### SafCoffee™ Green Origins
URL: https://fermentis.com/en/product/safcoffee-green-origins/ — LEÍDO: texto completo.

- **Especie**: "*Saccharomyces cerevisiae*".
- **Dosis**: "100g ... per 100kg ... (1g/kg)".
- **Temperatura**: "Ideally at 20°C – 30°C (68°F – 86°F)"; fermentación requiere "temperatures exceeding 18°C (64.4°F)".
- **Duración**: "60-hour fermentation period" sobre 18 °C, reducible a 24-48 h sobre 25 °C — mismo patrón que Sunrise Orange.
- **pH/°Bx**: la ficha **no lo dice**.

### Lo que las cuatro fichas de Fermentis tienen en común (y lo que nunca dicen)
- Todas dan: especie, dosis en g/kg de cereza entera o despulpada, protocolo de rehidratación (agua potable, 10x peso, reposo 15-30 min), rango de temperatura de uso, duración recomendada por tramo de temperatura, empaque, vida útil (36 meses).
- **Ninguna de las cuatro fichas de Fermentis menciona pH ni °Brix**, ni como valor de entrada, ni como valor de control, ni como criterio de corte. La duración que dan es un número fijo de horas por rango de temperatura ambiente — no una lectura de pH/Brix en el tanque. Esto es un **NO DICE** limpio, no un matiz.

---

## 2. Lallemand — LalCafé™ (8 productos públicos: 7 levaduras + 1 bacteria)

Catálogo completo verificado en la página de productos —
https://www.lalcafebylallemand.com/en/products/ (LEÍDO: texto completo,
"Showing 8 of 8"): LDP, INICIO, INTENSO, CIMA, ORO, BACTI-FRESH, BRIOSA, BSC.
**Cima, Oro e Intenso** (las que el software probablemente reconoce por
familiaridad de mercado) están entre estos ocho — no hay "BlackBerry" en el
catálogo público actual; puede ser un nombre descontinuado, regional, o mal
recordado. **No se inventa**: se dice que no se encontró, y no se sustituye por
otro nombre.

Aviso de acceso: las fichas técnicas PDF de Lallemand exigen "Request
information" — un formulario con datos de contacto — para descargarlas. No se
completó ese formulario (no es una URL pública, y esta tarea no autoriza
introducir datos personales en formularios de terceros). Todo lo que sigue es
del HTML público de cada página de producto, más la página de preguntas
frecuentes pública, que sí trae cifras.

### Ficha general de dosis/rehidratación/duración — aplica a TODA la gama
URL: https://www.lalcafebylallemand.com/en/frequently-asked-questions/ —
LEÍDO: texto completo. Esta página es la única fuente pública de Lallemand con
cifras (no está en las páginas de producto individuales).

- **Dosis**: "The optimal dosage is 1 g per kg of coffee." Si el agua es
  dudosa (turbia, olor a fermentación/alcohol): "increase the dosage to 1.5 g
  per kg of coffee or double the dosage."
- **Sobredosis**: "Overdosing will have no impact on final coffee quality. It
  will not reduce fermentation time." Subdosificar sí muestra menos efecto.
- **Rehidratación**: "rehydrated in 10 times the volume of water (10 liters
  for 1kg)"; agua limpia entre "25 ºC and 35 °C"; reposo "20 minutes";
  "Inoculate coffee within 30 minutes of rehydration"; y una nota explícita de
  choque térmico: "Bring the temperature of the rehydrated yeast to within
  5 °C of the coffee mass before inoculation."
- **Duración para impacto sensorial** (esto es distinto de "horas de gracia
  antes de estancado" del software — es la duración total recomendada, no un
  umbral de alarma): "We recommend fermentation duration of 36h to 96h to
  obtain a perceivable aromatic expression... For dry process duration of 36
  to 96h. For Pulped wet process duration 36h to 48h." Y explícitamente:
  "During the fermentation (minimum 36 hours for impact on flavour)..." — por
  debajo de 36 h, el fabricante no promete efecto sensorial de la levadura.
- **Cuándo termina la fermentación (relevante para el parámetro del software)**:
  "Even though demucilagination is complete, continued contact may benefit
  flavour development, LALCAFÉ™ yeasts need more time to reveal the coffee
  aromas." — **el fabricante dice explícitamente que el fin de la
  demucilaginación NO es la señal de parar**, lo cual es relevante si el
  software (o el operador) usa "ya no hay mucílago" como proxy de fin de
  fermentación.
- **Madurez de cereza**: "at least 60% ripeness and above" como umbral mínimo
  observado con buenos resultados; "Best practice is to use fully ripe
  cherries."
- **Reutilización de levadura**: no recomendado — "mortality of yeast as food
  depletes... unreliable"; "yeast autolysis at the end when they die".
- **Almacenamiento**: "+4 °C" ideal, nunca congelar; hasta 30 °C tolerado
  "for more than 6 months" (fuera de ese límite, no se garantiza); abierto:
  usar en 15 días.
- **Vida útil por producto**: "2 years for LALCAFÉ CIMA™; 3 years for LALCAFÉ
  INTENSO™; 4 years for LALCAFÉ ORO™, LALCAFÉ BRIOSA™, LALCAFÉ BSC™, LALCAFÉ
  LDP™ and LALCAFÉ INICIO™."
- **pH/°Bx**: esta página, que es la más técnica y pública de todo el sitio de
  Lallemand, **no menciona pH ni °Brix en ningún punto**. NO DICE.

### Fichas de producto individuales — lo que cada una añade sobre la general

**LALCAFÉ CIMA™** — https://www.lalcafebylallemand.com/en/products/lalcafe-cima/ (LEÍDO: texto completo)
- "*Saccharomyces cerevisiae* yeast... post‑harvest processing of Specialty Arabica and Fine Robusta". Natural y despulpado.
- "can tolerate temperatures as low as 10 °C" — único dato de temperatura dado en la página de producto (no da un rango superior).
- Efecto: "modulating acidity for improved balance and clarity"; "reduction in astringency". No cuantifica la modulación de acidez (no hay Δ pH).
- Vida útil: 2 años (la más corta de la gama), empaque 500 g / 10 kg, <20 °C.

**LALCAFÉ ORO™** — https://www.lalcafebylallemand.com/en/products/lalcafe-oro/ (LEÍDO: texto completo)
- "*Saccharomyces cerevisiae*"; húmedo y natural; "validated by CIRAD" (centro de investigación francés — validación independiente citada por el fabricante, no un dato de un paper que se haya podido verificar aparte).
- "tolerate temperatures as low as 10°C".
- Único dato cuantitativo de calidad: "coffee inoculated with LALCAFÉ ORO™ gained over 2.5% in score, whereas the control sample showed a decline in quality" en catas a través del tiempo de almacenamiento — sin especificar la escala de puntaje, el n, ni el tiempo exacto. **Cifra citada por el fabricante sin metodología visible en la página pública** — no se puede verificar de forma independiente con lo que hay en esta página.
- Vida útil: 4 años.

**LALCAFÉ INTENSO™** — https://www.lalcafebylallemand.com/en/products/lalcafe-intenso/ (LEÍDO: texto completo)
- "*Saccharomyces cerevisiae*"; natural y despulpado; "selected by CIRAD and was awarded BEST NEW PRODUCTS SCA 2018" (premio de la Specialty Coffee Association, citado por el fabricante).
- Ningún dato de temperatura mínima/máxima en esta página (a diferencia de CIMA, ORO, LDP, BSC).
- Sinergia declarada: "works well in synergy with our selected coffee bacteria" (es decir, con BACTI-FRESH) "for an enhanced acidic balance" — sin cifra.
- Vida útil: 3 años.

**LALCAFÉ LDP™** — https://www.lalcafebylallemand.com/en/products/lalcafe-ldp/ (LEÍDO: texto completo)
- "*Saccharomyces cerevisiae*... developed for dry/natural processing" — único producto de la gama con foco explícito en Robusta fina ("Fine Robusta coffee varieties") y proceso natural.
- "continues to perform well even with cherry maturity levels as low as 60%".
- "tolerate temperatures as low as 10 °C".
- Único dato de duración fuera de la FAQ general: "For winey notes, you can extend the fermentation to over 84 hours" — es decir, el fabricante ata un descriptor sensorial concreto (notas "vinosas") a una duración mínima explícita, más allá de la ventana general de 36-96 h.
- Vida útil: 4 años.

**LALCAFÉ INICIO™** — https://www.lalcafebylallemand.com/en/products/lalcafe-inicio/ (LEÍDO: texto completo)
- "*Saccharomyces cerevisiae*... to ensure a fast and reliable start of coffee fermentation"; Arábica y Robusta, todos los procesos.
- Sin dato de temperatura mínima en esta página (a diferencia de CIMA/ORO/LDP/BSC).
- Validación de campo citada por variedad y país: "Castillo in Colombia and S795 Arabica and Peradenya Robusta in India" — el fabricante nombra los cultivares y países de sus propias pruebas, lo cual es más trazable que un promedio genérico, aunque sigue siendo el fabricante afirmando sobre sí mismo.
- Vida útil: 4 años.

**LALCAFÉ BSC™** — https://www.lalcafebylallemand.com/en/products/lalcafe-bsc/ (LEÍDO: texto completo)
- "*Saccharomyces cerevisiae*"; Arábica y Robusta; natural y despulpado; "gives good and consistent quality of classic coffee in dry and wet process" — se presenta como el producto "clásico", de menor intervención sensorial ("does not strongly modify the flavour").
- "tolerate temperatures as low as 10°C"; tolera hasta 60% de variabilidad de madurez.
- La página tiene un acordeón de FAQ propio con la pregunta "What fermentation duration is recommended with LALCAFÉ BSC™?" pero **la respuesta no se pudo extraer** — es contenido colapsado que la lectura automática no capturó de forma fiable (se intentó expandir el acordeón; sólo se pudo confirmar una de las cuatro respuestas, sobre perfil sensorial, no sobre duración). Se marca como **NO LEÍDO** ese dato puntual, en vez de asumir que es igual a la ventana general de 36-96 h.
- Vida útil: 4 años.

**LALCAFÉ BRIOSA™** — https://www.lalcafebylallemand.com/en/products/lalcafe-briosa/ (LEÍDO: texto completo)
- "*Saccharomyces cerevisiae*"; natural y despulpado; foco en "faster demucilagination, enabling an earlier onset of fermentation" y mejora de vida útil del café verde en bodega/transporte.
- Sin dato de temperatura mínima en esta página.
- Sinergia declarada con las bacterias LalCafé (mismo patrón que INTENSO).
- Vida útil: 4 años.

**LALCAFÉ BACTI-FRESH™** (bacteria, no levadura) — https://www.lalcafebylallemand.com/en/products/lalcafe-bacti-fresh/ (LEÍDO: texto completo)
- "**freeze-dried strain of *Lactobacillus helveticus***" — "the first commercial selected bacteria for coffee post harvest processing".
- Efecto declarado: "lowering pH, improving control, and enhancing fresh, clean acidity"; "High lactic acid production"; "Improved depectinization".
- Uso solo o co-inoculado con INTENSO u ORO.
- Aplicable a "whole fruit or depulped coffee, in either submerged or dry protocols".
- **Almacenamiento distinto al resto de la gama** (viene congelado, no seco a temperatura ambiente): "Shelf life of 36 months: stored at -18°C (0°F)"; "Shelf life of 18 months: stored at 4°C (40°F)"; "Tolerant to 3-week exposure to ambient temperatures (<25°C/77°F)".
- **pH/°Bx cuantitativo**: la ficha dice cualitativamente que baja el pH y sube el ácido láctico, pero **no da un valor objetivo de pH de llegada ni una tasa** — NO DICE la cifra, aunque SÍ afirma la dirección del efecto.

---

## 3. Otros proveedores buscados — resultado

- **AEB** (aeb-group.com): tiene líneas de levaduras para cerveza, vino y
  destilados. **No se encontró ningún producto ni ficha pública para
  fermentación de café.** No encontrado.
- **Enartis** (enartis.com): catálogo de levaduras enológicas (EnartisFerm) y
  de destilados. **No se encontró ningún producto de café.** No encontrado.
- **Angel Yeast** (en.angelyeast.com): tiene productos de extracto de levadura
  usados como *saborizante* en café instantáneo (p. ej. "Hou-feel YE KA327")
  y enzima β-mananasa para reducir viscosidad de extractos de café — **esto no
  es un cultivo fermentador de cereza/mucílago**, es un aditivo de sabor para
  la industria de café soluble/instantáneo. No es comparable a SafCoffee o
  LalCafé y no se fuerza la comparación. No se encontró cultivo de
  fermentación de cereza de Angel Yeast.
- **Chr. Hansen / Novonesis** (novonesis.com): sí tiene una página de
  marketing dedicada, "Biosolutions for coffee"
  (https://www.novonesis.com/en/biosolutions/food-and-beverages/beverages/coffee,
  LEÍDO: texto completo), que afirma que sus soluciones "naturally increase
  fruitiness and acidity quality in coffee" durante la fermentación de cereza y
  mejoran rendimiento en café soluble. **No da nombre de producto público,
  especie/cepa, dosis, temperatura, duración ni pH/°Bx** — toda la
  documentación técnica está detrás de un formulario de contacto o el portal
  "MyNovonesis". Se cuenta como fuente de fabricante existente pero **sin
  ficha técnica pública** — NO DICE, por falta de acceso, no por ausencia de
  producto.

---

## 4. Contraste directo con la tabla de parámetros del software (tema F)

El software usa, por perfil: pH óptimo, pH crítico, pH de disparo, horas de
gracia (pH), caída de Brix para terminar, piso de Brix, ventana de
estancamiento de Brix, ruido de Brix, gracia de subida de Brix.

**Veredicto para los nueve parámetros, evidencia de fabricante:**

| parámetro | veredicto | evidencia |
|---|---|---|
| pH óptimo por perfil | **NO DICE** | Ninguna ficha de Fermentis ni Lallemand (incluida la FAQ general, la más técnica del sitio) da un rango de pH objetivo. |
| pH crítico / pH disparo | **NO DICE** | Igual que arriba. BACTI-FRESH afirma cualitativamente que "baja el pH" pero sin cifra. |
| horas de gracia antes de "estancado" (pH) | **NO DICE, y no es comparable** | Los fabricantes no miden "estancamiento de pH"; dan una duración *total* recomendada (36-96h Lallemand; 24-168h Fermentis según temperatura) para lograr expresión sensorial, que es un concepto distinto al de una ventana de alarma por falta de cambio. |
| caída de % de Brix para terminar | **NO DICE** | Ninguna ficha menciona °Brix en ningún punto. |
| piso de Brix | **NO DICE** | Igual. |
| ventana de estancamiento / ruido / gracia de Brix | **NO DICE** | Igual — el concepto de "Brix" no aparece en ninguna de las 13 páginas leídas de Fermentis o Lallemand. |
| duración total de fermentación | **CONTEXTO, no un parámetro de la tabla, pero relevante** | Fermentis: 24h (Cool Blue, <18°C) a 7 días según temperatura; 60h típico 15-25°C con Deep Amber/Sunrise Orange/Green Origins, reducible a 24-48h sobre 25°C. Lallemand: 36-96h (natural), 36-48h (despulpado húmedo), con un caso documentado (LDP) de extender a >84h para notas vinosas. Estas ventanas **se solapan** con las "horas de gracia" del software (6-24h) sólo como orden de magnitud, no como el mismo concepto: el software mide *cuánto tiempo sin cambio de pH/Brix antes de alarmar*, el fabricante mide *cuánto tiempo total fermentar para lograr aroma*. |
| temperatura de fermentación | fuera de la tabla del brief, pero **RESPALDA la variabilidad por perfil** | Los rangos de temperatura de cada cepa (Cool Blue 8-18°C; resto 18-30°C; CIMA/ORO/LDP/BSC toleran hasta 10°C) confirman que la cepa usada cambia la ventana operativa — consistente con que el software tenga perfiles distintos, aunque el criterio que usa (pH/Brix) no es el que el fabricante reporta. |

**Conclusión de esta sección**: ninguna ficha técnica de fabricante —de los
cuatro fabricantes con presencia pública real en café (Fermentis, Lallemand;
Novonesis sin ficha accesible)— respalda ni contradice los umbrales de pH o
Brix que usa hoy el software, porque **ningún fabricante mide o publica esos
umbrales**. Lo que sí dan, con cifra y cita textual, es dosis (1 g/kg estándar,
2 g/kg para Deep Amber), protocolo de rehidratación (10x agua, 15-35°C salvo
Cool Blue a 10-25°C, reposo 15-30 min), rango de temperatura de fermentación
por cepa, y una duración total recomendada — que **no es** el parámetro
"horas de gracia antes de estancado" del software, aunque se solape en orden
de magnitud. Los umbrales de pH/Brix del software, si se quieren validar,
tendrán que respaldarse con estudios independientes (temas fuera de este
documento), no con las fichas de fabricante: aquí la respuesta honesta es
**la ficha no lo dice**, para las nueve filas de la tabla.

---

## Resumen de fuentes (para el conteo del encargo común)

13 páginas de fabricante leídas de texto completo (4 Fermentis SafCoffee + 2
Fermentis SafŒno usadas para la verificación MP72/HDA54 + 1 índice Fermentis +
8 Lallemand LalCafé + 1 FAQ Lallemand + 1 índice de productos Lallemand +
1 Novonesis). Ninguna es literatura científica independiente — todas son
`clase: especificación del fabricante`, por diseño de este tema (F). Dos
fabricantes buscados (AEB, Enartis) y uno (Angel Yeast) no tienen producto
aplicable — no encontrado, no inventado.
