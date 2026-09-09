# Una respuesta 2xx que no es JSON debe decir qué llegó, no reventar el parseo

**De dónde sale.** Midiendo el artefacto vivo el 2026-09-09: **un POST a
cualquier ruta inexistente contesta 200 con la página HTML de not-found**,
mientras un GET a la misma ruta contesta 404. No es de `/api/`: es de todo el
sitio, y no se arregla desde este repositorio.

**Lo que NO pasa, comprobado antes de escribir esto.** La sospecha era que un
200 falso hiciera que la cola offline descartara trabajo en silencio. **Es
falsa**, en los tres sitios:

- `ensureDeviceId()` y `syncFieldEvents()` hacen `await res.json()` sobre el
  HTML, que **lanza antes** de tocar ningún borrador; no hay `try/catch`, así
  que el throw sale al llamante y la cola queda intacta.
- `apiary/syncAll()` lo hace dentro de un `try { … } catch { /* dejar en cola */ }`
  deliberado, así que también cae del lado seguro.

Así que esto **no arregla una pérdida de datos**: no la hay. Arregla el
diagnóstico, que es lo que de verdad cuesta tiempo cuando pasa.

## El coste real

`clasificarRespuesta(200)` devuelve «aplicar», y lo siguiente es un
`await res.json()` sobre `text/html`. Lo que ve quien depura:

    SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

que no nombra ni la ruta, ni el estado, ni lo que llegó. Es exactamente lo que
la cabecera de `ensureDeviceId` ya se reprocha de otro fallo: «sin que nadie
entendiera por qué».

## Cómo

Un ayudante en `lib/sync/offlineQueue.ts`, junto a `clasificarRespuesta`, que ya
existe para decidir sobre una respuesta:

```ts
export async function leerJson<T>(res: Response, contexto: string): Promise<T>
```

Si el `content-type` no es JSON, lanza nombrando **contexto, estado y tipo
recibido**. Se usa en los dos sitios de `lib/sync/` donde el throw sale al
llamante y alguien lo va a leer.

**No se toca `lib/apiary/offlineQueue.ts`.** Su `catch` es ciego a propósito, así
que un mensaje mejor ahí no lo ve nadie: sería tocar un archivo sin que cambie
nada observable.

## Cómo sabremos que funcionó

1. Test del ayudante: una respuesta `200 text/html` lanza un error que **nombra
   `text/html` y el 200**; una `200 application/json` devuelve el objeto.
2. **Flip-test**: sin el ayudante, el error es un `SyntaxError` de parseo que no
   nombra ninguna de las dos cosas. Se comprueba que el test distingue —si
   pasara con y sin el cambio, no probaría nada.
3. `npm run verify` en verde y la suite hermética en verde.

## Lo que NO hace

- No cambia ningún flujo: los mismos casos siguen lanzando, y la cola sigue
  quedándose intacta. Sólo cambia el texto del error.
- No toca el comportamiento del sitio ante un POST a ruta inexistente: eso es de
  Next y no se arregla aquí.
