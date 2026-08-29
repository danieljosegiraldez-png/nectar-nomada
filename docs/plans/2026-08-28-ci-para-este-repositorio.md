# CI para el repositorio del OS · 2026-08-28

Cierra `PENDING_IMPLEMENTATIONS/006`.

## Para qué es

Hoy este repositorio **no tiene CI**: no existe `.github/workflows/`, y el único
check de una PR es el build de Vercel. `npm run typecheck`, `npm test` y
`npm run check:state` no corren solos nunca.

No es abstracto. Esta misma sesión encontró `main` con **18 errores de `tsc`** y
nadie lo estaba viendo, porque nada lo mira. La disciplina de envío dice
«typecheck antes de fusionar» y hoy depende de que alguien se acuerde.

## El riesgo que decide el diseño

**Un guardia que no puede pasar es peor que ninguno**, porque enseña a ignorar
una línea roja.

Medido hoy, no supuesto:

- **No hay `postinstall`.** `npm ci` no genera el cliente de Prisma.
- **`generated/prisma` está en `.gitignore`.** Un runner limpio empieza sin él.
- `scripts/vercel-build.sh` lo genera como primer paso, incondicionalmente —
  por eso los builds de Vercel sí funcionan.

Conclusión: un workflow ingenuo `npm ci && npm run verify` **fallaría en la
primera corrida** con exactamente los 18 errores de hoy, por una razón que no
tiene nada que ver con el cambio revisado. Hay que generar el cliente antes.

Segundo riesgo: **`npm test` exige una base local.** `tests/setup.ts` rechaza
una base remota salvo `ALLOW_REMOTE_TEST_DB=1`, y sin `DATABASE_URL` local
lanza. Un job que corra la suite entera se pondría rojo por falta de base.

## Qué se hace, y qué no

**Sí:** un job `Compuerta` que corre `npm ci`, genera el cliente de Prisma y
ejecuta `npm run verify` (typecheck + presupuesto de estado + inventario de
rutas + lint). Sin base de datos. Es lo que habría atrapado lo de hoy.

**Sí, con cuidado:** los **tres** archivos de test del andamiaje
(`session-state-budget`, `open-decisions`, `inventario-de-rutas`). No tocan la
base; sólo necesitan que `tests/setup.ts` los deje arrancar, lo que se consigue
con un `TEST_DATABASE_URL` de forma local. Se ejecutan **por nombre**, no con
`vitest run` a secas: cualquier otro test sí necesita base y se pondría rojo.

**No:** la suite completa. Necesita una base restaurada
(`npm run test:db -- up`) desde un backup verificado que no existe en un runner.
Meterla ahora produce rojo por falta de base, que es el fallo que este plan
existe para evitar. Queda anotado como pendiente aparte.

## Cómo sabremos que funcionó

1. La primera corrida sobre `main` **pasa**. Si no, el diseño está mal, no el
   repositorio.
2. Un `tsc` roto la pone roja. Prueba: una rama con un error de tipos
   deliberado; el job falla nombrando el archivo.
3. Una ruta sin declarar la pone roja, vía `check:rutas` dentro de `verify`.
4. **No se pone roja por falta de base de datos.** Es el criterio que más
   importa: es el modo de fallo que haría que se borrara el workflow.
5. El nombre del job dice lo que hace. El del sitio público decía «Tipos,
   contenido y lint» cuando ya corría más, y hubo que corregirlo.

## Qué toca

- Nuevo: `.github/workflows/ci.yml`, un solo job, `push` y `pull_request`, con
  `concurrency` para cancelar corridas viejas de la misma rama.

## Riesgos, y el coste si me equivoco

- **Minutos de Actions.** Un job corto por push. *Coste:* gasto pequeño en la
  cuenta de Daniel. *Mitigación:* `concurrency` cancela lo viejo.
- **Que `prisma generate` cambie de forma** y el paso se quede obsoleto.
  *Coste:* rojo por una razón ajena al cambio. *Mitigación:* se usa
  `npm run prisma:generate`, el mismo script que ya existe, no un comando suelto.
- **Que alguien añada un test que necesite base** y lo meta en la lista de tres.
  *Coste:* rojo por falta de base, el fallo que queremos evitar. *Mitigación:*
  la lista es explícita en el workflow y el comentario dice por qué.

## Revisión — hallazgos y adjudicación

**Veredicto de Codex: no ejecutar el plan tal como estaba.** No por el coste
—dijo que `npm ci + prisma generate + verify + tests puros` sí lo vale— sino por
la forma. **Acepté sus siete puntos.**

| # | Hallazgo | Veredicto | Qué se hizo |
|---|----------|-----------|-------------|
| 1 | Volvía a repartir el contrato entre `package.json` y YAML | **ACEPTADO** | `scripts/ci.sh` es el contrato único; el workflow lo invoca en **un solo paso** y corre igual en local. Es exactamente la separación que ocurrió hoy en el otro repositorio |
| 2 | No fijaba una versión de Node | **CONFIRMADO** | `node-version: 24`, igual que local (v24.19.0) y que el sitio público. Sin fijarla, la compuerta diría algo distinto cada mes |
| 3 | Metía en CI un test que depende de `$HOME` | **CONFIRMADO** | `open-decisions.test.ts` queda fuera: su prueba P-E lee `~/.zshrc`, estado personal de una máquina. Se sigue corriendo en local |
| 4 | Dejaba ambiguo el cierre de `PENDING 006` | **ACEPTADO** | 006 reescrito: qué cubre, qué no, y qué haría falta |
| 5 | No definía permisos, timeout ni concurrencia | **ACEPTADO** | `permissions: contents: read`, `timeout-minutes: 10`, `concurrency` con `cancel-in-progress` |
| 6 | No estaba probado desde un checkout limpio, sin `.env`, sin cliente generado ni PostgreSQL | **ACEPTADO y hecho** | Flip-test A abajo |
| 7 | Dudaba de si `prisma generate` tolera que falte `DATABASE_URL` | **MEDIDO** | Sí: `env -u DATABASE_URL npx prisma generate` sale 0. Era el riesgo número uno de que la primera corrida fallara |

También tenía razón en una corrección de hecho: dije «árbol limpio en 17ffadc» y
ya no lo estaba — este mismo archivo de plan estaba sin seguimiento.

### Flip-tests

- **A · sin base de datos**, el criterio que decide si el workflow sobrevive:
  `env -u DATABASE_URL -u TEST_DATABASE_URL DOTENV_CONFIG_PATH=/dev/null bash scripts/ci.sh`
  → **salida 0**, 18 tests. Un guardia que se pone rojo por falta de base se borra.
- **B · error de tipos deliberado** → **salida 2**, nombrando el archivo.
- Restaurado: salida 0, sin archivos residuales.

El criterio 1 —«la primera corrida sobre una rama pasa»— sólo puede probarlo la
propia corrida, y es lo que se mira al abrir la PR.
