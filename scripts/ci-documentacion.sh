#!/usr/bin/env bash
# La compuerta para cambios que sólo tocan documentación.
#
# Por qué existe. Medido el 2026-09-05 sobre las últimas 30 PR fusionadas: 17
# tocaban SÓLO documentación, y las 17 corrían la compuerta entera — cliente de
# Prisma, tipos, lint y once archivos de test — sobre archivos `.md` que no
# pueden alterar ninguna de esas cosas.
#
# Qué SÍ necesita un cambio de documentación, y es lo único que corre aquí: que
# `SESSION_STATE.md` siga cabiendo en una lectura. Pasado el presupuesto, una
# lectura devuelve sólo el principio **y reporta éxito**, así que un archivo de
# estado que crece sin control es un fallo silencioso — el más caro de todos los
# que este repositorio ha tenido.
#
# Por qué no corre `npm ci`. `check-state-budget.mjs` no importa nada: corre con
# el node del runner y sin dependencias. Eso está medido y escrito en
# `~/.claude/CLAUDE.md`, y es lo que baja esta corrida de ~70 s a unos pocos.
#
# LO QUE ESTE CARRIL NO CUBRE, dicho aquí para que nadie lo descubra tarde:
# `tests/session-state-budget.test.ts` sí necesita vitest, así que NO corre. Ese
# test comprueba que el guardia discrimina —tiene cinco fixtures negativos—;
# aquí se corre el guardia contra el archivo real, que es la propiedad que le
# importa a una PR de documentación. La distinción es real y es un recorte
# deliberado, no un olvido.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "── Carril ligero: sólo se tocó documentación ───────────────────────────"
echo "   La compuerta completa se salta a propósito. Ver la cabecera de este"
echo "   script para qué cubre y qué no."
echo

echo "── Presupuesto de SESSION_STATE.md ─────────────────────────────────────"
node scripts/check-state-budget.mjs

echo
echo "── Salud del archivo histórico ─────────────────────────────────────────"
echo "   Añadido el 2026-09-05, el mismo día que este carril: sus tres"
echo "   comprobaciones vivían sólo en un test de vitest, que este carril no"
echo "   corre. O sea que el guardia del archivo histórico dejaba de correr"
echo "   justo en los cambios que tocan el archivo histórico. Lo encontré"
echo "   archivando, veinte minutos después de estrenar esto."
node scripts/check-archivo-de-estado.mjs

echo
echo "── Decisiones del dueño ────────────────────────────────────────────────"
echo "   Corre sin dependencias y sin red para las pruebas locales. Un veredicto"
echo "   ROTA (salida 3) significa que una prueba de decisión está mal escrita,"
echo "   y eso hace desaparecer una decisión del primer mensaje a Daniel sin"
echo "   dejar rastro. Es de las pocas cosas que un cambio de documentación SÍ"
echo "   puede romper: las pruebas viven en docs y en archivos de estado."
bash scripts/open-decisions.sh
