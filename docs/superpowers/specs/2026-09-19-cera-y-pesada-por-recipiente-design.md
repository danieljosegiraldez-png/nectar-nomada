# La cera de la extracción y la pesada por recipiente — cadena de la miel (Q28)

**Fecha:** 2026-09-19 · **Camino:** arquitectónico

---

## 1. De dónde sale

**Q28 está decidida** en el paquete de Daniel (`docs/architecture/fuentes/paquete-q1-q49/build-packet/02-DECISION-REGISTER-Q01-Q49.md`):
*«CONFIRMED DECISION — F in Phase 1. Hive/apiary harvest → supers/containers → extraction →
settling/storage → packaging … Gross/tare/net, wax/cappings, filtration, losses, samples and
measured characterization are traceable.»*

Ya existen: la cosecha con su lote de miel, el proceso (colar, filtrar, decantar, homogenizar), el
envasado, la división y las muestras. **Faltan dos cosas de esa frase:** bruto/tara/neto, y la
cera y los opérculos.

Daniel, el 2026-09-19:

- La cera se separa **en los dos momentos**: al desopercular (en la extracción) y al colar.
- La miel se pesa **por recipiente**: cada balde o tambor lleno (bruto) y su peso vacío (tara).
- La cera va a **las cuatro**: se funde para lámina propia, se vende, se guarda, u otro uso.
- *«quiero saber que esa cera vino de tal apiario por lo menos, de tal cosecha, aunque no sepa
  cual alza o colmena … trazabilidad al lugar y tiempo aproximado o ventana de esas actividades»*.

## 2. La idea central

**La cera no es merma.** Hoy, la cera que sale al colar se anota como merma del proceso. Es el
mismo error que el café evitó con la cascarilla (`ByproductBatch`): contar un subproducto como
pérdida infla la merma y esconde la de verdad, que es el número que dice si alguien pesó mal. La
cera pasa a ser **un subproducto con su peso y su destino**, en la tabla que ya existe.

## 3. Rebanada 1 — La pesada por recipiente

Una tabla `apiary.harvest_container`: por cosecha, cada recipiente con

| campo | qué es |
|---|---|
| `apiaryHarvestEventId` | la cosecha |
| `label` | lo que distingue el recipiente: «balde 3», «tambor A». Único dentro de la cosecha |
| `grossKg` | lleno |
| `tareKg` | vacío |
| el neto | **no se guarda**: `grossKg - tareKg` |

- **CHECK:** `tare_kg >= 0`, `gross_kg > tare_kg`.
- **Si la cosecha tiene recipientes, su peso extraído ES la suma de los netos.** Anotar un
  recipiente recalcula `extractedWeightKg` por el mismo camino que ya corrige el libro del lote
  (`completarCierreDeCosecha`, que asienta la diferencia). No se puede escribir otro número a mano
  mientras haya recipientes: el formulario de peso lo dice y el servicio lo rechaza.
- **Sin recipientes, nada cambia**: se anota el neto como hoy.
- Quitar un recipiente mal anotado se permite, con motivo y su `AuditEvent`, y recalcula igual.

## 4. Rebanada 2 — La cera como subproducto

### 4.1 Lo que se añade a `ByproductBatch`

- `ByproductType` gana **`CERA`**.
- `ByproductDestination` gana **`LAMINA_PROPIA`** (se funde para lámina), **`GUARDADA`** y
  **`OTRO`**; `SALE` ya existe (se vende). Con `OTRO`, `notes` obligatoria (CHECK).
- **Dos orígenes posibles, y exactamente uno** (CHECK):
  - **un paso del lote** (`transformationId`, como hoy): la cera **al colar**;
  - **un apiario con una ventana** (`producedAtLocationId` + `windowStart` y `windowEnd`, sin
    transformación): la cera **al desopercular**.

  `transformationId` pasa a ser opcional para permitir el segundo. La ventana va con
  `windowStart <= windowEnd`, las dos o ninguna.

Los valores nuevos del enum se comparan en los CHECK como texto (`destination::text`): un valor
añadido no se puede usar en la misma transacción que lo añade.

### 4.2 La cera al colar

`procesarMiel` acepta **«cera que salió: N kg, destino»**, y la pasa como subproducto a
`recordTransformation`, que ya cuenta su masa como salida en el balance. **Deja de ir en la
merma.** Su trazabilidad es exacta: el lote de miel sabe de qué cosecha y de qué apiario viene.

### 4.3 La cera al desopercular

En la ficha del apiario, **«Cera de la extracción»**: kilos, destino y la ventana (del día en que
empezó la extracción al día en que terminó). **No se eligen colmenas ni alzas**: se desopercula junto.

Al leerla, la aplicación dice **qué cosechas de ese apiario caen en la ventana**, y lo dice como
lo que es: *«cosechas de este apiario entre el 3 y el 5 de mayo»*, no *«esta cera es de estas
colmenas»*. Es la trazabilidad a lugar y tiempo aproximado que Daniel pidió.

### 4.4 Qué se ve

- **Ficha del apiario:** la cera anotada (de la extracción y del colado de sus lotes), con
  kilos, destino, fecha o ventana, y para la de extracción las cosechas de la ventana.
- **Proceso del lote de miel:** el campo «cera que salió» junto a la merma.

## 5. Lo que NO entra

- **Enlazar la cera fundida con la «cera nueva» de su año** (ADR-173): cerraría el ciclo, pero es
  otro paso, y hoy nadie lo registra.
- **Que la cera sea un lote** (fundirla, dividirla, venderla por la tienda): Daniel eligió el
  subproducto (enfoque A).
- **Asignar la cera de extracción a colmenas concretas**: no se sabe, y no se inventa.

## 6. Pruebas, a lo que obliga esta casa

Cada regla con su prueba y su flip-test, cada CHECK con su sonda y su «lo válido entra»:

- recipiente con tara mayor que el bruto; etiqueta repetida en la misma cosecha;
- la cosecha con recipientes: su peso es la suma, y escribir otro a mano se rechaza;
- añadir y quitar un recipiente mueve el libro del lote por la diferencia, no por el total;
- la cera al colar cuenta en el balance como salida y **no** como merma;
- la cera con los dos orígenes, o con ninguno; la ventana al revés; `OTRO` sin nota;
- las cosechas de la ventana son sólo las de ese apiario y sólo las de esas fechas.

## 7. Orden

Rebanada 1 (pesada por recipiente) y rebanada 2 (cera), cada una con su rama, su PR y su ADR.
