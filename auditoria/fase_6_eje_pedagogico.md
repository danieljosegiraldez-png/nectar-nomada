# Fase 6 — Auditoría pedagógica integral y diseño de la guía

Rama `auditoria/fase-6`. Referencia principal: `docs/22`, con `docs/21` §4 para la veracidad del contenido.

Las fases 1 a 5 evaluaron la pedagogía por etapa. Esta la evalúa como sistema, y **redacta lo que falta**.

## Parte A — Barrido completo

Levanta el inventario de **toda** superficie donde la app pide un dato, emite una alerta o cierra una etapa. Para cada una, la ficha de `docs/22` §5: nivel actual, nivel exigido, momento de intervención, antipatrones presentes, condiciones de campo, brecha.

Entrega la tabla completa en `auditoria/informes/fase_6_barrido.md`. Sin excepciones ni muestreo: el barrido completo es el entregable.

## Parte B — Lectura del sistema

Por encima de las pantallas individuales:

1. **Trayectoria de aprendizaje.** ¿Existe una progresión de novato a experimentado, o todas las pantallas hablan siempre igual? ¿Hay andamiaje, y se desmonta?
2. **Los cinco momentos.** ¿Cuáles están cubiertos y cuáles vacíos? **«Antes de medir» y «entre cosechas» suelen estar ausentes por completo**, y son los dos de mayor retorno: el primero decide la calidad de todo el dato; el segundo es donde el sistema deja de ser registro y se vuelve experiencia acumulada.
3. **Enseñanza en el éxito.** ¿La guía solo aparece cuando algo sale mal? Si es así, el sistema enseña patología y no oficio.
4. **Vocabulario.** ¿Usa las palabras del campo —baba, pasilla, vinazo, chorreado— y enseña el término técnico al lado, o impone el término técnico? El glosario va del campo al libro, no al revés.
5. **Educación conectada al dato.** ¿Hay una biblioteca de contenido separada de las pantallas de trabajo? Un blog dentro de una app no es pedagogía de producto.

## Parte C — Redacción

Para cada brecha, **escribe el texto guía que falta**. No descripciones de lo que haría falta: el texto, listo para revisar y aprobar.

- **En español de campo panameño.** Frases cortas. Sin jerga de software y sin tono de manual.
- **El productor es el experto en su finca.** La app trae un instrumento, no autoridad. Se explica el instrumento, no el oficio.
- **Honesto sobre la incertidumbre.** El sistema es asesor, no autónomo. Cuando el dato sugiere pero no determina, el texto lo dice y devuelve la decisión a quien la tiene que tomar.
- **Separa siempre «esto es práctica general» de «esto es tu dato».**
- Toda afirmación técnica lleva su fuente, o se presenta como criterio propio de Néctar Nómada — y se dice cuál de las dos es.
- Los rangos se presentan como rangos, no como verdades.
- **En campo: una frase.** La profundidad va detrás de un toque, para después.

Entrega el contenido en `contenido/guia/` en archivos por etapa, con su clave i18n, para que pase por revisión antes de entrar al código.

## Parte D — Diseño de la interacción

Para cada pieza de guía, propón **cuándo y cómo aparece**:

- Momento exacto en el flujo, y qué lo dispara.
- Forma: línea bajo el campo, tarjeta previa, hoja desplegable, resumen al cerrar, notificación.
- Cuánto se ve de entrada y qué queda detrás de un toque.
- **Regla de retiro:** qué hace que esta guía deje de aparecer para alguien que ya la domina, y cómo se recupera si la quiere.
- Comportamiento sin conexión.
- Legibilidad al sol y operación con una mano.

Entrega esto en `auditoria/informes/fase_6_interaccion.md`, con un diagrama de flujo por etapa cuando ayude a verlo.

## Parte E — La prueba final

Responde por escrito, sin suavizarla:

> Alguien usa esta herramienta durante una cosecha completa. **¿Sale sabiendo fermentar mejor, o solo con mejor documentada la misma fermentación de siempre?**

Si la respuesta honesta es la segunda, dime exactamente qué tres cambios la moverían más, y por qué esos tres.

## Entregables

Los tres informes, el contenido redactado en `contenido/guia/`, y los hallazgos `F6-001` en `auditoria/informes/fase_6.md`. **El contenido redactado no entra al código en esta fase**: queda para revisión — es criterio sensorial y voz de marca, y ambos están en la lista de lo que no se toca sin aprobación.
