# Protocolo de campo · los nueve ítems que faltan — Plan (Parte A)

> **Para quien lo ejecute:** SUB-SKILL REQUERIDA: `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans`, tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para seguirlos.

**Objetivo:** que `protocolos/apiario-campo-v2.json` pregunte los nueve hechos del Anexo B que
hoy no pregunta, cada uno apuntando a la columna que ya existe, y que un guardia impida que el
JSON y el mapa vuelvan a decir cosas distintas.

**Arquitectura:** sólo contenido y declaraciones. No hay migración, no hay columna nueva y no se
toca ninguna pantalla: las columnas de destino existen todas (ADR-117 para las reservas,
ADR-122 para la caja), y los ítems con `coversExistingColumn` **no crean fila de respuesta** —lo
dice el propio archivo—, así que añadirlos no cambia el significado de nada ya respondido. Lo
único de código son dos entradas en el mapa y un guardia nuevo.

**Tecnologías:** JSON versionado en `protocolos/`, TypeScript, vitest 4. Carril **hermético**:
nada de esto necesita base de datos.

**Spec:** `PENDING_IMPLEMENTATIONS/010-el-protocolo-de-campo-necesita-una-v2.md` — y su sección
«Lo que derivó, medido el 2026-10-03», que corrige tres hechos de la propia ficha. **Leer las
dos: el plan argumenta desde ahí.**

## Restricciones globales

- **Se EDITA `apiario-campo-v2.json`; no se crea una v3.** Decisión de Daniel, 2026-10-03. Se
  sostiene en los términos del propio archivo: su regla prohíbe editar «para que las respuestas
  ya dadas sigan significando lo mismo», y los ítems que se tocan son todos
  `coversExistingColumn`, que **no crean fila de respuesta**. Además, medido: ningún
  `apiario-campo` está cargado —las 2 versiones en la copia restaurada son «PE Cafelino 25-26» y
  «Cryobloom»— así que no hay ninguna respuesta dada. **Si la v2 llega a cargarse y responderse,
  este plan deja de valer y hace falta una v3.**
- **Las etiquetas y las etapas son del dueño, verbatim del Anexo B.** No se inventa ni una
  palabra: si una etiqueta no está en el Anexo, se para y se pregunta.
- **Regla de corte del propio archivo:** «si se puede escribir en el carro, `stage` es `close`,
  no `field`».
- **«campo, sólo si cambió» se modela con `prefillLastUsed: true`** y `stage: "field"`. No hay
  un tercer valor de etapa: los únicos que usa la v2 son `field` (34) y `close` (10).
- **Valores de `valueType` admitidos** (`lib/apiary/protocoloDeCampo.ts:26-35`): `enum`,
  `multi_enum`, `integer`, `decimal`, `short_text`, `long_text`, `date`, `boolean`. Hoy la v2 no
  usa `boolean` en ningún ítem; este plan introduce los primeros, y el lector ya los traduce a
  `ProtocolVariableValueType.boolean`.
- **Claves que un ítem puede llevar** (las que la v2 ya usa): `key`, `label`, `valueType`,
  `options`, `stage`, `required`, `order`, `hint`, `unit`, `provenance`, `coversExistingColumn`,
  `showWhen`, `requiredWith`, `prefillLastUsed`. No se inventan claves nuevas.
- **`order` es único dentro de su actividad** y las existentes no se renumeran: los ítems nuevos
  toman los siguientes.
- Compuerta: `npx tsc --noEmit`, `bash scripts/ci.sh` y `npm run build`, **sin tuberías**,
  leyendo el código de salida de su propia línea.

---

## Estructura de archivos

| archivo | responsabilidad | qué le pasa |
|---|---|---|
| `protocolos/apiario-campo-v2.json` | el contenido que el dueño pregunta | **modificar**: 9 ítems nuevos o partidos, 2 `coversExistingColumn` corregidos, cabecera y `status` al día |
| `lib/apiary/mapaDelProtocolo.ts` | dónde aterriza cada pregunta | **modificar**: entradas para los ítems nuevos |
| `tests/arquitectura/protocolo-con-su-sitio.test.ts` | ningún ítem sin entrada, ningún destino inventado | se verifica que sigue verde; no se toca |
| `tests/arquitectura/enum-del-protocolo.test.ts` | las opciones del protocolo y los valores del enum dicen lo mismo | **modificar**: se quitan las dos divergencias heredadas que dejan de existir |
| `tests/arquitectura/cubre-lo-que-el-mapa-dice.test.ts` | **crear**: que `coversExistingColumn` y el mapa no se contradigan | el guardia que falta |

---

## Tarea 1: el guardia que falta — `coversExistingColumn` y el mapa tienen que coincidir

**Por qué va primera.** Es la que hace medibles a las demás. Hoy el JSON dice que
`honey_stores` cubre `Inspection.storesLevel` y el mapa dice `Inspection.honeyStoresLevel`, y
**nada compara esas dos declaraciones**: `protocolo-con-su-sitio.test.ts` sólo comprueba que el
destino del mapa exista en el esquema. Con este guardia puesto, la Tarea 2 tiene algo que la
obligue a arreglar las dos declaraciones y no sólo una.

**Archivos:**
- Crear: `tests/arquitectura/cubre-lo-que-el-mapa-dice.test.ts`

**Interfaces:**
- Consume: `MAPA_DEL_PROTOCOLO` de `lib/apiary/mapaDelProtocolo.ts` (tipo
  `{ clase: "campo"; modelo: string; campo: string } | { clase: "tabla"; modelo: string; nota: string } | { clase: "sin_sitio"; nota: string }`).
- Produce: nada que otra tarea consuma. Es una compuerta.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
/**
 * `coversExistingColumn` del JSON y el destino del mapa dicen LO MISMO.
 *
 * **El defecto que lo motiva, medido el 2026-10-03.** El JSON declaraba que `honey_stores`
 * cubre `Inspection.storesLevel` —la columna que el esquema marca como **reemplazada**
 * (`schema.prisma:8171`)— mientras `MAPA_DEL_PROTOCOLO` la mandaba a
 * `Inspection.honeyStoresLevel`. Las dos declaraciones existían, las dos parecían bien, y
 * **nada las comparaba**: `protocolo-con-su-sitio.test.ts` comprueba que el destino del mapa
 * exista en el esquema, no que el JSON esté de acuerdo.
 *
 * Dos declaraciones de lo mismo sin un guardia entre ellas es deriva esperando a ocurrir, y
 * aquí ya había ocurrido.
 *
 * Hermético: lee dos archivos, no toca la base.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAPA_DEL_PROTOCOLO } from "../../lib/apiary/mapaDelProtocolo";

const RAIZ = process.cwd();
const PROTOCOLO = JSON.parse(
  readFileSync(join(RAIZ, "protocolos/apiario-campo-v2.json"), "utf8"),
) as { activities?: { items?: { key: string; coversExistingColumn?: string }[] }[] };

/** Las parejas (clave, columna declarada) del JSON, sólo de los ítems que declaran una. */
export function columnasDeclaradas(
  protocolo: typeof PROTOCOLO,
): { key: string; columna: string }[] {
  const salida: { key: string; columna: string }[] = [];
  for (const actividad of protocolo.activities ?? []) {
    for (const item of actividad.items ?? []) {
      if (item.coversExistingColumn) salida.push({ key: item.key, columna: item.coversExistingColumn });
    }
  }
  return salida;
}

/** Lo que el mapa dice de esa clave, como `Modelo.campo`, o null si no manda a una columna. */
export function columnaDelMapa(
  mapa: Record<string, { clase: string; modelo?: string; campo?: string }>,
  key: string,
): string | null {
  const destino = mapa[key];
  if (!destino || destino.clase !== "campo") return null;
  return `${destino.modelo}.${destino.campo}`;
}

describe("`coversExistingColumn` y el mapa dicen lo mismo", () => {
  const DECLARADAS = columnasDeclaradas(PROTOCOLO);

  it("hay columnas declaradas que mirar", () => {
    // Fila patrón: si esto es 0, las dos pruebas de abajo pasan sin medir nada.
    expect(DECLARADAS.length).toBeGreaterThan(0);
  });

  it("ninguna declaración del JSON contradice al mapa", () => {
    const desacuerdos = DECLARADAS.filter((d) => {
      const delMapa = columnaDelMapa(
        MAPA_DEL_PROTOCOLO as unknown as Record<string, { clase: string; modelo?: string; campo?: string }>,
        d.key,
      );
      return delMapa !== null && delMapa !== d.columna;
    }).map((d) => `${d.key}: JSON dice ${d.columna}`);
    expect(desacuerdos).toEqual([]);
  });

  it("y ninguna declara una columna mientras el mapa la deja sin sitio", () => {
    const sinSitio = DECLARADAS.filter((d) => {
      const destino = (MAPA_DEL_PROTOCOLO as unknown as Record<string, { clase: string }>)[d.key];
      return destino?.clase === "sin_sitio";
    }).map((d) => d.key);
    expect(sinSitio).toEqual([]);
  });

  // **El control que lo hace un guardia y no un adorno.** El mismo detector, contra entradas
  // hostiles que se inventan aquí, tiene que señalarlas. Sin esta fila, un cambio de forma en
  // el JSON dejaría el detector midiendo cero y las pruebas de arriba en verde.
  it("CONTROL: el mismo detector señala un desacuerdo inventado, y acepta uno que coincide", () => {
    const hostil = { activities: [{ items: [{ key: "x", coversExistingColumn: "A.b" }] }] };
    const mapaQueContradice = { x: { clase: "campo", modelo: "A", campo: "c" } };
    const mapaQueCoincide = { x: { clase: "campo", modelo: "A", campo: "b" } };
    expect(columnasDeclaradas(hostil)).toEqual([{ key: "x", columna: "A.b" }]);
    expect(columnaDelMapa(mapaQueContradice, "x")).toBe("A.c");
    expect(columnaDelMapa(mapaQueCoincide, "x")).toBe("A.b");
    // Y una clave sin entrada en el mapa no es un desacuerdo: es otro guardia el que la caza.
    expect(columnaDelMapa({}, "x")).toBeNull();
  });
});
```

- [ ] **Paso 2: correrla y verla fallar por el motivo correcto**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run tests/arquitectura/cubre-lo-que-el-mapa-dice.test.ts
```

Esperado: **FALLA** en «ninguna declaración del JSON contradice al mapa», nombrando
`honey_stores: JSON dice Inspection.storesLevel`. Las otras tres pasan. Si falla la fila patrón
o el control, el detector está roto: **anular y arreglar el detector antes de seguir.**

- [ ] **Paso 3: no hay implementación en esta tarea**

El guardia tiene que quedar **rojo** al terminar la Tarea 1: lo que lo pone verde es la Tarea 2,
que arregla las declaraciones. Se commitea rojo a propósito y el mensaje lo dice.

- [ ] **Paso 4: commit**

```bash
git add tests/arquitectura/cubre-lo-que-el-mapa-dice.test.ts
git commit -F - <<'MSG'
guardia: `coversExistingColumn` y el mapa del protocolo tienen que coincidir

Queda ROJO a propósito: nombra el desacuerdo que ya existía —`honey_stores`
declara `Inspection.storesLevel` y el mapa manda a `Inspection.honeyStoresLevel`—
y lo arregla la tarea siguiente. Un guardia que nace verde no demuestra nada.

Dos declaraciones de lo mismo sin nada que las compare es deriva esperando a
ocurrir; aquí ya había ocurrido y nadie lo veía porque el guardia que hay
comprueba que el destino del mapa EXISTA, no que el JSON esté de acuerdo.
MSG
```

---

## Tarea 2: las reservas, partidas en nivel y sitio

**Qué pide la spec.** El Anexo B §2.2 pide «Reservas de miel: alta, media, baja, junto a la
cría» y lo mismo para el polen. Daniel lo revisó el 2026-09-12 (**ADR-117**): **nivel de tres
valores, y el sitio en su propia columna**, porque «junto a la cría» no es una cantidad, es una
posición, y en la misma lista impide decir «alta **y** junto a la cría».

**Archivos:**
- Modificar: `protocolos/apiario-campo-v2.json` — los ítems `honey_stores` y `pollen_stores`
- Modificar: `lib/apiary/mapaDelProtocolo.ts` — dos entradas nuevas
- Modificar: `tests/arquitectura/enum-del-protocolo.test.ts` — quitar las dos divergencias

**Interfaces:**
- Consume: el guardia de la Tarea 1.
- Produce: las claves `honey_next_to_brood` y `pollen_next_to_brood`, que ninguna tarea
  posterior consume.

- [ ] **Paso 1: corregir los dos ítems de nivel y añadir los dos de sitio**

En `protocolos/apiario-campo-v2.json`, el ítem `honey_stores` queda así —tres opciones y la
columna buena—:

```json
{
  "key": "honey_stores",
  "label": "Reservas de miel",
  "valueType": "enum",
  "options": ["alta", "media", "baja"],
  "stage": "field",
  "required": false,
  "order": 9,
  "coversExistingColumn": "Inspection.honeyStoresLevel"
}
```

Y detrás, su sitio, como ítem propio:

```json
{
  "key": "honey_next_to_brood",
  "label": "Miel junto a la cría",
  "valueType": "boolean",
  "stage": "field",
  "required": false,
  "order": 10,
  "hint": "Es una posición, no una cantidad: puede haber miel alta Y junto a la cría.",
  "coversExistingColumn": "Inspection.honeyNextToBrood"
}
```

`pollen_stores` idéntico con `Inspection.pollenStoresLevel` —hoy **no declara ninguna
columna**, así que esta tarea le añade la declaración— y `pollen_next_to_brood` con
`Inspection.pollenNextToBrood` y la etiqueta «Polen junto a la cría».

**Los `order` de los ítems que vengan detrás en esa misma actividad se desplazan** para dejar
hueco a los dos nuevos. No se renumera la actividad entera: sólo los posteriores.

- [ ] **Paso 2: las dos entradas del mapa**

En `lib/apiary/mapaDelProtocolo.ts`, junto a las que ya existen (líneas 87-88):

```ts
  honey_next_to_brood: { clase: "campo", modelo: "Inspection", campo: "honeyNextToBrood" },
  pollen_next_to_brood: { clase: "campo", modelo: "Inspection", campo: "pollenNextToBrood" },
```

- [ ] **Paso 3: quitar las dos divergencias heredadas**

En `tests/arquitectura/enum-del-protocolo.test.ts`, borrar de `DIVERGENCIAS_HEREDADAS` las
entradas `"honey_stores"` y `"pollen_stores"`. **Si se quedan, eximirán un desajuste que ya no
existe** — y el propio archivo dice por qué eso es peligroso: con la pregunta exenta, cualquier
diferencia futura en ella queda sin vigilar.

- [ ] **Paso 4: correr los tres guardias y verlos verdes**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run tests/arquitectura/cubre-lo-que-el-mapa-dice.test.ts \
                 tests/arquitectura/enum-del-protocolo.test.ts \
                 tests/arquitectura/protocolo-con-su-sitio.test.ts
```

Esperado: **los tres pasan**. Leer las **dos** líneas de veredicto (`Test Files` y `Tests`): una
suite puede decir «passed» y morir en su limpieza, y eso sólo aparece en la primera.

- [ ] **Paso 5: commit**

```bash
git add protocolos/apiario-campo-v2.json lib/apiary/mapaDelProtocolo.ts \
        tests/arquitectura/enum-del-protocolo.test.ts
git commit -F - <<'MSG'
protocolo: las reservas se parten en nivel y sitio (ADR-117)

«Junto a la cría» no es una cantidad, es una posición: en la misma lista impide
decir «alta Y junto a la cría» y obliga al reporte de reservas bajas a decidir si
esa cuarta opción cuenta como bajo, como alto o como desconocido. Daniel lo
resolvió el 2026-09-12 y el esquema ya lo modela así.

`pollen_stores` además no declaraba NINGUNA columna; ahora declara la suya.

Y se quitan las dos divergencias heredadas de `enum-del-protocolo.test.ts`: si se
quedaran, eximirían un desajuste que ya no existe y dejarían esas dos preguntas
sin vigilar para siempre.
MSG
```

**La carpeta es `lib/apiary/`, en inglés**, aunque el archivo del protocolo sea
`apiario-campo-v2.json` en español. Las dos grafías conviven y confundirlas tiene consecuencia:
`git add` es **atómico**, así que una ruta que no casa **aborta la orden entera y no escenifica
ninguna**. Comprobar con `git diff --cached --stat` que entran **tres** archivos antes de
commitear.

---

## Tarea 3: la cría de zángano

**Qué pide la spec.** El Anexo B §2.2 pide «Zángano / cría de zángano: sí / no», etapa campo, y
trae su motivo escrito: «señal de obrera ponedora si aparece sin reina». El JSON tiene los otros
seis campos del §2.2 y **no ese**. La columna existe: `Inspection.droneBroodPresent`
(`schema.prisma:8210`).

**Archivos:**
- Modificar: `protocolos/apiario-campo-v2.json`
- Modificar: `lib/apiary/mapaDelProtocolo.ts`

- [ ] **Paso 1: el ítem**

```json
{
  "key": "drone_brood_present",
  "label": "Zángano / cría de zángano",
  "valueType": "boolean",
  "stage": "field",
  "required": false,
  "order": 13,
  "hint": "Señal de obrera ponedora si aparece sin reina.",
  "coversExistingColumn": "Inspection.droneBroodPresent"
}
```

El `order` es el siguiente libre de su actividad **después** de los desplazamientos de la Tarea
2: comprobarlo leyendo el archivo, no suponiéndolo.

- [ ] **Paso 2: la entrada del mapa**

```ts
  drone_brood_present: { clase: "campo", modelo: "Inspection", campo: "droneBroodPresent" },
```

- [ ] **Paso 3: correr los guardias**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run tests/arquitectura/cubre-lo-que-el-mapa-dice.test.ts \
                 tests/arquitectura/protocolo-con-su-sitio.test.ts
```

Esperado: **pasan**. `protocolo-con-su-sitio` es el que cazaría un ítem sin entrada en el mapa,
así que si se olvida el Paso 2, cae ahí y lo nombra.

- [ ] **Paso 4: commit**

```bash
git add protocolos/apiario-campo-v2.json lib/apiary/mapaDelProtocolo.ts
git commit -F - <<'MSG'
protocolo: la cría de zángano, que el Anexo pide y el JSON no preguntaba

El Anexo B §2.2 la pide con su motivo escrito —«señal de obrera ponedora si
aparece sin reina»— y el JSON tenía los otros seis campos de esa sección y no
ésta. La columna `drone_brood_present` ya existía, sin nada que la escribiera.
MSG
```

---

## Tarea 4: la configuración de la caja (§2.4)

**Qué pide la spec.** El Anexo B §2.4 trae seis filas y el JSON **no tiene ninguna**. Su propio
encabezado dice dónde van: «Cambia poco entre visitas, así que se guarda **en la colmena** y en
la inspección sólo se registra la diferencia. Preguntarlo cada vez es coste sin información.»

**Por eso estos seis ítems apuntan a `Hive`, no a `Inspection`** — y llevan
`prefillLastUsed: true`, que es cómo este archivo modela «sólo si cambió». Las siete columnas
existen (ADR-122).

**Archivos:**
- Modificar: `protocolos/apiario-campo-v2.json`
- Modificar: `lib/apiary/mapaDelProtocolo.ts`

- [ ] **Paso 1: los seis ítems, con la etapa que dice el Anexo**

| ítem | `valueType` | `stage` | `prefillLastUsed` | columna |
|---|---|---|---|---|
| `brood_boxes` «Cámaras de cría» | `integer` | `field` | sí | `Hive.broodBoxes` |
| `supers` «Alzas» | `integer` | `field` | sí | `Hive.supers` |
| `frames_per_box` «Cuadros por caja» | `integer` | **`close`** | sí | `Hive.framesPerBox` |
| `queen_excluder` «Excluidor de reina» | `boolean` | `field` | sí | `Hive.queenExcluder` |
| `feeder_type` «Alimentador» | `enum` | `field` | sí | `Hive.feederType` |
| `entrance_reducer` «Reductor de piquera» | `boolean` | `field` | sí | `Hive.entranceReducer` |
| `screened_bottom_board` «Piso sanitario / bandeja» | `boolean` | `field` | sí | `Hive.screenedBottomBoard` |

Son **siete ítems de seis filas**: «Cámaras de cría / alzas» es una fila del Anexo y dos columnas
del esquema, y se parten porque son dos números distintos.

`frames_per_box` va en `close` **por la regla de corte del propio archivo**: se puede escribir en
el carro, así que no se le pregunta a alguien de pie al sol con guantes. El Anexo dice lo mismo.

`feeder_type` es un `enum` y sus opciones **tienen que ser exactamente los valores de
`FeedingMethod`** del esquema, o `enum-del-protocolo.test.ts` lo marcará como desajuste — que es
justo lo que ese guardia existe para hacer. Leerlos del esquema, no escribirlos de memoria.

- [ ] **Paso 2: las siete entradas del mapa**

```ts
  brood_boxes: { clase: "campo", modelo: "Hive", campo: "broodBoxes" },
  supers: { clase: "campo", modelo: "Hive", campo: "supers" },
  frames_per_box: { clase: "campo", modelo: "Hive", campo: "framesPerBox" },
  queen_excluder: { clase: "campo", modelo: "Hive", campo: "queenExcluder" },
  feeder_type: { clase: "campo", modelo: "Hive", campo: "feederType" },
  entrance_reducer: { clase: "campo", modelo: "Hive", campo: "entranceReducer" },
  screened_bottom_board: { clase: "campo", modelo: "Hive", campo: "screenedBottomBoard" },
```

- [ ] **Paso 3: en qué actividad van**

Las cinco actividades de la v2 se leen con:

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
node -e 'const j=require("./protocolos/apiario-campo-v2.json");
console.log(j.activities.map(a=>`${a.activityType}  ${a.label}  (${a.items.length})`).join("\n"));'
```

Van en la actividad de **inspección de colonia**, que es la que ya lleva los demás campos del
§2.2. **Si su `activityType` no deja claro cuál es, parar y preguntar** — meterlos en la
actividad equivocada cambia cuándo se le preguntan a alguien en el campo, y eso es una decisión
del dueño, no del implementador.

- [ ] **Paso 4: correr los guardias y leer las dos líneas**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run tests/arquitectura/cubre-lo-que-el-mapa-dice.test.ts \
                 tests/arquitectura/enum-del-protocolo.test.ts \
                 tests/arquitectura/protocolo-con-su-sitio.test.ts
```

- [ ] **Paso 5: commit**

```bash
git add protocolos/apiario-campo-v2.json lib/apiary/mapaDelProtocolo.ts
git commit -F - <<'MSG'
protocolo: la configuración de la caja (§2.4), que no tenía ningún ítem

Siete ítems de las seis filas del Anexo B §2.4 —«cámaras de cría / alzas» son dos
números— apuntando a `Hive` y no a `Inspection`, porque el propio Anexo dice que
«cambia poco entre visitas, así que se guarda en la colmena y en la inspección
sólo se registra la diferencia».

«Sólo si cambió» se modela con `prefillLastUsed`, que es lo que este archivo ya
usa para eso. Y «cuadros por caja» va en `close` por la regla de corte del propio
protocolo: se puede escribir en el carro, así que no se le pregunta a alguien de
pie al sol con guantes.
MSG
```

---

## Tarea 5: la cabecera del protocolo deja de decir que D2 no está tomada

**El defecto.** `_lee_esto_antes` de la v2 dice «DONDE se guardan … es la decision D2 … y **NO
esta tomada**», y su `status` es `draft_contenido_sin_esquema_decidido`. **D2 sí está tomada**:
`docs/implementation/48_A9_CAPTURA_DE_CAMPO_REPORTE.md:1356` la resuelve —«`ProtocolVersion` de
Research OS, ejecutada contra la **visita**, no contra la `Colony`. Cuatro columnas nuevas,
ningún motor»— y A9.4 ya la construyó.

Es la misma forma que el comentario de `AuditEvent` que certificaba un vacío durante meses: era
verdad cuando se escribió y dejó de serlo. **Una instrucción vieja es peor que ninguna.**

**Archivos:**
- Modificar: `protocolos/apiario-campo-v2.json` — `_lee_esto_antes` y `status`

- [ ] **Paso 1: corregir las dos líneas de `_lee_esto_antes` que hablan de D2**

Sustituir las líneas que dicen que D2 no está tomada por:

```
"BORRADOR DE CONTENIDO. Estas son las listas de chequeo de campo que el dueño",
"propone para el módulo apícola. DONDE se guardan lo decidió D2 el 2026-09-07:",
"`ProtocolVersion` de Research OS, ejecutada contra la VISITA y no contra la",
"`Colony`, con cuatro columnas nuevas y ningún motor nuevo",
"(docs/implementation/48_A9_CAPTURA_DE_CAMPO_REPORTE.md:1356). A9.4 la construyó.",
```

**Las otras líneas no se tocan**: la regla de corte, la de crear una versión nueva y la de
`coversExistingColumn` siguen valiendo tal cual.

- [ ] **Paso 2: el `status`**

`draft_contenido_sin_esquema_decidido` deja de ser cierto. Pasa a
`contenido_aprobado_esquema_decidido`.

**Antes de cambiarlo, comprobar quién lee ese valor:**

```bash
grep -rn 'draft_contenido_sin_esquema_decidido' lib app scripts tests docs --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.md'
```

Si algo compara contra esa cadena exacta, **se cambia ahí también en el mismo commit**. Si no
hay nada, el cambio es sólo documental y el commit lo dice.

- [ ] **Paso 3: la compuerta completa, porque este commit cierra la Parte A**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export NODE_OPTIONS="--max-old-space-size=6144"
npx tsc --noEmit
echo "CODIGO DE TSC: $?"
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" bash scripts/ci.sh > /tmp/ci.txt 2>&1
echo "CODIGO DEL CARRIL HERMETICO: $?"
grep -E '^ *(Test Files|Tests) ' /tmp/ci.txt
npm run build > /tmp/build.txt 2>&1
echo "CODIGO DEL BUILD: $?"
```

**Cada código de salida en su propia línea impresa**, y se lee de ahí — no de la notificación
del arnés, que reporta el del último comando de la línea.

- [ ] **Paso 4: commit**

```bash
git add protocolos/apiario-campo-v2.json
git commit -F - <<'MSG'
protocolo: su cabecera decía que D2 no estaba tomada, y lo está

D2 se resolvió el 2026-09-07 —`ProtocolVersion` de Research OS contra la visita,
cuatro columnas, ningún motor— y A9.4 la construyó. La cabecera del protocolo
seguía diciendo lo contrario, y su `status` seguía siendo
`draft_contenido_sin_esquema_decidido`.

Es la misma forma que el comentario de `AuditEvent` que certificó un vacío
durante meses: era verdad cuando se escribió y dejó de serlo. Una instrucción
vieja es peor que ninguna, porque el próximo lector razona alrededor de ella.
MSG
```

---

## Tarea 6: el flip-test de la Parte A

**No es opcional.** Un guardia que pasa idéntico con y sin el defecto es un adorno, y esta parte
añade uno nuevo y quita dos exenciones.

- [ ] **Paso 1: commitear antes de mutar**

El arnés restaura con `git checkout --`, que devuelve la versión **del último commit**. Mutar
sin commitear se lleva el trabajo.

```bash
git status --porcelain | wc -l   # tiene que ser 0
```

- [ ] **Paso 2: las tres mutaciones, cada una con sus tres señales**

Por cada una: sha del archivo **antes y después** —distintos o abortar—, que `tsc` no se caiga
por otra razón, y **qué prueba cae por su nombre**.

| mutación | lo que tiene que caer |
|---|---|
| devolver `coversExistingColumn` de `honey_stores` a `Inspection.storesLevel` | `cubre-lo-que-el-mapa-dice` → «ninguna declaración del JSON contradice al mapa» |
| añadir `"junto_a_cria"` a las `options` de `honey_stores` | `enum-del-protocolo` → el desajuste contra `StoresLevel`, **y esto es lo que las divergencias heredadas eximían** |
| quitar la entrada `drone_brood_present` del mapa | `protocolo-con-su-sitio` → el ítem sin entrada, por su nombre |

- [ ] **Paso 3: pasar las rutas de prueba como argumentos SEPARADOS**

```bash
npx vitest run tests/arquitectura/a.test.ts tests/arquitectura/b.test.ts   # bien
npx vitest run "tests/arquitectura/a.test.ts tests/arquitectura/b.test.ts" # MAL
```

La forma mala hace que vitest conteste **«No test files found, exiting with code 1»**, y ese
**1** se lee exactamente igual que «la prueba cayó». El arnés tiene que **imprimir cuántas
suites corre** y abortar si aparece esa frase.

- [ ] **Paso 4: anotar los tres resultados en el PR, por nombre**

Si alguna mutación **no** hace caer nada, decirlo: significa que ese guardia no caza lo que
dice, y eso se arregla o se escribe como su límite.

---

## Autorrevisión de este plan

**Cobertura de la spec.** Los cuatro requisitos de la ficha 010: (1) partir las reservas →
Tarea 2; (2) cría de zángano → Tarea 3; (3) §2.4 → Tarea 4; (4) los tres a `enum` → **es la
Parte B**, su propio plan, porque lleva migración y esta parte no toca el esquema. Los dos
hechos derivados que la ficha añade —la cabecera y el `status`— → Tarea 5.

**Lo que este plan NO hace, dicho para que nadie lo cuente dos veces:** no toca ninguna columna,
no escribe ninguna migración, no cambia ninguna pantalla, y **no quita la entrada de
`DIVERGENCIAS_HEREDADAS` de ninguna pregunta que no sean las dos de reservas** — si hay otras,
son de otro asunto y se dejan con su razón.

**Consistencia de nombres.** Las claves nuevas en `snake_case` (`honey_next_to_brood`,
`drone_brood_present`, `screened_bottom_board`) y los campos del mapa en `camelCase`
(`honeyNextToBrood`, `droneBroodPresent`, `screenedBottomBoard`), que es lo que el repositorio
ya hace: el protocolo habla el vocabulario del dueño y el mapa traduce al del esquema.
