-- ¿El producto daña a los polinizadores?
--
-- Decisión de Daniel, 2026-10-01: lo que su finca aplica «no debe afectar las abejas, no es
-- químico». Cierto de un repelente de ajo o de un hongo entomopatógeno; falso de un fipronil. El
-- aviso de floración no puede depender de que haya floración —saltaría con el uso correcto y se
-- aprendería a ignorarlo—: depende de qué producto es.
--
-- NULLABLE a propósito. Nulo es «nadie lo declaró», que no es lo mismo que «no daña»: el modelo de
-- esta casa deja faltando lo que falta en vez de inventarlo, y el aviso sólo salta con `true`.
ALTER TABLE "traceability"."consumable_material"
  ADD COLUMN "harmful_to_pollinators" BOOLEAN;
