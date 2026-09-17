-- El material es unico SIN DISTINGUIR mayusculas ni espacios de borde.
--
-- CORRECCION de la migracion anterior, no una edicion de ella: aquella creo un
-- indice unico exacto sobre (organization_id, name), y eso deja pasar
-- «Aserrin» y «aserrin» como dos materiales distintos — que es exactamente el
-- problema que esta tabla existe para resolver. El texto libre volveria por la
-- puerta de atras.
--
-- Va en la BASE y no en el servicio a proposito: una comprobacion en codigo
-- tiene una carrera entre el SELECT y el INSERT, y dos operarios dando de alta
-- «melaza» a la vez crearian las dos. Un indice funcional no tiene esa carrera.
--
-- `btrim` ademas del `lower`: un espacio de mas al teclear no es un material
-- nuevo.

-- DropIndex
DROP INDEX "traceability"."consumable_material_organization_id_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "consumable_material_org_nombre_normalizado_key"
  ON "traceability"."consumable_material"("organization_id", (lower(btrim("name"))));
