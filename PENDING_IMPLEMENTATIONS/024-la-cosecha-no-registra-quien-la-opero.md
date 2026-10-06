# 024 · La cosecha no registra quién la operó, aunque el servicio lo guarde

**Estado: medido el 2026-10-05, sin construir.** Es un defecto, no una decisión: no hace falta
preguntar nada para arreglarlo.

## El defecto, con su control

Las **35** filas de `traceability.harvest_event` tienen `operator_person_id` **nulo en las 35**.
Medido sobre `nectar_test` (198 migraciones, 108 lotes como fila patrón):

```sql
select count(*) as total, count(operator_person_id) as con_operario from traceability.harvest_event;
-- 35 | 0
```

**Y no es que el modelo no lo soporte.** `recordHarvestEvent` lo acepta y lo escribe:

- `lib/traceability/harvest.ts:80` — `operatorPersonId?: string | null;`
- `lib/traceability/harvest.ts:100` — lo pasa por `exigirPersonaPermitida`, o sea que hasta
  comprueba el permiso de la persona que se nombra
- `lib/traceability/harvest.ts:136` — `operatorPersonId: input.operatorPersonId ?? null`

**La cadena se rompe en la acción.** `recordHarvestAction`
(`app/actions/traceability.ts:420`) **no manda el campo**: 0 menciones de `operatorPersonId` en su
bloque de argumentos, contra **1** de `locationId` como control de que la búsqueda mide. Pasa
`lotCode`, `locationId`, `organizationId`, `projectId`, `harvestedAt`, `cherryWeightKg`, `brix`,
los tres valores de cereza, `notes` y `provenanceClass` — y nada más.

Y ninguna pantalla de cosecha pinta el campo. Sí lo pintan otras siete
—`MeasurementForm`, las de apiario, `field-sessions`— así que el patrón existe y hay de dónde
copiarlo.

## CORREGIDO EL 2026-10-06: la mitad del formulario NO se puede hacer, y el camino vivo ya está a salvo

**Hecho: la acción ya manda el campo**, con su guardia de conducta
(`tests/traceability/cosechaConOperario.test.ts`, en `base-sembrada`). Tres pruebas, y antes del
arreglo caían **dos** por su nombre: el operario salía nulo, y **una persona ajena a la finca se
aceptaba**, porque el campo nunca llegaba a `exigirPersonaPermitida`.

**Sin hacer, y no se va a hacer: «el campo en el formulario de cosecha».** Ese formulario **no
existe**. Se retiró el 2026-09-19 con la pieza 3, y lo dice el comentario de `app/lots/page.tsx:73`:
«un lote de cereza nace de una recepción, en `/beneficio/recepcion`, y no de un formulario que pedía
su organización y su ubicación a mano». Medido: `recordHarvestAction` tiene **cero** llamadores en
`app/`, con control positivo —`recordMeasurementAction` sí aparece en `MeasurementForm.tsx`—.

**Y el camino vivo no puede perder al recolector, por estructura y no por disciplina:**
`entrega_de_cosecha.recolector_person_id` es **NOT NULL** (`schema.prisma`, modelo
`EntregaDeCosecha`). Una entrega no existe sin nombrar a quien cosechó. Los **35** nulos de
`harvest_event` son del camino retirado, no del que se va a usar.

**Así que la última frase de esta ficha era falsa.** Decía que esto «es lo que hace falta antes de
que dar el perfil Recolector signifique algo». No: el perfil sirve para la cadena de entregas, que
ya obliga a nombrar al recolector. Lo que bloquea esa cadena es que nunca se ha usado —las seis
tablas a cero— y eso es el bloque de §3, no esta ficha.

**Lo que el arreglo sí vale:** que esa acción no vuelva a tragarse el campo en silencio si alguien
la vuelve a cablear o la llama desde un guion, y que la autorización de la persona se ejerza. Es
pequeño y está medido; no es la pieza que hacía falta para la finca.

## Qué lo desbloquea (escrito el 2026-10-05, antes de medir lo de arriba)

**Nada.** Son dos piezas: el `emptyToNull(formData.get("operatorPersonId"))` en la acción, y el
campo en el formulario de cosecha. El selector de personas ya existe y ya está acotado por
`exigirPersonaPermitida`, así que no hay que inventar la autorización.

**Su guardia, y que sea de CONDUCTA:** una prueba que llame a la acción con el campo puesto y
compruebe que la fila lo guarda. Un guardia de fuente que sólo busque la cadena
`operatorPersonId` en el archivo pasaría con el campo declarado y sin mandar — es la lección de
`009`, donde tres comprobaciones de artefactos estaban verdes con el defecto vivo.

## Lo que NO es, dicho para no confundirlo

**No explica las 0 entregas de recolector**, y una versión de la nota de `SESSION_STATE.md` §3 lo
insinuó. Son dos huecos distintos: `entrega_de_cosecha` lleva su propio `recolector_person_id`, y
esa familia está a cero por otra razón —las seis tablas (`jornada_de_cosecha`,
`asignacion_de_jornada`, `entrega_de_cosecha`, `recepcion_de_cereza`, `lote_desde_recepcion`,
`merma_de_recepcion`) nunca se han usado, y una entrega cuelga de una jornada—.

**Y no es urgente por sí solo**, pero sí es lo que hace falta antes de que «dar el perfil
Recolector» signifique algo medible: hoy, con el perfil puesto, la cosecha seguiría sin decir
quién la hizo.
