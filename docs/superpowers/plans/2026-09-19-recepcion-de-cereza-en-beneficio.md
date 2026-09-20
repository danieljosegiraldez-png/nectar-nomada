# Recepción de cereza en el beneficio — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el beneficio reciba cada entrega de la finca y la cereza de fuera en una sola
recepción trazable, con doble peso firmado por dos personas, rechazo con motivo, Brix opcional
y pedido opcional con su cantidad, sin crear lotes.

**Architecture:**
- Dos tablas nuevas en `traceability`: `PedidoDeCereza` y `RecepcionDeCereza`. La jornada gana
  su beneficio de destino, y el `Asset` su recepción.
- Las reglas que no pueden fallar viven **en la base** (CHECK y disparadores) **y** en el
  servicio: un origen, neto calculado, dos personas, inmutabilidad, una recepción vigente por
  entrega, la entrega recibida no se anula y el destino no cambia tras recibir.
- Dos módulos puros (`brixDeRecepcion.ts`, `comparacionDePesos.ts`) y tres de servicio
  (`proveedoresDeCereza.ts`, `pedidosDeCereza.ts`, `recepcionesDeCereza.ts`).

**Tech Stack:** Next.js 16 (server actions), Prisma 7 (`generated/prisma/client`), Postgres,
vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-recepcion-de-cereza-en-beneficio-design.md`
(aprobado por Daniel el 2026-09-19: «sí… escribe el plan»).

## Global Constraints

- **El propósito es la trazabilidad.** La recepción es el origen; **no crea lote**. Ningún
  `Lot`, `HarvestEvent`, `QuantityEvent` ni `ReceivingEvent` sale de esta pieza.
- **`ReceivingEvent` no se toca.** Sigue funcionando hasta la pieza 3.
- **Origen de la recepción:** exactamente uno de `entregaId` o `proveedorId` (CHECK).
- **Neto:** `neto_kg = bruto_kg − recipientes × tara_por_recipiente_kg`, > 0, recalculado por
  CHECK.
- **Comparación de básculas** con `POLITICA_POR_DEFECTO` de `lib/beneficio/balanceDeMasas.ts`:
  referencia = peso de origen; diferencia = neto − referencia; % = diferencia / referencia;
  tolerancia = máx(referencia × `relativeTolerance`, `absoluteFloorKg`); estado `BALANCED` |
  `DISCREPANCY_FLAGGED` (≤ `grossThreshold`) | `GROSS_IMBALANCE`. **Nunca bloquea**; fuera de
  `BALANCED`, nota obligatoria (CHECK).
- **La condición de pesaje no se anota** (decisión de Daniel).
- **Brix:** opcional; con valor, `SamplePoint` obligatorio (CHECK). Veredicto
  `SENSOR_FAULT` fuera de (`BRIX_PHYSICAL_MIN`, `BRIX_PHYSICAL_MAX`] de
  `lib/beneficio/perfiles.ts` —el mismo predicado que `evaluarBrix`—; 18,0 ≤ bx ≤ 24,0
  `INTAKE_OPTIMAL`; bx < 16,0 `INTAKE_UNDERRIPE`; el resto `SIN_VEREDICTO`. Fuera de rango se
  **guarda**.
- **Dos personas** en recibir, rechazar y anular: la cuenta que actúa no es `entrega.anotadaPor`
  ni una cuenta de `entrega.recolectorId`. Servicio **y** disparador, al insertar y al actualizar.
- **Permisos:** recibir, rechazar, anular y pedidos → `lot:manage` sobre **ese** beneficio; ver
  → `lot:view`; alta de proveedor → `cherry_supplier:create` (nuevo; Farm Manager y Farm
  Operator); destino de jornada → `lot:manage` sobre la finca.
- Toda escritura, con su `AuditEvent` en la misma transacción.
- Pruebas con base en `scripts/pruebas-por-compuerta.txt` (grupo `base-sembrada`). Permisos
  nuevos → `npm run db:seed` en la base propia.
- **Compuerta por tarea:** tipos, lint, estado, hermético, con base en base propia recreada con
  `migrate deploy`, build. **Commit antes de mutar**, y flip-test que compile y tumbe su prueba
  **por nombre**.
- Migración a mano, FKs `<tabla>_<columna>_fkey`, marca de tiempo **posterior a la última de
  `origin/main` en el momento de commitear** (hoy `20260919135000`), y se vuelve a comprobar al
  rebasar: dos veces seguidas otra rama trajo la misma marca.

---

### Task 1: el esquema — pedido, recepción, destino, y sus reglas en la base

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_recepcion_de_cereza/migration.sql`
- Test: `tests/traceability/recepcionDeCereza-esquema.test.ts` (base)

**Produce:**

```prisma
enum EstadoDePedido           { abierto cerrado                                        @@schema("traceability") }
enum EstadoDeRecepcion        { recibida rechazada anulada                             @@schema("traceability") }
enum ComparacionDePesos       { BALANCED DISCREPANCY_FLAGGED GROSS_IMBALANCE           @@schema("traceability") }
enum VeredictoBrixDeRecepcion { INTAKE_OPTIMAL INTAKE_UNDERRIPE SIN_VEREDICTO SENSOR_FAULT @@schema("traceability") }
enum PuntoDeMuestreoBrix      { TANK_LIQUID_MID TANK_LIQUID_SURFACE MUCILAGE_PRESSED CHERRY_PULP PARCHMENT_BED @@schema("traceability") }

model PedidoDeCereza {
  id                String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  beneficioId       String         @map("beneficio_id") @db.Uuid
  beneficio         Location       @relation("PedidoBeneficio", fields: [beneficioId], references: [id], onDelete: Restrict)
  fincaSiteId       String?        @map("finca_site_id") @db.Uuid
  fincaSite         Location?      @relation("PedidoFinca", fields: [fincaSiteId], references: [id], onDelete: Restrict)
  proveedorId       String?        @map("proveedor_id") @db.Uuid
  proveedor         Organization?  @relation("PedidoProveedor", fields: [proveedorId], references: [id], onDelete: Restrict)
  fecha             DateTime       @db.Date
  kgPedidos         Decimal        @map("kg_pedidos") @db.Decimal(10, 3)
  margenCantidadPct Decimal        @map("margen_cantidad_pct") @db.Decimal(5, 2)
  minMaduroPct      Decimal?       @map("min_maduro_pct") @db.Decimal(5, 2)
  maxVerdePct       Decimal?       @map("max_verde_pct") @db.Decimal(5, 2)
  maxFlotesPct      Decimal?       @map("max_flotes_pct") @db.Decimal(5, 2)
  estado            EstadoDePedido @default(abierto)
  cerradoAt         DateTime?      @map("cerrado_at")
  notaDeCierre      String?        @map("nota_de_cierre")
  recepciones       RecepcionDeCereza[]
  createdAt         DateTime       @default(now()) @map("created_at")
  createdBy         String?        @map("created_by") @db.Uuid
  @@index([beneficioId, estado])
  @@map("pedido_de_cereza") @@schema("traceability")
}

model RecepcionDeCereza {
  id                   String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  claveDeEnvio         String                    @unique @map("clave_de_envio")
  beneficioId          String                    @map("beneficio_id") @db.Uuid
  beneficio            Location                  @relation("RecepcionBeneficio", fields: [beneficioId], references: [id], onDelete: Restrict)
  entregaId            String?                   @map("entrega_id") @db.Uuid
  entrega              EntregaDeCosecha?         @relation(fields: [entregaId], references: [id], onDelete: Restrict)
  proveedorId          String?                   @map("proveedor_id") @db.Uuid
  proveedor            Organization?             @relation("RecepcionProveedor", fields: [proveedorId], references: [id], onDelete: Restrict)
  pedidoId             String?                   @map("pedido_id") @db.Uuid
  pedido               PedidoDeCereza?           @relation(fields: [pedidoId], references: [id], onDelete: Restrict)
  recibidaPor          String                    @map("recibida_por") @db.Uuid
  recibidaAt           DateTime                  @map("recibida_at")
  brutoKg              Decimal                   @map("bruto_kg") @db.Decimal(10, 3)
  recipientes          Int
  taraPorRecipienteKg  Decimal                   @map("tara_por_recipiente_kg") @db.Decimal(10, 3)
  netoKg               Decimal                   @map("neto_kg") @db.Decimal(10, 3)
  pesoDeclaradoKg      Decimal?                  @map("peso_declarado_kg") @db.Decimal(10, 3)
  referenciaKg         Decimal?                  @map("referencia_kg") @db.Decimal(10, 3)
  diferenciaKg         Decimal?                  @map("diferencia_kg") @db.Decimal(10, 3)
  toleranciaKg         Decimal?                  @map("tolerancia_kg") @db.Decimal(10, 3)
  comparacion          ComparacionDePesos?
  politicaDeBalance    Json?                     @map("politica_de_balance")
  brix                 Decimal?                  @db.Decimal(5, 2)
  puntoDeMuestreo      PuntoDeMuestreoBrix?      @map("punto_de_muestreo")
  instrumentoId        String?                   @map("instrumento_id") @db.Uuid
  veredictoBrix        VeredictoBrixDeRecepcion? @map("veredicto_brix")
  nota                 String?
  estado               EstadoDeRecepcion         @default(recibida)
  motivoRechazo        String?                   @map("motivo_rechazo")
  anuladaAt            DateTime?                 @map("anulada_at")
  anuladaPor           String?                   @map("anulada_por") @db.Uuid
  motivoAnulacion      String?                   @map("motivo_anulacion")
  assets               Asset[]
  createdAt            DateTime                  @default(now()) @map("created_at")
  @@index([beneficioId, recibidaAt])
  @@index([pedidoId])
  @@map("recepcion_de_cereza") @@schema("traceability")
}
```

Más:
- `JornadaDeCosecha.beneficioId` (anulable, FK a `Location`, relación `"JornadaDestino"`);
- `EntregaDeCosecha.recepciones RecepcionDeCereza[]`;
- `Asset.recepcionDeCerezaId` (anulable, FK);
- las relaciones inversas en `Location` y `Organization`.

**CHECKs:**
- `recepcion_de_cereza_un_origen`: `num_nonnulls(entrega_id, proveedor_id) = 1`;
- `recepcion_de_cereza_pesos`: `bruto_kg > 0 AND recipientes >= 0 AND tara_por_recipiente_kg >= 0
  AND neto_kg > 0 AND neto_kg = bruto_kg - recipientes * tara_por_recipiente_kg`;
- `recepcion_de_cereza_declarado`: `peso_declarado_kg IS NULL OR (proveedor_id IS NOT NULL AND
  peso_declarado_kg > 0)`;
- `recepcion_de_cereza_comparacion_completa`: `(referencia_kg IS NULL) = (comparacion IS NULL)
  AND (comparacion IS NULL) = (diferencia_kg IS NULL) AND (comparacion IS NULL) = (tolerancia_kg
  IS NULL) AND (comparacion IS NULL) = (politica_de_balance IS NULL)`;
- `recepcion_de_cereza_nota_si_discrepa`: `comparacion IS NULL OR comparacion = 'BALANCED' OR
  length(btrim(coalesce(nota, ''))) > 0`;
- `recepcion_de_cereza_brix_completo`: `(brix IS NULL) = (punto_de_muestreo IS NULL) AND
  (brix IS NULL) = (veredicto_brix IS NULL)`;
- `recepcion_de_cereza_rechazo`: `(estado = 'rechazada') = (length(btrim(coalesce(motivo_rechazo,
  ''))) > 0) OR estado = 'anulada'`;
- `recepcion_de_cereza_anulacion_completa`: `(estado = 'anulada') = (anulada_at IS NOT NULL AND
  anulada_por IS NOT NULL AND length(btrim(coalesce(motivo_anulacion, ''))) > 0)`;
- `pedido_de_cereza_una_fuente`: `num_nonnulls(finca_site_id, proveedor_id) = 1`;
- `pedido_de_cereza_cifras`: `kg_pedidos > 0 AND margen_cantidad_pct >= 0` y cada `_pct`
  anulable entre 0 y 100;
- `pedido_de_cereza_cierre`: `(estado = 'cerrado') = (cerrado_at IS NOT NULL)`.

**Índice parcial:** `recepcion_de_cereza_entrega_vigente` único sobre `entrega_id` donde
`entrega_id IS NOT NULL AND estado <> 'anulada'`.

**Disparadores** (funciones en `traceability`, `RAISE EXCEPTION` con un mensaje que nombra la
regla):
1. `recepcion_de_cereza_dos_personas` — `BEFORE INSERT OR UPDATE` en `recepcion_de_cereza`.
   Con `entrega_id`:
   - la entrega tiene que estar `enviada` al insertar;
   - `referencia_kg` tiene que ser igual a su `peso_finca_kg`;
   - ni `recibida_por` ni `anulada_por` (si no es nulo) pueden ser `anotada_por`, ni una
     `core.user_account` cuyo `person_id` sea `recolector_person_id`.
   Con `proveedor_id`: `referencia_kg` es `peso_declarado_kg`.
2. `recepcion_de_cereza_inmutable` — `BEFORE UPDATE`: cualquier columna distinta de `estado`,
   `anulada_at`, `anulada_por` y `motivo_anulacion` que cambie (`IS DISTINCT FROM`) → error; y
   `estado` sólo puede pasar de `recibida` o `rechazada` a `anulada`.
3. `entrega_de_cosecha_recibida_no_se_anula` — `BEFORE UPDATE` en `entrega_de_cosecha`: pasar a
   `anulada` con una recepción no anulada → error.
4. `jornada_de_cosecha_destino_fijo` — `BEFORE UPDATE` en `jornada_de_cosecha`: cambiar
   `beneficio_id` cuando alguna entrega suya tiene una recepción no anulada → error.

- [ ] **Paso 1 — pruebas en rojo:** sondas con SQL directo (`$executeRawUnsafe` dentro de
  `SAVEPOINT`), cada rechazo con su **control positivo** (la fila válida entra). Fixture: finca,
  parcela, beneficio bajo el sitio, recolector con cuenta, capataz (anota), receptor (otra
  cuenta), jornada con destino, una entrega `enviada` de 20 kg, un proveedor.
  - dos orígenes y ninguno → `recepcion_de_cereza_un_origen`; uno → entra;
  - neto 18 con bruto 20, 2 recipientes, tara 0,5 → `recepcion_de_cereza_pesos`; neto 19 entra;
  - `DISCREPANCY_FLAGGED` sin nota → rechaza; con nota → entra;
  - Brix sin punto → rechaza;
  - `recibida_por` = el capataz que anotó → el disparador rechaza; = la cuenta del recolector →
    rechaza; = el receptor → entra;
  - `UPDATE … SET recibida_por = <capataz>` sobre la recepción válida → rechaza;
  - `UPDATE … SET neto_kg = …` → rechaza; `UPDATE` a `anulada` con los tres campos → entra;
  - dos recepciones vigentes de la misma entrega → índice; con la primera anulada, la segunda
    entra;
  - anular la entrega con una recepción vigente → rechaza; con la recepción anulada → entra;
  - cambiar el destino de la jornada con recepción vigente → rechaza; sin ella → entra.
- [ ] **Paso 2** — la migración a mano; `migrate deploy` en la base propia recreada;
  `prisma generate`.
- [ ] **Paso 3** — verde, compuerta, commit. Flip: quitar de la migración y de la base propia
  el disparador 1 → cae «recibida_por = el capataz que anotó se rechaza».

### Task 2: las reglas puras — neto, comparación de básculas y Brix de recepción

**Files:**
- Create: `lib/beneficio/comparacionDePesos.ts`, `lib/beneficio/brixDeRecepcion.ts`
- Test: `tests/beneficio/comparacionDePesos.test.ts`, `tests/beneficio/brixDeRecepcion.test.ts`
  (herméticas)

**Produce:**

```ts
// comparacionDePesos.ts
import { POLITICA_POR_DEFECTO, type BalancePolicy } from "./balanceDeMasas";
export function netoDeRecepcion(brutoKg: number, recipientes: number, taraPorRecipienteKg: number): number;
export interface ComparacionDeBasculas {
  readonly referenciaKg: number; readonly netoKg: number;
  readonly diferenciaKg: number; readonly diferenciaPct: number; readonly toleranciaKg: number;
  readonly estado: "BALANCED" | "DISCREPANCY_FLAGGED" | "GROSS_IMBALANCE";
  readonly politica: BalancePolicy;
}
export function compararBasculas(referenciaKg: number, netoKg: number, politica?: BalancePolicy): ComparacionDeBasculas;

// brixDeRecepcion.ts
import { BRIX_PHYSICAL_MAX, BRIX_PHYSICAL_MIN } from "./perfiles";
export type VeredictoBrixDeRecepcion = "INTAKE_OPTIMAL" | "INTAKE_UNDERRIPE" | "SIN_VEREDICTO" | "SENSOR_FAULT";
export const BRIX_INTAKE_OPTIMO_MIN = 18.0; // 11_brix_kinetics.md §1
export const BRIX_INTAKE_OPTIMO_MAX = 24.0;
export const BRIX_INTAKE_INMADURA_BAJO = 16.0;
export function evaluarBrixDeRecepcion(bx: number): VeredictoBrixDeRecepcion;
```

- `netoDeRecepcion` redondea a 3 decimales (la columna es `Decimal(10,3)`), igual que el CHECK
  va a comparar, y lanza `SchemaError` (de `balanceDeMasas.ts`) si bruto ≤ 0, recipientes no
  entero o < 0, tara < 0, o neto ≤ 0.
- `compararBasculas`: `diferenciaKg = neto − referencia`; `diferenciaPct = diferencia /
  referencia`; `toleranciaKg = max(referencia × relativeTolerance, absoluteFloorKg)`;
  `|diferencia| ≤ tolerancia` → `BALANCED`; `|diferenciaPct| ≤ grossThreshold` →
  `DISCREPANCY_FLAGGED`; si no, `GROSS_IMBALANCE`. Referencia ≤ 0 → `SchemaError`.
- `evaluarBrixDeRecepcion`: `!(bx > BRIX_PHYSICAL_MIN && bx <= BRIX_PHYSICAL_MAX)` →
  `SENSOR_FAULT`; 18 ≤ bx ≤ 24 → `INTAKE_OPTIMAL`; bx < 16 → `INTAKE_UNDERRIPE`; el resto →
  `SIN_VEREDICTO`. `NaN` → `SENSOR_FAULT` (lo da el mismo predicado; una prueba lo fija).

- [ ] **Paso 1 — pruebas en rojo:**
  - neto: 20 − 2 × 0,5 = 19; tara 0 y 0 recipientes = bruto; neto ≤ 0 lanza;
  - comparación: referencia 20, neto 19,9 → `BALANCED` (tolerancia 0,5 por el piso);
    referencia 200, neto 198 → `DISCREPANCY_FLAGGED` (tolerancia 1, −1 %); referencia 100, neto
    90 → `GROSS_IMBALANCE`; el signo: neto 20,6 sobre 20 → `diferenciaKg` +0,6;
  - el caso de Codex: referencia 100, neto 100,502 → `DISCREPANCY_FLAGGED`, porque la base es
    la referencia (tolerancia 0,5), no el neto;
  - Brix: 18 y 24 → óptimo; 15,9 → inmadura; 17, 16 y 25 → sin veredicto; −1, 0, 32,1 y `NaN`
    → `SENSOR_FAULT`; 32 → sin veredicto.
- [ ] **Paso 2–3** — implementar, verde, compuerta, commit. Flip: calcular la tolerancia sobre
  el neto en vez de la referencia → cae «el caso de Codex».

### Task 3: el destino de la jornada, y la entrega recibida no se anula

**Files:**
- Modify: `lib/traceability/jornadasDeCosecha.ts`, `lib/traceability/entregasDeCosecha.ts`
- Test: `tests/traceability/destinoDeJornada.test.ts` (base); ajustar los fixtures de
  `tests/traceability/{jornadasDeCosecha,entregasDeCosecha,situacionesDeCampo}.test.ts`, que
  abren jornadas sin destino

**Produce:**

```ts
// jornadasDeCosecha.ts
export async function beneficiosDeDestino(userAccountId: string): Promise<{ id: string; name: string }[]>;
// AbrirJornadaInput gana:  readonly beneficioId: string;   (obligatorio)
export async function cambiarDestinoDeJornada(userAccountId: string, input: { jornadaId: string; beneficioId: string }): Promise<JornadaDeCosecha>;

// entregasDeCosecha.ts — anularEntrega: nuevo error EntregaError("ya_recibida")
```

- `beneficiosDeDestino`: las `Location` de tipo `beneficio` sobre las que la cuenta tiene
  `lot:view` (`can(user, "view", "lot", {location}, classification)`, que ya sube por los
  ancestros). **No** `listarBeneficios`, que filtra por `location:manage_attributes`.
- `abrirJornada`: `beneficio_no_valido` si el id no existe, no es de tipo `beneficio`, o la
  cuenta no tiene `lot:view` sobre él.
- `cambiarDestinoDeJornada`: `lot:manage` sobre la finca; `destino_fijo` si alguna entrega
  tiene recepción no anulada (el disparador 4 es la red); AuditEvent `harvest_day.set_destination`.
- `anularEntrega`: dentro de la transacción, con una recepción no anulada → `ya_recibida` (el
  disparador 3 es la red).

- [ ] **Paso 1 — pruebas en rojo:**
  - abrir sin destino, o con un `plot` como destino → `beneficio_no_valido`; con el beneficio →
    entra y lo guarda;
  - `beneficiosDeDestino` del capataz lista el beneficio de su finca y **no** el de otra finca;
  - cambiar el destino sin recepciones → entra, con su AuditEvent; con una recepción vigente
    (creada por SQL directo en la prueba, porque el servicio de recepción es la Tarea 5) →
    `destino_fijo`;
  - anular una entrega con recepción vigente → `ya_recibida`; sin ella → sigue funcionando.
- [ ] **Paso 2–3** — implementar, ajustar los tres fixtures para abrir con destino, verde,
  compuerta, commit. Flip: quitar el `ya_recibida` del servicio → cae «anular una entrega con
  recepción vigente», porque la prueba exige el código `ya_recibida` y el disparador 3, que
  sigue ahí, rechaza con su propio mensaje. El disparador ya tiene su flip en la Tarea 1.

### Task 4: proveedores de fuera y pedidos

**Files:**
- Modify: `lib/rbac/catalog.ts` (permiso `cherry_supplier:create`, en Farm Manager y Farm
  Operator), `tests/rbac/permissionCoverage.test.ts`
- Create: `lib/traceability/proveedoresDeCereza.ts`, `lib/traceability/pedidosDeCereza.ts`
- Test: `tests/traceability/pedidosDeCereza.test.ts` (base)

**Produce:**

```ts
// proveedoresDeCereza.ts
export class ProveedorError extends Error {}
export async function crearProveedorDeCereza(userAccountId: string, input: { nombre: string; lugar?: string | null }): Promise<Organization>;
export async function proveedoresDeCereza(userAccountId: string): Promise<{ id: string; name: string }[]>;

// pedidosDeCereza.ts
export class PedidoError extends Error {}
export type FuenteDePedido = { fincaSiteId: string } | { proveedorId: string };
export async function crearPedido(userAccountId: string, input: {
  beneficioId: string; fuente: FuenteDePedido; fecha: Date; kgPedidos: number; margenCantidadPct: number;
  minMaduroPct?: number | null; maxVerdePct?: number | null; maxFlotesPct?: number | null;
}): Promise<PedidoDeCereza>;
export async function cerrarPedido(userAccountId: string, input: { pedidoId: string; nota?: string | null }): Promise<PedidoDeCereza>;
export async function pedidosDeBeneficio(userAccountId: string, beneficioId: string): Promise<Array<PedidoDeCereza & { recibidoKg: number; diferenciaKg: number; diferenciaPct: number }>>;
export function cantidadDelPedido(kgPedidos: number, recibidoKg: number, margenPct: number): { diferenciaKg: number; diferenciaPct: number; exceso: boolean; falta: boolean };
```

- Proveedor: `Organization` `producer`, `status: approved`, `classification: internal`, el
  lugar en `description`; nombre sin vacío y **único entre los `producer` sin distinguir
  mayúsculas** (`proveedor_repetido`); `cherry_supplier:create` en ámbito de plataforma o de
  cualquier ubicación (`permissionKeysAnywhere`), porque un proveedor no tiene ubicación.
  Listar: `lot:view` en algún ámbito. AuditEvent `organization.create_cherry_supplier`.
- Pedido: `lot:manage` sobre el beneficio; fuente finca → tiene que ser un `site`; fuente
  proveedor → `producer`. `recibidoKg` = suma de `neto_kg` de sus recepciones `recibida`.
- `cantidadDelPedido`: `exceso` si recibido > kg × (1 + margen/100); `falta` si recibido <
  kg × (1 − margen/100).
- `cerrarPedido`: si `falta` y sin nota → `nota_obligatoria`; AuditEvent `cherry_order.close`.

- [ ] **Paso 1 — pruebas en rojo:**
  - el Farm Operator da de alta «Don Pedro»; «don pedro» → `proveedor_repetido`; el Recolector
    no puede (sin permiso);
  - pedido con dos fuentes o ninguna se rechaza (base); con proveedor, entra;
  - `cantidadDelPedido(500, 520, 2)` → +20, +4 %, exceso; `(500, 505, 2)` → sin exceso;
  - cerrar con 300 de 500 y margen 2 sin nota → `nota_obligatoria`; con nota → cerrado;
  - un Farm Manager de OTRA finca no crea pedidos en este beneficio.
- [ ] **Paso 2–3** — implementar, `db:seed`, verde, compuerta, commit. Flip: comparar el
  nombre del proveedor distinguiendo mayúsculas → cae «don pedro se rechaza».

### Task 5: la recepción

**Files:**
- Create: `lib/traceability/recepcionesDeCereza.ts`
- Test: `tests/traceability/recepcionesDeCereza.test.ts` (base)

**Produce:**

```ts
export class RecepcionError extends Error {}
export type OrigenDeRecepcion = { entregaId: string } | { proveedorId: string; pesoDeclaradoKg?: number | null };
export interface RecibirCerezaInput {
  readonly claveDeEnvio: string;
  readonly beneficioId: string;
  readonly origen: OrigenDeRecepcion;
  readonly pedidoId?: string | null;
  readonly recibidaAt: Date;
  readonly brutoKg: number;
  readonly recipientes: number;
  readonly taraPorRecipienteKg: number;
  readonly brix?: { valor: number; puntoDeMuestreo: SamplePoint; instrumentoId?: string | null } | null;
  readonly nota?: string | null;
  readonly rechazo?: { motivo: string } | null;
}
export async function recibirCereza(userAccountId: string, input: RecibirCerezaInput): Promise<RecepcionDeCereza>;
export async function anularRecepcion(userAccountId: string, input: { recepcionId: string; motivo: string }): Promise<RecepcionDeCereza>;
export async function pendientesDeBeneficio(userAccountId: string, beneficioId: string): Promise<PendienteDeRecepcion[]>;
export async function recepcionesDeBeneficio(userAccountId: string, beneficioId: string, desde: Date): Promise<RecepcionConDetalle[]>;
export async function pedirSubidaDeFotoDeRecepcion(userAccountId: string, input: { recepcionId: string; originalFilename: string; contentType: string }): Promise<{ uploadUrl: string; storageKey: string }>;
export async function confirmarFotoDeRecepcion(userAccountId: string, input: { recepcionId: string; storageKey: string; mimeType: string; sizeBytes: number; originalFilename: string }): Promise<Asset>;
// y, para el otro lado:
export async function recepcionDeEntregas(entregaIds: readonly string[]): Promise<Map<string, { estado: EstadoDeRecepcion; netoKg: number; diferenciaKg: number | null; motivoRechazo: string | null }>>;
```

`recibirCereza`, en este orden:
1. **Idempotencia:** si existe una recepción con esa `claveDeEnvio`, se devuelve (antes de
   cualquier otra comprobación, como `finalizeFieldMedia`).
2. `requireLotAccess(user, "manage", [{ locationId: beneficioId, classification }])`, y el id
   tiene que ser de tipo `beneficio`.
3. Pesos por `netoDeRecepcion`; Brix por `evaluarBrixDeRecepcion`.
4. En `prisma.$transaction`:
   - con entrega: `SELECT … FOR UPDATE` de la fila de la entrega (`$queryRaw`); tiene que estar
     `enviada` (`entrega_no_enviada`), su jornada con `beneficio_id` = este (`otro_destino`), y
     sin recepción no anulada (`ya_recibida`). **Dos personas:** la cuenta no es `anotadaPor`
     ni tiene `personId` = `recolectorId` (`misma_persona`). Referencia = `pesoFincaKg`;
   - con proveedor: tiene que ser un `producer`; referencia = `pesoDeclaradoKg` o ninguna;
   - con pedido: `SELECT … FOR UPDATE` del pedido; `abierto`, del mismo beneficio y de la misma
     fuente (la finca de la jornada de la entrega, o el proveedor) → si no, `pedido_no_valido`.
     Si con este neto cruza al `exceso` y no hay nota → `nota_obligatoria`;
   - comparación por `compararBasculas`, si hay referencia; fuera de `BALANCED` sin nota →
     `nota_obligatoria`;
   - con `rechazo`: motivo sin vacío (`motivo_obligatorio`) y `estado: rechazada`;
   - crear, y AuditEvent `cherry_reception.create` (o `.reject`).
- `anularRecepcion`: `lot:manage` sobre el beneficio, motivo obligatorio, dos personas contra la
  entrega (`misma_persona`), `ya_anulada`; AuditEvent `cherry_reception.void`. **El «sólo
  mientras no haya salido ningún lote» llega con la pieza 3**, que crea el vínculo; aquí va un
  comentario en la función que lo dice.
- `pendientesDeBeneficio`: `lot:view` sobre el beneficio; entregas `enviada` de jornadas con
  ese destino, sin recepción no anulada.
- `recepcionDeEntregas`: **sin principal** — la llaman `detalleDeJornada` y `misEntregas`, que
  ya autorizaron; va en `dependen_del_llamador` del allowlist.
- Foto: `lot:manage` sobre el beneficio; clave `nectar-originals/recepciones/<id>/…`,
  re-comprobada al confirmar; AuditEvent `asset.create`.

- [ ] **Paso 1 — pruebas en rojo** (fixture de la Tarea 1 por servicio; el recolector con
  perfil Recolector, el capataz Farm Operator de la finca, el receptor Farm Operator del
  beneficio):
  - el receptor recibe la entrega de 20 kg con bruto 21, 2 recipientes, tara 0,5 → neto 20,
    `BALANCED`, sin nota; la entrega sale de pendientes;
  - el capataz que la anotó no puede recibirla (`misma_persona`); el recolector con cuenta
    tampoco;
  - una entrega de una jornada con destino a OTRO beneficio, mandada por id → `otro_destino`;
  - un Farm Manager de otra finca sin `lot:manage` sobre el beneficio → rechazo de acceso;
  - bruto 23 → `DISCREPANCY_FLAGGED` sin nota → `nota_obligatoria`; con nota → entra; bruto 40
    → `GROSS_IMBALANCE` con nota → **se guarda**;
  - la misma `claveDeEnvio` dos veces → una sola fila;
  - de fuera sin peso declarado → sin comparación; con 100 declarado y neto 99,8 → `BALANCED`;
  - pedido de 500, margen 2: recepciones de 300 y 220 → la segunda sin nota se rechaza
    (`nota_obligatoria`), con nota entra, y el pedido dice +20 kg, +4 %;
  - un pedido de otro proveedor → `pedido_no_valido`;
  - rechazar sin motivo → `motivo_obligatorio`; con motivo → `rechazada`;
  - Brix 19 en `CHERRY_PULP` → `INTAKE_OPTIMAL` guardado; 35 → `SENSOR_FAULT` guardado;
  - anular devuelve la entrega a pendiente; la anula el capataz que la anotó → `misma_persona`;
  - **dos recibos simultáneos de la misma entrega** (`Promise.allSettled` de dos
    `recibirCereza` con claves distintas): exactamente uno entra.
- [ ] **Paso 2–3** — implementar, verde, allowlist (cliente total, transacción si la hubiera,
  `recepcionDeEntregas` en `dependen_del_llamador`), cifras **medidas**, compuerta, commit.
  Flips, uno por uno y cada uno por nombre:
  - quitar la comprobación de `otro_destino` → cae «destino a OTRO beneficio»;
  - quitar el `FOR UPDATE` de la entrega **y** el índice parcial de la base propia → cae «dos
    recibos simultáneos» (sólo el `FOR UPDATE` no basta: el índice es la red, y eso se anota).

### Task 6: las pantallas

**Files:**
- Create: `app/beneficio/recepcion/page.tsx`, `app/beneficio/pedidos/page.tsx`,
  `app/actions/recepcionDeCereza.ts` (`"use server"`, sólo `async`),
  `app/components/beneficio/RecibirCerezaForm.tsx`, `app/components/beneficio/PedidoForm.tsx`,
  `app/components/beneficio/BeneficioElegido.tsx`
- Modify: `app/beneficio/page.tsx` (enlaces a Recepción y Pedidos),
  `app/components/traceability/AbrirJornadaForm.tsx` y `app/finca/jornadas/page.tsx` (destino),
  `app/finca/jornadas/[id]/page.tsx` y `app/mis-entregas/page.tsx` (lo recibido),
  `lib/traceability/jornadasDeCosecha.ts` (`detalleDeJornada` usa `recepcionDeEntregas`),
  `lib/traceability/entregasDeCosecha.ts` (`misEntregas` también),
  `scripts/rutas-declaradas.mjs`, `tests/inventario-de-rutas.test.ts` (cifra **medida**),
  `messages/{es,en}.json` (namespace `Recepcion`)

- **Elegir el beneficio:** cookie `beneficio` que **sólo acota**, como `COOKIE_FINCA`; la
  página vuelve a resolverla contra los beneficios con `lot:view`.
- **`/beneficio/recepcion`:** pendientes con «Recibir» o «Rechazar» cada una; «Recibir cereza
  de fuera» con el proveedor (lista, o alta ahí con `cherry_supplier:create`) y el peso
  declarado; lo recibido hoy con neto, diferencia («−1,2 kg, −0,8 % · dentro de tolerancia»),
  nota, Brix y pedido; «Anular» con motivo; foto por recepción. Cada formulario lleva su
  `claveDeEnvio` (`crypto.randomUUID()` al montarse) y `BotonDeEnvio` o `disabled={pending}`.
  Hora con `TimezoneOffsetField` y `paraCampoLocal` en el navegador.
- **`/beneficio/pedidos`:** crear (fuente: finca o proveedor), la lista con lo recibido contra
  lo pedido, y cerrar con nota.
- **El otro lado:** la jornada y «Mis entregas» dicen «recibida: 17,9 kg en el beneficio
  (−0,6 kg)» o «rechazada: motivo».
- **Abrir jornada** pide el destino de `beneficiosDeDestino`; sin ninguno, el formulario lo dice
  en vez de ofrecerse vacío.

- [ ] **Paso 1** — tipos, lint, hermético (rutas, mensajes —cruzar cada clave usada contra
  `es` y `en` con un control—, `use-server-solo-async`, envío sin doble toque), build.
- [ ] **Paso 2** — commit. Flip: quitar la declaración de `/beneficio/recepcion` → cae «el
  repositorio real está entero y sin contradicciones». Sin navegador: hace falta sesión.

### Task 7: el cierre

- [ ] Rebasar sobre `origin/main`; **comprobar la marca de la migración** contra la última de
  `main` y moverla si hace falta; base propia recreada.
- [ ] Cifras del inventario de acceso **medidas**, las siete filas.
- [ ] Guardias en verde: `audit-atomico`, acceso a datos, `use-server-solo-async`,
  `permissionCoverage`.
- [ ] Compuerta final completa; las pruebas nuevas **contadas por nombre** con
  `--reporter=verbose`.
- [ ] `SESSION_STATE.md`: la entrada, y lo que le toca a Daniel.
- [ ] Actualizar el PR #444 (spec + plan + código). Fusión cuando Daniel lo diga.
