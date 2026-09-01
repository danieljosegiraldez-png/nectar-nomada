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

### 2026-08-31 · La revisión independiente encontró lo que doce compuertas verdes no

Doce PR fusionadas con un solo par de ojos encima. Codex revisó el núcleo lógico
—1.439 líneas— y encontró **siete problemas**. Cuatro eran de código de ese día
y están arreglados (PR #87).

El más incómodo: **un año sin ningún aporte pesado devolvía `0 kg/ha`, y el
propio test lo exigía**, con un comentario que admitía que el 0 era «engañoso
por sí solo». Se vio el problema, se escribió en un comentario y se despachó
igual, confiando en que el conteo de aportes sin pesar al lado lo salvara. No lo
salva: un 0 en una columna de kilos se lee como medición (ADR-080).

Los otros tres: `getHarvestSourceContext` filtraba los bloques que **ofrece** y
no los que **muestra**, devolviendo datos de bloques ajenos mientras su
comentario afirmaba lo contrario; `createPlantingCohort` guardaba una densidad
derivada que sobrevivía a la corrección de sus dos insumos; y tres tests exigían
la **clase** del error en vez del código, así que pasaban por la validación
equivocada.

**Y al arreglarlos pasó otra vez.** El flip-test de los dos primeros arreglos
pasó con los fallos reintroducidos: no existía un usuario que alcanzara el
bloque A y no el B, ni una aserción que mirara la columna de densidad. El mismo
defecto que la revisión acababa de señalar, cometido al corregirlo. Ahora con
cada fallo puesto cae un test.

**La lección operativa, no la moral:** compuerta, suite y verificación en
navegador comprueban *ejecución*. Ninguna comprueba *criterio* — que un cero sea
una afirmación, que un comentario diga la verdad. Para eso está
`tools/pack-for-review.sh`, y el paquete completo del día salía en 48.000 líneas
porque incluye el cuerpo entero de cada archivo tocado: **acotar el rango al
núcleo lógico** lo dejó en 2.958 y en una pasada.

### 2026-08-31 · La visita al apiario como unidad, y el módulo que no necesitaba código

El dueño tiene **reportes de visita a apiarios ya escritos**. Medido antes de
construir: el módulo de apiario **no tenía el hueco de siempre** — sus 21
funciones ya tienen pantalla, incluida una cola offline. Y de §19 no faltaban
«Honey Batch» ni «Extraction»: son `Lot` con `lotType: "honey"` (A3) y
`extractedWeightKg`. Dos veces creí ver un fallo y las dos veces leí mal.

Lo que sí faltaba era **lo que hace que un reporte sea un reporte**: que las
inspecciones de una misma salida sean *la misma salida*. Las inspecciones son
por colonia, así que una visita a cuatro colmenas eran cuatro registros sueltos.

`fieldSessions` llevaba desde P2 §3–§5 construido y probado con **0 pantallas,
0 filas y 5 funciones** que sólo tocaba su test. Ahora hay `/field-sessions/[id]`
y una sección en la página del lote. El operador es una **Persona**, no una
cuenta (ADR-101): quien camina el apiario no suele tener con qué iniciar sesión.

El **guardia de acceso a datos de la PR #78 atrapó el archivo nuevo del
catálogo** y exigió justificarlo — sobre código de otra sesión, que es
exactamente para lo que sirve.

Rebasada sobre las PR #81 y #82 y probada junto a ellas antes de fusionar: CI
había probado la rama sola, nunca el resultado. PR #83. Suite 687/687.

**Sigue sin construirse, y a propósito:** el puente flora↔miel (lo único de §19
que falta) uniría hoy dos tablas vacías —0 especímenes, 0 cosechas de miel— y
las **propuestas con presupuesto** no caben en ningún sitio: `budget`,
`presupuesto`, `proposal` dan **cero** en el esquema. `Project` no tiene dinero,
ni plan, ni aprobación. Eso exige modelo nuevo y una decisión, no improvisación.

### 2026-08-31 · El rendimiento por hectárea no existía, y ahora sí

Se había dicho varias veces que lo construido «es kg por hectárea comparable
entre lotes y entre años». **No se seguía solo.** Había plantas/ha y kg por
bloque, y nada unía el peso de la cosecha con el área: buscar `rendimiento`,
`yield` o `kgPerHectare` en `lib/` y `app/` daba **cero**. Las entradas estaban;
la cifra no la calculaba nadie.

`computePlotYield`, por **año calendario de cosecha** (decisión del dueño). Tres
cosas que cambian el número:

- **Se lee por `HarvestEventSource`, no por `HarvestEvent.locationId`.** El
  segundo es el lote *principal* de la cosecha; una cosecha de varios bloques
  sólo nombra uno ahí, y contar por él daría todo el peso a un bloque y cero a
  los demás.
- **El total es un mínimo.** Un aporte sin pesar no se suma como cero — eso lo
  subestimaría *y lo haría parecer medido*. El conteo de aportes sin pesar va
  junto al número, no en una nota.
- **Sin área el año no se descarta**: se muestran los kilos y se dice que falta
  el área.

Antes, el mismo día: **formulario de siembra** (`createPlantingCohort`) y
`updatePlantingCohort`, que faltaba entero — corregir un conteo **no es
renovar**, porque renovar declara que esos árboles salieron del suelo. La
corrección exige un motivo: «conté mal» y «se murieron cuarenta matas» dejan la
misma cifra y son hechos distintos.

PR #77 y #79. Suite 685/685.

### 2026-08-31 · La cadena de febrero, entera y sin scripts

Cohorte → hectáreas → cosecha → bloque. Los tres eslabones que faltaban tienen
pantalla, y **ninguno depende ya de que una sesión corra un script**.

`updateLocationAttributes` y `recordHarvestSources` existían desde F1 y P1 §5,
con RBAC y auditoría, y su único consumidor era su propio test. El dueño tenía
que dictar las hectáreas para que alguien las escribiera por él.

- **Formulario de condiciones** en la página del lote. Una casilla vacía llega
  como `NULL`, nunca como `0` — un lote de 0 ha no es un lote sin medir, y
  además haría que la densidad dijera «área no positiva» en vez de «falta el
  área». Vaciar una casilla con valor la borra: el formulario muestra los ocho
  campos, así que manda siempre el juego completo.
- **«¿De qué bloques salió?»** en la sección de cosecha, con reconciliación en
  vivo. La diferencia contra el peso declarado casi nunca es cero —nadie pesa
  cada bloque antes de volcarlo en la misma tolva— y el sistema la informa, no
  la rechaza. Sin ningún peso escrito **no dice «0 kg»**, dice «todavía sin
  pesos de bloque».

Dos huecos del servicio, encontrados al construir encima y arreglados antes:
`recordHarvestSources` **no comprobaba que la cohorte fuera del lote nombrado**
(llegan como dos campos sueltos, y una pareja cruzada afirma que un bloque
aportó cereza teniendo sus árboles en otro sitio), y el contexto de la pantalla
**ofrecía todos los lotes de la plataforma**, incluidas fincas ajenas, para
rechazarlos al guardar. Los dos con test y flip-test.

PR #74 y #75. Suite 664/664 sobre `main` fusionado.

### 2026-08-31 · Finca Rosina existe en el registro, y se puede ver

Hasta hoy la finca tenía **cero cohortes**. La base productiva real —los ~2.500
Catuaí de tres a cuatro años de los Lotes 1, 2 y 3— no estaba en ningún lado, y
lo único registrado eran 600 plantones *recibidos*, que no es lo mismo que
sembrados (F1 separa los dos hechos a propósito).

Ahora hay 4 cohortes y **2.699 plantas**: 833 Catuaí en cada uno de los Lotes
1–3 y 200 Caturra en el Lote 4. Tres decisiones las tomó el dueño al
preguntarle, ninguna se infirió: `plantedAt` **nulo** en los Catuaí porque «3–4
años» ubica la siembra en 2022 *o* 2023 y `HarvestWindowPrecision` no baja de
`year`; **833 por lote** y no 834/833/833, porque darle la planta sobrante a un
lote sería una decisión nuestra; `direct_observation` + `provisional`, porque el
conteo por lote es derivado de un total.

Los 200 Caturra estaban en el Lote 3 y se movieron al **Lote 4**: el registro
nunca fue cierto, se transcribió mal el lote. Es un *edit* con `AuditEvent`, no
un supersede — `PlantingCohort` no tiene `correctsId` y `Measurement` sí, y esa
asimetría del esquema es la que decide.

**Y por primera vez se ve.** `/plots/[id]` muestra lo sembrado, y `/plots` ya
enlaza. Un campo ausente dice «Sin registrar» en vez de desaparecer, para que la
página se pueda leer como lista de lo que falta. La densidad **se calcula al
mostrarla y no se guarda** —el dueño avisó que los conteos van a cambiar y un
cociente guardado de entradas móviles envejece en silencio— y cuando no se puede
dividir dice **cuál** de las tres razones.

Lo que revela: `npm test` daba **2 fallos** en `main` con CI en verde. El
renombrado del 29 dejó dos tests buscando «Nubes» y «Cerro Azul». Los datos
estaban bien; miraban al sitio equivocado. **CI no puede ver esto** — corre tres
archivos herméticos y la suite entera necesita base local. Tras cualquier script
`data:*` contra producción, correr `npm test` en local antes de cerrar.

PR #67, #68, #69, #71, #72. Suite 658/658 sobre `main` fusionado.

### 2026-08-29 · P-D estaba cerrada desde A7 y nadie lo había mirado

El comentario sobre la prueba de P-D afirmaba que la familia Huerbsch **no**
estaba en la base como Personas. Medido contra producción: sí lo está, con
cargos y membresías reales, desde A7. Cada sesión leía esa línea y llevaba a
Daniel una pregunta ya contestada.

ADR-106 lo registra citando de dónde sale cada dato —
`27_A7_PROYECTOS_ASSIGNMENTS_DATOS_REALES.md` §2 y §4, y el comentario del seed
sobre el nombre pre-aprobado por Sherry — y el comentario falso se corrigió en
su sitio, no se anotó. Flip-testeado: con el encabezado, P-D sale **cerrada**;
sin él, vuelve a **abierta**.

Van 3 abiertas → 2, por una corrección, no por avance: no se construyó nada, se
midió algo. Lo que sigue sin resolver es P-C, y es lo único que separa a los
dueños de la finca de poder abrir la plataforma.

### 2026-08-28 · Este repositorio ya tiene CI

`.github/workflows/ci.yml` invoca `scripts/ci.sh` en **un solo paso**, y ese
script corre igual en tu máquina. Genera el cliente de Prisma, corre
`npm run verify` y dos archivos de test herméticos. Node fijado en 24,
permisos de solo lectura, timeout de 10 minutos, concurrencia con cancelación.

**La revisión del plan volvió a impedir ejecutarlo como estaba.** Siete puntos,
todos aceptados: el contrato se repartía otra vez entre `package.json` y YAML
—la separación que ocurrió hoy mismo en el otro repositorio—, no fijaba Node, y
metía en CI un test que lee `~/.zshrc`.

Flip-testeado en las dos direcciones: sin `.env` ni `DATABASE_URL` sale **0**
(no se pone roja por falta de base, que es el fallo que haría que se borrara), y
con un error de tipos deliberado sale **2** nombrando el archivo.

**CI informa, no impide:** la protección de ramas no está disponible en un
repositorio privado de este plan. Ver `PENDING_IMPLEMENTATIONS/006`.

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
  presupuesto de estado, inventario de rutas, lint y dos archivos de test
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
- **Escritura y auditoría no son atómicas** — deuda de arquitectura, señalada
  por la revisión del 2026-08-31 y **no arreglada a la ligera**.
  `recordAuditEvent` es el único escritor de `AuditEvent` y usa el cliente
  global, así que no puede unirse a la transacción que confirma la escritura: si
  falla, la fila queda guardada sin auditoría. Afecta a `recordHarvestSources`,
  `updatePlantingCohort` y las escrituras de jornada. Cambiarlo toca el diseño
  de auditoría de toda la plataforma, no un servicio.
- **Un reporte de visita a apiario, tal como está escrito** — pedido dos veces
  al dueño, sin llegar. De su contenido dependen tres decisiones distintas: si
  traen qué estaba floreciendo, el puente flora↔miel deja de ser teórico; si
  traen conteos por colmena, puede que la inspección se quede corta; si traen
  acciones y costos, empuja hacia el modelo de propuestas. Sin verlos, lo que se
  construya en apiario va contra una idea nuestra de un reporte, no contra el
  suyo.
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

---

## 5. Al cerrar la sesión

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
