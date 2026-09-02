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

### 2026-09-01 · El plan S1, y la revisión que desmontó su pieza central

`origin/main` = `84a51de`. Nueve PR de código —#103 (plan), #105 (`aspect`),
#108 (biochar), #110 (sujeto no-café), #111 (calicata), #115 (muestras), #117
(fotos), #122 (enmienda), #125, #127, #128 y #130 (los arreglos de las cuatro
revisiones)— más cinco de estado. Suite 731 → **865**.

Daniel aportó *«Las Nubes Cerro Azul — Soil, Environment and Cup Quality:
Research Framework v1.0»* (13.345 palabras, firmado por Bob, Sherry y Daniel).
`docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md` traduce su Tabla 15 al
esquema. **No es un resumen del marco; el marco manda.** De sus catorce
entidades, ocho ya tenían dónde vivir; **de las seis que faltaban, cinco se
construyeron** y sólo el microclima sigue abierto, por una decisión.

**§0 manda sobre todo: la recomendación principal del marco es un ALTO.** Ningún
bloque nuevo recibe biochar hasta que existan la química base, la física base,
un lote caracterizado y el protocolo escrito — firmado como Gate 0. Lo que eso
implica para el software es una sola cosa: la primera fila que el sistema
escriba sobre un bloque tiene que poder ser **la línea base, no la enmienda**.

**El orden de construcción es el del Plan de Acción del marco**: se construye en
el orden en que el dato aparece, no en el que el modelo se lee.

| pieza | qué la define |
|---|---|
| `Location.aspect` | Enum, rompiendo con el precedente de texto libre: la rosa de los vientos no se inventa |
| `BiocharBatch` | Dosis, frecuencia y parcela **no** están: un lote se aplica en varios bloques |
| `Measurement` no-café | Autorización **por rama** y sujeto **exclusivo**: dos permisos no se acumulan sin que el más laxo abra lo del otro |
| `SoilProfile` | **Tres estados, no un booleano**: «no se miró» ≠ «no había», y confundirlos manda a fertilizar un problema de aire |
| `SoilSample` / `FoliarSample` | Un análisis foliar sin protocolo es **incomparable**, peor que no tenerlo porque parece que sirve |
| Fotos de Location | El padre debe pertenecer a la Location autorizada, o quien tiene A cuelga en B |
| Aplicación de enmienda | Gate 0: se niega mientras falte cualquiera de las cuatro, y dice cuáles |

---

**Y entonces cuatro revisiones independientes desmontaron buena parte de eso.**

Se revisó por partes, porque un paquete de un día entero son 8.255 líneas y ése
es el tamaño que ya colgó una revisión: **servicios** (`lib/`), **tests**,
**migraciones** y **acciones de servidor**. Quedan sin revisar las páginas.

| pasada | halla | reales | rechazados |
|---|---|---|---|
| servicios | 7 | 6 | 1 |
| tests | 5 | 5 | 0 |
| migraciones | 8 | 4 | 2 (+2 imposibles) |
| acciones | 5 | 5 | 0 |

**Un solo patrón las une, y es sobre cómo escribo.** Llamé «estructural» a lo que
sólo comprobaba el servicio — tres veces:

- «**Gate 0 hecho estructura**» sobre una compuerta que miraba *que existiera una
  fila*: un Brix colgado de una muestra de suelo abría «química base», y no había
  comprobación temporal, así que una lectura fechada **después** del tratamiento
  servía de línea base.
- «cada sujeto nuevo **excluye** `lot_id`» en el SQL, cuando
  `traceability.measurement` **no tenía ni un solo CHECK**.
- «la regla es estructural aquí» sobre el compuesto de una muestra de suelo.

Lo demás, en una línea cada uno: `requireResearchAccess` **retorna al primer
target que pasa** —autorización alternativa, no coherencia— y el `locationId`
aquí lo elige el usuario; `createBiocharBatch` aceptaba la organización del
llamador; `applyAmendment` no validaba catálogos ni enums; el audit se escribía
fuera de la transacción; las acciones de corrección **borraban lo que el POST no
mencionaba**; cuatro fechas obligatorias se inventaban como «ahora»;
`2026-02-31` se convertía en el 3 de marzo en silencio.

**Y cuatro tests llamados «en la misma transacción» no podían fallar**:
comprobaban que el audit existiera *después de que todo salió bien*. Con el `tx`
quitado, la suite de `soilProfiles` pasaba 20/20. Ahora hay un guardia de fuente
—`tests/arquitectura/audit-atomico.test.ts`— que lee los siete servicios.

**Lo rechazado, con su razón escrita:** `creatorPersonId` del llamador (§4 ya lo
guarda: el fotógrafo suele no tener cuenta) y hacer `NOT NULL` los campos de
protocolo — prohibir la fila **perdería el dato en vez de señalarlo**, y la ficha
ya dice cuáles faltan.

**Lo que no se puede hacer como se propuso:** atar por FK compuesta la
organización de un lote a la de su Location. `location.organization_id` es
nullable porque una parcela hereda el dueño de su finca, y una FK compuesta con
columna nula pasa por `MATCH SIMPLE`. Queda **escrito en la migración**.

**Cuatro guardias del repositorio pararon trabajo, y los cuatro tenían razón.**
El que más: `navigation.test.ts` exige ≤8 entradas de menú y yo había añadido una
novena. Se revirtió.

**Y ocho veces en el día un guardia o una sonda míos resultaron falsos.** Un test que comparaba
una unión contra sí misma; un valor por defecto que lo volvía infalsificable y
además metía variables de laboratorio en el desplegable de recetas; y **cuatro
flip-tests que pasaron por la razón equivocada** — uno porque la mutación cayó
donde nada la miraba, uno porque ni siquiera se aplicó, dos porque el test que
yo creía que lo cubría probaba otra cosa.

Dos más al final, comprobando las restricciones nuevas contra la base: la sonda
salió **vacía** porque las subconsultas devolvían `NULL` con la base de test
limpia, y una llegó a insertar una fila sin sujetos. Se leía igual que un verde.

Las reglas que quedan, y son tres:

1. **Un flip-test no vale hasta ver caer al test que se cree que lo cubre** —
   mirar *cuál* cae, no sólo que caiga alguno.
2. **Antes de creer que una mutación probó algo, comprobar que se aplicó**
   (`diffstat`).
3. **Una sonda contra la base necesita control positivo**: si la fila que debía
   ser rechazada no llegó a construirse, «no entró» no prueba nada.

`tools/pack-for-review.sh` gana filtro de rutas: su cabecera prometía «se
comprime por selección» y no ofrecía ninguna. 8.255 líneas → 1.713.

**Lo que la revisión NO pudo mirar:** migraciones, esquema, acciones, pantallas
y **todos los tests**. Dos preguntas suyas siguen abiertas — si
`createTreatmentBatch` puede crear un tratamiento de terreno saltándose Gate 0,
y si los tests discriminan de verdad.

**Sin comprobar:** el esquema vivo consultado contra la base. El `DATABASE_URL`
de producción sólo vive en la config de Vercel y no se descargó. Falta abrir
`/plots/<lote>` en producción y ver que renderiza.

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
