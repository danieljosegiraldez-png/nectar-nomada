# Ideas aplazadas

Toda idea diferida vive aquí **con su razón y con qué la desbloquearía**. Esto
impide que la misma propuesta se vuelva a litigar cada sesión, y que una buena
idea se pierda cuando la respuesta es «ahora no».

«Ahora no» va aquí. «Nunca» va a `SESSION_STATE.md` §4, que es otra cosa.

| # | Idea | Bloqueada por |
|---|------|---------------|
| [002](002-reconciliacion-de-medios-r2.md) | Reconciliar `core.asset` con el bucket R2 | Todavía no hay fotos reales |
| [003](003-correos-de-las-personas.md) | Correo y acceso para más personas | P-C · decisión del dueño |
| [005](005-enumerar-rutas-privilegiadas.md) | Probar la frontera de RBAC, no sólo el router | Nada — trabajo pendiente |
| [006](006-sin-ci-en-este-repositorio.md) | CI: qué cubre hoy y qué no | Parcialmente hecho · lo que falta necesita base efímera |
| [023](023-el-audit-no-lleva-el-sujeto-de-negocio.md) | Una fila de `core.audit_event` no dice de qué **lote** habla | Decisión de Daniel · ver la ficha |

Hecho y retirado de esta lista: **004 · apuntar `nectarnomada.com` al sitio
público**, resuelto el 2026-08-28, y **008 · un test hermético nuevo no corre en
CI**, resuelto el 2026-09-06 en el PR #177. Los dos están en
`docs/SESSION_STATE_ARCHIVE.md` — **esta línea decía «en `SESSION_STATE.md` §2» y
ese puntero ya estaba muerto**: las entradas de §2 se archivan, y las de agosto
llevan semanas fuera. Es la misma forma que `scripts/check-archivo-de-estado.mjs`
vigila dentro del estado, y que no vigila aquí.
Y **012 · pruebas que ven toda la base y afirman sobre una lista con
tope**, cerrado el 2026-09-18 en el PR #402 y en el del buscador de muestras de cata. Y **013 · las clases que `friendlyError` relanzaba**, hecho el 2026-09-21 en el PR #450.
Y **020 · corregir una lectura de ambiente no tiene pantalla**, hecho el 2026-10-01 en el PR #583,
el mismo día en que se encontró recorriendo la pantalla en un navegador.
Sus fichas siguen en la carpeta con el estado escrito arriba del todo.
Y **025 · el verificador de backup decía «no restauró» cuando lo que no pudo fue contar**, hecha
el 2026-10-06 — y su diagnóstico original era más flojo que la realidad: el fallo estaba **dentro
de la rama PASS**, después de que el `diff` ya hubiera probado la copia idéntica. Lo peor que
puede hacer una alarma es gritar sobre algo que acaba de salir bien.
Y **009 · el único lector de `AuditEvent` no puede acertar**, cerrada el 2026-10-05 — **y su
cierre anterior, del 2026-10-03, era falso con las tres comprobaciones en verde**: las tres
miraban artefactos (existe el lector, no existe el comentario, existe el guardia) y ninguna
llamaba a la función para contar filas. El panel seguía vacío en los 108 lotes. Está en su
ficha, y es la razón de que la **023** nazca como decisión y no como tarea.

**Y tres que seguían en la tabla estando cerradas, retiradas el 2026-10-11.** Cada una se
comprobó contra el árbol, no contra su fila:

- **001 · aviso cuando un backup no corre.** P-A cerrada: `bash scripts/open-decisions.sh` la da
  cerrada, y su prueba exige las dos mitades (el `ping_health` de `run-scheduled.sh` y la URL
  configurada fuera del repositorio).
- **007 · el inventario lee texto.** Su propia cabecera decía «CERRADA», en el #639 del 2026-10-04.
- **024 · la cosecha no registra quién la operó.** Hecha el 2026-10-06: la acción manda el campo,
  con `tests/traceability/cosechaConOperario.test.ts`. La otra mitad, el campo en el formulario, no
  se hará porque el formulario ya no existe. Su cabecera seguía diciendo «sin construir».

Una fila de esta tabla que se queda atrás manda a hacer trabajo ya hecho: la 024 se ofreció como
«la siguiente» ese mismo día.
