# V1 — Vocabulario: Lote es terreno, Batch es café, y el vínculo entre ambos

**Bloquea el trabajo del product owner hoy.** No es cosmético: la interfaz
usa "Lots" para el café cosechado, y el product owner usa "lote" para la
parcela de terreno. Al abrir `/lots` espera ver sus seis lotes de terreno y
ve batches de café.

Esta decisión **ya se tomó** y quedó registrada en
`29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md` §2, pero nunca se
escribió como ticket ni entró en el alcance de F1, S1, R1, RO1 ni RO1.1.
Sigue pendiente por eso.

**Cambio de interfaz e i18n, más un vínculo faltante. No es migración de
esquema** — el esquema sigue diciendo `Lot`; cambia lo que ve el usuario.

---

## 1. Los dos conceptos

| Concepto | Interfaz | Entidad en el esquema |
|---|---|---|
| Parcela de terreno con cafetos | **Lote** | `Location` con `locationType: plot` |
| Café cosechado que se procesa | **Batch** | `Lot` |

"Batch" es deliberado: **es la palabra que el product owner ya usa en cerveza
e hidromiel**, así que unifica vocabulario entre dominios en vez de inventar
uno nuevo para café.

**No cambies el esquema.** Renombrar `Lot` costaría una migración sobre datos
reales de producción sin ganar nada — lo que confunde es la etiqueta, no la
estructura.

## 2. El vínculo: un batch sale de un lote específico

**Ésta es la parte que falta de verdad, no solo el nombre.**

En palabras del product owner: *"el batch sale de un lote específico, y si no
hay más de un lote dentro de la finca, igual se marca como lote, ya que
pueden haber en un futuro microlotes."*

Es decir: **el vínculo se registra siempre**, aunque hoy la finca tenga un
solo lote y parezca redundante. Porque cuando aparezcan microlotes —y `F1`
ya construyó la subdivisión— los batches viejos que no lo registraron
quedan sin origen atribuible.

`Lot.locationId` ya existe. Lo que falta:

- **El flujo de cosecha debe exigir de qué lote de terreno viene el batch.**
  No opcional — es el dato que hace posible todo el análisis de terroir
  posterior.
- **El detalle del batch debe mostrar su lote de origen** de forma visible,
  no enterrado.
- **El reporte de lote debe mostrar las condiciones del lote de terreno**
  —sol, sombra, altitud, pendiente, suelo, que F1 ya modeló— junto a los
  resultados del batch.

**Regla que ya se decidió en F1 y sigue vigente:** un batch cosechado antes
de que existiera un microlote **solo puede atribuirse al lote completo**. No
se reasigna retroactivamente. El registro dice lo que se supo en su momento.

## 3. Etiquetas en ambos idiomas

**Español:** terreno = **Lote**, café procesado = **Batch**.

**Inglés:** hoy el código llama `Lot` al café y `Plot` al terreno — al revés
de la intuición del product owner en español. La interfaz en inglés debe
decir **Batch** para el café y **Plot** o **Lot** para el terreno, sin tocar
el esquema.

Revisá **todos** los lugares donde aparece, no solo la navegación:

- Navegación y títulos de página
- El formulario de crear: hoy el campo "Plot" es lo que el product owner
  llama lote — la etiqueta debe decirlo así
- Filtros, listados, encabezados de tabla
- El reporte de lote
- Mensajes de error y de confirmación
- Ambos archivos de mensajes, `en.json` y `es.json`

**Cuidado con `lotType`:** los valores del enum (`cherry`, `processing`,
`drying`, `green`, `roast`, `honey`, `sample`) describen el estado del
**batch**, no del terreno. Sus etiquetas deben leerse como tipos de batch.

## 4. Qué muestra cada pantalla

**Decisión a tomar y justificar, no asumir:** hoy `/lots` lista batches. Con
el vocabulario corregido, un usuario que busque sus lotes de terreno va a ir
ahí igual.

Opciones a evaluar:

- `/lots` muestra batches con etiqueta "Batches", y los lotes de terreno
  viven en la vista de finca o ubicaciones
- Dos pantallas separadas y claramente nombradas
- Una vista de finca como punto de entrada, desde la cual se llega a ambos

**Recomendá una con razonamiento.** La tercera conecta con lo que `29_` §3
ya identificó —que el punto de entrada está invertido, se debería entrar por
la finca y bajar al detalle— pero eso es alcance mayor. Si la solución
mínima alcanza para desbloquear al product owner, hacé esa y anotá la otra.

## 5. Alcance — qué no entra

- **No renombres el esquema.** `Lot` sigue siendo `Lot` en la base.
- **No construyas la vista de finca completa** de `29_` §3 — eso es su
  propio ticket.
- **No toques el modelo de microlotes** que F1 ya construyó.

## 6. Verificación

1. Recorrer la aplicación en español y confirmar que "Lote" siempre se
   refiere a terreno y "Batch" siempre a café. **Ni una sola pantalla
   mezclada.**
2. Lo mismo en inglés.
3. Crear un batch y confirmar que exige indicar de qué lote de terreno
   viene.
4. Confirmar que el detalle del batch muestra su lote de origen.
5. Confirmar que el reporte muestra las condiciones del lote de terreno
   junto a los resultados del batch.
6. Confirmar que los batches existentes con `locationId` ya cargado siguen
   funcionando, y reportá cuántos **no** lo tienen.
7. Confirmar que los datos reales de A7, F1, S1, R1 y RO1 siguen intactos.

## 7. Entregables

Los cambios de i18n y etiquetas, el vínculo obligatorio batch → lote de
terreno, la decisión de §4 con su razonamiento, y tests.

Si hay batches existentes sin lote de terreno asignado, **no se los asignes
vos** — reportá cuántos son y dejá que el product owner decida. Inferir de
qué parcela vino un batch pasado es exactamente la clase de fabricación que
la disciplina de procedencia prohíbe.

Actualizá `README.md`.
