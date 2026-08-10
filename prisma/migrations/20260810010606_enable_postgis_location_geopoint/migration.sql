-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- AlterTable
ALTER TABLE "core"."location" ADD COLUMN     "geo_point" geography(Point, 4326);
