# Borradores con dueño — plan de implementación

> **Para quien lo ejecute (agente):** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans`, tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que ningún borrador offline se envíe nunca a nombre de una cuenta distinta de la que lo anotó.

**Arquitectura:** cada borrador de las tres colas de IndexedDB guarda la **huella** de la cuenta que lo
anotó (los 16 primeros hexadecimales del SHA-256 de su `userAccountId`). El navegador sólo envía los de la
cuenta actual y los que no tienen cuenta. El servidor lo vuelve a comprobar y retiene los ajenos con un
`rejected` de motivo `borrador_de_otra_cuenta`, sin escribir nada. La cuenta actual la escribe en el
navegador el componente de #703 (`ServiceWorkerRegistration`), junto con la hora del servidor, para que una
página vieja no gane. Las decisiones son funciones puras, probadas en Node; las escrituras se prueban contra
Postgres real.

**Stack:** Next.js 16 (App Router), React 19, TypeScript estricto (`noUncheckedIndexedAccess`), Prisma 7,
PostgreSQL, vitest 4, IndexedDB/localStorage en el cliente.

**Especificación:** `docs/superpowers/specs/2026-10-09-borradores-con-dueno-design.md`, aprobada por Daniel
el 2026-10-11 con la nota «un solo componente en `app/layout.tsx`, compartido con el PR #703». La Tarea 0
añade a la especificación cómo se aplica esa nota.

## Restricciones globales

- Antes de cualquier `npm`/`npx`: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`.
- **Cada llamada a `Bash` abre una shell nueva: las variables no sobreviven de una orden a la siguiente.**
  Toda orden de este plan empieza con este preámbulo, y en las tareas 3 a 7 también con la segunda línea:

  ```bash
  export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"; S=/private/tmp/claude-501/borradores-con-dueno; mkdir -p "$S"
  export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_ci_borradores DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_ci_borradores
  ```
- **Nunca `git add -A`**: se añade archivo por archivo. Commits con `git commit -F <archivo>`, y el mensaje
  termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Una compuerta nunca se canaliza: `npm run verify > "$S/verify.txt" 2>&1; echo "verify=$?"`, y se lee el
  código **en su propia línea**. De vitest se leen **las dos** líneas, `Test Files` y `Tests`.
- `NODE_OPTIONS="--max-old-space-size=4096"` delante de `typecheck`, `verify` y `build`.
- **Bases de datos.** Sólo las desechables de esta tarea: `nectar_ci_borradores` (Tarea 3),
  `nectar_ci_borradores_grupo` (Tarea 7) y `nectar_ci_cuentas` (Tarea 8). Se crean siempre así:
  `CREATE DATABASE "<nombre>" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';`
  **Nunca** la compartida `nectar_test`, y **nunca** `npm run test:db -- reset`, `prisma migrate reset`,
  `db push --force-reset`, borrar una base que no sea de esta lista, ni fijar
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Si un subagente toca la base, su encargo lleva esta línea
  copiada entera.
- `psql` vive en `/Applications/Postgres.app/Contents/Versions/latest/bin/psql`. El servidor de pruebas
  escucha en `127.0.0.1:55433`, usuario `postgres`.
- El motivo del servidor es exactamente `borrador_de_otra_cuenta`. El de una cuenta mal formada,
  `cuenta_del_borrador_invalida`.
- La huella es `createHash("sha256").update(userAccountId).digest("hex").slice(0, 16)`, la misma que #703.
  **El `userAccountId` completo no se escribe nunca** en `localStorage` ni en IndexedDB.
- La clave del navegador es `nn-cuenta-del-navegador`. La de #703, `nn-pages-cuenta`, no se toca.
- Identificadores, comentarios y textos en español, con el estilo de los archivos vecinos.
- Una prueba que necesita base va al grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
- **Commitear antes de cualquier flip-test**: el arnés restaura con `git checkout --`, que vuelve a HEAD.
- **No se fusiona nada.** Se abre el PR y lo fusiona la sesión que lleva el turno. Tampoco se toca
  `SESSION_STATE.md`.

## Mapa de archivos

| archivo | qué hace | tarea |
|---|---|---|
| `lib/auth/huellaDeCuenta.ts` (nuevo) | la huella y lo que el layout le pasa al navegador | 1 |
| `lib/sync/cuentaDelBorrador.ts` (nuevo) | decisiones puras: de quién es, qué se envía, qué pasa tras la respuesta | 1 |
| `lib/offline/cuentaDelNavegador.ts` (nuevo) | la cuenta actual del navegador, ordenada por hora | 2 |
| `app/components/ServiceWorkerRegistration.tsx` (de #703) | apunta la cuenta y alinea las páginas guardadas | 2 |
| `app/layout.tsx` (de #703) | usa `cuentaParaElNavegador` en vez del hash escrito a mano | 2 |
| `lib/sync/parsearMutaciones.ts` | valida y normaliza `cuentaDelBorrador` | 3 |
| `lib/sync/pushFieldEvents.ts` | retiene los borradores ajenos antes de procesarlos | 3 |
| `lib/sync/offlineQueue.ts` + `FieldSyncControls.tsx` | cola de campo | 4 |
| `lib/apiary/offlineQueue.ts` + `OfflineSyncIndicator.tsx` | cola de apiario | 5 |
| `lib/sync/trapPhotoQueue.ts`, `lib/traceability/landMedia.ts`, `app/actions/traceability.ts`, `SincronizarFotosDeRonda.tsx` | fotos | 6 |
| `messages/es.json`, `messages/en.json` | tres claves nuevas | 4, 5, 6 |
| `docs/architecture/DECISIONS.md` | ADR-199 | 7 |

---

### Tarea 0: Base de la rama, dependencias y nota en la especificación

**Archivos:**
- Modificar: `docs/superpowers/specs/2026-10-09-borradores-con-dueno-design.md` (sección nueva al final)

**Interfaces:** ninguna.

El worktree es el que ya tiene la rama: local `claude/frosty-wiles-6d4e44`, remota `borradores-con-dueno`.
Si se ejecuta desde otra sesión, se crea uno:
`git worktree add ~/Developer/nectar-worktrees/borradores-con-dueno -b borradores-con-dueno origin/borradores-con-dueno`.

- [ ] **Paso 1: Decidir la base según el estado de #703**

```bash
S=/private/tmp/claude-501/borradores-con-dueno; mkdir -p "$S"
git fetch origin --quiet; echo "fetch=$?"
gh pr view 703 -R danieljosegiraldez-png/nectar-nomada --json state,headRefOid --jq '"\(.state) \(.headRefOid)"'
```

Si dice `MERGED`, la base es `origin/main`. Si dice `OPEN`, la base es `origin/sw-cierre-de-sesion`. En ese
caso el PR de este trabajo se abre **contra esa rama** y se fusiona **después** de #703. Cualquier otro
valor: parar y preguntar.

- [ ] **Paso 2: Llevar el commit de la especificación encima de la base**

La rama tiene dos commits propios encima de `141afb63`: el diseño (`1c60be29`) y este plan. Se mueven
exactamente esos dos:

```bash
BASE=origin/sw-cierre-de-sesion   # o origin/main si #703 ya está fusionado
git fetch origin sw-cierre-de-sesion --quiet
git rebase --onto "$BASE" 141afb63
echo "rebase=$?"
git log --oneline "$BASE"..HEAD
git diff --name-only "$BASE"...HEAD
```

Esperado: `rebase=0`, **dos** commits (el diseño y el plan) y **dos** archivos, la especificación y el plan.
Si sale otra cosa, parar.

- [ ] **Paso 3: Dependencias y cliente de Prisma**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm ci > "$S/npm-ci.txt" 2>&1; echo "npm_ci=$?"
npx prisma generate > "$S/generate.txt" 2>&1; echo "generate=$?"
ls node_modules/.bin/tsc && echo "tsc presente"
```

Esperado: los dos `=0` y `tsc presente`. Sin `node_modules`, `npx tsc` usa el stub global, sale con 1 y
da cero errores: eso no es un verde.

- [ ] **Paso 4: Añadir la nota de aprobación al final de la especificación**

Añadir este texto, tal cual, al final del archivo:

```markdown
## Nota de aprobación, 2026-10-11

Daniel aprobó esta especificación el 2026-10-11 con una nota: **un solo componente en
`app/layout.tsx`, compartido con el PR #703** (`sw-cierre-de-sesion`). El plan
(`docs/superpowers/plans/2026-10-11-borradores-con-dueno.md`) la aplica así, y esto corrige tres
puntos de las secciones de arriba:

1. **El componente es `ServiceWorkerRegistration`, el de #703.** Recibe la cuenta y la hora de la
   página, apunta la cuenta de los borradores y alinea las páginas guardadas. No hay un segundo
   componente. El módulo nuevo vive al lado del de #703, en `lib/offline/cuentaDelNavegador.ts`, y
   no en `lib/sync/`.
2. **La cuenta es la HUELLA, no el `userAccountId`.** #703 ya calcula en el layout los 16 primeros
   hexadecimales del SHA-256 del id y los guarda en el navegador. Los borradores guardan ese mismo
   valor y el servidor compara huellas, así que el id completo no llega nunca al `localStorage` ni a
   IndexedDB de un teléfono que puede ser compartido. La función deja de estar escrita dentro del
   layout y pasa a `lib/auth/huellaDeCuenta.ts`, porque ahora la usan tres sitios.
3. **Dos claves, una por pregunta.** `nn-pages-cuenta` (#703) dice para quién son las páginas
   guardadas, y sólo se apunta después de borrarlas. `nn-cuenta-del-navegador` (ésta) dice quién
   entró por última vez según el servidor, con la hora, para que una página vieja no gane. Si borrar
   la caché falla, la primera queda vacía y la segunda sigue sabiendo de quién son los borradores.

Y dos detalles que el plan añade porque el diseño los dejaba abiertos:

- **Un borrador sin cuenta queda apuntado tras su primera respuesta.** Si el servidor lo retiene,
  pasa a la cuenta que nombra el servidor: la retención trae la huella de quien registró el aparato.
  Si lo procesa, pasa a quien envía. La regla del aparato se resuelve una vez, no en cada envío.
- **Las fotos sólo comprueban el dueño cuando vienen de la cola.** El servicio recibe un campo
  `borrador` sólo en ese caso; una llamada desde el servidor con la sesión actual no lo trae.
```

- [ ] **Paso 5: Commit**

```bash
cat > "$S/msg-t0.txt" <<'EOF'
Especificación: cómo se aplica la nota de Daniel (un solo componente con #703)

La cuenta del borrador es la huella de #703 y no el id; el componente es
ServiceWorkerRegistration; dos claves en el navegador, una por pregunta.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git add docs/superpowers/specs/2026-10-09-borradores-con-dueno-design.md
git diff --cached --stat
git commit -q -F "$S/msg-t0.txt"; echo "commit=$?"
```

Esperado: `1 file changed`, `commit=0`.

---

### Tarea 1: Las decisiones puras: huella, dueño y qué se envía

**Archivos:**
- Crear: `lib/auth/huellaDeCuenta.ts`
- Crear: `lib/sync/cuentaDelBorrador.ts`
- Prueba: `tests/sync/cuentaDelBorrador.test.ts` (hermética: no se añade a `pruebas-por-compuerta.txt`)

**Interfaces:**
- Produce, en `lib/auth/huellaDeCuenta.ts`:
  - `huellaDeCuenta(userAccountId: string): string`
  - `cuentaParaElNavegador(userAccountId: string | null, ahora?: () => number): { cuenta: string | null; generadaEn: number }`
- Produce, en `lib/sync/cuentaDelBorrador.ts`:
  - `RAZON_BORRADOR_AJENO = "borrador_de_otra_cuenta"` y `RAZON_CUENTA_INVALIDA = "cuenta_del_borrador_invalida"`
  - `duenoDelBorrador(e: { cuentaDelBorrador: string | null | undefined; huellaDeQuienEnvia: string; quienEnvia: string; creadorDelAparato: string | null }): "propio" | "ajeno"`
  - `cuentaDelBorradorDe(v: unknown): { ok: true; cuenta: string | null } | { ok: false }`
  - `interface ConCuenta { cuenta?: string | null }`
  - `repartirPorCuenta<T extends ConCuenta>(borradores: readonly T[], cuentaActual: string | null): { enviables: T[]; ajenos: T[] }`
  - `interface RespuestaDeUnBorrador { status: string; reason?: string; cuentaDelBorrador?: string }`
  - `esRetencion(r: RespuestaDeUnBorrador): boolean`
  - `cuentaTrasRespuesta(cuentaDelBorrador: string | null | undefined, r: RespuestaDeUnBorrador, cuentaActual: string | null): string | null`
  - `type Desenlace<T> = { tipo: "enviado" } | { tipo: "retenido"; borrador: T } | { tipo: "rechazado"; borrador: T }`
  - `desenlaceDeUnBorrador<T extends ConCuenta & { status: string; errorMessage?: string }>(borrador: T, r: RespuestaDeUnBorrador, cuentaActual: string | null): Desenlace<T>`
  - `descartablesPorEstaCuenta<T extends ConCuenta & { status: string }>(borradores: readonly T[], cuentaActual: string | null): T[]`
  - `class BorradorAjenoError extends Error { readonly cuentaDelDueno: string | null }`

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `tests/sync/cuentaDelBorrador.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cuentaParaElNavegador, huellaDeCuenta } from "../../lib/auth/huellaDeCuenta";
import {
  RAZON_BORRADOR_AJENO,
  cuentaDelBorradorDe,
  cuentaTrasRespuesta,
  desenlaceDeUnBorrador,
  descartablesPorEstaCuenta,
  duenoDelBorrador,
  esRetencion,
  repartirPorCuenta,
} from "../../lib/sync/cuentaDelBorrador";

/**
 * ADR-199 — las decisiones de «de quién es un borrador», sin IndexedDB ni base.
 *
 * Este repositorio no tiene `fake-indexeddb` ni entorno DOM: por eso las colas delegan aquí todo lo
 * que se puede equivocar en silencio, igual que `clasificarRespuesta` o `classifyDraftAge`.
 */

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
// Calculadas aparte, no con la función bajo prueba: `printf '%s' <id> | shasum -a 256 | cut -c1-16`.
const HUELLA_A = "11e594f481958c10";
const HUELLA_B = "e79acd97ac880866";

describe("huellaDeCuenta", () => {
  it("son los 16 primeros hexadecimales del SHA-256 del id", () => {
    expect(huellaDeCuenta(A)).toBe(HUELLA_A);
    expect(huellaDeCuenta(B)).toBe(HUELLA_B);
  });

  it("el navegador recibe la huella, o null sin sesión, y la hora del servidor", () => {
    expect(cuentaParaElNavegador(A, () => 7)).toEqual({ cuenta: HUELLA_A, generadaEn: 7 });
    expect(cuentaParaElNavegador(null, () => 42)).toEqual({ cuenta: null, generadaEn: 42 });
  });
});

describe("duenoDelBorrador — visto desde el servidor", () => {
  const envia = { huellaDeQuienEnvia: HUELLA_B, quienEnvia: B };

  it("con la cuenta de quien envía es propio, aunque el aparato sea de otro", () => {
    expect(duenoDelBorrador({ ...envia, cuentaDelBorrador: HUELLA_B, creadorDelAparato: A })).toBe("propio");
  });

  it("con la cuenta de otra persona es ajeno, aunque el aparato sea de quien envía", () => {
    expect(duenoDelBorrador({ ...envia, cuentaDelBorrador: HUELLA_A, creadorDelAparato: B })).toBe("ajeno");
  });

  it("sin cuenta, en un aparato registrado por quien envía, es propio", () => {
    expect(duenoDelBorrador({ ...envia, cuentaDelBorrador: null, creadorDelAparato: B })).toBe("propio");
  });

  it("sin cuenta, en un aparato registrado por otra cuenta, es ajeno", () => {
    expect(duenoDelBorrador({ ...envia, cuentaDelBorrador: undefined, creadorDelAparato: A })).toBe("ajeno");
  });

  it("sin cuenta, en un aparato sin creador, es ajeno para todos", () => {
    expect(duenoDelBorrador({ ...envia, cuentaDelBorrador: null, creadorDelAparato: null })).toBe("ajeno");
  });
});

describe("cuentaDelBorradorDe — lo que llega en el JSON", () => {
  it("ausente y null son «sin cuenta»", () => {
    expect(cuentaDelBorradorDe(undefined)).toEqual({ ok: true, cuenta: null });
    expect(cuentaDelBorradorDe(null)).toEqual({ ok: true, cuenta: null });
  });

  it("una cadena no vacía es la cuenta", () => {
    expect(cuentaDelBorradorDe(HUELLA_A)).toEqual({ ok: true, cuenta: HUELLA_A });
  });

  it("una cadena vacía, un número o un objeto no se pueden comparar con nada", () => {
    expect(cuentaDelBorradorDe("")).toEqual({ ok: false });
    expect(cuentaDelBorradorDe(5)).toEqual({ ok: false });
    expect(cuentaDelBorradorDe({})).toEqual({ ok: false });
  });
});

describe("repartirPorCuenta — qué puede enviar este navegador", () => {
  const borradores = [
    { id: "de-a", cuenta: HUELLA_A },
    { id: "de-b", cuenta: HUELLA_B },
    { id: "legado" },
    { id: "nulo", cuenta: null },
  ];

  it("con cuenta actual: salen los suyos y los sin cuenta; los de otra se quedan", () => {
    const r = repartirPorCuenta(borradores, HUELLA_B);
    expect(r.enviables.map((b) => b.id)).toEqual(["de-b", "legado", "nulo"]);
    expect(r.ajenos.map((b) => b.id)).toEqual(["de-a"]);
  });

  it("sin cuenta actual: todo lo que tiene dueño es ajeno", () => {
    const r = repartirPorCuenta(borradores, null);
    expect(r.enviables.map((b) => b.id)).toEqual(["legado", "nulo"]);
    expect(r.ajenos.map((b) => b.id)).toEqual(["de-a", "de-b"]);
  });

  it("control: cada borrador cae en una sola de las dos listas", () => {
    const r = repartirPorCuenta(borradores, HUELLA_A);
    expect(r.enviables.length + r.ajenos.length).toBe(borradores.length);
  });
});

describe("cuentaTrasRespuesta y esRetencion", () => {
  const retenido = { status: "rejected", reason: RAZON_BORRADOR_AJENO, cuentaDelBorrador: HUELLA_A };

  it("un borrador con cuenta no cambia, diga lo que diga el servidor", () => {
    expect(cuentaTrasRespuesta(HUELLA_B, retenido, HUELLA_B)).toBe(HUELLA_B);
  });

  it("sin cuenta y retenido: pasa a la cuenta que nombró el servidor", () => {
    expect(cuentaTrasRespuesta(null, retenido, HUELLA_B)).toBe(HUELLA_A);
  });

  it("sin cuenta, retenido y sin dueño conocido: sigue sin cuenta", () => {
    expect(cuentaTrasRespuesta(undefined, { status: "rejected", reason: RAZON_BORRADOR_AJENO }, HUELLA_B)).toBeNull();
  });

  it("sin cuenta y procesado: era de quien envía, por la regla del aparato", () => {
    expect(cuentaTrasRespuesta(null, { status: "rejected", reason: "sample_code_required" }, HUELLA_B)).toBe(HUELLA_B);
  });

  it("esRetencion sólo reconoce su motivo", () => {
    expect(esRetencion(retenido)).toBe(true);
    expect(esRetencion({ status: "rejected", reason: "sample_code_required" })).toBe(false);
    expect(esRetencion({ status: "applied" })).toBe(false);
  });
});

describe("desenlaceDeUnBorrador — qué hace la cola con cada respuesta", () => {
  const borrador = { id: "x", status: "pending" as const, cuenta: null as string | null };

  it("applied y duplicate: enviado", () => {
    expect(desenlaceDeUnBorrador(borrador, { status: "applied" }, HUELLA_B)).toEqual({ tipo: "enviado" });
    expect(desenlaceDeUnBorrador(borrador, { status: "duplicate" }, HUELLA_B)).toEqual({ tipo: "enviado" });
  });

  it("retenido: sigue pendiente y NO pasa a error, apuntado al dueño que nombró el servidor", () => {
    const d = desenlaceDeUnBorrador(
      borrador,
      { status: "rejected", reason: RAZON_BORRADOR_AJENO, cuentaDelBorrador: HUELLA_A },
      HUELLA_B,
    );
    expect(d).toEqual({ tipo: "retenido", borrador: { id: "x", status: "pending", cuenta: HUELLA_A } });
  });

  it("rechazado por otro motivo: error, con su motivo, y apuntado a quien envía", () => {
    const d = desenlaceDeUnBorrador(borrador, { status: "rejected", reason: "sample_code_required" }, HUELLA_B);
    expect(d).toEqual({
      tipo: "rechazado",
      borrador: { id: "x", status: "error", cuenta: HUELLA_B, errorMessage: "sample_code_required" },
    });
  });

  it("un estado que no conoce no se da por enviado: se marca error y se ve", () => {
    expect(desenlaceDeUnBorrador(borrador, { status: "otro" }, HUELLA_B).tipo).toBe("rechazado");
  });
});

describe("descartablesPorEstaCuenta — el botón de descartar rechazados", () => {
  const borradores = [
    { id: "mio-error", status: "error", cuenta: HUELLA_B },
    { id: "mio-pendiente", status: "pending", cuenta: HUELLA_B },
    { id: "ajeno-error", status: "error", cuenta: HUELLA_A },
    { id: "legado-error", status: "error" },
  ];

  it("sólo los de esta cuenta y en error: ni los ajenos ni los que aún no tienen dueño", () => {
    expect(descartablesPorEstaCuenta(borradores, HUELLA_B).map((b) => b.id)).toEqual(["mio-error"]);
  });

  it("sin cuenta actual no se descarta nada", () => {
    expect(descartablesPorEstaCuenta(borradores, null)).toEqual([]);
  });
});
```

- [ ] **Paso 2: Comprobar que falla**

```bash
npx vitest run tests/sync/cuentaDelBorrador.test.ts > "$S/t1-rojo.txt" 2>&1; echo "vitest=$?"
grep -c -e 'Failed to resolve import' -e 'Cannot find module' "$S/t1-rojo.txt"
```

Esperado: `vitest=1`, y al menos 1 línea que diga que no encuentra los módulos.

- [ ] **Paso 3: Escribir `lib/auth/huellaDeCuenta.ts`**

```ts
import { createHash } from "node:crypto";

/**
 * La huella de una cuenta: los 16 primeros caracteres hexadecimales del SHA-256 de su id.
 *
 * **Es la ÚNICA forma en que una cuenta llega al navegador** (ADR-199). La usan dos cosas, y por eso
 * vive aquí y no escrita dentro del layout: saber si cambió la cuenta para borrar las páginas
 * guardadas (`lib/offline/paginasGuardadas.ts`, #703) y saber de quién es cada borrador offline
 * (`lib/sync/cuentaDelBorrador.ts`). Un teléfono puede ser compartido, y para comparar no hace falta
 * el id completo.
 *
 * 64 bits: dos cuentas de esta plataforma no van a coincidir. Si algún día coincidieran, el peor caso
 * es que un borrador de una saliera a nombre de la otra: el defecto que esto cierra, no uno nuevo.
 */
export function huellaDeCuenta(userAccountId: string): string {
  return createHash("sha256").update(userAccountId).digest("hex").slice(0, 16);
}

/**
 * Lo que el layout le pasa al navegador en cada carga: la huella, o `null` sin sesión, y la hora del
 * servidor a la que se generó la página.
 *
 * La hora ordena las cargas: una página vieja servida desde la caché del service worker no puede
 * pisar a una más reciente. Ver `lib/offline/cuentaDelNavegador.ts`. Se calcula aquí y no en el
 * cuerpo del layout para no llamar a `Date.now()` durante el render de un componente.
 */
export function cuentaParaElNavegador(
  userAccountId: string | null,
  ahora: () => number = Date.now,
): { cuenta: string | null; generadaEn: number } {
  return { cuenta: userAccountId ? huellaDeCuenta(userAccountId) : null, generadaEn: ahora() };
}
```

- [ ] **Paso 4: Escribir `lib/sync/cuentaDelBorrador.ts`**

```ts
/**
 * ADR-199 — cada borrador offline tiene dueño, y nunca se envía a nombre de otra cuenta.
 *
 * Funciones puras, compartidas por el navegador (las tres colas) y el servidor (el lote y las fotos).
 * Ni IndexedDB ni base de datos: por eso se pueden probar en Node, igual que `clasificarRespuesta` o
 * `classifyDraftAge`. Las colas delegan aquí todo lo que se puede equivocar en silencio.
 *
 * El dueño es la HUELLA de la cuenta (`lib/auth/huellaDeCuenta.ts`), nunca su id.
 */

/**
 * El motivo con que el servidor retiene un borrador de otra cuenta.
 *
 * **Es un «rechazado» a propósito, no un estado nuevo.** El JavaScript viejo que siga en la caché de
 * un teléfono trata cualquier estado que no conoce como éxito y DESCARTA el borrador; con `rejected`
 * lo marca como error, y se ve. El cliente nuevo reconoce este motivo y lo deja pendiente.
 */
export const RAZON_BORRADOR_AJENO = "borrador_de_otra_cuenta";

/** La mutación trae una cuenta que no es una cadena no vacía. Se rechaza sólo esa mutación. */
export const RAZON_CUENTA_INVALIDA = "cuenta_del_borrador_invalida";

/**
 * De quién es un borrador, visto desde el servidor.
 *
 * - Con cuenta, es propio sólo si coincide con la huella de quien envía.
 * - Sin cuenta (guardado antes de ADR-199, o anotado sin sesión), es de quien registró el aparato
 *   (`Device.createdBy`): decisión de Daniel del 2026-10-09. Un aparato sin creador no es de nadie,
 *   así que el borrador es ajeno para todos.
 */
export function duenoDelBorrador(e: {
  cuentaDelBorrador: string | null | undefined;
  huellaDeQuienEnvia: string;
  quienEnvia: string;
  creadorDelAparato: string | null;
}): "propio" | "ajeno" {
  if (e.cuentaDelBorrador != null) return e.cuentaDelBorrador === e.huellaDeQuienEnvia ? "propio" : "ajeno";
  return e.creadorDelAparato !== null && e.creadorDelAparato === e.quienEnvia ? "propio" : "ajeno";
}

/**
 * La cuenta que trae una mutación, tal como llega del JSON.
 *
 * Ausente o `null` es «sin cuenta». Lo demás que no sea una cadena no vacía no se puede comparar con
 * nada, y se dice en vez de tratarlo como «sin cuenta»: eso lo mandaría por la regla del aparato, que
 * es otra pregunta.
 */
export function cuentaDelBorradorDe(v: unknown): { ok: true; cuenta: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, cuenta: null };
  if (typeof v === "string" && v !== "") return { ok: true, cuenta: v };
  return { ok: false };
}

/** Lo mínimo que tienen en común los borradores de las tres colas. */
export interface ConCuenta {
  cuenta?: string | null;
}

/**
 * Qué borradores puede enviar este navegador ahora.
 *
 * Los de la cuenta actual, y los que no tienen cuenta: ésos los decide el servidor por el aparato. Los
 * de otra cuenta no salen del teléfono. Sin cuenta actual —nadie ha entrado, o se cerró sesión—, todo
 * lo que tiene dueño es ajeno.
 */
export function repartirPorCuenta<T extends ConCuenta>(
  borradores: readonly T[],
  cuentaActual: string | null,
): { enviables: T[]; ajenos: T[] } {
  const enviables: T[] = [];
  const ajenos: T[] = [];
  for (const b of borradores) {
    if (b.cuenta == null || (cuentaActual !== null && b.cuenta === cuentaActual)) enviables.push(b);
    else ajenos.push(b);
  }
  return { enviables, ajenos };
}

/** Lo que el servidor contestó para UN borrador, en la forma que comparten el lote y las fotos. */
export interface RespuestaDeUnBorrador {
  status: string;
  reason?: string;
  /** Sólo en la retención de un borrador sin cuenta: la huella de quien registró el aparato. */
  cuentaDelBorrador?: string;
}

export function esRetencion(r: RespuestaDeUnBorrador): boolean {
  return r.status === "rejected" && r.reason === RAZON_BORRADOR_AJENO;
}

/**
 * La cuenta que queda apuntada en un borrador después de una respuesta del servidor.
 *
 * Sólo cambia la de un borrador SIN cuenta, y es lo que hace que la regla del aparato se resuelva una
 * sola vez. Si el servidor lo retuvo, pasa a ser del dueño que el servidor nombró, y deja de contarse
 * como propio. Si lo procesó, era de quien envía, por la misma regla.
 */
export function cuentaTrasRespuesta(
  cuentaDelBorrador: string | null | undefined,
  r: RespuestaDeUnBorrador,
  cuentaActual: string | null,
): string | null {
  if (cuentaDelBorrador != null) return cuentaDelBorrador;
  if (esRetencion(r)) return r.cuentaDelBorrador ?? null;
  return cuentaActual;
}

export type Desenlace<T> = { tipo: "enviado" } | { tipo: "retenido"; borrador: T } | { tipo: "rechazado"; borrador: T };

/**
 * Qué hace una cola con la respuesta del servidor a uno de sus borradores.
 *
 * - `enviado`: `applied` o `duplicate`. Se descarta.
 * - `retenido`: de otra cuenta. **Sigue pendiente, nunca pasa a error**: no hay nada mal en él, sólo
 *   que no es de quien envía. Si la pantalla lo mostrara como rechazado, ofrecería descartarlo.
 * - `rechazado`: el servidor lo evaluó y lo negó. Error, con su motivo.
 *
 * Un estado que no conoce se trata como rechazo y no como envío: darlo por enviado lo borraría del
 * teléfono sin que nadie supiera si llegó.
 */
export function desenlaceDeUnBorrador<T extends ConCuenta & { status: string; errorMessage?: string }>(
  borrador: T,
  r: RespuestaDeUnBorrador,
  cuentaActual: string | null,
): Desenlace<T> {
  if (r.status === "applied" || r.status === "duplicate") return { tipo: "enviado" };
  const cuenta = cuentaTrasRespuesta(borrador.cuenta, r, cuentaActual);
  if (esRetencion(r)) return { tipo: "retenido", borrador: { ...borrador, cuenta } };
  return { tipo: "rechazado", borrador: { ...borrador, cuenta, status: "error", errorMessage: r.reason ?? "rejected" } };
}

/**
 * Lo que el botón «descartar fallidas» puede borrar: los borradores en error de ESTA cuenta.
 *
 * Antes borraba todo lo que estuviera en error, incluidos los borradores de otra cuenta que el
 * servidor había rechazado por falta de acceso: trabajo de A destruido desde la sesión de B. Un
 * borrador sin cuenta tampoco entra. Queda apuntado en su primera respuesta (`cuentaTrasRespuesta`),
 * y a partir de ahí ya se sabe de quién es.
 */
export function descartablesPorEstaCuenta<T extends ConCuenta & { status: string }>(
  borradores: readonly T[],
  cuentaActual: string | null,
): T[] {
  if (cuentaActual === null) return [];
  return borradores.filter((b) => b.status === "error" && b.cuenta === cuentaActual);
}

/**
 * El servidor se niega a procesar un borrador de otra cuenta. Lo lanzan las fotos
 * (`lib/traceability/landMedia.ts`) y lo traducen sus acciones a `{ retenida: true }`.
 */
export class BorradorAjenoError extends Error {
  readonly cuentaDelDueno: string | null;

  constructor(cuentaDelDueno: string | null) {
    super(RAZON_BORRADOR_AJENO);
    this.cuentaDelDueno = cuentaDelDueno;
  }
}
```

- [ ] **Paso 5: Comprobar que pasa**

```bash
npx vitest run tests/sync/cuentaDelBorrador.test.ts > "$S/t1-verde.txt" 2>&1; echo "vitest=$?"
grep -e 'Test Files' -e 'Tests ' "$S/t1-verde.txt"
```

Esperado: `vitest=0`, `Test Files 1 passed (1)` y `Tests 24 passed (24)`. Si el número de pruebas no es 24,
contar los `it(` del archivo y explicar la diferencia antes de seguir.

- [ ] **Paso 6: Tipos**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run typecheck > "$S/t1-tipos.txt" 2>&1; echo "typecheck=$?"
```

Esperado: `typecheck=0`.

- [ ] **Paso 7: Commit**

```bash
cat > "$S/msg-t1.txt" <<'EOF'
ADR-199: las decisiones puras de a quién pertenece un borrador offline

huellaDeCuenta (la de #703, ahora en un solo sitio) y lib/sync/cuentaDelBorrador:
de quién es, qué se envía, qué pasa tras cada respuesta y qué se puede descartar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git add lib/auth/huellaDeCuenta.ts lib/sync/cuentaDelBorrador.ts tests/sync/cuentaDelBorrador.test.ts
git diff --cached --stat
git commit -q -F "$S/msg-t1.txt"; echo "commit=$?"
```

Esperado: 3 archivos y `commit=0`.

---

### Tarea 2: La cuenta del navegador, en el componente de #703

**Archivos:**
- Crear: `lib/offline/cuentaDelNavegador.ts`
- Modificar: `app/components/ServiceWorkerRegistration.tsx`
- Modificar: `app/layout.tsx`
- Prueba: `tests/offline/cuentaDelNavegador.test.ts` (hermética)

**Interfaces:**
- Consume: `cuentaParaElNavegador` (Tarea 1).
- Produce, en `lib/offline/cuentaDelNavegador.ts`:
  - `CLAVE_CUENTA_DEL_NAVEGADOR = "nn-cuenta-del-navegador"`
  - `interface CuentaApuntada { cuenta: string | null; generadaEn: number }`
  - `leerCuentaApuntada(raw: string | null): CuentaApuntada | null`
  - `cuentaVigente(guardada: CuentaApuntada | null, nueva: CuentaApuntada): CuentaApuntada`
  - `apuntarCuentaDelNavegador(nueva: CuentaApuntada): void`
  - `cuentaActualDelNavegador(): string | null`

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `tests/offline/cuentaDelNavegador.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLAVE_CUENTA_DEL_NAVEGADOR,
  apuntarCuentaDelNavegador,
  cuentaActualDelNavegador,
  cuentaVigente,
  leerCuentaApuntada,
} from "../../lib/offline/cuentaDelNavegador";

/**
 * ADR-199 — quién entró por última vez en este navegador, según el servidor.
 *
 * La hora de generación de la página es lo que impide que una página vieja de A —servida desde la
 * caché del service worker si borrarla falló— apunte A cuando quien usa el teléfono es B. B tuvo que
 * entrar con señal, así que su página es siempre posterior.
 */

let almacen: Map<string, string>;

beforeEach(() => {
  almacen = new Map();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => void almacen.set(k, v),
      removeItem: (k: string) => void almacen.delete(k),
    },
  });
});

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("cuentaVigente", () => {
  it("gana la página generada más tarde", () => {
    expect(cuentaVigente({ cuenta: "a", generadaEn: 100 }, { cuenta: "b", generadaEn: 200 })).toEqual({ cuenta: "b", generadaEn: 200 });
  });

  it("una página más vieja no pisa a la guardada", () => {
    expect(cuentaVigente({ cuenta: "b", generadaEn: 200 }, { cuenta: "a", generadaEn: 100 })).toEqual({ cuenta: "b", generadaEn: 200 });
  });

  it("un null más reciente sí la pisa: se cerró sesión", () => {
    expect(cuentaVigente({ cuenta: "b", generadaEn: 200 }, { cuenta: null, generadaEn: 300 })).toEqual({ cuenta: null, generadaEn: 300 });
  });

  it("sin nada guardado vale la nueva", () => {
    expect(cuentaVigente(null, { cuenta: "a", generadaEn: 1 })).toEqual({ cuenta: "a", generadaEn: 1 });
  });
});

describe("leerCuentaApuntada", () => {
  it("lo que no es JSON, o no tiene la forma, se lee como nada", () => {
    for (const raw of [null, "", "x", "{}", '{"cuenta":1,"generadaEn":1}', '{"cuenta":"a","generadaEn":"1"}', '{"cuenta":"","generadaEn":1}']) {
      expect(leerCuentaApuntada(raw)).toBeNull();
    }
  });

  it("control: la forma buena se lee, con cuenta y sin ella", () => {
    expect(leerCuentaApuntada('{"cuenta":"a","generadaEn":5}')).toEqual({ cuenta: "a", generadaEn: 5 });
    expect(leerCuentaApuntada('{"cuenta":null,"generadaEn":5}')).toEqual({ cuenta: null, generadaEn: 5 });
  });
});

describe("apuntarCuentaDelNavegador y cuentaActualDelNavegador", () => {
  it("B entra después de A: la cuenta actual es B", () => {
    apuntarCuentaDelNavegador({ cuenta: "huella-a", generadaEn: 100 });
    apuntarCuentaDelNavegador({ cuenta: "huella-b", generadaEn: 200 });
    expect(cuentaActualDelNavegador()).toBe("huella-b");
  });

  it("una página de A que llega después, pero generada antes, no la cambia", () => {
    apuntarCuentaDelNavegador({ cuenta: "huella-b", generadaEn: 200 });
    apuntarCuentaDelNavegador({ cuenta: "huella-a", generadaEn: 100 });
    expect(cuentaActualDelNavegador()).toBe("huella-b");
    expect(JSON.parse(almacen.get(CLAVE_CUENTA_DEL_NAVEGADOR) ?? "null")).toEqual({ cuenta: "huella-b", generadaEn: 200 });
  });

  it("sin nada apuntado no hay cuenta", () => {
    expect(cuentaActualDelNavegador()).toBeNull();
  });

  it("sin almacenamiento local no lanza, y no hay cuenta", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(() => apuntarCuentaDelNavegador({ cuenta: "huella-a", generadaEn: 1 })).not.toThrow();
    expect(cuentaActualDelNavegador()).toBeNull();
  });
});
```

- [ ] **Paso 2: Comprobar que falla**

```bash
npx vitest run tests/offline/cuentaDelNavegador.test.ts > "$S/t2-rojo.txt" 2>&1; echo "vitest=$?"
```

Esperado: `vitest=1`, porque no encuentra el módulo.

- [ ] **Paso 3: Escribir `lib/offline/cuentaDelNavegador.ts`**

```ts
/**
 * ADR-199 — quién entró por última vez en este navegador, según el servidor.
 *
 * Las tres colas offline leen de aquí de quién es un borrador al guardarlo y qué pueden enviar. Lo
 * escribe `ServiceWorkerRegistration`, el mismo componente que alinea las páginas guardadas (#703),
 * con lo que le pasa el layout en cada carga: la huella de la cuenta y la hora del servidor.
 *
 * **Por qué una clave propia y no `nn-pages-cuenta`.** Ésa responde a otra pregunta —para quién son
 * las páginas guardadas— y sólo se apunta DESPUÉS de borrarlas. Si borrar la caché falla, queda vacía,
 * y un borrador anotado entonces saldría sin cuenta, es decir, por la regla del aparato, a nombre de
 * quien no lo escribió.
 *
 * **Por qué la hora.** Si borrar la caché falló y una página de A sigue guardada, B puede abrirla sin
 * señal, y ese HTML trae la huella de A. La hora de A es anterior a la de B, porque B tuvo que entrar
 * con señal, así que no gana.
 *
 * Sólo cliente: `localStorage` no existe en el servidor. Sin él (navegación privada), no hay cuenta, y
 * los borradores los decide el servidor por el aparato.
 */

export const CLAVE_CUENTA_DEL_NAVEGADOR = "nn-cuenta-del-navegador";

export interface CuentaApuntada {
  /** La huella de la cuenta (`lib/auth/huellaDeCuenta.ts`), o `null` si la página se generó sin sesión. */
  cuenta: string | null;
  /** Hora del servidor, en milisegundos, a la que se generó la página. */
  generadaEn: number;
}

/** Lo que haya en la clave, si tiene la forma; cualquier otra cosa es «nada». */
export function leerCuentaApuntada(raw: string | null): CuentaApuntada | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { cuenta, generadaEn } = v as { cuenta?: unknown; generadaEn?: unknown };
    if (typeof generadaEn !== "number" || !Number.isFinite(generadaEn)) return null;
    if (cuenta !== null && (typeof cuenta !== "string" || cuenta === "")) return null;
    return { cuenta, generadaEn };
  } catch {
    return null;
  }
}

/** Gana la página generada más tarde; un empate lo gana la nueva. */
export function cuentaVigente(guardada: CuentaApuntada | null, nueva: CuentaApuntada): CuentaApuntada {
  return guardada !== null && guardada.generadaEn > nueva.generadaEn ? guardada : nueva;
}

export function apuntarCuentaDelNavegador(nueva: CuentaApuntada): void {
  try {
    const vigente = cuentaVigente(leerCuentaApuntada(localStorage.getItem(CLAVE_CUENTA_DEL_NAVEGADOR)), nueva);
    if (vigente === nueva) localStorage.setItem(CLAVE_CUENTA_DEL_NAVEGADOR, JSON.stringify(nueva));
  } catch {
    // Sin almacenamiento local: los borradores quedan sin cuenta y el servidor los decide por el aparato.
  }
}

export function cuentaActualDelNavegador(): string | null {
  try {
    return leerCuentaApuntada(localStorage.getItem(CLAVE_CUENTA_DEL_NAVEGADOR))?.cuenta ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Paso 4: Comprobar que pasa**

```bash
npx vitest run tests/offline/cuentaDelNavegador.test.ts > "$S/t2-verde.txt" 2>&1; echo "vitest=$?"
grep -e 'Test Files' -e 'Tests ' "$S/t2-verde.txt"
```

Esperado: `vitest=0` y `Tests 10 passed (10)`.

- [ ] **Paso 5: El componente de #703 apunta la cuenta**

En `app/components/ServiceWorkerRegistration.tsx`, añadir la importación debajo de la de `alinearConLaCuenta`:

```tsx
import { apuntarCuentaDelNavegador } from "../../lib/offline/cuentaDelNavegador";
```

Sustituir la línea de la firma:

```tsx
export function ServiceWorkerRegistration({ cuenta }: { cuenta: string | null }) {
```

por:

```tsx
export function ServiceWorkerRegistration({ cuenta, generadaEn }: { cuenta: string | null; generadaEn: number }) {
```

y sustituir el segundo efecto:

```tsx
  useEffect(() => {
    alinearConLaCuenta(cuenta).catch(() => {
      // Sin CacheStorage no hay páginas guardadas que borrar.
    });
  }, [cuenta]);
```

por:

```tsx
  useEffect(() => {
    // ADR-199 — primero la cuenta de los borradores, que es síncrona y no depende de CacheStorage: si
    // borrar las páginas falla, los borradores siguen sabiendo de quién son.
    apuntarCuentaDelNavegador({ cuenta, generadaEn });
    alinearConLaCuenta(cuenta).catch(() => {
      // Sin CacheStorage no hay páginas guardadas que borrar.
    });
  }, [cuenta, generadaEn]);
```

En el comentario de cabecera del componente, añadir al final del párrafo que explica `cuenta`:

```tsx
 * `generadaEn` es la hora del servidor a la que se generó esta página. Con ella se apunta, además,
 * de quién son los borradores que se anoten desde aquí (ADR-199): ver
 * `lib/offline/cuentaDelNavegador.ts`.
```

- [ ] **Paso 6: El layout usa la función compartida**

En `app/layout.tsx`:

1. Sustituir `import { createHash } from "node:crypto";` por:

```tsx
import { cuentaParaElNavegador } from "../lib/auth/huellaDeCuenta";
```

2. Sustituir:

```tsx
  // La huella y no el id: se apunta en el `localStorage` de un teléfono que
  // puede ser compartido, y sólo sirve para saber si la cuenta cambió.
  const huellaDeCuenta = user ? createHash("sha256").update(user.userAccountId).digest("hex").slice(0, 16) : null;
```

por:

```tsx
  // La huella y no el id: se apunta en el `localStorage` y en los borradores de un teléfono que puede
  // ser compartido. Sirve para saber si la cuenta cambió (páginas guardadas, #703) y de quién es cada
  // borrador (ADR-199). La hora ordena las cargas, para que una página vieja no gane.
  const paraElNavegador = cuentaParaElNavegador(user?.userAccountId ?? null);
```

3. Sustituir `<ServiceWorkerRegistration cuenta={huellaDeCuenta} />` por:

```tsx
        <ServiceWorkerRegistration cuenta={paraElNavegador.cuenta} generadaEn={paraElNavegador.generadaEn} />
```

4. Comprobar que no queda ninguna referencia vieja:

```bash
printf 'createHash en el layout (debe ser 0): '; grep -c -e 'createHash' app/layout.tsx
printf 'huellaDeCuenta en el layout (debe ser 0): '; grep -c -e 'huellaDeCuenta' app/layout.tsx
printf 'control, cuentaParaElNavegador (debe ser 2): '; grep -c -e 'cuentaParaElNavegador' app/layout.tsx
```

- [ ] **Paso 7: Tipos, lint y build**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run verify > "$S/t2-verify.txt" 2>&1; echo "verify=$?"
NODE_OPTIONS="--max-old-space-size=4096" npm run build > "$S/t2-build.txt" 2>&1; echo "build=$?"
```

Esperado: los dos `=0`. `vitest` no comprueba tipos, y el build es lo único que ve un fallo de un
componente cliente.

- [ ] **Paso 8: Commit**

```bash
cat > "$S/msg-t2.txt" <<'EOF'
ADR-199: el componente de #703 apunta también de quién son los borradores

ServiceWorkerRegistration recibe la hora del servidor y escribe la cuenta en
nn-cuenta-del-navegador, ordenada por esa hora; el layout deja de calcular el
hash a mano y usa cuentaParaElNavegador.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git add lib/offline/cuentaDelNavegador.ts tests/offline/cuentaDelNavegador.test.ts app/components/ServiceWorkerRegistration.tsx app/layout.tsx
git diff --cached --stat
git commit -q -F "$S/msg-t2.txt"; echo "commit=$?"
```

Esperado: 4 archivos y `commit=0`.

---

### Tarea 3: El lote no procesa un borrador de otra cuenta

**Archivos:**
- Modificar: `lib/sync/parsearMutaciones.ts` (arriba del bucle y la rama de `field_event`)
- Modificar: `lib/sync/pushFieldEvents.ts` (`PushMutation`, `PushResult`, la consulta del aparato y el bucle)
- Prueba hermética: `tests/sync/parseoDeLaCuenta.test.ts`
- Prueba con base: `tests/sync/borradoresConDueno.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Consume: `huellaDeCuenta`, `cuentaDelBorradorDe`, `duenoDelBorrador`, `RAZON_BORRADOR_AJENO`, `RAZON_CUENTA_INVALIDA` (Tarea 1).
- Produce:
  - Cada mutación de `PushMutation` puede llevar `cuentaDelBorrador?: string | null`; `parsearMutaciones` lo deja normalizado (cadena o `null`).
  - `PushResult` rechazado gana `cuentaDelBorrador?: string`: la huella de quien registró el aparato, sólo en la retención de un borrador sin cuenta.

- [ ] **Paso 1: La base desechable de esta tarea**

```bash
PSQL=/Applications/Postgres.app/Contents/Versions/latest/bin/psql
[ -x "$PSQL" ] && echo "psql presente"
"$PSQL" "postgresql://postgres@127.0.0.1:55433/postgres" -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"nectar_ci_borradores\" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';"
echo "crear=$?"
"$PSQL" "postgresql://postgres@127.0.0.1:55433/nectar_ci_borradores" -At -c "select current_database(), upper('ñ');"
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_ci_borradores
export DATABASE_URL="$TEST_DATABASE_URL"
npx prisma migrate deploy > "$S/t3-migrar.txt" 2>&1; echo "migrar=$?"
SEED_DEMO_ADMIN=true SEED_DEMO_CONTENT=true SEED_DEMO_PARTNER=true SEED_DEMO_JUDGE=true npm run db:seed > "$S/t3-semilla.txt" 2>&1; echo "semilla=$?"
```

Esperado: `psql presente`, `crear=0`, la fila `nectar_ci_borradores|Ñ` (con `ñ` minúscula, la base se creó mal
y se para), `migrar=0` y `semilla=0`. A partir de aquí, toda orden de esta tarea va con esas dos variables
exportadas.

- [ ] **Paso 2: Escribir las pruebas que fallan**

Crear `tests/sync/parseoDeLaCuenta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsearMutaciones } from "../../lib/sync/parsearMutaciones";
import { RAZON_CUENTA_INVALIDA } from "../../lib/sync/cuentaDelBorrador";

/**
 * ADR-199 — el parseo valida la cuenta del borrador una vez, para todos los tipos, y la deja
 * normalizada: una cadena o `null`, nunca `undefined` ni otra cosa.
 */

const HUELLA = "11e594f481958c10";

const muestra = (extra: Record<string, unknown> = {}) => ({
  kind: "soil_sample",
  clientDraftId: "d1",
  locationId: "loc1",
  sampleCode: "S-01",
  sampledAt: "2026-09-16T12:00:00.000Z",
  provenanceClass: "direct_observation",
  ...extra,
});

const evento = (extra: Record<string, unknown> = {}) => ({
  clientDraftId: "e1",
  fieldSessionId: "fs1",
  eventKindValueId: "k1",
  occurredAt: "2026-09-16T12:00:00.000Z",
  ...extra,
});

describe("parsearMutaciones y cuentaDelBorrador", () => {
  it("la cuenta viaja en una mutación que se copia entera (parcela)", () => {
    const r = parsearMutaciones([muestra({ cuentaDelBorrador: HUELLA })]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]).toMatchObject({ kind: "soil_sample", cuentaDelBorrador: HUELLA });
  });

  it("y en la de evento de campo, que se construye campo a campo", () => {
    const r = parsearMutaciones([evento({ cuentaDelBorrador: HUELLA })]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations[0]).toMatchObject({ clientDraftId: "e1", cuentaDelBorrador: HUELLA });
  });

  it("sin cuenta llega null en los dos caminos", () => {
    const r = parsearMutaciones([muestra(), evento()]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(2);
    expect(r.mutations.map((m) => m.cuentaDelBorrador)).toEqual([null, null]);
  });

  it("una cuenta que no es cadena se rechaza SOLA, y las demás pasan", () => {
    const r = parsearMutaciones([
      muestra({ clientDraftId: "malo", cuentaDelBorrador: 5 }),
      muestra({ clientDraftId: "bueno", cuentaDelBorrador: HUELLA }),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations.map((m) => m.clientDraftId)).toEqual(["bueno"]);
    expect(r.rechazos).toEqual([{ clientDraftId: "malo", reason: RAZON_CUENTA_INVALIDA }]);
  });

  it("una cuenta vacía también se rechaza", () => {
    const r = parsearMutaciones([muestra({ cuentaDelBorrador: "" })]);
    expect(r.ok && r.rechazos).toEqual([{ clientDraftId: "d1", reason: RAZON_CUENTA_INVALIDA }]);
  });

  it("sin clientDraftId no hay a quién atribuir el rechazo: 400 de lote", () => {
    expect(parsearMutaciones([{ kind: "soil_sample", cuentaDelBorrador: 5 }])).toEqual({ ok: false, error: "mutation_malformed" });
  });
});
```

Crear `tests/sync/borradoresConDueno.test.ts`:

```ts
/**
 * ADR-199 — el servidor no procesa un borrador de otra cuenta.
 *
 * Postgres real, sin mocks. La limpieza DESCUBRE lo que tiene que borrar consultando por el RUN_ID, en
 * vez de heredar variables del `beforeAll`: si éste muere a mitad, el `afterAll` limpia igual, y al
 * final cuenta que no quede nada del RUN_ID.
 *
 * Cada caso de «ajeno» cuenta filas antes y después. Un rechazo con la fila escrita igual sería el
 * defecto entero, y un `toMatchObject` sobre el resultado no lo vería.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { pushFieldEvents, type MutacionDeMuestraDeSuelo, type MutacionDeRevisionDeTrampa } from "../../lib/sync/pushFieldEvents";
import { createTrap } from "../../lib/traceability/traps";
import { huellaDeCuenta } from "../../lib/auth/huellaDeCuenta";
import { RAZON_BORRADOR_AJENO } from "../../lib/sync/cuentaDelBorrador";

const RUN_ID = `borradores-con-dueno-${Date.now()}`;

let plotId: string;
let cuentaA: string;
let cuentaB: string;
let aparatoDeA: string;
let aparatoDeB: string;
let aparatoSinCreador: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  // `createTrap` exige un `site` antepasado: un `plot` suelto es una topología que el dominio no produce.
  const site = await prisma.location.create({
    data: { locationType: "site", name: `TEST Site (${RUN_ID})`, organizationId: org.id, status: "approved", classification: "internal" },
  });
  const plot = await prisma.location.create({
    data: {
      locationType: "plot",
      name: `TEST Plot (${RUN_ID})`,
      organizationId: org.id,
      parentLocationId: site.id,
      status: "approved",
      classification: "internal",
    },
  });
  plotId = plot.id;

  // Las dos cuentas tienen acceso al mismo sitio, a propósito: así un «ajeno» no se puede confundir con
  // un rechazo por falta de acceso. Farm Operator de esa parcela, no Platform Admin.
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } });
  const crearCuenta = async (nombre: string) => {
    const persona = await prisma.person.create({
      data: { givenName: "TEST", familyName: nombre, displayName: `TEST ${nombre} (${RUN_ID})`, locale: "es" },
    });
    const cuenta = await prisma.userAccount.create({
      data: { personId: persona.id, authProvider: "credentials", status: "active" },
    });
    await prisma.assignment.create({ data: { userAccountId: cuenta.id, roleProfileId: perfil.id, scopeId: scope.id } });
    return cuenta.id;
  };
  cuentaA = await crearCuenta("A");
  cuentaB = await crearCuenta("B");

  aparatoDeA = (await prisma.device.create({ data: { label: `TEST de A (${RUN_ID})`, platform: "pwa", createdBy: cuentaA } })).id;
  aparatoDeB = (await prisma.device.create({ data: { label: `TEST de B (${RUN_ID})`, platform: "pwa", createdBy: cuentaB } })).id;
  aparatoSinCreador = (await prisma.device.create({ data: { label: `TEST sin creador (${RUN_ID})`, platform: "pwa" } })).id;
});

afterAll(async () => {
  const ubicacionIds = (await prisma.location.findMany({ where: { name: { contains: RUN_ID } }, select: { id: true } })).map((u) => u.id);
  const personaIds = (await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } })).map((p) => p.id);
  const cuentaIds = (await prisma.userAccount.findMany({ where: { personId: { in: personaIds } }, select: { id: true } })).map((c) => c.id);

  await prisma.asset.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicacionIds } }) });
  await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: ubicacionIds } } }) });
  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicacionIds } }) });
  await prisma.soilSample.deleteMany({ where: assertDefinedWhere({ sampleCode: { startsWith: RUN_ID } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentaIds } }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ label: { contains: RUN_ID } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentaIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeType: "location", scopeRefId: { in: ubicacionIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentaIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personaIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicacionIds }, locationType: "plot" }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicacionIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN_ID } }) });

  // Control de la limpieza: lo que distingue «limpió» de «pasó».
  expect(await prisma.location.count({ where: { name: { contains: RUN_ID } } })).toBe(0);
  expect(await prisma.person.count({ where: { displayName: { contains: RUN_ID } } })).toBe(0);
  expect(await prisma.device.count({ where: { label: { contains: RUN_ID } } })).toBe(0);
});

const muestra = (clientDraftId: string, cuentaDelBorrador?: string | null) =>
  ({
    kind: "soil_sample",
    clientDraftId,
    locationId: plotId,
    sampleCode: `${RUN_ID}-${clientDraftId}`,
    sampledAt: new Date("2026-09-16T12:00:00Z"),
    provenanceClass: "direct_observation",
    cuentaDelBorrador,
  }) satisfies MutacionDeMuestraDeSuelo & { cuentaDelBorrador?: string | null };

const filasDe = (clientDraftId: string) => prisma.soilSample.count({ where: { clientDraftId } });
const auditoriaDe = (cuenta: string) => prisma.auditEvent.count({ where: { actorUserAccountId: cuenta } });

describe("el lote no procesa un borrador de otra cuenta (ADR-199)", () => {
  it("control: con la cuenta de quien envía, se aplica", async () => {
    const id = `${RUN_ID}-propio`;
    const antes = await auditoriaDe(cuentaB);
    const [r] = await pushFieldEvents(cuentaB, aparatoDeB, [muestra(id, huellaDeCuenta(cuentaB))]);
    expect(r).toMatchObject({ status: "applied" });
    expect(await filasDe(id)).toBe(1);
    expect(await auditoriaDe(cuentaB)).toBeGreaterThan(antes);
  });

  it("con la cuenta de otra persona: retenido, sin fila y sin AuditEvent", async () => {
    const id = `${RUN_ID}-de-a`;
    const antes = await auditoriaDe(cuentaB);
    const [r] = await pushFieldEvents(cuentaB, aparatoDeB, [muestra(id, huellaDeCuenta(cuentaA))]);
    expect(r).toEqual({ clientDraftId: id, status: "rejected", reason: RAZON_BORRADOR_AJENO });
    expect(await filasDe(id)).toBe(0);
    expect(await auditoriaDe(cuentaB)).toBe(antes);
  });

  it("sin cuenta, en el aparato de quien envía: se aplica, por la regla del aparato", async () => {
    const id = `${RUN_ID}-legado-propio`;
    const [r] = await pushFieldEvents(cuentaB, aparatoDeB, [muestra(id, null)]);
    expect(r).toMatchObject({ status: "applied" });
    expect(await filasDe(id)).toBe(1);
  });

  it("sin cuenta, en el aparato de otra cuenta: retenido, sin fila, y dice de quién es", async () => {
    const id = `${RUN_ID}-legado-de-a`;
    const antes = await auditoriaDe(cuentaB);
    const [r] = await pushFieldEvents(cuentaB, aparatoDeA, [muestra(id)]);
    expect(r).toEqual({ clientDraftId: id, status: "rejected", reason: RAZON_BORRADOR_AJENO, cuentaDelBorrador: huellaDeCuenta(cuentaA) });
    expect(await filasDe(id)).toBe(0);
    expect(await auditoriaDe(cuentaB)).toBe(antes);
  });

  it("sin cuenta, en un aparato sin creador: retenido, y sin dueño que nombrar", async () => {
    const id = `${RUN_ID}-legado-sin-creador`;
    const [r] = await pushFieldEvents(cuentaB, aparatoSinCreador, [muestra(id, null)]);
    expect(r).toEqual({ clientDraftId: id, status: "rejected", reason: RAZON_BORRADOR_AJENO });
    expect(await filasDe(id)).toBe(0);
  });

  it("en un lote mixto, lo propio entra y lo ajeno se retiene, en la misma petición", async () => {
    const propio = `${RUN_ID}-mixto-propio`;
    const ajeno = `${RUN_ID}-mixto-ajeno`;
    const resultados = await pushFieldEvents(cuentaB, aparatoDeB, [
      muestra(propio, huellaDeCuenta(cuentaB)),
      muestra(ajeno, huellaDeCuenta(cuentaA)),
    ]);
    expect(resultados.map((r) => [r.clientDraftId, r.status])).toEqual([
      [propio, "applied"],
      [ajeno, "rejected"],
    ]);
    expect(await filasDe(propio)).toBe(1);
    expect(await filasDe(ajeno)).toBe(0);
  });

  it("una revisión de trampa de otra cuenta no deja a B como observador", async () => {
    const trampa = await createTrap(cuentaA, {
      locationId: plotId,
      installedAt: new Date("2026-09-01"),
      provenanceClass: "direct_observation",
    });
    const id = `${RUN_ID}-trampa`;
    const revision: MutacionDeRevisionDeTrampa & { cuentaDelBorrador: string } = {
      kind: "trap_check",
      clientDraftId: id,
      locationId: plotId,
      specimenId: trampa.id,
      observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos",
      cuentaDelBorrador: huellaDeCuenta(cuentaA),
    };

    const [deB] = await pushFieldEvents(cuentaB, aparatoDeB, [revision]);
    expect(deB).toMatchObject({ status: "rejected", reason: RAZON_BORRADOR_AJENO });
    expect(await prisma.specimenObservation.count({ where: { clientDraftId: id } })).toBe(0);

    // Control: el mismo borrador, enviado por su dueño, sí entra, y con A de observador. Sin esto, el
    // cero de arriba podría deberse a cualquier otra cosa que impida guardar la revisión.
    const [deA] = await pushFieldEvents(cuentaA, aparatoDeA, [revision]);
    expect(deA).toMatchObject({ status: "applied" });
    const fila = await prisma.specimenObservation.findUniqueOrThrow({ where: { clientDraftId: id }, select: { observerPersonId: true } });
    const personaDeA = await prisma.userAccount.findUniqueOrThrow({ where: { id: cuentaA }, select: { personId: true } });
    expect(fila.observerPersonId).toBe(personaDeA.personId);
  });
});
```

- [ ] **Paso 3: Darlas de alta en su carril**

En `scripts/pruebas-por-compuerta.txt`, añadir debajo de la línea `tests/sync/parcelaSinSenal.test.ts`, que
está en el grupo `base-sembrada`:

```
tests/sync/borradoresConDueno.test.ts
```

`tests/sync/parseoDeLaCuenta.test.ts` **no** se añade: es hermética, y `ci.sh` corre todo lo que no está en
la lista.

```bash
printf 'en la lista (debe ser 1): '; grep -c -F -e 'tests/sync/borradoresConDueno.test.ts' scripts/pruebas-por-compuerta.txt
printf 'la hermética fuera (debe ser 0): '; grep -c -F -e 'tests/sync/parseoDeLaCuenta.test.ts' scripts/pruebas-por-compuerta.txt
```

- [ ] **Paso 4: Comprobar que fallan**

```bash
npx vitest run tests/sync/parseoDeLaCuenta.test.ts tests/sync/borradoresConDueno.test.ts > "$S/t3-rojo.txt" 2>&1; echo "vitest=$?"
grep -e 'Test Files' -e 'Tests ' -e '×' "$S/t3-rojo.txt" | head -30
```

Esperado: `vitest=1`. En la hermética caen **cinco de seis**. La de parcela («la cuenta viaja en una mutación
que se copia entera») ya pasa, porque esa rama copia la mutación cruda tal cual; se queda como guardia de que
la normalización no la pierda. En la de base caen las cuatro de «ajeno» y la del lote mixto, que hoy se aplican. Las dos de control («con la cuenta
de quien envía» y «sin cuenta, en el aparato de quien envía») tienen que **pasar** ya. Si caen, el fallo es
del fixture y no del código, y se para.

- [ ] **Paso 5: El parseo normaliza la cuenta**

En `lib/sync/parsearMutaciones.ts`:

1. Añadir a las importaciones:

```ts
import { cuentaDelBorradorDe, RAZON_CUENTA_INVALIDA } from "./cuentaDelBorrador";
```

2. Sustituir, dentro de `parsearMutaciones`, las dos primeras líneas del bucle:

```ts
  for (const raw of mutations) {
    const m = (raw ?? {}) as Record<string, unknown>;
```

por:

```ts
  for (const raw of mutations) {
    const crudo = (raw ?? {}) as Record<string, unknown>;
    // ADR-199 — la cuenta del borrador se valida aquí, una vez, para todos los tipos. Una que no se
    // puede comparar con nada rechaza SÓLO su mutación; sin `clientDraftId` no hay a quién
    // atribuírselo, y es 400 de lote, como en el resto de este parseo.
    const cuenta = cuentaDelBorradorDe(crudo.cuentaDelBorrador);
    if (!cuenta.ok) {
      if (typeof crudo.clientDraftId !== "string") return { ok: false, error: "mutation_malformed" };
      rechazos.push({ clientDraftId: crudo.clientDraftId, reason: RAZON_CUENTA_INVALIDA });
      continue;
    }
    // Normalizada en el objeto, así que las ramas que copian `m` entero ya la llevan limpia.
    const m: Record<string, unknown> = { ...crudo, cuentaDelBorrador: cuenta.cuenta };
```

3. En la rama final de `field_event`, que construye el objeto campo a campo, añadir
   `cuentaDelBorrador: cuenta.cuenta,` debajo de `notes: typeof m.notes === "string" ? m.notes : null,`.

- [ ] **Paso 6: El servidor retiene lo ajeno antes de procesarlo**

En `lib/sync/pushFieldEvents.ts`:

1. Añadir a las importaciones:

```ts
import { huellaDeCuenta } from "../auth/huellaDeCuenta";
import { duenoDelBorrador, RAZON_BORRADOR_AJENO } from "./cuentaDelBorrador";
```

2. Sustituir la declaración de `PushMutation`:

```ts
export type PushMutation =
  | MutacionDeEvento
  | MutacionDeInspeccion
  | MutacionDeEventoDeColonia
  | MutacionDeFinDeColonia
  | MutacionDeConteoDeVarroa
  | MutacionDeMuestraDeSuelo
  | MutacionDeMuestraFoliar
  | MutacionDePerfilDeSuelo
  | MutacionDeSiembra
  | MutacionDeRevisionDeTrampa;
```

por:

```ts
export type PushMutation = (
  | MutacionDeEvento
  | MutacionDeInspeccion
  | MutacionDeEventoDeColonia
  | MutacionDeFinDeColonia
  | MutacionDeConteoDeVarroa
  | MutacionDeMuestraDeSuelo
  | MutacionDeMuestraFoliar
  | MutacionDePerfilDeSuelo
  | MutacionDeSiembra
  | MutacionDeRevisionDeTrampa
) & {
  /**
   * ADR-199 — la huella de la cuenta que anotó el borrador, o `null`/ausente si se guardó antes de
   * que existiera, o sin sesión. La valida `parsearMutaciones`; la decide `duenoDelBorrador`.
   */
  cuentaDelBorrador?: string | null;
};
```

3. Sustituir la variante rechazada de `PushResult`:

```ts
  | { clientDraftId: string; status: "rejected"; reason: string };
```

por:

```ts
  | {
      clientDraftId: string;
      status: "rejected";
      reason: string;
      /** ADR-199 — sólo al retener uno sin cuenta: la huella de quien registró el aparato. */
      cuentaDelBorrador?: string;
    };
```

4. En `pushFieldEvents`, sustituir `select: { id: true, revokedAt: true },` por
   `select: { id: true, revokedAt: true, createdBy: true },`.

5. Sustituir:

```ts
  const results: PushResult[] = [];

  // En el orden en que llegan, que es el orden en que el operador los anotó.
  // Importa aunque hoy ningún evento dependa de otro: un rechazo se lee junto
  // a lo que el operador recuerda haber hecho, y reordenarlos lo haría ilegible.
  for (const m of mutations) {
```

por:

```ts
  const results: PushResult[] = [];
  const huellaDeQuienEnvia = huellaDeCuenta(userAccountId);

  // En el orden en que llegan, que es el orden en que el operador los anotó.
  // Importa aunque hoy ningún evento dependa de otro: un rechazo se lee junto
  // a lo que el operador recuerda haber hecho, y reordenarlos lo haría ilegible.
  for (const m of mutations) {
    // ADR-199 — antes que nada, de quién es. Un borrador de otra cuenta no se procesa con la sesión de
    // quien envía: ni fila ni AuditEvent. Va el primero a propósito, antes de mirar el acceso, para que
    // un borrador ajeno se RETENGA aunque quien envía no tenga permiso en su sitio: un rechazo por
    // acceso lo marcaría como error en el teléfono, y la pantalla ofrecería descartarlo.
    if (
      duenoDelBorrador({
        cuentaDelBorrador: m.cuentaDelBorrador,
        huellaDeQuienEnvia,
        quienEnvia: userAccountId,
        creadorDelAparato: device.createdBy,
      }) === "ajeno"
    ) {
      results.push({
        clientDraftId: m.clientDraftId,
        status: "rejected",
        reason: RAZON_BORRADOR_AJENO,
        // Sólo para uno sin cuenta: a quién se le atribuye por la regla del aparato, para que el
        // teléfono lo apunte y deje de reenviarlo a nombre de quien no es.
        ...(m.cuentaDelBorrador == null && device.createdBy ? { cuentaDelBorrador: huellaDeCuenta(device.createdBy) } : {}),
      });
      continue;
    }
```

- [ ] **Paso 7: Comprobar que pasan**

```bash
npx vitest run tests/sync/parseoDeLaCuenta.test.ts tests/sync/borradoresConDueno.test.ts > "$S/t3-verde.txt" 2>&1; echo "vitest=$?"
grep -e 'Test Files' -e 'Tests ' "$S/t3-verde.txt"
```

Esperado: `vitest=0`, `Test Files 2 passed (2)` y `Tests 13 passed (13)`.

- [ ] **Paso 8: Las pruebas vecinas del lote siguen en verde**

Tocan `pushFieldEvents` y el parseo, que se acaban de cambiar:

```bash
npx vitest run tests/sync/pushFieldEvents.test.ts tests/sync/parcelaSinSenal.test.ts tests/sync/finDeColoniaSinSenal.test.ts tests/sync/parseoDelLote.test.ts tests/sync/deviceOperator.test.ts > "$S/t3-vecinas.txt" 2>&1; echo "vitest=$?"
grep -e 'Test Files' -e 'Tests ' "$S/t3-vecinas.txt"
```

Esperado: `vitest=0` y `Test Files 5 passed (5)`. Esas pruebas mandan mutaciones sin cuenta, desde un
aparato que registró la misma cuenta que envía, así que la regla del aparato las da por propias. Si alguna
cae con `borrador_de_otra_cuenta`, es que su fixture usa un aparato de otra cuenta. Se arregla el fixture y
se dice en el commit.

- [ ] **Paso 9: Tipos**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run typecheck > "$S/t3-tipos.txt" 2>&1; echo "typecheck=$?"
```

Esperado: `typecheck=0`.

- [ ] **Paso 10: Commit**

```bash
cat > "$S/msg-t3.txt" <<'EOF'
ADR-199: el lote retiene los borradores de otra cuenta sin escribir nada

parsearMutaciones valida y normaliza cuentaDelBorrador; pushFieldEvents decide
de quién es cada mutación antes de procesarla y contesta borrador_de_otra_cuenta,
con la huella de quien registró el aparato si el borrador no traía cuenta.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git add lib/sync/parsearMutaciones.ts lib/sync/pushFieldEvents.ts tests/sync/parseoDeLaCuenta.test.ts tests/sync/borradoresConDueno.test.ts scripts/pruebas-por-compuerta.txt
git diff --cached --stat
git commit -q -F "$S/msg-t3.txt"; echo "commit=$?"
```

Esperado: 5 archivos y `commit=0`.

---

### Tarea 4: La cola de campo y su pantalla

**Archivos:**
- Modificar: `lib/sync/offlineQueue.ts`
- Modificar: `app/components/traceability/FieldSyncControls.tsx`
- Modificar: `messages/es.json`, `messages/en.json` (clave `Traceability.fieldDraftsOtherAccount`)
- Prueba: `tests/sync/clasificarRespuesta.test.ts` (añadir un `describe`)

**Interfaces:**
- Consume: `repartirPorCuenta`, `desenlaceDeUnBorrador` (Tarea 1) y `cuentaActualDelNavegador` (Tarea 2).
- Produce:
  - `FieldEventDraft.cuenta?: string | null`
  - `SyncSummary.retenidas: number`
  - `idDeAparatoGuardado(): string | null`, que usa la Tarea 6.
  - `construirMutacionDesdeBorrador` devuelve también `cuentaDelBorrador`.

- [ ] **Paso 1: Escribir la prueba que falla**

Añadir al final de `tests/sync/clasificarRespuesta.test.ts`:

```ts
describe("construirMutacionDesdeBorrador: la cuenta del borrador viaja (ADR-199)", () => {
  it("un borrador con cuenta la manda como cuentaDelBorrador", () => {
    const m = construirMutacionDesdeBorrador({
      id: "draft-cuenta-1",
      payload: { kind: "soil_sample", sampleCode: "S-01" },
      createdAt: 0,
      status: "pending",
      cuenta: "11e594f481958c10",
    });
    expect(m.cuentaDelBorrador).toBe("11e594f481958c10");
  });

  it("uno de antes, sin cuenta, la manda null: la decide el servidor por el aparato", () => {
    const m = construirMutacionDesdeBorrador({ id: "draft-cuenta-2", payload: { kind: "soil_sample" }, createdAt: 0, status: "pending" });
    expect(m.cuentaDelBorrador).toBeNull();
  });

  it("el payload no puede suplantar la cuenta del borrador", () => {
    const m = construirMutacionDesdeBorrador({
      id: "draft-cuenta-3",
      payload: { kind: "soil_sample", cuentaDelBorrador: "otra" },
      createdAt: 0,
      status: "pending",
      cuenta: "11e594f481958c10",
    });
    expect(m.cuentaDelBorrador).toBe("11e594f481958c10");
  });
});
```

- [ ] **Paso 2: Comprobar que falla**

```bash
npx vitest run tests/sync/clasificarRespuesta.test.ts > "$S/t4-rojo.txt" 2>&1; echo "vitest=$?"
```

Esperado: `vitest=1`. Tipos aparte (vitest no los mira), las tres pruebas nuevas caen porque
`cuentaDelBorrador` sale `undefined`.

- [ ] **Paso 3: La cola guarda la cuenta, filtra y entiende la retención**

En `lib/sync/offlineQueue.ts`:

1. Añadir debajo de `import { classifyDraftAge, … } from "./draftAge";`:

```ts
import { desenlaceDeUnBorrador, repartirPorCuenta } from "./cuentaDelBorrador";
import { cuentaActualDelNavegador } from "../offline/cuentaDelNavegador";
```

2. En `FieldEventDraft`, añadir debajo de `errorMessage?: string;`:

```ts
  /**
   * ADR-199 — la huella de la cuenta que lo anotó. Ausente en los guardados antes de que existiera:
   * ésos los decide el servidor por quien registró el aparato, y quedan apuntados tras su primera
   * respuesta.
   */
  cuenta?: string | null;
```

3. En `queueFieldEvent`, sustituir
   `const draft: FieldEventDraft = { id: newDraftId(), payload, createdAt: Date.now(), status: "pending" };`
   por:

```ts
  const draft: FieldEventDraft = {
    id: newDraftId(),
    payload,
    createdAt: Date.now(),
    status: "pending",
    cuenta: cuentaActualDelNavegador(),
  };
```

4. Debajo de `ensureDeviceId`, añadir:

```ts
/**
 * El aparato registrado en este navegador, si lo hay, sin registrar uno nuevo. Lo usan las fotos para
 * la regla de los borradores sin cuenta (ADR-199): no deben registrar un aparato sólo para preguntar.
 */
export function idDeAparatoGuardado(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}
```

5. En `SyncSummary`, añadir debajo de `rejected: number;`:

```ts
  /** ADR-199 — de otra cuenta: siguen en el teléfono, sin enviar, hasta que su dueño vuelva. */
  retenidas: number;
```

6. Sustituir `type ServerResult = { clientDraftId: string; status: "applied" | "duplicate" | "rejected"; reason?: string };` por:

```ts
type ServerResult = {
  clientDraftId: string;
  status: "applied" | "duplicate" | "rejected";
  reason?: string;
  /** ADR-199 — en la retención de uno sin cuenta, de quién es según el aparato. */
  cuentaDelBorrador?: string;
};
```

7. En `construirMutacionDesdeBorrador`, sustituir la firma y el `return`:

```ts
export function construirMutacionDesdeBorrador(
  d: FieldEventDraft,
): Record<string, unknown> & { clientDraftId: string } {
  const propia = d.payload.clientDraftId;
  const clientDraftId = typeof propia === "string" && propia !== "" ? propia : d.id;
  return { ...d.payload, clientDraftId };
}
```

por:

```ts
export function construirMutacionDesdeBorrador(
  d: FieldEventDraft,
): Record<string, unknown> & { clientDraftId: string; cuentaDelBorrador: string | null } {
  const propia = d.payload.clientDraftId;
  const clientDraftId = typeof propia === "string" && propia !== "" ? propia : d.id;
  // ADR-199 — la cuenta sale del BORRADOR, después del payload: lo que traiga el payload no la pisa.
  return { ...d.payload, clientDraftId, cuentaDelBorrador: d.cuenta ?? null };
}
```

8. Sustituir `syncFieldEvents` entera, desde `export async function syncFieldEvents(): Promise<SyncSummary> {`
   hasta el final del archivo, por:

```ts
export async function syncFieldEvents(): Promise<SyncSummary> {
  // A4 fix-final — se avisa al ENTRAR, no al salir: un formulario con foto
  // (la ronda de trampas) necesita reintentar su propia cola cada vez que se
  // intenta ésta, sea cual sea el resultado.
  avisarDeSincronizacion();
  // ADR-199 — sólo salen los de la cuenta de este navegador y los que no tienen cuenta (ésos los decide
  // el servidor por el aparato). Los de otra cuenta se quedan en el teléfono, sin tocar, hasta que su
  // dueño vuelva a entrar.
  const cuentaActual = cuentaActualDelNavegador();
  const { enviables: drafts, ajenos } = repartirPorCuenta(
    (await listFieldEventDrafts()).filter((d) => d.status === "pending" || d.status === "error"),
    cuentaActual,
  );
  if (drafts.length === 0) {
    return { applied: 0, duplicate: 0, rejected: 0, retenidas: ajenos.length, stillPending: 0, serverUnavailable: false };
  }

  const deviceId = await ensureDeviceId();
  // La clave que se manda es la que decide `construirMutacionDesdeBorrador`
  // (la del payload si trae una propia, `d.id` si no) — y es la MISMA clave
  // por la que hay que buscar el borrador cuando vuelva el resultado, más
  // abajo: el servidor devuelve el `clientDraftId` que recibió, no `d.id`.
  const mutaciones = drafts.map((d) => ({ draft: d, mutacion: construirMutacionDesdeBorrador(d) }));
  const porClaveDeEnvio = new Map(mutaciones.map(({ draft, mutacion }) => [mutacion.clientDraftId, draft]));
  const res = await fetch("/api/v1/sync/field-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId,
      mutations: mutaciones.map(({ mutacion }) => mutacion),
    }),
  });

  // El lote entero negado (aparato revocado) es una respuesta del servidor, no
  // una caída: marcarlo error evita reintentar para siempre algo que ya no va
  // a ser aceptado hasta que alguien reactive el aparato.
  const decision = clasificarRespuesta(res.status);
  if (decision === "reintentar") {
    // No se toca ni un borrador: nadie ha evaluado su contenido. Quedan
    // pendientes y el operador puede volver a darle a sincronizar.
    return { applied: 0, duplicate: 0, rejected: 0, retenidas: ajenos.length, stillPending: drafts.length, serverUnavailable: true };
  }
  if (decision === "rechazar") {
    const razon = `HTTP ${res.status}`;
    for (const d of drafts) await write((s) => s.put({ ...d, status: "error", errorMessage: razon }));
    return { applied: 0, duplicate: 0, rejected: drafts.length, retenidas: ajenos.length, stillPending: drafts.length, serverUnavailable: false };
  }

  const { results } = await leerJson<{ results: ServerResult[] }>(res, "POST /api/v1/sync/field-events");
  const resumen: SyncSummary = { applied: 0, duplicate: 0, rejected: 0, retenidas: ajenos.length, stillPending: 0, serverUnavailable: false };

  for (const r of results) {
    const draft = porClaveDeEnvio.get(r.clientDraftId);
    if (!draft) continue;
    const desenlace = desenlaceDeUnBorrador(draft, r, cuentaActual);
    if (desenlace.tipo === "retenido") {
      // ADR-199 — sigue pendiente. Sólo se reescribe si el servidor dijo de quién es, para que deje de
      // contarse como propio y de reenviarse a nombre de quien no es.
      if (desenlace.borrador.cuenta !== (draft.cuenta ?? null)) await write((s) => s.put(desenlace.borrador));
      resumen.retenidas++;
    } else if (desenlace.tipo === "rechazado") {
      await write((s) => s.put(desenlace.borrador));
      resumen.rejected++;
    } else {
      await discardFieldEventDraft(draft.id);
      if (r.status === "applied") resumen.applied++;
      else resumen.duplicate++;
    }
  }

  resumen.stillPending = repartirPorCuenta(await listFieldEventDrafts(), cuentaActual).enviables.length;
  return resumen;
}
```

- [ ] **Paso 4: La pantalla cuenta sólo lo propio, y dice lo ajeno**

En `app/components/traceability/FieldSyncControls.tsx`:

1. Añadir a las importaciones:

```tsx
import { repartirPorCuenta } from "../../../lib/sync/cuentaDelBorrador";
import { cuentaActualDelNavegador } from "../../../lib/offline/cuentaDelNavegador";
```

2. Debajo de `const [rancios, setRancios] = useState(0);`, añadir:

```tsx
  const [deOtraCuenta, setDeOtraCuenta] = useState(0);
```

3. En `recontar`, sustituir `setPendientes((await listFieldEventDrafts()).length);` por:

```tsx
      // ADR-199 — lo de otra cuenta no es «pendiente» de quien está dentro: no lo puede enviar.
      const { enviables, ajenos } = repartirPorCuenta(await listFieldEventDrafts(), cuentaActualDelNavegador());
      setPendientes(enviables.length);
      setDeOtraCuenta(ajenos.length);
```

4. Debajo de `<p>{t("fieldSyncPending", { count: pendientes })}</p>`, añadir:

```tsx
      {deOtraCuenta > 0 ? (
        <p className="nn-note" role="status">
          {t("fieldDraftsOtherAccount", { count: deOtraCuenta })}
        </p>
      ) : null}
```

- [ ] **Paso 5: Los textos**

En `messages/es.json`, debajo de la línea de `"fieldSyncRejected"` del bloque `Traceability` y con su misma
sangría, añadir:

```json
    "fieldDraftsOtherAccount": "{count, plural, one {# anotación de otra cuenta espera en este teléfono hasta que esa persona vuelva a entrar} other {# anotaciones de otra cuenta esperan en este teléfono hasta que esa persona vuelva a entrar}}",
```

En `messages/en.json`, en el mismo sitio:

```json
    "fieldDraftsOtherAccount": "{count, plural, one {# note from another account is waiting on this phone until that person signs in again} other {# notes from another account are waiting on this phone until that person signs in again}}",
```

```bash
node -e 'for (const f of ["messages/es.json","messages/en.json"]) { const m = require("./"+f); console.log(f, typeof m.Traceability.fieldDraftsOtherAccount); }'
```

Esperado: `string` en los dos. Si sale un error de JSON, falta o sobra una coma.

- [ ] **Paso 6: Comprobar que pasa, y la compuerta**

```bash
npx vitest run tests/sync/clasificarRespuesta.test.ts tests/arquitectura/claves-de-traduccion-existen.test.ts > "$S/t4-verde.txt" 2>&1; echo "vitest=$?"
grep -e 'Test Files' -e 'Tests ' "$S/t4-verde.txt"
NODE_OPTIONS="--max-old-space-size=4096" npm run verify > "$S/t4-verify.txt" 2>&1; echo "verify=$?"
```

Esperado: `vitest=0`, `Test Files 2 passed (2)` y `verify=0`.

- [ ] **Paso 7: Commit**

```bash
cat > "$S/msg-t4.txt" <<'EOF'
ADR-199: la cola de campo guarda de quién es cada borrador y no envía lo ajeno

Se apunta la huella al encolar, sólo salen los propios y los sin cuenta, una
retención se queda pendiente (nunca error) y la pantalla dice cuántas anotaciones
de otra cuenta esperan en el teléfono.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git add lib/sync/offlineQueue.ts app/components/traceability/FieldSyncControls.tsx messages/es.json messages/en.json tests/sync/clasificarRespuesta.test.ts
git diff --cached --stat
git commit -q -F "$S/msg-t4.txt"; echo "commit=$?"
```

Esperado: 5 archivos y `commit=0`.

---

### Tarea 5: La cola de apiario y su indicador

**Archivos:**
- Modificar: `lib/apiary/offlineQueue.ts`
- Modificar: `app/components/apiary/OfflineSyncIndicator.tsx`
- Modificar: `messages/es.json`, `messages/en.json` (clave `Apiary.otherAccountDrafts`)
- Prueba: `tests/apiary/offlineQueue.test.ts` (añadir un `describe`)

**Interfaces:**
- Consume: `repartirPorCuenta`, `desenlaceDeUnBorrador`, `descartablesPorEstaCuenta` (Tarea 1) y `cuentaActualDelNavegador` (Tarea 2).
- Produce: `DraftRecord.cuenta?: string | null`; `syncAll()` devuelve además `retained: number`; `mutacionDe` devuelve `cuentaDelBorrador`.

- [ ] **Paso 1: Escribir la prueba que falla**

Añadir al final de `tests/apiary/offlineQueue.test.ts`:

```ts
describe("mutacionDe: la cuenta del borrador viaja (ADR-199)", () => {
  const base = { id: "draft-cuenta", kind: "inspection" as const, payload: { colonyId: "c1", outcome: "ok" }, createdAt: 0, status: "pending" as const };

  it("un borrador con cuenta la manda como cuentaDelBorrador", () => {
    expect(mutacionDe({ ...base, cuenta: "11e594f481958c10" }).cuentaDelBorrador).toBe("11e594f481958c10");
  });

  it("uno de antes, sin cuenta, la manda null", () => {
    expect(mutacionDe(base).cuentaDelBorrador).toBeNull();
  });

  it("el payload no puede suplantar la cuenta del borrador", () => {
    expect(mutacionDe({ ...base, payload: { ...base.payload, cuentaDelBorrador: "otra" }, cuenta: "11e594f481958c10" }).cuentaDelBorrador).toBe("11e594f481958c10");
  });
});
```

- [ ] **Paso 2: Comprobar que falla**

```bash
npx vitest run tests/apiary/offlineQueue.test.ts > "$S/t5-rojo.txt" 2>&1; echo "vitest=$?"
```

Esperado: `vitest=1`, con las tres pruebas nuevas caídas.

- [ ] **Paso 3: La cola**

En `lib/apiary/offlineQueue.ts`:

1. Debajo del comentario de cabecera, antes de `const DB_NAME`, añadir:

```ts
import { desenlaceDeUnBorrador, repartirPorCuenta } from "../sync/cuentaDelBorrador";
import { cuentaActualDelNavegador } from "../offline/cuentaDelNavegador";
```

2. En `DraftRecord`, debajo de `errorMessage?: string;`:

```ts
  /**
   * ADR-199 — la huella de la cuenta que lo anotó. Ausente en los guardados antes de que existiera:
   * ésos los decide el servidor por quien registró el aparato.
   */
  cuenta?: string | null;
```

3. En `queueDraft`, sustituir
   `const record: DraftRecord<T> = { id: generateDraftId(), kind, payload, createdAt: Date.now(), status: "pending" };` por:

```ts
  const record: DraftRecord<T> = {
    id: generateDraftId(),
    kind,
    payload,
    createdAt: Date.now(),
    status: "pending",
    cuenta: cuentaActualDelNavegador(),
  };
```

4. En `mutacionDe`, debajo de `clientDraftId: draft.id,`, añadir:

```ts
    // ADR-199 — del BORRADOR, después del payload: lo que traiga el payload no la pisa.
    cuentaDelBorrador: draft.cuenta ?? null,
```

5. Sustituir `syncAll` entera, desde `export async function syncAll()` hasta su `}` de cierre (justo antes de
   `// --- A5.5 §2`), por:

```ts
export async function syncAll(): Promise<{ synced: number; errored: number; retained: number; stillPending: number }> {
  // ADR-199 — sólo salen los de la cuenta de este navegador y los que no tienen cuenta; los de otra
  // cuenta se quedan aquí hasta que su dueño vuelva a entrar.
  const cuentaActual = cuentaActualDelNavegador();
  const { enviables: toSync, ajenos } = repartirPorCuenta(
    (await listDrafts()).filter((d) => d.status === "pending" || d.status === "error"),
    cuentaActual,
  );

  let synced = 0;
  let errored = 0;
  let retained = ajenos.length;

  if (toSync.length > 0) {
    try {
      const res = await fetch(RUTA_DE_LOTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: await idDeAparato(), mutations: toSync.map(mutacionDe) }),
      });

      // Un 4xx del lote ENTERO —aparato revocado, cuerpo mal formado— no es un
      // rechazo de cada borrador: es que la petición no se pudo evaluar. Se
      // dejan en cola, como un fallo de transporte, porque marcarlos con error
      // haría que el operador descartara trabajo bueno.
      if (res.ok) {
        const { results } = (await res.json()) as {
          results: Array<{ clientDraftId: string; status: string; reason?: string; cuentaDelBorrador?: string }>;
        };
        const porBorrador = new Map(results.map((r) => [r.clientDraftId, r]));
        for (const draft of toSync) {
          const r = porBorrador.get(draft.id);
          if (!r) continue; // el servidor no lo mencionó: se reintenta
          const desenlace = desenlaceDeUnBorrador(draft, r, cuentaActual);
          if (desenlace.tipo === "enviado") {
            await discardDraft(draft.id);
            synced++;
          } else if (desenlace.tipo === "retenido") {
            // ADR-199 — sigue pendiente; sólo se apunta de quién es si el servidor lo dijo.
            if (desenlace.borrador.cuenta !== (draft.cuenta ?? null)) await putDraft(desenlace.borrador);
            retained++;
          } else {
            await putDraft(desenlace.borrador);
            errored++;
          }
        }
      }
    } catch {
      // Network/transport failure — leave pending as-is, retried on the
      // next "Sync now" tap or the next opportunistic auto-attempt.
    }
  }

  const stillPending = repartirPorCuenta(
    (await listDrafts()).filter((d) => d.status === "pending" || d.status === "error"),
    cuentaActual,
  ).enviables.length;
  if (synced > 0) recordLastSyncSuccess();
  return { synced, errored, retained, stillPending };
}
```

- [ ] **Paso 4: El indicador**

En `app/components/apiary/OfflineSyncIndicator.tsx`:

1. Añadir a las importaciones:

```tsx
import { descartablesPorEstaCuenta, repartirPorCuenta } from "../../../lib/sync/cuentaDelBorrador";
import { cuentaActualDelNavegador } from "../../../lib/offline/cuentaDelNavegador";
```

2. Debajo de `const [erroredCount, setErroredCount] = useState(0);`:

```tsx
  const [otherAccountCount, setOtherAccountCount] = useState(0);
```

3. En `refresh`, sustituir:

```tsx
    const drafts = await listDrafts();
    setPendingCount(drafts.filter((d) => d.status === "pending").length);
    setErroredCount(drafts.filter((d) => d.status === "error").length);
```

por:

```tsx
    const drafts = await listDrafts();
    // ADR-199 — lo de otra cuenta no se cuenta como pendiente ni fallido de quien está dentro.
    const { enviables, ajenos } = repartirPorCuenta(drafts, cuentaActualDelNavegador());
    setPendingCount(enviables.filter((d) => d.status === "pending").length);
    setErroredCount(enviables.filter((d) => d.status === "error").length);
    setOtherAccountCount(ajenos.length);
```

4. Sustituir
   `const hasContent = pendingCount > 0 || erroredCount > 0 || !isOnline || storageWarning || purgeNotice;` por:

```tsx
  const hasContent = pendingCount > 0 || erroredCount > 0 || otherAccountCount > 0 || !isOnline || storageWarning || purgeNotice;
```

5. Debajo de la línea del `erroredCount` (`{erroredCount > 0 ? <span className="nn-muted">{t("erroredCount", …)}</span> : null}`), añadir:

```tsx
      {otherAccountCount > 0 ? <span className="nn-muted">{t("otherAccountDrafts", { count: otherAccountCount })}</span> : null}
```

6. En el botón de descartar, sustituir:

```tsx
            const drafts = await listDrafts();
            for (const d of drafts.filter((d) => d.status === "error")) await discardDraft(d.id);
```

por:

```tsx
            const drafts = await listDrafts();
            // ADR-199 — sólo los de esta cuenta. Antes borraba cualquier borrador en error, también los
            // borradores de otra cuenta que el servidor había rechazado por falta de acceso.
            for (const d of descartablesPorEstaCuenta(drafts, cuentaActualDelNavegador())) await discardDraft(d.id);
```

- [ ] **Paso 5: Los textos**

En `messages/es.json`, debajo de la línea de `"discardErroredButton"` del bloque `Apiary` y con su misma
sangría:

```json
    "otherAccountDrafts": "{count, plural, one {# anotación de otra cuenta espera en este teléfono hasta que esa persona vuelva a entrar} other {# anotaciones de otra cuenta esperan en este teléfono hasta que esa persona vuelva a entrar}}",
```

En `messages/en.json`, en el mismo sitio:

```json
    "otherAccountDrafts": "{count, plural, one {# entry from another account is waiting on this phone until that person signs in again} other {# entries from another account are waiting on this phone until that person signs in again}}",
```

```bash
node -e 'for (const f of ["messages/es.json","messages/en.json"]) { const m = require("./"+f); console.log(f, typeof m.Apiary.otherAccountDrafts); }'
```

Esperado: `string` en los dos.

- [ ] **Paso 6: Comprobar que pasa, y la compuerta**

```bash
npx vitest run tests/apiary/offlineQueue.test.ts tests/arquitectura/claves-de-traduccion-existen.test.ts > "$S/t5-verde.txt" 2>&1; echo "vitest=$?"
grep -e 'Test Files' -e 'Tests ' "$S/t5-verde.txt"
NODE_OPTIONS="--max-old-space-size=4096" npm run verify > "$S/t5-verify.txt" 2>&1; echo "verify=$?"
```

Esperado: `vitest=0`, `Test Files 2 passed (2)` y `verify=0`.

- [ ] **Paso 7: Commit**

```bash
cat > "$S/msg-t5.txt" <<'EOF'
ADR-199: la cola de apiario no envía lo ajeno ni deja descartarlo

La cola de apiario se envía sola al guardar un borrador; desde hoy sólo salen los
de la cuenta actual y los sin cuenta. El botón de descartar fallidas ya no borra
borradores de otra cuenta.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git add lib/apiary/offlineQueue.ts app/components/apiary/OfflineSyncIndicator.tsx messages/es.json messages/en.json tests/apiary/offlineQueue.test.ts
git diff --cached --stat
git commit -q -F "$S/msg-t5.txt"; echo "commit=$?"
```

Esperado: 5 archivos y `commit=0`.

---

### Tarea 6: Las fotos de la ronda

**Archivos:**
- Modificar: `lib/traceability/landMedia.ts` (dos entradas y un comprobador)
- Modificar: `app/actions/traceability.ts` (las dos acciones de foto)
- Modificar: `lib/sync/trapPhotoQueue.ts`
- Modificar: `app/components/traceability/SincronizarFotosDeRonda.tsx`
- Modificar: `messages/es.json`, `messages/en.json` (clave `Traceability.trapPhotosOtherAccount`)
- Pruebas: `tests/sync/trapPhotoQueue.test.ts` (pura) y `tests/sync/borradoresConDueno.test.ts` (con base, un `describe` nuevo)

**Interfaces:**
- Consume: `duenoDelBorrador`, `BorradorAjenoError`, `repartirPorCuenta` (Tarea 1); `huellaDeCuenta` (Tarea 1); `cuentaActualDelNavegador` (Tarea 2); `idDeAparatoGuardado` (Tarea 4).
- Produce:
  - `RequestTrampaPhotoUploadInput.borrador?: { cuenta: string | null; deviceId: string | null }` y lo mismo en `FinalizeTrampaPhotoInput`.
  - Las dos acciones aceptan dos parámetros finales, `cuentaDelBorrador: string | null = null` y `deviceId: string | null = null`, y pueden devolver `{ retenida: true; cuentaDelBorrador?: string }`.
  - `clasificarResultadoDeFoto` devuelve también `"retener"`.
  - `SyncFotosSummary.retenidas: number`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

En `tests/sync/trapPhotoQueue.test.ts`, dentro de `describe("clasificarResultadoDeFoto", …)`, añadir:

```ts
  it("una foto de otra cuenta se retiene: ni se aplica ni se marca error (ADR-199)", () => {
    expect(clasificarResultadoDeFoto({ retenida: true })).toBe("retener");
    expect(clasificarResultadoDeFoto({ retenida: true, cuentaDelBorrador: "11e594f481958c10" })).toBe("retener");
  });
```

En `tests/sync/borradoresConDueno.test.ts`:

1. Añadir a las importaciones:

```ts
import { claveDeFotoDeTrampa, finalizeTrampaPhotoPorBorrador, requestTrampaPhotoUpload } from "../../lib/traceability/landMedia";
import { recordTrapCheck } from "../../lib/traceability/traps";
import { BorradorAjenoError } from "../../lib/sync/cuentaDelBorrador";
```

   `recordTrapCheck` se importa del mismo módulo que `createTrap`. Se puede unir a esa importación.

2. Añadir al final del archivo:

```ts
describe("las fotos de la ronda no se suben ni se cuelgan a nombre de otra cuenta (ADR-199)", () => {
  async function revisionDeA() {
    const trampa = await createTrap(cuentaA, { locationId: plotId, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation" });
    return recordTrapCheck(cuentaA, {
      specimenId: trampa.id,
      observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos",
      provenanceClass: "direct_observation",
      clientDraftId: crypto.randomUUID(),
    });
  }

  it("pedir la subida de una foto de otra cuenta lanza, antes de firmar nada", async () => {
    const pedir = requestTrampaPhotoUpload(cuentaB, {
      locationId: plotId,
      originalFilename: "tela.jpg",
      contentType: "image/jpeg",
      photoClientDraftId: crypto.randomUUID(),
      revisionClientDraftId: crypto.randomUUID(),
      borrador: { cuenta: huellaDeCuenta(cuentaA), deviceId: aparatoDeB },
    });
    await expect(pedir).rejects.toBeInstanceOf(BorradorAjenoError);
  });

  it("sin cuenta, desde el aparato de A, también, y nombra a A", async () => {
    const error = await requestTrampaPhotoUpload(cuentaB, {
      locationId: plotId,
      originalFilename: "tela.jpg",
      contentType: "image/jpeg",
      photoClientDraftId: crypto.randomUUID(),
      revisionClientDraftId: crypto.randomUUID(),
      borrador: { cuenta: null, deviceId: aparatoDeA },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BorradorAjenoError);
    expect((error as BorradorAjenoError).cuentaDelDueno).toBe(huellaDeCuenta(cuentaA));
  });

  it("finalizar la foto de otra cuenta no crea ningún Asset; su dueño sí puede", async () => {
    const revision = await revisionDeA();
    const storageKey = claveDeFotoDeTrampa(plotId, crypto.randomUUID(), "tela.jpg");
    const entrada = {
      locationId: plotId,
      storageKey,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "tela.jpg",
      revisionClientDraftId: revision.clientDraftId!,
      provenanceClass: "direct_observation" as const,
    };

    await expect(
      finalizeTrampaPhotoPorBorrador(cuentaB, { ...entrada, borrador: { cuenta: huellaDeCuenta(cuentaA), deviceId: aparatoDeB } }),
    ).rejects.toBeInstanceOf(BorradorAjenoError);
    expect(await prisma.asset.count({ where: { storageKey } })).toBe(0);

    // Control: la misma foto, finalizada por su dueño, sí crea el Asset. Sin esto, el cero de arriba
    // podría deberse a que faltaba la revisión o el acceso.
    const asset = await finalizeTrampaPhotoPorBorrador(cuentaA, {
      ...entrada,
      borrador: { cuenta: huellaDeCuenta(cuentaA), deviceId: aparatoDeA },
    });
    expect(asset.storageKey).toBe(storageKey);
  });

  it("una llamada del servidor sin borrador no se mira: es la sesión actual", async () => {
    const revision = await revisionDeA();
    const storageKey = claveDeFotoDeTrampa(plotId, crypto.randomUUID(), "tela.jpg");
    const asset = await finalizeTrampaPhotoPorBorrador(cuentaA, {
      locationId: plotId,
      storageKey,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "tela.jpg",
      revisionClientDraftId: revision.clientDraftId!,
      provenanceClass: "direct_observation",
    });
    expect(asset.storageKey).toBe(storageKey);
  });
});
```

- [ ] **Paso 2: Comprobar que fallan**

```bash
npx vitest run tests/sync/trapPhotoQueue.test.ts tests/sync/borradoresConDueno.test.ts > "$S/t6-rojo.txt" 2>&1; echo "vitest=$?"
grep -e 'Test Files' -e 'Tests ' -e '×' "$S/t6-rojo.txt" | head -20
```

Esperado: `vitest=1`. Caen la pura de «retener» y las tres de foto ajena. La de «sin borrador» pasa ya. Si
cae, el fixture está mal y se para.

- [ ] **Paso 3: El servicio comprueba el dueño de una foto encolada**

En `lib/traceability/landMedia.ts`:

1. Añadir a las importaciones:

```ts
import { huellaDeCuenta } from "../auth/huellaDeCuenta";
import { BorradorAjenoError, duenoDelBorrador } from "../sync/cuentaDelBorrador";
```

2. En `RequestTrampaPhotoUploadInput`, debajo de `revisionClientDraftId: string;`, y en `FinalizeTrampaPhotoInput`,
   debajo de `provenanceClass: ProvenanceClass;`, añadir en los dos:

```ts
  /**
   * ADR-199 — sólo cuando la foto viene de la cola del teléfono: de quién es, y el aparato para la
   * regla de los borradores sin cuenta. Una llamada desde el servidor con la sesión actual no lo trae,
   * y entonces no hay borrador del que preguntar.
   */
  borrador?: { cuenta: string | null; deviceId: string | null };
```

3. Encima de `export async function requestTrampaPhotoUpload`, añadir:

```ts
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ADR-199 — una foto encolada de otra cuenta no se sube ni se cuelga con la sesión de quien envía.
 * Misma regla que el lote (`pushFieldEvents`): con cuenta, la huella; sin ella, quien registró el
 * aparato. Un `deviceId` que no es un UUID no se busca —Prisma lo rechazaría con un error que no es un
 * «no es tuyo»— y cuenta como aparato sin creador.
 */
async function exigirFotoPropia(userAccountId: string, borrador: { cuenta: string | null; deviceId: string | null }) {
  let creadorDelAparato: string | null = null;
  if (borrador.cuenta == null && borrador.deviceId && ES_UUID.test(borrador.deviceId)) {
    const aparato = await prisma.device.findUnique({ where: { id: borrador.deviceId }, select: { createdBy: true } });
    creadorDelAparato = aparato?.createdBy ?? null;
  }
  const dueno = duenoDelBorrador({
    cuentaDelBorrador: borrador.cuenta,
    huellaDeQuienEnvia: huellaDeCuenta(userAccountId),
    quienEnvia: userAccountId,
    creadorDelAparato,
  });
  if (dueno === "ajeno") {
    throw new BorradorAjenoError(borrador.cuenta == null && creadorDelAparato ? huellaDeCuenta(creadorDelAparato) : null);
  }
}
```

4. Como primera línea de `requestTrampaPhotoUpload` y como primera línea de `finalizeTrampaPhotoPorBorrador`,
   **antes** de `requireTrapAccess`, añadir:

```ts
  // ADR-199 — antes que el acceso: una foto ajena se retiene, no se rechaza.
  if (input.borrador) await exigirFotoPropia(userAccountId, input.borrador);
```

5. Comprobar que `lib/traceability/landMedia.ts` ya está en la lista de acceso a datos, así que no hace falta
   tocarla:

```bash
printf 'landMedia en la allowlist (debe ser 1 o más): '; grep -c -F -e 'lib/traceability/landMedia.ts' docs/arquitectura/acceso-a-datos.allowlist.json
```

- [ ] **Paso 4: Las acciones lo traducen a «retenida»**

En `app/actions/traceability.ts`:

1. Añadir a las importaciones:

```ts
import { BorradorAjenoError } from "../../lib/sync/cuentaDelBorrador";
```

2. En `requestTrampaPhotoUploadAction`, debajo del parámetro `revisionClientDraftId: string,`, añadir:

```ts
  // ADR-199 — de quién es la foto encolada, y el aparato para la regla de las fotos sin cuenta. Con
  // valor por defecto: un JavaScript viejo que llame sin ellos cae en «sin cuenta y sin aparato», que
  // se retiene y se queda en su cola.
  cuentaDelBorrador: string | null = null,
  deviceId: string | null = null,
```

   Sustituir su tipo de retorno
   `Promise<{ uploadUrl: string; storageKey: string } | { error: string }>` por
   `Promise<{ uploadUrl: string; storageKey: string } | { retenida: true; cuentaDelBorrador?: string } | { error: string }>`.

   En la llamada a `requestTrampaPhotoUpload`, añadir `borrador: { cuenta: cuentaDelBorrador, deviceId },`
   debajo de `revisionClientDraftId,`.

   Como **primera** línea de su `catch`:

```ts
    if (error instanceof BorradorAjenoError) {
      return error.cuentaDelDueno ? { retenida: true, cuentaDelBorrador: error.cuentaDelDueno } : { retenida: true };
    }
```

3. En `finalizeTrampaPhotoPorBorradorAction`, lo mismo:
   - los dos parámetros finales, `cuentaDelBorrador: string | null = null` y `deviceId: string | null = null`, con el mismo comentario;
   - el tipo de retorno pasa a `Promise<{ ok: true } | { pendiente: true } | { retenida: true; cuentaDelBorrador?: string } | { error: string }>`;
   - `borrador: { cuenta: cuentaDelBorrador, deviceId },` en la llamada a `finalizeTrampaPhotoPorBorrador`;
   - el mismo `if (error instanceof BorradorAjenoError) { … }` como **primera** línea del `catch`. Tiene que ir
     antes de `friendlyError`, que relanza las clases que no conoce y lo convertiría en un 500.

4. Comprobar que el archivo `"use server"` sigue exportando sólo funciones `async`. Lo vigila
   `tests/arquitectura/use-server-solo-async.test.ts`, y se corre en el paso 7.

- [ ] **Paso 5: La cola de fotos**

En `lib/sync/trapPhotoQueue.ts`:

1. Debajo de la importación de las acciones, añadir:

```ts
import { repartirPorCuenta } from "./cuentaDelBorrador";
import { cuentaActualDelNavegador } from "../offline/cuentaDelNavegador";
import { idDeAparatoGuardado } from "./offlineQueue";
```

2. En `FotoDeRondaPendiente`, debajo de `errorMessage?: string;`:

```ts
  /** ADR-199 — la huella de la cuenta que la tomó. Ausente en las guardadas antes de que existiera. */
  cuenta?: string | null;
```

3. En `queueTrapPhoto`, debajo de `status: "pending",`, añadir `cuenta: cuentaActualDelNavegador(),`.

4. Sustituir `clasificarResultadoDeFoto` entera por:

```ts
export function clasificarResultadoDeFoto(
  r: { ok: true } | { pendiente: true } | { retenida: true; cuentaDelBorrador?: string } | { error: string },
): "aplicar" | "reintentar" | "retener" | "rechazar" {
  if ("ok" in r) return "aplicar";
  if ("pendiente" in r) return "reintentar";
  // ADR-199 — de otra cuenta: se queda en cola, sin error, hasta que su dueño vuelva.
  if ("retenida" in r) return "retener";
  return "rechazar";
}
```

5. En `SyncFotosSummary`, debajo de `rejected: number;`:

```ts
  /** ADR-199 — de otra cuenta: siguen en el teléfono, sin enviar. */
  retenidas: number;
```

6. Sustituir `syncTrapPhotos` entera por:

```ts
export async function syncTrapPhotos(): Promise<SyncFotosSummary> {
  // ADR-199 — sólo salen las de la cuenta de este navegador y las que no tienen cuenta; las de otra
  // cuenta se quedan en el teléfono hasta que su dueño vuelva a entrar.
  const cuentaActual = cuentaActualDelNavegador();
  const deviceId = idDeAparatoGuardado();
  const { enviables: fotos, ajenos } = repartirPorCuenta(
    (await listTrapPhotoDrafts()).filter((f) => f.status === "pending" || f.status === "error"),
    cuentaActual,
  );
  let applied = 0;
  let rejected = 0;
  let retenidas = ajenos.length;

  // Retener no toca el estado: sólo apunta de quién es si el servidor lo dijo y la foto no lo sabía.
  const retener = async (foto: FotoDeRondaPendiente, cuentaDelDueno: string | undefined) => {
    const cuenta = foto.cuenta ?? cuentaDelDueno ?? null;
    if (cuenta !== (foto.cuenta ?? null)) {
      await write((s) => s.put({ ...foto, cuenta }));
      avisarDeCambioDeFoto();
    }
    retenidas++;
  };

  for (const foto of fotos) {
    try {
      // Fix round 1 (Tarea 12) — `foto.id` es el clientDraftId de ESTA foto,
      // el mismo en cada reintento (se generó una vez, en `queueTrapPhoto`,
      // y vive en IndexedDB): con él, `requestTrampaPhotoUploadAction`
      // deriva SIEMPRE la misma clave para esta foto, y un acuse perdido ya
      // no crea un segundo `Asset`.
      const paso1 = await requestTrampaPhotoUploadAction(
        foto.locationId,
        foto.originalFilename,
        foto.contentType,
        foto.id,
        // A6 fix-final — con qué revisión hay que comparar si la clave
        // derivada ya tiene un Asset: ver el docstring de
        // `requestTrampaPhotoUpload` en `landMedia.ts`.
        foto.revisionClientDraftId,
        foto.cuenta ?? null,
        deviceId,
      );
      if ("retenida" in paso1) {
        await retener(foto, paso1.cuentaDelBorrador);
        continue;
      }
      if ("error" in paso1) {
        await write((s) => s.put({ ...foto, cuenta: foto.cuenta ?? cuentaActual, status: "error", errorMessage: paso1.error }));
        avisarDeCambioDeFoto();
        rejected++;
        continue;
      }

      const subida = await fetch(paso1.uploadUrl, {
        method: "PUT",
        headers: { "content-type": foto.contentType },
        body: foto.blob,
      });
      if (!subida.ok) continue; // la red se cayó a mitad; se reintenta, no se descarta

      const paso2 = await finalizeTrampaPhotoPorBorradorAction(
        foto.locationId,
        paso1.storageKey,
        foto.contentType,
        foto.blob.size,
        foto.originalFilename,
        foto.revisionClientDraftId,
        foto.cuenta ?? null,
        deviceId,
      );
      const decision = clasificarResultadoDeFoto(paso2);
      if (decision === "aplicar") {
        await discardTrapPhotoDraft(foto.id);
        applied++;
      } else if (decision === "retener" && "retenida" in paso2) {
        await retener(foto, paso2.cuentaDelBorrador);
      } else if (decision === "rechazar" && "error" in paso2) {
        await write((s) => s.put({ ...foto, cuenta: foto.cuenta ?? cuentaActual, status: "error", errorMessage: paso2.error }));
        avisarDeCambioDeFoto();
        rejected++;
      }
      // "reintentar": se deja en cola tal cual, sin marcar error.
    } catch {
      // Sin señal a mitad de camino: se deja en cola.
    }
  }
  return {
    applied,
    rejected,
    retenidas,
    stillPending: repartirPorCuenta(await listTrapPhotoDrafts(), cuentaActual).enviables.length,
  };
}
```

- [ ] **Paso 6: La pantalla de fotos**

En `app/components/traceability/SincronizarFotosDeRonda.tsx`:

1. Añadir a las importaciones:

```tsx
import { repartirPorCuenta } from "../../../lib/sync/cuentaDelBorrador";
import { cuentaActualDelNavegador } from "../../../lib/offline/cuentaDelNavegador";
```

2. Debajo de `const [ultimo, setUltimo] = useState<SyncFotosSummary | null>(null);`:

```tsx
  const [deOtraCuenta, setDeOtraCuenta] = useState(0);
```

3. En `recontar`, sustituir `setPendientes((await listTrapPhotoDrafts()).length);` por:

```tsx
      // ADR-199 — las fotos de otra cuenta no son «pendientes» de quien está dentro.
      const { enviables, ajenos } = repartirPorCuenta(await listTrapPhotoDrafts(), cuentaActualDelNavegador());
      setPendientes(enviables.length);
      setDeOtraCuenta(ajenos.length);
```

4. Sustituir `if (pendientes === null || pendientes === 0) return null;` por:

```tsx
  if (pendientes === null || (pendientes === 0 && deOtraCuenta === 0)) return null;
```

5. Sustituir el bloque del contador y el botón:

```tsx
      <p>{t("trapPhotoSyncPending", { count: pendientes })}</p>
      <button type="button" className="nn-button" onClick={sincronizar} disabled={enviando}>
        {enviando ? t("fieldSyncWorking") : t("fieldSyncButton")}
      </button>
```

por:

```tsx
      <p>{t("trapPhotoSyncPending", { count: pendientes })}</p>
      {deOtraCuenta > 0 ? (
        <p className="nn-note" role="status">
          {t("trapPhotosOtherAccount", { count: deOtraCuenta })}
        </p>
      ) : null}
      {pendientes > 0 ? (
        <button type="button" className="nn-button" onClick={sincronizar} disabled={enviando}>
          {enviando ? t("fieldSyncWorking") : t("fieldSyncButton")}
        </button>
      ) : null}
```

- [ ] **Paso 7: Los textos**

En `messages/es.json`, debajo de la línea de `"trapPhotoSyncRejected"` del bloque `Traceability`:

```json
    "trapPhotosOtherAccount": "{count, plural, one {# foto de otra cuenta espera en este teléfono hasta que esa persona vuelva a entrar} other {# fotos de otra cuenta esperan en este teléfono hasta que esa persona vuelva a entrar}}",
```

En `messages/en.json`, en el mismo sitio:

```json
    "trapPhotosOtherAccount": "{count, plural, one {# photo from another account is waiting on this phone until that person signs in again} other {# photos from another account are waiting on this phone until that person signs in again}}",
```

```bash
node -e 'for (const f of ["messages/es.json","messages/en.json"]) { const m = require("./"+f); console.log(f, typeof m.Traceability.trapPhotosOtherAccount); }'
```

Esperado: `string` en los dos.

- [ ] **Paso 8: Comprobar que pasan, las vecinas y la compuerta**

```bash
npx vitest run tests/sync/trapPhotoQueue.test.ts tests/sync/borradoresConDueno.test.ts tests/traceability/landMedia.test.ts tests/arquitectura/use-server-solo-async.test.ts tests/arquitectura/claves-de-traduccion-existen.test.ts tests/arquitectura/acceso-a-datos.test.ts > "$S/t6-verde.txt" 2>&1; echo "vitest=$?"
grep -e 'Test Files' -e 'Tests ' "$S/t6-verde.txt"
NODE_OPTIONS="--max-old-space-size=4096" npm run verify > "$S/t6-verify.txt" 2>&1; echo "verify=$?"
NODE_OPTIONS="--max-old-space-size=4096" npm run build > "$S/t6-build.txt" 2>&1; echo "build=$?"
```

Esperado: `vitest=0`, `Test Files 6 passed (6)`, `verify=0` y `build=0`. `landMedia.test.ts` llama al servicio
sin `borrador`, así que tiene que seguir en verde: es el caso «llamada del servidor».

- [ ] **Paso 9: Commit**

```bash
cat > "$S/msg-t6.txt" <<'EOF'
ADR-199: las fotos de la ronda tampoco se suben a nombre de otra cuenta

La cola de fotos apunta de quién es cada una y sólo envía las propias; el servicio
comprueba el dueño de una foto encolada antes que el acceso, y las acciones lo
devuelven como retenida para que vuelva a la cola sin error.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git add lib/traceability/landMedia.ts app/actions/traceability.ts lib/sync/trapPhotoQueue.ts app/components/traceability/SincronizarFotosDeRonda.tsx messages/es.json messages/en.json tests/sync/trapPhotoQueue.test.ts tests/sync/borradoresConDueno.test.ts
git diff --cached --stat
git commit -q -F "$S/msg-t6.txt"; echo "commit=$?"
```

Esperado: 8 archivos y `commit=0`. El hook `mirar-el-stat.py` preguntará por ser 8 o más: se contesta con
este stat.

---

### Tarea 7: ADR-199, flip-tests y compuertas completas

**Archivos:**
- Modificar: `docs/architecture/DECISIONS.md` (ADR-199 al final)

**Interfaces:** ninguna nueva.

- [ ] **Paso 1: Comprobar que ADR-199 sigue libre**

```bash
git fetch origin --quiet
printf 'ADR-199 en main (debe ser 0): '; git show origin/main:docs/architecture/DECISIONS.md | grep -c -e '^## ADR-199'
gh pr list -R danieljosegiraldez-png/nectar-nomada --state open --limit 60 --json headRefName --jq '.[].headRefName' > "$S/ramas.txt"
n=0; while IFS= read -r b; do n=$((n+1)); git fetch origin "$b" --quiet 2>/dev/null; c=$(git show "origin/$b:docs/architecture/DECISIONS.md" 2>/dev/null | grep -c -e '^## ADR-199'); [ "$c" != "0" ] && echo "OCUPADO en $b"; done < "$S/ramas.txt"; echo "ramas miradas: $n"
printf 'control, el último ADR de main: '; git show origin/main:docs/architecture/DECISIONS.md | grep -oE '^## ADR-[0-9]+' | sort -t- -k2 -n | tail -1
```

Esperado: `0`, ninguna línea `OCUPADO` y `ramas miradas` igual al número de PR abiertos. Si está ocupado, se
toma el siguiente libre, y se cambia en la especificación, en el plan y en todos los comentarios
`ADR-199` del código: `git grep -n -e 'ADR-199'` los lista todos.

- [ ] **Paso 2: Escribir el ADR**

Añadir al final de `docs/architecture/DECISIONS.md`:

```markdown
## ADR-199 — Cada borrador offline tiene dueño y no se envía a nombre de otra cuenta

**Fecha:** 2026-10-11 · **Spec:** `docs/superpowers/specs/2026-10-09-borradores-con-dueno-design.md` ·
**Plan:** `docs/superpowers/plans/2026-10-11-borradores-con-dueno.md`

**Contexto.** Las tres colas de IndexedDB (apiario, campo y fotos de trampa) guardaban borradores sin
cuenta, y el envío autentica con la sesión del momento. En un teléfono donde A deja trabajo sin enviar y
entra B, salía a nombre de B: actor falso en `core.audit_event` y, en una revisión de trampa, observador
falso con `direct_observation` (§3, §35). ADR-109 hace los aparatos personales, pero dentro de él cabe el
peor caso: un administrador que entra en el teléfono de un trabajador para ayudarle. Con acceso a todo,
nada se rechaza.

**Decisión de Daniel, 2026-10-09 y 2026-10-11.**
1. Los borradores de otra cuenta **se retienen** en el teléfono hasta que vuelva su dueño: ni se envían, ni
   se descartan, ni se exportan. La purga de 21 días sigue igual.
2. Un borrador sin cuenta es **de quien registró el aparato** (`Device.createdBy`).
3. Lo comprueban el navegador y el servidor, y la cuenta sale de la página más reciente que generó el
   servidor.
4. Un solo componente en el layout, compartido con #703.

**Cómo.** El dueño es la huella de la cuenta (`lib/auth/huellaDeCuenta.ts`), nunca el id. El servidor
contesta `rejected` con `borrador_de_otra_cuenta` y no escribe nada. Se eligió «rechazado» y no un estado
nuevo porque el JavaScript viejo en caché descarta cualquier estado que no conoce. Las decisiones viven en
funciones puras, en `lib/sync/cuentaDelBorrador.ts`, y la cuenta del navegador en
`lib/offline/cuentaDelNavegador.ts`, ordenada por la hora del servidor.

**Lo que no cubre.**
- Quien manipule su navegador puede reetiquetar como suyo un borrador ajeno. No suplanta a nadie, porque
  escribe con su propia sesión, pero se apropia de trabajo ajeno. Esto protege del error, no del abuso de
  quien tiene el teléfono en la mano.
- La purga de 21 días borra también lo retenido de A si A no vuelve, y el aviso lo ve B.
- Las fotos de trampa no tienen purga, así que una foto retenida espera indefinidamente.

**Cómo se comprueba.** `tests/sync/borradoresConDueno.test.ts` (con base): un borrador ajeno se rechaza con
cero filas y cero `AuditEvent`, tanto si trae otra cuenta como si es un borrador sin cuenta en un aparato
ajeno. Flip-test: anulando el bloque del dueño en `pushFieldEvents`, caen los casos «ajeno» por su nombre.
```

- [ ] **Paso 3: Commit del ADR, antes de los flip-tests**

```bash
cat > "$S/msg-t7.txt" <<'EOF'
ADR-199: cada borrador offline tiene dueño y no se envía a nombre de otra cuenta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git add docs/architecture/DECISIONS.md
git diff --cached --stat
git commit -q -F "$S/msg-t7.txt"; echo "commit=$?"
git status --porcelain | wc -l
```

Esperado: 1 archivo, `commit=0`, y `0` archivos sucios. Los flip-tests restauran desde HEAD.

- [ ] **Paso 4: Flip-test 1, el servidor**

Mutación: anular la conducta del bloque del dueño en `pushFieldEvents`, sin borrar símbolos, para que el
archivo siga compilando.

```bash
F=lib/sync/pushFieldEvents.ts
antes=$(shasum "$F" | cut -c1-12); echo "sha antes: $antes"
python3 - "$F" <<'EOF'
import sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
ancla = "    if (\n      duenoDelBorrador({"
n = s.count(ancla); print("ancla casa", n, "veces")
if n != 1: sys.exit("ABORTA: el ancla no casa exactamente una vez")
open(p, "w", encoding="utf-8").write(s.replace(ancla, "    if (\n      false &&\n      duenoDelBorrador({"))
EOF
despues=$(shasum "$F" | cut -c1-12); echo "sha después: $despues"; [ "$antes" != "$despues" ] || echo "ABORTA: no cambió"
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit -p . > "$S/flip1-tsc.txt" 2>&1; echo "compila=$?"
npx vitest run tests/sync/borradoresConDueno.test.ts > "$S/flip1.txt" 2>&1; echo "vitest=$?"
grep -e 'Test Files' -e 'Tests ' -e '×' "$S/flip1.txt"
git checkout -- "$F"; printf 'restaurado, sha: '; shasum "$F" | cut -c1-12
```

Esperado: `ancla casa 1 veces`, dos sha distintos, `compila=0` y `vitest=1`. Tienen que caer **por su
nombre**:
- «con la cuenta de otra persona: retenido, sin fila y sin AuditEvent»
- «sin cuenta, en el aparato de otra cuenta: retenido, sin fila, y dice de quién es»
- «sin cuenta, en un aparato sin creador: retenido, y sin dueño que nombrar»
- «en un lote mixto, lo propio entra y lo ajeno se retiene, en la misma petición»
- «una revisión de trampa de otra cuenta no deja a B como observador»

Las de control tienen que seguir pasando. Al restaurar, el sha tiene que ser otra vez el de antes. Si cae
otra prueba, o ninguna, el guardia no es el que se cree y se para.

- [ ] **Paso 5: Flip-test 2, qué envía el navegador**

```bash
F=lib/sync/cuentaDelBorrador.ts
antes=$(shasum "$F" | cut -c1-12); echo "sha antes: $antes"
python3 - "$F" <<'EOF'
import sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
ancla = "    if (b.cuenta == null || (cuentaActual !== null && b.cuenta === cuentaActual)) enviables.push(b);"
n = s.count(ancla); print("ancla casa", n, "veces")
if n != 1: sys.exit("ABORTA")
open(p, "w", encoding="utf-8").write(s.replace(ancla, "    if (true || b.cuenta == null || (cuentaActual !== null && b.cuenta === cuentaActual)) enviables.push(b);"))
EOF
despues=$(shasum "$F" | cut -c1-12); echo "sha después: $despues"; [ "$antes" != "$despues" ] || echo "ABORTA: no cambió"
npx vitest run tests/sync/cuentaDelBorrador.test.ts > "$S/flip2.txt" 2>&1; echo "vitest=$?"
grep -e 'Tests ' -e '×' "$S/flip2.txt"
git checkout -- "$F"; printf 'restaurado, sha: '; shasum "$F" | cut -c1-12
```

Esperado: `vitest=1`, y caen «con cuenta actual: salen los suyos y los sin cuenta; los de otra se quedan» y
«sin cuenta actual: todo lo que tiene dueño es ajeno».

- [ ] **Paso 6: Flip-test 3, una retención no pasa a error**

```bash
F=lib/sync/cuentaDelBorrador.ts
antes=$(shasum "$F" | cut -c1-12); echo "sha antes: $antes"
python3 - "$F" <<'EOF'
import sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
ancla = '  if (esRetencion(r)) return { tipo: "retenido", borrador: { ...borrador, cuenta } };'
n = s.count(ancla); print("ancla casa", n, "veces")
if n != 1: sys.exit("ABORTA")
open(p, "w", encoding="utf-8").write(s.replace(ancla, '  if (false && esRetencion(r)) return { tipo: "retenido", borrador: { ...borrador, cuenta } };'))
EOF
despues=$(shasum "$F" | cut -c1-12); echo "sha después: $despues"; [ "$antes" != "$despues" ] || echo "ABORTA: no cambió"
npx vitest run tests/sync/cuentaDelBorrador.test.ts > "$S/flip3.txt" 2>&1; echo "vitest=$?"
grep -e 'Tests ' -e '×' "$S/flip3.txt"
git checkout -- "$F"; printf 'restaurado, sha: '; shasum "$F" | cut -c1-12
git status --porcelain | wc -l
```

Esperado: `vitest=1`, cae «retenido: sigue pendiente y NO pasa a error, apuntado al dueño que nombró el
servidor», y al final `0` archivos sucios.

- [ ] **Paso 7: Compuertas**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run verify > "$S/verify.txt" 2>&1; echo "verify=$?"
NODE_OPTIONS="--max-old-space-size=4096" npm run build > "$S/build.txt" 2>&1; echo "build=$?"
unset TEST_DATABASE_URL DATABASE_URL
bash scripts/ci.sh > "$S/ci.txt" 2>&1; echo "ci=$?"
grep -e 'Test Files' -e 'Tests ' "$S/ci.txt" | tail -2
```

Esperado: los tres `=0`. En el carril hermético, una prueba con base que se hubiera quedado fuera de la lista
falla al no poder conectar, así que su verde dice que `borradoresConDueno` no corre ahí.

- [ ] **Paso 8: El grupo con base entero, sobre una base nueva**

`ci-con-base.sh` no se puede repetir sobre la misma base (la semilla se protege de una segunda vuelta), así
que se crea otra:

```bash
PSQL=/Applications/Postgres.app/Contents/Versions/latest/bin/psql
"$PSQL" "postgresql://postgres@127.0.0.1:55433/postgres" -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"nectar_ci_borradores_grupo\" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';"
echo "crear=$?"
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_ci_borradores_grupo \
  bash scripts/ci-con-base.sh > "$S/ci-con-base.txt" 2>&1; echo "ci_con_base=$?"
grep -e 'Correrá' -e 'Test Files' -e 'Tests ' "$S/ci-con-base.txt"
```

Esperado: `crear=0`, `ci_con_base=0`, la línea «Correrá N archivos» con un N **uno mayor** que en `main`, y
`Test Files N passed (N)`. El veredicto está en `Test Files`, no en `Tests`: cuatro suites pueden morir en su
`afterAll` con todas sus pruebas en verde.

---

### Tarea 8: Verificación en el navegador, build de producción

**Archivos:** ninguno versionado. Se crean y se borran:
- `.env.verificacion.local` (gitignorado por `.env*`)
- una entrada temporal en `.claude/launch.json`, que **está versionado** y se restaura al final.

Las contraseñas de prueba se generan aquí, se guardan en `.env.verificacion.local` y **no se escriben en el
chat**.

- [ ] **Paso 1: Base, variables y cuentas de prueba**

```bash
PSQL=/Applications/Postgres.app/Contents/Versions/latest/bin/psql
"$PSQL" "postgresql://postgres@127.0.0.1:55433/postgres" -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"nectar_ci_cuentas\" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';"
echo "crear=$?"
{
  echo "DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_ci_cuentas"
  echo "AUTH_SECRET=$(openssl rand -base64 32)"
  echo "AUTH_URL=http://localhost:3091"
  echo "AUTH_TRUST_HOST=1"
  echo "TZ=UTC"
  echo "VERIF_CLAVE_A=$(openssl rand -hex 12)"
  echo "VERIF_CLAVE_B=$(openssl rand -hex 12)"
} > .env.verificacion.local
git check-ignore -q .env.verificacion.local && echo "gitignorado"
set -a; . ./.env.verificacion.local; set +a
npx prisma migrate deploy > "$S/t8-migrar.txt" 2>&1; echo "migrar=$?"
npm run db:seed > "$S/t8-semilla.txt" 2>&1; echo "semilla=$?"
```

Esperado: `crear=0`, `gitignorado`, `migrar=0` y `semilla=0`.

Escribir `$S/montar-verificacion.ts`. Usa rutas absolutas al worktree, que se sustituyen por la real:

```ts
import { prisma } from "<WORKTREE>/lib/db";
import { hashPassword } from "<WORKTREE>/lib/auth/password";
import { createColony, createHive } from "<WORKTREE>/lib/apiary/hives";

const RUN = "verificacion-borradores";

async function cuenta(nombre: string, email: string, clave: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: nombre, displayName: `TEST ${nombre} (${RUN})`, email, locale: "es" },
  });
  const c = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active", passwordHash: await hashPassword(clave) },
  });
  return { userAccountId: c.id, personId: persona.id };
}

async function main() {
  const a = await cuenta("A", "a.borradores@nn.test", process.env.VERIF_CLAVE_A!);
  const b = await cuenta("B", "b.borradores@nn.test", process.env.VERIF_CLAVE_B!);
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" },
  });
  const project = await prisma.project.create({ data: { name: `TEST Proyecto (${RUN})`, status: "approved", classification: "internal" } });
  const sitio = await prisma.location.create({
    data: { locationType: "apiary_site", name: `TEST Sitio (${RUN})`, organizationId: org.id, status: "approved", classification: "internal" },
  });
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: project.id } });
  for (const c of [a, b]) await prisma.assignment.create({ data: { userAccountId: c.userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  const hive = await createHive(a.userAccountId, { projectId: project.id, locationId: sitio.id, identifier: "VB-1" });
  const colony = await createColony(a.userAccountId, {
    hiveId: hive.id,
    originType: "captured",
    startedAt: new Date("2026-01-01"),
    provenanceClass: "direct_observation",
  });
  console.log(JSON.stringify({ cuentaA: a.userAccountId, cuentaB: b.userAccountId, sitio: sitio.id, hive: hive.id, colony: colony.id }));
}

main().finally(() => prisma.$disconnect());
```

```bash
npx tsx "$S/montar-verificacion.ts" > "$S/t8-ids.json" 2> "$S/t8-montar.err"; echo "montar=$?"
cat "$S/t8-ids.json"
```

Esperado: `montar=0` y un JSON con cinco ids, sin ninguna contraseña. Las huellas de A y B se calculan con
`printf '%s' <id> | shasum -a 256 | cut -c1-16` y se apuntan en `$S/t8-huellas.txt`.

- [ ] **Paso 2: Build de producción y servidor**

```bash
set -a; . ./.env.verificacion.local; set +a
NODE_OPTIONS="--max-old-space-size=4096" npm run build > "$S/t8-build.txt" 2>&1; echo "build=$?"
git diff --stat -- .claude/launch.json | tail -1
```

Esperado: `build=0`, y `launch.json` sin cambios todavía. Añadir a `configurations` de `.claude/launch.json`:

```json
{
  "name": "borradores-prod",
  "runtimeExecutable": "bash",
  "runtimeArgs": ["-c", "set -a; . ./.env.verificacion.local; set +a; exec npx next start -p 3091"],
  "port": 3091
}
```

Arrancar con `preview_start {name: "borradores-prod"}`. Antes de creer nada, comprobar con `preview_logs` que
escucha en `3091`, y con `read_page` que `/login` responde desde ese puerto. Si arrancó otra configuración, se
para y se corrige: el panel arranca la que encuentra si no halla el nombre.

- [ ] **Paso 3: Recorrido 1 — A anota sin señal, entra B y no sale a su nombre**

1. Entrar como A (`a.borradores@nn.test` y `VERIF_CLAVE_A`, leída del archivo con `form_input`). Abrir la
   ficha de la colmena `VB-1` desde `/apiaries`.
2. Leer `localStorage["nn-cuenta-del-navegador"]` con `javascript_tool`: tiene que traer la huella de A.
3. `preview_stop`: el servidor deja de contestar, que en este navegador es lo mismo que no tener señal.
   Anotar una inspección. Leer IndexedDB `nectar-apiary-offline/drafts` con `javascript_tool`: **un**
   borrador, `status: "pending"` y `cuenta` igual a la huella de A.
4. `preview_start {name: "borradores-prod"}`. Cerrar sesión con el botón de #703. Entrar como B **sin
   recargar a mano**, y leer `nn-cuenta-del-navegador`: tiene que traer la huella de B. Ése es el recorrido
   4 de la especificación.
5. Como B, anotar su propia inspección en la misma colmena. La cola de apiario se envía sola.
6. Medir en la base, imprimiendo a qué base se conectó:

```bash
"$PSQL" "$DATABASE_URL" -At -c "select current_database();"
"$PSQL" "$DATABASE_URL" -At -c "select i.created_by = '<cuentaB>' as es_de_b, count(*) from apiary.inspection i where i.colony_id = '<colony>' group by 1;"
"$PSQL" "$DATABASE_URL" -At -c "select actor_user_account_id = '<cuentaB>' as actor_b, count(*) from core.audit_event where entity_type = 'inspection' and created_at > now() - interval '30 minutes' group by 1;"
```

Esperado: `nectar_ci_cuentas`, **una** inspección y es de B, y su `AuditEvent` con actor B. Ninguna con actor A
todavía. Si los nombres de esquema o columna no son ésos, sacarlos de `prisma/schema.prisma` (`@@map`,
`@@schema`) antes de concluir nada. Una consulta mal escrita que devuelva cero no es un «no está».

7. En pantalla, el indicador dice «1 anotación de otra cuenta espera en este teléfono…». Captura con
   `computer {action: "screenshot"}`. IndexedDB: el borrador de A sigue ahí, `pending`, con la huella de A.
8. Cerrar sesión, entrar como A, pulsar «Sincronizar ahora». Volver a medir: ahora hay **dos** inspecciones,
   una de A y otra de B, cada una con su actor en `core.audit_event`. IndexedDB queda vacía.

- [ ] **Paso 4: Recorrido 2 — un borrador sin cuenta sigue al que registró el aparato**

1. Como A: borrar `localStorage["nn-field-device-id"]` con `javascript_tool`, anotar algo con señal para que
   la cola registre un aparato **a nombre de A**, y comprobar en la base que `core.device.created_by` del
   último aparato es A.
2. Insertar a mano en `nectar-apiary-offline/drafts` un borrador copiado de uno real, con `id` nuevo
   (`crypto.randomUUID()`) y **sin** el campo `cuenta`.
3. Cerrar sesión y entrar como B. Pulsar «Sincronizar ahora». En la base no entra. En IndexedDB el borrador
   sigue `pending`, y ahora con `cuenta` igual a la huella de A, la que mandó el servidor. En pantalla aparece
   en la línea de «otra cuenta».
4. Entrar como A y sincronizar: entra, con actor A.

- [ ] **Paso 5: Recorrido 3 — una página de A no se sirve a B sin señal**

1. Como A, visitar la ficha de la colmena, que el service worker guarda. **Sin cerrar sesión**, ir a `/login`
   y entrar como B.
2. `preview_stop`, y navegar a la URL de la ficha. Tiene que salir `offline.html` y no la página de A: #703
   borró la caché al entrar B. Si saliera la página de A, anotar en ella y comprobar en IndexedDB que el
   borrador lleva la huella de **B**. Ése es el caso que protege la hora de `nn-cuenta-del-navegador`.
3. `preview_start {name: "borradores-prod"}` otra vez.

- [ ] **Paso 6: Recoger, sin dejar nada**

```bash
git diff --stat -- .claude/launch.json
git checkout -- .claude/launch.json
rm -f .env.verificacion.local
git status --porcelain
```

`preview_stop` antes. `git status --porcelain` tiene que salir vacío.

Borrar las bases de esta tarea, nombradas una a una y sólo ésas:

```bash
for db in nectar_ci_cuentas nectar_ci_borradores nectar_ci_borradores_grupo nectar_ci_borradores_grupo_shadow; do
  "$PSQL" "postgresql://postgres@127.0.0.1:55433/postgres" -c "DROP DATABASE IF EXISTS \"$db\";"; echo "$db: $?"
done
```

---

### Tarea 9: Empujar y abrir el PR, sin fusionarlo

- [ ] **Paso 1: Contar lo que lleva el PR**

```bash
BASE=origin/sw-cierre-de-sesion   # o origin/main, según la Tarea 0
git fetch origin --quiet
git log --oneline "$BASE"..HEAD
git diff --name-only "$BASE"...HEAD | sort
git diff --name-only "$BASE"...HEAD | wc -l
```

Esperado: los diez commits (diseño, plan, nota de la Tarea 0 y tareas 1 a 7) y estos archivos, ni uno más:

```
app/actions/traceability.ts
app/components/ServiceWorkerRegistration.tsx
app/components/apiary/OfflineSyncIndicator.tsx
app/components/traceability/FieldSyncControls.tsx
app/components/traceability/SincronizarFotosDeRonda.tsx
app/layout.tsx
docs/architecture/DECISIONS.md
docs/superpowers/plans/2026-10-11-borradores-con-dueno.md
docs/superpowers/specs/2026-10-09-borradores-con-dueno-design.md
lib/apiary/offlineQueue.ts
lib/auth/huellaDeCuenta.ts
lib/offline/cuentaDelNavegador.ts
lib/sync/cuentaDelBorrador.ts
lib/sync/offlineQueue.ts
lib/sync/parsearMutaciones.ts
lib/sync/pushFieldEvents.ts
lib/sync/trapPhotoQueue.ts
lib/traceability/landMedia.ts
messages/en.json
messages/es.json
scripts/pruebas-por-compuerta.txt
tests/apiary/offlineQueue.test.ts
tests/offline/cuentaDelNavegador.test.ts
tests/sync/borradoresConDueno.test.ts
tests/sync/clasificarRespuesta.test.ts
tests/sync/cuentaDelBorrador.test.ts
tests/sync/parseoDeLaCuenta.test.ts
tests/sync/trapPhotoQueue.test.ts
```

28 archivos. Si sale alguno más, mirar qué le pasa antes de empujar.

- [ ] **Paso 2: Empujar y comprobar contra el remoto**

```bash
git push --force-with-lease origin HEAD:borradores-con-dueno; echo "push=$?"
git rev-parse HEAD; git rev-parse @{u}
```

Los dos sha tienen que coincidir. No basta con leer la salida del `push`.

- [ ] **Paso 3: Abrir el PR**

Base: `sw-cierre-de-sesion` si #703 sigue abierto, `main` si ya está fusionado. El cuerpo, en un archivo:
qué cierra (el defecto y las tres decisiones de Daniel), cómo se aplica la nota del componente único,
las pruebas con su número, los tres flip-tests con las pruebas que cayeron por su nombre, la verificación en
el navegador con sus mediciones, y una sección **«Orden de fusión»**: después de #703; al fusionarse #703, se
rebasa sobre `main` con `git rebase --onto origin/main origin/sw-cierre-de-sesion` y se **empuja** (no se
relanza), porque un re-run no lee el `main` nuevo. Termina con:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

```bash
gh pr create -R danieljosegiraldez-png/nectar-nomada --base sw-cierre-de-sesion --head borradores-con-dueno \
  --title "ADR-199: cada borrador offline tiene dueño y no se envía a nombre de otra cuenta" --body-file "$S/pr.md"
```

Después: `ccd_pr get_status`, y si no aparece, `bind_pr`. **No se fusiona**: lo hace la sesión que lleva el
turno, y se le dice a Daniel que el PR depende de #703.
