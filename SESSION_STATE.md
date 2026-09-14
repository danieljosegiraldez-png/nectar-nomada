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

### 2026-09-13 · Completar no es corregir, y con eso el apiario ya puede cerrar

`lib/apiary/` **no tenía una sola función de actualización**, y por eso los dos campos
de etapa cierre del Anexo B §4 no podían existir sin ser columnas que nadie pudiera
rellenar — lo que ya costó una semana con `coverage_until`.
`PENDING_IMPLEMENTATIONS/011` queda cerrado. ADR-121.

**La decisión es toda ésta:** **completar** un hecho que siempre iba a llegar después
—el retiro de una tira, semanas más tarde— **no lleva razón ni plazo**; **corregir**
algo ya escrito **sí**, con el valor anterior en `before` y una operación de audit
distinta. Pedir razón para el curso normal del trabajo enseñaría a escribir «.».

**`sourceInterface = "apiary.close"`**, el vocabulario que trazabilidad ya tenía: «se
anotó en el campo» y «se completó en la casa» se distinguen leyendo la fila. De ahí
que ésta sea **la única escritura del apiario que no pasa por la cola offline**.

**Lo que NO deja tocar:** producto, lote, dosis, carencia y objetivo. Si estuvieran
mal, corresponde un evento nuevo, no reescribir la evidencia de aquel día.

Y dos cosas que salieron gratis por decisiones viejas: **`leerEnmiendas` no hubo que
tocarlo** —el audit del apiario ya escribía `entityType: "colony_event"`— y **esta
migración no tuvo deriva que excluir**, que es lo que compró ADR-120 ayer.

**Desde hoy la compuerta incluye `npm run build`:** `verify` no construye, y eso es
lo único que ve la clase de defecto que rompió producción esta tarde.

### 2026-09-13 · Vercel saltaba el build de cada PR, y por eso producción se rompió

**La #288 llegó a `main` sin que nada hubiera construido su código.** Rompió el
build —`ColonyEventQuickEntry` es `"use client"` e importaba un valor de un módulo
que llega a `prisma`, así que `pg` acabó en el paquete del navegador— y el sitio
sirvió **un build viejo durante una hora**.

**Por qué nadie lo vio, y es lo que hay que recordar.**
`scripts/solo-documentacion.sh` deducía la base como `HEAD^`. Eso es verdad en
GitHub Actions —que saca el commit de **fusión** de la PR— y **falso en Vercel, que
saca el commit de la rama**. Como cada PR de aquí termina con un commit de estado
(sólo documentación), el rango decía «sólo docs» y Vercel **saltaba el build**,
reportando `success — Canceled by Ignored Build Step`. Medido: **#283, #284, #286 y
#288 dijeron eso**, ninguna construyó su preview, y yo reporté «Vercel: success»
cuatro veces. **Un `success` que significa «no miré» es peor que un rojo**, y es la
misma familia que el `cancelled` de las compuertas.

**Tres arreglos, cada uno con su guardia:**

- El reparto puro/consulta que ya existía en `infestacion.ts` y `alimentacion.ts` y
  a la tercera olvidé: ahora `vocabularioDeTratamiento.ts`. Lo caza
  `tests/arquitectura/cliente-sin-prisma.test.ts`, con cierre **transitivo** y
  distinguiendo **valor de tipo** — de ocho pares cliente→prisma, siete son
  `import type` y están bien.
- La base se deduce distinguiendo el caso y **se imprime**; ante la duda, construye.
  Con pruebas, que no tenía: `tests/soloDocumentacion.test.ts`.
- `npm run verify` **no construye**. Desde hoy, `npm run build` antes de empujar:
  es lo único que ve esta clase de defecto, como el `"use server"` de septiembre.

### 2026-09-13 · La deriva de migraciones se cierra al revés de como parecía

`migrate diff` proponía sentencias que no eran de ningún cambio en curso: **seis** el
2026-09-12 y **quince** el 2026-09-13. Cada migración las excluía a mano y lo decía en
su prosa — lo cual funciona **hasta el día en que alguien no se dé cuenta**.

**La dirección era la decisión, y no era la obvia.** Medido tabla por tabla, en la
migración **y** en la base: las migraciones crearon esas FK con `ON DELETE RESTRICT`, y
el esquema pedía `SET NULL` **no porque nadie lo eligiera, sino porque al no decir nada
heredaba el defecto de Prisma** para relaciones opcionales. Ejecutar el diff habría
cambiado producción a «se borra el valor de catálogo y te vacío en silencio el color de
cereza que alguien observó». Así que se declaró en el esquema lo que la base ya hace:
**cero SQL, cero migraciones, cero filas**. 15 → 8 → 0. ADR-120.

Dos de las siete las tuve mal al primer intento —`drying_run` y `fermentation_run` sí
son `SET NULL`— y lo dijo **medir cada una en los dos sitios** en vez de suponer
simetría.

**Y un guardia, `tests/derivaDeMigraciones.test.ts`,** con control positivo dentro y
distinguiendo los tres valores de `--exit-code`: 0 vacío, 2 diferencia, **1 error**.
Eso último no es cosmético: mientras se escribía, **dos veces** un comando que
reventaba se leyó como «no hay deriva», las dos por esconder `stderr` —`--from-url` ya
no existe en Prisma 7, y en otra corrida faltaba exportar `SHADOW_DATABASE_URL`—.
`ci-con-base.sh` deriva ahora la base de sombra para que el guardia pueda medir en CI.

**Y el guardia de temporales me cazó a mí** al escribirlo: mi prueba creaba un
directorio y no lo borraba.

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
