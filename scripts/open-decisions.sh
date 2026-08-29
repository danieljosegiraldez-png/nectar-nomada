#!/usr/bin/env bash
# Corre la prueba de cada decisión que solo Daniel puede tomar y deja en pie
# solo las que siguen abiertas. Se ejecuta al arrancar la sesión; las
# sobrevivientes van al primer mensaje al dueño, ANTES de proponer trabajo.
#
# Convención: 0 = sigue abierta, 1 = cerrada, 2 = no se pudo determinar.
# «No se pudo determinar» NUNCA se reporta como cerrada: una línea ausente
# leída como una línea buena es lo que dejó 47 commits en un solo disco.
#
# Toda prueba pasó un flip-test: se construyó el mundo donde la cosa ya es
# cierta y el veredicto cambió.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

abiertas=0; cerradas=0; indeterminadas=0

probar() {
  local id="$1" pregunta="$2" cmd="$3"
  # Subshell obligatorio: un `exit 2` dentro de un `eval` mataría el script
  # entero y truncaría la lista sin decir nada.
  ( eval "$cmd" ) >/dev/null 2>&1
  case $? in
    0) printf '  ABIERTA  %-8s %s\n' "$id" "$pregunta"; abiertas=$((abiertas + 1)) ;;
    2) printf '  ??       %-8s %s  (no se pudo determinar)\n' "$id" "$pregunta"; indeterminadas=$((indeterminadas + 1)) ;;
    *) cerradas=$((cerradas + 1)) ;;
  esac
}

echo "Decisiones del dueño — $(date +%Y-%m-%d)"
echo

# P-A · La alerta de backup es local a esta máquina. Un portátil cerrado quince
# días no respalda nada y no dice nada. La respuesta real es un ping cuya
# AUSENCIA levante la alarma, y eso necesita un servicio externo que el proyecto
# no usa: es gasto y cuenta de Daniel, no una decisión técnica.
# La primera versión de esta prueba buscaba en scripts/ entero y encontró su
# PROPIO texto, así que reportó "cerrada": evidencia falsa a favor de la regla
# que estaba probando, fabricada por el error exacto que la regla describe.
# Ahora mira solo donde el ping viviría de verdad.
probar "P-A" "Alerta de backup fuera de esta máquina (un servicio externo)" \
  '! grep -rqiE "healthcheck|hc-ping|cronitor|deadman|uptimerobot" scripts/backup/'

# P-B · El dominio de marca sirve ESTA aplicación. /login y /signup del OS
# quedan expuestos en la URL pública. Comprobado contra el artefacto vivo.
probar "P-B" "www.nectarnomada.com expone el OS (/login, /signup) en la URL de marca" \
  'html=$(curl -sS -L --max-time 8 https://www.nectarnomada.com/ 2>/dev/null) || exit 2;
   [ -n "$html" ] || exit 2;
   printf "%s" "$html" | grep -q "href=\"/login\""'

# P-C · Casi nadie en la base tiene correo, y sin correo no hay contraseña.
# Quién recibe acceso es decisión del dueño, no del sistema. Sin artefacto
# propio: aterriza como ADR en docs/architecture/DECISIONS.md con esa frase.
probar "P-C" "Quiénes reciben correo y acceso (hoy solo Daniel y José lo tienen)" \
  '! grep -qi "correos de las personas" docs/architecture/DECISIONS.md'

# P-D · La familia Huerbsch es dueña de Finca Rosina y NO está en la base como
# Personas. Daniel suministra nombres y roles; no se inventan filas de Persona.
probar "P-D" "Nombres y roles de la familia Huerbsch como Personas" \
  '! grep -qi "huerbsch registrada" docs/architecture/DECISIONS.md'

# P-E · Destino de backup fuera de la máquina. Un shell sin NN_BACKUP_DIR
# escribe en ~/nectar-backups, es decir NO fuera de la máquina; ya pasó y dejó
# la única copia de producción en un portátil. Esta prueba debe salir CERRADA
# hoy: si toda la tabla dijera "abierta" no sabrías si el mecanismo discrimina.
probar "P-E" "Destino de backup fuera de la máquina configurado" \
  '! grep -q "NN_BACKUP_DIR" "$HOME/.zshrc"'

echo
[ "$indeterminadas" -gt 0 ] && echo "$indeterminadas prueba(s) sin determinar. Eso NO es \"cerrada\"."
if [ "$abiertas" -gt 0 ]; then
  echo "$abiertas abiertas, $cerradas cerradas."
  echo "Las abiertas van al primer mensaje a Daniel, antes de proponer trabajo."
else
  echo "Ninguna abierta. $cerradas cerradas."
fi
