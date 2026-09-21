# Material de dominio — fuente, no decisión

Aquí vive el material técnico **de entrada**: guías, matrices de umbrales y
referencias de proceso que alguien trajo de fuera del repositorio. No es
arquitectura (`docs/architecture/`, los ADR) ni implementación
(`docs/implementation/`, los anexos numerados): es **de dónde salió un número**.

## La regla, y por qué existe

`CLAUDE.md` §3 fija una jerarquía de fuentes y §32 prohíbe que una IA apruebe
conclusiones. Las dos cosas se vuelven papel mojado si el material entra sin
decir de dónde viene: en dos meses nadie distingue el umbral que el dueño
respalda del que redactó un modelo, y el código acaba apoyándose en los dos por
igual.

**Cada archivo de esta carpeta abre con una cabecera de procedencia** que dice
quién lo afirma y en qué estado está. Sin esa cabecera, un archivo aquí no se
puede citar desde el código.

| estado | qué significa | qué puede apoyarse en él |
|---|---|---|
| `material del dueño` | Daniel lo afirma desde su experiencia u operación | contenido de receta, catálogos, rangos por defecto |
| `borrador · pendiente de revisión` | lo redactó un modelo y **nadie lo ha validado** | nada automático; sirve para conversar y para que él lo lea |
| `referencia externa` | publicación o norma de un tercero, con su cita | lo que su propia cita sostenga |
| `reemplazado · no normativo` | lo sustituyó un documento posterior, que se nombra en la cabecera | nada; se conserva como historia |

## Lo que un borrador pendiente de revisión NO puede hacer

No puede convertirse en una alerta que el software dispare solo. §32 exige
`sugerencia → evidencia → revisión humana → acción → registro`, y una alerta
automática se salta las tres del medio. Un umbral sin revisar puede **proponer**
—«esta lectura queda fuera del rango que sugiere la guía, ¿lo miras?»— y no
**afirmar** —«PELIGRO: lave el café de inmediato»—.

La diferencia no es de tono. Es que la primera deja el juicio en la persona que
está delante del tanque, y la segunda se lo quita.
