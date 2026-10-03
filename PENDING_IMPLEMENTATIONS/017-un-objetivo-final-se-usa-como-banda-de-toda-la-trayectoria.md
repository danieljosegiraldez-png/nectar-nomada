# 017 · Un objetivo `final` se usa como banda de toda la trayectoria: una evolución normal se lee como desviación continua

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
