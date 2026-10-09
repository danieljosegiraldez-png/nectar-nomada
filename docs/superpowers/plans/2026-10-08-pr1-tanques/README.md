# Plan del PR 1 «tanques» (arreglos previos de la Parte 2c)

Aprobado por Daniel el 2026-10-08 para construir. Diseño: `docs/superpowers/specs/2026-10-04-parte-2c-equipos-y-capacidades-design.md` §4.1, §4.5 y §4.6 (rama `recetas-parte-2a`).

Esta rama sólo guarda el plan, para que no dependa de la sesión que lo escribió. No lleva código ni PR. El código se construye en el worktree `~/Developer/nectar-worktrees/equipos-arreglos` (rama `equipos-arreglos`), y su PR lo fusiona la sesión coordinadora.

| archivo | qué es |
|---|---|
| `contrato.md` | decisiones D1-D11 de Daniel, nombres e interfaces que todas las tareas usan igual, y reglas de la casa |
| `T0.md` | preparación: adelanta la rama a `origin/main` (registra `BASE`), `npm ci`, base desechable `BASE_CI`, línea base de pruebas y del inventario |
| `T1.md` | bandejas aparte de los tanques (`EquipoEnLista.trayTypeId`) |
| `T2.md` | retirar y reactivar equipo (columnas, migración con marca calculada al ejecutar, servicio, ficha), `resumir`, y lo retirado fuera del tablero (D5, D6, D9) |
| `T3.md` | elegir tanque al fermentar (`recipientesParaFermentar`, que exige ver el lote: D11) |
| `T4.md` | compuerta completa, inventario de acceso, descripción y PR |

El plan es independiente de la base: las cifras son deltas sobre lo que T0 mide, y las ediciones se anclan por texto. Las rutas absolutas del directorio de borradores (`/private/tmp/claude-501/...`) son las de la sesión que lo escribió; quien lo retome desde aquí las sustituye por su propio directorio de borradores.

Revisado en varias rondas de revisión cruzada y en dos revisiones adversarias de Codex (2026-10-05 y 2026-10-08). Las 176 ediciones casan exactamente una vez sobre `origin/main` del 2026-10-08.
