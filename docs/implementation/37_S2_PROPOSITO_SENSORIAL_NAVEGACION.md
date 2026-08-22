# S2 — Modelo de propósito sensorial y consolidación de navegación

**Dos cosas relacionadas:** un modelo de propósito, sujeto y rol para
evaluación sensorial, y la consolidación de navegación que ese modelo hace
posible.

**Esquema, servicio y navegación. Las herramientas de evaluación en sí llegan
después** — este ticket establece los ejes, no construye cada formato.

---

## 1. El problema, visto desde el campo

Hoy la barra tiene siete elementos —My Néctar, Partner Workspace, Sensory, AI
Suggestions, Competitions, Calibration, Sign out— y eso se ve en un teléfono
o tablet, al sol, con visibilidad limitada.

Tres de esos son la misma disciplina: **Sensory, Competitions y Calibration
no son secciones distintas, son sensorial.**

Pero consolidarlos sin resolver qué los distingue sería cosmético. Lo que
sigue es el modelo que hace que la consolidación signifique algo.

## 2. Los tres ejes

Lo que distingue una herramienta de evaluación de otra **no es el producto ni
el formato de sesión** — es la combinación de tres cosas:

### 2a. Propósito — para qué se evalúa

Cinco, y son genuinamente distintos:

| Propósito | Qué hace | Ejemplo |
|---|---|---|
| **Rankear** | Puntuar contra un estándar para ordenar | Juez de competencia |
| **Verificar conformidad** | Contrastar contra una especificación: pasa o no pasa | QC en cervecería, tostador validando su perfil |
| **Caracterizar** | Describir qué hay y cómo se expresa el proceso | Panel de proceso, evaluación experimental |
| **Seleccionar** | Decidir entre opciones para un fin | Comprador de verde, competidor eligiendo qué presentar |
| **Gustar** | Respuesta hedónica | Consumidor |

**El formato de sesión y el modo de deliberación son consecuencia del
propósito, no ejes independientes.** Un juez delibera en panel bajo reglas de
competencia; un QC decide solo contra especificación. No hace falta modelar
el formato aparte.

**`Gustar` ya está separado estructuralmente** — `CONSUMER_SENSORY_FEEDBACK.md`
prohíbe combinar gusto de consumidor con juicio técnico, y CLAUDE.md §49 lo
refuerza. **Este ticket extiende esa misma lógica a los otros cuatro**: un
puntaje de competencia y una verificación de QC tampoco son intercambiables
aunque ambos sean "sensorial".

**Pregunta a resolver y registrar:** ¿qué resultados son comparables entre
sí? Rankear y caracterizar podrían serlo si usan el mismo protocolo; verificar
conformidad probablemente no, porque su salida es binaria. **Recomendá con
razonamiento y hacelo cumplir en el modelo**, no solo documentarlo — es la
misma disciplina que ya impide mezclar hedónico con técnico.

### 2b. Sujeto — qué se evalúa

Pocos, deliberadamente:

- **Materia prima en proceso** — cereza, mosto, pergamino
- **Producto intermedio** — verde, tostado, lote de miel
- **Bebida preparada**

**Y lo que no son sujetos, aunque parezcan:** alcohólico o no alcohólico es
*propiedad del producto*; carbonatación forzada o natural es *atributo de
proceso* (ya vive en `23_RECIPES_FORMULATION_AND_DISTILLATION.md`); el método
de extracción —espresso, filtro, prensa— es *cómo se preparó esa taza*.

Modelarlos como sujetos distintos haría crecer la lista sin fin. Como
atributos del sujeto, **dos evaluaciones de la misma bebida con distinto
método de extracción siguen siendo comparables** — que es exactamente lo que
un barista necesita.

Para cerveza, hidromiel y otras fermentadas, el equivalente: mosto en
proceso, producto terminado, bebida servida.

### 2c. Rol — quién evalúa

**Ya lo resuelve RBAC.** No lo modeles aparte. El rol resuelto del usuario
determina qué propósitos tiene disponibles: un operador de finca no juzga
competencias, un juez no hace QC de cervecería.

## 3. Por qué tres ejes y no una lista de roles

Se consideró enumerar roles —juez, QC, panel de proceso, comprador de verde,
tostador, barista, competidor, consumidor— y **se descartó**: esa lista crece
indefinidamente y esconde que muchos hacen lo mismo con distinto sujeto.

Un tostador verificando su perfil y un cervecero verificando un lote **hacen
lo mismo**: verificar conformidad, con distinto sujeto. Un comprador de verde
y un competidor eligiendo qué presentar **hacen lo mismo**: seleccionar.

Tres ejes cubren doce roles sin enumerarlos, y admiten el rol trece sin
cambiar el modelo.

## 4. Navegación consolidada

**Sensorial como una sección**, agrupando lo que hoy son tres. Dentro, las
herramientas se ofrecen según propósito cruzado con el rol resuelto.

**El resto de la barra, revisado:**

- **My Néctar** y **Partner Workspace** se quedan — el product owner
  confirmó que son necesarios: Partner Workspace refleja un proyecto, una
  finca, varios apiarios, o un proyecto de café vinculado a varias
  ubicaciones, organizaciones y personas.
- **AI Suggestions** — evaluá si es un destino o una capacidad transversal.
  ADR-037 fijó que `ai:converse` lo tienen solo Platform Admin y Content/Ops,
  así que un operador de finca no debería verlo en absoluto.
- **Sign out** — no compite por espacio de navegación; movelo donde
  corresponda.

**Regla:** ningún elemento visible que el usuario no pueda usar. Es
`SECURITY.md` §2 aplicado a la navegación — el frontend no es la frontera de
seguridad, pero tampoco debe ofrecer lo que el servidor va a rechazar.

## 5. Relación con `16_` — no lo reemplaza

`16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md` establece que la navegación debe
**derivarse del contexto y los permisos resueltos**, no ser una lista fija.
Ese sigue siendo el destino.

**Este ticket es el paso intermedio:** consolidar y filtrar por permisos
ahora, porque es barato y mejora hoy. La navegación plenamente adaptativa
llega cuando `16_` se ejecute.

No construyas la investigación de UX acá. No rediseñes el banco de trabajo de
operador.

## 6. Alcance — qué no entra

- **Las herramientas de evaluación por propósito.** Este ticket define los
  ejes y la navegación; construir el formulario de juez, el de QC y el de
  panel de proceso son tickets propios.
- **Rediseño visual.** Consolidación de navegación, no un sistema de diseño
  nuevo.
- **Migración de evaluaciones existentes.** Si hay `Assessment` sin propósito
  declarado, reportá cuántas y recomendá — **no las clasifiques
  automáticamente.** Inferir el propósito de una evaluación pasada es
  exactamente la clase de interpretación que la procedencia prohíbe.

## 7. Convenciones obligatorias

Procedencia por ADR-038, auditoría en escrituras de evidencia, FKs nulables
por padre nunca polimórficas (ADR-020 decisión 8), `assertDefinedWhere` en
tests (ADR-045). Hay datos reales de A7, F1, S1, R1 y RO1 — verificá antes y
después.

## 8. Verificación

1. Registrar evaluaciones del mismo sujeto con propósitos distintos —rankear
   y verificar conformidad— y confirmar que **no** se agregan como si fueran
   lo mismo.
2. Confirmar que una evaluación hedónica de consumidor sigue sin poder
   combinarse con ninguna técnica.
3. Confirmar que dos evaluaciones de la misma bebida con distinto método de
   extracción **sí** son comparables.
4. Entrar como operador de finca y confirmar que no ve herramientas de
   competencia ni de calibración.
5. Entrar como juez y confirmar que ve lo suyo y no el banco de trabajo de
   finca.
6. Confirmar en un viewport de teléfono que la barra consolidada es usable.
7. Confirmar que los datos reales siguen intactos.

## 9. Entregables

Migración, servicio, navegación consolidada, tests, y **texto de ADR en
borrador** con la marca en el encabezado. Registrá: los cinco propósitos y
por qué se eligió propósito/sujeto/rol en vez de una lista de roles, qué
resultados son comparables entre sí y cuáles no, y la decisión sobre AI
Suggestions.

Actualizá `README.md`. Confirmá el siguiente número de ADR contra el archivo
real.
