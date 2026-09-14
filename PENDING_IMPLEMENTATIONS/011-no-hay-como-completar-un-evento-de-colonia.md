# 011 · No hay cómo completar un `ColonyEvent` después, y dos campos del Anexo lo esperan

**Estado: CERRADO el 2026-09-13.** El camino existe:
`lib/apiary/cierreDeEvento.ts` con `completarCierreDeTratamiento`, y los dos campos
que esperaban —`treatment_removal_date` y `treatment_efficacy_note`— ya son columnas
que alguien puede rellenar. ADR-121.

**Lo que la implementación añadió y este documento no preveía:** que **completar** y
**corregir** son cosas distintas. Completar un hecho que siempre iba a llegar después
—el retiro de una tira— no lleva razón ni plazo; cambiar algo ya escrito exige razón,
y el valor anterior queda en `before`. Pedir razón para el curso normal del trabajo
enseñaría a escribir «.» en el campo.

Queda **sin cerrar la mitad general**: esto completa el CIERRE de un tratamiento, no
corrige lo capturado en el campo (producto, lote, dosis, carencia, objetivo). Eso
sigue siendo deliberado — ver ADR-121, «lo que NO deja tocar».

---

**El texto original, como registro de lo que se midió:**

**Estado: no empezado.** Es un hueco **medido**, no supuesto, y bloquea dos campos
concretos que el dueño pide.

## Qué falta

`grep "export async function update|corregir|enmendar" lib/apiary/` no devuelve
**nada** (medido el 2026-09-13). Un `ColonyEvent` se escribe una vez y no hay camino
auditado para completarlo ni corregirlo. Trazabilidad tiene el suyo
—`updateFieldSession`, con `before`/`reason`/`sourceInterface`, y el lector de
enmiendas de A9.3— así que la forma ya está decidida; lo que no existe es el de
apiario.

## Los dos campos que lo esperan, del Anexo B §4

| Campo | Etapa | Por qué no se puede hoy |
|---|---|---|
| **Fecha de retiro** | cierre | *«las tiras que no se retiran generan resistencia».* Se anota **semanas después** de aplicar, cuando se vuelve al sitio. Sin camino de cierre, la columna sería una que nadie puede rellenar |
| **Eficacia observada** | cierre | *«cerrar el ciclo: tratar, volver a contar, comparar»* |

**«Eficacia observada» está a medias y conviene no contarla dos veces.** ADR-116 le
dio el mecanismo: `VarroaCount.evaluatesColonyEventId` liga un conteo posterior al
tratamiento que evalúa, y `serieDeInfestacion` lo devuelve. Lo que falta es la
`efficacy_note` en prosa del protocolo, que es lo de menos.

## Por qué no se añadió la columna «por si acaso»

Porque ya pasó, y costó una semana de invisibilidad: `coverage_until` entró el
2026-09-07 con su comentario, su lectura en los vitales y **ninguna pantalla que
pudiera escribirla**. Se descubrió el 2026-09-13 midiendo —1 alimentación, 0 con
valor— y hubo que hacer el camino entero (ADR-118). Una columna sin manija se ve
igual que una que no existe, y además se cuenta como hecha.

## Lo que ya está resuelto y no hay que rediseñar

- El vocabulario de vías vive en `lib/apiary/objetivoDelTratamiento.ts`, y
  `VIAS_QUE_DEJAN_MATERIAL` ya nombra la única que el dueño dijo: `tira`. El aviso
  de «no retirado» sale de ahí sin volver a decidirlo.
- **Pregunta abierta para Daniel**, anotada en ADR-119: si `cebo` también cuenta
  como vía que deja material. No se añadió por deducción.
