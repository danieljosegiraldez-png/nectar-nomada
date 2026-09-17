# Monitoreo de trampas de broca — diseño

> **Estado:** spec, sin código. Es la pieza 2 de 3 del manejo fitosanitario de
> la parcela. La 1 (tablero de parcela) está fusionada; la 3 (aplicaciones
> fitosanitarias) no está diseñada.

**Fuente de todo lo que aquí se decide:** Daniel, 2026-09-17, describiendo cómo
se hace hoy en la finca, más la guía técnica de Anacafé *Elaboración de trampas
para la captura de broca del fruto del cafeto* (Oscar Guillermo Campos Almengor,
Cedicafé), que él aportó. **Lo de la guía es de Guatemala y sirve de referencia,
no de regla de la finca**: en este diseño ningún plazo ni umbral sale de la guía,
todos salen de las reglas que configure el encargado (§5).

## 1. El problema

Hoy la revisión de trampas se anota **en un chat de WhatsApp** y ahí se decide
qué hacer. No queda registro consultable, no se puede comparar un bloque con
otro ni un ciclo con el siguiente, y la decisión depende de que alguien recuerde
el mensaje.

Lo que se hace en campo, en palabras del dueño:

> «Se selecciona por parcela o microparcela, se bota el líquido de jabón en una
> tela y se estudia y revisa bien qué bichos están en la trampa. Se observa si
> hay muchos, algunos, pocos o ninguno presente, y si es broca u otro. Se puede
> tomar foto e identificar al número único identificador de la trampa, vinculada
> a una microparcela o bloque dentro de la parcela.»

## 2. Lo que ya existe, y lo que le falta

`Specimen` (esquema `traceability`) ya modela la trampa **como un individuo
rastreado del sitio**, con `specimenType = trap`, su ciclo `installed` /
`removed` / `reinstalled`, y `SpecimenObservation` con `observationType =
trap_check` y un `captureCount` entero. El servicio `lib/traceability/specimens.ts`
expone `createSpecimen`, `recordSpecimenObservation` y `getTrapCheckSeries`, y
está protegido por `specimen:manage` / `specimen:view`, que existen en
`lib/rbac/catalog.ts`. **No hay ninguna pantalla**, y en la base local no hay
ninguna trampa registrada.

Cinco huecos entre eso y lo que se hace en campo:

| lo que hace la finca | lo que hay | qué falta |
|---|---|---|
| «muchos / algunos / pocos / ninguno» | `captureCount` entero | una escala; el número pasa a ser opcional |
| «si es broca u otro» | nada | presencia de otros insectos y cuáles |
| foto de la tela de **esa** revisión | `Asset` cuelga del `Specimen` | fotos por observación |
| bloque dentro de la parcela | `sectorSimple` alto/medio/bajo | el bloque con nombre propio |
| limpiar, cambiar líquido, recargar difusor | nada | qué mantenimiento se hizo |

## 3. Bloques

**Término aprobado por el dueño: «bloque».** Se descartó «sector» porque ya
existe en `Specimen.sectorSimple` (alto/medio/bajo) y confundiría dos cosas
distintas.

- Un bloque es una **subdivisión con nombre de una parcela** («norte», «parte
  alta», «B3»), creada por el operador. Nada de geometría: un nombre y una nota.
- **Es opcional en los dos sentidos:** una parcela puede no tener bloques, y una
  trampa puede no pertenecer a ninguno.
- Un bloque es una **zona, no una lista de plantas**. Las plantas individuales
  (`specimenType = plant`) siguen siendo una vista aparte y opcional — palabras
  del dueño: «nadie quiere ver tantos specimens a la vez».
- Para qué existe: saber qué número de trampa está en qué parte de la parcela y
  **comparar bloques a lo largo del tiempo**, cruzando revisiones de trampa con
  las observaciones del personal.

Sólo se usa para trampas en esta pieza. Que una planta pueda pertenecer a un
bloque es una extensión natural y **no entra aquí**.

## 4. Trampas y revisiones

### Alta

Una por una, por decisión del dueño: «nada queda creado sin haberlo visto».
Cada trampa lleva parcela, bloque opcional, fecha de instalación y notas.

**El número lo genera el sistema**, correlativo dentro de la finca, y el
operador lo rotula en la botella. Se muestra en grande al crearla.

El ciclo instalada → retirada → reinstalada ya está modelado y se conserva.
**El retiro lo decide el encargado**: el sistema no lo propone. Por eso **no se
guarda lluvia** y no se implementa el umbral de 150 mm acumulados de la guía.

### Revisión

**Un solo formulario por visita al campo**, porque en la práctica es una sola
visita:

1. **Lectura de broca:** `ninguno` / `pocos` / `algunos` / `muchos`, obligatoria.
2. **Número exacto:** opcional, sólo si alguien contó. Las reglas (§5) trabajan
   con la escala, nunca con el número, para que valgan igual cuando nadie cuenta.
3. **Otros insectos:** si había, y una nota libre para decir cuáles. **No se
   construye un catálogo de especies**: nadie lo mantendría hoy, y la nota con
   la foto conserva el hecho.
4. **Fotos de la tela**, ligadas a esa revisión, no a la trampa.
5. **Mantenimiento hecho:** limpieza, cambio del líquido, recarga del atrayente.
   Tres casillas independientes; ninguna obligatoria.
6. Fecha, quién observó, notas, procedencia y calidad del dato, como todo lo
   demás del sistema.

**Lo que no se hace:** contar brocas por defecto, y convertir la escala en un
número por debajo. Una escala no es un conteo y mezclarlos falsearía cualquier
comparación posterior.

## 5. Reglas del encargado

Decisión del dueño: **las reglas las define el encargado de finca**, y **sólo
ellas mandan** — sin regla configurada no hay aviso ni plazo. El sistema no trae
ningún valor por defecto, ni siquiera el quincenal de la guía de Anacafé.

Una regla dice, para una finca:

- **con qué lectura se dispara** (por ejemplo, `algunos` o peor);
- **en cuántos días hay que volver a revisar** en situación normal y cuando se
  disparó — que es cómo se cumple lo que pidió el dueño: la frecuencia sube
  cuando se ve broca;
- **qué acción sugerir**, como texto («aplicar repelente Bralic», «usar Regin»).

La acción es texto libre a propósito: los productos son de la finca y no existe
todavía un catálogo de productos fitosanitarios. Ese catálogo es **la pieza 3**,
y cuando exista, la regla apuntará a él en vez de a una frase.

**Una regla sugiere; no actúa.** No aplica nada, no crea tareas, no cambia el
estado de la trampa. Es la misma línea que ya sigue el resto del sistema con la
IA y con los avisos del tablero.

## 6. Avisos en el tablero de la parcela

Se suman a los avisos calculados que la pieza 1 ya puso en `/plots/[id]`
(`lib/traceability/pendienteDeLaParcela.ts`), con la misma forma: se calculan al
mostrarlos, no se guardan, y cada uno enlaza a donde se resuelve.

- **Toca hacer:** trampas cuyo plazo de revisión venció según la regla.
- **Toca hacer:** trampas con lectura disparada, con la acción sugerida al lado.

Si la finca no tiene reglas, el tablero **no dice nada de trampas**, igual que
hoy no inventa plazos de muestreo.

## 7. Qué toca construir

| pieza | dónde | nuevo o extensión |
|---|---|---|
| Bloques | modelo, servicio, pantalla | nuevo |
| Escala, otros insectos, mantenimiento, fotos por revisión | `SpecimenObservation` | extensión |
| Numeración por finca | `Specimen` | extensión |
| Reglas de trampa | modelo, servicio, pantalla de ajustes | nuevo |
| Avisos de trampa | `pendienteDeLaParcela` | extensión |
| Pantallas de trampa y revisión | `app/plots/[id]` y ajustes | nuevo |

**Es más grande que la pieza 1**, y conviene que el plan lo parta en dos
entregas que funcionen solas: primero **registrar** (bloques, trampas,
revisiones) y después **avisar** (reglas y avisos). La primera ya sustituye al
chat de WhatsApp, que es el problema que hay que quitar de en medio.

## 8. Lo que este diseño deja fuera, a propósito

- **Lluvia acumulada** y el umbral de 150 mm de la guía: no hay dónde guardar
  lluvia y el retiro lo decide el encargado.
- **Catálogo de productos, dosis, carencia y reentrada**: es la pieza 3.
- **Catálogo de insectos**: nota libre y foto, hasta que alguien pida otra cosa.
- **Bloques para plantas**: se puede hacer después sin rehacer nada.
- **Mapa o coordenadas de la trampa**: el bloque y el número bastan para lo que
  se pidió.

## 9. Sin resolver, para decidir al escribir el plan

- **A qué se pega el correlativo del número de trampa.** «Por finca» es lo
  acordado; queda comprobar en el modelo si la finca es la organización o el
  sitio raíz, y que dos operadores creando trampas a la vez no repitan número.
- **Quién puede crear bloques y reglas.** `specimen:manage` cubre trampas y
  revisiones; una regla de finca se parece más a una decisión de gestión que a
  trabajo de campo, y puede que necesite otro permiso.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
