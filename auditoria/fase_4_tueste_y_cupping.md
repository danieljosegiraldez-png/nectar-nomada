# Fase 4 — Muestreo de tueste, perfil de tueste y catación

Rama `auditoria/fase-4`. Referencias: `docs/20` §3–4, `docs/21`, `docs/22`.

Es la fase con más riesgo de producir cifras que parecen mediciones y no lo son. Un puntaje de taza es el dato con más peso comercial de todo el sistema y el más fácil de registrar mal.

## Antes de empezar

El protocolo de referencia es la **Coffee Value Assessment** de la SCA — normas **SCA-102** (preparación y mecánica), **SCA-103** (descriptiva) y **SCA-104** (afectiva) — que **superseden el protocolo y formato de catación de 2004**.

Los parámetros numéricos exactos —gramaje, proporción café:agua, temperatura del agua, número de tazas, tiempos de costra, grado de color y ventana de tueste de muestra, reposo— **los tomas del texto normativo y los citas en el código con su referencia**. No los transcribas de memoria, de un blog ni de una fuente secundaria. Si no puedes acceder al texto de la norma, **dilo y detente en ese punto**: déjalo como pendiente en lugar de completar con valores plausibles. Un parámetro de protocolo inventado es exactamente el tipo de defecto que `docs/21` existe para prevenir.

## Eje funcional — tueste

1. El perfil registra humedad del verde. El mismo perfil sobre verde a 9 % y a 12 % no es el mismo tueste, y sin ese dato los perfiles no son comparables.
2. Los derivados —merma, tiempo de desarrollo, DTR— se calculan, no se digitan.
3. Orden temporal: punto de giro antes del primer crack, primer crack antes de la descarga. Violarlo es `SchemaError`.
4. La merma cae en rango plausible; fuera de rango se marca como probable error de pesaje, no como característica del café.
5. **Conformidad del tueste de muestra.** Todo tueste destinado a catación se declara conforme o no conforme a SCA-102. El sistema no debe impedir catar un tueste no conforme —a veces se cata lo que hay— pero **la marca tiene que viajar con el puntaje** hasta cualquier reporte, ficha o valorización que lo use.

## Eje funcional — catación

6. **Descriptivo y afectivo se almacenan por separado y nunca se colapsan en un campo.** Es precisamente lo que la CVA vino a corregir; un modelo con «notas de cata» y «puntaje» en la misma ficha reproduce el problema que la norma resuelve.
7. **Un puntaje pertenece a un catador.** El valor de panel es derivado y se etiqueta como tal.
8. **La dispersión del panel se conserva y se muestra.** Promediar 84, 84 y 88 en un 85.3 borra la información que más importa: hubo desacuerdo.
9. Ciego o no ciego se registra siempre.
10. Defectos y taints van aparte del puntaje, con incidencia por taza.
11. La versión de la norma aplicada se registra con cada catación — la CVA sigue en refinamiento.
12. La cadena puntaje → muestra → tueste → lote en un estado se reconstruye completa. Un puntaje colgado directamente de un lote no es verificable.
13. La calibración del panel se registra, análoga a la de instrumentos.

## Eje veraz

- ¿Puede un puntaje salir a una ficha comercial separado de sus condiciones —ciego, número de catadores, dispersión, conformidad del tueste?
- ¿Puede un puntaje de panel presentarse como si fuera una medición única?
- ¿Hay alguna ruta por la que el puntaje de un lote se aplique a otro —una fusión, una división, una reetiquetación?
- Las notas descriptivas que llegan a material comercial, ¿salen de la evaluación descriptiva registrada o alguien las escribió después?

## Eje pedagógico

- **Antes de medir:** ¿enseña a preparar la mesa según protocolo? Es donde la catación se vuelve comparable o deja de serlo.
- **Al registrar:** ¿explica la separación entre descriptivo y afectivo? Es el concepto central de la CVA y el que más cuesta: describir sin juzgar, y juzgar aparte.
- ¿Explica **por qué** el tueste de muestra tiene que ser conforme —que un tueste desviado cambia la taza y el puntaje deja de hablar del café?
- ¿Ayuda a un catador a calibrarse, o solo recoge sus números?
- Antipatrón 5 con especial cuidado: Daniel es juez calificado y varios de sus colaboradores no. La misma pantalla sirve a ambos, y ninguno de los dos debe sentirse mal atendido.

## Entregables

`auditoria/informes/fase_4.md`, hallazgos `F4-001`. Todo parámetro de norma que no hayas podido verificar contra el texto original va a `DECISIONES_PENDIENTES.md`, no al código.
