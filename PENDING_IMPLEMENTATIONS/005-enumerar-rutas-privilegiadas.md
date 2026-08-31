# 005 · Probar la frontera de RBAC

**Estado: parcialmente hecho.** Lo que hay demuestra dos propiedades concretas.
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

## Lo que NO demuestra, y hay que decirlo

- **Que la autorización sea correcta.** Un `requireLotAccess` con el permiso
  equivocado pasa igual.
- **Nada sobre operaciones.** Un archivo ya inventariado puede añadir cien
  consultas sin que nada lo note. Hay **375** expresiones `prisma.*`/`aiPrisma.*`
  en 51 archivos: los archivos no son las decisiones de acceso.
- **Qué hace un archivo con la transacción que recibe.** Desde 2026-08-31 se
  inventaría **quién** puede recibir un `Prisma.TransactionClient`: hoy uno solo,
  `lib/traceability/balance.ts`, que no importa ningún cliente y aun así podía
  consultar cualquier cosa con el `tx` que le pasan — invisible a la
  comprobación de imports. Lo que sigue sin mirarse es qué consulta hace con él.
- **Detección por tipo, no por comportamiento.** Un archivo que reciba el
  cliente con otro tipo —`typeof prisma`, un alias— no lo vería. Es el mismo
  límite de siempre: se reconoce una forma escrita, no una propiedad.

## El intento que se rechazó, para que nadie lo repita

Se planificó un `AuthzContext` universal: un tipo que sólo devolviera el
servicio de autorización, exigido por un envoltorio del cliente, con un
centinela `AUTHZ_DEFERRED` para la deuda — copiando ADR-062. **La revisión
independiente lo rechazó en compuerta 2**, antes de escribir código: «el coste
no vale la garantía obtenida».

Tenía razón, y su hallazgo principal fue un fallo de medición mío:

- **Se me escapó un segundo cliente entero.** `lib/ai/db.ts` exporta `aiPrisma`,
  y mi grep buscaba `prisma\.` en minúscula, que no aparece en `aiPrisma.`.
- **La unidad correcta es la operación, no el archivo.**
- Al comprobarlo apareció un patrón que ninguno de los dos tenía: **la frontera
  del camino de IA está en la base de datos**, no en el código — rol
  `ai_service`, `INSERT`+`SELECT` sobre `ai.recommendation` y nada más
  (AI_GOVERNANCE.md §3, ADR-033). Un `AuthzContext` habría envuelto en ceremonia
  el único camino ya protegido mejor que cualquier tipo.

## Lo que haría falta para cerrarlo del todo

Un inventario **por operación** —principal, modelos, si el dato está gobernado,
qué guardia domina la consulta, scope y clasificación, acceso transitivo— y, a
partir de ahí, capacidades estrechas por dominio o repositorios que lleven el
scope dentro de sus métodos. **Un token universal para todo Prisma no basta**, y
eso ya está comprobado sobre el terreno en vez de supuesto.
