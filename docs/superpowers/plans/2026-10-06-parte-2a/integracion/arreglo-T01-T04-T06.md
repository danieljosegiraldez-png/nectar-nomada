# Arreglo mecánico — T01, T04 y T06 (C9, C11, CI-INERTE; C10 sólo en una frase)

Hecho el 2026-10-04 sobre `recetas-parte-2a` (`da048af2`). Editados EN SU SITIO, y sólo ellos: `tareas/T01.md` (2549 → 2564 líneas),
`tareas/T04.md` (1530 → 1548) y `tareas/T06.md` (1331 → 1348). Respaldos de antes en el scratchpad de la sesión
(`…/scratchpad/arreglo-T01.antes.md`, `…T04.antes.md`, `…T06.antes.md`). Ningún `git add/commit/stash/checkout`, ningún `npm install`, ninguna
conexión a una base de datos: lo que se ejecutó fueron los bloques de las tareas contra una copia de nombres de archivo en el scratchpad,
con `git`, `npx` y `ci.sh` de mentira.

## Qué cambió

| id | T01 | T04 | T06 |
|---|---|---|---|
| **C9** (la base sale de `t00-base.txt`, por omisión `nectar_test_recetas_2a`, sombra `<base>_shadow`) | `entorno.sh` (:112-129, con la lectura en :119-126) y la línea «Consume» (:63); el `echo "base:"` imprime también la del archivo (:135) y el «Esperado» (:141) dice que una sucesora `_b`/`_c` es válida; el arnés del flip lee `PROPIA` del archivo (:2303-2305) | bloque de entorno (:104-112: `OUT` pasa antes que las URL, que ya no llevan el nombre literal) y la comprobación de existencia del flip (:1435, `datname = '$BASE'`) | la regla de la base (:87) y los **siete** bloques que fijaban URL (las líneas de `BASE` en :107, :546, :846, :872, :1069 y :1280; el de :1286 compara `datname='$BASE'`); la línea de la escotilla (:125) comprueba `$BASE`, no un literal |
| **C11** (guarda del trailer delante de `git commit -F`) | delante del único `git commit -F $OUT/msg.txt` (paso 14) + una frase en el «Esperado» | delante del único `git commit -F` (paso 13), antes del `tsc` encadenado + una frase | delante del único `git commit -F` (paso 13) + una frase que dice que **el bloque escribe el mensaje y lo commitea a la vez**, así que la sesión sustituye la última línea del heredoc ANTES de correrlo (como la primera pasada de T15, el `ABORTA` es a propósito) |
| **CI-INERTE** | **ya estaba** en el método corregido (paso 12); no se tocó | paso 11: `grep -c <archivo> t04-ci.txt` pasa a reconstruir la selección de `ci.sh` (:1324-1340), con sus tres controles; las comparaciones son `-xF` (línea entera), no `recetas/versiones` a secas | paso 11: la línea «ci.sh nombra la nueva (debe ser 0)» desaparece; entra el control «está en la lista de exclusión (1)» y la igualdad de las dos N (la de «CI correrá» y la de las herméticas reconstruidas) (:1047-1059) |
| **C10** | los `.sql` de `out/` NO se mueven. Sólo la frase de :105-107 («En `out/` sólo texto») se alinea con la regla 14 ampliada y nombra los tres `.sql` | — | — |

## Cómo se comprobó (en el scratchpad: `sim2a-t01-t04-t06/`, 414 archivos de prueba vacíos con los nombres reales y la lista de exclusión real, sha igual)

El script `extraer.py` lee los bloques del propio `.md` YA editado (no una copia retecleada) y los parchea sólo en la ruta del worktree.

| qué | resultado |
|---|---|
| 13 bloques tocados (T01 ×3, T04 ×3, T06 ×7) más el arnés del flip de T01 | `bash -n` = 0 en los 14 |
| **CI-INERTE, T04, caso bueno** (la prueba apuntada) | selección 202 archivos = la de «CI correrá»; `0`, `1`, `1` |
| **CI-INERTE, T04, flip** (mutación: `tests/recetas/versiones.test.ts` sin apuntar; sha de la lista 89a52c3e → 0065da77) | selección 203; `1`, `0`, `1` → **lo delata**. El método VIEJO sobre el mismo `ci.txt`: `0` en los dos casos (inerte, medido, no supuesto) |
| **CI-INERTE, T06**, caso bueno y flip (`avance.test.ts` sin apuntar) | bueno: herméticas 202, `0`, `1`, `1`, N 202 = 202; flip: 203, `1`, `0`, `1`, N 203 = 203 → lo delata. Viejo: `0` en los dos |
| el método contra el worktree REAL (sólo `find` y `grep`) | selección 202 (T01 midió 202); `lotProcess.test.ts` (con base): 0 en la selección, 1 en la exclusión; `campos-con-dos-puertas.test.ts`: 1 en la selección, 0 en la exclusión |
| **C9**, `entorno.sh` de T01 y los bloques de T04 y de T06, sin `t00-base.txt` y con `nectar_test_recetas_2a_b` / `_c` | sin archivo: la base de siempre y su `_shadow`; con sucesora: `…_b`, `…_b_shadow`; la regex de la escotilla (`^(nectar_test|nectar_ci|nn_flip_)`) casa con las dos |
| **C11, T01 y T04**, tres casos (marcador sin sustituir / sustituido / mensaje ausente) | `ABORTA` y salida 1 sin llegar a `git commit` / commitea (`commit=0`) / `ABORTA` (falla cerrada: un archivo ausente tampoco commitea) |
| **C11, T06**, dos variantes (heredoc tal cual / con el trailer sustituido) | tal cual: `ABORTA`, salida 1, 0 llegadas a `git commit`; sustituido: salida 0, 1 llegada, el mensaje termina en el trailer sustituido |
| anclas de las ediciones (Python `str.replace`, que no interpreta el reemplazo, con aserción de «exactamente una vez» antes de cada una; T01 además con `Edit`) | todas casaron UNA vez; vallas de código (` ``` `) antes = después en las tres (136/136, 88/88, 54/54) |

## Lo que NO se hizo, y por qué

- **No se ejecutó nada contra una base** (prohibido): ni `psql`, ni `vitest` con base. Los bloques con `psql` (la línea `EXISTE`, la
  comprobación del flip de T04) sólo pasaron `bash -n`; la lectura de `t00-base.txt` que las alimenta sí se probó en seco.
- **No se movieron los `.sql` de T01 (C10)**, como ordena el encargo. Sí se tocó una frase de T01 (:105-107) que decía «en `out/` sólo
  texto» y contradecía la regla 14 ampliada y sus propios archivos; si el controlador prefiere dejar esa frase como estaba, es
  revertir esas tres líneas.
- **T01 paso 12** ya tenía el método bueno (lo escribió la integración anterior): no se tocó.

## Dudas

1. **T06, paso 11** sigue diciendo «`ci` sale 134 … es memoria (`vm_stat`)» y corre `vm_stat | head -2`. La regla global se corrigió el
   2026-10-03: `Pages free` solo no es la memoria disponible (daba 47 MB con la máquina sana); la cifra que decide es
   `memory_pressure | tail -3`. No se cambió porque no es un mecánico del encargo. Si el controlador quiere, es una línea en T06.
2. **T04:184** (un comentario dentro del archivo de prueba que se commitea) dice «la propia de la 2a (`nectar_test_recetas_2a`)». No
   aborta nada y es el nombre de la base base; se dejó tal cual para no tocar texto que se copia al repositorio.
3. **T06, paso 13** aborta SIEMPRE en la primera pasada si la sesión no sustituye el trailer antes de correr el bloque (el mensaje y el
   commit van en el mismo bloque). Es el comportamiento pedido por C11 y el mismo que tiene T15, pero T01 y T04 escriben el mensaje en un
   paso aparte y T06 no; si se prefiere la misma forma, hay que partir el bloque en dos (no se hizo: cambio de estructura, no mecánico).
