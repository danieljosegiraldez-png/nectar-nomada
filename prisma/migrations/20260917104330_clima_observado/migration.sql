-- Clima OBSERVADO al visitar — Anexo E, etapa de campo.
--
-- LO QUE CORRIGE. El mapa del protocolo daba esta pregunta por "sin sitio" con
-- esta nota: "el Anexo C lo pide como vital del sitio y lo deja en una capa
-- externa sin proveedor conectado". Eso CONFUNDE dos cosas: el vital del Anexo C
-- es el "Clima 7 dias", un PRONOSTICO externo que efectivamente no tiene
-- proveedor; la pregunta del Anexo E es lo que el apicultor VIO estando ahi.
-- La segunda no necesita ningun proveedor, y su vocabulario ya estaba escrito.
--
-- LOS CUATRO VALORES SON LOS DEL PROTOCOLO, literales y sin anadir ninguno.
-- No hay "otro" porque el protocolo no lo declara. Un quinto --"neblina", que en
-- Cerro Azul no es raro-- se anade editando `protocolos/apiario-campo-v1.json`
-- y esta migracion a la vez: el guardia nuevo `enum-del-protocolo` no deja que
-- uno cambie sin el otro.

-- CreateEnum
CREATE TYPE "traceability"."WeatherObserved" AS ENUM ('despejado', 'nublado', 'viento', 'lluvia');
-- AlterTable
ALTER TABLE "traceability"."field_session" ADD COLUMN     "weather_observed" "traceability"."WeatherObserved";
