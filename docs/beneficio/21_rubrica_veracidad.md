# 21 — Rúbrica de Veracidad
**Estado:** Normativo · **Versión:** 1.0

Un sistema de trazabilidad tiene una obligación que un sistema de gestión corriente no tiene: **cada afirmación que emite debe poder sostenerse**. Si la herramienta produce una sola cifra que no resiste ser desarmada, deja de ser un instrumento de confianza y pasa a ser un generador de documentación creíble — que es peor que no tener nada, porque nadie la cuestiona.

---

## 1. Procedencia: todo valor tiene una clase

Ningún valor existe en el sistema sin su clase de procedencia. No es metadato opcional: es parte del valor.

| Clase | Qué significa | Requisito |
| :--- | :--- | :--- |
| `MEDIDO` | Salió de un instrumento | Instrumento + calibración vigente + operador + momento |
| `DECLARADO` | Una persona lo afirmó sin instrumento | Quién y cuándo. Ej.: variedad, nombre del recolector |
| `DERIVADO` | Calculado a partir de otros valores | La fórmula debe ser inspeccionable y los insumos navegables |
| `ESTIMADO` | Valor de modelo o de práctica general | Fuente explícita. Nunca se presenta como propio del lote |
| `SUPUESTO` | Un valor por defecto que el sistema eligió | Debe ser visible y reversible. Equivale a `[PROVISIONAL]` |

**Regla de contagio.** Un `DERIVADO` nunca es más confiable que su insumo más débil. Si un rendimiento se calcula con un peso `SUPUESTO`, el rendimiento es `SUPUESTO`. La clase se propaga hacia arriba en la cadena de cálculo, nunca se lava por el camino.

## 2. Prohibiciones

1. **No se rellenan huecos.** Ante un dato ausente el sistema muestra ausencia. Nunca completa con el promedio de la finca, el valor de la cosecha pasada ni un típico de industria.
2. **Ningún valor `ESTIMADO` o `SUPUESTO` cruza a una afirmación comercial** —precio, ficha de lote, etiqueta, certificación, material de marketing, reporte a un cliente— sin su etiqueta visible en el mismo lugar donde se lee la cifra.
3. **No se infiere lo que no se midió.** Una altitud no se deduce de la finca si el lote vino de tres parcelas; un proceso no se deduce del tanque; una variedad no se deduce del vecino.
4. **No se presenta una sugerencia del sistema como un hecho del café.** Un precio modelado, un punto de corte recomendado y un rendimiento esperado son propuestas, y el lenguaje debe decirlo.
5. **Un promedio no oculta su dispersión** cuando la dispersión es la información relevante: puntajes de panel, humedad por cama, rendimiento entre lotes.
6. **Ninguna cifra sin camino de vuelta.** Si desde un número de un reporte no se puede llegar a las lecturas que lo formaron, ese número no se publica.

## 3. Afirmaciones sobre el café

Lo que la ficha de un lote dice sobre el café —variedad, altitud, proceso, finca, fecha de cosecha, certificaciones— sale de **registros**, no de un campo de texto libre que alguien escribió una vez y nadie volvió a mirar.

- Un atributo `MIXED` (ver `20_modelo_ciclo_completo.md` §1.3) **no puede declararse como valor único** en ninguna superficie.
- Un puntaje de taza viaja siempre con: la norma aplicada y su versión, si fue ciego, cuántos catadores, la dispersión, y si el tueste fue conforme.
- Una afirmación de proceso experimental —anaeróbico, maceración carbónica, reposo frío— exige el registro de proceso que la respalde. Sin registro, no se nombra.

## 4. Contenido educativo

La rúbrica pedagógica (`22`) exige que la app enseñe. Enseñar mal es peor que callar.

- **Separación explícita entre «esto es práctica general» y «esto es tu dato».** Nunca se mezclan en el mismo párrafo sin marcar cuál es cuál.
- Toda afirmación técnica general lleva su fuente, o se presenta como criterio propio de Néctar Nómada — pero se dice cuál de las dos es.
- **Los rangos de práctica general se presentan como rangos, no como verdades.** «El pergamino suele estabilizarse entre 10 y 11.5 %» no es «el café debe estar a 11 %».
- **La incertidumbre se dice.** Una guía que recomienda lavar un lote con falsa seguridad es peor que una que dice qué sugiere el dato y devuelve la decisión al productor. El sistema es asesor, no autónomo (`CLAUDE.md` §3), y el lenguaje de la guía debe ser coherente con eso.
- Ninguna guía cita un estándar sin la referencia que permita ir a verificarlo.

## 5. Qué debe verificar una auditoría

1. Recorrer la superficie visible —pantallas, reportes, exportaciones, etiquetas— y para cada cifra preguntar: ¿cuál es su clase de procedencia, y está visible?
2. Buscar todo punto donde un valor por defecto pueda convertirse en un dato aparentemente medido.
3. Buscar todo lugar donde un atributo `MIXED` pueda imprimirse como valor único.
4. Buscar todo lugar donde un puntaje de taza se separe de sus condiciones.
5. Buscar todo lugar donde un precio modelado pueda salir sin etiqueta.
6. Verificar cada afirmación técnica del contenido educativo contra su fuente, y marcar las que no tienen ninguna.
7. Verificar que ningún reporte rellene, redondee u oculte una ausencia.
