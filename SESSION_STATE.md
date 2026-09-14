# Estado — Néctar Nómada OS

Dónde está el proyecto. Cómo se construye está en `CLAUDE.md`; son archivos
distintos a propósito. El registro largo de decisiones es
`docs/architecture/DECISIONS.md` (ADR-001 … ADR-103) y **no** se duplica aquí.

**Presupuesto: ≤400 líneas y <20.000 tokens.** Lo hace cumplir
`npm run check:state` y el test `tests/session-state-budget.test.ts`, no esta
frase. Pasado ese punto una lectura devuelve solo el principio **y reporta
éxito**. Lo viejo se va a `docs/SESSION_STATE_ARCHIVE.md`, lo más viejo primero.

---

## 1. Decisiones que solo Daniel puede tomar

Correr `bash scripts/open-decisions.sh` al arrancar. Las que sobrevivan van al
**primer mensaje a Daniel, antes de proponer trabajo**.

Convención: **0 = sigue abierta, 1 = cerrada, 2 = no se pudo determinar.**
«No se pudo determinar» nunca se reporta como cerrada. Las cinco pasaron un
flip-test el 2026-08-28, en ambas direcciones.

| Id | Decisión | Por qué es de Daniel | Prueba |
|----|----------|----------------------|--------|
| P-A | Alerta de backup **fuera de esta máquina** — **cerrada el 2026-09-04** | Daniel creó el check en healthchecks.io y puso su URL. Se deja la fila porque **vuelve a abrirse sola** si alguien borra la línea o caduca la cuenta: la alarma depende de un servicio externo que el repositorio no controla | Las **dos** mitades, y la fuente única es `scripts/open-decisions.sh` — no duplicar aquí: código (`ping_health` presente) **y** URL activa en `~/.config/nectar-nomada/backup.env`. Una sola mitad no es una alarma |
| P-B | A qué proyecto apunta el dominio de marca — **cerrada el 2026-08-28** | Decisión de Daniel. Se deja la fila porque vuelve a abrirse sola si el dominio volviera a este proyecto | `curl -s -L https://www.nectarnomada.com/ \| grep -q 'href="/login"'` |
| P-C | Quiénes reciben correo y, con él, acceso | Casi nadie en la base tiene correo; sin correo no hay contraseña. Hoy solo Daniel y José. Quién entra no lo decide el sistema | `! grep -qi "correos de las personas" docs/architecture/DECISIONS.md` |
| P-D | Nombres y roles de la **familia Huerbsch** — **cerrada el 2026-08-29** | La premisa era falsa: sí están en la base desde A7 — Bob (copropietario), Sherry (copropietaria) y Chris (representante familiar), con membresías reales. Faltaba el ADR, que es lo único que la prueba mira. Ver ADR-106 | `! grep -qi "huerbsch registrada" docs/architecture/DECISIONS.md` |
| P-F | Revisar las tres guías de `docs/dominio/` — pH, Brix y subproductos | Las redactó un modelo a partir de indicaciones suyas y **nadie las ha repasado**. Traen umbrales con pinta de norma y frases como «PELIGRO: lave el café de inmediato». Qué respalda él y qué no, no lo decide el sistema | `grep -lq "^  estado    : borrador"` sobre los `.md` de la carpeta; carpeta ausente sale **2**, no cerrada |
| P-E | Destino de backup fuera de la máquina | *Cerrada hoy* — `NN_BACKUP_DIR` está en `~/.zshrc`. Se deja en la tabla porque vuelve a abrirse sola si alguien lo quita, y porque una tabla donde todo dice «abierta» no demuestra que el mecanismo discrimine | `! grep -q "NN_BACKUP_DIR" "$HOME/.zshrc"` |

**P-C y P-D no cambian ningún artefacto por sí solas.** Su veredicto aterriza
en un ADR de `docs/architecture/DECISIONS.md` que contenga literalmente la frase
de su prueba. Sin ese sitio nombrado, ninguna búsqueda distinguiría «sin hacer»
de «hecho y sin rastro».

---

## 2. Lo que se entregó — más nuevo primero

### 2026-09-14 · Secado, y con él los 47 criterios del beneficio en verde

`lib/beneficio/secado.ts`. **El tablero cierra: 50 pasando, 0 pendientes.** La
v2.x no tenía especificación de secado en absoluto, pese a que su propio
`CLAUDE.md` la exigía — vacío estructural C1.

**El secado no es lineal y un solo umbral de tasa lo arruina en las dos
direcciones.** Bajar diez puntos por encima del 25 % es normal —agua libre— y
alertar ahí da un falso aviso por lote; los mismos diez puntos por debajo del
25 % **sellan la superficie**, el núcleo queda húmedo, el medidor lee bajo y
falso, y el moho sale en bodega semanas después. La fase se decide **antes** de
mirar la tasa.

**Y una medición que corrigió lo que yo creía.** En el flip del solape de
ventanas supuse que caería DR-003 —la rehidratación nocturna—. Cayó **DR-004**.
Medido: DR-003 da −0,95 semiabierta y −1,05 solapada, y **no dispara en ninguno
de los dos**; el que vigila la regla es el del estancamiento, porque exige tasa
≥ 0 y el solape la vuelve negativa. Mirar **cuál** cae es lo único que lo dice.

Seis flip-tests, todos compilando y cada uno por su vector.

### 2026-09-13 · Balance de masas: tres etapas, no una

`lib/beneficio/balanceDeMasas.ts`. El tablero pasa de **28 + 22 a 41 + 9**.

**El error estructural de la v2.0 era sumar dos dominios.** `pulp_kg` entraba en
la ecuación de cereza entera, y la pulpa es el 38-45 % de la masa de cerezas
**que ya se contaron** en `prime_ripe`. Un registro correcto **fallaba**, y para
que pasara el operador tenía que subdeclarar `prime_ripe` — el numerador del
índice de pureza. **El índice medía cuánto tuvo que mentir el operador.**

Ahora son tres ecuaciones encadenadas y separadas, cada una con su tolerancia
sobre el insumo de **su** etapa. Y un desbalance de campo **nunca lanza**: se
guarda con su discrepancia, porque a las cinco de la mañana bajo lluvia un
rechazo significa que el dato no existe nunca.

**Ocho flip-tests y uno encontró un hueco EN EL CONTRATO.** Confundir el rango
del pergamino con el de la baba —la confusión que el propio documento advierte,
y que su autor cometió al redactar— **pasa los 47 vectores sin que caiga uno**.
MB-013 comprueba el estado y el rendimiento, no la **ausencia** del aviso falso.
Queda cubierto desde fuera en `tests/beneficio/etapas-no-se-confunden.test.ts`,
sin tocar el fichero de vectores.

### 2026-09-13 · Brix: la alerta que estaba documentada y no existía

`lib/beneficio/brix.ts`. El tablero pasa de **16 + 34 a 28 + 22**.

**Aquí vivía el defecto más grave de toda la v2.x**: la alerta de estancamiento
estaba especificada en el documento **y** en su `CLAUDE.md`, y el código **no
tenía ninguna rama que la emitiera**. Una protección documentada que no existe
es peor que no tenerla — quien lee el documento da por hecho que el sistema
avisa.

**Y la que más fácil se implementa mal**, dicho por el propio documento: una
ventana de estancamiento sin lectura comparable **no es evaluable y la
evaluación debe continuar**. Convertirla en estado terminal deja al motor
incapaz de emitir `TERMINATION_READY` en casi cualquier cadencia real.

Las otras cuatro: velocidad en ventana móvil y no promedio de vida —que
enmascara justo la parada que se busca—, mediana de tres **por conteo** contra
el atípico que mandaba el lote a lavado antes de tiempo, guarda de división por
cero, y que la solubilización del mucílago **sube el °Bx legítimamente** en las
primeras horas.

**Seis flip-tests**, todos compilando y cada uno por su vector. Uno hubo que
rehacerlo: no compilaba **y no cayó nada** — una no-mutación.

### 2026-09-13 · El Anexo E entra, y dos de los nueve «vacíos» eran respuestas

El dueño entregó `pantallas-captura-apicola.md`. Queda como
`48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md` y **se cruzó contra el código antes de
construir nada** (ADR-124, PR #296). Once afirmaciones medidas: tres salen a favor del
código —el orden por urgencia ya existe, la jornada sin cerrar **sí** se persigue a las
72 h, y las ayudas de apiario no hablan de suelo— y cuatro a favor del dueño.

**Y una que invierte el hallazgo de la semana:** §8, traslado de colmenas, es el primer
hueco que es de **esquema** y no de pantalla. `Hive.locationId` es un FK escalar sin
modelo de vigencia, así que mover una colmena hoy reescribiría su pasado y
`@@unique([locationId, identifier])` chocaría en destino. Tres ADR seguidos —118, 122,
123— encontraron mecanismos completos sin pantalla; aquí buscar lo mismo sería aplicar
el hallazgo anterior donde no aplica.

**El §6 ya está construido** (ADR-125): el vacío deja de ofrecerse como opción. Nueve
grafías en 22 opciones vacías, y **dos de las nueve no eran vacío** — «No — cuento para
decidir» y el «—» de las causas de pérdida son afirmaciones que guardan `null`.
Colapsarlas a un término las habría borrado, así que `lib/apiary/vacio.ts` declara tres
familias y una lista explícita. Y la mitad que no existía: «Sin registrar» ahora **se
lee**, porque los campos de cierre se enseñaban omitiéndose y «sin cerrar» se leía igual
que «no aplica».

**El guardia se acota a apiario a propósito:** la app entera tiene 89 opciones vacías
con 34 grafías, y uno sobre las 89 no podría pasar hoy. El resto queda inventariado en
ADR-125, no vigilado.

**Su detector tenía un fallo de la clase conocida:** el patrón con cierre se tragaba la
forma autocerrada y reportó **18 violaciones inexistentes**. Falló en rojo, que es la
única razón por la que se vio.

**Y un error propio, corregido el mismo día.** Escribí que sin el «plan de renumeración»
el orden de trabajo no tenía fuente autoritativa, y **le pedí a Daniel un documento que ya
tenía**. La secuencia está en el repositorio: la tabla «Camino crítico» del
`48_A9_CAPTURA_DE_CAMPO_REPORTE.md`, **A9.0 … A9.12** con dependencias, y el Anexo H §5 lo
confirma. Los **trece** tienen ya módulo que los declara, así que la secuencia **está
agotada** — y por eso no ordena el §8 ni el §9: **no están en ella**. Son alcance nuevo, y
la pregunta deja de ser «¿en qué orden?» para ser «¿entran o no?». Del paquete sigue sin
aparecer sólo el «brief del módulo». Y la serie de anexos **salta de E a G**: no hay
Anexo F en `main`.

### 2026-09-14 · La humedad de la miel no estaba «parcial»: estaba escondida

§5 era la última fila del Anexo B sin construir, y **medirla cambió la rebanada**.
«Parcial» no describía un mecanismo a medias: `Measurement` ya admite `lotId`, una cosecha
de apiario **crea** un `Lot`, `PANEL_DEL_SUJETO` no restringe `lotId`, y `LotType` ya
tiene `honey` porque A3 decidió que la miel reusa la maquinaria del lote **sin
modificarla**. **La humedad ya se podía registrar** — lo prueba el test llamando a
`recordMeasurement`, y el control es que mi diff **no toca ni un archivo** de ese camino.

Así que no hay columna de humedad: hay un **lector**. `honeyType` sí es columna, porque es
una clasificación y no una lectura — y dice **«declarada»** porque así lo escribió el
dueño: verificarla es un análisis de polen, no un cambio en ese campo. ADR-123.

**TERCERA vez esta semana con la misma forma:** `coverage_until` existía y nadie lo
escribía (ADR-118); `frames_covered` existía y no era comparable (ADR-122); la humedad
existe y no se ve. **Un mecanismo al que nadie llega se ve igual que uno que no existe** —
y en el Anexo se marca «parcial», que se lee como esquema pendiente. Conclusión
equivocada, y la tercera vez que el trabajo real fue pantalla y no tabla.

**Y el hueco que había que cerrar para que algo se viera:** `harvest.ts` sólo sabía
escribir. La pantalla tenía formulario de cosecha y **no listaba ninguna cosecha**.

**Con esto el Anexo B queda completo.** Lo que sigue son decisiones del dueño —si `cebo`
cuenta como vía que deja material— y el protocolo v2, que ya acumula cinco cosas.

## 3. Bloqueado, y en qué

#### Lo que se vio al recorrer las pantallas en un móvil de verdad

**2026-09-05, primera vez que alguien las usa** — hasta hoy todo lo que se sabía
de ellas venía de tests. Sesión con sesión iniciada, 375×812, datos de la copia
local. Se arregló lo objetivo (PR #166, la tabla que desplazaba la página); lo
de abajo **queda abierto porque es decisión de producto, no arreglo mecánico**.

- **El menú tiene 10 entradas y el objetivo del móvil son 8.** El guardia que
  afirmaba lo contrario **se arregló** el 2026-09-08 —su entrada está en
  `docs/SESSION_STATE_ARCHIVE.md`—: ahora mide al
  visor más privilegiado de verdad y fija el 10, así que el hueco está a la
  vista en vez de escondido tras un verde. Lo que sigue abierto es la decisión:
  **acortar el menú o mover el objetivo**. En el teléfono son 234 px de
  cabecera en tres filas, el 29 % de la pantalla antes de ver nada.

- ~~«Batches» en una interfaz en español.~~ **Cerrado el 2026-09-08** — su
  entrada está en `docs/SESSION_STATE_ARCHIVE.md`. El café es «Lote»/«Lot» y
  el terreno es «Parcela».
- **`/plots` no ofrece nada que pulsar.** Las acciones existen —ocho
  formularios— pero **un nivel abajo**, en `/plots/[id]`; subir alguna a la
  lista es decisión de producto. La repetición **sí se arregló** el 2026-09-08:
  lo que falta se cuenta una vez arriba en vez de recitarse por tarjeta.
- **Lo que sí aguantó:** cero objetivos de toque por debajo de 44 px en un
  formulario de 134 campos.

**Y lo que esto no prueba.** Fue un ratón sobre una pantalla de 375 px: ni
guantes, ni sol, ni una conexión que se cae a mitad de un formulario. Sigue
faltando que una persona registre un dato real en el campo.

#### Un vocabulario de procedencia por formulario — **declarado el 2026-09-08**

Los ocho subconjuntos viven ahora en `lib/traceability/procedencia.ts`, con
nombre, tipados contra el enum, y el servidor ya no acepta mas de lo que la
pantalla pinta —su entrada está en `docs/SESSION_STATE_ARCHIVE.md`—. **Lo que
sigue abierto es cual debe ofrecer cada una**:
que una medicion pueda declararse `interpretation` y una calicata no, que el
enum tenga diez valores y las pantallas ofrezcan cinco, y si
`manufacturer_specification` deberia estar en alguna. Es decision de diseño —que
puede afirmar cada pantalla— y sigue sin tomarse.


- **Dar acceso a alguien más que Daniel y José** — bloqueado en P-C. Medido el
  2026-08-29: 13 de 14 cuentas siguen en `invited` sin clave. Bob y Sherry
  tienen 10 Assignments cada uno y Chris 2 — 22 en total que resuelven bien y
  no llegan a nadie, porque ninguna de las tres Personas tiene correo.
  ADR-083 ya arregló el callback que rechazaba `invited`: la puerta funciona,
  falta a quién darle la llave.
- **La protección de `main`, tal como quedó** — no es un bloqueo, es la
  configuración viva. Exige los dos checks de compuerta —el pesado y el
  ligero—, prohíbe force-push y borrar la rama. **Sin revisiones exigidas a
  propósito**: hay una sola cuenta humana y GitHub no deja aprobar el propio PR.
  `enforce_admins` en **false**, también a propósito: si CI se cae por cuota hay
  que poder fusionar un arreglo sin desactivar la protección primero. Cerrado el
  2026-09-05; el detalle, en `docs/SESSION_STATE_ARCHIVE.md`.

- **Medir la cosecha de febrero, no solo registrarla** — bloqueado en el dueño,
  y **ya no en construir nada**. Los seis lotes tienen `areaHectares` nulo, así
  que no hay densidad ni rendimiento por hectárea, que es lo único comparable
  entre lotes y entre años. Desde el 2026-08-31 el dueño puede cargarlas él
  mismo en la página de cada lote; cada página dice en pantalla que faltan. **La
  cosecha llega en febrero**; después, el dato ya no sirve para esa cosecha.
- **Que el rendimiento se pueda calcular con datos reales** — bloqueado en el
  dueño, y ya no en construir nada. La cadena entera (siembra → hectáreas →
  cosecha → bloques → kg/ha) está en pantalla desde el 2026-08-31. Faltan las
  dos entradas: **0 de 8 lotes tienen área** y **0 cosechas están atribuidas a
  bloques**, aunque 15 de las 33 ya tienen peso declarado. Las dos las carga él
  ahora sin ayuda.
- **Las páginas de `app/`: dos pasadas hechas, quedan las demás** — la quinta y
  la sexta revisión (2026-09-05 y 06) miraron esa capa y **lo que encontraron ya
  está arreglado**; el detalle se archivó el 2026-09-06 en
  `docs/SESSION_STATE_ARCHIVE.md` porque era registro de entrega dentro de una
  sección llamada «Bloqueado», y ocupaba el 24 % del archivo. Lo que sigue
  abierto es sólo esto: **quedan páginas sin mirar con esas lentes**, y cada
  lente nueva ha encontrado algo que las anteriores no podían ver.
- **El job de CI con base aún no es obligatorio** — la protección sólo exige
  «Compuerta». CI pasó de 22 de 97 archivos a 94 de 100 (2026-09-06); quedan 6
  fuera, dos de ellas deliberadas. Detalle en `docs/SESSION_STATE_ARCHIVE.md`.

- **Nadie barre las claves de idempotencia de las cuentas que dejan de
  escribir** — es lo único que quedó abierto al cerrar la idempotencia de
  envíos. Un barrido global pediría una tarea periódica y una ruta protegida, y
  este proyecto no tiene ninguna de las dos: decisión aparte. Detalle en
  `docs/SESSION_STATE_ARCHIVE.md`.

- **La pantalla de tueste no la ha abierto nadie en un navegador** — las
  acciones de servidor no las ejerce ninguna prueba (necesitan sesión) y un
  worktree no tiene `.env`. Construida el 2026-09-06; detalle en
  `docs/SESSION_STATE_ARCHIVE.md`.

- **Humedad post-secado por proceso o variedad: NO existe, y esto es lo que
  hay.** `moisture` y `water_activity` **sí** son variables medibles, y
  `ProcessRecipe → ProcessRecipeVersion → ProcessTarget` permite fijar `min`/`max`
  para cualquier variable en un `moment`, con `compareRunToTargets` ya pintándolo
  en la página del lote. Lo que falta: la receta se identifica **sólo por nombre**
  dentro de una organización —no lleva método de proceso ni variedad—, el **lote
  no lleva variedad** (vive como valor de catálogo en el origen de la cosecha,
  `cultivarValueId`), **no hay campo de método de proceso** en ningún sitio, y
  **nada condiciona el paso a almacén** a haber alcanzado una humedad:
  `moveLotToStorage` no mira ninguna medición. Es el hueco que el audit llama
  `OperatingStandard` y umbrales versionados (Fase 3, parcial). **Decisión de
  modelo pendiente de Daniel**, no se construyó nada.

- **Falta correr `npm run sensory:create-protocol`** — escribe en producción y
  no se ha ejecutado. La herramienta quedó lista el 2026-09-06; detalle en
  `docs/SESSION_STATE_ARCHIVE.md`.

- **Dónde se rompe «tarea de finca → puntaje de taza», medido.** Fumigar y
  sembrar se registran como *hechos* (`LabourEntry`, `MaterialConsumptionEntry`,
  `PlantingCohort`) y sólo son *comparables* como `TreatmentBatch`, que **exige**
  protocolo de investigación. Lote→muestra→cata está entero, y el tueste ya es
  variable desde la entrada de abajo. **Falta el reporte:** `VariableComparison`
  compara tratamientos, no puntajes entre lotes, y la Fase 6 sigue sin empezar.

- **Del plan S1 queda UNA entidad de la Tabla 15: el registro de microclima**
  (semanas 4–10), y está bloqueado en Daniel. `CLAUDE.md` §38 pide arquitectura
  separada para la serie temporal —~35.000 filas por sensor y año— y no dice
  cuál. **Es la única decisión de §6 que sigue abierta**: la de la enmienda la
  cerró Daniel el 2026-09-01 (opción A, `TreatmentBatch` con `locationId`) y ya
  está construida en #122.
- **Un reporte de visita a apiario, tal como está escrito** — pedido dos veces
  al dueño, sin llegar. De su contenido dependen tres decisiones distintas: si
  traen qué estaba floreciendo, el puente flora↔miel deja de ser teórico; si
  traen conteos por colmena, puede que la inspección se quede corta; si traen
  acciones y costos, empuja hacia el modelo de propuestas. Sin verlos, lo que se
  construya en apiario va contra una idea nuestra de un reporte, no contra el
  suyo. Medido el 2026-08-31: **una propuesta con presupuesto no cabe en ningún
  sitio** — `budget`, `presupuesto` y `proposal` dan **cero** en el esquema, y
  `Project` no tiene dinero, ni plan, ni aprobación. Eso es modelo nuevo y una
  decisión, no improvisación.
- **Lotes 5 y 6** — bloqueado en el dueño. Dijo que tienen 200 plantones cada
  uno, y eso **contradice** la nota del evento del Lote 4, que afirma que los
  otros 400 de Cafelino siguen sin sembrar. 200+200 son exactamente esos 400. No
  se registró nada hasta saber si son ese material o uno anterior y distinto; de
  la respuesta dependen la variedad, la fecha, y si hay que corregir esa nota.
- **Si los 200 Caturra del Lote 4 llevan marca de calidad** — hoy no la llevan,
  que aquí significa «no hay motivo para dudar». El dueño avisó que puede
  cambiar los conteos de cada lote, así que puede que corresponda `provisional`.
- **Un nombre propio para este OS** — al mover el dominio, esta aplicación queda
  solo en `nectar-nomada-package.vercel.app`. Si quiere algo como
  `app.nectarnomada.com`, es decisión suya. No es urgente: nada depende de ello.
- **El inventario de acceso lee texto, no programa** — no está bloqueado, está
  *aplazado*: el detector actual no tiene ningún fallo conocido sin escribir, y
  los que quedan están documentados con su mutación. La respuesta estructural
  —un AST, con TypeScript que ya es dependencia— está en
  `PENDING_IMPLEMENTATIONS/007`, con lo que arregla y lo que no.

- **Reconciliación de medios en R2** — no está bloqueada, está *aplazada*:
  `core.asset` y el bucket estaban vacíos al 2026-08-20. Ver
  `PENDING_IMPLEMENTATIONS/002`.

---

## 4. Lo que NO se vuelve a proponer

| Propuesta | Por qué se rechazó |
|-----------|--------------------|
| Correr la suite contra la base de producción | Se hacía hasta 2026-08-21 (PR #10). `tests/setup.ts` ahora rechaza una base remota salvo `ALLOW_REMOTE_TEST_DB=1`. Usar `npm run test:db -- up` |
| Reponer una cuenta DEMO | Se eliminó el 2026-08-21 (ADR-066): tenía la única contraseña de la base |
| Conceder Platform Admin desde dentro de la aplicación | Requiere `rbac:manage_permissions`, que solo tiene Platform Admin. Sin titular, el rol no puede concederse nunca desde dentro. Por eso `auth:grant-admin` vive fuera |
| Pasar la contraseña como argumento a `auth:set-password` | Se niega a propósito: un argumento sobrevive en el historial y en la lista de procesos |
| Duplicar personas canónicas creando una cuenta nueva por «sign-up» | Ya existen con Assignments colgando |
| Construir herramienta de reconciliación de medios | Todavía no hay fotos reales. Ver `PENDING_IMPLEMENTATIONS/002` |
| Tocar `~/Developer/nectarnomada-web` desde esta ventana | Es el sitio público, otro repositorio (D-001 allí) |
| Deducir el dueño de una Location por su nombre | Exactamente lo que salió mal en el renombrado de Finca Rosina. Se mira `core.location.organization_id` |
| Subir el límite de `check:state` cuando falle | El límite es la lectura, no la preferencia. Se archiva, no se sube |
| Restringir por ámbito RBAC quién puede figurar como `operatorPersonId` | Lo propuso la segunda revisión independiente (2026-08-31) creyendo que el desplegable filtraba y era «la única barrera». No filtra: `getObserverCandidates` devuelve toda Persona activa **a propósito** — T9.5 §3(c) dice que no es una frontera de seguridad y que `operatorPersonId` no lleva peso RBAC. El operador es una Persona que normalmente **no tiene cuenta**, así que restringir por ámbito excluiría justo a quien hace el trabajo. Sí se arregló lo que era un fallo real: `recordFieldEvent` no comprobaba ni que la Persona existiera, y `startFieldSession` sí. Hay un test que **rompe** si alguien lo endurece por descuido |

---

## 5. Al cerrar la sesión

**Lo mecánico lo comprueba un script**, porque esta lista se re-tecleó a mano
seis veces el 2026-08-31 y una salió mal:

```bash
bash scripts/cierre-de-sesion.sh            # con compuerta
bash scripts/cierre-de-sesion.sh --rapido   # si ya la corriste
```

Mira y dice; no commitea, no empuja, no borra. Sale 0 cuando lo mecánico está
bien. Lo de abajo es lo que **ningún script puede hacer por ti**.

1. Actualizar este archivo. **Es el entregable, no el diff.**
2. `npm run check:state` — si se queja, mover la sección que nombra a
   `docs/SESSION_STATE_ARCHIVE.md`.
3. Escribir la lección donde **sí se cargue**: `CLAUDE.md`, memoria, o
   `PENDING_IMPLEMENTATIONS/`. Nunca solo en un log de sesión.
4. `npm run typecheck` y `npm test`, **leyendo la salida**. Sin tubería antes
   del commit: el estado de salida de una tubería es el del último comando.
5. `git add` **por archivo, nunca `git add -A`** — otras sesiones comparten este
   checkout. Luego `git commit -F <archivo>`.
6. Esperar el check de Vercel antes de fusionar. Push, y verificar desde git:
   `git rev-parse HEAD` = `git rev-parse @{u}`.
7. Parar los procesos que esta sesión arrancó, **por puerto**, nunca `pkill node`.
8. Reportar qué quedó **verificado** y qué **asumido**.
