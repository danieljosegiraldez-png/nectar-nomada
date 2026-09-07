# Sacar los registros de entrega de §3 «Bloqueado»

**Para qué.** `SESSION_STATE.md` está al **100 % del presupuesto de líneas**
(399/400, ~8855 tokens, medido en `origin/main` el 2026-09-07). Pasado el techo
de una lectura, el archivo se devuelve **truncado y con éxito**: dos tercios del
estado dejan de llegar a las sesiones y nada lo dice.

**Dónde está el peso, medido.** No en la prosa de §2, que es lo que sugiere el
guardia: en **§3, 263 de 399 líneas (66 %)**. Y de esas, **132 son registros de
entrega ya cerrados** —dos incluso tachados— dentro de una sección llamada
«Bloqueado». El guardia no puede proponerlo porque sólo sabe mover secciones
`### fecha`, y los bloqueos no lo son.

**Precedente del propio archivo**, dos veces: «el detalle se archivó en
`docs/SESSION_STATE_ARCHIVE.md` porque era registro de entrega dentro de una
sección llamada "Bloqueado"». Esto es la tercera, hecha entera en vez de por
partes.

## Las 13 entradas, con sus líneas

| línea | nº | entrada | cola que se QUEDA en §3 |
|---|---|---|---|
| 147 | 15 | ~~compuerta obligatoria para fusionar~~ — cerrado 09-05 | la config viva: checks exigidos, `enforce_admins: false` a propósito |
| 181 | 12 | CI corría 22 de 97; ahora 94 de 100 | «el job aún no es obligatorio» |
| 193 | 11 | Quinta lente: el doble toque | — |
| 204 | 21 | Idempotencia de envíos, cerrada | «lo que NO cubre»: nadie barre claves de cuentas que dejan de escribir |
| 225 | 15 | El tueste ya tiene pantalla | «no lo ha abierto nadie en un navegador» |
| 253 | 9 | Ya se puede crear un protocolo de cata | «falta correrlo: escribe en producción» |
| 269 | 7 | El tueste ya es una variable | — |
| 276 | 4 | `sensory:archive-protocol` | — |
| 280 | 5 | Nadie podía crear una sesión de cata | — |
| 285 | 8 | Ya se puede crear una sesión de cata | — |
| 293 | 9 | Una cata ya es de varios | — |
| 308 | 7 | ~~Dos carreras en jornadas de campo~~ — cerradas 08-31 | — |
| 315 | 9 | ~~Escritura y auditoría no atómicas~~ — cerrado 09-06/07 | — |

**132 líneas fuera, ~12 de cola que se quedan → §3 pasa de 263 a ~143, el
archivo de 399 a ~279 (70 % del presupuesto).**

## Lo que NO se toca

- Las 19 entradas de §3 que son bloqueos de verdad: decisiones del dueño, datos
  que faltan, cosas sin construir.
- §1, §4 y §5.
- §2: el guardia sugiere archivar una de sus dos entradas fechadas. **No se
  hace**: §2 es la única señal de trabajo reciente que ve una sesión nueva, y
  con este plan sobra presupuesto sin tocarla.

## Cómo sabremos que funcionó

1. `node scripts/check-state-budget.mjs` sale 0 **y sin aviso de porcentaje**.
2. **Conservación:** cada una de las 13 entradas aparece **literal** en
   `docs/SESSION_STATE_ARCHIVE.md`. Control negativo: la misma búsqueda contra
   el archivo ANTES del cambio debe dar 0 de 13, o la comprobación no mide.
3. Cada cola de la cuarta columna sigue presente en §3.
4. `bash scripts/open-decisions.sh` sigue dando el mismo veredicto que antes
   (5 cerradas, 0 abiertas) — el cambio no toca decisiones.

## Riesgo, y qué lo acota

Perder un hecho vivo enterrado en un registro de entrega. Lo acota la columna
«cola que se queda» —escrita entrada por entrada, no por regla— y el control de
conservación: nada se borra, todo se mueve.
