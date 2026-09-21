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
# CORREGIDO EL 2026-09-21: este carril YA corre vitest, y el recorte de antes
# dejó `main` rojo dos días. Decía: «`tests/session-state-budget.test.ts` sí
# necesita vitest, así que NO corre … un recorte deliberado, no un olvido». Lo
# era, pero el recorte era más ancho de lo que decía: con él se quedaban fuera
# TODOS los guardias de vitest que leen documentación —once en
# `tests/arquitectura`—. El 2026-09-19 el PR #446, sólo documentación, declaró un
# estado nuevo en `docs/dominio/` que `material-de-dominio-declarado.test.ts`
# no admitía: este carril salió verde y `main` quedó rojo en su propia punta.
# Reproducido antes de arreglarlo: con una guía rota, este guion daba salida 0.
#
# Por qué no se arregla haciendo que `docs/` cuente como código: eso haría correr
# la compuerta entera y CONSTRUIR en Vercel en cada cambio de documentación, y
# las dos cuotas ya se agotaron este mes. Aquí se paga un `npm ci` (~70 s) y
# ningún despliegue.

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
echo "── Guardias que leen documentación ─────────────────────────────────────"
echo "   Todos los de tests/arquitectura más los de la raíz de tests/, menos los"
echo "   que declaran necesitar base en scripts/pruebas-por-compuerta.txt — la"
echo "   MISMA lista de exclusión que usa ci.sh. No es una lista escrita a mano:"
echo "   una lista copiada es justo lo que rompió main el 2026-09-19."
npm ci --no-audit --no-fund
npm run prisma:generate
EXCLUIDAS="$(grep -vE '^\s*(#|$)' scripts/pruebas-por-compuerta.txt)"
GUARDIAS="$( { find tests/arquitectura -name '*.test.ts'; find tests -maxdepth 1 -name '*.test.ts'; } | sort | grep -vxF "$EXCLUIDAS")"
echo "   Correrá $(echo "$GUARDIAS" | wc -l | tr -d ' ') archivos de guardia."
# Control positivo de la selección: si una carpeta se renombra o la exclusión se
# traga de más, la lista sale corta y vitest correría casi nada en verde.
test "$(echo "$GUARDIAS" | wc -l | tr -d ' ')" -ge 30 || { echo "ABORTA: la selección de guardias salió demasiado corta"; exit 1; }
echo "$GUARDIAS" | grep -q 'material-de-dominio-declarado' || { echo "ABORTA: falta el guardia que rompió main el 2026-09-19"; exit 1; }
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run $GUARDIAS

echo
echo "── Decisiones del dueño ────────────────────────────────────────────────"
echo "   Corre sin dependencias y sin red para las pruebas locales. Un veredicto"
echo "   ROTA (salida 3) significa que una prueba de decisión está mal escrita,"
echo "   y eso hace desaparecer una decisión del primer mensaje a Daniel sin"
echo "   dejar rastro. Es de las pocas cosas que un cambio de documentación SÍ"
echo "   puede romper: las pruebas viven en docs y en archivos de estado."
bash scripts/open-decisions.sh
