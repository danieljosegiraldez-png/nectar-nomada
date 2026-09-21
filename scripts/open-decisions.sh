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
# OD_SIN_RED=1 hace que las pruebas que salen a la red se declaren
# "no se pudo determinar" sin intentarlo. Existe para que un test pueda
# comprobar que el mecanismo sigue entero SIN meter la red en la compuerta:
# un guardia que se pone rojo por una wifi mala enseña a ignorar una línea roja.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

abiertas=0; cerradas=0; indeterminadas=0; rotas=0

probar() {
  local id="$1" pregunta="$2" cmd="$3"
  # Subshell obligatorio: un `exit 2` dentro de un `eval` mataría el script
  # entero y truncaría la lista sin decir nada.
  ( eval "$cmd" ) >/dev/null 2>&1
  local codigo=$?
  case $codigo in
    0) printf '  ABIERTA  %-8s %s\n' "$id" "$pregunta"; abiertas=$((abiertas + 1)) ;;
    1) cerradas=$((cerradas + 1)) ;;
    2) printf '  ??       %-8s %s  (no se pudo determinar)\n' "$id" "$pregunta"; indeterminadas=$((indeterminadas + 1)) ;;
    # SOLO el 1 cierra. Un 127 (orden inexistente), un 126 (sin permiso de
    # ejecución) o cualquier otro código es una prueba ROTA, no un veredicto.
    # Antes caían en el comodín y contaban como "cerrada": una decisión que
    # solo Daniel puede tomar desaparecía del primer mensaje por una errata.
    *) printf '  ROTA     %-8s %s  (la prueba salió %s; NO es un veredicto)\n' "$id" "$pregunta" "$codigo"
       rotas=$((rotas + 1)) ;;
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
# La segunda versión buscaba el nombre del servicio dentro de scripts/backup/.
# Dejó de servir en cuanto el código pasó a mandar el ping a una URL guardada en
# una variable: el nombre del servicio ya no aparece en ninguna línea, así que
# la prueba habría dicho "abierta" para siempre por la razón equivocada.
#
# Ahora se comprueban las DOS mitades, que es lo que hace falta para que exista
# una alerta de verdad: que el código mande el ping, y que haya una URL
# configurada fuera del repositorio. Con una sola de las dos no hay alarma.
probar "P-A" "Alerta de backup fuera de esta máquina (código + URL configurada)" \
  'codigo=0; url=0;
   grep -q "ping_health" scripts/backup/run-scheduled.sh && codigo=1;
   grep -qE "^[[:space:]]*(export[[:space:]]+)?NN_HEALTHCHECK_URL=.?https" "$HOME/.config/nectar-nomada/backup.env" 2>/dev/null && url=1;
   [ "$codigo" = 1 ] && [ "$url" = 1 ] && exit 1 || exit 0'

# P-B · El dominio de marca sirve ESTA aplicación. /login y /signup del OS
# quedan expuestos en la URL pública. Comprobado contra el artefacto vivo.
probar "P-B" "www.nectarnomada.com expone el OS (/login, /signup) en la URL de marca" \
  '[ -n "${OD_SIN_RED:-}" ] && exit 2;
   resp=$(curl -sS -L --max-time 8 -w "\n%{http_code}" https://www.nectarnomada.com/ 2>/dev/null) || exit 2;
   codigo=${resp##*$'"'"'\n'"'"'}; cuerpo=${resp%$'"'"'\n'"'"'*};
   [ "$codigo" = 200 ] || exit 2;
   [ -n "$cuerpo" ] || exit 2;
   printf "%s" "$cuerpo" | grep -q "href=\"/login\""'

# P-F · CORREGIDO EL 2026-09-17: eran tres guías y son CINCO. Las dos nuevas -Varroa y
# Meliponini (ADR-158)- tienen la misma forma: umbrales y dosis sin fuente citada.
#
# Tres guías de proceso -pH, Brix, subproductos- entraron el 2026-09-13 en
# docs/dominio/ redactadas por un modelo a partir de indicaciones de Daniel y SIN
# que él las repase. Traen matrices de umbrales con pinta de norma y frases como
# "PELIGRO: lave el café de inmediato". Mientras sigan sin revisar, ninguna
# alerta ni validación del software puede apoyarse en ellas (CLAUDE.md §32), así
# que la decisión no es técnica: es que Daniel las lea y diga cuáles respalda.
#
# Se mira la LÍNEA DE ESTADO y no la frase suelta. La primera versión buscaba
# "pendiente de revisi" en todo el archivo y la encontraba SIEMPRE, porque la
# propia cabecera explica qué no puede hacer un borrador usando esas palabras:
# P-F no habría podido cerrarse nunca, ni después de que Daniel los aprobara. Lo
# cazó el flip-test de la dirección contraria, no leer el código.
#
# La carpeta AUSENTE sale 2 y no 1, a propósito. Cerrar por ausencia es el error
# que P-A cometió: una prueba que se apaga sola cuando desaparece aquello que
# vigila informa de "resuelto" cuando lo que hay es "ya no miro".
probar "P-F" "Revisar las guías de docs/dominio (hoy: borrador de IA sin revisar)" \
  '[ -d docs/dominio ] || exit 2;
   docs=$(ls docs/dominio/*.md 2>/dev/null | grep -v README.md);
   [ -n "$docs" ] || exit 2;
   grep -lq "^  estado    : borrador" $docs 2>/dev/null && exit 0 || exit 1'

# P-C · Casi nadie en la base tiene correo, y sin correo no hay contraseña.
# Quién recibe acceso es decisión del dueño, no del sistema. Sin artefacto
# propio: aterriza como ADR en docs/architecture/DECISIONS.md con esa frase.
probar "P-C" "Quiénes reciben correo y acceso (hoy solo Daniel y José lo tienen)" \
  '! grep -qiE "^## ADR-[0-9]+.*correos de las personas" docs/architecture/DECISIONS.md'

# P-D · La familia Huerbsch es dueña de Finca Rosina. La premisa original de
# esta prueba decía que NO estaban en la base como Personas; medido contra
# producción el 2026-08-29, sí lo están — Bob, Sherry y Chris, con sus cargos,
# desde A7. Lo que faltaba era el ADR, que es lo único que esta prueba mira.
# Ver ADR-106. Sigue valiendo: no se inventan filas de Persona.
probar "P-D" "Nombres y roles de la familia Huerbsch como Personas" \
  '! grep -qiE "^## ADR-[0-9]+.*huerbsch registrada" docs/architecture/DECISIONS.md'

# P-E · Destino de backup fuera de la máquina. Un shell sin NN_BACKUP_DIR
# escribe en ~/nectar-backups, es decir NO fuera de la máquina; ya pasó y dejó
# la única copia de producción en un portátil. Esta prueba debe salir CERRADA
# hoy: si toda la tabla dijera "abierta" no sabrías si el mecanismo discrimina.
probar "P-E" "Destino de backup fuera de la máquina configurado" \
  '! grep -qE "^[[:space:]]*export[[:space:]]+NN_BACKUP_DIR=\"?[^\"[:space:]]" "$HOME/.zshrc"'

# P-G, P-H, P-I · Las tres que dejó abiertas el PR #435 (catálogos y modelos de
# equipo, ADR-172). Ninguna cambia un artefacto por sí sola, así que aterrizan
# como P-C: un ADR cuyo encabezado lleve la frase de la prueba.
# P-G · «Quién lo hizo» en una rutina ofrece a todas las personas activas de la
# plataforma, como inspecciones y trampas: un operario ve nombres de otras
# organizaciones. Acotarlo por sitio es transversal y no se decidió en #435.
probar "P-G" "Quién aparece en «quién lo hizo» (hoy: toda la plataforma)" \
  '! grep -qiE "^## ADR-[0-9]+.*quién lo hizo acotado" docs/architecture/DECISIONS.md'

# P-H · Un modelo de equipo retirado no se puede des-retirar, y su nombre queda
# reservado. Añadir la acción es fácil; si debe existir, no.
probar "P-H" "Des-retirar un modelo de equipo (hoy: no se puede)" \
  '! grep -qiE "^## ADR-[0-9]+.*des-retirar modelos" docs/architecture/DECISIONS.md'

# P-I · El proveedor de un equipo sólo puede ser una organización `supplier`
# aprobada, y darlas de alta va por la vía de organizaciones de siempre.
probar "P-I" "Cómo se da de alta un proveedor de equipos" \
  '! grep -qiE "^## ADR-[0-9]+.*alta de proveedores" docs/architecture/DECISIONS.md'

echo
[ "$indeterminadas" -gt 0 ] && echo "$indeterminadas prueba(s) sin determinar. Eso NO es \"cerrada\"."
if [ "$rotas" -gt 0 ]; then
  echo "$rotas prueba(s) ROTAS. Arréglalas antes de creer esta tabla."
fi
if [ "$abiertas" -gt 0 ]; then
  echo "$abiertas abiertas, $cerradas cerradas."
  echo "Las abiertas van al primer mensaje a Daniel, antes de proponer trabajo."
else
  echo "Ninguna abierta. $cerradas cerradas."
fi


# Línea legible por máquina, para que un test pueda comprobar que el mecanismo
# sigue entero sin meter la red en la compuerta: si alguien añade una decisión
# y su prueba se rompe en silencio, los totales dejan de cuadrar.
echo "TOTAL abiertas=$abiertas cerradas=$cerradas indeterminadas=$indeterminadas rotas=$rotas"

[ "$rotas" -eq 0 ] || exit 3
