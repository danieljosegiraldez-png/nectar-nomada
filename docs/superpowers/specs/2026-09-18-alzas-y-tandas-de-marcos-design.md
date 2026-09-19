# Alzas con marca y cera con el color de su año

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

**La edad de la cera va escrita en el propio marco, con el color de su año. La aplicación sólo
sabe calcular la leyenda.** Nadie anota por dónde se mueve un marco, porque en el campo no se va a anotar.

Las **alzas** sí se siguen de colmena en colmena: la marca va por fuera, donde se ve, y un alza
se pone y se quita pocas veces.

## 3. Lo que esto NO resuelve, dicho de entrada

- **En qué colmena estuvo un marco concreto.** Sin anotar cada movimiento no se puede saber, y
  Daniel dice que en la práctica no se anotará. La sanidad llega **por alza**, y por **año de cera**
  cuando se retiran todos los marcos de un color.
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

## 5. Rebanada 2 — La cera nueva lleva el color de su año

### 5.1 El código de color es del año, y es uno solo

Daniel, el 2026-09-18: *«todas las abejas reinas nacidas ese año reciben ese apodo y color y toda
la cera nueva de ese año que entra como marco en alza o cámara de cría recibe esa marca color»*.

Es el código internacional de las reinas, que se repite cada cinco años:

| el año termina en | color |
|---|---|
| 1 o 6 | blanco |
| 2 o 7 | amarillo |
| 3 o 8 | rojo |
| 4 o 9 | verde |
| 5 o 0 | azul |

**Nadie elige el color: se calcula del año.** Una sola función, `colorDelAño(año)`, que sirve
igual para los marcos y, cuando se registre el año de las reinas (§5.4), para ellas. Un marco
blanco de 2026 coincide con el blanco de 2031; para entonces ya debería haberse renovado, y si
no, se ve a ojo que es viejo (§5.3).

**Así se pierde una regla de la versión anterior de este spec:** «un color no se repite entre
tandas abiertas». Ya no hay tandas con color elegido; la tanda **es** el año.

### 5.2 Anotar la cera nueva que entra

`apiary.new_wax_entry` — una fila cada vez que entra cera nueva:

| campo | qué es |
|---|---|
| `organizationId` | de quién es |
| `enteredAt` | el día; **su año decide el color** |
| `frameCount` | cuántos marcos |
| `destination` | `camara_de_cria`, `alza` o sin decir |
| `waxKind` | vocabulario cerrado con escape: lámina estampada propia, lámina comprada, sin lámina (cera natural), otro + nota |
| `hiveId` | opcional: la colmena donde entró, si entró directo a una |
| `notes` | procedencia, lo que no cabe |

Y cuando se sacan marcos, `apiary.frame_removal`: año del color, cuántos, día, motivo (cera
vieja o negra, dañado, enfermedad, otro + nota) y, si vino de una, la inspección. **Las dos cosas
son opcionales**: si nadie anota, el marco sigue diciendo su año con su color, que es lo
principal.

**No se impide sacar más de lo que se anotó entrando**: los marcos anteriores a este registro no
tienen entrada. Con las dos, cada año dice **cuántos marcos entraron y cuántos se sacaron**. No dice dónde están,
y no lo intenta.

### 5.3 Qué se ve

- **La leyenda del año** en la ficha del apiario: cada color con su año, cuántos marcos entraron
  y cuántos siguen en uso (si se anotaron salidas), y su edad.
- **Los marcos negros se cuentan en la inspección.** Las fuentes latinoamericanas leídas
  (Mishkihue, INTA 2024, Chapingo) juzgan la cera vieja **por el aspecto**, no por la fecha, así
  que el aviso sale de lo que se ve: «marcos negros: N». La edad del color es el dato de apoyo.
- **El aviso por edad**: suave a los 2 años, fuerte a los 4 (§7, contestada). Las cifras encontradas son
  2 a 3 años para la cámara de cría (FAO/IZSLT, Italia; «Apicultura y Miel», España). Ninguna
  fuente habla de las alzas, y es probable que el umbral sea distinto para cámara y alza.

### 5.4 Las reinas, con la misma regla — rebanada aparte

La reina ya existe (`Queen`, con su historia en `QueenTenure`), pero **no guarda el año en que
nació ni si va marcada**. Añadirlo es poco —un año opcional y «marcada: sí/no»—, y el color
saldría de la misma `colorDelAño`. Va en su propia rebanada para no mezclarla con la cera.

## 6. Pruebas, a lo que obliga esta casa

Cada regla lleva su prueba y su flip-test, y cada CHECK su sonda en la base:

- el alza con marca en dos colmenas abiertas a la vez, y los solapes cerrados;
- poner un alza de baja o de otra organización;
- `hive_super_id` con `count` distinto de 1, o con otro `kind`;
- la cosecha con un alza que no estaba en esa colmena ese día;
- `colorDelAño` en los diez finales de año, y en un año de cuatro cifras cualquiera;
- **no** se rechaza sacar más marcos de un año de los que se anotaron entrando: los marcos de
  antes de este registro nunca tendrán su entrada, y la regla impediría anotar su salida. La
  leyenda lo dice («salieron más de los anotados») en vez de negarlo.

## 7. Preguntas que quedan para Daniel

1. ~~A partir de qué edad es vieja la cera~~ — **contestada el 2026-09-18**: Daniel, *«estamos
   considerando 2-4 years»*. Se lee así, y es una **interpretación mía** que él puede corregir:
   **a los 2 años** aviso suave («revisar esta cera»), **a los 4** aviso fuerte («ya debería
   estar renovada»), **igual para cámara de cría y para alza**, porque no los separó. Los dos
   números viven en una sola constante, para cambiarlos en un sitio.
2. ~~Cuándo va la rebanada de las reinas~~ — **contestada el 2026-09-19**: justo después de la
   cera. Y el color es **sólo un apodo**, las reinas no se pintan (Daniel), así que no hay campo
   «marcada»: se guarda el año de nacimiento y el color se calcula. ADR-175.

## 8. Orden

Rebanada 1 (alzas) y rebanada 2 (cera por año) son independientes, y la de reinas (§5.4) también. Van **en ese orden**, cada una con su rama, su
PR y su ADR.
