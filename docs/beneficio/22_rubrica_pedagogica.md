# 22 — Rúbrica Pedagógica: Guiar, no solo Registrar
**Estado:** Normativo · **Versión:** 1.0

El propósito de esta herramienta no es tener el beneficio documentado. Es que quien la usa **fermente mejor**. Documentar es el medio; la formación del criterio del productor es el fin.

Un formulario que pide pH cada cuatro horas y no dice nada más produce una base de datos impecable y ningún aprendizaje. Al terminar la cosecha, quien la usó sabe exactamente lo mismo que al empezar, y depende del software para saber si su café va bien. Ese es el modo de falla que esta rúbrica existe para prevenir.

---

## 1. Niveles de una interacción

| Nivel | Qué hace | Ejemplo con pH |
| :--- | :--- | :--- |
| **0 — Formulario mudo** | Pide un número | «pH: ___» |
| **1 — Con contexto** | Explica qué es y por qué importa | «El pH mide cómo avanza la fermentación» |
| **2 — Interpretativo** | Dice qué significa **este** valor en **este** lote | «4.2 a las 14 h: vas dentro de la ventana, y bajando al ritmo esperado» |
| **3 — Guía a la acción** | Dice qué hacer ahora y qué pasa si no | «Lleva 12 h sin moverse. Revisa temperatura del tanque antes de decidir: si está por debajo de 18 °C probablemente sea frío, no infección» |
| **4 — Formativo** | Quien lo usa sale sabiendo más; la guía se retira conforme gana criterio | Tras varios ciclos: «Este lote se parece al 014 de febrero, que se estancó por frío nocturno» |

**Umbrales obligatorios:**

- Todo punto donde la app **pide un número** alcanza al menos **Nivel 2**.
- Todo punto que **puede emitir una alerta** alcanza **Nivel 3**. Una alerta sin acción es ruido que enseña a ignorar alertas.
- Todo cierre de etapa alcanza al menos **Nivel 2** mirando hacia atrás: qué pasó en esta etapa.

## 2. Momentos de intervención

La guía no es una sección de ayuda. Vive en cinco momentos, y cada uno tiene una función distinta.

| Momento | Función | Por qué importa |
| :--- | :--- | :--- |
| **Antes de medir** | Cómo tomar bien la muestra | **Aquí se gana o se pierde la calidad del dato.** Toda la cadena de validación posterior no puede arreglar una muestra mal tomada. Es el momento más desatendido en este tipo de software y el de mayor retorno |
| **Al registrar** | Qué significa lo que acabas de anotar | Convierte la captura en lectura |
| **Al alertar** | Qué hacer, en qué orden, y el costo de no hacerlo | Convierte la alarma en decisión |
| **Al cerrar una etapa** | Qué pasó y qué se aprendió | Cierra el ciclo de aprendizaje; sin esto nunca hay Nivel 4 |
| **Entre cosechas** | Retrospectiva: qué funcionó, qué repetir | Donde el sistema deja de ser un registro y se vuelve experiencia acumulada |

## 3. Antipatrones — cada uno es un hallazgo de auditoría

1. **Alerta sin salida.** «pH estancado» y nada más. El operador queda con un problema nombrado y ninguna acción.
2. **Guía genérica donde hace falta guía específica.** Un párrafo sobre qué es el Brix cuando lo que el operador necesita saber es qué hacer con 18.8 a las 20 horas en *este* tanque.
3. **Muro de texto en el momento de trabajo.** A las cinco de la mañana, con las manos mojadas y el teléfono al sol, nadie lee tres párrafos. La guía en campo es una frase; la profundidad va detrás de un toque, para después.
4. **Guía que no se apaga.** Quien lleva veinte cosechas no necesita que le expliquen qué es el mucílago cada vez. El andamiaje que no se desmonta se vuelve estorbo, y el usuario aprende a saltarse todo — incluido lo que sí importaba.
5. **Tono que infantiliza al productor.** El productor es el experto en su finca; la app trae un instrumento, no autoridad. Una guía que enseña como si corrigiera es una guía que se deja de leer. Se explica el instrumento, no el oficio.
6. **Vocabulario impuesto.** Si en la finca se dice *baba*, *pasilla*, *vinazo*, *chorreado*, la app usa esa palabra y enseña el término técnico al lado — nunca lo reemplaza. El glosario va del campo al libro, no al revés.
7. **Falsa autoridad.** Decir «lave ahora» cuando el dato sugiere pero no determina. Ver `21_rubrica_veracidad.md` §4.
8. **Enseñar solo cuando algo sale mal.** Si la única guía aparece en las alertas, el sistema enseña patología y no oficio. Un lote que salió bien también tiene algo que enseñar, y es el mejor momento para hacerlo.
9. **Educación desconectada del dato.** Una biblioteca de artículos aparte de las pantallas de trabajo no es pedagogía del producto: es un blog adentro de una app.

## 4. Condiciones de campo — parte de la rúbrica, no un detalle de UI

Una guía que no se puede leer en el beneficio no existe.

- Legible **al sol**, con contraste alto y tipografía grande.
- Operable **con una mano**, con guantes, con la pantalla mojada.
- Utilizable **sin conexión**: la guía es contenido local, no una llamada de red. En finca la señal falla justo cuando se está trabajando.
- **Un vistazo, no una lectura**: lo esencial cabe en una frase; lo demás se despliega.
- Audio o íconos donde la lectura sea una barrera real.

## 5. Escala de evaluación

Cada pantalla, alerta y cierre de etapa recibe una ficha:

```
PANTALLA / ALERTA:   <identificador>
NIVEL ACTUAL:        0–4
NIVEL EXIGIDO:       2 (captura) · 3 (alerta) · 2 (cierre)
MOMENTO:             antes de medir | al registrar | al alertar | al cerrar | entre cosechas
ANTIPATRONES:        <lista, de §3>
CONDICIONES DE CAMPO: cumple | no cumple <cuáles>
BRECHA:              qué falta exactamente
PROPUESTA:           texto guía redactado + cuándo y cómo aparece
```

## 6. Prueba final

> Alguien usa esta herramienta durante una cosecha completa. Al terminar, **¿sabe fermentar mejor que cuando empezó, o solo tiene mejor documentada la misma fermentación de siempre?**

Si la respuesta honesta es la segunda, la herramienta funciona y el producto falló.
