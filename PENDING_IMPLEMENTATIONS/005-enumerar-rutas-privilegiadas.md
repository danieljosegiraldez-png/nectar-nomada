# 005 · Probar la frontera de RBAC

**Estado: la propiedad que faltaba YA TIENE MECANISMO, y el primer dominio está
declarado** — #639, 2026-10-04, decisión de Daniel. Sigue abierta en dos cosas
concretas, las dos nombradas al final: **los otros dominios** (hoy sólo el del
lote) y **tus catorce veredictos**, de los que dos son defectos propuestos.

Lo que había antes demostraba tres propiedades. La cuarta —que el guardia sea *el
debido*— está en la sección «El guardia debido, 2026-10-04».

## Lo que sí queda demostrado

**1 · Higiene del router** (2026-08-28). Las 50 entradas se declaran en
`scripts/rutas-declaradas.mjs`; `npm run check:rutas` falla ante una sin
declarar, una declarada que ya no existe, o código que contradice lo declarado.
`respuesta-anonima.mjs` contrasta 26 rutas estáticas contra el despliegue.

**2 · Un acceso crudo nuevo no aparece en silencio** (2026-08-31).
`tests/arquitectura/acceso-a-datos.test.ts` inventaría quién construye o importa
un cliente de base de datos, contra
`docs/arquitectura/acceso-a-datos.allowlist.json`, y falla ante cualquier
entrada nueva. ESLint prohíbe además importar un cliente desde `app/**`, con
cinco excepciones inventariadas y con razón escrita.

Flip-testeado en las cuatro direcciones: un tercer cliente, un import nuevo del
cliente total, un import del cliente restringido desde otro archivo, y un import
desde `app/**`. Los cuatro ponen algo en rojo.

**3 · Una operación nueva que ningún patrón explique tampoco pasa callada**
(2026-08-31). `scripts/inventario-de-acceso.mjs` clasifica **por operación**, no
por archivo: principal, guardia que domina la consulta, y acceso transitivo.
El mismo test lo corre con `--json` y falla si aparece una operación que ningún
patrón explica y que no esté justificada en el inventario. Dos comprobaciones lo
acompañan: que el inventario de excepciones **no nombre** operaciones que ya se
explican (detector de podredumbre), y que cada excepción **diga por qué**.

Medido el 2026-08-31, tras arreglar el detector y atender la revisión
independiente: **208 operaciones** sobre 53 archivos. Tres no las explica ningún patrón, y las tres están inventariadas con
su razón:

| Operación | Razón inventariada |
|---|---|
| `lib/auth/config.ts:authConfig` | Es la configuración de Auth.js: el propio flujo de autenticación, previo a que exista sesión. Exigirle un guardia sería imposible de satisfacer |
| `lib/commerce/cart.ts:addToCart` | Lee la variante aplicando la misma puerta pública que `lib/discover/service.ts`, y escribe el carrito del propio titular, identificado por el `userAccountId` que recibe |
| `lib/rbac/admin.ts:listScopeChoices` | No recibe principal. La llama `app/admin/users/page.tsx`, que antes hace `requirePermissionAdmin` |

El inventario emite **seis clases**, no una, porque hay seis formas distintas de
autorizar en este código:

| Clase | Operaciones |
|---|---|
| guardia directo | 151 |
| acotado por construcción | 23 |
| depende del llamador — **fijadas**, ver abajo | 19 |
| público por diseño (`PUBLIC_WHERE`, ADR-024 §3) | 10 |
| previo a la sesión | 4 |
| recibe principal, sin guardia visible | 1 |

Hay un séptimo patrón que **el inventario no puede emitir porque no está en el
código**: la frontera del camino de IA es una concesión de base de datos —el rol
`ai_service` de `aiPrisma`— y ninguna lectura del árbol de fuentes la vería.

**4 · El cajón «depende del llamador» ya no es una foto** (2026-08-31). Las 19
operaciones que no reciben principal están fijadas en el allowlist con razón y
fecha; el test falla si aparece una nueva, si una fijada deja de aplicar, o si
alguna se queda sin razón. Las tres direcciones comprobadas por mutación.

Antes de esto, añadir una consulta sin guardia a un archivo **ya inventariado**
pasaba la compuerta en verde — comprobado, no supuesto.

Y el detector que sostiene todo esto tenía un defecto que se descartaba
operaciones **en silencio**: `findUniqueOrThrow` no casaba con la enumeración de
métodos, y trece archivos la usan. Siete operaciones no existían para el
inventario. Al recuperarlas cayeron todas en clases ya autorizadas: era un
recuento corto, no un agujero. La historia entera está en
`docs/arquitectura/inventario-de-acceso.md`.

## Lo que NO demuestra, y hay que decirlo

- **Que la autorización sea correcta.** Un `requireLotAccess` con el permiso
  equivocado pasa igual. Esto inventaría *que hay* un guardia y cuál domina la
  consulta, no *que sea el guardia debido*. Es el hueco grande que queda.
- **Detección por tipo y por forma, no por comportamiento.** Un archivo que
  reciba el cliente con otro tipo —`typeof prisma`, un alias— no lo vería. Es el
  límite de siempre, y el que más veces ha mordido: se reconoce una forma
  escrita, no una propiedad.
- **Qué hace un receptor con la transacción que recibe.** Desde 2026-08-31 se
  inventaría **quién** puede recibir un `Prisma.TransactionClient` —hoy dos,
  `lib/traceability/balance.ts` y `lib/audit.ts`—, que pueden consultar
  cualquier cosa con el `tx` que les pasan sin importar ningún cliente. Sus
  operaciones sí entran en el inventario; lo que no se comprueba es que el
  llamador que abrió la transacción hubiera autorizado *ese* alcance.
- **La excepción que queda está justificada, no arreglada.** Justificar no es
  cerrar: son decisiones tomadas en voz alta, que es lo único que se pedía.

## El intento que se rechazó, para que nadie lo repita

Se planificó un `AuthzContext` universal: un tipo que sólo devolviera el
servicio de autorización, exigido por un envoltorio del cliente, con un
centinela `AUTHZ_DEFERRED` para la deuda — copiando ADR-062. **La revisión
independiente lo rechazó en compuerta 2**, antes de escribir código: «el coste
no vale la garantía obtenida».

Tenía razón, y su hallazgo principal fue un fallo de medición mío:

- **Se me escapó un segundo cliente entero.** `lib/ai/db.ts` exporta `aiPrisma`,
  y mi grep buscaba `prisma\.` en minúscula, que no aparece en `aiPrisma.`.
- **La unidad correcta es la operación, no el archivo.** El inventario por
  operación (punto 3) nace de esa corrección.
- Al comprobarlo apareció un patrón que ninguno de los dos tenía: **la frontera
  del camino de IA está en la base de datos**, no en el código — rol
  `ai_service`, `INSERT`+`SELECT` sobre `ai.recommendation` y nada más
  (AI_GOVERNANCE.md §3, ADR-033). Un `AuthzContext` habría envuelto en ceremonia
  el único camino ya protegido mejor que cualquier tipo.

## Lo que haría falta para cerrarlo del todo

Queda **una** propiedad, y es la cara: que el guardia que domina cada operación
sea *el debido*. Eso no lo da ningún inventario, porque no es una forma que se
pueda reconocer — hay que decir, por dominio, qué permiso corresponde a qué
dato, y comprobarlo.

El camino que el terreno sugiere es **capacidades estrechas por dominio**, o
repositorios que lleven el scope dentro de sus métodos, de modo que la pregunta
«¿el permiso correcto?» se conteste en un sitio por dominio y no en 194.
**Un token universal para todo Prisma no basta**, y eso ya está comprobado sobre
el terreno en vez de supuesto.

No hace falta hacerlo entero de una vez: por dominio, empezando por el de más
consecuencia, es una progresión legítima.

---

## El guardia debido — 2026-10-04, el primer dominio

Esta ficha decía que la propiedad que le quedaba *«no lo da ningún inventario,
porque no es una forma que se pueda reconocer — hay que decir, por dominio, qué
permiso corresponde a qué dato, y comprobarlo»*. Eso es exactamente lo que se
hizo: **decirlo** en `docs/arquitectura/permiso-por-dominio.json` y
**comprobarlo** en `tests/arquitectura/el-guardia-es-un-simbolo.test.ts`.

**Y respeta el rechazo de esta misma ficha.** El `AuthzContext` universal cayó en
compuerta 2 por coste; esto es la otra vía que ella sugiere — por dominio,
empezando por el de más consecuencia, y **sin tocar una línea de ningún
servicio**, así que no puede romper nada en producción.

### Por qué ahora se puede medir, y antes no

El permiso que exige una operación se resuelve **por símbolo**, no por el nombre
del guardia: el tercer argumento de
`can(userAccountId, action, resourceType, …)`, propagado desde el envoltorio que
lo pasa. Eso lo trajo el **escalón 2 de la ficha 007**, hecho el mismo día.
Medido: de las **109** llamadas al `can` real, **103 pasan el `resourceType`
literal** (94 %), y sólo 6 de 83 unidades pasan más de uno.

### Lo medido, dominio del lote

```
15 modelos gobernados · 118 operaciones los tocan · 89 con clase de guardia
   72 exigen «lot»
   17 usan otro permiso  →  las 17 declaradas, una a una, con razón y veredicto
```

| veredicto | cuántas |
|---|---|
| ~~PROPUESTO DEFECTO~~ → **arreglados el 2026-10-04** | **2** |
| propuesto legítimo | 14 (uno con una nota) |
| legítimo por construcción | 1 |
| **confirmadas por Daniel** | **0 — a propósito: son juicios suyos** |

**Los dos defectos propuestos son la misma forma**, y por eso van juntos:
`completeExternalCoffeeOrigin` (`samples.ts`) y `recordWashMedium`
(`treatments.ts`) autorizan sobre el ámbito de **otra** cosa —la muestra, el lote
de tratamiento— y después leen un lote cuyo id **lo da quien llama**, sólo para
comprobar que existe. **No filtran datos** (el valor se descarta) pero
**escriben el enlace**: con permiso sobre tu muestra puedes atarla a cualquier
lote de la base, incluido uno que no puedes ver, y la trazabilidad de ese lote
queda con algo colgado que su dueño no autorizó.

Las legítimas son tres patrones, y conviene nombrarlos porque se repiten: leer el
lote para **sacar su ámbito** y autorizar sobre ese ámbito (cinco); el lote lo
**crea** el otro dominio (`recordApiaryHarvest` hace `tx.lot.create` bajo la
colmena que ya autorizó); y el modelo es **compartido de verdad** (el origen de
una cosecha es dato del lote *y* de la parcela).

### La compuerta cazó dos errores de su propia declaración en la primera corrida

Es el mejor estreno que puede tener un guardia, y las dos van escritas **dentro**
de la declaración porque la forma reincide:

1. Declaré `lotClassification`, `lotStorageMove` y `greenSample` como modelos
   gobernados. **No existen**: me los inventé leyendo la prosa de esta ficha. La
   compuerta exige ahora que cada modelo declarado exista en `prisma/schema.prisma`.
2. Saqué la lista con un `grep '^model (Lot|Harvest|…)'` y **el prefijo barrió de
   más**: `harvestContainer` cuelga de `ApiaryHarvestEvent` —son los baldes y
   tambores de una cosecha de **miel**— y sólo `lib/apiary/*` lo toca. Lo que
   decide no es el nombre del modelo: es su relación.

### Los cuatro flip-tests

Cada aserción tiene el suyo, y cada uno tumba **exactamente la suya** por su
nombre: quitar una excepción declarada, añadir una **fantasma**, declarar un
modelo **inventado**, y —el que de verdad importa— **código nuevo** que toca el
lote autorizando con `sensory`. El cuarto se rehízo porque la primera versión
**no compilaba**, y una mutación que no compila prueba menos de lo que parece: la
buena compila (`tsc` 0), el inventario la clasifica «guardia directo» con
`modelos=["lot"]`, y la compuerta la caza.

### Los dos defectos, arreglados el 2026-10-04

Daniel los confirmó y se arreglaron **con prueba en rojo primero**, cada una con su
control —un rechazo puede venir de que el actor no pueda citar **ningún** lote, así
que cada prueba comprueba también que la cita legítima **sí** funciona—:

| operación | el arreglo | su guardia |
|---|---|---|
| `completeExternalCoffeeOrigin` | `requireLotAccess(userAccountId, "view", [lot])` sobre el lote que cita | `tests/traceability/loteCitadoExigeSuPermiso.test.ts` |
| `recordWashMedium` | el lote citado tiene que estar en el **mismo proyecto** que el lote de tratamiento | `tests/research/ro1.test.ts` |

**Por qué dos arreglos distintos, y no es inconsistencia.** El actor del primero es
un `Farm Operator`, que **tiene** `lot:view`, así que exigirlo es gratis y es el
cierre completo. El del segundo es un `Research Lead`, y medido el 2026-10-04 ese
perfil **no tiene ningún permiso de `lot`** —sólo `research:*` y
`classification:*`—: exigir `lot:view` ahí rompería `mosto_de_otro_lote`, que es
una función deliberada, y obligaría a conceder un permiso nuevo a los perfiles de
investigación. **Eso es una decisión de Daniel, no un arreglo.** La regla del
proyecto cierra «cualquier lote de la base» sin tocar el modelo de permisos,
porque la autorización de research ya es por proyecto. Si prefiere la vía fuerte,
el cambio está escrito en la declaración: conceder `["lot", "view"]` a
`Research Lead` y `Research Contributor`, más una siembra.

**Y una trampa de carril que casi deja los dos guardias sin ejercer.** La primera
versión de la prueba del primero fue a `s1.test.ts`, donde viven las demás pruebas
de esa operación — y **ese archivo está en el grupo `datos-reales`, que CI no
corre**: necesita el backup restaurado. Una prueba escrita ahí no se ejecuta nunca.
Las dos viven ahora en el grupo `base-sembrada`, y se verificó corriendo el carril
entero: 207 archivos, 2576 pruebas, salida 0.

### Lo que sigue abierto

- **Tus doce veredictos restantes.** Los dos defectos ya están arreglados. La
  compuerta pasa hoy porque las 17 están declaradas; `confirmado_por_daniel` está
  en `false` en todas, así que nadie puede confundir mi propuesta con tu decisión.
- **Los otros dominios.** Hoy hay uno. Añadir el siguiente es un bloque más en el
  mismo archivo y **no toca la compuerta**. Los candidatos por volumen, medidos:
  `location` (34 llamadas a `can`), `equipment` (20), `specimen` (7), `sample` (4).
- **Lo que ningún mecanismo de éstos cierra:** que el `action` sea el debido, no
  sólo el `resourceType`. Pedir `view` donde correspondía `manage` pasa esta
  compuerta. Es la misma clase de pregunta, un nivel más fino, y hoy no está medida.
