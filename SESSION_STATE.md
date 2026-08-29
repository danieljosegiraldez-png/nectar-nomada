# Estado — Néctar Nómada OS

Dónde está el proyecto. Cómo se construye está en `CLAUDE.md`; son archivos
distintos a propósito. El registro largo de decisiones es
`docs/architecture/DECISIONS.md` (ADR-001 … ADR-103) y **no** se duplica aquí.

**Presupuesto: ≤400 líneas y <20.000 tokens.** Lo hace cumplir
`npm run check:state` y el test `tests/session-state-budget.test.ts`, no esta
frase. Pasado ese punto una lectura devuelve solo el principio **y reporta
éxito**. Lo viejo se va a `docs/SESSION_STATE_ARCHIVE.md`, lo más viejo primero.

---

## 1. Decisiones que solo Daniel puede tomar

Correr `bash scripts/open-decisions.sh` al arrancar. Las que sobrevivan van al
**primer mensaje a Daniel, antes de proponer trabajo**.

Convención: **0 = sigue abierta, 1 = cerrada, 2 = no se pudo determinar.**
«No se pudo determinar» nunca se reporta como cerrada. Las cinco pasaron un
flip-test el 2026-08-28, en ambas direcciones.

| Id | Decisión | Por qué es de Daniel | Prueba |
|----|----------|----------------------|--------|
| P-A | Alerta de backup **fuera de esta máquina** | Necesita un servicio externo que el proyecto no usa: es cuenta y gasto suyos. Hoy la alerta es local, y un portátil cerrado quince días no respalda nada y no dice nada | `! grep -rqiE "healthcheck\|hc-ping\|cronitor" scripts/backup/` |
| P-B | A qué proyecto apunta el dominio de marca — **cerrada el 2026-08-28** | Decisión de Daniel. Se deja la fila porque vuelve a abrirse sola si el dominio volviera a este proyecto | `curl -s -L https://www.nectarnomada.com/ \| grep -q 'href="/login"'` |
| P-C | Quiénes reciben correo y, con él, acceso | Casi nadie en la base tiene correo; sin correo no hay contraseña. Hoy solo Daniel y José. Quién entra no lo decide el sistema | `! grep -qi "correos de las personas" docs/architecture/DECISIONS.md` |
| P-D | Nombres y roles de la **familia Huerbsch** | Son los dueños de Finca Rosina y no están en la base. Daniel los suministra; **no se inventan filas de Persona** | `! grep -qi "huerbsch registrada" docs/architecture/DECISIONS.md` |
| P-E | Destino de backup fuera de la máquina | *Cerrada hoy* — `NN_BACKUP_DIR` está en `~/.zshrc`. Se deja en la tabla porque vuelve a abrirse sola si alguien lo quita, y porque una tabla donde todo dice «abierta» no demuestra que el mecanismo discrimine | `! grep -q "NN_BACKUP_DIR" "$HOME/.zshrc"` |

**P-C y P-D no cambian ningún artefacto por sí solas.** Su veredicto aterriza
en un ADR de `docs/architecture/DECISIONS.md` que contenga literalmente la frase
de su prueba. Sin ese sitio nombrado, ninguna búsqueda distinguiría «sin hacer»
de «hecho y sin rastro».

---

## 2. Lo que se entregó — más nuevo primero

### 2026-08-28 · Este repositorio ya tiene CI

`.github/workflows/ci.yml` invoca `scripts/ci.sh` en **un solo paso**, y ese
script corre igual en tu máquina. Genera el cliente de Prisma, corre
`npm run verify` y dos archivos de test herméticos. Node fijado en 24,
permisos de solo lectura, timeout de 10 minutos, concurrencia con cancelación.

**La revisión del plan volvió a impedir ejecutarlo como estaba.** Siete puntos,
todos aceptados: el contrato se repartía otra vez entre `package.json` y YAML
—la separación que ocurrió hoy mismo en el otro repositorio—, no fijaba Node, y
metía en CI un test que lee `~/.zshrc`.

Flip-testeado en las dos direcciones: sin `.env` ni `DATABASE_URL` sale **0**
(no se pone roja por falta de base, que es el fallo que haría que se borrara), y
con un error de tipos deliberado sale **2** nombrando el archivo.

**CI informa, no impide:** la protección de ramas no está disponible en un
repositorio privado de este plan. Ver `PENDING_IMPLEMENTATIONS/006`.

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

### 2026-08-28 · Andamiaje de sesión

`SESSION_STATE.md`, `PENDING_IMPLEMENTATIONS/`, `docs/plans/`, `docs/specs/`,
`tools/browser-checks/`, `tools/pack-for-review.sh`, `docs/CODEX_REVIEW.md`,
`npm run check:state` (con test propio) y `scripts/open-decisions.sh`.
`CLAUDE.md` **no se reescribió**: se le añadió el puntero al principio y las
secciones nuevas al final, por instrucción de Daniel.

Verificado contra el despliegue vivo: las ocho rutas privilegiadas
(`/admin/users`, `/lots`, `/plots`, `/recipes`, `/research`, `/sensory`,
`/partner`, `/apiaries`) redirigen a `/login` para un visitante anónimo.

### 2026-08-28 · El dominio de marca deja de servir este OS — resuelto

Durante el día `https://www.nectarnomada.com` respondía con esta aplicación
(confirmado por el hash idéntico del chunk de CSS y por `/login`, `/signup` y
`/discover` en 200). El dominio se reasignó al proyecto del sitio público esa
misma noche: ahora `/login` y `/discover` dan 404 ahí.

**La prueba de P-B se cerró sola** cuando el mundo cambió, sin editar nada.
Este OS sigue accesible en `https://nectar-nomada-package.vercel.app`, y sus
ocho rutas privilegiadas siguen exigiendo sesión — verificado tras la fusión.

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

## 3. Bloqueado, y en qué

- **Aviso fiable de que un backup no corrió** — bloqueado en P-A. Hoy la señal
  es local: una notificación de macOS, un `BACKUP-FAILED.txt` junto a los
  backups, y `launchctl list | grep nectar` como único rastro pasivo.
- **Dar acceso a alguien más que Daniel y José** — bloqueado en P-C.
- **Registrar a los dueños de Finca Rosina** — bloqueado en P-D.
- **Que la compuerta sea *obligatoria* para fusionar** — CI existe desde el
  2026-08-28 (`.github/workflows/ci.yml` → `scripts/ci.sh`: typecheck,
  presupuesto de estado, inventario de rutas, lint y dos archivos de test
  herméticos), y corre en cada push y cada PR. Lo que sigue bloqueado es que
  **impida** fusionar: la protección de ramas no está disponible en un
  repositorio privado de este plan («Upgrade to GitHub Pro»). Hoy CI informa,
  no impide, y esa diferencia es de Daniel. Tampoco cubre la suite completa —
  necesita `npm run test:db -- up` y un runner no tiene ese backup. Ver
  `PENDING_IMPLEMENTATIONS/006`.
- **Un nombre propio para este OS** — al mover el dominio, esta aplicación queda
  solo en `nectar-nomada-package.vercel.app`. Si quiere algo como
  `app.nectarnomada.com`, es decisión suya. No es urgente: nada depende de ello.
- **Reconciliación de medios en R2** — no está bloqueada, está *aplazada*:
  `core.asset` y el bucket estaban vacíos al 2026-08-20. Ver
  `PENDING_IMPLEMENTATIONS/002`.

---

## 4. Lo que NO se vuelve a proponer

| Propuesta | Por qué se rechazó |
|-----------|--------------------|
| Correr la suite contra la base de producción | Se hacía hasta 2026-08-21 (PR #10). `tests/setup.ts` ahora rechaza una base remota salvo `ALLOW_REMOTE_TEST_DB=1`. Usar `npm run test:db -- up` |
| Reponer una cuenta DEMO | Se eliminó el 2026-08-21 (ADR-066): tenía la única contraseña de la base |
| Conceder Platform Admin desde dentro de la aplicación | Requiere `rbac:manage_permissions`, que solo tiene Platform Admin. Sin titular, el rol no puede concederse nunca desde dentro. Por eso `auth:grant-admin` vive fuera |
| Pasar la contraseña como argumento a `auth:set-password` | Se niega a propósito: un argumento sobrevive en el historial y en la lista de procesos |
| Duplicar personas canónicas creando una cuenta nueva por «sign-up» | Ya existen con Assignments colgando (§2) |
| Construir herramienta de reconciliación de medios | Todavía no hay fotos reales. Ver `PENDING_IMPLEMENTATIONS/002` |
| Tocar `~/Developer/nectarnomada-web` desde esta ventana | Es el sitio público, otro repositorio (D-001 allí) |
| Deducir el dueño de una Location por su nombre | Exactamente lo que salió mal en el renombrado de Finca Rosina. Se mira `core.location.organization_id` |
| Subir el límite de `check:state` cuando falle | El límite es la lectura, no la preferencia. Se archiva, no se sube |

---

## 5. Al cerrar la sesión

1. Actualizar este archivo. **Es el entregable, no el diff.**
2. `npm run check:state` — si se queja, mover la sección que nombra a
   `docs/SESSION_STATE_ARCHIVE.md`.
3. Escribir la lección donde **sí se cargue**: `CLAUDE.md`, memoria, o
   `PENDING_IMPLEMENTATIONS/`. Nunca solo en un log de sesión.
4. `npm run typecheck` y `npm test`, **leyendo la salida**. Sin tubería antes
   del commit: el estado de salida de una tubería es el del último comando.
5. `git add` **por archivo, nunca `git add -A`** — otras sesiones comparten este
   checkout. Luego `git commit -F <archivo>`.
6. Esperar el check de Vercel antes de fusionar. Push, y verificar desde git:
   `git rev-parse HEAD` = `git rev-parse @{u}`.
7. Parar los procesos que esta sesión arrancó, **por puerto**, nunca `pkill node`.
8. Reportar qué quedó **verificado** y qué **asumido**.
