# Vistas de finca y de parcela — diseño

**Fecha:** 2026-09-18 · **Estado:** propuesto, pendiente de revisión de Daniel
**Depende de:** PR #413 (trampas de broca). Este diseño reorganiza pantallas que ese PR crea; no se implementa hasta que esté fusionado.

## 1. Por qué

En el recorrido del 2026-09-18 de las trampas de broca, Daniel señaló tres problemas en el tablero de parcela (`/plots/[id]`):

- **(a)** Es demasiado largo: hay que bajar mucho.
- **(b)** Lo diario está mezclado con lo que casi nunca se toca.
- **(d)** Cuesta ver de un vistazo cómo está cada trampa.

Además, la foto de la revisión queda escondida en un plegable debajo del botón de guardar, y la tarjeta dice «Bloque Bloque Norte».

La causa medida de (a) no son los datos, sino los formularios metidos dentro del tablero: abrir jornada (con la lista entera de personas), revisión y foto por cada trampa, muestras de suelo y foliares, y describir suelo. El archivo `app/plots/[id]/page.tsx` tiene 822 líneas.

## 2. Decisiones de Daniel (2026-09-18)

1. **Dos usos distintos:** en el campo se registra, con el móvil; en la oficina se revisa y se configura, con el ordenador.
2. **Quién registra en el campo:** Sherry, que es la responsable, con la tarea asignada en su rol, y su asistente (todavía sin usuario). Bob Huerbsch y David, el capataz, también pueden, aunque su rol principal es otro.
3. **Las revisiones de trampas se hacen en una «Ronda de trampas» de toda la finca**, no lote por lote. Las trampas se numeran por finca.
4. **Jerarquía de vistas:** finca → parcela → bloque → planta. **Esta fase cubre finca y parcela.** Bloque y planta quedan para después.
5. **El tablero de parcela es sólo para mirar y se organiza en pestañas.** Cada «registrar» es un botón que lleva a su pantalla.
6. **Los bloques tienen tipo.** «Bloque» es el concepto general, un grupo de plantas dentro de una parcela, con tres tipos:
   - **microparcela:** la subdivisión normal de la parcela;
   - **trampa:** la zona que cubre una trampa de broca;
   - **experimental:** por ejemplo, biochar aplicado frente a no aplicado, o lotes de biochar con distintos inoculantes.
7. **Solapamiento:** las microparcelas no se solapan entre sí; los bloques de trampa y los experimentales sí pueden cruzarlas.
8. **Una foto tomada sin señal se guarda en el móvil y se sube al volver la conexión**, en esta misma fase.
9. Todo el diseño se trabajó sólo con texto, sin bocetos, para gastar menos.

## 3. Vista de parcela (`/plots/[id]`), en el ordenador

**Cabecera fija**, encima de las pestañas:
- nombre del lote y de su finca;
- una línea de pendientes: «N por hacer · M datos faltan». Si no hay nada: «Nada pendiente».

**Pestañas.** La pestaña activa va en la URL (`?pestana=trampas`), para que los enlaces de los avisos lleven directo a ella. Así desaparecen los plegables con `id` dentro (`#trampas`, `#condiciones`, `#muestras`) y el problema de que el navegador no abra un `<details>`.

| pestaña | contenido | botones |
|---|---|---|
| **Resumen** (por defecto) | «Estado del lote» (plantas, variedades, densidad, rendimiento); la lista completa de pendientes con sus enlaces; las últimas 3 jornadas | «Abrir jornada», «Ir a la ronda de trampas» |
| **Trampas y bloques** | tabla de trampas: número, bloque con su tipo, última revisión, última lectura y estado (al día / toca revisar / lectura alta); bloques agrupados por tipo | «Registrar revisión» → ronda de la finca; «Configurar trampas y bloques» → ajustes |
| **Condiciones** | condiciones del terreno y perfiles de suelo | «Describir suelo» |
| **Muestras** | muestras de suelo y foliares con sus resultados | «Añadir muestra», «Añadir resultado» |
| **Fotos** | las fotos de la parcela y de sus revisiones de trampa, por fecha | «Añadir foto» |

**Ningún formulario queda dentro del tablero.** Cada uno pasa a su propia pantalla, bajo la parcela:
- `/plots/[id]/jornada/nueva`;
- `/plots/[id]/muestras/nueva`;
- `/plots/[id]/suelo/nuevo`;
- `/plots/[id]/fotos/nueva`.

Cada una vuelve al tablero, a la pestaña de donde se salió. Los formularios en sí no cambian: se mueven, no se reescriben.

**Ajustes** (`/plots/[id]/ajustes`) sigue siendo la pantalla de configurar: área, siembras, bloques (ahora con tipo), alta de trampas y regla de la finca.

**En el móvil**, la misma vista con las pestañas desplazables en horizontal. No hay una versión aparte: el registro en el campo vive en la ronda (§4).

## 4. Vista de finca (`/farms/[id]`)

### 4.1 En el ordenador

**Cabecera:** nombre de la finca y una línea de pendientes de toda la finca.

| pestaña | contenido |
|---|---|
| **Lotes** (por defecto) | tabla con una fila por lote: plantas, área (o «sin área»), trampas con aviso, pendientes. Cada fila enlaza al tablero de su parcela |
| **Trampas** | todas las trampas de la finca, con número, lote, bloque y su tipo, última revisión, lectura y estado. Filtros «toca revisar» y «lectura alta». También muestra la regla de la finca con un enlace para cambiarla |
| **Fotos** | las de toda la finca, por fecha |

### 4.2 La ronda de trampas (`/farms/[id]/ronda`), pensada para el móvil

- **Lista de tarjetas grandes, una por trampa activa.** Primero van las que tocan revisar (vencidas y luego las de hoy), después el resto, y dentro de cada grupo por número.
- **Cada tarjeta muestra:**
  - «Trampa N» y su lote y bloque;
  - el estado con color **y texto**: «atrasada 3 días», «toca hoy», «al día»;
  - la última lectura;
  - «próxima revisión: 2 oct», calculada con la regla. **Sin regla, la próxima revisión no se muestra**, porque no hay valor por defecto.
- **Al tocar una tarjeta se abre el formulario corto:**
  1. fecha, con hoy ya puesto y editable;
  2. lectura (obligatoria, sin valor preseleccionado);
  3. conteo (opcional; vacío es «no se contó», y la rueda del ratón no lo cambia);
  4. otros insectos (sí / no / sin registrar) y su nota;
  5. mantenimiento: limpieza, líquido y cebo, cada uno sí / no / sin registrar;
  6. foto de la tela, **dentro del formulario**.
- **Quién observó:** la persona con sesión iniciada. No se elige.
- **Procedencia fija: observación directa.** Los campos «¿Cómo se conoce este dato?» y «Calidad del dato» no aparecen en la ronda. No es un valor inventado: en la ronda, quien registra es quien miró la tela. El formulario de ajustes y el de corrección siguen ofreciéndolos. Quedan 6 campos en vez de 10.
- **Al guardar** vuelve a la lista con la tarjeta marcada «revisada hoy».

### 4.3 Sin señal

- **La revisión** se guarda en la cola sin conexión que ya existe (`lib/sync/offlineQueue.ts`), con un payload nuevo construido por una función pura, como los de `lib/sync/parcelaPayload.ts`, para que se pueda probar sin DOM. Se envía al volver la señal. El indicador existente («Nada pendiente de enviar / Sincronizar ahora») la cuenta.
- **La foto** se guarda en el móvil y viaja por la cola de medios existente (`lib/sync/fieldMedia.ts`, subida en dos pasos con URL firmada). Para que quede enganchada a su revisión aunque llegue después, **el móvil genera el id de la revisión** y la foto lo lleva. El servidor la acepta sólo si esa revisión existe y es de una trampa a la que la persona tiene acceso.
- **Si la foto llega antes que su revisión**, se reintenta: nunca se engancha a otra revisión.
- Queda por decidir en el plan, con el código delante, si la foto de trampa se modela como `FieldEvent` de tipo `foto` (como las fotos de campo) o como `Asset` con `specimenObservationId` (como hoy). El plan lo resuelve leyendo la cabecera de `fieldMedia.ts`, que explica por qué `FieldEvent` es append-only.

## 5. Bloques con tipo

- `PlotBlock` gana `blockType`: un enum `microparcela | trampa | experimental`, obligatorio en los bloques nuevos.
- Los bloques que ya existan en producción al migrar quedan con el tipo **sin registrar**, nunca con uno supuesto (ADR-080). Ajustes pide elegirlo.
- `PlotBlock` gana también una `description` opcional, de texto libre: para un experimental, qué se compara.
- **La pantalla muestra el tipo como prefijo:** «Microparcela Norte», «Bloque de trampa 3», «Bloque experimental Biochar A». Sin tipo muestra sólo el nombre. Así desaparece «Bloque Bloque Norte».
- **El solapamiento (§2.7) no se comprueba en esta fase**: hoy no hay plantas asignadas a bloques. Queda como requisito para la fase de plantas.
- **Enlazar un bloque experimental** con su `BiocharBatch` o `TreatmentBatch` del Research OS queda para después.

## 6. Permisos

- La vista de finca y la ronda las ve quien pueda ver o gestionar trampas en esa finca: `can(..., "view" | "manage", "specimen")` con ámbito en la finca o en uno de sus lotes. **Se comprueba en el servidor**, igual que hoy `requireTrapAccess`.
- En la ronda sólo salen las trampas de los lotes que esa persona puede ver.
- Con sesión pero sin permiso: «No tienes acceso a las trampas de esta finca», nunca una lista vacía que parezca «no hay trampas».
- **Te tocará a ti, Daniel:** asignar el permiso de trampas a Sherry, y luego a su asistente cuando tenga usuario, a Bob y a David. **David no aparece en la lista de personas de la copia local**: habrá que comprobar si existe en producción.

## 7. Fuera de esta fase

- Vistas de bloque y de planta.
- Comprobar el solapamiento de microparcelas.
- Enlazar experimentos con el Research OS.
- Mapa y posición de las trampas: hoy no tienen coordenadas.
- Orden de ruta personalizado para la ronda.
- Proteger de la rueda del ratón el resto de campos numéricos: está en marcha en otra sesión.

## 8. Cómo se sabrá que funciona

- **Prueba de la ronda:**
  - la ronda de una finca con trampas en dos lotes muestra las dos;
  - una persona con acceso a un solo lote sólo ve las de ese lote;
  - sin regla no sale «próxima revisión».
- **Prueba de la ronda sin señal:**
  - el payload de la revisión se construye de un `FormData` y conserva vacío = `null` en el conteo y en los tres de mantenimiento;
  - la foto enviada con un id de revisión que no existe se rechaza.
- **Prueba de los bloques:** un bloque sin tipo se muestra sólo con su nombre, y la migración no asigna tipo a los existentes.
- **Recorrido en el navegador con Daniel,** en el ordenador y en el móvil:
  - el tablero de parcela cabe sin bajar en la pestaña Resumen;
  - cada aviso lleva a su pestaña;
  - una revisión hecha en modo avión, con foto, llega al volver la señal y queda enganchada a su revisión.
