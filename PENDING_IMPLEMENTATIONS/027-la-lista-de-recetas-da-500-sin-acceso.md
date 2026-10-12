# 027 · La lista de recetas da 500 a quien no tiene acceso, y decide el acceso con un lote cualquiera

**Estado: HECHA el 2026-10-12, en el #696, y no como se construyó primero.** Lo encontró la medición de las
rarezas de `026` con la cuenta DEMO de socio. No es de aquella ficha: `/recipes` no tiene segmento dinámico.

**Qué pasó.** El 2026-10-10 Daniel eligió una regla para la lista, «la misma que crear una receta», y el #696
la construyó. El Farm Operator perdía la lista y sus enlaces. Mientras tanto entró en `main` la Parte 2a de
recetas (#715), que había arreglado por su cuenta el mismo «lote cualquiera» (su R7, del 2026-10-05) y había
fijado otra regla (su Ruling C4): cada receta la ve quien opera algún lote de su organización o quien puede
escribir sus recetas. Al juntar `main`, las dos chocaron, y **Daniel eligió el 2026-10-12 la de `main`**.

**Lo que queda de esta ficha:**

| defecto | cómo quedó |
|---|---|
| **1 · el 500** | `main` lo dejaba a propósito: su comentario decía que quien no tiene acceso «ve la página de error». Daniel decidió el 2026-10-12 que **vuelva a `/lots`**. `app/recipes/page.tsx` atrapa `TraceabilityAccessError`, y sólo esa clase. Lo guarda `tests/traceability/paginaDeRecetas.test.ts`, con el control de que otro error sube tal cual. Flip: sin el `catch` cae la fila de `/lots`. |
| **2 · el lote cualquiera** | Arreglado en `main` por la Parte 2a: `listRecipes`, `listRecipeOrganizations` y `getRecipeForEditor` preguntan por los ámbitos de TODOS los lotes de la organización (`ambitosDeLosLotes`), y las escrituras pasan por `exigeAutoriaDeReceta`. |

**Lo que se descartó del #696 al juntar**, para que nadie lo busque: `listRecipes` decidida por
`puedeCrearRecetaEnAlguna`; el ayudante `gestionaAlgunLote`; los tres enlaces preguntando ese booleano;
`tests/traceability/listaDeRecetas.test.ts`; y la entrada de `listRecipes` en la allowlist de acceso, que
con el código de `main` vuelve a ser «guardia directo».

**Y sobrevive la guarda de la `026`:** un id mal formado en `/recipes/[id]` es «no existe», y el detalle da
404 a `ProcessTargetError` y a `TraceabilityAccessError`. La página de `main` volvía a atrapar sólo la primera,
así que el 500 de la receta Libre sin lote visible habría vuelto con el merge.

**Pendiente, y no de esta ficha:** si el índice de `/beneficio` y `/lots` ofrecen el enlace al Coffee Process
Manager, que puede ver la lista sin `lot:manage`. Lo dice el comentario de `app/beneficio/destinos.ts`, y es
decisión de Daniel.

**Lo de abajo es la ficha como se escribió el 2026-10-10**, antes de todo esto.

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
