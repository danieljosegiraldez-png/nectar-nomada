# I1 — Importador de los protocolos PE de Cafelino

**Carga los datos experimentales reales de Cafelino** — 41 filas de la
temporada 25/26, con estructura consistente entre protocolos.

CryoBloom **no entra acá**. Es un Project distinto, del product owner bajo
Néctar Nómada, y necesita su registro de cold hold por lote que todavía no
está disponible. Segundo importador, después.

**Los CSV no están en el repositorio.** Pedíselos al product owner antes de
empezar:
`Procesos_Especiales_Cafelino-CraftBrewingSupply_Panama_25-26_-_PE_Data-Table_2025-26.csv`
y `..._Estudio_cerezas.csv`.

---

## 1. El Project de Cafelino — crearlo primero

No existe. A7 lo dejó explícitamente fuera de alcance.

**Confirmado con el product owner:**

- **Dueño:** Roberto Ameglio — dueño y gerente general de Cafelino.
- **Daniel Giráldez:** acceso completo como consultor. Dirige los experimentos.
- **Vinculados:** Chini Ameglio, Rory Beitia, Eliecer.

Todas esas `Person` y la `Organization` Cafelino **ya existen** desde A7 — no
las crees de nuevo. Lo que falta es el Project, su Location (Alto Lino,
Boquete, también ya existe) y las Assignments.

**Aplicá el patrón de acceso ya establecido** en
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §7: el compromiso con cliente es su
propio Project, con `classification = partner`, y la contención de scope de
`RBAC.md` §3 garantiza que Cafelino no alcance datos de Las Nubes ni al revés.

Recomendá los perfiles de rol antes de crearlos: Roberto y Eliecer con
escritura, Daniel con administración, Chini y Rory con lectura — según lo que
el product owner indicó antes. **Verificá el aislamiento en vivo**, no por
argumento.

## 2. Lo que trae el CSV, y lo que ya está resuelto

Columnas: `PE ID Code`, `Fecha cosecha`, `Varietal`, `Lote`, `Fecha ingreso
secado`, `Fecha salida secado`, `H%`, `Nivel`, `Proceso`, `Visual check`,
`Comentarios`.

**Todo esto ya fue confirmado por el product owner — no lo re-preguntes:**

**`Lote` está vacío en todas las filas y se deduce del varietal**, solo en
esta lista: Catuaí es **lote 9**, Geisha es **lote 10**, Geisha Artillería es
**lote Artillería**. Registrá que fue deducido, no leído del archivo.

**`H%` y `Fecha salida secado` están vacías en casi todas.** El product owner
confirmó que **esos datos existen y los va a conseguir** — así que son
`missing_source_record` pendiente de carga, **no "nunca se midió"**. Esa
distinción importa: S1 ya modeló completar registros después con trazabilidad
de cuándo se supo cada cosa. Usá ese mecanismo.

**`PE-77` dice `19/2/2023` y es error de tipeo: es 2026.** Corregilo al
importar **y dejá registro de que se corrigió** — nunca en silencio.

**`Nivel` es la altura de cama en el cuarto de secado**, y es variable
experimental deliberada: determina cuánta luz recibe el lote. Las Geisha van
en el nivel bajo porque sus precursores volátiles son sensibles a la luz en
lavado y semi-lavado. **El nivel se interpreta contra su cuarto** — el solar
tiene 3 niveles con luz, el oscuro tiene 6 sin luz. Un nivel 1 en cada uno no
es lo mismo.

**El número base del PE es solo secuencia** — confirmado, no codifica nada.

## 3. El linaje ya está en el ID — leelo, no lo ignores

**Ésta es la parte que distingue una importación buena de un volcado de
filas.**

`PE-80-94`, `PE-79-93`, `PE-80-92`, `PE-79-91`, `PE-97-102` significan
"PE-80 que se transformó en PE-94" — un lote que pasó por cold hold y después
se dividió. **La cadena de transformación ya está escrita en la
nomenclatura.**

Y los sufijos `-A`, `-B`, `-C` son splits del mismo lote: PE-98-A/B/C es
lavado 100%, 75% y 50% del mismo Geisha 10 — un input, tres outputs.

El DAG de `lot_transformation` representa ambos casos y ya está verificado.
**Construí la cadena real, no 41 batches independientes.**

Reportá qué relaciones de linaje detectaste y cuáles quedaron ambiguas. Si
un ID no se puede interpretar con confianza, **dejalo como batch
independiente y reportalo** — no inventes un padre.

## 4. Los comentarios son las variables — mapealos

Todas las variables experimentales viven como prosa en `Comentarios`. Ejemplo
real: *"GrainProBag, Spontaneous Wild, vertical position 28 cm height cherry
mass"* — tres variables en texto libre.

Mapealas a los catálogos que RO1, RO1.1 y RO1.2 ya construyeron:

| En el comentario | Catálogo |
|---|---|
| Tanque I/II/III, Cooler I/II, GrainProBag | recipiente |
| Sunrise Orange, Deep Amber, Cool Blue, Green Origin, MP72, HDA54, Spontaneous Wild | levadura/cultivo |
| direct pitch, rehydrated | método de inoculación |
| al río, en quebrada | fuente de agua |
| Cold Hold, post-cold hold, directo a cama sin fermentación controlada | manejo de temperatura + fuente microbiana |
| vertical/horizontal, 28 cm / 14 cm | posición + altura de masa |
| lavado 100%/3/4/1/2, Natural, Semi Wash | grado de proceso |
| Dry Cherry, Wet cherry | estado de la cereza |
| bajo techo intemperie | condición de secado |
| Doble Mosto "Guacho" | medio de lavado / sustrato añadido |

**`Spontaneous Wild` no es una cepa** — es ausencia de cepa conocida.
RO1 §3a ya lo estableció: registrarlo como cultivo identificado afirmaría
conocimiento que nadie tiene. Va como fuente microbiana espontánea con su
`dataQuality` correspondiente.

**Reglas del mapeo:**

- **Si un término del comentario no coincide con ningún valor de catálogo,
  no inventes el valor ni lo fuerces al más parecido.** Reportalo y dejá el
  comentario original intacto.
- **El comentario original se conserva siempre**, aunque se haya mapeado
  completo. Es el registro de lo que efectivamente se escribió.
- Reportá qué porcentaje de cada fila quedó mapeado y qué quedó sin
  interpretar.

## 5. La hoja de estudio de cerezas

Seis filas, con vocabulario controlado ya escrito por el product owner —
Selección, Flotado, Condición visual, Limpieza, Color, Brix, Firmeza,
Densidad, Tamaño/forma de grano, Defectos de grano.

**Solo dos valores numéricos registrados**: Brix 17.53 en pacamara lote 11,
Brix 18.5 en Geisha lote 10. **Es una plantilla en uso incipiente, no un
dataset completo. Preservalo así** — los vacíos son `missing_source_record`,
nunca cero.

Aparecen dos entidades: **lote 11 pacamara** y **Geisha Las Nubes, Jaramillo
Arriba** — esta última es la finca de Agustín Gómez que S1 ya modeló.
**Enlazalas a lo existente, no crees duplicados.**

Usa `ProcessingStageObservation`, que RO1 construyó exactamente para esto.

## 6. Procedencia — la parte que no se negocia

Estos son datos históricos transcritos de una hoja de cálculo, **no
observaciones tomadas en el momento por quien importa.**

- Nada de lo importado es `direct_observation` por el hecho de importarlo.
  Recomendá la clase correcta y justificala — probablemente
  `original_record` para lo que la hoja registra como hecho, con
  `sourceReference` apuntando al CSV y su fecha.
- **Lo deducido va marcado como deducido**: el `Lote` inferido del varietal,
  el linaje leído del ID, la corrección de fecha de PE-77.
- `dataQuality` refleja que la cadena está incompleta donde lo está.

## 7. Idempotencia y seguridad

- **El importador debe poder correrse dos veces sin duplicar.** Usá el PE ID
  como clave natural.
- **Modo de prueba primero**: que reporte qué haría antes de escribir, y
  esperá aprobación.
- Hay datos reales de A7, F1, S1, R1, RO1 y RO1.2 en la misma base.
  Verificá antes y después.
- `assertDefinedWhere` en limpieza de tests (ADR-045). Ese archivo ya tuvo
  tres fugas de datos de prueba — no agregues la cuarta.

## 8. Verificación

1. Correr en modo prueba y revisar el reporte antes de escribir nada.
2. Importar y confirmar que las 41 filas existen con su varietal, fechas,
   nivel y proceso.
3. Confirmar que PE-98-A/B/C quedaron como tres salidas de una
   transformación con un input, no como tres batches sueltos.
4. Confirmar que PE-80 → PE-94 quedó como cadena, no como dos batches
   independientes.
5. Consultar "todos los tratamientos con Spontaneous Wild" y confirmar que
   devuelve PE-81, PE-82, PE-84 y PE-85.
6. Consultar "todos los que se secaron al río" y confirmar el conjunto
   correcto.
7. Confirmar que H% y fecha de salida quedan como `missing_source_record`,
   no como vacío indistinguible ni como cero.
8. Correr el importador dos veces y confirmar que no duplica.
9. Confirmar aislamiento: una cuenta con acceso a Las Nubes **no** alcanza
   los datos de Cafelino.
10. Confirmar que los datos reales previos siguen intactos.

## 9. Entregables

El Project de Cafelino con sus Assignments, el importador, los datos
cargados, tests, y **texto de ADR en borrador** con la marca en el encabezado.

Registrá: la clase de procedencia elegida y por qué, qué relaciones de
linaje se detectaron, qué términos no mapearon a ningún catálogo, y qué queda
pendiente de cargar cuando el product owner consiga H% y fechas de salida.

Actualizá `README.md`. Confirmá el siguiente número de ADR contra el archivo
real.

**Reportá cuánto quedó sin interpretar.** Un importador que dice haber
mapeado todo probablemente forzó algo.

---

## Aclaración del product owner — PE-107 (2026-08-20)

**Qué es realmente el "guacho" de PE-107.** Una mezcla de mostos ya
fermentados que arrastra **seis poblaciones** en un solo recipiente:

- Cool Blue
- Sunrise Orange
- Green Origin
- Deep Amber
- fermentaciones espontáneas de **Catuaí**
- fermentaciones espontáneas de **Geisha**

**La celda del archivo dice menos que eso.** PE-107 registra sólo
`S.O. G.O D.A.` — no nombra Cool Blue ni las espontáneas. La fila hermana
PE-106 sí escribe la convención completa (`S.O. G.O D.A. C.B. SPON ... y
pitch de 20g de cool blue`), lo que confirma que las iniciales son las
cepas comerciales: S.O. = Sunrise Orange, G.O. = Green Origin,
D.A. = Deep Amber, C.B. = Cool Blue, SPON = espontánea.

**Procedencia distinta, y por eso está acá y no en la nota del lote.** Esta
composición no sale del archivo: es testimonio del product owner. La nota
que el importador escribe en `TreatmentBatch.notes` conserva el texto
original del CSV, `original_record`, y nada más. Mezclar ambas cosas en un
mismo campo afirmaría que el archivo dice algo que no dice.

**La brecha de modelado que esto expone.** `Levadura / cultivo` es de tipo
catálogo y de valor único: no puede representar seis poblaciones
simultáneas. Forzar una sola afirmaría una composición que nadie midió, y
la regla del §mapeo lo prohíbe explícitamente. Hoy el importador no asigna
cultivo a las filas guacho y preserva el texto verbatim — correcto, pero
incompleto: la composición real no es consultable.

Resolverlo pide una decisión de diseño que este ticket no toma: o un
cultivo multivaluado, o modelar el mosto guacho como una entidad con su
propia composición y linaje (que es lo que realmente es — el mosto tiene
padres, igual que un lote). Queda como brecha registrada, no como
pendiente del importador.
