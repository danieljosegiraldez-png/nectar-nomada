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
| P-F | Revisar las **cinco** guías de `docs/dominio/` — pH, Brix, subproductos y, desde el 2026-09-17, **Varroa** y **Meliponini** (ADR-158) | Las redactó un modelo a partir de indicaciones suyas y **nadie las ha repasado**. Traen umbrales con pinta de norma y frases como «PELIGRO: lave el café de inmediato». Qué respalda él y qué no, no lo decide el sistema | `grep -lq "^  estado    : borrador"` sobre los `.md` de la carpeta; carpeta ausente sale **2**, no cerrada |
| P-E | Destino de backup fuera de la máquina | *Cerrada hoy* — `NN_BACKUP_DIR` está en `~/.zshrc`. Se deja en la tabla porque vuelve a abrirse sola si alguien lo quita, y porque una tabla donde todo dice «abierta» no demuestra que el mecanismo discrimine | `! grep -q "NN_BACKUP_DIR" "$HOME/.zshrc"` |

**P-C y P-D no cambian ningún artefacto por sí solas.** Su veredicto aterriza
en un ADR de `docs/architecture/DECISIONS.md` que contenga literalmente la frase
de su prueba. Sin ese sitio nombrado, ninguna búsqueda distinguiría «sin hacer»
de «hecho y sin rastro».

---

## 2. Lo que se entregó — más nuevo primero

### 2026-09-17 · La limpieza se registra sobre la caja

ADR-159. Decisión de Daniel: «1, sobre la caja». **Ningún evento del apiario colgaba de la caja**
—todos de la colonia—, y la limpieza no puede: una caja vacía se desinfecta antes de recibir otra.
`HiveCleaning`, con los actos como arreglo y dos vocabularios fijos sacados del manual de Varroa
—**sólo los nombres, no sus cifras**—.

**Las reglas viven también en la base:** tres `CHECK` probados contra Postgres, 7 de 7, el primero
del repositorio sobre un arreglo de enum.

**La caja vacía es por día entero, no por instante.** La colonia muere el 10 y la caja se limpia el
10; la caja se limpia el 10 y entra colonia nueva ese día: las dos pasan. Su flip-test lo demuestra —
volver al instante tumba las dos. Renovar cera es la excepción: se hace con la colonia dentro.

**La primera acción del apiario que devuelve el error en vez de lanzarlo**, porque ésta rechaza en un
caso normal y el apicultor tiene que leer por qué.

**Pendiente:** los productos de tratamiento, que esperan a Daniel — y a leer «el botiquín del apiario»
(#386), recién fusionado.

### 2026-09-17 · Reposo, trilla, inventario — y una sesión que no leyó este archivo

**Fusionado:** #366 (reposo, trilla y subproductos: el café ya no se pierde entre secado y venta),
#368 y #371 (la inspección estaba construida dentro de la colmena y no se veía; y los formularios
respetan el permiso — Kenis ve su entrada de eventos y no una inspección que no puede enviar), #372,
#375 y #376 (specs de artefactos de colmena, nodo Smart Hive, inventario y análisis del contrato de
investigación). **Abierto:** #382, inventario con existencias — el saldo se deriva y «nunca contado»
no es «cero».

**Lo que hay que saber, y es la lección:** esta sesión arrancó en `~`, trabajó de resúmenes de su
propia memoria y **no leyó este archivo en ningún momento**. Le pidió a Daniel tres veces el correo
de Bob cuando Bob ya había entrado — la misma forma exacta que la nota de `apiary:load-protocol` de
abajo describe. Lo destapó `auditar-cableado`, no la sesión. **Leer esto al arrancar no es un
trámite: es la única fuente de lo que ya pasó.**

**Y un error con daño a otras sesiones, revertido:** renombró `apiñada` a `apinada` en la base de
pruebas compartida creyéndola derivada; iba POR DELANTE de git —otra sesión había aplicado
`vocabulario_del_dueno` antes de fusionarla—. La base compartida puede ir por delante de git.

**Diseños esperando a Daniel:** el botiquín (vencimiento, casa farmacéutica, custodia, aviso en
`/start`) en `docs/superpowers/specs/2026-09-17-faena-de-colmena-y-botiquin-design.md`, y la «faena»
—preguntar a qué vas antes de enseñar seis formularios—.

### 2026-09-17 · El material de soporte, guardado entero y verificable

ADR-158. Daniel: «deberías tener más documentación y material de soporte guardado, revisar todo».
**Tenía razón:** medido por contenido, el repositorio guardaba sólo las cuatro fuentes de Cerro Azul.
El grave era el **paquete Q1–Q49**: sus 49 decisiones vivían sólo en una carpeta de Documentos, y el
repositorio tenía únicamente mis análisis que lo citan.

**Ahora está todo, en dos clases que no se mezclan:** los **registros** —Q1–Q49, smart-hive, y
**trece decisiones de Daniel en sus palabras literales**, sacadas de la transcripción con su línea—
en `docs/architecture/`; el **conocimiento con cifras** —Varroa y Meliponini como **borrador**, ANSA
como **referencia externa**— en `docs/dominio/`. Índice: `FUENTES_INDICE.md`.

**«Verbatim» ya no es una promesa:** `fuentes-verbatim.test.ts` verifica cada copia en cada corrida,
smart-hive contra **su propio** manifiesto.

**Lo que encontró el contraste:** el manual de Varroa es de **clima templado**, y el **ácido fórmico
es de seguridad** en el trópico —el propio texto dice que por encima de 27 °C mata a la reina—.
Meliponini se contradice consigo mismo. ANSA es de Tucumán: géneros iguales, especies no.

**P-F pasa de tres guías a cinco**, y su texto se corrigió. Ninguna cifra de estos documentos entra
al software: los vocabularios de tratamiento y limpieza los decide Daniel.

### 2026-09-17 · Los vitales de campo se anotan en el sitio, y queda dicho que fue allí

ADR-157, y el hallazgo es sobre mi propio trabajo. El protocolo marca clima, colonias vivas y cajas
presentes como **`stage: field`** —cosas que se VEN estando ahí— y **las tres se capturaban sólo en
el formulario de cierre**, que se rellena en casa. Dos las puse yo el día anterior siguiendo a las
que ya estaban, sin comprobar que estuvieran bien.

**Daniel contestó una tercera opción, mejor que las dos que le llevé:** «se debería poder hacer
durante la visita o al cierre, a veces en sitio y si solo un apicultor es difícil maniobrar y ser
eficiente de entrar y salir y estresar menos a las abejas».

**Así que no se restringe: se registra cuál de las dos pasó.** `fieldVitalsOnSiteAt`, y una puerta
nueva disponible mientras la visita está abierta. Sin la marca, una cifra vista con el guante puesto
y una reconstruida de memoria son la misma fila, las dos `original_record`.

**La marca describe el valor ACTUAL:** el cierre la limpia si reescribe alguno de los tres. Su
prueba lleva el control de que un cierre que NO los toca la deja intacta.

**Lo que la puerta afirma es una sola cosa —que la visita seguía abierta—** y no comprueba GPS a
propósito: las coordenadas son del arranque, y exigirlas dejaría sin registrar una visita bajo dosel
cerrado, que es donde están las abejas.

**Y un flip-test volvió a destapar una prueba mía que no discriminaba** — la tercera en dos días.


## 3. Bloqueado, y en qué

#### El presupuesto de Actions se agotó y volvió — y `main` ya no tiene compuerta propia

**2026-09-14.** Actions dejó de correr sobre las 17:00 con la anotación *«The job was
not started because an Actions budget is preventing further use»*. Se lee como el rojo
de una compuerta propia —«¿Hay código en este cambio?: failure» y las otras tres
`skipped`— y **no es el cambio**: el job nunca arrancó. Cuatro corridas seguidas, dos
PR de sesiones distintas y dos pushes a `main`. La trampa y su discriminante de dos
comandos están en `CLAUDE.md`.

**Lo que bloqueaba:** la protección de `main` exige tres checks evaluados sobre el PR,
así que nada se podía fusionar. No hay reintento que lo salte. Verificado que Vercel es
independiente: llega como `status`, no como check-run, y siguió desplegando.

**Restablecido la misma tarde**, medido y no supuesto: el PR #310 llevó las tres
compuertas en `SUCCESS` con runner y pasos de verdad, contra el `runner_name` vacío y
`steps: []` de las corridas muertas. **Ése es el discriminante**, no la conclusión: una
corrida sin runner sale `failure` y se lee como un fallo del cambio. Mientras duró se
fusionó con los dos carriles corridos en local sobre el árbol rebasado y con base creada
desde cero — es peor evidencia que CI y hay que decirlo, no equipararla.

**Y por decisión del dueño se quitó el disparador `push` del workflow**, que era la
mitad del gasto: 576 corridas desde el 1 de septiembre, **293 de `push`** y 15
canceladas solas. Consecuencia que hay que saber: **`main` ya no tiene corrida
después de fusionar.** Nada entra sin revisar —el PR sigue corriendo y la protección
lo exige— pero se pierde la red de después, el caso de dos PR verdes que juntos
rompen `main`. La sección de `CLAUDE.md` que mandaba leer el estado del commit
fusionado queda corregida allí.

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


- **Dar acceso a alguien más que Daniel y José** — **Bob Huerbsch YA ENTRÓ**: lo
  dijo Daniel el 2026-09-17. **No se verificó contra la base y no se puede** —
  leer producción está prohibido—; es la palabra del dueño, y basta. Queda
  **Kenis Abdiel Rodríguez Núñez** (`rodriguezkenis907@gmail.com`, perfil `Apiary
  Colony Event Recorder` sobre los dos apiarios de Finca Rosina: guion
  `data:kenis-apicultor`). Sherry y Chris siguen sin correo. **Antes de pedirle a
  Daniel que corra algo, buscarlo aquí.**
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

- **`npm run apiary:load-protocol` YA SE CORRIÓ — 2026-09-16, lo confirmó Daniel.**
  `apiario-campo-v1` está en producción, así que las pantallas de captura de campo
  tienen qué preguntar. **Se anota justamente porque no estaba anotado:** ese día
  se le pidió correrlo como «lo único que falta» sacándolo de la memoria de una
  sesión anterior y **no de este archivo**, donde nunca figuró (control positivo:
  `sensory:create-protocol`, que sí figura, aparece arriba). Sin esta línea, la
  siguiente sesión vuelve a pedirle un guion que ya corrió.

  **No se verificó contra la base y no se puede:** leer la base de producción de
  Neon está prohibido. Es la palabra del dueño, y basta — pero la distinción
  importa si alguien lo vuelve a dudar: el guion imprime **lo que dice el archivo
  y lo que hay en la base**, y las dos líneas contienen `apiario-campo-v1`.

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
