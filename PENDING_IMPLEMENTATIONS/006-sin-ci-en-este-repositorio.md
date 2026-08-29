# 006 · Este repositorio no tiene CI

**Estado:** señalado, no hecho. Es una decisión de proceso de Daniel.

**Lo comprobado el 2026-08-28:** no existe `.github/workflows/`. El único check
que ve una PR aquí es el build de Vercel. Es decir: **`npm run typecheck`,
`npm test` y `npm run check:state` no corren automáticamente nunca**, ni en una
PR ni al fusionar.

**Por qué importa hoy y no en abstracto:** esta misma sesión encontró `main` con
18 errores de `tsc` (cliente de Prisma viejo). Nadie lo estaba viendo porque
nada lo mira. La disciplina de envío dice «typecheck antes de fusionar», y hoy
eso depende enteramente de que alguien se acuerde.

**Por qué no lo añadí:** montar CI cambia el proceso de fusión de Daniel y gasta
minutos de Actions de su cuenta. Además `npm test` exige una base local, así que
un workflow ingenuo se pondría rojo por falta de base de datos — y un guardia
que no puede pasar es peor que ninguno.

**Qué haría falta, si se decide hacerlo:**

1. Un job barato sin base de datos: `npm run verify`
   (typecheck + `check:state` + lint). Eso ya atrapa lo de hoy.
2. Los tests que necesitan base van aparte, con `npm run test:db -- up`
   restaurando el backup verificado más nuevo, o no van.
3. El repositorio del sitio público ya lo hace así: un solo paso que corre
   `npm run verify`, para que la compuerta de CI y la local no puedan separarse.
   Enumerar los pasos uno a uno fue precisamente lo que las separó allí.
