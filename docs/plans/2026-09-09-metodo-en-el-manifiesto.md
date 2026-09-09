# El manifiesto declara el método, y el comprobador deja de alarmar en falso

**Para qué.** `tools/browser-checks/respuesta-anonima.mjs` marca **CONTRADICE**
sobre tres rutas de autorización, y es falso. Las tres son sólo-`POST`; el guion
hace GET anónimos, así que **nunca ejerce el método que esas rutas tienen** y no
puede saber nada de su autorización. Devolver un veredicto rojo sobre algo que
no se midió es peor que el silencio, y aquí alarma justo sobre lo que la
herramienta existe para tranquilizar.

**No hay hueco de autorización.** Las tres exportan sólo `POST`, y ese `POST`
resuelve el principal y devuelve 401 **antes de leer el cuerpo**. El 405 lo pone
Next al no existir handler `GET`: ninguna línea del handler llega a correr.

**La correspondencia es exacta**, medida el 2026-09-09: de 55 rutas declaradas
`requiere-sesion`, **3 no tienen handler `GET`** —`/api/v1/devices`,
`/api/v1/sync/field-events`, `/api/v1/sync/field-media`— y **las 3 CONTRADICE de
la corrida son exactamente ésas**. Sin residuo por ningún lado. Control por el
otro lado: `/api/export`, que sí acepta GET, contesta 401 como se espera.

## Cómo

1. **`scripts/rutas-declaradas.mjs`**: campo **opcional** `metodos` en esas tres.
   Ausente significa «un GET anónimo es significativo aquí», que es el caso de
   las otras 52 y por eso no se tocan.
2. **`tools/browser-checks/respuesta-anonima.mjs`**: si la ruta declara métodos
   y `GET` no está entre ellos, **no se pide y no se juzga**. Sale como «no se
   pronuncia — sólo acepta POST», junto a las 30 dinámicas que ya salen así.
3. **El guardia que evita crear un punto ciego nuevo.** Declarar «sólo POST» y
   que mañana alguien añada un `GET` dejaría esa ruta sin comprobar **en
   silencio**, que es el defecto que este PR viene a quitar, un nivel más
   arriba. Así que `scripts/inventario-de-rutas.mjs` comprueba que `metodos`
   casa con los `export async function` del `route.ts`, y falla nombrando la
   ruta si divergen.

## Que no afecte a otras sesiones — la restricción principal

`rutas-declaradas.mjs` lo consumen `inventario-de-rutas.mjs` —que corre
`npm run check:rutas`, **dentro de `npm run verify`, la compuerta de todas las
sesiones**— y el comprobador. Un cambio incompatible pondría en rojo el trabajo
de todos.

El campo es **aditivo**: el inventario valida sólo `clase` y `razon`, y no
rechaza claves desconocidas. Eso está leído en el código y **se demuestra
ejecutando**, que es lo que cuenta:

- `npm run check:rutas` verde **antes y después** del cambio del manifiesto.
- `npm run verify` completo verde.
- `tests/inventario-de-rutas.test.ts` verde — corre en `ci.sh`, no está excluido.

Y nada fuera del worktree: no se toca el checkout compartido ni ningún otro
worktree.

## Cómo sabremos que funcionó

1. La corrida deja de decir CONTRADICE en las tres y dice que no se pronuncia,
   **nombrando el método**: una fila que no dice qué midió es la que se quiere
   quitar.
2. Las otras 52 rutas siguen dando el mismo veredicto que antes. Se compara la
   salida completa contra la de hoy, no sólo el conteo.
3. **Flip-test del guardia nuevo**: añadir un `export async function GET` de
   mentira a una de las tres en una copia, y comprobar que `check:rutas` **se
   pone rojo y nombra esa ruta**. Sin eso, el guardia es un adorno.
4. `npm run verify` en verde.

## Lo que NO hace

- No manda un `POST` anónimo a producción. Devolvería 401 antes de tocar nada
  —el código lo demuestra— pero es un intento de escritura contra el artefacto
  vivo y esa es decisión del dueño.
- No cambia ninguna ruta ni ninguna comprobación de autorización: no hay nada
  roto ahí.
