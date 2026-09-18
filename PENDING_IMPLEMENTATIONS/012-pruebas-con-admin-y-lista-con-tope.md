# 012 · Pruebas que ven toda la base y afirman sobre una lista con tope

**Estado: dos de tres hechos el 2026-09-18** —la fuga de `limpiezaDeCaja` y `meliponario`; queda `crearSesion`, que no se puede arreglar desde la prueba (ver «Arreglo»). Encontrado el 2026-09-18 auditando las pruebas que
buscan el perfil Platform Admin, después de arreglar `reporteDeProceso.test.ts`
(PR #395; la causa está en `CLAUDE.md`, «Un admin de plataforma ve la base
compartida entera»). **Ninguna falla hoy**: son la forma lenta del defecto, y
fallarán el día que la basura acumulada en la base cruce el tope.

## Cómo se auditó

22 archivos de `tests/` contienen `"Platform Admin"`. Revisados los 22, con un
control positivo: el criterio tenía que marcar la versión vieja de
`reporteDeProceso.test.ts` (`git show c18a001:…`), y la marcó. 14 asignan admin
de plataforma a su propio usuario, 5 toman prestada una asignación que ya
existe, 3 no lo tienen en ámbito de plataforma. **Ninguno** tiene el defecto en
su forma rápida (recuento exacto, `find` por clave no única o ausencia sobre una
lista global).

## Los dos casos de lista con tope

| prueba | aserción | por qué puede fallar |
|---|---|---|
| `tests/apiary/meliponario.test.ts:168-169` | `toContain(apiarioId)` sobre `getApiaryList(userAccountId)` | con admin el `where` no filtra (`lib/apiary/hives.ts`, `take: LIST_LIMIT + 1`, por nombre); lo propio se sale si hay 200 sitios que ordenan antes |
| `tests/sensory/crearSesion.test.ts:172, 243-244, 257-258` | busca muestras propias en `listarMuestrasParaCata(gestor)` | `lib/sensory/sessions.ts` toma 500 por `sampleCode` y corta en 200 visibles |

**Medido en la base compartida (55433) el 2026-09-18:** 55 `apiary_site`, de
ellos **15** restos `TEST Apiario (a9-lc-…)` de `limpiezaDeCaja.test.ts`, cuyo
`afterAll` sólo borra colonias — no el apiario, las cajas, el usuario ni la
asignación. **Crece con cada corrida.** Muestras: 8, lejos del tope.

## Arreglo

- **`limpiezaDeCaja.test.ts` — hecho.** Su `afterAll` borra todo lo que crea.
  Medido con la base quieta (dos lecturas iguales antes): la versión vieja dejaba
  **+1 sitio, +10 cajas, +2 personas, +1 organización** por corrida; la nueva
  **+0**. 10/10 las dos. Los 19 sitios que ya quedaban en la base compartida
  **no se borraron**: la base es de todas las sesiones.
- **`meliponario.test.ts` — hecho.** La lista la lee un lector con Farm Operator
  sólo sobre los dos sitios, y la aserción es exacta. Flip-test: volver a leer con
  el admin → cae «los dos salen en la lista» con **65 sitios en vez de 2**.
- **`crearSesion.test.ts` — sin hacer, y no se puede desde la prueba.**
  `listarMuestrasParaCata` exige `sensory:manage_session`, que sólo existe en
  ámbito de plataforma: quien la llama **ve todas las muestras siempre**. El tope
  está en el producto (`take: 500` por código y 200 visibles, en
  `lib/sensory/sessions.ts`), no en el fixture. Hoy hay 8 muestras. Arreglarlo es
  decidir cómo pagina esa lista.

## De paso, sin relación con el admin

- `tests/traceability/recipeVersions.test.ts:156-160` lee el último
  `AuditEvent` de la operación sin filtrar por la versión propia; pasa aunque
  lea uno ajeno, así que apenas discrimina.
- `tests/traceability/batchPageData.test.ts:92-102` elige un lote ajeno sin
  eventos de cantidad y afirma `recorded: false`; otro archivo puede registrar
  cantidad en ese lote entre medias.
- `tests/rbac/admin.test.ts:105, 118-119` cuenta `AuditEvent` globales
  (`before + 1`); hoy sólo ese archivo escribe esa operación.

**Desbloquea:** nada — trabajo pendiente.
