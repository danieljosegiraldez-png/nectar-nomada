-- El puntaje afectivo del CVA: quién lo pide, y con qué se calcula.
--
-- Las tres columnas son NULLables a propósito y no llevan valor por defecto.
-- `score_formula` null es lo que hay hoy en las seis versiones de protocolo que
-- existen: el total lo teclea quien cata. Ponerle un default habría hecho que
-- todas pidieran de golpe un cálculo que sus atributos no pueden alimentar.
--
-- `non_uniform_cups` y `defective_cups` son cuentas de tazas de la bandeja
-- (0-5), no puntajes: INTEGER, no NUMERIC. Nulas en toda valoración anterior y
-- en cualquiera bajo un protocolo sin fórmula. Un 0 por defecto habría afirmado
-- «se contaron y no había ninguna» sobre catas donde nadie contó nada.

-- AlterTable
ALTER TABLE "sensory"."sensory_protocol_version" ADD COLUMN     "score_formula" TEXT;

-- AlterTable
ALTER TABLE "sensory"."assessment" ADD COLUMN     "non_uniform_cups" INTEGER,
ADD COLUMN     "defective_cups" INTEGER;
