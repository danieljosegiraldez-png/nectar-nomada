# Inventario de acceso a datos, por operación

Lo pidió la revisión que rechazó el plan del `AuthzContext`: **sustituir la
unidad «archivo» por «operación»**. 51 archivos no son 51 decisiones de acceso.

Se genera, no se escribe a mano — un inventario escrito a mano está obsoleto al
día siguiente:

```bash
node scripts/inventario-de-acceso.mjs          # resumen
node scripts/inventario-de-acceso.mjs --json   # una fila por operación
```

## Lo medido el 2026-09-05, actualizado el 2026-09-26 con las lecturas de la clasificación de verde

**583 operaciones** que tocan la base, en **160 archivos** — medido con
`node scripts/inventario-de-acceso.mjs` sobre el árbol que fusiona `origin/main`
(`326bd584`) con la rama de las lecturas de la clasificación de verde por malla:

<!-- Estas cifras las comprueba tests/arquitectura/cifras-del-inventario.test.ts
     contra la salida del script. Si cambian aquí sin cambiar allí —o al revés—
     la compuerta falla y dice cuál. Todo el trabajo del 2026-08-31 empezó por
     una discrepancia de uno entre este documento y la medición. -->

| Operaciones | Patrón | Qué significa |
|---:|---|---|
| **448** | guardia directo | Llama al servicio de autorización, directamente o por un guardia local del archivo |
| **20** | acotado por construcción | La consulta filtra por el propio principal **dentro de un `where`** —o por un `resolve*Visibility` que sale de sus asignaciones—: **no puede** devolver lo ajeno. Firmar con él (`createdBy`, `actorUserAccountId`) no cuenta |
| **82** | depende del llamador | No recibe principal. La autorización, si existe, está en quien la llama |
| **10** | público por diseño | `lib/discover/service.ts` y su `PUBLIC_WHERE` (ADR-024 §3) |
| **4** | previo a la sesión | El flujo de autenticación, incluido `lib/auth/config.ts` |
| **19** | recibía principal sin guardia visible | Las dieciocho ya explicadas en el allowlist, más `cerrarCorridaEnTransaccion`, ayudante transaccional cuyo llamador autoriza antes de abrir la transacción |

> **Muestras verdes disponibles para tueste (2026-09-23): 573→574 y guardia directo
> 433→434, sin archivo nuevo.** `listGreenSamplesForRoast` consulta muestras de un lote
> sólo después de `requireLotAccess`; calcula el saldo de la muestra restando las cargas
> de sus tuestes registrados, para que la pantalla no ofrezca masa ya consumida.

> **Des-retirar un modelo de equipo (2026-09-27): 582→583 y guardia directo 447→448, sin
> archivo nuevo.** ADR-187. `desRetirarModelo` (`lib/equipos/modelos.ts`) exige el mismo permiso
> que retirar —`requireEntradaDeCatalogoAccess` con `equipment:manage` sobre el dueño— antes de
> tocar nada, y escribe su `AuditEvent` en la misma transacción.

> **Las tres lecturas de la clasificación de verde (2026-09-26): 580→582, 159→160
> archivos y guardia directo 445→447.** `clasificacionDeLote` y
> `compararClasificacionVerde` (`lib/traceability/clasificacionVerde.ts`) sólo leen: la
> primera exige `requireLotAccess(view)` antes de mirar nada; la segunda recorta con
> `resolveLotVisibility` y devuelve `sinAmbito` en vez de una lista vacía cuando la cuenta
> no alcanza ningún lote.
>
> **Y aquí se cazó una afirmación que el merge volvió falsa.** Antes de fusionar
> `conDescendientes`, la segunda salía **acotada por construcción** y así lo escribí. Al
> fusionar pasó a **guardia directo** —es una de las siete que la cita de abajo predice—,
> así que la clase de una operación no es suya: depende del árbol en que se mide. La
> discrepancia la enseñó volver a correr el script sobre el árbol fusionado; ni mi rama ni
> `origin/main` por separado daban 446/20.

> **Selección verde por mallas (2026-09-24): 574→575, 158→159 archivos y guardia
> directo 434→435.** `recordGreenGrading` verifica que el origen sea verde y delega
> autorización, genealogía y balance a `recordTransformation`; cada fracción sigue
> siendo un lote del inventario, no una tabla paralela de existencias.

> **Un sello de actor no es un filtro (2026-09-21): tras fusionar #464, 41→28 acotado por construcción, 5→18
> sin guardia visible; el total no cambia, 557.** La regla tenía una segunda forma,
> `/userAccountId,\s*$/m`, que casaba cualquier línea terminada así — sobre todo
> `createdBy: userAccountId,` y `actorUserAccountId: userAccountId,` en `recordAuditEvent`.
> Medido con el script instrumentado: antes de #464, de 42 «acotadas», **14** lo eran sólo por
> esa forma y **ninguna** filtraba por el principal. `declararCanal` era el control positivo:
> salía «acotada» sin estar autorizada y #464 le añadió la guardia real. Sobre el árbol ya
> fusionado, esa operación queda en guardia directo y las otras **13** pasan a sin guardia
> visible. Leídas una a una:
>
> - **Seis ayudantes de transacción** (`abrirIntervaloEn`, `cerrarIntervaloEn`,
>   `cerrarAbiertosEn`, `asentarPesoDeCosechaEn`, `crearConsumoEnTx`, `ligarAVisitaAbierta`):
>   todos sus llamadores guardan.
> - **Dos con guardia que el detector no ve**: `registrarBandejas` (`puedeConfigurarEn`) y
>   `declararModoDeInstrumento` (`puedeGestionarEquipo`), los dos acaban en `can()`.
> - **`createAssignment`**: el `userAccountId` es el de quien recibe el rol; `grantRole` exige
>   `requirePermissionAdmin`.
> - **Dos escrituras sobre uno mismo**: `createBookingForSession` (sesiones públicas) y
>   `registerDevice` (ADR-108).
> - **`cargarProtocoloDeCampo`**: sin guardia, sólo la llama un guion de consola que actúa como
>   Platform Admin.
> - **Un hallazgo pendiente**: `proposeResearchActivity`, escritor sin autorización y sin
>   llamador hoy; quién puede proponer no está escrito en ninguna parte y lo decide Daniel.
>   `declararCanal`, el segundo hallazgo original, quedó corregido por #464. Las razones están
>   en el allowlist.
>
> Lo guarda `tests/arquitectura/acotado-por-construccion.test.ts`, por nombre, en las dos
> direcciones: con la regla vieja caen los cinco sellos, y sin la del `where` caen los filtros
> de verdad.

> **`declararCanal` gana su guardia (2026-09-21): 417→418 guardia directo, 42→41 acotado por
> construcción, sin operaciones ni archivos nuevos.** Contaba como «acotado por construcción» y
> **no lo estaba**: recibía `userAccountId` sólo para ponerlo de actor en el `AuditEvent`, y
> escribía la preferencia de canal de cualquier `personId`. Lo que el script reconoció fue su
> segunda forma de «acotado» —una línea que termina en `userAccountId,`— en
> `createdBy: userAccountId,` y `actorUserAccountId: userAccountId,`: sellos de actor, no un
> filtro. Es la advertencia de su propio pie («reconoce formas escritas, no propiedades»),
> hecha caso. Ahora llama a `exigirPuedeDeclararCanal`
> (`can(..., "manage_notifications", "person", ...)`), y mueve la fila que le toca.

> **El logotipo de la finca (2026-09-21, rebasado 2026-09-22): 557→561, y un archivo nuevo,
> `lib/traceability/fincaLogo.ts`.** `finalizeFincaLogoUpload` y la lectura de su pantalla,
> `fincaParaLogotipo` y `requestFincaLogoUpload` entran como «guardia directo» (418→421 sobre el árbol rebasado,
> con `requireLocationAttributeAccess`); pedir la firma comprueba además que la ubicación sea una finca antes de crear
> el objeto remoto. `urlDelLogotipo` es «depende del llamador» (79→80): firma la URL de
> un `logoAssetId` que llega de `listarFincas`, que ya acota a lo que quien mira ve.

> **Secado por bandeja, plan 2b, tarea 2 (2026-09-21, rebasado 2026-09-22): 561→569, y un archivo nuevo,
> `lib/traceability/bandejasDelSecado.ts`.** Sus siete funciones exportadas —`posicionDeBandeja`,
> `cargarBandeja`, `bajarBandeja`, `bandejasDeCorrida`, `bandejasDisponibles`, `moverBandeja` y
> `posicionesParaMover`— suben **guardia directo**, 421→428: cada una exige `requireLotAccess`
> sobre el lote de la corrida (`corridaConPermiso`), o `puedeVerEquipo`/`puedeConfigurarEn` sobre
> el equipo o la posición. Y `lib/traceability/drying.ts` gana `cerrarCorridaEnTransaccion`, que
> entra como **«recibe principal sin guardia visible»**, 18→19: no autoriza por sí misma — lo hace quien la llama
> (`endDryingRun` y `bajarBandeja`) antes de abrir la transacción que la envuelve.

> **La lectura de ambiente del secado (paso 4, 2026-09-21): +3 operaciones (545→548 al escribirse, 557→560 tras rebasar), y un archivo nuevo,
> `lib/traceability/ambiente.ts`.** `registrarLecturaDeAmbiente`, `ambienteDeInstalacion` y
> `puedeRegistrarAmbienteEn` suben las tres **guardia directo** (407→410 sobre la base de entonces; 417→420 tras rebasar sobre las rutinas de lugar): pasan por `puedeEn`,
> que llama a `can(…, "sample", …)` sobre la instalación. La regla de qué lectura vale para cada
> punto vive aparte, en `lib/traceability/ambienteVigente.ts`, que no toca la base.

> **Las pantallas de la pieza 3 (tarea 6, 2026-09-19): 522→526, las cuatro «depende del
> llamador»**, 71→75. Son lectores para pintar: `mermasDeRecepciones`, `detalleDeRecepciones`,
> `veredictoDeCalidadDelLote` y `veredictosDePedidos`. Ninguno recibe principal a propósito —un
> lector que exige principal parece una compuerta y termina usándose como tal—: cada uno recibe
> ids que su página acaba de obtener de una lectura que SÍ autoriza.

> **El veredicto del lote (pieza 3, tarea 5, 2026-09-19): 521→522, y un archivo nuevo,
> `lib/traceability/veredictoDelLote.ts`.** `recalcularVeredicto` entra como **«depende del
> llamador»**, 70→71, y además en `reciben_transaccion`: las dos cosas por la misma razón, que
> corre DENTRO de la transacción de `recordSelection` —que ya autorizó el lote— para que una
> selección no pueda guardarse sin su veredicto.

> **Armar el lote (pieza 3, tarea 4, 2026-09-19): 518→521, y un archivo nuevo,
> `lib/traceability/lotesDeBeneficio.ts`.** `armarLote` y `recepcionesArmables` suben **guardia
> directo**, 390→392, por `exigeGestionarBeneficio` y `exigeVerBeneficio`. `origenDelLote` entra
> como **«depende del llamador»**, 69→70: camina la genealogía de un lote que su llamador ya
> autorizó.

> **La merma de una recepción (pieza 3, tarea 3, 2026-09-19): 515→518.** `anotarMerma` y
> `anularMerma` en `lib/traceability/recepcionesDeCereza.ts` suben **guardia directo**, 388→390:
> las dos pasan por `exigeGestionarBeneficio`, que llama a `requireLotAccess(manage)` sobre el
> beneficio de la recepción. `disponibleDeRecepciones` entra como **«depende del llamador»**,
> 68→69: la comprobación que decide —si la merma cabe— no es ésa, sino la que corre dentro de la
> transacción con la fila bloqueada.

> **Merge de `origin/main` en `vistas-finca-parcela` (2026-09-19, merge-main-3).** Unión de esta
> rama —la finca de la trampa, `resolveFarmSiteId`— con el manejo fitosanitario PR B, la pesada
> por recipiente, la recepción de cereza y la cera como subproducto, fusionados en `origin/main`.
> Cifras de arriba REALES, medidas con `node scripts/inventario-de-acceso.mjs` sobre el árbol
> fusionado, no derivadas por aritmética de los dos lados.

> **Las trampas son de la finca elegida (2026-09-21).** `/finca/trampas` y su ronda pasan a usar
> la finca elegida de la sección (`fincaDeLaPagina`), así que `getFincasConTrampas` —que servía al
> selector de fincas que Daniel pidió quitar— queda sin uso y se quita: **guardia directo 408→407,
> 546→545**, en los mismos 152 archivos. Medido con `node scripts/inventario-de-acceso.mjs`.

> **La finca de la trampa (2026-09-19).** Una operación nueva en `lib/traceability/fincas.ts`,
> `resolveFarmSiteId` —camina hasta la Location `site` antepasada, para `createTrap` y
> `getPlotDetail`—, sube la fila de **depende del llamador**: no recibe principal, y las
> dos llamadoras ya comprobaron acceso (`requireTrapAccess`/`requireLocationAttributeAccess`)
> antes de invocarla.

`origin/main` (`5afbe3f3`) mide **521 operaciones en 146 archivos**; la diferencia —**+14
operaciones en +4 archivos** (+11 guardia directo, +2 depende del llamador, +1 acotado por
construcción)— es lo que trae `secado-2a` por encima. Remedido el 2026-09-21 sobre el árbol
fusionado con `node scripts/inventario-de-acceso.mjs`, y cuadra fila por fila con la suma.

> **Segunda revisión final del plan 2a de secado (2026-09-19), F4.**
> `lotesGestionablesDeOrganizacion` (`lib/beneficio/vistaDeBandejas.ts`), nueva
> función que pagina los lotes candidatos hasta llenar la cuota de gestionables
> en vez de autorizar sólo los primeros 100 tomados de golpe. 503→504,
> guardia directo 377→378; mismos 144 archivos (el archivo ya estaba contado).

> **Secado por bandeja, paso 2a, tras la revisión final (ADR-179, 2026-09-19).**
> Rebasar `secado-2a` sobre este árbol y aplicar la revisión final trae **4
> archivos nuevos** —`lib/traceability/estantes.ts`, `lib/equipos/bandejas.ts`,
> `lib/traceability/capacidadDeBandeja.ts`, `lib/beneficio/vistaDeBandejas.ts`—,
> 140→144. Medido con `node scripts/inventario-de-acceso.mjs --json` contra un
> checkout limpio de `origin/main` (490/140) y contra el árbol rebasado
> (503/144): **+14** operaciones nuevas —9 guardia directo y 1 acotado por
> construcción en los 4 archivos nuevos; `puedeConfigurarEn`/`puedeVerEquipo`
> en `lib/equipos/equipos.ts` (2, guardia directo, alcanzadas ahora desde el
> nuevo `bandejas.ts`); `instalacionDe` (`instalaciones.ts`) y
> `lugaresDeOrganizacion` (`locations.ts`) entran como **depende del llamador**,
> las dos ya explicadas en el allowlist— y **−1**: `exigeEditarBeneficioEnOrganizacion`
> deja de contarse aparte; el detector reconoce formas escritas y no
> propiedades (cabecera del script), y no se investigó más allá de confirmar
> que la función sigue existiendo y sigue siendo guardia directo por lectura
> del código. 367→377, 39→40, 65→67; las demás filas no se movieron.

> **Manejo fitosanitario, ronda final de arreglos (2026-09-19, hallazgo 5).** Una
> operación nueva en `lib/traceability/intervenciones.ts`, ya inventariado:
> `contextoDeManejo` sube **guardia directo**. El arreglo de
> `bloquesDeLaParcela` (entrada de abajo) dejó incompleto el permiso de las
> pantallas de manejo: `/plots/[id]/manejo/nuevo` y `/manejo/[interventionId]`
> seguían pidiendo `getPlotDetail` (`location:manage_attributes`) ANTES de
> llegar a `bloquesDeLaParcela`, así que un operario con `lot:view`/`lot:manage`
> y sin ese permiso distinto recibía `notFound()` igual. `contextoDeManejo` lee
> sólo nombre y zona de la parcela, autorizada con el MISMO `requireLotAccess("view")`
> que ya exige leer o corregir sus intervenciones — `getPlotDetail` y el
> tablero (`/plots/[id]`) siguen exigiendo `location:manage_attributes`, sin
> cambios.

> **Manejo fitosanitario, ronda de arreglos 1 (2026-09-19).** Dos operaciones nuevas en
> `lib/traceability/intervenciones.ts`, ya inventariado. `bloquesDeLaParcela` sube **guardia
> directo**: lee los bloques de una parcela con el MISMO permiso (`lot:view`/`manage`,
> vía `requireLotAccess`) que ya exige leer o corregir sus intervenciones — reemplaza a
> `listPlotBlocks` (`location:manage_attributes`) para este consumidor, porque ese permiso
> distinto era lo que dejaba borrar un bloque en silencio al corregir sin tenerlo. `motivoValidoParaParcela`
> no autoriza nada a propósito —sólo decide si `?motivo=` de la URL sirve para precargar el
> formulario— y va en **depende del llamador**: su único llamador,
> `NuevoManejoPage` (`app/plots/[id]/manejo/nuevo/page.tsx`), ya pasó `getPlotDetail`
> (`location:manage_attributes`) sobre la misma parcela antes de invocarla.

> **Pesada por recipiente (ADR-177, 2026-09-19).** Un archivo nuevo, `lib/apiary/recipientes.ts`:
> `anotarRecipiente` y `quitarRecipiente` suben **guardia directo** (`requireApiaryAccess`
> manage sobre la caja de la cosecha antes de escribir). Y `asentarPesoDeCosechaEn`, extraído de
> `completarCierreDeCosecha`, entra como **«acotado por construcción»** — **la etiqueta del
> script no es exacta**: no se autoriza sola, recibe el `tx` de quien la llama, y sus dos llamadores
> (`completarCierreDeCosecha` y `recipientes.ts`) comprueban `apiary:manage` antes.

> **La cera como subproducto (ADR-178, 2026-09-19).** `lib/apiary/ceraDeExtraccion.ts` sube
> **guardia directo**: anotar exige `apiary:manage` y leer `apiary:view` sobre el apiario,
> los dos por `fincaDelApiario`, con los mismos candidatos que `getApiaryDetail` (ubicación y los
> proyectos de sus colmenas).

> Tras la revisión de Codex, `bloquearCosechaEn` —el `FOR UPDATE` que ordena a quien cambia el peso
> de una misma cosecha— entra como **«depende del llamador»**: sus tres llamadores autorizan antes.

> **Recepción de cereza en beneficio (2026-09-19).** `lib/traceability/recepcionesDeCereza.ts`,
> `recepcionDeEntregas` entra como **depende del llamador**: no recibe principal, y sus dos
> llamadores (`detalleDeJornada`, `misEntregas`) ya autorizaron esas entregas antes.

> **Rutinas de lugar (Tarea 4, spec 2026-09-19 §4.2), con un archivo nuevo.**
> `lib/rutinas/lugares.ts` aporta **cuatro** operaciones. Tres suben la fila
> de **guardia directo**: `puedeSobreLugar` llama a `can(` directo;
> `insumosDeLugar` y `equiposAqui` se gatean sobre `puedeSobreLugar` antes de
> consultar. Además, en `lib/rutinas/rutinas.ts`, ya inventariado, se le suman
> `rutinasDeLugar` y `vencidasPorLugar` —dos operaciones más de **guardia
> directo**, fuera de la cuenta de `lugares.ts`—, que exigen
> `puedeSobreLugar(…, "view")` antes de leer. La cuarta operación de
> `lugares.ts`, `lugarParaRutina`, no recibe principal a propósito: lee el
> lugar ANTES de que `requireRutinaAccess` compruebe el permiso, para
> distinguir «no admite rutinas» de «prohibido» — mirada a mano y explicada en
> el allowlist, y cae en **depende del llamador**. `rutaDeLugar` no toca la
> base y no cuenta. Cifras exactas de esta fusión, regeneradas al final de la
> Tarea 8 más abajo.

> **Acciones y la tarjeta (Tarea 5, spec 2026-09-19 §5), sin archivo nuevo.**
> `app/actions/rutinas.ts` no puede importar `lib/db` directamente (guardia
> `no-restricted-imports`, `docs/arquitectura/acceso-a-datos.allowlist.json`), así
> que `volverA()` —a dónde redirige cada acción, equipo o lugar— pasó a apoyarse
> en `lugarParaVolver`, nueva en `lib/rutinas/lugares.ts`. Como se escribió
> entonces, no recibía principal a propósito y subía la fila de **depende del
> llamador**.
>
> **CORREGIDO en la ola de arreglos de revisión final (2026-09-19, Hallazgo A
> de la revisión independiente de Codex): era exactamente el riesgo que el
> párrafo de arriba minimizaba.** El `locationId` viene del formulario, sí,
> pero un formulario lo rellena el NAVEGADOR de quien sea, así que un llamador
> AUTENTICADO sin ningún permiso podía mandar el id de un lugar ajeno y
> aprender su existencia y su tipo/padre por la URL de redirección misma,
> incluso cuando la acción terminaba en `forbidden` — la autorización de la
> ACCIÓN no protegía la RUTA de vuelta. `lugarParaVolver` ahora exige
> `userAccountId` y comprueba `puedeSobreLugar(…, "view")` antes de leer nada;
> sin permiso, `null`, igual que un id que no existe. Pasó de **depende del
> llamador** a **guardia directo** (comprobado con
> `node scripts/inventario-de-acceso.mjs --json`).

> **La bodega (Tarea 2, spec 2026-09-19 §4.1), con un archivo nuevo.**
> `lib/traceability/bodegas.ts` aporta **cuatro** operaciones y las cuatro
> llevan **guardia directo**: `crearBodega` y `padresParaBodega`
> resuelven `location:edit_beneficio` (`exigeEditarBeneficioEn`/`can()`) sobre
> el candidato a padre; `listarBodegas` y `detalleBodega` resuelven
> `manage_attributes` sobre la propia bodega. `padresParaBodega` llama a
> `can(` directo y no al booleano `puedeEditarBeneficioEn` — ese envoltorio
> sólo invoca `exigeEditarBeneficioEn` dentro de un try/catch, sin `can(`
> literal en su propio cuerpo, así que el detector no lo reconoce como guardia
> transitivo y la operación habría quedado «sin guardia visible» pese a estar
> autorizada igual que sus hermanas. 4 = 4: si la cuenta no cerrara con la fila
> de «guardia directo», alguna se habría colado sin ese permiso. Cifras exactas
> de esta fusión, regeneradas al final del rebase más abajo.

> **Marcos negros (ADR-176, 2026-09-19).** Una operación nueva en `lib/apiary/cera.ts`,
> `marcosNegrosDelApiario`, que sube la fila de **guardia directo** tras rebasar sobre reinas y fitosanitarios: llama a
> `requireApiaryAccess` view sobre el apiario antes de leer. El archivo ya estaba contado.

> **Y el de 468→469, sin archivo nuevo, es `crearConsumoEnTx` (Tarea 3, spec
> 2026-09-19).** Vive en `lib/traceability/operations.ts`, que ya estaba
> inventariado, y sube la fila de **acotado por construcción**, 38→39. No es
> el patrón de siempre —filtrar un `where` por el principal—: es el heurístico
> `userAccountId,$` de fin de línea, porque el `create` termina en
> `createdBy: userAccountId,`. La lectura correcta no es «autoriza por sí
> misma»: es lo que dice su propio comentario, **«No autoriza: autoriza quien
> la llama»** — `recordMaterialConsumptionEntry` aquí mismo, y en el plan
> siguiente el registro de una rutina. Recibe el `tx` de quien la invoca en vez
> de abrir el suyo, así que también entra en `reciben_transaccion` de
> `acceso-a-datos.allowlist.json`, con su razón — es la misma forma que
> `crearColocacionInicial` (`lib/apiary/hives.ts`, ADR-135): escribe unas pocas
> filas y no consulta nada por su cuenta, así que no puede leer de más aunque
> reciba el cliente entero.

> **La cera con el color de su año (ADR-173, 2026-09-18).** Un archivo nuevo, `lib/apiary/cera.ts`,
> con tres operaciones —`registrarCeraNueva`, `registrarSalidaDeMarcos` y `leyendaDeCera`— que
> suben la fila de **guardia directo**, 341→344 tras rebasar sobre catálogos (#435): las tres pasan por `fincaDe`, que llama a
> `requireApiaryAccess` (manage para anotar, view para leer) antes de tocar nada. 461→464, en 136
> archivos.

> **Alzas con marca (2026-09-18).** Un archivo nuevo, `lib/apiary/alzas.ts`, con cuatro
> operaciones —`registrarAlza`, `ponerAlza`, `darDeBajaAlza` y `alzasDelApiario`— y las cuatro
> suben la fila de **guardia directo**, 310→314: llaman a `requireApiaryAccess` (manage para
> escribir, view para listar) antes de tocar nada. 430→434, en 131 archivos.

> **Catálogos, rutinas y modelos de equipo (2026-09-19, ADR-172).** Cuatro archivos nuevos
> —`lib/catalogos/propiedad.ts`, `lib/equipos/modelos.ts`, `lib/equipos/documentos.ts` y
> `lib/rutinas/rutinas.ts`— y operaciones nuevas en `lib/equipos/equipos.ts`. Las 27 suben la
> fila de **guardia directo**, 314→341: cada una pasa por `can(` o por un `require…Access`
> (`requireCatalogoAccess`, `requireEntradaDeCatalogoAccess`, `requireRutinaAccess`) antes de
> leer o escribir. 434→461, en 135 archivos.
> **Tarea 5 del plan 2a de secado (la pantalla de bandejas — tipos, registro
> numerado, pesaje y capacidad, 2026-09-19), con un archivo nuevo.** Partiendo
> de 442 operaciones en 133 archivos: `lib/beneficio/vistaDeBandejas.ts` es el
> modelo de vista de `/beneficio/bandejas` — vive en `lib/` y no en la página
> porque `app/**` no puede importar `lib/db` directamente
> (`tests/arquitectura/acceso-a-datos.test.ts`). Aporta **una** operación:
> `vistaDeBandejas` sale **guardia directo** (+1) porque el detector sigue su
> llamada transitiva a `pesajesDeTipo` (que sí llama a `requireLotAccess`); el
> resto de lo que autoriza —`tiposDeBandeja`, `bandejasDeLaFinca`,
> `puedeEditarBeneficioEnOrganizacion`, `puedeConfigurarEn`,
> `resolveLotVisibility`/`lotWhereFromVisibility`— son las mismas funciones ya
> inventariadas en sus propios archivos; ésta sólo compone lo que ya filtran.
> Total: guardia directo 318 + 1 = **319**; 442 + 1 = **443** operaciones en
> 133 + 1 = **134** archivos.

> **Alzas con marca (2026-09-18).** Un archivo nuevo, `lib/apiary/alzas.ts`, con cuatro
> operaciones —`registrarAlza`, `ponerAlza`, `darDeBajaAlza` y `alzasDelApiario`— y las cuatro
> suben la fila de **guardia directo**, 310→314: llaman a `requireApiaryAccess` (manage para
> escribir, view para listar) antes de tocar nada. 430→434, en 131 archivos.

> **Catálogos, rutinas y modelos de equipo (2026-09-19, ADR-172).** Cuatro archivos nuevos
> —`lib/catalogos/propiedad.ts`, `lib/equipos/modelos.ts`, `lib/equipos/documentos.ts` y
> `lib/rutinas/rutinas.ts`— y operaciones nuevas en `lib/equipos/equipos.ts`. Las 27 suben la
> fila de **guardia directo**, 314→341: cada una pasa por `can(` o por un `require…Access`
> (`requireCatalogoAccess`, `requireEntradaDeCatalogoAccess`, `requireRutinaAccess`) antes de
> leer o escribir. 434→461, en 135 archivos.

> **Anular una asignación a tienda (ADR-170, 2026-09-18).** Una operación nueva,
> `anularAsignacion` en `lib/commerce/tienda.ts`, y sube la fila de **guardia directo**,
> 309→310 tras rebasar sobre las fincas (#425): exige `commerce:manage_store` o, si no, `requireLotAccess("manage")` sobre el lote
> de la asignación, antes de escribir nada. 429→430.

> **El de 420→421, sin archivo nuevo, es `requestTrampaPhotoUpload`
> (`lib/traceability/landMedia.ts`, ronda de arreglos finales de vistas de
> finca y parcela, A6 / I2).** Antes no sumaba fila: no hacía ningún
> `prisma.*` directo, sólo llamaba al guardia y firmaba la URL. El arreglo de
> I2 —una `storageKey` derivada del `photoClientDraftId` podía sobrescribir
> los bytes de un `Asset` ajeno antes de que `finalizeTrampaPhotoPorBorrador`
> llegara a comprobar de quién era— le añadió dos lecturas propias
> (`asset.findUnique` por la clave, `specimenObservation.findUnique` por la
> revisión) para rechazar ANTES de firmar el PUT cuando la clave ya
> pertenece a otra revisión. Sigue gateada por `requireTrapAccess`, sin
> cambio de clase. `listLandAssets` (A8/M1, gana `location` y la llamada a
> `can()` para no listar fotos de trampa sin `specimen:view`/`manage`),
> `recordTrapCheck` (A9/M2, reordena su lookup por `clientDraftId` para que
> corra después del control de acceso) y `pushFieldEvents`
> (`aplicarRevisionDeTrampa`, mismo A9, ahora resuelve la trampa y llama a
> `requireTrapAccess` directamente en vez de sólo delegar en
> `recordTrapCheck`) también cambiaron su lista de modelos/guardias, pero
> ninguna cambió de clase — las tres ya eran **guardia directo**.
>
> **El de 419→420, sin archivo nuevo, es `finalizeTrampaPhotoPorBorrador`
> (`lib/traceability/landMedia.ts`, Tarea 12 de vistas de finca y parcela).**
> Sube la fila de **guardia directo**: llama a `requireTrapAccess`
> (`specimen:manage`), nunca a `requireLocationAttributeAccess` — ruling P2 del
> controlador, para que la foto de la ronda se autorice igual que la revisión
> que documenta. `requestTrampaPhotoUpload`, su pareja del paso 1, **no** suma
> fila: como `requestLandAssetUpload` (ya inventariado, cero filas propias),
> no hace ningún `prisma.*` directo — sólo llama al guardia y al proveedor de
> almacenamiento. Las dos nuevas Server Actions
> (`requestTrampaPhotoUploadAction`, `finalizeTrampaPhotoPorBorradorAction`,
> en `app/actions/traceability.ts`) tampoco suman: delegan toda su
> autorización en `lib/traceability/landMedia.ts`, el mismo criterio de la
> nota de la Tarea 3 más abajo.

> **Y el de 417→419, con un archivo nuevo, es `lib/traceability/fincaTrampas.ts` (Tarea 7 de
> vistas de finca y parcela).** `getFincasConTrampas` y `getFincaTrampas` suben dos veces la
> fila de **guardia directo**: las dos recorren los lotes de la finca y llaman a
> `puedeVerTrampasDelLote` (`can(..., "view"/"manage", "specimen", ...)`) lote por lote —la
> misma comprobación que ya usa `requireTrapAccess` en `traps.ts`, sólo que agregada sobre
> varios lotes en vez de uno—. `getFincaTrampas` lanza `FincaTrapAccessError` si ningún lote de
> la finca es accesible, en vez de devolver una lista vacía que se leería como «sin trampas»
> (spec §6). 2 = 2: si la cuenta no cerrara con la fila de «guardia directo», alguna de las dos
> habría quedado sin comprobar el ámbito lote por lote.

> **El de 416→417, sin archivos nuevos, es `setPlotBlockType` (Tarea 1 de vistas de
> finca y parcela).** Vive en `lib/traceability/plotBlocks.ts`, que ya estaba
> inventariado por `createPlotBlock` y `listPlotBlocks`. Sube la fila de **guardia
> directo**: llama a `requireLocationAttributeAccess` sobre la parcela del bloque
> —leída primero con `findUnique`, nunca confiando en el `locationId` del formulario—
> antes de escribir el tipo o la descripción.

> **Fusión de `origin/main` en `trampas-broca` (2026-09-18).** Los dos lados
> traían cifras propias —356/106 la rama, 376/116 `main`— y **ninguna de las dos
> vale para el árbol combinado**. Las de arriba son las que imprime
> `node scripts/inventario-de-acceso.mjs` sobre la fusión: **382 en 119**.

> **Y el de 419→422, con un archivo nuevo, es el plan 3 de «editar beneficio»
> (Tarea 4, ADR-168, 2026-09-18): conceder y quitar desde `/beneficio/ajustes`.**
> `lib/traceability/concesiones.ts` aporta **tres** operaciones y las tres
> llevan **guardia directo**, 300→303: `concederEditarBeneficio`,
> `quitarEditarBeneficio` y `personasDelBeneficio` empiezan las tres por
> `exigeEditarBeneficioEn` (ADR-167) sobre el propio beneficio, antes de leer o
> escribir nada. 3 = 3: si la cuenta no cerrara con la fila de «guardia
> directo», alguna se habría colado sin esa guardia. Las pantallas y acciones
> de servidor (`app/actions/beneficios.ts`, `app/beneficio/ajustes/Concesiones.tsx`,
> `sitiosParaCrearInstalacion` en `instalaciones.ts`) no suman fila propia: sólo
> llaman a operaciones ya inventariadas o a los booleanos `puedeEditarBeneficioEn`/
> `puedeEditarBeneficioEnOrganizacion`, que no tocan la base por su cuenta.

> **Y el de 350→354, con un archivo nuevo, es el servicio de beneficio (Tarea 2 del
> plan de alta de beneficio).** `lib/traceability/beneficios.ts` aporta **cuatro**
> operaciones y las cuatro llevan **guardia directo**: `sitiosParaBeneficio`,
> `listarBeneficios`, `crearBeneficio` y `actualizarBeneficio` resuelven `can()` contra
> el sitio antes de leer u ofrecer nada, y crear exige además `location:create_site`
> sobre el padre, que es el permiso nuevo de la Tarea 1. 4 = 4: si la cuenta no
> cerrara con la fila de «guardia directo», algo se habría colado sin ese segundo
> permiso.

> **Tarea 3 (2026-09-17, sin cambio de cifras): la pantalla de ajustes del beneficio.**
> `app/actions/beneficios.ts`, `app/beneficio/ajustes/page.tsx` y su formulario no
> aparecen como operaciones propias: no llaman a `prisma` directamente, sólo a
> `sitiosParaBeneficio`, `listarBeneficios`, `crearBeneficio` y `actualizarBeneficio`,
> que ya están inventariadas desde la Tarea 2. `node scripts/inventario-de-acceso.mjs`
> vuelve a imprimir exactamente **354** operaciones en **104** archivos — el mismo
> reparto de la nota anterior—, y eso es lo esperado: una pantalla que delega toda su
> autorización en el servicio no suma una fila nueva al inventario.

> **Tarea 8 del plan fitosanitario (2026-09-18): 383→386, con tres operaciones
> nuevas, las tres guardia directo.** `productosFitosanitarios()`
> (`lib/traceability/intervenciones.ts`) resuelve `requireLotAccess(view)` sobre la
> parcela; `listPlantSpecimens()` y `lecturaDeTrampaQueMotivo()`
> (`lib/traceability/specimens.ts`) resuelven `requireSpecimenAccess(view)`. Ningún
> archivo nuevo: las tres viven en archivos ya inventariados.

> **Ronda final de revisión (2026-09-18, hallazgo 3): 386→387, una operación
> nueva, guardia directo.** `requireOpenFieldSessionForEvent()`
> (`lib/traceability/fieldSessions.ts`) se extrajo de `recordFieldEvent()` para que
> `registrarIntervencion()` la reutilizara antes de escribir su `FieldEvent`: antes
> sólo comprobaba parentesco de ubicación con la jornada, nunca autorización sobre
> ELLA. Resuelve `requireFieldSessionAccess()` sobre `session.locationId`, que es la
> misma compuerta que ya usaba `recordFieldEvent()` — de ahí que sume una fila y no
> dos: la llamada existente no cambió de forma, sólo de sitio. Ningún archivo nuevo:
> vive en `fieldSessions.ts`, ya inventariado.

> **Y el de 387→389, sin archivo nuevo, es el plan 2 de «editar beneficio» (Tarea 4,
> 2026-09-18).** Dos operaciones más en `lib/traceability/locations.ts`:
> `exigeEditarBeneficioEn` (sobre una ubicación, sea del tipo que sea) y
> `exigeEditarBeneficioEnOrganizacion` (en algún lugar de una organización, o en
> plataforma si no hay ninguna) — las dos **guardia directo**, 274→275. La otra
> unidad, «acotado por construcción» 34→35, es la propia
> `exigeEditarBeneficioEnOrganizacion`: recorre las `Location` de la organización y
> se detiene en la primera donde `can()` acepta, así que no puede devolver una
> concesión ajena a esa organización. `instalaciones.ts` y `processTargets.ts` pasan
> a llamar a estas dos guardias, y `equipos.ts` gana `puedeConfigurar` — sin fila
> propia porque no es una función exportada, sólo una que las seis escrituras de
> equipos y `sitiosParaRegistrar` ya citaban por su cadena `guardias`/`transitivo`.
> **Fuera del cambio de cifras:** `lib/inventario/materiales.ts` y `recepcion.ts`
> siguen comprobando `equipment:manage` directamente y no pasan por
> `puedeConfigurar` — el módulo de insumos reutiliza el permiso de equipos y este
> plan no lo toca (§3 de la spec, nota del 2026-09-18).

> **Fusión de `origin/main` en `fitosanitarios` (2026-09-18).** Los dos lados
> traían cifras propias sobre árboles distintos —387/118 aquí, tras la ronda final
> de revisión, y 430/130 en `main`— y **ninguna de las dos vale para el árbol
> combinado**. Las cifras del encabezado y de la tabla de arriba son las que
> imprime `node scripts/inventario-de-acceso.mjs` sobre la fusión: **437 en 131**.

> **Segunda integración de `origin/main` en `fitosanitarios` (2026-09-19).** Volvió a
> pasar lo mismo: 437/131 aquí (con los arreglos post-merge de la primera integración) y
> 434/131 en `main` (alzas con marca, ADR-171 de `main`), y **ninguna de las dos vale
> para el árbol combinado**. Las cifras de arriba son las que imprime
> `node scripts/inventario-de-acceso.mjs` sobre esta segunda fusión: **441 en 132**.

> **Tercera integración de `origin/main` en `fitosanitarios` (2026-09-19).** Otra vez la
> misma forma: 441/132 aquí y 461/135 en `main` (catálogos, rutinas y modelos de equipo,
> ADR-172 de `main`), y **ninguna de las dos vale para el árbol combinado**. Las cifras de
> arriba son las que imprime `node scripts/inventario-de-acceso.mjs` sobre esta tercera
> fusión: **468 en 136**.

> **Tareas 8 y 9 (2026-09-16):** el inventario incluye las opciones de inspección y
> el servicio de instalaciones. Las cifras anteriores se regeneraron con
> `node scripts/inventario-de-acceso.mjs --json`. Las lecturas usan los permisos de
> muestreo o de administración de atributos; las escrituras de instalaciones autorizan
> el padre o la ubicación editada y auditan dentro de la transacción.

> **Las de 331→333 son `instrumentosParaMedicion` (`lib/equipos/equipos.ts`) e
> `inspeccionesParaMedicion` (`lib/traceability/measurements.ts`)**, las dos de la Tarea 7 del
> plan de secado y las dos **guardia directo**. Alimentan el formulario de medición: los
> instrumentos que este usuario puede usar, y las inspecciones a las que puede colgar la lectura.
>
> **CORREGIDO EL 2026-09-16.** Esta nota decía antes que las dos operaciones eran «la lectura de
> los modos y la escritura de la marca dentro de `recordMeasurement`». **Era falso, y lo encontró
> una revisión independiente.** El detector cuenta **funciones exportadas** que alcanzan la base;
> dos ramas nuevas dentro de una función que ya estaba inventariada no suman nada. La explicación
> era plausible y nadie la había medido — que es exactamente el defecto que este documento
> existe para impedir.
>
> **Y la de 333→334 es `registrarInspeccion`** (`lib/traceability/samplingEvents.ts`), de la
> Tarea 8: el acto de muestreo y sus muestras en una sola transacción. Guardia directo, y desde
> el hallazgo I1 de esa misma revisión autoriza **cada contexto declarado** —el lote, la cama y
> la corrida— y no sólo el lote.
>
> **El de 329→330, con un archivo nuevo, es `createSamplingEvent`.** Vive en
> `lib/traceability/samplingEvents.ts`, que entra hoy al inventario. Es **guardia directo**: no
> hereda el permiso de nadie, lo resuelve él por tres caminos según lo que traiga la entrada —la
> corrida de secado a través del lote de su transformación, la cama, o ámbito de plataforma
> cuando no hay ninguno de los dos— y sólo entonces escribe. Su `AuditEvent` va en la MISMA
> transacción que el evento, y su prueba «revierte el evento si falla la auditoría» lo comprueba
> en vez de darlo por hecho.
>
> **Y el de 327→328, sin archivos nuevos, es `crearColocacionInicial` (ADR-135).** Vive en
> `lib/apiary/hives.ts`, que ya estaba inventariado. Recibe el `tx` de quien acaba de crear la
> colmena y escribe **una** fila; no consulta nada, así que no puede leer de más aunque reciba
> el cliente entero. Lleva sus dos entradas —`reciben_transaccion` y `dependen_del_llamador`—
> porque las dos preguntas son distintas: por qué se le pasa una transacción abierta, y quién
> autoriza en su lugar.

> **Y el inventario con existencias suma cinco archivos** —`lib/inventario/`
> materiales, lotes, existencias y lista— y sube la fila de **guardia directo**:
> definir un material exige `equipment:manage`, recibir y gastar `lot:manage`,
> leer existencias `lot:view`, y la lista filtra cada lote por su ubicación.

> **Y el de 347→350, con dos archivos nuevos, es la trilla y sus subproductos.**
> `lib/traceability/trilla.ts` es un envoltorio fino sobre `recordTransformation`
> —no toca la base por su cuenta— y `lib/traceability/subproductos.ts` sí, con su
> entrada propia en el allowlist. Las tres suben la fila de **guardia directo**:
> `crearSubproducto` autoriza contra los lotes de ENTRADA de la transformación,
> porque quien no puede tocar ese lote no puede declarar lo que salió de él.

> **Y el de 350→352, con un archivo nuevo, es `lib/traceability/plotBlocks.ts`.**
> `createPlotBlock` y `listPlotBlocks` (Tarea 2 de trampas de broca) suben la fila de
> **guardia directo**: las dos llaman a `requireLocationAttributeAccess` antes de tocar
> `PlotBlock`, la misma compuerta de «configurar la parcela» que usa `locations.ts`.

> **Y el de 352→353, con un archivo nuevo, es `lib/traceability/traps.ts`.**
> `createTrap` (Tarea 3 de trampas de broca) sube la fila de **guardia directo**: llama a
> `can(..., "manage", "specimen", ...)` en su propio `requireTrapAccess`, la compuerta de
> `specimens.ts` — no la de la parcela, porque dar de alta una trampa es gestionar un
> `Specimen`, no configurar la parcela.

> **Y el de 353→354, sin archivo nuevo, es `recordTrapCheck` en el mismo
> `lib/traceability/traps.ts` (Tarea 4 de trampas de broca).** Sube otra vez la fila de
> **guardia directo**: pasa por el mismo `requireTrapAccess` que `createTrap`, después de su
> propio `prisma.specimen.findUnique` para confirmar que el `id` recibido es una trampa
> (`specimenType: "trap"`) y no cualquier otro `Specimen`. No necesita entrada nueva en el
> allowlist — el archivo ya estaba en la lista desde la fila anterior.

> **Y el de 354→356, con un archivo nuevo, es `lib/traceability/trapRules.ts` (Tarea 7 de
> trampas de broca).** `saveTrapRule` y `getTrapRule` suben dos veces la fila de **guardia
> directo**: las dos pasan por `requireLocationAttributeAccess` sobre la finca
> (`farmLocationId`) antes de tocar `trap_rule` — la compuerta de «configurar la parcela»,
> la misma de `plotBlocks.ts`. Entrada nueva en el allowlist como módulo de dominio.

> **Y el de 382→383, sin archivo nuevo, es exportar `requireTrapAccess` (ronda de arreglos
> finales de trampas de broca, F5).** No cambia ningún permiso: sigue siendo exactamente
> `can(..., "manage", "specimen", ...)`, sin tocar. Lo que cambia es que
> `lib/traceability/landMedia.ts` ahora la LLAMA — antes, colgar la foto de una revisión de
> trampa sólo exigía `location:manage_attributes` (la compuerta genérica de la parcela), así
> que a alguien con la parcela pero sin `specimen:manage` le bastaba para adjuntar evidencia
> a una revisión que ni siquiera podía crear. Como `requireTrapAccess` no era `export`, el
> inventario no la veía como operación propia; al exportarla para reutilizarla, la cuenta la
> recoge por primera vez — aunque llevaba autorizando `createTrap`/`recordTrapCheck` desde la
> Tarea 3. `getPlotDetail` (`lib/traceability/plantingCohorts.ts`) recibió el mismo tipo de
> arreglo —ahora exige además `specimen:view` antes de incluir la sección de trampas— pero no
> sube la cuenta: ya era **guardia directo** por `requireLocationAttributeAccess`, y añadir un
> segundo `can(...)` dentro de una función ya contada no crea una fila nueva.

> **Y el de 342→345 son los tres ajustes de permiso por asignación (ADR-146).** Viven en
> `lib/rbac/admin.ts`, que ya estaba inventariado, y suben la fila de **guardia directo**:
> `listAssignmentPermissions`, `setPermissionOverride` y `clearPermissionOverride` exigen
> `platform:manage_users` antes de leer o escribir nada. Ninguna es acotada por construcción:
> tocan la asignación de otra persona, así que el guardia tiene que ser explícito.

> **Y el de 364→366 son las dos de la limpieza de la caja (ADR-159).** `registrarLimpiezaDeCaja`
> sube **guardia directo**: exige `requireApiaryAccess` sobre la caja antes de escribir.
> `limpiezasDeCaja` **no recibe principal** y va en `dependen_del_llamador`: su único llamador es
> la ficha de la colmena, que la invoca DESPUÉS de que `getHive` autorice —y `getHive` lanza si
> no hay permiso—, pasándole el id de la caja ya autorizada.

> **Y el de 366→367 es `registrarLecturaDeRefractometro` (ADR-160).** Vive en
> `lib/apiary/cierreDeCosecha.ts`, que ya estaba inventariado, y sube **guardia directo**: exige
> `requireApiaryAccess` sobre la colmena de la cosecha antes de leer modos o escribir, y cada
> medición pasa además por `recordMeasurement`, que vuelve a autorizar contra el lote.
> `cosechasDeColonia` sigue en `dependen_del_llamador` sin cambio de cifra: ahora lee también
> el Brix, pero es la misma consulta sobre los mismos lotes ya autorizados.

> **Y dos más, con un archivo nuevo, son los pasos de la miel (ADR-161).**
> `lib/apiary/mielDelLote.ts` lee el lote DESPUÉS de `requireLotAccess("manage")` —ni siquiera
> dice si es miel antes de autorizar— y escribe por `recordTransformation`, que vuelve a
> autorizar. La otra es `getLotDetail`, ya inventariado: busca la cosecha de origen de una miel
> subiendo por la genealogía, dentro de la lectura que ya exigió `requireLotAccess("view")`.

> **Y el de 378→379 es `dividirMiel` (ADR-162)**, en el mismo archivo: pasa por `loteDeMiel`, que
> autoriza con `requireLotAccess("manage")` antes de leer nada, y escribe por `recordTransformation`.

> **Y el de 380→382, con un archivo nuevo, es `registrarIntervencion`/`corregirIntervencion`
> (Tarea 5, manejo fitosanitario, spec 2026-09-18).** Viven en
> `lib/traceability/intervenciones.ts`. Las dos suben **guardia directo**: resuelven
> `requireLotAccess("manage")` sobre la parcela —la de la intervención al registrar, la de la
> original al corregir— antes de tocar materiales, frascos, plantas o jornada. Sus ayudantes
> privados `crearAreas`/`crearLineasDeIntervencion` reciben el `tx` del llamador ya autorizado
> —la misma razón que `crearColocacionInicial`— y por eso llevan su propia entrada en
> `reciben_transaccion`, no en `dependen_del_llamador`: no son funciones exportadas que el
> detector cuente como operación propia.

> **Y el de 382→383, sin archivo nuevo, es `listarIntervenciones` (Tarea 6,
> manejo fitosanitario, spec 2026-09-18 §3.3/§3.4).** Vive en
> `lib/traceability/intervenciones.ts`, ya inventariado desde la Tarea 5, y sube
> **guardia directo**: resuelve `requireLotAccess("view")` sobre la parcela antes
> de listar sus intervenciones. **`intervencionesVigentes`, la otra función nueva
> de esta tarea, no aparece como operación propia**: no recibe principal —toma
> una lista de `locationIds` ya resuelta por `ubicacionesEmparentadas`, que
> tampoco autoriza— porque quien la llama (`recordHarvestEvent`) ya pasó su
> propia compuerta. Es la misma razón que ya excluye a
> `crearAreas`/`crearLineasDeIntervencion` de la nota de arriba: el detector
> cuenta operaciones con principal, no cada función que toca `prisma`.

> **Y seis más, con un archivo nuevo, son la tienda (ADR-163).** `lib/commerce/tienda.ts`
> aporta cuatro de **guardia directo** —`asignarATienda` con `requireLotAccess("manage")`;
> `confirmarRecepcion`, `crearVariante` y `tiendaParaGestionar` con `commerce:manage_store`— y
> dos que **dependen del llamador**: `asignacionesDeLote` y `variantesParaAsignar`, que sólo llama
> la ficha del lote después de que `getLotDetail` autorice. 4 + 2 = 6.

> **Y dos más, con un archivo nuevo, son las cosechas sin saldo (ADR-166).**
> `lib/apiary/cosechasSinSaldo.ts`: `asentarPesoDeCosecha` sube **guardia directo**
> (`requireApiaryAccess("manage")`) y `cosechasSinSaldo` **depende del llamador**: sólo la llama
> la ficha del apiario después de que `getApiaryDetail` autorice.

> **Y dos más, en `lib/commerce/tienda.ts`, son el despacho (ADR-169).** `pedidosPorDespachar` y
> `despacharPedido` suben **guardia directo**: los dos exigen `commerce:manage_store` antes de
> leer nada.

> **Y el de 355→356 es `registrarVitalesEnSitio` (ADR-157).** Vive en
> `lib/apiary/vitalesEnSitio.ts` y sube la fila de **guardia directo**: exige
> `requireApiaryAccess` sobre el sitio de la visita antes de escribir. Su puerta afirma **una
> sola cosa** —que la visita seguía abierta— y a propósito no comprueba GPS: las coordenadas de
> `startLatitude` son del arranque, no de ahora, y exigirlo dejaría sin registrar una visita bajo
> dosel cerrado, que es justo donde están las abejas.

> **Y el de 350→351 es `registrarValoracionDeInspeccion` (ADR-154).** Vive en
> `lib/apiary/valoracionDeInspeccion.ts` y sube la fila de **guardia directo**: exige
> `requireApiaryAccess` resuelto por la colmena de la colonia antes de escribir. Y aplica las
> reglas de plazo de la **visita** —no unas nuevas— porque `Inspection` no tiene cierre
> propio; inventarle uno duplicaría la máquina de `FieldSession`.

> **Y el de 341→342 es `lugaresParaSitioDeAbejas` (ADR-145).** Vive en `lib/apiary/hives.ts`,
> que ya estaba inventariado, y sube la fila de **acotado por construcción**: filtra por
> `resolveApiaryVisibility`, que sale de las asignaciones del propio principal, así que **no
> puede** devolver los lugares de otro. Por eso no necesita entrada en el allowlist.

> **El de 329→330, con un archivo mas, es lo que quedo pendiente al cerrar (ADR-138).**
> `pendientesDeLaVisita` vive en `lib/apiary/pendienteDeLaVisita.ts`, nuevo. Cae en **«depende
> del llamador»** por la misma razon que `vitalesDeColmenas`: recibe un id de jornada que la
> pantalla ya tiene concedido, y con un id ajeno devolveria el dato ajeno. Lleva su entrada en
> el allowlist con su fecha.

> **Y el de 328→329, tampoco con archivo nuevo, es el manejo en lote (ADR-136).**
> `registrarEventoEnLote` vive en `lib/apiary/colonyEvents.ts`, que ya estaba inventariado, y
> sube la fila de **guardia directo**: llama a `requireColonyEventWriteAccess` con **todos**
> los ámbitos concretos en juego antes de escribir nada, porque las colmenas de un mismo
> apiario pueden colgar de proyectos distintos y pasar uno solo rechazaría el caso normal. Por
> eso **no** necesita entrada en el allowlist.
>
> Las dos subidas llegaron el mismo día por ramas distintas y **las dos decían 328**. Se
> rebasó la segunda y se volvió a medir: 329, con una fila distinta movida por cada una. Lo
> dijo el guardia de cifras, que es exactamente para lo que está.

> **El de 326→327, con un archivo más, son los vitales por colmena del Anexo E §3.**
> `vitalesDeColmenas` vive en `lib/apiary/vitalesDeColmena.ts`, nuevo, así que sube archivo y
> operación. Cae en **«depende del llamador»** y no en «acotado por construcción», y la
> diferencia con la fila de abajo es exactamente la que importa: `jornadaAbiertaDe` filtra por
> el propio principal, así que la base le impide devolver lo ajeno; éste recibe **ids de
> colmena** que la ficha del apiario ya tiene concedidos, y **con un id ajeno devolvería el
> dato ajeno**. Su seguridad está en quien lo llama, que es lo que dice ese cajón, y por eso
> lleva entrada en el allowlist con su fecha.

> **Y el de 325→326, con los archivos igual, es la jornada abierta del Anexo E §5.**
> `jornadaAbiertaDe` vive en `lib/traceability/fieldSessions.ts`, que ya estaba inventariado,
> así que sólo sube la cuenta de operaciones. Y sube la de **acotado por construcción** —no la
> de «depende del llamador»—: filtra `createdBy` por el propio principal, así que **no puede**
> devolver la jornada de otra persona. Por eso **no necesita entrada en el allowlist**; el
> script la clasifica solo, y está comprobado que no aparece entre las que hay que mirar a
> mano.

> **El salto del 2026-09-14 por la tarde —311→318 y 93→94— es de una pieza**: el módulo
> de equipos e instrumentos, `lib/equipos/equipos.ts`. Aporta **catorce** operaciones y las
> **catorce llevan guardia directo**, que es por lo que la fila de «guardia directo» sube
> exactamente 207→217 y ninguna otra fila se mueve. 14 = 14: si la cuenta no cerrara, alguna
> se habría colado sin autorizar. (La octava, `estadosDeInstrumentoPorMedicion`,
> resuelve el permiso una vez por instrumento en vez de una por lectura.)
>
> **Y una de las siete no lo llevaba.** `estadoDelInstrumento` se escribió sin recibir
> principal —leía el equipo y sus verificaciones para decir si estaba revisado— y lo cazó
> este mismo guardia, no una relectura. Se le puso `equipment:view`, que §9 de
> `EQUIPMENT_AND_READINESS.md` creó justo para esa lectura: ver un lote no es ver el
> inventario de instrumentos de un sitio.

> **Y el del 2026-09-14 —305→311 y 92→93— también**: la consulta a fincas vecinas del
> Anexo E §4. `lib/apiary/consultaAVecinos.ts` aporta **dos** operaciones con guardia
> directo —`registrarConsultaAVecinos` y `vecinosOfrecidos`, las dos con
> `requireApiaryAccess("manage")` sobre el apiario— y **cuatro** lectores que dependen del
> llamador, los cuatro anotados con su fecha. 2 + 4 = 6, que es exactamente el salto: si no
> cuadrara, significaría que entró algo más sin pasar por aquí.

> **El salto del 2026-09-13 —299→305 y 91→92— es de una sola rebanada**, el traslado de
> colmenas del Anexo E §8: `lib/apiary/traslado.ts` aporta una operación con guardia
> directo (`trasladarColmenas`, que autoriza origen **y** destino) y cinco lectores que
> dependen del llamador, los cinco anotados en el allowlist con su fecha. Que el delta
> cuadre exactamente con lo añadido es la comprobación de que ninguna otra operación entró
> sin pasar por aquí.

> Estas cifras son de la segunda medición. La primera decía 195 y 51, y estaba
> mal por un defecto del propio detector — la historia está abajo, en «El
> detector no veía siete operaciones».
>
> **Subida del 2026-09-04 (227→229, 58→60):** los dos archivos nuevos de la
> primera rebanada de P4, `lib/sync/devices.ts` y `lib/sync/pushFieldEvents.ts`.
> Uno cuenta como «guardia directo» y el otro como «acotado por construcción»:
> `pushFieldEvents` no llama al servicio de autorización por su cuenta —lo hace
> `recordFieldEvent`, en cada mutación—, y su propia consulta previa sólo mira
> `client_draft_id` y el estado del aparato. Que el detector lo clasifique así
> es correcto y vale la pena decirlo, porque «acotado por construcción» aquí no
> significa «sin autorización»: significa que la autorización está una capa más
> abajo, en la escritura, que es donde el audit §18 la quiere.
>
> **Subida del 2026-09-05 (229→230, 60→61):** `lib/sync/pullFieldWork.ts`, el
> pull por cursor de P4 §5. Cuenta como «guardia directo» y es correcto: llama
> a `can()` por Location para resolver el ámbito antes de leer nada, que es
> justo lo que esa clase describe.
>
> **Subida del 2026-09-05 (230→232, 61→62):** `lib/sync/fieldMedia.ts`, la cola
> de medios de P4 §7. Dos operaciones y un archivo: gatea por la Location de la
> jornada antes de tocar nada, así que las dos cuentan como «guardia directo».
>
> **Y (232→233, 62→63):** `lib/sync/authorizationSnapshot.ts`, la instantánea
> de P4 §8. «Guardia directo» porque resuelve con `can()` antes de incluir nada
> — pero conviene decirlo: lo que produce es una ayuda de interfaz, no una
> frontera. La frontera sigue siendo `can()` en cada mutación.
>
> **Y (233→235, 63→64):** `lib/sync/deviceTokens.ts`, el carril de tokens de
> P4 §2. Sus dos operaciones caen en «recibía principal sin guardia visible», y
> la etiqueta es literal pero engañosa aquí: **no comprueban principal porque lo
> ESTABLECEN**. `registrarAparato` valida correo y contraseña; `refrescarAcceso`
> se autentica con el refresh token y es donde muerde la revocación. Son el
> equivalente de la clase «flujo-auth» del inventario del router, que este
> detector no tiene.

> **Y (545→544, acotado por construcción 41→40), 2026-09-21, decisión P-G:**
> `getObserverCandidates` dejó de consultar la base —era la lista de TODA persona activa— y
> delega en `personasPermitidas` de `lib/people/quienLoHizo.ts`. Ese módulo nuevo **no suma
> operaciones**: consulta a través de su parámetro `db` (el cliente o el `tx` de quien llama), una
> forma que el detector no cuenta. Está inventariado a mano en el allowlist, en
> `importan_cliente_total` y en `reciben_transaccion`, con su razón.

> **Y (577→578, «guardia directo» 435→436), 2026-09-25:** `exigirMuestraUsable`
> (`lib/sensory/sessions.ts`), la comprobación de que una muestra es visible y no está retirada,
> extraída para que el informe externo pregunte lo mismo que la cata interna. Llama a `can()` con el
> principal, así que entra como guardia directo. La caminata de ascendencia de
> `tieneSecadoTerminadoArriba` (`samples.ts`) no suma: es privada y consulta con el cliente del
> módulo, que ya está inventariado.

> **Y (578→579, «guardia directo» 436→437), 2026-09-25:** `puedeSubdividirParcela`
> (`lib/traceability/fincas.ts`), el predicado que pinta «Nueva microparcela». Llama a `can()` con el
> principal y el mismo permiso que exige `createMicrolot`, así que entra como guardia directo. Existe
> porque el botón se pintaba sin comprobar nada.

> **Y (579 igual, «guardia directo» 437→444, «acotado por construcción» 27→20), 2026-09-25:**
> `resolveLotVisibility` baja a los descendientes de un ámbito de lugar (`conDescendientes`), la
> mitad que faltaba de ADR-144. **Siete operaciones cambian de clase sin cambiar su autorización**:
> `resolveLotVisibility`, `getLotList`, `getActiveOperations` y `getManageableContext` (lots.ts),
> `buildProducerExport`, `reporteDeProceso` y `listRoastSessions`. Pasan de «acotado por
> construcción» a «guardia directo» porque la caminata hacia abajo añade una consulta que no filtra
> por el principal, y el detector reconoce **formas**: ya no ve el patrón de acotado, ve el guardia
> que esas funciones siempre tuvieron. Lo que se ve en pantalla sí cambia, y para eso están sus
> pruebas; la autorización por recurso es la misma de antes.
>
> **Y una lección de medición, porque casi la firmo mal:** al aislar el efecto alterné SÓLO la línea
> del `conDescendientes` y las dos corridas dieron lo mismo, así que concluí que mi cambio no movía
> las cifras. Falso: lo que las mueve es el diff completo —el ayudante nuevo en el archivo—. Aislar
> una línea de un cambio de varias no aísla nada.

> **Y (579→580, «guardia directo» 444→445), 2026-09-25:** `darDeBajaRecolector`
> (`lib/traceability/jornadasDeCosecha.ts`), el inverso que a `agregarRecolector` le faltaba desde el
> principio. Exige `exigeGestionarFinca` antes de escribir, así que entra como guardia directo.

### Las tres que no encajaban en ninguna regla (medición del 2026-08-31, por la mañana)

> **Hoy queda una.** `authConfig()` y `addToCart()` dejaron de ser excepciones esa misma
> tarde, al mejorar el detector — no porque cambiara su código. Se conservan aquí porque
> el razonamiento a mano sigue siendo el que sostiene la clasificación automática.

> **Y (575→577, «depende del llamador» 80→82), 2026-09-25:** `esTuesteDeLaMuestra` y
> `tienePreparacionTostada` (`lib/sensory/sessions.ts`), la regla del tueste servido extraída para
> que la usen los DOS escritores de sesiones de cata. Sólo leen; quien llama ya autorizó la muestra
> y exige `sensory:manage_session`. Están en el allowlist con su razón.

- **`lib/auth/config.ts authConfig()`** — es la configuración de Auth.js: el
  propio flujo de autenticación, previo a que exista sesión.
- **`lib/commerce/cart.ts addToCart()`** — lee una variante aplicando «la misma
  puerta pública que `lib/discover/service.ts`» y escribe **el carrito del
  propio titular**.
- **`lib/rbac/admin.ts listScopeChoices()`** — la llama
  `app/admin/users/page.tsx`, que antes hace `requirePermissionAdmin`.

**Ninguna es un agujero.**

### Las 19 que dependen del llamador: verificadas una a una, y ahora fijadas (2026-08-31)

`node scripts/inventario-de-acceso.mjs --llamadores` resuelve quién llama a cada
una y si ese llamador autoriza. Ocho salen con guardia en todos sus llamadores.
Las once restantes, miradas a mano:

| Operación | Por qué está bien |
|---|---|
| `lib/audit.ts recordAuditEvent()` | Escribe una fila de auditoría; no **lee** datos gobernados. Es infraestructura posterior a una operación ya autorizada. De sus 30+ llamadores, cuatro no gatean —los flujos de alta, sesión y comercio—, y ninguno le pasa datos ajenos |
| `markOrderPaid()` · `markBookingPaid()` | Los invoca el webhook de Stripe, **autenticado por firma** y no por sesión. Actor de sistema |
| `createCheckoutSessionForOrder()` · `createCheckoutSessionForBooking()` | Sus acciones exigen sesión y construyen el pedido o la reserva **desde `user.userAccountId`**: nunca desde un id recibido |
| `getFieldEventKinds()` | Lee `variableCatalogValue` — catálogo de referencia, no datos gobernados. Su página exige sesión |
| `hasProcessingStage()` · `getBedLevelContext()` | **Sin llamador de producción**: sólo las usan los tests. Exportadas para poder probarlas |
| `applyInputDecrements()` | La llama `settleMassBalance()` en su **propio archivo**, que sí guarda |
| `getSelectionOutturn()` · `getSelectionCatalogs()` | `app/lots/[id]/page.tsx`, que gatea antes |

**Ninguna de las 208 operaciones quedó sin explicar.**

### Lo que esta verificación NO establece

Que la autorización sea **correcta**. Un `requireLotAccess` con el permiso
equivocado sigue contando como guardia, y un llamador que gatea sobre el recurso
equivocado también. Lo que queda demostrado es más modesto y más comprobable:
**no hay operaciones cuyo camino de autorización nadie haya mirado.**

Dos cosas menores que salieron al mirar, anotadas y no arregladas:
`hasProcessingStage()` y `getBedLevelContext()` son código de producción con
llamadores sólo en tests.

### Cómo cambió el mapa al arreglar el detector

| | Sin explicar |
|---|---:|
| Primer intento | 42 |
| Tras resolver **guardias locales** | 28 |
| Tras reconocer **resolutores de visibilidad** y **dependencia del llamador** | 3 |
| Tras mirar esas tres a mano | **0** |

El salto de 42 a 28 fue un fallo mío: el detector reconocía
`require\w*(Access|Admin|Override)` **por el nombre**, y se perdía
`requireManagePermission()` —un guardia local, no exportado, que llama a
`can()`— y con él las siete operaciones de `lib/sensory/calibration.ts`.
Reconocer un nombre no es reconocer un guardia. Es la sexta vez en esta jornada
que el mismo defecto aparece en un sitio distinto.

## Lo que esto NO dice

Reconoce **formas escritas, no propiedades**:

- Un guardia con el permiso equivocado se cuenta como guardia.
- Un acotado por construcción escrito de otra manera aparece como «sin guardia».
- El troceo por función es textual. Una primera versión cortaba en el siguiente
  `export` y atribuía a `slugify()` —una función pura— las consultas del
  `uniqueSlug()` no exportado de debajo. Corregido, pero el método sigue siendo
  sintáctico.

Sirve para **decidir dónde mirar**, no para dar nada por bueno.

## El inventario ya no sólo informa

Desde el 2026-08-31, `tests/arquitectura/acceso-a-datos.test.ts` **falla** si
aparece una operación que ningún patrón explique. La excepción que queda
—`listScopeChoices()`— está inventariada en
`acceso-a-datos.allowlist.json` con su razón, y el test también falla si el
inventario nombra una que ya pasó a explicarse sola.

Antes esto era un informe: una operación nueva sin patrón aparecía en una salida
que nadie corre. Ahora la cuarta hay que justificarla o arreglarla, que es
exactamente la decisión que no conviene tomar en silencio.

Flip-testeado en las dos direcciones.

## El detector no veía siete operaciones

Encontrado el 2026-08-31, al comprobar por qué el documento decía 195 y el
script 194.

`MODELOS` enumeraba los métodos de Prisma y cerraba con `\b`:

```
findMany|findFirst|findUnique|create|...
```

**`findUniqueOrThrow` no tiene frontera de palabra tras `findUnique`.** No
coincidía, `modelos.length === 0`, y la operación **se descartaba entera** — ni
siquiera aparecía como «sin clasificar». Trece archivos usan esa variante.
`app/actions/checkout.ts` y `app/actions/bookings.ts` salían con **cero**
operaciones teniendo una consulta cada uno.

Dos huecos más del mismo tipo, cerrados a la vez:

- **SQL crudo.** `$queryRaw`/`$executeRaw` no llevan `.modelo.`, así que no
  había nada que capturar. Es justo el que más importa ver, porque se salta la
  capa de modelos entera. Hoy se registra con el modelo `SQL-crudo`. Hay uno:
  `lib/traceability/lots.ts getLotLineage()`, y tiene guardia directo.
- **El cliente entre paréntesis.** `lib/audit.ts` escribe
  `(tx ?? prisma).auditEvent.create(...)`. Un nombre suelto no lo ve, y el
  archivo entero salía con cero operaciones — mientras el documento lo citaba
  como una de las verificadas a mano. En todo el árbol hay **una** coincidencia
  de `).modelo.metodo(` y es esa, así que aceptarla no trae ruido.

Las siete operaciones recuperadas cayeron en clases ya autorizadas —cinco
`guardia directo`, dos `acotado por construcción`—: **el arreglo no destapó
ningún agujero de autorización, destapó un recuento corto.** Conviene decirlo
así y no dramatizarlo.

Es la misma lección del día por octava vez, ahora dentro del propio detector:
**se reconoce una forma escrita, no una propiedad.** Y la forma en que falla
importa — descartar en silencio es peor que clasificar mal, porque «sin
clasificar» tiene quien lo mire y lo descartado no aparece en ninguna parte.

## El cajón «depende del llamador» ya no es una foto

Hasta el 2026-08-31 estas 19 se verificaron a mano una vez y **nada detectaba
que el conjunto cambiara**. Una operación nueva sin principal caía aquí y nadie
volvía a mirarla.

Comprobado por mutación, no por argumento: añadir

```ts
export async function fugaDePrueba(lotId: string) {
  return prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
}
```

a `lib/traceability/lots.ts` —un archivo **ya inventariado**, así que el guardia
de imports calla— pasaba la compuerta en verde, con las doce pruebas pasando.

Desde hoy las 19 están fijadas en `acceso-a-datos.allowlist.json` con su razón y
su fecha de verificación, y el test falla en tres direcciones, las tres
comprobadas por mutación:

| Mutación | Veredicto |
|---|---|
| Operación nueva sin principal en archivo ya inventariado | **falla** |
| Entrada fijada que ya no depende del llamador (podredumbre) | **falla** |
| Entrada sin razón escrita | **falla** |
| Árbol limpio | pasa |

Lo que sigue **sin** demostrarse es lo de siempre, y conviene no confundirlo con
esto: que el guardia del llamador sea *el debido*. Aquí sólo se asegura que
nadie entre en el cajón sin que un humano lo mire y lo firme.


## Lo que encontró la revisión independiente (2026-08-31)

Rechazó las afirmaciones de cobertura dos veces. La primera vez acertó en dos de
tres hallazgos; ambos
comprobadas por mutación antes de creerlas, y ambas cerradas.

**1 · Una consulta delegada a un ayudante privado desaparecía entera.** Una
función exportada que delega todo su acceso en un ayudante no exportado del
mismo archivo no aparecía: ni ella ni el ayudante. `modelos.length === 0`, y la
compuerta en verde. Era el **mismo modo de fallo** que `findUniqueOrThrow`, que
se creía cerrado ese mismo día, sobreviviendo en otra forma.

Ahora el cuerpo de una operación exportada absorbe el de los ayudantes privados
que llama, transitivamente, y un ayudante con acceso al que no llega ninguna
exportada se emite como operación propia.

Un efecto secundario que merece decirse: `addToCart()` pasó de «sin patrón» a
**acotado por construcción**, porque la absorción trajo el
`where: { userAccountId }` de `getOrCreateActiveCart()`. Lo que antes era una
razón escrita a mano ahora lo demuestra la estructura. De tres excepciones
anotadas quedó **una**.

**2 · Los guardias se reconocían por nombre suelto, sin identidad de archivo.**
`guardanDirecto` era un `Set` global: una función homónima de un guardia de
cualquier otro archivo promovía la operación a «guardia directo» — justo la
transición que el detector de podredumbre da por buena.

Ahora un guardia cuenta si el archivo **lo declara o lo importa**. Limitarse al
propio archivo era demasiado estricto y degradaba `getLotReport()`, que delega
en `getLotDetail()` importado de `./lots`; la conciencia de `import` es lo que
pedía la propia revisión.

**3 · Rechazado: una validación de Persona supuestamente retirada.** No existió.
El paquete de revisión se armó con `git diff origin/main..HEAD`, que compara los
dos extremos, y presentó como bajas de este cambio 85 líneas que **otra sesión
había añadido** en `main` (PR #98). El revisor gastó un hallazgo entero en una
regresión fantasma, y su recomendación —«restaurar la comprobación»— habría
borrado un arreglo real de otro. Corregido en `tools/pack-for-review.sh`.

### Lo que sigue abierto, y se comprueba que sigue abierto

Un nombre con forma de guardia basta. Comprobado por mutación:

```ts
function requireFakeAccess(_x: string) { return true; }
export async function fugaPorConvencion(x: string) {
  requireFakeAccess(x);
  return prisma.lot.findUniqueOrThrow({ where: { id: x } });
}
```

sale como **guardia directo** y la compuerta pasa en verde. `GUARDIAS` reconoce
`require\w*(Access|Admin|Override)` como convención deliberada, y cerrarlo exige
resolver el símbolo hasta el servicio de autorización de verdad. No se hace
aquí. Se deja escrito, con la mutación que lo demuestra, para que nadie lea
«208 operaciones inventariadas» como «208 operaciones autorizadas».
