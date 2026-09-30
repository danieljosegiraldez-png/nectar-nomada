# Tablero del beneficio, paso 1 — plan de implementación

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: usar `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans`, tarea por tarea. Los pasos llevan casilla
> (`- [ ]`) para poder marcarlos.

**Objetivo:** que `/beneficio` conteste de un vistazo **qué lote pide atención ahora** y **si cabe
más cereza**, reuniendo los motores que hoy sólo se ven lote por lote.

**Arquitectura:** un módulo **puro** (`tablero.ts`) que recibe hechos y devuelve grupos ordenados;
un módulo de **lecturas** (`datosDelTablero.ts`) que los junta respetando el permiso de quien mira;
y un **cargador extraído** (`entradaDelLote.ts`) que la ficha del lote y el tablero comparten, para
que no puedan discrepar. La página es un componente de servidor, sin JavaScript de cliente.

**Stack:** Next.js 16 App Router, TypeScript, Prisma 7, `next-intl`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-tablero-del-beneficio-design.md` — el plan discute
desde ahí y se lee al lado. **Ruta:** ADR-193.

---

## Alcance de ESTE plan, y lo que queda fuera

El spec cubre más de lo que cabe en un plan. Reparto, siguiendo su propio §7:

| | qué | dónde |
|---|---|---|
| **este plan** | la **cola de atención** (§4.2), la **ocupación** (§4.3 paso 1) y el **bloque de instrumentos** (§4.4), en `/beneficio` arriba del índice | tareas 1–6 |
| plan aparte | las **tres piezas visuales** de §4.5 —línea por etapas, «¿puedo recibir?» con cuándo se libera, y la curva contra la banda en SVG— | el spec las llama añadidas: «la cola sigue siendo el corazón» |
| plan aparte, ya así en el spec | **paso 2**, capacidad declarada con su migración (`capacidadKg`) | §4.3 |

**La dependencia de §7 está satisfecha, medido el 2026-09-29 sobre `origin/main` = `66318b0c`:**
`origin/reposo-en-la-receta` y `origin/wt-traduccion-trilla` tienen **0** commits que `main` no
tenga y **0** archivos que difieran (control al revés: 267), y el reposo ya llegó a la pantalla del
lote (6 menciones en `app/lots/[id]/page.tsx`). Por eso este plan se escribe hoy y no antes.

## Restricciones globales

- **Nombres:** `docs/beneficio/03_public_api.md` es el contrato autoritativo. Todo enum, cadena de
  estado y nombre nuevo se contrasta con él; si hace falta uno que no declara, **se para y se
  pregunta**, no se inventa.
- **Aprobación:** las rúbricas `21_rubrica_veracidad.md` y `22_rubrica_pedagogica.md` pesan igual
  que el funcional. Cada fila del tablero tiene que **poder sostenerse** y tiene que enseñar qué
  hacer, no sólo avisar.
- **Unidades:** masa en kg con 3 decimales, campo `*_kg` (`00_conventions.md` §1).
- **Compuerta por tarea:** `npm run build` en **toda** tarea que toque TypeScript —vitest **no**
  comprueba tipos, y eso ya rompió `main` una vez—. Al final, `npm run verify` y `bash
  scripts/ci.sh`, sin tubería y leyendo el código de salida.
- **Carril de las pruebas:** `scripts/ci.sh` corre **todo lo que NO esté** en
  `scripts/pruebas-por-compuerta.txt`. Una prueba nueva que necesite base **va al grupo
  `base-sembrada`** de ese archivo, o CI la corre sin base y falla con un error de Prisma que no
  parece de permisos. Las herméticas no se tocan: ya corren.
- **Base de datos:** la compartida del 55433 **no se resetea**. Nada de `test:db -- reset`,
  `prisma migrate reset`, `db push --force-reset` ni fijar
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Esta restricción va **en el encargo de cada
  tarea**, no sólo aquí: un subagente sólo ve su propio encargo.
- **Commit antes de mutar.** El arnés de flip restaura desde `HEAD`; mutar sin commitear se lleva
  el trabajo sin commitear.

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `lib/beneficio/entradaDelLote.ts` *(nuevo)* | **cargar** la `EntradaDelLote` de un lote. El tipo ya existe en `desdeElLote.ts:150`; lo que se mueve es el cargador que hoy vive en `app/lots/[id]/page.tsx` líneas **312–345** *(remedido: el spec cita 201–233 sobre `d77db66`, y ese archivo tiene hoy 1433 líneas)* |
| `lib/beneficio/tablero.ts` *(nuevo, puro, sin base)* | `tableroDelBeneficio(...)` → `{ atencion, ocupacion, instrumentos }` |
| `lib/beneficio/datosDelTablero.ts` *(nuevo)* | las lecturas, filtradas por el permiso real |
| `app/beneficio/page.tsx` *(se reescribe)* | el tablero arriba; el índice pasa a la mitad de abajo (ADR-193) |
| `app/beneficio/destinos.ts` *(se modifica)* | se va la cláusula muerta de `pedidos` |
| `scripts/rutas-declaradas.mjs` *(se modifica)* | la razón de `/beneficio` ya no es «índice» |

---

## Tarea 1 — Extraer el cargador de la entrada del lote

Primero porque todo lo demás lo consume, y porque su control positivo es el más barato: la ficha
del lote tiene que pintar **el mismo veredicto** antes y después.

**Archivos:**
- Crear: `lib/beneficio/entradaDelLote.ts`
- Modificar: `app/lots/[id]/page.tsx` (líneas 312–345)
- Prueba: `tests/beneficio/entrada-del-lote.test.ts` *(necesita base → grupo `base-sembrada`)*

**Interfaces:**
- Consume: `faseDelLote`, `listarProcesosDeLote`, `estadosDeInstrumentoPorMedicion`, y los tipos
  `EntradaDelLote` / `MedicionDelLote` de `lib/beneficio/desdeElLote.ts`.
- Produce:
  ```ts
  export async function entradaDelLote(
    userAccountId: string,
    lotId: string,
    ahora?: Date,
  ): Promise<EntradaDelLote | null>;   // null = el lote no tiene fase abierta
  ```

- [ ] **Paso 1: la prueba que fija el contrato.** Un lote sembrado con fermentación abierta y dos
      mediciones devuelve `fase.tipo === "fermentacion"`, el `gradoDeProceso` del proceso abierto, y
      **las dos** mediciones con `estadoDelInstrumento` resuelto.

      ```ts
      it("carga la fase abierta, el grado y las mediciones con el estado de su instrumento", async () => {
        const entrada = await entradaDelLote(operador, loteConFermentacion.id, AHORA);
        expect(entrada?.fase).toEqual({ tipo: "fermentacion", iniciadaEn: INICIO });
        expect(entrada?.gradoDeProceso).toBe("lavado");
        expect(entrada?.mediciones).toHaveLength(2);
        expect(entrada!.mediciones.every((m) => m.estadoDelInstrumento !== undefined)).toBe(true);
      });
      ```

- [ ] **Paso 2: correrla y verla fallar** por módulo inexistente.
      `npx vitest run tests/beneficio/entrada-del-lote.test.ts` → FAIL.

- [ ] **Paso 3: la prueba del reposo**, que es la regla que un movimiento mecánico rompe. En
      reposo **no hay proceso abierto**, así que el grado sale del **último** proceso que corrió.

      ```ts
      it("en reposo toma el grado del ÚLTIMO proceso, no del abierto", async () => {
        const entrada = await entradaDelLote(operador, loteEnReposo.id, AHORA);
        expect(entrada?.fase?.tipo).toBe("reposo");
        expect(entrada?.gradoDeProceso).toBe("lavado");   // sin esto caería por GRADO_SIN_PERFIL
      });
      ```

- [ ] **Paso 4: mover el código.** Cortar las líneas 312–345 de `app/lots/[id]/page.tsx` a la
      función nueva, **sin cambiar una coma de su lógica** —incluidos los dos comentarios que
      explican el mapa vacío de instrumentos y el grado en reposo—, y que la página la llame.

- [ ] **Paso 5: las dos pruebas pasan, y las de antes siguen.**
      `npx vitest run tests/beneficio/` → verde, **incluidas** `desde-el-lote.test.ts` y
      `todo-estado-tiene-texto.test.ts`, que son el control positivo de que el veredicto no cambió.

- [ ] **Paso 6: `npm run build`**, porque vitest no comprueba tipos.

- [ ] **Paso 7: añadir la prueba al grupo `base-sembrada`** de
      `scripts/pruebas-por-compuerta.txt`, y comprobar que **no aparece** en la salida de
      `bash scripts/ci.sh`.

- [ ] **Paso 8: commit.**
      ```bash
      git add lib/beneficio/entradaDelLote.ts "app/lots/[id]/page.tsx" \
        tests/beneficio/entrada-del-lote.test.ts scripts/pruebas-por-compuerta.txt
      git show --stat   # contar: deben ser 4
      git commit -F msg.txt
      ```

---

## Tarea 2 — La cola de atención, pura

**Archivos:**
- Crear: `lib/beneficio/tablero.ts`
- Prueba: `tests/beneficio/tablero.test.ts` *(hermética: NO va al archivo de exclusión)*

**Interfaces:**
- Consume: `VeredictoDeFase`, `SinVeredicto` de `desdeElLote.ts`; `EstadoDeRitmo`,
  `estadoDeRitmo`, `puntajeDeUrgencia`, `RitmoError` de `lib/traceability/ritmo.ts`.
- Produce, y **este tipo lo consumen también las tareas 5 y 6**, así que se define aquí una vez:
  ```ts
  /** Lo que el tablero necesita de un lote. Lo llena `datosDelTablero` (tarea 5). */
  export interface EntradaDeLoteParaTablero {
    readonly lotId: string;
    readonly lotCode: string;
    /** El veredicto ya resuelto, o la razón por la que no lo hay. */
    readonly veredicto: VeredictoDeFase | SinVeredicto;
    /** Cuándo empezó la fase abierta. `null` si no hay fase. */
    readonly faseIniciada: Date | null;
    /** De la versión de receta de su `LotProcess`. `null` = no declarada. */
    readonly expectedHours: number | null;
    /** Una por variable con ritmo, con su última lectura DENTRO de la fase. */
    readonly metas: readonly MetaConRitmo[];
    /** La más reciente de todas sus lecturas, para el orden. `null` si no hay. */
    readonly ultimaLectura: Date | null;
  }

  export type GrupoDeAtencion = "critico" | "listo_para_decidir" | "aviso" | "sin_veredicto" | "en_curso";

  export interface FilaDeAtencion {
    readonly lotId: string;
    readonly lotCode: string;
    readonly grupo: GrupoDeAtencion;
    /** TODOS los motivos, no el que ganó el grupo. */
    readonly motivos: readonly string[];
    readonly ritmo: EstadoDeRitmo | { error: string };
    readonly puntaje: number;
    readonly ultimaLectura: Date | null;
  }

  export function colaDeAtencion(input: {
    readonly lotes: readonly EntradaDeLoteParaTablero[];
    readonly desviacionesAbiertasPorLote: ReadonlyMap<string, number>;
    readonly ahora: Date;
  }): readonly FilaDeAtencion[];
  ```

- [ ] **Paso 1: la prueba del orden de los cinco grupos**, con un lote por grupo mezclados de
      entrada, y afirmando la secuencia exacta.

      ```ts
      it("ordena los cinco grupos: critico, listo, aviso, sin veredicto, en curso", () => {
        const filas = colaDeAtencion({ lotes: DESORDENADOS, desviacionesAbiertasPorLote: new Map(), ahora: AHORA });
        expect(filas.map((f) => f.grupo)).toEqual([
          "critico", "listo_para_decidir", "aviso", "sin_veredicto", "en_curso",
        ]);
      });
      ```

- [ ] **Paso 2: correrla y verla fallar.**

- [ ] **Paso 3: la prueba que el spec pone primera — «Sin veredicto» NUNCA es «En curso».**

      ```ts
      it("un lote sin lecturas va a sin_veredicto, jamás a en_curso", () => {
        const [fila] = colaDeAtencion({ lotes: [SIN_LECTURAS], desviacionesAbiertasPorLote: new Map(), ahora: AHORA });
        expect(fila.grupo).toBe("sin_veredicto");
        expect(fila.motivos).toContain("SIN_LECTURAS");
      });
      ```

- [ ] **Paso 4: la fila lleva TODOS sus motivos.** Un lote con un motor crítico y otro listo para
      decidir: gana `critico` **y** `motivos` trae los dos.

- [ ] **Paso 5: las tres reglas del ritmo, en una prueba cada una.**
      - una lectura debida sube de `en_curso` a `aviso`;
      - `demora: true` **no** cambia de grupo y **sí** ordena por encima de uno en hora;
      - `demora: null` y `demora: false` dan **el mismo puntaje** y **texto distinto**.

- [ ] **Paso 6: orden determinista.** Dos lotes con la misma hora de última lectura y el mismo
      puntaje se ordenan por `lotId`, y la prueba lo afirma con los dos órdenes de entrada.

- [ ] **Paso 7: `RitmoError` no tumba la página.** Un lote con ritmo `≤ 0` sale en
      `sin_veredicto` con `ritmo: { error: "..." }` **y los demás se devuelven normales**.

      ```ts
      it("un lote con ritmo inválido no tumba a los demás", () => {
        const filas = colaDeAtencion({ lotes: [RITMO_ROTO, SANO], desviacionesAbiertasPorLote: new Map(), ahora: AHORA });
        expect(filas).toHaveLength(2);
        expect(filas.find((f) => f.lotId === RITMO_ROTO.lotId)!.grupo).toBe("sin_veredicto");
        expect(filas.find((f) => f.lotId === SANO.lotId)!.grupo).toBe("en_curso");
      });
      ```

- [ ] **Paso 8: la desviación de balance.** Con `CorrectiveAction` no aparece; sin ella el lote
      sube a `aviso`. **Nunca a `critico`:** `balance.ts:507` escribe `severity: "mass_balance"` en
      todas, así que graduar una exigiría recalcularla y queda fuera.

- [ ] **Paso 9: implementar** lo mínimo que haga pasar las nueve.

- [ ] **Paso 10: `npm run build`** y `bash scripts/ci.sh`, comprobando que la prueba nueva **sí**
      aparece en su salida (es hermética y debe correr ahí).

- [ ] **Paso 11: commit, y DESPUÉS los flip-tests** — el arnés restaura desde `HEAD`.
      Los dos de esta tarea, cada uno con las tres cosas de la casa (sha antes y después, que
      compile, y **qué prueba cae por su nombre**):
      1. fundir `sin_veredicto` en `en_curso` → debe caer «un lote sin lecturas va a sin_veredicto»;
      2. pintar `demora: null` como «en hora» → debe caer la prueba del mismo puntaje y texto distinto;
      3. dejar escapar el `RitmoError` → debe caer «un lote con ritmo inválido no tumba a los demás».

---

## Tarea 3 — Ocupación: tanques y camas, con el MISMO clasificador

**Archivos:**
- Modificar: `lib/beneficio/tablero.ts`
- Prueba: `tests/beneficio/tablero.test.ts` *(hermética)*

**Interfaces:**
- Consume: `clasificar`, `resumir`, `HechosDelEquipo`, `Clasificacion`,
  `ResumenDeDisponibilidad` de `lib/equipos/disponibilidad.ts`.
- Produce:
  ```ts
  export interface Ocupacion {
    readonly tanques: ResumenDeDisponibilidad;
    readonly camas: ResumenDeDisponibilidad;
    /** Corridas que no declaran unidad. NO se asignan a ninguna. */
    readonly sinUnidadDeclarada: number;
    /** Unidades con dos corridas abiertas: conflicto de datos, no ocupación. */
    readonly conflictos: readonly string[];
  }
  export function ocupacionDelSitio(input: {
    /** Tanques del sitio, tal cual los da `disponibilidadDeRecipientes`. */
    readonly tanques: readonly HechosDelEquipo[];
    /** Cada `drying_bed` bajo un `drying_facility` del sitio. `condicion` siempre `null`. */
    readonly camas: readonly HechosDelEquipo[];
    /**
     * Las corridas abiertas del sitio. `equipmentId` o `bedLocationId` en `null`
     * con `vesselNote` con texto = unidad NO declarada: no ocupa ninguna.
     */
    readonly corridas: readonly {
      readonly equipmentId: string | null;
      readonly bedLocationId: string | null;
      readonly vesselNote: string | null;
    }[];
  }): Ocupacion;
  ```

- [ ] **Paso 1: la prueba del error caro.** Una corrida que sólo nombra el tanque en `vesselNote`
      cuenta en `sinUnidadDeclarada` y **ningún tanque pasa a ocupado**.

      ```ts
      it("una corrida con el tanque sólo en texto libre no ocupa ningún tanque", () => {
        const o = ocupacionDelSitio({ ...BASE, corridas: [{ vesselNote: "el de la esquina", equipmentId: null }] });
        expect(o.sinUnidadDeclarada).toBe(1);
        expect(o.tanques.enUso).toBe(0);
      });
      ```

- [ ] **Paso 2: correrla y verla fallar.**

- [ ] **Paso 3: tanque libre pero averiado no es libre y sano** — se reusa `clasificar`, no una
      regla paralela, y la prueba lo afirma sobre `libresYSanos`.

- [ ] **Paso 4: dos corridas abiertas en la misma unidad → `conflictos`**, no ocupación doble.

- [ ] **Paso 5: las camas.** Cada `drying_bed` con una `DryingRun` de `endedAt = null` es `enUso`;
      su `condicion` es **`null`** porque las camas no tienen informe de condición.

- [ ] **Paso 6: implementar, `npm run build`, `bash scripts/ci.sh`.**

- [ ] **Paso 7: commit y flip-test:** asignar una corrida de texto libre a una unidad → debe caer
      la prueba del paso 1, por su nombre.

---

## Tarea 4 — El bloque de instrumentos

**Archivos:** `lib/beneficio/tablero.ts`, `tests/beneficio/tablero.test.ts` *(hermética)*

**Interfaces:** consume `EstadoDeVerificacion` de `lib/equipos/verificacion.ts`. Produce
`instrumentosQuePidenAtencion(...)` → sólo `REVISION_VENCIDA`, `VERIFICACION_FALLIDA` y
`SIN_VERIFICACION`.

- [ ] **Paso 1: la prueba.** De cinco equipos —tres instrumentos en esos estados, uno
      `VERIFICADO`, y uno que **no es instrumento**— salen exactamente los tres.
- [ ] **Paso 2: verla fallar.** **Paso 3: implementar.** **Paso 4: `npm run build`.**
- [ ] **Paso 5: commit.**

---

## Tarea 5 — Las lecturas, con el permiso real

**Archivos:**
- Crear: `lib/beneficio/datosDelTablero.ts`
- Prueba: `tests/beneficio/datos-del-tablero.test.ts` *(necesita base → `base-sembrada`)*

**Interfaces:**
```ts
export async function datosDelTablero(userAccountId: string, beneficioId: string): Promise<{
  lotes: readonly EntradaDeLoteParaTablero[];
  tanques: readonly HechosDelEquipo[];
  camas: readonly HechosDelEquipo[];
  instrumentos: readonly { id: string; nombre: string; estado: EstadoDeVerificacion }[];
  desviacionesAbiertasPorLote: ReadonlyMap<string, number>;
}>;
```

- [ ] **Paso 1: la prueba del aislamiento, y va primera por lo que pasó el 2026-09-17.** El
      usuario de la prueba es **Farm Operator de su propio sitio**, no Platform Admin: con ámbito
      de plataforma la función calcula sobre **toda la base compartida** y el recuento se vuelve
      aleatorio según lo que otras sesiones tengan vivo. Con el ámbito acotado el recuento puede
      ser **exacto**.

      ```ts
      it("sólo trae los lotes que el permiso de quien mira alcanza", async () => {
        const d = await datosDelTablero(operadorDeSuSitio, beneficio.id);
        expect(d.lotes).toHaveLength(2);        // exacto, no >=
        expect(d.lotes.map((l) => l.lotId).sort()).toEqual([loteA.id, loteB.id].sort());
      });
      ```

- [ ] **Paso 2: verla fallar.**
- [ ] **Paso 3: la desviación sin `CorrectiveAction` cuenta; con ella, no.**
- [ ] **Paso 4: implementar**, reusando `entradaDelLote` de la tarea 1, `disponibilidadDeRecipientes`
      y `listarEquipos`. **Ninguna consulta nueva de tanques ni de instrumentos.**
- [ ] **Paso 5: limpieza en `afterEach`, nunca al final del cuerpo del `it`** — una aserción que
      falla se salta las líneas de abajo y deja filas TEST en la base compartida. El `afterAll`
      borra todo lo que la corrida pudo dejar, en el orden que respeta los `RESTRICT`.
- [ ] **Paso 6: `npm run build`; añadir al grupo `base-sembrada`; comprobar que NO sale en `ci.sh`.**
- [ ] **Paso 7: commit y flip-test:** devolverle ámbito de plataforma al usuario de la prueba →
      debe caer la prueba del paso 1, y **siempre**, no a veces.

---

## Tarea 6 — La página: el tablero arriba, el índice abajo

**Archivos:**
- Modificar: `app/beneficio/page.tsx`, `app/beneficio/destinos.ts`,
  `scripts/rutas-declaradas.mjs`, `messages/es.json`, `messages/en.json`
- Modificar: `tests/beneficio/destinos-del-indice.test.ts`
- Prueba: `tests/arquitectura/inventario-de-rutas.test.ts` (ya existe; debe seguir verde)

**Interfaces.** El reparto vive **hoy dentro del JSX** de `page.tsx`
(`const operaciones = destinos.filter(...)`), así que una prueba no puede llamarlo. Se extrae a
`destinos.ts` como función pura, que es lo que permite fijarlo:

```ts
/** Reparte los destinos del índice por frecuencia de uso del operador (ADR-193). */
export function repartirDestinos(destinos: ReturnType<typeof destinosDelBeneficio>): {
  readonly operaciones: ReturnType<typeof destinosDelBeneficio>;
  readonly herramientas: ReturnType<typeof destinosDelBeneficio>;
};
```

- [ ] **Paso 1: la prueba del índice, ampliada.** Hoy fija **qué** destinos hay; ahora fija también
      **dónde** caen. Y se va la cláusula muerta: `operaciones` filtraba por `recepcion` **o
      `pedidos`**, y `pedidos` salió del índice con ADR-192 —medido: **0** apariciones como `href`
      en `destinos.ts`, con `recepcion` en 1 como control—, así que «Operaciones» tenía **un**
      enlace y «Herramientas» los otros **ocho**, incluida `/beneficio/secado`, que es la pantalla
      de inicio del operario de secado (Daniel, 2026-09-27).

      ```ts
      it("el secado es operación, no herramienta", () => {
        const { operaciones } = repartirDestinos(destinosDelBeneficio(TODOS_LOS_PERMISOS));
        expect(operaciones.map((d) => d.href)).toContain("/beneficio/secado");
      });
      ```

- [ ] **Paso 2: verla fallar.**

- [ ] **Paso 3: la razón de la ruta.** `scripts/rutas-declaradas.mjs:139` dice de `/beneficio`
      «Índice de la sección Beneficio, sin formularios». Con ADR-193 eso es falso: reescribir la
      razón nombrando el tablero. La ruta **no** se añade; ya está declarada.

- [ ] **Paso 4: pintar.** El tablero arriba —cola, ocupación, instrumentos—, el índice debajo
      repartido por frecuencia de uso, y las rutinas al fondo **plegadas, como están**.
      Componente de servidor; **cero** JavaScript de cliente y **cero** librerías de gráficas.

- [ ] **Paso 5: recalcular el inventario de acceso**, que el spec pide por nombre:
      `node scripts/inventario-de-acceso.mjs`, y commitear las cifras de
      `docs/arquitectura/inventario-de-acceso.md` que cambien.

- [ ] **Paso 6: las compuertas completas, sin tubería y leyendo el código de salida.**
      ```bash
      npm run build > /tmp/b.txt 2>&1; echo "build=$?"
      npm run verify > /tmp/v.txt 2>&1; echo "verify=$?"
      bash scripts/ci.sh > /tmp/c.txt 2>&1; echo "ci=$?"
      ```

- [ ] **Paso 7: verlo en un navegador**, que es lo que ninguna prueba cubre. Un worktree **no
      tiene `.env`**, así que hace falta uno local con `AUTH_SECRET`; y la base tiene que ser una
      que tenga las columnas del caso. **Leer la línea `Restoring from ...Z`**, no el «ready».

- [ ] **Paso 8: contar el stat y commitear.**
      ```bash
      git add <archivo por archivo, nunca -A>
      git diff --cached --stat   # contar: si creías N y salen más, parar
      git commit -F msg.txt
      ```

- [ ] **Paso 9: abrir el PR y contar sus comprobaciones**, que no son las del commit:
      ```bash
      git diff --name-only origin/main...HEAD          # TRES puntos: lo que lleva el PR
      gh pr view <n> -R danieljosegiraldez-png/nectar-nomada \
        --json statusCheckRollup --jq '[.statusCheckRollup[]?] | length'   # un PR sano da 6
      ```
      Y leer **la conclusión de cada una, una por línea**: `cancelled` no es `failure` y una
      ausente no tiene color. **Fusionar es decisión de Daniel.**

---

## Revisión final, antes de pedir la fusión

- [ ] Las dos rúbricas, que pesan igual que el funcional: **veracidad** —cada fila puede
      desarmarse hasta su medición— y **pedagógica** —la fila dice qué hacer y qué pasa si se
      espera, no sólo que algo va mal—.
- [ ] Cada nombre nuevo contrastado con `docs/beneficio/03_public_api.md`.
- [ ] Revisión independiente con Codex (`docs/CODEX_REVIEW.md`,
      `/Applications/ChatGPT.app/Contents/Resources/codex`), que en este proyecto ha encontrado lo
      que doce compuertas verdes no.
- [ ] Anotar la entrega en `SESSION_STATE.md` §2 — **es el entregable, no el diff** — y el pendiente
      de §3 del tablero pasa a decir qué queda: las piezas de §4.5 y el paso 2.
