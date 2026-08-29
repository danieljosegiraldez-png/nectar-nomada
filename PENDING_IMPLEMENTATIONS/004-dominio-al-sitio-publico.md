# 004 · Apuntar `nectarnomada.com` al sitio público

**Estado:** aplazado. **Bloquea:** P-B. Es la misma decisión que D-H en
`~/Developer/nectarnomada-web`, vista desde este lado.

**Lo comprobado el 2026-08-28:** `https://www.nectarnomada.com` sirve **este
OS**, no el sitio editorial. Tres confirmaciones independientes: `/login`,
`/signup` y `/discover` responden 200 en el dominio; el hash del chunk de CSS
coincide con `nectar-nomada-package.vercel.app`; y el sitio público responde
correcto y completo en `https://nectarnomada-web.vercel.app`.

**Por qué está aplazado:** apuntar un dominio es una decisión de marca de
Daniel, y es un cambio de cara al público. No se toca sin que lo diga.

**Lo que sí está verificado mientras tanto:** las rutas privilegiadas de este OS
exigen sesión también en el dominio — `/lots`, `/plots`, `/recipes`,
`/research`, `/sensory`, `/partner`, `/apiaries` y `/admin/users` redirigen a
`/login` para un visitante anónimo (`tools/browser-checks/rutas-protegidas.mjs`).
La exposición es de superficie y de marca, no de datos.
