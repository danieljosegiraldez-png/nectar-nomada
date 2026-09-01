# Inventario de acceso a datos, por operación

Lo pidió la revisión que rechazó el plan del `AuthzContext`: **sustituir la
unidad «archivo» por «operación»**. 51 archivos no son 51 decisiones de acceso.

Se genera, no se escribe a mano — un inventario escrito a mano está obsoleto al
día siguiente:

```bash
node scripts/inventario-de-acceso.mjs          # resumen
node scripts/inventario-de-acceso.mjs --json   # una fila por operación
```

## Lo medido el 2026-08-31

**195 operaciones** que tocan la base, en **51 archivos**:

| Operaciones | Patrón | Qué significa |
|---:|---|---|
| **138** | guardia directo | Llama al servicio de autorización, directamente o por un guardia local del archivo |
| **23** | acotado por construcción | La consulta filtra por el propio principal —o por un `resolve*Visibility` que sale de sus asignaciones—: **no puede** devolver lo ajeno |
| **19** | depende del llamador | No recibe principal. La autorización, si existe, está en quien la llama |
| **10** | público por diseño | `lib/discover/service.ts` y su `PUBLIC_WHERE` (ADR-024 §3) |
| **3** | recibía principal sin guardia visible | **Las tres miradas a mano y explicadas** (abajo) |
| **2** | previo a la sesión | El flujo de autenticación |

### Las tres que no encajaban en ninguna regla

- **`lib/auth/config.ts authConfig()`** — es la configuración de Auth.js: el
  propio flujo de autenticación, previo a que exista sesión.
- **`lib/commerce/cart.ts addToCart()`** — lee una variante aplicando «la misma
  puerta pública que `lib/discover/service.ts`» y escribe **el carrito del
  propio titular**.
- **`lib/rbac/admin.ts listScopeChoices()`** — la llama
  `app/admin/users/page.tsx`, que antes hace `requirePermissionAdmin`.

**Ninguna es un agujero.**

### Las 19 que dependen del llamador: verificadas una a una (2026-08-31)

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

**Ninguna de las 195 operaciones quedó sin explicar.**

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

## Qué hacer con las 41

Clasificarlas a mano, una a una, y anotar el resultado. Sólo entonces se puede
decidir con datos si hace falta algo más fuerte que la convención actual:

- Si la mayoría resultan correctas por una vía que el script no ve, **la
  convención se sostiene** y un mecanismo universal sería ceremonia — que es
  exactamente lo que la revisión predijo del `AuthzContext`.
- Si aparecen operaciones sin autorización real, ese conjunto —y no «51
  archivos»— es el trabajo, y probablemente pida capacidades estrechas por
  dominio en vez de un token único.

**Ese trabajo no se ha hecho.** Este documento es el mapa, no el territorio
revisado.
