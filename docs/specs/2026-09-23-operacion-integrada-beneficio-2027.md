# Operación integrada del beneficio — temporada 2026–2027

**Estado:** borrador confirmado por conversación; requiere una última lectura de Daniel antes de escribir código.  
**Autoridad:** esta especificación reconcilia y, donde lo indica expresamente, corrige las specs anteriores de recepción, lotes, secado, reposo/trilla y tablero del beneficio.  
**Alcance:** Finca Rosina, Beneficio Las Nubes y las entregas externas previstas para enero–marzo de 2027. No rediseña los módulos de finca, apiarios, sensorial ni comercio.

## 1. Resultado que se busca

El sistema debe ayudar a la persona responsable del beneficio a decidir qué requiere atención ahora, recibir cereza sin perder su origen, ejecutar cada lote contra una receta versionada, anticipar capacidad, documentar cualquier ajuste y comparar resultados físicos, operativos y sensoriales entre fincas, meses y cosechas.

No es un sistema de turnos. La jornada se reconstruye por fecha a partir de los hechos registrados. Tampoco es un tablero que autoriza improvisar: si la realidad exige apartarse del plan, primero se registra la modificación, su motivo y su responsable; a partir de ahí el sistema evalúa contra el plan efectivo.

## 2. Personas, contexto y primera pantalla

### 2.1 Dueño o responsable de finca

La entrada responde, en este orden:

1. **¿Dónde quiere trabajar?** Si sólo existe una finca accesible, puede quedar preseleccionada. Con varias fincas se muestra un selector persistente y una vista agregada.
2. **¿Qué requiere atención?** Alertas críticas y altas, actividades previstas, parcelas, entregas y accesos rápidos pertinentes a la finca elegida.
3. Configuración y modificaciones quedan accesibles, pero no compiten con el trabajo diario.

Una alerta extraordinaria aparece en la portada aun antes de escoger un área, siempre respetando permisos.

### 2.2 Responsable del beneficio

La entrada responde primero **¿qué requiere atención?** y muestra:

- entregas esperadas y pedidos por confirmar;
- capacidad prevista, reservada, ocupada y fuera de servicio;
- lotes activos, fase, tiempo transcurrido, próxima medición y desviaciones;
- acciones vencidas o próximas según la versión efectiva de la receta;
- resumen del día y diferencia frente al plan.

No se exige iniciar ni cerrar un turno. Una revisión al final del día es opcional y no bloquea correcciones posteriores; toda corrección tardía queda versionada y auditada.

### 2.3 Recolectores, selectores y ayudantes

Su portada prioriza trabajo asignado y captura rápida. No reciben el tablero completo del responsable. Pueden registrar sólo las acciones y mediciones que permitan sus permisos y el contexto asignado.

## 3. Arquitectura de información del beneficio

La navegación operativa se organiza en áreas, sin duplicar entidades ni rutas que ya funcionan:

1. **Entradas:** programa estacional, pedidos, recepción y selección. Pedir es opcional; recibir es obligatorio; seleccionar parte de lo recibido.
2. **Procesos:** lotes, recetas/versiones, fermentación, secado y seguimiento de fases. Aquí vive el tablero de procesos activos.
3. **Almacenamiento y muestras:** café en su estado material real, reposo, existencias, reservas, humedad, muestras, trilla y reportes relacionados.
4. **Equipos e instrumentos:** capacidad, ubicación, estado, reservas, mantenimiento y uso en el beneficio.
5. **Sensorial:** cata, comparación longitudinal y decisiones de calidad. Sigue siendo un área propia.
6. **Tueste:** área propia. La navegación no debe fingir que está completa mientras falten sus flujos operativos.

Los formularios ocasionales y la configuración se abren bajo demanda. Las páginas principales muestran estado, siguiente acción y excepciones antes que formularios largos.

## 4. Programa estacional confirmado

La temporada se identifica como **2026–2027** y las entregas descritas ocurren entre enero y marzo de 2027.

| Origen | Variedad | Frecuencia | Cantidad comercial prevista | Destino |
|---|---|---:|---:|---|
| Finca Las Nubes, Boquete | Geisha | una entrega por mes, enero–marzo | aproximadamente 12 latas por entrega | Beneficio Las Nubes, Finca Rosina, Cerro Azul |
| Finca Artillería | Geisha | una entrega por mes, enero–marzo | aproximadamente 12 latas por entrega | Beneficio Las Nubes, Finca Rosina, Cerro Azul |

Son seis entregas previstas y aproximadamente 72 latas en total. Una lata es una unidad comercial variable de 30–33 lb, aproximadamente 13.61–14.97 kg. Por tanto, 12 latas sólo producen un rango de planificación aproximado de 163–180 kg; **el peso neto medido en kg al recibir es la verdad operativa**.

Aunque coincidan variedad, fecha o receta, la cereza de fincas distintas permanece separada. Nunca se mezcla automáticamente. Daniel ya observó diferencias físicas entre ambos granos y el sistema debe conservar la posibilidad de explicarlas.

## 5. Pedidos, recepción, selección y formación de lotes

### 5.1 Pedido opcional y unidades

Un pedido puede declarar:

- finca o proveedor de origen y variedad;
- beneficio de destino y fecha o ventana esperada;
- cantidad comercial original: valor, unidad y, para latas, rango de conversión usado al planificar;
- kg estimados para capacidad, sin presentarlos como peso real;
- una o varias versiones de receta previstas y la asignación tentativa en kg;
- notas, hipótesis y objetivo del ensayo;
- anticipación configurable para alertas.

El pedido no es requisito para recibir. Si existe, la recepción se vincula a él y conserva la diferencia entre lo previsto y lo real.

### 5.2 Recepción

Se mantienen las reglas ya aprobadas de doble peso, tara, tolerancia, Brix opcional, nota ante diferencias y rechazo documentado. El sistema guarda la unidad comercial original, pero desde la recepción todas las asignaciones, balances, inventarios y rendimientos usan kg.

Al recibir se debe poder:

1. confirmar o cambiar la intención de receta;
2. repartir los kg aceptados entre distintas recetas/versiones;
3. justificar cualquier cambio respecto del pedido;
4. conservar autor, fecha, motivo y evidencia de la decisión.

### 5.3 Selección y lotes

La selección trabaja sobre material recibido. Los aceptados y cada corriente de rechazo conservan su genealogía y balance de masa.

Una entrega puede producir varios lotes cuando se divide entre recetas. Un lote puede reunir varias recepciones sólo si la mezcla es deliberada, autorizada y no borra la procedencia. Para esta temporada, cada finca permanece en series y lotes separados incluso cuando comparta variedad o receta.

La intención inicial y la ejecución real nunca se sobrescriben una a otra. El sistema debe poder responder: qué se planeó, qué se recibió, cómo se repartió y qué se terminó ejecutando.

## 6. La receta versionada es la autoridad operativa

Cada lote tiene una versión efectiva de receta o, cuando todavía no exista una receta reusable, una intención operativa explícita y versionada. La receta efectiva gobierna:

- fases y secuencia prevista;
- duración o ventana esperada;
- variables, objetivos, tolerancias y ritmo de medición;
- intervenciones previstas;
- objetivo de humedad y criterio de cierre de secado;
- forma material esperada al finalizar cada transformación;
- reposo y ventanas de muestreo;
- objetivo físico, de proceso y sensorial;
- recursos y capacidad previstos.

Los valores generales por método son plantillas u orientación; no sustituyen la receta aplicada al lote ni deben codificarse como verdad universal.

### 6.1 Cambio durante la ejecución

El responsable del beneficio puede ajustar fermentación, secado u otra decisión operativa sin aprobación previa, incluso extender una fase, pero no puede hacerlo de forma invisible. Antes o al registrar la acción debe:

1. crear una revisión del plan efectivo;
2. indicar qué cambió y por qué;
3. registrar autor y hora efectiva;
4. notificar al responsable de finca y a Daniel;
5. cumplir y ser evaluado desde entonces contra la revisión efectiva.

La versión original permanece inmutable. Un buen resultado puede generar una recomendación para observar el ajuste o proponer una nueva versión reusable; nunca modifica automáticamente la receta maestra.

## 7. Estados materiales, secado, reposo y trilla

### 7.1 Estado material real

- Un café lavado u honey conserva el pergamino durante secado y reposo: sale de secado como **pergamino seco**.
- Un natural se seca y reposa como **cereza seca/natural**. No se llama pergamino operativamente.
- El café **verde** aparece después de la trilla o descascarado correspondiente. La transformación registra entradas, verde, cáscara/pergamino retirado, otras salidas y pérdida.
- La trilla puede ser interna, manual o externa; en el escenario actual puede ocurrir en Cafelino, Kiva o manualmente. La custodia de salida y retorno debe quedar trazada.

### 7.2 Inicio y naturaleza del reposo

El reloj de reposo comienza cuando termina el secado y el material queda estabilizado para almacenamiento, nunca al iniciar el secado. Se conservan por separado inicio de secado, objetivo alcanzado, cierre y comienzo de reposo.

El reposo es una edad calculada y no una fase cerrada que impida tomar muestras. La liberación comercial es una decisión aparte y auditada.

### 7.3 Ventanas orientativas

Las siguientes cifras son guía inicial para recetas, no reglas globales:

- lavado: normalmente 60–90 días antes de la muestra prevista;
- natural y honey: normalmente 45–60 días;
- algunos lotes: 3–6 meses.

La versión efectiva de la receta define la ventana aplicable. Si se cambia, se conserva la divergencia y su justificación.

### 7.4 Muestras comparables

Un mismo lote puede producir muestras en distintos momentos. Cada muestra registra como mínimo:

- edad exacta de reposo;
- estado material al tomarla;
- fecha y método de trilla si aplica;
- métricas físicas y humedad;
- protocolo y perfil de tueste de muestra;
- tiempo entre tueste y cata;
- sesión y versión del protocolo sensorial.

Dos resultados sólo se presentan como comparables cuando coinciden o se controlan proceso/receta, ventana de reposo, estado material, preparación de muestra y protocolo de cata. En caso contrario se muestran como **comparables con reservas** y se explican las diferencias.

## 8. Comparación longitudinal y decisión de calidad

La unidad primaria de comparación, mientras no se operen microparcelas, es **finca + variedad**. La vista longitudinal cruza meses y años de cosecha.

### 8.1 Eje físico y de proceso

Incluye kg recibidos, aceptados y removidos; rendimiento de selección; comportamiento de fermentación y secado; cumplimiento y cambios de receta; rendimiento a pergamino/verde; defectos, tamaño de malla y balance de masa.

### 8.2 Eje sensorial

Incluye cata ciega, misma versión de protocolo, preparación y tueste de muestra estandarizados, reposo conocido y diferencias declaradas. Los datos productivos no se duplican si la comparación pasa a ser un protocolo formal de investigación entre cosechas: el protocolo referencia los lotes y observaciones existentes.

### 8.3 Óptimo, espectacular y competencia

Cumplir objetivos operativos no basta para clasificar calidad. La receta declara el perfil buscado; la decisión ocurre después de cata.

El sistema puede sugerir una clasificación, pero sólo Daniel o la persona sensorial responsable autorizada la confirma. Si el panel discrepa, la divergencia no bloquea: se conservan votos, razones y justificación de quien confirma.

La clasificación es interna y puede marcar el lote como candidato a competencia.

## 9. Reservas para competencia

Una reserva:

- aparta kg concretos del saldo disponible para venta, mezcla o consumo ordinario;
- puede coexistir con otras reservas del mismo lote;
- identifica la competencia cuando se conozca;
- sólo la crea, reduce o cancela Daniel o la persona sensorial responsable;
- exige motivo al cambiarse;
- protege la identidad ciega cuando corresponda.

La cantidad se decide por lote, no mediante un valor predefinido. El sobrante no vuelve automáticamente al saldo libre: requiere revisión manual.

## 10. Capacidad, planificación y alertas

### 10.1 Capacidad

La capacidad combina kg/día y recursos concretos: máquinas, tanques, camas, bandejas, estantes e instrumentos. Cada recurso puede estar abierto, reservado, en uso, fuera de servicio o con capacidad parcial disponible.

Un pedido o plan de receta puede reservar capacidad futura. Las previsiones siempre distinguen dato medido, dato declarado y estimación; nunca inventan un cero ni una hora de liberación.

Si una entrega o proceso ya no cabe, no existe una anulación arbitraria del aviso. Se modifica el plan, se documenta el motivo y se notifica a responsable de finca y Daniel.

### 10.2 Prioridad

| Nivel | Ejemplos |
|---|---|
| **Crítica** | riesgo inmediato de pérdida o contaminación; medición crítica; fallo de equipo esencial; clima peligroso para secado; material ya recibido por encima de capacidad segura |
| **Alta** | entrega confirmada sin capacidad; medición o intervención vencida; conflicto o pérdida de recurso; fase cerca de exceder su ventana; dato obligatorio ausente |
| **Próxima** | entrega prevista; capacidad proyectada; mantenimiento; necesidad futura de persona/recurso; ventana de muestra, trilla o cata |
| **Informativa** | finalización; cambio documentado de receta; reserva creada; objetivo cumplido; resultado de cata |

Una alerta alta escala a crítica cuando aumenta el riesgo según tiempo, condición observada o regla de la receta. No escala sólo porque alguien no pulsó un botón. La anticipación de entregas es configurable por pedido/receta.

## 11. Informe diario del beneficio

El informe se ensambla automáticamente por fecha con:

- previsto, recibido, aceptado, rechazado y variación;
- selección y lotes formados;
- fases, mediciones, intervenciones y cambios de plan;
- secado, almacenamiento, muestras, trilla y reservas;
- uso, capacidad y fallos de equipos/instrumentos;
- personas y acciones auditables;
- fotos, notas y correcciones.

La portada muestra **hoy hasta ahora**, **contra el plan**, **qué requiere atención**, **qué llega después**, capacidad, hitos y una vista previa del informe. Una nota de revisión diaria es opcional; no hay cierre de turno ni congelación artificial del día.

## 12. Reconciliación con specs anteriores

| Documento anterior | Se conserva | Esta spec aclara o sustituye |
|---|---|---|
| Recepción de cereza | pedido opcional, doble peso, kg netos, tolerancias, trazabilidad y cierres auditados | admite unidad comercial original; planificación por rango; receta(s) prevista(s); asignación en kg al recibir |
| De la recepción a los lotes | selección antes del proceso, múltiples lotes, genealogía y veredicto atribuible | separa siempre las fincas de esta temporada y conserva intención frente a ejecución |
| Secado por bandeja | topología, mediciones, objetivo y movimiento físico | el estado de salida depende del material/proceso; secar no crea café verde |
| Reposo, trilla y subproductos | reloj desde fin de secado, reposo como edad, trilla opcional, balance y custodia | los umbrales por método dejan de ser autoridad; manda la versión efectiva de receta y sus revisiones |
| Tablero del beneficio | cola de atención, ritmo, capacidad declarada, incertidumbre explícita | añade inicio por rol, reservas futuras, plan diario, programa estacional y escalamiento por riesgo |

Cuando haya contradicción, prevalece este documento en los puntos expresamente corregidos. Lo demás conserva la autoridad de la spec más específica.

## 13. Brechas confirmadas en el código actual

Estas son brechas de implementación, no permiso para corregirlas durante la aprobación de esta spec:

1. **P0 — salida de secado semánticamente incorrecta en UI.** `prisma/schema.prisma` declara que `PARCHMENT` y `GREEN` son estados distintos y que verde es posterior al reposo/trilla, pero `app/lots/[id]/page.tsx` ofrece `green` como salida predeterminada del cierre de secado. `lib/traceability/drying.ts` acepta el tipo suministrado sin derivar/validar el estado según el proceso.
2. **P1 — receta prevista en pedidos y reparto en kg.** `PedidoDeCereza` conserva kg pedidos y calidad, pero no expresa todavía la asignación prevista a versiones de receta ni la unidad comercial original.
3. **P1 — revisión efectiva durante la ejecución.** Hay receta versionada e intención de proceso, pero falta verificar y completar un cambio operativo temporal con vigencia, notificación y comparación plan original/efectivo.
4. **P1 — programa estacional y reservas de capacidad.** El tablero existente calcula ocupación; falta el plan enero–marzo, demanda futura y reserva de recursos.
5. **P1 — informe diario derivado.** Los eventos existen dispersos, pero no hay una vista diaria consolidada plan/real/variación.
6. **P1 — muestras longitudinales comparables.** Existen lotes, muestras y sensorial, pero falta el contrato que determina comparabilidad y la serie finca + variedad entre cosechas.
7. **P1 — reservas de competencia en kg.** Falta verificar una reserva que reduzca saldo disponible sin romper identidad ciega.
8. **P2 — portada por rol.** Las rutas existen, pero la primera pantalla todavía no conduce a finca o beneficio según responsabilidad y urgencia.
9. **P2 — navegación integrada.** Pedidos, recepción, bandejas, lotes, recetas, bodega, sensorial y tueste existen como rutas separadas; falta la agrupación operativa aquí definida.

## 14. Secuencia de implementación segura

### Ola 0 — contrato y corrección semántica

- aprobar este documento;
- probar el estado material permitido por proceso;
- impedir que cierre de secado convierta por defecto pergamino/natural en verde;
- comprobar datos existentes antes de migrar o reinterpretar filas.

**Aceptación:** una prueba recorre lavado, honey y natural desde secado hasta trilla y demuestra estado, cantidades y genealogía correctos; ningún dato histórico se reescribe sin informe previo.

### Ola 1 — programa, pedido y asignación

- unidad comercial original + rango estimado;
- recetas previstas y reparto en kg;
- programa mensual y recepción contra plan;
- aislamiento por finca y variedad.

**Aceptación:** las seis entregas previstas caben en el calendario; cada recepción pesa kg reales; una entrega se divide entre recetas sin perder origen ni balance; Las Nubes y Artillería nunca se fusionan implícitamente.

### Ola 2 — receta efectiva, alertas y capacidad

- revisiones operativas vigentes y notificaciones;
- recursos reservables y proyección;
- alertas con escalamiento verificable;
- tablero del responsable.

**Aceptación:** una extensión de fermentación cambia el plan efectivo sin alterar la receta original; notifica; reprograma mediciones/capacidad; una alerta escala sólo al aumentar el riesgo demostrado.

### Ola 3 — almacenamiento, reposo, muestras y trilla

- estados materiales correctos;
- ventanas por receta;
- muestras múltiples y comparabilidad;
- custodia y balance de trilla.

**Aceptación:** una muestra informa edad de reposo y preparación completa; verde sólo nace de transformación; una comparación incompatible se etiqueta con reservas.

### Ola 4 — calidad longitudinal y competencia

- series finca + variedad;
- recomendación y confirmación humana;
- divergencia de panel;
- reservas de competencia.

**Aceptación:** se comparan meses y cosechas sin duplicar datos; una reserva descuenta kg disponibles; el sobrante no se libera solo; la identidad ciega no se expone.

### Ola 5 — portada por rol e informe diario

- home por contexto y permisos;
- navegación integrada y progresiva;
- informe diario automático con revisión opcional;
- pruebas responsive, accesibilidad e idiomas.

**Aceptación:** dueño, responsable del beneficio y ayudante ven entradas distintas y útiles; todos llegan a su acción principal en pocos pasos; ningún formulario o dato queda inaccesible por el rediseño.

## 15. Restricciones de implementación

- No crear un segundo sistema paralelo de lotes, recetas, tareas, ubicaciones, personas o permisos.
- No mezclar estructuras de finca cafetalera con apiarios.
- No inferir ejecución por la existencia de un archivo o una ruta: probar escritura, lectura, permisos y persistencia.
- No convertir una guía agronómica en restricción global si la receta puede decidirla.
- No borrar intención, versión, divergencia ni dato histórico al corregir un plan.
- No esconder incertidumbre con números inventados.
- No publicar resultados sensoriales restringidos ni identidades ciegas en portadas o notificaciones.
- Toda migración debe demostrar ausencia de deriva y una estrategia explícita para datos existentes.

## 16. Decisiones todavía abiertas

No bloquean la aprobación conceptual, pero deben cerrarse antes de su ola correspondiente:

1. nombre exacto y permisos de la persona sensorial responsable que puede confirmar clasificación y reservar competencia;
2. catálogo inicial de unidades comerciales además de lata y kg;
3. reglas cuantitativas concretas que convierten cada alerta alta en crítica, por variable y receta;
4. competencias iniciales y datos mínimos de inscripción/reserva;
5. protocolo sensorial y perfil de tueste de muestra que servirán como referencia comparable para la temporada.

## 17. Confirmación solicitada

Antes de escribir código, Daniel debe confirmar que este documento refleja:

- las dos fincas, seis entregas y calendario 2027;
- kg como verdad interna y lata como unidad comercial conservada;
- separación por finca + variedad;
- autoridad de la receta efectiva y cambios documentados/notificados;
- estados pergamino, natural seco y verde;
- ventanas de reposo como datos de receta;
- doble comparación física/proceso + sensorial;
- clasificación humana y reservas de competencia;
- capacidad reservable, alertas escalables e informe diario sin turnos.
