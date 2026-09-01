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

**194 operaciones** que tocan la base, en **50 archivos**:

| Operaciones | Patrón | Qué significa |
|---:|---|---|
| **119** | guardia directo | Llama a `requireLotAccess`, `can()` y compañía |
| **23** | recibe principal, sin guardia visible | Toma `userAccountId` y consulta sin puerta reconocible |
| **20** | acotado por construcción | La consulta filtra por el propio principal: **no puede** devolver lo ajeno |
| **18** | sin clasificar | Ninguna regla las explica |
| **10** | público por diseño | `lib/discover/service.ts`, con su `PUBLIC_WHERE` (ADR-024 §3) |
| **2** | previo a la sesión | `app/actions/auth.ts` |
| **2** | guardia transitivo | Delegan en una función que sí guarda |

**79 % está explicado por un patrón reconocible. 41 operaciones (21 %) no.**

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
