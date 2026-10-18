-- Retirar un equipo (Parte 2c, §4.5; decisión D3 de Daniel, 2026-10-04): con fecha y con motivo.
--
-- Hasta hoy nada retiraba un equipo: `lifecycle_status` existe desde 20260914180000_equipos_e_instrumentos y ninguna
-- ruta de la aplicación lo escribía. Estas dos columnas son lo que `retirarEquipo` guarda: la fecha del servidor y el motivo,
-- que es obligatorio. Se quedan nulas mientras el equipo está activo, y `reactivarEquipo` las devuelve a nulo (el motivo de
-- reactivar vive en la auditoría, junto al retiro que se deshace). Retirar no borra nada: el equipo conserva sus traslados,
-- sus informes de condición y lo que se midió con él.
ALTER TABLE "core"."equipment" ADD COLUMN "retired_at" TIMESTAMP(3),
ADD COLUMN "retiro_motivo" TEXT;

-- Un `retired` dice cuándo y por qué. NOT VALID, a propósito: desde aquí no se puede contar cuántas filas `retired` hay en
-- producción —la aplicación no las escribía, pero un guion o SQL directo sí pudo— y fabricarles fecha y motivo sería inventar
-- un hecho (precedente: 20260918150000_colonia_genealogia). NOT VALID no revisa lo que ya existe y sí toda fila nueva o
-- actualizada. Consecuencia, dicha para que nadie la descubra tarde: una fila `retired` vieja SIN fecha no se podría ni editar
-- mientras siga así; `reactivarEquipo` sí puede con ella, porque escribe `active`. Cuando se mida producción y no quede
-- ninguna, `ALTER TABLE "core"."equipment" VALIDATE CONSTRAINT "equipment_retiro_completo"` la vuelve plena.
--
-- La condición NO es simétrica: un `active` con fecha no se rechaza aquí; lo evita `reactivarEquipo`, que limpia las dos columnas.
ALTER TABLE "core"."equipment" ADD CONSTRAINT "equipment_retiro_completo"
  CHECK ("lifecycle_status" <> 'retired'
         OR ("retired_at" IS NOT NULL AND "retiro_motivo" IS NOT NULL AND btrim("retiro_motivo") <> '')) NOT VALID;
