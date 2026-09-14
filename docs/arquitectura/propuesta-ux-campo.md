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

## Lo que la Parte I NO resuelve

- **La cola offline de café.** Sin ella, el indicador de red miente.
- **El ritmo en la receta.** Sin él, la urgencia no se calcula.
- **Los códigos tecleados a mano** (`11111`, `1111`). La sugerencia automática
  quedó pendiente en el formulario de cosecha.

Las tres son de datos, no de pantalla, y ninguna se arregla moviendo cajas.


---
---

# Parte II — el recorrido de beneficio

**Añadida el 2026-09-13, por instrucción de Daniel:** *«ese UIX va a ser
principalmente gestionado en campo y en beneficio y/o laboratorio para gestionar
todo esos temas de selección, procesamiento, fermentación, secado, que sea
intuitivo»*.

La Parte I cubre **la lista** — cómo se decide a cuál lote le toca algo. Esto
cubre **lo que pasa después de tocarlo**, que es donde vive el trabajo real y
donde la Parte I no miraba.

## 10. Lo que se midió de esas pantallas

| pantalla | tamaño | qué es |
|---|---|---|
| `/lots` | 223 líneas | la lista — Parte I |
| **`/lots/[id]`** | **995 líneas** | el detalle: **20 secciones y 8 formularios**, en orden fijo |
| `/lots/[id]/process` | 180 líneas | 6 formularios más: abrir, cerrar, intervenir, devolver a secado |
| gráficas en todo el repositorio | **0** | las series se pintan como `<li>` |

Las 20 secciones del detalle, en el orden en que salen hoy: perfil de tueste,
lote de origen, cosecha, fuentes de cosecha, recepción, linaje, rendimiento de
selección, selección, procesamiento (fermentación y secado), mediciones, línea
de tiempo, muestras, sensorial, fotos, tareas e historial.

**El defecto no es que salgan todas. Es POR QUÉ se esconden las que se
esconden.** Medida una por una la condición de render de cada sección: **siete
salen siempre** —lote de origen, procesamiento, mediciones, línea de tiempo,
muestras, sensorial e historial— y **nueve son condicionales**. Pero ninguna de
las nueve condiciones pregunta por la **fase**:

| condición real | secciones |
|---|---|
| tipo de lote (`lotType === "green"`) | perfil de tueste |
| **hay datos** | cosecha, fuentes, recepción, rendimiento, fotos |
| **permisos** | linaje, selección |
| hay proyecto | tareas |

O sea: la pantalla sabe esconder lo **vacío**, y no sabe **priorizar lo que está
pasando ahora**. Un lote en plena fermentación pinta igual «Sensorial» —siempre,
aunque nadie lo haya catado nunca— que la fermentación en curso, y las dos caen
en el mismo rollo de 390 px de ancho. Lo que se necesita ahora está en medio, y
hay que reconocerlo al pasar.

**Esconder lo vacío es higiene; ordenar por fase es diseño.** Lo primero ya está
hecho y está bien. Lo segundo no existe.

## 11. La fase manda — tres zonas, no veinte secciones

El detalle sabe en qué fase está el lote y hoy no lo usa para nada. Propuesto:

```
TELÉFONO 390 px — lote en fermentación
┌─────────────────────────────┐
│ ←  PE-102              ⟳ 3  │
├─────────────────────────────┤
│ AHORA · Fermentación        │  ← la única sección abierta
│ 14 h de 12 · ⚠️ pasó 2 h    │
│                             │
│ pH  4.6 ┈┈┈╮                │  ← la curva, §12
│         4.2 ╰──╮            │
│         3.9    ╰─  hace 6 h │
│ «lleva 12 h sin bajar»      │
│                             │
│ ┌─────────────────────────┐ │
│ │   Medir pH              │ │  48 px
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │   Cerrar fermentación   │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ ▸ Selección    82 % sano    │  ← lo que ya pasó: una línea
│ ▸ Recepción    1.240 kg     │
│ ▸ Cosecha      14 sep       │
├─────────────────────────────┤
│ ▸ Muestras · Fotos · Notas  │
└─────────────────────────────┘
```

- **AHORA** — la fase activa, abierta, con su captura y su curva. **Una sola.**
- **Lo que ya pasó** — plegado, en orden inverso, **una línea con su cifra**.
  Se abre tocando. La cifra es lo que se consulta; el detalle casi nunca.
- **Lo que no aplica no se pinta.** Hoy la página ya esconde lo vacío —y el
  perfil de tueste ya mira el tipo de lote—, así que esto **no es un cambio de
  condiciones: es un cambio de orden**. Lo que falta es que la fase decida qué
  va arriba abierto y qué va abajo plegado.

**Por qué una línea con cifra y no un título.** «Selección» no dice nada;
«Selección · 82 % sano» contesta la pregunta por la que alguien iría a abrirla.
Es la misma regla de la Parte I §2: la tarjeta decide sin abrir el detalle.

## 12. La curva, que hoy no existe en ninguna pantalla

**Medido: no hay un solo componente de gráfica en el repositorio.** La serie de
infestación del apiario —`serieDeInfestacion`, el único precedente— se devuelve
como `PuntoDeLaSerie[]` y se pinta como lista.

Y es justo lo que los tres documentos de `docs/dominio/` piden a gritos. Su
aportación central **no es un umbral: es una derivada.** «pH estancado por
encima de 4.5» y «ΔBx = 0 durante 12 h» no se contestan mirando la última
lectura — se contestan mirando si la curva se mueve.

**Eso es un estado que hoy no sabemos decir, y es el opuesto del que sí.**

| lo que el operador ve | qué significa | qué hace |
|---|---|---|
| «te debe 2 lecturas» | **nadie midió** | ir a medir |
| «la curva lleva 12 h plana» | **alguien midió y la noticia es mala** | intervenir |

Meterlos en un solo número de urgencia los confunde, igual que `demora: null`
contra `false`. La cola de la Parte I los ordena juntos; la tarjeta los dice
distinto.

**Forma propuesta: una línea de chispa y el veredicto en palabras.** Tres o
cuatro puntos y una frase. No un panel de gráficas: en el beneficio se mira de
pie, con las manos mojadas, treinta segundos.

**Y el número solo no decide.** pH 4,6 en la hora 4 es normal; en la hora 20 es
un estancamiento. El veredicto necesita **la lectura, el tiempo en fase y el
ritmo de la receta** — las tres, que es exactamente lo que `estadoDeRitmo` ya
recibe desde hoy.

## 13. Selección — el balance, no el formulario

La guía de subproductos aporta el vocabulario del beneficio: **flotadores,
inmaduros, pintones, vinazos, cáscara y pulpa**. Medido: aquí
`rejection_category` es un **catálogo de variable, no un enum**, así que esas
categorías caben sin tocar el esquema.

Lo que cambia no es la lista de opciones: es la forma de la pantalla.

```
SELECCIÓN — entra 1.240 kg
┌─────────────────────────────┐
│ Sano          1.014 kg  82% │
│ Flotadores       74 kg   6% │
│ Inmaduros        50 kg   4% │
│ Pintones         38 kg   3% │
│ Vinazos          25 kg   2% │
│ Cáscara/pulpa    30 kg   2% │
├─────────────────────────────┤
│ Suma          1.231 kg      │
│ Diferencia        9 kg  0,7%│  ← un dato, no un error
└─────────────────────────────┘
```

**La diferencia se enseña, no se rechaza.** La guía exige conservación exacta
—`abs(suma − total) > 0.05` lanza excepción— y eso aquí bloquearía entradas
legítimas: la cereza pierde agua y una báscula de campo no cierra a 50 gramos.
Este repositorio ya tiene `balance.ts` y `reconciliacionDeCosecha.ts`, que
**reconcilian**. La pantalla enseña el descuadre como cifra para que el operador
decida si es merma o error de tecleo. Rechazar el registro pierde el dato real.

**Cada salida lleva su destino como sugerencia, nunca como decisión.** La guía
propone rutas —flotadores a natural comercial, cáscara a té— y son útiles como
texto de ayuda. **No pueden ser un enrutamiento automático**: asignar categoría
comercial sin que nadie lo apruebe es lo que §32 prohíbe de frente.

## 14. Fermentación y secado — la pantalla de las 5 de la mañana

Desde hoy la receta guarda `everyHours` y `expectedHours`, así que esta pantalla
ya puede decir las tres cosas que el operador necesita y hoy no tiene:

1. **cuánto lleva** y cuánto dice la receta — «14 h de 12»;
2. **qué le toca ahora** y cuándo le tocó por última vez;
3. **si la curva se está moviendo**.

Y una cuarta que es de captura, no de lectura: **la medición se toma aquí, sin
navegar**. Hoy medir exige bajar por el rollo hasta la sección de mediciones.

Para secado vale igual cambiando la variable: humedad en vez de pH, y el
veredicto es «se está secando» o «lleva 8 h sin bajar».

## 15. Laboratorio y beneficio — la misma pantalla, dos densidades

Daniel nombró los tres sitios, y no piden lo mismo.

| | beneficio / campo | laboratorio |
|---|---|---|
| postura | de pie, una mano, guantes | sentado, mesa, dos manos |
| pantalla | teléfono 390 px | tablet o portátil |
| lo que hace | capturar y decidir | corregir, calibrar, muestrear |
| qué ve | **AHORA**, grande | lista + detalle, dos columnas |

La Parte I §1 ya propone las dos columnas para tablet. Se extiende: en
laboratorio, la columna derecha es el **detalle por fases** de §11, y ahí sí
tienen sentido las secciones que en campo se pliegan — correcciones de medición,
muestras, sensorial, calibración.

**Es la misma pantalla con otra densidad, no otra aplicación.** Lo que cambia es
cuánto se pliega, y eso lo decide el ancho.

## 16. Lo que las guías recomiendan y NO debe implementarse tal cual

Las tres guías de `docs/dominio/` son **borrador sin revisar** —decisión P-F—, y
además tienen seis puntos que chocan con reglas de esta casa. Se listan aquí
porque son decisiones **de diseño**, no de código:

| la guía dice | qué haría la pantalla | qué se propone |
|---|---|---|
| «PELIGRO: lave el café de inmediato» | **afirmar** y quitarle el juicio al operador | **preguntar**: «la curva lleva 12 h plana — ¿lo miras?» |
| ventana óptima 4,5–3,8; crítico < 3,5 | **hueco 3,5–3,8 sin definir**, justo donde empieza la sobrefermentación | que el rango salga de la receta, que ya tiene `minValue`/`maxValue` |
| `raise` si el pH sale de 3,0–7,0 | **negarse a registrar** una lectura real de 2,8 | el rango aquí es 0–14: se guarda y se señala |
| `lot_tier: PREMIUM_SPECIALTY` automático | poner una categoría **comercial** sin que nadie la apruebe | sugerencia con botón de aceptar, con su registro |
| `routing_manifest` crea un `CascaraBatch` | inventar una entidad que nadie declaró | ofrecer «¿abrir batch de cáscara?» y esperar |
| «TERMINATION_READY: listo para lavado» | una **recomendación** vestida de estado | decir quién lo dice: «la guía sugiere cerrar» |

**La diferencia entre afirmar y preguntar no es de tono.** La primera deja el
juicio en quien está frente al tanque; la segunda se lo quita. Y quien está
frente al tanque es el que ve el olor, el color y la espuma, que ninguna de
estas tres guías mide.

## 17. Lo que falta decidir, y es de Daniel

1. **P-F — los umbrales.** Mientras las guías sigan sin revisar, la pantalla
   puede tener la forma de §12 pero no sus números. Los números buenos son los
   de la receta, que son suyos.
2. **Qué es «la curva se paró»** para pH y para humedad: cuántas horas sin
   moverse, y cuánto movimiento cuenta como movimiento.
3. **Si el detalle por fases entra entero o por partes.** §11 toca la pantalla
   más grande del sistema.

## 18. Criterios de aceptación de la Parte II

Comprobables, no opinables:

- En un lote en fermentación, la fermentación es la **primera** sección de la
  página y la única abierta; «Sensorial» no aparece antes que ella.
- Desde el detalle de un lote en fermentación se registra un pH **sin navegar**
  a otra ruta.
- La suma de salidas de selección y su diferencia con lo que entró se ven **en
  la misma pantalla** donde se capturan.
- Una serie de tres o más lecturas enseña su tendencia sin abrir otra pantalla.
- Ninguna cadena de texto de la interfaz ordena una acción física al operador.
  Todas preguntan.

## Lo que la Parte II NO resuelve

- **Las tres de la Parte I siguen abiertas** — la cola offline, los códigos a
  mano, y ahora ya no el ritmo, que entró hoy.
- **El umbral de estancamiento no existe todavía.** `estadoDeRitmo` recibe la
  serie pero sólo cuenta intervalos: nadie ha escrito la derivada. Es código, y
  es pequeño, pero necesita el número de Daniel antes.
- **Nada de esto se ha visto en un teléfono en el beneficio.** La auditoría midió
  la lista a 390 px en un navegador. El detalle no se ha recorrido así, y el
  beneficio tiene agua, guantes y prisa que ningún navegador reproduce.
