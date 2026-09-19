# De la recepción a los lotes — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que lo recibido en el beneficio se convierta en lotes trazables —cada proceso, un lote—,
que la selección diga si la cereza cumplió lo que se pidió, y que las dos vías viejas de crear
lotes se retiren.

**Architecture:**
- Tres tablas nuevas en `traceability`: `LoteDesdeRecepcion` (el vínculo con sus kilos),
  `MermaDeRecepcion` y `VeredictoDeCalidadDePedido`. `LotTransformation` gana la condición de
  pesaje.
- Un módulo puro para el veredicto, uno de servicio para armar lotes y su genealogía, y dos
  funciones más en el de recepciones (merma y disponible).
- **La selección existente no se reescribe:** gana un campo opcional y un gancho para escribir el
  veredicto en su misma transacción.

**Tech Stack:** Next.js 16 (server actions), Prisma 7 (`generated/prisma/client`), Postgres,
vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-de-la-recepcion-a-los-lotes-design.md`
(aprobado por Daniel el 2026-09-19).

## Global Constraints

- **Trazabilidad:** desde cualquier lote se vuelve a sus recepciones. Los kilos viven **sólo** en
  el nivel 1 (`LoteDesdeRecepcion`); un descendiente sube por el grafo de `LotTransformation`.
- **Disponible de una recepción** = `netoKg` − mermas vigentes − lo tomado por lotes. Nunca
  negativo.
- **El vínculo es inmutable:** no se edita ni se borra (disparadores de `UPDATE` y `DELETE`).
- **El disparador que vigila los kilos bloquea él mismo la fila de la recepción**
  (`PERFORM … FOR UPDATE`) antes de sumar. Una suma sin bloqueo no es una garantía.
- **Sólo cereza `recibida`** entra en un lote; anular una recepción con cereza tomada se rechaza
  (`ya_tiene_lotes`), en el servicio y en la base.
- **El lote nace sin proceso.** Primero se selecciona; `abrirProceso` se llama sobre el lote
  **aceptado**.
- **El veredicto es una fila por lote, recalculada** con cada selección, y sólo para lotes de
  nivel 1. Se escribe en la **misma transacción** que la selección.
- **Comparaciones sobre masas en gramos enteros**, sin redondear el cociente:
  `aceptadoG × 10 000 ≥ insumoG × minMaduroBp`. Los porcentajes mostrados se redondean a dos
  decimales; eso es presentación, no juicio.
- **Sin `cumple`** cuando: el lote no es atribuible a un pedido, el balance de alguna selección no
  cuadró, o las condiciones de pesaje no son comparables.
- **Condición de pesaje:** obligatoria sólo si el método de selección es `flotacion`; nula en los
  demás. Lo ya guardado es «sin declarar», nunca una suposición.
- **Permisos:** armar lote, merma y selección exigen `lot:manage` sobre el beneficio (o el lote,
  donde el servicio ya lo exige). La regla de dos personas **no** se extiende aquí.
- Toda escritura, con su `AuditEvent` en la misma transacción.
- Pruebas con base declaradas en `scripts/pruebas-por-compuerta.txt` (grupo `base-sembrada`).
- **Compuerta por tarea:** tipos, lint, estado, hermético, con base en base propia, build.
  **Commit antes de mutar**, y flip-test que compile y tumbe su prueba **por nombre**.
- Migración a mano, FKs `<tabla>_<columna>_fkey`, marca de tiempo **posterior a la última de
  `origin/main` en el momento de commitear**, y se vuelve a comprobar al rebasar.

---

### Task 1: el esquema — vínculo, merma, veredicto y condición de pesaje

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_de_la_recepcion_a_los_lotes/migration.sql`
- Test: `tests/traceability/loteDesdeRecepcion-esquema.test.ts` (base)

**Produce:**

```prisma
enum CondicionDePesaje { DRAINED WET DRY                                    @@schema("traceability") }
enum EstadoDeMerma     { vigente anulada                                    @@schema("traceability") }
enum JuicioDeCalidad   { CUMPLE NO_CUMPLE NO_ATRIBUIBLE BALANCE_DESCUADRADO INCOMPARABLE_WEIGHING_CONDITION CONDICION_SIN_DECLARAR @@schema("traceability") }

model LoteDesdeRecepcion {
  id          String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  lotId       String            @map("lot_id") @db.Uuid
  lot         Lot               @relation(fields: [lotId], references: [id], onDelete: Restrict)
  recepcionId String            @map("recepcion_id") @db.Uuid
  recepcion   RecepcionDeCereza @relation(fields: [recepcionId], references: [id], onDelete: Restrict)
  kg          Decimal           @db.Decimal(10, 3)
  createdAt   DateTime          @default(now()) @map("created_at")
  createdBy   String?           @map("created_by") @db.Uuid
  @@unique([lotId, recepcionId])
  @@index([recepcionId])
  @@map("lote_desde_recepcion") @@schema("traceability")
}

model MermaDeRecepcion {
  id              String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recepcionId     String            @map("recepcion_id") @db.Uuid
  recepcion       RecepcionDeCereza @relation(fields: [recepcionId], references: [id], onDelete: Restrict)
  kg              Decimal           @db.Decimal(10, 3)
  motivo          String
  estado          EstadoDeMerma     @default(vigente)
  anotadaPor      String            @map("anotada_por") @db.Uuid
  anotadaAt       DateTime          @map("anotada_at")
  anuladaAt       DateTime?         @map("anulada_at")
  anuladaPor      String?           @map("anulada_por") @db.Uuid
  motivoAnulacion String?           @map("motivo_anulacion")
  createdAt       DateTime          @default(now()) @map("created_at")
  @@index([recepcionId])
  @@map("merma_de_recepcion") @@schema("traceability")
}

model VeredictoDeCalidadDePedido {
  id           String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  lotId        String          @unique @map("lot_id") @db.Uuid
  lot          Lot             @relation(fields: [lotId], references: [id], onDelete: Restrict)
  pedidoId     String?         @map("pedido_id") @db.Uuid
  pedido       PedidoDeCereza? @relation(fields: [pedidoId], references: [id], onDelete: Restrict)
  selecciones  Int
  insumoKg     Decimal         @map("insumo_kg") @db.Decimal(10, 3)
  aceptadoKg   Decimal         @map("aceptado_kg") @db.Decimal(10, 3)
  verdeKg      Decimal         @map("verde_kg") @db.Decimal(10, 3)
  flotesKg     Decimal         @map("flotes_kg") @db.Decimal(10, 3)
  juicio       JuicioDeCalidad
  motivo       String?
  actualizadoAt DateTime       @map("actualizado_at")
  @@index([pedidoId])
  @@map("veredicto_de_calidad_de_pedido") @@schema("traceability")
}
```

Más: `LotTransformation.condicionDePesaje CondicionDePesaje?` (`@map("condicion_de_pesaje")`), y
las relaciones inversas en `Lot`, `RecepcionDeCereza` y `PedidoDeCereza`.

**CHECKs:** `lote_desde_recepcion_kg_positivo` (`kg > 0`); `merma_de_recepcion_kg_positivo`
(`kg > 0`); `merma_de_recepcion_motivo` (`length(btrim(motivo)) > 0`);
`merma_de_recepcion_anulacion_completa` (`(estado = 'anulada') = (anulada_at IS NOT NULL AND
anulada_por IS NOT NULL AND length(btrim(coalesce(motivo_anulacion,''))) > 0)`);
`veredicto_cifras` (las cuatro masas `>= 0` e `insumo_kg > 0`);
`veredicto_motivo_si_no_cumple` (`juicio = 'CUMPLE' OR juicio = 'NO_CUMPLE' OR
length(btrim(coalesce(motivo,''))) > 0`).

**Disparadores:**
1. `lote_desde_recepcion_cabe` — `BEFORE INSERT`: `PERFORM 1 FROM recepcion_de_cereza WHERE id =
   NEW.recepcion_id FOR UPDATE;` (bloquea **antes** de sumar); la recepción tiene que estar
   `recibida` (`recepcion_no_recibida`); y `NEW.kg + suma(vínculos) ≤ neto − suma(mermas
   vigentes)`, si no `kg_sobre_lo_recibido`.
2. `lote_desde_recepcion_inmutable` — `BEFORE UPDATE OR DELETE`: siempre `RAISE EXCEPTION`. El
   origen de un lote no se reescribe.
3. `merma_de_recepcion_cabe` — `BEFORE INSERT`: el mismo bloqueo, y la merma no puede dejar el
   disponible negativo (`merma_sobre_lo_disponible`).
4. `recepcion_de_cereza_con_lotes_no_se_anula` — `BEFORE UPDATE` en `recepcion_de_cereza`: pasar a
   `anulada` con algún `lote_desde_recepcion` → `ya_tiene_lotes`.

- [ ] **Paso 1 — pruebas en rojo** (sondas con Prisma, cada rechazo con su control positivo).
  Fixture: finca, beneficio, entrega, **recepción de 100 kg** (creada como en
  `tests/traceability/recepcionDeCereza-esquema.test.ts`), y un `Lot` de prueba.
  - 60 + 60 kg de la misma recepción: el segundo vínculo se rechaza; 60 + 40 entra;
  - una recepción `rechazada` no admite vínculo; la `recibida` sí;
  - editar `kg` de un vínculo se rechaza; borrarlo, también;
  - la misma recepción dos veces en el mismo lote se rechaza (índice único);
  - merma de 3 kg entra; una de 200 se rechaza; con 3 de merma, tomar 98 se rechaza y 97 entra;
  - anular la recepción con un vínculo vivo se rechaza; sin vínculos, se anula.
- [ ] **Paso 2** — migración a mano; `migrate deploy` en la base propia; `prisma generate`.
- [ ] **Paso 3** — verde, compuerta, commit. Flip: quitar el `FOR UPDATE` **y** la suma del
  disparador 1 → cae «60 + 60 se rechaza».

### Task 2: el veredicto, como módulo puro

**Files:**
- Create: `lib/beneficio/veredictoDeCalidad.ts`
- Test: `tests/beneficio/veredictoDeCalidad.test.ts` (hermética)

**Produce:**

```ts
export type JuicioDeCalidad = "CUMPLE" | "NO_CUMPLE" | "NO_ATRIBUIBLE" | "BALANCE_DESCUADRADO" | "INCOMPARABLE_WEIGHING_CONDITION" | "CONDICION_SIN_DECLARAR";
export interface MasasDeSelecciones { insumoKg: number; aceptadoKg: number; verdeKg: number; flotesKg: number; selecciones: number }
export interface LimitesDelPedido { minMaduroPct?: number | null; maxVerdePct?: number | null; maxFlotesPct?: number | null }
export interface EntradaDelVeredicto {
  readonly masas: MasasDeSelecciones;
  readonly limites: LimitesDelPedido | null;      // null = no atribuible
  readonly condiciones: ReadonlyArray<"DRAINED" | "WET" | "DRY" | null>;  // una por selección
  readonly huboFlotacion: boolean;
  readonly balanceDescuadrado: boolean;
}
export interface Veredicto { juicio: JuicioDeCalidad; motivo: string | null; maduroPct: number; verdePct: number; flotesPct: number }
export function evaluarCalidad(entrada: EntradaDelVeredicto): Veredicto;
```

Orden de las razones, de arriba abajo (la primera que aplica manda):
1. `balanceDescuadrado` → `BALANCE_DESCUADRADO`;
2. condiciones distintas entre sí (ignorando nulos) → `INCOMPARABLE_WEIGHING_CONDITION`;
3. `huboFlotacion` y alguna condición nula → `CONDICION_SIN_DECLARAR`;
4. `limites === null` → `NO_ATRIBUIBLE`;
5. los tres límites, en gramos enteros: `round(aceptadoKg*1000) * 10000 >= round(insumoKg*1000) *
   round(minMaduroPct*100)` y las dos de máximo con `<=`; un límite nulo no se juzga →
   `CUMPLE` o `NO_CUMPLE` (con el motivo diciendo cuál falló y por cuánto).
Los tres `Pct` se devuelven redondeados a dos decimales, siempre.

- [ ] **Paso 1 — pruebas en rojo:**
  - 80 aceptado, 10 verde, 10 flotes sobre 100, límites ≥ 75 / ≤ 12 / ≤ 12 → `CUMPLE`;
  - con 20 de verde → `NO_CUMPLE`, y el motivo nombra el verde;
  - **el borde:** 74,996 aceptado de 100 con mínimo 75 % → `NO_CUMPLE` (redondear el cociente lo
    daría por bueno);
  - `limites: null` → `NO_ATRIBUIBLE`;
  - `["WET","DRAINED"]` → `INCOMPARABLE_WEIGHING_CONDITION`; `["WET","WET"]` juzga;
  - `huboFlotacion` con `[null]` → `CONDICION_SIN_DECLARAR`; sin flotación, `[null]` juzga;
  - `balanceDescuadrado` gana a todo lo demás;
  - un límite nulo no se juzga: 50 % de maduro con `minMaduroPct: null` y el resto dentro →
    `CUMPLE`.
- [ ] **Paso 2–3** — implementar, verde, compuerta, commit. Flip: redondear los porcentajes antes
  de comparar → cae «el borde».

### Task 3: la merma y el disponible

**Files:**
- Modify: `lib/traceability/recepcionesDeCereza.ts`
- Test: `tests/traceability/mermaDeRecepcion.test.ts` (base)

**Produce:**

```ts
export async function anotarMerma(userAccountId: string, input: { recepcionId: string; kg: number; motivo: string; anotadaAt: Date }): Promise<MermaDeRecepcion>;
export async function anularMerma(userAccountId: string, input: { mermaId: string; motivo: string }): Promise<MermaDeRecepcion>;
export async function disponibleDeRecepciones(recepcionIds: readonly string[]): Promise<Map<string, number>>;
```

- `anotarMerma`: `exigeGestionarBeneficio` sobre el beneficio de la recepción; `kg > 0`
  (`kg_invalidos`); motivo no vacío (`motivo_obligatorio`); la recepción tiene que estar
  `recibida` (`recepcion_no_recibida`); dentro de la transacción, la fila de la recepción
  bloqueada y el disponible comprobado (`merma_sobre_lo_disponible`); AuditEvent
  `cherry_reception.loss`.
- `anularMerma`: mismo permiso, motivo obligatorio, `ya_anulada`; AuditEvent
  `cherry_reception.loss_void`.
- `disponibleDeRecepciones`: **sin principal** (la llaman pantallas que ya autorizaron); neto −
  mermas vigentes − vínculos. Va en `dependen_del_llamador` del allowlist.
- `anularRecepcion` gana: con algún `LoteDesdeRecepcion`, `ya_tiene_lotes` (el disparador 4 es la
  red).

- [ ] **Paso 1 — pruebas en rojo:**
  - una recepción de 100 con merma de 3 tiene 97 disponibles;
  - una merma de 200 se rechaza; una de 0, también;
  - anulada la merma, vuelven los 100;
  - anular una recepción con un lote encima → `ya_tiene_lotes`;
  - un Farm Manager de otra finca no anota mermas aquí.
- [ ] **Paso 2–3** — implementar, allowlist, cifras **medidas**, verde, compuerta, commit. Flip:
  no restar las mermas en `disponibleDeRecepciones` → cae «una recepción de 100 con merma de 3».

### Task 4: armar el lote, y la genealogía

**Files:**
- Create: `lib/traceability/lotesDeBeneficio.ts`
- Test: `tests/traceability/lotesDeBeneficio.test.ts` (base)

**Produce:**

```ts
export class LoteDeBeneficioError extends Error {}
export async function recepcionesArmables(userAccountId: string, beneficioId: string): Promise<Array<{ recepcion: RecepcionDeCereza; disponibleKg: number; pedidoId: string | null; origen: string }>>;
export async function armarLote(userAccountId: string, input: { beneficioId: string; codigo: string; recepciones: ReadonlyArray<{ recepcionId: string; kg: number }> }): Promise<Lot>;
export async function origenDelLote(lotId: string): Promise<Array<{ recepcionId: string; kg: number; nivel1LotId: string }>>;
```

- `armarLote`: `exigeGestionarBeneficio`; al menos una recepción (`sin_recepciones`); cada `kg > 0`
  y cuantizado a 3 decimales (`kg_invalidos`); todas las recepciones del MISMO beneficio
  (`recepcion_de_otro_beneficio`) y `recibida` (`recepcion_no_recibida`). En la transacción:
  `SELECT … FOR UPDATE` de cada recepción **en orden de id** (para no cruzar dos armados),
  disponible comprobado (`kg_sobre_lo_recibido`), `createLot` (`lotType: "cherry"`,
  `organizationId` del beneficio, `locationId` = beneficio; `codigo_repetido` si choca), los
  `LoteDesdeRecepcion`, un `QuantityEvent` `received` con la suma, y AuditEvent
  `lot.assembled_from_receptions`. **No abre proceso.**
- `origenDelLote`: si el lote tiene vínculos, los devuelve. Si no, sube por `LotTransformation`
  (de output a input) hasta los lotes que los tengan, **sin repetir** un `nivel1LotId` ya visto:
  eso es lo que impide contar dos veces cuando dos ramas se vuelven a juntar. Sin principal → va
  en `dependen_del_llamador`.

- [ ] **Paso 1 — pruebas en rojo:**
  - dos recepciones de 20 y 30 dan un lote de 50, **sin proceso abierto**, con su `QuantityEvent`;
  - tomar 10 de una de 20 deja 10 disponibles en `recepcionesArmables`;
  - dos `armarLote` simultáneos sobre la misma recepción de 20, de 15 kg cada uno: entra uno;
  - una recepción de otro beneficio → `recepcion_de_otro_beneficio`;
  - un Farm Manager de otra finca no arma;
  - **genealogía:** A sale de R; A se divide en B y C (`recordTransformation` `split`); B y C se
    fusionan en D (`merge`) → `origenDelLote(D)` devuelve R **una vez**; control: `origenDelLote(A)`
    devuelve R.
- [ ] **Paso 2–3** — implementar, allowlist, cifras, verde, compuerta, commit. Flip: quitar el
  `FOR UPDATE` de `armarLote` **y** el disparador 1 de la base propia → cae «dos armados
  simultáneos»; anotar cuál de los dos lo sostiene.

### Task 5: la selección escribe el veredicto

**Files:**
- Modify: `lib/traceability/selection.ts`, `lib/traceability/lots.ts` (`recordTransformation` gana
  un gancho), `app/actions/traceability.ts` (la acción de selección pasa la condición)
- Create: `lib/traceability/veredictoDelLote.ts`
- Test: `tests/traceability/veredictoDelLote.test.ts` (base)

**Produce:**

```ts
// lots.ts — RecordTransformationInput gana:
//   readonly condicionDePesaje?: "DRAINED" | "WET" | "DRY" | null;
//   readonly enLaMismaTransaccion?: (tx: Prisma.TransactionClient, transformationId: string) => Promise<void>;
// selection.ts — RecordSelectionInput gana:  readonly condicionDePesaje?: ... | null;
// veredictoDelLote.ts:
export async function recalcularVeredicto(tx: Prisma.TransactionClient, lotId: string): Promise<void>;
```

- `recordSelection` exige la condición **si el método es `flotacion`**
  (`condicion_de_pesaje_obligatoria`), la rechaza si no es de las tres
  (`condicion_de_pesaje_invalida`), y pasa `enLaMismaTransaccion` para llamar a
  `recalcularVeredicto`.
- `recalcularVeredicto`: si el lote no tiene `LoteDesdeRecepcion`, **no hace nada**. Si los tiene:
  suma **todas** sus selecciones (insumo, aceptado, verde = salidas con categoría `cereza_verde`,
  flotes = `flotadores`), junta sus condiciones y si alguna fue por flotación, mira si alguna
  transformación quedó con desviación de balance, resuelve el pedido (el mismo en todas sus
  recepciones, o `null`), llama a `evaluarCalidad` y hace `upsert` de la fila por `lotId`.
- El pedido del lote sale de sus recepciones: si todas apuntan al mismo, ése; si no, `null`.

- [ ] **Paso 1 — pruebas en rojo:**
  - un lote de 100 de un pedido (≥ 75 / ≤ 12 / ≤ 12) con 80 aceptado, 10 verde y 10 flotes →
    `CUMPLE`, con sus cuatro masas;
  - **una segunda selección recalcula:** 1 kg limpio y después 99 con 30 de verde → `NO_CUMPLE`;
  - el lote **aceptado** que se vuelve a seleccionar no crea veredicto (no tiene vínculos);
  - un lote con recepciones de dos pedidos → `NO_ATRIBUIBLE`;
  - flotación sin condición → el servicio lo rechaza; con `WET`, entra;
  - dos selecciones, una `WET` y otra `DRAINED` → `INCOMPARABLE_WEIGHING_CONDITION`;
  - selección **manual** sin condición: entra y juzga (control positivo);
  - **el veredicto y la transformación van juntos:** una prueba propia de `recordTransformation`
    le pasa un `enLaMismaTransaccion` que lanza, y comprueba que **no** queda transformación ni
    lotes de salida. Es lo que hace que una selección no pueda guardarse sin su veredicto.
- [ ] **Paso 2–3** — implementar, verde, compuerta, commit. Flip: hacer que
  `recalcularVeredicto` mire sólo la última selección → cae «una segunda selección recalcula».

### Task 6: las pantallas, y las vías viejas

**Files:**
- Modify: `app/beneficio/recepcion/page.tsx` (bloque «Armar lote» y «Anotar merma»),
  `app/lots/[id]/page.tsx` («De dónde viene», el veredicto y «Abrir proceso» en el aceptado),
  `app/beneficio/pedidos/page.tsx` (el veredicto de cada lote),
  `app/actions/recepcionDeCereza.ts` (acciones nuevas),
  `app/components/traceability/SelectionForm.tsx` (condición de pesaje si el método es flotación),
  `scripts/rutas-declaradas.mjs` y `tests/inventario-de-rutas.test.ts` (cifra **medida**),
  `messages/{es,en}.json`
- Create: `app/components/beneficio/ArmarLoteForm.tsx`, `app/components/beneficio/MermaForm.tsx`
- Delete: `app/lots/new/page.tsx`, `app/components/traceability/HarvestForm.tsx`,
  `app/components/traceability/ReceivingForm.tsx`, y el enlace a `/lots/new` de `app/lots/page.tsx`

- **Armar lote:** lista `recepcionesArmables` con su disponible y su origen; casillas o kilos por
  recepción; el código del lote; **avisa** si las elegidas son de pedidos distintos.
- **Merma:** kilos y motivo, por recepción, y «Anular» con motivo.
- **Ficha del lote:** «De dónde viene» con `origenDelLote` (cada recepción, sus kilos, y detrás su
  entrega, parcela, bloque o planta y recolector, o su proveedor); el veredicto si lo tiene; y en
  un lote **aceptado** de una selección, el botón «Abrir proceso» que ya existe.
- **Retirada:** se borran las tres pantallas viejas; `recordHarvestEvent` y `recordReceivingEvent`
  **se quedan** con un comentario que dice que su pantalla se retiró el 2026-09-19 y por qué, y sus
  pruebas siguen.
- Botones con `BotonDeEnvio` o `disabled={pending}`; hora con `TimezoneOffsetField`.

- [ ] **Paso 1** — tipos, lint, hermético (rutas —la cifra **baja** en uno—, mensajes cruzados
  contra el código con su control, `use-server-solo-async`, envío sin doble toque), build.
- [ ] **Paso 2** — commit. Flip: quitar de `rutas-declaradas.mjs` la entrada de `/lots/new`
  **sin** borrar la página → cae «el repositorio real está entero y sin contradicciones». Sin
  navegador: hace falta sesión.

### Task 7: el cierre

- [ ] Rebasar sobre `origin/main`; **comprobar la marca de la migración** contra la última de
  `main` y moverla si hace falta; base propia recreada con `migrate deploy`.
- [ ] Cifras del inventario de acceso **medidas**, las siete filas; rutas medidas.
- [ ] Guardias en verde: `audit-atomico`, acceso a datos, `use-server-solo-async`,
  `permissionCoverage`, cifras.
- [ ] Compuerta final completa; pruebas nuevas **contadas por nombre** con `--reporter=verbose`.
- [ ] `SESSION_STATE.md`: la entrada de la pieza 3, y lo que le toca a Daniel.
- [ ] Anotar en `docs/beneficio/12_mass_balance_byproducts.md` la decisión de la condición de
  pesaje en la selección (sólo flotación), junto a la de la recepción.
- [ ] PR con spec, plan y código. Fusión cuando Daniel lo diga.
