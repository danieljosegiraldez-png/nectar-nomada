# Catálogos de referencia y rutinas periódicas; el primero: modelos de equipo

**Fecha:** 2026-09-18 · **Estado:** diseño aprobado por secciones, pendiente de revisión del spec
**Origen:** Daniel, al probar `/equipos/nuevo`: *«necesita más cosas… manual de
operación, modelo, fabricante, frecuencia de mantenimiento y/o calibración, y más,
todo opcional. Más datos ayudaría después para que el equipo se diferencie de otros
y no sea todo free text.»* Y después, generalizando: *«esto debería ser así para
todo… levaduras y microorganismos, instrumentos, insumos, azúcares, especies de
abejas y meliponas, varietales de café»*, con la aclaración que decide la forma:
*«no todos los catálogos requieren los mismos campos… la levadura no se le da
mantenimiento pero sí hay tasa de inoculación sugerida, atenuación %, tolerancia a
alcohol».*

Este spec fija **el contrato común** de todos esos catálogos y construye **el primero**,
modelos de equipo, para probar el contrato con un caso real. Construye también las
**rutinas periódicas** —mantenimiento, limpieza, fumigación: cada cuánto toca, cuándo se
hizo, aviso al vencer— para equipos, con la forma lista para que las instalaciones las
usen (D8). Cada una de las demás clases, y las instalaciones, tendrán su propio spec.

---

## 1. Decisiones de Daniel (2026-09-18)

| # | pregunta | respuesta |
|---|---|---|
| D1 | ¿Qué hace la plataforma con la frecuencia de mantenimiento? | **Declarar y avisar.** Se guarda cada cuánto toca, cada mantenimiento hecho es un evento, y la pantalla avisa al vencer **sin bloquear**. Sin órdenes de trabajo. |
| D2 | ¿Fabricante y modelo cómo? | **Catálogo de modelos**, escrito una vez; cada equipo elige su modelo y añade lo suyo. |
| D3 | ¿Qué más? (todo opcional) | Las cuatro: **identificación de unidad** (serie, código interno), **especificaciones de medida**, **capacidad y material**, **proveedor y garantía** (sin precio). |
| D4 | Lista de materiales en contacto | **Acero inoxidable, plástico alimentario, madera, vidrio o cerámica** (+ «otro» con nota). |
| D5 | ¿De quién es el catálogo? | **Las dos cosas:** entradas **compartidas** (sin dueño; sólo las edita la autoridad de plataforma) y **propias** de cada organización. El ajuste local —otra frecuencia de mantenimiento— va **en el equipo**, no en el modelo compartido. |
| D6 | El patrón, ¿para qué? | Para **todos** los catálogos de referencia, pero **cada clase con sus propios campos con tipo**. |
| D7 | Orden | **Contrato común + modelos de equipo** primero; después una clase por spec. |
| D8 | Las instalaciones también: *«requieren registro y frecuencia de limpieza, fumigación, etc.»* | **Rutinas comunes**: «cada cuánto toca + registro de cada vez + aviso» es UNA pieza que cuelga de un equipo **o** de una instalación. Esta entrega la construye y la usa en equipos; el spec de instalaciones la conecta (§9). |

### Lo que esto cambia de decisiones anteriores

- **ADR-095 §1** («cultivar es un `VariableCatalog`, por tercera vez») declinó tablas de
  especies y cultivares porque lo que hacía falta eran **valores controlados** con alias y
  definiciones. D6 pide otra cosa: **atributos con tipo por clase** (atenuación, tasa de
  inoculación, mantenimiento, rango de medida), que `VariableCatalog` no puede llevar sin
  volverse un JSON de atributos libres —prohibido por `CLAUDE.md` §49—. Se registra un ADR
  nuevo que **reemplaza ADR-095 §1 como regla general**; los cultivares y levaduras que hoy
  viven en `VariableCatalog` **no se mueven en esta entrega** (§9).
- **`EQUIPMENT_AND_READINESS.md` §10** dejaba fuera «meter-triggered preventive
  maintenance». D1 abre **lo justo**: un intervalo por calendario que avisa. Siguen fuera
  órdenes de trabajo, técnicos, piezas y contadores de uso (§8).

---

## 2. El contrato común de un catálogo de referencia

Toda tabla que sea catálogo de referencia —ésta y las que vengan— cumple esto:

1. **Dueño.** `organizationId String?`. **Nulo = compartido.** Con valor = propio de esa
   organización.
2. **Procedencia.** `provenanceClass ProvenanceClass` (obligatoria, ADR-038) y
   `sourceReference String?`. Una ficha del fabricante no vale lo mismo que un dato de
   memoria, y lo que cuelga de la entrada hereda esa diferencia.
3. **Retirar, nunca borrar.** `retiredAt DateTime?`. Lo retirado deja de ofrecerse al
   elegir, pero lo que ya apunta a ello lo sigue mostrando. Ningún código hace `delete`
   sobre una tabla de catálogo.
4. **Unicidad en la base, sin distinguir mayúsculas ni espacios.** Índice único funcional
   sobre `(coalesce(organization_id, '00000000-0000-0000-0000-000000000000'),
   lower(btrim(<nombre>)))`. Mismo mecanismo que `ConsumableMaterial`: el choque lo decide
   la base; el servicio sólo traduce el error. Una entrada compartida y una propia **pueden**
   llamarse igual (dueño distinto): así una finca tiene su variante sin tocar la
   compartida.
5. **Quién ve y quién edita, en un solo sitio** (`lib/catalogos/propiedad.ts`):
   - **ver:** las compartidas + las de las organizaciones cuyos sitios el usuario puede ver;
   - **editar una compartida:** el permiso de gestión de la clase **en ámbito de
     plataforma**;
   - **editar una propia:** ese mismo permiso **juzgado en un sitio de esa organización**,
     que el formulario declara — el precedente exacto de `crearMaterial` y
     `registrarEquipo`, porque `ScopeType` no tiene `organization`. La organización de la
     entrada **se deriva del sitio**, no se acepta del formulario.
6. **Rastro.** Crear, editar y retirar escriben un `AuditEvent` **en la misma
   transacción**, con el valor anterior en las ediciones.
7. **Adjuntos por `Asset`.** Una FK específica por clase en `core.asset`, como las que ya
   tiene para lote, cosecha y colmena (ADR-020 decisión 8: FKs específicas, no un par
   polimórfico).
8. **Registro.** `lib/catalogos/registro.ts` lista las tablas que son catálogo. El guardia
   (§7) lee de ahí; una tabla nueva que no se registra no queda protegida, y eso se dice en
   el comentario del registro.

**Alias** (dos nombres para lo mismo) **no** entran en esta entrega: los modelos de equipo no
los necesitan —la unicidad sin mayúsculas cubre el caso real— y los cultivares, que sí,
los traerán en su spec con el mismo diseño que `VariableCatalogValue.aliasOfId`.

---

## 3. Modelo de datos

### 3.1 `EquipmentModel` (nuevo, `core.equipment_model`)

| campo | tipo | notas |
|---|---|---|
| `id` | uuid | |
| `organizationId` | uuid? | §2.1 — nulo = compartido |
| `kind` | `EquipmentKind` | el mismo de `Equipment`: vessel, instrument, tool, machine |
| `manufacturer` | String | obligatorio |
| `modelName` | String | obligatorio. Unicidad: dueño + `lower(btrim(manufacturer))` + `lower(btrim(model_name))` |
| `recommendedMaintenanceDays` | Int? | CHECK > 0. Nulo = el fabricante no lo dice |
| `capacityValue` | Decimal(12,3)? | CHECK > 0 |
| `capacityUnit` | String? | CHECK: las dos columnas de capacidad van juntas o ninguna |
| `contactMaterial` | `EquipmentContactMaterial`? | D4 |
| `contactMaterialNote` | String? | CHECK: obligatoria si el material es `otro` |
| `provenanceClass` | `ProvenanceClass` | obligatoria; el formulario propone `manufacturer_specification` |
| `sourceReference` | String? | |
| `notes` | String? | |
| `retiredAt` | DateTime? | |
| `createdAt`, `createdBy` | | |

CHECK adicional: capacidad y material **sólo** con `kind in (vessel, machine)`. Un
refractómetro con «225 L de madera» es un error de tipeo que la base rechaza.

`enum EquipmentContactMaterial { acero_inoxidable plastico_alimentario madera vidrio_o_ceramica otro }`

`UNIQUE (id, kind)` en `equipment_model`, para la FK compuesta de §3.3.

### 3.2 `EquipmentModelSpec` (nuevo, `core.equipment_model_spec`)

Lo que el fabricante declara que el instrumento mide. **Una fila por magnitud**: un
refractómetro mide °Bx **y** temperatura.

| campo | tipo | notas |
|---|---|---|
| `modelId` | uuid | FK a `EquipmentModel`, `onDelete: Restrict` |
| `quantity` | String | «sólidos solubles», «temperatura» — lo que el operario reconoce |
| `unit` | String | «°Bx», «°C» |
| `rangeMin`, `rangeMax` | Decimal(12,4)? | CHECK `rangeMin <= rangeMax` cuando están los dos |
| `resolution` | Decimal(12,4)? | CHECK > 0 |
| `accuracyAbs` | Decimal(12,4)? | CHECK ≥ 0; absoluta, en la misma unidad (±0,2 °Bx) |
| `displayOrder`, `retiredAt`, `createdAt`, `createdBy` | | |

**No se edita en su sitio: se retira y se crea otra**, misma disciplina que
`InstrumentCheckRequirement`. Estas cifras son **especificación del fabricante**, no
medición: quedan separadas de los contrastes contra patrón, que dicen lo que el aparato
hace de verdad (`CLAUDE.md` §49, «no combinar medición cruda con valor calculado»).

### 3.3 `Equipment` (añade columnas, todas opcionales)

| campo | tipo | notas |
|---|---|---|
| `modelId` | uuid? | **FK compuesta `(model_id, kind) → equipment_model(id, kind)`**: un equipo de tipo instrumento no puede apuntar a un modelo de tipo vaso, y lo impide la base |
| `serialNumber` | String? | |
| `internalCode` | String? | el que se pega en el aparato. Único por organización: `(organization_id, lower(btrim(internal_code)))` donde no es nulo |
| `supplierOrganizationId` | uuid? | FK a `Organization`. Un proveedor es una entidad canónica (`CLAUDE.md` §9), no texto |
| `warrantyUntil` | DateTime? | **campo de día** (medianoche UTC), como `plantedAt` |

El «mantenimiento propio» de D5 **no es una columna**: es una rutina del equipo (§3.4). El
del modelo es una **recomendación** que el alta ofrece convertir en rutina con los días ya
puestos; cambiarla después en el equipo no toca el modelo compartido.

**Coherencia de dueño en la base:** un disparador `BEFORE INSERT OR UPDATE OF model_id` en
`equipment` rechaza un modelo **propio de otra organización**. Compartido o de la misma,
pasa. Va en la base y no sólo en el servicio: una restricción que vive en TypeScript no
existe para un importador ni para SQL directo (regla de la casa).

### 3.4 Rutinas: `CareRoutine` y `CareRoutineEvent` (nuevos, D8)

**`CareRoutine`** (`core.care_routine`) — qué toca y cada cuánto, sobre UNA cosa.

| campo | tipo | notas |
|---|---|---|
| `equipmentId` | uuid? | |
| `locationId` | uuid? | una instalación o una cama |
| | | **CHECK: exactamente uno de los dos** |
| `kind` | `CareRoutineKind` | `mantenimiento`, `limpieza`, `fumigacion`, `otra` |
| `kindNote` | String? | CHECK: obligatoria si `kind = otra` |
| `intervalDays` | Int | CHECK > 0. Una rutina sin intervalo no es rutina |
| `instructions` | String? | cómo se hace, o «ver manual §4» |
| `retiredAt` | DateTime? | se retira cuando deja de aplicar; no se borra |
| `createdAt`, `createdBy` | | |

Índice único parcial: **una rutina activa por (cosa, tipo)** —dos «limpieza» vivas sobre la
misma cama harían dos avisos contradictorios—; con `otra` la unicidad incluye
`lower(btrim(kind_note))`. Editar el intervalo deja `AuditEvent` con el valor anterior.

La lista de tipos es la que Daniel nombró; «etc.» queda en `otra` con nota hasta que un tipo
se repita lo bastante para merecer su propio valor, y entonces se añade con migración.

**`CareRoutineEvent`** (`core.care_routine_event`) — cada vez que se hizo.

| campo | tipo | notas |
|---|---|---|
| `routineId` | uuid | FK, `onDelete: Restrict` |
| `performedOn` | DateTime | **campo de día** |
| `performedByPersonId` | uuid? | FK a `Person` |
| `note` | String? | qué se hizo, en palabras del operario |
| `provenanceClass`, `sourceReference` | | ADR-038 |
| `voidedAt`, `voidReason` | DateTime?, String? | **anular, no borrar**: lo apuntado por error se anula con motivo y deja de contar; CHECK: motivo obligatorio si hay `voidedAt` |
| `createdAt`, `createdBy` | | |

Sólo se añade. No se edita en su sitio.

**Qué producto se usó al fumigar** —un lote de insumo, su dosis, su plazo de seguridad— no
entra aquí: pide enlazar con `ConsumableLot` y con la regla de carencia del botiquín, y va
en el spec de instalaciones.

### 3.5 `Asset` (añade dos FKs)

`equipmentModelId uuid?` — manual, ficha técnica. `equipmentId uuid?` — certificado,
factura, fotos de **esa** unidad.

---

## 4. El aviso de una rutina, derivado

Una función pura, `estadoDeRutina` en `lib/rutinas/estado.ts`, sin base, que no sabe si la
rutina es de un equipo o de una instalación:

- **último** = el `performedOn` mayor entre los eventos **no anulados**;
- **referencia** = el último; si no hay ninguno, la fecha de alta de la cosa (`acquiredAt`
  del equipo; para una instalación, la que su spec defina); si tampoco, no hay referencia;
- **estado**: `sin_referencia` | `al_dia` | `vencida`, con los días que faltan o que
  pasaron. Una rutina retirada no tiene estado.

**Avisa, no bloquea** (D1), igual que `checkAdvisoryHours` (decisión del 2026-09-14). Nada
en la plataforma deja de funcionar por una rutina vencida.

Se prueba **llamándola con entradas hostiles**, no a través de datos reales que no la
ejercitan: sólo eventos anulados, ningún evento y sin fecha de alta, el día exacto del
vencimiento, un evento con fecha futura, y que ningún camino devuelva `NaN`.

---

## 5. Permisos

| acción | permiso | ámbito |
|---|---|---|
| ver modelos | — | §2.5: compartidos + los de organizaciones con sitios visibles |
| crear / editar / retirar **modelo compartido** | `equipment:manage` | plataforma |
| crear / editar / retirar **modelo propio** | `equipment:manage` | un sitio de esa organización |
| editar los datos nuevos de un equipo | `equipment:manage` | el objetivo de siempre (`objetivoDeEquipo`) |
| crear, editar o retirar una **rutina de un equipo** | `equipment:manage` | el mismo |
| **registrar** que se hizo (equipo) | `equipment:report_condition` | el mismo: apuntar lo que se hizo es faena, como reportar el estado |
| **anular** un registro (equipo) | `equipment:manage` | el mismo |

Las rutinas de **instalaciones** siguen la misma división —definirlas es gestión, apuntarlas
es faena— con los permisos de sitio que ya existen; los nombra el spec de instalaciones.
`lib/rutinas/` recibe la comprobación de permiso como función del llamante, para no
depender de cuál sea la cosa.

**Dependencia del PR #417** (abierto): pasa la configuración de equipos a
`location:edit_beneficio`. Si se fusiona antes, este trabajo usa lo que #417 deje; la tabla
de arriba se actualiza en el plan, no aquí.

---

## 6. Pantallas

Todo lo nuevo es opcional y va **plegado**: dar de alta en el campo, desde el teléfono,
cuesta lo mismo que hoy. Los números van con `CampoNumerico` (#418), los envíos con
`BotonDeEnvio`, los textos en `messages/es` y `messages/en`.

1. **`/equipos/modelos`** (nueva) — dos grupos, **Compartidos** y **De tu organización**;
   filtro por tipo; retirados ocultos con un interruptor. «Nuevo modelo».
2. **`/equipos/modelos/nuevo`** (nueva) — tipo, fabricante, modelo; dueño («Compartido» sólo
   con autoridad de plataforma; si no, el sitio de tu organización). Según el tipo:
   instrumento → filas de especificación con «añadir otra»; vaso o máquina → capacidad con
   unidad y material. Para todos: mantenimiento recomendado, procedencia y referencia, notas.
3. **`/equipos/modelos/[id]`** (nueva) — los datos; **documentos** con el formulario de
   subida que ya usan lotes y parcelas; **qué equipos usan este modelo**; editar y retirar.
4. **`/equipos/nuevo`** (cambia) — los seis campos de hoy sin tocar. Debajo, «Más datos
   (opcional)» plegado: modelo (filtrado por el tipo elegido, compartidos y propios
   separados, enlace «¿No está? Crea el modelo»), nº de serie, código interno, proveedor,
   garantía hasta. Si el modelo trae mantenimiento recomendado, una casilla marcada
   «Crear la rutina de mantenimiento cada N días» (se puede desmarcar o cambiar los días).
5. **`/equipos/[id]`** (cambia) — tres secciones nuevas:
   - **Identificación**, con «Editar datos». Hoy no existe editar un equipo, y sin esto un
     campo opcional que se deja en blanco al dar de alta no se puede llenar nunca.
   - **Rutinas**: una tarjeta por rutina (tipo, cada cuánto, último, próximo, aviso
     «vencida hace N días»), con «Registrar que se hizo» (fecha, quién, nota) y su historial,
     anulados tachados con su motivo. «Añadir rutina» (tipo, días, instrucciones).
     El componente vive en `app/components/rutinas/` y no sabe de equipos: el spec de
     instalaciones lo reutiliza tal cual.
   - **Documentos**: los del equipo y **los heredados del modelo**, marcados como tales.
6. **`/equipos`** (cambia) — el modelo junto al nombre, etiqueta «rutina vencida» y filtro
   «sólo vencidas».

---

## 7. Pruebas y guardias

- **Unitarias (herméticas):** `estadoDeRutina` con entradas hostiles (§4).
- **Con base** (grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`, porque el
  carril hermético no tiene base):
  - unicidad sin mayúsculas: «ATAGO / PAL-1» y «atago / pal-1 » chocan en el mismo dueño, y
    **no** chocan entre compartido y propio;
  - la FK compuesta rechaza un instrumento con modelo de vaso;
  - el disparador rechaza un modelo propio de otra organización y acepta uno compartido;
  - los CHECK de capacidad, material `otro` sin nota y rango invertido;
  - una rutina con equipo **y** sitio, o con ninguno, se rechaza; dos rutinas activas del
    mismo tipo sobre la misma cosa chocan, y una retirada no cuenta; una rutina de sitio se
    crea y se registra por el servicio (aunque su pantalla llegue con el spec de
    instalaciones);
  - un registro anulado sin motivo se rechaza, y anulado deja de contar como «último»;
  - permisos: crear un modelo propio en el sitio de otra organización → prohibido; crear
    uno compartido sin ámbito de plataforma → prohibido; la organización del modelo es la
    del sitio aunque el formulario mande otra;
  - un `AuditEvent` en la misma transacción por crear, editar y retirar.
- **Guardia de arquitectura** `tests/arquitectura/catalogos-con-contrato.test.ts`: cada
  tabla del registro tiene `organization_id` anulable, `provenance_class`, `retired_at`, y
  ningún archivo de `lib/` ni `app/` llama a `delete`/`deleteMany` sobre ellas. **Control
  positivo:** el registro no está vacío y el lector de esquema encuentra `EquipmentModel`.
  **Flip-test:** quitar `retiredAt` del esquema y añadir un `delete` —cada mutación con su
  sha antes y después— y ver caer el test que corresponde, por su nombre.
- **Navegador** en la app local contra la base local: alta de modelo compartido y propio,
  alta de equipo con modelo y su rutina propuesta, registrar y anular, ver el aviso vencido.
- **Compuertas:** `npm run typecheck`, `npm run build`, `bash scripts/ci.sh`, y el carril con
  base para las pruebas nuevas.

---

## 8. Fuera de alcance

- Precio, amortización y contabilidad del activo (`EQUIPMENT_AND_READINESS.md` §10).
- Órdenes de trabajo, técnicos asignados, piezas de repuesto, contadores de uso.
- Un flujo para **proponer** un modelo propio al catálogo compartido (D5 lo dejó fuera).
- Alias en modelos de equipo (§2).
- **Avisos que llegan a quien no está mirando**: dependen de `Notification`, que no existe
  (`EQUIPMENT_AND_READINESS.md` §10). Aquí el aviso se **ve** en la ficha y en la lista.
- Las demás clases (§9).

---

## 9. Lo que viene después: una clase por spec

Cada una reutiliza §2 tal cual y lleva **sus** columnas, que **confirma Daniel** —los
documentos de `docs/beneficio` no definen atributos de levaduras ni de cultivos; no se
inventan—.

| clase | hoy vive en | lo que implica moverla |
|---|---|---|
| levaduras y microorganismos | valores de `VariableCatalog` | migración de datos de los valores ya usados |
| insumos, azúcares incluidos | `ConsumableMaterial` (sólo propio); azúcar en `FeedingMaterial` | añadir el dueño compartido; decidir si la lista fija de alimentación pasa a catálogo |
| especies de abejas y meliponas | texto y el tipo de sitio «meliponario» | tabla nueva; enlazar colonias |
| varietales de café | `VariableCatalog` `cultivar`, con cohortes plantadas que apuntan ahí | **migración de datos**: las cohortes cambian de FK |

**Instalaciones** no son un catálogo —son sitios, `Location` de tipo `drying_facility` y
`drying_bed`— y tienen su propio spec, que D8 ya orienta:

- **conectar las rutinas** de §3.4 (limpieza, fumigación…) con su pantalla y sus permisos;
- **el ambiente**, hoy la lista fija `DryingEnvironment` (invernadero solar, cuarto oscuro
  climatizado, patio abierto, patio techado, secadora mecánica), frente a lo que Daniel
  describe: bajo techo sin paredes, cuarto cerrado oscuro, invernadero solar;
- **el tipo de cama** —cama africana, bandeja de malla—, que hoy no existe;
- **lo que la climatiza** —aire acondicionado, deshumidificador— como **equipos ubicados
  ahí**, que los traslados ya permiten, en vez de casillas;
- **qué producto se usó al fumigar**, enlazado a `ConsumableLot` (§3.4).

---

## 10. Registro de la decisión

Un ADR nuevo en `docs/architecture/DECISIONS.md` —número el siguiente libre al fusionar,
que `numeros-de-adr-unicos` vigila—: **«Catálogos de referencia con atributos: compartidos
y propios, un contrato común»**. Dice qué reemplaza de ADR-095 §1 y por qué, y amplía
`EQUIPMENT_AND_READINESS.md` §10 con las rutinas por calendario que avisan (D1, D8), dejando
dicho qué sigue fuera: órdenes de trabajo, técnicos, piezas y contadores de uso.
