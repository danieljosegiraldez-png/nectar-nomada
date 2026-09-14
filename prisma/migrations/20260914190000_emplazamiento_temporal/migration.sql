-- A9 · Anexo E §9 — el emplazamiento temporal: lo que faltaba del «al abrirlo».
--
-- QUÉ CIERRA. El §9 lista siete cosas al abrir un servicio de polinización: «parcela y
-- cultivo, cliente, hectáreas, ventana de floración estimada, meta de colmenas por hectárea,
-- colmenas comprometidas y referencia al contrato». Medido antes de tocar nada: cuatro ya
-- existían desde A9.9 —cliente, hectáreas, meta min/max y contrato— y faltaban tres.
--
-- POR QUÉ `bloom_starts_at` NO ES `starts_at`, que es la mitad del valor de esta migración.
-- El servicio empieza cuando llegan las colmenas; la floración abre cuando la abre la
-- planta. Con una sola fecha, la alerta que el Anexo pide —«que se acerque la floración con
-- la meta incompleta»— no se puede dar: no habría nada que se acerque distinto del propio
-- servicio. Son dos hechos y son dos columnas.
--
-- POR QUÉ `committed_hives` NO ES `hectáreas × densidad`. El cociente es la regla
-- agronómica; esto es lo que dice el contrato. Cuando los dos existen y no coinciden, **la
-- diferencia es el dato**, igual que `divergen` en el conteo de colonias (D6): esconderla
-- detrás de un solo número pierde la señal. Anulable, porque se puede contratar por densidad
-- sin fijar un número.
--
-- POR QUÉ `crop` Y `parcel_reference` SON TEXTO LIBRE. Son hechos de la finca del CLIENTE,
-- no nuestros. No hay catálogo de cultivos en este repositorio —los «cultivo» que aparecen
-- son de levaduras— y el dueño no ha dado vocabulario: inventarlo sería fabricar un hecho de
-- negocio (misma decisión y misma razón que ADR-127). Y las parcelas ajenas no se modelan
-- como `Location`: una ubicación por cada parcela de cada cliente llenaría la jerarquía de
-- sitios que nadie visita ni mantiene.
--
-- LO QUE NO CAMBIA: `ends_at` sigue siendo anulable, y eso ya era el caso de Toabré que el
-- §9 nombra — «allí el emplazamiento simplemente no tiene fecha de cierre». Sólo se le añade
-- el comentario que lo dice.

-- AlterTable
ALTER TABLE "apiary"."pollination_commitment" ADD COLUMN     "bloom_ends_at" TIMESTAMP(3),
ADD COLUMN     "bloom_starts_at" TIMESTAMP(3),
ADD COLUMN     "committed_hives" INTEGER,
ADD COLUMN     "crop" TEXT,
ADD COLUMN     "parcel_reference" TEXT;

-- CHECK — la ventana de floración no puede cerrar antes de abrir.
--
-- Va en la base y no sólo en TypeScript por lo que `CLAUDE.md` dice con nombre: «Una
-- restricción que vive en TypeScript o en un comentario no existe para la base.» Una ventana
-- invertida haría que «se acerca la floración» calculara días negativos y el aviso no saldría
-- nunca — un guardia silencioso, que es el peor.
ALTER TABLE "apiary"."pollination_commitment"
  ADD CONSTRAINT "pollination_commitment_ventana_de_floracion_coherente" CHECK (
    "bloom_starts_at" IS NULL OR "bloom_ends_at" IS NULL OR "bloom_ends_at" >= "bloom_starts_at"
  );

-- CHECK — un número de colmenas comprometidas negativo no es un compromiso.
ALTER TABLE "apiary"."pollination_commitment"
  ADD CONSTRAINT "pollination_commitment_colmenas_comprometidas_no_negativas" CHECK (
    "committed_hives" IS NULL OR "committed_hives" >= 0
  );
