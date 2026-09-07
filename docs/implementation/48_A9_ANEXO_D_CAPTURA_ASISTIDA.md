# A9 · Anexo D — Captura asistida en campo (entrada del dueño)

> **Qué es esto.** Criterio del dueño sobre qué tecnología del teléfono usar en
> el apiario y cuál dejar fuera, con la razón de cada una. Es entrada para la
> decisión **D8** de `48_A9_CAPTURA_DE_CAMPO_PROMPT.md`, no una especificación.
>
> Contexto que cambia el diseño: **quien captura estará entrenado.** Eso permite
> pedir datos técnicos reales —cuadros cubiertos, tipo de celda real, método de
> conteo de varroa— sin traducirlos a lenguaje de aficionado. Lo que no arregla
> es el cuerpo: guantes, velo, sol, una mano ocupada y muchas veces sin señal.

---

## 1. El orden por lo que ahorra, no por lo que suena bien

| | Ahorra | Cuesta | Veredicto propuesto |
|---|---|---|---|
| QR / NFC en la caja | más toques que todo lo demás junto | calcomanías + una ruta de resolución | **primero** |
| GPS | elegir el sitio de una lista con guantes | permiso del navegador, precisión | **sí, para el sitio** |
| Nota de voz | el único campo largo que se puede llenar con guantes | cola de medios pesada | **sí, con disciplina** |
| Foto dentro de la casilla | ligar la foto después, en el cierre | nada nuevo, `Asset` ya liga | **sí** |
| AI que transcribe y propone | teclear lo mismo dos veces | confirmación humana obligatoria | **sí, como propuesta** |
| AI que diagnostica por foto | — | un falso negativo cuesta una colonia | **no todavía** |
| Video | — | peso, sincronización | **excepcional** |

---

## 2. Identificar la caja sin navegar

El cuello de botella real no es escribir: es llegar a la pantalla correcta. Hoy
hay que abrir sitio → colmena → colonia con guantes puestos, y ese costo se
paga en cada caja de la fila.

Un QR o NFC pegado en cada colmena que abra directo la página de esa colonia lo
elimina. Funciona sin señal si la ruta resuelve contra el espejo local. Cuesta
calcomanías y una convención de identificador —`Hive.identifier` ya es único
dentro de su apiario, no globalmente, así que el código tiene que llevar sitio
y caja, o resolver por UUID.

**El GPS no sirve para esto.** Distingue el sitio; no distingue N-01 de N-02 a
tres metros. Confundir las dos cosas es el error a evitar.

---

## 3. GPS, para lo que sí sirve

- **Seleccionar el sitio al llegar**, sin lista. `Location` ya guarda latitud,
  longitud y punto PostGIS, y ya hay PostGIS para resolver el más cercano.
- **Sellar la coordenada de la visita.** Prueba de que se estuvo ahí, sin
  esfuerzo del operador.
- **Registrar la posición al colocar o mover una caja.** En Toabré el
  emplazamiento fue una decisión deliberada —cubrir la polinización de todos los
  lotes con pocas colonias fuertes— y hoy esa decisión no está en ningún mapa.

Cuidado honesto: bajo dosel cerrado, como Finca 1, la precisión cae. La
coordenada se guarda con su exactitud declarada, no como si fuera exacta.

---

## 4. Audio — el que de verdad importa

Es la única entrada que funciona con guantes y velo puestos. Y es exactamente
donde se pierde hoy lo más valioso: la observación que no cabe en una casilla.

**La disciplina que lo hace compatible con la arquitectura de este proyecto:**

1. **El audio es la evidencia.** Se guarda como `Asset`, ligado a la inspección
   o al evento, y no se borra al transcribir.
2. **La transcripción es derivada.** Nunca reemplaza al audio ni hereda su
   clase de procedencia.
3. **Los campos que la AI extraiga son una propuesta**, y sólo se convierten en
   dato cuando un humano los confirma al cerrar. Antes de eso no cuentan para
   ninguna métrica ni para ningún reporte.

Ese patrón no hay que inventarlo: `GUIDED_FIELD_STUDY_TOOL.md` ya lo establece
para identificación de especies asistida por AI —pendiente hasta confirmación
humana— y el modelo de procedencia del proyecto ya distingue observación
directa de interpretación.

Restricción real: una nota de voz de dos minutos por colonia, en un sitio de
quince cajas, sin señal, es una cola de medios considerable. Si el cliente web
no lo aguanta, eso es un hallazgo que va a `47_P5`, no una razón para no
diseñarlo.

---

## 5. Foto, ligada en el momento

Que la foto se tome **desde dentro de la casilla que documenta** —patrón de
cría, celdas reales, la irregularidad marcada— y quede ligada a ese ítem sola.

Esto resuelve en la captura el problema que el Anexo B empuja al cierre: los
18 archivos del 2 de septiembre no dicen a qué caja pertenecen. `Asset` ya tiene
FK a colmena, colonia, inspección y evento; lo que falta es que la interfaz la
use en el momento correcto en vez de subir todo a un montón.

Lo que sigue siendo trabajo de cierre: el pie de foto, qué afirma la imagen y
quién aparece — es `AssetAnnotation`, y es la decisión **D5**.

---

## 6. AI — dónde sí y dónde no

**Vale la pena:**

- Transcribir la nota de voz y **proponer** los campos estructurados.
- Redactar el borrador del reporte al cliente desde los registros, al cerrar.
  Es literalmente el objetivo del dueño de no teclear dos veces.
- Revisar coherencia al cerrar: «reservas nulas y ninguna alimentación
  registrada», «tratamiento con carencia vigente y cosecha el mismo día»,
  «visita sin conteo de colonias». Barato, y atrapa exactamente los huecos que
  se descubren meses después.

**No vale la pena todavía:**

- Diagnosticar enfermedad o plaga por foto. En campo, un falso negativo cuesta
  una colonia, y no hay corpus local para validarlo.
- Contar varroa por imagen. El método —alcohol, azúcar, bandeja— ya define el
  resultado; una foto no lo sustituye.
- Sugerir manejo. Quien captura está entrenado; la AI no tiene ventaja ahí y sí
  tiene costo de confianza.

Todo lo anterior está sujeto a `CLAUDE.md` §32, gobernanza de AI. Nada generado
por AI entra como observación directa.

---

## 7. La medida de si esto funcionó

No es cuántas funciones se construyeron. Es esta: **una fila de quince cajas se
inspecciona sin sacarse los guantes ni una sola vez.** Si para completar una
caja hay que descalzarse la mano, la tecnología no ayudó — la agregó.
