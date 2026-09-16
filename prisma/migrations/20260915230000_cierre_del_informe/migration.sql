-- A9 · Las tres preguntas que convierten una visita en un informe tecnico.
--
-- QUE CIERRA. ADR-140 midio las 44 del protocolo: 10 sin sitio. ADR-141 cerro la unica de
-- patio. Estas tres son de las siete de CASA --`stage: close`-- y son las que el cliente
-- lee: viaticos, causa probable y recomendacion.
--
-- POR QUE EN `field_session` Y NO EN UNA TABLA NUEVA. Son propiedades de la visita, una por
-- visita, y el propio servicio de cierre ya existe para esto: A9.3 D4 separa `ended_at`
-- --cuando se salio del sitio-- de `completed_at` --cuando se termino de escribir--, y el
-- comentario de `completarVisita` dice que esa funcion "solo acepta `notes`" porque un valor
-- de etapa `field` no se edita desde el cierre. Estas tres son de etapa `close`: son
-- exactamente lo que ese cierre deberia haber aceptado desde el principio.
--
-- LA MONEDA VA EN EL NOMBRE. El protocolo dice `travel_cost_usd` y Panama opera en dolares.
-- Inventar un modelo de monedas para un campo seria construir lo que nadie pidio. Si algun
-- dia hay otra moneda, sera una decision del dueno con su columna, no una suposicion de hoy.
--
-- `DECIMAL(10,2)` y no coma flotante: es dinero. Misma disciplina que el resto del esquema.
--
-- LOS TRES SON ANULABLES, y no por comodidad: el protocolo marca los tres OPCIONALES, y las
-- visitas ya cerradas no los tienen porque nadie los pregunto. `NULL` es "sin registrar", que
-- es distinto de "cero dolares de viaticos" -- una visita a Cerro Azul en carro propio puede
-- costar cero de verdad, y ese cero es un dato.
--
-- LO QUE ESTA MIGRACION NO DECIDE: si los viaticos salen en el informe del cliente. Eso ya
-- estaba decidido y declarado antes de que existiera el campo: `report_version.
-- generation_query.incluyeCostos` nace en `false`, y el snapshot solo los congela cuando el
-- contrato lo pide. Lo que no se congela no se puede filtrar mal despues.

-- AlterTable
ALTER TABLE "traceability"."field_session" ADD COLUMN     "probable_cause" TEXT,
ADD COLUMN     "recommendation" TEXT,
ADD COLUMN     "travel_cost_usd" DECIMAL(10,2);

