# 003 · Correo y acceso para más personas

**Estado:** aplazado. **Bloquea:** P-C.

**La mayoría de las personas en la base no tienen correo**, así que no se les
puede poner contraseña. Hoy solo Daniel y José tienen uno.

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
