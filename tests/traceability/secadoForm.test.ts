import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AMBIENTES_DE_SECADO, leerInspeccion, leerUbicacionDeSecado, MATERIALES_DE_SECADO, PAPELES_DE_MUESTRA, ZONAS_DE_MUESTRA } from "../../lib/traceability/secadoForm";

function formulario() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ lotId: "lote", dryingBedLocationId: "cama", occurredAt: "2026-09-16T09:30", tzOffsetMinutes: "300",
    materialState_1: "PARCHMENT", materialState_2: "MUCILAGE_HONEY", samplingRole_1: "ZONE", samplingRole_2: "ZONE", samplingZone_1: "NORTH", samplingZone_2: "SOUTH" })) form.set(key, value);
  return form;
}
describe("el envío manual de secado", () => {
  it("reúne cama, hora local y dos muestras de zonas distintas sin inventar operador", () => {
    const result = leerInspeccion(formulario());
    expect(result).toMatchObject({ lotId: "lote", dryingBedLocationId: "cama", operatorPersonId: null, occurredAt: new Date("2026-09-16T14:30:00Z") });
    expect(result.muestras).toEqual([
      { materialState: "PARCHMENT", samplingRole: "ZONE", samplingZone: "NORTH", samplingZoneNote: null },
      { materialState: "MUCILAGE_HONEY", samplingRole: "ZONE", samplingZone: "SOUTH", samplingZoneNote: null },
    ]);
  });
  it("acepta dos réplicas explícitas de la cama entera y los tres materiales de secado", () => {
    for (const material of MATERIALES_DE_SECADO) {
      const form = formulario();
      for (const n of [1, 2]) { form.set(`materialState_${n}`, material); form.set(`samplingRole_${n}`, "REPLICATE"); form.delete(`samplingZone_${n}`); }
      const result = leerInspeccion(form);
      expect(result.muestras).toHaveLength(2);
      for (const m of result.muestras) expect(m).toMatchObject({ materialState: material, samplingRole: "REPLICATE", samplingZone: null });
    }
  });
  it("rechaza café verde, papel omitido y valores manipulados; acepta sus opciones válidas", () => {
    expect(leerInspeccion(formulario()).muestras).toHaveLength(2);
    for (const [key, value] of [["materialState_2", "GREEN"], ["samplingRole_1", ""], ["samplingRole_2", "inventado"], ["samplingZone_1", "inventada"], ["dryingBedLocationId", ""]] as const) {
      const form = formulario(); form.set(key, value);
      expect(() => leerInspeccion(form)).toThrow("datos_invalidos");
    }
  });
  it("una réplica no acepta zona ni nota de zona; una zona puede describirse sin enum", () => {
    const form = formulario();
    form.set("samplingRole_1", "REPLICATE");
    expect(() => leerInspeccion(form)).toThrow("replica_con_zona");
    form.delete("samplingZone_1");
    expect(leerInspeccion(form).muestras[0]!.samplingRole).toBe("REPLICATE");
    form.set("samplingZoneNote_1", "borde de la entrada");
    expect(() => leerInspeccion(form)).toThrow("replica_con_zona");
    form.set("samplingRole_1", "ZONE");
    expect(leerInspeccion(form).muestras[0]!.samplingZoneNote).toBe("borde de la entrada");
    form.delete("samplingZoneNote_1");
    expect(() => leerInspeccion(form)).toThrow("zona_sin_identificar");
  });
  it("sin desfase falla en vez de usar la hora del servidor, con control de conversión", () => {
    const form = formulario();
    expect(leerInspeccion(form).occurredAt.toISOString()).toBe("2026-09-16T14:30:00.000Z");
    form.delete("tzOffsetMinutes");
    expect(() => leerInspeccion(form)).toThrow("timezone_offset_missing");
  });
  it("un rack vacío queda nulo, uno positivo queda declarado y uno inválido falla", () => {
    const form = new FormData(); form.set("name", "Cama A");
    expect(leerUbicacionDeSecado(form)).toMatchObject({ rackLevel: null, dryingEnvironment: null });
    form.set("rackLevel", "2"); expect(leerUbicacionDeSecado(form).rackLevel).toBe(2);
    for (const value of ["0", "-1", "1.5", "NaN", "2147483648"]) {
      form.set("rackLevel", value); expect(() => leerUbicacionDeSecado(form)).toThrow("rack_invalido");
    }
  });
  it("ambientes conocidos se conservan; uno inventado no se guarda", () => {
    const form = new FormData(); form.set("name", "Instalación");
    for (const value of AMBIENTES_DE_SECADO) { form.set("dryingEnvironment", value); expect(leerUbicacionDeSecado(form).dryingEnvironment).toBe(value); }
    form.set("dryingEnvironment", "inventado"); expect(() => leerUbicacionDeSecado(form)).toThrow("datos_invalidos");
  });
  it("opciones y errores tienen textos en español e inglés", () => {
    for (const lang of ["es", "en"]) {
      const messages = JSON.parse(readFileSync(`messages/${lang}.json`, "utf8")).Secado;
      const keys = [
        ...MATERIALES_DE_SECADO.map((v) => `material_${v}`), ...PAPELES_DE_MUESTRA.map((v) => `papel_${v}`),
        ...ZONAS_DE_MUESTRA.map((v) => `zona_${v}`), ...AMBIENTES_DE_SECADO.map((v) => `ambiente_${v}`),
        ...["sin_acceso", "datos_invalidos", "replica_con_zona", "zona_sin_identificar", "fecha_invalida", "rack_invalido", "tipo_invalido", "sombra_invalida"].map((v) => `error_${v}`),
      ];
      expect(keys.length).toBeGreaterThan(20);
      for (const key of keys) expect(messages[key], `${lang}.${key}`).toEqual(expect.any(String));
    }
  });
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
});
