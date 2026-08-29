# 002 · Reconciliar `core.asset` con el bucket R2

**Estado:** aplazado a propósito. No bloqueado: **sin material**.

Verificado el 2026-08-20: las credenciales de R2 autentican, y **tanto
`core.asset` como el bucket `nectar-nomada` están vacíos**. La brecha de
respaldo de medios es real en el diseño y vacía en la práctica.

**Por qué está aplazado:** una herramienta de reconciliación escrita hoy se
probaría contra cero filas y cero objetos. Pasaría, no demostraría nada, y
habría que reescribirla cuando exista material real con sus casos raros
verdaderos.

**Qué lo desbloquearía:** que existan fotos reales. Entonces la herramienta
tiene contra qué probarse.

**Ojo con el orden:** primero llegan las fotos, después la reconciliación. Al
revés se construye contra un mundo imaginado.
