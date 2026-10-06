# Última ronda — T00, T05 y T10 (R26, R27 y la parte de T05 de R28)

2026-10-05, segunda pasada («Try again»), de las ~19:10 a las 22:20. **Había ya una pasada anterior** (informe de las 12:42, ediciones de las 12:40 en los tres archivos). No la di por buena por su línea de estado: volví a medir
cada cosa que decía, reproduje sus arneses y, al hacerlo, `main` se movió cuatro veces (de `7dd95ab8` a `127c04f8`, con #646 dentro), así que además actualicé T00 y T05 a lo de hoy. Sólo se editaron `tareas/T00.md`, `tareas/T05.md` y
`tareas/T10.md` (T10 **no** cambió en esta pasada: sigue tal como la dejó la anterior, y su arnés lo reproduje). No se tocó git (HEAD `06b2e2e9`, `git status` vacío antes y después, remoto de la rama `06b2e2e9`; sólo `git fetch` de `main` y de
la rama de #646, que mueve referencias remotas y nada más), ninguna base, ni `$OUT` ni `$GUIONES` del plan: todo lo que se corrió escribió en el scratchpad de la sesión (`…/scratchpad/rf/`).

## Qué verifiqué por mi cuenta (no leído del informe anterior)

**R26 — prosa de R1 y fila de flip del bloque de empuje.** Prosa vieja (`le quitó el seguimiento`, `segundo de los tres empujes`, `desde el empuje de la tarea 5`, `todo se empuja al final`): **0** en T05 y T10; la nueva
(T00 primero, T05 segundo, T10 tercero, T15 cuarto) está, y T10 y T05 dicen lo mismo. Los dos bloques de empuje y sus arneses de remoto de juguete, **extraídos de los archivos y corridos bajo zsh**:

| variante | T05 | T10 |
|---|---|---|
| `feliz` (control) | `push=0`, «LLEGÓ», el remoto cambia y es el HEAD de A | `push=0`, `push-verificado=SI`, ídem |
| `ajeno` (B empujó antes) | código 1, `ABORTA=1`, `push=NINGUNO`, sin `…-push.txt`, remoto **sin cambios** | ídem |
| `sin-guarda-antecesor` (21→20 líneas) | `push=1`, `PARA=1`, código 1, remoto sin cambios | ídem (22→21) |
| `sin-ninguna-guarda` (21→19) | `push=1`, `PARA=0`, «NO LLEGÓ», remoto sin cambios | `push-verificado=NO` (22→20) |

Cada línea a quitar aparece UNA vez (1 y 1); el sha del bloque cambia en las variantes mutadas; el `cd` real no queda en el bloque; ninguna usa `--force`. Repetido al final con los archivos ya editados: igual. Filas 30–32 de T05 y 34–36 de
T10 existen una vez cada una y la numeración sigue (`…treinta y seis filas`).

**R27 — T00 paso 9.** El guion `t00-prs.sh` y su lista (56 archivos A, 10 B), **extraídos del propio T00** y corridos contra el clon, con tres controles: la ventana de #626 da 38 archivos y `lotProcess.ts por #626=1`; los 66 archivos
existían en `50cbfda3` (0 ausentes); el cruce con las secciones «Archivos» de las tareas sólo echa en falta el paquete y `eslint.config.mjs` (los que la 2a LEE). Las cinco variantes de flip, repetidas hoy:

| mutación | resultado (sobre `c73b34ef`) |
|---|---|
| camino feliz | `PRS: TOCAN · 5 de 14 fusiones … · 4 sólo B · 2c: tanques/traslado/secado=NO_ESTA` |
| sin `--first-parent` | `SIN_CONTROL` (`lotProcess.ts por #626=0`; cuenta 60 commits en vez de 14 fusiones) |
| ventana vacía | `NINGUNO · 0 de 0`, control en 38 y 1 (un «ninguno» que sí vale) |
| errata en la lista (`lotProces.ts`) | `SIN_CONTROL` nombrando el archivo |
| quitar `app/lots/[id]/page.tsx` | `TOCAN` baja a `3 de 14`, y el cruce con las tareas lo nombra |
| señal de la 2c con contenido que SÍ entró (`procesoQueCubre`, ventana de #626) | `ENTRÓ (PR #626)` |

Comprobado aparte con `git diff --name-only <fusión>^1 <fusión>` sobre las 14 fusiones: las de **ancla** son #642, #644, #645, #648 y **#646**; sólo **final** (B): #641, #643, #639, #652; nada de la lista: #647, #621, #649, #653, #651. Los tres PR previos de
la 2c (tanques, traslado, secado) **no han entrado ni están abiertos** (la rama `equipos-arreglos` no existe en el remoto y la local sigue en `50cbfda3`). El resultado queda en `$OUT/t00-prs.txt` y `t00-prs-por-archivo.tsv` para T07/T11/T13.

**R28 (T05) — cifras de `abrirProcesoDePrueba`.** `git grep` sobre `origin/main` (`c73b34ef`; igual sobre `7dd95ab8` y `7c56d8c8`): **148 líneas, 149 apariciones, 14 archivos, 7 con receta en la misma línea (141 sin), definición 1**, `aperturaDeProceso.test.ts:172`
con dos; sobre la rama (`06b2e2e9`, sin unir) 147/148 (la llamada que #644 sumó en `samples.test.ts`). Las 21 `abrirProceso(` directas en pruebas y las 3 de control, iguales. T05 dice 148/149/141: coincide.

**La clave del tueste de T05 (lo que la pasada anterior decidió por su cuenta).** #644 trajo `CODIGOS_DE_TUESTE_CON_FRASE` y un guardia que exige que toda clave `error_roast_*` sea de esa lista. Reproducido en una copia aislada con `messages`, `roasting.ts` y
el guardia de `main`: control **6/6**; con `error_roast_version_no_publicada` y el `throw` de T05, **1 de 6 cae («no hay ninguna frase huérfana, en ninguno de los dos idiomas»)**; con `error_tueste_version_no_publicada`, **6/6**. El renombrado de T05
es correcto y su fila 33 describe la mutación real. Las tres anclas de `roasting.ts` y la de `friendlyError` casan UNA vez sobre el árbol con #646 (el control de ancla inventada da 0).

## Lo que cambié en esta pasada

**T00** (de 120.421 a 126.721 bytes; ningún bloque de código cambió salvo tres `echo` de cifra (commits que `main` le lleva a la rama, migraciones, organizaciones que borran las pruebas): los tres guiones que T00 escribe son idénticos byte a byte a los que extraje y corrí al empezar, `bash -n` da 0 en los 22 bloques, 0 comillas invertidas fuera de comentarios, UTF-8 estricto válido):
- **#646 entró en `main`** (`ab94ff09`, 2026-10-06T02:59Z): R19 ya no dice «OPEN/NO_ESTA». Medido: sobre el árbol de `ab94ff09` el guion da **`646: EN_ARBOL`** (6, 7, 2; lectores 3) y sobre la rama de hoy sin unir sigue **`NO_ESTA`**, con su control (la rama
  fusionada, `becfe806`: 6/7/2) en más de 0. El párrafo «Esperado» de R19 se reescribió con las dos lecturas y lo que significa para T11/T13; nueva **Duda 7**.
- **R27 al día**: 14 fusiones, `5 de 14`, 4 sólo B, fila nueva de #646 en la tabla (seis archivos de ancla, qué tareas los editan), abiertos hoy (#650, #654), filas de flip con las cifras de hoy.
- **Anclas**: las 27 casan; **una cambia** además del esquema: `endDryingRun(` de `drying.ts` pasa de 371 a **377** (#646 sólo añadió seis líneas de comentario). Medido con las 27 anclas extraídas del bloque y corridas sobre `git archive`.
- **Cifras que `main` movió y la pasada anterior dejó viejas**: commits que `main` le lleva a la rama **37 → 86** (72 con `7c56d8c8`); `--llamadores` del inventario **94 → 99** (625/170 sigue igual); lista de la línea base **110 → 113** (74 herméticas, 39 con base; nueve nuevas
  tras unir y ninguna desaparecida: se suman `el-guardia-es-un-simbolo`, `el-inventario-ve-toda-forma` y `desenlaceDelSecado`; el mismo bloque sobre `a8f50df7` reproduce 110, y la reconstrucción sobre `13fb6a8f` sigue en 104); carril hermético **206/212 de 418 → 209/214 de 423** (calculado con
  la fórmula de `ci.sh`, no corrido; la misma fórmula sobre `a8f50df7` reproduce 206/212/418); FK-ORG: los mismos 12 archivos y las mismas líneas (155 borran organización, no 154: `loteCitadoExigeSuPermiso`, que no crea recetas); paquete de referencia 29 archivos y los dos sha iguales.
- **«Conflictos con el esqueleto»** decía que el esqueleto seguía diciendo «rebasa» y «quita el seguimiento»: **ya no es cierto** (el controlador lo corrigió; comprobado con `grep`); la sección dice ahora «ninguno vigente».
- Cabecera, paso 2 y sus `echo` (86 commits) con el sha fijado.

**T05**: las cinco citas de sha de R28 pasan a `c73b34ef` (medidas ahí), y una línea en su bloque de R28 deja constancia de la reverificación con #646 dentro (rama genérica del tueste en `friendlyError`: línea 308→309; anclas siguen únicas; inventario igual). UTF-8 válido, 134 fences,
arnés de empuje reproducido con el archivo final.

**T10**: sin cambios en esta pasada; arnés reproducido (tabla de arriba). T10 no edita `app/actions/traceability.ts` (lo dice: «No se toca»), así que #644 y #646 no la afectan.

## No aplicado, o fuera de lo mío (decide el controlador)
1. **T14**: #642 movió la prueba del inventario del router de 118 a **119** entradas; el ancla de T14 (`toContain("118 entradas")`, 3 menciones hoy) **sigue sin casar** y su resultado es 121, no 120. T14 PARARÁ en su paso 1.
2. **T13 no corre `t00-646.sh`** (T11 sí): ahora que #646 está en `main`, el veredicto tras la unión es `EN_ARBOL`. T13 trae su propia medición contra la rama de #646 («R19») y dice que sus anclas casan con y sin #646; no lo comprobé ahí (no es mi archivo). T07, T11 y T13 tampoco corren `t00-prs.sh`; leen `t00-prs.txt` como aviso.
3. **Cifras viejas de `messages`** (1464 claves / `:1891`) siguen en T02, T03, T04, T07, T08 y T11 (T08 también `:1891`): hoy son **1482 y `:1911`** en los dos idiomas. En T07 y T08 el guion imprime la última clave y no depende del número.
4. **Alternativa para la frase del tueste** (T05, Dudas 5): en vez de `error_tueste_version_no_publicada`, añadir `version_no_publicada` a la lista de #644, cambiar su `toBe(6)` a 7 y quitar la rama de `friendlyError` (se van las filas 23, 24 y 33). Toca un guardia y `roasting.ts`; no se hizo.
5. **Sin ejecutar T00/T05/T10 de verdad ni tocar ninguna base**: todo se midió sobre el clon, copias del scratchpad y remotos de juguete. Los números que dependen de correr vitest (los 113 de la línea base, el carril con su N) son los que el propio T00 imprimirá.
6. **Esto caduca**: `main` va en `127c04f8` (#655, sólo `SESSION_STATE.md` y su archivo: no mueve nada de lo anterior salvo «88 commits» en vez de 86). Cada cifra de T00 lleva su sha; una diferencia se anota, no se arregla.
7. Un detalle de método, por si alguien repite mi medición: `iconv … > /dev/null` sale 1 sobre T00 aunque el archivo sea válido (con salida a archivo copia los 121.643 bytes idénticos; el control con un byte inválido también da 1: ese instrumento no discrimina). La validez se midió con la decodificación estricta de Python, con control que falla.

## Archivos
- `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a/.superpowers/plan-2a/tareas/T00.md`
- `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a/.superpowers/plan-2a/tareas/T05.md`
- `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a/.superpowers/plan-2a/tareas/T10.md` (sin cambios hoy)
- Pruebas y copias de medición, en el scratchpad de la sesión: `…/scratchpad/rf/` (arneses, `r27/`, `g644/`, árboles `git archive` de `ab94ff09`).
