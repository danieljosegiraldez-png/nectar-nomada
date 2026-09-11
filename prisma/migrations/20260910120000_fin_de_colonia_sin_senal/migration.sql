-- La clave de idempotencia del FIN de una colonia, para que se pueda anotar sin
-- señal.
--
-- QUÉ CIERRA. La cola offline del apiario acepta exactamente dos tipos,
-- `inspection` y `colony_event`. El fin de una colonia no estaba, y es **el
-- hecho que más se descubre en el campo**: una caja que aparece vacía. Había
-- que volver con cobertura para poder anotarlo, y entre medias el conteo del
-- sitio seguía mintiendo.
--
-- POR QUÉ LA CLAVE VA EN `colony` Y NO EN UNA TABLA NUEVA. El fin es un UPDATE
-- sobre esta fila, no una inserción: no hay fila nueva donde colgar la clave,
-- como sí la hay en `inspection.client_draft_id`.
--
-- Y POR QUÉ HACE FALTA. Sin ella, el reintento de un borrador tras una
-- respuesta perdida es **indistinguible** de «otra persona la dio por perdida
-- primero»: las dos llegan al servicio como `colony_already_ended`. La primera
-- es un `duplicate` que se descarta en silencio; la segunda es un rechazo que
-- el operador tiene que ver. Confundirlas haría que alguien descartara trabajo
-- bueno, o que creyera perdido un aviso real.
--
-- ANULABLE y ÚNICA. Anulable porque una colonia viva no tiene fin y porque el
-- fin declarado desde la web no trae borrador; única para que lo garantice la
-- base y no una consulta previa, igual que `inspection.client_draft_id`.
--
-- ADITIVA: no toca ninguna fila. Las colonias ya terminadas se quedan con la
-- columna nula, que es exactamente lo que se sabe de ellas — se declararon
-- desde la web, sin borrador.

ALTER TABLE "apiary"."colony" ADD COLUMN "end_client_draft_id" TEXT;

CREATE UNIQUE INDEX "colony_end_client_draft_id_key" ON "apiary"."colony"("end_client_draft_id");
