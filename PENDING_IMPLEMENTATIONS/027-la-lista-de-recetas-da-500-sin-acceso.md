# 027 · La lista de recetas da 500 a quien no tiene acceso, y decide el acceso con un lote cualquiera

**Estado: medido el 2026-10-10, sin construir.** Lo encontró, de camino, la medición de las rarezas de
`026` con la cuenta DEMO de socio. No es de aquella ficha: `/recipes` no tiene segmento dinámico.

## Los dos defectos

**1. Un 500 donde la página quería redirigir.** `app/recipes/page.tsx` atrapa `ProcessTargetError` y
manda a `/lots` —su comentario lo explica: «quien no puede gestionar ningún lote no tiene nada que hacer
aquí, y la página lo rechaza igualmente»—. Pero `listRecipes` (`lib/traceability/processTargets.ts:489`)
rechaza con `requireLotAccess`, que lanza **`TraceabilityAccessError`**, no `ProcessTargetError`. Así que el
rechazo que la página prevé no lo atrapa nadie, y sale un 500. Medido con la cuenta DEMO de socio contra un
`next dev` sobre base desechable sembrada; en el log del servidor:

```
Error: no_lot_access
    at requireLotAccess (lib/traceability/lots.ts:114:9)
    at async listRecipes (lib/traceability/processTargets.ts:492:3)
    at async RecipesPage (app/recipes/page.tsx:19:15)
```

**2. El acceso se decide contra un lote cualquiera.** `listRecipes` hace
`prisma.lot.findFirst({ where: {} })` —el primer lote de **toda la base**, sin orden ni filtro— y pide
`lot:manage` sobre ése. Quien gestiona lotes de su organización pero no ese lote concreto recibe el
rechazo; y quien gestiona justo ése, ve la lista. Qué lote devuelve un `findFirst` sin `orderBy` no lo
promete Postgres, así que la respuesta puede cambiar sin que cambie nada de quien mira. Es la misma forma
que el comentario de `loteDeReferencia` (`lib/traceability/lots.ts`) ya describe para el origen de un
lote fusionado: un resultado elegido por el recorrido de un índice.

## Cómo arreglarlo

- El 1 es de una línea: que la página atrape también `TraceabilityAccessError`, como se hizo en
  `recipes/[id]` en el PR #696.
- El 2 necesita decidir qué significa «puede ver las recetas». Lo más fiel al resto del módulo es la
  misma regla que `puedeCrearRecetaEnAlguna`: alguna organización donde gestione un lote. Pero es una
  regla de producto, así que conviene confirmarla con Daniel antes de escribirla.

## Cómo se comprueba

Con la cuenta DEMO de socio (sin lotes): hoy `/recipes` da **500**; arreglado el 1, debe redirigir a
`/lots`. Y para el 2, una cuenta que gestione los lotes de una organización que **no** es la del primer lote
de la base: hoy recibe el rechazo, y no debería.
