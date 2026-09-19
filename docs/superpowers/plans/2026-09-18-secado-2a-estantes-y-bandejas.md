# Secado por bandeja, paso 2a — instalaciones, estantes, bandejas y capacidad: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que el beneficio pueda declarar dónde se seca —instalaciones con su sombra, estantes con posiciones generadas por estante + nivel + puesto—, qué bandejas tiene —de un tipo en pies, numeradas por finca— y cuánto café cabe en cada tipo según el estado del café, medido o estimado y marcado.

**Arquitectura:** todo lo fijo es `Location` (instalación → estante → posición), y todo lo que se mueve es `Equipment` (la bandeja). El tipo de bandeja es una tabla pequeña de la organización. La capacidad **no se guarda**: sale de los pesajes de campo, y sin ellos, de un estimado declarado como tal.

**Stack:** Next.js 16 App Router con Server Actions · Prisma 7.9 sobre Postgres · next-intl · vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-18-secado-por-bandeja-y-su-receta-design.md`, §2 (las tres rondas), §4.1, §4.2, §4.2b y §7. Es el paso **2a** de su §6. El **2b**, el lote en sus bandejas, es `docs/superpowers/plans/2026-09-18-secado-2b-lote-en-bandejas.md` y **depende de éste**.

**Fuente de los números de partida:** `Las_Nubes_Cerro_Azul_Drying_Plan_2026-27.md`, el documento de Daniel del 2026-09-18, §1, §5, §6 y §7. **No está en el repositorio**, y no se copia: trae precios y personas. Se cita por nombre y sección.

## Restricciones globales

- **Nombres aprobados por Daniel el 2026-09-18** (`03_public_api.md` no declara ninguno de secado), y **ningún otro sin preguntar**:
  - `african_bed_outdoor` y `floor_tarp` (valores de `DryingEnvironment`);
  - `drying_rack` (valor de `LocationType`);
  - `rackSlot` / `rack_slot`;
  - `shadeDescription` / `shade_description`;
  - `DryingTrayType` / `core.drying_tray_type`;
  - `trayTypeId`, `trayNumber` / `tray_type_id`, `tray_number` en `Equipment`;
  - `DryingTrayWeighing` / `traceability.drying_tray_weighing`.
  - **`rackRow` queda retirado:** la fila del cuarto **es** el estante (spec §4.1).
- **`00_reglas_del_modulo` §7.6:** cada nombre nuevo se declara en `docs/beneficio/03_public_api.md` **en el mismo commit** que lo introduce. Cada tarea que añade uno lo añade allí, en una sección nueva «§11. Secado: instalaciones, estantes y bandejas» que crea la Tarea 1.
- **Decisiones de Daniel que este plan aplica** (spec §2):
  - varios estantes por instalación;
  - posición = estante + nivel + puesto, y las posiciones **se generan** al crear el estante;
  - tipos de bandeja fijos, **en pies**, guardados en cm (`00_conventions` §1: unidad canónica, y la tecleada se conserva);
  - número **consecutivo por finca**, B-001. Una finca = una organización: hoy la única es Finca Rosina (memoria `nectar-nomada-farms`);
  - la capacidad es **medida por estado** (`CHERRY`, `MUCILAGE_HONEY`, `PARCHMENT`, del enum `MaterialState` que ya existe) y, **sin pesajes, estimada y marcada**. Sólo para cereza, que es lo único para lo que el documento de Daniel da densidad;
  - la sombra va en la instalación y en la cama; la de la cama, sólo si difiere.
- **Veracidad** (`21_rubrica_veracidad`):
  - la capacidad es `DERIVADO` y dice con cuántos pesajes se calculó;
  - el estimado es `SUPUESTO`: dice «estimado, sin medir» y cita su fuente;
  - mucílago y lavado sin pesaje salen como «sin medir», **sin número**.
- **Nunca se borra una posición con historia**, y un estante no se reduce: sólo se amplía.
- **Reglas de la casa:**
  - reglas en la base: `CHECK` si es la misma fila, disparador si mira otra tabla;
  - cada regla con su **sonda y su control positivo**;
  - toda prueba con base va declarada en `scripts/pruebas-por-compuerta.txt`, grupo `base-sembrada`;
  - `npm run build` en toda tarea que toque TypeScript;
  - `git commit -F <archivo>`, archivo por archivo, contando `git diff --cached --stat`;
  - el flip-test se hace después del commit, con sha antes y después, compila, y el nombre de la prueba que cae.
- **Un `ADD VALUE` de enum no se puede USAR en la misma migración** (Postgres). Por eso `drying_rack` entra en una migración y sus reglas en la siguiente.
- **Variables de la base para `npm test`:**
  - `DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test`
  - `SHADOW_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nn_shadow_beneficio`
  - **Nunca** `test:db -- reset` sobre la base compartida.

## Fuera de este plan

- **El lote en sus bandejas:** cargar, bajar, dónde está cada una y sus conflictos. Es el 2b.
- **El QR de la bandeja**, que va con su propio plan (spec §4.2).
- **Mover una bandeja:** ya existe, es `trasladarEquipo`.
- **Humedad y volteos por bandeja** (paso 3), y **el ambiente** (paso 4).
- **Que la sombra influya en ningún cálculo.** Es un dato declarado.

## Mapa de archivos

| archivo | tarea |
|---|---|
| `prisma/migrations/20260918190000_secado_ambientes_estante_y_sombra/migration.sql` | T1 |
| `prisma/migrations/20260918190500_estantes_y_posiciones/migration.sql` | T2 |
| `prisma/migrations/20260918191000_tipos_y_numero_de_bandeja/migration.sql` | T3 |
| `prisma/migrations/20260918191500_pesaje_de_bandeja/migration.sql` | T4 |
| `prisma/schema.prisma` | T1–T4 |
| `lib/traceability/secadoForm.ts`, `lib/traceability/instalaciones.ts` | T1, T2 |
| `lib/traceability/locations.ts` | T2: `drying_rack` en `TIPOS_DEL_BENEFICIO` y en el rechazo de microlote |
| `lib/traceability/samplingEvents.ts` | T2: la inspección no ofrece las posiciones de estante (paso 3) |
| `lib/traceability/estantes.ts` | T2: crear y ampliar estantes |
| `lib/equipos/bandejas.ts` | T3: tipos, registro en tanda, lista |
| `lib/equipos/equipos.ts` | T3: `puedeConfigurarEn` exportada |
| `lib/beneficio/capacidadSupuesta.ts` | T4: el estimado `[PROVISIONAL]`, con su fuente |
| `lib/traceability/capacidadDeBandeja.ts` | T4: pesaje y capacidad |
| `app/instalaciones/FormularioUbicacion.tsx`, `app/instalaciones/page.tsx`, `app/instalaciones/[id]/page.tsx`, `app/instalaciones/FormularioEstante.tsx`, `app/actions/instalaciones.ts` | T1, T2 |
| `app/beneficio/bandejas/page.tsx`, `app/beneficio/bandejas/Formularios.tsx`, `app/actions/bandejas.ts`, `app/beneficio/destinos.ts` | T5 |
| `messages/es.json`, `messages/en.json` | T1–T5 |
| `docs/beneficio/03_public_api.md` | T1–T4, cada una lo suyo |
| pruebas: `tests/traceability/secadoForm.test.ts`, `instalaciones.test.ts`, `estantes.test.ts`, `tests/equipos/bandejas.test.ts`, `tests/traceability/capacidadDeBandeja.test.ts`, `tests/beneficio/destinos-del-indice.test.ts` | T1–T5 |
| `docs/architecture/DECISIONS.md`, `docs/arquitectura/inventario-de-acceso.md`, spec | T6 |

---

### Tarea 1: dos ambientes, el tipo «estante» y la sombra de arriba

**Archivos:**
- Crear: `prisma/migrations/20260918190000_secado_ambientes_estante_y_sombra/migration.sql`
- Modificar: `prisma/schema.prisma`, `lib/traceability/secadoForm.ts`, `lib/traceability/instalaciones.ts`, `app/instalaciones/FormularioUbicacion.tsx`, `app/instalaciones/page.tsx`, `messages/es.json`, `messages/en.json`, `docs/beneficio/03_public_api.md`
- Pruebas: `tests/traceability/secadoForm.test.ts`, `tests/traceability/instalaciones.test.ts`

**Interfaces:**
- Produce `DryingEnvironment` con `african_bed_outdoor` y `floor_tarp`, `LocationType` con `drying_rack`, y `Location.shadeDescription: string | null`.
- `leerUbicacionDeSecado(form)` devuelve además `shadePercentage: ShadePercentageBracket | null` y `shadeDescription: string | null`, y lanza `SecadoFormError("sombra_invalida")`.
- `detalleInstalacion(...)` devuelve `shadePercentage` y `shadeDescription` de la instalación y de cada cama.
- Exporta `GRADOS_DE_SOMBRA` de `secadoForm.ts`.

- [ ] **Paso 1: las pruebas que fallan**

En `tests/traceability/secadoForm.test.ts`:

```ts
  it("la sombra: grado de la escala de las parcelas y nota libre; vacías quedan nulas", () => {
    const form = new FormData(); form.set("name", "Cama bajo la guaba");
    expect(leerUbicacionDeSecado(form)).toMatchObject({ shadePercentage: null, shadeDescription: null });
    form.set("shadePercentage", "pct_50"); form.set("shadeDescription", "  Árbol de guaba, copa rala  ");
    expect(leerUbicacionDeSecado(form)).toMatchObject({ shadePercentage: "pct_50", shadeDescription: "Árbol de guaba, copa rala" });
    form.set("shadePercentage", "pct_45"); expect(() => leerUbicacionDeSecado(form)).toThrow("sombra_invalida");
    form.set("shadePercentage", ""); form.set("shadeDescription", "x".repeat(301));
    expect(() => leerUbicacionDeSecado(form)).toThrow("sombra_invalida");
  });
  it("acepta los dos ambientes nuevos", () => {
    const form = new FormData(); form.set("name", "Patio");
    for (const a of ["african_bed_outdoor", "floor_tarp"]) {
      form.set("dryingEnvironment", a); expect(leerUbicacionDeSecado(form).dryingEnvironment).toBe(a);
    }
  });
```

Añadir `"sombra_invalida"` a la lista de claves de la prueba de mensajes del mismo archivo.

En `tests/traceability/instalaciones.test.ts`, una prueba nueva que reutiliza sus ayudas `sitio()`, `cuenta()` y `nombre()`:

```ts
  it("la sombra va en la instalación y en la cama; la cama sin la suya queda nula, sin copiar", async () => {
    const parent = await sitio();
    const actor = await cuenta(parent.id);
    const patio = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility",
      dryingEnvironment: "african_bed_outdoor", shadePercentage: "pct_30", shadeDescription: "Lona negra a dos metros" });
    const bajoArbol = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: patio.id, locationType: "drying_bed",
      shadePercentage: "pct_70", shadeDescription: "Bajo el árbol de guaba" });
    const alSol = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: patio.id, locationType: "drying_bed" });
    const detalle = await detalleInstalacion(actor, patio.id);
    expect(detalle).toMatchObject({ dryingEnvironment: "african_bed_outdoor", shadePercentage: "pct_30", shadeDescription: "Lona negra a dos metros" });
    expect(detalle.camas.find((c) => c.id === bajoArbol.id)).toMatchObject({ shadePercentage: "pct_70", shadeDescription: "Bajo el árbol de guaba" });
    expect(detalle.camas.find((c) => c.id === alSol.id)).toMatchObject({ shadePercentage: null, shadeDescription: null });
    expect((await actualizarUbicacionDeSecado(actor, { locationId: alSol.id, name: alSol.name, shadePercentage: "pct_20", shadeDescription: null })).shadePercentage).toBe("pct_20");
    await expect(crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: patio.id, locationType: "drying_bed", shadeDescription: "x".repeat(301) }))
      .rejects.toThrow("sombra_invalida");
  });
```

- [ ] **Paso 2: comprobar que fallan**

`npx vitest run tests/traceability/secadoForm.test.ts tests/traceability/instalaciones.test.ts`, con las variables de la base → FALLAN: `shadeDescription` desconocido, y `leerUbicacionDeSecado` no devuelve la sombra.

- [ ] **Paso 3: la migración y el esquema**

```sql
-- Paso 2a del spec de secado por bandeja (§4.1). Nombres aprobados por Daniel el
-- 2026-09-18. Los tres ADD VALUE van solos: Postgres no deja USAR un valor de
-- enum en la misma transacción que lo añade, y las reglas del estante (que sí
-- lo usan) van en la migración siguiente.
ALTER TYPE "core"."DryingEnvironment" ADD VALUE 'african_bed_outdoor';
ALTER TYPE "core"."DryingEnvironment" ADD VALUE 'floor_tarp';
ALTER TYPE "core"."LocationType" ADD VALUE 'drying_rack';

-- La sombra de arriba (Daniel, 2026-09-18): QUÉ la da —un árbol, una
-- enredadera, una lona, un techo con cierta opacidad—, en texto libre al lado
-- del grado. El grado es `shade_percentage`, que ya existe y usan las parcelas.
ALTER TABLE "core"."location" ADD COLUMN "shade_description" TEXT;
ALTER TABLE "core"."location"
  ADD CONSTRAINT "location_shade_description_corta"
    CHECK ("shade_description" IS NULL OR char_length("shade_description") <= 300);
```

En `prisma/schema.prisma`:
- en `enum DryingEnvironment`, después de `mechanical_dryer`:

  ```prisma
  /// Cama elevada afuera, a la intemperie. Sin estante.
  african_bed_outdoor
  /// En el piso, sobre lona. Sin estante.
  floor_tarp
  ```

- en `enum LocationType`, después de `drying_facility`:

  ```prisma
  /// Un estante dentro de una instalación de secado: «Estante 1» del cuarto
  /// oscuro. Sus posiciones (`drying_bed` con nivel y puesto) se generan al crearlo.
  drying_rack
  ```

- debajo de `rackLevel`:

  ```prisma
  /// Instalación o cama de secado: QUÉ da la sombra de arriba —árbol, enredadera,
  /// lona, techo con cierta opacidad—, en texto libre al lado de `shadePercentage`,
  /// nunca en su lugar. Una cama sin la suya se ENSEÑA con la de su instalación,
  /// marcada como tal; no se copia aquí.
  shadeDescription  String?            @map("shade_description")
  ```

`npx prisma migrate deploy` y `npm run prisma:generate`. Leer que imprime `20260918190000_secado_ambientes_estante_y_sombra`.

- [ ] **Paso 4: el código**

En `lib/traceability/secadoForm.ts`:
- el import del enum, con la misma forma que ya trae `DryingEnvironment`: `ShadePercentageBracket`;
- la constante: `export const GRADOS_DE_SOMBRA = Object.values(ShadePercentageBracket);`
- en `leerUbicacionDeSecado`, antes del `return`:

```ts
  // La sombra de arriba (Daniel, 2026-09-18): el grado es la escala de las
  // parcelas; la nota dice QUÉ la da. Vacías quedan nulas: no declarado.
  const grado = texto(form, "shadePercentage");
  if (grado && !(GRADOS_DE_SOMBRA as string[]).includes(grado)) throw new SecadoFormError("sombra_invalida");
  const shadeDescription = texto(form, "shadeDescription").trim() || null;
  if (shadeDescription && shadeDescription.length > 300) throw new SecadoFormError("sombra_invalida");
```

y en el objeto devuelto: `shadePercentage: (grado || null) as ShadePercentageBracket | null, shadeDescription,`.

En `lib/traceability/instalaciones.ts`:
- `Datos` gana `shadePercentage?: ShadePercentageBracket | null; shadeDescription?: string | null`, con el import del tipo desde `../../generated/prisma/enums`, igual que `DryingEnvironment`;
- en `validar`, **antes** de la bifurcación por tipo, que vale para los dos:

```ts
  if (input.shadePercentage != null && !GRADOS_DE_SOMBRA.includes(input.shadePercentage)) throw new SecadoFormError("sombra_invalida");
  if (input.shadeDescription != null && input.shadeDescription.trim().length > 300) throw new SecadoFormError("sombra_invalida");
```

- en el `data` de crear y de actualizar: `shadePercentage: input.shadePercentage ?? null, shadeDescription: input.shadeDescription?.trim() || null`;
- en `detalleInstalacion`, el `return` añade `shadePercentage: row.shadePercentage, shadeDescription: row.shadeDescription`, y cada cama `shadePercentage: bed.shadePercentage, shadeDescription: bed.shadeDescription`.

En `app/instalaciones/FormularioUbicacion.tsx`:
- el tipo `existente` gana `shadePercentage?: string | null; shadeDescription?: string | null`;
- el import: `GRADOS_DE_SOMBRA`;
- **para los dos tipos**, antes del botón:

```tsx
    <label>{t("sombra")}<select name="shadePercentage" defaultValue={existente?.shadePercentage ?? ""}>
      <option value="">{t("noDeclarado")}</option>
      {GRADOS_DE_SOMBRA.map((g) => <option key={g} value={g}>{t(`sombra_${g}`)}</option>)}
    </select></label>
    <label>{t("sombraNota")}<input name="shadeDescription" maxLength={300} defaultValue={existente?.shadeDescription ?? ""} />
      <span className="nn-muted">{t(tipo === "drying_bed" ? "sombraAyudaCama" : "sombraAyuda")}</span></label>
```

En `app/instalaciones/page.tsx`, la instalación y cada cama enseñan su sombra. Una cama sin la suya enseña la de la instalación **con la etiqueta `sombraDeLaInstalacion`**, y así se añade una función al archivo:

```tsx
function sombra(t: (k: string, v?: Record<string, string>) => string, grado: string | null, nota: string | null) {
  if (!grado && !nota) return null;
  return t("sombraValor", { grado: grado ? t(`sombra_${grado}`) : t("noDeclarado"), nota: nota ?? "" });
}
```

y en la línea de la cama: `{sombra(t, c.shadePercentage, c.shadeDescription) ?? (i.shadePercentage || i.shadeDescription ? `${sombra(t, i.shadePercentage, i.shadeDescription)} (${t("sombraDeLaInstalacion")})` : null)}`.

Mensajes, espacio `Secado`, en `messages/es.json`:

```json
    "sombra": "Sombra de arriba (opcional)",
    "sombraNota": "Qué da la sombra (opcional)",
    "sombraAyuda": "Árbol, enredadera, lona, techo con cierta opacidad… Vale para toda la instalación.",
    "sombraAyudaCama": "Sólo si esta cama tiene una sombra distinta a la de su instalación.",
    "sombraValor": "Sombra {grado} {nota}",
    "sombraDeLaInstalacion": "la de la instalación",
    "sombra_pct_20": "20 %", "sombra_pct_30": "30 %", "sombra_pct_50": "50 %", "sombra_pct_70": "70 %", "sombra_pct_90": "90 %",
    "ambiente_african_bed_outdoor": "Cama africana a la intemperie",
    "ambiente_floor_tarp": "Piso con lona",
    "error_sombra_invalida": "El grado de sombra no es de la lista, o la nota pasa de 300 caracteres.",
```

`messages/en.json`, las mismas claves:

```json
    "sombra": "Overhead shade (optional)",
    "sombraNota": "What gives the shade (optional)",
    "sombraAyuda": "Tree, vine, tarp, a roof with some opacity… Applies to the whole facility.",
    "sombraAyudaCama": "Only if this bed has a different shade from its facility.",
    "sombraValor": "Shade {grado} {nota}",
    "sombraDeLaInstalacion": "the facility's",
    "sombra_pct_20": "20 %", "sombra_pct_30": "30 %", "sombra_pct_50": "50 %", "sombra_pct_70": "70 %", "sombra_pct_90": "90 %",
    "ambiente_african_bed_outdoor": "African raised bed, outdoors",
    "ambiente_floor_tarp": "Floor on tarp",
    "error_sombra_invalida": "The shade level is not on the list, or the note is longer than 300 characters.",
```

En `docs/beneficio/03_public_api.md`, al final, una sección nueva:

```markdown
## 11. Secado: instalaciones, estantes y bandejas (TypeScript + Postgres)

Nombres aprobados por Daniel el 2026-09-18 (spec
`docs/superpowers/specs/2026-09-18-secado-por-bandeja-y-su-receta-design.md`).
Son de persistencia, no de motor: los motores de §6 no cambian.

| nombre | dónde | qué es |
|---|---|---|
| `DryingEnvironment.african_bed_outdoor` | `core` | cama elevada a la intemperie |
| `DryingEnvironment.floor_tarp` | `core` | en el piso, sobre lona |
| `LocationType.drying_rack` | `core` | un estante de una instalación de secado |
| `Location.shadeDescription` | `core.location.shade_description` | qué da la sombra de arriba, en texto libre |
```

- [ ] **Paso 5: comprobar que pasan**

Las dos pruebas del paso 2 → PASAN. `npm run build` → 0.

- [ ] **Paso 6: commit**

```bash
git add prisma/migrations/20260918190000_secado_ambientes_estante_y_sombra/migration.sql
git add prisma/schema.prisma
git add lib/traceability/secadoForm.ts
git add lib/traceability/instalaciones.ts
git add app/instalaciones/FormularioUbicacion.tsx
git add app/instalaciones/page.tsx
git add messages/es.json
git add messages/en.json
git add docs/beneficio/03_public_api.md
git add tests/traceability/secadoForm.test.ts
git add tests/traceability/instalaciones.test.ts
git diff --cached --stat   # 11 archivos
git commit -F <archivo>
```

Mensaje: `feat(secado): cama africana, piso con lona, el tipo estante y la sombra de arriba`.

---

### Tarea 2: estantes con sus posiciones generadas

**Archivos:**
- Crear: `prisma/migrations/20260918190500_estantes_y_posiciones/migration.sql`
- Crear: `lib/traceability/estantes.ts`
- Crear: `app/instalaciones/FormularioEstante.tsx`
- Modificar: `prisma/schema.prisma` (`rackSlot`), `lib/traceability/locations.ts`, `lib/traceability/instalaciones.ts` (`detalleInstalacion`), `lib/traceability/samplingEvents.ts` (`opcionesParaInspeccion`), `app/instalaciones/[id]/page.tsx`, `app/actions/instalaciones.ts`, `messages/es.json`, `messages/en.json`, `docs/beneficio/03_public_api.md`, `scripts/pruebas-por-compuerta.txt`
- Crear: `tests/traceability/estantes.test.ts`

**Interfaces:**
- Consume `LocationType.drying_rack` (T1) y `exigeEditarBeneficioEn` (`lib/traceability/locations.ts`).
- Produce:

```ts
// lib/traceability/estantes.ts
export class EstanteError extends Error {} // mensajes: "datos_invalidos" | "tipo_invalido" | "estante_no_se_reduce"
export const MAX_NIVELES = 20;   // límite físico del formulario, no un umbral de dominio
export const MAX_PUESTOS = 50;
export async function crearEstante(userAccountId: string, input: { facilityId: string; nombre: string; niveles: number; puestos: number }): Promise<{ id: string; creadas: number }>;
export async function ampliarEstante(userAccountId: string, input: { rackId: string; niveles: number; puestos: number }): Promise<{ creadas: number }>;
export function nombreDePosicion(nivel: number, puesto: number): string; // "N4 · P3"
```

- `detalleInstalacion(...)` devuelve además `estantes: { id; name; niveles; puestos; posiciones: { id; nivel; puesto }[] }[]`. `niveles` y `puestos` se **derivan** de las posiciones: son el máximo nivel y el máximo puesto.
- `camas` pasa a ser **sólo las que cuelgan directamente de la instalación**, las que no tienen estante. Hoy ya filtra por `parentLocationId: id`, así que las posiciones quedan fuera solas.

- [ ] **Paso 1: las pruebas que fallan**

`tests/traceability/estantes.test.ts`. Usa el mismo montaje que `tests/traceability/instalaciones.test.ts`: un sitio de prueba y una cuenta con `edit_beneficio` concedido. Copiar de allí sus ayudas `sitio()`, `cuenta()`, `nombre()` y su `afterAll`, **leyéndolas primero**, y añadirles el borrado de estantes y posiciones: **primero las posiciones, después los estantes**.

```ts
describe("estantes", () => {
  it("crear un estante de 6 niveles × 6 puestos crea sus 36 posiciones, como un estante del cuarto oscuro I", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const cuarto = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility", dryingEnvironment: "dark_room_climate_controlled" });
    const { id, creadas } = await crearEstante(actor, { facilityId: cuarto.id, nombre: "Estante 1", niveles: 6, puestos: 6 });
    expect(creadas).toBe(36);
    const pos = await prisma.location.findMany({ where: { parentLocationId: id } });
    expect(pos).toHaveLength(36);
    expect(pos.every((p) => p.locationType === "drying_bed" && p.organizationId === cuarto.organizationId)).toBe(true);
    expect(pos.find((p) => p.rackLevel === 4 && p.rackSlot === 3)?.name).toBe("N4 · P3");
    const detalle = await detalleInstalacion(actor, cuarto.id);
    expect(detalle.estantes).toEqual([expect.objectContaining({ id, niveles: 6, puestos: 6 })]);
    expect(detalle.camas).toEqual([]); // las posiciones NO salen como camas sueltas
  });

  it("ampliar crea sólo lo que falta; reducir se rechaza; nada se borra", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const cuarto = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility" });
    const { id } = await crearEstante(actor, { facilityId: cuarto.id, nombre: "Estante 1", niveles: 2, puestos: 3 });
    expect((await ampliarEstante(actor, { rackId: id, niveles: 3, puestos: 4 })).creadas).toBe(12 - 6);
    expect(await prisma.location.count({ where: { parentLocationId: id } })).toBe(12);
    await expect(ampliarEstante(actor, { rackId: id, niveles: 2, puestos: 4 })).rejects.toThrow("estante_no_se_reduce");
    expect(await prisma.location.count({ where: { parentLocationId: id } })).toBe(12);
  });

  it("valida sus números, cada rechazo al lado de uno que entra", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const cuarto = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility" });
    for (const [niveles, puestos] of [[0, 1], [1, 0], [1.5, 2], [MAX_NIVELES + 1, 1], [1, MAX_PUESTOS + 1]]) {
      await expect(crearEstante(actor, { facilityId: cuarto.id, nombre: "E", niveles, puestos })).rejects.toThrow("datos_invalidos");
    }
    await expect(crearEstante(actor, { facilityId: cuarto.id, nombre: "  ", niveles: 1, puestos: 1 })).rejects.toThrow("datos_invalidos");
    await expect(crearEstante(actor, { facilityId: parent.id, nombre: "E", niveles: 1, puestos: 1 })).rejects.toThrow("tipo_invalido"); // un sitio no lleva estantes
    expect((await crearEstante(actor, { facilityId: cuarto.id, nombre: "E", niveles: MAX_NIVELES, puestos: 1 })).creadas).toBe(MAX_NIVELES);
  });

  it("sin edit_beneficio no se crea ni se amplía", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const cuarto = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility" });
    const { id } = await crearEstante(actor, { facilityId: cuarto.id, nombre: "E", niveles: 1, puestos: 1 });
    const ajeno = await cuentaSinConcesion(parent.id); // la de instalaciones.test.ts: manage_attributes sin edit_beneficio
    await expect(crearEstante(ajeno, { facilityId: cuarto.id, nombre: "E2", niveles: 1, puestos: 1 })).rejects.toThrow();
    await expect(ampliarEstante(ajeno, { rackId: id, niveles: 2, puestos: 1 })).rejects.toThrow();
  });
});

describe("reglas del estante en la base", () => {
  it("un estante sólo cuelga de una instalación; una posición de estante lleva nivel y puesto y no se repite", async () => {
    const s = await sitio();
    const inv = await prisma.location.create({ data: { name: nombre(), locationType: "drying_facility", parentLocationId: s.id } });
    await expect(prisma.location.create({ data: { name: nombre(), locationType: "drying_rack", parentLocationId: s.id } })).rejects.toThrow(/estante debe colgar de una instalacion/);
    const rack = await prisma.location.create({ data: { name: nombre(), locationType: "drying_rack", parentLocationId: inv.id } }); // control
    await expect(prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: rack.id, rackLevel: 1 } })).rejects.toThrow(/nivel y puesto/);
    await prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: rack.id, rackLevel: 1, rackSlot: 1 } }); // control
    await expect(prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: rack.id, rackLevel: 1, rackSlot: 1 } })).rejects.toThrow(/location_posicion_unica/);
    await expect(prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: rack.id, rackLevel: 1, rackSlot: 0 } })).rejects.toThrow(/location_rack_slot_positivo/);
    await expect(prisma.location.create({ data: { name: nombre(), locationType: "drying_bed", parentLocationId: inv.id, rackSlot: 2 } })).rejects.toThrow(/puesto solo en una posicion de estante/);
  });
});

describe("la inspección de hoy no ofrece posiciones de estante", () => {
  it("opcionesParaInspeccion lista las camas sueltas y no las 36 posiciones", async () => {
    const parent = await sitio(); const actor = await cuenta(parent.id);
    const patio = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility" });
    const cama = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: patio.id, locationType: "drying_bed" });
    const { id } = await crearEstante(actor, { facilityId: patio.id, nombre: "E", niveles: 6, puestos: 6 });
    const ids = (await opcionesParaInspeccion(actor)).camas.map((c) => c.id);
    expect(ids).toContain(cama.id); // control positivo
    const posiciones = (await prisma.location.findMany({ where: { parentLocationId: id } })).map((p) => p.id);
    expect(ids.filter((x) => posiciones.includes(x))).toEqual([]);
  });
});
```

`cuentaSinConcesion` es la ayuda que `tests/traceability/instalaciones.test.ts` ya usa para el caso «sin edit_beneficio». **Leer su nombre real ahí** antes de copiarla. Si no existe con ese papel, se escribe con el mismo montaje: Farm Operator en el sitio, sin override.

Añadir `tests/traceability/estantes.test.ts` al grupo `base-sembrada`.

- [ ] **Paso 2: comprobar que fallan** → el módulo `estantes` no existe.

- [ ] **Paso 3: la migración**

```sql
-- Paso 2a (spec §4.1): el estante y sus posiciones. Una posición es una
-- drying_bed hija del estante, con nivel (rack_level, ya existe) y PUESTO.
ALTER TABLE "core"."location" ADD COLUMN "rack_slot" INTEGER;
ALTER TABLE "core"."location"
  ADD CONSTRAINT "location_rack_slot_positivo" CHECK ("rack_slot" IS NULL OR "rack_slot" > 0);

-- Una posición no se repite en su estante.
CREATE UNIQUE INDEX "location_posicion_unica"
  ON "core"."location"("parent_location_id", "rack_level", "rack_slot")
  WHERE "rack_slot" IS NOT NULL;

-- El árbol del estante mira el tipo del PADRE: otra fila, así que disparador.
CREATE OR REPLACE FUNCTION "core"."exigir_arbol_de_estante"()
RETURNS TRIGGER AS $$
DECLARE tipo_padre TEXT;
BEGIN
  SELECT "location_type"::TEXT INTO tipo_padre FROM "core"."location" WHERE "id" = NEW."parent_location_id";
  IF NEW."location_type" = 'drying_rack' AND tipo_padre IS DISTINCT FROM 'drying_facility' THEN
    RAISE EXCEPTION 'Un estante debe colgar de una instalacion de secado (cuelga de %)', tipo_padre;
  END IF;
  IF NEW."location_type" = 'drying_bed' AND tipo_padre = 'drying_rack'
     AND (NEW."rack_level" IS NULL OR NEW."rack_slot" IS NULL) THEN
    RAISE EXCEPTION 'Una posicion de estante lleva nivel y puesto';
  END IF;
  IF NEW."rack_slot" IS NOT NULL AND (NEW."location_type" <> 'drying_bed' OR tipo_padre IS DISTINCT FROM 'drying_rack') THEN
    RAISE EXCEPTION 'El puesto solo en una posicion de estante';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "location_arbol_de_estante"
  BEFORE INSERT OR UPDATE OF "location_type", "parent_location_id", "rack_level", "rack_slot"
  ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_arbol_de_estante"();
```

En el esquema, debajo de `rackLevel`:

```prisma
  /// Sólo para una posición de estante (`drying_bed` hija de `drying_rack`): el
  /// PUESTO dentro del nivel. «Estante 2 · Nivel 4 · Puesto 3» (Daniel, 2026-09-18).
  rackSlot          Int?               @map("rack_slot")
```

**El índice parcial no va en el esquema:** Prisma no lo expresa. Hay que correr el guardia de deriva **con** `SHADOW_DATABASE_URL`. Si se queja, se sigue la forma de las migraciones que ya tienen índices parciales: localizarlas con `grep -l "WHERE" prisma/migrations/*/migration.sql`.

- [ ] **Paso 4: el servicio**

`lib/traceability/estantes.ts`:

```ts
/**
 * Estantes de una instalación de secado y sus posiciones (spec §4.1, Daniel
 * 2026-09-18): «Cuarto oscuro I · Estante 2 · Nivel 4 · Puesto 3». Al crear un
 * estante se dan niveles × puestos y las posiciones se crean solas; ampliar crea
 * las que faltan; NUNCA se borra ni se reduce: una bandeja que estuvo en una
 * posición tiene que poder seguir diciendo dónde estuvo.
 */
import type { ClassificationLevel, Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { exigeEditarBeneficioEn } from "./locations";

export class EstanteError extends Error {}
/** Límites físicos del formulario —evitan crear un millón de filas por un error de tecleo—, no umbrales de dominio. */
export const MAX_NIVELES = 20;
export const MAX_PUESTOS = 50;

export function nombreDePosicion(nivel: number, puesto: number) {
  return `N${nivel} · P${puesto}`;
}

function validar(niveles: number, puestos: number) {
  const ok = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
  if (!ok(niveles, MAX_NIVELES) || !ok(puestos, MAX_PUESTOS)) throw new EstanteError("datos_invalidos");
}

async function crearPosiciones(
  tx: Prisma.TransactionClient,
  rack: { id: string; organizationId: string | null; classification: ClassificationLevel; timezone: string | null },
  niveles: number, puestos: number, userAccountId: string,
) {
  const existentes = await tx.location.findMany({ where: { parentLocationId: rack.id }, select: { rackLevel: true, rackSlot: true } });
  const hay = new Set(existentes.map((e) => `${e.rackLevel}:${e.rackSlot}`));
  const nuevas = [];
  for (let n = 1; n <= niveles; n++) for (let p = 1; p <= puestos; p++) {
    if (!hay.has(`${n}:${p}`)) nuevas.push({
      name: nombreDePosicion(n, p), locationType: "drying_bed" as const, parentLocationId: rack.id,
      organizationId: rack.organizationId, classification: rack.classification, timezone: rack.timezone,
      rackLevel: n, rackSlot: p, createdBy: userAccountId,
    });
  }
  if (nuevas.length) await tx.location.createMany({ data: nuevas });
  return nuevas.length;
}

export async function crearEstante(userAccountId: string, input: { facilityId: string; nombre: string; niveles: number; puestos: number }) {
  await exigeEditarBeneficioEn(userAccountId, input.facilityId);
  const nombre = input.nombre.trim();
  if (!nombre || nombre.length > 120) throw new EstanteError("datos_invalidos");
  validar(input.niveles, input.puestos);
  const cuarto = await prisma.location.findUniqueOrThrow({ where: { id: input.facilityId } });
  if (cuarto.locationType !== "drying_facility") throw new EstanteError("tipo_invalido");
  return prisma.$transaction(async (tx) => {
    const rack = await tx.location.create({ data: {
      name: nombre, locationType: "drying_rack", parentLocationId: cuarto.id,
      organizationId: cuarto.organizationId, classification: cuarto.classification, timezone: cuarto.timezone, createdBy: userAccountId,
    } });
    const creadas = await crearPosiciones(tx, rack, input.niveles, input.puestos, userAccountId);
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "location.create_drying_rack", entityType: "location",
      entityId: rack.id, after: { ...rack, niveles: input.niveles, puestos: input.puestos, posicionesCreadas: creadas }, sourceInterface: "traceability.service" }, tx);
    return { id: rack.id, creadas };
  });
}

export async function ampliarEstante(userAccountId: string, input: { rackId: string; niveles: number; puestos: number }) {
  await exigeEditarBeneficioEn(userAccountId, input.rackId);
  validar(input.niveles, input.puestos);
  const rack = await prisma.location.findUniqueOrThrow({ where: { id: input.rackId } });
  if (rack.locationType !== "drying_rack") throw new EstanteError("tipo_invalido");
  const actual = await prisma.location.aggregate({ where: { parentLocationId: rack.id }, _max: { rackLevel: true, rackSlot: true } });
  if (input.niveles < (actual._max.rackLevel ?? 0) || input.puestos < (actual._max.rackSlot ?? 0)) throw new EstanteError("estante_no_se_reduce");
  return prisma.$transaction(async (tx) => {
    const creadas = await crearPosiciones(tx, rack, input.niveles, input.puestos, userAccountId);
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "location.expand_drying_rack", entityType: "location",
      entityId: rack.id, after: { niveles: input.niveles, puestos: input.puestos, posicionesCreadas: creadas }, sourceInterface: "traceability.service" }, tx);
    return { creadas };
  });
}
```

**`createMany` no dispara nada que falte:** los disparadores de Postgres corren fila a fila también en un `INSERT` múltiple, y el índice único cierra la carrera de dos ampliaciones a la vez. Comprobarlo con la sonda de la base. **No se supone.**

En `lib/traceability/locations.ts`:
- `TIPOS_DEL_BENEFICIO` gana `"drying_rack"`;
- el rechazo de microlote: `if (parent.locationType === "drying_facility" || parent.locationType === "drying_bed" || parent.locationType === "drying_rack")`.

En `lib/traceability/instalaciones.ts`, `detalleInstalacion` añade:

```ts
  const racks = await prisma.location.findMany({ where: { parentLocationId: id, locationType: "drying_rack" }, orderBy: { name: "asc" } });
  const estantes = [];
  for (const r of racks) {
    const posiciones = await prisma.location.findMany({
      where: { parentLocationId: r.id }, orderBy: [{ rackLevel: "asc" }, { rackSlot: "asc" }],
      select: { id: true, rackLevel: true, rackSlot: true },
    });
    estantes.push({
      id: r.id, name: r.name,
      niveles: Math.max(0, ...posiciones.map((p) => p.rackLevel ?? 0)),
      puestos: Math.max(0, ...posiciones.map((p) => p.rackSlot ?? 0)),
      posiciones: posiciones.map((p) => ({ id: p.id, nivel: p.rackLevel!, puesto: p.rackSlot! })),
    });
  }
```

y `estantes` en el `return`. El permiso es el de la instalación, que ya se exigió arriba. Un estante con una concesión propia y más estrecha no existe hoy, porque `edit_beneficio` se concede sobre el beneficio.

En `lib/traceability/samplingEvents.ts`, `opcionesParaInspeccion`: la consulta de camas pasa a `where: { locationType: "drying_bed", parentLocation: { locationType: { not: "drying_rack" } } }`. **Por qué:** la inspección por bandeja es el paso 3. Hasta entonces, ofrecer 72 o 300 posiciones en un desplegable no sirve para nada.

La pantalla:
- **`app/instalaciones/FormularioEstante.tsx`**, un componente cliente con `useActionState`:
  - crear: campos `nombre`, `niveles` y `puestos` (`CampoNumerico` con min 1 y max `MAX_NIVELES` o `MAX_PUESTOS`), y `facilityId` oculto;
  - ampliar: `rackId` oculto y los dos números, con el valor actual por defecto.
- **`app/actions/instalaciones.ts`** gana `guardarEstanteFormAction(state, form)`:
  - con `rackId` llama a `ampliarEstante`, y sin él a `crearEstante`;
  - traduce `EstanteError` a `{ error: mensaje }` y `LocationAccessError` a `{ error: "sin_acceso" }`;
  - redirige a `/instalaciones/<facilityId>?ok=guardado`.
- **`app/instalaciones/[id]/page.tsx`**:
  - una sección «Estantes» y, por estante, una **rejilla**: una fila por nivel, del más alto al más bajo, y una celda por puesto con `P{n}`;
  - debajo, el formulario de ampliar, si `puedeEditar`;
  - al final, «Crear estante».
  - La rejilla es de sólo lectura en este plan: qué bandeja hay en cada posición lo pinta el 2b.

Mensajes, `Secado`, en es y en:

```json
    "estantes": "Estantes" / "Racks",
    "crearEstante": "Crear estante" / "Add rack",
    "ampliarEstante": "Ampliar" / "Expand",
    "nombreEstante": "Nombre del estante" / "Rack name",
    "niveles": "Niveles" / "Levels",
    "puestos": "Puestos por nivel" / "Slots per level",
    "estanteAyuda": "Las posiciones se crean solas: niveles × puestos. Nunca se borran." / "Positions are created for you: levels × slots. They are never deleted.",
    "resumenEstante": "{niveles} niveles × {puestos} puestos = {total} posiciones" / "{niveles} levels × {puestos} slots = {total} positions",
    "nivel": "Nivel {n}" / "Level {n}",
    "error_estante_no_se_reduce": "Un estante no se reduce: las posiciones pueden tener historia." / "A rack cannot shrink: its positions may have history.",
```

(Cada línea es «español / inglés»: el español va a `es.json` y el inglés a `en.json`.)

`docs/beneficio/03_public_api.md` §11 gana una fila:

`| Location.rackSlot | core.location.rack_slot | el puesto dentro del nivel de un estante |`

- [ ] **Paso 5: comprobar que pasan**

`npx vitest run tests/traceability/estantes.test.ts tests/traceability/instalaciones.test.ts tests/traceability/eventoDeMuestreo.test.ts` → verde. La última es el control de que la inspección sigue listando camas. Después `npm run build` → 0.

- [ ] **Paso 6: commit.** Mensaje: `feat(secado): estantes con sus posiciones por nivel y puesto`. Contar el stat contra la lista de archivos de esta tarea.

---

### Tarea 3: tipos de bandeja y bandejas numeradas por finca

**Archivos:**
- Crear: `prisma/migrations/20260918191000_tipos_y_numero_de_bandeja/migration.sql`
- Crear: `lib/equipos/bandejas.ts`
- Modificar: `prisma/schema.prisma`, `lib/equipos/equipos.ts`, `docs/beneficio/03_public_api.md`, `scripts/pruebas-por-compuerta.txt`
- Crear: `tests/equipos/bandejas.test.ts`

**Interfaces:**
- Produce:

```ts
// lib/equipos/equipos.ts
export async function puedeConfigurarEn(userAccountId: string, locationId: string): Promise<boolean>; // el mismo `puedeConfigurar` de registrarEquipo, sobre un lugar

// lib/equipos/bandejas.ts
export class BandejaConfigError extends Error {} // "datos_invalidos" | "sin_acceso" | "tipo_de_otra_organizacion" | "nombre_repetido"
export const PIE_EN_CM = 30.48;
export const MAX_TANDA = 400;          // límite físico del formulario
export function numeroDeBandeja(n: number): string; // 1 → "B-001", 1000 → "B-1000"
export function areaM2(tipo: { widthCm: number | Prisma.Decimal; lengthCm: number | Prisma.Decimal }): number;
export async function crearTipoDeBandeja(userAccountId: string, input: { organizationId: string; nombre: string; ancho: number; largo: number; unidad: "ft" | "cm" }): Promise<{ id: string }>;
export async function tiposDeBandeja(userAccountId: string, organizationId: string): Promise<{ id: string; nombre: string; widthCm: number; lengthCm: number; entryUnit: string; areaM2: number }[]>;
export async function registrarBandejas(userAccountId: string, input: { siteId: string; trayTypeId: string; cantidad: number }): Promise<{ numeros: string[] }>;
export async function bandejasDeLaFinca(userAccountId: string, organizationId: string): Promise<{ id: string; numero: string; tipo: string; dondeId: string | null; donde: string | null }[]>;
```

- [ ] **Paso 1: las pruebas que fallan**

`tests/equipos/bandejas.test.ts`. El montaje es una organización de prueba con un sitio, y dos cuentas:
- una **Farm Manager** en el sitio, que tiene `edit_beneficio`;
- una **Farm Operator** en el mismo sitio.

Leer cómo `tests/traceability/editarBeneficio.test.ts` monta a los dos y copiar esa forma.

```ts
describe("tipos de bandeja", () => {
  it("4×2 pies se guarda en cm y da el área del plan de secado (0,743 m²); 2×2 da 0,372 m²", async () => {
    const t = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: "4×2 pies", ancho: 4, largo: 2, unidad: "ft" });
    const fila = await prisma.dryingTrayType.findUniqueOrThrow({ where: { id: t.id } });
    expect(Number(fila.widthCm)).toBe(121.9);   // 4 × 30,48 = 121,92 → un decimal
    expect(Number(fila.lengthCm)).toBe(61);     // 2 × 30,48 = 60,96 → 61,0
    expect(fila.entryUnit).toBe("ft");
    // Control contra la fuente independiente (plan de secado §6): 0,743 y 0,372 m².
    expect(areaM2(fila)).toBeCloseTo(0.743, 3);
    const dos = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: "2×2 pies", ancho: 2, largo: 2, unidad: "ft" });
    expect(areaM2(await prisma.dryingTrayType.findUniqueOrThrow({ where: { id: dos.id } }))).toBeCloseTo(0.372, 3);
  });

  it("rechaza medidas inválidas, nombre repetido y a quien no configura el beneficio", async () => {
    for (const [ancho, largo] of [[0, 2], [2, -1], [Number.NaN, 2]]) {
      await expect(crearTipoDeBandeja(gerente, { organizationId: org, nombre: `x${ancho}`, ancho, largo, unidad: "ft" })).rejects.toThrow("datos_invalidos");
    }
    await crearTipoDeBandeja(gerente, { organizationId: org, nombre: "Repetida", ancho: 1, largo: 1, unidad: "ft" });
    await expect(crearTipoDeBandeja(gerente, { organizationId: org, nombre: "Repetida", ancho: 1, largo: 1, unidad: "ft" })).rejects.toThrow("nombre_repetido");
    await expect(crearTipoDeBandeja(operario, { organizationId: org, nombre: "Del operario", ancho: 1, largo: 1, unidad: "ft" })).rejects.toThrow();
  });
});

describe("bandejas numeradas por finca", () => {
  it("registrar en tanda da números consecutivos que siguen al último, con su alta en el sitio", async () => {
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: "Tanda", ancho: 4, largo: 2, unidad: "ft" });
    const a = await registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad: 3 });
    const b = await registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad: 2 });
    // La organización de prueba es nueva: su primera bandeja es la 1.
    expect([...a.numeros, ...b.numeros]).toEqual(["B-001", "B-002", "B-003", "B-004", "B-005"]);
    const eq = await prisma.equipment.findMany({ where: { organizationId: org, trayNumber: { not: null } }, include: { transfers: true } });
    expect(eq.every((e) => e.kind === "vessel" && e.trayTypeId === tipo.id && e.transfers.length === 1 && e.transfers[0]!.toLocationId === sitio)).toBe(true);
  });

  it("dos tandas a la vez no repiten número", async () => {
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: "Carrera", ancho: 2, largo: 2, unidad: "ft" });
    const [x, y] = await Promise.all([
      registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad: 5 }),
      registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad: 5 }),
    ]);
    const todos = [...x.numeros, ...y.numeros];
    expect(new Set(todos).size).toBe(10);
  });

  it("rechaza tipo de otra organización, cantidad fuera de rango y a quien no configura", async () => {
    const ajeno = await crearTipoDeBandeja(gerenteDeOtra, { organizationId: otraOrg, nombre: "Ajeno", ancho: 1, largo: 1, unidad: "ft" });
    await expect(registrarBandejas(gerente, { siteId: sitio, trayTypeId: ajeno.id, cantidad: 1 })).rejects.toThrow("tipo_de_otra_organizacion");
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: "Rangos", ancho: 1, largo: 1, unidad: "ft" });
    for (const cantidad of [0, 1.5, MAX_TANDA + 1]) {
      await expect(registrarBandejas(gerente, { siteId: sitio, trayTypeId: tipo.id, cantidad })).rejects.toThrow("datos_invalidos");
    }
    await expect(registrarBandejas(operario, { siteId: sitio, trayTypeId: tipo.id, cantidad: 1 })).rejects.toThrow("sin_acceso");
  });
});

describe("reglas de la bandeja en la base", () => {
  it("número y tipo sólo en recipientes, los dos juntos, el número único en la finca y > 0", async () => {
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org, nombre: "Base", ancho: 1, largo: 1, unidad: "ft" });
    const base = { organizationId: org, provenanceClass: "original_record" as const };
    await expect(prisma.equipment.create({ data: { ...base, name: "i", kind: "instrument", trayTypeId: tipo.id, trayNumber: 900 } })).rejects.toThrow(/equipment_bandeja_solo_recipiente/);
    await expect(prisma.equipment.create({ data: { ...base, name: "s", kind: "vessel", trayNumber: 901 } })).rejects.toThrow(/equipment_bandeja_tipo_y_numero/);
    await expect(prisma.equipment.create({ data: { ...base, name: "c", kind: "vessel", trayTypeId: tipo.id, trayNumber: 0 } })).rejects.toThrow(/equipment_tray_number_positivo/);
    await prisma.equipment.create({ data: { ...base, name: "ok", kind: "vessel", trayTypeId: tipo.id, trayNumber: 902 } }); // control
    await expect(prisma.equipment.create({ data: { ...base, name: "dup", kind: "vessel", trayTypeId: tipo.id, trayNumber: 902 } })).rejects.toThrow(/equipment_numero_de_bandeja_unico/);
    const deOtra = await crearTipoDeBandeja(gerenteDeOtra, { organizationId: otraOrg, nombre: "Otra", ancho: 1, largo: 1, unidad: "ft" });
    await expect(prisma.equipment.create({ data: { ...base, name: "x", kind: "vessel", trayTypeId: deOtra.id, trayNumber: 903 } })).rejects.toThrow(/tipo de bandeja es de otra organizacion/);
  });
});
```

**La prueba de números exactos exige que sea la primera tanda de esa organización.** Por eso cada `describe` que registra bandejas usa **su propia organización de prueba**, y la de la carrera usa otra. Si no, el orden de las pruebas cambiaría los números.

**El `afterAll` borra en este orden**, porque las claves foráneas son `RESTRICT`:
1. traslados;
2. equipos;
3. tipos;
4. asignaciones y ámbitos;
5. cuentas y personas;
6. ubicaciones;
7. organizaciones.

Añadir el archivo a `base-sembrada`.

- [ ] **Paso 2: comprobar que fallan.**

- [ ] **Paso 3: la migración**

```sql
-- Paso 2a (spec §4.2). El tipo de bandeja de la organización, y el tipo y el
-- número de cada bandeja. La bandeja sigue siendo un `equipment` de kind vessel.
CREATE TABLE "core"."drying_tray_type" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "width_cm" DECIMAL(6,1) NOT NULL,
  "length_cm" DECIMAL(6,1) NOT NULL,
  "entry_unit" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "drying_tray_type_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drying_tray_type_medidas_positivas" CHECK ("width_cm" > 0 AND "length_cm" > 0),
  CONSTRAINT "drying_tray_type_unidad" CHECK ("entry_unit" IN ('ft', 'cm'))
);
ALTER TABLE "core"."drying_tray_type"
  ADD CONSTRAINT "drying_tray_type_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_tray_type_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "drying_tray_type_nombre_unico" ON "core"."drying_tray_type"("organization_id", "name");

ALTER TABLE "core"."equipment"
  ADD COLUMN "tray_type_id" UUID,
  ADD COLUMN "tray_number" INTEGER,
  ADD CONSTRAINT "equipment_tray_type_id_fkey" FOREIGN KEY ("tray_type_id")
    REFERENCES "core"."drying_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "equipment_bandeja_solo_recipiente" CHECK ("tray_type_id" IS NULL OR "kind" = 'vessel'),
  ADD CONSTRAINT "equipment_bandeja_tipo_y_numero" CHECK (("tray_type_id" IS NULL) = ("tray_number" IS NULL)),
  ADD CONSTRAINT "equipment_tray_number_positivo" CHECK ("tray_number" IS NULL OR "tray_number" > 0);

-- El número no se repite en la finca (= la organización). Cierra la carrera de
-- dos tandas a la vez, además del bloqueo del servicio.
CREATE UNIQUE INDEX "equipment_numero_de_bandeja_unico"
  ON "core"."equipment"("organization_id", "tray_number") WHERE "tray_number" IS NOT NULL;

-- El tipo es de la misma organización que la bandeja: otra tabla, disparador.
CREATE OR REPLACE FUNCTION "core"."exigir_tipo_de_bandeja_propio"()
RETURNS TRIGGER AS $$
DECLARE org UUID;
BEGIN
  IF NEW."tray_type_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "organization_id" INTO org FROM "core"."drying_tray_type" WHERE "id" = NEW."tray_type_id";
  IF org IS DISTINCT FROM NEW."organization_id" THEN
    RAISE EXCEPTION 'El tipo de bandeja es de otra organizacion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "equipment_tipo_de_bandeja_propio"
  BEFORE INSERT OR UPDATE OF "tray_type_id", "organization_id" ON "core"."equipment"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_tipo_de_bandeja_propio"();
```

En el esquema:

```prisma
/// Un tipo de bandeja de secado de la organización: «4×2 pies» (spec §4.2). Se
/// guarda en cm (00_conventions §1) y se conserva la unidad tecleada. El área NO
/// se guarda: se deriva de ancho × largo, que es lo medido.
model DryingTrayType {
  id             String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String       @map("organization_id") @db.Uuid
  organization   Organization @relation("DryingTrayTypeOwner", fields: [organizationId], references: [id], onDelete: Restrict)
  name           String
  widthCm        Decimal      @map("width_cm") @db.Decimal(6, 1)
  lengthCm       Decimal      @map("length_cm") @db.Decimal(6, 1)
  entryUnit      String       @map("entry_unit")
  createdAt      DateTime     @default(now()) @map("created_at")
  createdBy      String?      @map("created_by") @db.Uuid
  creator        UserAccount? @relation("DryingTrayTypeCreatedBy", fields: [createdBy], references: [id])

  trays     Equipment[]          @relation("EquipmentTrayType")
  weighings DryingTrayWeighing[]

  @@unique([organizationId, name], map: "drying_tray_type_nombre_unico")
  @@map("drying_tray_type")
  @@schema("core")
}
```

- en `Equipment`:

  ```prisma
  /// Sólo en una bandeja de secado (kind vessel): su tipo y su número consecutivo
  /// en la finca, que se enseña como B-001. Los dos juntos o ninguno (CHECK).
  trayTypeId String?         @map("tray_type_id") @db.Uuid
  trayType   DryingTrayType? @relation("EquipmentTrayType", fields: [trayTypeId], references: [id], onDelete: Restrict)
  trayNumber Int?            @map("tray_number")
  ```

- en `Organization`: `dryingTrayTypes DryingTrayType[] @relation("DryingTrayTypeOwner")`;
- en `UserAccount`: `dryingTrayTypesCreated DryingTrayType[] @relation("DryingTrayTypeCreatedBy")`.

`DryingTrayWeighing` se declara en la Tarea 4. Hasta entonces, **se quita la línea `weighings` de este modelo** y la Tarea 4 la añade.

- [ ] **Paso 4: el servicio**

En `lib/equipos/equipos.ts`, debajo de `puedeGestionarEquipo`:

```ts
/** El mismo `puedeConfigurar` de `registrarEquipo`, sobre un lugar: registrar bandejas en un sitio lo pide. */
export async function puedeConfigurarEn(userAccountId: string, locationId: string): Promise<boolean> {
  const lugar = await prisma.location.findUnique({ where: { id: locationId }, select: { classification: true } });
  if (!lugar) return false;
  return puedeConfigurar(userAccountId, { scopeType: "location", scopeRefId: locationId }, lugar.classification);
}
```

`lib/equipos/bandejas.ts`:

```ts
/**
 * Tipos de bandeja y bandejas numeradas por finca (spec §4.2; Daniel, 2026-09-18).
 * La bandeja es un Equipment de kind vessel con `trayTypeId` y `trayNumber`; su
 * alta es un primer traslado al sitio, como en `registrarEquipo`.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { exigeEditarBeneficioEnOrganizacion, puedeEditarBeneficioEnOrganizacion } from "../traceability/locations";
import { puedeConfigurarEn, puedeVerEquipo } from "./equipos";

export class BandejaConfigError extends Error {}
export const PIE_EN_CM = 30.48;
/** Límite físico del formulario, no un umbral de dominio. El plan de secado suma 321 en dos fases. */
export const MAX_TANDA = 400;

export function numeroDeBandeja(n: number) {
  return `B-${String(n).padStart(3, "0")}`;
}
export function areaM2(tipo: { widthCm: number | Prisma.Decimal; lengthCm: number | Prisma.Decimal }) {
  return (Number(tipo.widthCm) * Number(tipo.lengthCm)) / 10_000;
}
const aCm = (v: number, unidad: "ft" | "cm") => Math.round((unidad === "ft" ? v * PIE_EN_CM : v) * 10) / 10;

export async function crearTipoDeBandeja(userAccountId: string, input: { organizationId: string; nombre: string; ancho: number; largo: number; unidad: "ft" | "cm" }) {
  await exigeEditarBeneficioEnOrganizacion(userAccountId, input.organizationId);
  const nombre = input.nombre.trim();
  const ok = (v: number) => Number.isFinite(v) && v > 0;
  if (!nombre || nombre.length > 60 || !ok(input.ancho) || !ok(input.largo) || !["ft", "cm"].includes(input.unidad)) {
    throw new BandejaConfigError("datos_invalidos");
  }
  if (await prisma.dryingTrayType.findFirst({ where: { organizationId: input.organizationId, name: nombre } })) {
    throw new BandejaConfigError("nombre_repetido");
  }
  return prisma.$transaction(async (tx) => {
    const tipo = await tx.dryingTrayType.create({ data: {
      organizationId: input.organizationId, name: nombre, entryUnit: input.unidad,
      widthCm: aCm(input.ancho, input.unidad), lengthCm: aCm(input.largo, input.unidad), createdBy: userAccountId,
    } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "drying_tray_type.create", entityType: "drying_tray_type",
      entityId: tipo.id, after: tipo, sourceInterface: "lib/equipos/bandejas.ts" }, tx);
    return { id: tipo.id };
  });
}

/**
 * Leer tipos y capacidades no es configurar: basta con `equipment:view` en ALGÚN
 * lugar de la organización. Un operario de campo tiene que poder ver cuánto cabe
 * en una bandeja antes de cargarla, aunque todavía no haya ninguna registrada.
 */
async function puedeVerEquiposEnOrganizacion(userAccountId: string, organizationId: string) {
  if (await puedeEditarBeneficioEnOrganizacion(userAccountId, organizationId)) return true;
  const lugares = await prisma.location.findMany({ where: { organizationId }, select: { id: true, classification: true } });
  for (const l of lugares) {
    if (await can(userAccountId, "view", "equipment", { scopeType: "location", scopeRefId: l.id }, l.classification)) return true;
  }
  return false;
}

export async function tiposDeBandeja(userAccountId: string, organizationId: string) {
  if (!(await puedeVerEquiposEnOrganizacion(userAccountId, organizationId))) return [];
  const filas = await prisma.dryingTrayType.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  return filas.map((t) => ({ id: t.id, nombre: t.name, widthCm: Number(t.widthCm), lengthCm: Number(t.lengthCm), entryUnit: t.entryUnit, areaM2: areaM2(t) }));
}

export async function registrarBandejas(userAccountId: string, input: { siteId: string; trayTypeId: string; cantidad: number }) {
  if (!Number.isInteger(input.cantidad) || input.cantidad < 1 || input.cantidad > MAX_TANDA) throw new BandejaConfigError("datos_invalidos");
  if (!(await puedeConfigurarEn(userAccountId, input.siteId))) throw new BandejaConfigError("sin_acceso");
  const sitio = await prisma.location.findUniqueOrThrow({ where: { id: input.siteId } });
  const tipo = await prisma.dryingTrayType.findUniqueOrThrow({ where: { id: input.trayTypeId } });
  if (!sitio.organizationId || tipo.organizationId !== sitio.organizationId) throw new BandejaConfigError("tipo_de_otra_organizacion");
  const org = sitio.organizationId;

  return prisma.$transaction(async (tx) => {
    // El número se decide con la organización bloqueada: dos tandas a la vez esperan
    // su turno en vez de leer el mismo máximo. El índice único es la red.
    await tx.$queryRaw`SELECT 1 FROM "core"."organization" WHERE "id" = ${org}::uuid FOR UPDATE`;
    const { _max } = await tx.equipment.aggregate({ where: { organizationId: org }, _max: { trayNumber: true } });
    const primero = (_max.trayNumber ?? 0) + 1;
    const numeros: string[] = [];
    const ahora = new Date();
    for (let i = 0; i < input.cantidad; i++) {
      const n = primero + i;
      const e = await tx.equipment.create({ data: {
        name: numeroDeBandeja(n), kind: "vessel", organizationId: org, trayTypeId: tipo.id, trayNumber: n,
        classification: sitio.classification, provenanceClass: "original_record", createdBy: userAccountId,
      } });
      await tx.equipmentTransfer.create({ data: { equipmentId: e.id, fromLocationId: null, toLocationId: sitio.id, occurredAt: ahora, createdBy: userAccountId } });
      await recordAuditEvent({ actorUserAccountId: userAccountId, entityType: "equipment", entityId: e.id, operation: "create",
        sourceInterface: "lib/equipos/bandejas.ts", after: { name: e.name, trayTypeId: tipo.id, trayNumber: n, locationId: sitio.id } }, tx);
      numeros.push(numeroDeBandeja(n));
    }
    return { numeros };
  }, { timeout: 60_000 });
}

async function bandejasVisibles(userAccountId: string, organizationId: string) {
  const filas = await prisma.equipment.findMany({
    where: { organizationId, trayNumber: { not: null } },
    orderBy: { trayNumber: "asc" },
    include: { trayType: true, transfers: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 1, include: { toLocation: true } } },
  });
  const visibles = [];
  for (const e of filas) if (await puedeVerEquipo(userAccountId, e)) visibles.push(e);
  return visibles;
}

export async function bandejasDeLaFinca(userAccountId: string, organizationId: string) {
  return (await bandejasVisibles(userAccountId, organizationId)).map((e) => ({
    id: e.id, numero: numeroDeBandeja(e.trayNumber!), tipo: e.trayType!.name,
    dondeId: e.transfers[0]?.toLocationId ?? null, donde: e.transfers[0]?.toLocation.name ?? null,
  }));
}
```

`puedeVerEquipo` es de `lib/equipos/equipos.ts`. **Si el 2b todavía no la añadió, se añade aquí**, con el mismo texto que lleva el 2b:

```ts
export async function puedeVerEquipo(userAccountId: string, equipo: { id: string; projectId: string | null; classification: ClassificationLevel }): Promise<boolean> {
  return can(userAccountId, "view", "equipment", await objetivoDeEquipo(equipo), equipo.classification);
}
```

**El 2b se ejecuta después y ya la encuentra:** no la duplica.

`03_public_api.md` §11 gana:

```markdown
| `DryingTrayType` | `core.drying_tray_type` | tipo de bandeja de la organización, en cm, con su unidad tecleada |
| `Equipment.trayTypeId`, `Equipment.trayNumber` | `core.equipment` | tipo y número consecutivo de una bandeja en su finca; se enseña «B-001» |
```

- [ ] **Paso 5: comprobar que pasan**

- `npx vitest run tests/equipos/bandejas.test.ts tests/equipos/equipos.test.ts` → verde. `equipos.test.ts` es el control de que registrar un equipo sigue igual.
- `npm run build` → 0.

- [ ] **Paso 6: commit.** Mensaje: `feat(secado): tipos de bandeja y bandejas numeradas por finca`.

---

### Tarea 4: el pesaje de bandeja cargada y la capacidad por estado

**Archivos:**
- Crear: `prisma/migrations/20260918191500_pesaje_de_bandeja/migration.sql`
- Crear: `lib/beneficio/capacidadSupuesta.ts`, `lib/traceability/capacidadDeBandeja.ts`
- Modificar: `prisma/schema.prisma`, `docs/beneficio/03_public_api.md`, `scripts/pruebas-por-compuerta.txt`
- Crear: `tests/traceability/capacidadDeBandeja.test.ts`

**Interfaces:**

```ts
// lib/beneficio/capacidadSupuesta.ts
export const CAPACIDAD_SUPUESTA: Partial<Record<"CHERRY" | "MUCILAGE_HONEY" | "PARCHMENT",
  { densidadKgM3: number; profundidadCm: number; fuente: string; estado: "PROVISIONAL" }>>;

// lib/traceability/capacidadDeBandeja.ts
export type EstadoDeCarga = "CHERRY" | "MUCILAGE_HONEY" | "PARCHMENT";
export class PesajeError extends Error {} // "datos_invalidos" | "estado_invalido" | "tipo_no_encontrado"
export async function registrarPesaje(userAccountId: string, input: {
  trayTypeId: string; lotId: string; materialState: EstadoDeCarga; netKg: number; profundidadesCm: number[];
  occurredAt: Date; operatorPersonId?: string | null; supersedesId?: string | null; correctionReason?: string | null;
}): Promise<{ id: string; densidadKgM3: number }>;
export interface CapacidadPorEstado {
  estado: EstadoDeCarga;
  fuente: "medido" | "estimado" | "sin_medir";
  pesajes: number;                 // los que entran en el cálculo (no superseded)
  densidadKgM3: number | null;
  profundidadCm: number | null;
  capacidadKg: number | null;
  fuenteDelEstimado: string | null;
}
export async function capacidadDeTipo(userAccountId: string, trayTypeId: string): Promise<{ areaM2: number; estados: CapacidadPorEstado[] }>;
```

- [ ] **Paso 1: las pruebas que fallan**

`tests/traceability/capacidadDeBandeja.test.ts`, con el montaje de `bandejas.test.ts`: una organización, un sitio, un gerente y un tipo 4×2 pies. Añade un **lote** de la organización en el sitio, creado con `createLot`, y el **operario** con permiso de gestionar lotes en el sitio.

```ts
describe("capacidad", () => {
  it("sin pesajes: cereza sale ESTIMADA con la fuente del plan de secado (≈ 8,3 kg en 4×2); mucílago y lavado, SIN MEDIR y sin número", async () => {
    const cap = await capacidadDeTipo(operario, tipo4x2);
    const por = (e: string) => cap.estados.find((x) => x.estado === e)!;
    // Control contra la fuente independiente: el plan de secado §6 dice 8,3 kg por
    // bandeja 4×2 a 2,8 cm y 400 kg/m³.
    expect(por("CHERRY")).toMatchObject({ fuente: "estimado", pesajes: 0, densidadKgM3: 400, profundidadCm: 2.8 });
    expect(por("CHERRY").capacidadKg!).toBeCloseTo(8.3, 1);
    expect(por("CHERRY").fuenteDelEstimado).toMatch(/Drying Plan 2026-27/);
    for (const e of ["MUCILAGE_HONEY", "PARCHMENT"]) {
      expect(por(e)).toMatchObject({ fuente: "sin_medir", pesajes: 0, densidadKgM3: null, capacidadKg: null });
    }
  });

  it("con pesajes: la densidad sale de ellos y reemplaza al estimado; sólo en su estado", async () => {
    // 0,7432 m² × 0,030 m = 0,022296 m³; 9,0 kg / 0,022296 = 403,66 kg/m³
    await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 9, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    const cap = await capacidadDeTipo(operario, tipo4x2);
    const cereza = cap.estados.find((x) => x.estado === "CHERRY")!;
    expect(cereza).toMatchObject({ fuente: "medido", pesajes: 1, fuenteDelEstimado: null });
    expect(cereza.densidadKgM3!).toBeCloseTo(403.7, 0);
    expect(cereza.capacidadKg!).toBeCloseTo(9, 1);        // a su propia profundidad medida
    expect(cap.estados.find((x) => x.estado === "PARCHMENT")!.fuente).toBe("sin_medir"); // no contagia a otro estado
  });

  it("una corrección supersede: el original deja de contar pero sigue existiendo", async () => {
    const malo = await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "PARCHMENT", netKg: 99, profundidadesCm: [3, 3, 3], occurredAt: new Date() });
    await registrarPesaje(operario, { trayTypeId: tipo4x2, lotId, materialState: "PARCHMENT", netKg: 6, profundidadesCm: [3, 3, 3], occurredAt: new Date(), supersedesId: malo.id, correctionReason: "Se tecleó 99 por 9,9" });
    const lavado = (await capacidadDeTipo(operario, tipo4x2)).estados.find((x) => x.estado === "PARCHMENT")!;
    expect(lavado.pesajes).toBe(1);
    expect(lavado.capacidadKg!).toBeCloseTo(6, 1);
    expect((await prisma.dryingTrayWeighing.findUniqueOrThrow({ where: { id: malo.id } })).supersededAt).not.toBeNull();
  });

  it("rechaza datos inválidos, cada rechazo al lado de uno que entra", async () => {
    const base = { trayTypeId: tipo4x2, lotId, materialState: "CHERRY" as const, netKg: 8, profundidadesCm: [2.8, 2.8, 2.8], occurredAt: new Date() };
    for (const mal of [{ netKg: 0 }, { netKg: -1 }, { profundidadesCm: [3, 3] }, { profundidadesCm: [3, 3, 3, 3, 3] }, { profundidadesCm: [3, 0, 3] }, { materialState: "GREEN" as never }]) {
      await expect(registrarPesaje(operario, { ...base, ...mal })).rejects.toThrow(/datos_invalidos|estado_invalido/);
    }
    await expect(registrarPesaje(operario, { ...base, supersedesId: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow("datos_invalidos"); // corrección sin razón
    expect((await registrarPesaje(operario, base)).id).toBeTruthy(); // control
  });

  it("quien no gestiona el lote no pesa", async () => {
    await expect(registrarPesaje(ajeno, { trayTypeId: tipo4x2, lotId, materialState: "CHERRY", netKg: 8, profundidadesCm: [3, 3, 3], occurredAt: new Date() }))
      .rejects.toThrow();
  });
});

describe("reglas del pesaje en la base", () => {
  it("rechaza estado fuera del secado, 2 o 5 profundidades, profundidad 0, y editar el peso; acepta marcarlo superseded", async () => {
    const d = { trayTypeId: tipo4x2, lotId, netKg: 8, occurredAt: new Date(), provenanceClass: "measured_fact" as const };
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "GREEN", depthPointsCm: [3, 3, 3] } })).rejects.toThrow(/drying_tray_weighing_estado_de_secado/);
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "CHERRY", depthPointsCm: [3, 3] } })).rejects.toThrow(/drying_tray_weighing_tres_o_cuatro_puntos/);
    await expect(prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "CHERRY", depthPointsCm: [3, 0, 3] } })).rejects.toThrow(/drying_tray_weighing_profundidad_positiva/);
    const ok = await prisma.dryingTrayWeighing.create({ data: { ...d, materialState: "CHERRY", depthPointsCm: [3, 3, 3] } }); // control
    await expect(prisma.dryingTrayWeighing.update({ where: { id: ok.id }, data: { netKg: 9 } })).rejects.toThrow(/pesaje no se edita/);
    expect((await prisma.dryingTrayWeighing.update({ where: { id: ok.id }, data: { supersededAt: new Date() } })).supersededAt).toBeTruthy();
  });
});
```

Añadir el archivo a `base-sembrada`.

- [ ] **Paso 2: comprobar que fallan.**

- [ ] **Paso 3: la migración**

```sql
-- Paso 2a (spec §4.2b): el pesaje de una bandeja cargada, protocolo de §7 del
-- plan de secado de Las Nubes Cerro Azul 2026-27. Es measured_fact: no se edita;
-- una corrección es un registro nuevo que supersede (00_conventions §4).
CREATE TABLE "traceability"."drying_tray_weighing" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tray_type_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "material_state" "core"."MaterialState" NOT NULL,
  "net_kg" DECIMAL(10,3) NOT NULL,
  "depth_points_cm" DECIMAL(5,1)[] NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "operator_person_id" UUID,
  "provenance_class" "core"."ProvenanceClass" NOT NULL,
  "supersedes_id" UUID,
  "superseded_at" TIMESTAMP(3),
  "correction_reason" TEXT,
  "created_by" UUID,
  CONSTRAINT "drying_tray_weighing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drying_tray_weighing_estado_de_secado" CHECK ("material_state" IN ('CHERRY', 'MUCILAGE_HONEY', 'PARCHMENT')),
  CONSTRAINT "drying_tray_weighing_peso_positivo" CHECK ("net_kg" > 0),
  CONSTRAINT "drying_tray_weighing_tres_o_cuatro_puntos" CHECK (cardinality("depth_points_cm") BETWEEN 3 AND 4),
  CONSTRAINT "drying_tray_weighing_profundidad_positiva" CHECK (0 < ALL("depth_points_cm")),
  CONSTRAINT "drying_tray_weighing_correccion_con_razon" CHECK ("supersedes_id" IS NULL OR char_length(trim("correction_reason")) > 0)
);
ALTER TABLE "traceability"."drying_tray_weighing"
  ADD CONSTRAINT "drying_tray_weighing_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "core"."drying_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_tray_weighing_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "traceability"."lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_tray_weighing_operator_person_id_fkey" FOREIGN KEY ("operator_person_id") REFERENCES "core"."person"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_tray_weighing_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "traceability"."drying_tray_weighing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_tray_weighing_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "drying_tray_weighing_tray_type_id_idx" ON "traceability"."drying_tray_weighing"("tray_type_id");

-- Inmutable salvo marcarlo superseded UNA vez (00_conventions §4).
CREATE OR REPLACE FUNCTION "traceability"."pesaje_inmutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."superseded_at" IS NULL AND NEW."superseded_at" IS NOT NULL
     AND (to_jsonb(NEW) - 'superseded_at') = (to_jsonb(OLD) - 'superseded_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Un pesaje no se edita: se corrige con un registro nuevo que lo supersede';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "drying_tray_weighing_inmutable"
  BEFORE UPDATE ON "traceability"."drying_tray_weighing"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."pesaje_inmutable"();
```

Las tablas `traceability.lot` y `core.person` están comprobadas en `prisma/schema.prisma` al escribir este plan: `@@map("lot")` va con `@@schema("traceability")`, y `@@map("person")` con `@@schema("core")`.

En el esquema:

```prisma
/// El pesaje de una bandeja cargada (spec §4.2b; protocolo §7 del plan de secado
/// 2026-27): de aquí sale cuánto café cabe por tipo de bandeja y estado. Es
/// measured_fact y no se edita: una corrección es un registro nuevo que supersede.
model DryingTrayWeighing {
  id               String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  trayTypeId       String          @map("tray_type_id") @db.Uuid
  trayType         DryingTrayType  @relation(fields: [trayTypeId], references: [id], onDelete: Restrict)
  lotId            String          @map("lot_id") @db.Uuid
  lot              Lot             @relation("DryingTrayWeighingLot", fields: [lotId], references: [id], onDelete: Restrict)
  materialState    MaterialState   @map("material_state")
  netKg            Decimal         @map("net_kg") @db.Decimal(10, 3)
  depthPointsCm    Decimal[]       @map("depth_points_cm") @db.Decimal(5, 1)
  occurredAt       DateTime        @map("occurred_at")
  recordedAt       DateTime        @default(now()) @map("recorded_at")
  operatorPersonId String?         @map("operator_person_id") @db.Uuid
  operator         Person?         @relation("DryingTrayWeighingOperator", fields: [operatorPersonId], references: [id])
  provenanceClass  ProvenanceClass @map("provenance_class")
  supersedesId     String?         @map("supersedes_id") @db.Uuid
  supersedes       DryingTrayWeighing?  @relation("DryingTrayWeighingSupersedes", fields: [supersedesId], references: [id], onDelete: Restrict)
  supersededBy     DryingTrayWeighing[] @relation("DryingTrayWeighingSupersedes")
  supersededAt     DateTime?       @map("superseded_at")
  correctionReason String?         @map("correction_reason")
  createdBy        String?         @map("created_by") @db.Uuid
  creator          UserAccount?    @relation("DryingTrayWeighingCreatedBy", fields: [createdBy], references: [id])

  @@index([trayTypeId])
  @@map("drying_tray_weighing")
  @@schema("traceability")
}
```

Las inversas son:
- `weighings DryingTrayWeighing[]` en `DryingTrayType`, que la Tarea 3 dejó fuera;
- `dryingTrayWeighings DryingTrayWeighing[] @relation("DryingTrayWeighingLot")` en `Lot`;
- `dryingTrayWeighingsOperated DryingTrayWeighing[] @relation("DryingTrayWeighingOperator")` en `Person`;
- `dryingTrayWeighingsCreated DryingTrayWeighing[] @relation("DryingTrayWeighingCreatedBy")` en `UserAccount`.

- [ ] **Paso 4: el estimado y el servicio**

`lib/beneficio/capacidadSupuesta.ts`:

```ts
/**
 * El estimado de capacidad cuando todavía no hay pesajes (spec §4.2b).
 * `[PROVISIONAL]` (00_reglas_del_modulo §5): configuración, no una constante de
 * dominio; se reemplaza en cuanto hay un pesaje de ese estado.
 *
 * SÓLO para cereza, porque es lo único para lo que la fuente da densidad. Para
 * mucílago y lavado no hay estimado y NO se inventa uno (21_rubrica_veracidad §2.1).
 */
export const CAPACIDAD_SUPUESTA = {
  CHERRY: {
    densidadKgM3: 400,
    profundidadCm: 2.8,
    fuente: "Las Nubes Cerro Azul — Drying Plan 2026-27, §6 (densidad provisional hasta el pesaje de §7)",
    estado: "PROVISIONAL",
  },
} as const satisfies Partial<Record<"CHERRY" | "MUCILAGE_HONEY" | "PARCHMENT", { densidadKgM3: number; profundidadCm: number; fuente: string; estado: "PROVISIONAL" }>>;
```

`lib/traceability/capacidadDeBandeja.ts`:

```ts
/**
 * Pesaje de bandeja cargada y capacidad por estado (spec §4.2b). La capacidad es
 * DERIVADA y no se guarda: área × profundidad media × densidad media de los
 * pesajes vigentes de ese estado. Sin pesajes, el estimado SUPUESTO —sólo cereza—
 * o «sin medir». Nunca se rellena un hueco (21_rubrica_veracidad §2).
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess } from "./lots";
import { areaM2, tiposDeBandeja } from "../equipos/bandejas";
import { CAPACIDAD_SUPUESTA } from "../beneficio/capacidadSupuesta";

export type EstadoDeCarga = "CHERRY" | "MUCILAGE_HONEY" | "PARCHMENT";
const ESTADOS: EstadoDeCarga[] = ["CHERRY", "MUCILAGE_HONEY", "PARCHMENT"];
export class PesajeError extends Error {}

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export async function registrarPesaje(userAccountId: string, input: {
  trayTypeId: string; lotId: string; materialState: EstadoDeCarga; netKg: number; profundidadesCm: number[];
  occurredAt: Date; operatorPersonId?: string | null; supersedesId?: string | null; correctionReason?: string | null;
}) {
  if (!ESTADOS.includes(input.materialState)) throw new PesajeError("estado_invalido");
  const n = input.profundidadesCm.length;
  if (!(Number.isFinite(input.netKg) && input.netKg > 0) || n < 3 || n > 4 || !input.profundidadesCm.every((p) => Number.isFinite(p) && p > 0)) {
    throw new PesajeError("datos_invalidos");
  }
  if (input.supersedesId && !input.correctionReason?.trim()) throw new PesajeError("datos_invalidos");
  const lot = await prisma.lot.findUniqueOrThrow({ where: { id: input.lotId } });
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);
  const tipo = await prisma.dryingTrayType.findUnique({ where: { id: input.trayTypeId } });
  if (!tipo || tipo.organizationId !== lot.organizationId) throw new PesajeError("tipo_no_encontrado");

  const densidadKgM3 = input.netKg / (areaM2(tipo) * (media(input.profundidadesCm) / 100));
  return prisma.$transaction(async (tx) => {
    if (input.supersedesId) {
      const { count } = await tx.dryingTrayWeighing.updateMany({ where: { id: input.supersedesId, supersededAt: null, trayTypeId: tipo.id }, data: { supersededAt: new Date() } });
      if (count !== 1) throw new PesajeError("datos_invalidos");
    }
    const p = await tx.dryingTrayWeighing.create({ data: {
      trayTypeId: tipo.id, lotId: lot.id, materialState: input.materialState, netKg: input.netKg,
      depthPointsCm: input.profundidadesCm, occurredAt: input.occurredAt, operatorPersonId: input.operatorPersonId ?? null,
      provenanceClass: "measured_fact", supersedesId: input.supersedesId ?? null,
      correctionReason: input.correctionReason?.trim() || null, createdBy: userAccountId,
    } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: input.supersedesId ? "drying_tray_weighing.correct" : "drying_tray_weighing.create",
      entityType: "drying_tray_weighing", entityId: p.id, after: p, sourceInterface: "traceability.service" }, tx);
    return { id: p.id, densidadKgM3 };
  });
}

export async function capacidadDeTipo(userAccountId: string, trayTypeId: string) {
  const tipo = await prisma.dryingTrayType.findUniqueOrThrow({ where: { id: trayTypeId } });
  // Mismo permiso de lectura que la lista de tipos: quien no ve ninguno, no ve éste.
  if (!(await tiposDeBandeja(userAccountId, tipo.organizationId)).some((t) => t.id === tipo.id)) throw new PesajeError("tipo_no_encontrado");
  const area = areaM2(tipo);
  const pesajes = await prisma.dryingTrayWeighing.findMany({ where: { trayTypeId, supersededAt: null } });
  const estados = ESTADOS.map((estado) => {
    const suyos = pesajes.filter((p) => p.materialState === estado);
    if (suyos.length > 0) {
      const profundidades = suyos.map((p) => media(p.depthPointsCm.map(Number)));
      const densidades = suyos.map((p, i) => Number(p.netKg) / (area * (profundidades[i]! / 100)));
      const profundidadCm = media(profundidades);
      const densidadKgM3 = media(densidades);
      return { estado, fuente: "medido" as const, pesajes: suyos.length, densidadKgM3, profundidadCm,
        capacidadKg: area * (profundidadCm / 100) * densidadKgM3, fuenteDelEstimado: null };
    }
    const sup = (CAPACIDAD_SUPUESTA as Partial<Record<EstadoDeCarga, { densidadKgM3: number; profundidadCm: number; fuente: string }>>)[estado];
    if (sup) {
      return { estado, fuente: "estimado" as const, pesajes: 0, densidadKgM3: sup.densidadKgM3, profundidadCm: sup.profundidadCm,
        capacidadKg: area * (sup.profundidadCm / 100) * sup.densidadKgM3, fuenteDelEstimado: sup.fuente };
    }
    return { estado, fuente: "sin_medir" as const, pesajes: 0, densidadKgM3: null, profundidadCm: null, capacidadKg: null, fuenteDelEstimado: null };
  });
  return { areaM2: area, estados };
}
```

**La media de densidades no se pondera** por el peso de cada pesaje. Es la regla del protocolo de §7: «repetir 2–3 veces en lotes distintos; un promedio gana a una lectura». Si Daniel quiere ponderar, es una decisión suya y va en otro cambio.

`03_public_api.md` §11 gana una fila:

`| DryingTrayWeighing | traceability.drying_tray_weighing | pesaje de una bandeja cargada: estado, kg netos y 3–4 profundidades; inmutable, se corrige superseding |`

- [ ] **Paso 5: comprobar que pasan**

`npx vitest run tests/traceability/capacidadDeBandeja.test.ts` → verde. `npm run build` → 0.

- [ ] **Paso 6: commit.** Mensaje: `feat(secado): el pesaje de bandeja cargada y la capacidad por estado del café`.

---

### Tarea 5: la pantalla «Bandejas» del beneficio

**Archivos:**
- Crear: `app/beneficio/bandejas/page.tsx`, `app/beneficio/bandejas/Formularios.tsx`, `app/actions/bandejas.ts`
- Modificar: `app/beneficio/destinos.ts`, `messages/es.json`, `messages/en.json`, `tests/beneficio/destinos-del-indice.test.ts`

**Qué enseña `/beneficio/bandejas`, de arriba abajo, para cada organización donde quien mira ve algún tipo o alguna bandeja:**
1. **Tipos de bandeja**, cada uno con su medida en la unidad tecleada, su área en m² y su **capacidad por estado**:
   - `medido`: «8,9 kg · medido con 2 pesajes»;
   - `estimado`: «≈ 8,3 kg · estimado, sin medir», con la fuente al lado;
   - `sin_medir`: «sin medir».

   Si quien mira tiene `edit_beneficio` en la organización, además el formulario «Nuevo tipo»: nombre, ancho, largo, unidad pies o cm, con pies por defecto.
2. **Registrar bandejas**, si quien mira puede configurar en algún sitio (`puedeConfigurarEn`): sitio, tipo y cantidad, con `MAX_TANDA` como tope. Al guardar dice «Registradas B-025 … B-064».
3. **Registrar pesaje**, si quien mira gestiona algún lote:
   - tipo, estado (cereza entera / en mucílago / lavado), lote, kg netos, y 3 a 4 profundidades en cm, con el cuarto opcional;
   - **antes del formulario, una frase del protocolo:** «Carga a dos capas, nivela sin apretar, pesa y resta la bandeja vacía, y mide la profundidad en 3 o 4 puntos». Es el momento «antes de medir» de `22_rubrica_pedagogica` §2, el de mayor retorno.
4. **Las bandejas**: una tabla con número, tipo y dónde está (el nombre del último traslado).

**La acción de servidor** (`app/actions/bandejas.ts`, `"use server"`, sólo funciones `async`):
- `crearTipoAction`, `registrarBandejasAction` y `registrarPesajeAction`;
- cada una devuelve `{ error?: string; ok?: string }`;
- traducen `BandejaConfigError`, `PesajeError`, `LocationAccessError` y `TraceabilityAccessError` a su código;
- el resto lo relanzan.

La hora del pesaje es `new Date()` más el `TimezoneOffsetField` de siempre, por si se registra después (`lib/time/localDateTime.ts`).

**`destinos.ts`** gana, detrás de «equipos»: `{ href: "/beneficio/bandejas", clave: "bandejas", visible: granted.has("equipment:view") }`. **`tests/beneficio/destinos-del-indice.test.ts`** gana el caso de un perfil con `equipment:view` que la ve y uno sin él que no.

**Mensajes, espacio nuevo `Bandejas`.** Cada código de error tiene su clave `error_<código>`:
- de `BandejaConfigError`: `datos_invalidos`, `sin_acceso`, `tipo_de_otra_organizacion`, `nombre_repetido`;
- de `PesajeError`: `estado_invalido`, `tipo_no_encontrado`.

Al terminar, contar las claves `error_` de `Bandejas` en los dos idiomas: **6 y 6**. La primera redacción de los textos la escribe el implementador. **La revisión comprueba cuatro cosas:**
- que las tres fuentes de capacidad dicen su clase en la misma línea que el número;
- que «estimado» nunca aparece sin «sin medir»;
- que el texto sigue el vocabulario de la finca, «cereza entera, en mucílago, lavado», con el término técnico al lado (`22_rubrica_pedagogica` §3.6);
- que ningún texto afirma una capacidad para mucílago o lavado sin pesaje.

- [ ] **Pasos:**
  1. Escribir las acciones y su prueba de «use server sólo async» (`tests/arquitectura/use-server-solo-async.test.ts` ya existe: debe seguir en verde).
  2. Escribir la página y el componente.
  3. Añadir el destino y su prueba.
  4. Escribir los mensajes y contar las claves `error_`.
  5. `npm run build` y `npm run verify` → 0.
  6. **En el navegador**, con un servidor local contra la base de prueba, crear el tipo 4×2 y comprobar tres cosas:
     - que su capacidad de cereza dice ≈ 8,3 kg **estimado, sin medir**, y que mucílago y lavado dicen **sin medir**;
     - que registrar 3 bandejas da tres números seguidos;
     - que, tras un pesaje de cereza, la capacidad pasa a **medido con 1 pesaje**.

     Se lee con `read_page`, no mirando el código.
  7. Commit con el stat contado. Mensaje: `feat(secado): la pantalla de bandejas — tipos, registro numerado, pesaje y capacidad`.

---

### Tarea 6: ADR, inventario, compuerta completa y flip-tests

- [ ] **Paso 1: el ADR.** El siguiente número libre, **medido** con `grep -n '^## ADR-' docs/architecture/DECISIONS.md | tail -3`. Contenido:
  - el árbol instalación → estante → posición;
  - `rackRow` retirado, y por qué;
  - tipos en cm con su unidad tecleada;
  - el número por organización y el bloqueo que lo decide;
  - la capacidad derivada, con sus tres fuentes y la regla de no inventar mucílago ni lavado;
  - el pesaje inmutable;
  - la inspección que no ofrece posiciones hasta el paso 3.
- [ ] **Paso 2: el inventario.** `node scripts/inventario-de-acceso.mjs`, y copiar sus cifras al documento. Cada operación nueva de `estantes.ts`, `bandejas.ts` y `capacidadDeBandeja.ts` tiene que salir con guardia directo. **Una que salga en otra fila se mira a mano** y se explica en el allowlist.
- [ ] **Paso 3: la spec.** En §7, los nombres de la tercera ronda pasan a aprobados.
- [ ] **Paso 4: compuerta completa**, sin tuberías:

```bash
npx tsc --noEmit; echo "tsc=$?"
npm run verify > /tmp/v.txt 2>&1; echo "verify=$?"
npm run build > /tmp/b.txt 2>&1; echo "build=$?"
npm test > /tmp/t.txt 2>&1; echo "test=$?"
bash scripts/ci.sh > /tmp/c.txt 2>&1; echo "ci=$?"
```

Si falla una prueba fuera de estos archivos, se compara con `main` antes de atribuirla: la base es compartida. Las cuatro pruebas nuevas **no** deben aparecer en la salida de `ci.sh`.

- [ ] **Paso 5: flip-tests contra el commit.** Cada uno imprime el sha antes y después, si compila y **qué prueba cae por su nombre**, y se restaura con `git checkout --`. Las reglas de la base se mutan en una **base desechable** del mismo clúster:
  - se crea con `CREATE DATABASE nn_flip_2a`, que no toca los datos de la compartida;
  - se migra con `migrate deploy`;
  - se aplica el SQL mutado y se corre la prueba;
  - se revierte, y la prueba vuelve a verde;
  - se hace `DROP DATABASE nn_flip_2a` y se comprueba que ya no está.

  1. Quitar `location_posicion_unica` → cae «un estante sólo cuelga… no se repite».
  2. Quitar del disparador el bloque «estante debe colgar de una instalacion» → cae la misma, en su primera línea.
  3. En `crearPosiciones`, quitar el filtro `hay.has(...)` → cae «ampliar crea sólo lo que falta».
  4. Quitar `equipment_numero_de_bandeja_unico` **y** el `FOR UPDATE` de `registrarBandejas` → cae «dos tandas a la vez no repiten número». Si pasa por suerte, se repite con `cantidad: 50`; si sigue pasando, **se anota que el flip no probó la carrera** y no se cuenta.
  5. En `capacidadDeTipo`, dar a mucílago el estimado de cereza → cae «sin pesajes… mucílago y lavado, SIN MEDIR».
  6. En `capacidadDeTipo`, dejar de filtrar `supersededAt: null` → cae «una corrección supersede».
  7. Quitar el disparador `drying_tray_weighing_inmutable` → cae «rechaza… editar el peso».
  8. En `opcionesParaInspeccion`, quitar el filtro de estante → cae «opcionesParaInspeccion lista las camas sueltas…».

- [ ] **Paso 6: PR.**
  - Contar los archivos con `git diff --name-only origin/main...HEAD`, con **tres** puntos. Deben salir los de este plan.
  - **La fusión es decisión de Daniel.**
