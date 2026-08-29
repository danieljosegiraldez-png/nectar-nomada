# Inventario de rutas privilegiadas, derivado del router · 2026-08-28

Cierra `PENDING_IMPLEMENTATIONS/005`. Lo levantó la revisión independiente de la
PR #60: `tools/browser-checks/rutas-protegidas.mjs` comprueba **ocho rutas
escritas a mano**, y «un ✓ sobre una muestra se lee igual que un ✓ sobre una
enumeración, y no dicen lo mismo».

## Para qué es

Que nadie pueda añadir una página nueva y dejarla sin gatear **sin que algo lo
diga**. Hoy no hay nada que lo note: la lista de rutas a comprobar la escribí yo
a mano, así que sólo cubre lo que ya se me ocurrió mirar.

## Lo que este plan NO afirma

**El redirect a `/login` no es la frontera de autorización.** `proxy.ts` lo dice
en su propio comentario y `SECURITY.md` §2 lo dice como norma: la frontera es el
servicio único de autorización que atraviesa toda lectura o escritura de datos
gobernados por RBAC. `CLAUDE.md` §56: «never rely exclusively on hidden UI
elements for authorization».

Así que esto **no** demuestra que los datos estén protegidos. Demuestra dos
cosas más modestas y comprobables:

1. Que toda página del router está **clasificada** — pública a propósito, o
   gateada — y que no queda ninguna sin clasificar.
2. Que lo que el edge contesta a un anónimo **coincide** con esa clasificación.

Un fallo aquí no es necesariamente una brecha; es una discrepancia entre lo
declarado y lo servido, que es justo lo que nadie está mirando.

## El terreno, medido hoy (no supuesto)

- `proxy.ts` sólo protege `/my-nectar` (`matcher: ["/my-nectar/:path*"]`). Las
  otras redirecciones a `/login` que se observan en producción vienen de las
  **páginas**, no del middleware.
- **47 `page.tsx`**. 38 contienen una señal de gateo
  (`redirect("/login")`, `getCurrentUser`, `requirePermission`,
  `permissionKeysAnywhere`); **9 no**, y son exactamente las públicas por
  diseño: `/`, `/discover`, `/login`, `/signup`, y los detalles públicos
  `/products/[slug]`, `/projects/[slug]`, `/experiences/[slug]`,
  `/stories/[slug]`, `/locations/[slug]`.
- **3 `route.ts`**: `/api/export` (comprueba sesión), `/api/auth/[...nextauth]`
  (es el propio flujo de auth) y `/api/webhooks/stripe` (se autentica por
  **firma**, no por sesión — clasificarlo como «sin gateo» sería un falso
  positivo).
- **15 archivos en `app/actions/`**, 14 con comprobación de permiso. El que
  falta es `app/actions/auth.ts` — `signUpAction`, `loginAction` y
  `logoutAction`. **Mirado a mano: no es un defecto.** Son los puntos de entrada
  *previos* a la sesión; exigirles un permiso sería imposible de satisfacer.
  Queda escrito aquí para que ninguna sesión futura lo vuelva a levantar como
  hallazgo.

## Cómo sabremos que funcionó

Criterios comprobables, en orden de importancia:

1. **Exhaustividad.** El inventario deriva de recorrer `app/`, y falla si
   aparece una página que no está ni en la lista pública ni clasificada como
   gateada. Prueba: crear `app/zzz-prueba/page.tsx` sin gateo → el guardia
   falla nombrándola. Borrarla → vuelve a pasar.
2. **La lista pública es explícita y corta.** Vive en el repositorio, con una
   línea por ruta diciendo por qué es pública. Añadir una ruta pública es un
   acto deliberado y visible en el diff, no un efecto secundario.
3. **El chequeo en vivo consume el inventario**, no una lista escrita a mano, y
   dice en su salida cuántas rutas cubre **de cuántas existen**.
4. **Los parámetros dinámicos no se inventan.** Una ruta `[slug]` no se puede
   pedir sin un valor real; el inventario la marca como «no comprobable en
   vivo» en vez de fabricar un slug y leer un 404 como si fuera un veredicto.
5. **Flip-test del guardia**: quitar el gateo de una página gateada existente
   hace fallar la comprobación estática. Si no falla, el guardia no sirve.

## Qué toca

- Nuevo: `scripts/inventario-de-rutas.mjs` — recorre `app/`, clasifica, emite
  el inventario y falla ante lo no clasificado.
- Nuevo: `tests/inventario-de-rutas.test.ts` — con los fixtures negativos de los
  criterios 1 y 5.
- Modificado: `tools/browser-checks/rutas-protegidas.mjs` — consume el
  inventario; deja de llevar ocho rutas a mano.
- Modificado: `PENDING_IMPLEMENTATIONS/005` → retirado por cumplido.

## Riesgos, y el coste si me equivoco

- **Clasificar por grep es frágil.** Una página puede gatear llamando a un
  helper que no coincide con el patrón, y saldría como «sin gatear».
  *Coste si me equivoco:* ruido que entrena a ignorar el guardia — peor que no
  tenerlo. *Mitigación:* la lista de patrones vive junto al inventario y
  cualquier página no clasificada **para la corrida** en vez de adivinar.
- **Un ✓ que se lea como «los datos están protegidos».** *Coste:* falsa
  confianza sobre la frontera real, que es RBAC. *Mitigación:* el script lo dice
  en su propia salida, como ya hace `rutas-protegidas.mjs` con «es una muestra».
- **Rutas dinámicas.** *Coste:* fabricar un slug produce un 404 que se leería
  como «protegida». *Mitigación:* criterio 4 — se marcan como no comprobables.

## Revisión — hallazgos y adjudicación

Codex revisó este plan **antes de escribir código** (compuerta 2), en sesión
nueva y sandbox de solo lectura. Nueve hallazgos. Su veredicto: *«ejecutarlo
ahora produciría un guardia útil para disciplina de archivos, pero demasiado
fácil de interpretar como control de seguridad»*. **Lo acepto casi entero: el
plan se reescribe, no se ejecuta como estaba.**

| # | Hallazgo | Veredicto | Razón | Coste si me equivoco |
|---|----------|-----------|-------|----------------------|
| 1 | El grep mide «presencia de una señal conocida», no «página gateada» | **ACEPTADO** | Es la misma familia de defecto que la prueba que encontró su propio texto en la revisión anterior. Un clasificador que reconoce su vocabulario no reconoce la pérdida del control | Si me equivoco, gasto una declaración explícita que no hacía falta |
| 2 | No puede demostrar coincidencia con el edge para todo el inventario: 5 de las 9 públicas son dinámicas | **ACEPTADO** | Cierto y comprobado | — |
| 3 | La superficie inventariada no cubre la norma de `SECURITY.md` (layouts, acciones colocadas, `generateMetadata`, otros routers) | **ACEPTADO EN PRINCIPIO, MEDIDO COMO VACÍO HOY** | Medido en el repositorio: **0** archivos `"use server"` fuera de `app/actions/`, **0** route groups, parallel o intercepting routes, **0** `generateMetadata`, y no existe Pages Router. La preocupación es correcta y hoy no tiene contenido | Que aparezca una de esas superficies y el inventario calle. **Mitigación:** el guardia falla si aparece cualquiera de ellas |
| 4 | El ✓ y el nombre «rutas-protegidas» se leerán como garantía de protección, pese a la advertencia | **ACEPTADO** | La modestia en prosa no sobrevive a un ✓ verde. El nombre es la afirmación | — |
| 5 | El grep también produce falsos **positivos**; y el flip-test del criterio 5 es circular | **ACEPTADO** | Quitar la cadena que el grep busca comprueba el grep, no el control. Circular | — |
| 6 | «Pública» se adjudica sin fuente normativa: las nueve las clasifiqué yo | **ACEPTADO** | Es cierto: lo inferí de sus nombres y de que no gatean | Marcar como pública una página que sí lee datos gobernados |
| 7 | Varios criterios no son falsables («corta», «a propósito»); el 5 es circular | **ACEPTADO** | — | — |
| 8 | Falta una tabla de respuestas aceptables por categoría (302/307/401/403/404) | **ACEPTADO** | El comprobador actual acepta 404 como «protegida», que es laxo: un 404 puede significar «no existe» | Leer un fallo de despliegue como una protección |
| 9 | Parte del trabajo no justifica su coste; inferir autorización por patrones sería un segundo sistema informal de autorización | **ACEPTADO** | Es la razón principal para reducir el alcance | — |

### Lo que el plan pasa a ser

De «inventario de rutas privilegiadas» a **control de higiene del router**:

1. **La clasificación se declara, no se infiere.** Un manifiesto en el
   repositorio con una línea por ruta y su intención. El análisis estático se
   queda sólo como **contraste**: si el manifiesto y el código discrepan, falla
   nombrando ambas cosas. Nunca clasifica él.
2. **Sin ✓ global y sin la palabra «protegida».** Categorías separadas:
   `declarada pública`, `declara requisito de sesión`, `respuesta anónima
   observada`, `sin prueba dinámica`, `no clasificada`.
3. **Totales honestos:** «47 inventariadas / N probadas en vivo / M no
   probables», en la salida.
4. **Tabla de respuestas aceptables** por categoría, con el 404 tratado como
   ambiguo y no como éxito.
5. **Fixture no circular:** una página que conserva la cadena señuelo y pierde
   el control efectivo. Si el guardia la deja pasar, el guardia no sirve.
6. **Tripwire de superficies:** falla si aparece `"use server"` fuera de
   `app/actions/`, un directorio `pages/`, un route group o `generateMetadata`.
7. **`PENDING_IMPLEMENTATIONS/005` sigue abierto.** Esto no prueba la propiedad
   que ese pendiente pide; se anota qué sí prueba y qué no.

**No ejecuto todavía.** El alcance cambió materialmente respecto de lo que
Daniel aprobó («enumerar las rutas privilegiadas»), y construir algo distinto y
más pequeño es decisión suya, no mía.

---

## Compuerta 5 — revisión del trabajo terminado

**Veredicto de Codex: NO PASA.** Tres defectos de coste alto, todos reales y
comprobados antes de tocar nada:

| # | Hallazgo | Veredicto | Qué se hizo |
|---|----------|-----------|-------------|
| 1 | Sólo reconocía `page.tsx`/`route.ts`: un `page.js` sería una ruta viva e invisible, y con `allowJs: false` ni `tsc` la vería | **CONFIRMADO** | Reconoce las extensiones válidas y **para la corrida** ante cualquier `page.*`/`route.*` desconocida. Dos fixtures |
| 2 | El 404 se contaba como ambiguo pero la corrida salía 0 | **CONFIRMADO** | Sale distinto de cero. Flip-testeado contra un manifiesto que declara una ruta inexistente: salida 1 |
| 3 | El tripwire de `"use server"` sólo miraba dentro de `app/` | **CONFIRMADO** | Recorre el repositorio entero menos `node_modules`, `.next`, `generated`; con comentarios quitados |
| 4 | El contraste puede ponerse verde con contradicciones reales (rama muerta, `redirect` incondicional, lectura por otro helper) | **ACEPTADO como límite** | Se amplía la lista de límites escritos. **No se resuelve**: resolverlo es el ayudante obligatorio de 005, no un grep mejor |
| 5 | «cada consulta filtra `PUBLIC_WHERE`» es más fuerte que lo observado: las relaciones incluidas no se comprobaron | **CONFIRMADO** | El manifiesto lo dice ahora explícitamente |
| 6 | «sólo traducciones» es literalmente falso para `/login` y `/signup`, y no es fuente normativa | **CONFIRMADO** | Las razones pasan a «GET sin lectura de datos observada», con fecha |
| 7 | `razon` no se validaba; `CLASES_PUBLICAS` se exportaba sin uso; faltaban flip-tests | **CONFIRMADO** | Se valida la razón, se borra la lista duplicada, y hay flip-test para los cuatro tripwires |
| 8 | `pages/` sólo miraba la raíz | **CONFIRMADO** | También `src/pages` y `src/app` |
| 9 | «el código no contradice lo declarado» excede un contraste léxico | **CONFIRMADO** | La salida dice ahora «no se detectaron las contradicciones textuales conocidas» |

Los tests pasan de 7 a 12. Ninguna corrección amplía lo que el control afirma:
todas lo estrechan o lo hacen fallar donde antes callaba.
