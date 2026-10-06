/**
 * La receta como lista ordenada de pasos: borrador, pasos y publicar — Parte 2a, tarea 3 (2026-10-03).
 *
 * Diseño `docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md`: §3 (el paso), §3.1 (las fases quedan
 * como compatibilidad), §3.2 (metas por paso) y §3.3 (borrador y publicada).
 *
 * **Sólo un borrador se edita.** Una versión nace `draft` (`createRecipeWithVersion` y `createRecipeVersion`), se le agregan,
 * cambian, quitan y mueven pasos, y `publicarVersion` la pasa a `approved`. Desde ahí no se toca —CLAUDE.md §3: una versión
 * aprobada no se sobreescribe en silencio—: cambiarla es otra versión.
 *
 * **Permiso (V16, 2026-10-04): el del Coffee Process Manager.** Las cinco operaciones que escriben —agregar, actualizar, quitar,
 * mover y publicar— pasan por `exigeAutoriaDeReceta` (`./autoria`, la ÚNICA regla de autoría: `lot:approve_exception` en alguna
 * ubicación de la organización de la receta o con alcance de plataforma; una plantilla —`organizationId` nulo—, sólo con alcance
 * de plataforma). `edit_beneficio` ya no basta, y ya no se pide ningún lote. **Leer** (`pasosDeLaVersion`) lo puede quien puede
 * escribir la receta o quien opera los lotes de su organización (`lot:manage`, lo que pide `getRecipeForEditor`): ver una receta
 * no es configurarla, y el Process Manager no lleva `lot:manage`. **Salvo una receta LIBRE (R24):** es lo que ocurrió en un lote y se
 * lee por él —`lot:view` sobre el lote de cada proceso que la usa—, no por la autoría ni por operar otros lotes de la organización.
 *
 * **Concurrencia (diseño §3.3).** Toda escritura bloquea la fila de la versión con `FOR UPDATE` dentro de su transacción y lee
 * su estado DESPUÉS de bloquearla, así que una edición y una publicación a la vez no se cruzan. Ninguna bloquea un lote: el
 * orden «el linaje primero» de `abrirProceso` (tarea 5) no se puede invertir desde aquí.
 *
 * **Qué ejes admite cada tipo** lo dice `EJES_POR_TIPO_DE_PASO` (`./vocabulario`, tarea 2), que es inferencia de la casa y no
 * del paquete (esqueleto, regla 13): aquí sólo se hace cumplir.
 *
 * **Las hijas del paso se leen y escriben por su clave** (`stepId`, `recipeVersionId`), un modelo cada vez, y no por campos de
 * relación anidados: así este archivo no depende del nombre que la tarea 1 le dio a cada relación en `schema.prisma`.
 */
import { prisma } from "../db";
import type {
  AdditionMoment,
  DryingEnvironment,
  Prisma,
  ProcessPhase,
  ProcessTargetMoment,
  StepEndOperator,
  StepEndRule,
} from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { requireLotAccess, TraceabilityAccessError } from "../traceability/lots";
import { validateTargets } from "../traceability/processTargets";
import { boundsFor } from "../traceability/units";
import { exigeAutoriaDeReceta, puedeAutoriaDeReceta } from "./autoria";
import { RecipeError } from "./errorDeReceta";
import {
  EJES_POR_TIPO_DE_PASO,
  FASE_DEL_TIPO,
  TIPOS_DE_PASO,
  TRAMOS_DE_MUCILAGO,
  type EjeDelPaso,
  type TipoDePaso,
} from "./vocabulario";

type Tx = Prisma.TransactionClient;

/**
 * Una adición del paso: la CATEGORÍA, no el material (decisión de Daniel, 2026-10-03). El material concreto se anota al
 * ejecutar, como consumo de la corrida (`MaterialConsumptionEntry`): un material es de una organización y una plantilla sirve
 * en cualquiera.
 */
export interface AdicionDelPaso {
  /** Un valor de `sustrato_anadido`; en una inoculación, también la cepa de `levadura_cultivo`. */
  categoriaValueId: string;
  /** Cantidad y unidad, las dos o ninguna (el CHECK de la tarea 1 dice lo mismo). */
  cantidad?: number | null;
  unidad?: string | null;
  momento: AdditionMoment;
}

/** Una condición de fin del paso (D2): «humedad ≤ 11,5 %». */
export interface FinDelPaso {
  variable: string;
  operador: StepEndOperator;
  valor: number;
  unidad: string;
  /** La lectura de cierre de la que salió (diseño §5.3, tarea 11): sólo una que alguien MARCÓ como de cierre. */
  desdeLecturaId?: string | null;
}

/** Una meta del paso (diseño §3.2): las reglas de cualquier meta, sin `phase`, que sale del tipo del paso. */
export interface MetaDelPaso {
  variable: string;
  moment: ProcessTargetMoment;
  unit: string;
  targetValue?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  note?: string | null;
  everyHours?: number | null;
}

/** Lo que se escribe de un paso: sus columnas, con sus adiciones, fines, requisitos y metas (esqueleto, tarea 3). */
export interface PasoEditable {
  /** Un valor del catálogo `tipo_paso`. Lo único obligatorio. */
  stepTypeValueId: string;
  intencion?: string | null;
  opcional?: boolean;
  // Ejes (diseño §3). Cuáles admite cada tipo: `EJES_POR_TIPO_DE_PASO`.
  estadoFrutoValueId?: string | null;
  /**
   * El mucílago que QUEDA, en %: sólo los seis tramos de `TRAMOS_DE_MUCILAGO` (0, 10, 25, 50, 75, 100). **0 = Lavado, 100 = Honey**
   * (decisión de Daniel, 2026-10-03, que corrige la base «quitado» de ADR-181 #12; Ruling M; el mismo campo que la 2b §8.2).
   */
  mucilagoObjetivo?: number | null;
  oxigenoValueId?: string | null;
  temperaturaValueId?: string | null;
  temperaturaMinC?: number | null;
  temperaturaMaxC?: number | null;
  fuenteMicrobianaValueId?: string | null;
  medioValueId?: string | null;
  fisicoValueId?: string | null;
  modoSecado?: DryingEnvironment | null;
  // Valores por defecto. El volteo y la banda de humedad, sólo en un paso de secado.
  horasMin?: number | null;
  horasSugeridas?: number | null;
  horasMax?: number | null;
  volteoCadaHoras?: number | null;
  humedadMinPct?: number | null;
  humedadMaxPct?: number | null;
  // Fin (D2).
  finPorTiempo?: boolean;
  reglaDeFin?: StepEndRule;
  adiciones?: readonly AdicionDelPaso[];
  fines?: readonly FinDelPaso[];
  /** Valores del catálogo `capacidad`, para la 2c: la 2a los guarda y no los comprueba (decisión de Daniel, 2026-10-03). */
  capacidadesRequeridas?: readonly string[];
  metas?: readonly MetaDelPaso[];
}

/** Un `PasoEditable` con todo dicho: lo que no llegó es nulo, falso o una lista vacía. */
type PasoCompleto = { [K in keyof PasoEditable]-?: Exclude<PasoEditable[K], undefined> };

/** Un paso tal como lo lee la pantalla: en números (no `Decimal`), con su lugar y su tipo ya resuelto. */
export type PasoConDetalle = PasoCompleto & { id: string; seq: number; tipo: TipoDePaso };

// ---------------------------------------------------------------------------------------------------------------------------
// De qué vocabulario sale cada dato, y las reglas que no necesitan la base
// ---------------------------------------------------------------------------------------------------------------------------

const CATALOGO_TIPO_PASO = "tipo_paso";
const CATALOGO_CAPACIDAD = "capacidad";

/** De qué catálogo sale cada eje que es un valor de catálogo (diseño §3: los vocabularios que ya existen, más `fisico`). */
const CATALOGO_DEL_CAMPO = {
  estadoFrutoValueId: "estado_cereza",
  oxigenoValueId: "condicion_oxigeno",
  temperaturaValueId: "manejo_temperatura",
  fuenteMicrobianaValueId: "fuente_microbiana",
  medioValueId: "medio_lavado",
  fisicoValueId: "fisico",
} as const;

/** A qué eje (`EjeDelPaso`) pertenece cada columna de eje del paso. Las adiciones son el eje `adiciones`. */
const EJE_DEL_CAMPO = {
  estadoFrutoValueId: "estadoFruto",
  mucilagoObjetivo: "mucilagoObjetivo",
  oxigenoValueId: "oxigeno",
  temperaturaValueId: "temperatura",
  temperaturaMinC: "temperatura",
  temperaturaMaxC: "temperatura",
  fuenteMicrobianaValueId: "fuenteMicrobiana",
  medioValueId: "medio",
  fisicoValueId: "fisico",
  modoSecado: "modoSecado",
} as const satisfies Partial<Record<keyof PasoEditable, EjeDelPaso>>;

/**
 * La categoría de una adición: de `sustrato_anadido`, y la cepa de `levadura_cultivo` sólo en una inoculación (decisión de
 * Daniel, 2026-10-03: «y la cepa de levadura_cultivo si es inoculación»).
 */
function catalogosDeAdicion(tipo: TipoDePaso): readonly string[] {
  return tipo === "inoculation" ? ["sustrato_anadido", "levadura_cultivo"] : ["sustrato_anadido"];
}

/**
 * El sitio del paso en la clave de unicidad de sus metas (`validateTargets`). Un paso nuevo no tiene id cuando se valida; la
 * marca sólo se compara consigo misma, así que la unicidad es (variable, momento) dentro del paso.
 */
const ESTE_PASO = "este-paso";

/** Un id de formulario vacío es «no se declaró», no un id. */
function idONulo(valor: string | null | undefined): string | null {
  const v = valor?.trim();
  return v ? v : null;
}

function completar(paso: PasoEditable): PasoCompleto {
  return {
    stepTypeValueId: paso.stepTypeValueId.trim(),
    intencion: paso.intencion?.trim() || null,
    opcional: paso.opcional ?? false,
    estadoFrutoValueId: idONulo(paso.estadoFrutoValueId),
    mucilagoObjetivo: paso.mucilagoObjetivo ?? null,
    oxigenoValueId: idONulo(paso.oxigenoValueId),
    temperaturaValueId: idONulo(paso.temperaturaValueId),
    temperaturaMinC: paso.temperaturaMinC ?? null,
    temperaturaMaxC: paso.temperaturaMaxC ?? null,
    fuenteMicrobianaValueId: idONulo(paso.fuenteMicrobianaValueId),
    medioValueId: idONulo(paso.medioValueId),
    fisicoValueId: idONulo(paso.fisicoValueId),
    modoSecado: paso.modoSecado ?? null,
    horasMin: paso.horasMin ?? null,
    horasSugeridas: paso.horasSugeridas ?? null,
    horasMax: paso.horasMax ?? null,
    volteoCadaHoras: paso.volteoCadaHoras ?? null,
    humedadMinPct: paso.humedadMinPct ?? null,
    humedadMaxPct: paso.humedadMaxPct ?? null,
    finPorTiempo: paso.finPorTiempo ?? false,
    reglaDeFin: paso.reglaDeFin ?? "first",
    adiciones: (paso.adiciones ?? []).map((a) => ({
      categoriaValueId: a.categoriaValueId.trim(),
      cantidad: a.cantidad ?? null,
      unidad: a.unidad?.trim() || null,
      momento: a.momento,
    })),
    fines: (paso.fines ?? []).map((f) => ({ ...f, desdeLecturaId: idONulo(f.desdeLecturaId) })),
    // Un conjunto: la misma capacidad dos veces sería la misma fila (`@@id([stepId, capacidadValueId])`).
    capacidadesRequeridas: [...new Set((paso.capacidadesRequeridas ?? []).map((c) => c.trim()).filter((c) => c !== ""))],
    metas: paso.metas ?? [],
  };
}

/**
 * Las reglas de un paso que no necesitan la base: si cada dato le corresponde al tipo, y si cada número es posible. Las que
 * repiten un CHECK de la tarea 1 están aquí para que el rechazo salga con una frase y no como una restricción ilegible.
 */
function validarPaso(tipo: TipoDePaso, paso: PasoCompleto): void {
  // §3.5: un eje que el tipo no admite no se guarda: sería un dato que ninguna pantalla pinta y ningún lector entiende.
  const ejes: readonly EjeDelPaso[] = EJES_POR_TIPO_DE_PASO[tipo];
  for (const [campo, eje] of Object.entries(EJE_DEL_CAMPO) as [keyof typeof EJE_DEL_CAMPO, EjeDelPaso][]) {
    if (paso[campo] != null && !ejes.includes(eje)) throw new RecipeError("eje_no_aplica");
  }
  if (paso.adiciones.length > 0 && !ejes.includes("adiciones")) throw new RecipeError("eje_no_aplica");

  // I9: **`NaN` compara falso con todo**, así que `t < min || t > max` lo deja pasar: la temperatura es donde se colaba, y una
  // cantidad infinita pasa `cantidad > 0` y revienta después, en la base (`numeric(12,4)`). Las horas y las humedades ya fallaban
  // cerradas (`!(h > 0)`, `!(v > 0 && v <= 100)`): la prueba hostil de este paso fija las cuatro familias, no sólo las dos
  // que se arreglan aquí.
  const noFinito = (n: number | null | undefined) => n != null && !Number.isFinite(n);
  if ([paso.temperaturaMinC, paso.temperaturaMaxC].some(noFinito)) throw new RecipeError("rango_invalido");
  if (paso.adiciones.some((a) => noFinito(a.cantidad))) throw new RecipeError("adicion_invalida");

  // Las horas: enteras y mayores que cero —un cero no es «sin dato», para eso está el nulo—, y mínima ≤ sugerida ≤ máxima
  // entre las que se declaren.
  const { horasMin, horasSugeridas, horasMax, volteoCadaHoras } = paso;
  for (const h of [horasMin, horasSugeridas, horasMax, volteoCadaHoras]) {
    if (h != null && !(Number.isInteger(h) && h > 0)) throw new RecipeError("horas_invalidas");
  }
  const declaradas = [horasMin, horasSugeridas, horasMax].filter((h): h is number => h != null);
  for (let i = 1; i < declaradas.length; i++) {
    if (declaradas[i - 1]! > declaradas[i]!) throw new RecipeError("horas_invalidas");
  }
  // D2: «termina al cumplir horasSugeridas desde su inicio». Sin ellas no hay tiempo con el que terminar.
  if (paso.finPorTiempo && horasSugeridas == null) throw new RecipeError("fin_por_tiempo_sin_horas");

  // §3: el volteo y la banda de humedad son del secado; son también lo que `publicarVersion` copia a la fase de secado.
  const { humedadMinPct, humedadMaxPct } = paso;
  if (FASE_DEL_TIPO[tipo] !== "drying" && (volteoCadaHoras != null || humedadMinPct != null || humedadMaxPct != null)) {
    throw new RecipeError("solo_en_secado");
  }
  // La banda: los dos extremos o ninguno, como `validateFases`, porque la fase derivada tiene que cumplir sus mismas reglas.
  if ((humedadMinPct == null) !== (humedadMaxPct == null)) throw new RecipeError("rango_invalido");
  for (const v of [humedadMinPct, humedadMaxPct]) {
    if (v != null && !(v > 0 && v <= 100)) throw new RecipeError("porcentaje_fuera_de_rango");
  }
  if (humedadMinPct != null && humedadMaxPct != null && humedadMinPct > humedadMaxPct) throw new RecipeError("rango_invalido");
  // El mucílago que QUEDA (Ruling M, decisión de Daniel del 2026-10-03): sólo los seis tramos; 0 = Lavado y 100 = Honey son los
  // dos extremos. No es un rango sino una lista —40 es un porcentaje posible y no es un tramo—, y `includes(NaN)` es falso: un
  // `NaN` tampoco pasa. La base dice lo mismo con su CHECK `process_recipe_step_mucilago_en_tramos`; esto es la frase.
  const mucilago = paso.mucilagoObjetivo;
  if (mucilago != null && !(TRAMOS_DE_MUCILAGO as readonly number[]).includes(mucilago)) {
    throw new RecipeError("mucilago_fuera_de_tramos");
  }
  // La temperatura, dentro de lo que una lectura puede valer (`units.ts`), y el mínimo no por encima del máximo.
  const temperatura = boundsFor("temperature");
  for (const t of [paso.temperaturaMinC, paso.temperaturaMaxC]) {
    if (t != null && temperatura && (t < temperatura.min || t > temperatura.max)) throw new RecipeError("rango_invalido");
  }
  if (paso.temperaturaMinC != null && paso.temperaturaMaxC != null && paso.temperaturaMinC > paso.temperaturaMaxC) {
    throw new RecipeError("rango_invalido");
  }

  for (const a of paso.adiciones) {
    if (!a.categoriaValueId) throw new RecipeError("adicion_invalida");
    if ((a.cantidad == null) !== (a.unidad == null)) throw new RecipeError("adicion_invalida");
    if (a.cantidad != null && !(a.cantidad > 0)) throw new RecipeError("adicion_invalida");
    if (a.momento !== "pre_green" && a.momento !== "post_green") throw new RecipeError("adicion_invalida");
  }

  // D2: una condición de fin se compara con lecturas, así que lleva las reglas de una lectura (ADR-100): variable conocida,
  // su unidad canónica y un valor físicamente posible.
  for (const f of paso.fines) {
    const limites = boundsFor(f.variable);
    if (!limites || f.unidad !== limites.canonicalUnit) throw new RecipeError("fin_invalido");
    if (f.operador !== "gte" && f.operador !== "lte") throw new RecipeError("fin_invalido");
    if (!Number.isFinite(f.valor) || f.valor < limites.min || f.valor > limites.max) throw new RecipeError("fin_invalido");
  }

  // I9 (diseño §4.5): lo único que la recepción compara es el Brix al recibir contra la meta de su paso `reception`. Una meta
  // que nadie va a comparar —un pH, un Brix final— quedaría escrita como una promesa que ninguna pantalla cumple.
  if (tipo === "reception" && paso.metas.some((m) => !(m.variable === "brix" && m.moment === "initial"))) {
    throw new RecipeError("meta_de_recepcion_no_se_vigila");
  }

  // §3.2: las metas del paso, con las reglas de cualquier meta.
  if (paso.metas.length > 0) {
    validateTargets(
      paso.metas.map((m) => ({ ...m, recipeStepId: ESTE_PASO })),
      new Set([ESTE_PASO]),
    );
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Las comprobaciones que leen la base, y el permiso
// ---------------------------------------------------------------------------------------------------------------------------

/** El tipo del paso: un valor del catálogo `tipo_paso` que el sistema conoce (`TIPOS_DE_PASO`, tarea 2). */
async function tipoDelPaso(stepTypeValueId: string): Promise<TipoDePaso> {
  const valor = stepTypeValueId
    ? await prisma.variableCatalogValue.findUnique({ where: { id: stepTypeValueId }, include: { catalog: true } })
    : null;
  if (!valor || valor.catalog.key !== CATALOGO_TIPO_PASO || !(TIPOS_DE_PASO as readonly string[]).includes(valor.value)) {
    throw new RecipeError("tipo_de_paso_desconocido");
  }
  return valor.value as TipoDePaso;
}

/**
 * Cuántos eslabones de una cadena de correcciones (`correctsId`) se suben, como máximo, buscando la lectura MARCADA de la que sale un fin
 * (R23, 2026-10-05). El mismo tope que `lecturaVigente` (`lotProcess.ts`) pone al recorrido contrario: `correctMeasurement` sólo corrige lo
 * vigente, así que la cadena es una línea y el servicio no puede escribir un ciclo, pero un recorrido sin tope lo seguiría para siempre si
 * la base trajera uno. Se cuenta desde la lectura citada (nivel 0): con 1000, la marca puede estar a 1000 eslabones por encima de ella.
 */
const TOPE_DE_LA_CADENA_DE_CORRECCIONES = 1000;

/**
 * Cada valor de catálogo del paso, de SU catálogo. La clave ajena sola no basta: un valor de `medio_lavado` en la columna del
 * oxígeno es una FK perfectamente válida (el mismo argumento que `exigeDelCatalogo` en `lotProcess.ts`).
 *
 * Y un fin que dice salir de una lectura tiene que salir de una lectura MARCADA como de cierre (diseño §5.3) o de la CORRECCIÓN de una
 * marcada (R23): nunca se deduce un umbral de una lectura que nadie marcó. La marca es un acto de quien cerró, sobre la lectura que
 * entonces valía, y una lectura marcada se puede corregir después; el fin que propone `convertirLibre` (tarea 11) cita la VIGENTE de la
 * marca (R4), que es esa corrección y no está marcada en ninguna parte. Por eso se SUBE por `correctsId` desde la lectura citada y vale el
 * primer eslabón marcado que se encuentre —ella misma, o una de las que corrigió; la marca puede estar en la raíz o en un eslabón de en
 * medio—, con un tope. **Sólo se sube:** la raíz que una marca sustituyó no es la marcada ni una corrección de ella, y la corrección de
 * una lectura que nadie marcó no se vuelve «de cierre» por serlo. De quién es la lectura citada y quién la puede ver no se decide aquí
 * —esta función no recibe cuenta ni organización, y conserva su firma `(tipo, paso)` porque otros la reusan—: lo decide
 * `exigeLecturasDelPaso`, más abajo, sobre la lectura CITADA (la corrección, que lleva el lote de su original; no la marcada), y la
 * llaman `agregarPaso` y `actualizarPaso` justo después de ésta.
 */
async function exigeValoresDelPaso(tipo: TipoDePaso, paso: PasoCompleto): Promise<void> {
  const pedidos: [string, readonly string[]][] = [];
  for (const [campo, catalogo] of Object.entries(CATALOGO_DEL_CAMPO) as [keyof typeof CATALOGO_DEL_CAMPO, string][]) {
    const id = paso[campo];
    if (id) pedidos.push([id, [catalogo]]);
  }
  for (const a of paso.adiciones) pedidos.push([a.categoriaValueId, catalogosDeAdicion(tipo)]);
  for (const c of paso.capacidadesRequeridas) pedidos.push([c, [CATALOGO_CAPACIDAD]]);
  if (pedidos.length > 0) {
    const valores = await prisma.variableCatalogValue.findMany({
      where: { id: { in: [...new Set(pedidos.map(([id]) => id))] } },
      select: { id: true, catalog: { select: { key: true } } },
    });
    const catalogoDe = new Map(valores.map((v) => [v.id, v.catalog.key]));
    for (const [id, admitidos] of pedidos) {
      const clave = catalogoDe.get(id);
      if (!clave || !admitidos.includes(clave)) throw new RecipeError("valor_de_otro_catalogo");
    }
  }

  const lecturas = [...new Set(paso.fines.map((f) => f.desdeLecturaId).filter((id): id is string => id != null))];
  for (const citada of lecturas) {
    // R23: se sube por `correctsId` hasta el primer eslabón marcado. Sin corrección más arriba (`correctsId` nulo) o sin lectura (un id que no
    // existe) la cadena se acaba y no hay marca; con el tope, también.
    let eslabon: string | null = citada;
    let hayMarca = false;
    for (let nivel = 0; eslabon !== null && nivel <= TOPE_DE_LA_CADENA_DE_CORRECCIONES; nivel++) {
      const marca = await prisma.processStepClosingReading.findFirst({ where: { measurementId: eslabon }, select: { measurementId: true } });
      if (marca) {
        hayMarca = true;
        break;
      }
      const lectura: { correctsId: string | null } | null = await prisma.measurement.findUnique({
        where: { id: eslabon },
        select: { correctsId: true },
      });
      eslabon = lectura?.correctsId ?? null;
    }
    if (!hayMarca) throw new RecipeError("lectura_no_marcada");
  }
}

/**
 * De dónde salen los fines del paso, en cuanto a QUIÉN (R6, revisión del 2026-10-05; diseño §5.3). La marca de `exigeValoresDelPaso`
 * dice que una lectura es de cierre, no de quién es ni quién la puede ver: sin esto, una receta atribuiría su umbral a la evidencia
 * de otra organización —y, con la clave ajena `RESTRICT` de `desde_lectura_id`, impediría borrarla—. Un fin sólo cita una lectura
 * de un lote de la organización de la receta, y que quien escribe puede ver (`lot:view`; el Coffee Process Manager no lo lleva, así
 * que sólo cita quien además ve ese lote).
 *
 * - **Una plantilla** (organización nula) sirve en cualquier organización: no cita lecturas de ningún lote, ni las que ya cite.
 * - **Lo que el MISMO paso ya cita** no se vuelve a autorizar al actualizarlo (`yaCitadas`): entró con permiso, o lo escribió la
 *   conversión de una Libre, que autoriza por su cuenta; y quien edita el resto del paso suele ser un Process Manager sin
 *   `lot:view`, al que exigírselo otra vez le impediría guardar un paso que cita una lectura. Una lectura NUEVA sí se autoriza.
 * - **Un solo código para todo lo demás** (`lectura_no_marcada`): no se dice si el id existe en otra organización o en un lote
 *   que quien escribe no ve. Quien pregunta no se entera de más que «esa no».
 * - **La lectura que se mira es la CITADA** (R23): si es la corrección de una marcada, su lote es el de su original (`correctMeasurement` copia
 *   `lotId`), así que el control es el mismo que para la marcada; no hace falta subir la cadena otra vez.
 * - **Una vez por lote**: `requireLotAccess` es un «O» entre sus candidatos, y pasarle varios autorizaría a quien ve uno solo.
 */
async function exigeLecturasDelPaso(
  userAccountId: string,
  organizationId: string | null,
  paso: PasoCompleto,
  yaCitadas: ReadonlySet<string>,
): Promise<void> {
  const citadas = [...new Set(paso.fines.map((f) => f.desdeLecturaId).filter((id): id is string => id != null))];
  if (citadas.length === 0) return;
  if (organizationId === null) throw new RecipeError("lectura_no_marcada");
  const nuevas = citadas.filter((id) => !yaCitadas.has(id));
  if (nuevas.length === 0) return;
  const lecturas = await prisma.measurement.findMany({
    where: { id: { in: nuevas } },
    select: { id: true, lot: { select: { organizationId: true, projectId: true, locationId: true, classification: true } } },
  });
  const loteDe = new Map(lecturas.map((l) => [l.id, l.lot]));
  for (const id of nuevas) {
    const lote = loteDe.get(id) ?? null;
    if (lote === null || lote.organizationId !== organizationId) throw new RecipeError("lectura_no_marcada");
    try {
      await requireLotAccess(userAccountId, "view", [lote]);
    } catch (error) {
      if (error instanceof TraceabilityAccessError) throw new RecipeError("lectura_no_marcada");
      throw error;
    }
  }
}

/** Las lecturas que un paso YA cita en sus fines: lo que `exigeLecturasDelPaso` no vuelve a autorizar al actualizarlo. */
async function lecturasQueElPasoYaCita(stepId: string): Promise<Set<string>> {
  const fines = await prisma.processRecipeStepEnd.findMany({
    where: { stepId, desdeLecturaId: { not: null } },
    select: { desdeLecturaId: true },
  });
  return new Set(fines.map((f) => f.desdeLecturaId).filter((id): id is string => id != null));
}

/**
 * Quién LEE los pasos de una receta que NO es Libre: quien puede escribirla (V16: el Coffee Process Manager, que no lleva `lot:manage`) o
 * quien opera los lotes de su organización (`lot:manage`: lo que pide hoy el editor, `getRecipeForEditor`). Ver una receta no es
 * configurarla.
 *
 * **Basta con gestionar AL MENOS UN lote** de la organización de la receta —de cualquier organización, si es una plantilla, que sirve en
 * todas (reconocimiento u1, S11)—. Antes se miraba UN lote cualquiera (`findFirst` sin orden) y la respuesta dependía del orden físico de
 * las filas: un Farm Manager que gestiona sólo uno de los dos lotes de su organización leía o no según cuál saliera primero, y una
 * plantilla se leía contra el primer lote de toda la base (H3, revisión de la tarea 3). Aquí el «O» de `requireLotAccess` es lo que se
 * quiere (su comentario lo explica: pasa en cuanto UNO de los candidatos pasa), y los candidatos son las combinaciones DISTINTAS de
 * (proyecto, ubicación, clasificación), que es lo único que esa comprobación mira de un lote: son pocas (7 sobre 108 lotes, medido el
 * 2026-10-06 en la copia local) y no dependen del orden de nada. Sin ningún lote al que mirar, `organizacion_sin_lotes` —un
 * `RecipeError`, con su texto—: el de las lecturas viejas, `organization_has_no_lots`, es un `ProcessTargetError` sin frase propia.
 * **Una receta Libre no pasa por aquí** (R24): `pasosDeLaVersion` la manda antes a `exigeVerLosLotesDeLaLibre`, porque una Libre se lee
 * por su lote y no por la autoría.
 */
async function exigeLecturaDeLosPasos(userAccountId: string, organizationId: string | null): Promise<void> {
  if (await puedeAutoriaDeReceta(userAccountId, organizationId)) return;
  const candidatos = await prisma.lot.findMany({
    where: organizationId === null ? {} : { organizationId },
    select: { projectId: true, locationId: true, classification: true },
    distinct: ["projectId", "locationId", "classification"],
  });
  if (candidatos.length === 0) throw new RecipeError("organizacion_sin_lotes");
  await requireLotAccess(userAccountId, "manage", candidatos);
}

/**
 * Quién LEE los pasos de una receta LIBRE (R24, revisión del 2026-10-05: el R8 de la tarea 14 quedaba incompleto por esta otra puerta). Una
 * Libre es lo que ocurrió en un lote (diseño §5.2): su nombre lleva el código del lote y cada paso, la `intencion` que escribió el operario.
 * Se lee por el lote, no por la autoría: **`lot:view` sobre el lote de cada proceso que usa su versión**, y a nadie más —ni al Coffee
 * Process Manager que sólo escribe recetas (no lleva `lot:view`), ni a quien opera otros lotes de la organización—. Es la regla con la que
 * `getRecipeForEditor` (tarea 14) abre la misma receta: la misma pregunta en las dos puertas.
 *
 * - Se pregunta por la VERSIÓN —«qué procesos usan esta receta»—, no por el lote («qué proceso cubre a este lote» es del resolvedor).
 * - **Lote por lote**: `requireLotAccess` es un «O» entre sus candidatos y pasarle varios autorizaría a quien ve uno solo. Si una división
 *   copió la versión a dos lotes, quien ve uno no la lee.
 * - **Una Libre que ningún proceso usa no se abre a nadie**, tampoco al administrador: no hay lote por el que autorizar. No debería existir
 *   —la Libre nace con el proceso que la abre— y, ante la duda, se cierra.
 */
async function exigeVerLosLotesDeLaLibre(userAccountId: string, recipeVersionId: string): Promise<void> {
  const usos = await prisma.lotProcess.findMany({
    where: { processRecipeVersionId: recipeVersionId },
    select: { lot: { select: { id: true, projectId: true, locationId: true, classification: true } } },
  });
  const lotes = [...new Map(usos.map((u) => [u.lot.id, u.lot] as const)).values()];
  if (lotes.length === 0) throw new TraceabilityAccessError("no_lot_access");
  for (const lote of lotes) await requireLotAccess(userAccountId, "view", [lote]);
}

/** La versión, después de comprobar que quien escribe puede configurar su receta. */
async function versionParaEscribir(userAccountId: string, recipeVersionId: string) {
  const version = await prisma.processRecipeVersion.findUnique({ where: { id: recipeVersionId }, include: { recipe: true } });
  if (!version) throw new RecipeError("version_no_encontrada");
  await exigeAutoriaDeReceta(userAccountId, version.recipe.organizationId);
  return version;
}

/** El paso, después de comprobar que quien escribe puede configurar su receta. */
async function pasoParaEscribir(userAccountId: string, stepId: string) {
  const paso = await prisma.processRecipeStep.findUnique({ where: { id: stepId }, select: { id: true, recipeVersionId: true } });
  if (!paso) throw new RecipeError("paso_no_encontrado");
  const version = await versionParaEscribir(userAccountId, paso.recipeVersionId);
  return { ...paso, organizationId: version.recipe.organizationId };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Dentro de la transacción. Las funciones que reciben `tx` van SIN tipo de retorno escrito: es la única firma que
// `tests/arquitectura/audit-atomico.test.ts` reconoce sin desajustar su rastreador de rangos (sus puntos ciegos declarados).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Diseño §3.3: la fila de la versión en `FOR UPDATE`, y su estado leído DESPUÉS de bloquearla. Leído antes, dos peticiones a la
 * vez verían las dos un borrador, y las dos lo cambiarían.
 */
async function bloquearBorrador(tx: Tx, recipeVersionId: string) {
  await tx.$queryRaw`SELECT id FROM traceability.process_recipe_version WHERE id = ${recipeVersionId}::uuid FOR UPDATE`;
  const version = await tx.processRecipeVersion.findUnique({ where: { id: recipeVersionId }, select: { status: true } });
  if (!version) throw new RecipeError("version_no_encontrada");
  if (version.status !== "draft") throw new RecipeError("version_no_es_borrador");
}

async function idsEnOrden(tx: Tx, recipeVersionId: string) {
  return tx.processRecipeStep.findMany({ where: { recipeVersionId }, orderBy: { seq: "asc" }, select: { id: true, seq: true } });
}

/**
 * Aparta los pasos de la versión a `seq + 1000000` antes de colocarlos. `@@unique([recipeVersionId, seq])` no es diferible y
 * Postgres lo comprueba fila a fila: renumerar en sitio (el 2 al 3 con el 3 todavía ahí) choca. Apartados, ningún número de
 * 1..n está ocupado, y `colocar` deja cada paso en el suyo.
 */
async function apartar(tx: Tx, recipeVersionId: string) {
  await tx.$executeRaw`UPDATE traceability.process_recipe_step SET seq = seq + 1000000 WHERE recipe_version_id = ${recipeVersionId}::uuid`;
}

async function colocar(tx: Tx, ids: readonly string[]) {
  for (const [i, id] of ids.entries()) {
    await tx.processRecipeStep.update({ where: { id }, data: { seq: i + 1 } });
  }
}

function columnas(paso: PasoCompleto) {
  return {
    stepTypeValueId: paso.stepTypeValueId,
    intencion: paso.intencion,
    opcional: paso.opcional,
    estadoFrutoValueId: paso.estadoFrutoValueId,
    mucilagoObjetivo: paso.mucilagoObjetivo,
    oxigenoValueId: paso.oxigenoValueId,
    temperaturaValueId: paso.temperaturaValueId,
    temperaturaMinC: paso.temperaturaMinC,
    temperaturaMaxC: paso.temperaturaMaxC,
    fuenteMicrobianaValueId: paso.fuenteMicrobianaValueId,
    medioValueId: paso.medioValueId,
    fisicoValueId: paso.fisicoValueId,
    modoSecado: paso.modoSecado,
    horasMin: paso.horasMin,
    horasSugeridas: paso.horasSugeridas,
    horasMax: paso.horasMax,
    volteoCadaHoras: paso.volteoCadaHoras,
    humedadMinPct: paso.humedadMinPct,
    humedadMaxPct: paso.humedadMaxPct,
    finPorTiempo: paso.finPorTiempo,
    reglaDeFin: paso.reglaDeFin,
  };
}

/** Las hijas del paso. Sus metas, con el paso y la fase de su tipo (diseño §3.2): nula si el tipo no tiene fase. */
async function escribirHijos(tx: Tx, recipeVersionId: string, stepId: string, tipo: TipoDePaso, paso: PasoCompleto) {
  if (paso.adiciones.length > 0) {
    await tx.processRecipeStepAddition.createMany({
      data: paso.adiciones.map((a) => ({
        stepId,
        categoriaValueId: a.categoriaValueId,
        cantidad: a.cantidad ?? null,
        unidad: a.unidad ?? null,
        momento: a.momento,
      })),
    });
  }
  if (paso.fines.length > 0) {
    await tx.processRecipeStepEnd.createMany({
      data: paso.fines.map((f) => ({
        stepId,
        variable: f.variable,
        operador: f.operador,
        valor: f.valor,
        unidad: f.unidad,
        desdeLecturaId: f.desdeLecturaId ?? null,
      })),
    });
  }
  if (paso.capacidadesRequeridas.length > 0) {
    await tx.processRecipeStepRequirement.createMany({
      data: paso.capacidadesRequeridas.map((capacidadValueId) => ({ stepId, capacidadValueId })),
    });
  }
  if (paso.metas.length > 0) {
    await tx.processTarget.createMany({
      data: paso.metas.map((m, i) => ({
        recipeVersionId,
        recipeStepId: stepId,
        phase: FASE_DEL_TIPO[tipo] ?? null,
        variable: m.variable,
        moment: m.moment,
        unit: m.unit,
        targetValue: m.targetValue ?? null,
        minValue: m.minValue ?? null,
        maxValue: m.maxValue ?? null,
        note: m.note?.trim() || null,
        everyHours: m.everyHours ?? null,
        displayOrder: i,
      })),
    });
  }
}

/**
 * Las hijas del paso, las metas primero: la FK compuesta de la meta a su paso (tarea 1) no se deja a ningún `ON DELETE`, ni
 * las demás, para que quitar un paso no dependa de cómo se declaró cada cascada.
 */
async function borrarHijos(tx: Tx, stepId: string) {
  await tx.processTarget.deleteMany({ where: { recipeStepId: stepId } });
  await tx.processRecipeStepAddition.deleteMany({ where: { stepId } });
  await tx.processRecipeStepEnd.deleteMany({ where: { stepId } });
  await tx.processRecipeStepRequirement.deleteMany({ where: { stepId } });
}

function aNumero(valor: { toNumber(): number } | null): number | null {
  return valor === null ? null : valor.toNumber();
}

/**
 * Los pasos de una versión —o uno solo—, como los lee la pantalla: en `seq`, con su tipo, sus hijas y números. Recibe el `tx`
 * de quien escribe (para el antes y el después de la auditoría) o el cliente global cuando sólo se lee.
 *
 * **El orden dentro de un paso no es semántico: las adiciones son simultáneas y los fines se combinan por `reglaDeFin`.** Se leen por su
 * contenido —el mismo en cada reescritura—, no en el orden en que se escribieron, que no se guarda (H2).
 */
async function leerPasos(db: Tx, recipeVersionId: string, soloStepId?: string) {
  const pasos = await db.processRecipeStep.findMany({
    where: soloStepId ? { recipeVersionId, id: soloStepId } : { recipeVersionId },
    orderBy: { seq: "asc" },
  });
  if (pasos.length === 0) return [];
  const ids = pasos.map((p) => p.id);
  const tipos = await db.variableCatalogValue.findMany({
    where: { id: { in: [...new Set(pasos.map((p) => p.stepTypeValueId))] } },
    select: { id: true, value: true },
  });
  // El orden de las adiciones y de los fines DENTRO de un paso no es semántico —las adiciones son simultáneas y los fines se combinan por
  // `reglaDeFin`—, y no se guarda: cada reescritura borra las filas y crea otras con ids nuevos (UUID al azar), así que ordenar por `id`
  // las devolvía en otro orden del que se escribieron y en otro distinto cada vez. Se leen por su CONTENIDO, que es el mismo en cada
  // reescritura (H2, revisión de la tarea 3); el `id` va al final sólo para desempatar filas idénticas, que no se distinguen por fuera.
  const adiciones = await db.processRecipeStepAddition.findMany({
    where: { stepId: { in: ids } },
    orderBy: [{ categoriaValueId: "asc" }, { momento: "asc" }, { cantidad: "asc" }, { unidad: "asc" }, { id: "asc" }],
  });
  const fines = await db.processRecipeStepEnd.findMany({
    where: { stepId: { in: ids } },
    orderBy: [{ variable: "asc" }, { operador: "asc" }, { valor: "asc" }, { unidad: "asc" }, { desdeLecturaId: "asc" }, { id: "asc" }],
  });
  const requisitos = await db.processRecipeStepRequirement.findMany({
    where: { stepId: { in: ids } },
    orderBy: { capacidadValueId: "asc" },
  });
  const metas = await db.processTarget.findMany({ where: { recipeStepId: { in: ids } }, orderBy: { displayOrder: "asc" } });
  const tipoDe = new Map(tipos.map((t) => [t.id, t.value]));

  return pasos.map((p): PasoConDetalle => {
    const tipo = tipoDe.get(p.stepTypeValueId);
    if (!tipo || !(TIPOS_DE_PASO as readonly string[]).includes(tipo)) throw new RecipeError("tipo_de_paso_desconocido");
    return {
      id: p.id,
      seq: p.seq,
      tipo: tipo as TipoDePaso,
      stepTypeValueId: p.stepTypeValueId,
      intencion: p.intencion,
      opcional: p.opcional,
      estadoFrutoValueId: p.estadoFrutoValueId,
      mucilagoObjetivo: p.mucilagoObjetivo,
      oxigenoValueId: p.oxigenoValueId,
      temperaturaValueId: p.temperaturaValueId,
      temperaturaMinC: aNumero(p.temperaturaMinC),
      temperaturaMaxC: aNumero(p.temperaturaMaxC),
      fuenteMicrobianaValueId: p.fuenteMicrobianaValueId,
      medioValueId: p.medioValueId,
      fisicoValueId: p.fisicoValueId,
      modoSecado: p.modoSecado,
      horasMin: p.horasMin,
      horasSugeridas: p.horasSugeridas,
      horasMax: p.horasMax,
      volteoCadaHoras: p.volteoCadaHoras,
      humedadMinPct: aNumero(p.humedadMinPct),
      humedadMaxPct: aNumero(p.humedadMaxPct),
      finPorTiempo: p.finPorTiempo,
      reglaDeFin: p.reglaDeFin,
      adiciones: adiciones
        .filter((a) => a.stepId === p.id)
        .map((a) => ({ categoriaValueId: a.categoriaValueId, cantidad: aNumero(a.cantidad), unidad: a.unidad, momento: a.momento })),
      fines: fines.filter((f) => f.stepId === p.id).map((f) => ({
        variable: f.variable,
        operador: f.operador,
        valor: f.valor.toNumber(),
        unidad: f.unidad,
        desdeLecturaId: f.desdeLecturaId,
      })),
      capacidadesRequeridas: requisitos.filter((r) => r.stepId === p.id).map((r) => r.capacidadValueId),
      metas: metas
        .filter((m) => m.recipeStepId === p.id)
        .map((m) => ({
          variable: m.variable,
          moment: m.moment,
          unit: m.unit,
          targetValue: aNumero(m.targetValue),
          minValue: aNumero(m.minValue),
          maxValue: aNumero(m.maxValue),
          note: m.note,
          everyHours: m.everyHours,
        })),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Las seis operaciones (esqueleto, tarea 3)
// ---------------------------------------------------------------------------------------------------------------------------

/** Agrega un paso a un borrador detrás del paso `despuesDeSeq`, o el primero con `null`. Los de detrás corren un lugar. */
export async function agregarPaso(
  userAccountId: string,
  input: { recipeVersionId: string; despuesDeSeq: number | null; paso: PasoEditable },
): Promise<{ id: string }> {
  const version = await versionParaEscribir(userAccountId, input.recipeVersionId);
  const paso = completar(input.paso);
  const tipo = await tipoDelPaso(paso.stepTypeValueId);
  validarPaso(tipo, paso);
  await exigeValoresDelPaso(tipo, paso);
  // Un paso NUEVO no cita todavía nada: toda lectura que traiga se autoriza.
  await exigeLecturasDelPaso(userAccountId, version.recipe.organizationId, paso, new Set());

  return prisma.$transaction(async (tx) => {
    await bloquearBorrador(tx, input.recipeVersionId);
    const orden = await idsEnOrden(tx, input.recipeVersionId);
    let posicion = 0;
    if (input.despuesDeSeq !== null) {
      const i = orden.findIndex((p) => p.seq === input.despuesDeSeq);
      if (i < 0) throw new RecipeError("posicion_invalida");
      posicion = i + 1;
    }
    await apartar(tx, input.recipeVersionId);
    const creado = await tx.processRecipeStep.create({
      data: { recipeVersionId: input.recipeVersionId, seq: posicion + 1, ...columnas(paso) },
      select: { id: true },
    });
    await escribirHijos(tx, input.recipeVersionId, creado.id, tipo, paso);
    const ids = orden.map((p) => p.id);
    ids.splice(posicion, 0, creado.id);
    await colocar(tx, ids);
    const [despues] = await leerPasos(tx, input.recipeVersionId, creado.id);
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe_step.create",
        entityType: "process_recipe_step",
        entityId: creado.id,
        after: { recipeVersionId: input.recipeVersionId, ...despues },
        sourceInterface: "recetas.pasos",
      },
      tx,
    );
    return creado;
  });
}

/** Reemplaza las columnas y las hijas de un paso de un borrador. Conserva su lugar. */
export async function actualizarPaso(userAccountId: string, input: { stepId: string; paso: PasoEditable }): Promise<void> {
  const actual = await pasoParaEscribir(userAccountId, input.stepId);
  const paso = completar(input.paso);
  const tipo = await tipoDelPaso(paso.stepTypeValueId);
  validarPaso(tipo, paso);
  await exigeValoresDelPaso(tipo, paso);
  // Lo que el paso ya cita no se autoriza otra vez; una lectura nueva, sí.
  await exigeLecturasDelPaso(userAccountId, actual.organizationId, paso, await lecturasQueElPasoYaCita(input.stepId));

  await prisma.$transaction(async (tx) => {
    await bloquearBorrador(tx, actual.recipeVersionId);
    const [antes] = await leerPasos(tx, actual.recipeVersionId, input.stepId);
    if (!antes) throw new RecipeError("paso_no_encontrado");
    await borrarHijos(tx, input.stepId);
    await tx.processRecipeStep.update({ where: { id: input.stepId }, data: columnas(paso) });
    await escribirHijos(tx, actual.recipeVersionId, input.stepId, tipo, paso);
    const [despues] = await leerPasos(tx, actual.recipeVersionId, input.stepId);
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe_step.update",
        entityType: "process_recipe_step",
        entityId: input.stepId,
        before: { recipeVersionId: actual.recipeVersionId, ...antes },
        after: { recipeVersionId: actual.recipeVersionId, ...despues },
        sourceInterface: "recetas.pasos",
      },
      tx,
    );
  });
}

/** Quita un paso de un borrador, con sus hijas. Los de detrás suben un lugar. */
export async function quitarPaso(userAccountId: string, stepId: string): Promise<void> {
  const actual = await pasoParaEscribir(userAccountId, stepId);

  await prisma.$transaction(async (tx) => {
    await bloquearBorrador(tx, actual.recipeVersionId);
    const [antes] = await leerPasos(tx, actual.recipeVersionId, stepId);
    if (!antes) throw new RecipeError("paso_no_encontrado");
    await borrarHijos(tx, stepId);
    await tx.processRecipeStep.delete({ where: { id: stepId } });
    const quedan = await idsEnOrden(tx, actual.recipeVersionId);
    await apartar(tx, actual.recipeVersionId);
    await colocar(tx, quedan.map((p) => p.id));
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe_step.delete",
        entityType: "process_recipe_step",
        entityId: stepId,
        before: { recipeVersionId: actual.recipeVersionId, ...antes },
        sourceInterface: "recetas.pasos",
      },
      tx,
    );
  });
}

/** Lleva un paso de un borrador al lugar `aSeq` (de 1 a n); los demás se corren. */
export async function moverPaso(userAccountId: string, input: { stepId: string; aSeq: number }): Promise<void> {
  const actual = await pasoParaEscribir(userAccountId, input.stepId);

  await prisma.$transaction(async (tx) => {
    await bloquearBorrador(tx, actual.recipeVersionId);
    const orden = await idsEnOrden(tx, actual.recipeVersionId);
    const desde = orden.findIndex((p) => p.id === input.stepId);
    if (desde < 0) throw new RecipeError("paso_no_encontrado");
    if (!Number.isInteger(input.aSeq) || input.aSeq < 1 || input.aSeq > orden.length) throw new RecipeError("posicion_invalida");
    const ids = orden.map((p) => p.id);
    ids.splice(desde, 1);
    ids.splice(input.aSeq - 1, 0, input.stepId);
    await apartar(tx, actual.recipeVersionId);
    await colocar(tx, ids);
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe_step.move",
        entityType: "process_recipe_step",
        entityId: input.stepId,
        before: { recipeVersionId: actual.recipeVersionId, seq: orden[desde]!.seq },
        after: { recipeVersionId: actual.recipeVersionId, seq: input.aSeq },
        sourceInterface: "recetas.pasos",
      },
      tx,
    );
  });
}

/**
 * Publica un borrador: pasa a `approved`, y desde ahí no se edita (diseño §3.3).
 *
 * **Sin pasos no se publica** (I9, `version_sin_pasos`): desde la 2a toda versión nueva se publica con pasos, porque son lo que
 * dice la receta. Las `approved` de antes no se tocan: sus fases siguen sirviendo a los lectores antiguos.
 *
 * **Diseño §3.1:** las fases de la versión se DERIVAN de los pasos —una por fase, del PRIMER paso de esa fase en `seq`, según
 * `FASE_DEL_TIPO`— y reemplazan a las que hubiera: existen sólo para los lectores que todavía leen fases (la cola de secado y
 * el tablero hasta la tarea 9, y las corridas sin paso).
 *
 * No escribe `ProcessRecipeVersion.expectedHours` (el §3.1 lo pedía): el registro del plan lo descartó el 2026-10-03 porque
 * ningún lector del lote lo usa.
 */
export async function publicarVersion(userAccountId: string, recipeVersionId: string): Promise<void> {
  await versionParaEscribir(userAccountId, recipeVersionId);

  await prisma.$transaction(async (tx) => {
    await bloquearBorrador(tx, recipeVersionId);
    const antes = await tx.processRecipeVersion.findUniqueOrThrow({ where: { id: recipeVersionId }, include: { fases: true } });

    const pasos = await leerPasos(tx, recipeVersionId);
    if (pasos.length === 0) throw new RecipeError("version_sin_pasos");
    const primeroDeCadaFase = new Map<ProcessPhase, PasoConDetalle>();
    for (const p of pasos) {
      const fase = FASE_DEL_TIPO[p.tipo];
      if (fase && !primeroDeCadaFase.has(fase)) primeroDeCadaFase.set(fase, p);
    }
    await tx.processRecipePhase.deleteMany({ where: { recipeVersionId } });
    for (const [phase, p] of primeroDeCadaFase) {
      // `validarPaso` sólo deja volteo y banda de humedad en un paso de secado: en la fase de fermentación salen nulos.
      await tx.processRecipePhase.create({
        data: {
          recipeVersionId,
          phase,
          expectedHours: p.horasSugeridas,
          turnEveryHours: p.volteoCadaHoras,
          targetMoistureMinPct: p.humedadMinPct,
          targetMoistureMaxPct: p.humedadMaxPct,
        },
      });
    }

    const despues = await tx.processRecipeVersion.update({
      where: { id: recipeVersionId },
      data: { status: "approved" },
      include: { fases: true },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe_version.publish",
        entityType: "process_recipe_version",
        entityId: recipeVersionId,
        before: antes,
        after: despues,
        sourceInterface: "recetas.pasos",
      },
      tx,
    );
  });
}

/**
 * Los pasos de una versión, en orden, con sus hijas. Lo lee quien puede escribir la receta o quien opera los lotes de su
 * organización (`exigeLecturaDeLosPasos`): ver una receta no es configurarla. **Una receta LIBRE se lee por su lote (R24):** quien ve
 * el lote de cada proceso que la usa, y nadie más (`exigeVerLosLotesDeLaLibre`).
 */
export async function pasosDeLaVersion(userAccountId: string, recipeVersionId: string): Promise<PasoConDetalle[]> {
  const version = await prisma.processRecipeVersion.findUnique({ where: { id: recipeVersionId }, include: { recipe: true } });
  if (!version) throw new RecipeError("version_no_encontrada");
  if (version.recipe.esLibre) {
    await exigeVerLosLotesDeLaLibre(userAccountId, version.id);
    return leerPasos(prisma, version.id);
  }
  await exigeLecturaDeLosPasos(userAccountId, version.recipe.organizationId);
  return leerPasos(prisma, recipeVersionId);
}
