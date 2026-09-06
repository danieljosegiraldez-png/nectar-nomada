#!/usr/bin/env bash
# La compuerta, en un solo sitio.
#
# CI **no** enumera pasos: invoca este script. En el repositorio del sitio
# público el workflow listaba `typecheck`, `check:content` y `lint` uno a uno
# mientras la compuerta local era `npm run verify`, y las dos se separaron sin
# que nadie lo notara: `check:state` y `npm test` existían en local y CI no los
# corría nunca. Un contrato repartido entre `package.json` y YAML vuelve a
# separarse siempre.
#
# Corre igual en tu máquina: `bash scripts/ci.sh`.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── Cliente de Prisma ───────────────────────────────────────────────────"
# `generated/prisma` está en .gitignore y NO hay `postinstall`, así que un
# checkout limpio empieza sin cliente. Sin esto, `tsc` falla con ~18 errores en
# lib/traceability/* que no tienen nada que ver con el cambio revisado — y un
# guardia que no puede pasar es peor que ninguno.
# Comprobado el 2026-08-28: `prisma generate` no necesita DATABASE_URL.
npm run prisma:generate

echo "── Compuerta: tipos, presupuesto de estado, inventario de rutas, lint ──"
npm run verify

echo "── Tests herméticos ────────────────────────────────────────────────────"
# Sólo estos 14, POR NOMBRE y a propósito:
#
# - No consultan la base. `tests/setup.ts` se niega a arrancar contra una base
#   remota, así que se le da una URL de forma local que no apunta a ninguna
#   base real. Es honesto porque estos archivos nunca conectan; si alguien
#   añade aquí un test que sí consulte, fallará al conectar, ruidosamente, que
#   es el fallo correcto.
# - `tests/open-decisions.test.ts` queda FUERA: la prueba P-E lee
#   `$HOME/.zshrc`, que es estado personal de una máquina. Un veredicto de CI no
#   debe depender de los dotfiles de nadie. Ese test se corre en local.
# - Las que no pueden correr aquí van nombradas UNA A UNA, con su motivo, en
#   `scripts/pruebas-por-compuerta.txt`. Aquí se corre **todo lo demás**. Las
#   del grupo `base-sembrada` las corre `scripts/ci-con-base.sh`, en otro job
#   con un Postgres de servicio.
#
#   Era al revés —una lista de inclusión escrita a mano en este archivo— y se
#   desincronizó en silencio: el 2026-09-05 corrían 22 de 97 archivos, y 17 de
#   los ausentes no necesitaban base para nada. Una lista de inclusión pierde
#   cobertura callándose. Con la exclusión, las dos formas de equivocarse hacen
#   ruido: una prueba nueva que necesite base y no se apunte pone CI en rojo al
#   no poder conectar, y una ruta que sobre la caza `tests/ci-cobertura.test.ts`.
EXCLUIDAS="$(cd "$(dirname "$0")/.." && grep -vE '^\s*(#|$)' scripts/pruebas-por-compuerta.txt)"
A_CORRER="$(cd "$(dirname "$0")/.." && find tests -name '*.test.ts' | sort | grep -vxF "$EXCLUIDAS")"

# Fila patrón, leída antes que nada: si la selección sale vacía o absurda, el
# verde de abajo no significaría nada. Es el control positivo de este bloque.
echo "── CI correrá $(echo "$A_CORRER" | wc -l | tr -d ' ') archivos de prueba; $(echo "$EXCLUIDAS" | wc -l | tr -d ' ') los corre otra compuerta o ninguna"
test "$(echo "$A_CORRER" | wc -l | tr -d ' ')" -ge 30 || { echo "ABORTA: la selección de pruebas salió demasiado corta"; exit 1; }

TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run $A_CORRER

echo "── Todo verde ──────────────────────────────────────────────────────────"
