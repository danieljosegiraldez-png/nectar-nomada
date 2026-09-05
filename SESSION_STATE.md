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

### 2026-09-04 · La Fase 4 arranca por el ticket

`46_P4_API_Y_SINCRONIZACION.md`, como 41–44: el ticket precede al código.
**Primera rebanada nombrada:** `Device` + tokens + push por lotes de UNA
categoría append-mostly, ejercida desde la PWA existente — lo que §26 del
audit ordena y lo que evita repetir la forma de P2 a mayor escala.

Su §0 contesta por adelantado la pregunta que saldrá sola —por qué esto no se
aplaza si P2 §1 sí se aplazó— y **corrige en el audit un «blocking
prerequisite» que P0 ya había resuelto**: `lotCode` y `sampleCode` son únicos
por organización desde hace una semana. Corregido en §18, no anotado.

**Tres decisiones son de Daniel**, al final del ticket: duración del refresh
token y de la instantánea de autorización, si el teléfono del molino es
compartido o personal, y qué pasa con una mutación rechazada que el operador
cree correcta. Ninguna bloquea la primera rebanada.

### 2026-09-04 · El diff invertido volvió, disfrazado de trabajo ajeno

Encontrado en el checkout compartido al ponerlo al día. `git status` daba dos
archivos **`M `** —modificados y escenificados—, 31 borrados y cero altas: la
medición del 14 % de `PENDING_IMPLEMENTATIONS/006` y la cabecera de identidad
de repositorio de `scripts/cierre-de-sesion.sh`.

**Nadie borró nada.** Esos bloques *entraron* en `main` el 2026-09-02
(`c768f97` 01:22, `a7a8f65` 01:47) y el árbol es anterior (`mtime` 2026-08-31
y 2026-09-02 00:58); el reflog enseña `branch: Reset to origin/main` a las
01:43 y 01:59. El puntero avanzó sin tocar el árbol y git reportó al revés lo
que había llegado — la sección «Adelantar el puntero de una rama no mueve el
árbol» de `CLAUDE.md`, repitiéndose dos días después de escribirse.

**Lo único nuevo, y lo que hay que recordar: la firma se lee como trabajo en
curso de otra sesión.** `M ` significa escenificado, así que la lectura amable
—«es de alguien, no lo toco»— es la equivocada, y es la que lo mantuvo dos
días armado; estuve a punto de dejarlo por respeto. Lo deshace fechar: si los
archivos del árbol son **anteriores** a los commits que traen esas líneas,
nadie borró, llegó.

Importaba porque entre lo «borrado» estaba la cabecera que dice de qué
repositorio habla el informe de cierre —puesta tras correr el cierre del repo
equivocado dos veces—: cualquier commit ahí la habría revertido en silencio.

Resuelto con `git restore --staged --worktree` y verificado **por presencia**
(`grep -c` = 1 y 1). Barridos los nueve worktrees de los dos repositorios:
**ninguno más**, y lo dice un detector con flip-test —`git diff --shortstat
HEAD` no vacío sobre un árbol rezagado de su puntero, reproducido en un repo
de juguete—, no un verde sin control. Los dos checkouts compartidos quedan en
`main` con el árbol coincidiendo con su `HEAD`.

### 2026-09-04 · La Fase 2 del Field OS, cerrada por lo que NO se construyó

`43_P2_OPERATOR_CORE.md` §0 exigía contestar «¿por qué no se ha creado nunca
ninguna tarea?» antes de extender `partner.Task`. Re-medido contra producción
con control positivo (17 personas, 3 proyectos, 40 assignments): `partner.task`
**0**, `field_submission` **0**, y —lo nuevo— `field_session` **0** y
`field_event` **0**. La mitad de la Fase 2 que sí se construyó hace una semana
tampoco tiene una sola fila. Daniel contestó: nunca se asignó trabajo por la
plataforma. Es la rama que §0 nombra, y su instrucción es aplazar §1–§2 por
especulativos. **ADR-107.**

Entregado: §6 (GPS en `core.asset` — `latitude`/`longitude`/`accuracy_m`, que
`locationId` no puede expresar porque una ladera no es una `Location`) y el
resto de §5 (`clock_offset_ms` en las seis tablas que ya llevan `recorded_at`,
`synced_at` y columna de dispositivo). Nueve columnas, todas anulables, cero
backfill. Verificado con `migrate diff` vacío **y su flip-test**: quitando una
columna el diff la nombra.

**Dos cosas que encontré de paso y no son mías:**

- **La suite de `main` estaba roja y CI verde.** Dos secciones de §3 usaban
  `###` sin fecha y `tests/archivo-de-estado.test.ts` las rechaza — con razón:
  un `###` no fechado trunca a su padre al archivar. Bajadas a `####` aquí.
  **CI no lo vio porque ese test no está en la lista enumerada a mano de
  `scripts/ci.sh`**, que es exactamente `PENDING_IMPLEMENTATIONS/008` pasando
  de verdad en lugar de en teoría.
- **`COFFEE_FIELD_OS_AUDIT.md` afirmaba cosas falsas.** Su §59 decía «no se
  implementó nada» y su tabla de validación daba 531 tests; hoy son cuatro
  fases construidas y 940. Corregido con un bloque de estado fechado, porque
  esa página es lo primero que lee quien retoma el Field OS.

## 3. Bloqueado, y en qué


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


#### El rojo de `main` es cuota, no código — y se queda rojo para siempre

**Comprobado el 2026-09-03. Si lees `main` en rojo, empieza por aquí antes de
tocar nada.**

`3858cde` y los cinco commits anteriores tienen el check de Vercel en `failure`
con «Deployment rate limited — retry in 24 hours». **No es un build roto: es el
tope diario del plan gratuito, que diez PR con sus previews agotaron.** Ese rojo
no se va a arreglar solo ni con el cambio de plan: es un estado histórico de un
commit que Vercel rechazó sin llegar a construir.

**Cómo distinguir cuota de build roto, en orden de fiabilidad:**

1. **La URL del check.** Una cuota apunta a la página de venta
   (`?upgradeToPro=build-rate-limit`); un build real apunta al despliegue
   (`/nectar-nomada-package/<id>`). Es el discriminante limpio:

   ```bash
   gh api repos/danieljosegiraldez-png/nectar-nomada/commits/<sha>/status \
     --jq '.statuses[] | select(.context=="Vercel") | .state + " -> " + .target_url'
   ```

2. **No hay fila en el panel.** Una cuota no crea despliegue, así que **no hay
   nada que redesplegar** — buscar el botón *Redeploy* de ese commit es buscar
   algo que no existe. Sólo un push nuevo despliega.
3. **La duración**, ya en `CLAUDE.md`: 18-20 s es un build que corrió y falló;
   33-59 s uno bueno. Sirve cuando sí hay fila.

**Daniel subió a PRO el 2026-09-02.** Verificado que funciona: un preview
construyó en 35 s después del cambio. Lo que el PRO **no** hace es volver atrás
a construir lo ya rechazado.

**Qué hay sin desplegar, medido y no estimado:** seis commits, y tocan sólo
documentación y herramientas — **ni código de la app, ni esquema, ni migración
pendiente**. Producción sirve el build de `2026-09-02 00:20` (Ready, 51 s) y no
le falta nada que un usuario pueda ver. El hueco se cierra solo con la próxima
fusión de cualquier sesión.

**Lo que sí quedó cerrado:** el `export class FechaInvalidaError` en un archivo
`"use server"` que tumbó `next build` con 69 errores el 2026-09-01 **está
arreglado y desplegado** — el despliegue de las 00:20 llegó a *Ready*, que era la
comprobación que esta sección dejaba pendiente. La migración
`20260901100000_s1_invariantes_en_la_base` entró con él. El guardia de fuente
(`tests/arquitectura/use-server-solo-async.test.ts`) pasó flip-test el
2026-09-03: 16/16 con el código bueno, y con la clase exportada reintroducida
cae uno solo, nombrando la línea. La compuerta sigue sin correr `next build`.

- **Aviso fiable de que un backup no corrió** — **desbloqueado el 2026-09-04.**
  Probado de punta a punta con una corrida real de `run-scheduled.sh`: salió el
  ping `/start`, el backup se escribió, `verify-restore` dio PASS —135 tablas,
  14.706 filas, conteos idénticos en un PostgreSQL 18 limpio, sin Neon— y solo
  entonces salió el ping de éxito. Daniel confirmó la recepción en el panel de
  healthchecks.io, que es la mitad que no se puede verificar desde aquí.
  **El log no se cree a sí mismo:** «ping enviado» solo se escribe si `curl -fsS`
  recibió un 2xx. Flip-test el mismo día: un UUID inexistente y un dominio
  inválido dan los dos «NO salió».
  **Lo que cubre y lo que no.** El backup corre **los lunes a las 09:00**, no a
  diario, así que el check está configurado con periodo de 1 semana y margen de
  2 días — margen ancho a propósito, porque `StartCalendarInterval` hace que un
  portátil dormido corra el trabajo **al despertar**, y un margen corto daría
  falsas alarmas cada fin de semana largo. Sigue sin cubrirse el caso de destino
  no montado: el wrapper sale 0 **en silencio** y no manda ni `/start`, de modo
  que su ausencia es la señal — eso es el diseño, no un descuido, y es justo lo
  que healthchecks.io convierte en alarma pasado el margen.
- **Dar acceso a alguien más que Daniel y José** — bloqueado en P-C. Medido el
  2026-08-29: 13 de 14 cuentas siguen en `invited` sin clave. Bob y Sherry
  tienen 10 Assignments cada uno y Chris 2 — 22 en total que resuelven bien y
  no llegan a nadie, porque ninguna de las tres Personas tiene correo.
  ADR-083 ya arregló el callback que rechazaba `invited`: la puerta funciona,
  falta a quién darle la llave.
- **Que la compuerta sea *obligatoria* para fusionar** — CI existe desde el
  2026-08-28 (`.github/workflows/ci.yml` → `scripts/ci.sh`: typecheck,
  presupuesto de estado, inventario de rutas, lint y **ocho** archivos de test
  herméticos), y corre en cada push y cada PR. Lo que sigue bloqueado es que
  **impida** fusionar: la protección de ramas no está disponible en un
  repositorio privado de este plan («Upgrade to GitHub Pro»). Hoy CI informa,
  no impide, y esa diferencia es de Daniel. Tampoco cubre la suite completa —
  necesita `npm run test:db -- up` y un runner no tiene ese backup. Ver
  `PENDING_IMPLEMENTATIONS/006`.
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
- **DOS migraciones sin desplegar, y todo el código desde #122** —
  `20260901090000_s1_amendment_application` y
  `20260901100000_s1_invariantes_en_la_base`. El límite diario de builds de
  Vercel saltó a media tanda y no volvió a despejarse. **No hay
  inconsistencia**: código y migraciones quedaron fuera juntos, y producción
  sirve un build anterior. Cuando se despeje, un *Redeploy* sobre el último
  commit de `main` las aplica las dos.
  **Cómo comprobarlo, y no como lo comprobé mal dos veces:** el check de Vercel
  que pasa en una PR es el de *preview* y no dice nada de producción. El que sí
  lo dice es `gh api repos/<owner>/<repo>/commits/<sha>/status`, y después el
  log de construcción, que nombra cada migración aplicada.
- **Las páginas de `app/` no las ha revisado nadie** — no está bloqueado, está
  *sin mirar*. Cuatro pasadas cubrieron servicios, tests, migraciones y acciones;
  quedan las páginas (12.625 líneas, el paquete ya se sabe armar). Las cuatro
  encontraron algo real cada vez —6, 5, 4 y 5 hallazgos— así que la curva no
  baja, y eso dice más sobre el ritmo del día que sobre los defectos concretos.
  Las dos preguntas que la primera revisión dejó abiertas **ya están
  contestadas**: `createTreatmentBatch` no puede crear un tratamiento de terreno
  (#127, con `locationId: null` explícito y dos tests), y la pasada de tests
  contestó la segunda encontrando cinco que no discriminaban.
- **Del plan S1 queda UNA entidad de la Tabla 15: el registro de microclima**
  (semanas 4–10), y está bloqueado en Daniel. `CLAUDE.md` §38 pide arquitectura
  separada para la serie temporal —~35.000 filas por sensor y año— y no dice
  cuál. **Es la única decisión de §6 que sigue abierta**: la de la enmienda la
  cerró Daniel el 2026-09-01 (opción A, `TreatmentBatch` con `locationId`) y ya
  está construida en #122.
- **Nadie ha usado ninguna de las pantallas nuevas** —cinco en agosto, más las de biochar, calicata, muestras y fotos. Todo lo que se sabe
  de ellas se sabe de la copia local restaurada. Que un operador real las
  recorra es la única prueba que falta, y la que suele encontrar lo que ninguna
  verificación encuentra.
- ~~Dos carreras en jornadas de campo~~ — **cerradas el 2026-08-31**. Estaban
  agrupadas aquí con la deuda de auditoría bajo «las tres tocan diseño de
  plataforma», y eso era falso de estas dos: el arreglo era local. Cierre con
  `updateMany` condicionado a `endedAt: null`, y `occurredAt > endedAt`
  distinguido de «llegó tarde», porque `FieldEvent` lleva `recordedAt`,
  `syncedAt` y `deviceId` — está pensado para llegar tarde, así que un evento
  sincronizado tras el cierre es el camino previsto y no un borde.
- **Escritura y auditoría no son atómicas en 13 archivos.**
  Desde el 2026-08-31 `recordAuditEvent` acepta un `tx` **opcional** que confirma
  el audit junto a la escritura; por defecto usa el cliente global, así que las
  89 llamadas existentes no cambian. Lo adoptan ya `plantingCohorts.ts` (con un
  test que fuerza el fallo del audit y comprueba que la cohorte tampoco queda) y
  **todos los módulos de S1**: `biocharBatches.ts`, `soilProfiles.ts`,
  `soilSamples.ts`, `landMedia.ts`, `research/amendments.ts` y **`measurements.ts`
  entero** —la corrección desde el 2026-08-31, y la creación desde que la
  revisión señaló que esas filas abren Gate 0—. Módulo
  nuevo, `tx` desde el principio; el coste sólo existe al convertir lo viejo.
  **Quedan 13 archivos que abren transacción y auditan fuera:**
  `research/analysis.ts` (7 llamadas), `research/protocols.ts` (6),
  `traceability/harvest.ts`, `samples.ts`, `drying.ts`, `fermentation.ts`,
  `lots.ts`, `roasting.ts`, `apiary/harvest.ts`, `commerce/orders.ts`,
  `experiences/bookings.ts`, `sensory/service.ts`, `auth/config.ts`. Los otros
  28 que auditan **no** abren transacción, así que no tienen nada que hacer
  atómico.
  **Restricción al adoptarlo:** pasar `tx` obliga a que el llamador no abra otra
  transacción dentro — Prisma no las anida, y por eso `renovatePlantingCohort`
  crea su cohorte de reemplazo fuera de la suya.
  Lo que queda es decisión, no trabajo mecánico: si los 13 se convierten de una
  o al tocarlos.
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

- **Un test hermético nuevo no corre en CI** — `scripts/ci.sh` los enumera a
  mano, así que uno nuevo queda fuera en silencio y la compuerta sale verde.
  Comprobado el 2026-09-01: sólo se vio porque el recuento no subió. La
  comprobación que falta exige decidir **cómo se reconoce que un test necesita
  base de datos**, y las tres opciones no cuestan lo mismo. Ver
  `PENDING_IMPLEMENTATIONS/008`.

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
