-- A9 · El proposito de la visita -- la unica pregunta OBLIGATORIA DE PATIO del protocolo que
-- no tenia donde guardarse.
--
-- QUE CIERRA. ADR-140 midio las 44 preguntas del protocolo del dueno contra el esquema: 34
-- tenian sitio y 10 no, y de esas 10 **exactamente una** era `required` con `stage: field`.
-- Es decir: el protocolo obliga a declarar a que se fue, con el guante puesto, y el sistema
-- no tenia columna donde ponerlo.
--
-- POR QUE UN ARREGLO Y NO UNA COLUMNA. Una misma ida revisa, alimenta y trata. Obligar a
-- elegir uno haria que el informe al cliente mintiera sobre lo que se fue a hacer. El
-- precedente exacto ya esta en este esquema: `apiary.inspection.brood_stages` es un arreglo
-- de enum por la misma razon --varias etapas de cria a la vez--.
--
-- DE DONDE SALEN LOS SEIS VALORES. Del protocolo, literalmente: `protocolos/
-- apiario-campo-v1.json`, item `purpose`, campo `options`. No se inventa ninguno y no se
-- amplia la lista aqui; un guardia comprueba que el JSON, el enum y el modulo puro digan lo
-- mismo.
--
-- EL VACIO ES "SIN REGISTRAR", NO "SIN PROPOSITO". Un arreglo de Postgres no es NULL: nace
-- vacio. Las visitas guardadas hasta hoy lo tendran vacio porque **nadie las pregunto**, no
-- porque no tuvieran proposito -- que es el tercer estado de ADR-080 aplicado a un arreglo. Y
-- por eso NO se rellena nada: inventar un proposito para las visitas viejas seria afirmar lo
-- que nadie declaro. El servicio si exige al menos uno cuando el campo llega.
--
-- SIN DEFAULT y sin NOT NULL a proposito, por lo mismo: un `DEFAULT '{}'` con NOT NULL diria
-- que toda visita vieja fue declarada sin proposito.

-- CreateEnum
CREATE TYPE "traceability"."VisitPurpose" AS ENUM ('inspeccion', 'alimentacion', 'tratamiento', 'cosecha', 'montaje', 'diagnostico');

-- AlterTable
ALTER TABLE "traceability"."field_session" ADD COLUMN     "purposes" "traceability"."VisitPurpose"[];

