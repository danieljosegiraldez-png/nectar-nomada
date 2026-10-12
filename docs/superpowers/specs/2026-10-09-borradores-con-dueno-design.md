# Cada borrador offline tiene dueño, y nunca se envía a nombre de otra cuenta

**Estado: diseño aprobado por Daniel el 2026-10-09, sección por sección. Sin construir.**
La decisión se registrará como **ADR-199** en `docs/architecture/DECISIONS.md`. Es el
primero libre en `main` al escribir esto: 198 está en `main` y 197 lo reclama #675. Hay que
volver a comprobarlo al fusionar, porque otra sesión puede tomarlo antes.

## El defecto

Las tres colas offline de IndexedDB guardan borradores **sin dueño**, y el envío autentica
con la sesión del momento. En un teléfono donde la cuenta A deja borradores sin enviar y
después entra B, esos borradores se sincronizan **a nombre de B**. Eso deja una atribución
falsa en `core.audit_event` y en los registros de campo, que es lo que prohíben §3
(procedencia) y §35 (auditoría) de `CLAUDE.md`.

## Lo medido el 2026-10-09, contra `origin/main` en `141afb63`

- **El envío usa la sesión actual.** `app/api/v1/sync/field-events/route.ts:38` llama a
  `resolverPrincipal(request)` y en la `:60` a `pushFieldEvents(user.userAccountId, …)`.
  Ningún borrador guarda una cuenta: no la llevan `DraftRecord` (apiario), `FieldEventDraft`
  (campo) ni `FotoDeRondaPendiente` (fotos). Las fotos se finalizan con
  `getCurrentUser()` dentro de las acciones de servidor.
- **Comprobación de que la búsqueda encuentra una cuenta cuando existe: está en el aparato
  y nadie la compara.** `Device.createdBy` lo escribe `registerDevice`
  (`lib/sync/devices.ts`) y también `registrarAparato` (`lib/sync/deviceTokens.ts`). El token
  Bearer lleva `{ deviceId, userAccountId }`. Pero `pushFieldEvents`
  (`lib/sync/pushFieldEvents.ts:911`) sólo lee `revokedAt`. `authorizationSnapshot.ts` lleva
  `userAccountId`, pero sólo decide qué ofrecer y el envío no la consulta.
- **Cerrar sesión no toca IndexedDB.** `logoutAction` (`app/actions/auth.ts:166`) es
  `signOut` y nada más.
- **El daño es mayor que una fila mal atribuida:**
  - la cola de apiario se envía sola cuando vuelve la señal y cada vez que se encola un
    borrador (`OfflineSyncIndicator.tsx:92` y `:97`). Así que cuando B guarda su propia
    inspección, salen también las de A;
  - una revisión de trampa guarda `observerPersonId` = la Persona de quien envía, con
    `direct_observation` (`pushFieldEvents.ts:879`). El que queda mal es el **observador**,
    no sólo el actor;
  - si B no tiene acceso a las ubicaciones de A, los borradores de A vuelven «rechazados»,
    y el botón de descartar rechazados (`OfflineSyncIndicator.tsx:135`) borra **todos** los
    borradores en error, también los de A.
- **ADR-109 (2026-09-05): los aparatos son personales**, y esto lo reabre «un teléfono
  compartido de verdad». El caso realista incluso dentro de ADR-109 es una cuenta de
  administrador que entra en el teléfono de un trabajador para ayudarle. Esa cuenta tiene
  acceso a todo, así que nada se rechaza y todo entra a su nombre.
- **El service worker sirve páginas guardadas en caché.** `public/sw.js:101` usa «red
  primero, caché si no hay señal», con una entrada por URL. Una cuenta escrita en el HTML
  de una página puede ser la de otra persona si la página sale de esa caché.

## Las decisiones de Daniel, 2026-10-09

1. **Los borradores de otra cuenta se retienen hasta que vuelva su dueño.** No se envían,
   no se descartan y no se exportan. La purga de 21 días, con aviso a los 7, sigue valiendo
   igual para todos.
2. **Un borrador sin cuenta (guardado antes de este cambio, o después de cerrar sesión) es
   de quien registró el teléfono** (`Device.createdBy`).
3. **Enfoque A:** el navegador y el servidor. La cuenta se toma de **la página más reciente**
   que generó el servidor, no de la página que se tenga delante.

Descartado, con su razón:
- **Borrar al cerrar sesión:** destruye trabajo de campo sin enviar, y eso lo decide Daniel.
- **Que B descarte los borradores de A:** B destruiría trabajo que A no ha visto.
- **Exportarlos:** quien descarga es B, que no es su dueño.
- **Sólo en el navegador:** una pestaña vieja o un JavaScript en caché seguirían enviando
  borradores ajenos.
- **Un aparato por cuenta:** las tres colas son una sola base de IndexedDB por navegador.

## Diseño

### 1. Qué guarda cada borrador

Los tres tipos de registro ganan `cuenta: string | null`, el `userAccountId` de quien lo
anotó. **No se sube la versión de ninguna base de IndexedDB**: los almacenes no tienen
esquema, y un registro sin el campo es simplemente uno de antes.

### 2. De dónde sale la cuenta sin señal

Hay un módulo nuevo, `lib/sync/cuentaDelNavegador.ts`, y un componente cliente pequeño en
`app/layout.tsx`, que ya llama a `getCurrentUser()` en la línea 44.

- Cada vez que el servidor genera una página, el componente recibe
  `{ cuenta, generadaEn }`, con la hora del servidor, y lo escribe en `localStorage`
  **sólo si `generadaEn` es posterior a lo que ya hay**. Lo decide una función pura,
  `cuentaVigente(guardada, nueva)`.
- **Por qué la más reciente y no la de la página:** una página que A dejó en la caché del
  service worker se generó **antes** de que B entrara, porque B tuvo que entrar con señal.
  Así que nunca gana a la de B. Esto no depende del PR de la otra sesión que borra la caché
  al cerrar sesión, y cubre además el caso de que B entre sin que A haya cerrado la suya.
- Después de cerrar sesión, el layout escribe `cuenta: null`. Un borrador anotado así sigue
  la regla 2.
- Las tres funciones que encolan (`queueDraft`, `queueFieldEvent` y `queueTrapPhoto`) leen
  la cuenta por su cuenta. **Los nueve formularios que llaman no cambian.**
- **Hay que comprobarlo en el navegador, no darlo por hecho:** que después de entrar por
  acción de servidor, sin recargar la página, el layout se vuelva a generar y `localStorage`
  pase a B. Si no ocurre, el componente se mueve a las páginas de operador.

### 3. Qué envía cada cola

Cada cola envía sus borradores con `cuenta === cuentaVigente()` y los que tienen
`cuenta == null`, que decide el servidor. **Los de otra cuenta no salen del teléfono.** El
filtro es una función pura compartida, porque son tres colas y una sola regla.

### 4. Qué decide el servidor

- Cada mutación del lote lleva `cuentaDelBorrador`, opcional, que se valida en
  `parsearMutaciones`: cadena, `null` o ausente. Cualquier otro tipo se rechaza.
- `pushFieldEvents` lee además `Device.createdBy`, en la misma consulta en la que ya lee
  `revokedAt`.
- Una función pura, `duenoDelBorrador({ cuentaDelBorrador, creadorDelAparato, quienEnvia })`,
  devuelve `"propio"` o `"ajeno"`:
  - si trae cuenta, es `"propio"` sólo si coincide con quien envía;
  - si no trae cuenta, es `"propio"` sólo si `Device.createdBy` coincide con quien envía. Un
    aparato con `createdBy` nulo da `"ajeno"`.
- Si es `"ajeno"`, el resultado es `{ status: "rejected", reason: "borrador_de_otra_cuenta" }`
  y **no se escribe nada**: ni la fila ni su `AuditEvent`.
- **Por qué «rechazado» y no un estado nuevo:** el JavaScript viejo que sigue en caché
  trata cualquier estado que no conoce como éxito y **descarta el borrador**. La cola de
  campo, en `syncFieldEvents`, hace `rejected → error`, y cualquier otro estado descarta.
  Con «rechazado», un cliente viejo lo marca como error, así que se ve y no se pierde. El
  cliente nuevo reconoce el motivo y deja el borrador **pendiente**, sin tocarlo.
- **Fotos:** `requestTrampaPhotoUploadAction` y `finalizeTrampaPhotoPorBorradorAction`
  reciben `cuentaDelBorrador`, y el `deviceId` para los borradores sin cuenta. Aplican la
  misma función. Si es `"ajeno"`, no firman la subida ni crean ningún `Asset`, y la foto
  vuelve a la cola. Los identificadores de acción cambian en cada build, así que el
  JavaScript viejo no llega a llamar a la acción nueva: falla, el `catch` lo atrapa y la
  foto se queda en cola.

### 5. Pantallas

- `OfflineSyncIndicator` (apiario), `FieldSyncControls` (campo) y `SincronizarFotosDeRonda`
  (fotos) cuentan **sólo lo de la cuenta actual**.
- Las tres añaden una línea cuando hace falta: «N anotaciones de otra cuenta esperan en
  este teléfono hasta que esa persona vuelva a entrar». No muestran qué dicen esas
  anotaciones, ni de quién son, ni ofrecen botones sobre ellas.
- **El descarte de rechazados de `OfflineSyncIndicator.tsx:135` pasa a borrar sólo los
  borradores propios.**
- Los textos van a `messages/es.json` y a `messages/en.json`.
- **No cambian:** la purga ni su aviso; y `public/offline.html`, que cuenta «borradores
  pendientes en este dispositivo», y eso sigue siendo cierto con borradores de dos cuentas.

## Lo que esto no cubre

- **Quien manipule su propio navegador puede reetiquetar como suyo un borrador ajeno y
  enviarlo.** No suplanta a nadie con eso, porque escribe con su propia sesión y queda
  registrado como suyo. Pero sí se apropia de trabajo ajeno. Este diseño protege contra el
  error, no contra el abuso de quien tiene el teléfono en la mano.
- **Los borradores retenidos de A se purgan a los 21 días si A no vuelve**, y el aviso de
  los 7 días lo ve B, no A. Es la regla de A5.5 y se mantiene a propósito.
- Fuera de alcance, y ya abierto como tarea aparte: la ruta de envío confía en el
  `deviceId` del cuerpo y no en el del token Bearer.

## Pruebas

Este repositorio no tiene `fake-indexeddb` ni entorno DOM. Por eso las decisiones se sacan
a funciones puras exportadas, como ya se hizo con `clasificarRespuesta`, `classifyDraftAge`
y `mutacionDe`.

**Funciones puras** (`tests/sync/`):
- `cuentaVigente`: gana la página más reciente; una página más vieja no pisa a la guardada;
  un `null` más reciente sí la pisa.
- el filtro de qué se envía, en las tres colas: propios y sin cuenta, sí; de otra cuenta,
  no;
- que el rechazo `borrador_de_otra_cuenta` deja el borrador pendiente en las tres colas, y
  que otros rechazos siguen marcando error, como control;
- el parseo de `cuentaDelBorrador`: cadena, `null` o ausente se aceptan; un número se
  rechaza;
- `duenoDelBorrador`, en sus cinco ramas.

**Contra base** (grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`), cada prueba
contando las filas de su propio `RUN_ID` antes y después:
- con cuenta propia: se aplica;
- con cuenta de otra persona: se rechaza, con **cero** filas nuevas en la tabla afectada y
  en `core.audit_event`;
- sin cuenta, en un aparato registrado por quien envía: se aplica;
- sin cuenta, en un aparato registrado por otra cuenta: se rechaza, con cero filas;
- una revisión de trampa de otra cuenta: rechazada, y ninguna `specimen_observation` con
  B como observador;
- una foto de otra cuenta: no se firma la subida ni aparece ningún `Asset`.

**Flip-tests, todos después de commitear**, imprimiendo el sha del archivo antes y después,
si compila y qué prueba cae por su nombre. La mutación quita **la conducta**, no el token
con el que casa el detector:
1. en el servidor, `duenoDelBorrador` deja de comparar y siempre dice `"propio"`: deben
   caer los dos casos «ajeno» contra base;
2. en el cliente, el filtro deja pasar todo: debe caer su prueba;
3. en el cliente, el rechazo `borrador_de_otra_cuenta` marca error: debe caer su prueba.

**Compuertas:** `npm run verify`, `npm run build`, `bash scripts/ci.sh` (comprobando que las
pruebas nuevas con base **no** salen ahí), y el grupo con base **entero**
(`bash scripts/ci-con-base.sh`) sobre una base nueva.

## Verificación en el navegador

- Build de producción (`npm run build` y luego `npm start`, con `TZ=UTC`) contra una base
  desechable `nectar_ci_cuentas`, creada con
  `TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'`, con
  `migrate deploy` y la semilla. **Nunca contra la compartida `nectar_test`.**
- Dos cuentas de prueba con acceso a un sitio de prueba. Sus contraseñas se generan y
  quedan en un archivo del scratchpad, nunca en el chat.
- **Recorridos:**
  1. A carga un apiario. Se para el servidor, para simular que no hay señal, y A anota: se
     encola. Se arranca el servidor, A cierra sesión, entra B y anota lo suyo. En la base
     aparece sólo lo de B, con B como actor del `AuditEvent`, y la pantalla dice «1 anotación
     de otra cuenta». B cierra sesión y entra A: sale lo de A, con A como actor.
  2. Un borrador sin `cuenta`, metido a mano en IndexedDB en un teléfono registrado por A:
     con B no sale, con A sí.
  3. A visita una página, que queda en caché. Cierra sesión, entra B, se para el servidor y B
     abre esa página: lo que encola lleva `cuenta = B`. Se comprueba leyendo IndexedDB.
  4. Después de entrar sin recargar la página, `localStorage` ya dice B.

## Archivos que se tocan

- **Nuevo:** `lib/sync/cuentaDelNavegador.ts`, más un componente cliente para el layout.
- **Colas:** `lib/apiary/offlineQueue.ts`, `lib/sync/offlineQueue.ts` y
  `lib/sync/trapPhotoQueue.ts`.
- **Servidor:** `lib/sync/parsearMutaciones.ts`, `lib/sync/pushFieldEvents.ts`, las dos
  acciones de fotos en `app/actions/traceability.ts` y su servicio en
  `lib/traceability/landMedia.ts`.
- **Pantallas:** `app/layout.tsx`, `OfflineSyncIndicator.tsx`, `FieldSyncControls.tsx`,
  `SincronizarFotosDeRonda.tsx`, y `messages/es.json` y `en.json`.
- **Pruebas:** nuevas en `tests/sync/`, y su alta en `scripts/pruebas-por-compuerta.txt`
  para las que usan base.
- **Decisión:** ADR-199 en `docs/architecture/DECISIONS.md`.

## Nota de aprobación, 2026-10-11

Daniel aprobó esta especificación el 2026-10-11 con una nota: **un solo componente en
`app/layout.tsx`, compartido con el PR #703** (`sw-cierre-de-sesion`). El plan
(`docs/superpowers/plans/2026-10-11-borradores-con-dueno.md`) la aplica así, y esto corrige tres
puntos de las secciones de arriba:

1. **El componente es `ServiceWorkerRegistration`, el de #703.** Recibe la cuenta y la hora de la
   página, apunta la cuenta de los borradores y alinea las páginas guardadas. No hay un segundo
   componente. El módulo nuevo vive al lado del de #703, en `lib/offline/cuentaDelNavegador.ts`, y
   no en `lib/sync/`.
2. **La cuenta es la HUELLA, no el `userAccountId`.** #703 ya calcula en el layout los 16 primeros
   hexadecimales del SHA-256 del id y los guarda en el navegador. Los borradores guardan ese mismo
   valor y el servidor compara huellas, así que el id completo no llega nunca al `localStorage` ni a
   IndexedDB de un teléfono que puede ser compartido. La función deja de estar escrita dentro del
   layout y pasa a `lib/auth/huellaDeCuenta.ts`, porque ahora la usan tres sitios.
3. **Dos claves, una por pregunta.** `nn-pages-cuenta` (#703) dice para quién son las páginas
   guardadas, y sólo se apunta después de borrarlas. `nn-cuenta-del-navegador` (ésta) dice quién
   entró por última vez según el servidor, con la hora, para que una página vieja no gane. Si borrar
   la caché falla, la primera queda vacía y la segunda sigue sabiendo de quién son los borradores.

Y dos detalles que el plan añade porque el diseño los dejaba abiertos:

- **Un borrador sin cuenta queda apuntado tras su primera respuesta.** Si el servidor lo retiene,
  pasa a la cuenta que nombra el servidor: la retención trae la huella de quien registró el aparato.
  Si lo procesa, pasa a quien envía. La regla del aparato se resuelve una vez, no en cada envío.
- **Las fotos sólo comprueban el dueño cuando vienen de la cola.** El servicio recibe un campo
  `borrador` sólo en ese caso; una llamada desde el servidor con la sesión actual no lo trae.
