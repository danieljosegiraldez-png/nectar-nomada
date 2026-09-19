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

### 2026-09-19 · La reina guarda el año en que nació; su color es el apodo

ADR-175. Daniel: el color del año es sólo apodo, las reinas no se pintan. `queen.birth_year` (nulo
si no se sabe), no posterior a su llegada; la historia de reinas dice «la blanca de 2026». **Sin
ver en navegador.** Sigue: «marcos negros» en la inspección.

### 2026-09-18 · Jornada de cosecha y entrega al beneficio (PR #431, pieza 1 de 3)

Daniel: «en finca no se registra cosecha… se asigna personas a cosecha, y esta persona… lleva al
beneficio». Spec y plan `docs/superpowers/{specs,plans}/2026-09-18-jornada-y-entrega-de-cosecha*`.
- **`/finca/jornadas`:** abrir una jornada (parcelas × recolectores), recolectores de la finca;
  la jornada anota entregas (origen parcela/bloque/planta, kg de finca, hora, foto), anula con
  motivo y se cierra. **Ninguna entrega crea lote**: queda `enviada` (piezas 2 y 3: recepción con
  doble peso, y lotes).
- **`/mis-entregas`:** el perfil nuevo **Recolector** anota SU entrega y reporta situaciones o la
  condición del día (sin mm: eso es de instrumentos) con foto. Las ve el Farm Manager y el capataz;
  a un compañero, sólo con `field_report:view` concedido en `/admin/users/…/permisos`.
- **Sin ver en navegador.** Specs aprobados sin construir: condiciones fijas del terreno,
  instrumentos de campo.

**De Daniel:** dar el perfil Recolector (ámbito: la finca) a cada recolector con cuenta. «Mis
entregas» no va al menú (decisión suya del 2026-09-19): se entra al iniciar sesión y desde Mi Néctar.

### 2026-09-18 · La cera con el color de su año

ADR-173. Daniel: la cera nueva de un año lleva el color de ese año, el de las reinas. El color se
calcula (`colorDelAño`); se anotan la cera que entra y los marcos que salen, y la ficha del apiario
enseña la leyenda con avisos a los 2 y 4 años. **Sin ver en navegador.** Siguen: «marcos negros»
en la inspección (toca la cola sin conexión) y el año de las reinas.

### 2026-09-18 · El manejo fitosanitario de la parcela

ADR-174 (nació como 170; otras sesiones ocuparon 170-173 mientras se integraba: el número de un
ADR se asigna al fusionar, no al escribirlo).
Registro de intervenciones fitosanitarias: cuatro clases (comprados, preparados, liberaciones,
manejo cultural); doce objetivos + otro (todo de Daniel, con procedencia en el spec). Dos columnas nuevas
en `ConsumableMaterial` (`isPlantProtection`, `defaultReentryHours`); tres tablas nuevas. **El descuento
del frasco es directo, sin fila de consumo, igual que el botiquín** — Daniel lo aprobó sabiendo que
cambiaba lo que vio en el chat. Carencia y reentrada en aritmética pura; marca en la cosecha como foto
(`HarvestWithdrawalFlag`, nulo = desconocida). Aviso cuando hoy difiere de lo que se sabía. Reentrada
en tablero y al abrir jornada; corregir no descuenta de nuevo. PR A; el PR B ya puede empezar:
`PlotBlock` y `TrapRule` están en `main` desde el PR #413.

**Incidente durante T8:** un subagente corrió `npm run test:db -- reset` sobre la base compartida
55433 (2026-09-18 ~23:39Z, restauró el backup del 2026-09-14). La instrucción «no la resetees» estaba en
los dispatch de T3–T7 y faltó en el de T8. Esquema coherente al medir después (10 de 12 migraciones
ajenas volvieron). Datos de prueba perdidos entre el 14 y el reset no se reparan. **Ruling:** todo
dispatch llevar prohibición explícita de reset/restore/migrate dev.

### 2026-09-18 · Alzas con marca

ADR-171. Daniel: las alzas «se marcarán». Se registran en la ficha del apiario, se ponen en una
colmena como artefacto con marca y la cosecha dice cuáles salieron. Las sin marca se siguen
contando. La inspección que quita alzas ya no cierra las marcadas. **Sin ver en navegador**: hace
falta entrar con una cuenta. Siguen: la cera por color de año y el año de las reinas.

### 2026-09-18 · Abrir una jornada sin propósito da un mensaje, no un 500 (PR #433)

`friendlyError` (`app/actions/traceability.ts`) **relanza toda clase que no conoce**, y no conocía
`PropositoInvalido`: el formulario manda `[]` y el servicio lo rechaza. Ahora dice «Elige al menos un
propósito de la visita». **Una clase de validación nueva que llegue a una acción necesita su rama
ahí**, o es un 500. Prueba hermética con flip-test. **Sin ver en navegador.**

### 2026-09-18 · Anular una asignación a tienda que no va a llegar

ADR-170. Una asignación pendiente se anula con motivo y día —desde `/tienda` o desde la ficha del
lote— y sus envases vuelven a libres. No se borra (quién, cuándo, por qué y AuditEvent); una
recibida no se anula y una anulada no se recibe. Salió como hueco del flujo de dos actos, no como
petición de Daniel.

### 2026-09-18 · Fincas y parcelas: elegir la finca, y crearlas desde la app (PR #425)

Daniel: «debería preguntarme qué finca —trabajo con varias— o mostrarme todas» y «no me deja crear
parcelas». Spec y plan `docs/superpowers/{specs,plans}/2026-09-18-fincas-y-parcelas*`.
- **Elegir:** `/fincas`. La elección vive en una cookie de sesión que **sólo acota**: una finca
  ajena se ignora. `/finca`, `/plots` y `/lots/new` preguntan si hay varias y ninguna elegida.
- **Crear:** finca nueva o terreno de una organización sin él (sólo admin, permiso nuevo
  `organization:create_farm`); parcela (Farm Manager de esa finca, `create_site`); microparcela
  (`createMicrolot`, que ya existía sin pantalla). Nombres únicos bajo el mismo padre.
- **La cosecha sólo sobre `plot`**, lo comprueba el servicio.
- **Sin ver en navegador.**

**De Daniel:** crear el terreno de **Kiva Estate** desde `/fincas` → «sin terreno». El seed dice que
es un nombre ficticio (`prisma/seed.ts:168`) y Daniel dice que es real: el comentario queda para que
él decida.

### 2026-09-18 · El despacho dice de qué lote sale cada frasco

ADR-169. Daniel: «lo elige quien despacha». **El despacho no existía** —nada ponía un pedido en
`fulfilled`— y hay cero pedidos en la copia local. `/tienda` lista los pagados; por artículo se dice
cuántos frascos salen de cada lote recibido, la suma tiene que dar lo pedido, y los kilos salen del
libro del lote (`transfer_out`). Falta que el cliente lo vea en «Mis pedidos».

### 2026-09-18 · La muestra verde sólo en almacenamiento, y la 111 retirada (PR #419)

Spec #408 (con las 5 respuestas de Daniel) y plan #414, aprobados y fusionados. **Bloquea** en
`createSampleFromLot` una muestra `materialState` verde si el lote no está en almacenamiento; **sin
permiso de anulación**. «Crear Muestra» pide el estado del material. `retirarMuestra` (columna
`retiredAt`, migración `20260918180000_muestra_retirada`, `AuditEvent` en la misma transacción);
«Nueva cata» ni ofrece ni acepta retiradas. **La 111 (lote PE-80) está retirada en producción**, por
el guion `data:retirar-muestra-111`: ensayo primero, 1 `sample.retire` con motivo, 0 muestras activas.
Nota a `01_lot_lifecycle` §2 regla 4: volver del secado a una fase anterior es receta, no error.
**Consecuencia esperada:** hoy ningún lote tiene proceso cerrado ni almacenamiento registrado, así que
no se puede tomar muestra verde hasta que la captura de campo alimente esas fases. **Sin ver en
navegador.**

**Tres cosas que se cazaron antes de producción:** el guion buscaba `id: "111"` —es el código; el id es
un uuid— y habría fallado sin retirar nada; la migración se llamaba `…130000` y habría llegado detrás
de otras ya aplicadas; y las cifras del inventario de acceso se desfasaron dos veces al avanzar `main`
(CI prueba el PR fusionado con `main`, no la rama). Y `tools/pack-for-review.sh` (#390, #391, #393,
#396, #401): lee todo de la punta del rango, rutas con espacios y con tildes; en bash 3.2, `set -e`
mata el script cuando falla una función aunque esté a la izquierda de un `||`.


## 3. Bloqueado, y en qué

#### Nodos de sensores: lo que falta cuando haya nodos (de Daniel)

Movido aquí al archivar la entrada de artefactos (PR #405), porque sigue dirigiendo trabajo:
`NOTEHUB_ROUTE_SECRET` en Vercel y en la ruta de Notehub, y registrar cada nodo con su UID de
Notecard — registrar y calibrar **no tienen pantalla**. `POST /api/v1/ingest/notehub` sigue
**cerrada por defecto** hasta entonces.

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

- **PR B del manejo fitosanitario** — bloqueado en que `PlotBlock` y `TrapRule` existan en `main`. Áreas
  por bloque, `TrapRule.suggestedMaterialId`, botón «Registrar aplicación» desde el aviso de trampa,
  aviso atendido. Pieza 2 (#369, diseño+plan fusionado).

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

- **La v2 del protocolo YA ESTÁ CARGADA en producción — 2026-09-18, lo confirmó Daniel.** La
  vista previa dice «versión(es) 1, 2» y que la 2 ya está (con el guion arreglado en #422: el
  viejo buscaba el identificador por versión y habría dicho «NO está»).
- **`npm run apiary:load-protocol` (v1) YA SE CORRIÓ — 2026-09-16, lo confirmó Daniel.**
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
