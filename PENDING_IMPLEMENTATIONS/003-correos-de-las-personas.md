# 003 · Correo y acceso para más personas

**Estado:** aplazado. **Bloquea:** P-C.

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
