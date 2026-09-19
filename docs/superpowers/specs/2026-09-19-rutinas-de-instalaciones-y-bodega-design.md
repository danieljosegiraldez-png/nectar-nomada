# Rutinas de instalaciones, y la bodega — diseño

**Fecha:** 2026-09-19 · **Camino:** arquitectónico · **Estado:** aprobado por secciones en conversación, pendiente de revisión escrita · **Medido sobre:** `origin/main` = `5e3a321`

**Alcance.** Es el «spec de instalaciones» que dejó abierto `2026-09-18-catalogos-y-modelos-de-equipo-design.md` §9 (ADR-172, D8): **conectar las rutinas periódicas** —limpieza, fumigación, mantenimiento— a los **lugares**, con el producto que se usó, y añadir el lugar que faltaba: **la bodega**.

**Lo que NO toma, porque lo lleva otra sesión** (`2026-09-18-secado-por-bandeja-y-su-receta-design.md`, rama `secado-2a` en marcha): los tipos de secado nuevos (cama africana a la intemperie, piso con lona), el estante (`drying_rack`) con sus posiciones, la sombra, las bandejas como `Equipment` con tipo y número, y el ambiente leído a mano. Esa spec cubre ya lo que Daniel describió como «bajo techo, cuarto oscuro, invernadero solar con camas africanas o bandejas de malla».

---

## 1. Qué pidió Daniel

2026-09-18: *«también las instalaciones requieren registro y frecuencia de limpieza, fumigación…»*. D8 del spec de catálogos decidió **rutinas comunes**: la misma pieza de equipos cuelga de un equipo **o** de un lugar.

## 2. Decisiones de Daniel (2026-09-19)

| pregunta | decisión |
|---|---|
| qué lugares llevan rutinas | **todos los propuestos**: el beneficio, cada instalación de secado, cada cama o posición, **y una bodega nueva** |
| qué ofrece «mover a almacenamiento» | **bodegas primero, el resto aparte** en «otros lugares»; nada deja de ser elegible |
| de qué cuelga una bodega | **de un beneficio o de una finca** (`site`) |
| qué se registra del producto | **producto y cantidad, opcionales**; sin producto se enseña «producto sin declarar» |
| muchas posiciones | **por estante y por cama suelta**: las posiciones de un estante comparten la rutina del estante; una cama sin estante lleva la suya |
| cómo se enlaza el producto | **camino A**: el consumo de insumo gana un padre más, la vez que se hizo la rutina |

## 3. Lo que ya existe — medido sobre `5e3a321`

| qué | dónde | qué da, y qué falta |
|---|---|---|
| la rutina | `CareRoutine` (`equipmentId` XOR `locationId`, CHECK e índices parciales en la base) | la base **ya admite** rutinas de lugar; el servicio las rechaza: `lib/rutinas/rutinas.ts:40`, `RutinaError("instalaciones_pendiente")` |
| cada vez que se hizo | `CareRoutineEvent` (día, quién, nota, procedencia, anulación) | no dice con qué producto |
| el consumo de insumo | `MaterialConsumptionEntry`, padre discriminado `MaterialConsumptionParent` en `lib/traceability/operations.ts` (`fermentationRun`, `dryingRun`, `location`, `fieldSession`) | **la regla «un solo padre» vive sólo en el servicio**: la migración `20260917180000_consumo_por_jornada` la dice en prosa y no hay `CHECK` |
| el descuento del inventario | `operations.ts` crea el `ConsumableStockEvent` `consumed` **en la misma transacción** que el consumo, sólo si hay lote **y** cantidad | escribir la fila de consumo por otro camino **no descuenta**: el saldo sale de `ConsumableStockEvent` (`lib/inventario/existencias.ts`) |
| los lugares | `LocationType`: `beneficio`, `drying_facility`, `drying_bed`; `crearUbicacionDeSecado` (`lib/traceability/instalaciones.ts`) exige `drying_facility` bajo `site` y `drying_bed` bajo `drying_facility`, y `exigeEditarBeneficioEn` sobre el padre | **no hay bodega** |
| el almacenamiento | `StorageAssignment.locationId`; `getManageableContext` (`lib/traceability/lots.ts`) ofrece **todas** las ubicaciones visibles | nada distingue una bodega |
| la tarjeta de rutina | `app/components/rutinas/TarjetaDeRutina.tsx`, usada en `/equipos/[id]` | se reutiliza |
| la ficha del lugar | `app/instalaciones/[id]/page.tsx` | **la está cambiando `secado-2a`** |

## 4. Diseño

### 4.1 La bodega

- **Tipo nuevo `storage_facility`** en `LocationType`.
- **Padre**: `beneficio` o `site`. Lo comprueba el servicio (`crearUbicacionDeSecado` se generaliza o se hermana con `crearBodega`, mismo archivo) **y la base**, con un disparador sobre `location` que rechaza un `storage_facility` con otro tipo de padre.
- **Permiso para crearla**: el mismo que una instalación de secado, `exigeEditarBeneficioEn` sobre el padre.
- **Se crea en `/bodegas/nueva`**, con su propio formulario y su propio servicio (`lib/traceability/bodegas.ts`), ofreciendo como padres los beneficios y las fincas donde se puede editar el beneficio. Hereda organización, clasificación y zona del padre, como las instalaciones. **No reutiliza `FormularioUbicacion` ni `lib/traceability/instalaciones.ts`**, que `secado-2a` está reescribiendo: medido el 2026-09-19, esa rama cambia los dos. Archivos propios dejan el choque en una línea.
- **Es configuración del beneficio**: entra en `TIPOS_DEL_BENEFICIO` (`lib/traceability/locations.ts`), así que editar sus atributos por los caminos genéricos exige `location:edit_beneficio`, como una instalación.
- **Almacenar**: el formulario de `StorageAssignment` agrupa: primero **Bodegas**, después **Otros lugares**. Ningún lugar deja de ser elegible, así que los almacenamientos viejos siguen igual.
- **Microlotes**: `createMicrolot` rechaza también un padre `storage_facility` (misma razón que `beneficio_no_se_subdivide`: copiaría el tipo saltándose su permiso).

### 4.2 Rutinas de lugar

- `lib/rutinas/rutinas.ts` deja de rechazar `locationId`. Acepta estos tipos de lugar:

  | tipo | ¿rutina? |
  |---|---|
  | `beneficio`, `drying_facility`, `storage_facility` | sí |
  | `drying_rack` (parte 2, cuando exista) | sí |
  | `drying_bed` **sin** estante (su padre es `drying_facility`) | sí |
  | `drying_bed` **dentro de un estante** (su padre es `drying_rack`) | **no**: `RutinaError("rutina_en_el_estante")`, y el mensaje manda al estante |
  | cualquier otro | **no**: `RutinaError("lugar_sin_rutinas")` |

  El `RutinaError("instalaciones_pendiente")` desaparece.
- **Permisos**, con la misma división que en equipos:
  - **definir, editar, retirar y anular** es gestión: `location:edit_beneficio` en el lugar (lo que ya abre configurar el beneficio);
  - **apuntar que se hizo** es faena: **`equipment:report_condition` juzgado en el lugar**, el mismo que ya usa apuntar una rutina de equipo (`lib/rutinas/rutinas.ts`). Lo tienen hoy **Farm Manager** y **Farm Operator** (`lib/rbac/catalog.ts`). Su nombre dice «equipo», pero es el permiso de la faena de cuidar, y un permiso nuevo obligaría a tocar cada perfil. **No se inventa uno.**
- **Días** (`performedOn`) como en equipos: `fechaDeDia`, medianoche UTC, `estadoDeRutina` sin cambios.

### 4.3 El producto: cero, uno o varios

- **`MaterialConsumptionEntry.careRoutineEventId`**, nueva, anulable, FK a `CareRoutineEvent` con `RESTRICT`.
- **`MaterialConsumptionParent` gana la variante `careRoutineEvent`.** El `switch` exhaustivo de `consumptionParentData` obliga a tratarla.
- **La base gana el CHECK que faltaba**: `num_nonnulls(fermentation_run_id, drying_run_id, location_id, field_session_id, care_routine_event_id) <= 1`.
  - **Antes de escribir la migración**, contar en producción las filas con más de un padre. Si hay alguna, la migración no se escribe a ciegas: se enseña a Daniel.
- **Apuntar una rutina con productos** crea el `CareRoutineEvent` y **un consumo por producto**, **en una sola transacción**, cada consumo por el camino de `operations.ts` que descuenta el inventario. Si uno falla (unidad distinta del lote, por ejemplo), no queda nada.
- **El insumo tiene que ser de la organización del lugar.** Otro, `RutinaError("insumo_ajeno")`.
- **Anular la vez que se hizo** no toca sus consumos. El descuento ya ocurrió y deshacerlo sería editar el inventario. La ficha los enseña junto al evento anulado, y cuadrar el saldo es la reconciliación de siempre.
- **Sin producto** en una fumigación, la ficha dice **«producto sin declarar»**. Nunca se rellena.

### 4.4 Lo que la climatiza

Nada nuevo en la base. La ficha del lugar lista los **equipos que están ahí ahora** (su último `EquipmentTransfer` hacia ese lugar), con enlace. El aire acondicionado y el deshumidificador son equipos, y sus rutinas de mantenimiento ya existen (ADR-172).

## 5. Pantallas

- **`/bodegas`** lista las bodegas con el aviso «N rutinas vencidas» y un filtro de vencidas, como `/equipos`; **`/bodegas/nueva`** la crea; **`/bodegas/[id]`** es su ficha, con los tres bloques de abajo. `/instalaciones` sólo gana un enlace a `/bodegas`.
- **`/instalaciones/[id]`** suma los bloques **al final**, sin tocar los de `secado-2a`: **Rutinas** (`TarjetaDeRutina`, con los **productos** de cada vez que se hizo) y **Equipos aquí**. Los dos salen de un solo componente, `RutinasDeLugar`, que es también el de `/bodegas/[id]` y `/beneficio`.
- **Camas sueltas**: su fila en la ficha de la instalación enseña sus rutinas.
- **`/beneficio`**: sólo se añade la tarjeta de rutinas del beneficio.
- **Formulario de rutina hecha**: filas repetibles de insumo (lote de insumo de la organización + cantidad + unidad), opcionales.

## 6. Pruebas

Cada guardia con su flip-test: la mutación que dice cazar, y **el test que cae, por su nombre**.

- **Base**: un `storage_facility` bajo una parcela se rechaza, y bajo un beneficio o una finca entra (control positivo). Un consumo con dos padres se rechaza. Una rutina con `equipmentId` y `locationId` sigue rechazada.
- **Servicio**:
  - la tabla de tipos de §4.2, un caso por fila, incluida la posición dentro de un estante (parte 2);
  - gestión define, faena apunta; un operario que intenta definir recibe el error de permiso;
  - dos productos → dos consumos y dos `ConsumableStockEvent`, más la auditoría, en la misma transacción; con el segundo fallando no queda **ninguna** fila (contar antes y después);
  - un insumo de otra organización se rechaza.
- **Almacenar**: con una bodega y un lugar viejo, las dos salen, la bodega primero.
- **Carril**: las pruebas nuevas con base van al grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`, y `bash scripts/ci.sh` no las ve.
- **Navegador**, contra una base propia (nunca `nectar_test`): crear una bodega, fumigación cada 30 días, apuntar una de hace 40 días con dos productos, leer «vencida hace 10 días», y ver que el saldo de los dos insumos bajó.

## 7. Orden

1. **Parte 1**, independiente de `secado-2a`: bodega (§4.1), rutinas de lugar sin estante (§4.2), producto (§4.3), climatización (§4.4), pantallas. Si `secado-2a` se fusiona antes, se construye encima; si no, los bloques de la ficha van al final para que el choque sea mínimo.
2. **Parte 2**, cuando `drying_rack` esté en `main`: rutina en el estante y el rechazo en sus posiciones.

## 8. Registro de la decisión

ADR nuevo, el siguiente número libre al fusionar (`numeros-de-adr-unicos` lo vigila): **«Rutinas de lugar y la bodega»**. `03_public_api.md` recibe los nombres nuevos (`storage_facility`, `careRoutineEventId`) **en el mismo commit** que los introduce (`00_reglas_del_modulo` §7.6).

## 9. Fuera de alcance

Las lecturas de ambiente de la bodega (temperatura, humedad relativa): son la pieza `LecturaDeAmbiente` de la spec de secado, y extenderla a bodegas es una decisión aparte · órdenes de trabajo o bloqueos: las rutinas **avisan, no bloquean** (D1) · las rutinas de apiarios y meliponarios · el QR de la bodega.
