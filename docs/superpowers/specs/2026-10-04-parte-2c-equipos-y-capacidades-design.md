# Parte 2c — Equipos, instalaciones y capacidades

**Fecha:** 2026-10-04 · **Estado:** decisiones de Daniel tomadas pregunta por pregunta (E1–E5 del
2026-10-02, C1–C10 de hoy); **corregido tras dos revisiones adversarias** (Codex, 12 hallazgos; dos
revisores Claude con verificador, 24; §12); pendiente de su lectura. **Medido en** `009d9443` (rama
`recetas-parte-2a`, con la Parte 1 fusionada; por detrás de `origin/main` en commits que no tocan
equipos ni secado).

**Depende de:** la **2a** (pasos, `capacidadesRequeridas`, catálogo `capacidad`, `modoSecado` =
`DryingEnvironment`, desviaciones), la **2b** (Coffee Process Manager y su permiso de excepciones, V4
«ningún cambio de estado es automático», V10 «fuera de lo permitido decide quien aprueba», V14) y la
**Parte 1** (R1 cadena, R2 un proceso abierto, R6 división bajo proceso).

Criterio de Daniel: **«poder medir para poder reusar recetas y reproducir, replicar, ser consistente
con los resultados»**. La regla de esta parte, suya: **una receta no se puede aplicar si el beneficio
no tiene con qué.**

---

## 1. Lo que hay hoy, medido

Reconocimiento de sólo lectura del 2026-10-04 (cuatro lectores con verificador; 363 hallazgos
verificados, 14 descartados) y lo que las revisiones corrigieron.

**Equipos**
- Tanque, cooler, barrica, bandeja y saco son `Equipment` `kind = vessel` (`schema.prisma:5609`);
  `kind` tiene cuatro valores (vessel, instrument, tool, machine). `trayTypeId` sólo se llena en
  bandejas.
- **La única capacidad guardada está en el MODELO** (`capacityValue`, `capacityUnit` en texto libre,
  `schema.prisma:5693–5694`). El equipo no guarda litros, kg ni rasgos (búsquedas en
  `schema.prisma:5585–6103`: 0 útiles; control: `capacity` = 2, ambas del modelo).
- Tres ejes de estado (`schema.prisma:5634`): ciclo de vida, asignación derivada, condición.
  `clasificar` (`lib/equipos/disponibilidad.ts:62`) da todos los motivos; `disponibilidadDeRecipientes`
  (`lib/equipos/equipos.ts:872`) filtra `kind: vessel` y lo que el usuario **puede ver**.
- **Nadie escribe `FermentationRun.vesselEquipmentId`** (sólo `vesselNote`,
  `lib/traceability/fermentation.ts:86`; el formulario pide «Tank 3», `FermentationForm.tsx:24`): todo
  tanque sale libre (`equipos.ts:904`).
- **Un `transfer` sólo guarda tipo, hora y nota** (`fermentation.ts:130–155`): no dice a qué equipo.
- **La custodia** (cadena de traslados, `schema.prisma:6032`) se lee en `equipos.ts:69–73` ordenando
  sólo por `occurredAt desc`, sin techo ni desempate; `bandejasDelSecado.ts:428–437` ya usa
  `occurredAt <= ahora` y `createdAt desc`. Un equipo sin traslado no está en ningún sitio.
- **Nada retira un equipo** (`equipos.ts:313`), aunque `equipment:manage` lo promete (`catalog.ts:85`).
  `Equipment` no tiene fecha ni motivo de retiro. `resumir` contaría un retirado como «requiere
  intervención» (`disponibilidad.ts:93–95`).
- El tablero (`lib/beneficio/datosDelTablero.ts:447–449`) cuenta tanques filtrando sólo `kind`, así que
  las bandejas cuentan como tanques.

**Instalaciones y lugares**
- Tipos de lugar del beneficio: `beneficio`, `drying_facility`, `drying_rack`, `drying_bed`,
  `storage_facility`. **No hay tipo para una cámara fría ni un cuarto de proceso.**
- Una `drying_facility` cuelga del **site** (ADR-156), con `dryingEnvironment` **anulable** (el alta
  admite «no declarado», `instalaciones.ts:139`). `dryingRoomLightExposure` la escribió el import de
  Cafelino (`scripts/import-cafelino-pe.ts:90`); ninguna pantalla.
- **Una corrida de secado no guarda instalación**: `DryingRun.locationId` es legado (no se rellena
  hacia atrás) y `dryingBedLocationId` (`schema.prisma:4576`) **no lo escribe ninguna ruta** (el
  `dryingBedLocationId` de `secadoForm.ts:36` es el de una inspección). La acción de empezar secado no
  pasa lugar (`app/actions/traceability.ts:700`).

**Abrir y dividir**
- `abrirProceso` (`lotProcess.ts:196–219`) abre su propia transacción y exige `lot:manage`
  (`:154–158`). `AbrirProcesoInput` no trae beneficio, y `Lot.locationId` es la parcela en un lote de
  cosecha (`harvest.ts:61`) y el beneficio sólo en uno nacido de recepción (`lotesDeBeneficio.ts:99`).
- **R6 sólo actúa si hay un proceso abierto** (`procesoDelLinaje.ts:606–610`); **fuera de un proceso
  las divisiones siguen como hoy** (P1 R6.6). Bajo proceso, R6 exige el lote entero con tolerancia de
  masa, y acepta lotes sin libro de masa (`:650–666`).
- El peso es el saldo del libro de masa: puede faltar, y con unidades mezcladas `sumQuantityEvents`
  lanza `mixed_units` (`lib/traceability/quantity.ts:117–119`).
- No hay pantalla para dividir café (`app/lots/[id]/page.tsx:688`, sólo miel).

**Lo que la 2a fijó:** el campo `capacidadesRequeridas` del paso; el catálogo `capacidad` con
`sellable`, `valvula`, `puertos_de_gas`, `control_temperatura`, `oscuridad` (plan, T02), ampliable; el
`modoSecado` como `DryingEnvironment`; el paso no nombra equipo. **El Coffee Process Manager del plan
no lleva `lot:manage`** (plan, T03).

---

## 2. Decisiones de Daniel

| # | Fecha | Decisión |
|---|---|---|
| E1 | 10-02 | Sin equipo o instalación **capaz**, no se abre. Si existe pero está **ocupado o en reparación**, se abre con **aviso de esperar** |
| E2 | 10-02 | El paso declara **capacidades**, no un equipo |
| E3 | 10-02 | Al abrir se muestra **lo que cabe**; si no cabe, **el resto se divide** en otro lote |
| E4 | 10-02 | El equipo guarda **litros útiles** y **kg máximos** |
| E5 | 10-02 | Cuarto oscuro, cámara fría, secador techado y agua son **capacidades del lugar** |
| C1 | 10-04 | **Se muestra al abrir, se elige al ejecutar**: no se reserva nada |
| C2 | 10-04 | Sin equipo capaz, **bloquea con excepción del Coffee Process Manager**, con motivo |
| C3 | 10-04 | **Un equipo hereda las capacidades del lugar donde está** |
| C4 | 10-04 | **Kg máximos por lo que entra** (cereza entera, despulpado) |
| C5 | 10-04 | **El modo de secado de la receta es requisito exacto**; oscuro y techado se leen del tipo |
| C6 | 10-04 | **Dividir sólo el sobrante**, desde abrir, con códigos sugeridos |
| C7 | 10-04 | La excepción: **el operador abre y el proceso queda «pendiente de excepción»**; ninguna corrida empieza hasta que el Coffee Process Manager la apruebe con motivo |
| C8 | 10-04 | **Bloquea desde el primer día** (no hay encendido por beneficio): mientras el inventario no esté declarado, toda apertura sin equipo capaz queda pendiente |
| C9 | 10-04 | Si el lote no está en un beneficio, **quien abre elige el beneficio** |
| C10 | 10-04 | Al ejecutar, **elegir un equipo sin las capacidades del paso se permite con motivo**; queda marcado y **cuenta como fuera de la receta** (V10: quien aprueba decide si el lote conserva el nombre) |

---

## 3. Qué guarda cada equipo y cada lugar

### 3.1 El ámbito de cada capacidad

Cada valor del catálogo `capacidad` declara **dónde vive** (columna de datos en el catálogo, o una
constante junto a él):

| Capacidad | Ámbito | Cómo se obtiene |
|---|---|---|
| `sellable`, `valvula`, `puertos_de_gas` | **equipo** | se marca en el equipo |
| `control_temperatura` | **equipo o lugar** | se marca en el equipo (chaqueta) o en el lugar (cámara fría) |
| `oscuridad` | **lugar** | en una `drying_facility`, se deriva de `dark_room_climate_controlled`; en otro lugar, se marca |
| `agua` (valor nuevo) | **lugar** | se marca: el lugar tiene agua para lavar |

El servicio **rechaza** marcar una capacidad fuera de su ámbito (`capacidad_fuera_de_ambito`).
«Secador techado» no es capacidad: se lee del tipo de instalación (C5).

### 3.2 El equipo

- **Quién puede llevar capacidades, litros y kg:** sólo un `kind = vessel` con `trayTypeId IS NULL`
  (el servicio lo exige y un disparador lo refuerza en la base). **Retirar no borra esos datos**: son la
  historia del equipo.
- **Candidatos a E1:** esos mismos recipientes, **además** `lifecycleStatus = active` y de la
  organización del lote. Instrumentos, herramientas, máquinas y bandejas no cuentan nunca, aunque estén
  en un lugar con capacidades.
- **Capacidades:** `EquipmentCapacity` (`equipmentId`, `capacidadValueId`).
- **Litros útiles:** `Equipment.litrosUtiles`.
- **Kg máximos por lo que entra (C4):** `EquipmentLoadLimit` (`equipmentId`, `estado` → `estado_cereza`,
  `kgMaximos`), único por equipo y estado.
- El `capacityValue` del modelo sólo se ofrece como sugerencia de litros al dar de alta, si su unidad
  dice litros.
- Las bandejas siguen con su capacidad derivada de pesajes (ADR-179).

### 3.3 El lugar

- **`LocationCapacity`** (`locationId`, `capacidadValueId`) sobre los **lugares del beneficio** (§5.1):
  el beneficio y su subárbol, **y** las `drying_facility` de su site con su subárbol (son hermanas del
  beneficio, no hijas: `instalaciones.ts:131–139`).
- **Tipo nuevo `processing_room`** (cuarto de proceso: cámara fría, cuarto de fermentación), hijo del
  beneficio — nombre nuevo para Daniel. Sin él, una cámara fría no tiene dónde existir.
- Una `drying_facility` con `dryingEnvironment` **nulo** es «tipo sin declarar»: no satisface ningún
  modo y sale en el inventario de huecos (§9).

### 3.4 Quién las marca, y su historia

- Equipo: `equipment:manage` o `edit_beneficio` en el lugar del equipo (`puedeConfigurar`,
  `equipos.ts:79–91`). Lugar: `edit_beneficio` sobre ese lugar (como `actualizarUbicacionDeSecado`),
  **nunca** `location:manage_attributes`, que el Farm Operator tiene.
- **Cada cambio deja auditoría con antes y después.** Y como las marcas cambian, **al abrir y al empezar
  se guarda qué se evaluó** (§5.4, §6): así se reproduce qué tenía un tanque cuando se usó.

### 3.5 Dónde está un equipo, y qué hereda (C3)

- **Ubicación vigente:** una función única compartida con `bandejasDelSecado` — el último traslado con
  `occurredAt <= ahora`, desempatado por `createdAt desc`. **Sin traslado, el equipo no está en ningún
  lugar** y no cuenta para E1 (sale como «sin ubicar» en el inventario de huecos).
- **Herencia:** las capacidades efectivas de un equipo son las suyas **más** las de su lugar vigente y
  las de sus ancestros hasta el **primero que sea `beneficio` o `drying_facility`**, incluido. Nunca el
  site. Se calculan al leer: si se mueve, cambian.

---

## 4. Arreglos previos

1. **Fermentar elige el equipo.** El formulario lista **todos** los recipientes candidatos del beneficio
   (§3.2), con los capaces del paso primero y marcados. El servicio valida (`kind`, sin bandeja,
   organización, visible para quien opera) y escribe `vesselEquipmentId`. `vesselNote` queda como nota,
   y como única vía para un tanque **no registrado** (que entonces no cuenta como ocupado, y el tablero lo
   sigue mostrando como «unidad sin declarar»).
2. **El recipiente vigente de una corrida** = el destino del último `transfer`, o `vesselEquipmentId`.
   `FermentationIntervention` gana **`toEquipmentId`** (obligatorio en un `transfer`). La ocupación se
   deriva del recipiente vigente: tras transferir A→B, A queda libre y B en uso.
3. **Corridas abiertas sin tanque.** Acción auditada «vincular tanque» para las fermentaciones abiertas
   con `vesselEquipmentId` nulo (escribe sólo la FK). Mientras quede alguna, el aviso de E1 dice «hay
   corridas abiertas sin tanque vinculado: la ocupación puede ser falsa».
4. **Secar elige el lugar.** Columna nueva `DryingRun.dryingFacilityLocationId` (la instalación, siempre)
   y la cama en `dryingBedLocationId` cuando se elige. Las bandejas cargadas de la corrida tienen que
   estar en esa instalación (aviso si no).
5. **Retirar un equipo.** `Equipment.retiredAt` y `retiroMotivo`; `retirarEquipo` (`equipment:manage`,
   auditado) **rechaza** un equipo en uso (recipiente vigente de una corrida abierta o bandeja con fila
   abierta) con `equipo_en_uso`. `resumir` deja de contar retirados como intervención y la
   disponibilidad los excluye.
6. **Bandejas aparte en los recuentos de tanques:** E1, `disponibilidadDeRecipientes` y
   `tanquesVisibles` del tablero filtran `trayTypeId IS NULL`. **`listarEquipos` no se filtra**: es el
   inventario de todas las clases (`equipos.ts:776–785`, la pantalla general y sus rutinas); el tablero
   filtra lo que toma de él.

---

## 5. Al abrir el proceso

### 5.1 De qué beneficio se habla (C9)

- **El beneficio del lote** = el `beneficio` igual a `lot.locationId` o ancestro suyo.
- **Si no hay**, el formulario pide elegir uno de la organización (C9).
- Se guarda en **`LotProcess.beneficioLocationId`**; R6 y R7 lo copian, y las corridas lo leen.
- **Lugares del beneficio** = el beneficio y su subárbol, más las `drying_facility` de **su** site, de la
  misma organización, no archivadas.

### 5.2 La comprobación (E1, C2, C5, C8)

Por cada paso de la versión con `capacidadesRequeridas` o `modoSecado`, y según el **tipo** del paso:

- **Paso que usa recipiente** (los que cumple una `FermentationRun`, 2a §4.1): hace falta **un mismo
  recipiente candidato** (§3.2) cuyas capacidades **efectivas** (§3.5) incluyan **todas** las del paso.
- **Paso que no usa recipiente** (lavado, despulpado…): hace falta **un lugar del beneficio** con todas
  las capacidades del paso (marcadas o derivadas). Una capacidad de ámbito «equipo» en un paso así es un
  error de la receta, que el editor de la 2a debe rechazar (`capacidad_sin_recipiente`).
- **Paso `drying`:** hace falta **una `drying_facility` del tipo exacto del `modoSecado` (C5) Y con
  todas las capacidades de lugar** del paso. Las dos condiciones a la vez.

Resultado:
- **No existe para uno o más pasos** → el proceso se abre **«pendiente de excepción»** (C7, C8) y se
  escribe **una** `ExcepcionDeCapacidad` por proceso, sin aprobar, con **todos** los pasos y lo que les
  faltaba, quién abrió y cuándo. Mientras esté pendiente:
  - **ninguna corrida puede empezar** (`proceso_pendiente_de_excepcion`, en las tres puertas: fermentación,
    secado y cargar bandeja);
  - **no se puede dividir** bajo ese proceso (la misma comprobación en `antesDeTransformar`): así R6 no
    fabrica partes sin la marca. Para dividir, se rechaza la excepción y se divide sin proceso (§5.7).
- **Existe pero ninguno está libre y sano** (sólo para recipientes; `clasificar`) → abre con aviso de
  esperar, nombrando lo que se ve (§5.5).
- **Un paso `opcional`** sin nada capaz → aviso, no pendiente.
- **Proceso sin pasos** (versión vieja) → no hay comprobación.
- **La Libre** se comprueba igual: sobre los pasos que planeó y las capacidades que declaró. No se
  infieren capacidades de su tipo de paso.

### 5.3 Aprobar o rechazar la excepción (C7)

- **Aprobar:** el Coffee Process Manager (su permiso de la 2b §12, sin `lot:manage`), con motivo. Se
  aprueba **la excepción entera** —todos sus pasos a la vez, viendo la lista—: no hay aprobación parcial.
  Guarda quién, cuándo y por qué; el proceso deja de estar pendiente.
  `aprobadaPorQuienOpero` (V14) = la persona que aprueba es la que abrió.
- **Rechazar:** con motivo. El proceso se cierra con un tipo de cierre nuevo,
  **`capacidad_rechazada`** (amplía `LotProcessClosure` de la Parte 1: sin corridas y sin medición,
  CHECK), y el lote queda libre para abrir otro proceso con otra receta.
- Es la **quinta excepción** del Coffee Process Manager: se añade a la 2b §12 y a su tabla de pruebas.

### 5.4 Lo que se guarda al abrir

Una foto `capacidadesAlAbrir` (JSON con forma fija, versionado) en el proceso: por paso, lo que pedía,
qué candidatos había (por id) y con qué capacidades efectivas, y el resultado. Reproduce la decisión
aunque las marcas cambien después. **Se sirve filtrada:** quien la lee recibe completos los candidatos
que puede ver y los demás sólo como recuento («y 2 que no ves»); el servicio que la devuelve aplica el
filtro, no la pantalla.

### 5.5 Lo que se ve, y lo que no

La **existencia** se juzga sobre todo el beneficio (un operario que no ve un tanque no recibe un falso
«no existe»). Pero **sólo se nombran** los equipos y lugares que quien abre **puede ver**; si lo que hace
esperar es invisible, se dice «hay equipos que no ves», sin nombres.

### 5.6 Lo que cabe (E3, C1, C4)

Para el **primer paso que usa recipiente**:
- Si es el **primer paso del proceso**, se compara el peso del lote con el `kgMaximos` del estado de
  **ese paso** (su `estadoFruto`) en cada recipiente candidato: «Tanque II: hasta 400 kg de cereza · el
  lote pesa 520 kg».
- Si **hay pasos antes** (despulpar, lavar), la masa que llegará al tanque no se conoce: «no se compara:
  hay pasos antes». No se infiere un peso.
- **Sin peso comparable** (sin libro de masa, unidad distinta de kg, unidades mezcladas): «sin peso
  comparable», y no se compara.
- **Sólo se muestra. No se reserva nada** (C1).

### 5.7 Dividir el sobrante (E3, C6)

- Si el lote no cabe en ningún recipiente candidato libre, se ofrece **dividir antes de abrir**: sin
  proceso, la división no pasa por R6 y sigue como hoy (P1 R6.6). Dos partes que suman el lote entero
  (la pantalla lo exige con la tolerancia de masa de la organización), con **códigos sugeridos**
  `<código>-A`, `<código>-B` (editables, sin chocar con los existentes).
- Después se abre **cada parte por separado**, con su propia comprobación. La parte que no cabe se
  puede volver a dividir antes de abrirla: así un lote de 1.000 kg con tanques de 400 se resuelve en
  tres pasos, sin pantalla de N partes.
- **Si la apertura de una parte falla, no queda nada a medias**: quedan lotes sin proceso, que se abren
  cuando se pueda.
- Dividir lo hace quien abre (`lot:manage`); no requiere excepción.

---

## 6. Al ejecutar

- **Empezar una fermentación** elige el recipiente (§4.1); **empezar un secado**, la instalación y, si
  hay, la cama (§4.4).
- **Recipiente ocupado o no sano** → aviso, no se impide. Se guarda en la corrida
  `equipoAlEmpezar` (JSON: en uso, condición, capacidades efectivas evaluadas).
- **Recipiente sin las capacidades del paso (C10)** → se permite con **`motivoEquipoSinCapacidad`**
  obligatorio (columna propia en `FermentationRun` y `DryingRun`: **no** es la desviación de la 2a
  §4.4, que es un registro sin paso). Queda marcado y **cuenta como fuera de lo permitido**: entra en la
  decisión de V10 (2b §8.4), donde quien aprueba decide si el lote conserva el nombre de la receta.
- **El `transfer`** pide el recipiente destino (§4.2) y repite la comprobación de capacidades del paso
  vigente. **El cambio de fase de la 2b (V3b)** la repite con las capacidades del paso nuevo sobre el
  recipiente vigente.
- **Cada una guarda su propia evidencia** en su fila (`FermentationIntervention` del `transfer`,
  `FermentationPhaseChange`): `equipoAlCambiar` (en uso, condición, capacidades evaluadas) y, si el
  recipiente no tiene las capacidades, su `motivoEquipoSinCapacidad` obligatorio. Cada fila así **entra
  en la decisión de V10**, igual que la de empezar.

---

## 7. Lo que la 2c no hace

- **La sobrepresión** (103 kPa del paquete, cifra de proveedor e inferencia del autor, `07…:184`): sin
  presión máxima por equipo no hay contra qué comparar.
- **El headspace del anaeróbico:** los litros quedan guardados; la fórmula del paquete es ambigua
  (`07…:170–173`).
- **Reservar equipo al abrir** (C1).
- **La pantalla general de dividir** (ensayos, dividir un secado a mitad).
- **«Por limpiar» como estado propio**: cuenta como `needs_cleaning`.
- **Máquinas** (despulpadora, secadora mecánica) como candidatas de E1: la secadora es un tipo de
  instalación; la despulpadora queda para cuando una receta la pida.

---

## 8. Pruebas — cada guardián con su control y su mutación propia

| Guardián | Prueba (con control) | Mutación que debe hacerla caer |
|---|---|---|
| §5.2 existe | paso `sellable`+`valvula`; sólo hay un tanque con `sellable` → pendiente; con un GrainPro con las dos → abre **sin** aviso | cambiar «todas» por «alguna» |
| §5.2 un mismo recipiente | un tanque con `sellable` y otro con `valvula` → pendiente | juntar capacidades de varios equipos |
| §3.2 candidatos | paso `control_temperatura`; en la cámara fría hay un refractómetro y una bandeja → pendiente; con un tanque → abre | quitar el filtro de `kind` o de `trayTypeId` |
| §3.5 herencia | tanque sin `control_temperatura` dentro de la cámara fría → abre; trasladado fuera → pendiente; traslado con fecha futura → no cuenta; dos traslados a la misma hora → gana el último creado; sin traslado → no cuenta | leer custodia sin techo o sin desempate; copiar la herencia |
| §5.2 lugar | paso de lavado con `agua`; el beneficio la tiene marcada y ningún equipo → abre | exigir equipo en un paso sin recipiente |
| §5.2 secado, capacidades | receta `solar_greenhouse` + `oscuridad`; hay `solar_greenhouse` sin oscuridad → pendiente; uno con `oscuridad` marcada → abre | aceptar el tipo sin las capacidades |
| §5.2 secado, modo exacto | receta `solar_greenhouse` **sin** capacidades; el beneficio sólo tiene `covered_patio` (techado, como el invernadero) → pendiente; con `dryingEnvironment` nulo → pendiente; con `solar_greenhouse` → abre | comparar por «techado» en vez de igualdad |
| §5.3 pendiente | abrir sin capaz deja el proceso pendiente; empezar fermentación, secado o cargar bandeja → `proceso_pendiente_de_excepcion`; tras aprobar → empieza | no comprobar en una de las tres puertas |
| §5.3 aprobar/rechazar | el Coffee Process Manager aprueba con motivo → fila completa; sin motivo o un Farm Operator → rechazo; rechazar cierra `capacidad_rechazada` y el lote admite otro proceso | no escribir la aprobación |
| §5.2 ocupado | único tanque capaz con una fermentación abierta → abre con aviso; tras transferir esa fermentación a otro tanque → abre sin aviso | derivar ocupación de `vesselEquipmentId` ignorando el `transfer` |
| §5.2 opcional | paso opcional sin capaz → abre sin pendiente, con aviso | bloquear también los opcionales |
| §5.5 visibilidad | el único tanque capaz es `confidential`, **está en uso** y quien abre no lo ve → abre (existe) con aviso «hay equipos que no ves», sin su nombre; la foto de §5.4 leída por esa persona no trae su id; leída por quien lo ve, sí | filtrar la existencia por lo visible; nombrar lo invisible; devolver la foto sin filtrar |
| §5.6 cabe | lote 520 kg cereza, tanque 400/600 → «hasta 400 kg de cereza»; primer paso con pasos antes → «no se compara»; unidades mezcladas → «sin peso comparable» | comparar con el kg de otro estado; dejar escapar `mixed_units` |
| §5.7 dividir | 520 → 400/120: **las dos partes nacen sin proceso** (se afirma después de dividir y antes de abrir), con códigos `-A`/`-B`; luego se abre `-A` y `-B` sigue sin proceso; partes que no suman (fuera de tolerancia, con libro de masa) → rechazo y ningún proceso | abrir antes de dividir |
| §5.1 beneficio | lote ubicado en un **cuarto hijo** del beneficio → se resuelve ese beneficio sin preguntar; lote de parcela → el formulario lo pide; se guarda y R6 lo copia | resolver por `lot.locationId` sin subir al ancestro |
| §5.2 pendiente y R6 | dividir bajo un proceso pendiente → `proceso_pendiente_de_excepcion`; tras rechazarla, dividir sin proceso → pasa | quitar la comprobación en `antesDeTransformar` |
| §5.3 una excepción por proceso | dos pasos sin capaz → **una** excepción con los dos; aprobarla libera el proceso; antes de aprobar, ninguna corrida empieza en ninguno de los dos pasos | una excepción por paso que libere el proceso entero |
| §3.2 retiro con datos | retirar un tanque con capacidades y kg → se retira y conserva sus datos; marcar capacidades en una bandeja → rechazo | exigir `active` en la admisibilidad de los datos |
| §4.6 inventario | `listarEquipos` sigue listando las bandejas; el tablero no las cuenta como tanques | filtrar bandejas en `listarEquipos` |
| §6 evidencia por fila | dos `transfer` a tanques sin la capacidad → cada uno exige y guarda su motivo y su `equipoAlCambiar`; los dos aparecen en V10 | guardar sólo en la corrida |
| §3.5 herencia en la instalación del site | tanque en una `drying_facility` del site con `oscuridad` derivada → la hereda; el site no aporta nada | heredar hasta el site |
| §6 equipo incapaz | paso `sellable`, tanque abierto, sin motivo → rechazo; con motivo → guarda y aparece en la decisión de V10 | aceptar sin motivo |
| §4.5 retirar | retirar un tanque en uso → `equipo_en_uso`; libre → retirado, fuera de E1 y de la disponibilidad, no cuenta como intervención | no filtrar `lifecycleStatus` |
| §4.6 tablero | una bandeja vacía no cuenta como tanque libre en el tablero | quitar el filtro en `tanquesVisibles` |
| §3.1 ámbito | marcar `sellable` en un lugar o `agua` en un equipo → `capacidad_fuera_de_ambito` | quitar la comprobación |
| §3.4 permiso | un Farm Operator con `manage_attributes` marca `agua` → rechazo | usar `manage_attributes` |

Si una tarea toca TypeScript, su plan manda `npm run build`. Textos en es y en.

---

## 9. Despliegue

C8: bloquea desde el primer día. Para que eso no deje el beneficio parado sin saber por qué:
- **Inventario de huecos**, en la configuración del beneficio: equipos sin ubicar, recipientes sin
  capacidades ni kg máximos, instalaciones sin tipo, corridas abiertas sin tanque vinculado.
- Cada apertura pendiente nombra **qué faltaba**, para que la excepción se apruebe sabiendo por qué y
  para que el inventario se complete por lo que de verdad se usa.

---

## 10. Nombres nuevos para que Daniel los revise

`EquipmentCapacity`, `EquipmentLoadLimit`, `litrosUtiles`, `kgMaximos`, `LocationCapacity`,
`processing_room`, `agua` (valor de `capacidad`), `retiredAt`, `retiroMotivo`, `toEquipmentId`,
`dryingFacilityLocationId`, `beneficioLocationId`, `ExcepcionDeCapacidad`, `capacidad_rechazada`,
`capacidadesAlAbrir`, `equipoAlEmpezar`, `motivoEquipoSinCapacidad`, y los códigos
`capacidad_fuera_de_ambito`, `capacidad_sin_recipiente`, `proceso_pendiente_de_excepcion`,
`equipo_en_uso`.

---

## 11. Dependencia y orden

- Después de la **2a** (pasos, catálogo, campo) y de la **2b** (permiso del Coffee Process Manager,
  V10, la foto del doble indicador).
- **Pueden ir antes, como PR propio,** los arreglos que no dependen de recetas: §4.1 (elegir tanque),
  §4.2 (`toEquipmentId`), §4.3 (vincular tanque), §4.5 (retirar) y §4.6 (bandejas aparte). Son los que
  hacen verdadero el «ocupado» que ya pinta el tablero. §4.4 (lugar del secado) también.
- **Cambia otros diseños:** la 2b §12 gana la quinta excepción; la Parte 1 gana el cierre
  `capacidad_rechazada` y la copia de `beneficioLocationId` en R6/R7; el plan de la 2a (T15) tiene dos
  frases que dicen que la 2c no tiene diseño (sus líneas ~1329–1335 y ~1444).

---

## 12. Revisión adversaria del 2026-10-04

Codex (12 hallazgos) y dos revisores Claude con lentes distintas —veracidad del código y huecos—, cada
uno con un verificador escéptico (24 hallazgos, 24 confirmados). Los de Codex que dependían del código
se comprobaron (`fermentation.ts:130–155`, `equipos.ts:69–73`, `bandejasDelSecado.ts:428–437`,
`lotProcess.ts:196–219`, `procesoDelLinaje.ts:650–666`). Cuatro eran de Daniel y los decidió (C7–C10).

| Hallazgo | Corrección |
|---|---|
| Instrumentos, herramientas y máquinas heredaban capacidades y satisfacían E1 | §3.2: candidatos = recipientes sin bandeja, activos |
| Las capacidades de lugar sólo se satisfacían con un equipo dentro | §3.1 ámbitos y §5.2 por tipo de paso |
| En secado, el modo exacto sustituía a las capacidades («o») | §5.2: las dos a la vez |
| «El beneficio» del lote no se sabía resolver; varios sites; equipo sin ubicar | §5.1 y §3.5 (C9) |
| Premisa falsa: R6 no exige proceso abierto; abrir y dividir no era atómico | §5.7: dividir antes de abrir |
| El sobrante que tampoco cabe no se podía volver a dividir | §5.7: cada parte se divide antes de abrirla |
| El `transfer` no dice a qué tanque; el cambio de fase no comprobaba | §4.2 y §6 |
| Las fermentaciones abiertas con `vesselNote` seguían «libres» | §4.3 |
| La excepción no tenía flujo: el Process Manager no tiene `lot:manage` | §5.3 (C7), con rechazo |
| «Equipo incapaz» no cabía en la desviación de la 2a; la foto de la 2b no guarda equipo | §6: columna propia y `equipoAlEmpezar` (C10) |
| Marcas mutables sin historia; permisos de lugar sin fijar | §3.4 y §5.4 |
| Retirar sin columnas ni regla con equipo en uso; tablero con bandejas | §4.5 y §4.6 |
| Custodia sin techo ni desempate | §3.5 |
| Peso y estado comparados con lo que no entra al tanque; unidades | §5.6 |
| Se nombraban equipos invisibles | §5.5 |
| El arranque bloquearía todo sin explicar | §9 (C8) |
| Pruebas con flip «idem» y sin controles | §8: mutación propia por fila |
| Afirmaciones falsas: `dryingRoomLightExposure` «nadie la escribe»; «hace verdadero el ocupado» | §1 y §11 corregidos |

**Verificación de la reescritura (Codex, sobre `3cceba1f`):** de los 18 grupos de arriba, 10 resueltos y
8 parciales; y 8 defectos que introdujo la reescritura. Corregidos: un proceso pendiente no se divide
(§5.2); una excepción por proceso, sin aprobación parcial (§5.2, §5.3); los datos de capacidad no exigen
estar activo (§3.2); `listarEquipos` no se filtra (§4.6); las instalaciones del site entran en el ámbito
y la herencia para en la primera `drying_facility` o `beneficio` (§3.3, §3.5); `transfer` y cambio de fase
guardan su evidencia (§6); la foto se sirve filtrada (§5.4); y cuatro pruebas que sobrevivían a su
mutación, más siete filas nuevas (§8). Lo que queda parcial a propósito: las fermentaciones abiertas sin
tanque vinculado siguen dando una ocupación incompleta hasta que alguien las vincule (§4.3), y así lo
dice el aviso.
