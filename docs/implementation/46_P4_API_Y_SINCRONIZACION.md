# P4 — API y sincronización: el protocolo antes que el cliente

Fase 4 de `docs/architecture/COFFEE_FIELD_OS_AUDIT.md` §26. La última fase
antes del cliente nativo, y la que decide si ese cliente es construible.

**Contexto obligatorio antes de empezar:** el audit §17 (arquitectura móvil
offline), §18 (modelo de sincronización), §19 (autenticación y autorización
offline) y §20 (permisos y clasificación). Más ADR-107, cuyo razonamiento
—«el modelo que ibas a extender no ha llevado nunca una fila»— se aplica aquí
con matices que §0 desarrolla, porque la respuesta **no** es la misma.

**Escrito en español**, a diferencia de 41–44. Aquellos descendían
directamente del audit y se escribieron en su idioma; este ya se apoya en
ADR-094/095/098/101/103/107, que están en el idioma del repositorio, y en la
cola de apiario, cuyo código y comentarios son de aquí.

---

## 0. Lo medido, y por qué esta fase NO se aplaza aunque P2 §1 sí se aplazara

Medido el 2026-09-04 contra producción, con control positivo (17 personas,
3 proyectos, 40 assignments):

| | filas |
|---|---|
| `partner.task` | 0 |
| `traceability.field_session` | 0 |
| `traceability.field_event` | 0 |
| Modelos con `clientDraftId` | **2** (`Inspection`, `ColonyEvent`) |
| Rutas bajo `app/api/` | **3** (auth, export, webhook de Stripe) |
| Modelo `Device` | **no existe** |

**La tentación es aplicar ADR-107 otra vez y aplazar.** Sería un error, y la
diferencia importa más que el parecido:

- **P2 §1 pedía modelar un flujo de trabajo que nadie había recorrido.** Qué
  columnas necesita una tarea agrícola sólo lo dice alguien que intentó
  registrar una. Era diseño a ciegas.
- **P4 no modela un flujo: implementa un protocolo cuyo comportamiento ya
  está observado.** `lib/apiary/offlineQueue.ts` lleva funcionando con
  `clientDraftId`, con la distinción entre «la petición no llegó» (sigue en
  cola) y «el servidor corrió y se negó» (marca error y se enseña), y con la
  decisión —tomada en A5/A0— de no resolver conflictos donde la forma de
  escritura es append-only. No hay conjetura que validar: hay 260 líneas que
  generalizar.

**Aun así, el riesgo de P2 sí aplica en una cosa: el tamaño.** Construir las
ocho piezas de §18–§19 antes de que nadie sincronice nada es repetir la forma
de P2 multiplicada. Por eso este ticket **secuencia** en vez de listar: cada
pieza se ejerce desde la PWA existente antes de empezar la siguiente, que es
literalmente lo que §26 ordena («Exercise all of it from the existing PWA
first — a real client against a real sync protocol, with none of the native
uncertainty»).

**Una corrección al audit, comprobada hoy.** §18 declara «blocking
prerequisite» que `Lot.lotCode` y `Sample.sampleCode` son globalmente
`@unique`, y que dos dispositivos offline colisionarían. **Ya no es cierto:**
el esquema tiene `@@unique([organizationId, lotCode])` en `model Lot` y
`@@unique([organizationId, sampleCode])` en `model Sample`. Lo arregló P0.
(Comprobado el 2026-09-04. Se nombran los modelos y no la línea a propósito:
un número de línea de `schema.prisma` caduca en cuanto alguien añade algo
arriba, y una cita caducada es peor que ninguna.) La Fase 4
no arranca bloqueada, y quien lea el audit sin comprobarlo perderá un día
arreglando algo que está arreglado.

---

## 1. `Device` — una fila por aparato, no por persona

Campos: `id`, `organizationId`, `operatorPersonId` (nullable — un molino puede
tener un teléfono compartido, §9), `platform`, `label` legible por humanos,
`registeredAt`, `lastSeenAt`, `revokedAt` (nullable).

**`revokedAt` como anulable y no un booleano**, por la misma razón que
`booleanos-de-tres-estados.test.ts` vigila en las pantallas: «revocado» y
«cuándo se revocó» son el mismo hecho, y un booleano pierde la mitad.

Las seis tablas de captura ya llevan `captureDeviceId`/`deviceId` como UUID
suelto (P2 §5, ADR-101). **Aquí se convierten en FK reales**, que es el patrón
aditivo-por-padre que `Measurement` ya usó con `FermentationRun` y
`DryingRun`. Ninguna fila viva tiene valor, así que la FK no necesita backfill
— comprobar antes de escribir la migración, no asumirlo.

---

## 2. Tokens: registro, refresco, revocación

Hoy: Auth.js v5, `strategy: "jwt"`, `maxAge` de 7 días, cookie de navegador
(`session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 }` en
`lib/auth/config.ts`). El comentario dice que los 7 días se eligieron
pensando en operadores sin cobertura — pero Auth.js no distingue, y una cookie
de navegador no sirve a un cliente nativo que debe funcionar días sin red.

- **Login inicial en línea**, contra un endpoint de token nuevo.
- **Registro de dispositivo** en ese primer login: se crea el `Device` y se
  emite un **refresh token ligado a él**.
- **Access tokens cortos** (minutos u horas) acuñados desde el refresh
  siempre que haya conectividad.
- **Revocar el dispositivo invalida su refresh al instante**, y sus
  mutaciones en cola se rechazan al sincronizar.

**Lo que NO se toca:** la sesión de cookie del navegador sigue exactamente
como está. La PWA existente se autentica como hoy. Esto añade un carril
paralelo para dispositivos; convertir el carril viejo sería trabajo sin
beneficio y con riesgo de dejar a todo el mundo fuera.

**Construido el 2026-09-05, cuando la Fase 5 lo pidió.** ADR-108 lo aplazó
«hasta que exista un cliente nativo que lo llame»; ese día llegó, porque un
cliente nativo **no puede** usar la cookie. `POST /api/v1/auth/device` (alta con
credenciales) y `POST /api/v1/auth/token` (canje de refresh por access), más
`resolverPrincipal`, que hace que las cinco rutas de sincronización acepten
cualquiera de los dos carriles sin saber cuál fue.

El refresh se guarda **hasheado**; el access va firmado con clave derivada por
propósito y **no se guarda en ninguna parte**, que es lo que permite atender a
un aparato sin consultar la base. Revocar corta el refresco en el acto, y un
access ya emitido sigue verificando hasta que expira —inherente a un token sin
estado— pero **no escribe**: el push comprueba `revokedAt` en cada lote. Hay un
test de esa combinación exacta.

**Sin rotación de refresh**, y dicho en vez de omitido: rotar es una mitigación
real contra el robo del token, pero obliga a resolver la carrera de dos
refrescos simultáneos, que un aparato con cobertura intermitente produce.

---

## 3. `clientDraftId` generalizado

Hoy en 2 modelos. Va a **todas** las tablas de captura operativa, anulable y
`@unique`, siguiendo el precedente exacto de `Inspection.clientDraftId`.

Anulable a propósito: sólo lo llevan las escrituras encoladas offline. Una
llamada directa desde la web no tiene ninguno, y ponerle un valor generado en
el servidor haría que la columna dejara de significar «esto vino de una cola».

---

## 4. Push por lotes

Mutaciones en lote, ordenadas por secuencia del dispositivo, cada una con
`clientDraftId`, `recordedAt` (reloj del aparato), `deviceId`, `personId` del
operador y `clockOffsetMs` (P2 §5, ya en el esquema).

El servidor responde **por mutación**, nunca por lote:

    applied | duplicate | rejected(razón) | conflict

**`duplicate` es éxito**, no error: es lo que hace que un reintento tras una
respuesta perdida sea inocuo. Y la distinción entre `rejected` y una caída de
red es la que la cola de apiario ya implementa y ya se enseña al operador.

---

## 5. Pull por cursor

Cursor por tabla sobre `(marca de tiempo, id)`. El id no es adorno: es el
desempate, y sin él dos filas que comparten milisegundo hacen que la página
siguiente se salte una. Paginación por clave, nunca por desplazamiento — un
`skip/take` sobre datos que cambian mientras se pagina salta filas o las repite.

**Qué marca usa cada tabla, y esto lo corrigió la construcción (2026-09-05):**

- **Las que cambian van por `updatedAt`.** Este párrafo daba por hecho que
  `FieldSession` ya lo tenía, y **no lo tenía**: `endFieldSession` la modifica,
  así que un aparato que la descargó abierta no se habría enterado nunca de que
  cerró. La columna se añadió en `20260905040000_p4_cursor_de_pull`.
- **`Lot`, `Measurement`, `QuantityEvent`, `LotTransformation` y `FieldEvent`
  van por `createdAt` y NO se les añade `updatedAt`**: son append-only por
  diseño —comprobado para `FieldEvent`: cero sitios que lo actualicen o borren—
  y dárselo para uniformar el cursor sería mentir sobre su naturaleza para
  comodidad del cliente.

La regla, dicha de forma que se pueda aplicar a la siguiente tabla: **la marca
del cursor es la que se mueve cuando el hecho cambia.** Si nada la mueve,
`createdAt`; si algo la mueve, hace falta `updatedAt` y hay que añadirlo.

**Descarga selectiva derivada de permisos**, no del ámbito que pida el
dispositivo: lo que se manda es lo que el operador puede ver, resuelto en el
servidor (§20).

**Borrado:** aquí casi nada se borra de verdad. `RecordStatus.archived`, que
ya existe, es la lápida. Las tablas append-only no necesitan camino de borrado.

---

## 6. Política de conflictos, por categoría

Del audit §18. **No hay «último que escribe gana» por defecto** en ninguna
categoría:

| Categoría | Ejemplos | Política |
|---|---|---|
| **Append-mostly** | mediciones, observaciones, fotos, eventos de campo y de cantidad | No hay conflicto posible. Inserción idempotente por `clientDraftId`. Dos operadores midiendo el mismo tanque el mismo minuto son dos lecturas ciertas. |
| **Actualización controlada** | estado de tarea, posición de almacenamiento, estado de lote, fin de corrida | Máquina de estados en servidor con versión/etag. Una transición desde un estado previo inesperado se **rechaza devolviendo el estado actual**, no se sobrescribe. |
| **Crítica** | split, merge, blend, selección, corrección de inventario, override de estándar, cambio de clasificación | **Nunca se resuelve automáticamente.** El dispositivo manda una intención; el servidor valida balance de masa y RBAC y puede negarse. Una colisión real va a una cola de revisión. |

La fila crítica no es teórica: ADR-103 (selección) ya estableció que el
servidor es dueño del invariante y que una regla de balance de masa **no puede
comprobarse en el cliente**. Este ticket la hereda, no la inventa.

---

## 7. Cola de medios, aparte

Cola independiente, reintento independiente, ligada por `clientDraftId` para
que **una foto pueda llegar días después de lo que documenta**.

**Cómo se resolvió eso, que no es como se lee (2026-09-05).** La lectura obvia
—colgar la foto de un evento anterior— exigiría **actualizar** ese evento, y
`FieldEvent` es append-only: el pull por cursor de §5 **ya depende de ello**,
porque usa `createdAt` en vez de `updatedAt` precisamente porque nada lo
modifica. Un `UPDATE` aquí haría que ningún dispositivo se enterara nunca de
que la foto llegó — la foto estaría en la base y en ningún aparato.

Así que **una foto de campo ES un `FieldEvent`** de tipo `foto`, `video` o
`nota_de_voz` —los tres ya están en el catálogo `event_kind`— con su `assetId`.
Queda junto a lo que documenta porque comparten `FieldSession` y se ordenan por
`occurredAt`, que es para lo que P2 §4 llama a `FieldEvent` «una espina dorsal,
no un reemplazo». **Sin cambio de esquema.**

Subida en dos pasos, la forma que `lib/traceability/media.ts` ya usa: el
servidor firma una URL y **nunca sostiene los bytes**. La clave la acuña el
servidor y se **re-comprueba** al finalizar — devolverla es cosa del cliente, y
confiar en ella sería dejarle reclamar cualquier objeto del bucket.

`Asset` ya tiene `latitude`/`longitude`/`accuracyM` desde P2 §6, así que una
foto de campo llega con su posición sin depender de crear una `Location`.

**Lo que sigue sin construirse de §7: la subida reanudable.** Una subida
cortada se reintenta entera. Con fotos de finca es aceptable; con vídeo largo
sobre datos móviles no lo será, y entonces hace falta multipart.

---

## 8. Autorización offline: una foto firmada, y el servidor manda igual

El dispositivo opera contra una **instantánea de autorización** firmada y
cacheada: permisos y ámbito resueltos del operador, con caducidad propia (dos
semanas es un techo razonable).

**La instantánea decide qué OFRECER; no decide qué se guarda.** El servidor
re-comprueba cada mutación al sincronizar, así que una instantánea caducada no
puede conceder autoridad real. Lo que el dispositivo permitió y el servidor
rechaza vuelve como `rejected` y el operador lo ve.

Y por eso un dispositivo robado deja de poder **preparar** trabajo al llegar
al techo, aunque no vuelva a conectarse nunca.

**Construido el 2026-09-05.** `GET /api/v1/sync/authorization`, HMAC con clave
derivada de `AUTH_SECRET` por propósito —separación de claves, sin variable de
entorno nueva que habría que pedirle al dueño— y techo de 14 días.

**Qué añade sobre el pull de §5**, que ya devuelve las Locations: (1) *qué*
puede hacer el operador en cada sitio y no sólo dónde, para que la interfaz deje
de ofrecer botones que el servidor va a negar; y (2) **la caducidad**, que la
lista del pull no tiene y que es la propiedad de seguridad entera de §8.

**Y lo que un test demuestra explícitamente:** una instantánea forjada que se
conceda otro lote **no consigue nada** — `startFieldSession` y `recordFieldEvent`
siguen negando. Si eso fallara, §8 habría convertido una ayuda de interfaz en
una frontera, que es justo lo que no debe ser.

---

## 9. Cambio de operador: un PIN es atribución, no autenticación

Un teléfono compartido en el molino debe permitir cambiar de operador. **Un
PIN verificado offline no autentica a nadie**: no hay servidor que lo valide y
el aparato ya lleva el token. Decirlo explícitamente en el diseño, y que el
PIN **nunca** desbloquee permisos más amplios que los del conjunto de
operadores registrado en el dispositivo.

Esto es exactamente lo que §4 de `SESSION_STATE.md` ya recoge para
`operatorPersonId`: no es una frontera de seguridad, y hay un test que rompe
si alguien lo endurece por descuido.

**Estado al 2026-09-05: la mitad está hecha desde antes de este ticket.** El
cambio de atribución funciona —el formulario de evento ofrece «quién, si no
quien abrió la jornada», y `pushFieldEvents` lleva `operatorPersonId` por
mutación— y la decisión de que eso NO es autorización está registrada y
protegida por `tests/traceability/batchPageData.test.ts`, que comprueba que
`getObserverCandidates` devuelve toda Persona activa **a propósito**.

**Y la otra mitad se cerró el mismo día, cuando llegó la respuesta: los
aparatos son PERSONALES, uno por persona (ADR-109).** Eso elimina el conjunto de
operadores: `Device.operatorPersonId` basta, no hay tabla, no hay migración y no
hay PIN — con un aparato por persona no hay entre quién cambiar sin volver a
autenticarse.

Lo que sí quedó construido es el guardia, porque con aparatos personales la
tentación se invierte: leer «este aparato es de Kenneth» y usarlo para decidir
qué puede escribir. `tests/sync/deviceOperator.test.ts` fija que **no**: la
autorización es la cuenta contra la Location, y un aparato registrado a una
Persona real no abre un lote que su cuenta no tiene ni atribuyendo el evento a
su propio dueño.

La regla de §9 se queda escrita para el día que exista un teléfono compartido de
verdad: el PIN sería atribución, nunca autenticación.

---

## 10. Caducidad de borradores sin sincronizar

Se conserva el concepto de A5.5: avisar a los 7 días, purgar a los 21. Viven
en almacenamiento local en claro.

**Construido el 2026-09-05, y la regla NO se copió.** `classifyDraftAge` y sus
dos constantes se movieron de `lib/apiary/offlineQueue.ts` a
`lib/sync/draftAge.ts`; apiario la re-exporta desde ahí. Dos copias de «7 y 21»
serían dos ventanas de exposición para el mismo riesgo, separables sin que nadie
lo note — y hay un test que falla si alguien vuelve a definirla aparte, incluso
con los mismos valores.

La pantalla **dice lo purgado**: un borrado silencioso de trabajo de campo es
indistinguible de haberlo perdido.

---

## 11. La primera rebanada, y por qué ésta

**`Device` + tokens + push por lotes de UNA sola categoría append-mostly,
ejercido desde la PWA existente.**

No la cola de medios (§7 no bloquea a nadie), no el pull (§5 es más grande y
no se necesita para escribir), no la instantánea de autorización (§8 depende
de que los tokens existan).

La rebanada cierra el ciclo entero —registrar dispositivo, obtener token,
encolar, empujar en lote, recibir `applied`/`duplicate`/`rejected` por
mutación, verlo en pantalla— sobre el caso donde **no hay conflicto posible**.
Si el protocolo se sostiene ahí, lo demás es extensión; si no, se descubre con
una tabla y no con doce.

**Criterio de aceptación, y es de flujo y no de test** (precedente de ADR-095
y del §7 de P2): un `FieldEvent` creado sin red desde la PWA, con el navegador
en modo avión, aparece en la base tras recuperar cobertura, **y repetir el
push no crea una segunda fila**. Esa segunda mitad es la que prueba que
`clientDraftId` hace su trabajo.

---

## 12. Tests

- `duplicate` no crea fila y **no** se reporta como error.
- `rejected` es terminal: no se reintenta, y el operador lo ve.
- Una caída de red deja la mutación en cola; un rechazo del servidor no.
- Un lote con una mutación mala aplica las demás y responde por mutación.
- Un token revocado hace que todo el lote encolado se rechace.
- La instantánea caducada no autoriza: el servidor rechaza igual.
- Una transición de estado desde un previo inesperado devuelve el estado
  actual, no sobrescribe.
- Reproducir el mismo lote dos veces deja la base idéntica.

**Cada uno con flip-test.** El de idempotencia especialmente: quitar la
comprobación de `clientDraftId` debe hacerlo fallar. Un test de idempotencia
que pasa con y sin la comprobación no prueba nada, y es la forma exacta que
`CLAUDE.md` describe.

---

## 13. Migración

Aditiva. Nueva tabla `device`. Nuevas columnas `client_draft_id` en las tablas
de captura que aún no la tienen. Conversión de `capture_device_id`/`device_id`
a FK real hacia `device` — **comprobar primero que ninguna fila viva tiene
valor**, en vez de asumirlo porque el código nunca lo escribió.

Sin backfill. Sin borrados.

---

## Decisiones que no puede tomar este ticket

- **Cuánto dura el refresh token, y cuánto la instantánea de autorización.**
  El audit propone dos semanas de techo para la instantánea. Es una decisión
  de riesgo —un aparato perdido en una finca sin cobertura— y es de Daniel.
- **Si el teléfono del molino es compartido o personal.** §9 se diseña
  distinto según la respuesta, y la respuesta la da quien conoce el molino.
- **Qué pasa con una mutación rechazada que el operador cree correcta.**
  ¿Se pierde, queda en el aparato, o va a una cola de revisión humana? La
  categoría crítica de §6 la manda a revisión; para las demás no está decidido.

## Fuera de alcance

- El cliente nativo Android — Fase 5.
- `TaskTemplate` y extender `partner.Task` — aplazados en ADR-107.
- Los reportes derivados — Fase 6.
- Polígonos y mapas offline — Fase 7.
- Convertir la sesión de cookie de la web al carril de tokens (§2).
