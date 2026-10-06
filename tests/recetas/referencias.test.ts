/**
 * Las referencias del paquete «farm-to-green v2» que la receta enseña junto a cada paso (Parte 2a,
 * tarea 2; diseño §3.5 y §6). Hermética: lee la copia `lib/recetas/referenciasDelPaquete.json`.
 *
 * Cada `describe` es una regla del paquete (`00_CLAUDE_CODE_PROMPT.md`, «non-negotiable rules») y lleva
 * su control al lado. La copia es de `docs/reference/farm-management/04_reference_parameters.json`, que está
 * versionado en el repositorio (PR #638): el sha256 de abajo dice cuál, y la segunda prueba compara la copia con ese
 * original, parámetro por parámetro. Si alguien actualiza el original sin volver a copiar, o la regenera desde otra
 * versión u otra ruta, esta prueba cae hasta que se mire a propósito.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import copia from "../../lib/recetas/referenciasDelPaquete.json";
import { VARIABLE_CATALOGS } from "../../lib/research/catalogs";
import { referenciasDelTipo, SINONIMOS_ENTRE_CATALOGOS, type ReferenciaDelPaquete } from "../../lib/recetas/referencias";
import { TIPOS_DE_PASO, type TipoDePaso } from "../../lib/recetas/vocabulario";

interface Fila {
  key: string;
  source: string | string[];
  confidence: string;
  value?: unknown;
  min?: number;
  max?: number;
  profile?: string;
  alt?: Record<string, unknown>;
  note?: string;
  tiposDePaso: TipoDePaso[];
}
const PARAMETROS = (copia as unknown as { parametros: Fila[] }).parametros;
const RAIZ = new URL("../..", import.meta.url).pathname;
/** El original del paquete, versionado en el repositorio (PR #638). */
const ORIGINAL = "docs/reference/farm-management/04_reference_parameters.json";

function referencia(parametro: string, tipo: TipoDePaso): ReferenciaDelPaquete {
  const r = referenciasDelTipo(tipo).find((x) => x.parametro === parametro);
  if (!r) throw new Error(`${parametro} no sale en ${tipo}`);
  return r;
}

describe("la copia dice de dónde salió", () => {
  it("es la v2.0 del paquete, con el sha256 del archivo que se copió", () => {
    expect(copia._procedencia.version).toBe("2.0");
    expect(copia._procedencia.sha256).toBe("3779d9d798675d7cd7a0b5f536efb4181f2e22a386541a9e10bba266a9cd97a2");
  });

  it("remite al original versionado en el repositorio, y es idéntica a él parámetro por parámetro", () => {
    // El paquete entró al repositorio con el PR #638: ya no es un archivo «de fuera» que sólo su sha256 identifica, y la copia se
    // puede comparar con su original en cada corrida. Una copia hecha de otra ruta —que el guion marca con `original: null`— o un
    // original actualizado sin volver a copiar caen aquí.
    expect(copia._procedencia.original, "la copia no salió del original versionado: volver a correr el guion, sin argumentos").toBe(ORIGINAL);
    const bytes = readFileSync(join(RAIZ, ORIGINAL));
    expect(createHash("sha256").update(bytes).digest("hex"), "el original cambió, o la copia es de otra versión").toBe(
      copia._procedencia.sha256,
    );
    const original = JSON.parse(bytes.toString("utf8")) as { parameters: { key: string }[] };
    const porClave = new Map(original.parameters.map((p) => [p.key, p]));
    expect(PARAMETROS, "control: se leyó la copia entera").toHaveLength(51);
    // Los campos del paquete, tal cual: todo menos `tiposDePaso`, que es inferencia de la casa.
    const sinTipos = (p: Fila) => Object.fromEntries(Object.entries(p).filter(([clave]) => clave !== "tiposDePaso"));
    const distintos = PARAMETROS.filter((p) => !isDeepStrictEqual(sinTipos(p), porClave.get(p.key))).map((p) => p.key);
    expect(distintos).toEqual([]);
  });

  it("cada parámetro trae fuente y confianza del paquete, un valor, y tipos de paso que existen", () => {
    expect(PARAMETROS, "control: se leyó la copia entera").toHaveLength(51);
    const mal = PARAMETROS.flatMap((p) => {
      const errores: string[] = [];
      if (!(typeof p.source === "string" ? p.source : p.source.join("")).trim()) errores.push(`${p.key}: sin fuente`);
      if (!["high", "medium", "low"].includes(p.confidence)) errores.push(`${p.key}: confianza «${p.confidence}»`);
      if (p.value === undefined && p.min === undefined && p.max === undefined) errores.push(`${p.key}: sin valor`);
      if (p.tiposDePaso.length === 0) errores.push(`${p.key}: sin tipo de paso`);
      for (const t of p.tiposDePaso) {
        if (!(TIPOS_DE_PASO as readonly string[]).includes(t)) errores.push(`${p.key}: tipo «${t}» que no existe`);
      }
      return errores;
    });
    expect(mal).toEqual([]);
  });
});

describe("el ejemplo del diseño §6: «volteo ≥ 3–4 al día · Cenicafé · alta»", () => {
  it("sale en el secado tal cual, sin marca y precargable", () => {
    expect(referencia("drying.turns_per_day_min", "drying")).toEqual({
      parametro: "drying.turns_per_day_min",
      tipoDePaso: "drying",
      valor: "3–4 turns/day",
      fuente: "CENICAFE AT577",
      confianza: "high",
      alternativas: [],
      marcarVisible: false,
      noPrecargar: false,
      nota: "ACT-INV 'hourly' unsupported; Codex 'constantly during daytime'.",
    });
  });

  it("un tipo sin referencias devuelve una lista vacía, y uno con ellas sólo las suyas", () => {
    expect(referenciasDelTipo("decaf")).toEqual([]);
    const delSecado = referenciasDelTipo("drying");
    expect(delSecado).toHaveLength(22);
    expect(delSecado.every((r) => r.tipoDePaso === "drying")).toBe(true);
  });
});

describe("el formato de cada referencia: valor y fuente, tal cual salen en pantalla", () => {
  // Una referencia por cada forma en que el paquete da un valor (`valorDe` y `texto`, en `lib/recetas/referencias.ts`) y por
  // cada forma de fuente. Los textos de abajo son los que el código produce hoy —medidos, no deducidos— y lo que el paquete
  // dice en inglés sale sin traducir. Sin esto, invertir un `≤`, quitar un tope o perder los nombres de un valor con
  // sub-valores dejaba las demás pruebas en verde: ninguna miraba el TEXTO del valor, sólo que hubiera referencia.
  //
  // `combo` dice de qué está hecho el parámetro (`rama · forma del valor`): el primer caso comprueba que cada referencia
  // fijada sea de verdad de esa forma, y el segundo que ninguna forma que la copia trae quede sin fijar.
  const rama = (p: Fila): string => {
    if (p.value !== undefined && p.max !== undefined && p.min === undefined) return "valor con tope";
    if (p.value !== undefined) return "valor";
    if (p.min !== undefined && p.max !== undefined) return "rango";
    if (p.max !== undefined) return "sólo tope";
    if (p.min !== undefined) return "sólo mínimo";
    return "sin valor";
  };
  const forma = (v: unknown): string => {
    if (v === undefined) return "—";
    if (Array.isArray(v)) return "lista";
    return v !== null && typeof v === "object" ? "objeto" : typeof v;
  };
  const combo = (p: Fila): string => `${rama(p)} · ${forma(p.value)}`;

  const CASOS: { clave: string; tipo: TipoDePaso; combo: string; valor: string; fuente: string }[] = [
    { clave: "harvest.max_floaters_pct", tipo: "reception", combo: "sólo tope · —", valor: "≤ 5 %", fuente: "VNT-2025" },
    { clave: "drying.layer_depth_cm.solar_dryer", tipo: "drying", combo: "valor con tope · number", valor: "2 (≤ 4) cm", fuente: "CENICAFE AT577 · perfil CENICAFE" },
    {
      clave: "drying.final_moisture_pct",
      tipo: "drying",
      combo: "rango · —",
      valor: "10–12 % w.b.",
      fuente: "ANACAFE-2018 + CENICAFE + VNT-2025 + ACT-INV-2026",
    },
    { clave: "process.depulp_warn_hours", tipo: "pulping", combo: "valor · number", valor: "10 h after picking", fuente: "ANACAFE-2018 · perfil ANACAFE" },
    {
      clave: "drying.interruption_rule",
      tipo: "drying",
      combo: "valor · string",
      valor: "warn on any stop while moisture > 30–40 % (aw > 0.90); planned nightly stop allowed below that with cool-down log",
      fuente: "CENICAFE AT562 + ANACAFE-2018 + NN gate",
    },
    { clave: "drying.mech_air_temp_max_c", tipo: "drying", combo: "valor · objeto", valor: "static: 50 · rotary: 60 °C", fuente: "CENICAFE + ANACAFE-2018" },
    {
      // El objeto cuyos sub-valores son pares de números: la rama «a–b» de `texto`.
      clave: "harvest.brix_by_stage_reference",
      tipo: "reception",
      combo: "valor · objeto",
      valor: "unripe: 17.9–18.3 · semi_ripe: 19.5–19.8 · ripe: 21.2–21.5 · overripe: 22.1–23.8 °Brix (mucilage, cv. Colombia)",
      fuente: "MARTINEZ-2017 + CENICAFE",
    },
    { clave: "storage.packaging_enum", tipo: "storage", combo: "valor · lista", valor: "jute, sisal, fique, hermetic_multilayer, vacuum, other", fuente: "NN" },
    { clave: "drying.direct_firing_allowed", tipo: "drying", combo: "valor · boolean", valor: "false", fuente: "CENICAFE" },
  ];

  it.each(CASOS)("$clave en $tipo: $combo", (c) => {
    const fila = PARAMETROS.find((p) => p.key === c.clave);
    expect(fila, `${c.clave} no está en la copia`).toBeDefined();
    expect(combo(fila!), `${c.clave} ya no es de la forma que este caso fija`).toBe(c.combo);
    const r = referencia(c.clave, c.tipo);
    expect({ valor: r.valor, fuente: r.fuente }).toEqual({ valor: c.valor, fuente: c.fuente });
  });

  it("control: las formas de los casos son exactamente las que la copia trae, ninguna sin fijar", () => {
    expect(PARAMETROS, "control: se leyó la copia entera").toHaveLength(51);
    expect([...new Set(CASOS.map((c) => c.combo))].sort()).toEqual([...new Set(PARAMETROS.map(combo))].sort());
    // La rama «sólo mínimo» (`≥ n`) y la de «sin valor» (`—`) no las dispara ningún parámetro de la copia: no hay dato con el
    // que fijarlas, y esta prueba cae el día que aparezca uno para que se fije entonces.
  });
});

describe("la nota del paquete sale con su referencia (registro I6)", () => {
  const conNota = PARAMETROS.filter((p) => p.note !== undefined);

  it("salen las 22, tal cual, en cada tipo de paso al que aplican", () => {
    expect(conNota, "control: 22 de los 51 parámetros copiados traen nota").toHaveLength(22);
    const mal = conNota.flatMap((p) =>
      p.tiposDePaso.flatMap((t) => (referencia(p.key, t).nota === p.note ? [] : [`${p.key} en ${t}`])),
    );
    expect(mal).toEqual([]);
    // Y por la API pública, sin pasar por la copia: 22 parámetros distintos salen con nota.
    const salen = new Set(
      TIPOS_DE_PASO.flatMap((t) => referenciasDelTipo(t).filter((r) => r.nota !== null).map((r) => r.parametro)),
    );
    expect(salen.size).toBe(22);
  });

  it("control: un parámetro sin nota da null —no una cadena vacía— y las salvedades que importan están", () => {
    expect(referencia("drying.final_moisture_pct", "drying").nota).toBeNull();
    expect(referencia("drying.water_activity_target_optional", "drying").nota).toBe("Importer soft target, not a standard.");
    expect(referencia("process.sealed_vessel_pressure_max_kpa", "fermentation").nota).toBe(
      "Vendor rating; never exceed vessel rating.",
    );
  });
});

describe("los sinónimos entre catálogos son sólo para mostrar (registro I7)", () => {
  const destino = (s: { catalogo: string; valor: string }) =>
    VARIABLE_CATALOGS.find((c) => c.key === s.catalogo)?.values.find((v) => v.value === s.valor);

  it("cada destino existe en su catálogo y es un valor canónico, no un alias", () => {
    expect(SINONIMOS_ENTRE_CATALOGOS, "control: son los tres del diseño §7 y del eje D").toHaveLength(3);
    const mal = SINONIMOS_ENTRE_CATALOGOS.flatMap((s) => {
      const v = destino(s);
      if (!v) return [`«${s.termino}» → ${s.catalogo}.${s.valor}: no existe`];
      return v.aliasOf === undefined ? [] : [`«${s.termino}» → ${s.catalogo}.${s.valor}: es un alias de ${v.aliasOf}`];
    });
    expect(mal).toEqual([]);
  });

  it("dicen lo que el diseño dice: mosto propio y mosto de otro fermento son del medio de lavado; backslopped es doble_mosto", () => {
    const por = Object.fromEntries(SINONIMOS_ENTRE_CATALOGOS.map((s) => [s.termino, `${s.catalogo}.${s.valor}`]));
    expect(por).toEqual({
      "mosto propio": "medio_lavado.mosto_propio",
      "mosto de otro fermento": "medio_lavado.mosto_de_otro_lote",
      backslopped: "sustrato_anadido.doble_mosto",
    });
  });
});

describe("regla 2 — nunca elegir una autoridad en silencio", () => {
  it("el perfil del valor va en su fuente, y el valor de otra autoridad es una alternativa", () => {
    const patio = referencia("drying.layer_depth_cm.patio", "drying");
    expect(patio.valor).toBe("3–5 cm");
    expect(patio.fuente).toBe("CODEX-CXC69 · perfil CODEX_ISO_SCA");
    expect(patio.alternativas).toEqual([{ valor: "7 cm", fuente: "ANACAFE" }]);
    expect(referencia("storage.temp_c_ref", "storage").alternativas).toEqual([
      { valor: "20 °C", fuente: "ANACAFE" },
      { valor: "10–12 °C", fuente: "CENICAFE_extended_life" },
    ]);
  });

  it("ningún parámetro de la copia pierde un perfil ni una alternativa", () => {
    const conAutoridades = PARAMETROS.filter((p) => p.profile !== undefined || p.alt !== undefined);
    expect(conAutoridades, "control: los seis copiados que traen perfil o alternativa").toHaveLength(6);
    const pierden = conAutoridades.flatMap((p) =>
      p.tiposDePaso.flatMap((t) => {
        const r = referencia(p.key, t);
        const faltas: string[] = [];
        if (p.profile !== undefined && !r.fuente.includes(`perfil ${p.profile}`)) faltas.push(`${p.key} en ${t}: perfil`);
        if (r.alternativas.length !== Object.keys(p.alt ?? {}).length) faltas.push(`${p.key} en ${t}: alternativas`);
        return faltas;
      }),
    );
    expect(pierden).toEqual([]);
  });

  it("las esperas antes de despulpar de Anacafé y de Cenicafé salen juntas (05 §4: modelar, no resolver)", () => {
    for (const tipo of ["pulping", "prefermentacion"] as const) {
      expect(referenciasDelTipo(tipo).map((r) => r.parametro)).toEqual(
        expect.arrayContaining(["process.depulp_warn_hours", "process.cherry_hold_no_loss_hours"]),
      );
    }
    expect(referencia("process.depulp_warn_hours", "pulping").fuente).toBe("ANACAFE-2018 · perfil ANACAFE");
    expect(referencia("process.cherry_hold_no_loss_hours", "pulping").fuente).toBe("CENICAFE · perfil CENICAFE");
  });
});

describe("regla 7 — low y NN se marcan visiblemente; NN se lee en la FUENTE, no en la confianza", () => {
  it("low se marca", () => {
    expect(referencia("drying.water_activity_target_optional", "drying")).toMatchObject({ confianza: "low", marcarVisible: true });
  });

  it("NN se marca aunque la confianza no sea low", () => {
    // `drying.interruption_rule` es medium y una de sus tres fuentes es «NN gate».
    expect(referencia("drying.interruption_rule", "drying")).toMatchObject({ confianza: "medium", marcarVisible: true });
    expect(referencia("storage.packaging_enum", "storage")).toMatchObject({ confianza: "medium", fuente: "NN", marcarVisible: true });
  });

  it("control: lo que es high y no es NN no se marca", () => {
    expect(referencia("drying.final_moisture_pct", "drying").marcarVisible).toBe(false);
  });

  it("son exactamente los nueve que el paquete marca entre los copiados", () => {
    const marcados = [
      ...new Set(TIPOS_DE_PASO.flatMap((t) => referenciasDelTipo(t).filter((r) => r.marcarVisible).map((r) => r.parametro))),
    ].sort();
    expect(marcados).toEqual([
      "drying.aw_0.95_to_0.80_max_days",
      "drying.interruption_rule",
      "drying.water_activity_target_optional",
      "drying.water_activity_warn",
      "drying.wet_hull_moisture_pct",
      "harvest.max_floaters_pct",
      "harvest.ripe_brix_plausibility",
      "process.washed_fermentation_hours_generic",
      "storage.packaging_enum",
    ]);
  });
});

describe("regla 3 — los valores del lavado genérico se ENSEÑAN y nunca precargan un paso", () => {
  const GENERICOS = ["process.washed_fermentation_hours_generic", "process.washed_ph_endpoint_info"];

  it("salen en la fermentación, con la marca de no precargar", () => {
    for (const clave of GENERICOS) expect(referencia(clave, "fermentation").noPrecargar, clave).toBe(true);
  });

  it("ningún tipo de paso los ofrece como valor por defecto", () => {
    // Ni CryoBloom, ni una inoculada, ni ninguna receta propia: en la 2a no existe la receta «lavado
    // genérico», que es la única a la que el paquete los deja aplicar.
    const precargables = TIPOS_DE_PASO.flatMap((t) => referenciasDelTipo(t).filter((r) => !r.noPrecargar).map((r) => r.parametro));
    expect(precargables, "control: el filtro deja pasar las demás").toHaveLength(52);
    expect(precargables.filter((c) => GENERICOS.includes(c))).toEqual([]);
  });

  it("control: una referencia de fermentación que no es genérica sí se puede precargar", () => {
    expect(referencia("process.time_past_endpoint_warn_h", "fermentation").noPrecargar).toBe(false);
  });
});

describe("regla 7 — lo que un fabricante dice de su producto nunca precarga un paso", () => {
  it("las dosis de SafCoffee (Fermentis) se enseñan en la inoculación y no precargan", () => {
    expect(referencia("inoculum.safcoffee.dose_g_per_kg", "inoculation")).toMatchObject({
      fuente: "FERMENTIS",
      confianza: "high",
      noPrecargar: true,
    });
  });

  it("tampoco su temperatura ni su rehidratación, ni el límite de presión de un tanque de Penagos", () => {
    for (const clave of ["inoculum.safcoffee.temp_c", "inoculum.safcoffee.rehydration"]) {
      expect(referencia(clave, "inoculation").noPrecargar, clave).toBe(true);
    }
    expect(referencia("process.sealed_vessel_pressure_max_kpa", "fermentation").noPrecargar).toBe(true);
  });

  it("control: high y de un instituto, sí se puede precargar", () => {
    expect(referencia("drying.final_moisture_pct", "drying").noPrecargar).toBe(false);
  });
});
