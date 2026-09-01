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

### Lo que sigue sin verificar, dicho con precisión

De las **19** que dependen del llamador, **verifiqué dos**:
`listPeopleForAdmin()` y `listScopeChoices()`, ambas gateadas por
`requirePermissionAdmin` en la misma página. **Quedan 17 por comprobar
llamador a llamador.** No es lo mismo «el script no las explica» que «están
mal», y tampoco es lo mismo «miré dos» que «están todas bien».

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
