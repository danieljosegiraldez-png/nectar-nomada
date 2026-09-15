# Fase 5 — Valorización, registro y reporting

Rama `auditoria/fase-5`. Referencias: `docs/20` §5–6, `docs/21`, `docs/22`.

Es la etapa donde un error deja de ser un dato incorrecto y pasa a ser una afirmación comercial falsa. El eje veraz pesa más que en ninguna otra fase.

## Eje funcional

1. El costo por kilogramo de verde acumula todas las etapas, **incluidas las mermas**. Con una relación cereza:verde de 5.5–6.5 : 1, un error del 5 % en el rendimiento se propaga multiplicado a la base de costo — verifica que el cálculo lo refleje.
2. El costo se calcula **sobre la genealogía**: un lote fusionado hereda el costo ponderado de sus padres; uno dividido reparte el del padre por masa. Prueba ambos casos.
3. Todo precio declara su naturaleza: transado, ofertado, referencia de mercado o modelado.
4. **Un precio modelado no puede presentarse, exportarse ni imprimirse sin su etiqueta.** Recorre cada superficie de salida y verifícalo una por una. Es la regla más importante de esta fase: el momento en que una sugerencia del sistema se convierte en «el precio del lote» es el momento en que la herramienta empieza a producir afirmaciones falsas sobre dinero real.
5. Una referencia de mercado lleva fuente y fecha. Una referencia sin fecha es una referencia falsa.
6. El modelo expone punto de equilibrio, margen y **la participación del productor** en el precio final. Un sistema que calcula precios de exportación sin hacer visible qué fracción queda en la finca es una herramienta de intermediación disfrazada de herramienta de productor.
7. **Trazabilidad hasta la lectura:** toma tres cifras cualesquiera de un reporte y desármalas hasta las lecturas que las formaron. Si alguna no llega, es hallazgo.
8. Las salvedades van en la cara del reporte. Un reporte que incluye lotes con discrepancia marcada, lecturas sin calibrar, tueste no conforme o atributos mezclados lo dice donde se lee, no en una nota al pie.
9. **Sin relleno.** Ningún reporte completa huecos con valores típicos, promedios de otros lotes ni estimaciones sin marcar. Busca activamente esta ruta: suele aparecer como una comodidad de presentación.
10. Las exportaciones —CSV, PDF, ficha de lote— conservan las etiquetas de procedencia. Una etiqueta que solo existe en pantalla no protege nada: lo que sale del sistema es lo que circula.

## Eje veraz — recorrido exhaustivo

Esta es la fase donde el recorrido de `docs/21` §5 se hace completo y sin atajos. Para **cada cifra** de cada pantalla, reporte, exportación y etiqueta:

- ¿Cuál es su clase de procedencia?
- ¿Está visible donde se lee la cifra, o enterrada?
- Si es derivada, ¿su clase se contagió correctamente desde el insumo más débil?
- ¿Puede cruzar a una afirmación comercial sin etiqueta?

Entrega el recorrido como tabla en el informe: cifra, superficie, clase, visible sí/no.

## Eje pedagógico

Ficha de `docs/22` §5 para cada pantalla de costo, precio y reporte.

- ¿La app ayuda a un productor a **entender su propio costo**, o solo se lo calcula? Entender el costo es lo que cambia decisiones de finca; verlo calculado no.
- ¿Explica de dónde sale un precio sugerido y qué lo movería?
- ¿Explica qué parte del precio queda en la finca y por qué?
- ¿Enseña a leer un reporte —qué mirar primero, qué significa una salvedad?
- Antipatrón 7 aquí es especialmente grave: presentar un precio modelado con lenguaje de certeza.

## Entregables

`auditoria/informes/fase_5.md`, hallazgos `F5-001`, más la tabla de procedencia completa.
