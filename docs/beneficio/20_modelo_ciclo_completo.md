# 20 — Modelo del Ciclo Completo: Identidad, Genealogía y Etapas Posteriores
**Estado:** Normativo · **Versión:** 1.0 · **Extiende:** `01_lot_lifecycle.md`
**Depende de:** `00_conventions.md`, `03_public_api.md`

Las especificaciones 10–13 cubren de la recepción al reposo. Este documento define lo que viene después —muestreo, tueste, cupping, valorización, reporting— y, sobre todo, **la identidad del lote a través de divisiones y fusiones**, que es lo que hace que todo lo anterior signifique algo.

---

## 1. Genealogía del lote

Un lote no es una fila: es un **nodo en un grafo dirigido acíclico**. Modelarlo como fila con un `parent_id` opcional colapsa en cuanto ocurre la primera fusión, que es el segundo día de cosecha.

```python
@dataclass(frozen=True)
class LotLineageEvent:
    event_id: str
    event_type: LineageType          # SPLIT | MERGE | SAMPLE_DRAW
    occurred_at: datetime
    operator_id: str
    parents: dict[str, float]        # lot_id -> kg aportados
    children: dict[str, float]       # lot_id -> kg resultantes
    loss_kg: float
    reason: str                      # obligatorio, texto libre del operador
    designed_experiment: bool        # True si la división es un ensayo A/B
```

### 1.1 Invariantes de conservación

- **División:** `Σ hijos + loss_kg = masa del padre al momento del evento`, con la tolerancia relativa de `BalancePolicy`. La masa del padre **al momento del evento**, no la de recepción: entre medio hubo despulpado, pérdida de mucílago y secado.
- **Fusión:** `Σ padres = Σ hijos + loss_kg`, misma tolerancia.
- Un lote que ya fue dividido **queda cerrado**: no admite lecturas nuevas. Todo registro posterior pertenece a un hijo. Permitir lecturas sobre un padre dividido produce series que describen café que ya no existe como unidad.
- La masa disponible de un lote nunca es negativa. Una división que pide más de lo que hay es `SchemaError`, no una advertencia.

### 1.2 Herencia en la división

Un hijo hereda **todo lo aguas arriba** del evento: finca, variedad, altitud, fecha y lote de recolección, recolector, categoría de selección, y el historial completo de proceso hasta el instante de la división. No hereda nada aguas abajo: a partir de ahí cada hijo tiene su propia historia.

### 1.3 Fusión: la regla que casi siempre se implementa mal

Al fusionar, **todo atributo que no sea idéntico en todos los padres se convierte en `MIXED` y arrastra su composición**. Nunca se toma el valor del primer padre, ni el del padre mayoritario, ni el más reciente.

```python
variety = "Geisha"                      # los tres padres coinciden
process = Mixed({"LAVADO": 0.62, "CRYOBLOOM": 0.38})
harvest_date = Mixed({"2026-02-14": 0.62, "2026-02-16": 0.38})
```

Consecuencias obligatorias:

- Un lote `MIXED` en proceso **no puede declararse con el nombre de un proceso** en ninguna etiqueta, ficha o reporte. Es la vía más común por la que un sistema de trazabilidad empieza a mentir.
- **El puntaje de taza no se hereda en una fusión.** Nunca. La mezcla es un café distinto del que se catara; heredar el puntaje del padre mayoritario es fabricar un dato. Un lote fusionado entra a `PENDIENTE_DE_CATACIÓN`.
- La altitud fusionada se expresa como rango con composición, no como promedio ponderado presentado como un número único.

### 1.4 Divisiones de ensayo

Cuando `designed_experiment = True`, el evento registra además la **variable bajo estudio** y la **rama de control**. Sin esto, una comparación posterior entre hijos no distingue el efecto del tratamiento del efecto de haber estado en otro tanque.

Es el caso de uso central de los ensayos de CryoBloom y de levaduras silvestres: el valor del sistema está en poder comparar ramas, y eso exige que la división se declare como diseño desde el inicio, no que se reconstruya después.

---

## 2. Muestreo

Una muestra es un **hijo de tipo `SAMPLE`**: su masa sale del lote y se contabiliza. Una muestra que no descuenta masa es una fuga silenciosa en el balance, pequeña por evento y acumulativa a lo largo de una cosecha.

| Tipo | Destino | Regla |
| :--- | :--- | :--- |
| `PROCESS` | pH, °Bx | Se consume; masa descontada |
| `MOISTURE` | humedad, aw | Se consume |
| `ROAST` | tueste de muestra | Origen de un `RoastBatch` |
| `CUPPING` | catación | Debe provenir de un `RoastBatch` conforme |
| `RETENTION` | testigo sellado | **Obligatoria para todo lote que se venda** |

**Regla del testigo.** Sin muestra de retención sellada, fechada y almacenada, una reclamación de calidad posterior no se puede defender ni verificar. El sistema debe impedir marcar un lote como vendido sin testigo registrado, o dejar constancia explícita de su ausencia en la ficha.

**Congelación del estado.** Una muestra guarda una **instantánea** del estado del lote al momento de extraerla, no una referencia viva. Si el lote sigue secando, la muestra no cambia con él.

**Decisión de Daniel, 2026-09-18: una muestra de café verde sólo es válida si el lote ya terminó su proceso (cierre manual, uno o varios tratamientos) y llegó a almacenamiento** —secado y almacenamiento son dos fases secuenciales; el secado puede volver a una fase anterior (infusión/cofermentación) y reanudarse, pero sólo al llegar a la humedad óptima se pasa a almacenamiento—. **Bloquea, no avisa**, y sin permiso de anulación. No aplica a `PROCESS` (pH, °Bx), que se toma legítimamente a mitad de proceso. Diseño completo en `docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md`.

---

## 3. Tueste

### 3.1 Perfil

```python
@dataclass(frozen=True)
class RoastProfile:
    roast_id: str; sample_id: str; roaster_id: str
    green_mass_g: float
    green_moisture_pct: float        # obligatorio: el mismo perfil sobre
    green_density_g_l: Optional[float]  # verde a 9 % y a 12 % no es el mismo tueste
    charge_temp_c: float
    turning_point_c: float; turning_point_s: int
    first_crack_s: int; first_crack_temp_c: float
    drop_s: int; drop_temp_c: float
    roasted_mass_g: float
    color_measurement: Optional[ColorReading]   # escala + valor + instrumento
    rested_hours_at_cupping: Optional[float]
```

Derivados: merma `(green - roasted) / green`, tiempo de desarrollo `drop_s - first_crack_s`, **DTR** `desarrollo / drop_s`.

### 3.2 Verificación de plausibilidad

- Merma de un tueste de muestra: **12–18 %** `[PROVISIONAL]`. Fuera de rango es error de pesaje o tueste muy desviado, no una característica del café.
- `first_crack_s < drop_s < ` duración total; `turning_point_s < first_crack_s`. Violarlo es `SchemaError`.
- Merma y humedad del verde deben ser coherentes entre sí: café más húmedo pierde más masa.

### 3.3 Conformidad del tueste de muestra — regla crítica

Un tueste de muestra destinado a catación **debe declararse conforme o no conforme al estándar de preparación vigente (SCA-102)**, según su grado de tueste, duración y reposo.

**Un puntaje de taza obtenido sobre un tueste no conforme no es una medición comparable.** El sistema no debe impedirlo —a veces se cata lo que hay— pero debe marcarlo, y ese marcaje tiene que viajar con el puntaje hasta cualquier reporte, ficha comercial o cálculo de valorización que lo use. Un puntaje sin su condición de tueste es una cifra sin unidades.

Los parámetros numéricos exactos (grado de color, ventana de duración, reposo mínimo y máximo) **se toman del texto de SCA-102 y se citan en el código con su referencia**; no se transcriben de memoria ni de fuentes secundarias.

---

## 4. Catación

### 4.1 Estándar de referencia

La SCA adoptó la **Coffee Value Assessment (CVA)** —normas **SCA-102** (preparación y mecánica), **SCA-103** (evaluación descriptiva) y **SCA-104** (evaluación afectiva)— que **supersede el protocolo y formato de catación de 2004**. El modelo de datos se construye sobre la CVA.

La CVA separa cuatro evaluaciones que antes se mezclaban en un solo número: **física** (verde y color de tueste), **descriptiva** (intensidad de atributos, sin juicio de calidad), **afectiva** (impresión de calidad, en escala de 9 puntos) y **extrínseca** (finca, proceso, variedad, certificaciones).

Consecuencia de diseño: **descriptivo y afectivo se almacenan por separado y nunca se colapsan en un solo campo**. Es precisamente lo que la norma vino a corregir. Un modelo que guarda «notas de cata» y «puntaje» en una misma ficha reproduce el problema que la CVA resuelve.

La conversión de la evaluación afectiva a su equivalente en 100 puntos, la lista exacta de atributos y los parámetros de preparación (gramaje, proporción café:agua, temperatura, número de tazas, tiempos de costra) **se leen del texto normativo de SCA-102/103/104 y se citan**. La CVA sigue en refinamiento mediante el programa de adopción temprana, así que la versión de la norma aplicada se registra con cada catación.

### 4.2 Invariantes del registro

- **Un puntaje pertenece a un catador, no a un lote.** Se registra por catador; el valor de panel es un estadístico derivado, calculado y etiquetado como tal.
- **La dispersión del panel se conserva y se muestra.** Promediar tres catadores que dieron 84, 84 y 88 y reportar 85.3 borra justamente la información que importa: hubo desacuerdo.
- **Ciego o no ciego se registra siempre.** Una catación donde el catador conocía la identidad del lote es un objeto epistémico distinto de una ciega, y la diferencia debe viajar con el dato.
- Panel, código de muestra, orden de presentación y fecha forman parte del registro.
- Defectos y taints se registran aparte del puntaje, con incidencia por taza.
- La calibración del panel es análoga a la calibración de instrumentos (`02_calibration.md`): un panel sin calibración registrada produce datos de menor confianza, y eso se etiqueta.

### 4.3 Vínculo con el lote

Una catación apunta a una **muestra**, la muestra a un **tueste**, el tueste a un **lote en un estado**. La cadena completa debe reconstruirse desde cualquier puntaje. Un puntaje colgado directamente de un lote, sin muestra ni tueste intermedios, no es verificable.

---

## 5. Valorización

Es la etapa donde un error deja de ser un dato incorrecto y pasa a ser una afirmación comercial falsa.

### 5.1 Costo acumulado

El costo por kilogramo de café verde acumula todas las etapas: recolección, beneficio, secado, trilla, almacenamiento y **mermas**. Las mermas dominan: con una relación cereza:verde de 5.5–6.5 : 1, un error del 5 % en el rendimiento se propaga multiplicado a la base de costo.

El costo se calcula **sobre la genealogía**, no sobre el lote aislado: un lote fusionado hereda el costo ponderado de sus padres; uno dividido reparte el costo del padre en proporción a la masa.

### 5.2 Precio

Todo precio registrado declara su **naturaleza**:

| Naturaleza | Qué es |
| :--- | :--- |
| `TRANSACTED` | Se vendió a este precio. Hay documento. |
| `OFFERED` | Alguien ofreció esto. No se cerró. |
| `REFERENCE` | Referencia de mercado externa, con fuente y fecha |
| `MODELLED` | El sistema lo sugiere a partir de puntaje, volumen y costo |

**Un precio `MODELLED` no puede presentarse, exportarse ni imprimirse sin su etiqueta.** Es la regla más importante de este documento: el momento en que una sugerencia del sistema se convierte en «el precio del lote» es el momento en que la herramienta empieza a producir afirmaciones falsas sobre dinero real.

### 5.3 Lo que un modelo de precio debe exponer

Punto de equilibrio, margen, y **la participación del productor** en el precio final. Un sistema que calcula precios de exportación sin hacer visible qué fracción queda en la finca es una herramienta de intermediación disfrazada de herramienta de productor.

---

## 6. Reporting

- **Trazabilidad hasta la lectura.** Todo número de un reporte debe poder desarmarse hasta las lecturas que lo produjeron. Un número sin ese camino no se publica.
- **Procedencia visible.** Cada cifra se etiqueta como medida, derivada, estimada, declarada o supuesta (`21_rubrica_veracidad.md`).
- **Las salvedades viajan en la cara del reporte, no en un anexo.** Un reporte que incluye lotes con `DISCREPANCY_FLAGGED`, lecturas `UNCALIBRATED`, tueste no conforme o atributos `MIXED` lo dice donde se lee, no en una nota al pie.
- **Sin relleno.** Un reporte con huecos muestra huecos. Nunca completa con valores típicos, promedios de otros lotes ni estimaciones no marcadas.
