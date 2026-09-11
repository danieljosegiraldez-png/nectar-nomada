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

### 2026-09-11 · Una parcela no es un lote, y existen las microparcelas

Daniel, intentando crear uno: «how do I create lots». Medido, y la causa no era
el código: **sus parcelas se llaman «Lote 1 — Finca Rosina»**. En los datos una
*parcela* se llama Lote, y en la pantalla un *batch* también. Misma palabra, dos
cosas — el trozo de tierra y la cantidad de café que salió de él.

**Su modelo ya era el del sistema**, y conviene no volver a construirlo: finca =
`Organization` de tipo `farm` **más** una ubicación `site`; las parcelas cuelgan
de la finca; y **«sin parcela no hay cosecha» ya estaba impuesto** por
`harvest_event.location_id NOT NULL`, cuyo comentario dice «the plot».

**Lo que entra:** el tipo de ubicación **`micro_plot`** (ADR pendiente; la
alternativa descartada era anidar parcelas, que funciona hoy pero no deja
distinguir «toda la parcela» de «este rincón»), y
`npm run data:parcelas-no-son-lotes` — seco por defecto, coincidencia por
**patrón exacto** `^Lote <n> — ` y nunca `contains`, que es la lección de
`rename-finca-rosina.ts`. Renombra a «Parcela N — finca» y, aparte, **pone la
organización a las que no la tienen**: seis de Finca Rosina cuelgan del sitio por
el padre sin declarar finca, y un operador acotado por organización no las
alcanza. Las de Cafelino sí la tienen.

**Una cifra mía que era falsa y su causa.** Dije «6 sin organización, 9 con». Son
**8 parcelas: 6 sin y 2 con**. Medí mientras otra sesión corría la suite sobre la
base compartida y conté filas TEST transitorias. Y lo que importa más: **todo lo
medido aquí es la copia local restaurada, no producción** — por eso el guion
imprime la fila patrón antes de escribir.

**Lo que se encontró de camino y NO se tocó:** el formulario de cosecha pide
peso, Brix y una **«condición» de texto libre** — mientras que **siete de los
nueve catálogos de cereza no los lee ninguna línea**: `cereza_condicion_visual`,
`_limpieza`, `_color`, `_firmeza`, `_densidad`, `_tamano_forma`, `_defectos`.
El vocabulario para las «vital statistics» de la cereza está escrito y sin puerta.

### 2026-09-11 · «Todas las colonias con varroa esta temporada» ya es una consulta

El Anexo B §2.3 lo pedía con nombre y apellido: *«Hoy `pestDiseaseFlags` es una
cadena. Una cadena no se puede contar, y "todas las colonias con varroa esta
temporada" es exactamente el reporte que hace falta.»* Medido antes de construir:
**ninguna línea de aplicación consultaba esa columna** — sólo se escribía y se
leía como prosa. Y 0 de 1 inspecciones tenían texto ahí, así que no hubo nada que
convertir.

**Trece casillas, ninguna inventada:** son las banderas que el dueño ya tenía
escritas, con su razón al lado. **La catorceava de su lista no es un valor de
catálogo**: «Otro | texto, siempre disponible» es `pestDiseaseFlags`, que se
queda para lo que el catálogo no cubre.

**No es el catálogo de causas de pérdida, y `ADR-114` dice por qué:** lo que se
observa no es lo que mató a la colonia. Se solapan sin coincidir — moho, alas
deformadas, olor anormal y disentería son señales de inspección y no causas;
enjambrazón y escasez de floración son causas y no señales.

**Dos decisiones del reporte que no son obvias.** Cuenta **colonias distintas**,
no inspecciones —tres visitas a la misma caja con varroa son un problema, no
tres— y devuelve **las trece filas, también las que valen cero**, porque «no hay
loque» y «nadie miró loque» no son lo mismo.

**Y viajan por la cola offline**, que es la mitad que importa: una inspección con
hallazgo se anota en el campo, y dejarlas fuera habría hecho que sólo se pudieran
marcar con cobertura.

**Un límite del instrumento que esto destapó** (en
`PENDING_IMPLEMENTATIONS/007`): el detector del inventario decide si una
operación «recibe principal» con una coincidencia de texto **sobre los
comentarios incluidos**. Una función sin un solo argumento quedó mal clasificada
porque un comentario vecino decía «No recibe `userAccountId`». Reproducido
quitando esa palabra. El arreglo a mano es indistinguible de escribir prosa para
complacer a un regex.

**Lo que NO está:** el reporte **no tiene pantalla**. Existe, está probado con
nueve casos —tres con control positivo— y nadie lo ha visto dibujado.
### 2026-09-11 · El 404 de Google era una dirección clavada en el sitio vecino

Daniel probó «Continuar con Google» y recibió un **404**. No era Google:
producción anunciaba de sí misma
`"callbackUrl": "https://www.nectarnomada.com/api/auth/callback/google"` — el
dominio de marca, que **desde el 2026-08-28 sirve el sitio editorial**. Con
control positivo: esa dirección da **404** y la misma ruta en `.vercel.app` da
**302**. Google autenticaba bien y devolvía al usuario al vecino, así que **el
404 llegaba después de Google** y parecía culpa del proveedor.

**Por qué tardó semanas en verse:** el usuario y contraseña nunca se rompieron.
Ese formulario se manda a la página donde ya estás, sin dirección absoluta.
**Sólo OAuth necesita que la aplicación sepa nombrarse**, y ahí muerde. Nathy
llevaba sin poder entrar desde entonces.

**Lo que entra, y lo que NO puede entrar.** Daniel pidió que la aplicación
deduzca su dirección sola. Leyendo la librería resultó que eso no se programa:
`next-auth/lib/env.js` reescribe el origen de **cada** petición al de
`AUTH_URL ?? NEXTAUTH_URL` en cuanto una existe, antes de leer nuestra
configuración. La variable se **borra** o gana la variable. Borrarla es seguro
porque `@auth/core` ya enciende `trustHost` con la variable `VERCEL`. Queda en
**ADR-113**, fuera de `.env.example`, y con un guardia
(`lib/auth/direccionFijada.ts`) que **avisa, no corrige**: si la dirección
clavada discrepa del anfitrión que sirve, `/login` no pinta el botón y dice por
qué. Ocho pruebas con entrada hostil.

**Sigue pendiente de Daniel** y no lo puede hacer el código: borrar la variable
en Vercel y registrar el callback de `.vercel.app` en Google Cloud Console.

### 2026-09-10 · La pérdida de una colonia ya se puede anotar sin señal

La cola offline del apiario aceptaba dos tipos de borrador: inspección y evento
de colonia. **El fin de una colonia no estaba** — y es el hecho que más se
descubre en el campo, una caja que aparece vacía. Había que volver con cobertura
para poder anotarlo, y entre medias el conteo del sitio seguía contando colonias
que ya no existen. Era el último formulario de apiario que exigía red.

**La parte que no era obvia: la idempotencia de un UPDATE.** Las otras dos
mutaciones insertan, así que su `clientDraftId` vive en la fila nueva. El fin es
un UPDATE y no hay fila nueva, así que la clave va en `Colony.endClientDraftId`.
Y hace falta porque sin ella **dos cosas muy distintas llegan como el mismo
error**: que mi propio envío llegara y se perdiera la respuesta, y que otra
persona la diera por perdida antes. La primera es un `duplicate` que se descarta
callado; la segunda, un rechazo que el operador tiene que ver. Confundirlas haría
descartar un aviso real, o dar una alarma por trabajo que sí se guardó.

**Un defecto que el tercer tipo destapó, y no era teórico.** La traducción al
protocolo era `kind === "inspection" ? "inspection" : "colony_event"`. Con dos
tipos funcionaba; con el tercero, **un fin habría llegado disfrazado de evento de
colonia** y se habría rechazado por un campo que falta, no por lo que es. Ahora
es un `Record<DraftKind, string>` total: un cuarto tipo no compila hasta que
alguien lo nombre.

**Lo que esto cuesta, y está en `ADR-112`:** el rechazo deja de ser inmediato.
Sin permiso, o si alguien llegó antes, eso sale al sincronizar y no al pulsar.
Es el trato que ya aceptan las otras dos pantallas de campo, y el precio de
poder anotar sin cobertura. La acción de servidor se **eliminó**: mi propio
cambio la dejó huérfana.

**Siete pruebas nuevas y flip-test de cinco mutaciones**, cada una cayendo por su
nombre y compilando — incluida la de volver al ternario. La de «clase de causa
inventada» lleva control positivo: la mutación siguiente del lote **sí** se
aplica, así que el rechazo no se llevó por delante el trabajo bueno.

**Lo que sigue sin probarse:** nadie ha anotado una pérdida real desde un
teléfono en el campo. Los guardias miden el servidor y la traducción; la pantalla
está detrás de `/login`.
### 2026-09-10 · La limpieza que no corre cuando la aserción falla

«Cuántos sitios de apiario hay» devolvía **3** con dos reales: el tercero era
una `Location` de prueba del 2026-09-08, con 15 filas de su corrida detrás.

**La causa no era la que parecía.** El `afterAll` de `polinizacion.test.ts` sí
borraba la `Location`; no llegaba. Los dos `it` que crean una `FieldSession` la
borraban **debajo de las aserciones**, y una aserción que falla se salta ese
borrado. `field_session.location_id` es `RESTRICT`, así que el `afterAll` murió
ahí y abandonó las seis líneas siguientes: **es una cadena, y la primera FK que
se queja tira el resto.** `assertDefinedWhere` no lo cubre —su `where` estaba
perfectamente definido—, y por eso la trampa quedó escrita en `CLAUDE.md`.

Esa limpieza pasa a un `afterEach`; el `afterAll` se completa con `FieldSession`,
`Scope` y `AuditEvent` —antes de borrar la cuenta, que la FK es `SET NULL`—. El
mismo `Scope` huérfano estaba en otras cinco pruebas. Aparte, barridas 36 filas
de la base **local**, con fila patrón y ensayo en seco; sin `test:db -- reset`,
que hay una migración sin fusionar de otra sesión.

**El flip-test es la parte que vale: las dos versiones dicen 55/55.** La vieja
deja +6 `Scope` huérfanos por corrida y la nueva +0; mutando una aserción, la
vieja tumba **2** y deja **7 filas**, la nueva tumba 1 y deja 0. Una compuerta
que sólo mira el color no ve esa diferencia.

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
