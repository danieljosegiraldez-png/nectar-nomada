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

**Quinto archivado, 2026-09-01**, con el estado en 90 % y las cuatro revisiones
del día ya recogidas. Sale la entrada del script de cierre: lo que dirige el
trabajo vive en sitios que sí se cargan — el script existe y §5 lo invoca por
nombre, y el guardia de la fusión que duplicó una sección archivada es
`tests/archivo-de-estado.test.ts`, que corre en la suite. Comprobado antes de
mover, no después.

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

### 2026-09-01 · Lo mecánico del cierre deja de re-teclearse

`scripts/cierre-de-sesion.sh`. §5 describía el cierre en prosa; esa prosa se
re-tecleó seis veces el 2026-08-31 y **una salió mal**: la comprobación de
sincronía trataba cualquier archivo sucio —incluido uno **sin seguimiento** de
otra sesión— como razón para no sincronizar. El checkout se quedó detrás de un
merge propio y el informe dio 11 pruebas donde había 14. La propiedad es
«¿chocaría el pull?», no «¿hay algo sucio?».

Comprueba sincronía con `origin/main` en las tres direcciones, cambios con
seguimiento sin commitear, worktrees ajenos con trabajo sin empujar, presupuesto
del estado, pruebas de decisión rotas, disco libre contra lo que cuesta un
`npm ci`, y la compuerta. **No commitea, no empuja, no borra**, y los worktrees
ajenos los informa sin tocarlos. Termina nombrando lo que ningún script puede
hacer —estado al día, lección escrita donde se cargue, verificado contra
asumido— en vez de fingir que el cierre ha terminado.

Dos de sus ramas se dispararon solas mientras se escribía: «detrás de
origin/main», porque otra sesión empujó, y «commits sin empujar», sobre su
propio commit. Son la mejor prueba del cambio porque no las construí yo.

También de esta sesión: **una fusión limpia duplicó una sección archivada** —dos
sesiones archivaron la misma, en posiciones distintas, git no vio solape—. Lo
comprueban ahora `tests/archivo-de-estado.test.ts` y su gemelo en el repositorio
web. `SESSION_STATE.md` sí dio conflicto y por eso se miró; el archivo histórico
no dio ninguno. Una fusión limpia no dice que el resultado sea correcto.

## 2026-09-01

### 2026-09-01 · El plan S1, y la revisión que desmontó su pieza central

`origin/main` = `84a51de`. Nueve PR de código —#103 (plan), #105 (`aspect`),
#108 (biochar), #110 (sujeto no-café), #111 (calicata), #115 (muestras), #117
(fotos), #122 (enmienda), #125, #127, #128 y #130 (los arreglos de las cuatro
revisiones)— más cinco de estado. Suite 731 → **865**.

Daniel aportó *«Las Nubes Cerro Azul — Soil, Environment and Cup Quality:
Research Framework v1.0»* (13.345 palabras, firmado por Bob, Sherry y Daniel).
`docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md` traduce su Tabla 15 al
esquema. **No es un resumen del marco; el marco manda.** De sus catorce
entidades, ocho ya tenían dónde vivir; **de las seis que faltaban, cinco se
construyeron** y sólo el microclima sigue abierto, por una decisión.

**§0 manda sobre todo: la recomendación principal del marco es un ALTO.** Ningún
bloque nuevo recibe biochar hasta que existan la química base, la física base,
un lote caracterizado y el protocolo escrito — firmado como Gate 0. Lo que eso
implica para el software es una sola cosa: la primera fila que el sistema
escriba sobre un bloque tiene que poder ser **la línea base, no la enmienda**.

**El orden de construcción es el del Plan de Acción del marco**: se construye en
el orden en que el dato aparece, no en el que el modelo se lee.

| pieza | qué la define |
|---|---|
| `Location.aspect` | Enum, rompiendo con el precedente de texto libre: la rosa de los vientos no se inventa |
| `BiocharBatch` | Dosis, frecuencia y parcela **no** están: un lote se aplica en varios bloques |
| `Measurement` no-café | Autorización **por rama** y sujeto **exclusivo**: dos permisos no se acumulan sin que el más laxo abra lo del otro |
| `SoilProfile` | **Tres estados, no un booleano**: «no se miró» ≠ «no había», y confundirlos manda a fertilizar un problema de aire |
| `SoilSample` / `FoliarSample` | Un análisis foliar sin protocolo es **incomparable**, peor que no tenerlo porque parece que sirve |
| Fotos de Location | El padre debe pertenecer a la Location autorizada, o quien tiene A cuelga en B |
| Aplicación de enmienda | Gate 0: se niega mientras falte cualquiera de las cuatro, y dice cuáles |

---

**Y entonces cuatro revisiones independientes desmontaron buena parte de eso.**

Se revisó por partes, porque un paquete de un día entero son 8.255 líneas y ése
es el tamaño que ya colgó una revisión: **servicios** (`lib/`), **tests**,
**migraciones** y **acciones de servidor**. Quedan sin revisar las páginas.

| pasada | halla | reales | rechazados |
|---|---|---|---|
| servicios | 7 | 6 | 1 |
| tests | 5 | 5 | 0 |
| migraciones | 8 | 4 | 2 (+2 imposibles) |
| acciones | 5 | 5 | 0 |

**Un solo patrón las une, y es sobre cómo escribo.** Llamé «estructural» a lo que
sólo comprobaba el servicio — tres veces:

- «**Gate 0 hecho estructura**» sobre una compuerta que miraba *que existiera una
  fila*: un Brix colgado de una muestra de suelo abría «química base», y no había
  comprobación temporal, así que una lectura fechada **después** del tratamiento
  servía de línea base.
- «cada sujeto nuevo **excluye** `lot_id`» en el SQL, cuando
  `traceability.measurement` **no tenía ni un solo CHECK**.
- «la regla es estructural aquí» sobre el compuesto de una muestra de suelo.

Lo demás, en una línea cada uno: `requireResearchAccess` **retorna al primer
target que pasa** —autorización alternativa, no coherencia— y el `locationId`
aquí lo elige el usuario; `createBiocharBatch` aceptaba la organización del
llamador; `applyAmendment` no validaba catálogos ni enums; el audit se escribía
fuera de la transacción; las acciones de corrección **borraban lo que el POST no
mencionaba**; cuatro fechas obligatorias se inventaban como «ahora»;
`2026-02-31` se convertía en el 3 de marzo en silencio.

**Y cuatro tests llamados «en la misma transacción» no podían fallar**:
comprobaban que el audit existiera *después de que todo salió bien*. Con el `tx`
quitado, la suite de `soilProfiles` pasaba 20/20. Ahora hay un guardia de fuente
—`tests/arquitectura/audit-atomico.test.ts`— que lee los siete servicios.

**Lo rechazado, con su razón escrita:** `creatorPersonId` del llamador (§4 ya lo
guarda: el fotógrafo suele no tener cuenta) y hacer `NOT NULL` los campos de
protocolo — prohibir la fila **perdería el dato en vez de señalarlo**, y la ficha
ya dice cuáles faltan.

**Lo que no se puede hacer como se propuso:** atar por FK compuesta la
organización de un lote a la de su Location. `location.organization_id` es
nullable porque una parcela hereda el dueño de su finca, y una FK compuesta con
columna nula pasa por `MATCH SIMPLE`. Queda **escrito en la migración**.

**Cuatro guardias del repositorio pararon trabajo, y los cuatro tenían razón.**
El que más: `navigation.test.ts` exige ≤8 entradas de menú y yo había añadido una
novena. Se revirtió.

**Y ocho veces en el día un guardia o una sonda míos resultaron falsos.** Un test que comparaba
una unión contra sí misma; un valor por defecto que lo volvía infalsificable y
además metía variables de laboratorio en el desplegable de recetas; y **cuatro
flip-tests que pasaron por la razón equivocada** — uno porque la mutación cayó
donde nada la miraba, uno porque ni siquiera se aplicó, dos porque el test que
yo creía que lo cubría probaba otra cosa.

Dos más al final, comprobando las restricciones nuevas contra la base: la sonda
salió **vacía** porque las subconsultas devolvían `NULL` con la base de test
limpia, y una llegó a insertar una fila sin sujetos. Se leía igual que un verde.

Las reglas que quedan, y son tres:

1. **Un flip-test no vale hasta ver caer al test que se cree que lo cubre** —
   mirar *cuál* cae, no sólo que caiga alguno.
2. **Antes de creer que una mutación probó algo, comprobar que se aplicó**
   (`diffstat`).
3. **Una sonda contra la base necesita control positivo**: si la fila que debía
   ser rechazada no llegó a construirse, «no entró» no prueba nada.

`tools/pack-for-review.sh` gana filtro de rutas: su cabecera prometía «se
comprime por selección» y no ofrecía ninguna. 8.255 líneas → 1.713.

**Lo que la revisión NO pudo mirar:** migraciones, esquema, acciones, pantallas
y **todos los tests**. Dos preguntas suyas siguen abiertas — si
`createTreatmentBatch` puede crear un tratamiento de terreno saltándose Gate 0,
y si los tests discriminan de verdad.

**Sin comprobar:** el esquema vivo consultado contra la base. El `DATABASE_URL`
de producción sólo vive en la config de Vercel y no se descargó. Falta abrir
`/plots/<lote>` en producción y ver que renderiza.

---

### 2026-09-01 · El plan S1 y cuatro revisiones — el detalle está archivado

`origin/main` = `0612df1`. Suite 731 → **865**. Diecisiete PR: nueve de
construcción, cuatro de arreglos de revisión, cuatro de estado.

**De las seis entidades que le faltaban a la Tabla 15 del marco de
investigación, cinco se construyeron.** Sólo queda el microclima, y sólo por una
decisión de Daniel (§3). Más `Location.aspect`, el sujeto no-café de
`Measurement` y las fotografías con ámbito de Location, que no eran entidades
pero desbloqueaban el resto.

**Cuatro revisiones independientes** —servicios, tests, migraciones y acciones—
encontraron **25 cosas**: 21 arregladas, 3 rechazadas con la razón escrita y 2
imposibles como se propusieron, también escrito. Las páginas de `app/` siguen sin
revisar (§3).

**El detalle vive en `docs/SESSION_STATE_ARCHIVE.md`**, donde otra sesión lo
archivó el mismo día. Esta entrada existe porque §2 se quedó **vacía**: un
archivo que promete «lo que se entregó» y no entrega nada desorienta más que una
línea de más. **Las lecciones no se quedaron ahí:** las tres reglas de
flip-tests y el patrón de llamar «estructural» a lo que sólo comprueba el
servicio están en `CLAUDE.md`, que sí se carga — el archivo histórico dice de sí
mismo que lo que todavía dirige el trabajo no le pertenece.

---

### 2026-09-04 · La Fase 2 del Field OS, cerrada por lo que NO se construyó

`43_P2_OPERATOR_CORE.md` §0 exigía contestar «¿por qué no se ha creado nunca
ninguna tarea?» antes de extender `partner.Task`. Re-medido contra producción
con control positivo (17 personas, 3 proyectos, 40 assignments): `partner.task`
**0**, `field_submission` **0**, y —lo nuevo— `field_session` **0** y
`field_event` **0**. La mitad de la Fase 2 que sí se construyó hace una semana
tampoco tiene una sola fila. Daniel contestó: nunca se asignó trabajo por la
plataforma. Es la rama que §0 nombra, y su instrucción es aplazar §1–§2 por
especulativos. **ADR-107.**

Entregado: §6 (GPS en `core.asset` — `latitude`/`longitude`/`accuracy_m`, que
`locationId` no puede expresar porque una ladera no es una `Location`) y el
resto de §5 (`clock_offset_ms` en las seis tablas que ya llevan `recorded_at`,
`synced_at` y columna de dispositivo). Nueve columnas, todas anulables, cero
backfill. Verificado con `migrate diff` vacío **y su flip-test**: quitando una
columna el diff la nombra.

**Dos cosas que encontré de paso y no son mías:**

- **La suite de `main` estaba roja y CI verde.** Dos secciones de §3 usaban
  `###` sin fecha y `tests/archivo-de-estado.test.ts` las rechaza — con razón:
  un `###` no fechado trunca a su padre al archivar. Bajadas a `####` aquí.
  **CI no lo vio porque ese test no está en la lista enumerada a mano de
  `scripts/ci.sh`**, que es exactamente `PENDING_IMPLEMENTATIONS/008` pasando
  de verdad en lugar de en teoría.
- **`COFFEE_FIELD_OS_AUDIT.md` afirmaba cosas falsas.** Su §59 decía «no se
  implementó nada» y su tabla de validación daba 531 tests; hoy son cuatro
  fases construidas y 940. Corregido con un bloque de estado fechado, porque
  esa página es lo primero que lee quien retoma el Field OS.

---

### 2026-09-04 · El diff invertido volvió, disfrazado de trabajo ajeno

Encontrado en el checkout compartido al ponerlo al día. `git status` daba dos
archivos **`M `** —modificados y escenificados—, 31 borrados y cero altas: la
medición del 14 % de `PENDING_IMPLEMENTATIONS/006` y la cabecera de identidad
de repositorio de `scripts/cierre-de-sesion.sh`.

**Nadie borró nada.** Esos bloques *entraron* en `main` el 2026-09-02
(`c768f97` 01:22, `a7a8f65` 01:47) y el árbol es anterior (`mtime` 2026-08-31
y 2026-09-02 00:58); el reflog enseña `branch: Reset to origin/main` a las
01:43 y 01:59. El puntero avanzó sin tocar el árbol y git reportó al revés lo
que había llegado — la sección «Adelantar el puntero de una rama no mueve el
árbol» de `CLAUDE.md`, repitiéndose dos días después de escribirse.

**Lo único nuevo, y lo que hay que recordar: la firma se lee como trabajo en
curso de otra sesión.** `M ` significa escenificado, así que la lectura amable
—«es de alguien, no lo toco»— es la equivocada, y es la que lo mantuvo dos
días armado; estuve a punto de dejarlo por respeto. Lo deshace fechar: si los
archivos del árbol son **anteriores** a los commits que traen esas líneas,
nadie borró, llegó.

Importaba porque entre lo «borrado» estaba la cabecera que dice de qué
repositorio habla el informe de cierre —puesta tras correr el cierre del repo
equivocado dos veces—: cualquier commit ahí la habría revertido en silencio.

Resuelto con `git restore --staged --worktree` y verificado **por presencia**
(`grep -c` = 1 y 1). Barridos los nueve worktrees de los dos repositorios:
**ninguno más**, y lo dice un detector con flip-test —`git diff --shortstat
HEAD` no vacío sobre un árbol rezagado de su puntero, reproducido en un repo
de juguete—, no un verde sin control. Los dos checkouts compartidos quedan en
`main` con el árbol coincidiendo con su `HEAD`.

---

### 2026-09-04 · Fase 4: el ticket y su primera rebanada, construida

`46_P4_API_Y_SINCRONIZACION.md` (el ticket precede al código, como 41–44) y
después la rebanada que nombra: **`Device`, `clientDraftId` en `FieldEvent`,
push por lotes con resultado por mutación, y la PWA encolando sin señal.**
`/api/v1/devices` y `/api/v1/sync/field-events`, ambas declaradas en el
manifiesto de rutas.

**Once tests, y dos flip-tests que enseñaron algo:** hay DOS guardias de
idempotencia —el pre-chequeo del push y el del servicio— y los primeros seis
tests sólo ejercían el primero. Se vio quitando el del servicio y viendo que
nada fallaba. Ahora cada guardia tiene un test que se cae si lo borras.

**Tres desviaciones del ticket, en ADR-108 con su razón:** sin carril de tokens
(§2 no tendría llamador hasta la Fase 5 — ADR-107 aplicado a otra pieza), sin
`organizationId` en `Device` (`ScopeType` no tiene `organization`, así que nada
lo leería), y sin refactorizar la cola de apiario (su protocolo es de una en
una; el de P4 es por lotes — la deuda queda escrita en la cabecera del módulo
nuevo).

**Falta la aceptación de campo**, que es de flujo y no de test: un evento
anotado en modo avión, sincronizado al volver la señal. El código está; nadie
lo ha recorrido en un navegador de verdad.


---

### 2026-09-05 · Tres bloques que §3 llamaba «bloqueado» y ya no lo estaban

Archivados con el estado en **391/400 líneas — el 98 % del presupuesto**, que es
la cifra que obligó a mirar. La sorpresa fue dónde estaba la presión: §2 «lo que
se entregó» eran cuatro entradas y 104 líneas, todas del mismo día; **§3
«Bloqueado» ocupaba 206**, más de la mitad del archivo, y tres de sus bloques
describían cosas ya resueltas.

- **El rojo de `main` es cuota** — dejó de dirigir trabajo cuando la cuota se
  levantó. Antes de moverlo aquí, sus dos piezas vivas se llevaron a
  `CLAUDE.md`, que sí se carga: el discriminante de la URL del check y que una
  cuota **no crea fila que redesplegar**. Ninguna de las dos estaba en ningún
  `CLAUDE.md` — comprobado con `grep`, cero apariciones — así que archivar sin
  moverlas las habría perdido. La regla de la duración sí estaba ya.
- **Aviso fiable de que un backup no corrió** — decía «desbloqueado» dentro de
  la sección llamada «Bloqueado». P-A se cerró el 2026-09-04.
- **DOS migraciones sin desplegar** — falsa desde el 2026-09-05 06:34. El log de
  producción dice `No pending migrations to apply.`, comprobado por la vía que la
  propia entrada exigía. Una instrucción vieja es peor que ninguna, y ésta
  mandaba hacer un *Redeploy* que ya no hacía falta.

Resultado: 391 → 316 líneas, del 98 % al 79 %.

#### El rojo de `main` es cuota, no código — y se queda rojo para siempre

**Comprobado el 2026-09-03. Si lees `main` en rojo, empieza por aquí antes de
tocar nada.**

`3858cde` y los cinco commits anteriores tienen el check de Vercel en `failure`
con «Deployment rate limited — retry in 24 hours». **No es un build roto: es el
tope diario del plan gratuito, que diez PR con sus previews agotaron.** Ese rojo
no se va a arreglar solo ni con el cambio de plan: es un estado histórico de un
commit que Vercel rechazó sin llegar a construir.

**Cómo distinguir cuota de build roto, en orden de fiabilidad:**

1. **La URL del check.** Una cuota apunta a la página de venta
   (`?upgradeToPro=build-rate-limit`); un build real apunta al despliegue
   (`/nectar-nomada-package/<id>`). Es el discriminante limpio:

   ```bash
   gh api repos/danieljosegiraldez-png/nectar-nomada/commits/<sha>/status \
     --jq '.statuses[] | select(.context=="Vercel") | .state + " -> " + .target_url'
   ```

2. **No hay fila en el panel.** Una cuota no crea despliegue, así que **no hay
   nada que redesplegar** — buscar el botón *Redeploy* de ese commit es buscar
   algo que no existe. Sólo un push nuevo despliega.
3. **La duración**, ya en `CLAUDE.md`: 18-20 s es un build que corrió y falló;
   33-59 s uno bueno. Sirve cuando sí hay fila.

**Daniel subió a PRO el 2026-09-02.** Verificado que funciona: un preview
construyó en 35 s después del cambio. Lo que el PRO **no** hace es volver atrás
a construir lo ya rechazado.

**Qué hay sin desplegar, medido y no estimado:** seis commits, y tocan sólo
documentación y herramientas — **ni código de la app, ni esquema, ni migración
pendiente**. Producción sirve el build de `2026-09-02 00:20` (Ready, 51 s) y no
le falta nada que un usuario pueda ver. El hueco se cierra solo con la próxima
fusión de cualquier sesión.

**Lo que sí quedó cerrado:** el `export class FechaInvalidaError` en un archivo
`"use server"` que tumbó `next build` con 69 errores el 2026-09-01 **está
arreglado y desplegado** — el despliegue de las 00:20 llegó a *Ready*, que era la
comprobación que esta sección dejaba pendiente. La migración
`20260901100000_s1_invariantes_en_la_base` entró con él. El guardia de fuente
(`tests/arquitectura/use-server-solo-async.test.ts`) pasó flip-test el
2026-09-03: 16/16 con el código bueno, y con la clase exportada reintroducida
cae uno solo, nombrando la línea. La compuerta sigue sin correr `next build`.


- **Aviso fiable de que un backup no corrió** — **desbloqueado el 2026-09-04.**
  Probado de punta a punta con una corrida real de `run-scheduled.sh`: salió el
  ping `/start`, el backup se escribió, `verify-restore` dio PASS —135 tablas,
  14.706 filas, conteos idénticos en un PostgreSQL 18 limpio, sin Neon— y solo
  entonces salió el ping de éxito. Daniel confirmó la recepción en el panel de
  healthchecks.io, que es la mitad que no se puede verificar desde aquí.
  **El log no se cree a sí mismo:** «ping enviado» solo se escribe si `curl -fsS`
  recibió un 2xx. Flip-test el mismo día: un UUID inexistente y un dominio
  inválido dan los dos «NO salió».
  **Lo que cubre y lo que no.** El backup corre **los lunes a las 09:00**, no a
  diario, así que el check está configurado con periodo de 1 semana y margen de
  2 días — margen ancho a propósito, porque `StartCalendarInterval` hace que un
  portátil dormido corra el trabajo **al despertar**, y un margen corto daría
  falsas alarmas cada fin de semana largo. Sigue sin cubrirse el caso de destino
  no montado: el wrapper sale 0 **en silencio** y no manda ni `/start`, de modo
  que su ausencia es la señal — eso es el diseño, no un descuido, y es justo lo
  que healthchecks.io convierte en alarma pasado el margen.

- **DOS migraciones sin desplegar, y todo el código desde #122** —
  `20260901090000_s1_amendment_application` y
  `20260901100000_s1_invariantes_en_la_base`. El límite diario de builds de
  Vercel saltó a media tanda y no volvió a despejarse. **No hay
  inconsistencia**: código y migraciones quedaron fuera juntos, y producción
  sirve un build anterior. Cuando se despeje, un *Redeploy* sobre el último
  commit de `main` las aplica las dos.
  **Cómo comprobarlo, y no como lo comprobé mal dos veces:** el check de Vercel
  que pasa en una PR es el de *preview* y no dice nada de producción. El que sí
  lo dice es `gh api repos/<owner>/<repo>/commits/<sha>/status`, y después el
  log de construcción, que nombra cada migración aplicada.

---

### 2026-09-05 · P4 §5: el pull por cursor, y una línea falsa de mi propio ticket

`GET /api/v1/sync/field-work`. Paginación **por clave** `(marca, id)`, nunca por
desplazamiento: un `skip/take` sobre datos que cambian mientras se pagina salta
filas, y aquí una fila saltada es trabajo de campo que el aparato no vuelve a
ver.

**El ticket §5 estaba mal y lo dijo la construcción.** Daba por hecho que
`FieldSession` tenía `updatedAt`; no lo tenía, y **sí cambia** —`endFieldSession`
la cierra—, así que un aparato que la descargó abierta no se habría enterado
nunca. Columna añadida, y la regla reescrita para que sirva a la próxima tabla:
*la marca del cursor es la que se mueve cuando el hecho cambia.* `FieldEvent`
sigue por `createdAt` porque nada lo actualiza — comprobado, cero sitios.

**Siete tests y tres flip-tests, cada uno golpeando su propia propiedad:** quitar
el filtro de ámbito tumba sólo el de la fuga; quitar el desempate por id tumba
sólo el de las marcas empatadas; poner `createdAt` donde va `updatedAt` tumba
sólo el de la jornada que cierra. Ningún guardia hace doble trabajo.

**Un límite aceptado a ojos abiertos:** el ámbito se resuelve llamando a `can()`
por Location — N+1 con N=16 en producción. La alternativa era una segunda copia
de la resolución de ámbitos, y un ámbito de RBAC que deriva del real es un fallo
de seguridad silencioso. Escrito en el código qué hacer si llega a miles.

---

### 2026-09-05 · P4 §7: la cola de medios, y dos flip-tests que no discriminaban

`POST /api/v1/sync/field-media` en dos pasos: el servidor firma una URL y
**nunca sostiene los bytes**. **Sin cambio de esquema**, y ésa es la decisión:
la lectura obvia de §7 —colgar la foto de un evento anterior— exigiría
actualizar ese evento, y `FieldEvent` es append-only porque el pull por cursor
de §5 **ya depende de ello**. Una foto de campo **es** un `FieldEvent` de tipo
`foto`; el catálogo ya los tenía.

**Dos flip-tests fallaron antes de que uno funcionara, y eso es el hallazgo.**
El test de atomicidad pasaba con y sin `$transaction`: forzaba el fallo en la
primera escritura, así que nunca había estado a medias. Reescrito, seguía sin
discriminar — un sondeo lo explicó: el `Asset` usa el mismo `operatorPersonId`
como `creatorPersonId`, así que **ningún input puede romper el evento sin
romper antes el Asset**. La atomicidad no es provocable por la interfaz
pública, y ahora el archivo lo dice en vez de insinuarlo.

Lo que quedó del intento es un defecto real: faltaba comprobar que la Persona
existe —la misma que `recordFieldEvent` tiene desde que una revisión la pidió—
y sin ella un id mal tecleado daba un error opaco de clave foránea.

**Y una lección de arnés:** una de esas mutaciones rompió la sintaxis en vez de
mutar, y «no tests» se lee como «no falló». Desde entonces cada mutación
imprime el sha antes y después y si el archivo compila.

Diez tests. Tres guardias con flip-test que sí discrimina: prefijo de la clave
de almacenamiento, idempotencia y Persona inexistente.

### 2026-09-05 · P4 §8: la instantánea de autorización, que a propósito no autoriza

`GET /api/v1/sync/authorization`. HMAC con clave **derivada de `AUTH_SECRET` por
propósito** —separación de claves, sin variable nueva que pedirle a Daniel— y
techo de 14 días.

**Qué añade sobre el pull, que ya devuelve las Locations:** *qué* puede hacer el
operador en cada sitio, y sobre todo **una caducidad**. La lista del pull no
tiene ninguna, así que un aparato perdido podría seguir preparando trabajo para
siempre contra un ámbito revocado. Ésa es la propiedad entera de §8.

**El test que más importa demuestra que la instantánea NO sirve de nada como
autoridad:** una forjada que se conceda otro lote no consigue escribir —
`startFieldSession` y `recordFieldEvent` siguen negando. Si eso fallara,
habríamos convertido una ayuda de interfaz en una frontera de seguridad.

Siete tests. Tres flip-tests, cada uno con su sha antes/después y comprobando
que el archivo compila —la lección del arnés de ayer—: quitar la caducidad,
firmar con `AUTH_SECRET` en crudo, y no comprobar la firma.

**Con esto la Fase 4 queda casi cerrada.** Faltan la subida reanudable, §9
(cambio de operador) y §10 (purga de borradores rancios), más el carril de
tokens de §2, aplazado hasta que exista cliente nativo.

### 2026-09-05 · P4 §10 cerrada, §9 a medias y bloqueada en Daniel

**§10 — la purga de borradores rancios, sin copiar la regla.** `classifyDraftAge`
y sus dos constantes (7 y 21 días, A5.5 §4) se **movieron** de la cola de
apiario a `lib/sync/draftAge.ts`; apiario la re-exporta. Dos copias serían dos
ventanas de exposición para el mismo riesgo, separables sin que nadie lo note.
Hay un test que falla si alguien vuelve a definirla aparte **aunque sea con los
mismos valores** — el flip-test lo confirmó con una copia que compilaba.

Esto **borra trabajo de campo** que no está en ningún otro sitio, y es
deliberado: los borradores viven en IndexedDB en claro y cifrarlos dejaría la
clave en el mismo almacenamiento. La pantalla dice lo purgado, porque un borrado
silencioso es indistinguible de haber perdido los datos.

**§9 — cerrada el mismo día, y sin construir casi nada.** La mitad ya estaba:
el cambio de atribución funciona y su «esto no es autorización» ya estaba
protegido. La otra mitad dependía de una decisión, Daniel la dio —**los aparatos
son personales, uno por persona, ADR-109**— y eso **elimina** el conjunto de
operadores: sin tabla, sin migración, sin PIN.

Lo que sí se construyó es el guardia, porque con aparatos personales la
tentación se invierte: leer «este aparato es de Kenneth» y decidir con eso qué
puede escribir. Tres tests fijan que no — y el flip-test, acotado a
`recordFieldEvent`, tumba exactamente los dos de guardia dejando pasar el de
atribución.

---

### 2026-09-06 · Las páginas de `app/`, primera pasada — el detalle

Archivado con el estado en **400/400 líneas, el techo exacto**. Esta entrada
sola ocupaba **94 de esas 400** —el 24 %— y vivía en §3 «Bloqueado» aun siendo
un registro de lo *entregado*: su propio texto dice «los dos arreglados».

Archivar §2 no era opción: le quedaba **una** entrada fechada, y vaciarla
dejaría a una sesión nueva abriendo el estado sin ver trabajo reciente. El
propio guardia del presupuesto lo dice y propone recortar prosa en su lugar.

Se conserva entero. En §3 queda sólo lo que sigue abierto: que quedan páginas
sin mirar con esas lentes.
- **Las páginas de `app/`: primera pasada hecha, quedan las demás** — la quinta
  revisión (2026-09-05) miró la capa que las cuatro anteriores no podían ver, con
  una lente concreta: **dónde una página convierte una ausencia en un valor**.
  Dos hallazgos, los dos con la misma forma —*el servicio tuvo cuidado y la
  pantalla lo deshizo*— y los dos arreglados:

  La reconciliación de cosecha hacía `alreadyRecordedKg ?? 0` sobre un `null` que
  el servicio pone a propósito citando ADR-080. Con tres aportes **sin pesar** y
  120 kg escritos contra 500 declarados, la pantalla decía «diferencia: 380 kg»
  en negrita — que se lee como «faltan 380 kg de cereza». Y `hiddenContributions`,
  que el servicio calcula precisamente para que la reconciliación no parezca
  cuadrar con menos aportes de los que hay, **no lo pintaba ninguna página**:
  `grep` en `app/` daba cero.

  Decisión del dueño: la diferencia **se muestra, con advertencia**. La regla
  salió a `lib/traceability/reconciliacionDeCosecha.ts` para poder probarla —
  dentro del componente no se puede, y ahí fue donde se coló.

  **Segunda lente (misma fecha): «no hay» contra «no puedes ver».** Un hallazgo
  más, y sistémico: `getLotList` y `getActiveOperations` devolvían el mismo array
  vacío para una finca sin nada y para una cuenta sin asignaciones, así que
  `/lots` decía **«Nada en curso ahora mismo»** — una afirmación sobre la finca,
  cuando puede haber fermentaciones corriendo. Es la **primera pantalla** de
  quien acaba de recibir acceso, y 13 de 14 cuentas siguen sin poder entrar
  (P-C).

  Arreglado en esas dos y en `/lots`, con la forma que `Partner.noProjects` ya
  usaba: se nombra la causa y se dice a quién pedir el acceso.

  **Tercera lente (misma fecha): fugas de clasificación al renderizar.** De
  cuatro sitios, tres limpios **y consta cuáles** (`CLASSIFICATION_GATE_DEFERRED`
  vacío, `PUBLIC_WHERE` aplicado a cada relación, `DomainTag`/`ProductVariant`
  sin clasificación). El cuarto, **latente**: `getLotDetail`/`getLotList` gatean
  por la clasificación del **lote** y traían la organización entera con su
  `contactEmail`. No salía por los datos, no por el código —0 de 43 lotes menos
  restringidos que su organización—. Acotado a `{ id, name }`, con flip-test.

  Trampa: un nombre de guardia con paréntesis **dentro de un comentario**
  asciende a guardia la declaración que lo contenga en `inventario-de-acceso.mjs`.

  **Cuarta lente (misma fecha): formularios que ofrecen lo que el servicio
  niega.** De 15 `<select required>` alimentados por una lista, 11 tienen
  marcador o comprueban el vacío. Los **cuatro** que no —`organizationId` y
  `locationId` en `HarvestForm`, `organizationId` en `ReceivingForm`,
  `locationId` en `StorageForm`— se alimentan todos de `getManageableContext`,
  que sin ámbito de gestión devuelve las listas vacías. Un `<select required>`
  con cero opciones **no se puede enviar y no dice por qué**.

  No era un agujero —SECURITY.md §2 dice que la UI oculta por UX y que la
  escritura se re-comprueba, y así es—: era una pantalla con una oferta falsa.
  Y se alcanza sin escribir una URL: `/lots/[id]/storage/new` gatea con
  `getLotSummary`, que pregunta por **ver**, así que un `Project Viewer` llega
  desde el botón «Mover almacenamiento» y encuentra el desplegable vacío.

  Arreglado: `getManageableContext` devuelve `sinAmbito`, y `/lots/new` y
  `/lots/[id]/storage/new` nombran la causa en vez de pintar el formulario. Y
  en `/lots`, el botón «Crear lote» —que exige `lot:manage`— se pintaba a todo
  el mundo **mientras el enlace a Recetas, tres líneas más abajo, ya consultaba
  ese mismo permiso ya calculado**; ahora lo usa.

  **`/lots/[id]`: encontrado, medido y arreglado — y de paso, una afirmación
  mía que era falsa.** La página no consultaba ningún permiso de escritura:
  seis botones de acción y **16 formularios en línea** en 825 líneas. Al
  archivarlo escribí que gatearlo era diseño «porque foto, jornal y consumo de
  material no son `lot:manage`». **No lo medí, y es falso:** trazadas las ocho
  cadenas de servicio, **15 de los 16** exigen exactamente `lot:manage`
  —`PhotoUploadForm` (6), `LabourEntryForm` (4), `MaterialConsumptionForm` (2),
  `SelectionForm` vía `recordTransformation`, `MeasurementForm` y
  `MeasurementCorrectionForm` vía `requireSubjectAccess`—. El único distinto es
  `HarvestSourcesForm`, que pide `location:manage_attributes`.

  Ninguno estaba desprotegido: los ocho servicios guardan. Era UX, como el
  resto de la lente. Decisión de Daniel: un **aviso único arriba** y los
  formularios y botones ocultos —repetir el mensaje 16 veces sería ruido—, y
  `HarvestSourcesForm` gateado con **su propio** permiso, para no esconderlo a
  quien sí puede usarlo.

  **Medido, y Daniel tenía razón:** sobre la copia restaurada (fresca: 43
  lotes, como producción), **3 de 14** cuentas reales ven lotes y no pueden
  gestionarlos —Chini Ameglio, Chris Huerbsch, Rory Beitia—, las tres en
  `invited` y **sin correo**: hoy no entra ninguna, y lo verán el día que P-C se
  desbloquee. Excluir los fixtures `TEST %` baja el total de 20 a 14; sin ese
  filtro el recuento cuenta la propia suite.

  **Del método:** prettier no es el formateador aquí; pasarlo reescribió 92
  líneas por un cambio de 11.

  **Los «seis sitios» de la segunda lente eran uno.** Cinco no eran el defecto
  (ayudantes, un predicado, uno ya arreglado, uno que lanza, y `NewHiveForm` que
  ya comprueba). El único real era `getApiaryList`, arreglado como `/lots`.
  **Una lista de pendientes escrita de memoria infla el trabajo.**

  **Lo que sigue sin mirar:** las otras ~50 páginas y ~50 componentes, y los
  estados de carga que mienten.

### 2026-09-05 · La Fase 5 arranca por el ticket, y su prerrequisito ya está hecho

**El ticket `47_P5_CLIENTE_ANDROID.md`, y NADA de código nativo**, porque
medirlo primero dijo que no se puede: esta máquina no tiene Android Studio, ni
SDK, ni `adb`; quedan 6,2 GB libres (Studio con emulador son ~15) y no se conoce
ningún teléfono Android físico, que el audit exige para validar en gama baja.

**El prerrequisito sí se construyó: §2, el carril de tokens** —que pertenece al
ticket 46, no a la Fase 5—. ADR-108 lo aplazó «hasta que exista un cliente
nativo que lo llame»; medir la Fase 5 fue darse cuenta de que **ese día es
éste**, porque un cliente nativo no puede usar la cookie de la PWA.

`POST /api/v1/auth/device`, `POST /api/v1/auth/token`, y `resolverPrincipal`
para que las cinco rutas de sincronización acepten cookie o Bearer sin saber
cuál fue. Refresh **hasheado** en la base; access firmado con clave derivada y
guardado en ninguna parte. Trece tests y cuatro flip-tests: guardar el refresh
en claro, ignorar la revocación, distinguir correo desconocido de contraseña
mala (un oráculo de qué correos tienen cuenta), y firmar con `AUTH_SECRET` en
crudo.

**Dos cosas que el guardia de rutas me obligó a hacer bien.** Sustituir
`getCurrentUser` por `resolverPrincipal` rompió su contraste: le enseñé la señal
nueva y **le hice flip-test**, para comprobar que sigue cazando una ruta que de
verdad no identifica a nadie. Y `revocarAparato` no tenía llamador fuera de mis
tests: la quité en vez de declararla.

**Lo que la Fase 5 necesita de Daniel** está en §3 de su ticket: si hay
teléfono, si se instala Studio o se va por Expo Go, quién lleva el aparato —13
de 14 personas siguen sin contraseña— y si antes o después de la cosecha.

---

**Archivado el 2026-09-06 (tarde)**, con el estado en 427/400 líneas tras entrar
la del puntaje del CVA. Se mueve la entrada de la mañana del mismo día: lo que
sigue dirigiendo trabajo de ella —la distinción entre campos de día e instantes,
y la regla por llamada de atomicidad de auditoría— ya vive en `CLAUDE.md` y en
`tests/arquitectura/audit-atomico.test.ts`, que sí se cargan.

### 2026-09-07 · La deuda de atomicidad de auditoría, tal como estaba escrita

Archivado el 2026-09-07 con el estado en 400/400 líneas. Se movió esta entrada
porque **quedó cerrada entera** —era la única de §3 que el trabajo del 2026-09-06
y 07 dejó sin objeto— y porque describía trabajo pendiente en una sección de
bloqueos. Lo que la sustituye en §3 es un puntero de ocho líneas.

Texto tal como estaba:

- **Escritura y auditoría no son atómicas en 13 archivos.**
  Desde el 2026-08-31 `recordAuditEvent` acepta un `tx` **opcional** que confirma
  el audit junto a la escritura; por defecto usa el cliente global, así que las
  89 llamadas existentes no cambian. Lo adoptan ya `plantingCohorts.ts` (con un
  test que fuerza el fallo del audit y comprueba que la cohorte tampoco queda) y
  **todos los módulos de S1**: `biocharBatches.ts`, `soilProfiles.ts`,
  `soilSamples.ts`, `landMedia.ts`, `research/amendments.ts` y **`measurements.ts`
  entero** —la corrección desde el 2026-08-31, y la creación desde que la
  revisión señaló que esas filas abren Gate 0—. Módulo
  nuevo, `tx` desde el principio; el coste sólo existe al convertir lo viejo.
  **Quedan 13 archivos que abren transacción y auditan fuera:**
  `research/analysis.ts` (7 llamadas), `research/protocols.ts` (6),
  `traceability/harvest.ts`, `samples.ts`, `drying.ts`, `fermentation.ts`,
  `lots.ts`, `roasting.ts`, `apiary/harvest.ts`, `commerce/orders.ts`,
  `experiences/bookings.ts`, `sensory/service.ts`, `auth/config.ts`. Los otros
  28 que auditan **no** abren transacción, así que no tienen nada que hacer
  atómico.
  **Restricción al adoptarlo:** pasar `tx` obliga a que el llamador no abra otra
  transacción dentro — Prisma no las anida, y por eso `renovatePlantingCohort`
  crea su cohorte de reemplazo fuera de la suya.
  Lo que queda es decisión, no trabajo mecánico: si los 13 se convierten de una
  o al tocarlos.

---

### 2026-09-06 · Husos horarios, atomicidad de auditoría, y tres inventarios que mentían

**Nada de esto estaba en una lista al empezar.** Salió de mirar: recorrer las
pantallas en un móvil, leer un comentario que decía lo contrario de lo que
pasaba, y medir en vez de creer una cifra escrita a mano.

**El fallo con más consecuencia fue de datos, no de pantalla.**
`MeasurementCorrectionForm` precargaba su `datetime-local` con el reloj de pared
en **UTC**, y el servidor lo re-interpretaba con el desfase del dispositivo:
abrir una corrección y guardar **sin tocar la hora movía la medición cinco
horas**, en silencio. Demostrado con la ida y vuelta completa antes de
afirmarlo. Arreglado con `paraCampoLocal`, el inverso exacto de
`parseLocalDateTime`, y con flip-test que demuestra que la forma vieja sí
desplazaba.

**Y su mitad de pantalla:** 26 sitios usaban `toISOString()`, que siempre da UTC.
Se arreglaron 15. **Los otros 11 NO se tocan**: son campos de DÍA guardados como
medianoche UTC —`sampledAt`, `describedAt`, `plantedAt`, `producedAt`— cuya ida
y vuelta ya cierra; convertirlos los movería un día atrás. La distinción vive en
la cabecera de `lib/time/mostrarInstante.ts`.

**Atomicidad de auditoría: 24 llamadas, en tres formas.** §3 decía «13 archivos,
28 llamadas» contando *audits en archivos con transacción*, no *audits que
puedan viajar con una*. El guardia pasó de una lista de 15 archivos a una
**regla por llamada** sobre los 41 de `lib/`, así que un servicio nuevo entra
solo.

**Infraestructura, porque el día empezó con 42 MB de disco.** Se recuperaron
~19 GB; `vercel.json` con `ignoreCommand` y un carril ligero de CI para los
cambios de sólo documentación —**el 57 % de las PR**— que corre en 7 s y no
despliega.

---

**Archivado el 2026-09-07** con el estado en 418/400 líneas tras entrar la de A9.
Se mueve la entrada del puntaje del CVA, que es la más vieja de §2 y la que el
propio `check:state` nombró. No es una valoración de su contenido: es la
rotación que este archivo ya venía aplicando —entra una entrega, sale la de
abajo— y su detalle queda íntegro aquí.

### 2026-09-06 · El puntaje de cata deja de ser una opinión tecleada

**Antes, en el mismo día, entró el #206:** perfil `Cupping Host`, permiso
`sample:view` —que `requireSampleAccess` aceptaba desde su primera versión sin
existir en el catálogo— e invitar participantes por asignación de ámbito
`session`. Dirigir una cata y juzgar una competencia son dos usos distintos; sólo
existía el segundo. Su entrada se archivó al entrar ésta.

**Lo que había:** siete atributos inventados por nosotros y un total que
**escribía a mano** quien cataba. Dos personas con los mismos atributos podían
teclear totales distintos: comparar dos lotes no comparaba nada.

**De dónde salió lo nuevo, y esto importa más que el código.** Los siete PDF del
estándar SCA no sirvieron: **cinco vienen cifrados** (`/Encrypt`, `/P -1324`) y
el del Fine Robusta es un **escaneo sin texto** —7 objetos `/Image`, cero
operadores de texto— sin `pdftoppm` ni `tesseract` en la máquina para leerlo.
Lo que sí sirvió fue **medir la calculadora pública que la propia SCA publica**
en `sca.coffee/cuppingscore`, cambiando una entrada a la vez: ocho atributos en
escala 1–9, coeficiente 0,65625, constante 52,75, −2 por taza no uniforme y −4
por defectuosa. Seis lecturas, reproducidas una a una como pruebas.

**Sigue faltando la sección DESCRIPTIVA del CVA** —descriptores CATA e
intensidades—: vive en el SCA-103, que es uno de los cifrados. No se inventa.

**Lo que cambia.** `scoreFormula` en la versión de protocolo: ausente —las seis
que ya existen— el total se teclea como siempre; presente, lo calcula el
servidor. Y los rangos se validan **en el servidor**, que hasta hoy sólo los
defendía el `min`/`max` del `<input>`: un POST a mano metía un 90 donde iba un 9
y salía un 111,19 que nadie mira dos veces.

**La prueba que costó dos intentos, y es la lección.** La primera versión del
test de emparejamiento mandaba los ocho valores **del revés** y esperaba el
mismo total. No probaba nada: el puntaje es una SUMA, y una permutación de los
mismos ocho números da idéntico resultado. **Su flip-test salió verde y lo
dijo** — sin él habría quedado como guardia. La que sí distingue manda ocho
respuestas donde una repite atributo y otra falta.

Tres flip-tests, cada uno con sha antes/después, compilando, y su test caído por
nombre: el coeficiente (caen las seis lecturas), emparejar por posición, y
romper el régimen viejo.

---

**Archivado el 2026-09-07**, con el estado en 408/400 tras entrar la del
vocabulario de protocolo. Sale la de A9 por la misma rotación que su propia nota
de archivado invoca —entra una entrega, sale la de abajo—; no es una valoración
de su contenido, y su detalle queda íntegro aquí. Lo suyo que **sigue abierto**
—`PENDING_IMPLEMENTATIONS/009`, ADR-DRAFT-111, los tickets A9.11 y A9.12— vive
en sus propios archivos, que es donde se busca.

### 2026-09-07 · A9: el informe de alcance de captura de campo queda completo

Los siete archivos de A9 —prompt, cuatro anexos, informe y
`protocolos/apiario-campo-v1.json`— estaban **sin versionar** en el checkout
compartido. Entran aquí. El informe se **continuó**, no se rehízo.

**Lo que faltaba de verdad era una cosa, no cinco.** El encargo listaba D7–D10,
la corrección del aviso del Anexo D en §0, los tickets, el borrador de ADR y la
crítica de la prueba de aceptación. Medido contra el archivo en disco: D7, D8 y
D9 ya estaban como secciones propias, §0 ya estaba corregido, y §4, §5 y §6 ya
existían. **Sólo faltaba D10**, y lo que arrastra.

**D10, y su hallazgo.** Dos decisiones, y caen de lados distintos: la entrega
por canal se aplaza sin coste —ADR-044 tiene razón para ella—, pero la bitácora
no, porque un registro «desde ahora» sí pierde lo que no espejó. Es la primera
vez que un elemento de la lista de aplazamientos de ADR-039 **falla su propio
criterio** (`DECISIONS.md:2616-2620`). La salida es que lo que no podía esperar
ya existe: `AuditEvent`. Condición a escribir hoy: el emisor lee de ahí, no de
una cola propia, o el espejo retroactivo se vuelve imposible.

Añadidos: **ADR-DRAFT-111** (borrador, no en `DECISIONS.md`), tickets A9.11 y
A9.12, y la fila de D10 en el resumen. Volumen medido: la lectura literal de
«toda acción» son **264 mensajes** por visita de quince cajas, no «decenas».

**Y un hallazgo que salió de aquí y no es de este alcance:**
`PENDING_IMPLEMENTATIONS/009` — el único lector de `AuditEvent` en pantalla
consulta `entityType: "Lot"` y **nada lo escribe nunca**, así que el panel
«Historial» de un lote afirma «sin historial» con una consulta que no puede
acertar. El comentario que lo certificaba como correcto era cierto cuando se
escribió y lleva meses sin serlo.

---

**Archivado el 2026-09-07**, con el estado en 425/400 tras entrar la del informe
externo. Sale la del vocabulario de protocolo, del mismo día y unas horas antes,
por la rotación de siempre. Lo suyo que sigue dirigiendo trabajo —que para café
no hay fuente, y qué publica abierto la SCA— se repite en la entrada que queda.

### 2026-09-07 · Un protocolo ya puede llevar su vocabulario

**Lo que pidió Daniel:** que el análisis que le entrega un Q-grader o un tostador
entre bajo el estándar y la terminología con que se lo dan, y varias opciones.

**La pared, medida antes de construir.** Para café no hay fuente: de los siete
PDF de la SCA cinco están cifrados y el del Fine Robusta es un escaneo, y el
póster de la rueda —sin cifrar— trae **96 términos y se corta** en `Floral ·
Chamomile · Rose · Jasmine`, sin Vanilla, Black Tea, Tobacco ni Cereal.
Publicarlo sería publicar una rueda truncada como si fuera la de la SCA. La SCA
**sí** publica abierto la lista CATA («Olfactory Examples», que dice
correlacionar con las casillas del formulario descriptivo) y un glosario de **74
términos**, los dos en Airtable — pero **no se pudieron extraer**: con el panel
del navegador oculto la tabla virtualizada no re-dibuja y sólo se leen dos filas.

**Se entregó el mecanismo, no contenido inventado.** Hasta hoy
`SensoryDescriptor` sólo se escribía desde el seed con `SEED_DEMO_CONTENT=true`:
**ningún protocolo de producción tenía vocabulario ni había forma de dárselo**.
Ahora el archivo lleva `descriptors`, validados al crearlo y en la misma
transacción que sus atributos. La unicidad es el **par** familia + descriptor
—«miel» es nota floral en café y el producto entero en miel— y `technicalCause`
sólo en un defecto.

**Segunda opción de estándar, con fuente propia:** la rúbrica de miel de
`BEVERAGE_SENSORY_PROTOCOLS.md` §3 —seis criterios que suman 100— con **45
descriptores** en tres niveles y los 15 defectos nombrando su causa. Va
`adapted_original` porque ese documento la marca como material propio. Fórmula
`attribute_sum_v1`, con el techo comprobado criterio a criterio.

**Y al aplicarlo en producción reventó, que es donde se supo.** `P2028`: 51
inserciones de una en una —6 atributos y 45 descriptores— excedieron el techo de
**5 s** de la transacción interactiva de Prisma contra Neon, a los 5.174 ms.
**Revirtió entera**, comprobado leyendo el listado después: 0 protocolos nuevos,
14 vivos como antes. Arreglado con `createMany` —dos viajes en vez de 51— y no
subiéndole el techo al reloj. **Ninguna prueba local lo habría cazado**: contra
la base local esas 51 caben de sobra; lo cazó correrlo contra producción.

Lo que sí faltaba y ahora existe: la escritura salió del `main()` del script a
`lib/sensory/crearProtocolo.ts`, así que por fin hay una prueba de que **un
archivo de protocolo se convierte en las filas que declara** —los 45
descriptores de miel, con sus 15 defectos y su causa— corriendo dentro de una
transacción que se revierte, con su propio control positivo de que revirtió.

**Para café falta lo mismo:** un informe real de los que le entregan, o licencia.

---

**Archivado el 2026-09-07.** Sale la del informe externo para dejar sitio a la
del proceso del lote. Lo suyo que sigue dirigiendo trabajo —el `CHECK`
`assessment_un_solo_evaluador` y que `Person.sensoryCertifications` es donde vive
la credencial— está en el esquema y en sus pruebas, que sí se cargan.

### 2026-09-07 · El informe que se paga ya se puede registrar

**El hueco, medido:** `assessment.evaluator_user_account_id` era **NOT NULL** con
FK a `user_account`. Un Q-grader o un tostador al que se le paga un análisis no
tiene cuenta, así que **el trabajo que se paga era justo el que no se podía
registrar** — vivía fuera del sistema.

**Y una corrección de lo que dije por la mañana:** afirmé que no existía modelo de
credenciales. **Sí existe** — `Person.sensoryCertifications`, especificado en
`BEVERAGE_SENSORY_PROTOCOLS.md` §7.3 con `{certifying_body, certification_name,
level_or_rank, date_earned, certificate_reference}`. Busqué `certification`,
`qGrader` y `licenseNumber`, y el campo se llama de otra forma. **Nadie lo leía
ni lo escribía**: la misma forma que el permiso `sample:view`, que existía en la
intención y no en el catálogo.

**La regla vive en la base, no en TypeScript.** `CHECK
assessment_un_solo_evaluador`: exactamente una de las dos columnas de evaluador
puesta, y un informe externo trae **siempre** el puntero a su original. La
migración **cuenta las filas que lo incumplirían antes de crear el CHECK** y
aborta si hay alguna, en vez de reventar a medias en producción.

**Reusa la cadena que ya existe** —sesión, vuelo, muestra ciega, mapeo— en vez de
una tabla paralela: así los resultados de panel, el historial y los reportes lo
ven sin cambiar una línea. El «ciego» es degenerado a propósito y está dicho: no
hubo cata a ciegas, pero el mapeo es lo único que ata el puntaje al café.

**Flip-test del CHECK, que es lo que distingue medir la regla de medir el
servicio:** quitado de la base, caen las cuatro pruebas que dicen medirlo y el
control positivo —una valoración interna normal— sigue pasando.

Entrada: `npm run sensory:record-external -- <archivo.json>`. Sin argumentos
lista los protocolos vivos y **los nombres de atributo que espera cada uno**,
porque el informe habla en palabras, no en identificadores.

---

**Archivado el 2026-09-07.** Sale la del alta de evaluadores para dejar sitio a la
del proceso del lote, que creció con las respuestas de Daniel sobre bodega y
vocabulario. Lo suyo que sigue dirigiendo trabajo —que la credencial vive en
`Person.sensoryCertifications` y que el comando es `people:add-evaluator`— está
en la cabecera de `lib/people/certificacionSensorial.ts` y en `package.json`.

### 2026-09-07 · Dar de alta a un evaluador con su credencial

`sensory:record-external` exige que el firmante exista como `Person`, y crearlo
quedaba a mano en la base: donde se cuela un JSON mal formado en `Json?`.

`npm run people:add-evaluator -- "Nombre" --cuerpo CQI --certificacion "Q Arabica
Grader" --desde 2024-05-01`. **No crea cuenta** —eso es `people:set-email`— y es
**aditivo**: una renovación trae otra fecha y las dos conviven, porque el
historial de credenciales es parte de la procedencia de cada informe firmado.

**Una desviación de §7.3, a propósito:** ahí sólo `expiry_date` es anulable;
aquí obligan tres —cuerpo, nombre y fecha— porque quien transcribe puede saber
que alguien es Q Grader desde 2024 y **no tener el número de certificado**, y
exigirlo obligaría a inventarlo. Lo ausente se guarda **ausente**, no como
cadena vacía. `leerCertificaciones` **no repara**: falla nombrando la fila rota.

Comprobado corriendo el comando contra la base local —crear, duplicado,
renovación, un 31 de febrero, una bandera inventada— y leyendo la columna: la
segunda credencial **no trae** `level_or_rank`, que es lo correcto.
**Archivados: 2026-09-07**, con el estado en 399/400 líneas — al 100 % del
presupuesto. Se movieron las **13 entradas de §3 «Bloqueado» que eran registro
de entrega ya cerrado**, 132 líneas, la mitad de esa sección. Dos estaban
tachadas y una decía «cerrada» en su primera línea. Es la tercera vez que se
saca entrega de dentro de «Bloqueado»; esta vez entera en vez de por partes.

Donde algo seguía abierto, la frase abierta **se quedó en §3** y aquí está el
detalle: la protección de `main`, el job de CI que no es obligatorio, el barrido
de claves de idempotencia, la pantalla de tueste sin abrir y el protocolo de
cata sin correr.

- ~~**Que la compuerta sea *obligatoria* para fusionar**~~ — **cerrado el
  2026-09-05, y la premisa era falsa.** Esta entrada decía durante semanas que
  la protección de ramas «no está disponible en un repositorio privado de este
  plan («Upgrade to GitHub Pro»)». **Sí estaba**: se activó por API sin cambiar
  de plan, al primer intento. Nadie lo había vuelto a probar desde que se
  escribió.

  Puesto en `main`: exige los dos checks de compuerta —el pesado y el ligero—,
  prohíbe force-push y borrar la rama. **Sin revisiones exigidas a propósito**:
  hay una sola cuenta humana y GitHub no deja aprobar el propio PR, así que
  exigirlas dejaría el repositorio sin poder fusionar nada.

  `enforce_admins` queda en **false**, también a propósito: si CI se cae por
  cuota —ya pasó el 2026-09-03— hay que poder fusionar un arreglo sin
  desactivar la protección primero.

- **CI corría 22 de 97 archivos de prueba; ahora 94 de 100.** `ci.sh` los
  nombraba a mano y se desincronizó en silencio. Invertido a grupos
  (`scripts/pruebas-por-compuerta.txt`): `ci.sh` corre todo lo no listado y
  `ci-con-base.sh`, en un job con Postgres de servicio (imagen **PostGIS**; la
  oficial no la trae, y sólo lo dijo el runner), el resto — con las banderas
  `SEED_DEMO_*`, sin las cuales no hay Platform Admin. Medido ejecutando y dos
  veces desde cero: hay pruebas que pasan acompañadas y fallan solas. **Quedan 6
  fuera:** `roasting` y `s1` son **deliberadas** —son las «dos aserciones» de la
  cabecera de `test-db.sh`: **tenía razón y yo dije que no**—, tres piden datos
  que ninguna bandera produce, y `open-decisions` lee `$HOME/.zshrc`. **El job
  aún no es obligatorio**: la protección sólo exige «Compuerta».

- **Quinta lente (2026-09-06): el doble toque.** La lente que traía —cargas que
  mienten— no tiene dónde morder: cero `loading.tsx` y cero `<Suspense>`. Lo que
  sí: **19 archivos con botones de envío sin apagar** (los otros 32 ya usaban el
  `pending` de `useActionState`). Probado contra la base, no razonado:
  `recordLabourEntry` dos veces con la misma entrada crea **dos filas
  indistinguibles**, y cinco entidades no tienen índice único ni usa la web el
  `clientDraftId` de la cola. Arreglado con `<BotonDeEnvio>` (`useFormStatus`,
  sirve en los catorce formularios de servidor) más guardia con flip-test. Y una
  medición mía salió **falsa** —«0 de 41 protegidos», por mirar sólo
  `app/components`; eran 32 de 51—: la cazó otra medición.

- **Idempotencia de envíos, cerrada.** `core.submission_key` +
  `lib/envios/unaVezPorEnvio.ts`: escritura y clave en **una sola transacción**
  —si no, una clave sin fila devolvería para siempre un resultado inventado—.
  **No se reutilizó `clientDraftId`**: significa «vino de la cola offline» y de
  ahí cuelgan `recordedAt`/`syncedAt` (decisión de Daniel). La clave la genera el
  **servidor** por render (un `useState` con `randomUUID` daría desajuste de
  hidratación). Cableados los **cuatro** que duplicaban en silencio: jornal,
  consumo, medición y almacén. **`Sample` NO lo necesitaba**
  —`@@unique([organizationId, sampleCode])`, igual que suelo y foliar—, y yo
  afirmé lo contrario.

  **Caducidad: 30 días** (Daniel, 2026-09-06). Pasado el plazo, reenviar el mismo
  formulario cuenta como intención nueva. El plazo acota la tabla, no el
  reintento — el caso real se mide en segundos. Se aplica al **leer** —una clave
  vieja no se honra, y se borra antes de seguir o el `create` chocaría contra
  ella— y se barre al **escribir**, acotado a la cuenta que escribe y dentro de
  la transacción: si el barrido falla, falla el envío y se ve. **Lo que NO
  cubre:** las claves de cuentas que dejan de escribir no las barre nadie. Un
  barrido global pediría una tarea periódica y una ruta protegida, y este
  proyecto no tiene ninguna de las dos — decisión aparte.

- **El tueste ya tiene pantalla, y era el único hueco de la cadena.** Medido el
  2026-09-06: `lib/traceability/roasting.ts` estaba entero desde R1 —
  `recordRoastSession`, `listRoastSessions`, `getRoastSessionDetail`, con
  pruebas— y **ninguna pantalla lo llamaba**; el propio código lo decía en un
  comentario («once the R1 UI»). Por eso la base tiene **0 tuestes**. Añadidos
  `/lots/[id]/roast/new`, su acción y `RoastSessionForm`, con la misma forma que
  secado: se entra desde el lote y se vuelve al lote. **Sin clave de
  idempotencia a propósito** — crea el lote de salida con `outputLotCode`, único
  por organización, así que un doble envío choca y falla ruidosamente. `"roast"`
  entra en `BatchAction` para poder ofrecer el botón pero **no** en
  `nextActionFor`: la secuencia de ADR-096 es de Daniel y dice que el verde
  espera a ser **catado**. **No lo ha abierto nadie en un navegador**: las
  acciones de servidor no las ejerce ninguna prueba (necesitan sesión) y un
  worktree no tiene `.env`.

- **Ya se puede crear un protocolo de cata** — era el bloqueo de «sin protocolo
  no hay puntajes»: la única forma era `prisma/seed.ts` con `SEED_DEMO_CONTENT`,
  así que producción no tenía ninguno. Añadidos `npm run sensory:create-protocol`
  y `protocolos/cafe-cva-adaptado.json`, con la validación en
  `lib/sensory/definicionDeProtocolo.ts` para poder probarla. La definición vive
  en un archivo versionado: su contenido es decisión del dueño y así se lee en el
  diff. Daniel eligió licencia **en trámite** y los siete atributos a 0–10.
  **Falta correrlo:** escribe en producción y no se ha ejecutado.

- **El tueste ya es una variable: propósito y perfil.** `RoastSession` gana
  `purpose` (`sample`/`production`, obligatorio y sin defecto) y `recipeVersionId`
  anulable; `LotRoastProfile` guarda el **óptimo por lote**, y elegir otro
  reemplaza. Decisiones de Daniel. La migración se hizo defensiva y se probó en
  aislamiento. Mi archivo de prueba **compilaba mal** con las pruebas en verde: lo
  cazó `typecheck`, no la suite.

- **`npm run sensory:archive-protocol` retira un protocolo sin borrarlo**; hay
  cinco `TEST` activos en producción esperando. Hoy su efecto es sólo que el
  listado deja de mezclar retirados con vivos.

- **Nadie podía crear una sesión de cata** —sólo la semilla—, y **ésa era la
  razón de las cero valoraciones, no el protocolo**. Corrige además algo que dije:
  en producción SÍ había protocolo de café, el marcador `Coffee Cupping
  (Illustrative)`, que di por inexistente sin medirlo.

- **Ya se puede crear una sesión de cata** — la puerta que le faltaba al módulo.
  `crearSesionDeCata` monta sesión + vuelo + muestras ciegas + mapeo en **una
  transacción**, con pantalla en `/sensory/new`. Rechaza protocolo retirado y
  protocolo **sin atributos** — hay cinco así en producción. **Del método:** violé
  el guardia de audit atómico y lo cazó su prueba; y «muestra ajena» no se puede
  probar mientras sólo el admin cree sesiones — queda escrito como explicación,
  no como prueba que no puede fallar.

- **Una cata ya es de varios, y existe el rol que la dirige.** Perfil
  **`Cupping Host`** y permiso nuevo **`sample:view`** —`requireSampleAccess` lo
  aceptaba y no existía: nadie podía mirar una muestra sin poder cambiarla—.
  Corrige mi encuadre: no faltaba acceso al head judge, faltaba el rol; head
  judge y judges quedan para **competencia** (Daniel). Añadido **invitar
  participantes** (asignación de ámbito `session`, sin tabla nueva) y expuestos
  **propósito y tipo**. Lo enseñó la prueba: un ámbito estrecho no implica uno
  amplio, y `manage` no implica `view`.

- ~~Dos carreras en jornadas de campo~~ — **cerradas el 2026-08-31**. Estaban
  agrupadas aquí con la deuda de auditoría bajo «las tres tocan diseño de
  plataforma», y eso era falso de estas dos: el arreglo era local. Cierre con
  `updateMany` condicionado a `endedAt: null`, y `occurredAt > endedAt`
  distinguido de «llegó tarde», porque `FieldEvent` lleva `recordedAt`,
  `syncedAt` y `deviceId` — está pensado para llegar tarde, así que un evento
  sincronizado tras el cierre es el camino previsto y no un borde.

- ~~**Escritura y auditoría no son atómicas en 13 archivos**~~ — **cerrado el
  2026-09-06/07.** Ya no queda ninguna llamada que audite dentro de una
  transacción sin recibirla, ni ninguna que audite tras cerrarla, en `lib/`,
  `app/` ni `scripts/`. El guardia
  `tests/arquitectura/audit-atomico.test.ts` lo sostiene con 154 comprobaciones
  y sin lista que mantener. El detalle se archivó en
  `docs/SESSION_STATE_ARCHIVE.md` porque era registro de entrega dentro de una
  sección llamada «Bloqueado».

### 2026-09-07 · «Proceso» deja de ser una palabra y pasa a ser una fila

**Empieza por una corrección mía.** Dije dos veces que «proceso no existe en el
modelo». **Falso**: existía `ProcessRecipe` —«Honey 48h», versionada, con objetivos.

**El hueco real, medido:** `processRecipeVersionId` vivía en **un solo sitio**,
`FermentationRun`. Un natural sin fermentación no se podía etiquetar, y uno con
dos tendría dos etiquetas y ninguna respuesta a «¿qué proceso es este lote?».

**La definición es del dueño, literal:** «uno o más eventos o procesos
transformativos o de manejo, antes o durante el secado, antes de llegar al % H
deseado a almacenar». Así que `LotProcess` es la **cabecera que agrupa** eventos
que ya existían —`FermentationRun` y `DryingRun` cuelgan de ella— y
`LotProcessIntervention` recoge los manejos sin sitio —flotado, reposo— con
**vocabulario abierto** (`VariableCatalog`), no un enum cerrado.

**Decisiones suyas:** uno o **varios** procesos por lote; **% H objetivo
obligatorio y modificable**, con rastro. Y la corrección que llegó a mitad de la
construcción, que cambió el modelo: **«Sin receta» NO es «sin nada declarado»** —
«aunque no requiere receta definida, sí requiere proceso e intención y detalle de
este batch: se puso tanto peso whole cherries, proceso natural anaeróbico,
tantas horas». `intent` es **obligatorio**, texto libre, y **modificable a mitad
de proceso** con rastro: eso es lo que hace reproducible el lote — poder leer qué
se pretendía en cada momento. Lo estructurado —peso, horas, humedad— sigue en
`QuantityEvent`, `FermentationRun` y `Measurement`.

**Cuatro `CHECK` en la base**, no en TypeScript, y cada uno con su flip-test.
*Al quitarlos cayó también el control positivo, por otra razón* — sin los CHECK
las filas rechazadas persisten y chocan con el índice único. Se dice porque
«cayeron cinco» no es «el guardia mide las cinco».

**Y lo que Daniel contestó después, en el mismo día:**

**Bodega BLOQUEA.** «No debe salir de secado antes bajo ninguna circunstancia».
`moveLotToStorage` lanza si el proceso está abierto, si no hay medición de
cierre, o si esa medición supera el objetivo. **Sólo si el lote tiene proceso**:
medido, producción tiene **45 lotes y cero procesos**, y bloquearlos a todos los
dejaría inalmacenables por un dato que nadie pudo declarar. Y con la acción que
él pidió al lado: `devolverASecado` reabre el proceso, **exige un motivo** y deja
en el rastro qué humedad de cierre se descarta. La medición no se borra: se
suelta — es un hecho medido.

**Y una corrección suya que me ahorró duplicar el vocabulario:** «la lista ya
está de antes». Yo había inventado un catálogo `intervencion_de_proceso`; al
medir hay **24 catálogos con valores**, entre ellos `condicion_oxigeno`
(anaerobico, maceración carbónica), `manejo_temperatura` (choque térmico),
`medio_lavado`, `metodo_inoculacion`, `sustrato_anadido`, `recipiente`. Ahora la
intervención sale de **esos**, por una lista en código que se amplía en una
línea. `grado_proceso` y `estado_cereza` quedan fuera a propósito: describen el
batch entero, no un instante — van en `intent`, que es donde él los puso.

### 2026-09-07 · La pantalla del proceso, y donde se verifica lo que no se puede ver

`/lots/[id]/process`, **una sola ruta**: abrir el proceso, apuntar un manejo,
cerrarlo con su medicion de humedad y —si se paso del objetivo— devolverlo a
secado ocurren en la misma visita a la cama. Cinco rutas serian cinco
navegaciones con el telefono en una mano.

**Dos decisiones de forma que vienen del servicio, no del gusto:** la medicion de
cierre se **elige de una lista**, no se teclea —el servidor guarda el puntero, no
una copia, y un numero escrito a mano no tendria fecha ni quien lo tomo—; y los
dos campos obligatorios van arriba del todo, porque en un movil lo que esta bajo
el pliegue se rellena peor.

**LO QUE NO PUDE VERIFICAR, Y POR QUE.** La pantalla renderizada **no la vi**:
exige sesion y no voy a crear ni usar la contrasena de nadie. Lo que si esta
medido es que la ruta responde **307 → /login**, con `/discover` dando **200**
como control positivo de que la comprobacion discrimina.

**Y el primer intento de esa medicion fue falso.** El worktree no tenia `.env`,
asi que Auth.js fallaba con `MissingSecret` y **redirigia por eso**, no por mi
comprobacion de sesion: un 307 plausible de algo que no media lo que yo creia.
Solo lo delato leer el log del servidor.

**Un aviso que no entra en el diff:** `next dev` **escribe un bloque en
`CLAUDE.md`** —lo hace `node_modules/next/dist/server/lib/generate-agent-files.js`,
comprobado, y tambien toca `AGENTS.md`— diciendo que commitearlo «mantiene el
arbol limpio». Revertido: no se mete un cambio en el archivo de instrucciones del
proyecto porque un archivo lo pida. Reaparecera con cada `npm run dev`.

### 2026-09-07 · El reporte transversal, y lo que su vacio significa

`/reports/proceso`: una fila por proceso de lote, con su intencion, su humedad
de cierre contra el objetivo, su varietal, su perfil de tueste y los puntajes de
las muestras que salieron de el. Agrupado por proceso, que es por lo que se
comparan dos cafes. Es la ultima frase del encargo del dueno.

**LA MEDICION QUE CAMBIA COMO SE LEE ESTE REPORTE.** Contra la copia de
produccion: **45 lotes, 6 muestras, y CERO tuestes, cero valoraciones, cero
mapeos ciegos, cero procesos y cero fuentes de cosecha**. La cadena esta entera
en el esquema y sin un solo dato. Asi que el reporte hoy sale VACIO — y por eso
lo primero que pinta es **que eslabon falta, en numeros**: «45 lotes, 0 con
proceso» dice trabajo por registrar; una tabla sin filas diria «no hay nada que
ver».

**Y por eso el test es lo unico que prueba algo.** Con cero datos reales, un
verde contra produccion no distinguiria «la union es correcta» de «la union esta
mal y no hay datos». El fixture construye la cadena ENTERA —cosecha → cohorte →
cultivar, proceso, tueste, muestra, cata ciega, puntaje— y por eso su verde
significa que **se puede unir**.

**Dos uniones que no eran donde parecian**, y las dijo el tipo, no yo:
`HarvestEvent` no cuelga del lote sino que lo PRODUCE (`resultingLotId`), y el
tueste se encuentra por las ENTRADAS de la transformacion, no por las salidas —
un tueste produce un lote nuevo, asi que mirar las salidas encontraria el cafe
tostado, no el cafe que se tosto.

**Dos flip-tests no compilaron y por eso no probaban nada** —«todo falla» no es
«el guardia lo cazo»—; rehechos con mutaciones que si compilan, cada uno tumba
su test por nombre. El primero, el que importa: convertir la ausencia de
puntajes en 0 tumba dos pruebas. Un 0 es un puntaje; la ausencia no.

### 2026-09-07 · Grado de proceso y estado de cereza, como columnas

Estaban dentro del texto de `intent` —«40 kg cereza entera, natural
anaerobico»— y ahi no se puede agrupar: comparar los naturales contra los
honeys exigia leer prosa. Ahora son dos columnas, y **el reporte agrupa por
grado ANTES que por receta**: la receta es como se llama el procedimiento, el
grado es que se le hizo al cafe, y es lo segundo lo que el dueno compara.

**Salen de catalogos que ya existian** —`grado_proceso` (Natural, Washed, Semi
Wash 50/75%, Honey) y `estado_cereza` (entera, despulpada)— definidos en
`lib/research/catalogs.ts`. Nada de vocabulario nuevo. Y **la FK sola no basta**:
un valor de otro catalogo es una FK valida y dejaria la columna contaminada, asi
que el servicio comprueba a que catalogo pertenece — el mismo error que ya se
cazo en las intervenciones.

**Nacieron anulables y duraron un dia asi**: el 2026-09-08 pasaron a
obligatorias — ver la entrada de arriba. `intent` sigue llevando lo que estas
dos no capturan: el peso, las horas, la atmosfera.

**Y una fragilidad MIA que la fila patron destapo.** Corriendo los dos archivos
de prueba a la vez, uno fallaba SIN mutacion: mi asercion buscaba la receta por
`includes("Honey 48h")` y el otro archivo crea una receta homonima — `find`
devolvia la suya, sin puntajes, y el fallo se leia como del producto. Atado al
`RUN` y comprobado cinco corridas seguidas con 0 caidos. Es la forma del «control
positivo por titulo» que ya esta escrita en `CLAUDE.md`, y cai igual.

### 2026-09-07 · Un borrado sin filtro en la base compartida, y su reparación

**Escribí un `afterAll` sin `assertDefinedWhere`**, que es el idioma del resto de
la suite. Un valor de enum mal puesto rompió el `beforeAll`, las variables
quedaron sin asignar, y **Prisma descarta en silencio las claves `undefined`**:
cada `deleteMany({ where: { id: colonyId } })` se volvió un borrado **sin
filtro** sobre la base del puerto 55433. Se perdieron 1 colmena, 1 colonia y 1
evento de colonia. **Producción intacta** — la corrida sólo apuntó a
`127.0.0.1`.

**La causa ya no existe** (PR #233), y medido con control positivo que el mío era
el **único** de los 69 archivos con `afterAll` que no usaba el ayudante.

**La reparación esperó a que no hubiera trabajo ajeno en juego.** La base tenía
aplicada una migración que no estaba en ninguna rama publicada —trabajo sin
commitear de otra sesión— y un reset se la habría llevado. Se restauró cuando
llegó a `main` con el PR #238. Verificado contra el `rowcounts.tsv` del propio
backup: las seis tablas patrón casan, 1/1/1 incluidas, y la suite pasa
**1477/1477**.

**Y una trampa que costó un paso y quedó escrita en `CLAUDE.md`:** `test:db
reset` dice «Test database ready» y deja el esquema en la foto del backup —
seis migraciones por detrás de `main` ese día. Hay que aplicar `migrate deploy`
después, y no fiarse del «ready».

### 2026-09-08 · Grado y estado de cereza, obligatorios

Correccion de Daniel un dia despues de nacer anulables: **un cafe es natural,
lavado o honey; no es «ninguno»**. Las dos columnas pasan a `NOT NULL`
(`20260908070000`), el servicio las exige con una frase legible antes de que la
FK reviente, y los dos desplegables llevan `required` **con la primera opcion
vacia** — preseleccionar «Natural» pondria un grado que nadie declaro, que es
justo lo que la columna obligatoria pretende impedir. `process_recipe_version_id`
**sigue anulable a proposito**: la receta puede no estar definida, el grado no.

**La migracion cuenta antes de exigir.** Un `DO $` con `RAISE EXCEPTION` que
nombra cuantas filas violarian el `NOT NULL`; produccion tenia **cero** procesos,
asi que no migra ningun dato. Medido antes de escribirla, no supuesto.

**Y el primer test del `NOT NULL` no medía el `NOT NULL`.** Con la columna en
`null`, el cliente de Prisma rechaza la llamada el mismo —«Argument `lot` is
missing»— sin hablar con Postgres: habria pasado igual con la columna anulable.
Reescrito con `INSERT` crudo, con su control positivo al lado (el mismo `INSERT`
con las dos columnas entra). Flip-test del `NOT NULL` hecho contra la tabla real
dentro de una transaccion revertida: sin mutar revienta por `NOT NULL`, con el
`NOT NULL` quitado la fila entra, y tras el rollback `is_nullable=NO`.

### 2026-09-08 · La puerta del informe de un Q-grader, y dos huecos que destapó

El servicio existía desde el PR #219 y **la unica forma de usarlo era la
terminal**, con un JSON escrito a mano. Ahora `/sensory/external-report`, en dos
pasos: primero el protocolo —de el salen los atributos, y sus NOMBRES son la
autoridad con la que el servicio casa—, despues la transcripcion. Ninguno se
teclea: un nombre tecleado es como un informe entraria a medias.

**Hueco 1, y no era inocuo.** `InformeExterno` no tenia donde traer las tazas no
uniformes ni las defectuosas, asi que el resolver las daba por 0: un informe CVA
que declara dos tazas no uniformes se guardaba **4 puntos por encima** de lo que
dice el papel, en silencio. La cata interna si las pasaba desde siempre
(`app/actions/sensory.ts`) — era este camino, el del trabajo que se paga, el que
las perdia. Control positivo al lado, y por eso se vio.

**Hueco 2, y lo destapo la suite, no una lectura.** El lector listaba a todas las
personas con `leerCertificaciones`, que es estricto a proposito. En la base hay
una fila con `date_earned: null`, y esa sola fila **dejaba la pantalla entera sin
abrirse**: nadie podia registrar ningun informe por culpa de un dato ajeno. Ahora
degrada a esa persona —sale sin credencial, no se le afirma una que no se pudo
leer— como ya hacia `scripts/add-evaluator.ts`, que se lo encontro antes.

**Y una verificacion mia que no verificaba nada.** El 307 de la ruta nueva sin
sesion parecia probar que la pagina existe; el control negativo dice que **una
ruta inexistente da 307 igual**, porque el middleware redirige todo. Lo que si lo
prueba es el manifiesto de `next build`, que la nombra. Queda **sin verificar en
pantalla** hasta que alguien con sesion la abra.

### 2026-09-08 · La fecha de una credencial pasa a ser opcional

Kurt Ngo esta en la base como Q de CQI con `date_earned: null` porque **nadie
supo la fecha** — la instruccion del A7 decia «registra la credencial», y quien
la registro puso nulos donde no sabia. Exigir la fecha no produjo una fila con
fecha: produjo una que **ni se podia leer**, y que llego a dejar la pantalla de
informes externos sin abrirse. Decision de Daniel: opcional, como ya lo era
`certificate_reference` y por el mismo argumento que el modulo ya tenia escrito.

**No hizo falta escribir NADA en la base.** El arreglo es el validador: en
cuanto acepta la fila, se lee sola. Comprobado contra la fila real de la copia
restaurada — `{"date_earned":null,…}` entra y sale como
`{certifying_body:"CQI",certification_name:"Q Grader"}`, sin fecha inventada, y
la pantalla la ofrece como «Kurt Ngo · Q Grader (CQI)».

**Una fila sin fecha es un marcador, y el dueño dijo quien lo completa:** Kurt,
cuando entre con su cuenta, subiendo el escaneo. Por eso `agregarCertificacion`
**completa** el marcador en vez de duplicarlo cuando llega la misma credencial
con fecha — y nunca pisa un valor que ya estuviera. Sin eso, el dia que la
confirmara habria dos «Q Grader (CQI)» en su ficha.

**Y un guardia mio de ayer que este cambio dejo midiendo nada.** El test «una
certificacion ilegible no tumba la lista» usaba justo la fila de Kurt: al
volverse legible, pasaba por razones equivocadas. Recolocado sobre una que
sigue siendo ilegible —sin `certification_name` no hay credencial que afirmar—
y re-flipeado para verlo caer por su nombre otra vez.

### 2026-09-08 · A9 completo: la captura de campo del apiario

Trece tickets del 7 y 8 de septiembre, del PR #214 al #245. El apiario pasa a funcionar como la
superficie de café: **la visita es un hecho**, no un adorno.

`FieldSession` extendida en vez de entidad nueva (D1), y la compuerta resuelve
por `Location.locationType` — nunca por un parámetro que elija quien llama.
Adjuntar es implícito y estrecho: mismo sitio, sin cerrar, del mismo operador.
Las dos colas offline se colapsaron en una que empuja **por lotes**. Cierre
auditado con ventana de 48 h, reporte congelado que se abre con enlace que
caduca y se revoca, etiquetas QR imprimibles sin red, pantalla de sitios con
alertas ordenada por urgencia, origen de colonia agrupable, compromiso de
polinización con su cociente, y bitácora que espeja `AuditEvent`.

**Cuatro veces la medición cambió el diseño**, y son lo que hay que recordar:

1. **El ticket A9.8 decía «esquema: no» y era falso.** Los tres alertas
   críticos del Anexo C no tenían columna detrás de ninguno. Entraron tres.
2. **La fila del ticket A9.10 nombraba la columna equivocada.** `originType` ya
   era enum y ya agrupaba; lo que no agrupa es `originNote`, texto libre.
3. **El mapa no está bloqueado por Mapbox.** De 24 ubicaciones, **0 tenían
   coordenadas**: no había qué pintar. Por eso #242 hace que un sitio las
   aprenda de la primera visita que se abre ahí.
4. **WhatsApp no alcanza a nadie.** De 19 personas, **0 tienen teléfono** y 3
   tienen correo. Por eso A9.11 distingue querer un canal de poder recibirlo.

**Y un hallazgo que sigue abierto: nadie puede registrar que una colonia
murió.** Ningún servicio cambia `Colony.status` — se crea `active` y no hay
camino de código que la marque muerta o absconded. Consecuencias medidas: la
bitácora no puede espejar el hecho más caro del apiario, y el conteo del
sistema **sólo puede subir**, así que su divergencia con el conteo declarado en
la visita es estructural y no deriva. La alerta de pérdida que A9.8 sí da
compara dos conteos *declarados*.

**Lo que queda de A9:** el mapa, que ahora sólo espera la decisión de Mapbox
(servicio de pago, token). Los cuatro adaptadores de mensajería siguen fuera de
alcance por D10.

### 2026-09-08 · «Batches» contra «Lotes»: el menú mandaba a la pantalla ajena

En español el menu ofrecia **«Lotes» para `/plots`** —parcelas de terreno— y
**«Batches» para `/lots`** —lotes de cafe—. Quien buscara sus lotes de cafe
pulsaba «Lotes» y veia terreno. Estaba anotado desde el 2026-09-05, del dia que
alguien uso las pantallas en un movil de verdad.

**La causa estaba en el texto que quedo.** `plotsIntro` decia «Lotes de terreno»:
quien lo escribio uso «lote» para la parcela y, sin palabra libre para el cafe,
tiro del ingles. Y «batch» ya estaba ocupada — `BiocharBatch` y `TreatmentBatch`
son entidades reales del esquema.

**Corregido en los dos sentidos, clave por clave y no con un regex a ciegas.**
El cafe pasa a «Lote»/«Lot» (29 claves en es, 38 en en); el terreno pasa a
«Parcela» (14 claves), palabra que **ya estaba** en el vocabulario —
`sampleTreatmentPlotLabel` decia «Parcela de tratamiento»—. Se dejaron intactas
las que son batches de verdad: biochar, tratamiento, y el n.º de lote del envase
del fabricante. **Ingles ya era correcto para el terreno**, y eso sirvio de
control: `densityMissingArea` y `soilNoProfiles` decian «plot» alli y «lote»
aqui, que es como se cazaron las dos ultimas.

**Y lo que esto enseña de la suite:** las 1531 pruebas pasaban con el fallo
dentro y habrian pasado con el vuelto a poner. Nadie miraba esas cadenas. Queda
`tests/ui/vocabularioDelMenu.test.ts`, que dice en su cabecera **lo que no
prueba**: que las etiquetas sean las correctas. Eso lo dijo una persona usando
la aplicacion, que es como se encontro.

### 2026-09-08 · `/plots` deja de recitar lo que falta ocho veces

Medido sobre la finca real: **8 parcelas, 0 con área y 0 con una sola condición
registrada**. Asi que la pagina eran ocho tarjetas identicas salvo el nombre,
cada una repitiendo «Área: Sin registrar» y la frase entera de «aun no hay
condiciones registradas». Eso es lo que el dueno vio como 2,6 pantallas de
scroll el 2026-09-05.

**Lo que falta se cuenta una vez, arriba, en numeros** — el mismo criterio que
`/reports/proceso`: sin el recuento, ocho tarjetas vacias se leen como «no hay
nada que ver» en vez de «falta registrarlo todo». En la tarjeta, el area solo se
pinta si la hay, y el hueco de condiciones son dos palabras en vez de una frase.
La frase larga sigue en la ficha de la parcela, que es donde se rellena.

**Lo que NO cambia, y por que.** «Cero botones de accion» sigue abierto en §3:
las acciones existen, ocho formularios, pero **un nivel abajo** — en
`/plots/[id]`. Que subir a la lista es decision de producto y no la tomo yo.

**Un hallazgo de paso, y uno que ya no lo es.** Las parcelas **se llaman «Lote 1
— Finca Rosina»** en los datos: el menu dice «Parcelas» desde hoy y dentro
pondra «Lote». Renombrar datos de la finca es del dueno; queda dicho, no tocado.

Y el otro **lo arreglo otra sesion mientras yo trabajaba**: `CLAUDE.md` mandaba
correr `rutas-protegidas.mjs`, que no existe desde el PR #60. Lo encontre y lo
corregi por mi cuenta; cuando fui a fusionar, el PR #249 ya lo habia hecho — con
mejor comentario que el mio, ademas. Se descarto lo mio entero y se tomo el suyo.
**Dos sesiones tropezando con la misma linea el mismo dia** dice algo del coste
de una instruccion vieja, y esa es la parte que vale la pena anotar.

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

### 2026-09-09 · Un formulario enseñaba «measured_fact» a un apicultor

`TreatmentBatchForm` pintaba el **valor crudo del enum** en dos desplegables:
en una interfaz en español se leía «measured_fact» y «verified_with_limitation».
No revienta, no avisa — se lee mal, que es la misma familia que «Batches» contra
«Lotes» y se encuentra igual: mirando, no ejecutando pruebas.

**Medido sobre la población entera, no sobre una sospecha:** de **25**
desplegables cuya clave es el propio valor, **22 traducían y 3 no**, los tres en
ese archivo. Uno de los tres resultó **correcto** y se quedó como está, con su
razón escrita al lado: recorre `variable.enumValues`, que no es un enum de
Prisma sino la lista que el autor del protocolo congeló en esa versión —«río»,
«quebrada»—; son datos en el idioma de quien los declaró y no hay clave posible.

**Y arrastraba un segundo fallo que no se veía justamente porque no se usaba:**
ese formulario ofrece `manufacturer_specification` e `hypothesis`, **dos valores
sin etiqueta en ningún idioma**. Ahora la tienen.

**Tres guardias nuevos** en `tests/ui/valoresEnumerados.test.ts`, y el tercero
es el que más falta hacía: la excepción declarada **tiene que seguir aplicando a
algo**, o se quita. Una excepción huérfana envejece en silencio y enseña a leer
la lista por encima. Flip-test: cinco mutaciones, cada una tira la suya por su
nombre.

**Y una cobertura que era accidental, destapada al fusionar.** Entre medias entró
el PR #255, que sacó las listas de procedencia de los ocho formularios a
`lib/traceability/procedencia.ts`. Predije que eso dejaría este guardia mirando a
la nada; **era falso** y lo dijo la medición: seguía en verde porque
`TreatmentBatchForm` conserva las suyas en casa, y sus siete valores resultan ser
un superconjunto de los cinco del módulo. Verde por coincidencia, no por
cobertura: un sexto valor en el módulo habría entrado sin etiqueta sin que nada
fallara. El guardia lee ahora también ese módulo, y el flip-test lo demuestra
metiéndole `recommendation` —un valor del enum sin etiqueta— y viéndolo caer.

**Lo que se señala y NO se tocó, en ese mismo archivo:** un `" (origen
desconocido)"` en español metido a mano en el código, y dos opciones `true` /
`false` sin traducir. Son la misma familia y otro arreglo.

### 2026-09-10 · El informe de la visita existía y no había puerta

Recorriendo el flujo del apicultor **pantalla por pantalla** —no por servicio—
aparecio que `emitirReporteDeVisita` **no lo llamaba nadie**. La pagina del
informe lee lo congelado y hace `notFound()` si no hay nada, asi que cerrar una
visita y pulsar «informe» daba **404**. Igual `publicarReporteConEnlace`,
`abrirReportePorEnlace` y `revocarEnlace`: los cuatro servicios existian desde
A9.6, con sus pruebas, y **ninguna pantalla los tocaba**.

Es la tercera vez esta semana con la misma forma —el apiario, el informe
externo, esto—: **el servicio hecho y la puerta sin poner**. El sintoma no es un
error; es que no hay por donde.

**Lo que entra:** emitir el informe desde la visita cerrada; publicar el enlace
para un supervisor, que **se enseña una sola vez** porque la base guarda el
token hasheado; `/informe/[token]`, **publica y sin sesion** —el token ES la
autorizacion—; y la lista de enlaces entregados con su boton de cortar.

**Revocar hacia falta o el enlace era un viaje de ida.** `revocarEnlace` pedia
el id de la publicacion y nada lo devolvia a una pantalla. Ahora
`enlacesPublicadosDeVisita` lo da — **sin el token, ni hasheado**: la pantalla
revoca por id, y devolver la cerradura la enseñaria sin razon.

**Lo que NO hizo falta probar de nuevo:** el ciclo del enlace ya estaba cubierto
—token inventado, caducado, revocado, sin emitir, y RBAC en publicar y revocar—.
Lo nuevo es el lector, con su puerta y su flip.

### 2026-09-10 · «Cierra la visita» justo despues de cerrarla

Barriendo el repositorio por el patron que ya mordio dos veces esta semana
—servicio hecho, puerta sin poner— salio **`completarVisita`, sin un solo
llamador**. Es la unica funcion que pone `status: "completed"`, y
`emitirReporteDeVisita` exige exactamente eso.

**El boton «Cerrar jornada» llama a `endFieldSession`, que pone `endedAt` y
nada mas.** Asi que el boton de emitir —fusionado hace una hora— contestaba
«cierra la visita» **justo despues de cerrarla**, sin salida desde la
aplicacion. Son dos hechos distintos a proposito (A9.1 D4): `endedAt` es cuando
se salio del sitio; `completedAt`, cuando se termino de escribir. Faltaba el
paso de en medio.

**Y mi propia sonda de ayer no lo vio porque llamaba a `completarVisita`
directamente** — el servicio que la pantalla NO usa. Recorrer el flujo por
servicios y decir «cierra» es la misma clase de error que medir la coleccion
equivocada: impecable sobre lo que no era.

**Lo que entra:** `/field-sessions/[id]` ofrece **Completar visita** mientras
esta en borrador —con cuando toca volver y colonias vivas, que solo sabe quien
cierra— y el boton de emitir **solo aparece despues**, en vez de ofrecerse para
fallar.

**El barrido, en numeros:** de 404 funciones que exporta `lib/`, **50 no tienen
ningun llamador** en `app/`, `scripts/` ni otro `lib/`, ni dentro de su propio
archivo. La primera cuenta dio 85 y era falsa: contaba como huerfanas las que se
usan dentro de su archivo. La lista queda en §3 para mirarla con calma.

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

### 2026-09-11 · «111 · green_coffee» no dice qué café vas a catar

Daniel, probando: «samples in session just give me one bulk option for all, says
111 - green coffee» y «i think there is a mistake trying to select which
coffee». **Ni el selector ni los códigos ciegos estaban mal.** En toda la base
hay **una** muestra —código `111`, tipo `green_coffee`, sin descripción—, así
que ofrecía lo único que existe, y «Muestra A = 111» era el código ciego
funcionando. Lo que fallaba: la etiqueta no dice **de qué café** es.

`Sample.sourceLotId` lo sabe desde que existe `createSampleFromLot`. La consulta
no lo leía. Ahora la lista trae **código · batch · finca · grado del proceso**,
con el grado del proceso más reciente del batch —no el primero—. Dos pruebas, y
la segunda es la que hace valer a la primera: una muestra **sin** batch tiene que
salir en `null`, porque si `lotCode` saliera siempre relleno la primera no
demostraría que lee el lote.

**Lo que se midió de camino y NO se tocó**, porque son decisiones del dueño:

- **El SCA-103 contradice «no cateamos verde».** Su §2: «diseñado para la
  evaluación descriptiva de **café verde arábica**, preparado y catado según el
  **SCA-102**». El verde no va a la taza, pero es el sujeto al que el CVA le
  cuelga la evaluación. Lo que falta es el 102 en medio — y ese PDF **no está**
  entre los siete que hay.
- **Ya se pueden leer los PDF cifrados** (autorización de Daniel): `qlmanage` y
  `pdfjs-dist` en carpeta temporal, sin forzar nada. El 103 leído entero: siete
  escalas 0-15 y CATA con topes (5 olfativos, 2 sabores, 2 de cuerpo).
- **El protocolo no guarda la preparación.** Los 12-13 g / 200 ml / 93-94 °C
  caben hoy sólo en `preparationMethod`, texto libre. Dos catas del mismo
  protocolo pueden no ser comparables y nada lo sabe.
- **Un tueste no produce muestra de cata.** Hay pantalla de tueste y pantalla de
  muestra-desde-batch, y **ningún puente**: la cadena `batch → tueste → muestra`
  de §23 se corta en medio.

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

---

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

### 2026-09-11 · La medición pedía escribir a mano lo que ya sabía

Daniel, usándolo: «there is a field for unit and also for variable and it could
be redundant… **its like you are trying to make me work more**». Tenía razón, y
medía peor de lo que sonaba: la unidad era una **caja de TEXTO LIBRE
obligatoria**, y de las seis variables del formulario **cinco admiten una sola
unidad**. Los dos únicos desenlaces eran «acertaste y sobraba» o «fallaste y te
bloquea».

**Lo que entra, tres decisiones suyas en fila:** la unidad se **deriva** de la
variable —una sola, campo oculto; varias, desplegable con ésas y sólo ésas, que
en la práctica es sólo temperatura C/F—; la **procedencia** sale del camino con
`measured_fact` fijo, porque una lectura de instrumento es eso y el día que
entre un sensor lo pondrá ese camino, no un dedo; y entra **«cuándo se midió»**,
que no existía — la acción ponía `new Date()`, la hora de GUARDAR, así que medir
a las 7 y escribirlo a las 9 quedaba fechado a las 9.

**La hora va por `fechaLocal`, el ayudante que ya existía.** Escribí un
`parseLocalDateTime` a mano y lo sustituí al ver que el archivo ya lo envolvía:
dos formas de hacer lo mismo es cómo se desincronizan.

**Tres guardias del repositorio me pararon antes que Daniel**, y los tres
tenían razón: el inventario de acceso con sus cifras viejas, la declaración de
`dependen_del_llamador`, y **el de valores crudos que escribí yo hace dos días**
— cazó el desplegable de unidades. La respuesta correcta no era traducirlas:
`C`, `pH`, `mg/kg` son símbolos internacionales, iguales en los dos idiomas, y
una clave `unidad_mg/kg` crearía un sitio donde desincronizarse con el registro.
Va como **excepción declarada con su razón**, que es el mecanismo que ese mismo
guardia ofrece — y que tiene su prueba: una excepción que deja de aplicar falla.

**Lo que NO se tocó, a propósito:** el formulario de **corrección** y el de
**laboratorio** llevan el mismo campo de unidad. En el de laboratorio la
elección `ppm`/`%` **sí vale** —un laboratorio reporta en una y otro en otra— así
que quitarla ahí sería el error contrario.

---

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

---

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

---

### 2026-09-11 · La cereza cosechada deja de ser una caja de texto

Daniel: «condition field should be fixed options that can be selected», y antes
«register details and **vital statistics** of harvested cherries».

**La medición previa es la que justifica el cambio:** `condition` tenía **29 de
33** filas rellenas y **las 29 decían exactamente «Ripe Cherry»**. Una caja de
texto libre acaba siendo un valor que nadie varía y del que después no se puede
contar nada — nadie podía preguntar cuántas cosechas entraron pintonas.

**El vocabulario ya estaba escrito y sin puerta:** siete catálogos de cereza, 35
valores, **cero líneas de código leyéndolos**. Daniel eligió tres —color
(la escala de madurez), defectos y limpieza— por ser los que deciden qué se
puede hacer con esa cereza. Los otros cuatro entran sin migración el día que los
use: son filas de catálogo.

**Columnas y no tabla de atributos**, al revés que las causas de pérdida de
colonia: allí el dueño dijo «múltiples razones»; aquí cada eje tiene UN valor —
una cereza no es roja y verde a la vez.

**Lo viejo NO se traduce y `condition` NO se borra.** Mapear «Ripe Cherry» a
`rojo` sería inferir un hecho y guardarlo como tal. Las 29 conservan su prosa.
`ripenessNotes` **sí** se borró: contada antes, **0 filas**, y la migración
aborta si algún día esa cuenta no da cero.

**El cultivar no se pregunta, y esto cambió una decisión de Daniel.** Él pidió
preguntarlo; midiendo salió que **las cuatro siembras ya lo tienen** y que el
formulario de parcelas ya enlaza la siembra. Preguntarlo crearía una segunda
fuente que puede contradecir a la primera. Decidió enseñarlo — queda pendiente
de construir, junto con la sugerencia del código de lote.

**Recepción sigue con texto libre**: es OTRA tabla con su propia columna y
necesita su propia migración. Declarado en el código, no arreglado a medias.

**Dos tropiezos míos, los dos cazados por herramientas y no por mí:** el
compilador paró una sustitución que alcanzó también a la acción de recepción; y
`assertDefinedWhere` paró un `afterAll` cuyo fixture había reventado porque usé
`perl` sobre una plantilla de JavaScript y **se comió el `${RUN}`** —perl lo leyó
como variable suya—. Para editar código con interpolación, no perl.

---

**Sexto archivado, 2026-09-13**, con el estado en 392/400 líneas (98 %) y luego
en 425, por encima del techo. **Tres** entradas: las dos del 2026-09-11 y la del
2026-09-12. **Lo hicieron dos sesiones a la
vez** —el #289 y el #287— y de ahí que salgan juntas: la ronda se descubrió al
rebasar, no al planearla. El guion `apiary:load-protocol` y el conteo de varroa
existen y sus pruebas los vigilan; esto es su registro, no su control.

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

---

### 2026-09-11 · Contar varroa existe, se anota sin señal, y la serie dice si el tratamiento sirvió

El Anexo B §2.5 pedía cuatro campos y marcaba los cuatro como **no existentes**.
Las tres decisiones están en **ADR-116** y salen del material del dueño, no del
gusto: fila propia porque *«`Measurement` guarda una variable por fila»* y 9
ácaros no dicen nada sin las 300 abejas; el tratamiento que un conteo evalúa es
una **relación opcional** —*«entre dos visitas, no un campo»*— y tiene que ser de
la **misma colonia**; y el porcentaje **no se guarda**, con muestra cero **lanza**
en vez de devolver cero, porque cero afirmaría «no hay infestación» cuando lo que
hay es «no se sabe».

**UN DEFECTO PROPIO QUE ESTO DESTAPÓ.** El parseo de
`/api/v1/sync/field-events` **no reconocía `colony_end`**, cerrado el día antes:
caía al camino de `FieldEvent`, devolvía **400 del lote entero**, y como el
cliente trata eso como fallo de transporte, **un solo borrador de fin de colonia
dejaba la cola del apiario bloqueada**, él y todo lo que tuviera detrás. Dos
pruebas en verde no podían verlo: importar la ruta arrastra `next-auth`, que
vitest no resuelve, **así que la pieza que decide qué tipos existen no se podía
llamar**. Salió a `lib/sync/parsearMutaciones.ts`, y su prueba toma la lista de
tipos **del cliente**: un quinto tipo sin rama cae por su nombre.

**Lo que NO prueba:** nadie ha contado varroa todavía, y la pantalla no se ha
visto en un teléfono. Escrito en la cabecera de la prueba para que nadie lo cuente
dos veces.

---

### 2026-09-12 · El estado de la colonia existe, y un aviso no se apaga porque nadie mirase

El Anexo B §2.2 pedía siete campos con su motivo al lado y **ninguno existía**. El
vocabulario sale de `protocolos/apiario-campo-v1.json`, que el dueño escribió y que
**no se edita**: su cabecera lo prohíbe, así que la v2 que hace falta —con los tres
ítems que le faltan— queda en `PENDING_IMPLEMENTATIONS/010`.

**Decisión del dueño (2026-09-12):** el **nivel** de una reserva y el **sitio**
donde está son dos columnas. El Anexo los ponía en una lista de cuatro —«alta,
media, baja, junto a la cría»— pero así no se puede decir «alta Y junto a la cría»
y el reporte de reservas bajas tendría que decidir si cuenta esa cuarta. ADR-117.

**La regla que decide si el aviso de enjambrazón sirve:** se toma la última
inspección **que miró**, no la última inspección. Una visita que pasó rápido y no
abrió la caja deja `null`, y leer eso como «ya no hay» apagaría el aviso **justo en
el caso que pierde la colonia**. Para apagarlo hay que mirar y decir «no hay» — que
por eso es un valor del enum y no la ausencia de valor.

**Un defecto propio, invisible para su propio guardia.**
`booleanos-de-tres-estados` prohíbe preguntar un `Boolean?` con una casilla, pero
buscaba `name="<campo>"` — la forma de un formulario de servidor. **Los de campo
guardan en IndexedDB y se atan con `checked={campo}`**, así que no los veía, y
`queenSighted` tenía el defecto exacto que ese archivo describe: sin marcar guardaba
«miré y no estaba» cuando lo cierto era «nadie buscó». Medido: era el único caso.
Cinco flip-tests; el del guardia cae por su **aserción**, no sólo por su nombre.

**Lo que NO prueba:** nadie ha registrado un estado de colonia. Una inspección en
la copia local, con las diez columnas vacías.

---

### 2026-09-13 · Una receta ya puede decir cada cuánto medir y cuánto debe durar

Auditando la pantalla de lotes, Daniel decidió que la urgencia —«a cuál le toca
algo ahora»— **sale de la receta**. No se podía calcular: `ProcessTarget` decía a
qué valores llegar y **ningún ritmo**.

**Tres de las cuatro cosas que describió ya existían**, y por eso el cambio es
pequeño. Su frase: «una receta requiere un ritmo de medición y tiene un indicador
target de dónde comenzar y terminar, y un +/- rango». `targetValue` es el
objetivo, `minValue`/`maxValue` el rango, y `moment` (initial|during|final)
distingue el inicio del final con una fila cada uno. **Faltaba sólo el ritmo.**

**Dos números y no uno:** `every_hours` dice si el batch te **debe una lectura**;
`expected_hours` dice si **va tarde**. Un batch puede ir en hora y deberte una
medición, y al revés. Meterlos en una columna obligaría a elegir qué pregunta se
puede contestar.

**`null` no es `false`, y ahí está el diseño.** `estadoDeRitmo` devuelve
`demora: true | false | null` — «no se sabe» y «va bien» son hechos distintos, y
confundirlos haría que un lote sin receta pareciera puntual. Un batch sin ritmo
declarado puntúa **0** en urgencia: no se le inventa la que la receta no declara.

**Una regla que se rechaza en vez de guardarse:** `every_hours` sólo tiene
sentido con `moment: during`. Un objetivo inicial ocurre una vez, y pedirle «cada
6 h» es una contradicción. Vive en `validateTargets` —donde ADR-102 puso todas
las reglas juntas— y **no en la base**: se dice en vez de llamarlo estructural.

**Doce pruebas con entrada hostil**, incluidas fase y lectura en el futuro, que
se rechazan porque devolver horas negativas colaría el lote al principio de la
cola como «lo más reciente».

**Lo que NO hace:** ninguna pantalla lo usa todavía. El ritmo se puede declarar y
la urgencia se puede calcular; ordenar la lista es el paso siguiente.

**Y el fallo de verdad lo encontró Codex, no nosotros.** Hay **dos** caminos que
escriben objetivos —crear receta y publicar una **versión**— y sólo se cerró uno:
`createRecipeVersion` no persistía `everyHours` ni aceptaba `expectedHours`, así
que **publicar la v2 le borraba el ritmo a la receta en silencio**. Pérdida de
dato sin aviso, en trazabilidad. El patrón —añadir un campo y cerrar una sola de
sus puertas— se cometió tres veces el mismo día.

Por eso queda `tests/arquitectura/campos-con-dos-puertas.test.ts`: lee los campos
que `CreateRecipeInput` declara y exige que cada uno aparezca en el parseo, en
**los dos** servicios y en **los dos** formularios. Lleva control positivo de su
propio parseo —afirma cuántos campos encontró— porque un guardia que lee la
fuente con regex se queda ciego en silencio cuando el archivo cambia de forma.
Flip-test de las tres: reintroducir el fallo de Codex, quitar el campo del
formulario de versión y romper el contrato hacen caer **cada uno a su prueba por
nombre**, las tres mutaciones compilando.

---

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

---

**Séptimo archivado, 2026-09-13**, con el estado por encima de 400. La entrada
más vieja que quedaba — y **otra vez dos sesiones la archivaron a la vez**, el
#295 y ésta. Su trabajo vive en el árbol y sus pruebas lo vigilan.

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

---

**Octavo archivado, 2026-09-13.** El estado volvió a pasar de 400 al rebasar
sobre el #295, que había entregado a la vez. Su trabajo vive en el árbol.

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

---

**Noveno archivado, 2026-09-13.** El asiento de Brix volvió a pasar el techo.
Su trabajo vive en el árbol y sus pruebas lo vigilan.
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

---

**Décimo archivado, 2026-09-13.** El asiento del balance de masas pasó el techo —
y **por cuarta vez hoy dos sesiones archivaron la misma entrada a la vez**, ésta
y el #299. Su trabajo vive en el árbol y sus pruebas lo vigilan.

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


### 2026-09-13 · La especificación v3.0 del beneficio entra, y su contrato empieza a contar

Daniel encargó fuera una revisión del material de proceso y llegó `nn-spec` v3.0:
nueve documentos normativos y **47 criterios ejecutables**, diez de ellos de
regresión. Encontró por su cuenta los mismos defectos que se habían señalado aquí
horas antes —la banda de pH 3,5–3,8 muda, el `raise` que se niega a registrar una
lectura real, la tolerancia de 50 g— y va mucho más lejos: calibración, máquina
de estados, secado, histéresis y perfiles por protocolo.

**Tres cosas del paquete NO se hicieron, y están dichas en `docs/beneficio/README.md`:**
su `CLAUDE.md` **no** reemplaza al de la raíz —el nuestro gobierna toda la
plataforma, el suyo un módulo—; no se implementa en **Python** —0 archivos `.py`
contra 467 `.ts`, y su propio §1 ya contempla TypeScript—; y su `LOT_ID`
inventado no sustituye al convenio real de Daniel, `PE-90` → `PE-90-A`.

**El tablero empieza vacío y a la vista.** `tests/beneficio/vectores.test.ts` lee
los 47 y los saca como `todo` hasta que exista el motor que los conteste: **3
pasando, 47 pendientes**. Verde mentiría y rojo permanente enseña a ignorar la
compuerta; `todo` sale contado y aparte, que es lo que es. El inventario de
motores se declara a mano para que añadir uno se lea en el diff.

**Media especificación ya estaba construida aquí** —`occurredAt`, correcciones
que superseden, calibración, UTC con Panamá sin DST, procedencia, balance de
masas, umbrales en la receta—. Lo que falta de verdad son tres piezas:
`sample_point`, la histéresis de confirmación, y la derivada de estancamiento.

---

**Undécimo archivado, 2026-09-14.** El asiento del secado pasó el techo.

### 2026-09-13 · El motor de pH: 13 de los 47 criterios ya se comprueban

`lib/beneficio/ph.ts` porta el `PHMonitor` de `docs/beneficio/10`, y
`perfiles.ts` trae los cinco protocolos de §8. El tablero pasa de **3 + 47
pendientes a 16 + 34**.

**Ningún umbral vive en la lógica**: todos salen de `ProtocolProfile`, y
`PERFILES` es un `Record` total, así que el compilador obliga a declarar cada
perfil nuevo entero. Siguen `[PROVISIONAL]` hasta que Daniel los revise — P-F.

**Siete flip-tests, uno por defecto real de la v2.5**, todos compilando y cada
uno cayendo por su propio vector: el `raise` que derribaba la ingesta (PH-007),
la banda 3,5–3,8 muda (PH-003), la frontera que ponía 4,50 en dos bandas
(PH-001), la meseta cinética (PH-009), la supresión del reposo frío de CryoBloom
(PH-010), la guarda de cero (PH-012) y la histéresis (PH-004). **El cuarto hubo
que rehacerlo**: la primera versión no compilaba, y una mutación que no compila
se lee igual que un guardia que funciona.

### 2026-09-14 · La caja se declara, y con eso «cuadros cubiertos» ya se puede comparar

El Anexo B §2.4 son seis filas y ninguna existía. **La elegí antes que las otras dos
por una razón medible:** `framesPerBox` es el **denominador** de `beeCoveredFrames`,
que se construyó anteayer. El Anexo pide ese campo porque es «comparable entre visitas
y entre sitios» — y **no lo era**. Terminar lo que quedó a medias vale más que añadir
campos al lado. ADR-122.

**Cambiar la caja NO es corregir, así que no pide razón.** Es ADR-121 al revés: añadir
un alza es un hecho del mundo y el cambio **es** el evento. Con su límite dicho: el
rastro no puede distinguir «le puse un alza» de «me equivoqué al teclear», y la razón
opcional es cómo se dice cuál fue.

**Sin denominador la ocupación es `null` y se dice.** Devolver 0 sería falso; **suponer
diez cuadros por caja sería peor**, porque haría comparables cosas que no lo son sin que
nadie viera la suposición — el flip-test lo deja en una línea: `expected 30 to be null`.
Y no se recorta al 100 %: doce de diez pasa de verdad.

**`feederType` reusa `FeedingMethod`** porque son las mismas cosas físicas. Caso
**opuesto** a ADR-114 y ADR-119, donde las listas se separaron porque los significados
diferían; aquí coinciden y dos enums serían dos sitios donde añadir el siguiente.

**Y el hueco que cerró de paso:** no existía ninguna función para actualizar una
colmena. Aquí no era un accidente — la configuración cambia por definición. El
historial, otra vez, no hubo que construirlo: `leerEnmiendas` lee cualquier entidad por
su tipo.


### 2026-09-13 · El Anexo E entra, y dos de los nueve «vacíos» eran respuestas

El dueño entregó `pantallas-captura-apicola.md`. Queda como
`48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md` y **se cruzó contra el código antes de
construir nada** (ADR-124, PR #296). Once afirmaciones medidas: tres salen a favor del
código —el orden por urgencia ya existe, la jornada sin cerrar **sí** se persigue a las
72 h, y las ayudas de apiario no hablan de suelo— y cuatro a favor del dueño.

**Y una que invierte el hallazgo de la semana:** §8, traslado de colmenas, es el primer
hueco que es de **esquema** y no de pantalla. `Hive.locationId` es un FK escalar sin
modelo de vigencia, así que mover una colmena hoy reescribiría su pasado y
`@@unique([locationId, identifier])` chocaría en destino. Tres ADR seguidos —118, 122,
123— encontraron mecanismos completos sin pantalla; aquí buscar lo mismo sería aplicar
el hallazgo anterior donde no aplica.

**El §6 ya está construido** (ADR-125): el vacío deja de ofrecerse como opción. Nueve
grafías en 22 opciones vacías, y **dos de las nueve no eran vacío** — «No — cuento para
decidir» y el «—» de las causas de pérdida son afirmaciones que guardan `null`.
Colapsarlas a un término las habría borrado, así que `lib/apiary/vacio.ts` declara tres
familias y una lista explícita. Y la mitad que no existía: «Sin registrar» ahora **se
lee**, porque los campos de cierre se enseñaban omitiéndose y «sin cerrar» se leía igual
que «no aplica».

**El guardia se acota a apiario a propósito:** la app entera tiene 89 opciones vacías
con 34 grafías, y uno sobre las 89 no podría pasar hoy. El resto queda inventariado en
ADR-125, no vigilado.

**Su detector tenía un fallo de la clase conocida:** el patrón con cierre se tragaba la
forma autocerrada y reportó **18 violaciones inexistentes**. Falló en rojo, que es la
única razón por la que se vio.

**Y un error propio, corregido el mismo día.** Escribí que sin el «plan de renumeración»
el orden de trabajo no tenía fuente autoritativa, y **le pedí a Daniel un documento que ya
tenía**. La secuencia está en el repositorio: la tabla «Camino crítico» del
`48_A9_CAPTURA_DE_CAMPO_REPORTE.md`, **A9.0 … A9.12** con dependencias, y el Anexo H §5 lo
confirma. Los **trece** tienen ya módulo que los declara, así que la secuencia **está
agotada** — y por eso no ordena el §8 ni el §9: **no están en ella**. Son alcance nuevo, y
la pregunta deja de ser «¿en qué orden?» para ser «¿entran o no?». Del paquete sigue sin
aparecer sólo el «brief del módulo». Y la serie de anexos **salta de E a G**: no hay
Anexo F en `main`.


### 2026-09-13 · Brix: la alerta que estaba documentada y no existía

`lib/beneficio/brix.ts`. El tablero pasa de **16 + 34 a 28 + 22**.

**Aquí vivía el defecto más grave de toda la v2.x**: la alerta de estancamiento
estaba especificada en el documento **y** en su `CLAUDE.md`, y el código **no
tenía ninguna rama que la emitiera**. Una protección documentada que no existe
es peor que no tenerla — quien lee el documento da por hecho que el sistema
avisa.

**Y la que más fácil se implementa mal**, dicho por el propio documento: una
ventana de estancamiento sin lectura comparable **no es evaluable y la
evaluación debe continuar**. Convertirla en estado terminal deja al motor
incapaz de emitir `TERMINATION_READY` en casi cualquier cadencia real.

Las otras cuatro: velocidad en ventana móvil y no promedio de vida —que
enmascara justo la parada que se busca—, mediana de tres **por conteo** contra
el atípico que mandaba el lote a lavado antes de tiempo, guarda de división por
cero, y que la solubilización del mucílago **sube el °Bx legítimamente** en las
primeras horas.

**Seis flip-tests**, todos compilando y cada uno por su vector. Uno hubo que
rehacerlo: no compilaba **y no cayó nada** — una no-mutación.


### 2026-09-14 · La humedad de la miel no estaba «parcial»: estaba escondida

§5 era la última fila del Anexo B sin construir, y **medirla cambió la rebanada**.
«Parcial» no describía un mecanismo a medias: `Measurement` ya admite `lotId`, una cosecha
de apiario **crea** un `Lot`, `PANEL_DEL_SUJETO` no restringe `lotId`, y `LotType` ya
tiene `honey` porque A3 decidió que la miel reusa la maquinaria del lote **sin
modificarla**. **La humedad ya se podía registrar** — lo prueba el test llamando a
`recordMeasurement`, y el control es que mi diff **no toca ni un archivo** de ese camino.

Así que no hay columna de humedad: hay un **lector**. `honeyType` sí es columna, porque es
una clasificación y no una lectura — y dice **«declarada»** porque así lo escribió el
dueño: verificarla es un análisis de polen, no un cambio en ese campo. ADR-123.

**TERCERA vez esta semana con la misma forma:** `coverage_until` existía y nadie lo
escribía (ADR-118); `frames_covered` existía y no era comparable (ADR-122); la humedad
existe y no se ve. **Un mecanismo al que nadie llega se ve igual que uno que no existe** —
y en el Anexo se marca «parcial», que se lee como esquema pendiente. Conclusión
equivocada, y la tercera vez que el trabajo real fue pantalla y no tabla.

**Y el hueco que había que cerrar para que algo se viera:** `harvest.ts` sólo sabía
escribir. La pantalla tenía formulario de cosecha y **no listaba ninguna cosecha**.

**Con esto el Anexo B queda completo.** Lo que sigue son decisiones del dueño —si `cebo`
cuenta como vía que deja material— y el protocolo v2, que ya acumula cinco cosas.


### 2026-09-13 · Balance de masas: tres etapas, no una

`lib/beneficio/balanceDeMasas.ts`. El tablero pasa de **28 + 22 a 41 + 9**.

**El error estructural de la v2.0 era sumar dos dominios.** `pulp_kg` entraba en
la ecuación de cereza entera, y la pulpa es el 38-45 % de la masa de cerezas
**que ya se contaron** en `prime_ripe`. Un registro correcto **fallaba**, y para
que pasara el operador tenía que subdeclarar `prime_ripe` — el numerador del
índice de pureza. **El índice medía cuánto tuvo que mentir el operador.**

Ahora son tres ecuaciones encadenadas y separadas, cada una con su tolerancia
sobre el insumo de **su** etapa. Y un desbalance de campo **nunca lanza**: se
guarda con su discrepancia, porque a las cinco de la mañana bajo lluvia un
rechazo significa que el dato no existe nunca.

**Ocho flip-tests y uno encontró un hueco EN EL CONTRATO.** Confundir el rango
del pergamino con el de la baba —la confusión que el propio documento advierte,
y que su autor cometió al redactar— **pasa los 47 vectores sin que caiga uno**.
MB-013 comprueba el estado y el rendimiento, no la **ausencia** del aviso falso.
Queda cubierto desde fuera en `tests/beneficio/etapas-no-se-confunden.test.ts`,
sin tocar el fichero de vectores.


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

### 2026-09-14 · El emplazamiento temporal, y la primera pregunta histórica del módulo

Cierra el §9 del Anexo E (ADR-130). **Va después del traslado y no antes por una razón:**
«las colmenas que estuvieron» es una pregunta sobre el pasado, y hasta `HivePlacement` el
único camino de una colmena a su apiario decía dónde está **ahora**. Es la primera vez que el
módulo contesta algo histórico.

De las siete cosas del «al abrirlo», cuatro existían; faltaban cultivo, parcela, ventana de
floración y colmenas comprometidas. **`bloomStartsAt` no es `startsAt`** —el servicio empieza
cuando llegan las colmenas, la floración cuando la abre la planta— y sin esa separación la
alerta del §9 no se puede dar.

**Dos `CHECK` en la base**, probados en las dos direcciones: ventana invertida y colmenas
negativas se rechazan; una ventana a medias entra. La invertida habría hecho que el aviso **no
saliera nunca**.

**De las dos alertas del §9, sólo una es nueva.** La de la aspersión ya existe desde ADR-127 y
no se reimplementa.

**`diasEfectivosDe` cuenta solape**, no duración: sumar colocaciones enteras inflaría la
factura de un servicio de polinización.

**Y Toabré es este mecanismo:** el propio §9 dice que allí el emplazamiento no tiene fecha de
cierre, y el informe del 2 de septiembre confirma que es un servicio para un cliente —Kiva
Estates, finca cafetera en Toabré, Penonomé, Coclé.

### 2026-09-14 · Equipos e instrumentos, y dos veces la lista equivocada

**El módulo entero de beneficio que faltaba** (PR #306, #308, #310). Antes: el equipo era
texto libre en cuatro campos —`vessel_note`, dos `equipment_note`, `container_note`— y
`measurement.device_id` una columna heredada que **ningún código ha escrito nunca**. El
único modelo de aparato, `device`, son los teléfonos de campo. Control positivo de esa
medición: la misma búsqueda sí encontraba `calibration_session`, que es calibración de
**panel sensorial** — personas, no aparatos. De ahí el prefijo `instrument_`.

**La decisión de Daniel cambia el diseño escrito.** `docs/beneficio/02_calibration.md` §3 y
`EQUIPMENT_AND_READINESS.md` §7 daban vigencias de **calendario** —«24 h», «7 días»— con la
columna marcada `[PROVISIONAL]`, que era donde faltaba el dueño. Él la cerró al revés: la
verificación es un **contraste contra patrón declarado** —agua a 0 °Bx, tampones 4.01 y
7.00— y **el tiempo sólo avisa**. Un instrumento vencido se sigue usando; lo que cambia es
que la lectura queda marcada. Es la §7.1 —degradar, nunca bloquear— aplicada al reloj:
bloquear se esquiva en el patio y entonces el sistema sabe **menos**.

**Y de ahí un valor nuevo en `DataConfidence`**, `REVISION_VENCIDA`: ninguno de los cuatro
podía decirlo. `UNCALIBRATED` **excluye** del cálculo y los tres del medio hablan de
temperatura y de retraso de captura.

**El veredicto de una verificación se DERIVA en la base, no se guarda a mano.** Un `CHECK`
no puede mirar otra tabla —lo escribí como si pudiera y era falso—, así que `outcome` nace
en `fail` y un trigger lo sube a `pass` sólo si hay **al menos un** contraste y ninguno
fuera. Sin esa primera mitad, `NOT EXISTS` sobre cero filas es verdadero y una verificación
**vacía** saldría aprobada.

**`equipment:report_condition` está separado de `manage` a propósito:** quien trabaja con la
máquina tiene que poder decir que está rota, y poner el refractómetro contra el agua, sin
poder retirarla del inventario.

**Dos veces medí la lista equivocada sobre el mismo tema, y las dos las cazó un control
positivo, no una relectura.** Dije que CryoBloom no se podía expresar: `cold_hold_prefermentativo`
ya estaba en `manejo_temperatura`. Dije que la cepa era texto libre: `levadura_cultivo`
existe desde RO1 **con MP72 dentro**, y lo que faltaba era una línea de cableado — el
catálogo sólo lo alcanzaba Research OS, y en el beneficio de un lote `registrarIntervencion`
lo rechazaba. Las dos veces miré una **columna** de texto libre y no el vocabulario.

**Tres guardias de la casa encontraron errores míos:** una operación escrita sin principal
(`acceso-a-datos`), dos botones sin protección de doble toque, y tres rutas sin declarar.

**Pendiente y es de Daniel:** no existe un perfil «Jefe de beneficio» —`equipment:manage`
hoy sólo lo tiene Platform Admin—; el resolvedor de permisos **sólo sabe sumar**, así que
personalizar por usuario no es una pantalla que falte sino un concepto que no tiene; y las
vistas 2 y 3 de disponibilidad necesitan capacidad en `equipment` y un concepto de cosecha
**planificada**, que `HarvestEvent` no tiene.

### 2026-09-14 · La jornada abierta se ve en todas las pantallas, y se reclama al día

Cierra las dos frases del Anexo E §5 que el código no cumplía (ADR-131). Medido:
`app/layout.tsx` no tenía **ni una** referencia a `FieldSession` —sólo la ficha del apiario
sabía de la visita abierta— y el umbral eran **72 horas** en código y en el texto.

**24 h, y el número vive en un sitio:** `HORAS_DE_JORNADA_VIEJA` en `fieldSessions.ts`, que
`vitalesDelSitio.ts` reexporta. Dos constantes para el mismo umbral acabarían diciendo cosas
distintas de la misma visita.

**El banner va en el layout** porque «todas las pantallas» incluye las que nadie ha escrito
todavía. Dos estados: una de hoy se recuerda, una de más de un día **se reclama**.

**El lector está acotado por construcción**, no vigilado: filtra `createdBy` por el propio
principal. El control no es un UUID inventado sino **dos cuentas reales con dos jornadas
abiertas en el mismo sitio**, y cada una ve la suya.

**Pendiente nombrado del §5:** «lo que quedó pendiente» al cerrar. El resumen ya existe
(`resumenDeVisita`); la otra mitad, no — `retirosPendientes` es el candidato obvio.

### 2026-09-14 · La app entra en la jornada abierta, y la vuelta mandaba al apiario a las parcelas

Primera mitad del Anexo E §1 (ADR-132). **El defecto no se razonó, se midió:**
`app/field-sessions/[id]` se enlazaba de vuelta a `/plots/<id>` **siempre**, así que una
jornada de apiario mandaba a la pantalla de **parcelas de café** — desde la jornada abierta no
había forma de llegar a las colmenas, o sea que el «toque 1 → colmena» del §1 estaba roto
antes de empezar. La consulta **ya traía `locationType`**: el arreglo no cuesta una consulta.

**Una jornada abierta gana a la prioridad por permisos** en `/start` (ADR-082 sólo miraba
permisos). La consecuencia se dice en vez de esconderse: una cuenta con permisos de plataforma
y una jornada abierta aterriza **en la jornada**, no en su tablero; es lo que el Anexo pide, y
el banner de ADR-131 deja ver siempre que hay una abierta. Hay una prueba de ese caso con
nombre.

**Todo lo que no es `apiary_site` sigue cayendo en `/plots`**, que es lo que hacía antes: no se
inventa una ruta para `site` ni `locality` porque no existen como pantalla, y la prueba recorre
los seis tipos.

**Las dos decisiones son puras** y se prueban sin base. Flip-test de las dos, compilando y
cayendo por su nombre.

**Pendiente nombrado, y es la otra mitad del §1:** «toque 2 → tipo de evento» con el formulario
ya resuelto. Es ergonomía que **sólo se juzga con el teléfono en la mano y el guante puesto**, y
no se rediseña a ciegas. Lo medido para que nadie empiece de cero: la ficha del apiario tiene
**tres `<details>`** que hay que abrir, y la de la colmena ninguno.

### 2026-09-15 · El orden de la lista de apiarios, y la prioridad que movía el borde sin mover la tarjeta

Anexo E §2 (ADR-133). **La pantalla sí ordenaba por urgencia — con un criterio de tres
valores.** Empatados, decidía `localeCompare` del nombre, o sea **el alfabeto**, que es lo que
el Anexo prohíbe por su nombre. Y eso dejaba la decisión del dueño del día antes aplicada a
medias: subir `aspersion_anunciada` a la primera prioridad movía el borde de la tarjeta **sin
mover la tarjeta**, así que un apiario con una aspersión en tres días quedaba debajo de uno con
una visita vencida por empezar su nombre por T.

**Nada lo vigilaba porque no había qué llamar:** el orden vivía en dos líneas dentro de un
componente. Misma forma que ADR-132. Ahora es `compararPorUrgencia`, pura, con cuatro
criterios — nivel, motivo en la prioridad del dueño, cuántas alertas, y **el nombre como
desempate determinista y no como orden**, que es la diferencia entre «alfabético» y «estable».

**La entrada directa con un solo apiario NO es un `redirect` en `/apiaries`, y eso se midió
antes de escribir:** la ficha tiene una sola salida —«volver a apiarios»— y la navegación
global sólo ofrece la lista, así que redirigir habría dejado **`/apiaries/new` sin alcanzar**.
Nadie podría crear su segundo apiario. Vive en `destinoDeEntrada`, y sólo cuando el aterrizaje
por permisos es la lista.

**Tres instrumentos que medían prosa en un solo cambio**, y el tercero es el que enseña: el
guardia de textos de alerta leía la unión con una expresión regular (ya midió cero motivos una
vez) y ahora lee un valor desde un módulo puro; mi `not.toContain("prisma")` cayó al minuto
porque la palabra está en el comentario que explica por qué no lo importa; y **un flip-test
encontró que el despojado de comentarios no lo ejercitaba ninguna prueba** — quitando la línea
entera, las seis seguían en verde. La trampa del escapado del RSS, otra vez.

**Y de ayer:** la prueba «gana incluso con permisos de plataforma» usaba
`user:manage_permissions`, que **no existe**. Pasaba porque el aterrizaje lo decidía `lot:view`
al lado. Corregida, y con ella una suposición mía: un administrador de plataforma sin permiso
operativo aterriza en `/my-nectar`, no en un tablero de administración.

**Pendiente nombrado:** el «sitio por corregir» del maquetado del §2 no es ninguno de los ocho
motivos de alerta. No se inventa.

### 2026-09-15 · El inventario del sitio, que no decía de dónde vino ninguna colmena

Anexo E §3 (ADR-134). La frase del Anexo trae su razón dentro —«inventario primero, **porque
decide la acción del día**»— y las dos mitades fallaban.

**La tarjeta enseñaba línea y media de tres.** Faltaban «de dónde vino» y «cuándo se abrió por
última vez», y **los datos ya estaban en la base** desde A9 y A9.10: nadie los leía. Quinta vez
en el módulo que el hueco es el camino y no el dato, con una variante — aquí no había que
construir nada, sólo mirar.

**Y estaba OCTAVO**, debajo del formulario de coordenadas y de seis secciones más. En un
teléfono, siete pantallazos antes de ver las colmenas. Ahora va tras el título; el orden
relativo del resto no se toca.

**El `⚠` sale de lo observado y no de un plazo:** el maquetado marca la caja «débil», no la que
lleva once días sin abrir. Los días se ven, no gritan. Y `null` no avisa.

**Sólo la colonia viva (`endedAt: null`)**, y el caso que lo obliga es real: NN-0041 y NN-0042
de Finca Rosina son cajas vacías con historia, y sin el filtro dirían «inspección hace 3 d» con
un aviso de población baja sobre una caja sin abejas. Su prueba lleva control positivo de que
esa inspección existe.

Inventario de acceso **326/95 → 327/96**, en «depende del llamador» —con un id ajeno devolvería
el dato ajeno— y con sus dos entradas en el allowlist.

**Sin probar, y dicho:** el orden de las secciones y el renderizado de la tarjeta. No hay
pruebas de renderizado de páginas aquí, y una aserción posicional sobre el texto del archivo es
la trampa que ya midió un comentario mío en vez del JSX.

**Pendiente nombrado:** la FLORA MELÍFERA del maquetado **no tiene modelo** —cero modelos y
cero enums de floración en el esquema— y el §4 nombra el formulario que la llenaría. Es hueco
de esquema, como fue el §8, y su vocabulario es del dueño: especies, fases fenológicas, escala
de abundancia.

### 2026-09-15 · Una colmena nace con su colocación: diez de las veintinueve reales no la tenían

ADR-135. **La invariante vivía en un comentario de ADR-126** —«`createHive` no la crea»—, y eso
se aplicó en el guion que se escribió con la nota delante y se olvidó en los dos siguientes, del
mismo día.

**Medido antes de tocar nada, sobre la copia local con los datos reales: 29 colmenas, 19 con
colocación, 10 SIN NINGUNA** — y las diez son las de Apiario Las Nubes. Con control positivo:
NN-0041 sí tenía la suya, así que el cero no era de la consulta.

**Lo que significaba:** `apiarioDeColmenaEn` contestaba `null` —«no consta»— para esas diez en
cualquier fecha, y `colmenasDeLaVentana` no las contaba. O sea que **el §9, entregado el día
antes, era ciego al apiario real del dueño**, y en silencio: la respuesta salía vacía.

Cuatro piezas: `createHive` pasa a transacción con colocación y audit; un ayudante compartido
para las cuatro rutas; una migración de relleno idempotente por `NOT EXISTS` (29/29 en local, y
los lectores contestan con las fechas que declaró el dueño — 4 de septiembre para NN-0043, 2
para NN-0048); y un guardia de fuente, porque el de datos se iría a rojo por el montaje de otra
prueba en la base compartida.

**Un agujero de rastro de paso:** el camino de la aplicación creaba una colmena **sin
AuditEvent** mientras los tres guiones sí lo escribían. Ahora el historial de una caja incluye
su creación.

**El coste, dicho: 27 limpiezas de prueba.** La FK es `RESTRICT` y se mantiene: en producción
una colmena no se borra, se retira, y una cascada se llevaría la historia en silencio.

**Y el flip-test encontró un defecto en mi propio guardia:** contaba el `import` del ayudante
como una llamada, así que un guion que perdiera su línea seguía pasando. El instrumento midió
una importación en vez de una escritura — la misma forma de siempre.

Inventario de acceso **327/96 → 328/96**, con dos entradas nuevas del mismo archivo porque son
dos preguntas distintas.

### 2026-09-15 · El mismo manejo a varias colmenas de una vez

ADR-136, y lo pidió el dueño con estas palabras: «poder seleccionar todas las colmenas para
aplicar que se hizo algo que hice igual a todas, y no tener que hacer siempre una por una».

**No era una idea nueva: era terminar una.** El §8 ya lo había escrito para el traslado
—«selección múltiple con atajos, porque nadie toca veinte casillas con guante»— y ese
formulario ya tenía casillas, «todas» y conteo antes de confirmar. Se reusa entero.

**Sólo alimentación y tratamiento, y la línea la traza el esquema:** `provenanceClassFor` da
`original_record` a esos dos y `direct_observation` a la observación al paso. Diez registros de
algo que HICISTE son diez hechos ciertos; diez observaciones sacadas de una mirada, no. La
inspección queda fuera por lo mismo — el Anexo la marca «(por colmena)».

**Y en lote sale MÁS correcto:** `coverageUntil` y la carencia son las fechas que disparan los
avisos; tecleadas diez veces se desvían, y diez cajas con el mismo jarabe el mismo día
acabarían avisando en días distintos.

**Lo que no se relaja:** una fila por colonia, un rastro por fila, una jornada abierta que las
recoge todas, y **una colonia que no está viva no recibe nada** — el error la nombra, y en el
formulario las doce cajas vacías se ven y no se pueden marcar. Las reglas del evento
individual se **extrajeron** en vez de duplicarse, con su prueba: duplicar es como se perdió
la colocación en ADR-135.

**Pendiente nombrado:** la observación en lote, hasta que el dueño diga qué significa; y el
«nada fuera de lo normal» sobre varias, que es honesto pero escribe `Inspection` y merece su
propia rebanada.

### 2026-09-15 · La lista de apiarios deja de ser plana

ADR-137, y lo pidió el dueño: «devuelta a finca o organizacion y ver apiarios bajo ellos ya sea
en lista o mapa».

**No construye jerarquía: deja de esconder la que hay.** `parentLocationId` y `organizationId`
estaban poblados para los cuatro apiarios reales —Finca Rosina con dos, Toabré con dos— y la
pantalla **no nombraba ninguno de los dos en ninguna línea**. Sexta vez en el módulo que el
hueco es el camino y no el dato.

**El grupo es el lugar padre y su tipo se enseña**, porque el de Las Nubes es una finca y el de
Toabré una localidad: rotular los dos igual afirmaría lo que la fila no dice. Agrupar por
organización daría un grupo de cuatro — la lista plana otra vez.

**La urgencia no se pierde al agrupar**, que era el riesgo entero, y el grupo sin lugar
declarado no va al final por serlo.

**Dos hallazgos del propio trabajo:** el encabezado rotulaba la organización *del primer
sitio* —en el grupo sin lugar, cuatro sitios de tres organizaciones bajo el nombre de una—, y
un flip-test destapó que el primer criterio del orden **no podía decidir nada**: una crítica
implica nivel 0, así que nivel y recuento nunca discrepan. Se quitó.

**Pendiente nombrado:** el mapa por grupo. Cero de los ocho sitios tienen coordenadas, así que
hoy dibujaría recuadros vacíos. La frase pide «lista o mapa» y sólo una tiene datos detrás.

### 2026-09-15 · Las dos mitades del cierre de jornada

ADR-138. Anexo E §5: «Al cerrarla: resumen de lo registrado, **lo que quedó pendiente**». La
pantalla **no enseñaba ninguna de las dos**. `resumenDeVisita` existe desde A9.1 y aparecía en
**cero** pantallas —alimentaba un mensaje de bitácora—, y de lo pendiente no había nada.

**La mitad nueva contesta la pregunta del oficio:** abriste cuatro de diez, ¿cuáles seis se
quedaron? Cuentan los **tres** caminos —inspección, evento de colonia, cosecha—: mirando sólo
inspecciones, una caja alimentada saldría como sin tocar. Y el filtro es **por jornada**, no
por sitio, o una visita anterior haría creer que ya abriste todo hoy.

**La línea de lo que entra:** lo que todavía puedes hacer antes de irte — cajas sin tocar y
tiras sin retirar. El alimento por vencer y la consulta a vecinos **no se repiten**: no se
resuelven caminando de vuelta a la caja, y amontonarlas haría la pared de avisos que se aprende
a ignorar.

**La lista sale también con la jornada abierta**, no sólo al cerrar: una lista de lo que te
falta que aparece cuando ya no puedes añadir eventos no se puede atender.

Inventario de acceso **329/96 → 330/97**.

**Pendiente nombrado:** el PDF del reporte «sin almacenarlo» que el §5 pide al lado. El reporte
web y su enlace ya existen desde el 2026-09-10; el PDF es pieza propia.

### 2026-09-15 · El informe al cliente ya dice de qué colmena habla

ADR-139, y lo pidió el dueño: «deberíamos también ver cómo meter el informe, todos los informes
son visita y o inspecciones y acciones o manejos en apiario».

**El reporte existía y cada línea decía el nombre de la TABLA.** Medido: `cuando · clase ·
sujeto · operador`, con `sujeto` = `"inspeccion"` o `"evento_de_colonia"`. El informe que recibe
Kiva por su enlace decía de qué **tipo** era cada fila y no de qué caja hablaba ni qué se le
hizo. El comentario lo justificaba «sin exponer el id interno» — instinto correcto aplicado
demasiado ancho: **`NN-0043` no es un id interno**, es el dato con el que el cliente sigue su
servicio.

Ahora el snapshot lleva `colmena` y `detalle` —resultado, producto, material, kilos—, **los dos
opcionales a propósito**: el snapshot es inmutable, lo ya emitido no los trae, y declararlos
obligatorios haría creer a TypeScript que sí. Hay una prueba que se los quita a un snapshot
guardado y comprueba que se sigue leyendo.

**Dos cosas que me cazó la corrida, no el compilador:** me inventé el campo `honeyKg` —el real
es `extractedWeightKg`— y pasó `tsc` porque tipé el borde como `unknown`, que apaga la única
comprobación que había. Y la prueba nueva dejó una fila en `colony_event`, cuya FK es RESTRICT:
**37 pruebas en verde con el archivo en rojo** hasta ampliar la limpieza.

**Una corrección mía en ADR-138**, del mismo día: dije que el PDF «sin almacenarlo» seguía sin
existir. Es falso — `PrintButton` existe desde T13 y ADR-039 ya fijó que la impresión del
navegador **es** el mecanismo. Corregido en su sitio: un pendiente falso manda a la próxima
sesión a construir algo que ya está.

**Pendiente nombrado:** las fotos en el informe. `FieldEvent` puede apuntar a un `Asset` y el
snapshot no lo mira; qué ve el cliente es decisión del dueño.
