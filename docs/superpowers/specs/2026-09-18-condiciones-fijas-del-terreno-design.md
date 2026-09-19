# Condiciones fijas del terreno: se configuran una vez y sólo se corrigen

**Estado:** aprobado por Daniel el 2026-09-18 («continua», tras dar la lista de sombra).

Pieza independiente de la jornada y la entrega de cosecha
(`2026-09-18-jornada-y-entrega-de-cosecha-design.md`). Se puede construir antes o después.

## 1. Lo que dijo Daniel (2026-09-18)

> «hay que ver que ciertas condiciones no cambian y quedan fijas desde que se configura ese
> detalle de una parcela, microparcela y/o bloque, specimen: serían condiciones como altitud, gps
> lat. long., y slope angle, dirección sol, tipo de sombreado. pero puede cambiar condiciones como
> lluvia, neblina etc. otras cosas.»

| pregunta | respuesta |
|---|---|
| si hay que cambiar una condición fija | **fijas, sólo corregibles**: quedan bloqueadas; sólo el Farm Manager las corrige, con motivo obligatorio, y la versión anterior queda en la historia |
| bloque y planta | **heredan, y pueden declarar las suyas**: por defecto muestran las de su parcela, marcadas «de la parcela»; si se configuran las propias, mandan ésas, con el mismo bloqueo |
| «tipo de sombreado» | **porcentaje y tipo, las dos**: se queda el porcentaje y se añade qué da la sombra, con «otro» y nota |
| la lista de tipos de sombra | «maría, amarillo, níspero, cedro, mango, corotú, y más» |

## 2. Lo que hay hoy (medido sobre `origin/main`)

- En `Location` (parcela y microparcela):
  - `latitude`, `longitude`;
  - `altitudeMinM`, `altitudeMaxM`;
  - `aspect` (orientación: los ocho rumbos, `flat` y `variable`);
  - `sunExposure`;
  - `shadePercentage` (20/30/50/70/90 %);
  - `slopeDescription` (**texto libre, no un ángulo**);
  - `soilType` y `plantSpacingMeters`.
- **Se editan en cualquier momento** con `updateLocationAttributes` (`location:manage_attributes`),
  que deja un `AuditEvent` con el antes y el después, pero **nada impide cambiarlas**. El
  Farm Operator tiene ese permiso.
- **`PlotBlock` y `Specimen` no tienen ninguno de esos campos.** La planta tiene su parcela, su
  bloque, su fila y su posición.
- Lo que cambia (lluvia, neblina) no tiene hoy dónde anotarse por día.

## 3. Diseño

### 3.1 Cuáles son las fijas

- **GPS:** latitud y longitud.
- **Altitud:** mínima y máxima en la parcela. En la planta, un solo valor.
- **Ángulo de pendiente**, en grados, **nuevo**. `slopeDescription` se queda como nota; no se
  convierte a ángulo, porque eso sería inventarlo.
- **Orientación** (`aspect`) y **exposición al sol** (`sunExposure`).
- **Sombra:** el porcentaje (`shadePercentage`) y el **tipo de sombra**, nuevo. Es un catálogo
  sembrado con los valores de Daniel —**María, Amarillo, Níspero, Cedro, Mango, Corotú**— y «otro»
  con nota. «Y más»: el catálogo crece por semilla, como los demás, sin migración. Una parcela
  puede tener **varios** tipos a la vez, porque la sombra de una parcela rara vez es de un solo
  árbol.

Suelo y distancia de siembra **no** entran en esta lista: Daniel no los nombró. Siguen como hoy.

### 3.2 El bloqueo

- **Una condición fija vacía se puede poner una vez** con el permiso de hoy
  (`location:manage_attributes`). Al guardarla queda **fija**.
- **Una condición fija ya puesta sólo se corrige:**
  - con un permiso nuevo, de Farm Manager y no de Farm Operator (el nombre se fija en el plan
    contra `lib/rbac/catalog.ts`);
  - con **motivo obligatorio**;
  - la versión anterior queda en la historia, visible en la ficha.

  Se hace con el patrón de enmiendas que ya existe (`leerEnmiendas`, `AuditEvent` con antes y
  después).
- **El bloqueo vive en el servicio y además en la base.** Un disparador rechaza cambiar una
  condición fija ya puesta si la escritura no viene de la corrección, marcada en la
  transacción. Un guion o un SQL directo no se la salta en silencio.

### 3.3 Bloque y planta

- **Campos nuevos, anulables:**
  - en `PlotBlock`: GPS, altitud, pendiente, orientación, sol, sombra y tipo de sombra;
  - en `Specimen`: GPS, altitud y pendiente, que es lo que tiene sentido para una sola planta.
- **Vacío = hereda.** La ficha muestra el valor de la parcela (o de la microparcela) marcado
  «de la parcela». **La herencia se calcula al leer y nunca se copia a la fila:** copiarla
  convertiría un dato heredado en uno declarado.
- Si se declara, manda el propio, con el mismo bloqueo de §3.2.

### 3.4 Lo que cambia: las condiciones del día

- Lluvia, neblina y demás **no son atributos**: son observaciones con fecha.
- Se anotan como **condiciones del día** en las situaciones de campo de la jornada (spec de la
  jornada y la entrega, §3.5): tipo del catálogo o «otro» con nota.
- **El valor medido** (mm de lluvia) es la lectura de un instrumento instalado en ese sitio:
  `2026-09-18-instrumentos-de-campo-design.md`.

## 4. Fuera de esto

- Convertir `slopeDescription` en ángulo: no se hace.
- Condiciones con vigencia («desde tal fecha la sombra es…»): se eligió corrección, no
  vigencia.

## 5. Pruebas que tienen que existir

- Poner una condición fija vacía funciona (control positivo). Cambiarla después con el permiso
  de hoy se rechaza, **en el servicio y en la base**: el disparador se prueba con una escritura
  directa.
- La corrección exige el permiso nuevo y un motivo. La versión anterior aparece en la historia.
- El Farm Operator no corrige; el Farm Manager sí.
- Un bloque sin GPS muestra el de su parcela marcado «de la parcela», y en su fila la columna
  sigue vacía. Con el suyo, manda el suyo.
- Suelo y distancia de siembra siguen editables como hoy.
