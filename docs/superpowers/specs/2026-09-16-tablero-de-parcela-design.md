# Tablero de parcela — diseño

**Fecha:** 2026-09-16 · **Camino:** arquitectónico · **Estado:** aprobado por partes en conversación, pendiente de revisión escrita

**Alcance.** Es la **pieza 1 de 3**. Las otras dos tienen su propio spec y su propio PR, y aquí sólo se nombran para dejarles sitio:

| pieza | qué | por qué va aparte |
|---|---|---|
| **1 · este spec** | la pantalla de parcela pasa a ser un tablero, y la gestión se va a ajustes | es la base donde encajan las otras dos |
| 2 | monitoreo de trampas de broca | el modelo (`Specimen` de tipo `trap`, revisión `trap_check`) y el servicio (`lib/traceability/specimens.ts`) ya existen; falta la pantalla |
| 3 | aplicaciones fitosanitarias: fumigación, tratamientos, carencia, reentrada | no existe nada; necesita modelo nuevo y decisiones de producto |

---

## 1. El problema

`app/plots/[id]/page.tsx` tiene **665 líneas y 13 encabezados de sección** (medido sobre `5713b62`). Cada sección enseña todo su contenido abierto, en este orden:

1. Población en pie, con las siembras y su corrección
2. Densidad
3. Jornadas de campo
4. Rendimiento
5. Muestras al laboratorio (suelo y foliar)
6. Calicata (anaerobiosis y fotos)
7. Condiciones del terreno, con su formulario abierto al final

Casi todos los formularios ya van plegados en `<details>`. Lo que hace larga la página es el contenido de cada sección, no los formularios.

`docs/arquitectura/auditoria-campo-apiario-y-parcela.md` ya lo había diagnosticado: secciones sin jerarquía, y **«`plots/[id]` no tiene ninguna noción equivalente [de urgencia]: ni vencimiento, ni ventana»**, mientras que apiario sí la tiene.

Lo que pidió Daniel, con sus palabras: *«el operador quiere ver cómo está su lote; las condiciones son descriptivas y usualmente no cambian ni se agregan a diario; el muestreo de laboratorio es una vez al año»*.

## 2. Decisiones de Daniel (2026-09-16)

| pregunta | decisión |
|---|---|
| qué son las «tareas pendientes» | **avisos calculados** a partir de datos existentes, sin modelo de tareas nuevo |
| dónde van las acciones de gestión | **pantalla de ajustes aparte**, `/plots/[id]/ajustes` |
| qué es «productores» | **plantas en producción** |
| cómo se sabe que una planta está en producción | **lo marca el operador**, no se deduce de la edad |
| cómo aparece una siembra que nadie ha marcado | **«sin marcar»**, nunca «en levante» |
| frecuencia del muestreo de laboratorio | **anual, para suelo y para foliar**, con avisos independientes |
| enfoque | **A**: tablero con secciones plegables + ajustes aparte (no pestañas, no subpáginas) |

## 3. El tablero — `/plots/[id]`

De arriba abajo:

### 3.1 Cabecera
Nombre del lote, organización y un enlace **«Gestionar parcela»** a `/plots/[id]/ajustes`.

### 3.2 Estado del lote

Cuatro cifras. La regla que la página ya sigue se mantiene en las cuatro: **lo que falta se dice con su motivo, nunca con un cero** (ADR-080).

| cifra | qué muestra | cuando falta el dato |
|---|---|---|
| **Plantas** | total de las siembras activas, repartido en **en producción · sin marcar** | si alguna siembra activa no tiene `plantCount`: «al menos N», y cuántas siembras faltan |
| **Variedades** | cada `cultivarValue` con sus plantas | «variedad desconocida» cuando `cultivarValueId` es nulo |
| **Densidad** | plantas por hectárea, calculadas al leer como hoy (`density`) | el motivo que ya existe: `sin_area`, `area_no_positiva`, `conteo_incompleto` o sin siembras |
| **Rendimiento** | el año más reciente de `yield.years`, con kg y kg/ha; la tabla por año va **plegada** debajo | «sin cosechas atribuidas»; «mínimo» si hay aportes sin pesar |

Sólo cuentan las siembras con `status = active`, que es el filtro que la página usa hoy. Las `removed`, `renovated` y `planned` quedan fuera.

### 3.3 Pendiente
Los avisos de §4, justo debajo del estado. Si no hay ninguno: «Nada pendiente».

### 3.4 Jornadas de campo
Las **3 más recientes** y el botón **«Iniciar jornada»**. Se queda en el tablero porque iniciar una jornada es trabajo de campo del día.

### 3.5 Hueco de Plagas
Reservado entre Jornadas y Condiciones para las piezas 2 y 3. **No se pinta en esta pieza**: una sección vacía sería ruido.

### 3.6 Condiciones — plegado
Condiciones del terreno y calicatas **en modo lectura**, con sus fotos. Dentro, plegado, **«Describir una calicata»**. Describir una calicata se hace en campo, y desde el #345 funciona sin señal.

### 3.7 Muestras al laboratorio — plegado
Muestras de suelo y foliares con sus resultados. Dentro, **registrar una muestra** y **añadir un resultado**. Se quedan aquí y no en ajustes porque muestrear es trabajo de campo, y también funciona sin señal desde el #345.

## 4. Pendiente: `pendienteDeLaParcela`

Una **función pura** en `lib/traceability/pendienteDeLaParcela.ts`, con la forma de `lib/apiary/pendienteDeLaVisita.ts`:
- recibe lo que la página ya carga y la fecha de hoy, **inyectada**;
- devuelve una lista de avisos, y cada uno lleva su tipo, sus datos y **el enlace donde se arregla**;
- no añade consultas nuevas a la base, salvo los eventos de producción de §5, y se prueba sin base.

### 4.1 Toca hacer

| aviso | condición exacta | enlace |
|---|---|---|
| **Jornada sin cerrar** | alguna jornada de la parcela con `endedAt` nulo; uno por jornada | `/field-sessions/[id]` |
| **Muestreo de suelo vencido** | la parcela no tiene ninguna `SoilSample`, **o** la más reciente por `sampledAt` cumple año (§4.3) | `#muestras` en el tablero |
| **Muestreo foliar vencido** | igual, con `FoliarSample`, y **independiente** del de suelo | `#muestras` en el tablero |
| **Muestras esperando resultado** | muestras de suelo o foliares **sin ningún `Measurement`**; un solo aviso con el recuento de cada tipo, **sin plazo**, porque no hay tiempo de espera acordado y no se inventa | `#muestras` en el tablero |

### 4.2 Falta un dato

| aviso | condición exacta | enlace |
|---|---|---|
| **Lote sin área** | `density.status` es `sin_area`; si es `area_no_positiva`, sale con el texto «el área registrada no es válida» | `/plots/[id]/ajustes#area` |
| **Siembras sin conteo** | siembras activas con `plantCount` nulo; un aviso con el número | `/plots/[id]/ajustes#siembras` |
| **Siembras sin marcar** | siembras activas sin ningún evento `entered_production` (§5); un aviso con el número | `/plots/[id]/ajustes#siembras` |

### 4.3 «Cumple año», sin corrimiento de día

`sampledAt` es un **campo de día**: se guarda a medianoche UTC y viene de un `type="date"` (CLAUDE.md, «Precargar un `datetime-local`…»). El vencimiento se calcula **sobre días, no sobre instantes**:
- vencido si «hoy», como fecha del sitio en su zona horaria, es igual o posterior al mismo día y mes del año siguiente al del último muestreo;
- un muestreo del 29 de febrero vence el 28 de febrero del año siguiente.

Convertir `sampledAt` con el desfase del dispositivo lo movería un día atrás. Está prohibido.

**Sitio sin zona horaria.** `Location.timezone` admite nulo (`String?`), y la regla de la casa es no suponer una zona. Sin zona, el vencimiento sólo se avisa cuando es **cierto en cualquier zona posible**: se compara con la fecha de hoy más temprana que puede existir en el planeta (UTC−12). El día frontera el aviso puede llegar **un día tarde, nunca uno antes**. Así, un sitio sin zona no produce nunca un aviso falso.

### 4.4 Lo que queda fuera, a propósito

| candidato | por qué no |
|---|---|
| anotaciones sin enviar en el aparato | ya las cuenta `FieldSyncControls` en `app/plots/layout.tsx`; repetirlo sería ruido |
| cosechas sin pesar | ya salen en la cifra de rendimiento, y no hay acción posible después de la cosecha |
| anaerobiosis en la calicata | es una condición del suelo, no una tarea |
| plazo de espera de un resultado de laboratorio | no hay un plazo acordado |
| una siembra «vieja» sin marcar | exigiría la regla de edad que se descartó |

**Advertencia conocida:** hoy **ningún lote de Finca Rosina tiene área** (lo dice el comentario de cabecera de `page.tsx`), así que «Lote sin área» saldrá en los 8. Se mantiene porque es el único dato que desbloquea a la vez densidad y kg/ha, pero sale como **una línea, no como alarma**.

## 5. «En producción»: un evento, no una columna

### 5.1 Modelo

`PlantingEvent` ya es el registro de eventos de cada siembra. Guarda `eventType`, `occurredAt`, `operatorPersonId`, `provenanceClass` (obligatoria, sin valor por defecto), `dataQuality`, `notes` y `plantingCohortId`. Hoy `PlantingEventType` sólo admite `received` y `planted`.

Dos cambios, en **una migración** escrita a mano y aplicada con `prisma migrate deploy`. La base de pruebas es compartida, y `migrate dev` ofrece reiniciarla.

1. **`PlantingEventType` gana `entered_production`.**
2. **`PlantingEvent` gana `occurredPrecision HarvestWindowPrecision?`**, que admite nulo.
   - **Por qué:** el paso a producción de una siembra antigua casi nunca se sabe al día («desde 2019»). Sin precisión, un «2019» guardado como 1 de enero se lee como una fecha exacta, y el comentario de `createPlantingCohort` lo dice: *una fecha sin precisión afirma más de lo que sabe*.
   - **Nulo** significa lo de siempre: un instante exacto. Las filas existentes no cambian y no se rellenan con ninguna suposición.
   - La aritmética de la fecha usa `calcularFechaConPrecision` (`lib/time/fechaConPrecision.ts`), la misma que `plantedAt`.

### 5.2 Cómo se deriva el estado de una siembra

- **En producción desde X** si la siembra tiene al menos un evento `entered_production`. X es el `occurredAt` del evento **registrado más recientemente** (el de `createdAt` mayor), mostrado con su precisión.
  - **Por qué el registrado más reciente y no el `occurredAt` mayor:** corregir un error es registrar otro evento con la fecha buena, y esa fecha puede ser anterior a la equivocada. Cuenta el último que se registró, y ningún evento se borra.
- **Sin marcar** si no tiene ninguno. **Nunca se presenta como «en levante»**: nadie lo dijo.
- Una siembra `renovated` no aparece en el tablero, porque no está activa.

### 5.3 Servicio

`recordEnteredProduction(userAccountId, input)` en `lib/traceability/plantingCohorts.ts`:
- misma compuerta de acceso que `updatePlantingCohort`;
- escribe el `PlantingEvent` y su `AuditEvent` **en la misma transacción**, como vigila `tests/arquitectura/audit-atomico.test.ts`;
- valida que la siembra esté activa y pertenezca a la parcela, exige `provenanceClass`, y exige `occurredPrecision` cuando la fecha no es exacta.

## 6. Ajustes — `/plots/[id]/ajustes`

Una pantalla **sólo de formularios de gestión**, con «← Volver al tablero» arriba.
- Usa la **misma compuerta de acceso** que el tablero.
- Cuelga de `/plots`, así que hereda `FieldSyncControls` de `app/plots/layout.tsx`, y el service worker la sirve sin red: `/plots` está en `OPERATOR_ROUTE_PREFIXES`, `public/sw.js:37`.

| bloque | ancla | contenido |
|---|---|---|
| **Siembras** | `#siembras` | una fila por siembra activa con dos acciones plegadas: **Corregir** (el `PlantingCohortForm` de hoy, que exige motivo, `plantingCohorts.ts:665`) y **Marcar en producción** (formulario nuevo: fecha, precisión, procedencia, calidad y notas). Si ya está marcada: «En producción desde …». Al final, plegado, **Registrar una siembra**. |
| **Condiciones del terreno** | `#condiciones`, y `#area` en el campo del área | el `PlotAttributesForm` de hoy: área (`areaHectares`), altitud, pendiente, orientación, sombra, suelo, marco de plantación |
| **Calicatas** | `#calicatas` | **Corregir** cada calicata ya descrita. Describir una nueva se queda en el tablero (§3.6). |

### 6.1 Sin señal

| acción | sin señal |
|---|---|
| Registrar una siembra | **se encola**, como desde el #345 |
| Corregir una siembra, marcar en producción, editar condiciones, corregir una calicata | **necesitan conexión**: el spec del #345 dejó fuera editar sin señal. Sin conexión, el botón **se desactiva con el texto «Necesita conexión»**, en vez de fallar al enviar. Nada se descarta en silencio. |

La decisión se toma con `navigator.onLine`, como el resto de la cola. **Límite conocido y no resuelto aquí:** con señal débil, `navigator.onLine` puede ser `true` sin conexión real. Está anotado como decisión abierta en el #345 y afecta a toda la cola.

## 7. Textos

Todos los textos nuevos van en **`messages/es.json` y `messages/en.json`**, bajo el espacio `Traceability` que ya usa la página. No se escribe ningún texto en duro.

## 8. Cómo se prueba

| qué | cómo | el caso que tiene que poder fallar |
|---|---|---|
| `pendienteDeLaParcela` | prueba pura con datos de ejemplo y «hoy» inyectado | suelo vencido **y** foliar al día (o al revés), para demostrar que son independientes; «nunca se muestreó»; el día exacto del vencimiento, y el día anterior; un 29 de febrero; que ninguna muestra sin resultado ponga plazo |
| estado de producción | prueba pura sobre listas de eventos | una siembra sin evento **nunca** sale como levante; dos eventos donde el registrado último tiene la fecha **anterior** y gana; una siembra `renovated` excluida |
| `recordEnteredProduction` | prueba con base (grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`) | que exige procedencia; que rechaza una siembra de otra parcela; que la fila guardada tiene la precisión que se escribió, **leyendo la fila**, no el estado devuelto |
| migración | aplicada con `migrate deploy`; flip-test | sin `occurredPrecision`, la prueba que lee la fila cae por su nombre |
| cifras del tablero | prueba pura de la función que las arma | «al menos N» cuando falta un conteo; nunca un 0 por un dato ausente |
| compuertas | `npx tsc --noEmit`, `npm run build` y el carril hermético (`scripts/ci.sh`) | — |
| **recorrido en navegador** | **parte del plan desde el principio.** En un servidor local: el tablero con avisos reales, el enlace de «Lote sin área» que llega a `#area`, marcar una siembra en producción y verla en el tablero, y «Necesita conexión» sin señal | — |

## 9. Fuera de alcance

- Las piezas 2 (trampas) y 3 (aplicaciones fitosanitarias).
- Tareas asignables con responsable y fecha: se descartaron en favor de los avisos calculados.
- Cualquier regla de edad para deducir la producción.
- Editar sin señal.
- El caso de `navigator.onLine` con señal débil.
- Cambiar cómo se calculan hoy la densidad o el rendimiento: el tablero **muestra** lo que ya se calcula.
