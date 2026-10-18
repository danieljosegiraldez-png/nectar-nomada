/**
 * Copia al repositorio las referencias del paquete «farm-to-green v2» que tocan un paso de proceso
 * (Parte 2a, 2026-10-03, diseño §3.5). El paquete YA está versionado en el repositorio —`docs/reference/farm-management/`,
 * desde el PR #638—, y de ahí sale la copia, desde la raíz y sin argumentos:
 *
 *   node scripts/copiar-referencias-del-paquete.mjs
 *
 * y escribe `lib/recetas/referenciasDelPaquete.json`, con `_procedencia.original` apuntando a ese archivo. Con una ruta como
 * argumento lee ESE archivo (la comprobación del aborto del paso 11 lo usa con una v1.0 fingida), pero entonces la copia queda con
 * `original: null`: dice que no salió del original versionado, y `tests/recetas/referencias.test.ts` cae hasta que se vuelva a
 * copiar de él.
 *
 * **Qué copia, tal cual:** cada parámetro de `CLAVES` con TODOS sus campos del paquete —valor, rango, unidad,
 * fuente, confianza, `profile`, `alt`, `scope`, `use`, `note`, `hard_bounds`—, sin tocar ninguno; y los
 * metadatos que explican esos campos (`sources`, `authority_profiles`, `confidence_scale`, `evidence_notes`).
 * **Qué añade:** `tiposDePaso`, a qué pasos aplica cada parámetro, y eso es INFERENCIA DE LA CASA: el paquete
 * no asigna sus parámetros a tipos de paso.
 *
 * **Qué no copia, y por qué:** agronomía, calibración de instrumentos, efluentes, subproductos, balance de
 * masas, transporte, disposición de la bodega y la norma legal de vertidos (157 de 208 parámetros): ningún
 * paso de una receta los usa. Si un día los usa, se añaden a `CLAVES` y se vuelve a correr.
 *
 * Aborta SIN escribir si el archivo no es la v2.0 o si le falta una clave de `CLAVES`: una copia a medias
 * se leería igual que una completa.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** El original del paquete, versionado en el repositorio (PR #638): de ahí sale la copia, y a él remite `_procedencia.original`. */
const ORIGINAL = "docs/reference/farm-management/04_reference_parameters.json";
const rutaDelOriginal = resolve(fileURLToPath(new URL("..", import.meta.url)), ORIGINAL);

/**
 * A qué tipos de paso aplica cada parámetro, en el orden del paquete. Asignado por el prefijo de la clave,
 * la tabla de mediciones por paso del paquete (R6 §7.2) y la columna «paso(s)» del reconocimiento u5.
 * Tres decisiones que no son obvias:
 * - Las tres esperas antes de despulpar (Anacafé 10 h, el tope de 24 h, Cenicafé 48 h) van JUNTAS a
 *   `pulping` y a `prefermentacion`: son un conflicto de autoridades que el paquete manda modelar y no
 *   resolver (05 §4), y separarlas sería elegir una en silencio (regla 2). La de 48 h es cereza en sacos que
 *   se calienta: la fiebre de la casa.
 * - `harvest.max_floaters_pct` va a la recepción y a la flotación: el paquete mide flotadores en las dos.
 * - El agua por kg de pergamino trae un valor por tecnología de despulpado, desmucilaginado y lavado: va a
 *   los tres.
 */
const CLAVES = {
  "harvest.ripe_brix_plausibility": ["reception"],
  "harvest.brix_by_stage_reference": ["reception"],
  "harvest.max_unripe_pct_warning": ["reception"],
  "harvest.min_ripe_pct_modified_fermentation": ["reception"],
  "harvest.max_floaters_pct": ["reception", "sorting_flotation"],
  "process.depulp_warn_hours": ["pulping", "prefermentacion"],
  "process.depulp_max_hours_after_harvest": ["pulping", "prefermentacion"],
  "process.cherry_hold_no_loss_hours": ["pulping", "prefermentacion"],
  "process.water_l_per_kg_cps": ["pulping", "demucilage", "washing"],
  "process.flotation_water_l_per_kg_cherry": ["sorting_flotation"],
  "process.washed_fermentation_hours_generic": ["fermentation"],
  "process.washed_ph_endpoint_info": ["fermentation"],
  "process.time_past_endpoint_warn_h": ["fermentation"],
  "process.fermentation_defect_risk_mass_temp_c": ["fermentation"],
  "process.mucilage_pct_of_depulped_mass": ["pulping", "demucilage"],
  "process.pulp_pct_of_cherry": ["pulping"],
  "process.tank_volume_l_per_kg_cherry": ["fermentation"],
  "process.tank_free_volume_pct": ["fermentation"],
  "process.pulper_quality_limits_pct": ["pulping"],
  "process.sealed_vessel_pressure_max_kpa": ["fermentation"],
  "inoculum.safcoffee.dose_g_per_kg": ["inoculation"],
  "inoculum.safcoffee.temp_c": ["inoculation"],
  "inoculum.safcoffee.rehydration": ["inoculation"],
  "drying.final_moisture_pct": ["drying"],
  "drying.max_moisture_pct": ["drying"],
  "drying.moisture_method": ["drying"],
  "drying.water_activity_fail": ["drying"],
  "drying.water_activity_warn": ["drying"],
  "drying.water_activity_target_optional": ["drying"],
  "drying.aw_at_10_12_pct_moisture_reference": ["drying"],
  "drying.layer_depth_cm.solar_dryer": ["drying"],
  "drying.layer_depth_cm.patio": ["drying"],
  "drying.layer_depth_cm.silo_max": ["drying"],
  "drying.solar_load_kg_m2": ["drying"],
  "drying.turns_per_day_min": ["drying"],
  "drying.mech_bean_temp_max_c": ["drying"],
  "drying.seed_bean_temp_max_c": ["drying"],
  "drying.mech_air_temp_max_c": ["drying"],
  "drying.airflow_m3_min_per_t_cps": ["drying"],
  "drying.air_reversal_h": ["drying"],
  "drying.interruption_rule": ["drying"],
  "drying.aw_0.95_to_0.80_max_days": ["drying"],
  "drying.direct_firing_allowed": ["drying"],
  "drying.night_rewetting_moisture_pct": ["drying"],
  "drying.cooling_before_bagging_h": ["drying"],
  "drying.reposo_days_min": ["reposo"],
  "drying.wet_hull_moisture_pct": ["hulling_wet"],
  "storage.temp_c_ref": ["storage"],
  "storage.rh_max_pct": ["storage"],
  "storage.rh_critical_pct": ["storage"],
  "storage.packaging_enum": ["storage"],
};

const ruta = process.argv[2] ?? rutaDelOriginal;
const bytes = readFileSync(ruta);
const paquete = JSON.parse(bytes.toString("utf8"));
if (paquete._meta?.version !== "2.0") {
  console.error(`ABORTA: se esperaba la versión 2.0 del paquete y llegó «${paquete._meta?.version}». No escribo nada.`);
  process.exit(1);
}
const porClave = new Map(paquete.parameters.map((p) => [p.key, p]));
const faltan = Object.keys(CLAVES).filter((clave) => !porClave.has(clave));
if (faltan.length > 0) {
  console.error(`ABORTA: el paquete no trae ${faltan.join(", ")}. No escribo nada.`);
  process.exit(1);
}

const salida = {
  _procedencia: {
    paquete: "farm-to-green v2 (Daniel, 2026-10-02)",
    archivo: "04_reference_parameters.json",
    // El original versionado del que salió la copia (PR #638), o `null` si se copió de otra ruta: una copia de otro sitio no remite
    // a nada que se pueda volver a comparar.
    original: resolve(ruta) === rutaDelOriginal ? ORIGINAL : null,
    version: paquete._meta.version,
    generado: paquete._meta.generated,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    copiadoCon: "scripts/copiar-referencias-del-paquete.mjs",
    tiposDePaso: "Inferencia de la casa, no del paquete: ver CLAVES en el guion.",
    proposito: paquete._meta.purpose,
    escalaDeConfianza: paquete._meta.confidence_scale,
    notasDeEvidencia: paquete._meta.evidence_notes,
    perfiles: paquete._meta.authority_profiles,
    fuentes: paquete._meta.sources,
  },
  parametros: Object.entries(CLAVES).map(([clave, tiposDePaso]) => ({ ...porClave.get(clave), tiposDePaso })),
};
writeFileSync(new URL("../lib/recetas/referenciasDelPaquete.json", import.meta.url), `${JSON.stringify(salida, null, 2)}\n`);
console.log(`copiados ${salida.parametros.length} de ${paquete.parameters.length} parámetros; sha256 ${salida._procedencia.sha256.slice(0, 12)}`);
