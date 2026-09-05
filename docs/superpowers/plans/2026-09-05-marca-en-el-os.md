# La marca en el OS — plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL OBLIGATORIA: usar
> `superpowers:subagent-driven-development` (recomendada) o
> `superpowers:executing-plans` para implementar tarea a tarea. Los pasos usan
> casillas (`- [ ]`) para seguimiento.

**Objetivo:** que el OS se reconozca como Néctar Nómada — tipografía propia y
paleta alineada con el sitio público — sin bajar ningún contraste.

**Arquitectura:** tres tareas independientes y en este orden. Primero un
guardia de contraste que lee `globals.css` y falla si un par interactivo baja
del umbral WCAG; después las fuentes; después la paleta. El guardia va primero
**a propósito**: es lo que protege el cambio de paleta de la tarea 3, y es el
test que habría hecho imposible el defecto del 2026-09-05 (borde de campo a
2.26 cuando su propio comentario exigía leerse como un borde).

**Tech Stack:** Next.js App Router, `next/font/google`, CSS custom properties
en `app/globals.css`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-marca-en-el-os-design.md`

## Restricciones globales

- **`--nn-brand` NO se toca.** Se queda en `#7a3b1e` (7.94 sobre papel).
  Decisión de Daniel, razonada en §4.3 del spec: más marca no vale tres puntos
  de contraste en una herramienta que se usa al sol. Si un paso parece pedir
  cambiarlo, el paso está mal.
- **`--nn-border` NO se toca.** Es divisor, no borde de control; WCAG 1.4.11 no
  le aplica.
- **La miel nunca lleva texto blanco.** `#fcea3c` da 1.24 con blanco y 15.10
  con tinta.
- **Ningún cambio puede bajar un contraste existente.** El guardia de la tarea
  1 lo hace cumplir.
- **Las fuentes se alojan en nuestro origen** vía `next/font`. Ninguna petición
  a `fonts.googleapis.com` en tiempo de ejecución.
- Node no está en el PATH: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`.
- La compuerta se lee por **código de salida**, nunca por la cola ni por tubería.

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `tests/arquitectura/contraste-de-tokens.test.ts` | **Crear.** Lee `globals.css`, extrae los tokens y comprueba los pares interactivos contra su umbral. |
| `app/layout.tsx` | **Modificar.** Cargar Bodoni Moda y Archivo con `next/font/google` y colgar sus variables del `<html>`. |
| `app/globals.css` | **Modificar.** `--nn-font` y `--nn-display` pasan a consumir las variables de las fuentes; papel, tinta y acentos se alinean. |

---

### Tarea 1: El guardia de contraste

Sin esto, la tarea 3 cambia colores sin red. Con esto, cualquier sesión futura
que baje un contraste rompe la compuerta.

**Files:**
- Create: `tests/arquitectura/contraste-de-tokens.test.ts`
- Read only: `app/globals.css`

**Interfaces:**
- Consume: nada.
- Produce: nada que importe otro módulo. Las tareas 2 y 3 dependen de que este
  test **exista y pase**.

- [ ] **Paso 1: escribir el test que falla**

Crear `tests/arquitectura/contraste-de-tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Los pares de color que identifican o accionan algo cumplen su umbral WCAG.
 *
 * **Por qué existe.** El 2026-09-05, `--nn-border-strong` valía `#b9ab93` y
 * daba 2.26:1 sobre `--nn-surface`, por debajo del 3:1 que WCAG 1.4.11 exige
 * al borde que identifica un control — mientras el comentario justo encima del
 * token decía que ese borde "must read as an edge outdoors". La intención
 * estaba escrita y el valor no la cumplía, y nada lo medía. Peor: `.nn-field`
 * pintaba el borde con `--nn-border`, el token de DIVISOR, en 50 archivos.
 *
 * **Qué cubre y qué no.** Sólo los pares que WCAG obliga: texto sobre su
 * fondo, borde de control, y fondo de acción con el color de texto que
 * realmente lleva encima. NO cubre `--nn-border`, que es divisor y no
 * identifica ningún control.
 *
 * Hermético: sólo lee un archivo.
 */

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function token(nombre: string): string {
  const m = CSS.match(new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${nombre} no encontrado en globals.css`);
  return m[1];
}

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminancia(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("contraste de los tokens de color", () => {
  it("el borde de un control se distingue de su fondo (1.4.11, 3:1)", () => {
    expect(contraste(token("nn-border-strong"), token("nn-surface"))).toBeGreaterThanOrEqual(3);
    expect(contraste(token("nn-border-strong"), token("nn-bg"))).toBeGreaterThanOrEqual(3);
  });

  it("el texto normal cumple AA (4.5:1)", () => {
    expect(contraste(token("nn-ink"), token("nn-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(token("nn-ink"), token("nn-surface"))).toBeGreaterThanOrEqual(4.5);
  });

  it("el texto secundario cumple AA (4.5:1)", () => {
    expect(contraste(token("nn-ink-muted"), token("nn-bg"))).toBeGreaterThanOrEqual(4.5);
  });

  it("el enlace de marca cumple AA (4.5:1)", () => {
    expect(contraste(token("nn-brand"), token("nn-bg"))).toBeGreaterThanOrEqual(4.5);
  });

  it("el texto del botón de marca cumple AA sobre su fondo", () => {
    expect(contraste(token("nn-brand-ink"), token("nn-brand"))).toBeGreaterThanOrEqual(4.5);
  });

  it("el error cumple AA sobre las dos superficies", () => {
    expect(contraste(token("nn-error"), token("nn-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(token("nn-error"), token("nn-surface"))).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Paso 2: correr el test y ver que PASA sobre el código actual**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
npx vitest run tests/arquitectura/contraste-de-tokens.test.ts
```

Esperado: **6 passed**. Aquí el test pasa desde el principio a propósito: es un
guardia de regresión, no un test de una función que aún no existe.

- [ ] **Paso 3: FLIP-TEST — comprobar que discrimina**

Sin esto el guardia no vale nada. Bajar el token a su valor viejo y ver caer
**el test del borde y sólo ése**:

```bash
sed -i '' 's/--nn-border-strong: #948976/--nn-border-strong: #b9ab93/' app/globals.css
git diff --stat app/globals.css   # DEBE decir 1 file changed — si no, la mutación no se aplicó
npx vitest run tests/arquitectura/contraste-de-tokens.test.ts
```

Esperado: **1 failed | 5 passed**, y el que falla es
`el borde de un control se distingue de su fondo`. Si cae otro, o caen varios,
el guardia mide otra cosa: pararse y arreglarlo.

Restaurar y confirmar:

```bash
git checkout -- app/globals.css
npx vitest run tests/arquitectura/contraste-de-tokens.test.ts   # 6 passed
```

- [ ] **Paso 4: commit**

```bash
git add tests/arquitectura/contraste-de-tokens.test.ts
git commit -F - <<'EOF'
Un guardia que mide el contraste de los tokens, no la intencion

El 2026-09-05 --nn-border-strong daba 2.26:1 sobre --nn-surface mientras el
comentario justo encima decia que ese borde "must read as an edge outdoors".
La intencion estaba escrita, el valor no la cumplia, y nada lo media.

Este test lee globals.css y comprueba los pares que WCAG obliga. Flip-test
hecho: devolviendo el token a #b9ab93 cae UN test, el del borde, y solo ese.

No cubre --nn-border a proposito: es divisor de tarjetas, no identifica ningun
control, y 1.4.11 no le aplica.
EOF
```

---

### Tarea 2: Las fuentes de la marca

**Files:**
- Modify: `app/layout.tsx` (imports arriba; `<html>` en la línea ~30)
- Modify: `app/globals.css` (`--nn-font` línea ~19; `--nn-display` línea ~762)

**Interfaces:**
- Consume: nada de la tarea 1.
- Produce: las variables CSS `--nn-fuente-texto` y `--nn-fuente-display`,
  colgadas del `<html>`. La tarea 3 no las usa; son independientes.

- [ ] **Paso 1: cargar las fuentes en el layout**

En `app/layout.tsx`, añadir tras `import type { Metadata } from "next";`:

```tsx
import { Bodoni_Moda, Archivo } from "next/font/google";
```

Y antes de `export const metadata`:

```tsx
/**
 * Las dos familias de la marca, las mismas que sirve el sitio público
 * (`nectarnomada-web`). SIL OFL, y `next/font` las aloja en nuestro origen:
 * ninguna petición a fonts.googleapis.com en tiempo de ejecución.
 *
 * Bodoni Moda es un serif de alto contraste: va SOLO en encabezados. En texto
 * pequeño y al sol se lee peor que una grotesca, y este OS se usa en el campo.
 */
const fuenteDisplay = Bodoni_Moda({
  subsets: ["latin"],
  display: "swap",
  variable: "--nn-fuente-display",
});

const fuenteTexto = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--nn-fuente-texto",
});
```

- [ ] **Paso 2: colgar las variables del `<html>`**

Sustituir la línea 30 de `app/layout.tsx`:

```tsx
<html lang={locale}>
```

por:

```tsx
<html lang={locale} className={`${fuenteTexto.variable} ${fuenteDisplay.variable}`}>
```

- [ ] **Paso 3: que los tokens las consuman**

En `app/globals.css`, sustituir la declaración de `--nn-font`:

```css
  --nn-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
```

por:

```css
  /* Archivo es la de la marca; la pila del sistema queda de respaldo por si la
     fuente no llega — en el campo, con señal mala, eso pasa. */
  --nn-font: var(--nn-fuente-texto), -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
```

Y en la declaración de `--nn-display` (línea ~762), anteponer la variable de la
misma forma, conservando la pila de respaldo que ya tiene:

```css
  --nn-display: var(--nn-fuente-display), "Iowan Old Style", "Palatino Linotype", Palatino, Georgia,
```

- [ ] **Paso 4: comprobar que construye**

`npm run verify` NO corre `next build`, y los fallos de fuentes salen ahí:

```bash
npm run build > /tmp/build.txt 2>&1; echo "salida=$?"; tail -12 /tmp/build.txt
```

Esperado: `salida=0`.

- [ ] **Paso 5: verificar en el navegador que NO hay petición a Google**

```bash
# levantar el servidor con preview_start (nectar-worktree-b, puerto 3019)
```

Con la pestaña abierta en `http://localhost:3019/signup`, leer las peticiones de
red y comprobar que **ninguna** va a `fonts.googleapis.com` ni a
`fonts.gstatic.com`, y que la familia computada del `body` empieza por
`Archivo`.

- [ ] **Paso 6: control positivo — el peor caso de Bodoni**

Es lo que el spec §6 manda mirar primero. En móvil 375×812, abrir una pantalla
con un **nombre de lote largo** en un encabezado y mirarlo. Si Bodoni Moda lo
vuelve ilegible o lo desborda, **parar y decirlo**: la decisión de usarla en
encabezados se revisa, no se fuerza.

- [ ] **Paso 7: commit**

```bash
git add app/layout.tsx app/globals.css
git show --stat   # contar: DEBEN ser 2 archivos
git commit -F - <<'EOF'
Las dos tipografias de la marca, con Bodoni solo en encabezados

El OS usaba pilas del sistema, asi que se leia como software y no como Nectar
Nomada. Archivo y Bodoni Moda son las que ya sirve el sitio publico; next/font
las aloja en nuestro origen, sin peticiones a terceros.

Bodoni va SOLO en encabezados: es un serif de alto contraste y en texto pequeño
al sol se lee peor que una grotesca. Las pilas del sistema quedan de respaldo,
que en el campo con señal mala importa.
EOF
```

---

### Tarea 3: La paleta

**Files:**
- Modify: `app/globals.css` (bloque de tokens, líneas 2–18)

**Interfaces:**
- Consume: el guardia de la tarea 1 — es lo que valida este cambio.
- Produce: nada que otro módulo importe.

- [ ] **Paso 1: alinear papel y tinta**

En `app/globals.css`:

```css
  --nn-bg: #faf6ef;
  --nn-ink: #241c14;
```

por:

```css
  /* Los valores del sitio público (`nectarnomada-web`, app/globals.css:
     --papel-calido y --tinta). Copiados, no compartidos: los dos
     repositorios son independientes y CI no puede detectar que se separen.
     Deuda declarada en el spec §6. */
  --nn-bg: #faf7f0;
  --nn-ink: #141210;
```

- [ ] **Paso 2: añadir la acción de marca**

Tras la declaración de `--nn-accent-bg`, añadir:

```css
  /* La miel es el acento de la marca Y el contraste más alto disponible: 15.10
     con tinta encima. NUNCA con texto blanco, que da 1.24. */
  --nn-miel: #fcea3c;
  --nn-miel-ink: var(--nn-ink);
```

- [ ] **Paso 3: correr el guardia de la tarea 1**

```bash
npx vitest run tests/arquitectura/contraste-de-tokens.test.ts
```

Esperado: **6 passed**. El cambio de tinta **sube** el contraste del texto de
15.58 a 17.47; si algún test cae, el cambio bajó algo y hay que revertirlo.

- [ ] **Paso 4: la compuerta entera, sin tubería**

```bash
npm run verify > /tmp/verify.txt 2>&1; echo "salida=$?"; tail -8 /tmp/verify.txt
```

Esperado: `salida=0`. Si aparecen errores de tipos de Prisma, correr
`npx prisma generate` antes — es la trampa que `CLAUDE.md` documenta.

- [ ] **Paso 5: commit**

```bash
git add app/globals.css
git commit -F - <<'EOF'
Papel, tinta y la miel: la paleta del sitio publico, en el OS

El OS compartia el papel con la marca (#faf6ef vs #faf7f0) y nada mas. Ahora
papel y tinta son los mismos valores, y la miel entra como color de accion.

La miel lleva SIEMPRE texto tinta: 15.10 asi, 1.24 con blanco. Un boton amarillo
con texto oscuro se ve mejor al sol que el marron actual con blanco (8.50).

--nn-brand NO se toca. Lo on-brand habria sido guarapo oscurecido (#816753,
4.91) y el marron actual da 7.94; Daniel eligio el contraste. Esta escrito en el
spec §4.3 para que nadie lo "arregle" despues creyendo que fue un olvido.

Los valores se COPIAN del otro repositorio, no se comparten: son independientes
y CI no puede detectar que se separen. Deuda declarada, spec §6.
EOF
```

---

## Auto-repaso del plan

**Cobertura del spec.** §4.1 tipografía → tarea 2. §4.2 color → tarea 3. §4.3
el enlace intacto → restricción global y comprobado por el guardia de la tarea
1, que exige 4.5 a `--nn-brand`. §6 riesgos → el de deriva queda como comentario
citando el origen (tarea 3 paso 1) y el de Bodoni como paso de verificación
explícito (tarea 2 paso 6). §7 verificación → repartida en los pasos, incluidos
`next build` y la comprobación de red.

**Sin marcadores.** Ningún paso dice «añadir manejo de errores» ni «tests para
lo anterior»: todo el código está escrito.

**Consistencia de nombres.** `--nn-fuente-texto` y `--nn-fuente-display` se
definen en la tarea 2 paso 1 y se consumen en el paso 3 con esos mismos
nombres. `token()` y `contraste()` sólo viven dentro del test de la tarea 1.

**Un hueco que dejo a la vista.** El spec §7.1 pide medir el contraste **sobre
los valores computados en el navegador**, no sobre el CSS. El guardia de la
tarea 1 lee el CSS, que es más débil: no vería un color inyectado en línea o
sobrescrito por otra hoja. Es lo que un test hermético puede hacer, y la
verificación en navegador de la tarea 2 paso 5 lo compensa a mano. Queda
escrito en vez de fingir que están cubiertos los dos.
