# Parte 2a — La receta con pasos

**Fecha:** 2026-10-02 · **Estado:** diseño aprobado por Daniel en conversación, sección por sección;
pendiente de su lectura del spec escrito. **Base:** escrito sobre `origin/main` `85eab6da`. Depende
de la Parte 1, que vive en la rama `recetas-base` (sin fusionar al escribir esto), y de su diseño
general, en la misma rama:

- `docs/superpowers/specs/2026-09-30-recetas-del-beneficio-design.md` (general, §5 «Parte 2»)
- `docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md` (R1–R9)

**Fuente del modelo de pasos:** el paquete «farm-to-green v2» de Daniel (2026-10-02),
`06_PROCESSING_TAXONOMY.md` y `processing_axes.json` (ejes A–K, 23 tipos de paso). Daniel decidió
ese día que es la base de la Parte 2.

Criterio que manda, de Daniel: **«poder medir para poder reusar recetas y reproducir, replicar, ser
consistente con los resultados»**, con un sistema de recetas **funcional, inteligente y trazable**.

---

## 0. Por qué la Parte 2 se partió en dos — decisión de Daniel

Con lo decidido el 2026-10-02, la Parte 2 juntaba el modelo de pasos, la pantalla, la receta libre,
la ventana de la prefermentación, el aviso de humedad, los dos reposos y los motores. Se parte:

- **2a — este documento.** La receta como lista ordenada de pasos, su pantalla, su vocabulario, la
  receta libre, y cómo cada registro del lote se une a su paso.
- **2b — después, encima de la 2a.** Lo que la receta vigila en el lote: ventana de la
  prefermentación y su aviso, humedad que sube sin intención declarada, los dos reposos (muestra y
  venta, con la venta bloqueada), y que los motores juzguen por la receta (ADR-181).

**La receta obligatoria entra aquí, en la 2a** (decisión de Daniel, 2026-10-02, a pregunta de la
coordinadora): la Parte 1 sale como está aprobada, con la receta opcional, y la exigencia llega junto
con la receta libre, que necesita los pasos para armar su borrador. Ver §5.

El desenlace de secado «salida a tratamiento» (`DryingOutcome`) **no es de la Parte 2**: va a la
Parte 1 por la coordinadora.

---

## 1. Lo que hay hoy, medido en `85eab6da`

- `ProcessRecipeVersion` tiene **fases** (`ProcessRecipePhase`: `fermentation` | `drying`, con horas,
  volteo y banda de humedad) y **metas** (`ProcessTarget`: variable, momento `initial|during|final`,
  rango, unidad). **No tiene pasos.**
- `FermentationRun` lleva `processRecipeVersionId` y `lotProcessId`; no dice qué paso cumple.
- `LotTransformationType` tiene `selection`, `stage_change` y `hulling`, entre otros.
- El vocabulario controlado vive como **datos, no esquema**: `lib/research/catalogs.ts`
  (`VariableCatalog` / `VariableCatalogValue`, con `aliasOf` y `definition`). Añadir un valor es una
  línea y una resiembra, sin migración. El honey ya se guarda por porcentaje, con el color como
  etiqueta (RO1.1).

---

## 2. Decisiones de Daniel, 2026-10-02

| # | Pregunta | Decisión |
|---|---|---|
| D1 | Tipos de paso | **Los 23 del paquete + `prefermentacion`**, en catálogo |
| D2 | Cómo termina un paso | **Por tiempo y/o por medición**, con «la que ocurra primero» o «las dos»; el operario lo cierra y el sistema compara lo real con lo declarado |
| D3 | Receta libre al cerrar | **Se ofrece guardarla como receta** (borrador que Daniel nombra y publica); el lote queda unido a ella |
| D4 | Enfoque | **El registro apunta al paso** (no una tabla de «paso ejecutado», no JSON) |
| D5 | Paso fuera de la receta | **Desviación con motivo obligatorio, sin bloquear** |
| D6 | Regla 8 del paquete («sólo bloquear por seguridad y ley») | **Mandan las reglas de la casa**: la regla 8 vale para umbrales de referencia |

---

## 3. El paso de la receta

Tabla nueva `ProcessRecipeStep`, hija de `ProcessRecipeVersion`:

| Grupo | Campos |
|---|---|
| Identidad | `seq` (único por versión), `stepType` (catálogo `tipo_paso`), `intencion` (texto corto), `opcional` |
| Ejes (catálogos) | `estadoFruto` (A) y `mucilagoRetenidoPct`; `oxigeno` (B); `regimenTemperatura` (C) y `temperaturaMinC`/`MaxC`; `fuenteMicrobiana` (D); `fisico` (F); `modoSecado` (G); `recipiente` |
| Adiciones (E) | filas hijas: sustancia (catálogo), cantidad, unidad, `momento: pre_verde | post_verde` |
| Valores por defecto | `horasMin`, `horasSugeridas`, `horasMax`; sólo secado: `volteoCadaHoras`, `humedadMinPct`, `humedadMaxPct` |
| Fin (D2) | `finPorTiempo` (sí/no) + filas de fin: variable, operador, valor, unidad; `reglaDeFin: primero | ambas` |
| Plan de medición | **`ProcessTarget` reutilizado**: gana `recipeStepId` (nulo = meta de la versión entera, como hoy) y `cadaHoras` |

**Qué ejes aplican a qué tipo** vive junto al catálogo `tipo_paso` (datos), y lo usan la pantalla y
la validación del servicio: un secado no declara oxígeno; un lavado no declara volteo.

**Las fases se derivan de los pasos.** Al publicar una versión con pasos, el servicio escribe sus
`ProcessRecipePhase` desde ellos (horas, volteo y banda de humedad del secado; horas de la
fermentación). Los pasos son la única fuente; la cola de secado y los motores siguen leyendo fases
sin cambio. Una versión **sin** pasos conserva sus fases como hoy.

**Versiones.** Una versión usada por algún `LotProcess` no se edita: cambiarla crea la siguiente,
que copia pasos, adiciones, fines y metas (extiende R8, que hoy copia las fases).

**Plantillas.** Las recetas con `organizationId` nulo son de todas las organizaciones y ninguna las
edita. Una organización **deriva** una copia propia: receta nueva con `derivadaDeVersionId`.

---

## 4. Cómo se une el lote a su paso

**4.1 Cada registro lleva su tipo de paso y, si lo hay, el paso que cumple.** Columnas nuevas
`stepType` y `recipeStepId` (nulo permitido) en `FermentationRun`, `DryingRun` y `LotTransformation`
(sólo `stage_change` y `hulling`).

| Registro | Tipos de paso que puede cumplir |
|---|---|
| `FermentationRun` | `fermentation`, `prefermentacion`, `cold_hold`, `soaking`, `immersion_hot`, `immersion_cold` |
| `DryingRun` | `drying` |
| `LotTransformation` `stage_change` | `pulping`, `demucilage`, `washing` |
| `LotTransformation` `hulling` | `milling` |
| evento dentro de una corrida | `inoculation`, `addition` |

**4.2 Guardián de coherencia — bloquea.** Con `recipeStepId`: el paso es de la versión del proceso
vigente (R1 de la Parte 1), y su `stepType` está en la fila del registro. Si no, se rechaza con
`paso_de_otra_receta` o `paso_no_corresponde`. Es trazabilidad, no un umbral (D6).

**4.3 El formulario propone el siguiente paso pendiente** por `seq`, y deja elegir otro: saltar un
opcional, o repetir uno (el multiproceso secado → tratamiento → secado; si la receta declara el
recorrido, cada registro se une a su paso).

**4.4 Desviación (D5).** Un registro sin `recipeStepId` bajo una receta con pasos es una
**desviación**: exige `motivoDesviacion` (texto) y queda marcado. No bloquea. La Parte 5 separa
esos lotes al comparar.

**4.5 Recepción y clasificación** ocurren antes de abrir el proceso, que se abre sobre el lote
aceptado. No se unen por paso: al abrir el proceso, el servicio busca en la ascendencia del lote su
recepción y su selección y **las compara con la receta** (por ejemplo, Brix de recepción fuera de
18–24 → aviso). Avisa, no bloquea.

**4.6 Lo que no tiene registro hoy** (`sanitation`, `freezing`, `sorting_flotation` fuera de la
selección, `aging`, `monsooning`, `barrel_aging`, `decaf`, `reposo` y `storage`) existe en el
catálogo y se puede escribir en una receta, pero ningún registro lo cumple todavía. `reposo` y
`storage` los lee la 2b desde la asignación de bodega. Lo posterior al verde queda fuera.

---

## 5. La receta libre (D3) y la receta obligatoria

- **Abrir un proceso exige receta.** `abrirProceso` rechaza sin `recipeVersionId` con
  `sin_receta`. Para experimentar está la receta libre. Los procesos abiertos antes sin receta no se
  rellenan (R9): el reimport los rehace.
- Cada organización tiene una receta **«Libre»** sin pasos, creada al primer uso.
- Bajo ella, cada registro lleva sólo `stepType`; no hay desviación posible.
- Al cerrar el proceso, el servicio arma un **borrador de receta**: un paso por registro, en orden de
  inicio, con su tipo, los ejes que el registro guarda, las horas reales como `horasSugeridas`, y
  como fin las mediciones con que se cerró cada paso.
- Daniel lo nombra y lo publica. El proceso conserva que se hizo con «Libre» (es lo que ocurrió) y
  gana `origenDeRecetaVersionId`. La Parte 5 lo agrupa con los lotes de esa receta, marcado como
  origen.

---

## 6. La pantalla

- La receta se ve como **lista de pasos en orden**: añadir, quitar, mover, marcar opcional.
- Cada paso se abre en un formulario corto: primero el tipo, y sólo aparecen los ejes que le aplican.
- Junto a cada valor por defecto, **la referencia del paquete** con fuente y confianza (por ejemplo
  «volteo ≥ 3–4 al día · Cenicafé · alta»). Informativa: la receta decide. Los valores `low` y `NN`
  se marcan visiblemente.
- Publicar fija la versión. Esta pantalla sustituye a la «pantalla de fases» que la Parte 1 dejó
  fuera.
- Textos en es y en.

---

## 7. El vocabulario

Catálogos nuevos en `lib/research/catalogs.ts`: `tipo_paso`, `estado_fruto`, `oxigeno`,
`regimen_temperatura`, `fuente_microbiana`, `adicion`, `fisico`, `modo_secado`; y valores nuevos en
`recipiente`.

- Valores de la casa: **cama africana, sacos de cosecha (fiebre), atomizado, mosto de otro
  fermento**.
- Sinónimos del paquete como alias (`aliasOf`): mosto = mossto = lixiviado = «previous-batch
  starter».
- Definiciones de la casa en `definition`:
  - **Lavado:** a la cama de secado sin nada de mucílago; si llega con mucílago es semi-lavado.
  - **Honey:** 100 % del mucílago retenido; con menos, semi-lavado.
  - **Fiebre:** cereza entera en sus sacos de cosecha sin sellar, se calienta; prefermentativo por
    intención.
  - **Láctico, málico, acético:** resultados, no métodos; exigen datos medidos o se publican como
    perfil buscado.

---

## 8. Pruebas — cada guardián con su flip-test

| Guardián | Prueba | Flip-test |
|---|---|---|
| 4.2 paso de otra receta | rechaza `paso_de_otra_receta` | quitar la comprobación → la prueba cae |
| 4.2 tipo que no corresponde | una `DryingRun` con un paso `washing` se rechaza | idem |
| 4.4 desviación | sin `recipeStepId` y sin motivo se rechaza; con motivo pasa y queda marcada | idem |
| §3 versión usada | editar una versión con proceso se rechaza | idem |
| §3 v2 copia | pasos, adiciones, fines y metas llegan iguales a la v2 | quitar la copia de una de las cuatro → cae |
| §3 fases derivadas | publicar con pasos escribe las fases que leen la cola y los motores | idem |
| §5 receta libre | el borrador reproduce lo ejecutado en orden, con horas reales | invertir el orden → cae |
| §5 receta obligatoria | abrir sin receta se rechaza con `sin_receta`; con «Libre» pasa | quitar la comprobación → cae |
| 4.5 recepción | Brix 26 con receta 18–24 → aviso; Brix 20 → sin aviso | las dos ramas, para que no pase vacía |

Si una tarea toca TypeScript, su plan manda `npm run build`, no sólo el runner de pruebas.

---

## 9. Lo que la 2a no hace

- La vigilancia en el lote: prefermentación, humedad sin intención, reposos, venta bloqueada,
  motores por receta. **Es la 2b.**
- Cargar Lavado, Natural y Honey. **Es la Parte 3**, que ahora las escribe como pasos.
- El plan del lote paso a paso, visible para el operario. **Es la Parte 4.**
- Comparar lotes de la misma receta. **Es la Parte 5.**
- Lo posterior al verde (añejado, monzón, barrica, descafeinado): existe en el catálogo, sin registro.

## 10. Dependencia y orden

Se construye **encima de la Parte 1 fusionada**: necesita que toda corrida esté unida a su proceso
(R3) y el resolvedor R1. El plan de la 2a se escribe cuando la Parte 1 esté en `main`.
