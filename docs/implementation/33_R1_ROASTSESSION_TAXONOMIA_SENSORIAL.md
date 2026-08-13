I # R1 — `RoastSession` y taxonomía sensorial de descriptores y defectos

**Esquema y capa de servicio. Sin pantallas**, mismo criterio que F1 y S1.

Dos brechas que se construyen juntas porque se necesitan mutuamente: sin
`RoastSession` no se puede decir *cómo* se tostó un café, y sin taxonomía
estructurada no se puede decir *qué* se percibió más allá de un número. El
caso que las une es real y tuyo: **el mismo café tostado por distintos
tostadores en distintos equipos, catado simultáneamente en la misma mesa.**

**Contexto:** `29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md` §7a, y
el hallazgo 4 de la Parte C de la auditoría `17_`. Leelos antes de empezar.

---

## Parte 1 — `RoastSession`

### 1.1 Lo que ya funciona y no hay que rediseñar

La bifurcación está verificada: un lote verde tostado de tres maneras produce
tres `Lot` con `lotType: "roast"` vía un `LotTransformation` de tipo `split`
—un input, tres outputs— cada uno con su muestra, su puntaje y su producto.
Un nodo del DAG con tres hijos, recorrible por CTE recursivo.

**Eso no se toca.** Lo que falta es el registro tipado de la ejecución.

### 1.2 El problema concreto

Hoy la distinción entre "tueste claro filtro" y "medio espresso" vive **solo
en el código del lote y en notas de texto libre**. No es consultable. No se
puede preguntar "mostrame todos los lotes de tueste claro" ni "qué perfiles
puntuaron sobre 87".

### 1.3 Qué construir

Un `RoastSession` con la misma forma que `FermentationRun` y `DryingRun` ya
tienen — registro de ejecución colgando de la transformación, no una entidad
paralela. Seguí ese patrón; está probado.

Debe registrar:

- **Perfil y curva** — nivel de tueste, tiempos, temperaturas, primer y
  segundo crack donde aplique. Recomendá cómo guardar la curva: puntos
  discretos, serie de tiempo, o referencia a archivo del equipo.
- **Equipo** — qué tostadora. Nota: el equipo como entidad no existe todavía
  (`18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md` sigue sin construirse).
  Recomendá si se referencia por texto por ahora o si hace falta algo mínimo.
- **Tostador** — la persona. Y acá está el punto importante: **el tostador es
  una variable del experimento, no solo un actor.** Gabriel tostando en su
  equipo y otro tostando en el suyo, con puntajes comparables, es el caso que
  justifica todo esto.
- **Peso de entrada y salida**, para la merma del tueste.

### 1.4 Humedad y densidad del verde — antes de tostar, no en almacenaje

`29_` §7a lo señala explícitamente: la humedad y densidad del verde **justo
antes del tueste** no son la misma medición que las de almacenaje. Son un
estado del material en un momento específico.

`Measurement` ya cuelga de un `Lot`, así que probablemente cabe sin cambios.
**Verificalo antes de asumirlo** — si hace falta distinguir el momento
(almacenaje versus pre-tueste), decí cómo.

## Parte 2 — Taxonomía de descriptores y defectos

### 2.1 Por qué esto es la única pérdida real que encontró la auditoría

`BEVERAGE_SENSORY_PROTOCOLS.md` nombra Descriptor, Defecto y Confianza como
conceptos distintos, y especifica una taxonomía de descriptores de miel con
familia, clasificación y causa técnica.

El esquema construido (`AttributeResponse`) tiene **un valor numérico y un
comentario de texto libre**. Nada más.

La consecuencia, en palabras de la auditoría: el sistema de Estándares de
Referencia y Calibración —§7, construido completo y sólido— existe
precisamente para hacer los juicios de los evaluadores precisos y comparables,
pero la observación real de un catador —*"off-flavor, confianza media, defecto
de familia DMS"*— no tiene dónde ir salvo texto sin estructura.

**Calibrás gente contra compuestos conocidos y después registrás su resultado
como prosa.** Y es compounding: cada evaluación enviada bajo el esquema actual
es data que no se puede estructurar retroactivamente sin pedirle a los
evaluadores que rehagan el trabajo.

### 2.2 Qué construir

- **Vocabulario de descriptores**, por dominio —café, miel, cerveza,
  hidromiel— reusando el patrón de versionado que
  `SensoryProtocol`/`SensoryProtocolVersion` ya usa. Un descriptor pertenece a
  una versión de protocolo, no flota suelto.
- **Taxonomía de defectos** con familia, clasificación y **causa técnica** —
  eso último es lo que la hace útil operativamente: un defecto que apunta a su
  causa es diagnóstico, no solo etiqueta.
- **Confianza del evaluador** por respuesta. Un catador que dice "creo que hay
  fenólico, no estoy seguro" está dando información distinta de uno que lo
  afirma.
- El texto libre **se queda**. La estructura no reemplaza la nota; la
  acompaña.

### 2.3 El contenido ya está escrito — no lo inventes

`BEVERAGE_SENSORY_PROTOCOLS.md` tiene la taxonomía de defectos de miel de tres
niveles con causas técnicas reales, y la rúbrica de 100 puntos —ambas
reconstruidas como obra original del product owner en el commit `c913595`.
**Ese contenido va al esquema tal como está en el documento.**

**Regla de copyright, que ha aguantado todo el proyecto:** no reproduzcas
vocabulario descriptivo publicado de SCA, BJCP, ni de ningún otro cuerpo, ni
sus taxonomías de defectos tal como las redactaron. Los conceptos del oficio
son libres; su redacción publicada no. Lo que va al esquema es lo que ya está
en `BEVERAGE_SENSORY_PROTOCOLS.md`, más lo que el product owner aporte
después.

### 2.4 Migración de lo ya registrado

Hay evaluaciones existentes con comentarios de texto libre. **No las
conviertas automáticamente** — interpretar prosa como descriptores
estructurados es exactamente el tipo de inferencia que la disciplina de
procedencia de esta plataforma prohíbe.

Reportá cuántas hay y recomendá qué hacer: dejarlas como están, o marcarlas
como candidatas a revisión humana.

## 3. Convenciones obligatorias

- **Procedencia por ADR-038** — `provenanceClass` requerido sin default,
  elegido en el action layer. Un perfil de tueste leído del equipo no es lo
  mismo que uno recordado esa noche.
- **FKs nulables por padre, nunca polimórficas** — ADR-020 decisión 8.
- **`assertDefinedWhere` en toda limpieza de tests** — ADR-045.
- **Auditoría en escrituras de evidencia** — C1 §3 la agregó en once puntos;
  las escrituras nuevas de este ticket la necesitan también.
- **Cuidado con la base compartida.** Hay datos reales de A7, F1 y S1. Ningún
  test los toca. Verificá antes y después.

## 4. Verificación

1. Tostar un lote verde de tres maneras distintas, cada una con su
   `RoastSession`, y confirmar que se puede consultar por perfil — no solo
   por código de lote.
2. Registrar el mismo café tostado por **dos tostadores distintos en equipos
   distintos**, catarlos, y confirmar que los puntajes quedan comparables con
   el tostador como variable consultable.
3. Registrar humedad y densidad del verde antes del tueste y confirmar que se
   distinguen de una medición de almacenaje.
4. Enviar una evaluación sensorial con descriptor estructurado, defecto con
   causa técnica, y nivel de confianza — y confirmar que el texto libre sigue
   funcionando junto a eso.
5. Confirmar que los datos reales de A7, F1 y S1 siguen intactos.

## 5. Entregables

Migración, capa de servicio, tests, y **texto de ADR en borrador** con la
misma marca en el encabezado que usaste en F1 y S1 para que no se vuelva
huérfano. Registrá: cómo se guarda la curva de tueste, cómo se referencia el
equipo mientras no exista esa entidad, y la decisión de §2.4 sobre
evaluaciones ya registradas.

Actualizá `README.md`. Confirmá el siguiente número de ADR contra el archivo
real.

Reportá qué queda pendiente de `29_` después de este ticket.
