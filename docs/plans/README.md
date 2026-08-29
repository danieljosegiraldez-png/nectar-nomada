# Planes

Un plan por trabajo que no sea pequeño. Cinco compuertas:

1. **Planificarlo** aquí, con un objetivo explícito: para qué es, y **cómo
   sabremos que funcionó**.
2. **Mandar el plan a un revisor independiente antes de escribir código.**
3. **No ejecutar mientras quede un hallazgo sin atender** — cada uno se arregla,
   o se resuelve con una razón declarada y un coste-si-me-equivoco. El revisor no
   tiene veto; la compuerta sigue siendo real.
4. **Ejecutar**, idealmente con subagentes guiados por el plan.
5. **Devolver el trabajo terminado** con el diff y los criterios de aceptación, y
   adjudicar igual.

**Exento:** un arreglo de una línea, un renombrado, una errata, un retoque de
doc, un valor de configuración.

**Si estás sopesando si algo califica como pequeño, no lo es.** Esa duda es la
señal, y esta exención es la parte que se va a abusar primero.

## Por qué revisar el plan vale más que revisar el código

Dos construcciones salieron con ocho defectos entre las dos y **los ocho estaban
en la especificación, no en la implementación**. Los implementadores
construyeron exactamente lo que se les dijo. La revisión de plan atrapó dos antes
de que existiera una línea.

## Plantilla

```markdown
# <título>  ·  <fecha>

## Para qué es
## Cómo sabremos que funcionó   (criterios de aceptación, comprobables)
## Qué NO hace
## Archivos que toca
## Riesgos, y el coste si me equivoco
## Revisión — hallazgos y adjudicación
| # | hallazgo | veredicto | razón | coste-si-me-equivoco |
```
