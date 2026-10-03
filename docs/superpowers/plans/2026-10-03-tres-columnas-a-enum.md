# Tres columnas a `enum`, y «no se buscó» deja de ser `null` — Plan (Parte B)

> **Para quien lo ejecute:** SUB-SKILL REQUERIDA: `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans`, tarea por tarea.

**Objetivo:** que `queenSighted`, `broodPatternNote` y `temperamentNote` dejen de ser
`Boolean?` y `String?` y pasen a los tres `enum` que el protocolo **ya declara**, para que «no se
buscó» se pueda decir y no se guarde en el mismo `null` que «no se preguntó».

**Arquitectura:** tres `enum` nuevos en el esquema `apiary`, una migración escrita a mano con su
conversión explícita, el renombrado de dos columnas cuyo sufijo `Note` dejará de ser cierto, y el
formulario de inspección pasando los valores en vez de colapsarlos. Nada de esto toca el
protocolo: sus `options` ya son las correctas desde A9.4.

**Tecnologías:** Prisma 7 (migración a mano, `prisma migrate diff` para verificarla), Next.js 16,
`next-intl`, vitest 4. Carril **con base**: la migración se ejerce.

**Spec:** `PENDING_IMPLEMENTATIONS/010-el-protocolo-de-campo-necesita-una-v2.md`, su requisito 4,
más su sección «Lo que derivó, medido el 2026-10-03».

**Depende de:** nada. Se puede ejecutar antes o después de la Parte A
(`2026-10-03-protocolo-de-campo-los-nueve-items.md`); sólo se tocan a la vez si las dos
cambian `coversExistingColumn` del mismo ítem, y no lo hacen.

## Restricciones globales

- **El defecto, medido con precisión y no como lo dice la ficha.** El desplegable de reina vista
  ofrece **`""`, `"si"` y `"no"`** (`InspectionForm.tsx:224-226`) y `triEstado` (`:39-43`) manda
  `"si"`→`true`, `"no"`→`false` y **cualquier otra cosa a `null`**. O sea: `si` y `no` se guardan
  bien; lo que **no se puede decir** es «no se buscó», porque su única casilla es la vacía y la
  vacía ya significa «no se contestó». El comentario de `:220` dice «tres opciones y no una
  casilla: "no se buscó" tiene que poder decirse» — y hay tres `<option>`, pero una está vacía,
  que es exactamente el colapso que el comentario cree haber evitado.
- **Las opciones son las del protocolo, verbatim** (`apiario-campo-v2.json`), y no se inventa
  ninguna: `queen_sighted` → `vista`, `no_vista`, `no_se_busco`; `brood_pattern` → `compacto`,
  `salteado`, `apretado`, `promedio`, `nulo`; `temperament` → `mansa`, `normal`, `defensiva`.
- **`0` inspecciones al respaldo**, así que ninguna fila se convierte hoy. **La migración se
  escribe igual con su conversión explícita**, porque producción puede ganar filas entre el
  commit y la fusión, y una conversión implícita de `boolean` a `enum` no existe en Postgres.
- **La base compartida del 55433 (`nectar_test`) NO se resetea ni se migra.** El carril con base
  usa una base **desechable y vacía** cuyo nombre case `^(nectar_test|nectar_ci|nn_flip_)`,
  creada con `TEMPLATE template0 ENCODING UTF8 LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'`
  y comprobando que **pliega** —`SELECT lower('FERRETERÍA') = 'ferretería'` tiene que dar `t`—
  antes de fiarse de nada.
- **`prisma format` churnea este esquema**: editar a mano y comprobar con `git diff --stat` que el
  diff es puramente aditivo.
- Compuerta sin tuberías, cada código de salida en su propia línea impresa.

---

## Estructura de archivos

| archivo | qué le pasa |
|---|---|
| `prisma/schema.prisma` | 3 `enum` nuevos; 3 columnas cambian de tipo; 2 se renombran |
| `prisma/migrations/<ts>_tres_columnas_a_enum/migration.sql` | **crear**: los tipos, la conversión y los renombrados |
| `app/components/apiary/InspectionForm.tsx` | la tercera opción de reina vista, y dos desplegables donde hoy hay texto libre |
| `app/actions/apiary.ts` | el valor pasa sin colapsar |
| `messages/es.json`, `messages/en.json` | los rótulos de los 11 valores nuevos, en los dos idiomas |
| `lib/apiary/mapaDelProtocolo.ts` | los dos `campo` renombrados |
| `protocolos/apiario-campo-v2.json` | los dos `coversExistingColumn` renombrados |
| `tests/apiary/inspeccion-tres-estados.test.ts` | **crear**: el guardia de que «no se buscó» se distingue de «no se preguntó» |

---

## Tarea 1: el guardia, antes de la columna

**Archivos:** crear `tests/apiary/inspeccion-tres-estados.test.ts` (carril **con base**: va a
`scripts/pruebas-por-compuerta.txt`).

- [ ] **Paso 1: la prueba que falla**

Crea una inspección por el servicio (`lib/apiary/inspections.ts`) con `queenSighted: "no_se_busco"`
y afirma que al leerla vuelve `"no_se_busco"`, **y** que una creada sin ese campo vuelve `null`.
Las dos filas en la misma prueba: **son el caso y su control**, y si las dos dieran lo mismo el
guardia no mediría nada.

```ts
it("«no se buscó» se guarda y se distingue de «no se preguntó»", async () => {
  const buscada = await registrarInspeccion({ ...BASE, queenSighted: "no_se_busco" });
  const callada = await registrarInspeccion({ ...BASE, queenSighted: null });
  expect(buscada.queenSighted).toBe("no_se_busco");
  // **El control que TIENE que salir distinto.** Con la columna booleana las dos daban `null`.
  expect(callada.queenSighted).toBeNull();
  expect(buscada.queenSighted).not.toBe(callada.queenSighted);
});
```

`BASE` se construye con el mismo montaje que usan las pruebas de inspección que ya existen en
`tests/apiary/` — leerlas y copiar su forma, no inventar una nueva.

- [ ] **Paso 2: correrla y verla fallar por el motivo correcto**

Esperado: **FALLA** porque `queenSighted` es `Boolean?` y `"no_se_busco"` no es un booleano —el
error viene de Prisma o de `tsc`, no de una aserción. Si falla por otra cosa, arreglar eso
primero.

- [ ] **Paso 3: añadir el archivo a `scripts/pruebas-por-compuerta.txt`** y comprobar que el
  carril con base dice «Correrá N archivos» con N una unidad mayor que antes. **Esa línea es el
  control:** su log no nombra los archivos que pasan, así que grepear el nombre ahí da 0 y el
  control negativo también — no mide nada.

- [ ] **Paso 4: commit, en rojo y diciéndolo.**

---

## Tarea 2: los tres `enum` y la migración

**Archivos:** `prisma/schema.prisma`, `prisma/migrations/<ts>_tres_columnas_a_enum/migration.sql`

- [ ] **Paso 1: los tres `enum`, con los valores del protocolo**

```prisma
/// Lo que el protocolo pregunta de la reina: `apiario-campo-v2.json`, `queen_sighted`.
/// **`no_se_busco` es un hecho, no una ausencia**: dice que alguien miró la pregunta y
/// decidió no buscarla. Con la columna booleana que había, se guardaba como `null` y no se
/// distinguía de «no se contestó» (`PENDING_IMPLEMENTATIONS/010`).
enum QueenSighting {
  vista
  no_vista
  no_se_busco

  @@schema("apiary")
}

/// `brood_pattern` del protocolo. Cinco valores del dueño, y `nulo` es uno de ellos: una
/// colonia sin cría es una observación, no un dato que falte.
enum BroodPattern {
  compacto
  salteado
  apretado
  promedio
  nulo

  @@schema("apiary")
}

/// `temperament` del protocolo.
enum Temperament {
  mansa
  normal
  defensiva

  @@schema("apiary")
}
```

- [ ] **Paso 2: las columnas, con el renombrado**

`queenSighted` pasa de `Boolean?` a `QueenSighting?` y **conserva su nombre**: sigue
describiendo lo mismo.

`broodPatternNote` → **`broodPattern`** `BroodPattern?` y `temperamentNote` → **`temperament`**
`Temperament?`. **El sufijo `Note` dejaría de ser cierto:** una nota es texto libre y esto pasa a
ser un valor cerrado, y un nombre que miente es lo que esta rama entera existe para impedir. Con
0 filas el renombrado no cuesta nada; si alguien prefiere conservar los nombres, **es una
decisión del dueño y se le pregunta**, no se decide aquí.

- [ ] **Paso 3: la migración, a mano, con la conversión explícita**

```sql
-- Los tres tipos. `apiary` es su esquema, como los demás enums del módulo.
CREATE TYPE "apiary"."QueenSighting" AS ENUM ('vista', 'no_vista', 'no_se_busco');
CREATE TYPE "apiary"."BroodPattern" AS ENUM ('compacto', 'salteado', 'apretado', 'promedio', 'nulo');
CREATE TYPE "apiary"."Temperament" AS ENUM ('mansa', 'normal', 'defensiva');

-- **La conversión va explícita aunque hoy no haya ninguna fila.** Medido el 2026-10-03:
-- `apiary.inspection` tiene 0 filas y las tres columnas 0 valores no nulos. Pero producción
-- puede ganar filas entre este commit y su fusión, y Postgres NO convierte boolean a enum
-- solo: sin `USING`, la migración falla en cuanto exista una fila.
--
-- `true` era «vista» y `false` era «no vista». `null` se queda `null`: con la columna booleana
-- NO se podía decir «no se buscó», así que convertir un `null` a `no_se_busco` inventaría un
-- hecho que nadie registró. Eso es justo lo que este cambio existe para impedir.
ALTER TABLE "apiary"."inspection"
  ALTER COLUMN "queen_sighted" TYPE "apiary"."QueenSighting"
  USING CASE "queen_sighted"
    WHEN true THEN 'vista'::"apiary"."QueenSighting"
    WHEN false THEN 'no_vista'::"apiary"."QueenSighting"
    ELSE NULL
  END;

-- Las dos de texto se renombran Y cambian de tipo. El texto que hubiera sólo se convierte si
-- casa EXACTAMENTE un valor del enum; cualquier otra cosa se va a `NULL` en vez de romper la
-- migración, y **el conteo de lo que se perdió se imprime** para que no se lea como cero.
ALTER TABLE "apiary"."inspection" RENAME COLUMN "brood_pattern_note" TO "brood_pattern";
ALTER TABLE "apiary"."inspection"
  ALTER COLUMN "brood_pattern" TYPE "apiary"."BroodPattern"
  USING CASE WHEN "brood_pattern" IN ('compacto','salteado','apretado','promedio','nulo')
    THEN "brood_pattern"::"apiary"."BroodPattern" ELSE NULL END;

ALTER TABLE "apiary"."inspection" RENAME COLUMN "temperament_note" TO "temperament";
ALTER TABLE "apiary"."inspection"
  ALTER COLUMN "temperament" TYPE "apiary"."Temperament"
  USING CASE WHEN "temperament" IN ('mansa','normal','defensiva')
    THEN "temperament"::"apiary"."Temperament" ELSE NULL END;
```

- [ ] **Paso 4: verificar la migración contra el esquema, con su flip-test**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_ci_010"
export SHADOW_DATABASE_URL="${DATABASE_URL}_shadow"
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script
echo "CODIGO: $?"
```

Vacío = el SQL implementa exactamente el esquema. **Y su flip-test, que no es opcional:** quitar
un valor de un `CREATE TYPE` y comprobar que el diff lo nombra. Un diff vacío por no haber
medido se lee igual que un diff vacío por estar bien.

En Prisma 7 **no existen** `--shadow-database-url` ni `--to-schema-datamodel`: es `--to-schema`,
y la sombra sale de `SHADOW_DATABASE_URL`. El comando imprime la ayuda sin decir por qué.

- [ ] **Paso 5: `npm run prisma:generate`**, porque el cliente cambia de tipos y sin esto `tsc`
  inventa cientos de errores que parecen del código.

- [ ] **Paso 6: el carril con base, sobre la desechable, y el guardia de la Tarea 1 en verde.**

- [ ] **Paso 7: commit.**

---

## Tarea 3: el formulario deja de colapsar

**Archivos:** `app/components/apiary/InspectionForm.tsx`, `app/actions/apiary.ts`,
`messages/es.json`, `messages/en.json`

- [ ] **Paso 1: reina vista, con sus tres significados**

El desplegable pasa de `"" | si | no` a `"" | vista | no_vista | no_se_busco`, y **el vacío
vuelve a significar sólo «no se contestó»**, que es lo que tiene que significar. `triEstado` deja
de usarse para este campo —se queda para los booleanos de verdad, que son cuatro— y el valor se
manda tal cual.

Y el comentario de `:220` se corrige: decía «tres opciones y no una casilla» sobre un desplegable
donde una de las tres era la vacía.

- [ ] **Paso 2: patrón de cría y temperamento pasan de texto libre a desplegable**, con sus cinco
  y sus tres valores. Hoy son `<input>` de texto (`:218` para cría), así que cualquier grafía
  entraba y nada las podía agrupar.

- [ ] **Paso 3: los rótulos, en los dos idiomas**

Once claves nuevas, con el patrón que el repositorio ya usa para enums
(`storesLevel_alta`, `messages/es.json:2161`):

`queenSighting_vista` / `_no_vista` / `_no_se_busco`; `broodPattern_compacto` / `_salteado` /
`_apretado` / `_promedio` / `_nulo`; `temperament_mansa` / `_normal` / `_defensiva`.

**Los textos en español salen del protocolo y del Anexo B**, no de la cabeza de quien implemente.
El inglés se traduce. Si alguna palabra del dueño no tiene traducción obvia —«apretado» de un
patrón de cría—, **se para y se pregunta** antes de inventar un término técnico en otro idioma.

- [ ] **Paso 4: la prueba de pantalla.** Que el desplegable de reina pinte **cuatro** `<option>`
  y que `no_se_busco` esté entre ellas; y su control, que el vacío siga existiendo.
  `tests/arquitectura/claves-de-traduccion-existen.test.ts` cazará una clave que falte **sólo si
  este archivo tiene un único espacio de nombres** — comprobarlo, y si tiene dos, la prueba de
  pantalla es el único guardia y hay que escribirla.

- [ ] **Paso 5: commit.**

---

## Tarea 4: el mapa y el protocolo nombran las columnas nuevas

**Archivos:** `lib/apiary/mapaDelProtocolo.ts`, `protocolos/apiario-campo-v2.json`

- [ ] **Paso 1:** en el mapa, `brood_pattern` pasa a `campo: "broodPattern"` y `temperament` a
  `campo: "temperament"`.

- [ ] **Paso 2:** en el JSON, `coversExistingColumn` de esos dos pasa a
  `Inspection.broodPattern` y `Inspection.temperament`.

- [ ] **Paso 3:** correr `protocolo-con-su-sitio`, `enum-del-protocolo` y —si la Parte A ya está—
  `cubre-lo-que-el-mapa-dice`. **Los tres tienen que pasar**, y el segundo es el que demuestra lo
  que esta parte entera buscaba: las opciones del protocolo y los valores del enum ahora **sí**
  dicen lo mismo, sin ninguna divergencia declarada.

- [ ] **Paso 4: la compuerta completa** —`tsc`, los dos carriles, `build`— y commit.

---

## Tarea 5: los flip-tests

Commitear antes de mutar. Cada uno con sha antes/después, que compile **y se importe**, y qué
prueba cae **por su nombre**. Las rutas de prueba, **argumentos separados**.

| mutación | lo que tiene que caer |
|---|---|
| devolver `queen_sighted` a `BOOLEAN` en el esquema | el guardia de la Tarea 1, por «no se buscó» |
| quitar `no_se_busco` del `enum` | el mismo, y además `enum-del-protocolo` por desajuste con el protocolo |
| volver el desplegable a `si`/`no` | la prueba de pantalla, por el número de opciones |
| quitar un rótulo de `messages/en.json` | el guardia de claves, **si este archivo entra en su alcance**; si no entra, la prueba de pantalla |

Si alguna no hace caer nada, **decirlo en el PR**: ese guardia no caza lo que dice.

---

## Autorrevisión de este plan

**Cobertura:** el requisito 4 de la ficha, entero. Los otros tres son la Parte A.

**Lo que NO hace:** no toca `storesLevel`, la columna reemplazada —esa es de la Parte A y de
ADR-117—, no añade ningún ítem al protocolo, y no cambia `droneBroodPresent`, que ya es
`Boolean?` y con razón: sí/no es toda su verdad.

**Una decisión que queda del dueño y no se toma aquí:** si los dos renombrados
(`broodPatternNote` → `broodPattern`) se hacen o no. El plan recomienda hacerlos porque el
sufijo `Note` pasaría a mentir, y con 0 filas es gratis — pero es su esquema.
