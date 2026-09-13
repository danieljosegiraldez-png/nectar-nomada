# Inventario de acceso a datos, por operación

Lo pidió la revisión que rechazó el plan del `AuthzContext`: **sustituir la
unidad «archivo» por «operación»**. 51 archivos no son 51 decisiones de acceso.

Se genera, no se escribe a mano — un inventario escrito a mano está obsoleto al
día siguiente:

```bash
node scripts/inventario-de-acceso.mjs          # resumen
node scripts/inventario-de-acceso.mjs --json   # una fila por operación
```

## Lo medido el 2026-09-05, actualizado el 2026-09-11

**291 operaciones** que tocan la base, en **86 archivos**:

<!-- Estas cifras las comprueba tests/arquitectura/cifras-del-inventario.test.ts
     contra la salida del script. Si cambian aquí sin cambiar allí —o al revés—
     la compuerta falla y dice cuál. Todo el trabajo del 2026-08-31 empezó por
     una discrepancia de uno entre este documento y la medición. -->

| Operaciones | Patrón | Qué significa |
|---:|---|---|
| **201** | guardia directo | Llama al servicio de autorización, directamente o por un guardia local del archivo |
| **32** | acotado por construcción | La consulta filtra por el propio principal —o por un `resolve*Visibility` que sale de sus asignaciones—: **no puede** devolver lo ajeno |
| **40** | depende del llamador | No recibe principal. La autorización, si existe, está en quien la llama |
| **10** | público por diseño | `lib/discover/service.ts` y su `PUBLIC_WHERE` (ADR-024 §3) |
| **4** | previo a la sesión | El flujo de autenticación, incluido `lib/auth/config.ts` |
| **4** | recibía principal sin guardia visible | `listScopeChoices()`, `listBiocharBatches()` y, desde P4 §2, `registrarAparato()` y `refrescarAcceso()` — las cuatro miradas a mano y explicadas en el allowlist |

> Estas cifras son de la segunda medición. La primera decía 195 y 51, y estaba
> mal por un defecto del propio detector — la historia está abajo, en «El
> detector no veía siete operaciones».
>
> **Subida del 2026-09-04 (227→229, 58→60):** los dos archivos nuevos de la
> primera rebanada de P4, `lib/sync/devices.ts` y `lib/sync/pushFieldEvents.ts`.
> Uno cuenta como «guardia directo» y el otro como «acotado por construcción»:
> `pushFieldEvents` no llama al servicio de autorización por su cuenta —lo hace
> `recordFieldEvent`, en cada mutación—, y su propia consulta previa sólo mira
> `client_draft_id` y el estado del aparato. Que el detector lo clasifique así
> es correcto y vale la pena decirlo, porque «acotado por construcción» aquí no
> significa «sin autorización»: significa que la autorización está una capa más
> abajo, en la escritura, que es donde el audit §18 la quiere.
>
> **Subida del 2026-09-05 (229→230, 60→61):** `lib/sync/pullFieldWork.ts`, el
> pull por cursor de P4 §5. Cuenta como «guardia directo» y es correcto: llama
> a `can()` por Location para resolver el ámbito antes de leer nada, que es
> justo lo que esa clase describe.
>
> **Subida del 2026-09-05 (230→232, 61→62):** `lib/sync/fieldMedia.ts`, la cola
> de medios de P4 §7. Dos operaciones y un archivo: gatea por la Location de la
> jornada antes de tocar nada, así que las dos cuentan como «guardia directo».
>
> **Y (232→233, 62→63):** `lib/sync/authorizationSnapshot.ts`, la instantánea
> de P4 §8. «Guardia directo» porque resuelve con `can()` antes de incluir nada
> — pero conviene decirlo: lo que produce es una ayuda de interfaz, no una
> frontera. La frontera sigue siendo `can()` en cada mutación.
>
> **Y (233→235, 63→64):** `lib/sync/deviceTokens.ts`, el carril de tokens de
> P4 §2. Sus dos operaciones caen en «recibía principal sin guardia visible», y
> la etiqueta es literal pero engañosa aquí: **no comprueban principal porque lo
> ESTABLECEN**. `registrarAparato` valida correo y contraseña; `refrescarAcceso`
> se autentica con el refresh token y es donde muerde la revocación. Son el
> equivalente de la clase «flujo-auth» del inventario del router, que este
> detector no tiene.

### Las tres que no encajaban en ninguna regla (medición del 2026-08-31, por la mañana)

> **Hoy queda una.** `authConfig()` y `addToCart()` dejaron de ser excepciones esa misma
> tarde, al mejorar el detector — no porque cambiara su código. Se conservan aquí porque
> el razonamiento a mano sigue siendo el que sostiene la clasificación automática.

- **`lib/auth/config.ts authConfig()`** — es la configuración de Auth.js: el
  propio flujo de autenticación, previo a que exista sesión.
- **`lib/commerce/cart.ts addToCart()`** — lee una variante aplicando «la misma
  puerta pública que `lib/discover/service.ts`» y escribe **el carrito del
  propio titular**.
- **`lib/rbac/admin.ts listScopeChoices()`** — la llama
  `app/admin/users/page.tsx`, que antes hace `requirePermissionAdmin`.

**Ninguna es un agujero.**

### Las 19 que dependen del llamador: verificadas una a una, y ahora fijadas (2026-08-31)

`node scripts/inventario-de-acceso.mjs --llamadores` resuelve quién llama a cada
una y si ese llamador autoriza. Ocho salen con guardia en todos sus llamadores.
Las once restantes, miradas a mano:

| Operación | Por qué está bien |
|---|---|
| `lib/audit.ts recordAuditEvent()` | Escribe una fila de auditoría; no **lee** datos gobernados. Es infraestructura posterior a una operación ya autorizada. De sus 30+ llamadores, cuatro no gatean —los flujos de alta, sesión y comercio—, y ninguno le pasa datos ajenos |
| `markOrderPaid()` · `markBookingPaid()` | Los invoca el webhook de Stripe, **autenticado por firma** y no por sesión. Actor de sistema |
| `createCheckoutSessionForOrder()` · `createCheckoutSessionForBooking()` | Sus acciones exigen sesión y construyen el pedido o la reserva **desde `user.userAccountId`**: nunca desde un id recibido |
| `getFieldEventKinds()` | Lee `variableCatalogValue` — catálogo de referencia, no datos gobernados. Su página exige sesión |
| `hasProcessingStage()` · `getBedLevelContext()` | **Sin llamador de producción**: sólo las usan los tests. Exportadas para poder probarlas |
| `applyInputDecrements()` | La llama `settleMassBalance()` en su **propio archivo**, que sí guarda |
| `getSelectionOutturn()` · `getSelectionCatalogs()` | `app/lots/[id]/page.tsx`, que gatea antes |

**Ninguna de las 208 operaciones quedó sin explicar.**

### Lo que esta verificación NO establece

Que la autorización sea **correcta**. Un `requireLotAccess` con el permiso
equivocado sigue contando como guardia, y un llamador que gatea sobre el recurso
equivocado también. Lo que queda demostrado es más modesto y más comprobable:
**no hay operaciones cuyo camino de autorización nadie haya mirado.**

Dos cosas menores que salieron al mirar, anotadas y no arregladas:
`hasProcessingStage()` y `getBedLevelContext()` son código de producción con
llamadores sólo en tests.

### Cómo cambió el mapa al arreglar el detector

| | Sin explicar |
|---|---:|
| Primer intento | 42 |
| Tras resolver **guardias locales** | 28 |
| Tras reconocer **resolutores de visibilidad** y **dependencia del llamador** | 3 |
| Tras mirar esas tres a mano | **0** |

El salto de 42 a 28 fue un fallo mío: el detector reconocía
`require\w*(Access|Admin|Override)` **por el nombre**, y se perdía
`requireManagePermission()` —un guardia local, no exportado, que llama a
`can()`— y con él las siete operaciones de `lib/sensory/calibration.ts`.
Reconocer un nombre no es reconocer un guardia. Es la sexta vez en esta jornada
que el mismo defecto aparece en un sitio distinto.

## Lo que esto NO dice

Reconoce **formas escritas, no propiedades**:

- Un guardia con el permiso equivocado se cuenta como guardia.
- Un acotado por construcción escrito de otra manera aparece como «sin guardia».
- El troceo por función es textual. Una primera versión cortaba en el siguiente
  `export` y atribuía a `slugify()` —una función pura— las consultas del
  `uniqueSlug()` no exportado de debajo. Corregido, pero el método sigue siendo
  sintáctico.

Sirve para **decidir dónde mirar**, no para dar nada por bueno.

## El inventario ya no sólo informa

Desde el 2026-08-31, `tests/arquitectura/acceso-a-datos.test.ts` **falla** si
aparece una operación que ningún patrón explique. La excepción que queda
—`listScopeChoices()`— está inventariada en
`acceso-a-datos.allowlist.json` con su razón, y el test también falla si el
inventario nombra una que ya pasó a explicarse sola.

Antes esto era un informe: una operación nueva sin patrón aparecía en una salida
que nadie corre. Ahora la cuarta hay que justificarla o arreglarla, que es
exactamente la decisión que no conviene tomar en silencio.

Flip-testeado en las dos direcciones.

## El detector no veía siete operaciones

Encontrado el 2026-08-31, al comprobar por qué el documento decía 195 y el
script 194.

`MODELOS` enumeraba los métodos de Prisma y cerraba con `\b`:

```
findMany|findFirst|findUnique|create|...
```

**`findUniqueOrThrow` no tiene frontera de palabra tras `findUnique`.** No
coincidía, `modelos.length === 0`, y la operación **se descartaba entera** — ni
siquiera aparecía como «sin clasificar». Trece archivos usan esa variante.
`app/actions/checkout.ts` y `app/actions/bookings.ts` salían con **cero**
operaciones teniendo una consulta cada uno.

Dos huecos más del mismo tipo, cerrados a la vez:

- **SQL crudo.** `$queryRaw`/`$executeRaw` no llevan `.modelo.`, así que no
  había nada que capturar. Es justo el que más importa ver, porque se salta la
  capa de modelos entera. Hoy se registra con el modelo `SQL-crudo`. Hay uno:
  `lib/traceability/lots.ts getLotLineage()`, y tiene guardia directo.
- **El cliente entre paréntesis.** `lib/audit.ts` escribe
  `(tx ?? prisma).auditEvent.create(...)`. Un nombre suelto no lo ve, y el
  archivo entero salía con cero operaciones — mientras el documento lo citaba
  como una de las verificadas a mano. En todo el árbol hay **una** coincidencia
  de `).modelo.metodo(` y es esa, así que aceptarla no trae ruido.

Las siete operaciones recuperadas cayeron en clases ya autorizadas —cinco
`guardia directo`, dos `acotado por construcción`—: **el arreglo no destapó
ningún agujero de autorización, destapó un recuento corto.** Conviene decirlo
así y no dramatizarlo.

Es la misma lección del día por octava vez, ahora dentro del propio detector:
**se reconoce una forma escrita, no una propiedad.** Y la forma en que falla
importa — descartar en silencio es peor que clasificar mal, porque «sin
clasificar» tiene quien lo mire y lo descartado no aparece en ninguna parte.

## El cajón «depende del llamador» ya no es una foto

Hasta el 2026-08-31 estas 19 se verificaron a mano una vez y **nada detectaba
que el conjunto cambiara**. Una operación nueva sin principal caía aquí y nadie
volvía a mirarla.

Comprobado por mutación, no por argumento: añadir

```ts
export async function fugaDePrueba(lotId: string) {
  return prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
}
```

a `lib/traceability/lots.ts` —un archivo **ya inventariado**, así que el guardia
de imports calla— pasaba la compuerta en verde, con las doce pruebas pasando.

Desde hoy las 19 están fijadas en `acceso-a-datos.allowlist.json` con su razón y
su fecha de verificación, y el test falla en tres direcciones, las tres
comprobadas por mutación:

| Mutación | Veredicto |
|---|---|
| Operación nueva sin principal en archivo ya inventariado | **falla** |
| Entrada fijada que ya no depende del llamador (podredumbre) | **falla** |
| Entrada sin razón escrita | **falla** |
| Árbol limpio | pasa |

Lo que sigue **sin** demostrarse es lo de siempre, y conviene no confundirlo con
esto: que el guardia del llamador sea *el debido*. Aquí sólo se asegura que
nadie entre en el cajón sin que un humano lo mire y lo firme.


## Lo que encontró la revisión independiente (2026-08-31)

Rechazó las afirmaciones de cobertura dos veces. La primera vez acertó en dos de
tres hallazgos; ambos
comprobadas por mutación antes de creerlas, y ambas cerradas.

**1 · Una consulta delegada a un ayudante privado desaparecía entera.** Una
función exportada que delega todo su acceso en un ayudante no exportado del
mismo archivo no aparecía: ni ella ni el ayudante. `modelos.length === 0`, y la
compuerta en verde. Era el **mismo modo de fallo** que `findUniqueOrThrow`, que
se creía cerrado ese mismo día, sobreviviendo en otra forma.

Ahora el cuerpo de una operación exportada absorbe el de los ayudantes privados
que llama, transitivamente, y un ayudante con acceso al que no llega ninguna
exportada se emite como operación propia.

Un efecto secundario que merece decirse: `addToCart()` pasó de «sin patrón» a
**acotado por construcción**, porque la absorción trajo el
`where: { userAccountId }` de `getOrCreateActiveCart()`. Lo que antes era una
razón escrita a mano ahora lo demuestra la estructura. De tres excepciones
anotadas quedó **una**.

**2 · Los guardias se reconocían por nombre suelto, sin identidad de archivo.**
`guardanDirecto` era un `Set` global: una función homónima de un guardia de
cualquier otro archivo promovía la operación a «guardia directo» — justo la
transición que el detector de podredumbre da por buena.

Ahora un guardia cuenta si el archivo **lo declara o lo importa**. Limitarse al
propio archivo era demasiado estricto y degradaba `getLotReport()`, que delega
en `getLotDetail()` importado de `./lots`; la conciencia de `import` es lo que
pedía la propia revisión.

**3 · Rechazado: una validación de Persona supuestamente retirada.** No existió.
El paquete de revisión se armó con `git diff origin/main..HEAD`, que compara los
dos extremos, y presentó como bajas de este cambio 85 líneas que **otra sesión
había añadido** en `main` (PR #98). El revisor gastó un hallazgo entero en una
regresión fantasma, y su recomendación —«restaurar la comprobación»— habría
borrado un arreglo real de otro. Corregido en `tools/pack-for-review.sh`.

### Lo que sigue abierto, y se comprueba que sigue abierto

Un nombre con forma de guardia basta. Comprobado por mutación:

```ts
function requireFakeAccess(_x: string) { return true; }
export async function fugaPorConvencion(x: string) {
  requireFakeAccess(x);
  return prisma.lot.findUniqueOrThrow({ where: { id: x } });
}
```

sale como **guardia directo** y la compuerta pasa en verde. `GUARDIAS` reconoce
`require\w*(Access|Admin|Override)` como convención deliberada, y cerrarlo exige
resolver el símbolo hasta el servicio de autorización de verdad. No se hace
aquí. Se deja escrito, con la mutación que lo demuestra, para que nadie lea
«208 operaciones inventariadas» como «208 operaciones autorizadas».
