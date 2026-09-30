# El tablero del beneficio — plan unificado

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: `superpowers:executing-plans` (o
> `subagent-driven-development`), tarea por tarea. **Éste es el plan que se abre primero.**

**Objetivo:** que `/beneficio` conteste de un vistazo **qué pide atención ahora**, **qué entró
hoy** y **cuánto cabe** — y que la capacidad nunca cuente una unidad que nadie ha liberado.

## Por qué este archivo existe

El 2026-09-29 se escribieron **dos planes para la misma ruta**, en dos sesiones distintas:

| plan | de qué diseño sale |
|---|---|
| `2026-09-29-tablero-del-beneficio-paso-1.md` | del **2026-09-16**: la cola de atención, la ocupación, los instrumentos |
| `2026-09-29-tablero-del-beneficio-y-disponibilidad.md` | del **2026-09-29**: disponibilidad declarada, tablero partido, índice en tres niveles |

**Se contradicen en un punto y sólo en uno**, y es el central de la decisión de hoy: el primero
cuenta **libre** una cama cuyo secado ya cerró; Daniel decidió que pasa a **por limpiar** y no
cuenta hasta que una persona la libere. Lo demás se complementa.

Daniel, 2026-09-29: unificar los dos en uno.

**Esto es una COMPOSICIÓN, no un plan autocontenido.** Las tareas que no cambian **se ejecutan
desde su archivo original**, no se copian aquí: dos copias del mismo paso derivan, y entonces
nadie sabe cuál manda. Cada tarea de abajo dice dónde vive.

## Restricciones globales

Valen las de los dos planes. Las que más se olvidan:

- `docs/beneficio/03_public_api.md` es el contrato autoritativo de nombres. Si hace falta uno que
  no declara, **se para y se pregunta**.
- **El tablero habla en DÍAS.** Horas sólo en la cola de secado y en la ficha del lote.
- **Todo porcentaje va con su conteo al lado.** Nunca un `%` solo.
- **Nunca una fecha de liberación.** «Termina su secado», no «se libera».
- Escritura probatoria → su `AuditEvent` en la MISMA transacción, con `tx`.
- Prueba nueva que toque la base → grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
- **Ninguna ruta cambia de `href`.**

## El orden

| # | tarea | de dónde sale |
|---|---|---|
| 1 | extraer el cargador de la entrada del lote | **Tarea 1** de `…-paso-1.md`, tal cual |
| 2 | la cola de atención, pura | **Tarea 2** de `…-paso-1.md`, tal cual |
| 3 | la cama tiene estado, y sólo una persona la libera | **Tarea 1** de `…-y-disponibilidad.md`, tal cual |
| 4 | cerrar una corrida deja la unidad por limpiar | **Tarea 2** de `…-y-disponibilidad.md`, tal cual |
| 5 | **ocupación, con ese estado** | **aquí abajo** — sustituye a la Tarea 3 de `…-paso-1.md`, que queda anulada |
| 6 | el bloque de instrumentos | **Tarea 4** de `…-paso-1.md`, tal cual |
| 7 | las lecturas, con el permiso real | **Tarea 5** de `…-paso-1.md`, más lo de abajo |
| 8 | **la página y el índice** | **aquí abajo** — sustituye a la Tarea 6 de `…-paso-1.md` |

**Por qué este orden.** Las tareas 3 y 4 van antes que la 5 porque la ocupación **necesita** el
estado para poder contarlo. Si se hace la 5 primero, se escribe la regla vieja y hay que
rehacerla — que es exactamente lo que esta unificación evita.

---

## Tarea 5 — Ocupación, con el estado declarado

**Sustituye a la Tarea 3 de `…-paso-1.md`.** De ella **se conserva**: el MISMO clasificador para
tanques y camas, los conflictos de dos corridas abiertas en la misma unidad, y las corridas sin
unidad declarada como «N ocupaciones sin unidad declarada». **Cambia sólo qué cuenta como libre.**

**Archivos:**
- Modificar: `lib/beneficio/tablero.ts`
- Prueba: `tests/beneficio/tablero.test.ts`

**Interfaces:**
- Consume: `clasificar`, `resumir`, `HechosDelEquipo` de `lib/equipos/disponibilidad.ts`;
  `estadoDeCamas` de `lib/beneficio/disponibilidadDeCamas.ts` (tarea 3).
- Produce: por área, `{ camas: { enUso, porLimpiar, disponibles, total }, bandejas: { ocupadas, total } }`
  y `tanques: { enUso, libresYSanos, requierenIntervencion, total }`. **Ningún `%` nace aquí:**
  lo compone la vista con su conteo al lado, y así un porcentaje suelto no puede existir.

- [ ] **Paso 1: la prueba que falla — una cama cerrada NO es capacidad**

```ts
it("una cama con el secado cerrado cuenta por limpiar, no disponible", async () => {
  const { cama } = await camaConSecadoCerrado();   // fixture del archivo, ver tarea 3
  const o = await ocupacionDelArea(actorId, areaId);
  expect(o.camas.porLimpiar).toBe(1);
  expect(o.camas.disponibles).toBe(0);
  // El control que le da sentido: el total no cambia. Si saliera 0 de 0, la prueba
  // pasaría midiendo un área vacía.
  expect(o.camas.total).toBe(1);
});
```

- [ ] **Paso 2: correrla y verla fallar.**
- [ ] **Paso 3: la prueba del tanque**, que usa el mecanismo que YA existe: cerrar la fermentación
      deja `needs_cleaning`, y `clasificar` ya lo saca de `libresYSanos`
      (`lib/equipos/disponibilidad.ts:59`). Afirmar `libresYSanos === 0` y
      `requierenIntervencion === 1`.
- [ ] **Paso 4: implementar**, reutilizando `colaDeSecado` para las áreas y sus unidades en vez de
      reconsultar `DryingRun`: dos consultas del mismo hecho mienten en distinto sentido y nadie
      lo nota.
- [ ] **Paso 5: conservar de la Tarea 3 original** los conflictos de dos corridas abiertas y las
      corridas sin unidad declarada, con sus pruebas.
- [ ] **Paso 6: flip-test** — contar la cama «por limpiar» como disponible; debe caer la prueba
      del paso 1 **por su nombre**, con sha antes/después y «compila».
- [ ] **Paso 7:** `npm run verify`, `bash scripts/ci.sh`, `npm run build`, commit.

---

## Tarea 8 — La página y el índice

**Sustituye a la Tarea 6 de `…-paso-1.md`**, que ponía «el tablero arriba, el índice abajo». La
idea se conserva; cambia **qué** hay arriba y **cómo** queda el índice.

**Archivos:**
- Modificar: `app/beneficio/page.tsx`, `app/beneficio/destinos.ts`
- Modificar: `messages/es.json`, `messages/en.json`
- Prueba: `tests/beneficio/tableroEnPantalla.test.ts` *(hermética)*, y la que ya existe
  `tests/beneficio/destinos-del-indice.test.ts`

- [ ] **Paso 1: los dos guardias de fuente, en rojo primero.** (a) todo `%` de ocupación aparece
      junto a su conteo; (b) la fuente **no** contiene la clave `seLiberaEn` y **sí**
      `terminaSuSecado`. Los dos con control positivo del detector en las dos direcciones — el
      detector que sólo sabe no-encontrar pasa en verde midiendo la nada.
- [ ] **Paso 2: la prueba del índice en tres niveles**, en el archivo que ya cuenta las entradas:
      cada destino declara `nivel: "hoy" | "trabajo" | "ajustes"`, y instalaciones, equipos y
      bandejas están en `ajustes`.
- [ ] **Paso 3: verlas fallar.**
- [ ] **Paso 4: el tablero, partido en dos.** Izquierda, recepción: jornadas abiertas de este
      beneficio, entregas pendientes, lo recibido hoy, y **«hacer pedido» como acción pequeña
      dentro**. Derecha, capacidad por área con su conteo y su porcentaje, «por limpiar» **aunque
      sea cero**, y una línea de lo que pide atención con enlace a `/beneficio/secado`.
- [ ] **Paso 5: debajo, la cola de atención** de la tarea 2 — es el corazón del diseño de
      septiembre y no se pierde: queda bajo el tablero, antes del índice.
- [ ] **Paso 6: el índice agrupado en tres niveles**, con el bloque de ajustes al final y detrás
      de una sola entrada. **Ningún `href` cambia.**
- [ ] **Paso 7:** compuertas, `npm run build` —una vista nueva puede romper el build sin romper el
      typecheck—, commit y abrir el PR.

---

## Lo que este plan NO hace

- Las **tres piezas visuales** de `2026-09-16 §4.5` —línea por etapas, la curva contra la banda—
  siguen fuera, como ya decía el plan original.
- **Capacidad declarada en kg** (`§4.3 paso 2`): fuera. El porcentaje es por conteo.
- **Portada por rol**: fuera.
- **Ciclo de limpieza para bandejas**: fuera, por decisión del diseño del 29.
