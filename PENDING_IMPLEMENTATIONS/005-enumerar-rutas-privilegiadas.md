# 005 · Probar la frontera de RBAC

**Estado: parcialmente hecho.** Lo que hay demuestra tres propiedades concretas.
Lo que falta está escrito abajo, con el intento que se rechazó y por qué.

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
