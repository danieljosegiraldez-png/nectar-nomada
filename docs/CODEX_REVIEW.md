# El segundo asiento — Codex como revisor y equipo rojo

El binario **no está en el PATH**:

```bash
CODEX=/Applications/ChatGPT.app/Contents/Resources/codex
```

Verificado el 2026-08-28: `codex-cli 0.150.0-alpha.12.2`, `codex login status`
responde «Logged in using ChatGPT».

**`codex login status` escribe ese mensaje en stderr, no en stdout.** Una
comprobación con `codex login status | grep -qi "logged in"` falla siempre y
declara «no autenticado» un CLI que sí lo está — que es exactamente cómo un CLI
se queda marcado como no autenticado durante semanas. Hay que fusionar:

```bash
"$CODEX" login status 2>&1 | grep -qi "logged in"
``` Si algún día esta afirmación se vuelve falsa,
**corregirla aquí** — una instrucción vieja se actúa cada sesión, y ya pasó que
un CLI quedara marcado como no autenticado durante semanas después de que alguien
iniciara sesión: todas las sesiones evitaron una herramienta que funcionaba.

## Cuándo convocarlo

- Antes de desplegar cualquier cambio no trivial (compuertas 2 y 5 de
  `docs/plans/README.md`).
- **Antes de actuar sobre el arreglo de un bug que ya sobrevivió a un arreglo
  fallido.**

Pedirle que **desafíe la hipótesis, no que la confirme**. Sus encuadres
independientes han valido más que sus listas de defectos.

## Empaquetar, nunca dejar rastrear

```bash
PACK=$(bash tools/pack-for-review.sh origin/main..HEAD)
"$CODEX" exec -s read-only -C "$PWD" - < <(cat docs/CODEX_REVIEW.brief.md "$PACK")
rm -f "$PACK"      # un paquete viejo desorienta
```

Dejar que rastree el repo colgó 50 minutos y produjo dos frases; la misma
revisión desde un paquete tardó menos de cuatro.

**El contenido del paquete es una regla, no una elección.** Un paquete curado a
criterio codifica el marco del que lo arma, y el revisor hereda su punto ciego.
Por eso lo arma un script: diff completo del rango (nunca extractos), texto
actual completo de cada archivo tocado, un salto de imports, mensajes de commit,
medidas y estado de git.

**Nunca comprimir quitando cuerpos.** Un paquete sin cuerpos borró en silencio
las dos constantes de las que trataba la revisión. Se comprime por selección.

**Se comprime acotando el RANGO, no el contenido.** Medido el 2026-08-31: el
paquete de las doce PR del día salía en **48.000 líneas** —incluye el cuerpo
entero de cada archivo tocado, que es la regla de arriba— y acotarlo al núcleo
lógico lo dejó en **2.958** y en una sola pasada. Un rango grande no se revisa
mejor por ser grande; se revisa peor, o no se revisa.

**El alcance decide la herramienta.** Un paquete de diff sirve para revisar *un
cambio*. Para «dónde está el bug, ubicación desconocida», dejarlo buscar, con
presupuesto de tiempo.

## El coste de delegar son las lecturas, y tus propios docs son la mayor

Medido sobre 12 sesiones reales, lo que más leyó un revisor fue **orientación, no
el código bajo revisión**: archivos de skill 30×, notas 28×, el archivo de estado
18×, contra 13× el módulo revisado. Siete a uno del lado equivocado, y se vuelve
a pagar en cada arranque en frío.

Por eso: **citar las cláusulas que importan en línea en vez de nombrar el
documento**, dar rutas con rangos de líneas, y darle el estado de git.

**Auditar lo que el revisor carga incondicionalmente antes de optimizar nada
más.** Auditado el 2026-08-28: no existe `~/.codex/AGENTS.md` ni `AGENTS.md` en
ninguno de los dos repos, así que hoy Codex no arrastra nada. **No crear uno
gordo — y en este repositorio menos: `CLAUDE.md` ya son 34 KB, y un `AGENTS.md`
que lo cite lo convertiría en lectura obligatoria de cada revisión.** El nuestro llegó a ordenar leer 74 KB de documentos antes de responder,
y obedecía.

## Reglas de sesión

- **Nunca un solo asiento como autor y revisor del mismo artefacto.** Sesión
  nueva siempre que el revisor haya escrito el plan que se revisa.
- **Planificar y ejecutar son sesiones distintas.** El sandbox de una sesión
  queda fijado al arrancar y un `resume` lo hereda: una sesión de planificación
  en solo-lectura, reanudada para ejecutar, vio su parche rechazado y **reportó
  éxito sin haber cambiado nada**. Comprobar con `git diff`, no con su línea de
  estado.
- **Checkpointear los hilos largos.** Reanudar reenvía toda la conversación en
  cada turno. Dos hilos medidos el mismo día: 18,2 M tokens sobre 456 K nuevos, y
  9,28 M sobre 1,07 M — cerca del 97 % de contexto reenviado. Reanudar solo para
  seguimientos cortos; en un hito, que escriba su estado (decisiones, preguntas
  abiertas, qué verificó) en un archivo del repo, cerrar el hilo y despachar la
  fase siguiente en frío desde ahí. **Nunca checkpointear a mitad de una
  adjudicación**: el veredicto pertenece al hilo que tiene su evidencia.

## Qué exigirle en cada respuesta

1. Marcar cada afirmación como **VERIFICADO** o **ASUMIDO**.
2. Listar **«qué no me mostró el brief»**.
3. **Declarar su propio encuadre antes de engancharse con el tuyo.**

## Un brief con forma de seguridad se rechaza, y el rechazo parece un crash

Dos despachos murieron con solo `status: failed`; la razón real estaba en el log
del trabajo — un clasificador de ciberseguridad. Los briefs pedían encontrar cómo
obtener un producto de pago sin pagar y **pegaban un exploit funcional en línea**.

Encuadrar ese trabajo como **revisión de corrección de autorización**: ¿la regla
que el código declara es la que hace cumplir, y está completo el conjunto de
caminos que llegan al estado privilegiado? Decir que es el producto del propio
dueño y que el trabajo es defensivo, y **no incluir el exploit**.

**Leer el log, no solo el estado**: un rechazo de política y un crash son
indistinguibles desde un campo de estado y piden respuestas opuestas.
**Dos crashes seguidos sobre el mismo tema son una señal, no mala suerte** —
diagnosticar antes de volver a despachar.

## Cuota

La cuota es **compartida por todos los proyectos de la cuenta**. Comprobarla
antes de un abanico grande, no después. Y **nunca creer el conteo de tokens que
un modelo declara de sí mismo** — uno reportó 68.561 para una corrida que su
propio registro de sesión puso en 411.345.
