# 028 · La floración de un espécimen

**Estado: aplazada a propósito, por decisión de Daniel del 2026-10-16.** Al aprobar la pantalla de
floración dijo que se anota por parcela, microparcela, bloque «y specimen cuando sea relevante o
necesario. Generalmente se haría por plot o microplot». Se eligió construir ya lo habitual y dejar el
espécimen escrito aquí, con lo medido, para cuando haga falta.

**Qué la desbloquearía:** un caso real en el que importe que florezca **una** planta y no su bloque.
Por ejemplo, un árbol que florece fuera de temporada, o un espécimen de investigación que se sigue
aparte.

## Lo que hay hoy, medido el 2026-10-16 sobre `origin/main` (`1efa8d9c`)

- **`PlotBloom` no tiene dónde guardar una planta.** Sus columnas son `locationId`, `plotBlockId`
  (nulo = la parcela entera), `startsAt`, `endsAt`, `notes` y `observerPersonId`, y ninguna es
  `specimenId`.
- **Una intervención sí sabe apuntar a plantas:** `PlotInterventionArea.specimenId`, junto a
  `plotBlockId`. La asimetría está a un lado, el de la floración.
- **El aviso sólo compara bloques.** `hayFloracion` (`lib/traceability/floracionVigente.ts`)
  recibe los `bloquesElegidos`, y su cabecera ya avisa de una limitación del lado contrario: una
  intervención dirigida sólo a PLANTAS llega con los bloques vacíos y se lee como «la parcela
  entera», así que avisa de más, nunca de menos.

## Qué haría falta

1. **La columna `specimenId` en `PlotBloom`**, anulable, con su migración y `onDelete: Restrict`,
   como `plotBlockId`.
2. **En `registrarFloracion`, comprobar que la planta sea de esa parcela** —`Specimen.locationId`— y,
   si también se da un bloque, que sea de ese bloque. Es el mismo cuidado que ya tiene con el bloque.
3. **En el aviso, decidir cuándo avisa la floración de una planta.** Lo natural es: si la
   intervención cubre la parcela entera, el bloque de esa planta, o la planta misma. Hace falta pasar
   al navegador a qué bloque pertenece cada planta, que es lo mismo que la limitación de arriba ya
   pide.
4. **La pantalla**, un selector de planta en el formulario de floración, cuando la parcela tiene
   especímenes.

## Cómo comprobar que se hizo

Una prueba con base que anote la floración de una planta y compruebe tres cosas: avisa en una
intervención sobre esa planta y en una sobre su bloque, y **no** avisa en una sobre otro bloque. El
control es una floración de bloque que siga comportándose igual. El flip consiste en quitar la
comprobación de que la planta sea de la parcela: tiene que caer el caso de una planta ajena.
