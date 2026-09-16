# Fuentes de Cerro Azul / Las Nubes — índice y hechos operativos

Este archivo es el **mapa** de los documentos `FUENTE_*` de esta carpeta: qué es
cada uno, qué hecho operativo vive en cuál, y —lo más importante— **qué sabe el
dueño que ningún documento recoge todavía**.

No es un documento de arquitectura y no decide nada. Es la referencia que
permite responder «¿de dónde salió este número?» sin volver a preguntárselo a
Daniel.

> **Por qué existe.** El 2026-09-16 Daniel pidió que la investigación preparada
> sobre Cerro Azul no se perdiera. Medido ese día, las cadenas **`Noria mix`**,
> **`Inversiones Melissa`**, **`lejía`** y **`cal agrícola`** salían **cero
> veces** en todo el repositorio, con control positivo —`Finca Rosina` salía en
> 49 archivos y `biochar` en 51, así que la búsqueda miraba bien—. Los cuatro
> documentos vivían únicamente en `~/Downloads`, sin versionar.

---

## 1. Los cuatro documentos

| archivo | qué es | fecha | idioma |
|---|---|---|---|
| `FUENTE_CERRO_AZUL_MINUTA_2026-07-18.md` | Sesión de trabajo en Las Nubes — Sherry, Bob, Danny, Nathy. **La única fuente escrita de la receta de la noria y del protocolo del retort.** | 18 jul 2026 | inglés |
| `FUENTE_CERRO_AZUL_MINUTA_2026-07-18_CHRIS_ES.md` | La misma reunión, en español, ampliada para Chris Huerbsch. Añade la sección «Consideraciones — Chris Huerbsch» y sus tareas, que **no están** en la inglesa. | 18 jul 2026 | español |
| `FUENTE_CERRO_AZUL_MINUTA_EJECUTIVA_2026-08-06.md` | **Otra reunión**, no una versión de la anterior: 2ª ejecutiva mensual, Chris Huerbsch y Danny. | 6 ago 2026 | español |
| `FUENTE_LAS_NUBES_MARCO_SUELO_AMBIENTE_TAZA_v1.0.md` | Marco de investigación suelo → ambiente → taza, 13.345 palabras. **Es el documento que `docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md` manda «leer primero» y que no estaba en el repositorio.** | v1.0, 2026 | inglés |

---

## 2. La cadena del biochar, tal como la describen las fuentes

El vocabulario importa porque el esquema lo confunde (ver §4):

```
leña caída  →  RETORT (el horno)  →  carbón seco
                                        ↓
                    NORIA (la piscina de activación)
                    + agua + hoja triturada + gallinaza fermentada
                                        ↓
                                 biochar ACTIVO
                                        ↓
                        cubetas de 5 galones  →  plantas
```

**El retort es el horno; la noria es la piscina donde el carbón se vuelve
biochar activo.** Son dos pasos separados **en el tiempo**, no dos nombres de
lo mismo: la minuta del 6 de agosto dice «ya se cuenta con carbón seco, pero
falta que Bob prepare la mezcla de la noria».

### 2.1 El retort — producción por quema

De la minuta del 18 de julio, §«Biochar»:

| paso | tiempo | gente |
|---|---|---|
| recoger leña caída | 1 día | 3 peones + pickup |
| partirla | 1 día | 3 peones |
| cargar | 2 h | — |
| quemar | 15 min para prender, 20 h de quema y enfriado | — |
| palear a un barril de 55 gal, en caliente | — | 2 peones |
| enfriar afuera | 24 h | — |
| embolsar | 1 h | 2 peones |

**Cadencia: un batch nuevo cada 3 días.**

### 2.2 La noria — receta de activación

De la misma minuta, §«Gallinaza & Noria (Compost)», citada literalmente:

> «fill with water to 24cm (1 hr, 2 peones), add 30 sacks gallinaza + 30 sacks
> shredded leaf (by volume), cover with a lona for 5–6 days, then add 20 sacks
> shredded biochar and let it sit 2–3 more days. Each batch yields around
> 150 x 5-gallon buckets (filled about 3/4 full, ~4 gallons each), enough for
> 150 plants.»

| | |
|---|---|
| agua | hasta **24 cm** (1 h, 2 peones) |
| gallinaza | **30 sacos** (por volumen) |
| hoja triturada | **30 sacos** (por volumen) |
| tapado | lona, **5–6 días** |
| biochar triturado | **20 sacos**, se añade DESPUÉS del tapado |
| reposo final | **2–3 días** |
| rinde | **~150 cubetas** de 5 gal, llenas a ~3/4 (~4 gal) |
| alcanza para | **150 plantas** |

**La unidad de entrada es el saco, por volumen. La de salida es la cubeta de 5
galones.** Y la dosis se deriva de las dos últimas filas —150 cubetas para 150
plantas ⇒ **una cubeta por planta**—: eso es aritmética sobre la fuente, no una
cita, y conviene confirmarlo con el dueño antes de convertirlo en un valor por
omisión.

### 2.3 Los insumos de la noria

| insumo | dato | fuente |
|---|---|---|
| gallinaza | se compra **2 veces al año**, **300 sacos de 100 lb**, **$400 USD**, **añejada un año** para bajar la acidez | minuta 18 jul |
| hoja | se recoge y tritura durante todo el verano; **1 peón tritura 30 bolsas en un día** | minuta 18 jul |

### 2.4 Cómo se aplica al cultivo

> «Applied below the plants and again from about half a meter above — plants are
> 2m apart so biochar sits between rows. Smaller plantones may get extra
> applications this year, and all new plantones get it too.»

Debajo de la planta y otra vez desde ~**0,5 m arriba**; con las plantas a **2 m**,
el biochar queda **entre hileras**. Los plantones pequeños pueden llevar
aplicaciones extra; **todos los plantones nuevos lo llevan**.

---

## 3. Lo demás que estas fuentes contienen y el repositorio no tenía

Se listan porque son hechos operativos citables, no porque haya que construirlos.

- **Ceniza es otro producto del retort, distinto del carbón.** La fertilización
  de suelo es «gallinaza + **ceniza** (from the biochar oven) + hoja triturada»,
  después de cosecha con las primeras lluvias, justo antes de floración. Y el
  foliar sale de la ceniza: **1 parte ceniza : 2 partes agua, 7 días en reposo
  → lejía**; luego **1 L de lejía + 10 L de agua + 8 ml de melaza por litro**.
  Dos aplicaciones al año.
- **Huecos:** se desinfectan **un mes antes** de sembrar; **cal agrícola
  preferida, ceniza de respaldo**, forrando fondo y paredes. A **60 huecos/día
  con 2 peones**, 6.000 huecos son ~4 meses; a **100/día con 4 peones**, ~2 meses.
- **Semilleros:** sólo Catuaí por ahora, **3 semilleros escalonados oct/nov/dic**;
  semilla a plantón **6–9 meses**; **5.000–6.000 semillas**. Las plantas madre
  deben tener **7 años**, en su plenitud.
- **Los dos apiarios de Las Nubes**, ambos bajo gestión de Danny: **Apiario 1**,
  10 colmenas en el camino viejo al río, lado Huerbsch, a distancia segura del
  ojo de agua; **Apiario 2**, las **2 colmenas vacías** existentes en la cerca
  junto al camino que linda con la propiedad Grajales, dejadas para que entre un
  enjambre silvestre.
- **600 plantones de Caturra de Cafelino**, 6 meses, **$0,50 cada uno** = $300 +
  $350 de transporte = **$650**, entregados el 8 de agosto de madrugada para que
  no recibieran sol (minuta del 6 de agosto).

---

## 4. Conflictos y huecos — señalados, no resueltos

**Estas cuatro cosas no se arreglan desde aquí.**

1. **Las dos versiones de la minuta del 18 de julio no coinciden en los años de
   cosecha.** La inglesa dice «harvesting **2029**–2033»; la española, revisada
   para Chris, dice «cosechando **2031**–2033». Misma reunión, mismo objetivo de
   20.000 plantones para 2030. No se elige una: lo resuelve Daniel.

2. **Las DOS norias no están en ningún documento.** Daniel dijo el 2026-09-16 que
   hay dos —«una de un tamaño, y otra doble»— y que el detalle estaba en las
   minutas. **No está.** Buscado «noria» en los cuatro documentos: **7
   ocurrencias, todas la receta o la tarea de Bob**, ninguna menciona dos norias
   ni sus tamaños; y el marco de investigación tiene **88 menciones de «biochar»
   y cero de «noria»**, así que la búsqueda discrimina. Queda anotado como
   **dicho del dueño, sin documento que lo respalde** — y con eso no se pueden
   declarar capacidades ni volúmenes.

3. **El esquema mete el retort y la noria en la misma fila.** `BiocharBatch`
   lleva a la vez el régimen térmico (`peakTemperatureC`, `burnDurationMinutes`,
   `cooling`, `quenchWaterSource`) y la activación (`chargingMaterial`,
   `chargingRatio`, `coComposted`, `chargingDurationDays`). En esta operación son
   **dos eventos separados en el tiempo** —hay carbón seco esperando a que se
   prepare la noria—, y una noria podría en principio recibir carbón de varias
   quemas. Es una pregunta de diseño abierta, no un defecto que se arregle solo.

4. **La aplicación al cultivo no existe en el esquema.** Un `BiocharBatch` se
   enlaza a `Asset` (fotos), `Measurement` (laboratorio) y `TreatmentBatch` (un
   tratamiento de protocolo de investigación, que apunta a un `Lot` o una
   `Location`). **Ninguna llega a plantones**, y Daniel dijo que una misma
   microparcela puede tener plantones con aplicaciones de batches distintos —
   lo que obliga a que la aplicación sea **fila propia**, no columna.

---

## 5. Regla de uso

Los cuatro `FUENTE_*` son **registros y no se editan**. Una corrección va como
nota del dueño, fechada, al final del archivo correspondiente — igual que la
regla del beneficio: cuando una decisión suya contradiga un documento, manda él
y se anota en el documento.

Y lo que no está en ninguno de los cuatro **no se cita como si estuviera**. La §4
existe para eso.
