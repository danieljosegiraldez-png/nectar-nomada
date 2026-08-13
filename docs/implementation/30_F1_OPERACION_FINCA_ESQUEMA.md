# F1 — Operación de finca: esquema de atributos de lote, trabajo, microlotes y sectores

**Esquema únicamente. Sin pantallas.** Este ticket construye la estructura de
datos completa y deja las interfaces para tickets posteriores, siguiendo el
criterio que `DOMAIN_MODEL.md` §7 ya establece: especificar sin implementar es
el punto de modelar por adelantado.

Los datos se cargan por script mientras tanto. La razón es concreta: los
plantones tienen seis meses y no dan fruto hasta 2031, así que las
observaciones pueden ser manuales por ahora — pero la estructura tiene que
estar relacionada desde antes para que nada necesite rediseño después.

**Contexto:** `29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md` §3, §4,
§5 y §6. Leelo completo antes de empezar — este ticket implementa cuatro de
sus secciones y el razonamiento detrás de cada decisión está ahí.

**No implementar:** `RoastSession`, clasificación por defectos, Research OS,
mapa, agua, clima. Son brechas reales del mismo documento, fuera de alcance
aquí.

---

## 1. Atributos de lote — `Location`

Condiciones estables de una parcela, base de todo análisis de terroir
posterior. Agregar a `Location`, todos nulables (los lotes existentes no los
tienen):

- **Exposición solar** — valores fijos: sol pleno / mañana / tarde / ambas
- **Porcentaje de sombra** — tramos: 20 / 30 / 50 / 70 / 90
- **Rango de altitud** — `altitudeMinM` y `altitudeMaxM`, dos campos, no uno.
  A7 ya chocó con esto: Finca Las Nubes Jaramillo es 1300–1500 msnm y el
  campo actual acepta un solo valor. **El rango dentro de un lote es
  precisamente lo que justifica subdividirlo después** — Cerro Azul va de
  600 a 650 en un mismo lote.
- **Pendiente**
- **Tipo de suelo**
- **Distancia entre plantas**
- **`description`** — A7 reportó que `Location` no lo tiene, y por eso la
  edad del Catuaí y la ubicación exacta de los apiarios respecto al pozo y
  la cerca quedaron solo en comentarios del script de carga, sin lugar en la
  base. Texto libre.

**Regla que no debe romperse:** junto a los valores fijos tiene que haber
nota libre. Si Bob quiere anotar algo que no está en la lista, tiene que
caber sin perder la estructura de lo que sí está tipado.

**Precipitación NO va acá.** Es medición, no atributo — cambia a diario y
pertenece a `EnvironmentalObservation` (especificado, sin construir).
Congelarla como campo del lote sería registrar como estable algo que varía.

## 2. Microlotes

Un microlote es una subdivisión creada **retroactivamente**, cuando después de
varias cosechas se nota que la parte alta cata distinto que la baja.

Estructuralmente ya está soportado: `Location` con `parent_location_id`. Lo
que falta es la **razón de la subdivisión** — altitud, sombra, pendiente,
otro — como campo, para que quede registrado por qué existe ese microlote.

**Dos reglas derivadas explícitamente con el product owner, ambas
obligatorias:**

1. **Un batch cosechado antes de que existiera el microlote solo puede
   atribuirse al lote completo.** No se reasigna retroactivamente. El registro
   dice lo que se supo en su momento — misma disciplina de procedencia que
   rige todo lo demás.
2. **El sistema no detecta microlotes y no debe intentarlo.** Se evaluó y se
   descartó: detectar diferencias internas requeriría que ya estuvieran
   cosechadas por separado, lo cual implica que la subdivisión ya la hizo un
   humano. Es circular. La observación humana decide; el sistema registra la
   decisión.

Como mucho, el sistema puede señalar que un lote con rango de altitud amplio
es *candidato* a subdividirse — pero eso es aritmética sobre un dato cargado,
no detección.

## 3. Sectores — ambos mecanismos disponibles

Sin sector, cincuenta plantas del Lote 2 no se distinguen entre alta y baja, y
el muestreo estratificado pierde sentido.

**Construir los dos, ninguno obligatorio:**

- **Campo simple** — alto / medio / bajo. Sirve desde el primer día, sin
  preparación en campo.
- **Grid** — fila y posición. Más preciso, pero exige que las filas estén
  numeradas físicamente.

Un Specimen puede tener uno, el otro, los dos, o ninguno. La razón de que
ambos existan es que la finca va a evolucionar de aproximado a preciso, y no
tiene sentido esperar a que las filas estén numeradas para empezar a
registrar.

**Identificación por posición, no por GPS.** El dosel arruina la precisión —
problema que `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §6 ya tuvo que resolver
con fotos y proximidad.

## 4. Trabajo e insumos contra `Location` — la brecha más grande

`labourEntry` y `materialConsumptionEntry` (T12.6) registran trabajo contra un
`Lot` o una transformación. **En una sola sesión aparecieron cuatro hechos
reales que no son contra un batch:** 600 huecos cavándose, limpieza de tres
sitios de apiario por Kenis, 600 plantones de Caturra recibidos el 8 de agosto,
y la noria activada para fermentar biochar.

En palabras del product owner: *"lo que me importa saber es dónde está cada
set de huecos por lote, y qué plantones entraron acá."* **El trabajo se
registra contra el lugar donde ocurre.**

Alcance a cubrir:

- Preparación de terreno (huecos, socoleo, limpieza)
- Vivero y semillero
- **Siembra** — qué varietal, cuántos, en qué lote, cuándo
- **Recepción de material vegetal** — los 600 plantones, con origen
  (Organization) y fecha
- Insumos aplicados (nutrientes, biochar, cal, tratamientos)
- Producción de compost y biochar
- Mantenimiento

**Decisión de diseño a tomar y justificar:** ¿se extiende `labourEntry` y
`materialConsumptionEntry` con FKs nulables a `Location` y `Project` —
siguiendo el patrón de ADR-020 decisión 8 y sin tocar lo construido— o hace
falta una entidad propia de operación de finca? Recomendá una con razones
antes de implementar. La primera es aditiva y más barata; la segunda puede ser
más honesta si la semántica diverge de verdad.

**Un tratamiento a un lote entero y uno a plantas específicas deben poder
coexistir.** Sherry fumiga el Lote 2 completo; el product owner trata tres
plantas con roya. Ambos son válidos y no son el mismo registro.

**Costos deliberadamente fuera.** `20_CAPTURE_OR_LOSE_IT` fijó el criterio:
capturar hechos físicos, diferir lo monetario a v2. El pago a Kenis, los $650
de plantones, los $400 de gallinaza — se registran cuando exista el modelo de
economía operacional. **No agregues campos de dinero.**

## 5. Trampas de broca — punto de monitoreo con serie temporal

Resuelto con el product owner: **la trampa se modela como `Specimen`**, no
como equipo. Se asocia al lote, se ubica dentro de un sector (§3), y su
densidad se expresa en relación a una cantidad de plantas — *"a cierta
distancia entre tantos plantones"*.

Eso implica que `Specimen` deja de ser exclusivamente vegetal. Evaluá si
`species_id`/`cultivar_id` pueden quedar nulos para una trampa o si hace
falta un discriminador de tipo; recomendá antes de implementar.

**Lo que la hace valiosa no es la trampa, es la serie.** El conteo de
capturas a lo largo del tiempo es lo que dice **qué sectores están más
afectados y cuáles ya fueron tratados** — y eso conecta directamente con
sectores y microlotes: la misma subdivisión que se use para catar es donde
va a verse presión de plaga distinta.

Necesita registrar:

- Identidad y posición — lote, sector, y densidad respecto a plantones
- **Estado**: activa / retirada / reinstalada. En **repela** se recogen todas
  las cerezas del suelo y de la planta, así que la trampa deja de ser
  necesaria y se retira — es un ciclo real, no una baja definitiva.
- **Revisiones con conteo de captura y fecha.** Las minutas del 18 de julio
  dan los parámetros reales: 30 botellas en campo con espacio para 10–20 más,
  revisión cada dos semanas, mezcla de alcohol 50/50 comprada a David en
  Chiriquí, dos galones.

**Reuso probable:** una revisión de trampa es una observación fechada con un
valor — misma forma que `SpecimenObservation`
(`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §2), distinto sujeto. Evaluá si el
tipo de observación se extiende con algo como `trap_check` en vez de crear
una entidad paralela. No inventes un mecanismo nuevo si el existente sirve.

La densidad de trampas cambia según la presión de broca en el momento, así
que no es un atributo fijo del lote — es una decisión de manejo que varía en
el tiempo y debe poder cambiar sin reescribir historia.

## 6. Convenciones obligatorias

- **Procedencia por ADR-038** — `provenanceClass` requerido sin default,
  `sourceReference`, `dataQuality`, y campo de observador. Elegida en el
  action layer, nunca por default silencioso. Una siembra registrada el mismo
  día es `direct_observation`; una recordada semanas después no lo es.
- **FKs nulables por padre, nunca polimórficas** — ADR-020 decisión 8.
- **`assertDefinedWhere` en toda limpieza de tests** — ADR-045.
- **Cuidado con la base compartida.** Ahora hay datos reales de producción de
  A7 en Neon. Ningún test ni script puede tocarlos. Verificá antes y después.

## 7. Verificación

Sin pantallas, la verificación es por servicio y por datos:

1. Cargar los atributos reales de los seis lotes de Cerro Azul por script y
   confirmar que se leen correctamente.
2. Crear un microlote bajo un lote real, con su razón, y confirmar que la
   jerarquía y la genealogía funcionan.
3. Registrar los cuatro hechos reales pendientes —600 huecos, limpieza de
   apiario, 600 plantones recibidos, noria activada— y confirmar que quedan
   correctamente asociados a su lugar.
4. Crear Specimens con sector simple y con grid, y confirmar que ambos
   funcionan.
5. Crear una trampa de broca en un lote real con su sector, registrar dos
   revisiones con conteo en fechas distintas, y confirmar que la serie se lee
   correctamente. Probar el ciclo activa → retirada → reinstalada.
6. Confirmar que los datos reales de A7 siguen intactos.

## 8. Entregables

Migración, capa de servicio, tests, y **texto de ADR en borrador** (no lo
anexes) registrando: la decisión de §4 con su razonamiento, las dos reglas de
microlotes de §2, la decisión sobre trampas de §5, y que este ticket es
esquema sin interfaz por decisión explícita del product owner.

Actualizá `README.md` y confirmá el siguiente número de ADR contra el archivo
real.

Reportá qué quedó sin construir de `29_` y sigue pendiente.
