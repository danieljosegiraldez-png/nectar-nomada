# El tablero del beneficio, y quién dice que una unidad está libre

**Fecha:** 2026-09-29 · **Decide:** Daniel · **Estado:** aprobado, sin construir

## Qué es

`/beneficio` es hoy un **índice de enlaces**: once entradas con su descripción y **ni una sola
cifra**. Daniel, mirándolo: «tiene las cosas correctas, pero cómo se muestran y cómo está
posicionado está mal».

Este diseño la convierte en un **tablero partido en dos** —a la izquierda lo que entra, a la
derecha lo que cabe— y baja la navegación debajo, en tres niveles por frecuencia de uso.

Y resuelve una pregunta que ningún documento había contestado y que decide la mitad derecha
entera: **qué hace que una unidad vuelva a contar como disponible.**

## Autoridad, y por qué este documento existe

Tres capas conviven sobre esta ruta:

| documento | qué aporta |
|---|---|
| `2026-09-16-tablero-del-beneficio-design.md` | once decisiones de Daniel: la cola de atención, la capacidad, la línea por etapas, la curva. **Diseñado y nunca construido** |
| `2026-09-23-operacion-integrada-beneficio-2027.md` | **manda donde corrige expresamente.** Portada por rol, capacidad con estados de recurso, informe diario |
| **este** | las cinco decisiones del 2026-09-29, que **corrigen** dos puntos del de septiembre 16 |

## Las cinco decisiones (Daniel, 2026-09-29)

| # | pregunta | decisión |
|---|---|---|
| 1 | qué libera una unidad | **una persona la pone disponible**, tras vaciar y sanitizar. Estado intermedio «por limpiar», que **no cuenta como capacidad** |
| 2 | días u horas | **el tablero en días, la faena en horas.** Ningún sitio mezcla los dos registros |
| 3 | qué porcentaje | **por conteo, con el número al lado**: «4 de 8 · 50 %». Nunca por peso, que hoy no se puede calcular |
| 4 | dónde vive la cola de secado | **resumen de capacidad en el tablero; la cola entera sigue en `/beneficio/secado`.** Cada pantalla contesta UNA pregunta |
| 5 | la configuración profunda | **una sola puerta, «Ajustes del beneficio»**, que se traga instalaciones, equipos y bandejas. Las rutas no se mueven, sólo por dónde se entra |

## Lo medido, y las dos contradicciones

**1. El tablero de septiembre calcula la liberación desde la receta, y eso es falso en el patio.**

> «**cuándo se libera** la próxima unidad según la duración declarada de su receta
> (`expectedHours`)» — `2026-09-16-tablero-del-beneficio-design.md:123`

Daniel, hoy: *«si uno termina un día, no se puede mismo día vaciar, purgar, esterilizar o
sanitizar y reutilizar por defecto; depende de quien lo ponga disponible, ya que logísticamente
es así.»*

**La especificación que manda ya le daba la razón**, y nadie lo había aplicado:

> «Las previsiones siempre distinguen dato medido, dato declarado y estimación; **nunca inventan
> un cero ni una hora de liberación**.» — `2026-09-23-operacion-integrada-beneficio-2027.md:274`

Y sus estados de recurso ya dejan sitio para esto: «abierto, reservado, en uso, fuera de servicio
o con capacidad parcial disponible» (`:272`).

**Consecuencia que hay que decir en voz alta:** con la decisión 1, el tablero **no puede decir
«se libera mañana»**. Lo más que puede decir con verdad es «**termina su secado** mañana», y esa
unidad seguirá contando como no disponible hasta que alguien la libere. Es menos vistoso y es lo
único honesto.

**2. El porcentaje que se pidió no existe en ningún documento, y sólo una de sus dos formas se
puede calcular.**

Búsqueda literal de `porcentaje de ocupación`, `% de bandejas` y `bandejas llenas` en `docs/`:
**cero**. El control dice que la búsqueda mira donde debe — «ocupación primero, kg después» sí
aparece, en `2026-09-16…:31`.

Medido en el esquema: la capacidad en kg **sólo existe en `core.equipment_model`**
(`capacity_value`, `capacity_unit`). **`Location` no tiene ninguna**, así que ni las camas ni los
cuartos pueden declarar cuántos kg caben. Un porcentaje por peso es hoy incalculable sin
inventarlo.

Un porcentaje **por conteo** sí sale de lo que ya está guardado. Medido en la base demo:

| | |
|---|---|
| bandejas registradas | **8**, de ellas **4 ocupadas** ahora (`DryingRunTray` con `hasta` nulo) |
| camas | **2**, ninguna en uso |
| instalaciones de secado | **1** |

## A. El modelo: el estado de la unidad

Tabla nueva o columna —se decide al planificar— que da a cada **cama** (`Location` de tipo
`drying_bed`) y a cada **tanque** (`Equipment` de fermentación) un estado operativo:

```
en uso  →  por limpiar  →  disponible
```

- **`en uso`** se deriva, como hoy: hay una corrida abierta sobre ella. No se declara.
- **`por limpiar`** es **automático al cerrar la corrida**. Nadie tiene que acordarse, y ése es
  el punto: el estado seguro es el que no depende de un gesto.
- **`disponible`** la declara **una persona**, con su nombre y su hora, y escribe su `AuditEvent`.

**Sólo `disponible` cuenta como capacidad.** «¿Puedo recibir?» nunca suma lo que está por
limpiar.

**Las bandejas quedan fuera de este estado, a propósito.** Una bandeja se lava con el lote y su
ocupación ya la dice `DryingRunTray`; añadirle un ciclo de tres estados sería ceremonia sin
incidente que la justifique. Si aparece uno, se añade entonces.

## B. La pantalla

### B.1 Arriba, el tablero partido en dos

**Izquierda — lo que entra.** Es lo inmediato y por eso va a la izquierda:

- las **jornadas abiertas** de este beneficio (`JornadaDeCosecha` con `estado: abierta` y
  `beneficioId` = este beneficio) — la jornada ya existe como entidad, con su apertura y su
  cierre por una persona, así que **no hace falta inventar ninguna «hora de amanecer»**;
- **entregas pendientes**: las `enviada` sin recepción vigente, con recolector, finca y kg de
  finca;
- **lo recibido hoy**: neto, la diferencia contra lo declarado en finca, y el Brix con su
  veredicto;
- **«hacer pedido»** como acción pequeña **dentro** de este bloque. Respeta la decisión del
  2026-09-27 (`app/beneficio/destinos.ts:14`): el pedido es opcional y vive dentro de
  recepción, no como entrada propia del índice.

**Derecha — lo que cabe.** Por área:

```
CUARTO 1
  bandejas   4 de 8 ocupadas · 50 %
  camas      0 de 2 en uso · 1 por limpiar
TANQUES      2 de 5 en uso
⚠ 3 unidades piden volteo            → ver la cola
termina su secado mañana: 1 cama
```

- el porcentaje **siempre con su conteo al lado**: 50 % de 8 y 50 % de 40 no son la misma tarde;
- «por limpiar» se enseña **aunque sea cero**, porque es el número que explica por qué no hay
  sitio;
- lo que pide atención va en **una línea con enlace**, no desplegado: la cola entera es la otra
  pantalla (decisión 4);
- todo en **días** (decisión 2). Sin duración declarada en la receta dice «sin duración
  declarada», nunca una fecha inventada.

### B.2 Debajo, la navegación en tres niveles

| nivel | qué lleva | por qué |
|---|---|---|
| **HOY** | Recepción · Secado · Lotes | lo que se toca cada día |
| **TRABAJO** | Recetas · Informe de proceso | lo que se toca cada semana |
| **⚙ Ajustes del beneficio** | instalaciones, equipos, bandejas, ajustes | montar el beneficio: de vez en cuando, o cuando algo cambia |

Daniel: *«eso es más de una vez cada tanto o por si acaso para adaptar, no del día a día; y
necesitamos al operario respaldado y fluyendo cómodo, fácil, simple.»*

**Las rutas no se mueven.** Cambia por dónde se entra, no dónde vive cada pantalla — mudarlas
obligaría a mudarlas dos veces, que es la razón por la que el índice actual existe tal cual
(`app/beneficio/page.tsx:15-31`).

## Lo que este diseño NO hace

- **No construye la cola de atención de lotes** de `2026-09-16 §4.2` ni la curva de `§4.5`. Siguen
  aprobadas y sin construir; este tablero es la mitad de capacidad y recepción, y deja sitio para
  ellas.
- **No hace portada por rol.** La especificación del 23 la pide (P2, Ola 5) y Daniel eligió hoy
  la opción que no la exige. Cuando llegue, este tablero es lo que verá el responsable.
- **No declara capacidad en kg.** Sigue siendo trabajo de campo pendiente desde agosto
  (`FUENTE_CERRO_AZUL_MINUTA_EJECUTIVA_2026-08-06.md:77`).
- **No toca el modelo de turnos**, que la spec del 23 rechaza expresamente: «La jornada se
  reconstruye por fecha a partir de los hechos registrados» (`:11`).

## Las comprobaciones

1. **Una unidad recién cerrada NO cuenta como capacidad.** Cerrar una corrida y afirmar que la
   unidad queda `por limpiar` y que «¿puedo recibir?» no la suma. Mutación: contarla como
   disponible → cae.
2. **Sólo una persona la libera**, y queda su nombre y su hora en el `AuditEvent`. Mutación:
   liberarla sin actor → cae.
3. **El porcentaje nunca aparece solo.** Guardia de fuente: donde se pinte un `%` de ocupación,
   se pinta su conteo. Con control positivo del detector.
4. **El tablero no promete horas de liberación.** Guardia: la vista no contiene la cadena «se
   libera en»; dice «termina su secado». Control positivo sobre la cadena que sí existe.
5. **Sin duración declarada no se inventa una fecha** — el caso que ya cazó a `expectedHours`
   nulo en la cola de secado.
6. **El índice tiene tres niveles y la configuración una sola puerta.** Lo fija
   `tests/beneficio/destinos-del-indice.test.ts`, que ya existe y ya cuenta las entradas.
