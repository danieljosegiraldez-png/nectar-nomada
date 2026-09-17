# Artefactos de colmena y el nodo de sensores

**Fecha:** 2026-09-17 · **Camino:** arquitectónico

Diseño a partir de lo que Daniel dijo en campo y del paquete de ingeniería
**Smart Hive Node V1** que compartió el 2026-09-16. **Todo lo que este documento
afirma del paquete está leído de él**, no supuesto; y todo lo que afirma del
repositorio está medido, con la fecha al lado.

---

## 1. De qué va esto, y de qué no

Daniel, el 2026-09-17: *«reductor de piquera instalada en cámara de cría de
colmena es un artefacto, es como también decir o seleccionar que uno va a poner
excluidor de reina o un smart hive console para usar sensores y track in real
time data»*. Y después: *«alzas, panales, etc»*.

O sea: **una colmena lleva cosas puestas**, y algunas de esas cosas son
aparatos que miden.

**Lo que NO va aquí:** el hardware. El paquete trae firmware, BOM, cableado y
potencia, y **todas sus compuertas físicas están NO CORRIDAS** — así lo dice él
mismo, y su `OPEN_ITEMS.md` advierte: *«no conviertas un NO CORRIDO en APROBADO
a partir de una revisión de código o una estimación»*. Este spec es sólo el lado
de la plataforma, que es el `G10` del paquete: *«repositorio de plataforma, auth,
modelo de inquilinos y almacenamiento no suministrados; la ruta, la API y la
publicación de documentación quedan por implementar»*.

---

## 2. Lo que YA existe y no se reconstruye — MEDIDO el 2026-09-17

| Pieza | Estado |
|---|---|
| `Hive.queenExcluder`, `entranceReducer`, `screenedBottomBoard`, `feederType` | **existen, como booleanos** |
| `Hive.broodBoxes`, `supers`, `framesPerBox` | existen, como cuentas — las alzas y los panales |
| `lib/apiary/configuracionDeCaja.ts` | el servicio que los lee y los cambia |
| `Measurement` | la medición **humana**: una variable, un valor, pegada a un lote o una corrida |
| `Device` | el registro de **teléfonos** para sincronizar sin señal. **No** es hardware de colmena |

**Ausente, medido con búsqueda exacta y control positivo:** no hay ningún modelo
`Sensor`, `SensorReading`, `Telemetry` ni `HiveDevice`. Los once modelos que
parecen serlo son `Sensory*` —de catación—, y caer en esa coincidencia ya me
pasó una vez.

---

## 3. La contradicción, y cómo se resuelve

`configuracionDeCaja.ts` cita una instrucción del propio Daniel:

> *«Cambia poco entre visitas, así que se guarda en la colmena y en la inspección
> sólo se registra la diferencia. Preguntarlo cada vez es coste sin
> información.»*

Y el 2026-09-17 pidió **historial completo con fechas**. Las dos cosas son
suyas, dichas en momentos distintos, y **no se pueden cumplir las dos con un
booleano**.

**Se resuelven así, y el orden importa:**

- **El intervalo es la verdad.** Qué llevaba puesto esta colmena el 3 de mayo es
  una pregunta que sólo un intervalo contesta.
- **El booleano se queda como FOTO de hoy**, y se escribe solo al cerrar un
  intervalo. No es una segunda fuente de verdad: es una caché con un único
  escritor, y el día que discrepe manda el intervalo.
- **La captura no cambia.** El operario sigue sin declarar la configuración en
  cada visita; sólo cuando **cambia**. Ahí es donde nace el intervalo. La
  instrucción de Daniel se cumple entera: lo que se le pide al operario es
  exactamente lo mismo que hoy.

**Y la mitad que hoy falta:** la instrucción dice «en la inspección sólo se
registra la diferencia» y **la inspección no guarda nada de configuración**
—medido—. Esa mitad es la que hace nacer los intervalos, así que entra aquí.

---

## 4. Sección A — El artefacto instalado

**`HiveFitting`** — una cosa puesta en una colmena durante un intervalo.

```
hiveId          la colmena
kind            excluidor | reductor_de_piquera | piso_ventilado |
                alimentador | alza | nodo_de_sensores | otro
installedAt     cuándo se puso        (requerido)
removedAt       cuándo se quitó       (nulo = sigue puesta)
installedInspectionId / removedInspectionId
                la inspección donde se declaró, si vino de una
notes           el «otro», y lo que no cabe en el vocabulario
```

**Por qué un vocabulario cerrado y no texto libre.** Es la regla que Daniel dio
para la alimentación: *«que no sea campo libre de texto libre, que sean
variables»*. Con `otro` y su nota, que es lo que aquel vocabulario hizo — un
vocabulario sin escape enseña a mentir en la casilla más cercana.

**Las alzas son un caso aparte y se dicen aparte.** `Hive.supers` es una CUENTA,
no un sí/no: una colmena lleva dos o tres. Un intervalo por alza permitiría
saber cuándo se puso la tercera; pero nadie numera las alzas en el patio, así
que el intervalo llevaría un `kind: alza` y una cuenta, no una identidad. **Se
modela la cuenta en el intervalo, no un alza por fila.**

**Lo que NO hace:** no inventa inventario. Diez reductores de piquera son diez
instalaciones, no diez objetos con número de serie — salvo el nodo, que sí lo
tiene (§B). Saber cuántos reductores quedan en la bodega es otro trabajo, el
mismo que el spec de biochar dejó fuera.

---

## 5. Sección B — El nodo, que es un artefacto con identidad

Un `nodo_de_sensores` es un `HiveFitting` **y además** un aparato: tiene número
de serie, firmware, configuración y calibración, y **se puede mover de colmena**.
El paquete lo dice con esas palabras: *«la reasignación del UID de un aparato
exige autorización del dueño y un cambio de intervalo auditable»*.

**`HiveNode`** — el aparato. `deviceId` del paquete (`rp2040-…`), modelo de
hardware, firmware, id de configuración, estado de ciclo de vida.

**El intervalo de asignación ES el `HiveFitting`.** No hay dos tablas de
intervalos: el nodo se instala en una colmena igual que un excluidor, y lo que
lo distingue es que apunta a un `HiveNode` con identidad.

### B.1 Lo que el nodo manda, leído de su esquema

`schemas/telemetry.schema.json`, campos requeridos: `device_id`, `epoch`, `seq`,
`event_id`, `ts`, `time_quality`, `boot`, `uptime_ms`, `hardware`, `firmware`,
`configuration_id`, `reset_cause`, `observations`, `faults`, `events`,
`missed_samples`.

Y dentro de `observations`: `battery`, `inspection` (si la colmena se abrió),
`weight` (báscula, con su `calibration_id`), `brood` (temperatura y humedad de
la cámara de cría), `ambient`, `pressure`, `accel`, `light`, `audio`.

### B.2 Cuatro reglas del paquete que son las de esta casa

Están en su `PLATFORM_API.md`, y se adoptan literales:

1. **«El tiempo de observación nulo se queda desconocido; no se sustituye el de
   ingestión como si se hubiera medido entonces.»** Es *«una humedad desconocida
   no se convierte en cero»*, dicho por otra gente.
2. **«Los valores ausentes son nulos con su fallo, nunca ceros.»**
3. **«Conservar el dato crudo, el id de calibración y las versiones de firmware y
   configuración. Los resultados derivados son registros versionados aparte que
   referencian el id del evento crudo.»**
4. **«Recalibrar después no muta la evidencia original.»** Es la regla de
   `ProcessRecipeVersion`: una receta no se edita, se versiona.

**Y una quinta que conviene subrayar:** *«etiquetar los avisos de pérdida de
peso, inclinación o batería como indicaciones basadas en reglas; nunca informar
de un enjambre o una enfermedad diagnosticados sólo con este juego de sensores»*.
Avisa, no diagnostica — la doctrina de la casa, aplicada a un sensor.

### B.3 Crudo y derivado, en dos tablas

**`NodeObservation`** — el evento tal como llegó, **inmutable**. Índice único por
`(deviceId, epoch, seq)`, que es lo que da idempotencia: el paquete advierte que
un acuse perdido produce duplicados, y exige *«duplicado exacto = 200; mismo id
con contenido distinto = 409 en cuarentena»*.

Guarda los tres tiempos por separado —el del evento, el de recepción y la
**calidad del reloj**— porque el nodo dice cuánto se fía de su hora, y esa
confesión es un dato.

**`NodeDerivedReading`** — lo interpretado: los kilos que salen de los conteos
crudos, con el algoritmo, su versión y el id del evento del que salió. Se puede
recalcular sin tocar lo crudo, que es de lo que trata la regla 4.

**No se reutiliza `Measurement`.** Es la medición humana: una variable, un valor,
una unidad, pegada a un lote o una corrida. Un nodo manda observaciones anidadas
con crudos, fallos y muestras perdidas, muchas veces al día y por colmena. Meter
esto ahí obligaría a que `Measurement` significara dos cosas según quién la lea —
el mismo error que se evitó con las recetas de biochar.

---

## 6. Sección C — Lo que hace falta antes de recibir un solo dato

El paquete asigna a la plataforma su `G10`, y estas piezas son las que bloquean:

- **La ruta autenticada** `POST /v1/ingest/notehub`, con su registro de UID y su
  vínculo al inquilino.
- **Resolver a qué colmena pertenecía la observación EN EL MOMENTO en que se
  midió**, no ahora. Por eso el intervalo de §A es requisito de la ingestión y no
  un adorno: un nodo que se movió de colmena en junio tiene datos de mayo que
  pertenecen a la colmena anterior.
- **Cola de salida y cola de fallidos** con visibilidad para el operador.
- Rechazo por tamaño (>16 KiB), por esquema, y los códigos que el paquete fija.

---

## 7. Decisiones abiertas — de Daniel, no mías

1. **Qué permiso exige instalar o retirar un artefacto.** ¿Basta `apiary:manage`
   —lo que ya tiene un `Farm Operator`— o instalar un nodo de 400 dólares merece
   uno propio, como pasó con `lot:release`?
2. **Si el intervalo se puede corregir a posteriori**, y quién. Una fecha de
   instalación mal tecleada reasigna datos de una colmena a otra.
3. **Abejas nativas.** El paquete avisa en `G13` de que *«el rango de 150 kg
   puede no dar resolución útil para colmenas pequeñas de abejas sin aguijón»*.
   Si van a llevar nodo, eso decide el hardware antes que el software.

---

## 8. Fuera de alcance

- **El hardware entero.** Todas las compuertas físicas del paquete están NO
  CORRIDAS.
- **El inventario de artefactos** — cuántos reductores quedan en bodega.
- **Las alertas.** El paquete deja explícito que no envía notificaciones, y las
  reglas de aviso son su propio trabajo.
- **El vídeo y las microparcelas**, que el paquete trae en su propia extensión.
