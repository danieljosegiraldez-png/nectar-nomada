# Fincas y parcelas: elegir la finca, y crear fincas, parcelas y microparcelas desde la app

**Estado:** borrador para revisión de Daniel, 2026-09-18.

## 1. Lo que pidió Daniel

> «cuando voy a finca, plots o cosecha, debería preguntarme qué finca —trabajo con varias— o
> mostrarme todas; elijo una y entro a sus parcelas y microparcelas.»
>
> «no veo cómo crear plots de finca, por ejemplo Kiva Estate: me sale como farm pero no me deja
> crear parcelas y vincularle una cosecha o lote.»

Respuestas del 2026-09-18:
- **Alcance:** todo, también crear fincas.
- **Permisos:** una finca nueva la crea sólo el administrador de plataforma. Dentro de una finca,
  las parcelas y microparcelas las crea el Farm Manager de esa finca, y el Farm Operator no.
- **Selector:** se elige una vez y se recuerda en la sesión («Finca: Rosina · cambiar»). Hay
  «ver todas». Con una sola finca se entra directo.
- **Kiva Estate es una finca real.**

## 2. Lo que hay hoy (medido sobre `origin/main`, 2026-09-18)

- **Crear finca o parcela: no hay pantalla.**
  - Una `Organization` sólo la crea `prisma/seed.ts` o un script de `scripts/`.
  - Una `Location` de tipo `plot` también, sólo por script o seed.
  - Desde la app se crean `beneficio` y `drying_facility` (`location:create_site`, bajo un sitio
    que ya existe) y `apiary_site`.
- **Microparcela:** existe `createMicrolot` en `lib/traceability/locations.ts:228`, que exige un
  padre `plot`. Ninguna pantalla la llama.
- **El modelo ya tiene la jerarquía.** Organización → `Location site` (el terreno de la finca) →
  `plot` → `micro_plot`, por `parentLocationId`. No hace falta ninguna tabla nueva.
- **No hay selector.**
  - `/plots` y el formulario de cosecha (`/lots/new`) pintan todas las parcelas del usuario
    mezcladas; salen de `getManageableContext`, que no recibe finca.
  - La cosecha se vincula a una parcela por `locationId` (`recordHarvestEvent`, `lot:manage`).
- **Kiva Estate:**
  - `prisma/seed.ts:260` la crea como `Organization` (`estate`) **sin ningún `site`**. Por eso
    aparece como finca y no se le puede colgar nada.
  - El comentario de `seed.ts:168` dice que es un nombre ficticio de demostración. Daniel dice
    que es real. **Se señala aquí y no se corrige en silencio:** decide Daniel qué dice ese
    comentario.

## 3. Diseño

### 3.1 La lista de fincas y el selector

- **`/fincas`** lista las fincas que el usuario puede ver: las organizaciones de tipo `farm` o
  `estate` con un `site` al que tiene acceso, más la entrada «Ver todas».
  - El administrador ve también las **organizaciones de finca sin terreno**, marcadas «sin
    terreno · crearlo». Es el caso de Kiva Estate hoy.
- Elegir una finca guarda su `site` en una cookie de sesión (`finca`). «Ver todas» la borra.
- **`/finca`, `/plots` y `/lots/new`**:
  - Sin elección y con varias fincas, mandan a `/fincas`.
  - Con una sola finca, la eligen solos.
  - Con elección, arriba enseñan «Finca: *nombre* · cambiar» y **filtran a lo que cuelga de
    ese `site`**.
- **El filtro no es un permiso.** La cookie sólo acota lo que ya está autorizado. Una cookie
  con una finca ajena no da acceso a nada: se descarta y se vuelve a preguntar.

### 3.2 Crear una finca (sólo el administrador)

- **`/fincas/nueva`** pide:
  - nombre (obligatorio, hasta 120 caracteres);
  - tipo: finca (`farm`) o estate (`estate`);
  - una descripción opcional.
- En **una transacción**, con su `AuditEvent`, crea la `Organization` y su `Location site`.
- Para una organización que ya existe sin terreno (Kiva Estate), el mismo formulario crea sólo
  el `site`.
- **Permiso nuevo `organization:create_farm`**, sólo para Platform Admin.
- **Quién gestiona la finca nueva** se asigna aparte, con la asignación de roles que ya existe.
  Esta pantalla no concede permisos.

### 3.3 Crear parcelas y microparcelas (Farm Manager de esa finca)

- **Parcela.** En `/finca`, con una finca elegida, «Nueva parcela» pide:
  - nombre (obligatorio);
  - área en hectáreas (opcional).

  Lo demás (sol, sombra, altitud, suelo…) se completa en la ficha que ya existe,
  `/plots/[id]/ajustes`.
  - Permiso: `location:create_site` sobre el `site` de la finca. Es el mismo que ya usa el
    beneficio, así que el Farm Manager lo tiene y el Farm Operator no, sin tocar roles.
  - Su descripción en el catálogo cambia de «hoy, un beneficio» a «un beneficio, una
    instalación o una parcela».
- **Microparcela.** En la ficha de la parcela, «Nueva microparcela» (nombre) llama a
  `createMicrolot`, que ya existe con su permiso.
- **Nombres:** no se repiten dentro del mismo padre, sin distinguir mayúsculas ni espacios.
  Dos fincas sí pueden tener cada una su «Lote 1».

### 3.4 La cosecha

- El selector de parcela de `/lots/new` enseña **sólo las parcelas de la finca elegida**, y
  debajo de cada una sus microparcelas.
- Una cosecha puede ir a una parcela **o a una microparcela**. Hoy `recordHarvestEvent`
  **no comprueba el tipo** del `locationId` (`lib/traceability/harvest.ts`): lo único que la
  limita a parcelas es la lista del formulario. Se añade la comprobación en el servicio (sólo
  `plot` o `micro_plot`), para que no dependa de la pantalla.

## 4. Fuera de esto

- Editar, renombrar o archivar fincas.
- Mover una parcela de una finca a otra.
- Mapas y polígonos.
- Borrar parcelas que ya tienen cosechas.
- Decidir qué hacer con el comentario de demostración de Kiva Estate en `seed.ts`.

## 5. Pruebas que tienen que existir

- El Farm Operator **no** crea parcelas. El Farm Manager de OTRA finca tampoco. El de ESTA sí
  (control positivo).
- Una cookie de finca ajena no enseña nada de esa finca.
- Crear una finca escribe la organización, el terreno y el `AuditEvent` en la misma transacción:
  si una falla, no queda ninguna.
- Un nombre de parcela repetido en la misma finca se rechaza. El mismo nombre en otra finca, no.
- Una cosecha sobre una microparcela de la finca elegida se registra. Sobre una de otra finca,
  no.
