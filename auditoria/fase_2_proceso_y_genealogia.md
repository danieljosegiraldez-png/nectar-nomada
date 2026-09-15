# Fase 2 — Procesos del lote, divisiones y fusiones

Rama `auditoria/fase-2`. **Es la fase más importante del kit.** La genealogía es lo que hace que todo lo demás signifique algo: sin ella, cada etapa posterior describe un café que ya no se sabe cuál es.

Alcance: fermentación y sus protocolos, tratamientos, y la identidad del lote a través de divisiones y fusiones. Referencias: `docs/10`, `docs/11`, `docs/20` §1, `docs/21`, `docs/22`.

## Eje funcional — genealogía

1. El lote se modela como **nodo de un grafo dirigido acíclico**, no como fila con `parent_id`. Una fusión de tres lotes debe ser expresable sin perder información.
2. Conservación en la división: hijos más pérdida igualan la masa del padre **al momento del evento**, no la de recepción.
3. Conservación en la fusión.
4. Un lote dividido **queda cerrado**: no admite lecturas nuevas. Verifica que el sistema lo impida de verdad.
5. Una división que pide más masa de la disponible es `SchemaError`.
6. Herencia: el hijo hereda todo aguas arriba del evento y nada aguas abajo.
7. **Fusión — la regla que casi siempre está mal.** Todo atributo no idéntico entre padres se vuelve `MIXED` con su composición. Busca específicamente si el código toma el valor del primer padre, del mayoritario o del más reciente. Es el defecto más común de esta parte.
8. **El puntaje de taza no se hereda en una fusión.** Nunca. Un lote fusionado entra a pendiente de catación.
9. Las divisiones de ensayo registran la variable bajo estudio y la rama de control. Sin esto, los ensayos de CryoBloom y de levaduras silvestres no son comparables después.
10. El costo se reparte y se hereda a través de la genealogía.

## Eje funcional — fermentación

11. Los cinco perfiles de protocolo existen con sus valores concretos y ningún umbral es literal.
12. La alerta de estancamiento de Brix existe como rama ejecutable y está cubierta por prueba.
13. La velocidad de decisión se evalúa sobre ventana móvil reciente, nunca sobre el promedio acumulado.
14. La banda de vigilancia de pH emite alerta.
15. Un reposo frío declarado suprime las alertas de estancamiento.
16. Ninguna alerta crítica se emite desde una sola lectura, salvo la excepción de disparo inmediato.
17. Ninguna transición destructiva ocurre sin confirmación humana.

## Eje veraz

- Un lote `MIXED` en proceso, ¿puede imprimirse en alguna superficie con el nombre de un proceso? Recorre fichas, etiquetas, exportaciones y reportes.
- La altitud fusionada, ¿se presenta como promedio ponderado en algún lado?
- ¿Puede un puntaje de taza sobrevivir a una fusión por alguna ruta?
- El nombre de un proceso experimental, ¿está respaldado por registro de proceso o es texto libre?

## Eje pedagógico

- **Antes de medir:** ¿enseña a tomar la muestra de licor de tanque —punto, profundidad, homogeneización, enjuague del prisma? Sin esto las series no son comparables y ninguna validación posterior lo arregla.
- **Al registrar:** ¿interpreta el valor en el contexto del lote, el protocolo y la temperatura, o solo lo guarda?
- **Al alertar:** toda alerta debe llegar a Nivel 3. Revisa una por una. «Estancado» sin decir que primero se revise la temperatura del tanque es antipatrón 1.
- **Al cerrar la fermentación:** ¿el operador se lleva la curva y una lectura de qué pasó?
- ¿La app explica **por qué** los umbrales cambian entre protocolos? Es el concepto que más forma criterio: entender que no hay un pH correcto universal sino una ventana que depende de lo que se está haciendo.
- Antipatrón 4: quien lleva veinte cosechas no necesita la misma guía que un primerizo.

## Entregables

`auditoria/informes/fase_2.md`, hallazgos `F2-001`. Igual que fase 1.
