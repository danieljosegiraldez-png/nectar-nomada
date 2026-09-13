#!/usr/bin/env bash
# ¿Este rango de commits toca SOLO documentación?
#
# Una sola definición, usada por DOS consumidores: el `ignoreCommand` de Vercel
# (vercel.json) y el carril ligero de CI (.github/workflows/ci.yml). Dos
# definiciones separadas derivarían, y este repositorio ya sabe cómo acaba eso:
# la prueba de P-A vivía duplicada en dos sitios y la copia se quedó atrás
# diciendo "cerrada" durante días.
#
# Medido el 2026-09-05 sobre las últimas 30 PR fusionadas: 17 tocaban SÓLO
# documentación. Más de la mitad de los despliegues y de los minutos de CI se
# gastaban en cambios que no pueden alterar nada en ejecución.
#
# CÓDIGOS DE SALIDA — los fija Vercel, no nosotros:
#   0 = sólo documentación  -> Vercel SALTA el build
#   1 = hay código          -> Vercel CONSTRUYE
#
# Ante la duda, SIEMPRE 1. Un build de más cuesta un minuto; un build de menos
# deja producción sirviendo lo viejo sin que nada avise, que es exactamente lo
# que pasó el 2026-09-01 y costó una hora.
#
# También imprime `solo_docs=true|false`, que es lo que CI lee por
# $GITHUB_OUTPUT.

set -uo pipefail

# Qué cuenta como documentación. Deliberadamente estrecho: `.github/`,
# `scripts/` y `prisma/` NO son documentación aunque no sean TypeScript —
# cambiarlos cambia lo que corre.
es_documentacion() {
  case "$1" in
    docs/*) return 0 ;;
    *.md)   return 0 ;;
    *)      return 1 ;;
  esac
}

veredicto() {
  # $1 = "true" | "false"
  echo "solo_docs=$1"
  [ "$1" = "true" ] && exit 0 || exit 1
}

base="${1:-}"
head="${2:-HEAD}"

# Sin base explícita hay que DEDUCIR el rango, y aquí es donde este script estuvo
# mal desde que existe.
#
# **El defecto, medido el 2026-09-13.** Decía «en un merge commit, HEAD^ es el
# primer padre, así que el rango es justo lo que entra». Eso es verdad en GitHub
# Actions, que saca el commit de FUSIÓN de la PR (`refs/pull/N/merge`). **Vercel no:
# saca el commit de la rama.** Ahí `HEAD^` es el commit anterior MÍO, y como todas
# estas PR terminan con un commit de estado —`SESSION_STATE.md`, sólo
# documentación— el rango decía «sólo docs» y Vercel **saltaba el build de un
# cambio de código entero**, reportando `success — Canceled by Ignored Build Step`.
#
# Le pasó a las PR **#283, #284, #286 y #288**: ninguna construyó su preview, y la
# #288 llegó a `main` sin que nada hubiera construido su código. Rompió producción
# —`pg` en el paquete del navegador— y el sitio sirvió un build viejo una hora.
#
# Un `success` que significa «no miré» es peor que un rojo, y es la misma familia
# que el `cancelled` de las compuertas de Actions.
if [ -z "$base" ]; then
  por_defecto="${VERCEL_GIT_REPO_DEFAULT_BRANCH:-main}"
  rama="${VERCEL_GIT_COMMIT_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)}"
  padres="$(git rev-list --parents -n 1 "$head" 2>/dev/null | wc -w | tr -d ' ')"

  if [ "${padres:-0}" -ge 3 ]; then
    # Commit de fusión (1 sha + 2 padres = 3 palabras): su primer padre ES la base.
    # Es el caso de GitHub Actions en un `pull_request`.
    base="$head^"
  elif [ "$rama" = "$por_defecto" ] && git rev-parse --verify --quiet "$head^" >/dev/null 2>&1; then
    # Despliegue de producción: un squash sobre la rama por defecto tiene un solo
    # padre, y ése es `main` antes de la fusión.
    base="$head^"
  elif git rev-parse --verify --quiet "origin/$por_defecto" >/dev/null 2>&1 &&
       mb="$(git merge-base "origin/$por_defecto" "$head" 2>/dev/null)" && [ -n "$mb" ]; then
    # Preview de una rama: la base es donde se separó de la rama por defecto, no el
    # commit anterior. Esto es lo que faltaba.
    base="$mb"
  else
    # Clon superficial sin la rama por defecto, primer commit, o algo que no se
    # reconoce. No se puede medir, así que se construye.
    echo "solo-documentacion: no se pudo deducir la base (rama=$rama, padres=$padres); construyo por si acaso" >&2
    veredicto false
  fi
  echo "solo-documentacion: base deducida $base (rama=$rama, padres=$padres)" >&2
fi

archivos="$(git diff --name-only "$base" "$head" 2>/dev/null)"
estado=$?

if [ $estado -ne 0 ]; then
  echo "solo-documentacion: git diff falló ($estado); construyo por si acaso" >&2
  veredicto false
fi

# Un rango vacío no es "sólo documentación": es que no se pudo medir. Construir.
if [ -z "$archivos" ]; then
  echo "solo-documentacion: el rango no devolvió archivos; construyo por si acaso" >&2
  veredicto false
fi

while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! es_documentacion "$f"; then
    echo "solo-documentacion: '$f' no es documentación" >&2
    veredicto false
  fi
done <<EOF
$archivos
EOF

echo "solo-documentacion: $(echo "$archivos" | wc -l | tr -d ' ') archivo(s), todos documentación" >&2
veredicto true
