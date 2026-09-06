#!/usr/bin/env bash
# La compuerta que SÍ necesita una base de datos.
#
# `scripts/ci.sh` corre lo que no la necesita. Esto corre el grupo
# `base-sembrada` de `scripts/pruebas-por-compuerta.txt`: las pruebas que
# necesitan base y a las que les basta con `migrate deploy` + `db:seed`.
#
# Por qué existe: hasta el 2026-09-05 NINGUNA prueba con base corría en CI —
# 59 archivos que sólo se ejercían en el portátil de quien se acordara de
# `npm run test:db -- up`. Entre ellas estaban los cuatro guardias de las
# revisiones de páginas de ese día, escritos para proteger algo y protegiéndolo
# sólo en local.
#
# Medido antes de construir esto, no supuesto: de los 58 archivos con base,
# 46 pasan con una base sembrada desde vacío. Se comprobó dos veces, cada una
# creando la base de cero: 46/46 archivos, 460/460 pruebas las dos veces. Los
# 12 restantes leen datos que no crean —un Project, un Lot, un Assignment que ya
# exista—; están en el grupo `datos-reales` y siguen necesitando el backup
# restaurado que levanta `scripts/test-db.sh`.
#
# Corre igual en local:
#   createdb nectar_ci_probe   # o cualquier base vacía
#   TEST_DATABASE_URL=postgresql://…/nectar_ci_probe bash scripts/ci-con-base.sh
set -euo pipefail

cd "$(dirname "$0")/.."

: "${TEST_DATABASE_URL:?Hace falta TEST_DATABASE_URL apuntando a una base vacía}"

echo "── Compuerta con base ──────────────────────────────────────────────────"

# Prisma escribe con DATABASE_URL; la suite lee con TEST_DATABASE_URL. Aquí son
# la misma base a propósito: lo que se migra y siembra es lo que se prueba.
export DATABASE_URL="$TEST_DATABASE_URL"

npx prisma generate
npx prisma migrate deploy
npm run db:seed

# El grupo se lee del mismo archivo que usa `ci.sh`, para que no haya dos
# fuentes que deriven. `awk` corta en la marca del grupo siguiente.
# El `$` del final no es adorno: sin anclar, `base-sembrada` casaba también
# `base-sembrada-CUALQUIERCOSA`, y el flip-test que debía dejar la selección
# vacía seguía dando 46 archivos y verde. Se vio al mutarlo.
A_CORRER="$(awk '/^#[[:space:]]*@grupo:[[:space:]]*base-sembrada[[:space:]]*$/{d=1;next} /^#[[:space:]]*@grupo:/{d=0} d && $0 !~ /^[[:space:]]*(#|$)/ {print $1}' scripts/pruebas-por-compuerta.txt)"

# Fila patrón, leída antes que el veredicto: un verde sobre una selección vacía
# no significaría nada, y una selección vacía es justo lo que produce un `awk`
# que deja de casar la marca del grupo.
CUANTOS="$(echo "$A_CORRER" | grep -c . || true)"
echo "── Correrá $CUANTOS archivos del grupo base-sembrada"
test "$CUANTOS" -ge 20 || { echo "ABORTA: la selección salió demasiado corta ($CUANTOS)"; exit 1; }

# shellcheck disable=SC2086
npx vitest run $A_CORRER

echo "── Todo verde ──────────────────────────────────────────────────────────"
