# 009 · El único lector de `AuditEvent` en pantalla no puede acertar nunca

**Estado: no empezado.** Es un defecto **medido**, no supuesto, encontrado el
2026-09-07 al contestar la decisión D3 del alcance A9
(`docs/implementation/48_A9_CAPTURA_DE_CAMPO_REPORTE.md` §1.1). No se arregló
ahí porque no era de ese alcance, y no puede quedarse dentro de un informe:
el próximo lector de `AuditEvent` que alguien escriba va a heredar el fallo.

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
