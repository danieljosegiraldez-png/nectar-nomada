# Auditoría de campo — apiario y parcela

Las otras dos pantallas de detalle de campo, las que la auditoría de Lotes
(#285) dejó fuera. Apiario es el trabajo zootécnico y parcela el agronómico.

## Cómo se midió, y qué NO se pudo medir

**Esto es una auditoría de código, no de pantalla.** La de Lotes midió píxeles
reales inyectando un iframe de 390×844 **en la sesión de Daniel**; aquí no se
entró con la cuenta de nadie, así que no hay medida de viewport, de áreas
táctiles renderizadas ni de contraste. Todo lo de abajo sale de leer
`origin/main` (`a13c159`) y contar.

Lo que eso deja sin comprobar, dicho para que nadie lo cuente como comprobado:
cuánto del primer viewport se consume antes del contenido, si los objetivos
táctiles llegan a 48 px una vez pintados, y cómo se ve al sol. Las tres
preguntas del brief original siguen abiertas para estas dos pantallas.

## 1. La forma de las tres pantallas

| pantalla | líneas | secciones | tipos de formulario | montajes | render condicional |
|---|---|---|---|---|---|
| `lots/[id]` | 1.046 | 33 | 8 | 17 | 61 |
| `plots/[id]` | 665 | 18 | 8 | 12 | 19 |
| `apiaries/[id]` | 572 | 23 | 5 | 5 | 21 |

**Corrección de una primera lectura mía:** conté «2 condicionales» en parcela
con un patrón que no cogía los ternarios. Con el patrón bueno son 19. **Las tres
esconden lo vacío**, así que el problema de la pantalla de Lotes no es que pinte
lo que no aplica: es el **orden y la densidad** —33 secciones sin jerarquía—, que
es justo lo que su propuesta §11 corrige. Apiario y parcela están a la mitad de
tamaño y todavía no han llegado ahí.

## 2. La captura sin señal — el hallazgo que se generaliza, y empeora

La auditoría de Lotes encontró que la pantalla abre sin cobertura y el botón no:
la cola offline sólo existía para apiario y jornadas de campo. Contado ahora por
dominio, sobre `origin/main`:

| dominio | formularios | encolan |
|---|---|---|
| apiario (zootecnia) | 12 | **4** |
| trazabilidad (café **y tierra**) | 27 | **1** |

Y de la parcela en concreto, **ninguno**: `SoilProfileForm`, `PlotAttributesForm`,
`PlantingCohortForm`, `LandPhotoUploadForm` y los dos de `SampleForms.tsx`
—suelo y foliar— dan **cero** referencias a una cola. El control es que
`InspectionForm` de apiario **sí** la usa, así que el detector distingue.

**O sea: el muestreo de suelo y foliar se pierde sin señal igual que el café.**
Y es peor que en café por dónde ocurre: una muestra de suelo se toma en la
parcela, que es justo donde no hay cobertura, y no se puede repetir a la vuelta
—el punto, la profundidad y la hora ya pasaron—.

## 3. La urgencia: apiario la tiene, parcela no

Apiario sí sabe qué toca: llama a `retirosPendientes(id, ahora, 14)` —periodos de
carencia con catorce días de antelación—, y marca cuándo una colmena no tiene
registro con `diasDesdeInspeccion`. Eso es exactamente lo que la propuesta de
Lotes pedía para el café, y aquí ya existe.

`plots/[id]` **no tiene ninguna noción equivalente**: ni vencimiento, ni ventana,
ni próxima tarea. Buscadas las palabras una por una, cero apariciones. La
pantalla puede decir lo que hay, no lo que toca.

## 4. Lo que esto implica, sin diseñar nada todavía

Tres cosas, en orden de consecuencia:

1. **La cola offline no es un asunto del café: es del trabajo de campo.** El
   arreglo que se proponga para los formularios de beneficio debería cubrir
   suelo y foliar en la misma pieza, o la mitad agronómica se queda fuera otra
   vez.
2. **Parcela necesita su equivalente de `retirosPendientes`.** Apiario ya
   demuestra que el patrón funciona en este repositorio; no hay que inventarlo.
3. **Apiario y parcela todavía no son el volcado que es Lotes**, así que aplicar
   §11 ahí sería trabajo por adelantado. Lo que sí comparten es lo de arriba.

**Ninguna de las tres se implementa aquí.** Esto es medición; el diseño y su
aprobación son otra conversación, como lo fueron para Lotes.
