# 001 · Aviso cuando un backup **no** corre

**Estado: el código está, la URL no.** P-A sigue abierta, y con razón: hoy no
hay alerta fuera de esta máquina.

## Lo que ya está hecho (2026-08-31)

`scripts/backup/run-scheduled.sh` manda el ping de healthchecks.io:

- **`/start`** al empezar, para distinguir una corrida colgada de una que nunca
  empezó.
- **El ping de éxito va después de `backup:verify`, no de `backup:db`.** Un ping
  que sólo dijera «el script terminó» reproduciría exactamente el fallo que esto
  existe para atrapar: un conjunto que existe y no restaura.
- **`/fail`** cuando falla, para que el aviso diga «falló» en vez de esperar el
  periodo de gracia y decir «tarde». No significan lo mismo para quien lo lee.
- **El camino de «destino no montado» no manda nada, a propósito.** Su silencio
  *es* la señal — es el sentido entero de un vigilante de hombre muerto.
- Best-effort como todo lo demás en ese script: que el servicio de monitoreo
  esté caído no puede ser nunca la razón de que un backup no corra.

## Lo que falta: la URL

**Comprobado el 2026-08-29:** la URL que se probó devuelve
`HTTP 400 invalid url format`. El UUID no es válido para healthchecks.io.

La variable vive en `~/.config/nectar-nomada/backup.env`, **fuera de todo
repositorio**, en modo 600. Una URL de ping es una credencial de capacidad:
quien la tenga puede señalar «el backup salió bien» y tapar un fallo real. Por
eso no va en un archivo versionado, donde gitignorarla después no serviría de
nada. El log registra **si** el ping salió, nunca la URL.

Hoy la línea está comentada. Con eso, el ping no se manda y el backup se
comporta exactamente como antes.

## Cómo se cierra

1. Crear el check en healthchecks.io y copiar su URL real.
2. Descomentar `NN_HEALTHCHECK_URL` en `~/.config/nectar-nomada/backup.env`.
3. `launchctl kickstart -k gui/$(id -u)/com.nectarnomada.backup` — **no desde un
   shell**: el fallo original de ADR-089 sólo aparecía bajo el entorno de
   launchd.
4. Comprobar que el check pasa a «up» en healthchecks.io, y que el log dice
   `ping /start enviado` y `ping /success enviado`.

**La prueba de P-A comprueba las dos mitades** —que el código mande el ping y
que exista una URL configurada— porque con una sola no hay alarma. Se cierra
sola en cuanto las dos estén.

## Por qué la prueba cambió dos veces

La primera buscaba `healthcheck|hc-ping|cronitor` en `scripts/` y **encontró su
propio texto**, reportando «cerrada». La segunda buscaba el nombre del servicio
en `scripts/backup/`, y dejó de servir en cuanto el ping pasó a usar una
variable: el nombre ya no aparece en ninguna línea, así que habría dicho
«abierta» para siempre por la razón equivocada — que es tan inútil como decir
«cerrada» por la razón equivocada.
