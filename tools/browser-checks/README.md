# Comprobaciones contra el artefacto vivo

Lo que la suite no puede ver: qué sirve realmente el despliegue de producción.

**Un deploy que dice «success» dice que la subida funcionó, no que la página
funcione.** Y en esta aplicación hay una segunda afirmación que ningún test de
unidad puede hacer: que las rutas privilegiadas **exijan sesión en el edge**, no
solo en el código.

Son **diagnósticos, no CI**: fallan por razones de red y entrenarían a ignorar
una línea roja.

Reglas de diseño:

1. **Corren tal cual, sin instalar nada.** Node 24 trae `fetch`.
2. **Cada fila nombra qué hay debajo del punto medido** — URL final, estado,
   bytes. Si el arnés no actuó, se ve junto al veredicto.
3. **Fila patrón primero.** Si no dice lo que debe, se anula la corrida.

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
node tools/browser-checks/rutas-protegidas.mjs
```
