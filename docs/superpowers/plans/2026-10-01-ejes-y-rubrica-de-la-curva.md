# Los ejes de la curva y la rúbrica 22 — Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development` (recomendada) o
> `superpowers:executing-plans`. Los pasos llevan casilla (`- [ ]`).

**Objetivo:** cerrar las dos cosas que §4.5 del diseño del tablero pide y el plan de las tres
piezas no incluyó — los **ejes con horas y valores**, y la guía de la **rúbrica 22** bajo la curva.

**Arquitectura:** las dos siguen el patrón que el PR #573 dejó montado: una función **pura** en
`lib/beneficio/` que decide, y el componente de servidor que pinta. Ninguna consulta nueva.

**Stack:** Next.js 16 (componentes de servidor), `next-intl`, vitest 4. **Sin librería de
gráficas:** el único `<svg>` de `app/` sigue siendo el de esta curva y el de la rueda sensorial.

**Spec:** `docs/superpowers/specs/2026-09-16-tablero-del-beneficio-design.md` §4.5, y las dos
rúbricas que §6 pone **«con el mismo peso que el funcional»**:
`docs/beneficio/21_rubrica_veracidad.md` y `docs/beneficio/22_rubrica_pedagogica.md`.

---

## La medición que decide la forma de este plan

Hecha el 2026-10-01 contra `origin/main` (`e3a743f4`), **antes** de escribir ninguna tarea.

| lo que §4.5 pide | ¿hay fuente de la que sacarlo? |
|---|---|
| los ejes con horas y valores | **no hace falta ninguna**: sale de las lecturas y de la banda, que ya están |
| «**qué pasa si se espera**» | **sí, y sólo para pH.** `docs/beneficio/10_ph_fermentation.md` §1 tiene una matriz de **6 bandas** con columna «Riesgo / vector» — p. ej. `[4.50, 5.20)` → «proliferación butírica y mohos → defecto *stinker*». **`11_brix_kinetics.md` y `13_drying_moisture.md` tienen 0 filas de matriz**: no hay nada que citar |
| «**qué hacer**» | **NO EXISTE PARA NINGUNA VARIABLE.** La cuarta columna de esa matriz se llama «**Acción del software**» y dice lo que hace el programa (`INFO`, `WARNING`, `CRITICAL`), no lo que hace el operario. Medido además en `lib/` y `app/`: ninguna función mapea un veredicto a una acción |

**Y por eso este plan NO escribe «qué hacer».** `CLAUDE.md` lo prohíbe —«nunca inventar una
afirmación; si no está en un archivo fuente o no lo dio el dueño, no se publica»— y la rúbrica 21
§4 lo refuerza: *«una guía que recomienda lavar un lote con falsa seguridad es peor que una que
dice qué sugiere el dato y devuelve la decisión al productor»*. La Tarea 4 le abre un **sitio
nombrado** donde aterrice cuando Daniel lo dicte, y un guardia que falla si alguien lo rellena
inventando.

---

## Restricciones globales

- **Sin librería de gráficas.** Los ejes se dibujan con el mismo `<svg>` de servidor.
- **Nada de «falsa autoridad»** (rúbrica 21 §4 y antipatrón 7 de la 22): el texto dice **qué
  sugiere el dato**, nunca ordena. Y **se marca si es práctica general o es tu dato**.
- **Una frase en campo** (antipatrón 3): «a las cinco de la mañana, con las manos mojadas y el
  teléfono al sol, nadie lee tres párrafos». La profundidad va detrás de un toque.
- **Nunca un cero donde falta un registro**, que es la regla del PR #573: si no hay riesgo citable
  para esa variable, **no se escribe nada**; no se inventa una frase neutra.
- **La base compartida del 55433 NO se resetea.** Esta restricción va en el encargo de CADA tarea.
- `npm run build` en **toda** tarea que toque TypeScript: vitest no comprueba tipos.
- Las pruebas de este plan son **herméticas**: NO van a `scripts/pruebas-por-compuerta.txt`.
- **Commitear ANTES de mutar**; flip-test con sus tres señales, y **si no discrimina, se dice**.
- Nunca `git add -A`; contar el stat antes de commitear.

---

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `lib/beneficio/ejesDeLaCurva.ts` *(nuevo)* | **puro.** De las lecturas y la banda a las marcas de los dos ejes, con su texto |
| `lib/beneficio/riesgoDeEsperar.ts` *(nuevo)* | **puro.** De `(variable, valor)` al riesgo citado de `10_ph_fermentation.md`, o `null` |
| `app/components/beneficio/CurvaDeLote.tsx` *(modificar)* | pinta los ejes y el bloque de la rúbrica |
| `messages/es.json`, `messages/en.json` *(modificar)* | los textos, en los dos idiomas |
| `docs/beneficio/10_ph_fermentation.md` *(modificar, Tarea 4)* | la columna que hoy no existe: qué hace el OPERARIO |

---

## Tarea 1 — Las marcas de los ejes

**Archivos:** `lib/beneficio/ejesDeLaCurva.ts` *(nuevo)*, `tests/beneficio/ejes-de-la-curva.test.ts` *(nuevo)*

**Interfaces — produce:**
```ts
export interface Marca { readonly pos: number; readonly texto: string }
export interface Ejes { readonly x: readonly Marca[]; readonly y: readonly Marca[] }

export function ejesDeLaCurva(input: {
  readonly lecturas: readonly { readonly occurredAt: Date; readonly value: number }[];
  readonly banda: { readonly min: number; readonly max: number } | null;
  readonly ancho: number;
  readonly alto: number;
}): Ejes;
```
- **No importa nada.** Repite la misma escala que `curvaDeLote` en vez de importarla: son dos
  módulos puros y acoplarlos haría que un cambio de escala rompiera los ejes en silencio. **Su
  prueba de que coinciden es la Tarea 3.**

- [ ] **Paso 1: la prueba de que el eje Y sale de la BANDA cuando la hay**, que es lo que hace útil
      la gráfica: sin números no se puede saber a qué pH está la banda.

      ```ts
      it("con banda, el eje Y rotula sus extremos y el centro", () => {
        const e = ejesDeLaCurva({
          lecturas: [{ occurredAt: new Date("2026-03-10T10:00:00Z"), value: 4.3 }],
          banda: { min: 4.0, max: 4.6 }, ancho: 300, alto: 120,
        });
        expect(e.y).toEqual([
          { pos: 0, texto: "4.6" },
          { pos: 60, texto: "4.3" },
          { pos: 120, texto: "4.0" },
        ]);
      });
      ```

- [ ] **Paso 2: verla fallar.** `npx vitest run tests/beneficio/ejes-de-la-curva.test.ts`.
      **Exporta antes `DATABASE_URL`**: sin él `tests/setup.ts` corta y vitest imprime «no tests»,
      que en una salida filtrada se lee igual que «no falló».
      ```bash
      export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
      ```

- [ ] **Paso 3: la prueba de que SIN banda el eje Y sale de los datos**, con los mismos extremos
      que la curva usa en ese caso:

      ```ts
      it("sin banda, el eje Y rotula el mínimo y el máximo de los datos", () => {
        const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00Z`);
        const e = ejesDeLaCurva({
          lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.1 }],
          banda: null, ancho: 300, alto: 120,
        });
        expect(e.y[0]).toEqual({ pos: 0, texto: "4.5" });
        expect(e.y[e.y.length - 1]).toEqual({ pos: 120, texto: "4.1" });
      });
      ```

- [ ] **Paso 4: la prueba del eje X en HORAS, no en fechas.** Es una curva de una fase, así que lo
      que importa es cuánto lleva, no el día:

      ```ts
      it("el eje X rotula horas desde la primera lectura, no fechas", () => {
        const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00Z`);
        const e = ejesDeLaCurva({
          lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(18), value: 4.1 }],
          banda: null, ancho: 300, alto: 120,
        });
        expect(e.x).toEqual([{ pos: 0, texto: "0 h" }, { pos: 300, texto: "8 h" }]);
      });
      ```

- [ ] **Paso 5: la prueba de UNA sola lectura**, que es donde una división entre cero da `NaN` —y
      **`NaN` comparado con cualquier cosa da `false`**, así que la aserción tiene que ser sobre
      `Number.isNaN`, no una comparación:

      ```ts
      it("una sola lectura no produce NaN ni un eje X de 0 h a 0 h", () => {
        const e = ejesDeLaCurva({
          lecturas: [{ occurredAt: new Date("2026-03-10T10:00:00Z"), value: 4.3 }],
          banda: null, ancho: 300, alto: 120,
        });
        expect(e.x).toHaveLength(1);
        expect(Number.isNaN(e.x[0]!.pos)).toBe(false);
        for (const m of e.y) expect(Number.isNaN(m.pos)).toBe(false);
      });
      ```

- [ ] **Paso 6: implementar. Paso 7: `npx tsc --noEmit` y `npm run build`, los dos 0.
      Paso 8: commit contando el stat (deben ser 2).**

- [ ] **Paso 9: DESPUÉS del commit, tres flip-tests**, cada uno con sus tres señales:
      1. rotular el eje Y con los datos aunque haya banda → debe caer la prueba del paso 1;
      2. rotular el eje X con la hora del reloj en vez de las horas transcurridas → la del paso 4;
      3. dividir por `(n-1)` sin proteger `n === 1` → la del paso 5. **Si este tercero no cae, la
         prueba está mal escrita:** comprueba que afirma sobre `Number.isNaN`.

---

## Tarea 2 — El riesgo de esperar, citado y acotado al pH

**Archivos:** `lib/beneficio/riesgoDeEsperar.ts` *(nuevo)*,
`tests/beneficio/riesgo-de-esperar.test.ts` *(nuevo)*

**Interfaces — produce:**
```ts
export interface Riesgo {
  /** La banda de `10_ph_fermentation.md` §1 en la que cae el valor. */
  readonly banda: string;
  /** La columna «Riesgo / vector», literal del documento. */
  readonly riesgo: string;
}

/** `null` = no hay riesgo CITABLE para esa variable o ese valor. Nunca una frase inventada. */
export function riesgoDeEsperar(variable: string, valor: number): Riesgo | null;
```

- [ ] **Paso 1: la prueba de que SÓLO el pH tiene riesgo citable**, que es la medición que da forma
      a esta tarea y lo que impide inventar:

      ```ts
      it("brix y humedad no tienen matriz de umbrales: devuelven null, no una frase neutra", () => {
        expect(riesgoDeEsperar("brix", 18.8)).toBeNull();
        expect(riesgoDeEsperar("moisture", 11)).toBeNull();
        // Control positivo: el pH SÍ la tiene. Sin él, «devuelve null» pasaría igual con una
        // función que devolviera null siempre.
        expect(riesgoDeEsperar("ph", 4.8)).not.toBeNull();
      });
      ```

- [ ] **Paso 2: verla fallar** (módulo inexistente), con `DATABASE_URL` exportado.

- [ ] **Paso 3: la prueba de que el texto es LITERAL del documento**, no una paráfrasis. La banda
      `[4.50, 5.20)` de `docs/beneficio/10_ph_fermentation.md` §1 dice «Proliferación butírica y
      mohos → defecto *stinker*»:

      ```ts
      it("el riesgo es la columna del documento, palabra por palabra", () => {
        const r = riesgoDeEsperar("ph", 4.8)!;
        expect(r.banda).toBe("[4.50, 5.20)");
        expect(r.riesgo).toContain("butírica");
        expect(r.riesgo).toContain("stinker");
      });
      ```

- [ ] **Paso 4: la prueba de los bordes de banda**, que es donde un `<` por `<=` se cuela: 4.50 cae
      en `[4.50, 5.20)` y 5.20 **no**.

- [ ] **Paso 5: implementar.** Las seis bandas van **transcritas** del documento, con un comentario
      que dice de qué archivo y qué sección salen y que **no se parafrasean**.

- [ ] **Paso 6: el guardia de la transcripción.** Una prueba que **lea
      `docs/beneficio/10_ph_fermentation.md`** y compruebe que las seis bandas del módulo siguen
      estando en el documento, con su control positivo: que el documento se leyó y tiene ≥6 filas.
      **Sin esto, alguien edita el documento y el módulo sigue citando lo que ya no dice.**

- [ ] **Paso 7: `npm run build`. Paso 8: commit. Paso 9: dos flips:**
      1. devolver un riesgo genérico para `brix` → debe caer la prueba del paso 1;
      2. cambiar una palabra de la transcripción → debe caer la del paso 6.

---

## Tarea 3 — La pantalla: ejes, riesgo, y la prueba de que las dos escalas coinciden

**Archivos:** `app/components/beneficio/CurvaDeLote.tsx` *(modificar)*,
`messages/es.json` y `messages/en.json` *(modificar)*,
`tests/beneficio/pantalla-del-tablero.test.ts` *(modificar)*

**Consume:** `ejesDeLaCurva` (Tarea 1), `riesgoDeEsperar` (Tarea 2) y el `Curva` que ya existe.

- [ ] **Paso 1: LA PRUEBA QUE JUSTIFICA QUE LOS DOS MÓDULOS NO SE IMPORTEN.** `ejesDeLaCurva`
      repite la escala de `curvaDeLote`. Si divergen, los números del eje dejan de corresponder a
      los puntos y **nada lo diría**. Una prueba las compara sobre el mismo caso:

      ```ts
      it("la marca del eje Y cae en la MISMA coordenada que el punto de ese valor", () => {
        const lecturas = [{ occurredAt: new Date("2026-03-10T10:00:00Z"), value: 4.6 }];
        const objetivo = { minValue: 4.0, maxValue: 4.6, targetValue: 4.3 };
        const c = curvaDeLote({ lecturas, objetivo, ancho: 300, alto: 120 });
        const e = ejesDeLaCurva({ lecturas, banda: { min: 4.0, max: 4.6 }, ancho: 300, alto: 120 });
        // 4.6 es el máximo de la banda: su punto y su marca tienen que estar los dos arriba.
        expect(c.puntos[0]!.y).toBe(e.y[0]!.pos);
      });
      ```
      **Su flip:** cambiar la escala de uno de los dos módulos → esta prueba cae y ninguna otra.

- [ ] **Paso 2: los ejes en el `<svg>`.** Las marcas van **dentro** del mismo `<svg>` que ya lleva
      `overflow: visible`, para que no las recorte. Sin librería.

- [ ] **Paso 3: el bloque de la rúbrica, con sus tres reglas duras.** Debajo de la curva:
      - si `riesgoDeEsperar` devuelve un riesgo, **una frase** con él, marcada como **criterio de
        Néctar Nómada** —que es lo que la rúbrica 21 §4 exige cuando no hay cita externa— y con el
        enlace a `10_ph_fermentation.md` detrás de un toque;
      - si devuelve `null`, **no se escribe nada**. Ni «todo bien», ni «sin riesgos conocidos»: eso
        sería un cero donde falta un registro, que es lo que el PR #573 existe para impedir;
      - **ninguna frase ordena.** «El dato sugiere», no «lave ahora».

- [ ] **Paso 4: las pruebas de render**, con el andamio que ya existe en
      `tests/beneficio/pantalla-del-tablero.test.ts` (`renderToStaticMarkup` + `next-intl`
      simulado). Tres, y cada una con su mutación anotada:
      1. con pH 4.8 aparece el riesgo y la marca de criterio propio;
      2. con brix **no aparece ningún bloque de riesgo** — y el control positivo es la misma
         llamada con pH, que sí lo trae;
      3. los rótulos de los dos ejes están en el HTML, con sus valores.

- [ ] **Paso 5: los textos en los DOS idiomas**, con el control de paridad de `SeccionBeneficio`
      leído ANTES del resultado:
      ```bash
      node -e 'const a=require("./messages/es.json"),b=require("./messages/en.json");
        const A=new Set(Object.keys(a.SeccionBeneficio)),B=new Set(Object.keys(b.SeccionBeneficio));
        console.log("es:",A.size,"en:",B.size,"| es-en:",[...A].filter(k=>!B.has(k)),"en-es:",[...B].filter(k=>!A.has(k)));'
      ```
      **El texto del riesgo NO se traduce al inglés inventando**: es una cita de un documento en
      castellano. Se traduce la **envoltura** («según el criterio de Néctar Nómada…») y la cita se
      deja como está, igual que el spec de fitosanitarias conserva «Regin» por ser una cita.

- [ ] **Paso 6: las compuertas, sin tubería y leyendo el código de salida:**
      ```bash
      npm run build  > /tmp/b.txt 2>&1; echo "build=$?"
      npm run verify > /tmp/v.txt 2>&1; echo "verify=$?"
      bash scripts/ci.sh > /tmp/c.txt 2>&1; echo "ci=$?"
      ```

- [ ] **Paso 7: verlo en el navegador.** Un worktree **no tiene `.env`**; el lanzador global de
      `~/.claude/launch.json` que apunte a este árbol exporta lo necesario. Comprobar **las dos
      caras**: un lote de pH con su riesgo, y uno de humedad **sin ningún bloque**. Y **leer el
      viewport antes de creer una captura**: un panel oculto devuelve `0x0`, y de ahí salen `NaN`
      que comparan `false` y confirman cualquier hipótesis.

- [ ] **Paso 8: contar el stat y commitear.**

---

## Tarea 4 — El sitio nombrado para «qué hacer», que hoy no existe en ninguna fuente

**Archivos:** `docs/beneficio/10_ph_fermentation.md` *(modificar)*,
`tests/arquitectura/guia-no-inventada.test.ts` *(nuevo)*

**Esta tarea NO escribe guía.** Escribe el hueco donde va, y el guardia que impide rellenarlo
inventando. Medido el 2026-10-01: la cuarta columna de la matriz se llama «**Acción del
software**» y dice `INFO`/`WARNING`/`CRITICAL` — lo que hace el programa, **no lo que hace el
operario**. Ninguna función de `lib/` ni de `app/` mapea un veredicto a una acción.

- [ ] **Paso 1: añadir a la matriz de §1 una columna «Qué hace el operario», con las seis celdas
      vacías** y una nota encima que diga, literal: que las celdas las rellena **Daniel**, que
      hasta entonces la pantalla **no dice qué hacer**, y por qué — rúbrica 21 §4, «una guía que
      recomienda con falsa seguridad es peor que una que devuelve la decisión al productor».

- [ ] **Paso 2: el guardia.** Una prueba que lea el documento y **falle si una celda de esa columna
      está rellena y el módulo `riesgoDeEsperar` no la expone**, para que el día que Daniel la
      escriba, el código tenga que recogerla en vez de quedarse la guía muerta en un `.md`.

      **Y su flip, que es el que importa:** rellenar una celda a mano → la prueba **debe caer**.
      Si no cae, el guardia es un adorno y hay que decirlo.

- [ ] **Paso 3: `npm run verify` y commit.**

---

## Revisión final, antes de pedir la fusión

- [ ] **Las dos rúbricas, que §6 pone al mismo peso que lo funcional.** Veracidad (21): cada
      afirmación se puede desarmar hasta el documento que la sostiene, y lo que es criterio propio
      lo dice. Pedagógica (22): **ningún antipatrón** — ni alerta sin salida, ni guía genérica, ni
      muro de texto, ni falsa autoridad.
- [ ] **§4.5 queda cubierto entero**, o se dice qué falta y por qué.
- [ ] Revisión independiente con Codex sobre el diff de producción **antes** de pedir la fusión
      (`docs/CODEX_REVIEW.brief.md`, `/Applications/ChatGPT.app/Contents/Resources/codex`, **sin
      `-m`** y con `< /dev/null`). En el PR #573 encontró **siete cosas** tras seis revisiones de
      Claude: no comparte los mismos sesgos.
- [ ] Anotar la entrega en `SESSION_STATE.md` §2 — **midiendo antes qué se lleva** lo que se
      archive. **Y el turno:** en el OS, editar ese archivo pasa por la sesión que lo lleva.
- [ ] Abrir el PR con `--body-file`, **nunca `--body "…"`**: un backtick sin escapar lo ejecuta la
      shell, borra la palabra en silencio y `gh` sale con 0. Contar sus comprobaciones —un PR sano
      da **6**— leyendo `.conclusion // .state`, porque Vercel es un `StatusContext` y su veredicto
      vive en `state`. **Fusionar es decisión de Daniel.**
