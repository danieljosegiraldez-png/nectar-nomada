<!--
  PROCEDENCIA — léela antes de citar nada de este archivo.

  estado    : referencia externa · especificación del fabricante
  origen    : AgraTronix, «2015 Moisture Tester Catalog» (PDF, 12 páginas, 2.773.916 bytes), entregado
              por Daniel como el medidor que usa al final del secado. Texto extraído del propio PDF el
              2026-09-19; las cifras de abajo son literales del catálogo.
  qué puede : ser la ficha del modelo en el catálogo de equipos (ADR-172) y decir qué mide y qué no.
  qué NO    : sustituir el contraste contra patrón (ADR-181, `02_calibration` §3): la ficha dice lo que
              promete el fabricante, la verificación dice lo que hace el aparato.

  El PDF NO se versiona: es obra del fabricante. Vive en el ordenador de Daniel.
-->

# AgraTronix Coffee Tester — ref. 08150

**Es el instrumento con que se decide el fin del secado** (ADR-181 §17).

| | literal del catálogo |
|---|---|
| Qué mide | «Measures both green and parchment coffee beans» |
| Rango | «green coffee - 7% - 35% parchment coffee - 8% - 38%» |
| Temperatura de uso | «32° - 113° F (0° - 45° C)» |
| Repetibilidad y exactitud | «±0.5% in normal moisture range for stored grain» |
| Resolución | «0.1% moisture» |
| Principio | «Higher-frequency, capacitive circuit» |
| Calibración | «Easy basic mode or advanced precision calibration mode»; «Multiple sets of grain scales» |
| Promedio | «displays running average of tests» |

**Lo que se sigue de la ficha:**

- **Escala verde y escala pergamino son distintas.** Cada lectura dice con cuál se tomó — es un
  modo del instrumento (`lib/equipos/modosDeInstrumento.ts`). En secado, pergamino
  (`13_drying_moisture` §4).
- **No mide actividad de agua**: la expresión no aparece en ningún punto del catálogo. Por eso el
  «terminado» se da por humedad y queda marcado «sin actividad de agua medida».
- **±0,5 % vale «in normal moisture range for stored grain»**, no en todo el rango. Qué incertidumbre
  se acepta cerca del objetivo de una receta es una definición pendiente, no algo que la ficha resuelva.
- **No tiene escala para cáscara.** Una humedad de cáscara con este aparato sería de una escala ajena.
