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

### 2026-09-11 · La lista de chequeo del apicultor nunca salió del disco

`protocolos/apiario-campo-v1.json` son 11 KB de preguntas de campo ya escritas
—5 actividades, 44 ítems— y `lib/apiary/protocoloDeCampo.ts` sabe darlas de alta
como `ProtocolVersion` de Research OS. Medido: **sólo lo llamaban las pruebas**.
Ni un guion, ni una pantalla. Aquí la puerta no es una pantalla: cargar un
protocolo se decide una vez y se lee en el diff.

**Lo que entra:** `npm run apiary:load-protocol`. Seco por defecto —enseña las 5
actividades con sus obligatorias y una **fila patrón** de qué hay ya en la base—
y escribe sólo con `--cargar`. Idempotente por `externalIdentifier`, y se niega a
escribir si no hay ninguna cuenta con Platform Admin, porque un `AuditEvent` sin
actor no dice quién lo decidió.

**Comprobado cargándolo de verdad** contra la copia local, no leyendo el ensayo:
crea el protocolo, la versión 1 y **44 variables**; la segunda corrida dice «Ya
estaba» sin tocar nada. Las filas se barrieron después.

**Y lo que cargarlo NO hace, porque la frase fácil sería falsa.** Ninguna
pantalla de apiario lee esas variables: los formularios llevan sus campos en el
código, así que **editar el JSON hoy no cambia ni una pregunta en pantalla**. Lo
que sí hace es que el protocolo aparezca en `/research`, se pueda aprobar con el
botón que ya existe y se pueda **ejecutar** en `/research/execute/<versión>`, que
pinta los 44 ítems. Entra como `draft` a propósito: aprobar es un acto humano.

### 2026-09-11 · Lo que la base de pruebas acumulaba, y por qué nadie lo veía

Una fila `TEST` de más en «cuántos sitios de apiario hay» destapó que **nada
comprobaba la clase**. Seis PR después quedan tres guardias donde no había
ninguno, y la base local pasó de 40.043 `audit_event` y 335 `Scope` huérfanos a
cero de cada.

**El patrón, que se repitió tres veces y es lo que hay que reconocer:** una
limpieza escrita **debajo de las aserciones** no corre cuando una falla; un
`afterAll` es una cadena y la primera FK que se queja tira el resto; y un
`deleteMany` que nombra una variable de dos olvida la otra. Las tres fugan **en
verde**: la suite pasa entera mientras deja filas. Por eso el flip-test de cada
arreglo compara **dos columnas** —pruebas y filas— y no sólo el color.

**Lo estático no basta y quedó demostrado.** Después del primer arreglo la
auditoría por `grep` decía que no quedaba ninguna fuga de `Scope`, y quedaba
una. Se encontró corriendo **uno a uno los 34 archivos** que crean un `Scope` de
proyecto y midiendo el delta: `reports.test.ts` crea dos proyectos y limpiaba
uno. Para esta familia, la herramienta es el delta por archivo, no el grep.

**Y una decisión de alcance que conviene no repensar cada vez:** el rastro de
auditoría **no** se arregló prueba por prueba. Son 57 archivos, 98 operaciones y
la mayor pesa el 8 % — no hay culpable. Se barre con `npm run limpiar:audit`,
que borra sólo lo que tiene el actor nulo, comprueba esa hipótesis en cada
corrida, y **no tiene bandera para bases remotas**: leer producción a veces se
quiere, borrar su auditoría nunca.

Lo demás está en las trampas de `CLAUDE.md`, que es donde se lee al hacerlo.
### 2026-09-11 · Los códigos de las corrientes se derivan, y un bloque es una parcela

Daniel, en selección: «for the rejects we should have an automatically generated
code… we need to have very good trazabilidad and coding system». Y aparte:
«lets not use BLOCKS anymore, it is confusing».

**La convención ya era suya y sólo faltaba automatizarla.** Sus lotes reales la
traen: `PE-90` produjo `PE-90-A` y `PE-90-B`; `PE-95` produjo `-A`, `-B`, `-C`.
Padre más letra. Así que `codigosDerivados` **continúa su sistema**, no le impone
uno con abreviaturas de categoría. Se sugieren y siguen siendo editables.

**Por qué derivar y no contar.** `schema.prisma` ya explicaba por qué el código
no es único global: «dos aparatos desconectados acuñando PE-79». Hoy la selección
exige red, pero `/lots` ya está en las rutas que el service worker guarda. Una
función del código del padre no puede chocar; un contador sí.

**«Bloque» era la tercera palabra para lo mismo** —Lote, Parcela, Bloque— y de
ahí media confusión del día. Renombrado en los dos idiomas, con el género
cuidado: «un bloque» → «una parcela», no «un parcela».

**Dos guardias del repositorio me cazaron, y tenían razón.** La suite salió en
**rojo**: `codigosYaDerivadosDe` no recibe principal —se apoya en el guardia de
la pantalla que la llama— y eso hay que **declararlo** en
`dependen_del_llamador`, no dejarlo en un comentario; y las cifras del inventario
quedaron viejas (286→287, 36→37). Ambas corregidas.

**Y una medición mía que estaba mal, para la revisión que sigue.** Conté
«variables con una sola unidad» probando valores **fuera de rango**: `pH` con 20
se rechaza por el rango 0-14, no por la unidad. Lo destapó mi propio control —«no
acepta su propia canónica»—. Medido bien: de **60** variables, **34** admiten una
sola unidad, **23** ofrecen elección real (temperaturas C/F y nutrientes de
laboratorio) y **3** no las pude medir por no tener sus unidades en la lista.

### 2026-09-11 · Una cosecha ya no puede violar la carencia sin que el sistema lo sepa

El Anexo B §4 marcaba el período de carencia como **obligatorio y no
existente**, con su consecuencia escrita. Y `lib/apiary/bitacora.ts` ya lo
afirmaba desde A9.12: «tiene periodo de carencia y afecta a la miel que salga de
esa colmena, así que quien coseche necesita saberlo sin buscarlo». **El aviso
existía; el dato no.**

**La contradicción era del propio Anexo,** y la resolvió el dueño. §5 dice
«**bloqueo**» y «la cosecha avisa» en la misma celda. Decisión: **avisa y
registra igual**, con los días que faltaban en la fila. Si la miel ya se
extrajo, impedir el registro no la devuelve al panal — deja el hecho sin rastro,
que para trazabilidad es peor que un registro marcado.

**Cuatro decisiones pequeñas que no son obvias**, y cada una tiene su prueba:
cero días es **una respuesta legítima** —hay productos sin carencia, y un
`!valor` la habría rechazado—; los días que faltan se redondean **hacia arriba**,
porque medio día sigue siendo carencia y un `floor` daría cero justo cuando
alguien va a cosechar creyendo que puede; la marca es la carencia **más larga y
no la suma**, porque corren en paralelo; y se pregunta **en la fecha de la
cosecha**, no en la de hoy.

**Lo que rompe a propósito:** el campo es obligatorio, así que todo tratamiento
sin carencia se rechaza desde ahora. Rompió cinco llamadas en cuatro archivos de
prueba —todas actualizadas— y el formulario y la cola offline llevan el campo.
**No hubo nada que retroadaptar: 0 tratamientos y 0 cosechas existían.**

**Y lo que las diez pruebas NO son, para que nadie lo cuente dos veces:** una red
para el día que lleguen los datos, no un guardia sobre datos que existan. Sus
fixtures crean el tratamiento y la cosecha, así que la transformación sí se
ejercita — pero nadie ha tratado ni cosechado de verdad.

**Lo que queda fuera:** el aviso **no se ha visto en pantalla** —el servicio
devuelve las carencias con su producto y pintarlas es otro cambio— y los otros
tres campos que §4 pide siguen sin existir: objetivo, vía y fecha de retiro.
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
