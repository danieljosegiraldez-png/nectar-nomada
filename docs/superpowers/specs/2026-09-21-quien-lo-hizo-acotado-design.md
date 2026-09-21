# «Quién lo hizo» acotado a la finca — diseño (Entrega 1)

Decisión P-G de Daniel, 2026-09-21: eligió las reglas 1 y 2, más las ideas 1, 2, 5 y 6 para
esta entrega. Las ideas 3 (jornaleros sin cuenta) y 4 (invitado de otra finca) van en la
Entrega 2, con su propio diseño.

## El defecto, medido

- `getObserverCandidates` (`lib/traceability/lots.ts`) devuelve **todas las personas activas de
  la plataforma**. La usan 16 páginas.
- Devuelve la **fila entera** de `Person`: correo, teléfono y bio. Las páginas se la pasan como
  prop a componentes de cliente, así que llega serializada al navegador.
- Unos 50 sitios de `lib/` guardan `operatorPersonId`/`observerPersonId`/… **tal como llega del
  formulario**, sin comprobar a quién pertenece. `getAuthoringContext` (historias) tiene la
  misma lista abierta.

## La regla

Una persona puede figurar en «quién lo hizo» de un registro anclado en la organización `O` si
está activa (`Person.status = active`) y cumple una de estas condiciones:

1. **De esa finca.** Tiene una `OrganizationMembership` activa en `O`, o una cuenta con una
   `Assignment` activa y vigente cuyo ámbito es:
   - un proyecto con `organizationId = O`, o
   - un lugar cuya organización efectiva es `O` (la misma subida por padres que
     `getManageableContext`).
2. **Equipo Néctar Nómada.** Tiene una membresía activa en una organización de tipo
   `nectar_nomada_partner`, o una `Assignment` activa de ámbito `platform`.
3. **Quien registra.** La persona de la propia cuenta siempre puede ponerse a sí misma: ya pasó
   el guardia de acceso de la escritura.

**El ancla.** Un registro se ancla en una organización a través de su lugar (subiendo por
padres hasta el primero que tenga `organizationId`) o, si no tiene lugar, de su proyecto
(`Project.organizationId`). Si no se llega a ninguna organización, sólo valen 2 y 3.

**Idea 5: quien se va.** Si termina su membresía o su asignación, ya no pasa la regla y deja de
aparecer. Sus registros viejos guardan el id y siguen enseñando su nombre: no se borra nada.

## Piezas

- `lib/personas/quienLoHizo.ts`:
  - `personasPermitidas(ancla, userAccountId)` devuelve `{ deLaFinca, equipo, selfPersonId }`,
    cada lista con sólo `{ id, displayName }` (idea 6);
  - `exigirPersonaPermitida(personId, ancla, userAccountId, tx?)` lanza un error de dominio si
    el id no pasa la regla, y no hace nada si viene `null`.
- `getObserverCandidates(userAccountId, ancla)` delega en `personasPermitidas`, con el orden de
  ADR-080 (yo primero, luego por nombre). Las 16 páginas le pasan el ancla que ya tienen en
  mano.
- Selector: dos grupos (`<optgroup>`) «De esta finca» y «Equipo Néctar Nómada», con la persona
  propia preseleccionada (idea 1 y 2).
- Cada sitio de escritura que guarda una persona elegida en un formulario llama a
  `exigirPersonaPermitida` con el ancla de lo que escribe, dentro de su transacción.

## El guardia que impide que vuelva

`tests/arquitectura/`: un test recorre `lib/` buscando asignaciones de un campo `*PersonId`
desde la entrada, y exige que la misma función llame a `exigirPersonaPermitida`. Las
excepciones (un campo que no es «quién lo hizo») van en una lista con su motivo. Lleva un
control positivo (tiene que encontrar sitios) y se prueba con flip-test (quitar una llamada lo
hace caer).

## Pruebas

- Pruebas con base de datos de `personasPermitidas` para cada rama de la regla, incluyendo:
  - la persona de otra finca: excluida;
  - una membresía terminada: excluida;
  - un proyecto de otra organización: excluido;
  - un ancla sin organización.
- Una prueba de escritura real por familia (colmenas, trampas, mediciones, historias) que
  rechaza a una persona de otra finca.
- Una prueba que compruebe que las listas no traen `email` ni `phone`.

## Fuera de esta entrega

- Personas sin cuenta creadas por el encargado, e invitados de otra finca (Entrega 2).
- Campos que no son «quién lo hizo» (el evaluador de calibración sensorial, el destinatario de
  una notificación, el dueño de un dispositivo). El inventario decide cuáles son, y van a la
  lista de excepciones con su motivo.
