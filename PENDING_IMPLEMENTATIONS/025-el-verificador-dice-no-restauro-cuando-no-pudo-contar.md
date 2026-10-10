# 025 · El verificador de backup dice «no restauró» cuando lo que no pudo fue CONTAR

**Estado: HECHO el 2026-10-06.** Y el diagnóstico que esta ficha traía era **más flojo que la
realidad**: decía que el censo falló. Midiéndolo para arreglarlo salió que el fallo estaba **dentro
de la rama PASS**, después de que el `diff` ya hubiera probado que la copia era idéntica. Ver «Lo
que resultó ser, al arreglarlo» al final.

## El incidente

El 2026-10-05 a las 14:01:31Z el backup programado anunció:

```
=== 2026-10-05T14:01:31Z FAILED — a backup was written but did NOT restore ===
    ping /fail enviado
```

Mandó su `/fail` a healthchecks.io, escribió `BACKUP-FAILED.txt` en el destino y lanzó la
notificación con sonido `Basso`. `launchctl list` quedó con último estado **1**.

**Y el backup restauraba perfectamente.** Las líneas de encima del veredicto, en el mismo log:

```
  restored with no errors
  la copia pliega las mayúsculas acentuadas, como producción
Recomputing row census on the restored copy...
  wc: stdin: read: Resource deadlock avoided
```

O sea: la restauración **sí** ocurrió y sin errores; lo que murió fue el **recuento de filas** que
viene después.

## Por qué el veredicto sale invertido

`verify-restore.sh` corre con `set -euo pipefail`. El censo es la línea 170:

```bash
row_census "$RESTORED" > "$WORK_DIR/restored-rowcounts.tsv"
```

Si eso falla, `set -e` **aborta el guion antes de llegar a NINGUNA de sus dos ramas de veredicto**
—ni la de `PASS` ni la de `FAIL — restored copy does not match`—. `run-scheduled.sh:128` sólo ve un
código distinto de cero y traduce:

```bash
if ! bash scripts/backup/verify-restore.sh >>"$LOG" 2>&1; then
  announce_failure "a backup was written but did NOT restore"
```

**El comentario de esas líneas dice literalmente que el texto está elegido a propósito** para
distinguir un dump fallido de un set irrecuperable. La distinción es buena; le falta la tercera
posibilidad: **«no se pudo medir»**.

## El control que lo demuestra, y sale distinto

| set | `verified_result` en su MANIFEST | `census-mismatch.diff` |
|---|---|---|
| `2026-10-05T140002Z` (el que «no restauró») | **0** | **0** |
| `2026-10-01T011821Z` (bueno anterior) | **1** | — |
| `2026-10-06T041156Z` (verificado el 2026-10-06) | **1**, `PASS (216 tables, 15315 rows, restore errors: 0)` | — |

Un cero en las dos columnas del primero sólo puede significar que el guion murió **antes** de las
dos ramas: la de `PASS` escribe `verified_result`, y la de `FAIL` escribe además el diff. Las otras
dos filas prueban que esas ramas sí escriben cuando se llega a ellas.

## Lo que NO se determinó, dicho en vez de inventado

**La causa del `wc: Resource deadlock avoided` no está reproducida.** El archivo
(`rowcounts.tsv`) vive en Google Drive CloudStorage, lo que hace plausible un bloqueo de lectura de
su sistema de archivos — pero **10 intentos de `wc -l < archivo` sobre el mismo fichero dieron 216
las diez veces**, con su control sobre una copia local dando lo mismo. Así que es intermitente y
no se sabe de qué. No se escribe una causa que no se midió.

Y vale la pena notar que el `wc` aparece en **dos** sitios que leen ese mismo fichero del Drive:
`backup-db.sh:107` y `verify-restore.sh:173`. El del censo está dentro de `row_census`
(`pg-tools.sh`).

## Qué lo arregla

**Separar «no pudo medir» de «no restauró»**, que es lo único que no depende de conocer la causa:

1. Capturar el fallo del censo por su cuenta en vez de dejar que `set -e` lo convierta en el
   código de salida genérico — por ejemplo con su propio `if ! row_census …`.
2. Darle a `run-scheduled.sh` un tercer mensaje: **«a backup was written and restored, but the
   census could not be computed»**. **El `/fail` se manda igual** —no restaurar y no poder
   comprobarlo merecen los dos una alarma— así que el arreglo no silencia nada: sólo deja de
   mentir sobre cuál de los dos pasó.
3. Y un reintento del censo antes de rendirse, por la misma razón que la casa ya reintenta la
   limpieza de directorios temporales: un error de recurso transitorio no es un veredicto.

## Por qué importa más que un mensaje mal puesto

P-A existe para que un backup que falla **no pase desapercibido**, y su prueba exige las dos
mitades: el código del ping y la URL activa. Una alarma que grita «no restauró» sobre un backup que
restaura enseña a ignorarla — y el `CLAUDE.md` de esta máquina lo dice con esas palabras: «un
guardia que nunca puede pasar es peor que ninguno: enseña a ignorar una línea roja».

Es además la forma que ese archivo ya nombra: **«no pude medir» y «salió mal» son la misma cadena
de caracteres si nadie lo comprueba.** Aquí lo eran literalmente.

## Estado del backup ahora, para que nadie lo lea mal

El set al que apunta `latest` —`2026-10-06T041156Z`— **está verificado**: `npm run backup:verify`
salió **0** con `PASS — 216 tables, 15315 rows, every count identical`, checksums del manifiesto
correctos, y la copia plegando mayúsculas acentuadas como producción. **Hay punto de restauración.**

Lo que sigue desfasado es el rastro: `BACKUP-FAILED.txt` del 2026-10-05 sigue en el destino, y el
log no tiene línea de veredicto para el set del 06 porque la verificación se corrió a mano y no por
`run-scheduled.sh`. El marcador lo borra solo la siguiente corrida programada que salga bien
(`run-scheduled.sh:106`, vía `clear_failure_marker`).

---

## Lo que resultó ser, al arreglarlo — 2026-10-06

**El fallo no estaba en el censo: estaba DESPUÉS de que el censo ya hubiera coincidido.** El `wc`
que murió es el de la línea 173, **dentro de la rama PASS**, calculando las cifras de adorno del
mensaje de éxito —y leyéndolas del `rowcounts.tsv` del **destino**, que vive en Google Drive—.

**Probado con dos hechos, no deducido:**

- `row_census` (`pg-tools.sh:136-150`) **no contiene ningún `wc`**, así que el `wc` del log no pudo
  venir de ahí.
- La rama `FAIL` escribe `census-mismatch.diff` (`verify-restore.sh:193`), y ese archivo **no
  existe** en el set del 2026-10-05. Luego el `diff` había pasado y se estaba en la rama `PASS`.

O sea: **el backup del 2026-10-05 ya se había demostrado idéntico, y la alarma dijo «did NOT
restore».** Peor de lo que esta ficha describía.

## Cómo quedó

1. **Las cifras del mensaje se leen de la copia LOCAL**, que el `diff` acaba de probar idéntica, en
   vez del fichero del destino. El Drive sale del camino del éxito.
2. **Y aunque esa lectura falle, el veredicto no cambia:** son cifras de adorno, con su valor por
   defecto. Un fallo al formatear no puede volver rojo lo que ya está verde.
3. **El censo se reintenta 3 veces** y, si de verdad no se puede calcular, sale con **código 2** y
   escribe `verified_result: SIN VEREDICTO` — en vez de dejar que `set -e` lo convierta en un
   código genérico.
4. **`run-scheduled.sh` distingue el 2** y dice «a backup was written and RESTORED, but its census
   could not be computed — unverified, not broken». **El `/fail` se manda igual** en los dos casos:
   no poder comprobar un backup merece alarma tanto como no poder restaurarlo. Lo único que cambia
   es que deja de afirmar cuál de los dos fue cuando no lo sabe.

## El flip, con sus tres mundos y un cuarto que casi se colÓ

| mundo | salida | qué dice |
|---|---|---|
| el backup real, sin mutar | **0** | `PASS — 216 tables, 15315 rows, every count identical` |
| la cifra de adorno ilegible (lo que mató al guion el 05) | **0** | `PASS — (no se pudo contar) tables, 15315 rows` |
| el censo imposible (3 intentos) | **2** | `SIN VEREDICTO — la copia restauró, pero el censo no se pudo calcular` |

Y la traducción de `run-scheduled.sh`, ejercida con los tres códigos: 2 → «census could not be
computed», 1 → «did NOT restore», 0 → no anuncia nada.

**El cuarto, y es el que más enseña: la primera versión del arreglo estaba ROTA y repetía el
defecto que venía a arreglar.** Capturaba el código con `$?` **dentro del `then` de un `if ! cmd`**,
y ahí `$?` vale **0** —la negación es lo que tuvo éxito—, así que habría caído siempre en el `else`
y dicho «did NOT restore». Reproducido antes de corregirlo: `if ! bash -c "exit 2"` da `$? = 0`;
`bash -c "exit 2" || c=$?` da **2**. Es la familia del `echo` que tapa el código de salida, que la
memoria de esta máquina ya tiene escrita, reincidida dentro del arreglo de un defecto de la misma
forma.

## Higiene

Las corridas del flip escriben en el `MANIFEST.txt` del set que verifican. Dos de las mías
acabaron en el **real** —una con el texto de un guion mutado, `PASS ((no se pudo contar) tables)`,
que es una entrada engañosa en el registro de un backup— y se quitaron: de **7** líneas
`verified_result` a **5**, conservando la verificación legítima de las 04:48 y con el checksum del
dump **idéntico** antes y después. El resto del flip se corrió contra una **copia** del set en
`/tmp`, no contra el original.
