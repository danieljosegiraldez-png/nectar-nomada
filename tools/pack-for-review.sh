#!/usr/bin/env bash
# Arma el paquete de revisión de forma MECÁNICA.
#
# El contenido es una regla, no una elección: un paquete curado a criterio
# codifica el marco del que lo arma, y el revisor hereda su punto ciego. Dejar
# que el revisor rastree el repo colgó 50 minutos y produjo dos frases; la misma
# revisión desde un paquete tardó menos de cuatro.
#
# **Nunca comprimir quitando cuerpos.** Un paquete sin cuerpos borró en silencio
# las dos constantes de las que trataba la revisión. Se comprime por selección.
#
# Uso: bash tools/pack-for-review.sh <rango-git> [salida]
#      bash tools/pack-for-review.sh origin/main..HEAD
set -euo pipefail
cd "$(dirname "$0")/.."

RANGO="${1:?falta el rango, p.ej. origin/main..HEAD}"

# `git diff A..B` compara los DOS EXTREMOS, no el cambio del autor. Si la base
# avanzó mientras trabajabas, lo que otro añadió allí sale aquí como si tú lo
# hubieras **borrado**. Pasó el 2026-08-31: el paquete presentó al revisor 66
# líneas de test y 19 de `lib/traceability/fieldSessions.ts` como bajas de este
# cambio, cuando eran altas de otra sesión en `main` (#98, un arreglo de
# autorización). `git log A..B` sí es correcto, así que la lista de commits se
# veía bien y el diffstat no — la incoherencia entre ambos fue la única señal.
#
# Para diffs se usa siempre la forma de tres puntos, que parte de la base común.
NORM="${RANGO/.../..}"
BASE="${NORM%%..*}"
PUNTA="${NORM##*..}"
[ -n "$PUNTA" ] || PUNTA=HEAD
RANGO_DIFF="${BASE}...${PUNTA}"

# Y si la rama está detrás de su base, el revisor tiene que saberlo: juzga un
# árbol que no es el que se va a fusionar.
DETRAS=$(git rev-list --count "${PUNTA}..${BASE}" 2>/dev/null || echo 0)
SALIDA="${2:-/private/tmp/claude-501/pack-$(date +%Y%m%d-%H%M%S).md}"
mkdir -p "$(dirname "$SALIDA")"

TOCADOS=$(git diff --name-only "$RANGO_DIFF" -- | grep -v '^node_modules/' || true)
if [ -z "$TOCADOS" ]; then
  echo "El rango $RANGO no toca ningún archivo. No hay nada que revisar." >&2
  exit 1
fi

{
  echo "# Paquete de revisión — $RANGO"
  echo
  echo "Armado mecánicamente por \`tools/pack-for-review.sh\` el $(date -u +%Y-%m-%dT%H:%M:%SZ)."
  echo
  echo "## Estado de git (para que no tengas que preguntarlo)"
  echo '```'
  echo "repo:   $(git remote get-url origin 2>/dev/null || echo 'sin remoto')"
  echo "rama:   $(git branch --show-current)"
  echo "HEAD:   $(git rev-parse HEAD)"
  echo "base:   $(git merge-base HEAD "${RANGO%%..*}" 2>/dev/null || echo n/d)"
  echo "sucio:  $(git status --porcelain | wc -l | tr -d ' ') archivo(s) sin commitear"
  echo "diff:   $RANGO_DIFF (tres puntos: desde la base común)"
  echo "detrás: $DETRAS commit(s) de $BASE que esta rama no tiene"
  echo '```'
  if [ "$DETRAS" -gt 0 ]; then
    echo
    echo "> **Aviso al revisor:** esta rama está $DETRAS commit(s) por detrás de"
    echo "> \`$BASE\`. El diff de abajo es sólo lo que aportó el autor, pero el"
    echo "> árbol que juzgas no es el que se fusionará. Pide una re-medición si"
    echo "> tu juicio depende de código que pudo cambiar en la base."
  fi
  echo
  echo "## Medidas"
  echo '```'
  git diff --stat "$RANGO_DIFF" --
  echo '```'
  echo
  echo "## Mensajes de commit del rango"
  echo '```'
  git log --format='%h %ad %s%n%w(80,4,4)%b' --date=short "$RANGO" || true
  echo '```'
  echo
  echo "## Diff completo del rango (sin extractos)"
  echo '```diff'
  git diff "$RANGO_DIFF" --
  echo '```'
  echo
  echo "## Texto actual COMPLETO de cada archivo tocado"
  # `while read` y no `for f in $TOCADOS`: la separación por palabras rompe
  # cualquier ruta con espacios, y el paquete saldría incompleto sin decirlo.
  printf '%s\n' "$TOCADOS" | while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -f "$f" ] || { echo; echo "### $f — borrado en este rango"; continue; }
    echo
    echo "### $f  ($(wc -l < "$f" | tr -d ' ') líneas)"
    echo '```'
    cat "$f"
    echo '```'
  done

  # Un salto de imports. Sin criterio: lo que importan los archivos tocados.
  VECINOS=$(
    for f in $TOCADOS; do
      [ -f "$f" ] || continue
      d=$(dirname "$f")
      grep -ohE 'from "(@/|\.\.?/)[^"]+"' "$f" 2>/dev/null | sed 's/from "//; s/"$//' | while read -r m; do
        if [ "${m#@/}" != "$m" ]; then c="${m#@/}"; else c="$d/$m"; fi
        for ext in .ts .tsx .mjs .js /index.ts /index.tsx ""; do
          if [ -f "$c$ext" ]; then printf '%s\n' "$c$ext"; break; fi
        done
      done || true
    done | sed 's|//|/|g; s|^\./||' | sort -u
  )
  VECINOS=$(comm -23 <(printf '%s\n' "$VECINOS" | sort -u) <(printf '%s\n' "$TOCADOS" | sort -u) 2>/dev/null || printf '%s\n' "$VECINOS")
  if [ -n "$(printf '%s' "$VECINOS" | tr -d '[:space:]')" ]; then
    echo
    echo "## Un salto de imports (texto completo, sin recortar)"
    for f in $VECINOS; do
      [ -f "$f" ] || continue
      echo
      echo "### $f  ($(wc -l < "$f" | tr -d ' ') líneas)"
      echo '```'
      cat "$f"
      echo '```'
    done
  fi

} > "$SALIDA"

# El paquete tiene que demostrar que se armó, no anunciar que se armó.
LINEAS=$(wc -l < "$SALIDA" | tr -d ' ')
BYTES=$(wc -c < "$SALIDA" | tr -d ' ')
ARCHIVOS=$(printf '%s\n' "$TOCADOS" | wc -l | tr -d ' ')
FALTAN=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  grep -qF "### $f" "$SALIDA" || FALTAN="$FALTAN $f"
done <<EOF_TOCADOS
$TOCADOS
EOF_TOCADOS
if ! grep -q "^## Diff completo del rango" "$SALIDA" || [ "$BYTES" -lt 500 ]; then
  echo "✗ El paquete salió incompleto ($BYTES bytes). No lo mandes." >&2
  exit 1
fi
if [ -n "$FALTAN" ]; then
  # Un revisor que cree haber recibido el cambio entero y no lo recibió repite
  # el mismo defecto que este script existe para evitar: afirmar, no demostrar.
  echo "✗ Faltan archivos tocados en el paquete:$FALTAN" >&2
  echo "  No lo mandes: una revisión sobre un paquete incompleto es peor que ninguna." >&2
  exit 1
fi
echo "$SALIDA"
echo "  $LINEAS líneas · $BYTES bytes · $ARCHIVOS archivo(s) tocado(s) · rango $RANGO" >&2
echo "  BORRAR después de adjudicar: un paquete viejo desorienta." >&2
