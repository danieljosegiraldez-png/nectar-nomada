# 008 · Un test hermético nuevo no corre en CI, y la compuerta sale verde igual

**Estado: HECHO el 2026-09-06** (PR #177). Encontrado el 2026-09-01 y comprobado,
no supuesto; resuelto por una vía que este documento no contemplaba.

> **Cómo se resolvió, y por qué no fue ninguna de las tres opciones de abajo.**
> Se **invirtió la lista**: `scripts/pruebas-por-compuerta.txt` nombra lo que
> **no** corre y por qué, y `ci.sh` corre todo lo demás. Una lista de inclusión
> pierde cobertura callándose; una de exclusión se queja — una prueba nueva que
> necesite base la corre `ci.sh` y **pone CI en rojo al no poder conectar**,
> diciendo cuál es.
>
> Así la pregunta «¿cómo se reconoce que un test necesita base?» deja de haber
> que contestarla por adelantado: se contesta **ejecutando**. La lista se midió
> corriendo la suite contra la URL inconectable que usa CI, y de paso quedó
> demostrado que la tercera opción de abajo —«por lo que importa: ¿alcanza
> `lib/db`?»— **clasifica mal**: da 97 de 97.
>
> **La evidencia de que funciona no es una mutación, es la historia del propio
> día:** `ci.sh` pasó de 39 a 40 a 41 archivos al añadirse pruebas nuevas **sin
> que nadie tocara ninguna lista**. El control positivo que este documento pedía
> existe en dos sitios: `ci.sh` aborta si la selección cae por debajo de 30, y
> `tests/ci-cobertura.test.ts` afirma que hay >50 archivos y >30 corriendo antes
> de comparar nada.
>
> Lo que el documento **no** anticipó y hubo que añadir: la lista necesita
> **grupos**, no una sola categoría. `tests/open-decisions.test.ts` pasa sin base
> y aun así no debe correr en CI porque lee `$HOME/.zshrc`.
>
> Y de propina, PR #178/#179: los que **sí** necesitan base ya corren en CI, en
> un job aparte con Postgres de servicio. La cobertura pasó de **22 de 97** a
> **94 de 101** archivos.

## Lo que pasa

`scripts/ci.sh` enumera **a mano** los archivos de test que corren sin base de
datos:

```bash
npx vitest run tests/session-state-budget.test.ts tests/inventario-de-rutas.test.ts \
    tests/arquitectura/acceso-a-datos.test.ts \
    ...
```

Un archivo hermético nuevo que nadie añada a esa lista **no corre**, y la
compuerta sale en verde. No hay error, no hay aviso: el archivo existe, pasa en
local, y CI nunca lo mira.

Pasó con `tests/apiary/offlineQueue.test.ts`. Se vio **sólo porque el recuento
no subió** —127 seguía siendo 127—, no por ningún mensaje. Añadido a mano,
127 → 134.

## Por qué la lista existe

No es descuido. La mayoría de la suite son tests de integración reales contra
Postgres y necesitan `npm run test:db -- up`, que restaura un backup verificado
que un runner no tiene. Meter la suite entera produciría rojo por falta de base
—el fallo que hace que alguien borre el workflow— y eso ya está razonado en
`PENDING_IMPLEMENTATIONS/006`.

Así que la distinción «hermético / necesita base» es real. Lo que falla es
**mantenerla a mano**.

## Es el modo de fallo del día, otra vez

Descartar en silencio. La misma forma que `findUniqueOrThrow` fuera de la
enumeración de métodos de Prisma, que `MyNectarPage` archivado bajo `dynamic`, y
que la sección duplicada por una fusión limpia: **el resultado cuadra**. Un
recuento que no sube no llama la atención de nadie.

Y la enumeración no converge: el siguiente test hermético vuelve a caerse fuera.

## Qué haría falta, y la pregunta que hay que contestar antes

La comprobación que se quiere es: *todo archivo de test que no necesite base de
datos está en la lista de `ci.sh`*. Escribirla exige decidir **cómo se reconoce
que un test necesita base**, y las opciones no son equivalentes:

- **Por convención de ruta** (`tests/hermeticos/**`). Barato y exacto, pero mueve
  archivos y cambia imports en toda la suite.
- **Por marca en el archivo** (`// @hermetico` o un `describe` etiquetado).
  Ningún archivo se mueve; la marca hay que ponerla, y olvidarla devuelve el
  mismo silencio — sólo que ahora el guardia puede exigirla en los archivos
  nuevos.
- **Por lo que importa** (¿alcanza `lib/db`?). Es la propiedad de verdad y no
  una forma escrita, pero es exactamente el análisis de imports transitivos que
  `tests/arquitectura/acceso-a-datos.test.ts` ya hace a medias — y su propia
  historia dice lo caro que sale hacerlo con expresiones regulares.

**No elegir por elegancia.** La tercera es la correcta y la más cara; la segunda
compra el 90 % por una fracción. Es una decisión del dueño, no un detalle de
implementación.

## Cómo se sabrá que funcionó

La mutación es directa y hay que hacerla: **añadir un archivo hermético nuevo
sin tocar `ci.sh` y ver la compuerta en rojo.** Hoy sale verde.

Y un control positivo, porque esta comprobación es de las que pasan por no
encontrar nada: afirmar que la lista de archivos herméticos detectados **no está
vacía** antes de compararla.
