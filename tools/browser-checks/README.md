# Comprobaciones contra el artefacto vivo

Lo que la suite no puede ver: qué sirve realmente el despliegue de producción.

**Un deploy que dice «success» dice que la subida funcionó, no que la página
funcione.** Y en esta aplicación hay una segunda afirmación que ningún test de
unidad puede hacer: que las rutas privilegiadas **exijan sesión en el edge**, no
solo en el código.

Son **diagnósticos, no CI**: fallan por razones de red y entrenarían a ignorar
una línea roja.

**Se llamaba `rutas-protegidas.mjs` y el nombre era la afirmación.** «Protegida»
más un ✓ verde se leen como una garantía de que los datos están a salvo, y esto
no demuestra eso: la frontera de autorización es el servicio de RBAC
(`SECURITY.md` §2). Esto observa **respuestas** a peticiones anónimas. Se
renombró el 2026-08-28 en `49ae56f` — y este README y el `CLAUDE.md` siguieron
**once días** mandando correr el archivo borrado.

Reglas de diseño:

1. **Corren tal cual, sin instalar nada.** Node 24 trae `fetch`.
2. **Cada fila nombra qué hay debajo del punto medido** — URL final, estado,
   bytes. Si el arnés no actuó, se ve junto al veredicto.
3. **Fila patrón primero.** Si no dice lo que debe, se anula la corrida.

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
node tools/browser-checks/respuesta-anonima.mjs
```

## `indexeddb-sin-almacen.mjs` — la excepción a la regla 1

Mide si la cola offline del apiario puede guardar después de que el teléfono
haya visto `/offline.html` (el defecto del 2026-10-12), en un Chrome de verdad:
un sustituto de IndexedDB escrito a mano probaría lo que uno cree que hace la
semántica de versiones, que es justo lo que estaba mal. **No corre «tal cual»:**
necesita `npm ci` —empaqueta la cola real desde `lib/` con el esbuild que trae
`tsx`— y Chrome en `/Applications` (o `CHROME=<ruta>`). Perfil desechable; no
toca el navegador de nadie.

```bash
npm run build && npx next start -p 3094      # en otra terminal
node tools/browser-checks/indexeddb-sin-almacen.mjs http://localhost:3094
```
