# Tablero del beneficio — diseño

**Fecha:** 2026-09-16 · **Camino:** arquitectónico · **Estado:** aprobado por partes en conversación, pendiente de revisión escrita · **Medido sobre:** `origin/main` = `d77db66`; **ampliado el 2026-09-18** con la vista del encargado de procesos (§2, §4.5)

**Alcance.** Es la **primera pieza** de una capa de decisión para quien dirige la finca y el beneficio. Las demás se nombran sólo para dejarles sitio:

| pieza | qué | estado |
|---|---|---|
| **1 · este spec** | tablero del beneficio: qué pide atención ahora, y si cabe más cereza | este documento |
| 2 | insumos: catálogo, existencias, y lo que cada receta consume por kg (levadura, nutrientes, CO₂ para maceración carbónica) | por diseñar — decisión de Daniel: pieza propia, justo después |
| 3 | vista del dueño / finca: todas las parcelas, cosecha por temporada, jornales, avisos | espera a que se fusione el tablero de parcela (#362) |
| 4 | captura de recursos y costos: jornal, precio de insumos, agua, energía | no existe nada; sin ella ninguna vista puede decir costo por kg |
| 5 | pronóstico: cosecha y volumen | primero medir cuántas temporadas de historia hay |

---

## 1. El problema

El beneficio ya tiene los motores que juzgan un lote —`lib/beneficio/ph.ts`, `brix.ts`, `secado.ts`, `balanceDeMasas.ts`— y `veredictoDelLote` en `lib/beneficio/desdeElLote.ts` los reúne. Pero **sólo se ven lote por lote**, dentro de `app/lots/[id]/page.tsx`. Para saber qué lote se está pudriendo hay que abrirlos todos.

Y la pregunta de capacidad está partida: `app/equipos` ya dice cuántos tanques hay libres y sanos, pero **nada dice cuántas camas de secado hay libres**, y nada lo pone al lado de los lotes que las necesitan.

Tampoco hay ninguna pantalla por rol: `CLAUDE.md` §47 pide tableros por rol y ninguno está construido.

## 2. Decisiones de Daniel (2026-09-16)

| pregunta | decisión |
|---|---|
| qué pieza primero | **el tablero del beneficio** |
| qué decisiones debe contestar | **qué pide atención ahora** y **¿puedo recibir más cereza?** — no «cuándo estará listo para vender» ni «rinde el proceso», que quedan fuera |
| capacidad | **ocupación primero, kg después**: libres/en uso desde ya; el campo de capacidad en un segundo paso, con «capacidad sin declarar» hasta que se mida cada unidad |
| quién lo ve | **Farm Manager y Daniel**, con los permisos que ya existen; sin rol nuevo |
| enfoque | **A**: una página nueva `/beneficio`, sólo lectura, que reutiliza los motores |
| orden de la cola | Crítico · Listo para decidir · Aviso · Sin veredicto · En curso |
| cuándo una desviación de balance está abierta | **mientras no tenga ninguna `CorrectiveAction`** |
| insumos e instrumentos | **instrumentos ya** (el dato existe); **insumos, pieza propia** |
| ritmo de receta (2026-09-17) | **entra en este tablero**. Una **lectura debida sube el lote a «Aviso»**; **ir tarde sólo ordena** dentro de su grupo, porque una fase larga puede ser deliberada |
| para quién se diseña la vista (2026-09-18) | **el encargado de procesos**, y que le sea útil **visualmente**; cubre toda la línea: *«recibir cosecha y hacer flotación, selección, implementar y monitorear proceso y dar de alta a secado y almacenamiento»* |
| celular | **sí, con el orden de §4.5**: las tres piezas juntas no caben a lo ancho de un teléfono; en pantalla ancha, sí |

## 3. Lo que ya existe y se reutiliza — no se reescribe

Medido antes de diseñar, porque dos de estas cosas no estaban en el borrador de la conversación y lo habrían duplicado:

| qué | dónde | qué da |
|---|---|---|
| veredicto de la fase abierta | `veredictoDelLote` en `lib/beneficio/desdeElLote.ts` | `VeredictoDeFase` con `ph`, `brix`, `secado` y `limitaciones`, **o la razón por la que no lo hay** (`SinVeredicto`) |
| disponibilidad de tanques | `disponibilidadDeRecipientes` en `lib/equipos/equipos.ts`, con `clasificar` y `resumir` de `lib/equipos/disponibilidad.ts` | por recipiente: `EN_USO`, `CONDICION`, `RETIRADO`; y el resumen `total / libresYSanos / enUso / requierenIntervencion` |
| estado de cada instrumento | `listarEquipos` en `lib/equipos/equipos.ts`, con `estadoDeVerificacion` de `lib/equipos/verificacion.ts` | `VERIFICADO`, `REVISION_VENCIDA`, `VERIFICACION_FALLIDA`, `SIN_VERIFICACION`, `SIN_INSTRUMENTO` |
| camas de secado | `LocationType` `drying_facility` y `drying_bed`; `DryingRun.dryingBedLocationId` | la cama concreta de cada secado — pero **ningún clasificador de camas** |
| desviaciones de balance | `Deviation.lotTransformationId` y `CorrectiveAction.deviationId` | el balance fuera de tolerancia avisa y no bloquea |
| ritmo de la receta | `estadoDeRitmo` y `puntajeDeUrgencia` en `lib/traceability/ritmo.ts` (#287); `ProcessRecipeVersion.expectedHours` y `ProcessTarget.everyHours` | `demora` (`true` / `false` / **`null` = no se sabe**), `horasDeMas`, `debidas` por variable, y un puntaje para ordenar. **Fusionado el 2026-09-13 y sin ningún llamador fuera de las pruebas** |

**Consecuencia para el diseño:** los tanques salen de `disponibilidadDeRecipientes` tal cual —que además ya distingue un tanque **libre pero averiado**, que no es un tanque libre—, y las camas se clasifican **con el mismo `clasificar`**, no con una regla paralela.

## 4. Diseño

### 4.1 Piezas

- **`lib/beneficio/entradaDelLote.ts`** *(nuevo)*. Carga la `EntradaDelLote` de un lote: fase abierta, grado de proceso, mediciones con el estado de su instrumento. **Es el código que hoy vive dentro de `app/lots/[id]/page.tsx`** (líneas 201–233 sobre `d77db66`), movido, y la página pasa a llamarlo. Así la ficha del lote y el tablero **no pueden discrepar**.
- **`lib/beneficio/tablero.ts`** *(nuevo, puro, sin base de datos)*. `tableroDelBeneficio({ lotes, tanques, camas, instrumentos, desviaciones, ahora })` devuelve `{ atencion, ocupacion, instrumentos }`.
- **`lib/beneficio/datosDelTablero.ts`** *(nuevo)*. Las lecturas, filtradas por el permiso real de quien mira:
  - lotes con `FermentationRun` o `DryingRun` abierta, y su entrada vía `entradaDelLote`;
  - para cada uno, lo que `estadoDeRitmo` necesita: el `expectedHours` y los `ProcessTarget.everyHours` de la versión de receta de su `LotProcess`, y la última lectura de cada variable **dentro de la fase**;
  - tanques vía `disponibilidadDeRecipientes`;
  - camas `drying_bed` con su `DryingRun` abierta;
  - instrumentos vía `listarEquipos`, quedándose con `kind = instrument`;
  - desviaciones de las transformaciones de esos lotes **sin `CorrectiveAction`**.
- **`app/beneficio/page.tsx`** *(nuevo)*. Componente de servidor; la única gráfica es la curva de §4.5, en SVG del servidor. Se declara en `scripts/rutas-declaradas.mjs` y las cifras de `docs/arquitectura/inventario-de-acceso.md` se recalculan con `node scripts/inventario-de-acceso.mjs`.

### 4.2 La cola de atención

Una fila por lote activo. Cinco grupos, en este orden. Dentro de cada uno se ordena **por `puntajeDeUrgencia` de mayor a menor**, después **por el lote que lleva más tiempo sin lectura**, y a igualdad por `id`, para que el orden sea determinista.

| # | grupo | entra |
|---|---|---|
| 1 | **Crítico** | cualquier motor en `CRITICAL` —p. ej. `STALLED_ROT_HAZARD`, `OVER_FERMENTED_CRITICAL`, `STALLED_MOLD_HAZARD`, `BEAN_TEMP_EXCEEDED`— |
| 2 | **Listo para decidir** | `TERMINATION_READY` (Brix) o `TARGET_REACHED` (secado). No son problemas: son las decisiones que se estropean si esperan |
| 3 | **Aviso** | `WARNING` de cualquier motor, una desviación de balance abierta, o **al menos una lectura debida según el ritmo de su receta** |
| 4 | **Sin veredicto** | cualquier `SinVeredicto` (`SIN_LECTURAS`, `SIN_GRADO_DECLARADO`, `GRADO_SIN_PERFIL`) y los estados de dato insuficiente o sensor en falla |
| 5 | **En curso** | el resto — plegado |

**Un lote va al grupo más grave que le toque**, y la fila dice todos sus motivos, no sólo el ganador.

**«Sin veredicto» nunca se mezcla con «En curso».** No saber no es ir bien; es el mismo principio que `SinVeredicto` ya escribe en su comentario.

Cada fila: lote y fase · tanque o cama · hace cuánto la última lectura · el estado dicho en palabras (reutilizando los textos que ya garantiza `tests/beneficio/todo-estado-tiene-texto.test.ts`) · el ritmo · las `limitaciones` del veredicto en una línea discreta · enlace al lote.

**El ritmo, en la fila:**

- lecturas debidas, la peor primero: «debe pH — cada 6 h, última hace 7 h»;
- `demora: true` → «va tarde, +5 h sobre lo esperado». **No cambia de grupo**, sólo ordena;
- `demora: false` → «en hora»;
- `demora: null` → «**sin duración declarada**». **Nunca se pinta como «en hora»**. `puntajeDeUrgencia` los puntúa igual, a propósito y dicho en su comentario, así que la diferencia la tiene que hacer la pantalla.

**Un dato corrupto no tumba la página.** `estadoDeRitmo` lanza `RitmoError` ante un ritmo `≤ 0`, una fase que empieza en el futuro o una lectura futura. El tablero lo captura **lote por lote**: ese lote va a «Sin veredicto» con «datos de ritmo inválidos» y el código del error, y los demás se pintan normal.

**Una desviación de balance abierta va siempre a «Aviso».** Medido: `lib/traceability/balance.ts:507` escribe `severity: "mass_balance"` en **todas** — es una etiqueta de origen, no un grado. El borrador de este spec decía «crítica si dice `GROSS_IMBALANCE`», y esa regla **no habría disparado nunca**. Graduar una desviación exigiría recalcular su gravedad desde `LotTransformation.unexplainedQuantity` y la tolerancia; queda fuera de esta pieza y se dice aquí para que nadie lea «nunca crítica» como «nunca grave».

### 4.3 Capacidad

- **Resumen arriba:** «Tanques 2 libres y sanos de 5 · 1 requiere intervención · Camas 7 libres de 12».
- **Tanques:** tal cual los da `disponibilidadDeRecipientes`, filtrados al sitio.
- **Camas:** cada `drying_bed` bajo un `drying_facility` del sitio, clasificada con `clasificar` —`enUso` = tiene una `DryingRun` con `endedAt = null`—. Las camas no tienen informe de condición, así que su `condicion` es `null`.
- **Corridas sin unidad declarada** —las que sólo dicen el tanque en `vesselNote` o no dicen cama— **no se asignan a ninguna unidad**: salen como «N ocupaciones sin unidad declarada». Asignarlas por nombre haría parecer libre un tanque que no lo está, que es el error caro.
- **Dos corridas abiertas en la misma unidad** se enseñan como conflicto de datos.

**Paso 2 — capacidad declarada**, en su propio PR y con su migración:

- `capacidadKg Decimal?` en `Equipment` (recipientes) y en `Location` (camas), editable en sus formularios.
- Con capacidad declarada, la unidad dice «~X kg libres», restando el peso actual del lote según su libro de cantidades. Sin ella, «capacidad sin declarar» — **nunca un número inventado ni un cero**.
- Ceros y negativos: cero es un dato («esta unidad no admite carga»), negativo se rechaza en el servidor.

### 4.4 Instrumentos

Bloque corto: los instrumentos del sitio en `REVISION_VENCIDA`, `VERIFICACION_FALLIDA` o `SIN_VERIFICACION`. Un equipo que no es instrumento no aparece. Mismos estados que ya usa el veredicto del lote, así que el tablero y la ficha dicen lo mismo del mismo potenciómetro.

### 4.5 La vista: tres piezas, y cómo se acomodan al celular

**Decisión de Daniel del 2026-09-18**, con dos bocetos vistos en la conversación. La cola de §4.2 sigue siendo el corazón; se le añaden dos piezas visuales:

1. **La línea por etapas** — recepción → flotación → selección → proceso → secado → almacén, con **cuánto hay** en cada una y **qué pide decisión**. Responde «dónde se atasca hoy». Una etapa sólo se colorea cuando algo en ella pide atención.
2. **«¿Puedo recibir?»** — la ocupación de §4.3, y **cuándo se libera** la próxima unidad según la duración declarada de su receta (`expectedHours`). Sin duración declarada dice «sin duración declarada», **nunca una hora inventada**.
3. **La curva de un lote contra la banda de su receta** — pH, Brix o humedad en el tiempo, con la banda `minValue`–`maxValue` de su `ProcessTarget` y el objetivo. **La banda sale de un dato**, no de un dibujo: sin `ProcessTarget` para esa variable no se pinta banda y se dice. Debajo, **qué hacer y qué pasa si se espera** — la rúbrica 22.

**Cómo se acomodan**, en la misma página:

| ancho | orden |
|---|---|
| **celular** | la línea en **dos filas de tres**; debajo **«qué hacer ahora»** (la cola de §4.2, una fila por acción con la razón debajo); debajo **«¿puedo recibir?»** reducido a dos números y cuándo se libera el próximo tanque. **La curva sólo al tocar un lote**, a lo ancho del teléfono |
| **pantalla ancha** | las tres juntas, con el mapa de tanques y camas completo |

**Por qué no las tres juntas en el celular:** a unos 375 px, seis etapas en fila dejan unos 55 px por etapa —se leen números, no etiquetas—, y la curva comprimida pierde la banda que la hace útil.

**Gráficas sin librería.** Medido sobre `main` el 2026-09-18: el proyecto **no trae ninguna** librería de gráficas y **ninguna** pantalla dibuja un SVG. La curva es un SVG del servidor, sin JavaScript en el cliente; añadir una librería sería una decisión aparte, y esta pieza no la necesita.

**Lo que falta medir antes del plan:** la selección existe en el modelo (`lib/traceability/selection.ts`), pero **no se ha comprobado** que la recepción y la flotación se registren como etapas propias. Si no lo están, esas dos columnas de la línea dicen «sin registro de esta etapa» en vez de un cero.

**El secado por bandeja** —dónde está cada bandeja, su humedad, cuándo toca voltear— tiene su propia spec (`2026-09-18-secado-por-bandeja-y-su-receta-design.md`). Cuando exista, «voltear debido» y «humedad debida» por bandeja entran en la cola de §4.2 como una lectura debida más.

## 5. Lo que este diseño encontró y no arregla — se señala

- **`disponibilidadDeRecipientes` toma `fermentationRuns[0]`.** Si un tanque tiene dos corridas abiertas, se queda con una en silencio. El tablero enseña el conflicto (§4.3), pero esa función la usa también `app/equipos`; cambiarla es decisión aparte.
- **`disponibilidadDeRecipientes` devuelve el nombre de la ubicación, no su `id`.** Para filtrar por sitio hace falta el `id`. Añadirlo es un cambio de una línea en un archivo que ninguna rama abierta toca hoy; se hace en la tarea que lo necesite y se dice en el PR.
- **Corrección, 2026-09-17: el ritmo ya estaba en `main`.** La primera versión de este spec decía que vivía sólo en la rama `ritmo-de-receta`, sin PR. **Era falso**: se fusionó como #287 el 2026-09-13, aplastado en un commit, y por eso la rama seguía viéndose «5 por delante». Medido por contenido, no por SHA: de los 14 archivos de la rama, **8 son idénticos** en `main` y en otros **4** —acciones, los dos `messages` y el esquema— están las 52 líneas que la rama añadía, con control positivo de que el comparador sí detecta una línea ausente. Los 2 restantes son `SESSION_STATE.md` y su archivo, notas de estado que `main` ya reescribió, y **no se compararon**. Lo que sí estaba pendiente —**que ninguna pantalla lo llama**— se resuelve en §4.2.

## 6. Pruebas

**`tablero.ts`, hermético, con entradas hostiles escritas a propósito:**

- lote sin lecturas → «Sin veredicto», nunca «En curso»;
- un motor crítico y otro listo para decidir en el mismo lote → gana crítico y la fila lleva los dos motivos;
- dos corridas abiertas en la misma unidad → conflicto;
- corrida con tanque sólo en texto libre → cuenta como sin unidad, y ningún tanque pasa a ocupado;
- tanque libre pero averiado → no cuenta como libre y sano;
- capacidad `null`, `0` y negativa;
- dos lotes con la misma hora de última lectura → orden determinista;
- desviación con `CorrectiveAction` → no aparece; sin ella → aparece;
- lote en «En curso» con una lectura debida → sube a «Aviso»;
- lote que va tarde sin lecturas debidas → **no** cambia de grupo, pero ordena por encima de uno en hora;
- `demora: null` y `demora: false` → mismo puntaje y **texto distinto**;
- un lote cuyo ritmo lanza `RitmoError` → «Sin veredicto» con el código, y el resto del tablero se pinta.

**La vista de §4.5:**

- curva de una variable **sin** `ProcessTarget` → se pinta la curva y **no** la banda, y se dice; el control es la misma variable **con** `ProcessTarget`, que sí pinta su banda;
- «se libera en» con `expectedHours` nulo → «sin duración declarada», nunca una hora;
- una etapa de la línea sin registro propio → «sin registro de esta etapa», nunca `0`;
- el celular: la curva no está en la vista del tablero y sí en la del lote tocado.

Flip-test añadido: **pintar la banda con valores por defecto cuando falta el `ProcessTarget`** → debe caer una prueba.

**`entradaDelLote.ts`, con base (grupo `base-sembrada`):** el control positivo es que **la ficha del lote pinta el mismo veredicto antes y después** de mover el código. `tests/beneficio/desde-el-lote.test.ts` y `todo-estado-tiene-texto.test.ts` siguen en verde.

**Flip-tests**, contra el commit, con las tres cosas de la casa —sha antes y después, compila, qué prueba cae por su nombre—:

1. fundir «Sin veredicto» en «En curso» → debe caer una prueba;
2. asignar una corrida de texto libre a una unidad → debe caer una prueba;
3. tratar capacidad `null` como `0` → debe caer una prueba;
4. pintar `demora: null` como «en hora» → debe caer una prueba;
5. dejar escapar el `RitmoError` de un lote → debe caer una prueba.

**Los documentos normativos del beneficio también aprueban.** Según el `CLAUDE.md` del repositorio, `docs/beneficio/03_public_api.md` es el contrato de nombres —todo enum y cadena de estado sale de ahí— y `21_rubrica_veracidad.md` y `22_rubrica_pedagogica.md` son **criterios de aprobación con el mismo peso que el funcional**. El plan contrasta con `03` cada nombre nuevo, y la revisión final pasa las dos rúbricas: cada fila tiene que poder sostenerse, y tiene que enseñar a fermentar mejor, no sólo avisar.

**Compuerta por tarea:** `npm run build` en toda tarea que toque TypeScript —vitest no comprueba tipos—, y al final `npm run verify` y `scripts/ci.sh`.

## 7. Orden y dependencias

1. **Este spec**, PR sólo de documentación. Archivo nuevo; no choca con nadie.
2. **Paso 1** (cola, ocupación, instrumentos) **cuando se fusione la rama de reposo, trilla y subproductos** (`spec/reposo-trilla`, worktree `wt-reposo`). Esa rama toca `lib/traceability/lots.ts`, `lib/beneficio/perfiles.ts` y el esquema, y su tarea 9 lleva el reposo a la pantalla del lote — justo el archivo del que sale `entradaDelLote`. Plan con `superpowers:writing-plans` en ese momento, sobre el `main` de entonces.
3. **Paso 2** (capacidad declarada, con migración), PR aparte.
4. Fusiones y despliegues: **decisión de Daniel**.

## 8. Fuera de alcance

Insumos y existencias · la deuda histórica de lecturas de toda una fase, que es pregunta de informe y no de cola (lo explica `LecturaDebida.debidas`) · cuándo estará listo para vender · rendimiento y pérdidas por etapa · vista del dueño · costos · pronóstico · gráficas **más allá de la curva de §4.5** · una librería de gráficas · un rol nuevo de Processing Manager.
