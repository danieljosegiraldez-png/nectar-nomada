# 027 · La lista de recetas da 500 a quien no tiene acceso, y decide el acceso con un lote cualquiera

**Estado: HECHA el 2026-10-10, en el PR #696.** Lo encontró, de camino, la medición de las rarezas de
`026` con la cuenta DEMO de socio. No es de aquella ficha: `/recipes` no tiene segmento dinámico.

**La regla la eligió Daniel ese día: quien ve la lista es quien podría crear una receta**
(`puedeCrearRecetaEnAlguna`: `location:edit_beneficio` en una organización con lotes, o en plataforma
para la receta compartida). `listRecipes` rechaza con `ProcessTargetError("no_recipe_access")`, que
`app/recipes/page.tsx` ya convertía en volver a `/lots`. Y los **tres** enlaces a la lista preguntan lo
mismo —el de `/lots`, el índice de `/beneficio` y la barra `NavegacionBeneficio`—, para no prometer lo
que la lista rechaza; `destinosDelBeneficio` recibe el booleano en vez de deducirlo de `lot:manage`.

**La consecuencia, dicha porque cambia lo que ve alguien:** el **Farm Operator** (`lot:manage` sin
`edit_beneficio`) deja de ver la lista y sus enlaces. Farm Manager y Platform Admin la conservan, y
ningún perfil gana acceso. Lo que la lista enseña no cambia: todas las recetas, como antes.

**Y el mismo «lote cualquiera» vivía en otros cinco sitios del mismo archivo. Arreglados también,
por decisión de Daniel del mismo día.** `lib/traceability/processTargets.ts`, medido el 2026-10-10:

| función | qué lote mira |
|---|---|
| `listRecipeOrganizations` — la usa `puedeCrearRecetaEnAlguna`, o sea la regla nueva de la lista | el primero de cada organización, sin orden |
| `createRecipeWithVersion` | compartida: el primero de **toda la base** (`where: {}`); de organización: el primero de ésa |
| `getRecipeForEditor` — el detalle `/recipes/[id]` | igual; `organizationId ?? undefined` hace que Prisma **quite el filtro** |
| `updateRecipeMetadata` y `createRecipeVersion` | igual |

El comentario de `createRecipeWithVersion` dice «gated on any lot the account **can manage**», y el código mira el
primer lote, lo gestione o no. **Y este PR lo hace visible:** antes, quien veía la lista era quien
gestionaba el primer lote de la base, el mismo que el detalle de una receta compartida consulta. Ahora la
lista la ve un Farm Manager de otra organización. Sonda sobre base desechable sembrada (primer lote
`DCL-2027-CHERRY-01`, de `DEMO Cloudline`): un Farm Manager de su propia finca ve la lista, y en ella una
receta compartida; abre la de su organización, y la compartida le da `no_lot_access`, o sea **404**.

**Cómo se arregló:** `gestionaAlgunLote` recorre las combinaciones distintas de proyecto, ubicación y
clasificación —lo único que mira `requireLotAccess`— y pregunta a `puedeGestionarLote`, el mismo guardia
que la escritura, overrides incluidos. **No usa `resolveLotVisibility`**, que es más barata pero mira sólo
los permisos del perfil: un `grant` de `lot:manage` por override habría quedado fuera. Sobre la copia
restaurada hay 137 lotes y 8 combinaciones en toda la base, así que recorrerlas cuesta poco.
`exigeLoteGestionable` conserva los dos errores de antes, en el mismo orden.

**Cómo quedó comprobado:**

- `tests/traceability/listaDeRecetas.test.ts` (grupo `base-sembrada`): sin asignaciones y Farm Operator
  rechazados con `ProcessTargetError`, Farm Manager ve la receta de su organización, y un control de que
  la lista y `puedeCrearRecetaEnAlguna` contestan lo mismo para los tres. Con el código anterior caían
  **las 6**, con `no_lot_access`.
- La misma prueba, para los cinco sitios: dos sitios en una organización, con el lote del A creado
  primero, y un Farm Manager sólo del B, que ve la lista, abre su receta y la compartida, y renombra la
  suya. Con el `processTargets.ts` anterior caían **sus 6 filas**. El control negativo —no abre la receta
  de otra organización— pasa con los dos códigos, como debe.
- Flip del ayudante: mirar sólo la primera combinación tumba esas 6; decir que sí siempre, o no filtrar
  por organización, tumba sólo el control negativo. La primera mutación cae porque Prisma devuelve antes
  la combinación del A: depende del orden, y por eso el rojo que cuenta es el del código anterior.
- Las siete pruebas que usan estas funciones (`recipeAuthoring`, `recipeVersions`, `editarBeneficio`,
  entre otras): 7 archivos, 134 pruebas en verde.
- Flip: quitar la guarda tumba 4 —las dos filas que rechazan y sus dos controles—; volver a una clase
  que la página no atrapa tumba las mismas 4; volver a colgar el índice de `lot:manage` tumba sólo
  «Recetas sale de la regla de crear recetas, no de lot:manage».
- Contra `next dev` sobre base desechable sembrada: con el socio, `/recipes` → **307** a `/lots` (antes
  500), y `/lots` sin enlace a Recetas (control: el del Informe, en la misma barra, sí sale). Con el
  admin, `/recipes` → 200, y el enlace aparece en `/lots`, en el índice de `/beneficio` y en la barra
  de `/beneficio/secado`. Ninguna línea de error en el log del servidor.

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
