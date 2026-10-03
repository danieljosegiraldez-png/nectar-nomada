import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CAMPOS_DECIMALES,
  CAMPOS_DEL_PRODUCTO,
  CAMPOS_DE_OPCIONES,
  CAMPOS_ENTEROS,
  CAMPOS_LARGOS,
  CAMPOS_NUMERICOS,
  VALORES_DE_OPCIONES,
  camposDe,
  danaPolinizadores,
} from "../../lib/inventario/camposDeProducto";

const fuente = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8");

/** Los valores de un enum de `prisma/schema.prisma`, que es la fuente autoritativa y nunca está vieja. */
function valoresDelEnum(nombre: string): string[] {
  const bloque = new RegExp(`\\benum\\s+${nombre}\\s*\\{([^}]*)\\}`).exec(fuente("prisma/schema.prisma"));
  if (!bloque) throw new Error(`No hay ningún enum ${nombre} en prisma/schema.prisma`);
  return bloque[1]!
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => l !== "" && !l.startsWith("@@"));
}

describe("los campos del producto", () => {
  it("un medicamento de colmena no pide nada de manejo fitosanitario", () => {
    const medicamento = camposDe("medicamento");
    for (const campo of ["defaultReentryHours", "plantProtectionUse", "doseMin", "doseMax", "doseUnit"] as const) {
      expect(medicamento).not.toContain(campo);
    }
    // Control positivo: la lista no está vacía ni ha perdido lo que sí es de un medicamento.
    expect(medicamento).toContain("activeIngredient");
    expect(medicamento).toContain("defaultWithdrawalDays");
  });

  it("un fitosanitario los pide todos, en el orden de la pantalla", () => {
    expect(camposDe("fitosanitario")).toEqual(CAMPOS_DEL_PRODUCTO);
  });

  it("toda lista de clase nombra campos que existen", () => {
    for (const conjunto of [CAMPOS_ENTEROS, CAMPOS_DECIMALES, CAMPOS_LARGOS, CAMPOS_DE_OPCIONES]) {
      for (const campo of conjunto) expect(CAMPOS_DEL_PRODUCTO).toContain(campo);
    }
  });

  it("ningún campo es entero y decimal a la vez, y los numéricos son la unión", () => {
    // Si se solaparan, la rama que valida ganaría por orden de escritura y no por decisión.
    for (const campo of CAMPOS_ENTEROS) expect(CAMPOS_DECIMALES.has(campo)).toBe(false);
    expect([...CAMPOS_NUMERICOS].sort()).toEqual([...CAMPOS_ENTEROS, ...CAMPOS_DECIMALES].sort());
  });

  it("las opciones que la pantalla ofrece son exactamente el enum del esquema", () => {
    // El comentario de `VALORES_DE_OPCIONES` afirma esto; sin la prueba sería sólo una afirmación.
    expect(valoresDelEnum("PlantProtectionUse").length).toBeGreaterThan(1); // control del instrumento
    expect([...(VALORES_DE_OPCIONES.plantProtectionUse ?? [])].sort()).toEqual(valoresDelEnum("PlantProtectionUse").sort());
    // Y cada campo de lista cerrada tiene que tener sus valores declarados en alguna parte.
    for (const campo of CAMPOS_DE_OPCIONES) expect(VALORES_DE_OPCIONES[campo]?.length ?? 0).toBeGreaterThan(0);
  });
});

/**
 * **El guardia que motivó todo esto.**
 *
 * Hasta el 2026-09-30 estas listas estaban DOS veces: en el módulo de servidor y copiadas a mano en
 * el formulario de cliente, que no puede importar aquel porque lee la base. El comentario de la
 * copia lo decía con todas sus letras, y derivó igual: al añadir la dosis, el servidor ofrecía
 * cuatro campos que el formulario no pintaba. Nada falló en rojo — la pantalla simplemente no los
 * preguntaba nunca, que es la forma silenciosa de este defecto.
 *
 * Se lee la fuente, así que vale la regla de esta casa: la mutación de un flip-test tiene que
 * quitar **la conducta** —volver a declarar la lista a mano— y no sólo el token que el regex busca.
 */
describe("nadie vuelve a copiar la lista a mano", () => {
  const CONSUMIDORES = [
    "app/components/inventario/RecibirMedicamentoForm.tsx",
    "lib/inventario/recepcion.ts",
    "app/actions/inventario.ts",
  ];

  it("los tres consumidores la importan del módulo puro", () => {
    for (const ruta of CONSUMIDORES) {
      expect(fuente(ruta), ruta).toMatch(/from "[^"]*(inventario\/)?(camposDeProducto|recepcion)"/);
    }
  });

  it("ninguno declara su propia copia de los campos del producto", () => {
    // La firma de una copia: una constante local cuyo cuerpo enumera los campos. Se buscan dos
    // nombres que sólo aparecen juntos en esa lista, para no marcar un uso suelto.
    for (const ruta of CONSUMIDORES) {
      const src = fuente(ruta);
      const declaraciones = [...src.matchAll(/const\s+\w+[^=]*=\s*(?:new Set[^;]*|\[[^\]]*\])/g)].map((m) => m[0]);
      const copias = declaraciones.filter((d) => d.includes('"sanitaryRegistration"') && d.includes('"safetyNotes"'));
      expect(copias, `${ruta} vuelve a declarar los campos del producto: ${copias.join(" / ")}`).toEqual([]);
    }
  });

  it("el detector encuentra una copia cuando la hay", () => {
    // Control positivo del DETECTOR. Sin esto, el cero de arriba diría «no miré» con la misma cara
    // que «no hay copias» — que es exactamente cómo se coló la copia original.
    const conCopia = 'const CAMPOS = ["manufacturer", "sanitaryRegistration", "safetyNotes"];';
    const declaraciones = [...conCopia.matchAll(/const\s+\w+[^=]*=\s*(?:new Set[^;]*|\[[^\]]*\])/g)].map((m) => m[0]);
    expect(declaraciones.filter((d) => d.includes('"sanitaryRegistration"') && d.includes('"safetyNotes"'))).toHaveLength(1);
  });
});

/**
 * **El hueco de «¿daña polinizadores?» tiene que sobrevivir el viaje del formulario.**
 *
 * Esta prueba existe porque su flip-test NO cayó. La función vivía dentro de
 * `app/actions/inventario.ts`; las pruebas de recepción ejercitan el servicio y no la acción, así
 * que mutarla a `valor === "si"` —convertir «sin responder» en «no daña»— dejó las 14 en verde.
 * Mover la función aquí es lo que la hace probable, y esto es lo que la prueba.
 */
describe("«si»/«no» del formulario, con el hueco intacto", () => {
  it("«si» es true y «no» es false", () => {
    expect(danaPolinizadores("si")).toBe(true);
    expect(danaPolinizadores("no")).toBe(false);
  });

  it("sin responder es NULO, no false — que es la distinción entera", () => {
    // `false` afirmaría «este producto no daña polinizadores». Nadie lo afirmó.
    for (const vacio of ["", null, undefined]) {
      expect(danaPolinizadores(vacio), `«${String(vacio)}» debería ser nulo`).toBeNull();
    }
  });

  it("cualquier otra cosa también es NULO, no una afirmación", () => {
    for (const raro of ["quiza", "SI", "true", "1", "yes"]) {
      expect(danaPolinizadores(raro), `«${raro}» debería ser nulo`).toBeNull();
    }
  });

  it("y sus dos valores son los que la pantalla ofrece", () => {
    // Si la lista cerrada cambiara sin cambiar la función, el desplegable ofrecería algo que esta
    // traducción manda a nulo — un hueco que el operario creería haber rellenado.
    for (const v of VALORES_DE_OPCIONES.harmfulToPollinators ?? []) {
      expect(danaPolinizadores(v), `la pantalla ofrece «${v}» y la función lo manda a nulo`).not.toBeNull();
    }
    expect((VALORES_DE_OPCIONES.harmfulToPollinators ?? []).length).toBe(2); // control del instrumento
  });
});
