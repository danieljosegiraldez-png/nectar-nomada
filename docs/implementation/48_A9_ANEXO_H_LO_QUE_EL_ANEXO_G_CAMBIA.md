# A9 · Anexo H — Lo que el Anexo G cambia del informe

> **Nota de integración (2026-09-13).** Este documento llegó del paquete `A9-paquete`
> numerado como **Anexo E**, y esa letra ya estaba ocupada en el repositorio por
> *«Pantallas y formularios de captura»*, fusionado en el PR #296. Se renumeró a
> **G** —y su compañero de *«lo que cambia»* a **H**— por decisión de Daniel: el que
> ya estaba fusionado y citado conserva su letra. **No se reescribió una sola línea
> de su contenido**; sólo las referencias cruzadas entre estos dos.

> **Por qué existe este anexo.** El informe
> `48_A9_CAPTURA_DE_CAMPO_REPORTE.md` se cerró el **2026-09-07 a las 05:01**. El
> Anexo G —investigación de mercado y regulatoria— se escribió el **2026-09-10 a
> las 17:18**. El informe no lo vio. Este anexo recorre qué de esa
> investigación toca lo ya decidido, y contesta la decisión nueva que abrió.
>
> **Qué es y qué no es.** Entrada verificable, no veredicto. Los veredictos de
> ese informe se ganaron leyendo el repositorio; este anexo sólo aporta lo que
> estaba fuera del repositorio. **Donde el informe tenga mejor respuesta, gana
> el informe** — y en §4 ya pasa una vez.

---

## 1. D11 — Captura de calificación de fuerza

**Veredicto propuesto: sí, pero no es un módulo. Son dos columnas en el
compromiso de polinización y un tipo de evento. Y no se construye el reporte de
disputa hasta que exista un número acordado con el cliente.**

### El argumento a favor, con su peso real

El Anexo G §4.2 documenta que **ningún producto del mercado captura la
calificación de fuerza como instrumento de contrato**, y que la única empresa
que lo atacó —The Bee Corp / Verifli, conteo de abejas por imagen infrarroja,
ocho años, financiamiento NSF, pilotos con Syngenta— **se disolvió en 2024 y
donó la tecnología al USDA**. Lo atacaron con hardware. El camino de software
puro nunca se intentó.

En almendra el flujo es maduro y ajeno al software: promedio de 8 cuadros,
mínimo de 5, inspectores de condado contratados **por el productor** sobre 10%
de las colmenas al azar, reporte a las dos partes, bonos de ~$5 por cuadro
sobre lo contratado.

**En Toabré no hay inspector de condado.** Eso no debilita el registro del
apicultor: lo convierte en la única evidencia que existe. Es la misma lógica que
ya justifica el reporte de visita en D7.

### El argumento en contra, que es el que decide la forma

**Para café no existe estándar de cuadros publicado.** El número lo fija el
contrato, no la industria. Construir un formulario de calificación antes de que
exista un número acordado es construir un formulario sin criterio — y un
formulario sin criterio produce exactamente la basura con forma de dato que §5.1
del prompt prohíbe.

### La forma que resuelve las dos cosas

No es un módulo de calificación. Es:

1. **Dos columnas en el compromiso de polinización** (A9.9):
   `minimum_strength_guaranteed` + `strength_unit` (cuadros de abeja, u otra
   unidad si el contrato dice otra cosa). Si el contrato no declara un mínimo,
   las columnas quedan nulas y **la calificación no se ofrece en pantalla**. El
   criterio lo aporta el contrato o no hay pantalla.
2. **Un tipo de `FieldEvent`** —la tabla que A9.1 ya va a extender— con
   `frames_of_bees`, ligado a la colmena y a la visita. No necesita entidad
   propia: es una medición fechada con operador, que es exactamente lo que
   `FieldEvent` es.
3. **El muestreo, declarado**: qué porcentaje de colmenas se calificó y cómo se
   eligieron. Sin eso el promedio no significa nada, y es el campo que las
   herramientas del mercado no tienen porque no llegan hasta aquí.
4. **El promedio, calculado** contra el mínimo del contrato, con las colmenas
   bajo el piso marcadas. Derivado, nunca tecleado — misma disciplina que el
   porcentaje de origen de §5.2 del Anexo G.

**Lo que NO se construye ahora:** el reporte de disputa firmado por las dos
partes, y el cálculo de bono por cuadro. Ambos suponen un acuerdo comercial que
todavía no existe.

**Consecuencia si me equivoco.** Si Kiva nunca quiere discutir en cuadros de
abeja, se construyeron dos columnas nulas y un tipo de evento que nadie usa —
coste bajo y reversible. Si sí quiere y no está construido, la temporada de
floración pasa sin cifra y la conversación vuelve a ser una impresión, que es
donde está hoy. **Asimetría clara a favor de construirlo**, siempre que el
disparador sea el contrato y no la pantalla.

**Dónde va:** con A9.9, en A10. Son la misma conversación comercial.

---

## 2. A9.9 — Qué copiar del mercado, y qué no

El informe despachó el compromiso de polinización como «cinco columnas y una
división». Sigue siendo cierto. Lo que el Anexo G aporta es **de dónde sacar las
cinco sin inventarlas**: Nectar publicó la mitad logística y PollenOps la otra
mitad contractual (§4.1).

**Copiar** — aparece en producto real y el trabajo con Kiva lo necesita:

| Campo | De dónde | Por qué |
|---|---|---|
| cultivo | Nectar | Robusta no es lo mismo que arábica para densidad |
| lote/bloque de destino | Nectar | Lote 1 y Lote 2 son sitios distintos con hectáreas distintas |
| hectáreas comprometidas | — | El denominador |
| densidad objetivo por hectárea | — | 4–6 colmenas/ha. El numerador sale de la visita |
| ventana de entrada y de retiro | Nectar + PollenOps | Fechas de colocación, no del contrato |
| precio por colmena o por servicio | Nectar | Ordenable por precio; es lo que vuelve comparable un cliente contra otro |
| mínimo de fuerza garantizado | PollenOps | §1 de este anexo |

**No copiar todavía**, con su razón:

- **Códigos de portón e indicaciones a cada bloque** (Nectar). Tiene sentido con
  cientos de sitios y cuadrillas que no conocen la finca. Con dos lotes en un
  predio es ruido.
- **Facturación y cobro** (PollenOps). Es un módulo comercial completo y el
  repositorio ya tiene `Order`/`Payment` para otra cosa. Meterlo aquí es abrir
  una frontera que nadie pidió.
- **Portal del productor** (PollenOps). D7 ya resolvió la entrega con enlace
  firmado y caducidad. Un portal es la versión cara de lo mismo.
- **Mortalidad desglosada por finca y cultivo** (Nectar). Es una consulta, no un
  campo — sale sola de la visita más el compromiso. Vale la pena **como
  reporte**, no como esquema.

---

## 3. A9.4 — Los campos que son ley, y la conducta que los usa

El informe ya quiere sacar `Inspection.pestDiseaseFlags` de `String?` a algo
contable. Es el instinto correcto; el Anexo G §5.1 aporta el resto, y aporta
algo que el catálogo no tenía: **cuáles están exigidos por norma y por cuál.**

### Tratamiento — campos faltantes

`substancia_activa` · `numero_de_registro_sanitario` ·
`fecha_de_caducidad_del_producto` · `cantidad_total_usada` ·
`alzas_puestas_al_momento` (bool) · `veterinario_prescriptor` + `receta` ·
`evidencia_de_compra` · `foto_de_etiqueta_o_troquel` ·
`disposicion_del_sobrante` · **`fin_de_carencia` calculado**.

Instrumentos: Reglamento (CE) 852/2004 Anexo I A III §8; Reglamento (UE) 2019/6
art. 108 (conservación **5 años**, período de supresión **«aunque sea cero»**);
México NOM-064-ZOO-2000 (dosis, período de retiro, caducidad del medicamento);
Argentina SENASA — **conservar los troqueles físicos 2 años**, que es de dónde
sale `foto_de_etiqueta_o_troquel`.

### La conducta: bloqueo de cosecha por carencia

`fin_de_carencia` no es un campo de archivo. Es la fecha que **bloquea o
advierte** al registrar una cosecha de esa colmena. Cuatro jurisdicciones lo
exigen implícitamente y **en papel nadie lo hace bien**, que es exactamente el
argumento de adopción del Anexo G §5.1.

Nota de diseño que el Anexo G deja clavada: **los períodos de carencia no se
calculan, se consultan.** Van por etiqueta de producto y por jurisdicción. Es un
dato que el sistema guarda por producto, no una constante.

### Varroa — estructura, no texto

`metodo` (alcohol / azúcar / bandeja / otro) · `abejas_muestreadas` ·
`acaros_contados` · `acaros_por_100_abejas` derivado · `umbral_superado`.

**Sin el método el resultado no es comparable**, y es el único dato del apiario
con umbral de decisión reconocido. IDIAP nombra la varroa como causa principal
de pérdidas en Panamá.

### Lo que se nombra y se aplaza

**El segundo registro de medicamentos** (patrón chileno RAMEX: ingreso de
inventario aparte del uso, para reconciliar comprado contra aplicado). Es
correcto y es exigido en Chile, pero **aquí no hay módulo de compras** al que
engancharlo, y sin él el ingreso sería tecleo redundante. **Aplazado, con su
consecuencia:** no se podrá detectar un desvío entre lo comprado y lo aplicado
— que es el fraude que ese registro existe para atrapar, y que en una operación
de una persona no es el riesgo principal.

---

## 4. D9 — El informe tiene razón y mi objeción no aguanta

Sugerí que el Anexo G §6.4 daba una salida barata a «temporada»: una báscula
centinela calibra el calendario de floración de ese paisaje sola, porque la
señal de apiario **sí transfiere entre colmenas** mientras la de colonia no.

**Eso no toca el argumento del informe.** El informe no aplazó el calendario por
falta de un mecanismo para obtenerlo. Lo aplazó porque **los tres umbrales
críticos no son estacionales** —se calculan contra `nextVisitDueAt` y
`coverageUntil`, que son declaraciones de una persona que sabe en qué mes está—
y porque encontró que dos reglas del Anexo C son redundantes entre sí, y que la
buena es la que no necesita calendario. Ese hallazgo es correcto y la báscula no
lo altera.

Peor para mi objeción: si alguna vez se instala la báscula, **mide el flujo
directamente**, así que sustituye al calendario declarado para ese sitio en vez
de alimentarlo. Eso **refuerza** el aplazamiento, no lo debilita.

Queda una sola cosa en pie del Anexo G sobre este punto, y es menor: la
distinción que el propio informe ya deja clavada —calendario declarado predice,
`SpecimenObservation` con `bloom_*` registra— tiene ahora un tercer término, la
**medición**. Tres cosas distintas, no dos. No cambia ningún ticket.

---

## 5. Lo que cambia del camino crítico

**Nada.** A9.0 a A9.6 quedan como están. El Anexo G toca sólo lo paralelo:

- **A9.4** gana los campos de §3 y la conducta de bloqueo por carencia. Crece,
  no se mueve.
- **A9.9** gana la lista de §2 y las dos columnas de §1. Sigue siendo pequeño.
- **Un tipo de `FieldEvent` nuevo** para la calificación de fuerza, si D11 se
  acepta. No es ticket propio: cabe en A9.9.
- **A9.7 (QR por colmena)** se confirma desde fuera: el Anexo G §3 lo lista como
  table stakes, presente en Nectar —donde el escaneo **es** el acto de captura—,
  MyApiary, Apiary Book y Apiarist. El informe ya lo puso sin dependencias.

---

## 6. Lo que queda fuera de A9 y tiene fecha

**La cadena de la miel, no la del apiario.** La Directiva (UE) 2024/1438 exige
listar países de origen con su porcentaje, con tolerancia del 5% **«basada en
los registros de trazabilidad del operador»**, y es **aplicable desde el 14 de
junio de 2026**. El acto delegado sobre trazabilidad de la Unión con **código
identificador único** vence el **14 de junio de 2029**; los métodos armonizados
de detección de adulteración, el **14 de junio de 2028**.

La regla de diseño: **el porcentaje por origen es una propiedad calculada del
linaje de cosecha del lote, no un número tecleado.** Es la misma maquinaria de
linaje que el café ya tiene, aplicada a `ApiaryHarvestEvent → Lot`.

**Por qué no entra aquí:** A9 es captura de campo. Esto es etiquetado y lote, y
pertenece a la cadena cosecha → lote → sensorial → producto, que hoy se detiene
en `Lot`. **Merece su propio alcance con su propia fecha**, y la fecha ya está
puesta por alguien más.

**Y la advertencia correspondiente:** Panamá **no aparece** en las listas de
terceros países autorizados para exportar miel a la UE que se pudieron
recuperar. La vía realista es Estados Unidos vía FSVP, donde la exigencia es
contractual del importador y no reglamentaria. Nada de esto bloquea A9.

---

## 7. Sensores — decisión de compra, no ticket

No toca el esquema y no entra en ningún alcance. Se resume para que no vuelva a
discutirse desde cero:

**Una báscula, en el apiario más lejano**, y sólo después de confirmar que algo
engancha a una red en el campo panameño — **LTE-M está ausente de la cobertura
de Panamá**, LoRaWAN público tiene **cero gateways en el país**, y 2G se está
apagando en la región. A $62 el viaje, evitar 10 viajes al año paga los ~$600
del primer año.

Y el hallazgo que aplica directo a lo que pasó el 2 de septiembre: **el
ausentamiento es un fenómeno tropical que ningún algoritmo comercial tiene en su
entrenamiento**. Su firma de peso no es la de una enjambrazón. Cualquier
«detección de enjambrazón» que se compre lo va a clasificar mal.

---

## 8. Resumen

| | Qué | Veredicto |
|---|---|---|
| **D11** | Calificación de fuerza | **Sí**, como dos columnas en A9.9 más un tipo de `FieldEvent`. Sin reporte de disputa hasta que haya número acordado |
| **A9.9** | Compromiso de polinización | Siete campos, de producto real. Facturación, portal y códigos de portón: no |
| **A9.4** | Tratamiento y varroa | Diez campos exigidos por norma, más el **bloqueo de cosecha por carencia**. Segundo registro de medicamentos: aplazado y nombrado |
| **D9** | Temporada | **El informe tenía razón.** Mi objeción no toca su argumento y la báscula lo refuerza |
| **Camino crítico** | A9.0–A9.6 | **Sin cambios** |
| **Fuera de alcance** | Porcentaje de origen en el lote de miel | Su propio alcance. Fechas: 2026 vigente, 2028 y 2029 por delante |
