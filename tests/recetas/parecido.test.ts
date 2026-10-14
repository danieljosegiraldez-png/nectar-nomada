/**
 * El parecido de una receta Libre con las publicadas — Parte 2a, tarea 10 (diseño §5.2, 2026-10-03; escala del mucílago de la
 * decisión de Daniel del 2026-10-03, Ruling M).
 *
 * **Hermética**: `lib/recetas/parecido.ts` no toca la base ni importa Prisma (sólo un TIPO de `vocabulario.ts`), así que la corre
 * `scripts/ci.sh` y no va en `scripts/pruebas-por-compuerta.txt`. Lo que prueba es la IDENTIDAD de un paso, que decide si dos
 * secuencias «son la misma receta»: qué cuenta (el tipo y cada eje, y las adiciones por categoría y momento) y qué no (la
 * afinación: horas, volteo, humedad, intención, opcional, fines, metas, requisitos y la dosis de una adición). Y el NOMBRE de la
 * Libre: su forma y su recorte (R8, 2026-10-05: la intención es texto libre y el nombre va a un índice único). Que la comparación
 * mire sólo lo que la organización puede usar vive en `tests/recetas/libre.test.ts`, que sí necesita base.
 *
 * **Cada «no cambia» lleva su «sí cambia» al lado**, y el primer `it` es el control de todos los demás: la base declara cada
 * campo de identidad, así que cambiarlo o quitarlo es un cambio de verdad y no un nulo que pasa a otro nulo. **La base lleva el
 * mucílago en 0 (Lavado) a propósito**: 0 es un valor, no «no se declaró», y una comparación con `||` lo borraría.
 */
import { describe, expect, it } from "vitest";
import {
  COLUMNAS_DEL_EJE,
  MAX_INTENCION_EN_EL_NOMBRE,
  huellaDeLaSecuencia,
  nombreDeLaLibre,
  type PasoParaComparar,
} from "../../lib/recetas/parecido";

type Columna = Exclude<keyof PasoParaComparar, "stepTypeValueId" | "adiciones">;

/**
 * Las diez columnas de identidad, ESCRITAS A MANO a propósito: si el recorrido de abajo saliera de la tabla de la fuente, quitar
 * una columna de la tabla la quitaría también del recorrido y la prueba seguiría en verde. El control de más abajo exige que la
 * tabla de la fuente diga exactamente esto.
 */
const IDENTIDAD: readonly Columna[] = [
  "estadoFrutoValueId",
  "mucilagoObjetivo",
  "oxigenoValueId",
  "temperaturaValueId",
  "temperaturaMinC",
  "temperaturaMaxC",
  "fuenteMicrobianaValueId",
  "medioValueId",
  "fisicoValueId",
  "modoSecado",
];
const DE_LA_FUENTE = (Object.values(COLUMNAS_DEL_EJE) as readonly (readonly Columna[])[]).flatMap((c) => [...c]);

/**
 * Otro valor para cada columna de identidad. **El tipo es TOTAL sobre las columnas**: una columna nueva en `PasoParaComparar` no
 * compila hasta que se diga aquí cómo cambiarla. El mucílago cambia a OTRO TRAMO (0 → 50), no a un número cualquiera.
 */
const OTRO: Record<Columna, string | number> = {
  estadoFrutoValueId: "estado-otro",
  mucilagoObjetivo: 50,
  oxigenoValueId: "oxigeno-otro",
  temperaturaValueId: "temperatura-otra",
  temperaturaMinC: 19,
  temperaturaMaxC: 25,
  fuenteMicrobianaValueId: "fuente-otra",
  medioValueId: "medio-otro",
  fisicoValueId: "fisico-otro",
  modoSecado: "covered_patio",
};

const A1 = { categoriaValueId: "sustrato-a", momento: "pre_green" };
const A2 = { categoriaValueId: "sustrato-b", momento: "post_green" };

/** Un paso que declara TODOS sus campos de identidad. El mucílago es 0: Lavado. */
const BASE: PasoParaComparar = {
  stepTypeValueId: "tipo-lavado",
  estadoFrutoValueId: "estado-entera",
  mucilagoObjetivo: 0,
  oxigenoValueId: "oxigeno-aerobio",
  temperaturaValueId: "temperatura-ambiente",
  temperaturaMinC: 18,
  temperaturaMaxC: 24,
  fuenteMicrobianaValueId: "fuente-ninguna",
  medioValueId: "medio-agua",
  fisicoValueId: "fisico-ninguno",
  modoSecado: "african_bed_outdoor",
  adiciones: [A1, A2],
};
const OTRO_PASO: PasoParaComparar = { stepTypeValueId: "tipo-despulpado" };

const huella = (...pasos: PasoParaComparar[]) => huellaDeLaSecuencia(pasos);

describe("la huella de la secuencia", () => {
  it("control: la tabla de la fuente nombra las diez columnas de identidad, y el paso base declara cada una", () => {
    expect([...DE_LA_FUENTE].sort(), "COLUMNAS_DEL_EJE no dice lo que esta prueba espera: revisar las dos").toEqual([...IDENTIDAD].sort());
    expect(Object.keys(OTRO).sort(), "la tabla de otros valores no cubre las mismas columnas").toEqual([...IDENTIDAD].sort());
    for (const c of IDENTIDAD) expect(BASE[c] ?? null, `la base no declara «${c}»`).not.toBeNull();
    expect(BASE.adiciones).toHaveLength(2);
  });

  it("cambiar o quitar cualquier campo de identidad cambia la huella, también el 0 (Lavado)", () => {
    for (const c of IDENTIDAD) {
      expect(OTRO[c], `control: «${c}» cambia de valor`).not.toBe(BASE[c]);
      expect(huella({ ...BASE, [c]: OTRO[c] } as PasoParaComparar), `cambiar «${c}» no cambió la huella`).not.toBe(huella(BASE));
      expect(huella({ ...BASE, [c]: null } as PasoParaComparar), `quitar «${c}» no cambió la huella`).not.toBe(huella(BASE));
    }
    expect(huella({ ...BASE, stepTypeValueId: "tipo-otro" }), "cambiar el tipo no cambió la huella").not.toBe(huella(BASE));
    // El 0 es un valor: Lavado (0) y «no se declaró» (null o ausente) son recetas distintas.
    expect(BASE.mucilagoObjetivo, "control: la base declara el 0").toBe(0);
    expect(huella({ ...BASE, mucilagoObjetivo: undefined }), "0 y «no se declaró» dieron la misma huella").not.toBe(huella(BASE));
  });

  it("las adiciones cuentan por categoría y momento: añadir, quitar, cambiar una u otro cambia la huella", () => {
    const con = (adiciones: PasoParaComparar["adiciones"]) => huella({ ...BASE, adiciones });
    expect(con([A1, A2]), "control: las mismas adiciones son la misma huella").toBe(huella(BASE));
    expect(con([A1]), "quitar una adición no cambió la huella").not.toBe(huella(BASE));
    expect(con([A1, A2, A1]), "repetir una adición no cambió la huella").not.toBe(huella(BASE));
    expect(con([A1, { ...A2, categoriaValueId: "sustrato-c" }]), "cambiar la categoría no cambió la huella").not.toBe(huella(BASE));
    expect(con([A1, { ...A2, momento: "pre_green" }]), "cambiar el momento no cambió la huella").not.toBe(huella(BASE));
    expect(con([]), "quitarlas todas no cambió la huella").not.toBe(huella(BASE));
    expect(con(undefined), "sin adiciones y con una lista vacía son lo mismo").toBe(con([]));
  });

  it("lo que no es identidad no la cambia: afinación, intención, opcional, dosis, fines, metas, el orden de las adiciones, undefined contra null y 18 contra 18,00", () => {
    // Todo lo que `PasoEditable` guarda y NO es identidad. Va aparte y se mezcla: un literal con campos de más no compila contra
    // `PasoParaComparar`, y la huella tiene que ignorarlos igual.
    const afinacion = {
      intencion: "otra intención",
      opcional: true,
      horasMin: 1,
      horasSugeridas: 2,
      horasMax: 3,
      volteoCadaHoras: 4,
      humedadMinPct: 5,
      humedadMaxPct: 6,
      finPorTiempo: true,
      reglaDeFin: "all",
      fines: [{ variable: "moisture", operador: "lte", valor: 11, unidad: "%" }],
      metas: [{ variable: "ph", moment: "final", unit: "pH", targetValue: 3.8 }],
      capacidadesRequeridas: ["capacidad-x"],
      adiciones: [
        { ...A2, cantidad: 9, unidad: "kg" },
        { ...A1, cantidad: 1, unidad: "L" },
      ],
    };
    const afinado: PasoParaComparar = { ...BASE, ...afinacion };
    expect(huella(afinado), "algo que no es identidad cambió la huella").toBe(huella(BASE));
    expect(huella({ ...BASE, estadoFrutoValueId: undefined }), "undefined y null son lo mismo").toBe(
      huella({ ...BASE, estadoFrutoValueId: null }),
    );
    // Una temperatura es un `Decimal(5,2)` en la base: 18,00 llega como el número 18.
    expect(huella({ ...BASE, temperaturaMinC: Number("18.00") }), "18 y 18,00 son lo mismo").toBe(huella(BASE));
  });

  it("el orden y el número de los pasos cuentan", () => {
    expect(huella(BASE, OTRO_PASO), "control: la misma secuencia es la misma huella").toBe(huella(BASE, OTRO_PASO));
    expect(huella(BASE, OTRO_PASO), "cambiar el orden no cambió la huella").not.toBe(huella(OTRO_PASO, BASE));
    expect(huella(BASE), "repetir un paso no cambió la huella").not.toBe(huella(BASE, BASE));
    expect(huella(), "la secuencia vacía es «[]»").toBe("[]");
    expect(huella(), "una secuencia vacía no se parece a una de un paso").not.toBe(huella(BASE));
  });
});

describe("el nombre de la receta Libre", () => {
  const datos = { intencion: "probar doble mosto", lotCode: "L-01", fecha: new Date("2026-03-01T12:00:00Z") };

  it("«Libre — <intención> — <código del lote> <fecha>», con la intención en una sola línea", () => {
    expect(nombreDeLaLibre(datos)).toBe("Libre — probar doble mosto — L-01 2026-03-01");
    expect(nombreDeLaLibre({ ...datos, intencion: "  probar   doble\nmosto " })).toBe("Libre — probar doble mosto — L-01 2026-03-01");
  });

  it("cada parte cuenta: otra intención, otro lote u otra fecha dan otro nombre, y ninguno es «Libre» a secas", () => {
    const base = nombreDeLaLibre(datos);
    expect(nombreDeLaLibre({ ...datos, intencion: "otra" })).not.toBe(base);
    expect(nombreDeLaLibre({ ...datos, lotCode: "L-02" })).not.toBe(base);
    expect(nombreDeLaLibre({ ...datos, fecha: new Date("2026-03-02T12:00:00Z") })).not.toBe(base);
    expect(base).not.toBe("Libre");
  });

  it("una intención de 5 KB entra recortada —MAX_INTENCION_EN_EL_NOMBRE caracteres, con «…»— y una de justo ese largo, entera", () => {
    const cola = " — L-01 2026-03-01";
    const justa = "a".repeat(MAX_INTENCION_EN_EL_NOMBRE);
    expect(nombreDeLaLibre({ ...datos, intencion: justa }), "control: una intención de justo MAX caracteres no se toca").toBe(`Libre — ${justa}${cola}`);
    const recortada = `Libre — ${"b".repeat(MAX_INTENCION_EN_EL_NOMBRE - 1)}…${cola}`;
    expect(nombreDeLaLibre({ ...datos, intencion: "b".repeat(5000) }), "5 KB no se recortaron a MAX con «…»").toBe(recortada);
    expect(recortada.length, "control: el nombre recortado es corto").toBeLessThan(200);
    // Una de MAX + 1 ya se recorta: el límite es de MAX y se pasa por uno.
    expect(nombreDeLaLibre({ ...datos, intencion: "c".repeat(MAX_INTENCION_EN_EL_NOMBRE + 1) })).toBe(
      `Libre — ${"c".repeat(MAX_INTENCION_EN_EL_NOMBRE - 1)}…${cola}`,
    );
    // El recorte va DESPUÉS de juntar los espacios: seis mil caracteres de espacios y saltos no cuentan.
    const hueca = `${" \n ".repeat(2000)}probar doble mosto${" \n ".repeat(2000)}`;
    expect(nombreDeLaLibre({ ...datos, intencion: hueca }), "los espacios contaron para el recorte").toBe(`Libre — probar doble mosto${cola}`);
  });

  it("recorta por puntos de código, no por unidades de UTF-16: un emoji en el corte no deja medio carácter suelto", () => {
    const SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(SUELTO.test("a\uD83Db"), "control: el detector ve un medio carácter").toBe(true);
    expect(SUELTO.test("a😀b"), "control: el detector no marca un par entero").toBe(false);
    // MAX − 2 letras y un emoji (que son DOS unidades): el corte, de MAX − 1 puntos, cae justo después del emoji.
    const intencion = `${"x".repeat(MAX_INTENCION_EN_EL_NOMBRE - 2)}😀${"y".repeat(50)}`;
    const nombre = nombreDeLaLibre({ ...datos, intencion });
    expect(nombre, "el emoji tenía que quedar entero en el corte").toBe(
      `Libre — ${"x".repeat(MAX_INTENCION_EN_EL_NOMBRE - 2)}😀… — L-01 2026-03-01`,
    );
    expect(SUELTO.test(nombre), "el recorte dejó medio carácter suelto").toBe(false);
  });
});
