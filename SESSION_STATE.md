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

### 2026-09-13 · Un tratamiento dice contra qué, y se acabó el Anexo B obligatorio

«Objetivo» era **el último campo que el Anexo B marcaba obligatorio y que no
existía**, con su consecuencia escrita: *«eficacia por objetivo; hoy no se puede
agrupar»*. Ya es obligatorio en el servicio, como el lote y la carencia — y a
diferencia de «alcanza hasta» aquí **no hay caso de urgencia**: quien aplica un
producto sabe contra qué. Medido: 0 tratamientos en la copia local, y **14 pruebas
en 8 archivos cayeron** al exigirlo, que es la prueba de que muerde. ADR-119.

**Enum propio, no el catálogo de irregularidades**, aunque cuatro valores coincidan:
nueve de los trece —moho, loque, alas deformadas, obrera ponedora— no son algo contra
lo que se aplique un producto. Misma distinción que ADR-114.

**Dos campos del §4 se quedaron fuera A PROPÓSITO**, y el motivo es medido:
`lib/apiary/` **no tiene una sola función de actualización**, y «fecha de retiro» y
«eficacia observada» son de etapa cierre —se anotan semanas después—. Añadir la
columna igual repetiría lo que costó una semana con `coverage_until`: comentario,
lectura, y **ninguna pantalla capaz de escribirla**. `PENDING_IMPLEMENTATIONS/011`.

**Una pregunta abierta para Daniel, sin resolverla por deducción:**
`VIAS_QUE_DEJAN_MATERIAL` contiene sólo `tira`, porque es lo único que el Anexo
nombra. `cebo` también deja material, pero añadirlo sería inventarle una regla.

**Lo que NO prueba:** nadie ha registrado un tratamiento con objetivo todavía.

### 2026-09-13 · «Alcanza hasta» pasa a tener manija, y el aviso deja de taparse

El Anexo B §3 marca ese campo obligatorio y lo subraya: *«el campo que faltó en
Toabré»*. **Lo primero que hubo que medir es que la columna ya existía** desde el
2026-09-07, y que los vitales del sitio ya la leían. Lo que faltaba no era esquema:
**1 alimentación en la copia local y ninguna con ese valor**, porque ninguna
pantalla podía escribirlo. Una columna que nada rellena se ve igual que si no
existiera — por eso el Anexo decía «Hoy: no».

**El servicio sigue sin exigirla**, y la razón previa se mantiene tal cual la dejó
escrita quien añadió la columna: una alimentación de urgencia se registra sin saber
hasta cuándo alcanza, y exigirla ahí convierte un dato incompleto en ninguno — el
error que ADR-115 ya rechazó para la carencia. **Y por eso la ausencia se VE:**
`sin_fecha` es un estado propio del aviso, porque una alimentación sin plazo no es
una colonia tranquila, es una **de la que no se puede avisar**. ADR-118.

**El aviso es por colonia, no por sitio.** El resumen por sitio toma el plazo más
largo, así que una colmena alimentada en julio y olvidada queda **tapada** por otra
alimentada en agosto — la forma exacta del fallo de Toabré. Y manda la **última**
alimentación, no la más larga: volver a alimentar corrige el plazo anterior.

**El día del vencimiento todavía cubre.** Un `<` a secas lo daría por vencido a las
00:01 de ese día, un día antes de lo que dijo quien alimentó; y el parseo del lote
lo convierte con `fechaDeDia`, que **falla** en vez de dejar que `new Date()`
adivine. Cuatro flip-tests, los cuatro compilando y cada uno con su prueba.

**Lo que NO prueba:** nadie ha registrado un «alcanza hasta» todavía.

### 2026-09-12 · El estado de la colonia existe, y un aviso no se apaga porque nadie mirase

El Anexo B §2.2 pedía siete campos con su motivo al lado y **ninguno existía**. El
vocabulario sale de `protocolos/apiario-campo-v1.json`, que el dueño escribió y que
**no se edita**: su cabecera lo prohíbe, así que la v2 que hace falta —con los tres
ítems que le faltan— queda en `PENDING_IMPLEMENTATIONS/010`.

**Decisión del dueño (2026-09-12):** el **nivel** de una reserva y el **sitio**
donde está son dos columnas. El Anexo los ponía en una lista de cuatro —«alta,
media, baja, junto a la cría»— pero así no se puede decir «alta Y junto a la cría»
y el reporte de reservas bajas tendría que decidir si cuenta esa cuarta. ADR-117.

**La regla que decide si el aviso de enjambrazón sirve:** se toma la última
inspección **que miró**, no la última inspección. Una visita que pasó rápido y no
abrió la caja deja `null`, y leer eso como «ya no hay» apagaría el aviso **justo en
el caso que pierde la colonia**. Para apagarlo hay que mirar y decir «no hay» — que
por eso es un valor del enum y no la ausencia de valor.

**Un defecto propio, invisible para su propio guardia.**
`booleanos-de-tres-estados` prohíbe preguntar un `Boolean?` con una casilla, pero
buscaba `name="<campo>"` — la forma de un formulario de servidor. **Los de campo
guardan en IndexedDB y se atan con `checked={campo}`**, así que no los veía, y
`queenSighted` tenía el defecto exacto que ese archivo describe: sin marcar guardaba
«miré y no estaba» cuando lo cierto era «nadie buscó». Medido: era el único caso.
Cinco flip-tests; el del guardia cae por su **aserción**, no sólo por su nombre.

**Lo que NO prueba:** nadie ha registrado un estado de colonia. Una inspección en
la copia local, con las diez columnas vacías.

### 2026-09-11 · Contar varroa existe, se anota sin señal, y la serie dice si el tratamiento sirvió

El Anexo B §2.5 pedía cuatro campos y marcaba los cuatro como **no existentes**.
Las tres decisiones están en **ADR-116** y salen del material del dueño, no del
gusto: fila propia porque *«`Measurement` guarda una variable por fila»* y 9
ácaros no dicen nada sin las 300 abejas; el tratamiento que un conteo evalúa es
una **relación opcional** —*«entre dos visitas, no un campo»*— y tiene que ser de
la **misma colonia**; y el porcentaje **no se guarda**, con muestra cero **lanza**
en vez de devolver cero, porque cero afirmaría «no hay infestación» cuando lo que
hay es «no se sabe».

**UN DEFECTO PROPIO QUE ESTO DESTAPÓ.** El parseo de
`/api/v1/sync/field-events` **no reconocía `colony_end`**, cerrado el día antes:
caía al camino de `FieldEvent`, devolvía **400 del lote entero**, y como el
cliente trata eso como fallo de transporte, **un solo borrador de fin de colonia
dejaba la cola del apiario bloqueada**, él y todo lo que tuviera detrás. Dos
pruebas en verde no podían verlo: importar la ruta arrastra `next-auth`, que
vitest no resuelve, **así que la pieza que decide qué tipos existen no se podía
llamar**. Salió a `lib/sync/parsearMutaciones.ts`, y su prueba toma la lista de
tipos **del cliente**: un quinto tipo sin rama cae por su nombre.

**Lo que NO prueba:** nadie ha contado varroa todavía, y la pantalla no se ha
visto en un teléfono. Escrito en la cabecera de la prueba para que nadie lo cuente
dos veces.

### 2026-09-11 · La lista de chequeo del apicultor nunca salió del disco

`protocolos/apiario-campo-v1.json` son 11 KB de preguntas de campo ya escritas
—5 actividades, 44 ítems— y `lib/apiary/protocoloDeCampo.ts` sabe darlas de alta
como `ProtocolVersion` de Research OS. Medido: **sólo lo llamaban las pruebas**.
Ni un guion, ni una pantalla. Aquí la puerta no es una pantalla: cargar un
protocolo se decide una vez y se lee en el diff.

**Lo que entra:** `npm run apiary:load-protocol`. Seco por defecto —enseña las 5
actividades con sus obligatorias y una **fila patrón** de qué hay ya en la base—
y escribe sólo con `--cargar`. Idempotente por `externalIdentifier`, y se niega a
escribir si no hay ninguna cuenta con Platform Admin, porque un `AuditEvent` sin
actor no dice quién lo decidió.

**Comprobado cargándolo de verdad** contra la copia local, no leyendo el ensayo:
crea el protocolo, la versión 1 y **44 variables**; la segunda corrida dice «Ya
estaba» sin tocar nada. Las filas se barrieron después.

**Y lo que cargarlo NO hace, porque la frase fácil sería falsa.** Ninguna
pantalla de apiario lee esas variables: los formularios llevan sus campos en el
código, así que **editar el JSON hoy no cambia ni una pregunta en pantalla**. Lo
que sí hace es que el protocolo aparezca en `/research`, se pueda aprobar con el
botón que ya existe y se pueda **ejecutar** en `/research/execute/<versión>`, que
pinta los 44 ítems. Entra como `draft` a propósito: aprobar es un acto humano.
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
