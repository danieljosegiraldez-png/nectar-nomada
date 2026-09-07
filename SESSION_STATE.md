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

### 2026-09-07 · El informe que se paga ya se puede registrar

**El hueco, medido:** `assessment.evaluator_user_account_id` era **NOT NULL** con
FK a `user_account`. Un Q-grader o un tostador al que se le paga un análisis no
tiene cuenta, así que **el trabajo que se paga era justo el que no se podía
registrar** — vivía fuera del sistema.

**Y una corrección de lo que dije por la mañana:** afirmé que no existía modelo de
credenciales. **Sí existe** — `Person.sensoryCertifications`, especificado en
`BEVERAGE_SENSORY_PROTOCOLS.md` §7.3 con `{certifying_body, certification_name,
level_or_rank, date_earned, certificate_reference}`. Busqué `certification`,
`qGrader` y `licenseNumber`, y el campo se llama de otra forma. **Nadie lo leía
ni lo escribía**: la misma forma que el permiso `sample:view`, que existía en la
intención y no en el catálogo.

**La regla vive en la base, no en TypeScript.** `CHECK
assessment_un_solo_evaluador`: exactamente una de las dos columnas de evaluador
puesta, y un informe externo trae **siempre** el puntero a su original. La
migración **cuenta las filas que lo incumplirían antes de crear el CHECK** y
aborta si hay alguna, en vez de reventar a medias en producción.

**Reusa la cadena que ya existe** —sesión, vuelo, muestra ciega, mapeo— en vez de
una tabla paralela: así los resultados de panel, el historial y los reportes lo
ven sin cambiar una línea. El «ciego» es degenerado a propósito y está dicho: no
hubo cata a ciegas, pero el mapeo es lo único que ata el puntaje al café.

**Flip-test del CHECK, que es lo que distingue medir la regla de medir el
servicio:** quitado de la base, caen las cuatro pruebas que dicen medirlo y el
control positivo —una valoración interna normal— sigue pasando.

Entrada: `npm run sensory:record-external -- <archivo.json>`. Sin argumentos
lista los protocolos vivos y **los nombres de atributo que espera cada uno**,
porque el informe habla en palabras, no en identificadores.

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
- ~~**Que la compuerta sea *obligatoria* para fusionar**~~ — **cerrado el
  2026-09-05, y la premisa era falsa.** Esta entrada decía durante semanas que
  la protección de ramas «no está disponible en un repositorio privado de este
  plan («Upgrade to GitHub Pro»)». **Sí estaba**: se activó por API sin cambiar
  de plan, al primer intento. Nadie lo había vuelto a probar desde que se
  escribió.

  Puesto en `main`: exige los dos checks de compuerta —el pesado y el ligero—,
  prohíbe force-push y borrar la rama. **Sin revisiones exigidas a propósito**:
  hay una sola cuenta humana y GitHub no deja aprobar el propio PR, así que
  exigirlas dejaría el repositorio sin poder fusionar nada.

  `enforce_admins` queda en **false**, también a propósito: si CI se cae por
  cuota —ya pasó el 2026-09-03— hay que poder fusionar un arreglo sin
  desactivar la protección primero.
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
- **CI corría 22 de 97 archivos de prueba; ahora 94 de 100.** `ci.sh` los
  nombraba a mano y se desincronizó en silencio. Invertido a grupos
  (`scripts/pruebas-por-compuerta.txt`): `ci.sh` corre todo lo no listado y
  `ci-con-base.sh`, en un job con Postgres de servicio (imagen **PostGIS**; la
  oficial no la trae, y sólo lo dijo el runner), el resto — con las banderas
  `SEED_DEMO_*`, sin las cuales no hay Platform Admin. Medido ejecutando y dos
  veces desde cero: hay pruebas que pasan acompañadas y fallan solas. **Quedan 6
  fuera:** `roasting` y `s1` son **deliberadas** —son las «dos aserciones» de la
  cabecera de `test-db.sh`: **tenía razón y yo dije que no**—, tres piden datos
  que ninguna bandera produce, y `open-decisions` lee `$HOME/.zshrc`. **El job
  aún no es obligatorio**: la protección sólo exige «Compuerta».

- **Quinta lente (2026-09-06): el doble toque.** La lente que traía —cargas que
  mienten— no tiene dónde morder: cero `loading.tsx` y cero `<Suspense>`. Lo que
  sí: **19 archivos con botones de envío sin apagar** (los otros 32 ya usaban el
  `pending` de `useActionState`). Probado contra la base, no razonado:
  `recordLabourEntry` dos veces con la misma entrada crea **dos filas
  indistinguibles**, y cinco entidades no tienen índice único ni usa la web el
  `clientDraftId` de la cola. Arreglado con `<BotonDeEnvio>` (`useFormStatus`,
  sirve en los catorce formularios de servidor) más guardia con flip-test. Y una
  medición mía salió **falsa** —«0 de 41 protegidos», por mirar sólo
  `app/components`; eran 32 de 51—: la cazó otra medición.

- **Idempotencia de envíos, cerrada.** `core.submission_key` +
  `lib/envios/unaVezPorEnvio.ts`: escritura y clave en **una sola transacción**
  —si no, una clave sin fila devolvería para siempre un resultado inventado—.
  **No se reutilizó `clientDraftId`**: significa «vino de la cola offline» y de
  ahí cuelgan `recordedAt`/`syncedAt` (decisión de Daniel). La clave la genera el
  **servidor** por render (un `useState` con `randomUUID` daría desajuste de
  hidratación). Cableados los **cuatro** que duplicaban en silencio: jornal,
  consumo, medición y almacén. **`Sample` NO lo necesitaba**
  —`@@unique([organizationId, sampleCode])`, igual que suelo y foliar—, y yo
  afirmé lo contrario.

  **Caducidad: 30 días** (Daniel, 2026-09-06). Pasado el plazo, reenviar el mismo
  formulario cuenta como intención nueva. El plazo acota la tabla, no el
  reintento — el caso real se mide en segundos. Se aplica al **leer** —una clave
  vieja no se honra, y se borra antes de seguir o el `create` chocaría contra
  ella— y se barre al **escribir**, acotado a la cuenta que escribe y dentro de
  la transacción: si el barrido falla, falla el envío y se ve. **Lo que NO
  cubre:** las claves de cuentas que dejan de escribir no las barre nadie. Un
  barrido global pediría una tarea periódica y una ruta protegida, y este
  proyecto no tiene ninguna de las dos — decisión aparte.

- **El tueste ya tiene pantalla, y era el único hueco de la cadena.** Medido el
  2026-09-06: `lib/traceability/roasting.ts` estaba entero desde R1 —
  `recordRoastSession`, `listRoastSessions`, `getRoastSessionDetail`, con
  pruebas— y **ninguna pantalla lo llamaba**; el propio código lo decía en un
  comentario («once the R1 UI»). Por eso la base tiene **0 tuestes**. Añadidos
  `/lots/[id]/roast/new`, su acción y `RoastSessionForm`, con la misma forma que
  secado: se entra desde el lote y se vuelve al lote. **Sin clave de
  idempotencia a propósito** — crea el lote de salida con `outputLotCode`, único
  por organización, así que un doble envío choca y falla ruidosamente. `"roast"`
  entra en `BatchAction` para poder ofrecer el botón pero **no** en
  `nextActionFor`: la secuencia de ADR-096 es de Daniel y dice que el verde
  espera a ser **catado**. **No lo ha abierto nadie en un navegador**: las
  acciones de servidor no las ejerce ninguna prueba (necesitan sesión) y un
  worktree no tiene `.env`.

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

- **Ya se puede crear un protocolo de cata** — era el bloqueo de «sin protocolo
  no hay puntajes»: la única forma era `prisma/seed.ts` con `SEED_DEMO_CONTENT`,
  así que producción no tenía ninguno. Añadidos `npm run sensory:create-protocol`
  y `protocolos/cafe-cva-adaptado.json`, con la validación en
  `lib/sensory/definicionDeProtocolo.ts` para poder probarla. La definición vive
  en un archivo versionado: su contenido es decisión del dueño y así se lee en el
  diff. Daniel eligió licencia **en trámite** y los siete atributos a 0–10.
  **Falta correrlo:** escribe en producción y no se ha ejecutado.

- **Dónde se rompe «tarea de finca → puntaje de taza», medido.** Fumigar y
  sembrar se registran como *hechos* (`LabourEntry`, `MaterialConsumptionEntry`,
  `PlantingCohort`) y sólo son *comparables* como `TreatmentBatch`, que **exige**
  protocolo de investigación. Lote→muestra→cata está entero, y el tueste ya es
  variable desde la entrada de abajo. **Falta el reporte:** `VariableComparison`
  compara tratamientos, no puntajes entre lotes, y la Fase 6 sigue sin empezar.

- **El tueste ya es una variable: propósito y perfil.** `RoastSession` gana
  `purpose` (`sample`/`production`, obligatorio y sin defecto) y `recipeVersionId`
  anulable; `LotRoastProfile` guarda el **óptimo por lote**, y elegir otro
  reemplaza. Decisiones de Daniel. La migración se hizo defensiva y se probó en
  aislamiento. Mi archivo de prueba **compilaba mal** con las pruebas en verde: lo
  cazó `typecheck`, no la suite.

- **`npm run sensory:archive-protocol` retira un protocolo sin borrarlo**; hay
  cinco `TEST` activos en producción esperando. Hoy su efecto es sólo que el
  listado deja de mezclar retirados con vivos.

- **Nadie podía crear una sesión de cata** —sólo la semilla—, y **ésa era la
  razón de las cero valoraciones, no el protocolo**. Corrige además algo que dije:
  en producción SÍ había protocolo de café, el marcador `Coffee Cupping
  (Illustrative)`, que di por inexistente sin medirlo.

- **Ya se puede crear una sesión de cata** — la puerta que le faltaba al módulo.
  `crearSesionDeCata` monta sesión + vuelo + muestras ciegas + mapeo en **una
  transacción**, con pantalla en `/sensory/new`. Rechaza protocolo retirado y
  protocolo **sin atributos** — hay cinco así en producción. **Del método:** violé
  el guardia de audit atómico y lo cazó su prueba; y «muestra ajena» no se puede
  probar mientras sólo el admin cree sesiones — queda escrito como explicación,
  no como prueba que no puede fallar.

- **Una cata ya es de varios, y existe el rol que la dirige.** Perfil
  **`Cupping Host`** y permiso nuevo **`sample:view`** —`requireSampleAccess` lo
  aceptaba y no existía: nadie podía mirar una muestra sin poder cambiarla—.
  Corrige mi encuadre: no faltaba acceso al head judge, faltaba el rol; head
  judge y judges quedan para **competencia** (Daniel). Añadido **invitar
  participantes** (asignación de ámbito `session`, sin tabla nueva) y expuestos
  **propósito y tipo**. Lo enseñó la prueba: un ámbito estrecho no implica uno
  amplio, y `manage` no implica `view`.

- **Del plan S1 queda UNA entidad de la Tabla 15: el registro de microclima**
  (semanas 4–10), y está bloqueado en Daniel. `CLAUDE.md` §38 pide arquitectura
  separada para la serie temporal —~35.000 filas por sensor y año— y no dice
  cuál. **Es la única decisión de §6 que sigue abierta**: la de la enmienda la
  cerró Daniel el 2026-09-01 (opción A, `TreatmentBatch` con `locationId`) y ya
  está construida en #122.
- ~~Dos carreras en jornadas de campo~~ — **cerradas el 2026-08-31**. Estaban
  agrupadas aquí con la deuda de auditoría bajo «las tres tocan diseño de
  plataforma», y eso era falso de estas dos: el arreglo era local. Cierre con
  `updateMany` condicionado a `endedAt: null`, y `occurredAt > endedAt`
  distinguido de «llegó tarde», porque `FieldEvent` lleva `recordedAt`,
  `syncedAt` y `deviceId` — está pensado para llegar tarde, así que un evento
  sincronizado tras el cierre es el camino previsto y no un borde.
- ~~**Escritura y auditoría no son atómicas en 13 archivos**~~ — **cerrado el
  2026-09-06/07.** Ya no queda ninguna llamada que audite dentro de una
  transacción sin recibirla, ni ninguna que audite tras cerrarla, en `lib/`,
  `app/` ni `scripts/`. El guardia
  `tests/arquitectura/audit-atomico.test.ts` lo sostiene con 154 comprobaciones
  y sin lista que mantener. El detalle se archivó en
  `docs/SESSION_STATE_ARCHIVE.md` porque era registro de entrega dentro de una
  sección llamada «Bloqueado».

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
