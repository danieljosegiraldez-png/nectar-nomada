# Reposo, trilla y el destino de los subproductos

**Fecha:** 2026-09-16 · **Base:** `origin/main` en `8c67185` · **Camino:** arquitectónico

Diseño acordado con Daniel en sesión el 2026-09-16. **Casi todo lo que decide este
documento salió de preguntarle**, no de inferirlo: cómo se trilla, dónde, qué vuelve,
en qué formas se vende y cuánto reposo hace falta. Donde una respuesta suya
contradijo mi diseño en curso, manda la suya y se dice cuál era mi error.

---

## 1. Qué cierra

Cinco huecos que cuatro fuentes independientes encontraron por separado:

| | |
|---|---|
| **`F3-002`** | «ni la trilla ni el reposo existen» — auditoría de fase 3 |
| **`F1-002`** | al generarse pulpa debería crearse un lote de cáscara enlazado — fase 1 |
| **`F3-005`** | la regla del testigo no existe, y `sale` no tiene camino de código |
| **Q17** | «estabilización y liberación autorizada», Fase 1 del paquete |
| **Q19** | «la trilla afecta al libro mayor AHORA, no puede esperar a Fase 2» |

Y completa la cadena del beneficio de punta a punta por primera vez: hoy hay un
agujero entre el secado —cerrado ayer— y el almacenamiento.

---

## 2. Lo que Daniel contó, y que cambia el diseño

**Éstas no son suposiciones.** Cada una vino de una pregunta concreta.

### La trilla no es una máquina: es un arreglo

**Finca Rosina / beneficio Las Nubes NO tiene trilladora.** Las demás fincas sí. Se
trilla de tres formas:

1. **En Cafelino** — servicio externo.
2. **En Kiva Estate** — servicio externo.
3. **A mano, con mazo y pilón**, en Las Nubes — trabajo propio, sin equipo.

**Vuelve todo**: el grano verde y la cascarilla. No se queda nada en el trillador, así
que el balance **cierra dentro de la finca** y no hay salida hacia un tercero.

### El café se vende en tres formas

**Verde, pergamino o tostado — «depende el arreglo».** De donde sale lo más
importante del diseño: **la trilla puede no ocurrir nunca**, así que no puede ser una
etapa obligatoria de la cadena.

### El reposo tiene DOS umbrales, no uno

Yo venía preguntando por «el tiempo mínimo» como si fuera un número. Son dos, y con
un número solo habría diseñado mal:

| Umbral | Qué habilita |
|---|---|
| **~30 días** | **sacar muestras** — tostar, analizar, cerrar una venta |
| **60 días mínimo** | **vender**, y sólo en el caso de MENOS reposo |

Y es **perfil por varietal y proceso**: Geisha más reposo y tueste más bajo; lavado
**60–90 días**; natural Catuaí óptimo entre **45 y 60**. Muchos lotes están meses.

**La consecuencia que me habría hecho diseñar mal:** un lote puede estar meses sin
vender **con muestras saliendo todo el tiempo**. El reposo **no bloquea la muestra,
sólo la venta**. Tratar «en reposo» como un estado cerrado —que es hacia donde yo iba—
haría imposible el trabajo normal de cerrar ventas.

### La cascarilla se composta

Y la pulpa también. Son **dos subproductos del café, los dos compostables**, y ninguno
tiene hoy dónde ir.

---

## 3. Lo que ya existe y NO se reconstruye — MEDIDO

| Pieza | Estado |
|---|---|
| `LotTransformationType` | ya tiene `stage_change`, `sample_extraction`, `loss`, `disposal`, **`sale`** y `selection` |
| Balance de masas | `lib/traceability/balance.ts`, 533 líneas, con merma declarada |
| `QuantityEvent` | el libro mayor; la muestra ya descuenta masa en la misma transacción |
| Perfiles de beneficio | `PERFIL_POR_GRADO` con `WASHED_STANDARD` y `NATURAL` — **el reposo entra por esta puerta** |
| `BiocharBatch` | **el precedente, y está ENTERO**: el lote de subproducto y su aplicación a una ubicación, que vive en `TreatmentBatch` (esquema:7307) y `applyAmendment()` (`lib/research/amendments.ts:217`), con pruebas |
| `DryingRun.endedAt` | de donde arranca el reloj del reposo |

**Ausentes, medidos:** `CompostBatch` 0 · `CascaraBatch` 0 · trilla 0 coincidencias ·
`release|liberacion` 0.

---

## 4. Sección A — El reposo

**El reloj arranca al terminar el secado con la humedad en objetivo**, no al acabar la
fermentación. `DryingRun.endedAt` ya existe; lo que falta es declarar que ese fin fue
**con objetivo alcanzado** y no un abandono.

### A.1 Perfil, no constante

El reposo se declara en el **perfil de beneficio**, junto a los umbrales que ya viven
ahí:

```
restingProfile: {
  diasParaMuestra: 30,      // habilita extraer muestra
  diasParaVenta:   60,      // habilita la venta
}
```

Por varietal y proceso, como los demás umbrales. **Todos `[PROVISIONAL]`** hasta que
Daniel los fije: hoy son rangos que da de memoria, y `P-F` sigue abierta.

### A.2 Dos compuertas distintas, y sólo una bloquea

- **Muestra**: a los 30 días el sistema **deja de advertir**. Antes de los 30 **avisa
  y deja pasar** — la extracción sigue siendo legítima, sólo que temprana, y quien la
  hace debe saberlo. Doctrina de la casa: bloquear se esquiva en el patio.
- **Venta**: antes del umbral, el sistema **avisa y deja pasar**, y lo deja explícito
  en la ficha del lote. **Decisión de Daniel, 2026-09-16: sólo avisa, no bloquea.**

  Yo había dudado aquí, y conviene decir por qué y por qué su respuesta es la
  correcta. Mi duda: vender café sin reposo es un daño comercial irreversible, no un
  dato de menos, así que parecía el caso donde sí valía la pena bloquear. Su
  respuesta lo cierra sin excepción, igual que hizo con `GREEN` en secado el día
  anterior: **la doctrina no admite excepciones por grave que parezca el caso, porque
  la puerta que se esquiva enseña a esquivar todas**.

  Y hay una razón de negocio que yo no estaba viendo: **«depende el arreglo»**. Un
  comprador puede aceptar café con menos reposo, o el lote puede venderse a un precio
  distinto por eso mismo. Bloquear una venta legítima porque el sistema cree saber
  más que quien negocia es peor que registrarla marcada.

### A.3 Lo que NO hace

No introduce un estado «en reposo» que cierre el lote. El lote sigue vivo, con
muestras saliendo. El reposo es **una edad que se calcula**, no una fase que se
declara — y por eso no hay tabla nueva para él.

### A.4 La liberación SÍ es un estado — y por qué eso no contradice a A.3

**Decisión de Daniel, 2026-09-16: un estado del lote, no una firma de persona.**

Leído deprisa, esto choca con A.3, que acaba de decir que el reposo no se declara.
No chocan porque **no hablan del mismo hecho**:

- La **edad de reposo** es una medición: sale de `DryingRun.endedAt` y del reloj. Nadie
  la declara, nadie la puede falsear, y sigue calculándose después de la liberación.
- La **liberación** es una decisión: alguien mira el lote y dice «éste puede salir».
  Eso no se puede derivar de ninguna fecha, porque depende del arreglo con el
  comprador — la misma razón por la que §A.2 decidió avisar y no bloquear.

Una medición no necesita estado; una decisión no se puede tener sin él. Por eso el
lote gana **un** campo, y no una fase.

**La liberación no apaga el aviso.** Un lote liberado a los 41 días se enseña como
liberado **y** como vendido con 41 días de reposo. Si el estado borrara la
advertencia, liberar se convertiría en la forma de callar al sistema — que es
exactamente el esquivo que §A.2 existe para evitar.

**Quién puede liberar: un permiso propio, `lot:release`.** No vale `lot:manage`, y
esto sí está medido: **`Farm Operator` ya tiene `lot:manage`** (`catalog.ts:363`), o
sea que colgar de ahí la liberación haría que cualquier operario de campo autorizara
una decisión comercial. El molde ya existe en la casa: `lot:override_balance` está
descrito como algo que «debería ser raro» y el perfil de operario lo excluye a
propósito. `lot:release` sigue ese camino — lo tiene `Farm Manager`, no `Farm
Operator`.

*Esto último es una resolución mía, no de Daniel: él eligió «estado» y no dijo quién
lo cambia. Si se equivoca, el coste es una migración de catálogo y un ajuste de
perfil — barato y reversible, que es por qué se decidió en vez de preguntar otra vez.*

---

## 5. Sección B — La trilla

### B.1 Una transformación que puede ocurrir fuera

`LotTransformationType` gana **`hulling`**. Y la transformación declara **quién la
hizo y dónde**, porque dos de las tres formas ocurren fuera del control del dueño:

| Campo | Por qué |
|---|---|
| `performedByOrganizationId` | Cafelino, Kiva Estate, o la propia organización si es a mano |
| `performedAtLocationId` | dónde ocurrió físicamente |
| `custodyOut` / `custodyIn` | cuándo salió y cuándo volvió el material |

**No es una tabla nueva**: son columnas sobre la transformación que ya existe, igual
que `dryingRunId` cuelga de ella. Un `HullingRun` paralelo duplicaría lo que
`LotTransformation` ya hace.

### B.2 El balance

Una entrada, tres salidas, y el paquete ya trae su criterio de aceptación en AT04:

```
100 kg pergamino  →  ~80 verde  +  ~18 cascarilla  +  ~2 merma documentada
```

- El **verde** es el lote resultante, con su `stage_change`.
- La **cascarilla** es **subproducto con destino**, no merma (§6).
- La **merma** es `declaredLossQuantity`, que ya existe.
- **Todo vuelve a la finca**: ninguna salida hacia terceros.

Y la regla que el paquete subraya: **una humedad desconocida no se convierte en cero**.

### B.3 Opcional por diseño

Un lote vendido en pergamino **nunca se trilla**. Así que ninguna etapa posterior
puede exigir la trilla como precondición, y el café verde tiene **un** origen posible,
no uno obligatorio.

---

## 6. Sección C — El destino de los subproductos

Sigue el molde de `BiocharBatch`, que ya resolvió esto **entero**.

> **CORRECCIÓN del 2026-09-16, y es importante porque cambia una premisa.** Este
> documento afirmó dos veces —y yo se lo dije a Daniel en voz alta— que «la
> aplicación de enmienda no existe» y que «ninguno de los 149 modelos aplica una
> enmienda a una parcela». **Era falso.** Existe `TreatmentBatch` (esquema:7307), con
> `locationId` y `biocharBatchId`, y `applyAmendment()` en
> `lib/research/amendments.ts:217` la crea, comprobando el ámbito RBAC de la
> ubicación y con pruebas en `tests/research/amendments.test.ts`.
>
> **Por qué no lo vi:** busqué modelos cuyo NOMBRE casara con
> `Amendment|Enmienda|SoilApplication` y el modelo real se llama `TreatmentBatch`. Mi
> «control positivo» fue contar los 149 modelos del archivo, que sólo demuestra que
> el archivo tiene modelos — no que mi búsqueda pudiera encontrar el concepto. Lo
> encontró Codex auditando este plan.
>
> **Lo que esto le hace a §C.1:** la decisión de parar en «salió a compost» se tomó
> con la premisa de que cerrar el círculo era caro porque faltaba el modelo entero.
> No falta. La decisión sigue siendo de Daniel, pero se tomó sobre un hecho falso y
> él lo sabe desde que se escribió esta corrección.

**`ByproductBatch`** — un lote de subproducto con su tipo (`CASCARILLA` | `PULPA`), su
masa, la transformación que lo originó, dónde se produjo y su destino
(`COMPOST` | `BIOCHAR` | `DISPOSAL` | `SALE`).

Hoy el destino es **compost** para los dos. Pero el tipo se declara porque cascarilla
y pulpa no son el mismo material y algún día uno puede ir al biochar —que ya tiene
modelo— y el otro no.

**Y cierra `F1-002` de paso**: el despulpado también producirá su lote, por el mismo
camino, sin un segundo mecanismo.

### C.1 Hasta dónde llega, y qué queda deliberadamente fuera

**Decisión de Daniel, 2026-09-16: se registra que salió a compost, y ahí termina.**

El alcance es el `ByproductBatch` con su masa y su destino. **Fuera, y no por olvido:**

- un lote de compost con código propio, que diría cuánto compost hay y de dónde salió;
- la aplicación de ese compost a una parcela, que cerraría el círculo con el cafetal.

Se descartaron porque **el balance de la trilla cierra sin ellas**: la cascarilla sale
del lote con su masa declarada, y a dónde va después no cambia ninguna cuenta. Ésa es
la razón que se sostiene.

**La otra razón que este documento daba era falsa y se retira:** decía que cerrar el
círculo obligaba a escribir el modelo de aplicación de enmienda desde cero. Existe
—`TreatmentBatch` y `applyAmendment()`, ver el recuadro de arriba—, así que conectar
un lote de compost costaría bastante menos de lo que dije. **Daniel decidió con esa
información equivocada**; la decisión sigue en pie hasta que él diga otra cosa.

**Lo que queda anotado para quien venga:** `applyAmendment()` hoy sólo acepta un lote
de biochar. El día que el compost tenga que aplicarse, lo que hace falta es ensanchar
esa función, no escribir una paralela.

---

## 7. Decisiones abiertas — de Daniel, no mías

1. ~~**La liberación autorizada: ¿firma o estado?**~~ — **cerrada el 2026-09-16: un
   estado del lote** (§A.4), con permiso propio `lot:release` porque `Farm Operator`
   ya tiene `lot:manage`.
2. ~~¿La venta temprana se bloquea o sólo se avisa?~~ — **cerrada el 2026-09-16:
   sólo avisa** (§A.2).
3. **Los umbrales**, que son `[PROVISIONAL]` mientras `P-F` siga abierta.
4. ~~**Si la cascarilla compostada vuelve a la finca como enmienda**~~ — **cerrada el
   2026-09-16: sólo se registra que salió a compost** (§C.1). El lote de compost y la
   aplicación a parcela quedan fuera, y con una nota de por qué.

---

## 8. Fuera de alcance

- La **regla del testigo** (`F3-005`): la venta aquí se habilita, pero exigir muestra
  de retención sellada es `D-F3-01`, que sigue siendo de Daniel.
- **Cropster**: documentado en cinco archivos de `docs/`, sin integración en código.
  Es su propio trabajo.
- La **catación física del café verde**, que el manual de septiembre especifica y que
  opera sobre el material que esta trilla crea. **Va después, y depende de esto.**
