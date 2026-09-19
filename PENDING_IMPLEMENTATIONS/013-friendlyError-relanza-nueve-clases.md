# 013 · `friendlyError` relanza clases de validación que no conoce: son 500

**Estado: abierto.** Encontrado el 2026-09-19 por la revisión de Codex del PR #433, que arregló un
caso (`PropositoInvalido`, abrir una jornada sin propósito). Medido después contra `main`
(`3a3c60c`): la búsqueda `instanceof <Clase>` dentro de `function friendlyError` da **0** para las
nueve de abajo, y **1** para `PropositoInvalido` — el control de que la búsqueda mira donde debe.
**No se ha provocado ningún 500 de estos en el navegador**: es propagación leída en el código.

## La causa

`friendlyError` (`app/actions/traceability.ts`) traduce las clases que conoce y termina en
`throw error`. Una clase de validación que no tenga rama escapa de la acción y el formulario
recibe un 500 en vez de un mensaje. **Toda clase de validación nueva que llegue a una acción
necesita su rama ahí.**

## Las nueve clases (con dónde las lanzó Codex; comprobar antes de arreglar)

| clase | definida en | acciones que la dejan escapar |
|---|---|---|
| `VitalesEnSitioInvalido` | `lib/apiary/vitalesEnSitio.ts` | `vitalesEnSitioAction` |
| `ClimaInvalido` | `lib/apiary/climaObservado.ts` | `vitalesEnSitioAction`, `completarVisitaAction` |
| `MassBalanceError` | `lib/traceability/balance.ts` | selección, tueste, cierres de fermentación y secado |
| `CerezaError` | `lib/traceability/harvest.ts` | `recordHarvestAction` |
| `RoastSessionValidationError` | `lib/traceability/roasting.ts` | `recordRoastSessionAction`, `elegirPerfilDeTuesteAction` |
| `ProcessTargetError` | `lib/traceability/processTargets.ts` | crear/editar/versionar receta |
| `LabourValidationError` | `lib/traceability/operations.ts` | `recordLabourEntryFormAction` — **sin `catch`** |
| `MaterialConsumptionValidationError` | `lib/traceability/operations.ts` | `recordMaterialConsumptionEntryFormAction` — **sin `catch`** |
| `CoordenadasValidationError` | `lib/traceability/coordenadasDelSitio.ts` | `confirmarCoordenadasAction` — **sin `catch`** |

Fuera de ese archivo, `crearApiarioFormAction` (`app/actions/apiary.ts`) llama sin `catch` a
`crearApiario`, que lanza `ApiaryAccessError` por nombre vacío.

Y un comentario que dice lo contrario de lo que hace: `lib/traceability/fieldSessions.ts`, junto a
`purposes:`, afirma que «vacío o `null` guarda un arreglo vacío»; sólo `null` lo hace.

## Qué haría el arreglo

Una rama por clase con su clave en `messages/es.json` y `en.json`, una prueba hermética por acción
(el patrón de `tests/traceability/startFieldSessionAction.test.ts`), y **un guardia**: una prueba
que falle si una clase de error de `lib/` alcanzable desde una acción no tiene rama en
`friendlyError`. **Sin decisión de Daniel todavía:** se le ofreció el 2026-09-19 (arreglar,
arreglar + guardia, o sólo anotar) y su «2» contestaba a dos preguntas a la vez; no quedó claro.
