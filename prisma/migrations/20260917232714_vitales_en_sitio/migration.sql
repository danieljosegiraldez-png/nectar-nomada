-- Cuando se anotaron los vitales de campo ESTANDO EN EL SITIO.
--
-- POR QUE. El protocolo marca clima, colonias vivas y cajas presentes como
-- `stage: field` --son cosas que se VEN estando ahi-- y las tres se capturaban
-- solo en el formulario de CIERRE, que se rellena en casa. Anotarlas en casa es
-- legitimo: el dueno lo pidio explicitamente el 2026-09-17, «a veces en sitio y
-- si solo un apicultor es dificil maniobrar y ser eficiente de entrar y salir y
-- estresar menos a las abejas».
--
-- Asi que no se restringe: se REGISTRA cual de las dos paso. Sin esta columna,
-- una cifra vista con el guante puesto y una reconstruida de memoria dos horas
-- despues son la MISMA fila, las dos estampadas `original_record`.
--
-- Anulable, y sus tres estados son los de ADR-080: `null` = no se anotaron en
-- sitio, o se corrigieron despues desde casa; una marca de tiempo = los valores
-- que hay AHORA se escribieron alli, entonces.

-- AlterTable
ALTER TABLE "traceability"."field_session" ADD COLUMN     "field_vitals_on_site_at" TIMESTAMP(3);
