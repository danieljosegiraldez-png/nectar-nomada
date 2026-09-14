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

### 2026-09-14 · Los dos apiarios reales entran, y sólo en la copia local

El dueño declaró el estado real: **dos apiarios, los dos de Néctar Nómada**. Rosina con 2
colmenas **vacías** (`NN-0041`, `NN-0042`); **Apiario Las Nubes** con 5 (`NN-0043`…`NN-0047`),
núcleos de Parita criados y vendidos por Chayanne López, implementado el 4 de septiembre a
las 6:00 con trasiego a cámaras de roble de Cerro Azul. ADR-128, `data:apiario-las-nubes`.

**La distinción que gobierna esto: dato equivocado ≠ historia.** Las colonias que Rosina
tenía en el sistema no existen en la realidad, así que se **borran**; cerrarlas habría
exigido una causa de pérdida y afirmado una muerte que no ocurrió. El guion **aborta** si
encuentra cosechas, fotos o varroa colgando — eso ya sería historia.

**La jerarquía con el café ya existía.** Los dos apiarios cuelgan de la ubicación `Finca
Rosina` → `Cerro Azul`, con los seis lotes y el beneficio. No se construyó: se midió. Lo que
faltaba era el dueño.

**⚠ PRODUCCIÓN Y LA COPIA LOCAL HAN DIVERGIDO.** Esto se aplicó **sólo en local**. Quien
restaure desde un backup anterior lo pierde; para llevarlo a producción, el dueño corre
`npm run data:apiario-las-nubes -- --rosina-a=NN-0041 --rosina-b=NN-0042 --apply`.

**Tres hechos del dueño sin sitio en el esquema**, nombrados en ADR-128: «patas y tapa», la
madera del roble —va en un `ColonyEvent` de tipo `other` porque **`ColonyEventType` no tiene
un valor de instalación**, que el Anexo E §4 pide— y «todas con reina», que se afirma en una
inspección y **no se inventa**.

**Y la segunda tanda (ADR-129, `data:procedencias-y-sitios`):** Las Nubes llega a **10**
colmenas —las cinco nuevas llegaron el **2 de septiembre**, ancladas a medianoche **de
Panamá** para que el día se lea bien—, entran **Marcelino Guevara** y la geografía de Veraguas,
Herrera y Los Santos, y el cuarto origen **«San Francisco, Veraguas»** se declara en la
**semilla** y no con un `INSERT`: lo cazó `origenDeColonia.test.ts`, y por ese camino
producción lo recibe en el próximo despliegue sin tocar Neon.

**NO se crearon Toabré, Río Gatú ni Lagartero:** el dueño no dijo en qué provincia están.

**Y la historia de Toabré está sin registrar porque su aritmética no cierra:** 15 instaladas
en dic-2025, 12 perdidas en marzo, «las últimas 2» a final de agosto —12+2=14 de 15—, más un
enjambre que ocupó Finca 2 de abril a julio y 3 nuevas de Chayanne. Falta la colmena que no
cuadra, el reparto entre Finca 1 y Finca 2, y las causas.

### 2026-09-14 · La consulta a vecinos: sabíamos registrar la colonia muerta, no el aviso

Cierra el hueco que el traslado destapó, y que aparece **tres veces** en el Anexo E: el §4
lo pide como formulario mensual que «el sistema reclama solo», el §3 como alerta del sitio,
y el §8 lo necesitaba para la mitad de su aviso que decía que nadie ha preguntado. ADR-127.

**La medición que da el título.** Cero coincidencias de `vecin|aspersi|spray|agroquim` en el
esquema y en `lib/apiary/`, con `carencia|Withdrawal` dando diez como control. Lo único que
existía era la **consecuencia**: «Intoxicación por agroquímicos» como causa de pérdida, con
una nota que la asocia a la deriva de aplicaciones vecinas.

**Un enum de resultado y no una fecha anulable.** «No hay aplicación prevista» es la
respuesta más valiosa del protocolo y, guardada como «sin fecha», sería indistinguible de
«nadie preguntó». `no_se_pudo_consultar` tampoco es no haber ido.

**Las dos invariantes están en la BASE, con `CHECK`, y se probó que disparan** —tres
rechazos nombrando la restricción, dos aceptaciones, y sin crear deriva—. **El primer
intento de esa prueba no medía nada:** el control positivo falló por `updated_at` sin valor
por defecto, y los tres «rechazos» siguientes eran «transaction is aborted».

**Una trampa evitada, la del docblock al revés.** Reusar `organizacionesParaApiario` —que
devuelve `[]` salvo con visibilidad `"all"`— habría dado un desplegable **vacío justo al
Farm Operator con ámbito de proyecto**, que es quien hace el trabajo de campo.

**Guardia nuevo:** `alertas-con-su-texto`. La lista de apiarios construye
`t(`alerta_${motivo}`)` en ejecución, así que un motivo sin texto no rompe el build: rompe
la primera pantalla del módulo.

**Decisión pendiente del dueño, señalada en el código:** si una aspersión anunciada debe
pintar el borde **antes** que una pérdida ya ocurrida. El Anexo C §1.2 fija el orden de las
cinco alertas viejas y no se reordenó.

### 2026-09-14 · El traslado de colmenas, y el primer hueco de A9 que era de esquema

Cierra el §8 del Anexo E (ADR-126, PR pendiente). **Invierte el hallazgo de la semana:**
ADR-118, 122 y 123 encontraron tres veces un mecanismo completo sin pantalla; aquí no había
dónde escribir el hecho. Ningún evento de apiario tiene `location_id` propio —cero en
`Inspection`, `ColonyEvent`, `ApiaryHarvestEvent` y `VarroaCount`, contra dos en `Lot`—, así
que el único camino de un evento a su apiario era `hive.location_id` y moverlo habría movido
la historia. `HivePlacement` copia el patrón de `StorageAssignment`, con relleno en la
migración; `hive.locationId` **se queda** porque es el ancla de autorización en ocho sitios.

**Tres restricciones que no eran lo que parecían**, y las tres las dijo medir:

- `@@unique([hiveId, endedAt])` **no habría guardado nada**: en Postgres dos `NULL` no
  chocan. Medido contra 18.6 con control positivo —rechazó la fila duplicada con valor,
  admitió las dos con `NULL`—. La invariante la sostiene el servicio.
- **Mi compuerta del destino negaba el caso normal**: pasaba sólo el `locationId`, y con eso
  un Farm Operator asignado por proyecto habría sido rechazado al trasladar dentro de su
  propio proyecto. Lo dijo leer `requireApiaryAccess`, no una corrida.
- **La aritmética de la carencia la había duplicado** para evitar un N+1. Extraída a
  `libreDesdeDe`/`diasQueFaltanDe`, puras, y usada por los dos lectores.

**Y un defecto ajeno que sólo salió porque un guardia rechazó código nuevo:**
`BotonDeEnvio` hacía `disabled={pending} {...resto}`, así que un llamador que pasara su
propio `disabled` **borraba la protección del doble toque en silencio** — le pasaba a
`app/sensory/[sessionId]/page.tsx`. Arreglado y con guardia. La primera versión de ese
guardia comparaba posiciones con `indexOf` y midió **un comentario**; se retiró.

**Pendiente nombrado:** `createHive` no abre la colocación inicial de una colmena nueva.

### 2026-09-14 · Los motores de beneficio llegan a la pantalla, y dicen qué no pueden ver

`lib/beneficio/desdeElLote.ts` traduce nuestros registros al lenguaje de los
motores. Su trabajo de verdad es **declarar lo intraducible** en vez de
rellenarlo.

**Tres cosas no existen aquí y ninguna se inventa.** El **perfil de protocolo**:
el catálogo `grado_proceso` de Daniel y los cinco perfiles del paquete **no son
los mismos cinco** — casan `Washed` y `Natural`; se quedan sin perfil los dos
semi-lavados y el honey, y sin grado `ANAEROBIC_SHORT`, `CARBONIC_MACERATION` y
**`COLD_HOLD_PREFERMENT`, que es CryoBloom**. Un lote sin perfil **no recibe los
del lavado**. La **confianza** se deriva de la corrección y de
`provenanceClass`. Y el **punto de muestreo** no existe: el guardia de series
mezcladas de Brix **no puede disparar aquí**, y eso viaja hasta la pantalla.

**La pantalla pregunta, no ordena** —hay un guardia que lo comprueba sobre el
español— y **dice por qué no hay veredicto cuando no lo hay**: el tipo es
`VeredictoDeFase | SinVeredicto`, no un opcional.

**Lo que esto NO prueba.** Medido sobre la copia de producción: **0 recetas, 0
objetivos, 0 procesos de lote, 0 fermentaciones**, y los 3 secados abiertos no
cuelgan de ningún proceso. **Hoy ningún lote pintaría el bloque.** El camino lo
ejercen 20 pruebas nuevas, no datos reales — el cuello de botella es la captura.

**Pendiente de Daniel:** decir que un lote corre CryoBloom **es un cambio de
esquema** y se propone aparte.

### 2026-09-14 · Secado, y con él los 47 criterios del beneficio en verde

`lib/beneficio/secado.ts`. **El tablero cierra: 50 pasando, 0 pendientes.** La
v2.x no tenía especificación de secado en absoluto, pese a que su propio
`CLAUDE.md` la exigía — vacío estructural C1.

**El secado no es lineal y un solo umbral de tasa lo arruina en las dos
direcciones.** Bajar diez puntos por encima del 25 % es normal —agua libre— y
alertar ahí da un falso aviso por lote; los mismos diez puntos por debajo del
25 % **sellan la superficie**, el núcleo queda húmedo, el medidor lee bajo y
falso, y el moho sale en bodega semanas después. La fase se decide **antes** de
mirar la tasa.

**Y una medición que corrigió lo que yo creía.** En el flip del solape de
ventanas supuse que caería DR-003 —la rehidratación nocturna—. Cayó **DR-004**.
Medido: DR-003 da −0,95 semiabierta y −1,05 solapada, y **no dispara en ninguno
de los dos**; el que vigila la regla es el del estancamiento, porque exige tasa
≥ 0 y el solape la vuelve negativa. Mirar **cuál** cae es lo único que lo dice.

Seis flip-tests, todos compilando y cada uno por su vector.

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
