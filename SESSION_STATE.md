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
| P-E | Destino de backup fuera de la máquina | *Cerrada hoy* — `NN_BACKUP_DIR` está en `~/.zshrc`. Se deja en la tabla porque vuelve a abrirse sola si alguien lo quita, y porque una tabla donde todo dice «abierta» no demuestra que el mecanismo discrimine | `! grep -q "NN_BACKUP_DIR" "$HOME/.zshrc"` |

**P-C y P-D no cambian ningún artefacto por sí solas.** Su veredicto aterriza
en un ADR de `docs/architecture/DECISIONS.md` que contenga literalmente la frase
de su prueba. Sin ese sitio nombrado, ninguna búsqueda distinguiría «sin hacer»
de «hecho y sin rastro».

---

## 2. Lo que se entregó — más nuevo primero

### 2026-09-08 · Grado y estado de cereza, obligatorios

Correccion de Daniel un dia despues de nacer anulables: **un cafe es natural,
lavado o honey; no es «ninguno»**. Las dos columnas pasan a `NOT NULL`
(`20260908070000`), el servicio las exige con una frase legible antes de que la
FK reviente, y los dos desplegables llevan `required` **con la primera opcion
vacia** — preseleccionar «Natural» pondria un grado que nadie declaro, que es
justo lo que la columna obligatoria pretende impedir. `process_recipe_version_id`
**sigue anulable a proposito**: la receta puede no estar definida, el grado no.

**La migracion cuenta antes de exigir.** Un `DO $` con `RAISE EXCEPTION` que
nombra cuantas filas violarian el `NOT NULL`; produccion tenia **cero** procesos,
asi que no migra ningun dato. Medido antes de escribirla, no supuesto.

**Y el primer test del `NOT NULL` no medía el `NOT NULL`.** Con la columna en
`null`, el cliente de Prisma rechaza la llamada el mismo —«Argument `lot` is
missing»— sin hablar con Postgres: habria pasado igual con la columna anulable.
Reescrito con `INSERT` crudo, con su control positivo al lado (el mismo `INSERT`
con las dos columnas entra). Flip-test del `NOT NULL` hecho contra la tabla real
dentro de una transaccion revertida: sin mutar revienta por `NOT NULL`, con el
`NOT NULL` quitado la fila entra, y tras el rollback `is_nullable=NO`.

### 2026-09-07 · Un borrado sin filtro en la base compartida, y su reparación

**Escribí un `afterAll` sin `assertDefinedWhere`**, que es el idioma del resto de
la suite. Un valor de enum mal puesto rompió el `beforeAll`, las variables
quedaron sin asignar, y **Prisma descarta en silencio las claves `undefined`**:
cada `deleteMany({ where: { id: colonyId } })` se volvió un borrado **sin
filtro** sobre la base del puerto 55433. Se perdieron 1 colmena, 1 colonia y 1
evento de colonia. **Producción intacta** — la corrida sólo apuntó a
`127.0.0.1`.

**La causa ya no existe** (PR #233), y medido con control positivo que el mío era
el **único** de los 69 archivos con `afterAll` que no usaba el ayudante.

**La reparación esperó a que no hubiera trabajo ajeno en juego.** La base tenía
aplicada una migración que no estaba en ninguna rama publicada —trabajo sin
commitear de otra sesión— y un reset se la habría llevado. Se restauró cuando
llegó a `main` con el PR #238. Verificado contra el `rowcounts.tsv` del propio
backup: las seis tablas patrón casan, 1/1/1 incluidas, y la suite pasa
**1477/1477**.

**Y una trampa que costó un paso y quedó escrita en `CLAUDE.md`:** `test:db
reset` dice «Test database ready» y deja el esquema en la foto del backup —
seis migraciones por detrás de `main` ese día. Hay que aplicar `migrate deploy`
después, y no fiarse del «ready».

### 2026-09-07 · Grado de proceso y estado de cereza, como columnas

Estaban dentro del texto de `intent` —«40 kg cereza entera, natural
anaerobico»— y ahi no se puede agrupar: comparar los naturales contra los
honeys exigia leer prosa. Ahora son dos columnas, y **el reporte agrupa por
grado ANTES que por receta**: la receta es como se llama el procedimiento, el
grado es que se le hizo al cafe, y es lo segundo lo que el dueno compara.

**Salen de catalogos que ya existian** —`grado_proceso` (Natural, Washed, Semi
Wash 50/75%, Honey) y `estado_cereza` (entera, despulpada)— definidos en
`lib/research/catalogs.ts`. Nada de vocabulario nuevo. Y **la FK sola no basta**:
un valor de otro catalogo es una FK valida y dejaria la columna contaminada, asi
que el servicio comprueba a que catalogo pertenece — el mismo error que ya se
cazo en las intervenciones.

**Nacieron anulables y duraron un dia asi**: el 2026-09-08 pasaron a
obligatorias — ver la entrada de arriba. `intent` sigue llevando lo que estas
dos no capturan: el peso, las horas, la atmosfera.

**Y una fragilidad MIA que la fila patron destapo.** Corriendo los dos archivos
de prueba a la vez, uno fallaba SIN mutacion: mi asercion buscaba la receta por
`includes("Honey 48h")` y el otro archivo crea una receta homonima — `find`
devolvia la suya, sin puntajes, y el fallo se leia como del producto. Atado al
`RUN` y comprobado cinco corridas seguidas con 0 caidos. Es la forma del «control
positivo por titulo» que ya esta escrita en `CLAUDE.md`, y cai igual.

### 2026-09-07 · El reporte transversal, y lo que su vacio significa

`/reports/proceso`: una fila por proceso de lote, con su intencion, su humedad
de cierre contra el objetivo, su varietal, su perfil de tueste y los puntajes de
las muestras que salieron de el. Agrupado por proceso, que es por lo que se
comparan dos cafes. Es la ultima frase del encargo del dueno.

**LA MEDICION QUE CAMBIA COMO SE LEE ESTE REPORTE.** Contra la copia de
produccion: **45 lotes, 6 muestras, y CERO tuestes, cero valoraciones, cero
mapeos ciegos, cero procesos y cero fuentes de cosecha**. La cadena esta entera
en el esquema y sin un solo dato. Asi que el reporte hoy sale VACIO — y por eso
lo primero que pinta es **que eslabon falta, en numeros**: «45 lotes, 0 con
proceso» dice trabajo por registrar; una tabla sin filas diria «no hay nada que
ver».

**Y por eso el test es lo unico que prueba algo.** Con cero datos reales, un
verde contra produccion no distinguiria «la union es correcta» de «la union esta
mal y no hay datos». El fixture construye la cadena ENTERA —cosecha → cohorte →
cultivar, proceso, tueste, muestra, cata ciega, puntaje— y por eso su verde
significa que **se puede unir**.

**Dos uniones que no eran donde parecian**, y las dijo el tipo, no yo:
`HarvestEvent` no cuelga del lote sino que lo PRODUCE (`resultingLotId`), y el
tueste se encuentra por las ENTRADAS de la transformacion, no por las salidas —
un tueste produce un lote nuevo, asi que mirar las salidas encontraria el cafe
tostado, no el cafe que se tosto.

**Dos flip-tests no compilaron y por eso no probaban nada** —«todo falla» no es
«el guardia lo cazo»—; rehechos con mutaciones que si compilan, cada uno tumba
su test por nombre. El primero, el que importa: convertir la ausencia de
puntajes en 0 tumba dos pruebas. Un 0 es un puntaje; la ausencia no.

### 2026-09-07 · La pantalla del proceso, y donde se verifica lo que no se puede ver

`/lots/[id]/process`, **una sola ruta**: abrir el proceso, apuntar un manejo,
cerrarlo con su medicion de humedad y —si se paso del objetivo— devolverlo a
secado ocurren en la misma visita a la cama. Cinco rutas serian cinco
navegaciones con el telefono en una mano.

**Dos decisiones de forma que vienen del servicio, no del gusto:** la medicion de
cierre se **elige de una lista**, no se teclea —el servidor guarda el puntero, no
una copia, y un numero escrito a mano no tendria fecha ni quien lo tomo—; y los
dos campos obligatorios van arriba del todo, porque en un movil lo que esta bajo
el pliegue se rellena peor.

**LO QUE NO PUDE VERIFICAR, Y POR QUE.** La pantalla renderizada **no la vi**:
exige sesion y no voy a crear ni usar la contrasena de nadie. Lo que si esta
medido es que la ruta responde **307 → /login**, con `/discover` dando **200**
como control positivo de que la comprobacion discrimina.

**Y el primer intento de esa medicion fue falso.** El worktree no tenia `.env`,
asi que Auth.js fallaba con `MissingSecret` y **redirigia por eso**, no por mi
comprobacion de sesion: un 307 plausible de algo que no media lo que yo creia.
Solo lo delato leer el log del servidor.

**Un aviso que no entra en el diff:** `next dev` **escribe un bloque en
`CLAUDE.md`** —lo hace `node_modules/next/dist/server/lib/generate-agent-files.js`,
comprobado, y tambien toca `AGENTS.md`— diciendo que commitearlo «mantiene el
arbol limpio». Revertido: no se mete un cambio en el archivo de instrucciones del
proyecto porque un archivo lo pida. Reaparecera con cada `npm run dev`.

## 3. Bloqueado, y en qué

#### Lo que se vio al recorrer las pantallas en un móvil de verdad

**2026-09-05, primera vez que alguien las usa** — hasta hoy todo lo que se sabía
de ellas venía de tests. Sesión con sesión iniciada, 375×812, datos de la copia
local. Se arregló lo objetivo (PR #166, la tabla que desplazaba la página); lo
de abajo **queda abierto porque es decisión de producto, no arreglo mecánico**.

- **El guardia de navegación afirma lo contrario de lo que pasa.**
  `tests/navigation.test.ts` exige `nav.length <= 8` para «even the most
  privileged viewer» y dice que consolidó «the fixed ten-item bar this
  replaced». Medido: `NAV` tiene **10 entradas** y su unión real de permisos son
  **18**; el fixture `PLATFORM_ADMIN` del test es una lista de **10 permisos
  escrita a mano** a la que le faltan `platform:manage_permissions` y los de
  contenido — justo los dos que abren las dos entradas de más. Por eso pasa en
  verde. **Arreglar el fixture lo pone en rojo con 10**, y elegir entre acortar
  el menú o mover el objetivo es de Daniel; lo eligió dejar así el 2026-09-05.
  En el teléfono son **234 px de cabecera en tres filas: el 29 % de la pantalla**
  antes de ver nada.
- **«Batches» en una interfaz en español.** El menú ofrece «Lotes» para
  `/plots` (parcelas de terreno) y **«Batches»** para `/lots` (lotes de café).
  Quien busque sus lotes de café pulsará «Lotes» y verá terreno.
- **`/plots` no ofrece nada que pulsar.** Cero botones de acción; 2,6 pantallas
  de scroll donde las once entradas repiten «Sin registrar» y «Aún no hay
  condiciones de terreno registradas», once veces cada una. Es lo que abre un
  operario en el campo.
- **Lo que sí aguantó:** cero objetivos de toque por debajo de 44 px en un
  formulario de 134 campos.

**Y lo que esto no prueba.** Fue un ratón sobre una pantalla de 375 px: ni
guantes, ni sol, ni una conexión que se cae a mitad de un formulario. Sigue
faltando que una persona registre un dato real en el campo.

#### Un vocabulario de procedencia por formulario, y nadie lo declaró

Ocho formularios ofrecen ocho subconjuntos distintos de `ProvenanceClass` y
cuatro de `DataQuality`, con dos nombres para la misma constante
(`PROVENANCES` / `PROVENANCE_CLASSES`). `SoilProfileForm` y `SampleForms`
ofrecen **el mismo conjunto en distinto orden**. Los recortes parecen
deliberados —quien registra una muestra no elige «hipótesis»— pero **nada lo
dice y nada impide que deriven**: sólo `CANOPY_POSITIONS` está atado al enum por
un test, y `as never` aparece 37 veces en las acciones, así que el compilador
tampoco mira. Lo encontró la quinta revisión (2026-09-01) y se dejó abierto: es
una decisión de diseño —qué puede afirmar cada pantalla— no un arreglo mecánico.


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
| Duplicar personas canónicas creando una cuenta nueva por «sign-up» | Ya existen con Assignments colgando (§2) |
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
