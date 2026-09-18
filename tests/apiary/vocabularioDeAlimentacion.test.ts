/**
 * Con qué se alimentó: el vocabulario del dueño, y la regla de que «otro» diga cuál.
 *
 * **Lo que esto protege.** Hasta el 2026-09-16 `feedingMaterial` era texto libre, con
 * `"sugar syrup 1:1"` de ejemplo en su comentario. Los cinco valores los dio el dueño en el
 * apiario, literales: «azúcar morena, blanca, melaza, miel de abeja y miel de caña».
 *
 * TODAS son PURAS y no tocan la base: el guardia llama a la función con la entrada hostil,
 * que es lo único que prueba una validación.
 *
 * **Lo que NO cubren, dicho aquí para que nadie lo cuente dos veces:** que
 * `feeding_material_solo_en_alimentacion` salte de verdad al escribir. Esa regla vive en
 * `normalizarEventoDeColonia` y cruza la frontera del servicio; su prueba va con las de
 * `colonyEvents`, contra Postgres, y todavía no está escrita.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MATERIALES_DE_ALIMENTACION,
  MATERIAL_QUE_EXIGE_CUAL,
  AlimentacionInvalida,
  esMaterialDeAlimentacion,
  exigeMaterialDeAlimentacion,
  comoSeLeeElMaterial,
} from "../../lib/apiary/vocabularioDeAlimentacion";

describe("el vocabulario que el dueño dictó", () => {
  it("sus cinco PRIMERO, y después los que su protocolo ya ofrecía", () => {
    // **CAMBIÓ EL 2026-09-17 (ADR-153), por decisión del dueño: «mis cinco más los jarabes».**
    //
    // Esta prueba decía «exactamente sus cinco, ni uno más», y su razón era buena: un
    // desplegable con opciones que nadie usa enseña a bajar hasta «otro». Lo que ADR-148 no
    // había visto es que el protocolo —que es SUYO— ya ofrecía otras cuatro, así que había dos
    // vocabularios para la misma pregunta. Lo destapó `enum-del-protocolo` el 2026-09-17.
    //
    // `sustituto_polen` y `torta` NO son jarabes —son alimentos proteicos— y se quedan porque
    // ya estaban en su protocolo: quitarlos sería una pérdida de capacidad que nadie pidió.
    expect([...MATERIALES_DE_ALIMENTACION]).toEqual([
      "azucar_morena",
      "azucar_blanca",
      "melaza",
      "miel_de_abeja",
      "miel_de_cana",
      "jarabe_1_1",
      "jarabe_2_1",
      "sustituto_polen",
      "torta",
      "otro",
    ]);
  });

  it("y el vocabulario es el MISMO que el del protocolo, leído del archivo", () => {
    // La prueba de arriba se compara con una lista escrita aquí — o sea, conmigo mismo. Ésta lo
    // compara con el artefacto del dueño, que es lo que impide que vuelvan a separarse.
    const protocolo = JSON.parse(
      readFileSync(join(process.cwd(), "protocolos/apiario-campo-v2.json"), "utf8"),
    );
    const items = (protocolo.activities ?? []).flatMap((a: { items?: unknown[] }) => a.items ?? []);
    const material = items.find((i: { key: string }) => i.key === "material") as { options?: string[] } | undefined;
    expect(material?.options, "el protocolo ya no declara `material` con opciones").toBeDefined();
    expect([...MATERIALES_DE_ALIMENTACION]).toEqual(material!.options);
  });

  it("y en el orden en que él los dijo, que es el orden en que los busca", () => {
    expect(MATERIALES_DE_ALIMENTACION.indexOf("azucar_morena")).toBeLessThan(
      MATERIALES_DE_ALIMENTACION.indexOf("azucar_blanca"),
    );
    expect(MATERIALES_DE_ALIMENTACION[MATERIALES_DE_ALIMENTACION.length - 1]).toBe("otro");
  });

  it("rechaza lo que no es del vocabulario", () => {
    expect(esMaterialDeAlimentacion("azucar_morena")).toBe(true);
    // Control positivo del detector: algo plausible que NO está.
    expect(esMaterialDeAlimentacion("azucar_rubia")).toBe(false);
    expect(esMaterialDeAlimentacion("sugar syrup 1:1")).toBe(false);
    expect(esMaterialDeAlimentacion(null)).toBe(false);
  });
});

describe("«otro» tiene que decir cuál", () => {
  it("LO QUE EL DUEÑO PIDIÓ: si no entra en la lista, se pone «otro» y se llena cuál", () => {
    expect(exigeMaterialDeAlimentacion("otro", "jarabe invertido")).toEqual({
      kind: "otro",
      cual: "jarabe invertido",
    });
  });

  it("un «otro» en blanco NO es información, y se rechaza", () => {
    expect(() => exigeMaterialDeAlimentacion(MATERIAL_QUE_EXIGE_CUAL, null)).toThrow(AlimentacionInvalida);
    expect(() => exigeMaterialDeAlimentacion("otro", "   ")).toThrow(/otro_sin_decir_cual/);
  });

  it("pero NO alimentar sin declarar con qué: eso es incompleto, no inválido", () => {
    // ADR-080: `null` es «sin registrar». Bloquearlo perdería la captura entera en campo, que
    // es peor que un registro al que le falta un dato.
    expect(exigeMaterialDeAlimentacion("", null)).toEqual({ kind: null, cual: null });
    expect(exigeMaterialDeAlimentacion(null, null)).toEqual({ kind: null, cual: null });
  });

  it("un valor del vocabulario SÍ admite texto al lado, como precisión", () => {
    expect(exigeMaterialDeAlimentacion("miel_de_cana", "de la finca de al lado")).toEqual({
      kind: "miel_de_cana",
      cual: "de la finca de al lado",
    });
  });

  it("y un valor inventado se rechaza aunque traiga texto", () => {
    expect(() => exigeMaterialDeAlimentacion("azucar_rubia", "lo que sea")).toThrow(
      /material_de_alimentacion_desconocido/,
    );
  });
});

describe("cómo se lee en el informe", () => {
  const etiqueta = (k: string) => ({ azucar_morena: "Azúcar morena", miel_de_cana: "Miel de caña", otro: "Otro" })[k] ?? k;

  it("el vocabulario solo", () => {
    expect(comoSeLeeElMaterial("azucar_morena", null, etiqueta as never)).toBe("Azúcar morena");
  });

  it("el vocabulario con su precisión", () => {
    expect(comoSeLeeElMaterial("miel_de_cana", "de al lado", etiqueta as never)).toBe("Miel de caña (de al lado)");
  });

  it("«otro» se lee por su texto, no por la palabra «Otro»", () => {
    expect(comoSeLeeElMaterial("otro", "jarabe invertido", etiqueta as never)).toBe("jarabe invertido");
  });

  it("Y LO QUE NO SE PUEDE PERDER: un registro ANTERIOR al vocabulario sigue leyéndose", () => {
    // Las filas de antes de hoy tienen texto y no tienen `kind`. Enseñarlas en blanco sería
    // perder lo que sí se escribió — que es exactamente lo que la columna nueva NO debe causar.
    expect(comoSeLeeElMaterial(null, "sugar syrup 1:1", etiqueta as never)).toBe("sugar syrup 1:1");
    expect(comoSeLeeElMaterial(null, null, etiqueta as never)).toBeNull();
  });
});
