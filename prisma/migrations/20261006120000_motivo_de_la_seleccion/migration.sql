-- El vocabulario de la selección deja de enseñar lo contrario de la regla (ADR-196, spec §3.3).
--
-- **El defecto que cierra.** `subdivisionReason` decía «el motivo por el que esto se partió», y una
-- selección no parte a su madre: el nombre enseñaba justo lo que ADR-196 niega. El campo, su nota y
-- el tipo pasan a nombrarse por lo que son.
--
-- **Por qué está escrito a mano.** Prisma no detecta renombres: para una columna propone
-- `DROP COLUMN` + `ADD COLUMN` —pérdida de datos— y para un enum propuso un intercambio de tipo que
-- «REVIENTA para cualquier fila», según la cabecera de 20260917192422_vocabulario_del_dueno. Las dos
-- migraciones de renombrado de esta casa están escritas a mano por lo mismo.
--
-- **Por qué `RENAME` y no un intercambio.** `ALTER TABLE ... RENAME COLUMN` y
-- `ALTER TYPE ... RENAME TO` preservan los datos por definición: renombran la etiqueta, no la fila.
-- No hace falta `USING` ni decidir qué pasa con ningún valor, y por eso esta migración es segura
-- aunque la cuenta de filas no se haya medido.
--
-- **Lo que NO arrastra.** `subdivision_reason` no tiene índices (0 de los 4 `@@index`/`@@unique` de
-- Location la nombran), ni `CHECK`, ni disparador, ni `DEFAULT`. El único sitio donde el tipo o las
-- columnas se nombran en las 203 migraciones anteriores es 20260813063826_f1_operacion_finca_esquema
-- (líneas 14, 43 y 44), que las creó.
--
-- **Los cuatro valores quedan intactos** (`altitude`, `shade`, `slope`, `other`): son el `value` de
-- los `<option>`, el sufijo de las claves i18n `motivo_${m}` y las etiquetas del tipo. Renombrar un
-- valor rompería un rótulo sin que lo viese ningún test.

-- **La cuenta de filas NO se midió.** La base que importa es producción y es de Daniel; una
-- sesión no la toca. `RENAME` preserva los datos por definición, así que esta migración es
-- correcta igualmente — pero queda dicho que no se contó, en vez de inventar una cifra.

ALTER TYPE "core"."SubdivisionReason" RENAME TO "MotivoDeSeleccion";

ALTER TABLE "core"."location" RENAME COLUMN "subdivision_reason" TO "motivo_de_la_seleccion";
ALTER TABLE "core"."location" RENAME COLUMN "subdivision_reason_note" TO "nota_del_motivo_de_la_seleccion";
