# Un guardia hermético de que las decisiones del dueño siguen discriminando

**Para qué.** Las cinco pruebas de `scripts/open-decisions.sh` dicen «cerrada»
hoy, y llevan diciéndolo desde que se escribieron. **La única respuesta que se
les ha observado es la que no distingue nada.** Una prueba que ya no sabe decir
«abierta» es indistinguible de una correcta, y el efecto es que Daniel deja de
enterarse de una decisión que le toca.

Esto no es hipotético: el `CLAUDE.md` de este repositorio registra un item
marcado como bloqueado **dos días** por una prueba que sólo sabía decir
«abierta», y el guion del sitio web registra **cuatro** casos de pruebas que
dejaron de discriminar sin que nada avisara.

## Dos huecos encadenados

1. **No hay guardia de discriminación.** `tests/open-decisions.test.ts`
   comprueba dos cosas —que ninguna prueba sale ROTA y que cada decisión
   declarada recibe veredicto— y **nunca fabrica un mundo mutado**. No puede
   saber si una prueba discrimina.
2. **Y ese test no corre en CI**, por decisión escrita en
   `scripts/pruebas-por-compuerta.txt`, grupo `maquina`:

   > «PASA sin base y aun así no debe correr en CI: lee `$HOME/.zshrc` a través
   > de su script. La regla sola lo metería, y pasaría en verde por los
   > dotfiles de quien lo corriera.»

   Es correcto: un guardia que se pone verde por el entorno de quien lo corre no
   es un guardia. Pero deja el mecanismo sin cobertura en CI.

**Un test hermético resuelve los dos.** Si el propio test fija `HOME`, deja de
leer los dotfiles de nadie y puede correr en `ci.sh` como cualquier otro.

## Cómo

Copia del árbol (`docs`, `scripts`) a un temporal, y **un `HOME` fabricado por
mundo**. El guion se corre con `HOME=<falso>` y `OD_SIN_RED=1`.

Para cada decisión, dos mundos, y se exige que el veredicto sea **distinto**:

| id | mundo que la ABRE | mundo que la CIERRA |
|---|---|---|
| P-A (mitad URL) | `HOME` sin `.config/nectar-nomada/backup.env` | `HOME` con ese archivo y `NN_HEALTHCHECK_URL=https://…` |
| P-A (mitad código) | `ping_health` borrado de `run-scheduled.sh` | script intacto + URL presente |
| P-C | sin encabezado `## ADR-… correos de las personas` | con ese encabezado |
| P-D | sin encabezado `## ADR-… huerbsch registrada` | con ese encabezado |
| P-E | `HOME` sin `.zshrc` | `HOME` con `export NN_BACKUP_DIR="…"` |
| P-B | sale a la red: no se puede abrir desde aquí | se exige que con `OD_SIN_RED=1` diga `??` y **no** cuente como cerrada |

**P-A lleva dos parejas a propósito.** Su comentario promete que «con una sola
de las dos no hay alarma»; una sola pareja dejaría la otra mitad sin cubrir, y
esa mitad puede pudrirse sola.

**Las dos direcciones, no una.** Un flip-test de un solo sentido se pone rojo el
día que Daniel reabra una decisión de verdad, y un guardia que se pone rojo por
un cambio legítimo enseña a ignorarlo. Con las dos, el estado de hoy deja de
importar.

**Mutaciones con `perl`, no `sed -i ''`.** Esa forma es la de BSD; en Linux —que
es lo que corre CI— GNU sed lee `''` como el guion. El repositorio web ya se
comió ese fallo.

## Cómo sabremos que funcionó

1. `npx vitest run tests/decisiones-discriminan.test.ts` en verde.
2. **Flip-test del propio test**, que es lo único que lo distingue de un adorno:
   volver una prueba no discriminante —sustituir el cuerpo de P-C por `exit 1`,
   que sólo sabe decir «cerrada»— y comprobar que el test **se pone rojo y
   nombra P-C**. Sin eso, no se sabe si el guardia guarda.
3. El archivo **no** entra en `scripts/pruebas-por-compuerta.txt`, así que
   `ci.sh` lo corre. Se comprueba que no lee `$HOME` real: correrlo con
   `HOME=/nonexistent` y que siga verde.
4. `npm run verify` en verde (typecheck, estado, rutas, lint).

## Lo que NO hace

- No toca `tests/open-decisions.test.ts` ni su exclusión: sacarlo del grupo
  `maquina` es otro trabajo y otra decisión.
- No cambia ninguna prueba de decisión. Si alguna no discriminara, el test lo
  diría y ese arreglo sería un PR aparte.
