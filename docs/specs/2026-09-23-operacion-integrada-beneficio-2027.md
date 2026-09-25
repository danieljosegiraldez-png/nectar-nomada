# Operación integrada del beneficio — temporada 2026–2027

**Estado:** aprobado por Daniel el 2026-09-23; implementación por olas, con revisión UX en cada superficie.
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

### 7.5 De almacenamiento a muestra verde, tueste de muestra y cata

La persona puede iniciar **Preparar muestra verde** desde Trilla, desde el lote almacenado o desde su ficha de existencias. La interfaz presenta un solo recorrido y el sistema conserva cada hecho físico por separado:

1. **Apartar la muestra.** Se registra cuánto material se retira del lote almacenado, quién lo hizo, cuándo, humedad y estado de origen. La cantidad se descuenta una sola vez del lote.
2. **Trillar la muestra, cuando corresponda.** Si el lote está en pergamino o cereza seca, se registra una trilla de muestra con masa de entrada, verde obtenido, cascarilla y merma. Si el lote ya es verde, este paso se omite; nunca se inventa una segunda trilla.
3. **Confirmar la muestra verde.** La muestra canónica conserva el lote de origen, la transformación que la produjo, edad de reposo, fecha/método/lugar de trilla, humedad, masa verde y responsable.
4. **Preparar uno o varios tuestes de muestra.** Cada ejecución parte de la misma muestra verde, pero tiene identidad propia. Registra propósito `sample`, perfil/version de tueste —o «sin perfil» durante exploración—, tostador, equipo, pesos de carga y descarga, inicio/fin, primer y segundo crack, nivel, notas y puntos de curva.
5. **Enviar a cata.** Un código ciego representa una preparación tostada concreta: muestra verde + sesión de tueste. No basta con apuntar sólo a la muestra verde cuando existen dos tuestes diferentes del mismo café.
6. **Comparar.** La vista permite comparar perfiles, tostadores, equipos y curvas contra los resultados sensoriales, manteniendo oculto el mapeo durante la cata.

La muestra verde es la identidad estable del café; el tueste es una preparación repetible de esa muestra. No se crea una muestra verde nueva sólo por cambiar de perfil de tueste. Tampoco se descuenta nuevamente del lote principal al tostar: la extracción ya movió físicamente esa cantidad fuera del lote.

#### Datos mínimos de una curva de tueste

- tiempo transcurrido y temperatura, indicando sensor/variable (grano, aire, ambiente u otra declarada);
- carga, punto de retorno cuando se mida, cambios de energía/aire cuando se documenten, primer crack, segundo crack si ocurre y descarga;
- origen del dato: manual, archivo del tostador o integración;
- unidad, instrumento/equipo, autor y hora;
- archivo original opcional, sin sustituir los puntos estructurados necesarios para comparar.

La curva no se reduce a una imagen. Una imagen o archivo puede adjuntarse como evidencia, pero los puntos utilizados en comparaciones deben permanecer consultables.

#### Decisiones operativas confirmadas para la selección verde

El recorrido comienza desde café almacenado. Si está en pergamino o cereza seca se trilla una cantidad mayor; si ya está trillado se continúa desde el inventario verde. No existe una muestra lista para tueste antes de obtener café verde.

Después de la trilla se selecciona el verde, no la cereza:

- las mallas y rangos siguen el catálogo internacional SCA y son la identificación principal;
- grado o calidad es una clasificación adicional documentada;
- cada fracción conserva inventario, peso, porcentaje, defectos y genealogía propios;
- las fracciones pueden combinarse después mediante una transformación explícita con cantidades, responsable y motivo;
- se puede registrar una secuencia de mallas, un resultado resumido o una bolsa recibida ya seleccionada externamente;
- el dato distingue medido, declarado por proveedor, revisado cualitativamente y desconocido;
- etiquetas, fotografías y documentos del proveedor son evidencia opcional;
- uniformidad y tolerancia fuera de malla pueden medirse; desconocido nunca equivale a cero ni bloquea tueste/cata.

El peso total retirado como defecto es necesario para balance; clasificarlo es opcional. Cuando se clasifica puede conservar tipo, peso o conteo, fotografía y comentario. La observación real se guarda separada de cualquier interpretación. Una regla predefinida puede notificar o crear una tarea; Daniel o el responsable del beneficio pueden configurar esa regla o convertir una alerta en tarea. Una sugerencia de IA sólo aparece cuando alguien la solicita y nunca se guarda como diagnóstico automático.

El color verde se registra visualmente como guía opcional (`verde azulado`, `verde intenso`, `verde`, `verde pálido`, `amarillento`, `marrón`, `blanquecino/decolorado`, `desigual/mixto`, `otro`, `no evaluado`), con iluminación, fondo, fotografía y método cuando estén disponibles. Las posibles interpretaciones se muestran sólo al solicitar una guía fija o una consulta de IA. Humedad, densidad y color son mediciones opcionales habituales; actividad de agua no aparece en el formulario operativo normal.

#### Decisiones confirmadas para muestra y tueste

- muestra verde habitual: 100–1.000 g;
- carga habitual por tueste de muestra: 80–250 g;
- el sistema muestra masa inicial, consumida y disponible, sin recomendar cuántos tuestes hacer;
- cada tostador puede declarar capacidad mínima, máxima y nominal; salir del rango avisa, pero permite continuar con justificación;
- un perfil conserva objetivos por etapas y curva de referencia; la ejecución conserva su curva real por separado;
- potencia/gas, aire, compuerta, tambor y otros controles aparecen sólo cuando la persona indica que los registró;
- la curva admite captura manual, archivo exportado o integración; el original se conserva y los datos interpretables quedan estructurados;
- una imagen sola se admite como evidencia y se marca `curva visual, sin datos estructurados`;
- las curvas de referencia y ejecución se comparan al finalizar, nunca superpuestas durante el tueste salvo solicitud futura distinta;
- las anotaciones y correcciones sobre curva conservan autor, instante, valor anterior y motivo;
- una persona autorizada por las reglas del área de tueste puede concluir `replicado`, `casi replicado` o `fuera de referencia`.

La ventana habitual entre tueste y cata es 2–14 días y puede ser afinada por perfil/protocolo. Cada resultado muestra el tiempo exacto; fuera de ventana se permite con divergencia y se compara con reservas.

#### Porciones, entrega y evaluación externa

Un tueste de muestra puede dividirse en una o varias porciones selladas. Cada porción tiene código y QR, masa inicial/restante, envase, ubicación, fecha, destino y custodia; puede consumirse en cata o entregarse a cliente, laboratorio o competencia sin perder la sesión de tueste y su curva.

Una entrega a cliente puede ser abierta, ciega, ciega hasta evaluar o de revelación manual. El enlace controlado permite confirmar recepción y responder el mismo protocolo sensorial autorizado. La evaluación entra como externa pendiente de revisión; al aprobarse se incorpora automáticamente a la vista consolidada, siempre identificada como externa. El consolidado muestra promedio, mínimo, máximo, dispersión y diferencias entre grupos.

Daniel configura ponderaciones globales por tipo de evaluador y excepciones versionadas por protocolo/proyecto. Una cata individual no las cambia sin excepción explícita de Daniel. El jefe de cata registra la decisión final después de los puntajes e indica consenso, mayoría o decisión técnica. Confirmar un tueste preferido vuelve su perfil recomendado únicamente para esa selección/lote; reutilizarlo en cafés similares queda para otra fase.

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

1. **DONE — salida física de secado.** El cierre produce pergamino o cereza seca; verde nace después mediante trilla. Las pruebas cubren lavado, honey y natural sin reescribir historia.
2. **P1 — receta prevista en pedidos y reparto en kg.** `PedidoDeCereza` conserva kg pedidos y calidad, pero no expresa todavía la asignación prevista a versiones de receta ni la unidad comercial original.
3. **P1 — revisión efectiva durante la ejecución.** Hay receta versionada e intención de proceso, pero falta verificar y completar un cambio operativo temporal con vigencia, notificación y comparación plan original/efectivo.
4. **P1 — programa estacional y reservas de capacidad.** El tablero existente calcula ocupación; falta el plan enero–marzo, demanda futura y reserva de recursos.
5. **P1 — informe diario derivado.** Los eventos existen dispersos, pero no hay una vista diaria consolidada plan/real/variación.
6. **P1 — muestras longitudinales comparables.** Existen lotes, muestras y sensorial, pero falta el contrato que determina comparabilidad y la serie finca + variedad entre cosechas.
7. **P1 — reservas de competencia en kg.** Falta verificar una reserva que reduzca saldo disponible sin romper identidad ciega.
8. **DONE — trilla operable desde la app.** `/lots/[id]/hulling/new` registra balance, cascarilla, merma, ubicación y abre el lote verde trazable.
9. **DONE — muestra verde → tueste → cata.** La muestra se aparta en gramos desde una fracción verde; cada tueste conserva `sourceSampleId`; la cata selecciona la preparación específica y el mapeo ciego conserva `roastSessionId`. El jefe de cata ve perfil, equipo y edad exacta; el juez no ve el mapeo.
10. **P2 — captura de curva y porciones.** Ya se escoge equipo canónico y perfil. Falta captura/importación de puntos de curva y dividir el tueste en porciones con QR, custodia y saldo.
11. **P2 — portada por rol.** Las rutas existen, pero la primera pantalla todavía no conduce a finca o beneficio según responsabilidad y urgencia.
12. **P2 — navegación integrada.** Pedidos, recepción, bandejas, lotes, recetas, bodega, sensorial y tueste existen como rutas separadas; falta la agrupación operativa aquí definida.

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
- recorrido desde almacenamiento para apartar y trillar una muestra verde;
- tuestes de muestra vinculados a la muestra, con tostador, equipo, perfil y curva;
- preparación tostada específica vinculada a la cata ciega.

**Aceptación:** una muestra informa edad de reposo y preparación completa; verde sólo nace de transformación; una comparación incompatible se etiqueta con reservas. Desde un lote en pergamino se puede preparar una muestra verde sin doble descuento, tostarla dos veces con equipos/perfiles distintos y llevar ambas preparaciones a una cata ciega; al revelar, cada resultado llega a su curva y al mismo origen.

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
