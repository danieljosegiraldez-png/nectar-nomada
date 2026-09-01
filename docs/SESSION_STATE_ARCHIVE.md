# Archivo de estado — Néctar Nómada OS

Lo que se sacó de `SESSION_STATE.md` para que siguiera cabiendo en una lectura.
**Lo más viejo primero.** Nada de aquí se carga en una sesión; es registro, no
control. Si algo de aquí todavía dirige el trabajo, no pertenece a este archivo.

El registro largo de decisiones vive en `docs/architecture/DECISIONS.md`
(ADR-001 … ADR-103). Este archivo es solo el desbordamiento del estado.

**Archivados: 2026-08-31 (dos veces)**, con el estado en 315/400 líneas. Se movieron
las cinco entradas más viejas, todas del 2026-08-28, elegidas porque su
contenido ya vive en un sitio que sí se carga: las trampas de `CLAUDE.md`, los
`PENDING_IMPLEMENTATIONS/`, o el propio código. Nada que siguiera dirigiendo el
trabajo salió de `SESSION_STATE.md`.

Comprobado al moverlas: de las 75 líneas quitadas del estado, **cero** con
contenido faltaban en este archivo.

**Cuarto archivado, 2026-09-01**, con el estado en 357/400 líneas (89 %). La
entrada de la primera revisión independiente. Su lección central —flip-test a
todo guardia— vive en los dos `CLAUDE.md`, que sí se cargan; la operativa, que
el paquete de revisión se comprime **acotando el rango** y no el contenido, se
movió a `docs/CODEX_REVIEW.md` antes de archivar, porque sólo vivía aquí.

**Tercer archivado, 2026-09-01**, con el estado en 332/400 líneas (83 %). Dos
entradas: la del rendimiento por hectárea: su contenido vive en el código
(`computePlotYield`) y en sus pruebas, que sí se cargan; y la de la visita al
apiario, cuyo párrafo final **sí seguía dirigiendo trabajo** — la medición de que
una propuesta con presupuesto no cabe en el esquema se movió a §3 antes de
archivar el resto, en vez de irse con ella. Se archiva al añadir la entrada del
día en vez de al chocar con el techo, que es lo que el propio guardia pide.

**Segundo archivado, el mismo día**, con el estado de vuelta en 347/400 líneas
apenas unas horas después del primero. Tres entradas más — 55 líneas, cero
perdidas. Lo que enseña el ritmo: con varias sesiones escribiendo, el estado
crece del orden de **cien líneas al día**, así que archivar es rutina diaria y
no una limpieza ocasional. El criterio no cambia: sale lo más viejo cuyo
contenido ya viva en un sitio que se carga.

### 2026-08-28 · Selección de cereza, de operación a pantalla usable

PR #58 `0aa7544` (dominio), #59 `43f97d4` (pantalla), #62 `18c6c26` (paso
sugerido). ADR-103 y ADR-105. Antes: versiones de receta (PR #56).

`selection` entra en `CONSERVING_TYPES`: aceptado + rechazos + merma declarada
debe cuadrar contra la entrada, y es la primera transformación donde un
descuadre significa que alguien pesó mal y no un rendimiento. El rechazo es un
`Lot` de verdad con `rejectionCategoryValueId`; su `lotType` sigue siendo
físico, porque un flotador sigue siendo cereza. La pantalla lleva balance en
vivo — el único momento en que un operario puede actuar sobre un descuadre es
antes de enviar, con el café delante.

Tres huecos que solo aparecieron al usarlo, cerrados en #59/#62: faltaba
`transformationType_selection` en los catálogos (la línea de tiempo salía rota
para cualquier lote con selección), `getSelectionOutturn` no se mostraba en
ninguna parte, y la cereza sin seleccionar seguía sugiriendo fermentación.

**Nadie ha registrado todavía una selección real.** El vocabulario de rechazo y
la afirmación de ADR-105 —que en el beneficio la selección precede a la
fermentación— siguen sin contrastar contra un tanque de flotación.

---

### 2026-08-28 · El dominio de marca deja de servir este OS — resuelto

Durante el día `https://www.nectarnomada.com` respondía con esta aplicación
(confirmado por el hash idéntico del chunk de CSS y por `/login`, `/signup` y
`/discover` en 200). El dominio se reasignó al proyecto del sitio público esa
misma noche: ahora `/login` y `/discover` dan 404 ahí.

**La prueba de P-B se cerró sola** cuando el mundo cambió, sin editar nada.
Este OS sigue accesible en `https://nectar-nomada-package.vercel.app`, y sus
ocho rutas privilegiadas siguen exigiendo sesión — verificado tras la fusión.

### 2026-08-28 · Andamiaje de sesión

`SESSION_STATE.md`, `PENDING_IMPLEMENTATIONS/`, `docs/plans/`, `docs/specs/`,
`tools/browser-checks/`, `tools/pack-for-review.sh`, `docs/CODEX_REVIEW.md`,
`npm run check:state` (con test propio) y `scripts/open-decisions.sh`.
`CLAUDE.md` **no se reescribió**: se le añadió el puntero al principio y las
secciones nuevas al final, por instrucción de Daniel.

Verificado contra el despliegue vivo: las ocho rutas privilegiadas
(`/admin/users`, `/lots`, `/plots`, `/recipes`, `/research`, `/sensory`,
`/partner`, `/apiaries`) redirigen a `/login` para un visitante anónimo.

### 2026-08-28 · Revisión independiente de la PR #60, y lo que cambió

Codex revisó el cambio en una sesión nueva, con sandbox de solo lectura y un
paquete armado mecánicamente. Ocho hallazgos; **seis se arreglaron, uno se
aceptó con matiz y uno se rechazó con razón declarada**:

- **Arreglado —** cualquier código de salida distinto de 0/2 contaba como
  «cerrada»: una errata cerraba una decisión de Daniel. Ahora solo el `1` cierra.
- **Arreglado —** P-C, P-D y P-A podían cerrarse con una mención en prosa o un
  comentario. Ahora exigen un encabezado `## ADR-NNN` o una invocación real.
- **Arreglado —** P-B daba «cerrada» ante un 404 con cuerpo. Ahora exige 200.
- **Arreglado —** P-E se cerraba con `NN_BACKUP_DIR=""`. Ahora exige valor.
- **Arreglado —** el test del presupuesto pasaba igual con el guardia
  neutralizado. Cinco fixtures negativos; comprobado que caen los 6.
- **Arreglado —** `caracteres / 3` no es una cota. Techo duro de bytes añadido,
  que atrapa prosa acentuada que la estimación no veía.
- **Arreglado —** el consejo de archivar nombraba una sección aunque hicieran
  falta tres, y una sección sin terminar se tragaba el resto del archivo.
- **Arreglado —** `pack-for-review.sh` partía rutas con espacios y no
  comprobaba que todos los archivos tocados estuvieran en el paquete.
- **Aceptado con matiz —** «byte a byte» era una afirmación, no una
  comprobación: ahora hay `scripts/check-claude-md-intact.mjs`, reproducible.
- **Rechazado —** meter `npm run decisiones` dentro de `npm run verify`. Dos
  pruebas salen a la red y una compuerta que se pone roja por una wifi mala
  enseña a ignorar una línea roja. En su lugar, `OD_SIN_RED=1` y un test que
  comprueba sin red que cada decisión declarada recibe veredicto y que ninguna
  prueba está rota. **Coste si me equivoco:** el mecanismo podría pudrirse por
  una vía que ese test no cubre — que una prueba sea *válida pero equivocada*.

Corregido además: decía «las siete rutas privilegiadas» sobre una lista de ocho.

### 2026-08-28 · Control de higiene del router (PENDING 005 sigue abierto)

Las 50 entradas del router se **declaran** en `scripts/rutas-declaradas.mjs`
con su clase y su razón; `npm run check:rutas`, dentro de `verify`, falla si
aparece una sin declarar, si el manifiesto nombra una que ya no existe, o si el
código contradice lo declarado. `respuesta-anonima.mjs` contrasta 26 rutas
estáticas contra el despliegue: 26 coinciden, 0 contradicen.

**La revisión del plan (compuerta 2) impidió construir lo que estaba escrito.**
Nueve hallazgos, ocho aceptados: clasificar por grep mide «presencia de una
señal», no «página gateada»; el flip-test que propuse era circular; el nombre
`rutas-protegidas` y un ✓ verde se leen como garantía de seguridad pase lo que
pase. El alcance se redujo y las palabras cambiaron.

**Sigue sin probarse** que los datos estén protegidos: la frontera es el
servicio de RBAC (`SECURITY.md` §2), no la ruta. Por eso 005 sigue abierto, con
sus límites escritos.

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

## 2026-08-31

### 2026-08-31 · El detector de acceso leía texto, y dos revisiones lo demostraron

`origin/main` = `866339f`. Compuerta `scripts/ci.sh` = 0, 69 pruebas.

**Lo que empezó esto:** el documento decía 195 operaciones y el script 194. Una
sola discrepancia, perseguida, destapó cuatro defectos de la misma familia.

**Lo que quedó arreglado en `scripts/inventario-de-acceso.mjs`:**

| Defecto | Efecto |
|---|---|
| `findUniqueOrThrow` fuera de la enumeración de métodos (13 archivos) | descarte silencioso |
| `(tx ?? prisma).auditEvent` — cliente entre paréntesis | `lib/audit.ts` entero invisible |
| Consulta delegada a un ayudante **no exportado** | descarte silencioso |
| `export default async function` sin reconocer | **identidad falsa**: 3 consultas de `MyNectarPage()` bajo el nombre `dynamic` |

Los tres primeros dejaban huecos. El cuarto no dejaba hueco: dejaba una fila con
nombre equivocado que **cuadra en todos los recuentos**. Es el modo de fallo que
contar no detecta.

**208 operaciones** sobre 53 archivos, ninguna sin explicar. Las 19 que dependen
del llamador están **fijadas** con razón y fecha: antes se verificaron a mano una
vez y nada detectaba que el conjunto cambiara. Las excepciones escritas a mano
pasaron de tres a **una**, porque el detector ahora demuestra por estructura lo
que antes afirmaba una nota.

**Dos consecuencias, cerradas después.** El aviso del presupuesto nombraba la
entrada recién escrita como «la más vieja»: las secciones se ordenan por fecha,
las de un mismo día empatan, y con el empate decidía el orden del documento —que
va de más nuevo a más viejo—. Arreglado con desempate por posición, con prueba
de regresión, y portado al repositorio web para que las dos copias no diverjan.

Y las cifras de `docs/arquitectura/inventario-de-acceso.md` ya no pueden
separarse de la medición: `tests/arquitectura/cifras-del-inventario.test.ts`
compara total, archivos y cada fila contra la salida del script, y falla si
aparece una clase que el documento no nombre. Era el mecanismo que faltaba: ese
día se arreglaron las cifras y no lo que las dejó divergir.

Y una tercera: **una fusión limpia duplicó una sección archivada**. Dos sesiones
archivaron la misma el mismo día, en posiciones distintas del archivo histórico;
git no vio solape y quedó dos veces. `SESSION_STATE.md` sí dio conflicto y por
eso se miró — el archivo histórico no dio ninguno. Lo comprueban ahora
`tests/archivo-de-estado.test.ts` y su gemelo en el repositorio web: ninguna
sección repetida, ninguna en los dos sitios a la vez, y todas con el formato que
el archivador necesita para no partir una entrada por la mitad.

**Lo que sigue abierto, con su mutación escrita:** un nombre con forma de
guardia basta. `requireFakeAccess()` que no hace nada sale como guardia directo
y la compuerta pasa. Cerrarlo exige resolver el símbolo — es
`PENDING_IMPLEMENTATIONS/007`, aplazado a propósito.

**El paquete de revisión mentía.** `git diff A..B` compara los dos extremos, así
que presentó al revisor 85 líneas que otra sesión había añadido en `main` (#98,
un arreglo de autorización) como **bajas mías**, en una revisión sobre
autorización. Su recomendación habría borrado trabajo ajeno real. `git log A..B`
sí era correcto, así que la lista de commits se veía bien mientras el diffstat
mentía: la única señal fue contar archivos, cinco contra ocho. Arreglado con la
forma de tres puntos, y ahora el paquete avisa si la rama está por detrás.

**Dos rondas de revisión independiente, seis hallazgos reales, ninguno lo había
visto la suite en verde.** El tercero de la primera ronda fue un fantasma del
paquete roto, y se rechazó.

### 2026-08-31 · La segunda revisión encontró que la hora estaba mal en producción

Se revisó la interfaz —seis pantallas, ~1.400 líneas que la primera revisión no
cubrió— prediciendo que rendiría **menos**. Rindió más: diez hallazgos, cuatro
altos, y el peor fallo del día.

**Un `datetime-local` entrega un reloj de pared sin zona.** Pasarlo a
`new Date()` lo interpreta en la zona **del servidor**, que en producción es
UTC: un operador en Panamá que escribía las 07:30 quedaba registrado a las
**02:30**. Nueve sitios en tres módulos, **dos anteriores a esta sesión** —
cosecha y recepción, los que más filas reales tienen.

**Era invisible en desarrollo**, porque navegador y servidor comparten zona y el
error se cancela. Se había mirado ese síntoma exacto horas antes —«escribí 07:30
y la pantalla dice 12:30»— y se había diagnosticado como una convención de
mostrar en UTC. Ahora el dispositivo manda su desfase y, si falta, **se falla en
vez de suponer**. Para verificar esto hay que levantar el dev server con
`TZ=UTC`; con la zona local no se ve nada.

Los otros: aportes de cosecha **descartados en silencio desde la fila 21** (el
formulario deja añadir filas sin límite y la acción recorría 0..19 — la
selección tenía el mismo tope, y ahí el balance de masa habría culpado al
operador); un valor ausente que se volvía **una medición de cero** en dos
acciones; la precisión de fecha que **descartaba lo que el usuario acababa de
escribir**; `plantCount ?? 0` mostrando «0 plantas» por un conteo nulo; y 39
mensajes de error sin `role="alert"` en 36 archivos — **seis ya lo tenían**, así
que la convención existía y estos formularios no la siguieron.

**Dos hallazgos NO se implementaron** porque chocaban con decisiones ya tomadas
que el revisor no podía ver: el ámbito RBAC sobre `operatorPersonId` (§4) y el
`null` de `nextActionFor` para miel. Un hallazgo es una afirmación; la diferencia
entre «esto falta» y «esto se decidió que no estuviera» sólo la da ir a leer.

PR #97, #98 y #99. Suite 717/717.

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
