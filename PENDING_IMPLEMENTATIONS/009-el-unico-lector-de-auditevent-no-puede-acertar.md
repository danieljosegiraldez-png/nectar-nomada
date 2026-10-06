# 009 · El único lector de `AuditEvent` en pantalla no puede acertar nunca

**Estado: HECHO el 2026-10-05, y NO lo estaba el 2026-10-03 aunque esta ficha lo
dijera.** Ver «Lo que la verificación del 2026-10-03 no pudo ver» y «Cómo quedó de
verdad», los dos al final. Lo que sigue a este bloque es el texto original de la ficha,
que sigue describiendo bien el defecto.

> **Esta ficha dijo «HECHO» durante dos días con el defecto vivo, y la lección es la
> parte que vale.** La verificación del 2026-10-03 comprobó las **tres** mitades que la
> ficha pedía, y las tres eran **ciertas**: existía el lector nuevo que lee «por entidad
> y sus hechos relacionados», el comentario que certificaba el vacío ya no estaba —medido
> con control positivo— y el guardia existía. Con eso, el panel «Historial» seguía
> renderizando vacío en **los 108 lotes**.
>
> **Por qué las tres podían ser ciertas y el defecto seguir vivo:** las tres miran
> ARTEFACTOS —que exista un archivo, que no exista una frase, que exista un test— y
> ninguna mira la CONDUCTA. El lector nuevo era correcto; lo que estaba mal era el sitio
> que lo llama, que le pasaba `lotId` como `entityId` para cinco `entityType` cuyas
> escrituras guardan el id del propio evento. Arreglar el vocabulario y dejar el id es
> media corrección que se lee como entera.
>
> Es la misma forma que `CLAUDE.md` ya tiene escrita como «un veredicto que comprueba
> todo menos la propiedad que importaba», aquí aplicada a una ficha: **el control que
> faltaba era llamar a `getLotDetail` y contar lo que devuelve**, y no existía ninguna
> prueba que lo hiciera. Hoy sí: `tests/traceability/historialDelLote.test.ts`.

Es el mismo fallo que la ficha describe, cometido por la ficha: prosa que certifica un
mundo que ya cambió. Encontrado el 2026-09-07 al contestar la decisión D3 del alcance A9
(`docs/implementation/48_A9_CAPTURA_DE_CAMPO_REPORTE.md` §1.1).

## El defecto, con su comando

`lib/traceability/lots.ts:728` es el **único** sitio del repositorio que lee
`AuditEvent` para mostrarlo en pantalla:

```
prisma.auditEvent.findMany({ where: { entityType: "Lot", entityId: lotId }, ... })
```

Nada escribe nunca `entityType: "Lot"`. Las escrituras usan `snake_case` sin
excepción:

```bash
grep -rhn 'entityType: "' lib app --include="*.ts" --include="*.tsx" \
  | sed 's/.*entityType: "\([^"]*\)".*/\1/' | sort | uniq -c | sort -rn
#   … 66 valores, todos snake_case … y una sola línea:  1 Lot
grep -rn 'entityType: "Lot"' lib app --include="*.ts" --include="*.tsx"
# lib/traceability/lots.ts:728   ← el lector. Ningún escritor.
```

**Consecuencia:** el panel «Historial» de `app/lots/[id]/page.tsx:973` renderiza
siempre vacío y muestra `noHistory` — «este lote no tiene historial». Es una
afirmación sobre el lote hecha por una consulta que no puede acertar nunca. Es
la forma exacta que el `CLAUDE.md` de este repositorio llama guardia falso: un
cero que se lee como «limpio» y significa «no miré».

## Por qué sobrevivió, que es la parte que importa

El comentario de `lib/traceability/lots.ts:684-688` lo certifica como correcto:

> `auditEvents` is intentionally queried even though no Phase 1 write path has
> ever populated `core.AuditEvent` for a traceability entity yet — the section
> renders correctly empty, which is an honest reflection of unbuilt
> instrumentation, not a bug in this query.

**Era verdad cuando se escribió y dejó de serlo.** Hoy `lots.ts:333` escribe
`lot_transformation`, `roasting.ts:375` escribe `lot_roast_profile`, y
`measurements`, `harvest`, `quantity`, `samples`, `drying`, `fermentation` y
`plantingCohorts` escriben lo suyo. La instrumentación se construyó; la consulta
se quedó atrás, y el comentario lleva meses certificando el vacío.

Una instrucción vieja es peor que ninguna: la prosa que explica por qué algo
está bien sobrevive al motivo que la hacía cierta.

## Qué lo desbloquea

**Nada.** Es trabajo pendiente, no una decisión. Tiene tres mitades y conviene
no hacer sólo la primera:

1. **Arreglar la consulta** para que use el mismo vocabulario que las
   escrituras. Cambiar `"Lot"` por `"lot"` no basta: los hechos de un lote se
   escriben bajo **varios** `entityType` —`lot_transformation`,
   `lot_roast_profile`, `quantity_event`, `measurement`…—, así que el lector
   honesto es por entidad *y sus hechos relacionados*, no por una cadena.
2. **Borrar el comentario que lo certificaba**, o quedará explicando un mundo
   que ya no existe.
3. **Un guardia**, porque esto es exactamente lo que un guardia caza y no había
   ninguno: que todo `entityType` leído exista entre los escritos. Es un test de
   fuente, hermético, de la misma familia que
   `tests/arquitectura/audit-atomico.test.ts`. Sin él, el próximo lector vuelve
   a inventarse su vocabulario.

**Su flip-test:** cambiar un `entityType` de escritura y comprobar que el
guardia nombra el lector que se quedó huérfano.

## Lo que este defecto arrastra

`docs/implementation/48_A9_CAPTURA_DE_CAMPO_REPORTE.md` lo mete dentro del
ticket **A9.3**, porque el alcance A9 va a construir un segundo lector de
enmiendas encima del mismo código. Si A9 no se ejecuta, esto sigue pendiente por
su cuenta — de ahí esta ficha.

---

## Cómo quedó — verificado el 2026-10-03

Las tres mitades que esta ficha pedía, con la medición y el control de cada una. El trabajo
no es de esta verificación: lo hizo A9.3 y la ficha se quedó atrás.

**1. La consulta, arreglada por donde había que arreglarla.** No se cambió la cadena: se
escribió un lector nuevo, `lib/traceability/enmiendas.ts`, que lee por entidad **y sus hechos
relacionados**. Su propia cabecera trae el motivo y es el que esta ficha pedía:

> «Los hechos de un lote no se auditan bajo un solo `entityType`: `lot_transformation`,
> `lot_roast_profile`, `quantity_event`, `measurement` y `harvest_event` son todos hechos DE
> ese lote. Un lector por una cadena enseñaría un quinto de su historia y parecería completo,
> que es peor que enseñar cero.»

**2. El comentario que certificaba el vacío: ya no está.** Medido con las dos frases exactas
que lo identificaban —«renders correctly empty» y «unbuilt instrumentation»—: **0 ocurrencias**
en `lib` y `app`. Control positivo al lado, para que ese cero signifique algo: una frase que SÍ
está en el lector nuevo —«un quinto de su historia»— da **1**. Sin esa fila, un cero podría ser
que el grep no miraba donde debía.

**3. El guardia existe y hace lo que se le pedía:**
`tests/arquitectura/vocabulario-de-audit.test.ts` — «todo `entityType` que se LEE existe entre
los que se ESCRIBEN». Dice además **su límite**, que es lo que lo hace fiable: compara cadenas
literales, así que un `entityType` compuesto en tiempo de ejecución no lo vería; hoy no hay
ninguno y lo comprueba.

**Y el vocabulario cambió como tenía que cambiar.** Donde esta ficha midió «1 `Lot`, ningún
escritor», hoy hay:

| | |
|---|---|
| `entityType: "lot"` **escrito** | **2** — `lotesDeBeneficio.ts:116` y `lots.ts:1337` |
| `entityType: "Lot"` | **2**, y las dos son **prosa en comentarios** que explican el defecto en pasado (`enmiendas.ts:8`, `bitacora.ts:23`) |

**Lo que esta ficha deja como lección, y no es técnica.** Llevaba semanas diciendo «no
empezado» sobre trabajo hecho, y «no empezado» escrito hace un mes vale lo mismo que el
comentario que esta ficha vino a denunciar. **Una ficha es prosa, y la prosa no caduca sola.**
Antes de empezar lo que una ficha pide, medir que siga pendiente — el control cuesta un `grep`
y aquí habría ahorrado un trabajo entero.

---

## Lo que la verificación del 2026-10-03 no pudo ver

Esta sección no corrige la de arriba: la de arriba midió bien lo que midió. Lo que se
añade es **qué quedaba fuera de su alcance**, medido el 2026-10-05 sobre una copia
desechable de la base compartida (`nectar_ci_historial`, creada con
`CREATE DATABASE "nectar_ci_historial" TEMPLATE "nectar_test"` + `prisma migrate deploy`,
203 migraciones, `datlocale = C.UTF-8` comprobado con `upper('ñ') = 'Ñ'`).

**La fila patrón, que se lee antes del veredicto:**

| | |
|---|---|
| lotes | **108** |
| filas de `core.audit_event` | **6.484** |
| filas de los cinco `entity_type` que la ficha nombra | **1.792** |

**El veredicto:**

| la pregunta | filas |
|---|---|
| de esos cinco tipos, con `entity_id` = el id de un **lote** — *lo que `getLotDetail` consultaba* | **0** |

**Y sus controles positivos, que son los que hacen que ese 0 signifique «no puede
acertar» y no «no hay auditoría»** — el mismo tipo contra el id de **su propia** entidad:

| `entity_type` | filas que apuntan a su entidad |
|---|---|
| `measurement` | 38 |
| `harvest_event` | 35 |
| `lot_transformation` | 31 |
| `quantity_event` | 18 |
| `lot_roast_profile` | **0, y este control NO discrimina** — hay 4 filas de audit y **0** perfiles vivos en la tabla, así que su cero es «no hay sujeto», no «la consulta falla» |

Control negativo del método, para que las cifras de arriba no sean del instrumento:
`entity_type = 'Lot'` —la cadena que nadie escribe— da **0**, como debe.

### Y había un SEXTO tipo, que es el único con el id bueno

`entity_type = 'lot'` se escribe **con el id del lote** y la consulta **no lo pedía**.
Tres escritores, encontrados por `grep` con su control positivo:

- `lib/traceability/lots.ts` → `lot.release`
- `lib/traceability/lotesDeBeneficio.ts` → `lot.assembled_from_receptions`
- `scripts/p0-flag-overstated-lots.ts` → `lot.flag_conflicting_quantity`

Las **3** filas de la base cuyo `entity_id` es el id de un lote son exactamente de ese
tipo. O sea: las únicas que la ficha podía encontrar por id eran las que no preguntaba.
La liberación de un lote —que el comentario de `liberarLote` llama «una autorización
comercial sin rastro de quién la dio»— no salía en pantalla.

## Cómo quedó de verdad — 2026-10-05

1. **La lectura resuelve los ids de los hechos**, y vive en el SEGUNDO lote de consultas
   de `getLotDetail` porque en el primero esos ids todavía no existen. Eso es la forma
   del arreglo, no un detalle de estilo.
2. **El sexto tipo entró**: `{ entityType: "lot", entityId: lotId }`.
3. **El guardia de conducta, que es el que faltaba**:
   `tests/traceability/historialDelLote.test.ts` llama a `getLotDetail` sobre un lote con
   dos hechos reales —un evento de cantidad y una liberación, una por cada clase de
   defecto— y cuenta lo que devuelve. Lleva control positivo (las filas existen en la
   tabla), aislamiento (el lote hermano devuelve `[]`) y control negativo del aislamiento
   (la base sí tiene filas de esos tipos que la consulta descartó).
4. **El flip-test, con las cuatro exigencias de `CLAUDE.md`** —sha antes y después, que el
   módulo importe, qué prueba cae por su nombre, y artefacto anterior borrado:

   | mutación | caen | ¿corrieron las 4 pruebas? |
   |---|---|---|
   | devolver `entityId: lotId` (el defecto) | **1** — «devuelve los hechos del lote» | sí |
   | quitar el filtro de `entityId` (el arreglo perezoso) | **2** — y la segunda es la de aislamiento | sí |
   | sin mutar | **0**, salida 0 | sí |

   La primera mutación deja el aislamiento en verde, y es correcto: esa aserción sólo se
   ejerce cuando la lectura devuelve algo. La que la prueba es la segunda.
5. **El tope se dice en vez de esconderse.** `leerEnmiendas` corta en `take: 50`, así que
   con 50 filas la cifra del rótulo sería un suelo; se rotula «50 o más», como las tareas
   con su 20. Medido: el lote con más historia tiene **9** filas y **0 de 108** pasan de
   50, así que hoy esa rama no se pinta nunca — está porque el día que se pase, la
   pantalla no debe afirmar un total que no sabe.
6. **Y el guardia de vocabulario se endureció de camino**, porque su clasificación miraba
   una ventana de 400 caracteres y perdía el sexto sujeto de un `leerEnmiendas` de seis:
   lo contaba como escritura, o sea que dejaba de vigilarlo. Hoy cuenta paréntesis desde
   el `(` del lector. Medido sobre el mismo árbol: la ventana daba **8** lecturas y contar
   paréntesis da **9**, con las **6** de `lots.ts`. Se probó además «gana el marcador más
   cercano», que daba 10 y la décima era un `tx.auditEvent.create` —una escritura— contada
   como lectura: la ventana tiene falsos negativos y la cercanía falsos positivos.

**Lo que esta ficha deja como lección, y es distinta de la que ya tenía escrita.** La de
antes decía «una ficha es prosa, y la prosa no caduca sola: medir que siga pendiente». Se
hizo, y no bastó. Lo que faltaba es **qué** se mide: las tres mitades de la ficha nombraban
artefactos, y un artefacto presente no es una conducta correcta. **Cuando una ficha pide
«arreglar la consulta», su comprobación es llamarla y contar filas, no comprobar que
exista el archivo que la contiene.**
