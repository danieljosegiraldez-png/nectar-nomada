# 007 · El inventario de acceso lee texto, no programa

**Estado: no empezado.** Es la respuesta estructural a un límite **medido**, no
supuesto. Lo pidió la revisión independiente del 2026-08-31 después de que su
segunda pasada encontrara, otra vez, el mismo defecto en otra forma.

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

## Por qué no se hace ya

Porque el detector actual, con lo arreglado el 2026-08-31, **no tiene ningún
fallo conocido sin escribir**. Los que quedan están documentados con su
mutación. Reescribirlo hoy sería cambiar una herramienta que funciona por una
mejor sin que nada lo esté pidiendo.

Lo que **sí** lo pediría, y conviene reconocerlo cuando pase:

- Aparece un quinto defecto de la misma familia. Van cuatro en un día.
- Alguien va a apoyarse en el conjunto fijado para una decisión que importe
  —una auditoría, un acceso concedido a alguien de fuera—, y entonces «208
  operaciones» tiene que significar 208 caminos y no 208 fragmentos de texto.
