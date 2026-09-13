# Propuesta UX — la pantalla de Lotes para uso de campo

**Fase 2 del encargo de Daniel (2026-09-13).** Se apoya en
`auditoria-ux-campo.md`, que trae los números. **Nada de esto está implementado:
es lo que se propone, para que Daniel lo apruebe, lo corrija o lo tire.**

Dos respuestas suyas mandan sobre todo lo demás:

- **«Depende del día y del lote»** — no hay un evento dominante. El diseño no
  puede apostar por un botón fijo: la tarjeta ofrece *la siguiente acción de ESE
  lote según su fase*.
- **«A cuál le toca algo ahora»** — la lista es una **cola de trabajo**, no un
  inventario. Se ordena por urgencia.

---

## 0. La dependencia que hay que decidir antes

Ordenar por urgencia exige saber qué es «tarde», y Daniel decidió que eso sale
de la receta. **Hoy la receta no lo guarda.** `ProcessTarget` dice a qué valores
llegar; nada dice cada cuánto medir ni cuánto dura una fase.

Sin ese campo esta propuesta funciona igual, pero **degradada**: la lista se
ordena por «tiempo en fase descendente» en vez de por «se pasó del ritmo», y la
tarjeta enseña las horas sin poder decir si son muchas. Es la diferencia entre
«lleva 14 h» y «lleva 14 h, y la receta dice 12».

**Es una decisión de Daniel, no un detalle de implementación.** Va primero.

---

## 1. Jerarquía — lo que está en curso manda

```
TELÉFONO 390 px                          Hoy → Propuesto
┌─────────────────────────────┐
│ ≡  Lotes          ⟳ 3       │  56 px   nav 186 → 56, con safe-area
├─────────────────────────────┤
│ 🔍 Buscar lote…             │  48 px   NUEVO: antes no había búsqueda
├─────────────────────────────┤
│ ● PE-102          14 h  ⚠️  │
│ Fermentación · Cafelino     │ 112 px   ← primer lote a 104 px, no a 740
│ pH 4.2 · hace 6 h · José    │
│ ┌─────────────────────────┐ │
│ │   Medir pH              │ │  48 px   la acción, EN la tarjeta
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ ● PE-98-C          3 h      │
│ Secado · Cafelino           │ 112 px
│ 18,4 % · hace 1 h · Daniel  │
│ ┌─────────────────────────┐ │
│ │   Medir humedad         │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ ● PE-90-B         26 h  ⚠️  │
│ …                           │
└─────────────────────────────┘
│ ＋ Nuevo lote               │  ← fijo abajo, al alcance del pulgar
└─────────────────────────────┘
```

**Por qué.** El primer lote pasa de **740 px a 104 px**. Los cuatro botones de
arriba se van: «Nuevo lote» baja al tercio inferior porque es frecuente;
«Reporte», «Recetas» y «Exportar» pasan al menú `≡`, porque son de oficina y
compiten por la franja más cara de la pantalla.

**«Operaciones activas» desaparece como bloque.** No es una sección: es el
estado de cada lote, y ya va en su tarjeta. Un bloque que en vacío dice «nada en
curso» y no ofrece acción es peor que no estar.

```
TABLET 1024 px — dos columnas, misma jerarquía
┌───────────────────────────┬───────────────────────────┐
│ 🔍 Buscar lote…           │  Detalle del lote         │
├───────────────────────────┤  seleccionado             │
│ ● PE-102     14 h  ⚠️     │                           │
│ Fermentación · pH 4.2     │  Captura sin salir de     │
│ [ Medir pH ]              │  la lista: en mesa de     │
├───────────────────────────┤  laboratorio la pantalla  │
│ ● PE-98-C     3 h         │  es ancha y el contexto   │
│ Secado · 18,4 %           │  se pierde al navegar     │
└───────────────────────────┴───────────────────────────┘
```

---

## 2. Densidad de la tarjeta — qué decide sin abrir el detalle

| línea | contenido | por qué |
|---|---|---|
| 1 | **código** + tiempo en fase + señal de fuera de protocolo | lo que distingue, primero y en grande |
| 2 | fase · finca | contexto, en secundario |
| 3 | **último dato relevante + cuándo + quién** | es lo que decide si hay que volver a medir |
| 4 | **la siguiente acción**, como botón de 48 px | la tarea, no un enlace al detalle |

**Las hermanas se distinguen por lo que las diferencia.** Hoy nueve tarjetas de
Cafelino repiten `Cafelino — Café` y `Lote 10 — Cafelino` íntegros, en la misma
tipografía que el código. Propuesto: la finca se dice **una vez por grupo**, y
la tarjeta sólo la repite si el grupo mezcla fincas.

**La señal de fuera de protocolo no es sólo color.** Un ⚠️ con texto («12 h de
ritmo»), no un borde rojo: el brief lo prohíbe y bajo sol el color miente.

---

## 3. Legibilidad exterior

- **Texto de dato a 18 px**, no 16. El brief pide un mínimo de 16; un dato que
  se lee a brazo extendido con el sol de frente necesita más.
- **El contraste ya está** — 8,02:1, pasa AAA. No hay que tocarlo.
- **Modo alto contraste** como interruptor en el menú, no automático: la
  luminosidad ambiental no es fiable y un cambio de tema por sorpresa desorienta
  más de lo que ayuda.

---

## 4. Ergonomía de una mano

Las acciones frecuentes viven **en el tercio inferior**: «Nuevo lote» fijo
abajo, y el botón de cada tarjeta dentro de la tarjeta, que es donde está el
pulgar cuando se recorre la lista. Arriba sólo quedan la búsqueda y el menú.

**Todo objetivo táctil sube a 48 px.** El token `--nn-tap` pasa de `2.75rem`
(44 px) a `3rem`. Es **una línea** y afecta a todo el sistema a la vez.

---

## 5. Estados de red — los cuatro, dichos

```
⟳ 3    ámbar     3 registros esperando red
✓      verde     todo sincronizado
⚠ 1    rojo      1 conflicto: alguien más lo cambió antes
◉      gris      capturando sin conexión
```

Van en la cabecera, siempre visibles, y **con número**. El operador no debe
tener que preguntarse si su registro se guardó.

**Y la parte que no es de diseño:** hoy la captura de café **no encola**. El
indicador sería mentira hasta que exista la cola. Esto no es cosmético — es el
hallazgo §3.1 de la auditoría, y condiciona el criterio de aceptación «una
captura iniciada sin conexión sobrevive al cierre de la app».

---

## 6. Filtros y búsqueda

Los nueve chips en tres filas se van. En su lugar, **una línea**:

```
🔍 Buscar lote…        [ Activos ▾ ]
```

- **La búsqueda por código es lo primero** porque el operador llega con el lote
  en la cabeza.
- **Un solo desplegable** con tres opciones —Activos, Todos, Por fase— en vez de
  nueve chips. «Activos» por defecto: es la cola de trabajo.

---

## 7. Captura asistida

- **Foto**: un botón en el formulario de captura, no un paso aparte. Nunca
  bloquea guardar.
- **Voz**: sólo para **observaciones**. Los datos de protocolo se capturan
  estructurados — es lo que el brief pide y lo que hace que después se puedan
  contar.
- **GPS**: automático y silencioso al capturar en campo, sin preguntar.

---

## 8. Vacíos y errores

| situación | hoy | propuesto |
|---|---|---|
| sin lotes activos | «Nothing in progress right now.» | «No hay lotes en proceso. **Recibir cosecha**» |
| sin resultados de búsqueda | — | «Ningún lote con “PE-1”. **Ver todos**» |
| sin permiso | párrafo gris | qué falta y a quién pedirlo |
| error al guardar | mensaje del sistema | «No se guardó: no hay señal. Queda pendiente y se envía solo.» |

---

## 9. Copy

Español de Panamá, verbos activos, **el mismo nombre para la misma acción en
todo el flujo**. Hoy conviven «Crear Lot», «Create Lot» y «Registrar cosecha»
para lo mismo. Propuesto: **«Recibir cosecha»** en todas partes — es lo que
ocurre físicamente.

Y el vocabulario que ya se decidió esta semana: **parcela** (no bloque, no lote)
para el trozo de tierra; **batch** para lo que se procesa como unidad.

---

## Lo que esta propuesta NO resuelve

- **La cola offline de café.** Sin ella, el indicador de red miente.
- **El ritmo en la receta.** Sin él, la urgencia no se calcula.
- **Los códigos tecleados a mano** (`11111`, `1111`). La sugerencia automática
  quedó pendiente en el formulario de cosecha.

Las tres son de datos, no de pantalla, y ninguna se arregla moviendo cajas.
