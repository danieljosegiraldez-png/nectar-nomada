# La rejilla de la parcela y los bloques por rango — diseño

**Fecha:** 2026-10-01 · **Camino:** arquitectónico · **Estado:** **APROBADO por Daniel el 2026-10-01**, sección por sección

**Sustituye a** `docs/superpowers/specs/2026-09-19-rejilla-bloques-y-celdas-design.md` (rama `spec/rejilla-y-celdas`, commit `5075e1f9`), que quedó en «propuesto, pendiente de la revisión escrita de Daniel» y nunca se ejecutó. Ese documento sigue accesible; esta versión manda. Al final se dice qué tenía mal, para que nadie lo vuelva a deducir.

**Medido contra** `main` = `8f39579b`.

---

## 1. El problema, en una frase

Un bloque no puede decir qué plantas cubre sin materializar cada una, y una parcela no tiene numeración, así que «hilera 12, planta 30» no nombra nada.

Lo que **no** es el problema, y por eso no se toca: la trazabilidad. Ya funciona.

## 2. Las siete decisiones de Daniel, 2026-10-01

| nº | decisión |
|---|---|
| **D1** | **La herencia es por contención, y el registro es único.** Se trata la parcela y entra todo lo de dentro, incluidas microparcelas creadas después. Se trata una microparcela y se queda ahí, alcanzando sus bloques y specimens, nunca la parcela ni las microparcelas hermanas. **Jamás dos registros del mismo acto.** |
| **D2** | **Los atributos del terreno se copian al crear una microparcela y desde ahí son suyos.** Cambiar la parcela no los mueve. |
| **D3** | **Una sola numeración: la de la parcela.** El bloque declara su rango; cuelga de parcela o de microparcela, indistintamente. La microparcela **puede** declarar su rango; si no lo hace, sólo se pierde una comprobación. |
| **D4** | **Crecer la rejilla es libre; encogerla sólo si nada queda fuera** — y el error nombra qué lo impide. **Las plantas cuentan** para esa comprobación, no sólo los bloques y las microparcelas. |
| **D5** | **Un bloque tiene uno o varios rangos**, en tabla hija, porque un bloque irregular se describe con dos o tres. |
| **D6** | **La procedencia de lo copiado se marca con el acto, no con una columna:** un `AuditEvent` de `location.copy_attributes_from_parent`. |
| **D7** | **Los solapes dependen del tipo de bloque:** dos de `trampa` no se solapan entre sí; uno `experimental` puede solaparse con cualquiera; **un bloque sin tipo no bloquea a nadie y se avisa igual** (ADR-080: «desconocido» no es «no es de trampa»). |

## 3. Lo que ya existe y NO se toca

Medido sobre `main` = `8f39579b`, con control positivo en cada búsqueda.

| qué | dónde | por qué no se toca |
|---|---|---|
| la cadena de contención | `Location.parentLocationId`, `PlotBlock.locationId` (obligatorio), `Specimen.plotBlockId` | **D1 no necesita ni una columna.** «Qué se aplicó a esta planta» se contesta caminando hacia arriba |
| «exactamente un origen» | `entrega_de_cosecha_un_origen`, `plot_intervention_area_planta_o_bloque`, `recepcion_de_cereza_un_origen` | el `CHECK` de D1 ya existe tres veces |
| coordenadas de una planta | `Specimen.gridRow`, `Specimen.gridPosition` | ya están; les faltaba una rejilla que les diera sentido |
| los cinco estados de la comparación | `computePlotDensity` en `lib/traceability/plantingCohorts.ts:410` | `ok`, `sin_area`, `area_no_positiva`, `sin_cohortes`, `conteo_incompleto` |
| el tipo de bloque | `PlotBlockType` = `trampa \| experimental`, **anulable a propósito** | `20260919150000_bloque_sin_microparcela` dejó en NULL los que fueron `microparcela` |
| procedencia declarada | `ProvenanceClass`, usado en **48** campos del esquema | no hace falta en `Location`: D6 usa el acto |
| un bloque cuelga de cualquier ubicación | no hay `CHECK` ni comprobación de tipo en `lib/traceability/plotBlocks.ts` | D3 ya es cierto hoy; la rigidez estaba en el diseño viejo, no en el código |

## 4. El modelo

### 4.1 La rejilla — la declara quien es parcela

En `Location`:

| campo | nota |
|---|---|
| `gridOrigin` | de qué esquina se cuenta. **Catálogo corto, no texto libre**: «noroeste» escrito de cuatro maneras no es un origen |
| `rowCount` | cuántas hileras |
| `plantsPerRow` | cuántas plantas por hilera |
| `rowSpacingMeters` | **nuevo en `Location`**; hoy la distancia entre hileras sólo existe en `PlantingCohort` |

`plantSpacingMeters` ya está en `Location` y se queda como está.

Los cuatro nulos juntos o puestos juntos: media rejilla no es una rejilla. Sin rejilla, la pantalla dice **«sin rejilla»** y nunca un cero.

### 4.2 El rango de la microparcela — opcional

En `Location`: `rangeRowFrom`, `rangeRowTo`, `rangePlantFrom`, `rangePlantTo`. Los cuatro a la vez o ninguno.

Una misma tabla lleva rejilla y rango, y no es contradicción: **como padre declaras tu rejilla; como hija, tu sitio en la de tu padre.**

### 4.3 Los rangos del bloque — tabla hija

`PlotBlockRange`: `plotBlockId`, `rowFrom`, `rowTo`, `plantFrom`, `plantTo`, más `createdAt`/`createdBy` como sus vecinas.

Un bloque rectangular tiene una fila. Uno irregular, dos o tres (D5).

### 4.4 La copia de atributos

Al crear una microparcela se copian `altitudeMinM`, `altitudeMaxM`, `shadePercentage`, `slopeDescription`, `soilType`, `sunExposure`, `aspect`, `plantSpacingMeters` y `areaHectares` del padre, **en la misma transacción** que la crea, y se escribe un `AuditEvent` de `location.copy_attributes_from_parent` con los valores copiados en `after`.

**Por qué el acto y no una columna (D6):** `CLAUDE.md:207` prohíbe guardar un valor inferido como un hecho, y la jerarquía de las líneas 187-198 obliga a distinguir `measured_fact` de `interpretation`. El `AuditEvent` deja la distinción sin añadir una columna que luego habría que mantener al día en nueve sitios: la pantalla dice «copiado al crearse» cuando ese evento existe y el campo no se ha tocado después.

**Lo que esto NO resuelve, dicho aquí para que no se lea como resuelto:** un valor copiado y nunca revisado sigue siendo un valor prestado. La pantalla lo señala; nadie obliga a medirlo. Daniel aceptó ese riesgo con el conocimiento de causa.

## 5. Las reglas

### 5.1 Lo que rechaza la base

Una restricción que vive en TypeScript no existe para la base: un importador, una reparación operativa o SQL directo se la saltan. Así que estructural lo que no debe violarse nunca.

| regla | forma | mensaje |
|---|---|---|
| media rejilla | `CHECK` | los cuatro o ninguno |
| rango a medias | `CHECK`, en `Location` y en `PlotBlockRange` | los cuatro o ninguno |
| rango al revés | `CHECK` | `rowFrom ≤ rowTo` y `plantFrom ≤ plantTo` |
| rango fuera de la rejilla de su parcela | disparador | «El rango no cabe en la rejilla de la parcela (N hileras × M plantas)» |
| rango de bloque fuera del de su microparcela | disparador | sólo cuando la microparcela declaró rango |
| **encoger dejando algo fuera (D4)** | disparador en `Location` | «Bloque Sombra ocupa hasta la hilera 12» |
| **dos bloques de trampa solapados (D7)** | disparador | nombra el otro bloque |

**Los solapes se comparan con `int4range` y el operador `&&`**, no con aritmética escrita a mano. Es el mismo patrón que `20260921100000_bandejas_de_la_corrida` usa con `tsrange` para «esta bandeja ya lleva otro lote en ese intervalo». Dos rangos de celdas se solapan cuando se solapan sus dos dimensiones.

**El disparador de encoger (D4) recorre tres cosas**, y las tres rechazan: las microparcelas hijas con rango, los `PlotBlockRange` de los bloques que cuelgan de la parcela o de sus hijas, y **los `Specimen` con `gridRow`/`gridPosition` fuera de la rejilla nueva**. Los specimens son filas reales con historia; dejarlos apuntando a celdas que ya no existen es peor que negar el encogimiento.

### 5.2 Lo que avisa y no bloquea

| aviso | dónde |
|---|---|
| «se solapa con Bloque Sombra en 40 celdas» | al guardar, cuando D7 lo permite |
| «140 contadas, 1 siembra sin contar» | el `conteo_incompleto` que ya existe |
| «sin rejilla» | nunca un cero |
| «copiado al crearse» | leyendo el `AuditEvent` de D6 |
| «va a crear 240 celdas» | antes de marcar un bloque de seguimiento |

### 5.3 La comparación nunca afirma un cero

Sin siembras registradas la pantalla dice **«sin siembras registradas»**, no «0 de 200». Con el conteo a medias dice **«140 contadas, 1 siembra sin contar»** y **no compara contra la capacidad** mientras falte una, porque esa diferencia mezclaría sitios vacíos de verdad con plantas que nadie contó.

Esto no es una decisión nueva: es ADR-080 y el contrato que `computePlotDensity` ya documenta — *«`null` los colapsa en "sin datos", y cero sería una afirmación»*.

## 6. Las pantallas

| pantalla | qué gana |
|---|---|
| ajustes de la parcela | declarar la rejilla |
| alta de microparcela | su rango, opcional |
| alta de bloque | sus rangos, con la suma de celdas y los solapes debajo |
| ficha de parcela y de microparcela | la comparación, con sus cinco estados |

**Todos los campos nuevos son numéricos, así que `<CampoNumerico>` en todos, sin excepción.** Lo exige `tests/arquitectura/numeros-sin-rueda.test.ts`, y su motivo es el de este documento: girar la rueda sobre un campo vacío deja un **0**, y en un formulario de campo eso convierte «no se contó» en «cero».

## 7. Alcance

**Entra:** la rejilla, el rango opcional de la microparcela, `PlotBlockRange`, los siete guardias con sus flip-tests, las cuatro pantallas, y la copia de atributos con su `AuditEvent`.

**No entra:**

- nada de la herencia — la cadena ya existe (D1);
- ningún `CHECK` nuevo de «un solo origen» — los tres existen;
- celdas materializadas — la decisión «mixto» hace que no haga falta;
- la cobertura de trampas por distancia (`trapSpacingMeters`, `plantsPerTrap`);
- los permisos en dos niveles — toca el catálogo de permisos;
- la vista de finca sumada — depende de la cosecha por microparcela, que construye otra sesión.

**Esta entrega funciona sola.** No encadena a una segunda para ser útil.

## 8. Cómo se sabrá que funciona

- **Ninguna cifra inventada:** sin rejilla, «sin rejilla»; conteo a medias, «N contadas y M siembras sin contar».
- **Los rangos no mienten:** uno fuera de la rejilla se rechaza por la base, no por la pantalla.
- **Encoger no deja huérfanos:** con un bloque, una microparcela o **una planta** fuera de la rejilla nueva, el encogimiento se rechaza nombrando qué lo impide.
- **Cada uno de los siete guardias pasa su flip-test**, y el arnés imprime, antes del veredicto: el sha del archivo antes y después —distintos o abortar—, que el módulo **importa y construye su objeto** (no sólo que parsea), y qué prueba cae **por su nombre**.
- **Ningún flip-test se come su fixture.** La fila que hace discriminar a una prueba **se queda** en ella; la mutación cambia la implementación, nunca los datos. El diseño anterior fallaba justo aquí (§10).
- **Cada prueba nueva que necesite base entra en `scripts/pruebas-por-compuerta.txt`**, grupo `base-sembrada`, y se comprueba corriendo `bash scripts/ci.sh` antes de empujar: el carril hermético no tiene base, y una prueba que caiga ahí por omisión falla con un error de Prisma en una compuerta que no toca Prisma.

## 9. Lo que queda abierto, y es de Daniel

- **El catálogo de `gridOrigin`:** qué valores exactos. «Noroeste» y «arriba mirando cuesta abajo» aparecieron en el diseño viejo como ejemplos, nunca como catálogo cerrado.
- **Si la microparcela acaba declarando rango** en la práctica, o se queda sin él. D3 lo deja opcional a propósito; el uso lo dirá.

## 10. Qué tenía mal el diseño del 2026-09-19

Se anota para que nadie lo vuelva a deducir, y porque dos de estos fallos no eran deriva del tiempo: estaban ahí el día que se escribió.

1. **Se contradecía a sí mismo.** Su §2 decía que la microparcela *«usa la numeración de su parcela; es un rango de celdas, no una rejilla aparte»* y su §4.1 que las microparcelas *«ganan su rejilla»*. D3 lo resuelve del lado de §2.
2. **Su plan convertía la ausencia en una afirmación.** La tarea 5 exigía que sin siembras la comparación dijera «difiere, 0 plantas, diferencia 200» — ADR-080 leído del revés, con las palabras de la propia casa.
3. **Su flip-test se comía su fixture.** La tarea 5 mandaba añadir la siembra que discrimina *«sólo para la duración del flip-test»*, y las pruebas permanentes no creaban ninguna: sin ella, filtrar o no filtrar da lo mismo. Un guardia falso por diseño.
4. **Daba por existente una herencia que nadie escribió.** Su §3 afirmaba que la microparcela *«hereda atributos de terreno»*. Medido: `createMicrolot` escribe **ocho campos** —`name`, `slug`, `locationType`, `parentLocationId`, `organizationId`, `subdivisionReason`, `subdivisionReasonNote` y `createdBy`— y **ni un atributo de terreno**.
5. **Dejaba el encogimiento fuera de alcance** con su propio comentario: *«vigilar todos los hijos cuando cambia el padre es una regla nueva, no una consecuencia de ésta»*. Tenía razón en que era nueva. D4 la pide.
6. **Su plan de 2.003 líneas acumulaba 19 contradicciones** con un `main` que llevaba 538 commits por encima. Siete causas independientes tras reducirlas; las demás eran la misma contada varias veces.

**Lo adjudicó una revisión de Codex como segundo asiento**, que además corrigió dos conclusiones mías: el ancla del `Edit` en `PlantingCohort` no era bloqueante —el plan nombra el modelo, así que la instrucción identifica el sitio correcto— y mi lectura de «19 de 19 confirmadas» como señal de un escéptico complaciente no se sostiene: con sólo positivos reales, un buen control puede confirmar todos. **Para medir discriminación hacen falta negativos deliberados**, y mi arnés no tenía ninguno.
