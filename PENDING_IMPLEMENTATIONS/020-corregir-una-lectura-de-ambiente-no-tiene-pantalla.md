# 020 · Corregir una lectura de ambiente no tiene pantalla, y la base no deja arreglarla de otra forma

**Estado: hecho**, en el PR #583, el mismo 2026-10-01 en que se encontró. La ficha se queda porque lo
que enseñó no está en el diff: **el motor completo y probado no significa que exista la pantalla**, y
ninguna prueba del servicio podía ver ese hueco porque el servicio estaba bien. Lo que se cableó, y
las dos decisiones de Daniel que lo gobiernan —la reemplazada se queda a la vista rotulada; `vigentes`
sigue filtrando y `recientes` no— están en el PR. Lo que sigue abajo es el hallazgo tal como se midió.

**Y una cosa que el flip-test tumbó antes de que saliera de aquí:** el punto 4 de «lo que hay que
hacer» iba acompañado de un pendiente contra `MeasurementCorrectionForm` e `IntervencionForm`, por
usar un array de dependencias estable. Probado en vivo en los dos caminos del formulario, **la hora
sobrevivió igual que sin array**, así que ese pendiente no se abrió: era una corazonada con forma de
hallazgo.

**Encontrado el 2026-10-01** **recorriendo la pantalla en un navegador** —no leyendo
código—, al cerrar la entrada «El ambiente del secado, sin ver en navegador» de §3. Se construyeron
los datos por los formularios de la aplicación (una instalación, un estante de 3 niveles × 4 puestos,
tres lecturas) y se buscó cómo corregir una.

**No es una comodidad que falte: es la única reparación que la base permite, y es inalcanzable.**

## Las tres capas, medidas una a una

| capa | qué tiene | dónde |
|---|---|---|
| el motor | **completo** | `lib/traceability/ambiente.ts:85-127` |
| el lector del formulario | **no lee los dos campos** | `lib/traceability/secadoForm.ts:89` |
| el formulario en pantalla | **no tiene los dos campos** | `app/instalaciones/FormularioAmbiente.tsx` |

El motor acepta `supersedesId`, **exige** `correctionReason` (`:86`), comprueba que la original sea
de esa instalación y no esté ya supersedida (`:105-107`), la sella dentro de la transacción con un
guardia de `count !== 1` (`:112-115`), y escribe auditoría `drying_ambient_reading.correct` (`:125`).
`ambienteDeInstalacion` filtra `supersededAt: null` (`:155`), así que la corregida desaparece de la
pantalla sola. Y está probado: `tests/traceability/ambiente.test.ts:256-259`.

Lo que no existe es la puerta. `leerLecturaDeAmbiente` saca **doce** campos del `FormData` y ninguno
de los dos; el componente declara **doce** `name=` y ninguno de los dos.

## Por qué no hay salida por otro lado

Los dos disparadores de `20260921120000_ambiente_de_secado/migration.sql`:

- **UPDATE** (`:111-123`) admite **un solo cambio**: `superseded_at` de `NULL` a no-`NULL` con todo
  lo demás byte a byte idéntico (`(to_jsonb(NEW) - 'superseded_at') = (to_jsonb(OLD) - ...)`). No
  tiene puerta de pruebas: ni en `nectar_test` se puede editar un valor.
- **DELETE** (`:127-137`) sólo cede por la puerta de dos llaves —`nn.limpieza_de_pruebas = 'on'` **y**
  que la base se llame `^(nectar_test|nectar_ci|nn_flip_)`—, que en producción no abre nada.

O sea: **un 310 °C tecleado en vez de 31 °C es permanente desde la aplicación.** Se queda en «Últimas
lecturas» y en la «Vista rápida» de la instalación, y arrastra el color y la edad de ese punto.

## El componente ya existe

`app/components/traceability/MeasurementCorrectionForm.tsx` hace exactamente esta forma —motivo
obligatorio incluido— y lo usan ya dos sitios: `app/components/traceability/IntervencionForm.tsx` y
`app/lots/[id]/page.tsx`. El trabajo es cablear, no diseñar.

## Lo medido, y con qué control

| qué se midió | resultado | control |
|---|---|---|
| `supersedesId\|correctionReason` en `FormularioAmbiente.tsx` | **0** | el mismo archivo declara **12** `name=`, así que el grep mide |
| campos que `leerLecturaDeAmbiente` saca del form | **12**, ninguno de los dos | `comm` contra los `name=` del componente: **0** de un lado y **0** del otro. Sus literales son 14; los dos de más son `"C"` y `"F"`, las opciones de unidad |
| `supersedesId` en todo `app/` | **0** usos | `MeasurementCorrectionForm.tsx` y `app/plots/[id]/manejo/[interventionId]/page.tsx` sí citan `correctionReason`, así que el grep mide |
| tres lecturas guardadas en una sola carga de página | **3 de 3**, sin recargar | la tercera cambió de forma (general, sin estante) y también entró |
| borrar una lectura de prueba sin la puerta | **abortó**, `P0001` | con `SET LOCAL nn.limpieza_de_pruebas = 'on'` borró **3** |

**Y un control que NO discrimina, dicho en voz alta:** «lecturas de ambiente en toda la base» pasó de
3 a 0, pero las tres eran mías, así que ese número habría dado 0 con cualquier respuesta. Lo que mide
es el conteo de ubicaciones —**55 → 41**, las 14 predichas— y de personas —**30 → 29**—, con «Beneficio
Las Nubes» en 4 después, y las 16 ubicaciones `TEST` de otras sesiones intactas.

## Lo que hay que hacer

1. Un botón «Corregir» junto a cada lectura vigente de «Últimas lecturas» que abra el formulario con
   los valores de la original, `supersedesId` oculto y el motivo obligatorio.
2. Añadir los dos campos a `leerLecturaDeAmbiente`. La rama de error ya llega a la pantalla
   —`FormularioAmbiente.tsx:24` pinta `t(\`error_${state.error}\`)` y `error_datos_invalidos` existe—
   **pero su texto es genérico**: «Faltan datos obligatorios o hay valores que no corresponden al
   formulario.» no le dice al operario que lo que falta es el motivo. Hace falta su propia clase.
3. Enseñar en la pantalla que una lectura fue corregida —hoy la supersedida sólo desaparece—, para que
   el operario no crea que su dato se perdió.
4. Un guardia que llame a la acción del formulario con `supersedesId` y sin motivo, y falle. Hoy esa
   rama sólo se ejerce desde la librería, nunca desde el `FormData`.
