# Parte 2c — Equipos, instalaciones y capacidades

**Fecha:** 2026-10-04 · **Estado:** decisiones de Daniel tomadas pregunta por pregunta (E1–E5 del
2026-10-02 y C1–C6 de hoy); diseño aprobado en conversación; pendiente de revisión adversaria y de su
lectura. **Medido en** `4ecdd36b` (rama `recetas-parte-2a`, con la Parte 1 fusionada; 22 commits por
detrás de `origin/main`, ninguno toca equipos ni secado en `schema.prisma`).

**Depende de:** la **2a** (`2026-10-02-parte-2a-la-receta-con-pasos-design.md`: los pasos y su campo
`capacidadesRequeridas`, el catálogo `capacidad`, el `modoSecado` como `DryingEnvironment`) y de la
**2b** (`2026-10-02-parte-2b-lo-que-la-receta-vigila-design.md`: el Coffee Process Manager y su permiso
de excepciones, V4 «ningún cambio de estado es automático»). Y de la **Parte 1** (R6: dividir con un
proceso abierto).

Criterio de Daniel: **«poder medir para poder reusar recetas y reproducir, replicar, ser consistente
con los resultados»**. La regla de esta parte, suya: **una receta no se puede aplicar si el beneficio
no tiene con qué.**

---

## 1. Lo que hay hoy, medido

Reconocimiento de sólo lectura del 2026-10-04: cuatro lectores y un verificador por lector; 363
hallazgos verificados contra archivo y línea, 14 descartados.

**Equipos**
- Tanque, cooler, barrica, bandeja y saco son todos `Equipment` de `kind = vessel`
  (`schema.prisma:5609`).
- **La única capacidad guardada está en el MODELO** de equipo: `capacityValue` con `capacityUnit` en
  texto libre (`schema.prisma:5693–5694`; `app/equipos/modelos/nuevo/page.tsx:133`). El equipo no
  guarda litros, kg ni rasgos (sellable, válvula…): la búsqueda de `volume|litros|maxLoad|…` y de
  `hermet|sell|anaer|refriger|…` en `schema.prisma:5585–6103` da 0 útiles (control: `capacity` da 2,
  ambas en el modelo).
- **Tres ejes de estado** (`schema.prisma:5634`): ciclo de vida (columna), asignación (derivada de la
  corrida) y condición (último informe: `operational`, `needs_cleaning`, `needs_maintenance`, `faulty`,
  `out_of_service`).
- `clasificar` (`lib/equipos/disponibilidad.ts:62`) devuelve todos los motivos por los que un equipo
  no está libre y sano; `disponibilidadDeRecipientes` (`lib/equipos/equipos.ts:872`) filtra por lo que
  el usuario **puede ver**.
- **Nadie escribe `FermentationRun.vesselEquipmentId`**: fermentar guarda sólo `vesselNote`
  (`lib/traceability/fermentation.ts:86`), y el formulario pide el tanque como texto
  (`FermentationForm.tsx:24`, «Tank 3»). Por eso **todo tanque sale libre** (`equipos.ts:904`).
- El recuento de recipientes **no excluye bandejas** (`equipos.ts:874`): una bandeja cargada puede
  salir libre. Las bandejas tienen su propio modelo de carga (una fila abierta por bandeja) y su
  capacidad **se deriva de pesajes** (`lib/traceability/capacidadDeBandeja.ts:150`, ADR-179 punto 5).
- **Nada retira un equipo**: `equipment.update` (`equipos.ts:313`) toca modelo, serie, código,
  proveedor y garantía; el permiso `equipment:manage` promete «retirarlos» (`catalog.ts:85`).
- Registran equipo `equipment:manage` (Farm Manager) o `location:edit_beneficio`; el Farm Operator sólo
  ve e informa la condición (`catalog.ts:425`).

**Instalaciones**
- Una instalación de secado es una `Location` `drying_facility` (`schema.prisma:728`) que cuelga del
  **site**, no del beneficio (ADR-156, `DECISIONS.md:10953`).
- La clasifica `DryingEnvironment` (`schema.prisma:757`): `solar_greenhouse`,
  `dark_room_climate_controlled`, `open_patio`, `covered_patio`, `mechanical_dryer`,
  `african_bed_outdoor`, `floor_tarp`. Hay además una columna `dryingRoomLightExposure`
  (`schema.prisma:972`) que ninguna pantalla del beneficio escribe.
- No existen techo, control de temperatura, cámara fría ni agua como atributo (búsqueda de
  `roof|techo|thermal|cámara fría|cold room|…`: 0 útiles; control: `dark_room_climate_controlled` = 1).
- **Abrir un secado no elige instalación**: la acción no pasa `locationId`
  (`app/actions/traceability.ts:700`), aunque el servicio lo aceptaría (`drying.ts:41`). La cola de
  secado nunca ofrece espacio libre (`colaDeSecado.ts:383`).

**Abrir y dividir**
- `LotProcess` no guarda equipo. El núcleo `abrirProcesoEnTx` (`procesoDelLinaje.ts:441`) lo usan
  tres caminos: `abrirProceso`, la división y `devolverASecado`.
- **El peso del lote no es una columna**: es el saldo del libro de masa, que puede faltar
  (`procesoDelLinaje.ts:659`).
- R6: dividir exige un proceso abierto, ninguna corrida abierta, y el lote entero
  (`procesoDelLinaje.ts:610, 620`; P1 §R6). **No hay pantalla para dividir café**: la única de la ficha
  es la de miel (`app/lots/[id]/page.tsx:688`).

**Lo que la 2a ya fijó para esta parte**
- El campo `capacidadesRequeridas` del paso, con su tabla (`stepId`, `capacidadValueId`).
- El catálogo `capacidad` con cinco valores, en este orden: `sellable`, `valvula`, `puertos_de_gas`,
  `control_temperatura`, `oscuridad` (plan de la 2a, T02), ampliable con su fuente.
- El `modoSecado` del paso es el enum `DryingEnvironment`, el mismo de las instalaciones, «así receta e
  instalación comparten vocabulario para la 2c» (registro del plan).
- El paso **no** nombra equipo ni recipiente (decisión de Daniel, 2026-10-03).

---

## 2. Decisiones de Daniel

| # | Fecha | Decisión |
|---|---|---|
| E1 | 2026-10-02 | Sin equipo o instalación **capaz**, no se abre el proceso. Si existe pero está **ocupado o en reparación**, se abre con **aviso de esperar** |
| E2 | 2026-10-02 | El paso declara **capacidades**, no un equipo |
| E3 | 2026-10-02 | Al abrir se ofrecen los equipos con **lo que les cabe**; si no cabe, se asigna lo que quepa y **el resto se divide** en otro lote (R6) |
| E4 | 2026-10-02 | El equipo guarda **litros útiles** y **kg máximos** |
| E5 | 2026-10-02 | Cuarto oscuro, cámara fría, secador techado y agua son **capacidades de la instalación** |
| C1 | 2026-10-04 | **Se muestra al abrir, se elige al ejecutar.** Concilia E3 con su decisión del 2026-10-03 («el equipo concreto se elige al ejecutar, como hoy»): al abrir no se reserva nada |
| C2 | 2026-10-04 | Sin equipo capaz **se bloquea, con excepción del Coffee Process Manager** con motivo, marcada |
| C3 | 2026-10-04 | **Un equipo hereda las capacidades del lugar donde está** |
| C4 | 2026-10-04 | **Kg máximos por lo que entra**: cereza entera y despulpado |
| C5 | 2026-10-04 | **El modo de secado de la receta es requisito exacto**; cuarto oscuro y secador techado se leen del tipo de instalación |
| C6 | 2026-10-04 | **Pantalla de dividir sólo el sobrante**, desde abrir, con códigos sugeridos |

---

## 3. Qué guarda cada equipo e instalación

### 3.1 El equipo

- **Capacidades:** tabla nueva `EquipmentCapacity` (`equipmentId`, `capacidadValueId` → catálogo
  `capacidad`). Las marca quien puede registrar equipo.
- **Litros útiles:** `Equipment.litrosUtiles` (decimal, anulable).
- **Kg máximos por lo que entra (C4):** tabla nueva `EquipmentLoadLimit` (`equipmentId`, `estado` →
  catálogo `estado_cereza`, `kgMaximos`), única por equipo y estado. Hoy se piden dos: cereza entera y
  despulpado; el catálogo permite más sin migración.
- **El `capacityValue` del modelo** sirve sólo como sugerencia al dar de alta un equipo, y sólo si su
  unidad dice litros. No se compara: su unidad es texto libre.
- **Bandejas fuera:** todo lo de esta sección es para recipientes que no son bandeja
  (`trayTypeId IS NULL`). Las bandejas siguen con su capacidad derivada de pesajes (ADR-179).

### 3.2 La instalación

- **Capacidades:** tabla nueva `LocationCapacity` (`locationId`, `capacidadValueId`). Para lo que no es
  secado: cámara fría (`control_temperatura`), agua (valor nuevo `agua` del catálogo `capacidad`, con
  su definición: el lugar tiene agua para lavar).
- **Oscuridad y techo NO se marcan:** se leen del tipo (C5). `oscuridad` la tiene una
  `drying_facility` con `dark_room_climate_controlled`; techado es cualquier `DryingEnvironment`
  distinto de `open_patio`, `african_bed_outdoor` y `floor_tarp`. La columna `dryingRoomLightExposure`
  no se usa para esto (nadie la escribe).

### 3.3 Herencia del lugar (C3)

Las capacidades **efectivas** de un equipo son las suyas **más** las de la instalación donde está
**ahora** (el último traslado de su cadena de custodia, `schema.prisma:6032`). Se calculan al leer, no
se copian: si el equipo se mueve, cambian con él.

---

## 4. Arreglos previos — sin ellos E1 no tiene contra qué comparar

1. **Fermentar elige el equipo.** El formulario ofrece los recipientes capaces del paso (o todos, sin
   receta con pasos) y escribe `vesselEquipmentId`. `vesselNote` queda para notas. Sin esto, «ocupado»
   es siempre falso.
2. **Secar elige la instalación.** El formulario de empezar secado pide la `drying_facility` y la acción
   pasa `locationId`.
3. **Retirar un equipo.** Función `retirarEquipo` (ciclo de vida `retired`, con fecha y motivo,
   auditada), con el permiso que ya lo promete (`equipment:manage`). Un equipo retirado no cuenta para
   E1.
4. **Las bandejas se cuentan aparte.** Los recuentos de recipientes de E1 y de disponibilidad filtran
   `trayTypeId IS NULL`.

---

## 5. Al abrir el proceso

Vive en `abrirProceso`, **no** en `abrirProcesoEnTx`: la división y `devolverASecado` copian el proceso
sin volver a comprobar (mismo criterio que la receta obligatoria, 2a §5.1).

### 5.1 La comprobación (E1, C2)

Por cada paso de la versión con `capacidadesRequeridas` o con `modoSecado`:

- **¿Existe en el beneficio** algún equipo **activo** (no retirado) cuyas capacidades efectivas (§3.3)
  las incluyan **todas** — o, para un paso de secado, alguna instalación del tipo exacto del
  `modoSecado` (C5)?
  - **«El beneficio»** = la `Location` del beneficio y sus hijas, **más** las `drying_facility` del
    mismo site (las instalaciones cuelgan del site, ADR-156).
  - **Se juzga sobre el beneficio entero, no sobre lo que ve quien abre**: un operario que no ve un
    tanque no recibe un falso «no existe».
- **Si no existe → se rechaza** con `sin_equipo_capaz` (nombrando el paso y las capacidades que
  faltan), **salvo excepción del Coffee Process Manager** (C2): su permiso de la 2b §12, motivo
  obligatorio, fila `ExcepcionDeCapacidad` (proceso, paso, capacidades que faltaban, motivo, quién,
  cuándo, `aprobadaPorQuienOpero` como en V14), auditada. La ficha del proceso la muestra.
- **Si existe pero ninguno está libre y sano** (`clasificar`: en uso, `needs_cleaning`,
  `needs_maintenance`, `faulty`, `out_of_service`) → **se abre con aviso** «hay que esperar: <equipos y
  motivo>». No bloquea: puede liberarse antes de llegar a ese paso.
- **Un paso `opcional`** que no tiene equipo capaz **avisa, no bloquea**: no hacerlo es una opción de la
  receta.

### 5.2 Lo que cabe (E3, C1)

Para el **primer** paso que pide equipo:
- Se lista cada equipo capaz con su `kgMaximos` del estado del lote (C4) y el peso del lote (saldo del
  libro de masa): «Tanque II: hasta 400 kg de cereza · el lote pesa 520 kg».
- **Sólo se muestra. No se reserva nada** (C1). El equipo lo elige quien empieza la corrida (§6).
- **Sin peso registrado**, se dice «sin peso registrado» y no se compara. **Sin `kgMaximos`** para ese
  estado, «capacidad sin declarar».

### 5.3 Dividir el sobrante (E3, C6)

Si el lote no cabe en ningún equipo capaz libre:
- Se ofrece **dividir ahí mismo**: dos partes que suman el lote entero (R6), la primera con lo que cabe
  en el equipo elegido para mirar y la segunda con el resto, con **códigos sugeridos** (`<código>-A`,
  `<código>-B`; editables).
- Dividir se hace **después de abrir** (R6 exige un proceso abierto): el formulario abre el proceso y,
  en la misma acción, divide con el servicio de la Parte 1. Cada parte queda con su proceso, la misma
  receta y su cadena (R6).
- Dividir es una decisión de quien abre (Farm Operator, `lot:manage`): no requiere excepción.

---

## 6. Al ejecutar

- **Empezar una fermentación** elige el equipo real de la lista de capaces (§4.1): queda en
  `vesselEquipmentId`. **Empezar un secado** elige la instalación (§4.2).
- Si el equipo elegido está ocupado o no está sano (`clasificar`), **se avisa y no se impide**: es
  quien está ahí quien sabe si el tanque está libre de verdad. Queda en la foto del doble indicador de la
  2b (§4.3).
- **Elegir un equipo sin las capacidades del paso** es una desviación (2a §4.4): pide motivo, no
  bloquea.
- Cambiar de equipo durante la corrida es el `transfer` de la 2b (§4.1), hecho por una persona.

---

## 7. Lo que la 2c no hace (propuestas para después)

- **La sobrepresión** (la única regla de bloqueo del paquete que toca un recipiente, 103 kPa): sólo
  tendría sentido con la presión máxima declarada por equipo, que hoy ninguno tiene, y la cifra es de un
  proveedor (`07…:184`, inferencia del autor). Queda fuera.
- **El espacio libre del anaeróbico (headspace):** los litros quedan guardados, pero la fórmula del
  paquete es ambigua (volumen nominal o útil; L contra m³, `07…:170–173`). Se calcula cuando Daniel fije
  la definición.
- **Reservar equipo al abrir** (C1 descartó la reserva).
- **La pantalla general de dividir** (ensayos con variable y control, dividir un secado a mitad):
  sigue pendiente, como en el diseño general.
- **«Por limpiar» como estado propio** (diseño del tablero del 2026-09-29, sin construir): hoy cuenta
  como `needs_cleaning`.

---

## 8. Pruebas — cada guardián con su control y su flip-test

| Guardián | Prueba (con control) | Flip-test |
|---|---|---|
| §5.1 existe | receta con paso `sellable`+`valvula`; beneficio sin equipo con las dos → `sin_equipo_capaz` nombrando el paso; con un GrainPro que las tiene → abre | quitar la comprobación → cae |
| §5.1 herencia (C3) | paso `control_temperatura`; tanque sin ella **dentro** de la cámara fría → abre; el mismo tanque trasladado fuera → `sin_equipo_capaz` | copiar en vez de calcular la herencia → cae el segundo |
| §5.1 modo exacto (C5) | receta `solar_greenhouse`; el beneficio sólo tiene `covered_patio` → rechazo; con un `solar_greenhouse` → abre | comparar por «techado» en vez de igualdad → cae |
| §5.1 excepción (C2) | sin equipo capaz y con el Coffee Process Manager + motivo → abre, fila de excepción, marcada si operó el lote; sin motivo o con un Farm Operator → rechazo | no escribir la fila → cae |
| §5.1 ocupado | el único tanque capaz con una fermentación abierta → abre **con aviso**; con `faulty` → abre con aviso; retirado → `sin_equipo_capaz` | tratar ocupado como inexistente → cae |
| §5.1 opcional | paso opcional sin equipo capaz → abre con aviso | idem |
| §5.1 visibilidad | el tanque capaz está en una ubicación que quien abre no ve → abre (existe) | filtrar por lo visible → cae |
| §5.1 bandejas | paso `sellable`; sólo hay bandejas con esa capacidad marcada → `sin_equipo_capaz` | quitar el filtro `trayTypeId` → cae |
| §5.2 cabe | lote 520 kg de cereza; tanque con 400 kg de cereza y 600 de despulpado → «hasta 400 kg de cereza»; lote sin libro de masa → «sin peso registrado» | comparar con el kg de otro estado → cae |
| §5.3 dividir | abrir + dividir 400/120 → dos partes con proceso, misma receta, que suman 520, códigos `-A`/`-B`; partes que no suman → rechazo de R6 | idem |
| §4.1 fermentar | empezar una fermentación escribe `vesselEquipmentId`; el tanque pasa a «en uso» | escribir sólo `vesselNote` → cae |
| §4.3 retirar | retirar un equipo lo saca de E1 y de la disponibilidad, con auditoría | idem |

Si una tarea toca TypeScript, su plan manda `npm run build`. Los textos nuevos, en es y en.

---

## 9. Dependencia y orden

Se construye **después de la 2a** (necesita los pasos, el catálogo `capacidad` y el campo
`capacidadesRequeridas`) y **de la 2b** (el permiso del Coffee Process Manager). Los cuatro arreglos de
§4 no dependen de la 2a y pueden ir antes, como PR propio, si conviene: son los que hacen verdadero el
«ocupado» que ya pinta el tablero.

**Al escribirse este diseño** hay que actualizar la frase del plan de la 2a (T15) que dice que la 2c no
tiene diseño escrito.
