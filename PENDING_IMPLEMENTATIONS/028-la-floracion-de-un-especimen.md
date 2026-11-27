# 028 · La floración de un espécimen

**Estado: aplazada a propósito, por decisión de Daniel del 2026-10-16.** Al aprobar la pantalla de
floración dijo que se anota por parcela, microparcela o bloque, «y specimen cuando sea relevante o
necesario. Generalmente se haría por plot o microplot». Se eligió dejar el espécimen escrito aquí, con
lo medido, para cuando haga falta.

**Qué la desbloquearía:** un caso real en el que importe que florezca **una** planta y no su bloque.
Por ejemplo, un árbol que florece fuera de temporada, o un espécimen de investigación que se sigue
aparte.

**De dónde sale.** La pantalla de floración que entró es la **F1** (#683, «dos momentos»: anotar el
inicio y cerrar después). Esta ficha nació en el #749, que construía lo mismo en paralelo y se cerró
al ver que la F1 ya estaba en `main`; lo único que aquel PR traía y la F1 no, era esto.

## Lo que hay hoy, medido el 2026-10-18 sobre `origin/main` (`5ef53785`, con la F1 dentro)

- **`PlotBloom` no tiene dónde guardar una planta.** Sus columnas son `locationId`, `plotBlockId`
  (nulo = la parcela entera), `startsAt`, `endsAt`, `notes` y `observerPersonId`, y ninguna es
  `specimenId`.
- **El formulario de la F1** (`app/components/traceability/FloracionForm.tsx`) ofrece parcela y
  bloque, y no menciona especímenes.
- **Una intervención sí sabe apuntar a plantas:** `PlotInterventionArea.specimenId`, junto a
  `plotBlockId`. La asimetría está a un lado, el de la floración.
- **El aviso sólo compara bloques.** `hayFloracion` (`lib/traceability/floracionVigente.ts`) recibe
  los `bloquesElegidos`, y su cabecera ya avisa de una limitación del lado contrario: una
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
4. **La pantalla**, un selector de planta en `FloracionForm`, cuando la parcela tiene especímenes.

## Cómo comprobar que se hizo

Una prueba con base que anote la floración de una planta y compruebe tres cosas: avisa en una
intervención sobre esa planta y en una sobre su bloque, y **no** avisa en una sobre otro bloque. El
control es una floración de bloque que siga comportándose igual. El flip consiste en quitar la
comprobación de que la planta sea de la parcela: tiene que caer el caso de una planta ajena.
