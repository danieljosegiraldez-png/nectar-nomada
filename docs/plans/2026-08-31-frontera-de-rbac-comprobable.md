# Hacer comprobable la frontera de RBAC · 2026-08-31

Cierra `PENDING_IMPLEMENTATIONS/005`. Ese pendiente pide demostrar lo que
`SECURITY.md` §2 afirma: que **toda lectura o escritura de datos gobernados por
RBAC atraviesa el servicio compartido de autorización**.

## Lo que encontré al medirlo, y que cambia el objetivo

**El código no es laxo. La convención existe y se sigue.** Medido hoy:

- **51 archivos** tocan `prisma.` (5 bajo `app/`, 46 bajo `lib/`).
- Hay un idioma establecido de guardias por dominio, muy usado:
  `requireLotAccess` (41 usos), `requireResearchAccess` (42),
  `requireLocationAttributeAccess` (14), `requireApiaryAccess` (12),
  `requireColonyEventWriteAccess`, `requireBalanceOverride`,
  `requirePermissionAdmin`.
- **35 de los 51** llevan una llamada de autorización en el propio archivo.

De los 16 restantes, ninguno resultó ser un agujero al mirarlo. Aparecieron
**cinco patrones distintos de aplicar la regla**, y sólo el primero es visible
para un grep:

1. **Guardia explícito en el archivo** — `requireLotAccess(...)`.
2. **Acotado por construcción** — la consulta filtra por las asignaciones del
   propio usuario (`getPartnerProjects(userAccountId)`). Es autorización, y de
   la más fuerte: no hay nada que saltarse porque la consulta no puede devolver
   lo ajeno.
3. **Transitivo** — `getLotReport` no guarda nada: delega en `getLotDetail`,
   que sí guarda. La puerta está a una llamada de distancia.
4. **Público por diseño** — `lib/discover/service.ts` con su `PUBLIC_WHERE`
   (ADR-024 §3).
5. **Previo a la sesión** — `app/actions/auth.ts`.

**Por eso el objetivo no es «cerrar 38 agujeros».** Al medirlo bien no aparecen
agujeros; aparece una convención sólida que **ningún tipo, ninguna prueba y
ninguna herramienta puede ver**. El archivo número 52 que se olvide de ella se
verá exactamente igual que los 16 que están bien.

## Para qué es

Que **saltarse la autorización sea un error de compilación**, como ADR-062 hizo
con la puerta de clasificación: la omisión dejó de ser invisible y produjo
exactamente trece errores, que era el número de sitios que la saltaban.

## Lo que NO propone

- **No reescribir los cinco patrones a uno solo.** El acotado por construcción
  es mejor que un guardia, no peor; forzarlo a pasar por una puerta añadiría
  una comprobación redundante y quitaría la garantía estructural.
- **No prometer que detecta autorización incorrecta.** Detectaría *ausencia
  declarada*, no *corrección*. Un `requireLotAccess` con el permiso equivocado
  seguiría pasando, y eso hay que decirlo en la salida.

## La forma propuesta

**Un tipo que sólo se puede construir autorizando.** El cliente de Prisma deja
de importarse directamente en los módulos de dominio; se accede a través de un
envoltorio que exige un `AuthzContext` — un tipo opaco que únicamente devuelven
el servicio de RBAC, los guardias de dominio, o un constructor explícito para
los patrones 2, 4 y 5:

- `scopedTo(userAccountId)` — patrón 2, y deja dicho en el sitio que la consulta
  se acota sola.
- `publicByDesign(adr)` — patrón 4, exige citar la decisión que lo autoriza.
- `preSession(reason)` — patrón 5.
- `AUTHZ_DEFERRED(motivo)` — el equivalente de `CLASSIFICATION_GATE_DEFERRED`:
  compila, no cambia el comportamiento, y convierte la deuda en un inventario
  `grep`-able que sólo debería bajar.

## Cómo sabremos que funcionó

1. **Un módulo nuevo que consulte datos gobernados sin contexto no compila.**
   Prueba: añadir un archivo que llame al envoltorio sin `AuthzContext` y ver
   fallar `tsc`. Quitarlo y ver pasar.
2. **El inventario de deuda es visible y sólo baja.**
   `grep -rn AUTHZ_DEFERRED lib app` da un número; se registra hoy y en cada PR.
3. **Los cinco patrones siguen expresables**, y cada uno se declara. Prueba: los
   16 archivos sin guardia en el archivo quedan clasificados con el constructor
   que les corresponde, ninguno con `AUTHZ_DEFERRED` salvo los que de verdad no
   sepamos justificar.
4. **Ningún cambio de comportamiento.** Prueba: la suite completa pasa antes y
   después con el mismo resultado; ninguna consulta cambia de forma.
5. **La salida dice qué NO prueba**: que la autorización sea *correcta*.

## Qué toca

- Nuevo: `lib/db/authz.ts` — el tipo y los constructores.
- Nuevo: `lib/db/client.ts` — el envoltorio que exige contexto.
- Modificado: los 51 archivos que tocan `prisma.`, uno a uno.
- Nuevo: `tests/rbac/authz-context.test.ts` con el fixture negativo del punto 1.
- `PENDING_IMPLEMENTATIONS/005` → cerrado o reescrito según el resultado.

## Riesgos, y el coste si me equivoco

- **Tocar 51 archivos en un repositorio con varias sesiones activas.**
  *Coste:* conflictos constantes y una rama que nunca fusiona.
  *Mitigación:* por dominio, un PR por carpeta, empezando por `lib/apiary` (4
  archivos) para validar la forma antes de tocar `lib/traceability` (20).
- **Que el tipo se vuelva ceremonia.** Si el 80 % acaba en `scopedTo`, no
  hemos ganado nada sobre la convención actual. *Coste:* trabajo perdido y ruido
  permanente. *Mitigación:* medir la distribución tras el primer dominio y
  **abandonar si el reparto no distingue nada**.
- **Falsa sensación de seguridad.** Un ✓ aquí no dice que los permisos sean los
  correctos. *Coste:* el peor de todos. *Mitigación:* la salida y el nombre lo
  dicen; nada se llama «seguro» ni «protegido».

## Revisión — hallazgos y adjudicación

**Veredicto de Codex: RECHAZADO.** No cerrar `PENDING 005` y **no empezar la
migración de 51 archivos**. «Tal como está, el coste no vale la garantía
obtenida.» **Lo acepto entero**, y su hallazgo principal es un fallo de medición
mío, no de diseño.

| # | Hallazgo | Veredicto | Comprobado |
|---|----------|-----------|------------|
| 1 | **Se me escapó un segundo cliente de Prisma.** `lib/ai/db.ts` exporta `aiPrisma` | **CONFIRMADO** | Mi grep era `prisma\.` en minúscula, y `aiPrisma.` no lo contiene: contiene `Prisma.`. Un vocabulario mal elegido otra vez, y esta vez ocultó un cliente entero |
| 2 | La unidad correcta es **la operación**, no el archivo | **CONFIRMADO** | **375 expresiones** `prisma.*`/`aiPrisma.*` en 51 archivos. «51 archivos» no son 51 decisiones de acceso |
| 3 | `$transaction` y `Prisma.TransactionClient` propagan acceso y el plan no dice cómo tiparlos | **CONFIRMADO** | 28 usos |
| 4 | Los cinco criterios de aceptación pueden ponerse verdes indebidamente | **ACEPTADO** | Ninguno prueba que no exista un import alternativo; el fixture sólo probaba la API feliz |
| 5 | Faltan mutantes positivos por cada vía de escape real | **ACEPTADO** | `lib/db`, cliente generado, cliente alternativo y `TransactionClient` |
| 6 | Categorías que el token universal no distingue | **ACEPTADO** | Infraestructura post-autorización, propiedad propia por identidad, y datos **no gobernados** por RBAC |

### Un patrón más, que ninguno de los dos tenía

Al comprobar el hallazgo 1 apareció el **sexto** patrón, y es el más fuerte:
**la frontera está en la base de datos.** `lib/ai/db.ts` ata su cliente al rol
`ai_service`, con `INSERT`+`SELECT` sobre `ai.recommendation` y nada más
(AI_GOVERNANCE.md §3, ADR-033). No hay código que pueda saltárselo, porque no es
código lo que lo impide.

Eso refuerza el rechazo: un `AuthzContext` universal habría envuelto un camino
que ya está mejor protegido que cualquier tipo, y habría añadido ceremonia
encima de una garantía real.

### La alternativa que sí vale, y que no toca 51 archivos

Propuesta por la revisión y la adopto como el **siguiente** plan:

1. Un test de arquitectura que inventaríe los imports de `lib/db`, `lib/ai/db`,
   el cliente generado y toda construcción de `PrismaClient`.
2. Ese inventario **versionado** como allowlist, y fallo ante cualquier entrada
   nueva. Es la propiedad honesta: *un acceso crudo nuevo no aparece en
   silencio*.
3. `no-restricted-imports` para prohibir acceso crudo desde `app/**`.
4. Migrar a servicios de dominio los **5** imports actuales de `app/**`.
5. Inventario de excepciones **por operación**, no un `AUTHZ_DEFERRED` libre.

**Lo que sigue sin demostrarse, y hay que decirlo:** que la autorización sea
*correcta*. Tampoco lo demostraba el `AuthzContext`, y esta vía cuesta una
fracción.

**No se escribió una línea de código.** La compuerta 2 hizo exactamente lo que
existe para hacer, por cuarta vez hoy.
