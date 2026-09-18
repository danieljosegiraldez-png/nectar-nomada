-- Lo que un medicamento veterinario tiene y un saco de gallinaza no: los campos
-- del PRODUCTO. Botiquin, Tarea 1.
--
-- DEL PRODUCTO Y NO DEL FRASCO, y es la mitad del diseno: el Apivar de un
-- laboratorio es el mismo en todos los frascos. Pedir la casa farmaceutica en
-- cada compra hace que se escriba distinto cada vez — el problema que el
-- material en texto libre tenia antes de esta tabla.
--
-- NO SE INVENTAN: el ANEXO_G §5.1 cita el Reglamento (UE) 2019/6 art. 108, la
-- NOM-064-ZOO-2000 de Mexico, SENASA y el SAG.
--
-- LA CARENCIA «AUNQUE SEA CERO», palabras del reglamento. Nulo = sin declarar,
-- 0 = declarado cero: son afirmaciones distintas. Por eso ninguna columna lleva
-- DEFAULT 0 — un cero por defecto convertiria «nadie lo dijo» en «dijo cero».
--
-- LAS ADVERTENCIAS VAN EN EL MATERIAL Y NO EN LA PERSONA, decision de Daniel:
-- la alergia de un trabajador es dato de salud. «Usar guantes» protege igual y
-- no guarda la salud de nadie.
--
-- DOS CHECK EN LA BASE, no en la interfaz: una carencia o un plazo de aviso
-- negativos no significan nada, y un guion que rodee el servicio se topa igual
-- con la regla.

-- AlterTable
ALTER TABLE "traceability"."consumable_material"
  ADD COLUMN "is_veterinary_medicine" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "manufacturer" TEXT,
  ADD COLUMN "active_ingredient" TEXT,
  ADD COLUMN "sanitary_registration" TEXT,
  ADD COLUMN "default_withdrawal_days" INTEGER,
  ADD COLUMN "storage_conditions" TEXT,
  ADD COLUMN "safety_notes" TEXT,
  ADD COLUMN "avisar_dias_antes" INTEGER;

ALTER TABLE "traceability"."consumable_material"
  ADD CONSTRAINT "consumable_material_carencia_no_negativa"
  CHECK ("default_withdrawal_days" IS NULL OR "default_withdrawal_days" >= 0);
ALTER TABLE "traceability"."consumable_material"
  ADD CONSTRAINT "consumable_material_aviso_no_negativo"
  CHECK ("avisar_dias_antes" IS NULL OR "avisar_dias_antes" >= 0);
