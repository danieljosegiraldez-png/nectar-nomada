<!--
FUENTE. Este archivo es un REGISTRO, no una decisión de arquitectura. ADR-200 lo resume por tema.

Procedencia: la entrevista sobre el módulo Apiario del 2026-10-11 y el 2026-10-12, en la sesión de
Claude a904cdd0-7e87-41cf-aac5-9fb5b1d89825, extraída de su transcripción por programa —no reescrita
de memoria—. Cada pregunta va tal como se hizo, con sus opciones, desde su ancla («Pregunta N») hasta
el final del mensaje. Cada respuesta va literal, con la línea del .jsonl (contando desde 1) y la hora
en UTC. El generador abortaba si un ancla no casaba o si una respuesta no era la que se esperaba: no
hay huecos rellenados a mano.

Por qué existe: la misma razón que FUENTE_DECISIONES_DEL_DUENO_2026-09.md. Casi todas las respuestas
son una letra, «a» o «b», que sin su pregunta no dice nada, y la pregunta sólo vive en una
transcripción que no se versiona.

Una respuesta —«puse trampas solamente», línea 9020— llegó como mensaje enviado MIENTRAS se
trabajaba, que la herramienta entrega como adjunto en cola y no como mensaje aparte. El primer
barrido no la vio. Se buscaron los adjuntos de origen humano desde la línea 8300 hasta el final, y
es la única.

Las opciones marcadas «(Recomendado)» las propuso Claude; lo que manda es la letra de Daniel. Las
líneas del repositorio que citan las preguntas son del árbol de ese día; ADR-200 las vuelve a medir
sobre origin/main c59319a0. La pregunta del cierre dice «ADR-199»: así se hizo, y el número pasó a
200 porque el PR #727 ya había tomado el 199.

No editar el texto de ninguna pregunta ni respuesta. Una corrección va como nota del dueño, fechada,
al final (ADR-147).
-->

# Decisiones del dueño — octubre de 2026, módulo Apiario

**37 decisiones**: las dos de V-9 y 35 de las 36 preguntas numeradas. La 13 quedó aparcada al saberse
que no hay meliponas todavía. Arriba, el índice; debajo, cada pregunta con su respuesta.

| # | tema | qué se preguntó | respuesta literal | dónde aterriza |
|---|---|---|---|---|
| V-9a | Informe de la visita | el alcance de la próxima visita | «a» | ADR-200 §1 |
| V-9b | Informe de la visita | el pendiente en el informe del cliente | «a» | ADR-200 §1 |
| 1 | Especie y sistema | varroa en un meliponario (E-2a) | «a» | ADR-200 §2 |
| 2 | Especie y sistema | cuadros en el servicio de un meliponario (E-2b) | «a» | ADR-200 §2 |
| 3 | Especie y sistema | objetivos de intervención en sin aguijón (E-2c) | «hay que investigar, revisa los documentos que tenemos , y si hace falta buscar mas con idoneidad de apicultura» · «a» | ADR-200 §2 |
| 4 | Especie y sistema | «Tratamiento» o «Intervención» en un meliponario | «a» | ADR-200 §2 |
| 5 | Especie y sistema | crear ya la tabla de especies (E-1a) | «a» | ADR-200 §3 |
| 6 | Especie y sistema | con qué filas nace la tabla de especies | «a» | ADR-200 §3 |
| 7 | Especie y sistema | sistemas de colmena que se usan (E-1b) | «a, e: hay que investigar» | ADR-200 §4 |
| 8 | Especie y sistema | cómo se anota «africanizada» (E-1d) | «a» | ADR-200 §3 |
| 9 | Especie y sistema | otra especie en un meliponario que ya tiene una (E-1c) | «a» | ADR-200 §2 |
| 10 | Especie y sistema | en qué vienen las meliponas de Parita | «f, hay que investigar» · «no tengo meliponas todavia» · «puse trampas solamente» | ADR-200 §4 y §8 |
| 11 | Especie y sistema | la familia vertical de módulos | «a» | ADR-200 §4 |
| 12 | Especie y sistema | el nido trampa | «b» | ADR-200 §4 |
| 13 | Especie y sistema | medidas de la caja | — (aparcada) | ADR-200 §8 (aparcada) |
| 14 | Especie y sistema | registrar ya las trampas | «a» | ADR-200 §4 |
| 15 | Especie y sistema | qué se anota al revisar una trampa | «a, tienes skill de apicultura activa, la usas?» | ADR-200 §4 |
| 16 | Especie y sistema | la especie como identificaciones fechadas | «a» | ADR-200 §3 y §4 |
| 17 | Alimentación y costos | la libra (C-1a) | «a» | ADR-200 §5 |
| 18 | Alimentación y costos | qué mide «Cantidad» (C-1b) | «a» | ADR-200 §5 |
| 19 | Alimentación y costos | el azúcar y el inventario (C-2) | «a» | ADR-200 §5 |
| 20 | Alimentación y costos | el viático de un viaje a dos sitios (C-3) | «a» | ADR-200 §5 |
| 21 | Alimentación y costos | el viático en el informe del cliente (C-3b) | «a» | ADR-200 §5 |
| 22 | Alimentación y costos | qué hueco de costos se diseña primero (C-4) | «a» | ADR-200 §5 |
| 23 | Polinización | qué es el 4–6 colmenas/ha en Kiva (P-2) | «a» | ADR-200 §6 |
| 24 | Polinización | la alerta de floración sin número pactado | «a» | ADR-200 §6 |
| 25 | Polinización | dónde entra la alerta de floración en el tablero | «a» | ADR-200 §6 |
| 26 | Polinización | cuántos apiarios hay en Toabré (P-1) | «a» | ADR-200 §6 |
| 27 | Recomendaciones | qué pasa con una recomendación después del informe (R-3) | «b» | ADR-200 §7 |
| 28 | Recomendaciones | quién anota la decisión del cliente | «a» | ADR-200 §7 |
| 29 | Recomendaciones | cuándo una recomendación está cumplida | «a» | ADR-200 §7 |
| 30 | Recomendaciones | qué se muestra al abrir la visita siguiente | «a» | ADR-200 §7 |
| 31 | Hipótesis de la visita | un registro tardío (V-H1) | «b» | ADR-200 §1 |
| 32 | Hipótesis de la visita | cerrar con registros sin enviar | «a» | ADR-200 §1 |
| 33 | Hipótesis de la visita | visita vencida con otra ya hecha (V-H3) | «a» | ADR-200 §1 |
| 34 | Hipótesis de la visita | la próxima visita al completar | «a» | ADR-200 §1 |
| 35 | Hipótesis de la visita | un sitio sin próxima fecha en el tablero | «a» | ADR-200 §1 |
| 36 | Hipótesis de la visita | el número de una caja que salió (V-H4) | «a» | ADR-200 §4 |
| cierre | Cierre | dónde se deja escrito | «a» | este archivo y ADR-200 |

## V-9a · el alcance de la próxima visita

*Informe de la visita · se aplica en ADR-200 §1*

**Pregunta** (Claude, literal) · 2026-10-11 05:24Z · transcripción, línea 8382

```text
**¿Qué es el «alcance» de la próxima visita?**
- **A) (Recomendado)** Los propósitos de la próxima visita, elegidos de la misma lista que hoy (inspección, alimentación, tratamiento, cosecha, montaje, diagnóstico), opcionales al cerrar. Quedan ordenados para contar y se pueden proponer al abrir la siguiente.
- **B)** Una línea de texto libre al cerrar.
- **C)** Sólo la fecha. El informe dice «alcance sin registrar», como tu regla de nombrar el dato que falta.

(Aparte, del repositorio: sigue abierta tu decisión **P-J**, cuál de los dos productos de abamectina hay en la bodega, de 24 h o 48 h de reingreso. No es de este tema; sólo te la recuerdo.)
```

**Respuesta** (Daniel, literal) · 2026-10-11 06:03Z · transcripción, línea 8391

```text
a
```


## V-9b · el pendiente en el informe del cliente

*Informe de la visita · se aplica en ADR-200 §1*

**Pregunta** (Claude, literal) · 2026-10-11 06:03Z · transcripción, línea 8404

```text
Me queda una duda dentro de V-9, porque tus dos anexos no dicen lo mismo:
- **El Anexo E §5** dice que del cierre, con «lo que quedó pendiente», sale el informe al cliente.
- **La tabla del Anexo C §3.1** no lista el pendiente entre las secciones del informe.

La pregunta, entonces: **¿el informe que ve el cliente dice qué cajas quedaron sin atender?** Por ejemplo, «Inspección: faltan 2 cajas, H3 y H5».
- **A) (Recomendado)** Sí, como parte del resumen. Es tu regla del Anexo C: «un dato que falta se nombra», y le dice al cliente qué queda para la próxima visita.
- **B)** Sólo en el informe interno. El cliente ve lo que se hizo, no lo que faltó.
- **C)** No se congela; el pendiente sólo vive en la pantalla de la visita.
```

**Respuesta** (Daniel, literal) · 2026-10-11 06:07Z · transcripción, línea 8408

```text
a
```


## 1 · varroa en un meliponario (E-2a)

*Especie y sistema · se aplica en ADR-200 §2*

**Pregunta** (Claude, literal) · 2026-10-11 14:55Z · transcripción, línea 8466

```text
**Pregunta 1 (E-2a).** Hoy el sistema acepta un conteo de varroa y un tratamiento contra varroa en una colonia de **meliponario**: ni el servicio ni la cola sin conexión miran el tipo de sitio. La varroa es un ácaro de *Apis*, y las abejas sin aguijón no son su hospedador. Además, #709 y #712 llevarían ese dato al informe del cliente.

¿Qué hace el sistema con eso en un meliponario?
- **A) (Recomendado)** Lo **rechaza**, en el servicio y en la cola sin conexión, y la ficha no ofrece la sección de varroa. Ocultarlo sólo en pantalla no frena un guion ni la cola.
- **B)** Lo guarda, pero con un aviso visible.
- **C)** Sólo lo oculta en pantalla, como se hizo con los cuadros en #690. El servicio y la cola lo siguen aceptando.
```

**Respuesta** (Daniel, literal) · 2026-10-11 15:04Z · transcripción, línea 8476

```text
a
```


## 2 · cuadros en el servicio de un meliponario (E-2b)

*Especie y sistema · se aplica en ADR-200 §2*

**Pregunta** (Claude, literal) · 2026-10-11 15:04Z · transcripción, línea 8491

```text
**Pregunta 2 (E-2b).** Desde #690, el formulario ya no pregunta por **cuadros** en un meliponario. Pero el servicio y la cola sin conexión todavía aceptan cuadros cubiertos y marcos negros si alguien los manda, por ejemplo un guion o una versión vieja de la app. #690 dejó esa puerta abierta a propósito, porque cerrarla era una regla tuya que nadie te había preguntado.

¿La cierro también?
- **A) (Recomendado)** No. Basta con no preguntarlos. A diferencia de la varroa, no es una afirmación sanitaria falsa, y rechazar en la cola sin conexión añade un camino de error en el campo por poca ganancia.
- **B)** Sí, rechazarlos también en el servicio y en la cola, como la varroa.
```

**Respuesta** (Daniel, literal) · 2026-10-11 17:19Z · transcripción, línea 8495

```text
a
```


## 3 · objetivos de intervención en sin aguijón (E-2c)

*Especie y sistema · se aplica en ADR-200 §2*

**Pregunta** (Claude, literal) · 2026-10-11 17:19Z · transcripción, línea 8499

```text
**Pregunta 3 (E-2c).** Hoy los objetivos de tratamiento son cinco (varroa, hormigas, polilla, escarabajo y «otro») y los cerraste pensando en *Apis*. Con tu respuesta 1, la varroa sale del meliponario.

La única fuente de sin aguijón que hay en el repositorio, la ficha ANSA (que ya bajaste a referencia externa), nombra la **mosca fórida**, y esa no está en la lista.

¿Qué objetivos se ofrecen al tratar una colonia de **sin aguijón**?
- **A) (Recomendado)** Me dictas tú la lista; escríbela en «Other». Es dato de tu oficio, no del repositorio, y se añade lo que falte, como la fórida.
- **B)** Sólo «otro (di cuál)» hasta que me la dictes. No asume nada.
- **C)** Los mismos de *Apis* menos la varroa: hormigas, polilla, escarabajo y otro. Supone que valen para sin aguijón.
```

**Pregunta** (Claude, literal) · 2026-10-11 21:00Z · transcripción, línea 8550

```text
**Pregunta 3 (E-2c).** ¿Qué objetivos se ofrecen al intervenir una colonia de sin aguijón?
- **A) (Recomendado)** Fóridos, hormigas, abeja ladrona y «otro (di cuál)». Son los tres que sostiene la evidencia; lo demás cabe en «otro».
- **B)** Esos tres, más moscona y escarabajo como opciones fijas, aunque su evidencia sea baja.
- **C)** Sólo «otro (di cuál)», hasta que confirmes lo que has visto tú en tus meliponarios.
```

**Respuesta** (Daniel, literal) · 2026-10-11 17:20Z · transcripción, línea 8503

```text
hay que investigar, revisa los documentos que tenemos , y si hace falta buscar mas con idoneidad de apicultura
```

**Respuesta** (Daniel, literal) · 2026-10-11 21:26Z · transcripción, línea 8559

```text
a
```


## 4 · «Tratamiento» o «Intervención» en un meliponario

*Especie y sistema · se aplica en ADR-200 §2*

**Pregunta** (Claude, literal) · 2026-10-11 21:27Z · transcripción, línea 8572

```text
**Pregunta 4.** La investigación mostró que en meliponicultura casi nunca se «trata» con un producto. Lo que se hace es manejo. Hoy el formulario de tratamiento pide una **vía** pensada para *Apis*: tira, goteo, espolvoreo, vaporización o cebo. Ninguna describe sellar una rendija o poner una barrera en el soporte.

¿Cómo se registra la intervención en una colonia de sin aguijón?
- **A) (Recomendado)** En un meliponario el registro se llama **«Intervención»** y sus vías son de manejo: barrera en el soporte, sellado, trampa, retiro o limpieza, y traslado. El producto queda opcional, para cuando lo haya, como la grasa en las patas o el vinagre de la trampa. Es lo que describen las guías y no obliga a inventar un producto.
- **B)** Se queda «Tratamiento» con las vías de *Apis*, y lo que no encaje va en «otro».
- **C)** «Intervención» con vías de manejo, y además separada en **prevención** (sellar, barrera, trampa) y **saneamiento** (retirar, quemar o congelar, trasladar).
```

**Respuesta** (Daniel, literal) · 2026-10-11 21:27Z · transcripción, línea 8576

```text
a
```


## 5 · crear ya la tabla de especies (E-1a)

*Especie y sistema · se aplica en ADR-200 §3*

**Pregunta** (Claude, literal) · 2026-10-11 21:27Z · transcripción, línea 8586

```text
**Pregunta 5 (E-1a).** ¿Se crea ya la tabla de especies?
- **A) (Recomendado)** Sí, ahora, con la identificación incierta como valor válido.
  - Cada fila puede ser tribu, género o especie, y «sin identificar» existe y no bloquea una inspección.
  - Columnas mínimas: rango, nombre científico tal como se identificó, nombre común, y quién o qué fuente lo identificó.
  - Sin medidas de caja ni alcance de vuelo hasta tener fuente.
  - Las colonias que ya existen quedan «sin especie».
  - No inventa nada, y añadir filas después no rompe nada.
- **B)** Esperar a que tengas los nombres de tus especies. Mientras tanto, las colonias siguen sin especie, como desde el 2026-09-16.
```

**Respuesta** (Daniel, literal) · 2026-10-11 21:28Z · transcripción, línea 8590

```text
a
```


## 6 · con qué filas nace la tabla de especies

*Especie y sistema · se aplica en ADR-200 §3*

**Pregunta** (Claude, literal) · 2026-10-11 21:28Z · transcripción, línea 8611

```text
**Pregunta 6 (E-1a-2).** ¿Con qué filas nace la tabla?

Lo que hay hoy:
- **Dos listas de documentos generados por un modelo:** el paquete de especies (tres) y la semilla (cuatro). Ninguna lleva fuente, y las dos ya están descalificadas como referencia.
- **Un nombre equivocado en el paquete:** «*Melipona panamensis*». La investigación de hoy comprobó en el catálogo Moure que no existe y que la panameña es ***Melipona panamica*** Cockerell.
- **Tu tabla de 10 filas, la que pegaste en septiembre,** sí escribe *M. panamica*, así que la tuya acierta. Pero su columna de fuentes no la ha verificado nadie, y no son diez especies: hay géneros y una «*Partamona* sp.».
- **«Angelita»:** el mismo catálogo registra para Colón y Panamá *Tetragonisca buchwaldi*, no *angustula*, y ninguna fuente las separa con datos panameños.

Las opciones:
- **A) (Recomendado)** Mínima: «*Apis mellifera*» y «sin identificar». Las de sin aguijón se añaden cuando me digas cuáles tienes. No mete en los datos ningún nombre sin confirmar.
- **B)** Las de tu tabla, marcadas «sin confirmar», y tú señalas cuáles son las tuyas.
- **C)** Vacía hasta que me las dictes.
```

**Respuesta** (Daniel, literal) · 2026-10-11 21:37Z · transcripción, línea 8617

```text
a
```


## 7 · sistemas de colmena que se usan (E-1b)

*Especie y sistema · se aplica en ADR-200 §4*

**Pregunta** (Claude, literal) · 2026-10-11 21:37Z · transcripción, línea 8635

```text
**Pregunta 7 (E-1b).** Hoy la caja sólo sabe ser Langstroth: guarda cámaras, alzas, cuadros y excluidor. Ya decidiste que el sistema de colmena irá en lista cerrada con «otro». Faltan los valores, que sólo sabes tú. Los candidatos que aparecen en el repositorio, ninguno confirmado por ti, son:

- **a)** Langstroth con marcos (*Apis*). Es el de hoy.
- **b)** INPA, la caja modular para meliponas del Brasil. Sale de ADR-145 y de los documentos descalificados.
- **c)** FO-INTA, la caja del INTA de Argentina. Sale de la ficha ANSA.
- **d)** Rústico o tronco, el nido en tronco o caja sin módulos. Sale de la revisión de Codex del 2026-10-07.
- **e)** Otro que uses y no esté aquí; dime cuál.

**¿Cuáles usas o vas a usar?** Responde con las letras, por ejemplo «a, b, e: …».

- **Recomendado:** marcar sólo los que de verdad usas. Los que no marques no entran: se pueden añadir después sin romper nada.
- **Si no lo tienes claro:** «a» más «otro (di cuál)» para sin aguijón es la salida segura.
```

**Respuesta** (Daniel, literal) · 2026-10-11 21:38Z · transcripción, línea 8639

```text
a, e: hay que investigar
```


## 8 · cómo se anota «africanizada» (E-1d)

*Especie y sistema · se aplica en ADR-200 §3*

**Pregunta** (Claude, literal) · 2026-10-11 21:38Z · transcripción, línea 8654

```text
**Pregunta 8 (E-1d).** «Africanizada» hoy sólo aparece en comentarios del código y en el Anexo B. Tú la usas como categoría al decidir dónde colocar las cajas. No describe una especie: describe la ascendencia de una población de *Apis mellifera*. ¿Cómo se anota?
- **A) (Recomendado)** Como una etiqueta aparte y opcional. La especie es *Apis mellifera*, y «africanizada» es una marca que declara quien registra. Así no se mezcla el linaje con la taxonomía, que es tu regla Q30 de separar el taxón del estado de manejo.
- **B)** Como una fila más de la tabla de especies: «*Apis mellifera* africanizada».
- **C)** No se anota; si hace falta, va en notas.
```

**Respuesta** (Daniel, literal) · 2026-10-12 01:21Z · transcripción, línea 8658

```text
a
```


## 9 · otra especie en un meliponario que ya tiene una (E-1c)

*Especie y sistema · se aplica en ADR-200 §2*

**Pregunta** (Claude, literal) · 2026-10-12 01:21Z · transcripción, línea 8664

```text
**Pregunta 9 (E-1c).** Cuando la colonia ya tenga especie: si alguien instala o traslada una colonia de **otra especie** a un meliponario que ya tiene una, ¿qué hace el sistema?

Lo que ya dijiste: quieres un meliponario por especie en el Lote 3, con distancia segura entre ellos, y las demás juntas detrás del beneficio. Las dos cosas son compatibles. La regla de separar las especies ladronas viene de la ficha ANSA, de Argentina.

- **A) (Recomendado)** Avisa y deja pasar: «Este meliponario ya tiene otra especie». No frena el trabajo de campo por una regla que aún no has fijado, y se puede endurecer después sin tocar los datos.
- **B)** Rechaza: una especie por meliponario. Casa con el Lote 3, pero impide juntar «las demás» detrás del beneficio.
- **C)** Rechaza sólo las especies que marques como ladronas. Exige un dato más en la tabla de especies, y hoy su única fuente es ANSA.
```

**Respuesta** (Daniel, literal) · 2026-10-12 14:07Z · transcripción, línea 8786

```text
a
```


## 10 · en qué vienen las meliponas de Parita

*Especie y sistema · se aplica en ADR-200 §4 y §8*

**Pregunta** (Claude, literal) · 2026-10-12 14:07Z · transcripción, línea 8800

```text
**Pregunta 10.** Las colonias de meliponas que trajiste de Parita, de donde Chayanne, ¿en qué vienen hoy?
- **a)** En caja de **módulos apilados**: fondo o nido, sobrenido, melario y tapa. Es la familia INPA, Embrapa o FO-INTA.
- **b)** En caja de **gavetas** o cajones apilados más bajos, como la AF o la PNN.
- **c)** En caja **alargada** de una pieza, con o sin tabique entre la cría y los potes.
- **d)** En **tronco**.
- **e)** En botella u otro recipiente.
- **f)** No lo sé todavía, o una mezcla. Dime cuáles.

Si son de módulos, dime también, si lo sabes, cuántas piezas tienen y cómo las llaman tú y Chayanne. Con eso fijo la lista y las partes que pide la ficha.
```

**Respuesta** (Daniel, literal) · 2026-10-12 14:13Z · transcripción, línea 8862

```text
f, hay que investigar
```

**Respuesta** (Daniel, literal) · 2026-10-12 16:44Z · transcripción, línea 9001

```text
no tengo meliponas todavia
```

**Respuesta** (Daniel, literal) · 2026-10-12 16:44Z · transcripción, línea 9020

```text
puse trampas solamente
```


## 11 · la familia vertical de módulos

*Especie y sistema · se aplica en ADR-200 §4*

**Pregunta** (Claude, literal) · 2026-10-12 14:14Z · transcripción, línea 8877

```text
**Pregunta 11.** INPA, Portugal-Araújo/Embrapa y FO-INTA son la misma familia: cajas verticales de módulos con **las mismas partes** (fondo o nido, sobrenido, melario y tapa). Sólo cambian el autor y las medidas. ¿Cómo entran en la lista de sistemas?
- **A) (Recomendado)** Un solo valor, **«Vertical de módulos»**, y el modelo concreto (INPA, Embrapa, FO-INTA o «hecha a medida») en un campo aparte y opcional. La ficha pide las mismas partes en los tres. Además, ninguna fuente aclara si «INPA», «FO-INTA» e «INPA-Misiones» son la misma caja, y así no hay que decidirlo para registrar.
- **B)** Un valor por modelo: INPA, Portugal-Araújo/Embrapa y FO-INTA por separado. Más trazable, pero obliga a saber el modelo para registrar la caja.
```

**Respuesta** (Daniel, literal) · 2026-10-12 16:07Z · transcripción, línea 8913

```text
a
```


## 12 · el nido trampa

*Especie y sistema · se aplica en ADR-200 §4*

**Pregunta** (Claude, literal) · 2026-10-12 16:07Z · transcripción, línea 8917

```text
**Pregunta 12.** El **nido trampa**, una botella u otro recipiente que se cuelga para que un enjambre lo ocupe, está bien descrito por INTA y SEMARNAT. Pero no es una caja donde vive una colonia manejada: es la forma de conseguirla. ¿Cómo se registra?
- **A) (Recomendado)** No entra en la lista de sistemas. La colonia lleva origen **«capturada»**, que ya existe en la aplicación, y si se quiere, la trampa se nombra en la nota. Al pasarla a su caja definitiva, la caja es la que cuenta.
- **B)** Entra como un sistema más, «Nido trampa», para poder registrar colonias que todavía viven en la trampa.
```

**Respuesta** (Daniel, literal) · 2026-10-12 16:07Z · transcripción, línea 8927

```text
b
```


## 13 · medidas de la caja

*Especie y sistema · se aplica en ADR-200 §8 (aparcada)*

**Pregunta** (Claude, literal) · 2026-10-12 16:07Z · transcripción, línea 8931

```text
**Pregunta 13.** Ninguna fuente da medidas de caja para especies panameñas. Las que hay son de Brasil y Argentina y cambian con la especie y el autor; a veces ni dicen si son internas o externas. ¿Guarda la ficha de la caja sus medidas?
- **A) (Recomendado)** Sí, **opcionales y medidas por ti**: largo, ancho y alto **interiores** de la cámara de cría, en cm. La aplicación nunca las rellena según el modelo. Sirven para saber, con el tiempo, qué tamaño le va a cada especie tuya.
- **B)** No. Sólo el sistema y el modelo.
- **C)** Sí, pero sólo el volumen interior total, en litros.
```

**Respuesta:** ninguna. Quedó aparcada al saberse que no hay meliponas todavía (ver la 10).


## 14 · registrar ya las trampas

*Especie y sistema · se aplica en ADR-200 §4*

**Pregunta** (Claude, literal) · 2026-10-12 16:45Z · transcripción, línea 9043

```text
**Pregunta 14:** ¿las registro en la aplicación?
- **A) (Recomendado)** Sí. Cada trampa es una «caja» de sistema **nido trampa** en su sitio, con la fecha en que la pusiste. Cada vez que la miras es una revisión (ocupada o no). Cuando un enjambre la ocupe, nace la colonia con origen «capturada», y queda trazado de qué trampa y de qué fecha salió.
- **B)** No. Sólo se registra cuando una trampa capture un enjambre: entonces nace la colonia con origen «capturada».
- **C)** Aparcar todo lo de meliponas hasta que tengas colonias, y seguir con los otros temas, que afectan a tus *Apis* de hoy: alimentación y costos, polinización, recomendaciones y las hipótesis de la visita.
```

**Respuesta** (Daniel, literal) · 2026-10-12 16:48Z · transcripción, línea 9047

```text
a
```


## 15 · qué se anota al revisar una trampa

*Especie y sistema · se aplica en ADR-200 §4*

**Pregunta** (Claude, literal) · 2026-10-12 16:48Z · transcripción, línea 9057

```text
**Pregunta 15.** Cuando revisas una trampa, ¿qué anotas?
- **A) (Recomendado)** La fecha y el estado, en tres valores (**vacía**, **exploradoras entrando** u **ocupada**), más una nota y una foto opcionales. Las exploradoras que entran y salen son la señal previa a la ocupación que describen las guías de captura, y separarla de «ocupada» evita dar por capturado un enjambre que no llegó.
- **B)** Sólo ocupada sí o no, y la fecha.
- **C)** Lo de A, y además cuántas abejas ves en la entrada y a qué hora.
```

**Respuesta** (Daniel, literal) · 2026-10-12 16:49Z · transcripción, línea 9061

```text
a, tienes skill de apicultura activa, la usas?
```


## 16 · la especie como identificaciones fechadas

*Especie y sistema · se aplica en ADR-200 §3 y §4*

**Pregunta** (Claude, literal) · 2026-10-12 16:49Z · transcripción, línea 9090

```text
**Dos ajustes que pide la skill:**

1. **Revisión de trampa:** la skill exige que todo formulario de campo ofrezca **«no evaluado»**, porque un campo vacío no quiere decir nada. Así que el estado tendrá un cuarto valor, **«no se pudo revisar»** (no llegaste, o no la abriste). Es tu misma regla del Anexo C, «un dato que falta se nombra». Lo aplico así salvo que me digas lo contrario.

2. **La especie de una colonia, que es una pregunta.** La skill pide guardar la identidad **con su historia de identificación**, separada de la colonia: quién la identificó, con qué base (foto, ejemplar, nombre común), con qué confianza y cuándo. Y el nombre **tal como se escribió** por separado del **nombre aceptado hoy**. Es justo el caso de «*panamensis*» frente a «*panamica*» de hoy.

**Pregunta 16.** ¿Cómo se guarda la especie de una colonia?
- **A) (Recomendado)** Como **identificaciones fechadas**. Cada una lleva el taxón al rango que se pueda, el nombre tal como se escribió, la base (foto, ejemplar, nombre común o especialista), la confianza y quién la hizo. La vigente es la última. Una corrección no borra la anterior, y una trampa recién ocupada nace «sin identificar» hasta que alguien la identifique.
- **B)** Un solo campo de especie en la colonia, que se cambia si hace falta. Es más simple, pero se pierde de dónde salió cada nombre.
```

**Respuesta** (Daniel, literal) · 2026-10-12 16:50Z · transcripción, línea 9094

```text
a
```


## 17 · la libra (C-1a)

*Alimentación y costos · se aplica en ADR-200 §5*

**Pregunta** (Claude, literal) · 2026-10-12 16:51Z · transcripción, línea 9109

```text
**Pregunta 17 (C-1a).** El único registro real de alimentación que conocemos, el de Toabré, se anotó en **libras**, y la aplicación no sabe convertirlas. La libra tiene un factor exacto (0,45359237 kg), así que se puede sumar con los kilos sin inventar nada. ¿Entra en el desplegable de «Unidad»?
- **A) (Recomendado)** Sí. La lista queda L, kg, g, ml, **lb** y «Otro (cuál)». Se guarda lo que se tecleó, y libras y kilos se suman al leer.
- **B)** No, la lista queda como tu protocolo. Quien dé de comer en libras escribe «lb» en «Otro», o convierte a kilos al teclear.
```

**Respuesta** (Daniel, literal) · 2026-10-12 16:51Z · transcripción, línea 9113

```text
a
```


## 18 · qué mide «Cantidad» (C-1b)

*Alimentación y costos · se aplica en ADR-200 §5*

**Pregunta** (Claude, literal) · 2026-10-12 16:51Z · transcripción, línea 9123

```text
**Pregunta 18 (C-1b).** Hay una sola casilla de «Cantidad», y la lista de materiales mezcla **azúcar seco** (blanca, morena) con **jarabe ya hecho** (1:1, 2:1). Con «Jarabe 1:1» y «3 lb», el sistema no sabe si son 3 libras de azúcar o de jarabe. Las dos lecturas de Toabré, además, no coinciden: Codex leyó 3 lb de azúcar, y el guion que la cargó escribió «jarabe, 3 lb».

Cuando das de comer, por ejemplo con una bolsa de jarabe sobre los cabezales, ¿qué anotas como «Cantidad»?
- **A) (Recomendado)** **Lo que elegiste en «Material», tal como lo mediste.**
  - Si pesaste azúcar, eliges «Azúcar blanca» y anotas 3 lb.
  - Si mediste jarabe ya hecho, eliges «Jarabe 1:1» y anotas los litros.
  - El material dice qué mediste y la unidad dice si es peso o volumen. Es lo que ya implica tu protocolo, que trae jarabes hechos y litros.
  - El azúcar que lleva un jarabe sólo se calcula el día que digas si el 1:1 es en peso o en volumen.
- **B)** **Siempre el azúcar que disolviste,** aunque elijas jarabe. Se compara directo con el quintal comprado, pero quien mide jarabe ya hecho tiene que calcular el azúcar a mano, en el campo.
- **C)** **Las dos cosas en dos casillas opcionales,** azúcar disuelta y jarabe preparado. Es lo más fiel, pero añade una columna y un toque más con guantes.
```

**Respuesta** (Daniel, literal) · 2026-10-12 16:55Z · transcripción, línea 9133

```text
a
```


## 19 · el azúcar y el inventario (C-2)

*Alimentación y costos · se aplica en ADR-200 §5*

**Pregunta** (Claude, literal) · 2026-10-12 16:55Z · transcripción, línea 9161

```text
**Pregunta 19 (C-2).** Hoy alimentar no descuenta nada del inventario: sólo un tratamiento puede descontar de un frasco. Además hay tres trabas:
- **Permisos:** descontar exige permiso de inventario, que quien alimenta en el campo no tiene.
- **Alimentación en lote:** nunca admite elegir un saco.
- **Unidades:** el inventario no convierte, así que 3 lb no se restan de un saco anotado en quintales.

¿Quieres que el azúcar que das de comer baje del inventario del sitio?
- **A) (Recomendado)** **Sí, y que se calcule solo:** el saldo de azúcar del sitio es lo comprado menos lo dado de comer. No hay saco que elegir ni permiso que tener, sirve para el lote y no se puede olvidar.
  - **El costo:** el saldo sale de dos sitios, las compras del inventario y las alimentaciones, en vez de uno.
  - **Lo que pide:** dar de alta el azúcar como material, enlazado con «azúcar blanca» y «azúcar morena», y comprarlo en kg o lb, porque el quintal no tiene una definición oficial.
- **B)** **Sí, eligiendo el saco al alimentar,** como ya se hace con los tratamientos. Hay un solo libro de existencias, pero sólo quien tenga permiso de inventario descontaría, y en el lote no baja nada.
- **C)** **No.** La alimentación queda como registro de lo hecho, el consumo por sitio se consulta, y el saldo de azúcar se ajusta a mano.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:01Z · transcripción, línea 9167

```text
a
```


## 20 · el viático de un viaje a dos sitios (C-3)

*Alimentación y costos · se aplica en ADR-200 §5*

**Pregunta** (Claude, literal) · 2026-10-12 17:01Z · transcripción, línea 9174

```text
**Pregunta 20 (C-3).** El viático es una cifra por visita, y cada visita es de un solo sitio. Tu cifra de referencia es «unos $62 por viaje», y en Toabré un mismo viaje cubre la Finca 1 y la Finca 2. Si anotas $62 en cada visita, el viaje cuenta $124. Hoy no hace daño, porque nada suma esos viáticos todavía, pero el diseño lleva a ese error.

Cuando en un mismo viaje visitas dos sitios, ¿cómo se cuentan los $62?
- **A) (Recomendado)** **Una vez,** en una de las visitas, y la otra queda marcada «viático compartido con aquella», con un enlace explícito entre las dos. El viaje cuesta $62 y no se suma dos veces. El reparto entre sitios espera a que tú definas su regla, que en tu Q23 quedó para la fase 2.
- **B)** **Cada visita lleva su parte, a mano:** tú pones 31 y 31. No cambia nada del modelo, pero nada avisa si pones 62 en las dos.
- **C)** **El viaje es un registro propio** que agrupa las visitas y lleva el costo total. Es lo más limpio, pero obliga a decidir si el informe es por visita o por viaje.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:02Z · transcripción, línea 9178

```text
a
```


## 21 · el viático en el informe del cliente (C-3b)

*Alimentación y costos · se aplica en ADR-200 §5*

**Pregunta** (Claude, literal) · 2026-10-12 17:02Z · transcripción, línea 9188

```text
**Pregunta 21 (C-3b).** El ADR-142 dejó escrito que los viáticos no van al informe del cliente «salvo que el contrato lo pida». Pero ese interruptor no existe en ninguna parte, así que hoy ningún viático puede salir en ningún informe. ¿Cuándo salen en el informe del cliente?
- **A) (Recomendado)** **Cuando tú lo marques al emitir cada informe:** una casilla apagada por defecto, que queda congelada en ese informe y auditada. Es lo mínimo para cumplir tu «sólo si el contrato lo pide», sin inventar un módulo de contratos.
- **B)** **Cuando el compromiso del sitio lo diga:** se marca una vez para todos sus informes. Pero un sitio sin compromiso no tiene dónde marcarlo, y obliga a crear la idea de contrato.
- **C)** **Nunca en el enlace del cliente,** sólo en el informe interno, como la nota de campo de #706. Se cotizan aparte.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:02Z · transcripción, línea 9192

```text
a
```


## 22 · qué hueco de costos se diseña primero (C-4)

*Alimentación y costos · se aplica en ADR-200 §5*

**Pregunta** (Claude, literal) · 2026-10-12 17:02Z · transcripción, línea 9202

```text
**Pregunta 22 (C-4).** Quedan tres huecos de costos sin diseñar. Ya decidiste el alcance (Q23 y Q25) y que lo financiero lleve un permiso aparte; falta el orden. ¿Cuál diseñamos primero?
- **A) (Recomendado)** **El costo de sostener un sitio.**
  - Junta lo que ya se registra (el viático por viaje, el azúcar dado, el gasto de la visita y su duración) con precios que se ponen después.
  - Contesta «¿cuánto me cuesta Toabré?» y «¿cuánto por colonia?».
  - Reusa el inventario añadiendo el precio de compra, sin modelos nuevos.
- **B)** **Presupuestos y propuestas,** con cuatro estados: propuesto, aprobado, gastado y facturado. Es un modelo nuevo con su propio ADR, y antes hace falta saber si una recomendación aprobada se vuelve tarea.
- **C)** **Inventario de cajas y material fuera de un apiario:** un almacén para cajas y alzas sin colonia. Toca la regla de que toda caja está en un sitio de abejas.
- **D)** **Ninguna por ahora;** se vuelve a ver después de la temporada.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:02Z · transcripción, línea 9206

```text
a
```


## 23 · qué es el 4–6 colmenas/ha en Kiva (P-2)

*Polinización · se aplica en ADR-200 §6*

**Pregunta** (Claude, literal) · 2026-10-12 17:03Z · transcripción, línea 9221

```text
**Pregunta 23 (P-2).** El código y los anexos tratan ese 4–6 como **pactado**. La base dice «lo que se pactó polinizar», la pantalla «17 ha comprometidas» y el prototipo «Kiva está contratado», pero ningún documento primario lo respalda. Además, las 17 ha son el área de los dos lotes, no necesariamente hectáreas comprometidas. Y un matiz: en el repositorio Kiva Estate figura como finca tuya, mientras los documentos del Drive la tratan como un cliente con administración propia.

¿Qué es hoy el 4–6 colmenas/ha en Kiva?
- **A) (Recomendado si no hubo acuerdo)** **La meta de trabajo que propuso Néctar,** sin compromiso. La ficha dirá «meta de trabajo propuesta (informe del 2026-06-29), no pactada; referencia por analogía, no validada en Robusta», las hectáreas serán «área de los lotes», y «faltan N» no será un incumplimiento.
- **B)** **Un acuerdo con Kiva sin documento,** de palabra o por mensaje. Se guarda como declarado por ti, con la fecha y con quién se acordó, y la ficha dice «acordado» sin llamarlo contrato.
- **C)** **Una cláusula escrita** en un contrato o anexo. Se exige la referencia del contrato para rotular «pactado», y sólo entonces «faltan N» significa incumplimiento.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:04Z · transcripción, línea 9231

```text
a
```


## 24 · la alerta de floración sin número pactado

*Polinización · se aplica en ADR-200 §6*

**Pregunta** (Claude, literal) · 2026-10-12 17:04Z · transcripción, línea 9235

```text
**Pregunta 24.** La alerta «se acerca la floración y faltan colmenas» todavía no corre: no hay puerta para crear el compromiso. Cuando corra y el compromiso no traiga un número de colmenas pactado, como pasa en Kiva, ¿avisa?
- **A) (Recomendado)** **Sí, con la meta de trabajo rotulada como tal:** «meta de trabajo, no pactada». Sale como aviso, nunca como crítico, y el texto no habla de incumplimiento. Llegar sin colmenas a la floración no se arregla después, y tu regla P-2 pide no presentarla como contrato, no callarla.
- **B)** **Sólo si el compromiso trae un número de colmenas pactado.** Sin él, la ficha enseña el déficit como referencia, sin alerta.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:11Z · transcripción, línea 9239

```text
a
```


## 25 · dónde entra la alerta de floración en el tablero

*Polinización · se aplica en ADR-200 §6*

**Pregunta** (Claude, literal) · 2026-10-12 17:11Z · transcripción, línea 9250

```text
**Pregunta 25.** El orden de las alertas del tablero de sitios lo fijaste tú el 2026-09-14, y el código dice que «se cambia con el dueño delante». La alerta de floración sería la décima. ¿Dónde entra?
- **A) (Recomendado)** **Como aviso, al final de la lista,** igual que entró la de «las cajas no cuadran» (ADR-151). No mueve ninguno de los nueve motivos de hoy. Es coherente con tu respuesta 23: una meta de trabajo no es un incumplimiento que deba gritar primero.
- **B)** **Como crítico, justo después de la aspersión anunciada.** La floración también es una fecha que viene de fuera y no se repara después, pero reordena lo que el tablero grita primero.
- **C)** **No entra al tablero.** Sólo se ve dentro de la ficha del sitio.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:15Z · transcripción, línea 9259

```text
a
```


## 26 · cuántos apiarios hay en Toabré (P-1)

*Polinización · se aplica en ADR-200 §6*

**Pregunta** (Claude, literal) · 2026-10-12 17:15Z · transcripción, línea 9272

```text
**Pregunta 26 (P-1).** El compromiso de polinización cuelga de **un** sitio, y la densidad sólo cuenta las colonias de ese sitio. Hay indicios de que Lote 1 es la Finca 1 y Lote 2 la Finca 2: dos informes dan 2 colmenas en uno y 1 en el otro, y las fotos del 29 de junio rotulan así las áreas. Pero nadie lo escribió. Además, en producción hay un solo «Apiario NN-04-TOABRE-KIVAEST», mientras un guion crea dos («Finca 1» y «Finca 2»). Y tú dijiste el 2026-10-06 que dentro de cada finca puede haber más de un lote.

En Toabré, ¿cuántos apiarios hay hoy y qué lote sirve cada uno?
- **A)** **Dos apiarios, cada uno con su lote:** Finca 1 con el Lote 1 (10 ha) y Finca 2 con el Lote 2 (7 ha). Serían dos compromisos y no cambia el modelo. Es lo que sugieren los conteos de los dos informes.
- **B)** **Un solo apiario que sirve los dos lotes:** un compromiso con 17 ha. Tampoco cambia el modelo.
- **C)** **Colonias de varios apiarios sirven juntas un mismo lote.** El modelo actual no lo admite y habría que cambiarlo.
- **D)** **Otra cosa;** dime cómo es.

Aquí no marco recomendada: es un hecho que sólo sabes tú, y A es sólo lo que sugieren los documentos.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:16Z · transcripción, línea 9276

```text
a
```


## 27 · qué pasa con una recomendación después del informe (R-3)

*Recomendaciones · se aplica en ADR-200 §7*

**Pregunta** (Claude, literal) · 2026-10-12 17:17Z · transcripción, línea 9297

```text
**Pregunta 27 (R-3).** Hoy la recomendación de una visita es un texto largo al cerrarla. Sale en el informe, pero no tiene colonia, responsable, fecha, estado ni evidencia, y la visita siguiente no la ve. Cuando el técnico escribe una recomendación, ¿qué pasa con ella después del informe?
- **A)** **Se queda como texto del informe,** como hoy y como tu protocolo. El seguimiento lo hace quien lee el informe anterior, con la próxima visita y sus propósitos de V-9. No se construye nada, pero se aparta de tu Q27.
- **B) (Recomendado)** **Una línea de seguimiento propia, ligada a la visita.** Cada recomendación es una fila con su sitio o colonia, el texto, el estado con tu vocabulario de Q46, una fecha o condición opcional y quién responde, que puede ser alguien del cliente sin cuenta. No toca las tareas, así que no reabre ADR-107, y es la base sobre la que un motor de trabajo podría construirse el día que exista.
- **C)** **Una Tarea:** cada recomendación aceptada crea una tarea de la plataforma. Hoy nadie las usa, y no guardan persona ni evidencia; probablemente haría falta reabrir ADR-107.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:25Z · transcripción, línea 9303

```text
b
```


## 28 · quién anota la decisión del cliente

*Recomendaciones · se aplica en ADR-200 §7*

**Pregunta** (Claude, literal) · 2026-10-12 17:25Z · transcripción, línea 9310

```text
**Pregunta 28.** Tu Anexo C define la recomendación como «lo que el cliente tiene que decidir». Cuando el cliente decide qué hace con una, ¿quién lo deja anotado?
- **A) (Recomendado)** **El técnico, después de hablar con él,** al cerrar o en la visita siguiente. El enlace del cliente sigue siendo de sólo lectura y revocable, que es como se diseñó.
- **B)** **El cliente, desde su enlace.** Abre una escritura pública por enlace, que hoy no existe, con su revocación, su auditoría y su riesgo. Cuando se diseñó el enlace se dijo que dar más al cliente era un trabajo aparte.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:28Z · transcripción, línea 9314

```text
a
```


## 29 · cuándo una recomendación está cumplida

*Recomendaciones · se aplica en ADR-200 §7*

**Pregunta** (Claude, literal) · 2026-10-12 17:28Z · transcripción, línea 9324

```text
**Pregunta 29.** ¿Qué hace falta para dar una recomendación por cumplida? Tu Q46 distingue «implementado» de «verificado», pero no dice qué cuenta como respaldo en un apiario.
- **A) (Recomendado)** **Dos pasos.**
  - **«Hecha»:** se dijo o se vio, con una nota.
  - **«Verificada»:** exige un registro de una visita posterior, sea inspección, manejo o foto.
  - **Cerrar sin cumplir:** también se puede, con «ya no aplica», «reemplazada» o «sin resolver».
  - **Por qué:** así ninguna recomendación figura como resuelta sólo porque nadie volvió a mencionarla. Que «verificada» pida un registro posterior es mi propuesta concreta de tu Q46.
- **B)** **Un paso:** «cumplida» con una nota libre, sin exigir respaldo. Se aparta de la distinción de tu Q46.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:28Z · transcripción, línea 9328

```text
a
```


## 30 · qué se muestra al abrir la visita siguiente

*Recomendaciones · se aplica en ADR-200 §7*

**Pregunta** (Claude, literal) · 2026-10-12 17:28Z · transcripción, línea 9338

```text
**Pregunta 30.** Al abrir una visita nueva en un sitio, ¿qué se muestra de lo que quedó abierto en la anterior?
- **A) (Recomendado)** **Se muestran las recomendaciones abiertas, sin exigir nada.** Se atienden o no, y completar la visita no depende de ellas. Coincide con tu Q27, que pide no exigir campos sólo porque existan, y con tu Anexo E §7, que dice no pedir en el patio lo que puede esperar a la casa.
- **B)** **Exigir que cada una se marque** (atendida, sigue abierta o ya no aplica) para poder completar la visita. Obliga a marcar con guantes y al sol, o a mentir para poder cerrar.
- **C)** **No mostrar nada,** como hoy: la recomendación vive en el informe y en el historial.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:28Z · transcripción, línea 9342

```text
a
```


## 31 · un registro tardío (V-H1)

*Hipótesis de la visita · se aplica en ADR-200 §1*

**Pregunta** (Claude, literal) · 2026-10-12 17:29Z · transcripción, línea 9361

```text
**Pregunta 31 (V-H1).** Un registro que anotas **sin señal** durante una visita llega al servidor cuando la visita ya tiene la salida marcada. Hoy queda suelto: falta en el pendiente y en el informe, y con tu respuesta de V-9 el pendiente lo ve el cliente. Peor aún, si ya hay otra visita abierta tuya en el mismo sitio, se pega a esa, aunque su hora sea anterior.

¿Hasta qué punto de la vida de una visita se le une un registro por la hora en que se anotó?
- **A)** **Mientras siga en borrador.** Lo que llegue después de completarla queda suelto, como hoy, pero avisado.
- **B) (Recomendado)** **Hasta que se emita el informe o venzan las 48 h de corrección,** aunque ya esté completada.
  - **Por qué:** cubre el caso normal, salir del sitio y cerrar la visita esa noche desde el mismo teléfono. Y no toca ningún informe ya entregado.
  - **El costo:** es la única excepción a «una jornada con salida no recibe registros».
  - **El límite:** lo que llegue más tarde queda suelto y avisado.
- **C)** **Siempre que la hora caiga dentro de la visita,** también con el informe ya emitido. El informe entregado no cambia, porque es una copia congelada, y el registro se marca «llegó después del informe».
- **D)** **El arreglo mínimo:** sólo evitar que se pegue a la visita equivocada. Lo tardío sigue suelto.

En las cuatro, un registro con hora anterior al inicio de una visita deja de pegarse a ella.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:35Z · transcripción, línea 9365

```text
b
```


## 32 · cerrar con registros sin enviar

*Hipótesis de la visita · se aplica en ADR-200 §1*

**Pregunta** (Claude, literal) · 2026-10-12 17:35Z · transcripción, línea 9375

```text
**Pregunta 32.** La pantalla donde cierras y completas la visita no sabe si el teléfono todavía tiene registros del apiario sin enviar: esa cola sólo se vacía sola dentro de la sección de apiarios. Al cerrar una visita con registros pendientes en el aparato, ¿qué hace la pantalla?
- **A) (Recomendado)** **Avisa cuántos hay, ofrece enviarlos ahora y deja cerrar.** Es tu postura de ADR-115, «avisa y registra igual», y no atrapa a nadie si un registro quedó en error. No ve los de otros aparatos.
- **B)** **No deja cerrar hasta que se envíen.** Un registro que el servidor rechazó bloquearía el cierre hasta descartarlo a mano.
- **C)** **Nada,** como hoy.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:51Z · transcripción, línea 9381

```text
a
```


## 33 · visita vencida con otra ya hecha (V-H3)

*Hipótesis de la visita · se aplica en ADR-200 §1*

**Pregunta** (Claude, literal) · 2026-10-12 17:52Z · transcripción, línea 9386

```text
**Pregunta 33 (V-H3).** La última visita completada de un sitio decía «volver antes del día X», y X venció hace más de 14 días. Ya fuiste, pero esa visita nueva todavía no está completada. Hoy el tablero sigue en **crítico** («La visita programada venció hace más de 14 días»), como si nadie hubiera ido, y a las 24 h añade «visita sin cerrar».

¿Qué debe mostrar?
- **A) (Recomendado)** **Baja a aviso en cuanto la visita nueva tiene la salida marcada:** «hay una visita hecha sin completar». Abrir una visita no prueba que fuiste; marcar la salida es un acto explícito. El propio código advierte que subir a crítico una señal ambigua enseña a ignorar lo crítico. De paso, ese aviso sale desde la salida y no a las 24 h, y dice «sin completar», no «sin cerrar».
- **B)** **Sigue en crítico** hasta completar, con una nota en la tarjeta: «hay una visita sin completar desde tal fecha».
- **C)** **Baja a aviso con cualquier visita nueva abierta,** aunque no tenga salida. Es más simple, pero una visita abierta de antemano a la que nunca fuiste apagaría el rojo.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:52Z · transcripción, línea 9390

```text
a
```


## 34 · la próxima visita al completar

*Hipótesis de la visita · se aplica en ADR-200 §1*

**Pregunta** (Claude, literal) · 2026-10-12 17:52Z · transcripción, línea 9402

```text
**Pregunta 34.** Tu protocolo marca «Próxima visita» como **obligatoria** al cerrar, pero el formulario la llama «Cuándo toca volver **(opcional)**». Cuando falta, el sitio desaparece del aviso de visita vencida, y el tablero lo pinta con un «—», igual que un sitio que nunca se visitó.

Al completar una visita, ¿te obliga el formulario a poner cuándo toca volver?
- **A) (Recomendado)** **Sí, pero con una salida explícita: «sin próxima visita prevista».** Ese valor no es un hueco, es un dato. El servicio no lo exige; lo exige el formulario, como ya pasa con «alcanza hasta» en la alimentación (ADR-118). Cumple tu protocolo sin atrapar a nadie.
- **B)** **No, sigue opcional** como hoy. El protocolo seguiría diciendo obligatoria sin que nada lo cumpla.
```

**Respuesta** (Daniel, literal) · 2026-10-12 17:52Z · transcripción, línea 9406

```text
a
```


## 35 · un sitio sin próxima fecha en el tablero

*Hipótesis de la visita · se aplica en ADR-200 §1*

**Pregunta** (Claude, literal) · 2026-10-12 17:52Z · transcripción, línea 9416

```text
**Pregunta 35.** Con tu respuesta 34, una próxima visita vacía sólo quedará en las visitas anteriores a este cambio. Cuando la última visita completada de un sitio no trae próxima fecha, ¿qué muestra el tablero?
- **A) (Recomendado)** **Lo dice en la tarjeta, sin alerta:** «sin próxima visita declarada», o «sin próxima visita prevista» si fue explícito, en vez de «—». Es tu regla de que la ausencia se ve, y no inventa un plazo sin calendario de temporada.
- **B)** **Avisa por antigüedad:** si la última visita pasa de N días, el tablero alerta. El N lo pones tú; el Anexo C proponía 45 días «en temporada».
- **C)** **Nada,** como hoy.
```

**Respuesta** (Daniel, literal) · 2026-10-12 18:04Z · transcripción, línea 9422

```text
a
```


## 36 · el número de una caja que salió (V-H4)

*Hipótesis de la visita · se aplica en ADR-200 §4*

**Pregunta** (Claude, literal) · 2026-10-12 18:04Z · transcripción, línea 9430

```text
**Pregunta 36 (V-H4), la última de este tema.** La caja H-07 sale del apiario A, por ejemplo a polinizar. Como A deja libre ese número, se puede dar de alta **otra** H-07 en A. Cuando la primera quiera volver, el traslado se rechaza, y la aplicación no sabe renombrar ninguna de las dos. Además, tu Anexo E dice que el retiro de un emplazamiento dispara el traslado de vuelta, así que el regreso es un caso normal.

¿Qué pasa con el número de una caja que salió?
- **A) (Recomendado)** **Queda reservado mientras la caja exista.** Al dar de alta en A, el número de una caja que salió de A se rechaza, diciendo cuál es y dónde está. **Condición:** hay que construir a la vez **«retirar caja»**, porque hoy no se puede retirar ninguna, y sin eso los números quedarían presos para siempre. Evita repintar cajas.
- **B)** **Reservado sólo si salió a polinizar.** El motivo del traslado no predice si volverá, y tiene el mismo hueco: una que no vuelve deja el número preso.
- **C)** **Sigue libre, y se construye «renombrar caja»** con auditoría, ofrecido también cuando se rechaza el traslado. Dos cajas distintas llevarían el mismo número en momentos distintos, y la caja física hay que repintarla.
```

**Respuesta** (Daniel, literal) · 2026-10-12 18:08Z · transcripción, línea 9440

```text
a
```


## cierre · dónde se deja escrito

*Cierre · se aplica en este archivo y ADR-200*

**Pregunta** (Claude, literal) · 2026-10-12 18:09Z · transcripción, línea 9458

```text
**¿Cómo lo dejo escrito?**
- **A) (Recomendado)** **Un PR de documentación** con:
  - el **ADR-199**, «Decisiones del módulo Apiario tras la revisión del 2026-10-08», ordenado por tema y con cada respuesta tuya y su fecha;
  - **dos documentos de referencia** en `docs/dominio/`: las amenazas de las meliponas y los sistemas de caja, con sus fuentes verificadas y lo que no se pudo verificar.

  No toco `SESSION_STATE.md`, que es del turno, y la fusión es de quien lo lleve.
- **B)** Un ADR por tema, en vez de uno solo.
- **C)** Sólo un documento de notas, sin ADR.
```

**Respuesta** (Daniel, literal) · 2026-10-12 20:18Z · transcripción, línea 9467

```text
a
```

