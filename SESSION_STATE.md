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
| P-A | Alerta de backup **fuera de esta máquina** | Necesita un servicio externo que el proyecto no usa: es cuenta y gasto suyos. Hoy la alerta es local, y un portátil cerrado quince días no respalda nada y no dice nada | `! grep -rqiE "healthcheck\|hc-ping\|cronitor" scripts/backup/` |
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

### 2026-09-01 · El plan S1 entero, salvo el microclima — y desplegado

`origin/main` = `44fece6`. PR #103 (plan), #105 (`aspect`), #108 (biochar),
#110 (sujeto no-café), #111 (calicata), #115 (muestras), #117 (fotos).
Suite 731 → **834**.

Daniel aportó *«Las Nubes Cerro Azul — Soil, Environment and Cup Quality:
Research Framework v1.0»* (13.345 palabras, firmado por Bob, Sherry y Daniel).
`docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md` traduce su Tabla 15 al
esquema. **No es un resumen del marco; el marco manda.** De sus catorce
entidades, ocho ya tenían dónde vivir; **de las seis que faltaban, cinco se
construyeron hoy** y sólo el microclima sigue abierto, bloqueado en una decisión.

**§0 manda sobre todo lo demás: la recomendación principal del marco es un
ALTO.** Ningún bloque nuevo recibe biochar hasta que existan la química base, la
física base, un lote caracterizado y el protocolo escrito — firmado como Gate 0.
Lo que implica para el software es una sola cosa: la primera fila que el sistema
escriba sobre un bloque tiene que poder ser **la línea base, no la enmienda**.

**El orden de construcción es el del Plan de Acción del marco, con sus semanas**
— se construye en el orden en que el dato aparece, no en el que el modelo se lee.

| pieza | qué la define |
|---|---|
| `Location.aspect` | Enum, rompiendo con el precedente de texto libre: la rosa de los vientos no se inventa, y el uso del marco es **comparativo** |
| `BiocharBatch` | Dosis, frecuencia y parcela **NO** están: la Tabla 6 las lista porque es papel, pero un lote se aplica en varios bloques |
| `Measurement` no-café | Autorización **por rama** y sujeto **exclusivo**: dos permisos distintos no se acumulan sin que el más laxo abra lo del otro |
| `SoilProfile` | **Tres estados, no un booleano**: «no se miró» ≠ «no había», y confundirlos manda a fertilizar un problema de aire |
| `SoilSample` / `FoliarSample` | Un análisis foliar sin protocolo es **incomparable**, que es peor que no tenerlo porque parece que sirve |
| Fotos de Location | El padre debe pertenecer a la Location autorizada, o quien tiene A cuelga en B |

**Cuatro guardias del repositorio pararon trabajo, y los cuatro tenían razón.**
El que más: `navigation.test.ts` exige ≤8 entradas de menú y yo había añadido una
novena. Se revirtió; el enlace vive en `/plots`.

**Tres guardias resultaron falsos, y dos los había escrito yo el mismo día:**

- Un test de cobertura de dominios comparaba la unión de dos paneles contra la
  unión de **esos mismos dos paneles**. No podía fallar.
- Un `?? ["proceso_de_cafe"]` volvía infalsificable ese guardia *y* metía en
  silencio cualquier variable de laboratorio nueva en el desplegable de recetas
  de café. Ahora `PANELES` es un `Record` total: **el compilador** obliga a
  declarar el panel de cada variable nueva.
- Un flip-test pasó porque la mutación cayó sobre fósforo y sólo potasio tenía
  aserción — la definición del nutriente estaba repetida **nueve veces**.
  Extraída a una constante.

**Y un flip-test que salió verde sin haberse aplicado:** la mutación tocaba un
JSON que se reescribe al guardarse, la cadena ancla ya no existía y el `replace`
no hizo nada. Sólo lo dijo el `diffstat`. Desde entonces **cada mutación imprime
que se aplicó** antes de que se lea el veredicto.

**Desplegado y comprobado contra el registro, no contra el «success».** La cuenta
de Vercel agotó su límite diario de builds a media tanda, así que cinco merges no
construyeron; al despejarse, un solo despliegue aplicó **las seis migraciones**,
nombradas una a una en el log de construcción, con cero errores y el seed
después. `main` y producción vuelven a estar al día.

**Sin comprobar:** el esquema vivo consultado contra la base. El `DATABASE_URL`
de producción sólo existe en la config de Vercel y no se descargó — un secreto
que no hace falta no se toca. La comprobación que falta es abrir
`/plots/<lote>` en producción y ver que renderiza.

## 3. Bloqueado, y en qué

- **Aviso fiable de que un backup no corrió** — bloqueado en P-A. Hoy la señal
  es local: una notificación de macOS, un `BACKUP-FAILED.txt` junto a los
  backups, y `launchctl list | grep nectar` como único rastro pasivo.
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
- **Del plan S1 queda UNA entidad de la Tabla 15: el registro de microclima**
  (semanas 4–10), y está bloqueado en Daniel. `CLAUDE.md` §38 pide arquitectura
  separada para la serie temporal —~35.000 filas por sensor y año— y no dice
  cuál. La otra decisión abierta es la aplicación de enmienda: reusar
  `TreatmentBatch` con `locationId`, o entidad propia. Las dos están en §6 de
  `docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md`, con recomendación.
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
  `soilSamples.ts`, `landMedia.ts` y la corrección de `measurements.ts`. Módulo
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
