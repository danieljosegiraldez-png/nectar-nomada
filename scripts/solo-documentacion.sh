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

# Sin base explícita, el commit anterior. En un merge commit, HEAD^ es el primer
# padre —`main` antes de la fusión— así que el rango es justo lo que entra.
if [ -z "$base" ]; then
  if git rev-parse --verify --quiet "HEAD^" >/dev/null 2>&1; then
    base="HEAD^"
  else
    # Clon superficial sin padre, o primer commit: no se puede saber.
    echo "solo-documentacion: sin HEAD^, no se puede determinar el rango" >&2
    veredicto false
  fi
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
