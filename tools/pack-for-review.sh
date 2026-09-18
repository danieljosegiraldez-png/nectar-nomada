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
# Uso: bash tools/pack-for-review.sh <rango-git> [salida] [ruta...]
#      bash tools/pack-for-review.sh origin/main..HEAD
#      bash tools/pack-for-review.sh 866339f..main /tmp/p.md lib/
#
# **Las rutas son la única forma legítima de comprimir.** La cabecera de arriba
# ya decía «se comprime por selección» y el script no ofrecía ninguna: el
# 2026-09-01 un rango de un día entero salió en 8.255 líneas, que es el tamaño
# que hizo colgar la revisión del 2026-08-31. Acotar a `lib/` lo dejó en 1.713.
# Lo que NO se hace es quitar cuerpos: el paquete de un archivo seleccionado
# sigue llevándolo entero.
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

# Rutas opcionales a partir del tercer argumento. Sin ellas, todo el rango.
#
# **`${RUTAS[@]+"${RUTAS[@]}"}` y no `"${RUTAS[@]}"`, a propósito.** En bash 3.2 —el
# `/bin/bash` de macOS— un array vacío bajo `set -u` cuenta como variable sin definir:
# la expansión revienta dentro del `$(...)`, el `|| true` se traga el error, y el
# script anunciaba «no toca ningún archivo» sobre commits que tocaban diecisiete.
# Pasó desde el #125 (2026-09-01) hasta el 2026-09-18. Lo guarda
# tests/pack-for-review.test.ts.
shift 2 2>/dev/null || shift $# 
RUTAS=("$@")
if [ ${#RUTAS[@]} -gt 0 ]; then
  ALCANCE="$RANGO_DIFF, acotado a: ${RUTAS[*]}"
else
  ALCANCE="$RANGO_DIFF (todo el rango)"
fi

TOCADOS=$(git diff --name-only "$RANGO_DIFF" -- ${RUTAS[@]+"${RUTAS[@]}"} | grep -v '^node_modules/' || true)
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
  echo "diff:   $ALCANCE"
  echo "        (tres puntos: desde la base común)"
  echo "detrás: $DETRAS commit(s) de $BASE que esta rama no tiene"
  echo '```'
  if [ "$DETRAS" -gt 0 ]; then
    echo
    echo "> **Aviso al revisor:** esta rama está $DETRAS commit(s) por detrás de"
    echo "> \`$BASE\`. El diff de abajo es sólo lo que aportó el autor, pero el"
    echo "> árbol que juzgas no es el que se fusionará. Pide una re-medición si"
    echo "> tu juicio depende de código que pudo cambiar en la base."
  fi
  if [ ${#RUTAS[@]} -gt 0 ]; then
    echo
    echo "> **Aviso al revisor:** este paquete está ACOTADO a \`${RUTAS[*]}\`."
    echo "> El cambio completo toca más archivos —tests, migraciones, pantallas—"
    echo "> que no están aquí. Se acotó por tamaño, no porque el resto no importe."
  fi
  echo
  echo "## Medidas"
  echo '```'
  git diff --stat "$RANGO_DIFF" -- ${RUTAS[@]+"${RUTAS[@]}"}
  echo '```'
  echo
  echo "## Mensajes de commit del rango"
  echo '```'
  git log --format='%h %ad %s%n%w(80,4,4)%b' --date=short "$RANGO" || true
  echo '```'
  echo
  echo "## Diff completo del rango (sin extractos)"
  echo '```diff'
  git diff "$RANGO_DIFF" -- ${RUTAS[@]+"${RUTAS[@]}"}
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

  # `dirname/../..` se resuelve ANTES de deduplicar.
  #
  # El 2026-09-01 un paquete de 8 archivos salió en 22.888 líneas: 60 secciones
  # para 34 archivos únicos, **9.435 líneas repetidas, el 46 %**. `lots.ts`
  # (967 líneas) venía tres veces y `traceability.ts` (1.575) dos. La causa es
  # que el candidato se arma como `"$d/$m"` —`app/actions/../../lib/.../lots.ts`—
  # y `sort -u` compara TEXTO: el mismo archivo alcanzado desde dos importadores
  # son dos cadenas distintas. El `sed` de arriba colapsa `//` y `./`, pero no
  # resuelve `..`, así que la deduplicación nunca llegó a ocurrir.
  #
  # Importa porque este script existe para que el paquete quepa: su propia
  # cabecera cuenta que 8.255 líneas colgaron una revisión.
  normaliza() { python3 -c 'import os,sys
for l in sys.stdin:
    l = l.strip()
    if l: print(os.path.normpath(l))'; }

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
    done | sed 's|//|/|g; s|^\./||' | normaliza | sort -u
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
