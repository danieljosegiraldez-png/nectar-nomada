# 022 · Una limpieza se pone roja por basura de otra suite, y el carril entero con ella

**Estado: abierto.** Es un defecto **medido**, no supuesto, encontrado el 2026-10-03 corriendo el
carril con base de `PENDING_IMPLEMENTATIONS/010` Parte A. **El número es provisional**: se asigna de
verdad al fusionar, porque dos sesiones que numeran a la vez chocan.

## Lo que pasó, y por qué es peligroso

El carril con base salió con **código 1** y su veredicto decía:

```
 Test Files  1 failed | 198 passed (199)
      Tests  2349 passed (2349)
```

**Cero `×`.** Todas las pruebas pasaron y el carril está rojo: la suite
`tests/equipos/datosDeEquipo.test.ts` **murió en su limpieza**, no en una aserción. Es exactamente
la forma que `~/.claude/CLAUDE.md` avisa de leer — «una suite puede decir "2273 passed" con cero
`×` y morir en su limpieza, y eso sólo aparece en `Test Files`» — y si se lee sólo la línea `Tests`,
este rojo pasa por verde.

## El error, literal

```
PrismaClientKnownRequestError:
Invalid `prisma.scope.deleteMany()` invocation:
Database error. Code: `23001`. Message: `update or delete on table "scope" violates RESTRICT
setting of foreign key constraint "assignment_scope_id_fkey" on table "assignment"`
  ❯ Object.limpiar tests/helpers/fixturesDeCatalogo.ts:121:11
  ❯ tests/equipos/datosDeEquipo.test.ts:47:3
```

## El mecanismo, medido

`fixturesDeCatalogo.limpiar()` (`tests/helpers/fixturesDeCatalogo.ts:103-127`) borra en cadena y
**sigue aunque un paso reviente**, acumulando errores — y al final **relanza el primero**, «para no
enmascarar el fallo». El paso que revienta es el tercero:

1. `auditEvent.deleteMany` de **sus** cuentas,
2. `assignment.deleteMany` de **sus** cuentas,
3. `scope.deleteMany` de **sus** ids ← aquí salta el `RESTRICT`.

Para que salte, un `Assignment` que **no es de sus cuentas** tiene que apuntar a uno de sus
`scope`. Y eso puede pasar porque **`Scope` es único por referente**:

```prisma
@@unique([scopeType, scopeRefId])
```

Así que una fila de `scope` **se comparte** entre suites que asignen sobre el mismo referente. El
fixture ya se cuida del caso obvio —el ámbito `platform`, cuyo `scopeRefId` es `NULL`, viene de
`ambitoDePlataforma()` y **no entra** en su lista, con el motivo escrito: «es compartido, y borrarlo
se lo llevaría de otras suites»— pero no de un `scope` de **ubicación** compartido.

## Lo que NO es, comprobado

**No lo causó el cambio que lo destapó.** Medido con control que discrimina:

| qué se midió | resultado |
|---|---|
| ¿lee `datosDeEquipo.test.ts` o `fixturesDeCatalogo.ts` algo del cambio de la Parte A? | **no**: 0 menciones de `apiario-campo`, `mapaDelProtocolo`, `protocoloDeCampo` y `MAPA_DEL_PROTOCOLO` |
| control de que ese grep lee el archivo | **sí**: 4 `describe(`, 10 `it(`, 1 `limpiar` |
| ¿pasó la misma suite, en el mismo carril, horas antes? | **sí**: la corrida de la ficha 019 dio **199/199 archivos** |

El primer control importa: la primera versión usó la palabra `scope`, que da **0** en ese archivo
—la limpieza vive en el helper—, así que los cuatro ceros no medían nada. Con una palabra que tiene
que estar, miden.

## Qué haría falta para arreglarlo

**Lo que falta medir primero, y es una línea:** cuál es el `Assignment` que bloquea. El `catch` del
helper se traga el contexto; con imprimir la cuenta y el `scope` del bloqueo se sabe **qué suite**
lo dejó, y sin eso cualquier arreglo es a ciegas.

Tres caminos, y el tercero es el que esta casa suele preferir:

1. **Que `limpiar()` borre los `Assignment` que apunten a sus `scope`**, no sólo los de sus cuentas.
   Arregla el síntoma y **esconde** que otra suite dejó basura.
2. **Que cada suite limpie lo suyo.** Correcto y disperso: hay que encontrar la culpable.
3. **Que `limpiar()` distinga «no pude borrar porque alguien lo comparte» de un fallo de verdad**, y
   lo diga sin poner roja la suite. Un `scope` compartido que sobrevive no es un defecto: es lo que
   `@@unique([scopeType, scopeRefId])` implica. Lo que sí es un defecto es que la suite que lo
   descubre sea la que se pone roja.

**No se toca sin decidirlo**, porque el helper relanza **a propósito** —«para no enmascarar el
fallo»— y quitar eso cambiaría una decisión escrita.

## Cómo comprobar que se arregló

El carril con base da **código 0** con las dos líneas de acuerdo —`Test Files` y `Tests`— en dos
corridas seguidas sobre bases desechables **distintas**. Una sola no vale: esto es intermitente, y
una corrida verde de algo intermitente es la lectura que halaga la hipótesis.

**Y su flip-test:** dejar a mano un `Assignment` que apunte a un `scope` del fixture y comprobar que
lo que falla **nombra la suite que lo dejó**, no la que limpia.

## Por qué esto no es menor

Un carril que se pone rojo por basura ajena **enseña a relanzar**. La próxima sesión que vea este
rojo va a volver a correr el carril, le va a salir verde, y va a fusionar — y ese hábito es
exactamente lo que vuelve inútil una compuerta. El coste no es el minuto de la corrida: es que el
rojo deja de significar algo.
