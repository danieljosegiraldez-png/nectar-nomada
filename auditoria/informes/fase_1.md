# Fase 1 — Cosecha, selección y creación de lote

**Corrida el 2026-09-14** sobre `origin/main` en `515e2db`. Rama `auditoria/fase-1`.
Corrida **después** del prompt maestro, así que se apoya en `auditoria/INVENTARIO.md`.

---

## Resumen

De los 10 criterios del eje funcional: **7 pasan, 2 son hallazgos, 1 es una
contradicción que el maestro manda no resolver por mi cuenta.** El eje veraz pasa
su pregunta principal y deja un tercer hallazgo. El pedagógico queda sin correr.

| | criterio | veredicto |
|---|---|---|
| 1 | tres ecuaciones independientes, tolerancia sobre el insumo de su etapa | ✅ pasa |
| 2 | la pulpa no entra como categoría de selección de cereza | ✅ pasa |
| 3 | un desbalance se persiste con su discrepancia; sólo el esquema lanza | ✅ pasa |
| 4 | `prime_ripe` no admite valor por defecto | ⚠️ **F1-001** — no hay dónde guardarlo |
| 5 | el manifiesto de enrutamiento devuelve enums, nunca prosa | ✅ pasa |
| 6 | el rendimiento se compara contra su propio rango | ✅ pasa |
| 7 | al generarse pulpa se crea un `CascaraBatch` enlazado | ❌ **F1-002** |
| 8 | todo peso lleva su condición y no se comparan condiciones distintas | ✅ pasa |
| 9 | `LOT_ID` estable, único, sin colisión entre fincas ni días | ✅ pasa |
| 10 | trazabilidad hacia atrás hasta parcela y recolector | ✅ pasa |
| veraz | procedencia de las cifras de recepción | ⚠️ **F1-003** |

---

## F1-001 · Hay dos «selecciones» distintas con el mismo nombre

**Y esto el prompt maestro manda no resolverlo:** *«ante una contradicción entre
documentos, o entre un documento y el código: detente y pregúntame»*. Así que se
describe y se para.

**La del repositorio** está construida y en uso: `accepted + rejected + declared
loss = input`, sobre `LotTransformation` de tipo `selection`, con sus once filas
reales. `balance.ts` la llama *«la operación para la que se construyó toda esta
reconciliación»*.

**La de la especificación** (`docs/beneficio/12` §A) es otra cosa:

```
total_cherry = prime_ripe + semi_ripe + underripe + overripe
```

una descomposición de la masa **por madurez**, que es la que alimenta el índice
de pureza y el manifiesto de enrutamiento.

**Y esa descomposición no se guarda en ninguna parte.** Búsqueda de
`prime_ripe|semi_ripe|underripe|overripe` sobre `schema.prisma`: **cero**. Lo
único de madurez que existe es `cherryColorValueId`, un valor de catálogo
cualitativo. *Control positivo:* `rejection_category` sí está en el esquema, 4
apariciones, así que la búsqueda sabe encontrar cosas de selección.

**Consecuencia.** `validarSeleccion` en `lib/beneficio/balanceDeMasas.ts` está
implementada, probada contra sus vectores de aceptación y **no puede correr
contra un lote real**, porque sus cuatro entradas no tienen dónde vivir. Es la
tercera vez que esta auditoría encuentra la misma forma —después de
`COLD_HOLD_PREFERMENT` (F2-004) y de la mitad de fermentación de los motores
(inventario)—: **mecanismo completo, sin dato que lo alcance.**

**Lo que hay que decidir, y es tuyo:** si la selección de la especificación es
una etapa *distinta* de la del repositorio —una ocurre en el patio al recibir, la
otra al separar lotes— o si son la misma vista de dos maneras. De eso depende si
se añaden cuatro columnas a algún sitio o si la especificación se ajusta.

---

## F1-002 · `CascaraBatch` no existe, y el motor propone hacia el vacío

**Eje funcional, criterio 7.**

Búsqueda de `Cascara|cascara` sobre `schema.prisma`: **cero**. *Control positivo:*
`BiocharBatch` sí existe como modelo, así que la búsqueda encuentra tablas de
subproducto cuando las hay.

`lib/beneficio/balanceDeMasas.ts` devuelve `cascaraBatchPropuesto` — **propuesto,
no creado**, y eso fue deliberado: §32 de `CLAUDE.md` exige sugerencia → revisión
humana → acción, y crear una fila sin que nadie la apruebe la habría saltado.

**Pero una propuesta que nadie puede aceptar no es media función: es ninguna.**
Hoy no hay tabla que reciba esa cáscara, ni pantalla que ofrezca aceptarla. La
pulpa se genera, el motor dice que ahí hay un subproducto, y no hay dónde
anotarlo.

**Severidad: media.** No corrompe nada —justamente porque no escribe— pero deja
el §7 del criterio sin cumplir y la cáscara, que `docs/12` trata como producto
con valor, fuera de la trazabilidad.

---

## F1-003 · Un peso puede ser `measured_fact` sin báscula detrás

**Eje veraz.** La pregunta del kit es precisa: *«el peso de cereza es MEDIDO sólo
si hay báscula con verificación registrada; si alguien lo digitó de memoria es
DECLARADO, y la diferencia debe ser visible.»*

**La mitad buena, y es sólida.** `HarvestEvent`, `ReceivingEvent` y
`QuantityEvent` llevan `provenanceClass` **obligatorio y sin valor por defecto**
—con el comentario «T9.5: no default» en los tres—, así que quien escribe tiene
que declarar si eso fue un hecho medido o un registro original. La distinción
existe y se fuerza en el momento de escribir.

**La mitad que falta.** Nada ata un peso a **qué báscula** lo produjo, así que
`measured_fact` se puede declarar sin que exista instrumento alguno. Y hoy eso es
una **asimetría nueva**: desde el 2026-09-14 `Measurement` tiene `instrumentId` y
puede decir con qué se midió y si estaba verificado; `QuantityEvent` no.

**Es aditivo y del mismo patrón ya construido:** una columna anulable
`instrumentId` en `quantity_event`, junto a lo que ya hay, sin rellenar nada
retroactivamente. Lo mismo que se hizo con las cuatro FK de equipo.

---

## Lo que pasa, y merece decirse

- **Criterio 1.** `Math.max(insumo * relativeTolerance, absoluteFloorKg)`, donde
  `insumo` es el de **esa** etapa. Está documentado en la cabecera del módulo:
  *«cada etapa calcula su tolerancia sobre el insumo de SU etapa»*.
- **Criterio 2.** Las diez categorías de `rechazo_categoria` son todas de cereza,
  y `materia_extrana` está definida como *«hojas, ramas, piedras — no es café»*.
  La pulpa no está, así que no hay doble conteo.
- **Criterio 3, y es de lo mejor del repositorio.** `reconcile` devuelve
  `unexplained` y `withinTolerance` en vez de lanzar, y devuelve **`null`, no
  cero**, cuando no se puede calcular — que es la diferencia entre «cuadra» y «no
  se pudo medir». Aceptar un descuadre fuera de tolerancia exige un permiso
  aparte (`requireBalanceOverride`).
- **Criterio 6, con su razonamiento a la vista.** Rangos separados para pulpa y
  para despulpado en baba, cada uno contra el suyo. El comentario del módulo dice
  que el objetivo era **no** disparar `YIELD_IMPLAUSIBLE` en lotes normales.
- **Criterio 8, y está bien pensado.** `stage_change` está **deliberadamente
  excluido** de la reconciliación: cereza a pergamino pierde cuatro quintos, *«y
  esa pérdida es el rendimiento, el número más valioso que calcula un beneficio.
  Tratarlo como discrepancia levantaría una desviación en cada despulpado
  correctamente registrado — que es como una alarma se ignora y luego se apaga»*.
- **Criterio 9.** `@@unique([organizationId, lotCode])`, con el comentario
  diciendo que dos fincas no pueden numerar «01» las dos.
- **Criterio 10.** `HarvestEvent` lleva `locationId` —la parcela— y
  `operatorPersonId` —quien recolectó—, y el lote enlaza con su cosecha. La
  cadena llega. `operatorPersonId` es anulable, así que puede faltar: el eslabón
  se ve ausente en vez de inventarse.

---

## Lo que NO se corrió

**El eje pedagógico entero.** Sus cuatro preguntas —enseñar a tomar la muestra de
flotación, interpretar un 22 % de flotadores, proponer qué revisar ante muchos
defectos, y dejar una lectura al cerrar la recepción— piden recorrer pantalla por
pantalla contra la ficha de `docs/beneficio/22` §5, y eso es trabajo de su propia
sesión. El inventario ya adelantó que es el eje más débil y que hay una **tensión
sin resolver** entre el Nivel 3 que la rúbrica exige y el guardia de la casa que
prohíbe el imperativo.

**Tres preguntas del eje veraz**, por la misma razón: si la altitud, la variedad o
la parcela pueden llegar a la ficha del lote sin respaldo; si algún sitio presenta
un rendimiento **esperado** como **obtenido**; y si el índice de pureza es
navegable hasta los pesos que lo formaron. Las tres piden recorrer fichas y
exportaciones, que es el mismo barrido que el eje veraz de la fase 2 dejó
pendiente. **Conviene correr los dos ejes veraces juntos**, en una sesión, en vez
de medio barrido dos veces.

---

## Y nada se corrigió, a propósito

El kit manda: primero la prueba que falla, en su propio commit; después la
corrección. De los tres hallazgos, **ninguno se puede corregir todavía**:

- **F1-001** es una contradicción documento-código, y el maestro dice pararse.
- **F1-002** y **F1-003** piden columnas o tablas nuevas — modelo de datos, que el
  kit reserva a tu aprobación.

Los tres van a `auditoria/DECISIONES_PENDIENTES.md`.
