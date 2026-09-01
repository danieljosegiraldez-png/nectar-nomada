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
| P-A | Alerta de backup **fuera de esta máquina** | Necesita un servicio externo que el proyecto no usa: es cuenta y gasto suyos. El código del ping ya está hecho (`ping_health` en `run-scheduled.sh`, con `/start`, `/fail` y éxito solo tras verificar la restauración); falta la URL, que es la cuenta de Daniel. Sin ella, un portátil cerrado quince días no respalda nada y no dice nada | Las **dos** mitades, y la fuente única es `scripts/open-decisions.sh` — no duplicar aquí: código (`ping_health` presente) **y** URL (`NN_HEALTHCHECK_URL=https…` activa en `~/.config/nectar-nomada/backup.env`, hoy comentada). Una sola mitad no es una alarma |
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

### 2026-09-01 · Lo mecánico del cierre deja de re-teclearse

`scripts/cierre-de-sesion.sh`. §5 describía el cierre en prosa; esa prosa se
re-tecleó seis veces el 2026-08-31 y **una salió mal**: la comprobación de
sincronía trataba cualquier archivo sucio —incluido uno **sin seguimiento** de
otra sesión— como razón para no sincronizar. El checkout se quedó detrás de un
merge propio y el informe dio 11 pruebas donde había 14. La propiedad es
«¿chocaría el pull?», no «¿hay algo sucio?».

Comprueba sincronía con `origin/main` en las tres direcciones, cambios con
seguimiento sin commitear, worktrees ajenos con trabajo sin empujar, presupuesto
del estado, pruebas de decisión rotas, disco libre contra lo que cuesta un
`npm ci`, y la compuerta. **No commitea, no empuja, no borra**, y los worktrees
ajenos los informa sin tocarlos. Termina nombrando lo que ningún script puede
hacer —estado al día, lección escrita donde se cargue, verificado contra
asumido— en vez de fingir que el cierre ha terminado.

Dos de sus ramas se dispararon solas mientras se escribía: «detrás de
origin/main», porque otra sesión empujó, y «commits sin empujar», sobre su
propio commit. Son la mejor prueba del cambio porque no las construí yo.

También de esta sesión: **una fusión limpia duplicó una sección archivada** —dos
sesiones archivaron la misma, en posiciones distintas, git no vio solape—. Lo
comprueban ahora `tests/archivo-de-estado.test.ts` y su gemelo en el repositorio
web. `SESSION_STATE.md` sí dio conflicto y por eso se miró; el archivo histórico
no dio ninguno. Una fusión limpia no dice que el resultado sea correcto.

### 2026-09-01 · El marco de suelo y taza, y las tres primeras piezas del plan

`origin/main` = `674f80b`. PR #103 (plan), #105 (`aspect`), #108 (biochar), #110
(sujeto no-café), #111 (calicata). Suite 731 → **798**.

Daniel aportó *«Las Nubes Cerro Azul — Soil, Environment and Cup Quality:
Research Framework v1.0»* (13.345 palabras, firmado por Bob, Sherry y Daniel).
`docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md` traduce su Tabla 15 al
esquema. **No es un resumen del marco; el marco manda.** Ocho de sus catorce
entidades ya tenían dónde vivir. **El orden de construcción es el del Plan de
Acción del marco, con sus semanas** — se construye en el orden en que el dato
aparece, no en el que el modelo se lee.

**§0 del plan manda sobre todo lo demás: la recomendación principal del marco es
un ALTO.** Ningún bloque nuevo recibe biochar hasta que existan la química base,
la física base, un lote caracterizado y el protocolo escrito. Está firmado como
Gate 0. Lo que implica para el software es una sola cosa: la primera fila que el
sistema escriba sobre un bloque tiene que poder ser la línea base, no la
enmienda.

**Lo construido, en el orden del marco:**

- **`Location.aspect`** (semanas 1–4). La orientación se colaba dentro de
  `slopeDescription` como prosa —el test de F1 decía `"moderate, east-facing"`—
  donde ninguna consulta la agrupa. Enum y no texto libre, rompiendo a propósito
  con el precedente de `slopeDescription`/`soilType`: aquellos son texto porque
  nadie dio una lista, y **la rosa de los vientos no se inventa**.
- **`BiocharBatch`** (semanas 1–4), con los campos de la Tabla 6. **Dosis,
  frecuencia y parcela tratada NO están ahí**: la Tabla 6 las lista porque es un
  formulario de papel, pero un lote se quema una vez y se aplica en varios
  bloques a dosis distintas. Van a la aplicación de enmienda, que sigue
  bloqueada en Daniel.
- **`Measurement` acepta un sujeto que no es café** (PR #110). Los ocho FK que
  tenía eran todos de la cadena del café. La autorización se resuelve **por
  rama** y el sujeto es **exclusivo**: `BiocharBatch` se gatea con
  `location:manage_attributes`, y dos permisos distintos no se pueden acumular
  en una lista de candidatos sin que el más laxo abra lo del otro.
- **`SoilProfile` + `SoilHorizon`** (semanas 3–6), la calicata. **Tres estados,
  no un booleano**, en las cuatro señales de anaerobiosis: un booleano nullable
  confunde «no se miró» con «no había», y ésa es la confusión que mandaría a la
  finca a fertilizar un problema de aire (§6.1 del marco).

**Cuatro guardias del repositorio pararon trabajo, y los cuatro tenían razón.**
El que más: `navigation.test.ts` exige ≤8 entradas de menú y yo había añadido una
novena para el biochar. Se revirtió — el enlace vive en `/plots`. Los otros tres
eran contadores fijados a propósito (rutas, inventario de acceso) y una nota que
había dejado de ser cierta.

**Un flip-test salió verde por la razón equivocada** (PR #110): la mutación
tocaba un JSON que se reescribe al guardarse, la cadena ancla ya no existía y el
`replace` no hizo nada. Sólo lo dijo el `diffstat`. Desde #111, **cada mutación
imprime que se aplicó** antes de que se lea el veredicto.

`tests/ui/valoresEnumerados.test.ts` nació con `aspect` y ya cubre seis enums más
las etiquetas de las variables de laboratorio, **sin tocar su lógica**: sólo hubo
que nombrarlos. `tests/traceability/units.test.ts` entró en `scripts/ci.sh`.

**Sin verificar en ninguna de las cinco: la pantalla viva.** Un worktree no
hereda `.env`, así que auth no arranca ahí (`MissingSecret`) y las rutas
redirigen a `/login` — correcto, pero no deja ver los formularios.

## 3. Bloqueado, y en qué

- **Aviso fiable de que un backup no corrió** — bloqueado en P-A, y ya solo por
  la URL. El código está hecho y en main: `ping_health` manda `/start`, `/fail`
  y el ping de éxito *después* de verificar la restauración, con la URL leída de
  `~/.config/nectar-nomada/backup.env` — fuera del repositorio, porque quien
  tenga esa URL puede señalar «el backup va bien» y tapar un fallo real.
  Mientras la línea siga comentada no sale ningún ping, y la señal es solo
  local: una notificación de macOS, un `BACKUP-FAILED.txt` junto a los backups,
  y `launchctl list | grep nectar` como único rastro pasivo. Los tres hablan
  hacia dentro de esta máquina, que es exactamente lo que P-A no arregla sin
  cuenta externa.
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
- **`main` va por delante de producción: CUATRO migraciones sin desplegar** —
  la cuenta de Vercel agotó su límite diario de builds el 2026-09-01
  («Deployment rate limited — retry in 24 hours»), así que los merges de #105,
  #108, #110 y #111 no construyeron. **No hay inconsistencia**: código y
  migraciones quedaron sin desplegar juntos, y producción sigue sirviendo el
  build de #103. Cuando el límite se despeje hay que **disparar un despliegue de
  producción** para que `scripts/vercel-build.sh` corra `prisma migrate deploy`.
  Las cuatro, en orden: `20260901030000_s1_location_aspect`,
  `20260901040000_s1_biochar_batch`,
  `20260901050000_s1_measurement_biochar_subject`,
  `20260901060000_s1_soil_profile`.
- **Fotos con ámbito de Location** — no está bloqueado, está *pendiente*, y ya
  hace falta en dos sitios: el Paso 2 del marco pide fotografiar el retorte y el
  proceso, y el Paso 4 fotografiar cada perfil de calicata **con escala**. El
  flujo de subida actual (`requestLotAssetUpload`) cuelga de un `Lot` y se gatea
  con `lot:manage`, así que un lote de biochar y una calicata no tienen por
  dónde. Es una pieza que desbloquea dos cosas ya construidas, igual que hizo el
  sujeto no-café de `Measurement`.
- **Del plan S1 quedan dos entidades de la Tabla 15.** `SoilSample` y
  `FoliarSample` (semanas 6–10) no dependen de ninguna decisión: el patrón está
  entero desde la PR #110 —sujeto propio en `Measurement`, rama de autorización,
  vocabulario en el registro canónico— y falta el de la Tabla 3 (CEC efectiva,
  acidez intercambiable, Al intercambiable) y las cifras físicas de la Tabla 4.
  El **microclima** (semanas 4–10) sí está bloqueado: `CLAUDE.md` §38 pide
  arquitectura separada para la serie temporal y no dice cuál, y esa decisión es
  de Daniel. Ver §6 de `docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md`, donde
  están las tres abiertas.
- **Nadie ha usado ninguna de las cinco pantallas nuevas.** Todo lo que se sabe
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
- **Escritura y auditoría no son atómicas — salvo en `plantingCohorts.ts`.**
  Desde el 2026-08-31 `recordAuditEvent` acepta un `tx` **opcional** que confirma
  el audit junto a la escritura; por defecto usa el cliente global, así que las
  89 llamadas existentes no cambian. Adoptado en las cuatro de
  `plantingCohorts.ts`, con un test que fuerza el fallo del audit y comprueba
  que la cohorte tampoco queda.
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
