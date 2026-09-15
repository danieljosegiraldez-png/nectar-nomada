# Fase 3 — Secado, reposo y muestreo

Rama `auditoria/fase-3`. Referencias: `docs/13`, `docs/20` §2, `docs/21`, `docs/22`.

El secado es donde se destruye más valor en el beneficio, y donde el daño es más difícil de atribuir: a diferencia de la fermentación, el error no se manifiesta en horas sino en taza, semanas después, cuando ya nadie lo conecta con la cama de secado.

## Eje funcional — secado

1. La fase —tasa constante o decreciente— se determina **antes** de evaluar la tasa. El límite solo aplica en fase decreciente.
2. La tasa se calcula sobre media móvil de 24 h. Un ascenso nocturno de humedad es normal y no puede emitir violación de integridad.
3. La verificación cruzada humedad–masa existe. **Es la única detección automática de endurecimiento superficial**: sin ella el sistema confía en un medidor que un grano sellado engaña, y el moho aparece en bodega.
4. `TARGET_REACHED` exige humedad **y** actividad de agua.
5. Se exigen tres puntos por cama; la dispersión es el rango y dispara `UNEVEN_DRYING`.
6. El reloj de secado cuenta desde la transición a secado, no desde la fermentación.
7. Se rechazan lecturas de humedad cuyo punto de muestreo no sea la cama de pergamino.
8. El reposo mínimo se verifica antes de permitir la trilla.

## Eje funcional — muestreo

9. **Una muestra descuenta masa del lote.** Verifica que exista y que cuadre. Una muestra que no descuenta es una fuga silenciosa, pequeña por evento y acumulativa a lo largo de la cosecha.
10. La muestra guarda una **instantánea** del estado del lote, no una referencia viva.
11. Los cinco tipos de muestra existen y se distinguen.
12. **Regla del testigo:** ningún lote puede marcarse como vendido sin muestra de retención registrada, o sin dejar constancia explícita de su ausencia en la ficha. Sin testigo no hay forma de defender ni de verificar una reclamación de calidad posterior.

## Eje veraz

- La humedad reportada, ¿es la media de los tres puntos o la que alguien anotó primero?
- ¿Puede un lote llegar a la ficha comercial con humedad `ESTIMADA` sin etiqueta?
- La merma de secado, ¿es medida o calculada? Si es calculada, ¿su fórmula es inspeccionable?
- ¿Hay algún reporte que complete días faltantes de la curva de secado por interpolación sin decirlo?

## Eje pedagógico

- **Antes de medir:** ¿enseña a muestrear la cama en tres puntos y a qué profundidad? Un solo punto en el centro es el error más común y el más invisible.
- **Al registrar:** ¿explica la diferencia entre humedad y actividad de agua? Es el concepto que más cambia la práctica de un productor: entender que el número del medidor no es lo que gobierna la estabilidad en bodega.
- **Al alertar:** la alerta de tasa demasiado rápida, ¿explica el endurecimiento superficial —que el grano se sella por fuera, el medidor miente y el moho llega después? Sin esa explicación el operador ve un límite arbitrario y lo ignora.
- **Al cerrar:** ¿el operador se lleva la curva de secado de su lote y entiende qué la formó?
- ¿La app enseña a leer una cama —color, sonido, tacto— o solo a leer el medidor? El objetivo es formar criterio, no dependencia del instrumento.
- Condiciones de campo, con particular atención: el patio es el peor entorno de lectura de todo el beneficio. Sol directo, manos ocupadas, sin señal.

## Entregables

`auditoria/informes/fase_3.md`, hallazgos `F3-001`.
