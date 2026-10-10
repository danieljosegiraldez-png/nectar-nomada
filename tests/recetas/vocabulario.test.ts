/**
 * El vocabulario de la receta con pasos (Parte 2a, tarea 2). Hermética: lee `lib/recetas/vocabulario.ts`
 * y `lib/research/catalogs.ts`, que no importan nada; corre en el carril sin base de `scripts/ci.sh`.
 *
 * Las listas literales de abajo son una SEGUNDA copia a propósito, como `CODIGOS_QUE_EL_DISENO_NOMBRA`
 * en `mensajesDeProceso.test.ts`: comparar el vocabulario consigo mismo no cazaría que alguien lo
 * encoja. La de los tipos se copió de `docs/reference/farm-management/master_data/processing_axes.json` del
 * paquete «farm-to-green v2», versionado en el repositorio (v2.0, sha256 c1e9c6c5…, clave `step_types`); la de
 * los registros, de la tabla §4.1 del diseño de la 2a.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VARIABLE_CATALOGS } from "../../lib/research/catalogs";
import {
  EJES_POR_TIPO_DE_PASO,
  FASE_DEL_TIPO,
  TIPOS_DE_PASO,
  TIPOS_POR_REGISTRO,
  TRAMOS_DE_MUCILAGO,
  type EjeDelPaso,
  type TipoDePaso,
} from "../../lib/recetas/vocabulario";

const DEL_PAQUETE = [
  "reception", "sorting_flotation", "sanitation", "cold_hold", "freezing", "pulping", "demucilage",
  "fermentation", "immersion_hot", "immersion_cold", "inoculation", "addition", "washing", "soaking",
  "drying", "hulling_wet", "reposo", "storage", "aging", "monsooning", "barrel_aging", "decaf", "milling",
];

const EJES: readonly EjeDelPaso[] = [
  "estadoFruto", "mucilagoObjetivo", "oxigeno", "temperatura", "fuenteMicrobiana", "medio", "fisico", "modoSecado", "adiciones",
];

const catalogo = (clave: string) => VARIABLE_CATALOGS.find((c) => c.key === clave);
const valores = (clave: string) => (catalogo(clave)?.values ?? []).map((v) => v.value);
const definicion = (clave: string, valor: string) => catalogo(clave)?.values.find((v) => v.value === valor)?.definition ?? "";
const conEje = (eje: EjeDelPaso) => TIPOS_DE_PASO.filter((t) => EJES_POR_TIPO_DE_PASO[t].includes(eje));

describe("los tipos de paso", () => {
  it("son los 23 del paquete, en su orden y con sus ids, y prefermentacion al final (D1)", () => {
    expect(DEL_PAQUETE).toHaveLength(23);
    expect(TIPOS_DE_PASO).toEqual([...DEL_PAQUETE, "prefermentacion"]);
  });

  it("el catálogo tipo_paso declara exactamente los mismos, en el mismo orden", () => {
    expect(valores("tipo_paso")).toEqual([...TIPOS_DE_PASO]);
  });

  it("las definiciones de la casa están donde se leen (diseño §7), con la escala de lo que QUEDA", () => {
    expect(definicion("grado_proceso", "Washed")).toMatch(/sin nada de mucílago/);
    expect(definicion("grado_proceso", "Washed")).toMatch(/le queda el 0 %/);
    expect(definicion("grado_proceso", "Honey")).toMatch(/100 % del mucílago retenido/);
    expect(definicion("grado_proceso", "Honey")).toMatch(/le queda el 100 %/);
    // Los dos semi-lavados que ya existían nacieron sin definición; hoy dicen qué le queda al café (Daniel, 2026-10-03).
    expect(definicion("grado_proceso", "Semi Wash 50%")).toMatch(/le queda el 50 %/);
    expect(definicion("grado_proceso", "Semi Wash 75%")).toMatch(/le queda el 75 %/);
    expect(definicion("tipo_paso", "washing")).toMatch(/sin nada de mucílago/);
    expect(definicion("tipo_paso", "washing")).toMatch(/le queda el 0 %/);
    expect(definicion("tipo_paso", "prefermentacion")).toMatch(/fiebre/);
    expect(definicion("tipo_paso", "prefermentacion")).toMatch(/sacos de cosecha sin sellar/);
    expect(definicion("tipo_paso", "fermentation")).toMatch(/resultados, no métodos/);
  });

  it("la recepción no promete una comparación que todavía no existe: dice que ningún registro del proceso la cumple (diseño §4.5, F1-4)", () => {
    // El aviso de la recepción (compararla, al leer la ficha, con las recepciones del lote) es del PR-B: la definición sembrada no lo cuenta como hecho.
    const reception = definicion("tipo_paso", "reception");
    expect(reception).toMatch(/Ningún registro del proceso la cumple\./);
    expect(reception, "la comparación con las recepciones del lote es del PR-B").not.toMatch(/se compara|recepciones del lote/);
    expect(reception, "la frase vieja («al abrir el proceso») no vuelve").not.toMatch(/al abrir el proceso/);
  });
});

describe("la escala del mucílago: lo que QUEDA (decisión de Daniel, 2026-10-03)", () => {
  it("son seis tramos, de 0 (Lavado) a 100 (Honey)", () => {
    expect([...TRAMOS_DE_MUCILAGO]).toEqual([0, 10, 25, 50, 75, 100]);
  });

  it("son los mismos que el CHECK de la base: la lista del código y la de la migración no se separan", () => {
    const carpetas = readdirSync("prisma/migrations").filter((n) => /^[0-9]{14}_receta_con_pasos$/.test(n));
    expect(carpetas, "control: hay UNA migración receta_con_pasos (tarea 1)").toHaveLength(1);
    const sql = readFileSync(`prisma/migrations/${carpetas[0]}/migration.sql`, "utf8");
    const check = sql.match(/"process_recipe_step_mucilago_en_tramos"\s+CHECK \("mucilago_objetivo" IN \(([^)]*)\)\)/);
    expect(check, "no encontré el CHECK process_recipe_step_mucilago_en_tramos en la migración").not.toBeNull();
    const enLaBase = check![1]!.split(",").map((n) => Number(n.trim()));
    expect(enLaBase.length, "control: se leyeron los números del IN").toBeGreaterThan(0);
    expect(enLaBase).toEqual([...TRAMOS_DE_MUCILAGO]);
  });
});

describe("qué registro cumple qué paso", () => {
  it("es la tabla §4.1 del diseño", () => {
    expect(TIPOS_POR_REGISTRO).toEqual({
      fermentationRun: ["fermentation", "prefermentacion", "cold_hold", "soaking", "immersion_hot", "immersion_cold"],
      dryingRun: ["drying"],
      lotProcessIntervention: ["pulping", "demucilage", "washing", "sorting_flotation", "sanitation", "inoculation", "addition"],
      fermentationIntervention: ["inoculation", "addition"],
    });
  });

  it("cada tipo que un registro cumple está en TIPOS_DE_PASO", () => {
    // El tipo de TypeScript no lo garantiza: un id puede estar en la unión `TipoDePaso` y faltar en el
    // ARREGLO, que es lo que recorren la pantalla y la semilla.
    const cumplidos = Object.values(TIPOS_POR_REGISTRO).flat();
    expect(cumplidos.length).toBeGreaterThan(0);
    expect(cumplidos.filter((t) => !TIPOS_DE_PASO.includes(t))).toEqual([]);
  });

  it("la fase de un tipo es la de la corrida que lo cumple; los demás no tienen fase (§3.2)", () => {
    for (const t of TIPOS_POR_REGISTRO.fermentationRun) expect(FASE_DEL_TIPO[t], t).toBe("fermentation");
    for (const t of TIPOS_POR_REGISTRO.dryingRun) expect(FASE_DEL_TIPO[t], t).toBe("drying");
    const conCorrida = new Set<TipoDePaso>([...TIPOS_POR_REGISTRO.fermentationRun, ...TIPOS_POR_REGISTRO.dryingRun]);
    const sinCorrida = TIPOS_DE_PASO.filter((t) => !conCorrida.has(t));
    expect(sinCorrida.length, "control: la mitad negativa mira algo").toBe(17);
    expect(sinCorrida.filter((t) => FASE_DEL_TIPO[t] !== undefined)).toEqual([]);
  });
});

describe("qué ejes aplican a cada tipo (inferencia de la casa, no del paquete)", () => {
  it("hay una fila por tipo, sin ejes inventados ni repetidos", () => {
    expect(Object.keys(EJES_POR_TIPO_DE_PASO).sort()).toEqual([...TIPOS_DE_PASO].sort());
    for (const [tipo, ejes] of Object.entries(EJES_POR_TIPO_DE_PASO)) {
      expect(ejes.filter((e) => !EJES.includes(e)), tipo).toEqual([]);
      expect(new Set(ejes).size, `${tipo} repite un eje`).toBe(ejes.length);
    }
  });

  it("el tramo de mucílago sólo va en el lavado y el desmucilaginado (2b §8.2), y ahí junto al estado del fruto", () => {
    // 2b §8.2: cada paso `washing` / `demucilage` declara `mucilagoObjetivo`, y es la ÚNICA fuente del tramo. Lo llevaban
    // también `pulping`, `fermentation` y `drying` cuando la escala era la de lo quitado: nadie lo lee ahí.
    expect(conEje("mucilagoObjetivo")).toEqual(["demucilage", "washing"]);
    // En el paquete es un campo del eje A (`mucilage_retained_pct`, que es la misma dirección: lo que queda): sin
    // estado del fruto no significa nada.
    expect(conEje("mucilagoObjetivo").filter((t) => !EJES_POR_TIPO_DE_PASO[t].includes("estadoFruto"))).toEqual([]);
  });

  it("sólo el secado lleva modo de secado, y lo lleva", () => {
    expect(conEje("modoSecado")).toEqual(["drying"]);
  });

  it("la inoculación declara su fuente microbiana y sus adiciones; la adición, sólo sus adiciones", () => {
    expect(EJES_POR_TIPO_DE_PASO.inoculation).toEqual(expect.arrayContaining(["fuenteMicrobiana", "adiciones"]));
    expect(EJES_POR_TIPO_DE_PASO.addition).toEqual(["adiciones"]);
  });

  it("la fermentación lleva los ejes A–E que trae toda fermentación del paquete", () => {
    expect(EJES_POR_TIPO_DE_PASO.fermentation).toEqual(
      expect.arrayContaining(["estadoFruto", "oxigeno", "temperatura", "fuenteMicrobiana", "adiciones"]),
    );
  });

  it("la tabla completa, fila por fila: ningún tipo gana ni pierde un eje sin que esta prueba lo diga", () => {
    // Segunda copia a propósito, como la de `TIPOS_POR_REGISTRO` más arriba: las pruebas de arriba fijan los ejes que importan
    // (mucílago, secado, inoculación, fermentación) y dejaban sin aserción la mayoría de las 24 filas, así que quitarle
    // `fuenteMicrobiana` a `cold_hold` o `oxigeno` a `prefermentacion` no las tocaba. El orden también cuenta: es el que la
    // pantalla de la receta enseña. Si Daniel corrige una fila, se cambia aquí y en `lib/recetas/vocabulario.ts`.
    const ESPERADOS: Record<TipoDePaso, readonly EjeDelPaso[]> = {
      reception: [],
      sorting_flotation: [],
      sanitation: ["fisico"],
      cold_hold: ["estadoFruto", "temperatura", "fuenteMicrobiana"],
      freezing: ["estadoFruto", "temperatura"],
      pulping: ["estadoFruto"],
      demucilage: ["estadoFruto", "mucilagoObjetivo", "adiciones"],
      fermentation: ["estadoFruto", "oxigeno", "temperatura", "fuenteMicrobiana", "fisico", "adiciones"],
      immersion_hot: ["estadoFruto", "temperatura"],
      immersion_cold: ["estadoFruto", "oxigeno", "temperatura"],
      inoculation: ["fuenteMicrobiana", "adiciones"],
      addition: ["adiciones"],
      washing: ["estadoFruto", "mucilagoObjetivo", "medio"],
      soaking: ["oxigeno", "medio"],
      drying: ["estadoFruto", "modoSecado"],
      hulling_wet: ["estadoFruto"],
      reposo: [],
      storage: [],
      aging: [],
      monsooning: [],
      barrel_aging: ["adiciones"],
      decaf: [],
      milling: [],
      prefermentacion: ["estadoFruto", "oxigeno", "temperatura", "fuenteMicrobiana"],
    };
    expect(Object.keys(ESPERADOS), "control: la copia literal tiene una fila por tipo").toHaveLength(24);
    expect(Object.keys(ESPERADOS).sort()).toEqual([...TIPOS_DE_PASO].sort());
    const distintas = TIPOS_DE_PASO.flatMap((t) =>
      ESPERADOS[t].join(",") === EJES_POR_TIPO_DE_PASO[t].join(",")
        ? []
        : [`${t}: esperaba [${ESPERADOS[t].join(", ")}] y hay [${EJES_POR_TIPO_DE_PASO[t].join(", ")}]`],
    );
    // El mensaje nombra la fila: el aviso compacto de vitest sólo dice «[ Array(1) ]» y el diff queda fuera de los reportes cortos.
    expect(distintas, distintas.join(" · ")).toEqual([]);
  });
});

describe("los catálogos nuevos y los ampliados (diseño §7)", () => {
  it("fisico tiene sólo lo que no existe en otro sitio: ni frío, ni congelar, ni inmersiones", () => {
    expect(valores("fisico")).toEqual(["ninguno", "agitacion", "presion", "ultrasonido", "ozono_uv"]);
  });

  it("capacidad tiene lo que el paquete pide comprobar al planear, sin nombrar ningún equipo", () => {
    expect(valores("capacidad")).toEqual(["sellable", "valvula", "puertos_de_gas", "control_temperatura", "oscuridad"]);
  });

  it("estado_cereza gana los estados del eje A que faltaban, detrás de los dos de siempre", () => {
    // Detrás: la semilla pone `displayOrder` por posición, y meterlos delante cambiaría el orden del
    // desplegable obligatorio de abrir proceso, que hoy empieza por «entera».
    expect(valores("estado_cereza")).toEqual([
      "entera",
      "despulpada",
      "despulpada_con_mucilago",
      "despulpada_mucilago_parcial",
      "sin_mucilago_por_fermentacion",
      "sin_mucilago_por_maquina",
      "sin_mucilago_por_enzimas",
      "pergamino_trillado_humedo",
      "verde",
    ]);
  });

  it("fuente_microbiana gana la bioprotección, al final de su lista", () => {
    expect(valores("fuente_microbiana")).toEqual(["espontanea", "levadura_inoculada", "bacterias_lab", "koji", "cultivo_mixto", "bioproteccion"]);
  });

  it("la bioprotección cita una decisión que existe: la decisión 7 de ADR-051, que es la suya", () => {
    // La definición sembrada citó «ADR-053, decisión 7», que no existe (ADR-053 llega a la 6): la cita se comprueba contra
    // `docs/architecture/DECISIONS.md`, no se da por buena. La decisión 7 de ADR-051 es la que declara que la bioprotección
    // es constitutiva del método.
    const cita = definicion("fuente_microbiana", "bioproteccion").match(/(ADR-\d+), decisión (\d+)/);
    expect(cita, "la definición ya no cita «ADR-NNN, decisión N»").not.toBeNull();
    const [, adr, n] = cita!;
    const decisiones = readFileSync("docs/architecture/DECISIONS.md", "utf8");
    const inicio = decisiones.indexOf(`\n## ${adr} `);
    expect(inicio, `control: ${adr} tiene encabezado en DECISIONS.md`).toBeGreaterThan(-1);
    const fin = decisiones.indexOf("\n## ADR-", inicio + 1);
    const seccion = decisiones.slice(inicio, fin);
    expect(seccion, `${adr} no tiene una «Decision ${n}» sobre bioprotección`).toMatch(new RegExp(`\\*\\*Decision ${n} — bioprotection`));
  });

  it("las definiciones de los estados con mucílago dicen cuánto LE QUEDA, nunca cuánto se quitó", () => {
    const parcial = definicion("estado_cereza", "despulpada_mucilago_parcial");
    expect(parcial).toMatch(/le queda/);
    expect(parcial, "la escala vieja (ADR-181 #12) no vuelve por esta definición").not.toMatch(/quitado/i);
    expect(definicion("estado_cereza", "despulpada_con_mucilago")).toMatch(/le queda el 100 %/);
  });

  it("todo valor nuevo trae definición y ninguno es un alias", () => {
    // Un alias no cruza catálogos (la semilla lanza, `prisma/seed.ts:120–133`), y uno dentro del mismo
    // catálogo aparecería como opción aparte en los desplegables que no filtran `aliasOfId`. Los cuatro de
    // `sustrato_anadido` (registro I7) son de la tarea 8, que los añade con el filtro que los oculta y con su propia prueba.
    const nuevos = [
      ...["tipo_paso", "fisico", "capacidad"].flatMap((c) => (catalogo(c)?.values ?? []).map((v) => ({ c, v }))),
      ...(catalogo("estado_cereza")?.values ?? []).slice(2).map((v) => ({ c: "estado_cereza", v })),
      ...(catalogo("fuente_microbiana")?.values ?? []).slice(5).map((v) => ({ c: "fuente_microbiana", v })),
    ];
    expect(nuevos, "control: 24 + 5 + 5 + 7 + 1").toHaveLength(42);
    expect(nuevos.filter(({ v }) => !v.definition?.trim() || v.aliasOf !== undefined).map(({ c, v }) => `${c}.${v.value}`)).toEqual([]);
  });
});
