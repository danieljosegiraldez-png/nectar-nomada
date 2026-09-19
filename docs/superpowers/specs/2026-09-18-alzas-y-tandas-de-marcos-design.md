# Alzas con marca y tandas de marcos por color

**Fecha:** 2026-09-18 · **Camino:** arquitectónico · **Cambia una decisión** del spec
`2026-09-17-artefactos-de-colmena-design.md` §4, donde las alzas se modelaron sólo como cuenta.

---

## 1. Qué pidió Daniel, en sus palabras

- Alzas: **«todavía no [llevan marca], pero se marcarán»**.
- Para qué: las cuatro opciones — de qué alza salió la miel, sanidad (por dónde pasó),
  inventario del equipo, edad de la cera.
- La cera **no se sigue por alza**: *«pueden variar y entrar marcos de distintas procedencias a
  veces en una misma alza y cambiar a otra»*.
- Los marcos, **«se deberían enumerar también»**, pero *«no de manera única cada una, sino cada
  una por grupo, por lote de qué año de cosecha, o tipo de cera y fecha que se le puso a ese
  lote … por una marca … que tenga distinto color»*.
- Y el límite, dicho por él: *«las abejas tapan y marcan y recubren y no es fácil internamente
  rastrear … tantos marcos por 10 colmenas y múltiples alzas por cámara de cría»*.

## 2. La idea central

**La edad de la cera va escrita en el propio marco, con su color. La aplicación sólo guarda la
leyenda.** Nadie anota por dónde se mueve un marco, porque en el campo no se va a anotar.

Las **alzas** sí se siguen de colmena en colmena: la marca va por fuera, donde se ve, y un alza
se pone y se quita pocas veces.

## 3. Lo que esto NO resuelve, dicho de entrada

- **En qué colmena estuvo un marco concreto.** Sin anotar cada movimiento no se puede saber, y
  Daniel dice que en la práctica no se anotará. La sanidad llega **por alza**, y por **tanda**
  cuando se retira una tanda entera.
- **Qué marcos iban en un alza cosechada.** La cosecha dice qué alzas marcadas se extrajeron,
  no qué marcos.
- **La doble cuenta que ya existe**: `Hive.supers` (configuración de la caja) y los intervalos
  `alza` con cuenta dicen lo mismo en dos sitios. Viene de antes; este spec no la arregla y no
  la empeora.

---

## 4. Rebanada 1 — El alza con marca

### 4.1 El alza

Una tabla nueva `apiary.hive_super`:

| campo | qué es |
|---|---|
| `organizationId` | de quién es; sale del sitio donde se registra, como el nodo |
| `code` | la marca: «A-07». **Única dentro de la organización.** Texto; nadie impone formato |
| `inServiceAt` | desde cuándo se usa, si se sabe (opcional) |
| `lifecycleStatus` | `EquipmentLifecycle`, que ya existe: `active`, `retired`, `disposed` |
| `retiredAt`, `retiredReason` | la baja: cuándo y por qué, obligatorias juntas (CHECK) |
| `notes` | texto libre |

**Se registra** desde un apiario, con `requireApiaryAccess("manage")` sobre ese sitio. No se
borra una con historia (RESTRICT).

### 4.2 Poner y quitar un alza marcada — sobre los artefactos que ya existen

Es el patrón del nodo de sensores (spec del 17, §B), el único artefacto con identidad hasta hoy:

- `hive_fitting` gana `hive_super_id`, que es opcional.
- **CHECK:** si hay `hive_super_id`, entonces `kind = 'alza'` y `count = 1`.
- **Índice único parcial:** un alza marcada está **abierta en una sola colmena** a la vez.
- **Los solapes de intervalos ya cerrados** los comprueba el servicio, como con el nodo: un
  índice parcial no ve rangos.
- No se pone un alza dada de baja, ni una de otra organización.
- Se retira con `retirarArtefacto`, que ya existe.

**Las alzas sin marca no cambian:** siguen siendo filas `alza` con su cuenta. Una colmena con
A-07, A-15 y una sin marca tiene tres filas abiertas: dos de cuenta 1 con marca, y una de
cuenta 1 sin marca. El total sale de sumar las cuentas, como hoy.

**Contra la doble cuenta en pantalla:** al poner un alza, el formulario pregunta
**«¿tiene marca?»**. Si la tiene, se elige de la lista de alzas libres; si no, es una fila de
cuenta como hasta ahora.

### 4.3 La cosecha dice qué alzas se extrajeron

Una tabla de unión `apiary.apiary_harvest_super` (cosecha, alza). La regla, en el servicio:
**el alza tiene que estar puesta en la colmena de esa colonia el día de la cosecha**, con un
intervalo abierto o que cubra esa fecha. Es opcional: una cosecha sin alzas marcadas sigue
valiendo.

### 4.4 Qué se ve

- **Ficha del apiario:** la lista de alzas de la organización con su marca, dónde está ahora
  (colmena o «en bodega») y su estado, más «registrar alza».
- **Ficha de la colmena:** en los artefactos, las alzas marcadas por su marca.
- **Ficha del alza:** por qué colmenas pasó y cuándo, y qué cosechas la incluyen. Es la
  respuesta de sanidad.

---

## 5. Rebanada 2 — Tandas de marcos por color

### 5.1 La tanda

Una tabla nueva `apiary.frame_batch`:

| campo | qué es |
|---|---|
| `organizationId` | de quién es |
| `color` | el color de la marca, en texto: «azul», «rojo con punto blanco» |
| `waxAppliedAt` | la fecha en que se le puso cera o lámina a la tanda |
| `waxKind` | vocabulario cerrado con escape: lámina estampada propia, lámina comprada, sin lámina (cera natural), otro + nota |
| `frameCount` | cuántos marcos se hicieron en la tanda |
| `notes` | procedencia, año de cosecha si viene de una, lo que no cabe |
| `closedAt` | cuándo se dio por retirada la tanda entera |

**Un color no se repite entre tandas abiertas** de la misma organización (índice único
parcial). Si dos tandas vivas tuvieran el mismo color, el marco dejaría de decir su edad.

### 5.2 Sacar marcos de una tanda (opcional)

`apiary.frame_batch_removal`: tanda, cuántos, día, motivo (renovación de cera, dañado,
enfermedad, otro + nota) y, si vino de una, la inspección. Con eso la tanda dice **cuántos
marcos quedan en uso**. No se exige: si nadie lo anota, la tanda sigue diciendo su edad, que es
lo principal.

### 5.3 Qué se ve

- **Leyenda de colores** en la ficha del apiario: color → fecha, tipo de cera y edad. Es lo que
  se consulta en el campo con un marco en la mano.
- **Aviso de cera vieja** cuando una tanda pasa de una edad. **El umbral lo decide Daniel**
  (ver §7); hasta entonces se muestra la edad sin aviso.

---

## 6. Pruebas, a lo que obliga esta casa

Cada regla lleva su prueba y su flip-test, y cada CHECK su sonda en la base:

- el alza con marca en dos colmenas abiertas a la vez, y los solapes cerrados;
- poner un alza de baja o de otra organización;
- `hive_super_id` con `count` distinto de 1, o con otro `kind`;
- la cosecha con un alza que no estaba en esa colmena ese día;
- dos tandas abiertas con el mismo color;
- sacar más marcos de los que quedan en la tanda.

## 7. Preguntas que quedan para Daniel

1. **A partir de qué edad es vieja la cera**, para el aviso de la §5.3. Mientras no lo diga,
   la aplicación enseña la edad sin avisar.

## 8. Orden

Rebanada 1 y rebanada 2 son independientes. Van **en ese orden**, cada una con su rama, su
PR y su ADR.
