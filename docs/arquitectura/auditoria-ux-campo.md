# Auditoría UX — la pantalla de Lotes en uso de campo

**Fase 1 del encargo de Daniel (2026-09-13).** Su brief: un operador ya
entrenado, de pie en el patio, con sol directo, una mano, guante mojado, señal
intermitente. No un tablero de oficina.

**Todo lo de aquí está medido, no supuesto.** Lo que no se pudo medir se dice.

---

## Cómo se midió

La pantalla vive detrás de `/login` y no se entra con la cuenta de nadie. La
medición se hizo **en la sesión de Daniel, en su propio navegador**, inyectando
un `<iframe>` de 390×844 en la página: un iframe tiene viewport propio, así que
la media query de móvil sí activa, y al ser del mismo origen lleva su sesión y
su DOM se puede medir.

**El control que hace válida la medida** es `matchMedia('(max-width: 48rem)')
.matches === true`. Sin él estaría midiendo la maqueta de escritorio: el primer
intento, redimensionando la ventana, devolvió `innerWidth: 1440` con la ventana
diciendo 401 — un valor plausible de algo que no era.

Datos reales: 45 lotes, la organización de Daniel.

---

## 1. El primer viewport, a 390×844

```
  0 px  ┌─────────────────────────────┐
        │  navegación                 │  186 px — se parte en TRES filas
186     ├─────────────────────────────┤
        │  «Operator workbench» + h1  │
        │  «Lots» + intro             │
330     ├─────────────────────────────┤
        │  4 botones, en DOS filas    │  102 px
432     ├─────────────────────────────┤
        │  «Active operations»        │
        │  «Nothing in progress»      │  ← sin ninguna acción
        │  «All lots»                 │
        │  9 chips, en TRES filas     │
740     ├─────────────────────────────┤
        │  primer lote: 11111         │   98 px
838     └─────────────────────────────┘
844        fin de la pantalla
```

**El 87,7 % del primer viewport se consume antes del primer lote.** La tarjeta
cabe por **6 píxeles** — y eso es el viewport CSS. En un teléfono real la barra
de direcciones se come entre 60 y 100 px, así que **en la mano no se ve**.

La navegación mide **186 px con sesión** y 138 px en `/login`: con sesión trae
más entradas y envuelve. El dato de 138 habría subestimado el problema en 48 px.

---

## 2. Los once puntos del brief

| # | observación de Daniel | veredicto |
|---|---|---|
| 1 | Cuatro botones grandes antes del contenido | **confirmado** — 4, medidos en vivo |
| 2 | Nueve chips de filtro en dos filas | **confirmado** — 9; y son **tres** filas, no dos |
| 3 | Falta `safe-area-inset-top` | **confirmado** — la cadena no existe en ningún CSS, y la cabecera va a `top: 0` con `padding-top: 0` |
| 4 | «Operaciones activas» vacío no ofrece acción | **confirmado** — pinta un párrafo gris y nada más |
| 5 | La tarjeta no trae lo que decide la acción | **confirmado** — código, fase, proyecto y ubicación. Ni horas en fase, ni última medición, ni quién, ni vencidos |
| 6 | Identificadores de prueba `11111` / `1111` | **confirmado, y no es validación floja** — `lot_code` ES único por organización; son códigos distintos tecleados a mano |
| 7 | Tarjeta con borde de acento sin explicar | **corregido: no es un estado** — es `:hover`, y ninguna de las 6 reglas `:hover` del proyecto está bajo `@media (hover: hover)`, así que en táctil se queda pegado tras tocar |
| 8 | No hay búsqueda por identificador | **confirmado** |
| 9 | No hay indicador de sincronización | **confirmado** — existe, pero sólo en apiario y jornadas de campo |
| 10 | Texto secundario con contraste insuficiente al sol | **corregido: ya estaba arreglado** — `--nn-ink-muted` es `#574a3b`, **8,02:1** sobre el fondo. Pasa AA y AAA |
| 11 | Áreas táctiles por debajo de 48×48 | **real** — el token `--nn-tap` vale `2.75rem` = **44 px**, confirmado renderizado en los chips. Es el mínimo de Apple, no el del brief |

---

## 3. Lo que no estaba en la lista y pesa más

### 3.1 La pantalla abre sin señal; la captura no

`/lots` **sí** está en `OPERATOR_ROUTE_PREFIXES` del service worker, así que la
lista se ve sin cobertura. Pero **ningún formulario de café encola**: la cola
offline existe sólo para apiario (`nectar-apiary-offline`) y jornadas de campo
(`nectar-field-offline`).

Es el peor de los dos mundos: la pantalla abierta promete algo que el botón no
cumple. Un operador sin señal ve su lote, pulsa «registrar» y pierde el dato.

### 3.2 La receta no guarda ritmos, y sin eso no hay urgencia

Daniel decidió que la urgencia sale de la receta. Hoy `ProcessRecipeVersion`
tiene `ProcessTarget` —variable, mínimo, máximo, unidad— y **ningún ritmo**: no
existe «medir cada 6 horas» ni «esta fase dura 36».

**Sin ese dato, «a cuál le toca algo ahora» no se puede calcular.** Sólo se
puede mostrar «lleva 14 h en fermentación» y que el operador juzgue. Cualquier
propuesta que ordene por urgencia depende de añadirlo primero.

### 3.3 Las tarjetas hermanas repiten lo que comparten

Medido en la pantalla real: nueve tarjetas seguidas de Cafelino repiten
`Cafelino — Café` y `Lote 10 — Cafelino` íntegros. Lo que las distingue —el
código y la fase— va en la misma tipografía que lo que comparten.

### 3.4 `prefers-reduced-motion` aparece una vez

Una sola regla en todo el CSS. El brief lo pide explícitamente.

**Lo que sí está bien:** el foco por teclado, resuelto con `:focus-visible`
global sobre `a, button, input, select, textarea, summary, [tabindex]`.

---

## 4. Lo que esta auditoría NO midió

- **Contraste bajo sol real.** 8,02:1 es un número de laboratorio. Nadie ha
  mirado esta pantalla a brazo extendido en el patio.
- **Tiempo real de captura.** «Dos toques» es el criterio del brief; no se
  cronometró ninguna captura real.
- **Tablet.** Sólo se midió 390 px.
