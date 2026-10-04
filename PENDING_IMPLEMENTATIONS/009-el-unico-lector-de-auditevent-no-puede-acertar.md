# 009 · El único lector de `AuditEvent` en pantalla no puede acertar nunca

**Estado: HECHO.** Lo hizo el alcance **A9.3 (D3)** y esta ficha no lo supo: siguió
diciendo «no empezado» hasta que se verificó el 2026-10-03. **Las tres mitades están, y
cada una se comprobó con su control** — ver «Cómo quedó» al final.

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
