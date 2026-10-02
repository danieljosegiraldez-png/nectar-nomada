# 017 · Un objetivo `final` se usa como banda de toda la trayectoria: una evolución normal se lee como desviación continua

**Estado: hecho**, el 2026-10-02. Encontrado el 2026-10-01 por el CLI de Codex auditando el diff del
PR #573, y **no estaba reproducido en el navegador**: era propagación leída en el código. Se reprodujo
al arreglarlo, con el render del servidor, y la cifra que la ficha predecía salió exacta —«2 lecturas
fuera del rango de la receta» sobre un descenso de pH que cumple su meta final—.

**La ficha daba dos opciones y Daniel eligió la primera**, con un matiz de dominio que cambió el
diseño a mejor: no son dos casos sino **tres momentos**, porque en lavado y natural el Brix o el pH se
miden **una vez** —en la cereza o el mosto, antes de la cama— y después sólo se sigue la humedad. Un
objetivo `initial` era el caso más común de los tres y el código **lo tiraba**: medido, `initial` no
aparecía ni una vez en todo el camino de la curva (control: `during` y `final`, una cada uno).

**Lo que se hizo**, en `lib/beneficio/curvaDeLote.ts` y sus dos consumidores:

- El momento viaja con el objetivo (`ObjetivoDeCurva.momento`) y decide el **alcance** de la banda:
  `during` cubre la trayectoria y juzga todas las lecturas; `initial` y `final` son eventos de un
  instante, se marcan en su extremo del eje y juzgan **una**.
- `elegirObjetivo` recibe **todos** los objetivos declarados y dice cuál rige. Antes la capa de base
  hacía `find("during") ?? find("final")` y **elegía en silencio**: con un `initial` y un `final`
  declarados, hoy no elige ninguno y la pantalla lo dice.
- `juicioDeBanda.total` pasó a ser **cuántas lecturas se juzgaron**, no cuántas hay.
- Un empate de instante no se desempata (`extremo_ambiguo`), igual que `ultimaLectura` desde el #596.

**Tres cosas que esto enseñó y no están en el diff:**

1. **`readingsForMoment` no se podía reusar**, aunque parezca la misma regla: para `initial`/`final`
   toma `ordered[0]` y `ordered[last]` **sin comprobar el empate**, que es exactamente el defecto que
   el #596 cerró al medir que 7 de 10 lotes reales tienen todas sus lecturas en el mismo instante.
   Unificarlas lo habría reintroducido. Queda dicho en el comentario de `indiceDeLaUnicaEnElExtremo`
   para que la próxima sesión no «limpie» esa duplicación aparente.
2. **La elección viaja DENTRO de la curva, y eso fue una corrección a mitad de camino.** Primero fue
   una prop aparte del componente; con esa forma, una pantalla podía recibir una banda dibujada y una
   elección que la contradijera, y nada lo cazaba. Con el array de objetivos como entrada, esa
   contradicción deja de ser representable.
3. **El guardia de pantalla encontró dos defectos en el arreglo mismo**, los dos invisibles a las
   pruebas de la función pura: la descripción accesible del SVG seguía diciendo «0 lecturas fuera del
   rango» con una sola lectura juzgada de tres, y el mensaje de «dos objetivos declarados» **no se
   pintaba nunca** porque la rama de `sin_banda` cortaba la cadena antes de llegar a él.

**La prueba del carril con base era la documentación de la regla vieja.** `datos-del-tablero.test.ts`
tenía un caso llamado «nunca un objetivo `initial`: si es el único, no hay banda» y otro «sin
`during`, la banda es la `final`» — las dos mitades del defecto, en verde. Reescritos.

Lo que sigue abajo es el hallazgo tal como se midió el 2026-10-01.

---

**Estado: abierto.** Encontrado el 2026-10-01 por el CLI de Codex, auditando el diff del PR #573
(el tablero del beneficio) antes de la fusión. **No está reproducido en el navegador**: es propagación
leída en el código.

## La causa

`curvaDeUnLote` (`lib/beneficio/datosDelTablero.ts`, :453) elige el objetivo así:

```ts
const meta = delaFase.find((t) => t.moment === "during") ?? delaFase.find((t) => t.moment === "final");
```

Si la receta no declara un objetivo `during` para esa variable y esa fase, **cae al `final`** y la curva
juzga **todas** las lecturas contra esa banda. Pero un objetivo `final` describe **dónde debe terminar**
la variable, no por dónde debe pasar: un pH que baja de 5,6 a 4,3 a lo largo de la fermentación está
**cumpliendo** una meta final de 4,0–4,6, y la curva lo pintaría como lecturas fuera de rango durante
casi todo el recorrido.

Además **`moment` se pierde en el resultado**: el objeto que se pasa a `curvaDeLote` es sólo
`{ minValue, maxValue, targetValue }` (:458-464). La pantalla no puede decir «esta banda es la meta
final» porque nadie se lo dijo; la presenta como la banda del proceso.

## Lo que el repositorio ya distingue, y esta pieza no

`lib/traceability/processTargets.ts` **sí** separa los momentos: `readingsForMoment` (:105) da a
`during` **todas** las lecturas, a `initial` la **primera** y a `final` **sólo la última**. Es decir:
para el resto del sistema, un objetivo `final` se compara con **una** lectura, no con la trayectoria.

## Lo medido, y con qué control

| qué se midió | resultado |
|---|---|
| `curvaDeUnLote` cae a `final` si no hay `during` | **sí**, leído (`datosDelTablero.ts:453`) |
| `moment` viaja al `curvaDeLote` | **no**: sólo `minValue`/`maxValue`/`targetValue` (:458-464) |
| `processTargets.ts` trata `final` como una sola lectura | **sí** (`readingsForMoment`, :105-114) |
| control: `during` sí se toma completo cuando existe | **sí**: el `find` lo prefiere |

## El coste

Una **evolución normal hacia el objetivo se lee como desviación continua**: el operario ve rombos de
«fuera del rango de la receta» en lecturas que son exactamente lo esperado a mitad de proceso. Es el
fallo opuesto al que este tablero existe para impedir —callar lo que se salió—: aquí se **grita** lo
que no se salió, y se aprende a ignorar la pantalla.

## Qué haría falta para arreglarlo

Dos opciones, y es decisión de producto:

- **No dibujar banda con sólo `final`**: la curva dice «esta variable sólo declara meta final» y
  marca esa meta como una **línea o un punto al final del eje X**, no como una banda sobre toda la
  trayectoria; las lecturas intermedias no se juzgan.
- **Comparar sólo la última lectura** contra la meta `final`, con la misma regla de
  `readingsForMoment`, y juzgar las intermedias sólo si hay un `during`.

En los dos casos, que `moment` llegue a `Curva` (por ejemplo en `Banda`) y que la pantalla lo diga.

## Cómo comprobar que se arregló

Receta con **sólo** un objetivo `final` (pH 4,0–4,6) y lecturas 5,6 → 5,0 → 4,3: la pantalla **no**
debe contar «2 lecturas fuera del rango»; con el mismo objetivo declarado como `during`, sí. Flip-test:
volver al `?? final` sin distinguir debe hacer caer la primera. Control: una lectura final **fuera**
de la meta final sigue marcándose.
