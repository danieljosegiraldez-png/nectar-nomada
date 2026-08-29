# 005 · Derivar la lista de rutas privilegiadas del router

**Estado:** aplazado. No bloqueado por nadie: es trabajo pendiente.

`tools/browser-checks/rutas-protegidas.mjs` comprueba **ocho** rutas escritas a
mano. Eso demuestra que esas ocho están cubiertas; **no demuestra que el
conjunto de caminos que llegan al estado privilegiado esté completo**.

Lo señaló la revisión independiente de la PR #60: un ✓ sobre una muestra se lee
igual que un ✓ sobre una enumeración, y no dicen lo mismo.

**Qué haría falta:** derivar la lista recorriendo `app/`, clasificando cada ruta
por si su `page.tsx` (o su layout) exige sesión, y comparar esa lista contra lo
que el edge realmente contesta. Las rutas de API cuentan igual que las páginas.

**Por qué está aplazado:** hacerlo bien exige decidir qué es «privilegiado» en
un router con rutas públicas por diseño (`/`, `/login`, `/discover`), grupos y
segmentos dinámicos. Es una tarea con su propio plan, no un añadido al script.

**Mientras tanto** el script dice explícitamente que es una muestra, en su
propia salida, para que nadie lea de más en su ✓.
