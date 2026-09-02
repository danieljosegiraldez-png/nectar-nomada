#!/usr/bin/env bash
# ¿Se puede cerrar la sesión sin dejar nada roto?
#
# §5 de SESSION_STATE.md describe el cierre en prosa. Esa prosa se re-tecleó a
# mano seis veces el 2026-08-31 y **una salió mal**: la comprobación de sincronía
# trataba cualquier archivo sucio —incluido uno *sin seguimiento* de otra
# sesión— como razón para no sincronizar, así que el checkout se quedó detrás de
# un merge propio y el informe dio 11 pruebas donde había 14. Un archivo sin
# seguimiento no impide un fast-forward: la propiedad es «¿chocaría el pull?»,
# no «¿hay algo sucio?».
#
# Esto NO commitea, NO empuja y NO borra. Sólo mira y dice. Los pasos con juicio
# —actualizar el estado, escribir la lección, decidir qué se estaciona— siguen
# siendo del que cierra.
#
#   bash scripts/cierre-de-sesion.sh            # completo, con compuerta
#   bash scripts/cierre-de-sesion.sh --rapido   # sin compuerta (ya la corriste)
set -uo pipefail
cd "$(dirname "$0")/.."

RAPIDO=0
[ "${1:-}" = "--rapido" ] && RAPIDO=1
FALLOS=0
mal() { printf '  ✗ %s\n' "$1"; FALLOS=$((FALLOS + 1)); }
bien() { printf '  ✓ %s\n' "$1"; }
nota() { printf '  · %s\n' "$1"; }

# Qué repositorio es, dicho por el propio repositorio.
#
# El 2026-09-02 creé dos veces un worktree desde el checkout equivocado y
# corrí el cierre del repo que no era, rotulándolo como el otro. La segunda
# vez llevaba una comprobación de identidad puesta a mano en el comando: la
# imprimió vacía y la leí por encima. Un dato que hay que cotejar se pasa por
# alto; uno que sale en la cabecera del informe, no.
REPO=$(node -p "require('./package.json').name" 2>/dev/null || basename "$(pwd)")
echo "Cierre de «$REPO» · $(git rev-parse --short HEAD)"

echo "── Árbol ───────────────────────────────────────────────────────────────"
git fetch origin --quiet 2>/dev/null || nota "sin red: se compara contra el último fetch"
HEAD_SHA=$(git rev-parse HEAD)
MAIN_SHA=$(git rev-parse origin/main 2>/dev/null || echo "")
RAMA=$(git branch --show-current)
# Con HEAD desacoplada `git branch --show-current` devuelve vacío, y los
# mensajes salían como «estás en «», no en main». El veredicto era correcto
# —una HEAD suelta no es main— pero se leía como un fallo del script. Y el
# consejo tampoco valía: en desacoplado un pull no adelanta ninguna rama, que
# es un problema distinto y peor de explicar después.
if [ -n "$RAMA" ]; then
  RAMA_TXT="«$RAMA»"
  AVISO_RAMA="un pull aquí mueve esa rama"
else
  RAMA_TXT="HEAD desacoplada, sin rama"
  AVISO_RAMA="un pull aquí no actualiza ninguna rama y lo que commitees se queda sin referencia"
fi
# Sólo lo con seguimiento bloquea un fast-forward.
SUCIOS=$(git status --porcelain | grep -vc '^??' || true)
SIN_SEG=$(git status --porcelain | grep -c '^??' || true)
# La rama se nombra SIEMPRE. Decir «en origin/main» porque el SHA coincide es
# reconocer una forma, no una propiedad: el 2026-09-01 otra sesión dejó el
# checkout compartido en una rama suya que apuntaba al mismo commit, este script
# dijo «✓ en origin/main», y el `git pull --ff-only origin main` de mi barrido
# adelantó **la rama ajena**. Se restauró sin pérdida, pero nada lo habría dicho.
if [ "$HEAD_SHA" = "$MAIN_SHA" ] && [ "$RAMA" = "main" ]; then
  bien "en main, al día con origin/main ($(git rev-parse --short HEAD))"
elif [ "$HEAD_SHA" = "$MAIN_SHA" ]; then
  mal "estás en $RAMA_TXT, no en main — apunta al mismo commit, pero no es lo mismo: $AVISO_RAMA"
elif [ -n "$MAIN_SHA" ] && git merge-base --is-ancestor "$HEAD_SHA" "$MAIN_SHA" 2>/dev/null; then
  mal "detrás de origin/main por $(git rev-list --count "$HEAD_SHA".."$MAIN_SHA") commit(s) — sincroniza"
elif [ -n "$MAIN_SHA" ] && git merge-base --is-ancestor "$MAIN_SHA" "$HEAD_SHA" 2>/dev/null; then
  mal "$(git rev-list --count "$MAIN_SHA".."$HEAD_SHA") commit(s) SIN EMPUJAR en $RAMA_TXT"
else
  mal "$RAMA_TXT y origin/main han divergido"
fi
[ "$SUCIOS" -eq 0 ] && bien "sin cambios con seguimiento sin commitear" \
                     || mal "$SUCIOS archivo(s) con seguimiento sin commitear"
[ "$SIN_SEG" -gt 0 ] && nota "$SIN_SEG sin seguimiento (pueden ser de otra sesión; no bloquean un fast-forward)"

echo "── Trabajo sin empujar en otros worktrees ──────────────────────────────"
AJENOS=0
while read -r RUTA _ RAMA_W; do
  [ -d "$RUTA" ] || continue
  [ "$RUTA" = "$(pwd)" ] && continue
  RAMA_W=${RAMA_W#[}; RAMA_W=${RAMA_W%]}
  UP=$(git -C "$RUTA" rev-parse --abbrev-ref '@{u}' 2>/dev/null || echo "")
  if [ -z "$UP" ]; then
    nota "$(basename "$RUTA") [$RAMA_W] sin rama remota"
    AJENOS=$((AJENOS + 1))
  elif [ "$(git -C "$RUTA" rev-list --count "$UP"..HEAD 2>/dev/null || echo 0)" -gt 0 ]; then
    nota "$(basename "$RUTA") [$RAMA_W] tiene commits sin empujar"
    AJENOS=$((AJENOS + 1))
  fi
done < <(git worktree list)
[ "$AJENOS" -eq 0 ] && bien "ningún worktree con trabajo sin empujar"
nota "los worktrees ajenos NO son de esta sesión: se informan, no se tocan"

echo "── Estado y decisiones ─────────────────────────────────────────────────"
node scripts/check-state-budget.mjs > /tmp/cierre-estado.txt 2>&1
if [ $? -eq 0 ]; then
  head -1 /tmp/cierre-estado.txt | sed 's/^✓ /  ✓ /'
  grep -q "⚠" /tmp/cierre-estado.txt && sed -n '/⚠/,$p' /tmp/cierre-estado.txt | sed 's/^/  · /'
else
  mal "el presupuesto de SESSION_STATE.md está excedido"
fi
bash scripts/open-decisions.sh > /tmp/cierre-dec.txt 2>&1
ROTAS=$(grep -oE "rotas=[0-9]+" /tmp/cierre-dec.txt | head -1 | cut -d= -f2)
[ "${ROTAS:-0}" -eq 0 ] && bien "pruebas de decisión: $(grep -oE 'TOTAL.*' /tmp/cierre-dec.txt | head -1)" \
                        || mal "hay ${ROTAS} prueba(s) de decisión ROTAS"

echo "── Procesos y disco ────────────────────────────────────────────────────"
LIBRE_KB=$(df -k /System/Volumes/Data 2>/dev/null | awk 'NR==2{print $4}')
LIBRE_GB=$(( ${LIBRE_KB:-0} / 1024 / 1024 ))
if [ "${LIBRE_KB:-0}" -lt 2097152 ]; then
  mal "quedan ${LIBRE_GB} GB libres: un npm ci necesita ~0,9 GB (ver CLAUDE.md)"
else
  bien "${LIBRE_GB} GB libres"
fi

if [ "$RAPIDO" -eq 0 ]; then
  echo "── Compuerta ───────────────────────────────────────────────────────────"
  bash scripts/ci.sh > /tmp/cierre-ci.txt 2>&1
  COMP=$?
  [ "$COMP" -eq 0 ] && bien "scripts/ci.sh = 0 ($(grep -oE 'Tests +[0-9]+ passed' /tmp/cierre-ci.txt | tail -1))" \
                    || mal "scripts/ci.sh = $COMP — mira /tmp/cierre-ci.txt"
else
  nota "compuerta omitida (--rapido)"
fi

echo "────────────────────────────────────────────────────────────────────────"
if [ "$FALLOS" -eq 0 ]; then
  echo "  Se puede cerrar. Falta el juicio: estado al día, lección escrita donde"
  echo "  se cargue, y decir qué queda VERIFICADO y qué ASUMIDO."
  exit 0
fi
echo "  $FALLOS cosa(s) que arreglar antes de cerrar."
exit 1
