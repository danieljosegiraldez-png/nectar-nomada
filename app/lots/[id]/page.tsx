import { CampoNumerico } from "../../components/CampoNumerico";
import { DESENLACES_DEL_SECADO } from "../../beneficio/bandejas/errorDeSecado";
import { instrumentosParaMedicion } from "../../../lib/equipos/equipos";
import { inspeccionesParaMedicion } from "../../../lib/traceability/measurements";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { rotuloDeVersion } from "../../../lib/recetas/rotuloDeVersion";
import { mostrarInstante, mostrarFecha } from "../../../lib/time/mostrarInstante";
import { ubicacionesEmparentadas } from "../../../lib/traceability/ubicacionesEmparentadas";
import { intervencionesVigentes } from "../../../lib/traceability/intervenciones";
import { carenciaDeIntervencion } from "../../../lib/traceability/carenciaDeIntervencion";
import { difierenMarcasDeCarencia } from "../../../lib/traceability/difierenMarcasDeCarencia";
import { textoDeObjetivoDeManejo as textoDeObjetivoDeManejoDe } from "../../components/traceability/etiquetasDeManejo";
import { getCurrentUser } from "../../../lib/auth/session";
import {
  getLotDetail,
  getObserverCandidates,
  getManageableContext,
  puedeGestionarLote,
  TraceabilityAccessError,
} from "../../../lib/traceability/lots";
import { puedeGestionarAtributosDeUbicacion } from "../../../lib/traceability/locations";
import { computeCurrentQuantity } from "../../../lib/traceability/quantity";
import { nextActionFor, sugerenciaOfrecida, type BatchAction } from "../../../lib/traceability/batchActions";
import { veredictoDelLote } from "../../../lib/beneficio/desdeElLote";
import { entradaDelLote } from "../../../lib/beneficio/entradaDelLote";
import { faseDelLote } from "../../../lib/beneficio/reposo";
import { estadosDeInstrumentoPorMedicion } from "../../../lib/equipos/equipos";
import type { EstadoDeVerificacion } from "../../../lib/equipos/verificacion";
import {
  coberturaDelLote,
  puedeAbrirProceso,
  puedeEmpezarCorrida,
  LotProcessError,
  type CoberturaDelLote,
  type MotivoParaNoAbrir,
  type MotivoParaNoEmpezar,
} from "../../../lib/traceability/lotProcess";
import { VeredictoDeBeneficio } from "../../components/traceability/VeredictoDeBeneficio";
import { compareRunToTargets } from "../../../lib/traceability/processTargets";
import { TargetComparisonTable } from "../../components/traceability/TargetComparisonTable";
import { getSignedUrlForAsset } from "../../../lib/traceability/media";
import { detalleDeRecepciones, origenDelLote } from "../../../lib/traceability/lotesDeBeneficio";
import { veredictoDeCalidadDelLote } from "../../../lib/traceability/veredictoDelLote";
import { bandejasDeCorrida, bandejasDisponibles, posicionesParaMover } from "../../../lib/traceability/bandejasDelSecado";
import { BandejasDelSecado } from "../../components/traceability/BandejasDelSecado";
import {
  recordFermentationInterventionFormAction,
  endFermentationFormAction,
  recordDryingTurnFormAction,
  endDryingFormAction,
} from "../../actions/traceability";
import { MeasurementForm } from "../../components/traceability/MeasurementForm";
import { MeasurementCorrectionForm } from "../../components/traceability/MeasurementCorrectionForm";
import { PhotoUploadForm } from "../../components/traceability/PhotoUploadForm";
import { LabourEntryForm } from "../../components/traceability/LabourEntryForm";
import { MaterialConsumptionForm } from "../../components/traceability/MaterialConsumptionForm";
import { SelectionForm } from "../../components/traceability/SelectionForm";
import { getSelectionCatalogs, getSelectionOutturn, codigosYaDerivadosDe } from "../../../lib/traceability/selection";
import { clasificacionDeLote } from "../../../lib/traceability/clasificacionVerde";
import { ClasificacionPorMalla } from "../../components/traceability/ClasificacionPorMalla";
import { getPerfilDeTuesteElegido } from "../../../lib/traceability/roasting";
import { listRecipeVersionsForLot } from "../../../lib/traceability/processTargets";
import { PerfilOptimoForm } from "../../components/traceability/PerfilOptimoForm";
import { getHarvestSourceContext } from "../../../lib/traceability/plantingCohorts";
import { HarvestSourcesForm } from "../../components/traceability/HarvestSourcesForm";
import type { LabourEntry } from "../../../generated/prisma/client";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { DividirMielForm, EnvasarMielForm, ProcesarMielForm } from "../../components/apiary/PasosDeMielForm";
import { AnularAsignacionForm, AsignarATiendaForm } from "../../components/commerce/TiendaForms";
import { asignacionesDeLote, variantesParaAsignar } from "../../../lib/commerce/tienda";
import { DRYING_OUTPUT_LOT_TYPES } from "../../../lib/traceability/drying";

export const dynamic = "force-dynamic";

const FERMENTATION_INTERVENTION_TYPES = ["inoculation", "agitation", "purge", "addition", "sample", "transfer", "termination", "other"] as const;
const DRYING_TURN_TYPES = ["turned", "covered", "uncovered", "other"] as const;
const LOT_TYPES = ["cherry", "processing", "drying", "parchment", "dry_cherry", "green", "roast", "sample", "other"] as const;

export default async function LotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[]; ok?: string | string[] }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  const tMiel = await getTranslations("Apiary");
  const tTienda = await getTranslations("Tienda");
  const tb = await getTranslations("BandejasDelSecado");
  // `endDryingFormAction` (app/actions/traceability.ts) redirige aquí con
  // `?error=<código>` cuando una bandeja cargada entre que se pintó la página
  // y se envió el cierre convierte el rechazo en `BandejaError` (A4, ajustes.md).
  // `tb.has` evita traducir un código arbitrario de la URL: sin él, un código
  // que no exista en ningún idioma haría que `next-intl` reventara al pintar.
  //
  // Y `?ok=<código>` para confirmar lo que acaba de entrar. `registrarInspeccionFormAction`
  // redirigía aquí con `?ok=inspeccion` desde que existe, y **esta página no leía `ok`**: la
  // confirmación no se vio nunca. Medido el 2026-09-28 recorriendo la interfaz; catorce pantallas
  // de la casa ya lo leen y ésta era la excepción. Se normaliza igual que el error porque un
  // parámetro repetido en la URL llega como array.
  const { error: codigoErrorCrudo, ok: okCrudo } = await searchParams;
  const codigoError = Array.isArray(codigoErrorCrudo) ? codigoErrorCrudo[0] : codigoErrorCrudo;
  const ok = Array.isArray(okCrudo) ? okCrudo[0] : okCrudo;
  const mensajeDeErrorDeBandeja = codigoError && tb.has(`error_${codigoError}` as "error_sin_acceso")
    ? tb(`error_${codigoError}` as "error_sin_acceso")
    : null;

  let detail;
  try {
    detail = await getLotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  const quantity = await computeCurrentQuantity(user.userAccountId, id);
  // Sólo si este batch nació de una cosecha. Un lote recibido de un tercero no
  // tiene bloques propios que atribuir.
  //
  // **Y sólo si quien mira puede gestionar ese bloque.** `getHarvestSourceContext` exige
  // `location:manage_attributes` sobre el bloque de la cosecha, y lo exige a propósito: una revisión
  // independiente midió que la lectura filtraba el nombre, el cultivar, el peso y las notas de bloques
  // ajenos (ver su comentario en `plantingCohorts.ts`). El permiso está bien; lo que faltaba era la red.
  // Sin ella, un operario legítimamente acotado a su proyecto —sin ámbito de ubicación— recibía un **500
  // en toda la ficha** en vez de la ficha sin ese detalle. Medido el 2026-10-04 en el lote PE-78-B con
  // una cuenta de Farm Operator de ámbito de proyecto: `Error: no_location_attribute_access`, la página
  // entera caída. Es la clase que `CLAUDE.md` ya nombra para las acciones —«una clase de validación
  // nueva que llegue a una acción es un 500»— en una página.
  //
  // El predicado que no lanza ya existía y la página ya lo usaba... DESPUÉS de esta línea, para decidir
  // si pinta el formulario de atribución. Se sube aquí, y se reusa abajo: una sola comprobación.
  const puedeEditarFuentes = detail.harvestEvent
    ? await puedeGestionarAtributosDeUbicacion(user.userAccountId, detail.harvestEvent.locationId)
    : false;
  const harvestSources =
    detail.harvestEvent && puedeEditarFuentes
      ? await getHarvestSourceContext(user.userAccountId, detail.harvestEvent.id)
      : null;
  const { people: observers, selfPersonId } = await getObserverCandidates(user.userAccountId, [{ projectId: detail.lot.projectId, locationId: detail.lot.locationId }]);
  // T12.6: organizations for the labour form's "provided in-kind by" toggle
  // — same convenience-not-security-boundary reasoning as getManageableContext's
  // other dropdowns (lots.ts), reused here rather than a new query.
  const { organizations } = await getManageableContext(user.userAccountId);

  const {
    lot,
    lineage,
    transformations,
    quantityEvents,
    measurements,
    samples,
    fermentationRuns,
    dryingRuns,
    storageAssignments,
    tasks,
    auditEvents,
    sensoryLinkage,
    harvestEvent,
    receivingEvent,
    origenApicola,
    assets,
    labourEntries,
    materialConsumptionEntries,
  } = detail;

  // La página no consultaba NINGÚN permiso de escritura: ofrecía seis botones y
  // 16 formularios a cualquiera que pudiera *ver* el lote. Trazadas las ocho
  // cadenas de servicio, 15 de los 16 exigen `lot:manage` y uno
  // —`HarvestSourcesForm`— exige `location:manage_attributes`; por eso son dos
  // preguntas y no una: colapsarlas escondería el formulario de fuentes a quien
  // sí puede usarlo.
  //
  // Se le pregunta al MISMO guardia que usa la escritura en vez de reimplementar
  // la regla aquí, que es exactamente cómo la pantalla y el servicio acaban
  // discrepando.
  const puedeRegistrar = await puedeGestionarLote(user.userAccountId, lot);

  // De dónde viene la cereza de este lote (spec de la recepción a los lotes §3.2). `origenDelLote`
  // sube por la genealogía hasta los lotes que tienen vínculo con una recepción, así que también
  // responde en un lote de tres transformaciones más abajo. Vacío en todo lo que no nació de una
  // recepción, que es la mayoría de lo que ya existe.
  const origenDeRecepciones = await origenDelLote(lot.id);
  const [detalleDeOrigen, veredictoDeCalidad] = await Promise.all([
    detalleDeRecepciones(origenDeRecepciones.map((o) => o.recepcionId)),
    veredictoDeCalidadDelLote(lot.id),
  ]);

  // Una clave por formulario y por render. El servidor las genera —no el
  // cliente— porque un `crypto.randomUUID()` dentro de un `useState` daría un
  // valor al renderizar en servidor y otro al hidratar. Cambian en cada carga y
  // tras el `revalidatePath` de cada acción, así que un registro legítimo
  // posterior nunca reusa la de antes.
  const clavesDeJornal = {
    harvestEvent: crypto.randomUUID(),
    receivingEvent: crypto.randomUUID(),
    fermentationRun: crypto.randomUUID(),
    dryingRun: crypto.randomUUID(),
  } as const;
  const clavesDeConsumo = {
    fermentationRun: crypto.randomUUID(),
    dryingRun: crypto.randomUUID(),
  } as const;
  const claveDeMedicion = crypto.randomUUID();

  // R1 §4 — el perfil óptimo, sólo para café verde: es el que se tuesta. Se
  // consulta aquí y no dentro del componente para que la página siga siendo la
  // que decide qué se ofrece, como el resto de esta pantalla.
  const esVerde = lot.lotType === "green";
  const perfilElegido = esVerde ? await getPerfilDeTuesteElegido(user.userAccountId, lot.id) : null;
  const perfilesDisponibles =
    esVerde && puedeRegistrar
      ? (await listRecipeVersionsForLot(user.userAccountId, lot.id)).map((v) => ({
          id: v.id,
          label: rotuloDeVersion(v, t),
        }))
      : [];

  // La marca de carencia al cosechar — Tarea 8 fitosanitaria, spec §3.4.
  // `harvestEvent.marcasDeCarencia` (ya en `detail`) es la FOTO de lo que el
  // sistema sabía al cosechar; aquí se recalcula HOY con el mismo cálculo que
  // `recordHarvestEvent` hizo entonces, para poder decir si una corrección
  // posterior lo cambió. Nunca se sobreescribe la foto: sólo se compara.
  const calculoDeCarenciaHoy: { interventionId: string; diasQueFaltaban: number | null }[] = harvestEvent
    ? (
        await intervencionesVigentes(await ubicacionesEmparentadas(harvestEvent.locationId), { hasta: harvestEvent.harvestedAt })
      ).reduce<{ interventionId: string; diasQueFaltaban: number | null }[]>((marcas, i) => {
        const c = carenciaDeIntervencion(i, harvestEvent.harvestedAt);
        if (c.estado === "conocida") marcas.push({ interventionId: i.id, diasQueFaltaban: c.diasQueFaltan });
        else if (c.estado === "desconocida") marcas.push({ interventionId: i.id, diasQueFaltaban: null });
        return marcas;
      }, [])
    : [];
  // Ronda de arreglos 1 (importante #2, hueco de spec §3.4 confirmado por el
  // controlador): la comparación corre SIEMPRE, aunque la foto esté vacía —
  // antes vivía gateada dentro del `if (marcasDeCarencia.length > 0)` de la
  // JSX, así que una cosecha SIN carencia en su foto nunca podía enseñar que
  // hoy sí la hay. `difiereCarenciaDeHoy` decide, más abajo, si la caja se
  // pinta —con o sin lista— y no al revés.
  const difiereCarenciaDeHoy = harvestEvent
    ? difierenMarcasDeCarencia(
        harvestEvent.marcasDeCarencia.map((m) => ({ interventionId: m.interventionId, diasQueFaltaban: m.diasQueFaltaban })),
        calculoDeCarenciaHoy,
      )
    : false;

  // Qué mediciones han sido superadas por una corrección. Se calcula de la
  // lista que ya se cargó, sin otra consulta.
  const supersededMeasurementIds = new Set(
    measurements.map((m) => m.correctsId).filter((id): id is string => id != null),
  );

  /**
   * Fecha y hora en la zona del SITIO, no en UTC.
   *
   * Antes cada uso repetía `toISOString().slice(0, 16)`, que siempre devuelve
   * UTC: cosecha, recepción, fermentación y secado se leían cinco horas
   * adelantadas, y las que caen de madrugada cambiaban de día. Medido el
   * 2026-09-05 recorriendo la aplicación. Ver `lib/time/mostrarInstante.ts`.
   *
   * Un lote sin Location cae en el respaldo del formateador: mostrar la hora
   * de la finca es mejor que mostrar UTC, y no hay una tercera opción honesta.
   */
  const cuando = (date: Date) => mostrarInstante(date, lot.location?.timezone);
  const cuandoDia = (date: Date) => mostrarFecha(date, lot.location?.timezone ?? null);

  // Tarea 8, ronda de arreglos 1 (menor #1): sale de `etiquetasDeManejo.ts`,
  // compartida con las otras 3 pantallas.
  const textoDeObjetivoDeManejo = textoDeObjetivoDeManejoDe(t);
  const labourEntryLine = (entry: LabourEntry) =>
    t("labourEntryLine", { workers: entry.workerCount, hours: entry.hours.toString(), date: cuando(entry.occurredAt) }) +
    (entry.taskNote ? ` — ${entry.taskNote}` : "");
  const consumptionEntryLine = (entry: (typeof materialConsumptionEntries)[number]) =>
    t("consumptionEntryLine", { material: entry.materialName, batch: entry.batchLabel }) +
    (entry.quantity != null ? ` — ${entry.quantity.toString()} ${entry.unit ?? ""}` : "");

  const activeFermentation = fermentationRuns.find((r) => r.endedAt === null) ?? null;
  const activeDrying = dryingRuns.find((r) => r.endedAt === null) ?? null;
  const instrumentosDeMedicion = puedeRegistrar ? await instrumentosParaMedicion(user.userAccountId) : [];
  const inspeccionesDeMedicion = puedeRegistrar && activeDrying
    ? await inspeccionesParaMedicion(user.userAccountId, lot.id, activeDrying.id) : [];

  // Ver las bandejas pide `view` del lote —el mismo que ya abrió esta página—;
  // cargar, bajar y mover, `manage` (`puedeRegistrar`, línea 125).
  const bandejas = activeDrying ? await bandejasDeCorrida(user.userAccountId, activeDrying.id) : [];
  const bandejasLibres = activeDrying && puedeRegistrar ? await bandejasDisponibles(user.userAccountId, activeDrying.id) : [];
  const bandejasSinBajar = bandejas.filter((b) => b.hasta === null).length;
  // Paso 3b: las posiciones a las que se puede mover cada bandeja CARGADA, sólo
  // para quien gestiona el lote — el mismo permiso que abre "Cargar"/"Bajar".
  const posicionesPorBandeja = puedeRegistrar
    ? Object.fromEntries(
        await Promise.all(
          bandejas
            .filter((b) => b.hasta === null)
            .map(async (b) => [b.equipmentId, await posicionesParaMover(user.userAccountId, b.equipmentId)] as const),
        ),
      )
    : {};

  // ADR-096 — which action this batch is waiting for, and the list to render.
  const suggestedAction = nextActionFor(
    lot.lotType,
    Boolean(activeFermentation || activeDrying),
    // Resolved below from this batch's own transformations; see `alreadySelected`.
    transformations.some((tr) => tr.transformationType === "selection"),
  );

  // ADR-099 — target versus actual for the run under way. Empty when the run
  // was started without a recipe, which is most of them and is legitimate;
  // the component renders nothing rather than an empty table.
  const targetRows = activeFermentation
    ? await compareRunToTargets(user.userAccountId, activeFermentation.id)
    : [];

  /**
   * **El veredicto de los motores de beneficio para la fase abierta.**
   *
   * Se calcula aquí y no dentro del componente porque lee la base: el grado de
   * proceso vive en `LotProcess`, y los motores son puros a propósito.
   *
   * **Puede devolver una razón en vez de un veredicto**, y eso se pinta igual de
   * explícito: «este lote no declara qué protocolo corre» y «este lote va bien»
   * son hechos distintos. Ver `lib/beneficio/desdeElLote.ts`.
   */
  // **El reposo es lo que pasa cuando NO hay fase abierta**, así que esta
  // condición no puede ser «fermentación o secado o nada»: así estaba, y por
  // eso el reposo habría sido invisible por mucho que el motor lo calculara.
  // La lógica vive en `faseDelLote`, donde tiene pruebas.
  const secadosTerminados = dryingRuns
    .flatMap((r) => (r.endedAt === null ? [] : [{ endedAt: r.endedAt, endedOutcome: r.endedOutcome }]))
    .sort((x, y) => y.endedAt.getTime() - x.endedAt.getTime());
  const faseAbierta = faseDelLote({
    fermentacionAbierta: activeFermentation,
    secadoAbierto: activeDrying,
    ultimoSecadoTerminado: secadosTerminados[0] ?? null,
  });
  // Parte 1, R3/R7 (tarea 9, 2026-10-02): el proceso que CUBRE al lote —buscado hacia arriba, porque el pergamino no
  // tiene proceso: lo tiene la cereza de la que salió— decide qué se ofrece y qué grado ve el veredicto. Se lee siempre,
  // no sólo con una fase abierta: sin proceso abierto es justo cuando la ficha tiene que decir por qué no se puede empezar.
  //
  // Un `LotProcessError` al cargar —un linaje de más de 64 generaciones— se DICE en la ficha: hasta esta tarea la ficha
  // no atrapaba ninguno, y habría sido un 500.
  let cobertura: CoberturaDelLote | null = null;
  let errorDeCobertura: string | null = null;
  /** Si no hay proceso abierto que lo cubra, si se podría abrir uno (R2) — o el motivo por el que no. */
  let puedeAbrir: { puede: true } | { puede: false; motivo: MotivoParaNoAbrir } | null = null;
  /**
   * Si `startFermentationRun` y `startDryingRun` aceptarían este lote (revisión final, ronda de arreglo 1, 2026-10-03): la misma
   * función que corre el servicio, sin bloquear. Antes la ficha decidía con «proceso abierto y fuera de bodega», y ofrecía
   * empezar sobre la cereza que su fermentación ya consumió o sobre un lote dividido cubierto por un reproceso (M8). Sólo a
   * quien gestiona el lote, como los botones.
   */
  let puedeEmpezar: { puede: true } | { puede: false; motivo: MotivoParaNoEmpezar } | null = null;
  try {
    cobertura = await coberturaDelLote(user.userAccountId, lot.id);
    if (cobertura.estado !== "abierto" && lot.lotType !== "honey" && !activeFermentation && !activeDrying && puedeRegistrar) {
      puedeAbrir = await puedeAbrirProceso(user.userAccountId, lot.id);
    }
    if (lot.lotType !== "honey" && puedeRegistrar) puedeEmpezar = await puedeEmpezarCorrida(user.userAccountId, lot.id);
  } catch (error) {
    if (!(error instanceof LotProcessError)) throw error;
    errorDeCobertura = error.message;
  }
  const linajeDemasiadoHondo = errorDeCobertura === "lineage_too_deep";
  const procesoAbierto = cobertura?.estado === "abierto";
  // Cómo estaba el instrumento **en el instante de cada lectura**. Se resuelve por
  // lotes: un permiso por instrumento, no uno por medición. Hoy devuelve un mapa
  // vacío porque ninguna medición declara instrumento todavía, y el veredicto lo
  // dice en voz alta con la limitación `SIN_INSTRUMENTO_DECLARADO`.
  const estadosDeInstrumento = faseAbierta
    ? await estadosDeInstrumentoPorMedicion(
        user.userAccountId,
        measurements.map((m) => ({ id: m.id, instrumentId: m.instrumentId, occurredAt: m.occurredAt })),
      )
    : new Map<string, EstadoDeVerificacion>();
  // La regla de qué entra en el veredicto —incluido de dónde sale el grado en reposo— vive en
  // `lib/beneficio/entradaDelLote.ts`, para que esta ficha y el tablero del beneficio no puedan
  // discrepar. Aquí sólo se le pasan los datos que esta página ya cargó.
  const entrada = entradaDelLote({
    fermentacionAbierta: activeFermentation,
    secadoAbierto: activeDrying,
    ultimoSecadoTerminado: secadosTerminados[0] ?? null,
    // Parte 1, R7: lo MISMO que el tablero le pasa, por la misma función (`procesosParaEntrada`).
    procesos: cobertura?.paraEntrada ?? [],
    // **Esta página no tiene el defecto de `PENDING_IMPLEMENTATIONS/018`**: `getLotDetail` carga las
    // mediciones **sin ventana de fecha** (`lots.ts`: `where: { lotId }`), así que el conjunto que ya
    // calculó arriba está completo. Se reusa en vez de dejar que la función lo deduzca otra vez.
    idsCorregidos: supersededMeasurementIds,
    mediciones: measurements.map((m) => ({
      id: m.id,
      variable: m.variable,
      value: m.value.toNumber(),
      occurredAt: m.occurredAt,
      provenanceClass: String(m.provenanceClass),
      correctsId: m.correctsId,
      instrumentId: m.instrumentId,
    })),
    estadosDeInstrumento,
    ahora: new Date(),
  });
  // Revisión final (ronda de arreglo 1, M7): sin cobertura —un linaje de más de 64 generaciones— no hay veredicto. `procesos`
  // llegaría vacío y el veredicto diría «el proceso no dice qué grado es», que es afirmar una ausencia que nadie pudo mirar.
  const veredicto = entrada && errorDeCobertura === null ? veredictoDelLote(entrada) : null;

  // P3 §6 — the selection form is offered for cherry that is not already in a
  // run. A batch mid-fermentation is not waiting to be sorted, and a lot that
  // has already been selected is a *different* lot (the accepted output), so
  // this does not need to ask whether sorting already happened.
  // Parte 1, R6.7: no se selecciona bajo un proceso abierto («primero se selecciona, después el proceso»).
  // Y R6.6 (tarea 9, ronda de arreglo 1, 2026-10-02): tampoco un lote dividido, que el servicio rechaza con `lote_dividido`. La
  // ficha lo sabe por `puedeAbrir`, que corre la MISMA comprobación (`loteDividido`, dentro de `exigeSinOtroProcesoAbierto`) y,
  // en un lote de cereza, antes que ninguna otra. Sin `puedeAbrir` —quien no gestiona el lote— la selección no se ofrece igual.
  const loteDivididoBajoProceso = puedeAbrir?.puede === false && puedeAbrir.motivo === "lote_dividido";
  const canSelect =
    lot.lotType === "cherry" && !activeFermentation && !activeDrying && !procesoAbierto && !loteDivididoBajoProceso;
  // ADR-161 — un lote de MIEL no fermenta, no se seca ni tiene proceso de café: se procesa y se
  // envasa. Ofrecerle los botones del café era invitar a registrar algo que no existe.
  const esMiel = lot.lotType === "honey";
  // ADR-163 — sólo un lote que SALIÓ de un envasado tiene envases que asignar a la tienda.
  // `getLotDetail` ya autorizó este lote; las dos lecturas trabajan sobre su id.
  const tienda = esMiel ? await asignacionesDeLote(lot.id) : null;
  const variantesTienda = tienda && puedeRegistrar && tienda.libres > 0 ? await variantesParaAsignar() : [];
  const selectionCatalogs = canSelect ? await getSelectionCatalogs() : null;
  // Los códigos que ya cuelgan de este batch, para que la pantalla sugiera el
  // siguiente libre y no uno que abortaría la transacción.
  const codigosTomados = canSelect ? await codigosYaDerivadosDe(lot.id) : [];

  // P3 §6 follow-through — a selection recorded against this batch produced an
  // outturn, and the outturn is the number a producer actually asks for. It was
  // computable from #58 and visible nowhere, so recording one told the operator
  // nothing back.
  const selectionTransformation = transformations.find((tr) => tr.transformationType === "selection") ?? null;

  // Has this batch already been sorted? True when a selection names it at all —
  // either it was the input (this batch was sorted) or it is an output (it came
  // out of one). Both mean the page should stop suggesting selección: the first
  // because it is done, the second because sorting the accepted stream again is
  // a different decision an operator would make deliberately, not a next step.
  const alreadySelected = selectionTransformation != null;
  const outturn = selectionTransformation ? await getSelectionOutturn(selectionTransformation.id) : null;

  // Las tres lecturas de la clasificación de verde (spec 2026-09-25). En un lote verde clasificado
  // este bloque SUSTITUYE a la tabla genérica de cuajado: las dos pintan las mismas cifras, y la
  // genérica las rotula «aceptado / rechazado», que es vocabulario de la selección de cereza.
  //
  // **Sólo se pregunta si hay alguna selección en juego**, y no por cada lote verde: toda
  // clasificación ES una transformación de tipo `selection`, así que sin ninguna la respuesta sería
  // `null` seguro y son tres consultas y una comprobación de permiso tiradas en cada ficha verde
  // (Codex, 2026-09-26).
  const clasificacionVerde =
    lot.lotType === "green" && selectionTransformation
      ? await clasificacionDeLote(user.userAccountId, lot.id)
      : null;
  // **Y se suprime el cuajado sólo si es EL MISMO evento.** `selectionTransformation` es la PRIMERA
  // selección en la que este lote aparece —como entrada **o como salida**— y `clasificacionDeLote`
  // devuelve la ÚLTIMA en la que es entrada: pueden ser transformaciones distintas. Comparando sólo
  // «¿hay clasificación?» se escondían las cifras de un evento por la existencia de otro — por
  // ejemplo un lote que salió de una clasificación y después entró en otra (Codex, 2026-09-26).
  const cuajadoEsElMismoEvento = clasificacionVerde?.transformationId === selectionTransformation?.id;

  const currentStorage = storageAssignments.find((s) => s.endedAt === null) ?? null;

  const availableActions: { action: BatchAction; href: string; label: string }[] = [
    // Only offered while a run is under way, because that is the only time it
    // is the *expected* step — the measurement form itself is always on the
    // page, in its own section, and this is an anchor to it rather than a
    // second way to reach it (ADR-096).
    ...(activeFermentation || activeDrying
      ? [{ action: "measurement" as const, href: "#measurements", label: t("recordMeasurementButton") }]
      : []),
    // Starting a new stage is offered only when no run is under way, exactly
    // as before — the conditional is unchanged, only the styling below it is.
    // Selección is an anchor to the form already in its own section, not a
    // second route to it — the same treatment `measurement` gets above.
    ...(canSelect ? [{ action: "selection" as const, href: "#seleccion", label: t("recordSelectionButton") }] : []),
    ...(esMiel
      ? ([
          { action: "honey_process", href: "#procesar-miel", label: t("honeyProcessButton") },
          { action: "packaging", href: "#envasar-miel", label: t("honeyPackagingButton") },
          { action: "split", href: "#dividir-miel", label: t("honeySplitButton") },
        ] as const)
      : []),
    // Parte 1, R3 (tarea 9): empezar una corrida exige un proceso abierto que cubra al lote, y en bodega no se empieza
    // nada. Sin eso el servicio rechaza: no se ofrece, y debajo de los botones va la frase de por qué.
    // Revisión final (ronda de arreglo 1): por `puedeEmpezarCorrida`, que pregunta lo mismo que el servicio —también la corrida ya
    // abierta, el lote consumido y el lote dividido, que «proceso abierto y fuera de bodega» no veía—.
    ...(!esMiel && !activeFermentation && !activeDrying && puedeEmpezar?.puede === true
      ? ([
          { action: "fermentation", href: `/lots/${lot.id}/fermentation/new`, label: t("startFermentationButton") },
          { action: "drying", href: `/lots/${lot.id}/drying/new`, label: t("startDryingButton") },
        ] as const)
      : []),
    // R1 §4. Se ofrece sobre café verde: tostar cereza o pergamino no es una
    // operación que exista. `lotType` es físico a propósito (P3 §3), así que
    // preguntar por él aquí es preguntar por el estado real del lote.
    ...(lot.lotType === "green"
      ? ([
          { action: "green_grading", href: `/lots/${lot.id}/green-selection/new`, label: t("greenGradingAction") },
          { action: "roast", href: `/lots/${lot.id}/roast/new`, label: t("recordRoastButton") },
        ] as const)
      : []),
    ...(["parchment", "dry_cherry"].includes(lot.lotType)
      ? [{ action: "hulling" as const, href: `/lots/${lot.id}/hulling/new`, label: t("hullingAction") }]
      : []),
    // El proceso va ANTES de bodega a propósito: es lo que hay que haber hecho
    // para que bodega deje pasar el lote (`exigeSecadoTerminado`).
    ...(esMiel ? [] : [{ action: "process" as const, href: `/lots/${lot.id}/process`, label: t("viewProcessButton") }]),
    { action: "storage", href: `/lots/${lot.id}/storage/new`, label: t("moveStorageButton") },
    { action: "sample", href: `/lots/${lot.id}/samples/new`, label: lot.lotType === "green" ? t("greenSampleSubmit") : t("createSampleButton") },
    { action: "report", href: `/lots/${lot.id}/report`, label: t("viewReportButton") },
  ];

  // The suggested action leads. Everything else keeps its original order, so
  // an operator who already knows where a button lives still finds it there.
  // Sin permiso de registro sólo sobrevive `report`, que es la única de lectura.
  // Se filtra ANTES de ordenar por acción sugerida: si no, la sugerencia podría
  // ser una acción ya retirada y encabezaría una lista donde no está.
  const accionesVisibles = puedeRegistrar
    ? availableActions
    : availableActions.filter((a) => a.action === "report");

  // Tarea 9, ronda de arreglo 1 (2026-10-02): se sugiere sólo una acción que la ficha OFRECE ahora. `nextActionFor` mira el
  // tipo del lote, y desde la Parte 1 fermentar, secar y seleccionar dependen del proceso: sugería botones que no estaban.
  const sugerida = sugerenciaOfrecida(suggestedAction, accionesVisibles.map((a) => a.action));
  const batchActions = [
    ...accionesVisibles.filter((a) => a.action === sugerida),
    ...accionesVisibles.filter((a) => a.action !== sugerida),
  ];

  // T12.5: signed GET URLs computed once here (server-side, already gated
  // by getLotDetail's own requireLotAccess("view", ...) above) — same
  // "render-only-when-present" pattern as Sensory, and the same "no
  // independent RBAC check downstream of an already-gated aggregation"
  // reasoning as getSensoryLinkageForSamples.
  const assetsWithUrls = await Promise.all(
    assets.map(async (asset) => ({ asset, viewUrl: await getSignedUrlForAsset(asset.storageKey) })),
  );

  const currentStage = activeFermentation
    ? t("stageFermenting")
    : activeDrying
      ? t("stageDrying")
      : currentStorage
        ? t("stageInStorage")
        : t(`lotType_${lot.lotType}` as "lotType_cherry");

  type TimelineEntry = { occurredAt: Date; label: string; key: string };
  const timeline: TimelineEntry[] = [
    ...transformations.map((tr) => ({ occurredAt: tr.occurredAt, label: t(`transformationType_${tr.transformationType}` as "transformationType_split"), key: `tr-${tr.id}` })),
    ...quantityEvents.map((qe) => ({ occurredAt: qe.occurredAt, label: `${t(`quantityEventType_${qe.eventType}` as "quantityEventType_received")}: ${qe.quantity.toString()} ${qe.unit}`, key: `qe-${qe.id}` })),
    ...measurements.map((m) => ({ occurredAt: m.occurredAt, label: `${m.variable}: ${m.value.toString()} ${m.unit}`, key: `me-${m.id}` })),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  return (
    <div>
      <Link href="/lots" className="nn-back-link">
        {t("backToLots")}
      </Link>
      <span className="nn-badge">{t(`lotType_${lot.lotType}` as "lotType_cherry")}</span>
      {lot.rejectionCategoryValue ? (
        <span className="nn-badge">{t("rejectBadge", { category: lot.rejectionCategoryValue.value })}</span>
      ) : null}
      <h1 className="nn-code">{lot.lotCode}</h1>
      <p className="nn-detail-meta">
        <span>{t("currentStageLabel", { stage: currentStage })}</span>
        <span>
          {quantity.recorded
            ? t("currentQuantityLabel", {
                quantity: quantity.quantity.toString(),
                unit: quantity.unit ?? t("unitUnknown"),
              })
            : t("quantityNotRecorded")}
        </span>
        {lot.project ? <span>{lot.project.name}</span> : null}
        {lot.location ? <span>{lot.location.name}</span> : null}
        {lot.organization ? <span>{lot.organization.name}</span> : null}
      </p>
      {lot.lotType === "green" && lot.greenScreenStatus ? (
        <section className="nn-section">
          <h2>{t("greenGradingResultHeading")}</h2>
          <dl className="nn-definition-grid">
            <div><dt>{t("greenGradingDataStatus")}</dt><dd>{t(`greenGradingStatus_${lot.greenScreenStatus}`)}</dd></div>
            <div><dt>{t("greenGradingScreenRange")}</dt><dd>{lot.greenScreenMin != null || lot.greenScreenMax != null ? `${lot.greenScreenMin ?? "?"}–${lot.greenScreenMax ?? "?"}` : t("selectionOutturnUnknown")}</dd></div>
            {lot.greenScreenSystem ? <div><dt>{t("greenGradingScreenSystem")}</dt><dd>{lot.greenScreenSystem}</dd></div> : null}
            {lot.greenUniformityPct != null ? <div><dt>{t("greenGradingUniformity")}</dt><dd>{Number(lot.greenUniformityPct)}%</dd></div> : null}
          </dl>
          {lot.greenGradeNote ? <p>{lot.greenGradeNote}</p> : null}
        </section>
      ) : null}
      {mensajeDeErrorDeBandeja ? <p role="alert">{mensajeDeErrorDeBandeja}</p> : null}
      {/* `role="status"` y no `alert`: es una confirmación de algo que salió bien, y un lector de
          pantalla no debe interrumpir por ella. Mismo patrón que `/instalaciones/[id]`. */}
      {ok === "inspeccion" ? (
        <p className="nn-notice nn-notice-success" role="status">
          {t("inspeccionRegistrada")}
        </p>
      ) : null}
      {/* Un aviso, no dieciséis: repetir el motivo junto a cada formulario sería
          ruido en una página de 825 líneas. La trazabilidad se sigue leyendo
          entera —ése es el punto de poder ver el lote—; lo que desaparece es lo
          que el servidor iba a rechazar. */}
      {!puedeRegistrar ? (
        <p className="nn-muted" role="status">
          {t("soloLecturaEnEsteLote")} {t("sinAmbitoGestionBody")}
        </p>
      ) : null}

      {/*
        ADR-096. The five actions used to be one flex row of identical buttons,
        which made the page a list of capabilities rather than a place work
        happens. The action this batch is waiting for is now drawn first and
        solid; the rest stay quiet and remain one click away.

        It suggests, it never restricts — a batch that skips a stage costs the
        operator nothing extra, which is why this was safe to add over a
        sequence the platform cannot actually verify.
      */}
      <div style={{ marginTop: "1rem" }}>
        {sugerida ? (
          <p className="nn-muted" style={{ margin: "0 0 0.5rem" }}>{t("suggestedNextLabel")}</p>
        ) : null}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {batchActions.map(({ action, href, label }) => (
            <Link
              key={action}
              href={href}
              className={action === sugerida ? "nn-button" : "nn-button-quiet"}
            >
              {label}
            </Link>
          ))}
        </div>
        {/* Parte 1, R3 (tarea 9): sin proceso abierto no hay «Empezar fermentación» ni «Empezar secado», y se dice por qué.
            Si R2 dejaría abrir uno, la frase lleva a «Proceso del lote»; si no, el motivo —una frase única mentiría en un lote
            dividido o mezclado—. Sólo a quien gestiona el lote, como los botones (regla de Daniel del 2026-09-27: lo que no
            puedes hacer no se explica, se omite). */}
        {puedeAbrir ? (
          <p className="nn-muted" style={{ margin: "0.5rem 0 0" }}>
            {puedeAbrir.puede ? (
              <Link href={`/lots/${lot.id}/process`}>{t("startRunNeedsOpenProcess")}</Link>
            ) : (
              t(`processCannotOpen_${puedeAbrir.motivo}`)
            )}
          </p>
        ) : null}
        {/* Revisión final (ronda de arreglo 1): con un proceso abierto que lo cubre y sin corrida en curso en este lote, si la
            corrida no se puede empezar se dice por qué —la cereza ya consumida, la división, la bodega—, con el texto del mismo
            código con que el servicio lo rechazaría. Sin proceso abierto lo dice la frase de arriba. */}
        {procesoAbierto && !activeFermentation && !activeDrying && puedeEmpezar && !puedeEmpezar.puede && puedeEmpezar.motivo !== "sin_proceso_abierto" ? (
          <p className="nn-muted" style={{ margin: "0.5rem 0 0" }}>
            {t(`error_proceso_${puedeEmpezar.motivo}`)}
          </p>
        ) : null}
      </div>
      {/* Below the actions, not above them: recording the batch's state comes
          first, and the photo is the complement to it (ADR-096). */}
      {puedeRegistrar ? (
        <PhotoUploadForm lotId={lot.id} parent={{ kind: "lot" }} observers={observers} selfPersonId={selfPersonId} />
      ) : null}
      <section className="nn-section">
        <h2>{t("processingHeading")}</h2>
        {/* Parte 1, R1/R7 (tarea 9): el proceso que cubre al lote, en qué lote vive y su receta con versión; la cadena si hay
            más de uno (del más cercano al más lejano); la composición si es una mezcla, sin nombrar ningún proceso. */}
        {/* Revisión final (ronda de arreglo 1): un proceso que vive en un lote que quien mira no puede ver sale `oculto` —sólo que
            lo cubre y si está abierto—, sin código de lote ni receta. */}
        {cobertura?.vigente ? (
          <p className="nn-muted">
            {cobertura.vigente.oculto
              ? t("processCoveringHidden", { state: cobertura.estado === "abierto" ? t("processOpen") : t("processClosed") })
              : t("processCoveringShown", {
                  lotCode: cobertura.vigente.lot.lotCode,
                  // M6: un proceso sin receta se dice en el idioma de la pantalla, no con la constante `SIN_RECETA` del reporte.
                  label: cobertura.vigente.recetaConVersion ?? t("processNoRecipeLabel"),
                  state: cobertura.estado === "abierto" ? t("processOpen") : t("processClosed"),
                })}
          </p>
        ) : cobertura?.composicion ? (
          <p className="nn-muted">
            {t("processMixture", {
              partes: cobertura.composicion.procesos
                .map((p) => (p.oculto ? t("processHiddenLot") : `${p.lot.lotCode} · ${p.recetaConVersion ?? t("processNoRecipeLabel")}`))
                .join(" + "),
            })}
          </p>
        ) : null}
        {cobertura && cobertura.cadena.length > 1 ? (
          <p className="nn-muted">
            {t("processChainShown", {
              cadena: cobertura.cadena
                .map((p) => (p.oculto ? t("processHiddenLot") : `${p.lot.lotCode} · ${p.recetaConVersion ?? t("processNoRecipeLabel")}`))
                .join(" → "),
            })}
          </p>
        ) : null}
        {errorDeCobertura !== null ? (
          <p className="nn-error">
            {linajeDemasiadoHondo ? t("processLineageTooDeep") : t("processLoadFailed", { detail: errorDeCobertura })}
          </p>
        ) : null}
        {veredicto ? <VeredictoDeBeneficio veredicto={veredicto} /> : null}
        {activeFermentation ? (
          <div className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>{t("activeFermentationHeading")}</h3>
            {/* Placed directly under the run's own heading: this is the
                run's report card, not a separate section (ADR-099). */}
            <TargetComparisonTable rows={targetRows} />
            <p className="nn-muted">{t("startedAtLabel", { date: cuando(activeFermentation.startedAt) })}</p>
            {activeFermentation.interventions.length > 0 ? (
              <ul>
                {activeFermentation.interventions.map((iv) => (
                  <li key={iv.id}>
                    {t(`interventionType_${iv.interventionType}` as "interventionType_agitation")} — {cuando(iv.occurredAt)}
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={recordFermentationInterventionFormAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="fermentationRunId" value={activeFermentation.id} />
              <select name="interventionType" defaultValue="agitation">
                {FERMENTATION_INTERVENTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`interventionType_${type}` as "interventionType_agitation")}
                  </option>
                ))}
              </select>
              <BotonDeEnvio className="nn-button">
                {t("recordInterventionButton")}
              </BotonDeEnvio>
            </form>
            <form action={endFermentationFormAction} className="nn-form" style={{ maxWidth: 420, marginTop: "1rem" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="fermentationRunId" value={activeFermentation.id} />
              <div className="nn-field">
                <label htmlFor="ferm-output-code">{t("outputLotCodeLabel")}</label>
                <input id="ferm-output-code" name="outputLotCode" type="text" required />
              </div>
              <div className="nn-field">
                <label htmlFor="ferm-output-type">{t("outputLotTypeLabel")}</label>
                <select id="ferm-output-type" name="outputLotType" defaultValue="drying">
                  {LOT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`lotType_${type}` as "lotType_cherry")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="nn-field">
                <label htmlFor="ferm-output-quantity">{t("quantityLabel")}</label>
                <CampoNumerico id="ferm-output-quantity" name="quantity" inputMode="decimal" step="0.001" />
              </div>
              <div className="nn-field">
                <label htmlFor="ferm-output-unit">{t("unitLabel")}</label>
                <input id="ferm-output-unit" name="unit" type="text" placeholder="kg" />
              </div>
              <BotonDeEnvio className="nn-button">
                {t("endFermentationButton")}
              </BotonDeEnvio>
            </form>
            {puedeRegistrar ? (
              <PhotoUploadForm lotId={lot.id} parent={{ kind: "fermentationRun", fermentationRunId: activeFermentation.id }} observers={observers} selfPersonId={selfPersonId} />
            ) : null}

            {labourEntries.filter((le) => le.fermentationRunId === activeFermentation.id).length > 0 ? (
              <ul>
                {labourEntries
                  .filter((le) => le.fermentationRunId === activeFermentation.id)
                  .map((le) => (
                    <li key={le.id}>{labourEntryLine(le)}</li>
                  ))}
              </ul>
            ) : null}
            {puedeRegistrar ? (
              <LabourEntryForm
            claveDeEnvio={clavesDeJornal.fermentationRun}
                lotId={lot.id}
                parent={{ kind: "fermentationRun", fermentationRunId: activeFermentation.id }}
                observers={observers}
                selfPersonId={selfPersonId}
                organizations={organizations}
              />
            ) : null}

            {materialConsumptionEntries.filter((mc) => mc.fermentationRunId === activeFermentation.id).length > 0 ? (
              <ul>
                {materialConsumptionEntries
                  .filter((mc) => mc.fermentationRunId === activeFermentation.id)
                  .map((mc) => (
                    <li key={mc.id}>{consumptionEntryLine(mc)}</li>
                  ))}
              </ul>
            ) : null}
            {puedeRegistrar ? (
              <MaterialConsumptionForm
                claveDeEnvio={clavesDeConsumo.fermentationRun}
                lotId={lot.id}
                parent={{ kind: "fermentationRun", fermentationRunId: activeFermentation.id }}
              />
            ) : null}
          </div>
        ) : null}

        {activeDrying ? (
          <div className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>{t("activeDryingHeading")}</h3>
            <p className="nn-muted">{t("startedAtLabel", { date: cuando(activeDrying.startedAt) })}</p>
            {activeDrying.turningEvents.length > 0 ? (
              <ul>
                {activeDrying.turningEvents.map((ev) => (
                  <li key={ev.id}>
                    {t(`turnEventType_${ev.eventType}` as "turnEventType_turned")} — {cuando(ev.occurredAt)}
                  </li>
                ))}
              </ul>
            ) : null}

            <BandejasDelSecado
              lotId={lot.id}
              dryingRunId={activeDrying.id}
              filas={bandejas.map((b) => ({ ...b, desde: b.desde.toISOString(), hasta: b.hasta?.toISOString() ?? null }))}
              disponibles={bandejasLibres}
              puedeRegistrar={puedeRegistrar}
              tiposDeSalida={DRYING_OUTPUT_LOT_TYPES.map((type) => ({ valor: type, etiqueta: t(`lotType_${type}` as "lotType_cherry") }))}
              posicionesPorBandeja={posicionesPorBandeja}
            />

            <form action={recordDryingTurnFormAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="dryingRunId" value={activeDrying.id} />
              <select name="eventType" defaultValue="turned">
                {DRYING_TURN_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`turnEventType_${type}` as "turnEventType_turned")}
                  </option>
                ))}
              </select>
              <BotonDeEnvio className="nn-button">
                {t("recordTurnButton")}
              </BotonDeEnvio>
            </form>
            {bandejasSinBajar > 0 ? (
              <p className="nn-muted">{tb("cierreEspera", { n: bandejasSinBajar })}</p>
            ) : (
              <form action={endDryingFormAction} className="nn-form" style={{ maxWidth: 420, marginTop: "1rem" }}>
                <input type="hidden" name="lotId" value={lot.id} />
                <input type="hidden" name="dryingRunId" value={activeDrying.id} />
                <div className="nn-field">
                  <label htmlFor="dry-outcome">{tb("desenlace")}</label>
                  <select id="dry-outcome" name="endedOutcome" defaultValue="" required aria-describedby="dry-outcome-help">
                    <option value="" disabled>{tb("elegirDesenlace")}</option>
                    {DESENLACES_DEL_SECADO.map((d) => (
                      <option key={d} value={d}>
                        {tb(`desenlace_${d}` as "desenlace_target_reached")}
                      </option>
                    ))}
                  </select>
                  <p id="dry-outcome-help" className="nn-muted">{tb("desenlaceAyuda")}</p>
                </div>
                <div className="nn-field">
                  <label htmlFor="dry-output-code">{t("outputLotCodeLabel")}</label>
                  <input id="dry-output-code" name="outputLotCode" type="text" required />
                </div>
                <div className="nn-field">
                  <label htmlFor="dry-output-type">{t("dryingOutputMaterialLabel")}</label>
                  <select id="dry-output-type" name="outputLotType" defaultValue="" required aria-describedby="dry-output-help">
                    <option value="" disabled>{t("dryingOutputMaterialPlaceholder")}</option>
                    {DRYING_OUTPUT_LOT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`lotType_${type}` as "lotType_cherry")}
                      </option>
                    ))}
                  </select>
                  <p id="dry-output-help" className="nn-muted">{t("dryingOutputMaterialHelp")}</p>
                </div>
                <div className="nn-field">
                  <label htmlFor="dry-output-quantity">{t("quantityLabel")}</label>
                  <CampoNumerico id="dry-output-quantity" name="quantity" inputMode="decimal" step="0.001" />
                </div>
                <div className="nn-field">
                  <label htmlFor="dry-output-unit">{t("unitLabel")}</label>
                  <input id="dry-output-unit" name="unit" type="text" placeholder="kg" />
                </div>
                <BotonDeEnvio className="nn-button">
                  {t("endDryingButton")}
                </BotonDeEnvio>
              </form>
            )}
            {puedeRegistrar ? (
              <PhotoUploadForm lotId={lot.id} parent={{ kind: "dryingRun", dryingRunId: activeDrying.id }} observers={observers} selfPersonId={selfPersonId} />
            ) : null}

            {labourEntries.filter((le) => le.dryingRunId === activeDrying.id).length > 0 ? (
              <ul>
                {labourEntries
                  .filter((le) => le.dryingRunId === activeDrying.id)
                  .map((le) => (
                    <li key={le.id}>{labourEntryLine(le)}</li>
                  ))}
              </ul>
            ) : null}
            {puedeRegistrar ? (
              <LabourEntryForm
            claveDeEnvio={clavesDeJornal.dryingRun}
                lotId={lot.id}
                parent={{ kind: "dryingRun", dryingRunId: activeDrying.id }}
                observers={observers}
                selfPersonId={selfPersonId}
                organizations={organizations}
              />
            ) : null}

            {materialConsumptionEntries.filter((mc) => mc.dryingRunId === activeDrying.id).length > 0 ? (
              <ul>
                {materialConsumptionEntries
                  .filter((mc) => mc.dryingRunId === activeDrying.id)
                  .map((mc) => (
                    <li key={mc.id}>{consumptionEntryLine(mc)}</li>
                  ))}
              </ul>
            ) : null}
            {puedeRegistrar ? (
              <MaterialConsumptionForm
                claveDeEnvio={clavesDeConsumo.dryingRun}
                lotId={lot.id}
                parent={{ kind: "dryingRun", dryingRunId: activeDrying.id }}
              />
            ) : null}
          </div>
        ) : null}

        {currentStorage ? (
          <p className="nn-muted">{t("currentStorageLabel", { location: currentStorage.location.name })}</p>
        ) : null}

        {!activeFermentation && !activeDrying && !currentStorage ? <p className="nn-muted">{t("noProcessing")}</p> : null}
      </section>
      <section className="nn-section" id="measurements">
        <h2>{t("measurementsHeading")}</h2>
        {measurements.length === 0 ? (
          <p className="nn-muted">{t("noMeasurements")}</p>
        ) : (
          <ul>
            {measurements.map((m) => {
              // Reemplazada = existe otra medición que la corrige. Se deriva de
              // la misma lista, así que una cadena de correcciones se resuelve
              // sola: sólo la última queda sin marcar.
              const reemplazada = supersededMeasurementIds.has(m.id);
              return (
                <li key={m.id}>
                  <span style={reemplazada ? { textDecoration: "line-through" } : undefined}>
                    {m.variable}: {m.value.toString()} {m.unit} — {cuando(m.occurredAt)}
                  </span>
                  {m.correctsId ? ` (${t("correctionLabel")})` : ""}
                  {/* La tachadura sola no basta: no se ve en un lector de
                      pantalla ni en blanco y negro. El texto lo dice. */}
                  {reemplazada ? <> · <strong>{t("supersededLabel")}</strong></> : null}
                  {puedeRegistrar ? (
                    <PhotoUploadForm lotId={lot.id} parent={{ kind: "measurement", measurementId: m.id }} observers={observers} selfPersonId={selfPersonId} />
                  ) : null}
                  {/* Sólo se corrige lo vigente. Corregir una lectura ya
                      corregida bifurcaría el historial, y el servicio lo
                      rechaza; la página no ofrece lo que sería rechazado. */}
                  {!reemplazada ? (
                    <details>
                      <summary>{t("correctionSummary")}</summary>
                      {puedeRegistrar ? (
                        <MeasurementCorrectionForm
                          lotId={lot.id}
                          measurement={{
                            id: m.id,
                            variable: m.variable,
                            value: m.value.toString(),
                            unit: m.unit,
                            occurredAt: m.occurredAt.toISOString(),
                            provenanceClass: m.provenanceClass,
                          }}
                        />
                      ) : null}
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {puedeRegistrar ? (
          <MeasurementForm
            instrumentos={instrumentosDeMedicion}
            inspecciones={inspeccionesDeMedicion.map((i) => ({ id: i.id, label: cuando(i.occurredAt) }))}
            enSecado={!!activeDrying || lot.lotType === "drying"}
            claveDeEnvio={claveDeMedicion}
            lotId={lot.id}
            observers={observers}
            selfPersonId={selfPersonId}
            fermentationRunId={activeFermentation?.id ?? null}
            dryingRunId={activeDrying?.id ?? null}
            storageAssignmentId={currentStorage?.id ?? null}
          />
        ) : null}
      </section>

      {canSelect && selectionCatalogs ? (
        <section className="nn-section" id="seleccion">
          <h2>{t("selectionHeading")}</h2>
          {puedeRegistrar ? (
            <SelectionForm
              lotId={lot.id}
              lotCode={lot.lotCode}
              codigosTomados={codigosTomados}
              lotType={lot.lotType}
              currentQuantity={quantity.recorded ? Number(quantity.quantity) : null}
              unit={quantity.unit ?? "kg"}
              methods={selectionCatalogs.methods}
              categories={selectionCatalogs.categories}
            />
          ) : null}
        </section>
      ) : null}
      {/* Sólo para verde, y sólo si hay perfiles aprobados. Sin perfiles no se
          pinta un desplegable vacío: los primeros tuestes se hacen sin perfil, y
          una lista vacía sugeriría que falta algo cuando no falta nada. */}
      {esVerde && (perfilElegido || perfilesDisponibles.length > 0) ? (
        <section className="nn-section">
          <h2>{t("roastProfileOptimalHeading")}</h2>
          {perfilElegido ? (
            <p className="nn-detail-meta">
              <span>
                {perfilElegido.recipeVersion.recipe.name} · v{perfilElegido.recipeVersion.version}
              </span>
              {perfilElegido.notes ? <span>{perfilElegido.notes}</span> : null}
            </p>
          ) : (
            <p className="nn-muted">{t("roastProfileNoneChosen")}</p>
          )}
          {perfilesDisponibles.length > 0 ? (
            <PerfilOptimoForm
              lotId={lot.id}
              perfiles={perfilesDisponibles}
              actual={perfilElegido?.recipeVersionId ?? null}
            />
          ) : null}
        </section>
      ) : null}
      {/* ADR-161 — la miel: de qué cosecha viene (subiendo por la genealogía, así que un frasco
          también lo sabe), qué pasos se le hicieron, y los dos pasos que se le pueden hacer. */}
      {esMiel ? (
        <section className="nn-section">
          <h2>{tMiel("mielOrigenTitulo")}</h2>
          {origenApicola.length === 0 ? (
            <p className="nn-vital-sin-registro">{tMiel("mielOrigenNinguno")}</p>
          ) : (
            <ul>
              {origenApicola.map((o) => (
                <li key={o.id}>
                  {o.occurredAt.toISOString().slice(0, 10)} · {tMiel("mielOrigenCaja")}{" "}
                  <Link href={`/apiaries/${o.colony.hive.location.id}/hives/${o.colony.hive.id}`}>
                    {o.colony.hive.identifier}
                  </Link>{" "}
                  · {o.colony.hive.location.name}
                  {o.resultingLotId !== lot.id ? (
                    <>
                      {" "}
                      · {tMiel("mielOrigenLote")}{" "}
                      <Link href={`/lots/${o.resultingLotId}`} className="nn-code">
                        {lineage.lotCodesById.get(o.resultingLotId) ?? o.resultingLotId.slice(0, 8)}
                      </Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <h3>{tMiel("mielPasosTitulo")}</h3>
          {transformations.filter((tr) => ["honey_processing", "packaging", "split"].includes(tr.transformationType)).length === 0 ? (
            <p className="nn-muted">{tMiel("mielPasosNinguno")}</p>
          ) : (
            <ul>
              {transformations
                .filter((tr) => ["honey_processing", "packaging", "split"].includes(tr.transformationType))
                .map((tr) => (
                  <li key={tr.id}>
                    {tr.occurredAt.toISOString().slice(0, 10)} ·{" "}
                    {t(`transformationType_${tr.transformationType}` as "transformationType_split")}
                    {tr.transformationType === "honey_processing"
                      ? `: ${tr.honeyProcessActs
                          .map((a) => (a === "otro" ? tr.honeyProcessOtherNote ?? tMiel("mielActo_otro") : tMiel(`mielActo_${a}`)))
                          .join(", ")}`
                      : tr.transformationType === "split"
                        ? ""
                        : `: ${tMiel("mielEnvasesFila", { cuantos: tr.packageCount ?? 0, gramos: String(tr.packageNetMassG ?? "?") })}`}
                  </li>
                ))}
            </ul>
          )}

          {puedeRegistrar ? (
            <>
              <h3 id="procesar-miel">{tMiel("mielProcesarTitulo")}</h3>
              <ProcesarMielForm lotId={lot.id} />
              <h3 id="envasar-miel">{tMiel("mielEnvasarTitulo")}</h3>
              <EnvasarMielForm lotId={lot.id} />
              <h3 id="dividir-miel">{tMiel("mielDividirTitulo")}</h3>
              <DividirMielForm lotId={lot.id} />
            </>
          ) : null}

          {/* ADR-163 — a la tienda. Asignar no toca el inventario: lo sube la recepción. */}
          {tienda ? (
            <>
              <h3 id="a-la-tienda">{tTienda("loteTitulo")}</h3>
              <p className="nn-muted">{tTienda("loteResumen", { envases: tienda.envases, asignados: tienda.asignados, libres: tienda.libres })}</p>
              {tienda.filas.length > 0 ? (
                <ul>
                  {tienda.filas.map((f) => (
                    <li key={f.id}>
                      {f.assignedAt.toISOString().slice(0, 10)} ·{" "}
                      {tTienda("pendienteFila", {
                        envases: f.unitsAssigned,
                        producto: f.productVariant.product.name,
                        variante: f.productVariant.variantName ?? f.productVariant.sku,
                      })}{" "}
                      ·{" "}
                      {f.cancelledAt
                        ? tTienda("anuladaFila", { fecha: f.cancelledAt.toISOString().slice(0, 10), motivo: f.cancelReason ?? "" })
                        : f.receivedAt
                          ? tTienda("recibidaFila", { n: f.unitsReceived ?? 0, fecha: f.receivedAt.toISOString().slice(0, 10) }) +
                            (f.receiptNote ? ` — ${f.receiptNote}` : "")
                          : tTienda("esperandoRecepcion")}
                      {puedeRegistrar && !f.cancelledAt && !f.receivedAt ? (
                        <AnularAsignacionForm allocationId={f.id} lotId={lot.id} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {puedeRegistrar && tienda.libres > 0 ? (
                <AsignarATiendaForm lotId={lot.id} variantes={variantesTienda} libres={tienda.libres} />
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
      {harvestEvent ? (
        <section className="nn-section">
          <h2>{t("harvestInfoHeading")}</h2>
          <p className="nn-muted">{t("harvestOccurredAtLabel", { date: cuando(harvestEvent.harvestedAt) })}</p>

          {/* Ronda de arreglos 1 (importante #2): la caja se pinta si hay
              marcas en la foto O si el cálculo de hoy difiere de ella —
              antes sólo la primera condición decidía, y una foto vacía
              apagaba también el aviso de discrepancia (spec §3.4). */}
          {harvestEvent.marcasDeCarencia.length > 0 || difiereCarenciaDeHoy ? (
            <div className="nn-card">
              <h3>{t("harvestWithdrawalHeading")}</h3>
              {harvestEvent.marcasDeCarencia.length > 0 ? (
                <ul className="nn-detail-meta">
                  {harvestEvent.marcasDeCarencia.map((m) => (
                    <li key={m.id}>
                      {m.diasQueFaltaban != null ? t("harvestWithdrawalKnown", { n: m.diasQueFaltaban }) : t("harvestWithdrawalUnknown")}
                      {" — "}
                      <Link href={`/plots/${m.intervention.locationId}/manejo/${m.intervention.id}`}>
                        {cuandoDia(m.intervention.occurredAt)} · {textoDeObjetivoDeManejo[m.intervention.target]}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {difiereCarenciaDeHoy ? (
                <p className="nn-muted">
                  {t("harvestWithdrawalRecalculated", {
                    detalle:
                      calculoDeCarenciaHoy.length === 0
                        ? t("harvestWithdrawalRecalculatedNone")
                        : calculoDeCarenciaHoy
                            .map((m) =>
                              m.diasQueFaltaban != null
                                ? t("harvestWithdrawalKnown", { n: m.diasQueFaltaban })
                                : t("harvestWithdrawalUnknown"),
                            )
                            .join("; "),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

          {labourEntries.filter((le) => le.harvestEventId === harvestEvent.id).length > 0 ? (
            <ul>
              {labourEntries
                .filter((le) => le.harvestEventId === harvestEvent.id)
                .map((le) => (
                  <li key={le.id}>{labourEntryLine(le)}</li>
                ))}
            </ul>
          ) : null}
          {puedeRegistrar ? (
            <LabourEntryForm
            claveDeEnvio={clavesDeJornal.harvestEvent}
              lotId={lot.id}
              parent={{ kind: "harvestEvent", harvestEventId: harvestEvent.id }}
              observers={observers}
              selfPersonId={selfPersonId}
              organizations={organizations}
            />
          ) : null}
          {puedeRegistrar ? (
            <PhotoUploadForm lotId={lot.id} parent={{ kind: "harvestEvent", harvestEventId: harvestEvent.id }} observers={observers} selfPersonId={selfPersonId} />
          ) : null}

          {harvestSources ? (
            <>
              <h3>{t("harvestSourcesHeading")}</h3>
              {harvestSources.existing.length > 0 ? (
                <ul className="nn-detail-meta">
                  {harvestSources.existing.map((source) => (
                    <li key={source.id}>
                      {source.location.name}
                      {source.plantingCohort ? ` · ${source.plantingCohort.cultivarValue?.value ?? ""}` : ""}
                      {" — "}
                      {/* Sin peso NO es cero: el bloque aportó y nadie lo pesó
                          aparte, que es el caso normal en un beneficio. */}
                      {source.cherryWeightKg != null
                        ? t("sourceWeightValue", { kg: Number(source.cherryWeightKg) })
                        : t("sourceWeightUnweighed")}
                      {source.notes ? ` · ${source.notes}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="nn-muted">{t("harvestSourcesNone")}</p>
              )}
              {puedeEditarFuentes ? (
                <HarvestSourcesForm
                  lotId={lot.id}
                  harvestEventId={harvestSources.harvestEventId}
                  declaredTotalKg={harvestSources.declaredTotalKg}
                  alreadyRecordedKg={harvestSources.alreadyRecordedKg}
                  // Los dos números que hacen honesta a la diferencia: aportes
                  // guardados sin peso, y aportes que el RBAC oculta. El servicio
                  // los tenía calculados y la pantalla los dejaba caer.
                  sinPesar={harvestSources.existing.filter((s) => s.cherryWeightKg == null).length}
                  ocultos={harvestSources.hiddenContributions}
                  plots={harvestSources.plotLocations.map((plot) => ({
                    id: plot.id,
                    name: plot.name,
                    cohorts: plot.plantingCohorts.map((cohort) => ({
                      id: cohort.id,
                      // Sin conteo NO es «0 plantas»: es que nadie lo contó.
                      // Un 0 aquí se lee como un bloque vacío (ADR-080).
                      label:
                        cohort.plantCount != null
                          ? t("sourceCohortOption", {
                              cultivar: cohort.cultivarValue?.value ?? t("cultivarUnknown"),
                              plants: cohort.plantCount,
                            })
                          : t("sourceCohortOptionNoCount", {
                              cultivar: cohort.cultivarValue?.value ?? t("cultivarUnknown"),
                            }),
                    })),
                  }))}
                />
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
      {receivingEvent ? (
        <section className="nn-section">
          <h2>{t("receivingInfoHeading")}</h2>
          <p className="nn-muted">{t("receivingOccurredAtLabel", { date: cuando(receivingEvent.receivedAt) })}</p>
          {labourEntries.filter((le) => le.receivingEventId === receivingEvent.id).length > 0 ? (
            <ul>
              {labourEntries
                .filter((le) => le.receivingEventId === receivingEvent.id)
                .map((le) => (
                  <li key={le.id}>{labourEntryLine(le)}</li>
                ))}
            </ul>
          ) : null}
          {puedeRegistrar ? (
            <LabourEntryForm
            claveDeEnvio={clavesDeJornal.receivingEvent}
              lotId={lot.id}
              parent={{ kind: "receivingEvent", receivingEventId: receivingEvent.id }}
              observers={observers}
              selfPersonId={selfPersonId}
              organizations={organizations}
            />
          ) : null}
        </section>
      ) : null}
      <section className="nn-section">
        <details>
          <summary>
            <h2>{t("originLotHeading")}</h2>
            {lot.location ? <span className="nn-resumen-cifra">{lot.location.name}</span> : null}
          </summary>
          {lot.location ? (
            <>
              <p className="nn-muted">{t("originLotConditionsIntro")}</p>
              <p className="nn-detail-meta">
                <span>{lot.location.name}</span>
                {lot.location.sunExposure ? (
                  <span>
                    {t("sunExposureLabel")}: {t(`sunExposure_${lot.location.sunExposure}` as "sunExposure_full_sun")}
                  </span>
                ) : null}
                {lot.location.shadePercentage ? (
                  <span>
                    {t("shadePercentageLabel")}:{" "}
                    {t(`shadePercentage_${lot.location.shadePercentage}` as "shadePercentage_pct_20")}
                  </span>
                ) : null}
                {lot.location.altitudeMinM != null || lot.location.altitudeMaxM != null ? (
                  <span>
                    {t("altitudeRangeLabel")}:{" "}
                    {t("altitudeRangeValue", {
                      min: lot.location.altitudeMinM ?? "?",
                      max: lot.location.altitudeMaxM ?? "?",
                    })}
                  </span>
                ) : null}
                {lot.location.slopeDescription ? (
                  <span>
                    {t("slopeLabel")}: {lot.location.slopeDescription}
                  </span>
                ) : null}
                {lot.location.soilType ? (
                  <span>
                    {t("soilTypeLabel")}: {lot.location.soilType}
                  </span>
                ) : null}
              </p>
            </>
          ) : (
            <p className="nn-muted">{t("noOriginLot")}</p>
          )}
        </details>
      </section>
      {origenDeRecepciones.length > 0 ? (
        <section className="nn-section">
          <details>
            <summary>
              <h2>{t("origenRecepcionesHeading")}</h2>
              <span className="nn-resumen-cifra">{t("resumenRecepciones", { count: origenDeRecepciones.length })}</span>
            </summary>
            <ul>
              {origenDeRecepciones.map((o) => {
                const d = detalleDeOrigen.get(o.recepcionId);
                return (
                  <li key={o.recepcionId}>
                    {t("origenRecepcionLinea", { kg: o.kg.toFixed(1), origen: d?.origen ?? "" })}
                    {d?.detalle ? <span className="nn-muted">{` · ${d.detalle}`}</span> : null}
                    {o.nivel1LotId !== lot.id ? (
                      <>
                        {" · "}
                        <Link href={`/lots/${o.nivel1LotId}`} className="nn-code">
                          {lineage.lotCodesById.get(o.nivel1LotId) ?? o.nivel1LotId.slice(0, 8)}
                        </Link>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {veredictoDeCalidad ? (
              <p>
                {t(`juicio_${veredictoDeCalidad.juicio}`)}
                {veredictoDeCalidad.motivo ? <span className="nn-muted">{` — ${veredictoDeCalidad.motivo}`}</span> : null}
                <br />
                <span className="nn-muted">
                  {t("veredictoMasas", {
                    insumo: Number(veredictoDeCalidad.insumoKg).toFixed(1),
                    aceptado: Number(veredictoDeCalidad.aceptadoKg).toFixed(1),
                    verde: Number(veredictoDeCalidad.verdeKg).toFixed(1),
                    flotes: Number(veredictoDeCalidad.flotesKg).toFixed(1),
                    n: veredictoDeCalidad.selecciones,
                  })}
                </span>
              </p>
            ) : null}
          </details>
        </section>
      ) : null}
      <section className="nn-section">
        <details>
          <summary>
            <h2>{t("lineageHeading")}</h2>
            <span className="nn-resumen-cifra">{t("resumenGenealogia", { ancestros: lineage.ancestorLotIds.length, derivados: lineage.descendantLotIds.length })}</span>
          </summary>
          <p className="nn-detail-meta">
            <span>{t("ancestorsLabel", { count: lineage.ancestorLotIds.length })}</span>
            <span>{t("descendantsLabel", { count: lineage.descendantLotIds.length })}</span>
          </p>
          {lineage.ancestorLotIds.length > 0 ? (
            <p>
              {t("ancestorsHeading")}:{" "}
              {lineage.ancestorLotIds.map((ancestorId, i) => (
                <span key={ancestorId}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/lots/${ancestorId}`} className="nn-code">{lineage.lotCodesById.get(ancestorId) ?? ancestorId.slice(0, 8)}</Link>
                </span>
              ))}
            </p>
          ) : null}
          {lineage.descendantLotIds.length > 0 ? (
            <p>
              {t("descendantsHeading")}:{" "}
              {lineage.descendantLotIds.map((descendantId, i) => (
                <span key={descendantId}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/lots/${descendantId}`} className="nn-code">{lineage.lotCodesById.get(descendantId) ?? descendantId.slice(0, 8)}</Link>
                </span>
              ))}
            </p>
          ) : null}
        </details>
      </section>
      {clasificacionVerde ? <ClasificacionPorMalla clasificacion={clasificacionVerde} lotId={lot.id} zona={lot.location?.timezone ?? null} /> : null}
      {outturn && !cuajadoEsElMismoEvento ? (
        <section className="nn-section">
          <details>
            <summary>
              <h2>{t("selectionOutturnHeading")}</h2>
              <span className="nn-resumen-cifra">{t("resumenCuajado", { count: outturn.accepted.length + outturn.rejected.length })}</span>
            </summary>
            {outturn.method ? <p className="nn-muted">{t("selectionOutturnMethod", { method: outturn.method })}</p> : null}
            <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
              <tbody>
                {outturn.accepted.map((stream) => (
                  <tr key={stream.lotId}>
                    <td>{t("selectionOutturnAccepted")}</td>
                    <td><Link href={`/lots/${stream.lotId}`} className="nn-code">{stream.lotCode}</Link></td>
                    <td>{stream.quantity} {stream.unit}</td>
                    <td>{stream.sharePct != null ? t("selectionOutturnShare", { share: stream.sharePct }) : t("selectionOutturnUnknown")}</td>
                  </tr>
                ))}
                {outturn.rejected.map((stream) => (
                  <tr key={stream.lotId}>
                    <td>{t("selectionOutturnRejected")}{stream.rejectionCategory ? ` — ${stream.rejectionCategory}` : ""}</td>
                    <td><Link href={`/lots/${stream.lotId}`} className="nn-code">{stream.lotCode}</Link></td>
                    <td>{stream.quantity} {stream.unit}</td>
                    <td>{stream.sharePct != null ? t("selectionOutturnShare", { share: stream.sharePct }) : t("selectionOutturnUnknown")}</td>
                  </tr>
                ))}
                {outturn.declaredLossQuantity != null ? (
                  <tr>
                    <td>{t("selectionOutturnDeclaredLoss")}</td>
                    <td />
                    <td>{outturn.declaredLossQuantity}</td>
                    <td />
                  </tr>
                ) : null}
                <tr>
                  <td>{t("selectionOutturnUnexplained")}</td>
                  <td />
                  {/* null is "unknown", never 0 — ADR-080's distinction, and the
                      figure stored at write time rather than recomputed. */}
                  <td>{outturn.unexplainedQuantity != null ? outturn.unexplainedQuantity : t("selectionOutturnUnknown")}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </details>
        </section>
      ) : null}
      <section className="nn-section">
        <details>
          <summary>
            <h2>{t("timelineHeading")}</h2>
            <span className="nn-resumen-cifra">{t("resumenCronologia", { count: timeline.length })}</span>
          </summary>
          {timeline.length === 0 ? (
            <p className="nn-muted">{t("noTimeline")}</p>
          ) : (
            <ul>
              {timeline.map((entry) => (
                <li key={entry.key}>
                  {cuando(entry.occurredAt)} — {entry.label}
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>
      <section className="nn-section">
        <h2>{t("samplesHeading")}</h2>
        {samples.length === 0 ? (
          <p className="nn-muted">{t("noSamples")}</p>
        ) : (
          <ul>
            {samples.map((s) => (
              <li key={s.id}>
                {s.sampleCode} ({s.sampleType})
                {puedeRegistrar ? (
                  <PhotoUploadForm lotId={lot.id} parent={{ kind: "sample", sampleId: s.id }} observers={observers} selfPersonId={selfPersonId} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      {samples.some((s) => sensoryLinkage[s.id]?.length) ? (
        <section className="nn-section">
          <details>
            <summary>
              <h2>{t("sensoryHeading")}</h2>
              <span className="nn-resumen-cifra">{t("resumenSensorial", { count: samples.filter((s) => sensoryLinkage[s.id]?.length).length })}</span>
            </summary>
            <ul>
              {samples.flatMap((s) =>
                (sensoryLinkage[s.id] ?? []).map((entry) => (
                  <li key={`${s.id}-${entry.sessionId}`}>
                    {s.sampleCode} — {entry.sessionName}
                    {entry.overallResult ? (
                      <>
                        : {t("sensoryOverallScoreLabel", { mean: entry.overallResult.meanValue, count: entry.overallResult.responseCount })}
                      </>
                    ) : (
                      <> — {t("sensoryAwaitingResultLabel")}</>
                    )}
                  </li>
                )),
              )}
            </ul>
          </details>
        </section>
      ) : null}
      {assetsWithUrls.length > 0 ? (
        <section className="nn-section">
          <details>
            <summary>
              <h2>{t("photosHeading")}</h2>
              <span className="nn-resumen-cifra">{t("resumenFotos", { count: assetsWithUrls.length })}</span>
            </summary>
            <ul style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", listStyle: "none", padding: 0 }}>
              {assetsWithUrls.map(({ asset, viewUrl }) => (
                <li key={asset.id}>
                  {asset.assetType === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL, not a static/optimizable Next asset
                    <img src={viewUrl} alt="" style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 4 }} />
                  ) : (
                    <a href={viewUrl}>{asset.originalFilename ?? asset.id}</a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
      {lot.projectId ? (
        <section className="nn-section">
          <details>
            <summary>
              <h2>{t("tasksHeading")}</h2>
              <span className="nn-resumen-cifra">{tasks.length === 20 ? t("resumenTope", { count: 20 }) : t("resumenTareas", { count: tasks.length })}</span>
            </summary>
            {tasks.length === 0 ? (
              <p className="nn-muted">{t("noTasks")}</p>
            ) : (
              <ul>
                {tasks.map((task) => (
                  <li key={task.id}>{task.title}</li>
                ))}
              </ul>
            )}
          </details>
        </section>
      ) : null}
      <section className="nn-section">
        <details>
          <summary>
            <h2>{t("historyHeading")}</h2>
            {/* **Ya lleva cifra: el defecto que la impedía se arregló el 2026-10-05.** Hasta entonces
                esta era la única sección plegada sin ella, porque la cifra habría sido falsa —
                `getLotDetail` buscaba la auditoría con `entityId = lotId` y las escrituras guardan el id
                del PROPIO evento, así que de las 1.792 filas de esos cinco tipos esta pantalla podía
                encontrar **0**, en los 108 lotes. Hoy la lectura resuelve los ids de los hechos y además
                pregunta por el tipo `lot`, que es el único que sí lleva el id del lote. Ver la cabecera de
                `getLotDetail`.
                **Y el tope se dice, no se esconde:** `leerEnmiendas` corta en 50, así que con 50 filas la
                cifra sería un suelo y no un total — se rotula «50 o más», igual que las tareas con su 20.
                Medido el 2026-10-05: el lote con más historia tenía 9 filas y ninguno de los 108 pasaba
                de 50, así que hoy esa rama no se pinta nunca; está porque el día que se pase, la pantalla
                no debe afirmar un total que no sabe. */}
            <span className="nn-resumen-cifra">
              {auditEvents.length === 50 ? t("resumenTope", { count: 50 }) : t("resumenHistorial", { count: auditEvents.length })}
            </span>
          </summary>
          {auditEvents.length === 0 ? (
            <p className="nn-muted">{t("noHistory")}</p>
          ) : (
            <ul>
              {auditEvents.map((ev) => (
                <li key={ev.id}>
                  {ev.operation} — {cuando(ev.occurredAt)}
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>
    </div>
  );
}
