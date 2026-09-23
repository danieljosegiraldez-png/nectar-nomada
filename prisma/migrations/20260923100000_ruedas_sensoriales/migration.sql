-- Herramientas sensoriales, pieza 1: vocabulario versionado de ruedas.
CREATE TYPE "sensory"."SensoryWheelDomain" AS ENUM ('arabica_coffee', 'robusta_coffee', 'honey', 'wine', 'beer', 'mead', 'cider');
CREATE TYPE "sensory"."SensoryWheelVersionStatus" AS ENUM ('draft', 'published', 'superseded');
CREATE TYPE "sensory"."SensoryWheelNodeLevel" AS ENUM ('family', 'subfamily', 'descriptor');
CREATE TYPE "sensory"."SensoryWheelReferenceModality" AS ENUM ('aroma', 'flavor', 'both');

CREATE TABLE "sensory"."sensory_wheel" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "domain" "sensory"."SensoryWheelDomain" NOT NULL,
  "title" TEXT NOT NULL,
  "is_public" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensory_wheel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sensory_wheel_domain_key" ON "sensory"."sensory_wheel"("domain");

CREATE TABLE "sensory"."sensory_wheel_version" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "wheel_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "source_author" TEXT NOT NULL,
  "source_reference" TEXT NOT NULL,
  "license" TEXT NOT NULL,
  "permission_note" TEXT,
  "status" "sensory"."SensoryWheelVersionStatus" NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensory_wheel_version_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sensory_wheel_version_number_positive" CHECK ("version" > 0),
  CONSTRAINT "sensory_wheel_version_attribution_present" CHECK (
    char_length(trim("source_author")) > 0 AND char_length(trim("source_reference")) > 0 AND char_length(trim("license")) > 0
  )
);
CREATE UNIQUE INDEX "sensory_wheel_version_wheel_id_version_key" ON "sensory"."sensory_wheel_version"("wheel_id", "version");
CREATE INDEX "sensory_wheel_version_wheel_id_status_idx" ON "sensory"."sensory_wheel_version"("wheel_id", "status");
CREATE UNIQUE INDEX "sensory_wheel_one_published" ON "sensory"."sensory_wheel_version"("wheel_id") WHERE "status" = 'published';
ALTER TABLE "sensory"."sensory_wheel_version" ADD CONSTRAINT "sensory_wheel_version_wheel_id_fkey" FOREIGN KEY ("wheel_id") REFERENCES "sensory"."sensory_wheel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sensory"."sensory_wheel_node" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "version_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "parent_id" UUID,
  "parent_level" "sensory"."SensoryWheelNodeLevel",
  "level" "sensory"."SensoryWheelNodeLevel" NOT NULL,
  "term_original" TEXT NOT NULL,
  "term_es" TEXT,
  "color" TEXT,
  "display_order" INTEGER NOT NULL,
  CONSTRAINT "sensory_wheel_node_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sensory_wheel_node_term_present" CHECK (char_length(trim("term_original")) > 0),
  CONSTRAINT "sensory_wheel_node_tree_shape" CHECK (
    ("level" = 'family' AND "parent_id" IS NULL AND "parent_level" IS NULL)
    OR ("level" = 'subfamily' AND "parent_id" IS NOT NULL AND "parent_level" = 'family')
    OR ("level" = 'descriptor' AND "parent_id" IS NOT NULL AND "parent_level" IN ('family', 'subfamily'))
  )
);
CREATE UNIQUE INDEX "sensory_wheel_node_version_id_key_key" ON "sensory"."sensory_wheel_node"("version_id", "key");
CREATE UNIQUE INDEX "sensory_wheel_node_version_id_id_level_key" ON "sensory"."sensory_wheel_node"("version_id", "id", "level");
CREATE INDEX "sensory_wheel_node_version_id_parent_id_display_order_idx" ON "sensory"."sensory_wheel_node"("version_id", "parent_id", "display_order");
ALTER TABLE "sensory"."sensory_wheel_node" ADD CONSTRAINT "sensory_wheel_node_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "sensory"."sensory_wheel_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sensory"."sensory_wheel_node" ADD CONSTRAINT "sensory_wheel_node_version_id_parent_id_parent_level_fkey" FOREIGN KEY ("version_id", "parent_id", "parent_level") REFERENCES "sensory"."sensory_wheel_node"("version_id", "id", "level") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sensory"."sensory_wheel_node_detail" (
  "node_id" UUID NOT NULL,
  "definition" TEXT NOT NULL,
  "source_reference" TEXT NOT NULL,
  "license" TEXT,
  CONSTRAINT "sensory_wheel_node_detail_pkey" PRIMARY KEY ("node_id")
);
ALTER TABLE "sensory"."sensory_wheel_node_detail" ADD CONSTRAINT "sensory_wheel_node_detail_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "sensory"."sensory_wheel_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sensory"."sensory_wheel_reference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "node_id" UUID NOT NULL,
  "modality" "sensory"."SensoryWheelReferenceModality" NOT NULL,
  "reference" TEXT NOT NULL,
  "preparation" TEXT,
  "intensity" DECIMAL(4,1),
  "source_reference" TEXT NOT NULL,
  "license" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "sensory_wheel_reference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sensory_wheel_reference_intensity_range" CHECK ("intensity" IS NULL OR "intensity" BETWEEN 0 AND 15)
);
CREATE INDEX "sensory_wheel_reference_node_id_display_order_idx" ON "sensory"."sensory_wheel_reference"("node_id", "display_order");
ALTER TABLE "sensory"."sensory_wheel_reference" ADD CONSTRAINT "sensory_wheel_reference_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "sensory"."sensory_wheel_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sensory"."sensory_descriptor_wheel_link" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "descriptor_id" UUID NOT NULL,
  "wheel_node_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retired_at" TIMESTAMP(3),
  CONSTRAINT "sensory_descriptor_wheel_link_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sensory_descriptor_wheel_link_descriptor_id_retired_at_idx" ON "sensory"."sensory_descriptor_wheel_link"("descriptor_id", "retired_at");
CREATE INDEX "sensory_descriptor_wheel_link_wheel_node_id_retired_at_idx" ON "sensory"."sensory_descriptor_wheel_link"("wheel_node_id", "retired_at");
CREATE UNIQUE INDEX "sensory_descriptor_wheel_link_active_unique" ON "sensory"."sensory_descriptor_wheel_link"("descriptor_id", "wheel_node_id") WHERE "retired_at" IS NULL;
ALTER TABLE "sensory"."sensory_descriptor_wheel_link" ADD CONSTRAINT "sensory_descriptor_wheel_link_descriptor_id_fkey" FOREIGN KEY ("descriptor_id") REFERENCES "sensory"."sensory_descriptor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sensory"."sensory_descriptor_wheel_link" ADD CONSTRAINT "sensory_descriptor_wheel_link_wheel_node_id_fkey" FOREIGN KEY ("wheel_node_id") REFERENCES "sensory"."sensory_wheel_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sensory"."sensory_descriptor_wheel_link" ADD CONSTRAINT "sensory_descriptor_wheel_link_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una rueda sólo se hace pública con una edición publicada y atribuida.
CREATE OR REPLACE FUNCTION "sensory"."sensory_wheel_publication_guard"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."is_public" AND NOT EXISTS (
    SELECT 1 FROM "sensory"."sensory_wheel_version" v
    WHERE v."wheel_id" = NEW."id" AND v."status" = 'published'
  ) THEN
    RAISE EXCEPTION 'Una rueda publica exige una version publicada con fuente y licencia';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "sensory_wheel_publication_guard" AFTER INSERT OR UPDATE OF "is_public" ON "sensory"."sensory_wheel" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "sensory"."sensory_wheel_publication_guard"();

-- Publicada o superada: la edición y su contenido quedan congelados.
CREATE OR REPLACE FUNCTION "sensory"."sensory_wheel_content_is_draft"() RETURNS TRIGGER AS $$
DECLARE version_status "sensory"."SensoryWheelVersionStatus";
BEGIN
  IF current_setting('nn.limpieza_de_pruebas', true) = 'on'
     AND current_database() ~ '^(nectar_test|nectar_ci|nn_flip_)' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT "status" INTO version_status FROM "sensory"."sensory_wheel_version"
  WHERE "id" = COALESCE(NEW."version_id", OLD."version_id");
  IF version_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'El contenido de una version publicada de rueda no se modifica';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "sensory"."sensory_wheel_version_frozen"() RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('nn.limpieza_de_pruebas', true) = 'on'
     AND current_database() ~ '^(nectar_test|nectar_ci|nn_flip_)' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una version de rueda no se borra';
  END IF;
  IF OLD."status" = 'draft' THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'published' AND NEW."status" = 'superseded'
     AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Una version publicada de rueda esta congelada';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "sensory_wheel_version_frozen" BEFORE UPDATE OR DELETE ON "sensory"."sensory_wheel_version" FOR EACH ROW EXECUTE FUNCTION "sensory"."sensory_wheel_version_frozen"();
CREATE TRIGGER "sensory_wheel_node_draft" BEFORE INSERT OR UPDATE OR DELETE ON "sensory"."sensory_wheel_node" FOR EACH ROW EXECUTE FUNCTION "sensory"."sensory_wheel_content_is_draft"();

CREATE OR REPLACE FUNCTION "sensory"."sensory_wheel_child_is_draft"() RETURNS TRIGGER AS $$
DECLARE version_status "sensory"."SensoryWheelVersionStatus";
BEGIN
  IF current_setting('nn.limpieza_de_pruebas', true) = 'on'
     AND current_database() ~ '^(nectar_test|nectar_ci|nn_flip_)' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT v."status" INTO version_status FROM "sensory"."sensory_wheel_node" n JOIN "sensory"."sensory_wheel_version" v ON v."id" = n."version_id"
  WHERE n."id" = COALESCE(NEW."node_id", OLD."node_id");
  IF version_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'El contenido de una version publicada de rueda no se modifica';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "sensory_wheel_detail_draft" BEFORE INSERT OR UPDATE OR DELETE ON "sensory"."sensory_wheel_node_detail" FOR EACH ROW EXECUTE FUNCTION "sensory"."sensory_wheel_child_is_draft"();
CREATE TRIGGER "sensory_wheel_reference_draft" BEFORE INSERT OR UPDATE OR DELETE ON "sensory"."sensory_wheel_reference" FOR EACH ROW EXECUTE FUNCTION "sensory"."sensory_wheel_child_is_draft"();

-- Un enlace conserva la decisión histórica: sólo puede pasar de vigente a retirado.
CREATE OR REPLACE FUNCTION "sensory"."sensory_descriptor_wheel_link_append_only"() RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('nn.limpieza_de_pruebas', true) = 'on'
     AND current_database() ~ '^(nectar_test|nectar_ci|nn_flip_)' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD."retired_at" IS NULL AND NEW."retired_at" IS NOT NULL
     AND (to_jsonb(NEW) - 'retired_at') = (to_jsonb(OLD) - 'retired_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Un enlace de descriptor de rueda solo se anade o se retira';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "sensory_descriptor_wheel_link_append_only" BEFORE UPDATE OR DELETE ON "sensory"."sensory_descriptor_wheel_link" FOR EACH ROW EXECUTE FUNCTION "sensory"."sensory_descriptor_wheel_link_append_only"();
