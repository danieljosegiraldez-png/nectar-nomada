# Estado — Néctar Nómada OS

Dónde está el proyecto. Cómo se construye está en `CLAUDE.md`; son archivos
distintos a propósito. El registro largo de decisiones es
`docs/architecture/DECISIONS.md` (ADR-001 … ADR-103) y **no** se duplica aquí.

**Presupuesto: ≤400 líneas y <20.000 tokens.** Lo hace cumplir
`npm run check:state` y el test `tests/session-state-budget.test.ts`, no esta
frase. Pasado ese punto una lectura devuelve solo el principio **y reporta
éxito**. Lo viejo se va a `docs/SESSION_STATE_ARCHIVE.md`, lo más viejo primero.

---

## 1. Decisiones que solo Daniel puede tomar

Correr `bash scripts/open-decisions.sh` al arrancar. Las que sobrevivan van al
**primer mensaje a Daniel, antes de proponer trabajo**.

Convención: **0 = sigue abierta, 1 = cerrada, 2 = no se pudo determinar.**
«No se pudo determinar» nunca se reporta como cerrada. Las cinco pasaron un
flip-test el 2026-08-28, en ambas direcciones.

| Id | Decisión | Por qué es de Daniel | Prueba |
|----|----------|----------------------|--------|
| P-A | Alerta de backup **fuera de esta máquina** — **cerrada el 2026-09-04** | Daniel creó el check en healthchecks.io y puso su URL. Se deja la fila porque **vuelve a abrirse sola** si alguien borra la línea o caduca la cuenta: la alarma depende de un servicio externo que el repositorio no controla | Las **dos** mitades, y la fuente única es `scripts/open-decisions.sh` — no duplicar aquí: código (`ping_health` presente) **y** URL activa en `~/.config/nectar-nomada/backup.env`. Una sola mitad no es una alarma |
| P-B | A qué proyecto apunta el dominio de marca — **cerrada el 2026-08-28** | Decisión de Daniel. Se deja la fila porque vuelve a abrirse sola si el dominio volviera a este proyecto | `curl -s -L https://www.nectarnomada.com/ \| grep -q 'href="/login"'` |
| P-C | Quiénes reciben correo y, con él, acceso | Casi nadie en la base tiene correo; sin correo no hay contraseña. Hoy solo Daniel y José. Quién entra no lo decide el sistema | `! grep -qi "correos de las personas" docs/architecture/DECISIONS.md` |
| P-D | Nombres y roles de la **familia Huerbsch** — **cerrada el 2026-08-29** | La premisa era falsa: sí están en la base desde A7 — Bob (copropietario), Sherry (copropietaria) y Chris (representante familiar), con membresías reales. Faltaba el ADR, que es lo único que la prueba mira. Ver ADR-106 | `! grep -qi "huerbsch registrada" docs/architecture/DECISIONS.md` |
| P-E | Destino de backup fuera de la máquina | *Cerrada hoy* — `NN_BACKUP_DIR` está en `~/.zshrc`. Se deja en la tabla porque vuelve a abrirse sola si alguien lo quita, y porque una tabla donde todo dice «abierta» no demuestra que el mecanismo discrimine | `! grep -q "NN_BACKUP_DIR" "$HOME/.zshrc"` |

**P-C y P-D no cambian ningún artefacto por sí solas.** Su veredicto aterriza
en un ADR de `docs/architecture/DECISIONS.md` que contenga literalmente la frase
de su prueba. Sin ese sitio nombrado, ninguna búsqueda distinguiría «sin hacer»
de «hecho y sin rastro».

---

## 2. Lo que se entregó — más nuevo primero

### 2026-09-05 · La Fase 5 arranca por el ticket, y su prerrequisito ya está hecho

**El ticket `47_P5_CLIENTE_ANDROID.md`, y NADA de código nativo**, porque
medirlo primero dijo que no se puede: esta máquina no tiene Android Studio, ni
SDK, ni `adb`; quedan 6,2 GB libres (Studio con emulador son ~15) y no se conoce
ningún teléfono Android físico, que el audit exige para validar en gama baja.

**El prerrequisito sí se construyó: §2, el carril de tokens** —que pertenece al
ticket 46, no a la Fase 5—. ADR-108 lo aplazó «hasta que exista un cliente
nativo que lo llame»; medir la Fase 5 fue darse cuenta de que **ese día es
éste**, porque un cliente nativo no puede usar la cookie de la PWA.

`POST /api/v1/auth/device`, `POST /api/v1/auth/token`, y `resolverPrincipal`
para que las cinco rutas de sincronización acepten cookie o Bearer sin saber
cuál fue. Refresh **hasheado** en la base; access firmado con clave derivada y
guardado en ninguna parte. Trece tests y cuatro flip-tests: guardar el refresh
en claro, ignorar la revocación, distinguir correo desconocido de contraseña
mala (un oráculo de qué correos tienen cuenta), y firmar con `AUTH_SECRET` en
crudo.

**Dos cosas que el guardia de rutas me obligó a hacer bien.** Sustituir
`getCurrentUser` por `resolverPrincipal` rompió su contraste: le enseñé la señal
nueva y **le hice flip-test**, para comprobar que sigue cazando una ruta que de
verdad no identifica a nadie. Y `revocarAparato` no tenía llamador fuera de mis
tests: la quité en vez de declararla.

**Lo que la Fase 5 necesita de Daniel** está en §3 de su ticket: si hay
teléfono, si se instala Studio o se va por Expo Go, quién lleva el aparato —13
de 14 personas siguen sin contraseña— y si antes o después de la cosecha.

### 2026-09-05 · P4 §10 cerrada, §9 a medias y bloqueada en Daniel

**§10 — la purga de borradores rancios, sin copiar la regla.** `classifyDraftAge`
y sus dos constantes (7 y 21 días, A5.5 §4) se **movieron** de la cola de
apiario a `lib/sync/draftAge.ts`; apiario la re-exporta. Dos copias serían dos
ventanas de exposición para el mismo riesgo, separables sin que nadie lo note.
Hay un test que falla si alguien vuelve a definirla aparte **aunque sea con los
mismos valores** — el flip-test lo confirmó con una copia que compilaba.

Esto **borra trabajo de campo** que no está en ningún otro sitio, y es
deliberado: los borradores viven en IndexedDB en claro y cifrarlos dejaría la
clave en el mismo almacenamiento. La pantalla dice lo purgado, porque un borrado
silencioso es indistinguible de haber perdido los datos.

**§9 — cerrada el mismo día, y sin construir casi nada.** La mitad ya estaba:
el cambio de atribución funciona y su «esto no es autorización» ya estaba
protegido. La otra mitad dependía de una decisión, Daniel la dio —**los aparatos
son personales, uno por persona, ADR-109**— y eso **elimina** el conjunto de
operadores: sin tabla, sin migración, sin PIN.

Lo que sí se construyó es el guardia, porque con aparatos personales la
tentación se invierte: leer «este aparato es de Kenneth» y decidir con eso qué
puede escribir. Tres tests fijan que no — y el flip-test, acotado a
`recordFieldEvent`, tumba exactamente los dos de guardia dejando pasar el de
atribución.

### 2026-09-05 · P4 §8: la instantánea de autorización, que a propósito no autoriza

`GET /api/v1/sync/authorization`. HMAC con clave **derivada de `AUTH_SECRET` por
propósito** —separación de claves, sin variable nueva que pedirle a Daniel— y
techo de 14 días.

**Qué añade sobre el pull, que ya devuelve las Locations:** *qué* puede hacer el
operador en cada sitio, y sobre todo **una caducidad**. La lista del pull no
tiene ninguna, así que un aparato perdido podría seguir preparando trabajo para
siempre contra un ámbito revocado. Ésa es la propiedad entera de §8.

**El test que más importa demuestra que la instantánea NO sirve de nada como
autoridad:** una forjada que se conceda otro lote no consigue escribir —
`startFieldSession` y `recordFieldEvent` siguen negando. Si eso fallara,
habríamos convertido una ayuda de interfaz en una frontera de seguridad.

Siete tests. Tres flip-tests, cada uno con su sha antes/después y comprobando
que el archivo compila —la lección del arnés de ayer—: quitar la caducidad,
firmar con `AUTH_SECRET` en crudo, y no comprobar la firma.

**Con esto la Fase 4 queda casi cerrada.** Faltan la subida reanudable, §9
(cambio de operador) y §10 (purga de borradores rancios), más el carril de
tokens de §2, aplazado hasta que exista cliente nativo.

## 3. Bloqueado, y en qué


#### Un vocabulario de procedencia por formulario, y nadie lo declaró

Ocho formularios ofrecen ocho subconjuntos distintos de `ProvenanceClass` y
cuatro de `DataQuality`, con dos nombres para la misma constante
(`PROVENANCES` / `PROVENANCE_CLASSES`). `SoilProfileForm` y `SampleForms`
ofrecen **el mismo conjunto en distinto orden**. Los recortes parecen
deliberados —quien registra una muestra no elige «hipótesis»— pero **nada lo
dice y nada impide que deriven**: sólo `CANOPY_POSITIONS` está atado al enum por
un test, y `as never` aparece 37 veces en las acciones, así que el compilador
tampoco mira. Lo encontró la quinta revisión (2026-09-01) y se dejó abierto: es
una decisión de diseño —qué puede afirmar cada pantalla— no un arreglo mecánico.


- **Dar acceso a alguien más que Daniel y José** — bloqueado en P-C. Medido el
  2026-08-29: 13 de 14 cuentas siguen en `invited` sin clave. Bob y Sherry
  tienen 10 Assignments cada uno y Chris 2 — 22 en total que resuelven bien y
  no llegan a nadie, porque ninguna de las tres Personas tiene correo.
  ADR-083 ya arregló el callback que rechazaba `invited`: la puerta funciona,
  falta a quién darle la llave.
- ~~**Que la compuerta sea *obligatoria* para fusionar**~~ — **cerrado el
  2026-09-05, y la premisa era falsa.** Esta entrada decía durante semanas que
  la protección de ramas «no está disponible en un repositorio privado de este
  plan («Upgrade to GitHub Pro»)». **Sí estaba**: se activó por API sin cambiar
  de plan, al primer intento. Nadie lo había vuelto a probar desde que se
  escribió.

  Puesto en `main`: exige los dos checks de compuerta —el pesado y el ligero—,
  prohíbe force-push y borrar la rama. **Sin revisiones exigidas a propósito**:
  hay una sola cuenta humana y GitHub no deja aprobar el propio PR, así que
  exigirlas dejaría el repositorio sin poder fusionar nada.

  `enforce_admins` queda en **false**, también a propósito: si CI se cae por
  cuota —ya pasó el 2026-09-03— hay que poder fusionar un arreglo sin
  desactivar la protección primero.
- **Medir la cosecha de febrero, no solo registrarla** — bloqueado en el dueño,
  y **ya no en construir nada**. Los seis lotes tienen `areaHectares` nulo, así
  que no hay densidad ni rendimiento por hectárea, que es lo único comparable
  entre lotes y entre años. Desde el 2026-08-31 el dueño puede cargarlas él
  mismo en la página de cada lote; cada página dice en pantalla que faltan. **La
  cosecha llega en febrero**; después, el dato ya no sirve para esa cosecha.
- **Que el rendimiento se pueda calcular con datos reales** — bloqueado en el
  dueño, y ya no en construir nada. La cadena entera (siembra → hectáreas →
  cosecha → bloques → kg/ha) está en pantalla desde el 2026-08-31. Faltan las
  dos entradas: **0 de 8 lotes tienen área** y **0 cosechas están atribuidas a
  bloques**, aunque 15 de las 33 ya tienen peso declarado. Las dos las carga él
  ahora sin ayuda.
- **Las páginas de `app/`: primera pasada hecha, quedan las demás** — la quinta
  revisión (2026-09-05) miró la capa que las cuatro anteriores no podían ver, con
  una lente concreta: **dónde una página convierte una ausencia en un valor**.
  Dos hallazgos, los dos con la misma forma —*el servicio tuvo cuidado y la
  pantalla lo deshizo*— y los dos arreglados:

  La reconciliación de cosecha hacía `alreadyRecordedKg ?? 0` sobre un `null` que
  el servicio pone a propósito citando ADR-080. Con tres aportes **sin pesar** y
  120 kg escritos contra 500 declarados, la pantalla decía «diferencia: 380 kg»
  en negrita — que se lee como «faltan 380 kg de cereza». Y `hiddenContributions`,
  que el servicio calcula precisamente para que la reconciliación no parezca
  cuadrar con menos aportes de los que hay, **no lo pintaba ninguna página**:
  `grep` en `app/` daba cero.

  Decisión del dueño: la diferencia **se muestra, con advertencia**. Verla es el
  punto del diseño; presentarla como completa era el defecto. La regla salió a
  `lib/traceability/reconciliacionDeCosecha.ts` para poder probarla — dentro del
  componente no se puede, y ahí fue donde se coló.

  **Lo que sigue sin mirar:** las otras ~50 páginas y ~50 componentes, y con
  otras lentes. Ésta sólo buscaba ausencias convertidas en valor.
- **Del plan S1 queda UNA entidad de la Tabla 15: el registro de microclima**
  (semanas 4–10), y está bloqueado en Daniel. `CLAUDE.md` §38 pide arquitectura
  separada para la serie temporal —~35.000 filas por sensor y año— y no dice
  cuál. **Es la única decisión de §6 que sigue abierta**: la de la enmienda la
  cerró Daniel el 2026-09-01 (opción A, `TreatmentBatch` con `locationId`) y ya
  está construida en #122.
- **Nadie ha usado ninguna de las pantallas nuevas** —cinco en agosto, más las de biochar, calicata, muestras y fotos. Todo lo que se sabe
  de ellas se sabe de la copia local restaurada. Que un operador real las
  recorra es la única prueba que falta, y la que suele encontrar lo que ninguna
  verificación encuentra.
- ~~Dos carreras en jornadas de campo~~ — **cerradas el 2026-08-31**. Estaban
  agrupadas aquí con la deuda de auditoría bajo «las tres tocan diseño de
  plataforma», y eso era falso de estas dos: el arreglo era local. Cierre con
  `updateMany` condicionado a `endedAt: null`, y `occurredAt > endedAt`
  distinguido de «llegó tarde», porque `FieldEvent` lleva `recordedAt`,
  `syncedAt` y `deviceId` — está pensado para llegar tarde, así que un evento
  sincronizado tras el cierre es el camino previsto y no un borde.
- **Escritura y auditoría no son atómicas en 13 archivos.**
  Desde el 2026-08-31 `recordAuditEvent` acepta un `tx` **opcional** que confirma
  el audit junto a la escritura; por defecto usa el cliente global, así que las
  89 llamadas existentes no cambian. Lo adoptan ya `plantingCohorts.ts` (con un
  test que fuerza el fallo del audit y comprueba que la cohorte tampoco queda) y
  **todos los módulos de S1**: `biocharBatches.ts`, `soilProfiles.ts`,
  `soilSamples.ts`, `landMedia.ts`, `research/amendments.ts` y **`measurements.ts`
  entero** —la corrección desde el 2026-08-31, y la creación desde que la
  revisión señaló que esas filas abren Gate 0—. Módulo
  nuevo, `tx` desde el principio; el coste sólo existe al convertir lo viejo.
  **Quedan 13 archivos que abren transacción y auditan fuera:**
  `research/analysis.ts` (7 llamadas), `research/protocols.ts` (6),
  `traceability/harvest.ts`, `samples.ts`, `drying.ts`, `fermentation.ts`,
  `lots.ts`, `roasting.ts`, `apiary/harvest.ts`, `commerce/orders.ts`,
  `experiences/bookings.ts`, `sensory/service.ts`, `auth/config.ts`. Los otros
  28 que auditan **no** abren transacción, así que no tienen nada que hacer
  atómico.
  **Restricción al adoptarlo:** pasar `tx` obliga a que el llamador no abra otra
  transacción dentro — Prisma no las anida, y por eso `renovatePlantingCohort`
  crea su cohorte de reemplazo fuera de la suya.
  Lo que queda es decisión, no trabajo mecánico: si los 13 se convierten de una
  o al tocarlos.
- **Un reporte de visita a apiario, tal como está escrito** — pedido dos veces
  al dueño, sin llegar. De su contenido dependen tres decisiones distintas: si
  traen qué estaba floreciendo, el puente flora↔miel deja de ser teórico; si
  traen conteos por colmena, puede que la inspección se quede corta; si traen
  acciones y costos, empuja hacia el modelo de propuestas. Sin verlos, lo que se
  construya en apiario va contra una idea nuestra de un reporte, no contra el
  suyo. Medido el 2026-08-31: **una propuesta con presupuesto no cabe en ningún
  sitio** — `budget`, `presupuesto` y `proposal` dan **cero** en el esquema, y
  `Project` no tiene dinero, ni plan, ni aprobación. Eso es modelo nuevo y una
  decisión, no improvisación.
- **Lotes 5 y 6** — bloqueado en el dueño. Dijo que tienen 200 plantones cada
  uno, y eso **contradice** la nota del evento del Lote 4, que afirma que los
  otros 400 de Cafelino siguen sin sembrar. 200+200 son exactamente esos 400. No
  se registró nada hasta saber si son ese material o uno anterior y distinto; de
  la respuesta dependen la variedad, la fecha, y si hay que corregir esa nota.
- **Si los 200 Caturra del Lote 4 llevan marca de calidad** — hoy no la llevan,
  que aquí significa «no hay motivo para dudar». El dueño avisó que puede
  cambiar los conteos de cada lote, así que puede que corresponda `provisional`.
- **Un nombre propio para este OS** — al mover el dominio, esta aplicación queda
  solo en `nectar-nomada-package.vercel.app`. Si quiere algo como
  `app.nectarnomada.com`, es decisión suya. No es urgente: nada depende de ello.
- **El inventario de acceso lee texto, no programa** — no está bloqueado, está
  *aplazado*: el detector actual no tiene ningún fallo conocido sin escribir, y
  los que quedan están documentados con su mutación. La respuesta estructural
  —un AST, con TypeScript que ya es dependencia— está en
  `PENDING_IMPLEMENTATIONS/007`, con lo que arregla y lo que no.

- **Un test hermético nuevo no corre en CI** — `scripts/ci.sh` los enumera a
  mano, así que uno nuevo queda fuera en silencio y la compuerta sale verde.
  Comprobado el 2026-09-01: sólo se vio porque el recuento no subió. La
  comprobación que falta exige decidir **cómo se reconoce que un test necesita
  base de datos**, y las tres opciones no cuestan lo mismo. Ver
  `PENDING_IMPLEMENTATIONS/008`.

- **Reconciliación de medios en R2** — no está bloqueada, está *aplazada*:
  `core.asset` y el bucket estaban vacíos al 2026-08-20. Ver
  `PENDING_IMPLEMENTATIONS/002`.

---

## 4. Lo que NO se vuelve a proponer

| Propuesta | Por qué se rechazó |
|-----------|--------------------|
| Correr la suite contra la base de producción | Se hacía hasta 2026-08-21 (PR #10). `tests/setup.ts` ahora rechaza una base remota salvo `ALLOW_REMOTE_TEST_DB=1`. Usar `npm run test:db -- up` |
| Reponer una cuenta DEMO | Se eliminó el 2026-08-21 (ADR-066): tenía la única contraseña de la base |
| Conceder Platform Admin desde dentro de la aplicación | Requiere `rbac:manage_permissions`, que solo tiene Platform Admin. Sin titular, el rol no puede concederse nunca desde dentro. Por eso `auth:grant-admin` vive fuera |
| Pasar la contraseña como argumento a `auth:set-password` | Se niega a propósito: un argumento sobrevive en el historial y en la lista de procesos |
| Duplicar personas canónicas creando una cuenta nueva por «sign-up» | Ya existen con Assignments colgando (§2) |
| Construir herramienta de reconciliación de medios | Todavía no hay fotos reales. Ver `PENDING_IMPLEMENTATIONS/002` |
| Tocar `~/Developer/nectarnomada-web` desde esta ventana | Es el sitio público, otro repositorio (D-001 allí) |
| Deducir el dueño de una Location por su nombre | Exactamente lo que salió mal en el renombrado de Finca Rosina. Se mira `core.location.organization_id` |
| Subir el límite de `check:state` cuando falle | El límite es la lectura, no la preferencia. Se archiva, no se sube |
| Restringir por ámbito RBAC quién puede figurar como `operatorPersonId` | Lo propuso la segunda revisión independiente (2026-08-31) creyendo que el desplegable filtraba y era «la única barrera». No filtra: `getObserverCandidates` devuelve toda Persona activa **a propósito** — T9.5 §3(c) dice que no es una frontera de seguridad y que `operatorPersonId` no lleva peso RBAC. El operador es una Persona que normalmente **no tiene cuenta**, así que restringir por ámbito excluiría justo a quien hace el trabajo. Sí se arregló lo que era un fallo real: `recordFieldEvent` no comprobaba ni que la Persona existiera, y `startFieldSession` sí. Hay un test que **rompe** si alguien lo endurece por descuido |

---

## 5. Al cerrar la sesión

**Lo mecánico lo comprueba un script**, porque esta lista se re-tecleó a mano
seis veces el 2026-08-31 y una salió mal:

```bash
bash scripts/cierre-de-sesion.sh            # con compuerta
bash scripts/cierre-de-sesion.sh --rapido   # si ya la corriste
```

Mira y dice; no commitea, no empuja, no borra. Sale 0 cuando lo mecánico está
bien. Lo de abajo es lo que **ningún script puede hacer por ti**.

1. Actualizar este archivo. **Es el entregable, no el diff.**
2. `npm run check:state` — si se queja, mover la sección que nombra a
   `docs/SESSION_STATE_ARCHIVE.md`.
3. Escribir la lección donde **sí se cargue**: `CLAUDE.md`, memoria, o
   `PENDING_IMPLEMENTATIONS/`. Nunca solo en un log de sesión.
4. `npm run typecheck` y `npm test`, **leyendo la salida**. Sin tubería antes
   del commit: el estado de salida de una tubería es el del último comando.
5. `git add` **por archivo, nunca `git add -A`** — otras sesiones comparten este
   checkout. Luego `git commit -F <archivo>`.
6. Esperar el check de Vercel antes de fusionar. Push, y verificar desde git:
   `git rev-parse HEAD` = `git rev-parse @{u}`.
7. Parar los procesos que esta sesión arrancó, **por puerto**, nunca `pkill node`.
8. Reportar qué quedó **verificado** y qué **asumido**.
