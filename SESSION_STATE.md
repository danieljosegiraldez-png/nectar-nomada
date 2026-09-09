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

### 2026-09-09 · Por qué se perdió una colonia: quince causas, ninguna inventada

El comentario de `Colony.endedAt` decía —con razón para su día— que el
vocabulario de causas «es conocimiento del dueño: se le pregunta, no se
inventa». Se preguntó. La respuesta cambió el diseño dos veces: **hay varias
causas por pérdida**, así que no cabe en una columna **ni en una FK**; y el
vocabulario había que sacarlo de la documentación existente, no de mi cabeza.

**Lo que se midió antes de proponer nada.** En el repositorio **no había**
ningún vocabulario de causas (grep con control positivo). Lo que sí había es el
Anexo B §2.3 con catorce «irregularidades», que son otra pregunta: lo que se ve
en una inspección, no por qué se perdió. Y los datos reales del apiario son **2
sitios, 2 colmenas, 2 colonias, 1 inspección y CERO pérdidas** — de ahí no se
deduce nada, así que o venía de fuera o me lo inventaba yo.

**Vino de fuera, y de tres sitios que se nombran valor por valor:** el estándar
internacional de monitoreo de pérdidas —COLOSS y su versión latinoamericana de
SOLATINA, **donde Panamá participa**, con sus tres categorías—; el Anexo B del
propio dueño, del que entran las banderas que son causa de *pérdida*; y los
casos que los documentos de la finca ya registran, como la hipótesis de Toabré
—un frente frío de enero con una poda que cortó la floración—.

**Cada causa dice cómo se supo**, y eso no es adorno: una causa de pérdida casi
nunca se ve, se deduce de una caja vacía dos semanas después. El propio
cuestionario internacional pregunta por «hambre sospechada». `provenanceClass`
es obligatorio, **sin valor por defecto** —el defecto convertiría cada sospecha
en observación— y acotado a tres: lo sospecho, lo concluí, lo vi.

**`ColonyStatus` gana `combined`** (decisión del dueño). El estándar cuenta como
pérdida la colonia con problema de reina irresoluble: viva, no recuperable, se
combina. Sin ese estado se quedaba `active` para siempre inflando el conteo de
polinización con abejas que ya no están en esa caja.

**Y un agujero que destapó el guardia de OTRA sesión.** El PR #255 añadió
`procedencia-declarada.test.ts`, que prohíbe meter la cadena de un formulario en
un enum con `as never` — y cazó mi propia acción. Al arreglarlo apareció el
segundo, peor: el servicio escribía `input.status` **sin mirarlo**, así que un
envío con `status=active` pasaba el `where` y dejaba la fila con **`active` y
`ended_at` puesto** — una colonia viva con fecha de muerte. Ahora hay
`ESTADOS_DE_FIN` declarado, `exigeEstadoDeFin` en la acción y la misma
comprobación en la frontera, porque el servicio también se llama desde la cola de
sincronización, sin formulario.

**Y lo que el flip-test destapó, que es la parte que vale.** Siete mutaciones,
las siete cazadas por su prueba y compilando — pero a la primera vuelta **una
no cayó**: la prueba de «misma causa dos veces» afirmaba la CLASE del error y
pasaba con el guardia quitado, porque el `in` de Prisma deduplica y saltaba otro
error de la misma clase. Era un adorno. Ahora afirma el mensaje.
### 2026-09-08 · El servidor aceptaba procedencias que la pantalla no ofrece

`ProvenanceClass` tiene **diez** valores; los formularios ofrecen **cinco**. En
`app/actions/traceability.ts` la cadena del formulario entraba en el enum con
`as never` en **once** sitios, asi que el servidor aceptaba los diez: un envio
con `provenanceClass=ai_suggestion` sobre un formulario que ofrece dos opciones
**se guardaba**. Eso hace falsa justo la distincion que `CLAUDE.md` §3 pone
primero — hecho medido contra interpretacion contra sugerencia de IA. `as never`
no convierte nada: apaga al compilador.

**Y encima estaba sin declarar.** Ocho formularios con su `const` local, seis
conjuntos distintos, **dos nombres** para la misma idea (`PROVENANCES` y
`PROVENANCE_CLASSES`), y dos formularios ofreciendo **el mismo conjunto en
distinto orden** sin razon escrita.

**Ahora hay cinco conjuntos con nombre en `lib/traceability/procedencia.ts`**,
tipados `readonly ProvenanceClass[]` —el compilador rechaza un valor que no
exista en el enum— y `exigeProcedencia` sustituye a los once `as never`: lo que
el servidor acepta y lo que el usuario ve **son la misma lista**. Los `as never`
de las acciones bajan de 43 a 32.

**Lo que NO cambia: que ofrece cada pantalla.** Cada conjunto es el que ya tenia
su formulario, valor por valor. Cuales son los correctos sigue siendo decision
de producto, y sigue en §3.

**Los flips.** Devolver un `as never` tumba el guardia de fuente por su nombre;
hacer que `exigeProcedencia` deje pasar cualquier cosa tumba los dos que lo
miden. Los dos compilan, que es lo que distingue un flip de un error de sintaxis.

### 2026-09-09 · Se podía todo del apiario menos crear el apiario

Medido: la aplicacion dejaba registrar colmenas, colonias, inspecciones, eventos
de colonia, cosechas de miel y visitas — y **no dejaba registrar el sitio donde
ocurre todo eso**. Los tres apiarios que existen salieron de `prisma/seed.ts` y
de `scripts/import-cafelino-pe.ts`; el unico `location.create` de la aplicacion
era `createMicrolot`, que subdivide una parcela que ya existe. Ahora
`/apiaries/new`.

**Y construirlo destapo un limite del modelo.** `Location` **no tiene**
`projectId`: un apiario se asocia a un proyecto **a traves de sus colmenas**
(`resolveApiaryVisibility` filtra por `hives.some.projectId`). Un sitio recien
creado no tiene ninguna, asi que **es invisible para quien solo tiene ambito de
proyecto**, incluido quien acaba de crearlo. La primera version usaba la puerta
normal y su prueba lo cazo: el sitio se creaba y `getApiaryDetail` contestaba
`no_apiary_access` **a su propio autor**. Ahora crear exige ambito de
plataforma, y el lector de fincas usa la MISMA puerta — la primera version
ofrecia fincas a quien el servicio iba a rechazar.

**Lo que queda abierto y es del dueño:** si `Location` debe llevar `projectId`
para que un jefe de finca con ambito de proyecto pueda crear sus apiarios. Es un
cambio de esquema que toca la visibilidad de todo.

**Sin altitud ni notas, a proposito.** `Location` guarda un RANGO de altitud
—describe una parcela, no un punto— y no tiene columna de notas. Las dos se
cayeron al medir el esquema; escribir el mismo numero en las dos afirmaria «el
rango es cero», que nadie declaro.

### 2026-09-09 · El mapa de sitios, y la coordenada que nadie podía teclear

El mapa que `ADR-009` decidió en su día llevaba **cero código**. Se construyó,
y lo que la medición cambió es más interesante que la librería: **no estaba
bloqueado por Mapbox**. De las **24 ubicaciones, cero tienen coordenadas**, y el
formulario para declararlas sólo aparecía **si alguna visita ya proponía una**
desde su GPS. Como ninguna visita ha traído lectura, no había propuesta; sin
propuesta, no había formulario; **no existía forma de teclear una coordenada en
toda la plataforma**. Cualquier mapa habría salido vacío.

**Las dos mitades van en el mismo cambio**, porque un mapa sin forma de darle
algo que pintar es un adorno: el formulario se dibuja **siempre** —con la
propuesta de valor por defecto cuando la hay, en blanco cuando no—, y
`/apiaries` estrena el mapa encima de la lista, diciendo debajo **cuántos
sitios no salen en él**. Un mapa con tres pines y veintiún sitios invisibles se
lee como si la finca tuviera tres.

**Leaflet, no Mapbox** (`ADR-110`, enmienda de `ADR-009`; el dueño pidió «sin
token ni costo»). Medido antes de elegir: Leaflet **3,7 MB y cero
dependencias**, MapLibre **20 MB y diecisiete**. Se pierde el estilo propio que
era toda la razón de ADR-009 — las teselas de OSM se ven como OSM — y se dice
en voz alta en el ADR en vez de descubrirlo al verlo. El adaptador
`MapsProvider` que ADR-009 pedía **no se construye**: de un solo uso, se
escribiría contra la única implementación que hay.

**Cuatro guardias de código fuente**, cada uno con control positivo y los cuatro
con flip-test que cae **por nombre** y **compilando**
(`tests/arquitectura/mapa-de-sitios.test.ts`): Leaflet cargado dentro del efecto
y nunca en el módulo —toca `window` y la página es de servidor—, la atribución
de OSM que su política exige, el formulario fuera del condicional, y
`.nn-mapa` con altura en px. Esa última es la que más engaña: Leaflet mide su
contenedor, y uno sin altura resuelta da un mapa de 0 px **sin lanzar error**.
### 2026-09-08 · El guardia del menú medía a un visor que no era el más privilegiado

Afirmaba «ni el visor mas privilegiado pasa de 8 entradas» y pasaba en verde con
**10**. La grieta era el fixture: una lista de diez permisos **escrita a mano** a
la que le faltaban `platform:manage_permissions` y los de contenido — justo las
dos claves que abren las dos entradas de mas. El «mas privilegiado» del test no
lo era.

**El arreglo es estructural, no un numero.** `NAV_PERMISSIONS` se **deriva** de
`NAV`, asi que una entrada nueva trae su permiso sola y esto no puede volver a
medir a otro visor. Es la misma leccion que el mapa de variables que paso a
`Record` total: un dato que el compilador mantiene es mejor guardia que una
lista que hay que acordarse de actualizar.

**Y el numero se fija, no se sube.** Poner `<= 10` habria borrado el objetivo.
`toHaveLength(10)` hace que crecer sea deliberado y deja el hueco a la vista:
**el objetivo de 8 sigue vivo y sin cumplir**, con lo que cuesta medido — 234 px
de cabecera en tres filas, el 29 % de un telefono de 375 px, antes de ver nada.
Acortar el menu o mover el objetivo sigue siendo del dueño.

**El flip-test es la parte que vale.** Añadida una entrada 11 a `NAV`, en el
**mismo mundo mutado**: el guardia viejo **pasa** —1 passed, ciego— y el nuevo
cae por su nombre. No es «el guardia nuevo funciona»: es la prueba de que el
viejo no medía nada.

## 3. Bloqueado, y en qué

#### Lo que se vio al recorrer las pantallas en un móvil de verdad

**2026-09-05, primera vez que alguien las usa** — hasta hoy todo lo que se sabía
de ellas venía de tests. Sesión con sesión iniciada, 375×812, datos de la copia
local. Se arregló lo objetivo (PR #166, la tabla que desplazaba la página); lo
de abajo **queda abierto porque es decisión de producto, no arreglo mecánico**.

- **El menú tiene 10 entradas y el objetivo del móvil son 8.** El guardia que
  afirmaba lo contrario **se arregló** el 2026-09-08 —ver §2—: ahora mide al
  visor más privilegiado de verdad y fija el 10, así que el hueco está a la
  vista en vez de escondido tras un verde. Lo que sigue abierto es la decisión:
  **acortar el menú o mover el objetivo**. En el teléfono son 234 px de
  cabecera en tres filas, el 29 % de la pantalla antes de ver nada.

- ~~«Batches» en una interfaz en español.~~ **Cerrado el 2026-09-08** — ver la
  entrada de §2. El café es «Lote»/«Lot» y el terreno es «Parcela».
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
pantalla pinta (ver §2). **Lo que sigue abierto es cual debe ofrecer cada una**:
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
