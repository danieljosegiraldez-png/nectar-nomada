# 007 · El inventario de acceso lee texto, no programa

**Estado: el escalón 1 está HECHO** — [#639](https://github.com/danieljosegiraldez-png/nectar-nomada/pull/639),
2026-10-04, plan en `docs/superpowers/plans/2026-10-04-el-inventario-con-ast.md`.
**El escalón 2 sigue abierto y sigue siendo decisión de Daniel.** Lo medido al
cerrarlo está al final, en «Cómo quedó».

Es la respuesta estructural a un límite **medido**, no supuesto. Lo pidió la
revisión independiente del 2026-08-31 después de que su segunda pasada
encontrara, otra vez, el mismo defecto en otra forma.

## El límite, dicho con precisión

`scripts/inventario-de-acceso.mjs` (338 líneas) reconoce **formas escritas**:
troceo por expresiones regulares de declaración, guardias por convención de
nombre, imports por el texto del `import`. Funciona, y ha encontrado cosas
reales. Pero cada vez que falla, falla igual.

Cuatro defectos en un solo día, todos la misma forma:

| Defecto | Cómo se veía | Cómo falló |
|---|---|---|
| `findUniqueOrThrow` no casaba con la enumeración de métodos | 13 archivos | **Descarte silencioso**: la operación no existía |
| El cliente entre paréntesis, `(tx ?? prisma).auditEvent` | `lib/audit.ts` entero | Descarte silencioso |
| Consulta delegada a un ayudante **no exportado** | forma normal en TS | Descarte silencioso |
| `export default async function` no reconocido | `app/my-nectar/page.tsx` | **Identidad falsa**: tres consultas atribuidas a `dynamic`, una constante de configuración |

Los tres primeros dejan huecos. **El cuarto es peor**: no deja hueco, deja una
fila con nombre equivocado que cuadra en todos los recuentos. Un cambio inocuo
—mover o quitar la constante de al lado— habría trasladado tres consultas a otra
entrada del allowlist sin que nada avisara.

Cada arreglo fue enumerar un caso más. **La enumeración no converge**: el
siguiente método de Prisma, la siguiente forma de declarar, el siguiente alias
del cliente vuelven a fallar del mismo modo.

### Un quinto caso, del 2026-09-11: un COMENTARIO decide la clasificación

`const principal = /\buserAccountId\b/.test(o.cuerpo)` (línea 247) es una
coincidencia de texto sobre el cuerpo troceado, y el troceo arrastra los
comentarios. `lib/apiary/irregularidades.ts` tiene una función **sin un solo
argumento**:

```ts
export async function irregularidadesOfrecidas() {
```

y se clasificó como **«recibe principal, sin guardia visible»**, porque el
comentario de la función de abajo decía *«No recibe `userAccountId` y no
autoriza»*. Reproducido en una línea: quitando esa palabra del comentario,
`principal` pasa de `true` a `false` y la clase a «depende del llamador», que es
la correcta.

**Por qué este caso es distinto de los cuatro de arriba, y peor en un sentido:**
los otros fallan por cómo está escrito el *código*. Éste falla por cómo está
escrita la *prosa*, así que documentar bien una función la mueve de clase. Y el
arreglo a mano —reescribir el comentario— es indistinguible de escribir prosa
para complacer a un regex: aquí dio la clasificación correcta, pero el día que el
texto y el código discrepen de verdad, el detector creerá al texto.

Un AST lo cierra sin enumerar nada: los parámetros de una función son un nodo,
no una palabra.

## Qué arreglaría un AST, y qué no

TypeScript ya es dependencia del repositorio (`typescript ^6.0.3`), así que esto
**no añade paquetes**.

**Sí arregla, con `ts.createSourceFile` (sólo sintaxis, barato):**

- **Límites de función de verdad.** Se acabó el troceo hasta la siguiente
  declaración de nivel superior, y con él los descartes silenciosos y las
  identidades falsas.
- **Identidad estable.** Cada operación es un nodo, no un fragmento de texto
  entre dos coincidencias.
- **Toda forma de declaración**: `export default`, métodos de clase, funciones
  flecha asignadas, exportaciones renombradas. Sin enumerarlas a mano.
- **Llamadas y accesos como nodos**, así que `(tx ?? prisma).auditEvent.create`
  y `cliente.$queryRaw` dejan de ser casos especiales.

**Sí arreglaría, pero exige un `Program` con comprobador de tipos (caro):**

- **Identidad de símbolo del guardia.** Hoy `require\w*(Access|Admin|Override)`
  es una convención de nombres: una función que no hace nada con ese nombre
  cuenta como guardia. Está comprobado por mutación y escrito en
  `docs/arquitectura/inventario-de-acceso.md`. Resolver el símbolo hasta el
  servicio de autorización cierra eso, y **sólo eso** lo cierra.

**No arregla, y conviene no confundirlo:** que el guardia sea **el debido**. Un
`requireLotAccess` con el permiso equivocado seguiría pasando con cualquier AST.
Esa sigue siendo la pregunta grande, y es la de `005`.

## Los dos escalones, y cuál recomiendo

1. **Sintaxis con AST** — sustituye el troceo y la detección de accesos. Cierra
   las tres familias de descarte silencioso y la de identidad falsa. Coste
   moderado, sin dependencias nuevas, sin cambiar lo que el inventario
   *significa*. **Este es el que recomiendo.**
2. **Comprobador de tipos** — resuelve los guardias hasta su símbolo. Cierra la
   confianza en la convención de nombres. Más lento en cada corrida, y hay que
   decidir si la compuerta puede permitírselo en CI. **Este pide una decisión
   del dueño**, no sólo trabajo.

Un escalón sin el otro es coherente: 1 sin 2 deja el inventario honesto sobre
qué opera, confiando aún en los nombres de los guardias.

## Cómo se sabrá que funcionó

**Las mutaciones ya existen y hay que volver a pasarlas todas** — están en
`tests/arquitectura/acceso-a-datos.test.ts` y en el historial del 2026-08-31:
ayudante privado, homónimo no importado, homónimo importado desde un módulo que
no guarda, `export default`, operación nueva sin guardia, entrada podrida, razón
vacía.

Y una nueva, que es la prueba de que el AST valió: **mover una consulta a una
forma sintáctica que hoy nadie ha enumerado** —un método de clase, una función
flecha exportada— y ver que la compuerta la sigue viendo. Con el detector actual
no la ve. Ése es el flip-test que decide.

**Antes de empezar, correr el inventario y guardar la salida.** El AST cambiará
recuentos y clasificaciones; sin la línea base no se distingue «lo arreglé» de
«lo moví».

## Por qué no se hacía (histórico, y se dejó porque enseña algo)

**Esta sección decía que no se hiciera, y su propio criterio ya estaba cumplido
cuando se leyó el 2026-10-04.** Decía *«Van cuatro en un día»* — y treinta líneas
antes, en este mismo archivo, estaba documentado **un quinto caso**. Una ficha
puede contradecirse a sí misma y seguir leyéndose como una instrucción: el
párrafo de abajo se conserva tal cual, con esta nota encima, porque la forma del
error vale más que el texto.

Y el quinto se había «arreglado» **reescribiendo el comentario** de
`lib/apiary/irregularidades.ts` —medido el 2026-10-04: ese `userAccountId` ya no
está ahí—, que es exactamente lo que esta ficha avisó que no se distingue de
escribir prosa para complacer a un regex.

### El texto original

Porque el detector actual, con lo arreglado el 2026-08-31, **no tiene ningún
fallo conocido sin escribir**. Los que quedan están documentados con su
mutación. Reescribirlo hoy sería cambiar una herramienta que funciona por una
mejor sin que nada lo esté pidiendo.

Lo que **sí** lo pediría, y conviene reconocerlo cuando pase:

- Aparece un quinto defecto de la misma familia. Van cuatro en un día.
- Alguien va a apoyarse en el conjunto fijado para una decisión que importe
  —una auditoría, un acceso concedido a alguien de fuera—, y entonces «208
  operaciones» tiene que significar 208 caminos y no 208 fragmentos de texto.

---

## Cómo quedó — medido el 2026-10-04 contra `origin/main` `966ada98d1`

**Lo que disparó hacerlo no fue una corazonada: fueron cuatro defectos medidos**,
cada uno con su control, sobre la línea base de **618 operaciones en 168
archivos** con las tres compuertas en verde:

| defecto | medición | el control |
|---|---|---|
| descarte silencioso por el nombre del receptor | **6 operaciones invisibles** en 5 archivos | el cliente se llama `db`; con cero modelos la fila se descartaba **entera** |
| la clase `guardia transitivo` no se asignaba nunca | **0 de 618**; el flip la llevaba a 66 | `locales` y `transitivo` eran la misma expresión: inalcanzable *por construcción* |
| la prosa decidía la clase | un comentario promovió **3** operaciones | y al medirlo de nuevo salieron **12**: `lots.ts:683` |
| `lastIndex` sucio en `--llamadores` | **46 → 42** «necesitan juicio humano» | las 4 que cambiaban decían `MIRAR` sobre llamadores todos en ✓ |

**El resultado:** 618 → **624** operaciones, 168 → **170** archivos, **cero
bajas**, y 14 cambios de clase que son **correcciones**. Doce venían de un
comentario de `lib/traceability/lots.ts:683` que nombra `can()`: el detector lo
contaba como llamada, `resolveLotVisibility` pasaba por «guardia directo» y
arrastraba a las once operaciones que lo llaman. `guardia transitivo` pasó de 0 a
**59**.

Entre las seis invisibles estaba **`ubicacionesEmparentadas`**, el conector del
rollup de la finca al lote, y cuatro de las seis caen en «depende del llamador»,
o sea la clase que existe para que alguien las mire a mano. Tienen su entrada en
el allowlist desde ese día.

### Lo que NO cierra, y hay que decirlo cada vez

- **El escalón 2.** `require\w*(Access|Admin|Override)` sigue siendo una
  convención de **nombres**: una función que no haga nada con ese nombre sigue
  contando como guardia. Sólo lo cierra resolver el símbolo, y eso **pide una
  decisión del dueño** por su coste en CI. 1 sin 2 es coherente.
- **Si el guardia es el *debido*.** Ficha `005`.
- **Dos mecanismos de autorización que el inventario no ve**, medidos al cerrar
  esto y escritos en `docs/arquitectura/inventario-de-acceso.md`: una página que
  autoriza **atrapando** un error de un servicio que lanza, y un **guardia en
  español** (`exigePoderAnotar`, `exigeReportarEnJornada`…). Hay **50** funciones
  `exige*` contra **18** `require*(Access|Admin|Override)`, pero la mayoría de las
  50 son **validadores** (`exigeFecha`, `exigeNombre`), así que ampliar la
  convención movería «guardia directo» de 396 a **432** por la fuerza de un
  validador de fechas — el defecto de esta ficha, amplificado. **Elegir el
  subconjunto es una decisión, no una tarea.**
- **`.call` sobre el método, el método por índice y un alias en variable.** Piden
  seguir el **valor**, no la forma. Cero apariciones hoy, y **fijadas en una
  prueba** (`tests/arquitectura/el-inventario-ve-toda-forma.test.ts`) para que
  nadie las suponga cubiertas: si alguna aparece, esa prueba falla.

### Y lo que enseñó cerrarla, que no estaba en el plan

**Usé un instrumento de ARCHIVO para una pregunta de CAMINO**, y con eso escribí
**tres razones falsas** en la allowlist — las encontró la revisión independiente,
y una cuarta salió al medir por unidad. Que un archivo tenga un guardia **no
significa que lo tenga el camino**: `floracion.ts` llama a
`ubicacionesEmparentadas` desde `floracionesDeLaParcela`, que no autoriza. El
arreglo fue a la herramienta (`unidadesQueLlaman`, y `--llamadores` responde por
unidad: `OK` 48 → 32, `MIRAR` 51 → 67), no sólo al texto.

**Y un flip-test destapó que la compuerta de cifras tenía un agujero:** quitar del
documento la fila de una clase la dejaba **en verde**, porque comparaba las filas
que existen y nunca que cada clase medida **tuviera** fila. Mi propia fila nueva
era decorativa hasta que se cerró.
