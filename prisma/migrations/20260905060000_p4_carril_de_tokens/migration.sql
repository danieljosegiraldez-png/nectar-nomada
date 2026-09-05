-- P4 §2 — el carril de tokens del aparato, construido cuando la Fase 5 lo pidió.
--
-- ADR-108 lo aplazó «hasta que exista un cliente nativo que lo llame». Ese día
-- llegó y la razón es dura: un cliente nativo NO puede autenticarse con la
-- cookie de sesión que usa la PWA.
--
-- Se guarda el HASH del refresh token, nunca el token. Quien lea la base —un
-- volcado robado, un backup mal guardado— no puede suplantar a un aparato.
--
-- Aditivo y anulable. Comprobado antes de escribirlo: `core.device` tiene CERO
-- filas en producción, así que ninguna queda a medias.

ALTER TABLE "core"."device"
  ADD COLUMN "refresh_token_hash"     TEXT,
  ADD COLUMN "refresh_token_issued_at" TIMESTAMP(3);

-- Un aparato se busca por su refresh al refrescar, y eso pasa en cada arranque
-- sin cobertura previa. Único además de índice: dos aparatos no pueden compartir
-- refresh, y si alguna vez ocurriera es un fallo que hay que ver, no tolerar.
CREATE UNIQUE INDEX "device_refresh_token_hash_key"
  ON "core"."device"("refresh_token_hash");
