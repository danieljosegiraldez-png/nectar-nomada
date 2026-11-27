# 003 · Correo y acceso para más personas

**Estado: CERRADA como decisión el 2026-09-04 (ADR-107, «Los correos de las personas se dan por
función, no por jerarquía»), y retirada del índice el 2026-10-16.** Lo que la bloqueaba era P-C, y P-C
está cerrada: `bash scripts/open-decisions.sh` la cuenta entre las cerradas porque exige justo ese
encabezado de ADR. **Esta línea decía «aplazado · Bloquea: P-C»**: era cierta cuando nació la ficha,
el 2026-08-28, y dejó de serlo con el ADR-107. El 2026-09-06 se le pusieron al día las cifras de abajo
y no la cabecera, que siguió así seis semanas.

**Lo que queda no es trabajo ni decisión, es un dato que falta:** los Huerbsch todavía no han dado
sus correos —el ADR-107 lo dice así: «se preguntó, y falta el dato»—. Cuando lleguen, darlos de alta
no reabre nada; la herramienta está abajo. Lo que sigue es la ficha tal como se escribió, y sus cifras
son del 2026-09-06.

**Estado original:** aplazado. **Bloquea:** P-C.

**La mayoría de las personas en la base no tienen correo.** Medido contra
producción el 2026-09-06 con `npm run people:set-email` (sin argumentos lista a
quién le falta):

- **17 personas reales.** Sólo **Daniel** puede entrar hoy.
- **Nathy Rubio** (`nathyzru@gmail.com`) y **José Giráldez**
  (`jose@craftbrewingsupply.com`) **ya tienen correo** y están en `invited`.
- **13 no tienen ninguno.** Las dos con más trabajo asignado son **Bob y Sherry
  Huerbsch, con 10 asignaciones activas cada una** — 20 que hoy no alcanzan a
  nadie.
- Cuatro no tienen ni cuenta de usuario, donde un correo por sí solo no sirve.

**Corrección importante: esto ya no va de contraseñas.** Desde ADR-083 poner el
correo suele ser todo el trabajo — verificado en `lib/auth/config.ts`: sólo casa
un correo de Google **verificado** (líneas 120-121) y una cuenta `invited` que
casa pasa a `active` sola (182-187). La contraseña sólo hace falta donde Google
no sea una opción, como quizá el dominio propio de José.

**Por qué está aplazado:** quién recibe acceso a un sistema con el registro de
investigación no lo decide el sistema. Es de Daniel.

**Qué lo desbloquearía:** que Daniel diga qué personas reciben correo y con qué
rol, y que quede como ADR con la frase «correos de las personas» — que es lo que
lee la prueba de P-C.

**La herramienta ya existe:** `npm run people:set-email`, y después
`npm run auth:set-password -- <correo>`, que **pide la contraseña con eco
apagado y se niega a recibirla como argumento** — un argumento sobrevive en el
historial del shell y en la lista de procesos. Necesita una TTY real.

**Lo que no se hace:** crear una Persona nueva por «sign-up» para alguien que ya
existe. Esas personas ya tienen Assignments colgando, y §2 prohíbe duplicar
personas canónicas.
