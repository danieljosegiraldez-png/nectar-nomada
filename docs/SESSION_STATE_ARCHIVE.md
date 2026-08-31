# Archivo de estado — Néctar Nómada OS

Lo que se sacó de `SESSION_STATE.md` para que siguiera cabiendo en una lectura.
**Lo más viejo primero.** Nada de aquí se carga en una sesión; es registro, no
control. Si algo de aquí todavía dirige el trabajo, no pertenece a este archivo.

El registro largo de decisiones vive en `docs/architecture/DECISIONS.md`
(ADR-001 … ADR-103). Este archivo es solo el desbordamiento del estado.

**Primer archivado: 2026-08-31**, con el estado en 315/400 líneas. Se movieron
las cinco entradas más viejas, todas del 2026-08-28, elegidas porque su
contenido ya vive en un sitio que sí se carga: las trampas de `CLAUDE.md`, los
`PENDING_IMPLEMENTATIONS/`, o el propio código. Nada que siguiera dirigiendo el
trabajo salió de `SESSION_STATE.md`.

Comprobado al moverlas: de las 75 líneas quitadas del estado, **cero** con
contenido faltaban en este archivo.

### 2026-08-28 · Selección de cereza, de operación a pantalla usable

PR #58 `0aa7544` (dominio), #59 `43f97d4` (pantalla), #62 `18c6c26` (paso
sugerido). ADR-103 y ADR-105. Antes: versiones de receta (PR #56).

`selection` entra en `CONSERVING_TYPES`: aceptado + rechazos + merma declarada
debe cuadrar contra la entrada, y es la primera transformación donde un
descuadre significa que alguien pesó mal y no un rendimiento. El rechazo es un
`Lot` de verdad con `rejectionCategoryValueId`; su `lotType` sigue siendo
físico, porque un flotador sigue siendo cereza. La pantalla lleva balance en
vivo — el único momento en que un operario puede actuar sobre un descuadre es
antes de enviar, con el café delante.

Tres huecos que solo aparecieron al usarlo, cerrados en #59/#62: faltaba
`transformationType_selection` en los catálogos (la línea de tiempo salía rota
para cualquier lote con selección), `getSelectionOutturn` no se mostraba en
ninguna parte, y la cereza sin seleccionar seguía sugiriendo fermentación.

**Nadie ha registrado todavía una selección real.** El vocabulario de rechazo y
la afirmación de ADR-105 —que en el beneficio la selección precede a la
fermentación— siguen sin contrastar contra un tanque de flotación.

---

### 2026-08-28 · El dominio de marca deja de servir este OS — resuelto

Durante el día `https://www.nectarnomada.com` respondía con esta aplicación
(confirmado por el hash idéntico del chunk de CSS y por `/login`, `/signup` y
`/discover` en 200). El dominio se reasignó al proyecto del sitio público esa
misma noche: ahora `/login` y `/discover` dan 404 ahí.

**La prueba de P-B se cerró sola** cuando el mundo cambió, sin editar nada.
Este OS sigue accesible en `https://nectar-nomada-package.vercel.app`, y sus
ocho rutas privilegiadas siguen exigiendo sesión — verificado tras la fusión.

### 2026-08-28 · Andamiaje de sesión

`SESSION_STATE.md`, `PENDING_IMPLEMENTATIONS/`, `docs/plans/`, `docs/specs/`,
`tools/browser-checks/`, `tools/pack-for-review.sh`, `docs/CODEX_REVIEW.md`,
`npm run check:state` (con test propio) y `scripts/open-decisions.sh`.
`CLAUDE.md` **no se reescribió**: se le añadió el puntero al principio y las
secciones nuevas al final, por instrucción de Daniel.

Verificado contra el despliegue vivo: las ocho rutas privilegiadas
(`/admin/users`, `/lots`, `/plots`, `/recipes`, `/research`, `/sensory`,
`/partner`, `/apiaries`) redirigen a `/login` para un visitante anónimo.

### 2026-08-28 · Revisión independiente de la PR #60, y lo que cambió

Codex revisó el cambio en una sesión nueva, con sandbox de solo lectura y un
paquete armado mecánicamente. Ocho hallazgos; **seis se arreglaron, uno se
aceptó con matiz y uno se rechazó con razón declarada**:

- **Arreglado —** cualquier código de salida distinto de 0/2 contaba como
  «cerrada»: una errata cerraba una decisión de Daniel. Ahora solo el `1` cierra.
- **Arreglado —** P-C, P-D y P-A podían cerrarse con una mención en prosa o un
  comentario. Ahora exigen un encabezado `## ADR-NNN` o una invocación real.
- **Arreglado —** P-B daba «cerrada» ante un 404 con cuerpo. Ahora exige 200.
- **Arreglado —** P-E se cerraba con `NN_BACKUP_DIR=""`. Ahora exige valor.
- **Arreglado —** el test del presupuesto pasaba igual con el guardia
  neutralizado. Cinco fixtures negativos; comprobado que caen los 6.
- **Arreglado —** `caracteres / 3` no es una cota. Techo duro de bytes añadido,
  que atrapa prosa acentuada que la estimación no veía.
- **Arreglado —** el consejo de archivar nombraba una sección aunque hicieran
  falta tres, y una sección sin terminar se tragaba el resto del archivo.
- **Arreglado —** `pack-for-review.sh` partía rutas con espacios y no
  comprobaba que todos los archivos tocados estuvieran en el paquete.
- **Aceptado con matiz —** «byte a byte» era una afirmación, no una
  comprobación: ahora hay `scripts/check-claude-md-intact.mjs`, reproducible.
- **Rechazado —** meter `npm run decisiones` dentro de `npm run verify`. Dos
  pruebas salen a la red y una compuerta que se pone roja por una wifi mala
  enseña a ignorar una línea roja. En su lugar, `OD_SIN_RED=1` y un test que
  comprueba sin red que cada decisión declarada recibe veredicto y que ninguna
  prueba está rota. **Coste si me equivoco:** el mecanismo podría pudrirse por
  una vía que ese test no cubre — que una prueba sea *válida pero equivocada*.

Corregido además: decía «las siete rutas privilegiadas» sobre una lista de ocho.

### 2026-08-28 · Control de higiene del router (PENDING 005 sigue abierto)

Las 50 entradas del router se **declaran** en `scripts/rutas-declaradas.mjs`
con su clase y su razón; `npm run check:rutas`, dentro de `verify`, falla si
aparece una sin declarar, si el manifiesto nombra una que ya no existe, o si el
código contradice lo declarado. `respuesta-anonima.mjs` contrasta 26 rutas
estáticas contra el despliegue: 26 coinciden, 0 contradicen.

**La revisión del plan (compuerta 2) impidió construir lo que estaba escrito.**
Nueve hallazgos, ocho aceptados: clasificar por grep mide «presencia de una
señal», no «página gateada»; el flip-test que propuse era circular; el nombre
`rutas-protegidas` y un ✓ verde se leen como garantía de seguridad pase lo que
pase. El alcance se redujo y las palabras cambiaron.

**Sigue sin probarse** que los datos estén protegidos: la frontera es el
servicio de RBAC (`SECURITY.md` §2), no la ruta. Por eso 005 sigue abierto, con
sus límites escritos.

