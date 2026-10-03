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
| P-F | Revisar las guías de `docs/dominio/` que quedan: **Varroa** y **Meliponini** (ADR-158). Las tres de café están **reemplazadas** por `docs/beneficio/10`–`12`, y el origen de los umbrales quedó decidido en ADR-181 (2026-09-19); selección, balance y enrutamiento de `12` siguen sin revisar | Las redactó un modelo a partir de indicaciones suyas y **esas dos nadie las ha repasado**. Traen umbrales con pinta de norma y frases como «PELIGRO: lave el café de inmediato». Qué respalda él y qué no, no lo decide el sistema | `grep -lq "^  estado    : borrador"` sobre los `.md` de la carpeta; carpeta ausente sale **2**, no cerrada |
| P-G | Quién aparece en «quién lo hizo» de una rutina (PR #435) | Hoy ofrece a todas las personas activas de la plataforma, como inspecciones y trampas: un operario ve nombres de otras organizaciones. Acotarlo por sitio es transversal | `! grep -qiE "^## ADR-[0-9]+.*quién lo hizo acotado"` sobre `DECISIONS.md` |
| P-H | Des-retirar un modelo de equipo (PR #435) | Hoy no se puede y el nombre retirado queda reservado. La acción es fácil; si debe existir, es de él | `! grep -qiE "^## ADR-[0-9]+.*des-retirar modelos"` |
| P-I | Cómo se da de alta un proveedor de equipos (PR #435) | Sólo se eligen organizaciones `supplier` aprobadas, dadas de alta por la vía de organizaciones | `! grep -qiE "^## ADR-[0-9]+.*alta de proveedores"` |
| P-E | Destino de backup fuera de la máquina | *Cerrada hoy* — `NN_BACKUP_DIR` está en `~/.zshrc`. Se deja en la tabla porque vuelve a abrirse sola si alguien lo quita, y porque una tabla donde todo dice «abierta» no demuestra que el mecanismo discrimine | `! grep -q "NN_BACKUP_DIR" "$HOME/.zshrc"` |

**P-C y P-D no cambian ningún artefacto por sí solas.** Su veredicto aterriza
en un ADR de `docs/architecture/DECISIONS.md` que contenga literalmente la frase
de su prueba. Sin ese sitio nombrado, ninguna búsqueda distinguiría «sin hacer»
de «hecho y sin rastro».

---

#### Los seis productos de Finca Rosina: y la dosis en café NO está en sus etiquetas

**CORREGIDO EL 2026-10-01: este bloque pedía «las etiquetas». Llegaron, y el bloqueo es otro.** Las
cuatro que mandó Daniel **no registran café**: Regent (maíz, papa), Abamectin 18 EC y ABAMECTAN 1.8 EC
(frutales y hortalizas). Cero menciones de café, cafeto, broca ni *Hypothenemus*, con control positivo
de que los acentos se leen. Lo literal de cada una, con su procedencia, en
`docs/dominio/fitosanitarios-etiquetas.md`.

**Lo que falta de Daniel, en orden de lo que bloquea más:**

1. **De dónde sale la dosis en café** — de la etiqueta no sale. Si es del técnico, de Anacafé o de la
   práctica de la finca, se registra **con esa procedencia escrita**; lo que no se hace es tomar una
   dosis de alcachofa y escribirla como de café.
2. **Las páginas 2-4 de Bralic**, donde está su tabla. Esta máquina no tiene ninguna herramienta de PDF
   y el visor nativo sólo rinde la primera; los otros caminos devolvieron nada **y su control también**.
3. **Cuál de los DOS productos de abamectina** está en la bodega: sus reingresos son **24 h** y **48 h**,
   que es la diferencia entre dejar entrar a alguien al lote o no.
4. **Las imágenes de Beauveria**, perdidas al compactarse la conversación del 2026-09-30.
5. **Cantidad y lote del fabricante** de los seis. Sin eso, darlos de alta afirma existencias que nadie
   contó — y el alta va atada a recibir un frasco, así que no hay camino de catálogo sin existencias.

## 2. Lo que se entregó — más nuevo primero

### 2026-10-02 · Los ejes de la curva, y una cita que sólo se hace cuando se sostiene (plan del #577)

**Lo que §4.5 pedía y faltaba:** los ejes con horas y valores, y la guía de la rúbrica 22 bajo la
curva. Los ejes están, medidos en un navegador: 18 px de cuerpo → 13,8 efectivos → **11,2 en un
teléfono de 375**, ningún rótulo fuera del lienzo y sin scroll horizontal. Y la curva ya dice qué
sugiere el dato si se sigue esperando, **citado literal** de las ocho filas de
`10_ph_fermentation.md` §1 — ocho, no las «seis» que el plan contaba.

**Lo que NO se escribió, y es la mitad de un renglón de §4.5: «qué hacer».** No existe en ninguna
fuente del proyecto; la cuarta columna de esa matriz dice lo que hace el *software*, no el operario.
Así que se abre la columna **vacía**, con una nota que dice que la rellenas tú, y un guardia que
falla si alguien la rellena sin que el código la recoja **hasta la pantalla**. Consecuencia que hay
que decir en voz alta: **la rúbrica 22 §1 queda incumplida a propósito** —pide que todo punto que
emite una alerta diga qué hacer— y eso es una decisión tuya, no una omisión.

**Lo que las revisiones encontraron, y vale más que el diff.** Dos Críticos de la revisión de rama:
la cita se prestaba a **cualquier** lote cuando la matriz es del perfil `WASHED_STANDARD` —30 valores
dentro de la ventana óptima de `NATURAL` recibían una cita de cinética de lavado, y tu ficha del lote
ya se niega a prestarlos—; y «tu última lectura» no estaba determinada con varias lecturas en el
mismo instante, que son **7 de 10 lotes** reales. Y Codex, que **no aprobó la primera vez**, construyó
una entrada donde la pantalla se contradecía sola: «no tiene rango declarado en la receta» y debajo
«Degradación ácida». Hoy el bloque sólo habla con grado `Washed`, **fermentación** abierta **y receta
presente**; si falta cualquiera de las tres, calla.

**Qué queda tuyo**, todo en §1 o aquí: leer los `ProcessTarget` de la receta en vez de la plantilla;
«Daño consumado» contra la literatura que el propio documento cita; que el bloque hable en la hora 0
de todo lote sano y **calle en la ventana óptima** (antipatrón 8 de la 22, un solo asunto visto de
los dos lados); y `PENDING_IMPLEMENTATIONS/021`, que es si una lectura sin procedencia verificada
puede sostener una afirmación.

## 3. Bloqueado, y en qué

#### Chris Huerbsch sigue partido en dos fichas, y lo cierra un comando de Daniel

El guion está arreglado y en `main` (#593, #594, #595) y **la consolidación no se ha aplicado**: la
ficha del 13-08 tiene la membresía a Finca Rosina y la del 17-09 el correo y la cuenta activa con su
Platform Admin. El ensayo contra producción confirma el plan: 2 asignaciones a mover, la duplicada
referenciada sólo por su cuenta en 52 columnas. Falta que Daniel corra la misma línea con `--aplicar`
y lea lo que el ensayo ahora imprime: el desglose «N propias + 2 movidas» y **las referencias a la
cuenta que va a borrar**. Si esa cuenta tiene historia el guion se niega a propósito — borrarla
pondría a NULL el actor de su auditoría (`ON DELETE SET NULL`), que es lo que §35 prohíbe. Lo que no
tiene es prueba de conducta: los guardias leen la fuente y lo dicen en su cabecera.

#### El aviso de floración está construido y no se puede alcanzar (PR #587, #590)

`floracionesDeLaParcela` devuelve `[]` en toda parcela porque **nada registra una floración**. Medido
con control positivo (`plotIntervention.create` sí tiene escritor): el único escritor de `plotBloom` es
`lib/traceability/floracion.ts`, **0 pantallas** llaman a `registrarFloracion` y **0 acciones de
servidor lo exponen**. Daniel dijo que la registraría él. Limitación a propósito: una intervención
dirigida sólo a PLANTAS deja `bloquesElegidos` vacío, que la contención lee como «la parcela entera»,
así que puede avisar por un bloque que esas plantas no tocan — de más, nunca de menos, y sin bloquear.

#### La rejilla: tareas 1 a 3 en `main`, 4 a 8 empujadas, y las pantallas son la 7

Diseño y plan del 2026-10-01 en `docs/superpowers/`, siete tareas. Medido por contenido: **en `main`**
`lib/territorio/rejilla.ts`, la tabla `PlotBlockRange` con sus disparadores, y la rejilla en
`updateLocationAttributes` (#589). **Fuera:** `rejilla-tarea-4` a `-8`, apiladas y sin PR; la 5 escribe
los rangos —hoy **0 archivos de código** tocan `PlotBlockRange`— y la **7 son las pantallas**. Hoy se
crea una microparcela y un bloque con nombre y tipo, pero **no se dice qué celdas cubre**. Decisión de
Daniel abierta: si `description` se copia a la microparcela. Hoy no, y hay argumento para dejarlo así.

#### Que la intervención de finca sirva para cualquier producto (de Daniel, 2026-10-01)

Bioestimulante, fertilizante, insecticida, fungicida — no sólo fitosanitario. **No es quitar un
filtro.** Medido: el acto ya admite `aplicacion`/`liberacion`/`manejo_cultural` y el encierro son dos
líneas de `lib/traceability/intervenciones.ts` (834 filtra por `isPlantProtection`, 199 rechaza); pero
el objetivo es una lista cerrada de **13 plagas y enfermedades** sin ningún valor de nutrición, así que
un fertilizante no tendría cómo decir para qué se aplicó. **Y los nombres NO los fija el contrato:**
`docs/beneficio/03_public_api.md` no menciona ninguno de los ocho términos —control positivo, «enum»
sale 15 veces— y gobierna el beneficio, no la finca. La pregunta es si un fertilizante es otra clase
con su propio objetivo, o si «objetivo» pasa a ser «propósito» y las plagas son un caso suyo.

#### El tablero del beneficio: el paso 1 y las tres piezas de §4.5 están en `main`

**Decía «faltan las piezas visuales» y lleva rancia desde el PR #573**, que las fusionó; antes decía
«la vista no existe», falso desde el #545. Medido contra `origin/main` `7bc07339` el 2026-10-01, con
control negativo en 0: `lineaDeEtapas.ts`, `liberacionDeUnidad.ts` y `curvaDeLote.ts` existen los
tres, con su `CurvaDeLote.tsx`. La ruta la fijó **ADR-193**; el diseño sigue en
`docs/superpowers/specs/2026-09-16-tablero-del-beneficio-design.md`. Y la decisión que esta entrada
pedía ya la tomaste: recepción y selección dicen `sin_registro`, no un cero — **ADR-195**.

**Lo que SIGUE abierto, medido el 2026-10-01:**

- **El paso 2, capacidad con migración: sin plan escrito** (0 de 39 planes lo nombran).
- **El umbral de color de §4.5, decisión tuya:** hoy un lote en «Aviso» deja su etapa en gris.
- **`PENDING_IMPLEMENTATIONS/014`–`021`.**
- **Y de §4.5 queda «qué hacer», que no existe en ninguna fuente:** la columna está abierta y vacía
  en `docs/beneficio/10_ph_fermentation.md` §1, con su guardia, y **la rúbrica 22 §1 queda
  incumplida a propósito**. El detalle está en la entrada «Los ejes de la curva, y una cita que sólo
  se hace cuando se sostiene», que vive aquí hasta que se archive y después en
  `docs/SESSION_STATE_ARCHIVE.md`.

**Y una advertencia del paso 1 que no se debe perder:** la base local tenía 0 tanques y 0
instrumentos, así que **la capacidad nunca quedó ejercida con unidades reales** — el bloque
salía «0 de 0». Verde no es lo mismo que probado.

#### Deuda de filas en `nectar_test` (PR #488, #498)

Rescatado de la misma: ~405 filas de 27 corridas en `ambiente`, `intervenciones`, `samples`,
`ceraDeExtraccion` y `landMedia`. **Nadie la ha limpiado:** barrer por patrón en una base
compartida es tocar trabajo ajeno.

#### Recolectores: darles su perfil (de Daniel)

Movido aquí al archivar la entrada de la jornada de cosecha (PR #431): dar el perfil **Recolector**
(ámbito: la finca) a cada recolector con cuenta, para que anote su entrega en `/mis-entregas`.

#### Kiva Estate: crear su terreno (de Daniel)

Movido aquí al archivar la entrada de fincas y parcelas (PR #425): crear el terreno de **Kiva
Estate** desde `/fincas` → «sin terreno».

**CORREGIDO EL 2026-09-30: decía que «el seed dice que es un nombre ficticio (`seed.ts:168`)». Ya no.**
El PR #551 lo dio la vuelta: hoy el seed dice lo contrario —líneas 180-184 y 274— y usa `DEMO Rivera
Estate`. La línea 168 que se citaba es otra cosa, así que mandaba a mirar donde no hay nada.

**Lo que sigue siendo de Daniel:** crear los dos terrenos, y correr `data:kiva-no-es-demo`,
`data:gestores-de-finca` y el `rbac:grant` de Chris Huerbsch. Los cuatro van contra producción y los
tres guiones **simulan por defecto**. Si la descripción «DEMO placeholder» sigue o no en esa fila
**no se ha medido** —leer producción de Neon está prohibido desde aquí—: el guión la comprueba él
mismo y **aborta sin escribir** si alguien puso otro texto, que es por qué se puede correr a ciegas.


#### «Mis pedidos» no dice de qué lote salió el frasco (espera a Daniel)

Movido aquí al archivar la entrada del despacho por lote (ADR-169): el dato ya se guarda
(`OrderItemLot`), falta la pantalla del cliente, y **qué del lote se le enseña** —código, apiario,
cosecha, fotos— lo decide Daniel.

#### Nodos de sensores: lo que falta cuando haya nodos (de Daniel)

Movido aquí al archivar la entrada de artefactos (PR #405), porque sigue dirigiendo trabajo:
`NOTEHUB_ROUTE_SECRET` en Vercel y en la ruta de Notehub, y registrar cada nodo con su UID de
Notecard — registrar y calibrar **no tienen pantalla**. `POST /api/v1/ingest/notehub` sigue
**cerrada por defecto** hasta entonces.

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

#### Pendientes sueltos, sin sección propia

Una veintena de pendientes distintos colgaba de un encabezado que sólo nombraba
al primero; desde el 2026-09-29 ese primero es un punto más de la lista.

- **Un vocabulario de procedencia por formulario — declarado el 2026-09-08.**
  Los ocho subconjuntos viven en `lib/traceability/procedencia.ts`, tipados
  contra el enum, y el servidor ya no acepta más de lo que la pantalla pinta
  —su entrada está en `docs/SESSION_STATE_ARCHIVE.md`—. **Sigue abierto cuál
  debe ofrecer cada una**: que una medición pueda declararse `interpretation` y
  una calicata no, que el enum tenga diez valores y las pantallas ofrezcan
  cinco, y si `manufacturer_specification` debería estar en alguna. Decisión de
  diseño, sin tomar.
- **Dar acceso a alguien más que Daniel y José** — **Bob Huerbsch YA ENTRÓ**: lo
  dijo Daniel el 2026-09-17. **No se verificó contra la base y no se puede** —
  leer producción está prohibido—; es la palabra del dueño, y basta. Queda
  **Kenis Abdiel Rodríguez Núñez** (`rodriguezkenis907@gmail.com`, perfil `Apiary
  Colony Event Recorder` sobre los dos apiarios de Finca Rosina: guion
  `data:kenis-apicultor`). Sherry y Chris siguen sin correo. **Antes de pedirle a
  Daniel que corra algo, buscarlo aquí.**
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
- **Las páginas de `app/`: dos pasadas hechas, quedan las demás** — lo que la
  quinta y la sexta revisión (2026-09-05 y 06) encontraron ya está arreglado, y
  su detalle archivado. Sigue abierto que **quedan páginas sin mirar con esas
  lentes**, y cada lente nueva ha encontrado algo que las anteriores no podían ver.
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

- **Clasificar por malla sobre muestra: decidido y sin construir (ADR-190, ADR-191)** —
  Daniel decidió el 2026-09-29 que son **dos operaciones** —medición sobre unos cientos de
  gramos, y el corte físico al procesar— y cómo se nombran: **`SampleKind.SCREEN`** y una
  tabla **`GreenScreenFraction`** que espeja las cuatro columnas `greenScreen*` de `Lot`.
  **No hace falta ninguna variable de medición**: una fila de `Measurement` no tiene dónde
  ir el rango. Falta construirlo —tabla, migración, y el servicio que escribe esas filas—
  y decidir si las tres lecturas deben distinguir en pantalla una fracción medida sobre
  muestra de una salida de un corte real. El corte de hoy no se toca.
- **Dos guiones que YA SE CORRIERON: no volver a pedírselos a Daniel.** La v2 del
  protocolo sensorial (2026-09-18) y `npm run apiary:load-protocol` v1
  (2026-09-16, `apiario-campo-v1` en producción), las dos confirmadas por él.
  **No se verificó contra la base y no se puede** —leer producción de Neon está
  prohibido—: es su palabra, y basta. El segundo se anota porque **no estaba
  anotado**, y ese día se le pidió correr un guion que ya había corrido.

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
| Fusionar `origin/fitosanitarios-pr-b` | No tiene **ningún** commit que `main` no tenga (medido 2026-09-29; control al revés: 384) y cero archivos que difieran. El trabajo ya está en `main`, en `lib/traceability/intervenciones.ts` |

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
