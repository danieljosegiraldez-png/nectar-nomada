# 001 · Aviso cuando un backup **no** corre

**Estado:** aplazado. **Bloquea:** P-A.

**El problema real no es que el backup falle: es que calle.** Falló en silencio
seis días (2026-08-20 → 08-26). El envoltorio escribía su log dentro de Google
Drive; el File Provider devolvía `EDEADLK` al añadir, y como el backup corría
como `backup-db.sh >> "$LOG"`, un redirect que no se puede abrir significa que
**el backup no corrió nunca**.

Lo que hay hoy, después del arreglo: log fuera de Drive, escrituras
best-effort, notificación de macOS, `BACKUP-FAILED.txt` junto a los backups, y
un trap que borra el conjunto parcial (el podador conserva los N más nuevos
**por nombre**, así que un fallo podía desalojar un backup bueno).

**Lo que sigue sin cubrir:** todas esas señales son **locales a este portátil**.
Un portátil cerrado quince días no respalda nada y no dice nada. `launchctl list
| grep nectar` es el único rastro pasivo, y hay que acordarse de mirarlo.

**Qué lo desbloquearía:** un servicio externo cuyo *silencio* levante la alarma
— un ping periódico con vigilante de hombre muerto. Es cuenta y gasto de
Daniel, por eso es P-A y no una tarea técnica.

**Cuando llegue:** el ping se manda **después** de que `backup:verify` pase, no
al terminar `backup:db`. Un ping que solo dice «el script terminó» reproduce
exactamente el fallo que estamos intentando cerrar.

**Verificar los cambios de launchd con
`launchctl kickstart -k gui/$(id -u)/com.nectarnomada.backup`, no desde un
shell:** el fallo original solo aparecía bajo el entorno de launchd.
