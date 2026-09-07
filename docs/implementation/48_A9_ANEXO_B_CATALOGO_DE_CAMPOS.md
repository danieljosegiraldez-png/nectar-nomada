# A9 · Anexo B — Catálogo de campos (entrada del dueño)

> **Qué es esto.** Una lista de campos candidatos, no una especificación. Sale
> de la práctica de campo del dueño y de los reportes reales de Toabré, y está
> aquí para que el informe de alcance tenga materia concreta que evaluar,
> aceptar, recortar o rechazar. **Ningún campo de esta lista está aprobado.**
>
> **Lee primero `48_A9_ANEXO_A_INVENTARIO_DE_LO_QUE_YA_EXISTE.md`.** Este anexo
> se escribió antes de leer `docs/architecture/` completo y su columna «Hoy»
> es menos confiable que el inventario. Donde discrepen, manda el Anexo A.
>
> El criterio que sí conviene conservar: **cada campo declara la decisión que
> alimenta.** Un campo sin esa columna llena no entra, por interesante que sea.

Qué se pregunta, en qué etapa, con qué coste, y para qué sirve después. Anexo
de `48_A9_CAPTURA_DE_CAMPO_PROMPT.md`.

**Cómo leer las columnas**

- **Etapa** — `campo` se pierde si no se anota parado frente a la caja;
  `cierre` se puede escribir en el carro o en la casa. La regla de corte del
  ticket: si se puede escribir en el carro, no va en el campo.
- **Ob.** — obligatorio. Un obligatorio que el operador no puede contestar en
  campo produce basura con forma de dato, así que aquí son pocos y todos
  contestables.
- **Hoy** — `sí` existe en el esquema; `parcial` existe incompleto; `no` no
  está en el esquema; `A10` es candidato a un alcance posterior. **Ojo:** `no`
  aquí significa «no está en el esquema», no «nadie lo pensó». Varias filas
  marcadas `no` corresponden a decisiones documentadas o a máquinas que ya
  existen en otro dominio — el Anexo A dice cuáles.
- **Sirve para** — la decisión, el reporte o la métrica del tablero que este
  campo alimenta. Un campo sin esta columna llena no se construye.

---

## 1. Visita al sitio

Lo que hoy no existe en absoluto. Una visita es lo que convierte tres
inspecciones sueltas en un hecho con fecha, autor y costo.

| Campo | Valores | Etapa | Ob. | Hoy | Sirve para |
|---|---|---|---|---|---|
| Sitio | apiario | campo | sí | sí | contexto; se precarga por GPS o por selección al abrir |
| Fecha y hora de inicio | fecha-hora | campo | sí | no | «última visita» por sitio, la pregunta de apertura del dueño |
| Propósito | inspección, alimentación, tratamiento, cosecha, montaje, diagnóstico | campo | sí | no | filtrar el historial; saber si un sitio sólo recibe alimentación y nunca revisión |
| Operadores | personas | campo | sí | parcial | reparto de trabajo; quién sabe qué del sitio |
| Clima observado | despejado, nublado, viento, lluvia | campo | no | no | explicar una inspección corta o abortada; contrasta con la capa externa |
| Condición del sitio | una línea | campo | no | no | hormigas en cajas vacías, moho, dosel, agua, cerca caída — lo que es del sitio y no de una caja |
| Colonias vivas contadas | entero | campo (al salir) | sí | no | **la cifra que falta.** Serie histórica del sitio, déficit de polinización, alerta de reposición |
| Cajas presentes | entero | campo (al salir) | no | no | distinguir «cero colonias» de «cero cajas» |
| Fecha de fin | fecha-hora | campo | no | no | duración real; costeo por hora |
| Viáticos y transporte | USD | cierre | no | no | si el sitio se sostiene; ~$62 por viaje desde Parita es la cifra que motivó la propuesta de entrenar a un residente |
| Próxima visita | fecha | cierre | sí | no | «próxima visita» y el estado *vencida* en la lista de sitios |
| Causa probable | texto | cierre | no | no | interpretación, con su propia clase de procedencia |
| Recomendación al cliente | texto | cierre | no | no | cuerpo del reporte |
| Clima del período | temp., HR, lluvia | cierre (automático) | no | externa | adjuntar al cerrar; contexto de la serie |

---

## 2. Inspección de colonia

El camino principal sigue siendo **un toque**. Todo lo de abajo aparece sólo al
desplegar «Registrar detalles», y sólo lo que el protocolo del sitio active.

### 2.1 Lo que ya es columna en `Inspection`

| Campo | Valores | Etapa | Ob. | Hoy | Sirve para |
|---|---|---|---|---|---|
| Resultado | sin novedad / con hallazgo | campo | sí | sí | el único obligatorio real; decide la forma del resto del formulario |
| Reina vista | sí / no / no se buscó | campo | no | sí | detectar orfandad antes de que se note en la población |
| Patrón de cría | compacto, salteado, apretado, promedio, nulo | campo | no | sí | salud de la reina; salteado sostenido = reemplazo |
| Nivel de reservas | abundantes, suficientes, escasas, nulas | campo | no | sí | disparar alimentación; es el predictor más barato de ausentamiento |
| Temperamento | mansa, normal, defensiva | campo | no | sí | seguridad del operador; en africanizada decide si se sigue trabajando ese día |
| Plagas / enfermedad | banderas | campo | no | sí | ver 2.3 |
| Nota | texto corto | campo | no | sí | lo que no cabe arriba. **Una línea, no un párrafo** |

### 2.2 Estado de la colonia — nuevo, por protocolo

| Campo | Valores | Etapa | Ob. | Hoy | Sirve para |
|---|---|---|---|---|---|
| Población | baja, normal, apiñada | campo | no | no | fuerza de la colonia; es lo que se vende en polinización |
| Cuadros cubiertos de abeja | entero | campo | no | no | la medida cuantitativa de fuerza; comparable entre visitas y entre sitios |
| Etapa de cría presente | huevo, larva, operculada, pupa | campo | no | no | huevo presente = reina ponedora hace menos de tres días, sin buscarla |
| Celdas reales | no hay / emergencia / enjambrazón / reemplazo, y cuántas | campo | no | no | **aviso de enjambrazón antes de perder la colonia.** Directamente relevante al ausentamiento de Toabré |
| Reservas de miel | alta, media, baja, junto a la cría | campo | no | parcial | separar miel de polen; hoy `storesLevel` es un solo texto |
| Reservas de polen | alta, media, baja, junto a la cría | campo | no | no | escasez de polen frena la cría antes que la de néctar |
| Zángano / cría de zángano | sí / no | campo | no | no | señal de obrera ponedora si aparece sin reina |

### 2.3 Irregularidades — lista de casillas, no texto libre

Hoy `pestDiseaseFlags` es una cadena. Una cadena no se puede contar, y «todas
las colonias con varroa esta temporada» es exactamente el reporte que hace
falta.

| Bandera | Por qué está en la lista |
|---|---|
| Varroa | la plaga que define el calendario de tratamiento |
| Polilla de la cera | segunda causa de pérdida en caja debilitada |
| Pequeño escarabajo de la colmena | presente en la región |
| Hormigas | **entraron a las cajas vacías de Toabré dos semanas después del ausentamiento** — registrarlo con fecha es lo que permitió descartarlas como causa |
| Moho | la condición que define Finca 1 frente a Finca 2 |
| Cría calva / cría en perdigón | patología de cría |
| Loque | notificable |
| Alas deformadas | virus asociado a varroa |
| Olor anormal | primer indicio de loque |
| Disentería | invernada o alimento fermentado |
| Obrera ponedora | pérdida de reina consumada |
| Saqueo | explica una caja vacía sin ausentamiento |
| Hambre | lo que el nivel de reservas anticipa |
| Otro | texto, siempre disponible |

### 2.4 Configuración de la caja

Cambia poco entre visitas, así que se guarda **en la colmena** y en la
inspección sólo se registra la diferencia. Preguntarlo cada vez es coste sin
información.

| Campo | Valores | Etapa | Hoy | Sirve para |
|---|---|---|---|---|
| Cámaras de cría / alzas | enteros | campo, sólo si cambió | no | capacidad; base del rendimiento por caja |
| Cuadros por caja | entero | cierre | no | denominador de «cuadros cubiertos» |
| Excluidor de reina | sí / no | campo, sólo si cambió | no | calidad de la miel cosechada |
| Alimentador | tipo | campo, sólo si cambió | no | en Toabré: bolsa de jarabe sobre los cabezales |
| Reductor de piquera | sí / no | campo, sólo si cambió | no | defensa de colonia débil o recién instalada |
| Piso sanitario / bandeja | sí / no | campo, sólo si cambió | no | requisito del conteo de varroa |

### 2.5 Monitoreo de varroa

Cuenta aparte porque es una medición, no una observación.

| Campo | Valores | Etapa | Ob. | Hoy | Sirve para |
|---|---|---|---|---|---|
| Método | alcohol, azúcar, bandeja, otro | campo | sí si hay conteo | no | el resultado sólo es comparable dentro del mismo método |
| Abejas de muestra | entero | campo | sí si hay conteo | no | denominador |
| Ácaros contados | entero | campo | sí si hay conteo | no | numerador |
| Infestación % | derivado | — | — | no | umbral de tratamiento; serie por colonia y por sitio |

---

## 3. Alimentación

Dos toques, con el último valor precargado. Un tercero, nuevo y obligatorio.

| Campo | Valores | Etapa | Ob. | Hoy | Sirve para |
|---|---|---|---|---|---|
| Material | jarabe 1:1, jarabe 2:1, sustituto de polen, torta, otro | campo | sí | sí | consumo por temporada; costo por sitio |
| Cantidad y unidad | decimal + unidad | campo | sí | sí | inventario; el quintal de diciembre alcanzó hasta julio |
| Método | bolsa sobre cabezales, alimentador de entrada, división, otro | campo | no | no | comparar consumo entre métodos |
| **Alcanza hasta** | fecha estimada | campo | **sí** | **no** | **el campo que faltó en Toabré.** El alimento del 22 de julio cubría seis semanas: vencía cerca del 2 de septiembre, el día en que se encontró todo vacío. Con este campo, el aviso llega antes y no después |
| Quién alimentó | persona | campo | sí | sí | la propuesta de entrenar a un residente se mide con esto |

---

## 4. Aplicación fitosanitaria

Tres toques obligatorios, uno más que alimentar, por una razón honesta: sin
lote no hay trazabilidad de residuo.

| Campo | Valores | Etapa | Ob. | Hoy | Sirve para |
|---|---|---|---|---|---|
| Producto | texto o catálogo | campo | sí | sí | reporte de tratamientos de la temporada |
| Lote del producto | texto | campo | sí | sí | trazabilidad hacia atrás si aparece residuo |
| Dosis y unidad | decimal + unidad | campo | sí | sí | eficacia contra sobredosis |
| Objetivo | varroa, polilla, escarabajo, hormiga, otro | campo | sí | no | eficacia por objetivo; hoy no se puede agrupar |
| Vía | tira, goteo, espolvoreo, vaporización, cebo, otro | campo | no | no | comparar eficacia entre vías |
| **Período de carencia** | días | campo | **sí** | **no** | **decide cuándo se puede cosechar.** Sin él, una cosecha puede violar la carencia sin que el sistema lo sepa |
| Fecha de retiro | fecha | cierre | no | no | las tiras que no se retiran generan resistencia |
| Eficacia observada | conteo posterior | cierre | no | no | cerrar el ciclo: tratar, volver a contar, comparar |
| Aplicación vecina que la motivó | referencia | cierre | no | A10 | ligar la deriva de agroquímicos con la respuesta |

---

## 5. Cosecha

| Campo | Valores | Etapa | Ob. | Hoy | Sirve para |
|---|---|---|---|---|---|
| Cuadros cosechados | entero | campo | no | sí | rendimiento por cuadro |
| Peso extraído | kg | cierre | no | sí | se pesa en la extracción, no en el apiario — por eso es cierre |
| Tipo de miel | multifloral, monofloral declarada, mielato | cierre | no | no | terruño por sitio y por temporada; base del producto |
| Humedad | % | cierre | no | parcial | criterio de fermentación; medición de extracción |
| Colonias que aportaron | referencia | campo | sí | sí | ya se resuelve por la colonia; mantener |
| Lote resultante | referencia | — | — | sí | ya se genera con el mecanismo del café |
| Carencia vigente | derivado | — | — | no | **bloqueo**: si hay tratamiento con carencia activa, la cosecha avisa |

---

## 6. Reina y reproducción — aplazado con razón escrita

`DOMAIN_MODEL.md` §4 marca `Queen` como `[DEFERRED — not a separate entity]`, y
el reporte de alcance de agosto lo razona: registrar el **hecho** del origen
cuesta una columna, registrar la **mecánica** de la división cuesta un grafo.
Ese razonamiento sigue en pie. Lo que cambió es el precio, y por eso se lista
aquí: para que quede escrito qué se pierde cada semana que pasa.

| Campo | Valores | Sirve para |
|---|---|---|
| Origen de la reina | comprada, criada propia, reemplazo natural, capturada | comparar Parita contra Santa Fe, la comparación que Toabré abrió sola en septiembre |
| Color de marca y año | color + año | edad de la reina sin abrir registros |
| Fecha de introducción | fecha | tiempo hasta postura; aceptación por origen |
| Aceptada | sí / no | tasa de aceptación por proveedor |
| Fecha de reemplazo y motivo | fecha + motivo | vida útil real en condiciones de Panamá |
| División: colonia madre | referencia | **genealogía.** Hoy `split` es un hecho plano sin madre |
| Enjambre capturado: lugar | texto | el enjambre silvestre de Lote 2 llegó solo y no tiene ficha |

---

## 7. Medios

| Campo | Valores | Etapa | Ob. | Hoy | Sirve para |
|---|---|---|---|---|---|
| Foto o video | archivo | campo | no | sí | ya sube a R2 con URL firmada |
| A qué se liga | colmena, colonia, inspección, evento, visita | cierre | sí | sí | `Asset` ya tiene FK a colmena, colonia, inspección y evento: el padre existe. Lo que falta es ligarlas **después**, desde el cierre, cuando se subieron sueltas |
| Qué afirma | una línea | cierre | no | no | lo que hace buscable un archivo dentro de dos años. Es `AssetAnnotation`, que el audit del café ya identificó como faltante para los dos dominios |
| Quién aparece | personas | cierre | no | parcial | Chayanne es el de manga larga celeste y sombrero de ala ancha en los sets de julio y septiembre |

---

## 8. Lo que se decidió NO preguntar

Y por qué, para que no vuelva a aparecer sin argumento.

- **Ánimo de la colonia como campo aparte del temperamento.** Es el mismo hecho
  con dos nombres.
- **Casillas de tareas pendientes dentro de la inspección.** Una tarea no es una
  observación. Si hace falta, es una tarea del sistema con responsable y fecha,
  no una casilla suelta en el formulario.
- **Peso de la colmena estimado a mano.** No es comparable entre operadores y
  no cambia ninguna decisión. Cuando importe, será un sensor.
- **Notas largas en campo.** La nota de campo es de una línea. La descripción
  se escribe en el cierre, donde hay teclado y la persona ya no está de pie al
  sol con guantes.
