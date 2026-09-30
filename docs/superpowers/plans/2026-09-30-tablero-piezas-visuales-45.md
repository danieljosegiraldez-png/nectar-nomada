# Las tres piezas visuales del tablero (§4.5) — Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans` para ejecutarlo tarea a tarea. Los pasos llevan
> casilla (`- [ ]`) para ir marcándolos.

**Objetivo:** añadir al tablero de `/beneficio` las tres piezas visuales que §4.5 del diseño
aprueba: la línea por etapas, «cuándo se libera» la próxima unidad, y la curva de un lote contra
la banda de su receta.

**Arquitectura:** las tres siguen el patrón que el paso 1 ya dejó montado: una función **pura** en
`lib/beneficio/` que recibe hechos y devuelve lo que se pinta, un cargador acotado por permisos en
`datosDelTablero.ts`, y la pantalla en `app/beneficio/page.tsx`. Ninguna pieza consulta la base por
su cuenta. La curva es un **SVG de servidor sin JavaScript de cliente**, porque el diseño mide que
el proyecto no trae ninguna librería de gráficas y añadir una sería una decisión aparte.

**Stack:** Next.js 16 (App Router, componentes de servidor), `next-intl`, Prisma 7, vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-16-tablero-del-beneficio-design.md`, §4.5. Aprobado por
Daniel el 2026-09-18 con dos bocetos vistos en la conversación.

---

## La medición que el diseño exigía ANTES del plan

§4.5 dice: *«Lo que falta medir antes del plan: la selección existe en el modelo, pero **no se ha
comprobado** que la recepción y la flotación se registren como etapas propias.»* Medido contra
`prisma/schema.prisma` el 2026-09-30, y **el diseño se equivocaba en una de las dos**:

| etapa | registro | consecuencia para la pieza 1 |
|---|---|---|
| recepción | **`RecepcionDeCereza`** — modelo propio | cuenta de verdad; el diseño temía de más |
| flotación | **ninguno.** Las dos únicas menciones de «flote» en el esquema son `PedidoDeCereza.maxFlotesPct` (un **umbral** del pedido) y `VeredictoDeCalidadDePedido.flotesKg` (parte de un **veredicto**, no un acto registrado por lote) | **dice «sin registro de esta etapa», nunca un cero** |
| selección | **`LotTransformation` con `transformationType: "selection"`** (`lib/traceability/selection.ts:142`, y `getSelectionOutturn` lo exige en la 189). No tiene modelo propio | cuenta filtrando por ese tipo, no por una tabla |
| proceso | `LotProcess` | cuenta |
| secado | `DryingRun` | cuenta |
| almacén | `StorageAssignment` (`lotId` + `locationId`) | cuenta |

**Un cero y un «sin registro» no son lo mismo, y ésa es la pieza pedagógica entera** (rúbrica 22):
un cero dice «no hay nada ahí»; la flotación no puede decir eso porque nadie lo anota. Si la
columna pinta `0`, el operario lee que no hay café flotando cuando lo que pasa es que el sistema no
lo sabe.

---

## Restricciones globales

- **La base compartida del 55433 NO se resetea.** Nada de `test:db -- reset`, `prisma migrate
  reset`, `db push --force-reset` ni `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Si hace falta
  una base propia, se crea aparte con el prefijo `nectar_test` y la colación de producción:
  `CREATE DATABASE nectar_test_<asunto> TEMPLATE template0 ENCODING UTF8 LOCALE_PROVIDER builtin
  BUILTIN_LOCALE 'C.UTF-8';` **Esta restricción va en el encargo de CADA tarea**: un subagente sólo
  ve la suya.
- **Sin librería de gráficas.** Medido sobre `main` el 2026-09-18 y confirmado el 2026-09-30: el
  único `<svg>` de `app/` es `app/sensory/herramientas/ruedas/RuedaInteractiva.tsx` (control: 205
  archivos de `app/` contienen `<div>`, así que el grep mide). Añadir una librería es otra decisión.
- **`npm run build` en TODA tarea que toque TypeScript.** `vitest` no comprueba tipos y eso ya
  rompió `main`.
- **Carril de pruebas:** `scripts/ci.sh` corre todo lo que **no** esté en
  `scripts/pruebas-por-compuerta.txt`. Las pruebas **puras** de este plan son herméticas y **no**
  van a ese archivo; las que toquen base sí, al grupo `base-sembrada`.
- **El `afterAll` de una prueba con base envuelve CADA `deleteMany` en su propio `try`.** Es una
  cadena: el 2026-09-30 el primero que lanzó abandonó los nueve siguientes y dejó 22 filas TEST con
  la suite en verde. El aviso se imprime con `process.stdout.write`, no `console.log`.
- **El usuario de cada prueba con base va acotado a SU sitio, nunca Platform Admin**: con ámbito de
  plataforma la visibilidad es `all` y los recuentos dependen de lo que otras sesiones tengan vivo.
- **Commitear ANTES de mutar**: el arnés de flip restaura desde `HEAD`.
- **Un flip-test imprime tres cosas**: sha antes y después (distintos o abortar), si el archivo
  **compila**, y qué prueba cae **por su nombre**. Y si no discrimina, se dice — no se firma.
- **Nunca `git add -A`**; archivo por archivo, y se cuenta el stat antes de commitear.

---

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `lib/beneficio/lineaDeEtapas.ts` *(nuevo)* | **pura.** Recibe los recuentos por etapa y devuelve las seis casillas, distinguiendo `sin_registro` de `0` |
| `lib/beneficio/liberacionDeUnidad.ts` *(nuevo)* | **pura.** Cuándo se libera cada corrida abierta según `expectedHours`, y qué decir cuando no hay duración declarada |
| `lib/beneficio/curvaDeLote.ts` *(nuevo)* | **pura.** Puntos + banda → coordenadas SVG. Sin JSX: devuelve números |
| `lib/beneficio/datosDelTablero.ts` *(modificar)* | los tres cargadores acotados por permiso, junto a los que ya hay |
| `app/components/beneficio/LineaDeEtapas.tsx` *(nuevo)* | la línea, dos filas de tres en móvil |
| `app/components/beneficio/CurvaDeLote.tsx` *(nuevo)* | el `<svg>` de servidor |
| `app/beneficio/page.tsx` *(modificar)* | acomoda las tres según el ancho |
| `messages/es.json`, `messages/en.json` *(modificar)* | los textos, en los dos idiomas |
| `docs/arquitectura/inventario-de-acceso.md` + su allowlist *(modificar)* | en cuanto aterrice un archivo con acceso crudo, **no al final** |

**Por qué tres archivos puros y no uno:** cada pieza tiene una regla propia y un fallo propio que
cazar. Juntarlas haría un archivo que nadie puede sostener en la cabeza, y los flip-tests dejarían
de señalar cuál regla se rompió.

---

## Tarea 1 — La línea por etapas, y el «sin registro» que no es un cero

**Archivos:** `lib/beneficio/lineaDeEtapas.ts` *(nuevo)*,
`tests/beneficio/linea-de-etapas.test.ts` *(nuevo)*

**Interfaces — produce:**
```ts
export type EstadoDeEtapa =
  | { readonly tipo: "cuenta"; readonly lotes: number; readonly pidenDecision: number }
  | { readonly tipo: "sin_registro" };

export interface Etapa {
  readonly clave: "recepcion" | "flotacion" | "seleccion" | "proceso" | "secado" | "almacen";
  readonly estado: EstadoDeEtapa;
}

export function lineaDeEtapas(input: {
  readonly recepcion: number;
  readonly seleccion: number;
  readonly proceso: number;
  readonly secado: number;
  readonly almacen: number;
  /** Lotes que piden decisión, por clave de etapa. Sale de `colaDeAtencion`. */
  readonly pidenDecision: Readonly<Record<string, number>>;
}): readonly Etapa[];
```
- **`flotacion` no se recibe**: la función la devuelve siempre como `sin_registro`, porque el
  esquema no la registra. Que no se pueda pasar por parámetro es a propósito — así nadie le mete
  un cero sin darse cuenta de lo que significa.

- [ ] **Paso 1: la prueba de que `sin_registro` NO es un cero**, que es la regla que un refactor
      mecánico aplasta:

      ```ts
      it("la flotación dice «sin registro», nunca 0: nadie la anota", () => {
        const etapas = lineaDeEtapas({
          recepcion: 0, seleccion: 0, proceso: 0, secado: 0, almacen: 0, pidenDecision: {},
        });
        const flot = etapas.find((e) => e.clave === "flotacion")!;
        expect(flot.estado.tipo).toBe("sin_registro");
        // Y el control que hace que esto signifique algo: una etapa que SÍ se registra y está
        // vacía dice `cuenta` con 0. Sin él, «sin_registro» podría ser lo que devuelve siempre.
        const rec = etapas.find((e) => e.clave === "recepcion")!;
        expect(rec.estado).toEqual({ tipo: "cuenta", lotes: 0, pidenDecision: 0 });
      });
      ```

- [ ] **Paso 2: verla fallar.** Correr `npx vitest run tests/beneficio/linea-de-etapas.test.ts`.
      Se espera `Cannot find module '../../lib/beneficio/lineaDeEtapas'`.
      **Antes de leer el rojo, exportar `DATABASE_URL`**: sin él `tests/setup.ts` corta con «Refusing
      to run against a remote database» y vitest lo imprime como **«no tests»**, que en una salida
      filtrada se lee igual que «no falló».
      ```bash
      export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
      ```

- [ ] **Paso 3: la prueba del orden**, que el diseño fija y la pantalla no debe poder reordenar:

      ```ts
      it("las seis van en el orden del proceso, no alfabético", () => {
        const etapas = lineaDeEtapas({ recepcion: 1, seleccion: 1, proceso: 1, secado: 1, almacen: 1, pidenDecision: {} });
        expect(etapas.map((e) => e.clave)).toEqual([
          "recepcion", "flotacion", "seleccion", "proceso", "secado", "almacen",
        ]);
      });
      ```

- [ ] **Paso 4: la prueba de «sólo se colorea lo que pide atención»** (§4.5: *«Una etapa sólo se
      colorea cuando algo en ella pide atención»*). La función no pinta, pero sí dice cuántos:

      ```ts
      it("pidenDecision viaja por etapa, y 0 donde no hay nada que decidir", () => {
        const etapas = lineaDeEtapas({
          recepcion: 5, seleccion: 2, proceso: 3, secado: 1, almacen: 0,
          pidenDecision: { proceso: 2 },
        });
        const porClave = new Map(etapas.map((e) => [e.clave, e.estado]));
        expect(porClave.get("proceso")).toEqual({ tipo: "cuenta", lotes: 3, pidenDecision: 2 });
        expect(porClave.get("secado")).toEqual({ tipo: "cuenta", lotes: 1, pidenDecision: 0 });
      });
      ```

- [ ] **Paso 5: implementar.** Mínimo, sin base:

      ```ts
      const ORDEN = ["recepcion", "flotacion", "seleccion", "proceso", "secado", "almacen"] as const;

      export function lineaDeEtapas(input: { /* … */ }): readonly Etapa[] {
        const cuentas: Record<string, number> = {
          recepcion: input.recepcion, seleccion: input.seleccion,
          proceso: input.proceso, secado: input.secado, almacen: input.almacen,
        };
        return ORDEN.map((clave) =>
          clave === "flotacion"
            ? { clave, estado: { tipo: "sin_registro" as const } }
            : {
                clave,
                estado: {
                  tipo: "cuenta" as const,
                  lotes: cuentas[clave] ?? 0,
                  pidenDecision: input.pidenDecision[clave] ?? 0,
                },
              },
        );
      }
      ```

- [ ] **Paso 6: `npx vitest run tests/beneficio/linea-de-etapas.test.ts`** → las tres en verde.
      **Paso 7: `npx tsc --noEmit`** → 0. **Paso 8: `npm run build`** → 0.

- [ ] **Paso 9: commit**, contando el stat antes:
      ```bash
      git add lib/beneficio/lineaDeEtapas.ts tests/beneficio/linea-de-etapas.test.ts
      git diff --cached --stat   # contar: deben ser 2
      git commit -F msg.txt
      ```

- [ ] **Paso 10: DESPUÉS del commit, dos flip-tests**, cada uno con sus tres señales:
      1. devolver `{ tipo: "cuenta", lotes: 0, pidenDecision: 0 }` para `flotacion` → debe caer
         «la flotación dice «sin registro», nunca 0», **por su nombre**;
      2. ordenar `ORDEN` alfabéticamente → debe caer «las seis van en el orden del proceso».

      Si alguno **no** discrimina, se dice y se arregla la prueba, no se firma.

---

## Tarea 2 — «Cuándo se libera», y nunca una hora inventada

**Archivos:** `lib/beneficio/liberacionDeUnidad.ts` *(nuevo)*,
`tests/beneficio/liberacion-de-unidad.test.ts` *(nuevo)*

**Interfaces — consume** de `lib/beneficio/tablero.ts`, que **ya existe**: `CorridaAbierta`
(`equipmentId`, `bedLocationId`, `vesselNote`) y `Ocupacion`. **Produce:**
```ts
export type Liberacion =
  | { readonly tipo: "a_las"; readonly cuando: Date }
  | { readonly tipo: "sin_duracion_declarada" };

export interface CorridaConDuracion {
  readonly equipmentId: string | null;
  readonly bedLocationId: string | null;
  readonly iniciadaEn: Date;
  /** De la versión de receta de su `LotProcess`. `null` = la receta no lo declara. */
  readonly expectedHours: number | null;
}

/** La PRÓXIMA en liberarse, o `null` si no hay ninguna corrida abierta. */
export function proximaLiberacion(input: {
  readonly corridas: readonly CorridaConDuracion[];
  readonly ahora: Date;
}): Liberacion | null;
```

- [ ] **Paso 1: la prueba de «nunca una hora inventada»**, que es la frase literal del diseño
      (*«Sin duración declarada dice "sin duración declarada", **nunca una hora inventada**»*):

      ```ts
      const AHORA = new Date("2026-03-10T12:00:00.000Z");

      it("sin expectedHours dice «sin duración declarada», no una hora", () => {
        const r = proximaLiberacion({
          ahora: AHORA,
          corridas: [{ equipmentId: "t1", bedLocationId: null, iniciadaEn: AHORA, expectedHours: null }],
        });
        expect(r).toEqual({ tipo: "sin_duracion_declarada" });
      });
      ```

- [ ] **Paso 2: verla fallar** (módulo inexistente), con el `DATABASE_URL` exportado como en la
      Tarea 1 paso 2.

- [ ] **Paso 3: la prueba de que elige la PRÓXIMA, no la primera de la lista:**

      ```ts
      it("elige la que se libera antes, no la primera de la lista", () => {
        const r = proximaLiberacion({
          ahora: AHORA,
          corridas: [
            { equipmentId: "tarde", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 48 },
            { equipmentId: "pronto", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 6 },
          ],
        });
        expect(r).toEqual({ tipo: "a_las", cuando: new Date("2026-03-10T18:00:00.000Z") });
      });
      ```

- [ ] **Paso 4: la prueba de la MEZCLA**, que es donde un atajo se equivoca: si una corrida no
      declara duración, **no se ignora en silencio** — pero tampoco tapa a las que sí la declaran.
      La regla del diseño es que la pantalla diga las dos cosas, así que la función devuelve la
      próxima **conocida** y el bloque de «sin duración» ya lo cuenta `Ocupacion`:

      ```ts
      it("una sin duración no borra la próxima conocida", () => {
        const r = proximaLiberacion({
          ahora: AHORA,
          corridas: [
            { equipmentId: "muda", bedLocationId: null, iniciadaEn: AHORA, expectedHours: null },
            { equipmentId: "habla", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 6 },
          ],
        });
        expect(r).toEqual({ tipo: "a_las", cuando: new Date("2026-03-10T18:00:00.000Z") });
      });
      ```

- [ ] **Paso 5: la prueba de la lista vacía** — `null`, y **no** «sin duración declarada»: no es lo
      mismo «no hay nada ocupado» que «hay algo y no sé cuándo acaba».

      ```ts
      it("sin corridas abiertas devuelve null, que no es «sin duración»", () => {
        expect(proximaLiberacion({ ahora: AHORA, corridas: [] })).toBeNull();
      });
      ```

- [ ] **Paso 6: implementar. Paso 7: `npx tsc --noEmit` y `npm run build`, los dos 0.
      Paso 8: commit contando el stat (deben ser 2).**

- [ ] **Paso 9: DESPUÉS, dos flip-tests:**
      1. devolver `{ tipo: "a_las", cuando: input.ahora }` cuando `expectedHours` es `null` →
         debe caer «sin expectedHours dice «sin duración declarada»»;
      2. devolver la primera corrida en vez de la mínima → debe caer «elige la que se libera antes».

---

## Tarea 3 — La curva contra su banda, y la banda sale de un dato

**Archivos:** `lib/beneficio/curvaDeLote.ts` *(nuevo)*,
`tests/beneficio/curva-de-lote.test.ts` *(nuevo)*

**Interfaces — produce:**
```ts
export interface PuntoDeCurva { readonly x: number; readonly y: number }

export type Banda =
  | { readonly tipo: "banda"; readonly yMin: number; readonly yMax: number; readonly yObjetivo: number | null }
  | { readonly tipo: "sin_objetivo_declarado" };

export interface Curva {
  readonly puntos: readonly PuntoDeCurva[];
  readonly banda: Banda;
  readonly ancho: number;
  readonly alto: number;
}

export function curvaDeLote(input: {
  readonly lecturas: readonly { readonly occurredAt: Date; readonly value: number }[];
  /** De `ProcessTarget`. Los tres son anulables en el esquema. */
  readonly objetivo: { readonly minValue: number | null; readonly maxValue: number | null; readonly targetValue: number | null } | null;
  readonly ancho: number;
  readonly alto: number;
}): Curva;
```

- [ ] **Paso 1: la prueba de que la banda sale de un DATO**, que es la frase del diseño (*«**La
      banda sale de un dato**, no de un dibujo: sin `ProcessTarget` para esa variable no se pinta
      banda y se dice»*):

      ```ts
      const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00.000Z`);

      it("sin ProcessTarget no hay banda, y lo dice", () => {
        const c = curvaDeLote({
          lecturas: [{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(14), value: 4.2 }],
          objetivo: null, ancho: 300, alto: 120,
        });
        expect(c.banda).toEqual({ tipo: "sin_objetivo_declarado" });
        // Control: los puntos SÍ se dibujan. Sin él, «sin banda» podría ser «no dibujé nada».
        expect(c.puntos).toHaveLength(2);
      });
      ```

- [ ] **Paso 2: verla fallar**, con `DATABASE_URL` exportado.

- [ ] **Paso 3: la prueba de que una banda a medias TAMPOCO se inventa.** `minValue`, `maxValue` y
      `targetValue` son los tres anulables en `prisma/schema.prisma`, así que puede llegar un
      objetivo sin rango:

      ```ts
      it("un objetivo sin min ni max no dibuja banda: media banda es una banda inventada", () => {
        const c = curvaDeLote({
          lecturas: [{ occurredAt: t(10), value: 4.8 }],
          objetivo: { minValue: null, maxValue: null, targetValue: 4.5 },
          ancho: 300, alto: 120,
        });
        expect(c.banda).toEqual({ tipo: "sin_objetivo_declarado" });
      });
      ```

- [ ] **Paso 4: la prueba de las coordenadas**, con números a mano para que un error de escala se
      vea. Dos lecturas a 10:00 y 14:00, banda 4,0–5,0, lienzo 300×120:

      ```ts
      it("escala el tiempo al ancho y el valor al alto, con el eje Y al derecho", () => {
        const c = curvaDeLote({
          lecturas: [{ occurredAt: t(10), value: 5.0 }, { occurredAt: t(14), value: 4.0 }],
          objetivo: { minValue: 4.0, maxValue: 5.0, targetValue: 4.5 },
          ancho: 300, alto: 120,
        });
        expect(c.puntos[0]).toEqual({ x: 0, y: 0 });     // la primera lectura, valor máximo → arriba
        expect(c.puntos[1]).toEqual({ x: 300, y: 120 }); // la última, valor mínimo → abajo
        // En SVG la Y crece hacia ABAJO. Si esta prueba no existiera, la curva saldría del revés
        // y seguiría pareciendo una curva.
      });
      ```

- [ ] **Paso 5: la prueba de una sola lectura**, que es el caso donde una división entre cero
      produce `NaN` — y **`NaN` comparado con cualquier cosa da `false`**, así que un `expect`
      escrito a la ligera pasaría:

      ```ts
      it("una sola lectura no produce NaN", () => {
        const c = curvaDeLote({
          lecturas: [{ occurredAt: t(10), value: 4.5 }],
          objetivo: { minValue: 4.0, maxValue: 5.0, targetValue: 4.5 },
          ancho: 300, alto: 120,
        });
        // Afirmar que NO es NaN ANTES de comparar: `NaN > x` es false y halaga cualquier hipótesis.
        expect(Number.isNaN(c.puntos[0]!.x)).toBe(false);
        expect(Number.isNaN(c.puntos[0]!.y)).toBe(false);
      });
      ```

- [ ] **Paso 6: implementar. Paso 7: `npx tsc --noEmit` y `npm run build`, los dos 0.
      Paso 8: commit contando el stat (deben ser 2).**

- [ ] **Paso 9: DESPUÉS, tres flip-tests:**
      1. dibujar banda con `minValue` nulo tomando `targetValue` como centro → debe caer «un
         objetivo sin min ni max no dibuja banda»;
      2. quitar la inversión del eje Y → debe caer «escala el tiempo al ancho…»;
      3. dividir por `(n - 1)` sin proteger el caso `n === 1` → debe caer «una sola lectura no
         produce NaN». **Si este tercero no cae, la prueba está mal escrita**: comprobar que el
         `expect` afirma sobre `Number.isNaN` y no una comparación.

---

## Tarea 4 — Los cargadores, acotados por permiso

**Archivos:** `lib/beneficio/datosDelTablero.ts` *(modificar)*,
`tests/beneficio/datos-del-tablero.test.ts` *(modificar)*,
`docs/arquitectura/acceso-a-datos.allowlist.json` *(modificar si el guardia lo pide)*,
`docs/arquitectura/inventario-de-acceso.md` *(modificar)*,
`scripts/pruebas-por-compuerta.txt` *(modificar)*

**Interfaces — consume** las tres funciones puras de las tareas 1–3. **Produce:** `DatosDelTablero`
gana tres campos —`etapas`, `liberacion`, `curva`— con los tipos que ya devuelven aquéllas.

- [ ] **Paso 1: la prueba del ámbito**, con un usuario **acotado a su sitio, nunca Platform Admin**:
      los recuentos por etapa sólo cuentan lotes que ese usuario ve. Su control positivo es el mismo
      recuento con un lote suyo añadido — **no** repetir la consulta.

      ```ts
      it("los recuentos por etapa sólo cuentan lo que ese usuario ve", async () => {
        const antes = (await datosDelTablero(operarioDeMiSitio, miBeneficio)).etapas;
        const recepcion = antes.find((e) => e.clave === "recepcion")!.estado;
        expect(recepcion.tipo).toBe("cuenta");
        // Control positivo: con una recepción MÍA más, el número sube en uno.
        await crearRecepcionDePrueba();
        const despues = (await datosDelTablero(operarioDeMiSitio, miBeneficio)).etapas;
        const r2 = despues.find((e) => e.clave === "recepcion")!.estado;
        expect(r2).toEqual({ ...recepcion, lotes: (recepcion as { lotes: number }).lotes + 1 });
      });
      ```

- [ ] **Paso 2: verla fallar. Paso 3: implementar los tres cargadores**, cada uno reusando el
      filtro de visibilidad que el archivo ya aplica (`resolveLotVisibility` +
      `lotWhereFromVisibility`). **`null` de visibilidad significa «no ves ninguno», NO «no hay
      ninguno»** — y esa diferencia tiene que llegar a la pantalla.

- [ ] **Paso 4: la prueba de `sinAmbito`**: un usuario sin ámbito no ve «0 lotes», ve «no ves
      ninguno todavía». Es la rúbrica 22 otra vez, y ya costó un malentendido en la cola de secado.

- [ ] **Paso 5: añadir la prueba al grupo `base-sembrada`** en `scripts/pruebas-por-compuerta.txt`
      —necesita base—, y **comprobarlo por mecanismo**, no grepeando el log: `ci.sh` corre «todo lo
      que NO esté» en ese archivo, así que basta ver la línea ahí y que la cuenta de archivos del
      carril con base suba en uno. **El log de `ci-con-base.sh` no nombra los archivos que pasan**,
      así que un grep por nombre ahí devuelve 0 y su control negativo también: no mide nada.

- [ ] **Paso 6: el inventario, AQUÍ y no al final.** El guardia `acceso-a-datos` salta en cuanto
      aterriza un archivo con acceso crudo:
      ```bash
      node scripts/inventario-de-acceso.mjs | head -1   # da «N operaciones … en M archivos»
      ```
      Llevar esas cifras a `docs/arquitectura/inventario-de-acceso.md` con su párrafo, y añadir la
      entrada a la allowlist **con su razón**. Lo confirma
      `tests/arquitectura/cifras-del-inventario.test.ts`, no la aritmética de quien lo escribe.

- [ ] **Paso 7: `npm run build` y commit contando el stat.**

---

## Tarea 5 — La pantalla, y cómo se acomodan al celular

**Archivos:** `app/components/beneficio/LineaDeEtapas.tsx` *(nuevo)*,
`app/components/beneficio/CurvaDeLote.tsx` *(nuevo)*, `app/beneficio/page.tsx` *(modificar)*,
`messages/es.json` y `messages/en.json` *(modificar)*

- [ ] **Paso 1: `LineaDeEtapas.tsx`.** Componente de servidor. Una etapa `sin_registro` **dice
      «sin registro de esta etapa»**, con su texto propio, y **no se colorea** — no es una alarma,
      es una ausencia. Una etapa con `pidenDecision > 0` sí se colorea; con `0`, no (§4.5).

- [ ] **Paso 2: `CurvaDeLote.tsx`.** Un `<svg>` de servidor, **sin `"use client"`** y sin ninguna
      librería. Con `banda.tipo === "sin_objetivo_declarado"` se dibujan los puntos y se escribe
      «esta variable no tiene rango declarado en la receta» — el diseño exige decirlo, no callarlo.

- [ ] **Paso 3: el acomodo, que es una decisión de Daniel y no una preferencia.** Del diseño:
      - **celular**: la línea en **dos filas de tres**; debajo «qué hacer ahora» (la cola de §4.2);
        debajo «¿puedo recibir?» reducido a **dos números** y cuándo se libera el próximo tanque.
        **La curva sólo al tocar un lote.**
      - **pantalla ancha**: las tres juntas, con el mapa de tanques y camas completo.

      El porqué va en un comentario del componente: *a unos 375 px, seis etapas en fila dejan unos
      55 px por etapa —se leen números, no etiquetas— y la curva comprimida pierde la banda que la
      hace útil.*

- [ ] **Paso 4: los textos en los DOS idiomas**, con su control de paridad, que se lee ANTES del
      resultado:
      ```bash
      node -e 'const a=require("./messages/es.json"),b=require("./messages/en.json");
        const A=new Set(Object.keys(a.SeccionBeneficio||{})),B=new Set(Object.keys(b.SeccionBeneficio||{}));
        console.log("es:",A.size,"en:",B.size,"| es-en:",[...A].filter(k=>!B.has(k)),"en-es:",[...B].filter(k=>!A.has(k)));'
      ```
      **Si un texto lleva una cuenta, va con plural ICU**: «1 ocupaciones» salió así el 2026-09-30,
      y el arreglo **no se ve hasta reiniciar el dev server** porque los mensajes quedan cacheados
      en el grafo de módulos.

- [ ] **Paso 5: declarar nada nuevo en `scripts/rutas-declaradas.mjs`** — esta tarea no añade ruta,
      sólo componentes. **Comprobarlo, no suponerlo:** `npm run check:rutas` debe salir 0.

- [ ] **Paso 6: las compuertas completas, sin tubería y leyendo el código de salida:**
      ```bash
      npm run build  > /tmp/b.txt 2>&1; echo "build=$?"
      npm run verify > /tmp/v.txt 2>&1; echo "verify=$?"
      bash scripts/ci.sh > /tmp/c.txt 2>&1; echo "ci=$?"
      ```
      Nunca `npm test | grep … && git commit`: el estado de salida de una tubería es el del último
      comando, así que el commit correría sobre una suite en rojo.

- [ ] **Paso 7: verlo en un navegador**, que es lo que ninguna prueba cubre. Un worktree **no tiene
      `.env`**; el lanzador de `~/.claude/launch.json` que apunta a este árbol ya exporta
      `DATABASE_URL`, `AUTH_SECRET`, `PORT` y `AUTH_URL`. Comprobar **las tres caras**:
      1. la flotación dice «sin registro», **no 0**;
      2. una unidad sin `expectedHours` dice «sin duración declarada», **no una hora**;
      3. un lote sin `ProcessTarget` dibuja puntos **sin banda**, y lo dice.

      **Y leer el viewport antes de creer una captura:** un panel oculto devuelve `0x0`, y de ahí
      salen `NaN` que comparan `false` y confirman cualquier hipótesis.

- [ ] **Paso 8: contar el stat y commitear. Paso 9: abrir el PR** con `--body-file`, **nunca
      `--body "…"`**: un backtick sin escapar dentro de comillas dobles lo ejecuta la shell, borra
      la palabra en silencio y `gh` sale con 0 — pasó el 2026-09-30. Contar sus comprobaciones
      —un PR sano de este repositorio da **6**— leyendo **la conclusión de cada una, una por
      línea**, y con `.conclusion // .state`: la entrada de Vercel es un `StatusContext` y su
      veredicto vive en `state`, así que leer sólo `status`/`conclusion` la enseña vacía. Preguntar
      `mergeable` **aparte**, y no fiarse de una caché: las seis pueden estar verdes y el PR estar
      en conflicto. **Fusionar es decisión de Daniel.**

---

## Revisión final, antes de pedir la fusión

- [ ] **Las dos rúbricas.** Veracidad (21): cada número de la línea se puede desarmar hasta las
      filas que lo producen. Pedagógica (22): **ninguna de las tres piezas dice un cero donde lo que
      pasa es que no hay registro** — ni la flotación, ni una unidad sin duración, ni una variable
      sin rango.
- [ ] **§4.5 cubierto entero:** las tres piezas, y el acomodo de celular y pantalla ancha.
- [ ] Revisión independiente con Codex (`docs/CODEX_REVIEW.brief.md`,
      `/Applications/ChatGPT.app/Contents/Resources/codex` — **sin `-m`**, que el modelo por defecto
      es el único que su cuenta acepta).
- [ ] Anotar la entrega en `SESSION_STATE.md` §2 —**es el entregable, no el diff**—. El archivo
      está en 386/400 y §2 tiene **una sola** entrada: el guion **no** archivará más, así que lo que
      sobre hay que quitarlo de la prosa. Y antes de mover cualquier cosa, **medir qué se lleva**.
