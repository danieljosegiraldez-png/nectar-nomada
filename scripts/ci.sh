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
# - La suite completa queda fuera: necesita `npm run test:db -- up`, que
#   restaura un backup verificado que no existe en un runner. Meterla aquí
#   produciría rojo por falta de base, que es justo el fallo que este archivo
#   existe para evitar.
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run tests/session-state-budget.test.ts tests/inventario-de-rutas.test.ts \
              tests/arquitectura/acceso-a-datos.test.ts \
    tests/traceability/plotDensity.test.ts \
    tests/traceability/reconciliacionDeCosecha.test.ts \
    tests/time/localDateTime.test.ts \
    tests/ui/recorteDeFecha.test.ts \
    tests/ui/valoresEnumerados.test.ts \
    tests/traceability/units.test.ts \
    tests/arquitectura/audit-atomico.test.ts \
    tests/arquitectura/use-server-solo-async.test.ts \
    tests/arquitectura/booleanos-de-tres-estados.test.ts \
    tests/arquitectura/columnas-de-sincronizacion.test.ts \
    tests/sync/clasificarRespuesta.test.ts \
    tests/sync/fieldEventPayload.test.ts \
    tests/sync/draftAge.test.ts \
    tests/archivo-de-estado.test.ts \
    tests/arquitectura/temporales-se-limpian.test.ts \
    tests/apiary/offlineQueue.test.ts \
    tests/backup/completeSet.test.ts \
    tests/backup/libpqUrl.test.ts

echo "── Todo verde ──────────────────────────────────────────────────────────"
