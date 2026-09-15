# Eje veraz — fases 1 y 2, corridas juntas

**Corrido el 2026-09-15** sobre `origin/main` en `d532f3a`.
Rama `auditoria/eje-veraz`.

**Por qué juntas.** Las dos fases hacen la misma pregunta desde dos etapas: *¿toda
cifra que el sistema emite se sostiene?* Y las dos la contestan recorriendo **las
mismas superficies de salida** — fichas, etiquetas, exportaciones y reportes.
Correrlas por separado habría sido medio barrido dos veces.

**Las doce superficies**, enumeradas antes de mirar ninguna pregunta:
`app/reports/proceso`, `app/lots/[id]/report`, `app/lots/[id]/page`,
`app/field-sessions/[id]/report`, `app/sensory/external-report`,
`app/apiaries/[id]/etiquetas`, `app/api/export/route`, más
`lib/traceability/{export,reports,reporteDeProceso,reporteDeVisita}` y
`lib/apiary/etiquetasQr`.

---

## Resumen

**Siete preguntas, seis pasan y una es hallazgo** — y ese hallazgo no es nuevo: es
**F2-001 llegando a una pantalla**, que es exactamente lo que este eje existe para
encontrar.

| # | pregunta | veredicto |
|---|---|---|
| F2-a | ¿puede un lote mezclado imprimirse con el nombre de un proceso? | ⚠️ ver **V-001** |
| F2-b | ¿la altitud fusionada se presenta como promedio ponderado? | ❌ **V-001** |
| F2-c | ¿puede un puntaje de taza sobrevivir a una fusión por alguna ruta? | ✅ no |
| F2-d | el nombre de un proceso experimental, ¿está respaldado o es texto libre? | ✅ pasa |
| F1-a | procedencia de las cifras de recepción | ⚠️ ya reportado como **F1-003** |
| F1-b | ¿altitud, variedad o parcela sin registro que las respalde? | ✅ pasa |
| F1-c | ¿algún rendimiento esperado presentado como obtenido? | ✅ pasa |
| F1-d | ¿el índice de pureza es navegable hasta sus pesos? | ⚪ no existe — ver F1-001 |

---

## V-001 · La altitud de un lote fusionado es la de un padre arbitrario, y se imprime

**Severidad: alta.** Es el primer hallazgo de esta auditoría que llega a una
superficie que alguien mira.

`app/lots/[id]/page.tsx:407-412` muestra el rango de altitud del lote, tomado de
`lot.location.altitudeMinM` / `altitudeMaxM`. Y `lot.location` de un lote
**fusionado** es el del primer lote de entrada — que, por F2-001, no es «el
primero que el operario escribió» sino la fila que Postgres devuelva primero,
porque ese `findMany` no lleva `orderBy`.

**Lo que eso produce, dicho concretamente:**

> Fusiona un lote de una parcela a 1.400 m con otro de una parcela a 1.800 m. La
> pantalla del lote resultante muestra **uno de los dos rangos**, elegido por el
> orden de recorrido de un índice, **presentado como la altitud de ese lote**. No
> dice que sea una fusión. No dice que haya otro origen. Y recargar la página
> podría, en principio, enseñar el otro.

La pregunta del kit era si la altitud fusionada se presenta como **promedio
ponderado**. La respuesta es peor que «no»: se presenta **una de las dos como si
fuera la del lote**. Un promedio ponderado al menos sería una cifra derivada de
todo lo que entró.

**Y no es sólo la altitud.** Todo lo que cuelga de `lot.location` hereda el mismo
defecto: el nombre de la parcela en la ficha (`app/lots/[id]/report/page.tsx:77`
y `112-117`), la exposición solar, la zona horaria con la que se formatean las
fechas. **Eso último importa más de lo que parece**: las horas de un lote
fusionado se muestran en el huso de una parcela elegida al azar.

**Esto responde también a F2-a.** No hay marca de mezcla en ninguna superficie
—porque `MIXED` no existe—, así que un lote fusionado es **indistinguible** de uno
de origen único en todas las doce. No es que se imprima *mal*: es que no hay nada
que imprimir que diga que es una mezcla.

**No se corrige aquí.** Depende de `D-F2-01` —qué forma tiene `MIXED`— que sigue
esperándote. Lo que **sí** se puede corregir sin ti es el `orderBy` ausente, que
al menos haría el defecto determinista en vez de aleatorio.

---

## Lo que pasa, y varias cosas con nota

### F2-c · Un puntaje de taza no sobrevive a una fusión. Comprobado por dos caminos

1. `getLotLineage` devuelve **sólo `lot_id` y `depth`** — ninguna muestra, ninguna
   evaluación, ningún puntaje.
2. `reporteDeProceso.ts`, que es la superficie que **sí** imprime puntajes, los
   saca de `lot.samples → blindMappings → blindSample → assessments`: las muestras
   **propias** del lote. **Cero apariciones** de `lineage|ancestry|RECURSIVE` en
   ese archivo, con control positivo de **2** en `lots.ts`.

Un lote fusionado es una fila nueva sin muestras, así que sale con la lista
vacía. Y la media se calcula con `null` cuando no hay ninguno — **nunca 0**, que
es la diferencia entre «no se ha catado» y «cató cero».

### F2-d · El nombre de un proceso es texto libre, y el reporte lo dice

`LotProcess.intent` es un `String` libre, y llega a tres superficies. **Pero
nunca se presenta como un proceso registrado:** el reporte imprime al lado

```ts
etiqueta: p.processRecipeVersion?.recipe.name ?? SIN_RECETA
```

así que un proceso sin receta detrás sale marcado **`SIN_RECETA`**. Alguien puede
escribir «CryoBloom» en el `intent`, y el reporte dirá que ese nombre no tiene
receta que lo respalde. **Eso es exactamente lo que la rúbrica pide.**

### F1-b · La variedad de un reporte está respaldada, y la que no, no sale

`reporteDeProceso.ts:154` saca los varietales de

```
lot.harvestEvent.sources[].plantingCohort.cultivarValue.value
```

una cadena de claves foráneas hasta un **valor de catálogo curado** — no el
`cultivarNotes` de texto libre, que también existe y **no se imprime**. Y el
`.filter()` final descarta las que no tienen cohorte detrás: **una variedad sin
respaldo no aparece, en vez de aparecer sin respaldo.**

La parcela de la ficha sale de una FK a `Location`, así que está respaldada. La
altitud es el caso de V-001.

### F1-c · El rendimiento es observado, y distingue lo no pesado de lo cero

`computePlotYield` toma cosechas reales con su `harvestedAt` y su
`cherryWeightKg`, devuelve `{ status: "sin_cosechas" }` cuando no hay ninguna
—**nunca un cero**— y lleva contadores **separados** de `weighed` y `unweighed`.

Una cosecha sin pesar no entra como 0 kg: se cuenta aparte y se puede decir
cuántas faltan. Ningún rendimiento esperado se presenta como obtenido en ninguna
de las doce superficies.

### F1-d · No hay índice de pureza que auditar

Búsqueda de `pureza|purity` sobre `lib/` y `app/`: **dos archivos**, y sólo uno
es el índice. `lib/beneficio/balanceDeMasas.ts` lo define, y por F1-001 no puede
correr contra datos reales. El otro, `lib/research/catalogs.ts`, es el catálogo
`cereza_limpieza` —`limpio` · `leve_impureza` · `contaminado`—, que es **limpieza
de cereza y no un índice de pureza**: comparten la raíz de la palabra y no son lo
mismo. Ninguna superficie calcula ni imprime el índice.

Así que la pregunta «¿es navegable hasta los pesos que lo formaron?» **no tiene
sujeto**. No es un aprobado: es una consecuencia de F1-001, y vuelve a ser
navegable el día que esa decisión se tome.

---

## Una nota sobre el método, porque afecta a cómo leer esto

Las seis respuestas afirmativas se apoyan en **buscar en las doce superficies
enumeradas al principio**, no en leer el código de dentro afuera. Es la dirección
correcta para este eje —se persigue lo que se *emite*— pero tiene un límite que
conviene decir: **una superficie que no esté en esa lista no se miró.** La lista
salió de un `find` sobre nombres de archivo (`export|report|ficha|label|etiqueta|
pdf|csv`), así que una pantalla que imprima cifras sin llamarse así se escapó.

El candidato más probable es `app/lots/[id]/page.tsx`, que **sí** se revisó porque
V-001 apareció ahí — pero apareció persiguiendo la altitud, no barriendo la
pantalla entera.
