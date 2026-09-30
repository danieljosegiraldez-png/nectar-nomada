# El tablero del beneficio y la disponibilidad declarada — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que `/beneficio` conteste de un vistazo «¿qué entró hoy?» y «¿cuánto cabe?», y que la capacidad nunca cuente una unidad que nadie ha liberado.

**Architecture:** cuatro piezas independientes. (1) La transición automática a «por limpiar» al cerrar una corrida, reusando la condición de equipo que ya existe. (2) El mismo estado para las camas, que hoy no tienen ninguno. (3) El modelo de lectura del tablero, que **reutiliza** `colaDeSecado` en vez de volver a consultar lo mismo. (4) La pantalla y la reorganización del índice en tres niveles.

**Tech Stack:** Next.js 16 (server components), Prisma 7, vitest 4, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-29-tablero-del-beneficio-y-disponibilidad-design.md`

## Global Constraints

- **Ninguna ruta se mueve.** Cambia por dónde se entra, no dónde vive cada pantalla.
- **Las cifras del tablero van en DÍAS.** Horas sólo en la cola de secado y en la ficha del lote.
- **Todo porcentaje va con su conteo al lado.** Nunca un `%` solo.
- **Nunca una fecha de liberación.** El tablero dice «termina su secado», no «se libera».
- Sin duración declarada en la receta → «sin duración declarada», nunca una fecha inventada.
- Toda escritura probatoria lleva su `AuditEvent` **dentro de la misma transacción** y con `tx`.
- Una prueba nueva que toque la base va al grupo `base-sembrada` de
  `scripts/pruebas-por-compuerta.txt`, o el carril hermético la corre sin base.

## Lo medido antes de planificar, que cambia dos tareas

**Los tanques ya tienen la mitad del trabajo hecho.** `lib/equipos/disponibilidad.ts:59`
(`CONDICIONES_QUE_IMPIDEN`) ya incluye `needs_cleaning`, y `clasificar` ya lo saca de
«libre y sano». El comentario de ese archivo lleva escrito el argumento de Daniel:
«un fermentador sucio no se puede llenar sin lavarlo antes». **No se construye un estado
nuevo para tanques: se dispara el que existe.**

**Las camas no tienen nada.** Son `Location` de tipo `drying_bed` y no reciben informes de
condición — el spec del 2026-09-16 ya lo decía: «Las camas no tienen informe de condición, así
que su `condicion` es `null`».

**La cola de secado ya calcula las áreas y sus unidades libres.** `AreaEnCola` tiene
`locationId`, `nombre`, `unidades` y `libres` con su `desde`. El tablero **la llama**, no
reimplementa la consulta.

## File Structure

| archivo | responsabilidad |
|---|---|
| `prisma/schema.prisma` + migración | `EstadoDeCama`: el estado operativo de una cama y quién lo declaró |
| `lib/beneficio/disponibilidadDeCamas.ts` *(nuevo)* | leer y declarar el estado de una cama |
| `lib/traceability/drying.ts` *(modificar)* | al cerrar la corrida, dejar la unidad «por limpiar» |
| `lib/beneficio/tablero.ts` *(nuevo)* | el modelo de lectura de las dos mitades |
| `app/beneficio/page.tsx` *(modificar)* | el tablero arriba, la navegación en tres niveles |
| `app/beneficio/destinos.ts` *(modificar)* | los tres niveles |

---

### Task 1: La cama tiene estado, y sólo una persona la libera

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_estado_de_cama/migration.sql` (generada)
- Create: `lib/beneficio/disponibilidadDeCamas.ts`
- Test: `tests/beneficio/disponibilidadDeCamas.test.ts`

**Interfaces:**
- Produces: `estadoDeCamas(userAccountId, locationIds): Promise<Map<string, CamaConSuEstado>>` — donde
  `CamaConSuEstado = { estado: EstadoDeCama; declaradoPor: string | null; declaradoAt: Date | null }`.
  **El enum y el registro NO se llaman igual**, o el `import` de uno trae el otro y
  `declararCamaDisponible(userAccountId, { dryingBedLocationId, nota? })`.
- Consumes: `requireLotAccess` no sirve aquí (una cama no es un lote). Se autoriza con el mismo
  permiso que ya gobierna la cama: `location:manage_attributes` sobre su sitio.

- [ ] **Paso 1: la prueba que falla — una cama recién cerrada NO está disponible**

```ts
it("deja la cama por limpiar al cerrar el secado, y sólo una persona la libera", async () => {
  // `secadoAbiertoEnCama` se escribe en este archivo: crea lote, `startDryingRun` con
  // `locationId` = una `Location` de tipo `drying_bed`, y devuelve las dos. El patrón
  // está en `tests/beneficio/colaDeSecado.test.ts`, que ya crea camas y corridas.
  const { run, cama } = await secadoAbiertoEnCama();
  await endDryingRun(operarioId, { dryingRunId: run.id, endedAt: new Date(), /* … */ });

  const antes = await estadoDeCamas(operarioId, [cama.id]);
  expect(antes.get(cama.id)?.estado, "cerrar no libera").toBe("por_limpiar");

  await declararCamaDisponible(operarioId, { dryingBedLocationId: cama.id });

  const despues = await estadoDeCamas(operarioId, [cama.id]);
  expect(despues.get(cama.id)?.estado).toBe("disponible");
  // Quién y cuándo, o el estado no vale como evidencia.
  expect(despues.get(cama.id)?.declaradoPor).toBe(operarioId);
  expect(despues.get(cama.id)?.declaradoAt).toBeInstanceOf(Date);
});
```

- [ ] **Paso 2: correrla y verla fallar** — `npx vitest run tests/beneficio/disponibilidadDeCamas.test.ts`. Esperado: `estadoDeCamas is not a function`.
- [ ] **Paso 3: el esquema.** `enum EstadoDeCama { en_uso por_limpiar disponible }` y modelo
  `EstadoDeCamaDeSecado` con `dryingBedLocationId` **único**, `estado`, `declaradoAt`,
  `declaradoPor`, `nota`. Una fila por cama, que se actualiza; el historial lo da el `AuditEvent`.
- [ ] **Paso 4: la migración**, contra base PRIVADA: `DATABASE_URL=…/nectar_tablero npx prisma migrate dev --name estado_de_cama`. **Nunca contra la compartida.**
- [ ] **Paso 5: el servicio**, con su `AuditEvent` en la misma transacción (`operation: "cama.disponible"`).
- [ ] **Paso 6: ausencia de fila = `disponible`.** Una cama que nunca se usó no está «por limpiar». Esto va en el servicio y en una prueba propia.
- [ ] **Paso 7:** declarar la prueba en `scripts/pruebas-por-compuerta.txt`, grupo `base-sembrada`.
- [ ] **Paso 8:** `npm run verify` y `bash scripts/ci.sh`; commit.

---

### Task 2: Cerrar una corrida deja la unidad por limpiar

**Files:**
- Modify: `lib/traceability/drying.ts` (`cerrarCorridaEnTransaccion`)
- Test: `tests/traceability/drying.test.ts` (añadir al describe del cierre)

**Interfaces:**
- Consumes: el servicio de la tarea 1, y el informe de condición de equipo que ya existe.
- Produces: nada nuevo hacia fuera.

- [ ] **Paso 1: la prueba que falla**, para las dos clases de unidad:

```ts
it("al cerrar, la cama queda por limpiar y el tanque queda needs_cleaning", async () => {
  // El fixture NO se inventa: se copia el de `tests/traceability/drying.test.ts`
  // (`runInProject`, que ya crea lote y corrida) y el de fermentación de
  // `tests/traceability/fermentation.test.ts`. Ambos existen y ya limpian lo suyo.
  expect((await estadoDeCamas(actor, [cama.id])).get(cama.id)?.estado).toBe("por_limpiar");
  const tanque = await prisma.equipment.findUniqueOrThrow({ where: { id: tanqueId } });
  expect(await condicionVigente(tanque.id)).toBe("needs_cleaning");
});
```

- [ ] **Paso 2: verla fallar.**
- [ ] **Paso 3: escribirlo dentro de `cerrarCorridaEnTransaccion`**, que ya recibe `tx`: la
  transición va en la MISMA transacción que el cierre, o un cierre confirmado podría dejar la
  unidad contando como libre.
- [ ] **Paso 4: verla pasar.**
- [ ] **Paso 5: flip-test** — quitar la transición y comprobar que **esa** prueba cae por su nombre, con sha antes/después y «compila».
- [ ] **Paso 6:** compuertas y commit.

---

### Task 3: El modelo de lectura del tablero

**Files:**
- Create: `lib/beneficio/tablero.ts`
- Test: `tests/beneficio/tablero.test.ts`

**Interfaces:**
- Consumes: `colaDeSecado` (áreas y unidades), `estadoDeCamas`, `resumenDeDisponibilidad` de
  `lib/equipos/disponibilidad.ts`, y las jornadas/entregas de recepción.
- Produces:

```ts
export interface Tablero {
  readonly recepcion: {
    readonly jornadasAbiertas: readonly { id: string; finca: string; fecha: Date }[];
    readonly pendientes: readonly { entregaId: string; recolector: string; finca: string; kgFinca: number | null }[];
    readonly recibidoHoy: { readonly netoKg: number; readonly entregas: number; readonly brixMedio: number | null };
  };
  readonly areas: readonly {
    readonly locationId: string; readonly nombre: string;
    readonly bandejas: { readonly ocupadas: number; readonly total: number };
    readonly camas: { readonly enUso: number; readonly porLimpiar: number; readonly total: number };
    readonly piden: number;                       // unidades que piden atención
    readonly terminanManana: number;              // NO «se liberan»
  }[];
  readonly tanques: { readonly enUso: number; readonly total: number; readonly requierenIntervencion: number };
  readonly sinAmbito: boolean;
}
```

- [ ] **Paso 1: la prueba que falla**, con el porcentaje calculado en la vista y no aquí — el
  modelo devuelve **ocupadas y total**, nunca un `%`. Un porcentaje sin su conteo no puede nacer
  si el modelo no lo produce.
- [ ] **Paso 2: verla fallar.**
- [ ] **Paso 3: implementarlo reutilizando `colaDeSecado`.** No se vuelve a consultar
  `DryingRun`: si las dos pantallas divergen, mienten en distinto sentido y nadie lo nota.
- [ ] **Paso 4: la prueba del ámbito** — sin asignaciones, `sinAmbito: true`, y **no** cero
  áreas: son dos hechos distintos.
- [ ] **Paso 5:** declarar en `pruebas-por-compuerta.txt`; compuertas; commit.

---

### Task 4: La pantalla, partida en dos

**Files:**
- Modify: `app/beneficio/page.tsx`
- Modify: `messages/es.json`, `messages/en.json`
- Test: `tests/beneficio/tableroEnPantalla.test.ts` (hermética, lee la fuente)

- [ ] **Paso 1: la prueba del porcentaje acompañado** — guardia de fuente: en la vista, todo
  `%` de ocupación aparece junto a su conteo. Con control positivo del detector, en las dos
  direcciones.
- [ ] **Paso 2: la prueba de «nunca se libera»** — la fuente **no** contiene la clave de
  traducción `seLiberaEn`; sí contiene `terminaSuSecado`. Control positivo sobre la que sí está.
- [ ] **Paso 3: verlas fallar.**
- [ ] **Paso 4: la vista.** Izquierda recepción con «hacer pedido» como acción pequeña dentro;
  derecha las áreas con su conteo y su porcentaje, «por limpiar» **aunque sea cero**, y la línea
  de lo que pide atención con enlace a `/beneficio/secado`.
- [ ] **Paso 5: verlas pasar**, `npm run build` (una vista nueva puede romper el build sin romper
  el typecheck — la regla de `use server`), y commit.

---

### Task 5: El índice en tres niveles

**Files:**
- Modify: `app/beneficio/destinos.ts`
- Modify: `app/beneficio/page.tsx`
- Test: `tests/beneficio/destinos-del-indice.test.ts` (ya existe y ya cuenta las entradas)

- [ ] **Paso 1: la prueba que falla** — cada destino declara su `nivel: "hoy" | "trabajo" | "ajustes"`, y los de configuración —instalaciones, equipos, bandejas— están en `ajustes`.
- [ ] **Paso 2: verla fallar.**
- [ ] **Paso 3: añadir `nivel` a `Destino`** y clasificarlos. **Ninguna ruta cambia de `href`.**
- [ ] **Paso 4: la vista** agrupa por nivel; el bloque de ajustes va al final y detrás de una sola entrada.
- [ ] **Paso 5: comprobar que la regla de permisos sigue en pie** — quien no tiene el permiso no ve la entrada, que es lo que fusionamos en el #501. La prueba de destinos ya lo cubre; se añade el caso del nivel.
- [ ] **Paso 6:** compuertas, `npm run build`, commit, y abrir el PR.

---

## Lo que este plan NO hace

- No construye la cola de atención de lotes ni la curva de `2026-09-16 §4.2/§4.5`.
- No declara capacidad en kg: el porcentaje es por conteo, y así se queda hasta que alguien mida
  las unidades.
- No añade ciclo de limpieza a las bandejas (decisión del diseño, §A).
- No hace portada por rol.
