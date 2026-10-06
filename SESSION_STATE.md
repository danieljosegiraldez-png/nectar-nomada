# Estado — Néctar Nómada OS

Dónde está el proyecto. Cómo se construye está en `CLAUDE.md`; son archivos
distintos a propósito. El registro largo de decisiones es
`docs/architecture/DECISIONS.md` (ADR-001 … ADR-103) y **no** se duplica aquí.

**Presupuesto: ≤450 líneas y <20.000 tokens.** Lo hace cumplir
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

**Heredadas de dos entregas archivadas el 2026-10-05**, que seguían abiertas y el histórico no dirige trabajo: si **dos corridas abiertas en una cama** son conflicto de datos y si una receta de fermentación debe **obligar** a medir pH (#603/#605); si la **coordenada de un plantón** exige tablero, los dos puntos sin resolver de tu lego del 2026-10-03 (`docs/superpowers/specs/2026-10-02-forma-del-lote-y-densidad-design.md`), y si el rango de la microparcela sigue «opcional a propósito» o pasa a obligatorio como pide #621 §3.2.

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

#### Preguntas tuyas rescatadas de entregas archivadas el 2026-10-04

- **Si dos corridas abiertas en una CAMA son un conflicto de datos.** Para un tanque sí; con varias
  bandejas puede ser lo normal. Hoy el recuento por unidad las marca como conflicto en los dos casos.
- **Si una receta de fermentación debe OBLIGAR a medir pH.** Hoy no obliga.
- **Si la coordenada de un plantón exige tablero**, y los dos puntos del esquema que tu lego del
  2026-10-03 deja sin resolver — en `docs/superpowers/specs/2026-10-02-forma-del-lote-y-densidad-design.md`.
- **Si el rango de la microparcela sigue «opcional a propósito»** (`schema.prisma:941`, su comentario
  en la 923) o pasa a obligatorio como pide el #621 §3.2.

## 2. Lo que se entregó — más nuevo primero

### 2026-10-05 · El módulo de finca: cinco puertas, y dos defectos que sólo se vieron usándolo (#641–#645)

**Las cinco en `main`**, fusionadas tras juntarlas en local y medir el árbol combinado —typecheck 0, hermético 206/2796, con base 206/2581— y comprobar que el `main` resultante es **el mismo árbol byte a byte**. Cierran brecha: la situación del recolector deja de caer en un agujero (#641), el inventario de pedir lo que no ofrece (#642), la cabecera cabe en una fila (#643), la masa extraída se congela en la muestra para que el tueste la lea (#644), y la ficha del lote pone el trabajo arriba y pliega lo que se consulta (#645). En la ficha, a 375 px y con cuenta de **Farm Operator** —no de admin, que ve «todo» y no mide lo que ve un operario—, el primer botón de acción pasó de 512 a **367 px**; pero «Procesamiento» mide **1.778 px él solo**, así que lo que falta está dentro, no en el orden.
**Dos defectos que ninguna prueba veía, los dos de usar la pantalla:** la ficha **daba un 500** a un operario acotado a un proyecto —el permiso es deliberado, la página lo llamaba sin red; arreglado en #645—, y **«Historial» estaba vacío en los 108, no en 105** —las 3 filas con `entity_id` de un lote son de `entity_type = 'lot'`, un sexto tipo que la consulta ni pedía—; **arreglado en #648**, con 104 de 108 estrenando historial.
**Qué queda tuyo:** si la Decisión 3 de ADR-096 («las secciones vacías se quedan») se da por revisada —su condición, «once the sections are routinely full», **no se cumple**: mediciones 9 %, muestras 1 %, fotos 0 %—; y recorrer entero el tueste desde muestra, que ya no falla y nadie ha usado.
### 2026-10-04 · El inventario de acceso lee el programa, no el texto (#639)

**Las fichas `007` (los dos escalones) y el primer dominio de la `005`.** 618 → 624 operaciones en 170 archivos, **cero bajas**, con el detector sobre el AST. Seis no existían —su cliente se llama `db` y la fila se descartaba entera—, entre ellas `ubicacionesEmparentadas`. De 14 cambios de clase, **doce venían de un comentario**: `lots.ts:683` nombra `can()` y el detector lo contaba como llamada. `guardia transitivo` pasó de **0 a 59**: la clase era inalcanzable por construcción.
**Lo que enseñó, y es contra mí:** usé un instrumento de **archivo** para una pregunta de **camino** y escribí tres razones falsas en el allowlist; `--llamadores` responde ahora por unidad (`OK` 48 → 32). Y un flip-test destapó que la compuerta de cifras dejaba **quitar la fila de una clase** sin ponerse roja.

### 2026-10-05 · El Historial del lote: la lectura preguntaba por el id del lote (#648)

`getLotDetail` buscaba `core.audit_event` con `entityId = lotId` para cinco tipos cuyas escrituras guardan el id del **propio evento**: **0 de 1.792** filas alcanzables, en los 108 lotes. Y faltaba el sexto, `lot`, el único con el id bueno — así que la **liberación** de un lote tampoco salía. Hoy la lectura resuelve los ids de los hechos y son **nueve** sujetos; las cinco exclusiones van nombradas en el propio bloque con su cifra (`treatment_batch`, 44 vivas, es la mayor). El guardia que faltaba es de **conducta**: `tests/traceability/historialDelLote.test.ts`.
**Lo que enseñó:** una ficha puede cerrarse con sus tres comprobaciones en verde y el defecto vivo, si las tres miran artefactos. Y la revisión de Codex encontró **tres defectos en el arreglo** que la compuerta no veía — uno ocurrió de verdad una hora después. Las dos lecciones están al final de `CLAUDE.md`.
**Queda tuyo:** `PENDING_IMPLEMENTATIONS/023` — si una fila de auditoría debe decir a qué lote pertenece sin consultar la entidad, y si la historia de un ensayo y la del proceso que cubre al lote entran en su historial.

## 3. Bloqueado, y en qué

> **Auditado bloque por bloque el 2026-10-04:** once afirmaciones ciertas (listadas con su control en
> `docs/SESSION_STATE_ARCHIVE.md`, «Auditoría de §3»), una falsa —archivada— y ocho con cifras rancias, corregidas aquí con su fecha.


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

#### Que la intervención de finca sirva para cualquier producto (de Daniel, 2026-10-01)

Bioestimulante, fertilizante, insecticida, fungicida — no sólo fitosanitario. **No es quitar un
filtro.** Medido: el acto ya admite `aplicacion`/`liberacion`/`manejo_cultural` y el encierro son dos
líneas de `lib/traceability/intervenciones.ts` (193 filtra por `isPlantProtection`, 199 rechaza; re-medido el 2026-10-04 — decía 834, y el archivo tiene 896 líneas); pero
el objetivo es una lista cerrada de **13 plagas y enfermedades** sin ningún valor de nutrición, así que
un fertilizante no tendría cómo decir para qué se aplicó. **Y los nombres NO los fija el contrato:**
`docs/beneficio/03_public_api.md` no menciona ninguno de los ocho términos —control positivo, «enum»
sale 15 veces— y gobierna el beneficio, no la finca. La pregunta es si un fertilizante es otra clase
con su propio objetivo, o si «objetivo» pasa a ser «propósito» y las plagas son un caso suyo.

#### El tablero del beneficio: el paso 1 y las tres piezas de §4.5 están en `main`

Las tres piezas están en `main` (re-verificado el 2026-10-04) y la ruta la fijó **ADR-193**; el
diseño sigue en `docs/superpowers/specs/2026-09-16-tablero-del-beneficio-design.md`. La decisión que
esta entrada pedía ya la tomaste: recepción y selección dicen `sin_registro`, no un cero — **ADR-195**.

**Lo que SIGUE abierto, medido el 2026-10-01:**

- **El paso 2, capacidad con migración: sin plan propio** — re-medido el 2026-10-04: hay **47** planes (decía 39) y **ninguno se llama** «capacidad», aunque **5** mencionan «paso 2» y «capacidad» de pasada.
- **El umbral de color de §4.5, decisión tuya:** hoy un lote en «Aviso» deja su etapa en gris.
- **`PENDING_IMPLEMENTATIONS`: quedan 014 y 021 (tuyas) y la 022 (sin empezar).** Fusionadas el
  2026-10-04: 015, 016, 017, 018, 019 y las dos partes de la 010. La 009 **no** estaba hecha: su cierre del
  2026-10-03 tenía las tres comprobaciones ciertas y las tres miran artefactos, no conducta;
  cerrada de verdad en #648. La 022 es nueva: un carril que se pone rojo por basura de otra suite.
- **Lo que §4.5 y la rúbrica 22 §1 dejan abierto**, y es decisión tuya: leer los `ProcessTarget` de
  la receta en vez de la plantilla del perfil; «Daño consumado» contra la literatura que el propio
  documento cita; y que el bloque de riesgo hable en la hora 0 de todo lote sano y **calle en la
  ventana óptima** —antipatrón 8, un solo asunto visto de los dos lados—.
- **Y de §4.5 queda «qué hacer», que no existe en ninguna fuente:** la columna está abierta y vacía
  en `docs/beneficio/10_ph_fermentation.md` §1, con su guardia, y **la rúbrica 22 §1 queda
  incumplida a propósito**. El detalle está en `docs/SESSION_STATE_ARCHIVE.md`,
  en «Los ejes de la curva, y una cita que sólo se hace cuando se sostiene».

**Y una advertencia del paso 1 que no se debe perder:** la base local tenía 0 tanques y 0
instrumentos, así que **la capacidad nunca quedó ejercida con unidades reales** — el bloque
salía «0 de 0». Verde no es lo mismo que probado.

#### Recetas: TRES planes sin construir, y una cifra sin medir (rescatado de #626, medido el 2026-10-05)

La rama `recetas-parte-2a` lleva **tres** diseños —2a la receta con pasos, 2b lo que vigila, y **2c
equipos y capacidades**, que la entrada archivada no nombraba— y ninguno se ha construido; esperan tu
visto bueno. Y sigue sin medir `TRANSACCION_DEL_LINAJE` = `{ timeout: 60_000, maxWait: 10_000 }`, en
**6** archivos de `lib/`, sin contrastar con Neon ni con el máximo de Vercel.

#### Recolectores: darles su perfil (de Daniel)

Movido aquí al archivar la entrada de la jornada de cosecha (PR #431): dar el perfil **Recolector**
(ámbito: la finca) a cada recolector con cuenta, para que anote su entrega en `/mis-entregas`.

#### Kiva Estate: crear sus DOS terrenos (de Daniel)

Movido aquí al archivar la entrada de fincas y parcelas (PR #425): crear los **dos** terrenos de **Kiva
Estate**: el primero desde `/fincas` → «sin terreno», el segundo desde
`/fincas/nueva?organizacion=<id>`.


**Lo que sigue siendo de Daniel:** crear los dos terrenos, y correr `data:kiva-no-es-demo`,
`data:gestores-de-finca` y el `rbac:grant` de Chris Huerbsch. Los cuatro van contra producción y **sólo dos
ensayan**: los dos `data:*` simulan y escriben con `--apply`; **`rbac:grant` NO simula** —sin
argumentos lista, con argumentos concede en el acto—. Medido el 2026-10-05: 0 banderas de ensayo en
`scripts/grant-role.ts` contra 4 en cada uno de los otros dos, y escribe vía `grantRole()`, no con un
`prisma.*.create` que un grep de escrituras vería. Si la descripción «DEMO placeholder» sigue o no en esa fila
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

#### Las pantallas en un móvil: dos decisiones de producto, y lo que sigue sin probarse

Del recorrido del 2026-09-05 (375×812, sesión iniciada). Lo mecánico se arregló y lo cerrado está en
`docs/SESSION_STATE_ARCHIVE.md`; **comprimido el 2026-10-04 porque dos de sus cuatro viñetas decían
ellas mismas que estaban cerradas y archivadas.** Queda, y es decisión tuya:

- **El menú tiene 10 entradas y el objetivo del móvil son 8.** Lo fija
  `tests/navigation.test.ts`, que mide al visor más privilegiado de verdad; un operario ve 4. **Lo que
  motivaba la decisión ya no existe:** eran 234 px de cabecera en tres filas (29 % de la pantalla) el
  2026-09-05, y el #643 la dejó en **61 px en una fila, el 8 %** —medido en vivo a 375 px con sesión
  de operario—. Cuántas entradas caben sigue siendo decisión tuya; el coste que la empujaba, no.
- **`/plots` no ofrece nada que pulsar** — las acciones existen un nivel abajo: **20 formularios**,
  19 de ellos en siete subrutas, y `/plots/[id]` es el tablero con 8 botones que llevan a ellas;
  subir alguna a la lista es decisión de producto.

**Y lo que el recorrido no prueba:** fue un ratón sobre 375 px — ni guantes, ni sol, ni una conexión
que se cae a mitad de un formulario. Sigue faltando que una persona registre un dato real en el campo.
Lo que sí aguantó: cero objetivos de toque por debajo de 44 px en un formulario de 134 campos.

#### Pendientes sueltos, sin sección propia

Una veintena de pendientes distintos colgaba de un encabezado que sólo nombraba
al primero; desde el 2026-09-29 ese primero es un punto más de la lista.

- **Un vocabulario de procedencia por formulario — declarado el 2026-09-08.**
  Los **cinco** subconjuntos viven en `lib/traceability/procedencia.ts` —decía ocho—, tipados
  contra el enum, y el servidor ya no acepta más de lo que la pantalla pinta
  —su entrada está en `docs/SESSION_STATE_ARCHIVE.md`—. **Sigue abierto cuál
  debe ofrecer cada una**: que una medición pueda declararse `interpretation` y
  una calicata no, que `MeasurementSourceType` tenga **siete** valores —decía diez, re-medido el
  2026-10-04— y los **cinco** subconjuntos de `procedencia.ts` ofrezcan menos, y si `manufacturer_specification` debería estar en alguna. Decisión de
  diseño, sin tomar.
- **Queda el acceso de Kenis Abdiel Rodríguez Núñez** (`rodriguezkenis907@gmail.com`,
  perfil `Apiary Colony Event Recorder` sobre los dos apiarios de Finca Rosina: guion
  `data:kenis-apicultor`). Sherry y Chris siguen sin correo. **Antes de pedirle a
  Daniel que corra algo, buscarlo aquí** — y lo ya hecho está en §4, no aquí.
- **Área y rendimiento: bloqueado en el dueño, no en construir nada** (dos viñetas fundidas y
  **re-medidas el 2026-10-04** contra la base compartida; las cifras viejas decían «seis lotes» y
  «0 de 8», y ninguna de las dos era la cuenta). `area_hectares` vive en `core.location`, y **de
  las 38 parcelas, 16 sitios y 6 microparcelas, CERO tienen área**. De 35 eventos de cosecha, **17
  llevan `cherry_weight_kg` y 0 declaran su origen** (`harvest_event_source` está vacía). La
  densidad ya no depende del área —sale del marco— pero el rendimiento por hectárea sí. La cadena
  entera está en pantalla desde el 2026-08-31 y las dos entradas las carga él. **Ninguna de las dos
  caduca en el teclado**, y esta entrada decía lo contrario: no hay ninguna columna que guarde el
  rendimiento —las dos menciones de la palabra en el esquema son comentarios—, así que el kg/ha se
  calcula al mostrarlo y el área sirve igual para una cosecha ya registrada; y `recordHarvestSources`
  recibe el **id de la cosecha**, o sea que atribuir a bloques también se hace después. Lo que sí
  tiene ventana es **pesar por bloque mientras se cosecha**, que es del campo y no del programa:
  **la cosecha llega en febrero**.
- **Las páginas de `app/`: dos pasadas hechas, quedan las demás** — lo que la
  quinta y la sexta revisión (2026-09-05 y 06) encontraron ya está arreglado, y
  su detalle archivado. Sigue abierto que **quedan páginas sin mirar con esas
  lentes**, y cada lente nueva ha encontrado algo que las anteriores no podían ver.
- **Nadie barre las claves de idempotencia de las cuentas que dejan de
  escribir** — es lo único que quedó abierto al cerrar la idempotencia de
  envíos. Un barrido global pediría una tarea periódica y una ruta protegida, y
  este proyecto no tiene la primera —ni cron ni workflow programado—, y la ruta
  protegida ya existe desde el 2026-09-18: decisión aparte. Detalle en
  `docs/SESSION_STATE_ARCHIVE.md`.

- **La pantalla de tueste no la ha abierto nadie en un navegador** — las
  acciones de servidor no las ejerce ninguna prueba —**no por la sesión**, que nueve
  pruebas de otras acciones simulan: nadie la ha escrito— y un worktree no tiene `.env`. Construida el 2026-09-06; detalle en
  `docs/SESSION_STATE_ARCHIVE.md`.

- **Humedad post-secado por proceso o variedad: NO existe, y esto es lo que
  hay.** `moisture` y `water_activity` **sí** son variables medibles, y
  `ProcessRecipe → ProcessRecipeVersion → ProcessTarget` permite fijar `min`/`max`
  para cualquier variable en un `moment`, con `compareRunToTargets` ya pintándolo
  en la página del lote. Lo que falta: la receta se identifica **sólo por nombre**
  dentro de una organización —no lleva método de proceso ni variedad—, el **lote
  no lleva variedad** (vive como valor de catálogo en el origen de la cosecha,
  `cultivarValueId`), y **ni la receta ni el lote llevan método de proceso** —sí lo
  lleva `LotProcess.processGradeValueId`, obligatorio contra el catálogo
  `grado_proceso` desde el 2026-09-08—. **Y ya NO es cierto que nada condicione el
  paso a almacén:** `exigeSecadoTerminado` lo bloquea por encima del objetivo de
  humedad (#228), aunque sólo cuando el lote o el ancestro que lo cubre tiene un
  proceso. Es el hueco que el audit llama `OperatingStandard` (Fase 3, parcial).
  **De Daniel sigue siendo el modelo:** método y variedad en la receta, variedad en
  el lote.


- **Clasificar por malla sobre muestra: decidido y sin construir (ADR-190, ADR-191)** —
  Daniel decidió el 2026-09-29 que son **dos operaciones** —medición sobre unos cientos de
  gramos, y el corte físico al procesar— y cómo se nombran: **`SampleKind.SCREEN`** y una
  tabla **`GreenScreenFraction`** que espeja las cuatro columnas `greenScreen*` de `Lot`.
  **No hace falta ninguna variable de medición**: una fila de `Measurement` no tiene dónde
  ir el rango. Falta construirlo —tabla, migración, y el servicio que escribe esas filas—
  y decidir si las tres lecturas deben distinguir en pantalla una fracción medida sobre
  muestra de una salida de un corte real. El corte de hoy no se toca.

- **Dónde se rompe «tarea de finca → puntaje de taza», medido.** Fumigar y
  sembrar se registran como *hechos* (`LabourEntry`, `MaterialConsumptionEntry`,
  `PlantingCohort`) y sólo son *comparables* como `TreatmentBatch`, que **exige**
  protocolo de investigación. Lote→muestra→cata está entero, y el tueste ya es
  variable desde la entrada de abajo. **Falta el reporte:** `VariableComparison`
  compara tratamientos, no puntajes entre lotes. Sí existe `/reports/proceso` (#236),
  proceso→tueste→puntaje: lo que falta atar son las faenas de FINCA. La Fase 6 está
  **empezada y sin cerrar**, no sin empezar.

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
- **Y la `005` ya tiene mecanismo para «el guardia debido»** (mismo PR): se declara
  por dominio qué permiso gobierna qué modelo y una compuerta lo exige. Del dominio
  del **lote**: 15 modelos gobernados y **13 excepciones** declaradas con su razón.
  **Los dos defectos están arreglados** (2026-10-04, cada uno con su prueba en rojo
  primero y su control positivo, en el grupo `base-sembrada`):
  `completeExternalCoffeeOrigin` exige ahora `lot:view` sobre el lote que cita, y
  `recordWashMedium` exige mismo proyecto —su actor, `Research Lead`, **no tiene**
  permiso de `lot`, y exigírselo habría roto `mosto_de_otro_lote` y forzado una
  concesión de RBAC que es tuya—.
  **El `action` también está medido** y no hay defecto vivo: de 23 unidades que
  escriben un modelo del dominio, **0 exigen sólo `view`**, y las 28 raíces exigen
  todas una acción de escritura; el flip lo confirma mutando una línea. Si se
  convierte en compuerta tiene que resolver **valores por omisión de parámetro** o
  nace con un falso positivo —`bajarBandejaAction`, que autoriza bien—.
  **Queda tuyo:** los **12 veredictos** sin confirmar, si se construye esa compuerta
  del `action`, y los otros dominios (`location` 34, `equipment` 20, `specimen` 7,
  `sample` 4 llamadas a `can`), que son un bloque más en el mismo archivo.

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
| Pedirle a Daniel que corra `sensory:create-protocol` | El protocolo de cata **ya está en producción**, v1 y v2, confirmado por él el 2026-09-18. Sin constar: si se cargó `protocolos/miel-competencia-100.json` (#213) |
| Pedirle la v2 del protocolo sensorial, o `apiary:load-protocol` v1 | **Ya los corrió** (2026-09-18 y 2026-09-16, `apiario-campo-v1`), confirmados por él. No se verificó contra la base y no se puede: leer producción está prohibido, es su palabra |
| Dar de alta a Bob Huerbsch | **Ya entró**, lo dijo Daniel el 2026-09-17. Queda Kenis, que sigue en §3 |
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
