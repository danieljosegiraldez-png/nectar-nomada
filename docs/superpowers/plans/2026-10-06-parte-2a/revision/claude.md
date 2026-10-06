# Revisión adversaria Claude — plan de la Parte 2a (la receta con pasos)

Árbol medido: `recetas-parte-2a`, HEAD `da048af2`, `git status` limpio; `origin/main` = `50cbfda3` (la rama no lo contiene: 14 commits propios, 26 de `main`
que le faltan). Sólo lectura: no edité nada, no toqué ninguna base ni corrí la suite. Lo que ejecuté: `git`/`grep` sobre el repo, `ls`/`find` sobre
`~/Downloads`, y lectura de `node_modules/@prisma/*` (versión 7.9.1) para comprobar dos supuestos del plan.

**Cómo se hizo.** Leí entero el esqueleto, el registro y el diseño, y por mi cuenta T01, T03 (partes A2 y B), T04, T05, T07, T08 (código), T10 (código), T11
(convertir) y el código de T13 (`paraLasPantallas.ts`) y de T14 (acciones y lecturas ensanchadas), contrastando con el árbol. Repartí el resto a cuatro
subagentes de sólo lectura (A: T09, T10, T12; B: T06, T08, T11; C: T13; D: T14, T15, T00). **A, B y C entregaron; D se detuvo sin entregar** (su transcripción
dejó de crecer; lo reanudé y no respondió), así que **T14, T15 y T00 quedan revisadas sólo por mí y de forma parcial** (lo dicho en «Sin comprobar»). Cada
hallazgo de un subagente que listo lo **comprobé yo contra el texto del plan y contra el repo** antes de ponerlo; el que no pude sostener, no está.

Los `Tnn.md:N` son líneas de `.superpowers/plan-2a/tareas/Tnn.md`; los demás, del árbol de hoy.

**Resultado: 2 rompe · 7 confunde · 13 menor.**

---

## ROMPE

### 1. [rompe] La rama YA está publicada en el remoto, y T00 la rebasa: el primer `git push -u` de T05 será rechazado, y la salida «obvia» es un force sobre commits de otra sesión

- **Evidencia.**
  - `git ls-remote --heads origin 'recetas-parte-2*'` → `da048af25be9… refs/heads/recetas-parte-2a`, **el mismo sha que el HEAD local** (control: la misma orden sí
    contesta; es la rama que la sesión de los diseños 2b/2c empujó). `git branch -vv` muestra la rama local **sin seguimiento** (sin `[origin/…]`).
  - `T00.md:155` hace `git rebase origin/main` y reescribe los 14 commits (los de 2a, 2b y 2c) sobre un `main` que ya trae 26 commits más. `T00.md:161` y
    `registro.md:6,107` suponen que la rama «no sigue a nadie» y que nada está publicado; `T00.md:134-190` espera «11 commits» y «los dos diseños y nada más» (son
    14 y **tres** diseños: ya está `2026-10-04-parte-2c-…-design.md`).
  - Todos los empujes del plan son `git push -u origin recetas-parte-2a` **sin force** (esqueleto regla 4; `T05.md:2268-2288`; `T10.md:2771-2791`; `T15.md:2363`), y
    `T05.md:2279-2288` trata un remoto **vacío** como «no llegó»: no prevé que ya tenga la rama.
- **Por qué hace daño.** Tras el rebase local y remoto divergen: el empuje de T05 se rechaza como no-fast-forward. Quien ejecute se encuentra con un `push` que falla
  a mitad de plan y, o se detiene, o improvisa `--force`, que **pisa los commits que la sesión de los diseños ya publicó** (y esa sesión, que según el registro «commitea
  aquí», también verá su rama reescrita debajo). Además T00 rebasa mientras otra sesión puede estar commiteando en el mismo worktree: sólo mira «archivos sucios».
- **Arreglo.** (a) T00: en vez de `git rebase origin/main`, `git merge origin/main` (T15 ya une con merge; así T00 y T15 usan la misma estrategia y la historia
  publicada no se reescribe), o, si Daniel quiere historia lineal, pactarlo antes con la sesión de 2b/2c y usar `--force-with-lease=recetas-parte-2a:<sha publicado>`
  nombrando el sha, nunca un force desnudo. (b) T00 gana una comprobación `git ls-remote --heads origin recetas-parte-2a` **antes** de tocar nada, y T05/T10/T15 una
  frase «si el push se rechaza: PARAR y avisar, no forzar». (c) Corregir las cifras de T00 (14 commits, tres diseños, 26 de `main`, 203 migraciones en `main`).

### 2. [rompe] T02 se detiene en su paso 1: el paquete «farm-to-green» ya no está donde el plan lo busca

- **Evidencia.** `T02.md:105` y `:1680`: `PAQ="$HOME/Downloads/coffee farm optimization guide"`, y `:108` hace `shasum` de `$PAQ/04_reference_parameters.json` y
  `$PAQ/processing_axes.json`; `:1681` corre el guion de copia contra esa ruta (`registro.md:7`: «fuera del repo»). Medido hoy: `ls "$HOME/Downloads/coffee farm
  optimization guide"` → *No such file or directory* (control: `ls ~/Downloads` lista cientos de archivos) y `find ~/Downloads -maxdepth 3 -name
  04_reference_parameters.json` → nada. Mientras tanto la PR #638 dejó el paquete **dentro del repo** (`origin/main` `50cbfda3`): `docs/reference/farm-management/
  04_reference_parameters.json` (sha256 `3779d9d7…`, el que T02 espera, `_meta.version` `2.0`, 208 parámetros) y `…/master_data/processing_axes.json` (sha256
  `c1e9c6c5…`, el que T02 espera) — mismos bytes, **otra ruta** (`processing_axes.json` ya no está en la raíz del paquete sino en `master_data/`).
- **Por qué hace daño.** Los pasos 1 y 11 de T02 abortan («si un sha no casa, PARAR»), y con ellos T03–T15 (todas consumen el vocabulario). El diagnóstico no es
  obvio: parece un paquete corrupto, no una carpeta movida.
- **Arreglo.** Tras el rebase/merge de T00 (que trae #638), `PAQ="$PWD/docs/reference/farm-management"` y la ruta de los ejes `"$PAQ/master_data/processing_axes.json"`
  en `T02.md:105-108,1680-1681`; corregir la cabecera de `scripts/copiar-referencias-del-paquete.mjs` («el paquete vive FUERA del repositorio… se corre a mano») y el
  comentario de `referencias.test.ts` («un archivo que vive FUERA del repositorio»); T00 debe comprobar que ese directorio existe tras la unión. Los shas del plan
  siguen valiendo.

---

## CONFUNDE

### 3. [confunde] `convertirLibre` propone como fin el valor de una lectura marcada aunque una corrección posterior ya la reemplazó

- **Evidencia.** `T11.md:2592-2594` lee las lecturas marcadas **crudas** (`measurement.findMany({ where: { id: { in: … } } })`), `:2600` toma `lecturas.get(marca.measurementId)` y
  `:2631-2633` escribe `valor: lectura.value`, `desdeLecturaId: lectura.id`. La regla «se marca la VIGENTE» (I4) sólo se aplica **al marcar** (`T11.md:986-990`).
  `correctMeasurement` sólo rechaza corregir lo ya corregido (`lib/traceability/measurements.ts:474-478`, `yaCorregida`): nada impide corregir después una lectura
  ya marcada. Las pruebas no lo ejercen: B3 (`T11.md:2163-2205`) corrige `mala`, no la marcada; las tres de corrección (`:732-796`) corrigen **antes** de marcar.
- **Por qué hace daño.** Es el caso normal de esta casa (la corrección existe para el dato mal tecleado): se marca 11,2 %, el martes se corrige a 10,2, y al convertir el
  borrador propone «`lte 11,2`» con `desdeLecturaId` a una lectura que el sistema sabe reemplazada. Cifra falsa en una receta que se publica y se reusa (regla 13), y la
  dirección (`sentido`) se mide contra una serie de vigentes de la que la marcada ya no forma parte.
- **Arreglo.** En `proponerFines`, resolver cada marca a la cabeza de su cadena de correcciones (el mismo recorrido de `lecturasCandidatasDeCierre`, factorizado en un
  `vigenteDe(tx, ids)` exportado) y usar valor, unidad, fecha e **id de la vigente**; deduplicar por esa id. Prueba nueva B4: marcar `ultima` en `endDryingRun`,
  `correctMeasurement(ultima → 10,9)`, convertir ⇒ fin `lte 10,9` con `desdeLecturaId` = la corrección; flip: volver a leer la marca cruda ⇒ cae B4.

### 4. [confunde] `proponerFines` junta los registros de TODO proceso que comparta la versión de la Libre, no los del hilo del proceso que se convierte

- **Evidencia.** `T11.md:2573-2576`: `fermentationRun/dryingRun/lotProcessIntervention.findMany({ where: { recipeStepId: { in: idsViejos } } })` **sin `lotProcessId`**; la
  cabecera lo defiende (`T11.md:2472-2474`). Cada parte de una división copia la versión (`lib/traceability/procesoDelLinaje.ts:706`), así que convertir la parte B
  arrastra las marcas de la hermana C. Contradice el criterio que el propio plan fijó para el avance: el hilo `derivedFromLotProcessId`, no «todos los de la cadena con la
  misma versión» (`registro.md:25`; `T06.md:18-26`, `:656-665`).
- **Por qué hace daño.** (a) Dos lecturas de cierre de la humedad final (B y C) dan **dos** fines `lte` distintos en el mismo paso, con la `reglaDeFin` heredada: ninguno
  dice cuál manda; (b) como `ya_convertida` es por proceso (`T11.md:2555`), C puede convertir después y produce una segunda receta casi igual con las marcas de B;
  (c) marcas de otro lote entran a un borrador autorizado sólo con `requireLotAccess(view)` sobre el lote del proceso (`T11.md:2673`).
- **Arreglo.** Acotar las tres consultas a `lotProcessId: { in: hilo }`, con `hilo` = el proceso que se convierte y sus antecesores por `derivedFromLotProcessId`
  (bucle de `lotProcess.findUnique({ where: { id } })` por id, que `proceso-por-el-resolvedor` no marca). Prueba: dividir en dos partes con una marca cada una; convertir B no
  trae la de C; control: convertir una continuación sí trae lo de su proceso cerrado.

### 5. [confunde] La Libre guarda el código del lote y la intención cruda en una receta con alcance de ORGANIZACIÓN, y pierde la clasificación del lote

- **Evidencia.** `T10.md:1938-1946` (`crearRecetaLibreEnTx`): `name: nombreDeLaLibre(…)` («Libre — <intención> — <código del lote> <fecha>»), `description: datos.intencion`, **sin
  `classification`**; `prisma/schema.prisma:4336`: `ProcessRecipe.classification @default(internal)` aunque el lote sea `confidential`/`trade_secret` (`loteGestionable`
  sí lo respetó al abrir). Quién la lee después: `processTargets.ts:552` (`getRecipeForEditor` autoriza con **un lote cualquiera de la organización**) y `:489`
  (`listRecipes`: un lote cualquiera de toda la base); T14 ensancha las dos con `puedeAutoriaDeReceta` (`T14.md:5842-5867`, `:5933-5949`), oculta las Libres **sólo en la
  página** (`T14.md:4852`, `recipes.filter((r) => !r.esLibre)`) y las enseña de sólo lectura en `/recipes/<id>` (`T14.md:4957`).
- **Por qué hace daño.** El texto libre que el operario escribió («…proceso natural anaeróbico, tantas horas…») y el código de su lote pasan a ser dato de receta legible
  por quien alcance la organización (un Coffee Process Manager que **no ve** ese lote —el perfil no lleva `lot:view`—, o un Farm Manager sin la autorización de «trade
  secret»). Es el patrón «un lote cualquiera como proxy de acceso», ahora protegiendo dato de UN lote. T10 sólo lo anota como «las Libres seguirán saliendo» (`T10.md:2829-2834`).
- **Arreglo.** (1) `crearRecetaLibreEnTx` recibe y guarda `classification: lote.classification` (prueba con control: lote `confidential` → receta `confidential`; `internal` →
  `internal`). (2) En T14, `listRecipes` filtra `esLibre: false` **en el servicio**, y `getRecipeForEditor` de una Libre autoriza con `requireLotAccess("view")` sobre el lote
  cuyo proceso usa esa versión (prueba «quien no ve el lote no lee su Libre»). (3) Si Daniel prefiere no tocar T14: que `name`/`description` no lleven el código del lote ni la
  intención cruda (contradice el ruling del nombre: decisión suya).

### 6. [confunde] T09: una corrida SIN paso bajo una versión CON pasos (una desviación) hereda el ritmo del primer paso, contra la decisión 1 de la propia tarea

- **Evidencia.** `T09.md:98-101` (decisión 1): «Un paso sin volteo ni horas **no hereda** los de la fase… heredarla le pondría a un paso el ritmo de otro, que es justo el defecto
  que los pasos vienen a quitar». Pero el camino «sin paso» de la cola (`T09.md:828-833`) y del tablero (ediciones 6 y 7) cae a la fase **también cuando la versión tiene pasos**, y
  la prueba «dos secados de volteo distinto…» (`T09.md:583-598`) fija ese fallback con una versión de **tres pasos** como control (`ritmo` = `{100, 4, 10, 12}`, «le toca volteo»).
  Diseño: la fase es compatibilidad «para corridas sin paso (históricas y procesos viejos sin receta)» (spec línea 132); una corrida sin paso bajo una receta con pasos es una
  **desviación** (spec §4.4, línea 221), no histórica.
- **Por qué hace daño.** Una desviación se juzga contra el ritmo de OTRO paso: la cola dice «le toca volteo»/«va tarde» por un ritmo que esa corrida nunca declaró.
- **Arreglo.** Opción A (coherente con la decisión 1): con versión con pasos y corrida sin paso, **no hay ritmo** («sin ritmo declarado»); la fase sólo se usa si la versión no
  tiene pasos (`_count: { select: { steps: true } }` en la consulta). Opción B: dejar el fallback pero como decisión escrita. En ambos casos el control de `T09.md:583-598` pasa a una
  versión con fases y sin pasos (el mundo anterior a la 2a).

### 7. [confunde] `bajarBandejaAction` convierte en «Vuelve a intentarlo» justo los rechazos de las lecturas de cierre, que reintentar no arregla

- **Evidencia.** `T13.md:3446-3448`: `if (error instanceof LotProcessError || error instanceof RecipeError) return "desconocido";`, fijado por la prueba de `T13.md:2993-2997`
  (`lectura_no_marcada`, `process_not_found` ⇒ `{ error: "desconocido" }`); `claveDeErrorDeSecado("desconocido")` cae en `error_desconocido`
  (`app/beneficio/bandejas/errorDeSecado.ts:46-48`: «No se pudo completar la acción. Vuelve a intentarlo.»). T11 escribió frases propias para esta puerta
  (`lectura_reemplazada`, `lectura_de_cierre_ajena`); las otras dos puertas de cierre sí las dicen. `T13.md:52-53` declara «las tres traducen».
- **Por qué hace daño.** El caso real es una página vieja (alguien corrigió la lectura entre el render y el envío): el operario reintenta con las mismas casillas y falla igual,
  sin saber qué marcar.
- **Arreglo.** `codigo()` devuelve un código propio para los errores con texto (`claveDeErrorParaLaFicha` ya existe), con sus claves en `BandejasDelSecado` y `ERRORES_DE_BANDEJA`; la
  prueba afirma que `lectura_reemplazada` da un código distinto de `desconocido`.

### 8. [confunde] `ElegirPaso` no avanza su propuesta tras un registro correcto: el siguiente registro viene con el paso que ya se cumplió

- **Evidencia.** `T13.md:4273`: `useState(… propuestoEntre(datos.pasos) ?? "")`, una sola vez. `IntervencionForm` lo usa sin `key` (`T13.md:5995`) y
  `registrarIntervencionAction` redirige a la MISMA url (`app/actions/traceability.ts:2557-2558`), así que el componente de cliente no se desmonta; `ManejoDeFermentacionForm`
  sólo se reinicia al cambiar el tipo (`key={tipo}`, `T13.md:4616`) y su acción devuelve `{}`. Las pruebas miran sólo el primer render.
- **Por qué hace daño.** Registrar dos inoculaciones o dos manejos seguidos deja elegido el paso recién cumplido: el registro se une al paso equivocado, en silencio y sin
  desviación (contradice §4.3, «el formulario propone el siguiente pendiente»).
- **Arreglo.** Una `key` derivada de la propuesta y de los `hechos` (`propuestoEntre(pasos)` + `pasos.map(p => p.hechos).join()`) dentro de `ElegirPaso`; prueba que renderice dos
  veces con `datos` distintos bajo el mismo padre y compruebe el `selected`.

### 9. [confunde] La migración no tiene plan de retroceso, y el código de hoy revienta en cuanto exista una intervención sin valor de catálogo

- **Evidencia.** Ninguna de T00, T01 ni T15 trata el retroceso (`grep -i 'revers\|rollback'` sólo encuentra el SAVEPOINT y un `ROLLBACK;` de un SQL de sólo lectura, `T15.md:1115,1126`).
  La migración (`T01.md:1505`) hace `ALTER COLUMN "catalog_value_id" DROP NOT NULL` en `lot_process_intervention`; el código actual lee `i.catalogValue.value` sin guarda
  (`app/lots/[id]/process/page.tsx:200`, `lib/traceability/reporteDeProceso.ts:201`: los dos lectores que T01 paso 9 arregla). `vercel-build.sh` migra con el código viejo todavía
  sirviendo (comentario ADR-070), y un «Instant Rollback» de Vercel devuelve código sin tocar la base.
- **Por qué hace daño.** Hasta la primera intervención registrada sólo con tipo de paso, volver al código de la Parte 1 es inocuo; **después**, la página del proceso y el reporte de
  esos lotes caen. Nadie lo ha escrito, y es justo la decisión que hay que tener tomada antes de fusionar.
- **Arreglo.** Añadir al cuerpo del PR (T15, paso 25) un párrafo «Retroceso»: qué es seguro devolver y hasta cuándo, que la migración es sólo aditiva salvo el `DROP NOT NULL`, la
  FK de la organización (RESTRICT) y el índice único de las metas, y qué hacer si hubo que volver atrás después de la primera intervención con sólo tipo (arreglar los dos lectores
  en el código viejo primero).

---

## MENOR

### 10. [menor] `escribirPasosPlaneados` y `crearRecetaLibreEnTx` están exportados sin guardia, y el comentario promete una comprobación que el código no hace
`T10.md:1719-1722` dice que `escribirPasosPlaneados` «exige una versión recién creada»; el código (`T10.md:1741-1752`) sólo hace `tx.processRecipeStep.create` sobre el `recipeVersionId` que
le dan. Sobre una versión `approved` de antes de la 2a o un borrador de otra organización escribe pasos **sin `exigeAutoriaDeReceta`** (saltándose V16/regla 15); `crearRecetaLibreEnTx`
(`:1933`) crea una receta publicada en la organización que se le pase. Hoy sólo las llama `abrirProceso`; la defensa es una frase de la allowlist. **Arreglo:** que `escribirPasosPlaneados`
lea la versión y rechace si ya tiene pasos o si su receta no es Libre (prueba con control y flip), y un guardia de arquitectura que fije sus únicos importadores (molde de
`listarProcesosDeLote`).

### 11. [menor] Un fin de paso puede citar una lectura de cierre ajena; la Libre no tiene tope de pasos ni debe aceptar `desdeLecturaId`
`T03.md:3290-3298` (`exigeValoresDelPaso`) sólo comprueba que cada `desdeLecturaId` esté en `process_step_closing_reading`, **no de qué lote ni organización es**; la FK es RESTRICT, así que
también impide borrar esa medición ajena, y la diferencia entre `lectura_no_marcada` y éxito dice si un uuid es una lectura marcada. `validarPasosPlaneados` (`T10.md:1724-1733`) lo reusa
para una Libre —que se define **antes** de ejecutarse y no puede traer una lectura legítima—, sin tope de pasos (dos consultas antes de la transacción y ~10 escrituras dentro por paso).
La pantalla lo acota (`libreDelFormulario`, `T13.md:477-560`); el servicio confía en su llamador. **Arreglo:** exigir que la lectura sea de un lote de la organización de la receta, y en
`validarPasosPlaneados` rechazar `fines.some(f => f.desdeLecturaId != null)` y poner el mismo `MAX_PASOS_PLANEADOS`.

### 12. [menor] T12: «calcular no escribe nada» no tiene mutación que la haga caer
`T12.md:722-753` cuenta filas antes y después; un `update` (o un disparador) deja los recuentos iguales; `T12.md:143-145` lo admite («red, no guardia»). **Arreglo:** correr la llamada en
`$transaction(async (tx) => { await tx.$executeRaw\`SET TRANSACTION READ ONLY\`; return avisosDeRecepcion(tx, lote); })` y añadir al módulo una escritura de prueba para el flip.

### 13. [menor] T12: `avisosDeRecepcion` no tiene prueba RBAC propia y nada fija quién la llama
Devuelve ids, fechas y Brix de recepciones de **toda** la ascendencia, incluidas las de lotes que quien mira no ve (T13 lo declara en su prueba, `T13.md:1238-1242`). Su única defensa
es prosa en la allowlist (`T12.md:1243`); el Ruling INV (`registro.md:111`) pide prueba propia. **Arreglo:** guardia hermético que exija que sólo `lib/recetas/paraLasPantallas.ts` la
importe; opcional: que T13 quite `brix`/`recibidaAt` de los avisos cuya recepción no nombra.

### 14. [menor] T10: la intención libre entra en una columna con índice único btree
`@@unique([organizationId, name])` (`schema.prisma:4346`) y `nombreDeLaLibre` (`T10.md:564-567`) no limita la longitud; `abrirProceso` sólo hace `trim()` de `intent`. Una intención de más
de ~2,7 KB da un error de btree (clase `54000`), que no es `P2002` y sale como 500. No medido (sin base). **Arreglo:** recortar la intención dentro del NOMBRE (≈120 caracteres con «…»; la
`description` conserva todo) y probarlo con 5 KB.

### 15. [menor] «Es de la corrida» se decide sólo por igualdad de id, y `marcarLecturasDeCierre` no tiene prueba RBAC de las cuatro puertas
`T11.md:949-954`; pero `recordMeasurement` sólo exige `lotId` cuando viene el id de corrida (`measurements.ts:241-246`) y no lo ata al lote de la corrida. Una lectura de cualquier lote al
que el autor tenga acceso, con el id de una corrida ajena, cuenta como «de esa corrida». Es contaminación, no fuga. **Arreglo:** exigir además `lotId` = lote de entrada de la corrida
(`loteDeLaCorrida` en la unión discriminada) y una prueba de que una cuenta con `manage` sólo en otra parcela no marca nada (cero filas) por las cuatro puertas.

### 16. [menor] `convertirLibre` no tiene la prueba compuesta «ve el lote de una organización y escribe recetas sólo en otra»
El código lo resuelve (`T11.md:2672-2674`, receta con `organizationId: lote.organizationId`), pero la batería de `T11.md:2209-2245` sólo trae cuentas de la MISMA organización. **Arreglo:**
una cuenta Coffee Process Manager de OTRA organización + Project Viewer sobre este lote ⇒ `sin_permiso_de_autoria`, `puedeConvertirLibre` falso, cero recetas nuevas.

### 17. [menor] `avanceDelProceso` no prueba el caso «mezcla» que su contrato promete
`T06.md:79`, `:726-729` prometen `null` con mezcla; las siete pruebas (`T06.md:346-514`) sólo arman `sin_proceso`. Devolver el avance del primer proceso dejaría la suite en verde.
**Arreglo:** un lote hijo de dos padres con procesos distintos ⇒ `null`; control: cada padre por separado tiene su avance.

### 18. [menor] La ficha sigue ofreciendo, y T13 ahora además LEE para, formularios que quien mira no puede usar
Real `app/lots/[id]/page.tsx:1170`, `:1184` y `:1297` no están dentro de `puedeRegistrar` (sí lo están `PhotoUploadForm` y `LabourEntryForm`); T13 los sustituye sin condición
(`T13.md:6481-6482`) y añade `pasosParaElegir`/`lecturasParaMarcar` para cualquier observador (`T13.md:6399-6409`). No es fuga (piden `view`), pero incumple la regla del 2026-09-27.
**Arreglo:** condicionarlos con `puedeRegistrar` o dejarlo en «Dudas» como preexistente.

### 19. [menor] `endDryingFormAction` conserva el 500 ante `TraceabilityAccessError`/`MassBalanceError`
Real `traceability.ts:785-796` atrapa `BandejaError` y `DryingValidationError`; T13 (`:3412-3423`) añade sólo los códigos con texto y mantiene `throw error`; la prueba (`T13.md:2908-2911`)
usa `new Error("boom")`. Preexistente, pero T13 reescribe esas líneas y declara «las tres traducen» (`T13.md:52-53`). **Arreglo:** rama `TraceabilityAccessError` → `?error=sin_acceso`, o
bajar la frase y anotarlo.

### 20. [menor] El `git grep` del paso 35 de T13 no saldrá vacío
Queda una mención en `lib/traceability/operations.ts:100` (comprobado hoy: `git grep -n endFermentationFormAction -- lib app` → 5 líneas, ésa entre ellas); T13 (`:6580-6586`) espera «vacío» salvo
`DECISIONES.md` y no la lista. **Arreglo:** añadir ese archivo a la edición 35(b) y a la lista de menciones esperadas.

### 21. [menor] `lecturasParaMarcar` no prueba el id de una corrida de un lote que quien mira no ve
Sólo el filtro `seVe` por lote de cada candidata impide una fuga (`T13.md:1730-1741`); las pruebas siempre usan un `registroId` del mismo lote y el descendiente oculto sólo aparece en el
manejo, así que quitar `seVe` sólo rompe esa rama. **Arreglo:** una prueba con el id de una corrida de un lote oculto ⇒ `[]`, con su control, y una línea en la cabecera.

### 22. [menor] Dos copias de las referencias y cifras viejas de T00
Tras #638 hay dos copias de `04_reference_parameters.json` en el repo (`docs/reference/farm-management/` y `lib/recetas/referenciasDelPaquete.json`): pueden derivar. El sha de procedencia
que la prueba de T02 fija (`3779d9d7…`) ya lo protege contra un cambio silencioso; bastaría una línea en `PROCEDENCIA`/cabecera que remita al original del repo. T00 trae además
cifras envejecidas (`T00.md:134-190`: «11 commits», «los dos diseños y nada más», `main` con «quince commits», «203 o más» migraciones): hoy son 14, tres diseños, 26 y 203.

---

## Lo que comprobé y NO dio hallazgo

- **Esquema y migración (T01).** Leída la migración entera: sólo añade; ninguna restricción nueva puede chocar con una fila de hoy (columnas nuevas nulas o con valor por defecto, el
  `DROP NOT NULL`, el CHECK `catalog_value_id IS NOT NULL OR step_type_value_id IS NOT NULL` verdadero para toda fila vieja, el índice parcial de las metas sin paso cubre las mismas
  columnas y filas que el único que reemplaza, la FK de la organización pasa a RESTRICT sin cambiar lo que ya hay). Ningún camino de producción borra organizaciones (`git grep
  'organization\.(delete|deleteMany)\(' -- lib app scripts prisma` → vacío; el único `DELETE FROM core.organization` es el guion histórico `scripts/remove-demo-places.sql`). El nombre
  de la FK (`process_recipe_organization_id_fkey`) y del índice viejo (`process_target_recipe_version_id_phase_variable_moment_key`) están en las migraciones de hoy. Con `phase`
  anulable el índice viejo no vigilaba filas con fase nula, y el parcial nuevo conserva exactamente eso. No hay ninguna concesión por tabla (`GRANT`) que migrar.
- **Supuestos de Prisma 7.9.1.** `$transaction` anidado: `ITXClientDenyList` = `$connect $disconnect $on $use $extends` (`runtime/client.d.ts:467`) y `createSavepoint` existe en el
  runtime; el adaptador `pg` mapea `23505` a `fields` desde el DETAIL (`adapter-pg/dist/index.js:472-478`, vale también para un índice parcial) y `23503` a `{ index: error.constraint }`.
- **Autorización de la autoría (T03 A2).** `exigeAutoriaDeReceta` calca `exigeEditarBeneficioEnOrganizacion` con una llamada real a `can(…, "approve_exception", "lot", …)` por ubicación de la
  organización más el respaldo de plataforma; la plantilla sólo con plataforma; `puedeAutoriaDeReceta` es la misma regla en booleano y sólo se traga su negativa. `resolveLotVisibility`
  filtra por acción exacta (`lots.ts:659-661`), así que el permiso nuevo no convierte a nadie en operario; la autorización por clasificación es una conjunción permiso+autorización (`scopeClassification.ts`).
  `scripts/vercel-build.sh` siembra permisos y perfiles tras migrar (el seed hace upsert de `role_profile_permission`). Probado el rechazo de quien no debe en las tres puertas viejas y en las cinco escrituras.
- **`derivarReceta`/`nuevaVersionBorrador`/`convertirLibre`/`crearRecetaEnBorrador`.** La autoría se pide sobre la organización destino o la de la receta, la plantilla de origen se comprueba
  como `organizationId === null` (no se puede derivar la receta privada de otra organización) y `convertirLibre` estampa la receta con la organización del LOTE, no con un dato del formulario.
- **Lecturas de recetas ensanchadas (T14 32c).** `listRecipes` filtra por las organizaciones donde la cuenta puede escribir cuando no opera; `getRecipeForEditor` y `listRecipeOrganizations` aceptan la autoría
  con pruebas por lectura y su control; las acciones del editor autentican, llaman al servicio dentro del `try`, y el `redirect` va fuera. (Salvo lo dicho en el hallazgo 5 sobre las Libres.)
- **Guardián y puertas (T07/T08).** Bloqueo del linaje primero y después la versión (`FOR SHARE OF r, v`, sin ciclo con `FOR UPDATE` de editar/publicar ni con `nuevaVersionBorrador`); decisión dentro de
  la transacción; `registrarIntervencion` pasa a `bloquearLinaje`+`TRANSACCION_DEL_LINAJE`; el rechazo de una corrida ya terminada no se alcanza desde la ficha (el formulario de manejos sólo sale con la corrida activa).
- **Pruebas del plan.** Las anclas y números de línea de T01–T13 contra el repo (muestreadas por mí y completadas por A, B y C: casan), los números medidos de `abrirProcesoDePrueba` (147 líneas, 148 apariciones, 14
  archivos, 7 con receta), los flip-tests de T06/T08/T11 (cada fila quita la conducta, no el token), los de T09/T10/T12 salvo el nº 12, y el orden de limpieza de las doce suites que crean recetas con organización.
- **CI y build.** Toda prueba con base va a `base-sembrada`; las herméticas lo son de verdad; ningún `"use server"` exporta algo que no sea `async function`; los `redirect` nuevos van fuera del `try`; `friendlyError` tiene
  rama para `RecipeError`; los guardias de arquitectura que cada tarea nombra se corren.

## Sin comprobar

- **T14 (editor), T15 (cierre) y T00 (preparación) no tienen su revisión independiente** (el subagente D no entregó). De T14 leí las acciones, la parte `32c` de las lecturas y la lista de claves; no leí el formulario por tipo,
  la reescritura de `campos-con-dos-puertas`, ni `rutas-declaradas`. De T15 sólo inspeccioné los puntos de riesgo (`_prisma_migrations`, `merge`, push, SQL de producción): vi que sólo toca la fila de la base PROPIA con el mismo checksum,
  que los SQL de producción son de sólo lectura y que no hay comandos destructivos sobre otras bases. De T00, el rebase y el volcado (hallazgo 1).
- Que `exigePasoCoherente` rechace un `stepTypeValueId` que no sea de `tipo_paso` ni del registro (T07 lo cubre en su prueba; lo verifiqué por lectura, no por ejecución).
- Todo lo que pide base: ninguna prueba con base del plan se ha ejecutado (las tareas se redactaron sin poder tocar ninguna); el tamaño del límite de btree del nº 14 y las cifras de inventario tras aplicar las tareas.
- Que `app/recipes/[id]` lea `?ok=convertida` como T13 supone (existe hoy; no vi que lea `ok`).

## NO ENCONTRÉ NADA EN
Migración sobre una base con datos (aditiva; sin restricción que choque; FK-ORG sin caminos de borrado de organizaciones en producción); orden de bloqueos y ausencia de ciclos; autorización de `exigeAutoriaDeReceta`,
`puedeAutoriaDeReceta`, `parecidoDeLaLibre`, `abrirProceso` con Libre (`lot:manage`, V13), `avisosParaLaPagina`, `pasosParaElegir`, `lecturasParaMarcar` y `convertirLibre`/`puedeConvertirLibre` (salvo lo ya dicho);
fidelidad a las decisiones de Daniel del registro (receta obligatoria, Libre definida antes, mucílago = lo que QUEDA en seis tramos, publicar por el Coffee Process Manager, el acto es el tipo de paso, la adición
guarda la categoría, el paso declara capacidades y no un equipo); `next build` (use-server, redirect); códigos y claves es/en; anclas de edición.
