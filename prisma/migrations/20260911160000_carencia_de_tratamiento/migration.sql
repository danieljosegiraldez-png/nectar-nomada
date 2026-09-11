-- El periodo de carencia de un tratamiento, y la marca de haber cosechado
-- dentro de el.
--
-- QUE CIERRA. `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §4 marca «Período de
-- carencia» como OBLIGATORIO y como NO EXISTENTE, con su consecuencia escrita:
-- «decide cuándo se puede cosechar. Sin él, una cosecha puede violar la
-- carencia sin que el sistema lo sepa.» Y `lib/apiary/bitacora.ts` ya lo decía
-- desde A9.12 en su propia regla inmediata: «Se aplicó un producto. Tiene
-- periodo de carencia y afecta a la miel que salga de esa colmena, así que
-- quien coseche necesita saberlo sin buscarlo.» El aviso existía; el dato no.
--
-- DIAS, NO FECHA DE FIN. Lo que trae la etiqueta del producto son los días. La
-- fecha se deriva de `occurred_at + días`; guardarla además sería un segundo
-- sitio que puede discrepar del primero.
--
-- ANULABLE EN LA BASE, OBLIGATORIO EN EL SERVICIO. `colony_event` sirve a tres
-- tipos de evento y una alimentación no tiene carencia. La exigencia va donde ya
-- está la de `treatment_batch_label`: la capa de servicio, cuando
-- `event_type = 'treatment'`.
--
-- POR QUE LA COSECHA SE REGISTRA IGUAL. Decisión del dueño el 2026-09-11, sobre
-- una contradicción del propio Anexo B §5 —que dice «bloqueo» y «la cosecha
-- avisa» en la misma celda—: se guarda siempre, con los días que faltaban en
-- `within_withdrawal_days`. Si la miel ya se extrajo, impedir el registro no la
-- devuelve al panal: deja el hecho sin rastro, que para trazabilidad es peor que
-- un registro marcado.
--
-- Y POR QUE ES COLUMNA Y NO SOLO UN AVISO. Un aviso se lee una vez; esto tiene
-- que poder consultarse el día que aparezca un residuo en un análisis. Mismo
-- razonamiento que las irregularidades de ADR-114: lo que no es consultable no
-- existe para un reporte.
--
-- ADITIVA, y sin nada que retroadaptar: medido el 2026-09-11, hay 0 eventos de
-- tratamiento y 0 cosechas de apiario. Las columnas nacen nulas porque eso es
-- exactamente lo que se sabe de las filas que no existen.

ALTER TABLE "apiary"."colony_event" ADD COLUMN "treatment_withdrawal_days" INTEGER;

ALTER TABLE "apiary"."apiary_harvest_event" ADD COLUMN "within_withdrawal_days" INTEGER;
