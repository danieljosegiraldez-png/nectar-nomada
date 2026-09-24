-- Secar café no lo convierte en verde. Lavados y honeys salen como
-- pergamino; los naturales, como cereza seca. Son valores nuevos y no se
-- reinterpreta ninguna fila histórica sin evidencia.
ALTER TYPE "traceability"."LotType" ADD VALUE 'parchment';
ALTER TYPE "traceability"."LotType" ADD VALUE 'dry_cherry';
