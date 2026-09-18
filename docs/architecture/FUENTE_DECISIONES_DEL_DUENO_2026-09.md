<!--
FUENTE. Este archivo es un REGISTRO, no una decisión de arquitectura.

Procedencia: las palabras de Daniel Giraldez en la conversación de trabajo del
2026-09-16 y el 2026-09-17, extraídas de la transcripción de la sesión por
programa —no reescritas de memoria—. Cada entrada lleva la línea exacta de la
transcripción de la que sale.

Por qué existe: hasta el 2026-09-17 estas decisiones vivían SOLO en esa
transcripción. Los ADR las citaban resumidas, pero el texto del dueño no estaba en
ningún archivo del repositorio. Una transcripción no se versiona y no la lee la
siguiente sesión: si se pierde, lo que queda es la paráfrasis de quien construyó,
que es exactamente lo que no debe sustituir a la palabra de quien decidió.

Seis de las trece llegaron como mensajes enviados MIENTRAS se trabajaba, que la
herramienta entrega incrustados en la salida de otra orden y no como mensaje
aparte. La primera búsqueda sólo miró los mensajes aparte y encontró siete: no
faltaban, estaban en otro sitio.

No editar el texto de ninguna decisión. Una corrección va como nota del dueño,
fechada, al final — que es la regla que él mismo fijó en ADR-147.
-->

# Decisiones del dueño — septiembre de 2026, en sus palabras

Trece decisiones, en orden. El texto de cada una es **literal**, errores de tecleo
incluidos: corregirlos sería empezar a parafrasear. Al lado, **qué produjo** — o en
qué está bloqueada, cuando no produjo nada todavía.

## especies de Panamá — la tabla

*2026-09-16 · transcripción, línea 37806*

```text
[9/12/26, 6:27:08 PM] Danielsan: |Especie                                |Dónde                                  |Fuente                          |
|---------------------------------------|---------------------------------------|--------------------------------|
|Tetragonisca angustula               |Gandona, Colón (potrero y cultivo); BCI|Rev. Centros UP 2023; Roubik    |
|Scaptotrigona pectoralis             |Gandona, Colón                         |Rev. Centros UP 2023            |
|Nannotrigona perilampoides           |Gandona, Colón                         |Rev. Centros UP 2023            |
|Trigona ferricauda                   |Gandona, Colón                         |Rev. Centros UP 2023            |
|Plebeia argyrea                      |Gandona, Colón                         |Rev. Centros UP 2023            |
|Melipona panamica                    |Isla Barro Colorado                    |Roubik & Moreno Patiño 2018     |
|Trigona corvina                      |Panamá (estudio de nido)               |Roubik & Moreno 2009            |
|Tetragonisca buchwaldi               |Dos provincias de Panamá               |Zootaxa (registro 1983 + nuevos)|
|Partamona sp. endémica               |Panamá oriental                        |Pedro & Camargo 1997            |
|Cephalotrigona, Scaura, Tetragona|BCI, Canal                             |Roubik & Moreno Patiño 2018     |
[9/12/26, 6:28:08 PM] Danielsan: Es un cafetal a de robusta a 300-500 msnm
```

**Qué produjo:** PENDIENTE — el catálogo de especies espera los cinco nombres (ADR-145 lo deja nombrado).

## cinco especies, dos de cada una

*2026-09-16 · transcripción, línea 37882*

```text
tenemos cinco especies de aca de panama, no recuerdo en este momento, debemos poner minimo 2 de cada una para comenzar y ver que tal les va, esa seria phase 1, y en cafetal robusta no tengo, vienen de parita donde chayanne, y se instalan en cerro azul por ahora, en un futuro le planteo a luis sotillo de kiva estate toabre, le propongo poner tambien alla en su cafetal durante floracion solamente como polinizacion dirigida.
```

**Qué produjo:** PENDIENTE — mismo bloqueo. Diez colonias, origen Parita.

## sitios por lote y bajo el beneficio

*2026-09-16 · transcripción, línea 37896*

```text
pueden haber apiarios por lote de finca rosina y tambien bajo beneficio las nubes, serian distintos sitios o apiarios para manejo y registros con distintas cantidades de colmenas y o especies y vinculos a bloques, micro parcelas y o parcelas.
```

**Qué produjo:** ADR-145 — un meliponario puede colgar de un lote (`parentLocationId`).

## meliponarios aparte de apiarios

*2026-09-16 · transcripción, línea 37915 · enviado mientras se trabajaba*

```text
diria tener meliponiarios y tener apiarios separado aunque el apicultor tiene acceso a ambas si se configura asi
```

**Qué produjo:** ADR-145 — `meliponary` como tipo de sitio hermano de `apiary_site`.

## colocación de los meliponarios

*2026-09-16 · transcripción, línea 38175 · enviado mientras se trabajaba*

```text
@"/Users/danielsan/Downloads/nectar_nomada_meliponini_pack.md" @"/Users/danielsan/Downloads/seeder.js" @"/Users/danielsan/Documents/Codex/"
y yo pondria meliponario de cada especie aparte por colmena en un finca rosina lote 3 con una distancia entre cada una segura. y las demas en el beneficio detras mirando hacia finca rosina lote 5 cerca los 200 caturra. Biochar no tiene nada que ver con los apiarios, solamente para agro de tratamiento suelo y en este caso para cafe, lo ponemos bajo el cafeto cuando se siembra, o no se pone, se deberia siempre poner pero esto es lo opcional y que estamos documentando, de cual noria salio ese batch de biochar y a cuales plantas dentro de cuales bloques y o micro parcelas o parcelas.
```

**Qué produjo:** PARCIAL — la jerarquía ya lo admite; «distancia segura» y «mirando hacia el Lote 5» no tienen dónde guardarse.

## biochar no es del apiario

*2026-09-16 · transcripción, línea 38175 · enviado mientras se trabajaba*

```text
@"/Users/danielsan/Downloads/nectar_nomada_meliponini_pack.md" @"/Users/danielsan/Downloads/seeder.js" @"/Users/danielsan/Documents/Codex/"
y yo pondria meliponario de cada especie aparte por colmena en un finca rosina lote 3 con una distancia entre cada una segura. y las demas en el beneficio detras mirando hacia finca rosina lote 5 cerca los 200 caturra. Biochar no tiene nada que ver con los apiarios, solamente para agro de tratamiento suelo y en este caso para cafe, lo ponemos bajo el cafeto cuando se siembra, o no se pone, se deberia siempre poner pero esto es lo opcional y que estamos documentando, de cual noria salio ese batch de biochar y a cuales plantas dentro de cuales bloques y o micro parcelas o parcelas.
```

**Qué produjo:** Registrado. Nada construido.

## biochar: qué se registra

*2026-09-16 · transcripción, línea 38399 · enviado mientras se trabajaba*

```text
si deberiamos para biochar batch poder indicar que cantidad de cada ingrediente, gallinaza, materia foliar hojas trituradas, y pues ya fermentadas se agrega el carbon. aunque ya hay una receta y esta establecida, es bueno que se pueda registrar cada vez su produccion, si se siguio la receta o no, si tiene intencion y o es nueva receta, de cual noria salio, que cantidad entro y salio de esa noria y a cual lote y microlote o plantones se recibieron esas, a veces un lote o microparcela o parcela puede tener plantones con distintos aplicacion de biochar de distintos batches de noria.
```

**Qué produjo:** PENDIENTE — `FUENTE_CERRO_AZUL_INDICE.md` §4: la noria no es un objeto y la aplicación al cultivo no existe.

## las minutas: manda la última revisión

*2026-09-16 · transcripción, línea 38850 · enviado mientras se trabajaba*

```text
Las dos versiones de la misma minuta no coinciden. La inglesa dice «harvesting 2029–2033»; la española revisada para Chris dice «cosechando 2031–2033». Misma reunión. No elegí ninguna. La ultima revision de minutas sera la que debe actualizar, puede quedar historial que se penso antes pero la revisada es la version que importa ahora.
```

**Qué produjo:** ADR-147 — y es una REGLA, no un caso: vale para todo par futuro.

## colmenas por apiario

*2026-09-16 · transcripción, línea 39198*

```text
See ya aparecen pero falta registrar que son cinco colmenas en cada apiario
```

**Qué produjo:** ADR-149 — alta de colmenas en lote.

## vocabularios fijos en campo

*2026-09-16 · transcripción, línea 39303 · enviado mientras se trabajaba*

```text
Otra cosa más que me importa mucho, incluir ahora mismo, antes de usarlo, prefiero ahora, es que te pongas a agregar eh, variables, maestras, que entren para ir por jugar campos, fijos, como si vamos a hablar en el caso de tratamientos, o temas de la visita a las abejas, vamos a decir que yo entro y voy a alimentarlas, yo quiero que todos los campos, lo más que se pueda, no sea campo libre de texto libre, que sean variables como ah, le alimenté con azúcar morena o azúcar blanca o con melaza o con miel de abeja miel de caña, ¿sabes? Yo quiero tener ya muchas variables fijos en el drop down y así asegurar que se puede utilizar el lenguaje y bueno, si hay algo que no entra, puedes poner otro y que uno pueda llenar, que es ese otro, ¿no? Ya después, pero hay que tener variables eh, fijas para ese tipo de, de manejos en campo para las el tema de la abeja. Inclusive desde las observaciones, si se alimentó, se trató, el tema de limpieza fitosanitaria. Todo esto tiene que ir así. Entonces vamos a investigar si pensé que ya tenemos toda esa información. Si hace falta, me preguntas. Y buscamos en línea eh, buenas terminologías y descriptores y, y ese vocabulario para llenar esos eh, variables o parámetros maestros.
```

**Qué produjo:** ADR-148 (alimentación). PENDIENTES tratamiento y limpieza fitosanitaria — `docs/dominio/varroa-inspeccion-desinfeccion.md` es la base, en borrador.

## con qué se alimenta

*2026-09-16 · transcripción, línea 39349*

```text
azúcar morena, blanca, melaza, miel de abeja y miel de caña
```

**Qué produjo:** ADR-148 — `FeedingMaterial`.

## vocabulario completo y la eñe

*2026-09-17 · transcripción, línea 40984*

```text
mis cinco más los jarabes, y arregla apiñada
```

**Qué produjo:** ADR-153 — diez valores de alimentación; `apiñada` con eñe.

## anotar en sitio o al cierre

*2026-09-17 · transcripción, línea 42082*

```text
se deberia poder hacer durante la visita o al cierre, a veces en sitio y si solo un apicultor es dificil maniobrar y se eficiente de entrar y salir y estresar menos a las abejas.
```

**Qué produjo:** ADR-157 — `fieldVitalsOnSiteAt`: no se restringe, se registra cuál de las dos pasó.

